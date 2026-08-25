import ast
import unittest
from pathlib import Path
from types import SimpleNamespace


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PROJECT_ROOT.parent
CONTROLLER_PATH = PROJECT_ROOT / "application" / "controllers" / "api_chat_management.py"
MODEL_PATH = PROJECT_ROOT / "application" / "models" / "models.py"
BRIDGE_PATH = PROJECT_ROOT / "scripts" / "tinode_account_bridge.py"
MIGRATION_PATH = PROJECT_ROOT / "migrations" / "013_direct_message_blocking.sql"
ALEMBIC_PATH = PROJECT_ROOT / "alembic" / "versions" / "20260825_13_direct_message_blocking.py"
APP_PATH = REPOSITORY_ROOT / "src" / "app" / "App.jsx"
CHAT_SERVICE_PATH = REPOSITORY_ROOT / "src" / "features" / "chat" / "services" / "chatManagementService.js"
TINODE_CLIENT_PATH = REPOSITORY_ROOT / "src" / "features" / "chat" / "services" / "tinodeClient.js"


def isolated_function(path, name, namespace=None):
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    function = next(
        node for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name
    )
    namespace = dict(namespace or {})
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(path), "exec"), namespace)
    return namespace[name]


class DirectMessageBlockStateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.block_state = staticmethod(isolated_function(CONTROLLER_PATH, "_direct_block_state"))
        cls.ensure_direct_key = staticmethod(isolated_function(CONTROLLER_PATH, "_ensure_direct_key"))

    @staticmethod
    def member(participant_id, blocked_at=None):
        return SimpleNamespace(participant_id=participant_id, blocked_at=blocked_at)

    def test_group_state_is_always_unblocked(self):
        item = SimpleNamespace(properties={"is_group": True})
        state = self.block_state(item, "viewer", [
            self.member("viewer", 100),
            self.member("peer", 200),
        ])
        self.assertEqual(state, {
            "blockedByViewer": False,
            "blockedByPeer": False,
            "directMessagingBlocked": False,
        })

    def test_either_direct_participant_closes_both_directions(self):
        item = SimpleNamespace(properties={"is_group": False})
        viewer_blocked = self.block_state(item, "viewer", [
            self.member("viewer", 100),
            self.member("peer"),
        ])
        peer_blocked = self.block_state(item, "viewer", [
            self.member("viewer"),
            self.member("peer", 200),
        ])

        self.assertEqual(viewer_blocked, {
            "blockedByViewer": True,
            "blockedByPeer": False,
            "directMessagingBlocked": True,
        })
        self.assertEqual(peer_blocked, {
            "blockedByViewer": False,
            "blockedByPeer": True,
            "directMessagingBlocked": True,
        })

    def test_one_user_unblocking_does_not_override_the_peer_block(self):
        item = SimpleNamespace(properties={"is_group": False})
        state = self.block_state(item, "viewer", [
            self.member("viewer"),
            self.member("peer", 200),
        ])
        self.assertFalse(state["blockedByViewer"])
        self.assertTrue(state["blockedByPeer"])
        self.assertTrue(state["directMessagingBlocked"])

    def test_blocking_backfills_the_legacy_direct_pair_key(self):
        item = SimpleNamespace(properties={"is_group": False})
        participants = [self.member("peer"), self.member("viewer")]

        self.assertTrue(self.ensure_direct_key(item, participants))
        self.assertEqual(item.properties["direct_key"], "peer:viewer")
        self.assertFalse(self.ensure_direct_key(item, participants))


class DirectMessagePolicyTests(unittest.TestCase):
    class Column:
        def __eq__(self, _value):
            return object()

        def is_(self, _value):
            return object()

        def contains(self, _value):
            return object()

    class Query:
        def __init__(self, first_values=None, all_values=None):
            self.first_values = list(first_values or [])
            self.all_values = list(all_values or [])

        def filter(self, *_conditions):
            return self

        def first(self):
            return self.first_values.pop(0) if self.first_values else None

        def all(self):
            return list(self.all_values)

    def test_duplicate_direct_rows_fail_closed_when_either_row_is_blocked(self):
        sender = SimpleNamespace(id="sender", tenant_id="tenant-a")
        peer = SimpleNamespace(id="peer", tenant_id="tenant-a")
        first_item = SimpleNamespace(id="first", properties={"direct_key": "peer:sender"})
        second_item = SimpleNamespace(id="second", properties={"direct_key": "peer:sender"})
        memberships = {
            "first": [
                SimpleNamespace(participant_id="sender", blocked_at=None),
                SimpleNamespace(participant_id="peer", blocked_at=None),
            ],
            "second": [
                SimpleNamespace(participant_id="sender", blocked_at=None),
                SimpleNamespace(participant_id="peer", blocked_at=200),
            ],
        }
        account_query = self.Query(first_values=[sender, peer])
        conversation_query = self.Query(all_values=[first_item, second_item])
        column = self.Column()
        policy = isolated_function(CONTROLLER_PATH, "_direct_message_policy", {
            "valid_tinode_topic": lambda value, is_group: (
                not is_group and str(value).startswith("usr")
            ),
            "ManagementAccount": SimpleNamespace(
                query=account_query,
                tinode_uid=column,
                active=column,
                tenant_id=column,
            ),
            "Conversation": SimpleNamespace(
                query=conversation_query,
                tenant_id=column,
                deleted=column,
                properties=column,
            ),
            "_direct_block_participants": lambda item: memberships[item.id],
        })

        state = policy("usrSender1", "usrPeer123")

        self.assertTrue(state["managed"])
        self.assertFalse(state["allowed"])
        self.assertFalse(state["blockedBySender"])
        self.assertTrue(state["blockedByPeer"])
        self.assertEqual(state["errorCode"], "DIRECT_MESSAGE_BLOCKED")


class DirectMessageBlockingSourceContractTests(unittest.TestCase):
    def test_chatmgt_persists_viewer_scoped_state_and_exposes_web_contracts(self):
        controller = CONTROLLER_PATH.read_text(encoding="utf-8")
        model = MODEL_PATH.read_text(encoding="utf-8")
        migration = MIGRATION_PATH.read_text(encoding="utf-8")
        alembic = ALEMBIC_PATH.read_text(encoding="utf-8")

        self.assertIn("blocked_at = db.Column(BigInteger())", model)
        self.assertIn("ADD COLUMN IF NOT EXISTS blocked_at BIGINT", migration)
        self.assertIn("ix_management_account_active_tinode_uid", migration)
        self.assertIn("ix_conversation_active_direct_key", migration)
        self.assertIn('revision = "20260825_13"', alembic)
        self.assertIn('down_revision = "20260824_12"', alembic)
        self.assertIn('"blockedByViewer"', controller)
        self.assertIn('"blockedByPeer"', controller)
        self.assertIn('"directMessagingBlocked"', controller)
        self.assertIn("/api/v1/conversation/<conversation_id>/block", controller)
        self.assertIn("/api/v1/conversation/direct-block-state", controller)
        self.assertIn("/api/v1/internal/direct-message-policy", controller)
        self.assertIn("membership.blocked_at = now if blocked else None", controller)
        self.assertIn("_ensure_direct_key(item, participants)", controller)
        self.assertIn('"allowed": not (blocked_by_sender or blocked_by_peer)', controller)
        self.assertIn('"errorCode": "DIRECT_MESSAGE_BLOCKED"', controller)
        self.assertIn("for item in direct_items", controller)
        self.assertNotIn("ManagementAccount.deleted", controller)

    def test_bridge_rejects_only_direct_publishes_before_tinode(self):
        bridge = BRIDGE_PATH.read_text(encoding="utf-8")
        self.assertIn('topic_name.startswith("usr")', bridge)
        self.assertIn("await _check_direct_publish", bridge)
        self.assertIn("continue", bridge)
        self.assertIn("await upstream.send_json(packet)", bridge)
        self.assertIn("publish = None if allow_internal_basic else _direct_publish(packet)", bridge)
        self.assertIn('"DIRECT_MESSAGE_BLOCKED"', bridge)

    def test_web_places_block_below_mute_and_surfaces_every_rejected_send(self):
        app = APP_PATH.read_text(encoding="utf-8")
        service = CHAT_SERVICE_PATH.read_text(encoding="utf-8")
        tinode = TINODE_CLIENT_PATH.read_text(encoding="utf-8")

        mute_position = app.index("<strong>{appCopy.t('Tắt thông báo')}</strong>")
        block_position = app.index("<strong>{appCopy.t('Chặn')}</strong>")
        self.assertLess(mute_position, block_position)
        self.assertIn("activeChatBlockedByViewer ?", app)
        self.assertIn("Bạn đã chặn tin nhắn", app)
        self.assertIn("handleDirectMessageBlockedError", app)
        self.assertIn("removeMessageFromConversation", app)
        self.assertIn("window.setInterval(syncDirectBlockStates, 3000)", app)
        self.assertIn("/api/v1/conversation/direct-block-state", service)
        self.assertIn("/block", service)
        self.assertIn("return getClient().publishMessage(draft", tinode)
        publish_source = tinode.split("function publishTopicMessage", 1)[1].split(
            "function publishTopicContent", 1
        )[0]
        self.assertNotIn("topic.publishMessage(draft)", publish_source)


if __name__ == "__main__":
    unittest.main()
