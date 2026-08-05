# Chatmgt service

Chatmgt stores management accounts, tenant-scoped metadata, security audit
events, organization data, and explicitly uploaded chatbot knowledge in its own
PostgreSQL database. The central Tinode at `web.vichat.net` remains the sole
source of normal realtime messages and uploaded chat files; legacy automatic
chat-ingestion routes return `410 TINODE_CONTENT_ONLY`.

Per-user conversation notification preferences are also Chatmgt metadata. The
authenticated participant may set an absolute mute deadline, clear it, or use
the indefinite sentinel through the conversation notification-settings API.
Chatmgt never suppresses Tinode messages or unread receipts; ChatUI applies the
preference only to the local alert sound.

For Account SSO employees, identity fields remain read-only projections. The
authenticated `POST /api/v1/auth/avatar` endpoint is the narrow exception: it
validates the Account user and tenant, uploads the image through the configured
UpGO media endpoint, updates that same Account user, and only then refreshes the
Chatmgt projection. It never accepts a target user ID from the browser.

Container builds install `requirements.lock`, generated and verified from the
pinned Python 3.9 Linux image. `requirements.txt` remains the direct dependency
input; update the lock only after a clean Linux image build succeeds.

## Database migrations

The migration source is `migrations/*.sql`, wrapped by the ordered Alembic
revisions in `alembic/versions/`. The revisions support both a new database and
an existing database that already received the legacy SQL files.

Run from `chatservice-main` with the project virtual environment active and
`SQLALCHEMY_DATABASE_URI` configured:

```bash
alembic -c alembic.ini current
alembic -c alembic.ini upgrade head
alembic -c alembic.ini current
```

Never delete `alembic/versions`. Baseline downgrade is intentionally blocked;
restore a verified PostgreSQL backup when rollback is required.

## Administrator authentication

Production management login is owned by UpGO Account. With
`CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED=true`, `POST /api/v1/admin/sso` validates the
current Account tenant and allows only `admin`, `owner`, or `superadmin`. The
public local `/login` endpoint is disabled, and management/chat JWT scopes are
not interchangeable.

The legacy bootstrap command remains available only for development or
recovery environments where Account-admin SSO is explicitly disabled. After
Tinode is ready, configure `TINODE_ADMIN_USERNAME`, `TINODE_ADMIN_PASSWORD`,
`CHATMGT_BOOTSTRAP_ADMIN_FULL_NAME`, and `CHATMGT_BOOTSTRAP_ADMIN_EMAIL`, then run:

```bash
python scripts/bootstrap_admin.py --wait-seconds 120
```

The command verifies Tinode login first and creates a local Chatmgt
administrator only when the account table is empty. It never prints the
password and must not be used to re-enable production local login.

## Deployment verification

With the service running:

```bash
python scripts/verify_deployment.py --base-url http://127.0.0.1:8093
```

This checks the Alembic head, application-secret policy, active Account
administrator projection, disabled local admin login, management scope,
tenant-scoped directory and
conversation responses, the read-only management conversation overview, the
Tinode token lifetime, internal WebSocket login, public WSS login, temporary
topic publish/delete, secure cookies, logout, and rejection of the revoked
credential.

The verifier creates a uniquely named temporary admin row, issues an internal
management-scoped token without exposing a public bypass, and removes that row
plus its audit events in `finally`. It never reads or changes an Account
password and does not depend on the Tinode root password for management auth.

Run the destructive-safe two-tenant verifier after the service is healthy:

```bash
python scripts/verify_tenant_isolation.py --base-url http://127.0.0.1:8093
```

It creates uniquely named temporary tenants, users, and conversations, proves
that users, conversations, friend requests, and participant changes cannot
cross tenant boundaries, then removes all temporary records in `finally`.
