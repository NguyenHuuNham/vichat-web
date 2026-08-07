# Chat backend architecture

## Delivery stages

| Stage | Scope | Completion rule |
| --- | --- | --- |
| 1 | Chatmgt deployment, Alembic, domains, HTTPS | Service healthy, database at Alembic head, public URLs use HTTPS |
| 2 | Tenant employee login/logout | ChatUI validates invited employee credentials through UpGO Account; Chatmgt keeps a read-only projection |
| 3 | ChatUI data from Chatmgt | Directory, friends, conversations, groups, profile and notification metadata are tenant-scoped |
| 4 | Chatmgt and Tinode/ChatAPI | Short-lived Tinode tokens, messages, files, presence, receipts, typing and calls pass acceptance tests |

Stages are tested independently. Employee Step 2 authentication does not trust
tenant, role, or user IDs supplied after the session is issued.

## Service boundaries

- `account.upgo.vn`: authoritative identity, invitation, membership, profile,
  role, status, and password for every employee and administrator.
- `chat` (React ChatUI): submits employee email/password to Chatmgt over HTTPS,
  stores only the public profile/session result, and uses Tinode only with a
  short-lived token returned by Chatmgt.
- `chatmgt` (`chatservice-main`): owns the read-only employee projection,
  deterministic Tinode mappings, directory/friend/conversation metadata, tenant
  authorization, audit records and the HttpOnly chat/management sessions.
- `web.vichat.net` (central Tinode): owns message/file content, topics,
  presence, typing, reactions, delivery/read receipts and call signaling.
  ChatUI reaches it through the TLS-safe `chat.upgo.vn` Nginx relay, while
  Chatmgt reaches the same relay at `ws://chat:80/v0/channels`. The old local
  `chatapi` container remains only for rollback until migration acceptance is
  complete. Tinode Web basic login is translated by the internal relay bridge
  through Chatmgt/UpGO Account before it reaches the central server. WebRTC
  media remains browser-to-browser or Coturn; Chatmgt never reads Tinode content.

The administrator page uses `POST /api/v1/admin/sso` and the separate
`vichat_management_access_token`. It accepts only Account `admin`, `owner` or
`superadmin` for the active tenant. Employee ChatUI sessions use
`vichat_access_token` with `scp=chat`; the two scopes cannot cross surfaces.

## Step 2 employee authentication

1. The company build fixes `VITE_CHAT_TENANT_ID`; the login page does not offer a
   tenant browser or allow a user to enumerate companies.
2. ChatUI sends the employee email/password to `POST /api/v1/auth/account-login`
   over HTTPS. Chatmgt forwards those credentials only to UpGO Account's
   official `POST /login` endpoint and never logs or stores the password.
3. Chatmgt verifies the returned Account session, current tenant membership,
   and active status, then projects the identity to a stable tenant-scoped
   `management_account` row. It forwards the Account session cookie to later
   server-side Account checks.
4. Chatmgt issues the HttpOnly chat cookie and returns only public user/tenant
   fields; it never returns an Account password or Tinode secret.
5. ChatUI loads Step 3 metadata, then calls `POST /api/v1/auth/tinode-token`.
6. Logout revokes the Chatmgt token and clears the ChatUI cookie. A later API
   call receives `401`/`403`.

Production uses `CHAT_ACCOUNT_SSO_ENABLED=true` and
`CHAT_ACCOUNT_CREDENTIAL_LOGIN_ENABLED=true`. The cookie-based
`POST /api/v1/auth/sso` endpoint remains available for compatible clients. The legacy
`POST /api/v1/auth/login` local-password endpoint remains only as an explicit
development/recovery compatibility mode and is disabled by the production
configuration.

## Administrator isolation and account provisioning

The management page always keeps Account SSO for administrators when
`CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED=true`. The management endpoint validates the
Account cookie server-to-server, checks the current tenant and admin role, and
issues only the management-scope cookie. It does not call Tinode.

Inside **Nhân viên**, a tenant admin can:

- open UpGO Account to invite, remove, or update an employee;
- view the tenant-scoped read-only Account projection and Tinode readiness; and
- revoke an employee's Chatmgt sessions.

Chatmgt does not create employee accounts or reset employee passwords in the
production SSO mode. The projection remains in Chatmgt so conversation,
friendship, audit, and Tinode mappings keep stable internal IDs.
For a legacy Account projection in a production migration, reset-password is a
deliberate “Cấp mật khẩu ChatUI” action. It changes only the authentication
source to `local`, preserves the existing management account ID and Tinode UID,
keeps a non-sensitive legacy Account audit marker, and synchronizes the new
local password to the mapped Tinode basic credential. The plaintext password
is used only in memory for the Tinode request and is never stored.

Management account mutations require both the management cookie and
`X-Vichat-Session-Scope: management`. Every target query includes
`ManagementAccount.tenant_id == current_tenant`; an admin cannot target a user
from another tenant by ID or query parameter.

## Step 3 tenant data flow

After login, ChatUI reads `/api/v1/chat/users`, `/api/v1/friend-request` and
`/api/v1/conversation` from Chatmgt only. Search, direct pairs, groups,
participants, notification mute deadlines and profile/avatar changes are all
stored under the JWT tenant. Foreign tenant IDs sent in query strings are
ignored; the authenticated JWT and membership rows remain authoritative.

The default ChatUI contact list is the active UpGO Account employee directory
for the authenticated tenant, excluding the current employee. Employees do not
need an accepted friendship record to discover or start a direct conversation
with coworkers. Friendship records remain compatibility metadata only; direct
conversation creation still validates that every participant is active in the
same tenant before Chatmgt prepares the Tinode pair.

Chatmgt never uses browser localStorage as a fallback message store. If Tinode
is unavailable, the directory and conversation metadata remain visible while
realtime message/file inputs stay disabled and show the connection state.

## Step 4 Tinode bridge

Tinode credentials are handled server-side and plaintext credentials are never
returned to ChatUI. In production Account SSO mode, Chatmgt derives a Tinode
basic credential from `TINODE_SSO_SECRET`, the tenant, and the UpGO Account ID;
the UpGO Account password is never copied to Tinode. Chatmgt usernames remain
tenant-scoped while Tinode basic usernames are global: a same-tenant duplicate
is rejected, but a username already used by another tenant is provisioned under
`stable_tinode_username(tenant_id, account_id)` and stored in
  `management_account.tinode_username`. The Chatmgt username shown to the
employee does not change.

When local credential mirroring is disabled, Chatmgt uses the derived
credential flow:

The optional `TINODE_MIRROR_LOCAL_CREDENTIALS=true` setting applies only to
explicit local/recovery sessions. It is not used by active UpGO Account SSO
employees, whose Account password is never copied to Tinode.

```text
tinode_username = stable_tinode_username(tenant_id, account_id)
tinode_password = HMAC-SHA256(TINODE_SSO_SECRET,
                              tenant_id + account_id + tinode_username)
```

The derived credential stays in Chatmgt memory. In both modes Chatmgt provisions
or repairs the Tinode identity server-side when an invited user is discovered in
the Account directory or logs in for the first time, then returns only the
short-lived Tinode token and expiry from `POST /api/v1/auth/tinode-token`. Two tenants with
the same employee username receive different management IDs and Tinode
identities.
Tinode basic usernames are global per Tinode server and must satisfy Tinode's
letters/numbers/dot/underscore policy. The deterministic `upgo_*` mapping keeps
the same UID stable across Account profile changes; group subscriptions and
message history remain on that UID. The signed Chatmgt JWT carries only the
short-lived Tinode token for reconnects; no reversible employee password is
persisted.

The standalone Tinode Web client connects to `wss://chat.upgo.vn/v0/channels`.
The single Tinode Web UI remains `https://web.vichat.net/#`; its Settings >
Server value must be `chat.upgo.vn` so the login reaches the Account bridge.
ChatUI does not import a browser token from Tinode Web. It requests its own
short-lived token for the same deterministic Tinode UID, which keeps topics and
message history shared while keeping browser sessions isolated.
The Nginx relay sends that path to `tinode-account-bridge`: token login packets
from ChatUI pass through unchanged, while Tinode Web `scheme=basic` packets are
decoded only at the trusted bridge. The bridge first calls
`POST /api/v1/auth/account-login`, then exchanges the returned Chatmgt bearer
session through the internal, key-protected
`POST /api/v1/auth/tinode-token-bridge` endpoint. This second exchange does not
depend on the Account browser `session` cookie being forwarded between
containers. The UpGO password is not sent to the central Tinode server or
logged by the bridge. This keeps Tinode Web and ChatUI on the same central
UID/topic/message store.

`POST /api/v1/conversation/<id>/tinode-prepare` prepares missing UID mappings
from current Chatmgt membership. Group topic binding and add/remove/leave
operations verify the fresh Tinode token and exact tenant member set before
committing Chatmgt metadata. The central Tinode remains authoritative for
message content, files, presence, typing, reactions, receipts and call
signaling. ChatUI does not post normal messages/files to Chatmgt knowledge;
legacy chat-ingestion routes return `410 TINODE_CONTENT_ONLY`.

Tinode profile metadata is correlated through both the Chatmgt account ID and
Tinode UID. A profile metadata update refreshes the matching directory entry,
conversation header, members, typing indicator and rendered message/call
history without changing tenant ownership or message content.

## Runtime call visibility and chatbot webhook

`VITE_CALLS_ENABLED=false` hides voice/video call entry points, redial actions
and incoming call UI in ChatUI while keeping the Tinode/WebRTC implementation
available for a later rebuild. Disabled clients reject incoming call invites
without changing message, presence, receipt or group behavior.

ChatUI always sends chatbot messages to Chatmgt's authenticated
`POST /api/v1/chatbot/message`. With `CHATBOT_PROVIDER=external-webhook`,
Chatmgt sends a bounded server-to-server payload to the fixed
`CHATBOT_API_URL`, currently `https://knowledge.gonapp.net/api/v1/chat`.
Employee credentials, cookies and secrets are never sent to that provider; only
the message, conversation reference, bounded history, approved public identity
fields and retrieved context may cross the boundary.

## Enterprise Workspace

Enterprise Workspace is a tenant-scoped business metadata layer in Chatmgt. It
does not replace Tinode and does not read Tinode history. The tables
`enterprise_item`, `enterprise_item_participant` and `enterprise_activity` own
tasks, mandatory announcements, approvals, tickets, wiki pages, events and
integration registry entries. The `properties` object is type-validated and
allow-listed; API keys, passwords, cookies and tokens are rejected and are not
stored. A user may explicitly create a task from a message, but Chatmgt keeps
only the conversation ID/name and Tinode message reference. The message body
remains exclusively in Tinode.

Every Workspace query includes the JWT tenant and filters participants by that
same tenant. `COMPANY` items are visible to active employees in the tenant;
`PARTICIPANTS` items are visible only to the creator, owner or listed
participants. Announcements and integration registry mutations require a
tenant administrator. Other types use creator/owner/participant roles for
editing and state transitions. Every create, update, archive, action and
comment writes an `enterprise_activity` row and a security audit event.

ChatUI opens Workspace as an isolated panel and refreshes metadata every 15
seconds while visible. This polling deliberately does not touch the Tinode
socket, topic subscriptions, message composer, presence, receipts or mute
state. The panel provides overview metrics, type tabs, tenant search, detail
history, role-aware actions and a message-to-task shortcut.

## API contract

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/auth/sso` | UpGO Account employee login and projection |
| `POST` | `/api/v1/auth/account-login` | UpGO Account email/password exchange and employee projection |
| `POST` | `/api/v1/auth/login` | Legacy local-password login for explicit recovery mode |
| `GET` | `/api/v1/auth/me` | Read the current Chatmgt session |
| `POST` | `/api/v1/auth/logout` | Revoke the current Chatmgt session |
| `POST` | `/api/v1/auth/tinode-token` | Issue/refresh a short-lived Tinode token |
| `POST` | `/api/v1/admin/sso` | Account SSO for current-tenant administrators |
| `GET` | `/api/v1/chat/users...` | Tenant employee directory projection and Tinode readiness |
| `POST` | `/api/v1/chat/users/<id>/revoke-session` | Revoke a tenant employee session |
| `GET/POST` | `/api/v1/friend-request` | Tenant-scoped friendship metadata |
| `GET/POST` | `/api/v1/conversation` | Tenant-scoped conversation metadata |
| `POST` | `/api/v1/conversation/<id>/tinode-prepare` | Prepare Tinode participant mappings |
| `PUT` | `/api/v1/conversation/<id>/tinode-topic` | Verify/bind the topic to exact membership |
| `GET` | `/api/v1/workspace/items` | List tenant-visible Workspace items and summary |
| `POST` | `/api/v1/workspace/items` | Create a validated task, announcement, approval, ticket, wiki, event or integration entry |
| `GET/PUT/DELETE` | `/api/v1/workspace/items/<id>` | Read, update or archive one tenant-scoped item |
| `POST` | `/api/v1/workspace/items/<id>/actions` | Apply a role-checked transition, acknowledgement, RSVP or comment |
| `GET` | `/api/v1/workspace/items/<id>/activity` | Read tenant-scoped audit/activity history |
| `GET` | `/api/v1/workspace/search` | Search visible Workspace metadata |
| `GET` | `/api/v1/workspace/stats` | Return visible counts, due-soon and overdue metrics |
| `GET` | `/api/v1/workspace/meta` | Return supported types/statuses and current tenant identity |

The management overview intentionally has no message-content, file-content or
Tinode history API.

## Production configuration

```dotenv
CHAT_ACCOUNT_SSO_ENABLED=true
CHAT_ACCOUNT_CREDENTIAL_LOGIN_ENABLED=true
CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED=true
VITE_CHAT_AUTH_MODE=account_password
CHATMGT_DEFAULT_TENANT=tn6913580727957397
CHAT_AUTH_JWT_SECRET=<at-least-32-random-characters>
TINODE_SSO_SECRET=<at-least-32-random-characters>
TINODE_MIRROR_LOCAL_CREDENTIALS=true
TINODE_ADMIN_USERNAME=<server-side-tinode-admin>
TINODE_ADMIN_PASSWORD=<server-side-tinode-admin-password>
TINODE_INTERNAL_WS_URL=ws://chat:80/v0/channels
TINODE_CENTRAL_WS_URL=wss://web.vichat.net/v0/channels
TINODE_BRIDGE_TIMEOUT=15
TINODE_TOKEN_EXPIRE_IN=300
ACCOUNT_SSO_DIRECTORY_PATH=/api/v1/tenant_user
ACCOUNT_SSO_DIRECTORY_SYNC_TTL=10
ACCOUNT_SSO_LOGIN_PATH=/login
```

The ChatUI Nginx proxies `/v0/` and `/tinode-media/` to
`https://web.vichat.net`. Upstream certificate verification is temporarily
disabled because that endpoint's certificate is expired; SNI and `Host` remain
pinned to `web.vichat.net`. Renewing the upstream certificate and re-enabling
verification is a required follow-up.

The one-time switch runs `scripts/switch_tinode_central.py` only after a
verified Chatmgt backup and a successful proxy/provisioning probe. It clears
only Tinode UID/topic mappings and automatic `CHAT_*` knowledge copies; account,
tenant, conversation and membership IDs are preserved.

The Workspace migration is `20260804_10` and must be applied after
`20260803_09` before recreating Chatmgt. Rollback uses the existing release and
database backup procedure; the migration is intentionally marked irreversible
because production data must be restored from the verified PostgreSQL backup
when a rollback requires removing Workspace rows.

The real production `.env` is never committed or printed. For another company,
deploy a separate fixed tenant configuration/domain or an explicitly approved
tenant-routing layer; do not expose a global tenant selector in ChatUI.

## Acceptance requirements

- An invited tenant-A UpGO Account authenticates only to active tenant A; the
  same Account identity in tenant B receives a different projection and Tinode identity.
- A tenant-A session cannot list, search, open, add, update or remove tenant-B
  users, conversations, groups, participants or audit records.
- Invalid credentials return `401`; rate limits are scoped by tenant, identity
  and IP; successful responses contain no password/hash/secret.
- Admin Account SSO creates only a management-scope session and cannot request
  an employee Tinode token.
- Token refresh works after the original employee password is no longer
  available to the browser.
- Removing or disabling an UpGO Account membership deactivates the projection,
  revokes the old Chatmgt session, and prevents new Tinode tokens.
- Token reconnect works from the signed Chatmgt session without recovering the
  original employee password.
- Logout invalidates the session and all protected endpoints reject the old
  token.
- Central Tinode stopped: Chatmgt directory/conversation metadata remains available,
  realtime input is disabled, and reconnect requests a fresh token.
- Management overview shows metadata only and never message/file content.
## External chatbot mode

Production ChatUI can run with `VITE_CHAT_MODE=external`. In this mode the
tenant employee login/session flow remains unchanged, but ChatUI initializes
only the configured assistant and does not load internal directory,
conversation metadata, Tinode topics or realtime chat. Chatmgt can call a
partner chatbot with `CHATBOT_PROVIDER=external-webhook`, or expose approved
tenant-fixed RAG context through `POST /api/v1/chatbot/external/context` using a
dedicated inbound API key. Sources derived from employee conversations remain
excluded from the external boundary.

The outbound webhook receives a neutral payload containing the bounded user
message, conversation ID, sanitized public user, bounded history and retrieved
context. Provider credentials remain in Chatmgt. A third-party integration may
use the following inbound endpoints with `Authorization: Bearer <key>` or
`X-Chatbot-Api-Key`; `CHATBOT_EXTERNAL_TENANT` and an optional knowledge base ID
are fixed server-side and cannot be selected by the caller.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/chatbot/external/context` | Return bounded approved RAG context/snippets |
| `POST` | `/api/v1/chatbot/external/message` | Run the configured chatbot flow without an employee browser session |
| `GET` | `/api/v1/chatbot/health` | Report provider and external data API readiness |

See `infrastructure/production/README.md` and `docs/DEVELOPMENT_WORKFLOW.md` for
deployment, rollback and verification commands.

- Tenant-A Workspace items, participants, search results, activities and stats
  are never returned to a tenant-B session.
- Announcement/integration mutations require an administrator; task,
  approval, ticket, wiki and event actions follow creator/owner/participant
  roles and reject invalid transitions.
- Workspace polling and failures do not reconnect Tinode, change topic
  subscriptions or disable the message composer.
