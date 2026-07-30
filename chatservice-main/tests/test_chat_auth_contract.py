import ast
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PROJECT_ROOT.parent
CONTROLLER_PATH = PROJECT_ROOT / "application" / "controllers" / "api_chat_management.py"
LOGIN_PATH = REPOSITORY_ROOT / "src" / "features" / "auth" / "components" / "Login.jsx"
CHAT_SERVICE_PATH = REPOSITORY_ROOT / "src" / "features" / "chat" / "services" / "chatManagementService.js"
CHAT_APP_PATH = REPOSITORY_ROOT / "src" / "app" / "App.jsx"
PRODUCTION_COMPOSE_PATH = REPOSITORY_ROOT / "infrastructure" / "production" / "compose.yaml"
PRODUCTION_ENV_EXAMPLE_PATH = REPOSITORY_ROOT / "infrastructure" / "production" / ".env.example"
HAS_REPOSITORY_SOURCES = all(path.is_file() for path in (
    LOGIN_PATH,
    CHAT_SERVICE_PATH,
    PRODUCTION_COMPOSE_PATH,
    PRODUCTION_ENV_EXAMPLE_PATH,
))
repository_source_test = unittest.skipUnless(
    HAS_REPOSITORY_SOURCES,
    "repository frontend/deployment sources are not included in the Chatmgt runtime image",
)


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

    def test_account_sso_tokens_record_the_authentication_method(self):
        auth_source = (
            PROJECT_ROOT / "application" / "services" / "auth_service.py"
        ).read_text(encoding="utf-8")

        self.assertIn('"amr": str(auth_method or "password")', auth_source)
        self.assertIn('payload.get("amr") not in ("password", "account_sso")', auth_source)

    @repository_source_test
    def test_account_sso_is_enabled_by_the_production_contract(self):
        compose_source = PRODUCTION_COMPOSE_PATH.read_text(encoding="utf-8")
        env_source = PRODUCTION_ENV_EXAMPLE_PATH.read_text(encoding="utf-8")

        self.assertIn("CHAT_ACCOUNT_SSO_ENABLED: ${CHAT_ACCOUNT_SSO_ENABLED:-true}", compose_source)
        self.assertIn("CHAT_ACCOUNT_SSO_ENABLED=true", env_source)
        self.assertIn("ACCOUNT_URL=https://account.upgo.vn", env_source)
        self.assertIn("ACCOUNT_SSO_DIRECTORY_PATH=/api/v1/tenant_user", env_source)
        self.assertIn("TINODE_SSO_SECRET: ${TINODE_SSO_SECRET:?TINODE_SSO_SECRET is required}", compose_source)

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

    @repository_source_test
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
        self.assertIn("TINODE_TOKEN_REQUIRED", binding_source)
        self.assertIn("tinode_verify_topic_access", binding_source)
        self.assertIn("expected_member_uids", binding_source)

    def test_direct_tinode_topics_are_viewer_relative_and_not_persisted(self):
        _controller_source, serialize_source = function_source(
            CONTROLLER_PATH,
            "_serialize_conversation",
        )
        _controller_source, binding_source = function_source(
            CONTROLLER_PATH,
            "conversation_bind_tinode",
        )

        self.assertIn("direct_peer_tinode_uid", serialize_source)
        self.assertIn("item.tinode_topic if is_group", serialize_source)
        self.assertIn("item.tinode_topic = topic_name if is_group else None", binding_source)
        self.assertIn("if is_group:", binding_source)

    @repository_source_test
    def test_typing_does_not_reprovision_or_disable_the_composer(self):
        app_source = CHAT_APP_PATH.read_text(encoding="utf-8")
        draft_source = app_source.split("const updateCurrentDraft =", 1)[1].split(
            "const messageActionKey",
            1,
        )[0]

        self.assertIn("readyTinodeTypingTopic", draft_source)
        self.assertIn("tinodeClient.authenticated", draft_source)
        self.assertNotIn("ensureTinodeConversationTopic", draft_source)
        self.assertEqual(app_source.count("ref={messageInputRef}"), 1)
        composer_source = app_source.split('<div className="input-text-container">', 1)[1]
        self.assertIn("ref={messageInputRef}", composer_source)

    @repository_source_test
    def test_direct_identity_and_presence_are_viewer_relative_and_realtime(self):
        app_source = CHAT_APP_PATH.read_text(encoding="utf-8")
        tinode_source = (
            REPOSITORY_ROOT / "src" / "features" / "chat" / "services" / "tinodeClient.js"
        ).read_text(encoding="utf-8")

        self.assertIn("findDirectPeer(room, accounts, user)", app_source)
        self.assertIn("members: [{ ...peer }]", app_source)
        self.assertIn("resolveTinodePresenceOnline", tinode_source)
        self.assertIn("meTopic.onPres = presence =>", tinode_source)

    def test_tinode_bridge_is_explicitly_requested_after_account_login(self):
        _controller_source, token_source = function_source(
            CONTROLLER_PATH,
            "management_tinode_token",
        )

        self.assertIn("_validated_account_identity", token_source)
        self.assertIn("_repair_unprovisioned_tinode_username", token_source)
        self.assertIn("tinode_sso_login", token_source)
        self.assertIn('"connection": "tinode"', token_source)

    def test_tinode_participants_are_prepared_from_chatmgt_membership(self):
        _controller_source, prepare_source = function_source(
            CONTROLLER_PATH,
            "conversation_prepare_tinode",
        )

        self.assertIn("_conversation_and_membership", prepare_source)
        self.assertIn("_active_conversation_accounts", prepare_source)
        self.assertIn("_ensure_tinode_account", prepare_source)

    def test_group_membership_updates_are_bridged_by_chatmgt(self):
        _controller_source, add_source = function_source(
            CONTROLLER_PATH,
            "conversation_participant_add",
        )
        _controller_source, remove_source = function_source(
            CONTROLLER_PATH,
            "conversation_participant_remove",
        )

        self.assertIn("tinode_add_topic_members", add_source)
        self.assertIn("tinode_remove_topic_member", remove_source)
        self.assertIn("TINODE_TOKEN_REQUIRED", add_source)
        self.assertIn("TINODE_TOKEN_REQUIRED", remove_source)

    def test_direct_conversations_are_reused_by_participant_pair(self):
        _controller_source, create_source = function_source(
            CONTROLLER_PATH,
            "conversation_create",
        )

        self.assertIn("direct_key", create_source)
        self.assertIn("sorted(participant_ids)", create_source)
        self.assertIn("Conversation.properties.contains", create_source)

    def test_directory_sync_revalidates_tenant_and_deactivates_missing_accounts(self):
        _controller_source, directory_source = function_source(
            CONTROLLER_PATH,
            "management_users",
        )

        self.assertGreaterEqual(directory_source.count("_validated_account_identity"), 2)
        self.assertIn("account_directory", directory_source)
        self.assertIn("directory_removed_at", directory_source)

    @repository_source_test
    def test_chatui_forwards_the_current_tinode_token_when_binding(self):
        service_source = CHAT_SERVICE_PATH.read_text(encoding="utf-8")
        self.assertIn("getFreshTinodeAuth", service_source)
        self.assertIn("tinode_token: tinodeAuth?.token", service_source)

    @repository_source_test
    def test_chatui_promotes_management_data_to_tinode_realtime(self):
        app_source = CHAT_APP_PATH.read_text(encoding="utf-8")
        service_source = CHAT_SERVICE_PATH.read_text(encoding="utf-8")

        self.assertIn("chatManagementService.refreshTinodeToken()", app_source)
        self.assertIn("setChatMode('tinode')", app_source)
        self.assertIn("prepareTinodeConversation", app_source)
        self.assertIn("/tinode-prepare", service_source)
        self.assertIn("setTokenProvider", app_source)

    @repository_source_test
    def test_chatui_management_mode_uses_chatmgt_without_fake_messages(self):
        app_source = CHAT_APP_PATH.read_text(encoding="utf-8")
        service_source = CHAT_SERVICE_PATH.read_text(encoding="utf-8")

        self.assertIn("usesManagementData", app_source)
        self.assertIn("realtimeMessagingPending", app_source)
        self.assertIn("Dữ liệu Chatmgt vẫn sẵn sàng", app_source)
        self.assertIn("/api/v1/chat/users", service_source)
        self.assertIn("/api/v1/friend-request", service_source)
        self.assertIn("/api/v1/conversation", service_source)


if __name__ == "__main__":
    unittest.main()
