# VICHAT

VICHAT is delivered in four explicit stages:

- Step 1: deploy Chatmgt, apply Alembic, publish the domains, and enable HTTPS.
- Step 2: authenticate Chat employees through the UpGO Account tenant membership invited by an administrator.
- Step 3: make Chatmgt the source used by ChatUI for directory and conversation metadata.
- Step 4: integrate Chatmgt with Tinode/ChatAPI for realtime chat.

Step 2 uses the UpGO Account credentials of an employee invited to the current
company. Chatmgt forwards the email/password only to the official Account
`/login` endpoint, verifies the returned Account session and current tenant
membership, projects that identity into its tenant-scoped metadata store, and
issues an HttpOnly Chatmgt session. The password is never stored, returned to
the browser, or sent to Tinode. The JWT tenant becomes authoritative for all
later directory, friendship, conversation, group, profile, and administration queries.
Company A cannot enumerate or mutate Company B through a query parameter.

The separate Chatmgt administration page also uses UpGO Account, but only the
current tenant's `admin`, `owner`, or `superadmin` may exchange the Account
session for the isolated management cookie through `POST /api/v1/admin/sso`.
Production disables only the local administrator `/login` flow. Chat and
management JWTs carry different scopes and cannot be used across the two
surfaces. The tenant administrator can view the tenant-scoped employee
projection and force another employee's Chatmgt sessions to log out. Chatmgt
does not expose add, edit, disable, password-reset, conversation metadata,
Tinode message, or file controls on the management surface; employee membership
and profile changes remain exclusively in UpGO Account.

## Production data flow

1. A tenant admin enters `chatmgt.upgo.vn` through UpGO Account SSO.
2. Chatmgt accepts only Account roles `admin`, `owner`, or `superadmin` and issues a separate management cookie for the active tenant.
3. The admin invites or removes employees in UpGO Account; Chatmgt reads the tenant directory as a read-only source.
4. ChatUI shows an email/password form; Chatmgt calls UpGO Account `POST /login`, validates the invited tenant membership, and exposes `POST /api/v1/auth/account-login` as the employee login contract.
5. Chatmgt projects the Account identity, derives/provisions the employee's Tinode identity server-side, and issues a tenant-scoped HttpOnly chat session.
6. Chatmgt returns only public identity fields; ChatUI requests a short-lived Tinode token through `POST /api/v1/auth/tinode-token`.
7. Logout revokes the Chatmgt session and clears the ChatUI cookie. Admin logout also ends the Account administrator session.

## ViChat Mobile

The isolated `mobile/` Expo SDK 57 project is a first-party Android/iOS client
for the same tenant-scoped Chatmgt and Tinode services. It sends
`X-Vichat-Client: mobile` on the Account credential login and stores only the
short-lived Chatmgt bearer token in SecureStore; Chatmgt exposes that token
only when `CHAT_MOBILE_BEARER_ENABLED=true`. The native HTTP cookie jar keeps
the UpGO Account `session` cookie so server-side SSO validation remains
authoritative on `/auth/me`, directory, profile and Tinode-token requests.

Mobile conversation metadata and Workspace records remain in Chatmgt. Tinode
continues to own realtime messages, files, presence, receipts and reactions;
both web and mobile therefore see the same topics and history. The mobile
directory is the active employee projection for the authenticated tenant and
does not require friendship acceptance. Calls and push are capability-gated
until native credentials are configured, and the removed knowledge manager is
not exposed. Run mobile checks from `mobile/`; signed Android/iOS builds need
JDK/SDK or EAS plus store credentials.

Protected Tinode images are fetched through the authenticated
`chat.upgo.vn/tinode-media` relay into the native cache before rendering. An
optional four-digit app PIN stores only a salted hash in SecureStore and locks
the signed-in message surface after the app returns from the background; a
forgotten PIN is reset only by clearing the local PIN and signing back in with
UpGO Account. Local notifications remain available while the mobile runtime is
alive. Background/killed push additionally requires the native Firebase/APNs
client credential and the matching Tinode push provider; when enabled, mobile
registers the native device token directly on the authenticated Tinode session.

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
   per-user notification mute deadlines and conversation pins are persisted in
   Chatmgt and survive refresh or a new login.
5. Chatmgt returns a short-lived Tinode token after validating the Account
   session. If the relay is unavailable, ChatUI keeps the directory and
   conversation metadata visible while disabling realtime inputs; it never
   falls back to browser demo data.

Chatmgt is authoritative for tenant-scoped conversation metadata and the
deterministic Tinode mapping. UpGO Account is authoritative for employee
identity, invitation/membership, role, status, profile, avatar, and password.
Chatmgt stores a read-only Account projection and never copies an Account
password.

## Step 4 realtime flow

For explicit local/recovery accounts, `TINODE_MIRROR_LOCAL_CREDENTIALS=true`
provisions the local Chatmgt credential into Tinode. Active UpGO Account
employees use a deterministic Tinode credential derived server-side from
`TINODE_SSO_SECRET`; the Account password is accepted only by the Account
`/login` endpoint and is discarded immediately after authentication. Existing
deterministic identities are migrated in place by UID on the next login.
`POST /api/v1/auth/tinode-token` returns the token bound to that session when a
reconnect needs it and re-verifies that volatile password when renewal is
required. ChatUI and Chatmgt both reach the
central `web.vichat.net` Tinode through the `chat.upgo.vn` Nginx relay for
messages, files, presence, typing, reactions, receipts, and direct calls.
Tinode Web at `https://web.vichat.net/#` remains the single UI used to inspect
the central message store. Set its Server to `chat.upgo.vn` so its basic login
packet is translated server-side from UpGO Account credentials to a short-lived
Tinode token. ChatUI obtains its own short-lived token for the same deterministic
Tinode UID; the two clients therefore share topics and message history without
passing a browser token between them or sending an UpGO password to central
Tinode.

Chatmgt prepares participant Tinode UID mappings and validates every topic
binding against the current tenant conversation. Group add/remove/leave actions
are sent to Chatmgt, which updates the Tinode subscription and Chatmgt membership
as one controlled bridge operation. The browser does not independently invent
or persist membership state.

Normal Tinode messages and uploaded chat files are not copied into Chatmgt
knowledge or Workspace previews. A Workspace task created from a message keeps
only the Chatmgt conversation ID/name and Tinode message reference.

Unread counts and the latest message preview still come from Tinode while a
conversation is muted. Chatmgt stores only the current employee's mute deadline;
ChatUI suppresses the sound until that deadline and automatically re-enables it.
ChatUI does not request or display browser desktop notifications.

If Tinode is unavailable, ChatUI remains in `management` mode with the Step 3
directory and conversations available; realtime inputs stay disabled instead
of falling back to demo/localStorage messages. Reconnects obtain a fresh token
from Chatmgt.

## Chatbot deployment

Production keeps `VITE_CHAT_MODE=internal`, so the assistant is a normal Tinode
P2P conversation alongside employee chats. ChatUI obtains the bot UID from
Chatmgt, while the isolated `tinode-chatbot-webhook` worker receives only direct
`usr*` messages and calls Chatmgt's tenant-checked webhook. Chatmgt then calls
the retrieval-only `https://knowledge-ai.gonapp.net/api/v1/chat` endpoint with
the server-side `X-API-Key`, sends only the bounded question and `top_k`, and
publishes the returned document snippets back to Tinode as a sourced reply.
Normal employee/group/file flows never pass through the worker. Configure the
bot credentials and shared webhook key in the private production `.env`; see
`infrastructure/production/.env.example` and
`infrastructure/production/README.md`.

`CHATBOT_PROVIDER=external-webhook` remains the server-side provider setting and
the existing authenticated `/api/v1/chatbot/message` endpoint remains a
direct-provider fallback for clients without a Tinode bot topic. ChatUI no
longer exposes the knowledge manager or sends a knowledge-base selection.
Legacy approved RAG APIs remain isolated integration endpoints; they are not
used by the ViChat AI conversation and never include employee chat content.

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
