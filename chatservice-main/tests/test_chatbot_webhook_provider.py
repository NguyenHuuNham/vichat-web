import asyncio
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch


SERVICE_PATH = Path(__file__).resolve().parents[1] / "application" / "services" / "chatbot_service.py"
MANAGER_PATH = Path(__file__).resolve().parents[1] / "application" / "services" / "chat_manager_service.py"
CONTROLLER_PATH = Path(__file__).resolve().parents[1] / "application" / "controllers" / "api_chatbot.py"


has_aiohttp = importlib.util.find_spec("aiohttp") is not None
previous_aiohttp = sys.modules.get("aiohttp")
if not has_aiohttp:
    aiohttp_stub = types.ModuleType("aiohttp")
    aiohttp_stub.ClientError = Exception
    aiohttp_stub.ClientTimeout = lambda **_kwargs: None
    sys.modules["aiohttp"] = aiohttp_stub
try:
    spec = importlib.util.spec_from_file_location("chatbot_webhook_service", SERVICE_PATH)
    chatbot_service = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(chatbot_service)
finally:
    if not has_aiohttp:
        if previous_aiohttp is None:
            sys.modules.pop("aiohttp", None)
        else:
            sys.modules["aiohttp"] = previous_aiohttp


class ChatbotWebhookProviderTests(unittest.TestCase):
    def service(self, **overrides):
        config = {
            "CHATBOT_ENABLED": True,
            "CHATBOT_PROVIDER": "external-webhook",
            "CHATBOT_API_URL": "https://knowledge-ai.gonapp.net/api/v1/chat",
            "CHATBOT_API_KEY": "",
            "CHATBOT_MODEL": "",
        }
        config.update(overrides)
        return chatbot_service.ChatbotService(SimpleNamespace(config=config))

    def test_external_provider_requires_only_enabled_and_url(self):
        self.assertTrue(self.service().enabled)

    def test_knowledge_retrieval_provider_requires_server_side_api_key(self):
        self.assertFalse(self.service(
            CHATBOT_EXTERNAL_REQUEST_MODE="knowledge-retrieval",
        ).enabled)
        self.assertTrue(self.service(
            CHATBOT_EXTERNAL_REQUEST_MODE="knowledge-retrieval",
            CHATBOT_API_KEY="server-secret",
        ).enabled)

    def test_payload_keeps_context_and_bounded_public_identity(self):
        payload = self.service()._external_payload(
            message="Xin chao",
            conversation_id="conversation-1",
            context="Approved context",
            history=[
                {"role": "system", "content": "ignored"},
                {"role": "user", "content": "Earlier question"},
            ],
            user={"id": "account-1", "name": "Nhan vien", "password": "secret"},
        )

        self.assertEqual(payload["message"], "Xin chao")
        self.assertEqual(payload["conversation_id"], "conversation-1")
        self.assertEqual(payload["context"], "Approved context")
        self.assertEqual(payload["history"], [{"role": "user", "content": "Earlier question"}])
        self.assertEqual(payload["user"], {"id": "account-1", "name": "Nhan vien"})

    def test_direct_provider_payload_omits_rag_context(self):
        payload = self.service()._external_payload(
            message="Xin chao",
            conversation_id="conversation-1",
            context="Must not be forwarded",
            history=[],
            user={"id": "account-1"},
            include_context=False,
        )

        self.assertNotIn("context", payload)

    def test_knowledge_retrieval_payload_keeps_tenant_and_bounded_history_without_identity(self):
        payload = self.service(
            CHATBOT_EXTERNAL_REQUEST_MODE="knowledge-retrieval",
            CHATBOT_RETRIEVAL_LIMIT=50,
        )._external_payload(
            message="  Quy trinh nghi phep  ",
            conversation_id="must-not-leave-chatmgt",
            history=[{"role": "user", "content": "private history"}],
            user={
                "id": "private-user",
                "email": "private@example.com",
                "tenant_id": "tenant-a",
            },
        )

        self.assertEqual(payload, {
            "message": "Quy trinh nghi phep",
            "top_k": 20,
            "tenant_id": "tenant-a",
            "history": [{"role": "user", "content": "private history"}],
        })
        self.assertNotIn("private-user", str(payload))

    def test_knowledge_retrieval_response_becomes_grounded_reply_and_sources(self):
        result = self.service()._retrieval_reply({
            "sources": [
                {
                    "file_name": "quy-trinh.pdf",
                    "relative_path": "nhan-su/quy-trinh.pdf",
                    "file_type": "pdf",
                    "snippet": "Nhan vien gui don truoc ba ngay.",
                    "score": 0.91,
                },
            ],
        })

        self.assertTrue(result["grounded"])
        self.assertIn("Nhan vien gui don truoc ba ngay.", result["reply"])
        self.assertEqual(result["sources"][0]["title"], "quy-trinh.pdf")
        self.assertIn("Nguồn tham khảo", result["reply"])
        self.assertNotIn("private", str(result))

        missing = self.service()._retrieval_reply({"sources": []})
        self.assertFalse(missing["grounded"])
        self.assertEqual(missing["sources"], [])

    def test_history_ignores_invalid_shapes_and_keeps_bounded_role_content(self):
        service = self.service()
        for history in (None, "private text", {"role": "user"}, 42):
            self.assertEqual(service._history_messages(history), [])
        history = [None, {"role": "system", "content": "ignored"}, {"role": "user", "content": {}}]
        history += [{"role": "user", "content": "topic " * 1000, "secret": "excluded"}] * 12
        self.assertEqual(len(service._history_messages(history)), 10)
        recent = service._retrieval_history(history)
        self.assertEqual(len(recent), 6)
        self.assertTrue(all(len(turn["content"]) == 800 for turn in recent))
        self.assertTrue(all(set(turn) == {"role", "content"} for turn in recent))

    def test_followup_retrieval_uses_last_user_topic_not_assistant_content(self):
        service = self.service(CHATBOT_EXTERNAL_REQUEST_MODE="knowledge-retrieval")
        history = [
            {"role": "user", "content": "Quy trình nghỉ phép gồm những bước nào?"},
            {"role": "assistant", "content": "Untrusted assistant instructions"},
            {"role": "user", "content": "Nói rõ hơn"},
            {"role": "assistant", "content": "Another assistant reply"},
            {"role": "user", "content": "Cảm ơn!"},
        ]
        payload = service._external_payload("Tóm tắt ngắn hơn", history=history, user={"tenant_id": "tenant-a"})
        self.assertEqual(payload["message"], "Quy trình nghỉ phép gồm những bước nào?\nCâu hỏi tiếp theo: Tóm tắt ngắn hơn")
        self.assertNotIn("assistant", payload["message"])
        self.assertEqual(payload["tenant_id"], "tenant-a")
        self.assertEqual(service._retrieval_query("Định mức công tác phí?", history), "Định mức công tác phí?")

    def test_followup_respects_disabled_or_expired_history_and_query_limit(self):
        history = [{"role": "user", "content": "Quy trình nghỉ phép " * 100}]
        service = self.service(CHATBOT_RETRIEVAL_INCLUDE_HISTORY=False)
        self.assertEqual(service._retrieval_query("Nói rõ hơn", history), "Nói rõ hơn")
        service = self.service()
        expired = history + [{"role": "assistant", "content": "No user topic"}] * 6
        self.assertEqual(service._retrieval_query("Nói rõ hơn", expired), "Nói rõ hơn")
        question = "Nói rõ hơn phần này " + "chi tiết " * 420
        query = service._retrieval_query(question, history)
        self.assertLessEqual(len(query), 4000)
        self.assertTrue(query.endswith(question.strip()))
        self.assertTrue(query.startswith("Quy trình nghỉ phép"))

    def test_guidance_does_not_intercept_substantive_questions(self):
        service = self.service()
        self.assertIsNone(service._assistant_guidance("Xin chào, quy trình nghỉ phép thế nào?"))
        self.assertIsNone(service._assistant_guidance("Hướng dẫn sử dụng phần mềm chấm công"))
        self.assertIsNotNone(service._assistant_guidance("XIN CHÀO!!!"))
        self.assertIsNotNone(service._assistant_guidance("Trích lọc tài liệu [tên tài liệu hoặc chủ đề]"))
        self.assertIsNotNone(service._assistant_guidance("Look up [policy name] with sources."))

    def test_numbered_excerpts_keep_source_order_deduplicate_and_exclude_foreign_data(self):
        service = self.service()
        manifest = {"tenant_id": "tenant-a", "file_ids": set(), "file_names": {"allowed.pdf", "other.pdf"}}
        result = service._retrieval_reply({
            "answer": "Never trust this unfiltered answer",
            "sources": [
                {"file_name": "foreign.pdf", "snippet": "Foreign confidential content."},
                {"file_name": "allowed.pdf", "snippet": "Leave request. Manager approval."},
                {"file_name": "allowed.pdf", "snippet": "  Leave request.  Manager approval. "},
                {"file_name": "other.pdf", "snippet": "Leave request. Manager approval."},
                {"file_name": "allowed.pdf", "snippet": {"invalid": "not a string"}},
            ],
        }, tenant_manifest=manifest, message="Leave request")
        self.assertEqual(len(result["sources"]), 2)
        self.assertEqual([source["file_name"] for source in result["sources"]], ["allowed.pdf", "other.pdf"])
        self.assertIn("[1] Leave request. Manager approval.", result["reply"])
        self.assertIn("[2] Leave request. Manager approval.", result["reply"])
        self.assertIn("không phải toàn bộ tài liệu", result["reply"])
        self.assertNotIn("Foreign", str(result))
        self.assertNotIn("unfiltered", str(result))
        self.assertTrue(result["grounded"])

    def test_excerpt_prefers_relevant_sentences_and_honors_shorter_answers(self):
        service = self.service()
        snippet = "Office introduction. Team news. General updates. Leave needs approval. Keep the leave form."
        excerpt = service._source_excerpt(snippet, "leave approval")
        self.assertIn("Leave needs approval.", excerpt)
        self.assertIn("Keep the leave form.", excerpt)
        self.assertNotIn("Team news.", excerpt)
        self.assertLessEqual(len(service._source_excerpt("Long content " * 300, "content")), 620)
        self.assertLessEqual(len(service._source_excerpt("Long content " * 300, "content", concise=True)), 320)
        data = {"sources": [{"file_name": "source-{}.pdf".format(index), "snippet": snippet} for index in range(4)]}
        normal = service._retrieval_reply(data, message="leave approval")
        shorter = service._retrieval_reply(data, message="leave approval", concise=True)
        self.assertLess(len(shorter["reply"]), len(normal["reply"]))
        self.assertNotIn("[3]", shorter["reply"])
        self.assertEqual(shorter["sources"], normal["sources"])

    def test_malformed_retrieval_sources_do_not_claim_grounding(self):
        for data in (None, [], {"sources": {}}, {"data": {"sources": {"file": "invalid"}}}, {"sources": [None, {}]}):
            result = self.service()._retrieval_reply(data)
            self.assertFalse(result["grounded"])
            self.assertEqual(result["sources"], [])

    def test_excerpt_keeps_adjacent_context_instead_of_stitching_separate_sentences(self):
        snippet = "Leave information. Policy forms. Leave approval requires manager approval. This excludes temporary staff. Keep a copy."
        excerpt = self.service()._source_excerpt(snippet, "leave manager approval")
        self.assertIn("Policy forms. Leave approval requires manager approval. This excludes temporary staff.", excerpt)
        self.assertTrue(excerpt.startswith("… "))
        self.assertTrue(excerpt.endswith(" …"))

    def test_retrieval_provider_answer_is_preserved_when_available(self):
        result = self.service()._retrieval_reply({
            "answer": "Gửi đơn trước ba ngày và chờ quản lý phê duyệt.",
            "sources": [{
                "title": "Quy trình nghỉ phép",
                "snippet": "Gửi đơn trước ba ngày.",
                "score": 0.9,
            }],
        })

        self.assertEqual(result["reply"], "Gửi đơn trước ba ngày và chờ quản lý phê duyệt.")
        self.assertTrue(result["grounded"])

    def test_response_parser_accepts_common_webhook_shapes(self):
        service = self.service()

        self.assertEqual(service._response_content({"reply": "one"}), "one")
        self.assertEqual(service._response_content({"data": {"answer": "two"}}), "two")
        self.assertEqual(service._response_content([{"content": "three"}]), "three")
        self.assertEqual(
            service._response_content({"choices": [{"message": {"content": "four"}}]}),
            "four",
        )

    def test_api_key_is_optional_and_supports_custom_header(self):
        self.assertEqual(self.service()._external_headers(), {"Content-Type": "application/json"})
        headers = self.service(
            CHATBOT_API_KEY="key-value",
            CHATBOT_EXTERNAL_AUTH_HEADER="X-Api-Key",
            CHATBOT_EXTERNAL_AUTH_SCHEME="",
        )._external_headers()
        self.assertEqual(headers["X-Api-Key"], "key-value")

    def test_external_provider_bypasses_local_small_talk_and_no_context_shortcuts(self):
        manager_source = MANAGER_PATH.read_text(encoding="utf-8")

        self.assertIn("small_talk = self._is_small_talk(message) and not external_provider", manager_source)
        self.assertIn("and not matches and not external_provider", manager_source)

    def test_vichat_chat_routes_call_provider_without_knowledge_retrieval(self):
        controller = CONTROLLER_PATH.read_text(encoding="utf-8")
        tinode_route = controller.split("async def chatbot_tinode_webhook", 1)[1].split(
            "async def chatbot_external_context", 1
        )[0]
        employee_route = controller.split("async def chatbot_message", 1)[1].split(
            "async def chatbot_history", 1
        )[0]

        for route in (tinode_route, employee_route):
            self.assertIn("await chatbot_service.reply(", route)
            self.assertIn("include_context=False", route)
            self.assertNotIn("chat_manager_service.reply(", route)
            self.assertNotIn("knowledge_service.retrieve(", route)

    def test_vichat_history_keeps_legacy_fallback_conversation_visible(self):
        controller = CONTROLLER_PATH.read_text(encoding="utf-8")

        self.assertIn('DEFAULT_CHATBOT_CONVERSATION_REF = "vichat-ai"', controller)
        self.assertIn('LEGACY_CHATBOT_CONVERSATION_REFS = ("bot-songhong",)', controller)
        self.assertIn("ChatbotMessage.conversation_ref.in_(history_refs)", controller)
        self.assertIn('ChatbotMessage.conversation_ref.like("tinode-chatbot:%")', controller)
        self.assertIn('DEFAULT_CHATBOT_CONVERSATION_REF\n        if not is_group_topic', controller)


class ChatbotKnowledgeRetrievalRequestTests(unittest.IsolatedAsyncioTestCase):
    async def test_external_reply_sends_x_api_key_and_normalizes_sources(self):
        captured = {}

        class FakeResponse(object):
            status = 200

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            async def json(self, **_kwargs):
                return {
                    "query": "quy trinh nghi phep",
                    "processed_query": "quy trinh nghi phep",
                    "sources": [{
                        "file_name": "quy-trinh.pdf",
                        "relative_path": "private/hr/quy-trinh.pdf",
                        "file_type": "pdf",
                        "snippet": "Gui don truoc ba ngay.",
                        "score": 0.9,
                    }],
                    "retrieval_time_ms": 12,
                }

            async def text(self):
                return ""

        class FakeSession(object):
            def __init__(self, **_kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            def post(self, url, json, headers):
                captured.update({"url": url, "json": json, "headers": headers})
                return FakeResponse()

            def get(self, url, headers):
                captured.update({"files_url": url, "files_headers": headers})

                class ManifestResponse(FakeResponse):
                    async def json(self, **_kwargs):
                        return {"total": 1, "files": [{
                            "file_name": "quy-trinh.pdf",
                            "tenant_id": "tenant-a",
                            "file_id": "file-1",
                        }]}

                return ManifestResponse()

        service = chatbot_service.ChatbotService(SimpleNamespace(config={
            "CHATBOT_ENABLED": True,
            "CHATBOT_PROVIDER": "external-webhook",
            "CHATBOT_API_URL": "https://knowledge-ai.gonapp.net/api/v1/chat",
            "CHATBOT_API_KEY": "server-secret",
            "CHATBOT_EXTERNAL_AUTH_HEADER": "X-API-Key",
            "CHATBOT_EXTERNAL_AUTH_SCHEME": "",
            "CHATBOT_EXTERNAL_REQUEST_MODE": "knowledge-retrieval",
            "CHATBOT_RETRIEVAL_LIMIT": 6,
            "CHATBOT_TIMEOUT": 30,
        }))

        with patch.object(chatbot_service.aiohttp, "ClientSession", FakeSession, create=True):
            result = await service.reply(
                "quy trinh nghi phep",
                user={"id": "private-user", "tenant_id": "tenant-a"},
                history=[{"role": "user", "content": "private history"}],
            )

        self.assertEqual(captured["json"], {
            "message": "quy trinh nghi phep",
            "top_k": 20,
            "tenant_id": "tenant-a",
            "history": [{"role": "user", "content": "private history"}],
        })
        self.assertEqual(captured["headers"]["X-API-Key"], "server-secret")
        self.assertEqual(captured["headers"]["X-Tenant-Id"], "tenant-a")
        self.assertEqual(captured["files_url"], "https://knowledge-ai.gonapp.net/api/v1/files")
        self.assertEqual(captured["files_headers"]["X-Tenant-Id"], "tenant-a")
        self.assertNotIn("private-user", str(captured["json"]))
        self.assertNotIn("private/hr", str(result))
        self.assertTrue(result["grounded"])
        self.assertEqual(result["usage"]["retrieval_time_ms"], 12)

    async def test_chat_document_ingest_falls_back_only_when_primary_route_is_missing(self):
        calls = []

        class FakeResponse(object):
            def __init__(self, status, payload):
                self.status = status
                self.payload = payload

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            async def json(self, **_kwargs):
                return self.payload

            async def text(self):
                return ""

        class FakeSession(object):
            def __init__(self, **_kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            def post(self, url, json, headers):
                calls.append({"url": url, "json": json, "headers": headers})
                if url.endswith("/ingest"):
                    return FakeResponse(404, {"detail": "Not Found"})
                return FakeResponse(200, {
                    "status": "accepted",
                    "file_id": json["file_id"],
                    "chunks_processed": 3,
                })

        service = chatbot_service.ChatbotService(SimpleNamespace(config={
            "CHATBOT_INGEST_ENABLED": True,
            "CHATBOT_INGEST_URL": "https://knowledge.example/api/v1/ingest",
            "CHATBOT_INGEST_FALLBACK_URL": "https://knowledge.example/api/v1/dataroom/callback",
            "CHATBOT_INGEST_TIMEOUT": 30,
            "CHATBOT_API_KEY": "server-secret",
            "CHATBOT_EXTERNAL_AUTH_HEADER": "X-API-Key",
            "CHATBOT_EXTERNAL_AUTH_SCHEME": "",
        }))
        payload = {
            "file_name": "quy-trinh.pdf",
            "text_content": "Noi dung quy trinh",
            "tenant_id": "tenant-a",
            "source": "vichat_web",
            "file_id": "vichat_file_1",
            "metadata": {"category": "chat_attachment"},
        }

        with patch.object(chatbot_service.aiohttp, "ClientSession", FakeSession, create=True):
            result = await service.ingest_document(payload)

        self.assertEqual([call["url"] for call in calls], [
            "https://knowledge.example/api/v1/ingest",
            "https://knowledge.example/api/v1/dataroom/callback",
        ])
        self.assertTrue(all(call["json"] == payload for call in calls))
        self.assertTrue(all(call["headers"]["X-Tenant-Id"] == "tenant-a" for call in calls))
        self.assertEqual(result["status"], "accepted")
        self.assertEqual(result["chunks_processed"], 3)

    async def test_retrieval_schema_error_without_history_is_not_silently_ignored(self):
        class FakeResponse(object):
            status = 422

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            async def json(self, **_kwargs):
                return {"error": "tenant_id is required"}

            async def text(self):
                return ""

        class FakeSession(object):
            def __init__(self, **_kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            def post(self, *_args, **_kwargs):
                return FakeResponse()

        service = chatbot_service.ChatbotService(SimpleNamespace(config={
            "CHATBOT_ENABLED": True,
            "CHATBOT_PROVIDER": "external-webhook",
            "CHATBOT_API_URL": "https://knowledge.example/api/v1/chat",
            "CHATBOT_API_KEY": "server-secret",
            "CHATBOT_EXTERNAL_REQUEST_MODE": "knowledge-retrieval",
            "CHATBOT_RETRIEVAL_INCLUDE_HISTORY": True,
            "CHATBOT_TENANT_FILTER_REQUIRED": False,
        }))

        with patch.object(chatbot_service.aiohttp, "ClientSession", FakeSession, create=True):
            with self.assertRaisesRegex(chatbot_service.ChatbotServiceError, "tenant_id is required"):
                await service.reply("quy trinh nghi phep", user={"tenant_id": "tenant-a"})

    async def test_retrieval_drops_foreign_and_ambiguous_sources(self):
        class FakeResponse(object):
            status = 200

            def __init__(self, payload):
                self.payload = payload

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            async def json(self, **_kwargs):
                return self.payload

            async def text(self):
                return ""

        class FakeSession(object):
            def __init__(self, **_kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            def post(self, *_args, **_kwargs):
                return FakeResponse({
                    "answer": "Untrusted cross-tenant provider answer",
                    "sources": [
                        {"file_name": "allowed.pdf", "snippet": "Allowed tenant text"},
                        {"file_name": "foreign.pdf", "snippet": "Foreign tenant text"},
                        {"file_name": "duplicate.pdf", "snippet": "Ambiguous tenant text"},
                    ],
                })

            def get(self, *_args, **_kwargs):
                return FakeResponse({
                    "total": 4,
                    "files": [
                        {"file_name": "allowed.pdf", "tenant_id": "tenant-a", "file_id": "a-1"},
                        {"file_name": "foreign.pdf", "tenant_id": "tenant-b", "file_id": "b-1"},
                        {"file_name": "duplicate.pdf", "tenant_id": "tenant-a", "file_id": "a-2"},
                        {"file_name": "duplicate.pdf", "tenant_id": "tenant-b", "file_id": "b-2"},
                    ],
                })

        service = chatbot_service.ChatbotService(SimpleNamespace(config={
            "CHATBOT_ENABLED": True,
            "CHATBOT_PROVIDER": "external-webhook",
            "CHATBOT_API_URL": "https://knowledge.example/api/v1/chat",
            "CHATBOT_FILES_URL": "https://knowledge.example/api/v1/files",
            "CHATBOT_API_KEY": "server-secret",
            "CHATBOT_EXTERNAL_REQUEST_MODE": "knowledge-retrieval",
            "CHATBOT_RETRIEVAL_LIMIT": 6,
        }))

        with patch.object(chatbot_service.aiohttp, "ClientSession", FakeSession, create=True):
            result = await service.reply("quy trinh", user={"tenant_id": "tenant-a"})

        self.assertTrue(result["grounded"])
        self.assertEqual([item["file_name"] for item in result["sources"]], ["allowed.pdf"])
        self.assertIn("Allowed tenant text", result["reply"])
        self.assertNotIn("Foreign tenant text", str(result))
        self.assertNotIn("Ambiguous tenant text", str(result))
        self.assertNotIn("Untrusted cross-tenant provider answer", str(result))

    async def test_retrieval_requires_a_verified_tenant_when_filtering(self):
        class FakeSession(object):
            def __init__(self, **_kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            def post(self, *_args, **_kwargs):
                class FakeResponse(object):
                    status = 200

                    async def __aenter__(self):
                        return self

                    async def __aexit__(self, *_args):
                        return False

                    async def json(self, **_kwargs):
                        return {"sources": []}

                    async def text(self):
                        return ""

                return FakeResponse()

        service = chatbot_service.ChatbotService(SimpleNamespace(config={
            "CHATBOT_ENABLED": True,
            "CHATBOT_PROVIDER": "external-webhook",
            "CHATBOT_API_URL": "https://knowledge.example/api/v1/chat",
            "CHATBOT_API_KEY": "server-secret",
            "CHATBOT_EXTERNAL_REQUEST_MODE": "knowledge-retrieval",
        }))

        with patch.object(chatbot_service.aiohttp, "ClientSession", FakeSession, create=True):
            with self.assertRaisesRegex(chatbot_service.ChatbotServiceError, "Verified tenant"):
                await service.reply("quy trinh", user={})

    async def test_retrieval_rejects_an_incomplete_tenant_manifest(self):
        class FakeResponse(object):
            status = 200

            def __init__(self, payload):
                self.payload = payload

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            async def json(self, **_kwargs):
                return self.payload

            async def text(self):
                return ""

        class FakeSession(object):
            def __init__(self, **_kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            def post(self, *_args, **_kwargs):
                return FakeResponse({"sources": []})

            def get(self, *_args, **_kwargs):
                return FakeResponse({"total": 2, "files": [
                    {"file_name": "one.pdf", "tenant_id": "tenant-a", "file_id": "one"},
                ]})

        service = chatbot_service.ChatbotService(SimpleNamespace(config={
            "CHATBOT_ENABLED": True,
            "CHATBOT_PROVIDER": "external-webhook",
            "CHATBOT_API_URL": "https://knowledge.example/api/v1/chat",
            "CHATBOT_API_KEY": "server-secret",
            "CHATBOT_EXTERNAL_REQUEST_MODE": "knowledge-retrieval",
        }))

        with patch.object(chatbot_service.aiohttp, "ClientSession", FakeSession, create=True):
            with self.assertRaisesRegex(chatbot_service.ChatbotServiceError, "manifest is incomplete"):
                await service.reply("quy trinh", user={"tenant_id": "tenant-a"})

    async def test_chat_document_ingest_rejects_error_status_in_success_response(self):
        calls = []

        class FakeResponse(object):
            status = 200

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            async def json(self, **_kwargs):
                return {"status": "error", "message": "Document parsing failed"}

            async def text(self):
                return ""

        class FakeSession(object):
            def __init__(self, **_kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            def post(self, url, json, headers):
                calls.append({"url": url, "json": json, "headers": headers})
                return FakeResponse()

        service = chatbot_service.ChatbotService(SimpleNamespace(config={
            "CHATBOT_INGEST_ENABLED": True,
            "CHATBOT_INGEST_URL": "https://knowledge.example/api/v1/ingest",
            "CHATBOT_INGEST_FALLBACK_URL": "https://knowledge.example/api/v1/dataroom/callback",
            "CHATBOT_INGEST_TIMEOUT": 30,
        }))
        payload = {
            "file_name": "quy-trinh.pdf",
            "text_content": "Noi dung quy trinh",
            "tenant_id": "tenant-a",
            "source": "vichat_web",
            "file_id": "vichat_file_1",
            "metadata": {"category": "chat_attachment"},
        }

        with patch.object(chatbot_service.aiohttp, "ClientSession", FakeSession, create=True):
            with self.assertRaisesRegex(chatbot_service.ChatbotServiceError, "Document parsing failed"):
                await service.ingest_document(payload)

        self.assertEqual(len(calls), 1)
        self.assertTrue(calls[0]["url"].endswith("/ingest"))


class ChatbotAssistantUsabilityTests(unittest.IsolatedAsyncioTestCase):
    def service(self, **overrides):
        config = {
            "CHATBOT_ENABLED": True,
            "CHATBOT_PROVIDER": "external-webhook",
            "CHATBOT_API_URL": "https://knowledge.example/api/v1/chat",
            "CHATBOT_API_KEY": "test-server-key",
            "CHATBOT_EXTERNAL_REQUEST_MODE": "knowledge-retrieval",
            "CHATBOT_TIMEOUT": 30,
        }
        config.update(overrides)
        return chatbot_service.ChatbotService(SimpleNamespace(config=config))

    async def test_greetings_help_and_missing_topic_skip_provider_but_require_verified_tenant(self):
        service = self.service()
        with patch.object(chatbot_service.aiohttp, "ClientSession", create=True) as session:
            for question in ("Xin chào!", "Bạn làm được gì?", "Cảm ơn", "Nói rõ hơn", "Tóm tắt tài liệu", "Tra cứu [tên chính sách]"):
                result = await service.reply(question, user={"tenant_id": "tenant-a"})
                self.assertEqual(result["provider"], "assistant-guide")
                self.assertFalse(result["grounded"])
                self.assertEqual(result["sources"], [])
                self.assertTrue(result["reply"])
                with self.assertRaisesRegex(chatbot_service.ChatbotServiceError, "Verified tenant"):
                    await service.reply(question, user={})
            session.assert_not_called()

    async def test_disabled_provider_does_not_claim_to_be_available_for_greetings(self):
        with self.assertRaises(chatbot_service.ChatbotServiceError) as raised:
            await self.service(CHATBOT_ENABLED=False).reply("Xin chào", user={"tenant_id": "tenant-a"})
        self.assertEqual(raised.exception.status_code, 503)

    async def test_chat_mode_keeps_the_original_provider_reply_for_greetings(self):
        service = self.service(CHATBOT_EXTERNAL_REQUEST_MODE="chat")
        with patch.object(service, "_external_reply", new=AsyncMock(return_value={"reply": "Provider answer"})) as external:
            result = await service.reply("Xin chào", user={"tenant_id": "tenant-a"})
        external.assert_awaited_once()
        self.assertEqual(result, {"reply": "Provider answer"})

    async def test_followup_survives_schema_retry_with_tenant_and_query_intact(self):
        captured = []

        class FakeResponse(object):
            def __init__(self, payload, status=200):
                self.payload = payload
                self.status = status

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            async def json(self, **_kwargs):
                return self.payload

        class FakeSession(object):
            def __init__(self, **_kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            def post(self, _url, json, headers):
                captured.append({"payload": json, "headers": headers})
                if len(captured) == 1:
                    return FakeResponse({"error": "unknown history"}, 422)
                return FakeResponse({"answer": "Unverified answer", "sources": [{
                    "file_name": "allowed.pdf", "snippet": "Nghỉ phép cần phê duyệt. Lưu biểu mẫu nghỉ phép."
                }]})

            def get(self, *_args, **_kwargs):
                return FakeResponse({"total": 1, "files": [{"file_name": "allowed.pdf", "tenant_id": "tenant-a"}]})

        with patch.object(chatbot_service.aiohttp, "ClientSession", FakeSession, create=True):
            result = await self.service().reply(
                "Tóm tắt ngắn hơn", user={"tenant_id": "tenant-a"},
                history=[{"role": "user", "content": "Quy trình nghỉ phép?"}],
            )
        self.assertEqual(len(captured), 2)
        self.assertIn("history", captured[0]["payload"])
        self.assertNotIn("history", captured[1]["payload"])
        self.assertEqual(captured[0]["payload"]["message"], captured[1]["payload"]["message"])
        self.assertIn("Quy trình nghỉ phép?", captured[1]["payload"]["message"])
        self.assertTrue(all(item["headers"]["X-Tenant-Id"] == "tenant-a" for item in captured))
        self.assertTrue(all(item["payload"]["tenant_id"] == "tenant-a" for item in captured))
        self.assertNotIn("Unverified answer", result["reply"])
        self.assertTrue(result["grounded"])
        self.assertNotIn("Lưu biểu mẫu", result["reply"])
        self.assertIn("Lưu biểu mẫu", result["sources"][0]["snippet"])

    async def test_overall_timeout_cancels_slow_query_retry_and_manifest(self):
        for stalled_stage in ("query", "retry", "manifest"):
            events = []
            calls = []

            class FakeResponse(object):
                def __init__(self, stage, payload, status=200):
                    self.stage = stage
                    self.payload = payload
                    self.status = status

                async def __aenter__(self):
                    return self

                async def __aexit__(self, *_args):
                    events.append("response-closed")
                    return False

                async def json(self, **_kwargs):
                    if self.stage == stalled_stage:
                        try:
                            await asyncio.Event().wait()
                        finally:
                            events.append("cancelled-" + self.stage)
                    return self.payload

            class FakeSession(object):
                def __init__(self, **_kwargs):
                    pass

                async def __aenter__(self):
                    return self

                async def __aexit__(self, *_args):
                    events.append("session-closed")
                    return False

                def post(self, *_args, **_kwargs):
                    calls.append("post")
                    retry = stalled_stage == "retry"
                    return FakeResponse("retry" if len(calls) == 2 else "query", {"sources": []}, 422 if retry and len(calls) == 1 else 200)

                def get(self, *_args, **_kwargs):
                    return FakeResponse("manifest", {"total": 0, "files": []})

            with self.subTest(stage=stalled_stage), patch.object(chatbot_service.aiohttp, "ClientSession", FakeSession, create=True):
                with self.assertRaises(chatbot_service.ChatbotServiceError) as raised:
                    await asyncio.wait_for(self.service(CHATBOT_TIMEOUT=0.02).reply(
                        "Quy trình nghỉ phép?", user={"tenant_id": "tenant-a"},
                        history=[{"role": "user", "content": "Earlier question"}],
                    ), timeout=1)
                self.assertEqual(raised.exception.status_code, 504)
                self.assertIn("cancelled-" + stalled_stage, events)
                self.assertIn("session-closed", events)
                self.assertIn("response-closed", events)
                self.assertEqual(len(calls), 2 if stalled_stage == "retry" else 1)

if __name__ == "__main__":
    unittest.main()
