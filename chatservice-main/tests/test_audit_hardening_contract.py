import sys
import unittest
import importlib.util
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PROJECT_ROOT.parent
sys.path.insert(0, str(PROJECT_ROOT))

_pagination_spec = importlib.util.spec_from_file_location(
    "audit_pagination",
    PROJECT_ROOT / "application" / "services" / "pagination.py",
)
_pagination = importlib.util.module_from_spec(_pagination_spec)
_pagination_spec.loader.exec_module(_pagination)
PaginationError = _pagination.PaginationError
bounded_int = _pagination.bounded_int


class AuditHardeningContractTests(unittest.TestCase):
    def test_bounded_integer_rejects_malformed_negative_and_huge_values(self):
        for value in ("abc", "-1", "101"):
            with self.subTest(value=value):
                with self.assertRaises(PaginationError):
                    bounded_int(value, name="limit", default=100, minimum=1, maximum=100)

    def test_outbound_account_requests_keep_tls_verification_and_timeout(self):
        helper = (
            PROJECT_ROOT / "application" / "controllers" / "helpers" / "helper_common.py"
        ).read_text(encoding="utf-8")
        config = (PROJECT_ROOT / "application" / "config" / "config.py").read_text(encoding="utf-8")
        for source in (
            (PROJECT_ROOT / "application" / "controllers" / "api_user.py").read_text(encoding="utf-8"),
            (PROJECT_ROOT / "application" / "controllers" / "api_organization.py").read_text(encoding="utf-8"),
        ):
            self.assertNotIn("verify=False", source)
            self.assertIn("outbound_request_options", source)
        self.assertIn("CHAT_HTTP_CA_BUNDLE", config)
        self.assertIn("ACCOUNT_SSO_CA_BUNDLE", config)
        self.assertIn('"timeout": timeout', helper)
        self.assertIn('"verify": ca_bundle or True', helper)

    def test_client_errors_do_not_return_upstream_body_or_raw_generic_exception(self):
        user_source = (PROJECT_ROOT / "application" / "controllers" / "api_user.py").read_text(encoding="utf-8")
        chatbot_source = (PROJECT_ROOT / "application" / "controllers" / "api_chatbot.py").read_text(encoding="utf-8")
        self.assertNotIn('"details": resp.text', user_source)
        self.assertIn("The account service returned an invalid response.", user_source)
        self.assertIn("The chatbot service is temporarily unavailable.", chatbot_source)

    def test_media_cleanup_sweeper_recovers_pending_delete_rows(self):
        source = (PROJECT_ROOT / "application" / "services" / "chat_media_service.py").read_text(encoding="utf-8")
        self.assertIn('"PENDING_DELETE", "RETRY"', source)
        self.assertIn("without ever touching a bound chat object", source)

    def test_chatbot_numeric_inputs_return_parameter_errors(self):
        source = (PROJECT_ROOT / "application" / "controllers" / "api_chatbot.py").read_text(encoding="utf-8")
        self.assertIn("bounded_int", source)
        self.assertIn('"error_code": "PARAM_ERROR"', source)
        self.assertIn("maximum=20", source)
        self.assertIn("maximum=500", source)

    def test_management_scope_cannot_enter_chat_routes(self):
        source = (PROJECT_ROOT / "application" / "controllers" / "api_chat_management.py").read_text(encoding="utf-8")
        for function_name in (
            "friend_request_list",
            "friend_request_create",
            "friend_request_respond",
            "conversation_list",
            "conversation_create",
            "conversation_bind_tinode",
            "conversation_participant_add",
            "conversation_participant_approval",
            "conversation_participant_remove",
        ):
            start = source.index(f"async def {function_name}")
            next_function = source.find("\nasync def ", start + 1)
            block = source[start:next_function if next_function != -1 else len(source)]
            self.assertIn("management_session_requested(request)", block, function_name)
            self.assertIn("CHAT_SESSION_REQUIRED", source)

    def test_profile_viewer_client_uses_one_cursor_page_and_can_load_more(self):
        service = (REPOSITORY_ROOT / "src" / "features" / "chat" / "services" / "chatManagementService.js").read_text(encoding="utf-8")
        app = (REPOSITORY_ROOT / "src" / "app" / "App.jsx").read_text(encoding="utf-8")
        self.assertIn("async listProfileViewers({ signal, cursor = '', limit = 100 } = {})", service)
        self.assertIn("/api/v1/profile/views?${params.toString()}", service)
        self.assertNotIn("fetchAllPages('/api/v1/profile/views'", service)
        self.assertIn("loadMoreProfileViewers", app)
        self.assertIn("profile-viewers-load-more", app)
        self.assertIn("profileViewersControllerRef.current?.abort", app)


if __name__ == "__main__":
    unittest.main()
