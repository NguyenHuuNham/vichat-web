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
