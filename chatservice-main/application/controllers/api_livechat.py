"""Livechat Widget Ingress, Management and Bidirectional Bridge Controller.
Connects the website livechat widget (from chatbot.gonplatform.com)
with ViChat Web and Mobile applications for real-time customer service.
"""

import copy
import hashlib
import hmac
import json
import logging
import os
import time
import urllib.request
import urllib.error

from gatco.response import json as json_response, text as text_response
from application.database import redisdb
from application.server import app

logger = logging.getLogger(__name__)

# Config & Environment
DEFAULT_INTERNAL_TOKEN = os.getenv("CHAT_MANAGER_INTERNAL_TOKEN", "vichat_livechat_internal_secret_2026")
DEFAULT_INGRESS_SECRET = os.getenv("CHAT_MANAGER_INGRESS_SECRET", "vichat_livechat_hmac_secret_2026")
VALID_INTERNAL_TOKENS = {
    "vichat_livechat_internal_secret_2026",
    "vichat-livechat-internal-secret-2026",
}
CHATBOT_BASE_URL = os.getenv("CHATBOT_INGRESS_URL", os.getenv("HOST_URL", "http://192.168.80.154:10000")).rstrip("/")
MAX_LIVECHAT_HISTORY = 500
TAKEOVER_TTL_SECONDS = 1800  # 30 minutes


def _extract_request_tenant(request) -> str:
    """Safely extracts tenant_id from user session, JWT token, or headers."""
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

    # 4. From request headers
    t = (
        request.headers.get("X-Tenant-Id")
        or request.headers.get("X-Tenant-ID")
        or request.headers.get("X-Vichat-Tenant")
        or request.headers.get("X-Tenant")
    )
    if t:
        return str(t).strip()

    # 5. Fallback default tenant
    return "gonstack"


def _verify_internal_token(request) -> bool:
    """Verifies internal bridge token sent from Chatbot daemon."""
    headers_dict = dict(request.headers) if hasattr(request, "headers") and request.headers else {}
    print(f"[LIVECHAT_AUTH_DEBUG] headers={headers_dict}, args={getattr(request, 'args', None)}", flush=True)

    token = None
    for k, v in headers_dict.items():
        if k.lower() in ("x-livechat-internal-token", "x_livechat_internal_token"):
            token = v
            break

    if not token:
        auth_header = headers_dict.get("Authorization") or headers_dict.get("authorization") or ""
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
        elif auth_header.startswith("Token "):
            token = auth_header[6:].strip()

    if not token:
        raw_token = request.args.get("token") or request.args.get("internal_token")
        if isinstance(raw_token, list) and raw_token:
            token = raw_token[0]
        elif isinstance(raw_token, str):
            token = raw_token

    if not token:
        print("[LIVECHAT_AUTH_DEBUG] No token extracted!", flush=True)
        return False
    token_str = str(token).strip()
    expected = os.getenv("CHAT_MANAGER_INTERNAL_TOKEN", DEFAULT_INTERNAL_TOKEN).strip()
    is_valid = token_str in VALID_INTERNAL_TOKENS or hmac.compare_digest(token_str, expected)
    print(f"[LIVECHAT_AUTH_DEBUG] token_str={token_str}, is_valid={is_valid}", flush=True)
    return is_valid


def _sign_payload(raw_body: bytes, secret: str) -> str:
    """Generates HMAC-SHA256 signature for outbound Chat Manager callbacks."""
    sig = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return f"sha256={sig}"


def _get_livechat_messages(conv_id: str, limit: int = 50) -> list:
    """Retrieves cached messages for a livechat conversation."""
    if redisdb is None:
        return []
    try:
        msgs_key = f"livechat:messages:{conv_id}"
        raw_msgs = redisdb.lrange(msgs_key, -limit, -1) or []
        parsed = []
        for raw in raw_msgs:
            try:
                data = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
                parsed.append(data)
            except Exception:
                continue
        return parsed
    except Exception as e:
        logger.warning(f"Error reading livechat messages for {conv_id}: {e}")
        return []


def _append_livechat_message(conv_id: str, msg_obj: dict) -> None:
    """Appends a new message to the conversation history and trims history."""
    if redisdb is None:
        return
    try:
        msgs_key = f"livechat:messages:{conv_id}"
        serialized = json.dumps(msg_obj, ensure_ascii=False)
        redisdb.rpush(msgs_key, serialized)
        redisdb.ltrim(msgs_key, -MAX_LIVECHAT_HISTORY, -1)

        # Publish event for omnichannel realtime notification
        try:
            event_payload = json.dumps({
                "type": "LIVECHAT_NEW_MESSAGE",
                "conversation_id": conv_id,
                "message": msg_obj,
                "timestamp": int(time.time() * 1000),
            })
            redisdb.publish("vichat:omnichannel:events", event_payload)
        except Exception:
            pass
    except Exception as e:
        logger.warning(f"Error appending livechat message for {conv_id}: {e}")


def _forward_agent_message_to_chatbot(tenant_id: str, bot_id: str, external_conv_id: str, text: str, agent_id: str = None, agent_name: str = None) -> bool:
    """Dispatches agent reply to chatbot widget ingress with HMAC-SHA256 signature."""
    try:
        event_id = f"agent_msg_{int(time.time() * 1000)}"
        outbound_event = {
            "tenant_id": str(tenant_id),
            "bot_id": str(bot_id),
            "conversation_id": str(external_conv_id),
            "event_id": event_id,
            "event_type": "AGENT_MESSAGE",
            "payload": {
                "message": {
                    "message_id": event_id,
                    "sender_id": str(agent_id or "agent"),
                    "text": str(text),
                }
            }
        }
        raw_body = json.dumps(outbound_event, ensure_ascii=False).encode("utf-8")
        secret = os.getenv("CHAT_MANAGER_INGRESS_SECRET", DEFAULT_INGRESS_SECRET)
        signature = _sign_payload(raw_body, secret)

        target_url = f"{CHATBOT_BASE_URL}/api/v1/internal/widget/chat-manager/events"
        req = urllib.request.Request(
            target_url,
            data=raw_body,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Chat-Manager-Signature": signature,
                "User-Agent": "ViChat-ChatManager/1.0",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status in (200, 201, 204)
    except Exception as e:
        logger.error(f"Failed to forward agent message to chatbot widget {external_conv_id}: {e}")
        return False


def _get_active_livechat_conversations_for_listing(tenant_id: str = None) -> list:
    """Returns active Livechat conversations scoped by tenant for Web & Mobile listing."""
    conversations = []
    if redisdb is None or not tenant_id:
        return conversations
    try:
        index_key = f"livechat:conversations:index:{tenant_id}"
        members = redisdb.smembers(index_key) or []
        for raw_id in members:
            conv_id = raw_id.decode("utf-8") if isinstance(raw_id, bytes) else raw_id
            raw_data = redisdb.get(f"livechat:conversation:{conv_id}")
            if not raw_data:
                continue
            conv_obj = json.loads(raw_data.decode("utf-8") if isinstance(raw_data, bytes) else raw_data)
            if conv_obj.get("tenant_id") and conv_obj.get("tenant_id") != tenant_id:
                continue

            customer_name = conv_obj.get("name") or "Khách Livechat"
            last_msg = conv_obj.get("last_message") or ""
            updated_at = conv_obj.get("updated_at") or int(time.time() * 1000)

            conversations.append({
                "id": conv_id,
                "managementId": conv_id,
                "tinodeTopic": conv_obj.get("tinode_topic") or conv_id,
                "name": customer_name,
                "bot_id": conv_obj.get("bot_id") or "",
                "bot_name": conv_obj.get("bot_name") or "Livechat Bot",
                "tenant_id": tenant_id,
                "avatarUrl": conv_obj.get("avatar") or "",
                "avatar": conv_obj.get("avatar") or "",
                "isGroup": False,
                "is_group": False,
                "channel": "livechat",
                "channelType": "livechat",
                "sourceType": "livechat",
                "lastMsg": last_msg,
                "last_message": last_msg,
                "updatedAt": updated_at,
                "status": conv_obj.get("status", "WAITING_HUMAN"),
                "status_version": conv_obj.get("status_version", 1),
                "assigned_agent_id": conv_obj.get("assigned_agent_id"),
                "assigned_agent_name": conv_obj.get("assigned_agent_name"),
                "badge": 0,
            })
    except Exception as e:
        logger.warning(f"Error listing livechat conversations for tenant {tenant_id}: {e}")
    return conversations


# ---------------------------------------------------------------------------
# Ingress APIs (Called by Chatbot widget backend)
# ---------------------------------------------------------------------------

@app.route("/api/v1/internal/livechat/conversations/upsert", methods=["POST"])
async def livechat_internal_upsert_conversation(request):
    """Ingress endpoint: Chatbot syncs or registers a livechat conversation."""
    if not _verify_internal_token(request):
        return json_response({"ok": False, "error_code": "UNAUTHORIZED"}, status=401)

    try:
        body = request.json or {}
    except Exception:
        body = {}

    tenant_id = str(body.get("tenant_id") or request.headers.get("X-Tenant-ID") or "gonstack").strip()
    bot_id = str(body.get("bot_id") or "default_bot").strip()
    external_conv_id = str(body.get("external_conversation_id") or body.get("conversation_id") or "").strip()
    if not external_conv_id:
        return json_response({"ok": False, "error_code": "INVALID_CONVERSATION_ID"}, status=400)

    conv_id = f"livechat:{external_conv_id}" if not external_conv_id.startswith("livechat:") else external_conv_id
    properties = body.get("properties") or {}
    handoff_profile = properties.get("handoff_profile") or {}

    customer_name = body.get("visitor_name") or handoff_profile.get("name") or "Khách Livechat"
    status = body.get("status", "BOT_ACTIVE")
    status_version = int(body.get("status_version", 1))

    now_ms = int(time.time() * 1000)

    # Load existing or create new
    existing_raw = redisdb.get(f"livechat:conversation:{conv_id}") if redisdb else None
    existing_obj = {}
    if existing_raw:
        try:
            existing_obj = json.loads(existing_raw.decode("utf-8") if isinstance(existing_raw, bytes) else existing_raw)
        except Exception:
            existing_obj = {}

    conv_record = {
        "id": conv_id,
        "external_conversation_id": external_conv_id,
        "tenant_id": tenant_id,
        "bot_id": bot_id,
        "tinode_topic": body.get("tinode_topic") or conv_id,
        "status": status,
        "status_version": status_version,
        "name": customer_name or existing_obj.get("name") or "Khách Livechat",
        "phone": handoff_profile.get("phone") or existing_obj.get("phone") or "",
        "email": handoff_profile.get("email") or existing_obj.get("email") or "",
        "avatar": existing_obj.get("avatar") or "",
        "last_message": existing_obj.get("last_message") or "",
        "last_message_at": existing_obj.get("last_message_at") or now_ms,
        "created_at": existing_obj.get("created_at") or now_ms,
        "updated_at": now_ms,
        "assigned_agent_id": existing_obj.get("assigned_agent_id"),
        "assigned_agent_name": existing_obj.get("assigned_agent_name"),
        "channel": "livechat",
        "channelType": "livechat",
        "sourceType": "livechat",
        "properties": properties,
    }

    if redisdb:
        redisdb.set(f"livechat:conversation:{conv_id}", json.dumps(conv_record, ensure_ascii=False))
        redisdb.sadd(f"livechat:conversations:index:{tenant_id}", conv_id)

    return json_response({"ok": True, "conversation_id": conv_id, "status": status})


@app.route("/api/v1/internal/livechat/events", methods=["POST"])
async def livechat_internal_record_event(request):
    """Ingress endpoint: Chatbot delivers inbound events (visitor message, handoff, echo)."""
    if not _verify_internal_token(request):
        return json_response({"ok": False, "error_code": "UNAUTHORIZED"}, status=401)

    try:
        body = request.json or {}
    except Exception:
        body = {}

    tenant_id = str(body.get("tenant_id") or request.headers.get("X-Tenant-ID") or "gonstack").strip()
    bot_id = str(body.get("bot_id") or "").strip()
    external_conv_id = str(body.get("conversation_id") or "").strip()
    event_id = str(body.get("event_id") or f"evt_{int(time.time() * 1000)}").strip()
    event_type = str(body.get("event_type") or "").strip()
    payload = body.get("payload") or {}

    if not external_conv_id:
        return json_response({"ok": False, "error_code": "INVALID_CONVERSATION_ID"}, status=400)

    conv_id = f"livechat:{external_conv_id}" if not external_conv_id.startswith("livechat:") else external_conv_id
    now_ms = int(time.time() * 1000)

    # Make sure conversation exists in index
    if redisdb:
        redisdb.sadd(f"livechat:conversations:index:{tenant_id}", conv_id)

    if event_type == "VISITOR_MESSAGE":
        msg_data = payload.get("message") or {}
        text = str(msg_data.get("text") or "").strip()
        sender_id = str(msg_data.get("sender_id") or "visitor")
        msg_id = str(msg_data.get("message_id") or event_id)

        msg_obj = {
            "id": msg_id,
            "message_id": msg_id,
            "conversation_id": conv_id,
            "sender_type": "VISITOR",
            "sender": "incoming",
            "sender_id": sender_id,
            "sender_name": "Khách Livechat",
            "text": text,
            "type": msg_data.get("type", "text"),
            "created_at": msg_data.get("created_at") or now_ms,
            "direction": "INBOUND",
        }
        _append_livechat_message(conv_id, msg_obj)

        # Update last message in conversation
        if redisdb:
            raw = redisdb.get(f"livechat:conversation:{conv_id}")
            if raw:
                conv = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
                conv["last_message"] = text
                conv["last_message_at"] = now_ms
                conv["updated_at"] = now_ms
                redisdb.set(f"livechat:conversation:{conv_id}", json.dumps(conv, ensure_ascii=False))

    elif event_type in ("OUTBOUND_MESSAGE", "BOT_ECHO"):
        msg_data = payload.get("message") or {}
        text = str(msg_data.get("text") or "").strip()
        sender_type = msg_data.get("sender_type") or "BOT"
        msg_id = str(msg_data.get("message_id") or event_id)

        msg_obj = {
            "id": msg_id,
            "message_id": msg_id,
            "conversation_id": conv_id,
            "sender_type": sender_type,
            "sender": "bot" if sender_type == "BOT" else "outgoing",
            "sender_id": msg_data.get("sender_id") or "bot",
            "sender_name": "Chatbot" if sender_type == "BOT" else "Nhân viên CSKH",
            "text": text,
            "type": msg_data.get("type", "text"),
            "created_at": msg_data.get("created_at") or now_ms,
            "direction": "OUTBOUND",
        }
        _append_livechat_message(conv_id, msg_obj)

        if redisdb:
            raw = redisdb.get(f"livechat:conversation:{conv_id}")
            if raw:
                conv = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
                conv["last_message"] = text
                conv["last_message_at"] = now_ms
                conv["updated_at"] = now_ms
                redisdb.set(f"livechat:conversation:{conv_id}", json.dumps(conv, ensure_ascii=False))

    elif event_type == "HANDOFF_REQUESTED":
        # Transition conversation to WAITING_HUMAN
        if redisdb:
            raw = redisdb.get(f"livechat:conversation:{conv_id}")
            if raw:
                conv = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
                conv["status"] = "WAITING_HUMAN"
                conv["status_version"] = int(payload.get("status_version") or conv.get("status_version", 1))
                conv["updated_at"] = now_ms
                redisdb.set(f"livechat:conversation:{conv_id}", json.dumps(conv, ensure_ascii=False))

    return json_response({"ok": True, "event_id": event_id})


# ---------------------------------------------------------------------------
# Client APIs (Web & Mobile ViChat)
# ---------------------------------------------------------------------------

@app.route("/api/v1/livechat/conversations", methods=["GET"])
async def livechat_list_conversations(request):
    """Returns active Livechat conversations for current tenant."""
    tenant_id = _extract_request_tenant(request)
    conversations = _get_active_livechat_conversations_for_listing(tenant_id)
    return json_response({
        "status": "success",
        "total": len(conversations),
        "conversations": conversations,
    })


@app.route("/api/v1/livechat/conversations/<conversation_id>/messages", methods=["GET"])
async def livechat_get_conversation_messages(request, conversation_id):
    """Returns messages for a specific livechat conversation."""
    conv_id = f"livechat:{conversation_id}" if not conversation_id.startswith("livechat:") else conversation_id
    limit = int(request.args.get("limit", 100))
    messages = _get_livechat_messages(conv_id, limit=limit)
    return json_response({
        "status": "success",
        "conversation_id": conv_id,
        "total": len(messages),
        "messages": messages,
    })


@app.route("/api/v1/livechat/send_message", methods=["POST"])
async def livechat_send_message(request):
    """Agent replies to a livechat visitor. Persists locally and forwards to chatbot."""
    tenant_id = _extract_request_tenant(request)
    try:
        body = request.json or {}
    except Exception:
        body = {}

    conversation_id = str(body.get("conversation_id") or "").strip()
    message = str(body.get("message") or body.get("text") or "").strip()
    agent_id = str(body.get("agent_id") or "").strip()
    agent_name = str(body.get("agent_name") or "Chuyên viên hỗ trợ").strip()

    if not conversation_id or not message:
        return json_response({"status": "error", "message": "conversation_id and message are required"}, status=400)

    conv_id = f"livechat:{conversation_id}" if not conversation_id.startswith("livechat:") else conversation_id
    external_conv_id = conv_id.replace("livechat:", "")

    # Retrieve conversation metadata
    conv_obj = {}
    if redisdb:
        raw = redisdb.get(f"livechat:conversation:{conv_id}")
        if raw:
            try:
                conv_obj = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
            except Exception:
                conv_obj = {}

    target_tenant = conv_obj.get("tenant_id") or tenant_id
    bot_id = conv_obj.get("bot_id") or "default_bot"

    now_ms = int(time.time() * 1000)
    msg_id = f"agent_msg_{now_ms}"

    # 1. Append message to local livechat history
    msg_record = {
        "id": msg_id,
        "message_id": msg_id,
        "conversation_id": conv_id,
        "sender_type": "AGENT",
        "sender": "outgoing",
        "sender_id": agent_id or "agent",
        "sender_name": agent_name,
        "text": message,
        "type": "text",
        "created_at": now_ms,
        "direction": "OUTBOUND",
    }
    _append_livechat_message(conv_id, msg_record)

    # 2. Update conversation status and last message
    if redisdb:
        conv_obj["last_message"] = message
        conv_obj["last_message_at"] = now_ms
        conv_obj["updated_at"] = now_ms
        conv_obj["assigned_agent_id"] = agent_id or conv_obj.get("assigned_agent_id")
        conv_obj["assigned_agent_name"] = agent_name or conv_obj.get("assigned_agent_name")
        conv_obj["status"] = "ASSIGNED"
        redisdb.set(f"livechat:conversation:{conv_id}", json.dumps(conv_obj, ensure_ascii=False))

    # 3. Forward to chatbot widget ingress
    forward_ok = _forward_agent_message_to_chatbot(
        tenant_id=target_tenant,
        bot_id=bot_id,
        external_conv_id=external_conv_id,
        text=message,
        agent_id=agent_id,
        agent_name=agent_name,
    )

    return json_response({
        "status": "success",
        "message_id": msg_id,
        "delivered_to_chatbot": forward_ok,
    })


@app.route("/api/v1/livechat/takeover", methods=["POST"])
async def livechat_takeover(request):
    """Claims/assigns a livechat conversation to a human agent."""
    tenant_id = _extract_request_tenant(request)
    try:
        body = request.json or {}
    except Exception:
        body = {}

    conversation_id = str(body.get("conversation_id") or "").strip()
    agent_id = str(body.get("agent_id") or "agent").strip()
    agent_name = str(body.get("agent_name") or "Chuyên viên hỗ trợ").strip()

    if not conversation_id:
        return json_response({"status": "error", "message": "conversation_id is required"}, status=400)

    conv_id = f"livechat:{conversation_id}" if not conversation_id.startswith("livechat:") else conversation_id
    external_conv_id = conv_id.replace("livechat:", "")

    conv_obj = {}
    if redisdb:
        raw = redisdb.get(f"livechat:conversation:{conv_id}")
        if raw:
            try:
                conv_obj = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
            except Exception:
                conv_obj = {}

    bot_id = conv_obj.get("bot_id") or "default_bot"
    target_tenant = conv_obj.get("tenant_id") or tenant_id

    # Update local status
    conv_obj["status"] = "ASSIGNED"
    conv_obj["assigned_agent_id"] = agent_id
    conv_obj["assigned_agent_name"] = agent_name
    conv_obj["updated_at"] = int(time.time() * 1000)

    if redisdb:
        redisdb.set(f"livechat:conversation:{conv_id}", json.dumps(conv_obj, ensure_ascii=False))

    # Notify chatbot about assignment
    try:
        event_id = f"assign_{int(time.time() * 1000)}"
        outbound_event = {
            "tenant_id": str(target_tenant),
            "bot_id": str(bot_id),
            "conversation_id": str(external_conv_id),
            "event_id": event_id,
            "event_type": "CONVERSATION_ASSIGNED",
            "payload": {
                "agent_id": str(agent_id),
                "agent_name": str(agent_name),
            }
        }
        raw_body = json.dumps(outbound_event, ensure_ascii=False).encode("utf-8")
        secret = os.getenv("CHAT_MANAGER_INGRESS_SECRET", DEFAULT_INGRESS_SECRET)
        signature = _sign_payload(raw_body, secret)
        target_url = f"{CHATBOT_BASE_URL}/api/v1/internal/widget/chat-manager/events"
        req = urllib.request.Request(
            target_url,
            data=raw_body,
            headers={
                "Content-Type": "application/json",
                "X-Chat-Manager-Signature": signature,
            },
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        logger.warning(f"Could not notify chatbot of assignment for {conv_id}: {e}")

    return json_response({"status": "success", "conversation_id": conv_id, "state": "ASSIGNED"})
