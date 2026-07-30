#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
COMPOSE_FILE="$SCRIPT_DIR/compose.yaml"
RUNTIME_DIR="$SCRIPT_DIR/runtime"
BACKUP_DIR="$SCRIPT_DIR/backups"

cd "$REPO_DIR"
umask 077

for command_name in docker openssl curl mktemp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is not installed." >&2
    exit 1
  fi
done

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is not installed." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

env_value() {
  local key="$1"
  local value
  value="$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1)"
  printf '%s' "${value%$'\r'}"
}

set_env() {
  local key="$1"
  local value="$2"
  local escaped="$value"
  escaped="${escaped//\\/\\\\}"
  escaped="${escaped//&/\\&}"
  escaped="${escaped//|/\\|}"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

is_placeholder() {
  local value="$1"
  [[ -z "$value" || "$value" == replace-with-* ]]
}

ensure_secret() {
  local key="$1"
  local encoding="$2"
  local byte_count="$3"
  local current
  current="$(env_value "$key")"
  if is_placeholder "$current"; then
    if [[ "$encoding" == "hex" ]]; then
      set_env "$key" "$(openssl rand -hex "$byte_count")"
    else
      set_env "$key" "$(openssl rand -base64 "$byte_count" | tr -d '\n')"
    fi
  fi
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

wait_postgres() {
  local service="$1"
  local user="$2"
  local database="$3"
  local attempt
  for attempt in $(seq 1 60); do
    if compose exec -T "$service" pg_isready -U "$user" -d "$database" >/dev/null 2>&1; then
      return
    fi
    sleep 2
  done
  echo "$service did not become ready after 120 seconds." >&2
  compose logs --tail 100 "$service" >&2
  exit 1
}

wait_chatmgt() {
  local attempt
  for attempt in $(seq 1 60); do
    if compose exec -T chatmgt python -c \
      "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8093/api/v1/auth/health', timeout=2)" \
      >/dev/null 2>&1; then
      return
    fi
    sleep 2
  done
  echo "chatmgt did not become healthy after 120 seconds." >&2
  compose logs --tail 100 chatmgt >&2
  exit 1
}

wait_frontend() {
  local port="$1"
  local attempt
  for attempt in $(seq 1 60); do
    if curl --fail --silent --show-error --max-time 3 \
      "http://127.0.0.1:${port}/healthz" >/dev/null 2>&1; then
      return
    fi
    sleep 2
  done
  echo "The frontend did not become healthy on local port ${port}." >&2
  compose logs --tail 100 chat >&2
  exit 1
}

ensure_secret TINODE_DB_PASSWORD hex 32
ensure_secret TINODE_AUTH_TOKEN_KEY base64 32
ensure_secret TINODE_UID_ENCRYPTION_KEY base64 16
ensure_secret TINODE_SSO_SECRET base64 48
ensure_secret CHATSERVICE_DB_PASSWORD hex 32
ensure_secret APP_SECRET_KEY base64 48
ensure_secret AUTH_PASSWORD_SALT base64 32
ensure_secret SESSION_COOKIE_SALT base64 48
ensure_secret CHAT_AUTH_JWT_SECRET base64 48

tinode_token_expire="$(env_value TINODE_TOKEN_EXPIRE_IN)"
tinode_token_expire="${tinode_token_expire:-300}"
if ! [[ "$tinode_token_expire" =~ ^[0-9]+$ ]] || (( tinode_token_expire < 60 || tinode_token_expire > 900 )); then
  echo "TINODE_TOKEN_EXPIRE_IN must be between 60 and 900 seconds." >&2
  exit 1
fi

allow_insecure="$(env_value ALLOW_INSECURE_HTTP)"
if [[ "${allow_insecure,,}" != "true" ]]; then
  public_secure="$(env_value PUBLIC_SECURE)"
  cookie_secure="$(env_value CHAT_AUTH_COOKIE_SECURE)"
  password_reset_debug="$(env_value CHAT_PASSWORD_RESET_DEBUG)"
  [[ "${public_secure,,}" == "true" ]] || {
    echo "Production requires PUBLIC_SECURE=true." >&2
    exit 1
  }
  [[ "${cookie_secure,,}" == "true" ]] || {
    echo "Production requires CHAT_AUTH_COOKIE_SECURE=true." >&2
    exit 1
  }
  [[ "$(env_value CHAT_MANAGEMENT_PUBLIC_URL)" == https://* ]] || {
    echo "CHAT_MANAGEMENT_PUBLIC_URL must use HTTPS." >&2
    exit 1
  }
  account_url="$(env_value ACCOUNT_URL)"
  if [[ -n "$account_url" ]]; then
    [[ "$account_url" == https://* ]] || {
      echo "Optional ACCOUNT_URL must use HTTPS." >&2
      exit 1
    }
    [[ "$(env_value ACCOUNT_SESSION_COOKIE_DOMAIN)" == .* ]] || {
      echo "ACCOUNT_SESSION_COOKIE_DOMAIN must be a shared parent domain when Account SSO is enabled." >&2
      exit 1
    }
  fi
  [[ "$(env_value CHAT_PASSWORD_RESET_URL)" == https://* ]] || {
    echo "CHAT_PASSWORD_RESET_URL must use HTTPS." >&2
    exit 1
  }
  [[ "$(env_value CHATMGT_BIND_HOST)" != "0.0.0.0" ]] || {
    echo "CHATMGT_BIND_HOST must not expose Chatmgt on every interface." >&2
    exit 1
  }
  [[ "${password_reset_debug,,}" != "true" ]] || {
    echo "CHAT_PASSWORD_RESET_DEBUG must be false in production." >&2
    exit 1
  }
  [[ "$(env_value CHAT_CORS_ORIGINS)" == *https://* ]] || {
    echo "CHAT_CORS_ORIGINS must contain an HTTPS origin." >&2
    exit 1
  }
  [[ "$(env_value TINODE_CORS_ORIGINS)" == *https://* ]] || {
    echo "TINODE_CORS_ORIGINS must contain an HTTPS origin." >&2
    exit 1
  }
fi

db_user="$(env_value CHATSERVICE_DB_USER)"
db_name="$(env_value CHATSERVICE_DB_NAME)"
db_user="${db_user:-chatservice}"
db_name="${db_name:-chatservice}"

compose up -d tinode-postgres chat-postgres redis
wait_postgres tinode-postgres postgres postgres
wait_postgres chat-postgres "$db_user" "$db_name"

tinode_initialized=false
if [[ "$(compose exec -T tinode-postgres psql -U postgres -d postgres -Atqc \
  "SELECT 1 FROM pg_database WHERE datname = 'tinode'" | tr -d '[:space:]')" == "1" ]]; then
  tinode_table_count="$(compose exec -T tinode-postgres psql -U postgres -d tinode -Atqc \
    "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'" | tr -d '[:space:]')"
  if [[ "${tinode_table_count:-0}" -gt 0 ]]; then
    tinode_initialized=true
  fi
fi

tinode_admin_password="$(env_value TINODE_ADMIN_PASSWORD)"
if is_placeholder "$tinode_admin_password"; then
  if [[ "$tinode_initialized" == "true" ]]; then
    echo "Tinode already contains data. Set TINODE_ADMIN_PASSWORD to the current root password; it cannot be regenerated safely." >&2
    exit 1
  fi
  set_env TINODE_ADMIN_PASSWORD "$(openssl rand -hex 24)"
fi

mkdir -p "$RUNTIME_DIR" "$BACKUP_DIR"
chmod 700 "$RUNTIME_DIR" "$BACKUP_DIR"

compose build chatmgt chat
compose run --rm --no-deps --user "$(id -u):$(id -g)" chatmgt \
  python scripts/render_tinode_bootstrap.py
chmod 600 "$RUNTIME_DIR/tinode-bootstrap.json"

compose up -d chatapi

backup_file="$(mktemp "$BACKUP_DIR/chatservice-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX.dump")"
compose exec -T chat-postgres pg_dump -U "$db_user" -d "$db_name" -Fc > "$backup_file"
if [[ ! -s "$backup_file" ]]; then
  echo "PostgreSQL backup is empty; Alembic was not started." >&2
  exit 1
fi
chmod 600 "$backup_file"
echo "Created pre-migration backup: $backup_file"

compose run --rm --no-deps chatmgt alembic -c alembic.ini upgrade head
compose run --rm --no-deps chatmgt \
  python scripts/bootstrap_admin.py --wait-seconds 120
compose up -d chatmgt
wait_chatmgt
compose run --rm --no-deps chat nginx -t

compose up -d chat
public_http_port="$(env_value PUBLIC_HTTP_PORT)"
wait_frontend "${public_http_port:-80}"

compose run --rm --no-deps chatmgt \
  python scripts/verify_deployment.py \
  --alembic-ini alembic.ini \
  --base-url http://chatmgt:8093
compose run --rm --no-deps chatmgt \
  python scripts/verify_tenant_isolation.py \
  --base-url http://chatmgt:8093

verify_public_urls="$(env_value VERIFY_PUBLIC_URLS)"
if [[ "${verify_public_urls,,}" == "true" ]]; then
  public_scheme="http"
  if [[ "$(env_value PUBLIC_SECURE)" == "true" ]]; then
    public_scheme="https"
  fi
  public_url="${public_scheme}://$(env_value PUBLIC_HOST)"
  management_url="$(env_value CHAT_MANAGEMENT_PUBLIC_URL)"
  curl --fail --silent --show-error --location --max-time 15 "$public_url/healthz" >/dev/null
  curl --fail --silent --show-error --location --max-time 15 \
    "$management_url/api/v1/auth/health" >/dev/null
  echo "Public domain health checks passed."
fi

compose ps
echo "Deployment verification passed for $(env_value PUBLIC_HOST)."
