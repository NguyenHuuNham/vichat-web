"""Reset Chatmgt Tinode mappings for a fresh central Tinode switch.

This is a one-time destructive data operation. Chatmgt accounts, tenants,
conversation IDs and memberships are preserved; Tinode UIDs/topics and
automatic chat-derived knowledge copies are intentionally discarded.
Use it only after the new chatapi.gonplatform.com Tinode endpoint is ready.

Dry run:
    python scripts/switch_tinode_central.py
Apply only after a verified database backup:
    python scripts/switch_tinode_central.py --apply --confirm chatapi.gonplatform.com
"""
import argparse
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from application.database import db
from application.models.models import (
    Conversation,
    EnterpriseItem,
    KnowledgeChunk,
    KnowledgeDocument,
    ManagementAccount,
)
from application.server import app
from application.services.enterprise_workspace_service import build_search_text


CENTRAL_WS_URL = "ws://chat:80/v0/channels"
TARGET_CENTRAL_WS_URL = "wss://chatapi.gonplatform.com/v0/channels"


def _tenant_filter(query, model, tenant_id):
    if tenant_id:
        return query.filter(model.tenant_id == tenant_id)
    return query


def collect_counts(tenant_id=None):
    account_query = _tenant_filter(
        ManagementAccount.query.filter(ManagementAccount.tinode_uid.isnot(None)),
        ManagementAccount,
        tenant_id,
    )
    conversation_query = _tenant_filter(
        Conversation.query.filter(Conversation.tinode_topic.isnot(None)),
        Conversation,
        tenant_id,
    )
    document_query = _tenant_filter(
        KnowledgeDocument.query.filter(
            KnowledgeDocument.source_type.like("CHAT_%"),
            KnowledgeDocument.deleted.is_(False),
        ),
        KnowledgeDocument,
        tenant_id,
    )
    documents = document_query.all()
    document_ids = [document.id for document in documents]
    chunk_count = KnowledgeChunk.query.filter(
        KnowledgeChunk.deleted.is_(False),
        KnowledgeChunk.document_id.in_(document_ids),
    ).count() if document_ids else 0
    task_query = _tenant_filter(
        EnterpriseItem.query.filter(EnterpriseItem.item_type == "TASK"),
        EnterpriseItem,
        tenant_id,
    )
    task_count = sum(
        1 for item in task_query.all()
        if isinstance(item.properties, dict) and "source_message_preview" in item.properties
    )
    return {
        "accounts_with_tinode_uid": account_query.count(),
        "conversations_with_tinode_topic": conversation_query.count(),
        "chat_documents": len(documents),
        "chat_chunks": chunk_count,
        "tasks_with_message_preview": task_count,
    }


def apply_reset(tenant_id=None):
    account_query = _tenant_filter(
        ManagementAccount.query.filter(ManagementAccount.tinode_uid.isnot(None)),
        ManagementAccount,
        tenant_id,
    )
    conversation_query = _tenant_filter(
        Conversation.query.filter(Conversation.tinode_topic.isnot(None)),
        Conversation,
        tenant_id,
    )
    account_count = account_query.update(
        {ManagementAccount.tinode_uid: None}, synchronize_session=False
    )
    conversation_count = conversation_query.update(
        {Conversation.tinode_topic: None}, synchronize_session=False
    )

    document_query = _tenant_filter(
        KnowledgeDocument.query.filter(
            KnowledgeDocument.source_type.like("CHAT_%"),
            KnowledgeDocument.deleted.is_(False),
        ),
        KnowledgeDocument,
        tenant_id,
    )
    documents = document_query.all()
    document_ids = [document.id for document in documents]
    chunk_count = KnowledgeChunk.query.filter(
        KnowledgeChunk.deleted.is_(False),
        KnowledgeChunk.document_id.in_(document_ids),
    ).delete(synchronize_session=False) if document_ids else 0
    document_count = document_query.delete(synchronize_session=False)

    task_query = _tenant_filter(
        EnterpriseItem.query.filter(EnterpriseItem.item_type == "TASK"),
        EnterpriseItem,
        tenant_id,
    )
    task_count = 0
    for item in task_query.all():
        properties = dict(item.properties or {})
        if "source_message_preview" not in properties:
            continue
        preview = str(properties.pop("source_message_preview") or "")
        if str(item.description or "").strip() == preview.strip():
            item.description = ""
        item.properties = properties
        item.search_text = build_search_text(item.title, item.description, properties)
        item.version = int(item.version or 1) + 1
        task_count += 1

    db.session.commit()
    return {
        "accounts_reset": int(account_count),
        "conversations_reset": int(conversation_count),
        "chat_documents_deleted": int(document_count),
        "chat_chunks_deleted": int(chunk_count),
        "task_previews_removed": int(task_count),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tenant", default="", help="Reset only one tenant; default is all tenants.")
    parser.add_argument("--apply", action="store_true", help="Apply the destructive reset.")
    parser.add_argument(
        "--confirm",
        default="",
        help="Must equal chatapi.gonplatform.com when applying.",
    )
    args = parser.parse_args()

    configured_url = str(os.getenv("TINODE_INTERNAL_WS_URL") or "")
    if args.apply and configured_url != CENTRAL_WS_URL:
        raise RuntimeError(
            "TINODE_INTERNAL_WS_URL must be {} before applying the reset.".format(CENTRAL_WS_URL)
        )
    configured_central_url = str(os.getenv("TINODE_CENTRAL_WS_URL") or "").strip()
    if args.apply and configured_central_url != TARGET_CENTRAL_WS_URL:
        raise RuntimeError(
            "TINODE_CENTRAL_WS_URL must be {} before applying the fresh-data reset.".format(
                TARGET_CENTRAL_WS_URL
            )
        )

    counts = collect_counts(args.tenant or None)
    print("CENTRAL_TINODE_RESET_PLAN", counts)
    if not args.apply:
        print("DRY_RUN_ONLY")
        return
    if args.confirm != "chatapi.gonplatform.com":
        raise RuntimeError(
            "Pass --confirm chatapi.gonplatform.com to apply this destructive reset."
        )
    result = apply_reset(args.tenant or None)
    print("CENTRAL_TINODE_RESET_APPLIED", result)


if __name__ == "__main__":
    main()
