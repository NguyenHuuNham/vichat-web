from .useragent import GatcoUserAgent
from gatco_auth import Auth
from gatco_apimanager import APIManager
from gatco_apimanager.views.sqlalchemy import APIView
from gatco_acl.acl import ACL 
from .jinja import Jinja
from application.database import db

import asyncio
from urllib.parse import urlsplit

from gatco_acl.constants import FULL, ALL
from minio import Minio
minioclient = None
minio_public_client = None

auth = Auth()
apimanager = APIManager()
jinja = Jinja()
racl = ACL()


def _minio_endpoint(value, secure):
    raw = str(value or "").strip().rstrip("/")
    if not raw:
        return "", bool(secure)
    parsed = urlsplit(raw if "://" in raw else "//" + raw)
    if not parsed.netloc or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise RuntimeError("MinIO endpoints must contain only a host and optional port.")
    if parsed.scheme and parsed.scheme not in ("http", "https"):
        raise RuntimeError("MinIO endpoints must use HTTP or HTTPS.")
    endpoint_secure = parsed.scheme == "https" if parsed.scheme else bool(secure)
    return parsed.netloc, endpoint_secure


def _create_minio_client(endpoint, access_key, secret_key, secure, region):
    options = {
        "access_key": access_key,
        "secret_key": secret_key,
        "secure": secure,
    }
    if region:
        options["region"] = region
    return Minio(endpoint, **options)


def init_extensions(app):
    GatcoUserAgent.init_app(app)
    auth.init_app(app)
    # apimanager.init_app(app, sqlalchemy_db=db)
    apimanager.init_app(app, view_cls=APIView, db=db)
    jinja.init_app(app)
    racl.init_app(app)
    
    @racl.user_loader
    def acl_user_loader(request):
        #user = auth.current_user(request)
        #print(user)
        #print("acl_user_loader", user)
        user = {"id": 1, "name": "Hong"}
        return user
        
    @racl.authorization_method
    def acl_authorization_method(user, they):
        they.can(FULL, "Cart")
        
        
        they.cannot("UPDATE", 'Page')
        def if_author(page):
            print("if_author",page.author)
            return page.author == "ABC"

        they.can("EDIT", 'Page', if_author)
        they.can("DELETE", 'Page', lambda a: a.author == "CDE")
    
    global minioclient, minio_public_client
    minioclient = None
    minio_public_client = None
    minio_url = app.config.get('MINIO_URL')
    minio_access_key = app.config.get('MINIO_ACCESS_KEY')
    minio_secret_key = app.config.get('MINIO_SECRET_KEY')
    if any((minio_url, minio_access_key, minio_secret_key)):
        if not all((minio_url, minio_access_key, minio_secret_key)):
            raise RuntimeError('MINIO_URL, MINIO_ACCESS_KEY, and MINIO_SECRET_KEY must be configured together.')
        minio_endpoint, minio_secure = _minio_endpoint(
            minio_url,
            app.config['MINIO_SECURE'],
        )
        public_endpoint, public_secure = _minio_endpoint(
            app.config.get('MINIO_PUBLIC_DOMAIN') or minio_url,
            minio_secure,
        )
        minio_region = str(app.config.get('MINIO_REGION') or '').strip()
        minioclient = _create_minio_client(
            minio_endpoint,
            minio_access_key,
            minio_secret_key,
            minio_secure,
            minio_region,
        )
        minio_public_client = _create_minio_client(
            public_endpoint,
            minio_access_key,
            minio_secret_key,
            public_secure,
            minio_region,
        )
