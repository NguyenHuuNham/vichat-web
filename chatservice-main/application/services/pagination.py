"""Small, strict helpers for opaque API cursors and bounded integers."""

import base64
import binascii
import json
import uuid


class PaginationError(ValueError):
    """Raised when a client supplies an invalid pagination value."""


DEFAULT_PAGE_LIMIT = 100
MAX_PAGE_LIMIT = 100


def bounded_int(value, *, name, default, minimum=0, maximum=None):
    """Parse an integer without silently accepting malformed input."""
    if value is None or value == "":
        parsed = default
    elif isinstance(value, bool):
        raise PaginationError("{} must be an integer.".format(name))
    else:
        try:
            parsed = int(str(value).strip())
        except (TypeError, ValueError):
            raise PaginationError("{} must be an integer.".format(name))
    if parsed < minimum:
        raise PaginationError("{} must be at least {}.".format(name, minimum))
    if maximum is not None and parsed > maximum:
        raise PaginationError("{} must be at most {}.".format(name, maximum))
    return parsed


def encode_cursor(payload):
    if not isinstance(payload, dict) or not payload:
        raise PaginationError("Cursor payload is invalid.")
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(value):
    cursor = str(value or "").strip()
    if not cursor or len(cursor) > 512:
        raise PaginationError("Cursor is invalid.")
    try:
        padding = "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode((cursor + padding).encode("ascii")))
    except (ValueError, UnicodeError, binascii.Error, json.JSONDecodeError):
        raise PaginationError("Cursor is invalid.")
    if not isinstance(payload, dict):
        raise PaginationError("Cursor is invalid.")
    return payload


def cursor_uuid(value, *, name="id"):
    """Validate the tie-breaker UUID carried by a cursor."""
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        raise PaginationError("{} in cursor is invalid.".format(name))


def cursor_page_args(args, *, default=DEFAULT_PAGE_LIMIT, maximum=MAX_PAGE_LIMIT):
    """Parse the shared limit/cursor contract used by list endpoints."""
    limit = bounded_int(
        args.get("limit"),
        name="limit",
        default=default,
        minimum=1,
        maximum=maximum,
    )
    raw_cursor = args.get("cursor")
    return limit, (decode_cursor(raw_cursor) if raw_cursor else None)


def page_payload(objects, *, next_cursor=None, limit=100, total=None, items=None):
    values = list(objects or [])
    payload = {
        "objects": values,
        "items": list(items if items is not None else values),
        "next_cursor": next_cursor,
        "nextCursor": next_cursor,
        "has_more": bool(next_cursor),
        "hasMore": bool(next_cursor),
        "limit": int(limit),
    }
    if total is not None:
        payload["total"] = int(total)
    return payload
