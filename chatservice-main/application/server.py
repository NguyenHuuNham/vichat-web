""" App entry point. """

from application.config.config import Config
from gatco import Gatco
from gatco.sessions import RedisSessionInterface
from gatco.cors import CORS, cross_origin

app = Gatco(name=__name__)
app.config.from_object(Config)
app.session_interface = RedisSessionInterface()

cors = CORS(
    app,
    automatic_options=True,
    origins=app.config.get("CHAT_CORS_ORIGINS"),
    supports_credentials=True,
)

CONTENT_SECURITY_POLICY = (
    "default-src 'self'; base-uri 'self'; object-src 'none'; "
    "frame-ancestors 'self'; form-action 'self' https://account.upgo.vn; "
    "script-src 'self'; style-src 'self' 'unsafe-inline' "
    "https://fonts.googleapis.com https://cdnjs.cloudflare.com; "
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; "
    "img-src 'self' data: blob: https:; media-src 'self' blob: https:; "
    "connect-src 'self' https: wss:; worker-src 'self' blob:"
)


@app.middleware("response")
async def add_browser_security_headers(request, response):
    response.headers["Content-Security-Policy"] = CONTENT_SECURITY_POLICY
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"


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
