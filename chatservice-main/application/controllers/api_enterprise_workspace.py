import logging
import time
import uuid

from gatco.response import json
from sqlalchemy import and_, func, or_

from application.controllers.api_chat_management import (
    _account_by_id,
    _current_session_error,
    _identity,
    _is_admin,
    _iso_timestamp,
    _management_account_sso_guard,
    _public_account,
    _user_id,
    _audit,
)
from application.database import db
from application.models.models import (
    Conversation,
    ConversationParticipant,
    EnterpriseActivity,
    EnterpriseItem,
    EnterpriseItemParticipant,
    ManagementAccount,
)
from application.server import app
from application.services.pagination import (
    PaginationError,
    bounded_int,
    cursor_uuid,
    decode_cursor,
    encode_cursor,
    page_payload,
)
from application.services.enterprise_workspace_service import (
    ITEM_STATUSES,
    ITEM_TYPES,
    WorkspaceValidationError,
    allowed_actions,
    build_search_text,
    can_create_type,
    can_edit_item,
    can_read_item,
    merge_properties,
    normalize_item_type,
    normalize_participants,
    transition_for_action,
    validate_item_payload,
)


logger = logging.getLogger(__name__)
TERMINAL_STATUSES = ("DONE", "CANCELLED", "APPROVED", "REJECTED", "RESOLVED", "CLOSED", "COMPLETED", "ARCHIVED")


def _error(error):
    return json({
        "error_code": getattr(error, "code", "PARAM_ERROR"),
        "error_message": str(error),
    }, status=getattr(error, "status_code", 400))


async def _workspace_identity(request):
    current_user, tenant_id = _identity(request)
    if current_user is None:
        return None, None, None, _current_session_error(request)
    management_guard = await _management_account_sso_guard(request, current_user, tenant_id)
    if management_guard is not None:
        return None, None, None, management_guard
    return current_user, tenant_id, _user_id(current_user), None


def _uuid(value):
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return None


def _item_query(tenant_id):
    return EnterpriseItem.query.filter(
        EnterpriseItem.tenant_id == tenant_id,
        EnterpriseItem.deleted.is_(False),
    )


def _item_by_id(tenant_id, item_id, lock=False):
    parsed_id = _uuid(item_id)
    if parsed_id is None:
        return None
    query = _item_query(tenant_id).filter(EnterpriseItem.id == parsed_id)
    return query.with_for_update().first() if lock else query.first()


def _participants(item_id, tenant_id):
    return EnterpriseItemParticipant.query.filter(
        EnterpriseItemParticipant.tenant_id == tenant_id,
        EnterpriseItemParticipant.item_id == item_id,
        EnterpriseItemParticipant.deleted.is_(False),
    ).order_by(EnterpriseItemParticipant.created_at.asc()).all()


def _participant_roles(participants, user_id):
    return {
        participant.role
        for participant in participants
        if str(participant.account_id) == str(user_id)
    }


def _viewer_can_read(item, user_id, is_admin, participants):
    return can_read_item(
        item,
        user_id,
        is_admin,
        [participant.account_id for participant in participants],
    )


def _activity_payload(activity, accounts_by_id=None):
    accounts_by_id = accounts_by_id or {}
    actor = accounts_by_id.get(str(activity.actor_id))
    return {
        "id": str(activity.id),
        "itemId": str(activity.item_id),
        "actorId": str(activity.actor_id),
        "actor": _public_account(actor) if actor is not None else None,
        "action": activity.action,
        "fromStatus": activity.from_status,
        "toStatus": activity.to_status,
        "comment": activity.comment or "",
        "data": activity.data or {},
        "createdAt": _iso_timestamp(activity.created_at),
    }


def _serialize_item(item, user_id, is_admin, participants=None, accounts_by_id=None, activities=None):
    participants = participants if participants is not None else _participants(item.id, item.tenant_id)
    account_ids = {
        str(item.created_by or ""),
        str(item.owner_id or ""),
        *[str(participant.account_id) for participant in participants],
    }
    account_ids.discard("")
    if accounts_by_id is None:
        accounts = ManagementAccount.query.filter(
            ManagementAccount.tenant_id == item.tenant_id,
            ManagementAccount.id.in_(account_ids),
        ).all() if account_ids else []
        accounts_by_id = {str(account.id): account for account in accounts}
    roles = _participant_roles(participants, user_id)
    viewer_participant = next(
        (participant for participant in participants if str(participant.account_id) == str(user_id)),
        None,
    )
    payload = {
        "id": str(item.id),
        "tenantId": item.tenant_id,
        "type": item.item_type,
        "title": item.title,
        "description": item.description or "",
        "status": item.status,
        "priority": item.priority,
        "visibility": item.visibility,
        "createdBy": str(item.created_by),
        "creator": _public_account(accounts_by_id.get(str(item.created_by))),
        "ownerId": str(item.owner_id or ""),
        "owner": _public_account(accounts_by_id.get(str(item.owner_id))) if item.owner_id else None,
        "conversationId": str(item.conversation_id or ""),
        "sourceMessageRef": item.source_message_ref or "",
        "dueAt": _iso_timestamp(item.due_at),
        "startsAt": _iso_timestamp(item.starts_at),
        "endsAt": _iso_timestamp(item.ends_at),
        "publishedAt": _iso_timestamp(item.published_at),
        "closedAt": _iso_timestamp(item.closed_at),
        "version": int(item.version or 1),
        "properties": item.properties or {},
        "participants": [
            {
                "id": str(participant.id),
                "accountId": str(participant.account_id),
                "account": _public_account(accounts_by_id.get(str(participant.account_id))),
                "role": participant.role,
                "state": participant.state,
                "respondedAt": _iso_timestamp(participant.responded_at),
                "acknowledgedAt": _iso_timestamp(participant.acknowledged_at),
            }
            for participant in participants
        ],
        "viewerState": viewer_participant.state if viewer_participant is not None else "",
        "viewerAcknowledgedAt": _iso_timestamp(viewer_participant.acknowledged_at) if viewer_participant is not None else None,
        "canEdit": can_edit_item(item, user_id, is_admin, roles),
        "allowedActions": allowed_actions(item, user_id, is_admin, roles),
        "createdAt": _iso_timestamp(item.created_at),
        "updatedAt": _iso_timestamp(item.updated_at),
    }
    if activities is not None:
        payload["activity"] = [
            _activity_payload(activity, accounts_by_id)
            for activity in activities
        ]
    return payload


def _prefetch_items(items, tenant_id):
    item_ids = [item.id for item in items]
    participant_rows = EnterpriseItemParticipant.query.filter(
        EnterpriseItemParticipant.tenant_id == tenant_id,
        EnterpriseItemParticipant.item_id.in_(item_ids),
        EnterpriseItemParticipant.deleted.is_(False),
    ).all() if item_ids else []
    participants_by_item = {}
    account_ids = set()
    for item in items:
        account_ids.update((str(item.created_by or ""), str(item.owner_id or "")))
    for participant in participant_rows:
        participants_by_item.setdefault(str(participant.item_id), []).append(participant)
        account_ids.add(str(participant.account_id))
    account_ids.discard("")
    accounts = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == tenant_id,
        ManagementAccount.id.in_(account_ids),
    ).all() if account_ids else []
    return participants_by_item, {str(account.id): account for account in accounts}


def _visible_query(tenant_id, user_id, is_admin):
    query = _item_query(tenant_id)
    if is_admin:
        return query
    participant_item_ids = db.session.query(EnterpriseItemParticipant.item_id).filter(
            EnterpriseItemParticipant.tenant_id == tenant_id,
            EnterpriseItemParticipant.account_id == user_id,
            EnterpriseItemParticipant.deleted.is_(False),
        )
    visibility_filters = [
        EnterpriseItem.visibility == "COMPANY",
        EnterpriseItem.created_by == user_id,
        EnterpriseItem.owner_id == user_id,
    ]
    visibility_filters.append(EnterpriseItem.id.in_(participant_item_ids))
    return query.filter(or_(*visibility_filters))


def _summary(query):
    now = int(time.time())
    due_soon_at = now + (7 * 24 * 60 * 60)
    by_type = {item_type: 0 for item_type in ITEM_TYPES}
    for item_type, count in query.with_entities(
        EnterpriseItem.item_type,
        func.count(EnterpriseItem.id),
    ).group_by(EnterpriseItem.item_type).all():
        by_type[item_type] = int(count or 0)
    by_status = {
        status: int(count or 0)
        for status, count in query.with_entities(
            EnterpriseItem.status,
            func.count(EnterpriseItem.id),
        ).group_by(EnterpriseItem.status).all()
    }
    active_due = query.filter(~EnterpriseItem.status.in_(TERMINAL_STATUSES))
    overdue = active_due.filter(
        EnterpriseItem.due_at.isnot(None),
        EnterpriseItem.due_at < now,
    ).with_entities(func.count(EnterpriseItem.id)).scalar() or 0
    due_soon = active_due.filter(
        EnterpriseItem.due_at.isnot(None),
        EnterpriseItem.due_at >= now,
        EnterpriseItem.due_at <= due_soon_at,
    ).with_entities(func.count(EnterpriseItem.id)).scalar() or 0
    total = query.with_entities(func.count(EnterpriseItem.id)).scalar() or 0
    return {
        "total": int(total),
        "byType": by_type,
        "byStatus": by_status,
        "overdue": int(overdue),
        "dueSoon": int(due_soon),
        "updatedAt": _iso_timestamp(now),
    }


def _validate_account_ids(tenant_id, account_ids):
    normalized = {str(account_id) for account_id in account_ids if account_id}
    accounts = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == tenant_id,
        ManagementAccount.id.in_(normalized),
        ManagementAccount.active.is_(True),
    ).all() if normalized else []
    accounts_by_id = {str(account.id): account for account in accounts}
    if set(accounts_by_id) != normalized:
        raise WorkspaceValidationError(
            "All workspace participants must be active accounts in the current tenant.",
            code="TENANT_VIOLATION",
        )
    return accounts_by_id


def _validate_conversation_reference(tenant_id, conversation_id, user_id, is_admin):
    if not conversation_id:
        return None
    parsed_id = _uuid(conversation_id)
    if parsed_id is None:
        raise WorkspaceValidationError("conversation_id is invalid.")
    conversation = Conversation.query.filter(
        Conversation.tenant_id == tenant_id,
        Conversation.id == parsed_id,
        Conversation.deleted.is_(False),
    ).first()
    if conversation is None:
        raise WorkspaceValidationError("The conversation does not belong to this tenant.", code="TENANT_VIOLATION")
    if not is_admin:
        membership = ConversationParticipant.query.filter(
            ConversationParticipant.tenant_id == tenant_id,
            ConversationParticipant.conversation_id == parsed_id,
            ConversationParticipant.participant_id == user_id,
            ConversationParticipant.active.is_(True),
            ConversationParticipant.deleted.is_(False),
        ).first()
        if membership is None:
            raise WorkspaceValidationError("The conversation is not accessible to this user.", code="FORBIDDEN", status_code=403)
    return parsed_id


def _replace_participants(item, tenant_id, participants):
    existing = EnterpriseItemParticipant.query.filter(
        EnterpriseItemParticipant.tenant_id == tenant_id,
        EnterpriseItemParticipant.item_id == item.id,
    ).order_by(EnterpriseItemParticipant.created_at.desc()).all()
    active_by_key = {}
    historical_by_key = {}
    for participant in existing:
        key = (str(participant.account_id), participant.role)
        historical_by_key.setdefault(key, participant)
        if not participant.deleted:
            active_by_key[key] = participant
    desired_keys = {
        (entry["account_id"], entry["role"])
        for entry in participants
    }
    removed = []
    for key, participant in active_by_key.items():
        if key not in desired_keys:
            participant.deleted = True
            participant.deleted_at = int(time.time())
            removed.append({"account_id": key[0], "role": key[1]})
    for entry in participants:
        key = (entry["account_id"], entry["role"])
        participant = active_by_key.get(key) or historical_by_key.get(key)
        if participant is None:
            db.session.add(EnterpriseItemParticipant(
                tenant_id=tenant_id,
                item_id=item.id,
                account_id=entry["account_id"],
                role=entry["role"],
                state="PENDING",
                properties={},
            ))
        else:
            was_deleted = bool(participant.deleted)
            participant.deleted = False
            participant.deleted_at = None
            if was_deleted:
                participant.state = "PENDING"
                participant.responded_at = None
                participant.acknowledged_at = None
    return removed


def _participant_values_for_update(item, body, existing_participants):
    """Fill omitted roles from the current row before applying a participant patch."""
    if "participants" not in body and "participant_ids" not in body:
        return None
    roles_by_account = {}
    for participant in existing_participants:
        roles_by_account.setdefault(str(participant.account_id), participant.role)
    source = body.get("participants")
    if source is None:
        source = body.get("participant_ids") or []
    normalized = []
    for entry in source:
        if isinstance(entry, dict):
            account_id = entry.get("account_id") or entry.get("id")
            if "role" in entry and entry.get("role"):
                normalized.append(entry)
            else:
                normalized.append({
                    **entry,
                    "account_id": account_id,
                    "role": roles_by_account.get(str(account_id), None),
                })
        else:
            normalized.append({
                "account_id": entry,
                "role": roles_by_account.get(str(entry), None),
            })
    return normalize_participants(item.item_type, {"participants": normalized})


def _add_activity(item, actor_id, action, from_status=None, to_status=None, comment="", data=None):
    db.session.add(EnterpriseActivity(
        tenant_id=item.tenant_id,
        item_id=item.id,
        actor_id=actor_id,
        action=action,
        from_status=from_status,
        to_status=to_status,
        comment=comment or None,
        data=data or {},
    ))


def _expected_version(body):
    if not isinstance(body, dict) or "version" not in body:
        raise WorkspaceValidationError("version is required for this operation.")
    try:
        return bounded_int(
            body.get("version"),
            name="version",
            default=0,
            minimum=1,
            maximum=2147483647,
        )
    except PaginationError as error:
        raise WorkspaceValidationError(str(error)) from error


def _version_conflict(item, current_version=None):
    return json({
        "error_code": "WORKSPACE_VERSION_CONFLICT",
        "error_message": "This workspace item changed. Reload it before saving again.",
        "current_version": int(current_version if current_version is not None else (item.version or 1)),
    }, status=409)


@app.route('/api/v1/workspace/items', methods=['GET'])
async def enterprise_item_list(request):
    current_user, tenant_id, user_id, auth_error = await _workspace_identity(request)
    if auth_error is not None:
        return auth_error
    is_admin = _is_admin(current_user)
    query = _visible_query(tenant_id, user_id, is_admin)
    item_type = str(request.args.get("type") or "").strip().upper()
    status = str(request.args.get("status") or "").strip().upper()
    query_text = str(request.args.get("q") or "").strip().lower()
    if item_type:
        try:
            query = query.filter(EnterpriseItem.item_type == normalize_item_type(item_type))
        except WorkspaceValidationError as error:
            return _error(error)
    if status:
        query = query.filter(EnterpriseItem.status == status)
    if query_text:
        query = query.filter(func.lower(EnterpriseItem.search_text).like("%{}%".format(query_text[:200])))
    try:
        updated_since = bounded_int(
            request.args.get("updated_since"),
            name="updated_since",
            default=0,
            minimum=0,
            maximum=4102444800,
        )
        limit = bounded_int(
            request.args.get("limit"),
            name="limit",
            default=100,
            minimum=1,
            maximum=100,
        )
        cursor = decode_cursor(request.args.get("cursor")) if request.args.get("cursor") else None
    except PaginationError as error:
        return _error(WorkspaceValidationError(str(error)))
    if updated_since > 0:
        query = query.filter(EnterpriseItem.updated_at > updated_since)
    summary = _summary(query)
    if cursor:
        try:
            cursor_updated = int(cursor.get("updated") or 0)
            cursor_id = cursor_uuid(cursor.get("id"))
        except (PaginationError, TypeError, ValueError):
            return _error(WorkspaceValidationError("Cursor is invalid."))
        query = query.filter(or_(
            EnterpriseItem.updated_at < cursor_updated,
            and_(EnterpriseItem.updated_at == cursor_updated, EnterpriseItem.id < cursor_id),
        ))
    visible_items = query.order_by(
        EnterpriseItem.updated_at.desc(),
        EnterpriseItem.id.desc(),
    ).limit(limit + 1).all()
    has_more = len(visible_items) > limit
    visible_items = visible_items[:limit]
    participants_by_item, accounts_by_id = _prefetch_items(visible_items, tenant_id)
    next_cursor = None
    if has_more and visible_items:
        last = visible_items[-1]
        next_cursor = encode_cursor({
            "v": 1,
            "updated": int(last.updated_at or 0),
            "id": str(last.id),
        })
    return json({
        **page_payload([
            _serialize_item(
                item,
                user_id,
                is_admin,
                participants_by_item.get(str(item.id), []),
                accounts_by_id,
            )
            for item in visible_items
        ], next_cursor=next_cursor, limit=limit),
        "summary": summary,
    })


@app.route('/api/v1/workspace/stats', methods=['GET'])
async def enterprise_stats(request):
    current_user, tenant_id, user_id, auth_error = await _workspace_identity(request)
    if auth_error is not None:
        return auth_error
    return json(_summary(_visible_query(tenant_id, user_id, _is_admin(current_user))))


@app.route('/api/v1/workspace/search', methods=['GET'])
async def enterprise_search(request):
    return await enterprise_item_list(request)


@app.route('/api/v1/workspace/items', methods=['POST'])
async def enterprise_item_create(request):
    current_user, tenant_id, user_id, auth_error = await _workspace_identity(request)
    if auth_error is not None:
        return auth_error
    body = request.json or {}
    is_admin = _is_admin(current_user)
    try:
        values = validate_item_payload(body)
        if not can_create_type(values["item_type"], is_admin):
            raise WorkspaceValidationError(
                "Administrator permission is required for this workspace item type.",
                code="FORBIDDEN",
                status_code=403,
            )
        participant_values = normalize_participants(values["item_type"], body)
        if values["item_type"] == "APPROVAL" and not participant_values:
            raise WorkspaceValidationError("An approval requires at least one approver.")
        owner_id = values.pop("owner_id", None) or user_id
        _validate_account_ids(
            tenant_id,
            [owner_id, *[entry["account_id"] for entry in (participant_values or [])]],
        )
        conversation_id = _validate_conversation_reference(
            tenant_id,
            values.pop("conversation_id", None),
            user_id,
            is_admin,
        )
        item = EnterpriseItem(
            tenant_id=tenant_id,
            created_by=user_id,
            owner_id=owner_id,
            conversation_id=conversation_id,
            source_message_ref=values.pop("source_message_ref", None),
            published_at=int(time.time()) if values.get("status") == "PUBLISHED" else None,
            closed_at=int(time.time()) if values.get("status") in TERMINAL_STATUSES else None,
            version=1,
            **values
        )
        item.search_text = build_search_text(item.title, item.description, item.properties)
        db.session.add(item)
        db.session.flush()
        _replace_participants(item, tenant_id, participant_values or [])
        _add_activity(item, user_id, "CREATED", to_status=item.status)
        db.session.commit()
        _audit(request, "ENTERPRISE_ITEM_CREATED", True, tenant_id, user_id, {
            "item_id": str(item.id),
            "item_type": item.item_type,
        })
        return json(_serialize_item(item, user_id, is_admin), status=201)
    except WorkspaceValidationError as error:
        db.session.rollback()
        return _error(error)
    except Exception as error:
        db.session.rollback()
        logger.exception("Enterprise item creation failed: %s", error)
        return json({"error_code": "WORKSPACE_CREATE_FAILED", "error_message": "Could not create the workspace item."}, status=500)


@app.route('/api/v1/workspace/items/<item_id>', methods=['GET'])
async def enterprise_item_detail(request, item_id):
    current_user, tenant_id, user_id, auth_error = await _workspace_identity(request)
    if auth_error is not None:
        return auth_error
    item = _item_by_id(tenant_id, item_id)
    if item is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Workspace item not found."}, status=404)
    participants = _participants(item.id, tenant_id)
    is_admin = _is_admin(current_user)
    if not _viewer_can_read(item, user_id, is_admin, participants):
        return json({"error_code": "NOT_FOUND", "error_message": "Workspace item not found."}, status=404)
    activities = EnterpriseActivity.query.filter(
        EnterpriseActivity.tenant_id == tenant_id,
        EnterpriseActivity.item_id == item.id,
        EnterpriseActivity.deleted.is_(False),
    ).order_by(EnterpriseActivity.created_at.desc()).limit(100).all()
    account_ids = {
        str(activity.actor_id) for activity in activities
    } | {
        str(item.created_by or ""), str(item.owner_id or "")
    } | {
        str(participant.account_id) for participant in participants
    }
    account_ids.discard("")
    accounts = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == tenant_id,
        ManagementAccount.id.in_(account_ids),
    ).all() if account_ids else []
    accounts_by_id = {str(account.id): account for account in accounts}
    return json(_serialize_item(item, user_id, is_admin, participants, accounts_by_id, activities))


@app.route('/api/v1/workspace/items/<item_id>', methods=['PUT'])
async def enterprise_item_update(request, item_id):
    current_user, tenant_id, user_id, auth_error = await _workspace_identity(request)
    if auth_error is not None:
        return auth_error
    item = _item_by_id(tenant_id, item_id, lock=True)
    if item is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Workspace item not found."}, status=404)
    participants = _participants(item.id, tenant_id)
    is_admin = _is_admin(current_user)
    roles = _participant_roles(participants, user_id)
    if not can_edit_item(item, user_id, is_admin, roles):
        return json({"error_code": "FORBIDDEN", "error_message": "You cannot edit this workspace item."}, status=403)
    body = request.json or {}
    try:
        expected_version = _expected_version(body)
        current_version = int(item.version or 1)
        if expected_version != current_version:
            db.session.rollback()
            return _version_conflict(item, current_version)
        values = validate_item_payload(body, existing_type=item.item_type, partial=True)
        values.pop("item_type", None)
        if "status" in values and values["status"] != item.status:
            raise WorkspaceValidationError("Use a workspace action to change status.")
        values.pop("status", None)
        participant_values = _participant_values_for_update(item, body, participants)
        owner_id = values.pop("owner_id", item.owner_id)
        if owner_id:
            _validate_account_ids(tenant_id, [owner_id])
            item.owner_id = owner_id
        if "conversation_id" in values:
            item.conversation_id = _validate_conversation_reference(
                tenant_id,
                values.pop("conversation_id"),
                user_id,
                is_admin,
            )
        if "source_message_ref" in values:
            item.source_message_ref = values.pop("source_message_ref")
        changed_fields = []
        removed_participants = []
        if "properties" in body:
            values["properties"] = merge_properties(
                item.item_type,
                item.properties,
                body.get("properties"),
            )
        for field_name, value in values.items():
            if getattr(item, field_name) != value:
                setattr(item, field_name, value)
                changed_fields.append(field_name)
        if item.starts_at is not None and item.ends_at is not None and item.ends_at < item.starts_at:
            raise WorkspaceValidationError("ends_at must be after starts_at.")
        if participant_values is not None:
            if item.item_type == "APPROVAL" and not any(
                entry["role"] == "APPROVER" for entry in participant_values
            ):
                raise WorkspaceValidationError("An approval requires at least one approver.")
            _validate_account_ids(tenant_id, [entry["account_id"] for entry in participant_values])
            removed_participants = _replace_participants(item, tenant_id, participant_values)
            changed_fields.append("participants")
        item.version = expected_version + 1
        item.search_text = build_search_text(item.title, item.description, item.properties)
        _add_activity(item, user_id, "UPDATED", from_status=item.status, to_status=item.status, data={
            "fields": sorted(set(changed_fields)),
            "version": item.version,
            "removedParticipants": removed_participants,
        })
        db.session.commit()
        _audit(request, "ENTERPRISE_ITEM_UPDATED", True, tenant_id, user_id, {
            "item_id": str(item.id),
            "item_type": item.item_type,
        })
        return json(_serialize_item(item, user_id, is_admin))
    except WorkspaceValidationError as error:
        db.session.rollback()
        return _error(error)
    except Exception as error:
        db.session.rollback()
        logger.exception("Enterprise item update failed: %s", error)
        return json({"error_code": "WORKSPACE_UPDATE_FAILED", "error_message": "Could not update the workspace item."}, status=500)


@app.route('/api/v1/workspace/items/<item_id>', methods=['DELETE'])
async def enterprise_item_delete(request, item_id):
    current_user, tenant_id, user_id, auth_error = await _workspace_identity(request)
    if auth_error is not None:
        return auth_error
    item = _item_by_id(tenant_id, item_id, lock=True)
    if item is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Workspace item not found."}, status=404)
    participants = _participants(item.id, tenant_id)
    is_admin = _is_admin(current_user)
    if not can_edit_item(item, user_id, is_admin, _participant_roles(participants, user_id)):
        return json({"error_code": "FORBIDDEN", "error_message": "You cannot archive this workspace item."}, status=403)
    try:
        expected_version = _expected_version(request.json or {})
    except WorkspaceValidationError as error:
        db.session.rollback()
        return _error(error)
    current_version = int(item.version or 1)
    if expected_version != current_version:
        db.session.rollback()
        return _version_conflict(item, current_version)
    now = int(time.time())
    item.deleted = True
    item.deleted_at = now
    item.closed_at = item.closed_at or now
    item.version = expected_version + 1
    _add_activity(item, user_id, "ARCHIVED", from_status=item.status, to_status="ARCHIVED")
    db.session.commit()
    _audit(request, "ENTERPRISE_ITEM_ARCHIVED", True, tenant_id, user_id, {
        "item_id": str(item.id),
        "item_type": item.item_type,
    })
    return json({"deleted": True, "id": str(item.id)})


@app.route('/api/v1/workspace/items/<item_id>/actions', methods=['POST'])
async def enterprise_item_action(request, item_id):
    current_user, tenant_id, user_id, auth_error = await _workspace_identity(request)
    if auth_error is not None:
        return auth_error
    item = _item_by_id(tenant_id, item_id, lock=True)
    if item is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Workspace item not found."}, status=404)
    participants = _participants(item.id, tenant_id)
    is_admin = _is_admin(current_user)
    if not _viewer_can_read(item, user_id, is_admin, participants):
        return json({"error_code": "NOT_FOUND", "error_message": "Workspace item not found."}, status=404)
    body = request.json or {}
    try:
        expected_version = _expected_version(body)
    except WorkspaceValidationError as error:
        db.session.rollback()
        return _error(error)
    current_version = int(item.version or 1)
    if expected_version != current_version:
        db.session.rollback()
        return _version_conflict(item, current_version)
    action = str(body.get("action") or "").strip().upper()
    comment = str(body.get("comment") or "").strip()
    if len(comment) > 5000:
        return _error(WorkspaceValidationError("comment is too long."))
    roles = _participant_roles(participants, user_id)
    allowed = allowed_actions(item, user_id, is_admin, roles)
    try:
        new_status = transition_for_action(item, action, allowed)
        now = int(time.time())
        viewer_participant = next(
            (participant for participant in participants if str(participant.account_id) == str(user_id)),
            None,
        )
        from_status = item.status
        if action == "ACKNOWLEDGE":
            if viewer_participant is None:
                viewer_participant = EnterpriseItemParticipant(
                    tenant_id=tenant_id,
                    item_id=item.id,
                    account_id=user_id,
                    role="RECIPIENT",
                    state="ACKNOWLEDGED",
                    acknowledged_at=now,
                    properties={},
                )
                db.session.add(viewer_participant)
            else:
                viewer_participant.state = "ACKNOWLEDGED"
                viewer_participant.acknowledged_at = now
        elif action.startswith("RSVP_"):
            state = action.replace("RSVP_", "")
            if viewer_participant is None:
                viewer_participant = EnterpriseItemParticipant(
                    tenant_id=tenant_id,
                    item_id=item.id,
                    account_id=user_id,
                    role="ATTENDEE",
                    state=state,
                    responded_at=now,
                    properties={},
                )
                db.session.add(viewer_participant)
            else:
                viewer_participant.state = state
                viewer_participant.responded_at = now
        elif item.item_type == "APPROVAL" and action in ("APPROVE", "REJECT"):
            approver = next(
                (participant for participant in participants if str(participant.account_id) == str(user_id) and participant.role == "APPROVER"),
                None,
            )
            if approver is not None:
                approver.state = "APPROVED" if action == "APPROVE" else "REJECTED"
                approver.responded_at = now
                if action == "REJECT":
                    new_status = "REJECTED"
                else:
                    pending_approvers = [
                        participant for participant in participants
                        if participant.role == "APPROVER"
                        and participant.id != approver.id
                        and participant.state != "APPROVED"
                    ]
                    new_status = "PENDING" if pending_approvers else "APPROVED"
        if new_status is not None and new_status != item.status:
            item.status = new_status
            if new_status == "PUBLISHED":
                item.published_at = now
            if new_status in TERMINAL_STATUSES:
                item.closed_at = now
            elif action in ("REOPEN", "RESUME"):
                item.closed_at = None
        item.version = expected_version + 1
        _add_activity(
            item,
            user_id,
            action,
            from_status=from_status,
            to_status=item.status,
            comment=comment,
        )
        db.session.commit()
        _audit(request, "ENTERPRISE_ITEM_ACTION", True, tenant_id, user_id, {
            "item_id": str(item.id),
            "item_type": item.item_type,
            "action": action,
        })
        return json(_serialize_item(item, user_id, is_admin))
    except WorkspaceValidationError as error:
        db.session.rollback()
        return _error(error)
    except Exception as error:
        db.session.rollback()
        logger.exception("Enterprise action failed: %s", error)
        return json({"error_code": "WORKSPACE_ACTION_FAILED", "error_message": "Could not apply the workspace action."}, status=500)


@app.route('/api/v1/workspace/items/<item_id>/activity', methods=['GET'])
async def enterprise_item_activity(request, item_id):
    current_user, tenant_id, user_id, auth_error = await _workspace_identity(request)
    if auth_error is not None:
        return auth_error
    item = _item_by_id(tenant_id, item_id)
    if item is None:
        return json({"error_code": "NOT_FOUND", "error_message": "Workspace item not found."}, status=404)
    participants = _participants(item.id, tenant_id)
    if not _viewer_can_read(item, user_id, _is_admin(current_user), participants):
        return json({"error_code": "NOT_FOUND", "error_message": "Workspace item not found."}, status=404)
    activities = EnterpriseActivity.query.filter(
        EnterpriseActivity.tenant_id == tenant_id,
        EnterpriseActivity.item_id == item.id,
        EnterpriseActivity.deleted.is_(False),
    ).order_by(EnterpriseActivity.created_at.desc()).limit(200).all()
    actor_ids = {str(activity.actor_id) for activity in activities}
    accounts = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == tenant_id,
        ManagementAccount.id.in_(actor_ids),
    ).all() if actor_ids else []
    accounts_by_id = {str(account.id): account for account in accounts}
    return json({"objects": [_activity_payload(activity, accounts_by_id) for activity in activities]})


@app.route('/api/v1/workspace/meta', methods=['GET'])
async def enterprise_meta(request):
    current_user, tenant_id, user_id, auth_error = await _workspace_identity(request)
    if auth_error is not None:
        return auth_error
    return json({
        "tenantId": tenant_id,
        "userId": user_id,
        "isAdmin": _is_admin(current_user),
        "types": list(ITEM_TYPES),
        "statuses": {item_type: list(statuses) for item_type, statuses in ITEM_STATUSES.items()},
    })
