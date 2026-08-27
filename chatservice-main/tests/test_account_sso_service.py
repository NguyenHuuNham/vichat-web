import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, call, patch


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = PROJECT_ROOT / "application" / "services" / "account_sso_service.py"
HAS_AIOHTTP = importlib.util.find_spec("aiohttp") is not None
account_sso_service = None
if HAS_AIOHTTP:
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

    application_module = types.ModuleType("application")
    application_module.__path__ = [str(PROJECT_ROOT / "application")]
    services_module = types.ModuleType("application.services")
    services_module.__path__ = [str(PROJECT_ROOT / "application" / "services")]
    fake_app = types.SimpleNamespace(config={
        "ACCOUNT_URL": "https://account.upgo.vn",
        "ACCOUNT_SSO_PROFILE_PATH": "/current_user",
        "ACCOUNT_SSO_DIRECTORY_PATH": "/api/v1/tenant_user",
        "ACCOUNT_SSO_TENANT_SWITCH_PATH": "/api/v1/tenant/set_current_tenant",
        "ACCOUNT_SSO_LOGOUT_PATH": "/logout",
        "ACCOUNT_SSO_SELF_PROFILE_PATH": "/me",
        "ACCOUNT_SSO_USER_UPDATE_PATH": "/api/v1/user",
        "ACCOUNT_AVATAR_UPLOAD_URL": "https://service.upgo.vn/api/image/upload?path=accounts",
        "ACCOUNT_SSO_TIMEOUT": 10,
        "ACCOUNT_AVATAR_UPLOAD_TIMEOUT": 60,
        "ACCOUNT_SESSION_COOKIE_NAME": "session",
        "ACCOUNT_SESSION_COOKIE_DOMAIN": ".upgo.vn",
        "ACCOUNT_SESSION_COOKIE_SECURE": True,
    })
    server_module = types.ModuleType("application.server")
    server_module.app = fake_app
    module_names = (
        "application",
        "application.services",
        "application.server",
        "application.services.sso_identity",
    )
    previous_modules = {name: sys.modules.get(name) for name in module_names}
    sys.modules["application"] = application_module
    sys.modules["application.services"] = services_module
    sys.modules["application.server"] = server_module
    try:
        identity_path = PROJECT_ROOT / "application" / "services" / "sso_identity.py"
        identity_spec = importlib.util.spec_from_file_location(
            "application.services.sso_identity",
            identity_path,
        )
        identity_module = importlib.util.module_from_spec(identity_spec)
        sys.modules["application.services.sso_identity"] = identity_module
        identity_spec.loader.exec_module(identity_module)

        spec = importlib.util.spec_from_file_location("account_sso_service", MODULE_PATH)
        account_sso_service = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(account_sso_service)
    finally:
        for name, previous_module in previous_modules.items():
            if previous_module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = previous_module


def account_payload(status="active"):
    return {
        "id": "account-user-1",
        "user_name": "nham.nguyen",
        "display_name": "Nguyen Huu Nham",
        "email": "nham@example.vn",
        "avatar_url": "https://account.upgo.vn/avatar/account-user-1.png",
        "current_tenant_id": "tenant-a",
        "current_tenant_role": "member",
        "tenants": [{
            "id": "tenant-a",
            "tenant_name": "Tenant A",
            "role": "member",
            "status": status,
        }],
    }


class FakeHeaders:
    def __init__(self):
        self.values = []

    def add(self, name, value):
        self.values.append((name, value))


class FakeResponse:
    def __init__(self):
        self.headers = FakeHeaders()


class FakeAccountLoginHeaders:
    def getall(self, name, default=None):
        if name == "Set-Cookie":
            return ["session=test-account-session; Path=/; HttpOnly"]
        return default or []


class FakeAccountLoginResponse:
    status = 200
    headers = FakeAccountLoginHeaders()

    async def json(self, content_type=None):
        return {}

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class FakeAccountClientSession:
    def __init__(self, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    def post(self, *args, **kwargs):
        return FakeAccountLoginResponse()


@unittest.skipUnless(HAS_AIOHTTP, "aiohttp is installed in the Chatmgt runtime image")
class AccountSSOServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_directory_is_loaded_from_the_account_tenant_scope(self):
        request = types.SimpleNamespace()
        identity = {
            "account_user_id": "account-user-2",
            "tenant_id": "tenant-a",
            "tenant_name": "Tenant A",
        }
        payload = {"total": 1, "objects": [{
            "id": "account-user-2",
            "user_name": "lan.tran",
            "display_name": "Tran Thi Lan",
        }]}
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, payload)),
        ) as account_request:
            users = await account_sso_service.account_directory(request, identity)

        self.assertEqual(users[0]["account_user_id"], "account-user-2")
        self.assertEqual(users[0]["tenant_id"], "tenant-a")
        self.assertTrue(users.complete)
        self.assertEqual(users.total, 1)
        self.assertEqual(users.pages, 1)
        account_request.assert_awaited_once_with(
            request,
            "GET",
            "/api/v1/tenant_user?page=1&results_per_page=1000",
        )

    async def test_directory_accepts_the_tenant_user_email_identity(self):
        identity = {
            "account_user_id": "account-user-2",
            "tenant_id": "tenant-a",
            "tenant_name": "Tenant A",
        }
        payload = {"objects": [{
            "id": "account-user-2",
            "display_name": "Test User",
            "email": "test.user@example.vn",
            "role": "member",
            "status": "active",
        }]}
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, payload)),
        ):
            users = await account_sso_service.account_directory(types.SimpleNamespace(), identity)

        self.assertEqual(users[0]["username"], "test.user@example.vn")
        self.assertEqual(users[0]["full_name"], "Test User")
        self.assertTrue(users[0]["active"])
        self.assertFalse(users.complete)

    async def test_directory_fetches_every_page_before_marking_the_snapshot_complete(self):
        identity = {
            "account_user_id": "account-user-1",
            "tenant_id": "tenant-a",
            "tenant_name": "Tenant A",
        }
        pages = [
            (200, {"total": 3, "page": 1, "total_pages": 2, "next_page": 2, "objects": [
                {"id": "account-user-1", "user_name": "viewer"},
                {"id": "account-user-2", "user_name": "member.two"},
            ]}),
            (200, {"total": 3, "page": 2, "total_pages": 2, "next_page": None, "objects": [
                {"id": "account-user-3", "user_name": "member.three"},
            ]}),
        ]
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(side_effect=pages),
        ) as account_request:
            snapshot = await account_sso_service.account_directory(
                types.SimpleNamespace(),
                identity,
            )

        self.assertEqual([item["account_user_id"] for item in snapshot], [
            "account-user-1",
            "account-user-2",
            "account-user-3",
        ])
        self.assertTrue(snapshot.complete)
        self.assertEqual(snapshot.total, 3)
        self.assertEqual(snapshot.pages, 2)
        self.assertEqual(snapshot.raw_count, 3)
        self.assertEqual(account_request.await_args_list, [
            call(types.SimpleNamespace(), "GET", "/api/v1/tenant_user?page=1&results_per_page=1000"),
            call(types.SimpleNamespace(), "GET", "/api/v1/tenant_user?page=2&results_per_page=1000"),
        ])

    async def test_directory_without_total_metadata_remains_partial(self):
        request = types.SimpleNamespace()
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, {"objects": [
                {"id": "account-user-1", "user_name": "viewer"},
            ]})),
        ) as account_request:
            snapshot = await account_sso_service.account_directory(request, {
                "account_user_id": "account-user-1",
                "tenant_id": "tenant-a",
                "tenant_name": "Tenant A",
            })

        self.assertFalse(snapshot.complete)
        self.assertIsNone(snapshot.total)
        self.assertEqual(snapshot.pages, 1)
        account_request.assert_awaited_once()

    async def test_directory_duplicate_page_is_partial_and_stops(self):
        request = types.SimpleNamespace()
        repeated = {"id": "account-user-1", "user_name": "viewer"}
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(side_effect=[
                (200, {"total": 3, "objects": [repeated]}),
                (200, {"total": 3, "objects": [repeated]}),
            ]),
        ) as account_request:
            snapshot = await account_sso_service.account_directory(request, {
                "account_user_id": "account-user-1",
                "tenant_id": "tenant-a",
                "tenant_name": "Tenant A",
            })

        self.assertFalse(snapshot.complete)
        self.assertEqual(len(snapshot), 1)
        self.assertEqual(snapshot.pages, 2)
        self.assertEqual(account_request.await_count, 2)

    async def test_directory_later_page_failure_preserves_a_partial_snapshot(self):
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(side_effect=[
                (200, {"total": 2, "objects": [
                    {"id": "account-user-1", "user_name": "viewer"},
                ]}),
                (503, {}),
            ]),
        ):
            snapshot = await account_sso_service.account_directory(types.SimpleNamespace(), {
                "account_user_id": "account-user-1",
                "tenant_id": "tenant-a",
                "tenant_name": "Tenant A",
            })

        self.assertFalse(snapshot.complete)
        self.assertEqual(snapshot.pages, 1)
        self.assertEqual([item["account_user_id"] for item in snapshot], ["account-user-1"])

    async def test_directory_explicit_foreign_tenant_fails_closed(self):
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, {"total": 1, "objects": [{
                "id": "account-user-1",
                "user_name": "viewer",
                "tenant_id": "tenant-b",
            }]})),
        ):
            with self.assertRaises(account_sso_service.AccountSSOError) as error:
                await account_sso_service.account_directory(types.SimpleNamespace(), {
                    "account_user_id": "account-user-1",
                    "tenant_id": "tenant-a",
                    "tenant_name": "Tenant A",
                })

        self.assertEqual(error.exception.error_code, "ACCOUNT_DIRECTORY_TENANT_MISMATCH")

    async def test_directory_foreign_tenant_envelope_fails_closed(self):
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, {
                "tenant_id": "tenant-b",
                "total": 1,
                "objects": [{"id": "account-user-1", "user_name": "viewer"}],
            })),
        ):
            with self.assertRaises(account_sso_service.AccountSSOError) as error:
                await account_sso_service.account_directory(types.SimpleNamespace(), {
                    "account_user_id": "account-user-1",
                    "tenant_id": "tenant-a",
                    "tenant_name": "Tenant A",
                })

        self.assertEqual(error.exception.error_code, "ACCOUNT_DIRECTORY_TENANT_MISMATCH")

    async def test_directory_duplicate_username_keeps_verified_viewer_only(self):
        payload = {"total": 3, "objects": [
            {"id": "account-user-1", "user_name": "shared.identity"},
            {"id": "account-user-2", "user_name": "shared.identity"},
            {"id": "account-user-3", "user_name": "safe.member"},
        ]}
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, payload)),
        ):
            snapshot = await account_sso_service.account_directory(
                types.SimpleNamespace(),
                {
                    "account_user_id": "account-user-1",
                    "tenant_id": "tenant-a",
                    "tenant_name": "Tenant A",
                },
            )

        self.assertFalse(snapshot.complete)
        self.assertEqual(
            [item["account_user_id"] for item in snapshot],
            ["account-user-1", "account-user-3"],
        )
        self.assertEqual(snapshot.ambiguous_count, 1)
        self.assertEqual(snapshot.raw_count, 3)

    async def test_directory_duplicate_email_username_fallback_keeps_exact_viewer(self):
        payload = {"total": 3, "objects": [
            {
                "id": "account-user-1",
                "display_name": "Verified Viewer",
                "email": "shared@example.vn",
            },
            {
                "id": "account-user-2",
                "display_name": "Conflicting Record",
                "email": "shared@example.vn",
            },
            {
                "id": "account-user-3",
                "display_name": "Safe Member",
                "email": "safe@example.vn",
            },
        ]}
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, payload)),
        ):
            snapshot = await account_sso_service.account_directory(
                types.SimpleNamespace(),
                {
                    "account_user_id": "account-user-1",
                    "tenant_id": "tenant-a",
                    "tenant_name": "Tenant A",
                },
            )

        self.assertFalse(snapshot.complete)
        self.assertEqual(
            [item["account_user_id"] for item in snapshot],
            ["account-user-1", "account-user-3"],
        )
        self.assertEqual(snapshot[0]["username"], "shared@example.vn")
        self.assertEqual(snapshot.ambiguous_count, 1)

    async def test_directory_duplicate_email_omits_every_nonviewer_claim(self):
        payload = {"total": 3, "objects": [
            {
                "id": "account-user-1",
                "user_name": "viewer",
                "email": "viewer@example.vn",
            },
            {
                "id": "account-user-2",
                "user_name": "member.two",
                "email": "shared@example.vn",
            },
            {
                "id": "account-user-3",
                "user_name": "member.three",
                "email": "shared@example.vn",
            },
        ]}
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, payload)),
        ):
            snapshot = await account_sso_service.account_directory(
                types.SimpleNamespace(),
                {
                    "account_user_id": "account-user-1",
                    "tenant_id": "tenant-a",
                    "tenant_name": "Tenant A",
                },
            )

        self.assertFalse(snapshot.complete)
        self.assertEqual(
            [item["account_user_id"] for item in snapshot],
            ["account-user-1"],
        )
        self.assertEqual(snapshot.ambiguous_count, 2)

    async def test_directory_all_ambiguous_nonviewer_records_return_empty_partial_snapshot(self):
        payload = {"total": 2, "objects": [
            {
                "id": "account-user-2",
                "email": "shared@example.vn",
            },
            {
                "id": "account-user-3",
                "email": "shared@example.vn",
            },
        ]}
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, payload)),
        ):
            snapshot = await account_sso_service.account_directory(
                types.SimpleNamespace(),
                {
                    "account_user_id": "account-user-1",
                    "tenant_id": "tenant-a",
                    "tenant_name": "Tenant A",
                },
            )

        self.assertFalse(snapshot.complete)
        self.assertEqual(list(snapshot), [])
        self.assertEqual(snapshot.ambiguous_count, 2)

    async def test_directory_session_expiry_requires_account_login(self):
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(520, {"error_code": "SESSION_EXPIRED"})),
        ):
            with self.assertRaises(account_sso_service.AccountSSOError) as error:
                await account_sso_service.account_directory(
                    types.SimpleNamespace(),
                    {
                        "account_user_id": "account-user-1",
                        "tenant_id": "tenant-a",
                        "tenant_name": "Tenant A",
                    },
                )

        self.assertEqual(error.exception.error_code, "ACCOUNT_LOGIN_REQUIRED")

    async def test_directory_must_include_the_authenticated_user(self):
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, {"total": 1, "objects": [{
                "id": "someone-else",
                "user_name": "someone.else",
            }]})),
        ):
            with self.assertRaises(account_sso_service.AccountSSOError) as error:
                await account_sso_service.account_directory(
                    types.SimpleNamespace(),
                    {
                        "account_user_id": "account-user-1",
                        "tenant_id": "tenant-a",
                        "tenant_name": "Tenant A",
                    },
                )

        self.assertEqual(error.exception.error_code, "ACCOUNT_DIRECTORY_VIEWER_INVALID")

    async def test_partial_directory_missing_viewer_remains_additive(self):
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, {"objects": [{
                "id": "someone-else",
                "user_name": "someone.else",
            }]})),
        ):
            snapshot = await account_sso_service.account_directory(
                types.SimpleNamespace(),
                {
                    "account_user_id": "account-user-1",
                    "tenant_id": "tenant-a",
                    "tenant_name": "Tenant A",
                },
            )

        self.assertFalse(snapshot.complete)
        self.assertEqual([item["account_user_id"] for item in snapshot], ["someone-else"])

    async def test_invalid_authenticated_viewer_record_fails_closed(self):
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, {"total": 1, "objects": [{
                "id": "account-user-1",
            }]})),
        ):
            with self.assertRaises(account_sso_service.AccountSSOError) as error:
                await account_sso_service.account_directory(
                    types.SimpleNamespace(),
                    {
                        "account_user_id": "account-user-1",
                        "tenant_id": "tenant-a",
                        "tenant_name": "Tenant A",
                    },
                )

        self.assertEqual(error.exception.status_code, 401)
        self.assertEqual(error.exception.error_code, "ACCOUNT_DIRECTORY_VIEWER_INVALID")

    async def test_valid_account_session_is_normalized(self):
        request = types.SimpleNamespace()
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, account_payload())),
        ) as account_request:
            identity = await account_sso_service.current_account_session(request)

        self.assertEqual(identity["account_user_id"], "account-user-1")
        self.assertEqual(identity["tenant_id"], "tenant-a")
        self.assertEqual(identity["avatar"], account_payload()["avatar_url"])
        account_request.assert_awaited_once_with(request, "GET", "/current_user")

    async def test_strict_account_session_rejects_membership_fallback_without_current_tenant(self):
        profile = account_payload()
        profile["current_tenant_id"] = None
        profile["current_tenant_role"] = None
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, profile)),
        ):
            with self.assertRaises(account_sso_service.AccountSSOError) as error:
                await account_sso_service.current_account_session(
                    types.SimpleNamespace(),
                    require_current_tenant=True,
                )

        self.assertEqual(error.exception.error_code, "ACCOUNT_TENANT_INVALID")

    async def test_current_account_session_can_select_a_verified_membership(self):
        request = types.SimpleNamespace()
        profile = account_payload()
        profile["tenants"].append({
            "id": "tenant-b",
            "tenant_name": "Tenant B",
            "role": "admin",
            "status": "active",
        })
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, profile)),
        ):
            identity = await account_sso_service.current_account_session(
                request,
                preferred_tenant_id="tenant-b",
            )

        self.assertEqual(identity["tenant_id"], "tenant-b")
        self.assertEqual(identity["role"], "admin")
        self.assertEqual(
            {option["id"] for option in identity["tenant_options"]},
            {"tenant-a", "tenant-b"},
        )

    async def test_switch_account_tenant_updates_the_account_session(self):
        request = types.SimpleNamespace()
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, {}, None)),
        ) as account_request:
            payload, account_cookie = await account_sso_service.switch_account_tenant(request, "tenant-b")

        self.assertEqual(payload, {})
        self.assertIsNone(account_cookie)
        account_request.assert_awaited_once_with(
            request,
            "POST",
            "/api/v1/tenant/set_current_tenant",
            json_body={"tenant_id": "tenant-b"},
            capture_account_cookie=True,
        )

    async def test_switch_account_tenant_rejects_an_expired_account_session(self):
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(401, {"error_code": "AUTH_ERROR"}, None)),
        ):
            with self.assertRaises(account_sso_service.AccountSSOError) as error:
                await account_sso_service.switch_account_tenant(
                    types.SimpleNamespace(),
                    "tenant-b",
                )

        self.assertEqual(error.exception.error_code, "ACCOUNT_LOGIN_REQUIRED")

    async def test_expired_account_session_requires_login(self):
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(520, {"error_code": "SESSION_EXPIRED"})),
        ):
            with self.assertRaisesRegex(account_sso_service.AccountSSOError, "login is required") as error:
                await account_sso_service.current_account_session(types.SimpleNamespace())

        self.assertEqual(error.exception.error_code, "ACCOUNT_LOGIN_REQUIRED")

    async def test_credential_login_logs_invalid_tenant_profile_details(self):
        profile = account_payload(status="disabled")
        with patch.object(
            account_sso_service.aiohttp,
            "ClientSession",
            FakeAccountClientSession,
        ), patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, profile)),
        ), patch.object(account_sso_service.logger, "warning") as warning:
            with self.assertRaises(account_sso_service.AccountSSOError) as error:
                await account_sso_service.login_account_with_credentials(
                    "nham@example.vn",
                    "test-password",
                )

        self.assertEqual(error.exception.error_code, "ACCOUNT_TENANT_INVALID")
        warning.assert_called_once_with(
            "Account credential login tenant normalization failed: "
            "user_id=%s user_name=%s current_tenant_id=%s tenant_ids=%s error=%s",
            "account-user-1",
            "nham.nguyen",
            "tenant-a",
            ["tenant-a"],
            error.exception.__cause__,
        )

    async def test_inactive_tenant_membership_is_rejected(self):
        profile = account_payload(status="disabled")
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, profile)),
        ), patch.object(account_sso_service.logger, "warning") as warning:
            with self.assertRaises(account_sso_service.AccountSSOError) as error:
                await account_sso_service.current_account_session(types.SimpleNamespace())

        self.assertEqual(error.exception.error_code, "ACCOUNT_TENANT_INVALID")
        warning.assert_called_once_with(
            "Current Account session tenant normalization failed: "
            "user_id=%s user_name=%s current_tenant_id=%s tenant_ids=%s error=%s",
            "account-user-1",
            "nham.nguyen",
            "tenant-a",
            ["tenant-a"],
            error.exception.__cause__,
        )

    async def test_logout_uses_the_verified_account_endpoint(self):
        request = types.SimpleNamespace()
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(204, {})),
        ) as account_request:
            payload = await account_sso_service.logout_account_session(request)

        self.assertEqual(payload, {})
        account_request.assert_awaited_once_with(request, "POST", "/logout")

    async def test_avatar_update_uses_account_profile_and_excludes_password(self):
        request = types.SimpleNamespace()
        identity = {
            "account_user_id": "account-user-1",
            "tenant_id": "tenant-a",
        }
        profile = {
            "id": "account-user-1",
            "display_name": "Nguyen Huu Nham",
            "email": "nham@example.vn",
            "avatar_url": "https://old.example/avatar.png",
            "password": "must-not-be-forwarded",
        }
        refreshed = account_payload()
        refreshed["avatar_url"] = "https://service.upgo.vn/accounts/new-avatar.png"
        upload = types.SimpleNamespace(
            name="avatar.png",
            type="image/png",
            body=b"avatar-bytes",
        )
        with patch.object(
            account_sso_service,
            "_upload_account_avatar",
            AsyncMock(return_value=refreshed["avatar_url"]),
        ), patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(side_effect=[
                (200, profile),
                (200, {"updated": True}),
                (200, refreshed),
            ]),
        ) as account_request:
            result = await account_sso_service.update_account_avatar(
                request,
                identity,
                upload,
            )

        self.assertEqual(result["avatar"], refreshed["avatar_url"])
        self.assertEqual(account_request.await_args_list[0], call(request, "GET", "/me"))
        update_call = account_request.await_args_list[1]
        self.assertEqual(update_call.args[:3], (request, "PUT", "/api/v1/user/account-user-1"))
        self.assertEqual(update_call.kwargs["json_body"]["avatar_url"], refreshed["avatar_url"])
        self.assertNotIn("password", update_call.kwargs["json_body"])
        self.assertEqual(account_request.await_args_list[2], call(request, "GET", "/current_user"))

    async def test_avatar_update_rejects_a_different_account_profile_before_upload(self):
        request = types.SimpleNamespace()
        upload = types.SimpleNamespace(
            name="avatar.png",
            type="image/png",
            body=b"avatar-bytes",
        )
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, {"id": "different-account"})),
        ), patch.object(
            account_sso_service,
            "_upload_account_avatar",
            AsyncMock(),
        ) as avatar_upload:
            with self.assertRaises(account_sso_service.AccountSSOError) as error:
                await account_sso_service.update_account_avatar(
                    request,
                    {
                        "account_user_id": "account-user-1",
                        "tenant_id": "tenant-a",
                    },
                    upload,
                )

        self.assertEqual(error.exception.error_code, "ACCOUNT_SESSION_MISMATCH")
        avatar_upload.assert_not_awaited()

    async def test_avatar_update_reloads_me_when_current_user_is_stale(self):
        request = types.SimpleNamespace()
        identity = {"account_user_id": "account-user-1", "tenant_id": "tenant-a"}
        profile = {"id": "account-user-1", "avatar_url": "https://old.example/avatar.png"}
        stale = account_payload()
        fresh = dict(stale)
        fresh["avatar_url"] = "https://service.upgo.vn/accounts/new-avatar.png"
        fresh["current_tenant_id"] = "tenant-b"
        fresh["current_tenant_role"] = "admin"
        fresh["tenants"] = [{
            "id": "tenant-b",
            "tenant_name": "Tenant B",
            "role": "admin",
            "status": "active",
        }]
        upload = types.SimpleNamespace(name="avatar.png", type="image/png", body=b"avatar-bytes")
        with patch.object(
            account_sso_service,
            "_upload_account_avatar",
            AsyncMock(return_value=fresh["avatar_url"]),
        ), patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(side_effect=[
                (200, profile),
                (200, {"updated": True}),
                (200, stale),
                (200, fresh),
            ]),
        ) as account_request:
            result = await account_sso_service.update_account_avatar(request, identity, upload)

        self.assertEqual(result["avatar"], fresh["avatar_url"])
        self.assertEqual(result["tenant_id"], "tenant-a")
        self.assertEqual(result["role"], "member")
        self.assertEqual(account_request.await_args_list[3], call(request, "GET", "/me"))

    async def test_avatar_update_rejects_when_account_never_confirms_uploaded_url(self):
        request = types.SimpleNamespace()
        identity = {"account_user_id": "account-user-1", "tenant_id": "tenant-a"}
        profile = {"id": "account-user-1", "avatar_url": "https://old.example/avatar.png"}
        stale = account_payload()
        stale["avatar_url"] = profile["avatar_url"]
        upload = types.SimpleNamespace(name="avatar.png", type="image/png", body=b"avatar-bytes")
        uploaded_url = "https://service.upgo.vn/accounts/new-avatar.png"
        with patch.object(
            account_sso_service,
            "_upload_account_avatar",
            AsyncMock(return_value=uploaded_url),
        ), patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(side_effect=[
                (200, profile),
                (200, {"updated": True}),
                (200, stale),
                (200, stale),
            ]),
        ):
            with self.assertRaises(account_sso_service.AccountSSOError) as error:
                await account_sso_service.update_account_avatar(request, identity, upload)

        self.assertEqual(error.exception.error_code, "ACCOUNT_AVATAR_UPDATE_UNCONFIRMED")

    async def test_profile_update_forwards_editable_fields_and_reloads_account_identity(self):
        request = types.SimpleNamespace()
        identity = {
            "account_user_id": "account-user-1",
            "tenant_id": "tenant-a",
        }
        profile = {
            "id": "account-user-1",
            "display_name": "Old Name",
            "full_name": "Old Name",
            "title": "Old title",
            "email": "nham@example.vn",
            "password": "must-not-be-forwarded",
        }
        refreshed = account_payload()
        refreshed.update({"display_name": "New Name", "full_name": "New Name", "title": "Lead"})
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(side_effect=[
                (200, profile),
                (200, {"updated": True}),
                (200, refreshed),
            ]),
        ) as account_request:
            result = await account_sso_service.update_account_profile(
                request,
                identity,
                {"name": "New Name", "email": "new@example.com", "title": "Lead"},
            )

        self.assertEqual(result["full_name"], "New Name")
        update_call = account_request.await_args_list[1]
        self.assertEqual(update_call.args[:3], (request, "PUT", "/api/v1/user/account-user-1"))
        self.assertEqual(update_call.kwargs["json_body"]["full_name"], "New Name")
        self.assertEqual(update_call.kwargs["json_body"]["display_name"], "New Name")
        self.assertEqual(update_call.kwargs["json_body"]["title"], "Lead")
        self.assertEqual(update_call.kwargs["json_body"]["email"], "new@example.com")
        self.assertNotIn("password", update_call.kwargs["json_body"])
        self.assertEqual(account_request.await_args_list[2], call(request, "GET", "/current_user"))

    async def test_profile_update_preserves_account_read_only_reason(self):
        request = types.SimpleNamespace()
        profile = {"id": "account-user-1", "display_name": "Old Name"}
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(side_effect=[
                (200, profile),
                (403, {"error_message": "Profile fields are synchronized from UpGO Account."}),
            ]),
        ):
            with self.assertRaises(account_sso_service.AccountSSOError) as error:
                await account_sso_service.update_account_profile(
                    request,
                    {"account_user_id": "account-user-1", "tenant_id": "tenant-a"},
                    {"name": "New Name"},
                )

        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(error.exception.error_code, "ACCOUNT_PROFILE_READ_ONLY")
        self.assertIn("synchronized", str(error.exception))

    def test_missing_or_duplicate_account_cookie_is_rejected(self):
        missing = types.SimpleNamespace(headers={"Cookie": "other=value"})
        duplicate = types.SimpleNamespace(headers={"Cookie": "session=one; session=two"})

        with self.assertRaises(account_sso_service.AccountSSOError) as missing_error:
            account_sso_service._account_cookie(missing)
        with self.assertRaises(account_sso_service.AccountSSOError) as duplicate_error:
            account_sso_service._account_cookie(duplicate)

        self.assertEqual(missing_error.exception.error_code, "ACCOUNT_LOGIN_REQUIRED")
        self.assertEqual(duplicate_error.exception.error_code, "ACCOUNT_COOKIE_AMBIGUOUS")

    def test_account_cookie_is_cleared_for_the_shared_upgo_domain(self):
        response = account_sso_service.clear_account_cookie(FakeResponse())
        header = response.headers.values[0]

        self.assertEqual(header[0], "Set-Cookie")
        self.assertIn("session=", header[1])
        self.assertIn("Domain=.upgo.vn", header[1])
        self.assertIn("Max-Age=0", header[1])
        self.assertIn("Secure", header[1])

    def test_account_cookie_can_be_forwarded_after_direct_account_login(self):
        response = FakeResponse()
        account_sso_service.set_account_cookie(response, {
            "name": "session",
            "value": "account-session-value",
            "max_age": "3600",
            "expires": "Wed, 01 Jan 2030 00:00:00 GMT",
        })
        header = response.headers.values[0]

        self.assertEqual(header[0], "Set-Cookie")
        self.assertIn("session=account-session-value", header[1])
        self.assertIn("Max-Age=3600", header[1])
        self.assertIn("Domain=.upgo.vn", header[1])
        self.assertIn("HttpOnly", header[1])
        self.assertIn("Secure", header[1])


if __name__ == "__main__":
    unittest.main()
