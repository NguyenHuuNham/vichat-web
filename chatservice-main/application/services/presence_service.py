"""Tenant-scoped ChatUI presence leases and bounded last-seen timestamps."""

import time
from urllib.parse import quote, unquote

from application import database
from application.server import app


PRESENCE_KEY_PREFIX = "vichat:presence:"
LAST_SEEN_KEY_PREFIX = "vichat:last-seen:"
DEFAULT_PRESENCE_TTL = 8
MAX_PRESENCE_TTL = 60
# Keep enough history for an offline duration without turning Redis into a
# permanent account store.
LAST_SEEN_TTL = 90 * 24 * 60 * 60

# Heartbeat and logout requests can arrive out of order. Redis evaluates this
# script atomically so a delayed request cannot move the activity boundary
# backwards. The read/compare/set fallback below is kept for lightweight test
# doubles and degraded clients that do not expose ``EVAL``.
_LAST_SEEN_MONOTONIC_SCRIPT = """
local incoming = tonumber(ARGV[1])
local current = tonumber(redis.call('GET', KEYS[1]))
if (not current) or incoming > current then
  redis.call('SETEX', KEYS[1], ARGV[2], ARGV[1])
  return 1
end
return 0
"""


def presence_ttl():
    try:
        configured = int(app.config.get("CHAT_PRESENCE_TTL", DEFAULT_PRESENCE_TTL))
    except (TypeError, ValueError):
        configured = DEFAULT_PRESENCE_TTL
    return max(3, min(MAX_PRESENCE_TTL, configured))


def _key_part(value):
    return quote(str(value or "").strip(), safe="")


def _tenant_prefix(tenant_id):
    return "{}{}:".format(PRESENCE_KEY_PREFIX, _key_part(tenant_id))


def _last_seen_tenant_prefix(tenant_id):
    return "{}{}:".format(LAST_SEEN_KEY_PREFIX, _key_part(tenant_id))


def _presence_key(tenant_id, account_id, session_id):
    return "{}{}:{}".format(
        _tenant_prefix(tenant_id),
        _key_part(account_id),
        _key_part(session_id),
    )


def _last_seen_key(tenant_id, account_id):
    return "{}{}".format(
        _last_seen_tenant_prefix(tenant_id),
        _key_part(account_id),
    )


def _timestamp_ms(now_ms=None):
    if now_ms is not None:
        try:
            value = int(now_ms)
            if value > 0:
                return value
        except (TypeError, ValueError):
            pass
    return int(time.time() * 1000)


def _write_last_seen(redisdb, tenant_id, account_id, now_ms=None):
    key = _last_seen_key(tenant_id, account_id)
    timestamp = _timestamp_ms(now_ms)
    evaluator = getattr(redisdb, "eval", None)
    if callable(evaluator):
        evaluator(
            _LAST_SEEN_MONOTONIC_SCRIPT,
            1,
            key,
            str(timestamp),
            str(LAST_SEEN_TTL),
        )
        return

    # Keep source-level/unit-test Redis doubles compatible without weakening
    # the atomic path used by the real Redis client.
    current = redisdb.get(key)
    if isinstance(current, bytes):
        current = current.decode("utf-8")
    try:
        current_timestamp = int(current)
    except (TypeError, ValueError):
        current_timestamp = 0
    if current_timestamp >= timestamp:
        return
    redisdb.setex(key, LAST_SEEN_TTL, str(timestamp))


def mark_online(tenant_id, account_id, session_id, now_ms=None):
    """Refresh one browser session lease without failing the chat request."""
    redisdb = database.redisdb
    if redisdb is None or not tenant_id or not account_id or not session_id:
        return False
    try:
        redisdb.setex(
            _presence_key(tenant_id, account_id, session_id),
            presence_ttl(),
            "1",
        )
    except Exception:
        return False
    try:
        _write_last_seen(redisdb, tenant_id, account_id, now_ms)
    except Exception:
        # Last-seen is additive metadata; a write failure must not invalidate
        # the presence lease that keeps the active session online.
        pass
    return True


def mark_offline(tenant_id, account_id, session_id, now_ms=None):
    """Remove only this session lease so another tab/device stays online."""
    redisdb = database.redisdb
    if redisdb is None or not tenant_id or not account_id or not session_id:
        return False
    try:
        redisdb.delete(_presence_key(tenant_id, account_id, session_id))
    except Exception:
        return False
    try:
        _write_last_seen(redisdb, tenant_id, account_id, now_ms)
    except Exception:
        # Removing the lease is the authoritative offline operation. Keep the
        # endpoint successful when only optional elapsed-time metadata fails.
        pass
    return True


def presence_snapshot(tenant_id, account_ids):
    """Return online states and the latest bounded activity timestamp."""
    redisdb = database.redisdb
    requested = {
        str(account_id).strip()
        for account_id in (account_ids or [])
        if str(account_id).strip()
    }
    if redisdb is None:
        return None
    online = {account_id: False for account_id in requested}
    last_seen = {}
    if not requested:
        return {"presence": online, "last_seen": last_seen}
    prefix = _tenant_prefix(tenant_id)
    try:
        for raw_key in redisdb.scan_iter(match="{}*".format(prefix)):
            key = raw_key.decode("utf-8") if isinstance(raw_key, bytes) else str(raw_key)
            suffix = key[len(prefix):]
            encoded_account_id = suffix.split(":", 1)[0]
            account_id = unquote(encoded_account_id)
            if account_id in requested:
                online[account_id] = True

    except Exception:
        return None
    # Older Redis test doubles and degraded clients may not expose ``get``;
    # the online lease remains useful even when the optional age is absent.
    try:
        requested_ids = sorted(requested)
        keys = [_last_seen_key(tenant_id, account_id) for account_id in requested_ids]
        try:
            raw_values = redisdb.mget(keys)
        except (AttributeError, NotImplementedError):
            raw_values = [redisdb.get(key) for key in keys]
        for account_id, raw_value in zip(requested_ids, raw_values):
            if isinstance(raw_value, bytes):
                raw_value = raw_value.decode("utf-8")
            try:
                timestamp = int(raw_value)
            except (TypeError, ValueError):
                continue
            if timestamp > 0:
                last_seen[account_id] = timestamp
    except Exception:
        # A last-seen read is additive; do not take a working presence list
        # offline just because one optional metadata read failed.
        last_seen = {}
    return {"presence": online, "last_seen": last_seen}


def online_snapshot(tenant_id, account_ids):
    """Return boolean presence for requested same-tenant account IDs.

    ``None`` means Redis was unavailable. An empty dictionary is a valid
    response when the caller has no active directory accounts.
    """
    snapshot = presence_snapshot(tenant_id, account_ids)
    return snapshot["presence"] if snapshot is not None else None
