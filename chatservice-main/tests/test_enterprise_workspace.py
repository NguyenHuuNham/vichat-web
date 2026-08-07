import ast
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PROJECT_ROOT.parent
CONTROLLER_PATH = PROJECT_ROOT / "application" / "controllers" / "api_enterprise_workspace.py"
MODELS_PATH = PROJECT_ROOT / "application" / "models" / "models.py"
MIGRATION_PATH = PROJECT_ROOT / "migrations" / "010_enterprise_workspace.sql"
ALEMBIC_PATH = PROJECT_ROOT / "alembic" / "versions" / "20260804_10_enterprise_workspace.py"
SERVICE_PATH = PROJECT_ROOT / "application" / "services" / "enterprise_workspace_service.py"
VERIFIER_PATH = PROJECT_ROOT / "scripts" / "verify_deployment.py"
APP_PATH = REPOSITORY_ROOT / "src" / "app" / "App.jsx"
WORKSPACE_COMPONENT_PATH = REPOSITORY_ROOT / "src" / "features" / "workspace" / "components" / "EnterpriseWorkspace.jsx"
WORKSPACE_SERVICE_PATH = REPOSITORY_ROOT / "src" / "features" / "workspace" / "services" / "enterpriseWorkspaceService.js"

service_spec = importlib.util.spec_from_file_location("enterprise_workspace_service", SERVICE_PATH)
service_module = importlib.util.module_from_spec(service_spec)
service_spec.loader.exec_module(service_module)
WorkspaceValidationError = service_module.WorkspaceValidationError
allowed_actions = service_module.allowed_actions
build_search_text = service_module.build_search_text
can_create_type = service_module.can_create_type
can_edit_item = service_module.can_edit_item
can_read_item = service_module.can_read_item
normalize_participants = service_module.normalize_participants
transition_for_action = service_module.transition_for_action
validate_item_payload = service_module.validate_item_payload


def function_source(path, function_name):
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    function = next(
        node for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == function_name
    )
    return ast.get_source_segment(source, function)


class EnterpriseWorkspaceValidationTests(unittest.TestCase):
    def test_validates_type_specific_payloads(self):
        task = validate_item_payload({
            "type": "task",
            "title": "Chuan bi bao cao",
            "priority": "high",
            "properties": {"progress": 20, "checklist": ["So lieu", "Duyet"]},
        })
        self.assertEqual(task["item_type"], "TASK")
        self.assertEqual(task["status"], "TODO")
        self.assertEqual(task["properties"]["progress"], 20)

        event = validate_item_payload({
            "type": "EVENT",
            "title": "Hop khoi",
            "starts_at": "2026-08-05T08:00:00+07:00",
            "ends_at": "2026-08-05T09:00:00+07:00",
            "properties": {"location": "Phong hop 2"},
        })
        self.assertLess(event["starts_at"], event["ends_at"])

    def test_rejects_unstructured_or_secret_integration_properties(self):
        with self.assertRaises(WorkspaceValidationError):
            validate_item_payload({
                "type": "INTEGRATION",
                "title": "ERP",
                "properties": {"api_key": "must-not-be-stored"},
            })

    def test_approval_requires_an_approver(self):
        with self.assertRaises(WorkspaceValidationError):
            normalize_participants("APPROVAL", {"participants": []})
        participants = normalize_participants("APPROVAL", {
            "participants": [{"account_id": "user-a", "role": "approver"}],
        })
        self.assertEqual(participants, [{"account_id": "user-a", "role": "APPROVER"}])

    def test_search_text_is_bounded_and_contains_business_fields(self):
        value = build_search_text("Quy trinh nghi phep", "Ban nhap", {
            "category": "Nhan su",
            "tags": ["noi bo", "phe duyet"],
        })
        self.assertIn("quy trinh nghi phep", value)
        self.assertIn("nhan su", value)
        self.assertLessEqual(len(value), 20000)


class EnterpriseWorkspacePermissionTests(unittest.TestCase):
    @staticmethod
    def item(item_type="TASK", status="TODO", visibility="PARTICIPANTS"):
        return SimpleNamespace(
            item_type=item_type,
            status=status,
            visibility=visibility,
            created_by="creator",
            owner_id="owner",
            properties={"requires_ack": True},
        )

    def test_admin_only_types_are_enforced(self):
        self.assertFalse(can_create_type("ANNOUNCEMENT", False))
        self.assertFalse(can_create_type("INTEGRATION", False))
        self.assertTrue(can_create_type("ANNOUNCEMENT", True))
        self.assertTrue(can_create_type("TASK", False))

    def test_participant_visibility_does_not_leak_to_other_users(self):
        item = self.item()
        self.assertTrue(can_read_item(item, "member-a", False, ["member-a"]))
        self.assertFalse(can_read_item(item, "tenant-peer", False, ["member-a"]))
        item.visibility = "COMPANY"
        self.assertTrue(can_read_item(item, "tenant-peer", False, []))

    def test_only_authorized_roles_can_edit_or_transition(self):
        wiki = self.item(item_type="WIKI", status="DRAFT")
        self.assertTrue(can_edit_item(wiki, "editor", False, ["EDITOR"]))
        self.assertFalse(can_edit_item(wiki, "watcher", False, ["WATCHER"]))

        task = self.item()
        actions = allowed_actions(task, "assignee", False, ["ASSIGNEE"])
        self.assertIn("START", actions)
        self.assertEqual(transition_for_action(task, "START", actions), "IN_PROGRESS")
        with self.assertRaises(WorkspaceValidationError):
            transition_for_action(task, "ARCHIVE", actions)


class EnterpriseWorkspaceContractTests(unittest.TestCase):
    def test_controller_routes_are_tenant_scoped_and_do_not_touch_tinode(self):
        source = CONTROLLER_PATH.read_text(encoding="utf-8")
        item_query_source = function_source(CONTROLLER_PATH, "_item_query")
        visible_source = function_source(CONTROLLER_PATH, "_visible_query")
        account_source = function_source(CONTROLLER_PATH, "_validate_account_ids")
        conversation_source = function_source(CONTROLLER_PATH, "_validate_conversation_reference")

        self.assertIn("EnterpriseItem.tenant_id == tenant_id", item_query_source)
        self.assertIn("EnterpriseItemParticipant.tenant_id == tenant_id", visible_source)
        self.assertIn("ManagementAccount.tenant_id == tenant_id", account_source)
        self.assertIn("Conversation.tenant_id == tenant_id", conversation_source)
        self.assertIn("ConversationParticipant.tenant_id == tenant_id", conversation_source)
        self.assertNotIn("tinode", source.lower())

    def test_schema_has_items_participants_activity_and_search_indexes(self):
        model_source = MODELS_PATH.read_text(encoding="utf-8")
        migration_source = MIGRATION_PATH.read_text(encoding="utf-8")
        alembic_source = ALEMBIC_PATH.read_text(encoding="utf-8")

        self.assertIn("class EnterpriseItem(CommonModel)", model_source)
        self.assertIn("class EnterpriseItemParticipant(CommonModel)", model_source)
        self.assertIn("class EnterpriseActivity(CommonModel)", model_source)
        self.assertIn("CREATE TABLE IF NOT EXISTS enterprise_item", migration_source)
        self.assertIn("uq_enterprise_item_participant_active", migration_source)
        self.assertIn("to_tsvector('simple', search_text)", migration_source)
        self.assertIn('down_revision = "20260803_09"', alembic_source)

    def test_deployment_verifier_requires_the_enterprise_schema(self):
        verifier_source = function_source(VERIFIER_PATH, "verify_database")

        self.assertIn("public.enterprise_item", verifier_source)
        self.assertIn("public.enterprise_item_participant", verifier_source)
        self.assertIn("public.enterprise_activity", verifier_source)
        self.assertIn("uq_enterprise_item_participant_active", verifier_source)

    @unittest.skipUnless(APP_PATH.is_file(), "repository frontend source is not included in the runtime image")
    def test_chatui_integration_is_isolated_from_tinode(self):
        app_source = APP_PATH.read_text(encoding="utf-8")
        component_source = WORKSPACE_COMPONENT_PATH.read_text(encoding="utf-8")
        service_source = WORKSPACE_SERVICE_PATH.read_text(encoding="utf-8")

        self.assertIn("EnterpriseWorkspace", app_source)
        self.assertIn("Giao việc từ tin nhắn", app_source)
        self.assertIn("openWorkspacePanel('enterprise')", app_source)
        self.assertIn("window.setInterval", component_source)
        self.assertIn("15000", component_source)
        self.assertIn("/api/v1/workspace/items", service_source)
        self.assertNotIn("tinodeClient", component_source)
        self.assertNotIn("tinodeClient", service_source)


if __name__ == "__main__":
    unittest.main()
