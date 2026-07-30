import ast
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PROJECT_ROOT.parent
CONTROLLER_PATH = PROJECT_ROOT / "application" / "controllers" / "api_chat_management.py"
LOGIN_PATH = REPOSITORY_ROOT / "src" / "features" / "auth" / "components" / "Login.jsx"
CHAT_SERVICE_PATH = REPOSITORY_ROOT / "src" / "features" / "chat" / "services" / "chatManagementService.js"
PRODUCTION_COMPOSE_PATH = REPOSITORY_ROOT / "infrastructure" / "production" / "compose.yaml"
PRODUCTION_ENV_EXAMPLE_PATH = REPOSITORY_ROOT / "infrastructure" / "production" / ".env.example"


def function_source(path, function_name):
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    function = next(
        node for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == function_name
    )
    return source, ast.get_source_segment(source, function)


class ChatAuthContractTests(unittest.TestCase):
    def test_employee_password_login_is_disabled_when_account_sso_is_enabled(self):
        _controller_source, employee_login_source = function_source(
            CONTROLLER_PATH,
            "employee_password_login",
        )
        _controller_source, management_login_source = function_source(
            CONTROLLER_PATH,
            "management_login",
        )

        self.assertIn("CHAT_ACCOUNT_SSO_ENABLED", employee_login_source)
        self.assertIn("AUTH_METHOD_DISABLED", employee_login_source)
        self.assertIn("management_session_requested", management_login_source)
        self.assertIn("_password_login", management_login_source)
        self.assertIn("include_tinode=False", management_login_source)

    def test_account_sso_is_enabled_by_the_production_contract(self):
        compose_source = PRODUCTION_COMPOSE_PATH.read_text(encoding="utf-8")
        env_source = PRODUCTION_ENV_EXAMPLE_PATH.read_text(encoding="utf-8")
        auth_source = (
            PROJECT_ROOT / "application" / "services" / "auth_service.py"
        ).read_text(encoding="utf-8")

        self.assertIn("CHAT_ACCOUNT_SSO_ENABLED: ${CHAT_ACCOUNT_SSO_ENABLED:-true}", compose_source)
        self.assertIn("CHAT_ACCOUNT_SSO_ENABLED=true", env_source)
        self.assertIn("ACCOUNT_URL=https://account.upgo.vn", env_source)
        self.assertIn('"amr": str(auth_method or "password")', auth_source)
        self.assertIn('payload.get("amr") not in ("password", "account_sso")', auth_source)

    def test_account_sso_login_does_not_provision_or_login_to_tinode(self):
        controller_source, sso_source = function_source(CONTROLLER_PATH, "management_sso_login")
        _controller_source, projection_source = function_source(CONTROLLER_PATH, "_sso_account")

        self.assertIn("current_account_session", sso_source)
        self.assertIn('"connection": "management"', sso_source)
        self.assertNotIn("tinode_sso_login", sso_source)
        self.assertNotIn("tinode_auth", sso_source)
        self.assertIn('ACCOUNT_SSO_PASSWORD_MARKER = "!account-sso-only"', controller_source)
        self.assertIn("password_hash=ACCOUNT_SSO_PASSWORD_MARKER", projection_source)

    def test_account_logout_revokes_chatmgt_and_clears_both_cookies(self):
        _controller_source, logout_source = function_source(CONTROLLER_PATH, "management_logout")

        self.assertIn("revoke_request_token(request)", logout_source)
        self.assertIn("clear_auth_cookie", logout_source)
        self.assertIn("logout_account_session", logout_source)
        self.assertIn("clear_account_cookie", logout_source)
        self.assertIn('logout_user.get("auth_method") == "account_sso"', logout_source)

    def test_chatui_uses_account_sso_without_employee_password_fields(self):
        login_source = LOGIN_PATH.read_text(encoding="utf-8")
        service_source = CHAT_SERVICE_PATH.read_text(encoding="utf-8")

        self.assertNotIn('name="username"', login_source)
        self.assertNotIn('name="password"', login_source)
        self.assertNotIn("requestPasswordReset", login_source)
        self.assertIn("Đăng nhập bằng UpGO Account", login_source)
        self.assertIn("/api/v1/auth/sso", service_source)
        self.assertNotIn("/api/v1/auth/login", service_source)
        self.assertIn("VITE_ACCOUNT_URL", service_source)
        self.assertIn("searchParams.set('continue'", service_source)

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
