# Native development install

The supported deployment path is Docker. For targeted backend development on
Ubuntu/WSL, use Python 3.9 and a project virtual environment.

From the repository root:

```bash
python3.9 -m venv .venv-chatmgt
source .venv-chatmgt/bin/activate
sudo apt-get install -y build-essential git libpq-dev
python -m pip install -r chatservice-main/requirements.lock
cd chatservice-main
```

Configure the database, Redis, Tinode, and all secret environment variables in
an ignored environment file. Do not copy credentials from documentation into a
real installation.

Before changing schema, create a PostgreSQL backup. Then run:

```bash
alembic -c alembic.ini current
alembic -c alembic.ini upgrade head
alembic -c alembic.ini current
python manage.py run
```

Expected startup port is `8093`. Verify behavior with
`GET /api/v1/auth/health`; a running process alone is not sufficient.
