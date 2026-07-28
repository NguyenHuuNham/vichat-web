from application.extensions import jinja

def init_controllers(app):
    # Chatmgt exposes only management APIs. Realtime chat stays in Tinode.
    import application.controllers.api_chat_management
    if app.config.get("CHATBOT_ENABLED", False):
        import application.controllers.api_chatbot


    @app.route('/')
    def index(request):
        return jinja.render('pixel-index.html', request)
