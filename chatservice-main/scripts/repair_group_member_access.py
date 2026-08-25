"""Audit or add missing Tinode access for active Chatmgt group members.

The repair is deliberately additive: it never removes subscribers, permissions,
messages, topics, avatars, read cursors, or Chatmgt records.

Dry run:
    python scripts/repair_group_member_access.py

Apply after the normal production database backup:
    python scripts/repair_group_member_access.py --apply --confirm add-missing-group-access
"""
import argparse
import asyncio
import json
import os
import sys
import uuid


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from application.models.models import (  # noqa: E402
    Conversation,
    ConversationParticipant,
    ManagementAccount,
)
from application.server import app  # noqa: E402
from application.services.auth_service import (  # noqa: E402
    AuthError,
    tinode_login,
    tinode_reconcile_topic_members,
    tinode_sso_login,
    tinode_sso_password,
    tinode_topic_member_access,
)


REQUIRED_MEMBER_MODE = "JRWPAS"
REQUIRED_OWNER_MODE = "JRWPASO"
APPLY_CONFIRMATION = "add-missing-group-access"


def account_identity(account):
    properties = account.properties or {}
    auth_source = str(properties.get("auth_source") or "local").strip().lower()
    account_user_id = str(account.id)
    if auth_source == "account":
        account_user_id = str(properties.get("account_user_id") or "").strip()
        account_tenant_id = str(properties.get("account_tenant_id") or "").strip()
        if not account_user_id or account_tenant_id != str(account.tenant_id):
            raise AuthError("The Account mapping is invalid.", 409)
    elif auth_source != "local":
        raise AuthError("The Chatmgt authentication source is unsupported.", 409)
    return {
        "account_user_id": account_user_id,
        "tenant_id": str(account.tenant_id),
        "full_name": account.full_name or account.username,
    }


async def login_account(account, repair_credentials=False):
    identity = account_identity(account)
    if repair_credentials:
        auth = await tinode_sso_login(identity, account.tinode_username, account.tinode_uid)
    else:
        auth = await tinode_login(
            account.tinode_username,
            tinode_sso_password(identity, account.tinode_username),
        )
    authenticated_uid = str(auth.get("uid") or "").strip()
    if authenticated_uid != str(account.tinode_uid or ""):
        raise AuthError("Tinode authenticated a different user.", 409)
    token = str(auth.get("token") or "").strip()
    if not token:
        raise AuthError("Tinode did not return an authentication token.", 502)
    return token


def group_state(item):
    participants = ConversationParticipant.query.filter(
        ConversationParticipant.tenant_id == item.tenant_id,
        ConversationParticipant.conversation_id == item.id,
        ConversationParticipant.active.is_(True),
        ConversationParticipant.approval_status == "APPROVED",
        ConversationParticipant.deleted.is_(False),
    ).all()
    participant_ids = [participant.participant_id for participant in participants]
    accounts = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == item.tenant_id,
        ManagementAccount.id.in_(participant_ids),
        ManagementAccount.active.is_(True),
    ).all() if participant_ids else []
    accounts_by_id = {str(account.id): account for account in accounts}
    if set(participant_ids) != set(accounts_by_id):
        raise AuthError("An active group participant has no active account.", 409)

    owner = next(
        (participant for participant in participants if str(participant.role or "").upper() == "OWNER"),
        None,
    )
    owner_account = accounts_by_id.get(owner.participant_id) if owner else None
    if owner_account is None or not owner_account.tinode_uid:
        raise AuthError("The active group owner has no Tinode mapping.", 409)

    access_modes = {}
    accounts_by_uid = {}
    for participant in participants:
        account = accounts_by_id[participant.participant_id]
        tinode_uid = str(account.tinode_uid or "").strip()
        if not tinode_uid:
            raise AuthError("An active group member has no Tinode mapping.", 409)
        access_modes[tinode_uid] = (
            REQUIRED_OWNER_MODE
            if str(participant.role or "").upper() == "OWNER"
            else REQUIRED_MEMBER_MODE
        )
        accounts_by_uid[tinode_uid] = account

    properties = item.properties or {}
    chatbot_uid = str(properties.get("chatbot_tinode_uid") or "").strip()
    if properties.get("chatbot_enabled") and chatbot_uid:
        access_modes[chatbot_uid] = REQUIRED_MEMBER_MODE

    return owner_account, access_modes, accounts_by_uid


def access_problems(access_by_uid, required_modes):
    missing = sorted(set(required_modes) - set(access_by_uid))
    deficient = {
        uid: {
            "required": required_mode,
            "actual": str((access_by_uid.get(uid) or {}).get("mode") or ""),
        }
        for uid, required_mode in required_modes.items()
        if uid in access_by_uid
        and not set(required_mode).issubset(set(str((access_by_uid.get(uid) or {}).get("mode") or "")))
    }
    return missing, deficient


async def inspect_groups(args):
    query = Conversation.query.filter(
        Conversation.tinode_topic.isnot(None),
        Conversation.deleted.is_(False),
    )
    if args.tenant:
        query = query.filter(Conversation.tenant_id == args.tenant)
    if args.conversation:
        query = query.filter(Conversation.id == uuid.UUID(str(args.conversation)))

    summary = {
        "groups_scanned": 0,
        "groups_with_missing_access": 0,
        "members_missing_subscription": 0,
        "members_with_partial_access": 0,
        "groups_repaired": 0,
        "groups_failed": 0,
        "dry_run": not args.apply,
    }
    for item in query.all():
        if not bool((item.properties or {}).get("is_group")):
            continue
        summary["groups_scanned"] += 1
        try:
            owner_account, required_modes, accounts_by_uid = group_state(item)
            owner_token = await login_account(owner_account, repair_credentials=args.apply)
            access_by_uid = await tinode_topic_member_access(
                owner_token,
                owner_account.tinode_uid,
                item.tinode_topic,
            )
            missing, deficient = access_problems(access_by_uid, required_modes)
            if not missing and not deficient:
                continue

            summary["groups_with_missing_access"] += 1
            summary["members_missing_subscription"] += len(missing)
            summary["members_with_partial_access"] += len(deficient)
            print("GROUP_ACCESS_PLAN", json.dumps({
                "conversation_id": str(item.id),
                "topic": str(item.tinode_topic),
                "missing": missing,
                "deficient": deficient,
            }, sort_keys=True))
            if not args.apply:
                continue

            tokens = {}
            for tinode_uid in sorted(set(missing) | set(deficient)):
                account = accounts_by_uid.get(tinode_uid)
                if account is None:
                    continue
                try:
                    tokens[tinode_uid] = await login_account(account, repair_credentials=True)
                except Exception as error:
                    print("GROUP_MEMBER_TOKEN_WARNING", json.dumps({
                        "conversation_id": str(item.id),
                        "uid": tinode_uid,
                        "error": str(error),
                    }, sort_keys=True))

            await tinode_reconcile_topic_members(
                owner_token,
                owner_account.tinode_uid,
                item.tinode_topic,
                set(required_modes),
                max_attempts=5,
                expected_access_modes=required_modes,
                member_tokens=tokens,
                remove_extra_members=False,
            )
            summary["groups_repaired"] += 1
        except Exception as error:
            summary["groups_failed"] += 1
            print("GROUP_ACCESS_ERROR", json.dumps({
                "conversation_id": str(item.id),
                "topic": str(item.tinode_topic or ""),
                "error": str(error),
            }, sort_keys=True))

    print("GROUP_ACCESS_SUMMARY", json.dumps(summary, sort_keys=True))
    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tenant", default="", help="Inspect only one tenant.")
    parser.add_argument("--conversation", default="", help="Inspect only one conversation UUID.")
    parser.add_argument("--apply", action="store_true", help="Add missing access and subscriptions.")
    parser.add_argument("--confirm", default="", help="Required confirmation phrase when applying.")
    args = parser.parse_args()
    if args.apply and args.confirm != APPLY_CONFIRMATION:
        raise RuntimeError("Pass --confirm {} when applying.".format(APPLY_CONFIRMATION))
    summary = asyncio.run(inspect_groups(args))
    if args.apply and summary["groups_failed"]:
        raise RuntimeError("Group access repair failed for one or more conversations.")


if __name__ == "__main__":
    main()
