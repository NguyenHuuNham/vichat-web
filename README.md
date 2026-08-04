# VICHAT

VICHAT is delivered in four explicit stages:

- Step 1: deploy Chatmgt, apply Alembic, publish the domains, and enable HTTPS.
- Step 2: authenticate Chat employees with tenant-scoped credentials created in Chatmgt.
- Step 3: make Chatmgt the source used by ChatUI for directory and conversation metadata.
- Step 4: integrate Chatmgt with Tinode/ChatAPI for realtime chat.

Step 2 collects only the username/password issued by the current company's
Chatmgt administrator. The configured ChatUI tenant is sent with the login
request, Chatmgt verifies the bcrypt password inside that tenant, and the JWT
tenant becomes authoritative for all later directory, friendship, conversation,
group, profile, and administration queries. Company A cannot enumerate or
mutate Company B through a query parameter.

The separate Chatmgt administration page also uses UpGO Account, but only the
current tenant's `admin`, `owner`, or `superadmin` may exchange the Account
session for the isolated management cookie through `POST /api/v1/admin/sso`.
Production disables only the local administrator `/login` flow. Chat and
management JWTs carry different scopes and cannot be used across the two
surfaces. The tenant administrator creates, updates, disables, resets, and
revokes employee accounts in Chatmgt. The management page never displays Tinode
message or file content.

## Production data flow

1. A tenant admin enters `chatmgt.upgo.vn` through UpGO Account SSO.
2. Chatmgt accepts only Account roles `admin`, `owner`, or `superadmin` and issues a separate management cookie for the active tenant.
3. The admin creates an employee username/password or converts a legacy Account projection by assigning a ChatUI password.
4. ChatUI calls `POST /api/v1/auth/login` with the credentials and its configured tenant ID.
5. Chatmgt verifies the local password and issues a tenant-scoped HttpOnly chat session.
6. Chatmgt derives/provisions the employee's Tinode credential server-side and returns only a short-lived Tinode token.
7. Logout revokes the Chatmgt session and clears the ChatUI cookie. Admin logout also ends the Account administrator session.

Steps 3 and 4 remain separate acceptance gates. Successful Step 2 login does
not mean directory/conversation loading or Tinode realtime messaging is complete.

## Step 3 management data flow

After local employee login succeeds, ChatUI uses Chatmgt as its only source for
directory, friendship, and conversation metadata:

1. Chatmgt reloads the active local account using the user ID and tenant carried by the verified JWT.
2. Every backend query includes that tenant; client-provided tenant query parameters are ignored after login.
3. ChatUI loads `/api/v1/chat/users`, `/api/v1/friend-request`, and
   `/api/v1/conversation` with the Chatmgt HttpOnly session.
4. Direct conversations, groups, membership changes, per-user removal, and
   per-user notification mute deadlines are persisted in Chatmgt and survive
   refresh or a new login.
5. While the session has `connection: management`, ChatUI clearly disables
   realtime messages and files. Tinode topics, tokens, messages, presence, and
   receipts remain Step 4 and are not replaced with browser demo data.

Chatmgt is authoritative for employee identity, password hash, role, status,
profile, and avatar inside each tenant. It stores only bcrypt hashes, never
plaintext passwords. UpGO Account remains authoritative only for the separate
administrator SSO session.

## Step 4 realtime flow

Chatmgt derives a deterministic Tinode basic credential from a server secret,
tenant ID, Chatmgt account ID, and tenant-scoped Tinode username. Employee
password changes therefore never rotate or expose the Tinode credential.
`POST /api/v1/auth/tinode-token` validates the Chatmgt session/account state and
returns only a short-lived Tinode token. ChatUI then connects to ChatAPI for
messages, files, presence, typing, reactions, receipts, and direct calls.

Chatmgt prepares participant Tinode UID mappings and validates every topic
binding against the current tenant conversation. Group add/remove/leave actions
are sent to Chatmgt, which updates the Tinode subscription and Chatmgt membership
as one controlled bridge operation. The browser does not independently invent
or persist membership state.

Unread counts and the latest message preview still come from Tinode while a
conversation is muted. Chatmgt stores only the current employee's mute deadline;
ChatUI suppresses the sound until that deadline and automatically re-enables it.
ChatUI does not request or display browser desktop notifications.

If Tinode is unavailable, ChatUI remains in `management` mode with the Step 3
directory and conversations available; realtime inputs stay disabled instead
of falling back to demo/localStorage messages. Reconnects obtain a fresh token
from Chatmgt.

## Enterprise Workspace

The ChatUI Workspace panel adds tenant-scoped tasks, mandatory announcements,
approvals, support tickets, wiki/procedure pages, company events, integration
registry records, search, summary metrics and an auditable activity timeline.
Chatmgt stores only these business metadata records; Tinode remains the source
of message content, presence and receipts. Apply Alembic revision
`20260804_10` before deploying the new Chatmgt image. See
`docs/chat-backend-architecture.md` for the authorization matrix and API
contract.

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
