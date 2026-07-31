# VICHAT

VICHAT is delivered in four explicit stages:

- Step 1: deploy Chatmgt, apply Alembic, publish the domains, and enable HTTPS.
- Step 2: authenticate Chat employees with existing accounts from `account.upgo.vn`.
- Step 3: make Chatmgt the source used by ChatUI for directory and conversation metadata.
- Step 4: integrate Chatmgt with Tinode/ChatAPI for realtime chat.

Step 2 does not collect an employee username/password in ChatUI. Chatmgt
forwards the shared `session` cookie to `GET https://account.upgo.vn/current_user`,
validates the active tenant membership, synchronizes a local tenant-scoped
profile projection, and issues only its own HttpOnly session. The projection has
an unusable password marker; Account remains authoritative for identity,
password, tenant membership, role, email, display name, and avatar.

The separate Chatmgt administration page keeps local administrator login on
`POST /login` with the management-session header. It neither replaces nor acts
as employee Account login. Its employee directory is read-only, Account profile
changes link back to `account.upgo.vn`, and its operational views are limited to
tenant-scoped Chatmgt sessions, friendship/conversation/group metadata, audit
events, and bridge health. It never displays Tinode message or file content.
Tinode provisioning/token issuance is intentionally outside Step 2.

## Production data flow

1. ChatUI calls `POST /api/v1/auth/sso` without a password.
2. If the shared Account cookie is missing or expired, ChatUI redirects to `https://account.upgo.vn/?continue=<ChatUI URL>`.
3. Account returns the browser to ChatUI; ChatUI retries `/api/v1/auth/sso`.
4. Chatmgt validates `/current_user`, the selected active tenant, and synchronizes the Account profile projection.
5. Chatmgt returns the employee profile plus `connection: management` and sets the Chatmgt HttpOnly cookie.
6. Logout revokes the Chatmgt session, calls `POST https://account.upgo.vn/logout`, and clears both Chatmgt and `.upgo.vn` Account cookies.

Steps 3 and 4 remain separate acceptance gates. Successful Step 2 login does
not mean directory/conversation loading or Tinode realtime messaging is complete.

## Step 3 management data flow

After Account SSO succeeds, ChatUI uses Chatmgt as its only source for chat
directory, friendship, and conversation metadata:

1. Chatmgt validates that the Account session still matches the Chatmgt JWT.
2. Chatmgt loads the current tenant directory from
   `GET https://account.upgo.vn/api/v1/tenant_user` and upserts passwordless local
   projections keyed by Account user ID plus tenant ID.
3. ChatUI loads `/api/v1/chat/users`, `/api/v1/friend-request`, and
   `/api/v1/conversation` with the Chatmgt HttpOnly session.
4. Direct conversations, groups, membership changes, and per-user removal are
   persisted in Chatmgt and survive refresh or a new login.
5. While the session has `connection: management`, ChatUI clearly disables
   realtime messages and files. Tinode topics, tokens, messages, presence, and
   receipts remain Step 4 and are not replaced with browser demo data.

Account remains authoritative for employee profile fields. Chatmgt never copies
an Account password, token, or session cookie into its database.

## Step 4 realtime flow

After Step 3 data is loaded, ChatUI explicitly upgrades the session through
`POST /api/v1/auth/tinode-token`. Chatmgt revalidates the Account session and
returns only a short-lived Tinode token; the deterministic Tinode credential
stays server-side. ChatUI then connects to ChatAPI for messages, files,
presence, typing, reactions, and receipts.

Chatmgt prepares participant Tinode UID mappings and validates every topic
binding against the current tenant conversation. Group add/remove/leave actions
are sent to Chatmgt, which updates the Tinode subscription and Chatmgt membership
as one controlled bridge operation. The browser does not independently invent
or persist membership state.

If Tinode is unavailable, ChatUI remains in `management` mode with the Step 3
directory and conversations available; realtime inputs stay disabled instead
of falling back to demo/localStorage messages. Reconnects obtain a fresh token
from Chatmgt.

## Local checks

Run from the repository root:

```bash
npm run lint
npm run build:production
```

Chatmgt checks run in the pinned production image:

```bash
docker compose --env-file infrastructure/production/.env \
  -f infrastructure/production/compose.yaml run --rm --no-deps chatmgt \
  python -m unittest discover -s tests -v
```

See `infrastructure/production/README.md` for deployment and rollback.

## Development workflow

Before changing code or updating a feature, read
`docs/DEVELOPMENT_WORKFLOW.md`. Record every completed or paused change in
`docs/CHANGELOG.md` so a later developer or Codex session can continue with the
same context. Repository-wide agent rules are defined in `AGENTS.md`.

Do not place employee passwords, Tinode root credentials, database passwords, or
session cookies in frontend variables or committed files.
