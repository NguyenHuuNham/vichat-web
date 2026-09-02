import logging

from gatco.response import json
from sanic.response import redirect

from application.controllers.api_chat_management import (
    _current_session_error,
    _identity,
)
from application.server import app
from application.services.auth_service import management_session_requested
from application.services.chat_media_service import (
    ChatMediaError,
    complete_chat_media_upload,
    create_chat_media_upload,
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


@app.route('/api/v1/chat/media/uploads', methods=['POST'])
async def create_media_upload(request):
    current_user, tenant_id = _chat_media_identity(request)
    if current_user is None:
        return _current_session_error(request)
    body = request.json or {}
    try:
        payload = create_chat_media_upload(
            app,
            tenant_id,
            body.get("file_name"),
            body.get("content_type"),
            body.get("size"),
        )
        return json(payload, status=201)
    except ChatMediaError as error:
        return _media_error(error)
    except Exception as error:
        return _unexpected_media_error("upload preparation", error)


@app.route('/api/v1/chat/media/uploads/<upload_id>/complete', methods=['POST'])
async def complete_media_upload(request, upload_id):
    current_user, tenant_id = _chat_media_identity(request)
    if current_user is None:
        return _current_session_error(request)
    body = request.json or {}
    try:
        return json(complete_chat_media_upload(
            app,
            tenant_id,
            upload_id,
            body.get("size"),
            body.get("upload_token"),
        ))
    except ChatMediaError as error:
        return _media_error(error)
    except Exception as error:
        return _unexpected_media_error("upload verification", error)


@app.route('/api/v1/chat/media/<upload_id>', methods=['GET'])
async def get_chat_media(request, upload_id):
    current_user, tenant_id = _chat_media_identity(request)
    if current_user is None:
        return _current_session_error(request)
    force_download = str(request.args.get("download") or "").strip().lower() in {
        "1", "true", "yes", "on",
    }
    try:
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
