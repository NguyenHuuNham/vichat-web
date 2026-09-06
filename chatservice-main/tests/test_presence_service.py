import fnmatch
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch


HAS_RUNTIME_DEPENDENCIES = all(
    importlib.util.find_spec(name) is not None
    for name in ("gatco", "gatco_sqlalchemy", "redis")
)

if HAS_RUNTIME_DEPENDENCIES:
    from application import database
    from application.server import app
    from application.services import presence_service
else:
    database = ModuleType("application.database")
    database.redisdb = None
    app = SimpleNamespace(config={})
    application_stub = ModuleType("application")
    application_stub.database = database
    server_stub = ModuleType("application.server")
    server_stub.app = app
    spec = importlib.util.spec_from_file_location(
        "presence_service_under_test",
        Path(__file__).resolve().parents[1] / "application/services/presence_service.py",
    )
    presence_service = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, {
        "application": application_stub,
        "application.database": database,
        "application.server": server_stub,
    }):
        spec.loader.exec_module(presence_service)

LAST_SEEN_TTL = presence_service.LAST_SEEN_TTL
mark_offline = presence_service.mark_offline
mark_online = presence_service.mark_online
online_snapshot = presence_service.online_snapshot
presence_snapshot = presence_service.presence_snapshot


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.ttls = {}

    def setex(self, key, ttl, value):
        self.values[key] = value
        self.ttls[key] = ttl

    def delete(self, key):
        deleted = int(key in self.values)
        self.values.pop(key, None)
        self.ttls.pop(key, None)
        return deleted

    def get(self, key):
        return self.values.get(key)

    def mget(self, keys):
        return [self.values.get(key) for key in keys]

    def scan_iter(self, match=None):
        for key in list(self.values):
            if match is None or fnmatch.fnmatch(key, match):
                yield key


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

    def test_repeated_offline_cleanup_keeps_the_original_departure(self):
        redisdb = FakeRedis()
        with patch.object(database, "redisdb", redisdb):
            mark_online("tenant-a", "account-1", "tab-a", now_ms=1000)
            mark_offline("tenant-a", "account-1", "tab-a", now_ms=2000)
            self.assertTrue(mark_offline("tenant-a", "account-1", "tab-a", now_ms=86400000))
            self.assertEqual(presence_snapshot("tenant-a", ["account-1"]), {
                "presence": {"account-1": False}, "last_seen": {"account-1": 2000},
            })

    def test_offline_without_a_lease_never_fabricates_activity(self):
        with patch.object(database, "redisdb", FakeRedis()):
            self.assertTrue(mark_offline("tenant-a", "account-1", "never-opened", now_ms=86400000))
            self.assertEqual(presence_snapshot("tenant-a", ["account-1"]), {
                "presence": {"account-1": False}, "last_seen": {},
            })

    def test_expired_lease_uses_last_heartbeat_not_late_logout_or_read(self):
        redisdb = FakeRedis()
        with patch.object(database, "redisdb", redisdb):
            mark_online("tenant-a", "account-1", "tab-a", now_ms=1000)
            redisdb.delete(presence_service._presence_key("tenant-a", "account-1", "tab-a"))
            mark_offline("tenant-a", "account-1", "tab-a", now_ms=86400000)
            for _iteration in range(3):
                self.assertEqual(presence_snapshot("tenant-a", ["account-1"]), {
                    "presence": {"account-1": False}, "last_seen": {"account-1": 1000},
                })

    def test_delayed_heartbeat_cannot_revive_a_departed_tab(self):
        with patch.object(database, "redisdb", FakeRedis()):
            mark_online("tenant-a", "account-1", "tab-a", now_ms=1000, sequence=1)
            mark_offline("tenant-a", "account-1", "tab-a", now_ms=2000, sequence=3)
            self.assertTrue(mark_online("tenant-a", "account-1", "tab-a", now_ms=3000, sequence=2))
            self.assertEqual(presence_snapshot("tenant-a", ["account-1"]), {
                "presence": {"account-1": False}, "last_seen": {"account-1": 2000},
            })

    def test_delayed_offline_cannot_remove_a_resumed_tab(self):
        with patch.object(database, "redisdb", FakeRedis()):
            mark_online("tenant-a", "account-1", "tab-a", now_ms=1000, sequence=1)
            mark_online("tenant-a", "account-1", "tab-a", now_ms=3000, sequence=3)
            self.assertTrue(mark_offline("tenant-a", "account-1", "tab-a", now_ms=4000, sequence=2))
            self.assertEqual(presence_snapshot("tenant-a", ["account-1"]), {
                "presence": {"account-1": True}, "last_seen": {"account-1": 3000},
            })

    def test_offline_arriving_before_first_heartbeat_does_not_create_last_seen(self):
        with patch.object(database, "redisdb", FakeRedis()):
            mark_offline("tenant-a", "account-1", "tab-a", now_ms=2000, sequence=2)
            mark_online("tenant-a", "account-1", "tab-a", now_ms=3000, sequence=1)
            self.assertEqual(presence_snapshot("tenant-a", ["account-1"]), {
                "presence": {"account-1": False}, "last_seen": {},
            })

    def test_sequences_are_isolated_by_tab_and_tenant(self):
        with patch.object(database, "redisdb", FakeRedis()):
            mark_online("tenant-a", "account-1", "tab-a", now_ms=1000, sequence=100)
            mark_online("tenant-a", "account-1", "tab-b", now_ms=2000, sequence=1)
            mark_online("tenant-b", "account-1", "tab-a", now_ms=3000, sequence=1)
            mark_offline("tenant-a", "account-1", "tab-a", now_ms=4000, sequence=101)
            self.assertEqual(online_snapshot("tenant-a", ["account-1"]), {"account-1": True})
            self.assertEqual(online_snapshot("tenant-b", ["account-1"]), {"account-1": True})
            mark_offline("tenant-a", "account-1", "tab-b", now_ms=5000, sequence=2)
            self.assertEqual(presence_snapshot("tenant-a", ["account-1"]), {
                "presence": {"account-1": False}, "last_seen": {"account-1": 5000},
            })

    def test_duplicate_sequence_does_not_refresh_activity_or_expired_lease(self):
        redisdb = FakeRedis()
        with patch.object(database, "redisdb", redisdb):
            mark_online("tenant-a", "account-1", "tab-a", now_ms=1000, sequence=1)
            redisdb.delete(presence_service._presence_key("tenant-a", "account-1", "tab-a"))
            mark_online("tenant-a", "account-1", "tab-a", now_ms=3000, sequence=1)
            self.assertEqual(presence_snapshot("tenant-a", ["account-1"]), {
                "presence": {"account-1": False}, "last_seen": {"account-1": 1000},
            })

    def test_invalid_sequence_does_not_mutate_presence(self):
        redisdb = FakeRedis()
        with patch.object(database, "redisdb", redisdb):
            for sequence in (True, False, -1, 0, 1.5, "2", [], 9007199254740992):
                with self.subTest(sequence=sequence):
                    self.assertFalse(mark_online("tenant-a", "account-1", "tab-a", sequence=sequence))
                    self.assertFalse(mark_offline("tenant-a", "account-1", "tab-a", sequence=sequence))
            self.assertEqual(redisdb.values, {})

    @unittest.skipUnless(
        all(importlib.util.find_spec(name) is not None for name in ("fakeredis", "lupa")),
        "optional fakeredis[lua] runtime is required to execute Redis Lua scripts locally",
    )
    def test_atomic_redis_scripts_preserve_departure_and_event_order(self):
        import fakeredis
        redisdb = fakeredis.FakeStrictRedis()
        with patch.object(database, "redisdb", redisdb):
            self.assertTrue(mark_online("tenant-a", "account-1", "tab-a", now_ms=1000, sequence=1))
            self.assertTrue(mark_offline("tenant-a", "account-1", "tab-a", now_ms=2000, sequence=3))
            self.assertTrue(mark_online("tenant-a", "account-1", "tab-a", now_ms=3000, sequence=2))
            self.assertTrue(mark_offline("tenant-a", "account-1", "tab-a", now_ms=4000, sequence=4))
            self.assertEqual(presence_snapshot("tenant-a", ["account-1"]), {
                "presence": {"account-1": False}, "last_seen": {"account-1": 2000},
            })
            self.assertTrue(mark_online("tenant-a", "account-1", "tab-a", now_ms=5000, sequence=6))
            self.assertTrue(mark_offline("tenant-a", "account-1", "tab-a", now_ms=6000, sequence=5))
            self.assertEqual(presence_snapshot("tenant-a", ["account-1"]), {
                "presence": {"account-1": True}, "last_seen": {"account-1": 5000},
            })
            self.assertTrue(mark_online("tenant-a", "account-1", "tab-a", now_ms=4500, sequence=7))
            self.assertEqual(presence_snapshot("tenant-a", ["account-1"])["last_seen"], {"account-1": 5000})
            self.assertGreater(redisdb.ttl(presence_service._presence_key("tenant-a", "account-1", "tab-a")), 0)
            self.assertGreater(redisdb.ttl(presence_service._last_seen_key("tenant-a", "account-1")), 0)


if __name__ == "__main__":
    unittest.main()
