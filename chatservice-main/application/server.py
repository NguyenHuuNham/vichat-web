""" App entry point. """

from application.config.config import Config
from gatco import Gatco
from gatco.cors import CORS
from gatco.response import json

app = Gatco(name=__name__)
app.config.from_object(Config)

cors = CORS(
    app,
    automatic_options=True,
    origins=app.config.get("CHAT_CORS_ORIGINS"),
    supports_credentials=True,
)

CONTENT_SECURITY_POLICY = (
    "default-src 'self'; base-uri 'self'; object-src 'none'; "
    "frame-ancestors 'self'; form-action 'self' https://account.gonplatform.com; "
    "script-src 'self'; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
    "font-src 'self' https://cdnjs.cloudflare.com; "
    "img-src 'self' data: blob: https://s3.upgo.vn https://account.gonplatform.com "
    "https://service.upgo.vn https://images.unsplash.com; "
    "media-src 'self' blob: https://s3.upgo.vn; "
    "connect-src 'self' https://account.gonplatform.com https://chat.gonplatform.com "
    "https://chatmgt.gonplatform.com https://chatapi.gonplatform.com https://s3.upgo.vn "
    "wss://chat.gonplatform.com wss://chatapi.gonplatform.com; "
    "worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests"
)

CSRF_METHODS = frozenset(("POST", "PUT", "PATCH", "DELETE"))


def _allowed_origins():
    return {
        str(origin or "").strip().rstrip("/")
        for origin in app.config.get("CHAT_CSRF_ORIGINS", [])
        if str(origin or "").strip()
    }


@app.middleware("request")
async def enforce_cookie_csrf_origin(request):
    if request.method not in CSRF_METHODS:
        return None
    if not str(request.headers.get("Cookie") or "").strip():
        return None
    # Mobile and trusted service calls authenticate with a bearer/internal
    # header, so they do not rely on browser cookie ambient authority.
    if request.headers.get("Authorization") or request.headers.get("X-Vichat-Client") == "mobile":
        return None
    if request.headers.get("X-Vichat-Tinode-Internal"):
        return None
    origin = str(request.headers.get("Origin") or "").strip().rstrip("/")
    if origin and origin in _allowed_origins():
        return None
    return json({
        "error_code": "CSRF_ORIGIN_REJECTED",
        "error_message": "The request origin is not allowed.",
    }, status=403)


@app.middleware("response")
async def add_browser_security_headers(request, response):
    response.headers["Content-Security-Policy"] = CONTENT_SECURITY_POLICY
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
    if str(getattr(request, "path", "") or "").startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"


from application.database import init_database
from application.extensions import init_extensions
# from application.components import init_components
from application.controllers import init_controllers

static_endpoint = app.config.get("STATIC_URL", None)
if (static_endpoint is not None) and not ((static_endpoint.startswith( 'http://' ) or (static_endpoint.startswith( 'https://' )))):
    app.static(static_endpoint, './static')

app.static('public', './public')

init_database(app)
init_extensions(app)
# init_components(app)
init_controllers(app)
