from datetime import timezone
import importlib.util
from types import SimpleNamespace
import unittest


HAS_RUNTIME_DEPENDENCIES = all(
    importlib.util.find_spec(name) is not None
    for name in ("aiohttp", "bcrypt", "requests", "sqlalchemy")
)
parse_tinode_expiry = None
verify_account_password_policy = None
if HAS_RUNTIME_DEPENDENCIES:
    import bcrypt

    from scripts.verify_deployment import parse_tinode_expiry, verify_account_password_policy


@unittest.skipUnless(
    HAS_RUNTIME_DEPENDENCIES,
    "deployment verifier dependencies are installed in the Chatmgt runtime image",
)
class TinodeExpiryParserTests(unittest.TestCase):
    def test_accepts_rfc3339_fractional_precision(self):
        cases = (
            ("2026-07-29T05:58:13.9Z", 900000),
            ("2026-07-29T05:58:13.123Z", 123000),
            ("2026-07-29T05:58:13.123456789Z", 123456),
        )

        for value, expected_microsecond in cases:
            with self.subTest(value=value):
                parsed = parse_tinode_expiry(value)
                self.assertEqual(parsed.microsecond, expected_microsecond)
                self.assertEqual(parsed.tzinfo, timezone.utc)

    def test_accepts_numeric_timestamp(self):
        parsed = parse_tinode_expiry(0)

        self.assertEqual(parsed.isoformat(), "1970-01-01T00:00:00+00:00")

    def test_rejects_invalid_value(self):
        with self.assertRaises(ValueError):
            parse_tinode_expiry("not-a-timestamp")


@unittest.skipUnless(
    HAS_RUNTIME_DEPENDENCIES,
    "deployment verifier dependencies are installed in the Chatmgt runtime image",
)
class AccountPasswordPolicyTests(unittest.TestCase):
    @staticmethod
    def account(username, password_hash, role="member", active=True, auth_source=None):
        properties = {"auth_source": auth_source} if auth_source else {}
        return SimpleNamespace(
            username=username,
            password_hash=password_hash,
            role=role,
            active=active,
            properties=properties,
        )

    @staticmethod
    def password_hash(password):
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")

    def test_accepts_account_projection_marker_and_secure_local_admin(self):
        accounts = [
            self.account("admin", self.password_hash("strong-local-password"), role="admin"),
            self.account("employee", "!account-sso-only", auth_source="account"),
        ]

        verify_account_password_policy(accounts)

    def test_account_projection_cannot_satisfy_local_admin_requirement(self):
        accounts = [
            self.account("employee-admin", "!account-sso-only", role="admin", auth_source="account"),
        ]

        with self.assertRaisesRegex(RuntimeError, "active local administrator"):
            verify_account_password_policy(accounts)

    def test_rejects_account_projection_with_a_login_password(self):
        accounts = [
            self.account("admin", self.password_hash("strong-local-password"), role="admin"),
            self.account("employee", self.password_hash("unexpected-password"), auth_source="account"),
        ]

        with self.assertRaisesRegex(RuntimeError, "unexpected password state"):
            verify_account_password_policy(accounts)

    def test_rejects_invalid_local_password_hash(self):
        accounts = [self.account("admin", "not-a-bcrypt-hash", role="admin")]

        with self.assertRaisesRegex(RuntimeError, "invalid password hash"):
            verify_account_password_policy(accounts)


if __name__ == "__main__":
    unittest.main()
