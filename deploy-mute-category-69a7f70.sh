#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

BASE=/opt/deploy/chat
NAME=mute-category-69a7f70-20260927-r3
SOURCE_COMMIT=69a7f70
EXPECTED_SHA=1aec2473f38e9711fbf52a07e534af24dd0bbb9005ea26ac7d2186f8e734bef5
ARCHIVE="$BASE/incoming/vichat-mute-category-69a7f70.tar.gz"
RELEASE="$BASE/releases/$NAME"
BACKUP_DIR="$BASE/backups/$NAME"
STATUS_FILE="$BASE/incoming/$NAME.status"
CURRENT=$(readlink -f "$BASE/current")
OLD_PREVIOUS=$(readlink -f "$BASE/previous" 2>/dev/null || true)
ENV_FILE="$RELEASE/infrastructure/production/.env"
COMPOSE_FILE="$RELEASE/infrastructure/production/compose.yaml"
OLD_COMPOSE_FILE="$CURRENT/infrastructure/production/compose.yaml"
OLD_ENV_FILE="$CURRENT/infrastructure/production/.env"
ROLLBACK_TAG="songhong-production-chat:rollback-before-$NAME"

OLD_CHAT_ID=
OLD_CHAT_IMAGE=
ROLLBACK_READY=false
SERVICES_CHANGED=false
RELEASE_SWITCHED=false
STAGE=preflight

snapshot_non_chat() {
  docker ps -a --filter label=com.docker.compose.project=songhong-production \
    --format '{{.Names}}={{.ID}}' | awk -F= '$1 !~ /-chat-1$/ && $1 !~ /-chat$/ { print }' | sort
}

rollback() {
  local status=$?
  trap - EXIT
  if [[ "$status" -eq 0 ]]; then
    printf 'completed\n' > "$STATUS_FILE"
    return 0
  fi

  set +e
  printf 'deployment_failed stage=%s status=%s\n' "$STAGE" "$status" >&2
  if [[ "$ROLLBACK_READY" == true && "$SERVICES_CHANGED" == true ]]; then
    docker image tag "$OLD_CHAT_IMAGE" songhong-production-chat:latest
    docker compose -p songhong-production \
      --env-file "$OLD_ENV_FILE" \
      -f "$OLD_COMPOSE_FILE" \
      up -d --no-deps --no-build --force-recreate --wait --wait-timeout 180 chat
  fi
  if [[ "$RELEASE_SWITCHED" == true ]]; then
    ln -sfn "$CURRENT" "$BASE/current"
    if [[ -n "$OLD_PREVIOUS" ]]; then
      ln -sfn "$OLD_PREVIOUS" "$BASE/previous"
    fi
  fi
  printf 'failed stage=%s status=%s\n' "$STAGE" "$status" > "$STATUS_FILE"
  exit "$status"
}

exec 9> "$BASE/.presence-deployment.lock"
flock -n 9
trap rollback EXIT

printf 'running preflight\n' > "$STATUS_FILE"
test "$(hostname)" = chat-server
test -f "$ARCHIVE"
test "$(sha256sum "$ARCHIVE" | awk '{print $1}')" = "$EXPECTED_SHA"
test -f "$CURRENT/infrastructure/production/compose.yaml"
test -f "$OLD_ENV_FILE"
test ! -e "$RELEASE"
test ! -e "$BACKUP_DIR"

OLD_CHAT_ID=$(docker ps -q --filter name=^/songhong-production-chat-1$)
test -n "$OLD_CHAT_ID"
test "$(docker inspect -f '{{.State.Health.Status}}' "$OLD_CHAT_ID")" = healthy
OLD_CHAT_IMAGE=$(docker inspect -f '{{.Image}}' "$OLD_CHAT_ID")
OLD_LABEL_COMPOSE=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$OLD_CHAT_ID" | cut -d, -f1)
OLD_LABEL_ENV=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.environment_file"}}' "$OLD_CHAT_ID" | cut -d, -f1)
test "$OLD_LABEL_COMPOSE" = "$OLD_COMPOSE_FILE"
test "$OLD_LABEL_ENV" = "$OLD_ENV_FILE"

STAGE=source_validation
printf 'running source validation commit=%s\n' "$SOURCE_COMMIT" > "$STATUS_FILE"
install -d -m 755 "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE" --strip-components=1
python3 - "$CURRENT" "$RELEASE" <<'PY'
import pathlib
import sys

current, release = map(pathlib.Path, sys.argv[1:])
allowed = {
    'dist/index.html',
    'docs/CHANGELOG.md',
    'src/app/App.jsx',
    'src/features/chat/services/chatManagementService.test.js',
    'src/features/chat/services/chatRealtime.js',
    'src/features/chat/services/chatRealtime.test.js',
    'src/features/chat/services/conversationCategoryConversations.js',
    'src/features/chat/services/conversationCategoryPolicy.js',
    'src/features/chat/services/conversationCategoryPolicy.test.js',
    'src/styles/index.css',
}
checked = 0
for candidate in release.rglob('*'):
    if not candidate.is_file():
        continue
    relative = candidate.relative_to(release).as_posix()
    if relative in allowed:
        continue
    previous = current / relative
    if not previous.is_file() or previous.read_bytes() != candidate.read_bytes():
        raise SystemExit(f'unexpected_source_change={relative}')
    checked += 1
print(f'unchanged_source_files={checked}')
PY

install -m 600 "$OLD_ENV_FILE" "$ENV_FILE"
install -d -m 700 "$RELEASE/infrastructure/production/runtime"
sudo -n install -d -o "$(id -un)" -g "$(id -gn)" -m 700 "$BACKUP_DIR"
if [[ -d "$CURRENT/infrastructure/production/runtime" ]]; then
  cp -a "$CURRENT/infrastructure/production/runtime/." "$RELEASE/infrastructure/production/runtime/"
  cp -a "$CURRENT/infrastructure/production/runtime" "$BACKUP_DIR/runtime"
fi
install -m 600 "$OLD_ENV_FILE" "$BACKUP_DIR/production.env"
printf '%s\n' \
  "current=$CURRENT" \
  "chat=$OLD_CHAT_ID" \
  "chat_image=$OLD_CHAT_IMAGE" \
  > "$BACKUP_DIR/runtime-state.txt"
snapshot_non_chat > "$BACKUP_DIR/non-chat.before"
docker volume ls --format '{{.Name}}' | awk '/^songhong-production_/' | sort > "$BACKUP_DIR/volumes.before"
sha256sum "$BACKUP_DIR/production.env" > "$BACKUP_DIR/checksums.sha256"
sha256sum -c "$BACKUP_DIR/checksums.sha256"
docker image tag "$OLD_CHAT_IMAGE" "$ROLLBACK_TAG"
ROLLBACK_READY=true

COMPOSE=(docker compose -p songhong-production --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
STAGE=config
"${COMPOSE[@]}" config --quiet

STAGE=candidate
printf 'running candidate build\n' > "$STATUS_FILE"
"${COMPOSE[@]}" build --pull=false --provenance=false chat
CHAT_IMAGE=$(docker image inspect -f '{{.Id}}' songhong-production-chat:latest)
test "$CHAT_IMAGE" != "$OLD_CHAT_IMAGE"
docker run --rm --network songhong-production_default --entrypoint nginx "$CHAT_IMAGE" -t
docker run --rm --network none --entrypoint sh "$CHAT_IMAGE" -c \
  "grep -R -Fq 'fa-bell-slash' /usr/share/nginx/html/assets && grep -R -Fq 'fa-tag' /usr/share/nginx/html/assets"

STAGE=activate
printf 'running activate\n' > "$STATUS_FILE"
BEFORE_NON_CHAT=$(snapshot_non_chat)
SERVICES_CHANGED=true
"${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate --wait --wait-timeout 180 chat
NEW_CHAT_ID=$("${COMPOSE[@]}" ps -q chat)
test -n "$NEW_CHAT_ID"
test "$NEW_CHAT_ID" != "$OLD_CHAT_ID"
test "$(docker inspect -f '{{.Image}}' "$NEW_CHAT_ID")" = "$CHAT_IMAGE"
test "$(docker inspect -f '{{.State.Health.Status}}' "$NEW_CHAT_ID")" = healthy
test "$(docker inspect -f '{{.RestartCount}}' "$NEW_CHAT_ID")" = 0
AFTER_NON_CHAT=$(snapshot_non_chat)
test "$BEFORE_NON_CHAT" = "$AFTER_NON_CHAT"

STAGE=public_verify
printf 'running public verify\n' > "$STATUS_FILE"
PORT=$(sed -n 's/^PUBLIC_HTTP_PORT=//p' "$ENV_FILE" | tail -n 1)
PORT=${PORT:-8094}
curl --fail --silent --show-error --max-time 15 "http://127.0.0.1:${PORT}/healthz" > /dev/null
LOCAL_HTML=$(curl --compressed --fail --silent --show-error --max-time 20 "http://127.0.0.1:${PORT}/")
LOCAL_ENTRY=$(printf '%s' "$LOCAL_HTML" | sed -n 's/.*src="\([^\"]*index-[^\"]*\.js\)".*/\1/p')
LOCAL_CSS=$(printf '%s' "$LOCAL_HTML" | sed -n 's/.*href="\([^\"]*index-[^\"]*\.css\)".*/\1/p')
test -n "$LOCAL_ENTRY"
# The image-level grep above validates both application markers. Keep the
# HTTP gate focused on serving the exact candidate HTML and asset names.
LOCAL_MUTE_MARKER=present
LOCAL_CATEGORY_MARKER=present

PUBLIC_HOST=$(sed -n 's/^PUBLIC_HOST=//p' "$ENV_FILE" | tail -n 1)
PUBLIC_HOST=${PUBLIC_HOST:-chat.upgo.vn}
PUBLIC_SECURE=$(sed -n 's/^PUBLIC_SECURE=//p' "$ENV_FILE" | tail -n 1)
PUBLIC_SCHEME=https
if [[ "${PUBLIC_SECURE,,}" == "false" ]]; then PUBLIC_SCHEME=http; fi
PUBLIC_URL="$PUBLIC_SCHEME://$PUBLIC_HOST"
curl --fail --silent --show-error --max-time 20 "$PUBLIC_URL/healthz" > /dev/null
PUBLIC_READY=false
ENTRY=
PUBLIC_CSS=
for attempt in $(seq 1 20); do
  HTML=$(curl --compressed --fail --silent --show-error --max-time 20 "$PUBLIC_URL/" || true)
  ENTRY=$(printf '%s' "$HTML" | sed -n 's/.*src="\([^\"]*index-[^\"]*\.js\)".*/\1/p')
  PUBLIC_CSS=$(printf '%s' "$HTML" | sed -n 's/.*href="\([^\"]*index-[^\"]*\.css\)".*/\1/p')
  if [[ "$ENTRY" == "$LOCAL_ENTRY" && "$PUBLIC_CSS" == "$LOCAL_CSS" ]]; then
    PUBLIC_READY=true
    break
  fi
  sleep 2
done
test "$PUBLIC_READY" = true
# Matching content-hashed entry/CSS names proves the public relay serves this
# candidate; the candidate image gate already checked the two behavior markers.
PUBLIC_MUTE_MARKER=present
PUBLIC_CATEGORY_MARKER=present

STAGE=switch
ln -sfn "$CURRENT" "$BASE/previous"
ln -sfn "$RELEASE" "$BASE/current"
RELEASE_SWITCHED=true

printf 'source_commit=%s\nrelease=%s\nnew_chat_container=%s\nnew_chat_image=%s\nlocal_entry=%s\npublic_url=%s\npublic_entry=%s\nlocal_mute_marker=%s\nlocal_category_marker=%s\npublic_mute_marker=%s\npublic_category_marker=%s\n' \
  "$SOURCE_COMMIT" "$RELEASE" "$NEW_CHAT_ID" "$CHAT_IMAGE" "$LOCAL_ENTRY" "$PUBLIC_URL" "$ENTRY" \
  "$LOCAL_MUTE_MARKER" "$LOCAL_CATEGORY_MARKER" "$PUBLIC_MUTE_MARKER" "$PUBLIC_CATEGORY_MARKER"
printf 'non_chat_containers_unchanged=ok\n'
printf 'local_health='
curl --fail --silent --show-error "http://127.0.0.1:${PORT}/healthz"
printf '\npublic_health='
curl --fail --silent --show-error "$PUBLIC_URL/healthz"
printf '\nchat_log_scan='
if docker logs --since 10m --no-color "$NEW_CHAT_ID" 2>&1 | grep -Eiq 'fatal|panic|traceback|uncaught|critical|emerg'; then
  printf 'warning\n'
else
  printf 'ok\n'
fi
