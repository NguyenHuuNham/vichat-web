# Chat backend architecture

## Service boundaries

- `chat` (this React app): renders UI and keeps the Tinode access token in memory.
- `chatmgt` (currently stored in the legacy `chatservice-main` folder): owns login sessions, tenants, accounts, profiles,
  password reset tokens, friend requests, and conversation metadata.
- `chatapi` (Tinode): owns realtime presence, topics, messages, receipts, and files.

Runtime names are `chat` for the Nginx-hosted React UI, `chatmgt` for the
management API, and `chatapi` for the unmodified Tinode service. Chatmgt does not
expose chatbot, realtime-message, receipt, or file APIs.

| Operation | Owner |
| --- | --- |
| Render screens and hold the short-lived Tinode token | `chat` |
| Login, logout, forgot/reset password, profile, directory, friends | `chatmgt` |
| Thread metadata and Tinode topic binding | `chatmgt` |
| Topics, messages, files, typing, presence, reactions, receipts | `chatapi` |

Chatmgt may call chatapi server-to-server only for account provisioning, login
token issuance, and credential synchronization. It never stores Tinode messages.

The browser authenticates only through `chatmgt`. A successful login returns an
HttpOnly management cookie and a short-lived Tinode token. The browser then uses
that Tinode token for realtime chat; it never receives the Tinode root password.

## Main API contract

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/login` | Login and return the current account plus Tinode token |
| `GET` | `/api/v1/auth/me` | Read the authenticated profile |
| `POST` | `/api/v1/auth/logout` | Revoke the current session |
| `GET` | `/api/v1/auth/health` | Report password-reset configuration readiness |
| `POST` | `/api/v1/auth/forgot-password` | Create a one-time reset token and send email |
| `POST` | `/api/v1/auth/reset-password` | Reset management and Tinode passwords together |
| `POST` | `/api/v1/auth/password` | Change password while authenticated |
| `PUT` | `/api/v1/auth/profile` | Update the current user's profile |
| `GET/POST` | `/api/v1/chat/threads` | List or create tenant-scoped chat threads |
| `PUT` | `/api/v1/chat/threads/{id}/tinode-topic` | Bind metadata to a Tinode topic |

The older `/api/v1/conversation` routes remain available for compatibility.

## Password reset security

- Only the SHA-256 hash of a reset token is stored.
- A new request invalidates older unused tokens for the same account.
- Tokens are single-use, expire by default after 30 minutes, and requests are
  rate-limited through Redis.
- Responses do not reveal whether an account exists.
- Password changes increment `auth_version`, invalidating all older JWT sessions.
- Tinode is updated first; the management database commits only after Tinode
  confirms the password update.

## Required production configuration

Set these values in `infrastructure/chatservice/.env`:

```dotenv
CHAT_AUTH_JWT_SECRET=<at-least-32-random-characters>
CHAT_PASSWORD_RESET_URL=https://chat.example.com/?reset_token={token}
CHAT_PASSWORD_RESET_DEBUG=false
CHAT_SMTP_HOST=smtp.example.com
CHAT_SMTP_PORT=587
CHAT_SMTP_USERNAME=<smtp-user>
CHAT_SMTP_PASSWORD=<smtp-password>
CHAT_SMTP_FROM=no-reply@example.com
TINODE_ADMIN_USERNAME=<dedicated-tinode-root-account>
TINODE_ADMIN_PASSWORD=<tinode-root-password>
```

Use a dedicated Tinode root account for server-to-server operations. Do not put
these credentials in Vite variables or expose them to the browser.

## Local startup

Start Tinode first, then chat management, then Vite:

```powershell
powershell -ExecutionPolicy Bypass -File .\infrastructure\tinode\start.ps1
powershell -ExecutionPolicy Bypass -File .\infrastructure\chatservice\start.ps1
npm run dev
```

Migration `006_password_reset_tokens.sql` is rerunnable and is applied by the
chatservice startup script.
