"""Unit and Integration Tests for api_livechat.py."""

import hashlib
import hmac
import json
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

# Pre-mock dependencies if gatco is not installed locally
if "gatco" not in sys.modules:
    gatco_mock = MagicMock()
    sys.modules["gatco"] = gatco_mock
    sys.modules["gatco.response"] = MagicMock()
    sys.modules["sanic"] = MagicMock()
    sys.modules["sanic.response"] = MagicMock()

# Mock application server and database
app_mock = MagicMock()
redis_mock = MagicMock()

server_mock = MagicMock()
server_mock.app = app_mock
sys.modules["application.server"] = server_mock

db_mock = MagicMock()
db_mock.redisdb = redis_mock
sys.modules["application.database"] = db_mock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from application.controllers.api_livechat import (
    _verify_internal_token,
    _sign_payload,
    _append_livechat_message,
    _get_livechat_messages,
    _get_active_livechat_conversations_for_listing,
    DEFAULT_INTERNAL_TOKEN,
    DEFAULT_INGRESS_SECRET,
)


class TestApiLivechat(unittest.TestCase):

    def test_verify_internal_token_success(self):
        req = MagicMock()
        req.headers = {"X-Livechat-Internal-Token": DEFAULT_INTERNAL_TOKEN}
        req.args = {}
        self.assertTrue(_verify_internal_token(req))

    def test_verify_internal_token_failure(self):
        req = MagicMock()
        req.headers = {"X-Livechat-Internal-Token": "invalid_secret"}
        req.args = {}
        self.assertFalse(_verify_internal_token(req))

    def test_sign_payload_hmac_sha256(self):
        payload = b'{"hello": "world"}'
        secret = "test_secret_key"
        expected_sig = "sha256=" + hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
        generated_sig = _sign_payload(payload, secret)
        self.assertEqual(generated_sig, expected_sig)

    @patch("application.controllers.api_livechat.redisdb")
    def test_append_and_get_messages(self, mock_redis):
        fake_storage = []

        def fake_rpush(key, val):
            fake_storage.append(val)
            return len(fake_storage)

        def fake_lrange(key, start, end):
            return fake_storage

        mock_redis.rpush.side_effect = fake_rpush
        mock_redis.lrange.side_effect = fake_lrange

        msg_obj = {
            "id": "msg_001",
            "conversation_id": "livechat:conv_123",
            "sender_type": "VISITOR",
            "text": "Hello ViChat",
        }
        _append_livechat_message("livechat:conv_123", msg_obj)

        messages = _get_livechat_messages("livechat:conv_123")
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["text"], "Hello ViChat")
        self.assertEqual(messages[0]["sender_type"], "VISITOR")

    @patch("application.controllers.api_livechat.redisdb")
    def test_get_active_livechat_conversations_for_listing(self, mock_redis):
        conv_record = {
            "id": "livechat:conv_123",
            "external_conversation_id": "conv_123",
            "tenant_id": "gonstack",
            "bot_id": "bot_live",
            "bot_name": "Gonstack Bot",
            "name": "Khách Test",
            "last_message": "Cần tư vấn",
            "updated_at": 1740000000,
            "channel": "livechat",
            "status": "WAITING_HUMAN",
        }

        mock_redis.smembers.return_value = [b"livechat:conv_123"]
        mock_redis.get.return_value = json.dumps(conv_record).encode("utf-8")

        listing = _get_active_livechat_conversations_for_listing("gonstack")
        self.assertEqual(len(listing), 1)
        self.assertEqual(listing[0]["id"], "livechat:conv_123")
        self.assertEqual(listing[0]["channel"], "livechat")
        self.assertEqual(listing[0]["name"], "Khách Test")
        self.assertEqual(listing[0]["lastMsg"], "Cần tư vấn")

        # Isolation test: other tenant must not see gonstack conversations
        other_listing = _get_active_livechat_conversations_for_listing("hoangha_tenant")
        self.assertEqual(len(other_listing), 0)


if __name__ == "__main__":
    unittest.main()
