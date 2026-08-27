import asyncio
import logging
import re
from http.cookies import SimpleCookie
from urllib.parse import parse_qsl, quote, urlencode, urljoin, urlsplit, urlunsplit

import aiohttp

from application.server import app
from application.services.sso_identity import (
    SSOIdentityError,
    SSOIdentityTenantError,
    directory_tenant_id,
    normalize_account_directory_record,
    normalize_account_session,
)


logger = logging.getLogger(__name__)
ACCOUNT_DIRECTORY_MAX_PAGES = 100


class AccountDirectorySnapshot(list):
    """List-compatible directory data with authoritative snapshot metadata."""

    def __init__(
        self,
        identities,
        *,
        complete=False,
        total=None,
        pages=0,
        raw_count=0,
        ambiguous_count=0,
    ):
        super().__init__(identities or [])
        self.complete = bool(complete)
        self.total = total
        self.pages = int(pages or 0)
        self.raw_count = int(raw_count or 0)
        self.ambiguous_count = int(ambiguous_count or 0)


ACCOUNT_PROFILE_UPDATE_FIELDS = (
    "id",
    "created_by_name",
    "updated_by_name",
    "deleted_by_name",
    "display_name",
    "full_name",
    "user_name",
    "department",
    "title",
    "phone",
    "phone_country_prefix",
    "phone_national_number",
    "email",
    "avatar_url",
    "gender",
    "birthday",
    "address",
    "address_district",
    "address_city",
    "address_country",
    "confirmed_at",
    "active",
    "last_login_tenant",
    "tenants",
)


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


async def _account_request(
    request,
    method,
    path,
    json_body=None,
    account_cookie=None,
    capture_account_cookie=False,
):
    if account_cookie is None:
        cookie_name, cookie_value = _account_cookie(request)
    else:
        cookie_name, cookie_value = account_cookie
    timeout = aiohttp.ClientTimeout(total=int(app.config.get("ACCOUNT_SSO_TIMEOUT", 10)))
    headers = {
        "Accept": "application/json",
        "Cookie": "{}={}".format(cookie_name, cookie_value),
        "User-Agent": "VICHAT-CHATMGT-SSO/1.0",
    }
    request_kwargs = {}
    if json_body is not None:
        request_kwargs["json"] = json_body
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.request(
                method,
                _account_url(path),
                headers=headers,
                **request_kwargs
            ) as response:
                try:
                    payload = await response.json(content_type=None)
                except (aiohttp.ContentTypeError, ValueError):
                    payload = {}
                if capture_account_cookie:
                    return response.status, payload, _account_login_cookie(response, cookie_name)
                return response.status, payload
    except (aiohttp.ClientError, asyncio.TimeoutError) as error:
        raise AccountSSOError(
            "Account service is temporarily unavailable.",
            503,
            "ACCOUNT_SERVICE_UNAVAILABLE",
        ) from error


def _account_login_cookie(response, cookie_name):
    cookie = SimpleCookie()
    for header in response.headers.getall("Set-Cookie", []):
        cookie.load(header)
    morsel = cookie.get(cookie_name)
    if morsel is None or not morsel.value or morsel.value.lower() == "none":
        return None
    return {
        "name": cookie_name,
        "value": morsel.value,
        "max_age": morsel["max-age"],
        "expires": morsel["expires"],
    }


def _account_session_log_fields(payload):
    if not isinstance(payload, dict):
        return "", "", "", []

    def clean(value, limit=255):
        return str(value or "").replace("\r", " ").replace("\n", " ").strip()[:limit]

    memberships = payload.get("tenants")
    tenant_ids = []
    if isinstance(memberships, list):
        tenant_ids = [
            clean(item.get("id"), 50)
            for item in memberships
            if isinstance(item, dict) and clean(item.get("id"), 50)
        ]

    return (
        clean(payload.get("id") or payload.get("uid") or payload.get("user_id")),
        clean(payload.get("user_name") or payload.get("username") or payload.get("email")),
        clean(payload.get("current_tenant_id") or payload.get("tenant_id"), 50),
        tenant_ids,
    )


async def login_account_with_credentials(username, password):
    """Authenticate against Account without storing or mirroring its password."""
    username = str(username or "").strip()
    password = str(password or "")
    if not username or not password:
        raise AccountSSOError(
            "Email and password are required.",
            400,
            "ACCOUNT_CREDENTIALS_REQUIRED",
        )

    cookie_name = str(app.config.get("ACCOUNT_SESSION_COOKIE_NAME") or "session").strip()
    timeout = aiohttp.ClientTimeout(total=int(app.config.get("ACCOUNT_SSO_TIMEOUT", 10)))
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                _account_url(app.config.get("ACCOUNT_SSO_LOGIN_PATH") or "/login"),
                headers={
                    "Accept": "application/json",
                    "User-Agent": "VICHAT-CHATMGT-ACCOUNT-LOGIN/1.0",
                },
                json={"username": username, "password": password},
                allow_redirects=False,
            ) as response:
                try:
                    payload = await response.json(content_type=None)
                except (aiohttp.ContentTypeError, ValueError):
                    payload = {}
                account_cookie = _account_login_cookie(response, cookie_name)
                if response.status >= 500:
                    raise AccountSSOError(
                        "Account service is temporarily unavailable.",
                        503,
                        "ACCOUNT_SERVICE_UNAVAILABLE",
                    )
                if response.status >= 300 or not account_cookie:
                    error_code = (
                        "ACCOUNT_OTP_REQUIRED"
                        if isinstance(payload, dict) and payload.get("otp_key")
                        else "ACCOUNT_LOGIN_FAILED"
                    )
                    raise AccountSSOError(
                        "Invalid UpGO Account email or password."
                        if error_code == "ACCOUNT_LOGIN_FAILED"
                        else "UpGO Account requires an additional verification step.",
                        401,
                        error_code,
                    )
    except AccountSSOError:
        raise
    except (aiohttp.ClientError, asyncio.TimeoutError) as error:
        raise AccountSSOError(
            "Account service is temporarily unavailable.",
            503,
            "ACCOUNT_SERVICE_UNAVAILABLE",
        ) from error
    password = ""

    status, profile = await _account_request(
        None,
        "GET",
        app.config.get("ACCOUNT_SSO_PROFILE_PATH") or "/current_user",
        account_cookie=(account_cookie["name"], account_cookie["value"]),
    )
    if status in (401, 403, 520):
        raise AccountSSOError("Account login is required.", 401, "ACCOUNT_LOGIN_FAILED")
    if status >= 500:
        raise AccountSSOError(
            "Account profile is temporarily unavailable.",
            503,
            "ACCOUNT_SERVICE_UNAVAILABLE",
        )
    if status >= 300:
        raise AccountSSOError("Account rejected the login session.", 401, "ACCOUNT_LOGIN_FAILED")
    try:
        identity = normalize_account_session(profile)
    except SSOIdentityError as error:
        user_id, user_name, current_tenant_id, tenant_ids = _account_session_log_fields(profile)
        logger.warning(
            "Account credential login tenant normalization failed: "
            "user_id=%s user_name=%s current_tenant_id=%s tenant_ids=%s error=%s",
            user_id,
            user_name,
            current_tenant_id,
            tenant_ids,
            error,
        )
        raise AccountSSOError(str(error), 403, "ACCOUNT_TENANT_INVALID") from error
    return identity, account_cookie


def _account_profile_update_payload(profile, avatar_url=None, changes=None):
    if not isinstance(profile, dict):
        raise AccountSSOError(
            "Account returned an invalid self profile.",
            502,
            "ACCOUNT_PROFILE_INVALID",
        )
    payload = {
        field: profile.get(field)
        for field in ACCOUNT_PROFILE_UPDATE_FIELDS
        if field in profile
    }
    if avatar_url is not None:
        payload["avatar_url"] = avatar_url
    for field, value in (changes or {}).items():
        if field in ACCOUNT_PROFILE_UPDATE_FIELDS:
            payload[field] = value
    return payload


def _validate_account_self_profile(status, profile):
    if status in (401, 403, 520):
        raise AccountSSOError("Account login is required.", 401, "ACCOUNT_LOGIN_REQUIRED")
    if status >= 500:
        raise AccountSSOError(
            "Account profile is temporarily unavailable.",
            503,
            "ACCOUNT_PROFILE_UNAVAILABLE",
        )
    if status >= 300 or not isinstance(profile, dict):
        raise AccountSSOError(
            "Account rejected the profile request.",
            502,
            "ACCOUNT_PROFILE_FAILED",
        )
    return profile


def _ensure_account_identity_matches(profile, identity):
    account_user_id = str(identity.get("account_user_id") or "")
    if str(profile.get("id") or "") != account_user_id:
        raise AccountSSOError(
            "The Account profile does not match the Chatmgt session.",
            401,
            "ACCOUNT_SESSION_MISMATCH",
        )
    return account_user_id


async def update_account_profile(request, identity, changes):
    """Update editable Account fields and return the verified Account identity."""
    status, profile = await _account_request(
        request,
        "GET",
        app.config.get("ACCOUNT_SSO_SELF_PROFILE_PATH") or "/me",
    )
    profile = _validate_account_self_profile(status, profile)
    account_user_id = _ensure_account_identity_matches(profile, identity)
    changes = changes if isinstance(changes, dict) else {}
    update_fields = {}

    if "name" in changes or "full_name" in changes:
        full_name = str(changes.get("name") or changes.get("full_name") or "").strip()
        if not full_name:
            raise AccountSSOError("Full name is required.", 400, "PARAM_ERROR")
        full_name = full_name[:255]
        # Account identity normalization prefers full_name, then display_name.
        update_fields.update({"full_name": full_name, "display_name": full_name})
    if "email" in changes:
        update_fields["email"] = str(changes.get("email") or "").strip().lower()[:255] or None
    if "title" in changes:
        update_fields["title"] = str(changes.get("title") or "").strip()[:255]
    if "department" in changes:
        update_fields["department"] = str(changes.get("department") or "").strip()[:255]
    if not update_fields:
        raise AccountSSOError("No editable profile fields were supplied.", 400, "PARAM_ERROR")

    update_path = "{}/{}".format(
        str(app.config.get("ACCOUNT_SSO_USER_UPDATE_PATH") or "/api/v1/user").rstrip("/"),
        quote(account_user_id, safe=""),
    )
    status, payload = await _account_request(
        request,
        "PUT",
        update_path,
        json_body=_account_profile_update_payload(profile, changes=update_fields),
    )
    if status in (401, 520):
        raise AccountSSOError("Account login is required.", 401, "ACCOUNT_LOGIN_REQUIRED")
    if status >= 500:
        raise AccountSSOError(
            "Account profile update is temporarily unavailable.",
            503,
            "ACCOUNT_PROFILE_UPDATE_UNAVAILABLE",
        )
    if status >= 300:
        account_message = str(
            (payload or {}).get("error_message")
            or (payload or {}).get("message")
            or ""
        ).strip()
        if status == 403:
            if re.search(r"synchron|read[ -]?only|managed by.*account", account_message, re.I):
                raise AccountSSOError(
                    account_message or "Profile fields are synchronized from UpGO Account.",
                    403,
                    "ACCOUNT_PROFILE_READ_ONLY",
                )
            raise AccountSSOError(
                account_message or "UpGO Account does not allow this profile update.",
                403,
                "ACCOUNT_PROFILE_UPDATE_FORBIDDEN",
            )
        error_code = str((payload or {}).get("error_code") or "ACCOUNT_PROFILE_UPDATE_FAILED")
        raise AccountSSOError(
            account_message or "Account rejected the profile update.",
            status if status in (400, 403, 409) else 502,
            error_code,
        )

    updated_identity = await current_account_session(
        request,
        require_current_tenant=True,
    )
    if (
        str(updated_identity.get("account_user_id") or "") != account_user_id
        or str(updated_identity.get("tenant_id") or "") != str(identity.get("tenant_id") or "")
    ):
        raise AccountSSOError(
            "The Account session changed during the profile update.",
            401,
            "ACCOUNT_SESSION_MISMATCH",
        )
    return updated_identity


async def _upload_account_avatar(upload):
    upload_url = str(app.config.get("ACCOUNT_AVATAR_UPLOAD_URL") or "").strip()
    if not upload_url.startswith(("http://", "https://")):
        raise AccountSSOError(
            "Account avatar upload is not configured.",
            503,
            "ACCOUNT_AVATAR_UPLOAD_NOT_CONFIGURED",
        )
    timeout = aiohttp.ClientTimeout(
        total=int(
            app.config.get(
                "ACCOUNT_AVATAR_UPLOAD_TIMEOUT",
                app.config.get("ACCOUNT_SSO_TIMEOUT", 10),
            )
        )
    )
    form = aiohttp.FormData()
    form.add_field(
        "image",
        upload.body,
        filename=str(upload.name or "avatar"),
        content_type=str(upload.type or "application/octet-stream"),
    )
    headers = {
        "Accept": "application/json",
        "User-Agent": "VICHAT-CHATMGT-SSO/1.0",
    }
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(upload_url, headers=headers, data=form) as response:
                try:
                    payload = await response.json(content_type=None)
                except (aiohttp.ContentTypeError, ValueError):
                    payload = {}
                if response.status >= 500:
                    raise AccountSSOError(
                        "Account avatar upload is temporarily unavailable.",
                        503,
                        "ACCOUNT_AVATAR_UPLOAD_UNAVAILABLE",
                    )
                if response.status >= 300:
                    raise AccountSSOError(
                        "Account rejected the avatar upload.",
                        502,
                        "ACCOUNT_AVATAR_UPLOAD_FAILED",
                    )
    except AccountSSOError:
        raise
    except (aiohttp.ClientError, asyncio.TimeoutError) as error:
        raise AccountSSOError(
            "Account avatar upload is temporarily unavailable.",
            503,
            "ACCOUNT_AVATAR_UPLOAD_UNAVAILABLE",
        ) from error

    avatar_url = str((payload or {}).get("link") or "").strip()
    if not avatar_url.startswith(("http://", "https://")) or len(avatar_url) > 255:
        raise AccountSSOError(
            "Account avatar upload returned an invalid URL.",
            502,
            "ACCOUNT_AVATAR_UPLOAD_INVALID",
        )
    return avatar_url


async def update_account_avatar(request, identity, upload):
    status, profile = await _account_request(
        request,
        "GET",
        app.config.get("ACCOUNT_SSO_SELF_PROFILE_PATH") or "/me",
    )
    profile = _validate_account_self_profile(status, profile)
    account_user_id = _ensure_account_identity_matches(profile, identity)

    avatar_url = await _upload_account_avatar(upload)
    update_path = "{}/{}".format(
        str(app.config.get("ACCOUNT_SSO_USER_UPDATE_PATH") or "/api/v1/user").rstrip("/"),
        quote(account_user_id, safe=""),
    )
    status, _payload = await _account_request(
        request,
        "PUT",
        update_path,
        json_body=_account_profile_update_payload(profile, avatar_url),
    )
    if status in (401, 403, 520):
        raise AccountSSOError("Account login is required.", 401, "ACCOUNT_LOGIN_REQUIRED")
    if status >= 500:
        raise AccountSSOError(
            "Account avatar update is temporarily unavailable.",
            503,
            "ACCOUNT_AVATAR_UPDATE_UNAVAILABLE",
        )
    if status >= 300:
        raise AccountSSOError(
            "Account rejected the avatar update.",
            502,
            "ACCOUNT_AVATAR_UPDATE_FAILED",
        )

    updated_identity = await current_account_session(
        request,
        require_current_tenant=True,
    )
    if (
        str(updated_identity.get("account_user_id") or "") != account_user_id
        or str(updated_identity.get("tenant_id") or "") != str(identity.get("tenant_id") or "")
    ):
        raise AccountSSOError(
            "The Account session changed during the avatar update.",
            401,
            "ACCOUNT_SESSION_MISMATCH",
        )
    confirmed_avatar = str(updated_identity.get("avatar") or "").strip()
    if confirmed_avatar != avatar_url:
        # Account may serve a cached /current_user snapshot immediately after
        # PUT. Re-read the authoritative /me profile once before declaring the
        # upload unsuccessful.
        status, fresh_profile = await _account_request(
            request,
            "GET",
            app.config.get("ACCOUNT_SSO_SELF_PROFILE_PATH") or "/me",
        )
        fresh_profile = _validate_account_self_profile(status, fresh_profile)
        _ensure_account_identity_matches(fresh_profile, identity)
        if str(fresh_profile.get("avatar_url") or fresh_profile.get("avatar") or "").strip() == avatar_url:
            # Keep the strict /current_user tenant identity. /me confirms only
            # the uploaded avatar and may not carry authoritative tenant state.
            updated_identity = {
                **updated_identity,
                "avatar": avatar_url,
                "avatar_present": True,
            }
            confirmed_avatar = avatar_url
    if confirmed_avatar != avatar_url:
        raise AccountSSOError(
            "Account did not confirm the new avatar.",
            502,
            "ACCOUNT_AVATAR_UPDATE_UNCONFIRMED",
        )
    return updated_identity


async def current_account_session(
    request,
    preferred_tenant_id=None,
    require_current_tenant=False,
):
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
        return normalize_account_session(
            payload,
            preferred_tenant_id=preferred_tenant_id,
            require_current_tenant=require_current_tenant,
        )
    except SSOIdentityError as error:
        user_id, user_name, current_tenant_id, tenant_ids = _account_session_log_fields(payload)
        logger.warning(
            "Current Account session tenant normalization failed: "
            "user_id=%s user_name=%s current_tenant_id=%s tenant_ids=%s error=%s",
            user_id,
            user_name,
            current_tenant_id,
            tenant_ids,
            error,
        )
        raise AccountSSOError(str(error), 403, "ACCOUNT_TENANT_INVALID") from error


async def switch_account_tenant(request, tenant_id):
    """Move the Account session to a verified tenant for directory reads."""
    tenant_id = str(tenant_id or "").strip()
    if not tenant_id or len(tenant_id) > 50:
        raise AccountSSOError(
            "A valid Account tenant is required.",
            400,
            "ACCOUNT_TENANT_REQUIRED",
        )

    status, payload, account_cookie = await _account_request(
        request,
        "POST",
        app.config.get("ACCOUNT_SSO_TENANT_SWITCH_PATH")
        or "/api/v1/tenant/set_current_tenant",
        json_body={"tenant_id": tenant_id},
        capture_account_cookie=True,
    )
    error_code = str((payload or {}).get("error_code") or "") if isinstance(payload, dict) else ""
    if status in (401, 403, 520) or error_code in ("SESSION_EXPIRED", "AUTH_ERROR"):
        raise AccountSSOError("Account login is required.", 401, "ACCOUNT_LOGIN_REQUIRED")
    if status >= 500:
        raise AccountSSOError(
            "Account tenant switching is temporarily unavailable.",
            503,
            "ACCOUNT_TENANT_SWITCH_UNAVAILABLE",
        )
    if status >= 300:
        account_message = str(
            (payload or {}).get("error_message")
            or (payload or {}).get("message")
            or ""
        ).strip()
        raise AccountSSOError(
            account_message or "Account rejected the tenant switch request.",
            status if status in (400, 409) else 502,
            error_code or "ACCOUNT_TENANT_SWITCH_FAILED",
        )
    return payload if isinstance(payload, dict) else {}, account_cookie


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


def _directory_total(payload):
    if not isinstance(payload, dict):
        return None
    for name in ("total", "num_results"):
        if name not in payload:
            continue
        value = payload.get(name)
        if isinstance(value, bool):
            return None
        try:
            total = int(value)
        except (TypeError, ValueError, OverflowError):
            return None
        return total if total >= 0 else None
    for name in ("meta", "metadata", "pagination", "data"):
        value = payload.get(name)
        if isinstance(value, dict):
            total = _directory_total(value)
            if total is not None:
                return total
    return None


def _directory_path(page=1):
    configured_path = app.config.get("ACCOUNT_SSO_DIRECTORY_PATH") or "/api/v1/tenant_user"
    parts = urlsplit(str(configured_path))
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["page"] = str(max(1, int(page)))
    query.setdefault("results_per_page", "1000")
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


async def account_directory(request, identity):
    identities = []
    seen_account_user_ids = set()
    seen_usernames = {}
    seen_emails = {}
    ambiguous_account_user_ids = set()
    raw_count = 0
    total = None
    complete = False
    pages = 0

    for page in range(1, ACCOUNT_DIRECTORY_MAX_PAGES + 1):
        try:
            status, payload = await _account_request(request, "GET", _directory_path(page))
        except AccountSSOError as error:
            if pages and error.error_code in (
                "ACCOUNT_DIRECTORY_UNAVAILABLE",
                "ACCOUNT_DIRECTORY_FAILED",
                "ACCOUNT_SERVICE_UNAVAILABLE",
            ):
                complete = False
                break
            raise
        error_code = str((payload or {}).get("error_code") or "") if isinstance(payload, dict) else ""
        if status in (401, 403, 520) or error_code in ("SESSION_EXPIRED", "AUTH_ERROR"):
            raise AccountSSOError("Account login is required.", 401, "ACCOUNT_LOGIN_REQUIRED")
        if status >= 500:
            if pages:
                complete = False
                break
            raise AccountSSOError(
                "Account directory is temporarily unavailable.",
                503,
                "ACCOUNT_DIRECTORY_UNAVAILABLE",
            )
        if status >= 300:
            if pages:
                complete = False
                break
            raise AccountSSOError(
                "Account rejected the directory request.",
                502,
                "ACCOUNT_DIRECTORY_FAILED",
            )

        try:
            items = _directory_items(payload)
        except AccountSSOError:
            if pages:
                complete = False
                break
            raise
        pages += 1
        payload_tenant_id = directory_tenant_id(payload)
        if (
            payload_tenant_id
            and str(payload_tenant_id).strip()
            != str(identity.get("tenant_id") or "").strip()
        ):
            raise AccountSSOError(
                "Account directory returned users outside the verified company.",
                502,
                "ACCOUNT_DIRECTORY_TENANT_MISMATCH",
            )
        page_total = _directory_total(payload)
        if pages == 1:
            total = page_total
            complete = total is not None
        elif page_total is not None and page_total != total:
            complete = False
            break

        page_new_identities = 0
        for record in items:
            raw_count += 1
            try:
                directory_identity = normalize_account_directory_record(
                    record,
                    identity["tenant_id"],
                    identity.get("tenant_name") or identity["tenant_id"],
                )
            except SSOIdentityTenantError as error:
                raise AccountSSOError(
                    "Account directory returned users outside the verified company.",
                    502,
                    "ACCOUNT_DIRECTORY_TENANT_MISMATCH",
                ) from error
            except SSOIdentityError as error:
                record_account_user_id = str(
                    (
                        record.get("id")
                        or record.get("uid")
                        or record.get("user_id")
                        or ""
                    )
                    if isinstance(record, dict)
                    else ""
                ).strip()
                if record_account_user_id == str(
                    identity.get("account_user_id") or ""
                ).strip():
                    raise AccountSSOError(
                        "Account directory returned an invalid authenticated viewer.",
                        401,
                        "ACCOUNT_DIRECTORY_VIEWER_INVALID",
                    ) from error
                complete = False
                logger.warning("Skipped invalid Account directory record: %s", error)
                continue
            account_user_id = str(directory_identity.get("account_user_id") or "")
            if account_user_id in seen_account_user_ids:
                complete = False
                continue
            username_key = str(directory_identity.get("username") or "").strip().lower()
            previous_username_id = seen_usernames.get(username_key)
            if previous_username_id and previous_username_id != account_user_id:
                ambiguous_account_user_ids.update((previous_username_id, account_user_id))
            if username_key:
                seen_usernames.setdefault(username_key, account_user_id)
            email_key = str(directory_identity.get("email") or "").strip().lower()
            previous_email_id = seen_emails.get(email_key)
            if email_key and previous_email_id and previous_email_id != account_user_id:
                ambiguous_account_user_ids.update((previous_email_id, account_user_id))
            if email_key:
                seen_emails.setdefault(email_key, account_user_id)
            seen_account_user_ids.add(account_user_id)
            identities.append(directory_identity)
            page_new_identities += 1

        if total is None:
            break
        if raw_count > total:
            complete = False
            break
        if raw_count == total:
            if len(identities) != total:
                complete = False
            break
        if not items or page_new_identities == 0:
            complete = False
            break
    else:
        complete = False

    current_account_user_id = str(identity.get("account_user_id") or "").strip()
    ambiguous_count = 0
    if ambiguous_account_user_ids:
        filtered_identities = []
        for directory_identity in identities:
            account_user_id = str(directory_identity.get("account_user_id") or "").strip()
            if (
                account_user_id in ambiguous_account_user_ids
                and account_user_id != current_account_user_id
            ):
                ambiguous_count += 1
                continue
            filtered_identities.append(directory_identity)
        identities = filtered_identities
        complete = False
        logger.warning(
            "Omitted %s ambiguous Account directory records; authenticated viewer retained=%s",
            ambiguous_count,
            bool(current_account_user_id in ambiguous_account_user_ids),
        )

    if not identities and raw_count and not ambiguous_account_user_ids:
        raise AccountSSOError(
            "Account directory contained no valid users.",
            502,
            "ACCOUNT_DIRECTORY_INVALID",
        )
    snapshot_complete = bool(complete and total == len(identities))
    if snapshot_complete and current_account_user_id and current_account_user_id not in {
        str(item.get("account_user_id") or "") for item in identities
    }:
        raise AccountSSOError(
            "Account directory omitted the authenticated user.",
            401,
            "ACCOUNT_DIRECTORY_VIEWER_INVALID",
        )
    return AccountDirectorySnapshot(
        identities,
        complete=snapshot_complete,
        total=total,
        pages=pages,
        raw_count=raw_count,
        ambiguous_count=ambiguous_count,
    )


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


def set_account_cookie(response, account_cookie):
    if not account_cookie:
        return response
    attributes = [
        "{}={}".format(account_cookie["name"], account_cookie["value"]),
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
    ]
    max_age = str(account_cookie.get("max_age") or "").strip()
    expires = str(account_cookie.get("expires") or "").strip()
    cookie_domain = str(app.config.get("ACCOUNT_SESSION_COOKIE_DOMAIN") or "").strip()
    if max_age:
        attributes.append("Max-Age={}".format(max_age))
    if expires:
        attributes.append("Expires={}".format(expires))
    if cookie_domain:
        attributes.append("Domain={}".format(cookie_domain))
    if bool(app.config.get("ACCOUNT_SESSION_COOKIE_SECURE", True)):
        attributes.append("Secure")
    response.headers.add("Set-Cookie", "; ".join(attributes))
    return response
