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
    membership = membership if isinstance(membership, dict) else {}
    status = str(
        _first(membership, "status", "state", "membership_status", "invitation_status") or ""
    ).strip().lower()
    if status in (
        "disabled",
        "inactive",
        "deleted",
        "suspended",
        "blocked",
        "pending",
        "invited",
        "invitation_pending",
    ):
        return False
    for name in ("deleted", "is_deleted"):
        if name in membership and bool(membership.get(name)):
            return False
    for name in ("active", "is_active", "enabled"):
        if name not in membership:
            continue
        value = membership.get(name)
        if isinstance(value, bool):
            return value
        return str(value or "").strip().lower() not in (
            "0",
            "false",
            "no",
            "off",
            "disabled",
        )
    return True


def _membership_id(membership):
    if not isinstance(membership, dict):
        return ""
    return str(
        _first(
            membership,
            "id",
            "tenant_id",
            "company_id",
            "brand_id",
            "organization_id",
            "workspace_id",
        )
        or ""
    ).strip()


def _chat_role(role):
    normalized = str(role or "").strip().lower()
    if normalized in ("admin", "superadmin", "owner", "administrator"):
        return "admin"
    return "member"


def _directory_active(payload):
    status = str((payload or {}).get("status") or "").strip().lower()
    if status in (
        "disabled",
        "inactive",
        "deleted",
        "suspended",
        "blocked",
        "pending",
        "invited",
        "invitation_pending",
    ):
        return False
    for name in ("deleted", "is_deleted"):
        if name in payload and bool(payload.get(name)):
            return False
    for name in ("active", "is_active", "enabled"):
        if name not in payload:
            continue
        value = payload.get(name)
        if isinstance(value, bool):
            return value
        return str(value or "").strip().lower() not in ("0", "false", "no", "off", "disabled")
    return True


def _directory_text(value):
    if isinstance(value, dict):
        value = _first(value, "name", "full_name", "display_name", "title", "code")
    return str(value or "").strip()


def normalize_account_directory_record(payload, tenant_id, tenant_name=""):
    if not isinstance(payload, dict):
        raise SSOIdentityError("Account directory returned an invalid user record.")

    account_user_id = str(_first(payload, "id", "uid", "user_id") or "").strip()
    if not account_user_id:
        raise SSOIdentityError("Account directory user has no ID.")

    tenant_id = str(tenant_id or "").strip()
    if not tenant_id or len(tenant_id) > 50:
        raise SSOIdentityError("Account directory tenant is invalid.")

    username = str(_first(payload, "user_name", "username", "email", "phone") or "").strip().lower()
    if not username:
        raise SSOIdentityError("Account directory user has no usable username.")
    if len(username) > 100:
        username = "user_{}".format(hashlib.sha256(username.encode("utf-8")).hexdigest()[:32])

    email = str(payload.get("email") or "").strip().lower() or None
    if email and len(email) > 255:
        raise SSOIdentityError("Account directory email exceeds the Chatmgt limit.")

    full_name = str(
        _first(payload, "full_name", "display_name", "name", "user_name", "username")
        or username
    ).strip()[:255]
    raw_role = _first(payload, "current_tenant_role", "tenant_role", "role")

    return {
        "account_user_id": account_user_id,
        "tenant_id": tenant_id,
        "tenant_name": str(tenant_name or tenant_id).strip()[:255],
        "username": username,
        "email": email,
        "full_name": full_name,
        "role": _chat_role(raw_role),
        "account_role": str(raw_role or "member").strip().lower(),
        "department": _directory_text(payload.get("department"))[:255],
        "title": _directory_text(payload.get("title"))[:255],
        "avatar": str(_first(payload, "avatar_url", "avatar", "photo") or "").strip(),
        "active": _directory_active(payload),
        "directory_projection": True,
        "role_present": raw_role is not None,
        "email_present": "email" in payload,
        "department_present": "department" in payload,
        "title_present": "title" in payload,
        "avatar_present": any(name in payload for name in ("avatar_url", "avatar", "photo")),
    }


def normalize_account_session(payload):
    if not isinstance(payload, dict):
        raise SSOIdentityError("Account returned an invalid session payload.")

    user_id = str(_first(payload, "id", "uid", "user_id") or "").strip()
    current_tenant = _first(
        payload,
        "current_tenant",
        "current_company",
        "current_brand",
        "current_organization",
    )
    raw_tenant = _first(
        payload,
        "current_tenant_id",
        "tenant_id",
        "current_company_id",
        "company_id",
        "current_brand_id",
        "brand_id",
        "organization_id",
    )
    if isinstance(raw_tenant, dict):
        current_tenant = raw_tenant
        tenant_id = _membership_id(raw_tenant)
    else:
        tenant_id = str(raw_tenant or "").strip()
    has_explicit_tenant = bool(tenant_id)
    if not user_id:
        raise SSOIdentityError("Account session has no user ID.")

    memberships = None
    for key in ("tenants", "companies", "brands", "organizations", "memberships"):
        value = payload.get(key)
        if isinstance(value, list):
            memberships = value
            break
        if isinstance(value, dict):
            memberships = [
                {"id": key_id, **item}
                for key_id, item in value.items()
                if isinstance(item, dict)
            ]
            if memberships:
                break
    if memberships is None:
        candidates = []
        if isinstance(current_tenant, dict):
            candidates.append(current_tenant)
        if not candidates:
            for key in ("tenant", "company", "brand", "organization"):
                value = payload.get(key)
                if isinstance(value, dict):
                    candidates.append(value)
                    break
        if not candidates and tenant_id:
            candidates.append({
                "id": tenant_id,
                "name": _first(payload, "tenant_name", "company_name", "brand_name") or tenant_id,
                "role": _first(
                    payload,
                    "current_tenant_role",
                    "current_company_role",
                    "current_brand_role",
                    "role",
                ) or "member",
                "status": "active",
            })
        memberships = candidates
    if not isinstance(memberships, list):
        raise SSOIdentityError("Account session has no tenant membership list.")

    active_memberships = {}
    for item in memberships:
        membership_id = _membership_id(item)
        if membership_id and _membership_active(item):
            active_memberships.setdefault(membership_id, item)

    if current_tenant and isinstance(current_tenant, dict):
        current_id = _membership_id(current_tenant)
        if current_id and _membership_active(current_tenant):
            active_memberships.setdefault(current_id, current_tenant)

    if not tenant_id:
        if not active_memberships:
            raise SSOIdentityError("Account session has no active tenant membership.")
        else:
            # Account may omit the current company for a credential login. The
            # verified active membership order is the deterministic fallback.
            tenant_id, membership = next(iter(active_memberships.items()))
    else:
        membership = active_memberships.get(tenant_id)
        if membership is None or not _membership_active(membership):
            if not active_memberships:
                raise SSOIdentityError("Account session has no active tenant membership.")
            tenant_id, membership = next(iter(active_memberships.items()))
            has_explicit_tenant = False

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
        _first(
            membership,
            "tenant_name",
            "company_name",
            "brand_name",
            "organization_name",
            "name",
            "display_name",
            "code",
        )
        or tenant_id
    ).strip()[:255]
    account_role = (
        (
            _first(
                payload,
                "current_tenant_role",
                "current_company_role",
                "current_brand_role",
            )
            if has_explicit_tenant
            else None
        )
        or _first(membership, "role", "tenant_role", "company_role", "brand_role")
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
        "avatar": str(_first(payload, "avatar_url", "avatar", "photo") or "").strip(),
    }


def stable_account_id(tenant_id, account_user_id):
    digest = hashlib.sha256("{}\x00{}".format(tenant_id, account_user_id).encode("utf-8")).hexdigest()
    return "acct_{}".format(digest[:48])


def stable_local_account_id(tenant_id, username):
    normalized_username = str(username or "").strip().lower()
    digest = hashlib.sha256(
        "{}\x00local\x00{}".format(tenant_id, normalized_username).encode("utf-8")
    ).hexdigest()
    return "usr_{}".format(digest[:48])


def stable_tinode_username(tenant_id, account_user_id):
    digest = hashlib.sha256("{}\x00{}".format(tenant_id, account_user_id).encode("utf-8")).hexdigest()
    # Tinode stores basic logins as "basic:<username>" in a VARCHAR(32).
    return "upgo_{}".format(digest[:21])


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
    username = str(value or "")
    return len(username) <= 26 and bool(
        re.match(r"^[A-Za-z0-9][A-Za-z0-9_.]{1,24}[A-Za-z0-9]$", username)
    )


def valid_tinode_topic(value, is_group):
    prefix = "grp" if is_group else "usr"
    return bool(re.match(
        r"^{}[A-Za-z0-9_-]{{6,252}}$".format(prefix),
        str(value or ""),
    ))


def direct_peer_tinode_uid(viewer_id, participant_ids, tinode_uids_by_id):
    viewer_id = str(viewer_id or "")
    participants = [str(participant_id or "") for participant_id in participant_ids]
    if len(participants) != 2 or len(set(participants)) != 2 or viewer_id not in participants:
        return ""
    peer_id = next(participant_id for participant_id in participants if participant_id != viewer_id)
    return str((tinode_uids_by_id or {}).get(peer_id) or "").strip()
