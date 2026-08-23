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
PRODUCTION_NGINX_PATH = REPOSITORY_ROOT / "infrastructure" / "production" / "nginx.conf"
TINODE_BRIDGE_PATH = PROJECT_ROOT / "scripts" / "tinode_account_bridge.py"
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
        build_source = (PROJECT_ROOT.parent / "scripts" / "build-production.mjs").read_text(encoding="utf-8")

        self.assertIn("CHAT_ACCOUNT_SSO_ENABLED: ${CHAT_ACCOUNT_SSO_ENABLED:-true}", compose_source)
        self.assertIn("CHAT_ACCOUNT_CREDENTIAL_LOGIN_ENABLED: ${CHAT_ACCOUNT_CREDENTIAL_LOGIN_ENABLED:-true}", compose_source)
        self.assertIn("CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED: ${CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED:-true}", compose_source)
        self.assertIn("CHAT_ACCOUNT_SSO_ENABLED=true", env_source)
        self.assertIn("CHAT_ACCOUNT_CREDENTIAL_LOGIN_ENABLED=true", env_source)
        self.assertIn("CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED=true", env_source)
        self.assertIn("VITE_CHAT_AUTH_MODE=account_password", env_source)
        self.assertIn("ACCOUNT_URL=https://account.upgo.vn", env_source)
        self.assertIn("ACCOUNT_SSO_LOGIN_PATH=/login", env_source)
        self.assertIn("ACCOUNT_SSO_DIRECTORY_PATH=/api/v1/tenant_user", env_source)
        self.assertIn("ACCOUNT_SSO_DIRECTORY_SYNC_TTL=10", env_source)
        self.assertIn("ACCOUNT_SSO_SELF_PROFILE_PATH=/me", env_source)
        self.assertIn("ACCOUNT_SSO_USER_UPDATE_PATH=/api/v1/user", env_source)
        self.assertIn("ACCOUNT_AVATAR_UPLOAD_URL=https://service.upgo.vn/api/image/upload?path=accounts", env_source)
        self.assertIn("ACCOUNT_AVATAR_UPLOAD_TIMEOUT=60", env_source)
        self.assertIn("ACCOUNT_AVATAR_UPLOAD_TIMEOUT: ${ACCOUNT_AVATAR_UPLOAD_TIMEOUT:-60}", compose_source)
        self.assertIn("CHATBOT_API_URL=https://knowledge-ai.gonapp.net/api/v1/chat", env_source)
        self.assertIn("CHATBOT_EXTERNAL_AUTH_HEADER=X-API-Key", env_source)
        self.assertIn("CHATBOT_EXTERNAL_REQUEST_MODE=knowledge-retrieval", env_source)
        self.assertIn("TINODE_SSO_SECRET: ${TINODE_SSO_SECRET:?TINODE_SSO_SECRET is required}", compose_source)
        self.assertIn("TINODE_BRIDGE_INTERNAL_KEY: ${TINODE_BRIDGE_INTERNAL_KEY:?TINODE_BRIDGE_INTERNAL_KEY is required}", compose_source)
        self.assertIn("TINODE_CENTRAL_WS_URL=wss://web.vichat.net/v0/channels", env_source)
        self.assertIn("TINODE_BRIDGE_INTERNAL_KEY=", env_source)
        self.assertIn("TINODE_MIRROR_LOCAL_CREDENTIALS: ${TINODE_MIRROR_LOCAL_CREDENTIALS:-true}", compose_source)
        self.assertIn("TINODE_MIRROR_LOCAL_CREDENTIALS=true", env_source)
        self.assertIn("VITE_CHAT_TENANT_ID: ''", build_source)
        self.assertNotIn("VITE_CHAT_TENANT_ID: 'tn6913580727957397'", build_source)
        self.assertIn("VITE_CHAT_AUTH_MODE: ${VITE_CHAT_AUTH_MODE:-account_password}", compose_source)
        self.assertIn("ARG VITE_CHAT_AUTH_MODE=account_password", (PROJECT_ROOT.parent / "infrastructure" / "production" / "Dockerfile").read_text(encoding="utf-8"))
        self.assertIn("CHATBOT_DEFAULT_TENANT: ${CHATBOT_DEFAULT_TENANT:-}", compose_source)
        self.assertIn("CHATBOT_DEFAULT_TENANT=", env_source)

    def test_account_sso_login_prepares_the_tinode_projection_without_returning_a_secret(self):
        controller_source, sso_source = function_source(CONTROLLER_PATH, "management_sso_login")
        _controller_source, projection_source = function_source(CONTROLLER_PATH, "_sso_account")

        self.assertIn("current_account_session", sso_source)
        self.assertIn('"connection": "management"', sso_source)
        self.assertIn("_ensure_tinode_account", sso_source)
        self.assertNotIn("tinode_auth", sso_source)
        self.assertIn('ACCOUNT_SSO_PASSWORD_MARKER = "!account-sso-only"', controller_source)
        self.assertIn("password_hash=ACCOUNT_SSO_PASSWORD_MARKER", projection_source)

    def test_employee_tenant_switch_rotates_chat_only_after_membership_validation(self):
        _controller_source, switch_source = function_source(
            CONTROLLER_PATH,
            "management_switch_tenant",
        )

        self.assertIn("management_session_requested", switch_source)
        self.assertIn('current_user.get("auth_method") != "account_sso"', switch_source)
        self.assertIn("preferred_tenant_id=requested_tenant_id", switch_source)
        self.assertIn("account_user_id", switch_source)
        self.assertIn("await switch_account_tenant(", switch_source)
        self.assertIn("switched_account_cookie", switch_source)
        self.assertIn("set_account_cookie(response, switched_account_cookie)", switch_source)
        self.assertIn("switched_identity = await current_account_session(request)", switch_source)
        self.assertIn("ACCOUNT_TENANT_SWITCH_UNCONFIRMED", switch_source)
        self.assertIn('issue_access_token(account, auth_method="account_sso")', switch_source)
        self.assertIn("revoke_request_token(request)", switch_source)
        self.assertIn("set_auth_cookie(response, token, request)", switch_source)
        self.assertNotIn("logout_account_session", switch_source)
        self.assertNotIn("clear_account_cookie", switch_source)

    @repository_source_test
    def test_production_configures_account_tenant_switch_endpoint(self):
        compose_source = PRODUCTION_COMPOSE_PATH.read_text(encoding="utf-8")
        env_source = PRODUCTION_ENV_EXAMPLE_PATH.read_text(encoding="utf-8")
        config_source = (PROJECT_ROOT / "application" / "config" / "config.py").read_text(encoding="utf-8")

        self.assertIn("ACCOUNT_SSO_TENANT_SWITCH_PATH", config_source)
        self.assertIn("ACCOUNT_SSO_TENANT_SWITCH_PATH=/api/v1/tenant/set_current_tenant", env_source)
        self.assertIn(
            "ACCOUNT_SSO_TENANT_SWITCH_PATH: ${ACCOUNT_SSO_TENANT_SWITCH_PATH:-/api/v1/tenant/set_current_tenant}",
            compose_source,
        )

    @repository_source_test
    def test_tinode_web_basic_login_uses_the_account_bridge(self):
        compose_source = PRODUCTION_COMPOSE_PATH.read_text(encoding="utf-8")
        nginx_source = PRODUCTION_NGINX_PATH.read_text(encoding="utf-8")
        bridge_source = TINODE_BRIDGE_PATH.read_text(encoding="utf-8")

        self.assertIn("tinode-account-bridge:", compose_source)
        self.assertIn("TINODE_CENTRAL_WS_URL", compose_source)
        self.assertIn("TINODE_BRIDGE_ICE_SERVERS_FILE", compose_source)
        self.assertIn("location = /v0/channels", nginx_source)
        self.assertIn("proxy_pass http://tinode-account-bridge:8095/v0/channels", nginx_source)
        self.assertIn('"/api/v1/auth/account-login"', bridge_source)
        self.assertIn('"/api/v1/auth/tinode-token-bridge"', bridge_source)
        self.assertIn('"X-Vichat-Tinode-Internal"', bridge_source)
        self.assertIn('rewritten_login["scheme"] = "token"', bridge_source)
        self.assertIn('rewritten_login["secret"] = token', bridge_source)
        self.assertIn('getattr(response, "cookies", None)', bridge_source)
        self.assertIn("ACCOUNT_SESSION_COOKIE_NAME", bridge_source)
        self.assertIn("CHAT_ACCESS_COOKIE_NAME", bridge_source)
        self.assertNotIn("DEFAULT_TENANT", bridge_source)
        self.assertNotIn('"tenant_id": DEFAULT_TENANT', bridge_source)
        self.assertIn("_rewrite_hello_response", bridge_source)
        verifier_source = (PROJECT_ROOT / "scripts" / "verify_deployment.py").read_text(encoding="utf-8")
        self.assertIn("Public Tinode hello did not advertise ICE/TURN servers", verifier_source)
        self.assertIn("Public Tinode hello did not confirm authoritative WebRTC/ICE configuration", verifier_source)
        self.assertNotIn('"scheme": "basic", "secret": password', bridge_source)

        controller_source = CONTROLLER_PATH.read_text(encoding="utf-8")
        self.assertIn("/api/v1/auth/tinode-token-bridge", controller_source)
        self.assertIn("_tinode_bridge_request(request)", controller_source)

    def test_account_credential_login_uses_account_and_keeps_tinode_server_side(self):
        _controller_source, login_source = function_source(
            CONTROLLER_PATH,
            "employee_account_credential_login",
        )
        service_source = (
            PROJECT_ROOT / "application" / "services" / "account_sso_service.py"
        ).read_text(encoding="utf-8")

        self.assertIn("login_account_with_credentials", login_source)
        self.assertIn("_sso_account(identity)", login_source)
        self.assertIn('issue_access_token(account, auth_method="account_sso")', login_source)
        self.assertIn("set_account_cookie(response, account_cookie)", login_source)
        self.assertIn("mobile_access_token_payload(request, token)", login_source)
        self.assertIn('rate_limit_tenant = "account"', login_source)
        self.assertIn('tenant_id = rate_limit_tenant', login_source)
        self.assertIn('tenant_id = str(identity.get("tenant_id") or "").strip()', login_source)
        self.assertNotIn('body.get("tenant_id")', login_source)
        self.assertNotIn('!= tenant_id', login_source)
        self.assertIn('json={"username": username, "password": password}', service_source)
        self.assertIn("ACCOUNT_SSO_LOGIN_PATH", service_source)
        self.assertIn("normalize_account_session(profile)", service_source)
        self.assertNotIn("password_hash", login_source)

        auth_source = (PROJECT_ROOT / "application" / "services" / "auth_service.py").read_text(encoding="utf-8")
        self.assertIn('client != "mobile"', auth_source)
        self.assertIn('CHAT_MOBILE_BEARER_ENABLED', auth_source)

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
        build_source = (PROJECT_ROOT.parent / "scripts" / "build-production.mjs").read_text(encoding="utf-8")

        self.assertIn('name="username"', login_source)
        self.assertIn('name="password"', login_source)
        self.assertIn("Đăng nhập", login_source)
        self.assertIn("VITE_CHAT_AUTH_MODE", service_source)
        self.assertIn("account_sso", service_source)
        self.assertIn("VITE_CHAT_AUTH_MODE: 'account_password'", build_source)
        self.assertIn("accountLoginUrl", service_source)
        self.assertIn("/api/v1/auth/sso", service_source)
        self.assertIn("/api/v1/auth/login", service_source)
        self.assertIn("authMode === 'password' && tenantId", service_source)
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
        composer_source = app_source.split("className={`input-text-container", 1)[1]
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
        self.assertIn("tinode_reconcile_topic_members", add_source)
        self.assertIn("_tinode_account_identity(owner_account)", add_source)
        self.assertIn("tinode_sso_login", add_source)
        self.assertIn("tinode_operator_uid", add_source)
        self.assertIn("tinode_remove_topic_member", remove_source)
        self.assertIn("tinode_reconcile_topic_members", remove_source)
        self.assertNotIn('membership.role != "OWNER"', add_source)
        self.assertIn("tinode_accept_topic_owner", remove_source)
        self.assertIn("tinode_publish_system_event", remove_source)
        self.assertIn("TINODE_TOKEN_REQUIRED", remove_source)
        self.assertIn('mode="JRWPASO"', remove_source)
        self.assertIn('mode="JRWPAS"', remove_source)
        self.assertIn("known_target = ConversationParticipant.query.filter", remove_source)
        self.assertIn("already inactive membership", remove_source)
        if CHAT_APP_PATH.exists():
            app_source = CHAT_APP_PATH.read_text(encoding="utf-8")
            leave_source = app_source.split("const executeGroupLeave", 1)[1].split(
                "const handleDeleteConversation", 1
            )[0]
            self.assertIn("replacementId", leave_source)
            self.assertLess(
                leave_source.index("removeConversationParticipant"),
                leave_source.index("sendSystemEvent"),
            )

    def test_owner_leave_requires_an_explicit_active_replacement(self):
        _controller_source, remove_source = function_source(
            CONTROLLER_PATH,
            "conversation_participant_remove",
        )

        self.assertIn("ConversationParticipant.active.is_(True)", remove_source)
        self.assertIn("replacement_id = str(request_payload.get(\"replacement_id\") or \"\").strip()", remove_source)
        self.assertIn("OWNER_REPLACEMENT_REQUIRED", remove_source)
        self.assertIn("OWNER_REPLACEMENT_INVALID", remove_source)
        self.assertIn("OWNER_REPLACEMENT_NOT_MEMBER", remove_source)
        self.assertNotIn("func.random()", remove_source)
        self.assertIn("joined_at.asc()", remove_source)
        self.assertIn('replacement.role = "OWNER"', remove_source)
        self.assertIn('replacement_name =', remove_source)
        self.assertIn('"replacementId": replacement.participant_id', remove_source)
        self.assertIn('"replacementName": replacement_name or replacement.participant_id', remove_source)
        self.assertIn('mode="JRWPASO"', remove_source)
        self.assertLess(
            remove_source.index("tinode_accept_topic_owner"),
            remove_source.index("tinode_remove_topic_member"),
        )

    def test_direct_conversations_are_reused_by_participant_pair(self):
        _controller_source, create_source = function_source(
            CONTROLLER_PATH,
            "conversation_create",
        )

        self.assertIn("direct_key", create_source)
        self.assertIn("sorted(participant_ids)", create_source)
        self.assertIn("Conversation.properties.contains", create_source)
        self.assertIn("requested_group_ids = [participant_id for participant_id in requested_ids if participant_id != owner_id]", create_source)
        self.assertIn("if is_group and not requested_group_ids", create_source)
        self.assertIn("besides its owner", create_source)

    @repository_source_test
    def test_group_creation_viewer_and_avatar_updates_preserve_realtime_contract(self):
        controller_source, group_settings_source = function_source(
            CONTROLLER_PATH,
            "conversation_group_settings",
        )
        app_source = CHAT_APP_PATH.read_text(encoding="utf-8")
        service_source = CHAT_SERVICE_PATH.read_text(encoding="utf-8")
        tinode_source = (
            REPOSITORY_ROOT / "src" / "features" / "chat" / "services" / "tinodeClient.js"
        ).read_text(encoding="utf-8")

        self.assertIn("selectedGroupMemberIds.length === 0", app_source)
        self.assertIn("groupMemberIds.length === 0", app_source)
        self.assertIn("fa-magnifying-glass-plus", app_source)
        self.assertIn("navigator.share", app_source)
        self.assertIn("tinodeClient.downloadFile(file)", app_source)
        self.assertIn("onDownload={handleFileDownload}", app_source)
        self.assertIn("onShare={handleImageShare}", app_source)

        self.assertIn("updateGroupAvatar(topicName, file)", app_source)
        self.assertIn("updateGroupProfile", app_source)
        self.assertIn("previousAvatarUrl", app_source)
        self.assertIn(
            "tinodeClient.updateGroupMetadata(topicName, { avatar: previousAvatarUrl })",
            app_source,
        )
        self.assertIn("groupAvatarSyncRef.current.set(topicName, avatarUrl)", app_source)
        self.assertIn("event.type === 'conversation'", app_source)
        self.assertIn("conversation.avatarUrl !== currentRoom.avatarUrl", app_source)
        self.assertIn("bindTinodeTopic", service_source)

        self.assertIn("properties[\"avatar\"]", group_settings_source)
        self.assertIn('"avatar": properties.get("avatar") or ""', controller_source)
        self.assertIn("topic.setMeta", tinode_source)
        self.assertIn("photo:", tinode_source)
        self.assertIn("emitConversation(topic)", tinode_source)
        self.assertIn("topic.onMetaDesc", tinode_source)

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
        self.assertIn("if (isConversationMuted(notificationRoom?.notificationMutedUntil)) return;", app_source)
        self.assertIn("new window.Notification", app_source)
        self.assertIn("desktopNotificationPermission === 'granted'", app_source)

    @repository_source_test
    def test_conversation_pins_are_viewer_scoped_chatmgt_metadata(self):
        _controller_source, serializer_source = function_source(
            CONTROLLER_PATH,
            "_serialize_conversation",
        )
        controller_source, endpoint_source = function_source(
            CONTROLLER_PATH,
            "conversation_pin",
        )
        model_source = (
            PROJECT_ROOT / "application" / "models" / "models.py"
        ).read_text(encoding="utf-8")
        service_source = CHAT_SERVICE_PATH.read_text(encoding="utf-8")
        app_source = CHAT_APP_PATH.read_text(encoding="utf-8")

        self.assertIn("pinned_at = db.Column(BigInteger())", model_source)
        self.assertIn('"pinned": pinned_at is not None', serializer_source)
        self.assertIn("_conversation_and_membership", endpoint_source)
        self.assertIn("membership.pinned_at", endpoint_source)
        self.assertIn("/pin", service_source)
        self.assertIn("updateConversationPin", app_source)
        self.assertIn("conversation-context-menu", app_source)

    @repository_source_test
    def test_group_settings_are_owner_only_and_tenant_scoped(self):
        _controller_source, serializer_source = function_source(
            CONTROLLER_PATH,
            "_serialize_conversation",
        )
        controller_source, endpoint_source = function_source(
            CONTROLLER_PATH,
            "conversation_group_settings",
        )
        service_source = CHAT_SERVICE_PATH.read_text(encoding="utf-8")
        app_source = CHAT_APP_PATH.read_text(encoding="utf-8")

        self.assertIn("groupSettings", serializer_source)
        self.assertIn("properties.get(\"groupSettings\")", serializer_source)
        self.assertIn("/api/v1/conversation/<conversation_id>/group-settings", controller_source)
        self.assertIn("/api/v1/chat/threads/<conversation_id>/group-settings", controller_source)
        self.assertIn("management_session_requested", endpoint_source)
        self.assertIn("is_owner = membership.role == \"OWNER\"", endpoint_source)
        self.assertIn("allowMembersEditInfo", endpoint_source)
        self.assertIn("_conversation_and_membership", endpoint_source)
        self.assertIn("GROUP_SETTING_KEYS", endpoint_source)
        self.assertIn("updateGroupSettings", service_source)
        self.assertIn("isActiveGroupAdmin", app_source)
        self.assertIn("handleGroupManagementSubmit", app_source)

    @repository_source_test
    def test_history_search_stays_in_the_employee_chat_session_and_reads_tinode(self):
        controller_source, search_source = function_source(
            CONTROLLER_PATH,
            "conversation_history_search",
        )
        app_source = CHAT_APP_PATH.read_text(encoding="utf-8")
        service_source = CHAT_SERVICE_PATH.read_text(encoding="utf-8")

        self.assertIn("/api/v1/conversation/<conversation_id>/search", controller_source)
        self.assertIn("management_session_requested", search_source)
        self.assertIn("_conversation_and_membership", search_source)
        self.assertIn("tinode_history_window", search_source)
        self.assertIn("sender_filter", search_source)
        self.assertIn("date_from", search_source)
        self.assertIn("file_type", search_source)
        self.assertIn("Cache-Control", search_source)
        self.assertIn("searchConversationHistory", service_source)
        self.assertIn("Tải thêm lịch sử cũ", app_source)
        self.assertNotIn("allowNotes", controller_source)
        self.assertNotIn("allowPolls", controller_source)
        self.assertNotIn("allowReminders", controller_source)
        self.assertNotIn("markOwnerMessages", controller_source)

    @repository_source_test
    def test_contact_nicknames_are_private_chat_scope_metadata(self):
        controller_source, list_source = function_source(
            CONTROLLER_PATH,
            "contact_nickname_list",
        )
        _controller_source, update_source = function_source(
            CONTROLLER_PATH,
            "contact_nickname_update",
        )
        app_source = CHAT_APP_PATH.read_text(encoding="utf-8")
        directory_source = (
            REPOSITORY_ROOT / "src" / "features" / "contacts" / "services" / "accountDirectory.js"
        ).read_text(encoding="utf-8")
        service_source = CHAT_SERVICE_PATH.read_text(encoding="utf-8")
        architecture_source = (
            REPOSITORY_ROOT / "docs" / "chat-backend-architecture.md"
        ).read_text(encoding="utf-8")

        self.assertIn("/api/v1/contact-nicknames", controller_source)
        self.assertIn("/api/v1/chat/contact-nicknames", controller_source)
        self.assertIn("management_session_requested(request)", list_source)
        self.assertIn("management_session_requested(request)", update_source)
        self.assertIn("CONTACT_NICKNAMES_PROPERTY", update_source)
        self.assertIn("_account_by_id(tenant_id, target_id)", update_source)
        self.assertIn("viewer.properties = properties", update_source)
        self.assertIn("_audit", update_source)
        self.assertIn("defaultName", update_source)
        self.assertNotIn("_management_user_mutations_enabled", update_source)
        self.assertIn("updateContactNickname", service_source)
        self.assertIn("applyContactNicknames", directory_source)
        self.assertIn("contactNicknameDialog", app_source)
        self.assertIn("setContactNicknameValue(contact.nickname || defaultName)", app_source)
        self.assertIn("contact-nickname-edit-button", app_source)
        self.assertIn("contact nicknames", architecture_source)

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

    def test_management_admin_conversation_metadata_is_hidden(self):
        _controller_source, endpoint_source = function_source(
            CONTROLLER_PATH,
            "management_admin_conversations",
        )

        self.assertIn("management_session_requested(request)", endpoint_source)
        self.assertIn("_management_scope_error", endpoint_source)
        self.assertIn("_management_account_sso_guard", endpoint_source)
        self.assertIn("_is_admin", endpoint_source)
        self.assertIn("_management_chat_metadata_error", endpoint_source)
        self.assertNotIn("Conversation.query", endpoint_source)
        self.assertNotIn("_admin_conversation_record", endpoint_source)

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

        for function_name in (
            "management_user_create",
            "management_user_update",
            "management_user_reset_password",
        ):
            with self.subTest(function_name=function_name):
                _controller_source, endpoint_source = function_source(
                    CONTROLLER_PATH,
                    function_name,
                )
                self.assertIn("_management_user_mutations_enabled", endpoint_source)
                self.assertIn("_management_user_action_error", endpoint_source)

        _controller_source, revoke_source = function_source(
            CONTROLLER_PATH,
            "management_user_revoke_session",
        )
        self.assertNotIn("_management_user_action_error", revoke_source)

        for function_name in ("management_change_password", "management_update_profile"):
            with self.subTest(function_name=function_name):
                _controller_source, endpoint_source = function_source(
                    CONTROLLER_PATH,
                    function_name,
                )
                self.assertIn("management_session_requested(request)", endpoint_source)
                self.assertIn("_management_user_action_error", endpoint_source)

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
    def test_management_web_only_lists_users_and_revokes_sessions(self):
        app_source = MANAGEMENT_APP_PATH.read_text(encoding="utf-8")
        service_source = MANAGEMENT_SERVICE_PATH.read_text(encoding="utf-8")

        self.assertIn("Tài khoản nhân viên doanh nghiệp", app_source)
        self.assertIn("Chatmgt chỉ hiển thị thông tin vận hành", app_source)
        self.assertIn("Bắt đăng xuất khỏi Chat", app_source)
        self.assertIn("Không hiển thị thông tin hội thoại", app_source)
        self.assertIn("revokeSessions", service_source)
        self.assertIn("/api/v1/admin/sso", service_source)
        self.assertIn("startAccountLogin", service_source)
        self.assertNotIn("changePassword", service_source)
        self.assertNotIn("listConversations", service_source)
        self.assertNotIn("/api/v1/admin/conversations", service_source)
        self.assertNotIn("createUser", service_source)
        self.assertNotIn("updateUser", service_source)
        self.assertNotIn("setUserActive", service_source)
        self.assertNotIn("resetPassword", service_source)
        self.assertNotIn("Mời nhân viên trên UpGO", app_source)
        self.assertNotIn("Thêm nhân viên", app_source)
        self.assertNotIn("Conversation và nhóm", app_source)

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
