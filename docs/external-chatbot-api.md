# External chatbot integration

ViChat supports both directions of an external chatbot integration:

1. ChatUI sends employee questions through Chatmgt to a partner-owned chatbot.
2. A partner chatbot requests approved RAG context from Chatmgt.

## ChatUI to partner webhook

Configure Chatmgt:

```dotenv
CHATBOT_ENABLED=true
CHATBOT_PROVIDER=external-webhook
CHATBOT_API_URL=https://knowledge-ai.gonapp.net/api/v1/chat
CHATBOT_API_KEY=<knowledge-ai-api-key>
CHATBOT_EXTERNAL_AUTH_HEADER=X-API-Key
CHATBOT_EXTERNAL_AUTH_SCHEME=
CHATBOT_EXTERNAL_REQUEST_MODE=knowledge-retrieval
CHATBOT_RETRIEVAL_INCLUDE_HISTORY=true
CHATBOT_TENANT_FILTER_REQUIRED=true
CHATBOT_FILES_URL=https://knowledge-ai.gonapp.net/api/v1/files
CHATBOT_INGEST_ENABLED=true
CHATBOT_INGEST_URL=https://knowledge-ai.gonapp.net/api/v1/ingest
CHATBOT_INGEST_FALLBACK_URL=https://knowledge-ai.gonapp.net/api/v1/dataroom/callback
CHATBOT_INGEST_TIMEOUT=45
CHATBOT_KNOWLEDGE_ONLY=false
```

Chatmgt calls this HTTPS endpoint server-side. The browser continues to call
Chatmgt and never receives the partner URL or API credential. The current
Knowledge AI endpoint requires `X-API-Key`; without it Chatmgt reports the
provider as not ready.

For `knowledge-retrieval`, Chatmgt sends a minimal server-to-server payload:

```json
{
  "message": "How do I request leave?",
  "top_k": 6,
  "tenant_id": "verified-company-id",
  "history": [
    {"role": "user", "content": "Can I take leave next week?"},
    {"role": "assistant", "content": "I will check the approved policy."}
  ]
}
```

`tenant_id` comes from the authenticated Chatmgt session/Tinode sender and is
also sent as `X-Tenant-Id`; a browser value cannot override it. `history` is
optional and contains at most six recent role/content turns, with
each turn limited to 800 characters. It is used only to help the provider match
the conversation's language and tone; employee identity and credentials are
not included. Set `CHATBOT_RETRIEVAL_INCLUDE_HISTORY=false` to keep the legacy
minimal payload. If a retrieval endpoint rejects the optional field, Chatmgt
retries once without `history` while retaining `tenant_id`. The provider may return an
`answer`/`reply` plus `sources`; when no answer is returned, Chatmgt converts
the source snippets to the bounded reply shown on web/mobile. Other
external-webhook modes still accept `reply`, `answer`, `text`, `message`,
`data.answer`, or `choices[0].message.content` for compatibility.

The current provider OpenAPI for `/api/v1/chat` documents only `message` and
`top_k`, not tenant filtering. A read-only 2026-09-04 probe received the same
source fingerprint for two different tenant values, so Chatmgt does not trust
the provider response directly. With `CHATBOT_TENANT_FILTER_REQUIRED=true`, it
requests up to 20 candidates, reads `CHATBOT_FILES_URL`, and returns only sources
whose `file_id` or normalized filename is uniquely owned by the authenticated
tenant. Foreign, unknown and cross-tenant duplicate filenames are removed;
manifest failure rejects the AI request. Provider answer text is ignored in
this compatibility mode because it may have been generated from unverified
sources. This is fail-closed but can reduce recall until the provider implements
native tenant filtering.

## Web chat document ingestion

After Tinode confirms a web direct/group file message, ChatUI may POST the
supported document to authenticated Chatmgt. The endpoint is never called for a
failed Tinode publish, image/audio/video/sticker, unsupported extension or file
over 20 MB. Mobile is not changed by this contract.

```http
POST /api/v1/chatbot/knowledge/chat-files
Cookie: vichat_access_token=<HttpOnly session>
Content-Type: multipart/form-data

file=<document bytes>
conversation_id=<Chatmgt conversation UUID>
tinode_topic=<confirmed direct/group topic>
sequence=<positive Tinode sequence>
caption=<optional text>
```

The client does not send `tenant_id`. Chatmgt verifies the session, tenant,
active approved membership and Tinode topic, extracts text in memory, derives a
stable file ID from tenant/conversation/sequence and sends the following
server-to-server shape:

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
    "sender_id": "verified-account-id",
    "conversation_id": "verified-conversation-id",
    "conversation_type": "direct-or-group",
    "tinode_sequence": 42,
    "mime_type": "application/pdf",
    "allowed_user_ids": ["verified-participant-ids"]
  }
}
```

Chatmgt does not persist the bytes or extracted text. Tinode remains the source
of truth and RAG indexing is best-effort, so a provider failure cannot turn an
already delivered file into a failed chat message. `CHATBOT_INGEST_URL` is
attempted first and fallback is allowed only for `404/405`; the provider
deployment observed on 2026-09-04 returned `404` for `/api/v1/ingest` and
published `/api/v1/dataroom/callback`. Other HTTP errors and a 2xx response with
`status=error` fail indexing without trying a second route.

Compatibility external-webhook mode forwards greetings and questions even when
local retrieval finds no approved context. In Knowledge AI retrieval mode, the
provider itself returns an empty `sources` list and Chatmgt renders a bounded
no-match reply instead.

Set `VITE_CHAT_MODE=external` for the production frontend. ChatUI then keeps
Account SSO, profile/session validation, settings, knowledge administration,
and the separate management surface, but it does not initialize employee
directory, friend, conversation, or Tinode realtime flows.

## Partner chatbot to ViChat data

Use a separate inbound key and fix the data boundary on the server:

```dotenv
CHATBOT_EXTERNAL_API_KEY=<separate-inbound-key>
CHATBOT_EXTERNAL_TENANT=song-hong
CHATBOT_EXTERNAL_KNOWLEDGE_BASE_ID=<optional-approved-base-uuid>
```

Retrieve RAG context:

```http
POST /api/v1/chatbot/external/context
Authorization: Bearer <CHATBOT_EXTERNAL_API_KEY>
Content-Type: application/json

{
  "query": "leave policy",
  "limit": 6
}
```

The response contains `context`, `grounded`, and `sources`. Source objects from
this endpoint include the matched content so the partner chatbot can construct
its own prompt.

Request a complete answer through the provider configured in Chatmgt:

```http
POST /api/v1/chatbot/external/message
X-Chatbot-Api-Key: <CHATBOT_EXTERNAL_API_KEY>
Content-Type: application/json

{
  "message": "leave policy",
  "conversation_id": "partner-session-123",
  "external_user_id": "partner-user-456",
  "history": []
}
```

Security rules:

- The caller cannot select a different tenant.
- A pinned knowledge base cannot be overridden by the request.
- `CHAT_*` documents derived from employee conversations are excluded.
- `external_user_id` is stored only as an HMAC-SHA-256-derived reference.
- The inbound API key and outbound provider key must be different secrets.

## Rollback

Set `VITE_CHAT_MODE=internal` and rebuild the frontend to restore the existing
Chatmgt directory and Tinode initialization. No database migration is required.
