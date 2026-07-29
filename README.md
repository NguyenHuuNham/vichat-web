# VICHAT

VICHAT combines four production boundaries:

- Chatmgt owns employee login/logout, tenant-scoped accounts, roles, friendships, conversation metadata, and participant membership.
- Administrators create and manage employee accounts in Chatmgt; ChatUI does not provide public registration.
- Tinode/ChatAPI owns realtime topics, messages, files, presence, typing, and read state.
- ChatUI authenticates with Chatmgt, reads directory and conversation data from Chatmgt, then uses the returned Tinode token for realtime traffic.

Chatmgt verifies the employee password against its stored password hash and
uses the matching internal Tinode credential over the private Docker network.
Passwords and Tinode administrator credentials are never returned to ChatUI.
Chatmgt does not store realtime message bodies or uploaded chat files.

## Production data flow

1. ChatUI calls `POST /api/v1/auth/login` with the employee username/email and password over HTTPS.
2. Chatmgt validates the active tenant account, password hash, login rate limit, and Tinode credential.
3. ChatUI loads `/api/v1/chat/users`, `/api/v1/conversation`, and friend requests from Chatmgt.
4. ChatUI connects to Tinode over WSS with the token returned by Chatmgt.
5. Chatmgt validates tenant membership and Tinode topic access before persisting a topic binding.
6. Logout revokes the Chat JWT, clears the Chat cookie, and disconnects Tinode in the browser.

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

Do not place employee passwords, Tinode root credentials, database passwords, or
session cookies in frontend variables or committed files.
