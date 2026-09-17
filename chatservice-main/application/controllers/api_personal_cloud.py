import logging
import uuid

from gatco.response import json, redirect

from application.controllers.api_chat_management import (
    _current_session_error,
    _identity,
    _user_id,
)
from application.database import db
from application.models.models import PersonalCloudFile
from application.server import app
from application.services.auth_service import management_session_requested
from application.services.chat_media_service import (
    ChatMediaError,
    complete_personal_cloud_upload,
    create_personal_cloud_upload,
    remove_personal_cloud_media,
    resolve_personal_cloud_download,
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
    )


def _file_by_id(tenant_id, owner_id, file_id):
    try:
        parsed_id = uuid.UUID(str(file_id))
    except (TypeError, ValueError, AttributeError):
        return None
    return _file_query(tenant_id, owner_id).filter(PersonalCloudFile.id == parsed_id).first()


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


@app.route('/api/v1/chat/cloud/uploads', methods=['POST'])
async def create_personal_cloud_media_upload(request):
    current_user, tenant_id, owner_id = _cloud_identity(request)
    if current_user is None:
        return _current_session_error(request)
    body = request.json or {}
    try:
        return json(create_personal_cloud_upload(
            app,
            tenant_id,
            owner_id,
            body.get("file_name"),
            body.get("content_type"),
            body.get("size"),
        ), status=201)
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
        if existing is not None:
            return json(_serialize_file(existing))
        completed = complete_personal_cloud_upload(
            app,
            tenant_id,
            owner_id,
            upload_id,
            body.get("size"),
            body.get("upload_token"),
        )
        item = PersonalCloudFile(
            tenant_id=tenant_id,
            owner_id=owner_id,
            upload_id=completed["upload_id"],
            file_name=completed["file_name"],
            mime_type=completed["mime"],
            size=completed["size"],
            media_ref=completed["upload_id"],
            etag=completed.get("etag") or None,
        )
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
        limit = min(200, max(1, int(request.args.get("limit") or 100)))
    except (TypeError, ValueError):
        return _cloud_error(ChatMediaError("CLOUD_LIMIT_INVALID", "The file limit is invalid."))
    items = _file_query(tenant_id, owner_id).order_by(
        PersonalCloudFile.updated_at.desc(),
        PersonalCloudFile.created_at.desc(),
    ).limit(limit).all()
    return json({"objects": [_serialize_file(item) for item in items]})


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
    item.deleted = True
    db.session.commit()
    try:
        remove_personal_cloud_media(app, tenant_id, owner_id, item.upload_id)
    except Exception:
        logger.warning("Personal cloud object cleanup failed for %s", item.upload_id, exc_info=True)
    return json({"deleted": True, "id": str(item.id)})
