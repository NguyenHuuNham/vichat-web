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
        LAST_SEEN_TTL,
        mark_offline,
        mark_online,
        online_snapshot,
        presence_snapshot,
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
        self.ttls.pop(key, None)

    def get(self, key):
        return self.values.get(key)

    def mget(self, keys):
        return [self.values.get(key) for key in keys]

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
            self.assertTrue(mark_online("tenant-a", "account-1", "session-a", now_ms=1000))
            self.assertTrue(mark_online("tenant-a", "account-1", "session-b", now_ms=2000))
            self.assertTrue(mark_online("tenant-b", "account-1", "session-c", now_ms=3000))
            presence_ttls = [
                ttl for key, ttl in redisdb.ttls.items()
                if key.startswith("vichat:presence:")
            ]
            last_seen_ttls = [
                ttl for key, ttl in redisdb.ttls.items()
                if key.startswith("vichat:last-seen:")
            ]
            self.assertTrue(all(ttl == 8 for ttl in presence_ttls))
            self.assertTrue(all(ttl == LAST_SEEN_TTL for ttl in last_seen_ttls))

            self.assertEqual(
                online_snapshot("tenant-a", ["account-1", "account-2"]),
                {"account-1": True, "account-2": False},
            )
            self.assertEqual(
                online_snapshot("tenant-b", ["account-1"]),
                {"account-1": True},
            )
            self.assertEqual(
                presence_snapshot("tenant-a", ["account-1", "account-2"]),
                {
                    "presence": {"account-1": True, "account-2": False},
                    "last_seen": {"account-1": 2000},
                },
            )

            self.assertTrue(mark_offline("tenant-a", "account-1", "session-a", now_ms=4000))
            self.assertEqual(
                online_snapshot("tenant-a", ["account-1"]),
                {"account-1": True},
            )

            self.assertTrue(mark_offline("tenant-a", "account-1", "session-b", now_ms=5000))
            self.assertEqual(
                presence_snapshot("tenant-a", ["account-1"]),
                {
                    "presence": {"account-1": False},
                    "last_seen": {"account-1": 5000},
                },
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

    def test_last_seen_write_failure_does_not_break_presence_lease(self):
        class LastSeenWriteFailsRedis(FakeRedis):
            def setex(self, key, ttl, value):
                if key.startswith("vichat:last-seen:"):
                    raise RuntimeError("last-seen unavailable")
                super().setex(key, ttl, value)

        redisdb = LastSeenWriteFailsRedis()
        with patch.object(database, "redisdb", redisdb):
            self.assertTrue(mark_online("tenant-a", "account-1", "session-a"))
            self.assertEqual(
                presence_snapshot("tenant-a", ["account-1"]),
                {"presence": {"account-1": True}, "last_seen": {}},
            )
            self.assertTrue(mark_offline("tenant-a", "account-1", "session-a"))
            self.assertEqual(
                presence_snapshot("tenant-a", ["account-1"]),
                {"presence": {"account-1": False}, "last_seen": {}},
            )

    def test_last_seen_does_not_move_backwards_when_events_arrive_out_of_order(self):
        redisdb = FakeRedis()
        with patch.object(database, "redisdb", redisdb):
            self.assertTrue(mark_online("tenant-a", "account-1", "session-a", now_ms=5000))
            self.assertTrue(mark_offline("tenant-a", "account-1", "session-a", now_ms=4000))
            self.assertEqual(
                presence_snapshot("tenant-a", ["account-1"])["last_seen"],
                {"account-1": 5000},
            )

            self.assertTrue(mark_online("tenant-a", "account-1", "session-a", now_ms=6000))
            self.assertTrue(mark_offline("tenant-a", "account-1", "session-a", now_ms=5500))
            self.assertEqual(
                presence_snapshot("tenant-a", ["account-1"])["last_seen"],
                {"account-1": 6000},
            )


if __name__ == "__main__":
    unittest.main()
