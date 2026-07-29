import logging
import uuid

from gatco.response import json

from application.database import db
from application.models.models import ChatbotMessage, Conversation, ConversationParticipant, ManagementAccount
from application.server import app
from application.services.auth_service import current_user as current_jwt_user
from application.services import (
    ChatbotService,
    ChatbotServiceError,
    ChatManagerService,
    KnowledgeService,
    KnowledgeServiceError,
)


logger = logging.getLogger(__name__)


chatbot_service = ChatbotService(app)
knowledge_service = KnowledgeService(app)
chat_manager_service = ChatManagerService(app, chatbot_service, knowledge_service)


def _current_user(request):
    try:
        current_user = current_jwt_user(request)
        if current_user is None:
            return None
        tenant_id = str(current_user.get("tenant_id") or current_user.get("current_tenant_id") or "")
        user_id = str(current_user.get("id") or current_user.get("uid") or "")
        account = ManagementAccount.query.filter(
            ManagementAccount.id == user_id,
            ManagementAccount.tenant_id == tenant_id,
            ManagementAccount.active.is_(True),
        ).first()
        if account is None:
            return None
        return {
            **current_user,
            "username": account.username,
            "user_name": account.username,
            "role": account.role or "member",
            "tenant_id": account.tenant_id,
            "current_tenant_id": account.tenant_id,
            "department": account.department or "",
            "tinodeUid": account.tinode_uid,
        }
    except Exception as error:
        logger.warning("Could not resolve current chatbot user: %s", error)
        return None


def _tenant_id(request, current_user=None, body=None):
    current_user = current_user or {}
    body = body or {}
    return str(
        current_user.get("current_tenant_id")
        or current_user.get("tenant_id")
        or request.headers.get("X-Tenant-Id")
        or request.args.get("tenant_id")
        or body.get("tenant_id")
        or app.config.get("CHATBOT_DEFAULT_TENANT", "songhong")
    )


def _internal_request(request):
    expected = app.config.get("INTERNAL_ACCESS_TOKEN")
    supplied = request.headers.get("X-INTERNAL-TOKEN") or request.headers.get("access-token")
    return bool(expected and supplied and supplied == expected)


def _knowledge_identity(request, body=None):
    current_user = _current_user(request)
    body = body or {}
    if app.config.get("CHATBOT_KNOWLEDGE_REQUIRE_AUTH", True) and current_user is None and not _internal_request(request):
        return None, None
    return current_user or {}, _tenant_id(request, current_user, body)


def _is_knowledge_admin(request, current_user=None):
    if _internal_request(request):
        return True

    authenticated_user = _current_user(request) or current_user
    if authenticated_user is None:
        return False
    role = str(authenticated_user.get("role") or authenticated_user.get("current_tenant_role") or "").lower()
    return role in ("admin", "superadmin", "owner")


def _knowledge_admin_error(request, current_user=None):
    if _is_knowledge_admin(request, current_user):
        return None
    return json({
        "error_code": "FORBIDDEN",
        "error_message": "Chi quan tri vien duoc quan ly kho tri thuc.",
    }, status=403)


def _chatbot_identity(request, body=None):
    body = body or {}
    current_user = _current_user(request)
    return current_user, _tenant_id(request, current_user, body)


def _user_ref(user):
    user = user or {}
    return str(user.get("id") or user.get("uid") or user.get("user_name") or user.get("username") or "demo-user")


def _conversation_participants(tenant_id, conversation_ref, current_user):
    """Resolve access recipients from management data, never from a browser list alone."""
    current_user_id = _user_ref(current_user)
    allowed = {current_user_id}
    try:
        conversation_id = uuid.UUID(str(conversation_ref))
    except (ValueError, TypeError, AttributeError):
        conversation_id = None
    if conversation_id is not None:
        conversation = Conversation.query.filter(
            Conversation.id == conversation_id,
            Conversation.tenant_id == tenant_id,
            Conversation.deleted.is_(False),
        ).first()
        if conversation is None:
            raise KnowledgeServiceError("Conversation not found in this tenant.", 404)
        rows = ConversationParticipant.query.filter(
            ConversationParticipant.tenant_id == tenant_id,
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.active.is_(True),
            ConversationParticipant.deleted.is_(False),
        ).all()
        participant_ids = {str(row.participant_id) for row in rows if row.participant_id}
        if current_user_id not in participant_ids:
            raise KnowledgeServiceError("You are not a participant in this conversation.", 403)
        allowed.update(participant_ids)
    return sorted(value for value in allowed if value and value != "demo-user")


def _serialize_history_message(item):
    return {
        "id": str(item.id),
        "role": item.role,
        "content": item.content,
        "message_ref": item.message_ref,
        "created_at": item.created_at,
        "properties": item.properties or {},
    }


def _store_history_message(tenant_id, conversation_ref, user_ref, role, content, message_ref=None, properties=None):
    if message_ref:
        existing = ChatbotMessage.query.filter(
            ChatbotMessage.tenant_id == tenant_id,
            ChatbotMessage.conversation_ref == conversation_ref,
            ChatbotMessage.user_ref == user_ref,
            ChatbotMessage.message_ref == message_ref,
            ChatbotMessage.deleted.is_(False),
        ).first()
        if existing is not None:
            return existing
    item = ChatbotMessage(
        tenant_id=tenant_id,
        conversation_ref=conversation_ref,
        user_ref=user_ref,
        role=role,
        content=str(content or "")[:12000],
        message_ref=message_ref,
        properties=properties or {},
    )
    db.session.add(item)
    db.session.commit()
    return item


def _valid_uuid(value, field_name):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise KnowledgeServiceError("{} không hợp lệ.".format(field_name))


def _error_response(error, code="KNOWLEDGE_ERROR"):
    return json({"error_code": code, "error_message": str(error)}, status=getattr(error, "status_code", 500))


@app.route('/api/v1/chatbot/health', methods=['GET'])
async def chatbot_health(request):
    return json({
        "enabled": chatbot_service.enabled,
        "provider": app.config.get("CHATBOT_PROVIDER", "openai-compatible"),
        "model": app.config.get("CHATBOT_MODEL"),
        "knowledge_enabled": True,
        "knowledge_only": app.config.get("CHATBOT_KNOWLEDGE_ONLY", True),
    })


@app.route('/api/v1/chatbot/message', methods=['POST'])
async def chatbot_message(request):
    body = request.json or {}
    current_user, tenant_id = _chatbot_identity(request, body)
    if app.config.get("CHATBOT_REQUIRE_AUTH", True) and current_user is None:
        return json({"error_code": "SESSION_EXPIRED", "error_message": "Phiên làm việc hết hạn"}, status=401)
    message = body.get("message")
    if not isinstance(message, str) or not message.strip():
        return json({"error_code": "PARAM_ERROR", "error_message": "Tin nhắn không được để trống."}, status=400)
    message = message.strip()
    max_length = app.config.get("CHATBOT_MAX_INPUT_LENGTH", 4000)
    if len(message) > max_length:
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "Tin nhắn vượt quá {} ký tự.".format(max_length),
        }, status=400)

    knowledge_base_id = body.get("knowledge_base_id")
    conversation_ref = str(body.get("conversation_id") or "bot-songhong")
    user_ref = _user_ref(current_user)
    message_ref = str(body.get("message_id") or "") or None
    try:
        _store_history_message(
            tenant_id,
            conversation_ref,
            user_ref,
            "user",
            message,
            message_ref=message_ref,
        )
        if knowledge_base_id:
            knowledge_base_id = _valid_uuid(knowledge_base_id, "knowledge_base_id")
        result = await chat_manager_service.reply(
            message=message,
            user=current_user or body.get("user") or {},
            conversation_id=conversation_ref,
            tenant_id=tenant_id,
            knowledge_base_id=knowledge_base_id,
            history=body.get("history") if isinstance(body.get("history"), list) else [],
        )
        _store_history_message(
            tenant_id,
            conversation_ref,
            user_ref,
            "assistant",
            result.get("reply") or "",
            message_ref="{}:assistant".format(message_ref or uuid.uuid4()),
            properties={"provider": result.get("provider"), "model": result.get("model")},
        )
        return json(result)
    except KnowledgeServiceError as error:
        return _error_response(error)
    except ChatbotServiceError as error:
        return _error_response(error, "CHATBOT_ERROR")


@app.route('/api/v1/chatbot/history', methods=['GET'])
async def chatbot_history(request):
    current_user, tenant_id = _chatbot_identity(request)
    if current_user is None:
        return json({"error_code": "SESSION_EXPIRED", "error_message": "Phiên làm việc hết hạn"}, status=401)
    conversation_ref = str(request.args.get("conversation_id") or "bot-songhong")
    limit = min(max(int(request.args.get("limit", 200)), 1), 500)
    items = ChatbotMessage.query.filter(
        ChatbotMessage.tenant_id == tenant_id,
        ChatbotMessage.conversation_ref == conversation_ref,
        ChatbotMessage.user_ref == _user_ref(current_user),
        ChatbotMessage.deleted.is_(False),
    ).order_by(ChatbotMessage.created_at.desc()).limit(limit).all()
    items.reverse()
    return json({"objects": [_serialize_history_message(item) for item in items]})


@app.route('/api/v1/chatbot/history', methods=['DELETE'])
async def chatbot_history_delete(request):
    body = request.json or {}
    current_user, tenant_id = _chatbot_identity(request, body)
    if current_user is None:
        return json({"error_code": "SESSION_EXPIRED", "error_message": "Phiên làm việc hết hạn"}, status=401)
    conversation_ref = str(body.get("conversation_id") or "bot-songhong")
    for item in ChatbotMessage.query.filter(
        ChatbotMessage.tenant_id == tenant_id,
        ChatbotMessage.conversation_ref == conversation_ref,
        ChatbotMessage.user_ref == _user_ref(current_user),
        ChatbotMessage.deleted.is_(False),
    ).all():
        item.deleted = True
    db.session.commit()
    return json({"deleted": True})


@app.route('/api/v1/chatbot/knowledge/chat-events', methods=['POST'])
async def knowledge_chat_event(request):
    body = request.json or {}
    current_user, tenant_id = _chatbot_identity(request, body)
    if current_user is None:
        return json({"error_code": "SESSION_EXPIRED", "error_message": "Phiên làm việc hết hạn"}, status=401)
    content = str(body.get("content") or body.get("message") or "").strip()
    if not content:
        return json({"error_code": "PARAM_ERROR", "error_message": "Nội dung chat đang trống."}, status=400)
    try:
        participant_ids = _conversation_participants(
            tenant_id,
            body.get("conversation_id"),
            current_user,
        )
        result = knowledge_service.ingest_chat_message(
            tenant_id,
            body.get("conversation_id"),
            body.get("message_id"),
            body.get("sender_id") or _user_ref(current_user),
            content,
            participant_ids=participant_ids,
        )
        return json(result, status=201)
    except Exception as error:
        return _error_response(error)


@app.route('/api/v1/chatbot/knowledge/chat-files', methods=['POST'])
async def knowledge_chat_file(request):
    current_user, tenant_id = _chatbot_identity(request, request.form or {})
    if current_user is None:
        return json({"error_code": "SESSION_EXPIRED", "error_message": "Phiên làm việc hết hạn"}, status=401)
    try:
        upload = request.files.get("file") if request.files else None
        if upload is None:
            raise KnowledgeServiceError("Vui lòng chọn tệp chat cần lập chỉ mục.")
        participant_ids = _conversation_participants(
            tenant_id,
            request.form.get("conversation_id"),
            current_user,
        )
        content, mime_type = knowledge_service.extract_file(upload.name, upload.type, upload.body)
        knowledge_base = knowledge_service.get_or_create_base(
            tenant_id,
            "chat-derived",
            "Kiến thức từ hội thoại",
            "Tin nhắn và tệp chat được lập chỉ mục tự động theo quyền thành viên cuộc trò chuyện.",
            properties={"managed": True, "source": "chat"},
        )
        result = knowledge_service.ingest_text(
            tenant_id,
            knowledge_base.id,
            request.form.get("title") or upload.name,
            content,
            file_name=upload.name,
            mime_type=mime_type,
            source_type="CHAT_FILE",
            source_url=request.form.get("source_url"),
            uploaded_by=_user_ref(current_user),
            properties={
                "conversation_id": str(request.form.get("conversation_id") or ""),
                "message_id": str(request.form.get("message_id") or ""),
                "allowed_user_ids": participant_ids,
            },
        )
        return json(result, status=201)
    except Exception as error:
        return _error_response(error)


@app.route('/api/v1/chatbot/knowledge/bases', methods=['GET'])
async def knowledge_bases_list(request):
    current_user, tenant_id = _knowledge_identity(request)
    if tenant_id is None:
        return json({"error_code": "SESSION_EXPIRED", "error_message": "Phiên làm việc hết hạn"}, status=401)
    forbidden = _knowledge_admin_error(request, current_user)
    if forbidden is not None:
        return forbidden
    try:
        return json({"objects": knowledge_service.list_bases(tenant_id)})
    except Exception as error:
        return _error_response(error)


@app.route('/api/v1/chatbot/knowledge/bases', methods=['POST'])
async def knowledge_bases_create(request):
    body = request.json or {}
    current_user, tenant_id = _knowledge_identity(request, body)
    if tenant_id is None:
        return json({"error_code": "SESSION_EXPIRED", "error_message": "Phiên làm việc hết hạn"}, status=401)
    forbidden = _knowledge_admin_error(request, current_user)
    if forbidden is not None:
        return forbidden
    try:
        return json(knowledge_service.create_base(tenant_id, body), status=201)
    except Exception as error:
        return _error_response(error)


@app.route('/api/v1/chatbot/knowledge/documents', methods=['GET'])
async def knowledge_documents_list(request):
    current_user, tenant_id = _knowledge_identity(request)
    if tenant_id is None:
        return json({"error_code": "SESSION_EXPIRED", "error_message": "Phiên làm việc hết hạn"}, status=401)
    forbidden = _knowledge_admin_error(request, current_user)
    if forbidden is not None:
        return forbidden
    try:
        base_id = request.args.get("knowledge_base_id")
        if base_id:
            base_id = _valid_uuid(base_id, "knowledge_base_id")
        return json({"objects": knowledge_service.list_documents(tenant_id, base_id)})
    except Exception as error:
        return _error_response(error)


@app.route('/api/v1/chatbot/knowledge/documents', methods=['POST'])
async def knowledge_documents_create(request):
    body = request.json or {}
    current_user, tenant_id = _knowledge_identity(request, body)
    if tenant_id is None:
        return json({"error_code": "SESSION_EXPIRED", "error_message": "Phiên làm việc hết hạn"}, status=401)
    forbidden = _knowledge_admin_error(request, current_user)
    if forbidden is not None:
        return forbidden
    try:
        base_id = _valid_uuid(body.get("knowledge_base_id"), "knowledge_base_id")
        uploader = current_user.get("id") or current_user.get("uid") or current_user.get("user_name")
        result = knowledge_service.ingest_text(
            tenant_id,
            base_id,
            body.get("title"),
            body.get("content"),
            source_type=body.get("source_type") or "TEXT",
            source_url=body.get("source_url"),
            uploaded_by=str(uploader or "internal-api"),
            properties=body.get("properties") or {},
        )
        return json(result, status=201)
    except Exception as error:
        return _error_response(error)


@app.route('/api/v1/chatbot/knowledge/documents/upload', methods=['POST'])
async def knowledge_documents_upload(request):
    current_user, tenant_id = _knowledge_identity(request, request.form or {})
    if tenant_id is None:
        return json({"error_code": "SESSION_EXPIRED", "error_message": "Phiên làm việc hết hạn"}, status=401)
    forbidden = _knowledge_admin_error(request, current_user)
    if forbidden is not None:
        return forbidden
    try:
        upload = request.files.get("file") if request.files else None
        if upload is None:
            raise KnowledgeServiceError("Vui lòng chọn tệp cần tải lên.")
        base_id = _valid_uuid(request.form.get("knowledge_base_id"), "knowledge_base_id")
        title = request.form.get("title") or upload.name
        content, mime_type = knowledge_service.extract_file(upload.name, upload.type, upload.body)
        uploader = current_user.get("id") or current_user.get("uid") or current_user.get("user_name")
        result = knowledge_service.ingest_text(
            tenant_id,
            base_id,
            title,
            content,
            file_name=upload.name,
            mime_type=mime_type,
            source_type="FILE",
            uploaded_by=str(uploader or "internal-api"),
        )
        return json(result, status=201)
    except Exception as error:
        return _error_response(error)


@app.route('/api/v1/chatbot/knowledge/documents/<document_id>', methods=['DELETE'])
async def knowledge_documents_delete(request, document_id):
    current_user, tenant_id = _knowledge_identity(request)
    if tenant_id is None:
        return json({"error_code": "SESSION_EXPIRED", "error_message": "Phiên làm việc hết hạn"}, status=401)
    forbidden = _knowledge_admin_error(request, current_user)
    if forbidden is not None:
        return forbidden
    try:
        knowledge_service.delete_document(tenant_id, _valid_uuid(document_id, "document_id"))
        return json({"deleted": True})
    except Exception as error:
        return _error_response(error)


@app.route('/api/v1/chatbot/knowledge/search', methods=['POST'])
async def knowledge_search(request):
    body = request.json or {}
    current_user, tenant_id = _knowledge_identity(request, body)
    if tenant_id is None:
        return json({"error_code": "SESSION_EXPIRED", "error_message": "Phiên làm việc hết hạn"}, status=401)
    try:
        query_text = str(body.get("query") or "").strip()
        if not query_text:
            raise KnowledgeServiceError("Nội dung tìm kiếm không được để trống.")
        base_id = body.get("knowledge_base_id")
        if base_id:
            base_id = _valid_uuid(base_id, "knowledge_base_id")
        department_id = current_user.get("department_id") or current_user.get("organization_id")
        return json({"objects": knowledge_service.retrieve(
            query_text,
            tenant_id,
            knowledge_base_id=base_id,
            department_id=department_id,
            user_ids=[current_user.get(name) for name in (
                "id", "uid", "tinodeUid", "tinode_uid", "user_name", "username", "email",
            ) if current_user.get(name)],
            limit=body.get("limit"),
        )})
    except Exception as error:
        return _error_response(error)
