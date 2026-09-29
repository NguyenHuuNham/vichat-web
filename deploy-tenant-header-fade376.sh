#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

BASE=/opt/deploy/chat
NAME=tenant-header-fade376-20260920-r1
SOURCE_COMMIT=fade376
EXPECTED_SHA=f9304cb6a2701d5ca09aa49a354039981949ce0b3c3a16621475de4e8a5c2671
ARCHIVE="$BASE/incoming/vichat-tenant-header-fade376.tar.gz"
RELEASE="$BASE/releases/$NAME"
BACKUP_DIR="$BASE/backups/$NAME"
STATUS_FILE="$BASE/incoming/$NAME.status"
CURRENT=$(readlink -f "$BASE/current")
OLD_PREVIOUS=$(readlink -f "$BASE/previous" 2>/dev/null || true)
ENV_FILE="$RELEASE/infrastructure/production/.env"
COMPOSE_FILE="$RELEASE/infrastructure/production/compose.yaml"
OLD_COMPOSE_FILE="$CURRENT/infrastructure/production/compose.yaml"
OLD_ENV_FILE="$CURRENT/infrastructure/production/.env"
ROLLBACK_CHAT_TAG=songhong-production-chat:rollback-before-tenant-header-fade376
ROLLBACK_CHATMGT_TAG=songhong-production-chatmgt:rollback-before-tenant-header-fade376

OLD_CHAT_IMAGE=
OLD_CHATMGT_IMAGE=
ROLLBACK_READY=false
SERVICES_CHANGED=false
RELEASE_SWITCHED=false
STAGE=preflight

snapshot_unaffected() {
  python3 - <<'PY'
import json
import subprocess

container_ids = subprocess.check_output(
    ['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=songhong-production'],
    text=True,
).split()
if not container_ids:
    raise SystemExit(0)
containers = json.loads(subprocess.check_output(['docker', 'inspect', *container_ids], text=True))
for container in sorted(containers, key=lambda row: row['Config']['Labels'].get('com.docker.compose.service', '')):
    labels = container['Config']['Labels']
    service = labels.get('com.docker.compose.service', '')
    if service in {'chat', 'chatmgt'}:
        continue
    mounts = sorted(
        container['Mounts'],
        key=lambda mount: (mount['Destination'], mount['Source'], mount['Type']),
    )
    snapshot = {
        'service': service,
        'id': container['Id'],
        'image': container['Image'],
        'restarts': container['RestartCount'],
        'mounts': mounts,
    }
    print(json.dumps(snapshot, sort_keys=True, separators=(',', ':')))
PY
}

snapshot_volumes() {
  docker volume ls --format '{{.Name}}' | awk '/^songhong-production_/' | sort
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
  if [[ "$ROLLBACK_READY" == true ]]; then
    docker image tag "$OLD_CHAT_IMAGE" songhong-production-chat:latest
    docker image tag "$OLD_CHATMGT_IMAGE" songhong-production-chatmgt:latest
    if [[ "$SERVICES_CHANGED" == true ]]; then
      docker compose -p songhong-production \
        --env-file "$OLD_ENV_FILE" \
        -f "$OLD_COMPOSE_FILE" \
        up -d --no-deps --no-build --force-recreate --wait --wait-timeout 180 chatmgt chat
    fi
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
test "$(df --output=avail -B1 "$BASE" | tail -n 1)" -gt 5368709120

OLD_CHAT_ID=$(docker ps -q --filter name=^/songhong-production-chat-1$)
OLD_CHATMGT_ID=$(docker ps -q --filter name=^/songhong-production-chatmgt-1$)
CHAT_POSTGRES_ID=$(docker ps -q --filter name=^/songhong-production-chat-postgres-1$)
TINODE_POSTGRES_ID=$(docker ps -q --filter name=^/songhong-production-tinode-postgres-1$)
test -n "$OLD_CHAT_ID"
test -n "$OLD_CHATMGT_ID"
test -n "$CHAT_POSTGRES_ID"
test -n "$TINODE_POSTGRES_ID"
test "$(docker inspect -f '{{.State.Health.Status}}' "$OLD_CHAT_ID")" = healthy
test "$(docker inspect -f '{{.State.Health.Status}}' "$OLD_CHATMGT_ID")" = healthy
OLD_CHAT_IMAGE=$(docker inspect -f '{{.Image}}' "$OLD_CHAT_ID")
OLD_CHATMGT_IMAGE=$(docker inspect -f '{{.Image}}' "$OLD_CHATMGT_ID")
OLD_LABEL_COMPOSE=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$OLD_CHAT_ID" | cut -d, -f1)
OLD_LABEL_ENV=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.environment_file"}}' "$OLD_CHAT_ID" | cut -d, -f1)
test "$OLD_LABEL_COMPOSE" = "$OLD_COMPOSE_FILE"
test "$OLD_LABEL_ENV" = "$OLD_ENV_FILE"

STAGE=source_validation
printf 'running source validation\n' > "$STATUS_FILE"
install -d -m 755 "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE" --strip-components=1
python3 - "$CURRENT" "$RELEASE" <<'PY'
import pathlib
import sys

current, release = map(pathlib.Path, sys.argv[1:])
allowed = {
    'chatservice-main/application/controllers/api_chat_management.py',
    'chatservice-main/tests/test_chat_auth_contract.py',
    'dist/index.html',
    'docs/CHANGELOG.md',
    'docs/chat-backend-architecture.md',
    'src/app/App.jsx',
    'src/features/chat/services/chatManagementService.js',
    'src/features/chat/services/chatManagementService.test.js',
    'src/features/i18n/appLanguage.js',
    'src/features/i18n/appLanguage.test.js',
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
install -d -m 700 "$RELEASE/infrastructure/production/runtime" "$RELEASE/infrastructure/production/backups"
if [[ -d "$CURRENT/infrastructure/production/runtime" ]]; then
  cp -a "$CURRENT/infrastructure/production/runtime/." "$RELEASE/infrastructure/production/runtime/"
fi
sudo -n install -d -o "$(id -un)" -g "$(id -gn)" -m 700 "$BACKUP_DIR"
COMPOSE=(docker compose -p songhong-production --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
"${COMPOSE[@]}" config --quiet

STAGE=backup
printf 'running backup\n' > "$STATUS_FILE"
install -m 600 "$OLD_ENV_FILE" "$BACKUP_DIR/production.env"
cp -a "$CURRENT/infrastructure/production/runtime" "$BACKUP_DIR/runtime"
snapshot_unaffected > "$BACKUP_DIR/unaffected.before"
snapshot_volumes > "$BACKUP_DIR/volumes.before"
ALEMBIC_BEFORE=$(docker exec "$OLD_CHATMGT_ID" alembic current 2>/dev/null | awk 'NF {print $1}' | tail -n 1)
test -n "$ALEMBIC_BEFORE"
docker exec "$CHAT_POSTGRES_ID" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' < /dev/null > "$BACKUP_DIR/chatservice-predeploy.dump"
docker exec "$TINODE_POSTGRES_ID" sh -c 'pg_dump -U "$POSTGRES_USER" -d tinode -Fc' < /dev/null > "$BACKUP_DIR/tinode-predeploy.dump"
docker exec -i "$CHAT_POSTGRES_ID" pg_restore -l < "$BACKUP_DIR/chatservice-predeploy.dump" > "$BACKUP_DIR/chatservice.restore.list"
docker exec -i "$TINODE_POSTGRES_ID" pg_restore -l < "$BACKUP_DIR/tinode-predeploy.dump" > "$BACKUP_DIR/tinode.restore.list"
for backup_file in chatservice-predeploy.dump chatservice.restore.list tinode-predeploy.dump tinode.restore.list production.env; do
  test -s "$BACKUP_DIR/$backup_file"
done
sha256sum "$BACKUP_DIR/chatservice-predeploy.dump" "$BACKUP_DIR/tinode-predeploy.dump" "$BACKUP_DIR/production.env" > "$BACKUP_DIR/checksums.sha256"
sha256sum -c "$BACKUP_DIR/checksums.sha256"
printf '%s\n' \
  "current=$CURRENT" \
  "previous=$OLD_PREVIOUS" \
  "alembic=$ALEMBIC_BEFORE" \
  "chat=$OLD_CHAT_ID" \
  "chat_image=$OLD_CHAT_IMAGE" \
  "chatmgt=$OLD_CHATMGT_ID" \
  "chatmgt_image=$OLD_CHATMGT_IMAGE" \
  > "$BACKUP_DIR/runtime-state.txt"
docker image tag "$OLD_CHAT_IMAGE" "$ROLLBACK_CHAT_TAG"
docker image tag "$OLD_CHATMGT_IMAGE" "$ROLLBACK_CHATMGT_TAG"
ROLLBACK_READY=true
printf 'backup_ready=%s\n' "$BACKUP_DIR"

STAGE=candidate
printf 'running candidate build\n' > "$STATUS_FILE"
"${COMPOSE[@]}" build --pull=false --provenance=false chat chatmgt < /dev/null
CHAT_IMAGE=$(docker image inspect -f '{{.Id}}' songhong-production-chat:latest)
CHATMGT_IMAGE=$(docker image inspect -f '{{.Id}}' songhong-production-chatmgt:latest)
test "$CHAT_IMAGE" != "$OLD_CHAT_IMAGE"
test "$CHATMGT_IMAGE" != "$OLD_CHATMGT_IMAGE"
docker run --rm --network songhong-production_default --entrypoint nginx "$CHAT_IMAGE" -t
docker run --rm --network none \
  -v "$RELEASE/src:/src:ro" \
  -v "$RELEASE/infrastructure:/infrastructure:ro" \
  -v "$RELEASE/docs:/docs:ro" \
  -v "$RELEASE/scripts:/scripts:ro" \
  --entrypoint python "$CHATMGT_IMAGE" \
  -m unittest tests.test_chat_auth_contract -q
docker run --rm --network none --entrypoint grep "$CHATMGT_IMAGE" -Fq "/api/v1/profile/views" application/controllers/api_chat_management.py

CHAT_HTML=$(docker run --rm --network none --entrypoint cat "$CHAT_IMAGE" /usr/share/nginx/html/index.html)
ENTRY=$(printf '%s' "$CHAT_HTML" | sed -n 's/.*src="\([^\"]*index-[^\"]*\.js\)".*/\1/p')
CSS=$(printf '%s' "$CHAT_HTML" | sed -n 's/.*href="\([^\"]*index-[^\"]*\.css\)".*/\1/p')
test -n "$ENTRY"
test -n "$CSS"
docker run --rm --network none --entrypoint sh "$CHAT_IMAGE" -c \
  "grep -R -Fq 'profile-viewers-button' /usr/share/nginx/html/assets"

STAGE=activate
printf 'running activate\n' > "$STATUS_FILE"
ACTIVATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SERVICES_CHANGED=true
"${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate --wait --wait-timeout 180 chatmgt chat < /dev/null
NEW_CHAT_ID=$("${COMPOSE[@]}" ps -q chat)
NEW_CHATMGT_ID=$("${COMPOSE[@]}" ps -q chatmgt)
test -n "$NEW_CHAT_ID"
test -n "$NEW_CHATMGT_ID"
test "$NEW_CHAT_ID" != "$OLD_CHAT_ID"
test "$NEW_CHATMGT_ID" != "$OLD_CHATMGT_ID"
test "$(docker inspect -f '{{.Image}}' "$NEW_CHAT_ID")" = "$CHAT_IMAGE"
test "$(docker inspect -f '{{.Image}}' "$NEW_CHATMGT_ID")" = "$CHATMGT_IMAGE"
test "$(docker inspect -f '{{.State.Health.Status}}' "$NEW_CHAT_ID")" = healthy
test "$(docker inspect -f '{{.State.Health.Status}}' "$NEW_CHATMGT_ID")" = healthy
test "$(docker inspect -f '{{.RestartCount}}' "$NEW_CHAT_ID")" = 0
test "$(docker inspect -f '{{.RestartCount}}' "$NEW_CHATMGT_ID")" = 0

STAGE=public_verify
printf 'running public verify\n' > "$STATUS_FILE"
PORT=$(sed -n 's/^PUBLIC_HTTP_PORT=//p' "$ENV_FILE" | tail -n 1)
PORT=${PORT:-8094}
curl --fail --silent --show-error --max-time 15 "http://127.0.0.1:${PORT}/healthz" > /dev/null
curl --fail --silent --show-error --max-time 20 https://chat.upgo.vn/healthz > /dev/null
curl --fail --silent --show-error --max-time 20 https://chatmgt.upgo.vn/api/v1/auth/health > /dev/null
PROFILE_STATUS=$(curl --silent --show-error --max-time 20 -o /dev/null -w '%{http_code}' https://chatmgt.upgo.vn/api/v1/profile/views || true)
[[ "$PROFILE_STATUS" == 401 || "$PROFILE_STATUS" == 403 ]]
PUBLIC_READY=false
for attempt in $(seq 1 20); do
  PUBLIC_HTML=$(curl --compressed --fail --silent --show-error --max-time 20 https://chat.upgo.vn/ || true)
  PUBLIC_ENTRY=$(printf '%s' "$PUBLIC_HTML" | sed -n 's/.*src="\([^\"]*index-[^\"]*\.js\)".*/\1/p')
  PUBLIC_CSS=$(printf '%s' "$PUBLIC_HTML" | sed -n 's/.*href="\([^\"]*index-[^\"]*\.css\)".*/\1/p')
  if [[ "$PUBLIC_ENTRY" == "$ENTRY" && "$PUBLIC_CSS" == "$CSS" ]]; then
    PUBLIC_READY=true
    break
  fi
  sleep 2
done
test "$PUBLIC_READY" = true
WS_HEADERS=$(curl --silent --http1.1 --max-time 5 -D - -o /dev/null \
  -H 'Connection: Upgrade' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  https://chat.upgo.vn/v0/channels || true)
printf '%s\n' "$WS_HEADERS" | grep -Eq 'HTTP/[0-9.]+ 101'
for container_id in "$NEW_CHAT_ID" "$NEW_CHATMGT_ID"; do
  if docker logs --since "$ACTIVATED_AT" --no-color "$container_id" 2>&1 | grep -Eiq 'fatal|panic|traceback|uncaught|critical|emerg'; then
    echo "log_scan_failed=$container_id" >&2
    exit 1
  fi
done

snapshot_unaffected > "$BACKUP_DIR/unaffected.after"
cmp "$BACKUP_DIR/unaffected.before" "$BACKUP_DIR/unaffected.after"
snapshot_volumes > "$BACKUP_DIR/volumes.after"
cmp "$BACKUP_DIR/volumes.before" "$BACKUP_DIR/volumes.after"
test "$(docker exec "$NEW_CHATMGT_ID" alembic current 2>/dev/null | awk 'NF {print $1}' | tail -n 1)" = "$ALEMBIC_BEFORE"
test "$(sha256sum "$ENV_FILE" | awk '{print $1}')" = "$(sha256sum "$OLD_ENV_FILE" | awk '{print $1}')"
sha256sum -c "$BACKUP_DIR/checksums.sha256"

STAGE=switch
RELEASE_SWITCHED=true
ln -sfn "$CURRENT" "$BASE/previous"
ln -sfn "$RELEASE" "$BASE/current"
printf '%s\n' \
  "source_commit=$SOURCE_COMMIT" \
  "archive_sha=$EXPECTED_SHA" \
  "release=$RELEASE" \
  "previous=$CURRENT" \
  "backup=$BACKUP_DIR" \
  "chat_container=$NEW_CHAT_ID" \
  "chatmgt_container=$NEW_CHATMGT_ID" \
  "entry=$ENTRY" \
  "css=$CSS" \
  "alembic=$ALEMBIC_BEFORE" \
  "unaffected_services_unchanged=ok" \
  "volumes_unchanged=ok" \
  "profile_viewers_release=ok" > "$BACKUP_DIR/result.txt"
cat "$BACKUP_DIR/result.txt"
