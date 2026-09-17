from pathlib import Path
import ast
import importlib.util
import sys
import types
from types import SimpleNamespace
import unittest
from unittest import mock


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PROJECT_ROOT.parent
SERVICE_PATH = PROJECT_ROOT / "application" / "services" / "chat_media_service.py"
CONTROLLER_PATH = PROJECT_ROOT / "application" / "controllers" / "api_chat_media.py"
PERSONAL_CLOUD_CONTROLLER_PATH = PROJECT_ROOT / "application" / "controllers" / "api_personal_cloud.py"
extensions = SimpleNamespace(minioclient=None, minio_public_client=None)
application_stub = types.ModuleType("application")
application_stub.extensions = extensions
service_spec = importlib.util.spec_from_file_location("chat_media_service_under_test", SERVICE_PATH)
service_module = importlib.util.module_from_spec(service_spec)
with mock.patch.dict(sys.modules, {"application": application_stub}):
    service_spec.loader.exec_module(service_module)

ChatMediaError = service_module.ChatMediaError
_object_name = service_module._object_name
_pending_object_name = service_module._pending_object_name
_personal_cloud_object_name = service_module._personal_cloud_object_name
_personal_cloud_pending_object_name = service_module._personal_cloud_pending_object_name
chat_media_status = service_module.chat_media_status
complete_chat_media_upload = service_module.complete_chat_media_upload
create_chat_media_upload = service_module.create_chat_media_upload
resolve_chat_media_download = service_module.resolve_chat_media_download
complete_personal_cloud_upload = service_module.complete_personal_cloud_upload
create_personal_cloud_upload = service_module.create_personal_cloud_upload
resolve_personal_cloud_download = service_module.resolve_personal_cloud_download


def function_source(path, function_name):
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    function = next(
        node for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == function_name
    )
    return ast.get_source_segment(source, function)


class FakeMinioClient:
    def __init__(self):
        self.objects = {}
        self.removed = []
        self.copied = []
        self.response_headers = None

    def presigned_put_object(self, bucket, object_name, expires):
        return "https://s3.upgo.vn/{}/{}?signed=put".format(bucket, object_name)

    def presigned_get_object(self, bucket, object_name, expires, response_headers=None):
        self.response_headers = response_headers
        return "https://s3.upgo.vn/{}/{}?signed=get".format(bucket, object_name)

    def stat_object(self, bucket, object_name):
        if object_name not in self.objects:
            error = RuntimeError("missing")
            error.code = "NoSuchKey"
            raise error
        return self.objects[object_name]

    def remove_object(self, bucket, object_name):
        self.removed.append((bucket, object_name))
        self.objects.pop(object_name, None)

    def copy_object(self, bucket, object_name, source):
        self.copied.append((bucket, source.object_name, object_name))
        original = self.objects[source.object_name]
        self.objects[object_name] = SimpleNamespace(
            size=original.size,
            content_type=original.content_type,
            etag="copied-{}".format(original.etag),
        )


class ChatMediaDeploymentContractTests(unittest.TestCase):
    def test_media_routes_reject_the_isolated_management_session_scope(self):
        identity_source = function_source(CONTROLLER_PATH, "_chat_media_identity")
        self.assertIn("management_session_requested(request)", identity_source)
        for route_name in ("create_media_upload", "complete_media_upload", "get_chat_media"):
            self.assertIn("_chat_media_identity(request)", function_source(CONTROLLER_PATH, route_name))

    def test_personal_cloud_routes_keep_owner_scope_in_the_session(self):
        source = PERSONAL_CLOUD_CONTROLLER_PATH.read_text(encoding="utf-8")
        self.assertIn("_user_id(current_user)", source)
        self.assertIn("PersonalCloudFile.owner_id == owner_id", source)
        self.assertIn("resolve_personal_cloud_download", source)
        self.assertIn("remove_personal_cloud_media", source)
        for route_name in (
            "create_personal_cloud_media_upload",
            "complete_personal_cloud_media_upload",
            "list_personal_cloud_files",
            "download_personal_cloud_file",
            "delete_personal_cloud_file",
        ):
            self.assertIn("_cloud_identity(request)", function_source(PERSONAL_CLOUD_CONTROLLER_PATH, route_name))

    def test_production_uses_public_s3_without_replacing_legacy_tinode_storage(self):
        compose = (REPOSITORY_ROOT / "infrastructure" / "production" / "compose.yaml").read_text(encoding="utf-8")
        env_example = (REPOSITORY_ROOT / "infrastructure" / "production" / ".env.example").read_text(encoding="utf-8")
        start_script = (REPOSITORY_ROOT / "infrastructure" / "production" / "start.sh").read_text(encoding="utf-8")
        storage_verifier = (PROJECT_ROOT / "scripts" / "verify_chat_media_storage.py").read_text(encoding="utf-8")
        cors_policy = (REPOSITORY_ROOT / "infrastructure" / "production" / "minio-cors.xml").read_text(encoding="utf-8")
        dockerfile = (REPOSITORY_ROOT / "infrastructure" / "production" / "Dockerfile").read_text(encoding="utf-8")
        mobile_client = (REPOSITORY_ROOT / "mobile" / "src" / "services" / "tinodeClient.ts").read_text(encoding="utf-8")

        self.assertIn("MINIO_URL=s3.upgo.vn", env_example)
        self.assertIn("MINIO_PUBLIC_DOMAIN=https://s3.upgo.vn", env_example)
        self.assertIn("MINIO_SECURE=true", env_example)
        self.assertIn("CHAT_MEDIA_STORAGE=s3", env_example)
        self.assertIn("CHAT_MEDIA_FALLBACK_TO_TINODE=false", env_example)
        self.assertIn("CHAT_MEDIA_COMPLETION_TTL=21600", env_example)
        self.assertIn("MINIO_ACCESS_KEY=replace-with-s3-access-key", env_example)
        self.assertIn("MINIO_SECRET_KEY=replace-with-s3-secret-key", env_example)
        self.assertIn("CHAT_MEDIA_SIGNING_SECRET: ${CHAT_MEDIA_SIGNING_SECRET:-}", compose)
        self.assertIn("CHAT_MEDIA_COMPLETION_TTL: ${CHAT_MEDIA_COMPLETION_TTL:-21600}", compose)
        self.assertIn("VITE_CHAT_MEDIA_STORAGE", compose)
        self.assertIn("ARG VITE_CHAT_MEDIA_STORAGE=tinode", dockerfile)
        self.assertIn("ensure_secret CHAT_MEDIA_SIGNING_SECRET", start_script)
        self.assertIn("CHAT_MEDIA_FALLBACK_TO_TINODE=false", start_script)
        self.assertIn("python scripts/verify_chat_media_storage.py", start_script)
        self.assertIn("requests.put", storage_verifier)
        self.assertIn("complete_chat_media_upload", storage_verifier)
        self.assertIn("requests.get", storage_verifier)
        self.assertIn("_remove_object", storage_verifier)
        self.assertIn("<AllowedOrigin>https://chat.upgo.vn</AllowedOrigin>", cors_policy)
        self.assertIn("<AllowedMethod>PUT</AllowedMethod>", cors_policy)
        self.assertIn("<AllowedMethod>GET</AllowedMethod>", cors_policy)
        self.assertIn("<AllowedMethod>HEAD</AllowedMethod>", cors_policy)
        self.assertIn("tinode_uploads:/opt/tinode/uploads", compose)
        self.assertIn("config.chatMediaStorage !== 's3'", mobile_client)
        self.assertIn("uploadChatMedia(file)", mobile_client)
        self.assertIn("resolveChatMediaDownloadUrl(url)", mobile_client)
        self.assertIn("resolveChatMediaDownloadUrl(file.url", mobile_client)


class ChatMediaServiceTests(unittest.TestCase):
    def setUp(self):
        self.client = FakeMinioClient()
        self.app = SimpleNamespace(config={
            "CHAT_MEDIA_STORAGE": "s3",
            "CHAT_MEDIA_FALLBACK_TO_TINODE": False,
            "CHAT_MEDIA_SIGNING_SECRET": "test-signing-secret-with-more-than-32-bytes",
            "CHAT_MEDIA_PUBLIC_BASE_URL": "https://chatmgt.upgo.vn",
            "CHAT_MEDIA_OBJECT_PREFIX": "vichat/chat-media",
            "CHAT_MEDIA_MAX_SIZE": 500 * 1024 * 1024,
            "CHAT_MEDIA_UPLOAD_URL_TTL": 300,
            "CHAT_MEDIA_COMPLETION_TTL": 21600,
            "CHAT_MEDIA_DOWNLOAD_URL_TTL": 300,
            "MINIO_BUCKET_NAME": "gonengage",
        })
        self.clients = mock.patch.multiple(
            extensions,
            minioclient=self.client,
            minio_public_client=self.client,
        )
        self.clients.start()
        self.addCleanup(self.clients.stop)
        self.copy_source = mock.patch.object(
            service_module,
            "_minio_copy_source",
            side_effect=lambda bucket, name, etag: SimpleNamespace(
                bucket_name=bucket,
                object_name=name,
                match_etag=etag,
            ),
        )
        self.copy_source.start()
        self.addCleanup(self.copy_source.stop)

    def prepare(self, tenant="tenant-a", size=5, content_type="image/png"):
        return create_chat_media_upload(
            self.app,
            tenant,
            "photo.png",
            content_type,
            size,
        )

    def prepare_cloud(self, tenant="tenant-a", owner="user-a", size=5, content_type="image/png"):
        return create_personal_cloud_upload(
            self.app,
            tenant,
            owner,
            "private-photo.png",
            content_type,
            size,
        )

    def test_reports_s3_only_when_signing_and_both_clients_are_configured(self):
        self.assertEqual(chat_media_status(self.app)["mode"], "s3")
        self.assertTrue(chat_media_status(self.app)["configured"])
        self.assertTrue(chat_media_status(self.app)["s3_read_configured"])
        self.assertFalse(chat_media_status(self.app)["fallback_to_tinode"])
        self.assertEqual(chat_media_status(self.app)["completion_ttl"], 21600)
        self.app.config["CHAT_MEDIA_SIGNING_SECRET"] = ""
        self.assertFalse(chat_media_status(self.app)["configured"])
        self.assertTrue(chat_media_status(self.app)["s3_read_configured"])

    def test_upload_ticket_binds_size_reference_and_tenant(self):
        prepared = self.prepare(size=5)
        self.assertTrue(prepared["upload_url"].startswith("https://s3.upgo.vn/"))
        self.assertTrue(prepared["ref"].startswith("https://chatmgt.upgo.vn/api/v1/chat/media/"))
        self.assertTrue(prepared["upload_token"])
        self.assertNotIn("tenant-a", prepared["upload_url"])
        self.assertIn("/_pending/", prepared["upload_url"])

        pending_object_name = _pending_object_name(self.app, "tenant-a", prepared["upload_id"])
        object_name = _object_name(self.app, "tenant-a", prepared["upload_id"])
        self.client.objects[pending_object_name] = SimpleNamespace(
            size=5,
            content_type="image/png",
            etag="etag",
        )
        completed = complete_chat_media_upload(
            self.app,
            "tenant-a",
            prepared["upload_id"],
            5,
            prepared["upload_token"],
        )
        self.assertEqual(completed["ref"], prepared["ref"])
        self.assertEqual(completed["size"], 5)
        self.assertIn(object_name, self.client.objects)
        self.assertNotIn(pending_object_name, self.client.objects)
        self.assertEqual(self.client.copied, [("gonengage", pending_object_name, object_name)])

        with self.assertRaisesRegex(ChatMediaError, "ticket is invalid"):
            complete_chat_media_upload(
                self.app,
                "tenant-b",
                prepared["upload_id"],
                5,
                prepared["upload_token"],
            )

    def test_size_mismatch_removes_the_untrusted_object(self):
        prepared = self.prepare(size=5)
        object_name = _pending_object_name(self.app, "tenant-a", prepared["upload_id"])
        self.client.objects[object_name] = SimpleNamespace(
            size=6,
            content_type="image/png",
            etag="etag",
        )
        with self.assertRaisesRegex(ChatMediaError, "size is invalid"):
            complete_chat_media_upload(
                self.app,
                "tenant-a",
                prepared["upload_id"],
                6,
                prepared["upload_token"],
            )
        self.assertEqual(self.client.removed, [("gonengage", object_name)])

    def test_content_type_mismatch_removes_the_untrusted_object(self):
        prepared = self.prepare(size=5, content_type="image/png")
        object_name = _pending_object_name(self.app, "tenant-a", prepared["upload_id"])
        self.client.objects[object_name] = SimpleNamespace(
            size=5,
            content_type="text/html",
            etag="etag",
        )
        with self.assertRaisesRegex(ChatMediaError, "type is invalid"):
            complete_chat_media_upload(
                self.app,
                "tenant-a",
                prepared["upload_id"],
                5,
                prepared["upload_token"],
            )
        self.assertEqual(self.client.removed, [("gonengage", object_name)])

    def test_download_uses_short_lived_url_and_forces_text_to_attachment(self):
        prepared = self.prepare(size=4, content_type="text/html")
        object_name = _object_name(self.app, "tenant-a", prepared["upload_id"])
        self.client.objects[object_name] = SimpleNamespace(
            size=4,
            content_type="text/html",
            etag="etag",
        )
        resolved = resolve_chat_media_download(
            self.app,
            "tenant-a",
            prepared["upload_id"],
            file_name="report.html",
        )
        self.assertTrue(resolved["url"].startswith("https://s3.upgo.vn/"))
        self.assertEqual(resolved["mime"], "application/octet-stream")
        self.assertEqual(self.client.response_headers["response-cache-control"], "private, no-store")

    def test_reused_put_url_cannot_replace_a_completed_object(self):
        prepared = self.prepare(size=4, content_type="image/png")
        pending_object_name = _pending_object_name(self.app, "tenant-a", prepared["upload_id"])
        object_name = _object_name(self.app, "tenant-a", prepared["upload_id"])
        self.client.objects[pending_object_name] = SimpleNamespace(
            size=4,
            content_type="image/png",
            etag="original",
        )
        first = complete_chat_media_upload(
            self.app,
            "tenant-a",
            prepared["upload_id"],
            4,
            prepared["upload_token"],
        )
        self.client.objects[pending_object_name] = SimpleNamespace(
            size=4,
            content_type="image/png",
            etag="replacement",
        )
        second = complete_chat_media_upload(
            self.app,
            "tenant-a",
            prepared["upload_id"],
            4,
            prepared["upload_token"],
        )

        self.assertEqual(first["etag"], "copied-original")
        self.assertEqual(second["etag"], "copied-original")
        self.assertEqual(self.client.objects[object_name].etag, "copied-original")
        self.assertNotIn(pending_object_name, self.client.objects)
        self.assertEqual(len(self.client.copied), 1)

    def test_tinode_upload_rollback_keeps_existing_s3_references_readable(self):
        prepared = self.prepare(size=4, content_type="image/png")
        object_name = _object_name(self.app, "tenant-a", prepared["upload_id"])
        self.client.objects[object_name] = SimpleNamespace(
            size=4,
            content_type="image/png",
            etag="etag",
        )
        self.app.config["CHAT_MEDIA_STORAGE"] = "tinode"
        with self.assertRaisesRegex(ChatMediaError, "uploads are disabled"):
            self.prepare(size=4, content_type="image/png")
        resolved = resolve_chat_media_download(
            self.app,
            "tenant-a",
            prepared["upload_id"],
        )
        self.assertTrue(resolved["url"].startswith("https://s3.upgo.vn/"))

    def test_personal_cloud_upload_path_and_ticket_are_owner_scoped(self):
        prepared = self.prepare_cloud(size=5)
        pending_object_name = _personal_cloud_pending_object_name(
            self.app,
            "tenant-a",
            "user-a",
            prepared["upload_id"],
        )
        completed_object_name = _personal_cloud_object_name(
            self.app,
            "tenant-a",
            "user-a",
            prepared["upload_id"],
        )
        self.assertIn("/_personal/", prepared["upload_url"])
        self.assertIn("/_personal/_pending/", pending_object_name)
        self.assertNotIn("user-a", prepared["upload_url"])
        self.client.objects[pending_object_name] = SimpleNamespace(
            size=5,
            content_type="image/png",
            etag="private-etag",
        )

        completed = complete_personal_cloud_upload(
            self.app,
            "tenant-a",
            "user-a",
            prepared["upload_id"],
            5,
            prepared["upload_token"],
        )

        self.assertEqual(completed["size"], 5)
        self.assertIn(completed_object_name, self.client.objects)
        self.assertNotIn(pending_object_name, self.client.objects)
        with self.assertRaisesRegex(ChatMediaError, "ticket is invalid"):
            complete_personal_cloud_upload(
                self.app,
                "tenant-a",
                "user-b",
                prepared["upload_id"],
                5,
                prepared["upload_token"],
            )

    def test_generic_chat_media_resolver_cannot_read_a_personal_cloud_object(self):
        prepared = self.prepare_cloud(size=4)
        object_name = _personal_cloud_object_name(
            self.app,
            "tenant-a",
            "user-a",
            prepared["upload_id"],
        )
        self.client.objects[object_name] = SimpleNamespace(
            size=4,
            content_type="application/pdf",
            etag="private-etag",
        )

        with self.assertRaisesRegex(ChatMediaError, "not found"):
            resolve_chat_media_download(self.app, "tenant-a", prepared["upload_id"])
        resolved = resolve_personal_cloud_download(
            self.app,
            "tenant-a",
            "user-a",
            prepared["upload_id"],
        )
        self.assertTrue(resolved["url"].startswith("https://s3.upgo.vn/"))


if __name__ == "__main__":
    unittest.main()
