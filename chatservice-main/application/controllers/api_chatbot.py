import hashlib
import hmac
import logging
import uuid

from gatco.response import json

from application.database import db
from application.models.models import ChatbotMessage, Conversation, ConversationParticipant, ManagementAccount
from application.server import app
from application.services.auth_service import current_user as current_jwt_user
from application.services.tinode_chatbot_service import (
    ensure_tinode_chatbot_auth,
    tinode_chatbot_enabled,
    tinode_chatbot_public_config,
)
from application.services import (
    ChatbotService,
    ChatbotServiceError,
    ChatManagerService,
    KnowledgeService,
    KnowledgeServiceError,
)


logger = logging.getLogger(__name__)


DEFAULT_CHATBOT_CONVERSATION_REF = "vichat-ai"
LEGACY_CHATBOT_CONVERSATION_REFS = ("bot-songhong",)


chatbot_service = ChatbotService(app)
knowledge_service = KnowledgeService(app)
chat_manager_service = ChatManagerService(app, chatbot_service, knowledge_service)


def _tinode_webhook_request(request):
    expected = str(app.config.get("TINODE_CHATBOT_WEBHOOK_KEY") or "").strip()
    supplied = str(request.headers.get("X-Vichat-Chatbot-Webhook") or "").strip()
    return bool(expected and supplied and hmac.compare_digest(expected, supplied))


def _active_tinode_account(sender_uid):
    matches = ManagementAccount.query.filter(
        ManagementAccount.tinode_uid == sender_uid,
    ).all()
    return matches[0] if len(matches) == 1 and matches[0].active else None


def _tinode_message_ref(topic, sequence):
    topic_digest = hashlib.sha256(str(topic or "").encode("utf-8")).hexdigest()[:32]
    return "tinode:{}:{}".format(topic_digest, int(sequence))


def _tinode_chatbot_user(account):
    return {
        "id": str(account.id),
        "uid": str(account.id),
        "name": account.full_name,
        "full_name": account.full_name,
        "user_name": account.username,
        "username": account.username,
        "department": account.department or "",
        "department_id": "",
        "tenant_id": account.tenant_id,
        "tinodeUid": account.tinode_uid,
    }


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
        if int(current_user.get("auth_version") or 0) != int(
            (account.properties or {}).get("auth_version") or 0
        ):
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
        or app.config.get("CHATBOT_DEFAULT_TENANT", "")
    )


def _internal_request(request):
    expected = app.config.get("INTERNAL_ACCESS_TOKEN")
    supplied = request.headers.get("X-INTERNAL-TOKEN") or request.headers.get("access-token")
    return bool(expected and supplied and supplied == expected)


def _external_api_configured():
    return bool(
        str(app.config.get("CHATBOT_EXTERNAL_API_KEY") or "").strip()
        and str(app.config.get("CHATBOT_EXTERNAL_TENANT") or "").strip()
    )


def _external_request(request):
    expected = str(app.config.get("CHATBOT_EXTERNAL_API_KEY") or "").strip()
    supplied = str(request.headers.get("X-Chatbot-Api-Key") or "").strip()
    authorization = str(request.headers.get("Authorization") or "").strip()
    if authorization.lower().startswith("bearer "):
        supplied = authorization[7:].strip()
    return bool(expected and supplied and hmac.compare_digest(expected, supplied))


def _external_api_error(request):
    if not _external_api_configured():
        return json({
            "error_code": "EXTERNAL_CHATBOT_NOT_CONFIGURED",
            "error_message": "External chatbot data API is not configured.",
        }, status=503)
    if not _external_request(request):
        return json({
            "error_code": "UNAUTHORIZED",
            "error_message": "A valid external chatbot API key is required.",
        }, status=401)
    return None


def _external_tenant_id():
    return str(app.config.get("CHATBOT_EXTERNAL_TENANT") or "").strip()


def _external_knowledge_base_id(body):
    configured = str(app.config.get("CHATBOT_EXTERNAL_KNOWLEDGE_BASE_ID") or "").strip()
    requested = str((body or {}).get("knowledge_base_id") or "").strip()
    if configured and requested and not hmac.compare_digest(configured, requested):
        raise KnowledgeServiceError("Knowledge base is not available to this integration.", 403)
    selected = configured or requested
    return _valid_uuid(selected, "knowledge_base_id") if selected else None


def _external_user_ref(body):
    external_id = str(
        (body or {}).get("external_user_id")
        or (body or {}).get("user_id")
        or "anonymous"
    ).strip()[:500]
    secret = str(app.config.get("CHATBOT_EXTERNAL_API_KEY") or "").encode("utf-8")
    digest = hmac.new(secret, external_id.encode("utf-8"), hashlib.sha256).hexdigest()[:40]
    return "external:{}".format(digest)


def _external_user(body, tenant_id):
    supplied = (body or {}).get("user")
    supplied = supplied if isinstance(supplied, dict) else {}
    allowed = {}
    for key in ("id", "uid", "name", "full_name", "user_name", "username"):
        value = str(supplied.get(key) or "").strip()[:255]
        if value:
            allowed[key] = value
    allowed["tenant_id"] = tenant_id
    return allowed


def _external_matches(body):
    query_text = str((body or {}).get("query") or (body or {}).get("message") or "").strip()
    if not query_text:
        raise KnowledgeServiceError("Query must not be empty.")
    max_length = app.config.get("CHATBOT_MAX_INPUT_LENGTH", 4000)
    if len(query_text) > max_length:
        raise KnowledgeServiceError("Query exceeds {} characters.".format(max_length))
    tenant_id = _external_tenant_id()
    base_id = _external_knowledge_base_id(body)
    if base_id:
        knowledge_service.get_base(tenant_id, base_id)
    requested_limit = (body or {}).get("limit")
    try:
        limit = min(max(int(requested_limit or app.config.get("CHATBOT_RETRIEVAL_LIMIT", 6)), 1), 20)
    except (TypeError, ValueError):
        raise KnowledgeServiceError("limit must be an integer between 1 and 20.")
    matches = knowledge_service.retrieve(
        query_text,
        tenant_id,
        knowledge_base_id=base_id,
        user_ids=[],
        limit=limit,
        exclude_source_prefixes=("CHAT_",),
    )
    return query_text, tenant_id, base_id, matches


def _external_sources(matches, include_content=False):
    objects = []
    for item in matches:
        source = {
            "document_id": item.get("document_id"),
            "knowledge_base_id": item.get("knowledge_base_id"),
            "title": item.get("title"),
            "file_name": item.get("file_name"),
            "page_number": item.get("page_number"),
            "score": item.get("score"),
        }
        if include_content:
            source["content"] = item.get("content")
        objects.append(source)
    return objects


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


def _chatbot_history_refs(conversation_ref, current_user=None):
    value = str(conversation_ref or DEFAULT_CHATBOT_CONVERSATION_REF)[:255]
    if value != DEFAULT_CHATBOT_CONVERSATION_REF:
        return (value,)
    refs = (DEFAULT_CHATBOT_CONVERSATION_REF,) + LEGACY_CHATBOT_CONVERSATION_REFS
    tinode_uid = str((current_user or {}).get("tinodeUid") or "").strip()
    if tinode_uid:
        refs += ("tinode-chatbot:{}".format(tinode_uid)[:255],)
    return refs


def _filter_chatbot_history_conversations(query, conversation_ref, history_refs):
    """Include Tinode topic history while keeping the tenant/user filters."""
    if conversation_ref == DEFAULT_CHATBOT_CONVERSATION_REF:
        return query.filter(
            (ChatbotMessage.conversation_ref.in_(history_refs))
            | ChatbotMessage.conversation_ref.like("tinode-chatbot:%")
        )
    return query.filter(ChatbotMessage.conversation_ref.in_(history_refs))


def _sanitize_tinode_history(value):
    if not isinstance(value, list):
        return []
    history = []
    for item in value[-20:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        content = str(item.get("content") or item.get("text") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        history.append({"role": role, "content": content[:4000]})
    return history


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
        "request_mode": app.config.get("CHATBOT_EXTERNAL_REQUEST_MODE", "chat"),
        "provider_configured": chatbot_service.enabled,
        "knowledge_enabled": True,
        "knowledge_only": app.config.get("CHATBOT_KNOWLEDGE_ONLY", True),
        "tinode_webhook": {
            "configured": tinode_chatbot_enabled(app),
            "webhook_url": bool(str(app.config.get("TINODE_CHATBOT_WEBHOOK_URL") or "").strip()),
        },
        "external_data_api": {
            "configured": _external_api_configured(),
            "tenant_configured": bool(_external_tenant_id()),
            "knowledge_base_restricted": bool(
                str(app.config.get("CHATBOT_EXTERNAL_KNOWLEDGE_BASE_ID") or "").strip()
            ),
        },
    })


@app.route('/api/v1/chatbot/tinode-config', methods=['GET'])
async def chatbot_tinode_config(request):
    if _current_user(request) is None:
        return json({
            "error_code": "SESSION_EXPIRED",
            "error_message": "Phien lam viec het han.",
        }, status=401)
    if not tinode_chatbot_enabled(app):
        return json(tinode_chatbot_public_config(app), status=200)
    try:
        auth = await ensure_tinode_chatbot_auth(app)
        return json(tinode_chatbot_public_config(app, auth.get("uid")))
    except Exception as error:
        logger.warning("Tinode chatbot account is unavailable: %s", error)
        return json({
            **tinode_chatbot_public_config(app),
            "error_code": "TINODE_CHATBOT_UNAVAILABLE",
        }, status=200)


@app.route('/api/v1/chatbot/tinode-webhook', methods=['POST'])
async def chatbot_tinode_webhook(request):
    if not _tinode_webhook_request(request):
        return json({
            "error_code": "UNAUTHORIZED",
            "error_message": "Tinode chatbot webhook key is invalid.",
        }, status=401)
    body = request.json if isinstance(request.json, dict) else {}
    sender_uid = str(body.get("sender_uid") or body.get("from") or "").strip()
    topic = str(body.get("topic") or "").strip()
    message = str(body.get("message") or "").strip()
    try:
        sequence = int(body.get("seq") or 0)
    except (TypeError, ValueError):
        sequence = 0
    if not sender_uid or not topic or not message or sequence <= 0:
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "Tinode webhook requires sender_uid, topic, seq and message.",
        }, status=400)
    max_length = app.config.get("CHATBOT_MAX_INPUT_LENGTH", 4000)
    if len(message) > max_length:
        return json({
            "error_code": "PARAM_ERROR",
            "error_message": "Tin nhan vuot qua {} ky tu.".format(max_length),
        }, status=400)
    is_group_topic = topic.startswith("grp")
    if not topic.startswith(("usr", "grp")):
        return json({
            "error_code": "TINODE_TOPIC_INVALID",
            "error_message": "Tinode chatbot topic type is invalid.",
        }, status=400)
    if is_group_topic and body.get("bot_mentioned") is not True:
        return json({
            "error_code": "TINODE_BOT_MENTION_REQUIRED",
            "error_message": "ViChat AI only answers explicitly mentioned group messages.",
        }, status=400)

    account = _active_tinode_account(sender_uid)
    if account is None:
        return json({
            "error_code": "TINODE_SENDER_NOT_ALLOWED",
            "error_message": "Tinode sender is not an active Chat account.",
        }, status=403)

    group_conversation = None
    if is_group_topic:
        group_conversation = Conversation.query.filter(
            Conversation.tenant_id == account.tenant_id,
            Conversation.tinode_topic == topic,
            Conversation.deleted.is_(False),
        ).first()
        if group_conversation is None or not bool((group_conversation.properties or {}).get("is_group")):
            return json({
                "error_code": "TINODE_GROUP_NOT_ALLOWED",
                "error_message": "Tinode group is not bound to a Chatmgt conversation.",
            }, status=403)
        membership = ConversationParticipant.query.filter(
            ConversationParticipant.tenant_id == account.tenant_id,
            ConversationParticipant.conversation_id == group_conversation.id,
            ConversationParticipant.participant_id == str(account.id),
            ConversationParticipant.active.is_(True),
            ConversationParticipant.deleted.is_(False),
        ).first()
        if membership is None:
            return json({
                "error_code": "TINODE_GROUP_MEMBER_NOT_ALLOWED",
                "error_message": "Tinode sender is not an active group member.",
            }, status=403)

    # Direct AI history uses the same stable key as the HTTP fallback. Group
    # history stays topic-scoped so one group's context never crosses another.
    conversation_ref = (
        DEFAULT_CHATBOT_CONVERSATION_REF
        if not is_group_topic
        else "tinode-chatbot:{}".format(topic)[:255]
    )
    user_ref = (
        "group:{}".format(hashlib.sha256(topic.encode("utf-8")).hexdigest()[:64])
        if is_group_topic else str(account.id)
    )
    message_ref = _tinode_message_ref(topic, sequence)
    history_refs = _chatbot_history_refs(
        conversation_ref,
        {"tinodeUid": account.tinode_uid},
    )
    existing_reply_query = ChatbotMessage.query.filter(
        ChatbotMessage.tenant_id == account.tenant_id,
        ChatbotMessage.user_ref == user_ref,
        ChatbotMessage.message_ref == message_ref + ":assistant",
        ChatbotMessage.deleted.is_(False),
    )
    existing_reply = _filter_chatbot_history_conversations(
        existing_reply_query,
        conversation_ref,
        history_refs,
    ).first()
    if existing_reply is not None:
        return json({
            "reply": existing_reply.content,
            "message_ref": message_ref,
            "duplicate": True,
            "tenant_id": account.tenant_id,
            "grounded": bool((existing_reply.properties or {}).get("grounded")),
            "sources": (existing_reply.properties or {}).get("sources") or [],
        })

    history_query = ChatbotMessage.query.filter(
        ChatbotMessage.tenant_id == account.tenant_id,
        ChatbotMessage.user_ref == user_ref,
        ChatbotMessage.deleted.is_(False),
    )
    history_rows = _filter_chatbot_history_conversations(
        history_query,
        conversation_ref,
        history_refs,
    ).order_by(ChatbotMessage.created_at.desc()).limit(
        max(1, int(app.config.get("TINODE_CHATBOT_HISTORY_LIMIT", 100)))
    ).all()
    history = [
        {"role": item.role, "content": item.content}
        for item in reversed(history_rows)
    ]
    supplied_history = _sanitize_tinode_history(body.get("history")) if is_group_topic else []
    if supplied_history:
        history = supplied_history
    user = _tinode_chatbot_user(account)
    try:
        _store_history_message(
            account.tenant_id,
            conversation_ref,
            user_ref,
            "user",
            message,
            message_ref=message_ref,
            properties={
                "source": "tinode-webhook",
                "topic": topic,
                "seq": sequence,
                "is_group": is_group_topic,
                "sender_uid": sender_uid,
                "sender_name": account.full_name or account.username,
            },
        )
        result = await chatbot_service.reply(
            message=message,
            user=user,
            conversation_id=conversation_ref,
            history=history,
            include_context=False,
        )
        _store_history_message(
            account.tenant_id,
            conversation_ref,
            user_ref,
            "assistant",
            result.get("reply") or "",
            message_ref=message_ref + ":assistant",
            properties={
                "source": "tinode-webhook",
                "topic": topic,
                "seq": sequence,
                "provider": result.get("provider"),
                "model": result.get("model"),
                "grounded": bool(result.get("grounded")),
                "sources": result.get("sources") or [],
            },
        )
        return json({
            "reply": result.get("reply") or "",
            "message_ref": message_ref,
            "tenant_id": account.tenant_id,
            "is_group": is_group_topic,
            "provider": result.get("provider"),
            "grounded": bool(result.get("grounded")),
            "sources": result.get("sources") or [],
        })
    except ChatbotServiceError as error:
        return _error_response(error, "TINODE_CHATBOT_ERROR")
    except Exception as error:
        db.session.rollback()
        logger.exception("Tinode chatbot webhook failed")
        return _error_response(error, "TINODE_CHATBOT_ERROR")


@app.route('/api/v1/chatbot/external/context', methods=['POST'])
async def chatbot_external_context(request):
    auth_error = _external_api_error(request)
    if auth_error is not None:
        return auth_error
    body = request.json if isinstance(request.json, dict) else {}
    try:
        query_text, tenant_id, base_id, matches = _external_matches(body)
        return json({
            "query": query_text,
            "tenant_id": tenant_id,
            "knowledge_base_id": base_id,
            "grounded": bool(matches),
            "context": knowledge_service.format_context(matches),
            "sources": _external_sources(matches, include_content=True),
        })
    except Exception as error:
        return _error_response(error, "EXTERNAL_CONTEXT_ERROR")


@app.route('/api/v1/chatbot/external/message', methods=['POST'])
async def chatbot_external_message(request):
    auth_error = _external_api_error(request)
    if auth_error is not None:
        return auth_error
    body = request.json if isinstance(request.json, dict) else {}
    try:
        message, tenant_id, base_id, matches = _external_matches(body)
        conversation_ref = str(body.get("conversation_id") or "external-chatbot")[:255]
        message_ref = str(body.get("message_id") or "").strip()[:255] or None
        user_ref = _external_user_ref(body)
        user = _external_user(body, tenant_id)
        _store_history_message(
            tenant_id,
            conversation_ref,
            user_ref,
            "user",
            message,
            message_ref=message_ref,
            properties={"source": "external-api"},
        )
        result = await chat_manager_service.reply(
            message=message,
            user=user,
            conversation_id=conversation_ref,
            tenant_id=tenant_id,
            knowledge_base_id=base_id,
            history=body.get("history") if isinstance(body.get("history"), list) else [],
            exclude_source_prefixes=("CHAT_",),
            retrieved_matches=matches,
        )
        result["sources"] = _external_sources(matches)
        result["grounded"] = bool(matches)
        _store_history_message(
            tenant_id,
            conversation_ref,
            user_ref,
            "assistant",
            result.get("reply") or "",
            message_ref="{}:assistant".format(message_ref or uuid.uuid4()),
            properties={
                "source": "external-api",
                "provider": result.get("provider"),
                "model": result.get("model"),
            },
        )
        return json(result)
    except KnowledgeServiceError as error:
        return _error_response(error, "EXTERNAL_CHATBOT_ERROR")
    except ChatbotServiceError as error:
        return _error_response(error, "EXTERNAL_CHATBOT_ERROR")
    except Exception as error:
        logger.exception("External chatbot message failed")
        return _error_response(error, "EXTERNAL_CHATBOT_ERROR")


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

    conversation_ref = str(body.get("conversation_id") or DEFAULT_CHATBOT_CONVERSATION_REF)[:255]
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
        result = await chatbot_service.reply(
            message=message,
            user=current_user or body.get("user") or {},
            conversation_id=conversation_ref,
            history=body.get("history") if isinstance(body.get("history"), list) else [],
            include_context=False,
        )
        _store_history_message(
            tenant_id,
            conversation_ref,
            user_ref,
            "assistant",
            result.get("reply") or "",
            message_ref="{}:assistant".format(message_ref or uuid.uuid4()),
            properties={
                "provider": result.get("provider"),
                "model": result.get("model"),
                "grounded": bool(result.get("grounded")),
                "sources": result.get("sources") or [],
            },
        )
        return json(result)
    except ChatbotServiceError as error:
        return _error_response(error, "CHATBOT_ERROR")


@app.route('/api/v1/chatbot/history', methods=['GET'])
async def chatbot_history(request):
    current_user, tenant_id = _chatbot_identity(request)
    if current_user is None:
        return json({"error_code": "SESSION_EXPIRED", "error_message": "Phiên làm việc hết hạn"}, status=401)
    conversation_ref = str(request.args.get("conversation_id") or DEFAULT_CHATBOT_CONVERSATION_REF)[:255]
    history_refs = _chatbot_history_refs(conversation_ref, current_user)
    limit = min(max(int(request.args.get("limit", 200)), 1), 500)
    history_query = ChatbotMessage.query.filter(
        ChatbotMessage.tenant_id == tenant_id,
        ChatbotMessage.user_ref == _user_ref(current_user),
        ChatbotMessage.deleted.is_(False),
    )
    items = _filter_chatbot_history_conversations(
        history_query,
        conversation_ref,
        history_refs,
    ).order_by(ChatbotMessage.created_at.desc()).limit(limit).all()
    items.reverse()
    return json({"objects": [_serialize_history_message(item) for item in items]})


@app.route('/api/v1/chatbot/history', methods=['DELETE'])
async def chatbot_history_delete(request):
    body = request.json or {}
    current_user, tenant_id = _chatbot_identity(request, body)
    if current_user is None:
        return json({"error_code": "SESSION_EXPIRED", "error_message": "Phiên làm việc hết hạn"}, status=401)
    conversation_ref = str(body.get("conversation_id") or DEFAULT_CHATBOT_CONVERSATION_REF)[:255]
    history_refs = _chatbot_history_refs(conversation_ref, current_user)
    history_query = ChatbotMessage.query.filter(
        ChatbotMessage.tenant_id == tenant_id,
        ChatbotMessage.user_ref == _user_ref(current_user),
        ChatbotMessage.deleted.is_(False),
    )
    for item in _filter_chatbot_history_conversations(
        history_query,
        conversation_ref,
        history_refs,
    ).all():
        item.deleted = True
    db.session.commit()
    return json({"deleted": True})


@app.route('/api/v1/chatbot/knowledge/chat-events', methods=['POST'])
async def knowledge_chat_event(request):
    return json({
        "error_code": "TINODE_CONTENT_ONLY",
        "error_message": "Tin nhan va tep chat chi duoc luu tai Tinode.",
    }, status=410)


@app.route('/api/v1/chatbot/knowledge/chat-files', methods=['POST'])
async def knowledge_chat_file(request):
    return json({
        "error_code": "TINODE_CONTENT_ONLY",
        "error_message": "Tin nhan va tep chat chi duoc luu tai Tinode.",
    }, status=410)


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
