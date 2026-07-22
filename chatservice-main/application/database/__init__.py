import os
import asyncio
import threading
import redis
from gatco_sqlalchemy import SQLAlchemy
from application.server import app

def session_scope():
    try:
        return asyncio.current_task()
    except RuntimeError:
        # CLI jobs such as knowledge seeding do not run inside an event loop.
        return threading.get_ident()


# Gatco-SQLAlchemy defaults to the removed asyncio.Task.current_task API.
db = SQLAlchemy(session_options={"scopefunc": session_scope})
redisdb = None

def init_database(app):
    # Do not print the connection URI: it can contain a database password.
    db.init_app(app)
    global redisdb
    redisdb = redis.StrictRedis(host=app.config.get('REDIS_ADDR'),\
                            port=app.config.get('REDIS_PORT'),\
                            db=app.config.get('REDIS_DB'),\
                            password=None)
