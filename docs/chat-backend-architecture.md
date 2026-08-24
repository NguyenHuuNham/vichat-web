# Chat backend architecture

## Delivery stages

| Stage | Scope | Completion rule |
| --- | --- | --- |
| 1 | Chatmgt deployment, Alembic, domains, HTTPS | Service healthy, database at Alembic head, public URLs use HTTPS |
| 2 | Tenant employee login/logout | ChatUI validates invited employee credentials through UpGO Account; Chatmgt keeps a read-only projection |
| 3 | ChatUI data from Chatmgt | Directory, friends, conversations, groups, profile, notification and per-user pin metadata are tenant-scoped |
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

1. ChatUI does not offer a tenant browser or accept a tenant selector. The
   employee's active UpGO Account membership is the only tenant-routing input.
2. ChatUI sends the employee email/password to `POST /api/v1/auth/account-login`
   over HTTPS. Chatmgt forwards those credentials only to UpGO Account's
   official `POST /login` endpoint and never logs or stores the password.
3. Chatmgt verifies the returned Account session and active tenant/company/
   brand memberships. A valid Account `current_tenant_id` remains authoritative.
   If the field is missing, stale, or inactive, Chatmgt selects the first active
   membership in Account order and uses that membership's role; it rejects the
   session only when no active membership exists. The employee never has to
   choose a tenant in ChatUI. Chatmgt then projects the verified identity to a
   stable tenant-scoped `management_account` row and forwards the Account
   session cookie to later server-side Account checks.
4. Chatmgt issues the HttpOnly chat cookie and returns only public user/tenant
   fields; it never returns an Account password or Tinode secret.
5. ChatUI loads Step 3 metadata, then calls `POST /api/v1/auth/tinode-token`.
6. When the Account identity has more than one active membership, ChatUI shows
   a company switcher in the profile. `POST /api/v1/auth/switch-tenant` first
   validates the requested membership against `/current_user`, calls Account's
   `/api/v1/tenant/set_current_tenant` with the existing Account session, and
   re-reads `/current_user` before rotating only the Chatmgt cookie. It does not
   log out Account or require the employee to enter credentials again. Each
   public option may also carry the Account-provided company/brand logo URL
   and optional logo version; ChatUI renders these as separate icon-only switch
   buttons, exposes the company name through the button tooltip, and uses a
   building fallback when the logo is absent or unavailable. The logo is display
   metadata only.
7. Logout revokes the Chatmgt token and clears the ChatUI cookie. A later API
   call receives `401`/`403`.

When the web page reloads, ChatUI uses `GET /api/v1/auth/me` with the existing
HttpOnly cookie to rebuild its in-memory account session before loading
Chatmgt/Tinode data. While an account is active, the same endpoint is checked
when the tab regains focus/visibility and every five seconds. Chatmgt therefore
re-reads the current Account membership logos; ChatUI updates only the in-memory
tenant option metadata (using the optional logo version for cache invalidation)
and does not reset conversations, Tinode, or realtime state. No token or
password is persisted in browser storage.

### Mobile client session

The `mobile/` Expo client uses the same employee credential endpoint but sends
`X-Vichat-Client: mobile`. With `CHAT_MOBILE_BEARER_ENABLED=true`, only that
explicit client marker adds `access_token`, `token_type` and `expires_in` to
the otherwise unchanged cookie response. Web login responses remain
cookie-only. Mobile stores the Chatmgt token in SecureStore and sends it as
`Authorization: Bearer`; native fetch also retains the UpGO Account `session`
cookie set by the login response, because Account SSO validation remains
server-to-server and is not replaced by a bearer-only identity assertion.

The token is still tenant-scoped (`scp=chat`), subject to auth-version
revocation and the same active membership checks. Mobile does not store or send
the UpGO password to Tinode. If Tinode is unavailable, mobile keeps
Chatmgt directory/conversation metadata visible and disables only realtime
message/file actions, matching ChatUI's management-mode fallback.

Chatmgt registers each issued chat JWT as a short-lived Redis linked-session
record keyed by tenant, account and JWT `jti`. The record keeps only device kind,
device name, platform, login time and last activity time. Authenticated requests
touch the record, logout removes it, and `GET /api/v1/auth/devices` returns the
current account's web/mobile/device sessions without exposing tokens. The mobile
login response also includes the current mobile snapshot, and the mobile screen
polls this endpoint while focused so a login from another client appears without
inventing a local-only device record. The current session is still returned when
Redis is temporarily unavailable; cross-device records resume after Redis is
healthy again. When Chatmgt rotates a bearer during
Tinode-token refresh, the replacement bearer is returned to mobile before the old
session is revoked.

Account-backed profile edits follow the same source-of-truth rule: Chatmgt
validates the Account cookie, forwards only editable public fields to the
configured Account user-update endpoint, re-reads `/current_user`, and refreshes
the tenant projection. Chatmgt does not persist a competing profile value and
does not forward passwords or other secrets. If Account rejects an update as
read-only, Chatmgt returns `ACCOUNT_PROFILE_READ_ONLY` instead of treating the
authorization response as an expired login or writing a local fallback value.
Local/recovery accounts retain the existing Chatmgt profile-update behavior.

Account-backed avatar uploads are confirmed by Account before Chatmgt accepts
the new URL. Chatmgt keeps that confirmed URL in the existing account
properties as a protected projection marker, so a delayed `/current_user` or
directory snapshot cannot restore an older avatar after refresh, tenant switch,
or reconnect. A later confirmed upload replaces the marker. Tinode receives the
same confirmed URL for realtime rendering, but Tinode metadata is not allowed
to overwrite the persisted Chatmgt/Account avatar on reconnect.

`GET /api/v1/auth/me` revalidates the authenticated Account session on focus,
visibility changes, and the ChatUI background interval. If UpGo Account changes
the avatar outside ChatUI, Chatmgt refreshes the tenant projection and ChatUI
updates the active directory, member, message, and Tinode profile surfaces
without resetting the conversation session. Group avatar metadata is persisted
in the existing conversation properties under `group_avatar` and `avatar`; the
serializer also reads `avatar_url` and `avatarUrl` for older records, while every
new group update writes the canonical pair so a reload, tenant switch, reconnect,
or deployment cannot fall back to a stale Tinode-only value.

Account directory synchronization is additive: a directory response may be
paginated or otherwise partial, so an existing Chatmgt projection is never
deactivated merely because its Account user is absent from one snapshot. A
projection is deactivated only when Account returns that user with an explicit
inactive/deleted status or when the authenticated Account membership check
rejects the current session. Projections marked by the former incomplete-
snapshot path are repaired only after the current Account session confirms the
same tenant membership; no inactive or cross-tenant account is revived.

Private contact nicknames are a separate viewer preference owned by Chatmgt.
They are stored in the current account's tenant-scoped
`ManagementAccount.properties.contact_nicknames` JSON object, keyed by the
target management account ID; no schema migration is required. The official
Account/Tinode identity remains the source of truth in `defaultName`/
`full_name`, while Chatmgt applies the nickname only when serializing data for
the viewer who owns it. ChatUI applies the same viewer-specific name to
conversation members, group message senders, replies, reactions, history
results, and the group mention/composer picker. Nicknames are never written to
Tinode, broadcast in realtime profile events, or included in another viewer's
response.

Conversation backgrounds follow a separate scope because they are presentation
preferences rather than message content. ChatUI asks whether a selection is
viewer-local or shared. A local selection is stored in
viewer/tenant/conversation-scoped `localStorage`; custom local images are kept
in the matching IndexedDB record, and a local clear marker can override a
shared background without changing the other viewer's presentation. A shared
selection uploads custom images through the authenticated Tinode media relay,
publishes a `conversation_background_changed` system event, and persists the
normalized metadata in the conversation's shared presentation storage: P2P
topics use `aux.x-vichat-conversation-background` because P2P public metadata
remains reserved for the user profile, while group topics use the existing
public `vichat.conversationBackground` metadata. Direct participants or group
members therefore restore a shared background after reload and receive the
actor notification; local group preferences remain viewer-scoped.
The message list keeps the background in a sticky layer inside the full
scrollable message content. Light mode leaves the image sharp and uses
translucent readable message surfaces; dark mode adds a light contrast veil and
stronger message surfaces. No Chatmgt schema, message copy, or migration is
required.

When a user selects multiple images in one upload action, ChatUI stamps each
Tinode attachment with a bounded `x-vichat-image-batch` head containing the
batch id, position and total count. The metadata is presentation-only: Tinode
continues to own each image message and file URL, while ChatUI groups only
contiguous image messages from the same sender and explicit batch for a compact
grid. Stickers, files, legacy messages and separately sent images are not
grouped, and no Chatmgt schema, API or database migration is required.

Group polls use the same Tinode topic as ordinary messages and are deliberately
not enabled for P2P conversations. The poll root message carries bounded JSON
metadata in the `x-vichat-poll` head. Votes, member-added options and creator
locks are small event messages prefixed with `__VICHAT_POLL_EVENT__:`; ChatUI
replays those events against the root poll to rebuild the current options,
votes, expiry and lock state after reconnect or reload. The poll card is
projected after its latest activity so a new vote remains visible at the end
of the group timeline, while the event remains a readable group activity
notice. Tinode's authenticated sender is authoritative for the actor and only
the poll creator can publish a lock event from the UI. No poll copy, vote index,
Chatmgt endpoint, schema migration or database table is introduced. Local
notifications derive the actor from the poll activity rather than the poll
creator, so a vote by another member is not misattributed.

Tinode media URLs from the central host are normalized to the authenticated
`chat.upgo.vn/tinode-media` relay. The native client downloads protected message
and avatar images with its short-lived Tinode token into the OS cache and passes
the same auth headers to native image rendering, so an expired central
certificate, redirect, or missing `Image` request header cannot leave a blank
media surface. The cache is disposable and is not a second message store.
If the relay rejects a protected image or file with `401`/`403`, mobile refreshes
the short-lived Tinode token through Chatmgt and retries that same download once;
network errors and other HTTP failures are not retried. Cache keys include the
token/version so an avatar replacement cannot reuse a stale protected object.

The optional mobile app lock is device-local. It stores a random salt and the
SHA-256 hash of a four-digit PIN in SecureStore, never sends the PIN to Chatmgt,
Tinode or UpGO Account, and covers only an authenticated message surface. Cold
start and normal background-to-active transitions require the PIN; trusted
camera, gallery, document-picker and share transitions do not interrupt the
selected media operation. Resetting a forgotten PIN clears the local verifier
and requires a fresh UpGO Account login.

The optional web ChatUI lock follows the same client-only boundary. It stores a
salted PBKDF2/SHA-256 verifier per viewer in localStorage and keeps the unlocked
marker only in sessionStorage, so a refresh in the same tab remains available
while a newly opened tab requires the PIN. The PIN is never sent to Chatmgt,
Tinode or UpGO Account; disabling or losing the local verifier requires the
normal UpGO Account login to regain access.

Notification delivery has two layers. A local notification is scheduled from
an incoming Tinode event while the JavaScript/WebSocket runtime remains alive.
When `EXPO_PUBLIC_PUSH_ENABLED=true` and the native Firebase/APNs client plus
the matching Tinode push provider are configured, mobile obtains the native
device token and registers it with the authenticated Tinode client through the
Tinode `hi.dev` field. This lets Tinode deliver while the app is suspended or
killed. No device token is stored in Chatmgt. Without both credential halves,
background/killed push remains unavailable and must not be reported as active.

Incoming call invites use a separate high-priority local notification channel.
The notification payload carries only the validated P2P topic, Tinode sequence,
caller UID, media mode and issue time. Tapping it queues the invite until the
authenticated app state is ready, reconnects Tinode, and routes it through the
same mobile call store used by foreground realtime events. Payloads older than
the 40-second call setup window are discarded, expired local notifications are
dismissed, and ending the call dismisses the matching notification. The incoming-call overlay remains above the
optional message PIN screen so a resumed call can be answered or rejected
without exposing conversation content. This improves background/resume behavior while
remaining subject to the native Firebase/APNs and Tinode provider prerequisites
for a fully killed process.

Android voice/video releases are generated from `mobile/app.json`; the ignored
native project is not an authoritative source. Every release prebuild must
materialize both `android.permission.CAMERA` and
`android.permission.RECORD_AUDIO`, and the packaged APK must be inspected for
both permissions before distribution. A stale generated manifest can otherwise
silently remove microphone access while the TypeScript call flow still passes.

Mobile presence is read from Tinode's `me` P2P contacts and the subscribed P2P
topic. The client applies the initial snapshot after Chatmgt directory data is
loaded, then accepts `on`/`off` events immediately. Message delivery is also
Tinode-native: mobile sends `recv` as soon as a subscribed topic receives data,
and keeps monotonic `recv/read` cursors so an older metadata snapshot cannot
downgrade a two-check status. Opening a conversation still sends `read` through
the existing topic API.

Web ChatUI keeps Tinode as the source of presence for subscribed conversations,
but directory-wide presence uses an independent Chatmgt lease. Each authenticated
browser sends a heartbeat every two seconds to
`POST /api/v1/chat/presence/heartbeat`; Chatmgt stores only a tenant-scoped,
session-scoped Redis key with an eight-second TTL. The heartbeat response includes
the requested same-tenant account states, and the optional batch endpoint can read
the same snapshot without refreshing the caller's lease. Logout and `pagehide`
remove the current browser lease best-effort; a crashed tab or network loss becomes
offline automatically when the TTL expires. Redis failures leave the last UI state
in place and never block login, messages, membership, or admin actions.

The server validates every requested account ID against the authenticated JWT
tenant before reading Redis. The client merges only `online`, never lets a stale
Chatmgt directory snapshot overwrite a newer lease, and sorts online employees
before offline employees with name ordering inside each group. This does not
subscribe to P2P topics, create conversations, change membership, or copy
presence into Chatmgt/PostgreSQL. Tinode `me` `on`/`off` events still apply
immediately when a P2P subscription exists.

Recall is an event overlay shared by mobile and ChatUI. `mode=all` hides the
original content and attachment for every participant and keeps a
`Tin nhan da duoc thu hoi` placeholder while retaining the original Tinode
packet for deterministic cross-client matching. `mode=self` is applied only when
the viewer is the authenticated actor, so the sender loses the message while
other participants continue to see the original. A recalled message has no
reply, reaction or message-action affordances; replies render without quoting a
recalled target. A self-only recall projects the removed message as `null`, so
clients must compact that projection before ordering or reading Tinode sequence
fields. Missing `mode` is treated as `all` for legacy clients.

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

- view the tenant-scoped read-only Account projection and Tinode readiness; and
- force an employee's Chatmgt sessions to log out.

The management surface does not expose an add-member link, account creation,
profile/role/status changes, password reset, or conversation/group metadata.
Those user changes are made directly in UpGO Account, outside Chatmgt. The
projection remains in Chatmgt so conversation, friendship, audit, and Tinode
mappings keep stable internal IDs for ChatUI without exposing them to the
administrator console.
For a legacy Account projection in a production migration, reset-password is a
deliberate “Cấp mật khẩu ChatUI” action. It changes only the authentication
source to `local`, preserves the existing management account ID and Tinode UID,
keeps a non-sensitive legacy Account audit marker, and synchronizes the new
local password to the mapped Tinode basic credential. This recovery code remains
disabled by default through `CHATMGT_MANAGEMENT_USER_MUTATIONS_ENABLED`; the
production administrator console does not expose it. The plaintext password is
used only in memory for the Tinode request and is never stored.

The session-revocation action requires both the management cookie and
`X-Vichat-Session-Scope: management`. The target query includes
`ManagementAccount.tenant_id == current_tenant`; an admin cannot target a user
from another tenant by ID or query parameter.

## Step 3 tenant data flow

After login, ChatUI reads `/api/v1/chat/users`, `/api/v1/friend-request` and
`/api/v1/conversation` from Chatmgt only. Directory search, direct pairs, groups,
participants, notification mute deadlines, per-user pin state and profile/avatar changes are all
stored under the JWT tenant. Foreign tenant IDs sent in query strings are
ignored; the authenticated JWT and membership rows remain authoritative.

Employee message-history search uses the authenticated
`POST /api/v1/conversation/<conversation_id>/search` endpoint (with the
`/api/v1/chat/threads/<conversation_id>/search` compatibility alias). Chatmgt
validates the chat-session scope, tenant membership, conversation membership,
Tinode topic mapping and the current Tinode UID before asking Tinode for paged
history. Filters cover text, sender, local calendar date range
(Asia/Ho_Chi_Minh) and explicit timestamps normalized to UTC, plus message/file type
(including images/stickers, video, audio, documents and archives). Tinode is
the canonical message source; Chatmgt stores no message copy or search index.
The response includes a cursor when the safety window contains more history so
ChatUI can continue loading older results without exposing another conversation.
The management admin surface continues to exclude message content and this
employee search endpoint.

The group information panel keeps notification mute and conversation pin
viewer-scoped. Any active group member may add another active employee from the
same tenant; Chatmgt performs that Tinode mutation with a short-lived
server-side owner bridge credential, so legacy member permissions cannot block
the feature and no owner token is returned to the browser. When the group's
`groupSettings.approveMembers` flag is enabled, a new add request is persisted
as `conversation_participant.approval_status = PENDING`, remains inactive and
is omitted from `participantIds`/Tinode subscribers until the owner approves
it. Owner-only conversation snapshots include `pendingMembers`; the owner can
approve or reject each request through the approval endpoint. Approval adds the
member to Tinode and publishes a `member_approved` system event after the
membership commit; rejection soft-deletes the pending row. Disabling the flag
preserves the existing immediate-add flow. Opening or saving group management
settings and removing another member remain owner-only.
Renaming/changing the group avatar is also owner-only
unless the owner explicitly enables `allowMembersEditInfo`. Chatmgt
persists the group subject, avatar reference, and whitelisted boolean
`groupSettings` in the existing `Conversation.subject`/`properties` columns.
`PUT /api/v1/conversation/<id>/group-settings` (and the
`/api/v1/chat/threads/<id>/group-settings` alias) rejects management-scope
sessions, non-members, non-groups, unauthorized members, unknown settings, and
non-boolean values. Tinode public metadata is updated in realtime mode before
the Chatmgt write, with a best-effort Tinode rollback if the authoritative
Chatmgt update fails. The group-management whitelist contains
only member info, pinning, message sending, poll creation, member approval and
new-member history; notes, reminders and group-leader message marking are not
supported settings. `allowPolls` defaults to enabled for backwards
compatibility with existing groups; when disabled, ChatUI exposes poll voting
but only the group administrator can open/create a new poll. Member approval
uses Alembic revision `20260824_12` to add
the explicit `conversation_participant.approval_status` column; existing rows
are backfilled as `APPROVED`.

The default ChatUI contact list is the active UpGO Account employee directory
for the authenticated tenant, excluding the current employee. Employees do not
need an accepted friendship record to discover or start a direct conversation
with coworkers. Friendship records remain compatibility metadata only; direct
conversation creation still validates that every participant is active in the
same tenant before Chatmgt prepares the Tinode pair.

Group creation additionally requires at least one active same-tenant
participant other than the owner. ChatUI disables the submit action when no
other employee is selected, and Chatmgt rejects owner-only group requests so
the rule cannot be bypassed by a direct API call.

Chatmgt may retain a direct-conversation row before either participant has sent
a Tinode message. In realtime mode, ChatUI therefore treats the sidebar as the
intersection of authorized Chatmgt metadata and Tinode activity: direct rows are
shown only after Tinode history contains a message or the employee has a local
draft. Explicit groups and the configured assistant remain visible even when
empty. The metadata row is not deleted, so reopening the coworker from the
directory reuses the same tenant-scoped Chatmgt conversation and deterministic
Tinode mapping without copying message content into Chatmgt.

Deleting a direct conversation is viewer-scoped. Chatmgt keeps both approved
participant rows active and stores only the viewer's deletion timestamp in the
conversation JSON property `direct_deleted_at_by_user`; it never applies the
group leave/deactivation path to a direct pair. Tinode removes the viewer's
message copy with a non-hard delete and records a private `vichatDeletedAt`
boundary. Nicknames remain in the viewer's account properties and shared
conversation backgrounds remain in Tinode auxiliary metadata. When a direct
topic receives a message after that boundary, ChatUI reuses the same Chatmgt
pair, clears both viewer-scoped markers, and merges only post-delete messages;
the group membership and group deletion flows are unchanged. Legacy direct rows
left inactive by the previous behavior are reactivated when the pair is
prepared or bound.

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

The central Tinode hello must advertise its own WebRTC/ICE configuration before
calls are enabled. The bridge reads the protected production
`runtime/ice-servers.json` and may fill `ctrl.params.iceServers` when the
upstream hello omits deployment-local TURN for browser connectivity, but it
also sets `webrtcEnabled=false` because that fallback cannot enable call
handling inside the authoritative Tinode server. Once central Tinode is
configured with the same ICE/TURN records, the bridge marks the response as
`webrtcEnabled=true`. It never replaces authoritative ICE and does not inspect
or rewrite later message, presence or call packets.

`POST /api/v1/conversation/<id>/tinode-prepare` prepares missing UID mappings
from current Chatmgt membership. Group topic binding and add/remove/leave
operations verify the exact tenant member set before committing Chatmgt
metadata. A group owner who leaves must send an explicit `replacement_id`
for another active member; Chatmgt never chooses a successor randomly and
rejects the leave when the selection is missing or invalid. Add-member requests are authorized by the current Chatmgt
membership and use the active owner bridge credential server-side; the browser
does not need to supply an owner token. If a bound group has a stale Tinode
subscriber snapshot, Chatmgt uses the surviving owner bridge credential to
reconcile the topic to the active Chatmgt member set before accepting the bind
or membership change. When a group owner leaves, Chatmgt grants the
explicitly selected replacement member owner access, has that member accept
the transfer through its own Tinode session, and only then removes the former
owner. The leave activity event includes the new owner identity and is
published by a surviving member after the membership commit, so every client
can show the transfer and a rejected Tinode operation cannot create a false
"left the group" message. The replacement receives the same full owner
permissions as the previous owner.
The owner-only `POST /api/v1/conversation/<id>/dissolve` endpoint closes a
group for every member. Before committing the Chatmgt closure it authenticates
the owner bridge, unions the active Chatmgt Tinode mappings with the actual
Tinode subscriber list, publishes a `group_dissolved` system event, and removes
every subscription with the owner last. All participant rows are then marked
inactive/deleted and the conversation is closed; a partial Tinode failure is
rolled back where possible. Group message pinning remains viewer-local as
before, while ChatUI publishes bounded `message_pinned`/`message_unpinned`
system events only for group topics so direct-chat pin behavior is unchanged.
The central Tinode remains authoritative for
message content, files, presence, typing, reactions, receipts and call
signaling. ChatUI does not post normal messages/files to Chatmgt knowledge;
legacy chat-ingestion routes return `410 TINODE_CONTENT_ONLY`.

Sticker messages stay within the same Tinode file path as ordinary image
attachments. ChatUI uploads the selected static `/stickers/puppysoft/*.png`
asset through the authenticated Tinode relay and adds the bounded
`x-vichat-sticker` header (`stickerId`, `packId`, label and version) so the
receiver and history projection can render it as a sticker. Sticker assets and
recent-selection IDs remain frontend-local; Chatmgt does not store sticker
content or metadata, and no separate API or database migration is required.

While the web runtime is active, an incoming Tinode message can trigger a
browser desktop notification and a configurable built-in sound when the viewer
is away from that conversation. The viewer must grant browser permission and
can enable/disable desktop notifications, mute the sound, or choose a sound
profile in ChatUI Settings. Conversation mute suppresses both alerts; these
preferences are viewer-local and contain no message or credential data.

Mobile group creation first creates the tenant-scoped Chatmgt conversation,
prepares every participant's Tinode UID, creates a Tinode `grp` topic, uploads
the optional group avatar through the authenticated Tinode file relay, invites
the prepared members, and binds the topic back through Chatmgt. If binding
fails, the newly created Tinode topic is discarded and the Chatmgt record is
not presented as a ready realtime conversation.

Tinode profile metadata is correlated through both the Chatmgt account ID and
Tinode UID. A profile metadata update refreshes the matching directory entry,
conversation header, members, typing indicator and rendered message/call
history without changing tenant ownership or message content. Account-backed
avatar updates use UpGO Account as the canonical profile source and then publish
the canonical avatar to Tinode public metadata so web and mobile subscribers
receive the change in realtime. Local/recovery accounts use the authenticated
Tinode profile path.

When Tinode reconnects with an older group avatar, ChatUI keeps the current
Chatmgt conversation snapshot and refreshes that snapshot instead of writing
the stale Tinode value back. Group avatar changes continue to persist in the
existing conversation properties and are then merged into all active viewers.

Avatar uploads use a dedicated longer Account upload timeout and verify the
returned avatar URL against the uploaded URL. If `/current_user` is briefly
stale after the Account PUT, Chatmgt re-reads `/me` once before returning an
unconfirmed-update error; it never accepts an unrelated cached avatar.

## Runtime call visibility and chatbot webhook

`VITE_CALLS_ENABLED=true` exposes direct voice/video call entry points and
incoming call UI in builds that include the WebRTC implementation. The call
capability still requires an authenticated P2P Tinode topic, non-empty
ICE/TURN servers and `webrtcEnabled=true` from the authoritative Tinode hello
response. When central Tinode is not configured, clients keep calls disabled
and show an actionable configuration message without changing message,
presence, receipt or group behavior.

In the internal production mode, ChatUI obtains the tenant-independent bot UID
from `GET /api/v1/chatbot/tinode-config`, then sends the chatbot message to the
bot's normal Tinode P2P topic. The isolated `tinode-chatbot-webhook` worker owns
the bot Tinode session, subscribes to direct `usr*` topics and opted-in group
`grp*` topics, and forwards a bounded message envelope to
`POST /api/v1/chatbot/tinode-webhook`. A group message is processed only when
its text or mention metadata contains the canonical `@ViChatAI` mention.
Chatmgt resolves the sender UID to an active `ManagementAccount`, validates the
authenticated tenant and group membership, and persists the group bot opt-in
so later membership reconciliation does not remove the bot. It then calls the
fixed `CHATBOT_API_URL`, currently `https://knowledge-ai.gonapp.net/api/v1/chat`.
In `CHATBOT_EXTERNAL_REQUEST_MODE=knowledge-retrieval`, Chatmgt authenticates
with the server-only `X-API-Key`, sends `message`, bounded `top_k`, and when
`CHATBOT_RETRIEVAL_INCLUDE_HISTORY=true` at most six recent role/content turns
with each turn limited to 800 characters. This bounded context lets a provider
match the group's language and tone without sending employee identity,
credentials, tenant secrets or local knowledge records. If an older retrieval
endpoint rejects the optional history field, Chatmgt retries with the legacy
`message`/`top_k` payload. Provider answers are preferred when returned;
otherwise `sources[].snippet` objects are normalized into a grounded reply with
source metadata. The worker publishes the reply back to the same Tinode topic and
persists a cursor/idempotency key so reconnects do not duplicate replies.

The product-facing assistant identity is `ViChat AI` on both web and mobile.
The synthetic client conversation key is `vichat-ai`; the actual Tinode UID
continues to come from the authenticated `tinode-config` response and is never
hard-coded in either client. The worker places only bounded presentation
metadata (`grounded` and at most five compact source records) in private Tinode
headers, so both clients can render the same verification cards without
changing message ownership or copying employee chat content into Chatmgt.
HTTP fallback history stores the same source metadata with the assistant row.
When the stable client key changed from `bot-songhong` to `vichat-ai`, the
history read/delete routes kept the legacy key as an alias and browser fallback
storage reads it when the new key is empty, so the branding change does not
hide an employee's existing assistant conversation.
The legacy employee-facing knowledge manager and its upload/delete calls are
not part of this retrieval-only assistant surface.

Employee credentials, Tinode tokens, cookies and webhook keys never leave the
trusted Chatmgt/worker boundary. A missing bot configuration or provider outage
returns a bounded temporary reply and leaves normal employee/group/file topics
untouched. The existing authenticated `POST /api/v1/chatbot/message` remains a
HTTP fallback through the same provider adapter for clients that cannot use the
Tinode bot topic.
ChatUI does not expose the legacy knowledge manager or send a knowledge-base
selector in either route.

### Workstation-only answer bridge

For local demonstrations, `scripts/local_vichat_ai_api.py` exposes
`POST /api/ask` on the developer workstation. The caller may send `question`,
`query` or `message`; the bridge calls the approved Knowledge API for bounded
sources and then asks a local Ollama/OpenAI-compatible model to synthesize the
answer. The response contains both `answer` and `reply`, plus bounded
`grounded`/`sources` metadata. `X-Local-AI-Token` (also accepted as
`Authorization: Bearer` or `X-API-Key`) protects the endpoint.

The workstation setup can run a portable llama.cpp `qwen2.5:1.5b` server on
`127.0.0.1:8080` and configure the bridge for its OpenAI-compatible
`/v1/chat/completions` endpoint. The bridge bounds generated tokens so a CPU
model cannot leave a request open indefinitely. A separate ngrok or Cloudflare
quick tunnel may expose only the bridge port for a temporary cross-network
test; the upstream Knowledge key remains on the workstation.

This bridge is intentionally outside the production service boundary: it is
not deployed to the VPS, does not read employee chat history, and is available
only while the user's computer and process are running. A LAN URL is suitable
only when the caller is on the same private network; an external caller needs
an approved HTTPS tunnel. The workstation must not expose port 8000 publicly
without authentication and TLS.

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
| `POST` | `/api/v1/auth/switch-tenant` | Validate an active Account membership and switch the Account/Chatmgt tenant |
| `GET` | `/api/v1/auth/devices` | Read current account's linked web/mobile/device sessions |
| `POST` | `/api/v1/auth/logout` | Revoke the current Chatmgt session |
| `POST` | `/api/v1/auth/tinode-token` | Issue/refresh a short-lived Tinode token |
| `POST` | `/api/v1/admin/sso` | Account SSO for current-tenant administrators |
| `GET` | `/api/v1/chat/users...` | Tenant employee directory projection and Tinode readiness |
| `POST` | `/api/v1/chat/presence/heartbeat` | Refresh the current ChatUI presence lease and return requested same-tenant states |
| `POST` | `/api/v1/chat/presence/batch` | Read requested same-tenant ephemeral presence states |
| `POST` | `/api/v1/chat/presence/offline` | Remove the current browser presence lease best-effort |
| `GET/PUT` | `/api/v1/chat/contact-nicknames...` | Read or update private viewer-scoped 1-1 contact nicknames |
| `POST` | `/api/v1/chat/users/<id>/revoke-session` | Revoke a tenant employee session |
| `GET/POST` | `/api/v1/friend-request` | Tenant-scoped friendship metadata |
| `GET/POST` | `/api/v1/conversation` | Tenant-scoped conversation metadata |
| `PUT` | `/api/v1/conversation/<id>/pin` | Set or clear the current user's conversation pin |
| `POST` | `/api/v1/conversation/<id>/tinode-prepare` | Prepare Tinode participant mappings |
| `PUT` | `/api/v1/conversation/<id>/tinode-topic` | Verify/bind the topic to exact membership |
| `POST` | `/api/v1/conversation/<id>/dissolve` | Owner-only group dissolution; remove all active members and close the group |
| `POST` | `/api/v1/conversation/<id>/participants` | Add same-tenant active employees; any active group member may request this, with owner approval when `approveMembers` is enabled |
| `PUT` | `/api/v1/conversation/<id>/participants/<participant-id>/approval` | Owner-only approve or reject a pending group member; approval reconciles Tinode |
| `DELETE` | `/api/v1/conversation/<id>/participants/<participant-id>` | Remove self, or remove another member as the group owner; owner self-removal requires body `replacement_id` for another active member |
| `DELETE` | `/api/v1/conversation/<id>/self` | Remove the current user's conversation membership; group owner self-removal requires body `replacement_id` |
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
# Optional legacy/local bootstrap tenant; Account login uses the active UpGO membership.
CHATMGT_DEFAULT_TENANT=<bootstrap-tenant-id>
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
ACCOUNT_SSO_TENANT_SWITCH_PATH=/api/v1/tenant/set_current_tenant
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

The real production `.env` is never committed or printed. Account employee
login is tenant-routed from the verified active UpGO membership, so the same
ChatUI can serve multiple companies without a browser tenant selector. Keep
all downstream queries and Tinode mappings tenant-scoped; use a separate
domain/deployment only when an enterprise isolation policy requires it.

## Acceptance requirements

- An invited tenant-A UpGO Account authenticates only to active tenant A; the
  same Account identity in tenant B receives a different projection and Tinode identity.
- An Account identity with active memberships in tenant A and B can switch from
  A to B in ChatUI without Account logout or re-entering credentials; the Account
  current tenant, Chatmgt JWT, directory projection and Tinode mapping all move
  to B before the next directory read.
- A tenant-A session cannot list, search, open, add, update or remove tenant-B
  users, conversations, groups, participants or audit records.
- Invalid credentials return `401`; rate limits are scoped by tenant, identity
  and IP; successful responses contain no password/hash/secret.
- Admin Account SSO creates only a management-scope session and cannot request
  an employee Tinode token.
- Token refresh works after the original employee password is no longer
  available to the browser.
- An UpGO Account membership returned as explicitly removed/disabled deactivates
  the projection, revokes the old Chatmgt session, and prevents new Tinode
  tokens; a partial directory snapshot must not deactivate omitted projections.
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
partner chatbot directly with `CHATBOT_PROVIDER=external-webhook`. Separately,
Chatmgt can expose approved tenant-fixed RAG context through
`POST /api/v1/chatbot/external/context` using a dedicated inbound API key for a
legacy integration. Sources derived from employee conversations remain
excluded from that external boundary.

The ViChat AI outbound webhook receives a neutral payload containing the
bounded user message, conversation ID, sanitized public user and bounded
history, with no retrieved context. Provider credentials remain in Chatmgt. A
third-party legacy integration may use the following inbound endpoints with
`Authorization: Bearer <key>` or `X-Chatbot-Api-Key`;
`CHATBOT_EXTERNAL_TENANT` and an optional knowledge base ID are fixed
server-side and cannot be selected by the caller.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/chatbot/external/context` | Return bounded approved RAG context/snippets |
| `POST` | `/api/v1/chatbot/external/message` | Run the configured chatbot flow without an employee browser session |
| `GET` | `/api/v1/chatbot/health` | Report provider and external data API readiness |
| `GET` | `/api/v1/chatbot/tinode-config` | Return the runtime bot UID/display metadata for the authenticated employee |
| `POST` | `/api/v1/chatbot/tinode-webhook` | Tenant-check a Tinode bot message and call the provider directly without RAG |

See `infrastructure/production/README.md` and `docs/DEVELOPMENT_WORKFLOW.md` for
deployment, rollback and verification commands.

- Tenant-A Workspace items, participants, search results, activities and stats
  are never returned to a tenant-B session.
- Announcement/integration mutations require an administrator; task,
  approval, ticket, wiki and event actions follow creator/owner/participant
  roles and reject invalid transitions.
- Workspace polling and failures do not reconnect Tinode, change topic
  subscriptions or disable the message composer.
