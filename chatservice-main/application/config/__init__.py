import os



# class RedisConfig:
#     REDIS_HOST = os.getenv("REDIS_HOST", "0.0.0.0")
#     REDIS_PORT = os.getenv("REDIS_PORT", 6379)
#     CACHE_PREFIX = "APP_SERVICE"
#     REDIS_URI = "{}?health_check_interval=30".format(os.environ.get("REDIS_URI", 'redis://0.0.0.0:6379/0'))