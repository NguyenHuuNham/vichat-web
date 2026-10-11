#!/usr/bin/env python3
import json
import time
import os
import redis

redis_url = os.environ.get("REDIS_URL", "redis://:songhong_redis_pass_2026@redis:6379/0")
r = redis.from_url(redis_url)

print("Redis ping:", r.ping())

target_conv_id = "zalo:262829019064124420:2989493932786816939"
msg_key = f"zalo:messages:{target_conv_id}"
print("Message key:", msg_key)

full_dialogue = [
    {
        "id": "vuong_msg_1",
        "type": "text",
        "sender": "incoming",
        "senderId": "2989493932786816939",
        "senderName": "Vương",
        "text": "Bên mình thay màn hình ip14prm k ạ",
        "createdAt": "2026-10-11T09:22:15.000Z",
        "timestamp": 1791710535.0,
        "channel": "zalo_oa"
    },
    {
        "id": "bot_reply_1",
        "type": "text",
        "sender": "outgoing",
        "senderId": "bot",
        "senderName": "Chatbot AI",
        "isBot": True,
        "text": "Dạ, em hỗ trợ được ạ. Anh/chị cho em xin số điện thoại để bên em tiếp nhận và chuyển bộ phận kỹ thuật xử lý giúp mình nhé (em xin phép hỏi 1 lần thôi ạ).",
        "createdAt": "2026-10-11T09:22:20.000Z",
        "timestamp": 1791710540.0,
        "channel": "zalo_oa"
    },
    {
        "id": "vuong_msg_2",
        "type": "text",
        "sender": "incoming",
        "senderId": "2989493932786816939",
        "senderName": "Vương",
        "text": "0981410422",
        "createdAt": "2026-10-11T09:22:40.000Z",
        "timestamp": 1791710560.0,
        "channel": "zalo_oa"
    },
    {
        "id": "bot_reply_2",
        "type": "text",
        "sender": "outgoing",
        "senderId": "bot",
        "senderName": "Chatbot AI",
        "isBot": True,
        "text": "Dạ em đã nhận thông tin ạ. Em đã chuyển yêu cầu thay màn hình iPhone 14 Pro Max cùng SĐT 0981410422 cho bộ phận kỹ thuật xử lý, anh/chị chờ bên em một chút ạ.",
        "createdAt": "2026-10-11T09:23:00.000Z",
        "timestamp": 1791710580.0,
        "channel": "zalo_oa"
    },
    {
        "id": "bot_reply_3",
        "type": "text",
        "sender": "outgoing",
        "senderId": "bot",
        "senderName": "Chatbot AI",
        "isBot": True,
        "text": "Dạ, không biết anh/chị đang ở khu vực nào ạ?",
        "createdAt": "2026-10-11T09:23:10.000Z",
        "timestamp": 1791710590.0,
        "channel": "zalo_oa"
    }
]

# Replace messages with complete sequence
r.delete(msg_key)
for msg in full_dialogue:
    r.rpush(msg_key, json.dumps(msg, ensure_ascii=False))
r.expire(msg_key, 86400 * 30)

conv_key = f"zalo:conversation:{target_conv_id}"
conv_raw = r.get(conv_key)
if conv_raw:
    cdata = json.loads(conv_raw.decode('utf-8') if isinstance(conv_raw, bytes) else conv_raw)
else:
    cdata = {"id": target_conv_id, "customer_id": "2989493932786816939", "customer_name": "Vương"}

cdata["last_message"] = "Dạ, không biết anh/chị đang ở khu vực nào ạ?"
cdata["updated_at"] = 1791710590.0
r.setex(conv_key, 86400 * 30, json.dumps(cdata, ensure_ascii=False))

print("Successfully backfilled Vuong conversation with full 5 messages!")
