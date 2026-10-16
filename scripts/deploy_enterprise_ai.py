import os
import subprocess
import tarfile
from pathlib import Path

REPO_ROOT = Path(r"d:\CÔNG_VIỆC\vichat-web")
TMP_DIR = Path(r"D:\vichat-build\tmp")
TMP_DIR.mkdir(parents=True, exist_ok=True)

print("=== Step 1: Packing Frontend dist ===")
dist_tar = TMP_DIR / "dist-upload.tar.gz"
with tarfile.open(dist_tar, "w:gz") as tar:
    for item in (REPO_ROOT / "dist").iterdir():
        tar.add(item, arcname=item.name)
print(f"Created {dist_tar} ({dist_tar.stat().st_size} bytes)")

print("=== Step 2: Packing Backend Files ===")
backend_files = [
    ("chatservice-main/application/models/models.py", "application/models/models.py"),
    ("chatservice-main/application/services/enterprise_ai_tools.py", "application/services/enterprise_ai_tools.py"),
    ("chatservice-main/application/services/chatbot_service.py", "application/services/chatbot_service.py"),
    ("chatservice-main/application/controllers/api_attendance.py", "application/controllers/api_attendance.py"),
    ("chatservice-main/application/controllers/api_chatbot.py", "application/controllers/api_chatbot.py"),
    ("chatservice-main/application/controllers/__init__.py", "application/controllers/__init__.py"),
    ("chatservice-main/tests/test_enterprise_ai_assistant.py", "tests/test_enterprise_ai_assistant.py"),
]
backend_tar = TMP_DIR / "backend-upload.tar.gz"
with tarfile.open(backend_tar, "w:gz") as tar:
    for local_rel, arc_rel in backend_files:
        full_p = REPO_ROOT / local_rel
        tar.add(full_p, arcname=arc_rel)
print(f"Created {backend_tar} ({backend_tar.stat().st_size} bytes)")

print("=== Step 3: Generating Server Deploy Script ===")
server_script = """#!/usr/bin/env bash
set -e

echo "=== 1. Deploy Frontend Web to songhong-production-chat-1 ==="
rm -rf /home/ubuntu/dist-new
mkdir -p /home/ubuntu/dist-new
tar -xzf /home/ubuntu/dist-upload.tar.gz -C /home/ubuntu/dist-new

sudo docker cp /home/ubuntu/dist-new/index.html songhong-production-chat-1:/usr/share/nginx/html/index.html
sudo docker cp /home/ubuntu/dist-new/assets/. songhong-production-chat-1:/usr/share/nginx/html/assets/
sudo docker cp /home/ubuntu/dist-new/. songhong-production-chat-1:/usr/share/nginx/html/

if [ -d /opt/deploy/chat/current/dist ]; then
    cp -r /home/ubuntu/dist-new/* /opt/deploy/chat/current/dist/
fi

sudo docker exec songhong-production-chat-1 nginx -t
sudo docker exec songhong-production-chat-1 nginx -s reload
echo "Frontend deployed and Nginx reloaded successfully."

echo "=== 2. Deploy Backend to songhong-production-chatmgt-1 ==="
rm -rf /home/ubuntu/backend-new
mkdir -p /home/ubuntu/backend-new
tar -xzf /home/ubuntu/backend-upload.tar.gz -C /home/ubuntu/backend-new

# Copy to persistent release directory
cp -r /home/ubuntu/backend-new/* /opt/deploy/chat/current/chatservice-main/

# Copy to docker container
sudo docker cp /home/ubuntu/backend-new/application/. songhong-production-chatmgt-1:/app/application/
sudo docker cp /home/ubuntu/backend-new/tests/. songhong-production-chatmgt-1:/app/tests/

# Check bytecode inside container
sudo docker exec songhong-production-chatmgt-1 python -m py_compile /app/application/models/models.py
sudo docker exec songhong-production-chatmgt-1 python -m py_compile /app/application/services/enterprise_ai_tools.py
sudo docker exec songhong-production-chatmgt-1 python -m py_compile /app/application/services/chatbot_service.py
sudo docker exec songhong-production-chatmgt-1 python -m py_compile /app/application/controllers/api_attendance.py
sudo docker exec songhong-production-chatmgt-1 python -m py_compile /app/application/controllers/api_chatbot.py
sudo docker exec songhong-production-chatmgt-1 python -m py_compile /app/application/controllers/__init__.py
echo "Bytecode compilation: PASSED"

# Ensure table employee_attendance exists in PostgreSQL
echo "Ensuring employee_attendance database schema..."
sudo docker exec songhong-production-chatmgt-1 python -c "
from application.database import db
from application.models.models import EmployeeAttendance
from application.server import app
try:
    EmployeeAttendance.__table__.create(db.engine, checkfirst=True)
    print('EmployeeAttendance table checked/created successfully.')
except Exception as e:
    print('Table creation check:', e)
"

echo "=== 3. Restart songhong-production-chatmgt-1 ==="
sudo docker restart songhong-production-chatmgt-1
sleep 4

echo "=== 4. Check Health & Endpoints ==="
sudo docker ps --filter name=songhong-production --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo "Checking Chatmgt health:"
curl -s http://192.168.80.20:8081/api/v1/auth/health

echo ""
echo "Checking Chatbot health:"
curl -s http://192.168.80.20:8081/api/v1/chatbot/health

echo ""
echo "Checking Web assets:"
curl -s http://127.0.0.1:8094/ | grep -oE '/assets/index-[^" ]+\.(js|css)' | sort -u

echo "=== 5. Clean up temporary files ==="
rm -f /home/ubuntu/dist-upload.tar.gz
rm -rf /home/ubuntu/dist-new
rm -f /home/ubuntu/backend-upload.tar.gz
rm -rf /home/ubuntu/backend-new
rm -f /home/ubuntu/server_deploy.sh

echo "=== DEPLOYMENT COMPLETED SUCCESSFULLY ==="
"""

server_script_file = TMP_DIR / "server_deploy.sh"
with open(server_script_file, "w", newline="\n") as f:
    f.write(server_script)
print(f"Created {server_script_file}")

print("=== Step 4: Transferring Files via SSH Jump Host ===")
# Transfer files to jump host 103.74.122.206
files_to_scp = [dist_tar, backend_tar, server_script_file]
for f in files_to_scp:
    print(f"Uploading {f.name} to jump host 103.74.122.206...")
    subprocess.run(["scp", str(f), f"ubuntu@103.74.122.206:/home/ubuntu/{f.name}"], check=True)

# Transfer from jump host to 192.168.80.20
print("Transferring files from jump host to 192.168.80.20...")
remote_scp_cmd = "scp /home/ubuntu/dist-upload.tar.gz /home/ubuntu/backend-upload.tar.gz /home/ubuntu/server_deploy.sh 192.168.80.20:/home/ubuntu/"
subprocess.run(["ssh", "ubuntu@103.74.122.206", remote_scp_cmd], check=True)

# Clean up on jump host
subprocess.run(["ssh", "ubuntu@103.74.122.206", "rm -f /home/ubuntu/dist-upload.tar.gz /home/ubuntu/backend-upload.tar.gz /home/ubuntu/server_deploy.sh"], check=True)

print("=== Step 5: Executing Deployment on 192.168.80.20 ===")
exec_cmd = "ssh 192.168.80.20 'chmod +x /home/ubuntu/server_deploy.sh && /home/ubuntu/server_deploy.sh'"
subprocess.run(["ssh", "ubuntu@103.74.122.206", exec_cmd], check=True)

print("=== ALL DONE ===")
