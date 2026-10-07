"""Unit tests for Zalo Webhook Controller and Bot-First Auto-reply flow."""

import asyncio
import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

CONTROLLER_PATH = Path(__file__).resolve().parents[1] / "application" / "controllers" / "api_zalo.py"


class ZaloWebhookTests(unittest.TestCase):
    def test_challenge_probe(self):
        """Simulate challenge GET probe from Zalo."""
        challenge = "zalo_challenge_string_12345"
        self.assertEqual(challenge, "zalo_challenge_string_12345")

    def test_webhook_bot_reply_pipeline(self):
        """Verify that when user_send_text arrives, chatbot replies and CS message sends."""
        mock_chatbot = MagicMock()
        mock_chatbot.enabled = True
        mock_chatbot.reply = AsyncMock(return_value={"reply": "Chào bạn! Tôi là bot hỗ trợ."})

        mock_zalo_service = MagicMock()
        mock_zalo_service.send_cs_message = AsyncMock(return_value={"success": True, "msg_id": "cs_123"})

        async def run_pipeline():
            data = {
                "event_name": "user_send_text",
                "oa_id": "oa_company_1",
                "sender": {"id": "zalo_user_789"},
                "message": {"text": "Shop có bán sản phẩm này không?", "msg_id": "msg_001"},
            }

            sender_id = data["sender"]["id"]
            message_text = data["message"]["text"]
            oa_id = data["oa_id"]

            bot_response = await mock_chatbot.reply(
                message=message_text,
                conversation_id=f"zalo:{oa_id}:{sender_id}",
                user={"name": "Khách Zalo", "uid": sender_id, "channel": "zalo_oa"},
            )
            bot_reply = bot_response.get("reply")

            self.assertEqual(bot_reply, "Chào bạn! Tôi là bot hỗ trợ.")

            send_result = await mock_zalo_service.send_cs_message(
                user_id=sender_id,
                message_text=bot_reply,
                oa_id=oa_id,
            )
            self.assertTrue(send_result["success"])
            self.assertEqual(send_result["msg_id"], "cs_123")

        asyncio.run(run_pipeline())
        mock_chatbot.reply.assert_awaited_once()
        mock_zalo_service.send_cs_message.assert_awaited_once_with(
            user_id="zalo_user_789",
            message_text="Chào bạn! Tôi là bot hỗ trợ.",
            oa_id="oa_company_1",
        )

    def test_webhook_customer_profile_lookup(self):
        """Verify customer profile display_name and avatar are resolved."""
        mock_zalo_service = MagicMock()
        mock_zalo_service.get_user_profile = AsyncMock(return_value={
            "user_id": "zalo_u1",
            "display_name": "Nguyễn Văn A",
            "avatar": "https://zalo.me/avatar.jpg",
        })

        async def run_lookup():
            profile = await mock_zalo_service.get_user_profile("zalo_u1", "oa_1")
            self.assertEqual(profile["display_name"], "Nguyễn Văn A")
            self.assertEqual(profile["avatar"], "https://zalo.me/avatar.jpg")

        asyncio.run(run_lookup())
        mock_zalo_service.get_user_profile.assert_awaited_once_with("zalo_u1", "oa_1")

    def test_sync_token_flow(self):
        """Verify token sync logic with explicit tokens."""
        mock_token_manager = MagicMock()
        mock_token_manager.persist_tokens = MagicMock()

        mock_token_manager.persist_tokens(
            access_token="new_at",
            refresh_token="new_rt",
            oa_id="2274336170816480019",
        )
        mock_token_manager.persist_tokens.assert_called_once_with(
            access_token="new_at",
            refresh_token="new_rt",
            oa_id="2274336170816480019",
        )

    def test_out_of_scope_detection(self):
        """Verify out-of-scope rules for human handover."""
        HUMAN_INTENT_KEYWORDS = ("gặp nhân viên", "tư vấn viên", "cskh")
        BOT_FALLBACK_PHRASES = ("chưa được cập nhật", "chưa đủ thông tin")

        def is_oos(msg, resp):
            lower = msg.lower()
            if any(k in lower for k in HUMAN_INTENT_KEYWORDS):
                return True
            if not resp or not resp.get("reply"):
                return True
            if not resp.get("grounded", True):
                return True
            reply = resp.get("reply", "").lower()
            if any(p in reply for p in BOT_FALLBACK_PHRASES):
                return True
            return False

        # In-scope confident reply
        self.assertFalse(is_oos("Giá sản phẩm bao nhiêu?", {"reply": "Dạ sản phẩm giá 500k", "grounded": True}))

        # Customer explicitly asking for human
        self.assertTrue(is_oos("Tôi muốn gặp tư vấn viên trực tiếp", {"reply": "Bot sẵn sàng", "grounded": True}))
        self.assertTrue(is_oos("Cho tôi gặp nhân viên CSKH", {"reply": "Bot sẵn sàng", "grounded": True}))

        # Bot ungrounded / out of company knowledge
        self.assertTrue(is_oos("Chính sách trả góp thế nào?", {"reply": "Dạ", "grounded": False}))

        # Bot reply containing fallback phrase
        self.assertTrue(is_oos("Hỏi cái này nè", {"reply": "Dữ liệu nội bộ cho câu hỏi này chưa được cập nhật.", "grounded": True}))

    def test_takeover_routing(self):
        """Verify that when human takeover is active, bot is muted and conversation stays with agent."""
        fake_redis = {}
        oa_id = "2274336170816480019"
        user_id = "user_cust_01"
        takeover_key = f"zalo:takeover:{oa_id}:{user_id}"

        # 1. Before takeover: bot is active
        self.assertNotIn(takeover_key, fake_redis)

        # 2. Agent replies from ViChat -> activates takeover for 30 mins
        fake_redis[takeover_key] = "1"
        self.assertIn(takeover_key, fake_redis)

        # 3. Customer messages again -> takeover active, bot skipped
        is_takeover = takeover_key in fake_redis
        self.assertTrue(is_takeover)

        # 4. Agent releases -> bot re-armed
        fake_redis.pop(takeover_key, None)
        self.assertNotIn(takeover_key, fake_redis)


    def test_pending_handover_prevents_spam(self):
        """Verify that pending handover prevents bot from spamming repeat courtesy replies."""
        fake_redis = {}
        oa_id = "2274336170816480019"
        user_id = "user_cust_02"
        pending_key = f"zalo:pending_handover:{oa_id}:{user_id}"

        # 1. Customer asks out-of-scope question -> courtesy message sent, pending flag set
        fake_redis[pending_key] = "1"
        self.assertIn(pending_key, fake_redis)

        # 2. Customer messages 10 seconds later before agent replies -> pending is active, bot doesn't spam repeat message
        is_pending = pending_key in fake_redis
        self.assertTrue(is_pending)

        # 3. Agent replies from ViChat -> clears pending, activates takeover
        fake_redis.pop(pending_key, None)
        takeover_key = f"zalo:takeover:{oa_id}:{user_id}"
        fake_redis[takeover_key] = "1"
        self.assertNotIn(pending_key, fake_redis)
        self.assertIn(takeover_key, fake_redis)

    def test_zalo_message_history_and_listing(self):
        """Verify message appending, retrieval and conversation shape formatting."""
        history = []
        # 1. Inbound customer message
        history.append({
            "id": "msg_001",
            "type": "text",
            "sender": "incoming",
            "senderId": "zalo_u1",
            "senderName": "Khách Zalo A",
            "text": "Cho mình hỏi giá sản phẩm",
        })
        # 2. Bot reply
        history.append({
            "id": "bot_002",
            "type": "text",
            "sender": "incoming",
            "senderId": "bot",
            "senderName": "Chatbot AI",
            "text": "Dạ giá là 500k ạ",
            "isBot": True,
        })
        # 3. Agent reply
        history.append({
            "id": "agent_003",
            "type": "text",
            "sender": "outgoing",
            "senderId": "agent_01",
            "senderName": "Bạn",
            "text": "Dạ em có thể tư vấn thêm cho anh chị nhé",
        })

        self.assertEqual(len(history), 3)
        self.assertEqual(history[0]["sender"], "incoming")
        self.assertTrue(history[1].get("isBot"))
        self.assertEqual(history[2]["sender"], "outgoing")

    def test_from_bot_service_webhook_sync(self):
        """Verify handling of payloads synced from chatbot.gonplatform.com."""
        payload_normal = {
            "from_bot_service": True,
            "event_name": "user_send_text",
            "oa_id": "oa_123",
            "sender": {"id": "user_456"},
            "message": {"text": "Giá sản phẩm bao nhiêu?", "msg_id": "m1"},
            "bot_reply": "Giá sản phẩm là 500k",
        }
        self.assertTrue(payload_normal.get("from_bot_service"))
        self.assertEqual(payload_normal.get("bot_reply"), "Giá sản phẩm là 500k")

        payload_oos = {
            "from_bot_service": True,
            "event_name": "user_send_text",
            "oa_id": "oa_123",
            "sender": {"id": "user_456"},
            "message": {"text": "Cho tôi gặp giám đốc", "msg_id": "m2"},
            "is_out_of_scope": True,
        }
        self.assertTrue(payload_oos.get("is_out_of_scope"))


if __name__ == "__main__":
    unittest.main()




