import asyncio
import datetime
import hmac
import logging
import time
import uuid

from gatco.response import json
from sqlalchemy import and_, func, or_

from application.database import db
from application.models.models import (
    Conversation,
    ConversationParticipant,
    FriendRequest,
    ManagementAccount,
    ManagementTenant,
    PasswordResetToken,
    SecurityAuditLog,
)
from application.server import app
from application.services.account_sso_service import (
    AccountSSOError,
    account_directory,
    account_sso_configured,
    clear_account_cookie,
    current_account_session,
    login_account_with_credentials,
    logout_account_session,
    set_account_cookie,
    switch_account_tenant,
    update_account_profile,
    update_account_avatar,
)
from application.services.auth_service import (
    AuthError,
    CHAT_SESSION_SCOPE,
    MANAGEMENT_SESSION_SCOPE,
    build_password_reset_url,
    clear_auth_cookie,
    clear_login_failures,
    create_password_reset_token,
    decode_access_token,
    hash_password,
    issue_access_token,
    password_reset_rate_limited,
    password_reset_token_hash,
    record_password_reset_request,
    revoke_request_token,
    login_rate_limited,
    linked_session_devices,
    management_session_requested,
    mobile_access_token_payload,
    record_login_failure,
    send_password_reset_email,
    set_auth_cookie,
    register_linked_session,
    tinode_add_topic_members,
    tinode_admin_reset_password,
    tinode_auth_expired,
    tinode_auth_from_request,
    tinode_disabled_password,
    tinode_mirror_enabled,
    tinode_mirror_login,
    tinode_accept_topic_owner,
    tinode_remove_topic_member,
    tinode_reconcile_topic_members,
    tinode_publish_system_event,
    tinode_sso_password,
    tinode_sso_login,
    tinode_username_compatible,
    tinode_verify_topic_access,
    token_from_request,
    touch_linked_session,
    verify_password,
    current_user as current_jwt_user,
)
from application.services.sso_identity import (
    account_properties_match,
    account_session_matches,
    direct_peer_tinode_uid,
    protected_tinode_account,
    stable_account_id,
    stable_local_account_id,
    stable_tinode_username,
    valid_tinode_topic,
)


logger = logging.getLogger(__name__)
ACCOUNT_SSO_PASSWORD_MARKER = "!account-sso-only"
_ACCOUNT_DIRECTORY_SYNC_CACHE = {}


def _mobile_linked_devices(request, token):
    if str(request.headers.get("X-Vichat-Client") or "").strip().lower() != "mobile":
        return None
    return linked_session_devices(request, decode_access_token(token) or {})


def _admin_account_sso_enabled():
    return bool(app.config.get("CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED", False))


def _employee_account_sso_enabled():
    return bool(app.config.get("CHAT_ACCOUNT_SSO_ENABLED", False))


def _employee_account_credential_login_enabled():
    return bool(
        _employee_account_sso_enabled()
        and app.config.get("CHAT_ACCOUNT_CREDENTIAL_LOGIN_ENABLED", False)
    )


def _local_tinode_mirror_enabled():
    return bool(
        tinode_mirror_enabled()
        and not _employee_account_sso_enabled()
    )


def _public_tenant(tenant):
    if tenant is None:
        return None
    return {
        "id": str(tenant.id),
        "name": tenant.name,
        "active": bool(tenant.active),
        "properties": tenant.properties or {},
    }


def _public_tenant_options(identity):
    options = []
    seen = set()
    for item in (identity or {}).get("tenant_options") or []:
        if not isinstance(item, dict):
            continue
        tenant_id = str(item.get("id") or "").strip()
        if not tenant_id or tenant_id in seen or len(tenant_id) > 50:
            continue
        seen.add(tenant_id)
        option = {
            "id": tenant_id,
            "name": str(item.get("name") or tenant_id).strip()[:255],
            "role": str(item.get("role") or "member").strip().lower(),
            "accountRole": str(
                item.get("account_role") or item.get("accountRole") or "member"
            ).strip().lower(),
            "active": bool(item.get("active", True)),
        }
        logo = item.get("logo") or item.get("logoUrl") or item.get("logo_url")
        if isinstance(logo, dict):
            logo = next(
                (
                    logo.get(name)
                    for name in ("url", "src", "href", "ref", "path", "uri")
                    if isinstance(logo.get(name), str) and logo.get(name).strip()
                ),
                "",
            )
        if isinstance(logo, str) and logo.strip():
            option["logo"] = logo.strip()[:2048]
        logo_version = (
            item.get("logo_version")
            or item.get("logoVersion")
            or item.get("logo_updated_at")
            or item.get("logoUpdatedAt")
        )
        if isinstance(logo_version, (str, int, float)) and not isinstance(logo_version, bool):
            logo_version = str(logo_version).strip()
            if logo_version:
                option["logoVersion"] = logo_version[:255]
                option["logo_version"] = logo_version[:255]
        options.append(option)
    return options


def _tenant_options_payload(identity):
    options = _public_tenant_options(identity)
    return {
        "tenantOptions": options,
        "tenant_options": options,
    }


def _public_account(account, tenant=None):
    properties = account.properties or {}
    auth_source = str(properties.get("auth_source") or "local")
    full_name = account.full_name or account.username
    public_username = properties.get("account_username") or account.username
    public_email = properties.get("account_email") or account.email or ""
    tenant_payload = _public_tenant(tenant)
    return {
        "id": str(account.id),
        "uid": str(account.id),
        "userId": str(account.id),
        "user_id": str(account.id),
        "username": public_username,
        "email": public_email,
        "name": full_name,
        "fullName": full_name,
        "full_name": full_name,
        "displayName": full_name,
        "display_name": full_name,
        "role": account.role or "member",
        "department": account.department or "",
        "title": account.title or "",
        "avatar": account.avatar or "",
        "tenantId": account.tenant_id,
        "tenant_id": account.tenant_id,
        "tenantName": tenant_payload.get("name") if tenant_payload else "",
        "tenant_name": tenant_payload.get("name") if tenant_payload else "",
        "tenant": tenant_payload,
        "tinodeUsername": account.tinode_username,
        "tinode_username": account.tinode_username,
        "tinodeUid": account.tinode_uid,
        "tinode_uid": account.tinode_uid,
        "active": bool(account.active),
        "online": False,
        "mustChangePassword": bool(properties.get("must_change_password")),
        "createdAt": _iso_timestamp(account.created_at),
        "created_at": account.created_at,
        "updatedAt": _iso_timestamp(account.updated_at),
        "updated_at": account.updated_at,
        "lastLoginAt": _iso_timestamp(account.last_login_at),
        "last_login_at": account.last_login_at,
        "authSource": auth_source,
        "auth_source": auth_source,
        "accountManaged": auth_source == "account",
        "account_managed": auth_source == "account",
    }


def _tenant_by_id(tenant_id):
    return ManagementTenant.query.filter(
        ManagementTenant.id == str(tenant_id),
        ManagementTenant.active.is_(True),
    ).first()


def _identity(request):
    try:
        current_user = current_jwt_user(request)
    except Exception:
        current_user = None
    if current_user is None:
        return None, None
    tenant_id = current_user.get("current_tenant_id") or current_user.get("tenant_id")
    tenant_id = str(tenant_id or "") or None
    if tenant_id is None:
        return None, None
    tenant = _tenant_by_id(tenant_id)
    if tenant is None:
        return None, None
    account = ManagementAccount.query.filter(
        ManagementAccount.id == _user_id(current_user),
        ManagementAccount.tenant_id == tenant_id,
        ManagementAccount.active.is_(True),
    ).first()
    if account is None:
        return None, None
    account_auth_version = int((account.properties or {}).get("auth_version") or 0)
    if int(current_user.get("auth_version") or 0) != account_auth_version:
        return None, None
    resolved_user = {
        **current_user,
        "username": account.username,
        "user_name": account.username,
        "role": account.role or "member",
        "tenant_id": account.tenant_id,
        "current_tenant_id": account.tenant_id,
    }
    if management_session_requested(request) and not _is_admin(resolved_user):
        return None, None
    touch_linked_session(request, resolved_user)
    return resolved_user, tenant_id


def _user_id(user):
    user = user or {}
    return str(user.get("id") or user.get("uid") or user.get("user_name") or user.get("username") or "")


def _is_admin(user):
    return str((user or {}).get("role") or "").lower() in ("admin", "superadmin", "owner")


def _auth_error():
    return json({"error_code": "SESSION_EXPIRED", "error_message": "Authentication is required."}, status=401)


def _current_session_error(request):
    try:
        token_user = current_jwt_user(request)
    except Exception:
        token_user = None
    if token_user is not None:
        tenant_id = str(token_user.get("current_tenant_id") or token_user.get("tenant_id") or "")
        account = ManagementAccount.query.filter(
            ManagementAccount.id == _user_id(token_user),
            ManagementAccount.tenant_id == tenant_id,
        ).first()
        token_auth_version = int(token_user.get("auth_version") or 0)
        account_auth_version = int(((account.properties if account else {}) or {}).get("auth_version") or 0)
        if account is None or not account.active or token_auth_version != account_auth_version:
            return clear_auth_cookie(json({
                "error_code": "SESSION_REVOKED",
                "error_message": "The session was revoked by an administrator.",
            }, status=401), request)
    return _auth_error()


def _forbidden_error():
    return json({"error_code": "FORBIDDEN", "error_message": "Administrator permission is required."}, status=403)


def _management_scope_error():
    return json({
        "error_code": "FORBIDDEN",
        "error_message": "The management session scope is required.",
    }, status=403)


def _management_user_action_error():
    return json({
        "error_code": "MANAGEMENT_USER_ACTION_DISABLED",
        "error_message": "Chatmgt administrators may only revoke user sessions.",
    }, status=403)


def _management_chat_metadata_error():
    return json({
        "error_code": "MANAGEMENT_CHAT_METADATA_HIDDEN",
        "error_message": "Chat metadata is not available in the management control plane.",
    }, status=403)


def _management_user_mutations_enabled():
    return bool(app.config.get("CHATMGT_MANAGEMENT_USER_MUTATIONS_ENABLED", False))


def _account_by_id(tenant_id, user_id):
    return ManagementAccount.query.filter(
        ManagementAccount.tenant_id == tenant_id,
        ManagementAccount.id == str(user_id),
        ManagementAccount.active.is_(True),
    ).first()


def _bump_auth_version(account):
    properties = dict(account.properties or {})
    properties["auth_version"] = int(properties.get("auth_version") or 0) + 1
    account.properties = properties
    return properties


def _account_sso_error(error):
    return json({
        "error_code": error.error_code,
        "error_message": str(error),
    }, status=error.status_code)


def _tinode_bridge_request(request):
    expected = str(app.config.get("TINODE_BRIDGE_INTERNAL_KEY") or "").strip()
    supplied = str(request.headers.get("X-Vichat-Tinode-Internal") or "").strip()
    return bool(expected and supplied and hmac.compare_digest(expected, supplied))


def _sso_account(identity, mark_login=True):
    identity = dict(identity)
    account_username = identity["username"]
    account_email = identity.get("email")
    tenant_id = identity["tenant_id"]
    linked_properties = {
        "auth_source": "account",
        "account_user_id": identity["account_user_id"],
        "account_tenant_id": tenant_id,
    }
    account = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == tenant_id,
        ManagementAccount.properties.contains(linked_properties),
    ).first()

    if account is None:
        identity_filters = [func.lower(ManagementAccount.username) == identity["username"]]
        if identity.get("email"):
            identity_filters.append(func.lower(ManagementAccount.email) == identity["email"])
        candidate = ManagementAccount.query.filter(
            ManagementAccount.tenant_id == tenant_id,
            or_(*identity_filters),
        ).first()
        if candidate is not None:
            candidate_properties = candidate.properties or {}
            protected_bootstrap = protected_tinode_account(
                candidate_properties,
                candidate.tinode_username,
                app.config.get("TINODE_ADMIN_USERNAME"),
            )
            if protected_bootstrap:
                if str(candidate.username or "").lower() == identity["username"]:
                    identity["username"] = "sso_{}".format(
                        stable_account_id(tenant_id, identity["account_user_id"])[5:37]
                    )
                if identity.get("email") and str(candidate.email or "").lower() == identity["email"]:
                    identity["email"] = None
                candidate = None
                candidate_properties = {}
            if candidate is not None and candidate_properties.get("auth_source") != "account":
                raise AccountSSOError(
                    "The Account identity conflicts with an existing local Chatmgt account.",
                    409,
                    "ACCOUNT_IDENTITY_CONFLICT",
                )
            if candidate_properties.get("auth_source") == "account" and not account_properties_match(
                candidate_properties, identity
            ):
                raise AccountSSOError(
                    "The Account identity conflicts with an existing Chatmgt account.",
                    409,
                    "ACCOUNT_IDENTITY_CONFLICT",
                )
            account = candidate

    duplicate_query = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == tenant_id,
        func.lower(ManagementAccount.username) == identity["username"],
    )
    if account is not None:
        duplicate_query = duplicate_query.filter(ManagementAccount.id != str(account.id))
    if duplicate_query.first() is not None:
        raise AccountSSOError(
            "The Account username is already mapped inside this tenant.",
            409,
            "ACCOUNT_USERNAME_CONFLICT",
        )
    if identity.get("email"):
        email_query = ManagementAccount.query.filter(
            ManagementAccount.tenant_id == tenant_id,
            func.lower(ManagementAccount.email) == identity["email"],
        )
        if account is not None:
            email_query = email_query.filter(ManagementAccount.id != str(account.id))
        if email_query.first() is not None:
            raise AccountSSOError(
                "The Account email is already mapped inside this tenant.",
                409,
                "ACCOUNT_EMAIL_CONFLICT",
            )

    now = int(time.time())
    tenant = ManagementTenant.query.filter(ManagementTenant.id == tenant_id).first()
    if tenant is None:
        tenant = ManagementTenant(
            id=tenant_id,
            name=identity["tenant_name"],
            active=True,
            created_at=now,
            updated_at=now,
            properties={"auth_source": "account"},
        )
        db.session.add(tenant)
        db.session.flush()
    else:
        tenant.name = identity["tenant_name"]
        tenant.active = True
        tenant.updated_at = now
        tenant_properties = dict(tenant.properties or {})
        tenant_properties["auth_source"] = "account"
        tenant.properties = tenant_properties

    if account is None:
        account = ManagementAccount(
            id=stable_account_id(tenant_id, identity["account_user_id"]),
            tenant_id=tenant_id,
            username=identity["username"],
            email=identity.get("email"),
            password_hash=ACCOUNT_SSO_PASSWORD_MARKER,
            full_name=identity["full_name"],
            role=identity["role"],
            department=identity.get("department") or "",
            title=identity.get("title") or "",
            avatar=identity.get("avatar") or "",
            tinode_username=stable_tinode_username(tenant_id, identity["account_user_id"]),
            active=True,
            created_at=now,
            updated_at=now,
            properties={},
        )
        db.session.add(account)

    directory_projection = bool(identity.get("directory_projection"))
    account.username = identity["username"]
    if not directory_projection or identity.get("email_present"):
        account.email = identity.get("email")
    account.full_name = identity["full_name"]
    if not directory_projection or identity.get("role_present"):
        account.role = identity["role"]
    if not directory_projection or identity.get("department_present"):
        account.department = identity.get("department") or ""
    if not directory_projection or identity.get("title_present"):
        account.title = identity.get("title") or ""
    if not directory_projection or identity.get("avatar_present"):
        account.avatar = identity.get("avatar") or ""
    account.password_hash = ACCOUNT_SSO_PASSWORD_MARKER
    account.active = bool(identity.get("active", True))
    account.updated_at = now
    _repair_unprovisioned_tinode_username(account, identity)
    if mark_login:
        account.last_login_at = now
    properties = dict(account.properties or {})
    properties.update(linked_properties)
    if not directory_projection or identity.get("role_present"):
        properties["account_role"] = identity.get("account_role") or "member"
    properties["account_username"] = account_username or ""
    properties["account_email"] = account_email or ""
    if identity.get("directory_projection"):
        properties["directory_synced_at"] = now
    properties.setdefault("auth_version", 0)
    account.properties = properties
    return tenant, account


async def _validated_account_identity(request, account):
    identity = await current_account_session(
        request,
        preferred_tenant_id=str(account.tenant_id or "").strip(),
    )
    if not account_session_matches(account.properties, identity):
        raise AccountSSOError(
            "The Account session does not match the Chatmgt session.",
            401,
            "ACCOUNT_SESSION_MISMATCH",
        )
    if str(account.role or "member") != identity["role"]:
        account.role = identity["role"]
        properties = _bump_auth_version(account)
        properties["account_role"] = identity.get("account_role") or "member"
        account.properties = properties
        account.updated_at = int(time.time())
        db.session.commit()
        raise AccountSSOError(
            "Account permissions changed; sign in again.",
            401,
            "ACCOUNT_ROLE_CHANGED",
        )
    return identity


async def _management_account_sso_guard(request, current_user, tenant_id):
    if (
        not management_session_requested(request)
        or current_user.get("auth_method") != "account_sso"
    ):
        return None
    account = _account_by_id(tenant_id, _user_id(current_user))
    if account is None:
        return _auth_error()
    try:
        await _validated_account_identity(request, account)
        return None
    except AccountSSOError as error:
        if error.status_code == 503:
            return _account_sso_error(error)
        revoke_request_token(request)
        revoked_error = AccountSSOError(str(error), 401, error.error_code)
        response = clear_auth_cookie(_account_sso_error(revoked_error), request)
        return clear_account_cookie(response)


def _tinode_account_identity(account):
    properties = account.properties or {}
    auth_source = str(properties.get("auth_source") or "local").strip().lower()
    account_user_id = str(account.id)
    if auth_source == "account":
        account_user_id = str(properties.get("account_user_id") or "").strip()
        account_tenant_id = str(properties.get("account_tenant_id") or "").strip()
        if not account_user_id:
            raise AuthError("The Chatmgt account has an invalid Account mapping.", 409)
        if account_tenant_id != str(account.tenant_id):
            raise AuthError("The Account tenant mapping is invalid.", 409)
    elif auth_source != "local":
        raise AuthError("The Chatmgt authentication source is unsupported.", 409)
    return {
        "account_user_id": account_user_id,
        "tenant_id": str(account.tenant_id),
        "full_name": account.full_name or account.username,
    }


def _repair_unprovisioned_tinode_username(account, identity):
    if account.tinode_uid:
        return account.tinode_username
    expected_username = stable_tinode_username(
        identity.get("tenant_id"),
        identity.get("account_user_id"),
    )
    if account.tinode_username != expected_username:
        account.tinode_username = expected_username
    return expected_username


async def _local_tinode_login(account, password):
    identity = _tinode_account_identity(account)
    if not _local_tinode_mirror_enabled():
        return await tinode_sso_login(
            identity,
            account.tinode_username,
            account.tinode_uid,
        )
    legacy_username = account.tinode_username or account.username
    legacy_password = tinode_sso_password(identity, legacy_username)
    disabled_password = tinode_disabled_password(
        account.tenant_id,
        account.id,
        legacy_username,
    )
    try:
        return await tinode_mirror_login(
            account.username,
            password,
            account.full_name or account.username,
            tinode_uid=account.tinode_uid,
            legacy_username=legacy_username,
            legacy_password=legacy_password,
            recovery_passwords=[disabled_password],
        )
    except AuthError as error:
        # Keep existing email-style accounts usable while they are migrated to
        # a Tinode-compatible short username by an administrator.
        if error.status_code == 400 and "cannot be used as a Tinode login" in str(error):
            return await tinode_sso_login(
                identity,
                account.tinode_username,
                account.tinode_uid,
            )
        raise


async def _local_tinode_password_reset(account, new_password, current_password=None):
    if not _local_tinode_mirror_enabled():
        return None
    identity = _tinode_account_identity(account)
    legacy_username = account.tinode_username or account.username
    legacy_password = tinode_sso_password(identity, legacy_username)
    disabled_password = tinode_disabled_password(
        account.tenant_id,
        account.id,
        legacy_username,
    )
    try:
        return await tinode_mirror_login(
            account.username,
            new_password,
            account.full_name or account.username,
            tinode_uid=account.tinode_uid,
            legacy_username=legacy_username,
            legacy_password=legacy_password,
            recovery_passwords=[current_password, disabled_password],
        )
    except AuthError as error:
        if error.status_code == 400 and "cannot be used as a Tinode login" in str(error):
            return None
        raise


async def _disable_local_tinode_login(account):
    if not _local_tinode_mirror_enabled() or not account.tinode_uid:
        return None
    tinode_username = (
        account.username
        if tinode_username_compatible(account.username)
        else account.tinode_username
    )
    disabled_password = tinode_disabled_password(
        account.tenant_id,
        account.id,
        tinode_username,
    )
    await tinode_admin_reset_password(
        tinode_username,
        account.tinode_uid,
        disabled_password,
    )
    return {
        "username": tinode_username,
        "uid": account.tinode_uid,
    }


async def _ensure_tinode_account(account):
    if account.tinode_uid:
        return str(account.tinode_uid)
    identity = _tinode_account_identity(account)
    _repair_unprovisioned_tinode_username(account, identity)
    tinode_auth = await tinode_sso_login(
        identity,
        account.tinode_username,
    )
    tinode_uid = str(tinode_auth.get("uid") or "").strip()
    if not tinode_uid:
        raise AuthError("Tinode did not return a user mapping.", 502)
    account.tinode_uid = tinode_uid
    account.updated_at = int(time.time())
    return tinode_uid


async def _ensure_tinode_accounts(accounts, concurrency=8):
    account_list = list(accounts)
    semaphore = asyncio.Semaphore(max(1, int(concurrency)))

    async def prepare(account):
        async with semaphore:
            return str(account.id), await _ensure_tinode_account(account)

    prepared = await asyncio.gather(*(prepare(account) for account in account_list))
    return dict(prepared)


async def _ensure_tinode_accounts_best_effort(accounts, concurrency=8):
    """Provision newly discovered Account users without blocking directory reads."""
    account_list = [account for account in accounts if account.active and not account.tinode_uid]
    semaphore = asyncio.Semaphore(max(1, int(concurrency)))

    async def prepare(account):
        async with semaphore:
            try:
                return str(account.id), await _ensure_tinode_account(account), None
            except Exception as error:
                return str(account.id), "", error

    results = await asyncio.gather(*(prepare(account) for account in account_list))
    prepared = {account_id: uid for account_id, uid, error in results if uid}
    errors = [(account_id, error) for account_id, uid, error in results if error]
    return prepared, errors


def _active_conversation_accounts(item):
    participants = ConversationParticipant.query.filter(
        ConversationParticipant.tenant_id == item.tenant_id,
        ConversationParticipant.conversation_id == item.id,
        ConversationParticipant.active.is_(True),
        ConversationParticipant.deleted.is_(False),
    ).all()
    participant_ids = [participant.participant_id for participant in participants]
    accounts = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == item.tenant_id,
        ManagementAccount.id.in_(participant_ids),
        ManagementAccount.active.is_(True),
    ).all() if participant_ids else []
    accounts_by_id = {str(account.id): account for account in accounts}
    if set(participant_ids) != set(accounts_by_id):
        raise AuthError("A Chatmgt participant is no longer active in this tenant.", 409)
    return participants, accounts_by_id


def _audit(request, event_name, success=True, tenant_id=None, user_id=None, properties=None):
    try:
        db.session.add(SecurityAuditLog(
            tenant_id=tenant_id,
            user_id=user_id,
            event_name=event_name,
            success=bool(success),
            ip_address=str(request.headers.get("X-Forwarded-For") or getattr(request, "ip", "") or "")[:100],
            user_agent=str(request.headers.get("User-Agent") or "")[:500],
            properties=properties or {},
        ))
        db.session.commit()
    except Exception as error:
        db.session.rollback()
        logger.warning("Could not write security audit event %s: %s", event_name, error)


def _serialize_conversation(item, viewer_id):
    participants = ConversationParticipant.query.filter(
        ConversationParticipant.tenant_id == item.tenant_id,
        ConversationParticipant.conversation_id == item.id,
        ConversationParticipant.deleted.is_(False),
        ConversationParticipant.active.is_(True),
    ).order_by(ConversationParticipant.created_at.asc()).all()
    participant_ids = [participant.participant_id for participant in participants]
    accounts = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == item.tenant_id,
        ManagementAccount.id.in_(participant_ids),
        ManagementAccount.active.is_(True),
    ).all() if participant_ids else []
    accounts_by_id = {str(account.id): account for account in accounts}
    owner = next((participant for participant in participants if participant.role == "OWNER"), None)
    viewer_membership = next(
        (participant for participant in participants if participant.participant_id == viewer_id),
        None,
    )
    notification_muted_until = (
        viewer_membership.notification_muted_until if viewer_membership is not None else None
    )
    pinned_at = viewer_membership.pinned_at if viewer_membership is not None else None
    notifications_muted = notification_muted_until == 0 or (
        notification_muted_until is not None and notification_muted_until > int(time.time())
    )
    properties = item.properties or {}
    is_group = bool(properties.get("is_group"))
    tinode_topic = item.tinode_topic if is_group else direct_peer_tinode_uid(
        viewer_id,
        participant_ids,
        {
            participant_id: accounts_by_id[participant_id].tinode_uid
            for participant_id in participant_ids
            if participant_id in accounts_by_id
        },
    )
    return {
        "id": str(item.id),
        "conversation_no": item.conversation_no,
        "tenant_id": item.tenant_id,
        "tinode_topic": tinode_topic,
        "subject": item.subject,
        "status": item.status,
        "priority": item.priority,
        "last_message_at": item.last_message_at,
        "updated_at": item.updated_at,
        "properties": properties,
        "isGroup": is_group,
        "avatar": properties.get("avatar") or "",
        "participantIds": participant_ids,
        "members": [
            _public_account(accounts_by_id[participant_id])
            for participant_id in participant_ids
            if participant_id in accounts_by_id
        ],
        "adminId": owner.participant_id if owner is not None else "",
        "notificationMutedUntil": notification_muted_until,
        "notificationsMuted": notifications_muted,
        "pinned": pinned_at is not None,
        "pinnedAt": pinned_at,
    }


def _conversation_and_membership(tenant_id, conversation_id, user_id):
    item = Conversation.query.filter(
        Conversation.id == conversation_id,
        Conversation.tenant_id == tenant_id,
        Conversation.deleted.is_(False),
    ).first()
    if item is None:
        return None, None
    membership = ConversationParticipant.query.filter(
        ConversationParticipant.tenant_id == tenant_id,
        ConversationParticipant.conversation_id == item.id,
        ConversationParticipant.participant_id == user_id,
        ConversationParticipant.active.is_(True),
        ConversationParticipant.deleted.is_(False),
    ).first()
    return item, membership


def _iso_timestamp(value):
    if not value:
        return None
    return datetime.datetime.fromtimestamp(value, datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def _friend_request_event(item):
    return {
        "action": "request",
        "requestId": str(item.id),
        "senderId": item.requester_id,
        "requesterId": item.requester_id,
        "requesterName": item.requester_name,
        "recipientId": item.recipient_id,
        "recipientName": item.recipient_name,
        "note": item.note or "",
        "status": "pending",
        "createdAt": _iso_timestamp(item.created_at),
    }


def _friend_response_event(item):
    if item.status == "PENDING":
        return None
    action = "accepted" if item.status == "ACCEPTED" else "rejected"
    return {
        **_friend_request_event(item),
        "action": action,
        "senderId": item.responder_id,
        "responderId": item.responder_id,
        "responderName": item.responder_name,
        "status": action,
        "createdAt": _iso_timestamp(item.responded_at or item.updated_at),
        "respondedAt": _iso_timestamp(item.responded_at or item.updated_at),
    }


@app.route('/api/v1/auth/sso', methods=['POST'])
async def management_sso_login(request):
    if not bool(app.config.get("CHAT_ACCOUNT_SSO_ENABLED", False)):
        return json({
            "error_code": "AUTH_METHOD_DISABLED",
            "error_message": "Account SSO is not enabled for employee Chat login.",
        }, status=403)
    try:
        identity = await current_account_session(request)
        tenant, account = _sso_account(identity)
        # Create the deterministic Tinode identity during the first SSO login.
        # A temporary Tinode outage must not prevent the Account session from
        # reaching ChatUI; the token endpoint will retry the same mapping.
        try:
            await _ensure_tinode_account(account)
        except Exception as error:
            logger.warning(
                "Tinode provisioning deferred for Account user %s: %s",
                identity.get("account_user_id"),
                error,
            )
        db.session.commit()
        revoke_request_token(request)
        token = issue_access_token(account, auth_method="account_sso")
        register_linked_session(request, token)
        response = json({
            "user": _public_account(account, tenant),
            "tenant": _public_tenant(tenant),
            "tenant_id": account.tenant_id,
            "connection": "management",
            **_tenant_options_payload(identity),
        })
        _audit(request, "AUTH_SSO_LOGIN", True, tenant_id=account.tenant_id, user_id=str(account.id))
        return set_auth_cookie(response, token, request)
    except AccountSSOError as error:
        db.session.rollback()
        _audit(request, "AUTH_SSO_LOGIN", False, properties={"error_code": error.error_code})
        return _account_sso_error(error)
    except Exception as error:
        db.session.rollback()
        logger.exception("Account SSO login failed: %s", error)
        _audit(request, "AUTH_SSO_SERVICE", False)
        return json({
            "error_code": "AUTH_SERVICE_ERROR",
            "error_message": "The SSO authentication service is temporarily unavailable.",
        }, status=503)


@app.route('/api/v1/auth/account-login', methods=['POST'])
async def employee_account_credential_login(request):
    if not _employee_account_credential_login_enabled():
        return json({
            "error_code": "AUTH_METHOD_DISABLED",
            "error_message": "UpGO Account email/password login is disabled.",
        }, status=403)

    body = request.json or {}
    identity_input = str(body.get("identity") or body.get("username") or body.get("email") or "").strip()
    # Account is authoritative for tenant routing. A browser/mobile supplied
    # tenant hint must never select or reject the authenticated company.
    rate_limit_tenant = "account"
    tenant_id = rate_limit_tenant
    ip_address = str(getattr(request, "ip", "") or "")[:100]
    if login_rate_limited(rate_limit_tenant, identity_input.lower(), ip_address):
        return json({
            "error_code": "LOGIN_RATE_LIMITED",
            "error_message": "Too many failed login attempts. Try again later.",
        }, status=429)

    try:
        identity, account_cookie = await login_account_with_credentials(
            identity_input,
            body.get("password"),
        )
        tenant_id = str(identity.get("tenant_id") or "").strip()
        if not tenant_id:
            raise AccountSSOError(
                "The UpGO Account has no active company membership.",
                403,
                "ACCOUNT_TENANT_INVALID",
            )
        tenant, account = _sso_account(identity)
        try:
            await _ensure_tinode_account(account)
        except Exception as error:
            logger.warning(
                "Tinode provisioning deferred for Account user %s: %s",
                identity.get("account_user_id"),
                error,
            )
        db.session.commit()
        clear_login_failures(rate_limit_tenant, identity_input.lower(), ip_address)
        revoke_request_token(request)
        token = issue_access_token(account, auth_method="account_sso")
        register_linked_session(request, token)
        response_payload = {
            "user": _public_account(account, tenant),
            "tenant": _public_tenant(tenant),
            "tenant_id": account.tenant_id,
            "connection": "management",
        }
        response_payload.update(_tenant_options_payload(identity))
        response_payload.update(mobile_access_token_payload(request, token))
        linked_devices = _mobile_linked_devices(request, token)
        if linked_devices is not None:
            response_payload["linked_devices"] = linked_devices
        response = json(response_payload)
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
        set_account_cookie(response, account_cookie)
        _audit(
            request,
            "AUTH_ACCOUNT_CREDENTIAL_LOGIN",
            True,
            tenant_id=account.tenant_id,
            user_id=str(account.id),
        )
        return set_auth_cookie(response, token, request)
    except AccountSSOError as error:
        db.session.rollback()
        record_login_failure(rate_limit_tenant, identity_input.lower(), ip_address)
        _audit(
            request,
            "AUTH_ACCOUNT_CREDENTIAL_LOGIN",
            False,
            tenant_id=tenant_id,
            properties={"error_code": error.error_code, "identity": identity_input.lower()},
        )
        return _account_sso_error(error)
    except Exception as error:
        db.session.rollback()
        logger.exception("UpGO Account credential login failed: %s", error)
        _audit(request, "AUTH_ACCOUNT_CREDENTIAL_SERVICE", False, tenant_id=tenant_id)
        return json({
            "error_code": "AUTH_SERVICE_ERROR",
            "error_message": "The Account authentication service is temporarily unavailable.",
        }, status=503)


async def _password_login(request, session_scope=CHAT_SESSION_SCOPE):
    body = request.json or {}
    identity = str(body.get("identity") or body.get("username") or "").strip().lower()
    password = str(body.get("password") or "")
    tenant_id = str(body.get("tenant_id") or app.config.get("CHATMGT_DEFAULT_TENANT") or "").strip()
    ip_address = str(getattr(request, "ip", "") or "")[:100]
    if login_rate_limited(tenant_id, identity, ip_address):
        return json({"error_code": "LOGIN_RATE_LIMITED", "error_message": "Too many failed login attempts. Try again later."}, status=429)
    try:
        tenant = _tenant_by_id(tenant_id)
        account = ManagementAccount.query.filter(
            ManagementAccount.tenant_id == tenant_id,
            ManagementAccount.active.is_(True),
            or_(
                func.lower(ManagementAccount.username) == identity,
                func.lower(ManagementAccount.email) == identity,
            ),
        ).first() if tenant is not None else None
    except Exception as error:
        db.session.rollback()
        logger.exception("Management account lookup failed: %s", error)
        return json({
            "error_code": "AUTH_STORAGE_ERROR",
            "error_message": "The account database is temporarily unavailable.",
        }, status=503)
    if (
        account is None
        or (account.properties or {}).get("auth_source") == "account"
        or not verify_password(password, account.password_hash)
    ):
        record_login_failure(tenant_id, identity, ip_address)
        _audit(request, "AUTH_LOGIN", False, tenant_id=tenant_id, properties={"identity": identity})
        return json({"error_code": "LOGIN_FAILED", "error_message": "Invalid username or password."}, status=401)
    try:
        clear_login_failures(tenant_id, identity, ip_address)
        account.last_login_at = int(time.time())
        account.updated_at = int(time.time())
        tinode_auth = (
            await _local_tinode_login(account, password)
            if session_scope == CHAT_SESSION_SCOPE
            else None
        )
        if tinode_auth:
            account.tinode_username = str(tinode_auth.get("username") or account.username)
            account.tinode_uid = tinode_auth.get("uid") or account.tinode_uid
        db.session.commit()
        token = issue_access_token(
            account,
            session_scope=session_scope,
            tinode_auth=tinode_auth if session_scope == CHAT_SESSION_SCOPE else None,
        )
        register_linked_session(request, token)
        response_payload = {
            "user": _public_account(account, tenant),
            "tenant": _public_tenant(tenant),
            "tenant_id": account.tenant_id,
            "connection": "tinode" if tinode_auth else "management",
        }
        if tinode_auth:
            response_payload["tinode_auth"] = {
                "username": account.tinode_username,
                "uid": account.tinode_uid,
                "token": tinode_auth.get("token"),
                "expires": tinode_auth.get("expires"),
            }
        linked_devices = _mobile_linked_devices(request, token)
        if linked_devices is not None:
            response_payload["linked_devices"] = linked_devices
        response = json(response_payload)
        _audit(request, "AUTH_LOGIN", True, tenant_id=tenant_id, user_id=str(account.id))
        return set_auth_cookie(response, token, request)
    except AuthError as error:
        db.session.rollback()
        _audit(
            request,
            "AUTH_LOGIN_TINODE",
            False,
            tenant_id=tenant_id,
            user_id=str(account.id),
            properties={"status_code": error.status_code},
        )
        return json({
            "error_code": "TINODE_AUTH_FAILED",
            "error_message": str(error),
        }, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        logger.exception("Management login failed after account verification: %s", error)
        _audit(request, "AUTH_LOGIN_SERVICE", False, tenant_id=tenant_id, user_id=str(account.id))
        return json({
            "error_code": "AUTH_SERVICE_ERROR",
            "error_message": "The internal authentication service is temporarily unavailable.",
        }, status=503)


@app.route('/login', methods=['POST'])
async def management_login(request):
    if not management_session_requested(request):
        return json({
            "error_code": "FORBIDDEN",
            "error_message": "The management session scope is required.",
        }, status=403)
    if _admin_account_sso_enabled():
        return json({
            "error_code": "AUTH_METHOD_DISABLED",
            "error_message": "Chatmgt administrators must sign in through UpGO Account.",
        }, status=403)
    return await _password_login(
        request,
        session_scope=MANAGEMENT_SESSION_SCOPE,
    )


@app.route('/api/v1/admin/sso', methods=['POST'])
async def management_admin_sso_login(request):
    if not management_session_requested(request):
        return json({
            "error_code": "FORBIDDEN",
            "error_message": "The management session scope is required.",
        }, status=403)
    if not _admin_account_sso_enabled():
        return json({
            "error_code": "AUTH_METHOD_DISABLED",
            "error_message": "Account SSO is not enabled for Chatmgt administrators.",
        }, status=403)
    try:
        identity = await current_account_session(request)
        if not _is_admin(identity):
            _audit(
                request,
                "AUTH_ADMIN_SSO_LOGIN",
                False,
                tenant_id=identity.get("tenant_id"),
                properties={
                    "account_user_id": identity.get("account_user_id"),
                    "error_code": "ACCOUNT_ADMIN_REQUIRED",
                },
            )
            return json({
                "error_code": "ACCOUNT_ADMIN_REQUIRED",
                "error_message": "The current UpGO Account user is not a tenant administrator.",
            }, status=403)
        tenant, account = _sso_account(identity)
        db.session.commit()
        revoke_request_token(request)
        token = issue_access_token(
            account,
            auth_method="account_sso",
            session_scope=MANAGEMENT_SESSION_SCOPE,
        )
        register_linked_session(request, token)
        response = json({
            "user": _public_account(account, tenant),
            "tenant": _public_tenant(tenant),
            "tenant_id": account.tenant_id,
            "connection": "management",
            **_tenant_options_payload(identity),
        })
        _audit(
            request,
            "AUTH_ADMIN_SSO_LOGIN",
            True,
            tenant_id=account.tenant_id,
            user_id=str(account.id),
        )
        return set_auth_cookie(response, token, request)
    except AccountSSOError as error:
        db.session.rollback()
        _audit(
            request,
            "AUTH_ADMIN_SSO_LOGIN",
            False,
            properties={"error_code": error.error_code},
        )
        return _account_sso_error(error)
    except Exception as error:
        db.session.rollback()
        logger.exception("Account administrator SSO login failed: %s", error)
        _audit(request, "AUTH_ADMIN_SSO_SERVICE", False)
        return json({
            "error_code": "AUTH_SERVICE_ERROR",
            "error_message": "The administrator SSO service is temporarily unavailable.",
        }, status=503)


@app.route('/api/v1/auth/login', methods=['POST'])
async def employee_password_login(request):
    if _employee_account_sso_enabled():
        return json({
            "error_code": "AUTH_METHOD_DISABLED",
            "error_message": "Employee password login is disabled. Use UpGO Account.",
        }, status=403)
    return await _password_login(request)


@app.route('/api/v1/auth/me', methods=['GET'])
async def management_current_user(request):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _current_session_error(request)
    account = _account_by_id(tenant_id, _user_id(current_user))
    if account is None:
        return _auth_error()
    tenant = _tenant_by_id(tenant_id)
    if tenant is None:
        return _auth_error()
    account_identity = None
    if current_user.get("auth_method") == "account_sso":
        try:
            account_identity = await _validated_account_identity(request, account)
        except AccountSSOError as error:
            if error.status_code != 503:
                revoke_request_token(request)
                revoked_error = AccountSSOError(str(error), 401, error.error_code)
                response = clear_auth_cookie(_account_sso_error(revoked_error), request)
                return clear_account_cookie(response)
            return _account_sso_error(error)
    response = json({
        "user": _public_account(account, tenant),
        "tenant": _public_tenant(tenant),
        "tenant_id": tenant_id,
        "connection": "management",
        "linked_devices": linked_session_devices(request, current_user),
        **_tenant_options_payload(account_identity),
    })
    if management_session_requested(request):
        return set_auth_cookie(response, token_from_request(request), request)
    return response


@app.route('/api/v1/auth/switch-tenant', methods=['POST'])
async def management_switch_tenant(request):
    """Rotate only the Chat session after a verified Account tenant switch."""
    if management_session_requested(request):
        return _management_scope_error()
    current_user, current_tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    if current_user.get("auth_method") != "account_sso":
        return json({
            "error_code": "ACCOUNT_SSO_REQUIRED",
            "error_message": "An UpGO Account session is required to switch companies.",
        }, status=403)

    body = request.json or {}
    requested_tenant_id = str(
        body.get("tenant_id") or body.get("tenantId") or ""
    ).strip()
    if not requested_tenant_id or len(requested_tenant_id) > 50:
        return json({
            "error_code": "ACCOUNT_TENANT_REQUIRED",
            "error_message": "A valid company is required.",
        }, status=400)

    current_account = _account_by_id(current_tenant_id, _user_id(current_user))
    if current_account is None:
        return _auth_error()
    try:
        identity = await current_account_session(
            request,
            preferred_tenant_id=requested_tenant_id,
        )
        linked_user_id = str(
            (current_account.properties or {}).get("account_user_id") or ""
        ).strip()
        if linked_user_id != str(identity.get("account_user_id") or "").strip():
            raise AccountSSOError(
                "The Account session does not match the Chatmgt session.",
                401,
                "ACCOUNT_SESSION_MISMATCH",
            )
        _switch_payload, switched_account_cookie = await switch_account_tenant(
            request,
            requested_tenant_id,
        )
        switched_identity = await current_account_session(request)
        if (
            str(switched_identity.get("account_user_id") or "").strip()
            != str(identity.get("account_user_id") or "").strip()
            or str(switched_identity.get("tenant_id") or "").strip()
            != requested_tenant_id
        ):
            raise AccountSSOError(
                "Account did not confirm the requested tenant switch.",
                409,
                "ACCOUNT_TENANT_SWITCH_UNCONFIRMED",
            )
        identity = switched_identity
        tenant, account = _sso_account(identity)
        try:
            await _ensure_tinode_account(account)
        except Exception as error:
            logger.warning(
                "Tinode provisioning deferred after Account tenant switch for user %s: %s",
                identity.get("account_user_id"),
                error,
            )
        db.session.commit()
        revoke_request_token(request)
        token = issue_access_token(account, auth_method="account_sso")
        register_linked_session(request, token)
        response_payload = {
            "user": _public_account(account, tenant),
            "tenant": _public_tenant(tenant),
            "tenant_id": account.tenant_id,
            "connection": "management",
        }
        response_payload.update(_tenant_options_payload(identity))
        response_payload["switched"] = True
        response_payload["previous_tenant_id"] = str(current_tenant_id or "")
        response = json(response_payload)
        response.headers["Cache-Control"] = "no-store"
        set_account_cookie(response, switched_account_cookie)
        _audit(
            request,
            "AUTH_TENANT_SWITCH",
            True,
            tenant_id=account.tenant_id,
            user_id=str(account.id),
            properties={"previous_tenant_id": str(current_tenant_id or "")},
        )
        return set_auth_cookie(response, token, request)
    except AccountSSOError as error:
        db.session.rollback()
        _audit(
            request,
            "AUTH_TENANT_SWITCH",
            False,
            tenant_id=current_tenant_id,
            user_id=_user_id(current_user),
            properties={"error_code": error.error_code},
        )
        return _account_sso_error(error)
    except Exception as error:
        db.session.rollback()
        logger.exception("Account tenant switch failed: %s", error)
        _audit(
            request,
            "AUTH_TENANT_SWITCH_SERVICE",
            False,
            tenant_id=current_tenant_id,
            user_id=_user_id(current_user),
        )
        return json({
            "error_code": "ACCOUNT_TENANT_SWITCH_FAILED",
            "error_message": "The company switch is temporarily unavailable.",
        }, status=503)


@app.route('/api/v1/auth/devices', methods=['GET'])
async def management_linked_devices(request):
    if management_session_requested(request):
        return _auth_error()
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    return json({
        "linked_devices": linked_session_devices(request, current_user),
        "tenant_id": tenant_id,
    })


@app.route('/api/v1/auth/tinode-token', methods=['POST'])
async def management_tinode_token(request):
    current_user, tenant_id = _identity(request)
    if current_user is None or management_session_requested(request):
        return _auth_error()
    account = _account_by_id(tenant_id, _user_id(current_user))
    if account is None:
        return _auth_error()
    try:
        refreshed_session = False
        if current_user.get("auth_method") == "account_sso":
            await _validated_account_identity(request, account)
        if _local_tinode_mirror_enabled() and current_user.get("auth_method") != "account_sso":
            tinode_auth = tinode_auth_from_request(request)
            mapping_matches = bool(
                tinode_auth
                and tinode_auth.get("username") == str(account.tinode_username or account.username or "").lower()
                and (
                    not account.tinode_uid
                    or tinode_auth.get("uid") == str(account.tinode_uid)
                )
            )
            if not mapping_matches or tinode_auth_expired(tinode_auth):
                password = str((request.json or {}).get("password") or "")
                if not password or not verify_password(password, account.password_hash):
                    return json({
                        "error_code": "TINODE_REAUTH_REQUIRED",
                        "error_message": "Enter the employee password again to renew the Tinode connection.",
                    }, status=401)
                tinode_auth = await _local_tinode_login(account, password)
                account.tinode_username = str(tinode_auth.get("username") or account.username)
                account.tinode_uid = tinode_auth.get("uid") or account.tinode_uid
                account.updated_at = int(time.time())
                db.session.commit()
                refreshed_session = True
            if (
                not tinode_auth
                or tinode_auth.get("username") != str(account.tinode_username or account.username or "").lower()
                or (
                    account.tinode_uid
                    and tinode_auth.get("uid") != str(account.tinode_uid)
                )
            ):
                return json({
                    "error_code": "TINODE_REAUTH_REQUIRED",
                    "error_message": "The Chatmgt session must be renewed before Tinode can reconnect.",
                }, status=401)
        else:
            identity = _tinode_account_identity(account)
            _repair_unprovisioned_tinode_username(account, identity)
            tinode_auth = await tinode_sso_login(
                identity,
                account.tinode_username,
                account.tinode_uid,
            )
            account.tinode_uid = tinode_auth.get("uid") or account.tinode_uid
            account.updated_at = int(time.time())
            db.session.commit()
        response_payload = {
            "connection": "tinode",
            "tinode_auth": {
                "username": tinode_auth.get("username") or account.tinode_username,
                "uid": tinode_auth.get("uid") or account.tinode_uid,
                "token": tinode_auth.get("token"),
                "expires": tinode_auth.get("expires"),
            },
        }
        if refreshed_session:
            refreshed_token = issue_access_token(
                account,
                auth_method=current_user.get("auth_method") or "password",
                session_scope=CHAT_SESSION_SCOPE,
                tinode_auth=tinode_auth,
            )
            revoke_request_token(request)
            register_linked_session(request, refreshed_token)
            response_payload.update(mobile_access_token_payload(request, refreshed_token))
        response = json(response_payload)
        if refreshed_session:
            return set_auth_cookie(response, refreshed_token, request)
        return response
    except AccountSSOError as error:
        db.session.rollback()
        if error.status_code != 503:
            revoke_request_token(request)
            revoked_error = AccountSSOError(str(error), 401, error.error_code)
            return clear_auth_cookie(_account_sso_error(revoked_error), request)
        return _account_sso_error(error)
    except AuthError as error:
        db.session.rollback()
        return json({"error_code": "TINODE_AUTH_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        logger.exception("Tinode SSO token refresh failed: %s", error)
        return json({
            "error_code": "TINODE_TOKEN_FAILED",
            "error_message": "Tinode token refresh is temporarily unavailable.",
        }, status=503)


@app.route('/api/v1/auth/tinode-token-bridge', methods=['POST'])
async def bridge_tinode_token(request):
    """Issue Tinode auth for the trusted bridge after Account login succeeds."""
    if not _tinode_bridge_request(request):
        return json({
            "error_code": "FORBIDDEN",
            "error_message": "Tinode bridge authentication is required.",
        }, status=403)
    current_user, tenant_id = _identity(request)
    if current_user is None or management_session_requested(request):
        return _auth_error()
    if current_user.get("auth_method") != "account_sso":
        return json({
            "error_code": "FORBIDDEN",
            "error_message": "An UpGO Account session is required.",
        }, status=403)
    account = _account_by_id(tenant_id, _user_id(current_user))
    if account is None:
        return _auth_error()
    try:
        identity = _tinode_account_identity(account)
        _repair_unprovisioned_tinode_username(account, identity)
        tinode_auth = await tinode_sso_login(
            identity,
            account.tinode_username,
            account.tinode_uid,
        )
        account.tinode_uid = tinode_auth.get("uid") or account.tinode_uid
        account.updated_at = int(time.time())
        db.session.commit()
        response = json({
            "connection": "tinode",
            "tinode_auth": {
                "username": tinode_auth.get("username") or account.tinode_username,
                "uid": tinode_auth.get("uid") or account.tinode_uid,
                "token": tinode_auth.get("token"),
                "expires": tinode_auth.get("expires"),
            },
        })
        response.headers["Cache-Control"] = "no-store"
        return response
    except AuthError as error:
        db.session.rollback()
        return json({"error_code": "TINODE_AUTH_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        logger.exception("Tinode bridge token exchange failed: %s", error)
        return json({
            "error_code": "TINODE_TOKEN_FAILED",
            "error_message": "Tinode token exchange is temporarily unavailable.",
        }, status=503)


@app.route('/api/v1/auth/logout', methods=['POST'])
async def management_logout(request):
    try:
        token_user = current_jwt_user(request)
    except Exception:
        token_user = None
    current_user, tenant_id = _identity(request)
    logout_user = current_user or token_user
    account = _account_by_id(tenant_id, _user_id(current_user)) if current_user is not None else None
    tenant = _tenant_by_id(tenant_id) if tenant_id else None
    account_sso_session = bool(
        logout_user is not None
        and logout_user.get("auth_method") == "account_sso"
    )
    account_logout_confirmed = False
    if account_sso_session:
        try:
            await logout_account_session(request)
            account_logout_confirmed = True
        except AccountSSOError as error:
            if error.error_code != "ACCOUNT_LOGIN_REQUIRED":
                logger.warning("Account logout was not confirmed: %s", error.error_code)
                _audit(
                    request,
                    "AUTH_ACCOUNT_LOGOUT",
                    False,
                    tenant_id=tenant_id,
                    user_id=_user_id(logout_user),
                    properties={"error_code": error.error_code},
                )
    if current_user is not None:
        _audit(request, "AUTH_LOGOUT", True, tenant_id=tenant_id, user_id=_user_id(current_user))
    revoke_request_token(request)
    response = clear_auth_cookie(json({
        "logged_out": True,
        "user": _public_account(account, tenant) if account is not None else None,
        "tenant": _public_tenant(tenant),
        "tenant_id": tenant_id,
        "account_logout_confirmed": account_logout_confirmed,
    }), request)
    if account_sso_session:
        response = clear_account_cookie(response)
    return response


@app.route('/api/v1/auth/health', methods=['GET'])
async def management_auth_health(request):
    smtp_username = str(app.config.get("CHAT_SMTP_USERNAME") or "").strip()
    smtp_password = str(app.config.get("CHAT_SMTP_PASSWORD") or "")
    smtp_configured = bool(
        str(app.config.get("CHAT_SMTP_HOST") or "").strip()
        and str(app.config.get("CHAT_SMTP_FROM") or "").strip()
        and (not smtp_username or smtp_password)
    )
    tinode_admin_configured = bool(
        str(app.config.get("TINODE_ADMIN_USERNAME") or "").strip()
        and str(app.config.get("TINODE_ADMIN_PASSWORD") or "").strip()
    )
    account_sso_enabled = _employee_account_sso_enabled()
    admin_account_sso_enabled = _admin_account_sso_enabled()
    account_service_configured = account_sso_configured()
    account_configured = account_sso_enabled and account_service_configured
    account_credential_login_enabled = _employee_account_credential_login_enabled()
    account_directory_configured = bool(
        account_configured
        and str(app.config.get("ACCOUNT_SSO_DIRECTORY_PATH") or "").strip()
    )
    tinode_sso_configured = bool(
        len(str(app.config.get("TINODE_SSO_SECRET") or "")) >= 32
        and tinode_admin_configured
        and str(app.config.get("TINODE_INTERNAL_WS_URL") or "").strip()
        and str(app.config.get("TINODE_API_KEY") or "").strip()
    )
    employee_auth_configured = bool(
        len(str(app.config.get("CHAT_AUTH_JWT_SECRET") or "")) >= 32
        and (
            account_configured
            if account_sso_enabled
            else (
                str(app.config.get("CHATMGT_DEFAULT_TENANT") or "").strip()
                and tinode_sso_configured
            )
        )
    )
    return json({
        "status": "ok",
        "employee_auth": {
            "configured": employee_auth_configured,
            "login_endpoint": (
                "/api/v1/auth/account-login"
                if account_credential_login_enabled
                else ("/api/v1/auth/sso" if account_sso_enabled else "/api/v1/auth/login")
            ),
        },
        "account_sso": {
            "enabled": account_sso_enabled,
            "configured": account_configured,
            "credential_login_enabled": account_credential_login_enabled,
            "admin_configured": bool(
                admin_account_sso_enabled and account_service_configured
            ),
            "directory_configured": account_directory_configured,
            "tinode_bridge_configured": tinode_sso_configured,
            "local_credentials_mirrored": _local_tinode_mirror_enabled(),
        },
        "management_data": {
            "configured": account_directory_configured if account_sso_enabled else employee_auth_configured,
            "directory_endpoint": "/api/v1/chat/users",
            "conversation_endpoint": "/api/v1/conversation",
            "friend_request_endpoint": "/api/v1/friend-request",
        },
        "management_session": {
            "isolated": True,
            "cookie_secure": bool(app.config.get("CHAT_AUTH_COOKIE_SECURE", False)),
            "account_sso_enabled": admin_account_sso_enabled,
            "configured": bool(
                len(str(app.config.get("CHAT_AUTH_JWT_SECRET") or "")) >= 32
                and (account_service_configured if admin_account_sso_enabled else True)
            ),
            "login_endpoint": "/api/v1/admin/sso" if admin_account_sso_enabled else "/login",
            "local_password_login_enabled": not admin_account_sso_enabled,
            "password_owner": "account" if admin_account_sso_enabled else "chatmgt",
        },
        "password_reset": {
            "delivery_configured": smtp_configured or bool(app.config.get("CHAT_PASSWORD_RESET_DEBUG", False)),
            "tinode_admin_configured": tinode_admin_configured,
            "debug": bool(app.config.get("CHAT_PASSWORD_RESET_DEBUG", False)),
        },
    })


@app.route('/api/v1/auth/forgot-password', methods=['POST'])
async def management_forgot_password(request):
    body = request.json or {}
    identity = str(body.get("identity") or body.get("email") or body.get("username") or "").strip().lower()
    tenant_id = str(body.get("tenant_id") or app.config.get("CHATMGT_DEFAULT_TENANT") or "").strip()
    ip_address = str(getattr(request, "ip", "") or "")[:100]
    generic_response = {
        "accepted": True,
        "message": "If the account exists, password reset instructions will be sent shortly.",
    }
    if not identity or not tenant_id:
        return json(generic_response, status=202)
    if password_reset_rate_limited(tenant_id, identity, ip_address):
        return json(generic_response, status=202)
    record_password_reset_request(tenant_id, identity, ip_address)

    account = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == tenant_id,
        ManagementAccount.active.is_(True),
        or_(
            func.lower(ManagementAccount.username) == identity,
            func.lower(ManagementAccount.email) == identity,
        ),
    ).first()
    if account is None or not account.email or (account.properties or {}).get("auth_source") == "account":
        _audit(request, "AUTH_PASSWORD_RESET_REQUEST", True, tenant_id=tenant_id, properties={"matched": False})
        return json(generic_response, status=202)

    now = int(time.time())
    raw_token = create_password_reset_token()
    reset_url = build_password_reset_url(raw_token)
    try:
        PasswordResetToken.query.filter(
            PasswordResetToken.tenant_id == tenant_id,
            PasswordResetToken.account_id == str(account.id),
            PasswordResetToken.used_at.is_(None),
        ).update({PasswordResetToken.used_at: now}, synchronize_session=False)
        db.session.add(PasswordResetToken(
            id="pwd-{}".format(uuid.uuid4().hex),
            tenant_id=tenant_id,
            account_id=str(account.id),
            token_hash=password_reset_token_hash(raw_token),
            expires_at=now + int(app.config.get("CHAT_PASSWORD_RESET_TTL", 1800)),
            requested_ip=ip_address,
            created_at=now,
        ))
        db.session.commit()
        email_sent = False
        if reset_url:
            try:
                email_sent = await send_password_reset_email(account, reset_url)
            except Exception as error:
                logger.warning("Password reset email failed for %s: %s", account.id, error)
        _audit(
            request,
            "AUTH_PASSWORD_RESET_REQUEST",
            True,
            tenant_id=tenant_id,
            user_id=str(account.id),
            properties={"email_sent": email_sent},
        )
        if bool(app.config.get("CHAT_PASSWORD_RESET_DEBUG", False)):
            generic_response["debug_reset_url"] = reset_url
        return json(generic_response, status=202)
    except Exception as error:
        db.session.rollback()
        logger.exception("Password reset request failed: %s", error)
        _audit(request, "AUTH_PASSWORD_RESET_REQUEST", False, tenant_id=tenant_id, user_id=str(account.id))
        return json(generic_response, status=202)


@app.route('/api/v1/auth/reset-password', methods=['POST'])
async def management_reset_password(request):
    body = request.json or {}
    raw_token = str(body.get("token") or "").strip()
    new_password = str(body.get("new_password") or body.get("password") or "")
    if not raw_token or not new_password:
        return json({"error_code": "PARAM_ERROR", "error_message": "Reset token and new password are required."}, status=400)
    try:
        new_password_hash = hash_password(new_password)
    except AuthError as error:
        return json({"error_code": "PASSWORD_INVALID", "error_message": str(error)}, status=error.status_code)

    now = int(time.time())
    reset_token = PasswordResetToken.query.filter(
        PasswordResetToken.token_hash == password_reset_token_hash(raw_token),
        PasswordResetToken.used_at.is_(None),
        PasswordResetToken.expires_at > now,
    ).first()
    if reset_token is None:
        return json({"error_code": "RESET_TOKEN_INVALID", "error_message": "The reset link is invalid or has expired."}, status=400)
    account = ManagementAccount.query.filter(
        ManagementAccount.id == reset_token.account_id,
        ManagementAccount.tenant_id == reset_token.tenant_id,
        ManagementAccount.active.is_(True),
    ).first()
    if account is None:
        return json({"error_code": "RESET_TOKEN_INVALID", "error_message": "The reset link is invalid or has expired."}, status=400)
    if (account.properties or {}).get("auth_source") == "account":
        return json({
            "error_code": "AUTH_METHOD_DISABLED",
            "error_message": "Password changes are managed by UpGO Account.",
        }, status=403)
    try:
        tinode_auth = await _local_tinode_password_reset(account, new_password)
        account.password_hash = new_password_hash
        if tinode_auth:
            account.tinode_username = tinode_auth.get("username") or account.tinode_username
            account.tinode_uid = tinode_auth.get("uid") or account.tinode_uid
        properties = _bump_auth_version(account)
        properties["must_change_password"] = False
        properties["password_changed_at"] = now
        account.properties = properties
        account.updated_at = now
        reset_token.used_at = now
        PasswordResetToken.query.filter(
            PasswordResetToken.account_id == str(account.id),
            PasswordResetToken.used_at.is_(None),
        ).update({PasswordResetToken.used_at: now}, synchronize_session=False)
        db.session.commit()
        _audit(request, "AUTH_PASSWORD_RESET", True, tenant_id=account.tenant_id, user_id=str(account.id))
        return clear_auth_cookie(json({"changed": True}), request)
    except AuthError as error:
        db.session.rollback()
        _audit(request, "AUTH_PASSWORD_RESET", False, tenant_id=account.tenant_id, user_id=str(account.id))
        return json({"error_code": "TINODE_PASSWORD_SYNC_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        logger.exception("Password reset failed: %s", error)
        _audit(request, "AUTH_PASSWORD_RESET", False, tenant_id=account.tenant_id, user_id=str(account.id))
        return json({"error_code": "PASSWORD_RESET_FAILED", "error_message": "Password reset is temporarily unavailable."}, status=503)


@app.route('/api/v1/auth/password', methods=['POST'])
async def management_change_password(request):
    if management_session_requested(request):
        return _management_user_action_error()
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    body = request.json or {}
    current_password = str(body.get("current_password") or "")
    new_password = str(body.get("new_password") or "")
    if not current_password or not new_password:
        return json({"error_code": "PARAM_ERROR", "error_message": "Current and new passwords are required."}, status=400)
    if current_password == new_password:
        return json({"error_code": "PARAM_ERROR", "error_message": "The new password must be different."}, status=400)
    try:
        new_password_hash = hash_password(new_password)
    except AuthError as error:
        return json({"error_code": "PASSWORD_INVALID", "error_message": str(error)}, status=error.status_code)
    account = _account_by_id(tenant_id, _user_id(current_user))
    if account is not None and (account.properties or {}).get("auth_source") == "account":
        return json({
            "error_code": "AUTH_METHOD_DISABLED",
            "error_message": "Password changes are managed by UpGO Account.",
        }, status=403)
    if account is None or not verify_password(current_password, account.password_hash):
        _audit(request, "AUTH_PASSWORD_CHANGE", False, tenant_id=tenant_id, user_id=_user_id(current_user))
        return json({"error_code": "PASSWORD_INVALID", "error_message": "Current password is invalid."}, status=401)
    try:
        management_scope = management_session_requested(request)
        tinode_auth = await _local_tinode_password_reset(
            account,
            new_password,
            current_password=current_password,
        )
        account.password_hash = new_password_hash
        if tinode_auth:
            account.tinode_username = tinode_auth.get("username") or account.tinode_username
            account.tinode_uid = tinode_auth.get("uid") or account.tinode_uid
        properties = _bump_auth_version(account)
        properties["must_change_password"] = False
        properties["password_changed_at"] = int(time.time())
        account.properties = properties
        account.updated_at = int(time.time())
        revoke_request_token(request)
        db.session.commit()
        _audit(
            request,
            "AUTH_MANAGEMENT_PASSWORD_CHANGE" if management_scope else "AUTH_PASSWORD_CHANGE",
            True,
            tenant_id=tenant_id,
            user_id=str(account.id),
        )
        return clear_auth_cookie(json({"changed": True}), request)
    except AuthError as error:
        db.session.rollback()
        _audit(request, "AUTH_PASSWORD_CHANGE", False, tenant_id=tenant_id, user_id=_user_id(current_user))
        return json({"error_code": "TINODE_PASSWORD_SYNC_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        logger.exception("Password change failed for account %s: %s", account.id, error)
        return json({"error_code": "PASSWORD_CHANGE_FAILED", "error_message": "Password change is temporarily unavailable."}, status=503)


@app.route('/api/v1/auth/profile', methods=['PUT'])
async def management_update_profile(request):
    if management_session_requested(request):
        return _management_user_action_error()
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    account = _account_by_id(tenant_id, _user_id(current_user))
    if account is None:
        return _auth_error()
    body = request.json or {}
    if (account.properties or {}).get("auth_source") == "account":
        try:
            identity = await _validated_account_identity(request, account)
            updated_identity = await update_account_profile(request, identity, body)
            tenant, updated_account = _sso_account(updated_identity, mark_login=False)
            db.session.commit()
            _audit(request, "ACCOUNT_PROFILE_UPDATED", True, tenant_id=tenant_id, user_id=str(updated_account.id))
            return json({"user": _public_account(updated_account, tenant)})
        except AccountSSOError as error:
            db.session.rollback()
            _audit(
                request,
                "ACCOUNT_PROFILE_UPDATED",
                False,
                tenant_id=tenant_id,
                user_id=str(account.id),
                properties={"error_code": error.error_code},
            )
            if error.error_code in (
                "ACCOUNT_LOGIN_REQUIRED",
                "ACCOUNT_SESSION_MISMATCH",
                "ACCOUNT_TENANT_INVALID",
            ):
                revoke_request_token(request)
                response = clear_auth_cookie(_account_sso_error(error), request)
                return clear_account_cookie(response)
            return _account_sso_error(error)
        except Exception as error:
            db.session.rollback()
            logger.exception("Account profile update failed: %s", error)
            return json({
                "error_code": "ACCOUNT_PROFILE_UPDATE_FAILED",
                "error_message": "Profile update failed.",
            }, status=500)
    full_name = str(body.get("name") or body.get("full_name") or account.full_name or "").strip()
    email = str(body.get("email") if "email" in body else account.email or "").strip().lower() or None
    if not full_name:
        return json({"error_code": "PARAM_ERROR", "error_message": "Full name is required."}, status=400)
    if email:
        duplicate = ManagementAccount.query.filter(
            ManagementAccount.tenant_id == tenant_id,
            ManagementAccount.id != str(account.id),
            func.lower(ManagementAccount.email) == email,
        ).first()
        if duplicate is not None:
            return json({"error_code": "EMAIL_EXISTS", "error_message": "Email is already used by another account."}, status=409)
    account.full_name = full_name[:255]
    account.email = email
    if "department" in body:
        account.department = str(body.get("department") or "")[:255]
    if "title" in body:
        account.title = str(body.get("title") or "")[:255]
    if "avatar" in body:
        avatar = str(body.get("avatar") or "")
        if len(avatar) > 8192:
            return json({"error_code": "AVATAR_TOO_LARGE", "error_message": "Avatar URL is too large."}, status=400)
        account.avatar = avatar
    account.updated_at = int(time.time())
    try:
        db.session.commit()
        _audit(request, "ACCOUNT_PROFILE_UPDATED", True, tenant_id=tenant_id, user_id=str(account.id))
        return json({"user": _public_account(account)})
    except Exception:
        db.session.rollback()
        return json({"error_code": "PROFILE_UPDATE_FAILED", "error_message": "The profile update conflicted with existing data."}, status=409)


@app.route('/api/v1/auth/avatar', methods=['POST'])
async def management_update_avatar(request):
    current_user, tenant_id = _identity(request)
    if current_user is None or management_session_requested(request):
        return _auth_error()
    account = _account_by_id(tenant_id, _user_id(current_user))
    if account is None or (account.properties or {}).get("auth_source") != "account":
        return json({
            "error_code": "ACCOUNT_AVATAR_UNSUPPORTED",
            "error_message": "Avatar updates through this endpoint require UpGO Account SSO.",
        }, status=403)
    upload = request.files.get("avatar") if request.files else None
    if upload is None or not upload.body:
        return json({
            "error_code": "AVATAR_REQUIRED",
            "error_message": "An avatar image is required.",
        }, status=400)
    content_type = str(upload.type or "").split(";", 1)[0].strip().lower()
    if not content_type.startswith("image/"):
        return json({
            "error_code": "AVATAR_TYPE_INVALID",
            "error_message": "The avatar must be an image file.",
        }, status=400)
    if len(upload.body) > 10 * 1024 * 1024:
        return json({
            "error_code": "AVATAR_TOO_LARGE",
            "error_message": "The avatar must not exceed 10 MB.",
        }, status=400)

    try:
        identity = await _validated_account_identity(request, account)
        updated_identity = await update_account_avatar(request, identity, upload)
        tenant, updated_account = _sso_account(updated_identity, mark_login=False)
        db.session.commit()
        _audit(
            request,
            "AUTH_ACCOUNT_AVATAR_UPDATED",
            True,
            tenant_id=tenant_id,
            user_id=str(updated_account.id),
        )
        return json({"user": _public_account(updated_account, tenant)})
    except AccountSSOError as error:
        db.session.rollback()
        _audit(
            request,
            "AUTH_ACCOUNT_AVATAR_UPDATED",
            False,
            tenant_id=tenant_id,
            user_id=str(account.id),
            properties={"error_code": error.error_code},
        )
        if error.error_code in (
            "ACCOUNT_LOGIN_REQUIRED",
            "ACCOUNT_SESSION_MISMATCH",
            "ACCOUNT_TENANT_INVALID",
        ):
            revoke_request_token(request)
            response = clear_auth_cookie(_account_sso_error(error), request)
            return clear_account_cookie(response)
        return _account_sso_error(error)
    except Exception as error:
        db.session.rollback()
        logger.exception("Account avatar update failed: %s", error)
        return json({
            "error_code": "ACCOUNT_AVATAR_UPDATE_FAILED",
            "error_message": "Avatar update failed.",
        }, status=500)


@app.route('/api/v1/chat/users', methods=['GET'])
async def management_users(request):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    management_guard = await _management_account_sso_guard(request, current_user, tenant_id)
    if management_guard is not None:
        return management_guard
    query_text = str(request.args.get("q") or "").strip().lower()
    employee_account_directory = bool(
        current_user.get("auth_method") == "account_sso"
        and _employee_account_sso_enabled()
    )
    sync_status = "cached" if employee_account_directory else "local"
    synced_count = 0
    skipped_count = 0
    deactivated_count = 0
    tinode_provisioned = 0
    tinode_failed = 0
    if employee_account_directory and not query_text:
        account = _account_by_id(tenant_id, _user_id(current_user))
        if account is None:
            return _auth_error()
        sync_ttl = max(0, int(app.config.get("ACCOUNT_SSO_DIRECTORY_SYNC_TTL", 10)))
        last_sync = float(_ACCOUNT_DIRECTORY_SYNC_CACHE.get(tenant_id) or 0)
        should_sync = sync_ttl == 0 or time.time() - last_sync >= sync_ttl
        try:
            if not should_sync:
                sync_status = "cached"
            else:
                identity = await _validated_account_identity(request, account)
                identities = await account_directory(request, identity)
                # Recheck after the directory request so a concurrent Account tenant
                # switch cannot project the new tenant's users into the old JWT tenant.
                await _validated_account_identity(request, account)
                synced_account_ids = set()
                tinode_candidates = []
                for directory_identity in identities:
                    try:
                        _tenant, synced_account = _sso_account(directory_identity, mark_login=False)
                        synced_account_ids.add(str(synced_account.id))
                        tinode_candidates.append(synced_account)
                        synced_count += 1
                    except AccountSSOError as error:
                        skipped_count += 1
                        logger.warning(
                            "Skipped Account directory projection for tenant %s: %s",
                            tenant_id,
                            error,
                        )
                _prepared, tinode_errors = await _ensure_tinode_accounts_best_effort(tinode_candidates)
                tinode_provisioned = len(_prepared)
                tinode_failed = len(tinode_errors)
                for account_id, error in tinode_errors:
                    logger.warning(
                        "Deferred Tinode provisioning for Account projection %s: %s",
                        account_id,
                        error,
                    )
                if synced_account_ids:
                    missing_accounts = ManagementAccount.query.filter(
                        ManagementAccount.tenant_id == tenant_id,
                        ManagementAccount.active.is_(True),
                        ManagementAccount.properties.contains({"auth_source": "account"}),
                        ~ManagementAccount.id.in_(synced_account_ids),
                    ).all()
                    now = int(time.time())
                    for missing_account in missing_accounts:
                        missing_account.active = False
                        missing_account.updated_at = now
                        missing_properties = dict(missing_account.properties or {})
                        missing_properties["directory_removed_at"] = now
                        missing_account.properties = missing_properties
                        deactivated_count += 1
                db.session.commit()
                _ACCOUNT_DIRECTORY_SYNC_CACHE[tenant_id] = time.time()
                sync_status = "partial" if tinode_failed else "fresh"
        except AccountSSOError as error:
            db.session.rollback()
            synced_count = 0
            skipped_count = 0
            deactivated_count = 0
            tinode_provisioned = 0
            tinode_failed = 0
            if error.error_code in (
                "ACCOUNT_LOGIN_REQUIRED",
                "ACCOUNT_SESSION_INVALID",
                "ACCOUNT_SESSION_MISMATCH",
                "ACCOUNT_TENANT_INVALID",
                "ACCOUNT_ROLE_CHANGED",
            ):
                return _account_sso_error(error)
            sync_status = "stale"
            logger.warning("Account directory sync failed for tenant %s: %s", tenant_id, error)
        except Exception as error:
            db.session.rollback()
            synced_count = 0
            skipped_count = 0
            deactivated_count = 0
            tinode_provisioned = 0
            tinode_failed = 0
            sync_status = "stale"
            logger.exception("Account directory sync failed for tenant %s: %s", tenant_id, error)
    exclude_user_id = str(request.args.get("exclude_user_id") or "")
    include_inactive = _is_admin(current_user) and str(
        request.args.get("include_inactive") or ""
    ).lower() in ("1", "true", "yes")
    query = ManagementAccount.query.filter(ManagementAccount.tenant_id == tenant_id)
    if employee_account_directory:
        query = query.filter(ManagementAccount.properties.contains({"auth_source": "account"}))
    if not include_inactive:
        query = query.filter(ManagementAccount.active.is_(True))
    if exclude_user_id:
        query = query.filter(ManagementAccount.id != exclude_user_id)
    if query_text:
        pattern = "%{}%".format(query_text)
        query = query.filter(or_(
            func.lower(ManagementAccount.full_name).like(pattern),
            func.lower(ManagementAccount.username).like(pattern),
            func.lower(ManagementAccount.email).like(pattern),
            func.lower(ManagementAccount.department).like(pattern),
        ))
    accounts = query.order_by(ManagementAccount.full_name.asc()).limit(1000).all()
    return json({
        "objects": [_public_account(account) for account in accounts],
        "directory_sync": {
            "source": "account" if employee_account_directory else "local",
            "status": sync_status,
            "synced": synced_count,
            "skipped": skipped_count,
            "deactivated": deactivated_count,
            "tinode_provisioned": tinode_provisioned,
            "tinode_failed": tinode_failed,
        },
    })


@app.route('/api/v1/chat/users', methods=['POST'])
async def management_user_create(request):
    if not management_session_requested(request):
        return _management_scope_error()
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    management_guard = await _management_account_sso_guard(request, current_user, tenant_id)
    if management_guard is not None:
        return management_guard
    if not _is_admin(current_user):
        return _forbidden_error()
    if not _management_user_mutations_enabled():
        return _management_user_action_error()
    if _employee_account_sso_enabled():
        return json({
            "error_code": "ACCOUNT_DIRECTORY_READ_ONLY",
            "error_message": "Employee accounts are managed by UpGO Account.",
        }, status=403)
    body = request.json or {}
    username = str(body.get("username") or "").strip().lower()
    password = str(body.get("password") or "")
    full_name = str(body.get("name") or body.get("full_name") or "").strip()
    email = str(body.get("email") or "").strip().lower() or None
    role = str(body.get("role") or "member").strip().lower()
    if not username or not full_name:
        return json({"error_code": "PARAM_ERROR", "error_message": "Username and full name are required."}, status=400)
    if _local_tinode_mirror_enabled() and not tinode_username_compatible(username):
        return json({
            "error_code": "TINODE_USERNAME_INVALID",
            "error_message": "Username must use letters, numbers, dot or underscore and contain at most 32 characters.",
        }, status=400)
    if role not in ("member", "admin"):
        return json({"error_code": "PARAM_ERROR", "error_message": "Role must be member or admin."}, status=400)
    duplicate_filter = ManagementAccount.username == username
    if email:
        duplicate_filter = or_(duplicate_filter, ManagementAccount.email == email)
    duplicate = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == tenant_id,
        duplicate_filter,
    ).first()
    if duplicate is not None:
        return json({"error_code": "ACCOUNT_EXISTS", "error_message": "The account already exists."}, status=409)
    try:
        password_hash = hash_password(password)
        account_id = stable_local_account_id(tenant_id, username)
        if _local_tinode_mirror_enabled():
            # Stock Tinode basic logins are global within one Tinode server;
            # reject a cross-tenant duplicate instead of linking two companies
            # to the same Tinode UID.
            global_duplicate = ManagementAccount.query.filter(
                func.lower(ManagementAccount.username) == username,
            ).first() if tinode_username_compatible(username) else None
            if global_duplicate is not None:
                return json({
                    "error_code": "TINODE_USERNAME_EXISTS",
                    "error_message": "The username is already used by another tenant on this Tinode server.",
                }, status=409)
            tinode_username = username
            tinode_auth = await tinode_mirror_login(
                username,
                password,
                full_name,
            )
        else:
            tinode_identity = {
                "account_user_id": account_id,
                "tenant_id": tenant_id,
                "full_name": full_name,
            }
            tinode_username = stable_tinode_username(tenant_id, account_id)
            tinode_auth = await tinode_sso_login(
                tinode_identity,
                tinode_username,
            )
        now = int(time.time())
        account = ManagementAccount(
            id=account_id,
            tenant_id=tenant_id,
            username=username,
            email=email,
            password_hash=password_hash,
            full_name=full_name,
            role=role,
            department=str(body.get("department") or ""),
            title=str(body.get("title") or ""),
            avatar=str(body.get("avatar") or ""),
            tinode_username=tinode_username,
            tinode_uid=tinode_auth.get("uid"),
            active=True,
            created_at=now,
            updated_at=now,
            properties={"auth_source": "local", "auth_version": 0},
        )
        db.session.add(account)
        db.session.commit()
        _audit(request, "ACCOUNT_CREATED", True, tenant_id=tenant_id, user_id=_user_id(current_user), properties={"account_id": account.id})
        return json(_public_account(account), status=201)
    except AuthError as error:
        db.session.rollback()
        return json({"error_code": "ACCOUNT_CREATE_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        return json({"error_code": "ACCOUNT_CREATE_FAILED", "error_message": str(error)}, status=500)


@app.route('/api/v1/chat/users/<account_id>', methods=['PUT'])
async def management_user_update(request, account_id):
    if not management_session_requested(request):
        return _management_scope_error()
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    management_guard = await _management_account_sso_guard(request, current_user, tenant_id)
    if management_guard is not None:
        return management_guard
    if not _is_admin(current_user):
        return _forbidden_error()
    if not _management_user_mutations_enabled():
        return _management_user_action_error()
    account = ManagementAccount.query.filter(
        ManagementAccount.id == str(account_id),
        ManagementAccount.tenant_id == tenant_id,
    ).first()
    if account is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Account not found in this tenant."}, status=404)
    if (
        (account.properties or {}).get("auth_source") == "account"
        and _employee_account_sso_enabled()
    ):
        return json({
            "error_code": "ACCOUNT_PROFILE_READ_ONLY",
            "error_message": "Account-backed users are synchronized from UpGO Account.",
        }, status=403)
    body = request.json or {}
    was_active = bool(account.active)
    role = str(body.get("role") or account.role or "member").strip().lower()
    if role not in ("member", "admin"):
        return json({"error_code": "PARAM_ERROR", "error_message": "Role must be member or admin."}, status=400)
    if str(account.id) == _user_id(current_user) and body.get("active") is False:
        return json({"error_code": "PARAM_ERROR", "error_message": "You cannot disable your own account."}, status=400)
    if str(account.id) == _user_id(current_user) and role != str(account.role or "member").lower():
        return json({"error_code": "PARAM_ERROR", "error_message": "You cannot change your own administrator role."}, status=400)
    if "name" in body or "full_name" in body:
        account.full_name = str(body.get("name") or body.get("full_name") or "").strip() or account.full_name
    if "email" in body:
        email = str(body.get("email") or "").strip().lower() or None
        if email:
            duplicate = ManagementAccount.query.filter(
                ManagementAccount.tenant_id == tenant_id,
                ManagementAccount.id != str(account.id),
                func.lower(ManagementAccount.email) == email,
            ).first()
            if duplicate is not None:
                return json({"error_code": "EMAIL_EXISTS", "error_message": "Email is already used by another account."}, status=409)
        account.email = email
    if "department" in body:
        account.department = str(body.get("department") or "")
    if "title" in body:
        account.title = str(body.get("title") or "")
    if "avatar" in body:
        account.avatar = str(body.get("avatar") or "")
    if "active" in body:
        account.active = bool(body.get("active"))
    if was_active and not account.active:
        _bump_auth_version(account)
    account.role = role
    account.updated_at = int(time.time())
    try:
        if was_active and not account.active:
            disabled_auth = await _disable_local_tinode_login(account)
            if disabled_auth:
                account.tinode_username = disabled_auth.get("username") or account.tinode_username
                account.tinode_uid = disabled_auth.get("uid") or account.tinode_uid
        db.session.commit()
        _audit(request, "ACCOUNT_UPDATED", True, tenant_id=tenant_id, user_id=_user_id(current_user), properties={"account_id": account.id})
        return json(_public_account(account))
    except AuthError as error:
        db.session.rollback()
        return json({"error_code": "TINODE_ACCOUNT_SYNC_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception:
        db.session.rollback()
        return json({"error_code": "ACCOUNT_UPDATE_FAILED", "error_message": "The account update conflicted with existing data."}, status=409)


@app.route('/api/v1/chat/users/<account_id>/revoke-session', methods=['POST'])
async def management_user_revoke_session(request, account_id):
    if not management_session_requested(request):
        return _management_scope_error()
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    management_guard = await _management_account_sso_guard(request, current_user, tenant_id)
    if management_guard is not None:
        return management_guard
    if not _is_admin(current_user):
        return _forbidden_error()
    if str(account_id) == _user_id(current_user):
        return json({"error_code": "PARAM_ERROR", "error_message": "Use normal logout for your own account."}, status=400)
    account = ManagementAccount.query.filter(
        ManagementAccount.id == str(account_id),
        ManagementAccount.tenant_id == tenant_id,
    ).first()
    if account is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Account not found in this tenant."}, status=404)
    _bump_auth_version(account)
    account.updated_at = int(time.time())
    try:
        disabled_auth = await _disable_local_tinode_login(account)
        if disabled_auth:
            account.tinode_username = disabled_auth.get("username") or account.tinode_username
            account.tinode_uid = disabled_auth.get("uid") or account.tinode_uid
        db.session.commit()
        _audit(request, "ACCOUNT_SESSION_REVOKED", True, tenant_id=tenant_id, user_id=_user_id(current_user), properties={"account_id": account.id})
        return json({"revoked": True, "user": _public_account(account)})
    except AuthError as error:
        db.session.rollback()
        return json({"error_code": "TINODE_ACCOUNT_SYNC_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception:
        db.session.rollback()
        return json({"error_code": "SESSION_REVOKE_FAILED", "error_message": "Could not revoke the account sessions."}, status=500)


@app.route('/api/v1/chat/users/<account_id>/reset-password', methods=['POST'])
async def management_user_reset_password(request, account_id):
    if not management_session_requested(request):
        return _management_scope_error()
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    management_guard = await _management_account_sso_guard(request, current_user, tenant_id)
    if management_guard is not None:
        return management_guard
    if not _is_admin(current_user):
        return _forbidden_error()
    if not _management_user_mutations_enabled():
        return _management_user_action_error()
    if str(account_id) == _user_id(current_user):
        return json({"error_code": "PARAM_ERROR", "error_message": "Use the profile password form for your own account."}, status=400)
    account = ManagementAccount.query.filter(
        ManagementAccount.id == str(account_id),
        ManagementAccount.tenant_id == tenant_id,
    ).first()
    if account is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Account not found in this tenant."}, status=404)
    if (
        (account.properties or {}).get("auth_source") == "account"
        and _employee_account_sso_enabled()
    ):
        return json({
            "error_code": "AUTH_METHOD_DISABLED",
            "error_message": "Password changes are managed by UpGO Account.",
        }, status=403)
    new_password = str((request.json or {}).get("new_password") or "")
    try:
        new_password_hash = hash_password(new_password)
        tinode_auth = await _local_tinode_password_reset(account, new_password)
        converted_from_account = (account.properties or {}).get("auth_source") == "account"
        account.password_hash = new_password_hash
        if tinode_auth:
            account.tinode_username = tinode_auth.get("username") or account.tinode_username
            account.tinode_uid = tinode_auth.get("uid") or account.tinode_uid
        properties = _bump_auth_version(account)
        if converted_from_account:
            properties["legacy_account_user_id"] = properties.pop("account_user_id", "")
            properties["legacy_account_tenant_id"] = properties.pop("account_tenant_id", "")
            properties["migrated_from_account_at"] = int(time.time())
            properties["auth_source"] = "local"
        properties["must_change_password"] = True
        properties["password_reset_by_admin_at"] = int(time.time())
        account.properties = properties
        account.updated_at = int(time.time())
        db.session.commit()
        _audit(
            request,
            "ACCOUNT_LOCAL_ACCESS_PROVISIONED" if converted_from_account else "ACCOUNT_PASSWORD_RESET_BY_ADMIN",
            True,
            tenant_id=tenant_id,
            user_id=_user_id(current_user),
            properties={"account_id": account.id},
        )
        return json({"reset": True, "user": _public_account(account)})
    except AuthError as error:
        db.session.rollback()
        _audit(request, "ACCOUNT_PASSWORD_RESET_BY_ADMIN", False, tenant_id=tenant_id, user_id=_user_id(current_user), properties={"account_id": account.id})
        return json({"error_code": "PASSWORD_RESET_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception:
        db.session.rollback()
        return json({"error_code": "PASSWORD_RESET_FAILED", "error_message": "Could not reset the account password."}, status=500)


@app.route('/api/v1/admin/audit-logs', methods=['GET'])
async def management_audit_logs(request):
    if not management_session_requested(request):
        return _management_scope_error()
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    management_guard = await _management_account_sso_guard(request, current_user, tenant_id)
    if management_guard is not None:
        return management_guard
    if not _is_admin(current_user):
        return _forbidden_error()
    try:
        limit = min(300, max(1, int(request.args.get("limit") or 100)))
    except (TypeError, ValueError):
        limit = 100
    event_query = str(request.args.get("event") or "").strip().upper()
    query = SecurityAuditLog.query.filter(
        SecurityAuditLog.tenant_id == tenant_id,
        SecurityAuditLog.deleted.is_(False),
    )
    if event_query:
        query = query.filter(func.upper(SecurityAuditLog.event_name).like("%{}%".format(event_query)))
    records = query.order_by(SecurityAuditLog.created_at.desc()).limit(limit).all()
    return json({"objects": [{
        "id": str(record.id),
        "userId": record.user_id,
        "eventName": record.event_name,
        "success": bool(record.success),
        "ipAddress": record.ip_address or "",
        "userAgent": record.user_agent or "",
        "properties": record.properties or {},
        "createdAt": _iso_timestamp(record.created_at),
    } for record in records]})


@app.route('/api/v1/admin/conversations', methods=['GET'])
async def management_admin_conversations(request):
    if not management_session_requested(request):
        return _management_scope_error()
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    management_guard = await _management_account_sso_guard(request, current_user, tenant_id)
    if management_guard is not None:
        return management_guard
    if not _is_admin(current_user):
        return _forbidden_error()
    return _management_chat_metadata_error()


@app.route('/api/v1/friend-request', methods=['GET'])
async def friend_request_list(request):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    user_id = _user_id(current_user)
    items = FriendRequest.query.filter(
        FriendRequest.tenant_id == tenant_id,
        FriendRequest.deleted.is_(False),
        or_(FriendRequest.requester_id == user_id, FriendRequest.recipient_id == user_id),
    ).order_by(FriendRequest.created_at.desc()).all()
    events = []
    for item in items:
        events.append(_friend_request_event(item))
        response = _friend_response_event(item)
        if response is not None:
            events.append(response)
    return json({"objects": events})


@app.route('/api/v1/friend-request', methods=['POST'])
async def friend_request_create(request):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    body = request.json or {}
    requester_id = _user_id(current_user)
    recipient_id = str(body.get("recipient_id") or "")
    if requester_id == recipient_id:
        return json({"error_code": "PARAM_ERROR", "error_message": "You cannot add yourself as a friend."}, status=400)
    requester = _account_by_id(tenant_id, requester_id)
    recipient = _account_by_id(tenant_id, recipient_id)
    if requester is None or recipient is None:
        return json({"error_code": "NOT_FOUND", "error_message": "The recipient is not in this tenant."}, status=404)
    existing = FriendRequest.query.filter(
        FriendRequest.tenant_id == tenant_id,
        FriendRequest.deleted.is_(False),
        FriendRequest.status.in_(("PENDING", "ACCEPTED")),
        or_(
            and_(FriendRequest.requester_id == requester_id, FriendRequest.recipient_id == recipient_id),
            and_(FriendRequest.requester_id == recipient_id, FriendRequest.recipient_id == requester_id),
        ),
    ).first()
    if existing is not None:
        return json({"error_code": "FRIEND_REQUEST_EXISTS", "error_message": "A friendship or pending request already exists."}, status=409)
    item = FriendRequest(
        tenant_id=tenant_id,
        requester_id=requester_id,
        requester_name=requester.full_name,
        recipient_id=recipient_id,
        recipient_name=recipient.full_name,
        note=str(body.get("note") or "").strip()[:500],
        status="PENDING",
        properties={},
    )
    db.session.add(item)
    db.session.commit()
    return json(_friend_request_event(item), status=201)


@app.route('/api/v1/friend-request/<request_id>', methods=['PUT'])
async def friend_request_respond(request, request_id):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    try:
        request_uuid = uuid.UUID(str(request_id))
    except (ValueError, TypeError, AttributeError):
        return json({"error_code": "NOT_FOUND", "error_message": "Invalid friend request."}, status=404)
    responder_id = _user_id(current_user)
    item = FriendRequest.query.filter(
        FriendRequest.id == request_uuid,
        FriendRequest.tenant_id == tenant_id,
        FriendRequest.recipient_id == responder_id,
        FriendRequest.status == "PENDING",
        FriendRequest.deleted.is_(False),
    ).first()
    if item is None:
        return json({"error_code": "NOT_FOUND", "error_message": "The friend request was already handled."}, status=404)
    responder = _account_by_id(tenant_id, responder_id)
    item.status = "ACCEPTED" if bool((request.json or {}).get("accepted")) else "REJECTED"
    item.responder_id = responder_id
    item.responder_name = responder.full_name if responder else responder_id
    item.responded_at = int(time.time())
    db.session.commit()
    return json(_friend_response_event(item))


@app.route('/api/v1/conversation', methods=['GET'])
@app.route('/api/v1/chat/threads', methods=['GET'])
async def conversation_list(request):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    user_id = _user_id(current_user)
    try:
        limit = min(200, max(1, int(request.args.get("limit") or 100)))
    except (TypeError, ValueError):
        limit = 100
    query = Conversation.query.join(
        ConversationParticipant,
        ConversationParticipant.conversation_id == Conversation.id,
    ).filter(
        Conversation.tenant_id == tenant_id,
        Conversation.deleted.is_(False),
        ConversationParticipant.tenant_id == tenant_id,
        ConversationParticipant.participant_id == user_id,
        ConversationParticipant.active.is_(True),
        ConversationParticipant.deleted.is_(False),
    ).order_by(
        ConversationParticipant.pinned_at.desc().nullslast(),
        Conversation.updated_at.desc(),
    )
    return json({"objects": [_serialize_conversation(item, user_id) for item in query.limit(limit).all()]})


@app.route('/api/v1/conversation/<conversation_id>/notification-settings', methods=['PUT'])
@app.route('/api/v1/chat/threads/<conversation_id>/notification-settings', methods=['PUT'])
async def conversation_notification_settings(request, conversation_id):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    if management_session_requested(request):
        return json({
            "error_code": "CHAT_SESSION_REQUIRED",
            "error_message": "Notification settings can only be changed from a Chat user session.",
        }, status=403)
    try:
        conversation_uuid = uuid.UUID(str(conversation_id))
    except (ValueError, TypeError, AttributeError):
        return json({"error_code": "NOT_FOUND", "error_message": "Invalid conversation."}, status=404)

    user_id = _user_id(current_user)
    item, membership = _conversation_and_membership(tenant_id, conversation_uuid, user_id)
    if item is None or membership is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)

    body = request.json or {}
    if "muted_until" not in body:
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "The notification mute deadline is required.",
        }, status=400)

    raw_mute_until = body.get("muted_until")
    if raw_mute_until is None:
        mute_until = None
    elif isinstance(raw_mute_until, bool):
        return json({"error_code": "PARAM_ERROR", "error_message": "Invalid notification mute deadline."}, status=400)
    else:
        try:
            mute_until = int(raw_mute_until)
        except (TypeError, ValueError):
            return json({"error_code": "PARAM_ERROR", "error_message": "Invalid notification mute deadline."}, status=400)
        now = int(time.time())
        if mute_until < 0 or mute_until > now + (366 * 24 * 60 * 60):
            return json({"error_code": "PARAM_ERROR", "error_message": "Invalid notification mute deadline."}, status=400)
        if mute_until != 0 and mute_until <= now:
            mute_until = None

    membership.notification_muted_until = mute_until
    membership.updated_at = int(time.time())
    db.session.commit()
    return json(_serialize_conversation(item, user_id))


@app.route('/api/v1/conversation/<conversation_id>/pin', methods=['PUT'])
@app.route('/api/v1/chat/threads/<conversation_id>/pin', methods=['PUT'])
async def conversation_pin(request, conversation_id):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    if management_session_requested(request):
        return json({
            "error_code": "CHAT_SESSION_REQUIRED",
            "error_message": "Conversation pins can only be changed from a Chat user session.",
        }, status=403)
    try:
        conversation_uuid = uuid.UUID(str(conversation_id))
    except (ValueError, TypeError, AttributeError):
        return json({"error_code": "NOT_FOUND", "error_message": "Invalid conversation."}, status=404)

    user_id = _user_id(current_user)
    item, membership = _conversation_and_membership(tenant_id, conversation_uuid, user_id)
    if item is None or membership is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)

    body = request.json or {}
    pinned = body.get("pinned")
    if not isinstance(pinned, bool):
        return json({"error_code": "PARAM_ERROR", "error_message": "The pinned state must be boolean."}, status=400)

    membership.pinned_at = int(time.time()) if pinned else None
    membership.updated_at = int(time.time())
    db.session.commit()
    return json(_serialize_conversation(item, user_id))


@app.route('/api/v1/conversation', methods=['POST'])
@app.route('/api/v1/chat/threads', methods=['POST'])
async def conversation_create(request):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    body = request.json or {}
    owner_id = _user_id(current_user)
    requested_ids = [str(value) for value in (body.get("participant_ids") or []) if value]
    participant_ids = list(dict.fromkeys([owner_id, *requested_ids]))
    valid_ids = {
        account.id for account in ManagementAccount.query.filter(
            ManagementAccount.tenant_id == tenant_id,
            ManagementAccount.active.is_(True),
            ManagementAccount.id.in_(participant_ids),
        ).all()
    }
    if set(participant_ids) != valid_ids:
        return json({"error_code": "TENANT_VIOLATION", "error_message": "All participants must belong to the same tenant."}, status=400)
    requested_properties = body.get("properties") if isinstance(body.get("properties"), dict) else {}
    is_group = bool(body.get("is_group", requested_properties.get("is_group", False)))
    direct_key = ":".join(sorted(participant_ids)) if not is_group and len(participant_ids) == 2 else ""
    properties = {
        "is_group": is_group,
        "description": str(requested_properties.get("description") or "")[:2000],
        "avatar": str(requested_properties.get("avatar") or "")[:8192],
    }
    if direct_key:
        properties["direct_key"] = direct_key
        existing = Conversation.query.filter(
            Conversation.tenant_id == tenant_id,
            Conversation.deleted.is_(False),
            Conversation.properties.contains({"direct_key": direct_key}),
        ).first()
        if existing is not None:
            now = int(time.time())
            memberships = ConversationParticipant.query.filter(
                ConversationParticipant.tenant_id == tenant_id,
                ConversationParticipant.conversation_id == existing.id,
                ConversationParticipant.participant_id.in_(participant_ids),
                ConversationParticipant.deleted.is_(False),
            ).all()
            memberships_by_id = {membership.participant_id: membership for membership in memberships}
            for index, participant_id in enumerate(participant_ids):
                membership = memberships_by_id.get(participant_id)
                if membership is None:
                    membership = ConversationParticipant(
                        tenant_id=tenant_id,
                        conversation_id=existing.id,
                        participant_type="USER",
                        participant_id=participant_id,
                        role="OWNER" if index == 0 else "MEMBER",
                        joined_at=now,
                        active=True,
                    )
                    db.session.add(membership)
                else:
                    membership.active = True
                    membership.left_at = None
            existing.updated_at = now
            db.session.commit()
            return json(_serialize_conversation(existing, owner_id))
    item = Conversation(
        tenant_id=tenant_id,
        conversation_no="conv-{}".format(uuid.uuid4().hex),
        tinode_topic=None,
        subject=str(body.get("subject") or body.get("name") or "Conversation").strip(),
        source="internal",
        status="OPEN",
        priority="NORMAL",
        last_message_at=int(time.time()),
        properties=properties,
    )
    try:
        db.session.add(item)
        db.session.flush()
        for index, participant_id in enumerate(participant_ids):
            db.session.add(ConversationParticipant(
                tenant_id=tenant_id,
                conversation_id=item.id,
                participant_type="USER",
                participant_id=participant_id,
                role="OWNER" if index == 0 else "MEMBER",
                joined_at=int(time.time()),
                active=True,
            ))
        db.session.commit()
        return json(_serialize_conversation(item, owner_id), status=201)
    except Exception as error:
        db.session.rollback()
        return json({"error_code": "CONVERSATION_ERROR", "error_message": str(error)}, status=500)


@app.route('/api/v1/conversation/<conversation_id>/tinode-prepare', methods=['POST'])
@app.route('/api/v1/chat/threads/<conversation_id>/tinode-prepare', methods=['POST'])
async def conversation_prepare_tinode(request, conversation_id):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    if management_session_requested(request):
        return json({
            "error_code": "CHAT_SESSION_REQUIRED",
            "error_message": "Tinode accounts can only be prepared from a Chat user session.",
        }, status=403)
    try:
        conversation_uuid = uuid.UUID(str(conversation_id))
    except (ValueError, TypeError, AttributeError):
        return json({"error_code": "NOT_FOUND", "error_message": "Invalid conversation."}, status=404)

    user_id = _user_id(current_user)
    item, membership = _conversation_and_membership(tenant_id, conversation_uuid, user_id)
    if item is None or membership is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)
    account = _account_by_id(tenant_id, user_id)
    if account is None:
        return _auth_error()
    try:
        if current_user.get("auth_method") == "account_sso":
            await _validated_account_identity(request, account)
        _participants, accounts_by_id = _active_conversation_accounts(item)
        await _ensure_tinode_accounts(accounts_by_id.values())
        db.session.commit()
        return json(_serialize_conversation(item, user_id))
    except AccountSSOError as error:
        db.session.rollback()
        if error.status_code != 503:
            revoke_request_token(request)
            revoked_error = AccountSSOError(str(error), 401, error.error_code)
            response = clear_auth_cookie(_account_sso_error(revoked_error), request)
            return clear_account_cookie(response)
        return _account_sso_error(error)
    except AuthError as error:
        db.session.rollback()
        return json({"error_code": "TINODE_PREPARE_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        logger.exception("Tinode participant preparation failed: %s", error)
        return json({
            "error_code": "TINODE_PREPARE_FAILED",
            "error_message": "Could not prepare the realtime participants.",
        }, status=503)


@app.route('/api/v1/conversation/<conversation_id>/tinode-topic', methods=['PUT'])
@app.route('/api/v1/chat/threads/<conversation_id>/tinode-topic', methods=['PUT'])
async def conversation_bind_tinode(request, conversation_id):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    try:
        conversation_uuid = uuid.UUID(str(conversation_id))
    except (ValueError, TypeError, AttributeError):
        return json({"error_code": "NOT_FOUND", "error_message": "Invalid conversation."}, status=404)
    user_id = _user_id(current_user)
    item, membership = _conversation_and_membership(tenant_id, conversation_uuid, user_id)
    if item is None or membership is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)
    body = request.json or {}
    topic_name = str(body.get("tinode_topic") or "").strip()
    if not topic_name:
        return json({"error_code": "PARAM_ERROR", "error_message": "Tinode topic is required."}, status=400)
    is_group = bool((item.properties or {}).get("is_group"))
    if not valid_tinode_topic(topic_name, is_group):
        return json({"error_code": "TINODE_TOPIC_INVALID", "error_message": "Tinode topic type is invalid for this conversation."}, status=400)
    if is_group and item.tinode_topic and item.tinode_topic != topic_name:
        return json({"error_code": "TINODE_TOPIC_ALREADY_BOUND", "error_message": "The conversation is already bound to another Tinode topic."}, status=409)
    if is_group:
        conflict = Conversation.query.filter(
            Conversation.id != item.id,
            Conversation.tinode_topic == topic_name,
            Conversation.deleted.is_(False),
        ).first()
        if conflict is not None:
            return json({"error_code": "TINODE_TOPIC_CONFLICT", "error_message": "The Tinode topic is already bound to another conversation."}, status=409)
    if management_session_requested(request):
        return json({"error_code": "CHAT_SESSION_REQUIRED", "error_message": "Tinode topics can only be bound from a Chat user session."}, status=403)

    account = _account_by_id(tenant_id, user_id)
    if account is None:
        return _auth_error()
    if current_user.get("auth_method") == "account_sso":
        try:
            await _validated_account_identity(request, account)
        except AccountSSOError as error:
            db.session.rollback()
            if error.status_code != 503:
                revoke_request_token(request)
                revoked_error = AccountSSOError(str(error), 401, error.error_code)
                response = clear_auth_cookie(_account_sso_error(revoked_error), request)
                return clear_account_cookie(response)
            return _account_sso_error(error)
    expected_member_uids = None
    if not is_group:
        try:
            participants, accounts_by_id = _active_conversation_accounts(item)
        except AuthError as error:
            return json({"error_code": "TINODE_PARTICIPANTS_INVALID", "error_message": str(error)}, status=error.status_code)
        peer_ids = [
            participant.participant_id for participant in participants
            if participant.participant_id != user_id
        ]
        if len(participants) != 2 or len(peer_ids) != 1:
            return json({"error_code": "DIRECT_PARTICIPANTS_INVALID", "error_message": "A direct conversation must contain exactly two participants."}, status=409)
        peer = accounts_by_id.get(peer_ids[0])
        if peer is None or not peer.tinode_uid or str(peer.tinode_uid) != topic_name:
            return json({"error_code": "TINODE_TOPIC_MISMATCH", "error_message": "The Tinode direct topic does not match the Chatmgt participant."}, status=409)
    else:
        try:
            participants, accounts_by_id = _active_conversation_accounts(item)
            expected_member_uids = {
                str(accounts_by_id[participant.participant_id].tinode_uid or "")
                for participant in participants
            }
        except AuthError as error:
            return json({"error_code": "TINODE_PARTICIPANTS_INVALID", "error_message": str(error)}, status=error.status_code)
        if not expected_member_uids or "" in expected_member_uids:
            return json({
                "error_code": "TINODE_PARTICIPANTS_UNPREPARED",
                "error_message": "Prepare all Chatmgt participants before binding the Tinode group.",
            }, status=409)

    tinode_token = str(body.get("tinode_token") or "").strip()
    if not tinode_token:
        return json({"error_code": "TINODE_TOKEN_REQUIRED", "error_message": "Tinode authentication is required."}, status=400)

    try:
        try:
            await tinode_verify_topic_access(
                tinode_token,
                account.tinode_uid,
                topic_name,
                expected_member_uids=expected_member_uids,
            )
        except AuthError as error:
            if not is_group or str(error) != "Tinode topic members do not match Chatmgt.":
                raise
            owner_participant = next(
                (participant for participant in participants if participant.role == "OWNER"),
                None,
            )
            owner_account = accounts_by_id.get(owner_participant.participant_id) if owner_participant else None
            if owner_account is None:
                raise
            owner_uid = await _ensure_tinode_account(owner_account)
            owner_auth = await tinode_sso_login(
                _tinode_account_identity(owner_account),
                owner_account.tinode_username,
                owner_uid,
            )
            await tinode_reconcile_topic_members(
                str(owner_auth.get("token") or ""),
                owner_uid,
                topic_name,
                expected_member_uids,
            )
        if is_group and body.get("avatar"):
            properties = dict(item.properties or {})
            properties["avatar"] = str(body.get("avatar") or "")[:8192]
            item.properties = properties
        # A Tinode direct topic is the other participant's UID, so it differs
        # for each viewer and must not be persisted as one shared binding.
        item.tinode_topic = topic_name if is_group else None
        db.session.commit()
        return json(_serialize_conversation(item, user_id))
    except AuthError as error:
        db.session.rollback()
        return json({"error_code": "TINODE_TOPIC_REJECTED", "error_message": str(error)}, status=error.status_code)
    except Exception:
        db.session.rollback()
        return json({"error_code": "TINODE_TOPIC_CONFLICT", "error_message": "Could not bind the Tinode topic."}, status=409)


@app.route('/api/v1/conversation/<conversation_id>/participants', methods=['POST'])
@app.route('/api/v1/chat/threads/<conversation_id>/participants', methods=['POST'])
async def conversation_participant_add(request, conversation_id):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    try:
        conversation_uuid = uuid.UUID(str(conversation_id))
    except (ValueError, TypeError, AttributeError):
        return json({"error_code": "NOT_FOUND", "error_message": "Invalid conversation."}, status=404)

    user_id = _user_id(current_user)
    item, membership = _conversation_and_membership(tenant_id, conversation_uuid, user_id)
    if item is None or membership is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)
    if not bool((item.properties or {}).get("is_group")):
        return json({"error_code": "PARAM_ERROR", "error_message": "Participants can only be added to a group."}, status=400)
    if membership.role != "OWNER":
        return _forbidden_error()

    requested_ids = list(dict.fromkeys(
        str(value) for value in ((request.json or {}).get("participant_ids") or []) if value
    ))
    requested_ids = [participant_id for participant_id in requested_ids if participant_id != user_id]
    if not requested_ids:
        return json({"error_code": "PARAM_ERROR", "error_message": "At least one participant is required."}, status=400)
    requested_accounts = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == tenant_id,
        ManagementAccount.active.is_(True),
        ManagementAccount.id.in_(requested_ids),
    ).all()
    requested_accounts_by_id = {str(account.id): account for account in requested_accounts}
    valid_ids = set(requested_accounts_by_id)
    if set(requested_ids) != valid_ids:
        return json({"error_code": "TENANT_VIOLATION", "error_message": "All participants must belong to the same tenant."}, status=400)

    now = int(time.time())
    existing = ConversationParticipant.query.filter(
        ConversationParticipant.tenant_id == tenant_id,
        ConversationParticipant.conversation_id == item.id,
        ConversationParticipant.participant_id.in_(requested_ids),
        ConversationParticipant.deleted.is_(False),
    ).all()
    existing_by_id = {participant.participant_id: participant for participant in existing}
    activated_ids = [
        requested_id for requested_id in requested_ids
        if existing_by_id.get(requested_id) is None or not existing_by_id[requested_id].active
    ]
    try:
        tinode_token = ""
        actor_account = None
        added_tinode_uids = []
        tinode_members_added = False
        database_committed = False
        if item.tinode_topic and activated_ids:
            tinode_token = str((request.json or {}).get("tinode_token") or "").strip()
            if not tinode_token:
                return json({"error_code": "TINODE_TOKEN_REQUIRED", "error_message": "Tinode authentication is required."}, status=400)
            actor_account = _account_by_id(tenant_id, user_id)
            if actor_account is None or not actor_account.tinode_uid:
                return json({"error_code": "TINODE_ACCOUNT_UNPREPARED", "error_message": "The current Tinode account is not prepared."}, status=409)
            if current_user.get("auth_method") == "account_sso":
                await _validated_account_identity(request, actor_account)
            prepared_uids = await _ensure_tinode_accounts(
                requested_accounts_by_id[requested_id] for requested_id in activated_ids
            )
            added_tinode_uids = [prepared_uids[requested_id] for requested_id in activated_ids]

        for requested_id in requested_ids:
            participant = existing_by_id.get(requested_id)
            if participant is None:
                participant = ConversationParticipant(
                    tenant_id=tenant_id,
                    conversation_id=item.id,
                    participant_type="USER",
                    participant_id=requested_id,
                    role="MEMBER",
                    joined_at=now,
                    active=True,
                )
                db.session.add(participant)
            else:
                participant.active = True
                participant.left_at = None
                participant.joined_at = now
                participant.role = "MEMBER"
        item.updated_at = now
        db.session.flush()
        if item.tinode_topic and added_tinode_uids:
            await tinode_add_topic_members(
                tinode_token,
                actor_account.tinode_uid,
                item.tinode_topic,
                added_tinode_uids,
            )
            tinode_members_added = True
            active_participants, active_accounts = _active_conversation_accounts(item)
            expected_member_uids = {
                str(active_accounts[participant.participant_id].tinode_uid or "")
                for participant in active_participants
            }
            await tinode_reconcile_topic_members(
                tinode_token,
                actor_account.tinode_uid,
                item.tinode_topic,
                expected_member_uids,
            )
        db.session.commit()
        database_committed = True
        return json(_serialize_conversation(item, user_id))
    except AccountSSOError as error:
        db.session.rollback()
        if error.status_code != 503:
            revoke_request_token(request)
            revoked_error = AccountSSOError(str(error), 401, error.error_code)
            response = clear_auth_cookie(_account_sso_error(revoked_error), request)
            return clear_account_cookie(response)
        return _account_sso_error(error)
    except AuthError as error:
        db.session.rollback()
        return json({"error_code": "TINODE_MEMBERSHIP_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        if tinode_members_added and not database_committed:
            for added_uid in reversed(added_tinode_uids):
                try:
                    await tinode_remove_topic_member(
                        tinode_token,
                        actor_account.tinode_uid,
                        item.tinode_topic,
                        added_uid,
                    )
                except AuthError:
                    logger.warning("Could not roll back Tinode member %s after database failure.", added_uid)
        logger.exception("Could not add Chatmgt/Tinode participants: %s", error)
        return json({
            "error_code": "CONVERSATION_PARTICIPANT_ERROR",
            "error_message": "Could not add the conversation participants.",
        }, status=503)


@app.route('/api/v1/conversation/<conversation_id>/self', methods=['DELETE'])
@app.route('/api/v1/chat/threads/<conversation_id>/self', methods=['DELETE'])
@app.route('/api/v1/conversation/<conversation_id>/participants/<participant_id>', methods=['DELETE'])
@app.route('/api/v1/chat/threads/<conversation_id>/participants/<participant_id>', methods=['DELETE'])
async def conversation_participant_remove(request, conversation_id, participant_id=None):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    try:
        conversation_uuid = uuid.UUID(str(conversation_id))
    except (ValueError, TypeError, AttributeError):
        return json({"error_code": "NOT_FOUND", "error_message": "Invalid conversation."}, status=404)

    user_id = _user_id(current_user)
    item, membership = _conversation_and_membership(tenant_id, conversation_uuid, user_id)
    if item is None or membership is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)
    participant_id = str(participant_id or user_id)
    if participant_id != user_id and membership.role != "OWNER":
        return _forbidden_error()

    target = ConversationParticipant.query.filter(
        ConversationParticipant.tenant_id == tenant_id,
        ConversationParticipant.conversation_id == item.id,
        ConversationParticipant.participant_id == participant_id,
        ConversationParticipant.active.is_(True),
        ConversationParticipant.deleted.is_(False),
    ).first()
    if target is None:
        # Retries are normal after a successful Tinode mutation. Treat an
        # already inactive membership as an idempotent success while keeping
        # an unknown participant a real 404.
        known_target = ConversationParticipant.query.filter(
            ConversationParticipant.tenant_id == tenant_id,
            ConversationParticipant.conversation_id == item.id,
            ConversationParticipant.participant_id == participant_id,
        ).first()
        if known_target is not None and (
            known_target.active is not True or known_target.deleted is True
        ):
            return json(_serialize_conversation(item, user_id))
        return json({"error_code": "NOT_FOUND", "error_message": "Participant not found."}, status=404)
    if target.role == "OWNER" and participant_id != user_id:
        return json({"error_code": "OWNER_REQUIRED", "error_message": "The group owner cannot be removed."}, status=409)
    is_group = bool((item.properties or {}).get("is_group"))
    if not is_group and participant_id != user_id:
        return json({
            "error_code": "DIRECT_PARTICIPANTS_INVALID",
            "error_message": "A direct conversation can only be removed from the current user's list.",
        }, status=409)

    now = int(time.time())
    replacement = None
    if is_group and target.role == "OWNER":
        # Choose a remaining active member without coupling ownership to join order.
        replacement = ConversationParticipant.query.filter(
            ConversationParticipant.tenant_id == tenant_id,
            ConversationParticipant.conversation_id == item.id,
            ConversationParticipant.participant_id != participant_id,
            ConversationParticipant.active.is_(True),
            ConversationParticipant.deleted.is_(False),
        ).order_by(func.random()).first()
    event_sender_participant = replacement
    if is_group and participant_id == user_id and event_sender_participant is None:
        event_sender_participant = ConversationParticipant.query.filter(
            ConversationParticipant.tenant_id == tenant_id,
            ConversationParticipant.conversation_id == item.id,
            ConversationParticipant.participant_id != participant_id,
            ConversationParticipant.active.is_(True),
            ConversationParticipant.deleted.is_(False),
        ).order_by(func.random()).first()
    try:
        tinode_token = ""
        actor_account = None
        target_account = None
        event_sender_account = None
        event_sender_uid = ""
        event_sender_tinode_token = ""
        replacement_uid = ""
        replacement_tinode_token = ""
        owner_transfer_accepted = False
        tinode_target_removed = False

        async def rollback_tinode_owner_transfer():
            if not replacement_uid or actor_account is None or not tinode_token:
                return
            try:
                if owner_transfer_accepted and replacement_tinode_token:
                    await tinode_add_topic_members(
                        replacement_tinode_token,
                        replacement_uid,
                        item.tinode_topic,
                        [actor_account.tinode_uid],
                        mode="JRWPASO",
                    )
                    await tinode_accept_topic_owner(
                        tinode_token,
                        actor_account.tinode_uid,
                        item.tinode_topic,
                        mode="JRWPASO",
                    )
                await tinode_add_topic_members(
                    tinode_token,
                    actor_account.tinode_uid,
                    item.tinode_topic,
                    [replacement_uid],
                    mode="JRWPAS",
                )
            except AuthError:
                logger.warning("Could not roll back the Tinode owner transfer.")

        async def rollback_tinode_changes():
            if replacement is not None:
                await rollback_tinode_owner_transfer()
                return
            if not tinode_target_removed or target_account is None:
                return
            restore_token = event_sender_tinode_token if participant_id == user_id else tinode_token
            restore_uid = event_sender_uid if participant_id == user_id else (
                actor_account.tinode_uid if actor_account is not None else ""
            )
            if not restore_token or not restore_uid:
                return
            try:
                await tinode_add_topic_members(
                    restore_token,
                    restore_uid,
                    item.tinode_topic,
                    [target_account.tinode_uid],
                    mode="JRWPAS",
                )
            except AuthError:
                logger.warning("Could not roll back the Tinode member removal.")

        if item.tinode_topic:
            tinode_token = str((request.json or {}).get("tinode_token") or "").strip()
            if not tinode_token:
                return json({"error_code": "TINODE_TOKEN_REQUIRED", "error_message": "Tinode authentication is required."}, status=400)
            actor_account = _account_by_id(tenant_id, user_id)
            target_account = _account_by_id(tenant_id, participant_id)
            if actor_account is None or not actor_account.tinode_uid:
                return json({"error_code": "TINODE_ACCOUNT_UNPREPARED", "error_message": "The current Tinode account is not prepared."}, status=409)
            if target_account is None or not target_account.tinode_uid:
                return json({"error_code": "TINODE_ACCOUNT_UNPREPARED", "error_message": "The target Tinode account is not prepared."}, status=409)
            if current_user.get("auth_method") == "account_sso":
                await _validated_account_identity(request, actor_account)
            if is_group and event_sender_participant is not None:
                event_sender_account = _account_by_id(tenant_id, event_sender_participant.participant_id)
                if event_sender_account is not None:
                    try:
                        event_sender_uid = await _ensure_tinode_account(event_sender_account)
                        event_sender_auth = await tinode_sso_login(
                            _tinode_account_identity(event_sender_account),
                            event_sender_account.tinode_username,
                            event_sender_account.tinode_uid,
                        )
                        event_sender_tinode_token = str(event_sender_auth.get("token") or "").strip()
                    except Exception:
                        if replacement is not event_sender_participant:
                            logger.warning("Could not prepare a surviving Tinode member for the leave event.")
                        else:
                            raise
                if replacement is not None:
                    replacement_uid = event_sender_uid
                    replacement_tinode_token = event_sender_tinode_token
                    if not replacement_uid or not replacement_tinode_token:
                        raise AuthError("Tinode could not prepare the replacement owner.", 502)

        target.active = False
        target.left_at = now
        if replacement is not None:
            replacement.role = "OWNER"
        item.updated_at = now
        db.session.flush()

        if item.tinode_topic:
            if replacement_uid:
                await tinode_add_topic_members(
                    tinode_token,
                    actor_account.tinode_uid,
                    item.tinode_topic,
                    [replacement_uid],
                    mode="JRWPASO",
                )
                await tinode_accept_topic_owner(
                    replacement_tinode_token,
                    replacement_uid,
                    item.tinode_topic,
                    mode="JRWPASO",
                )
                owner_transfer_accepted = True
            await tinode_remove_topic_member(
                tinode_token,
                actor_account.tinode_uid,
                item.tinode_topic,
                target_account.tinode_uid,
            )
            tinode_target_removed = True
            if is_group:
                active_participants, active_accounts = _active_conversation_accounts(item)
                expected_member_uids = {
                    str(active_accounts[participant.participant_id].tinode_uid or "")
                    for participant in active_participants
                }
                verification_token = replacement_tinode_token or event_sender_tinode_token or tinode_token
                verification_uid = replacement_uid or event_sender_uid or actor_account.tinode_uid
                if verification_token and verification_uid and expected_member_uids:
                    await tinode_reconcile_topic_members(
                        verification_token,
                        verification_uid,
                        item.tinode_topic,
                        expected_member_uids,
                    )
        db.session.commit()
        if is_group and participant_id == user_id and event_sender_tinode_token:
            try:
                await tinode_publish_system_event(
                    event_sender_tinode_token,
                    event_sender_uid,
                    item.tinode_topic,
                    {
                        "action": "member_left",
                        "actorId": participant_id,
                        "actorName": target_account.full_name or target_account.username or participant_id,
                    },
                )
            except Exception as error:
                # Membership is already authoritative; a missing activity event
                # must not make a successful leave appear to have failed.
                logger.warning("Could not publish the group leave event: %s", error)
        return json(_serialize_conversation(item, user_id))
    except AccountSSOError as error:
        db.session.rollback()
        await rollback_tinode_changes()
        if error.status_code != 503:
            revoke_request_token(request)
            revoked_error = AccountSSOError(str(error), 401, error.error_code)
            response = clear_auth_cookie(_account_sso_error(revoked_error), request)
            return clear_account_cookie(response)
        return _account_sso_error(error)
    except AuthError as error:
        db.session.rollback()
        await rollback_tinode_changes()
        return json({"error_code": "TINODE_MEMBERSHIP_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        await rollback_tinode_changes()
        logger.exception("Could not remove Chatmgt/Tinode participant: %s", error)
        return json({
            "error_code": "CONVERSATION_PARTICIPANT_ERROR",
            "error_message": "Could not remove the conversation participant.",
        }, status=503)
