import logging
import time
import uuid

from gatco.response import json, redirect

from application.controllers.api_chat_management import (
    _current_session_error,
    _identity,
    _user_id,
)
from application.database import db
from application.models.models import PersonalCloudFile, PersonalCloudMessage
from application.server import app
from application.services.auth_service import management_session_requested
from application.services.chat_media_service import (
    ChatMediaError,
    complete_personal_cloud_upload,
    create_personal_cloud_upload,
    remove_personal_cloud_media,
    resolve_personal_cloud_download,
)
from application.services.pagination import (
    PaginationError,
    bounded_int,
    cursor_uuid,
    decode_cursor,
    encode_cursor,
    page_payload,
)


logger = logging.getLogger(__name__)


def _cloud_error(error):
    return json({
        "error_code": getattr(error, "code", "PARAM_ERROR"),
        "error_message": str(error),
    }, status=getattr(error, "status_code", 400))


def _unexpected_cloud_error(action, error):
    logger.exception("Personal cloud %s failed (%s)", action, type(error).__name__)
    return json({
        "error_code": "PERSONAL_CLOUD_UNAVAILABLE",
        "error_message": "Personal cloud storage is temporarily unavailable.",
    }, status=503)


def _cloud_identity(request):
    if management_session_requested(request):
        return None, None, None
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return None, None, None
    return current_user, tenant_id, _user_id(current_user)


def _file_query(tenant_id, owner_id):
    return PersonalCloudFile.query.filter(
        PersonalCloudFile.tenant_id == tenant_id,
        PersonalCloudFile.owner_id == owner_id,
        PersonalCloudFile.deleted.is_(False),
        PersonalCloudFile.cleanup_state == "ACTIVE",
    )


def _file_by_id(tenant_id, owner_id, file_id):
    try:
        parsed_id = uuid.UUID(str(file_id))
    except (TypeError, ValueError, AttributeError):
        return None
    return _file_query(tenant_id, owner_id).filter(PersonalCloudFile.id == parsed_id).first()


def _message_query(tenant_id, owner_id):
    return PersonalCloudMessage.query.filter(
        PersonalCloudMessage.tenant_id == tenant_id,
        PersonalCloudMessage.owner_id == owner_id,
        PersonalCloudMessage.deleted.is_(False),
    )


def _message_by_id(tenant_id, owner_id, message_id):
    try:
        parsed_id = uuid.UUID(str(message_id))
    except (TypeError, ValueError, AttributeError):
        return None
    return _message_query(tenant_id, owner_id).filter(PersonalCloudMessage.id == parsed_id).first()


def _serialize_file(item):
    return {
        "id": str(item.id),
        "fileName": item.file_name,
        "mimeType": item.mime_type,
        "size": int(item.size or 0),
        "uploadId": item.upload_id,
        "createdAt": int(item.created_at or 0),
        "updatedAt": int(item.updated_at or 0),
    }


def _serialize_message(item):
    return {
        "id": str(item.id),
        "text": item.text,
        "createdAt": int(item.created_at or 0),
        "updatedAt": int(item.updated_at or 0),
    }


@app.route('/api/v1/chat/cloud/uploads', methods=['POST'])
async def create_personal_cloud_media_upload(request):
    current_user, tenant_id, owner_id = _cloud_identity(request)
    if current_user is None:
        return _current_session_error(request)
    body = request.json or {}
    try:
        try:
            requested_size = int(body.get("size"))
        except (TypeError, ValueError):
            raise ChatMediaError("PARAM_ERROR", "size must be an integer.")
        payload = create_personal_cloud_upload(
            app,
            tenant_id,
            owner_id,
            body.get("file_name"),
            body.get("content_type"),
            requested_size,
        )
        now = int(time.time())
        db.session.add(PersonalCloudFile(
            tenant_id=tenant_id,
            owner_id=owner_id,
            upload_id=payload["upload_id"],
            file_name=payload.get("file_name") or "tep-dinh-kem",
            mime_type=str((payload.get("headers") or {}).get("Content-Type") or "application/octet-stream"),
            size=requested_size,
            media_ref=payload["upload_id"],
            cleanup_state="PENDING_UPLOAD",
            cleanup_next_at=now + int(app.config.get("CHAT_MEDIA_COMPLETION_TTL", 21600)),
        ))
        db.session.commit()
        return json(payload, status=201)
    except ChatMediaError as error:
        return _cloud_error(error)
    except Exception as error:
        return _unexpected_cloud_error("upload preparation", error)


@app.route('/api/v1/chat/cloud/uploads/<upload_id>/complete', methods=['POST'])
async def complete_personal_cloud_media_upload(request, upload_id):
    current_user, tenant_id, owner_id = _cloud_identity(request)
    if current_user is None:
        return _current_session_error(request)
    body = request.json or {}
    try:
        existing = PersonalCloudFile.query.filter(
            PersonalCloudFile.tenant_id == tenant_id,
            PersonalCloudFile.owner_id == owner_id,
            PersonalCloudFile.upload_id == str(upload_id or "").lower(),
            PersonalCloudFile.deleted.is_(False),
        ).first()
        if existing is not None and existing.cleanup_state == "ACTIVE":
            return json(_serialize_file(existing))
        try:
            requested_size = int(body.get("size"))
        except (TypeError, ValueError):
            raise ChatMediaError("PARAM_ERROR", "size must be an integer.")
        completed = complete_personal_cloud_upload(
            app,
            tenant_id,
            owner_id,
            upload_id,
            requested_size,
            body.get("upload_token"),
        )
        item = existing or PersonalCloudFile(
            tenant_id=tenant_id,
            owner_id=owner_id,
            upload_id=completed["upload_id"],
            file_name=completed["file_name"],
            mime_type=completed["mime"],
            size=completed["size"],
            media_ref=completed["upload_id"],
        )
        item.file_name = completed["file_name"]
        item.mime_type = completed["mime"]
        item.size = completed["size"]
        item.media_ref = completed["upload_id"]
        item.etag = completed.get("etag") or None
        item.cleanup_state = "ACTIVE"
        item.cleanup_attempts = 0
        item.cleanup_next_at = None
        item.cleanup_last_error = None
        if existing is None:
            db.session.add(item)
        db.session.commit()
        return json(_serialize_file(item), status=201)
    except ChatMediaError as error:
        db.session.rollback()
        return _cloud_error(error)
    except Exception as error:
        db.session.rollback()
        return _unexpected_cloud_error("upload completion", error)


@app.route('/api/v1/chat/cloud/files', methods=['GET'])
async def list_personal_cloud_files(request):
    current_user, tenant_id, owner_id = _cloud_identity(request)
    if current_user is None:
        return _current_session_error(request)
    try:
        limit = bounded_int(
            request.args.get("limit"),
            name="limit",
            default=100,
            minimum=1,
            maximum=100,
        )
        cursor = decode_cursor(request.args.get("cursor")) if request.args.get("cursor") else None
    except PaginationError as error:
        return _cloud_error(ChatMediaError("PARAM_ERROR", str(error)))
    query = _file_query(tenant_id, owner_id)
    total = query.count()
    if cursor:
        try:
            cursor_updated = int(cursor.get("updated") or 0)
            cursor_created = int(cursor.get("created") or 0)
            cursor_id = cursor_uuid(cursor.get("id"))
        except (PaginationError, TypeError, ValueError):
            return _cloud_error(ChatMediaError("PARAM_ERROR", "Cursor is invalid."))
        query = query.filter(
            (PersonalCloudFile.updated_at < cursor_updated)
            | ((PersonalCloudFile.updated_at == cursor_updated) & (PersonalCloudFile.created_at < cursor_created))
            | ((PersonalCloudFile.updated_at == cursor_updated) & (PersonalCloudFile.created_at == cursor_created) & (PersonalCloudFile.id < cursor_id))
        )
    items = query.order_by(
        PersonalCloudFile.updated_at.desc(),
        PersonalCloudFile.created_at.desc(),
        PersonalCloudFile.id.desc(),
    ).limit(limit + 1).all()
    has_more = len(items) > limit
    items = items[:limit]
    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = encode_cursor({
            "v": 1,
            "updated": int(last.updated_at or 0),
            "created": int(last.created_at or 0),
            "id": str(last.id),
        })
    return json({
        **page_payload(
            [_serialize_file(item) for item in items],
            next_cursor=next_cursor,
            limit=limit,
            total=total,
        ),
        "count": int(total),
    })


@app.route('/api/v1/chat/cloud/messages', methods=['GET'])
async def list_personal_cloud_messages(request):
    current_user, tenant_id, owner_id = _cloud_identity(request)
    if current_user is None:
        return _current_session_error(request)
    try:
        limit = bounded_int(
            request.args.get("limit"),
            name="limit",
            default=100,
            minimum=1,
            maximum=100,
        )
        cursor = decode_cursor(request.args.get("cursor")) if request.args.get("cursor") else None
    except PaginationError as error:
        return _cloud_error(ChatMediaError("PARAM_ERROR", str(error)))
    query = _message_query(tenant_id, owner_id)
    total = query.count()
    if cursor:
        try:
            cursor_updated = int(cursor.get("updated") or 0)
            cursor_created = int(cursor.get("created") or 0)
            cursor_id = cursor_uuid(cursor.get("id"))
        except (PaginationError, TypeError, ValueError):
            return _cloud_error(ChatMediaError("PARAM_ERROR", "Cursor is invalid."))
        query = query.filter(
            (PersonalCloudMessage.updated_at < cursor_updated)
            | ((PersonalCloudMessage.updated_at == cursor_updated) & (PersonalCloudMessage.created_at < cursor_created))
            | ((PersonalCloudMessage.updated_at == cursor_updated) & (PersonalCloudMessage.created_at == cursor_created) & (PersonalCloudMessage.id < cursor_id))
        )
    items = query.order_by(
        PersonalCloudMessage.updated_at.desc(),
        PersonalCloudMessage.created_at.desc(),
        PersonalCloudMessage.id.desc(),
    ).limit(limit + 1).all()
    has_more = len(items) > limit
    items = items[:limit]
    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = encode_cursor({
            "v": 1,
            "updated": int(last.updated_at or 0),
            "created": int(last.created_at or 0),
            "id": str(last.id),
        })
    return json({
        **page_payload(
            [_serialize_message(item) for item in items],
            next_cursor=next_cursor,
            limit=limit,
            total=total,
        ),
        "count": int(total),
    })


@app.route('/api/v1/chat/cloud/messages', methods=['POST'])
async def create_personal_cloud_message(request):
    current_user, tenant_id, owner_id = _cloud_identity(request)
    if current_user is None:
        return _current_session_error(request)
    body = request.json if isinstance(request.json, dict) else {}
    text = body.get("text")
    if not isinstance(text, str) or not text.strip():
        return _cloud_error(ChatMediaError("PARAM_ERROR", "text must not be empty."))
    item = PersonalCloudMessage(
        tenant_id=tenant_id,
        owner_id=owner_id,
        text=text.strip(),
    )
    try:
        db.session.add(item)
        db.session.commit()
        return json(_serialize_message(item), status=201)
    except Exception as error:
        db.session.rollback()
        return _unexpected_cloud_error("message creation", error)


@app.route('/api/v1/chat/cloud/messages/<message_id>', methods=['DELETE'])
async def delete_personal_cloud_message(request, message_id):
    current_user, tenant_id, owner_id = _cloud_identity(request)
    if current_user is None:
        return _current_session_error(request)
    item = _message_by_id(tenant_id, owner_id, message_id)
    if item is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Personal cloud message not found."}, status=404)
    try:
        item.deleted = True
        db.session.commit()
        return json({"deleted": True, "id": str(item.id)})
    except Exception as error:
        db.session.rollback()
        return _unexpected_cloud_error("message deletion", error)


@app.route('/api/v1/chat/cloud/files/<file_id>/download', methods=['GET'])
async def download_personal_cloud_file(request, file_id):
    current_user, tenant_id, owner_id = _cloud_identity(request)
    if current_user is None:
        return _current_session_error(request)
    item = _file_by_id(tenant_id, owner_id, file_id)
    if item is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Personal cloud file not found."}, status=404)
    force_download = str(request.args.get("download") or "").strip().lower() in {"1", "true", "yes", "on"}
    try:
        payload = resolve_personal_cloud_download(
            app,
            tenant_id,
            owner_id,
            item.upload_id,
            file_name=item.file_name,
            force_download=force_download,
        )
        wants_json = (
            str(request.args.get("format") or "").strip().lower() == "json"
            or "application/json" in str(request.headers.get("Accept") or "").lower()
        )
        response = json(payload) if wants_json else redirect(payload["url"], status=302)
        response.headers["Cache-Control"] = "private, no-store"
        return response
    except ChatMediaError as error:
        return _cloud_error(error)
    except Exception as error:
        return _unexpected_cloud_error("download signing", error)


@app.route('/api/v1/chat/cloud/files/<file_id>', methods=['DELETE'])
async def delete_personal_cloud_file(request, file_id):
    current_user, tenant_id, owner_id = _cloud_identity(request)
    if current_user is None:
        return _current_session_error(request)
    item = _file_by_id(tenant_id, owner_id, file_id)
    if item is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Personal cloud file not found."}, status=404)
    item.cleanup_state = "PENDING_DELETE"
    item.cleanup_last_error = None
    item.cleanup_next_at = int(time.time())
    db.session.commit()
    try:
        remove_personal_cloud_media(app, tenant_id, owner_id, item.upload_id)
    except Exception as error:
        item.cleanup_state = "RETRY"
        item.cleanup_attempts = int(item.cleanup_attempts or 0) + 1
        item.cleanup_last_error = type(error).__name__[:255]
        item.cleanup_next_at = int(time.time()) + min(3600, 2 ** min(item.cleanup_attempts, 10))
        db.session.commit()
        logger.warning("Personal cloud object cleanup failed for %s", item.upload_id, exc_info=True)
        return json({"deleted": False, "pending_delete": True, "id": str(item.id)}, status=202)
    item.deleted = True
    item.cleanup_state = "DELETED"
    item.cleanup_next_at = None
    db.session.commit()
    return json({"deleted": True, "id": str(item.id)})
