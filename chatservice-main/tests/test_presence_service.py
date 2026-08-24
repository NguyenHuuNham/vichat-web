import fnmatch
import importlib.util
import unittest
from unittest.mock import patch


HAS_RUNTIME_DEPENDENCIES = all(
    importlib.util.find_spec(name) is not None
    for name in ("gatco", "gatco_sqlalchemy", "redis")
)

if HAS_RUNTIME_DEPENDENCIES:
    from application import database
    from application.server import app
    from application.services.presence_service import (
        mark_offline,
        mark_online,
        online_snapshot,
    )


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.ttls = {}

    def setex(self, key, ttl, value):
        self.values[key] = value
        self.ttls[key] = ttl

    def delete(self, key):
        self.values.pop(key, None)

    def scan_iter(self, match=None):
        for key in list(self.values):
            if match is None or fnmatch.fnmatch(key, match):
                yield key


@unittest.skipUnless(
    HAS_RUNTIME_DEPENDENCIES,
    "presence service dependencies are installed in the Chatmgt image",
)
class PresenceServiceTests(unittest.TestCase):
    def test_presence_is_tenant_scoped_and_supports_multiple_sessions(self):
        redisdb = FakeRedis()
        with patch.object(database, "redisdb", redisdb):
            self.assertTrue(mark_online("tenant-a", "account-1", "session-a"))
            self.assertTrue(mark_online("tenant-a", "account-1", "session-b"))
            self.assertTrue(mark_online("tenant-b", "account-1", "session-c"))
            self.assertTrue(all(ttl == 8 for ttl in redisdb.ttls.values()))

            self.assertEqual(
                online_snapshot("tenant-a", ["account-1", "account-2"]),
                {"account-1": True, "account-2": False},
            )
            self.assertEqual(
                online_snapshot("tenant-b", ["account-1"]),
                {"account-1": True},
            )

            self.assertTrue(mark_offline("tenant-a", "account-1", "session-a"))
            self.assertEqual(
                online_snapshot("tenant-a", ["account-1"]),
                {"account-1": True},
            )

            self.assertTrue(mark_offline("tenant-a", "account-1", "session-b"))
            self.assertEqual(
                online_snapshot("tenant-a", ["account-1"]),
                {"account-1": False},
            )

    def test_redis_failure_is_reported_without_fabricating_offline_state(self):
        class BrokenRedis:
            def setex(self, *_args):
                raise RuntimeError("redis unavailable")

            def scan_iter(self, **_kwargs):
                raise RuntimeError("redis unavailable")

        with patch.object(database, "redisdb", BrokenRedis()):
            self.assertFalse(mark_online("tenant-a", "account-1", "session-a"))
            self.assertIsNone(online_snapshot("tenant-a", ["account-1"]))


if __name__ == "__main__":
    unittest.main()
