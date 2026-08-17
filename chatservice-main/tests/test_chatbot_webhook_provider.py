import importlib.util
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


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

    def test_knowledge_retrieval_payload_is_minimal_and_bounded(self):
        payload = self.service(
            CHATBOT_EXTERNAL_REQUEST_MODE="knowledge-retrieval",
            CHATBOT_RETRIEVAL_LIMIT=50,
        )._external_payload(
            message="  Quy trinh nghi phep  ",
            conversation_id="must-not-leave-chatmgt",
            history=[{"role": "user", "content": "private history"}],
            user={"id": "private-user", "email": "private@example.com"},
        )

        self.assertEqual(payload, {
            "message": "Quy trinh nghi phep",
            "top_k": 20,
        })

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
                user={"id": "private-user"},
                history=[{"role": "user", "content": "private history"}],
            )

        self.assertEqual(captured["json"], {
            "message": "quy trinh nghi phep",
            "top_k": 6,
        })
        self.assertEqual(captured["headers"]["X-API-Key"], "server-secret")
        self.assertNotIn("private-user", str(captured["json"]))
        self.assertNotIn("private/hr", str(result))
        self.assertTrue(result["grounded"])
        self.assertEqual(result["usage"]["retrieval_time_ms"], 12)


if __name__ == "__main__":
    unittest.main()
