import base64
import hashlib
import hmac
import re


class SSOIdentityError(ValueError):
    pass


def _first(payload, *names):
    for name in names:
        value = payload.get(name)
        if value is not None and str(value).strip():
            return value
    return None


def _membership_active(membership):
    status = str((membership or {}).get("status") or "").strip().lower()
    return status in ("", "active", "confirmed", "enabled")


def _chat_role(role):
    normalized = str(role or "").strip().lower()
    if normalized in ("admin", "superadmin", "owner", "administrator"):
        return "admin"
    return "member"


def normalize_account_session(payload):
    if not isinstance(payload, dict):
        raise SSOIdentityError("Account returned an invalid session payload.")

    user_id = str(_first(payload, "id", "uid", "user_id") or "").strip()
    tenant_id = str(_first(payload, "current_tenant_id", "tenant_id") or "").strip()
    has_explicit_tenant = bool(tenant_id)
    memberships = payload.get("tenants")
    if not user_id:
        raise SSOIdentityError("Account session has no user ID.")
    if not isinstance(memberships, list):
        raise SSOIdentityError("Account session has no tenant membership list.")

    active_memberships = {}
    for item in memberships:
        membership_id = str((item or {}).get("id") or "").strip() if isinstance(item, dict) else ""
        if membership_id and _membership_active(item):
            active_memberships.setdefault(membership_id, item)

    if not tenant_id:
        if len(active_memberships) == 1:
            tenant_id, membership = next(iter(active_memberships.items()))
        elif not active_memberships:
            raise SSOIdentityError("Account session has no active tenant membership.")
        else:
            raise SSOIdentityError("Account session has no current tenant; select a tenant in Account.")
    else:
        membership = active_memberships.get(tenant_id)

    if len(tenant_id) > 50:
        raise SSOIdentityError("Account tenant ID exceeds the Chatmgt limit.")
    if membership is None or not _membership_active(membership):
        raise SSOIdentityError("The current Account tenant membership is not active.")

    username = str(_first(payload, "user_name", "username", "email", "phone") or "").strip().lower()
    if not username:
        raise SSOIdentityError("Account session has no usable username.")
    if len(username) > 100:
        username = "user_{}".format(hashlib.sha256(username.encode("utf-8")).hexdigest()[:32])

    email = str(payload.get("email") or "").strip().lower() or None
    if email and len(email) > 255:
        raise SSOIdentityError("Account email exceeds the Chatmgt limit.")

    full_name = str(
        _first(payload, "full_name", "display_name", "name", "user_name", "username")
        or username
    ).strip()[:255]
    tenant_name = str(
        _first(membership, "tenant_name", "name", "display_name", "code") or tenant_id
    ).strip()[:255]
    account_role = (
        (_first(payload, "current_tenant_role") if has_explicit_tenant else None)
        or membership.get("role")
        or "member"
    )

    return {
        "account_user_id": user_id,
        "tenant_id": tenant_id,
        "tenant_name": tenant_name,
        "username": username,
        "email": email,
        "full_name": full_name,
        "role": _chat_role(account_role),
        "account_role": str(account_role or "member").strip().lower(),
        "department": str(payload.get("department") or "").strip()[:255],
        "title": str(payload.get("title") or "").strip()[:255],
        "avatar": str(_first(payload, "avatar", "photo") or "").strip(),
    }


def stable_account_id(tenant_id, account_user_id):
    digest = hashlib.sha256("{}\x00{}".format(tenant_id, account_user_id).encode("utf-8")).hexdigest()
    return "acct_{}".format(digest[:48])


def stable_tinode_username(tenant_id, account_user_id):
    digest = hashlib.sha256("{}\x00{}".format(tenant_id, account_user_id).encode("utf-8")).hexdigest()
    return "upgo_{}".format(digest[:27])


def derive_tinode_password(secret, tenant_id, account_user_id, tinode_username):
    key = str(secret or "").encode("utf-8")
    if len(key) < 32:
        raise SSOIdentityError("TINODE_SSO_SECRET is missing or too short.")
    material = "{}\x00{}\x00{}".format(tenant_id, account_user_id, tinode_username).encode("utf-8")
    digest = hmac.new(key, material, hashlib.sha256).digest()
    return "S{}".format(base64.urlsafe_b64encode(digest).decode("ascii").rstrip("="))


def account_properties_match(properties, identity):
    properties = properties or {}
    return (
        str(properties.get("auth_source") or "") == "account"
        and str(properties.get("account_user_id") or "") == str(identity.get("account_user_id") or "")
        and str(properties.get("account_tenant_id") or "") == str(identity.get("tenant_id") or "")
    )


def account_session_matches(properties, identity):
    return account_properties_match(properties, identity)


def protected_tinode_account(properties, tinode_username, admin_username):
    return bool(
        (properties or {}).get("bootstrap")
        or (
            str(tinode_username or "").strip().lower()
            and str(tinode_username or "").strip().lower()
            == str(admin_username or "").strip().lower()
        )
    )


def valid_tinode_username(value):
    return bool(re.match(r"^[A-Za-z0-9][A-Za-z0-9_.]{1,30}[A-Za-z0-9]$", str(value or "")))


def valid_tinode_topic(value, is_group):
    prefix = "grp" if is_group else "usr"
    return bool(re.match(
        r"^{}[A-Za-z0-9_-]{{6,252}}$".format(prefix),
        str(value or ""),
    ))
