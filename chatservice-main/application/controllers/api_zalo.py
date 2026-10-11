"""Zalo OA Webhook and Bot-First Auto-reply Controller.
Handles inbound messages from Zalo OA, triggers Chatbot AI responses,
and provides OAuth authorization flow for partners.
"""

import asyncio
from datetime import datetime
import functools
import json
import logging
import time
from gatco.response import json as json_response, text as text_response, stream
from sanic.response import redirect

from application.database import redisdb
from application.server import app
from application.services import ChatbotService, ZaloService
from application.services.tinode_zalo_bridge import (
    get_or_create_zalo_tinode_topic,
    publish_zalo_message_to_tinode,
    safe_async_publish_to_tinode,
)
from application.services.zalo_service import (
    build_authorization_url,
    generate_code_challenge,
    generate_code_verifier,
)

logger = logging.getLogger(__name__)

zalo_service = ZaloService(app)
chatbot_service = ChatbotService(app)

DEDUPE_TTL_SECONDS = 120
TAKEOVER_TTL_SECONDS = 1800  # 30 minutes of agent takeover window
PENDING_HANDOVER_TTL_SECONDS = 900  # 15 minutes of pending handover buffer
MAX_ZALO_HISTORY_PER_CONV = 500

HUMAN_INTENT_KEYWORDS = (
    "gặp nhân viên", "gặp tư vấn viên", "tư vấn viên", "gặp người", "người thật",
    "cskh", "chăm sóc khách hàng", "hotline", "chuyển máy", "liên hệ trực tiếp",
    "nhân viên hỗ trợ", "gặp admin", "gặp tổng đài", "chuyên viên", "nhân viên",
)

BOT_FALLBACK_PHRASES = (
    "chưa được cập nhật",
    "chưa đủ thông tin",
    "không tìm thấy",
    "chưa có thông tin",
    "chưa có dữ liệu",
    "liên hệ nhân viên",
    "liên hệ chuyên viên",
    "vui lòng liên hệ",
    "không thể trả lời",
)

HANDOVER_COURTESY_MESSAGE = (
    "Dạ, câu hỏi của bạn đã được chuyển đến chuyên viên tư vấn của Gonstack. "
    "Nhân viên hỗ trợ sẽ phản hồi trực tiếp cho bạn tại khung chat này ngay nhé ạ! 👩‍💼"
)

KNOWN_OA_TENANT_MAP = {
    "2274336170816480019": "gonstack",   # Gonstack Official OA
    "262829019064124420": "gonstack",    # Hoang Ha Mobile (under gonstack tenant)
    "3733466236951056718": "gonstack",   # CBS global education (under gonstack tenant)
    "2530086568306248692": "tn4227527230912752", # Skyline VMAC
    "857176587915285460": "tn5808415788858328",   # Redriverco
    "179200675293938056": "tn5342970775104050",   # Gong Cha Official
}

KNOWN_OA_NAME_MAP = {
    "2274336170816480019": "Gonstack",
    "262829019064124420": "Hoàng Hà Mobile",
    "3733466236951056718": "CBS global education",
    "2530086568306248692": "Skyline VMAC",
    "857176587915285460": "Redriverco",
    "179200675293938056": "Gong Cha Official",
}


def _extract_request_tenant(request) -> str:
    """Safely extracts tenant_id from user session, JWT token, or trusted headers."""
    # 1. From auth_service.current_user(request)
    try:
        from application.services.auth_service import current_user
        u = current_user(request)
        if u and (u.get("tenant_id") or u.get("current_tenant_id")):
            return str(u.get("tenant_id") or u.get("current_tenant_id")).strip()
    except Exception:
        pass

    # 2. From api_chat_management._identity(request)
    try:
        from application.controllers.api_chat_management import _identity
        resolved_u, t_id = _identity(request)
        if t_id:
            return str(t_id).strip()
    except Exception:
        pass

    # 3. Direct decode of token from request
    try:
        from application.services.auth_service import token_from_request, decode_access_token
        tok = token_from_request(request)
        if tok:
            payload = decode_access_token(tok)
            if payload and payload.get("tid"):
                return str(payload.get("tid")).strip()
    except Exception:
        pass

    # 4. From request headers (mobile bearer or trusted reverse proxy)
    t = (
        request.headers.get("X-Tenant-Id")
        or request.headers.get("X-Vichat-Tenant")
        or request.headers.get("X-Tenant")
    )
    if t:
        return str(t).strip()

    # 5. From query params if provided
    q_tenant = request.args.get("tenant_id")
    if q_tenant:
        return str(q_tenant).strip()

    return ""


def _is_duplicate_message(msg_id: str) -> bool:
    """Prevent double replies if Zalo retries the webhook delivery."""
    if not msg_id:
        return False
    key = "zalo:dedupe:{}".format(msg_id)
    if redisdb is not None:
        try:
            if redisdb.exists(key):
                return True
            redisdb.setex(key, DEDUPE_TTL_SECONDS, "1")
        except Exception as exc:
            logger.warning("Redis dedupe check failed: %s", exc)
    return False


def _is_takeover_active(oa_id: str, sender_id: str) -> bool:
    """Check if a human CSKH agent has actively taken over this conversation."""
    if not sender_id:
        return False
    key = "zalo:takeover:{}:{}".format(oa_id or "default", sender_id)
    if redisdb is not None:
        try:
            return bool(redisdb.exists(key))
        except Exception as exc:
            logger.warning("Redis takeover check failed: %s", exc)
    return False


def _set_takeover_active(oa_id: str, sender_id: str, active: bool = True, ttl: int = TAKEOVER_TTL_SECONDS):
    """Set or clear the human takeover flag in Redis."""
    key = "zalo:takeover:{}:{}".format(oa_id or "default", sender_id)
    if redisdb is not None:
        try:
            if active:
                redisdb.setex(key, ttl, "1")
            else:
                redisdb.delete(key)
        except Exception as exc:
            logger.warning("Redis set takeover failed: %s", exc)


def _is_handover_pending(oa_id: str, sender_id: str) -> bool:
    """Check if the conversation has already been handed over and is awaiting agent reply."""
    if not sender_id:
        return False
    key = "zalo:pending_handover:{}:{}".format(oa_id or "default", sender_id)
    if redisdb is not None:
        try:
            return bool(redisdb.exists(key))
        except Exception as exc:
            logger.warning("Redis pending handover check failed: %s", exc)
    return False


def _set_handover_pending(oa_id: str, sender_id: str, active: bool = True, ttl: int = PENDING_HANDOVER_TTL_SECONDS):
    """Set or clear the pending handover buffer in Redis."""
    key = "zalo:pending_handover:{}:{}".format(oa_id or "default", sender_id)
    if redisdb is not None:
        try:
            if active:
                redisdb.setex(key, ttl, "1")
            else:
                redisdb.delete(key)
        except Exception as exc:
            logger.warning("Redis set pending handover failed: %s", exc)


def _append_zalo_message(conversation_id: str, msg_payload: dict):
    """Store message into the conversation's message history in Redis with pipeline batching."""
    if not conversation_id or not msg_payload:
        return
    key = "zalo:messages:{}".format(conversation_id)
    if redisdb is not None:
        try:
            if hasattr(redisdb, "pipeline"):
                pipe = redisdb.pipeline()
                pipe.rpush(key, json.dumps(msg_payload))
                pipe.ltrim(key, -MAX_ZALO_HISTORY_PER_CONV, -1)
                pipe.expire(key, 86400 * 30)
                pipe.execute()
            else:
                redisdb.rpush(key, json.dumps(msg_payload))
                redisdb.ltrim(key, -MAX_ZALO_HISTORY_PER_CONV, -1)
                redisdb.expire(key, 86400 * 30)
        except Exception as exc:
            logger.warning("Failed to append Zalo message to Redis: %s", exc)


def _get_zalo_messages(conversation_id: str, limit: int = 100) -> list:
    """Retrieve message history for a Zalo conversation from Redis."""
    if not conversation_id:
        return []
    key = "zalo:messages:{}".format(conversation_id)
    messages = []
    if redisdb is not None:
        try:
            raw_list = redisdb.lrange(key, -limit, -1) or []
            for item in raw_list:
                item_str = item.decode("utf-8") if isinstance(item, bytes) else item
                messages.append(json.loads(item_str))
        except Exception as exc:
            logger.warning("Failed to get Zalo messages from Redis: %s", exc)
    return messages


def _get_active_zalo_conversations_for_listing(tenant_id: str = None, limit: int = 100) -> list:
    """Returns active Zalo OA conversations scoped by tenant for Web & Mobile listing."""
    conversations = []
    if redisdb is None or not tenant_id:
        return conversations
    try:
        index_key = "zalo:conversations:index:{}".format(tenant_id)
        members = redisdb.smembers(index_key) or []
        if not members:
            return conversations

        conv_ids = [m.decode("utf-8") if isinstance(m, bytes) else m for m in members]

        # Use pipeline or direct get to reduce Redis network roundtrips from N to 1
        raw_conv_list = []
        if hasattr(redisdb, "pipeline"):
            pipe = redisdb.pipeline()
            for cid in conv_ids:
                pipe.get("zalo:conversation:{}".format(cid))
            raw_conv_list = pipe.execute()
        else:
            for cid in conv_ids:
                raw_conv_list.append(redisdb.get("zalo:conversation:{}".format(cid)))

        valid_items = []
        for cid, raw_data in zip(conv_ids, raw_conv_list):
            if not raw_data:
                continue
            try:
                conv_obj = json.loads(raw_data.decode("utf-8") if isinstance(raw_data, bytes) else raw_data)
            except Exception:
                continue
            if conv_obj.get("tenant_id") and conv_obj.get("tenant_id") != tenant_id:
                continue
            parts = cid.split(":")
            oa_id = parts[1] if len(parts) >= 3 else ""
            user_id = parts[2] if len(parts) >= 3 else ""
            valid_items.append((cid, conv_obj, oa_id, user_id))

        if not valid_items:
            return conversations

        # Sort valid items by latest updated_at first and limit to prevent massive payload overloads
        valid_items.sort(key=lambda item: float(item[1].get("updated_at") or 0), reverse=True)
        if limit and limit > 0:
            valid_items = valid_items[:limit]

        # Fetch latest messages (limit=1) and takeover flags in second pipeline for the top items
        raw_msgs_list = []
        raw_takeover_list = []
        if hasattr(redisdb, "pipeline"):
            pipe2 = redisdb.pipeline()
            for cid, conv_obj, oa_id, user_id in valid_items:
                pipe2.lrange("zalo:messages:{}".format(cid), -1, -1)
                pipe2.get("zalo:takeover:{}:{}".format(oa_id, user_id))
            results = pipe2.execute()
            for i in range(len(valid_items)):
                raw_msgs_list.append(results[i * 2] if (i * 2) < len(results) else [])
                raw_takeover_list.append(results[i * 2 + 1] if (i * 2 + 1) < len(results) else None)
        else:
            for cid, conv_obj, oa_id, user_id in valid_items:
                raw_msgs_list.append(_get_zalo_messages(cid, limit=1))
                raw_takeover_list.append(_is_takeover_active(oa_id, user_id))

        for i, (cid, conv_obj, oa_id, user_id) in enumerate(valid_items):
            raw_msgs = raw_msgs_list[i] if i < len(raw_msgs_list) else []
            messages = []
            if raw_msgs:
                for rm in raw_msgs:
                    if isinstance(rm, dict):
                        messages.append(rm)
                    else:
                        try:
                            msg_dict = json.loads(rm.decode("utf-8") if isinstance(rm, bytes) else rm)
                            messages.append(_format_zalo_message(msg_dict))
                        except Exception:
                            pass

            takeover_raw = raw_takeover_list[i] if i < len(raw_takeover_list) else None
            takeover_active = False
            if isinstance(takeover_raw, bool):
                takeover_active = takeover_raw
            elif takeover_raw:
                try:
                    takeover_data = json.loads(takeover_raw.decode("utf-8") if isinstance(takeover_raw, bytes) else takeover_raw)
                    takeover_active = bool(takeover_data.get("active", False))
                except Exception:
                    pass

            oa_name = conv_obj.get("oa_name") or KNOWN_OA_NAME_MAP.get(oa_id) or "Zalo OA"
            customer_name = conv_obj.get("name") or "Khách Zalo"

            tinode_topic_val = conv_obj.get("tinode_topic") or conv_obj.get("tinodeTopic")
            if not tinode_topic_val and redisdb is not None:
                try:
                    cached_t = redisdb.get("zalo:tinode_topic:{}".format(cid))
                    if cached_t:
                        tinode_topic_val = (
                            cached_t.decode("utf-8") if isinstance(cached_t, bytes) else str(cached_t)
                        ).strip()
                except Exception:
                    pass

            if not tinode_topic_val:
                try:
                    asyncio.create_task(get_or_create_zalo_tinode_topic(
                        app=app,
                        oa_id=oa_id,
                        sender_id=user_id,
                        customer_name=customer_name,
                        tenant_id=tenant_id,
                    ))
                except Exception:
                    pass

            conversations.append({
                "id": cid,
                "managementId": cid,
                "tinodeTopic": tinode_topic_val or None,
                "tinode_topic": tinode_topic_val or None,
                "name": customer_name,
                "oa_id": conv_obj.get("oa_id") or oa_id,
                "oa_name": oa_name,
                "tenant_id": tenant_id,
                "avatarUrl": conv_obj.get("avatar") or "",
                "avatar": conv_obj.get("avatar") or "",
                "isGroup": False,
                "is_group": False,
                "channel": "zalo_oa",
                "channelType": "zalo_oa",
                "sourceType": "zalo_oa",
                "lastMsg": conv_obj.get("last_message") or "",
                "lastMessage": conv_obj.get("last_message") or "",
                "updatedAt": conv_obj.get("updated_at") or time.time(),
                "updated_at": conv_obj.get("updated_at") or time.time(),
                "badge": 1 if conv_obj.get("needs_human") else 0,
                "status": conv_obj.get("status") or "bot_resolved",
                "needs_human": conv_obj.get("needs_human", False),
                "takeover_active": takeover_active,
                "assigned_agent_id": conv_obj.get("assigned_agent_id") or None,
                "assigned_agent_name": conv_obj.get("assigned_agent_name") or None,
                "workflow_stage": conv_obj.get("workflow_stage") or "new",
                "tags": conv_obj.get("tags") or [],
                "phone": conv_obj.get("phone") or "",
                "address": conv_obj.get("address") or "",
                "gender": conv_obj.get("gender") or "",
                "is_follower": conv_obj.get("is_follower", False),
                "notes": conv_obj.get("notes") or [],
                "customer_info": {
                    "phone": conv_obj.get("phone") or "",
                    "address": conv_obj.get("address") or "",
                    "gender": conv_obj.get("gender") or "",
                    "is_follower": conv_obj.get("is_follower", False),
                    "tags": conv_obj.get("tags") or [],
                    "notes": conv_obj.get("notes") or [],
                },
                "messages": messages,
                "members": [
                    {
                        "id": user_id,
                        "name": customer_name,
                        "avatar": conv_obj.get("avatar") or "",
                        "role": "MEMBER",
                    }
                ],
            })
    except Exception as exc:
        logger.warning("Failed to get active Zalo conversations for listing: %s", exc)
    conversations.sort(key=lambda x: x.get("updated_at", 0), reverse=True)
    return conversations


def _is_out_of_scope(message_text: str, bot_response: dict) -> bool:
    """Determine if a customer question is outside the bot's knowledge area."""
    lower_message = str(message_text or "").lower()
    if any(keyword in lower_message for keyword in HUMAN_INTENT_KEYWORDS):
        return True

    if not bot_response:
        return True

    raw_reply = str(bot_response.get("reply") or "").strip().lower()
    if not raw_reply:
        return True

    grounded = bot_response.get("grounded", True)
    state = str(bot_response.get("state") or "").strip().lower()
    if not grounded or state in ("question-unclear", "no-context", "out-of-scope"):
        return True

    if any(phrase in raw_reply for phrase in BOT_FALLBACK_PHRASES):
        return True

    return False


@app.route("/api/v1/zalo/webhook", methods=["GET", "POST"])
async def zalo_webhook(request):
    """Webhook endpoint registered on Zalo Developers portal."""
    if request.method == "GET":
        # Verification / Challenge probe
        challenge = request.args.get("challenge") or request.args.get("hub.challenge")
        if challenge:
            return text_response(str(challenge), status=200)
        return json_response({"status": "ok", "service": "zalo-webhook"}, status=200)

    try:
        data = request.json or {}
    except Exception:
        data = {}

    event_name = data.get("event_name")
    recipient = data.get("recipient") or {}
    oa_id = str(data.get("oa_id") or recipient.get("id") or app.config.get("ZALO_OA_ID") or "").strip()
    tenant_id = str(
        data.get("tenant_id")
        or request.headers.get("X-Tenant-Id")
        or KNOWN_OA_TENANT_MAP.get(oa_id)
        or app.config.get("DEFAULT_TENANT")
        or "gonstack"
    ).strip()
    oa_name = str(
        data.get("oa_name")
        or KNOWN_OA_NAME_MAP.get(oa_id)
        or "Zalo OA"
    ).strip()
    sender = data.get("sender") or {}
    sender_id = str(sender.get("id") or data.get("fromuid") or "").strip()
    msg_obj = data.get("message") or {}
    msg_id = str(msg_obj.get("msg_id") or "").strip()
    message_text = str(msg_obj.get("text") or "").strip()

    logger.info("Zalo webhook received event=%s oa_id=%s sender=%s", event_name, oa_id, sender_id)

    # 1. Handle OA outgoing messages (sent by Bot, or by human staff on Zalo OA Manager / Zalo App)
    is_oa_event = str(event_name or "").startswith("oa_send_")
    if is_oa_event:
        customer_id = str(recipient.get("id") or data.get("user_id_by_app") or "").strip()
        if not customer_id:
            return json_response({"status": "received", "event": event_name}, status=200)

        if msg_id and _is_duplicate_message(msg_id):
            logger.info("Ignored duplicate Zalo OA message msg_id=%s", msg_id)
            return json_response({"status": "duplicate_skipped"}, status=200)

        conversation_id = "zalo:{}:{}".format(oa_id or "default", customer_id)
        msg_type = "text"
        img_url = ""
        file_obj = None
        attachments = msg_obj.get("attachments") or []

        if event_name == "oa_send_image":
            msg_type = "image"
            if attachments and isinstance(attachments, list):
                img_url = attachments[0].get("payload", {}).get("url") or attachments[0].get("payload", {}).get("thumbnail") or ""
            if not img_url:
                img_url = msg_obj.get("url") or msg_obj.get("thumb") or ""
            message_text = message_text or "[Hình ảnh]"
        elif event_name == "oa_send_file":
            msg_type = "file"
            if attachments and isinstance(attachments, list):
                f_payload = attachments[0].get("payload", {})
                f_url = f_payload.get("url") or ""
                f_name = f_payload.get("name") or "Tệp đính kèm"
                f_size = f_payload.get("size") or ""
                file_obj = {"url": f_url, "name": f_name, "size": f_size}
                message_text = f_name or "[Tệp đính kèm]"
        elif not message_text and attachments and isinstance(attachments, list):
            att_type = attachments[0].get("type")
            if att_type == "image":
                msg_type = "image"
                img_url = attachments[0].get("payload", {}).get("url") or ""
                message_text = "[Hình ảnh]"
            elif att_type == "file":
                msg_type = "file"
                f_payload = attachments[0].get("payload", {})
                file_obj = {"url": f_payload.get("url") or "", "name": f_payload.get("name") or "Tệp đính kèm", "size": f_payload.get("size") or ""}
                message_text = file_obj["name"]

        is_bot = bool(data.get("is_bot") or data.get("from_bot_service") or data.get("from_chatbot"))
        sender_name = str(data.get("sender_name") or "").strip()
        if not sender_name:
            sender_name = "Chatbot AI" if is_bot else (oa_name or "CSKH / Bot Zalo")

        oa_msg = {
            "id": msg_id or "oa_{}".format(int(time.time() * 1000)),
            "type": msg_type,
            "sender": "outgoing",
            "senderId": oa_id,
            "senderName": sender_name,
            "text": message_text or "[Đính kèm]",
            "createdAt": datetime.utcnow().isoformat() + "Z",
            "timestamp": time.time(),
            "channel": "zalo_oa",
            "isBot": is_bot,
        }
        if img_url:
            oa_msg["image"] = img_url
        if file_obj:
            oa_msg["file"] = file_obj

        # Persist OA outgoing message to conversation history in Redis
        _append_zalo_message(conversation_id, oa_msg)

        # Bridge to Tinode: ensure topic and publish message
        tinode_topic = await get_or_create_zalo_tinode_topic(
            app,
            oa_id=oa_id,
            sender_id=customer_id,
            customer_name="Khách Zalo",
            tenant_id=tenant_id,
        )
        if tinode_topic:
            safe_async_publish_to_tinode(
                app,
                topic=tinode_topic,
                text=message_text or "[Đính kèm]",
                sender_name=sender_name,
                is_bot=is_bot,
                is_agent=not is_bot,
            )

        if redisdb is not None:
            try:
                raw_conv = redisdb.get("zalo:conversation:{}".format(conversation_id))
                conv_data = json.loads(raw_conv.decode("utf-8") if isinstance(raw_conv, bytes) else raw_conv) if raw_conv else {}
                conv_data.update({
                    "id": conversation_id,
                    "channel": "zalo_oa",
                    "channelType": "zalo_oa",
                    "last_message": message_text or "[Đính kèm]",
                    "updated_at": time.time(),
                    "tinode_topic": tinode_topic or conv_data.get("tinode_topic"),
                    "tinodeTopic": tinode_topic or conv_data.get("tinodeTopic"),
                })
                redisdb.setex("zalo:conversation:{}".format(conversation_id), 86400 * 30, json.dumps(conv_data))
                redisdb.sadd("zalo:conversations:index:{}".format(tenant_id), conversation_id)
                redisdb.sadd("zalo:conversations:index", conversation_id)

                sync_payload = {
                    "event": "agent_message",
                    "channel": "zalo_oa",
                    "oa_id": oa_id,
                    "tenant_id": tenant_id,
                    "conversation_id": conversation_id,
                    "sender_id": oa_id,
                    "agent_name": sender_name,
                    "message": message_text or "[Đính kèm]",
                    "message_id": msg_id,
                    "type": msg_type,
                    "timestamp": time.time(),
                    "is_bot": is_bot,
                }
                if img_url:
                    sync_payload["image"] = img_url
                if file_obj:
                    sync_payload["file"] = file_obj
                redisdb.publish("vichat:omnichannel:events", json.dumps(sync_payload))
            except Exception as sync_exc:
                logger.warning("Failed to sync OA outgoing message: %s", sync_exc)

        return json_response({
            "status": "processed",
            "event": event_name,
            "oa_id": oa_id,
            "customer_id": customer_id,
            "conversation_id": conversation_id,
            "message": message_text,
        }, status=200)

    # 2. Handle customer inbound messages (text, image, sticker, file, audio, location)
    if not sender_id:
        return json_response({"status": "received", "event": event_name}, status=200)

    msg_type = "text"
    img_url = ""
    file_obj = None
    attachments = msg_obj.get("attachments") or []

    if event_name == "user_send_image":
        msg_type = "image"
        if attachments and isinstance(attachments, list):
            img_url = attachments[0].get("payload", {}).get("url") or attachments[0].get("payload", {}).get("thumbnail") or ""
        if not img_url:
            img_url = msg_obj.get("url") or msg_obj.get("thumb") or ""
        message_text = message_text or "[Hình ảnh]"
    elif event_name == "user_send_file":
        msg_type = "file"
        if attachments and isinstance(attachments, list):
            f_payload = attachments[0].get("payload", {})
            f_url = f_payload.get("url") or ""
            f_name = f_payload.get("name") or "Tệp đính kèm"
            f_size = f_payload.get("size") or ""
            file_obj = {"url": f_url, "name": f_name, "size": f_size}
            message_text = f_name or "[Tệp đính kèm]"
    elif event_name == "user_send_sticker":
        msg_type = "sticker"
        if attachments and isinstance(attachments, list):
            img_url = attachments[0].get("payload", {}).get("url") or ""
        message_text = message_text or "[Sticker]"
    elif event_name == "user_send_audio":
        msg_type = "file"
        if attachments and isinstance(attachments, list):
            f_url = attachments[0].get("payload", {}).get("url") or ""
            file_obj = {"url": f_url, "name": "Voice.mp3", "mime": "audio/mp3"}
        message_text = message_text or "[Tin nhắn thoại]"
    elif event_name == "user_send_location":
        msg_type = "text"
        if attachments and isinstance(attachments, list):
            addr = attachments[0].get("payload", {}).get("address") or ""
            message_text = f"[Vị trí: {addr}]" if addr else "[Vị trí]"
    elif event_name == "user_send_link":
        msg_type = "text"
        if attachments and isinstance(attachments, list):
            l_url = attachments[0].get("payload", {}).get("url") or ""
            message_text = l_url or message_text or "[Đường dẫn]"

    if not message_text and not img_url and not file_obj:
        return json_response({"status": "received", "event": event_name}, status=200)

    if msg_id and _is_duplicate_message(msg_id):
        logger.info("Ignored duplicate Zalo message msg_id=%s", msg_id)
        return json_response({"status": "duplicate_skipped"}, status=200)

    # Fetch customer profile (display name, avatar, phone, address, gender, tags, notes) if possible
    passed_profile = data.get("user_profile") or {}
    customer_name = passed_profile.get("display_name") or passed_profile.get("name")
    customer_avatar = passed_profile.get("avatar") or ""
    customer_phone = str(passed_profile.get("phone") or (passed_profile.get("shared_info") or {}).get("phone") or "").strip()
    customer_address = passed_profile.get("address") or ""
    customer_gender = passed_profile.get("gender") or ""
    customer_is_follower = passed_profile.get("is_follower", False)
    customer_tags = passed_profile.get("tags") or []
    customer_notes = passed_profile.get("notes") or []

    if not customer_name or not customer_phone or not customer_avatar:
        customer_profile = await zalo_service.get_user_profile(user_id=sender_id, oa_id=oa_id)
        if customer_profile:
            if not customer_name:
                customer_name = customer_profile.get("display_name") or "Khách Zalo"
            if not customer_avatar:
                customer_avatar = customer_profile.get("avatar") or ""
            if not customer_phone and customer_profile.get("phone"):
                customer_phone = customer_profile.get("phone")
            if not customer_address and customer_profile.get("address"):
                customer_address = customer_profile.get("address")
            if not customer_gender and customer_profile.get("gender"):
                customer_gender = customer_profile.get("gender")
            if not customer_is_follower and customer_profile.get("is_follower"):
                customer_is_follower = customer_profile.get("is_follower")
            if not customer_tags and customer_profile.get("tags"):
                customer_tags = customer_profile.get("tags")
            if not customer_notes and customer_profile.get("notes"):
                customer_notes = customer_profile.get("notes")

    conversation_id = "zalo:{}:{}".format(oa_id or "default", sender_id)
    is_takeover = _is_takeover_active(oa_id, sender_id)
    is_handover_waiting = _is_handover_pending(oa_id, sender_id)
    bot_reply_text = ""
    status = "agent_handling" if is_takeover else ("needs_human" if is_handover_waiting else "bot_resolved")
    needs_human = False

    # Check if request comes from our external chatbot.gonplatform.com service
    is_from_bot_service = bool(data.get("from_bot_service") or data.get("from_chatbot"))
    incoming_bot_reply = str(data.get("bot_reply") or data.get("bot_reply_text") or "").strip()
    is_out_of_scope_payload = bool(data.get("is_out_of_scope") or data.get("needs_human"))

    if is_from_bot_service:
        bot_reply_text = incoming_bot_reply
        if is_takeover:
            status = "agent_handling"
            needs_human = True
        elif is_out_of_scope_payload:
            status = "needs_human"
            needs_human = True
            _set_handover_pending(oa_id, sender_id, active=True)
        elif incoming_bot_reply:
            status = "bot_resolved"
            needs_human = False
        elif is_handover_waiting:
            status = "needs_human"
            needs_human = True
        else:
            status = "bot_resolved"
            needs_human = False
    elif is_takeover:
        # NHANH 1: Nhan vien CSKH dang tiep quan (Takeover Active) -> Bot tam ngung, chuyen thang ve ViChat
        logger.info("Human takeover active for Zalo user=%s oa=%s; bot paused, routing to ViChat agent.", sender_id, oa_id)
        status = "agent_handling"
        needs_human = True
    elif is_handover_waiting:
        # Khach da duoc gui thong bao chuyen tiep va dang doi nhan vien rep -> Bot im lang, khong spam loi chao lap lai
        logger.info("Pending handover active for Zalo user=%s oa=%s; customer awaiting agent, routing to ViChat agent.", sender_id, oa_id)
        status = "needs_human"
        needs_human = True
    elif chatbot_service.enabled:
        # NHANH 2 & 3: Chatbot AI tu dong tra loi truoc (Bot-First)
        is_human_request = any(keyword in message_text.lower() for keyword in HUMAN_INTENT_KEYWORDS)

        if is_human_request:
            logger.info("Customer %s explicitly requested human agent.", sender_id)
            status = "needs_human"
            needs_human = True
            bot_reply_text = HANDOVER_COURTESY_MESSAGE
            _set_handover_pending(oa_id, sender_id, active=True)
            await zalo_service.send_cs_message(user_id=sender_id, message_text=bot_reply_text, oa_id=oa_id)
        else:
            try:
                user_context = {
                    "name": customer_name,
                    "uid": sender_id,
                    "channel": "zalo_oa",
                    "oa_id": oa_id,
                    "avatar": customer_avatar,
                }

                bot_response = await chatbot_service.reply(
                    message=message_text,
                    conversation_id=conversation_id,
                    user=user_context,
                )

                if _is_out_of_scope(message_text, bot_response):
                    # Ngoai vung cua bot -> Gui loi chao dieu huong va day ve ViChat cho nhan vien
                    logger.info("Bot reply out-of-scope for Zalo user=%s; routing to ViChat agent.", sender_id)
                    status = "needs_human"
                    needs_human = True
                    bot_reply_text = HANDOVER_COURTESY_MESSAGE
                    _set_handover_pending(oa_id, sender_id, active=True)
                    await zalo_service.send_cs_message(user_id=sender_id, message_text=bot_reply_text, oa_id=oa_id)
                else:
                    # Trong vung cua bot -> Bot tra loi tu dong
                    bot_reply_text = str((bot_response or {}).get("reply") or "").strip()
                    status = "bot_resolved"
                    needs_human = False
                    send_result = await zalo_service.send_cs_message(
                        user_id=sender_id,
                        message_text=bot_reply_text,
                        oa_id=oa_id,
                    )
                    logger.info(
                        "Bot auto-reply sent to Zalo user=%s success=%s",
                        sender_id,
                        send_result.get("success"),
                    )
            except Exception as exc:
                logger.error("Error during Bot auto-reply for Zalo: %s", exc)
                status = "needs_human"
                needs_human = True
                bot_reply_text = HANDOVER_COURTESY_MESSAGE
                _set_handover_pending(oa_id, sender_id, active=True)
                await zalo_service.send_cs_message(user_id=sender_id, message_text=bot_reply_text, oa_id=oa_id)

    # Ensure Tinode topic exists for this Zalo conversation
    tinode_topic = ""
    try:
        tinode_topic = await get_or_create_zalo_tinode_topic(
            app=app,
            oa_id=oa_id,
            sender_id=sender_id,
            customer_name=customer_name or "Khách Zalo",
            tenant_id=tenant_id,
        )
    except Exception as t_exc:
        logger.warning("Could not get or create Tinode topic for Zalo %s: %s", conversation_id, t_exc)

    # Persist customer message to conversation history
    cust_msg = {
        "id": msg_id or "zalo_msg_{}".format(int(time.time() * 1000)),
        "type": msg_type,
        "sender": "incoming",
        "senderId": sender_id,
        "senderName": customer_name,
        "text": message_text,
        "createdAt": datetime.utcnow().isoformat() + "Z",
        "timestamp": time.time(),
        "channel": "zalo_oa",
    }
    if img_url:
        cust_msg["image"] = img_url
    if file_obj:
        cust_msg["file"] = file_obj
    _append_zalo_message(conversation_id, cust_msg)

    if tinode_topic and (message_text or img_url or file_obj):
        safe_async_publish_to_tinode(
            app=app,
            topic=tinode_topic,
            text=message_text or ("[Hình ảnh: {}]".format(img_url) if img_url else "[Đính kèm]"),
            sender_name=customer_name or "Khách Zalo",
            is_bot=False,
            is_agent=False,
        )

    # If bot replied (or courtesy message sent), persist bot message to conversation history
    if bot_reply_text:
        _append_zalo_message(conversation_id, {
            "id": "bot_{}".format(int(time.time() * 1000)),
            "type": "text",
            "sender": "outgoing",
            "senderId": "bot",
            "senderName": "Chatbot AI",
            "text": bot_reply_text,
            "createdAt": datetime.utcnow().isoformat() + "Z",
            "timestamp": time.time(),
            "isBot": True,
            "channel": "zalo_oa",
        })
        if tinode_topic:
            safe_async_publish_to_tinode(
                app=app,
                topic=tinode_topic,
                text=bot_reply_text,
                sender_name="Chatbot AI",
                is_bot=True,
                is_agent=False,
            )

    # Broadcast event & sync conversation metadata for ViChat Web & Mobile
    if redisdb is not None:
        try:
            sync_payload = {
                "event": "message",
                "channel": "zalo_oa",
                "oa_id": oa_id,
                "tenant_id": tenant_id,
                "conversation_id": conversation_id,
                "tinode_topic": tinode_topic or None,
                "tinodeTopic": tinode_topic or None,
                "sender_id": sender_id,
                "sender_name": customer_name,
                "avatar": customer_avatar,
                "customer_message": message_text,
                "bot_reply": bot_reply_text or None,
                "status": status,
                "needs_human": needs_human,
                "timestamp": time.time(),
                "type": msg_type,
            }
            if img_url:
                sync_payload["image"] = img_url
            if file_obj:
                sync_payload["file"] = file_obj
            redisdb.publish("vichat:omnichannel:events", json.dumps(sync_payload))
            existing_raw = redisdb.get("zalo:conversation:{}".format(conversation_id))
            existing_conv = json.loads(existing_raw.decode("utf-8") if isinstance(existing_raw, bytes) else existing_raw) if existing_raw else {}

            merged_phone = customer_phone or existing_conv.get("phone") or ""
            merged_address = customer_address or existing_conv.get("address") or ""
            merged_gender = customer_gender or existing_conv.get("gender") or ""
            merged_is_follower = customer_is_follower if customer_is_follower is not None else existing_conv.get("is_follower", False)
            merged_tags = customer_tags or existing_conv.get("tags") or []
            merged_notes = customer_notes or existing_conv.get("notes") or []

            conv_payload = {
                "id": conversation_id,
                "oa_id": oa_id,
                "oa_name": oa_name,
                "tenant_id": tenant_id,
                "tinode_topic": tinode_topic or existing_conv.get("tinode_topic") or None,
                "tinodeTopic": tinode_topic or existing_conv.get("tinodeTopic") or None,
                "channel": "zalo_oa",
                "channelType": "zalo_oa",
                "name": customer_name or existing_conv.get("name") or "Khách Zalo",
                "avatar": customer_avatar or existing_conv.get("avatar") or "",
                "phone": merged_phone,
                "address": merged_address,
                "gender": merged_gender,
                "is_follower": merged_is_follower,
                "tags": merged_tags,
                "notes": merged_notes,
                "workflow_stage": existing_conv.get("workflow_stage") or "new",
                "assigned_agent_id": existing_conv.get("assigned_agent_id") or None,
                "assigned_agent_name": existing_conv.get("assigned_agent_name") or None,
                "last_message": bot_reply_text or message_text,
                "status": status,
                "needs_human": needs_human,
                "updated_at": time.time(),
            }
            if hasattr(redisdb, "pipeline"):
                pipe_conv = redisdb.pipeline()
                pipe_conv.setex("zalo:conversation:{}".format(conversation_id), 86400 * 30, json.dumps(conv_payload))
                pipe_conv.sadd("zalo:conversations:index:{}".format(tenant_id), conversation_id)
                pipe_conv.sadd("zalo:conversations:index", conversation_id)
                pipe_conv.execute()
            else:
                redisdb.setex("zalo:conversation:{}".format(conversation_id), 86400 * 30, json.dumps(conv_payload))
                redisdb.sadd("zalo:conversations:index:{}".format(tenant_id), conversation_id)
                redisdb.sadd("zalo:conversations:index", conversation_id)
        except Exception as sync_exc:
            logger.warning("Failed to sync omnichannel conversation to Redis: %s", sync_exc)

    return json_response({
        "status": "processed",
        "event": event_name,
        "customer": customer_name,
        "oa_id": oa_id,
        "oa_name": oa_name,
        "tenant_id": tenant_id,
        "reply": bot_reply_text,
        "needs_human": needs_human,
        "conversation_status": status,
        "takeover": is_takeover,
        "is_handover_waiting": is_handover_waiting,
        "conversation_id": conversation_id,
    }, status=200)



@app.route("/api/v1/zalo/token/sync", methods=["POST"])
async def zalo_sync_token(request):
    """Sync or force refresh Zalo OA access tokens."""
    data = request.json or {}
    oa_id = str(data.get("oa_id") or app.config.get("ZALO_OA_ID") or "").strip()
    at = str(data.get("access_token") or "").strip()
    rt = str(data.get("refresh_token") or "").strip()

    if at and rt:
        zalo_service.token_manager.persist_tokens(access_token=at, refresh_token=rt, oa_id=oa_id)
        try:
            from pymongo import MongoClient
            m_client = MongoClient("mongodb://192.168.80.37:27017", serverSelectionTimeoutMS=1500)
            new_expire = int(time.time()) + 90000
            m_client.evandb.bot.update_one(
                {"oa_id": oa_id},
                {"$set": {
                    "access_token": at,
                    "refresh_token": rt,
                    "token_expire_time": new_expire,
                    "expired_time": new_expire,
                    "token_expires_in_seconds": 90000,
                }}
            )
            logger.info("Synchronized Zalo token to Chatbot MongoDB for OA %s", oa_id)
        except Exception as m_exc:
            logger.warning("Could not sync Zalo token to MongoDB: %s", m_exc)

        return json_response({
            "status": "success",
            "message": "Đã đồng bộ token mới thành công",
            "oa_id": oa_id,
        }, status=200)

    # If no new tokens provided, trigger auto-refresh using current RT
    rt_key = zalo_service.token_manager._get_key("rt", oa_id)
    rt_data = zalo_service.token_manager._redis_get(rt_key)
    if rt_data and rt_data.get("token"):
        refreshed = zalo_service.token_manager.refresh_token(rt_data["token"], oa_id=oa_id)
        if refreshed:
            return json_response({
                "status": "success",
                "message": "Đã làm mới token từ Refresh Token thành công",
                "oa_id": oa_id,
            }, status=200)

    return json_response({
        "status": "failed",
        "message": "Không thể làm mới token. Vui lòng cung cấp access_token và refresh_token mới hoặc kiểm tra ZALO_SECRET_KEY.",
    }, status=400)


@app.route("/api/v1/zalo/authorize", methods=["GET"])
async def zalo_authorize(request):
    """Initiates OAuth PKCE authorization for a partner/tenant OA."""
    app_id = str(app.config.get("ZALO_APP_ID") or "").strip()
    if not app_id:
        return json_response({"error": "ZALO_APP_ID is not configured"}, status=500)

    redirect_uri = str(app.config.get("ZALO_REDIRECT_URI") or "").strip()
    if not redirect_uri:
        # Construct fallback redirect URI
        host = request.headers.get("Host") or "localhost:8093"
        scheme = "https" if request.scheme == "https" or "https" in request.headers.get("X-Forwarded-Proto", "") else "http"
        redirect_uri = "{}://{}/api/v1/zalo/callback".format(scheme, host)

    state = str(request.args.get("state") or request.args.get("tenant_id") or "default").strip()
    code_verifier = generate_code_verifier()
    code_challenge = generate_code_challenge(code_verifier)

    # Store verifier in Redis for callback matching
    if redisdb is not None:
        redisdb.setex("zalo:verifier:{}".format(state), 600, code_verifier)

    auth_url = build_authorization_url(
        app_id=app_id,
        redirect_uri=redirect_uri,
        code_challenge=code_challenge,
        state=state,
    )
    return redirect(auth_url)


@app.route("/api/v1/zalo/callback", methods=["GET"])
async def zalo_callback(request):
    """Callback receiver from Zalo OAuth PKCE."""
    code = request.args.get("code")
    oa_id = request.args.get("oa_id")
    state = request.args.get("state") or "default"

    if not code:
        return json_response({"error": "Missing code parameter"}, status=400)

    code_verifier = ""
    if redisdb is not None:
        raw = redisdb.get("zalo:verifier:{}".format(state))
        if raw:
            code_verifier = raw.decode("utf-8") if isinstance(raw, bytes) else raw

    if not code_verifier:
        code_verifier = app.config.get("ZALO_CODE_VERIFIER") or ""

    if not code_verifier:
        return json_response({"error": "Missing code_verifier for OAuth PKCE"}, status=400)

    token = zalo_service.token_manager.init_with_code(code, code_verifier, oa_id=oa_id)
    if token:
        logger.info("Successfully linked Zalo OA id=%s state=%s", oa_id, state)
        return json_response({
            "status": "success",
            "message": "Liên kết Zalo OA thành công",
            "oa_id": oa_id,
            "tenant_id": state,
        }, status=200)

    return json_response({"status": "failed", "message": "Không thể lấy access token từ Zalo"}, status=500)


@app.route("/api/v1/zalo/send_message", methods=["POST"])
async def zalo_send_message_manual(request):
    """Endpoint for ViChat human agents to reply to a Zalo OA customer with tenant check."""
    tenant_id = _extract_request_tenant(request)
    if not tenant_id:
        return json_response({"error": "Unauthorized: Tenant identification required"}, status=401)

    data = request.json or {}
    user_id = str(data.get("user_id") or "").strip()
    message = str(data.get("message") or "").strip()
    oa_id = str(data.get("oa_id") or app.config.get("ZALO_OA_ID") or "").strip()
    agent_name = str(data.get("agent_name") or "Nhân viên CSKH").strip()

    if not user_id or not message:
        return json_response({"error": "Missing user_id or message"}, status=400)

    conversation_id = "zalo:{}:{}".format(oa_id or "default", user_id)
    # Check conversation tenant authorization
    if redisdb is not None:
        raw_conv = redisdb.get("zalo:conversation:{}".format(conversation_id))
        if raw_conv:
            conv_obj = json.loads(raw_conv.decode("utf-8") if isinstance(raw_conv, bytes) else raw_conv)
            conv_tenant = conv_obj.get("tenant_id")
            if conv_tenant and conv_tenant != tenant_id:
                logger.warning("Tenant mismatch on send_message: user_tenant=%s conv_tenant=%s", tenant_id, conv_tenant)
                return json_response({"error": "Forbidden: You do not have permission to reply on this conversation"}, status=403)

    if user_id.startswith("test_") or user_id.startswith("sim_"):
        result = {
            "success": True,
            "message": "Tin nhắn đã gửi thành công (Môi trường kiểm thử Gonstack)",
            "test_mode": True,
        }
    else:
        result = await zalo_service.send_cs_message(
            user_id=user_id,
            message_text=message,
            oa_id=oa_id,
        )

    if result.get("success"):
        sent_msg_id = str(result.get("message_id") or result.get("msg_id") or "").strip()
        if sent_msg_id:
            _is_duplicate_message(sent_msg_id)

        conversation_id = "zalo:{}:{}".format(oa_id or "default", user_id)
        # Activate Human Takeover: Mute bot for this user for 30 minutes
        _set_takeover_active(oa_id, user_id, active=True, ttl=TAKEOVER_TTL_SECONDS)
        _set_handover_pending(oa_id, user_id, active=False)

        # Ensure Tinode topic exists
        tinode_topic = ""
        try:
            target_cust_name = "Khách Zalo"
            if redisdb is not None:
                raw_conv_preview = redisdb.get("zalo:conversation:{}".format(conversation_id))
                if raw_conv_preview:
                    preview_obj = json.loads(raw_conv_preview.decode("utf-8") if isinstance(raw_conv_preview, bytes) else raw_conv_preview)
                    target_cust_name = preview_obj.get("name") or "Khách Zalo"

            tinode_topic = await get_or_create_zalo_tinode_topic(
                app,
                oa_id=oa_id,
                sender_id=user_id,
                customer_name=target_cust_name,
                tenant_id=tenant_id,
            )
        except Exception as t_exc:
            logger.warning("Could not get or create Tinode topic for manual send: %s", t_exc)

        # Persist agent outgoing message to conversation history
        _append_zalo_message(conversation_id, {
            "id": sent_msg_id or "agent_{}".format(int(time.time() * 1000)),
            "type": "text",
            "sender": "outgoing",
            "senderId": str(data.get("agent_id") or "agent"),
            "senderName": agent_name,
            "text": message,
            "createdAt": datetime.utcnow().isoformat() + "Z",
            "timestamp": time.time(),
            "channel": "zalo_oa",
        })

        if tinode_topic:
            safe_async_publish_to_tinode(
                app,
                topic=tinode_topic,
                text=message,
                sender_name=agent_name,
                is_bot=False,
                is_agent=True,
            )

        if redisdb is not None:
            try:
                raw_conv = redisdb.get("zalo:conversation:{}".format(conversation_id))
                conv_data = json.loads(raw_conv.decode("utf-8") if isinstance(raw_conv, bytes) else raw_conv) if raw_conv else {}
                conv_data.update({
                    "id": conversation_id,
                    "channel": "zalo_oa",
                    "channelType": "zalo_oa",
                    "last_message": message,
                    "status": "agent_handling",
                    "needs_human": False,
                    "updated_at": time.time(),
                    "tinode_topic": tinode_topic or conv_data.get("tinode_topic"),
                    "tinodeTopic": tinode_topic or conv_data.get("tinodeTopic"),
                })
                redisdb.setex("zalo:conversation:{}".format(conversation_id), 86400 * 30, json.dumps(conv_data))
                redisdb.sadd("zalo:conversations:index:{}".format(tenant_id), conversation_id)
                redisdb.sadd("zalo:conversations:index", conversation_id)

                sync_payload = {
                    "event": "agent_message",
                    "channel": "zalo_oa",
                    "oa_id": oa_id,
                    "tenant_id": tenant_id,
                    "conversation_id": conversation_id,
                    "tinode_topic": tinode_topic or None,
                    "tinodeTopic": tinode_topic or None,
                    "sender_id": user_id,
                    "agent_name": agent_name,
                    "message": message,
                    "status": "agent_handling",
                    "timestamp": time.time(),
                }
                redisdb.publish("vichat:omnichannel:events", json.dumps(sync_payload))
            except Exception as exc:
                logger.warning("Redis update on send_message failed: %s", exc)

    status_code = 200 if result.get("success") else 400
    if not result.get("success") and result.get("needs_auth"):
        result["auth_url"] = "https://oauth.zaloapp.com/v4/oa/permission?app_id=2715625416765116880&redirect_uri=https://chatbot.gonplatform.com/zalo/auth"
    return json_response(result, status=status_code)


@app.route("/api/v1/zalo/auth_url", methods=["GET"])
async def zalo_get_auth_url(request):
    """Returns the direct OAuth authorization URL for the user to authorize/relink Zalo OA."""
    oa_id = str(request.args.get("oa_id") or "2274336170816480019").strip()
    try:
        url = "http://192.168.80.154:10000/zalo/generate_auth_url?bot_id=6aa0db41a322a9f77b8d6169"
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("auth_url"):
                return json_response({"status": "success", "auth_url": data["auth_url"], "oa_id": oa_id}, status=200)
    except Exception as exc:
        logger.warning("Failed to fetch auth_url from chatbot: %s", exc)

    auth_url = "https://oauth.zaloapp.com/v4/oa/permission?app_id=2715625416765116880&redirect_uri=https://chatbot.gonplatform.com/zalo/auth"
    return json_response({"status": "success", "auth_url": auth_url, "oa_id": oa_id}, status=200)


@app.route("/api/v1/zalo/conversation/assign", methods=["POST"])
async def zalo_assign_agent(request):
    """Assign or unassign an agent to handle a Zalo conversation."""
    tenant_id = _extract_request_tenant(request)
    if not tenant_id:
        return json_response({"error": "Unauthorized: Tenant identification required"}, status=401)

    data = request.json or {}
    conversation_id = str(data.get("conversation_id") or "").strip()
    agent_id = str(data.get("agent_id") or "").strip()
    agent_name = str(data.get("agent_name") or "").strip()

    if not conversation_id:
        return json_response({"error": "Missing conversation_id"}, status=400)

    if redisdb is not None:
        raw_conv = redisdb.get("zalo:conversation:{}".format(conversation_id))
        if raw_conv:
            conv_obj = json.loads(raw_conv.decode("utf-8") if isinstance(raw_conv, bytes) else raw_conv)
            conv_tenant = conv_obj.get("tenant_id")
            if conv_tenant and conv_tenant != tenant_id:
                return json_response({"error": "Forbidden: Tenant mismatch"}, status=403)

            conv_obj["assigned_agent_id"] = agent_id or None
            conv_obj["assigned_agent_name"] = agent_name or None
            conv_obj["updated_at"] = time.time()
            redisdb.setex("zalo:conversation:{}".format(conversation_id), 86400 * 30, json.dumps(conv_obj))

            sync_payload = {
                "event": "conversation_assigned",
                "conversation_id": conversation_id,
                "tenant_id": tenant_id,
                "assigned_agent_id": agent_id,
                "assigned_agent_name": agent_name,
                "timestamp": time.time(),
            }
            redisdb.publish("vichat:omnichannel:events", json.dumps(sync_payload))
            return json_response({
                "status": "success",
                "conversation_id": conversation_id,
                "assigned_agent_id": agent_id,
                "assigned_agent_name": agent_name,
            }, status=200)

    return json_response({"error": "Conversation not found"}, status=404)


@app.route("/api/v1/zalo/conversation/workflow", methods=["POST"])
async def zalo_update_workflow(request):
    """Update workflow stage (e.g. new, in_progress, pending, completed) and tags for a Zalo conversation."""
    tenant_id = _extract_request_tenant(request)
    if not tenant_id:
        return json_response({"error": "Unauthorized: Tenant identification required"}, status=401)

    data = request.json or {}
    conversation_id = str(data.get("conversation_id") or "").strip()
    workflow_stage = str(data.get("workflow_stage") or "").strip()
    tags = data.get("tags") or []

    if not conversation_id:
        return json_response({"error": "Missing conversation_id"}, status=400)

    if redisdb is not None:
        raw_conv = redisdb.get("zalo:conversation:{}".format(conversation_id))
        if raw_conv:
            conv_obj = json.loads(raw_conv.decode("utf-8") if isinstance(raw_conv, bytes) else raw_conv)
            conv_tenant = conv_obj.get("tenant_id")
            if conv_tenant and conv_tenant != tenant_id:
                return json_response({"error": "Forbidden: Tenant mismatch"}, status=403)

            if workflow_stage:
                conv_obj["workflow_stage"] = workflow_stage
                if workflow_stage == "completed":
                    conv_obj["status"] = "bot_resolved"
                    conv_obj["needs_human"] = False
                    _set_takeover_active(conv_obj.get("oa_id"), conversation_id.split(":")[-1], active=False)
                elif workflow_stage == "in_progress":
                    conv_obj["status"] = "agent_handling"
                    conv_obj["needs_human"] = True

            if isinstance(tags, list):
                conv_obj["tags"] = tags
            conv_obj["updated_at"] = time.time()
            redisdb.setex("zalo:conversation:{}".format(conversation_id), 86400 * 30, json.dumps(conv_obj))

            sync_payload = {
                "event": "conversation_workflow_updated",
                "conversation_id": conversation_id,
                "tenant_id": tenant_id,
                "workflow_stage": workflow_stage,
                "tags": tags,
                "timestamp": time.time(),
            }
            redisdb.publish("vichat:omnichannel:events", json.dumps(sync_payload))
            return json_response({
                "status": "success",
                "conversation_id": conversation_id,
                "workflow_stage": workflow_stage,
                "tags": tags,
            }, status=200)

    return json_response({"error": "Conversation not found"}, status=404)


@app.route("/api/v1/zalo/takeover", methods=["POST"])
async def zalo_toggle_takeover(request):
    """Allows ViChat human agents to explicitly take over or release the bot with tenant check."""
    tenant_id = _extract_request_tenant(request)
    if not tenant_id:
        return json_response({"error": "Unauthorized: Tenant identification required"}, status=401)

    data = request.json or {}
    user_id = str(data.get("user_id") or "").strip()
    oa_id = str(data.get("oa_id") or app.config.get("ZALO_OA_ID") or "").strip()
    action = str(data.get("action") or "takeover").strip().lower()  # "takeover" or "release"

    if not user_id:
        return json_response({"error": "Missing user_id"}, status=400)

    conversation_id = "zalo:{}:{}".format(oa_id or "default", user_id)
    if redisdb is not None:
        raw_conv = redisdb.get("zalo:conversation:{}".format(conversation_id))
        if raw_conv:
            conv_obj = json.loads(raw_conv.decode("utf-8") if isinstance(raw_conv, bytes) else raw_conv)
            conv_tenant = conv_obj.get("tenant_id")
            if conv_tenant and conv_tenant != tenant_id:
                logger.warning("Tenant mismatch on takeover: user_tenant=%s conv_tenant=%s", tenant_id, conv_tenant)
                return json_response({"error": "Forbidden: Tenant mismatch"}, status=403)

    is_active = (action == "takeover")
    _set_takeover_active(oa_id, user_id, active=is_active)
    _set_handover_pending(oa_id, user_id, active=False)

    conversation_id = "zalo:{}:{}".format(oa_id or "default", user_id)
    if redisdb is not None:
        try:
            raw_conv = redisdb.get("zalo:conversation:{}".format(conversation_id))
            conv_data = json.loads(raw_conv.decode("utf-8") if isinstance(raw_conv, bytes) else raw_conv) if raw_conv else {}
            conv_data["status"] = "agent_handling" if is_active else "bot_resolved"
            conv_data["needs_human"] = is_active
            conv_data["updated_at"] = time.time()
            redisdb.setex("zalo:conversation:{}".format(conversation_id), 86400 * 30, json.dumps(conv_data))
            redisdb.sadd("zalo:conversations:index:{}".format(tenant_id), conversation_id)
        except Exception as exc:
            logger.warning("Redis update on takeover failed: %s", exc)

    return json_response({
        "status": "success",
        "user_id": user_id,
        "takeover_active": is_active,
        "message": "Đã tiếp quản hội thoại (Bot tạm dừng)" if is_active else "Đã trả lại hội thoại cho Bot",
    }, status=200)


@app.route("/api/v1/zalo/conversations", methods=["GET"])
async def zalo_list_conversations(request):
    """List active Zalo OA conversations with handover statuses scoped to current tenant."""
    tenant_id = _extract_request_tenant(request)
    if not tenant_id:
        return json_response({
            "status": "error",
            "message": "Tenant identification required",
            "total": 0,
            "conversations": [],
        }, status=401)

    limit = 100
    try:
        limit = int(request.args.get("limit", 100))
    except (ValueError, TypeError):
        pass

    conversations = _get_active_zalo_conversations_for_listing(tenant_id, limit=limit)
    return json_response({
        "status": "success",
        "tenant_id": tenant_id,
        "total": len(conversations),
        "conversations": conversations,
    }, status=200)


@app.route("/api/v1/zalo/conversations/<conversation_id>/messages", methods=["GET"])
async def zalo_conversation_messages(request, conversation_id):
    """Get message history for a specific Zalo conversation with tenant access check."""
    tenant_id = _extract_request_tenant(request)
    if not tenant_id:
        return json_response({"error": "Unauthorized: Tenant identification required"}, status=401)

    if redisdb is not None:
        raw_conv = redisdb.get("zalo:conversation:{}".format(conversation_id))
        if raw_conv:
            conv_obj = json.loads(raw_conv.decode("utf-8") if isinstance(raw_conv, bytes) else raw_conv)
            conv_tenant = conv_obj.get("tenant_id")
            if conv_tenant and conv_tenant != tenant_id:
                logger.warning("Tenant mismatch on get messages: user_tenant=%s conv_tenant=%s", tenant_id, conv_tenant)
                return json_response({"error": "Forbidden: You do not have access to this conversation"}, status=403)

    limit = 100
    try:
        limit = int(request.args.get("limit", 100))
    except (ValueError, TypeError):
        pass
    messages = _get_zalo_messages(conversation_id, limit=limit)
    tinode_topic = ""
    if redisdb is not None:
        try:
            cached_t = redisdb.get("zalo:tinode_topic:{}".format(conversation_id))
            if cached_t:
                tinode_topic = (cached_t.decode("utf-8") if isinstance(cached_t, bytes) else str(cached_t)).strip()
        except Exception:
            pass

    if not tinode_topic:
        parts = conversation_id.split(":")
        if len(parts) >= 3:
            try:
                raw_conv = redisdb.get("zalo:conversation:{}".format(conversation_id)) if redisdb else None
                conv_obj = json.loads(raw_conv.decode("utf-8") if isinstance(raw_conv, bytes) else raw_conv) if raw_conv else {}
                asyncio.create_task(get_or_create_zalo_tinode_topic(
                    app=app,
                    oa_id=parts[1],
                    sender_id=parts[2],
                    customer_name=conv_obj.get("name") or "Khách Zalo",
                    tenant_id=tenant_id,
                ))
            except Exception:
                pass

    return json_response({
        "status": "success",
        "conversation_id": conversation_id,
        "tenant_id": tenant_id,
        "tinode_topic": tinode_topic or None,
        "tinodeTopic": tinode_topic or None,
        "total": len(messages),
        "messages": messages,
    }, status=200)


@app.route("/api/v1/zalo/conversation/sync_profile", methods=["POST"])
async def zalo_sync_profile(request):
    """Sync customer profile on demand from live Zalo OA and Chatbot database."""
    tenant_id = _extract_request_tenant(request)
    if not tenant_id:
        return json_response({"error": "Unauthorized: Tenant identification required"}, status=401)

    data = request.json or {}
    conversation_id = str(data.get("conversation_id") or "").strip()
    if not conversation_id:
        return json_response({"error": "Missing conversation_id"}, status=400)

    parts = conversation_id.split(":")
    oa_id = parts[1] if len(parts) >= 3 else ""
    user_id = parts[2] if len(parts) >= 3 else ""

    profile = await zalo_service.get_user_profile(user_id=user_id, oa_id=oa_id) or {}

    # Check Chatbot MongoDB on 192.168.80.37 for contact info as secondary source
    try:
        from pymongo import MongoClient
        m_client = MongoClient("mongodb://192.168.80.37:27017", serverSelectionTimeoutMS=1500)
        c_doc = m_client.evandb.contact.find_one({"id": user_id})
        if c_doc:
            if not profile.get("phone") and c_doc.get("phone"):
                profile["phone"] = str(c_doc["phone"])
            if not profile.get("address") and c_doc.get("shared_info"):
                s_info = c_doc["shared_info"]
                addr_parts = [s_info.get("address"), s_info.get("district"), s_info.get("city")]
                full_addr = ", ".join([str(p).strip() for p in addr_parts if p and str(p).strip()])
                if full_addr:
                    profile["address"] = full_addr
            if not profile.get("gender") and c_doc.get("gender"):
                profile["gender"] = c_doc["gender"]
            if not profile.get("avatar") and c_doc.get("profile_pic"):
                profile["avatar"] = c_doc["profile_pic"]
    except Exception as m_exc:
        logger.debug("Chatbot mongo lookup skipped during profile sync: %s", m_exc)

    if redisdb is not None:
        raw_conv = redisdb.get("zalo:conversation:{}".format(conversation_id))
        conv_obj = json.loads(raw_conv.decode("utf-8") if isinstance(raw_conv, bytes) else raw_conv) if raw_conv else {}
        if profile.get("display_name"):
            conv_obj["name"] = profile["display_name"]
        if profile.get("avatar"):
            conv_obj["avatar"] = profile["avatar"]
        if profile.get("phone"):
            conv_obj["phone"] = profile["phone"]
        if profile.get("address"):
            conv_obj["address"] = profile["address"]
        if profile.get("gender"):
            conv_obj["gender"] = profile["gender"]
        if "is_follower" in profile:
            conv_obj["is_follower"] = profile["is_follower"]
        if profile.get("tags"):
            conv_obj["tags"] = profile["tags"]
        if profile.get("notes"):
            conv_obj["notes"] = profile["notes"]
        conv_obj["updated_at"] = time.time()
        redisdb.setex("zalo:conversation:{}".format(conversation_id), 86400 * 30, json.dumps(conv_obj))

    return json_response({
        "status": "success",
        "conversation_id": conversation_id,
        "profile": profile,
    }, status=200)


OMNICHANNEL_CHANNEL = "vichat:omnichannel:events"


def _omnichannel_sse_chunk(event_name: str, payload: dict) -> str:
    return "event: {}\ndata: {}\n\n".format(event_name, json.dumps(payload, ensure_ascii=False))


@app.route("/api/v1/omnichannel/stream", methods=["GET"])
async def omnichannel_event_stream(request):
    """Realtime Server-Sent Events (SSE) stream bridging Redis Pub/Sub to Web & Mobile clients."""
    tenant_id = _extract_request_tenant(request)
    if not tenant_id:
        return json_response({"error": "Unauthorized: Tenant identification required"}, status=401)

    async def streaming_fn(response):
        loop = asyncio.get_event_loop()
        pubsub = None
        try:
            if redisdb is not None:
                pubsub = await loop.run_in_executor(None, functools.partial(redisdb.pubsub))
                await loop.run_in_executor(None, functools.partial(pubsub.subscribe, OMNICHANNEL_CHANNEL))

            # Send initial connected handshake
            await response.write(_omnichannel_sse_chunk("connected", {
                "status": "connected",
                "tenant_id": tenant_id,
                "timestamp": time.time(),
            }))

            last_ping_at = loop.time()

            while True:
                drained_messages = []
                if pubsub is not None:
                    try:
                        # Drain up to 100 pending messages from Redis pubsub buffer without sleeping
                        for _ in range(100):
                            msg = pubsub.get_message(ignore_subscribe_messages=True, timeout=0)
                            if not msg:
                                break
                            drained_messages.append(msg)
                    except Exception as err:
                        logger.warning("Error fetching from pubsub: %s", err)

                if drained_messages:
                    chunks = []
                    for message in drained_messages:
                        if message and message.get("data"):
                            raw_data = message.get("data")
                            if isinstance(raw_data, bytes):
                                raw_data = raw_data.decode("utf-8")
                            try:
                                payload = json.loads(raw_data) if isinstance(raw_data, str) else raw_data
                                event_tenant = payload.get("tenant_id")
                                if not event_tenant or event_tenant == tenant_id:
                                    event_type = str(payload.get("event") or "message")
                                    chunks.append(_omnichannel_sse_chunk(event_type, payload))
                            except Exception as parse_err:
                                logger.warning("Failed to parse omnichannel stream message: %s", parse_err)
                    if chunks:
                        await response.write("".join(chunks))
                    # Short yield to allow other async coroutines to execute during high-volume bursts
                    await asyncio.sleep(0.01)
                else:
                    # Low-latency idle sleep when no pending messages
                    await asyncio.sleep(0.1)

                if loop.time() - last_ping_at >= 15:
                    await response.write(": keep-alive\n\n")
                    last_ping_at = loop.time()
        except Exception:
            return
        finally:
            if pubsub is not None:
                try:
                    await loop.run_in_executor(None, pubsub.close)
                except Exception:
                    pass

    return stream(
        streaming_fn,
        content_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.listener("after_server_start")
async def _start_tinode_reply_listener_hook(app, loop):
    """Starts the background thread listening for staff replies in Tinode Web/Mobile."""
    try:
        from application.services.tinode_zalo_bridge import start_tinode_staff_reply_listener
        start_tinode_staff_reply_listener(app)
    except Exception as exc:
        logger.warning("Failed to start Tinode staff reply listener hook: %s", exc)





