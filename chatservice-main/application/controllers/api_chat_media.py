import logging
import time
import uuid

from gatco.response import json
from sanic.response import redirect

from application.controllers.api_chat_management import (
    _current_session_error,
    _identity,
    _user_id,
)
from application.database import db
from application.models.models import ChatMediaRegistry, Conversation, ConversationParticipant
from application.server import app
from application.services.auth_service import management_session_requested
from application.services.chat_media_service import (
    ChatMediaError,
    complete_chat_media_upload,
    create_chat_media_upload,
    remove_chat_media,
    resolve_chat_media_download,
)


logger = logging.getLogger(__name__)


def _media_error(error):
    return json({
        "error_code": error.code,
        "error_message": str(error),
    }, status=error.status_code)


def _unexpected_media_error(action, error):
    logger.exception("Chat media %s failed (%s)", action, type(error).__name__)
    return json({
        "error_code": "MEDIA_STORAGE_UNAVAILABLE",
        "error_message": "S3 media storage is temporarily unavailable.",
    }, status=503)


def _chat_media_identity(request):
    if management_session_requested(request):
        return None, None
    return _identity(request)


def _require_conversation_member(tenant_id, current_user, conversation_id):
    try:
        parsed_id = uuid.UUID(str(conversation_id))
    except (TypeError, ValueError, AttributeError):
        raise ChatMediaError("MEDIA_CONVERSATION_INVALID", "The conversation reference is invalid.")
    conversation = Conversation.query.filter(
        Conversation.id == parsed_id,
        Conversation.tenant_id == tenant_id,
        Conversation.deleted.is_(False),
    ).first()
    if conversation is None:
        raise ChatMediaError("MEDIA_CONVERSATION_NOT_FOUND", "The conversation was not found.", 404)
    user_id = _user_id(current_user)
    membership = ConversationParticipant.query.filter(
        ConversationParticipant.tenant_id == tenant_id,
        ConversationParticipant.conversation_id == parsed_id,
        ConversationParticipant.participant_id == user_id,
        ConversationParticipant.active.is_(True),
        ConversationParticipant.approval_status == "APPROVED",
        ConversationParticipant.deleted.is_(False),
    ).first()
    if membership is None:
        raise ChatMediaError(
            "MEDIA_CONVERSATION_FORBIDDEN",
            "You are not an active member of this conversation.",
            403,
        )
    return parsed_id


def _registry(tenant_id, upload_id):
    return ChatMediaRegistry.query.filter(
        ChatMediaRegistry.tenant_id == str(tenant_id),
        ChatMediaRegistry.upload_id == str(upload_id or "").strip().lower(),
        ChatMediaRegistry.deleted.is_(False),
    ).first()


def _registry_not_found():
    return ChatMediaError(
        "MEDIA_REGISTRY_REQUIRED",
        "The media upload is no longer available.",
        404,
    )


def _registry_payload(row):
    return {
        "upload_id": row.upload_id,
        "conversation_id": str(row.conversation_id),
        "uploader_id": row.uploader_id,
        "state": row.state,
        "message_ref": row.message_ref or "",
        "bound": row.state == "BOUND",
    }


@app.route('/api/v1/chat/media/uploads', methods=['POST'])
async def create_media_upload(request):
    current_user, tenant_id = _chat_media_identity(request)
    if current_user is None:
        return _current_session_error(request)
    body = request.json or {}
    try:
        conversation_id = _require_conversation_member(
            tenant_id,
            current_user,
            body.get("conversation_id") or body.get("conversationId"),
        )
        uploader_id = _user_id(current_user)
        try:
            requested_size = int(body.get("size"))
        except (TypeError, ValueError):
            raise ChatMediaError("PARAM_ERROR", "size must be an integer.")
        payload = create_chat_media_upload(
            app,
            tenant_id,
            body.get("file_name"),
            body.get("content_type"),
            requested_size,
            conversation_id=conversation_id,
            uploader_id=uploader_id,
        )
        now = int(time.time())
        row = ChatMediaRegistry(
            tenant_id=tenant_id,
            conversation_id=conversation_id,
            upload_id=payload["upload_id"],
            uploader_id=uploader_id,
            size=requested_size,
            content_type=str((payload.get("headers") or {}).get("Content-Type") or "application/octet-stream"),
            state="PENDING_UPLOAD",
            expires_at=now + int(app.config.get("CHAT_MEDIA_COMPLETION_TTL", 21600)),
            cleanup_next_at=now + int(app.config.get("CHAT_MEDIA_COMPLETION_TTL", 21600)),
        )
        db.session.add(row)
        db.session.commit()
        payload.update({"conversation_id": str(conversation_id), "uploader_id": uploader_id})
        return json(payload, status=201)
    except ChatMediaError as error:
        db.session.rollback()
        return _media_error(error)
    except Exception as error:
        db.session.rollback()
        return _unexpected_media_error("upload preparation", error)


@app.route('/api/v1/chat/media/uploads/<upload_id>/complete', methods=['POST'])
async def complete_media_upload(request, upload_id):
    current_user, tenant_id = _chat_media_identity(request)
    if current_user is None:
        return _current_session_error(request)
    body = request.json or {}
    try:
        row = _registry(tenant_id, upload_id)
        if row is None:
            raise _registry_not_found()
        _require_conversation_member(tenant_id, current_user, row.conversation_id)
        if row.uploader_id != _user_id(current_user):
            raise ChatMediaError(
                "MEDIA_UPLOAD_FORBIDDEN",
                "Only the uploader can complete this media upload.",
                403,
            )
        try:
            requested_size = int(body.get("size"))
        except (TypeError, ValueError):
            raise ChatMediaError("PARAM_ERROR", "size must be an integer.")
        completed = complete_chat_media_upload(
            app,
            tenant_id,
            upload_id,
            requested_size,
            body.get("upload_token"),
            conversation_id=row.conversation_id,
            uploader_id=row.uploader_id,
        )
        now = int(time.time())
        row.size = int(completed.get("size") or row.size or 0)
        row.content_type = str(completed.get("mime") or row.content_type or "application/octet-stream")
        row.state = "PENDING_MESSAGE"
        row.expires_at = now + int(app.config.get("CHAT_MEDIA_COMPLETION_TTL", 21600))
        row.cleanup_next_at = row.expires_at
        row.cleanup_last_error = None
        db.session.commit()
        completed.update({"conversation_id": str(row.conversation_id), "uploader_id": row.uploader_id})
        return json(completed)
    except ChatMediaError as error:
        db.session.rollback()
        return _media_error(error)
    except Exception as error:
        db.session.rollback()
        return _unexpected_media_error("upload verification", error)


@app.route('/api/v1/chat/media/<upload_id>/bind', methods=['POST'])
async def bind_chat_media(request, upload_id):
    current_user, tenant_id = _chat_media_identity(request)
    if current_user is None:
        return _current_session_error(request)
    body = request.json or {}
    try:
        row = _registry(tenant_id, upload_id)
        if row is None:
            raise _registry_not_found()
        _require_conversation_member(tenant_id, current_user, row.conversation_id)
        if row.uploader_id != _user_id(current_user):
            raise ChatMediaError("MEDIA_UPLOAD_FORBIDDEN", "Only the uploader can bind this media.", 403)
        message_ref = str(body.get("message_ref") or body.get("messageRef") or "").strip()
        if not message_ref or len(message_ref) > 255:
            raise ChatMediaError("PARAM_ERROR", "A valid message reference is required.")
        if row.state == "BOUND":
            return json(_registry_payload(row))
        if row.state != "PENDING_MESSAGE":
            raise ChatMediaError("MEDIA_BIND_INVALID", "The media is not waiting for a message.", 409)
        now = int(time.time())
        row.state = "BOUND"
        row.message_ref = message_ref
        row.bound_at = now
        row.expires_at = None
        row.cleanup_next_at = None
        row.cleanup_last_error = None
        db.session.commit()
        return json(_registry_payload(row))
    except ChatMediaError as error:
        db.session.rollback()
        return _media_error(error)
    except Exception as error:
        db.session.rollback()
        return _unexpected_media_error("media binding", error)


@app.route('/api/v1/chat/media/<upload_id>/discard', methods=['POST'])
async def discard_chat_media(request, upload_id):
    current_user, tenant_id = _chat_media_identity(request)
    if current_user is None:
        return _current_session_error(request)
    try:
        row = _registry(tenant_id, upload_id)
        if row is None:
            raise _registry_not_found()
        _require_conversation_member(tenant_id, current_user, row.conversation_id)
        if row.uploader_id != _user_id(current_user):
            raise ChatMediaError("MEDIA_UPLOAD_FORBIDDEN", "Only the uploader can discard this media.", 403)
        if row.state == "BOUND":
            raise ChatMediaError("MEDIA_ALREADY_BOUND", "Media bound to a message cannot be discarded.", 409)
        if row.deleted or row.state == "CLEANED":
            return json({"discarded": True, "upload_id": row.upload_id})
        row.state = "PENDING_DELETE"
        row.cleanup_next_at = int(time.time())
        db.session.commit()
        try:
            remove_chat_media(app, tenant_id, row.upload_id)
        except Exception as error:
            row.state = "RETRY"
            row.cleanup_attempts = int(row.cleanup_attempts or 0) + 1
            row.cleanup_last_error = type(error).__name__[:255]
            row.cleanup_next_at = int(time.time()) + min(3600, 2 ** min(row.cleanup_attempts, 10))
            db.session.commit()
            logger.warning("Chat media cleanup deferred (%s)", type(error).__name__)
            return json({"discarded": False, "pending_cleanup": True, "upload_id": row.upload_id}, status=202)
        row.deleted = True
        row.deleted_at = int(time.time())
        row.state = "CLEANED"
        row.cleanup_next_at = None
        db.session.commit()
        return json({"discarded": True, "upload_id": row.upload_id})
    except ChatMediaError as error:
        db.session.rollback()
        return _media_error(error)
    except Exception as error:
        db.session.rollback()
        return _unexpected_media_error("media discard", error)


@app.route('/api/v1/chat/media/<upload_id>', methods=['GET'])
async def get_chat_media(request, upload_id):
    current_user, tenant_id = _chat_media_identity(request)
    if current_user is None:
        return _current_session_error(request)
    force_download = str(request.args.get("download") or "").strip().lower() in {
        "1", "true", "yes", "on",
    }
    try:
        row = _registry(tenant_id, upload_id)
        if row is not None:
            if row.state in {"CLEANED", "PENDING_DELETE"}:
                raise ChatMediaError("MEDIA_NOT_FOUND", "The media object was not found.", 404)
            _require_conversation_member(tenant_id, current_user, row.conversation_id)
        elif request.args.get("conversation_id"):
            # Legacy Tinode references can opt into the stronger conversation
            # check while old messages without a registry remain readable.
            _require_conversation_member(tenant_id, current_user, request.args.get("conversation_id"))
        payload = resolve_chat_media_download(
            app,
            tenant_id,
            upload_id,
            file_name=request.args.get("name") or "",
            force_download=force_download,
        )
        wants_json = (
            str(request.args.get("format") or "").strip().lower() == "json"
            or "application/json" in str(request.headers.get("Accept") or "").lower()
        )
        if wants_json:
            response = json(payload)
        else:
            response = redirect(payload["url"], status=302)
        response.headers["Cache-Control"] = "private, no-store"
        return response
    except ChatMediaError as error:
        return _media_error(error)
    except Exception as error:
        return _unexpected_media_error("download signing", error)
