"""
Zalo OA - ZNS Template Message Integration
Dua tren tai lieu chinh thuc: https://developers.zalo.me/docs/official-account
Verified theo OAuth v4 + business.openapi.zalo.me endpoint
"""

import json
import time
import base64
import hashlib
import secrets
import logging
import requests
from enum import Enum
from typing import Optional
from dataclasses import dataclass, field
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from application.server import app
from application.database import redisdb
from application.controllers.helpers.TelegramClient import send_telegram_message

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


# ============================================================
# CONSTANTS
# ============================================================

ZALO_AUTH_URL     = "https://oauth.zaloapp.com/v4/oa/access_token"
ZALO_ZNS_BASE_URL = "https://business.openapi.zalo.me"
ZALO_OA_BASE_URL  = "https://openapi.zalo.me/v3.0"

# Access token: Zalo cap 1 gio, buffer 5 phut de refresh som.
_AT_LIFETIME_SECONDS = 3600
_AT_BUFFER_SECONDS   = 300

# Refresh token: Zalo cap 90 ngay, buffer 7 ngay de canh bao som.
_RT_LIFETIME_SECONDS = 90 * 24 * 3600   # 7,776,000 s
_RT_BUFFER_SECONDS   = 7  * 24 * 3600   # 604,800 s

# Redis key schema:
#   zalo:at:<app_id>  ->  {"token": "...", "expires_at": <unix_float>}
#   zalo:rt:<app_id>  ->  {"token": "...", "expires_at": <unix_float>}
#
# Redis TTL cua key = (thoi gian con lai den expires_at) + _REDIS_GRACE_SECONDS.
# Viec them grace period cho phep phan biet:
#   - Key ton tai + expires_at chua qua  =>  VALID
#   - Key ton tai + expires_at da qua    =>  EXPIRED   (key van con trong ~30s)
#   - Key khong ton tai                  =>  MISSING

_REDIS_GRACE_SECONDS = 30


# ============================================================
# TOKEN STATE
# ============================================================

class TokenState(Enum):
    """
    3 trang thai cua moi loai token.

    VALID   - con han, dung duoc
    EXPIRED - het han, can xu ly (AT -> refresh bang RT; RT -> OAuth PKCE lai)
    MISSING - chua bao gio co hoac bi xoa khoi Redis
    """
    VALID   = "valid"
    EXPIRED = "expired"
    MISSING = "missing"


@dataclass
class TokenEntry:
    """Mot token kem thoi diem het han tuyet doi (Unix timestamp)."""
    token: str
    expires_at: float
    buffer_seconds: float = 0

    @property
    def state(self) -> TokenState:
        if time.time() < (self.expires_at - self.buffer_seconds):
            return TokenState.VALID
        return TokenState.EXPIRED

    @property
    def is_valid(self) -> bool:
        return self.state == TokenState.VALID

    @property
    def seconds_remaining(self) -> float:
        """So giay con lai (am neu da expired)."""
        return self.expires_at - time.time()

    def to_redis_payload(self) -> str:
        return json.dumps({"token": self.token, "expires_at": self.expires_at})

    @classmethod
    def from_redis_payload(
        cls, raw: "bytes | str", buffer_seconds: float = 0
    ) -> "TokenEntry":
        data = json.loads(raw.decode() if isinstance(raw, bytes) else raw)
        return cls(
            token=data["token"],
            expires_at=data["expires_at"],
            buffer_seconds=buffer_seconds,
        )


@dataclass
class ZNSResult:
    success: bool
    msg_id: Optional[str] = None
    sent_time: Optional[str] = None
    error_code: Optional[int] = None
    error_message: Optional[str] = None
    raw: Optional[dict] = None


# ============================================================
# HTTP SESSION WITH RETRY
# ============================================================

def _build_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=0.5,
        status_forcelist=(500, 502, 503, 504),
        allowed_methods={"GET", "POST"},
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


_SESSION = _build_session()


# ============================================================
# PKCE HELPERS
# ============================================================

def generate_code_verifier() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode("ascii")


def generate_code_challenge(code_verifier: str) -> str:
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def build_authorization_url(
    app_id: str,
    redirect_uri: str,
    code_challenge: str,
    state: str = "",
) -> str:
    return (
        "https://oauth.zaloapp.com/v4/oa/permission"
        f"?app_id={app_id}"
        f"&redirect_uri={redirect_uri}"
        f"&code_challenge={code_challenge}"
        f"&state={state}"
    )


# ============================================================
# LOW-LEVEL TOKEN EXCHANGE
# ============================================================

def _post_token(payload: dict) -> "tuple[TokenEntry, TokenEntry]":
    """
    POST len Zalo Auth, tra ve (access_entry, refresh_entry).
    Raises ValueError neu Zalo tra ve loi.
    """
    SECRET_KEY = app.config.get("ZALO_SECRET_KEY")
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "secret_key": SECRET_KEY,
    }
    resp = _SESSION.post(ZALO_AUTH_URL, headers=headers, data=payload, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    print("_post_token response===", data)
    if data.get("error", 0) != 0:
        raise ValueError(
            f"Zalo token error [{data.get('error')}]: {data.get('message', 'unknown')}"
        )

    now = time.time()
    at_expires_in = int(data.get("expires_in", _AT_LIFETIME_SECONDS))

    access_entry = TokenEntry(
        token=data["access_token"],
        expires_at=now + at_expires_in,
        buffer_seconds=_AT_BUFFER_SECONDS,
    )
    # Zalo khong tra ve expires_in cua refresh_token -> dung hang so 90 ngay.
    refresh_entry = TokenEntry(
        token=data["refresh_token"],
        expires_at=now + _RT_LIFETIME_SECONDS,
        buffer_seconds=_RT_BUFFER_SECONDS,
    )
    return access_entry, refresh_entry


def get_access_token_by_code(
    app_id: str, code: str, code_verifier: str
) -> "tuple[TokenEntry, TokenEntry]":
    """goi authorization_code lay access + refresh token (goi 1 lan duy nhat)."""
    return _post_token({
        "app_id": app_id,
        "grant_type": "authorization_code",
        "code": code,
        "code_verifier": code_verifier,
    })


def refresh_access_token(
    app_id: str, refresh_token: str
) -> "tuple[TokenEntry, TokenEntry]":
    """
    Dung refresh_token lay cap token moi.
    Refresh token la single-use: luon luu lai refresh_token moi duoc tra ve.
    """
    return _post_token({
        "app_id": app_id,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    })


# ============================================================
# TOKEN MANAGER
# ============================================================

class ZaloTokenManager:
    """
    Quan ly vong doi token cho mot Zalo OA App.

    Redis schema:
        zalo:at:<app_id>  ->  {"token": "...", "expires_at": 1234567890.0}
        zalo:rt:<app_id>  ->  {"token": "...", "expires_at": 1234567890.0}

    Moi key co TTL = (thoi gian con lai) + 30s grace.
    Grace period cho phep phan biet EXPIRED vs MISSING:

        expires_at    | key ton tai  | => STATE
        ------------- | ------------ | --------
        chua qua      | yes          | VALID
        da qua        | yes (30s)    | EXPIRED
        da qua > 30s  | no           | MISSING

    Luong get_access_token():

        AT VALID                        -> tra ve ngay (happy path)
        AT EXPIRED/MISSING + RT VALID   -> refresh, persist cap moi, tra ve AT moi
        AT EXPIRED/MISSING + RT EXPIRED -> canh bao admin, tra ve None (can OAuth lai)
        AT EXPIRED/MISSING + RT MISSING -> canh bao admin, tra ve None (chua init)
    """

    def __init__(self, app_id: str):
        self.app_id = app_id
        self._at_key = f"zalo:at:{app_id}"
        self._rt_key = f"zalo:rt:{app_id}"

    # ------------------------------------------------------------------
    # Redis I/O
    # ------------------------------------------------------------------

    def _read(
        self, key: str, buffer: float
    ) -> "tuple[TokenState, Optional[TokenEntry]]":
        """
        Doc TokenEntry tu Redis.
        Tra ve (TokenState, TokenEntry | None).
        """
        raw = redisdb.get(key)
        if raw is None:
            return TokenState.MISSING, None
        try:
            entry = TokenEntry.from_redis_payload(raw, buffer_seconds=buffer)
            return entry.state, entry
        except Exception as exc:
            logger.warning("Corrupt token payload at key=%s: %s", key, exc)
            return TokenState.MISSING, None

    def _write(self, key: str, entry: TokenEntry) -> None:
        """
        Luu TokenEntry vao Redis.
        TTL = thoi gian con lai den expires_at + _REDIS_GRACE_SECONDS.
        """
        ttl = max(int(entry.seconds_remaining) + _REDIS_GRACE_SECONDS, 1)
        redisdb.setex(key, ttl, entry.to_redis_payload())

    def _delete(self, key: str) -> None:
        redisdb.delete(key)

    def _persist_pair(self, access: TokenEntry, refresh: TokenEntry) -> None:
        self._write(self._at_key, access)
        self._write(self._rt_key, refresh)
        logger.info(
            "Tokens persisted | app_id=%s | AT=%.0fs | RT=%.0fs",
            self.app_id, access.seconds_remaining, refresh.seconds_remaining,
        )

    # ------------------------------------------------------------------
    # Monitoring
    # ------------------------------------------------------------------

    def get_token_states(self) -> dict:
        """
        Tra ve trang thai hien tai cua ca 2 loai token.
        Dung cho healthcheck / dashboard.

        Returns:
            {
                "access_token":  {"state": "valid|expired|missing", "seconds_remaining": float|None},
                "refresh_token": {"state": "valid|expired|missing", "seconds_remaining": float|None},
            }
        """
        at_state, at_entry = self._read(self._at_key, _AT_BUFFER_SECONDS)
        rt_state, rt_entry = self._read(self._rt_key, _RT_BUFFER_SECONDS)
        return {
            "access_token": {
                "state": at_state.value,
                "seconds_remaining": (
                    round(at_entry.seconds_remaining, 1) if at_entry else None
                ),
            },
            "refresh_token": {
                "state": rt_state.value,
                "seconds_remaining": (
                    round(rt_entry.seconds_remaining, 1) if rt_entry else None
                ),
            },
        }

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------

    def init_with_code(self, code: str, code_verifier: str) -> Optional[str]:
        """Goi 1 lan duy nhat sau khi admin OA cap quyen qua OAuth PKCE."""
        try:
            print("code_verifier===", code_verifier)
            print("code===", code)
            print("self.app_id===", self.app_id)
            access, refresh = get_access_token_by_code(self.app_id, code, code_verifier)
            self._persist_pair(access, refresh)
            logger.info("Token initialised for app_id=%s", self.app_id)
            return access.token
        except Exception as exc:
            logger.error("init_with_code failed for app_id=%s: %s", self.app_id, exc)
            send_telegram_message(f"[ZaloOA] init_with_code that bai: {exc}")
            return None

    def set_token(
        self,
        access_token: str,
        refresh_token: str,
        access_expires_in: int = _AT_LIFETIME_SECONDS,
        refresh_expires_in: int = _RT_LIFETIME_SECONDS,
    ) -> None:
        """Set token thu cong (migration tu storage cu)."""
        now = time.time()
        access  = TokenEntry(access_token,  now + access_expires_in,  _AT_BUFFER_SECONDS)
        refresh = TokenEntry(refresh_token, now + refresh_expires_in, _RT_BUFFER_SECONDS)
        self._persist_pair(access, refresh)
        logger.info("Token set manually for app_id=%s", self.app_id)

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    def get_access_token(self) -> Optional[str]:
        """
        Tra ve access_token hop le. Tu dong refresh neu can.

        Luong xu ly theo 4 truong hop chinh:
            AT VALID                      -> tra ve ngay
            AT EXPIRED + RT VALID         -> refresh
            AT MISSING + RT VALID         -> refresh (AT bi mat khoi Redis)
            AT */MISSING + RT EXPIRED     -> None + alert (can OAuth PKCE lai)
            AT */MISSING + RT MISSING     -> None + alert (chua init)
        """
        at_state, at_entry = self._read(self._at_key, _AT_BUFFER_SECONDS)

        # ---- happy path ----
        if at_state == TokenState.VALID:
            return at_entry.token

        # ---- AT het han hoac mat -> kiem tra RT ----
        rt_state, rt_entry = self._read(self._rt_key, _RT_BUFFER_SECONDS)

        if rt_state == TokenState.MISSING:
            logger.error(
                "app_id=%s | AT=%s, RT=MISSING — chua init. Goi init_with_code().",
                self.app_id, at_state.value,
            )
            send_telegram_message(
                f"[ZaloOA] app_id={self.app_id}: AT={at_state.value}, RT=MISSING. "
                "Can chay lai OAuth PKCE."
            )
            return None

        if rt_state == TokenState.EXPIRED:
            rt_ago = abs(rt_entry.seconds_remaining)
            logger.error(
                "app_id=%s | AT=%s, RT=EXPIRED (%.0f giay truoc) — can OAuth PKCE lai.",
                self.app_id, at_state.value, rt_ago,
            )
            send_telegram_message(
                f"[ZaloOA] app_id={self.app_id}: AT={at_state.value}, RT=EXPIRED "
                f"(het han {rt_ago:.0f}s truoc). Can cap lai quyen OAuth PKCE."
            )
            return None

        # ---- RT VALID -> refresh ----
        logger.info(
            "app_id=%s | AT=%s -> refreshing voi RT (con %.0f giay).",
            self.app_id, at_state.value, rt_entry.seconds_remaining,
        )
        try:
            new_access, new_refresh = refresh_access_token(self.app_id, rt_entry.token)
            self._persist_pair(new_access, new_refresh)
            logger.info("Token refreshed for app_id=%s", self.app_id)
            return new_access.token
        except Exception as exc:
            logger.error("Refresh failed for app_id=%s: %s", self.app_id, exc)
            # Chi xoa AT, giu RT de lan sau retry.
            self._delete(self._at_key)
            send_telegram_message(
                f"[ZaloOA] app_id={self.app_id}: refresh that bai — {exc} ---app_id---{self.app_id} ---rt_entry.token---{rt_entry.token}"
            )
            return None


# ============================================================
# CALLBACK HANDLER
# ============================================================

def process_callback_zaloOA(code: str, oa_id: str) -> Optional[str]:
    print("APP_ID===", app.config.get("ZALO_APP_ID"))
    APP_ID = app.config.get("ZALO_APP_ID")
    ZALO_CODE_VERIFIER = app.config.get("ZALO_CODE_VERIFIER")
    manager = ZaloTokenManager(APP_ID)
    return manager.init_with_code(code, ZALO_CODE_VERIFIER)

def validate_phone_vn(phone: str) -> bool:
    """
    Số di động VN hợp lệ: sau khi bỏ tiền tố "0" hoặc "84", phần còn lại phải có
    đúng 9 chữ số với chữ số đầu thuộc {3,5,7,8,9} (đầu số 03x/05x/07x/08x/09x).
    Loại số bàn (đầu 02x) và số sai độ dài.
    """
    if phone is None or phone == "":
        return False

    if phone.startswith("84"):
        so_thuan = phone[2:]
    elif phone.startswith("0"):
        so_thuan = phone[1:]
    else:
        return False

    if not so_thuan.isdigit() or len(so_thuan) != 9:
        return False

    return so_thuan[0] in ("3", "5", "7", "8", "9")


# Mã lỗi Zalo ZNS coi là vĩnh viễn (không tự khỏi theo thời gian): số không hợp lệ
# hoặc số đó không có tài khoản Zalo. Không gồm lỗi mạng/hệ thống có thể tạm thời.
ZALO_PERMANENT_ERROR_CODES = (-108, -118)
ZALO_PERMANENT_ERROR_WINDOW_DAYS = 14


def _cac_dang_dienthoai(phone: str) -> list:
    """
    Sinh ra các biến thể định dạng số điện thoại (dạng "0xxx" và "84xxx") để so khớp
    với lichsu_zalo.dienthoai — dữ liệu lịch sử đang lưu lẫn cả 2 định dạng tùy nguồn
    ghi (send_zns_message tự chuẩn hóa 0->84, nhưng phone gốc truyền vào có thể là
    dạng nào cũng được), nên phải dò cả 2 dạng mới không bỏ sót lịch sử lỗi cũ.
    """
    if not phone:
        return []
    p = phone.strip().replace(" ", "").replace("-", "").replace("+", "")
    dang_84 = _normalize_phone(p)
    if dang_84.startswith("84"):
        dang_0 = "0" + dang_84[2:]
    else:
        dang_0 = p
    return list({p, dang_84, dang_0})


def has_recent_zalo_failure(phone: str, within_days: int = ZALO_PERMANENT_ERROR_WINDOW_DAYS) -> bool:
    """
    Trả True nếu `phone` đã từng gặp lỗi Zalo vĩnh viễn (ZALO_PERMANENT_ERROR_CODES)
    và lần lỗi gần nhất còn nằm trong vòng `within_days` ngày kể từ hiện tại.
    Dùng để tránh gọi lại API Zalo cho số chắc chắn sẽ lỗi y hệt lần trước
    (ví dụ khi phiếu khám được ký lại nhiều lần).
    """
    cac_dang = _cac_dang_dienthoai(phone)
    if not cac_dang:
        return False

    from datetime import date, timedelta
    from application.database import db
    from application.models.model_zalo import LichSuZalo

    row = db.session.query(LichSuZalo.thoigian_gui).filter(
        LichSuZalo.dienthoai.in_(cac_dang),
        LichSuZalo.error_code.in_(ZALO_PERMANENT_ERROR_CODES),
        LichSuZalo.deleted == False,
    ).order_by(LichSuZalo.thoigian_gui.desc()).first()

    if row is None or not row.thoigian_gui or len(row.thoigian_gui) < 8:
        return False

    try:
        ngay_loi = date(
            int(row.thoigian_gui[0:4]),
            int(row.thoigian_gui[4:6]),
            int(row.thoigian_gui[6:8]),
        )
    except (ValueError, TypeError):
        return False

    han_chan = date.today() - timedelta(days=within_days)
    return ngay_loi >= han_chan
# ============================================================
# ZNS — SEND TEMPLATE MESSAGE
# ============================================================

def send_zns_message(
    access_token: str,
    phone: str,
    template_id: str,
    template_data: dict,
    tracking_id: Optional[str] = None,
    mode: str = "development",
) -> ZNSResult:
    phone_goc = phone
    phone = _normalize_phone(phone)
    payload: dict = {
        "phone": phone,
        "template_id": template_id,
        "template_data": template_data,
        "mode": mode,
    }
    if tracking_id:
        payload["tracking_id"] = tracking_id[:50]

    if (validate_phone_vn(phone) == False):
        send_telegram_message(f"Số điện thoại không hợp lệ phone={phone_goc} template_id={template_id}")
        return ZNSResult(success=False, error_code=-1, error_message=f"Số điện thoại không hợp lệ phone={phone_goc}")

    # has_recent_zalo_failure tự dò cả 2 định dạng "0xxx"/"84xxx" nên truyền phone_goc
    # hay phone (đã normalize) đều cho kết quả như nhau; dùng phone_goc để rõ ý định.
    if has_recent_zalo_failure(phone_goc):
        msg = f"Số điện thoại từng lỗi ZNS vĩnh viễn trong {ZALO_PERMANENT_ERROR_WINDOW_DAYS} ngày qua, bỏ qua gửi lại phone={phone}"
        logger.warning(msg)
        return ZNSResult(success=False, error_code=-1, error_message=msg)
    try:
        resp = _SESSION.post(
            f"{ZALO_ZNS_BASE_URL}/message/template",
            headers={"Content-Type": "application/json", "access_token": access_token},
            json=payload,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as exc:
        logger.error("ZNS request error phone=%s: %s", mask_phone_for_log(phone), exc)
        send_telegram_message(f"ZNS request that bai: {exc} phone={phone} payload={payload}")
        return ZNSResult(success=False, error_code=-1, error_message=str(exc))

    error_code = data.get("error", -1)
    if error_code != 0:
        msg = data.get("message", "Unknown error")
        logger.error(
            "ZNS error [%s]: %s | phone=%s template_id=%s",
            error_code, msg, mask_phone_for_log(phone), template_id,
        )
        send_telegram_message(
            f"ZNS gui that bai [{error_code}]: {msg} data={data}"
        )
        return ZNSResult(success=False, error_code=error_code, error_message=msg, raw=data)

    inner = data.get("data", {})
    logger.info(
        "ZNS OK | phone=%s template_id=%s mode=%s msg_id=%s",
        mask_phone_for_log(phone), template_id, mode, inner.get("msg_id"),
    )
    return ZNSResult(
        success=True,
        msg_id=inner.get("msg_id"),
        sent_time=inner.get("sent_time"),
        raw=data,
    )


# ============================================================
# ZNS — BATCH SEND
# ============================================================

def send_zns_batch(
    token_manager: ZaloTokenManager,
    recipients: list,
    template_id: str,
    mode: str = "production",
    delay_seconds: float = 0.3,
) -> list:
    results = []
    total = len(recipients)

    for idx, r in enumerate(recipients, 1):
        phone = r.get("phone", "")
        access_token = token_manager.get_access_token()

        if access_token is None:
            results.append({
                "index": idx, "phone": phone,
                "success": False, "error_code": -1,
                "error_message": "No valid access token",
            })
            logger.error("[%d/%d] Skipped %s — no access token", idx, total, phone)
            if idx < total:
                time.sleep(delay_seconds)
            continue

        result = send_zns_message(
            access_token=access_token,
            phone=phone,
            template_id=template_id,
            template_data=r.get("template_data", {}),
            tracking_id=r.get("tracking_id"),
            mode=mode,
        )
        results.append({
            "index": idx, "phone": phone,
            "success": result.success,
            "msg_id": result.msg_id,
            "error_code": result.error_code,
            "error_message": result.error_message,
        })
        logger.info(
            "[%d/%d] %s | %s | %s",
            idx, total, "OK" if result.success else "FAIL", phone,
            f"msg_id={result.msg_id}" if result.success else result.error_message,
        )
        if idx < total:
            time.sleep(delay_seconds)

    success_count = sum(1 for r in results if r["success"])
    logger.info("Batch complete: %d/%d succeeded.", success_count, total)
    return results



# ============================================================
# ZNS — SEND MESSAGE To Group by group id
# ============================================================

def send_message_to_group(
    access_token: str,
    group_id: str,
    message: str,
) -> ZNSResult:
    payload: dict = {
        "recipient": {
            "group_id": group_id
        },
        "message": {
            "text": message, #     "text": "hello [@186729651760683225] and [@7967320986128691935] from GroupAPI"
            # "attachment": {
            #     "type": "file",
            #     "payload": {
            #         "token": "12i8LV3BcmmDS4iLfyoU3qKxHXNtpu077ZjA7xRHmmi8EXrEjuR50LHjJXJWWvTQ17OJ7R2Oc5q4SHSJjPoPKmDq5X2tyS4MI78oKexCna1CUJnQyiMvUKmfG7UOX8PYVW5FJAckbWbi1tWbj8BnCNOyTGMBr8mrG5XZ4epkfbD4HczzjUs3FM0QL1ZM"
            #     }
            # },
            # "attachment": {
            # "type": "template",
            # "payload": {
            #     "template_type": "media",
            #     "elements": [
            #         {
            #             "media_type": "image",
            #             "url": "https://stc-developers.zdn.vn/images/bg_1.jpg"
            #         }
            #     ]
            # }
        }
    }
    try:
        resp = _SESSION.post(
            f"{ZALO_OA_BASE_URL}/oa/group/message",
            headers={"Content-Type": "application/json", "access_token": access_token},
            json=payload,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as exc:
        logger.error("ZNS request error group_id=%s: %s", group_id, exc)
        send_telegram_message(f"ZNS request that bai: {exc} group_id={group_id} payload={payload}")
        return ZNSResult(success=False, error_code=-1, error_message=str(exc))

    error_code = data.get("error", -1)
    if error_code != 0:
        msg = data.get("message", "Unknown error")
        logger.error(
            "ZNS error [%s]: %s | group_id=%s",
            error_code, msg, group_id,
        )
        send_telegram_message(
            f"ZNS gui that bai [{error_code}]: {msg} data={data}"
        )
        return ZNSResult(success=False, error_code=error_code, error_message=msg, raw=data)

    inner = data.get("data", {})
    logger.info(
        "ZNS OK | group_id=%s msg_id=%s",
        group_id, inner.get("msg_id"),
    )
    return ZNSResult(
        success=True,
        msg_id=inner.get("msg_id"),
        sent_time=inner.get("sent_time"),
        raw=data,
    )

# ============================================================
# QUERY HELPERS
# ============================================================

def get_message_status(access_token: str, msg_id: str, phone: str) -> dict:
    resp = _SESSION.get(
        f"{ZALO_ZNS_BASE_URL}/message/status",
        headers={"access_token": access_token},
        params={"msg_id": msg_id, "phone": _normalize_phone(phone)},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def get_template_info(access_token: str, template_id: str) -> dict:
    resp = _SESSION.get(
        f"{ZALO_ZNS_BASE_URL}/template/info",
        headers={"access_token": access_token},
        params={"template_id": template_id},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def list_templates(access_token: str, offset: int = 0, limit: int = 10) -> dict:
    resp = _SESSION.get(
        f"{ZALO_ZNS_BASE_URL}/template/list",
        headers={"access_token": access_token},
        params={"offset": offset, "limit": min(limit, 100)},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def get_quota(access_token: str) -> dict:
    resp = _SESSION.get(
        f"{ZALO_ZNS_BASE_URL}/message/quota",
        headers={"access_token": access_token},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


# ============================================================
# UTILITIES
# ============================================================

def _normalize_phone(phone: str) -> str:
    phone = phone.strip().replace(" ", "").replace("-", "").replace("+", "")
    if phone.startswith("84"):
        return phone
    if phone.startswith("0"):
        return "84" + phone[1:]
    return "84" + phone


def mask_phone_for_log(phone: str) -> str:
    p = _normalize_phone(phone) if phone else ""
    if len(p) < 6:
        return "***"
    return p[:2] + "*" * (len(p) - 5) + p[-3:]


# ============================================================
# ERROR CODES REFERENCE
# ============================================================

ZNS_ERROR_CODES = {
    0:    "Thanh cong",
    -100: "Loi khong xac dinh",
    -101: "App khong hop le",
    -102: "OA khong ton tai hoac chua lien ket App",
    -103: "Access token khong hop le hoac het han",
    -104: "Khong du quyen",
    -108: "So dien thoai khong hop le",
    -109: "Template khong ton tai hoac chua duoc duyet",
    -110: "Thieu tham so bat buoc",
    -111: "Template data khong hop le",
    -115: "Het quota ZNS",
    -124: "Access token khong hop le",
    -144: "Vuot qua gioi han gui trong ngay",
    -200: "Loi he thong Zalo",
}
