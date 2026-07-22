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
    SecurityAuditLog,
)
from application.server import app
from application.services.auth_service import (
    AuthError,
    clear_auth_cookie,
    clear_login_failures,
    hash_password,
    issue_access_token,
    revoke_request_token,
    login_rate_limited,
    record_login_failure,
    set_auth_cookie,
    tinode_change_password,
    tinode_create_account,
    tinode_login,
    verify_password,
    current_user as current_jwt_user,
)


def _public_account(account):
    return {
        "id": str(account.id),
        "username": account.username,
        "email": account.email or "",
        "name": account.full_name,
        "role": account.role or "member",
        "department": account.department or "",
        "title": account.title or "",
        "avatar": account.avatar or "",
        "tenantId": account.tenant_id,
        "tenant_id": account.tenant_id,
        "tinodeUid": account.tinode_uid,
        "active": bool(account.active),
        "online": False,
    }


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
    account = ManagementAccount.query.filter(
        ManagementAccount.id == _user_id(current_user),
        ManagementAccount.tenant_id == tenant_id,
        ManagementAccount.active.is_(True),
    ).first()
    if account is None:
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


def _forbidden_error():
    return json({"error_code": "FORBIDDEN", "error_message": "Administrator permission is required."}, status=403)


def _account_by_id(tenant_id, user_id):
    return ManagementAccount.query.filter(
        ManagementAccount.tenant_id == tenant_id,
        ManagementAccount.id == str(user_id),
        ManagementAccount.active.is_(True),
    ).first()


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
    tenant_id = str(body.get("tenant_id") or app.config.get("CHATBOT_DEFAULT_TENANT") or "").strip()
    ip_address = str(getattr(request, "ip", "") or "")[:100]
    if login_rate_limited(tenant_id, identity, ip_address):
        return json({"error_code": "LOGIN_RATE_LIMITED", "error_message": "Too many failed login attempts. Try again later."}, status=429)
    try:
        account = ManagementAccount.query.filter(
            ManagementAccount.tenant_id == tenant_id,
            ManagementAccount.active.is_(True),
            or_(
                func.lower(ManagementAccount.username) == identity,
                func.lower(ManagementAccount.email) == identity,
            ),
        ).first()
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
            "user": _public_account(account),
            "tinode_auth": {
                "username": account.tinode_username,
                "uid": account.tinode_uid,
                "token": tinode_auth.get("token"),
                "expires": tinode_auth.get("expires"),
            },
        })
        _audit(request, "AUTH_LOGIN", True, tenant_id=tenant_id, user_id=str(account.id))
        return set_auth_cookie(response, token)
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
        return _auth_error()
    account = _account_by_id(tenant_id, _user_id(current_user))
    if account is None:
        return _auth_error()
    return json({"user": _public_account(account)})


@app.route('/api/v1/auth/logout', methods=['POST'])
async def management_logout(request):
    current_user, tenant_id = _identity(request)
    if current_user is not None:
        _audit(request, "AUTH_LOGOUT", True, tenant_id=tenant_id, user_id=_user_id(current_user))
    revoke_request_token(request)
    return clear_auth_cookie(json({"logged_out": True}))


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
    account = _account_by_id(tenant_id, _user_id(current_user))
    if account is None or not verify_password(current_password, account.password_hash):
        _audit(request, "AUTH_PASSWORD_CHANGE", False, tenant_id=tenant_id, user_id=_user_id(current_user))
        return json({"error_code": "PASSWORD_INVALID", "error_message": "Current password is invalid."}, status=401)
    try:
        await tinode_change_password(account.tinode_username, current_password, new_password)
        account.password_hash = hash_password(new_password)
        properties = dict(account.properties or {})
        properties["must_change_password"] = False
        account.properties = properties
        account.updated_at = int(time.time())
        db.session.commit()
        _audit(request, "AUTH_PASSWORD_CHANGE", True, tenant_id=tenant_id, user_id=str(account.id))
        return json({"changed": True})
    except AuthError as error:
        db.session.rollback()
        _audit(request, "AUTH_PASSWORD_CHANGE_TINODE", False, tenant_id=tenant_id, user_id=str(account.id))
        return json({"error_code": "TINODE_AUTH_FAILED", "error_message": str(error)}, status=error.status_code)


@app.route('/api/v1/chat/users', methods=['GET'])
async def management_users(request):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    query_text = str(request.args.get("q") or "").strip().lower()
    exclude_user_id = str(request.args.get("exclude_user_id") or "")
    query = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == tenant_id,
        ManagementAccount.active.is_(True),
    )
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
        tinode_auth = await tinode_create_account(username, password, full_name)
        now = int(time.time())
        account = ManagementAccount(
            id=str(body.get("id") or "usr-{}".format(uuid.uuid4().hex)),
            tenant_id=tenant_id,
            username=username,
            email=email,
            password_hash=hash_password(password),
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
    role = str(body.get("role") or account.role or "member").strip().lower()
    if role not in ("member", "admin"):
        return json({"error_code": "PARAM_ERROR", "error_message": "Role must be member or admin."}, status=400)
    if str(account.id) == _user_id(current_user) and body.get("active") is False:
        return json({"error_code": "PARAM_ERROR", "error_message": "You cannot disable your own account."}, status=400)
    if "name" in body or "full_name" in body:
        account.full_name = str(body.get("name") or body.get("full_name") or "").strip() or account.full_name
    if "email" in body:
        account.email = str(body.get("email") or "").strip().lower() or None
    if "department" in body:
        account.department = str(body.get("department") or "")
    if "title" in body:
        account.title = str(body.get("title") or "")
    if "avatar" in body:
        account.avatar = str(body.get("avatar") or "")
    if "active" in body:
        account.active = bool(body.get("active"))
    account.role = role
    account.updated_at = int(time.time())
    try:
        db.session.commit()
        _audit(request, "ACCOUNT_UPDATED", True, tenant_id=tenant_id, user_id=_user_id(current_user), properties={"account_id": account.id})
        return json(_public_account(account))
    except Exception:
        db.session.rollback()
        return json({"error_code": "ACCOUNT_UPDATE_FAILED", "error_message": "The account update conflicted with existing data."}, status=409)


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
async def conversation_list(request):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return _auth_error()
    user_id = _user_id(current_user)
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
    return json({"objects": [_serialize_conversation(item) for item in query.all()]})


@app.route('/api/v1/conversation', methods=['POST'])
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
