import os
from dotenv import load_dotenv
load_dotenv(override=False)

# Gatco/Sanic in this legacy service imports a few collection ABCs from the
# pre-3.10 location. Keep the service runnable on the supported modern Python
# image without changing the vendored framework.
import collections
import collections.abc
import asyncio
import types
for _name in ("MutableSequence", "MutableMapping", "MutableSet"):
    if not hasattr(collections, _name):
        setattr(collections, _name, getattr(collections.abc, _name))
if not hasattr(asyncio, "coroutine"):
    asyncio.coroutine = types.coroutine

from .server import app

def run_app(host=None, port=None, debug=False):
    # 2. Tự động load file .env
    load_dotenv(override=False)
    
    # 3. Ưu tiên lấy từ biến môi trường, nếu không có thì lấy tham số truyền vào, 
    #    nếu vẫn không có thì lấy giá trị mặc định
    host = host or os.getenv('APP_HOST', '0.0.0.0')
    port = int(port or os.getenv('APP_PORT', 8093))
    
    """ Function for bootstrapping gatco app. """
    app.run(host=host, port=port, debug=debug, workers=4)
