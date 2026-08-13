"""WebSocket relay which maps UpGO Account credentials to Tinode tokens.

Tinode Web sends a basic login packet over the WebSocket. The relay validates
those credentials through Chatmgt, replaces the packet with a short-lived
Tinode token login, and proxies all later packets without inspecting them.
"""

import asyncio
import base64
import binascii
import hmac
import json
import logging
import os
from http.cookies import SimpleCookie
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import aiohttp
from aiohttp import web


LOGGER = logging.getLogger("tinode-account-bridge")
CHATMGT_URL = str(os.getenv("CHATMGT_INTERNAL_URL", "http://chatmgt:8093")).rstrip("/")
DEFAULT_TENANT = str(os.getenv("CHATMGT_DEFAULT_TENANT", "")).strip()
TINODE_API_KEY = str(os.getenv("TINODE_API_KEY", "")).strip()
TINODE_CENTRAL_WS_URL = str(
    os.getenv("TINODE_CENTRAL_WS_URL", "wss://web.vichat.net/v0/channels")
).strip()
REQUEST_TIMEOUT = max(5, int(os.getenv("TINODE_BRIDGE_TIMEOUT", "15")))
LISTEN_HOST = str(os.getenv("TINODE_BRIDGE_HOST", "0.0.0.0"))
LISTEN_PORT = int(os.getenv("TINODE_BRIDGE_PORT", "8095"))
INTERNAL_KEY = str(os.getenv("TINODE_BRIDGE_INTERNAL_KEY", "")).strip()
ICE_SERVERS_FILE = str(os.getenv("TINODE_BRIDGE_ICE_SERVERS_FILE", "")).strip()
ACCOUNT_SESSION_COOKIE_NAME = str(os.getenv("ACCOUNT_SESSION_COOKIE_NAME", "session")).strip() or "session"
CHAT_ACCESS_COOKIE_NAME = str(os.getenv("CHAT_ACCESS_COOKIE_NAME", "vichat_access_token")).strip() or "vichat_access_token"


class BridgeError(Exception):
    def __init__(self, message, status_code=401):
        super().__init__(message)
        self.status_code = status_code


def _tinode_url():
    parts = urlsplit(TINODE_CENTRAL_WS_URL)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    if TINODE_API_KEY and "apikey" not in query:
        query["apikey"] = TINODE_API_KEY
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _response_cookies(response):
    cookies = SimpleCookie()
    for header in response.headers.getall("Set-Cookie", []):
        if isinstance(header, str):
            cookies.load(header)
    # aiohttp parses normal headers into .cookies, while some Sanic/Gatco
    # responses serialize one cookie through the raw Set-Cookie header.
    parsed = getattr(response, "cookies", None)
    if parsed:
        for name, morsel in parsed.items():
            if morsel.value and morsel.value.lower() != "none":
                cookies[name] = morsel.value
    return {
        name: morsel.value
        for name, morsel in cookies.items()
        if morsel.value and morsel.value.lower() != "none"
    }


def _cookie_header(response):
    cookies = _response_cookies(response)
    ordered_names = [ACCOUNT_SESSION_COOKIE_NAME, CHAT_ACCESS_COOKIE_NAME]
    ordered_names.extend(name for name in cookies if name not in ordered_names)
    return "; ".join(
        "{}={}".format(name, cookies[name])
        for name in ordered_names
        if cookies.get(name)
    )


def _basic_credentials(secret):
    value = str(secret or "").strip()
    if not value:
        raise BridgeError("Tinode basic credentials are required.", 401)
    try:
        padding = "=" * (-len(value) % 4)
        decoded = base64.b64decode((value + padding).encode("ascii"), validate=False)
        identity, password = decoded.decode("utf-8").split(":", 1)
    except (ValueError, UnicodeError, TypeError, binascii.Error) as error:
        raise BridgeError("Tinode basic credentials are invalid.", 401) from error
    identity = identity.strip()
    if not identity or not password:
        raise BridgeError("Tinode basic credentials are invalid.", 401)
    return identity, password


async def _account_tinode_token(identity, password):
    if not DEFAULT_TENANT:
        raise BridgeError("Tinode Account bridge is not configured.", 503)
    timeout = aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
    client = aiohttp.ClientSession(
        timeout=timeout,
        cookie_jar=aiohttp.DummyCookieJar(),
    )
    try:
        login_payload = {
            "identity": identity,
            "password": password,
            "tenant_id": DEFAULT_TENANT,
        }
        async with client.post(
            CHATMGT_URL + "/api/v1/auth/account-login",
            headers={"Accept": "application/json", "User-Agent": "VICHAT-TINODE-BRIDGE/1.0"},
            json=login_payload,
        ) as login_response:
            password = ""
            try:
                login_body = await login_response.json(content_type=None)
            except (aiohttp.ContentTypeError, ValueError):
                login_body = {}
            if login_response.status != 200:
                raise BridgeError(
                    str(
                        (login_body or {}).get("error_message")
                        if isinstance(login_body, dict)
                        else "UpGO Account login failed."
                    ),
                    401 if login_response.status < 500 else 503,
                )
            cookies = _response_cookies(login_response)
            chat_token = str(cookies.get(CHAT_ACCESS_COOKIE_NAME) or "").strip()
            if not chat_token:
                raise BridgeError("Chatmgt did not issue a login session.", 503)

        async with client.post(
            CHATMGT_URL + "/api/v1/auth/tinode-token-bridge",
            headers={
                "Accept": "application/json",
                "Authorization": "Bearer " + chat_token,
                "X-Vichat-Tinode-Internal": INTERNAL_KEY,
                "User-Agent": "VICHAT-TINODE-BRIDGE/1.0",
            },
            json={},
        ) as token_response:
            try:
                token_body = await token_response.json(content_type=None)
            except (aiohttp.ContentTypeError, ValueError):
                token_body = {}
            if token_response.status != 200:
                raise BridgeError(
                    str(
                        (token_body or {}).get("error_message")
                        if isinstance(token_body, dict)
                        else "Tinode token exchange failed."
                    ),
                    503 if token_response.status >= 500 else 401,
                )
            tinode_auth = (
                (token_body or {}).get("tinode_auth") or {}
                if isinstance(token_body, dict)
                else {}
            )
            token = str(tinode_auth.get("token") or "").strip()
            if not token:
                raise BridgeError("Chatmgt returned no Tinode token.", 503)
            return token
    except BridgeError:
        raise
    except (aiohttp.ClientError, asyncio.TimeoutError) as error:
        raise BridgeError("Chatmgt Account service is temporarily unavailable.", 503) from error
    finally:
        await client.close()


async def _rewrite_login(packet, allow_internal_basic=False):
    login = packet.get("login") if isinstance(packet, dict) else None
    if not isinstance(login, dict) or str(login.get("scheme") or "").lower() != "basic":
        return packet
    if allow_internal_basic:
        return packet
    identity, password = _basic_credentials(login.get("secret"))
    try:
        token = await _account_tinode_token(identity, password)
    finally:
        password = ""
    rewritten = dict(packet)
    rewritten_login = dict(login)
    rewritten_login["scheme"] = "token"
    rewritten_login["secret"] = token
    rewritten["login"] = rewritten_login
    return rewritten


def _error_packet(request_id, error):
    return {
        "ctrl": {
            "id": request_id,
            "code": int(error.status_code),
            "text": str(error),
        },
    }


def _load_ice_servers(path=ICE_SERVERS_FILE):
    if not path:
        return []
    try:
        with open(path, "r") as source:
            payload = json.load(source)
    except (IOError, OSError, ValueError) as error:
        LOGGER.warning("Tinode bridge ICE configuration could not be loaded: %s", error)
        return []
    if not isinstance(payload, list):
        LOGGER.warning("Tinode bridge ICE configuration must be a JSON array.")
        return []
    return [item for item in payload if isinstance(item, dict) and item.get("urls")]


def _rewrite_hello_response(packet, ice_servers):
    ctrl = packet.get("ctrl") if isinstance(packet, dict) else None
    if not isinstance(ctrl, dict) or int(ctrl.get("code") or 0) != 201:
        return packet
    params = ctrl.get("params")
    if not isinstance(params, dict) or params.get("iceServers") or not ice_servers:
        return packet
    rewritten = dict(packet)
    rewritten_ctrl = dict(ctrl)
    rewritten_ctrl["params"] = dict(params, iceServers=ice_servers)
    rewritten["ctrl"] = rewritten_ctrl
    return rewritten


async def _relay_client_to_tinode(client, upstream, allow_internal_basic=False):
    async for message in client:
        if message.type == aiohttp.WSMsgType.TEXT:
            try:
                packet = json.loads(message.data)
            except (TypeError, ValueError):
                await upstream.send_str(message.data)
                continue
            try:
                packet = await _rewrite_login(packet, allow_internal_basic)
            except BridgeError as error:
                request_id = (packet.get("login") or {}).get("id") if isinstance(packet, dict) else None
                await client.send_json(_error_packet(request_id, error))
                LOGGER.warning("Tinode Web Account login rejected with status %s", error.status_code)
                continue
            await upstream.send_json(packet)
        elif message.type == aiohttp.WSMsgType.BINARY:
            await upstream.send_bytes(message.data)
        elif message.type == aiohttp.WSMsgType.PING:
            await upstream.ping()
        elif message.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
            break


async def _relay_tinode_to_client(upstream, client, ice_servers=None):
    async for message in upstream:
        if message.type == aiohttp.WSMsgType.TEXT:
            if ice_servers:
                try:
                    packet = _rewrite_hello_response(json.loads(message.data), ice_servers)
                except (TypeError, ValueError):
                    packet = None
                if packet is not None:
                    await client.send_json(packet)
                    continue
            await client.send_str(message.data)
        elif message.type == aiohttp.WSMsgType.BINARY:
            await client.send_bytes(message.data)
        elif message.type == aiohttp.WSMsgType.PING:
            await client.ping()
        elif message.type == aiohttp.WSMsgType.PONG:
            await client.pong()
        elif message.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
            break


async def channels(request):
    client = web.WebSocketResponse(heartbeat=30, max_msg_size=16 * 1024 * 1024)
    await client.prepare(request)
    internal_header = str(request.headers.get("X-Vichat-Tinode-Internal") or "")
    allow_internal_basic = bool(INTERNAL_KEY and hmac.compare_digest(internal_header, INTERNAL_KEY))
    ice_servers = _load_ice_servers()
    timeout = aiohttp.ClientTimeout(total=None, sock_read=None)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.ws_connect(
                _tinode_url(),
                ssl=False,
                headers={"Host": "web.vichat.net", "Origin": "https://web.vichat.net"},
                max_msg_size=16 * 1024 * 1024,
            ) as upstream:
                client_task = asyncio.create_task(
                    _relay_client_to_tinode(client, upstream, allow_internal_basic)
                )
                tinode_task = asyncio.create_task(
                    _relay_tinode_to_client(upstream, client, ice_servers)
                )
                done, pending = await asyncio.wait(
                    (client_task, tinode_task),
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in pending:
                    task.cancel()
                await asyncio.gather(*done, return_exceptions=True)
                for task in pending:
                    await asyncio.gather(task, return_exceptions=True)
    except (aiohttp.ClientError, asyncio.TimeoutError) as error:
        LOGGER.warning("Tinode central relay failed: %s", error)
    finally:
        if not client.closed:
            await client.close()
    return client


async def health(_request):
    return web.json_response({"status": "ok", "tinode_central": bool(TINODE_CENTRAL_WS_URL)})


def create_app():
    app = web.Application()
    app.router.add_get("/healthz", health)
    app.router.add_get("/v0/channels", channels)
    return app


if __name__ == "__main__":
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    web.run_app(create_app(), host=LISTEN_HOST, port=LISTEN_PORT)
