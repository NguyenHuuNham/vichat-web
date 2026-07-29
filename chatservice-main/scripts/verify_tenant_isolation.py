"""Exercise Chatmgt tenant and participant isolation with temporary records."""

import argparse
import os
import secrets
import sys
import time
import uuid

import requests


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


from application.database import db
from application.models.models import (
    Conversation,
    ConversationParticipant,
    FriendRequest,
    ManagementAccount,
    ManagementTenant,
)
from application.services.auth_service import hash_password, issue_access_token
from application.server import app  # noqa: F401 - initializes application config


def require_status(response, expected, action):
    if response.status_code != expected:
        raise RuntimeError("{} returned HTTP {} instead of {}.".format(
            action, response.status_code, expected
        ))
    return response.json() if response.content else {}


def verify(base_url):
    suffix = uuid.uuid4().hex[:12]
    tenant_a_id = "verify-a-{}".format(suffix)
    tenant_b_id = "verify-b-{}".format(suffix)
    account_a_id = "verify-a-user-{}".format(suffix)
    account_a2_id = "verify-a-peer-{}".format(suffix)
    account_b_id = "verify-b-user-{}".format(suffix)
    created_conversation_ids = []
    now = int(time.time())

    try:
        tenant_a = ManagementTenant(
            id=tenant_a_id,
            name="Verification tenant A",
            active=True,
            created_at=now,
            updated_at=now,
            properties={"verification": True},
        )
        tenant_b = ManagementTenant(
            id=tenant_b_id,
            name="Verification tenant B",
            active=True,
            created_at=now,
            updated_at=now,
            properties={"verification": True},
        )
        password_hash = hash_password(secrets.token_urlsafe(48))
        account_a = ManagementAccount(
            id=account_a_id,
            tenant_id=tenant_a_id,
            username="verify-a-{}".format(suffix),
            email="verify-a-{}@invalid.local".format(suffix),
            password_hash=password_hash,
            full_name="Verification A",
            role="member",
            tinode_username="verifya{}".format(suffix),
            active=True,
            created_at=now,
            updated_at=now,
            properties={"auth_version": 0, "verification": True},
        )
        account_a2 = ManagementAccount(
            id=account_a2_id,
            tenant_id=tenant_a_id,
            username="verify-a-peer-{}".format(suffix),
            email="verify-a-peer-{}@invalid.local".format(suffix),
            password_hash=password_hash,
            full_name="Verification A peer",
            role="member",
            tinode_username="verifyapeer{}".format(suffix),
            active=True,
            created_at=now,
            updated_at=now,
            properties={"auth_version": 0, "verification": True},
        )
        account_b = ManagementAccount(
            id=account_b_id,
            tenant_id=tenant_b_id,
            username="verify-b-{}".format(suffix),
            email="verify-b-{}@invalid.local".format(suffix),
            password_hash=password_hash,
            full_name="Verification B",
            role="member",
            tinode_username="verifyb{}".format(suffix),
            active=True,
            created_at=now,
            updated_at=now,
            properties={"auth_version": 0, "verification": True},
        )
        db.session.add_all([tenant_a, tenant_b])
        db.session.flush()
        db.session.add_all([account_a, account_a2, account_b])
        db.session.flush()

        conversation_a = Conversation(
            tenant_id=tenant_a_id,
            conversation_no="verify-a-{}".format(suffix),
            subject="Verification A conversation",
            source="verification",
            status="OPEN",
            priority="NORMAL",
            properties={"is_group": True},
        )
        conversation_b = Conversation(
            tenant_id=tenant_b_id,
            conversation_no="verify-b-{}".format(suffix),
            subject="Verification B conversation",
            source="verification",
            status="OPEN",
            priority="NORMAL",
            properties={"is_group": True},
        )
        deleted_membership_conversation = Conversation(
            tenant_id=tenant_a_id,
            conversation_no="verify-deleted-{}".format(suffix),
            subject="Verification deleted membership",
            source="verification",
            status="OPEN",
            priority="NORMAL",
            properties={"is_group": True},
        )
        db.session.add_all([
            conversation_a,
            conversation_b,
            deleted_membership_conversation,
        ])
        db.session.flush()
        created_conversation_ids = [
            conversation_a.id,
            conversation_b.id,
            deleted_membership_conversation.id,
        ]
        db.session.add_all([
            ConversationParticipant(
                tenant_id=tenant_a_id,
                conversation_id=conversation_a.id,
                participant_type="USER",
                participant_id=account_a_id,
                role="OWNER",
                joined_at=now,
                active=True,
            ),
            # A malformed cross-tenant row must never be serialized to tenant A.
            ConversationParticipant(
                tenant_id=tenant_b_id,
                conversation_id=conversation_a.id,
                participant_type="USER",
                participant_id=account_b_id,
                role="MEMBER",
                joined_at=now,
                active=True,
            ),
            ConversationParticipant(
                tenant_id=tenant_b_id,
                conversation_id=conversation_b.id,
                participant_type="USER",
                participant_id=account_b_id,
                role="OWNER",
                joined_at=now,
                active=True,
            ),
            ConversationParticipant(
                tenant_id=tenant_a_id,
                conversation_id=deleted_membership_conversation.id,
                participant_type="USER",
                participant_id=account_a_id,
                role="OWNER",
                joined_at=now,
                active=True,
                deleted=True,
                deleted_at=now,
            ),
        ])
        db.session.commit()

        headers_a = {"Authorization": "Bearer {}".format(issue_access_token(account_a))}
        headers_a2 = {"Authorization": "Bearer {}".format(issue_access_token(account_a2))}
        base_url = base_url.rstrip("/")

        users = require_status(
            requests.get(
                base_url + "/api/v1/chat/users",
                params={"tenant_id": tenant_b_id},
                headers=headers_a,
                timeout=10,
            ),
            200,
            "Tenant A user list",
        ).get("objects") or []
        returned_user_ids = {str(item.get("id")) for item in users}
        if account_a_id not in returned_user_ids or account_a2_id not in returned_user_ids:
            raise RuntimeError("Tenant A user list omitted a same-tenant account.")
        if account_b_id in returned_user_ids:
            raise RuntimeError("Tenant A user list leaked a tenant B account.")
        if any(str(item.get("tenant_id")) != tenant_a_id for item in users):
            raise RuntimeError("Tenant A user list returned a foreign tenant identifier.")

        conversations = require_status(
            requests.get(
                base_url + "/api/v1/conversation",
                params={"tenant_id": tenant_b_id},
                headers=headers_a,
                timeout=10,
            ),
            200,
            "Tenant A conversation list",
        ).get("objects") or []
        returned_conversation_ids = {str(item.get("id")) for item in conversations}
        if str(conversation_a.id) not in returned_conversation_ids:
            raise RuntimeError("Tenant A conversation list omitted its own conversation.")
        if str(conversation_b.id) in returned_conversation_ids:
            raise RuntimeError("Tenant A conversation list leaked a tenant B conversation.")
        item_a = next(item for item in conversations if str(item.get("id")) == str(conversation_a.id))
        if account_b_id in {str(value) for value in item_a.get("participantIds") or []}:
            raise RuntimeError("Conversation serialization leaked a cross-tenant participant row.")

        require_status(
            requests.put(
                base_url + "/api/v1/conversation/{}/tinode-topic".format(
                    deleted_membership_conversation.id
                ),
                json={"tinode_topic": "grpVerification"},
                headers=headers_a,
                timeout=10,
            ),
            404,
            "Deleted participant topic binding",
        )
        require_status(
            requests.post(
                base_url + "/api/v1/friend-request",
                json={"recipient_id": account_b_id},
                headers=headers_a,
                timeout=10,
            ),
            404,
            "Cross-tenant friend request",
        )
        require_status(
            requests.post(
                base_url + "/api/v1/conversation/{}/participants".format(conversation_a.id),
                json={"participant_ids": [account_b_id]},
                headers=headers_a,
                timeout=10,
            ),
            400,
            "Cross-tenant participant add",
        )
        added = require_status(
            requests.post(
                base_url + "/api/v1/conversation/{}/participants".format(conversation_a.id),
                json={"participant_ids": [account_a2_id]},
                headers=headers_a,
                timeout=10,
            ),
            200,
            "Same-tenant participant add",
        )
        if account_a2_id not in {str(value) for value in added.get("participantIds") or []}:
            raise RuntimeError("Same-tenant participant was not persisted.")
        require_status(
            requests.delete(
                base_url + "/api/v1/conversation/{}/participants/{}".format(
                    conversation_a.id, account_a_id
                ),
                headers=headers_a2,
                timeout=10,
            ),
            403,
            "Non-owner participant removal",
        )
        removed = require_status(
            requests.delete(
                base_url + "/api/v1/conversation/{}/participants/{}".format(
                    conversation_a.id, account_a2_id
                ),
                headers=headers_a,
                timeout=10,
            ),
            200,
            "Owner participant removal",
        )
        if account_a2_id in {str(value) for value in removed.get("participantIds") or []}:
            raise RuntimeError("Removed participant remained visible in Chatmgt.")

        print("Two-tenant user, conversation, friend, and participant checks passed.")
    finally:
        db.session.rollback()
        ConversationParticipant.query.filter(
            ConversationParticipant.conversation_id.in_(created_conversation_ids)
        ).delete(synchronize_session=False) if created_conversation_ids else None
        FriendRequest.query.filter(
            FriendRequest.tenant_id.in_((tenant_a_id, tenant_b_id))
        ).delete(synchronize_session=False)
        Conversation.query.filter(
            Conversation.tenant_id.in_((tenant_a_id, tenant_b_id))
        ).delete(synchronize_session=False)
        ManagementAccount.query.filter(
            ManagementAccount.tenant_id.in_((tenant_a_id, tenant_b_id))
        ).delete(synchronize_session=False)
        ManagementTenant.query.filter(
            ManagementTenant.id.in_((tenant_a_id, tenant_b_id))
        ).delete(synchronize_session=False)
        db.session.commit()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://chatmgt:8093")
    args = parser.parse_args()
    verify(args.base_url)


if __name__ == "__main__":
    main()
