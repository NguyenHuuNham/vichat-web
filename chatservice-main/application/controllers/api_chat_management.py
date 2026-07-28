import datetime
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
from application.services.auth_service import (
    AuthError,
    build_password_reset_url,
    clear_auth_cookie,
    clear_login_failures,
    create_password_reset_token,
    hash_password,
    issue_access_token,
    password_reset_rate_limited,
    password_reset_token_hash,
    record_password_reset_request,
    revoke_request_token,
    login_rate_limited,
    management_session_requested,
    record_login_failure,
    send_password_reset_email,
    set_auth_cookie,
    tinode_admin_reset_password,
    tinode_change_password,
    tinode_create_account,
    tinode_login,
    token_from_request,
    verify_password,
    current_user as current_jwt_user,
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


def _public_account(account, tenant=None):
    properties = account.properties or {}
    full_name = account.full_name or account.username
    tenant_payload = _public_tenant(tenant)
    return {
        "id": str(account.id),
        "uid": str(account.id),
        "userId": str(account.id),
        "user_id": str(account.id),
        "username": account.username,
        "email": account.email or "",
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
        app.logger.warning("Could not write security audit event %s: %s", event_name, error)


def _serialize_conversation(item):
    participants = ConversationParticipant.query.filter(
        ConversationParticipant.conversation_id == item.id,
        ConversationParticipant.deleted.is_(False),
        ConversationParticipant.active.is_(True),
    ).all()
    properties = item.properties or {}
    return {
        "id": str(item.id),
        "conversation_no": item.conversation_no,
        "tenant_id": item.tenant_id,
        "tinode_topic": item.tinode_topic,
        "subject": item.subject,
        "status": item.status,
        "priority": item.priority,
        "last_message_at": item.last_message_at,
        "updated_at": item.updated_at,
        "properties": properties,
        "isGroup": bool(properties.get("is_group")),
        "participantIds": [participant.participant_id for participant in participants],
        "members": properties.get("members") or [],
    }


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


@app.route('/login', methods=['POST'])
async def management_login(request):
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
        app.logger.exception("Management account lookup failed: %s", error)
        return json({
            "error_code": "AUTH_STORAGE_ERROR",
            "error_message": "The account database is temporarily unavailable.",
        }, status=503)
    if account is None or not verify_password(password, account.password_hash):
        record_login_failure(tenant_id, identity, ip_address)
        _audit(request, "AUTH_LOGIN", False, tenant_id=tenant_id, properties={"identity": identity})
        return json({"error_code": "LOGIN_FAILED", "error_message": "Invalid username or password."}, status=401)
    try:
        clear_login_failures(tenant_id, identity, ip_address)
        tinode_auth = await tinode_login(account.tinode_username, password)
        account.tinode_uid = tinode_auth.get("uid") or account.tinode_uid
        account.last_login_at = int(time.time())
        account.updated_at = int(time.time())
        db.session.commit()
        token = issue_access_token(account)
        response = json({
            "user": _public_account(account, tenant),
            "tenant": _public_tenant(tenant),
            "tenant_id": account.tenant_id,
            "tinode_auth": {
                "username": account.tinode_username,
                "uid": account.tinode_uid,
                "token": tinode_auth.get("token"),
                "expires": tinode_auth.get("expires"),
            },
        })
        _audit(request, "AUTH_LOGIN", True, tenant_id=tenant_id, user_id=str(account.id))
        return set_auth_cookie(response, token, request)
    except AuthError as error:
        db.session.rollback()
        _audit(request, "AUTH_LOGIN_TINODE", False, tenant_id=tenant_id, user_id=str(account.id))
        return json({"error_code": "TINODE_AUTH_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        app.logger.exception("Management login failed after account verification: %s", error)
        _audit(request, "AUTH_LOGIN_SERVICE", False, tenant_id=tenant_id, user_id=str(account.id))
        return json({
            "error_code": "AUTH_SERVICE_ERROR",
            "error_message": "The internal authentication service is temporarily unavailable.",
        }, status=503)


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
    response = json({
        "user": _public_account(account, tenant),
        "tenant": _public_tenant(tenant),
        "tenant_id": tenant_id,
    })
    if management_session_requested(request):
        return set_auth_cookie(response, token_from_request(request), request)
    return response


@app.route('/api/v1/auth/logout', methods=['POST'])
async def management_logout(request):
    current_user, tenant_id = _identity(request)
    account = _account_by_id(tenant_id, _user_id(current_user)) if current_user is not None else None
    tenant = _tenant_by_id(tenant_id) if tenant_id else None
    if current_user is not None:
        _audit(request, "AUTH_LOGOUT", True, tenant_id=tenant_id, user_id=_user_id(current_user))
    revoke_request_token(request)
    return clear_auth_cookie(json({
        "logged_out": True,
        "user": _public_account(account, tenant) if account is not None else None,
        "tenant": _public_tenant(tenant),
        "tenant_id": tenant_id,
    }), request)


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
    return json({
        "status": "ok",
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
    if account is None or not account.email:
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
                app.logger.warning("Password reset email failed for %s: %s", account.id, error)
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
        app.logger.exception("Password reset request failed: %s", error)
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
    try:
        await tinode_admin_reset_password(account.tinode_username, account.tinode_uid, new_password)
        account.password_hash = new_password_hash
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
        _audit(request, "AUTH_PASSWORD_RESET_TINODE", False, tenant_id=account.tenant_id, user_id=str(account.id))
        return json({"error_code": "TINODE_PASSWORD_RESET_FAILED", "error_message": str(error)}, status=error.status_code)
    except Exception as error:
        db.session.rollback()
        app.logger.exception("Password reset failed: %s", error)
        _audit(request, "AUTH_PASSWORD_RESET", False, tenant_id=account.tenant_id, user_id=str(account.id))
        return json({"error_code": "PASSWORD_RESET_FAILED", "error_message": "Password reset is temporarily unavailable."}, status=503)


@app.route('/api/v1/auth/password', methods=['POST'])
async def management_change_password(request):
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
    if account is None or not verify_password(current_password, account.password_hash):
        _audit(request, "AUTH_PASSWORD_CHANGE", False, tenant_id=tenant_id, user_id=_user_id(current_user))
        return json({"error_code": "PASSWORD_INVALID", "error_message": "Current password is invalid."}, status=401)
    try:
        await tinode_change_password(account.tinode_username, current_password, new_password)
        account.password_hash = new_password_hash
        properties = _bump_auth_version(account)
        properties["must_change_password"] = False
        properties["password_changed_at"] = int(time.time())
        account.properties = properties
        account.updated_at = int(time.time())
        revoke_request_token(request)
        db.session.commit()
        _audit(request, "AUTH_PASSWORD_CHANGE", True, tenant_id=tenant_id, user_id=str(account.id))
        return clear_auth_cookie(json({"changed": True}), request)
    except AuthError as error:
        db.session.rollback()
        _audit(request, "AUTH_PASSWORD_CHANGE_TINODE", False, tenant_id=tenant_id, user_id=str(account.id))
        return json({"error_code": "TINODE_AUTH_FAILED", "error_message": str(error)}, status=error.status_code)


@app.route('/api/v1/auth/profile', methods=['PUT'])
async def management_update_profile(request):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    account = _account_by_id(tenant_id, _user_id(current_user))
    if account is None:
        return _auth_error()
    body = request.json or {}
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


@app.route('/api/v1/chat/users', methods=['GET'])
async def management_users(request):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    query_text = str(request.args.get("q") or "").strip().lower()
    exclude_user_id = str(request.args.get("exclude_user_id") or "")
    include_inactive = _is_admin(current_user) and str(
        request.args.get("include_inactive") or ""
    ).lower() in ("1", "true", "yes")
    query = ManagementAccount.query.filter(ManagementAccount.tenant_id == tenant_id)
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
    return json({"objects": [_public_account(account) for account in accounts]})


@app.route('/api/v1/chat/users', methods=['POST'])
async def management_user_create(request):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    if not _is_admin(current_user):
        return _forbidden_error()
    body = request.json or {}
    username = str(body.get("username") or "").strip().lower()
    password = str(body.get("password") or "")
    full_name = str(body.get("name") or body.get("full_name") or "").strip()
    email = str(body.get("email") or "").strip().lower() or None
    role = str(body.get("role") or "member").strip().lower()
    if not username or not full_name:
        return json({"error_code": "PARAM_ERROR", "error_message": "Username and full name are required."}, status=400)
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
        tinode_auth = await tinode_create_account(username, password, full_name)
        now = int(time.time())
        account = ManagementAccount(
            id=str(body.get("id") or "usr-{}".format(uuid.uuid4().hex)),
            tenant_id=tenant_id,
            username=username,
            email=email,
            password_hash=password_hash,
            full_name=full_name,
            role=role,
            department=str(body.get("department") or ""),
            title=str(body.get("title") or ""),
            avatar=str(body.get("avatar") or ""),
            tinode_username=username,
            tinode_uid=tinode_auth.get("uid"),
            active=True,
            created_at=now,
            updated_at=now,
            properties={},
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
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    if not _is_admin(current_user):
        return _forbidden_error()
    account = ManagementAccount.query.filter(
        ManagementAccount.id == str(account_id),
        ManagementAccount.tenant_id == tenant_id,
    ).first()
    if account is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Account not found in this tenant."}, status=404)
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
        db.session.commit()
        _audit(request, "ACCOUNT_UPDATED", True, tenant_id=tenant_id, user_id=_user_id(current_user), properties={"account_id": account.id})
        return json(_public_account(account))
    except Exception:
        db.session.rollback()
        return json({"error_code": "ACCOUNT_UPDATE_FAILED", "error_message": "The account update conflicted with existing data."}, status=409)


@app.route('/api/v1/chat/users/<account_id>/revoke-session', methods=['POST'])
async def management_user_revoke_session(request, account_id):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
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
        db.session.commit()
        _audit(request, "ACCOUNT_SESSION_REVOKED", True, tenant_id=tenant_id, user_id=_user_id(current_user), properties={"account_id": account.id})
        return json({"revoked": True, "user": _public_account(account)})
    except Exception:
        db.session.rollback()
        return json({"error_code": "SESSION_REVOKE_FAILED", "error_message": "Could not revoke the account sessions."}, status=500)


@app.route('/api/v1/chat/users/<account_id>/reset-password', methods=['POST'])
async def management_user_reset_password(request, account_id):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    if not _is_admin(current_user):
        return _forbidden_error()
    if str(account_id) == _user_id(current_user):
        return json({"error_code": "PARAM_ERROR", "error_message": "Use the profile password form for your own account."}, status=400)
    account = ManagementAccount.query.filter(
        ManagementAccount.id == str(account_id),
        ManagementAccount.tenant_id == tenant_id,
    ).first()
    if account is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Account not found in this tenant."}, status=404)
    new_password = str((request.json or {}).get("new_password") or "")
    try:
        new_password_hash = hash_password(new_password)
        await tinode_admin_reset_password(account.tinode_username, account.tinode_uid, new_password)
        account.password_hash = new_password_hash
        properties = _bump_auth_version(account)
        properties["must_change_password"] = True
        properties["password_reset_by_admin_at"] = int(time.time())
        account.properties = properties
        account.updated_at = int(time.time())
        db.session.commit()
        _audit(request, "ACCOUNT_PASSWORD_RESET_BY_ADMIN", True, tenant_id=tenant_id, user_id=_user_id(current_user), properties={"account_id": account.id})
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
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
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
    ).order_by(Conversation.updated_at.desc())
    return json({"objects": [_serialize_conversation(item) for item in query.limit(limit).all()]})


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
    properties = body.get("properties") if isinstance(body.get("properties"), dict) else {}
    item = Conversation(
        tenant_id=tenant_id,
        conversation_no="conv-{}".format(uuid.uuid4().hex),
        tinode_topic=body.get("tinode_topic"),
        subject=str(body.get("subject") or body.get("name") or "Conversation").strip(),
        source="internal",
        status="OPEN",
        priority="NORMAL",
        last_message_at=int(time.time()),
        properties={**properties, "is_group": bool(body.get("is_group", properties.get("is_group", False)))},
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
        return json(_serialize_conversation(item), status=201)
    except Exception as error:
        db.session.rollback()
        return json({"error_code": "CONVERSATION_ERROR", "error_message": str(error)}, status=500)


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
    item = Conversation.query.join(
        ConversationParticipant,
        ConversationParticipant.conversation_id == Conversation.id,
    ).filter(
        Conversation.id == conversation_uuid,
        Conversation.tenant_id == tenant_id,
        Conversation.deleted.is_(False),
        ConversationParticipant.tenant_id == tenant_id,
        ConversationParticipant.participant_id == user_id,
        ConversationParticipant.active.is_(True),
    ).first()
    if item is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Conversation not found."}, status=404)
    topic_name = str((request.json or {}).get("tinode_topic") or "").strip()
    if not topic_name:
        return json({"error_code": "PARAM_ERROR", "error_message": "Tinode topic is required."}, status=400)
    item.tinode_topic = topic_name
    db.session.commit()
    return json(_serialize_conversation(item))
