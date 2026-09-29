#!/usr/bin/env bash
set -Eeuo pipefail
BASE=/opt/deploy/chat
echo "current=$(readlink -f "$BASE/current")"
echo "previous=$(readlink -f "$BASE/previous")"
echo "status=$(cat "$BASE/incoming/group-spam-fe99308-20260928-r1.status")"
for service in chat tinode-account-bridge chatmgt tinode-chatbot-webhook; do
  container="songhong-production-${service}-1"
  docker inspect -f "service=${service} id={{.Id}} image={{.Image}} health={{.State.Health.Status}} restart={{.RestartCount}}" "$container"
done
docker image inspect -f "chat_image={{.Id}}" songhong-production-chat:latest
docker image inspect -f "bridge_image={{.Id}}" songhong-production-tinode-account-bridge:latest
echo "logs"
for service in chat tinode-account-bridge; do
  container="songhong-production-${service}-1"
  if docker logs --since 10m --no-color "$container" 2>&1 | grep -Eiq 'fatal|panic|traceback|uncaught|critical|emerg'; then
    echo "${service}=warning"
  else
    echo "${service}=clean"
  fi
done
echo "untouched"
docker ps -a --filter label=com.docker.compose.project=songhong-production --format '{{.Names}}={{.ID}}' | awk -F= '$1 !~ /-(chat|tinode-account-bridge)-1$/ && $1 !~ /-(chat|tinode-account-bridge)$/ { print }' | sort
