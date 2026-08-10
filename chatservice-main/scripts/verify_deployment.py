"""Verify database revision, credentials, CORS, login, and logout."""

import argparse
import asyncio
import json
import os
import re
import secrets
import sys
import time
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import quote, urlparse, urlunparse

import aiohttp
import bcrypt
import requests
from alembic.config import Config as AlembicConfig
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from application.services.auth_service import issue_access_token, tinode_login
from application.services.sso_identity import (
    derive_tinode_password,
    stable_local_account_id,
    stable_tinode_username,
)


DEFAULT_PASSWORDS = ("123456", "password", "admin")
MANAGEMENT_HEADER = {"X-Vichat-Session-Scope": "management"}
ACCOUNT_SSO_PASSWORD_MARKER = "!account-sso-only"


def require_secret(name, minimum=32):
    value = str(os.getenv(name) or "")
    if len(value) < minimum or value.startswith("replace-with-"):
        raise RuntimeError("{} is missing or too short.".format(name))


def configured_origin():
    raw = str(os.getenv("CHAT_CORS_ORIGINS") or "")
    try:
        values = json.loads(raw)
    except (TypeError, ValueError):
        values = [item.strip() for item in raw.split(",") if item.strip()]
    if not isinstance(values, list) or not values:
        raise RuntimeError("CHAT_CORS_ORIGINS must contain at least one origin.")
    return str(values[0])


def is_account_projection(row):
    properties = row.properties if isinstance(row.properties, dict) else {}
    return properties.get("auth_source") == "account"


def verify_account_password_policy(accounts, admin_account_sso_enabled=False):
    if not accounts:
        raise RuntimeError("Chatmgt has no administrator account.")
    active_account_admins = [
        row for row in accounts
        if row.role == "admin" and row.active and is_account_projection(row)
    ]
    active_local_admins = [
        row for row in accounts
        if row.role == "admin" and row.active and not is_account_projection(row)
    ]
    if admin_account_sso_enabled:
        if not active_account_admins:
            raise RuntimeError("Chatmgt has no active UpGO Account administrator projection.")
        if active_local_admins:
            raise RuntimeError("Chatmgt still has an active local administrator account.")
    elif not active_local_admins:
        raise RuntimeError("Chatmgt has no active local administrator account.")

    insecure_users = []
    for row in accounts:
        password_hash = str(row.password_hash or "")
        if is_account_projection(row):
            if password_hash != ACCOUNT_SSO_PASSWORD_MARKER:
                raise RuntimeError(
                    "Account projection {} has an unexpected password state.".format(row.username)
                )
            continue
        if not row.active:
            continue

        encoded_hash = password_hash.encode("ascii", errors="ignore")
        for password in DEFAULT_PASSWORDS:
            try:
                if bcrypt.checkpw(password.encode("utf-8"), encoded_hash):
                    insecure_users.append(row.username)
                    break
            except ValueError:
                raise RuntimeError("Account {} has an invalid password hash.".format(row.username))
    if insecure_users:
        raise RuntimeError(
            "Default passwords are still active for: {}.".format(", ".join(sorted(insecure_users)))
        )


def verify_database(alembic_ini):
    require_secret("APP_SECRET_KEY")
    require_secret("AUTH_PASSWORD_SALT", minimum=16)
    require_secret("SESSION_COOKIE_SALT")
    require_secret("CHAT_AUTH_JWT_SECRET")
    require_secret("TINODE_SSO_SECRET")
    tinode_token_ttl = int(os.getenv("TINODE_TOKEN_EXPIRE_IN", 300))
    if tinode_token_ttl < 60 or tinode_token_ttl > 900:
        raise RuntimeError("TINODE_TOKEN_EXPIRE_IN must be between 60 and 900 seconds.")
    central_token_max_ttl = int(os.getenv("TINODE_CENTRAL_TOKEN_MAX_TTL", tinode_token_ttl))
    if central_token_max_ttl < 60 or central_token_max_ttl > 2592000:
        raise RuntimeError(
            "TINODE_CENTRAL_TOKEN_MAX_TTL must be between 60 and 2592000 seconds."
        )

    database_uri = str(os.getenv("SQLALCHEMY_DATABASE_URI") or "")
    if not database_uri:
        raise RuntimeError("SQLALCHEMY_DATABASE_URI is required.")

    alembic_config = AlembicConfig(alembic_ini)
    expected_heads = set(ScriptDirectory.from_config(alembic_config).get_heads())
    engine = create_engine(database_uri)
    try:
        with engine.connect() as connection:
            current_heads = {
                row[0]
                for row in connection.execute(text("SELECT version_num FROM alembic_version"))
            }
            if current_heads != expected_heads:
                raise RuntimeError(
                    "Alembic revision mismatch: current={} expected={}.".format(
                        sorted(current_heads), sorted(expected_heads)
                    )
                )

            workspace_schema = connection.execute(text(
                "SELECT "
                "to_regclass('public.enterprise_item'), "
                "to_regclass('public.enterprise_item_participant'), "
                "to_regclass('public.enterprise_activity'), "
                "to_regclass('public.uq_enterprise_item_participant_active')"
            )).first()
            if workspace_schema is None or any(value is None for value in workspace_schema):
                raise RuntimeError("Enterprise Workspace schema or tenant participant index is missing.")

            accounts = list(connection.execute(text(
                "SELECT username, password_hash, role, active, properties FROM management_account"
            )))
    finally:
        engine.dispose()

    verify_account_password_policy(
        accounts,
        admin_account_sso_enabled=(
            str(os.getenv("CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED") or "").lower() == "true"
        ),
    )

    if str(os.getenv("ENVIRONMENT") or "").lower() == "production":
        if str(os.getenv("CHAT_AUTH_COOKIE_SECURE") or "").lower() != "true":
            raise RuntimeError("Production requires CHAT_AUTH_COOKIE_SECURE=true.")

    print("Database revision and credential policy are valid.")


def cookie_from_response(response, cookie_name):
    cookie_header = response.headers.get("Set-Cookie") or ""
    cookie = SimpleCookie()
    cookie.load(cookie_header)
    morsel = cookie.get(cookie_name)
    if morsel is None:
        raise RuntimeError("Login did not return the {} cookie.".format(cookie_name))
    return morsel.value, cookie_header


def parse_tinode_expiry(expires):
    if isinstance(expires, (int, float)):
        return datetime.fromtimestamp(float(expires), timezone.utc)

    value = str(expires).strip()
    fractional = re.match(r"^(.*:\d{2})\.(\d+)(Z|[+-]\d{2}:\d{2})$", value)
    if fractional:
        # Python 3.9 only accepts microseconds, while Tinode may emit any
        # RFC3339 fractional-second precision (for example, `.9Z`).
        fraction = (fractional.group(2) + "000000")[:6]
        value = "{}.{}{}".format(fractional.group(1), fraction, fractional.group(3))
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"

    expires_at = datetime.fromisoformat(value)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at


def verify_tinode_token_expiry(login_payload):
    expires = ((login_payload.get("tinode_auth") or {}).get("expires"))
    if not expires:
        raise RuntimeError("Login did not return the Tinode token expiration time.")
    try:
        expires_at = parse_tinode_expiry(expires)
        remaining = (expires_at - datetime.now(timezone.utc)).total_seconds()
    except (TypeError, ValueError, OverflowError) as error:
        raise RuntimeError("Tinode returned an invalid token expiration time.") from error
    configured_ttl = int(
        os.getenv("TINODE_CENTRAL_TOKEN_MAX_TTL", os.getenv("TINODE_TOKEN_EXPIRE_IN", 300))
    )
    if remaining < 30 or remaining > configured_ttl + 30:
        raise RuntimeError(
            "Tinode token lifetime is outside the configured short-lived window."
        )


async def _receive_tinode_ctrl(socket, request_id):
    for _attempt in range(30):
        packet = await socket.receive_json()
        ctrl = packet.get("ctrl") or {}
        if str(ctrl.get("id") or "") == str(request_id):
            if int(ctrl.get("code") or 500) >= 300:
                raise RuntimeError("Tinode rejected verifier request {}.".format(request_id))
            return ctrl
    raise RuntimeError("Tinode did not acknowledge verifier request {}.".format(request_id))


def _tinode_url(base_url, api_key):
    separator = "&" if "?" in base_url else "?"
    return "{}{}apikey={}".format(base_url, separator, quote(api_key, safe=""))


async def _verify_tinode_socket(url, api_key, token, expected_uid, origin=None, publish=False):
    timeout = aiohttp.ClientTimeout(total=30)
    created_topic = None
    headers = {"Origin": origin} if origin else None
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.ws_connect(_tinode_url(url, api_key), headers=headers) as socket:
            await socket.send_json({
                "hi": {
                    "id": "1",
                    "ver": "0.25",
                    "ua": "VICHAT-DEPLOYMENT-VERIFIER",
                    "platf": "server",
                    "lang": "vi",
                },
            })
            await _receive_tinode_ctrl(socket, "1")
            await socket.send_json({
                "login": {"id": "2", "scheme": "token", "secret": token},
            })
            login_ctrl = await _receive_tinode_ctrl(socket, "2")
            if expected_uid and str((login_ctrl.get("params") or {}).get("user") or "") != expected_uid:
                raise RuntimeError("Tinode token authenticated as a different user.")
            await socket.send_json({
                "sub": {"id": "3", "topic": "me", "get": {"what": "desc sub"}},
            })
            await _receive_tinode_ctrl(socket, "3")

            if not publish:
                return
            try:
                await socket.send_json({
                    "sub": {
                        "id": "4",
                        "topic": "new",
                        "set": {
                            "desc": {
                                "public": {"fn": "VICHAT deployment verification"},
                                "defacs": {"auth": "N", "anon": "N"},
                            },
                        },
                    },
                })
                created_ctrl = await _receive_tinode_ctrl(socket, "4")
                created_topic = str(
                    created_ctrl.get("topic")
                    or (created_ctrl.get("params") or {}).get("topic")
                    or ""
                )
                if not created_topic.startswith("grp"):
                    raise RuntimeError("Tinode did not create a private verification topic.")
                await socket.send_json({
                    "pub": {
                        "id": "5",
                        "topic": created_topic,
                        "noecho": True,
                        "content": "VICHAT deployment verification",
                    },
                })
                await _receive_tinode_ctrl(socket, "5")
            finally:
                if created_topic:
                    await socket.send_json({
                        "del": {
                            "id": "6",
                            "topic": created_topic,
                            "what": "topic",
                            "hard": True,
                        },
                    })
                    await _receive_tinode_ctrl(socket, "6")


def verify_tinode_websocket(login_payload, origin):
    tinode_auth = login_payload.get("tinode_auth") or {}
    token = str(tinode_auth.get("token") or "")
    expected_uid = str(tinode_auth.get("uid") or "")
    api_key = str(os.getenv("TINODE_API_KEY") or "")
    internal_url = str(os.getenv("TINODE_INTERNAL_WS_URL") or "")
    if not token or not expected_uid or not api_key or not internal_url:
        raise RuntimeError("Tinode WebSocket verification is not configured.")
    if internal_url != "ws://chat:80/v0/channels":
        raise RuntimeError(
            "Tinode WebSocket is not routed through the central web.vichat.net relay."
        )

    asyncio.run(_verify_tinode_socket(
        internal_url,
        api_key,
        token,
        expected_uid,
        publish=True,
    ))
    parsed_origin = urlparse(origin)
    public_url = urlunparse((
        "wss" if parsed_origin.scheme == "https" else "ws",
        parsed_origin.netloc,
        "/v0/channels",
        "",
        "",
        "",
    ))
    asyncio.run(_verify_tinode_socket(
        public_url,
        api_key,
        token,
        expected_uid,
        origin=origin,
        publish=False,
    ))


def create_management_verifier_account():
    database_uri = str(os.getenv("SQLALCHEMY_DATABASE_URI") or "")
    tenant_id = str(os.getenv("CHATMGT_DEFAULT_TENANT") or "").strip()
    if not database_uri or not tenant_id:
        raise RuntimeError("Management verifier database settings are missing.")
    username = "deployment_verifier"
    account_id = stable_local_account_id(tenant_id, username)
    tinode_username = stable_tinode_username(tenant_id, account_id)
    password = secrets.token_urlsafe(24)
    password_hash = ACCOUNT_SSO_PASSWORD_MARKER
    now = int(time.time())
    engine = create_engine(database_uri)
    try:
        with engine.begin() as connection:
            connection.execute(text("""
                DELETE FROM security_audit_log
                WHERE tenant_id = :tenant_id AND user_id = :id
            """), {"tenant_id": tenant_id, "id": account_id})
            connection.execute(text("""
                DELETE FROM management_account
                WHERE id = :id
                  AND tenant_id = :tenant_id
                  AND properties ->> 'deployment_verifier' = 'true'
            """), {"id": account_id, "tenant_id": tenant_id})
            connection.execute(text("""
                INSERT INTO management_account (
                    id, tenant_id, username, email, password_hash, full_name,
                    role, department, title, avatar, tinode_username, tinode_uid,
                    active, created_at, updated_at, last_login_at, properties
                ) VALUES (
                    :id, :tenant_id, :username, NULL, :password_hash, :full_name,
                    'admin', '', 'Deployment verifier', '', :tinode_username, NULL,
                    TRUE, :created_at, :updated_at, NULL,
                    CAST(:properties AS jsonb)
                )
            """), {
                "id": account_id,
                "tenant_id": tenant_id,
                "username": username,
                "password_hash": password_hash,
                "full_name": "Chatmgt deployment verifier",
                "tinode_username": tinode_username,
                "created_at": now,
                "updated_at": now,
                "properties": json.dumps({
                    "deployment_verifier": True,
                    "auth_source": "account",
                    "account_user_id": account_id,
                    "account_tenant_id": tenant_id,
                    "auth_version": 0,
                }),
            })
    finally:
        engine.dispose()
    account_projection = SimpleNamespace(
        id=account_id,
        tenant_id=tenant_id,
        username=username,
        role="admin",
        properties={
            "deployment_verifier": True,
            "auth_source": "account",
            "account_user_id": account_id,
            "account_tenant_id": tenant_id,
            "auth_version": 0,
        },
    )
    token = issue_access_token(
        account_projection,
        auth_method="password",
        session_scope="management",
    )
    chat_token = issue_access_token(
        account_projection,
        auth_method="password",
        session_scope="chat",
    )
    return {
        "id": account_id,
        "tenant_id": tenant_id,
        "username": username,
        "password": password,
        "token": token,
        "chat_token": chat_token,
    }


def delete_management_verifier_account(account):
    if not account:
        return
    database_uri = str(os.getenv("SQLALCHEMY_DATABASE_URI") or "")
    if not database_uri:
        return
    engine = create_engine(database_uri)
    try:
        with engine.begin() as connection:
            connection.execute(text("""
                DELETE FROM security_audit_log
                WHERE tenant_id = :tenant_id AND user_id = :account_id
            """), {
                "tenant_id": account["tenant_id"],
                "account_id": account["id"],
            })
            connection.execute(text("""
                DELETE FROM management_account
                WHERE id = :account_id
                  AND tenant_id = :tenant_id
                  AND properties ->> 'deployment_verifier' = 'true'
            """), {
                "tenant_id": account["tenant_id"],
                "account_id": account["id"],
            })
    finally:
        engine.dispose()


def _verify_http(base_url, origin, management_account):
    base_url = base_url.rstrip("/")
    health = requests.get(
        base_url + "/api/v1/auth/health",
        headers={"Origin": origin},
        timeout=10,
    )
    if health.status_code != 200:
        raise RuntimeError("Chatmgt health check returned HTTP {}.".format(health.status_code))
    if health.headers.get("Access-Control-Allow-Origin") != origin:
        raise RuntimeError("Chatmgt did not return the configured CORS origin.")
    if str(health.headers.get("Access-Control-Allow-Credentials") or "").lower() != "true":
        raise RuntimeError("Chatmgt CORS credentials are not enabled.")
    health_payload = health.json()
    employee_auth = health_payload.get("employee_auth") or {}
    if not employee_auth.get("configured"):
        raise RuntimeError("Chatmgt employee authentication is not fully configured.")
    account_sso = health_payload.get("account_sso") or {}
    account_sso_enabled = bool(account_sso.get("enabled"))
    credential_login_enabled = bool(account_sso.get("credential_login_enabled"))
    if account_sso_enabled and not account_sso.get("configured"):
        raise RuntimeError("UpGO Account SSO is enabled but not fully configured.")
    if account_sso_enabled and not account_sso.get("directory_configured"):
        raise RuntimeError("UpGO Account directory sync is not fully configured.")
    if account_sso_enabled and not account_sso.get("tinode_bridge_configured"):
        raise RuntimeError("Chatmgt-to-Tinode realtime bridge is not fully configured.")
    expected_employee_login_endpoint = (
        "/api/v1/auth/account-login"
        if credential_login_enabled
        else ("/api/v1/auth/sso" if account_sso_enabled else "/api/v1/auth/login")
    )
    if employee_auth.get("login_endpoint") != expected_employee_login_endpoint:
        raise RuntimeError("Chatmgt employee login endpoint does not match its Account mode.")
    mirror_enabled = str(
        os.getenv("TINODE_MIRROR_LOCAL_CREDENTIALS") or ""
    ).lower() == "true"
    if mirror_enabled and not account_sso_enabled and not account_sso.get("local_credentials_mirrored"):
        raise RuntimeError("Chatmgt did not enable local Tinode credential mirroring.")
    management_data = health_payload.get("management_data") or {}
    if not management_data.get("configured"):
        raise RuntimeError("Chatmgt management data APIs are not fully configured.")
    management_session = health_payload.get("management_session") or {}
    if not management_session.get("isolated"):
        raise RuntimeError("Chatmgt management sessions are not isolated.")
    if not management_session.get("cookie_secure"):
        raise RuntimeError("Chatmgt management cookies are not secure.")
    admin_account_sso_enabled = bool(management_session.get("account_sso_enabled"))
    if not management_session.get("configured"):
        raise RuntimeError("Chatmgt management authentication is not fully configured.")
    if admin_account_sso_enabled:
        if management_session.get("login_endpoint") != "/api/v1/admin/sso":
            raise RuntimeError("Chatmgt management Account SSO endpoint is incorrect.")
        if management_session.get("local_password_login_enabled"):
            raise RuntimeError("Chatmgt local administrator password login is still enabled.")
        if management_session.get("password_owner") != "account":
            raise RuntimeError("UpGO Account is not reported as the administrator password owner.")

    username = management_account["username"]
    password = management_account["password"]
    tenant_id = str(os.getenv("CHATMGT_DEFAULT_TENANT") or "").strip()
    rejected_login = requests.post(
        base_url + "/api/v1/auth/login",
        json={"identity": username, "password": password + "-invalid", "tenant_id": tenant_id},
        headers={"Origin": origin},
        timeout=20,
    )
    expected_rejected_status = 403 if account_sso_enabled else 401
    if rejected_login.status_code != expected_rejected_status:
        raise RuntimeError("Employee password rejection returned HTTP {}; expected {}.".format(
            rejected_login.status_code,
            expected_rejected_status,
        ))
    if account_sso_enabled and str((rejected_login.json() or {}).get("error_code") or "") != "AUTH_METHOD_DISABLED":
        raise RuntimeError("Employee password login was not rejected with AUTH_METHOD_DISABLED.")

    management_login = requests.post(
        base_url + "/login",
        json={
            "identity": management_account["username"],
            "password": management_account["password"],
            "tenant_id": management_account["tenant_id"],
        },
        headers=dict(MANAGEMENT_HEADER, Origin=origin),
        timeout=20,
    )
    if admin_account_sso_enabled:
        management_login_payload = management_login.json() if management_login.content else {}
        if (
            management_login.status_code != 403
            or management_login_payload.get("error_code") != "AUTH_METHOD_DISABLED"
        ):
            raise RuntimeError("Local management administrator login was not disabled.")
    elif management_login.status_code != 200:
        raise RuntimeError("Management administrator login returned HTTP {}.".format(management_login.status_code))
    management_token = management_account["token"]
    management_profile = requests.get(
        base_url + "/api/v1/auth/me",
        headers=dict(
            MANAGEMENT_HEADER,
            Origin=origin,
            Cookie="vichat_management_access_token={}".format(management_token),
        ),
        timeout=10,
    )
    if management_profile.status_code != 200:
        raise RuntimeError("Management profile check returned HTTP {}.".format(management_profile.status_code))

    crossed_scope_profile = requests.get(
        base_url + "/api/v1/auth/me",
        headers={
            "Origin": origin,
            "Cookie": "vichat_access_token={}".format(management_token),
        },
        timeout=10,
    )
    if crossed_scope_profile.status_code not in (401, 403):
        raise RuntimeError("A management token was accepted as a Chat user session.")

    crossed_scope_admin = requests.get(
        base_url + "/api/v1/admin/conversations",
        headers={
            "Origin": origin,
            "Cookie": "vichat_access_token={}".format(management_account["chat_token"]),
        },
        timeout=10,
    )
    if crossed_scope_admin.status_code != 403:
        raise RuntimeError("A Chat token was accepted by the management control plane.")

    management_headers = dict(
        MANAGEMENT_HEADER,
        Origin=origin,
        Cookie="vichat_management_access_token={}".format(management_token),
    )
    management_conversations = requests.get(
        base_url + "/api/v1/admin/conversations",
        headers=management_headers,
        timeout=10,
    )
    management_conversation_payload = (
        management_conversations.json() if management_conversations.content else {}
    )
    if (
        management_conversations.status_code != 403
        or management_conversation_payload.get("error_code") != "MANAGEMENT_CHAT_METADATA_HIDDEN"
    ):
        raise RuntimeError("Management control plane exposed conversation metadata.")

    if account_sso_enabled:
        sso_challenge = requests.post(
            base_url + "/api/v1/auth/sso",
            headers={"Origin": origin},
            timeout=20,
        )
        challenge_payload = sso_challenge.json() if sso_challenge.content else {}
        if sso_challenge.status_code != 401 or challenge_payload.get("error_code") != "ACCOUNT_LOGIN_REQUIRED":
            raise RuntimeError("Account SSO without a session did not return ACCOUNT_LOGIN_REQUIRED.")

    if credential_login_enabled:
        account_credential_challenge = requests.post(
            base_url + "/api/v1/auth/account-login",
            json={},
            headers={"Origin": origin},
            timeout=20,
        )
        credential_payload = (
            account_credential_challenge.json()
            if account_credential_challenge.content
            else {}
        )
        if (
            account_credential_challenge.status_code != 400
            or credential_payload.get("error_code") != "ACCOUNT_CREDENTIALS_REQUIRED"
        ):
            raise RuntimeError("Account credential login did not validate empty credentials locally.")

    if admin_account_sso_enabled:
        admin_sso_challenge = requests.post(
            base_url + "/api/v1/admin/sso",
            headers=dict(MANAGEMENT_HEADER, Origin=origin),
            timeout=20,
        )
        admin_challenge_payload = (
            admin_sso_challenge.json() if admin_sso_challenge.content else {}
        )
        if (
            admin_sso_challenge.status_code != 401
            or admin_challenge_payload.get("error_code") != "ACCOUNT_LOGIN_REQUIRED"
        ):
            raise RuntimeError(
                "Management Account SSO without a session did not require Account login."
            )

    management_tinode = requests.post(
        base_url + "/api/v1/auth/tinode-token",
        headers=management_headers,
        timeout=10,
    )
    if management_tinode.status_code not in (401, 403):
        raise RuntimeError("A management administrator received a Chat Tinode token.")

    if account_sso_enabled:
        # A real Account cookie cannot be fabricated by this container-only verifier.
        # Use the short-lived internal chat token to validate the protected contract.
        login_payload = {
            "user": {"id": management_account["id"]},
            "tenant_id": tenant_id,
            "tenant": {"id": tenant_id},
        }
        token = management_account["chat_token"]
        cookie_header = ""
    else:
        login = requests.post(
            base_url + "/api/v1/auth/login",
            json={"identity": username, "password": password, "tenant_id": tenant_id},
            headers={"Origin": origin},
            timeout=20,
        )
        if login.status_code != 200:
            raise RuntimeError("Chat employee login returned HTTP {}.".format(login.status_code))
        login_payload = login.json()
        serialized_login = json.dumps(login_payload, separators=(",", ":")).lower()
        if '"password"' in serialized_login or '"password_hash"' in serialized_login:
            raise RuntimeError("Chat employee login exposed password material.")
        token, cookie_header = cookie_from_response(login, "vichat_access_token")
        if str(os.getenv("CHAT_AUTH_COOKIE_SECURE") or "").lower() == "true":
            if "secure" not in cookie_header.lower():
                raise RuntimeError("Production login cookie is missing the Secure attribute.")

    authenticated_headers = {
        "Origin": origin,
        "Cookie": "vichat_access_token={}".format(token),
    }
    profile = requests.get(
        base_url + "/api/v1/auth/me",
        headers=authenticated_headers,
        timeout=10,
    )
    if profile.status_code != 200:
        raise RuntimeError("Authenticated profile check returned HTTP {}.".format(profile.status_code))

    tinode_token_response = requests.post(
        base_url + "/api/v1/auth/tinode-token",
        headers=authenticated_headers,
        timeout=20,
    )
    if tinode_token_response.status_code != 200:
        raise RuntimeError("Chat employee Tinode token refresh returned HTTP {}.".format(
            tinode_token_response.status_code,
        ))
    login_payload["tinode_auth"] = tinode_token_response.json().get("tinode_auth")
    verify_tinode_token_expiry(login_payload)
    if mirror_enabled and not account_sso_enabled:
        basic_auth = asyncio.run(tinode_login(username, password))
        expected_uid = str((login_payload.get("tinode_auth") or {}).get("uid") or "")
        if not expected_uid or str(basic_auth.get("uid") or "") != expected_uid:
            raise RuntimeError(
                "The Chatmgt employee credential did not open the mapped Tinode UID."
            )

    expected_user_id = str(((login_payload.get("user") or {}).get("id")) or "")
    expected_tenant_id = str(
        login_payload.get("tenant_id")
        or ((login_payload.get("tenant") or {}).get("id"))
        or ""
    )
    users = requests.get(
        base_url + "/api/v1/chat/users",
        params={"tenant_id": "untrusted-client-tenant", "results_per_page": 1000},
        headers=authenticated_headers,
        timeout=10,
    )
    if users.status_code != 200:
        raise RuntimeError("Chatmgt user directory returned HTTP {}.".format(users.status_code))
    user_items = users.json().get("objects") or []
    if expected_user_id not in {str(item.get("id")) for item in user_items}:
        raise RuntimeError("Chatmgt user directory omitted the authenticated account.")
    if any(str(item.get("tenant_id") or "") != expected_tenant_id for item in user_items):
        raise RuntimeError("Chatmgt user directory leaked a foreign tenant.")

    conversations = requests.get(
        base_url + "/api/v1/conversation",
        params={"tenant_id": "untrusted-client-tenant"},
        headers=authenticated_headers,
        timeout=10,
    )
    if conversations.status_code != 200:
        raise RuntimeError("Chatmgt conversation list returned HTTP {}.".format(
            conversations.status_code
        ))
    conversation_items = conversations.json().get("objects") or []
    if any(str(item.get("tenant_id") or "") != expected_tenant_id for item in conversation_items):
        raise RuntimeError("Chatmgt conversation list leaked a foreign tenant.")
    if any(expected_user_id not in {
        str(participant_id) for participant_id in (item.get("participantIds") or [])
    } for item in conversation_items):
        raise RuntimeError("Chatmgt returned a conversation outside the current membership.")
    verify_tinode_websocket(login_payload, origin)

    logout = requests.post(
        base_url + "/api/v1/auth/logout",
        headers=authenticated_headers,
        timeout=10,
    )
    if logout.status_code != 200:
        raise RuntimeError("Logout returned HTTP {}.".format(logout.status_code))

    after_logout = requests.get(
        base_url + "/api/v1/auth/me",
        headers=authenticated_headers,
        timeout=10,
    )
    if after_logout.status_code not in (401, 403):
        raise RuntimeError("The access token remained usable after logout.")

    management_headers = dict(
        MANAGEMENT_HEADER,
        Origin=origin,
        Cookie="vichat_management_access_token={}".format(management_token),
    )
    management_logout = requests.post(
        base_url + "/api/v1/auth/logout",
        headers=management_headers,
        timeout=10,
    )
    if management_logout.status_code != 200:
        raise RuntimeError("Management logout returned HTTP {}.".format(management_logout.status_code))
    management_after_logout = requests.get(
        base_url + "/api/v1/auth/me",
        headers=management_headers,
        timeout=10,
    )
    if management_after_logout.status_code not in (401, 403):
        raise RuntimeError("The management token remained usable after logout.")

    print("Health, CORS, directory, conversations, Tinode WebSocket, login, and logout checks passed.")


def verify_http(base_url, origin):
    management_account = create_management_verifier_account()
    try:
        return _verify_http(base_url, origin, management_account)
    finally:
        delete_management_verifier_account(management_account)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--alembic-ini", default="alembic.ini")
    parser.add_argument("--base-url")
    parser.add_argument("--origin")
    args = parser.parse_args()

    verify_database(args.alembic_ini)
    if args.base_url:
        verify_http(args.base_url, args.origin or configured_origin())


if __name__ == "__main__":
    main()
