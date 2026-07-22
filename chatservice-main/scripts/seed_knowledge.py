"""Seed the default SÔNG HỒNG knowledge base.

Run from chatservice-main after PostgreSQL and the migration are available:
    python scripts/seed_knowledge.py
Use --file to ingest your own JSON with the same {base, documents} shape.
"""
import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from application.database import db
from application.models.models import KnowledgeBase
from application.server import app
from application.services.knowledge_service import KnowledgeService


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default=os.path.join(ROOT, "knowledge", "songhong-default.json"))
    parser.add_argument("--tenant", default=os.getenv("CHATBOT_DEFAULT_TENANT", "songhong"))
    args = parser.parse_args()

    with open(args.file, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    base_payload = payload.get("base") or {}
    code = str(base_payload.get("code") or "songhong-company").strip()
    base = KnowledgeBase.query.filter(
        KnowledgeBase.tenant_id == args.tenant,
        KnowledgeBase.code == code,
        KnowledgeBase.deleted.is_(False),
    ).first()
    if base is None:
        service = KnowledgeService(app)
        base_data = service.create_base(args.tenant, base_payload)
        base_id = base_data["id"]
        print("Created knowledge base", base_id)
    else:
        base_id = str(base.id)
        print("Using existing knowledge base", base_id)

    service = KnowledgeService(app)
    for document in payload.get("documents") or []:
        result = service.ingest_text(
            args.tenant,
            base_id,
            document.get("title"),
            document.get("content"),
            source_type="TEXT",
            uploaded_by="seed",
        )
        print("Ingested", result.get("title"), result.get("id"), "duplicate=" + str(result.get("duplicate", False)))


if __name__ == "__main__":
    main()
