"""Ephemeral, tenant-scoped ChatUI presence leases."""

from urllib.parse import quote, unquote

from application import database
from application.server import app


PRESENCE_KEY_PREFIX = "vichat:presence:"
DEFAULT_PRESENCE_TTL = 8
MAX_PRESENCE_TTL = 60


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


def _presence_key(tenant_id, account_id, session_id):
    return "{}{}:{}".format(
        _tenant_prefix(tenant_id),
        _key_part(account_id),
        _key_part(session_id),
    )


def mark_online(tenant_id, account_id, session_id):
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
        return True
    except Exception:
        return False


def mark_offline(tenant_id, account_id, session_id):
    """Remove only this session lease so another tab/device stays online."""
    redisdb = database.redisdb
    if redisdb is None or not tenant_id or not account_id or not session_id:
        return False
    try:
        redisdb.delete(_presence_key(tenant_id, account_id, session_id))
        return True
    except Exception:
        return False


def online_snapshot(tenant_id, account_ids):
    """Return boolean presence for requested same-tenant account IDs.

    ``None`` means Redis was unavailable. An empty dictionary is a valid
    response when the caller has no active directory accounts.
    """
    redisdb = database.redisdb
    requested = {
        str(account_id).strip()
        for account_id in (account_ids or [])
        if str(account_id).strip()
    }
    if redisdb is None:
        return None
    snapshot = {account_id: False for account_id in requested}
    if not requested:
        return snapshot
    prefix = _tenant_prefix(tenant_id)
    try:
        for raw_key in redisdb.scan_iter(match="{}*".format(prefix)):
            key = raw_key.decode("utf-8") if isinstance(raw_key, bytes) else str(raw_key)
            suffix = key[len(prefix):]
            encoded_account_id = suffix.split(":", 1)[0]
            account_id = unquote(encoded_account_id)
            if account_id in requested:
                snapshot[account_id] = True
    except Exception:
        return None
    return snapshot
