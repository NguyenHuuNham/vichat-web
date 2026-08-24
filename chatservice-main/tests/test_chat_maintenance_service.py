import importlib.util
import json
import unittest
from unittest.mock import patch


HAS_RUNTIME_DEPENDENCIES = all(
    importlib.util.find_spec(name) is not None
    for name in ("gatco", "gatco_sqlalchemy", "redis")
)

if HAS_RUNTIME_DEPENDENCIES:
    from application import database
    from application.services.chat_maintenance_service import (
        MAINTENANCE_CHANNEL,
        MAINTENANCE_KEY,
        MAINTENANCE_MESSAGE,
        default_maintenance_state,
        maintenance_sse_chunk,
        normalize_maintenance_state,
        parse_enabled,
        read_maintenance_state,
        write_maintenance_state,
    )


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.published = []

    def get(self, key):
        return self.values.get(key)

    def set(self, key, value):
        self.values[key] = value
        return True

    def publish(self, channel, value):
        self.published.append((channel, value))
        return 1


@unittest.skipUnless(
    HAS_RUNTIME_DEPENDENCIES,
    "maintenance service dependencies are installed in the Chatmgt image",
)
class ChatMaintenanceServiceTests(unittest.TestCase):
    def test_normalization_is_bounded_to_the_platform_message(self):
        state = normalize_maintenance_state({
            "enabled": True,
            "message": "secret or arbitrary content",
            "updated_at": "123",
        })
        self.assertTrue(state["enabled"])
        self.assertEqual(state["message"], MAINTENANCE_MESSAGE)
        self.assertEqual(state["updatedAt"], 123)

    def test_redis_state_is_published_and_read_back(self):
        redis_client = FakeRedis()
        with patch.object(database, "redisdb", redis_client):
            state = write_maintenance_state(True, now_ms=456)
            self.assertEqual(read_maintenance_state(), state)
        self.assertEqual(redis_client.published[0][0], MAINTENANCE_CHANNEL)
        self.assertEqual(json.loads(redis_client.values[MAINTENANCE_KEY])["enabled"], True)

    def test_invalid_enabled_values_are_rejected(self):
        self.assertIsNone(parse_enabled("maybe"))
        self.assertTrue(parse_enabled("on"))
        self.assertFalse(parse_enabled("0"))

    def test_sse_chunk_has_a_named_maintenance_event(self):
        chunk = maintenance_sse_chunk({"enabled": True, "updatedAt": 9})
        self.assertTrue(chunk.startswith("event: maintenance\ndata: "))
        self.assertTrue(chunk.endswith("\n\n"))
        self.assertEqual(json.loads(chunk.split("data: ", 1)[1]), {
            "enabled": True,
            "message": MAINTENANCE_MESSAGE,
            "updatedAt": 9,
        })
        self.assertEqual(default_maintenance_state()["enabled"], False)


if __name__ == "__main__":
    unittest.main()
