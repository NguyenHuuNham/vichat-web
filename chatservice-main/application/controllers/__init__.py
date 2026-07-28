from gatco.response import json

def init_controllers(app):
    # Chatmgt exposes only management APIs. Realtime chat stays in Tinode.
    import application.controllers.api_chat_management
    if app.config.get("CHATBOT_ENABLED", False):
        import application.controllers.api_chatbot


    @app.route('/')
    def index(request):
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
