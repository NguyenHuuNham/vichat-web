import ast
import unittest
from pathlib import Path


CHATMGT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = CHATMGT_ROOT.parent
AUTH_SERVICE_PATH = CHATMGT_ROOT / "application" / "services" / "auth_service.py"
CHATBOT_CONTROLLER_PATH = CHATMGT_ROOT / "application" / "controllers" / "api_chatbot.py"
SWITCH_SCRIPT_PATH = CHATMGT_ROOT / "scripts" / "switch_tinode_central.py"
APP_PATH = REPOSITORY_ROOT / "src" / "app" / "App.jsx"
CHATBOT_SERVICE_PATH = (
    REPOSITORY_ROOT / "src" / "features" / "chatbot" / "services" / "chatbotService.js"
)
WORKSPACE_PATH = (
    REPOSITORY_ROOT / "src" / "features" / "workspace" / "components" / "EnterpriseWorkspace.jsx"
)
NGINX_PATH = REPOSITORY_ROOT / "infrastructure" / "production" / "nginx.conf"
COMPOSE_PATH = REPOSITORY_ROOT / "infrastructure" / "production" / "compose.yaml"


class TinodeCentralSwitchTests(unittest.TestCase):
    def test_sso_login_attempts_deterministic_credential_before_admin_repair(self):
        source = AUTH_SERVICE_PATH.read_text(encoding="utf-8")
        start = source.index("async def tinode_sso_login")
        end = source.index("\n\nasync def tinode_verify_topic_access", start)
        rendered = source[start:end]

        self.assertLess(
            rendered.index("await tinode_login(tinode_username, password)"),
            rendered.index("await tinode_admin_reset_password"),
        )

    def test_legacy_chat_knowledge_routes_are_closed(self):
        tree = ast.parse(CHATBOT_CONTROLLER_PATH.read_text(encoding="utf-8"))
        functions = {
            node.name: node
            for node in tree.body
            if isinstance(node, ast.AsyncFunctionDef)
        }
        for name in ("knowledge_chat_event", "knowledge_chat_file"):
            first_statement = functions[name].body[0]
            self.assertIsInstance(first_statement, ast.Return)
            rendered = ast.get_source_segment(
                CHATBOT_CONTROLLER_PATH.read_text(encoding="utf-8"),
                first_statement,
            ) or ""
            self.assertIn("TINODE_CONTENT_ONLY", rendered)
            self.assertIn("status=410", rendered)

    def test_reset_script_preserves_management_ids_and_clears_tinode_content_copies(self):
        source = SWITCH_SCRIPT_PATH.read_text(encoding="utf-8")

        self.assertIn("ManagementAccount.tinode_uid: None", source)
        self.assertIn("Conversation.tinode_topic: None", source)
        self.assertIn('KnowledgeDocument.source_type.like("CHAT_%")', source)
        self.assertIn('args.confirm != "web.vichat.net"', source)
        self.assertNotIn("ManagementAccount.id: None", source)
        self.assertNotIn("Conversation.id: None", source)

    @unittest.skipUnless(APP_PATH.is_file(), "frontend source is not included in the runtime image")
    def test_chatui_does_not_copy_normal_tinode_content_into_chatmgt(self):
        app_source = APP_PATH.read_text(encoding="utf-8")
        chatbot_source = CHATBOT_SERVICE_PATH.read_text(encoding="utf-8")
        workspace_source = WORKSPACE_PATH.read_text(encoding="utf-8")

        self.assertNotIn("learnFromChatMessage", app_source)
        self.assertNotIn("learnFromChatFile", app_source)
        self.assertNotIn("queueMessageForKnowledge", app_source)
        self.assertNotIn("/knowledge/chat-events", chatbot_source)
        self.assertNotIn("/knowledge/chat-files", chatbot_source)
        self.assertNotIn("source_message_preview: form.sourceMessagePreview", workspace_source)

    @unittest.skipUnless(NGINX_PATH.is_file(), "production infrastructure is not included in the runtime image")
    def test_production_routes_both_tinode_clients_to_web_vichat(self):
        nginx_source = NGINX_PATH.read_text(encoding="utf-8")
        compose_source = COMPOSE_PATH.read_text(encoding="utf-8")

        self.assertGreaterEqual(nginx_source.count("proxy_pass https://web.vichat.net"), 2)
        self.assertIn("proxy_ssl_name web.vichat.net", nginx_source)
        self.assertIn("proxy_ssl_verify off", nginx_source)
        self.assertIn("proxy_set_header Origin https://web.vichat.net", nginx_source)
        self.assertIn("ws://chat:80/v0/channels", compose_source)


if __name__ == "__main__":
    unittest.main()
