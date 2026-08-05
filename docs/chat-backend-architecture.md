# Chat backend architecture

## Delivery stages

| Stage | Scope | Completion rule |
| --- | --- | --- |
| 1 | Chatmgt deployment, Alembic, domains, HTTPS | Service healthy, database at Alembic head, public URLs use HTTPS |
| 2 | Tenant employee login/logout | ChatUI accepts only Chatmgt username/password; admin Account SSO remains isolated to Chatmgt |
| 3 | ChatUI data from Chatmgt | Directory, friends, conversations, groups, profile and notification metadata are tenant-scoped |
| 4 | Chatmgt and Tinode/ChatAPI | Short-lived Tinode tokens, messages, files, presence, receipts, typing and calls pass acceptance tests |

Stages are tested independently. Employee Step 2 authentication does not trust
tenant, role, or user IDs supplied after the session is issued.

## Service boundaries

- `account.upgo.vn`: authoritative identity and password only for the Chatmgt
  administrator SSO. It is not called by ChatUI employee login.
- `chat` (React ChatUI): submits the configured tenant's employee username and
  password to Chatmgt, stores only the public profile/session result, and uses
  Tinode only with a short-lived token returned by Chatmgt.
- `chatmgt` (`chatservice-main`): owns tenant accounts, bcrypt password hashes,
  roles, active status, avatars, directory/friend/conversation metadata, tenant
  authorization, audit records and the HttpOnly chat/management sessions.
- `web.vichat.net` (central Tinode): owns message/file content, topics,
  presence, typing, reactions, delivery/read receipts and call signaling.
  ChatUI reaches it through the TLS-safe `chat.upgo.vn` Nginx relay, while
  Chatmgt reaches the same relay at `ws://chat:80/v0/channels`. The old local
  `chatapi` container remains only for rollback until migration acceptance is
  complete. WebRTC media remains browser-to-browser or Coturn; Chatmgt never
  reads Tinode content.

The administrator page uses `POST /api/v1/admin/sso` and the separate
`vichat_management_access_token`. It accepts only Account `admin`, `owner` or
`superadmin` for the active tenant. Employee ChatUI sessions use
`vichat_access_token` with `scp=chat`; the two scopes cannot cross surfaces.

## Step 2 employee authentication

1. The company build fixes `VITE_CHAT_TENANT_ID`; the login page does not offer a
   tenant browser or allow a user to enumerate companies.
2. ChatUI sends `POST /api/v1/auth/login` with `{identity, password, tenant_id}`.
3. Chatmgt looks up an active `management_account` by username/email and the
   requested tenant, verifies bcrypt, records tenant-scoped rate-limit state,
   and issues the Chatmgt HttpOnly chat cookie.
4. Chatmgt verifies the bcrypt password and synchronizes the same local
   username/password to the mapped Tinode basic credential. The response
   contains the Tinode token and provider expiry, never the password or hash.
5. The signed Chatmgt chat cookie carries that Tinode token for reconnects.
   ChatUI retains the password only in volatile tab memory and sends it back
   over the authenticated renewal request when the Tinode token is expiring;
   it never writes the password to storage, cookies or logs.
6. Logout revokes the Chatmgt token and clears the ChatUI cookie. A later API
   call receives `401`/`403`.

When `CHAT_ACCOUNT_SSO_ENABLED=true` is used as a rollback mode,
`POST /api/v1/auth/login` is disabled and the legacy `/api/v1/auth/sso` flow may
be enabled for employee Account sessions. Production uses `false`.

## Administrator isolation and account provisioning

The management page always keeps Account SSO for administrators when
`CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED=true`. The management endpoint validates the
Account cookie server-to-server, checks the current tenant and admin role, and
issues only the management-scope cookie. It does not call Tinode.

Inside **Nhân viên**, a tenant admin can:

- create a local employee with username, bcrypt password, name, role, status,
  department, title and avatar URL;
- update local profile/role/status fields;
- revoke an employee's Chatmgt sessions; and
- reset a local password.

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

Chatmgt never uses browser localStorage as a fallback message store. If Tinode
is unavailable, the directory and conversation metadata remain visible while
realtime message/file inputs stay disabled and show the connection state.

## Step 4 Tinode bridge

When `TINODE_MIRROR_LOCAL_CREDENTIALS=true`, a local employee uses the same
Chatmgt username/password in Tinode Web. Chatmgt uses:

```text
tinode_username = management_account.username
tinode_password = employee password (Chatmgt request memory; ChatUI tab memory
                 only during the active session)
```

Tinode basic usernames are global per Tinode server and must satisfy Tinode's
letters/numbers/dot/underscore policy (maximum 32 characters). A production
deployment therefore uses one fixed tenant per Tinode server/domain, and
Chatmgt rejects a duplicate username across tenants when mirroring is enabled.
Existing deterministic `upgo_*` identities are migrated in place by UID on the
employee's next password login; group subscriptions and message history stay
on that UID. The signed Chatmgt JWT carries only the short-lived Tinode token
for reconnects; no reversible employee password is persisted. A renewed token
is issued only after Chatmgt re-verifies bcrypt. Disabling or
revoking a local account replaces its Tinode credential with an unusable
server-derived value until the employee is re-enabled and logs in again.

Set `TINODE_MIRROR_LOCAL_CREDENTIALS=false` only for rollback; that mode keeps
deterministic server-side Tinode credentials and does not support direct
employee-password login in Tinode Web.

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
| `POST` | `/api/v1/auth/login` | Tenant-scoped employee username/password login |
| `GET` | `/api/v1/auth/me` | Read the current Chatmgt session |
| `POST` | `/api/v1/auth/logout` | Revoke the current Chatmgt session |
| `POST` | `/api/v1/auth/tinode-token` | Issue/refresh a short-lived Tinode token |
| `POST` | `/api/v1/admin/sso` | Account SSO for current-tenant administrators |
| `GET/POST/PUT` | `/api/v1/chat/users...` | Tenant employee directory and admin CRUD |
| `POST` | `/api/v1/chat/users/<id>/revoke-session` | Revoke a tenant employee session |
| `POST` | `/api/v1/chat/users/<id>/reset-password` | Reset or provision local ChatUI access |
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
CHAT_ACCOUNT_SSO_ENABLED=false
CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED=true
VITE_CHAT_AUTH_MODE=password
CHATMGT_DEFAULT_TENANT=song-hong
CHAT_AUTH_JWT_SECRET=<at-least-32-random-characters>
TINODE_SSO_SECRET=<at-least-32-random-characters>
TINODE_MIRROR_LOCAL_CREDENTIALS=true
TINODE_ADMIN_USERNAME=<server-side-tinode-admin>
TINODE_ADMIN_PASSWORD=<server-side-tinode-admin-password>
TINODE_INTERNAL_WS_URL=ws://chat:80/v0/channels
TINODE_TOKEN_EXPIRE_IN=300
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

- A fixed-tenant username/password authenticates only an active account; when
  Tinode credential mirroring is enabled, the username is globally unique on
  that Tinode server and opens the same UID in Tinode Web.
- A tenant-A session cannot list, search, open, add, update or remove tenant-B
  users, conversations, groups, participants or audit records.
- Invalid credentials return `401`; rate limits are scoped by tenant, identity
  and IP; successful responses contain no password/hash/secret.
- Admin Account SSO creates only a management-scope session and cannot request
  an employee Tinode token.
- Token reconnect works from the signed Chatmgt session without recovering the
  original employee password.
- Password reset/change updates bcrypt, auth version and the mapped Tinode
  basic credential together; no plaintext password is persisted.
- Logout invalidates the session and all protected endpoints reject the old
  token.
- Central Tinode stopped: Chatmgt directory/conversation metadata remains available,
  realtime input is disabled, and reconnect requests a fresh token.
- Management overview shows metadata only and never message/file content.
- Tenant-A Workspace items, participants, search results, activities and stats
  are never returned to a tenant-B session.
- Announcement/integration mutations require an administrator; task,
  approval, ticket, wiki and event actions follow creator/owner/participant
  roles and reject invalid transitions.
- Workspace polling and failures do not reconnect Tinode, change topic
  subscriptions or disable the message composer.
