#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

BASE=/opt/deploy/chat
NAME=compact-reactions-656ca5f-20260918-r1
SOURCE_COMMIT=656ca5f
EXPECTED_SHA=dcedb56685642ec66102770162e25244ac1c950ed8b1ffa7603514a6ad487812
EXPECTED_CURRENT="$BASE/releases/reaction-details-261f24e-20260918-r1"
ARCHIVE="$BASE/incoming/vichat-compact-reactions-656ca5f.tar.gz"
RELEASE="$BASE/releases/$NAME"
BACKUP_DIR="$BASE/backups/$NAME"
STATUS_FILE="$BASE/incoming/$NAME.status"
ROLLBACK_TAG=songhong-production-chat:rollback-before-compact-reactions-656ca5f
CURRENT=$(readlink -f "$BASE/current")
OLD_PREVIOUS=$(readlink -f "$BASE/previous")
ENV_FILE="$RELEASE/infrastructure/production/.env"
COMPOSE_FILE="$RELEASE/infrastructure/production/compose.yaml"
STAGE=preflight
ROLLBACK_READY=false
CHAT_CHANGED=false
RELEASE_SWITCHED=false

finish() {
  local status=$?
  trap - EXIT
  if [[ "$status" -eq 0 ]]; then
    printf 'completed\n' > "$STATUS_FILE"
    return
  fi
  set +e
  printf 'deployment_failed stage=%s status=%s\n' "$STAGE" "$status"
  if [[ "$ROLLBACK_READY" == true ]]; then
    docker image tag "$OLD_CHAT_IMAGE" songhong-production-chat:latest
    if [[ "$CHAT_CHANGED" == true ]]; then
      docker compose -p songhong-production --env-file "$OLD_CHAT_ENV" -f "$OLD_CHAT_COMPOSE" up -d --no-deps --no-build --force-recreate --wait --wait-timeout 180 chat < /dev/null
      printf 'rollback_status=%s\n' "$?"
    fi
  fi
  if [[ "$RELEASE_SWITCHED" == true ]]; then
    ln -sfn "$CURRENT" "$BASE/current"
    ln -sfn "$OLD_PREVIOUS" "$BASE/previous"
  fi
  printf 'failed stage=%s status=%s\n' "$STAGE" "$status" > "$STATUS_FILE"
  exit "$status"
}

snapshot_unaffected() {
  python3 - <<'PY'
import json
import subprocess

container_ids = subprocess.check_output(
    ['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=songhong-production'],
    text=True,
).split()
containers = json.loads(subprocess.check_output(['docker', 'inspect', *container_ids], text=True))
for container in sorted(containers, key=lambda row: row['Config']['Labels']['com.docker.compose.service']):
    service = container['Config']['Labels']['com.docker.compose.service']
    if service == 'chat':
        continue
    mounts = sorted(container['Mounts'], key=lambda mount: (mount['Destination'], mount['Source'], mount['Type']))
    snapshot = {'service': service, 'id': container['Id'], 'image': container['Image'], 'restarts': container['RestartCount'], 'mounts': mounts}
    print(json.dumps(snapshot, sort_keys=True, separators=(',', ':')))
PY
}

snapshot_volumes() {
  docker volume ls --format '{{.Name}}' | awk '/^songhong-production_/' | sort
}

exec 9> "$BASE/.presence-deployment.lock"
flock -n 9
trap finish EXIT
printf 'running preflight\n' > "$STATUS_FILE"
test "$(hostname)" = chat-server
test "$CURRENT" = "$EXPECTED_CURRENT"
test "$(sha256sum "$ARCHIVE" | awk '{print $1}')" = "$EXPECTED_SHA"
test ! -e "$RELEASE"
test ! -e "$BACKUP_DIR"
test "$(df --output=avail -B1 "$BASE" | tail -n 1)" -gt 5368709120
OLD_CHAT_ID=$(docker ps -q --filter name=^/songhong-production-chat-1$)
OLD_CHATMGT_ID=$(docker ps -q --filter name=^/songhong-production-chatmgt-1$)
test -n "$OLD_CHAT_ID"
test -n "$OLD_CHATMGT_ID"
test "$(docker inspect -f '{{.State.Health.Status}}' "$OLD_CHAT_ID")" = healthy
test "$(docker inspect -f '{{.State.Health.Status}}' "$OLD_CHATMGT_ID")" = healthy
OLD_CHAT_IMAGE=$(docker inspect -f '{{.Image}}' "$OLD_CHAT_ID")
OLD_CHAT_COMPOSE=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$OLD_CHAT_ID" | cut -d, -f1)
OLD_CHAT_ENV=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.environment_file"}}' "$OLD_CHAT_ID" | cut -d, -f1)
test "$OLD_CHAT_COMPOSE" = "$CURRENT/infrastructure/production/compose.yaml"
test "$OLD_CHAT_ENV" = "$CURRENT/infrastructure/production/.env"
ORIGINAL_ENV_SHA=$(sha256sum "$OLD_CHAT_ENV" | awk '{print $1}')

STAGE=source_validation
printf 'running source validation\n' > "$STATUS_FILE"
install -d -m 755 "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE" --strip-components=1
python3 - "$ARCHIVE" <<'PY'
import pathlib
import sys
import tarfile

archive = sys.argv[1]
file_count = 0
with tarfile.open(archive) as package:
    for member in package.getmembers():
        path = pathlib.PurePosixPath(member.name)
        assert not path.is_absolute(), member.name
        assert path.parts and path.parts[0] == 'vichat-web', member.name
        assert '..' not in path.parts, member.name
        assert not member.issym() and not member.islnk(), member.name
        if member.isfile():
            file_count += 1
print(f'archive_files={file_count}')
PY
grep -Fq 'compactReactionEntries' "$RELEASE/src/app/App.jsx"
grep -Fq 'message-reaction-overflow' "$RELEASE/src/app/App.jsx"
grep -Fq '3+' "$RELEASE/src/app/App.jsx"
grep -Fq 'reaction-details-remove' "$RELEASE/src/app/App.jsx"
grep -Fq 'message-reaction-overflow' "$RELEASE/src/styles/index.css"
install -m 600 "$OLD_CHAT_ENV" "$ENV_FILE"
install -d -m 700 "$RELEASE/infrastructure/production/runtime" "$RELEASE/infrastructure/production/backups"
cp -a "$CURRENT/infrastructure/production/runtime/." "$RELEASE/infrastructure/production/runtime/"
COMPOSE=(docker compose -p songhong-production --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
"${COMPOSE[@]}" config --quiet

STAGE=backup
printf 'running backup\n' > "$STATUS_FILE"
sudo -n install -d -o "$(id -un)" -g "$(id -gn)" -m 700 "$BACKUP_DIR"
install -m 600 "$OLD_CHAT_ENV" "$BACKUP_DIR/production.env"
cp -a "$CURRENT/infrastructure/production/runtime" "$BACKUP_DIR/runtime"
snapshot_unaffected > "$BACKUP_DIR/unaffected.before"
snapshot_volumes > "$BACKUP_DIR/volumes.before"
ALEMBIC_BEFORE=$(docker exec "$OLD_CHATMGT_ID" alembic current 2>/dev/null | awk 'NF {print $1}' | tail -n 1)
test -n "$ALEMBIC_BEFORE"
docker exec songhong-production-chat-postgres-1 sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' < /dev/null > "$BACKUP_DIR/chatservice-predeploy.dump"
docker exec -i songhong-production-chat-postgres-1 pg_restore -l < "$BACKUP_DIR/chatservice-predeploy.dump" > "$BACKUP_DIR/chatservice.restore.list"
docker exec -i songhong-production-tinode-postgres-1 pg_dump -U postgres -d tinode -Fc < /dev/null > "$BACKUP_DIR/tinode-predeploy.dump"
docker exec -i songhong-production-tinode-postgres-1 pg_restore -l < "$BACKUP_DIR/tinode-predeploy.dump" > "$BACKUP_DIR/tinode.restore.list"
for backup_file in chatservice-predeploy.dump chatservice.restore.list tinode-predeploy.dump tinode.restore.list production.env; do
  test -s "$BACKUP_DIR/$backup_file"
done
sha256sum "$BACKUP_DIR/chatservice-predeploy.dump" "$BACKUP_DIR/tinode-predeploy.dump" "$BACKUP_DIR/production.env" > "$BACKUP_DIR/checksums.sha256"
sha256sum -c "$BACKUP_DIR/checksums.sha256"
printf '%s\n' "current=$CURRENT" "previous=$OLD_PREVIOUS" "alembic=$ALEMBIC_BEFORE" "chat=$OLD_CHAT_ID" "chat_image=$OLD_CHAT_IMAGE" "chat_compose=$OLD_CHAT_COMPOSE" "chat_env=$OLD_CHAT_ENV" > "$BACKUP_DIR/runtime-state.txt"
docker image tag "$OLD_CHAT_IMAGE" "$ROLLBACK_TAG"
ROLLBACK_READY=true
printf 'backup_ready=%s\n' "$BACKUP_DIR"

STAGE=candidate
printf 'running candidate build\n' > "$STATUS_FILE"
"${COMPOSE[@]}" build --pull=false --provenance=false chat < /dev/null
CHAT_IMAGE=$(docker image inspect -f '{{.Id}}' songhong-production-chat:latest)
test "$CHAT_IMAGE" != "$OLD_CHAT_IMAGE"
docker run --rm --network songhong-production_default --entrypoint nginx "$CHAT_IMAGE" -t
CHAT_HTML=$(docker run --rm --network none --entrypoint cat "$CHAT_IMAGE" /usr/share/nginx/html/index.html)
ENTRY=$(printf '%s' "$CHAT_HTML" | sed -n 's/.*src="\([^\"]*index-[^\"]*\.js\)".*/\1/p')
CSS=$(printf '%s' "$CHAT_HTML" | sed -n 's/.*href="\([^\"]*index-[^\"]*\.css\)".*/\1/p')
test -n "$ENTRY"
test -n "$CSS"
docker run --rm --network none --entrypoint cat "$CHAT_IMAGE" "/usr/share/nginx/html${ENTRY}" > "$BACKUP_DIR/candidate-entry.js"
APP_ASSET=$(grep -oE 'App-[A-Za-z0-9_-]+\.js' "$BACKUP_DIR/candidate-entry.js" | sed -n '1p')
MGMT_ASSET=$(grep -oE 'ManagementApp-[A-Za-z0-9_-]+\.js' "$BACKUP_DIR/candidate-entry.js" | sed -n '1p')
APP_CSS_ASSET=$(grep -oE 'App-[A-Za-z0-9_-]+\.css' "$BACKUP_DIR/candidate-entry.js" | sed -n '1p')
MGMT_CSS_ASSET=$(grep -oE 'ManagementApp-[A-Za-z0-9_-]+\.css' "$BACKUP_DIR/candidate-entry.js" | sed -n '1p')
test -n "$APP_ASSET"
test -n "$MGMT_ASSET"
test -n "$APP_CSS_ASSET"
test -n "$MGMT_CSS_ASSET"
docker run --rm --network none --entrypoint cat "$CHAT_IMAGE" "/usr/share/nginx/html/assets/${APP_ASSET}" > "$BACKUP_DIR/candidate-app.js"
docker run --rm --network none --entrypoint cat "$CHAT_IMAGE" "/usr/share/nginx/html/assets/${MGMT_ASSET}" > "$BACKUP_DIR/candidate-management.js"
docker run --rm --network none --entrypoint cat "$CHAT_IMAGE" "/usr/share/nginx/html/assets/${APP_CSS_ASSET}" > "$BACKUP_DIR/candidate-app.css"
docker run --rm --network none --entrypoint cat "$CHAT_IMAGE" "/usr/share/nginx/html/assets/${MGMT_CSS_ASSET}" > "$BACKUP_DIR/candidate-management.css"
docker run --rm --network none --entrypoint cat "$CHAT_IMAGE" "/usr/share/nginx/html${CSS}" > "$BACKUP_DIR/candidate.css"
grep -Fq 'message-reaction-overflow' "$BACKUP_DIR/candidate-app.js"
grep -Fq '3+' "$BACKUP_DIR/candidate-app.js"
grep -Fq 'reaction-details-remove' "$BACKUP_DIR/candidate-app.js"
grep -Fq 'message-reaction-overflow' "$BACKUP_DIR/candidate.css"
grep -Fq 'reaction-details-remove' "$BACKUP_DIR/candidate.css"
LOCAL_ENTRY_SHA=$(sha256sum "$BACKUP_DIR/candidate-entry.js" | awk '{print $1}')
LOCAL_APP_SHA=$(sha256sum "$BACKUP_DIR/candidate-app.js" | awk '{print $1}')
LOCAL_MGMT_SHA=$(sha256sum "$BACKUP_DIR/candidate-management.js" | awk '{print $1}')
LOCAL_CSS_SHA=$(sha256sum "$BACKUP_DIR/candidate.css" | awk '{print $1}')
LOCAL_APP_CSS_SHA=$(sha256sum "$BACKUP_DIR/candidate-app.css" | awk '{print $1}')
LOCAL_MGMT_CSS_SHA=$(sha256sum "$BACKUP_DIR/candidate-management.css" | awk '{print $1}')

STAGE=activate
printf 'running activate\n' > "$STATUS_FILE"
ACTIVATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
CHAT_CHANGED=true
"${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate --wait --wait-timeout 180 chat < /dev/null
NEW_CHAT_ID=$("${COMPOSE[@]}" ps -q chat)
test -n "$NEW_CHAT_ID"
test "$NEW_CHAT_ID" != "$OLD_CHAT_ID"
test "$(docker inspect -f '{{.Image}}' "$NEW_CHAT_ID")" = "$CHAT_IMAGE"
test "$(docker inspect -f '{{.State.Health.Status}}' "$NEW_CHAT_ID")" = healthy
test "$(docker inspect -f '{{.RestartCount}}' "$NEW_CHAT_ID")" = 0
docker exec "$NEW_CHAT_ID" nginx -t
PORT=$(sed -n 's/^PUBLIC_HTTP_PORT=//p' "$ENV_FILE" | tail -n 1)
PORT=${PORT:-8094}

STAGE=public_verify
printf 'running public verify\n' > "$STATUS_FILE"
curl --fail --silent --show-error --max-time 15 "http://127.0.0.1:${PORT}/healthz" > /dev/null
curl --fail --silent --show-error --max-time 20 https://chat.upgo.vn/healthz > /dev/null
curl --fail --silent --show-error --max-time 20 https://chatmgt.upgo.vn/api/v1/auth/health > /dev/null
curl --fail --silent --show-error --max-time 20 https://chatmgt.upgo.vn/api/v1/chatbot/health > /dev/null
PUBLIC_READY=false
for attempt in $(seq 1 20); do
  PUBLIC_HTML=$(curl --compressed --fail --silent --show-error --max-time 20 https://chat.upgo.vn/ || true)
  PUBLIC_ENTRY=$(printf '%s' "$PUBLIC_HTML" | sed -n 's/.*src="\([^\"]*index-[^\"]*\.js\)".*/\1/p')
  PUBLIC_CSS=$(printf '%s' "$PUBLIC_HTML" | sed -n 's/.*href="\([^\"]*index-[^\"]*\.css\)".*/\1/p')
  if [[ "$PUBLIC_ENTRY" == "$ENTRY" && "$PUBLIC_CSS" == "$CSS" ]]; then
    curl --compressed --fail --silent --show-error --retry 2 --max-time 25 "https://chat.upgo.vn${ENTRY}" -o "$BACKUP_DIR/public-entry.js"
    curl --compressed --fail --silent --show-error --retry 2 --max-time 25 "https://chat.upgo.vn/assets/${APP_ASSET}" -o "$BACKUP_DIR/public-app.js"
    curl --compressed --fail --silent --show-error --retry 2 --max-time 25 "https://chat.upgo.vn/assets/${MGMT_ASSET}" -o "$BACKUP_DIR/public-management.js"
    curl --compressed --fail --silent --show-error --retry 2 --max-time 25 "https://chat.upgo.vn${CSS}" -o "$BACKUP_DIR/public-style.css"
    curl --compressed --fail --silent --show-error --retry 2 --max-time 25 "https://chat.upgo.vn/assets/${APP_CSS_ASSET}" -o "$BACKUP_DIR/public-app.css"
    curl --compressed --fail --silent --show-error --retry 2 --max-time 25 "https://chat.upgo.vn/assets/${MGMT_CSS_ASSET}" -o "$BACKUP_DIR/public-management.css"
    PUBLIC_ENTRY_SHA=$(sha256sum "$BACKUP_DIR/public-entry.js" | awk '{print $1}')
    PUBLIC_APP_SHA=$(sha256sum "$BACKUP_DIR/public-app.js" | awk '{print $1}')
    PUBLIC_MGMT_SHA=$(sha256sum "$BACKUP_DIR/public-management.js" | awk '{print $1}')
    PUBLIC_CSS_SHA=$(sha256sum "$BACKUP_DIR/public-style.css" | awk '{print $1}')
    PUBLIC_APP_CSS_SHA=$(sha256sum "$BACKUP_DIR/public-app.css" | awk '{print $1}')
    PUBLIC_MGMT_CSS_SHA=$(sha256sum "$BACKUP_DIR/public-management.css" | awk '{print $1}')
    if [[ "$PUBLIC_ENTRY_SHA" == "$LOCAL_ENTRY_SHA" && "$PUBLIC_APP_SHA" == "$LOCAL_APP_SHA" && "$PUBLIC_MGMT_SHA" == "$LOCAL_MGMT_SHA" && "$PUBLIC_CSS_SHA" == "$LOCAL_CSS_SHA" && "$PUBLIC_APP_CSS_SHA" == "$LOCAL_APP_CSS_SHA" && "$PUBLIC_MGMT_CSS_SHA" == "$LOCAL_MGMT_CSS_SHA" ]]; then
      PUBLIC_READY=true
      break
    fi
  fi
  sleep 2
done
test "$PUBLIC_READY" = true
WS_HEADERS=$(curl --silent --http1.1 --max-time 5 -D - -o /dev/null -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' https://chat.upgo.vn/v0/channels || true)
printf '%s\n' "$WS_HEADERS" | grep -Eq 'HTTP/[0-9.]+ 101'
printf 'wss_status=%s\n' "$(printf '%s' "$WS_HEADERS" | sed -n '1p')"
docker logs --since "$ACTIVATED_AT" "$NEW_CHAT_ID" > "$BACKUP_DIR/chat.log" 2>&1
if grep -Eiq 'fatal|panic|traceback|uncaught|critical|emerg' "$BACKUP_DIR/chat.log"; then
  echo 'chat_log_scan=failed' >&2
  exit 1
fi
snapshot_unaffected > "$BACKUP_DIR/unaffected.after"
cmp "$BACKUP_DIR/unaffected.before" "$BACKUP_DIR/unaffected.after"
snapshot_volumes > "$BACKUP_DIR/volumes.after"
cmp "$BACKUP_DIR/volumes.before" "$BACKUP_DIR/volumes.after"
test "$(docker exec "$OLD_CHATMGT_ID" alembic current 2>/dev/null | awk 'NF {print $1}' | tail -n 1)" = "$ALEMBIC_BEFORE"
test "$(sha256sum "$ENV_FILE" | awk '{print $1}')" = "$ORIGINAL_ENV_SHA"
test "$(sha256sum "$OLD_CHAT_ENV" | awk '{print $1}')" = "$ORIGINAL_ENV_SHA"
sha256sum -c "$BACKUP_DIR/checksums.sha256"

STAGE=switch
RELEASE_SWITCHED=true
ln -sfn "$CURRENT" "$BASE/previous"
ln -sfn "$RELEASE" "$BASE/current"
printf '%s\n' "source_commit=$SOURCE_COMMIT" "archive_sha=$EXPECTED_SHA" "release=$RELEASE" "previous=$CURRENT" "backup=$BACKUP_DIR" "chat_container=$NEW_CHAT_ID" "chat_image=$CHAT_IMAGE" "chatmgt_container=$OLD_CHATMGT_ID" "entry=$ENTRY" "app=$APP_ASSET" "management=$MGMT_ASSET" "css=$CSS" "app_css=$APP_CSS_ASSET" "management_css=$MGMT_CSS_ASSET" "entry_sha=$PUBLIC_ENTRY_SHA" "app_sha=$PUBLIC_APP_SHA" "management_sha=$PUBLIC_MGMT_SHA" "css_sha=$PUBLIC_CSS_SHA" "app_css_sha=$PUBLIC_APP_CSS_SHA" "management_css_sha=$PUBLIC_MGMT_CSS_SHA" "env_sha=$ORIGINAL_ENV_SHA" "alembic=$ALEMBIC_BEFORE" "activated_at=$ACTIVATED_AT" 'unaffected_services_unchanged=ok' 'volumes_unchanged=ok' 'tinode_data_untouched=ok' 'compact_reactions_release=ok' > "$BACKUP_DIR/result.txt"
cat "$BACKUP_DIR/result.txt"
ROLLBACK_READY=false
