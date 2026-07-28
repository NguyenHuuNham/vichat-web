# Ubuntu deployment

This stack runs the React frontend, Tinode, Chat Service, two PostgreSQL
databases, Redis, and Nginx in one private Docker network. Only the Nginx HTTP
port is published publicly.

## Server preparation

```bash
sudo apt update
sudo apt install -y ca-certificates curl git openssl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
```

Open the required firewall ports:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 8094/tcp
sudo ufw enable
```

## Upload and start

From Windows PowerShell, upload the prepared archive:

```powershell
scp D:\vichat-web-master\vichat-web-master\songhong-deploy.tar.gz ubuntu@103.74.122.206:/home/ubuntu/
ssh ubuntu@103.74.122.206
```

On Ubuntu, extract it to `/opt/songhong-chat`:

```bash
sudo mkdir -p /opt/songhong-chat
sudo tar -xzf /home/ubuntu/songhong-deploy.tar.gz -C /opt/songhong-chat
sudo chown -R "$USER":"$USER" /opt/songhong-chat
```

Then run:

```bash
cd /opt/songhong-chat
cp infrastructure/production/.env.example infrastructure/production/.env
nano infrastructure/production/.env
chmod +x infrastructure/production/start.sh
./infrastructure/production/start.sh
```

For the current IP-only deployment, keep:

```dotenv
PUBLIC_HOST=103.74.122.206:8094
PUBLIC_HTTP_PORT=8094
PUBLIC_SECURE=false
CHATMGT_BIND_HOST=192.168.80.160
CHATMGT_PUBLIC_PORT=8081
CHAT_MANAGEMENT_PUBLIC_URL=https://chatmgt.upgo.vn
TINODE_CORS_ORIGINS=["http://103.74.122.206:8094"]
CHAT_AUTH_COOKIE_SECURE=false
CHAT_CORS_ORIGINS=["https://chat.upgo.vn"]
CHAT_PASSWORD_RESET_URL=http://103.74.122.206:8094/?reset_token={token}
CHAT_PASSWORD_RESET_DEBUG=false
TINODE_ADMIN_USERNAME=admin
TINODE_ADMIN_PASSWORD=replace-with-the-tinode-root-password
```

Configure `CHAT_SMTP_*` with a real mail provider before testing forgot password.
Reset links are delivered only by email and are never returned to the browser.

Then open `http://103.74.122.206:8094`.

The management API is published only on the server's private address at
`192.168.80.160:8081`. Point `chatmgt.upgo.vn` or the upstream HAProxy backend
to that address; do not expose the management container directly on the public
interface.

## Production security

IP-only HTTP is suitable for initial verification, not confidential company
traffic. Before real use, point a domain to the server, add TLS at the reverse
proxy, set `PUBLIC_HOST` to the domain, set `PUBLIC_SECURE=true`, set
`CHAT_AUTH_COOKIE_SECURE=true`, and change `TINODE_CORS_ORIGINS` to the HTTPS
origin. Rotate all bootstrap account passwords immediately after first login.

Do not run `docker compose down -v`: `-v` deletes the chat databases and files.
