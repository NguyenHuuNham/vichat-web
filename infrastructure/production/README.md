# Production deployment

This stack deploys ChatUI, Chatmgt, a rollback Tinode/ChatAPI, two PostgreSQL
databases, Redis, and the container Nginx. The authoritative Tinode is
`web.vichat.net`, reached by both ChatUI and Chatmgt through the ChatUI Nginx
relay. Production is ready only after all four stages pass:

1. Infrastructure, Alembic, domains, HTTPS, WSS, CORS, backup, and rollback.
2. UpGO Account employee SSO/login/logout, tenant identity, Tinode projection, and revoked-session rejection; the same Account SSO also protects tenant administration.
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
- Employee and administrator login platform: UpGO Account at `https://account.upgo.vn`
- ChatUI upstream: `127.0.0.1:8094`
- Chatmgt upstream: the configured private bind address on port `8081`

Install `nginx-host-chat.conf` and `nginx-host-chatmgt.conf` on the reverse
proxy, obtain TLS certificates, run `sudo nginx -t`, then reload Nginx.

## One-time central Tinode switch

The central endpoint currently presents an expired TLS certificate. Browsers
must not connect to it directly. The container Nginx keeps the valid public
`chat.upgo.vn` certificate and proxies `/v0/` plus `/tinode-media/` to
`https://web.vichat.net` with SNI/Host pinned to that hostname. Upstream verify
is temporarily disabled only for this relay and must be re-enabled after the
central certificate is renewed.

Before the switch, update the private mode-`0600` `.env` without printing its
secrets:

```dotenv
TINODE_INTERNAL_WS_URL=ws://chat:80/v0/channels
```

Then follow this order. Do not reset mappings before the new proxy and account
provisioning work:

1. Back up Chatmgt PostgreSQL and the old Tinode PostgreSQL with `pg_dump -Fc`;
   copy `.env`, runtime bootstrap files and image IDs into the same protected
   rollback directory.
2. Build the new `chat` and `chatmgt` images, start `chat`, and verify a Tinode
   hello plus a temporary new account through `ws://chat:80/v0/channels`.
3. Preview the destructive reset:

   ```bash
   docker compose --env-file infrastructure/production/.env \
     -f infrastructure/production/compose.yaml run --rm --no-deps chatmgt \
     python scripts/switch_tinode_central.py
   ```

4. After the counts and backup are verified, apply it once:

   ```bash
   docker compose --env-file infrastructure/production/.env \
     -f infrastructure/production/compose.yaml run --rm --no-deps chatmgt \
     python scripts/switch_tinode_central.py --apply --confirm web.vichat.net
   ```

The command sets only `management_account.tinode_uid` and
`conversation.tinode_topic` to `NULL`, deletes automatic `CHAT_*` knowledge
documents/chunks, and removes stored message previews from Workspace tasks. It
does not change account IDs, passwords, tenant IDs, conversation IDs, group
membership, Workspace ownership or chatbot history. New Tinode users/topics
are created lazily on the central server after login/open.

Keep the old `chatapi` and Tinode PostgreSQL running during acceptance for a
fast rollback, but no ChatUI or Chatmgt request should reach them after the
switch.

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

## External chatbot configuration

Before rebuilding the frontend, set `VITE_CHAT_MODE=external`. Configure the
partner webhook and the inbound data API with different keys:

```dotenv
CHATBOT_ENABLED=true
CHATBOT_PROVIDER=external-webhook
CHATBOT_API_URL=https://knowledge.gonapp.net/api/v1/chat
CHATBOT_API_KEY=
CHATBOT_EXTERNAL_AUTH_HEADER=Authorization
CHATBOT_EXTERNAL_AUTH_SCHEME=Bearer
CHATBOT_KNOWLEDGE_ONLY=false
CHATBOT_EXTERNAL_API_KEY=<separate-inbound-key>
CHATBOT_EXTERNAL_TENANT=tn6913580727957397
CHATBOT_EXTERNAL_KNOWLEDGE_BASE_ID=<optional-approved-base-uuid>
```

Chatmgt calls `https://knowledge.gonapp.net/api/v1/chat` server-side. Set
`CHATBOT_API_KEY` only if that endpoint is later protected; the browser must
continue to call Chatmgt instead of the partner service directly.

Do not copy the example placeholders into production. After deployment, verify
`GET /api/v1/chatbot/health`, call the external context endpoint once with the
inbound key, and confirm the browser does not request `/api/v1/chat/users`,
`/api/v1/conversation`, `/api/v1/auth/tinode-token`, or a Tinode WebSocket.
Rollback requires only `VITE_CHAT_MODE=internal` and a ChatUI rebuild; no
database migration is involved.

## Startup guarantees

`start.sh` runs in this order:

1. Validates or generates non-production-placeholder secrets without printing them.
2. Starts PostgreSQL and Redis, then validates the existing Tinode bootstrap state.
3. Renders the ignored mode-`0600` Tinode bootstrap file.
4. Builds pinned images and creates timestamped `pg_dump -Fc` backups before Alembic.
5. Runs `alembic upgrade head`, bootstrapping the first administrator only when the database is empty.
6. Validates Nginx, starts the services, and waits for health checks.
7. Verifies health/CORS, disabled local employee password login, internal Tinode token refresh, management Account SSO challenge, scope isolation, tenant filters, and the read-only admin conversation overview. Real employee realtime behavior is verified separately with two tenant users.
8. Runs an isolated two-tenant API test and removes its temporary records.
9. Optionally verifies the public domains when `VERIFY_PUBLIC_URLS=true`.

The script never removes old backups. Preserve `.env`, database volumes,
Tinode uploads, UID encryption keys, and backup files together.

The management verifier creates a temporary Account-backed projection row,
mints internal chat and management tokens directly inside the trusted runtime,
exercises the protected employee endpoints and Tinode refresh, and removes the
row plus audit events in `finally`. It does not pretend to be an UpGO Account
browser session and never prints passwords or secrets.

## Employee login acceptance test

Before rebuilding, update the existing real `.env`; copying a new example does
not modify an already deployed file:

```dotenv
CHAT_ACCOUNT_SSO_ENABLED=true
CHAT_ACCOUNT_CREDENTIAL_LOGIN_ENABLED=true
CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED=true
VITE_CHAT_AUTH_MODE=account_password
ACCOUNT_SSO_LOGIN_PATH=/login
CHATMGT_DEFAULT_TENANT=tn6913580727957397
TINODE_CENTRAL_TOKEN_MAX_TTL=900
TINODE_SSO_SECRET=
```

Leave `TINODE_SSO_SECRET` empty only for the first `start.sh` run so it is
generated securely, or set an independently generated value of at least 32
characters. Never use a documentation placeholder as the real secret.

In `chatmgt.upgo.vn`, sign in with an Account `admin`, `owner` or `superadmin`,
then invite employees from UpGO Account. Chatmgt must show the read-only Account
directory projection, provision a deterministic Tinode UID for each active
employee, and never offer local create/reset-password actions. In `chat.upgo.vn`,
the employee enters the email and password of the invited UpGO Account user.
Chatmgt forwards those credentials only to Account `POST /login`, validates the
returned session and tenant membership, then returns a Chatmgt session. The
employee password is never stored, returned to the browser, or sent to Tinode.
Chatmgt provisions or repairs the deterministic Tinode identity server-side and
ChatUI receives only a short-lived token from `/api/v1/auth/tinode-token`.
`TINODE_CENTRAL_TOKEN_MAX_TTL` is the acceptance ceiling for the expiry
returned by the central Tinode provider. Keep it equal to the provider policy;
the local rollback ChatAPI default remains separate.

Remove an employee from the tenant in UpGO Account and wait for the directory
sync interval. Chatmgt must mark the projection inactive and the next Chatmgt
or Tinode request must reject the old session. Account administrator login
remains at `chatmgt.upgo.vn`; a normal employee cannot obtain the management
scope.

Log out and confirm refresh cannot reopen the protected UI and
`/api/v1/auth/me` returns `401` or `403`. Repeat with two companies using the
same username: each configured tenant must return only its own account and
conversation metadata. A copied foreign tenant query parameter must not change
the result.

## Chatmgt data acceptance test

Step 3 uses the UpGO Account directory projected by Chatmgt. After rebuilding,
sign in with two invited users in the same tenant and verify:

1. `GET /api/v1/auth/health` reports
   `employee_auth.login_endpoint=/api/v1/auth/account-login` and
   `account_sso.credential_login_enabled=true`, with
   `management_data.configured=true`.
2. `GET /api/v1/chat/users` returns both users with the same `tenant_id` and
   `directory_sync.source=account`, with `tinode_provisioned` reported for new
   active employees.
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
`account_sso.tinode_bridge_configured=true`. Then use two invited Account users
from the same tenant in separate browser profiles:

1. Sign in to ChatUI through UpGO Account and confirm `/api/v1/auth/sso`
   returns a tenant-scoped Chatmgt session without Account credentials or
   Tinode secrets.
2. Confirm ChatUI next calls `/api/v1/auth/tinode-token`, receives
   `connection: tinode`, and connects to
   `wss://chat.upgo.vn/v0/channels` without sending an Account password.
3. Open a direct conversation before the peer has previously used Chat. Confirm
   Chatmgt prepares the peer UID, both users see the same Chatmgt conversation,
   and text/file/presence/typing/read state works after refresh.
4. Create a group, add and remove a member, let one member leave, and let the
   owner leave. Refresh every browser and confirm Chatmgt participants and
   Tinode subscribers stay aligned and the replacement owner can manage members.
5. Stop only the central relay path temporarily (for example, recreate `chat`
   without changing Chatmgt/PostgreSQL). ChatUI must keep directory/conversation data
   in **Dữ liệu Chatmgt** mode with realtime controls disabled, not freeze or
   write demo messages. Restore `chat` and confirm reconnect uses a fresh token;
   the old local `chatapi` is not this test path.
6. Repeat with a second tenant and attempt a copied topic ID from the first
   tenant. Binding/access must be rejected.
7. Log out and confirm ChatUI disconnects Tinode, clears local state, revokes the
   Chatmgt session, and cannot reopen protected data after refresh.

The automated verifier checks configuration and management isolation but cannot
fabricate a real Account cookie. The two-user/two-tenant browser checks are
therefore mandatory before Step 4 is marked complete.

## Enterprise Workspace acceptance test

Revision `20260804_10` creates the Workspace item, participant and activity
tables. The production verifier now rejects a deployment when those tables or
the active participant uniqueness index are missing. After Alembic and before
switching the `current` release symlink:

1. Sign in as a normal employee and create a task, ticket, wiki draft and event;
   refresh and confirm they remain visible only in the configured tenant.
2. Assign another employee, apply task/ticket/RSVP actions from that account and
   confirm the activity timeline updates within the 15-second refresh window.
3. Create an approval with an approver; a watcher or unrelated employee must not
   approve or reject it.
4. Sign in as a tenant administrator, publish a mandatory announcement and
   create an integration registry entry. A normal employee must receive `403`
   for both mutations. Never enter an API key or token in the registry.
5. Use **Giao việc từ tin nhắn** on a managed conversation and confirm only the
   conversation/name and Tinode message reference become task metadata; ordinary Tinode
   messaging, presence, receipts, notifications and composer focus remain
   unchanged.
6. Repeat list/search/detail/action calls with a second tenant. No item,
   participant, activity or aggregate count from the first tenant may appear.

## Rollback

Every migration release requires a pre-migration `pg_dump -Fc` and tagged prior
images. Stop ChatUI and Chatmgt before restoring a database. Restore into a
separately verified database first when time permits. Never run
`docker compose down -v`; it deletes database and upload volumes.

## Successful output

The final checks include:

```text
Database revision and credential policy are valid.
Health, CORS, Account employee SSO challenge, Tinode token refresh, administrator Account SSO challenge, tenant filters, and management scope isolation checks passed.
Two-tenant user, conversation, friend, and participant checks passed.
```
