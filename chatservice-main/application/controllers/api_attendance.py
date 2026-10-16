import datetime
import hmac
import logging
import time
import uuid

from gatco.response import json
from sqlalchemy import func

from application.database import db
from application.models.models import EmployeeAttendance, ManagementAccount
from application.server import app
from application.services.auth_service import current_user as current_jwt_user

logger = logging.getLogger(__name__)


def _current_user(request):
    try:
        current_user = current_jwt_user(request)
        if current_user is None:
            return None
        tenant_id = str(current_user.get("tenant_id") or current_user.get("current_tenant_id") or "")
        user_id = str(current_user.get("id") or current_user.get("uid") or "")
        account = ManagementAccount.query.filter(
            ManagementAccount.id == user_id,
            ManagementAccount.tenant_id == tenant_id,
            ManagementAccount.active.is_(True),
        ).first()
        if account is None:
            return None
        return {
            **current_user,
            "id": str(account.id),
            "username": account.username,
            "full_name": account.full_name,
            "role": account.role or "member",
            "tenant_id": account.tenant_id,
            "department": account.department or "",
        }
    except Exception as error:
        logger.warning("Could not resolve attendance user: %s", error)
        return None


def _format_time(ts_ms):
    if not ts_ms:
        return None
    try:
        return datetime.datetime.fromtimestamp(int(ts_ms) / 1000.0).strftime("%H:%M:%S")
    except Exception:
        return None


@app.route('/api/v1/attendance/check-in', methods=['POST'])
async def attendance_check_in(request):
    user = _current_user(request)
    if not user:
        return json({"error_code": "UNAUTHORIZED", "error_message": "Vui lòng đăng nhập để điểm danh."}, status=401)

    now_ms = int(time.time() * 1000)
    today = datetime.date.today()
    tenant_id = user["tenant_id"]
    account_id = user["id"]

    body = request.json if isinstance(request.json, dict) else {}
    method = str(body.get("method") or "WEB").strip()[:30]
    note = str(body.get("note") or "").strip()[:500] or None
    ip_address = request.ip or request.headers.get("X-Forwarded-For") or ""

    try:
        attendance = EmployeeAttendance.query.filter(
            EmployeeAttendance.tenant_id == tenant_id,
            EmployeeAttendance.account_id == account_id,
            EmployeeAttendance.work_date == today,
        ).first()

        if attendance:
            # Already checked in today, update if needed or return existing
            if not attendance.check_in_at:
                attendance.check_in_at = now_ms
                attendance.check_in_ip = ip_address
                attendance.check_in_method = method
            if note and not attendance.note:
                attendance.note = note
            db.session.commit()
        else:
            attendance = EmployeeAttendance(
                tenant_id=tenant_id,
                account_id=account_id,
                work_date=today,
                check_in_at=now_ms,
                status="PRESENT",
                check_in_ip=ip_address,
                check_in_method=method,
                note=note,
            )
            db.session.add(attendance)
            db.session.commit()
    except Exception as error:
        db.session.rollback()
        logger.exception("Error in attendance check-in: %s", error)
        return json({"error_code": "ATTENDANCE_ERROR", "error_message": "Không thể lưu điểm danh. Vui lòng thử lại."}, status=500)

    return json({
        "success": True,
        "message": f"Điểm danh thành công lúc {_format_time(attendance.check_in_at)}",
        "attendance": {
            "id": str(attendance.id),
            "work_date": str(attendance.work_date),
            "check_in_at": attendance.check_in_at,
            "check_in_time": _format_time(attendance.check_in_at),
            "check_out_at": attendance.check_out_at,
            "check_out_time": _format_time(attendance.check_out_at),
            "status": attendance.status,
            "method": attendance.check_in_method,
            "note": attendance.note,
        },
    })


@app.route('/api/v1/attendance/check-out', methods=['POST'])
async def attendance_check_out(request):
    user = _current_user(request)
    if not user:
        return json({"error_code": "UNAUTHORIZED", "error_message": "Vui lòng đăng nhập."}, status=401)

    now_ms = int(time.time() * 1000)
    today = datetime.date.today()
    tenant_id = user["tenant_id"]
    account_id = user["id"]

    attendance = EmployeeAttendance.query.filter(
        EmployeeAttendance.tenant_id == tenant_id,
        EmployeeAttendance.account_id == account_id,
        EmployeeAttendance.work_date == today,
    ).first()

    if not attendance:
        return json({
            "error_code": "NOT_CHECKED_IN",
            "error_message": "Bạn chưa thực hiện điểm danh vào ca hôm nay.",
        }, status=400)

    try:
        attendance.check_out_at = now_ms
        db.session.commit()
    except Exception as error:
        db.session.rollback()
        logger.exception("Error in attendance check-out: %s", error)
        return json({"error_code": "ATTENDANCE_ERROR", "error_message": "Không thể cập nhật ra ca. Vui lòng thử lại."}, status=500)

    return json({
        "success": True,
        "message": f"Điểm danh ra ca thành công lúc {_format_time(now_ms)}",
        "attendance": {
            "id": str(attendance.id),
            "work_date": str(attendance.work_date),
            "check_in_at": attendance.check_in_at,
            "check_in_time": _format_time(attendance.check_in_at),
            "check_out_at": attendance.check_out_at,
            "check_out_time": _format_time(attendance.check_out_at),
            "status": attendance.status,
        },
    })


@app.route('/api/v1/attendance/today', methods=['GET'])
async def attendance_today(request):
    user = _current_user(request)
    if not user:
        return json({"error_code": "UNAUTHORIZED", "error_message": "Vui lòng đăng nhập."}, status=401)

    today = datetime.date.today()
    tenant_id = user["tenant_id"]
    account_id = user["id"]

    record = EmployeeAttendance.query.filter(
        EmployeeAttendance.tenant_id == tenant_id,
        EmployeeAttendance.account_id == account_id,
        EmployeeAttendance.work_date == today,
    ).first()

    return json({
        "work_date": str(today),
        "is_checked_in": bool(record and record.check_in_at),
        "attendance": {
            "id": str(record.id) if record else None,
            "check_in_at": record.check_in_at if record else None,
            "check_in_time": _format_time(record.check_in_at) if record else None,
            "check_out_at": record.check_out_at if record else None,
            "check_out_time": _format_time(record.check_out_at) if record else None,
            "status": record.status if record else "NOT_CHECKED_IN",
            "method": record.check_in_method if record else None,
        } if record else None,
    })


@app.route('/api/v1/attendance/sync', methods=['POST'])
async def attendance_sync(request):
    """Webhook for biometric machines or external HR systems."""
    webhook_secret = str(app.config.get("ATTENDANCE_WEBHOOK_SECRET") or app.config.get("INTERNAL_ACCESS_TOKEN") or "").strip()
    provided_secret = str(request.headers.get("X-Attendance-Secret") or request.headers.get("X-INTERNAL-TOKEN") or "").strip()

    if not webhook_secret or not provided_secret or not hmac.compare_digest(webhook_secret, provided_secret):
        return json({"error_code": "UNAUTHORIZED", "error_message": "Khóa xác thực Webhook không hợp lệ."}, status=401)

    body = request.json if isinstance(request.json, dict) else {}
    records = body.get("records")
    if not isinstance(records, list):
        return json({"error_code": "PARAM_ERROR", "error_message": "Dữ liệu records phải là danh sách."}, status=400)

    tenant_id = str(body.get("tenant_id") or app.config.get("CHATBOT_DEFAULT_TENANT", "")).strip()
    synced_count = 0

    for item in records:
        if not isinstance(item, dict):
            continue
        account_id = str(item.get("account_id") or "").strip()
        username = str(item.get("username") or "").strip()
        date_str = str(item.get("work_date") or "").strip()

        if not date_str:
            target_date = datetime.date.today()
        else:
            try:
                target_date = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                continue

        account = None
        if account_id:
            account = ManagementAccount.query.filter(
                ManagementAccount.id == account_id,
                ManagementAccount.tenant_id == tenant_id,
            ).first()
        elif username:
            account = ManagementAccount.query.filter(
                ManagementAccount.username == username,
                ManagementAccount.tenant_id == tenant_id,
            ).first()

        if not account:
            continue

        check_in_ms = item.get("check_in_at")
        check_out_ms = item.get("check_out_at")
        status = str(item.get("status") or "PRESENT").strip()
        method = str(item.get("method") or "BIOMETRIC").strip()

        att = EmployeeAttendance.query.filter(
            EmployeeAttendance.tenant_id == tenant_id,
            EmployeeAttendance.account_id == account.id,
            EmployeeAttendance.work_date == target_date,
        ).first()

        if att:
            if check_in_ms:
                att.check_in_at = int(check_in_ms)
            if check_out_ms:
                att.check_out_at = int(check_out_ms)
            if status:
                att.status = status
            att.check_in_method = method
        else:
            att = EmployeeAttendance(
                tenant_id=tenant_id,
                account_id=account.id,
                work_date=target_date,
                check_in_at=int(check_in_ms) if check_in_ms else None,
                check_out_at=int(check_out_ms) if check_out_ms else None,
                status=status,
                check_in_method=method,
            )
            db.session.add(att)
        synced_count += 1

    try:
        db.session.commit()
        return json({"success": True, "synced_count": synced_count})
    except Exception as error:
        db.session.rollback()
        logger.exception("Error in attendance sync: %s", error)
        return json({"error_code": "SYNC_ERROR", "error_message": "Lỗi đồng bộ dữ liệu điểm danh."}, status=500)
