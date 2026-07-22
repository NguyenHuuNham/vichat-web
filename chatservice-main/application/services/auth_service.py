import base64
import hashlib
import hmac
import json
import time
import uuid
from urllib.parse import quote

import aiohttp
import bcrypt

from application import database
from application.server import app


ACCESS_COOKIE = "vichat_access_token"
JWT_ISSUER = "vichat-management"


class AuthError(Exception):
    def __init__(self, message, status_code=401):
        super().__init__(message)
        self.status_code = status_code


def _secret():
    value = str(app.config.get("CHAT_AUTH_JWT_SECRET") or "").strip()
    if len(value) < 32:
        raise AuthError("JWT secret is not configured on the server.", 500)
    return value.encode("utf-8")


def _encode_part(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode_part(value):
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def hash_password(password):
    value = str(password or "")
    if len(value) < 8:
        raise AuthError("Password must contain at least 8 characters.", 400)
    if len(value.encode("utf-8")) > 72:
        raise AuthError("Password is too long.", 400)
    return bcrypt.hashpw(value.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(password, password_hash):
    try:
        return bcrypt.checkpw(
            str(password or "").encode("utf-8"),
            str(password_hash or "").encode("ascii"),
        )
    except (ValueError, TypeError):
        return False


def _login_attempt_key(tenant_id, identity, ip_address):
    digest = hashlib.sha256("{}|{}|{}".format(tenant_id, identity, ip_address).encode("utf-8")).hexdigest()
    return "auth:login-attempt:{}".format(digest)


def login_rate_limited(tenant_id, identity, ip_address):
    if database.redisdb is None:
        return False
    try:
        key = _login_attempt_key(tenant_id, identity, ip_address)
        attempts = int(database.redisdb.get(key) or 0)
        return attempts >= int(app.config.get("CHAT_AUTH_MAX_FAILURES", 5))
    except Exception:
        return False


def record_login_failure(tenant_id, identity, ip_address):
    if database.redisdb is None:
        return
    try:
        key = _login_attempt_key(tenant_id, identity, ip_address)
        attempts = database.redisdb.incr(key)
        if attempts == 1:
            database.redisdb.expire(key, int(app.config.get("CHAT_AUTH_FAILURE_WINDOW", 900)))
    except Exception:
        return


def clear_login_failures(tenant_id, identity, ip_address):
    if database.redisdb is None:
        return
    try:
        database.redisdb.delete(_login_attempt_key(tenant_id, identity, ip_address))
    except Exception:
        return


def issue_access_token(account):
    now = int(time.time())
    ttl = int(app.config.get("CHAT_AUTH_ACCESS_TTL", 28800))
    payload = {
        "iss": JWT_ISSUER,
        "sub": str(account.id),
        "tid": str(account.tenant_id),
        "username": account.username,
        "role": account.role or "member",
        "iat": now,
        "exp": now + ttl,
        "jti": str(uuid.uuid4()),
        "typ": "access",
    }
    header = {"alg": "HS256", "typ": "JWT"}
    encoded_header = _encode_part(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    encoded_payload = _encode_part(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    unsigned = "{}.{}".format(encoded_header, encoded_payload)
    signature = hmac.new(_secret(), unsigned.encode("ascii"), hashlib.sha256).digest()
    return "{}.{}".format(unsigned, _encode_part(signature))


def decode_access_token(token):
    if not token or not isinstance(token, str):
        return None
    try:
        encoded_header, encoded_payload, encoded_signature = token.split(".", 2)
        unsigned = "{}.{}".format(encoded_header, encoded_payload)
        expected = hmac.new(_secret(), unsigned.encode("ascii"), hashlib.sha256).digest()
        supplied = _decode_part(encoded_signature)
        if not hmac.compare_digest(expected, supplied):
            return None
        header = json.loads(_decode_part(encoded_header).decode("utf-8"))
        payload = json.loads(_decode_part(encoded_payload).decode("utf-8"))
        if header.get("alg") != "HS256" or payload.get("iss") != JWT_ISSUER:
            return None
        if payload.get("typ") != "access" or int(payload.get("exp", 0)) <= int(time.time()):
            return None
        revoked_key = "auth:revoked:{}".format(payload.get("jti"))
        if database.redisdb is not None and database.redisdb.exists(revoked_key):
            return None
        return payload
    except (ValueError, TypeError, KeyError, UnicodeError, json.JSONDecodeError, AuthError):
        return None


def token_from_request(request):
    authorization = request.headers.get("Authorization") or ""
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return request.cookies.get(ACCESS_COOKIE) or request.headers.get("X-USER-TOKEN")


def current_user(request):
    payload = decode_access_token(token_from_request(request))
    if not payload:
        return None
    return {
        "id": payload.get("sub"),
        "uid": payload.get("sub"),
        "username": payload.get("username"),
        "user_name": payload.get("username"),
        "role": payload.get("role"),
        "tenant_id": payload.get("tid"),
        "current_tenant_id": payload.get("tid"),
    }


def revoke_request_token(request):
    payload = decode_access_token(token_from_request(request))
    if not payload or database.redisdb is None:
        return
    ttl = max(1, int(payload.get("exp", 0)) - int(time.time()))
    database.redisdb.setex("auth:revoked:{}".format(payload.get("jti")), ttl, "1")


def set_auth_cookie(response, token):
    response.cookies[ACCESS_COOKIE] = token
    response.cookies[ACCESS_COOKIE]["path"] = "/"
    response.cookies[ACCESS_COOKIE]["httponly"] = True
    response.cookies[ACCESS_COOKIE]["samesite"] = "Strict"
    response.cookies[ACCESS_COOKIE]["secure"] = bool(app.config.get("CHAT_AUTH_COOKIE_SECURE", False))
    response.cookies[ACCESS_COOKIE]["max-age"] = int(app.config.get("CHAT_AUTH_ACCESS_TTL", 28800))
    return response


def clear_auth_cookie(response):
    # Gatco's cookie jar can raise when an empty cookie is assigned. Emit a
    # standards-compliant deletion header instead.
    attributes = [
        "{}=".format(ACCESS_COOKIE),
        "Path=/",
        "Max-Age=0",
        "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
        "HttpOnly",
        "SameSite=Strict",
    ]
    if bool(app.config.get("CHAT_AUTH_COOKIE_SECURE", False)):
        attributes.append("Secure")
    response.headers["Set-Cookie"] = "; ".join(attributes)
    return response


async def tinode_login(username, password):
    base_url = str(app.config.get("TINODE_INTERNAL_WS_URL") or "").rstrip("?")
    api_key = str(app.config.get("TINODE_API_KEY") or "")
    if not base_url or not api_key:
        raise AuthError("Tinode authentication is not configured.", 503)
    separator = "&" if "?" in base_url else "?"
    url = "{}{}apikey={}".format(base_url, separator, quote(api_key, safe=""))
    timeout = aiohttp.ClientTimeout(total=int(app.config.get("TINODE_AUTH_TIMEOUT", 10)))
    secret = base64.b64encode("{}:{}".format(username, password).encode("utf-8")).decode("ascii")
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.ws_connect(url) as socket:
            await socket.send_json({"hi": {"id": "1", "ver": "0.25", "ua": "VICHAT-CHAT-SERVICE", "platf": "server", "lang": "vi"}})
            hi = await socket.receive_json()
            if hi.get("ctrl", {}).get("code", 500) >= 300:
                raise AuthError("Tinode handshake failed.", 502)
            await socket.send_json({"login": {"id": "2", "scheme": "basic", "secret": secret}})
            login = await socket.receive_json()
            ctrl = login.get("ctrl") or {}
            if ctrl.get("code", 500) >= 300 or not ctrl.get("params", {}).get("token"):
                raise AuthError("Tinode rejected the account credentials.", 401)
            return {
                "token": ctrl["params"]["token"],
                "expires": ctrl["params"].get("expires"),
                "uid": ctrl["params"].get("user"),
            }


async def tinode_create_account(username, password, full_name):
    base_url = str(app.config.get("TINODE_INTERNAL_WS_URL") or "").rstrip("?")
    api_key = str(app.config.get("TINODE_API_KEY") or "")
    if not base_url or not api_key:
        raise AuthError("Tinode authentication is not configured.", 503)
    separator = "&" if "?" in base_url else "?"
    url = "{}{}apikey={}".format(base_url, separator, quote(api_key, safe=""))
    timeout = aiohttp.ClientTimeout(total=int(app.config.get("TINODE_AUTH_TIMEOUT", 10)))
    secret = base64.b64encode("{}:{}".format(username, password).encode("utf-8")).decode("ascii")
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.ws_connect(url) as socket:
            await socket.send_json({"hi": {"id": "1", "ver": "0.25", "ua": "VICHAT-CHAT-SERVICE", "platf": "server", "lang": "vi"}})
            hi = await socket.receive_json()
            if hi.get("ctrl", {}).get("code", 500) >= 300:
                raise AuthError("Tinode handshake failed.", 502)
            await socket.send_json({
                "acc": {
                    "id": "2",
                    "user": "new",
                    "scheme": "basic",
                    "secret": secret,
                    "login": True,
                    "desc": {"public": {"fn": full_name}},
                    "tags": [username],
                },
            })
            created = await socket.receive_json()
            ctrl = created.get("ctrl") or {}
            if ctrl.get("code", 500) >= 300:
                raise AuthError(ctrl.get("text") or "Tinode account creation failed.", 409)
            return {
                "token": ctrl.get("params", {}).get("token"),
                "expires": ctrl.get("params", {}).get("expires"),
                "uid": ctrl.get("params", {}).get("user"),
            }


async def tinode_change_password(username, current_password, new_password):
    """Rotate a Tinode basic credential without exposing either secret to the client."""
    base_url = str(app.config.get("TINODE_INTERNAL_WS_URL") or "").rstrip("?")
    api_key = str(app.config.get("TINODE_API_KEY") or "")
    if not base_url or not api_key:
        raise AuthError("Tinode authentication is not configured.", 503)
    separator = "&" if "?" in base_url else "?"
    url = "{}{}apikey={}".format(base_url, separator, quote(api_key, safe=""))
    timeout = aiohttp.ClientTimeout(total=int(app.config.get("TINODE_AUTH_TIMEOUT", 10)))
    current_secret = base64.b64encode("{}:{}".format(username, current_password).encode("utf-8")).decode("ascii")
    new_secret = base64.b64encode("{}:{}".format(username, new_password).encode("utf-8")).decode("ascii")
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.ws_connect(url) as socket:
            await socket.send_json({"hi": {"id": "1", "ver": "0.25", "ua": "VICHAT-CHAT-SERVICE", "platf": "server", "lang": "vi"}})
            hi = await socket.receive_json()
            if hi.get("ctrl", {}).get("code", 500) >= 300:
                raise AuthError("Tinode handshake failed.", 502)
            await socket.send_json({"login": {"id": "2", "scheme": "basic", "secret": current_secret}})
            login = await socket.receive_json()
            login_ctrl = login.get("ctrl") or {}
            uid = login_ctrl.get("params", {}).get("user")
            if login_ctrl.get("code", 500) >= 300 or not uid:
                raise AuthError("Tinode rejected the current password.", 401)
            await socket.send_json({
                "acc": {
                    "id": "3",
                    "user": uid,
                    "scheme": "basic",
                    "secret": new_secret,
                    "login": False,
                },
            })
            changed = await socket.receive_json()
            ctrl = changed.get("ctrl") or {}
            if ctrl.get("code", 500) >= 300:
                raise AuthError(ctrl.get("text") or "Tinode password change failed.", 400)
            return {"uid": uid}
