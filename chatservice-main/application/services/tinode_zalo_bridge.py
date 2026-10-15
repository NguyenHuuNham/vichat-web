"""Tinode Zalo Bridge Service.
Bridges Zalo OA conversations with central Tinode (chatapi.gonplatform.com).
Ensures every Zalo customer conversation has a real, persisted Tinode group topic (grp...),
and publishes every incoming & outgoing message directly to Tinode so that
Tinode remains the authoritative message store and employee accounts can view full history.
Also listens for staff replies typed directly in Tinode Web/Mobile and syncs them to Zalo OA in real-time.
"""

import asyncio
import json
import logging
import time
from urllib.parse import quote

import aiohttp

from application.database import redisdb
from application.services.auth_service import (
    _tinode_bridge_headers,
    tinode_login,
)

logger = logging.getLogger(__name__)

_bridge_lock = None


def _get_bridge_lock():
    global _bridge_lock
    if _bridge_lock is None:
        _bridge_lock = asyncio.Lock()
    return _bridge_lock


async def _get_tinode_client_ws(app):
    """Connects to Tinode WebSocket as chatbot system account and returns (session, ws, token)."""
    bot_user = str(app.config.get("TINODE_CHATBOT_USERNAME") or "upgo_chatbot").strip()
    bot_pwd = str(app.config.get("TINODE_CHATBOT_PASSWORD") or "").strip()
    base_url = str(app.config.get("TINODE_INTERNAL_WS_URL") or "").rstrip("?")
    api_key = str(app.config.get("TINODE_API_KEY") or "").strip()

    if not base_url or not api_key:
        raise RuntimeError("Tinode configuration (TINODE_INTERNAL_WS_URL or TINODE_API_KEY) is missing.")

    separator = "&" if "?" in base_url else "?"
    url = f"{base_url}{separator}apikey={quote(api_key, safe='')}"

    auth = await tinode_login(bot_user, bot_pwd)
    token = auth.get("token")

    timeout = aiohttp.ClientTimeout(total=int(app.config.get("TINODE_AUTH_TIMEOUT", 10)))
    session = aiohttp.ClientSession(timeout=timeout)
    try:
        ws = await session.ws_connect(url, headers=_tinode_bridge_headers())

        # 1. Handshake
        await ws.send_json({
            "hi": {
                "id": "1",
                "ver": "0.25",
                "ua": "VICHAT-ZALO-BRIDGE",
                "platf": "server",
                "lang": "vi",
            }
        })
        hi_pkt = await asyncio.wait_for(ws.receive_json(), timeout=5.0)
        if hi_pkt.get("ctrl", {}).get("code", 500) >= 300:
            raise RuntimeError(f"Tinode handshake failed: {hi_pkt}")

        # 2. Login
        await ws.send_json({"login": {"id": "2", "scheme": "token", "secret": token}})
        login_pkt = await asyncio.wait_for(ws.receive_json(), timeout=5.0)
        if login_pkt.get("ctrl", {}).get("code", 500) >= 300:
            raise RuntimeError(f"Tinode login failed: {login_pkt}")

        return session, ws, token
    except Exception:
        await session.close()
        raise


class TinodeBridgePublisher:
    """Manages a persistent connection to Tinode for fast, real-time message publishing."""

    def __init__(self):
        self.session = None
        self.ws = None
        self.token = None
        self._lock = None
        self.subscribed_topics = set()

    def get_lock(self):
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    def _is_ws_valid(self):
        if self.ws is None or self.ws.closed:
            return False
        try:
            writer = getattr(self.ws, '_writer', None)
            if writer:
                transport = getattr(writer, 'transport', None)
                if transport and transport.is_closing():
                    return False
        except Exception:
            pass
        return True

    async def _cleanup(self):
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass
            self.ws = None
        if self.session:
            try:
                await self.session.close()
            except Exception:
                pass
            self.session = None
        self.subscribed_topics.clear()

    async def _ensure_connected(self, app):
        if self._is_ws_valid():
            return self.ws
        await self._cleanup()
        self.session, self.ws, self.token = await _get_tinode_client_ws(app)
        self.subscribed_topics.clear()
        return self.ws

    async def publish(self, app, topic: str, content: str) -> bool:
        if not topic or not str(topic).startswith("grp") or not content:
            return False

        async with self.get_lock():
            for attempt in range(2):
                try:
                    ws = await self._ensure_connected(app)
                    # Subscribe once per persistent connection
                    if topic not in self.subscribed_topics:
                        sub_id = f"sub_{int(time.time()*1000)}"
                        await ws.send_json({"sub": {"id": sub_id, "topic": topic}})
                        for _ in range(5):
                            p = await asyncio.wait_for(ws.receive_json(), timeout=3.0)
                            if p.get("ctrl") and p["ctrl"].get("id") == sub_id:
                                break
                        self.subscribed_topics.add(topic)

                    req_id = f"pub_{int(time.time()*1000)}"
                    await ws.send_json({"pub": {"id": req_id, "topic": topic, "content": content}})
                    for _ in range(5):
                        pkt = await asyncio.wait_for(ws.receive_json(), timeout=3.0)
                        ctrl = pkt.get("ctrl") or {}
                        if ctrl.get("id") == req_id:
                            seq = (ctrl.get("params") or {}).get("seq")
                            logger.info("Persisted message to Tinode topic %s (seq=%s)", topic, seq)
                            return True
                    return True
                except Exception as exc:
                    logger.warning("Tinode publish attempt %d failed for topic %s: %s", attempt, topic, exc)
                    await self._cleanup()
                    if attempt == 1:
                        logger.error("Failed to publish message to Tinode topic %s: %s", topic, exc)
                        return False
            return False


_tinode_publisher = TinodeBridgePublisher()


async def get_or_create_zalo_tinode_topic(
    app,
    oa_id: str,
    sender_id: str,
    customer_name: str = "Khách Zalo",
    tenant_id: str = "gonstack",
) -> str:
    """Retrieves existing Tinode topic for this Zalo conversation or creates a new one on Tinode."""
    if not sender_id:
        return ""

    cid = f"zalo:{oa_id or 'default'}:{sender_id}"
    cache_key = f"zalo:tinode_topic:{cid}"

    # 1. Check Redis cache first
    if redisdb is not None:
        try:
            cached_topic = redisdb.get(cache_key)
            if cached_topic:
                topic_str = (
                    cached_topic.decode("utf-8") if isinstance(cached_topic, bytes) else str(cached_topic)
                ).strip()
                if topic_str.startswith("grp"):
                    return topic_str
        except Exception as exc:
            logger.warning("Error reading Tinode topic from Redis: %s", exc)

    # 2. Acquire lock to avoid double creation
    async with _get_bridge_lock():
        if redisdb is not None:
            try:
                cached_topic = redisdb.get(cache_key)
                if cached_topic:
                    topic_str = (
                        cached_topic.decode("utf-8") if isinstance(cached_topic, bytes) else str(cached_topic)
                    ).strip()
                    if topic_str.startswith("grp"):
                        return topic_str
            except Exception:
                pass

        session = None
        ws = None
        try:
            session, ws, token = await _get_tinode_client_ws(app)
            display_name = f"[Zalo] {customer_name or 'Khách Zalo'}"

            # Create group topic with defacs allowing authenticated tenant users to join & read
            create_req = {
                "sub": {
                    "id": "create_zalo_grp",
                    "topic": "new",
                    "set": {
                        "desc": {
                            "public": {
                                "fn": display_name,
                                "channel": "zalo_oa",
                                "oa_id": str(oa_id or ""),
                                "sender_id": str(sender_id or ""),
                                "tenant_id": str(tenant_id or ""),
                            },
                            "defacs": {
                                "auth": "JRWPA",
                                "anon": "N",
                            },
                        }
                    },
                }
            }
            await ws.send_json(create_req)

            topic = None
            for _ in range(10):
                pkt = await asyncio.wait_for(ws.receive_json(), timeout=5.0)
                ctrl = pkt.get("ctrl") or {}
                if ctrl.get("id") == "create_zalo_grp" and ctrl.get("topic"):
                    topic_candidate = str(ctrl.get("topic")).strip()
                    if topic_candidate.startswith("grp"):
                        topic = topic_candidate
                        break

            if not topic:
                raise RuntimeError("Tinode failed to return group topic for new conversation.")

            logger.info("Created new Tinode topic %s for Zalo conversation %s", topic, cid)

            # 3. Cache topic in Redis and update conversation metadata
            if redisdb is not None:
                try:
                    redisdb.setex(cache_key, 86400 * 365, topic)
                    redisdb.setex(f"zalo:tinode_meta:{topic}", 86400 * 365, json.dumps({
                        "oa_id": str(oa_id or ""),
                        "sender_id": str(sender_id or ""),
                        "tenant_id": str(tenant_id or ""),
                        "cid": cid,
                    }))
                    raw_conv = redisdb.get(f"zalo:conversation:{cid}")
                    if raw_conv:
                        conv_obj = json.loads(
                            raw_conv.decode("utf-8") if isinstance(raw_conv, bytes) else raw_conv
                        )
                        conv_obj["tinode_topic"] = topic
                        conv_obj["tinodeTopic"] = topic
                        redisdb.setex(f"zalo:conversation:{cid}", 86400 * 30, json.dumps(conv_obj))
                except Exception as exc:
                    logger.warning("Error saving Tinode topic to Redis: %s", exc)

            # 4. Asynchronously backfill past messages if any exist
            asyncio.create_task(_backfill_existing_messages(app, topic, cid))

            # 5. Automatically subscribe all tenant staff to the new topic so it appears in Tinode contact lists
            asyncio.create_task(_subscribe_staff_to_tinode_topic(topic, tenant_id))

            return topic
        except Exception as exc:
            logger.error("Failed to get_or_create_zalo_tinode_topic for %s: %s", cid, exc)
            return ""
        finally:
            if ws:
                try:
                    await ws.close()
                except Exception:
                    pass
            if session:
                try:
                    await session.close()
                except Exception:
                    pass


async def _backfill_existing_messages(app, topic: str, cid: str):
    """Backfills ALL past messages from Redis into the newly created Tinode topic."""
    if not topic or not cid or redisdb is None:
        return
    try:
        raw_list = redisdb.lrange(f"zalo:messages:{cid}", 0, -1) or []
        if not raw_list:
            return

        session, ws, token = await _get_tinode_client_ws(app)
        try:
            # Subscribe to topic
            await ws.send_json({"sub": {"id": "sub_backfill", "topic": topic}})
            for _ in range(5):
                pkt = await asyncio.wait_for(ws.receive_json(), timeout=4.0)
                if pkt.get("ctrl") and pkt["ctrl"].get("id") == "sub_backfill":
                    break

            for idx, item in enumerate(raw_list):
                msg_dict = json.loads(item.decode("utf-8") if isinstance(item, bytes) else item)
                text = str(msg_dict.get("text") or "").strip()
                if not text:
                    img = msg_dict.get("image")
                    if img:
                        text = f"[Hình ảnh: {img}]"
                    elif msg_dict.get("file"):
                        text = f"[Tệp đính kèm: {(msg_dict.get('file') or {}).get('name') or 'file'}]"
                if not text:
                    continue

                sender = msg_dict.get("sender")
                is_bot = bool(msg_dict.get("isBot") or msg_dict.get("is_bot") or sender == "bot")
                is_agent = bool(sender == "outgoing" and not is_bot)
                sender_name = msg_dict.get("senderName") or msg_dict.get("sender_name") or ("Nhân viên CSKH" if is_agent else "Khách Zalo")

                if is_bot:
                    content = f"🤖 [Bot AI]: {text}"
                elif is_agent:
                    content = f"👩‍💼 [{sender_name}]: {text}"
                else:
                    content = f"👤 [{sender_name}]: {text}"

                req_id = f"bf_{idx}_{int(time.time()*1000)}"
                await ws.send_json({"pub": {"id": req_id, "topic": topic, "content": content}})
                for _ in range(3):
                    p = await asyncio.wait_for(ws.receive_json(), timeout=2.0)
                    if p.get("ctrl") and p["ctrl"].get("id") == req_id:
                        break
        finally:
            await ws.close()
            await session.close()
    except Exception as exc:
        logger.debug("Backfilling messages to Tinode topic %s skipped or failed: %s", topic, exc)


async def publish_zalo_message_to_tinode(
    app,
    topic: str,
    text: str,
    sender_name: str = "Khách Zalo",
    is_bot: bool = False,
    is_agent: bool = False,
) -> bool:
    """Publishes a chat message to the Tinode group topic so it is permanently stored in Tinode DB."""
    if not topic or not str(topic).startswith("grp") or not text:
        return False

    text_clean = str(text).strip()
    if is_bot:
        content = f"🤖 [Bot AI]: {text_clean}"
    elif is_agent:
        content = f"👩‍💼 [{sender_name}]: {text_clean}"
    else:
        content = f"👤 [{sender_name}]: {text_clean}"

    return await _tinode_publisher.publish(app, topic, content)


def safe_async_publish_to_tinode(app, topic: str, text: str, sender_name="Khách Zalo", is_bot=False, is_agent=False):
    """Fire-and-forget publisher to avoid blocking webhook or API execution."""
    if not topic or not text:
        return
    asyncio.create_task(publish_zalo_message_to_tinode(
        app,
        topic=topic,
        text=text,
        sender_name=sender_name,
        is_bot=is_bot,
        is_agent=is_agent,
    ))


def _sync_subscribe_staff_to_topic(topic: str, tenant_id: str):
    """Subscribes all tenant staff to the newly created Tinode group topic in tinode-postgres."""
    if not topic or not str(topic).startswith("grp"):
        return
    try:
        import psycopg2
        dsn = "postgresql://postgres:a5247b5fecfa38212ac08c0d0ea14d1928be9a571a81d5299c74d13cb901f452@tinode-postgres:5432/tinode?sslmode=disable"
        conn = psycopg2.connect(dsn)
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO subscriptions (createdat, updatedat, userid, topic, delid, recvseqid, readseqid, modewant, modegiven)
            SELECT NOW(), NOW(), a.userid, %s, 0, t.seqid, t.seqid, 'JRWPAS', 'JRWPAS'
            FROM topics t
            CROSS JOIN (
                SELECT DISTINCT userid FROM auth WHERE SUBSTRING(uname, 1, 11) = 'basic:upgo_' AND uname != 'basic:upgo_chatbot'
            ) a
            WHERE t.name = %s
            ON CONFLICT (topic, userid) DO UPDATE
            SET modewant = 'JRWPAS', modegiven = 'JRWPAS';
        """, (topic, topic))
        cur.execute("""
            UPDATE topics
            SET subcnt = (SELECT count(*) FROM subscriptions WHERE topic = %s AND deletedat IS NULL)
            WHERE name = %s;
        """, (topic, topic))
        conn.commit()
        conn.close()
        logger.info("Auto-subscribed staff to Tinode topic %s", topic)
    except Exception as exc:
        logger.warning("Failed to auto-subscribe staff to Tinode topic %s: %s", topic, exc)


async def _subscribe_staff_to_tinode_topic(topic: str, tenant_id: str):
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _sync_subscribe_staff_to_topic, topic, tenant_id)
    except Exception as exc:
        logger.warning("Background staff subscription task failed for %s: %s", topic, exc)


def extract_clean_tinode_text(content) -> str:
    """Extracts human-readable text from Tinode message content (JSON string or Drafty)."""
    if not content:
        return ""
    if isinstance(content, str):
        try:
            parsed = json.loads(content)
            if isinstance(parsed, (dict, str)):
                content = parsed
        except Exception:
            pass
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, dict):
        return str(content.get("txt") or "").strip()
    return ""


def _handle_tinode_staff_reply_sync(app, payload: dict):
    """Processes staff replies sent from Tinode Web/Mobile and syncs them to Zalo OA and ViChat."""
    topic = str(payload.get("topic") or "").strip()
    from_user = payload.get("from")
    raw_content = payload.get("content")
    msg_id = payload.get("id")

    if not topic.startswith("grp") or not from_user:
        return

    # Distributed deduplication check via Redis
    if redisdb is not None and msg_id:
        dedupe_key = f"tinode:staff_dedupe:{msg_id}"
        try:
            if not redisdb.set(dedupe_key, "1", ex=60, nx=True):
                return
        except Exception:
            pass

    text = extract_clean_tinode_text(raw_content)
    if not text:
        return

    # Ignore messages that were already prefixed (bridged messages from Bot, customer, or CS)
    if text.startswith("🤖 [Bot AI]:") or text.startswith("👤 [") or text.startswith("👩‍💼 ["):
        return

    oa_id = ""
    sender_id = ""
    tenant_id = "gonstack"
    cid = ""

    # 1. Lookup topic metadata in Redis
    if redisdb is not None:
        try:
            cached_meta = redisdb.get(f"zalo:tinode_meta:{topic}")
            if cached_meta:
                meta = json.loads(cached_meta.decode("utf-8") if isinstance(cached_meta, bytes) else cached_meta)
                oa_id = meta.get("oa_id")
                sender_id = meta.get("sender_id")
                tenant_id = meta.get("tenant_id") or "gonstack"
                cid = meta.get("cid")
        except Exception:
            pass

    # 2. If not found in Redis, check Postgres topics table
    if not oa_id or not sender_id:
        try:
            import psycopg2
            dsn = "postgresql://postgres:a5247b5fecfa38212ac08c0d0ea14d1928be9a571a81d5299c74d13cb901f452@tinode-postgres:5432/tinode?sslmode=disable"
            conn = psycopg2.connect(dsn)
            cur = conn.cursor()
            cur.execute("SELECT public FROM topics WHERE name = %s;", (topic,))
            row = cur.fetchone()
            if row and row[0]:
                pub = row[0] if isinstance(row[0], dict) else json.loads(row[0])
                if pub.get("channel") == "zalo_oa":
                    oa_id = str(pub.get("oa_id") or "")
                    sender_id = str(pub.get("sender_id") or "")
                    tenant_id = str(pub.get("tenant_id") or "gonstack")
                    cid = f"zalo:{oa_id}:{sender_id}"
            conn.close()
        except Exception as exc:
            logger.warning("Error querying topic metadata for %s: %s", topic, exc)

    if not oa_id or not sender_id:
        return

    if not cid:
        cid = f"zalo:{oa_id}:{sender_id}"

    # 3. Lookup employee name from users table
    staff_name = "Nhân viên CSKH"
    try:
        import psycopg2
        dsn = "postgresql://postgres:a5247b5fecfa38212ac08c0d0ea14d1928be9a571a81d5299c74d13cb901f452@tinode-postgres:5432/tinode?sslmode=disable"
        conn = psycopg2.connect(dsn)
        cur = conn.cursor()
        cur.execute("SELECT public->>'fn' FROM users WHERE id = %s;", (from_user,))
        u_row = cur.fetchone()
        if u_row and u_row[0]:
            staff_name = str(u_row[0]).strip()
        conn.close()
    except Exception:
        pass

    logger.info("Handling Tinode staff reply from %s (%s) for Zalo %s: %s", staff_name, from_user, cid, text[:50])

    # 4. Deliver CS message to Zalo OA customer
    try:
        from application.services import ZaloService
        z_svc = ZaloService(app)
        loop = asyncio.new_event_loop()
        send_res = loop.run_until_complete(z_svc.send_cs_message(
            user_id=sender_id,
            message_text=text,
            oa_id=oa_id,
        ))
        loop.close()
        logger.info("Sent Tinode reply to Zalo customer %s: success=%s", sender_id, send_res.get("success"))
    except Exception as z_exc:
        logger.error("Failed to forward Tinode staff reply to Zalo: %s", z_exc)

    # 5. Persist to Redis conversation history
    oa_msg = {
        "id": f"tinode_staff_{msg_id or int(time.time()*1000)}",
        "type": "text",
        "sender": "outgoing",
        "senderId": str(from_user),
        "senderName": staff_name,
        "text": text,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "timestamp": time.time(),
        "channel": "zalo_oa",
    }
    if redisdb is not None:
        try:
            from application.controllers.api_zalo import _append_zalo_message, _set_takeover_active, _set_handover_pending
            _append_zalo_message(cid, oa_msg)
            _set_takeover_active(oa_id, sender_id, active=True, ttl=1800)
            _set_handover_pending(oa_id, sender_id, active=False)

            raw_conv = redisdb.get(f"zalo:conversation:{cid}")
            conv_data = json.loads(raw_conv.decode("utf-8") if isinstance(raw_conv, bytes) else raw_conv) if raw_conv else {}
            conv_data.update({
                "id": cid,
                "channel": "zalo_oa",
                "channelType": "zalo_oa",
                "last_message": text,
                "status": "agent_handling",
                "needs_human": False,
                "updated_at": time.time(),
                "tinode_topic": topic,
                "tinodeTopic": topic,
            })
            redisdb.setex(f"zalo:conversation:{cid}", 86400 * 30, json.dumps(conv_data))
            redisdb.sadd(f"zalo:conversations:index:{tenant_id}", cid)
            redisdb.sadd("zalo:conversations:index", cid)

            # 6. Publish to ViChat omnichannel event stream
            sync_payload = {
                "event": "agent_message",
                "channel": "zalo_oa",
                "oa_id": oa_id,
                "tenant_id": tenant_id,
                "conversation_id": cid,
                "tinode_topic": topic,
                "tinodeTopic": topic,
                "sender_id": sender_id,
                "agent_name": staff_name,
                "message": text,
                "status": "agent_handling",
                "timestamp": time.time(),
            }
            redisdb.publish("vichat:omnichannel:events", json.dumps(sync_payload))
        except Exception as sync_exc:
            logger.warning("Error syncing Tinode staff reply to Redis: %s", sync_exc)


def _listen_tinode_staff_replies(app):
    """Background listener that uses PostgreSQL LISTEN/NOTIFY to detect staff replies in Tinode."""
    import psycopg2
    import select
    dsn = "postgresql://postgres:a5247b5fecfa38212ac08c0d0ea14d1928be9a571a81d5299c74d13cb901f452@tinode-postgres:5432/tinode?sslmode=disable"
    while True:
        try:
            conn = psycopg2.connect(dsn)
            conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
            cur = conn.cursor()
            cur.execute("LISTEN tinode_staff_reply;")
            logger.info("Subscribed to PostgreSQL 'tinode_staff_reply' notifications.")
            while True:
                if select.select([conn], [], [], 5) == ([], [], []):
                    continue
                conn.poll()
                while conn.notifies:
                    notify = conn.notifies.pop(0)
                    try:
                        payload = json.loads(notify.payload)
                        _handle_tinode_staff_reply_sync(app, payload)
                    except Exception as p_err:
                        logger.warning("Error handling tinode_staff_reply notification: %s", p_err)
        except Exception as exc:
            logger.warning("Tinode staff reply listener connection dropped, reconnecting in 5s: %s", exc)
            time.sleep(5)


_listener_thread = None


def start_tinode_staff_reply_listener(app):
    """Starts the background thread to listen for staff replies from Tinode."""
    global _listener_thread
    if _listener_thread is not None and _listener_thread.is_alive():
        return
    import threading
    _listener_thread = threading.Thread(
        target=_listen_tinode_staff_replies,
        args=(app,),
        daemon=True,
        name="tinode_staff_reply_listener",
    )
    _listener_thread.start()
    logger.info("Started background Tinode staff reply listener thread.")
