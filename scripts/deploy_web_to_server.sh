#!/usr/bin/env bash
set -e

echo "=== Step 1: Extract dist-upload.tar.gz ==="
rm -rf /home/ubuntu/dist-new
mkdir -p /home/ubuntu/dist-new
tar -xzf /home/ubuntu/dist-upload.tar.gz -C /home/ubuntu/dist-new

echo "=== Step 2: Validate extracted build ==="
test -f /home/ubuntu/dist-new/index.html
test -d /home/ubuntu/dist-new/assets
head -n 25 /home/ubuntu/dist-new/index.html

echo "=== Step 3: Copy to songhong-production-chat-1 container ==="
docker cp /home/ubuntu/dist-new/index.html songhong-production-chat-1:/usr/share/nginx/html/index.html
docker cp /home/ubuntu/dist-new/assets/. songhong-production-chat-1:/usr/share/nginx/html/assets/
docker cp /home/ubuntu/dist-new/. songhong-production-chat-1:/usr/share/nginx/html/

echo "=== Step 4: Copy to persistent release directory /opt/deploy/chat/current/dist ==="
if [ -d /opt/deploy/chat/current/dist ]; then
    cp -r /home/ubuntu/dist-new/* /opt/deploy/chat/current/dist/
fi

echo "=== Step 5: Test and reload nginx in container ==="
docker exec songhong-production-chat-1 nginx -t
docker exec songhong-production-chat-1 nginx -s reload

echo "=== Step 6: Verify HTTP endpoints ==="
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8094/healthz)
echo "Health status: $HEALTH_STATUS"
curl -s http://127.0.0.1:8094/ | grep -oE '/assets/index-[^" ]+\.(js|css)' | sort -u

echo "=== Step 7: Clean up ==="
rm -f /home/ubuntu/dist-upload.tar.gz
rm -rf /home/ubuntu/dist-new

echo "=== DEPLOYMENT COMPLETED SUCCESSFULLY ==="
