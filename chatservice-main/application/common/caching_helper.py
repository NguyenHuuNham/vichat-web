#!/usr/bin/env python
# -*- coding: utf-8 -*-
import redis
import ujson
from sanic.log import logger

from application.config import RedisConfig


class CachingHelpers:
    """
    Hàm thực hiện việc caching data
    """
    EXPIRATION_DEFAULT = 60 * 60

    def __init__(self):
        self.redis_db = redis.from_url(RedisConfig.REDIS_URI)

    @classmethod
    def hash_key(cls, *args):
        return RedisConfig.CACHE_PREFIX + "#" + "#".join([str(a) for a in args])

    def get_value_by_key_not_hash(self, key):
        try:
            try:
                result = self.redis_db.get(key)
                if result:
                    return ujson.loads(result)
                return result
            except Exception as err:
                print("get_value_by_key_not_hash: convert_json err:", err)
                return self.redis_db.get(key)
        except Exception as err:
            logger.info("CachingHelpers: get_value_by_key_not_hash: err: %s" % err)
            return None

    def get_value_by_key(self, *args):
        has_key = RedisConfig.CACHE_PREFIX + "#" + self.hash_key(*args)

        try:
            return self.get_value_by_key_not_hash(has_key)
        except Exception as err:
            logger.info("CachingHelpers: get_value_by_key: err: %s" % err)
            return None

    def set_value_by_key_not_hash(self, key, value, expiration=None):
        if not expiration:
            expiration = self.EXPIRATION_DEFAULT

        if isinstance(value, dict) or isinstance(value, list):
            value = ujson.dumps(value)

        # Set cache
        self.redis_db.set(key, value, expiration)
        return value

    def set_value_by_key(self, *args, value, expiration=None):
        if not expiration:
            expiration = self.EXPIRATION_DEFAULT
        has_key = self.hash_key(*args)

        if isinstance(value, dict) or isinstance(value, list):
            value = ujson.dumps(value)
        # Set cache
        self.redis_db.set(has_key, value, expiration)
        return value

    def delete_cache_by_key(self, key):
        return self.redis_db.delete(key)
