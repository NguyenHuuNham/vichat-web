import asyncio
import datetime
import functools
import hmac
import json as jsonlib
import logging
import time
import uuid

from gatco.response import json, stream
from sqlalchemy import and_, func, or_

from application import database
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
    tinode_history_window,
    tinode_disabled_password,
    tinode_mirror_enabled,
    tinode_mirror_login,
    tinode_accept_topic_owner,
    tinode_dissolve_topic,
    tinode_remove_topic_member,
    tinode_reconcile_topic_members,
    tinode_publish_system_event,
    tinode_update_topic_public_metadata,
    tinode_sso_password,
    tinode_sso_login,
    tinode_topic_member_uids,
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
from application.services.tinode_chatbot_service import (
    ensure_tinode_chatbot_auth,
    tinode_chatbot_enabled,
)
from application.services.presence_service import (
    mark_offline,
    mark_online,
    presence_snapshot,
    presence_ttl,
)
from application.services.chat_maintenance_service import (
    MAINTENANCE_CHANNEL,
    maintenance_sse_chunk,
    normalize_maintenance_state,
    parse_enabled,
    read_maintenance_state,
    write_maintenance_state,
)
from application.services.chat_media_service import chat_media_status


logger = logging.getLogger(__name__)
ACCOUNT_SSO_PASSWORD_MARKER = "!account-sso-only"
_ACCOUNT_DIRECTORY_SYNC_CACHE = {}
_ACCOUNT_DIRECTORY_VISIBLE_CACHE = {}
ACCOUNT_SESSION_REVOCATION_ERRORS = frozenset({
    "ACCOUNT_LOGIN_REQUIRED",
    "ACCOUNT_COOKIE_AMBIGUOUS",
    "ACCOUNT_SESSION_INVALID",
    "ACCOUNT_SESSION_MISMATCH",
    "ACCOUNT_TENANT_INVALID",
    "ACCOUNT_ROLE_CHANGED",
    "ACCOUNT_DIRECTORY_TENANT_MISMATCH",
    "ACCOUNT_DIRECTORY_VIEWER_INVALID",
})

GROUP_SETTING_DEFAULTS = {
    "allowMembersEditInfo": False,
    "allowPinMessages": True,
    "allowMessages": True,
    "allowPolls": True,
    "approveMembers": False,
    "newMemberHistory": True,
}

# Direct conversations keep one shared Chatmgt row. A delete therefore stores
# only the viewer's history boundary instead of disabling the shared member.
DIRECT_DELETED_AT_PROPERTY = "direct_deleted_at_by_user"
GROUP_SETTING_KEYS = frozenset(GROUP_SETTING_DEFAULTS)
GROUP_ROLE_VALUES = frozenset({"OWNER", "ADMIN", "MEMBER"})
GROUP_BACKGROUND_PROPERTY_KEYS = ("conversationBackground", "conversation_background")
GROUP_BACKGROUND_MAX_URL_LENGTH = 8192

HISTORY_SEARCH_TYPES = frozenset({
    "all",
    "text",
    "image",
    "sticker",
    "file",
    "video",
    "audio",
    "document",
    "archive",
})
HISTORY_SEARCH_PAGE_LIMIT = 100
HISTORY_SEARCH_MAX_MESSAGES = 20000
HISTORY_SEARCH_TIMEZONE = datetime.timezone(datetime.timedelta(hours=7))
HISTORY_INTERNAL_MESSAGE_PREFIXES = (
    "__VICHAT_SYSTEM_EVENT__:",
    "__VICHAT_REACTION_EVENT__:",
    "__VICHAT_RECALL_EVENT__:",
    "__SONGHONG_FRIEND_EVENT__:",
)
CONVERSATION_NICKNAMES_PROPERTY = "conversation_nicknames"
CONVERSATION_NICKNAME_MAX_LENGTH = 80
CONVERSATION_NICKNAME_MAX_COUNT = 1000
AUTHORITATIVE_AVATAR_PROPERTY = "chat_authoritative_avatar"
GROUP_AVATAR_PROPERTY_KEYS = ("group_avatar", "avatar", "avatar_url", "avatarUrl")


def _normalized_group_settings(value=None):
    source = value if isinstance(value, dict) else {}
    return {
        key: source[key] if isinstance(source.get(key), bool) else default
        for key, default in GROUP_SETTING_DEFAULTS.items()
    }


def _group_role(value):
    """Normalize the per-conversation role without touching Account role."""
    role = str(value or "MEMBER").strip().upper()
    return role if role in GROUP_ROLE_VALUES else "MEMBER"


def _is_group_owner(participant):
    return _group_role(getattr(participant, "role", "")) == "OWNER"


def _is_group_deputy(participant):
    return _group_role(getattr(participant, "role", "")) == "ADMIN"


def _is_group_manager(participant):
    return _group_role(getattr(participant, "role", "")) in {"OWNER", "ADMIN"}


def _conversation_avatar(properties):
    source = properties if isinstance(properties, dict) else {}
    return next(
        (
            str(source.get(key) or "").strip()
            for key in GROUP_AVATAR_PROPERTY_KEYS
            if str(source.get(key) or "").strip()
        ),
        "",
    )


def _normalized_group_background(value, updated_at=None):
    """Normalize shared group background metadata before persisting it."""
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("The group background must be an object or null.")
    url = str(
        value.get("url")
        or value.get("backgroundUrl")
        or value.get("background_url")
        or ""
    ).strip()
    if not url:
        return None
    if len(url) > GROUP_BACKGROUND_MAX_URL_LENGTH:
        raise ValueError("The group background reference is too long.")
    background = {
        "id": str(value.get("id") or "").strip()[:120],
        "url": url,
        "label": str(
            value.get("label")
            or value.get("backgroundLabel")
            or value.get("background_label")
            or "Hinh nen cuoc tro chuyen"
        ).strip()[:255],
        "kind": str(
            value.get("kind")
            or value.get("backgroundKind")
            or value.get("background_kind")
            or "custom"
        ).strip()[:40],
        "scope": "shared",
    }
    timestamp = str(
        updated_at
        or value.get("updatedAt")
        or value.get("updated_at")
        or ""
    ).strip()
    if timestamp:
        background["updatedAt"] = timestamp[:80]
    return background


def _conversation_background(properties):
    source = properties if isinstance(properties, dict) else {}
    for key in GROUP_BACKGROUND_PROPERTY_KEYS:
        if key not in source:
            continue
        try:
            return _normalized_group_background(source.get(key))
        except ValueError:
            return None
    return None


def _same_group_background(first, second):
    first = first if isinstance(first, dict) else {}
    second = second if isinstance(second, dict) else {}
    return all(
        str(first.get(key) or "").strip() == str(second.get(key) or "").strip()
        for key in ("id", "url", "label", "kind", "scope")
    )


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


def _account_default_name(account):
    return str(account.full_name or account.username or account.id or "").strip()


def _account_display_name(account, viewer_account=None):
    # Account identity remains official; aliases are applied only by the
    # conversation serializer below.
    return _account_default_name(account), ""


def _public_account(account, tenant=None):
    properties = account.properties or {}
    auth_source = str(properties.get("auth_source") or "local")
    default_name = _account_default_name(account)
    display_name, _nickname = _account_display_name(account)
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
        "name": display_name,
        "fullName": default_name,
        "full_name": default_name,
        "displayName": display_name,
        "display_name": display_name,
        "defaultName": default_name,
        "default_name": default_name,
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
        # The directory snapshot keeps the legacy field for compatibility;
        # ChatUI overlays Redis-backed presence after loading it.
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


def _group_info_permission_error():
    return json({
        "error_code": "GROUP_INFO_PERMISSION_REQUIRED",
        "error_message": "Bạn chưa được admin cấp phép.",
    }, status=403)


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


def _direct_message_policy(sender_uid, topic_name):
    sender_uid = str(sender_uid or "").strip()
    topic_name = str(topic_name or "").strip()
    default = {
        "managed": False,
        "allowed": True,
        "blockedBySender": False,
        "blockedByPeer": False,
    }
    invalid = {
        **default,
        "managed": True,
        "allowed": False,
        "errorCode": "DIRECT_MESSAGE_POLICY_INVALID",
    }
    if (
        sender_uid == topic_name
        or not valid_tinode_topic(sender_uid, False)
        or not valid_tinode_topic(topic_name, False)
    ):
        return default

    senders = ManagementAccount.query.filter(
        ManagementAccount.tinode_uid == sender_uid,
    ).all()
    if len(senders) > 1:
        return invalid
    if not senders:
        return default
    sender = senders[0]
    if not sender.active:
        return invalid
    peers = ManagementAccount.query.filter(
        ManagementAccount.tinode_uid == topic_name,
    ).all()
    if len(peers) > 1:
        return invalid
    if not peers:
        return default
    peer = peers[0]
    if not peer.active or str(peer.tenant_id) != str(sender.tenant_id):
        return invalid
    if str(peer.id) == str(sender.id):
        return default

    participant_ids = sorted((str(sender.id), str(peer.id)))
    direct_key = ":".join(participant_ids)
    items = Conversation.query.filter(
        Conversation.tenant_id == sender.tenant_id,
        Conversation.deleted.is_(False),
        Conversation.properties.contains({"direct_key": direct_key}),
    ).all()
    direct_items = [item for item in items if not bool((item.properties or {}).get("is_group"))]
    if not direct_items:
        return default

    blocked_by_sender = False
    blocked_by_peer = False
    for item in direct_items:
        participants = _direct_block_participants(item)
        participants_by_id = {
            str(participant.participant_id): participant for participant in participants
        }
        if set(participants_by_id) != set(participant_ids):
            return invalid
        blocked_by_sender = (
            blocked_by_sender
            or participants_by_id[str(sender.id)].blocked_at is not None
        )
        blocked_by_peer = (
            blocked_by_peer
            or participants_by_id[str(peer.id)].blocked_at is not None
        )
    return {
        "managed": True,
        "allowed": not (blocked_by_sender or blocked_by_peer),
        "blockedBySender": blocked_by_sender,
        "blockedByPeer": blocked_by_peer,
        **({"errorCode": "DIRECT_MESSAGE_BLOCKED"} if blocked_by_sender or blocked_by_peer else {}),
    }


def _sso_account(identity, mark_login=True, authoritative_avatar=None):
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
    properties = dict(account.properties or {})
    if authoritative_avatar is not None:
        explicit_avatar = str(authoritative_avatar or "").strip()
        # Only a confirmed non-empty upload may replace the stored avatar.
        # Empty Account snapshots must not erase a user's last known image.
        if explicit_avatar:
            properties[AUTHORITATIVE_AVATAR_PROPERTY] = explicit_avatar
    elif not directory_projection and identity.get("avatar_present", True):
        # A full Account session is authoritative. Refresh the marker when
        # the avatar changes outside ChatUI so directory sync cannot restore
        # an older projection.
        current_avatar = str(identity.get("avatar") or "").strip()
        if current_avatar:
            properties[AUTHORITATIVE_AVATAR_PROPERTY] = current_avatar
    persisted_avatar = str(properties.get(AUTHORITATIVE_AVATAR_PROPERTY) or "").strip()
    has_persisted_avatar = bool(persisted_avatar)
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
    if has_persisted_avatar:
        # A directory response can lag behind a confirmed upload. Keep the
        # last explicit avatar update until another upload replaces it.
        account.avatar = persisted_avatar
    elif str(identity.get("avatar") or "").strip():
        account.avatar = str(identity.get("avatar") or "").strip()
    account.password_hash = ACCOUNT_SSO_PASSWORD_MARKER
    projected_active = bool(identity.get("active", True))
    active_changed = bool(account.active) != projected_active
    account.active = projected_active
    account.updated_at = now
    _repair_unprovisioned_tinode_username(account, identity)
    if mark_login:
        account.last_login_at = now
    properties.update(linked_properties)
    if not directory_projection or identity.get("role_present"):
        properties["account_role"] = identity.get("account_role") or "member"
    properties["account_username"] = account_username or ""
    properties["account_email"] = account_email or ""
    if identity.get("directory_projection"):
        properties["directory_synced_at"] = now
    if account.active:
        # A later authoritative Account identity can safely restore a
        # projection removed by a complete directory snapshot.
        properties.pop("directory_removed_at", None)
    properties.setdefault("auth_version", 0)
    if active_changed:
        # Active-state changes revoke older Chatmgt JWTs. A later Account login
        # can restore the same projection and receives the new version.
        properties["auth_version"] = int(properties.get("auth_version") or 0) + 1
    if account.active:
        properties.pop("directory_identity_released", None)
    account.properties = properties
    return tenant, account


async def _validated_account_identity(request, account):
    identity = await current_account_session(
        request,
        require_current_tenant=True,
    )
    expected_account_user_id = str(
        (account.properties or {}).get("account_user_id") or ""
    ).strip()
    if str(identity.get("account_user_id") or "").strip() != expected_account_user_id:
        raise AccountSSOError(
            "The Account user does not match the Chatmgt session.",
            401,
            "ACCOUNT_SESSION_MISMATCH",
        )
    if str(identity.get("tenant_id") or "").strip() != str(account.tenant_id or "").strip():
        raise AccountSSOError(
            "The Account current company does not match the Chatmgt session.",
            401,
            "ACCOUNT_DIRECTORY_TENANT_MISMATCH",
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


async def _restore_directory_removed_account(request):
    """Repair legacy removals that predate active-state session revocation."""
    try:
        token_user = current_jwt_user(request)
    except Exception:
        token_user = None
    if not token_user or token_user.get("auth_method") != "account_sso":
        return None

    tenant_id = str(
        token_user.get("current_tenant_id") or token_user.get("tenant_id") or ""
    ).strip()
    user_id = _user_id(token_user)
    if not tenant_id or not user_id:
        return None
    account = ManagementAccount.query.filter(
        ManagementAccount.id == user_id,
        ManagementAccount.tenant_id == tenant_id,
    ).first()
    properties = dict((account.properties if account is not None else {}) or {})
    if (
        account is None
        or account.active
        or properties.get("auth_source") != "account"
        or not properties.get("directory_removed_at")
        or int(token_user.get("auth_version") or 0)
        != int(properties.get("auth_version") or 0)
    ):
        return None
    if _tenant_by_id(tenant_id) is None:
        return None

    try:
        identity = await _validated_account_identity(request, account)
    except AccountSSOError as error:
        if error.status_code == 503:
            return _account_sso_error(error)
        return None

    try:
        # Rehydrate released username/email fields from the verified Account
        # identity before making the legacy row visible again.
        account.active = True
        properties.pop("directory_removed_at", None)
        account.properties = properties
        _tenant, restored_account = _sso_account(identity, mark_login=False)
        if str(restored_account.id) != str(account.id):
            db.session.rollback()
            return None
        db.session.commit()
    except Exception as error:
        db.session.rollback()
        logger.exception("Could not restore Account directory projection %s: %s", account.id, error)
        _audit(
            request,
            "ACCOUNT_DIRECTORY_RESTORE",
            False,
            tenant_id=tenant_id,
            user_id=str(account.id),
            properties={"error_code": "ACCOUNT_PROJECTION_RESTORE_UNAVAILABLE"},
        )
        return json({
            "error_code": "ACCOUNT_PROJECTION_RESTORE_UNAVAILABLE",
            "error_message": "The account session is temporarily unavailable.",
        }, status=503)
    _audit(
        request,
        "ACCOUNT_DIRECTORY_RESTORE",
        True,
        tenant_id=tenant_id,
        user_id=str(account.id),
        properties={"legacy_projection": True},
    )
    return None


def _directory_removed_username(tenant_id, account_id):
    fingerprint = uuid.uuid5(
        uuid.NAMESPACE_URL,
        "vichat-directory-removed:{}:{}".format(tenant_id, account_id),
    ).hex
    return "directory_removed_{}".format(fingerprint)


def _deactivate_missing_account_projections(tenant_id, snapshot_identities):
    snapshot_account_user_ids = {
        str(identity.get("account_user_id") or "").strip()
        for identity in snapshot_identities
        if str(identity.get("account_user_id") or "").strip()
    }
    snapshot_usernames = {
        str(identity.get("username") or "").strip().lower()
        for identity in snapshot_identities
        if str(identity.get("username") or "").strip()
    }
    snapshot_emails = {
        str(identity.get("email") or "").strip().lower()
        for identity in snapshot_identities
        if str(identity.get("email") or "").strip()
    }
    missing_accounts = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == tenant_id,
        ManagementAccount.properties.contains({"auth_source": "account"}),
    ).all()
    now = int(time.time())
    deactivated = 0
    released_conflicts = 0
    for missing_account in missing_accounts:
        properties = dict(missing_account.properties or {})
        account_user_id = str(properties.get("account_user_id") or "").strip()
        if not account_user_id or account_user_id in snapshot_account_user_ids:
            continue
        was_active = bool(missing_account.active)
        if was_active:
            missing_account.active = False
            properties["auth_version"] = int(properties.get("auth_version") or 0) + 1
            deactivated += 1
        released_identity = False
        if str(missing_account.username or "").strip().lower() in snapshot_usernames:
            missing_account.username = _directory_removed_username(
                tenant_id,
                missing_account.id,
            )
            released_identity = True
        if str(missing_account.email or "").strip().lower() in snapshot_emails:
            missing_account.email = None
            released_identity = True
        if released_identity:
            # Keep the row and historical references, but free unique identity
            # fields so the authoritative Account user can be projected.
            properties["directory_identity_released"] = True
            released_conflicts += 1
        if was_active or not properties.get("directory_removed_at") or released_identity:
            properties["directory_removed_at"] = now
            missing_account.updated_at = now
        missing_account.properties = properties
    return deactivated, released_conflicts


def _deactivate_directory_viewer(account):
    """Revoke a viewer rejected by the authoritative Account directory."""
    if account is None:
        return False
    properties = dict(account.properties or {})
    now = int(time.time())
    was_active = bool(account.active)
    if was_active:
        account.active = False
        properties["auth_version"] = int(properties.get("auth_version") or 0) + 1
    properties["directory_removed_at"] = now
    account.updated_at = now
    account.properties = properties
    return was_active


def _clear_account_directory_cache(tenant_id, account_id):
    directory_cache_key = (str(tenant_id), str(account_id))
    _ACCOUNT_DIRECTORY_SYNC_CACHE.pop(directory_cache_key, None)
    _ACCOUNT_DIRECTORY_VISIBLE_CACHE.pop(directory_cache_key, None)


def _account_projection_matches_identity(account, identity):
    if account is None or not isinstance(identity, dict):
        return True
    fields = (
        ("username", "username"),
        ("full_name", "full_name"),
        ("department", "department"),
        ("title", "title"),
        ("role", "role"),
        ("avatar", "avatar"),
    )
    for account_field, identity_field in fields:
        if identity_field == "avatar" and not identity.get("avatar_present", True):
            continue
        if str(getattr(account, account_field) or "") != str(identity.get(identity_field) or ""):
            return False
    return True


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


def _record_tinode_uid(account, tinode_uid):
    actual_uid = str(tinode_uid or "").strip()
    if not actual_uid:
        raise AuthError("Tinode did not return a user mapping.", 502)
    if str(account.tinode_uid or "").strip() != actual_uid:
        account.tinode_uid = actual_uid
        account.updated_at = int(time.time())
    return actual_uid


async def _tinode_account_credentials(account):
    expected_uid = await _ensure_tinode_account(account)
    auth = await tinode_sso_login(
        _tinode_account_identity(account),
        account.tinode_username,
        expected_uid,
    )
    actual_uid = _record_tinode_uid(account, auth.get("uid"))
    token = str(auth.get("token") or "").strip()
    if not token:
        raise AuthError("Tinode could not authenticate the account.", 502)
    return actual_uid, token


async def _ensure_tinode_accounts(accounts, concurrency=8):
    account_list = list(accounts)
    semaphore = asyncio.Semaphore(max(1, int(concurrency)))

    async def prepare(account):
        async with semaphore:
            return str(account.id), await _ensure_tinode_account(account)

    prepared = await asyncio.gather(*(prepare(account) for account in account_list))
    return dict(prepared)


async def _tinode_tokens_for_accounts(accounts_by_id, account_ids, prepared_uids, concurrency=8):
    semaphore = asyncio.Semaphore(max(1, int(concurrency)))

    async def authenticate(account_id):
        account = accounts_by_id[account_id]
        tinode_uid = str(prepared_uids[account_id])
        async with semaphore:
            auth = await tinode_sso_login(
                _tinode_account_identity(account),
                account.tinode_username,
                tinode_uid,
            )
        actual_uid = _record_tinode_uid(account, auth.get("uid"))
        prepared_uids[account_id] = actual_uid
        token = str(auth.get("token") or "").strip()
        if not token:
            raise AuthError("Tinode could not authenticate a group member.", 502)
        return actual_uid, token

    authenticated = await asyncio.gather(*(
        authenticate(account_id) for account_id in account_ids
    ))
    return dict(authenticated)


async def _group_owner_tinode_credentials(item, participants=None, accounts_by_id=None):
    """Return the authoritative owner bridge used for group mutations."""
    if not item.tinode_topic:
        raise AuthError("The group is not bound to a Tinode topic.", 409)
    if participants is None or accounts_by_id is None:
        participants, accounts_by_id = _active_conversation_accounts(item)
    owner_participant = next(
        (participant for participant in participants if _is_group_owner(participant)),
        None,
    )
    owner_account = (
        accounts_by_id.get(str(owner_participant.participant_id))
        if owner_participant is not None
        else None
    )
    if owner_account is None:
        raise AuthError("The group has no active owner.", 409)
    owner_uid = await _ensure_tinode_account(owner_account)
    owner_auth = await tinode_sso_login(
        _tinode_account_identity(owner_account),
        owner_account.tinode_username,
        owner_uid,
    )
    owner_uid = _record_tinode_uid(owner_account, owner_auth.get("uid"))
    owner_token = str(owner_auth.get("token") or "").strip()
    if not owner_uid or not owner_token:
        raise AuthError("Tinode could not authenticate the group owner.", 502)
    return owner_account, owner_uid, owner_token


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
        ConversationParticipant.approval_status == "APPROVED",
        ConversationParticipant.deleted.is_(False),
    ).all()
    participant_ids = [str(participant.participant_id) for participant in participants]
    accounts = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == item.tenant_id,
        ManagementAccount.id.in_(participant_ids),
        ManagementAccount.active.is_(True),
    ).all() if participant_ids else []
    accounts_by_id = {str(account.id): account for account in accounts}
    if bool((item.properties or {}).get("is_group")):
        # A group can outlive an Account directory projection. Ignore those
        # stale rows so the surviving members can still open and use Tinode;
        # the authoritative membership snapshot already hides them.
        participants = [
            participant
            for participant in participants
            if str(participant.participant_id) in accounts_by_id
        ]
    elif set(participant_ids) != set(accounts_by_id):
        raise AuthError("A Chatmgt participant is no longer active in this tenant.", 409)
    return participants, accounts_by_id


def _direct_conversation_accounts(item):
    """Return both direct participants, including a legacy inactive member."""
    participants = ConversationParticipant.query.filter(
        ConversationParticipant.tenant_id == item.tenant_id,
        ConversationParticipant.conversation_id == item.id,
        ConversationParticipant.approval_status == "APPROVED",
        ConversationParticipant.deleted.is_(False),
    ).order_by(ConversationParticipant.created_at.asc()).all()
    participant_ids = [str(participant.participant_id) for participant in participants]
    accounts = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == item.tenant_id,
        ManagementAccount.id.in_(participant_ids),
        ManagementAccount.active.is_(True),
    ).all() if participant_ids else []
    accounts_by_id = {str(account.id): account for account in accounts}
    if set(participant_ids) != set(accounts_by_id):
        raise AuthError("A Chatmgt participant is no longer active in this tenant.", 409)
    return participants, accounts_by_id


def _restore_legacy_direct_memberships(item):
    """Repair direct rows created by the old delete-as-leave behavior."""
    if bool((item.properties or {}).get("is_group")):
        return False
    try:
        participants, _accounts_by_id = _direct_conversation_accounts(item)
    except AuthError:
        return False
    participant_ids = [participant.participant_id for participant in participants]
    if len(participants) != 2 or len(set(participant_ids)) != 2:
        return False
    now = int(time.time())
    changed = False
    for participant in participants:
        if participant.active is not True:
            participant.active = True
            participant.left_at = None
            participant.updated_at = now
            changed = True
    return changed


def _conversation_deleted_at(item, viewer_id, membership=None):
    properties = item.properties or {}
    markers = properties.get(DIRECT_DELETED_AT_PROPERTY)
    if isinstance(markers, dict):
        marker = str(markers.get(str(viewer_id)) or "").strip()
        if marker:
            return marker
    # Existing rows used active=false for direct deletion. Keep their old
    # boundary readable while new deletes use the viewer-scoped marker above.
    if membership is not None and membership.active is not True and membership.left_at:
        try:
            return datetime.datetime.fromtimestamp(
                int(membership.left_at),
                datetime.timezone.utc,
            ).isoformat().replace("+00:00", "Z")
        except (TypeError, ValueError, OverflowError, OSError):
            return ""
    return ""


def _clear_direct_deleted_marker(item, viewer_id):
    """Clear only this viewer's history boundary when a direct chat resumes."""
    properties = dict(item.properties or {})
    markers = properties.get(DIRECT_DELETED_AT_PROPERTY)
    if not isinstance(markers, dict) or str(viewer_id) not in markers:
        return False
    markers = {
        str(key): str(value)
        for key, value in markers.items()
        if str(key) != str(viewer_id) and key and value
    }
    if markers:
        properties[DIRECT_DELETED_AT_PROPERTY] = markers
    else:
        properties.pop(DIRECT_DELETED_AT_PROPERTY, None)
    item.properties = properties
    return True


def _expected_tinode_member_uids(item, participants, accounts_by_id):
    expected = {
        str(accounts_by_id[participant.participant_id].tinode_uid or "")
        for participant in participants
    }
    properties = item.properties or {}
    chatbot_uid = str(properties.get("chatbot_tinode_uid") or "").strip()
    if properties.get("chatbot_enabled") and chatbot_uid:
        expected.add(chatbot_uid)
    return expected


def _expected_tinode_access_modes(item, participants, accounts_by_id):
    modes = {
        str(accounts_by_id[participant.participant_id].tinode_uid or ""):
            "JRWPASO" if _is_group_owner(participant)
            else "JRWPASD" if _is_group_deputy(participant)
            else "JRWPAS"
        for participant in participants
    }
    properties = item.properties or {}
    chatbot_uid = str(properties.get("chatbot_tinode_uid") or "").strip()
    if properties.get("chatbot_enabled") and chatbot_uid:
        modes[chatbot_uid] = "JRWPAS"
    modes.pop("", None)
    return modes


def _participant_approval_status(participant):
    return str(getattr(participant, "approval_status", "APPROVED") or "APPROVED").upper()


def _direct_block_participants(item):
    return ConversationParticipant.query.filter(
        ConversationParticipant.tenant_id == item.tenant_id,
        ConversationParticipant.conversation_id == item.id,
        ConversationParticipant.approval_status == "APPROVED",
        ConversationParticipant.deleted.is_(False),
    ).order_by(ConversationParticipant.created_at.asc()).all()


def _direct_block_state(item, viewer_id, participants=None):
    if bool((item.properties or {}).get("is_group")):
        return {
            "blockedByViewer": False,
            "blockedByPeer": False,
            "directMessagingBlocked": False,
        }
    if participants is None:
        participants = _direct_block_participants(item)
    viewer_id = str(viewer_id or "")
    viewer_membership = next(
        (participant for participant in participants if participant.participant_id == viewer_id),
        None,
    )
    peer_membership = next(
        (participant for participant in participants if participant.participant_id != viewer_id),
        None,
    )
    blocked_by_viewer = bool(
        viewer_membership is not None and viewer_membership.blocked_at is not None
    )
    blocked_by_peer = bool(
        peer_membership is not None and peer_membership.blocked_at is not None
    )
    return {
        "blockedByViewer": blocked_by_viewer,
        "blockedByPeer": blocked_by_peer,
        "directMessagingBlocked": blocked_by_viewer or blocked_by_peer,
    }


def _valid_direct_block_participants(item, viewer_id):
    if bool((item.properties or {}).get("is_group")):
        return None
    participants = _direct_block_participants(item)
    participant_ids = [str(participant.participant_id) for participant in participants]
    if (
        len(participants) != 2
        or len(set(participant_ids)) != 2
        or str(viewer_id or "") not in participant_ids
    ):
        return None
    return participants


def _direct_block_payload(item, viewer_id, participants=None):
    return {
        "conversationId": str(item.id),
        **_direct_block_state(item, viewer_id, participants),
    }


def _ensure_direct_key(item, participants):
    properties = dict(item.properties or {})
    if properties.get("direct_key"):
        return False
    participant_ids = sorted({
        str(participant.participant_id or "").strip()
        for participant in participants
        if str(participant.participant_id or "").strip()
    })
    if len(participant_ids) != 2:
        return False
    properties["direct_key"] = ":".join(participant_ids)
    item.properties = properties
    return True


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


async def _publish_group_activity_events(item, events):
    """Broadcast committed group changes through the owner bridge."""
    if not item or not item.tinode_topic or not events:
        return
    try:
        participants, accounts_by_id = _active_conversation_accounts(item)
        _owner_account, owner_uid, owner_token = await _group_owner_tinode_credentials(
            item,
            participants,
            accounts_by_id,
        )
        metadata_actions = {
            "group_name_changed",
            "group_avatar_changed",
            "group_settings_changed",
            "conversation_background_changed",
        }
        if any(event.get("action") in metadata_actions for event in events if isinstance(event, dict)):
            try:
                await _sync_group_tinode_metadata(item, owner_token, owner_uid)
            except Exception as error:
                # Chatmgt is already committed and remains the source of truth.
                logger.warning("Could not sync group metadata to Tinode: %s", error)
        for event in events:
            try:
                await tinode_publish_system_event(
                    owner_token,
                    owner_uid,
                    item.tinode_topic,
                    event,
                )
            except Exception as error:
                # Chatmgt remains authoritative when an activity packet is
                # delayed; clients refresh the committed snapshot separately.
                logger.warning("Could not publish group activity event: %s", error)
    except Exception as error:
        logger.warning("Could not prepare the group activity publisher: %s", error)


async def _publish_direct_activity_events(item, events, actor_account=None):
    """Publish a committed direct-chat activity through the current member."""
    if not item or not events or bool((item.properties or {}).get("is_group")):
        return
    try:
        participants, accounts_by_id = _active_conversation_accounts(item)
        actor_account = actor_account or accounts_by_id.get(
            str((events[0] or {}).get("actorAccountId") or "").strip()
        )
        actor_id = str(getattr(actor_account, "id", "") or "").strip()
        if actor_account is None or not actor_id or actor_id not in accounts_by_id:
            return
        prepared_uids = await _ensure_tinode_accounts(accounts_by_id.values())
        db.session.commit()
        participant_ids = [str(participant.participant_id) for participant in participants]
        topic_name = direct_peer_tinode_uid(
            actor_id,
            participant_ids,
            {
                participant_id: str(prepared_uids.get(participant_id) or "").strip()
                for participant_id in participant_ids
            },
        )
        if not topic_name or not valid_tinode_topic(topic_name, False):
            return
        actor_uid = str(prepared_uids.get(actor_id) or actor_account.tinode_uid or "").strip()
        actor_auth = await tinode_sso_login(
            _tinode_account_identity(actor_account),
            actor_account.tinode_username,
            actor_uid,
        )
        actor_token = str(actor_auth.get("token") or "").strip()
        if not actor_uid or not actor_token:
            return
        for event in events:
            try:
                await tinode_publish_system_event(
                    actor_token,
                    actor_uid,
                    topic_name,
                    event,
                )
            except Exception as error:
                # Chatmgt remains authoritative when the realtime bridge is
                # temporarily unavailable; the next snapshot repairs the UI.
                logger.warning("Could not publish direct activity event: %s", error)
    except Exception as error:
        logger.warning("Could not prepare the direct activity publisher: %s", error)


async def _sync_group_tinode_metadata(item, owner_token=None, owner_uid=None):
    """Mirror committed Chatmgt group metadata without using a deputy token."""
    if not item or not item.tinode_topic:
        return None
    if not owner_token or not owner_uid:
        participants, accounts_by_id = _active_conversation_accounts(item)
        _owner_account, owner_uid, owner_token = await _group_owner_tinode_credentials(
            item,
            participants,
            accounts_by_id,
        )

    properties = item.properties or {}
    public_updates = {}
    group_name = str(item.subject or "").strip()
    if group_name:
        public_updates["fn"] = group_name
    avatar = _conversation_avatar(properties)
    if avatar:
        public_updates["photo"] = {"ref": avatar}

    group_vichat = {
        "groupSettings": _normalized_group_settings(
            properties.get("groupSettings") or properties.get("group_settings")
        ),
    }
    if any(key in properties for key in GROUP_BACKGROUND_PROPERTY_KEYS):
        # Null is an explicit clear; an absent property means preserve legacy
        # Tinode metadata until Chatmgt receives a deliberate background edit.
        group_vichat["conversationBackground"] = _conversation_background(properties)
    public_updates["vichat"] = group_vichat
    return await tinode_update_topic_public_metadata(
        owner_token,
        owner_uid,
        item.tinode_topic,
        public_updates,
    )


def _public_group_member(account, participant):
    payload = _public_account(account)
    role = _group_role(getattr(participant, "role", ""))
    payload["groupRole"] = role
    payload["group_role"] = role
    return payload


def _public_conversation_member(account, participant, nicknames, is_group=False):
    """Overlay the public conversation nickname shared by every participant."""
    payload = (
        _public_group_member(account, participant)
        if is_group
        else _public_account(account)
    )
    conversation_nickname = str(nicknames.get(str(account.id), "") or "").strip()
    payload["conversationNickname"] = conversation_nickname
    payload["conversation_nickname"] = conversation_nickname
    payload["nickname"] = conversation_nickname
    if conversation_nickname:
        payload["name"] = conversation_nickname
        payload["displayName"] = conversation_nickname
        payload["display_name"] = conversation_nickname
    return payload


def _serialize_conversation(item, viewer_id):
    properties = item.properties or {}
    is_group = bool(properties.get("is_group"))
    participant_query = ConversationParticipant.query.filter(
        ConversationParticipant.tenant_id == item.tenant_id,
        ConversationParticipant.conversation_id == item.id,
        ConversationParticipant.deleted.is_(False),
        ConversationParticipant.approval_status == "APPROVED",
    )
    if is_group:
        participant_query = participant_query.filter(ConversationParticipant.active.is_(True))
    participants = participant_query.order_by(ConversationParticipant.created_at.asc()).all()
    participant_ids = [participant.participant_id for participant in participants]
    accounts = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == item.tenant_id,
        ManagementAccount.id.in_(participant_ids),
        ManagementAccount.active.is_(True),
    ).all() if participant_ids else []
    accounts_by_id = {str(account.id): account for account in accounts}
    if is_group:
        # An active participant row whose Account projection is disabled is not
        # a usable group member or replacement owner.
        participants = [
            participant
            for participant in participants
            if str(participant.participant_id) in accounts_by_id
        ]
        participant_ids = [str(participant.participant_id) for participant in participants]
    conversation_nicknames = _conversation_nicknames(item)
    owner = next((participant for participant in participants if _is_group_owner(participant)), None)
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
    group_settings = _normalized_group_settings(
        properties.get("groupSettings") or properties.get("group_settings")
    ) if is_group else None
    group_background = _conversation_background(properties) if is_group else None
    pending_participants = []
    pending_accounts_by_id = {}
    viewer_can_approve_members = bool(
        viewer_membership is not None
        and _is_group_manager(viewer_membership)
    )
    if is_group and viewer_can_approve_members:
        pending_participants = ConversationParticipant.query.filter(
            ConversationParticipant.tenant_id == item.tenant_id,
            ConversationParticipant.conversation_id == item.id,
            ConversationParticipant.deleted.is_(False),
            ConversationParticipant.active.is_(False),
            ConversationParticipant.approval_status == "PENDING",
        ).order_by(ConversationParticipant.created_at.asc()).all()
        pending_ids = [participant.participant_id for participant in pending_participants]
        pending_accounts = ManagementAccount.query.filter(
            ManagementAccount.tenant_id == item.tenant_id,
            ManagementAccount.id.in_(pending_ids),
            ManagementAccount.active.is_(True),
        ).all() if pending_ids else []
        pending_accounts_by_id = {str(account.id): account for account in pending_accounts}
    tinode_topic = item.tinode_topic if is_group else direct_peer_tinode_uid(
        viewer_id,
        participant_ids,
        {
            participant_id: accounts_by_id[participant_id].tinode_uid
            for participant_id in participant_ids
            if participant_id in accounts_by_id
        },
    )
    conversation_name = item.subject
    peer_account = None
    if not is_group:
        peer_account = next(
            (
                accounts_by_id[participant_id]
                for participant_id in participant_ids
                if participant_id != str(viewer_id) and participant_id in accounts_by_id
            ),
            None,
        )
    if peer_account is not None:
        conversation_name, _nickname = _account_display_name(peer_account)
        conversation_name = conversation_nicknames.get(str(peer_account.id), "") or conversation_name
    direct_peer = next(
        (
            participant
            for participant in participants
            if participant.participant_id != str(viewer_id)
        ),
        None,
    ) if not is_group else None
    direct_block_state = _direct_block_state(item, viewer_id, participants)
    direct_deleted_at = _conversation_deleted_at(item, viewer_id, viewer_membership) if not is_group else ""
    public_properties = dict(properties)
    public_properties.pop(DIRECT_DELETED_AT_PROPERTY, None)
    public_properties.pop(CONVERSATION_NICKNAMES_PROPERTY, None)
    return {
        "id": str(item.id),
        "conversation_no": item.conversation_no,
        "tenant_id": item.tenant_id,
        "tinode_topic": tinode_topic,
        "deletedAt": direct_deleted_at,
        "name": conversation_name,
        "subject": item.subject,
        "status": item.status,
        "priority": item.priority,
        "last_message_at": item.last_message_at,
        "updated_at": item.updated_at,
        "properties": public_properties,
        "conversationNicknames": conversation_nicknames,
        "isGroup": is_group,
        "avatar": _conversation_avatar(properties),
        "groupSettings": group_settings,
        **({"conversationBackground": group_background} if is_group else {}),
        "participantIds": participant_ids,
        "members": [
            (
                _public_conversation_member(
                    accounts_by_id[participant.participant_id],
                    participant,
                    conversation_nicknames,
                    is_group=is_group,
                )
            )
            for participant in participants
            if participant.participant_id in accounts_by_id
        ],
        "pendingParticipantIds": [
            participant.participant_id
            for participant in pending_participants
            if participant.participant_id in pending_accounts_by_id
        ],
        "pendingMembers": [
            (
                _public_conversation_member(
                    pending_accounts_by_id[participant.participant_id],
                    participant,
                    conversation_nicknames,
                    is_group=is_group,
                )
            )
            for participant in pending_participants
            if participant.participant_id in pending_accounts_by_id
        ],
        "adminId": owner.participant_id if owner is not None else "",
        "notificationMutedUntil": notification_muted_until,
        "notificationsMuted": notifications_muted,
        "pinned": pinned_at is not None,
        "pinnedAt": pinned_at,
        **direct_block_state,
    }


def _conversation_and_membership(
    tenant_id,
    conversation_id,
    user_id,
    allow_legacy_direct=False,
):
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
        ConversationParticipant.approval_status == "APPROVED",
        ConversationParticipant.deleted.is_(False),
    ).first()
    if membership is None and allow_legacy_direct and not bool((item.properties or {}).get("is_group")):
        membership = ConversationParticipant.query.filter(
            ConversationParticipant.tenant_id == tenant_id,
            ConversationParticipant.conversation_id == item.id,
            ConversationParticipant.participant_id == user_id,
            ConversationParticipant.active.is_(False),
            ConversationParticipant.approval_status == "APPROVED",
            ConversationParticipant.deleted.is_(False),
        ).first()
    return item, membership


def _conversation_nicknames(item):
    """Return the bounded public nickname map for this conversation."""
    raw = (item.properties or {}).get(CONVERSATION_NICKNAMES_PROPERTY)
    if not isinstance(raw, dict):
        return {}
    result = {}
    for contact_id, nickname in raw.items():
        contact_key = str(contact_id or "").strip()
        value = str(nickname or "").strip()
        if (
            contact_key
            and value
            and len(value) <= CONVERSATION_NICKNAME_MAX_LENGTH
            and len(result) < CONVERSATION_NICKNAME_MAX_COUNT
        ):
            result[contact_key] = value
    return result


def _history_search_datetime(value, end_of_day=False):
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        if len(raw) == 10:
            parsed = datetime.datetime.strptime(raw, "%Y-%m-%d")
            if end_of_day:
                parsed = parsed.replace(hour=23, minute=59, second=59, microsecond=999999)
        else:
            parsed = datetime.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=HISTORY_SEARCH_TIMEZONE)
        return parsed.astimezone(datetime.timezone.utc)
    except (TypeError, ValueError, OverflowError):
        raise AuthError("The history date filter is invalid.", 400)


def _history_message_datetime(message):
    value = (message or {}).get("ts")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        try:
            return datetime.datetime.fromtimestamp(value, datetime.timezone.utc)
        except (TypeError, ValueError, OverflowError):
            return None
    try:
        parsed = datetime.datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
    except (TypeError, ValueError, OverflowError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed.astimezone(datetime.timezone.utc)


def _history_message_attachment(content):
    if not isinstance(content, dict):
        return None
    for entity in content.get("ent") or []:
        if not isinstance(entity, dict) or entity.get("tp") not in ("EX", "IM"):
            continue
        data = entity.get("data")
        if isinstance(data, dict):
            return {"type": entity.get("tp"), **data}
    return None


def _history_message_text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        return str(content.get("txt") or content.get("text") or "")
    return ""


def _history_message_file_type(attachment, head):
    sticker = {}
    raw_sticker = (head or {}).get("x-vichat-sticker")
    if raw_sticker:
        try:
            sticker = jsonlib.loads(raw_sticker) if isinstance(raw_sticker, str) else raw_sticker
        except (TypeError, ValueError):
            sticker = {}
    if isinstance(sticker, dict) and (sticker.get("stickerId") or sticker.get("id")):
        return "sticker"
    if not attachment:
        return "text"
    mime = str(attachment.get("mime") or "").lower()
    name = str(attachment.get("filename") or attachment.get("name") or "").lower()
    if attachment.get("type") == "IM" or mime.startswith("image/") or name.endswith((
        ".avif", ".bmp", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp",
    )):
        return "image"
    if mime.startswith("video/") or name.endswith((".avi", ".mkv", ".mov", ".mp4", ".webm")):
        return "video"
    if mime.startswith("audio/") or name.endswith((".aac", ".flac", ".m4a", ".mp3", ".ogg", ".wav")):
        return "audio"
    if mime.startswith(("text/", "application/pdf")) or name.endswith((
        ".csv", ".doc", ".docx", ".pdf", ".ppt", ".pptx", ".rtf", ".txt", ".xls", ".xlsx",
    )):
        return "document"
    if mime.startswith(("application/zip", "application/x-rar", "application/x-7z", "application/x-tar")) or name.endswith((
        ".7z", ".gz", ".rar", ".tar", ".zip",
    )):
        return "archive"
    return "file"


def _serialize_history_search_message(message, sender_names, viewer_uid=""):
    if not isinstance(message, dict) or message.get("_deleted"):
        return None
    head = message.get("head") if isinstance(message.get("head"), dict) else {}
    sender_id = str(message.get("from") or head.get("x-sender-id") or "").strip()
    try:
        sequence = int(message.get("seq") or 0)
    except (TypeError, ValueError):
        sequence = 0
    if sequence <= 0:
        return None
    content = message.get("content")
    raw_text = _history_message_text(content).lstrip()
    if raw_text.startswith(HISTORY_INTERNAL_MESSAGE_PREFIXES):
        return None
    attachment = _history_message_attachment(content)
    file_type = _history_message_file_type(attachment, head)
    text = _history_message_text(content).strip()
    file_name = str((attachment or {}).get("filename") or (attachment or {}).get("name") or "").strip()
    attachment_url = str(
        (attachment or {}).get("ref")
        or (attachment or {}).get("refurl")
        or (attachment or {}).get("url")
        or ""
    ).strip()
    timestamp = _history_message_datetime(message)
    client_id = str(head.get("x-client-id") or "").strip()
    message_id = client_id[:255] if client_id else "{}-{}".format(sender_id or "system", sequence)
    item = {
        "id": message_id,
        "seq": sequence,
        "senderId": sender_id,
        "senderName": sender_names.get(sender_id) or sender_id or "Thành viên",
        "sender": "outgoing" if sender_id and sender_id == str(viewer_uid) else "incoming",
        "text": text,
        "type": file_type,
        "createdAt": timestamp.isoformat().replace("+00:00", "Z") if timestamp else None,
    }
    if attachment:
        size = attachment.get("size")
        item["file"] = {
            "name": file_name or "Tệp đính kèm",
            "mime": str(attachment.get("mime") or "application/octet-stream"),
            "size": size if isinstance(size, (int, float)) and not isinstance(size, bool) else 0,
            "url": attachment_url,
        }
    return item


def _history_search_matches(item, query, sender_ids, date_from, date_to, file_type):
    if not item:
        return False
    if query:
        haystack = " ".join((
            str(item.get("text") or ""),
            str(item.get("senderName") or ""),
            str((item.get("file") or {}).get("name") or ""),
        )).casefold()
        if query.casefold() not in haystack:
            return False
    if sender_ids and str(item.get("senderId") or "") not in sender_ids:
        return False
    timestamp = _history_search_datetime(item.get("createdAt")) if item.get("createdAt") else None
    if date_from and (timestamp is None or timestamp < date_from):
        return False
    if date_to and (timestamp is None or timestamp > date_to):
        return False
    if file_type != "all":
        actual_type = str(item.get("type") or "text")
        if file_type == "image":
            return actual_type != "image"
        if file_type == "sticker":
            return actual_type != "sticker"
        if file_type == "file":
            return actual_type in ("text", "image", "sticker")
        if actual_type != file_type:
            return False
    return True


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
    recovery_response = await _restore_directory_removed_account(request)
    if recovery_response is not None:
        return recovery_response
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
        if not _account_projection_matches_identity(account, account_identity):
            try:
                tenant, account = _sso_account(account_identity, mark_login=False)
                db.session.commit()
            except AccountSSOError as error:
                db.session.rollback()
                return _account_sso_error(error)
            except Exception as error:
                db.session.rollback()
                logger.exception("Account profile projection refresh failed: %s", error)
                return json({
                    "error_code": "ACCOUNT_PROFILE_SYNC_UNAVAILABLE",
                    "error_message": "Account profile synchronization is temporarily unavailable.",
                }, status=503)
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
        switched_identity = await current_account_session(
            request,
            require_current_tenant=True,
        )
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
                account.tinode_uid = _record_tinode_uid(account, tinode_auth.get("uid"))
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
            account.tinode_uid = _record_tinode_uid(account, tinode_auth.get("uid"))
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
        account.tinode_uid = _record_tinode_uid(account, tinode_auth.get("uid"))
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
        return json({"error_code": "TINODE_AUTH_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        logger.exception("Tinode bridge token exchange failed: %s", error)
        return json({
            "error_code": "TINODE_TOKEN_FAILED",
            "error_message": "Tinode token exchange is temporarily unavailable.",
        }, status=503)


@app.route('/api/v1/internal/direct-message-policy', methods=['POST'])
async def bridge_direct_message_policy(request):
    """Authorize one direct Tinode publish before the relay forwards it."""
    if not _tinode_bridge_request(request):
        return json({
            "error_code": "FORBIDDEN",
            "error_message": "Tinode bridge authentication is required.",
        }, status=403)
    body = request.json if isinstance(request.json, dict) else {}
    sender_uid = str(body.get("sender_uid") or "").strip()
    topic_name = str(body.get("topic") or "").strip()
    if not sender_uid or not topic_name:
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "The Tinode sender and direct topic are required.",
        }, status=400)
    try:
        response = json(_direct_message_policy(sender_uid, topic_name))
        response.headers["Cache-Control"] = "no-store"
        return response
    except Exception:
        logger.exception("Could not evaluate direct message blocking policy")
        return json({
            "error_code": "DIRECT_MESSAGE_POLICY_UNAVAILABLE",
            "error_message": "Direct message policy is temporarily unavailable.",
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
        "chat_media": {
            **chat_media_status(app),
            "upload_endpoint": "/api/v1/chat/media/uploads",
            "legacy_tinode_media_preserved": True,
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
            if error.error_code in ACCOUNT_SESSION_REVOCATION_ERRORS:
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
        if avatar:
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
        tenant, updated_account = _sso_account(
            updated_identity,
            mark_login=False,
            authoritative_avatar=updated_identity.get("avatar"),
        )
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
        if error.error_code in ACCOUNT_SESSION_REVOCATION_ERRORS:
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
    ambiguous_count = 0
    deactivated_count = 0
    released_conflict_count = 0
    tinode_provisioned = 0
    tinode_failed = 0
    visible_account_ids = None
    if employee_account_directory:
        account = _account_by_id(tenant_id, _user_id(current_user))
        if account is None:
            return _auth_error()
        directory_cache_key = (str(tenant_id), str(account.id))
        sync_ttl = max(0, int(app.config.get("ACCOUNT_SSO_DIRECTORY_SYNC_TTL", 10)))
        last_sync = float(_ACCOUNT_DIRECTORY_SYNC_CACHE.get(directory_cache_key) or 0)
        cached_visible_account_ids = _ACCOUNT_DIRECTORY_VISIBLE_CACHE.get(directory_cache_key)
        visible_account_ids = (
            set(cached_visible_account_ids)
            if cached_visible_account_ids is not None
            else None
        )
        had_verified_snapshot = bool(last_sync and visible_account_ids is not None)
        should_sync = (
            not had_verified_snapshot
            or sync_ttl == 0
            or time.time() - last_sync >= sync_ttl
        )
        try:
            validated_identity = None
            if not should_sync:
                # Even a cached response must be bound to the Account tenant
                # that is current at the time it is served.
                validated_identity = await _validated_account_identity(request, account)
            if not should_sync:
                sync_status = "cached"
            else:
                identity = validated_identity
                if identity is None:
                    identity = await _validated_account_identity(request, account)
                directory_snapshot = await account_directory(request, identity)
                ambiguous_count = directory_snapshot.ambiguous_count
                # Recheck after the directory request so a concurrent Account tenant
                # switch cannot project the new tenant's users into the old JWT tenant.
                await _validated_account_identity(request, account)
                snapshot_account_user_ids = {
                    str(item.get("account_user_id") or "").strip()
                    for item in directory_snapshot
                    if str(item.get("account_user_id") or "").strip()
                }
                viewer_account_user_id = str(
                    (account.properties or {}).get("account_user_id") or ""
                ).strip()
                viewer_directory_identity = next(
                    (
                        item for item in directory_snapshot
                        if str(item.get("account_user_id") or "").strip()
                        == viewer_account_user_id
                    ),
                    None,
                )
                if not viewer_account_user_id:
                    raise AccountSSOError(
                        "Account directory rejected the authenticated viewer.",
                        401,
                        "ACCOUNT_DIRECTORY_VIEWER_INVALID",
                    )
                if viewer_directory_identity is None:
                    if directory_snapshot.complete:
                        raise AccountSSOError(
                            "Account directory rejected the authenticated viewer.",
                            401,
                            "ACCOUNT_DIRECTORY_VIEWER_INVALID",
                        )
                if (
                    viewer_directory_identity is not None
                    and not bool(viewer_directory_identity.get("active", True))
                ):
                    raise AccountSSOError(
                        "Account directory rejected the authenticated viewer.",
                        401,
                        "ACCOUNT_DIRECTORY_VIEWER_INVALID",
                    )
                authoritative_snapshot = bool(
                    directory_snapshot.complete
                    and viewer_account_user_id
                    and viewer_account_user_id in snapshot_account_user_ids
                )
                if authoritative_snapshot:
                    # Retire omitted rows before projection so a stale mixed-
                    # tenant username/email cannot block the authoritative row.
                    retired_count, released_conflict_count = (
                        _deactivate_missing_account_projections(
                            tenant_id,
                            directory_snapshot,
                        )
                    )
                    deactivated_count += retired_count
                    if retired_count or released_conflict_count:
                        db.session.flush()
                synced_account_user_ids = set()
                synced_accounts_by_user_id = {}
                visible_account_ids = set()
                tinode_candidates = []
                for directory_identity in directory_snapshot:
                    try:
                        _tenant, synced_account = _sso_account(directory_identity, mark_login=False)
                        synced_account_user_ids.add(
                            str(directory_identity.get("account_user_id") or "").strip()
                        )
                        synced_accounts_by_user_id[
                            str(directory_identity.get("account_user_id") or "").strip()
                        ] = synced_account
                        visible_account_ids.add(str(synced_account.id))
                        tinode_candidates.append(synced_account)
                        synced_count += 1
                        if not synced_account.active:
                            deactivated_count += 1
                    except AccountSSOError as error:
                        if (
                            str(directory_identity.get("account_user_id") or "").strip()
                            == viewer_account_user_id
                        ):
                            raise AccountSSOError(
                                "Account directory could not project the authenticated viewer.",
                                401,
                                "ACCOUNT_DIRECTORY_VIEWER_INVALID",
                            ) from error
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
                if viewer_directory_identity is not None and (
                    viewer_account_user_id not in synced_account_user_ids
                    or not synced_accounts_by_user_id[viewer_account_user_id].active
                ):
                    raise AccountSSOError(
                        "Account directory did not return a usable authenticated viewer.",
                        401,
                        "ACCOUNT_DIRECTORY_VIEWER_INVALID",
                    )
                reconciled = bool(
                    authoritative_snapshot
                    and not skipped_count
                    and synced_account_user_ids == snapshot_account_user_ids
                )
                if (
                    not authoritative_snapshot
                    and had_verified_snapshot
                    and not ambiguous_count
                ):
                    # Keep the last complete safe set for ordinary partial
                    # refreshes. An ambiguity must quarantine the current
                    # claims even if they appeared in an older safe snapshot.
                    visible_account_ids.update(cached_visible_account_ids or [])
                db.session.commit()
                if reconciled:
                    _ACCOUNT_DIRECTORY_SYNC_CACHE[directory_cache_key] = time.time()
                    _ACCOUNT_DIRECTORY_VISIBLE_CACHE[directory_cache_key] = set(
                        visible_account_ids
                    )
                sync_status = "partial" if (
                    tinode_failed
                    or skipped_count
                    or not directory_snapshot.complete
                    or not reconciled
                ) else "fresh"
                _audit(
                    request,
                    "ACCOUNT_DIRECTORY_SYNC",
                    True,
                    tenant_id=tenant_id,
                    user_id=str(account.id),
                    properties={
                        "pages": directory_snapshot.pages,
                        "snapshot_total": directory_snapshot.total,
                        "snapshot_received": directory_snapshot.raw_count,
                        "synced": synced_count,
                        "skipped": skipped_count,
                        "ambiguous": ambiguous_count,
                        "deactivated": deactivated_count,
                        "released_conflicts": released_conflict_count,
                        "tinode_provisioned": tinode_provisioned,
                        "tinode_failed": tinode_failed,
                        "complete": bool(directory_snapshot.complete),
                        "authoritative": authoritative_snapshot,
                        "reconciled": reconciled,
                        "status": sync_status,
                    },
                )
        except AccountSSOError as error:
            db.session.rollback()
            viewer_deactivated = False
            viewer_invalid = error.error_code == "ACCOUNT_DIRECTORY_VIEWER_INVALID"
            if viewer_invalid:
                _clear_account_directory_cache(tenant_id, account.id)
                visible_account_ids = None
                try:
                    persisted_account = ManagementAccount.query.filter(
                        ManagementAccount.id == str(account.id),
                        ManagementAccount.tenant_id == tenant_id,
                    ).first()
                    viewer_deactivated = _deactivate_directory_viewer(persisted_account)
                    db.session.commit()
                except Exception as deactivation_error:
                    db.session.rollback()
                    logger.exception(
                        "Could not persist Account directory viewer revocation %s: %s",
                        account.id,
                        deactivation_error,
                    )
            else:
                visible_account_ids = (
                    set(_ACCOUNT_DIRECTORY_VISIBLE_CACHE.get(directory_cache_key) or [])
                    if had_verified_snapshot
                    else None
                )
            _audit(
                request,
                "ACCOUNT_DIRECTORY_SYNC",
                False,
                tenant_id=tenant_id,
                user_id=str(account.id),
                properties={
                    "error_code": error.error_code,
                    "cached_fallback": bool(had_verified_snapshot and not viewer_invalid),
                    "viewer_deactivated": viewer_deactivated,
                },
            )
            synced_count = 0
            skipped_count = 0
            ambiguous_count = 0
            deactivated_count = 0
            released_conflict_count = 0
            tinode_provisioned = 0
            tinode_failed = 0
            if error.error_code in ACCOUNT_SESSION_REVOCATION_ERRORS:
                revoke_request_token(request)
                revoked_error = AccountSSOError(str(error), 401, error.error_code)
                response = clear_auth_cookie(_account_sso_error(revoked_error), request)
                return clear_account_cookie(response)
            if not had_verified_snapshot:
                return _account_sso_error(error)
            sync_status = "stale"
            logger.warning("Account directory sync failed for tenant %s: %s", tenant_id, error)
        except Exception as error:
            db.session.rollback()
            visible_account_ids = (
                set(_ACCOUNT_DIRECTORY_VISIBLE_CACHE.get(directory_cache_key) or [])
                if had_verified_snapshot
                else None
            )
            _audit(
                request,
                "ACCOUNT_DIRECTORY_SYNC",
                False,
                tenant_id=tenant_id,
                user_id=str(account.id),
                properties={
                    "error_code": "ACCOUNT_DIRECTORY_UNAVAILABLE",
                    "cached_fallback": bool(had_verified_snapshot),
                },
            )
            synced_count = 0
            skipped_count = 0
            ambiguous_count = 0
            deactivated_count = 0
            released_conflict_count = 0
            tinode_provisioned = 0
            tinode_failed = 0
            sync_status = "stale"
            logger.exception("Account directory sync failed for tenant %s: %s", tenant_id, error)
            if not had_verified_snapshot:
                return json({
                    "error_code": "ACCOUNT_DIRECTORY_UNAVAILABLE",
                    "error_message": "The company directory is temporarily unavailable.",
                }, status=503)
    exclude_user_id = str(request.args.get("exclude_user_id") or "")
    include_inactive = _is_admin(current_user) and str(
        request.args.get("include_inactive") or ""
    ).lower() in ("1", "true", "yes")
    query = ManagementAccount.query.filter(ManagementAccount.tenant_id == tenant_id)
    if employee_account_directory:
        query = query.filter(ManagementAccount.properties.contains({"auth_source": "account"}))
        if visible_account_ids is not None:
            query = query.filter(ManagementAccount.id.in_(visible_account_ids))
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
    response = json({
        "objects": [
            _public_account(account)
            for account in accounts
        ],
        "directory_sync": {
            "source": "account" if employee_account_directory else "local",
            "status": sync_status,
            "synced": synced_count,
            "skipped": skipped_count,
            "ambiguous": ambiguous_count,
            "deactivated": deactivated_count,
            "released_conflicts": released_conflict_count,
            "tinode_provisioned": tinode_provisioned,
            "tinode_failed": tinode_failed,
        },
    })
    # Directory results vary by the authenticated tenant; never let a browser
    # or intermediary reuse one company's response for another company.
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    return response


def _maintenance_public_response(state=None):
    response = json({
        "maintenance": normalize_maintenance_state(state),
    })
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    return response


@app.route('/api/v1/chat/maintenance', methods=['GET'])
async def chat_maintenance_status(request):
    """Expose only the non-sensitive global ChatUI maintenance state."""
    return _maintenance_public_response(read_maintenance_state())


@app.route('/api/v1/chat/maintenance/stream', methods=['GET'])
async def chat_maintenance_stream(request):
    """Stream maintenance changes without coupling the gate to Tinode."""
    async def streaming_fn(response):
        loop = asyncio.get_event_loop()
        pubsub = None
        try:
            if database.redisdb is not None:
                pubsub = await loop.run_in_executor(
                    None,
                    functools.partial(database.redisdb.pubsub),
                )
                await loop.run_in_executor(
                    None,
                    functools.partial(pubsub.subscribe, MAINTENANCE_CHANNEL),
                )

            current = await loop.run_in_executor(None, read_maintenance_state)
            last_state = normalize_maintenance_state(current)
            await response.write(maintenance_sse_chunk(last_state))
            last_poll_at = loop.time()
            last_ping_at = loop.time()

            while True:
                message = None
                if pubsub is not None:
                    message = await loop.run_in_executor(
                        None,
                        functools.partial(
                            pubsub.get_message,
                            ignore_subscribe_messages=True,
                            timeout=1,
                        ),
                    )
                else:
                    await asyncio.sleep(1)

                if message and message.get("data"):
                    next_state = normalize_maintenance_state(message.get("data"))
                    if next_state != last_state:
                        last_state = next_state
                        await response.write(maintenance_sse_chunk(last_state))

                # Redis Pub/Sub delivers the fast path. This small persisted
                # state poll also recovers a missed publish without touching
                # session, Tinode or conversation state.
                if loop.time() - last_poll_at >= 3:
                    next_state = await loop.run_in_executor(None, read_maintenance_state)
                    next_state = normalize_maintenance_state(next_state)
                    if next_state != last_state:
                        last_state = next_state
                        await response.write(maintenance_sse_chunk(last_state))
                    last_poll_at = loop.time()

                if loop.time() - last_ping_at >= 15:
                    await response.write(": keep-alive\n\n")
                    last_ping_at = loop.time()
        except Exception:
            # A closed browser connection is normal for EventSource. The
            # finally block releases the Redis subscription below.
            return
        finally:
            if pubsub is not None:
                try:
                    await loop.run_in_executor(None, pubsub.close)
                except Exception:
                    pass

    response = stream(
        streaming_fn,
        content_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
    return response


@app.route('/api/v1/admin/chat-ui-maintenance', methods=['GET', 'PUT'])
async def management_chat_ui_maintenance(request):
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
    if request.method == "GET":
        return _maintenance_public_response(read_maintenance_state())

    body = request.json or {}
    enabled = parse_enabled(body.get("enabled"))
    if enabled is None:
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "The enabled maintenance flag must be boolean.",
        }, status=400)
    try:
        state = write_maintenance_state(enabled)
        _audit(
            request,
            "CHAT_UI_MAINTENANCE_ON" if enabled else "CHAT_UI_MAINTENANCE_OFF",
            tenant_id=tenant_id,
            user_id=_user_id(current_user),
            properties={"enabled": bool(enabled)},
        )
        return _maintenance_public_response(state)
    except Exception as error:
        logger.exception("Could not update ChatUI maintenance state: %s", error)
        _audit(
            request,
            "CHAT_UI_MAINTENANCE_ON" if enabled else "CHAT_UI_MAINTENANCE_OFF",
            False,
            tenant_id=tenant_id,
            user_id=_user_id(current_user),
            properties={"enabled": bool(enabled)},
        )
        return json({
            "error_code": "CHAT_UI_MAINTENANCE_UNAVAILABLE",
            "error_message": "The ChatUI maintenance control is temporarily unavailable.",
        }, status=503)


def _presence_request_body(request):
    body = request.json or {}
    return body if isinstance(body, dict) else {}


def _presence_session_id(current_user, body):
    browser_session_id = str(
        body.get("session_id") or body.get("sessionId") or ""
    ).strip()
    jwt_session_id = str((current_user or {}).get("jti") or "").strip()
    if (
        not browser_session_id
        or len(browser_session_id) > 128
        or not jwt_session_id
        or len(jwt_session_id) > 128
    ):
        return ""
    sequence = body.get("sequence")
    if sequence is not None and (
        type(sequence) is not int or not 0 < sequence <= 9007199254740991
    ):
        return ""
    # Keep tabs independent while binding a lease to the authenticated JWT.
    return "{}.{}".format(jwt_session_id, browser_session_id)


def _presence_account_ids(body):
    raw_ids = body.get("account_ids")
    if raw_ids is None:
        raw_ids = body.get("accountIds")
    if not isinstance(raw_ids, list):
        return []
    seen = set()
    account_ids = []
    for raw_id in raw_ids[:1000]:
        account_id = str(raw_id or "").strip()
        if not account_id or len(account_id) > 128 or account_id in seen:
            continue
        seen.add(account_id)
        account_ids.append(account_id)
    return account_ids


def _tenant_presence_ids(tenant_id, requested_ids):
    if not requested_ids:
        return []
    accounts = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == tenant_id,
        ManagementAccount.id.in_(requested_ids),
        ManagementAccount.active.is_(True),
    ).all()
    return [str(account.id) for account in accounts]


def _presence_unavailable_error():
    return json({
        "error_code": "PRESENCE_UNAVAILABLE",
        "error_message": "Realtime presence is temporarily unavailable.",
    }, status=503)


def _chat_session_required_for_presence(request):
    if not management_session_requested(request):
        return None
    return json({
        "error_code": "CHAT_SESSION_REQUIRED",
        "error_message": "Presence can only be updated from a Chat user session.",
    }, status=403)


@app.route('/api/v1/chat/presence/heartbeat', methods=['POST'])
async def chat_presence_heartbeat(request):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    session_error = _chat_session_required_for_presence(request)
    if session_error is not None:
        return session_error
    body = _presence_request_body(request)
    session_id = _presence_session_id(current_user, body)
    if not session_id:
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "A browser presence session is required.",
        }, status=400)
    account_id = _user_id(current_user)
    if not mark_online(tenant_id, account_id, session_id, sequence=body.get("sequence")):
        return _presence_unavailable_error()
    requested_ids = _tenant_presence_ids(tenant_id, _presence_account_ids(body))
    snapshot = presence_snapshot(tenant_id, requested_ids)
    if snapshot is None:
        return _presence_unavailable_error()
    return json({
        "presence": snapshot["presence"],
        "last_seen_at": snapshot["last_seen"],
        "lastSeenAt": snapshot["last_seen"],
        "online": True,
        "expires_in": presence_ttl(),
    })


@app.route('/api/v1/chat/presence/batch', methods=['POST'])
async def chat_presence_batch(request):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    session_error = _chat_session_required_for_presence(request)
    if session_error is not None:
        return session_error
    requested_ids = _tenant_presence_ids(tenant_id, _presence_account_ids(_presence_request_body(request)))
    snapshot = presence_snapshot(tenant_id, requested_ids)
    if snapshot is None:
        return _presence_unavailable_error()
    return json({
        "presence": snapshot["presence"],
        "last_seen_at": snapshot["last_seen"],
        "lastSeenAt": snapshot["last_seen"],
        "expires_in": presence_ttl(),
    })


@app.route('/api/v1/chat/presence/offline', methods=['POST'])
async def chat_presence_offline(request):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    session_error = _chat_session_required_for_presence(request)
    if session_error is not None:
        return session_error
    body = _presence_request_body(request)
    session_id = _presence_session_id(current_user, body)
    if not session_id:
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "A browser presence session is required.",
        }, status=400)
    if not mark_offline(tenant_id, _user_id(current_user), session_id, sequence=body.get("sequence")):
        return _presence_unavailable_error()
    return json({"offline": True})


@app.route('/api/v1/conversation/<conversation_id>/nicknames/<target_id>', methods=['PUT'])
@app.route('/api/v1/chat/threads/<conversation_id>/nicknames/<target_id>', methods=['PUT'])
async def conversation_nickname_update(request, conversation_id, target_id):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    if management_session_requested(request):
        return json({
            "error_code": "CHAT_SESSION_REQUIRED",
            "error_message": "Conversation nicknames can only be changed from a Chat user session.",
        }, status=403)
    try:
        conversation_uuid = uuid.UUID(str(conversation_id))
    except (ValueError, TypeError, AttributeError):
        return json({"error_code": "NOT_FOUND", "error_message": "Invalid conversation."}, status=404)

    viewer_id = _user_id(current_user)
    target_id = str(target_id or "").strip()
    if not target_id:
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "A conversation nickname target is required.",
        }, status=400)

    item, membership = _conversation_and_membership(tenant_id, conversation_uuid, viewer_id)
    if item is None or membership is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)
    target = _account_by_id(tenant_id, target_id)
    if target is None:
        return json({
            "error_code": "NOT_FOUND",
            "error_message": "Member not found in this tenant.",
        }, status=404)

    body = request.json or {}
    if not isinstance(body, dict) or not isinstance(body.get("nickname"), str):
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "The nickname must be text.",
        }, status=400)
    nickname = body["nickname"].strip()
    if len(nickname) > CONVERSATION_NICKNAME_MAX_LENGTH:
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "The nickname is too long.",
        }, status=400)

    is_group = bool((item.properties or {}).get("is_group"))
    # Serialize concurrent edits to the same JSON metadata document so one tab
    # cannot silently discard a nickname saved by another tab.
    locked_item = Conversation.query.filter(
        Conversation.id == conversation_uuid,
        Conversation.tenant_id == tenant_id,
        Conversation.deleted.is_(False),
    ).with_for_update().first()
    if locked_item is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)
    item = locked_item
    membership = ConversationParticipant.query.filter(
        ConversationParticipant.tenant_id == tenant_id,
        ConversationParticipant.conversation_id == item.id,
        ConversationParticipant.participant_id == viewer_id,
        ConversationParticipant.deleted.is_(False),
        ConversationParticipant.approval_status == "APPROVED",
        ConversationParticipant.active.is_(True),
    ).with_for_update().first()
    target_membership = ConversationParticipant.query.filter(
        ConversationParticipant.tenant_id == tenant_id,
        ConversationParticipant.conversation_id == item.id,
        ConversationParticipant.participant_id == target_id,
        ConversationParticipant.deleted.is_(False),
        ConversationParticipant.approval_status == "APPROVED",
        ConversationParticipant.active.is_(True),
    ).with_for_update().first()
    if membership is None or target_membership is None:
        return json({
            "error_code": "NOT_FOUND",
            "error_message": "Conversation member is no longer active.",
        }, status=404)
    actor_account = _account_by_id(tenant_id, viewer_id)
    if actor_account is None:
        return _auth_error()
    properties = dict(item.properties or {})
    all_nicknames = _conversation_nicknames(item)
    previous_nickname = str(all_nicknames.get(target_id) or "").strip()
    if nickname:
        if target_id not in all_nicknames and len(all_nicknames) >= CONVERSATION_NICKNAME_MAX_COUNT:
            return json({
                "error_code": "PARAM_ERROR",
                "error_message": "Too many conversation nicknames are stored for this conversation.",
            }, status=400)
        all_nicknames[target_id] = nickname
    else:
        all_nicknames.pop(target_id, None)
    if all_nicknames:
        properties[CONVERSATION_NICKNAMES_PROPERTY] = all_nicknames
    else:
        properties.pop(CONVERSATION_NICKNAMES_PROPERTY, None)
    item.properties = properties
    item.updated_at = int(time.time())
    db.session.commit()
    nickname_changed = previous_nickname != nickname
    _audit(
        request,
        "CONVERSATION_NICKNAME_UPDATED",
        True,
        tenant_id=tenant_id,
        user_id=viewer_id,
        properties={
            "conversation_id": str(conversation_uuid),
            "target_id": target_id,
            "cleared": not bool(nickname),
            "group": is_group,
        },
    )
    if nickname_changed:
        actor_uid = str(actor_account.tinode_uid or "").strip() or viewer_id
        target_uid = str(target.tinode_uid or "").strip() or target_id
        nickname_event = {
            "action": "conversation_nickname_changed",
            "actorId": actor_uid,
            "actorAccountId": viewer_id,
            "actorName": _account_default_name(actor_account),
            "targetId": target_uid,
            "targetAccountId": target_id,
            "targetName": _account_default_name(target),
            "previousNickname": previous_nickname,
            "newNickname": nickname,
            "cleared": not bool(nickname),
            "isGroup": is_group,
            "targets": [{
                "id": target_uid,
                "uid": target_uid,
                "tinodeUid": target_uid,
                "accountId": target_id,
                "name": _account_default_name(target),
            }],
        }
        if is_group:
            await _publish_group_activity_events(item, [nickname_event])
        else:
            await _publish_direct_activity_events(item, [nickname_event], actor_account=actor_account)
    return json(_serialize_conversation(item, viewer_id))


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
        ConversationParticipant.approval_status == "APPROVED",
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


@app.route('/api/v1/conversation/direct-block-state', methods=['GET'])
@app.route('/api/v1/chat/threads/direct-block-state', methods=['GET'])
async def conversation_direct_block_state(request):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    if management_session_requested(request):
        return json({
            "error_code": "CHAT_SESSION_REQUIRED",
            "error_message": "Direct message blocking is only available from a Chat user session.",
        }, status=403)
    user_id = _user_id(current_user)
    items = Conversation.query.join(
        ConversationParticipant,
        ConversationParticipant.conversation_id == Conversation.id,
    ).filter(
        Conversation.tenant_id == tenant_id,
        Conversation.deleted.is_(False),
        ConversationParticipant.tenant_id == tenant_id,
        ConversationParticipant.participant_id == user_id,
        ConversationParticipant.active.is_(True),
        ConversationParticipant.approval_status == "APPROVED",
        ConversationParticipant.deleted.is_(False),
    ).all()
    direct_items = [
        item for item in items if not bool((item.properties or {}).get("is_group"))
    ]
    if not direct_items:
        response = json({"objects": []})
        response.headers["Cache-Control"] = "no-store"
        return response
    item_ids = [item.id for item in direct_items]
    participant_rows = ConversationParticipant.query.filter(
        ConversationParticipant.tenant_id == tenant_id,
        ConversationParticipant.conversation_id.in_(item_ids),
        ConversationParticipant.approval_status == "APPROVED",
        ConversationParticipant.deleted.is_(False),
    ).order_by(ConversationParticipant.created_at.asc()).all()
    participants_by_conversation = {}
    for participant in participant_rows:
        participants_by_conversation.setdefault(participant.conversation_id, []).append(participant)
    response = json({
        "objects": [
            _direct_block_payload(
                item,
                user_id,
                participants_by_conversation.get(item.id, []),
            )
            for item in direct_items
        ],
    })
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route('/api/v1/conversation/<conversation_id>/block', methods=['PUT'])
@app.route('/api/v1/chat/threads/<conversation_id>/block', methods=['PUT'])
async def conversation_direct_block(request, conversation_id):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    if management_session_requested(request):
        return json({
            "error_code": "CHAT_SESSION_REQUIRED",
            "error_message": "Direct message blocking is only available from a Chat user session.",
        }, status=403)
    try:
        conversation_uuid = uuid.UUID(str(conversation_id))
    except (ValueError, TypeError, AttributeError):
        return json({"error_code": "NOT_FOUND", "error_message": "Invalid conversation."}, status=404)

    user_id = _user_id(current_user)
    item, membership = _conversation_and_membership(tenant_id, conversation_uuid, user_id)
    if item is None or membership is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)
    participants = _valid_direct_block_participants(item, user_id)
    if participants is None:
        return json({
            "error_code": "DIRECT_BLOCK_ONLY",
            "error_message": "Only one-to-one conversations can block messages.",
        }, status=409)

    body = request.json if isinstance(request.json, dict) else {}
    blocked = body.get("blocked")
    if not isinstance(blocked, bool):
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "The blocked state must be boolean.",
        }, status=400)

    now = int(time.time())
    _ensure_direct_key(item, participants)
    membership.blocked_at = now if blocked else None
    membership.updated_at = now
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


@app.route('/api/v1/conversation/<conversation_id>/group-settings', methods=['PUT'])
@app.route('/api/v1/chat/threads/<conversation_id>/group-settings', methods=['PUT'])
async def conversation_group_settings(request, conversation_id):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    if management_session_requested(request):
        return json({
            "error_code": "CHAT_SESSION_REQUIRED",
            "error_message": "Group settings can only be changed from a Chat user session.",
        }, status=403)
    try:
        conversation_uuid = uuid.UUID(str(conversation_id))
    except (ValueError, TypeError, AttributeError):
        return json({"error_code": "NOT_FOUND", "error_message": "Invalid conversation."}, status=404)

    user_id = _user_id(current_user)
    item, membership = _conversation_and_membership(tenant_id, conversation_uuid, user_id)
    if item is None or membership is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)
    if not bool((item.properties or {}).get("is_group")):
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "Group settings can only be changed for a group.",
        }, status=400)
    is_group_manager = _is_group_manager(membership)
    existing_properties = item.properties or {}
    previous_name = str(item.subject or "")
    previous_avatar = _conversation_avatar(existing_properties)
    existing_settings = _normalized_group_settings(
        existing_properties.get("groupSettings") or existing_properties.get("group_settings")
    )
    body = request.json or {}
    if not is_group_manager and (
        not isinstance(body, dict)
        or "settings" in body
        or not existing_settings["allowMembersEditInfo"]
    ):
        return _group_info_permission_error()

    if not isinstance(body, dict) or not any(key in body for key in ("name", "avatar", "settings", "background")):
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "At least one group setting is required.",
        }, status=400)

    next_name = None
    if "name" in body:
        if not isinstance(body.get("name"), str):
            return json({"error_code": "PARAM_ERROR", "error_message": "The group name must be text."}, status=400)
        next_name = body["name"].strip()
        if not next_name or len(next_name) > 120:
            return json({"error_code": "PARAM_ERROR", "error_message": "The group name must be between 1 and 120 characters."}, status=400)

    next_avatar = None
    if "avatar" in body:
        if not isinstance(body.get("avatar"), str):
            return json({"error_code": "PARAM_ERROR", "error_message": "The group avatar must be text."}, status=400)
        next_avatar = body["avatar"].strip()
        if len(next_avatar) > 8192:
            return json({"error_code": "PARAM_ERROR", "error_message": "The group avatar reference is too long."}, status=400)

    next_settings = None
    changed_settings = []
    if "settings" in body:
        requested_settings = body.get("settings")
        if not isinstance(requested_settings, dict):
            return json({"error_code": "PARAM_ERROR", "error_message": "Group settings must be an object."}, status=400)
        unknown_keys = sorted(set(requested_settings) - GROUP_SETTING_KEYS)
        if unknown_keys:
            return json({"error_code": "PARAM_ERROR", "error_message": "Unknown group setting."}, status=400)
        invalid_keys = sorted(
            key for key, value in requested_settings.items()
            if not isinstance(value, bool)
        )
        if invalid_keys:
            return json({"error_code": "PARAM_ERROR", "error_message": "Group settings must be boolean."}, status=400)
        next_settings = _normalized_group_settings(
            existing_properties.get("groupSettings") or existing_properties.get("group_settings")
        )
        next_settings.update(requested_settings)
        changed_settings = [
            {
                "key": key,
                "enabled": next_settings[key],
            }
            for key in GROUP_SETTING_DEFAULTS
            if next_settings[key] != existing_settings[key]
        ]

    background_requested = "background" in body
    next_background = None
    if background_requested:
        requested_background = body.get("background")
        if requested_background is not None and not isinstance(requested_background, dict):
            return json({
                "error_code": "PARAM_ERROR",
                "error_message": "The group background must be an object or null.",
            }, status=400)
        try:
            next_background = _normalized_group_background(
                requested_background,
                updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
            )
        except ValueError as error:
            return json({"error_code": "PARAM_ERROR", "error_message": str(error)}, status=400)
        if requested_background is not None and next_background is None:
            return json({
                "error_code": "PARAM_ERROR",
                "error_message": "The group background must include a URL.",
            }, status=400)
    previous_background = _conversation_background(existing_properties)

    properties = dict(item.properties or {})
    if next_name is not None:
        item.subject = next_name
    # Empty avatar payloads commonly come from stale realtime snapshots. They
    # must not erase the authoritative Chatmgt value; replacement requires a
    # non-empty avatar reference.
    if next_avatar:
        properties["avatar"] = next_avatar
        properties["group_avatar"] = next_avatar
        for legacy_key in ("avatar_url", "avatarUrl"):
            properties.pop(legacy_key, None)
    if next_settings is not None:
        properties["groupSettings"] = next_settings
    if background_requested:
        if next_background is None:
            # Keep an explicit null marker so an older Tinode public snapshot
            # cannot restore a background after the user clears it.
            properties["conversationBackground"] = None
            properties.pop("conversation_background", None)
        else:
            properties["conversationBackground"] = next_background
            properties.pop("conversation_background", None)
    item.properties = properties
    item.updated_at = int(time.time())
    db.session.commit()
    actor_account = _account_by_id(tenant_id, user_id)
    actor_name = (
        actor_account.full_name
        or actor_account.username
        or user_id
    ) if actor_account is not None else user_id
    actor_uid = str(actor_account.tinode_uid or "").strip() if actor_account is not None else ""
    activity_events = []
    if next_name is not None and next_name != previous_name:
        activity_events.append({
            "action": "group_name_changed",
            "actorId": actor_uid or user_id,
            "actorAccountId": user_id,
            "actorName": actor_name,
            "previousName": previous_name,
            "newName": next_name,
        })
    if next_avatar and next_avatar != previous_avatar:
        activity_events.append({
            "action": "group_avatar_changed",
            "actorId": actor_uid or user_id,
            "actorAccountId": user_id,
            "actorName": actor_name,
            "previousAvatarUrl": previous_avatar,
            "avatarUrl": next_avatar,
        })
    if changed_settings:
        activity_events.append({
            "action": "group_settings_changed",
            "actorId": actor_uid or user_id,
            "actorAccountId": user_id,
            "actorName": actor_name,
            "changes": changed_settings,
            "groupSettings": next_settings,
        })
    if background_requested and not _same_group_background(previous_background, next_background):
        activity_events.append({
            "action": "conversation_background_changed",
            "scope": "shared",
            "isGroup": True,
            "actorId": actor_uid or user_id,
            "actorAccountId": user_id,
            "actorName": actor_name,
            "backgroundId": next_background.get("id", "") if next_background else "",
            "backgroundUrl": next_background.get("url", "") if next_background else "",
            "backgroundLabel": next_background.get("label", "") if next_background else "",
            "backgroundKind": next_background.get("kind", "") if next_background else "",
            "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        })
    await _publish_group_activity_events(item, activity_events)
    return json(_serialize_conversation(item, user_id))


@app.route('/api/v1/conversation/<conversation_id>/dissolve', methods=['POST'])
@app.route('/api/v1/chat/threads/<conversation_id>/dissolve', methods=['POST'])
async def conversation_dissolve(request, conversation_id):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    if management_session_requested(request):
        return json({
            "error_code": "CHAT_SESSION_REQUIRED",
            "error_message": "Groups can only be dissolved from a Chat user session.",
        }, status=403)
    try:
        conversation_uuid = uuid.UUID(str(conversation_id))
    except (ValueError, TypeError, AttributeError):
        return json({"error_code": "NOT_FOUND", "error_message": "Invalid conversation."}, status=404)

    user_id = _user_id(current_user)
    item, membership = _conversation_and_membership(tenant_id, conversation_uuid, user_id)
    if item is None or membership is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)
    if not bool((item.properties or {}).get("is_group")):
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "Only groups can be dissolved.",
        }, status=400)
    if not _is_group_owner(membership):
        return json({
            "error_code": "OWNER_REQUIRED",
            "error_message": "Only the group owner can dissolve this group.",
        }, status=403)

    now = int(time.time())
    tinode_token = ""
    owner_uid = ""
    try:
        participants, accounts_by_id = _active_conversation_accounts(item)
        owner_participant = next(
            (participant for participant in participants if _is_group_owner(participant)),
            None,
        )
        owner_account = accounts_by_id.get(owner_participant.participant_id) if owner_participant else None
        if owner_account is None or owner_participant.participant_id != user_id:
            return json({
                "error_code": "OWNER_REQUIRED",
                "error_message": "Only the group owner can dissolve this group.",
            }, status=403)
        if current_user.get("auth_method") == "account_sso":
            await _validated_account_identity(request, owner_account)

        if item.tinode_topic:
            prepared_uids = await _ensure_tinode_accounts(accounts_by_id.values())
            member_tokens = await _tinode_tokens_for_accounts(
                accounts_by_id,
                list(accounts_by_id),
                prepared_uids,
            )
            owner_uid = prepared_uids[owner_participant.participant_id]
            tinode_token = member_tokens[owner_uid]
            if not owner_uid or not tinode_token:
                raise AuthError("Tinode could not authenticate the group owner.", 502)
            expected_tinode_uids = [
                prepared_uids[participant.participant_id]
                for participant in participants
                if participant.participant_id in accounts_by_id
            ]
            chatbot_uid = str((item.properties or {}).get("chatbot_tinode_uid") or "").strip()
            if chatbot_uid:
                expected_tinode_uids.append(chatbot_uid)
            actual_tinode_uids = await tinode_topic_member_uids(
                tinode_token,
                owner_uid,
                item.tinode_topic,
            )
            tinode_uids = list(dict.fromkeys([
                *actual_tinode_uids,
                *expected_tinode_uids,
            ]))
            await tinode_publish_system_event(
                tinode_token,
                owner_uid,
                item.tinode_topic,
                {
                    "action": "group_dissolved",
                    "actorId": owner_uid or user_id,
                    "actorName": owner_account.full_name or owner_account.username or user_id,
                    "groupName": item.subject or "",
                },
            )
            await tinode_dissolve_topic(
                tinode_token,
                owner_uid,
                item.tinode_topic,
                tinode_uids,
            )

        for participant in participants:
            participant.active = False
            participant.left_at = now
            participant.deleted = True
        item.status = "CLOSED"
        item.closed_at = now
        item.updated_at = now
        item.deleted = True
        db.session.commit()
        _audit(
            request,
            "CONVERSATION_GROUP_DISSOLVE",
            True,
            tenant_id=tenant_id,
            user_id=user_id,
            properties={"conversation_id": str(item.id)},
        )
        return json({
            "dissolved": True,
            "conversation_id": str(item.id),
            "group_name": item.subject or "",
        })
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
        return json({"error_code": "TINODE_DISSOLVE_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        logger.exception("Could not dissolve Chatmgt/Tinode group: %s", error)
        return json({
            "error_code": "CONVERSATION_DISSOLVE_ERROR",
            "error_message": "Could not dissolve the group.",
        }, status=503)


@app.route('/api/v1/conversation/<conversation_id>/search', methods=['POST'])
@app.route('/api/v1/chat/threads/<conversation_id>/search', methods=['POST'])
async def conversation_history_search(request, conversation_id):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    if management_session_requested(request):
        return json({
            "error_code": "CHAT_SESSION_REQUIRED",
            "error_message": "Conversation history search requires a Chat user session.",
        }, status=403)
    try:
        conversation_uuid = uuid.UUID(str(conversation_id))
    except (ValueError, TypeError, AttributeError):
        return json({"error_code": "NOT_FOUND", "error_message": "Invalid conversation."}, status=404)

    user_id = _user_id(current_user)
    item, membership = _conversation_and_membership(
        tenant_id,
        conversation_uuid,
        user_id,
        allow_legacy_direct=True,
    )
    if item is None or membership is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)

    body = request.json or {}
    if not isinstance(body, dict):
        return json({"error_code": "PARAM_ERROR", "error_message": "Search filters must be an object."}, status=400)
    query = str(body.get("query") or "").strip()[:200]
    sender_filter = str(body.get("sender_id") or body.get("senderId") or "").strip()
    file_type = str(body.get("type") or body.get("message_type") or "all").strip().lower()
    if file_type not in HISTORY_SEARCH_TYPES:
        return json({"error_code": "PARAM_ERROR", "error_message": "The history file type is invalid."}, status=400)
    try:
        date_from = _history_search_datetime(body.get("from_date") or body.get("fromDate"))
        date_to = _history_search_datetime(
            body.get("to_date") or body.get("toDate"),
            end_of_day=True,
        )
        if date_from and date_to and date_from > date_to:
            return json({"error_code": "PARAM_ERROR", "error_message": "The history date range is invalid."}, status=400)
        limit = min(200, max(1, int(body.get("limit") or 100)))
    except (TypeError, ValueError, OverflowError):
        return json({"error_code": "PARAM_ERROR", "error_message": "The history search limit is invalid."}, status=400)

    tinode_token = str(body.get("tinode_token") or "").strip()
    if not tinode_token:
        return json({
            "error_code": "TINODE_TOKEN_REQUIRED",
            "error_message": "Tinode authentication is required for history search.",
        }, status=400)

    account = _account_by_id(tenant_id, user_id)
    if account is None:
        return _auth_error()

    try:
        if current_user.get("auth_method") == "account_sso":
            await _validated_account_identity(request, account)

        is_group = bool((item.properties or {}).get("is_group"))
        if not is_group:
            _restore_legacy_direct_memberships(item)
        participants, accounts_by_id = _active_conversation_accounts(item)
        participant_ids = [participant.participant_id for participant in participants]
        tinode_uids = {
            participant_id: str(accounts_by_id[participant_id].tinode_uid or "")
            for participant_id in participant_ids
            if participant_id in accounts_by_id
        }
        topic_name = item.tinode_topic if is_group else direct_peer_tinode_uid(
            user_id,
            participant_ids,
            tinode_uids,
        )
        if not topic_name or not valid_tinode_topic(topic_name, is_group):
            return json({
                "error_code": "TINODE_TOPIC_REQUIRED",
                "error_message": "The conversation is not ready for history search.",
            }, status=409)
        expected_uid = str(account.tinode_uid or "").strip()
        if not expected_uid:
            return json({
                "error_code": "TINODE_UID_REQUIRED",
                "error_message": "The employee Tinode identity is not ready.",
            }, status=409)

        sender_ids = set()
        sender_names = {}
        for participant_id, participant_account in accounts_by_id.items():
            uid = str(participant_account.tinode_uid or "").strip()
            if not uid:
                continue
            sender_names[uid] = _account_display_name(participant_account, account)[0] or uid
            if sender_filter and sender_filter in {
                str(participant_id),
                uid,
                str(participant_account.tinode_username or ""),
                str(participant_account.username or ""),
            }:
                sender_ids.add(uid)
        if sender_filter and not sender_ids:
            return json({
                "objects": [],
                "items": [],
                "total": 0,
                "scanned": 0,
                "has_more": False,
                "next_cursor": None,
            })

        cursor = body.get("cursor")
        history = await tinode_history_window(
            tinode_token,
            expected_uid,
            topic_name,
            before=cursor,
            page_limit=HISTORY_SEARCH_PAGE_LIMIT,
            max_messages=HISTORY_SEARCH_MAX_MESSAGES,
        )
        matched = []
        for raw_message in history.get("messages") or []:
            result = _serialize_history_search_message(raw_message, sender_names, expected_uid)
            if _history_search_matches(result, query, sender_ids, date_from, date_to, file_type):
                matched.append(result)
        matched.sort(key=lambda value: (int(value.get("seq") or 0), str(value.get("createdAt") or "")), reverse=True)
        matched = matched[:limit]
        response = json({
            "objects": matched,
            "items": matched,
            "total": len(matched),
            "scanned": len(history.get("messages") or []),
            "has_more": bool(history.get("has_more")),
            "next_cursor": history.get("next_cursor"),
            "conversation_id": str(item.id),
        })
        response.headers["Cache-Control"] = "no-store"
        return response
    except AccountSSOError as error:
        return _account_sso_error(error)
    except AuthError as error:
        status_code = error.status_code
        error_code = "TINODE_SEARCH_AUTH_FAILED" if status_code == 401 else "TINODE_SEARCH_FAILED"
        return json({"error_code": error_code, "error_message": str(error)}, status=status_code)
    except Exception:
        logger.exception("Tinode conversation history search failed")
        return json({
            "error_code": "TINODE_SEARCH_FAILED",
            "error_message": "Conversation history search is temporarily unavailable.",
        }, status=503)


@app.route('/api/v1/conversation', methods=['POST'])
@app.route('/api/v1/chat/threads', methods=['POST'])
async def conversation_create(request):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    body = request.json or {}
    owner_id = _user_id(current_user)
    requested_ids = [str(value) for value in (body.get("participant_ids") or []) if value]
    requested_ids = list(dict.fromkeys(requested_ids))
    requested_group_ids = [participant_id for participant_id in requested_ids if participant_id != owner_id]
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
    if is_group and not requested_group_ids:
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "A group must include at least one participant besides its owner.",
        }, status=400)
    direct_key = ":".join(sorted(participant_ids)) if not is_group and len(participant_ids) == 2 else ""
    properties = {
        "is_group": is_group,
        "description": str(requested_properties.get("description") or "")[:2000],
        "avatar": str(requested_properties.get("avatar") or "")[:8192],
    }
    if is_group:
        properties["group_avatar"] = properties["avatar"]
        properties["groupSettings"] = _normalized_group_settings(
            requested_properties.get("groupSettings") or requested_properties.get("group_settings")
        )
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
                        approval_status="APPROVED",
                    )
                    db.session.add(membership)
                else:
                    membership.active = True
                    membership.left_at = None
                    membership.approval_status = "APPROVED"
            _clear_direct_deleted_marker(existing, owner_id)
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
                approval_status="APPROVED",
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
    item, membership = _conversation_and_membership(
        tenant_id,
        conversation_uuid,
        user_id,
        allow_legacy_direct=True,
    )
    if item is None or membership is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)
    account = _account_by_id(tenant_id, user_id)
    if account is None:
        return _auth_error()
    try:
        if current_user.get("auth_method") == "account_sso":
            await _validated_account_identity(request, account)
        _restore_legacy_direct_memberships(item)
        if not bool((item.properties or {}).get("is_group")):
            _clear_direct_deleted_marker(item, user_id)
        _participants, accounts_by_id = _active_conversation_accounts(item)
        prepared_uids = await _ensure_tinode_accounts(accounts_by_id.values())
        await _tinode_tokens_for_accounts(
            accounts_by_id,
            list(accounts_by_id),
            prepared_uids,
        )
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
    item, membership = _conversation_and_membership(
        tenant_id,
        conversation_uuid,
        user_id,
        allow_legacy_direct=True,
    )
    if item is None or membership is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)
    is_group = bool((item.properties or {}).get("is_group"))
    if is_group:
        # Opening a new group from two browser tabs can reach this endpoint at
        # the same time. Serialize the bind so the second request observes the
        # canonical topic committed by the first one.
        locked_item = Conversation.query.filter(
            Conversation.id == conversation_uuid,
            Conversation.tenant_id == tenant_id,
            Conversation.deleted.is_(False),
        ).with_for_update().first()
        if locked_item is not None:
            item = locked_item
            membership = ConversationParticipant.query.filter(
                ConversationParticipant.tenant_id == tenant_id,
                ConversationParticipant.conversation_id == item.id,
                ConversationParticipant.participant_id == user_id,
                ConversationParticipant.active.is_(True),
                ConversationParticipant.approval_status == "APPROVED",
                ConversationParticipant.deleted.is_(False),
            ).first()
            if membership is None:
                return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)
    body = request.json or {}
    requested_topic_name = str(body.get("tinode_topic") or "").strip()
    if not requested_topic_name:
        return json({"error_code": "PARAM_ERROR", "error_message": "Tinode topic is required."}, status=400)
    topic_name = requested_topic_name
    using_persisted_group_topic = False
    if is_group and item.tinode_topic and item.tinode_topic != requested_topic_name:
        # Another tab won the race while this browser was creating a topic.
        # Reconcile and return the persisted topic instead of rejecting the
        # surviving chat with a stale direct/group topic type.
        topic_name = str(item.tinode_topic).strip()
        using_persisted_group_topic = True
    if not valid_tinode_topic(topic_name, is_group):
        if using_persisted_group_topic:
            return json({"error_code": "TINODE_TOPIC_INVALID", "error_message": "The persisted Tinode topic is invalid for this conversation."}, status=409)
        return json({"error_code": "TINODE_TOPIC_INVALID", "error_message": "Tinode topic type is invalid for this conversation."}, status=400)
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
    if not is_group:
        _restore_legacy_direct_memberships(item)
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
            expected_member_uids = _expected_tinode_member_uids(item, participants, accounts_by_id)
        except AuthError as error:
            return json({"error_code": "TINODE_PARTICIPANTS_INVALID", "error_message": str(error)}, status=error.status_code)
        if not expected_member_uids:
            return json({
                "error_code": "TINODE_PARTICIPANTS_UNPREPARED",
                "error_message": "Prepare all Chatmgt participants before binding the Tinode group.",
            }, status=409)

    tinode_token = str(body.get("tinode_token") or "").strip()
    if not tinode_token:
        return json({"error_code": "TINODE_TOKEN_REQUIRED", "error_message": "Tinode authentication is required."}, status=400)

    # A fresh browser-created topic is initially owned by the viewer. Transfer
    # it to the authoritative Chatmgt owner before server-side reconciliation.
    is_new_group_binding = is_group and not item.tinode_topic
    owner_transfer = {
        "requested": False,
        "accepted": False,
        "viewer_uid": "",
        "owner_uid": "",
        "owner_token": "",
    }

    async def rollback_tinode_owner_transfer():
        if not owner_transfer["requested"]:
            return
        viewer_uid = owner_transfer["viewer_uid"]
        owner_uid = owner_transfer["owner_uid"]
        owner_token = owner_transfer["owner_token"]
        try:
            if owner_transfer["accepted"]:
                await tinode_add_topic_members(
                    owner_token,
                    owner_uid,
                    topic_name,
                    [viewer_uid],
                    mode="JRWPASO",
                )
                await tinode_accept_topic_owner(
                    tinode_token,
                    viewer_uid,
                    topic_name,
                    mode="JRWPASO",
                )
            await tinode_add_topic_members(
                tinode_token,
                viewer_uid,
                topic_name,
                [owner_uid],
                mode="JRWPAS",
            )
        except Exception as error:
            logger.warning(
                "Could not roll back the Tinode owner transfer for conversation=%s: %s",
                str(conversation_uuid),
                error,
            )

    binding_phase = "verify_topic_access"
    try:
        if not is_group:
            await tinode_verify_topic_access(
                tinode_token,
                account.tinode_uid,
                topic_name,
                expected_member_uids=expected_member_uids,
            )
        if is_group:
            owner_participant = next(
                (participant for participant in participants if _is_group_owner(participant)),
                None,
            )
            owner_account = accounts_by_id.get(owner_participant.participant_id) if owner_participant else None
            if owner_account is None:
                raise AuthError("The group has no active owner.", 409)
            binding_phase = "prepare_group_credentials"
            prepared_uids = await _ensure_tinode_accounts(accounts_by_id.values())
            member_tokens = await _tinode_tokens_for_accounts(
                accounts_by_id,
                list(accounts_by_id),
                prepared_uids,
            )
            expected_member_uids = _expected_tinode_member_uids(
                item,
                participants,
                accounts_by_id,
            )
            owner_uid = prepared_uids[owner_participant.participant_id]
            owner_token = member_tokens[owner_uid]
            viewer_uid = str(account.tinode_uid or "").strip()
            if is_new_group_binding and viewer_uid and owner_uid != viewer_uid:
                binding_phase = "transfer_group_owner"
                owner_transfer.update({
                    "requested": True,
                    "viewer_uid": viewer_uid,
                    "owner_uid": owner_uid,
                    "owner_token": owner_token,
                })
                await tinode_add_topic_members(
                    tinode_token,
                    viewer_uid,
                    topic_name,
                    [owner_uid],
                    mode="JRWPASO",
                )
                await tinode_accept_topic_owner(
                    owner_token,
                    owner_uid,
                    topic_name,
                    mode="JRWPASO",
                )
                owner_transfer["accepted"] = True
            binding_phase = "reconcile_group_members"
            await tinode_reconcile_topic_members(
                owner_token,
                owner_uid,
                topic_name,
                expected_member_uids,
                expected_access_modes=_expected_tinode_access_modes(
                    item,
                    participants,
                    accounts_by_id,
                ),
                member_tokens=member_tokens,
            )
            binding_phase = "verify_reconciled_topic"
            await tinode_verify_topic_access(
                tinode_token,
                account.tinode_uid,
                topic_name,
                expected_member_uids=expected_member_uids,
            )
        binding_phase = "persist_conversation_binding"
        incoming_avatar = str(body.get("avatar") or "").strip()
        if is_group and incoming_avatar:
            properties = dict(item.properties or {})
            properties["avatar"] = incoming_avatar[:8192]
            properties["group_avatar"] = properties["avatar"]
            item.properties = properties
        if not is_group:
            _clear_direct_deleted_marker(item, user_id)
        # A Tinode direct topic is the other participant's UID, so it differs
        # for each viewer and must not be persisted as one shared binding.
        item.tinode_topic = topic_name if is_group else None
        db.session.commit()
        return json(_serialize_conversation(item, user_id))
    except AuthError as error:
        db.session.rollback()
        await rollback_tinode_owner_transfer()
        return json({"error_code": "TINODE_TOPIC_REJECTED", "error_message": str(error)}, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        await rollback_tinode_owner_transfer()
        logger.exception(
            "Tinode topic binding failed phase=%s conversation=%s topic_kind=%s: %s",
            binding_phase,
            str(conversation_uuid),
            "group" if is_group else "direct",
            error,
        )
        return json({
            "error_code": "TINODE_TOPIC_BIND_FAILED",
            "error_message": "Could not bind the Tinode topic.",
        }, status=502)


@app.route('/api/v1/conversation/<conversation_id>/tinode-chatbot', methods=['POST'])
@app.route('/api/v1/chat/threads/<conversation_id>/tinode-chatbot', methods=['POST'])
async def conversation_enable_tinode_chatbot(request, conversation_id):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    if management_session_requested(request):
        return json({
            "error_code": "CHAT_SESSION_REQUIRED",
            "error_message": "The group chatbot can only be enabled from a Chat user session.",
        }, status=403)
    try:
        conversation_uuid = uuid.UUID(str(conversation_id))
    except (ValueError, TypeError, AttributeError):
        return json({"error_code": "NOT_FOUND", "error_message": "Invalid conversation."}, status=404)

    user_id = _user_id(current_user)
    item, membership = _conversation_and_membership(tenant_id, conversation_uuid, user_id)
    if item is None or membership is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)
    if not bool((item.properties or {}).get("is_group")):
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "The chatbot can only be enabled in a group.",
        }, status=400)
    if not _is_group_manager(membership):
        return json({
            "error_code": "GROUP_MANAGER_REQUIRED",
            "error_message": "Only the group owner or deputy can enable ViChat AI.",
        }, status=403)
    if not item.tinode_topic or not valid_tinode_topic(item.tinode_topic, True):
        return json({
            "error_code": "TINODE_TOPIC_REQUIRED",
            "error_message": "Bind the group to Tinode before enabling ViChat AI.",
        }, status=409)
    account = _account_by_id(tenant_id, user_id)
    if account is None:
        return _auth_error()

    try:
        if current_user.get("auth_method") == "account_sso":
            await _validated_account_identity(request, account)
        if not tinode_chatbot_enabled(app):
            return json({
                "error_code": "TINODE_CHATBOT_NOT_CONFIGURED",
                "error_message": "ViChat AI is not configured on the server.",
            }, status=503)

        chatbot_auth = await ensure_tinode_chatbot_auth(app)
        chatbot_uid = str(chatbot_auth.get("uid") or "").strip()
        if not chatbot_uid:
            raise AuthError("Tinode chatbot account has no user mapping.", 503)

        participants, accounts_by_id = _active_conversation_accounts(item)
        prepared_uids = await _ensure_tinode_accounts(accounts_by_id.values())
        member_tokens = await _tinode_tokens_for_accounts(
            accounts_by_id,
            list(accounts_by_id),
            prepared_uids,
        )
        expected_member_uids = {
            prepared_uids[participant.participant_id]
            for participant in participants
        }
        if not expected_member_uids or "" in expected_member_uids:
            return json({
                "error_code": "TINODE_PARTICIPANTS_UNPREPARED",
                "error_message": "Prepare all group members before enabling ViChat AI.",
            }, status=409)
        owner_participant = next(
            (participant for participant in participants if _is_group_owner(participant)),
            None,
        )
        owner_account = accounts_by_id.get(owner_participant.participant_id) if owner_participant else None
        if owner_account is None:
            raise AuthError("The group has no active owner.", 409)
        owner_uid = prepared_uids[owner_participant.participant_id]
        owner_token = member_tokens[owner_uid]
        if not owner_token:
            raise AuthError("Tinode could not authenticate the group owner.", 502)

        actual_member_uids = await tinode_topic_member_uids(
            owner_token,
            owner_uid,
            item.tinode_topic,
        )
        if chatbot_uid in actual_member_uids:
            expected_member_uids.add(chatbot_uid)
        if actual_member_uids != expected_member_uids:
            await tinode_reconcile_topic_members(
                owner_token,
                owner_uid,
                item.tinode_topic,
                expected_member_uids,
                expected_access_modes=_expected_tinode_access_modes(
                    item,
                    participants,
                    accounts_by_id,
                ),
                member_tokens=member_tokens,
            )
            actual_member_uids = await tinode_topic_member_uids(
                owner_token,
                owner_uid,
                item.tinode_topic,
            )
        if chatbot_uid not in actual_member_uids:
            await tinode_add_topic_members(
                owner_token,
                owner_uid,
                item.tinode_topic,
                [chatbot_uid],
                mode="JRWPAS",
            )

        properties = dict(item.properties or {})
        chatbot_was_enabled = bool(properties.get("chatbot_enabled"))
        properties["chatbot_enabled"] = True
        properties["chatbot_tinode_uid"] = chatbot_uid
        item.properties = properties
        item.updated_at = int(time.time())
        db.session.commit()
        if not chatbot_was_enabled:
            await _publish_group_activity_events(item, [{
                "action": "group_chatbot_enabled",
                "actorId": str(account.tinode_uid or "").strip() or user_id,
                "actorAccountId": user_id,
                "actorName": account.full_name or account.username or user_id,
                "chatbotUid": chatbot_uid,
            }])
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
        return json({"error_code": "TINODE_CHATBOT_MEMBERSHIP_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        logger.exception("Could not enable the Tinode group chatbot: %s", error)
        return json({
            "error_code": "TINODE_CHATBOT_MEMBERSHIP_FAILED",
            "error_message": "Could not enable ViChat AI in this group.",
        }, status=503)


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
    group_settings = _normalized_group_settings(
        (item.properties or {}).get("groupSettings") or (item.properties or {}).get("group_settings")
    )
    approval_required = (
        bool(group_settings["approveMembers"])
        and not _is_group_manager(membership)
        and not _is_admin(current_user)
    )
    activated_ids = [
        requested_id for requested_id in requested_ids
        if existing_by_id.get(requested_id) is None or not existing_by_id[requested_id].active
    ]
    if approval_required:
        activated_ids = []
    try:
        tinode_token = ""
        tinode_operator_uid = ""
        actor_tinode_uid = ""
        added_tinode_uids = []
        created_tinode_uids = []
        existing_tinode_member_uids = set()
        added_member_tokens = {}
        tinode_members_added = False
        database_committed = False
        actor_account = None
        if item.tinode_topic:
            actor_account = _account_by_id(tenant_id, user_id)
            if actor_account is None:
                return json({"error_code": "TINODE_ACCOUNT_UNPREPARED", "error_message": "The current Tinode account is not prepared."}, status=409)
            if current_user.get("auth_method") == "account_sso":
                await _validated_account_identity(request, actor_account)
            actor_tinode_uid, _actor_tinode_token = await _tinode_account_credentials(actor_account)
        if item.tinode_topic and activated_ids:
            owner_participants, owner_accounts = _active_conversation_accounts(item)
            _owner_account, tinode_operator_uid, tinode_token = await _group_owner_tinode_credentials(
                item,
                owner_participants,
                owner_accounts,
            )
            if not tinode_token:
                raise AuthError("Tinode could not authenticate the group owner.", 502)
            existing_tinode_member_uids = await tinode_topic_member_uids(
                tinode_token,
                tinode_operator_uid,
                item.tinode_topic,
            )
            prepared_uids = await _ensure_tinode_accounts(
                requested_accounts_by_id[requested_id] for requested_id in activated_ids
            )
            added_tinode_uids = [prepared_uids[requested_id] for requested_id in activated_ids]
            added_member_tokens = await _tinode_tokens_for_accounts(
                requested_accounts_by_id,
                activated_ids,
                prepared_uids,
            )
            # Authentication may recreate a missing Tinode account and replace
            # its UID, so use the post-authentication mapping for every bridge
            # operation and activity event.
            added_tinode_uids = [prepared_uids[requested_id] for requested_id in activated_ids]

        for requested_id in requested_ids:
            participant = existing_by_id.get(requested_id)
            requires_approval = approval_required and (
                participant is None or not participant.active
            )
            if participant is None:
                participant = ConversationParticipant(
                    tenant_id=tenant_id,
                    conversation_id=item.id,
                    participant_type="USER",
                    participant_id=requested_id,
                    role="MEMBER",
                    joined_at=None if requires_approval else now,
                    active=not requires_approval,
                    approval_status="PENDING" if requires_approval else "APPROVED",
                )
                db.session.add(participant)
            elif requires_approval:
                participant.active = False
                participant.left_at = None
                participant.joined_at = None
                participant.role = "MEMBER"
                participant.approval_status = "PENDING"
            else:
                participant.active = True
                participant.left_at = None
                participant.joined_at = now
                participant.role = "MEMBER"
                participant.approval_status = "APPROVED"
        item.updated_at = now
        db.session.flush()
        if item.tinode_topic and added_tinode_uids:
            _updated_tinode_uids, created_tinode_uids = await tinode_add_topic_members(
                tinode_token,
                tinode_operator_uid,
                item.tinode_topic,
                added_tinode_uids,
                return_created=True,
                known_existing_member_uids=existing_tinode_member_uids,
            )
            tinode_members_added = bool(created_tinode_uids)
            active_participants, active_accounts = _active_conversation_accounts(item)
            expected_member_uids = _expected_tinode_member_uids(item, active_participants, active_accounts)
            expected_access_modes = _expected_tinode_access_modes(item, active_participants, active_accounts)
            await tinode_reconcile_topic_members(
                tinode_token,
                tinode_operator_uid,
                item.tinode_topic,
                expected_member_uids,
                expected_access_modes=expected_access_modes,
                member_tokens=added_member_tokens,
                access_scope_uids=added_tinode_uids,
                remove_extra_members=False,
            )
        db.session.commit()
        database_committed = True
        if item.tinode_topic and added_tinode_uids:
            await _publish_group_activity_events(item, [{
                "action": "member_added",
                "actorId": actor_tinode_uid or user_id,
                "actorAccountId": user_id,
                "actorName": actor_account.full_name or actor_account.username or user_id,
                "targets": [
                    {
                        "id": added_uid,
                        "uid": added_uid,
                        "tinodeUid": added_uid,
                        "accountId": requested_id,
                        "name": (
                            requested_accounts_by_id[requested_id].full_name
                            or requested_accounts_by_id[requested_id].username
                            or requested_id
                        ),
                    }
                    for requested_id, added_uid in zip(activated_ids, added_tinode_uids)
                ],
            }])
        elif item.tinode_topic:
            # Pending members are not subscribed yet, so announce the request
            # through the active group owner bridge for every current member.
            pending_ids = [
                requested_id for requested_id in requested_ids
                if requested_id not in activated_ids
                and (
                    existing_by_id.get(requested_id) is None
                    or not existing_by_id[requested_id].active
                )
            ]
            if pending_ids:
                pending_events = [{
                    "action": "member_pending",
                    "actorId": (
                        str(getattr(actor_account, "tinode_uid", "") or "").strip()
                        if actor_account is not None
                        else user_id
                    ) or user_id,
                    "actorAccountId": user_id,
                    "actorName": (
                        actor_account.full_name
                        or actor_account.username
                        or user_id
                    ) if actor_account is not None else user_id,
                    "targets": [{
                        "id": str(getattr(requested_accounts_by_id[pending_id], "tinode_uid", "") or "").strip()
                        or pending_id,
                        "accountId": pending_id,
                        "name": (
                            requested_accounts_by_id[pending_id].full_name
                            or requested_accounts_by_id[pending_id].username
                            or pending_id
                        ),
                    } for pending_id in pending_ids],
                }]
                await _publish_group_activity_events(item, pending_events)
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
        if tinode_members_added and not database_committed:
            for added_uid in reversed(created_tinode_uids):
                try:
                    await tinode_remove_topic_member(
                        tinode_token,
                        tinode_operator_uid,
                        item.tinode_topic,
                        added_uid,
                    )
                except AuthError:
                    logger.warning("Could not roll back Tinode member %s after access failure.", added_uid)
        return json({"error_code": "TINODE_MEMBERSHIP_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        if tinode_members_added and not database_committed:
            for added_uid in reversed(created_tinode_uids):
                try:
                    await tinode_remove_topic_member(
                        tinode_token,
                        tinode_operator_uid,
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


@app.route('/api/v1/conversation/<conversation_id>/participants/<participant_id>/role', methods=['PUT'])
@app.route('/api/v1/chat/threads/<conversation_id>/participants/<participant_id>/role', methods=['PUT'])
async def conversation_participant_role(request, conversation_id, participant_id):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    if management_session_requested(request):
        return json({
            "error_code": "CHAT_SESSION_REQUIRED",
            "error_message": "Group roles can only be changed from a Chat user session.",
        }, status=403)
    try:
        conversation_uuid = uuid.UUID(str(conversation_id))
    except (ValueError, TypeError, AttributeError):
        return json({"error_code": "NOT_FOUND", "error_message": "Invalid conversation."}, status=404)

    user_id = _user_id(current_user)
    item, membership = _conversation_and_membership(tenant_id, conversation_uuid, user_id)
    if item is None or membership is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)
    if not bool((item.properties or {}).get("is_group")):
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "Group roles can only be changed for a group.",
        }, status=400)
    if not _is_group_manager(membership):
        return json({
            "error_code": "GROUP_MANAGER_REQUIRED",
            "error_message": "Only the group owner or deputy can appoint or remove a deputy.",
        }, status=403)

    body = request.json if isinstance(request.json, dict) else {}
    requested_role = str(body.get("role") or "").strip().upper()
    if requested_role not in {"ADMIN", "MEMBER"}:
        return json({
            "error_code": "GROUP_ROLE_INVALID",
            "error_message": "The group role must be ADMIN or MEMBER.",
        }, status=400)

    target_id = str(participant_id or "").strip()
    if target_id == user_id:
        return json({
            "error_code": "GROUP_ROLE_SELF_TARGET",
            "error_message": "A group manager cannot change their own group role.",
        }, status=409)
    target = ConversationParticipant.query.filter(
        ConversationParticipant.tenant_id == tenant_id,
        ConversationParticipant.conversation_id == item.id,
        ConversationParticipant.participant_id == target_id,
        ConversationParticipant.active.is_(True),
        ConversationParticipant.approval_status == "APPROVED",
        ConversationParticipant.deleted.is_(False),
    ).first()
    if target is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Active group member not found."}, status=404)
    if _is_group_owner(target):
        return json({
            "error_code": "OWNER_ROLE_PROTECTED",
            "error_message": "The group owner role cannot be changed here.",
        }, status=409)

    previous_role = _group_role(target.role)
    if previous_role == requested_role:
        return json(_serialize_conversation(item, user_id))

    actor_account = _account_by_id(tenant_id, user_id)
    target_account = _account_by_id(tenant_id, target_id)
    if actor_account is None or target_account is None:
        return json({
            "error_code": "TENANT_VIOLATION",
            "error_message": "The group member is no longer active in this tenant.",
        }, status=409)

    now = int(time.time())
    tinode_token = ""
    owner_uid = ""
    actor_uid = ""
    target_uid = ""
    role_sync_attempted = False
    previous_access_modes = None
    expected_member_uids = None
    member_tokens = None
    try:
        if current_user.get("auth_method") == "account_sso":
            await _validated_account_identity(request, actor_account)
        if item.tinode_topic:
            actor_uid, _actor_tinode_token = await _tinode_account_credentials(actor_account)
            target_uid, _target_tinode_token = await _tinode_account_credentials(target_account)
        else:
            actor_uid = await _ensure_tinode_account(actor_account)
            target_uid = await _ensure_tinode_account(target_account)

        if item.tinode_topic:
            participants, accounts_by_id = _active_conversation_accounts(item)
            owner_account, owner_uid, tinode_token = await _group_owner_tinode_credentials(
                item,
                participants,
                accounts_by_id,
            )
            prepared_uids = await _ensure_tinode_accounts(accounts_by_id.values())
            member_tokens = await _tinode_tokens_for_accounts(
                accounts_by_id,
                list(accounts_by_id),
                prepared_uids,
            )
            actor_uid = prepared_uids.get(user_id, actor_uid)
            target_uid = prepared_uids.get(target_id, target_uid)
            expected_member_uids = _expected_tinode_member_uids(
                item,
                participants,
                accounts_by_id,
            )
            previous_access_modes = _expected_tinode_access_modes(
                item,
                participants,
                accounts_by_id,
            )
            # Persist the new Chatmgt role in the transaction before deriving
            # the Tinode access contract from the updated membership.
            target.role = requested_role
            item.updated_at = now
            db.session.flush()
            role_sync_attempted = True
            await tinode_reconcile_topic_members(
                tinode_token,
                owner_uid,
                item.tinode_topic,
                expected_member_uids,
                expected_access_modes=_expected_tinode_access_modes(
                    item,
                    participants,
                    accounts_by_id,
                ),
                member_tokens=member_tokens,
                replace_access_uids={target_uid},
            )
        else:
            target.role = requested_role
        item.updated_at = now
        db.session.commit()
        _audit(
            request,
            "CONVERSATION_GROUP_ROLE_CHANGED",
            True,
            tenant_id=tenant_id,
            user_id=user_id,
            properties={
                "conversation_id": str(item.id),
                "target_account_id": target_id,
                "previous_role": previous_role,
                "role": requested_role,
            },
        )
        if item.tinode_topic:
            await _publish_group_activity_events(item, [{
                "action": "group_role_changed",
                "actorId": actor_uid or user_id,
                "actorAccountId": user_id,
                "actorName": actor_account.full_name or actor_account.username or user_id,
                "targetId": target_uid or target_id,
                "targetAccountId": target_id,
                "previousRole": previous_role,
                "role": requested_role,
                "targets": [{
                    "id": target_uid or target_id,
                    "uid": target_uid or target_id,
                    "tinodeUid": target_uid or target_id,
                    "accountId": target_id,
                    "name": target_account.full_name or target_account.username or target_id,
                    "role": requested_role,
                    "groupRole": requested_role,
                }],
            }])
        return json(_serialize_conversation(item, user_id))
    except AccountSSOError as error:
        db.session.rollback()
        if role_sync_attempted and item.tinode_topic and expected_member_uids and previous_access_modes is not None:
            try:
                target.role = previous_role
                db.session.flush()
                await tinode_reconcile_topic_members(
                    tinode_token,
                    owner_uid,
                    item.tinode_topic,
                    expected_member_uids,
                    expected_access_modes=previous_access_modes,
                    member_tokens=member_tokens,
                    replace_access_uids={target_uid},
                )
            except Exception as rollback_error:
                logger.warning("Could not roll back Tinode group role access: %s", rollback_error)
        if error.status_code != 503:
            revoke_request_token(request)
            revoked_error = AccountSSOError(str(error), 401, error.error_code)
            response = clear_auth_cookie(_account_sso_error(revoked_error), request)
            return clear_account_cookie(response)
        return _account_sso_error(error)
    except AuthError as error:
        db.session.rollback()
        if role_sync_attempted and item.tinode_topic and expected_member_uids and previous_access_modes is not None:
            try:
                target.role = previous_role
                db.session.flush()
                await tinode_reconcile_topic_members(
                    tinode_token,
                    owner_uid,
                    item.tinode_topic,
                    expected_member_uids,
                    expected_access_modes=previous_access_modes,
                    member_tokens=member_tokens,
                    replace_access_uids={target_uid},
                )
            except Exception as rollback_error:
                logger.warning("Could not roll back Tinode group role access: %s", rollback_error)
        return json({"error_code": "TINODE_ROLE_SYNC_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        if role_sync_attempted and item.tinode_topic and expected_member_uids and previous_access_modes is not None:
            try:
                target.role = previous_role
                db.session.flush()
                await tinode_reconcile_topic_members(
                    tinode_token,
                    owner_uid,
                    item.tinode_topic,
                    expected_member_uids,
                    expected_access_modes=previous_access_modes,
                    member_tokens=member_tokens,
                    replace_access_uids={target_uid},
                )
            except Exception as rollback_error:
                logger.warning("Could not roll back Tinode group role access: %s", rollback_error)
        logger.exception("Could not update the Chatmgt group role: %s", error)
        return json({
            "error_code": "CONVERSATION_GROUP_ROLE_ERROR",
            "error_message": "Could not update the group role.",
        }, status=503)


@app.route('/api/v1/conversation/<conversation_id>/participants/<participant_id>/approval', methods=['PUT'])
@app.route('/api/v1/chat/threads/<conversation_id>/participants/<participant_id>/approval', methods=['PUT'])
async def conversation_participant_approval(request, conversation_id, participant_id):
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
        return json({"error_code": "PARAM_ERROR", "error_message": "Member approval is only available for a group."}, status=400)
    if not _is_group_manager(membership):
        return json({"error_code": "OWNER_REQUIRED", "error_message": "Only a group owner or deputy can approve members."}, status=403)

    approved = (request.json or {}).get("approved")
    if not isinstance(approved, bool):
        return json({"error_code": "PARAM_ERROR", "error_message": "The approval decision must be boolean."}, status=400)

    target = ConversationParticipant.query.filter(
        ConversationParticipant.tenant_id == tenant_id,
        ConversationParticipant.conversation_id == item.id,
        ConversationParticipant.participant_id == str(participant_id),
        ConversationParticipant.deleted.is_(False),
    ).first()
    if target is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Pending member not found."}, status=404)
    status = _participant_approval_status(target)
    if status != "PENDING":
        if approved and status == "APPROVED" and target.active:
            return json(_serialize_conversation(item, user_id))
        return json({"error_code": "MEMBER_APPROVAL_STALE", "error_message": "This member approval request is no longer pending."}, status=409)

    now = int(time.time())
    actor_account = _account_by_id(tenant_id, user_id)
    target_account = _account_by_id(tenant_id, str(participant_id))
    if approved and (actor_account is None or target_account is None):
        return json({"error_code": "TENANT_VIOLATION", "error_message": "The member is no longer active in this tenant."}, status=409)

    tinode_token = ""
    tinode_operator_uid = ""
    actor_tinode_uid = ""
    target_uid = ""
    target_token = ""
    existing_tinode_member_uids = set()
    tinode_member_added = False
    database_committed = False
    try:
        if approved:
            if current_user.get("auth_method") == "account_sso":
                await _validated_account_identity(request, actor_account)
            if actor_account is not None and item.tinode_topic:
                actor_tinode_uid, _actor_tinode_token = await _tinode_account_credentials(actor_account)
            if item.tinode_topic:
                target_uid, target_token = await _tinode_account_credentials(target_account)
                owner_participants, owner_accounts = _active_conversation_accounts(item)
                _owner_account, tinode_operator_uid, tinode_token = await _group_owner_tinode_credentials(
                    item,
                    owner_participants,
                    owner_accounts,
                )
                if not tinode_token:
                    raise AuthError("Tinode could not authenticate the group owner.", 502)
                existing_tinode_member_uids = await tinode_topic_member_uids(
                    tinode_token,
                    tinode_operator_uid,
                    item.tinode_topic,
                )

            target.active = True
            target.left_at = None
            target.joined_at = now
            target.role = "MEMBER"
            target.approval_status = "APPROVED"
            item.updated_at = now
            db.session.flush()

            if item.tinode_topic:
                _updated_tinode_uids, created_tinode_uids = await tinode_add_topic_members(
                    tinode_token,
                    tinode_operator_uid,
                    item.tinode_topic,
                    [target_uid],
                    return_created=True,
                    known_existing_member_uids=existing_tinode_member_uids,
                )
                tinode_member_added = bool(created_tinode_uids)
                active_participants, active_accounts = _active_conversation_accounts(item)
                expected_member_uids = _expected_tinode_member_uids(item, active_participants, active_accounts)
                expected_access_modes = _expected_tinode_access_modes(item, active_participants, active_accounts)
                await tinode_reconcile_topic_members(
                    tinode_token,
                    tinode_operator_uid,
                    item.tinode_topic,
                    expected_member_uids,
                    expected_access_modes=expected_access_modes,
                    member_tokens={target_uid: target_token},
                    access_scope_uids={target_uid},
                    remove_extra_members=False,
                )
        else:
            target.active = False
            target.left_at = now
            target.approval_status = "REJECTED"
            target.deleted = True
            item.updated_at = now

        db.session.commit()
        database_committed = True
        if approved and item.tinode_topic:
            await _publish_group_activity_events(item, [{
                "action": "member_approved",
                "actorId": actor_tinode_uid or user_id,
                "actorAccountId": user_id,
                "actorName": actor_account.full_name or actor_account.username or user_id,
                "targets": [{
                    "id": target_uid or str(participant_id),
                    "uid": target_uid or str(participant_id),
                    "tinodeUid": target_uid or str(participant_id),
                    "accountId": str(participant_id),
                    "name": target_account.full_name or target_account.username or str(participant_id),
                }],
            }])
        elif not approved and item.tinode_topic:
            await _publish_group_activity_events(item, [{
                "action": "member_rejected",
                "actorId": actor_tinode_uid or user_id,
                "actorAccountId": user_id,
                "actorName": (
                    actor_account.full_name
                    or actor_account.username
                    or user_id
                ) if actor_account is not None else user_id,
                "targets": [{
                    "id": target_uid or str(participant_id),
                    "accountId": str(participant_id),
                    "name": (
                        target_account.full_name
                        or target_account.username
                        or str(participant_id)
                    ) if target_account is not None else str(participant_id),
                }],
            }])
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
        if tinode_member_added and not database_committed:
            try:
                await tinode_remove_topic_member(tinode_token, tinode_operator_uid, item.tinode_topic, target_uid)
            except AuthError:
                logger.warning("Could not roll back the approved Tinode member %s.", target_uid)
        return json({"error_code": "TINODE_MEMBERSHIP_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        if tinode_member_added and not database_committed:
            try:
                await tinode_remove_topic_member(tinode_token, tinode_operator_uid, item.tinode_topic, target_uid)
            except AuthError:
                logger.warning("Could not roll back the approved Tinode member %s.", target_uid)
        logger.exception("Could not update group member approval: %s", error)
        return json({
            "error_code": "CONVERSATION_MEMBER_APPROVAL_ERROR",
            "error_message": "Could not update the group member approval.",
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
    is_group = bool((item.properties or {}).get("is_group"))
    if participant_id != user_id and (not is_group or not _is_group_manager(membership)):
        return _forbidden_error()

    target = ConversationParticipant.query.filter(
        ConversationParticipant.tenant_id == tenant_id,
        ConversationParticipant.conversation_id == item.id,
        ConversationParticipant.participant_id == participant_id,
        ConversationParticipant.active.is_(True),
        ConversationParticipant.approval_status == "APPROVED",
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
    if _is_group_owner(target) and participant_id != user_id:
        return json({"error_code": "OWNER_REQUIRED", "error_message": "The group owner cannot be removed."}, status=409)
    if not is_group and participant_id != user_id:
        return json({
            "error_code": "DIRECT_PARTICIPANTS_INVALID",
            "error_message": "A direct conversation can only be removed from the current user's list.",
        }, status=409)

    now = int(time.time())
    request_payload = request.json if isinstance(request.json, dict) else {}
    active_survivors = []
    if is_group:
        active_survivors = ConversationParticipant.query.join(
            ManagementAccount,
            and_(
                ManagementAccount.tenant_id == ConversationParticipant.tenant_id,
                ManagementAccount.id == ConversationParticipant.participant_id,
            ),
        ).filter(
            ConversationParticipant.tenant_id == tenant_id,
            ConversationParticipant.conversation_id == item.id,
            ConversationParticipant.participant_id != participant_id,
            ConversationParticipant.active.is_(True),
            ConversationParticipant.approval_status == "APPROVED",
            ConversationParticipant.deleted.is_(False),
            ManagementAccount.active.is_(True),
        ).all()
    close_after_leave = bool(
        is_group
        and not active_survivors
    )
    if not is_group:
        deleted_at = datetime.datetime.fromtimestamp(
            now,
            datetime.timezone.utc,
        ).isoformat().replace("+00:00", "Z")
        properties = dict(item.properties or {})
        deleted_by_user = properties.get(DIRECT_DELETED_AT_PROPERTY)
        if not isinstance(deleted_by_user, dict):
            deleted_by_user = {}
        deleted_by_user = {
            str(key): str(value)
            for key, value in deleted_by_user.items()
            if key and value
        }
        deleted_by_user[user_id] = deleted_at
        properties[DIRECT_DELETED_AT_PROPERTY] = deleted_by_user
        item.properties = properties
        target.notification_muted_until = None
        target.pinned_at = None
        item.updated_at = now
        db.session.commit()
        return json(_serialize_conversation(item, user_id))

    replacement_id = str(request_payload.get("replacement_id") or "").strip()
    replacement = None
    if is_group and _is_group_owner(target) and not close_after_leave:
        if participant_id != user_id:
            return json({"error_code": "OWNER_REQUIRED", "error_message": "The group owner cannot be removed."}, status=409)
        if not replacement_id:
            return json({
                "error_code": "OWNER_REPLACEMENT_REQUIRED",
                "error_message": "The group owner must choose a replacement before leaving.",
            }, status=409)
        if replacement_id == participant_id:
            return json({
                "error_code": "OWNER_REPLACEMENT_INVALID",
                "error_message": "The replacement owner must be another active group member.",
            }, status=409)
        replacement = ConversationParticipant.query.join(
            ManagementAccount,
            and_(
                ManagementAccount.tenant_id == ConversationParticipant.tenant_id,
                ManagementAccount.id == ConversationParticipant.participant_id,
            ),
        ).filter(
            ConversationParticipant.tenant_id == tenant_id,
            ConversationParticipant.conversation_id == item.id,
            ConversationParticipant.participant_id == replacement_id,
            ConversationParticipant.active.is_(True),
            ConversationParticipant.approval_status == "APPROVED",
            ConversationParticipant.deleted.is_(False),
            ManagementAccount.active.is_(True),
        ).first()
        if replacement is None:
            return json({
                "error_code": "OWNER_REPLACEMENT_NOT_MEMBER",
                "error_message": "The selected replacement is not an active member of this group.",
            }, status=409)
    event_sender_participant = replacement
    if is_group and participant_id == user_id and event_sender_participant is None and not close_after_leave:
        event_sender_participant = ConversationParticipant.query.join(
            ManagementAccount,
            and_(
                ManagementAccount.tenant_id == ConversationParticipant.tenant_id,
                ManagementAccount.id == ConversationParticipant.participant_id,
            ),
        ).filter(
            ConversationParticipant.tenant_id == tenant_id,
            ConversationParticipant.conversation_id == item.id,
            ConversationParticipant.participant_id != participant_id,
            ConversationParticipant.active.is_(True),
            ConversationParticipant.approval_status == "APPROVED",
            ConversationParticipant.deleted.is_(False),
            ManagementAccount.active.is_(True),
        ).order_by(
            ConversationParticipant.joined_at.asc().nullslast(),
            ConversationParticipant.participant_id.asc(),
        ).first()

    if close_after_leave:
        topic_owner = next((participant for participant in ConversationParticipant.query.filter(
            ConversationParticipant.tenant_id == tenant_id,
            ConversationParticipant.conversation_id == item.id,
            ConversationParticipant.approval_status == "APPROVED",
            ConversationParticipant.deleted.is_(False),
        ).order_by(
            ConversationParticipant.active.desc(),
            ConversationParticipant.joined_at.asc().nullslast(),
        ).all() if _is_group_owner(participant)), None)
        topic_owner_id = str(topic_owner.participant_id) if topic_owner is not None else ""
        try:
            all_participants = ConversationParticipant.query.filter(
                ConversationParticipant.tenant_id == tenant_id,
                ConversationParticipant.conversation_id == item.id,
            ).all()
            for participant in all_participants:
                participant.active = False
                participant.left_at = participant.left_at or now
                participant.deleted = True
            item.status = "CLOSED"
            item.closed_at = now
            item.deleted = True
            item.updated_at = now
            db.session.commit()
        except Exception as error:
            db.session.rollback()
            logger.exception("Could not close a final-member Chatmgt group: %s", error)
            return json({
                "error_code": "CONVERSATION_PARTICIPANT_ERROR",
                "error_message": "Could not close the conversation.",
            }, status=503)

        final_tinode_cleanup_status = "not_bound"
        if item.tinode_topic:
            final_tinode_cleanup_status = "failed"
            try:
                actor_account = _account_by_id(tenant_id, user_id)
                if actor_account is None:
                    raise AuthError("The current Tinode account is not prepared.", 409)

                dissolve_tinode_uid, actor_tinode_token = await _tinode_account_credentials(actor_account)
                dissolve_tinode_token = str(request_payload.get("tinode_token") or "").strip()
                dissolve_tinode_token = actor_tinode_token or dissolve_tinode_token

                topic_owner_account = None
                if topic_owner_id and topic_owner_id != user_id:
                    topic_owner_account = _account_by_id(tenant_id, topic_owner_id)
                    if topic_owner_account is not None:
                        try:
                            topic_owner_uid, topic_owner_token = await _tinode_account_credentials(topic_owner_account)
                            if topic_owner_token:
                                dissolve_tinode_token = topic_owner_token
                                dissolve_tinode_uid = topic_owner_uid
                        except Exception as error:
                            logger.warning("Could not prepare the stored Tinode owner for final group cleanup: %s", error)

                if not dissolve_tinode_token or not dissolve_tinode_uid:
                    raise AuthError("Tinode authentication is unavailable for final group cleanup.", 409)
                expected_member_uids = {dissolve_tinode_uid}
                if topic_owner_account is not None and topic_owner_account.tinode_uid:
                    expected_member_uids.add(str(topic_owner_account.tinode_uid))
                actual_member_uids = await tinode_topic_member_uids(
                    dissolve_tinode_token,
                    dissolve_tinode_uid,
                    item.tinode_topic,
                )
                tinode_dissolve_member_uids = list(dict.fromkeys([
                    *actual_member_uids,
                    *expected_member_uids,
                    dissolve_tinode_uid,
                ]))
                await tinode_dissolve_topic(
                    dissolve_tinode_token,
                    dissolve_tinode_uid,
                    item.tinode_topic,
                    tinode_dissolve_member_uids,
                )
                final_tinode_cleanup_status = "completed"
            except Exception as error:
                logger.warning(
                    "Final-member group closed in Chatmgt but Tinode cleanup could not complete: %s",
                    error,
                )

        _audit(
            request,
            "CONVERSATION_GROUP_EMPTY_CLOSE",
            True,
            tenant_id=tenant_id,
            user_id=user_id,
            properties={
                "conversation_id": str(item.id),
                "reason": "last_member_left",
                "tinode_cleanup": final_tinode_cleanup_status,
            },
        )
        return json(_serialize_conversation(item, user_id))

    try:
        tinode_token = ""
        tinode_operator_uid = ""
        actor_account = None
        target_account = None
        event_sender_account = None
        event_sender_uid = ""
        event_sender_tinode_token = ""
        replacement_name = ""
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
                        tinode_operator_uid or actor_account.tinode_uid,
                        item.tinode_topic,
                        mode="JRWPASO",
                    )
                await tinode_add_topic_members(
                    tinode_token,
                    tinode_operator_uid or actor_account.tinode_uid,
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
                tinode_operator_uid if is_group else (actor_account.tinode_uid if actor_account is not None else "")
            )
            if not restore_token or not restore_uid:
                return
            try:
                await tinode_add_topic_members(
                    restore_token,
                    restore_uid,
                    item.tinode_topic,
                    [target_uid],
                    mode="JRWPAS",
                )
            except AuthError:
                logger.warning("Could not roll back the Tinode member removal.")

        if item.tinode_topic:
            actor_account = _account_by_id(tenant_id, user_id)
            target_account = _account_by_id(tenant_id, participant_id)
            if actor_account is None:
                return json({"error_code": "TINODE_ACCOUNT_UNPREPARED", "error_message": "The current Tinode account is not prepared."}, status=409)
            if target_account is None:
                return json({"error_code": "TINODE_ACCOUNT_UNPREPARED", "error_message": "The target Tinode account is not prepared."}, status=409)
            if current_user.get("auth_method") == "account_sso":
                await _validated_account_identity(request, actor_account)
            actor_uid, actor_tinode_token = await _tinode_account_credentials(actor_account)
            target_uid, _target_tinode_token = await _tinode_account_credentials(target_account)
            if is_group:
                owner_participants, owner_accounts = _active_conversation_accounts(item)
                _owner_account, tinode_operator_uid, tinode_token = await _group_owner_tinode_credentials(
                    item,
                    owner_participants,
                    owner_accounts,
                )
            else:
                tinode_token = str(request_payload.get("tinode_token") or "").strip() or actor_tinode_token
                tinode_operator_uid = actor_uid
                if not tinode_token:
                    return json({"error_code": "TINODE_TOKEN_REQUIRED", "error_message": "Tinode authentication is required."}, status=400)
            if is_group and event_sender_participant is not None:
                event_sender_account = _account_by_id(tenant_id, event_sender_participant.participant_id)
                if event_sender_account is not None:
                    try:
                        event_sender_uid, event_sender_tinode_token = await _tinode_account_credentials(event_sender_account)
                    except Exception:
                        if replacement is not event_sender_participant:
                            logger.warning("Could not prepare a surviving Tinode member for the leave event.")
                        else:
                            raise
                if replacement is not None:
                    replacement_uid = event_sender_uid
                    replacement_tinode_token = event_sender_tinode_token
                    replacement_name = (
                        event_sender_account.full_name
                        or event_sender_account.username
                        or replacement.participant_id
                    ) if event_sender_account is not None else replacement.participant_id
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
                    tinode_operator_uid,
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
                tinode_operator_uid,
                item.tinode_topic,
                target_uid,
            )
            tinode_target_removed = True
            if is_group:
                active_participants, active_accounts = _active_conversation_accounts(item)
                verification_token = replacement_tinode_token or event_sender_tinode_token or tinode_token
                verification_uid = replacement_uid or event_sender_uid or actor_uid
                if verification_token and verification_uid:
                    prepared_uids = await _ensure_tinode_accounts(active_accounts.values())
                    member_tokens = await _tinode_tokens_for_accounts(
                        active_accounts,
                        list(active_accounts),
                        prepared_uids,
                    )
                    expected_member_uids = _expected_tinode_member_uids(
                        item,
                        active_participants,
                        active_accounts,
                    )
                    await tinode_reconcile_topic_members(
                        verification_token,
                        verification_uid,
                        item.tinode_topic,
                        expected_member_uids,
                        expected_access_modes=_expected_tinode_access_modes(
                            item,
                            active_participants,
                            active_accounts,
                        ),
                        member_tokens=member_tokens,
                    )
        item.updated_at = now
        db.session.commit()
        if is_group and item.tinode_topic:
            actor_account = actor_account or _account_by_id(tenant_id, user_id)
            event_actor_account = target_account if participant_id == user_id else actor_account
            event_actor_id = (
                target_uid
                if participant_id == user_id
                else str(getattr(actor_account, "tinode_uid", "") or "").strip()
            ) or (participant_id if participant_id == user_id else user_id)
            event_actor_name = (
                event_actor_account.full_name
                or event_actor_account.username
                or (participant_id if participant_id == user_id else user_id)
            ) if event_actor_account is not None else (participant_id if participant_id == user_id else user_id)
            activity_event = {
                "action": "member_left" if participant_id == user_id else "member_removed",
                "actorId": event_actor_id,
                "actorAccountId": participant_id if participant_id == user_id else user_id,
                "actorName": event_actor_name,
                "targets": [] if participant_id == user_id else [{
                    "id": target_uid or participant_id,
                    "accountId": participant_id,
                    "name": (
                        target_account.full_name
                        or target_account.username
                        or participant_id
                    ) if target_account is not None else participant_id,
                }],
                **({
                    "replacementId": replacement.participant_id,
                    "replacementName": replacement_name or replacement.participant_id,
                } if replacement is not None else {}),
            }
            await _publish_group_activity_events(item, [activity_event])
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
