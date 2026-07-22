from application.extensions import jinja

def init_controllers(app):
    # APP API
    import application.controllers.api_user
    import application.controllers.api_organization
    import application.controllers.api_chatbot
    import application.controllers.api_chat_management


    @app.route('/')
    def index(request):
        return jinja.render('pixel-index.html', request)
