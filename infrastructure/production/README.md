# Production deployment

This stack deploys ChatUI, Chatmgt, Tinode/ChatAPI, two PostgreSQL databases,
Redis, and the container Nginx. Production is ready only after all four stages
pass:

1. Infrastructure, Alembic, domains, HTTPS, WSS, CORS, backup, and rollback.
2. Chatmgt employee login/logout through existing `account.upgo.vn` sessions, tenant identity, and revoked-session rejection.
3. ChatUI directory/conversation data from Chatmgt with two-tenant isolation.
4. Chatmgt-to-Tinode token bridge, topic validation, internal WebSocket, and public WSS publish/delete.

## Server preparation

Run on Ubuntu from an administrator account:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git openssl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
```

Expose only SSH and the reverse-proxy upstream ports. PostgreSQL, Redis, and
Tinode stay on the Docker network. Chatmgt must bind only to loopback or the
private reverse-proxy address.

## Configure and start

Run from the repository root on Ubuntu:

```bash
cp infrastructure/production/.env.example infrastructure/production/.env
nano infrastructure/production/.env
chmod 600 infrastructure/production/.env
chmod +x infrastructure/production/start.sh
./infrastructure/production/start.sh
```

The checked-in host configuration uses:

- ChatUI: `https://chat.upgo.vn`
- Chatmgt: `https://chatmgt.upgo.vn`
- Employee identity and login platform: `https://account.upgo.vn`
- ChatUI upstream: `127.0.0.1:8094`
- Chatmgt upstream: the configured private bind address on port `8081`

Install `nginx-host-chat.conf` and `nginx-host-chatmgt.conf` on the reverse
proxy, obtain TLS certificates, run `sudo nginx -t`, then reload Nginx.

## Startup guarantees

`start.sh` runs in this order:

1. Validates or generates non-production-placeholder secrets without printing them.
2. Starts PostgreSQL and Redis, then validates the existing Tinode bootstrap state.
3. Renders the ignored mode-`0600` Tinode bootstrap file.
4. Builds pinned images and creates timestamped `pg_dump -Fc` backups before Alembic.
5. Runs `alembic upgrade head`, bootstrapping the first administrator only when the database is empty.
6. Validates Nginx, starts the services, and waits for health checks.
7. In Account SSO mode, verifies health/CORS, the missing-session SSO challenge, employee password rejection, and isolated management login/logout. Later-stage Tinode checks run only in the legacy employee-password path.
8. Runs an isolated two-tenant API test and removes its temporary records.
9. Optionally verifies the public domains when `VERIFY_PUBLIC_URLS=true`.

The script never removes old backups. Preserve `.env`, database volumes,
Tinode uploads, UID encryption keys, and backup files together.

## Employee login acceptance test

Before rebuilding, update the existing real `.env`; copying a new example does
not modify an already deployed file:

```dotenv
CHAT_ACCOUNT_SSO_ENABLED=true
ACCOUNT_URL=https://account.upgo.vn
ACCOUNT_SSO_PROFILE_PATH=/current_user
ACCOUNT_SSO_DIRECTORY_PATH=/api/v1/user
ACCOUNT_SSO_LOGOUT_PATH=/logout
ACCOUNT_SESSION_COOKIE_NAME=session
ACCOUNT_SESSION_COOKIE_DOMAIN=.upgo.vn
ACCOUNT_SESSION_COOKIE_SECURE=true
```

After deployment, first sign in at `account.upgo.vn` with an existing active
employee and select the intended tenant. Open `chat.upgo.vn`, click **Đăng nhập
bằng UpGO Account**, and verify that Chat displays the Account user and tenant.
The `/api/v1/auth/sso` request must have no username/password body and its response
must contain `connection: management` without a Tinode token.

Log out from Chat and confirm that refresh cannot reopen the protected UI,
`/api/v1/auth/me` returns `401` or `403`, and Account also requires login again.
Repeat with an inactive membership and with two different tenants to confirm
rejection/isolation behavior.

This is the Step 2 acceptance test only. Directory/conversation loading is Step
3, and realtime Tinode messaging is Step 4.

Repeat with users from two tenants before declaring tenant acceptance complete.

## Chatmgt data acceptance test

Step 3 uses the Account directory endpoint only from Chatmgt. After rebuilding,
sign in with two active users in the same tenant and verify:

1. `GET /api/v1/auth/health` reports
   `account_sso.directory_configured=true` and
   `management_data.configured=true`.
2. `GET /api/v1/chat/users` returns both users with the same `tenant_id`; its
   `directory_sync.status` is `fresh` or an explicitly understood `stale` cache.
3. Searching by name/email/username returns only that tenant.
4. Friend request send, accept, and reject survive browser refresh.
5. Direct chat and group creation survive refresh; adding/removing/leaving a
   group updates both users' lists.
6. Opening the same direct pair twice returns the same Chatmgt conversation ID.
7. The UI displays **Dữ liệu Chatmgt** and disables employee message/file input
   with the Step 4 notice instead of saving demo messages.

Repeat the directory and conversation checks with a second tenant. No response
may contain an employee, participant, friend request, or conversation from the
other tenant. This acceptance does not require a Tinode token or realtime
message.

## Rollback

Every migration release requires a pre-migration `pg_dump -Fc` and tagged prior
images. Stop ChatUI and Chatmgt before restoring a database. Restore into a
separately verified database first when time permits. Never run
`docker compose down -v`; it deletes database and upload volumes.

## Successful output

The final checks include:

```text
Database revision and credential policy are valid.
Health, CORS, Account SSO challenge, employee password rejection, and management login/logout checks passed.
Two-tenant user, conversation, friend, and participant checks passed.
```
