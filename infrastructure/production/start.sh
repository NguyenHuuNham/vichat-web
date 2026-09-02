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
  local profile_args=()
  if [[ "$(env_value WEBRTC_ENABLED)" == "true" ]]; then
    profile_args=(--profile webrtc)
  fi
  docker compose "${profile_args[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

render_ice_servers() {
  local target="$RUNTIME_DIR/ice-servers.json"
  local temp_file
  if [[ -d "$target" ]]; then
    echo "$target is a directory; remove the empty Docker-created directory before retrying." >&2
    return 1
  fi
  temp_file="$(mktemp "$RUNTIME_DIR/ice-servers.json.tmp.XXXXXX")"
  if [[ "$(env_value WEBRTC_ENABLED)" == "true" ]]; then
    local turn_host turn_port turn_username turn_password
    turn_host="$(env_value TURN_HOST)"
    turn_port="$(env_value TURN_PORT)"
    turn_port="${turn_port:-3478}"
    turn_username="$(env_value TURN_USERNAME)"
    turn_username="${turn_username:-vichat}"
    turn_password="$(env_value TURN_PASSWORD)"
    printf '[\n  {"urls":["stun:%s:%s"]},\n  {"username":"%s","credential":"%s","urls":["turn:%s:%s?transport=udp","turn:%s:%s?transport=tcp"]}\n]\n' \
      "$turn_host" "$turn_port" "$turn_username" "$turn_password" \
      "$turn_host" "$turn_port" "$turn_host" "$turn_port" > "$temp_file"
  else
    printf '[]\n' > "$temp_file"
  fi
  chmod 600 "$temp_file"
  mv -f -- "$temp_file" "$target"
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
ensure_secret TINODE_BRIDGE_INTERNAL_KEY base64 48
ensure_secret CHATSERVICE_DB_PASSWORD hex 32
ensure_secret APP_SECRET_KEY base64 48
ensure_secret AUTH_PASSWORD_SALT base64 32
ensure_secret SESSION_COOKIE_SALT base64 48
ensure_secret CHAT_AUTH_JWT_SECRET base64 48

chat_media_storage="$(env_value CHAT_MEDIA_STORAGE)"
chat_media_storage="${chat_media_storage:-tinode}"
chat_media_storage="${chat_media_storage,,}"
if [[ "$chat_media_storage" != "tinode" && "$chat_media_storage" != "s3" ]]; then
  echo "CHAT_MEDIA_STORAGE must be tinode or s3." >&2
  exit 1
fi
set_env CHAT_MEDIA_STORAGE "$chat_media_storage"

chat_media_fallback="$(env_value CHAT_MEDIA_FALLBACK_TO_TINODE)"
chat_media_fallback="${chat_media_fallback:-false}"
chat_media_fallback="${chat_media_fallback,,}"
if [[ "$chat_media_fallback" != "true" && "$chat_media_fallback" != "false" ]]; then
  echo "CHAT_MEDIA_FALLBACK_TO_TINODE must be true or false." >&2
  exit 1
fi
set_env CHAT_MEDIA_FALLBACK_TO_TINODE "$chat_media_fallback"
set_env VITE_CHAT_MEDIA_STORAGE "$chat_media_storage"
set_env VITE_CHAT_MEDIA_FALLBACK_TO_TINODE "$chat_media_fallback"

if [[ "$chat_media_storage" == "s3" ]]; then
  ensure_secret CHAT_MEDIA_SIGNING_SECRET base64 48
  minio_url="$(env_value MINIO_URL)"
  minio_public_domain="$(env_value MINIO_PUBLIC_DOMAIN)"
  minio_access_key="$(env_value MINIO_ACCESS_KEY)"
  minio_secret_key="$(env_value MINIO_SECRET_KEY)"
  minio_bucket="$(env_value MINIO_BUCKET_NAME)"
  minio_region="$(env_value MINIO_REGION)"
  minio_region="${minio_region:-us-east-1}"
  minio_secure="$(env_value MINIO_SECURE)"
  minio_secure="${minio_secure:-false}"
  minio_secure="${minio_secure,,}"
  chat_media_public_base="$(env_value CHAT_MEDIA_PUBLIC_BASE_URL)"
  chat_media_max_size="$(env_value CHAT_MEDIA_MAX_SIZE)"
  chat_media_max_size="${chat_media_max_size:-524288000}"
  chat_media_upload_ttl="$(env_value CHAT_MEDIA_UPLOAD_URL_TTL)"
  chat_media_upload_ttl="${chat_media_upload_ttl:-300}"
  chat_media_completion_ttl="$(env_value CHAT_MEDIA_COMPLETION_TTL)"
  chat_media_completion_ttl="${chat_media_completion_ttl:-21600}"
  chat_media_download_ttl="$(env_value CHAT_MEDIA_DOWNLOAD_URL_TTL)"
  chat_media_download_ttl="${chat_media_download_ttl:-300}"

  ! is_placeholder "$minio_url" || { echo "MINIO_URL must be the S3 API endpoint." >&2; exit 1; }
  ! is_placeholder "$minio_public_domain" || { echo "MINIO_PUBLIC_DOMAIN must be the public S3 API endpoint." >&2; exit 1; }
  ! is_placeholder "$minio_access_key" || { echo "MINIO_ACCESS_KEY must be configured privately." >&2; exit 1; }
  ! is_placeholder "$minio_secret_key" || { echo "MINIO_SECRET_KEY must be configured privately." >&2; exit 1; }
  ! is_placeholder "$minio_bucket" || { echo "MINIO_BUCKET_NAME must be configured." >&2; exit 1; }
  [[ "$minio_url" =~ ^(https?://)?[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$ ]] || { echo "MINIO_URL must contain only an S3 API host and optional port." >&2; exit 1; }
  [[ "$minio_public_domain" =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$ ]] || { echo "MINIO_PUBLIC_DOMAIN must use HTTPS and contain only the public S3 API host." >&2; exit 1; }
  [[ "$minio_secure" == "true" ]] || { echo "MINIO_SECURE must be true for the production S3 API endpoint." >&2; exit 1; }
  [[ "$minio_region" =~ ^[A-Za-z0-9-]{1,32}$ ]] || { echo "MINIO_REGION is invalid." >&2; exit 1; }
  [[ "$minio_bucket" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] || { echo "MINIO_BUCKET_NAME is invalid." >&2; exit 1; }
  (( ${#minio_access_key} >= 3 )) || { echo "MINIO_ACCESS_KEY is too short." >&2; exit 1; }
  (( ${#minio_secret_key} >= 8 )) || { echo "MINIO_SECRET_KEY is too short." >&2; exit 1; }
  [[ "$chat_media_public_base" =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$ ]] || { echo "CHAT_MEDIA_PUBLIC_BASE_URL must use HTTPS and contain only the Chatmgt host." >&2; exit 1; }
  [[ "$chat_media_max_size" =~ ^[0-9]+$ ]] && (( chat_media_max_size >= 1 && chat_media_max_size <= 524288000 )) || { echo "CHAT_MEDIA_MAX_SIZE must be between 1 and 524288000 bytes." >&2; exit 1; }
  [[ "$chat_media_upload_ttl" =~ ^[0-9]+$ ]] && (( chat_media_upload_ttl >= 60 && chat_media_upload_ttl <= 3600 )) || { echo "CHAT_MEDIA_UPLOAD_URL_TTL must be between 60 and 3600 seconds." >&2; exit 1; }
  [[ "$chat_media_completion_ttl" =~ ^[0-9]+$ ]] && (( chat_media_completion_ttl >= chat_media_upload_ttl && chat_media_completion_ttl <= 86400 )) || { echo "CHAT_MEDIA_COMPLETION_TTL must be at least the upload URL TTL and no more than 86400 seconds." >&2; exit 1; }
  [[ "$chat_media_download_ttl" =~ ^[0-9]+$ ]] && (( chat_media_download_ttl >= 30 && chat_media_download_ttl <= 3600 )) || { echo "CHAT_MEDIA_DOWNLOAD_URL_TTL must be between 30 and 3600 seconds." >&2; exit 1; }
  [[ "$chat_media_fallback" == "false" ]] || { echo "Production S3 media must keep CHAT_MEDIA_FALLBACK_TO_TINODE=false." >&2; exit 1; }

  set_env MINIO_REGION "$minio_region"
  set_env MINIO_SECURE "$minio_secure"
  set_env CHAT_MEDIA_MAX_SIZE "$chat_media_max_size"
  set_env CHAT_MEDIA_UPLOAD_URL_TTL "$chat_media_upload_ttl"
  set_env CHAT_MEDIA_COMPLETION_TTL "$chat_media_completion_ttl"
  set_env CHAT_MEDIA_DOWNLOAD_URL_TTL "$chat_media_download_ttl"
fi

webrtc_enabled="$(env_value WEBRTC_ENABLED)"
webrtc_enabled="${webrtc_enabled:-false}"
webrtc_enabled="${webrtc_enabled,,}"
if [[ "$webrtc_enabled" != "true" && "$webrtc_enabled" != "false" ]]; then
  echo "WEBRTC_ENABLED must be true or false." >&2
  exit 1
fi
set_env WEBRTC_ENABLED "$webrtc_enabled"

if [[ "$webrtc_enabled" == "true" ]]; then
  turn_host="$(env_value TURN_HOST)"
  turn_port="$(env_value TURN_PORT)"
  turn_port="${turn_port:-3478}"
  turn_realm="$(env_value TURN_REALM)"
  turn_realm="${turn_realm:-$turn_host}"
  turn_username="$(env_value TURN_USERNAME)"
  turn_username="${turn_username:-vichat}"
  turn_external_ip="$(env_value TURN_EXTERNAL_IP)"
  turn_private_ip="$(env_value TURN_PRIVATE_IP)"
  turn_relay_min="$(env_value TURN_RELAY_MIN_PORT)"
  turn_relay_min="${turn_relay_min:-49160}"
  turn_relay_max="$(env_value TURN_RELAY_MAX_PORT)"
  turn_relay_max="${turn_relay_max:-49200}"

  ! is_placeholder "$turn_host" || { echo "TURN_HOST must resolve directly to this Coturn server." >&2; exit 1; }
  [[ "$turn_host" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "TURN_HOST is invalid." >&2; exit 1; }
  [[ "$turn_realm" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "TURN_REALM is invalid." >&2; exit 1; }
  [[ "$turn_username" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "TURN_USERNAME is invalid." >&2; exit 1; }
  [[ "$turn_external_ip" =~ ^[A-Fa-f0-9:.]+(/[A-Fa-f0-9:.]+)?$ ]] || { echo "TURN_EXTERNAL_IP must be public-ip/private-ip when the server is behind NAT." >&2; exit 1; }
  [[ "$turn_private_ip" =~ ^[A-Fa-f0-9:.]+$ ]] || { echo "TURN_PRIVATE_IP is invalid." >&2; exit 1; }
  [[ "$turn_port" =~ ^[0-9]+$ ]] && (( turn_port >= 1 && turn_port <= 65535 )) || { echo "TURN_PORT is invalid." >&2; exit 1; }
  [[ "$turn_relay_min" =~ ^[0-9]+$ && "$turn_relay_max" =~ ^[0-9]+$ ]] || { echo "TURN relay ports must be numeric." >&2; exit 1; }
  (( turn_relay_min >= 1024 && turn_relay_max <= 65535 && turn_relay_min <= turn_relay_max )) || { echo "TURN relay port range is invalid." >&2; exit 1; }

  ensure_secret TURN_PASSWORD hex 24
  turn_password="$(env_value TURN_PASSWORD)"
  [[ "$turn_password" =~ ^[A-Fa-f0-9]{32,128}$ ]] || { echo "TURN_PASSWORD must be a generated hexadecimal secret." >&2; exit 1; }

  set_env TURN_HOST "$turn_host"
  set_env TURN_PORT "$turn_port"
  set_env TURN_REALM "$turn_realm"
  set_env TURN_USERNAME "$turn_username"
  set_env TURN_RELAY_MIN_PORT "$turn_relay_min"
  set_env TURN_RELAY_MAX_PORT "$turn_relay_max"
fi

tinode_token_expire="$(env_value TINODE_TOKEN_EXPIRE_IN)"
tinode_token_expire="${tinode_token_expire:-300}"
if ! [[ "$tinode_token_expire" =~ ^[0-9]+$ ]] || (( tinode_token_expire < 60 || tinode_token_expire > 900 )); then
  echo "TINODE_TOKEN_EXPIRE_IN must be between 60 and 900 seconds." >&2
  exit 1
fi

tinode_internal_ws_url="$(env_value TINODE_INTERNAL_WS_URL)"
if [[ "$tinode_internal_ws_url" != "ws://chat:80/v0/channels" ]]; then
  echo "TINODE_INTERNAL_WS_URL must be ws://chat:80/v0/channels for the central web.vichat.net relay." >&2
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
render_ice_servers

compose build chatmgt tinode-account-bridge chat
if [[ "$chat_media_storage" == "s3" ]]; then
  compose run --rm --no-deps chatmgt python scripts/verify_chat_media_storage.py
fi
compose run --rm --no-deps --user "$(id -u):$(id -g)" chatmgt \
  python scripts/render_tinode_bootstrap.py
chmod 600 "$RUNTIME_DIR/tinode-bootstrap.json"

if [[ "$webrtc_enabled" == "true" ]]; then
  compose up -d coturn
fi
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
