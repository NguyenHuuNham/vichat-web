import asyncio
import logging
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

import aiohttp

from application.server import app
from application.services.sso_identity import (
    SSOIdentityError,
    normalize_account_directory_record,
    normalize_account_session,
)


logger = logging.getLogger(__name__)


class AccountSSOError(Exception):
    def __init__(self, message, status_code=401, error_code="ACCOUNT_SESSION_INVALID"):
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code


def account_sso_configured():
    return bool(
        str(app.config.get("ACCOUNT_URL") or "").strip()
        and str(app.config.get("ACCOUNT_SESSION_COOKIE_NAME") or "").strip()
    )


def _account_url(path):
    base_url = str(app.config.get("ACCOUNT_URL") or "").strip().rstrip("/") + "/"
    if not base_url.startswith(("http://", "https://")):
        raise AccountSSOError("Account SSO is not configured.", 503, "ACCOUNT_SSO_NOT_CONFIGURED")
    return urljoin(base_url, str(path or "").lstrip("/"))


def _account_cookie(request):
    cookie_name = str(app.config.get("ACCOUNT_SESSION_COOKIE_NAME") or "session").strip()
    raw_cookie = str(request.headers.get("Cookie") or "")
    values = []
    for item in raw_cookie.split(";"):
        name, separator, value = item.strip().partition("=")
        if separator and name == cookie_name and value and value not in values:
            values.append(value)
    if len(values) > 1:
        raise AccountSSOError(
            "Multiple Account session cookies were supplied.",
            401,
            "ACCOUNT_COOKIE_AMBIGUOUS",
        )
    if not values or values[0].lower() == "none":
        raise AccountSSOError("Account login is required.", 401, "ACCOUNT_LOGIN_REQUIRED")
    return cookie_name, values[0]


async def _account_request(request, method, path):
    cookie_name, cookie_value = _account_cookie(request)
    timeout = aiohttp.ClientTimeout(total=int(app.config.get("ACCOUNT_SSO_TIMEOUT", 10)))
    headers = {
        "Accept": "application/json",
        "Cookie": "{}={}".format(cookie_name, cookie_value),
        "User-Agent": "VICHAT-CHATMGT-SSO/1.0",
    }
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.request(method, _account_url(path), headers=headers) as response:
                try:
                    payload = await response.json(content_type=None)
                except (aiohttp.ContentTypeError, ValueError):
                    payload = {}
                return response.status, payload
    except (aiohttp.ClientError, asyncio.TimeoutError) as error:
        raise AccountSSOError(
            "Account service is temporarily unavailable.",
            503,
            "ACCOUNT_SERVICE_UNAVAILABLE",
        ) from error


async def current_account_session(request):
    status, payload = await _account_request(
        request,
        "GET",
        app.config.get("ACCOUNT_SSO_PROFILE_PATH") or "/current_user",
    )
    error_code = str((payload or {}).get("error_code") or "") if isinstance(payload, dict) else ""
    if status in (401, 403, 520) or error_code in ("SESSION_EXPIRED", "AUTH_ERROR"):
        raise AccountSSOError("Account login is required.", 401, "ACCOUNT_LOGIN_REQUIRED")
    if status >= 500:
        raise AccountSSOError(
            "Account service is temporarily unavailable.",
            503,
            "ACCOUNT_SERVICE_UNAVAILABLE",
        )
    if status >= 300:
        raise AccountSSOError("Account rejected the session.", 401, "ACCOUNT_SESSION_INVALID")
    try:
        return normalize_account_session(payload)
    except SSOIdentityError as error:
        raise AccountSSOError(str(error), 403, "ACCOUNT_TENANT_INVALID") from error


def _directory_items(payload):
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        raise AccountSSOError(
            "Account directory returned an invalid payload.",
            502,
            "ACCOUNT_DIRECTORY_INVALID",
        )
    for name in ("objects", "items", "data"):
        value = payload.get(name)
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            try:
                return _directory_items(value)
            except AccountSSOError:
                pass
    raise AccountSSOError(
        "Account directory returned no user list.",
        502,
        "ACCOUNT_DIRECTORY_INVALID",
    )


def _directory_path():
    configured_path = app.config.get("ACCOUNT_SSO_DIRECTORY_PATH") or "/api/v1/user"
    parts = urlsplit(str(configured_path))
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.setdefault("page", "1")
    query.setdefault("results_per_page", "1000")
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


async def account_directory(request, identity):
    status, payload = await _account_request(request, "GET", _directory_path())
    error_code = str((payload or {}).get("error_code") or "") if isinstance(payload, dict) else ""
    if status in (401, 403, 520) or error_code in ("SESSION_EXPIRED", "AUTH_ERROR"):
        raise AccountSSOError("Account login is required.", 401, "ACCOUNT_LOGIN_REQUIRED")
    if status >= 500:
        raise AccountSSOError(
            "Account directory is temporarily unavailable.",
            503,
            "ACCOUNT_DIRECTORY_UNAVAILABLE",
        )
    if status >= 300:
        raise AccountSSOError(
            "Account rejected the directory request.",
            502,
            "ACCOUNT_DIRECTORY_FAILED",
        )

    items = _directory_items(payload)
    identities = []
    for record in items:
        try:
            identities.append(normalize_account_directory_record(
                record,
                identity["tenant_id"],
                identity.get("tenant_name") or identity["tenant_id"],
            ))
        except SSOIdentityError as error:
            logger.warning("Skipped invalid Account directory record: %s", error)
    if not identities and items:
        raise AccountSSOError(
            "Account directory contained no valid users.",
            502,
            "ACCOUNT_DIRECTORY_INVALID",
        )
    current_account_user_id = str(identity.get("account_user_id") or "")
    if current_account_user_id and current_account_user_id not in {
        str(item.get("account_user_id") or "") for item in identities
    }:
        raise AccountSSOError(
            "Account directory omitted the authenticated user.",
            502,
            "ACCOUNT_DIRECTORY_INVALID",
        )
    return identities


async def logout_account_session(request):
    status, payload = await _account_request(
        request,
        "POST",
        app.config.get("ACCOUNT_SSO_LOGOUT_PATH") or "/logout",
    )
    if status >= 500:
        raise AccountSSOError(
            "Account logout is temporarily unavailable.",
            503,
            "ACCOUNT_LOGOUT_UNAVAILABLE",
        )
    if status >= 300:
        raise AccountSSOError("Account rejected the logout request.", 502, "ACCOUNT_LOGOUT_FAILED")
    return payload if isinstance(payload, dict) else {}


def clear_account_cookie(response):
    cookie_name = str(app.config.get("ACCOUNT_SESSION_COOKIE_NAME") or "session").strip()
    attributes = [
        "{}=".format(cookie_name),
        "Path=/",
        "Max-Age=0",
        "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
        "HttpOnly",
        "SameSite=Lax",
    ]
    cookie_domain = str(app.config.get("ACCOUNT_SESSION_COOKIE_DOMAIN") or "").strip()
    if cookie_domain:
        attributes.append("Domain={}".format(cookie_domain))
    if bool(app.config.get("ACCOUNT_SESSION_COOKIE_SECURE", True)):
        attributes.append("Secure")
    response.headers.add("Set-Cookie", "; ".join(attributes))
    return response
