import importlib.util
from types import SimpleNamespace
import unittest


HAS_RUNTIME_DEPENDENCIES = all(
    importlib.util.find_spec(name) is not None
    for name in ("aiohttp", "bcrypt", "gatco", "gatco_sqlalchemy")
)

if HAS_RUNTIME_DEPENDENCIES:
    from application.server import app
    from application.services.auth_service import (
        ACCESS_COOKIE,
        MANAGEMENT_ACCESS_COOKIE,
        MANAGEMENT_SESSION_HEADER,
        current_user,
        decode_access_token,
        issue_access_token,
        token_from_request,
    )


@unittest.skipUnless(
    HAS_RUNTIME_DEPENDENCIES,
    "authentication runtime dependencies are installed in the Chatmgt image",
)
class AuthSessionScopeTests(unittest.TestCase):
    def setUp(self):
        app.config["CHAT_AUTH_JWT_SECRET"] = "scope-test-secret-" * 4
        self.account = SimpleNamespace(
            id="account-admin-1",
            tenant_id="tenant-a",
            username="admin@example.vn",
            role="admin",
            properties={"auth_version": 0},
        )

    @staticmethod
    def request(cookie_name, token, management=False):
        headers = {"Cookie": "{}={}".format(cookie_name, token)}
        if management:
            headers[MANAGEMENT_SESSION_HEADER] = "management"
        return SimpleNamespace(headers=headers, cookies={})

    def test_chat_and_management_tokens_are_not_interchangeable(self):
        chat_token = issue_access_token(self.account, session_scope="chat")
        management_token = issue_access_token(self.account, session_scope="management")

        self.assertEqual(decode_access_token(chat_token)["scp"], "chat")
        self.assertEqual(decode_access_token(management_token)["scp"], "management")
        self.assertIsNotNone(current_user(self.request(ACCESS_COOKIE, chat_token)))
        self.assertIsNone(current_user(self.request(ACCESS_COOKIE, management_token)))
        self.assertIsNotNone(current_user(self.request(
            MANAGEMENT_ACCESS_COOKIE,
            management_token,
            management=True,
        )))
        self.assertIsNone(current_user(self.request(
            MANAGEMENT_ACCESS_COOKIE,
            chat_token,
            management=True,
        )))

    def test_management_request_does_not_fall_back_to_the_chat_cookie(self):
        chat_token = issue_access_token(self.account, session_scope="chat")
        request = self.request(ACCESS_COOKIE, chat_token, management=True)

        self.assertIsNone(token_from_request(request))
        self.assertIsNone(current_user(request))


if __name__ == "__main__":
    unittest.main()
