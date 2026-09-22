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

1. A tenant admin enters `chatmgt.gonplatform.com` through UpGO Account SSO.
2. Chatmgt accepts only Account roles `admin`, `owner`, or `superadmin` and issues a separate management cookie for the active tenant.
3. The admin invites or removes employees in UpGO Account; Chatmgt reads the tenant directory as a read-only source.
4. ChatUI requires the employee's UpGO Account email/password; Chatmgt calls UpGO Account `POST /login`, automatically resolves the invited active tenant/company/brand membership, and exposes `POST /api/v1/auth/account-login` as the employee login contract.
5. Chatmgt projects the Account identity, derives/provisions the employee's Tinode identity server-side, and issues a tenant-scoped HttpOnly chat session.
6. Chatmgt returns only public identity fields; ChatUI requests a short-lived Tinode token through `POST /api/v1/auth/tinode-token`.
7. If the employee has multiple active Account memberships, ChatUI calls `POST /api/v1/auth/switch-tenant` from the profile. Chatmgt validates the membership, changes Account's current tenant through `/api/v1/tenant/set_current_tenant`, confirms it, then rotates only the Chatmgt session; the Account cookie and credentials remain valid.
8. Logout revokes the Chatmgt session and clears the ChatUI cookie. Admin logout also ends the Account administrator session.

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
both web and mobile therefore see the same new topics and history. The central
Tinode store is intentionally fresh: old Tinode messages and file history are
not restored into it. The mobile directory is the active employee projection
for the authenticated tenant and does not require friendship acceptance.
Calls and push are capability-gated until native credentials are configured,
and the removed knowledge manager is not exposed. Run mobile checks from
`mobile/`; signed Android/iOS builds need JDK/SDK or EAS plus store credentials.

Mobile also exposes `Cloud của tôi` as a separate private surface. Cloud text
messages use `/api/v1/chat/cloud/messages`; files use the same short-lived S3
upload-ticket/completion flow as the web under `/api/v1/chat/cloud/uploads` and
signed download URLs under `/api/v1/chat/cloud/files/<id>/download`. The
authenticated bearer session supplies the owner and tenant; the mobile client
does not send either value as a selectable scope.

Protected Tinode images are fetched through the authenticated
`chat.gonplatform.com/tinode-media` relay into the native cache before rendering. An
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
`/login` endpoint and is discarded immediately after authentication. During the
fresh-store switch, Chatmgt keeps the Account, tenant, conversation and
membership records, clears only Tinode UID/topic mappings, and reprovisions the
deterministic identities on the target at the next login/open. The old central
Tinode message history is intentionally not copied.
`POST /api/v1/auth/tinode-token` returns the token bound to that session when a
reconnect needs it and re-verifies that volatile password when renewal is
required. ChatUI and Chatmgt both reach the
central `chatapi.gonplatform.com` Tinode through the `chat.gonplatform.com` Nginx relay for
messages, files, presence, typing, reactions, receipts, and direct calls.
Tinode Web at `https://chatapi.gonplatform.com/#` remains the single UI used to
inspect the central message store. Set its Server to `chat.gonplatform.com` so its basic login
packet is translated server-side from UpGO Account credentials to a short-lived
Tinode token. ChatUI obtains its own short-lived token for the same newly
provisioned deterministic Tinode UID; the two clients therefore share new topics
and message history without passing a browser token between them or sending an
UpGO password to central Tinode.

Chatmgt prepares participant Tinode UID mappings and validates every topic
binding against the current tenant conversation. Group add/remove/leave actions
are sent to Chatmgt, which updates the Tinode subscription and Chatmgt membership
as one controlled bridge operation. The browser does not independently invent
or persist membership state.

Normal Tinode messages and uploaded chat files are not persisted in Chatmgt
knowledge or Workspace previews. On web only, after Tinode confirms a supported
document upload, ChatUI may relay that same file to authenticated Chatmgt so its
text can be extracted in memory and sent to the external RAG index. Tinode
remains the source of the message and file; an indexing failure never changes
the successful Tinode delivery. A Workspace task created from a message keeps
only the Chatmgt conversation ID/name and Tinode message reference.

## Chat media on S3

New ChatUI and mobile chat attachments, Tinode-managed avatars, stickers sent
as messages, and shared conversation backgrounds can use the private
`s3.upgo.vn` bucket without moving message content into Chatmgt. The client asks
Chatmgt for a short-lived, tenant-scoped upload ticket, uploads the bytes
directly to a pending S3 key, and publishes only the stable authenticated
Chatmgt reference inside the Tinode message or metadata. Chatmgt validates the
signed ticket, object size, and content type, then server-side copies the object
to an immutable completed key before the reference is accepted.

Existing Tinode media is not rewritten or deleted in the old rollback store.
Because the active central store is fresh, historical `/tinode-media/...`
references are not restored into its conversations. New
`/api/v1/chat/media/...` references obtain short-lived S3 download URLs from
Chatmgt. Production disables fallback from S3 to the Tinode upload volume,
so an S3 outage fails the new upload without filling local disk. A rollback may
switch new uploads back to Tinode, but must retain the MinIO credentials so
already-published S3 references remain readable. UpGO Account remains the
owner of employee profile avatars uploaded through its profile API.

Unread counts and the latest message preview still come from Tinode while a
conversation is muted. Chatmgt stores only the current employee's mute deadline;
ChatUI suppresses the custom sound and browser desktop notification until that
deadline and automatically re-enables both. After F5, ChatUI calls
`/api/v1/auth/me` with the existing HttpOnly Chatmgt cookie to rebuild its
in-memory session; it never stores a token or password in browser storage.
Desktop notifications require explicit browser permission and can be enabled
per viewer in Settings. The viewer's notification preference, selected sound ID
and theme (`light`, `dark` or `system`) are stored in localStorage; an uploaded
custom sound Blob is kept in origin-scoped IndexedDB. Authentication data and
message content remain outside both browser stores.
The same per-viewer preference record stores the selected UI language (`vi` or
`en`), with Vietnamese as the default, so the choice survives refresh and is
isolated between accounts on the same device.
Frontend releases keep the existing browser preference keys and IndexedDB
stores. ChatUI uses the stable Account ID as the primary key and reads older
Account/Tinode UID values as non-destructive aliases, so a commit or stateless
frontend redeploy does not reset installed preferences. Explicit deletion is
the only operation that removes the known local copies; production deploys
must preserve the existing `.env`, runtime files and named data volumes.

If Tinode is unavailable, ChatUI remains in `management` mode with the Step 3
directory and conversations available; realtime inputs stay disabled instead
of falling back to demo/localStorage messages. Reconnects obtain a fresh token
from Chatmgt.

## Chatbot deployment

Production keeps `VITE_CHAT_MODE=internal`, so the assistant is a normal Tinode
P2P conversation alongside employee chats. ChatUI obtains the bot UID from
Chatmgt, while the isolated `tinode-chatbot-webhook` worker receives direct
`usr*` messages and group `grp*` messages only after an explicit `@ViChatAI`
mention. Chatmgt validates the sender's tenant/group membership, keeps a
bounded recent group history for tone and context, and calls the
`https://knowledge-ai.gonapp.net/api/v1/chat` endpoint with the server-side
`X-API-Key`. Retrieval requests include the server-verified company
`tenant_id`, the same value in `X-Tenant-Id`, the question, `top_k` and at most
the recent role/content turns; if the provider rejects the optional history,
Chatmgt retries without `history` but keeps the tenant boundary. Returned
document snippets are cross-checked against the provider `/api/v1/files`
manifest and only unambiguous files owned by that tenant are published back to
Tinode. A missing manifest, foreign file or filename shared by multiple tenants
fails closed instead of exposing an unverified snippet.
Normal employee/group/file flows never pass through the worker unless a group
member explicitly mentions the bot. Configure the bot credentials and shared webhook key in the private production `.env`; see
`infrastructure/production/.env.example` and
`infrastructure/production/README.md`.

For web direct and group chats, supported PDF, DOCX, XLS/XLSX, TXT, Markdown,
CSV and JSON documents up to 20 MB are indexed only after Tinode returns a
positive publish sequence. Chatmgt verifies the authenticated session, active
conversation membership and matching Tinode topic, derives `tenant_id` from
that session, then sends `file_name`, extracted `text_content`, `source`, a
stable `file_id` and bounded metadata to the RAG provider. The browser cannot
choose a tenant. The configured `/api/v1/ingest` route is attempted first; the
currently published provider returns `404`, so Chatmgt falls back only for
`404/405` to `/api/v1/dataroom/callback`. Other HTTP or body-level provider
errors are diagnostic-only and do not mark the Tinode file failed.

`CHATBOT_PROVIDER=external-webhook` remains the server-side provider setting and
the existing authenticated `/api/v1/chatbot/message` endpoint remains a
direct-provider fallback for clients without a Tinode bot topic. ChatUI no
longer exposes the knowledge manager or sends a knowledge-base selection.
Legacy approved RAG APIs remain isolated integration endpoints; they are not
used by the ViChat AI conversation and never include employee chat content.

ViChat AI's retrieval mode now provides usage guidance for greetings/help and
asks for a document/topic when the question is too vague. Recognized follow-ups
such as `Nói rõ hơn` or `Tóm tắt ngắn hơn` reuse the latest substantive user
question within the bounded recent history; unrelated questions stay unchanged.
Turning off `CHATBOT_RETRIEVAL_INCLUDE_HISTORY` also disables this expansion.
Replies contain numbered, keyword-selected extracts, not a generated summary
of a whole document. Requests for a shorter answer reduce the extracts while
keeping the verified source list available. Web source cards expand to show the
bounded original snippets. Starter suggestions fill an editable draft and
select the topic placeholder rather than immediately sending a vague question.

`CHATBOT_TIMEOUT` (30 seconds by default) bounds the entire retrieval operation,
including the optional schema retry and tenant-manifest check. The web HTTP
fallback has a separate 45-second request/body timeout, cancels on account or
company changes, and ignores stale replies. It never automatically resends a
question. No new model, endpoint, migration or credential is required; deploy
Chatmgt and ChatUI together. The Tinode worker, ordinary messages, calls, media,
presence and mobile flows are unchanged.

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
