import sys
import uuid
from pathlib import Path

import requests


APPLICATION_ROOT = Path(__file__).resolve().parents[1]
if str(APPLICATION_ROOT) not in sys.path:
    sys.path.insert(0, str(APPLICATION_ROOT))

from application import extensions
from application.server import app
from application.services.chat_media_service import (
    _object_name,
    _pending_object_name,
    _remove_object,
    complete_chat_media_upload,
    create_chat_media_upload,
    resolve_chat_media_download,
)


def main():
    probe_bytes = b"x"
    tenant_id = "deployment-media-probe-{}".format(uuid.uuid4().hex)
    prepared = create_chat_media_upload(
        app,
        tenant_id,
        "deployment-probe.bin",
        "application/octet-stream",
        len(probe_bytes),
    )
    pending_name = _pending_object_name(app, tenant_id, prepared["upload_id"])
    object_name = _object_name(app, tenant_id, prepared["upload_id"])
    completed = False
    try:
        upload = requests.put(
            prepared["upload_url"],
            data=probe_bytes,
            headers=prepared.get("headers") or {},
            timeout=30,
        )
        if upload.status_code < 200 or upload.status_code >= 300:
            raise RuntimeError(
                "The presigned S3 upload probe returned HTTP {}.".format(upload.status_code)
            )
        verified = complete_chat_media_upload(
            app,
            tenant_id,
            prepared["upload_id"],
            len(probe_bytes),
            prepared["upload_token"],
        )
        download = resolve_chat_media_download(app, tenant_id, prepared["upload_id"])
        downloaded = requests.get(download["url"], timeout=30)
        if downloaded.status_code != 200 or downloaded.content != probe_bytes:
            raise RuntimeError("The presigned S3 download probe did not return the uploaded byte.")
        if verified.get("size") != len(probe_bytes):
            raise RuntimeError("The completed S3 probe has an unexpected size.")
        completed = True
    finally:
        cleanup_errors = []
        for name in (pending_name, object_name):
            try:
                _remove_object(app, name)
            except Exception as error:
                cleanup_errors.append(type(error).__name__)
        if completed and cleanup_errors:
            raise RuntimeError("The S3 probe completed but its temporary objects could not be removed.")

    if extensions.minioclient is None or extensions.minio_public_client is None:
        raise RuntimeError("Both internal and public MinIO clients must remain configured.")
    print("S3 upload, verification, download, copy, and cleanup checks passed.")


if __name__ == "__main__":
    main()
