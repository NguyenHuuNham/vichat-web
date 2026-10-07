"""Zalo OA integration service: OAuth PKCE token manager, customer support (CS)
messaging API, user profile retrieval, and multi-tenant OA support.
"""

import base64
import hashlib
import json
import logging
import secrets
import time
from typing import Any, Dict, Optional, Tuple

try:
    import aiohttp
except Exception:
    aiohttp = None

try:
    import requests
except Exception:
    requests = None

try:
    from application.database import redisdb
except Exception:
    redisdb = None

logger = logging.getLogger(__name__)

# Constants
ZALO_AUTH_URL = "https://oauth.zaloapp.com/v4/oa/access_token"
ZALO_OA_BASE_URL = "https://openapi.zalo.me/v3.0"

_AT_LIFETIME_SECONDS = 3600
_AT_BUFFER_SECONDS = 300
_RT_LIFETIME_SECONDS = 90 * 24 * 3600
_RT_BUFFER_SECONDS = 7 * 24 * 3600
_REDIS_GRACE_SECONDS = 30


def generate_code_verifier() -> str:
    """Generate 43-128 char code verifier for OAuth PKCE."""
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode("ascii")


def generate_code_challenge(code_verifier: str) -> str:
    """Generate SHA256 code challenge for OAuth PKCE."""
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def build_authorization_url(
    app_id: str,
    redirect_uri: str,
    code_challenge: str,
    state: str = "",
) -> str:
    """Build URL for OA admin authorization."""
    return (
        "https://oauth.zaloapp.com/v4/oa/permission"
        "?app_id={app_id}"
        "&redirect_uri={redirect_uri}"
        "&code_challenge={code_challenge}"
        "&state={state}"
    ).format(
        app_id=app_id,
        redirect_uri=redirect_uri,
        code_challenge=code_challenge,
        state=state,
    )


class ZaloTokenManager(object):
    """Manages Access and Refresh Tokens for Zalo OA using Redis with auto-refresh."""

    def __init__(self, app_id: str, secret_key: str = "", redis_client=None):
        self.app_id = str(app_id or "").strip()
        self.secret_key = str(secret_key or "").strip()
        self._redis = redis_client if redis_client is not None else redisdb
        self._memory_cache: Dict[str, dict] = {}

    def _get_key(self, token_type: str, oa_id: Optional[str] = None) -> str:
        identifier = str(oa_id or self.app_id or "default").strip()
        return "zalo:{}:{}".format(token_type, identifier)

    def _redis_get(self, key: str) -> Optional[dict]:
        if self._redis is not None:
            try:
                raw = self._redis.get(key)
                if raw:
                    return json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
            except Exception as exc:
                logger.warning("Redis get error for %s: %s", key, exc)
        return self._memory_cache.get(key)

    def _redis_set(self, key: str, payload: dict, ttl_seconds: int) -> None:
        serialized = json.dumps(payload)
        if self._redis is not None:
            try:
                self._redis.setex(key, max(int(ttl_seconds), 1), serialized)
            except Exception as exc:
                logger.warning("Redis setex error for %s: %s", key, exc)
        self._memory_cache[key] = payload

    def _redis_del(self, key: str) -> None:
        if self._redis is not None:
            try:
                self._redis.delete(key)
            except Exception as exc:
                logger.warning("Redis del error for %s: %s", key, exc)
        self._memory_cache.pop(key, None)

    def persist_tokens(
        self,
        access_token: str,
        refresh_token: str,
        oa_id: Optional[str] = None,
        at_expires_in: int = _AT_LIFETIME_SECONDS,
        rt_expires_in: int = _RT_LIFETIME_SECONDS,
    ) -> None:
        now = time.time()
        at_key = self._get_key("at", oa_id)
        rt_key = self._get_key("rt", oa_id)

        at_payload = {
            "token": access_token,
            "expires_at": now + at_expires_in,
        }
        rt_payload = {
            "token": refresh_token,
            "expires_at": now + rt_expires_in,
        }

        self._redis_set(at_key, at_payload, at_expires_in + _REDIS_GRACE_SECONDS)
        self._redis_set(rt_key, rt_payload, rt_expires_in + _REDIS_GRACE_SECONDS)
        logger.info("Persisted Zalo tokens for OA/App: %s", oa_id or self.app_id)

    def invalidate_access_token(self, oa_id: Optional[str] = None) -> None:
        """Remove cached access token so next call triggers a fresh refresh."""
        at_key = self._get_key("at", oa_id)
        self._redis_del(at_key)
        logger.info("Invalidated Zalo access token for OA/App: %s", oa_id or self.app_id)

    def seed_tokens_if_empty(
        self,
        access_token: str,
        refresh_token: str,
        oa_id: Optional[str] = None,
        at_expires_in: int = _AT_LIFETIME_SECONDS,
        rt_expires_in: int = _RT_LIFETIME_SECONDS,
    ) -> None:
        """Seeds initial tokens into cache if not present."""
        if not access_token and not refresh_token:
            return
        at_key = self._get_key("at", oa_id)
        rt_key = self._get_key("rt", oa_id)
        existing_at = self._redis_get(at_key)
        existing_rt = self._redis_get(rt_key)
        if not existing_at and not existing_rt:
            self.persist_tokens(
                access_token=access_token,
                refresh_token=refresh_token,
                oa_id=oa_id,
                at_expires_in=at_expires_in,
                rt_expires_in=rt_expires_in,
            )
            logger.info("Seeded initial Zalo tokens for OA/App: %s", oa_id or self.app_id)

    def get_access_token(self, oa_id: Optional[str] = None) -> Optional[str]:
        now = time.time()
        at_key = self._get_key("at", oa_id)
        at_data = self._redis_get(at_key)

        if at_data and at_data.get("token"):
            expires_at = float(at_data.get("expires_at", 0))
            if expires_at - _AT_BUFFER_SECONDS > now:
                return at_data["token"]

        # AT expired or missing -> check RT to refresh
        rt_key = self._get_key("rt", oa_id)
        rt_data = self._redis_get(rt_key)
        if rt_data and rt_data.get("token"):
            rt_expires_at = float(rt_data.get("expires_at", 0))
            if rt_expires_at - _RT_BUFFER_SECONDS > now:
                logger.info("Refreshing Zalo access token using refresh_token for: %s", oa_id or self.app_id)
                refreshed = self.refresh_token(rt_data["token"], oa_id=oa_id)
                if refreshed:
                    return refreshed[0]

        logger.warning("No valid access token or refresh token for Zalo: %s", oa_id or self.app_id)
        return None

    def refresh_token(self, refresh_token: str, oa_id: Optional[str] = None) -> Optional[Tuple[str, str]]:
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "secret_key": self.secret_key,
        }
        payload = {
            "app_id": self.app_id,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        }
        try:
            resp = requests.post(ZALO_AUTH_URL, headers=headers, data=payload, timeout=15)
            data = resp.json()
            if data.get("error", 0) != 0:
                logger.error("Zalo refresh token error: %s", data)
                return None
            access_token = data.get("access_token")
            new_refresh_token = data.get("refresh_token")
            expires_in = int(data.get("expires_in", _AT_LIFETIME_SECONDS))
            if access_token and new_refresh_token:
                self.persist_tokens(access_token, new_refresh_token, oa_id=oa_id, at_expires_in=expires_in)
                return access_token, new_refresh_token
        except Exception as exc:
            logger.error("Exception during Zalo token refresh: %s", exc)
        return None

    def init_with_code(self, code: str, code_verifier: str, oa_id: Optional[str] = None) -> Optional[str]:
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "secret_key": self.secret_key,
        }
        payload = {
            "app_id": self.app_id,
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": code_verifier,
        }
        try:
            resp = requests.post(ZALO_AUTH_URL, headers=headers, data=payload, timeout=15)
            data = resp.json()
            if data.get("error", 0) != 0:
                logger.error("Zalo auth code exchange failed: %s", data)
                return None
            access_token = data.get("access_token")
            refresh_token = data.get("refresh_token")
            expires_in = int(data.get("expires_in", _AT_LIFETIME_SECONDS))
            if access_token and refresh_token:
                self.persist_tokens(access_token, refresh_token, oa_id=oa_id, at_expires_in=expires_in)
                return access_token
        except Exception as exc:
            logger.error("Exception during Zalo code exchange: %s", exc)
        return None


class ZaloService(object):
    """Service client for Zalo OA Customer Support APIs and multi-tenant webhook dispatch."""

    def __init__(self, app):
        self.app = app
        self._token_manager: Optional[ZaloTokenManager] = None

    @property
    def token_manager(self) -> ZaloTokenManager:
        if self._token_manager is None:
            app_id = str(self.app.config.get("ZALO_APP_ID") or "").strip()
            secret_key = str(self.app.config.get("ZALO_SECRET_KEY") or "").strip()
            self._token_manager = ZaloTokenManager(app_id=app_id, secret_key=secret_key)

            # Auto-seed initial tokens if configured in environment
            seed_at = str(self.app.config.get("ZALO_ACCESS_TOKEN") or "").strip()
            seed_rt = str(self.app.config.get("ZALO_REFRESH_TOKEN") or "").strip()
            seed_oa = str(self.app.config.get("ZALO_OA_ID") or "").strip()
            if seed_at or seed_rt:
                self._token_manager.seed_tokens_if_empty(
                    access_token=seed_at,
                    refresh_token=seed_rt,
                    oa_id=seed_oa or None,
                )
        return self._token_manager

    @property
    def enabled(self) -> bool:
        return bool(self.app.config.get("ZALO_APP_ID") and (self.app.config.get("ZALO_SECRET_KEY") or self.app.config.get("ZALO_ACCESS_TOKEN")))

    async def send_cs_message(
        self,
        user_id: str,
        message_text: str,
        oa_id: Optional[str] = None,
        attachment: Optional[Dict[str, Any]] = None,
        retry_on_token_error: bool = True,
    ) -> Dict[str, Any]:
        """Send a Customer Support message to a Zalo user via POST /v3.0/oa/message/cs."""
        token = self.token_manager.get_access_token(oa_id=oa_id)
        if not token:
            logger.error("Cannot send Zalo CS message: No valid access token for OA %s", oa_id)
            return {"success": False, "error_code": -1, "error_message": "Chưa có Access Token Zalo"}

        url = "{}/oa/message/cs".format(ZALO_OA_BASE_URL)
        headers = {
            "access_token": token,
            "Content-Type": "application/json",
        }

        msg_body: Dict[str, Any] = {}
        if message_text:
            msg_body["text"] = str(message_text)
        if attachment:
            msg_body["attachment"] = attachment

        payload = {
            "recipient": {
                "user_id": str(user_id),
            },
            "message": msg_body,
        }

        try:
            timeout = aiohttp.ClientTimeout(total=15)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(url, json=payload, headers=headers) as response:
                    data = await response.json(content_type=None)
                    error_code = data.get("error", -1)
                    if error_code == 0:
                        inner = data.get("data", {})
                        logger.info("Sent Zalo CS message to %s, msg_id=%s", user_id, inner.get("message_id"))
                        return {
                            "success": True,
                            "msg_id": inner.get("message_id"),
                            "error_code": 0,
                            "raw": data,
                        }

                    # Auto-refresh and retry on token error (-216: Invalid, -124: Expired)
                    if error_code in (-216, -124) and retry_on_token_error:
                        logger.warning("Zalo CS token invalid/expired [%s], invalidating and retrying...", error_code)
                        self.token_manager.invalidate_access_token(oa_id=oa_id)
                        return await self.send_cs_message(
                            user_id=user_id,
                            message_text=message_text,
                            oa_id=oa_id,
                            attachment=attachment,
                            retry_on_token_error=False,
                        )

                    logger.warning("Zalo CS message error [%s]: %s", error_code, data.get("message"))
                    return {
                        "success": False,
                        "error_code": error_code,
                        "error_message": data.get("message", "Lỗi gửi tin nhắn Zalo"),
                        "raw": data,
                    }
        except Exception as exc:
            logger.error("Exception sending Zalo CS message: %s", exc)
            return {"success": False, "error_code": -500, "error_message": str(exc)}

    async def get_user_profile(
        self,
        user_id: str,
        oa_id: Optional[str] = None,
        retry_on_token_error: bool = True,
    ) -> Optional[Dict[str, Any]]:
        """Get customer profile (display name, avatar) via GET /v3.0/oa/user/detail."""
        token = self.token_manager.get_access_token(oa_id=oa_id)
        if not token:
            return None

        url = "{}/oa/user/detail".format(ZALO_OA_BASE_URL)
        headers = {"access_token": token}
        params = {"data": json.dumps({"user_id": str(user_id)})}

        try:
            timeout = aiohttp.ClientTimeout(total=10)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url, params=params, headers=headers) as response:
                    data = await response.json(content_type=None)
                    error_code = data.get("error", -1)
                    if error_code == 0:
                        inner = data.get("data", {})
                        return {
                            "user_id": inner.get("user_id"),
                            "display_name": inner.get("display_name", "Khách Zalo"),
                            "avatar": inner.get("avatar", ""),
                        }

                    if error_code in (-216, -124) and retry_on_token_error:
                        logger.warning("Zalo user profile token expired [%s], invalidating and retrying...", error_code)
                        self.token_manager.invalidate_access_token(oa_id=oa_id)
                        return await self.get_user_profile(
                            user_id=user_id,
                            oa_id=oa_id,
                            retry_on_token_error=False,
                        )
        except Exception as exc:
            logger.warning("Failed to fetch Zalo user profile for %s: %s", user_id, exc)
        return None

    async def send_group_message(
        self,
        group_id: str,
        message_text: str,
        oa_id: Optional[str] = None,
        retry_on_token_error: bool = True,
    ) -> Dict[str, Any]:
        """Send message to a Zalo Group via POST /v3.0/oa/group/message."""
        token = self.token_manager.get_access_token(oa_id=oa_id)
        if not token:
            return {"success": False, "error_code": -1, "error_message": "Chưa có Access Token Zalo"}

        url = "{}/oa/group/message".format(ZALO_OA_BASE_URL)
        headers = {
            "access_token": token,
            "Content-Type": "application/json",
        }
        payload = {
            "recipient": {"group_id": str(group_id)},
            "message": {"text": str(message_text)},
        }
        try:
            timeout = aiohttp.ClientTimeout(total=15)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(url, json=payload, headers=headers) as response:
                    data = await response.json(content_type=None)
                    error_code = data.get("error", -1)
                    if error_code == 0:
                        return {"success": True, "msg_id": (data.get("data") or {}).get("message_id"), "error_code": 0}

                    if error_code in (-216, -124) and retry_on_token_error:
                        self.token_manager.invalidate_access_token(oa_id=oa_id)
                        return await self.send_group_message(
                            group_id=group_id,
                            message_text=message_text,
                            oa_id=oa_id,
                            retry_on_token_error=False,
                        )

                    return {"success": False, "error_code": error_code, "error_message": data.get("message")}
        except Exception as exc:
            return {"success": False, "error_code": -500, "error_message": str(exc)}

