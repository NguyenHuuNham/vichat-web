import os
import json


def env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def env_list(name, default):
    value = os.getenv(name)
    if not value:
        return default
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        parsed = [item.strip() for item in value.split(",") if item.strip()]
    if isinstance(parsed, list):
        return [str(item) for item in parsed if str(item)]
    return [str(parsed)]

class Config(object):
    ENVIRONMENT = os.getenv('ENVIRONMENT')  # production, staging, development,
    SQLALCHEMY_DATABASE_URI = os.environ.get("SQLALCHEMY_DATABASE_URI")
    APP_NAME = os.getenv('APP_NAME')
    APP_PORT= int(os.getenv('APP_PORT', 8093))
    HOST_URL = os.getenv('DATAROOM_URL')

    STATIC_URL = os.environ.get('STATIC_URL', "static")

    REQUEST_TIMEOUT = 86400
    RESPONSE_TIMEOUT = 86400

    AUTH_LOGIN_ENDPOINT = 'login'
    AUTH_PASSWORD_HASH = 'sha512_crypt'
    AUTH_PASSWORD_SALT = os.getenv('AUTH_PASSWORD_SALT', '')
    SECRET_KEY = os.getenv('APP_SECRET_KEY', '')
    SESSION_COOKIE_SALT = os.getenv('SESSION_COOKIE_SALT', '')

    SESSION_COOKIE_DOMAIN = os.getenv('SESSION_COOKIE_DOMAIN')
    REDIS_ADDR = os.getenv('REDIS_ADDR')
    REDIS_PORT= int(os.getenv('REDIS_PORT'))
    REDIS_DB= int(os.getenv('REDIS_DB'))

    SESSION_REDIS_URI = "redis://" + \
        str(REDIS_ADDR)+":" + \
        str(REDIS_PORT)+"/"+str(REDIS_DB)

    INTERNAL_ACCESS_TOKEN = os.getenv('INTERNAL_ACCESS_TOKEN')

    CHAT_AUTH_JWT_SECRET = os.getenv("CHAT_AUTH_JWT_SECRET")
    CHAT_CORS_ORIGINS = env_list(
        "CHAT_CORS_ORIGINS",
        ["http://127.0.0.1:5173"],
    )
    CHAT_AUTH_ACCESS_TTL = int(os.getenv("CHAT_AUTH_ACCESS_TTL", 28800))
    CHAT_AUTH_COOKIE_SECURE = env_bool("CHAT_AUTH_COOKIE_SECURE", False)
    CHAT_AUTH_MAX_FAILURES = int(os.getenv("CHAT_AUTH_MAX_FAILURES", 5))
    CHAT_AUTH_FAILURE_WINDOW = int(os.getenv("CHAT_AUTH_FAILURE_WINDOW", 900))
    CHAT_PASSWORD_RESET_TTL = int(os.getenv("CHAT_PASSWORD_RESET_TTL", 1800))
    CHAT_PASSWORD_RESET_MAX_REQUESTS = int(os.getenv("CHAT_PASSWORD_RESET_MAX_REQUESTS", 3))
    CHAT_PASSWORD_RESET_WINDOW = int(os.getenv("CHAT_PASSWORD_RESET_WINDOW", 900))
    CHAT_PASSWORD_RESET_URL = os.getenv(
        "CHAT_PASSWORD_RESET_URL",
        "http://127.0.0.1:5173/?reset_token={token}",
    )
    CHAT_PASSWORD_RESET_DEBUG = env_bool("CHAT_PASSWORD_RESET_DEBUG", False)
    CHAT_SMTP_HOST = os.getenv("CHAT_SMTP_HOST", "")
    CHAT_SMTP_PORT = int(os.getenv("CHAT_SMTP_PORT", 587))
    CHAT_SMTP_USERNAME = os.getenv("CHAT_SMTP_USERNAME", "")
    CHAT_SMTP_PASSWORD = os.getenv("CHAT_SMTP_PASSWORD", "")
    CHAT_SMTP_FROM = os.getenv("CHAT_SMTP_FROM", "")
    CHAT_SMTP_STARTTLS = env_bool("CHAT_SMTP_STARTTLS", True)
    CHAT_SMTP_SSL = env_bool("CHAT_SMTP_SSL", False)
    TINODE_INTERNAL_WS_URL = os.getenv("TINODE_INTERNAL_WS_URL", "")
    TINODE_API_KEY = os.getenv("TINODE_API_KEY", "")
    TINODE_AUTH_TIMEOUT = int(os.getenv("TINODE_AUTH_TIMEOUT", 10))
    TINODE_ADMIN_USERNAME = os.getenv("TINODE_ADMIN_USERNAME", "")
    TINODE_ADMIN_PASSWORD = os.getenv("TINODE_ADMIN_PASSWORD", "")
    TINODE_SSO_SECRET = os.getenv("TINODE_SSO_SECRET", "")
    TINODE_BRIDGE_INTERNAL_KEY = os.getenv("TINODE_BRIDGE_INTERNAL_KEY", "")
    TINODE_MIRROR_LOCAL_CREDENTIALS = env_bool(
        "TINODE_MIRROR_LOCAL_CREDENTIALS",
        False,
    )
    CHAT_ACCOUNT_SSO_ENABLED = env_bool("CHAT_ACCOUNT_SSO_ENABLED", False)
    CHAT_ACCOUNT_CREDENTIAL_LOGIN_ENABLED = env_bool(
        "CHAT_ACCOUNT_CREDENTIAL_LOGIN_ENABLED",
        False,
    )
    CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED = env_bool(
        "CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED",
        False,
    )
    # Recovery-only account mutations are not exposed by the management console.
    CHATMGT_MANAGEMENT_USER_MUTATIONS_ENABLED = False

    ACCOUNT_URL = os.getenv('ACCOUNT_URL')
    if ACCOUNT_URL and not ACCOUNT_URL.startswith("http://") and not ACCOUNT_URL.startswith("https://"):
        ACCOUNT_URL = "http://" + ACCOUNT_URL
    ACCOUNT_SSO_LOGIN_PATH = os.getenv("ACCOUNT_SSO_LOGIN_PATH", "/login")
    ACCOUNT_SSO_PROFILE_PATH = os.getenv("ACCOUNT_SSO_PROFILE_PATH", "/current_user")
    ACCOUNT_SSO_DIRECTORY_PATH = os.getenv("ACCOUNT_SSO_DIRECTORY_PATH", "/api/v1/tenant_user")
    ACCOUNT_SSO_LOGOUT_PATH = os.getenv("ACCOUNT_SSO_LOGOUT_PATH", "/logout")
    ACCOUNT_SSO_SELF_PROFILE_PATH = os.getenv("ACCOUNT_SSO_SELF_PROFILE_PATH", "/me")
    ACCOUNT_SSO_USER_UPDATE_PATH = os.getenv("ACCOUNT_SSO_USER_UPDATE_PATH", "/api/v1/user")
    ACCOUNT_AVATAR_UPLOAD_URL = os.getenv(
        "ACCOUNT_AVATAR_UPLOAD_URL",
        "https://service.upgo.vn/api/image/upload?path=accounts",
    )
    ACCOUNT_SSO_TIMEOUT = int(os.getenv("ACCOUNT_SSO_TIMEOUT", 10))
    ACCOUNT_SSO_DIRECTORY_SYNC_TTL = int(os.getenv("ACCOUNT_SSO_DIRECTORY_SYNC_TTL", 10))
    ACCOUNT_SESSION_COOKIE_NAME = os.getenv("ACCOUNT_SESSION_COOKIE_NAME", "session")
    ACCOUNT_SESSION_COOKIE_DOMAIN = os.getenv("ACCOUNT_SESSION_COOKIE_DOMAIN", ".upgo.vn")
    ACCOUNT_SESSION_COOKIE_SECURE = env_bool("ACCOUNT_SESSION_COOKIE_SECURE", True)

    DATAROOM_URL = os.getenv('DATAROOM_URL')
    if DATAROOM_URL and not DATAROOM_URL.startswith("http://") and not DATAROOM_URL.startswith("https://"):
        DATAROOM_URL = "http://" + DATAROOM_URL

    MINIO_URL = os.environ.get("MINIO_URL")
    MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY")
    MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY")
    MINIO_SECURE = env_bool("MINIO_SECURE", False)
    MINIO_BUCKET_NAME = os.environ.get("MINIO_BUCKET_NAME")
    MINIO_STORED = os.environ.get("MINIO_STORED")
    S3_URL = os.getenv('S3_URL')

    # Chatbot: OpenAI-compatible endpoint. Secrets stay in the server environment.
    CHATBOT_ENABLED = env_bool("CHATBOT_ENABLED", False)
    CHATBOT_REQUIRE_AUTH = env_bool("CHATBOT_REQUIRE_AUTH", True)
    CHATBOT_PROVIDER = os.getenv("CHATBOT_PROVIDER", "openai-compatible")
    CHATBOT_API_URL = os.getenv("CHATBOT_API_URL", "https://api.openai.com/v1/chat/completions")
    CHATBOT_API_KEY = os.getenv("CHATBOT_API_KEY")
    CHATBOT_MODEL = os.getenv("CHATBOT_MODEL")
    CHATBOT_EXTERNAL_AUTH_HEADER = os.getenv("CHATBOT_EXTERNAL_AUTH_HEADER", "Authorization")
    CHATBOT_EXTERNAL_AUTH_SCHEME = os.getenv("CHATBOT_EXTERNAL_AUTH_SCHEME", "Bearer")
    CHATBOT_EXTERNAL_API_KEY = os.getenv("CHATBOT_EXTERNAL_API_KEY", "")
    CHATBOT_EXTERNAL_TENANT = os.getenv("CHATBOT_EXTERNAL_TENANT", "")
    CHATBOT_EXTERNAL_KNOWLEDGE_BASE_ID = os.getenv("CHATBOT_EXTERNAL_KNOWLEDGE_BASE_ID", "")
    CHATBOT_TIMEOUT = int(os.getenv("CHATBOT_TIMEOUT", 30))
    CHATBOT_TEMPERATURE = float(os.getenv("CHATBOT_TEMPERATURE", 0.2))
    CHATBOT_MAX_TOKENS = int(os.getenv("CHATBOT_MAX_TOKENS", 800))
    CHATBOT_MAX_INPUT_LENGTH = int(os.getenv("CHATBOT_MAX_INPUT_LENGTH", 4000))
    CHATMGT_DEFAULT_TENANT = os.getenv(
        "CHATMGT_DEFAULT_TENANT",
        os.getenv("CHATBOT_DEFAULT_TENANT", "songhong"),
    )
    CHATBOT_DEFAULT_TENANT = os.getenv("CHATBOT_DEFAULT_TENANT", CHATMGT_DEFAULT_TENANT)
    CHATBOT_KNOWLEDGE_ONLY = env_bool("CHATBOT_KNOWLEDGE_ONLY", True)
    CHATBOT_KNOWLEDGE_REQUIRE_AUTH = env_bool("CHATBOT_KNOWLEDGE_REQUIRE_AUTH", True)
    CHATBOT_RETRIEVAL_LIMIT = int(os.getenv("CHATBOT_RETRIEVAL_LIMIT", 6))
    CHATBOT_RETRIEVAL_CANDIDATES = int(os.getenv("CHATBOT_RETRIEVAL_CANDIDATES", 500))
    CHATBOT_CHUNK_SIZE = int(os.getenv("CHATBOT_CHUNK_SIZE", 1400))
    CHATBOT_CHUNK_OVERLAP = int(os.getenv("CHATBOT_CHUNK_OVERLAP", 180))
    CHATBOT_MAX_KNOWLEDGE_FILE_SIZE = int(os.getenv("CHATBOT_MAX_KNOWLEDGE_FILE_SIZE", 20971520))
    CHATBOT_SYSTEM_PROMPT = os.getenv(
        "CHATBOT_SYSTEM_PROMPT",
        "Bạn là Trợ lý Sông Hồng. Trả lời bằng tiếng Việt, rõ ràng, ngắn gọn. "
        "Không suy đoán dữ liệu nội bộ; nếu thiếu dữ liệu hãy nói chưa đủ thông tin. "
        "Không tiết lộ mật khẩu, token, khóa API hoặc thông tin nhạy cảm.",
    )
