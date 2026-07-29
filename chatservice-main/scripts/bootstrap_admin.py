"""Create the first Chatmgt administrator after Tinode is ready."""

import argparse
import asyncio
import os
import re
import sys
import time
import uuid

import aiohttp
from sqlalchemy import text

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from application.database import db
from application.models.models import ManagementAccount, ManagementTenant
from application.services.auth_service import AuthError, hash_password, tinode_login


USERNAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{2,63}$")
BOOTSTRAP_LOCK_ID = 1447319171


def required_env(name, fallback=None):
    value = str(os.getenv(name) or (os.getenv(fallback) if fallback else "") or "").strip()
    if not value or value.startswith("replace-with-"):
        raise RuntimeError("{} is required.".format(name))
    return value


async def wait_for_tinode(username, password, wait_seconds):
    deadline = time.monotonic() + max(0, wait_seconds)
    while True:
        try:
            return await tinode_login(username, password)
        except AuthError as error:
            if error.status_code == 401:
                raise RuntimeError("Tinode rejected the configured administrator credentials.")
            last_error = error
        except (aiohttp.ClientError, asyncio.TimeoutError, OSError) as error:
            last_error = error

        if time.monotonic() >= deadline:
            raise RuntimeError(
                "Tinode did not become ready (last error: {}).".format(
                    type(last_error).__name__
                )
            )
        await asyncio.sleep(2)


async def bootstrap(wait_seconds):
    username = required_env("TINODE_ADMIN_USERNAME").lower()
    password = required_env("TINODE_ADMIN_PASSWORD")
    tenant_id = required_env("CHATMGT_DEFAULT_TENANT")
    full_name = required_env("CHATMGT_BOOTSTRAP_ADMIN_FULL_NAME")
    email = required_env("CHATMGT_BOOTSTRAP_ADMIN_EMAIL").lower()

    if not USERNAME_PATTERN.fullmatch(username):
        raise RuntimeError("TINODE_ADMIN_USERNAME contains unsupported characters.")
    if len(password) < 12:
        raise RuntimeError("TINODE_ADMIN_PASSWORD must contain at least 12 characters.")
    if len(password.encode("utf-8")) > 72:
        raise RuntimeError("TINODE_ADMIN_PASSWORD must not exceed 72 UTF-8 bytes.")

    tinode_auth = await wait_for_tinode(username, password, wait_seconds)

    try:
        db.session.execute(
            text("SELECT pg_advisory_xact_lock(:lock_id)"),
            {"lock_id": BOOTSTRAP_LOCK_ID},
        )
        if ManagementAccount.query.count() > 0:
            db.session.rollback()
            print("Chatmgt already has accounts; bootstrap was not applied.")
            return

        tenant = ManagementTenant.query.filter(
            ManagementTenant.id == tenant_id,
            ManagementTenant.active.is_(True),
        ).first()
        if tenant is None:
            raise RuntimeError("The configured bootstrap tenant does not exist or is inactive.")

        now = int(time.time())
        account = ManagementAccount(
            id="usr-bootstrap-{}".format(uuid.uuid4().hex),
            tenant_id=tenant_id,
            username=username,
            email=email,
            password_hash=hash_password(password),
            full_name=full_name,
            role="admin",
            department="",
            title="Administrator",
            avatar="",
            tinode_username=username,
            tinode_uid=tinode_auth.get("uid"),
            active=True,
            created_at=now,
            updated_at=now,
            properties={"bootstrap": True, "auth_version": 0},
        )
        db.session.add(account)
        db.session.commit()
        print("Created the first Chatmgt administrator after verifying Tinode login.")
    except Exception:
        db.session.rollback()
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wait-seconds", type=int, default=120)
    args = parser.parse_args()
    asyncio.run(bootstrap(args.wait_seconds))


if __name__ == "__main__":
    main()
