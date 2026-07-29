import asyncio
from urllib.parse import urljoin

import aiohttp

from application.server import app
from application.services.sso_identity import SSOIdentityError, normalize_account_session


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
                payload = await response.json(content_type=None)
                return response.status, payload
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as error:
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
