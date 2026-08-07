# VICHAT

VICHAT is delivered in four explicit stages:

- Step 1: deploy Chatmgt, apply Alembic, publish the domains, and enable HTTPS.
- Step 2: authenticate Chat employees through the UpGO Account tenant membership invited by an administrator.
- Step 3: make Chatmgt the source used by ChatUI for directory and conversation metadata.
- Step 4: integrate Chatmgt with Tinode/ChatAPI for realtime chat.

Step 2 uses the signed-in UpGO Account session of the current company's
employee. Chatmgt verifies the Account session and current tenant membership,
projects that identity into its tenant-scoped metadata store, and issues an
HttpOnly Chatmgt session. The JWT tenant becomes authoritative for all later
directory, friendship, conversation, group, profile, and administration queries.
Company A cannot enumerate or mutate Company B through a query parameter.

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
3. The admin invites or removes employees in UpGO Account; Chatmgt reads the tenant directory as a read-only source.
4. ChatUI redirects the employee to UpGO Account and calls `POST /api/v1/auth/sso` after the Account session returns.
5. Chatmgt projects the Account identity, derives/provisions the employee's Tinode identity server-side, and issues a tenant-scoped HttpOnly chat session.
6. Chatmgt returns only public identity fields; ChatUI requests a short-lived Tinode token through `POST /api/v1/auth/tinode-token`.
7. Logout revokes the Chatmgt session and clears the ChatUI cookie. Admin logout also ends the Account administrator session.

Steps 3 and 4 remain separate acceptance gates. Successful Step 2 login does
not mean directory/conversation loading or Tinode realtime messaging is complete.

## Step 3 management data flow

After UpGO Account employee login succeeds, ChatUI uses Chatmgt as its only source for
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

Chatmgt is authoritative for tenant-scoped conversation metadata and the
deterministic Tinode mapping. UpGO Account is authoritative for employee
identity, invitation/membership, role, status, profile, avatar, and password.
Chatmgt stores a read-only Account projection and never copies an Account
password.

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

## External chatbot deployment

The current production build defaults to `VITE_CHAT_MODE=external`. Employees
still authenticate through tenant-scoped Chatmgt credentials, but ChatUI initializes only the
configured assistant and does not request the internal directory,
conversations, friend requests, Tinode token, or realtime topics. Profile,
session validation, settings, knowledge administration, and the isolated
Chatmgt management page remain unchanged.

Chatmgt can call a partner chatbot with
`CHATBOT_PROVIDER=external-webhook`, or expose approved RAG data to a partner
through `POST /api/v1/chatbot/external/context`. The external data API uses a
dedicated API key and a server-fixed tenant/optional knowledge base; it never
exports knowledge derived from employee conversations. See
`docs/external-chatbot-api.md` for the request contract and deployment
variables.

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
