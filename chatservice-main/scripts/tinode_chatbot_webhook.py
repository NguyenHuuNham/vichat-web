"""Tinode-backed chatbot worker.

The worker owns one Tinode bot account. It receives direct Tinode messages,
passes them to the tenant-aware Chatmgt webhook, then publishes the reply back
to the same Tinode topic. Normal employee and group topics are not inspected.
"""

import asyncio
import itertools
import json
import logging
import os

import aiohttp
from aiohttp import web

from application.server import app
from application.services.auth_service import _tinode_bridge_headers
from application.services.tinode_chatbot_protocol import (
    CursorStore,
    tinode_contact_topics,
    tinode_message_text,
    tinode_websocket_url,
)
from application.services.tinode_chatbot_service import ensure_tinode_chatbot_auth


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

class TinodeChatbotWorker(object):
    def __init__(self):
        self.ws_url = tinode_websocket_url(
            app.config.get("TINODE_INTERNAL_WS_URL"),
            app.config.get("TINODE_API_KEY"),
        )
        self.webhook_url = str(app.config.get("TINODE_CHATBOT_WEBHOOK_URL") or "").strip()
        self.webhook_key = str(app.config.get("TINODE_CHATBOT_WEBHOOK_KEY") or "").strip()
        self.webhook_timeout = max(
            5, int(app.config.get("TINODE_CHATBOT_WEBHOOK_TIMEOUT", 40))
        )
        self.history_limit = max(1, int(app.config.get("TINODE_CHATBOT_HISTORY_LIMIT", 100)))
        self.failure_reply = str(
            app.config.get("TINODE_CHATBOT_FAILURE_REPLY")
            or "Tro ly AI dang tam thoi khong phan hoi. Vui long thu lai sau."
        )
        self.cursor = CursorStore(app.config.get("TINODE_CHATBOT_STATE_FILE"))
        self.connected = False
        self.bot_uid = ""
        self.last_error = ""
        self.websocket = None
        self.http = None
        self.request_ids = itertools.count(10)
        self.send_lock = asyncio.Lock()
        self.topic_locks = {}
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

    async def _publish(self, topic, reply, source_sequence):
        request_id = self._request_id("pub")
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self.pending_ctrl[request_id] = future
        await self._send({
            "pub": {
                "id": request_id,
                "topic": topic,
                "noecho": True,
                "head": {
                    "x-vichat-chatbot": "1",
                    "x-vichat-chatbot-source-seq": str(source_sequence),
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
        if not topic.startswith("usr") or topic == self.bot_uid or topic in self.subscribed_topics:
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

    async def _webhook_reply(self, packet, message):
        data = packet.get("data") or {}
        async with self.http.post(
            self.webhook_url,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Vichat-Chatbot-Webhook": self.webhook_key,
                "User-Agent": "VICHAT-TINODE-CHATBOT/1.0",
            },
            json={
                "topic": str(data.get("topic") or ""),
                "seq": int(data.get("seq") or 0),
                "sender_uid": str(data.get("from") or ""),
                "message": message,
                "created_at": data.get("ts"),
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
            return reply

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
            message = tinode_message_text(data.get("content"))
            if sender_uid == self.bot_uid or not message or message.startswith(SPECIAL_MESSAGE_PREFIXES):
                self.cursor.advance(topic, sequence)
                return
            try:
                reply = await self._webhook_reply(packet, message)
            except Exception as error:
                LOGGER.warning("Chatbot provider failed for %s:%s: %s", topic, sequence, error)
                self.last_error = str(error)[:500]
                reply = self.failure_reply
            await self._publish(topic, reply, sequence)
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
            for topic in tinode_contact_topics(meta):
                asyncio.create_task(self._subscribe_topic(topic))
            return

        presence = packet.get("pres") or {}
        presence_source = str(presence.get("src") or "").strip()
        if presence_source.startswith("usr") and presence_source != self.bot_uid:
            asyncio.create_task(self._subscribe_topic(presence_source))
            return

        if packet.get("data"):
            self._track_message(packet)

    async def _connect_once(self):
        auth = await ensure_tinode_chatbot_auth(app, force=True)
        self.bot_uid = str(auth.get("uid") or "")
        self.subscribed_topics.clear()
        async with self.http.ws_connect(
            self.ws_url,
            headers=_tinode_bridge_headers(),
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
