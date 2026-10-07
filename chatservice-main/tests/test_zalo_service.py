"""Unit tests for ZaloService, ZaloTokenManager, and PKCE OAuth helpers."""

import asyncio
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

has_aiohttp = "aiohttp" in sys.modules or (importlib.util.find_spec("aiohttp") is not None if "aiohttp" not in sys.modules else True)
if not has_aiohttp:
    aiohttp_stub = types.ModuleType("aiohttp")
    aiohttp_stub.__spec__ = importlib.machinery.ModuleSpec("aiohttp", None)
    aiohttp_stub.ClientError = Exception
    aiohttp_stub.ClientTimeout = lambda **_kwargs: None
    aiohttp_stub.ClientSession = MagicMock
    sys.modules["aiohttp"] = aiohttp_stub

SERVICE_PATH = Path(__file__).resolve().parents[1] / "application" / "services" / "zalo_service.py"
spec = importlib.util.spec_from_file_location("zalo_service_module", SERVICE_PATH)
zalo_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(zalo_module)

ZaloService = zalo_module.ZaloService
ZaloTokenManager = zalo_module.ZaloTokenManager
build_authorization_url = zalo_module.build_authorization_url
generate_code_challenge = zalo_module.generate_code_challenge
generate_code_verifier = zalo_module.generate_code_verifier


class FakeRedis(object):
    """In-memory Redis fake for fast isolated unit testing."""

    def __init__(self):
        self.store = {}

    def get(self, key):
        return self.store.get(key)

    def setex(self, key, ttl, value):
        self.store[key] = value

    def delete(self, key):
        self.store.pop(key, None)

    def exists(self, key):
        return key in self.store


class ZaloServiceTests(unittest.TestCase):
    def setUp(self):
        self.fake_redis = FakeRedis()
        self.token_manager = ZaloTokenManager(
            app_id="123456789",
            secret_key="secret_test_key",
            redis_client=self.fake_redis,
        )

    def test_pkce_generation(self):
        verifier = generate_code_verifier()
        self.assertGreater(len(verifier), 30)
        challenge = generate_code_challenge(verifier)
        self.assertGreater(len(challenge), 30)
        self.assertNotIn("=", challenge)

    def test_build_authorization_url(self):
        url = build_authorization_url(
            app_id="app_123",
            redirect_uri="https://vichat.vn/callback",
            code_challenge="challenge_xyz",
            state="tenant_456",
        )
        self.assertIn("oauth.zaloapp.com", url)
        self.assertIn("app_id=app_123", url)
        self.assertIn("state=tenant_456", url)
        self.assertIn("code_challenge=challenge_xyz", url)

    def test_token_manager_persist_and_retrieve(self):
        self.token_manager.persist_tokens(
            access_token="test_at_123",
            refresh_token="test_rt_456",
            oa_id="oa_999",
            at_expires_in=3600,
        )
        token = self.token_manager.get_access_token(oa_id="oa_999")
        self.assertEqual(token, "test_at_123")

    def test_token_manager_returns_none_when_expired_and_no_rt(self):
        at_key = "zalo:at:oa_expired"
        self.fake_redis.setex(at_key, 10, '{"token": "expired_token", "expires_at": 100}')
        token = self.token_manager.get_access_token(oa_id="oa_expired")
        self.assertIsNone(token)

    def test_token_manager_invalidation(self):
        self.token_manager.persist_tokens("at_val", "rt_val", oa_id="oa_inv")
        self.assertEqual(self.token_manager.get_access_token(oa_id="oa_inv"), "at_val")
        self.token_manager.invalidate_access_token(oa_id="oa_inv")
        # Invalidation removes AT from cache
        at_key = self.token_manager._get_key("at", "oa_inv")
        self.assertIsNone(self.fake_redis.get(at_key))

    def test_token_manager_seed_if_empty(self):
        self.token_manager.seed_tokens_if_empty("at_seeded", "rt_seeded", oa_id="oa_seed")
        self.assertEqual(self.token_manager.get_access_token(oa_id="oa_seed"), "at_seeded")
        # Should not overwrite if already present
        self.token_manager.seed_tokens_if_empty("at_new", "rt_new", oa_id="oa_seed")
        self.assertEqual(self.token_manager.get_access_token(oa_id="oa_seed"), "at_seeded")

    def test_zalo_service_enabled_check(self):
        config_disabled = {"ZALO_APP_ID": "", "ZALO_SECRET_KEY": "", "ZALO_ACCESS_TOKEN": ""}
        service_disabled = ZaloService(SimpleNamespace(config=config_disabled))
        self.assertFalse(service_disabled.enabled)

        config_enabled = {"ZALO_APP_ID": "123", "ZALO_SECRET_KEY": "abc", "ZALO_ACCESS_TOKEN": ""}
        service_enabled = ZaloService(SimpleNamespace(config=config_enabled))
        self.assertTrue(service_enabled.enabled)


    def test_send_cs_message_requires_token(self):
        service = ZaloService(SimpleNamespace(config={"ZALO_APP_ID": "123", "ZALO_SECRET_KEY": "abc"}))
        service._token_manager = self.token_manager  # no token for oa_none

        async def run_test():
            result = await service.send_cs_message(
                user_id="user_123",
                message_text="Hello Zalo Customer",
                oa_id="oa_none",
            )
            self.assertFalse(result["success"])
            self.assertEqual(result["error_code"], -1)

        asyncio.run(run_test())

    def test_send_cs_message_success(self):
        self.token_manager.persist_tokens(
            access_token="valid_access_token",
            refresh_token="valid_refresh_token",
            oa_id="oa_test",
        )
        service = ZaloService(SimpleNamespace(config={"ZALO_APP_ID": "123", "ZALO_SECRET_KEY": "abc"}))
        service._token_manager = self.token_manager

        mock_response = MagicMock()
        mock_response.json = AsyncMock(return_value={"error": 0, "message": "Success", "data": {"message_id": "msg_999"}})

        mock_post = MagicMock()
        mock_post.__aenter__ = AsyncMock(return_value=mock_response)
        mock_post.__aexit__ = AsyncMock(return_value=None)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=mock_post)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        zalo_module.aiohttp = MagicMock()
        zalo_module.aiohttp.ClientTimeout = MagicMock(return_value=None)
        zalo_module.aiohttp.ClientSession = MagicMock(return_value=mock_session)

        async def run_test():
            result = await service.send_cs_message(
                user_id="user_888",
                message_text="Bot automatic answer",
                oa_id="oa_test",
            )
            self.assertTrue(result["success"])
            self.assertEqual(result["msg_id"], "msg_999")

        asyncio.run(run_test())


if __name__ == "__main__":
    unittest.main()
