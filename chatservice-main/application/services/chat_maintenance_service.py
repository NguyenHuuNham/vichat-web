"""Shared ChatUI maintenance state and realtime notification helpers."""

import json
import time

from application import database


MAINTENANCE_KEY = "vichat:chat-ui:maintenance:v1"
MAINTENANCE_CHANNEL = "vichat:chat-ui:maintenance:v1"
MAINTENANCE_MESSAGE = (
    "WEBSITE ĐANG TRONG QUÁ TRÌNH CẬP NHẬT VUI LÒNG THỬ LẠI SAU"
)


def default_maintenance_state():
    return {
        "enabled": False,
        "message": MAINTENANCE_MESSAGE,
        "updatedAt": 0,
    }


def normalize_maintenance_state(value=None):
    source = value
    if isinstance(value, (bytes, bytearray)):
        try:
            source = json.loads(value.decode("utf-8"))
        except (UnicodeDecodeError, ValueError, TypeError):
            source = None
    elif isinstance(value, str):
        try:
            source = json.loads(value)
        except (ValueError, TypeError):
            source = None
    if not isinstance(source, dict):
        source = {}
    updated_at = source.get("updatedAt", source.get("updated_at", 0))
    try:
        updated_at = max(0, int(updated_at or 0))
    except (TypeError, ValueError):
        updated_at = 0
    parsed_enabled = parse_enabled(source.get("enabled", False))
    return {
        "enabled": bool(parsed_enabled) if parsed_enabled is not None else False,
        "message": MAINTENANCE_MESSAGE,
        "updatedAt": updated_at,
    }


def parse_enabled(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value != 0
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in ("true", "1", "yes", "on"):
            return True
        if normalized in ("false", "0", "no", "off"):
            return False
    return None


def read_maintenance_state(redis_client=None):
    client = redis_client or database.redisdb
    if client is None:
        return default_maintenance_state()
    try:
        return normalize_maintenance_state(client.get(MAINTENANCE_KEY))
    except Exception:
        # Maintenance reads fail open so a Redis incident cannot lock users
        # out of ChatUI or interfere with the existing chat/session flows.
        return default_maintenance_state()


def write_maintenance_state(enabled, redis_client=None, now_ms=None):
    client = redis_client or database.redisdb
    if client is None:
        raise RuntimeError("Maintenance state storage is unavailable.")
    state = normalize_maintenance_state({
        "enabled": bool(enabled),
        "updatedAt": int(now_ms if now_ms is not None else time.time() * 1000),
    })
    encoded = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    client.set(MAINTENANCE_KEY, encoded)
    try:
        client.publish(MAINTENANCE_CHANNEL, encoded)
    except Exception:
        # The persisted state is still available to the HTTP fallback poll.
        pass
    return state


def maintenance_sse_chunk(state):
    payload = json.dumps(
        normalize_maintenance_state(state),
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return "event: maintenance\ndata: {}\n\n".format(payload)
