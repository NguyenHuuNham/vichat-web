import asyncio
import base64
import hashlib
import hmac
import json
import re
import secrets
import smtplib
import time
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage
from urllib.parse import parse_qsl, quote, urlencode, urlparse, urlunparse

import aiohttp
import bcrypt

from application import database
from application.server import app
from application.services.sso_identity import (
    SSOIdentityError,
    derive_tinode_password,
)


ACCESS_COOKIE = "vichat_access_token"
MANAGEMENT_ACCESS_COOKIE = "vichat_management_access_token"
MANAGEMENT_SESSION_HEADER = "X-Vichat-Session-Scope"
CHAT_SESSION_SCOPE = "chat"
MANAGEMENT_SESSION_SCOPE = "management"
JWT_ISSUER = "vichat-management"
MOBILE_CLIENT_HEADER = "X-Vichat-Client"
LINKED_SESSION_PREFIX = "auth:linked-session:"


class AuthError(Exception):
    def __init__(self, message, status_code=401):
        super().__init__(message)
        self.status_code = status_code


def _secret():
    value = str(app.config.get("CHAT_AUTH_JWT_SECRET") or "").strip()
    if len(value) < 32:
        raise AuthError("JWT secret is not configured on the server.", 500)
    return value.encode("utf-8")


def _tinode_bridge_headers():
    bridge_key = str(app.config.get("TINODE_BRIDGE_INTERNAL_KEY") or "").strip()
    return {"X-Vichat-Tinode-Internal": bridge_key} if bridge_key else {}


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


def _password_reset_attempt_key(tenant_id, identity, ip_address):
    digest = hashlib.sha256("{}|{}|{}".format(tenant_id, identity, ip_address).encode("utf-8")).hexdigest()
    return "auth:password-reset:{}".format(digest)


def password_reset_rate_limited(tenant_id, identity, ip_address):
    if database.redisdb is None:
        return False
    try:
        key = _password_reset_attempt_key(tenant_id, identity, ip_address)
        attempts = int(database.redisdb.get(key) or 0)
        return attempts >= int(app.config.get("CHAT_PASSWORD_RESET_MAX_REQUESTS", 3))
    except Exception:
        return False


def record_password_reset_request(tenant_id, identity, ip_address):
    if database.redisdb is None:
        return
    try:
        key = _password_reset_attempt_key(tenant_id, identity, ip_address)
        attempts = database.redisdb.incr(key)
        if attempts == 1:
            database.redisdb.expire(key, int(app.config.get("CHAT_PASSWORD_RESET_WINDOW", 900)))
    except Exception:
        return


def issue_access_token(account, auth_method="password", session_scope=CHAT_SESSION_SCOPE, tinode_auth=None):
    now = int(time.time())
    ttl = int(app.config.get("CHAT_AUTH_ACCESS_TTL", 28800))
    properties = account.properties or {}
    session_scope = str(session_scope or CHAT_SESSION_SCOPE).strip().lower()
    if session_scope not in (CHAT_SESSION_SCOPE, MANAGEMENT_SESSION_SCOPE):
        raise AuthError("Session scope is invalid.", 500)
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
        "av": int(properties.get("auth_version") or 0),
        "amr": str(auth_method or "password"),
        "scp": session_scope,
    }
    # Keep the short-lived Tinode bearer token inside the signed Chatmgt
    # session so a page refresh can reconnect without storing or recovering
    # the employee's plaintext password.
    if session_scope == CHAT_SESSION_SCOPE and tinode_auth and tinode_auth.get("token"):
        payload["tinode"] = {
            "username": str(tinode_auth.get("username") or ""),
            "uid": str(tinode_auth.get("uid") or ""),
            "token": str(tinode_auth.get("token") or ""),
            "expires": tinode_auth.get("expires"),
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
        if payload.get("amr") not in ("password", "account_sso"):
            return None
        session_scope = str(payload.get("scp") or CHAT_SESSION_SCOPE).strip().lower()
        if session_scope not in (CHAT_SESSION_SCOPE, MANAGEMENT_SESSION_SCOPE):
            return None
        payload["scp"] = session_scope
        revoked_key = "auth:revoked:{}".format(payload.get("jti"))
        if database.redisdb is not None and database.redisdb.exists(revoked_key):
            return None
        return payload
    except (ValueError, TypeError, KeyError, UnicodeError, json.JSONDecodeError, AuthError):
        return None


def management_session_requested(request):
    return str(request.headers.get(MANAGEMENT_SESSION_HEADER) or "").strip().lower() == "management"


def mobile_access_token_payload(request, token):
    """Expose the chat JWT only to explicitly enabled first-party mobile clients."""
    client = str(request.headers.get(MOBILE_CLIENT_HEADER) or "").strip().lower()
    if not app.config.get("CHAT_MOBILE_BEARER_ENABLED", False) or client != "mobile":
        return {}
    return {
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": int(app.config.get("CHAT_AUTH_ACCESS_TTL", 28800)),
    }


def _cookie_token_from_request(request, cookie_name):
    # Browsers can retain both an old domain cookie and a newer host cookie
    # with the same name. Select the newest valid token instead of trusting
    # whichever duplicate the cookie parser happens to return.
    cookie_tokens = []
    raw_cookie = str(request.headers.get("Cookie") or "")
    for item in raw_cookie.split(";"):
        name, separator, value = item.strip().partition("=")
        if separator and name == cookie_name and value and value not in cookie_tokens:
            cookie_tokens.append(value)
    parsed_cookie = request.cookies.get(cookie_name)
    if parsed_cookie and parsed_cookie not in cookie_tokens:
        cookie_tokens.append(parsed_cookie)

    valid_tokens = []
    for index, token in enumerate(cookie_tokens):
        payload = decode_access_token(token)
        if payload:
            valid_tokens.append((int(payload.get("iat") or 0), index, token))
    if valid_tokens:
        return max(valid_tokens, key=lambda item: (item[0], item[1]))[2]
    return parsed_cookie


def token_from_request(request):
    authorization = request.headers.get("Authorization") or ""
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    header_token = request.headers.get("X-USER-TOKEN")
    if header_token:
        return header_token

    cookie_name = MANAGEMENT_ACCESS_COOKIE if management_session_requested(request) else ACCESS_COOKIE
    return _cookie_token_from_request(request, cookie_name)


def current_user(request):
    payload = decode_access_token(token_from_request(request))
    if not payload:
        return None
    expected_scope = (
        MANAGEMENT_SESSION_SCOPE
        if management_session_requested(request)
        else CHAT_SESSION_SCOPE
    )
    if payload.get("scp") != expected_scope:
        return None
    return {
        "id": payload.get("sub"),
        "uid": payload.get("sub"),
        "username": payload.get("username"),
        "user_name": payload.get("username"),
        "role": payload.get("role"),
        "tenant_id": payload.get("tid"),
        "current_tenant_id": payload.get("tid"),
        "auth_version": int(payload.get("av") or 0),
        "auth_method": payload.get("amr"),
        "session_scope": payload.get("scp"),
        "issued_at": int(payload.get("iat") or 0),
        "jti": payload.get("jti"),
    }


def tinode_auth_from_request(request):
    """Return the Tinode token bound to the current Chatmgt JWT, if present."""
    payload = decode_access_token(token_from_request(request))
    if not payload or payload.get("scp") != CHAT_SESSION_SCOPE:
        return None
    auth = payload.get("tinode") or {}
    if not isinstance(auth, dict) or not auth.get("token"):
        return None
    return {
        "username": str(auth.get("username") or ""),
        "uid": str(auth.get("uid") or ""),
        "token": str(auth.get("token") or ""),
        "expires": auth.get("expires"),
    }


def tinode_auth_expired(auth, skew_seconds=30):
    """Return True when a session-bound Tinode token cannot be reused safely."""
    if not isinstance(auth, dict) or not auth.get("token") or not auth.get("expires"):
        return True
    try:
        expires = auth.get("expires")
        if isinstance(expires, (int, float)):
            expires_at = float(expires)
        else:
            value = str(expires).strip()
            fractional = re.match(r"^(.*:\d{2})\.(\d+)(Z|[+-]\d{2}:\d{2})$", value)
            if fractional:
                fraction = (fractional.group(2) + "000000")[:6]
                value = "{}.{}{}".format(
                    fractional.group(1),
                    fraction,
                    fractional.group(3),
                )
            if value.endswith("Z"):
                value = value[:-1] + "+00:00"
            parsed = datetime.fromisoformat(value)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            expires_at = parsed.timestamp()
        return expires_at <= time.time() + max(0, int(skew_seconds))
    except (TypeError, ValueError, OverflowError):
        return True


def password_reset_token_hash(token):
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


def create_password_reset_token():
    return secrets.token_urlsafe(48)


def build_password_reset_url(token):
    template = str(app.config.get("CHAT_PASSWORD_RESET_URL") or "").strip()
    if not template:
        return ""
    if "{token}" in template:
        return template.replace("{token}", quote(token, safe=""))
    parsed = urlparse(template)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["reset_token"] = token
    return urlunparse(parsed._replace(query=urlencode(query)))


def _send_password_reset_email(account, reset_url):
    host = str(app.config.get("CHAT_SMTP_HOST") or "").strip()
    sender = str(app.config.get("CHAT_SMTP_FROM") or "").strip()
    if not host or not sender or not account.email:
        return False

    message = EmailMessage()
    message["Subject"] = "Dat lai mat khau VICHAT"
    message["From"] = sender
    message["To"] = account.email
    message.set_content(
        "Xin chao {},\n\n"
        "Ban da yeu cau dat lai mat khau VICHAT. Mo lien ket sau de tao mat khau moi:\n{}\n\n"
        "Lien ket se het han sau {} phut. Neu ban khong yeu cau, hay bo qua email nay.\n".format(
            account.full_name,
            reset_url,
            max(1, int(app.config.get("CHAT_PASSWORD_RESET_TTL", 1800)) // 60),
        )
    )

    port = int(app.config.get("CHAT_SMTP_PORT", 587))
    username = str(app.config.get("CHAT_SMTP_USERNAME") or "")
    password = str(app.config.get("CHAT_SMTP_PASSWORD") or "")
    if username and not password:
        return False
    use_ssl = bool(app.config.get("CHAT_SMTP_SSL", False))
    smtp_class = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
    with smtp_class(host, port, timeout=15) as smtp:
        if not use_ssl and bool(app.config.get("CHAT_SMTP_STARTTLS", True)):
            smtp.starttls()
        if username:
            smtp.login(username, password)
        smtp.send_message(message)
    return True


async def send_password_reset_email(account, reset_url):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _send_password_reset_email, account, reset_url)


def _linked_session_key(payload):
    return "{}{}:{}:{}".format(
        LINKED_SESSION_PREFIX,
        payload.get("tid") or payload.get("tenant_id"),
        payload.get("sub") or payload.get("id"),
        payload.get("jti"),
    )


def _linked_session_time(value):
    return datetime.fromtimestamp(int(value), timezone.utc).isoformat().replace("+00:00", "Z")


def _linked_session_device(request):
    headers = getattr(request, "headers", {}) or {}
    client = str(headers.get(MOBILE_CLIENT_HEADER) or "").strip().lower()
    kind = client if client in ("mobile", "tablet", "desktop", "web") else "web"
    platform = str(headers.get("X-Vichat-Platform") or "").strip()[:120]
    user_agent = str(headers.get("User-Agent") or "").strip()[:240]
    name = str(headers.get("X-Vichat-Device-Name") or "").strip()[:160]
    if not name:
        name = "ViChat Mobile" if kind == "mobile" else (user_agent or "ViChat Web")
    return {"kind": kind, "name": name, "platform": platform or user_agent}


def _linked_session_record(payload, request, existing=None, now=None):
    current_time = int(now or time.time())
    device = _linked_session_device(request)
    existing = existing or {}
    return {
        "id": str(payload.get("jti") or ""),
        "tenant_id": str(payload.get("tid") or payload.get("tenant_id") or ""),
        "user_id": str(payload.get("sub") or payload.get("id") or ""),
        "scope": str(payload.get("scp") or CHAT_SESSION_SCOPE),
        "kind": device["kind"] if not existing.get("kind") else existing["kind"],
        "name": device["name"] if not existing.get("name") else existing["name"],
        "platform": device["platform"] if not existing.get("platform") else existing["platform"],
        "created_at": existing.get("created_at") or _linked_session_time(payload.get("iat") or payload.get("issued_at") or current_time),
        "last_active_at": _linked_session_time(current_time),
    }


def register_linked_session(request, token):
    payload = decode_access_token(token)
    if not payload or not payload.get("jti"):
        return None
    record = _linked_session_record(payload, request)
    if database.redisdb is None:
        return record
    key = _linked_session_key(payload)
    existing = {}
    try:
        raw = database.redisdb.get(key)
        if raw:
            existing = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
    except (TypeError, ValueError, UnicodeError, json.JSONDecodeError):
        existing = {}
    record = _linked_session_record(payload, request, existing=existing)
    ttl = max(1, int(payload.get("exp", 0)) - int(time.time()))
    try:
        database.redisdb.setex(key, ttl, json.dumps(record, separators=(",", ":")))
    except Exception:
        # Keep the current session visible even if Redis is temporarily unavailable.
        return record
    return record


def touch_linked_session(request, current_user=None):
    token_payload = current_user
    if not token_payload:
        token_payload = decode_access_token(token_from_request(request))
    if not token_payload or not token_payload.get("jti"):
        return None
    if database.redisdb is None:
        return _linked_session_record(token_payload, request)
    key = _linked_session_key(token_payload)
    existing = {}
    try:
        raw = database.redisdb.get(key)
        if raw:
            existing = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
    except Exception:
        existing = {}
    record = _linked_session_record(token_payload, request, existing=existing)
    issued_at = int(token_payload.get("iat") or token_payload.get("issued_at") or time.time())
    ttl = max(1, issued_at + int(app.config.get("CHAT_AUTH_ACCESS_TTL", 28800)) - int(time.time()))
    try:
        database.redisdb.setex(key, ttl, json.dumps(record, separators=(",", ":")))
    except Exception:
        return record
    return record


def linked_session_devices(request, current_user):
    current = touch_linked_session(request, current_user)
    if current is None:
        return []
    records = {current["id"]: current}
    scanner = getattr(database.redisdb, "scan_iter", None) if database.redisdb is not None else None
    if callable(scanner):
        pattern = "{}{}:{}:*".format(
            LINKED_SESSION_PREFIX,
            current["tenant_id"],
            current["user_id"],
        )
        try:
            for key in scanner(match=pattern):
                raw = database.redisdb.get(key)
                if not raw:
                    continue
                value = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
                if value.get("id"):
                    records[str(value["id"])] = value
        except Exception:
            # The current session above is still useful while Redis recovers.
            pass
    current_id = str(current_user.get("jti") or "")
    devices = []
    for record in records.values():
        devices.append({
            "id": record.get("id"),
            "kind": record.get("kind") or "web",
            "name": record.get("name") or "ViChat Web",
            "platform": record.get("platform") or "",
            "created_at": record.get("created_at"),
            "last_active_at": record.get("last_active_at"),
            "current": str(record.get("id")) == current_id,
        })
    return sorted(devices, key=lambda item: item.get("last_active_at") or "", reverse=True)


def revoke_request_token(request):
    payload = decode_access_token(token_from_request(request))
    if not payload or database.redisdb is None:
        return
    ttl = max(1, int(payload.get("exp", 0)) - int(time.time()))
    database.redisdb.setex("auth:revoked:{}".format(payload.get("jti")), ttl, "1")
    database.redisdb.delete(_linked_session_key(payload))


def set_auth_cookie(response, token, request=None):
    cookie_name = MANAGEMENT_ACCESS_COOKIE if request and management_session_requested(request) else ACCESS_COOKIE
    response.cookies[cookie_name] = token
    response.cookies[cookie_name]["path"] = "/"
    response.cookies[cookie_name]["httponly"] = True
    response.cookies[cookie_name]["samesite"] = "Strict"
    response.cookies[cookie_name]["secure"] = bool(app.config.get("CHAT_AUTH_COOKIE_SECURE", False))
    response.cookies[cookie_name]["max-age"] = int(app.config.get("CHAT_AUTH_ACCESS_TTL", 28800))
    return response


def clear_auth_cookie(response, request=None):
    # Gatco's cookie jar can raise when an empty cookie is assigned. Emit a
    # standards-compliant deletion header instead.
    cookie_name = MANAGEMENT_ACCESS_COOKIE if request and management_session_requested(request) else ACCESS_COOKIE
    attributes = [
        "{}=".format(cookie_name),
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
        async with session.ws_connect(url, headers=_tinode_bridge_headers()) as socket:
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
        async with session.ws_connect(url, headers=_tinode_bridge_headers()) as socket:
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
            code = int(ctrl.get("code", 500))
            if code >= 300:
                status_code = 409 if code == 409 else (400 if code < 500 else 502)
                raise AuthError(ctrl.get("text") or "Tinode account creation failed.", status_code)
            return {
                "token": ctrl.get("params", {}).get("token"),
                "expires": ctrl.get("params", {}).get("expires"),
                "uid": ctrl.get("params", {}).get("user"),
            }


def tinode_sso_password(identity, tinode_username):
    try:
        return derive_tinode_password(
            app.config.get("TINODE_SSO_SECRET"),
            identity.get("tenant_id"),
            identity.get("account_user_id"),
            tinode_username,
        )
    except SSOIdentityError as error:
        raise AuthError(str(error), 503) from error


def tinode_mirror_enabled():
    return bool(app.config.get("TINODE_MIRROR_LOCAL_CREDENTIALS", False))


def _tinode_login_name(username):
    value = str(username or "").strip().lower()
    # Tinode's stock basic authenticator only accepts letters, numbers, dot and
    # underscore, with a maximum of 32 characters.
    if not value or len(value) > 32 or not value[0].isalnum() or not value[-1].isalnum():
        raise AuthError("The Chatmgt username cannot be used as a Tinode login.", 400)
    if any(not (char.isalnum() or char in "._") for char in value):
        raise AuthError("The Chatmgt username cannot be used as a Tinode login.", 400)
    return value


def tinode_username_compatible(username):
    try:
        _tinode_login_name(username)
        return True
    except AuthError:
        return False


async def tinode_mirror_login(
    username,
    password,
    full_name,
    tinode_uid=None,
    legacy_username=None,
    legacy_password=None,
    recovery_passwords=None,
):
    """Synchronize a local Chatmgt credential with a Tinode basic identity."""
    desired_username = _tinode_login_name(username)
    current_uid = str(tinode_uid or "").strip()
    current_username = str(legacy_username or "").strip().lower()
    recovery_passwords = [
        str(value)
        for value in ([legacy_password] + list(recovery_passwords or []))
        if value
    ]

    if current_uid:
        try:
            direct_auth = await tinode_login(desired_username, password)
            if str(direct_auth.get("uid") or "") != current_uid:
                raise AuthError(
                    "The Tinode login already belongs to a different user. Remove the duplicate Tinode Web account first.",
                    409,
                )
            return {**direct_auth, "username": desired_username}
        except AuthError as error:
            if error.status_code != 401:
                raise

        if current_username:
            for recovery_password in recovery_passwords:
                try:
                    await tinode_change_password(
                        current_username,
                        recovery_password,
                        password,
                        new_username=desired_username,
                    )
                    repaired = await tinode_login(desired_username, password)
                    if str(repaired.get("uid") or "") != current_uid:
                        raise AuthError("Tinode authenticated a different user.", 409)
                    return {**repaired, "username": desired_username}
                except AuthError as error:
                    if error.status_code != 401:
                        raise

        # The central Tinode administrator is a last-resort recovery path. A
        # normal migration succeeds with the existing deterministic credential
        # and does not require root access.
        await tinode_admin_reset_password(desired_username, current_uid, password)
        repaired = await tinode_login(desired_username, password)
        if str(repaired.get("uid") or "") != current_uid:
            raise AuthError("Tinode authenticated a different user.", 409)
        return {**repaired, "username": desired_username}

    # A user may have created the matching Tinode Web account before Chatmgt
    # mirroring was enabled. Possession of the exact basic credential is enough
    # to adopt its UID when Chatmgt does not have an existing UID to preserve.
    try:
        direct_auth = await tinode_login(desired_username, password)
        return {**direct_auth, "username": desired_username}
    except AuthError as error:
        if error.status_code != 401:
            raise

    # Legacy releases may have a deterministic Tinode username but no UID in
    # Chatmgt. Recover that UID before replacing its credential so topics stay
    # attached to the same Tinode user.
    if current_username and recovery_passwords and current_username != desired_username:
        for recovery_password in recovery_passwords:
            try:
                legacy_auth = await tinode_login(current_username, recovery_password)
                await tinode_change_password(
                    current_username,
                    recovery_password,
                    password,
                    new_username=desired_username,
                )
                repaired = await tinode_login(desired_username, password)
                if str(repaired.get("uid") or "") != str(legacy_auth.get("uid") or ""):
                    raise AuthError("Tinode authenticated a different user.", 409)
                return {
                    **repaired,
                    "username": desired_username,
                    "uid": legacy_auth.get("uid"),
                }
            except AuthError as error:
                if error.status_code != 401:
                    raise

    created = await tinode_create_account(desired_username, password, full_name or desired_username)
    return {
        **created,
        "username": desired_username,
    }


async def tinode_mirror_reset_password(username, password, full_name, tinode_uid=None):
    """Set the Tinode basic credential without persisting the plaintext password."""
    desired_username = _tinode_login_name(username)
    if tinode_uid:
        await tinode_admin_reset_password(desired_username, tinode_uid, password)
        auth = await tinode_login(desired_username, password)
        if str(auth.get("uid") or "") != str(tinode_uid):
            raise AuthError("Tinode authenticated a different user.", 409)
        return {**auth, "username": desired_username}
    return await tinode_mirror_login(
        desired_username,
        password,
        full_name or desired_username,
    )


def tinode_disabled_password(tenant_id, account_id, tinode_username):
    """Derive an unusable credential used while a Chatmgt account is disabled."""
    try:
        return derive_tinode_password(
            app.config.get("TINODE_SSO_SECRET"),
            "disabled:{}".format(tenant_id),
            account_id,
            "disabled:{}".format(tinode_username),
        )
    except SSOIdentityError as error:
        raise AuthError(str(error), 503) from error


async def tinode_sso_login(identity, tinode_username, tinode_uid=None):
    password = tinode_sso_password(identity, tinode_username)
    try:
        return await tinode_login(tinode_username, password)
    except AuthError as login_error:
        if login_error.status_code != 401:
            raise
        if tinode_uid:
            # Existing deterministic credentials normally work without Tinode
            # administrator access. Use the administrator only as a repair path.
            await tinode_admin_reset_password(tinode_username, tinode_uid, password)
            return await tinode_login(tinode_username, password)

    try:
        return await tinode_create_account(tinode_username, password, identity.get("full_name") or tinode_username)
    except AuthError as create_error:
        if create_error.status_code != 409:
            raise
        # A concurrent first login may have created the deterministic Tinode account.
        return await tinode_login(tinode_username, password)


async def tinode_history_window(
    token,
    expected_uid,
    topic_name,
    before=None,
    page_limit=100,
    max_messages=20000,
):
    """Read a bounded, paged Tinode history window for an authorized topic."""
    base_url = str(app.config.get("TINODE_INTERNAL_WS_URL") or "").rstrip("?")
    api_key = str(app.config.get("TINODE_API_KEY") or "")
    topic = str(topic_name or "").strip()
    if not base_url or not api_key or not token:
        raise AuthError("Tinode history search is not configured.", 503)
    if not topic:
        raise AuthError("Tinode topic is required for history search.", 400)

    page_limit = min(200, max(20, int(page_limit or 100)))
    max_messages = min(20000, max(page_limit, int(max_messages or 20000)))
    cursor = None
    if before not in (None, ""):
        try:
            cursor = max(1, int(before))
        except (TypeError, ValueError):
            raise AuthError("The Tinode history cursor is invalid.", 400)

    separator = "&" if "?" in base_url else "?"
    url = "{}{}apikey={}".format(base_url, separator, quote(api_key, safe=""))
    timeout = aiohttp.ClientTimeout(total=int(app.config.get("TINODE_AUTH_TIMEOUT", 10)))

    async def receive_ctrl(socket, request_id, auth_request=False):
        for _attempt in range(60):
            packet = await socket.receive_json()
            ctrl = packet.get("ctrl") or {}
            if str(ctrl.get("id") or "") != str(request_id):
                continue
            code = int(ctrl.get("code") or 500)
            if code >= 300:
                raise AuthError(
                    ctrl.get("text") or "Tinode rejected the history search.",
                    401 if auth_request and code in (401, 403) else 409,
                )
            return ctrl
        raise AuthError("Tinode did not confirm the history search.", 502)

    async def receive_meta_and_ctrl(socket, request_id):
        messages = []
        for _attempt in range(120):
            packet = await socket.receive_json()
            data_packet = packet.get("data") or {}
            if isinstance(data_packet, dict) and data_packet.get("topic") == topic:
                messages.append(data_packet)
            meta = packet.get("meta") or {}
            if str(meta.get("id") or "") == str(request_id):
                data = meta.get("data") or []
                if isinstance(data, dict):
                    data = [data]
                messages.extend(item for item in data if isinstance(item, dict))
            ctrl = packet.get("ctrl") or {}
            if str(ctrl.get("id") or "") != str(request_id):
                continue
            code = int(ctrl.get("code") or 500)
            if code >= 300:
                raise AuthError(
                    ctrl.get("text") or "Tinode rejected the history search.",
                    409,
                )
            return messages, ctrl
        raise AuthError("Tinode did not return the requested history page.", 502)

    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.ws_connect(url, headers=_tinode_bridge_headers()) as socket:
            await socket.send_json({
                "hi": {
                    "id": "1",
                    "ver": "0.25",
                    "ua": "VICHAT-CHAT-SERVICE",
                    "platf": "server",
                    "lang": "vi",
                },
            })
            await receive_ctrl(socket, "1")
            await socket.send_json({
                "login": {"id": "2", "scheme": "token", "secret": token},
            })
            login_ctrl = await receive_ctrl(socket, "2", auth_request=True)
            authenticated_uid = str((login_ctrl.get("params") or {}).get("user") or "")
            if expected_uid and authenticated_uid != str(expected_uid):
                raise AuthError("Tinode authenticated a different user.", 409)

            # Subscribe first so Tinode applies the current user's topic ACL.
            await socket.send_json({
                "sub": {
                    "id": "3",
                    "topic": topic,
                    "get": {"what": "desc"},
                },
            })
            await receive_meta_and_ctrl(socket, "3")

            messages = []
            seen_sequences = set()
            has_more = True
            request_id = 4
            while len(messages) < max_messages:
                data_params = {"limit": page_limit}
                if cursor is not None:
                    data_params["before"] = cursor
                await socket.send_json({
                    "get": {
                        "id": str(request_id),
                        "topic": topic,
                        "what": "data",
                        "data": data_params,
                    },
                })
                page, ctrl = await receive_meta_and_ctrl(socket, str(request_id))
                request_id += 1
                if not page:
                    has_more = False
                    break

                page_sequences = []
                for message in page:
                    sequence = message.get("seq")
                    try:
                        sequence = int(sequence)
                    except (TypeError, ValueError):
                        continue
                    if sequence <= 0 or sequence in seen_sequences:
                        continue
                    seen_sequences.add(sequence)
                    page_sequences.append(sequence)
                    messages.append(message)

                if not page_sequences:
                    has_more = False
                    break
                if len(page) < page_limit:
                    has_more = False
                    break

                page_min = min(page_sequences)
                next_cursor = page_min if cursor is None or page_min < cursor else page_min - 1
                if next_cursor <= 0 or next_cursor == cursor:
                    has_more = False
                    break
                cursor = next_cursor
                if int((ctrl.get("params") or {}).get("count") or 0) == 0:
                    has_more = False
                    break

            if len(messages) >= max_messages and has_more:
                has_more = True
            next_cursor = cursor if has_more else None
            return {
                "messages": messages,
                "next_cursor": next_cursor,
                "has_more": has_more,
            }


def _tinode_access_mode(value):
    permissions = set(str(value or "").upper())
    return "".join(
        permission for permission in "JRWPASDO"
        if permission in permissions
    )


def _tinode_effective_access(given, want):
    granted = set(_tinode_access_mode(given))
    requested = set(_tinode_access_mode(want))
    return "".join(permission for permission in "JRWPASDO" if permission in granted & requested)


def _tinode_missing_access(required, current):
    available = set(_tinode_access_mode(current))
    return "".join(
        permission for permission in _tinode_access_mode(required)
        if permission not in available
    )


async def tinode_topic_member_uids(
    token,
    expected_uid,
    topic_name,
    include_members=True,
    include_access=False,
):
    base_url = str(app.config.get("TINODE_INTERNAL_WS_URL") or "").rstrip("?")
    api_key = str(app.config.get("TINODE_API_KEY") or "")
    if not base_url or not api_key or not token:
        raise AuthError("Tinode topic verification is not configured.", 503)
    separator = "&" if "?" in base_url else "?"
    url = "{}{}apikey={}".format(base_url, separator, quote(api_key, safe=""))
    timeout = aiohttp.ClientTimeout(total=int(app.config.get("TINODE_AUTH_TIMEOUT", 10)))

    async def receive_ctrl(socket, request_id):
        for _attempt in range(30):
            packet = await socket.receive_json()
            ctrl = packet.get("ctrl") or {}
            if str(ctrl.get("id") or "") != str(request_id):
                continue
            if int(ctrl.get("code") or 500) >= 300:
                raise AuthError("Tinode rejected access to the requested topic.", 409)
            return ctrl
        raise AuthError("Tinode did not confirm topic access.", 502)

    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.ws_connect(url, headers=_tinode_bridge_headers()) as socket:
            await socket.send_json({
                "hi": {
                    "id": "1",
                    "ver": "0.25",
                    "ua": "VICHAT-CHAT-SERVICE",
                    "platf": "server",
                    "lang": "vi",
                },
            })
            await receive_ctrl(socket, "1")
            await socket.send_json({
                "login": {"id": "2", "scheme": "token", "secret": token},
            })
            login_ctrl = await receive_ctrl(socket, "2")
            authenticated_uid = str((login_ctrl.get("params") or {}).get("user") or "")
            if expected_uid and authenticated_uid != str(expected_uid):
                raise AuthError("Tinode authenticated a different user.", 409)
            await socket.send_json({
                "sub": {
                    "id": "3",
                    "topic": topic_name,
                    "get": {"what": "desc sub"},
                },
            })
            await receive_ctrl(socket, "3")
            if not include_members:
                return None

            await socket.send_json({
                "get": {
                    "id": "4",
                    "topic": topic_name,
                    "what": "sub",
                },
            })
            actual_members = None
            for _attempt in range(60):
                packet = await socket.receive_json()
                meta = packet.get("meta") or {}
                if str(meta.get("id") or "") == "4":
                    subscriptions = meta.get("sub") or []
                    if isinstance(subscriptions, dict):
                        subscriptions = [subscriptions]
                    actual_members = {}
                    for subscription in subscriptions:
                        member_uid = str(
                            subscription.get("user") or subscription.get("topic") or ""
                        ).strip()
                        if not member_uid:
                            continue
                        access = subscription.get("acs") or {}
                        if not isinstance(access, dict):
                            access = {}
                        given = _tinode_access_mode(
                            access.get("given")
                            or subscription.get("given")
                            or subscription.get("modeGiven")
                        )
                        want = _tinode_access_mode(
                            access.get("want")
                            or subscription.get("want")
                            or subscription.get("modeWant")
                        )
                        mode = _tinode_access_mode(
                            access.get("mode") or subscription.get("mode")
                        )
                        if not mode and given and want:
                            mode = _tinode_effective_access(given, want)
                        actual_members[member_uid] = {
                            "mode": mode,
                            "given": given,
                            "want": want,
                        }
                    break
                ctrl = packet.get("ctrl") or {}
                if str(ctrl.get("id") or "") != "4":
                    continue
                if int(ctrl.get("code") or 500) >= 300:
                    raise AuthError("Tinode rejected the topic membership check.", 409)
                if int((ctrl.get("params") or {}).get("count") or -1) == 0:
                    actual_members = {}
                    break
            if actual_members is None:
                raise AuthError("Tinode did not return the topic membership.", 502)

            return actual_members if include_access else set(actual_members)


async def tinode_topic_member_access(token, expected_uid, topic_name):
    return await tinode_topic_member_uids(
        token,
        expected_uid,
        topic_name,
        include_access=True,
    )


async def tinode_verify_topic_access(token, expected_uid, topic_name, expected_member_uids=None):
    if expected_member_uids is None:
        await tinode_topic_member_uids(token, expected_uid, topic_name, include_members=False)
        return None

    actual_member_uids = await tinode_topic_member_uids(token, expected_uid, topic_name)
    expected = {str(uid) for uid in expected_member_uids if uid}
    if actual_member_uids != expected:
        raise AuthError("Tinode topic members do not match Chatmgt.", 409)
    return actual_member_uids


async def tinode_add_topic_members(
    token,
    expected_uid,
    topic_name,
    member_uids,
    mode="JRWPAS",
    return_created=False,
    known_existing_member_uids=None,
):
    base_url = str(app.config.get("TINODE_INTERNAL_WS_URL") or "").rstrip("?")
    api_key = str(app.config.get("TINODE_API_KEY") or "")
    members = list(dict.fromkeys(str(uid) for uid in member_uids if uid))
    known_existing = (
        {str(uid) for uid in known_existing_member_uids if uid}
        if known_existing_member_uids is not None
        else None
    )
    if not base_url or not api_key or not token:
        raise AuthError("Tinode topic membership is not configured.", 503)
    if not members:
        return []
    separator = "&" if "?" in base_url else "?"
    url = "{}{}apikey={}".format(base_url, separator, quote(api_key, safe=""))
    timeout = aiohttp.ClientTimeout(total=int(app.config.get("TINODE_AUTH_TIMEOUT", 10)))

    async def receive_ctrl(socket, request_id, accepted_codes=None):
        accepted = set(accepted_codes or ())
        for _attempt in range(30):
            packet = await socket.receive_json()
            ctrl = packet.get("ctrl") or {}
            if str(ctrl.get("id") or "") != str(request_id):
                continue
            code = int(ctrl.get("code") or 500)
            if code >= 300 and code not in accepted:
                raise AuthError(
                    ctrl.get("text") or "Tinode rejected the group membership update.",
                    409,
                )
            return ctrl
        raise AuthError("Tinode did not confirm the group membership update.", 502)

    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.ws_connect(url, headers=_tinode_bridge_headers()) as socket:
            await socket.send_json({"hi": {"id": "1", "ver": "0.25", "ua": "VICHAT-CHAT-SERVICE", "platf": "server", "lang": "vi"}})
            await receive_ctrl(socket, "1")
            await socket.send_json({"login": {"id": "2", "scheme": "token", "secret": token}})
            login_ctrl = await receive_ctrl(socket, "2")
            authenticated_uid = str((login_ctrl.get("params") or {}).get("user") or "")
            if expected_uid and authenticated_uid != str(expected_uid):
                raise AuthError("Tinode authenticated a different user.", 409)
            await socket.send_json({"sub": {"id": "3", "topic": topic_name, "get": {"what": "desc"}}})
            await receive_ctrl(socket, "3")
            updated = []
            created = []
            try:
                for index, member_uid in enumerate(members, start=4):
                    await socket.send_json({
                        "set": {
                            "id": str(index),
                            "topic": topic_name,
                            "sub": {"user": member_uid, "mode": mode},
                        },
                    })
                    ctrl = await receive_ctrl(socket, str(index), accepted_codes={304})
                    updated.append(member_uid)
                    if (
                        int(ctrl.get("code") or 500) < 300
                        and (known_existing is None or member_uid not in known_existing)
                    ):
                        created.append(member_uid)
            except AuthError:
                for rollback_index, member_uid in enumerate(reversed(created), start=100):
                    await socket.send_json({
                        "del": {
                            "id": str(rollback_index),
                            "topic": topic_name,
                            "what": "sub",
                            "user": member_uid,
                        },
                    })
                    try:
                        await receive_ctrl(
                            socket,
                            str(rollback_index),
                            accepted_codes={304, 404},
                        )
                    except AuthError:
                        pass
                raise
            return (updated, created) if return_created else updated


async def tinode_accept_topic_access(token, expected_uid, topic_name, mode="+JRWPAS"):
    """Update a member's requested mode from that member's own Tinode session."""
    base_url = str(app.config.get("TINODE_INTERNAL_WS_URL") or "").rstrip("?")
    api_key = str(app.config.get("TINODE_API_KEY") or "")
    if not base_url or not api_key or not token:
        raise AuthError("Tinode topic membership is not configured.", 503)
    separator = "&" if "?" in base_url else "?"
    url = "{}{}apikey={}".format(base_url, separator, quote(api_key, safe=""))
    timeout = aiohttp.ClientTimeout(total=int(app.config.get("TINODE_AUTH_TIMEOUT", 10)))

    async def receive_ctrl(socket, request_id, accepted_codes=None):
        accepted = set(accepted_codes or ())
        for _attempt in range(30):
            packet = await socket.receive_json()
            ctrl = packet.get("ctrl") or {}
            if str(ctrl.get("id") or "") != str(request_id):
                continue
            code = int(ctrl.get("code") or 500)
            if code >= 300 and code not in accepted:
                raise AuthError(
                    ctrl.get("text") or "Tinode rejected the membership acceptance.",
                    409,
                )
            return ctrl
        raise AuthError("Tinode did not confirm the membership acceptance.", 502)

    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.ws_connect(url, headers=_tinode_bridge_headers()) as socket:
            await socket.send_json({"hi": {"id": "1", "ver": "0.25", "ua": "VICHAT-CHAT-SERVICE", "platf": "server", "lang": "vi"}})
            await receive_ctrl(socket, "1")
            await socket.send_json({"login": {"id": "2", "scheme": "token", "secret": token}})
            login_ctrl = await receive_ctrl(socket, "2")
            authenticated_uid = str((login_ctrl.get("params") or {}).get("user") or "")
            if expected_uid and authenticated_uid != str(expected_uid):
                raise AuthError("Tinode authenticated a different user.", 409)
            await socket.send_json({
                "sub": {
                    "id": "3",
                    "topic": topic_name,
                    "set": {"sub": {"mode": mode}},
                    "get": {"what": "desc"},
                },
            })
            await receive_ctrl(socket, "3", accepted_codes={304})
            await socket.send_json({
                "set": {
                    "id": "4",
                    "topic": topic_name,
                    "sub": {"mode": mode},
                },
            })
            return await receive_ctrl(socket, "4", accepted_codes={304})


async def tinode_accept_topic_owner(token, expected_uid, topic_name, mode="JRWPASO"):
    """Accept an owner invitation from the replacement user's Tinode session."""
    return await tinode_accept_topic_access(token, expected_uid, topic_name, mode=mode)


async def tinode_remove_topic_member(token, expected_uid, topic_name, member_uid):
    base_url = str(app.config.get("TINODE_INTERNAL_WS_URL") or "").rstrip("?")
    api_key = str(app.config.get("TINODE_API_KEY") or "")
    target_uid = str(member_uid or "").strip()
    if not base_url or not api_key or not token:
        raise AuthError("Tinode topic membership is not configured.", 503)
    if not target_uid:
        raise AuthError("The Tinode member mapping is missing.", 409)
    separator = "&" if "?" in base_url else "?"
    url = "{}{}apikey={}".format(base_url, separator, quote(api_key, safe=""))
    timeout = aiohttp.ClientTimeout(total=int(app.config.get("TINODE_AUTH_TIMEOUT", 10)))

    async def receive_ctrl(socket, request_id, accepted_codes=None):
        accepted = set(accepted_codes or ())
        for _attempt in range(30):
            packet = await socket.receive_json()
            ctrl = packet.get("ctrl") or {}
            if str(ctrl.get("id") or "") != str(request_id):
                continue
            code = int(ctrl.get("code") or 500)
            if code >= 300 and code not in accepted:
                raise AuthError(
                    ctrl.get("text") or "Tinode rejected the group membership update.",
                    409,
                )
            return ctrl
        raise AuthError("Tinode did not confirm the group membership update.", 502)

    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.ws_connect(url, headers=_tinode_bridge_headers()) as socket:
            await socket.send_json({"hi": {"id": "1", "ver": "0.25", "ua": "VICHAT-CHAT-SERVICE", "platf": "server", "lang": "vi"}})
            await receive_ctrl(socket, "1")
            await socket.send_json({"login": {"id": "2", "scheme": "token", "secret": token}})
            login_ctrl = await receive_ctrl(socket, "2")
            authenticated_uid = str((login_ctrl.get("params") or {}).get("user") or "")
            if expected_uid and authenticated_uid != str(expected_uid):
                raise AuthError("Tinode authenticated a different user.", 409)
            await socket.send_json({"sub": {"id": "3", "topic": topic_name, "get": {"what": "desc"}}})
            await receive_ctrl(socket, "3")
            if target_uid == authenticated_uid:
                await socket.send_json({
                    "leave": {
                        "id": "4",
                        "topic": topic_name,
                        "unsub": True,
                    },
                })
            else:
                await socket.send_json({
                    "del": {
                        "id": "4",
                        "topic": topic_name,
                        "what": "sub",
                        "user": target_uid,
                    },
                })
            await receive_ctrl(socket, "4", accepted_codes={304, 404})
            return target_uid


async def tinode_dissolve_topic(token, expected_uid, topic_name, member_uids):
    """Remove every subscription from a group, leaving the owner for last."""
    members = list(dict.fromkeys(str(uid).strip() for uid in (member_uids or []) if str(uid).strip()))
    owner_uid = str(expected_uid or "").strip()
    if not owner_uid or owner_uid not in members:
        raise AuthError("The group owner mapping is missing.", 409)

    removed = []
    try:
        for member_uid in [uid for uid in members if uid != owner_uid] + [owner_uid]:
            await tinode_remove_topic_member(token, owner_uid, topic_name, member_uid)
            removed.append(member_uid)
    except Exception:
        # The owner remains subscribed until the final operation, so a
        # partial failure can restore the removed members before retrying.
        if owner_uid not in removed:
            for member_uid in reversed(removed):
                try:
                    await tinode_add_topic_members(
                        token,
                        owner_uid,
                        topic_name,
                        [member_uid],
                        mode="JRWPAS",
                    )
                except Exception:
                    logger.warning("Could not restore Tinode member %s after dissolve failure.", member_uid)
        raise
    return removed


async def tinode_reconcile_topic_members(
    token,
    expected_uid,
    topic_name,
    expected_member_uids,
    max_attempts=4,
    expected_access_modes=None,
    member_tokens=None,
    remove_extra_members=True,
    access_scope_uids=None,
):
    """Make a management-owned topic match Chatmgt after a membership change."""
    expected = {str(uid) for uid in expected_member_uids if uid}
    if not expected:
        raise AuthError("The Chatmgt topic membership is empty.", 409)
    required_modes = {
        member_uid: "JRWPASO" if member_uid == str(expected_uid) else "JRWPAS"
        for member_uid in expected
    }
    required_modes.update({
        str(uid): _tinode_access_mode(mode)
        for uid, mode in dict(expected_access_modes or {}).items()
        if uid and _tinode_access_mode(mode)
    })
    access_tokens = {
        str(uid): str(value or "").strip()
        for uid, value in dict(member_tokens or {}).items()
        if uid and value
    }
    access_scope = (
        expected
        if access_scope_uids is None
        else expected & {str(uid) for uid in access_scope_uids if uid}
    )
    membership_scope = expected if remove_extra_members else access_scope

    attempts = max(1, int(max_attempts))
    for attempt in range(attempts):
        access_by_uid = await tinode_topic_member_access(token, expected_uid, topic_name)
        actual = set(access_by_uid)
        access_mismatches = {
            member_uid: required_mode
            for member_uid, required_mode in required_modes.items()
            if member_uid in expected
            and member_uid in access_scope
            and member_uid in actual
            and not set(required_mode).issubset(
                set(_tinode_access_mode((access_by_uid.get(member_uid) or {}).get("mode")))
            )
        }
        membership_matches = (
            actual == expected
            if remove_extra_members
            else membership_scope.issubset(actual)
        )
        if membership_matches and not access_mismatches:
            return actual

        extra = sorted(actual - expected) if remove_extra_members else []
        missing = sorted(membership_scope - actual)
        if str(expected_uid) in extra:
            raise AuthError("Tinode authenticated a user outside Chatmgt membership.", 409)
        for member_uid in extra:
            await tinode_remove_topic_member(token, expected_uid, topic_name, member_uid)
        if str(expected_uid) in missing:
            await tinode_accept_topic_access(
                access_tokens.get(str(expected_uid)) or token,
                expected_uid,
                topic_name,
                mode=required_modes.get(str(expected_uid), "JRWPASO"),
            )
            missing.remove(str(expected_uid))
        for member_uid in missing:
            required_mode = required_modes.get(member_uid, "JRWPAS")
            await tinode_add_topic_members(
                token,
                expected_uid,
                topic_name,
                [member_uid],
                mode=required_mode,
            )
            target_token = access_tokens.get(member_uid)
            if target_token:
                await tinode_accept_topic_access(
                    target_token,
                    member_uid,
                    topic_name,
                    mode="+{}".format(required_mode),
                )
        for member_uid, required_mode in sorted(access_mismatches.items()):
            member_access = access_by_uid.get(member_uid) or {}
            missing_given = _tinode_missing_access(required_mode, member_access.get("given"))
            missing_want = _tinode_missing_access(required_mode, member_access.get("want"))
            if missing_given and member_uid != str(expected_uid):
                await tinode_add_topic_members(
                    token,
                    expected_uid,
                    topic_name,
                    [member_uid],
                    mode="+{}".format(missing_given),
                )
            if missing_want and member_uid == str(expected_uid):
                await tinode_accept_topic_access(
                    access_tokens.get(member_uid) or token,
                    member_uid,
                    topic_name,
                    mode="+{}".format(missing_want),
                )
                continue
            target_token = access_tokens.get(member_uid)
            if missing_want and target_token:
                await tinode_accept_topic_access(
                    target_token,
                    member_uid,
                    topic_name,
                    mode="+{}".format(missing_want),
                )
        if attempt + 1 < attempts:
            await asyncio.sleep(0.1 * (attempt + 1))

    raise AuthError("Tinode topic members or access modes do not match Chatmgt.", 409)


async def tinode_publish_system_event(token, expected_uid, topic_name, event):
    """Publish a membership event through a surviving group member."""
    base_url = str(app.config.get("TINODE_INTERNAL_WS_URL") or "").rstrip("?")
    api_key = str(app.config.get("TINODE_API_KEY") or "")
    if not base_url or not api_key or not token:
        raise AuthError("Tinode topic membership is not configured.", 503)
    separator = "&" if "?" in base_url else "?"
    url = "{}{}apikey={}".format(base_url, separator, quote(api_key, safe=""))
    timeout = aiohttp.ClientTimeout(total=int(app.config.get("TINODE_AUTH_TIMEOUT", 10)))

    async def receive_ctrl(socket, request_id):
        for _attempt in range(30):
            packet = await socket.receive_json()
            ctrl = packet.get("ctrl") or {}
            if str(ctrl.get("id") or "") != str(request_id):
                continue
            if int(ctrl.get("code") or 500) >= 300:
                raise AuthError(
                    ctrl.get("text") or "Tinode rejected the group event.",
                    409,
                )
            return ctrl
        raise AuthError("Tinode did not confirm the group event.", 502)

    content = "__VICHAT_SYSTEM_EVENT__:{}".format(
        json.dumps(event or {}, ensure_ascii=False, separators=(",", ":"))
    )
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.ws_connect(url, headers=_tinode_bridge_headers()) as socket:
            await socket.send_json({"hi": {"id": "1", "ver": "0.25", "ua": "VICHAT-CHAT-SERVICE", "platf": "server", "lang": "vi"}})
            await receive_ctrl(socket, "1")
            await socket.send_json({"login": {"id": "2", "scheme": "token", "secret": token}})
            login_ctrl = await receive_ctrl(socket, "2")
            authenticated_uid = str((login_ctrl.get("params") or {}).get("user") or "")
            if expected_uid and authenticated_uid != str(expected_uid):
                raise AuthError("Tinode authenticated a different user.", 409)
            await socket.send_json({
                "pub": {
                    "id": "3",
                    "topic": topic_name,
                    "content": content,
                },
            })
            return await receive_ctrl(socket, "3")


async def tinode_change_password(username, current_password, new_password, new_username=None):
    """Rotate a Tinode basic credential without exposing either secret to the client."""
    base_url = str(app.config.get("TINODE_INTERNAL_WS_URL") or "").rstrip("?")
    api_key = str(app.config.get("TINODE_API_KEY") or "")
    if not base_url or not api_key:
        raise AuthError("Tinode authentication is not configured.", 503)
    separator = "&" if "?" in base_url else "?"
    url = "{}{}apikey={}".format(base_url, separator, quote(api_key, safe=""))
    timeout = aiohttp.ClientTimeout(total=int(app.config.get("TINODE_AUTH_TIMEOUT", 10)))
    current_secret = base64.b64encode("{}:{}".format(username, current_password).encode("utf-8")).decode("ascii")
    new_secret = base64.b64encode(
        "{}:{}".format(new_username or username, new_password).encode("utf-8")
    ).decode("ascii")
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.ws_connect(url, headers=_tinode_bridge_headers()) as socket:
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
            return {
                "uid": uid,
                "username": str(new_username or username),
            }


async def tinode_admin_reset_password(username, uid, new_password):
    base_url = str(app.config.get("TINODE_INTERNAL_WS_URL") or "").rstrip("?")
    api_key = str(app.config.get("TINODE_API_KEY") or "")
    admin_username = str(app.config.get("TINODE_ADMIN_USERNAME") or "")
    admin_password = str(app.config.get("TINODE_ADMIN_PASSWORD") or "")
    if not base_url or not api_key:
        raise AuthError("Tinode authentication is not configured.", 503)
    if not admin_username or not admin_password:
        raise AuthError("Tinode administrator credentials are not configured.", 503)
    target_user = str(uid or username or "").strip()
    if not target_user:
        raise AuthError("The account has no Tinode user mapping.", 409)

    separator = "&" if "?" in base_url else "?"
    url = "{}{}apikey={}".format(base_url, separator, quote(api_key, safe=""))
    timeout = aiohttp.ClientTimeout(total=int(app.config.get("TINODE_AUTH_TIMEOUT", 10)))
    admin_secret = base64.b64encode(
        "{}:{}".format(admin_username, admin_password).encode("utf-8")
    ).decode("ascii")
    new_secret = base64.b64encode(
        "{}:{}".format(username, new_password).encode("utf-8")
    ).decode("ascii")
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.ws_connect(url, headers=_tinode_bridge_headers()) as socket:
            await socket.send_json({"hi": {"id": "1", "ver": "0.25", "ua": "VICHAT-CHAT-SERVICE", "platf": "server", "lang": "vi"}})
            hi = await socket.receive_json()
            if hi.get("ctrl", {}).get("code", 500) >= 300:
                raise AuthError("Tinode handshake failed.", 502)
            await socket.send_json({"login": {"id": "2", "scheme": "basic", "secret": admin_secret}})
            login = await socket.receive_json()
            login_ctrl = login.get("ctrl") or {}
            if login_ctrl.get("code", 500) >= 300:
                raise AuthError("Tinode administrator login failed.", 502)
            await socket.send_json({
                "acc": {
                    "id": "3",
                    "user": target_user,
                    "scheme": "basic",
                    "secret": new_secret,
                    "login": False,
                },
            })
            updated = await socket.receive_json()
            ctrl = updated.get("ctrl") or {}
            if ctrl.get("code", 500) >= 300:
                raise AuthError(ctrl.get("text") or "Tinode password reset failed.", 400)
            return {"uid": uid}
