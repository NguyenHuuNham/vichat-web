"""Wrapper singleton cho Zalo OA/ZNS. init_app(app) khoi tao ZaloTokenManager
tu config; send_zns() la ham ma nghiep vu goi de gui ZNS, tu ghi log sau moi
lan gui.

GO CHOT CHAN TEST THEO TUNG LUONG (2026-09-15, yeu cau nguoi dung "chuyển
sang gửi sđt thật, không dùng số hardcode nữa" - roi "còn phần trả kết quả/
hành trình khám vẫn gửi về số hardcode cho tôi"): send_zns() gio PHAN BIET
qua chinh `template_id` truyen vao (don gian hon them tham so rieng o moi
noi goi - yeu cau nguoi dung "if else template id ấy cho dễ"):
  (2026-09-22: co ZALO_KETQUA_GUI_SDT_THAT=True go han chot chan nay cho nhom
  Ket qua/Hanh trinh - xem send_zns.)
  - template_id THUOC nhom "Ket qua/Hanh trinh kham" (xem _TEMPLATE_IDS_
    HARDCODE_TEST ben duoi, doc tu CUNG cac config key ma share_journey_
    api.py::_send_zns_journey dung de chon template) -> VAN ep ve
    HARDCODED_TEST_PHONE (chua duoc phep gui that).
  - Moi template_id khac (nhac lich hen, gui test tay...) -> gui THANG ve
    SDT that cua ban ghi.
Cot `dienthoai` trong log LichSuZalo luon luu SDT goc; cot `dienthoai_
thuc_te_gui` luu dung SDT da thuc su goi qua API (giong `dienthoai` tru
truong hop bi ep ve so test o tren)."""
import logging
import time

from application.server import app
from application.controllers.helpers.helper_common import convert_text_khongdau
from application.models.model_zalo import LichSuZalo
from application.controllers.helpers.zaloUtils import (
    ZaloTokenManager,
    send_zns_message,
    ZNSResult,
    mask_phone_for_log,
    send_message_to_group,
)

logger = logging.getLogger(__name__)

HARDCODED_TEST_PHONE = "0866716632"


def _la_template_hanh_trinh_ket_qua(template_id) -> bool:
    """True neu template_id trung voi bat ky config nao trong chuoi
    fallback ma share_journey_api.py::_send_zns_journey dung de chon
    template "Kết quả/Hành trình khám" - CUNG danh sach fallback, chi
    doc lai config thay vi import cheo module (tranh vong lap import)."""
    ung_vien = (
        app.config.get("ZALO_TEMPLATE_ID_KETQUA"),
        app.config.get("ZALO_ZNS_TEMPLATE_JOURNEY"),
        app.config.get("ZALO_ZNS_TEMPLATE_ID"),
        "ZNS_TRA_CUU_HANH_TRINH_KCB",
    )
    return str(template_id) in {str(v) for v in ung_vien if v}

_manager: ZaloTokenManager = None


def init_app(app):
    """Khởi tạo Zalo client từ config ZALO_APP_ID."""
    global _manager
    app_id = app.config.get('ZALO_APP_ID', '')
    if app_id:
        _manager = ZaloTokenManager(app_id)
        logger.info("Zalo client initialized (APP_ID=%s)", app_id)
    else:
        logger.warning("Zalo client: ZALO_APP_ID chưa cấu hình, bỏ qua.")


def _write_log_zalo_zns(
    success, template_id, phone, template_data, mode,
    msg_id=None, sent_time=None, error_code=None, error_message=None,
    raw_response=None, donvi_id=None, donvi_ten=None, ho_ten=None,
    is_resend=False, phone_thuc_te_gui=None,
    doi_tuong_id=None, loai_doi_tuong=None,
):
    """Ghi 1 dòng vào bảng lichsu_zalo (PostgreSQL). Không ghi MongoDB —
    khoasan không dùng Mongo, bảng lichsu_zalo là nguồn duy nhất.

    phone_thuc_te_gui: SDT THAT SU da/se duoc goi qua API Zalo (hien luon
    la HARDCODED_TEST_PHONE) - KHAC voi `phone` (SDT GOC dinh le ra gui cua
    ban ghi). Yeu cau nguoi dung 2026-08-24: "LichSuZalo cần lưu số thực
    sự gửi vào".
    """
    from application.database import db
    from application.controllers.helpers.helper_common import convert_timestamp_to_string
    from application.models.model_zalo import LichSuZalo, default_uuid

    time_str = convert_timestamp_to_string(time.time(), "%Y%m%d%H%M%S")
    try:
        lichsu = LichSuZalo()
        lichsu.id = default_uuid()
        lichsu.ho_ten = ho_ten
        if ho_ten:
            lichsu.tenkhongdau = convert_text_khongdau(ho_ten)
        lichsu.dienthoai = phone
        lichsu.dienthoai_thuc_te_gui = phone_thuc_te_gui
        lichsu.template_id = template_id
        lichsu.noidung_gui = template_data
        lichsu.noidung_phan_hoi = raw_response
        lichsu.trang_thai = 1 if success else 0
        lichsu.donvi_id = donvi_id
        lichsu.donvi_ten = donvi_ten
        lichsu.thoigian_gui = time_str
        lichsu.is_resend = is_resend
        lichsu.doi_tuong_id = doi_tuong_id
        lichsu.loai_doi_tuong = loai_doi_tuong
        if success:
            lichsu.msg_id = msg_id
            lichsu.error_code = 0
        else:
            lichsu.error_code = error_code
            lichsu.error_message = error_message
        db.session.add(lichsu)
        db.session.commit()
    except Exception as exc:
        logger.error("Error _write_log_zalo_zns: %s", exc)
        db.session.rollback()


def ghi_log_bo_qua_gui(template_id, ly_do, ho_ten=None, doi_tuong_id=None, loai_doi_tuong=None):
    """Ghi 1 dong LichSuZalo cho truong hop KHONG GOI duoc API Zalo (vd
    thieu SDT) - de tin tong hop van doc duoc LY DO qua doi_tuong_id/
    loai_doi_tuong, khong bi lac vao nhom "chua thu gui" (2026-09-22)."""
    _write_log_zalo_zns(
        success=False, template_id=template_id, phone="", template_data=None,
        mode="production", error_code=-1, error_message=ly_do,
        ho_ten=ho_ten, phone_thuc_te_gui="",
        doi_tuong_id=doi_tuong_id, loai_doi_tuong=loai_doi_tuong,
    )


async def send_zns(phone: str, template_id: str, template_data: dict,
                   tracking_id=None, mode="production",
                   donvi_id=None, donvi_ten=None, ho_ten=None, is_resend=False,
                   doi_tuong_id=None, loai_doi_tuong=None) -> ZNSResult:
    """Gửi ZNS template message tới bệnh nhân.

    Gui SDT that hay so test do CHINH template_id quyet dinh - xem
    _la_template_hanh_trinh_ket_qua() o tren."""
    phone_goc = phone
    phone_masked = mask_phone_for_log(phone_goc)
    # 2026-09-22: luong Ket qua/Hanh trinh chi gui SDT THAT khi bat co
    # ZALO_KETQUA_GUI_SDT_THAT=True (config rieng tren server, mac dinh False =
    # van ep ve so test nhu cu). Bat co nay + TRAKETQUA_ZALO_ENABLED thi ca gui
    # tu dong lan gui tay deu toi dung SDT benh nhan.
    gui_sdt_that_ketqua = bool(app.config.get("ZALO_KETQUA_GUI_SDT_THAT", False))
    ep_so_test = _la_template_hanh_trinh_ket_qua(template_id) and not gui_sdt_that_ketqua
    phone_to_send = HARDCODED_TEST_PHONE if ep_so_test else phone_goc

    if _manager is None:
        msg = "Zalo chưa được cấu hình"
        logger.error("Zalo client chưa được khởi tạo.")
        _write_log_zalo_zns(
            success=False, template_id=template_id, phone=phone_goc,
            template_data=template_data, mode=mode,
            error_code=-1, error_message=msg,
            donvi_id=donvi_id, donvi_ten=donvi_ten, ho_ten=ho_ten,
            is_resend=is_resend, phone_thuc_te_gui=phone_to_send,
            doi_tuong_id=doi_tuong_id, loai_doi_tuong=loai_doi_tuong,
        )
        return ZNSResult(success=False, error_code=-1, error_message=msg)

    token = _manager.get_access_token()
    if token is None:
        msg = "Không thể lấy token ZNS."
        logger.error("Zalo client: %s", msg)
        _write_log_zalo_zns(
            success=False, template_id=template_id, phone=phone_goc,
            template_data=template_data, mode=mode,
            error_code=-1, error_message=msg,
            donvi_id=donvi_id, donvi_ten=donvi_ten, ho_ten=ho_ten,
            is_resend=is_resend, phone_thuc_te_gui=phone_to_send,
            doi_tuong_id=doi_tuong_id, loai_doi_tuong=loai_doi_tuong,
        )
        return ZNSResult(success=False, error_code=-1, error_message=msg)

    result = send_zns_message(token, phone_to_send, template_id, template_data, tracking_id, mode)
    _write_log_zalo_zns(
        success=result.success, template_id=template_id, phone=phone_goc,
        template_data=template_data, mode=mode,
        msg_id=result.msg_id, sent_time=result.sent_time,
        error_code=result.error_code, error_message=result.error_message,
        raw_response=result.raw,
        donvi_id=donvi_id, donvi_ten=donvi_ten, ho_ten=ho_ten,
        is_resend=is_resend, phone_thuc_te_gui=phone_to_send,
        doi_tuong_id=doi_tuong_id, loai_doi_tuong=loai_doi_tuong,
    )
    return result


async def send_zaloa_to_group(group_id: str, group_name: str, message: str, donvi_id=None, donvi_ten=None, mode="production") -> ZNSResult:
    """Gửi tin nhắn tới nhóm Zalo bằng ID nhóm."""
    token = _manager.get_access_token()
    if token is None:
        msg = "Không thể lấy token ZNS."
        logger.error("Zalo client: %s", msg)
        _write_log_zalo_zns(
            success=False, template_id=group_id, phone="",
            template_data=message, mode=mode,
            error_code=-1, error_message=msg,
            donvi_id=donvi_id, donvi_ten=donvi_ten, ho_ten=group_name,
            is_resend=False, phone_thuc_te_gui="",
            doi_tuong_id=100, loai_doi_tuong=LichSuZalo.LOAI_DOI_TUONG.GROUP,
        )
        return ZNSResult(success=False, error_code=-1, error_message=msg)
    result = send_message_to_group(access_token=token, group_id=group_id, message=message)
    _write_log_zalo_zns(
        success=result.success, template_id=group_id, phone="",
        template_data=message, mode=mode,
        msg_id=result.msg_id, sent_time=result.sent_time,
        error_code=result.error_code, error_message=result.error_message,
        raw_response=result.raw,
        donvi_id=donvi_id, donvi_ten=donvi_ten, ho_ten=group_name,
        doi_tuong_id=100, loai_doi_tuong=LichSuZalo.LOAI_DOI_TUONG.GROUP,
    )
    return result