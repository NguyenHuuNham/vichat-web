"""Tinode Zalo Bridge Service.
Bridges Zalo OA conversations with central Tinode (chatapi.gonplatform.com).
Ensures every Zalo customer conversation has a real, persisted Tinode group topic (grp...),
and publishes every incoming & outgoing message directly to Tinode so that
Tinode remains the authoritative message store and employee accounts can view full history.
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
    """Backfills up to 20 past messages from Redis into the newly created Tinode topic."""
    if not topic or not cid or redisdb is None:
        return
    try:
        raw_list = redisdb.lrange(f"zalo:messages:{cid}", -20, -1) or []
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
                    continue
                sender = msg_dict.get("sender")
                is_bot = bool(msg_dict.get("isBot") or msg_dict.get("is_bot") or sender == "bot")
                is_agent = bool(sender == "outgoing" and not is_bot)
                sender_name = msg_dict.get("senderName") or ("Nhân viên CSKH" if is_agent else "Khách Zalo")

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

    session = None
    ws = None
    try:
        session, ws, token = await _get_tinode_client_ws(app)

        # 1. Subscribe to topic
        await ws.send_json({"sub": {"id": "sub_pub", "topic": topic}})
        for _ in range(5):
            pkt = await asyncio.wait_for(ws.receive_json(), timeout=4.0)
            if pkt.get("ctrl") and pkt["ctrl"].get("id") == "sub_pub":
                break

        # 2. Publish
        req_id = f"pub_{int(time.time()*1000)}"
        await ws.send_json({
            "pub": {
                "id": req_id,
                "topic": topic,
                "content": content,
            }
        })
        for _ in range(5):
            pkt = await asyncio.wait_for(ws.receive_json(), timeout=4.0)
            ctrl = pkt.get("ctrl") or {}
            if ctrl.get("id") == req_id:
                seq = (ctrl.get("params") or {}).get("seq")
                logger.info("Persisted Zalo message to Tinode topic %s (seq=%s)", topic, seq)
                return True

        return True
    except Exception as exc:
        logger.error("Failed to publish Zalo message to Tinode topic %s: %s", topic, exc)
        return False
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
