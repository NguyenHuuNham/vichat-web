# Workflow Engine

```
cd /opt/deploy/
python3.8 -m venv dataroom-workflow
cd dataroom-workflow/
source bin/activate
pip install -r repo/requirements.txt
```

#### Tao file env

```
nano ./liveenv
ENVIRONMENT=development
APP_PORT=15003
SQLALCHEMY_DATABASE_URI=postgresql://dataroomworkflowuser:dsaj8saasdnajsGABChjasdhUACVA@localhost:5432/dataroomworkflowdb
AUTH_SECRET_KEY=acndef
JWT_SIGNATURE=0FXnnDPOjVxJyYwsc4ESLaLV8ombQSuw
REDIS_ADDRESS_URI=localhost
SESSION_REDIS_DB=0
INTERNAL_ACCESS_TOKEN=MhZBy93zMUa5UwpLB3G2qYxFNdasjkdn29ijdnja921dskngaBo1jtLrbeuNqWDaKlsrkwuLefDXNH1O8dDiwfxxhP9vBCwaLOrT9JvbOWWstN4sQv
ACCOUNT_URL=https://account.gonapp.net
```

#### SQL create database 
```
create database dataroomworkflowdb encoding = 'UTF-8';
create user dataroomworkflowuser with password 'dsaj8saasdnajsGABChjasdhUACVA';
ALTER DATABASE dataroomworkflowdb OWNER TO dataroomworkflowuser;
GRANT ALL PRIVILEGES ON DATABASE dataroomworkflowdb TO dataroomworkflowuser;

```

```
cd repo
set -o allexport; source ../liveenv; set +o allexport
alembic upgrade head

```

```
sudo nano /etc/systemd/system/dataroom_workflow.service

[Unit]
Description=workflow-engine
After=network.target

[Service]
PIDFile=/var/run/workflow-engine.pid
User=ubuntu
Group=ubuntu
RuntimeDirectory=workflow
WorkingDirectory=/opt/deploy/dataroom-workflow/repo/
EnvironmentFile=/opt/deploy/dataroom-workflow/liveenv
ExecStart=/opt/deploy/dataroom-workflow/bin/python manage.py run
ExecReload=/bin/kill -s HUP $MAINPID
ExecStop=/bin/kill -s TERM $MAINPID
PrivateTmp=true
Restart=always

[Install]
WantedBy=multi-user.target
#place in to /etc/systemd/system
```

```
sudo systemctl enable dataroom_workflow.service
sudo service dataroom_workflow restart
sudo journalctl -u dataroom_workflow.service -f
```