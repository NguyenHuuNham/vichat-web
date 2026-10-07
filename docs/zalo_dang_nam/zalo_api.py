from application.controllers.helpers.helper_common import generate_stt
"""Route Zalo OA/ZNS: callback OAuth PKCE (public, mot lan) + API admin
(send_test/resend/stats, can dang nhap). Khong gan voi nghiep vu cu the nao
cua khoasan o giai doan nay - chi ha tang gui/test ZNS.
"""
from application.server import app
from application.database import db
from gatco.response import json, text
from application.extensions import apimanager
from application.controllers.helpers.helper_decorator import validate_authen
from application.controllers.helpers.zaloUtils import process_callback_zaloOA
from application.models.model_zalo import LichSuZalo
from application.permission_kit.decorators import require_permission
from application.permission_kit.helper import check_permission
from application.extensions import zalo_client
from datetime import datetime


@app.route('/zalo/callback', methods=['GET'])
async def zalo_callback(request):
    code = request.args.get('code')
    oa_id = request.args.get('oa_id')
    result = process_callback_zaloOA(code, oa_id)
    if result is not None:
        return text("Success", status=200)
    return text("Failed", status=500)


@app.route('/api/v1/zalo/send_test', methods=['POST'])
@validate_authen(authen=True)
async def zalo_send_test(request, currentUser):
    """Gui thu 1 tin ZNS tuy y de test tay (khong gan nghiep vu cu the).
    Body: {"phone": "...", "template_id": "...", "template_data": {...}}
    Ton trong ZALO_APP_MODE hien tai (test se tu redirect ve ZALO_TEST_PHONE).
    """
    from application.extensions import zalo_client

    data = request.json or {}
    phone = data.get('phone')
    template_id = data.get('template_id')
    template_data = data.get('template_data') or {}

    if not phone or not template_id:
        return json({'code': 'PARAM_ERROR', 'message': 'Thiếu phone hoặc template_id'}, status=400)

    result = await zalo_client.send_zns(
        phone=phone,
        template_id=template_id,
        template_data=template_data,
        ho_ten=currentUser.fullname if currentUser else None,
    )

    if result.success:
        return json({'code': 'OK', 'message': 'Gửi thành công', 'msg_id': result.msg_id}, status=200)
    return json({'code': 'ERROR', 'message': result.error_message or 'Gửi thất bại', 'error_code': result.error_code}, status=200)


@app.route('/api/v1/zalo/send_test_group', methods=['GET'])
async def zalo_send_test_group(request):
    """Gui thu 1 tin ZNS tuy y de test tay (khong gan nghiep vu cu the).
    Body: {"phone": "...", "template_id": "...", "template_data": {...}}
    Ton trong ZALO_APP_MODE hien tai (test se tu redirect ve ZALO_TEST_PHONE).
    """
    str_time_check = datetime.now().strftime("%Y%m%d%H%M")#202609131000
    pwd = "namdv_" + str_time_check
    group_id = request.args.get('group_id')# 2e09d98260ee89b0d0ff khoa san yeu cau nhom tb01
    message = request.args.get('message')
    password = request.args.get('password')
    if password is not None and len(password) < 14:
        return json({'code': 'PARAM_ERROR', 'message': 'Mật khẩu không hợp lệ'}, status=400)
    else:
        password = "namdv_" + password[:12]
    if password is not None and password != pwd:
        return json({'code': 'PARAM_ERROR', 'message': 'Mật khẩu không hợp lệ'}, status=400)
    if not group_id:
        return json({'code': 'PARAM_ERROR', 'message': 'Thiếu group_id'}, status=400)

    result = await zalo_client.send_zaloa_to_group(
        group_id=group_id,
        group_name="khoa san yeu cau, nhom thu 1",
        message=message,
        donvi_id="BVTN",
        donvi_ten="Bệnh viện TN",
        mode="production"
    )

    if result.success:
        return json({'code': 'OK', 'message': 'Gửi thành công', 'msg_id': result.msg_id}, status=200)
    return json({'code': 'ERROR', 'message': result.error_message or 'Gửi thất bại', 'error_code': result.error_code}, status=200)


@app.route('/api/v1/zalo/resend', methods=['POST'])
@validate_authen(authen=True)
async def zalo_resend(request, currentUser):
    

    if not check_permission(currentUser, 'LICH_SU_ZALO', 'resend'):
        return json({'code': 'PARAM_ERROR', 'message': 'Bạn không có quyền gửi lại ZNS'}, status=520)

    data = request.json or {}
    log_id = data.get('id')
    if not log_id:
        return json({'code': 'PARAM_ERROR', 'message': 'Thiếu ID bản ghi'}, status=400)

    log_entry = db.session.query(LichSuZalo).filter(LichSuZalo.id == log_id).first()
    if not log_entry:
        return json({'code': 'NOT_FOUND', 'message': 'Không tìm thấy bản ghi log'}, status=404)

    if log_entry.loai_doi_tuong == LichSuZalo.LOAI_DOI_TUONG.GROUP:
        result = await zalo_client.send_zaloa_to_group(
            group_id=log_entry.template_id,
            group_name=log_entry.ho_ten or "khoa san yeu cau, nhom thu 1",
            message=log_entry.noidung_gui if isinstance(log_entry.noidung_gui, str) else str(log_entry.noidung_gui),
            donvi_id=log_entry.donvi_id,
            donvi_ten=log_entry.donvi_ten,
            mode="production"
        )
    else:
        result = await zalo_client.send_zns(
            phone=log_entry.dienthoai,
            template_id=log_entry.template_id,
            template_data=log_entry.noidung_gui,
            donvi_id=log_entry.donvi_id,
            donvi_ten=log_entry.donvi_ten,
            ho_ten=log_entry.ho_ten,
            is_resend=True,
        )

    if result.success:
        return json({'code': 'OK', 'message': 'Gửi lại thành công'}, status=200)
    error_msg = result.error_message or 'Gửi lại thất bại'
    if result.error_code == -124:
        error_msg = "Token Zalo đã hết hạn. Vui lòng liên hệ Admin OA để cấp lại quyền."
    elif result.error_code == -1:
        error_msg = "Zalo OA chưa được cấu hình."
    return json({'code': 'ERROR', 'message': error_msg}, status=200)


@app.route('/api/v1/zalo/stats', methods=['GET'])
@validate_authen(authen=True)
async def zalo_stats(request, currentUser):
    if not check_permission(currentUser, 'LICH_SU_ZALO', 'view'):
        return json({'code': 'PARAM_ERROR', 'message': 'Bạn không có quyền xem thống kê ZNS'}, status=520)

    filter_query = (LichSuZalo.deleted == False)
    success_count = db.session.query(LichSuZalo).filter(filter_query, LichSuZalo.trang_thai == 1).count()
    failed_count = db.session.query(LichSuZalo).filter(filter_query, LichSuZalo.trang_thai == 0).count()
    return json({
        'total_success': success_count,
        'total_failed': failed_count,
        'total': success_count + failed_count,
    })


def postprocess_lichsu_zalo(request=None, Model=None, result=None, **kw):
    if not result:
        return
    objects = result.get('objects', []) if isinstance(result, dict) else (result if isinstance(result, list) else [])
    
    page = 1
    results_per_page = 20
    if request and hasattr(request, 'args'):
        try:
            page = int(request.args.get('page', 1))
            results_per_page = int(request.args.get('results_per_page', 20))
        except Exception:
            pass
    start_stt = (page - 1) * results_per_page
    
    from application.models.models_his import HisDmBenhNhan, HisKhamBenh
    from application.database import db
    
    for idx, obj in enumerate(objects):
        obj['stt'] = start_stt + idx + 1
        ho_ten = obj.get('ho_ten')
        phone = obj.get('dienthoai')
        
        bn = None
        if ho_ten:
            bn = db.session.query(HisDmBenhNhan).filter(HisDmBenhNhan.ten_benhnhan == ho_ten).first()
        if not bn and phone:
            bn = db.session.query(HisDmBenhNhan).filter(HisDmBenhNhan.so_dien_thoai == phone).first()
            
        if bn:
            if bn.ngay_sinh:
                raw_ns = str(bn.ngay_sinh).strip().split(' ')[0]
                p = raw_ns.split('-')
                if len(p) == 3:
                    obj['ngay_sinh'] = f"{p[2]}/{p[1]}/{p[0]}"
                else:
                    obj['ngay_sinh'] = raw_ns
            elif bn.nam_sinh:
                obj['ngay_sinh'] = str(bn.nam_sinh)
                
            if bn.ma_yte:
                obj['ma_benhnhan'] = f"BN-{bn.ma_yte}" if not str(bn.ma_yte).startswith("BN-") else bn.ma_yte
                
            kb = db.session.query(HisKhamBenh).filter(HisKhamBenh.benhnhan_id == bn.benhnhan_id).order_by(HisKhamBenh.khambenh_id.desc()).first()
            if kb:
                tgk = kb.thoi_gian_kham or kb.ngay_kham
                if tgk:
                    parts = str(tgk).strip().split(' ')
                    d_part = parts[0].split('-')
                    if len(d_part) == 3:
                        d_str = f"{d_part[2]}/{d_part[1]}/{d_part[0]}"
                        if len(parts) >= 2 and parts[1] and parts[1] != '00:00:00':
                            t_str = parts[1][:5]
                            obj['ngay_kham'] = f"{t_str} {d_str}"
                        else:
                            obj['ngay_kham'] = d_str


apimanager.create_api(
    LichSuZalo,
    methods=['GET'],
    url_prefix='/api/v1',
    preprocess=dict(GET_MANY=[require_permission('LICH_SU_ZALO', 'view')]),
    postprocess=dict(GET_MANY=[postprocess_lichsu_zalo]),
    collection_name='lichsu_zalo',
)



