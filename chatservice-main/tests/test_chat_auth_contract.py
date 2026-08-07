import ast
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PROJECT_ROOT.parent
CONTROLLER_PATH = PROJECT_ROOT / "application" / "controllers" / "api_chat_management.py"
VERIFIER_PATH = PROJECT_ROOT / "scripts" / "verify_deployment.py"
LOGIN_PATH = REPOSITORY_ROOT / "src" / "features" / "auth" / "components" / "Login.jsx"
CHAT_SERVICE_PATH = REPOSITORY_ROOT / "src" / "features" / "chat" / "services" / "chatManagementService.js"
CHAT_APP_PATH = REPOSITORY_ROOT / "src" / "app" / "App.jsx"
MANAGEMENT_APP_PATH = REPOSITORY_ROOT / "src" / "features" / "management" / "ManagementApp.jsx"
MANAGEMENT_SERVICE_PATH = REPOSITORY_ROOT / "src" / "features" / "management" / "services" / "managementAdminService.js"
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
    def test_employee_password_login_and_isolated_admin_sso_are_separate(self):
        _controller_source, employee_login_source = function_source(
            CONTROLLER_PATH,
            "employee_password_login",
        )
        _controller_source, management_login_source = function_source(
            CONTROLLER_PATH,
            "management_login",
        )

        self.assertIn("_employee_account_sso_enabled", employee_login_source)
        self.assertIn("AUTH_METHOD_DISABLED", employee_login_source)
        self.assertIn("_password_login", employee_login_source)
        self.assertIn("management_session_requested", management_login_source)
        self.assertIn("_admin_account_sso_enabled", management_login_source)
        self.assertIn("AUTH_METHOD_DISABLED", management_login_source)

    def test_management_account_sso_requires_an_account_admin_and_management_scope(self):
        _controller_source, admin_sso_source = function_source(
            CONTROLLER_PATH,
            "management_admin_sso_login",
        )

        self.assertIn("management_session_requested", admin_sso_source)
        self.assertIn("current_account_session", admin_sso_source)
        self.assertIn("_is_admin(identity)", admin_sso_source)
        self.assertIn("ACCOUNT_ADMIN_REQUIRED", admin_sso_source)
        self.assertIn("MANAGEMENT_SESSION_SCOPE", admin_sso_source)
        self.assertNotIn("tinode_sso_login", admin_sso_source)

    def test_account_sso_tokens_record_the_authentication_method(self):
        auth_source = (
            PROJECT_ROOT / "application" / "services" / "auth_service.py"
        ).read_text(encoding="utf-8")

        self.assertIn('"amr": str(auth_method or "password")', auth_source)
        self.assertIn('"scp": session_scope', auth_source)
        self.assertIn('payload.get("amr") not in ("password", "account_sso")', auth_source)
        self.assertIn('payload.get("scp") != expected_scope', auth_source)
        self.assertNotIn("Migrate an existing administrator session", auth_source)

    @repository_source_test
    def test_upgo_account_employee_auth_is_enabled_by_the_production_contract(self):
        compose_source = PRODUCTION_COMPOSE_PATH.read_text(encoding="utf-8")
        env_source = PRODUCTION_ENV_EXAMPLE_PATH.read_text(encoding="utf-8")

        self.assertIn("CHAT_ACCOUNT_SSO_ENABLED: ${CHAT_ACCOUNT_SSO_ENABLED:-true}", compose_source)
        self.assertIn("CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED: ${CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED:-true}", compose_source)
        self.assertIn("CHAT_ACCOUNT_SSO_ENABLED=true", env_source)
        self.assertIn("CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED=true", env_source)
        self.assertIn("VITE_CHAT_AUTH_MODE=account_sso", env_source)
        self.assertIn("ACCOUNT_URL=https://account.upgo.vn", env_source)
        self.assertIn("ACCOUNT_SSO_DIRECTORY_PATH=/api/v1/tenant_user", env_source)
        self.assertIn("ACCOUNT_SSO_DIRECTORY_SYNC_TTL=10", env_source)
        self.assertIn("ACCOUNT_SSO_SELF_PROFILE_PATH=/me", env_source)
        self.assertIn("ACCOUNT_SSO_USER_UPDATE_PATH=/api/v1/user", env_source)
        self.assertIn("ACCOUNT_AVATAR_UPLOAD_URL=https://service.upgo.vn/api/image/upload?path=accounts", env_source)
        self.assertIn("TINODE_SSO_SECRET: ${TINODE_SSO_SECRET:?TINODE_SSO_SECRET is required}", compose_source)
        self.assertIn("TINODE_MIRROR_LOCAL_CREDENTIALS: ${TINODE_MIRROR_LOCAL_CREDENTIALS:-true}", compose_source)
        self.assertIn("TINODE_MIRROR_LOCAL_CREDENTIALS=true", env_source)

    def test_account_sso_login_prepares_the_tinode_projection_without_returning_a_secret(self):
        controller_source, sso_source = function_source(CONTROLLER_PATH, "management_sso_login")
        _controller_source, projection_source = function_source(CONTROLLER_PATH, "_sso_account")

        self.assertIn("current_account_session", sso_source)
        self.assertIn('"connection": "management"', sso_source)
        self.assertIn("_ensure_tinode_account", sso_source)
        self.assertNotIn("tinode_auth", sso_source)
        self.assertIn('ACCOUNT_SSO_PASSWORD_MARKER = "!account-sso-only"', controller_source)
        self.assertIn("password_hash=ACCOUNT_SSO_PASSWORD_MARKER", projection_source)

    def test_local_employee_password_is_mirrored_to_tinode_basic_auth(self):
        _controller_source, login_source = function_source(CONTROLLER_PATH, "_password_login")
        _controller_source, create_source = function_source(CONTROLLER_PATH, "management_user_create")
        _controller_source, reset_source = function_source(CONTROLLER_PATH, "management_user_reset_password")
        _controller_source, change_source = function_source(CONTROLLER_PATH, "management_change_password")

        self.assertIn("verify_password(password, account.password_hash)", login_source)
        self.assertIn("_local_tinode_login(account, password)", login_source)
        self.assertIn("stable_local_account_id", create_source)
        self.assertIn("tinode_mirror_login", create_source)
        self.assertIn("_local_tinode_password_reset", reset_source)
        self.assertIn("_local_tinode_password_reset", change_source)

    def test_account_projection_can_be_converted_without_changing_tinode_identity(self):
        _controller_source, reset_source = function_source(
            CONTROLLER_PATH,
            "management_user_reset_password",
        )

        self.assertIn("converted_from_account", reset_source)
        self.assertIn('properties["auth_source"] = "local"', reset_source)
        self.assertIn('properties["legacy_account_user_id"]', reset_source)
        self.assertIn("account.tinode_username =", reset_source)
        self.assertIn("account.tinode_uid =", reset_source)

    def test_account_logout_revokes_chatmgt_and_clears_both_cookies(self):
        _controller_source, logout_source = function_source(CONTROLLER_PATH, "management_logout")

        self.assertIn("revoke_request_token(request)", logout_source)
        self.assertIn("clear_auth_cookie", logout_source)
        self.assertIn("logout_account_session", logout_source)
        self.assertIn("clear_account_cookie", logout_source)
        self.assertIn('logout_user.get("auth_method") == "account_sso"', logout_source)

    @repository_source_test
    def test_account_avatar_update_keeps_account_authoritative_and_logout_in_profile(self):
        _controller_source, avatar_source = function_source(
            CONTROLLER_PATH,
            "management_update_avatar",
        )
        service_source = CHAT_SERVICE_PATH.read_text(encoding="utf-8")
        app_source = CHAT_APP_PATH.read_text(encoding="utf-8")
        profile_source = app_source.split("workspacePanel === 'profile'", 1)[1]

        self.assertIn('request.files.get("avatar")', avatar_source)
        self.assertIn("_validated_account_identity", avatar_source)
        self.assertIn("update_account_avatar", avatar_source)
        self.assertIn("_sso_account(updated_identity", avatar_source)
        self.assertIn("/api/v1/auth/avatar", service_source)
        self.assertIn("FormData", service_source)
        self.assertIn("chatManagementService.updateAvatar(file)", app_source)
        self.assertIn("avatarUrl: avatar", app_source)
        self.assertNotIn('className="btn-logout-footer"', app_source)
        self.assertIn('className="workspace-logout-button"', profile_source)
        self.assertIn('disabled={isUpdatingProfileAvatar}', profile_source)

    @repository_source_test
    def test_chatui_uses_upgo_account_employee_login_by_default(self):
        login_source = LOGIN_PATH.read_text(encoding="utf-8")
        service_source = CHAT_SERVICE_PATH.read_text(encoding="utf-8")

        self.assertIn('name="username"', login_source)
        self.assertIn('name="password"', login_source)
        self.assertIn("Đăng nhập", login_source)
        self.assertIn("VITE_CHAT_AUTH_MODE", service_source)
        self.assertIn("account_sso", service_source)
        self.assertIn("accountLoginUrl", service_source)
        self.assertIn("/api/v1/auth/sso", service_source)
        self.assertIn("/api/v1/auth/login", service_source)
        self.assertIn("tenant_id: tenantId", service_source)
        self.assertIn("identity:", service_source)
        self.assertIn("password:", service_source)

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

    def test_tinode_token_refresh_supports_local_and_account_sessions(self):
        _controller_source, token_source = function_source(
            CONTROLLER_PATH,
            "management_tinode_token",
        )

        self.assertIn('current_user.get("auth_method") == "account_sso"', token_source)
        self.assertIn("_validated_account_identity", token_source)
        self.assertIn("_tinode_account_identity", token_source)
        self.assertIn("_repair_unprovisioned_tinode_username", token_source)
        self.assertIn("tinode_sso_login", token_source)
        self.assertIn("tinode_auth_expired", token_source)
        self.assertIn("verify_password(password, account.password_hash)", token_source)
        self.assertIn("set_auth_cookie(response, refreshed_token, request)", token_source)
        self.assertIn('"connection": "tinode"', token_source)

    @repository_source_test
    def test_tinode_renewal_keeps_employee_password_volatile(self):
        service_source = CHAT_SERVICE_PATH.read_text(encoding="utf-8")
        self.assertIn("activeTinodePassword", service_source)
        self.assertIn("tinodeRefreshPayload", service_source)
        self.assertIn("activeTinodePassword = ''", service_source)
        self.assertNotIn("writeStorage(activeTinodePassword", service_source)

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
        self.assertIn('mode="JRWPASO"', remove_source)
        self.assertIn('mode="JRWPAS"', remove_source)

    def test_direct_conversations_are_reused_by_participant_pair(self):
        _controller_source, create_source = function_source(
            CONTROLLER_PATH,
            "conversation_create",
        )

        self.assertIn("direct_key", create_source)
        self.assertIn("sorted(participant_ids)", create_source)
        self.assertIn("Conversation.properties.contains", create_source)

    def test_conversation_notification_mutes_are_viewer_scoped_chatmgt_metadata(self):
        _controller_source, serializer_source = function_source(
            CONTROLLER_PATH,
            "_serialize_conversation",
        )
        _controller_source, endpoint_source = function_source(
            CONTROLLER_PATH,
            "conversation_notification_settings",
        )
        model_source = (
            PROJECT_ROOT / "application" / "models" / "models.py"
        ).read_text(encoding="utf-8")

        self.assertIn("notification_muted_until = db.Column(BigInteger())", model_source)
        self.assertIn("participant.participant_id == viewer_id", serializer_source)
        self.assertIn('"notificationMutedUntil"', serializer_source)
        self.assertIn("_conversation_and_membership", endpoint_source)
        self.assertIn("membership.notification_muted_until = mute_until", endpoint_source)
        self.assertIn("management_session_requested", endpoint_source)
        self.assertNotIn("tinode_", endpoint_source)

    @repository_source_test
    def test_chatui_keeps_muted_notifications_in_app_without_desktop_popups(self):
        app_source = CHAT_APP_PATH.read_text(encoding="utf-8")
        service_source = CHAT_SERVICE_PATH.read_text(encoding="utf-8")

        self.assertIn("/notification-settings", service_source)
        self.assertIn("notificationMutedUntil", service_source)
        self.assertIn("isConversationMuted", app_source)
        self.assertIn("fa-bell-slash conv-muted-icon", app_source)
        self.assertNotIn("new window.Notification", app_source)
        self.assertNotIn("Notification.requestPermission", app_source)

    def test_directory_sync_revalidates_tenant_and_deactivates_missing_accounts(self):
        _controller_source, directory_source = function_source(
            CONTROLLER_PATH,
            "management_users",
        )

        self.assertGreaterEqual(directory_source.count("_validated_account_identity"), 2)
        self.assertIn("account_directory", directory_source)
        self.assertIn("_ensure_tinode_accounts_best_effort", directory_source)
        self.assertIn('"tinode_provisioned"', directory_source)
        self.assertIn('sync_status = "partial"', directory_source)
        self.assertIn('sync_status = "cached"', directory_source)
        self.assertIn("directory_removed_at", directory_source)
        self.assertIn('ManagementAccount.properties.contains({"auth_source": "account"})', directory_source)

    def test_management_admin_conversation_overview_is_read_only_and_tenant_scoped(self):
        _controller_source, endpoint_source = function_source(
            CONTROLLER_PATH,
            "management_admin_conversations",
        )
        _controller_source, serializer_source = function_source(
            CONTROLLER_PATH,
            "_admin_conversation_record",
        )

        self.assertIn("management_session_requested(request)", endpoint_source)
        self.assertIn("_management_scope_error", endpoint_source)
        self.assertIn("_management_account_sso_guard", endpoint_source)
        self.assertIn("_is_admin", endpoint_source)
        self.assertIn("Conversation.tenant_id == tenant_id", endpoint_source)
        self.assertIn("ConversationParticipant.tenant_id == tenant_id", endpoint_source)
        self.assertIn("ManagementAccount.tenant_id == tenant_id", endpoint_source)
        self.assertIn("_admin_conversation_record", endpoint_source)
        self.assertIn('"realtime"', serializer_source)
        self.assertNotIn("ChatMessage", serializer_source)

    def test_management_mutations_and_audit_require_the_management_scope(self):
        for function_name in (
            "management_user_create",
            "management_user_update",
            "management_user_revoke_session",
            "management_user_reset_password",
            "management_audit_logs",
        ):
            with self.subTest(function_name=function_name):
                _controller_source, endpoint_source = function_source(
                    CONTROLLER_PATH,
                    function_name,
                )
                self.assertIn("management_session_requested(request)", endpoint_source)
                self.assertIn("_management_scope_error", endpoint_source)
                self.assertIn("_management_account_sso_guard", endpoint_source)

    def test_local_password_change_updates_the_mirrored_tinode_credential(self):
        _controller_source, password_source = function_source(
            CONTROLLER_PATH,
            "management_change_password",
        )

        self.assertIn("verify_password", password_source)
        self.assertIn("account.password_hash = new_password_hash", password_source)
        self.assertIn("_local_tinode_password_reset", password_source)
        self.assertIn("AUTH_MANAGEMENT_PASSWORD_CHANGE", password_source)

    def test_deployment_verifier_does_not_depend_on_the_tinode_admin_password(self):
        verifier_source = VERIFIER_PATH.read_text(encoding="utf-8")
        _verifier_source, verify_source = function_source(VERIFIER_PATH, "verify_http")
        _verifier_source, runtime_verify_source = function_source(
            VERIFIER_PATH,
            "_verify_http",
        )
        _verifier_source, create_source = function_source(
            VERIFIER_PATH,
            "create_management_verifier_account",
        )
        _verifier_source, delete_source = function_source(
            VERIFIER_PATH,
            "delete_management_verifier_account",
        )

        self.assertIn("create_management_verifier_account", verify_source)
        self.assertIn("finally", verify_source)
        self.assertIn("delete_management_verifier_account", verify_source)
        self.assertIn("sys.path.insert(0, str(PROJECT_ROOT))", verifier_source)
        self.assertIn("deployment_verifier", create_source)
        self.assertIn("issue_access_token", create_source)
        self.assertIn('session_scope="management"', create_source)
        self.assertIn('session_scope="chat"', create_source)
        self.assertIn('management_account["chat_token"]', runtime_verify_source)
        self.assertIn("deployment_verifier", delete_source)

    @repository_source_test
    def test_management_web_links_employee_invites_to_upgo_without_message_content(self):
        app_source = MANAGEMENT_APP_PATH.read_text(encoding="utf-8")
        service_source = MANAGEMENT_SERVICE_PATH.read_text(encoding="utf-8")

        self.assertIn("Tài khoản nhân viên doanh nghiệp", app_source)
        self.assertIn("Mời nhân viên trên UpGO", app_source)
        self.assertIn("employeeAccountSso", app_source)
        self.assertIn("Conversation và nhóm", app_source)
        self.assertIn("Không đọc nội dung chat", app_source)
        self.assertIn("listConversations", service_source)
        self.assertIn("revokeSessions", service_source)
        self.assertIn("/api/v1/admin/sso", service_source)
        self.assertIn("startAccountLogin", service_source)
        self.assertNotIn("changePassword", service_source)
        self.assertIn("createUser", service_source)
        self.assertIn("updateUser", service_source)
        self.assertIn("resetPassword", service_source)

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
