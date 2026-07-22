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
sudo ufw allow 8093/tcp
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
PUBLIC_HOST=103.74.122.206:8093
PUBLIC_HTTP_PORT=8093
PUBLIC_SECURE=false
TINODE_CORS_ORIGINS=["http://103.74.122.206:8093"]
CHAT_AUTH_COOKIE_SECURE=false
```

Then open `http://103.74.122.206:8093`.

## Production security

IP-only HTTP is suitable for initial verification, not confidential company
traffic. Before real use, point a domain to the server, add TLS at the reverse
proxy, set `PUBLIC_HOST` to the domain, set `PUBLIC_SECURE=true`, set
`CHAT_AUTH_COOKIE_SECURE=true`, and change `TINODE_CORS_ORIGINS` to the HTTPS
origin. Rotate all bootstrap account passwords immediately after first login.

Do not run `docker compose down -v`: `-v` deletes the chat databases and files.
