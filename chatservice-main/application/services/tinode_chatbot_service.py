import asyncio

from application.services.auth_service import AuthError, tinode_create_account, tinode_login


_auth_cache = None
_auth_lock = asyncio.Lock()


def tinode_chatbot_enabled(app):
    return bool(
        app.config.get("TINODE_CHATBOT_ENABLED", False)
        and str(app.config.get("TINODE_CHATBOT_USERNAME") or "").strip()
        and str(app.config.get("TINODE_CHATBOT_PASSWORD") or "").strip()
        and str(app.config.get("TINODE_CHATBOT_WEBHOOK_KEY") or "").strip()
    )


async def ensure_tinode_chatbot_auth(app, force=False):
    global _auth_cache

    if not tinode_chatbot_enabled(app):
        raise AuthError("Tinode chatbot webhook is not configured.", 503)
    if _auth_cache is not None and not force:
        return dict(_auth_cache)

    async with _auth_lock:
        if _auth_cache is not None and not force:
            return dict(_auth_cache)

        username = str(app.config.get("TINODE_CHATBOT_USERNAME") or "").strip()
        password = str(app.config.get("TINODE_CHATBOT_PASSWORD") or "")
        display_name = str(
            app.config.get("TINODE_CHATBOT_DISPLAY_NAME") or "ViChat AI"
        ).strip()
        try:
            auth = await tinode_login(username, password)
        except AuthError as login_error:
            if login_error.status_code != 401:
                raise
            try:
                auth = await tinode_create_account(username, password, display_name)
            except AuthError as create_error:
                if create_error.status_code != 409:
                    raise
                auth = await tinode_login(username, password)

        if not str(auth.get("uid") or "").strip():
            raise AuthError("Tinode chatbot account has no user ID.", 502)
        _auth_cache = {
            "uid": str(auth.get("uid")),
            "token": str(auth.get("token") or ""),
            "expires": auth.get("expires"),
            "username": username,
        }
        return dict(_auth_cache)


def tinode_chatbot_public_config(app, uid=""):
    resolved_uid = str(uid or "").strip()
    return {
        "enabled": tinode_chatbot_enabled(app) and bool(resolved_uid),
        "uid": resolved_uid,
        "tinodeUid": resolved_uid,
        "name": str(app.config.get("TINODE_CHATBOT_DISPLAY_NAME") or "ViChat AI"),
        "title": str(app.config.get("TINODE_CHATBOT_DISPLAY_TITLE") or "Tro ly AI"),
        "organization": str(
            app.config.get("TINODE_CHATBOT_DISPLAY_ORGANIZATION") or "GON Platform"
        ),
        "avatar": str(app.config.get("TINODE_CHATBOT_DISPLAY_AVATAR") or "/favicon.svg"),
    }
