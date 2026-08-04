import os

from gatco.response import json
from sanic.response import file

def init_controllers(app):
    # Chatmgt exposes only management APIs. Realtime chat stays in Tinode.
    import application.controllers.api_chat_management
    import application.controllers.api_enterprise_workspace
    if app.config.get("CHATBOT_ENABLED", False):
        import application.controllers.api_chatbot


    management_ui_dir = os.path.abspath(
        os.environ.get("MANAGEMENT_UI_DIR") or os.path.join(os.getcwd(), "management-ui")
    )
    management_index = os.path.join(management_ui_dir, "index.html")
    management_assets = os.path.join(management_ui_dir, "assets")
    if os.path.isdir(management_assets):
        app.static('/assets', management_assets, name='management_assets')
    for asset_name in ('favicon.svg', 'chat-logo.svg', 'icons.svg'):
        asset_path = os.path.join(management_ui_dir, asset_name)
        if os.path.isfile(asset_path):
            app.static(
                '/{}'.format(asset_name),
                asset_path,
                name='management_{}'.format(asset_name.replace('.', '_')),
            )

    @app.route('/')
    async def index(request):
        if os.path.isfile(management_index):
            return await file(management_index)
        return json({
            "service": "chatmgt",
            "status": "ok",
            "health": "/api/v1/auth/health",
            "authentication": {
                "login": "/login",
                "current_user": "/api/v1/auth/me",
                "logout": "/api/v1/auth/logout",
            },
        })
