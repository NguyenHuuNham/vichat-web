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
- `chatapi` (Tinode): owns message/file content, topics, presence, typing,
  reactions, delivery/read receipts and call signaling. WebRTC media remains
  browser-to-browser or Coturn; Chatmgt never reads Tinode content.

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
4. The response contains only public user/tenant fields and
   `connection: management`; it contains no password, hash or Tinode token.
5. ChatUI loads Step 3 metadata, then calls `POST /api/v1/auth/tinode-token`.
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
keeps a non-sensitive legacy Account audit marker, and never copies the Account
password. A reset/change changes the Chatmgt bcrypt hash and auth version only;
the next Tinode login repairs the server-derived credential if needed.

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

Tinode credentials are never the employee password. For a local account Chatmgt
uses:

```text
tinode_username = stable_tinode_username(tenant_id, management_account.id)
tinode_password = HMAC-SHA256(TINODE_SSO_SECRET,
                              tenant_id + account_id + tinode_username)
```

The derived credential stays in Chatmgt memory. Chatmgt provisions or repairs
the Tinode identity server-side, then returns only the short-lived Tinode token
and expiry from `POST /api/v1/auth/tinode-token`. Two tenants with the same
employee username still receive different management IDs, Tinode usernames and
derived credentials. Token refresh does not ask the browser to resubmit the
employee password.

`POST /api/v1/conversation/<id>/tinode-prepare` prepares missing UID mappings
from current Chatmgt membership. Group topic binding and add/remove/leave
operations verify the fresh Tinode token and exact tenant member set before
committing Chatmgt metadata. Tinode remains authoritative for message content,
files, presence, typing, reactions, receipts and call signaling.

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
TINODE_ADMIN_USERNAME=<server-side-tinode-admin>
TINODE_ADMIN_PASSWORD=<server-side-tinode-admin-password>
TINODE_INTERNAL_WS_URL=ws://chatapi:6060/v0/channels
TINODE_TOKEN_EXPIRE_IN=300
```

The real production `.env` is never committed or printed. For another company,
deploy a separate fixed tenant configuration/domain or an explicitly approved
tenant-routing layer; do not expose a global tenant selector in ChatUI.

## Acceptance requirements

- A tenant-A username/password authenticates only an active tenant-A account;
  the same username in tenant B is a different account and Tinode identity.
- A tenant-A session cannot list, search, open, add, update or remove tenant-B
  users, conversations, groups, participants or audit records.
- Invalid credentials return `401`; rate limits are scoped by tenant, identity
  and IP; successful responses contain no password/hash/secret.
- Admin Account SSO creates only a management-scope session and cannot request
  an employee Tinode token.
- Token refresh works after the original employee password is no longer
  available to the browser.
- Password reset/change updates bcrypt and auth version only; Tinode credential
  remains server-derived.
- Logout invalidates the session and all protected endpoints reject the old
  token.
- Tinode stopped: Chatmgt directory/conversation metadata remains available,
  realtime input is disabled, and reconnect requests a fresh token.
- Management overview shows metadata only and never message/file content.
