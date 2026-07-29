FROM python:3.9.23-slim-bookworm@sha256:7bffea15bcc3d7fb87cf10a027986203e4281e078fa2f5b234c30fca291f0834

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.lock ./requirements.lock
RUN pip install --no-cache-dir -r requirements.lock
# gatco-sqlalchemy evaluates this legacy attribute even when a scope function
# is provided; replace it with the modern equivalent for Python 3.9+.
RUN sed -i 's/asyncio\.Task\.current_task/asyncio.current_task/g' /usr/local/lib/python3.9/site-packages/gatco_sqlalchemy/__init__.py

COPY . .

EXPOSE 8093
CMD ["python", "manage.py", "run"]
