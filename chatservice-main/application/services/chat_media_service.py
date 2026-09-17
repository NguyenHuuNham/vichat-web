import hashlib
import mimetypes
import re
import uuid
from datetime import datetime, timedelta, timezone

from itsdangerous import BadData, SignatureExpired, URLSafeTimedSerializer

from application import extensions


UPLOAD_ID_PATTERN = re.compile(
    r"^(?P<date>[0-9]{8})-(?P<id>[a-f0-9]{32})(?P<extension>\.[a-z0-9]{1,10})?$"
)
CONTENT_TYPE_PATTERN = re.compile(r"^[a-z0-9][a-z0-9.+-]*/[a-z0-9][a-z0-9.+-]*$")
SAFE_EXTENSION_PATTERN = re.compile(r"^\.[a-z0-9]{1,10}$")
DEFAULT_CONTENT_TYPE = "application/octet-stream"
UPLOAD_TICKET_SALT = "vichat-chat-media-upload-v1"
PERSONAL_CLOUD_UPLOAD_TICKET_SALT = "vichat-personal-cloud-upload-v1"


class ChatMediaError(Exception):
    def __init__(self, code, message, status_code=400):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def _config(app, name, default=None):
    return app.config.get(name, default)


def _positive_int(value, default, minimum=1, maximum=None):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = int(default)
    parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def chat_media_status(app):
    mode = str(_config(app, "CHAT_MEDIA_STORAGE", "tinode") or "tinode").strip().lower()
    s3_read_configured = bool(
        extensions.minioclient is not None
        and extensions.minio_public_client is not None
        and str(_config(app, "MINIO_BUCKET_NAME") or "").strip()
    )
    s3_upload_configured = bool(
        s3_read_configured
        and str(_config(app, "CHAT_MEDIA_SIGNING_SECRET") or "").strip()
    )
    return {
        "mode": mode,
        "configured": s3_upload_configured if mode == "s3" else True,
        "s3_read_configured": s3_read_configured,
        "fallback_to_tinode": bool(_config(app, "CHAT_MEDIA_FALLBACK_TO_TINODE", False)),
        "max_size": _positive_int(
            _config(app, "CHAT_MEDIA_MAX_SIZE"),
            524288000,
        ),
        "completion_ttl": _positive_int(
            _config(app, "CHAT_MEDIA_COMPLETION_TTL"),
            21600,
            minimum=60,
            maximum=86400,
        ),
    }


def _require_s3_storage(app):
    status = chat_media_status(app)
    if not status["s3_read_configured"]:
        raise ChatMediaError(
            "MEDIA_STORAGE_UNAVAILABLE",
            "S3 media storage is not fully configured.",
            503,
        )
    return status


def _require_upload_storage(app):
    status = chat_media_status(app)
    if status["mode"] != "s3":
        raise ChatMediaError(
            "MEDIA_STORAGE_DISABLED",
            "S3 media uploads are disabled.",
            503,
        )
    if not status["configured"]:
        raise ChatMediaError(
            "MEDIA_STORAGE_UNAVAILABLE",
            "S3 media uploads are not fully configured.",
            503,
        )
    return status


def _bucket_name(app):
    return str(_config(app, "MINIO_BUCKET_NAME") or "").strip()


def _object_prefix(app):
    value = str(
        _config(app, "CHAT_MEDIA_OBJECT_PREFIX", "vichat/chat-media")
        or "vichat/chat-media"
    )
    normalized = "/".join(
        segment for segment in re.sub(r"[^A-Za-z0-9._/-]+", "-", value).split("/")
        if segment not in ("", ".", "..")
    )
    return normalized or "vichat/chat-media"


def _tenant_segment(tenant_id):
    value = "vichat:{}".format(str(tenant_id or "").strip())
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


def _safe_content_type(value):
    normalized = str(value or "").split(";", 1)[0].strip().lower()
    return normalized if CONTENT_TYPE_PATTERN.match(normalized) else DEFAULT_CONTENT_TYPE


def _safe_extension(file_name, content_type):
    name = str(file_name or "").strip().lower()
    extension = "." + name.rsplit(".", 1)[1] if "." in name else ""
    if not SAFE_EXTENSION_PATTERN.match(extension):
        guessed = mimetypes.guess_extension(content_type, strict=False) or ""
        extension = guessed.lower() if SAFE_EXTENSION_PATTERN.match(guessed.lower()) else ""
    return ".jpg" if extension == ".jpe" else extension


def _safe_file_name(file_name):
    value = str(file_name or "").replace("\\", "/").rsplit("/", 1)[-1].strip()
    return (value or "tep-dinh-kem")[:500]


def _parse_upload_id(upload_id):
    normalized = str(upload_id or "").strip().lower()
    match = UPLOAD_ID_PATTERN.match(normalized)
    if not match:
        raise ChatMediaError("MEDIA_REFERENCE_INVALID", "The media reference is invalid.", 404)
    try:
        date = datetime.strptime(match.group("date"), "%Y%m%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise ChatMediaError("MEDIA_REFERENCE_INVALID", "The media reference is invalid.", 404)
    return normalized, date


def _object_name(app, tenant_id, upload_id):
    normalized, date = _parse_upload_id(upload_id)
    return "{}/{}/{:04d}/{:02d}/{}".format(
        _object_prefix(app),
        _tenant_segment(tenant_id),
        date.year,
        date.month,
        normalized,
    )


def _pending_object_name(app, tenant_id, upload_id):
    normalized, date = _parse_upload_id(upload_id)
    return "{}/_pending/{}/{:04d}/{:02d}/{}".format(
        _object_prefix(app),
        _tenant_segment(tenant_id),
        date.year,
        date.month,
        normalized,
    )


def _owner_segment(owner_id):
    value = "vichat:owner:{}".format(str(owner_id or "").strip())
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


def _personal_cloud_object_name(app, tenant_id, owner_id, upload_id):
    normalized, date = _parse_upload_id(upload_id)
    return "{}/_personal/{}/{}/{:04d}/{:02d}/{}".format(
        _object_prefix(app),
        _tenant_segment(tenant_id),
        _owner_segment(owner_id),
        date.year,
        date.month,
        normalized,
    )


def _personal_cloud_pending_object_name(app, tenant_id, owner_id, upload_id):
    normalized, date = _parse_upload_id(upload_id)
    return "{}/_personal/_pending/{}/{}/{:04d}/{:02d}/{}".format(
        _object_prefix(app),
        _tenant_segment(tenant_id),
        _owner_segment(owner_id),
        date.year,
        date.month,
        normalized,
    )


def _reference_url(app, upload_id):
    base_url = str(_config(app, "CHAT_MEDIA_PUBLIC_BASE_URL") or "").strip().rstrip("/")
    return "{}/api/v1/chat/media/{}".format(base_url, upload_id)


def _upload_ticket_serializer(app):
    secret = str(_config(app, "CHAT_MEDIA_SIGNING_SECRET") or "").strip()
    if not secret:
        raise ChatMediaError(
            "MEDIA_STORAGE_UNAVAILABLE",
            "S3 media upload signing is not configured.",
            503,
        )
    return URLSafeTimedSerializer(secret, salt=UPLOAD_TICKET_SALT)


def _create_upload_ticket(app, tenant_id, upload_id, size, content_type):
    return _upload_ticket_serializer(app).dumps({
        "v": 1,
        "tenant": _tenant_segment(tenant_id),
        "upload_id": upload_id,
        "size": int(size),
        "content_type": content_type,
    })


def _verify_upload_ticket(app, tenant_id, upload_id, upload_token):
    token = str(upload_token or "").strip()
    if not token:
        raise ChatMediaError(
            "MEDIA_UPLOAD_TICKET_REQUIRED",
            "The upload completion ticket is required.",
        )
    ttl = _positive_int(
        _config(app, "CHAT_MEDIA_COMPLETION_TTL"),
        21600,
        minimum=60,
        maximum=86400,
    )
    try:
        payload = _upload_ticket_serializer(app).loads(token, max_age=ttl)
    except SignatureExpired:
        raise ChatMediaError(
            "MEDIA_UPLOAD_TICKET_EXPIRED",
            "The upload completion ticket has expired.",
            409,
        )
    except BadData:
        raise ChatMediaError(
            "MEDIA_UPLOAD_TICKET_INVALID",
            "The upload completion ticket is invalid.",
        )
    if not isinstance(payload, dict) or int(payload.get("v") or 0) != 1:
        raise ChatMediaError(
            "MEDIA_UPLOAD_TICKET_INVALID",
            "The upload completion ticket is invalid.",
        )
    if (
        str(payload.get("tenant") or "") != _tenant_segment(tenant_id)
        or str(payload.get("upload_id") or "").lower() != str(upload_id or "").lower()
    ):
        raise ChatMediaError(
            "MEDIA_UPLOAD_TICKET_INVALID",
            "The upload completion ticket is invalid.",
        )
    return payload


def _personal_cloud_upload_ticket_serializer(app):
    secret = str(_config(app, "CHAT_MEDIA_SIGNING_SECRET") or "").strip()
    if not secret:
        raise ChatMediaError(
            "MEDIA_STORAGE_UNAVAILABLE",
            "S3 media upload signing is not configured.",
            503,
        )
    return URLSafeTimedSerializer(secret, salt=PERSONAL_CLOUD_UPLOAD_TICKET_SALT)


def _create_personal_cloud_upload_ticket(app, tenant_id, owner_id, upload_id, size, content_type, file_name):
    return _personal_cloud_upload_ticket_serializer(app).dumps({
        "v": 1,
        "scope": "personal-cloud",
        "tenant": _tenant_segment(tenant_id),
        "owner": _owner_segment(owner_id),
        "upload_id": upload_id,
        "size": int(size),
        "content_type": content_type,
        "file_name": _safe_file_name(file_name),
    })


def _verify_personal_cloud_upload_ticket(app, tenant_id, owner_id, upload_id, upload_token):
    token = str(upload_token or "").strip()
    if not token:
        raise ChatMediaError(
            "MEDIA_UPLOAD_TICKET_REQUIRED",
            "The upload completion ticket is required.",
        )
    ttl = _positive_int(
        _config(app, "CHAT_MEDIA_COMPLETION_TTL"),
        21600,
        minimum=60,
        maximum=86400,
    )
    try:
        payload = _personal_cloud_upload_ticket_serializer(app).loads(token, max_age=ttl)
    except SignatureExpired:
        raise ChatMediaError(
            "MEDIA_UPLOAD_TICKET_EXPIRED",
            "The upload completion ticket has expired.",
            409,
        )
    except BadData:
        raise ChatMediaError(
            "MEDIA_UPLOAD_TICKET_INVALID",
            "The upload completion ticket is invalid.",
        )
    if not isinstance(payload, dict) or int(payload.get("v") or 0) != 1:
        raise ChatMediaError(
            "MEDIA_UPLOAD_TICKET_INVALID",
            "The upload completion ticket is invalid.",
        )
    if (
        payload.get("scope") != "personal-cloud"
        or str(payload.get("tenant") or "") != _tenant_segment(tenant_id)
        or str(payload.get("owner") or "") != _owner_segment(owner_id)
        or str(payload.get("upload_id") or "").lower() != str(upload_id or "").lower()
    ):
        raise ChatMediaError(
            "MEDIA_UPLOAD_TICKET_INVALID",
            "The upload completion ticket is invalid.",
        )
    return payload


def _storage_clients():
    result = []
    for client in (extensions.minioclient, extensions.minio_public_client):
        if client is not None and all(client is not current for current in result):
            result.append(client)
    return result


def _stat_object(app, object_name):
    last_error = None
    for client in _storage_clients():
        try:
            return client.stat_object(_bucket_name(app), object_name)
        except Exception as error:
            last_error = error
    if last_error is not None:
        raise last_error
    raise ChatMediaError("MEDIA_STORAGE_UNAVAILABLE", "S3 media storage is unavailable.", 503)


def _remove_object(app, object_name):
    last_error = None
    for client in _storage_clients():
        try:
            client.remove_object(_bucket_name(app), object_name)
            return True
        except Exception as error:
            last_error = error
    if last_error is not None:
        raise last_error
    return False


def _minio_copy_source(bucket_name, object_name, etag):
    from minio.commonconfig import CopySource

    return CopySource(bucket_name, object_name, match_etag=etag or None)


def _copy_object(app, source_name, target_name, source_etag):
    last_error = None
    bucket_name = _bucket_name(app)
    for client in _storage_clients():
        try:
            return client.copy_object(
                bucket_name,
                target_name,
                _minio_copy_source(bucket_name, source_name, source_etag),
            )
        except Exception as error:
            last_error = error
    if last_error is not None:
        raise last_error
    raise ChatMediaError("MEDIA_STORAGE_UNAVAILABLE", "S3 media storage is unavailable.", 503)


def _is_missing_object(error):
    return str(getattr(error, "code", "")) in {
        "NoSuchKey",
        "NoSuchObject",
        "NotFound",
    }


def create_chat_media_upload(app, tenant_id, file_name, content_type, size):
    status = _require_upload_storage(app)
    try:
        expected_size = int(size)
    except (TypeError, ValueError):
        expected_size = 0
    if expected_size <= 0:
        raise ChatMediaError("MEDIA_FILE_EMPTY", "The upload must contain a non-empty file.")
    if expected_size > status["max_size"]:
        raise ChatMediaError("MEDIA_FILE_TOO_LARGE", "The upload exceeds the configured size limit.", 413)

    normalized_type = _safe_content_type(content_type)
    extension = _safe_extension(file_name, normalized_type)
    upload_id = "{}-{}{}".format(
        datetime.now(timezone.utc).strftime("%Y%m%d"),
        uuid.uuid4().hex,
        extension,
    )
    object_name = _pending_object_name(app, tenant_id, upload_id)
    ttl = _positive_int(
        _config(app, "CHAT_MEDIA_UPLOAD_URL_TTL"),
        300,
        minimum=60,
        maximum=3600,
    )
    upload_url = extensions.minio_public_client.presigned_put_object(
        _bucket_name(app),
        object_name,
        expires=timedelta(seconds=ttl),
    )
    return {
        "storage": "s3",
        "upload_id": upload_id,
        "upload_url": upload_url,
        "method": "PUT",
        "headers": {"Content-Type": normalized_type},
        "expires_in": ttl,
        "max_size": status["max_size"],
        "ref": _reference_url(app, upload_id),
        "upload_token": _create_upload_ticket(
            app,
            tenant_id,
            upload_id,
            expected_size,
            normalized_type,
        ),
    }


def complete_chat_media_upload(app, tenant_id, upload_id, expected_size, upload_token):
    status = _require_upload_storage(app)
    normalized_id, _date = _parse_upload_id(upload_id)
    ticket = _verify_upload_ticket(
        app,
        tenant_id,
        normalized_id,
        upload_token,
    )
    object_name = _object_name(app, tenant_id, normalized_id)
    pending_object_name = _pending_object_name(app, tenant_id, normalized_id)
    try:
        requested_size = int(expected_size)
    except (TypeError, ValueError):
        requested_size = 0
    ticket_size = int(ticket.get("size") or 0)
    ticket_type = _safe_content_type(ticket.get("content_type"))

    # A completed object is immutable. Retried completion requests return the
    # original object and discard any later reuse of the still-live PUT URL.
    try:
        completed_stat = _stat_object(app, object_name)
    except Exception as error:
        if not _is_missing_object(error):
            raise
        completed_stat = None
    if completed_stat is not None:
        completed_size = int(getattr(completed_stat, "size", 0) or 0)
        completed_type = _safe_content_type(getattr(completed_stat, "content_type", ""))
        if (
            requested_size <= 0
            or requested_size != ticket_size
            or completed_size != ticket_size
            or completed_size > status["max_size"]
        ):
            raise ChatMediaError("MEDIA_UPLOAD_SIZE_MISMATCH", "The completed object size is invalid.", 409)
        if completed_type != ticket_type:
            raise ChatMediaError("MEDIA_UPLOAD_TYPE_MISMATCH", "The completed object type is invalid.", 409)
        try:
            _remove_object(app, pending_object_name)
        except Exception:
            pass
        return {
            "storage": "s3",
            "upload_id": normalized_id,
            "ref": _reference_url(app, normalized_id),
            "size": completed_size,
            "mime": completed_type,
            "etag": str(getattr(completed_stat, "etag", "") or ""),
        }

    try:
        pending_stat = _stat_object(app, pending_object_name)
    except Exception as error:
        if _is_missing_object(error):
            raise ChatMediaError("MEDIA_UPLOAD_NOT_FOUND", "The uploaded object was not found.", 409)
        raise

    actual_size = int(getattr(pending_stat, "size", 0) or 0)
    actual_type = _safe_content_type(getattr(pending_stat, "content_type", ""))
    if (
        requested_size <= 0
        or requested_size != ticket_size
        or actual_size != ticket_size
        or actual_size > status["max_size"]
    ):
        try:
            _remove_object(app, pending_object_name)
        except Exception:
            pass
        raise ChatMediaError("MEDIA_UPLOAD_SIZE_MISMATCH", "The uploaded object size is invalid.", 409)
    if actual_type != ticket_type:
        try:
            _remove_object(app, pending_object_name)
        except Exception:
            pass
        raise ChatMediaError("MEDIA_UPLOAD_TYPE_MISMATCH", "The uploaded object type is invalid.", 409)

    _copy_object(
        app,
        pending_object_name,
        object_name,
        str(getattr(pending_stat, "etag", "") or ""),
    )
    completed_stat = _stat_object(app, object_name)
    completed_size = int(getattr(completed_stat, "size", 0) or 0)
    completed_type = _safe_content_type(getattr(completed_stat, "content_type", ""))
    if completed_size != ticket_size or completed_type != ticket_type:
        try:
            _remove_object(app, object_name)
        except Exception:
            pass
        raise ChatMediaError("MEDIA_UPLOAD_COPY_MISMATCH", "The completed media object is invalid.", 503)
    try:
        _remove_object(app, pending_object_name)
    except Exception:
        pass

    return {
        "storage": "s3",
        "upload_id": normalized_id,
        "ref": _reference_url(app, normalized_id),
        "size": completed_size,
        "mime": completed_type,
        "etag": str(getattr(completed_stat, "etag", "") or ""),
    }


def create_personal_cloud_upload(app, tenant_id, owner_id, file_name, content_type, size):
    status = _require_upload_storage(app)
    try:
        expected_size = int(size)
    except (TypeError, ValueError):
        expected_size = 0
    if expected_size <= 0:
        raise ChatMediaError("MEDIA_FILE_EMPTY", "The upload must contain a non-empty file.")
    if expected_size > status["max_size"]:
        raise ChatMediaError("MEDIA_FILE_TOO_LARGE", "The upload exceeds the configured size limit.", 413)

    safe_name = _safe_file_name(file_name)
    normalized_type = _safe_content_type(content_type)
    extension = _safe_extension(safe_name, normalized_type)
    upload_id = "{}-{}{}".format(
        datetime.now(timezone.utc).strftime("%Y%m%d"),
        uuid.uuid4().hex,
        extension,
    )
    object_name = _personal_cloud_pending_object_name(app, tenant_id, owner_id, upload_id)
    ttl = _positive_int(
        _config(app, "CHAT_MEDIA_UPLOAD_URL_TTL"),
        300,
        minimum=60,
        maximum=3600,
    )
    upload_url = extensions.minio_public_client.presigned_put_object(
        _bucket_name(app),
        object_name,
        expires=timedelta(seconds=ttl),
    )
    return {
        "storage": "s3",
        "scope": "personal-cloud",
        "upload_id": upload_id,
        "file_name": safe_name,
        "upload_url": upload_url,
        "method": "PUT",
        "headers": {"Content-Type": normalized_type},
        "expires_in": ttl,
        "max_size": status["max_size"],
        "upload_token": _create_personal_cloud_upload_ticket(
            app,
            tenant_id,
            owner_id,
            upload_id,
            expected_size,
            normalized_type,
            safe_name,
        ),
    }


def complete_personal_cloud_upload(app, tenant_id, owner_id, upload_id, expected_size, upload_token):
    status = _require_upload_storage(app)
    normalized_id, _date = _parse_upload_id(upload_id)
    ticket = _verify_personal_cloud_upload_ticket(
        app,
        tenant_id,
        owner_id,
        normalized_id,
        upload_token,
    )
    object_name = _personal_cloud_object_name(app, tenant_id, owner_id, normalized_id)
    pending_object_name = _personal_cloud_pending_object_name(app, tenant_id, owner_id, normalized_id)
    try:
        requested_size = int(expected_size)
    except (TypeError, ValueError):
        requested_size = 0
    ticket_size = int(ticket.get("size") or 0)
    ticket_type = _safe_content_type(ticket.get("content_type"))

    try:
        completed_stat = _stat_object(app, object_name)
    except Exception as error:
        if not _is_missing_object(error):
            raise
        completed_stat = None
    if completed_stat is not None:
        completed_size = int(getattr(completed_stat, "size", 0) or 0)
        completed_type = _safe_content_type(getattr(completed_stat, "content_type", ""))
        if (
            requested_size <= 0
            or requested_size != ticket_size
            or completed_size != ticket_size
            or completed_size > status["max_size"]
        ):
            raise ChatMediaError("MEDIA_UPLOAD_SIZE_MISMATCH", "The completed object size is invalid.", 409)
        if completed_type != ticket_type:
            raise ChatMediaError("MEDIA_UPLOAD_TYPE_MISMATCH", "The completed object type is invalid.", 409)
        try:
            _remove_object(app, pending_object_name)
        except Exception:
            pass
        return {
            "storage": "s3",
            "scope": "personal-cloud",
            "upload_id": normalized_id,
            "file_name": _safe_file_name(ticket.get("file_name")),
            "size": completed_size,
            "mime": completed_type,
            "etag": str(getattr(completed_stat, "etag", "") or ""),
        }

    try:
        pending_stat = _stat_object(app, pending_object_name)
    except Exception as error:
        if _is_missing_object(error):
            raise ChatMediaError("MEDIA_UPLOAD_NOT_FOUND", "The uploaded object was not found.", 409)
        raise

    actual_size = int(getattr(pending_stat, "size", 0) or 0)
    actual_type = _safe_content_type(getattr(pending_stat, "content_type", ""))
    if (
        requested_size <= 0
        or requested_size != ticket_size
        or actual_size != ticket_size
        or actual_size > status["max_size"]
    ):
        try:
            _remove_object(app, pending_object_name)
        except Exception:
            pass
        raise ChatMediaError("MEDIA_UPLOAD_SIZE_MISMATCH", "The uploaded object size is invalid.", 409)
    if actual_type != ticket_type:
        try:
            _remove_object(app, pending_object_name)
        except Exception:
            pass
        raise ChatMediaError("MEDIA_UPLOAD_TYPE_MISMATCH", "The uploaded object type is invalid.", 409)

    _copy_object(
        app,
        pending_object_name,
        object_name,
        str(getattr(pending_stat, "etag", "") or ""),
    )
    completed_stat = _stat_object(app, object_name)
    completed_size = int(getattr(completed_stat, "size", 0) or 0)
    completed_type = _safe_content_type(getattr(completed_stat, "content_type", ""))
    if completed_size != ticket_size or completed_type != ticket_type:
        try:
            _remove_object(app, object_name)
        except Exception:
            pass
        raise ChatMediaError("MEDIA_UPLOAD_COPY_MISMATCH", "The completed media object is invalid.", 503)
    try:
        _remove_object(app, pending_object_name)
    except Exception:
        pass

    return {
        "storage": "s3",
        "scope": "personal-cloud",
        "upload_id": normalized_id,
        "file_name": _safe_file_name(ticket.get("file_name")),
        "size": completed_size,
        "mime": completed_type,
        "etag": str(getattr(completed_stat, "etag", "") or ""),
    }


def remove_personal_cloud_media(app, tenant_id, owner_id, upload_id):
    normalized_id, _date = _parse_upload_id(upload_id)
    return _remove_object(app, _personal_cloud_object_name(app, tenant_id, owner_id, normalized_id))


def _download_content_type(value):
    content_type = _safe_content_type(value)
    if content_type == "image/svg+xml" or content_type.startswith("text/"):
        return DEFAULT_CONTENT_TYPE, True
    if content_type.startswith(("image/", "audio/", "video/")) or content_type == "application/pdf":
        return content_type, False
    return DEFAULT_CONTENT_TYPE, True


def _download_file_name(value, upload_id):
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value or "").strip())
    return (normalized or upload_id)[:180]


def resolve_chat_media_download(app, tenant_id, upload_id, file_name="", force_download=False):
    _require_s3_storage(app)
    normalized_id, _date = _parse_upload_id(upload_id)
    object_name = _object_name(app, tenant_id, normalized_id)
    try:
        stat = _stat_object(app, object_name)
    except Exception as error:
        if _is_missing_object(error):
            raise ChatMediaError("MEDIA_NOT_FOUND", "The media object was not found.", 404)
        raise

    content_type, unsafe_inline = _download_content_type(getattr(stat, "content_type", ""))
    response_headers = {
        "response-cache-control": "private, no-store",
        "response-content-type": content_type,
    }
    if force_download or unsafe_inline:
        response_headers["response-content-disposition"] = 'attachment; filename="{}"'.format(
            _download_file_name(file_name, normalized_id)
        )
    ttl = _positive_int(
        _config(app, "CHAT_MEDIA_DOWNLOAD_URL_TTL"),
        300,
        minimum=30,
        maximum=3600,
    )
    download_url = extensions.minio_public_client.presigned_get_object(
        _bucket_name(app),
        object_name,
        expires=timedelta(seconds=ttl),
        response_headers=response_headers,
    )
    return {
        "storage": "s3",
        "upload_id": normalized_id,
        "url": download_url,
        "expires_in": ttl,
        "size": int(getattr(stat, "size", 0) or 0),
        "mime": content_type,
    }


def resolve_personal_cloud_download(app, tenant_id, owner_id, upload_id, file_name="", force_download=False):
    _require_s3_storage(app)
    normalized_id, _date = _parse_upload_id(upload_id)
    object_name = _personal_cloud_object_name(app, tenant_id, owner_id, normalized_id)
    try:
        stat = _stat_object(app, object_name)
    except Exception as error:
        if _is_missing_object(error):
            raise ChatMediaError("MEDIA_NOT_FOUND", "The media object was not found.", 404)
        raise

    content_type, unsafe_inline = _download_content_type(getattr(stat, "content_type", ""))
    response_headers = {
        "response-cache-control": "private, no-store",
        "response-content-type": content_type,
    }
    if force_download or unsafe_inline:
        response_headers["response-content-disposition"] = 'attachment; filename="{}"'.format(
            _download_file_name(file_name, normalized_id)
        )
    ttl = _positive_int(
        _config(app, "CHAT_MEDIA_DOWNLOAD_URL_TTL"),
        300,
        minimum=30,
        maximum=3600,
    )
    download_url = extensions.minio_public_client.presigned_get_object(
        _bucket_name(app),
        object_name,
        expires=timedelta(seconds=ttl),
        response_headers=response_headers,
    )
    return {
        "storage": "s3",
        "scope": "personal-cloud",
        "upload_id": normalized_id,
        "url": download_url,
        "expires_in": ttl,
        "size": int(getattr(stat, "size", 0) or 0),
        "mime": content_type,
    }
