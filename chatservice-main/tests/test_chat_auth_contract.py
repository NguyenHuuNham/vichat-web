import ast
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PROJECT_ROOT.parent
CONTROLLER_PATH = PROJECT_ROOT / "application" / "controllers" / "api_chat_management.py"
LOGIN_PATH = REPOSITORY_ROOT / "src" / "features" / "auth" / "components" / "Login.jsx"
CHAT_SERVICE_PATH = REPOSITORY_ROOT / "src" / "features" / "chat" / "services" / "chatManagementService.js"


def function_source(path, function_name):
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    function = next(
        node for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == function_name
    )
    return source, ast.get_source_segment(source, function)


class ChatAuthContractTests(unittest.TestCase):
    def test_employee_login_route_does_not_require_management_or_account_sso(self):
        controller_source, login_source = function_source(CONTROLLER_PATH, "management_login")
        self.assertIn("'/api/v1/auth/login'", controller_source)
        self.assertNotIn("management_session_requested", login_source)
        self.assertNotIn("ACCOUNT_SSO_REQUIRED", login_source)

    def test_account_sso_is_disabled_by_default(self):
        config_source = (
            PROJECT_ROOT / "application" / "config" / "config.py"
        ).read_text(encoding="utf-8")
        auth_source = (
            PROJECT_ROOT / "application" / "services" / "auth_service.py"
        ).read_text(encoding="utf-8")
        _controller_source, sso_source = function_source(CONTROLLER_PATH, "management_sso_login")
        self.assertIn('env_bool("CHAT_ACCOUNT_SSO_ENABLED", False)', config_source)
        self.assertIn("AUTH_METHOD_DISABLED", sso_source)
        self.assertIn('"amr": str(auth_method or "password")', auth_source)
        self.assertIn('payload.get("amr") not in ("password", "account_sso")', auth_source)

    def test_chat_logout_only_revokes_the_chat_session(self):
        _controller_source, logout_source = function_source(CONTROLLER_PATH, "management_logout")
        self.assertIn("revoke_request_token(request)", logout_source)
        self.assertIn("clear_auth_cookie", logout_source)
        self.assertNotIn("logout_account_session", logout_source)
        self.assertNotIn("clear_account_cookie", logout_source)

    def test_chatui_renders_credentials_form_and_calls_chatmgt_login(self):
        login_source = LOGIN_PATH.read_text(encoding="utf-8")
        service_source = CHAT_SERVICE_PATH.read_text(encoding="utf-8")
        self.assertIn('name="username"', login_source)
        self.assertIn('name="password"', login_source)
        self.assertIn("Tài khoản nội bộ do quản trị viên cấp", login_source)
        self.assertIn("/api/v1/auth/login", service_source)
        self.assertNotIn("/api/v1/auth/sso", service_source)
        self.assertNotIn("VITE_ACCOUNT_URL", service_source)

    def test_tinode_topic_binding_requires_the_current_chat_token(self):
        _controller_source, binding_source = function_source(
            CONTROLLER_PATH,
            "conversation_bind_tinode",
        )
        service_source = CHAT_SERVICE_PATH.read_text(encoding="utf-8")
        self.assertIn("TINODE_TOKEN_REQUIRED", binding_source)
        self.assertIn("tinode_verify_topic_access", binding_source)
        self.assertIn("tinode_token: activeSession?.tinodeAuth?.token", service_source)


if __name__ == "__main__":
    unittest.main()
