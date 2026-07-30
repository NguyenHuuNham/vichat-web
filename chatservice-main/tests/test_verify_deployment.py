from datetime import timezone
import importlib.util
import unittest


HAS_RUNTIME_DEPENDENCIES = all(
    importlib.util.find_spec(name) is not None
    for name in ("aiohttp", "requests", "sqlalchemy")
)
parse_tinode_expiry = None
if HAS_RUNTIME_DEPENDENCIES:
    from scripts.verify_deployment import parse_tinode_expiry


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


if __name__ == "__main__":
    unittest.main()
