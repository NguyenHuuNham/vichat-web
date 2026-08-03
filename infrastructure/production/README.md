# Production deployment

This stack deploys ChatUI, Chatmgt, Tinode/ChatAPI, two PostgreSQL databases,
Redis, and the container Nginx. Production is ready only after all four stages
pass:

1. Infrastructure, Alembic, domains, HTTPS, WSS, CORS, backup, and rollback.
2. Chatmgt employee username/password login/logout, tenant identity, and revoked-session rejection; Account SSO is only for tenant administrators.
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
- Employee login platform: Chatmgt local credentials; administrator SSO: `https://account.upgo.vn`
- ChatUI upstream: `127.0.0.1:8094`
- Chatmgt upstream: the configured private bind address on port `8081`

Install `nginx-host-chat.conf` and `nginx-host-chatmgt.conf` on the reverse
proxy, obtain TLS certificates, run `sudo nginx -t`, then reload Nginx.

## Voice and video calls

Tinode 0.25.3 provides signaling for direct WebRTC calls only. Group calls are
not enabled. Production uses the pinned Coturn service in `compose.yaml` so a
call still works when both browsers are behind NAT or on different networks.

Set these values in the existing mode-`0600` production `.env`:

```dotenv
WEBRTC_ENABLED=true
TURN_HOST=103.74.122.206
TURN_PORT=3478
TURN_REALM=chat.upgo.vn
TURN_USERNAME=vichat
TURN_PASSWORD=replace-with-a-long-random-password
TURN_EXTERNAL_IP=103.74.122.206/192.168.80.160
TURN_PRIVATE_IP=192.168.80.160
TURN_RELAY_MIN_PORT=49160
TURN_RELAY_MAX_PORT=49200
```

`start.sh` replaces the password placeholder with a random hexadecimal secret,
renders the ignored `runtime/ice-servers.json` with mode `0600`, starts Coturn
on the host network, and then starts ChatAPI with `WEBRTC_ENABLED=true`. Never
commit either the real `.env` or the rendered ICE file.

`TURN_HOST` must resolve directly to the machine running Coturn. At the time of
this release `chat.upgo.vn` resolves to the separate `.218` web entry, so the
TURN endpoint on this deployment must use `103.74.122.206` (or a dedicated DNS
record which resolves to that address), not the ChatUI hostname.

Open the matching host and provider firewalls before enabling the service:

```bash
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 49160:49200/udp
sudo ufw status
```

If UFW is inactive, keep it inactive and configure the equivalent rules in the
server provider firewall instead of changing the host firewall policy during a
release. TCP and UDP `3478` are the TURN listener; UDP `49160-49200` is the
restricted relay range.

After ChatAPI is recreated, its Tinode hello response must contain at least one
`iceServers` entry. Complete acceptance with two employee accounts on separate
networks: voice call, video call, reject, unanswered timeout, hang-up, camera
and microphone toggles, then verify ordinary direct/group messages and external
chatbot mode still behave as before.

## Startup guarantees

`start.sh` runs in this order:

1. Validates or generates non-production-placeholder secrets without printing them.
2. Starts PostgreSQL and Redis, then validates the existing Tinode bootstrap state.
3. Renders the ignored mode-`0600` Tinode bootstrap file.
4. Builds pinned images and creates timestamped `pg_dump -Fc` backups before Alembic.
5. Runs `alembic upgrade head`, bootstrapping the first administrator only when the database is empty.
6. Validates Nginx, starts the services, and waits for health checks.
7. Verifies health/CORS, local employee password login, local Tinode token refresh, management Account SSO challenge, scope isolation, tenant filters, and the read-only admin conversation overview. Real employee realtime behavior is verified separately with two tenant users.
8. Runs an isolated two-tenant API test and removes its temporary records.
9. Optionally verifies the public domains when `VERIFY_PUBLIC_URLS=true`.

The script never removes old backups. Preserve `.env`, database volumes,
Tinode uploads, UID encryption keys, and backup files together.

The management verifier creates a temporary local employee row, mints internal
chat and management tokens directly inside the trusted runtime, exercises the
local employee login and Tinode refresh, and removes the row plus audit events in
`finally`. Public `/login` remains disabled because administrator access uses
Account SSO. The verifier never prints passwords or secrets.

## Employee login acceptance test

Before rebuilding, update the existing real `.env`; copying a new example does
not modify an already deployed file:

```dotenv
CHAT_ACCOUNT_SSO_ENABLED=false
CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED=true
VITE_CHAT_AUTH_MODE=password
CHATMGT_DEFAULT_TENANT=song-hong
TINODE_SSO_SECRET=
```

Leave `TINODE_SSO_SECRET` empty only for the first `start.sh` run so it is
generated securely, or set an independently generated value of at least 32
characters. Never use a documentation placeholder as the real secret.

In `chatmgt.upgo.vn`, sign in with an Account `admin`, `owner` or `superadmin`,
open **Nhân viên**, and create a local employee. Use that username/password in
`chat.upgo.vn`; the browser must call `/api/v1/auth/login`, receive a Chatmgt
cookie with the configured tenant, and receive no password/hash/Tinode token in
the response. Then confirm `/api/v1/auth/tinode-token` returns a short-lived
token and the Tinode socket connects.

Use an Account projection left from the previous deployment and choose **Cấp
mật khẩu ChatUI**. Confirm its Chatmgt ID and Tinode UID stay unchanged while
`auth_source` becomes local. Account administrator login remains at
`chatmgt.upgo.vn`; a normal employee cannot obtain the management scope.

Log out and confirm refresh cannot reopen the protected UI and
`/api/v1/auth/me` returns `401` or `403`. Repeat with two companies using the
same username: each configured tenant must return only its own account and
conversation metadata. A copied foreign tenant query parameter must not change
the result.

## Chatmgt data acceptance test

Step 3 uses the Chatmgt local directory. After rebuilding, sign in with two
local users in the same tenant and verify:

1. `GET /api/v1/auth/health` reports
   `employee_auth.login_endpoint=/api/v1/auth/login` and
   `management_data.configured=true`.
2. `GET /api/v1/chat/users` returns both users with the same `tenant_id` and
   `directory_sync.source=local`.
3. Searching by name/email/username returns only that tenant.
4. Friend request send, accept, and reject survive browser refresh.
5. Direct chat and group creation survive refresh; adding/removing/leaving a
   group updates both users' lists.
6. Opening the same direct pair twice returns the same Chatmgt conversation ID.
7. The UI displays **Dữ liệu Chatmgt** and disables employee message/file input
   with a realtime-unavailable notice instead of saving demo messages.

Repeat the directory and conversation checks with a second tenant. No response
may contain an employee, participant, friend request, or conversation from the
other tenant. This acceptance does not require a Tinode token or realtime
message.

## Chatmgt-to-Tinode acceptance test

Do not start this gate until the Step 3 server commit and acceptance checks are
confirmed. `start.sh` generates `TINODE_SSO_SECRET` when the existing `.env`
value is empty; preserve that value with the Chatmgt database and never print or
commit it. `TINODE_ADMIN_PASSWORD` must remain the current Tinode root password.

After rebuilding, first check:

```bash
curl -fsS https://chatmgt.upgo.vn/api/v1/auth/health
```

The response must contain
`account_sso.tinode_bridge_configured=true`. Then use two local Chatmgt users
from the same tenant in separate browser profiles:

1. Sign in to ChatUI with the Chatmgt username/password and confirm
   `/api/v1/auth/login` returns `connection: management` without `tinode_auth`.
2. Confirm ChatUI next calls `/api/v1/auth/tinode-token`, receives
   `connection: tinode`, and connects to
   `wss://chat.upgo.vn/v0/channels` without sending an Account password.
3. Open a direct conversation before the peer has previously used Chat. Confirm
   Chatmgt prepares the peer UID, both users see the same Chatmgt conversation,
   and text/file/presence/typing/read state works after refresh.
4. Create a group, add and remove a member, let one member leave, and let the
   owner leave. Refresh every browser and confirm Chatmgt participants and
   Tinode subscribers stay aligned and the replacement owner can manage members.
5. Stop only `chatapi` temporarily. ChatUI must keep directory/conversation data
   in **Dữ liệu Chatmgt** mode with realtime controls disabled, not freeze or
   write demo messages. Start `chatapi` and confirm reconnect uses a fresh token.
6. Repeat with a second tenant and attempt a copied topic ID from the first
   tenant. Binding/access must be rejected.
7. Log out and confirm ChatUI disconnects Tinode, clears local state, revokes the
   Chatmgt session, and cannot reopen protected data after refresh.

The automated verifier checks configuration and management isolation but cannot
fabricate a real Account cookie. The two-user/two-tenant browser checks are
therefore mandatory before Step 4 is marked complete.

## Rollback

Every migration release requires a pre-migration `pg_dump -Fc` and tagged prior
images. Stop ChatUI and Chatmgt before restoring a database. Restore into a
separately verified database first when time permits. Never run
`docker compose down -v`; it deletes database and upload volumes.

## Successful output

The final checks include:

```text
Database revision and credential policy are valid.
Health, CORS, local employee login, Tinode token refresh, administrator Account SSO challenge, tenant filters, and management scope isolation checks passed.
Two-tenant user, conversation, friend, and participant checks passed.
```
