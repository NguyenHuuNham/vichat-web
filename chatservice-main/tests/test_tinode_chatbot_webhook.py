import json
import importlib.util
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PROJECT_ROOT.parent
PROTOCOL_PATH = PROJECT_ROOT / "scripts" / "tinode_chatbot_protocol.py"
spec = importlib.util.spec_from_file_location("tinode_chatbot_protocol", PROTOCOL_PATH)
protocol = importlib.util.module_from_spec(spec)
spec.loader.exec_module(protocol)
CursorStore = protocol.CursorStore
tinode_contact_topics = protocol.tinode_contact_topics
tinode_message_text = protocol.tinode_message_text
tinode_websocket_url = protocol.tinode_websocket_url


class TinodeChatbotProtocolTests(unittest.TestCase):
    def test_extracts_plain_text_and_drafty_text(self):
        self.assertEqual(tinode_message_text("  xin chao  "), "xin chao")
        self.assertEqual(tinode_message_text({"txt": "  noi dung Drafty  "}), "noi dung Drafty")
        self.assertEqual(tinode_message_text({"ent": []}), "")

    def test_subscribes_only_unique_direct_user_topics(self):
        topics = tinode_contact_topics({
            "sub": [
                {"topic": "usrEmployee1"},
                {"user": "usrEmployee2"},
                {"topic": "grpCompany"},
                {"topic": "usrEmployee1"},
                {"topic": "usrDeleted", "deleted": True},
            ],
        })

        self.assertEqual(topics, ["usrEmployee1", "usrEmployee2"])

    def test_websocket_url_preserves_query_and_adds_api_key_once(self):
        self.assertEqual(
            tinode_websocket_url("ws://chat/v0/channels?x=1", "secret key"),
            "ws://chat/v0/channels?x=1&apikey=secret+key",
        )
        self.assertEqual(
            tinode_websocket_url("ws://chat/v0/channels?apikey=existing", "ignored"),
            "ws://chat/v0/channels?apikey=existing",
        )

    def test_cursor_store_is_monotonic_and_ignores_invalid_state(self):
        with tempfile.TemporaryDirectory() as directory:
            state_file = Path(directory) / "state.json"
            state_file.write_text(json.dumps({"usrA": 8, "usrBad": "invalid"}), encoding="utf-8")
            store = CursorStore(state_file)

            self.assertEqual(store.get("usrA"), 8)
            self.assertEqual(store.get("usrBad"), 0)
            store.advance("usrA", 7)
            store.advance("usrA", 9)

            self.assertEqual(CursorStore(state_file).get("usrA"), 9)


class TinodeChatbotContractTests(unittest.TestCase):
    def test_chatmgt_does_not_create_asyncio_lock_during_module_import(self):
        service = (
            PROJECT_ROOT / "application" / "services" / "tinode_chatbot_service.py"
        ).read_text(encoding="utf-8")

        self.assertIn("def _auth_lock_for_current_loop():", service)
        self.assertNotIn("_auth_lock = asyncio.Lock()\n", service.split("def _auth_lock_for_current_loop", 1)[0])

    def test_worker_and_chatui_keep_chatbot_isolated_from_other_topics(self):
        worker = (PROJECT_ROOT / "scripts" / "tinode_chatbot_webhook.py").read_text(encoding="utf-8")
        controller = (PROJECT_ROOT / "application" / "controllers" / "api_chatbot.py").read_text(encoding="utf-8")
        app = (REPOSITORY_ROOT / "src" / "app" / "App.jsx").read_text(encoding="utf-8")
        compose = (REPOSITORY_ROOT / "infrastructure" / "production" / "compose.yaml").read_text(encoding="utf-8")

        self.assertNotIn("from application", worker)
        self.assertIn("def ensure_tinode_chatbot_auth(force=False):", worker)
        self.assertIn('topic.startswith("usr")', worker)
        self.assertIn('X-Vichat-Chatbot-Webhook', controller)
        self.assertIn('ManagementAccount.tinode_uid == sender_uid', controller)
        self.assertIn("room?.isChatbot && chatMode === 'tinode' && room.tinodeTopic", app)
        self.assertIn("tinode-chatbot-webhook:", compose)


if __name__ == "__main__":
    unittest.main()
