"""Tinode-backed chatbot worker.

The worker owns one Tinode bot account. It receives direct Tinode messages,
passes them to the tenant-aware Chatmgt webhook, then publishes the reply back
to the same Tinode topic. Normal employee and group topics are not inspected.
"""

import asyncio
import base64
import itertools
import json
import logging
import os

import aiohttp
from aiohttp import web

from tinode_chatbot_protocol import (
    CursorStore,
    tinode_contact_topics,
    tinode_message_text,
    tinode_message_mentions_bot,
    tinode_strip_bot_mention,
    tinode_websocket_url,
)


LOGGER = logging.getLogger("tinode-chatbot-webhook")
LISTEN_HOST = str(os.getenv("TINODE_CHATBOT_HOST", "0.0.0.0"))
LISTEN_PORT = int(os.getenv("TINODE_CHATBOT_PORT", "8096"))
RECONNECT_DELAY = max(1, int(os.getenv("TINODE_CHATBOT_RECONNECT_DELAY", "5")))
SPECIAL_MESSAGE_PREFIXES = (
    "__VICHAT_SYSTEM_EVENT__:",
    "__SONGHONG_FRIEND_EVENT__:",
    "__VICHAT_REACTION_EVENT__:",
    "__VICHAT_RECALL_EVENT__:",
)
CONFIG = {
    "TINODE_INTERNAL_WS_URL": str(os.getenv("TINODE_INTERNAL_WS_URL", "")),
    "TINODE_API_KEY": str(os.getenv("TINODE_API_KEY", "")),
    "TINODE_AUTH_TIMEOUT": int(os.getenv("TINODE_AUTH_TIMEOUT", "10")),
    "TINODE_BRIDGE_INTERNAL_KEY": str(os.getenv("TINODE_BRIDGE_INTERNAL_KEY", "")),
    "TINODE_CHATBOT_ENABLED": str(os.getenv("TINODE_CHATBOT_ENABLED", "false")).lower()
    in ("1", "true", "yes", "on"),
    "TINODE_CHATBOT_USERNAME": str(os.getenv("TINODE_CHATBOT_USERNAME", "upgo_chatbot")),
    "TINODE_CHATBOT_PASSWORD": str(os.getenv("TINODE_CHATBOT_PASSWORD", "")),
    "TINODE_CHATBOT_WEBHOOK_KEY": str(os.getenv("TINODE_CHATBOT_WEBHOOK_KEY", "")),
    "TINODE_CHATBOT_WEBHOOK_URL": str(
        os.getenv(
            "TINODE_CHATBOT_WEBHOOK_URL",
            "http://chatmgt:8093/api/v1/chatbot/tinode-webhook",
        )
    ),
    "TINODE_CHATBOT_WEBHOOK_TIMEOUT": int(
        os.getenv("TINODE_CHATBOT_WEBHOOK_TIMEOUT", "40")
    ),
    "TINODE_CHATBOT_HISTORY_LIMIT": int(os.getenv("TINODE_CHATBOT_HISTORY_LIMIT", "100")),
    "TINODE_CHATBOT_STATE_FILE": str(
        os.getenv("TINODE_CHATBOT_STATE_FILE", "/var/lib/vichat-chatbot/state.json")
    ),
    "TINODE_CHATBOT_FAILURE_REPLY": str(
        os.getenv(
            "TINODE_CHATBOT_FAILURE_REPLY",
            "ViChat AI dang tam thoi khong phan hoi. Vui long thu lai sau.",
        )
    ),
}
_auth_cache = None
_auth_lock = None


class TinodeBotAuthError(Exception):
    def __init__(self, message, status_code=502):
        super().__init__(message)
        self.status_code = status_code


def _bridge_headers():
    key = CONFIG["TINODE_BRIDGE_INTERNAL_KEY"].strip()
    return {"X-Vichat-Tinode-Internal": key} if key else {}


def _auth_lock_for_current_loop():
    global _auth_lock
    if _auth_lock is None:
        _auth_lock = asyncio.Lock()
    return _auth_lock


def _chatbot_enabled():
    return bool(
        CONFIG["TINODE_CHATBOT_ENABLED"]
        and CONFIG["TINODE_INTERNAL_WS_URL"].strip()
        and CONFIG["TINODE_API_KEY"].strip()
        and CONFIG["TINODE_CHATBOT_USERNAME"].strip()
        and CONFIG["TINODE_CHATBOT_PASSWORD"]
        and CONFIG["TINODE_CHATBOT_WEBHOOK_KEY"].strip()
    )


async def _auth_ctrl(packet):
    url = tinode_websocket_url(
        CONFIG["TINODE_INTERNAL_WS_URL"],
        CONFIG["TINODE_API_KEY"],
    )
    timeout = aiohttp.ClientTimeout(total=max(5, CONFIG["TINODE_AUTH_TIMEOUT"]))
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.ws_connect(url, headers=_bridge_headers()) as socket:
            await socket.send_json({
                "hi": {
                    "id": "1",
                    "ver": "0.25",
                    "ua": "VICHAT-TINODE-CHATBOT/1.0",
                    "platf": "server",
                    "lang": "vi",
                },
            })
            hello = (await socket.receive_json()).get("ctrl") or {}
            if int(hello.get("code") or 500) >= 300:
                raise TinodeBotAuthError("Tinode chatbot handshake failed.")
            await socket.send_json(packet)
            return (await socket.receive_json()).get("ctrl") or {}


async def _login_chatbot(username, password):
    secret = base64.b64encode(
        "{}:{}".format(username, password).encode("utf-8")
    ).decode("ascii")
    ctrl = await _auth_ctrl({
        "login": {"id": "2", "scheme": "basic", "secret": secret},
    })
    if int(ctrl.get("code") or 500) >= 300 or not (ctrl.get("params") or {}).get("token"):
        raise TinodeBotAuthError("Tinode rejected the chatbot credentials.", 401)
    return ctrl.get("params") or {}


async def _create_chatbot(username, password):
    secret = base64.b64encode(
        "{}:{}".format(username, password).encode("utf-8")
    ).decode("ascii")
    ctrl = await _auth_ctrl({
        "acc": {
            "id": "2",
            "user": "new",
            "scheme": "basic",
            "secret": secret,
            "login": True,
            "desc": {"public": {"fn": "ViChat AI"}},
            "tags": [username],
        },
    })
    code = int(ctrl.get("code") or 500)
    if code >= 300:
        raise TinodeBotAuthError(
            ctrl.get("text") or "Tinode chatbot account creation failed.",
            409 if code == 409 else (400 if code < 500 else 502),
        )
    return ctrl.get("params") or {}


async def ensure_tinode_chatbot_auth(force=False):
    global _auth_cache
    if not _chatbot_enabled():
        raise TinodeBotAuthError("Tinode chatbot worker is not configured.", 503)
    if _auth_cache is not None and not force:
        return dict(_auth_cache)
    async with _auth_lock_for_current_loop():
        if _auth_cache is not None and not force:
            return dict(_auth_cache)
        username = CONFIG["TINODE_CHATBOT_USERNAME"].strip()
        password = CONFIG["TINODE_CHATBOT_PASSWORD"]
        try:
            params = await _login_chatbot(username, password)
        except TinodeBotAuthError as login_error:
            if login_error.status_code != 401:
                raise
            try:
                params = await _create_chatbot(username, password)
            except TinodeBotAuthError as create_error:
                if create_error.status_code != 409:
                    raise
                params = await _login_chatbot(username, password)
        uid = str(params.get("user") or "").strip()
        token = str(params.get("token") or "").strip()
        if not uid or not token:
            raise TinodeBotAuthError("Tinode chatbot authentication returned no UID/token.")
        _auth_cache = {"uid": uid, "token": token, "expires": params.get("expires")}
        return dict(_auth_cache)

class TinodeChatbotWorker(object):
    def __init__(self):
        self.ws_url = tinode_websocket_url(
            CONFIG["TINODE_INTERNAL_WS_URL"],
            CONFIG["TINODE_API_KEY"],
        )
        self.webhook_url = CONFIG["TINODE_CHATBOT_WEBHOOK_URL"].strip()
        self.webhook_key = CONFIG["TINODE_CHATBOT_WEBHOOK_KEY"].strip()
        self.webhook_timeout = max(
            5, CONFIG["TINODE_CHATBOT_WEBHOOK_TIMEOUT"]
        )
        self.history_limit = max(1, CONFIG["TINODE_CHATBOT_HISTORY_LIMIT"])
        self.failure_reply = CONFIG["TINODE_CHATBOT_FAILURE_REPLY"]
        self.cursor = CursorStore(CONFIG["TINODE_CHATBOT_STATE_FILE"])
        self.connected = False
        self.bot_uid = ""
        self.last_error = ""
        self.websocket = None
        self.http = None
        self.request_ids = itertools.count(10)
        self.send_lock = asyncio.Lock()
        self.topic_locks = {}
        self.group_context = {}
        self.subscribed_topics = set()
        self.pending_ctrl = {}
        self.message_tasks = set()

    def _request_id(self, prefix):
        return "{}{}".format(prefix, next(self.request_ids))

    async def _send(self, packet):
        async with self.send_lock:
            await self.websocket.send_json(packet)

    async def _receive_ctrl(self, request_id):
        for _attempt in range(60):
            packet = await self.websocket.receive_json()
            ctrl = packet.get("ctrl") or {}
            if str(ctrl.get("id") or "") != str(request_id):
                continue
            if int(ctrl.get("code") or 500) >= 300:
                raise RuntimeError(ctrl.get("text") or "Tinode rejected the request.")
            return ctrl
        raise RuntimeError("Tinode did not confirm the request.")

    async def _publish(self, topic, reply, source_sequence, metadata=None):
        request_id = self._request_id("pub")
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self.pending_ctrl[request_id] = future
        chatbot_metadata = metadata if isinstance(metadata, dict) else {}
        compact_sources = []
        for source in (chatbot_metadata.get("sources") or [])[:5]:
            if not isinstance(source, dict):
                continue
            compact_sources.append({
                "title": str(source.get("title") or source.get("file_name") or "Tài liệu")[:180],
                "file_name": str(source.get("file_name") or "")[:180],
                "snippet": " ".join(str(source.get("snippet") or "").split())[:420],
                "score": source.get("score"),
            })
        await self._send({
            "pub": {
                "id": request_id,
                "topic": topic,
                "noecho": True,
                "head": {
                    "x-vichat-chatbot": "1",
                    "x-vichat-chatbot-source-seq": str(source_sequence),
                    "x-vichat-chatbot-grounded": "1" if chatbot_metadata.get("grounded") else "0",
                    "x-vichat-chatbot-sources": json.dumps(
                        compact_sources,
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                },
                "content": reply,
            },
        })
        try:
            ctrl = await asyncio.wait_for(future, timeout=15)
            if int(ctrl.get("code") or 500) >= 300:
                raise RuntimeError(ctrl.get("text") or "Tinode rejected chatbot reply.")
        finally:
            self.pending_ctrl.pop(request_id, None)

    async def _subscribe_topic(self, topic):
        topic = str(topic or "").strip()
        if not (topic.startswith("usr") or topic.startswith("grp")) or topic == self.bot_uid or topic in self.subscribed_topics:
            return
        self.subscribed_topics.add(topic)
        request_id = self._request_id("sub")
        await self._send({
            "sub": {
                "id": request_id,
                "topic": topic,
                "get": {
                    "what": "desc data",
                    "data": {
                        "since": self.cursor.get(topic) + 1,
                        "limit": self.history_limit,
                    },
                },
            },
        })

    async def _webhook_reply(self, packet, message, history=None):
        data = packet.get("data") or {}
        topic = str(data.get("topic") or "")
        is_group = topic.startswith("grp")
        async with self.http.post(
            self.webhook_url,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Vichat-Chatbot-Webhook": self.webhook_key,
                "User-Agent": "VICHAT-TINODE-CHATBOT/1.0",
            },
            json={
                "topic": topic,
                "seq": int(data.get("seq") or 0),
                "sender_uid": str(data.get("from") or ""),
                "message": message,
                "created_at": data.get("ts"),
                "bot_mentioned": not is_group or tinode_message_mentions_bot(
                    tinode_message_text(data.get("content")),
                    data.get("head") or {},
                    self.bot_uid,
                ),
                **({"history": history[-20:]} if is_group and history else {}),
            },
            timeout=aiohttp.ClientTimeout(total=self.webhook_timeout),
        ) as response:
            try:
                payload = await response.json(content_type=None)
            except (aiohttp.ContentTypeError, ValueError):
                payload = {}
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(
                    str(payload.get("error_message") or "Chatmgt chatbot webhook failed.")
                )
            reply = str(payload.get("reply") or "").strip()
            if not reply:
                raise RuntimeError("Chatmgt chatbot webhook returned no reply.")
            return {
                "reply": reply,
                "grounded": bool(payload.get("grounded")),
                "sources": payload.get("sources") if isinstance(payload.get("sources"), list) else [],
            }

    async def _process_message(self, packet):
        data = packet.get("data") or {}
        topic = str(data.get("topic") or "").strip()
        sender_uid = str(data.get("from") or "").strip()
        sequence = int(data.get("seq") or 0)
        if not topic or sequence <= 0:
            return
        lock = self.topic_locks.setdefault(topic, asyncio.Lock())
        async with lock:
            if sequence <= self.cursor.get(topic):
                return
            raw_message = tinode_message_text(data.get("content"))
            is_group = topic.startswith("grp")
            mentioned = tinode_message_mentions_bot(raw_message, data.get("head") or {}, self.bot_uid)
            message = tinode_strip_bot_mention(raw_message) if is_group else raw_message
            if is_group and sender_uid != self.bot_uid and raw_message and not raw_message.startswith(SPECIAL_MESSAGE_PREFIXES):
                context = self.group_context.setdefault(topic, [])
                context.append({"role": "user", "content": message[:4000]})
                del context[:-20]
            if sender_uid == self.bot_uid or not message or message.startswith(SPECIAL_MESSAGE_PREFIXES) or (is_group and not mentioned):
                self.cursor.advance(topic, sequence)
                return
            try:
                response = await self._webhook_reply(
                    packet,
                    message,
                    self.group_context.get(topic, [])[:-1] if is_group else None,
                )
            except Exception as error:
                LOGGER.warning("Chatbot provider failed for %s:%s: %s", topic, sequence, error)
                self.last_error = str(error)[:500]
                response = {"reply": self.failure_reply, "grounded": False, "sources": []}
            await self._publish(topic, response["reply"], sequence, response)
            if is_group:
                context = self.group_context.setdefault(topic, [])
                context.append({"role": "assistant", "content": response["reply"][:4000]})
                del context[:-20]
            self.cursor.advance(topic, sequence)

    def _track_message(self, packet):
        task = asyncio.create_task(self._process_message(packet))
        self.message_tasks.add(task)
        task.add_done_callback(self.message_tasks.discard)

    async def _handle_packet(self, packet):
        ctrl = packet.get("ctrl") or {}
        request_id = str(ctrl.get("id") or "")
        future = self.pending_ctrl.get(request_id)
        if future is not None and not future.done():
            future.set_result(ctrl)
            return

        meta = packet.get("meta") or {}
        if str(meta.get("topic") or "") == "me":
            for topic in tinode_contact_topics(meta, include_groups=True):
                asyncio.create_task(self._subscribe_topic(topic))
            return

        presence = packet.get("pres") or {}
        presence_source = str(presence.get("src") or "").strip()
        if (
            (presence_source.startswith("usr") or presence_source.startswith("grp"))
            and presence_source != self.bot_uid
        ):
            asyncio.create_task(self._subscribe_topic(presence_source))
            return

        if packet.get("data"):
            self._track_message(packet)

    async def _connect_once(self):
        auth = await ensure_tinode_chatbot_auth(force=True)
        self.bot_uid = str(auth.get("uid") or "")
        self.subscribed_topics.clear()
        self.group_context.clear()
        async with self.http.ws_connect(
            self.ws_url,
            headers=_bridge_headers(),
            heartbeat=30,
            timeout=aiohttp.ClientTimeout(total=None, sock_read=None),
            max_msg_size=16 * 1024 * 1024,
        ) as socket:
            self.websocket = socket
            await socket.send_json({
                "hi": {
                    "id": "1",
                    "ver": "0.25",
                    "ua": "VICHAT-TINODE-CHATBOT/1.0",
                    "platf": "server",
                    "lang": "vi",
                },
            })
            await self._receive_ctrl("1")
            await socket.send_json({
                "login": {"id": "2", "scheme": "token", "secret": auth.get("token")},
            })
            login_ctrl = await self._receive_ctrl("2")
            authenticated_uid = str((login_ctrl.get("params") or {}).get("user") or "")
            if authenticated_uid != self.bot_uid:
                raise RuntimeError("Tinode authenticated a different chatbot account.")
            await socket.send_json({
                "sub": {"id": "3", "topic": "me", "get": {"what": "desc sub"}},
            })
            self.connected = True
            self.last_error = ""
            LOGGER.info("Tinode chatbot connected as %s", self.bot_uid)
            async for message in socket:
                if message.type == aiohttp.WSMsgType.TEXT:
                    try:
                        packet = json.loads(message.data)
                    except (TypeError, ValueError):
                        continue
                    await self._handle_packet(packet)
                elif message.type in (
                    aiohttp.WSMsgType.CLOSE,
                    aiohttp.WSMsgType.CLOSED,
                    aiohttp.WSMsgType.ERROR,
                ):
                    break

    async def run(self):
        timeout = aiohttp.ClientTimeout(total=None, sock_read=None)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            self.http = session
            while True:
                try:
                    await self._connect_once()
                except asyncio.CancelledError:
                    raise
                except Exception as error:
                    self.last_error = str(error)[:500]
                    LOGGER.warning("Tinode chatbot connection failed: %s", error)
                finally:
                    self.connected = False
                    self.websocket = None
                    for future in self.pending_ctrl.values():
                        if not future.done():
                            future.cancel()
                    self.pending_ctrl.clear()
                await asyncio.sleep(RECONNECT_DELAY)

    async def close(self):
        if self.websocket is not None and not self.websocket.closed:
            await self.websocket.close()
        for task in list(self.message_tasks):
            task.cancel()
        if self.message_tasks:
            await asyncio.gather(*self.message_tasks, return_exceptions=True)


WORKER = TinodeChatbotWorker()


async def health(_request):
    payload = {
        "status": "ok" if WORKER.connected else "starting",
        "connected": WORKER.connected,
        "bot_uid": WORKER.bot_uid,
        "last_error": WORKER.last_error,
    }
    return web.json_response(payload, status=200 if WORKER.connected else 503)


async def on_startup(web_app):
    web_app["worker_task"] = asyncio.create_task(WORKER.run())


async def on_cleanup(web_app):
    task = web_app.get("worker_task")
    if task is not None:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
    await WORKER.close()


def create_app():
    service = web.Application()
    service.router.add_get("/healthz", health)
    service.on_startup.append(on_startup)
    service.on_cleanup.append(on_cleanup)
    return service


if __name__ == "__main__":
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    web.run_app(create_app(), host=LISTEN_HOST, port=LISTEN_PORT)
