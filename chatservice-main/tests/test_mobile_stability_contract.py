from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONTROLLER_PATH = PROJECT_ROOT / "application" / "controllers" / "api_chat_management.py"
MODEL_PATH = PROJECT_ROOT / "application" / "models" / "models.py"
MIGRATION_SQL = PROJECT_ROOT / "migrations" / "017_mobile_group_idempotency.sql"
ALEMBIC_REVISION = PROJECT_ROOT / "alembic" / "versions" / "20260928_17_mobile_group_idempotency.py"
VERIFIER_PATH = PROJECT_ROOT / "scripts" / "verify_deployment.py"


class MobileStabilityContractTests(unittest.TestCase):
    def test_group_create_uses_tenant_scoped_idempotency_and_recovers_races(self):
        source = CONTROLLER_PATH.read_text(encoding="utf-8")
        self.assertIn("client_request_id", source)
        self.assertIn("Conversation.creation_request_id == client_request_id", source)
        self.assertIn("CONVERSATION_REQUEST_CONFLICT", source)
        self.assertIn("except IntegrityError:", source)
        self.assertIn("creation_request_id=client_request_id if client_request_id and is_group else None", source)
        self.assertIn("Conversation.tenant_id == tenant_id", source)

    def test_group_idempotency_is_backed_by_a_partial_unique_index(self):
        model = MODEL_PATH.read_text(encoding="utf-8")
        migration = MIGRATION_SQL.read_text(encoding="utf-8")
        revision = ALEMBIC_REVISION.read_text(encoding="utf-8")
        self.assertIn("creation_request_id = db.Column(String(128)", model)
        self.assertIn("uq_conversation_active_creation_request", migration)
        self.assertIn("ON conversation(tenant_id, creation_request_id)", migration)
        self.assertIn("WHERE deleted = false", migration)
        self.assertIn('revision = "20260928_17"', revision)
        self.assertIn('down_revision = "20260921_16"', revision)

    def test_deployment_verifier_exercises_direct_conversation_policy(self):
        verifier = VERIFIER_PATH.read_text(encoding="utf-8")
        self.assertIn("/api/v1/conversation/direct-block-state", verifier)
        self.assertIn("Chatmgt direct conversation policy returned HTTP", verifier)


if __name__ == "__main__":
    unittest.main()
