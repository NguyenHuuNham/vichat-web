import datetime
import re


ITEM_TYPES = (
    "TASK",
    "ANNOUNCEMENT",
    "APPROVAL",
    "TICKET",
    "WIKI",
    "EVENT",
    "INTEGRATION",
)

ITEM_STATUSES = {
    "TASK": ("TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"),
    "ANNOUNCEMENT": ("DRAFT", "PUBLISHED", "ARCHIVED"),
    "APPROVAL": ("PENDING", "APPROVED", "REJECTED", "CANCELLED"),
    "TICKET": ("OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"),
    "WIKI": ("DRAFT", "PUBLISHED", "ARCHIVED"),
    "EVENT": ("SCHEDULED", "ACTIVE", "COMPLETED", "CANCELLED"),
    "INTEGRATION": ("ACTIVE", "PAUSED", "ERROR", "ARCHIVED"),
}

INITIAL_STATUS = {
    "TASK": "TODO",
    "ANNOUNCEMENT": "DRAFT",
    "APPROVAL": "PENDING",
    "TICKET": "OPEN",
    "WIKI": "DRAFT",
    "EVENT": "SCHEDULED",
    "INTEGRATION": "ACTIVE",
}

PARTICIPANT_ROLES = {
    "TASK": ("ASSIGNEE", "WATCHER"),
    "ANNOUNCEMENT": ("RECIPIENT",),
    "APPROVAL": ("APPROVER", "WATCHER"),
    "TICKET": ("ASSIGNEE", "WATCHER"),
    "WIKI": ("EDITOR", "WATCHER"),
    "EVENT": ("ATTENDEE",),
    "INTEGRATION": ("OWNER", "WATCHER"),
}

DEFAULT_PARTICIPANT_ROLE = {
    item_type: roles[0]
    for item_type, roles in PARTICIPANT_ROLES.items()
}

PROPERTY_FIELDS = {
    "TASK": ("checklist", "progress", "source_conversation_name"),
    "ANNOUNCEMENT": ("pinned", "requires_ack", "audience_label"),
    "APPROVAL": ("request_kind", "amount", "currency", "reference_code"),
    "TICKET": ("category", "sla_minutes", "requester_contact", "reference_code"),
    "WIKI": ("category", "tags", "revision_note"),
    "EVENT": ("location", "meeting_url", "all_day"),
    "INTEGRATION": ("provider", "endpoint", "sync_direction", "notes"),
}

PRIORITIES = ("LOW", "NORMAL", "HIGH", "URGENT")
VISIBILITIES = ("COMPANY", "PARTICIPANTS")
ADMIN_ONLY_TYPES = ("ANNOUNCEMENT", "INTEGRATION")
SAFE_URL_PATTERN = re.compile(r"^https?://[^\s]{1,2000}$", re.IGNORECASE)


class WorkspaceValidationError(ValueError):
    def __init__(self, message, code="PARAM_ERROR", status_code=400):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def normalize_item_type(value):
    item_type = str(value or "").strip().upper()
    if item_type not in ITEM_TYPES:
        raise WorkspaceValidationError("Unsupported workspace item type.")
    return item_type


def _bounded_text(value, field_name, max_length, required=False):
    text = str(value or "").strip()
    if required and not text:
        raise WorkspaceValidationError("{} is required.".format(field_name))
    if len(text) > max_length:
        raise WorkspaceValidationError("{} is too long.".format(field_name))
    return text


def parse_timestamp(value, field_name):
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        raise WorkspaceValidationError("{} is invalid.".format(field_name))
    if isinstance(value, (int, float)):
        timestamp = int(value)
        if timestamp > 10 ** 12:
            timestamp = int(timestamp / 1000)
    else:
        raw_value = str(value).strip()
        try:
            timestamp = int(raw_value)
            if timestamp > 10 ** 12:
                timestamp = int(timestamp / 1000)
        except ValueError:
            try:
                timestamp = int(datetime.datetime.fromisoformat(
                    raw_value.replace("Z", "+00:00")
                ).timestamp())
            except (TypeError, ValueError):
                raise WorkspaceValidationError("{} is invalid.".format(field_name))
    if timestamp < 0 or timestamp > 4102444800:
        raise WorkspaceValidationError("{} is outside the supported range.".format(field_name))
    return timestamp


def sanitize_properties(item_type, value):
    if value in (None, ""):
        return {}
    if not isinstance(value, dict):
        raise WorkspaceValidationError("properties must be an object.")
    allowed = set(PROPERTY_FIELDS[item_type])
    unknown = set(value) - allowed
    if unknown:
        raise WorkspaceValidationError(
            "Unsupported properties: {}.".format(", ".join(sorted(unknown)))
        )
    properties = {}
    for key in allowed:
        if key not in value:
            continue
        raw_value = value[key]
        if key in ("pinned", "requires_ack", "all_day"):
            properties[key] = bool(raw_value)
        elif key in ("progress", "sla_minutes"):
            try:
                numeric_value = int(raw_value)
            except (TypeError, ValueError):
                raise WorkspaceValidationError("{} must be a number.".format(key))
            maximum = 100 if key == "progress" else 525600
            if numeric_value < 0 or numeric_value > maximum:
                raise WorkspaceValidationError("{} is outside the supported range.".format(key))
            properties[key] = numeric_value
        elif key == "amount":
            try:
                amount = float(raw_value)
            except (TypeError, ValueError):
                raise WorkspaceValidationError("amount must be a number.")
            if amount < 0 or amount > 10 ** 15:
                raise WorkspaceValidationError("amount is outside the supported range.")
            properties[key] = amount
        elif key in ("tags", "checklist"):
            if not isinstance(raw_value, list) or len(raw_value) > 100:
                raise WorkspaceValidationError("{} must be a bounded list.".format(key))
            properties[key] = [
                _bounded_text(entry, key, 255)
                for entry in raw_value
                if str(entry or "").strip()
            ]
        else:
            max_length = 2000 if key in (
                "endpoint", "meeting_url", "source_message_preview", "notes"
            ) else 255
            text = _bounded_text(raw_value, key, max_length)
            if key in ("endpoint", "meeting_url") and text and not SAFE_URL_PATTERN.match(text):
                raise WorkspaceValidationError("{} must be an HTTP(S) URL.".format(key))
            properties[key] = text
    return properties


def validate_item_payload(body, existing_type=None, partial=False):
    if not isinstance(body, dict):
        raise WorkspaceValidationError("The request body must be an object.")
    item_type = normalize_item_type(
        body.get("type") or body.get("item_type") or existing_type
    )
    if existing_type and item_type != normalize_item_type(existing_type):
        raise WorkspaceValidationError("The workspace item type cannot be changed.")

    result = {"item_type": item_type}
    if not partial or "title" in body:
        result["title"] = _bounded_text(body.get("title"), "title", 500, required=True)
    if not partial or "description" in body:
        result["description"] = _bounded_text(body.get("description"), "description", 100000)

    if not partial or "status" in body:
        status = str(body.get("status") or INITIAL_STATUS[item_type]).strip().upper()
        if status not in ITEM_STATUSES[item_type]:
            raise WorkspaceValidationError("Unsupported status for {}.".format(item_type))
        result["status"] = status

    if not partial or "priority" in body:
        priority = str(body.get("priority") or "NORMAL").strip().upper()
        if priority not in PRIORITIES:
            raise WorkspaceValidationError("Unsupported priority.")
        result["priority"] = priority

    if not partial or "visibility" in body:
        visibility = str(body.get("visibility") or "COMPANY").strip().upper()
        if visibility not in VISIBILITIES:
            raise WorkspaceValidationError("Unsupported visibility.")
        result["visibility"] = visibility

    for field_name in ("due_at", "starts_at", "ends_at"):
        if not partial or field_name in body:
            result[field_name] = parse_timestamp(body.get(field_name), field_name)

    if not partial or "properties" in body:
        result["properties"] = sanitize_properties(item_type, body.get("properties"))

    if "owner_id" in body:
        result["owner_id"] = _bounded_text(body.get("owner_id"), "owner_id", 100) or None
    if "conversation_id" in body:
        result["conversation_id"] = _bounded_text(
            body.get("conversation_id"), "conversation_id", 100
        ) or None
    if "source_message_ref" in body:
        result["source_message_ref"] = _bounded_text(
            body.get("source_message_ref"), "source_message_ref", 255
        ) or None

    starts_at = result.get("starts_at")
    ends_at = result.get("ends_at")
    if item_type == "EVENT" and not partial and starts_at is None:
        raise WorkspaceValidationError("starts_at is required for an event.")
    if starts_at is not None and ends_at is not None and ends_at < starts_at:
        raise WorkspaceValidationError("ends_at must be after starts_at.")
    if item_type == "APPROVAL" and not partial and result.get("status") != "PENDING":
        raise WorkspaceValidationError("A new approval must start in PENDING status.")
    return result


def normalize_participants(item_type, body):
    if "participants" not in body and "participant_ids" not in body:
        return None
    raw_participants = body.get("participants")
    if raw_participants is None:
        raw_participants = [
            {"account_id": account_id}
            for account_id in (body.get("participant_ids") or [])
        ]
    if not isinstance(raw_participants, list) or len(raw_participants) > 200:
        raise WorkspaceValidationError("participants must be a bounded list.")
    allowed_roles = PARTICIPANT_ROLES[item_type]
    default_role = DEFAULT_PARTICIPANT_ROLE[item_type]
    participants = []
    seen = set()
    for entry in raw_participants:
        if isinstance(entry, dict):
            account_id = _bounded_text(
                entry.get("account_id") or entry.get("id"), "account_id", 100, required=True
            )
            role = str(entry.get("role") or default_role).strip().upper()
        else:
            account_id = _bounded_text(entry, "account_id", 100, required=True)
            role = default_role
        if role not in allowed_roles:
            raise WorkspaceValidationError("Unsupported participant role for {}.".format(item_type))
        key = (account_id, role)
        if key in seen:
            continue
        seen.add(key)
        participants.append({"account_id": account_id, "role": role})
    if item_type == "APPROVAL" and not any(entry["role"] == "APPROVER" for entry in participants):
        raise WorkspaceValidationError("An approval requires at least one approver.")
    return participants


def can_create_type(item_type, is_admin):
    return item_type not in ADMIN_ONLY_TYPES or bool(is_admin)


def can_read_item(item, user_id, is_admin, participant_account_ids):
    if is_admin or item.visibility == "COMPANY":
        return True
    return str(user_id) in {
        str(item.created_by or ""),
        str(item.owner_id or ""),
        *[str(account_id) for account_id in participant_account_ids],
    }


def can_edit_item(item, user_id, is_admin, participant_roles=()):
    if is_admin:
        return True
    if str(user_id) in (str(item.created_by or ""), str(item.owner_id or "")):
        return True
    roles = {str(role).upper() for role in participant_roles}
    return item.item_type == "WIKI" and "EDITOR" in roles


def allowed_actions(item, user_id, is_admin, participant_roles=()):
    item_type = item.item_type
    status = item.status
    roles = {str(role).upper() for role in participant_roles}
    creator = str(user_id) in (str(item.created_by or ""), str(item.owner_id or ""))
    actions = ["COMMENT"]
    if item_type == "TASK" and (is_admin or creator or "ASSIGNEE" in roles):
        if status in ("TODO", "BLOCKED"):
            actions.append("START")
        if status in ("TODO", "IN_PROGRESS", "BLOCKED"):
            actions.append("COMPLETE")
        if status in ("DONE", "CANCELLED") and (is_admin or creator):
            actions.append("REOPEN")
    elif item_type == "ANNOUNCEMENT":
        if status == "PUBLISHED" and bool((item.properties or {}).get("requires_ack")):
            actions.append("ACKNOWLEDGE")
        if is_admin and status == "DRAFT":
            actions.append("PUBLISH")
        if is_admin and status != "ARCHIVED":
            actions.append("ARCHIVE")
    elif item_type == "APPROVAL" and status == "PENDING" and (is_admin or "APPROVER" in roles):
        actions.extend(("APPROVE", "REJECT"))
    elif item_type == "TICKET" and (is_admin or creator or "ASSIGNEE" in roles):
        if status in ("OPEN", "WAITING"):
            actions.append("START")
        if status in ("OPEN", "IN_PROGRESS", "WAITING"):
            actions.append("RESOLVE")
        if status == "RESOLVED" and (is_admin or creator):
            actions.append("CLOSE")
        if status == "CLOSED" and (is_admin or creator):
            actions.append("REOPEN")
    elif item_type == "WIKI" and (is_admin or creator or "EDITOR" in roles):
        if status == "DRAFT":
            actions.append("PUBLISH")
        if status != "ARCHIVED":
            actions.append("ARCHIVE")
    elif item_type == "EVENT":
        if "ATTENDEE" in roles or creator or is_admin:
            actions.extend(("RSVP_ATTENDING", "RSVP_MAYBE", "RSVP_DECLINED"))
        if (is_admin or creator) and status not in ("COMPLETED", "CANCELLED"):
            actions.extend(("COMPLETE", "CANCEL"))
    elif item_type == "INTEGRATION" and is_admin:
        if status == "ACTIVE":
            actions.append("PAUSE")
        elif status in ("PAUSED", "ERROR"):
            actions.append("RESUME")
        if status != "ARCHIVED":
            actions.append("ARCHIVE")
    return actions


def transition_for_action(item, action, allowed):
    action = str(action or "").strip().upper()
    if action not in allowed:
        raise WorkspaceValidationError(
            "This action is not allowed for the current user or status.",
            code="FORBIDDEN",
            status_code=403,
        )
    if action in ("COMMENT", "ACKNOWLEDGE", "RSVP_ATTENDING", "RSVP_MAYBE", "RSVP_DECLINED"):
        return None
    transitions = {
        ("TASK", "START"): "IN_PROGRESS",
        ("TASK", "COMPLETE"): "DONE",
        ("TASK", "REOPEN"): "TODO",
        ("ANNOUNCEMENT", "ARCHIVE"): "ARCHIVED",
        ("ANNOUNCEMENT", "PUBLISH"): "PUBLISHED",
        ("APPROVAL", "APPROVE"): "APPROVED",
        ("APPROVAL", "REJECT"): "REJECTED",
        ("TICKET", "START"): "IN_PROGRESS",
        ("TICKET", "RESOLVE"): "RESOLVED",
        ("TICKET", "CLOSE"): "CLOSED",
        ("TICKET", "REOPEN"): "OPEN",
        ("WIKI", "PUBLISH"): "PUBLISHED",
        ("WIKI", "ARCHIVE"): "ARCHIVED",
        ("EVENT", "COMPLETE"): "COMPLETED",
        ("EVENT", "CANCEL"): "CANCELLED",
        ("INTEGRATION", "PAUSE"): "PAUSED",
        ("INTEGRATION", "RESUME"): "ACTIVE",
        ("INTEGRATION", "ARCHIVE"): "ARCHIVED",
    }
    new_status = transitions.get((item.item_type, action))
    if new_status is None:
        raise WorkspaceValidationError("Unsupported workspace action.")
    return new_status


def build_search_text(title, description, properties):
    property_values = []
    for value in (properties or {}).values():
        if isinstance(value, list):
            property_values.extend(str(entry) for entry in value)
        elif isinstance(value, (str, int, float)):
            property_values.append(str(value))
    return " ".join([str(title or ""), str(description or ""), *property_values]).lower()[:20000]
