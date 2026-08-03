# Chat backend architecture

## Delivery stages

| Stage | Scope | Completion rule |
| --- | --- | --- |
| 1 | Chatmgt deployment, Alembic, domains, HTTPS | Service is healthy, database is at Alembic head, and public URLs use HTTPS |
| 2 | UpGO Account login/logout | Employees authenticate from `account.upgo.vn`; Chatmgt never receives an Account password |
| 3 | ChatUI data from Chatmgt | Directory, friends, and conversation metadata are tenant-scoped and loaded from Chatmgt |
| 4 | Chatmgt and Tinode/ChatAPI | Realtime tokens, topics, messages, files, presence, and receipts pass their own acceptance tests |

Stages must be tested independently. In particular, Step 2 must not provision a
Tinode account or request a Tinode token.

## Service boundaries

- `account.upgo.vn`: authoritative employee identity, password, current tenant,
  tenant memberships, tenant role, email, display name, and avatar.
- `chat` (React ChatUI): starts the Account login redirect and holds only the
  public profile returned by Chatmgt. It never renders or submits an employee
  password form.
- `chatmgt` (`chatservice-main`): validates the Account session, maintains a
  tenant-scoped profile projection needed by chat metadata, and issues/revokes
  the Chatmgt HttpOnly session.
- `chatapi` (Tinode): owns realtime topics, messages, files, presence, typing,
  reactions, and receipts. This boundary belongs to Step 4.

The local `management_account` row created during SSO is a projection, not a new
user-facing account. It preserves the authoritative Account user ID and tenant ID
in `properties`, uses a deterministic tenant-scoped internal ID, and stores
`!account-sso-only` as an unusable password marker. Passwords, Account tokens,
cookies, and other secrets are never copied into this row.

## Step 2 login flow

1. ChatUI sends `POST /api/v1/auth/sso` with browser credentials enabled and no body.
2. Chatmgt reads only the configured Account cookie (default `session`) from the request.
3. Chatmgt forwards that cookie server-to-server to `GET /current_user` on `ACCOUNT_URL`.
4. Chatmgt rejects an expired session, missing Account user ID, missing or ambiguous
   tenant selection, inactive membership, or an identity collision with a local account.
5. Chatmgt synchronizes the tenant/profile projection and issues a JWT with
   `amr=account_sso` in the `vichat_access_token` HttpOnly cookie.
6. The response contains the public user, tenant, and `connection: management`.
   It contains no password and no Tinode token.

When Account returns `SESSION_EXPIRED` (currently HTTP 520), Chatmgt normalizes
it to HTTP 401 with `ACCOUNT_LOGIN_REQUIRED`. ChatUI redirects to:

```text
https://account.upgo.vn/?continue=<URL-encoded ChatUI callback URL>
```

The callback URL includes a short-lived query marker so ChatUI retries SSO once
after Account redirects back. It removes the marker before rendering the app.

## Step 2 logout flow

For a JWT issued with `amr=account_sso`, `POST /api/v1/auth/logout`:

1. Calls Account `POST /logout` with the shared Account cookie when available.
2. Revokes the current Chatmgt JWT through Redis.
3. Clears `vichat_access_token`.
4. Clears the configured Account cookie for `.upgo.vn`.

Cookie clearing still happens if Account already considers the session expired or
its logout response cannot be confirmed. A logout failure must not trap the user
inside ChatUI.

## Administrator isolation

`POST /api/v1/admin/sso` is reserved for the Chatmgt management page and
requires `X-Vichat-Session-Scope: management`. Chatmgt validates the shared
Account cookie through `/current_user`, selects the current active tenant, and
accepts only normalized roles `admin`, `owner`, or `superadmin`. It then issues
the separate `vichat_management_access_token`; it does not call Tinode.

Access JWTs carry an explicit `scp=chat` or `scp=management` claim. The backend
selects the cookie by request surface and rejects a token whose scope does not
match, including Authorization-header tokens. Production enables
`CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED=true`, which disables public local password
login on `/login`. An internal deployment verifier may still mint a short-lived
management token directly from the server secret for its temporary admin row;
there is no public endpoint for this operation.

Privileged management mutations, audit access, and the management conversation
overview also require `X-Vichat-Session-Scope: management`. An Account admin's
normal ChatUI token therefore cannot be reused against the management control
plane even though both sessions project the same Account identity.

The management page is a tenant-scoped control plane, not another employee
account system and not a message viewer. It may display Account-backed profile
projections, revoke Chatmgt-owned sessions, inspect friend/conversation/group
metadata, review security audit events, and report Account SSO/Tinode bridge
readiness. It must not create, edit, disable, or reset passwords for Account
employees, and it never loads Tinode messages, files, presence, typing, or
receipts. Employee identity changes link back to `account.upgo.vn`.

Administrator identity, password, tenant membership, and role are owned by
UpGO Account. A role downgrade is detected on the next management request and
revokes access. Management logout revokes the Chatmgt management token and ends
the shared Account session.

| Method | Path | Management-page purpose |
| --- | --- | --- |
| `GET` | `/api/v1/chat/users?include_inactive=true` | Read tenant-scoped Account projections; no employee credential/profile mutation |
| `POST` | `/api/v1/chat/users/<id>/revoke-session` | Revoke Chatmgt-owned employee sessions |
| `GET` | `/api/v1/admin/conversations` | Read tenant conversation/group membership and bridge readiness without message content |
| `GET` | `/api/v1/admin/audit-logs` | Review tenant-scoped security events |
| `POST` | `/api/v1/admin/sso` | Exchange an active Account admin session for the isolated management cookie |
| `POST` | `/api/v1/auth/logout` | Revoke management state and end the Account session |

When `CHAT_ACCOUNT_SSO_ENABLED=true`:

- `POST /api/v1/auth/login` rejects employee password login.
- Password reset/change endpoints reject Account-backed projections.
- Account-backed identity/profile fields are read-only in Chatmgt. The current
  employee avatar is the only write-through exception: Chatmgt validates the
  Account session and tenant, uploads the image using the Account media
  contract, updates the matching Account user, then refreshes its projection.
- Creating employee credentials in Chatmgt is disabled; employees must already
  exist in UpGO Account.
- Revoking a Chatmgt session remains available because it is Chatmgt-owned state.

## Step 2 API contract

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/auth/sso` | Validate Account session and issue Chatmgt session |
| `GET` | `/api/v1/auth/me` | Validate/read the current Chatmgt and Account-backed profile |
| `POST` | `/api/v1/auth/avatar` | Validate the Account session, update the current Account avatar, and refresh Chatmgt projection |
| `POST` | `/api/v1/auth/logout` | Revoke Chatmgt and end/clear Account session |
| `GET` | `/api/v1/auth/health` | Report employee auth and Account SSO readiness |
| `POST` | `/api/v1/admin/sso` | Account SSO login for current-tenant administrators only |
| `POST` | `/login` | Legacy local administrator login; disabled in production Account-admin mode |
| `POST` | `/api/v1/auth/login` | Legacy employee password login; disabled in Account SSO mode |

The existing Tinode token/topic endpoints remain Step 4 code paths and are not
called by the Step 2 ChatUI session.

## Step 3 directory and conversation flow

Chatmgt is the API source consumed by ChatUI, but it does not become the
authoritative employee identity system. For an Account-backed Chat session:

1. `GET /api/v1/chat/users` revalidates `/current_user` so the Account tenant
   still matches the Chatmgt JWT.
2. Chatmgt forwards the shared Account cookie server-to-server to the configured
   tenant directory path, default `GET /api/v1/tenant_user?page=1&results_per_page=1000`.
3. Each returned employee is normalized and upserted as a tenant-scoped
   `management_account` projection using the same deterministic ID as Step 2.
   Missing optional fields do not erase a previously synchronized role or
   profile field. Invalid/conflicting records are skipped and counted without
   exposing secrets. A fresh directory snapshot must contain the authenticated
   user; Account-backed projections absent from that verified snapshot are
   deactivated instead of remaining visible indefinitely.
4. ChatUI reads directory/search, friend requests, conversations, and
   participants only from Chatmgt. It never calls the Account directory from the
   browser.
5. ChatUI persists direct conversations and groups to Chatmgt before displaying
   them. A deterministic participant key reuses an existing direct conversation
   and reactivates a participant who previously removed it.

For a direct conversation, ChatUI derives the displayed name, avatar, personal
detail card, and presence label from the active participant other than the
current Account user. It does not use the shared conversation subject as the
peer identity and does not render the current user as their own contact.

Notification mute state is viewer-specific Chatmgt metadata on the authenticated
`conversation_participant` row. `NULL` means notifications are enabled, `0`
means muted until manually enabled, and a positive value is an absolute Unix
deadline. Muting never changes the Tinode subscription, unread count, latest
message preview, receipt, presence, or message delivery. ChatUI suppresses only
the alert sound, does not request browser desktop-notification permission, and
uses the stored deadline to re-enable alerts automatically in every ChatUI
session which has loaded that preference from Chatmgt.

If Account directory refresh is temporarily unavailable, Chatmgt serves the
last valid tenant-scoped projections with `directory_sync.status=stale`. Login,
tenant mismatch, or revoked Account sessions are never converted into a stale
success response.

The `management` UI mode is not demo mode. It permits directory, friendship,
conversation, and membership operations, while disabling employee-to-employee
messages and files with an explicit Step 4 notice. The chatbot remains a
separate Chatmgt API flow.

### Step 3 API contract

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/chat/users` | Refresh/cache the Account tenant directory and return Chatmgt projections |
| `GET` | `/api/v1/chat/users?q=...` | Search the cached tenant directory without another upstream refresh |
| `GET/POST` | `/api/v1/friend-request` | List or create tenant-scoped friend requests |
| `PUT` | `/api/v1/friend-request/<id>` | Accept or reject an incoming request |
| `GET/POST` | `/api/v1/conversation` | List member conversations or create/reopen direct/group metadata |
| `PUT` | `/api/v1/conversation/<id>/notification-settings` | Set or clear the authenticated participant's notification mute deadline |
| `POST` | `/api/v1/conversation/<id>/participants` | Add group participants as the owner |
| `DELETE` | `/api/v1/conversation/<id>/participants/<user-id>` | Remove a member or remove the current user from the list |

## Step 4 realtime bridge

Step 4 upgrades a valid Step 2/3 session; it does not change the Account login
contract. After ChatUI has loaded the tenant directory and conversations from
Chatmgt, it explicitly calls `POST /api/v1/auth/tinode-token`. Chatmgt
revalidates the current Account cookie and tenant, derives a deterministic
tenant-scoped Tinode credential on the server, provisions or repairs the Tinode
account, and returns only a short-lived Tinode token. The Account password and
the derived Tinode credential are never returned to ChatUI.

The deterministic Tinode basic username is limited to 26 characters because
Tinode persists the composite `basic:<username>` identity in a 32-character
column. Account projections which failed before Tinode provisioning are repaired
to the current deterministic username on their next SSO/token request; an
already provisioned Tinode UID is never renamed automatically.

For a conversation without a Tinode topic, ChatUI calls
`POST /api/v1/conversation/<id>/tinode-prepare`. Chatmgt verifies current
membership and prepares missing Tinode user mappings for the active Chatmgt
participants. A Tinode direct topic is viewer-relative: user A addresses the
conversation as user B's prepared UID, while user B addresses the same Chatmgt
conversation as user A's UID. Chatmgt therefore derives `tinode_topic` for each
authenticated viewer and never persists one shared direct UID on the
conversation row. New group topics are created with exactly the prepared
Chatmgt participants, then `PUT /api/v1/conversation/<id>/tinode-topic`
verifies the caller's fresh token, authenticated Tinode UID, topic type, and
complete subscriber set. Only group bindings are persisted and globally
checked for topic conflicts.

Once a group is bound, participant changes are orchestrated by Chatmgt:

1. ChatUI sends the normal Chatmgt participant API request with a fresh
   short-lived Tinode token.
2. Chatmgt revalidates Account when the session uses `amr=account_sso`, enforces
   tenant membership and owner rules, and prepares any missing target UID.
3. Chatmgt updates the Tinode subscription first and commits the matching
   Chatmgt membership only after Tinode confirms the operation.
4. Removing oneself unsubscribes the current Tinode user. When the group owner
   leaves, the next active Chatmgt owner is granted Tinode owner mode before the
   old owner is unsubscribed.

Chatmgt remains authoritative for directory, friendship, conversation metadata,
and membership. Tinode remains authoritative for messages, files, presence,
typing, reactions, and delivery/read receipts. ChatUI filters all Tinode topic
events through the currently allowed Chatmgt topic bindings. Tinode `on` and
`off` events from the authenticated user's `me` topic update the corresponding
directory account and direct conversation immediately; the periodic/contact
snapshot is only reconciliation, not the primary presence signal.

If token provisioning or the Tinode socket is unavailable, ChatUI stays in
`management` mode: Step 3 data remains usable, realtime inputs remain disabled,
and the failure is shown instead of falling back to demo/localStorage data.
Reconnects request a new Tinode token through Chatmgt instead of retaining an
expired token.

### Step 4 API contract

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/auth/tinode-token` | Revalidate Account and issue a short-lived Tinode token |
| `POST` | `/api/v1/conversation/<id>/tinode-prepare` | Prepare participant UID mappings from current Chatmgt membership |
| `PUT` | `/api/v1/conversation/<id>/tinode-topic` | Validate a viewer-relative direct topic or bind a shared group topic |
| `POST` | `/api/v1/conversation/<id>/participants` | Add both the Tinode subscription and Chatmgt membership |
| `DELETE` | `/api/v1/conversation/<id>/participants/<user-id>` | Remove both the Tinode subscription and Chatmgt membership |

## Required production configuration

```dotenv
CHAT_ACCOUNT_SSO_ENABLED=true
CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED=true
ACCOUNT_URL=https://account.upgo.vn
ACCOUNT_SSO_PROFILE_PATH=/current_user
ACCOUNT_SSO_DIRECTORY_PATH=/api/v1/tenant_user
ACCOUNT_SSO_LOGOUT_PATH=/logout
ACCOUNT_SSO_SELF_PROFILE_PATH=/me
ACCOUNT_SSO_USER_UPDATE_PATH=/api/v1/user
ACCOUNT_AVATAR_UPLOAD_URL=https://service.upgo.vn/api/image/upload?path=accounts
ACCOUNT_SESSION_COOKIE_NAME=session
ACCOUNT_SESSION_COOKIE_DOMAIN=.upgo.vn
ACCOUNT_SESSION_COOKIE_SECURE=true
CHAT_AUTH_JWT_SECRET=<at-least-32-random-characters>
CHAT_AUTH_COOKIE_SECURE=true
TINODE_INTERNAL_WS_URL=ws://chatapi:6060/v0/channels
TINODE_API_KEY=<matching-chatapi-api-key>
TINODE_ADMIN_USERNAME=admin
TINODE_ADMIN_PASSWORD=<current-tinode-root-password>
TINODE_SSO_SECRET=<at-least-32-random-characters>
TINODE_TOKEN_EXPIRE_IN=300
```

The real `infrastructure/production/.env` is intentionally not modified by code
changes. The Account avatar paths use the production defaults shown here; an
operator only needs to add overrides when the upstream Account contract differs.

## Step 2 acceptance

- Existing active Account user can enter Chat without submitting a password to Chatmgt.
- Missing/expired Account cookie produces `ACCOUNT_LOGIN_REQUIRED` and the correct redirect.
- Inactive, missing, cross-tenant, or ambiguous membership is rejected.
- `/api/v1/auth/sso` does not call Tinode and returns no Tinode token.
- Employee and local administrator password login are disabled; only an active
  current-tenant Account administrator can obtain the isolated management session.
- Chat and management JWT scopes cannot be exchanged or used on the other surface.
- Logout revokes Chatmgt, calls Account logout, and clears both cookie scopes.
- Refresh after logout cannot reopen `/api/v1/auth/me`.
- Changing the avatar updates the matching UpGO Account user, refreshes the
  tenant-scoped Chatmgt projection, and propagates the Account URL to Tinode;
  another Account user or tenant cannot be targeted by the request.

Directory/conversation correctness is accepted in Step 3; realtime messaging is
accepted in Step 4.

## Step 3 acceptance

- An active Account user sees all valid current-tenant employees returned by
  Account, while foreign-tenant and inactive projections are not exposed.
- Search, friend request send/accept/reject, direct conversation, group creation,
  add/remove member, leave, and per-user removal persist through refresh.
- Reopening the same direct pair reuses one Chatmgt conversation instead of
  producing duplicates.
- `connection: management` is labeled as Chatmgt data mode, never demo mode.
- Employee messages/files are disabled with an explicit Step 4 notice and are
  not written to local browser demo storage.
- Account identity/profile fields remain read-only in ChatUI. The avatar control
  writes through to Account and then resynchronizes Chatmgt/Tinode; it does not
  create a Chatmgt-only profile value.

## Step 4 acceptance

- `/api/v1/auth/sso` still returns `connection: management` and no Tinode token;
  ChatUI requests `/api/v1/auth/tinode-token` only after Step 3 data is ready.
- `/api/v1/auth/health` reports
  `account_sso.tinode_bridge_configured=true`; a management administrator cannot
  request an employee Tinode token.
- Two Account users in one tenant can open the same direct conversation, send
  text and files, observe presence/typing, and see delivery/read receipts after
  refresh and reconnect.
- Group creation binds exactly the active Chatmgt members. Add, remove, leave,
  and owner transfer update both Chatmgt and Tinode and survive refresh.
- A different tenant, a non-member, a mismatched direct UID, a group with extra
  subscribers, an expired token, and a revoked Account session are rejected.
- If Tinode is stopped, ChatUI continues showing Chatmgt directory and
  conversation metadata without enabling demo messages. Restarting Tinode
  reconnects with a refreshed token.
- Logout disconnects and clears the browser Tinode session. Issued Tinode tokens
  remain bounded by the configured short lifetime (recommended 300 seconds).
