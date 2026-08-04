import importlib.util
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace


SERVICE_PATH = Path(__file__).resolve().parents[1] / "application" / "services" / "chatbot_service.py"
MANAGER_PATH = Path(__file__).resolve().parents[1] / "application" / "services" / "chat_manager_service.py"


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
            "CHATBOT_API_URL": "https://knowledge.gonapp.net/api/v1/chat",
            "CHATBOT_API_KEY": "",
            "CHATBOT_MODEL": "",
        }
        config.update(overrides)
        return chatbot_service.ChatbotService(SimpleNamespace(config=config))

    def test_external_provider_requires_only_enabled_and_url(self):
        self.assertTrue(self.service().enabled)

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


if __name__ == "__main__":
    unittest.main()
