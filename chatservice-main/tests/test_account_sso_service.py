import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = PROJECT_ROOT / "application" / "services" / "account_sso_service.py"
HAS_AIOHTTP = importlib.util.find_spec("aiohttp") is not None
account_sso_service = None
if HAS_AIOHTTP:
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

    fake_app = types.SimpleNamespace(config={
        "ACCOUNT_URL": "https://account.upgo.vn",
        "ACCOUNT_SSO_PROFILE_PATH": "/current_user",
        "ACCOUNT_SSO_DIRECTORY_PATH": "/api/v1/user",
        "ACCOUNT_SSO_LOGOUT_PATH": "/logout",
        "ACCOUNT_SESSION_COOKIE_NAME": "session",
        "ACCOUNT_SESSION_COOKIE_DOMAIN": ".upgo.vn",
        "ACCOUNT_SESSION_COOKIE_SECURE": True,
    })
    server_module = types.ModuleType("application.server")
    server_module.app = fake_app
    previous_server_module = sys.modules.get("application.server")
    sys.modules["application.server"] = server_module
    try:
        spec = importlib.util.spec_from_file_location("account_sso_service", MODULE_PATH)
        account_sso_service = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(account_sso_service)
    finally:
        if previous_server_module is None:
            sys.modules.pop("application.server", None)
        else:
            sys.modules["application.server"] = previous_server_module


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


@unittest.skipUnless(HAS_AIOHTTP, "aiohttp is installed in the Chatmgt runtime image")
class AccountSSOServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_directory_is_loaded_from_the_account_tenant_scope(self):
        request = types.SimpleNamespace()
        identity = {
            "account_user_id": "account-user-2",
            "tenant_id": "tenant-a",
            "tenant_name": "Tenant A",
        }
        payload = {"objects": [{
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
        account_request.assert_awaited_once_with(
            request,
            "GET",
            "/api/v1/user?page=1&results_per_page=1000",
        )

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
            AsyncMock(return_value=(200, {"objects": [{
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

        self.assertEqual(error.exception.error_code, "ACCOUNT_DIRECTORY_INVALID")

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

    async def test_expired_account_session_requires_login(self):
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(520, {"error_code": "SESSION_EXPIRED"})),
        ):
            with self.assertRaisesRegex(account_sso_service.AccountSSOError, "login is required") as error:
                await account_sso_service.current_account_session(types.SimpleNamespace())

        self.assertEqual(error.exception.error_code, "ACCOUNT_LOGIN_REQUIRED")

    async def test_inactive_tenant_membership_is_rejected(self):
        with patch.object(
            account_sso_service,
            "_account_request",
            AsyncMock(return_value=(200, account_payload(status="disabled"))),
        ):
            with self.assertRaises(account_sso_service.AccountSSOError) as error:
                await account_sso_service.current_account_session(types.SimpleNamespace())

        self.assertEqual(error.exception.error_code, "ACCOUNT_TENANT_INVALID")

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


if __name__ == "__main__":
    unittest.main()
