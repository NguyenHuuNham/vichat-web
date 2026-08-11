import importlib.util
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PROJECT_ROOT.parent
CONTROLLER_PATH = PROJECT_ROOT / "application" / "controllers" / "api_chatbot.py"
CONFIG_PATH = PROJECT_ROOT / "application" / "config" / "config.py"
KNOWLEDGE_PATH = PROJECT_ROOT / "application" / "services" / "knowledge_service.py"
CHATBOT_SERVICE_PATH = PROJECT_ROOT / "application" / "services" / "chatbot_service.py"
CHAT_MANAGER_PATH = PROJECT_ROOT / "application" / "services" / "chat_manager_service.py"
CHAT_APP_PATH = REPOSITORY_ROOT / "src" / "app" / "App.jsx"
CHATBOT_FRONTEND_PATH = REPOSITORY_ROOT / "src" / "features" / "chatbot" / "services" / "chatbotService.js"
PRODUCTION_COMPOSE_PATH = REPOSITORY_ROOT / "infrastructure" / "production" / "compose.yaml"
PRODUCTION_DOCKERFILE_PATH = REPOSITORY_ROOT / "infrastructure" / "production" / "Dockerfile"


def read(path):
    return path.read_text(encoding="utf-8")


HAS_AIOHTTP = importlib.util.find_spec("aiohttp") is not None
previous_aiohttp = sys.modules.get("aiohttp")
if not HAS_AIOHTTP:
    aiohttp_stub = types.ModuleType("aiohttp")
    aiohttp_stub.ClientError = Exception
    aiohttp_stub.ClientTimeout = lambda **_kwargs: None
    sys.modules["aiohttp"] = aiohttp_stub
try:
    spec = importlib.util.spec_from_file_location("external_chatbot_service", CHATBOT_SERVICE_PATH)
    chatbot_service = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(chatbot_service)
finally:
    if not HAS_AIOHTTP:
        if previous_aiohttp is None:
            sys.modules.pop("aiohttp", None)
        else:
            sys.modules["aiohttp"] = previous_aiohttp


class ExternalChatbotContractTests(unittest.TestCase):
    def test_external_data_api_is_keyed_and_tenant_fixed(self):
        controller = read(CONTROLLER_PATH)
        config = read(CONFIG_PATH)

        self.assertIn("/api/v1/chatbot/external/context", controller)
        self.assertIn("/api/v1/chatbot/external/message", controller)
        self.assertIn("hmac.compare_digest", controller)
        self.assertIn("CHATBOT_EXTERNAL_TENANT", controller)
        self.assertIn('exclude_source_prefixes=("CHAT_",)', controller)
        self.assertIn("retrieved_matches=matches", controller)
        self.assertIn("CHATBOT_EXTERNAL_API_KEY", config)
        self.assertIn("CHATBOT_EXTERNAL_KNOWLEDGE_BASE_ID", config)

    def test_external_boundary_excludes_chat_derived_documents(self):
        knowledge = read(KNOWLEDGE_PATH)

        self.assertIn("exclude_source_prefixes=None", knowledge)
        self.assertIn("source_type.startswith(excluded_prefixes)", knowledge)

    def test_external_webhook_receives_context_and_bounded_history(self):
        service = read(CHATBOT_SERVICE_PATH)
        manager = read(CHAT_MANAGER_PATH)

        self.assertIn('provider in ("external", "external-webhook", "webhook")', service)
        self.assertIn('"history": self._history_messages(history)', service)
        self.assertIn('payload["context"] = str(context or "")', service)
        self.assertIn("include_context=True", service)
        self.assertIn("CHATBOT_EXTERNAL_AUTH_HEADER", service)
        self.assertIn("small_talk = self._is_small_talk(message) and not external_provider", manager)
        self.assertIn("and not matches and not external_provider", manager)

    def test_frontend_external_mode_skips_internal_chat_initialization(self):
        app_source = read(CHAT_APP_PATH)
        frontend_service = read(CHATBOT_FRONTEND_PATH)

        external_branch = app_source.index("if (EXTERNAL_CHAT_ONLY) {")
        directory_request = app_source.index("chatManagementService.listUsers()", external_branch)
        self.assertLess(external_branch, directory_request)
        self.assertIn("return;", app_source[external_branch:directory_request])
        self.assertIn("VITE_CHAT_MODE", frontend_service)
        self.assertIn("external-chat-mode", app_source)

    def test_production_build_defaults_to_internal_mode(self):
        compose = read(PRODUCTION_COMPOSE_PATH)
        dockerfile = read(PRODUCTION_DOCKERFILE_PATH)

        self.assertIn("VITE_CHAT_MODE: ${VITE_CHAT_MODE:-internal}", compose)
        self.assertIn("ARG VITE_CHAT_MODE=internal", dockerfile)
        self.assertIn("CHATBOT_EXTERNAL_API_KEY", compose)

    def test_external_provider_accepts_common_response_shapes(self):
        service = chatbot_service.ChatbotService(SimpleNamespace(config={}))

        self.assertEqual(service._response_content({"reply": "one"}), "one")
        self.assertEqual(service._response_content({"data": {"answer": "two"}}), "two")
        self.assertEqual(
            service._response_content({"choices": [{"message": {"content": "three"}}]}),
            "three",
        )

    def test_external_provider_does_not_require_an_openai_model(self):
        service = chatbot_service.ChatbotService(SimpleNamespace(config={
            "CHATBOT_ENABLED": True,
            "CHATBOT_PROVIDER": "external-webhook",
            "CHATBOT_API_URL": "https://chatbot.example/api/message",
            "CHATBOT_API_KEY": "",
            "CHATBOT_MODEL": "",
        }))

        self.assertTrue(service.enabled)


if __name__ == "__main__":
    unittest.main()
