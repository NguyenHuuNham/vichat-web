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
  "top_k": 6
}
```

The provider returns `sources` with snippets. Chatmgt converts those snippets
to the reply shown on web/mobile and keeps source names in the response. Other
external-webhook modes still accept `reply`, `answer`, `text`, `message`,
`data.answer`, or `choices[0].message.content` for compatibility.

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
