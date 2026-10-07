"""Zalo OA Webhook and Bot-First Auto-reply Controller.
Handles inbound messages from Zalo OA, triggers Chatbot AI responses,
and provides OAuth authorization flow for partners.
"""

from datetime import datetime
import json
import logging
import time
from gatco.response import json as json_response, text as text_response
from sanic.response import redirect

from application.database import redisdb
from application.server import app
from application.services import ChatbotService, ZaloService
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
    """Store message into the conversation's message history in Redis."""
    if not conversation_id or not msg_payload:
        return
    key = "zalo:messages:{}".format(conversation_id)
    if redisdb is not None:
        try:
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


def _get_active_zalo_conversations_for_listing() -> list:
    """Returns active Zalo OA conversations in Conversation shape for Web & Mobile listing."""
    conversations = []
    if redisdb is None:
        return conversations
    try:
        members = redisdb.smembers("zalo:conversations:index") or []
        for raw_id in members:
            conv_id = raw_id.decode("utf-8") if isinstance(raw_id, bytes) else raw_id
            raw_data = redisdb.get("zalo:conversation:{}".format(conv_id))
            if raw_data:
                conv_obj = json.loads(raw_data.decode("utf-8") if isinstance(raw_data, bytes) else raw_data)
                parts = conv_id.split(":")
                oa_id = parts[1] if len(parts) >= 3 else ""
                user_id = parts[2] if len(parts) >= 3 else ""
                messages = _get_zalo_messages(conv_id, limit=50)

                conversations.append({
                    "id": conv_id,
                    "managementId": conv_id,
                    "tinodeTopic": conv_id,
                    "name": conv_obj.get("name") or "Khách Zalo",
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
                    "takeover_active": _is_takeover_active(oa_id, user_id),
                    "messages": messages,
                    "members": [
                        {
                            "id": user_id,
                            "name": conv_obj.get("name") or "Khách Zalo",
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
    oa_id = str(data.get("oa_id") or app.config.get("ZALO_OA_ID") or "").strip()
    sender = data.get("sender") or {}
    sender_id = str(sender.get("id") or data.get("fromuid") or "").strip()
    msg_obj = data.get("message") or {}
    msg_id = str(msg_obj.get("msg_id") or "").strip()
    message_text = str(msg_obj.get("text") or "").strip()

    logger.info("Zalo webhook received event=%s oa_id=%s sender=%s", event_name, oa_id, sender_id)

    # Fast ACK to Zalo within SLA
    if event_name != "user_send_text" or not sender_id or not message_text:
        return json_response({"status": "received", "event": event_name}, status=200)

    if _is_duplicate_message(msg_id):
        logger.info("Ignored duplicate Zalo message msg_id=%s", msg_id)
        return json_response({"status": "duplicate_skipped"}, status=200)

    # Fetch customer profile (display name, avatar) if possible
    customer_profile = await zalo_service.get_user_profile(user_id=sender_id, oa_id=oa_id)
    customer_name = (customer_profile or {}).get("display_name") or "Khách Zalo"
    customer_avatar = (customer_profile or {}).get("avatar") or ""

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

    # Persist customer message to conversation history
    _append_zalo_message(conversation_id, {
        "id": msg_id or "zalo_msg_{}".format(int(time.time() * 1000)),
        "type": "text",
        "sender": "incoming",
        "senderId": sender_id,
        "senderName": customer_name,
        "text": message_text,
        "createdAt": datetime.utcnow().isoformat() + "Z",
        "timestamp": time.time(),
        "channel": "zalo_oa",
    })

    # If bot replied (or courtesy message sent), persist bot message to conversation history
    if bot_reply_text:
        _append_zalo_message(conversation_id, {
            "id": "bot_{}".format(int(time.time() * 1000)),
            "type": "text",
            "sender": "incoming",
            "senderId": "bot",
            "senderName": "Chatbot AI",
            "text": bot_reply_text,
            "createdAt": datetime.utcnow().isoformat() + "Z",
            "timestamp": time.time(),
            "isBot": True,
            "channel": "zalo_oa",
        })

    # Broadcast event & sync conversation metadata for ViChat Web & Mobile
    if redisdb is not None:
        try:
            sync_payload = {
                "event": "message",
                "channel": "zalo_oa",
                "oa_id": oa_id,
                "conversation_id": conversation_id,
                "sender_id": sender_id,
                "sender_name": customer_name,
                "avatar": customer_avatar,
                "customer_message": message_text,
                "bot_reply": bot_reply_text or None,
                "status": status,
                "needs_human": needs_human,
                "timestamp": time.time(),
            }
            redisdb.publish("vichat:omnichannel:events", json.dumps(sync_payload))
            redisdb.setex(
                "zalo:conversation:{}".format(conversation_id),
                86400 * 7,
                json.dumps({
                    "id": conversation_id,
                    "channel": "zalo_oa",
                    "channelType": "zalo_oa",
                    "name": customer_name,
                    "avatar": customer_avatar,
                    "last_message": bot_reply_text or message_text,
                    "status": status,
                    "needs_human": needs_human,
                    "updated_at": time.time(),
                }),
            )
            redisdb.sadd("zalo:conversations:index", conversation_id)
        except Exception as sync_exc:
            logger.warning("Failed to sync omnichannel conversation to Redis: %s", sync_exc)

    return json_response({
        "status": "processed",
        "event": event_name,
        "customer": customer_name,
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
    """Endpoint for ViChat human agents to reply to a Zalo OA customer."""
    data = request.json or {}
    user_id = str(data.get("user_id") or "").strip()
    message = str(data.get("message") or "").strip()
    oa_id = str(data.get("oa_id") or app.config.get("ZALO_OA_ID") or "").strip()
    agent_name = str(data.get("agent_name") or "Nhân viên CSKH").strip()

    if not user_id or not message:
        return json_response({"error": "Missing user_id or message"}, status=400)

    result = await zalo_service.send_cs_message(
        user_id=user_id,
        message_text=message,
        oa_id=oa_id,
    )

    if result.get("success"):
        conversation_id = "zalo:{}:{}".format(oa_id or "default", user_id)
        # Activate Human Takeover: Mute bot for this user for 30 minutes
        _set_takeover_active(oa_id, user_id, active=True, ttl=TAKEOVER_TTL_SECONDS)
        _set_handover_pending(oa_id, user_id, active=False)

        # Persist agent outgoing message to conversation history
        _append_zalo_message(conversation_id, {
            "id": "agent_{}".format(int(time.time() * 1000)),
            "type": "text",
            "sender": "outgoing",
            "senderId": str(data.get("agent_id") or "agent"),
            "senderName": agent_name,
            "text": message,
            "createdAt": datetime.utcnow().isoformat() + "Z",
            "timestamp": time.time(),
            "channel": "zalo_oa",
        })

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
                })
                redisdb.setex("zalo:conversation:{}".format(conversation_id), 86400 * 7, json.dumps(conv_data))
                redisdb.sadd("zalo:conversations:index", conversation_id)

                sync_payload = {
                    "event": "agent_message",
                    "channel": "zalo_oa",
                    "oa_id": oa_id,
                    "conversation_id": conversation_id,
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
    return json_response(result, status=status_code)


@app.route("/api/v1/zalo/takeover", methods=["POST"])
async def zalo_toggle_takeover(request):
    """Allows ViChat human agents to explicitly take over or release the bot."""
    data = request.json or {}
    user_id = str(data.get("user_id") or "").strip()
    oa_id = str(data.get("oa_id") or app.config.get("ZALO_OA_ID") or "").strip()
    action = str(data.get("action") or "takeover").strip().lower()  # "takeover" or "release"

    if not user_id:
        return json_response({"error": "Missing user_id"}, status=400)

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
            redisdb.setex("zalo:conversation:{}".format(conversation_id), 86400 * 7, json.dumps(conv_data))
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
    """List active Zalo OA conversations with handover statuses for ViChat UI."""
    conversations = []
    if redisdb is not None:
        try:
            members = redisdb.smembers("zalo:conversations:index") or []
            for raw_id in members:
                conv_id = raw_id.decode("utf-8") if isinstance(raw_id, bytes) else raw_id
                raw_data = redisdb.get("zalo:conversation:{}".format(conv_id))
                if raw_data:
                    conv_obj = json.loads(raw_data.decode("utf-8") if isinstance(raw_data, bytes) else raw_data)
                    # Check live takeover state
                    parts = conv_id.split(":")
                    if len(parts) >= 3:
                        conv_oa, conv_user = parts[1], parts[2]
                        conv_obj["takeover_active"] = _is_takeover_active(conv_oa, conv_user)
                    conv_obj["messages"] = _get_zalo_messages(conv_id, limit=30)
                    conversations.append(conv_obj)
        except Exception as exc:
            logger.warning("Failed to list Zalo conversations from Redis: %s", exc)

    conversations.sort(key=lambda x: x.get("updated_at", 0), reverse=True)
    return json_response({
        "status": "success",
        "total": len(conversations),
        "conversations": conversations,
    }, status=200)


@app.route("/api/v1/zalo/conversations/<conversation_id>/messages", methods=["GET"])
async def zalo_conversation_messages(request, conversation_id):
    """Get message history for a specific Zalo conversation."""
    limit = 100
    try:
        limit = int(request.args.get("limit", 100))
    except (ValueError, TypeError):
        pass
    messages = _get_zalo_messages(conversation_id, limit=limit)
    return json_response({
        "status": "success",
        "conversation_id": conversation_id,
        "total": len(messages),
        "messages": messages,
    }, status=200)


