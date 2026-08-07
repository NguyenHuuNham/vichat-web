# Chatmgt local storage

Partner-owned chatbot webhook and inbound RAG API configuration is documented
in `docs/external-chatbot-api.md`.

The local stack publishes PostgreSQL, Redis, and Chatmgt on loopback only.
Run from the repository root in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\infrastructure\chatservice\start.ps1
```

On the first run, edit the generated ignored
`infrastructure/chatservice/.env` and replace `CHATSERVICE_DB_PASSWORD`. The
script generates the application, session, password-salt, and JWT secrets
without printing them.

Schema changes are applied only through:

```powershell
docker compose --env-file .\infrastructure\chatservice\.env -f .\infrastructure\chatservice\compose.yaml run --rm --no-deps chatmgt alembic -c alembic.ini upgrade head
```

No Chatmgt user is seeded with a default password. To create the first local
administrator, first configure a strong Tinode root account and matching
`TINODE_ADMIN_USERNAME` / `TINODE_ADMIN_PASSWORD`, then run:

```powershell
docker compose --env-file .\infrastructure\chatservice\.env -f .\infrastructure\chatservice\compose.yaml run --rm --no-deps chatmgt python scripts/bootstrap_admin.py --wait-seconds 60
```

The command is idempotent: it creates one administrator only when the
`management_account` table is empty and Tinode login succeeds.

For password-reset testing, configure `CHAT_SMTP_*`. The explicit local-only
fallback `CHAT_PASSWORD_RESET_DEBUG=true` must remain disabled in production.
