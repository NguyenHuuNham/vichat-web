#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
COMPOSE_FILE="$SCRIPT_DIR/compose.yaml"

cd "$REPO_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is not installed." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
fi

set_env() {
  local key="$1"
  local value="$2"
  local escaped="${value//&/\\&}"
  sed -i "s|^${key}=.*|${key}=${escaped}|" "$ENV_FILE"
}

ensure_secret() {
  local key="$1"
  local generator="$2"
  local current
  current="$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1)"
  if [[ -z "$current" || "$current" == replace-with-* ]]; then
    set_env "$key" "$(eval "$generator")"
  fi
}

ensure_secret TINODE_DB_PASSWORD "openssl rand -hex 32"
ensure_secret TINODE_AUTH_TOKEN_KEY "openssl rand -base64 32 | tr -d '\n'"
ensure_secret TINODE_UID_ENCRYPTION_KEY "openssl rand -base64 16 | tr -d '\n'"
ensure_secret CHATSERVICE_DB_PASSWORD "openssl rand -hex 32"
ensure_secret CHAT_AUTH_JWT_SECRET "openssl rand -base64 48 | tr -d '\n'"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

db_user="$(sed -n 's/^CHATSERVICE_DB_USER=//p' "$ENV_FILE" | tail -n 1)"
db_name="$(sed -n 's/^CHATSERVICE_DB_NAME=//p' "$ENV_FILE" | tail -n 1)"
db_user="${db_user:-chatservice}"
db_name="${db_name:-chatservice}"

for migration in "$REPO_DIR"/chatservice-main/migrations/*.sql; do
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T chat-postgres \
    psql -v ON_ERROR_STOP=1 -U "$db_user" -d "$db_name" \
    -f "/docker-entrypoint-initdb.d/$(basename "$migration")"
done

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" restart chatmgt
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo "Deployment is available at http://$(sed -n 's/^PUBLIC_HOST=//p' "$ENV_FILE" | tail -n 1)"
