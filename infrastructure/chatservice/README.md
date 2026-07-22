# Chatservice private storage

Chatservice owns management data in PostgreSQL. The local container publishes it
only on loopback:

- Host: `127.0.0.1`
- Port: `5434`
- Database: `chatservice`
- User: `chatservice`
- Password: the value of `CHATSERVICE_DB_PASSWORD` in the ignored `.env` file

In pgAdmin, register the server with those values. The security migration creates
`management_tenant`, `management_account`, `security_audit_log`, `conversation`,
`conversation_participant`, `friend_request`, `chatbot_message`, and the knowledge
base/document tables. Passwords are stored as bcrypt hashes; plaintext passwords,
chat transcripts, and chatbot knowledge are not served from the web app.

Run from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\infrastructure\chatservice\start.ps1
```

The bootstrap accounts in migration `004_secure_management_auth.sql` use the local
development password `123456`; rotate these through the authenticated password API
before using the service for real company data.
