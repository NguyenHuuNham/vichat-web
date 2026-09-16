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
  authorization, viewer-scoped direct-message block state, audit records and
  the HttpOnly chat/management sessions.
- `chatapi.gonplatform.com` (central Tinode): owns message content, topics, stable media
  references, uploaded file bytes, presence, typing, reactions,
  delivery/read receipts and call signaling.
  ChatUI reaches it through the TLS-safe `chat.upgo.vn` Nginx relay, while
  Chatmgt reaches the same relay at `ws://chat:80/v0/channels`. The local
  `chatapi` container remains only as a rollback target. Tinode Web basic login
  is translated by the internal relay bridge through Chatmgt/UpGO Account before
  it reaches the central server. WebRTC
  media remains browser-to-browser or Coturn; Chatmgt never reads Tinode content.
- `s3.upgo.vn` (private MinIO/S3 API): owns the bytes of new chat attachments,
  Tinode-managed avatars and shared backgrounds after the S3 rollout. The
  bucket is private; browsers receive short-lived PUT/GET signatures and never
  receive the server credential. The MinIO console domain is not an S3 API
  endpoint and must not be used for signing.

The administrator page uses `POST /api/v1/admin/sso` and the separate
`vichat_management_access_token`. It accepts only Account `admin`, `owner` or
`superadmin` for the active tenant. Employee ChatUI sessions use
`vichat_access_token` with `scp=chat`; the two scopes cannot cross surfaces.

### Chat media boundary and compatibility

Chatmgt exposes authenticated upload-ticket, completion, and download-signing
routes under `/api/v1/chat/media`. The upload ticket binds a random media ID to
the current tenant, expected byte count, normalized content type and a short
expiry. The browser or native client PUTs directly to S3; completion rejects
and removes an object whose size or content type differs from the signed
ticket. The PUT signature is short-lived, while the separate completion ticket
allows a longer bounded window for large transfers. Uploads first use the
dedicated `_pending/` prefix. Completion copies a validated object to the stable
key with an ETag precondition and removes the pending key; retries return the
existing completed object instead of allowing a
still-live PUT URL to overwrite media already published in Tinode. A bucket
lifecycle rule expires abandoned `_pending/` objects after one day. Tinode then
stores only the stable Chatmgt reference in Drafty or topic metadata. Chatmgt
does not store the binary in PostgreSQL, Redis, knowledge, or Workspace.

Downloads resolve the tenant from the authenticated Chatmgt session and return
a short-lived S3 GET URL. Unsafe inline types such as SVG and text are forced to
`application/octet-stream` attachment responses. Media IDs are tenant-scoped
in the object key and do not expose the tenant ID. Account-managed employee
avatars keep the existing UpGO Account upload contract; this S3 path covers
chat/Tinode media only.

Existing `/tinode-media/...` URLs and the old Tinode upload volume are preserved
for rollback, but the fresh central store does not receive those historical
objects. New `/api/v1/chat/media/...` URLs remain readable whenever the MinIO
read configuration is present, even if a rollback changes the new-upload mode
back to `tinode`. Production uses `CHAT_MEDIA_FALLBACK_TO_TINODE=false`; a
failed S3 upload cannot silently consume the rollback Tinode disk. No old
message, topic, cursor or historical file is migrated into the fresh store.

### ChatUI maintenance control

Chatmgt has a global maintenance control for protecting ChatUI during a
release. `GET /api/v1/chat/maintenance` is a public, cache-free snapshot and
`GET /api/v1/chat/maintenance/stream` is a public SSE stream, because ChatUI
must be able to block a new visitor before login. The management-only
`GET`/`PUT /api/v1/admin/chat-ui-maintenance` endpoint still requires the
management session, Account SSO guard and an `admin`, `owner` or `superadmin`
role. The state is stored in Redis AOF under a versioned key and published on
a separate Redis channel; it does not touch PostgreSQL, Tinode, message data,
presence or user sessions.

ChatUI performs an initial snapshot fetch, subscribes to SSE and keeps a
five-second fallback poll. When enabled it unmounts the ChatApp and shows the
maintenance screen; the Chatmgt surface bypasses this gate so administrators
can turn it off. Redis read errors fail open to protect existing login/chat
flows, while the management write endpoint reports storage failures. Both
production Nginx layers disable buffering and use a long read timeout for the
SSE route so an on/off change reaches open tabs immediately.

## Step 2 employee authentication

1. ChatUI does not offer a tenant browser or accept a tenant selector. The
   employee's active UpGO Account membership is the only tenant-routing input.
2. ChatUI sends the employee email/password to `POST /api/v1/auth/account-login`
   over HTTPS. Chatmgt forwards those credentials only to UpGO Account's
   official `POST /login` endpoint and never logs or stores the password.
3. Chatmgt verifies the returned Account session and active tenant/company/
   brand memberships. A valid Account `current_tenant_id` remains authoritative.
   If the field is missing, stale, or inactive, Chatmgt selects the first active
   membership in Account order only while normalizing the initial login. Once a
   Chatmgt session exists, protected Account checks require the actual current
   tenant returned by `/current_user` to match both the Account user and the
   tenant stored in the Chatmgt JWT; they never select the JWT tenant from the
   membership list. A mismatch revokes the stale Chatmgt token and clears both
   browser session cookies instead of allowing other protected flows to continue
   under the old company. The employee never has to choose a tenant in ChatUI.
   Chatmgt then projects the verified identity to a stable tenant-scoped
   `management_account` row and forwards the Account session cookie to later
   server-side Account checks.
4. Chatmgt issues the HttpOnly chat cookie and returns only public user/tenant
   fields; it never returns an Account password or Tinode secret.
5. ChatUI loads Step 3 metadata, then calls `POST /api/v1/auth/tinode-token`.
6. When the Account identity has at least one active membership, ChatUI shows
   the current company in the profile, including for a single-tenant account.
   The down-arrow menu contains only other active memberships, so a
   single-tenant account has no company choice until Account reports a new
   membership. `POST /api/v1/auth/switch-tenant` first
   validates the requested membership against `/current_user`, calls Account's
   `/api/v1/tenant/set_current_tenant` with the existing Account session, and
   re-reads the actual `/current_user` current tenant before rotating only the
   Chatmgt cookie. It does not log out Account or require the employee to enter
   credentials again. Each
   public option may also carry the Account-provided company/brand logo URL
   and optional logo version; ChatUI renders the active logo, company name and
   current status in a compact control beside a separate down-arrow toggle.
   The opened menu is a bounded vertical list with logo/name rows and scrolls
   when the account has many companies. Selecting another option still goes
   through the existing confirmation and tenant-switch flow. It uses a
   building fallback when the logo is absent or unavailable. The logo is
   display metadata only.
7. Logout revokes the Chatmgt token and clears the ChatUI cookie. A later API
   call receives `401`/`403`.

When the web page reloads, ChatUI uses `GET /api/v1/auth/me` with the existing
HttpOnly cookie to rebuild its in-memory account session before loading
Chatmgt/Tinode data. While an account is active, the same endpoint is checked
without browser caching when the tab regains focus/visibility and every five
seconds. Chatmgt therefore re-reads the current Account membership list and
logos; ChatUI updates only the in-memory tenant option metadata (using the
optional logo version for cache invalidation), so a newly active tenant becomes
available without resetting conversations, Tinode, or realtime state. No token or
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
configured Account user-update endpoint, re-reads the explicit current tenant
from `/current_user`, and refreshes the tenant projection only when it still
matches the Chatmgt session. Chatmgt does not persist a competing profile value and
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

Account directory reads fail closed across tenant boundaries. Chatmgt verifies
the actual Account user and current tenant before and after `/api/v1/tenant_user`;
an explicitly foreign tenant envelope/record or a record whose supplied
membership list omits the verified tenant aborts the response instead of being
merged. Duplicate Account IDs make the snapshot partial. When different Account
IDs claim the same normalized username or email, Chatmgt quarantines every
conflicting non-viewer record instead of merging identities or rejecting the
whole directory. The exact authenticated viewer may be retained only by its
already verified Account ID; all other conflicting claimants are omitted. Such
a snapshot is always partial, cannot drive authoritative deactivation, and does
not merge the previous complete visibility cache back into the response. The
directory response and `ACCOUNT_DIRECTORY_SYNC` audit store only the aggregate
omitted count, never the conflicting username, email or Account ID.
Chatmgt follows Account's `total`/`num_results` metadata across all pages and
marks a snapshot complete only when the exact unique record count is collected
without an invalid record, duplicate page or pagination stall.

A complete snapshot becomes authoritative for removals when the authenticated
viewer is among the successfully projected identities. Chatmgt then deactivates
active, same-tenant Account projections whose Account user ID is omitted by
setting `directory_removed_at` and increments `auth_version`, so older Chatmgt
JWTs are rejected. If an omitted projection holds a username/email now assigned
to an authoritative identity, Chatmgt replaces only that historical row's
username with a deterministic `directory_removed_*` value and clears its email;
the row, Account mapping, Tinode UID and all references remain intact. The
response cache is keyed by `(tenant, viewer)` and marked fully reconciled only
when every normalized identity is projected successfully. Chatmgt does not
delete account rows, Tinode mappings, conversations, messages, memberships or
files, and it never touches legacy/local accounts. A later verified Account
identity can safely rehydrate and restore the same projection.

Partial or metadata-free snapshots remain additive and cannot deactivate an
omitted account; their response is limited to identities verified in that
snapshot (or the last complete safe snapshot for that tenant/viewer), so older
mixed projections are not exposed. Before the first complete safe snapshot, an
Account failure returns an error instead of falling back to unverified rows.
An explicitly inactive viewer, a viewer omitted by a complete snapshot, or a
viewer record that cannot be projected is different from an ordinary partial
omission: Chatmgt purges that viewer's directory cache, deactivates the
projection, increments `auth_version`, revokes the current JWT and clears both
Chatmgt and Account cookies. It never serves the last cached directory after
that authoritative viewer rejection.
Each sync writes `ACCOUNT_DIRECTORY_SYNC` with counts/status only, and a legacy
projection repair writes `ACCOUNT_DIRECTORY_RESTORE`; neither custom payload
contains usernames, emails, cookies or secrets.

Private contact nicknames are a separate viewer preference owned by Chatmgt.
They are stored in the current account's tenant-scoped
`ManagementAccount.properties.contact_nicknames` JSON object, keyed by the
target management account ID; no schema migration is required. The official
Account/Tinode identity remains the source of truth in `defaultName`/
`full_name`, while Chatmgt applies the nickname only when serializing data for
the viewer who owns it. ChatUI applies the same viewer-specific name to
conversation members, group message senders, replies, reactions, history
results, and the group mention/composer picker. The picker and rendered message
labels may show the viewer's nickname, but outbound mention text and `x-mentions`
metadata use the official `defaultName` plus stable account/Tinode IDs. Reply
metadata, forwarded sender labels, and member-event target labels follow the
same allow-listed official-name rule, so a viewer nickname is never written to
Tinode, broadcast in realtime profile events, or included in another viewer's
response. Existing legacy mention metadata is resolved against the current
viewer directory before rendering when the target identity is available.

Browser-only viewer preferences are kept compatible across frontend releases.
The existing localStorage keys and IndexedDB database names remain the storage
contract; ChatUI does not clear browser storage during login, refresh, build or
deployment. The stable Chatmgt Account ID is the primary viewer key. Previous
Account/Tinode UID values are read as non-destructive aliases and valid records
are copied forward to the primary key without deleting the old record. New
writes keep known aliases synchronized where the preference supports it; custom
sticker reads merge aliases before writing new items to the primary library.
Explicit user removal clears the primary and alias copies. These preferences
remain viewer-local and are never promoted to Chatmgt, Tinode message data or
the database. Tenant-scoped browser keys include both the stable viewer and
tenant ID. A legacy record is copied forward without deletion, and its
migration marker is also scoped by viewer and tenant so switching companies
cannot suppress migration in a second tenant or mix settings between tenants.

Conversation category tags are also viewer-local presentation preferences.
Each ChatUI account may create, rename, recolor, reorder or remove its own tag
definitions and assign one tag to each visible direct/group conversation. The
versioned `vichat.conversation-categories.v2.<viewer-id>` localStorage record
contains only tag definitions and Chatmgt conversation IDs; it contains no
message text, credential, Tinode token or shared group metadata. Existing
`vichat.conversation-categories.v1.<viewer-id>` assignments are migrated on
read and kept updated as a rollback-compatible assignment map. Renaming or
deleting a tag updates only that viewer's local presentation, never the
conversation record, membership, read cursor, notification, avatar, pin or
Tinode topic. Category tags therefore survive refresh in the same browser but
do not synchronize across browsers/devices. The v1/v2 category records retain
their names for rollback compatibility while the stable Account ID and any
known legacy UID aliases are read and migrated without deleting the source.

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
Local background metadata and custom file records use the stable Account ID as
the primary key and read prior UID aliases on migration. A valid alias record
or file is copied to the primary key without deleting the alias; an explicit
clear/delete removes the known copies. A primary local clear marker remains
authoritative over a stale alias so an older browser cannot unexpectedly
restore a background the viewer removed.
The realtime projection also applies the newest shared background event before
the accompanying Tinode metadata packet when those packets cross in flight;
the persisted topic metadata remains the recovery source after reload. Local
changes never upload, write topic metadata, or publish a system event.
For group topics, the shared-background choice uses the same
`groupSettings.allowMembersEditInfo` capability as member name and avatar
changes. ChatUI hides the name/avatar controls when that capability is off and
locks the shared-background scope with the friendly
`Bạn chưa được admin cấp phép.` message; a realtime group-settings metadata
update closes or restores those controls without a page reload. A stale Tinode
403 is normalized to the same message rather than exposed as a transport code.
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

Clipboard attachments on ChatUI web follow an explicit draft step. A plain-text
paste is left to the controlled message input and never invokes a publish
handler. One or more pasted images/files are validated and held in an
object-URL preview queue scoped to the current conversation; switching rooms
does not move that queue to another topic. The user may remove individual
items, add a caption, and must press Enter or the Send button before ChatUI
uploads anything. An all-image paste uses the existing bounded image-batch
metadata, while mixed files remain independent attachments. The optional
caption is encoded as the Drafty text of only the first attachment so it is not
duplicated across a batch; mention metadata and a reply target likewise belong
only to that first attachment. The existing image/file picker still publishes
immediately, and the native mobile composer is unchanged. Preview URLs are
revoked when an item is removed, sent, deleted with its conversation, migrated
from a provisional direct-chat id, logged out, or unmounted. Tinode remains the
message/file source of truth and Chatmgt receives no clipboard draft data.

Group polls use the same Tinode topic as ordinary messages and are deliberately
not enabled for P2P conversations. The poll root message carries bounded JSON
metadata in the `x-vichat-poll` head. Votes, member-added options and creator
locks are small event messages prefixed with `__VICHAT_POLL_EVENT__:`; ChatUI
replays those events against the root poll to rebuild the current options,
votes, expiry and lock state after reconnect or reload. The poll card is
projected after its latest activity so a new vote remains visible at the end
of the group timeline, while the event remains a readable group activity
notice. Tinode's authenticated sender is authoritative for the actor and only
the poll creator, group owner or deputy can publish a lock event from the UI. No poll copy, vote index,
Chatmgt endpoint, schema migration or database table is introduced. Local
notifications derive the actor from the poll activity rather than the poll
creator, so a vote by another member is not misattributed.

When results are visible and `hideVoters` is false, ChatUI makes each option's
count a viewer-only details control. It derives selected, not-voted and
other-option lists from the replayed Tinode vote map plus the authoritative
active group-member snapshot, matching Account and Tinode aliases without
persisting a second voter index. If the member snapshot is still loading,
received votes remain visible and the pending-member list stays empty until
the snapshot arrives; no vote, message, setting or Chatmgt record is changed.

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
visible browser sends a heartbeat every two seconds to
`POST /api/v1/chat/presence/heartbeat`; Chatmgt stores a tenant-scoped,
session-scoped Redis key with an eight-second TTL and a separate tenant/account
last-seen key with a bounded 90-day TTL. The session lease is authoritative;
last-seen writes are best-effort so an optional metadata failure cannot invalidate
a successful online refresh or offline cleanup. Heartbeat and logout updates use
an atomic Redis compare-and-set so a delayed older request cannot move the stored
activity boundary backwards. Hidden tabs stop heartbeats; `visibilitychange`
to hidden, logout and `pagehide` remove only the current browser lease. A
successful removal records the server timestamp as the departure boundary;
repeated cleanup, unknown sessions and already-expired leases must not advance
last-seen. Other visible tabs/devices keep their independent leases. Becoming
visible or restoring a page through `pageshow` resumes heartbeats without
disconnecting Tinode, calls, messages or other background features.

Heartbeat/offline bodies accept an optional positive safe-integer `sequence`,
monotonically incremented by the browser for its presence session. Redis applies
it atomically with the lease mutation and retains the last sequence for 24 hours
after the latest accepted event. A delayed heartbeat cannot revive a departed
tab, and delayed offline cleanup cannot remove a resumed tab. Invalid sequences
are rejected as request errors; legacy clients without a sequence remain
compatible. Client timestamps are never used to set the activity boundary.
Responses from a previous visibility/account/tenant lifecycle are ignored. The
response keeps the existing boolean `presence` map and adds a parallel
`last_seen_at` map, so older clients remain compatible while ChatUI can render
elapsed offline time. The optional batch endpoint reads the same snapshot
without refreshing the caller's lease. A crashed tab or network loss becomes
offline automatically when the lease TTL expires, with its last successful
heartbeat as the activity boundary. Redis failures leave the last UI state in
place and never block login, messages, membership, or admin actions.

The server validates every requested account ID against the authenticated JWT
tenant before reading Redis. The client merges `online` plus the bounded last-seen
value, never lets a stale Chatmgt directory snapshot overwrite newer presence
metadata, and sorts online employees before offline employees with name ordering
inside each group. Online labels show only a green indicator and `Trực tuyến`;
offline labels use the last activity boundary when available and fall back to
`Ngoại tuyến` for accounts that have not produced a retained heartbeat yet.
This does not subscribe to P2P topics, create conversations, change membership,
or copy presence into Chatmgt/PostgreSQL. Tinode `me` `on`/`off` events still apply
immediately when a P2P subscription exists.
Those Tinode events update the online boolean only: initial contact sync and
reconnect may report an account that has already been offline for days. Receiving
that event must never set last-seen to the observer's current time. Only retained
Chatmgt activity timestamps determine the offline duration; neither message time,
directory refresh nor the observer opening ChatUI can create a departure time.
If no server timestamp was retained, ChatUI shows the plain offline label rather
than inventing elapsed time.

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

Message editing uses the same append-only overlay pattern and is shared by
mobile and ChatUI. The sender publishes a text control event prefixed with
`__VICHAT_EDIT_EVENT__:` containing the target Tinode sequence, the optional
client ID, the new text, mentions, the previous text/mentions and the edit
timestamp. Clients never mutate or delete the original Tinode packet. During
projection, the Tinode packet sender is authoritative for actor validation and
the target sequence is authoritative when a legacy client ID differs; an edit
is accepted only when the actor is the original message sender and the target
is a delivered text message. Edit events are hidden from the timeline,
notifications and unread counts, while the projected message exposes
`edited`, `editedAt` and an ordered `editHistory` so the UI can show the
current content and every prior version. Replaying the same event is
idempotent, multiple edits are applied in Tinode sequence order, and no
Chatmgt schema, API endpoint or database migration is introduced.

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
ignored; the authenticated JWT and membership rows remain authoritative. The
Chatmgt users endpoint queries `ManagementAccount.tenant_id` for that JWT
tenant, and ChatUI applies a second fail-closed filter: a directory record is
accepted only when it carries an explicit tenant ID equal to the active session
tenant. Records with a missing tenant ID are dropped from the directory,
search results, cached state and presence input instead of being assigned the
build-time default tenant. This defense does not change conversation, message,
Tinode or presence protocols for valid same-tenant records.

The users endpoint and ChatUI directory/search requests are explicitly
`no-store` because the response varies by the authenticated tenant. ChatUI
also captures the active account identity and tenant before each directory
request and discards a response received after either scope changes. Periodic
`/auth/me` metadata refreshes keep the same identity scope, so they do not
cancel a valid directory response merely by rebuilding the in-memory session
object. Account directory records with a nested tenant/company/brand
identifier are validated against the verified tenant before they are
projected into Chatmgt.

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
server-side credential for the authenticated actor, so a stale legacy owner
credential cannot block an otherwise authorized group and no Tinode token is
returned to the browser. When the group's
`groupSettings.approveMembers` flag is enabled, only a request made by an
ordinary member is persisted as
`conversation_participant.approval_status = PENDING`; a group owner/admin or
tenant administrator addition remains immediate. A pending row stays inactive
and is omitted from `participantIds`/Tinode subscribers until a group owner or
deputy approves it. Only those two group roles receive `pendingMembers` in
conversation snapshots and the web UI exposes the approve/reject controls;
tenant administrators can still add members immediately but cannot inspect or
approve a pending request unless they also hold a group manager role. Approval
adds the member to Tinode and publishes a `member_approved` system event after
the membership commit; rejection soft-deletes the pending row. An immediate
add publishes the single authoritative `member_added` event from Chatmgt after
commit, so the new member and every open web session receive the same activity
without relying on the actor's browser. Group memberships use the existing `OWNER`/`ADMIN`/
`MEMBER` role column: the owner and deputy share group-management, member,
message, poll, approval and metadata capabilities, while only the owner may
dissolve the group. `PUT /api/v1/conversation/<id>/participants/<member_id>/role`
(and the `/api/v1/chat/threads/...` alias) accepts only `ADMIN` or `MEMBER`,
rejects changes to the owner, syncs the Tinode access contract, commits the
role, and publishes a `group_role_changed` event so every open client refreshes
its authoritative Chatmgt member snapshot. The role event is also projected
immediately from realtime history so a stale browser does not retain old
controls. Opening or saving group management settings and removing another
member therefore use the owner/deputy manager gate; dissolve remains owner-only.

Chatmgt verifies group membership by both subscriber identity and effective
Tinode access. Active members require `JRWPAS`, deputies require `JRWPASD`,
and the owner requires `JRWPASO`; reconciliation reads `acs.mode`,
`acs.given` and `acs.want`, adds only missing permissions using complete Tinode
mode strings (Tinode rejects `+D`-style delta strings in `sub.mode`), and uses
the affected member's short-lived server-side token when their requested mode
must also be repaired. A subscriber
which exists with only `PAS` is therefore not accepted as healthy. The
membership transaction is committed only after effective `J/R/W` access is
visible, which restores realtime delivery and allows a newly added member to
read existing group history when `newMemberHistory` is enabled. The operational
repair command `scripts/repair_group_member_access.py` uses the same checks for
existing bound groups that contain Account-authenticated users; groups made only
of legacy local identities are counted separately because those users cannot
obtain a chat session in Account SSO mode. Immediate add/approval scopes the
access gate to the affected users and never removes unrelated subscribers, so
stale legacy access cannot roll back a healthy new membership. Repair apply mode
likewise never removes extra subscribers or permissions and does not mutate
Chatmgt rows, messages, topics, avatars, read
cursors, or user settings. Normal add/approve rollback first compares the
pre-mutation subscriber set, so an existing subscription which Tinode reports
as updated is never mistaken for a newly created subscription and deleted.
For active group snapshots, Chatmgt also requires the corresponding
`ManagementAccount` projection to remain active before exposing a participant
in `participantIds`, `members`, replacement-owner choices or survivor counts.
An old active participant row for a disabled/deleted employee is retained only
as cleanup history; it cannot force the remaining employee to transfer group
ownership to an account which can no longer sign in.
When no other valid active member survives a leave, Chatmgt closes the group and
soft-deletes every participant row before attempting Tinode topic cleanup. The
authenticated tenant membership still gates the request, but a missing, stale,
or permission-limited Tinode token cannot roll back the authoritative Chatmgt
closure. Tinode cleanup is audited as best-effort. Leaves and removals which
still have surviving members remain strict: their Chatmgt mutation succeeds only
when the Tinode membership and any owner transfer stay consistent.
Renaming/changing the group avatar is also owner-only
unless the owner explicitly enables `allowMembersEditInfo`. Chatmgt
persists the group subject, avatar reference, and whitelisted boolean
`groupSettings` in the existing `Conversation.subject`/`properties` columns.
The same flag governs member changes to the shared group background. Tinode
`onMetaDesc` packets are reduced to a per-topic group-settings snapshot and
broadcast to open ChatUI sessions, so controls disappear immediately when an
owner revokes the flag and return when it is enabled again. After a successful
group name, avatar, permission, or shared-background mutation with realtime
available, managed groups use Chatmgt's common activity publisher after the
authoritative commit; unmanaged/demo groups retain their client-side path.
The activity is stored in Tinode history, not synthesized only for the actor.
Chatmgt remains authoritative for persisted
group name/avatar/settings, while Tinode remains authoritative for message
content and realtime delivery.

The server-side group activity websocket performs handshake, token login,
identity verification, and attachment to the existing group before publishing.
Attachment does not modify membership or permissions; a denied attachment or
wrong identity prevents publication. A successful publication must return a
positive sequence. This shared path serves member addition/removal/leave,
deputy appointment/revocation, approval/rejection, metadata/settings/background,
chatbot enablement and dissolution events. Group creation, message pin/unpin and
poll activities retain their existing publishers. Personal mute, conversation
pin, read and typing state do not create public group notices. The controller
still logs publication failures after an authoritative commit; there is no
durable retry outbox, so delivery during a Tinode/credential outage is not
guaranteed by this change.
`PUT /api/v1/conversation/<id>/group-settings` (and the
`/api/v1/chat/threads/<id>/group-settings` alias) rejects management-scope
sessions, non-members, non-groups, unauthorized members, unknown settings, and
non-boolean values. Tinode public metadata is updated in realtime mode before
the Chatmgt write, with a best-effort Tinode rollback if the authoritative
Chatmgt update fails; the API returns `GROUP_INFO_PERMISSION_REQUIRED` with
HTTP 403 for a member without the flag, and ChatUI maps that response to the
friendly message above. The group-management whitelist contains
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
group leave/deactivation path to a direct pair. ChatUI writes this authoritative
Chatmgt marker before attempting any Tinode cleanup and does not prepare or
re-bind a topic solely for deletion. Tinode then removes the viewer's message
copy best-effort with a non-hard delete and records a private `vichatDeletedAt`
boundary; a stale browser/Tinode session cannot restore or block the successful
Chatmgt deletion. Nicknames remain in the viewer's account properties and shared
conversation backgrounds remain in Tinode auxiliary metadata. When a direct
topic receives a message after that boundary, ChatUI reuses the same Chatmgt
pair, clears both viewer-scoped markers, and merges only post-delete messages;
the group membership and group deletion flows are unchanged. Legacy direct rows
left inactive by the previous behavior are reactivated when the pair is
prepared or bound.

Direct-message blocking is also viewer-scoped Chatmgt metadata, but unlike
deletion it closes both send directions for the pair while either participant
has a non-null `conversation_participant.blocked_at`. Alembic revision
`20260825_13` adds that column and supporting indexes. The web detail panel
places `Chặn` below notification mute; the blocker sees a locked composer with
`Bỏ chặn`, while the blocked peer may still attempt a send and receives
`Người dùng đã chặn tin nhắn.` for every rejected attempt. ChatUI polls the
cache-free direct block snapshot every three seconds so unblock changes reach
the other open web session without a reload. Group conversations and chatbot
topics do not expose or consume this state. This release does not add or change
the mobile blocking UI.

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
the same UID stable across Account profile changes within the active Tinode
store; group subscriptions and new message history remain on that UID. The
signed Chatmgt JWT carries only the short-lived Tinode token for reconnects; no
reversible employee password is persisted.

The standalone Tinode Web client connects to `wss://chat.upgo.vn/v0/channels`.
The single Tinode Web UI remains `https://chatapi.gonplatform.com/#`; its
Settings > Server value must be `chat.upgo.vn` so the login reaches the Account
bridge.
ChatUI does not import a browser token from Tinode Web. It requests its own
short-lived token for the same deterministic Tinode UID in the fresh central
store, which keeps new topics and message history shared while keeping browser
sessions isolated.
The Nginx relay sends that path to `tinode-account-bridge`: token login packets
from ChatUI pass through unchanged, while Tinode Web `scheme=basic` packets are
decoded only at the trusted bridge. The bridge first calls
`POST /api/v1/auth/account-login`, then exchanges the returned Chatmgt bearer
session through the internal, key-protected
`POST /api/v1/auth/tinode-token-bridge` endpoint. The trusted bridge forwards
the Chatmgt bearer from that same server-side credential login; Chatmgt checks
the signed JWT, active account projection, tenant and auth version before
issuing a Tinode token. The bridge does not require or forward an Account
browser cookie, so Tinode Web is not blocked by cookie propagation while the
normal ChatUI session can still retain its Account cookie for later SSO checks.
The UpGO password is not sent to the central Tinode server or logged by the
bridge. This keeps Tinode Web and ChatUI on the same central UID/topic/message
store without permitting a stale company session to mint a new token.

The central endpoint switch intentionally starts a fresh Tinode data store; it
is not a history migration. The operator backs up the old Tinode PostgreSQL,
upload objects and Chatmgt database for rollback only, but does not restore
those Tinode records into the new endpoint. Chatmgt keeps the Account, tenant,
conversation and membership IDs, while `switch_tinode_central.py` clears the
old Tinode UID/topic mappings and automatic chat-derived copies. Keeping
`TINODE_SSO_SECRET` unchanged preserves the deterministic UpGo credential
linkage, and the next login/open provisions the accounts and topics in the new
store. Old Tinode messages and legacy media are intentionally not visible in
the fresh store.

For authenticated non-internal clients, the relay additionally inspects each
outgoing Tinode `pub` whose topic starts with `usr`. Before forwarding it, the
relay sends the authenticated sender UID and peer topic to the internal,
key-protected `POST /api/v1/internal/direct-message-policy` endpoint. Chatmgt
requires the sender UID to map to exactly one active Chatmgt account. A mapped
peer UID must also be unique, active and in the same tenant; ambiguous,
deactivated or cross-tenant mappings fail closed before Tinode. An unmapped peer
remains compatible with explicitly unmanaged Tinode identities such as the
configured bot. For a valid pair, Chatmgt resolves the deterministic
`direct_key` and rejects the publish when either participant has `blocked_at`;
the relay returns Tinode control code `403` with `DIRECT_MESSAGE_BLOCKED` and
never forwards that packet, so it cannot enter central Tinode history. Policy
errors fail closed for managed direct sends. The transport check remains
authoritative even though the current user-facing block controls are web-only,
preventing another normal client from bypassing a block.

Explicit web clients also receive a bounded group-publish anti-spam policy at
the relay. The state is in-memory and keyed by authenticated Tinode UID plus
`grp*` topic: four logical actions are allowed in a rolling five-second window,
the next action is rejected before central Tinode with control code `429` and
`GROUP_SPAM_COOLDOWN`, and the cooldown starts at five seconds. Each later burst
after a cooldown doubles the penalty (`10`, `20`, `40` seconds and so on) up to
five minutes; sixty seconds of normal activity after the cooldown resets the
next penalty to five seconds. ChatUI runs the same guard before optimistic
insertion or file upload and shows a live countdown, but the relay remains the
final enforcement point for stale tabs, refreshes and concurrent publishes.

Text, stickers, attachments/voice, polls, poll activity, reactions, recalls,
group message pin activity and forwards consume the same budget. ChatUI stamps
each action with the bounded `x-vichat-group-action` head so a multi-file picker
or clipboard batch counts once even though Tinode stores each attachment as a
separate message. Group-management announcements such as name/avatar/settings,
background and membership changes are exempt because they are consequences of
separately authorized mutations rather than composer spam; message pin/unpin
announcements are deliberately not exempt. The policy applies only when the
Tinode hello explicitly identifies `platform=web`; native mobile and trusted
internal bridge publishes keep their previous path. It adds no Chatmgt API,
database row, message copy or persistent rate-limit store. Tinode SDK 0.25.3
does not propagate rejected `Topic.publishMessage` promises reliably, so ChatUI
uses the client-level publish promise for all message drafts and can remove a
rejected optimistic item while preserving the user's text draft.

The central Tinode hello must advertise its own WebRTC/ICE configuration before
calls are enabled. The bridge reads the protected production
`runtime/ice-servers.json` and may fill `ctrl.params.iceServers` when the
upstream hello omits deployment-local TURN for browser connectivity, but it
also sets `webrtcEnabled=false` because that fallback cannot enable call
handling inside the authoritative Tinode server. Once central Tinode is
configured with the same ICE/TURN records, the bridge marks the response as
`webrtcEnabled=true`. It never replaces authoritative ICE. Outside the bounded
direct and web-group `pub` policy checks described above, it does not rewrite
message, presence or call packets.

`POST /api/v1/conversation/<id>/tinode-prepare` prepares missing UID mappings
from current Chatmgt membership and returns the authoritative conversation
snapshot. Before a remote ChatUI binds or reuses a topic, it must use that
snapshot: a blank group `tinode_topic` means the group is not bound and the
browser must create a new topic, even if an older browser room or local cache
still contains a topic. Group topic binding and add/remove/leave
operations verify the exact tenant member set before committing Chatmgt
metadata. A newly created browser topic may initially belong to the viewer. When that
viewer is not the Chatmgt group owner, the bind endpoint first grants the
authoritative owner full Tinode owner access and has that owner accept it,
then reconciles the complete member/access set. If a later bind step fails, the
server attempts to restore the viewer as owner before returning the error.
ChatUI sends every self-leave and group-delete action through
`DELETE /api/v1/conversation/<id>/self`; the authenticated session supplies the
participant identity, so a browser-side Account/Tinode ID mismatch cannot turn
a valid self-removal into a participant 404. A group owner who leaves while
another active, approved participant with an active same-tenant Account
projection survives must send an explicit `replacement_id` for one of those
members. Chatmgt never chooses a successor randomly and rejects the leave when
the selection is missing or invalid. When no other eligible employee remains,
the final active employee may leave regardless of stale role metadata. Chatmgt
then closes and soft-deletes the empty conversation, deactivates/deletes every
participant row (including stale inactive-Account and pending rows), unions the
expected and actual Tinode subscriber sets, and removes every subscription with
the authenticated cleanup identity last when the topic is bound. It does not
publish a leave activity event because no group member remains to receive it.
Add-member requests are authorized by the current Chatmgt
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

For outgoing message receipts, ChatUI keeps the existing Tinode `recv`/`read`
status flow and additionally projects each topic subscriber's per-user
`recv`/`read` cursor into the message view. The projection is read-only and
in-memory: Tinode remains authoritative for delivery/read receipts, while
ChatUI resolves the subscriber UID through the existing profile cache for the
bounded avatar stack and the message-information panel. No receipt data is
copied to Chatmgt or stored in the message transport.

The web viewer's own read cursor is monotonic for the active Tinode session.
Tinode invokes a topic `onData` callback before refreshing its cached `unread`
field, so ChatUI derives unread state from the newest known topic sequence and
the effective viewer read cursor whenever both are available; the cached unread
count is only a fallback when no sequence exists. If a realtime packet has an
incoming message at a sequence above the effective read cursor, ChatUI also
keeps the unread boundary even when the packet still carries a zero unread count
or that message was already present in an earlier callback. Missing sender
metadata is treated as ambiguous rather than outgoing; only a sender ID that
matches the viewer can advance the local read projection. The same callback
ordering also delays Tinode's local `read` update for an outgoing echo, so ChatUI
treats the viewer's newest outgoing sequence as read immediately while keeping an
incoming sender's sequence unread. Opening a conversation with
an unread boundary preserves that boundary and does not send `read` until the
last known unread message is visible in the active message viewport; this also
covers the normal bottom-of-chat view without requiring the `Tin chua doc`
jump control. Selecting an ordinary conversation no longer dismisses its badge
or sends a read receipt before content is visible. The chatbot selection path
retains its separate receipt behavior. The read acknowledgement captures its sequence before any
asynchronous subscription work; a newer peer message arriving while that
acknowledgement is pending is kept as a new unread tail and cannot be included
in the completed read range. Bounded history also keeps
the durable first-unread sequence even when that message must be fetched before
the divider can be shown. Older topic or Chatmgt snapshots cannot lower the
cursor, recreate an acknowledged unread badge or trigger a desktop/sound
notification for a sequence at or below it. A read acknowledgement changes only
receipt metadata: it never recalls, deletes or rewrites message/file content,
and Tinode remains the durable receipt source. The local read floor advances
only after attachment succeeds and the connected SDK sends the read note;
it is not a separate durable receipt store. Remote self-read presence/info
events trim or clear existing boundaries, including partially completed tails.
Peer receipts cannot clear the viewer's unread protection.

The unread and latest-message controls are siblings of the scrolling message
list inside a bounded viewport. Content/viewport resize observation keeps the
latest control usable after images load. Clicking latest refreshes a bounded
tail, waits for rendering, and reads only through visible delivered content;
session/navigation guards prevent an old history request from scrolling a new
room or overriding a later navigation. Passive completion requires the exact
unread tail to remain visible for 900 ms in the active document; pixel overlap
relative to the viewport supports tall messages without acknowledging an older
fallback message.

Tinode history requests separate data from deletion metadata and wait for the
SDK's deferred routing after the data completion response. Open history is
bounded at 1000 messages once per session, subsequent latest/catch-up requests
at 100, and the unread jump fetches a 100-sequence window from its durable
cursor, selecting an available message when the first sequence was deleted.
Concurrent tail requests coalesce and can upgrade the initial history limit;
metadata advancing during a request triggers a bounded follow-up. Live packets
already in the cache do not trigger redundant catch-up requests. Message and
unread snapshots emit without waiting for profile resolution, using a bounded
coalescing interval rather than a reset-on-every-packet debounce. Later profile
enrichment is session/revision guarded so it cannot replace newer content or
read state. Missing message bodies do not suppress server unread metadata.

Sticker messages stay within the same Tinode file path as ordinary image
attachments. ChatUI can upload either a selected static
`/stickers/puppysoft/*.png` asset or a viewer-owned custom sticker Blob through
the authenticated Tinode relay, then adds the same bounded
`x-vichat-sticker` header (`stickerId`, `packId`, label and version) so the
receiver and history projection render both sources identically. On web, the
`Sticker cua toi` library is stored in origin-scoped IndexedDB by account and
accepts multiple PNG/JPG/WEBP/GIF/AVIF files, each at most 2 MB, with a maximum
of 48 records and 32 MB total. Object URLs exist only while the picker or an
optimistic message needs a preview; the Tinode upload consumes the stored Blob
directly so closing the picker cannot break an in-flight send. Deleting a
custom sticker removes only that local library item and its recent shortcut;
already-sent Tinode messages remain intact. The custom library is not synced
between browsers/devices, the native mobile picker is unchanged, Chatmgt does
not store sticker content or metadata, and no separate API or database
migration is required. Recent sticker IDs and the custom library read prior
viewer aliases and copy valid records forward without deleting the source;
explicit deletion clears all known local copies.

While the web runtime is active, an incoming Tinode message can trigger a
browser desktop notification and a configurable built-in sound when the viewer
is away from that conversation. The viewer must grant browser permission and
can enable/disable desktop notifications, mute the sound, or choose a sound
profile in ChatUI Settings. Conversation mute suppresses both alerts; these
preferences are viewer-local and contain no message or credential data. Web
preference writes merge with the existing record instead of normalizing absent
fields back to defaults. ChatUI reads the stable Chatmgt account ID first and
uses the current Tinode UID as a non-destructive alias; a record or custom sound
found under either identity is copied forward without deleting the original.
The storage prefix `vichat.notification-settings.v1` and IndexedDB database
`vichat-notification-sounds.v1` remain unchanged across releases, and a custom
sound is deleted only through the explicit remove action in Settings.

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
Avatar mutation is replace-only across automatic topic binding, group settings
and Tinode metadata synchronization: only a non-empty reference may replace the
canonical value. A missing or empty avatar from a delayed snapshot preserves
the existing `avatar`/`group_avatar` properties and Tinode `photo`; it is never
interpreted as an implicit delete request.

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
with the server-only `X-API-Key`, sends the tenant from the verified Chatmgt
session/Tinode account in both JSON `tenant_id` and `X-Tenant-Id`, plus
`message`, bounded `top_k`, and when `CHATBOT_RETRIEVAL_INCLUDE_HISTORY=true`
at most six recent role/content turns with each turn limited to 800 characters.
No employee identity, credentials, tenant secrets or local knowledge records
are added to this bounded context. The provider's documented search contract
does not promise to use optional history. For recognized dependent questions
such as `Nói rõ hơn`, Chatmgt therefore prepends the most recent substantive
user question from those six turns directly to `message`, keeping the combined
query within 4,000 characters. Assistant answers, greetings and earlier vague
follow-ups are not used as the topic. A new substantive question is sent as-is;
history disabled, missing or expired means no expansion. Greetings/help and
topic-less follow-ups receive deterministic guidance with `grounded=false`
after the verified-tenant requirement, without fetching provider documents.
If an older retrieval endpoint rejects the optional history field, Chatmgt
retries without `history` while retaining both tenant values and the expanded
query. This does not introduce server-side memory beyond existing history.
Because the current provider searches a shared collection, Chatmgt requests up
to 20 candidates and fetches `CHATBOT_FILES_URL` after each retrieval. It builds
a tenant ownership manifest from `file_id` and normalized `file_name`, discards
foreign and unknown sources, and also discards a filename owned by more than one
tenant because the source response cannot distinguish them. Provider-generated
answer text is not trusted in this mode; only verified `sources[].snippet`
objects are normalized into a grounded reply, capped by
`CHATBOT_RETRIEVAL_LIMIT`. A missing/invalid manifest or missing verified tenant
fails closed. The worker publishes the safe reply back to the same Tinode topic
and persists a cursor/idempotency key so reconnects do not duplicate replies.

Verified sources are deduplicated by file and normalized snippet before
numbering. The answer shows at most five extracts, each keeping up to three
adjacent sentences around a keyword match and bounded to 620 characters;
ellipsis marks omitted context rather than stitching disjoint sentences.
A request for a shorter answer
shows at most two extracts of one sentence/320 characters. The original bounded
source list (2,000 characters per snippet) remains available for inspection.
The UI labels these as extracts rather than a generated document summary and
allows keyboard expansion of each source card. No unverified provider answer
or assistant-history text is used to synthesize policy. This remains retrieval,
not an added LLM generation service or a guarantee of full-document coverage.

In retrieval mode, the existing `CHATBOT_TIMEOUT` is also the end-to-end budget
for provider fetch, an optional schema retry, and tenant-manifest verification.
Cancellation closes the HTTP session and reports a safe 504 error; other
provider modes keep their existing request flow. ChatUI's direct HTTP fallback
validates the 4,000-character question before sending, limits history/sources,
uses a 45-second timeout through body parsing, and aborts on account/tenant
changes or unmount. An account-session/request-identity guard prevents stale
answers or errors from entering a new session. Failed/fallback messages do not
enter subsequent client history, and automatic message retries are not added.
Only HTTP fallback messages avoid the Tinode pending flag when no bot topic
exists. Tinode topic routing, group mention gating, worker state, ordinary
messages, presence, calls, document ingest and mobile are not changed.

Web document indexing is an additive side path after successful Tinode publish.
ChatUI calls authenticated `POST /api/v1/chatbot/knowledge/chat-files` only for
PDF, DOCX, XLS/XLSX, TXT, Markdown, CSV or JSON documents up to 20 MB and only
after Tinode returns a positive message sequence. Images, audio, video,
stickers, unsupported files, oversized files and failed Tinode publishes never
enter this path. Forwarding a supported document follows the same post-publish
rule. Mobile is unchanged.

Chatmgt ignores any client tenant value and derives `tenant_id` from the
verified session. It confirms that the sender is an active approved participant
of the tenant-scoped Chatmgt conversation and that the supplied Tinode topic is
the bound group topic or the direct peer UID. It extracts text in request memory
and sends this server-to-server payload without persisting the uploaded bytes or
extracted text in Chatmgt PostgreSQL, Redis, Workspace or local knowledge:

```json
{
  "file_name": "Quy_trinh_bao_tri_2026.pdf",
  "text_content": "Toan van noi dung tai lieu...",
  "tenant_id": "verified-company-id",
  "source": "vichat_web",
  "file_id": "vichat_<sha256>",
  "metadata": {
    "category": "chat_attachment",
    "author": "Verified sender",
    "department": "Verified department",
    "conversation_id": "verified-conversation-id",
    "conversation_type": "direct-or-group",
    "tinode_sequence": 42,
    "allowed_user_ids": ["verified-participant-ids"]
  }
}
```

`file_id` is deterministic for tenant, Chatmgt conversation and Tinode
sequence, making a safe retry idempotent for providers which honor that key.
Chatmgt first calls `CHATBOT_INGEST_URL`; it falls back to
`CHATBOT_INGEST_FALLBACK_URL` only when the primary route returns `404/405`.
The provider deployment observed on 2026-09-04 returned `404` for
`/api/v1/ingest` and published `/api/v1/dataroom/callback`, so production keeps
both values configurable. HTTP failures and a 2xx response whose body reports
`status=error` are treated as indexing failures. Because the browser starts the
request fire-and-forget after Tinode delivery, those failures are logged without
changing the delivered message/file state.

The provider's published `/api/v1/chat` OpenAPI contract currently documents
only `message` and `top_k`; it does not document tenant filtering. A read-only
2026-09-04 probe sent the same nonce query with two different tenant values and
received the same source fingerprint, confirming the provider currently ignores
both tenant inputs. `CHATBOT_TENANT_FILTER_REQUIRED=true` therefore keeps the
Chatmgt manifest filter mandatory. This compatibility filter prevents a foreign
snippet from reaching a browser/Tinode reply, but provider-native filtering is
still required for complete recall and efficient tenant isolation: global top
20 results may not contain a lower-ranked relevant file from the current tenant.

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
| `POST` | `/api/v1/chat/presence/heartbeat` | Refresh the current ChatUI presence lease, attempt last-seen metadata, and return requested same-tenant states |
| `POST` | `/api/v1/chat/presence/batch` | Read requested same-tenant online and bounded last-seen states |
| `POST` | `/api/v1/chat/presence/offline` | Remove the current browser presence lease best-effort |
| `GET/PUT` | `/api/v1/chat/contact-nicknames...` | Read or update private viewer-scoped 1-1 contact nicknames |
| `POST` | `/api/v1/chat/users/<id>/revoke-session` | Revoke a tenant employee session |
| `GET/POST` | `/api/v1/friend-request` | Tenant-scoped friendship metadata |
| `GET/POST` | `/api/v1/conversation` | Tenant-scoped conversation metadata |
| `PUT` | `/api/v1/conversation/<id>/pin` | Set or clear the current user's conversation pin |
| `GET` | `/api/v1/conversation/direct-block-state` | Return cache-free viewer/peer block state for the current user's direct conversations |
| `PUT` | `/api/v1/conversation/<id>/block` | Set or clear the current user's direct-message block; group conversations are rejected |
| `PUT` | `/api/v1/conversation/<id>/group-settings` | Owner/member-authorized group name, avatar and boolean settings update |
| `POST` | `/api/v1/conversation/<id>/tinode-prepare` | Prepare Tinode participant mappings |
| `PUT` | `/api/v1/conversation/<id>/tinode-topic` | Verify/bind the topic to exact membership |
| `POST` | `/api/v1/conversation/<id>/dissolve` | Owner-only group dissolution; remove all active members and close the group |
| `POST` | `/api/v1/conversation/<id>/participants` | Add same-tenant active employees; group owner/admin or tenant-admin additions are immediate, while an ordinary member requires approval when `approveMembers` is enabled |
| `PUT` | `/api/v1/conversation/<id>/participants/<participant-id>/approval` | Group owner/deputy approve/reject of a pending member; approval reconciles Tinode through the authenticated actor |
| `DELETE` | `/api/v1/conversation/<id>/participants/<participant-id>` | Remove another member as the group owner; replacement candidates and survivors must also have an active same-tenant Account projection |
| `DELETE` | `/api/v1/conversation/<id>/self` | Remove the authenticated user's membership; `replacement_id` is required only for an owner while another eligible employee survives, otherwise the final active employee closes the group |
| `POST` | `/api/v1/internal/direct-message-policy` | Internal relay-only decision for a Tinode direct publish; never exposed to browser sessions |
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
TINODE_CENTRAL_WS_URL=wss://chatapi.gonplatform.com/v0/channels
TINODE_BRIDGE_TIMEOUT=15
TINODE_TOKEN_EXPIRE_IN=300
ACCOUNT_SSO_DIRECTORY_PATH=/api/v1/tenant_user
ACCOUNT_SSO_TENANT_SWITCH_PATH=/api/v1/tenant/set_current_tenant
ACCOUNT_SSO_DIRECTORY_SYNC_TTL=10
ACCOUNT_SSO_LOGIN_PATH=/login
```

The ChatUI Nginx proxies `/v0/` and `/tinode-media/` to
`https://chatapi.gonplatform.com` with SNI and `Host` pinned to that hostname.
Upstream certificate verification is enabled for the new endpoint.

The endpoint switch uses the target's fresh data. A verified backup of the old
Tinode/Chatmgt data is required only for rollback; no old Tinode PostgreSQL or
upload object restore is required. After a successful target probe, run the
dry-run and then the guarded `switch_tinode_central.py` apply command. It clears
only Tinode UID/topic mappings and automatic chat-derived copies; Account,
tenant, conversation and membership IDs remain available for lazy
reprovisioning. `TINODE_SSO_SECRET` must remain unchanged so UpGo identities
continue to derive the same credentials.

The Workspace migration is `20260804_10` and must be applied after
`20260803_09` before recreating Chatmgt. Rollback uses the existing release and
database backup procedure; the migration is intentionally marked irreversible
because production data must be restored from the verified PostgreSQL backup
when a rollback requires removing Workspace rows.

Direct-message blocking requires revision `20260825_13` after `20260824_12`.
Rollback of that schema change also uses the verified pre-migration PostgreSQL
backup because the revision is intentionally irreversible.

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
- An Account identity with one active membership still shows its current company;
  opening the arrow has no alternative company item until a newly active
  membership is returned by the periodic/focus refresh.
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
  tokens. A complete, strictly verified tenant snapshot deactivates omitted
  Account projections; a partial snapshot neither deactivates nor exposes
  omitted cached projections.
- An authenticated viewer rejected by an inactive record, a complete snapshot
  omission or an unusable projection receives no cached fallback; its
  per-viewer directory cache and both browser sessions are revoked.
- A stale Tinode sender mapped to an inactive projection and a direct peer UID
  mapped to another tenant are rejected by the relay before the publish reaches
  central Tinode; unmanaged bot identities remain usable.
- The Tinode Web bridge can exchange the just-created Chatmgt session only while
  the freshly issued Account session still reports the same Account user and
  current tenant; a mismatch is rejected before Tinode token issuance.
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
