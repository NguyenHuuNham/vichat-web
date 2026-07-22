from gatco_jinja2 import GatcoJinja2

class Jinja(GatcoJinja2):
    def init_app(self, app, loader=None, pkg_name=None, pkg_path=None):
        super(Jinja, self).init_app(app, loader, pkg_name, pkg_path)
        self.add_env("title", app.config.get("TITLE", ""))
        self.add_env("host", app.config.get("HOST", ""))
        self.add_env("account_url", app.config.get("ACCOUNT_URL", ""))
        self.add_env("crm_url", app.config.get("CRM_URL", ""))
        self.add_env("chatbot_url", app.config.get("CHATBOT_URL", ""))
        self.add_env("pos_url", app.config.get("POS_URL", ""))
        
        self.add_env("static_url", app.config.get("STATIC_URL", ""))
        self.add_env("release_version", app.config.get("RELEASE_VERSION", ""))

        self.add_env("file_url",app.config.get("FILE_STORAGE_URL",""))