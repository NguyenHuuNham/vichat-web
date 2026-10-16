import datetime
import logging
import time
from sqlalchemy import and_, func, or_


from application.database import db
from application.models.models import (
    EmployeeAttendance,
    EnterpriseActivity,
    EnterpriseItem,
    EnterpriseItemParticipant,
    ManagementAccount,
    OrganizationUnit,
)

import unicodedata

logger = logging.getLogger(__name__)

TERMINAL_STATUSES = ("DONE", "CANCELLED", "APPROVED", "REJECTED", "RESOLVED", "CLOSED", "COMPLETED", "ARCHIVED")

ADMIN_ROLES = {"admin", "superadmin", "director", "executive", "owner", "ceo", "coo", "leader_company"}
MANAGER_ROLES = {"manager", "lead", "leader", "head", "truong_phong", "quan_ly"}


def is_admin_or_executive(user_context):
    role = str((user_context or {}).get("role") or "").strip().lower()
    return role in ADMIN_ROLES


def is_manager(user_context):
    role = str((user_context or {}).get("role") or "").strip().lower()
    return role in MANAGER_ROLES or is_admin_or_executive(user_context)


def _normalize_text(val):
    if not val:
        return ""
    s = str(val).casefold().replace("đ", "d").replace("Đ", "d")
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).strip()


def _format_timestamp(ts_ms):
    if not ts_ms:
        return None
    try:
        dt = datetime.datetime.fromtimestamp(int(ts_ms) / 1000.0)
        return dt.strftime("%H:%M:%S %d/%m/%Y")
    except Exception:
        return str(ts_ms)


def _format_time_only(ts_ms):
    if not ts_ms:
        return None
    try:
        dt = datetime.datetime.fromtimestamp(int(ts_ms) / 1000.0)
        return dt.strftime("%H:%M")
    except Exception:
        return None


ENTERPRISE_TOOLS_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_employee_attendance_status",
            "description": "Kiểm tra tình trạng làm việc, điểm danh, giờ check-in/out, trạng thái online/offline của một hoặc nhiều nhân viên trong ngày.",
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_name": {
                        "type": "string",
                        "description": "Tên hoặc username của nhân viên cần tra cứu. Để trống nếu muốn tra cứu cả phòng hoặc toàn công ty.",
                    },
                    "department": {
                        "type": "string",
                        "description": "Tên phòng ban nếu muốn tra cứu danh sách nhân sự trong phòng ban đó.",
                    },
                    "date": {
                        "type": "string",
                        "description": "Ngày cần tra cứu dạng YYYY-MM-DD. Mặc định là ngày hôm nay.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_company_tasks_summary",
            "description": "Tra cứu tiến độ công việc, các task đang thực hiện, task trễ hạn, hoặc tổng quan dự án của công ty, phòng ban hoặc nhân viên.",
            "parameters": {
                "type": "object",
                "properties": {
                    "department": {
                        "type": "string",
                        "description": "Tên phòng ban muốn xem tiến độ công việc.",
                    },
                    "assignee_name": {
                        "type": "string",
                        "description": "Tên người được giao việc / thực hiện task.",
                    },
                    "status": {
                        "type": "string",
                        "enum": ["ALL", "PENDING", "IN_PROGRESS", "OVERDUE", "COMPLETED"],
                        "description": "Lọc theo trạng thái công việc.",
                    },
                    "overdue_only": {
                        "type": "boolean",
                        "description": "Chỉ lấy các công việc đã quá hạn hoàn thành.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_department_roster",
            "description": "Tra cứu cơ cấu phòng ban, danh sách nhân sự và chức danh theo từng phòng ban.",
            "parameters": {
                "type": "object",
                "properties": {
                    "department": {
                        "type": "string",
                        "description": "Tên phòng ban cần xem danh sách nhân sự.",
                    },
                },
            },
        },
    },
]


def get_employee_attendance_status(user_context, employee_name=None, department=None, date_str=None):
    tenant_id = str((user_context or {}).get("tenant_id") or (user_context or {}).get("current_tenant_id") or "").strip()
    user_id = str((user_context or {}).get("id") or (user_context or {}).get("uid") or "").strip()
    user_role = str((user_context or {}).get("role") or "member").strip().lower()
    user_dept = str((user_context or {}).get("department") or "").strip()

    # Determine target date
    if date_str:
        try:
            target_date = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            target_date = datetime.date.today()
    else:
        target_date = datetime.date.today()

    target_date_str = target_date.strftime("%Y-%m-%d")
    is_today = (target_date == datetime.date.today())

    # RBAC Enforcement:
    # 1. Members can only query their own attendance.
    if not is_manager(user_context):
        # Querying self?
        caller_name = _normalize_text((user_context or {}).get("full_name") or (user_context or {}).get("username") or "")
        requested_name = _normalize_text(employee_name or "")
        if requested_name and requested_name not in caller_name and caller_name not in requested_name:
            return {
                "error": "PERMISSION_DENIED",
                "message": "Theo chính sách bảo mật nội bộ, nhân viên chỉ được xem tình trạng làm việc và điểm danh của chính mình. Vui lòng liên hệ Trưởng phòng hoặc Quản trị viên để tra cứu nhân sự khác.",
            }
        # If member didn't specify name or department, force query on self
        employee_name = (user_context or {}).get("username") or (user_context or {}).get("full_name")

    # 2. Managers can query their department or self
    if is_manager(user_context) and not is_admin_or_executive(user_context):
        if department and _normalize_text(department) not in _normalize_text(user_dept):
            return {
                "error": "PERMISSION_DENIED",
                "message": f"Bạn chỉ có quyền xem dữ liệu nhân sự thuộc phòng ban quản lý của bạn ({user_dept}).",
            }
        if not department and not employee_name:
            department = user_dept

    # Fetch accounts in tenant
    query = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == tenant_id,
        ManagementAccount.active.is_(True),
    )
    if department:
        dept_norm = _normalize_text(department)
        query = query.filter(func.lower(ManagementAccount.department).contains(dept_norm))

    accounts = query.all()
    if employee_name:
        emp_norm = _normalize_text(employee_name)
        accounts = [
            acc for acc in accounts
            if emp_norm in _normalize_text(acc.full_name)
            or emp_norm in _normalize_text(acc.username)
        ]

    if not accounts:
        return {
            "date": target_date_str,
            "total": 0,
            "summary": f"Không tìm thấy nhân viên nào phù hợp với yêu cầu ({employee_name or department or 'toàn công ty'}).",
            "employees": [],
        }

    account_ids = [acc.id for acc in accounts]
    account_map = {acc.id: acc for acc in accounts}

    # Fetch attendance records for these accounts on target_date
    attendances = EmployeeAttendance.query.filter(
        EmployeeAttendance.tenant_id == tenant_id,
        EmployeeAttendance.account_id.in_(account_ids),
        EmployeeAttendance.work_date == target_date,
    ).all()
    attendance_map = {att.account_id: att for att in attendances}

    # Determine day bounds in ms for activity check
    day_start_ms = int(datetime.datetime.combine(target_date, datetime.time.min).timestamp() * 1000)
    day_end_ms = int(datetime.datetime.combine(target_date, datetime.time.max).timestamp() * 1000)

    # Fetch recent activities for these accounts today
    activities_today = db.session.query(
        EnterpriseActivity.actor_id,
        func.max(EnterpriseActivity.created_at).label("last_active_at"),
        func.count(EnterpriseActivity.id).label("activity_count"),
    ).filter(
        EnterpriseActivity.tenant_id == tenant_id,
        EnterpriseActivity.actor_id.in_(account_ids),
        EnterpriseActivity.created_at >= day_start_ms,
        EnterpriseActivity.created_at <= day_end_ms,
    ).group_by(EnterpriseActivity.actor_id).all()
    activity_map = {item.actor_id: (item.last_active_at, item.activity_count) for item in activities_today}

    results = []
    present_count = 0
    late_count = 0
    remote_count = 0
    not_checked_in_count = 0

    for acc in accounts:
        att = attendance_map.get(acc.id)
        act_info = activity_map.get(acc.id)
        last_act_ms = act_info[0] if act_info else None
        act_count = act_info[1] if act_info else 0

        # Login timestamp on ManagementAccount
        last_login_ms = acc.last_login_at
        logged_in_today = bool(last_login_ms and day_start_ms <= last_login_ms <= day_end_ms)

        if att:
            status = att.status
            check_in_time = _format_time_only(att.check_in_at)
            check_out_time = _format_time_only(att.check_out_at)
            method = att.check_in_method or "WEB"
            note = att.note or ""
            if status in ("PRESENT", "WORKING"):
                present_count += 1
            elif status == "LATE":
                late_count += 1
            elif status == "REMOTE":
                remote_count += 1
            else:
                not_checked_in_count += 1
        else:
            check_in_time = None
            check_out_time = None
            method = None
            note = None
            if logged_in_today or last_act_ms:
                status = "ACTIVE_NO_CHECKIN"
                present_count += 1
                note = f"Chưa bấm điểm danh nhưng đã đăng nhập/hoạt động lúc {_format_time_only(last_login_ms or last_act_ms)}"
            else:
                status = "NOT_CHECKED_IN"
                not_checked_in_count += 1

        results.append({
            "id": acc.id,
            "full_name": acc.full_name or acc.username,
            "username": acc.username,
            "department": acc.department or "Chưa phân bổ",
            "title": acc.title or "Nhân viên",
            "status": status,
            "check_in_time": check_in_time,
            "check_out_time": check_out_time,
            "method": method,
            "note": note,
            "last_login_time": _format_timestamp(last_login_ms),
            "logged_in_today": logged_in_today,
            "task_activity_count_today": act_count,
        })

    return {
        "date": target_date_str,
        "total_employees": len(results),
        "present_count": present_count,
        "late_count": late_count,
        "remote_count": remote_count,
        "not_checked_in_count": not_checked_in_count,
        "employees": results,
    }


def get_company_tasks_summary(user_context, department=None, assignee_name=None, status=None, overdue_only=False):
    tenant_id = str((user_context or {}).get("tenant_id") or (user_context or {}).get("current_tenant_id") or "").strip()
    user_id = str((user_context or {}).get("id") or (user_context or {}).get("uid") or "").strip()
    user_role = str((user_context or {}).get("role") or "member").strip().lower()
    user_dept = str((user_context or {}).get("department") or "").strip()

    now_ms = int(time.time() * 1000)

    # Base query for tasks
    query = EnterpriseItem.query.filter(
        EnterpriseItem.tenant_id == tenant_id,
        EnterpriseItem.deleted.is_(False),
        EnterpriseItem.item_type == "TASK",
    )

    # RBAC filtering:
    if not is_manager(user_context):
        # Members only see their own tasks
        participant_items = db.session.query(EnterpriseItemParticipant.item_id).filter(
            EnterpriseItemParticipant.tenant_id == tenant_id,
            EnterpriseItemParticipant.account_id == user_id,
        ).subquery()
        query = query.filter(
            or_(
                EnterpriseItem.created_by == user_id,
                EnterpriseItem.owner_id == user_id,
                EnterpriseItem.id.in_(participant_items),
            )
        )
    elif is_manager(user_context) and not is_admin_or_executive(user_context):
        # Manager bounds to department if specified, or default department
        effective_dept = department or user_dept
        dept_accounts = db.session.query(ManagementAccount.id).filter(
            ManagementAccount.tenant_id == tenant_id,
            ManagementAccount.active.is_(True),
            func.lower(ManagementAccount.department).contains(_normalize_text(effective_dept)),
        ).subquery()
        dept_participants = db.session.query(EnterpriseItemParticipant.item_id).filter(
            EnterpriseItemParticipant.tenant_id == tenant_id,
            EnterpriseItemParticipant.account_id.in_(dept_accounts),
        ).subquery()
        query = query.filter(
            or_(
                EnterpriseItem.created_by.in_(dept_accounts),
                EnterpriseItem.owner_id.in_(dept_accounts),
                EnterpriseItem.id.in_(dept_participants),
            )
        )

    # Filter by assignee if requested
    if assignee_name:
        norm_assignee = _normalize_text(assignee_name)
        target_accounts = db.session.query(ManagementAccount.id).filter(
            ManagementAccount.tenant_id == tenant_id,
            or_(
                func.lower(ManagementAccount.full_name).contains(norm_assignee),
                func.lower(ManagementAccount.username).contains(norm_assignee),
            ),
        ).subquery()
        assignee_participant_items = db.session.query(EnterpriseItemParticipant.item_id).filter(
            EnterpriseItemParticipant.tenant_id == tenant_id,
            EnterpriseItemParticipant.account_id.in_(target_accounts),
        ).subquery()
        query = query.filter(
            or_(
                EnterpriseItem.owner_id.in_(target_accounts),
                EnterpriseItem.id.in_(assignee_participant_items),
            )
        )

    # Overdue only
    if overdue_only:
        query = query.filter(
            EnterpriseItem.due_at.isnot(None),
            EnterpriseItem.due_at < now_ms,
            ~EnterpriseItem.status.in_(TERMINAL_STATUSES),
        )
    elif status and status.upper() != "ALL":
        query = query.filter(EnterpriseItem.status == status.upper())

    items = query.order_by(EnterpriseItem.due_at.asc().nullslast(), EnterpriseItem.created_at.desc()).limit(100).all()

    # Collect owners and participants to display names
    all_account_ids = set()
    for item in items:
        if item.owner_id:
            all_account_ids.add(item.owner_id)
        if item.created_by:
            all_account_ids.add(item.created_by)

    item_ids = [item.id for item in items]
    participants = EnterpriseItemParticipant.query.filter(
        EnterpriseItemParticipant.tenant_id == tenant_id,
        EnterpriseItemParticipant.item_id.in_(item_ids),
    ).all()
    for p in participants:
        all_account_ids.add(p.account_id)

    accounts = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == tenant_id,
        ManagementAccount.id.in_(list(all_account_ids)),
    ).all()
    name_map = {acc.id: (acc.full_name or acc.username) for acc in accounts}

    participant_map = {}
    for p in participants:
        participant_map.setdefault(p.item_id, []).append({
            "account_id": p.account_id,
            "name": name_map.get(p.account_id, p.account_id),
            "role": p.role,
            "state": p.state,
        })

    tasks_result = []
    overdue_count = 0
    in_progress_count = 0
    completed_count = 0

    for item in items:
        is_overdue = bool(item.due_at and item.due_at < now_ms and item.status not in TERMINAL_STATUSES)
        if is_overdue:
            overdue_count += 1
        if item.status in ("IN_PROGRESS", "DOING", "OPEN"):
            in_progress_count += 1
        elif item.status in TERMINAL_STATUSES:
            completed_count += 1

        due_date_str = _format_timestamp(item.due_at)
        tasks_result.append({
            "id": str(item.id),
            "title": item.title,
            "status": item.status,
            "priority": item.priority,
            "owner_name": name_map.get(item.owner_id, "Chưa phân công"),
            "assignees": [p["name"] for p in participant_map.get(item.id, [])],
            "due_date": due_date_str,
            "is_overdue": is_overdue,
        })

    return {
        "total_tasks": len(tasks_result),
        "in_progress_count": in_progress_count,
        "completed_count": completed_count,
        "overdue_count": overdue_count,
        "tasks": tasks_result,
    }


def get_department_roster(user_context, department=None):
    tenant_id = str((user_context or {}).get("tenant_id") or (user_context or {}).get("current_tenant_id") or "").strip()

    units = OrganizationUnit.query.filter(
        OrganizationUnit.tenant_id == tenant_id,
        OrganizationUnit.is_active.is_(True),
    ).all()

    accounts_query = ManagementAccount.query.filter(
        ManagementAccount.tenant_id == tenant_id,
        ManagementAccount.active.is_(True),
    )
    if department:
        accounts_query = accounts_query.filter(
            func.lower(ManagementAccount.department).contains(_normalize_text(department))
        )

    accounts = accounts_query.all()

    dept_counts = {}
    for acc in accounts:
        d = acc.department or "Chưa phân bổ"
        dept_counts[d] = dept_counts.get(d, 0) + 1

    members = [
        {
            "id": acc.id,
            "full_name": acc.full_name or acc.username,
            "username": acc.username,
            "department": acc.department or "Chưa phân bổ",
            "title": acc.title or "Nhân viên",
            "role": acc.role,
        }
        for acc in accounts
    ]

    return {
        "departments": [{"name": k, "employee_count": v} for k, v in dept_counts.items()],
        "total_members": len(members),
        "members": members[:50],  # bounded to avoid huge tokens
    }


def execute_enterprise_tool(tool_name, arguments, user_context):
    """Dispatcher for AI tool execution."""
    args = arguments if isinstance(arguments, dict) else {}
    logger.info("Executing Enterprise AI Tool: %s with args: %s for user: %s", tool_name, args, (user_context or {}).get("username"))

    try:
        if tool_name == "get_employee_attendance_status":
            return get_employee_attendance_status(
                user_context=user_context,
                employee_name=args.get("employee_name"),
                department=args.get("department"),
                date_str=args.get("date"),
            )
        elif tool_name == "get_company_tasks_summary":
            return get_company_tasks_summary(
                user_context=user_context,
                department=args.get("department"),
                assignee_name=args.get("assignee_name"),
                status=args.get("status"),
                overdue_only=bool(args.get("overdue_only")),
            )
        elif tool_name == "get_department_roster":
            return get_department_roster(
                user_context=user_context,
                department=args.get("department"),
            )
        else:
            return {"error": "UNKNOWN_TOOL", "message": f"Không tìm thấy công cụ '{tool_name}'."}
    except Exception as exc:
        logger.exception("Error executing tool %s: %s", tool_name, exc)
        return {"error": "TOOL_EXECUTION_ERROR", "message": str(exc)}


def detect_enterprise_intent(message):
    if not message or not isinstance(message, str):
        return None
    raw = message.strip()
    norm = _normalize_text(raw)

    import re

    # Exclude policy, regulations, documentation and procedural queries (route to Knowledge RAG)
    policy_keywords = ("quy trinh", "chinh sach", "quy dinh", "thu tuc", "huong dan", "mau don", "tai lieu", "tieu chuan")
    if any(kw in norm for kw in policy_keywords):
        return None

    # Date extraction
    target_date_str = None
    if "hom qua" in norm or "yesterday" in norm:
        target_date_str = (datetime.date.today() - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    elif "hom nay" in norm or "today" in norm:
        target_date_str = datetime.date.today().strftime("%Y-%m-%d")
    else:
        date_match = re.search(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b", raw)
        if date_match:
            d, m, y = date_match.groups()
            target_date_str = f"{y}-{int(m):02d}-{int(d):02d}"

    # Department extraction
    department = None
    dept_match = re.search(r"\b(?:phong|phòng|ban|khoi|khối|bo phan|bộ phận)\s+([A-ZÀ-Ỹa-zà-ỹ0-9_\s]{2,25})\b", raw, re.IGNORECASE)
    if dept_match:
        extracted = dept_match.group(1).strip()
        if _normalize_text(extracted) not in ("ban", "nay", "do", "minh", "toi", "gi", "ai"):
            department = extracted

    # Employee name extraction
    employee_name = None
    emp_match = re.search(r"\b(?:nhan vien|nhân viên|ban|bạn|anh|chi|chị|ong|ông|ba|bà)\s+([A-ZÀ-Ỹa-zà-ỹ0-9_\s]{2,30})\b", raw, re.IGNORECASE)
    if emp_match:
        cand = emp_match.group(1).strip()
        cleaned = re.sub(r"\s+(?:hom nay|hôm nay|hop nay|hợp nay|co di lam|có đi làm|co lam viec|có làm việc|khong|không|chua|chưa).*$", "", cand, flags=re.IGNORECASE).strip()
        cleaned_norm = _normalize_text(cleaned)
        stop_words = {
            "toan cong ty", "cong ty", "phong ban", "moi nguoi", "ai", "nao", "hom nay",
            "hop nay", "nay", "do", "minh", "chung", "toan bo", "tat ca", "cac", "nhung",
            "co di lam", "co mat", "nhan vien", "nhan su", "can bo",
        }
        if cleaned_norm not in stop_words and len(cleaned) >= 2:
            employee_name = cleaned

    # 1. Attendance Intent
    attendance_keywords = (
        "di lam", "lam viec", "checkin", "check in", "check-in", "checkout", "check out",
        "diem danh", "cham cong", "vang mat", "nghi phep", "co mat", "den cong ty",
        "chua den", "di muon", "den muon", "tinh hinh nhan su", "trang thai nhan vien",
        "ai di lam", "nhung ai lam", "co ai di lam"
    )
    if any(kw in norm for kw in attendance_keywords):
        return {
            "tool": "get_employee_attendance_status",
            "arguments": {
                "employee_name": employee_name,
                "department": department,
                "date": target_date_str,
            },
        }

    # 2. Task Intent
    task_keywords = (
        "tien do", "cong viec", "task", "tre han", "cham tien do", "qua han",
        "deadline", "ton dong", "du an", "viec can lam", "danh sach cong viec",
        "bao cao cong viec", "giao viec", "viec hom nay"
    )
    if any(kw in norm for kw in task_keywords):
        overdue_only = any(kw in norm for kw in ("tre han", "qua han", "cham tien do", "muon han", "overdue", "cham deadline"))
        return {
            "tool": "get_company_tasks_summary",
            "arguments": {
                "department": department,
                "assignee_name": employee_name,
                "overdue_only": overdue_only,
            },
        }

    # 3. Roster / Department Intent
    roster_keywords = (
        "danh sach phong ban", "co cau phong ban", "cac phong ban",
        "danh ba", "nhan su phong", "danh sach nhan vien", "toan bo nhan vien"
    )
    if any(kw in norm for kw in roster_keywords):
        return {
            "tool": "get_department_roster",
            "arguments": {
                "department": department,
            },
        }

    return None


def format_enterprise_response(tool_name, tool_result, original_message, user_context):
    if not isinstance(tool_result, dict):
        return str(tool_result or "Không có dữ liệu trả về.")

    if tool_result.get("error") == "PERMISSION_DENIED":
        return f"🔒 **Chính sách bảo mật & Phân quyền:**\n{tool_result.get('message')}"

    if tool_result.get("error"):
        return f"⚠️ **Thông báo:** {tool_result.get('message') or 'Không thể xử lý yêu cầu.'}"

    # ATTENDANCE
    if tool_name == "get_employee_attendance_status":
        date_str = tool_result.get("date", "")
        try:
            d_obj = datetime.datetime.strptime(date_str, "%Y-%m-%d")
            display_date = d_obj.strftime("%d/%m/%Y")
        except Exception:
            display_date = date_str

        total = tool_result.get("total_employees", 0)
        employees = tool_result.get("employees", [])

        if total == 0:
            return f"ℹ️ **Báo cáo điểm danh ({display_date}):**\n{tool_result.get('summary', 'Không tìm thấy dữ liệu nhân sự.')}"

        if len(employees) == 1:
            emp = employees[0]
            status_text = "🟢 Đang làm việc (Đúng giờ)"
            if emp["status"] == "LATE":
                status_text = "🟡 Đi muộn"
            elif emp["status"] == "REMOTE":
                status_text = "🌐 Làm việc từ xa (Remote)"
            elif emp["status"] == "ACTIVE_NO_CHECKIN":
                status_text = "🟡 Đang hoạt động (Chưa bấm điểm danh)"
            elif emp["status"] == "NOT_CHECKED_IN":
                status_text = "🔴 Chưa điểm danh / Chưa có mặt"

            lines = [
                f"👤 **TÌNH TRẠNG LÀM VIỆC CỦA {emp['full_name'].upper()} ({display_date})**",
                f"• **Phòng ban / Chức danh:** {emp['department']} - {emp['title']}",
                f"• **Trạng thái:** {status_text}",
            ]
            if emp["check_in_time"]:
                lines.append(f"• **Giờ check-in:** {emp['check_in_time']} (Hình thức: {emp['method'] or 'Web'})")
            if emp["check_out_time"]:
                lines.append(f"• **Giờ check-out:** {emp['check_out_time']}")
            if emp["last_login_time"]:
                lines.append(f"• **Đăng nhập hệ thống lần cuối:** {emp['last_login_time']}")
            if emp["task_activity_count_today"]:
                lines.append(f"• **Hoạt động công việc hôm nay:** Đã cập nhật/xử lý {emp['task_activity_count_today']} hoạt động")
            if emp["note"]:
                lines.append(f"• **Ghi chú:** {emp['note']}")

            return "\n".join(lines)

        present_count = tool_result.get("present_count", 0)
        late_count = tool_result.get("late_count", 0)
        remote_count = tool_result.get("remote_count", 0)
        not_checked_count = tool_result.get("not_checked_in_count", 0)
        total_working = present_count + late_count + remote_count

        lines = [
            f"📊 **BÁO CÁO TÌNH HÌNH LÀM VIỆC NGÀY {display_date}**",
            f"• **Tổng số nhân sự theo dõi:** {total}",
            f"• **Đang làm việc:** {total_working}/{total} nhân sự (🟢 {present_count} đúng giờ, 🟡 {late_count} muộn, 🌐 {remote_count} remote)",
            f"• **Chưa điểm danh / Vắng mặt:** {not_checked_count} nhân sự",
            "",
            "**Danh sách chi tiết:**",
        ]

        for i, emp in enumerate(employees[:30], 1):
            icon = "🟢" if emp["status"] in ("PRESENT", "WORKING") else ("🟡" if emp["status"] in ("LATE", "ACTIVE_NO_CHECKIN", "REMOTE") else "🔴")
            time_info = f"Check-in: {emp['check_in_time']}" if emp["check_in_time"] else ("Đang online" if emp["logged_in_today"] else "Chưa có mặt")
            lines.append(f"{i}. {icon} **{emp['full_name']}** ({emp['department']}) — *{time_info}*")

        if len(employees) > 30:
            lines.append(f"\n*...và còn {len(employees) - 30} nhân sự khác.*")

        return "\n".join(lines)

    # TASKS
    elif tool_name == "get_company_tasks_summary":
        total_tasks = tool_result.get("total_tasks", 0)
        overdue_count = tool_result.get("overdue_count", 0)
        in_progress_count = tool_result.get("in_progress_count", 0)
        completed_count = tool_result.get("completed_count", 0)
        tasks = tool_result.get("tasks", [])

        if total_tasks == 0:
            return "📋 **Báo cáo tiến độ công việc:**\nHiện không có công việc nào theo điều kiện bạn yêu cầu."

        norm_msg = _normalize_text(original_message)
        if overdue_count > 0 and any(kw in norm_msg for kw in ("tre han", "qua han", "cham")):
            lines = [
                f"🚨 **CẢNH BÁO: CÔNG VIỆC TRỄ HẠN ({overdue_count} task)**",
                "Dưới đây là các công việc đã vượt quá thời hạn hoàn thành:",
                "",
            ]
            for i, t in enumerate([t for t in tasks if t["is_overdue"]][:20], 1):
                assignees_str = ", ".join(t["assignees"]) if t["assignees"] else t["owner_name"]
                lines.append(f"{i}. ⚠️ **{t['title']}**")
                lines.append(f"   • Phụ trách: **{assignees_str}** | Mức độ: `{t['priority']}`")
                lines.append(f"   • Hạn chót: **{t['due_date']}** | Trạng thái: `{t['status']}`")
            return "\n".join(lines)

        lines = [
            f"📋 **TỔNG HỢP TIẾN ĐỘ CÔNG VIỆC**",
            f"• **Tổng số công việc:** {total_tasks}",
            f"• **Đang thực hiện:** {in_progress_count} task",
            f"• **Đã hoàn thành:** {completed_count} task",
            f"• **Trễ hạn:** 🚨 {overdue_count} task" if overdue_count > 0 else "• **Trễ hạn:** 0 task (Đúng tiến độ)",
            "",
            "**Danh sách công việc tiêu biểu:**",
        ]
        for i, t in enumerate(tasks[:15], 1):
            badge = "🚨 [TRỄ HẠN]" if t["is_overdue"] else f"[{t['status']}]"
            assignees_str = ", ".join(t["assignees"]) if t["assignees"] else t["owner_name"]
            lines.append(f"{i}. **{t['title']}** {badge}")
            lines.append(f"   • Phụ trách: {assignees_str} | Hạn: {t['due_date'] or 'Không đặt'}")

        if len(tasks) > 15:
            lines.append(f"\n*...và còn {len(tasks) - 15} công việc khác.*")

        return "\n".join(lines)

    # ROSTER
    elif tool_name == "get_department_roster":
        depts = tool_result.get("departments", [])
        total_members = tool_result.get("total_members", 0)
        members = tool_result.get("members", [])

        lines = [
            f"🏢 **CƠ CẤU PHÒNG BAN & NHÂN SỰ CÔNG TY**",
            f"• **Tổng nhân sự:** {total_members} người",
            f"• **Danh sách phòng ban:**",
        ]
        for d in depts:
            lines.append(f"  - **{d['name']}**: {d['employee_count']} nhân sự")

        if members and len(depts) == 1:
            lines.append(f"\n**Danh sách thành viên:**")
            for i, m in enumerate(members[:25], 1):
                lines.append(f"{i}. **{m['full_name']}** — {m['title']} ({m['username']})")

        return "\n".join(lines)

    return str(tool_result)

