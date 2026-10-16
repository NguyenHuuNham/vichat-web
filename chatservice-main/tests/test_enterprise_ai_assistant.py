import asyncio
import datetime
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from types import ModuleType, SimpleNamespace
from unittest.mock import MagicMock, patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
TOOLS_PATH = PROJECT_ROOT / "application" / "services" / "enterprise_ai_tools.py"
SERVICE_PATH = PROJECT_ROOT / "application" / "services" / "chatbot_service.py"

# Pre-stub optional runtime dependencies
if "aiohttp" not in sys.modules:
    aiohttp_stub = types.ModuleType("aiohttp")
    aiohttp_stub.ClientError = Exception
    aiohttp_stub.ClientTimeout = lambda **_kwargs: None
    sys.modules["aiohttp"] = aiohttp_stub

if "sqlalchemy" not in sys.modules:
    sa_mod = types.ModuleType("sqlalchemy")
    sa_mod.and_ = MagicMock()
    sa_mod.or_ = MagicMock()
    sa_mod.func = MagicMock()
    sys.modules["sqlalchemy"] = sa_mod

if "unidecode" not in sys.modules:
    try:
        import unidecode
    except ImportError:
        uni_mod = types.ModuleType("unidecode")
        import unicodedata
        def _unidecode(s):
            return "".join(c for c in unicodedata.normalize("NFD", str(s)) if unicodedata.category(c) != "Mn")
        uni_mod.unidecode = _unidecode
        sys.modules["unidecode"] = uni_mod

if "gatco" not in sys.modules:
    sys.modules["gatco"] = MagicMock()
    sys.modules["gatco.response"] = MagicMock()

if "application" not in sys.modules:
    sys.modules["application"] = types.ModuleType("application")

if "application.database" not in sys.modules:
    db_mod = types.ModuleType("application.database")
    db_mod.db = MagicMock()
    sys.modules["application.database"] = db_mod

if "application.models" not in sys.modules:
    sys.modules["application.models"] = types.ModuleType("application.models")

if "application.models.models" not in sys.modules:
    models_mod = types.ModuleType("application.models.models")
    models_mod.EmployeeAttendance = MagicMock()
    models_mod.EnterpriseActivity = MagicMock()
    models_mod.EnterpriseItem = MagicMock()
    models_mod.EnterpriseItemParticipant = MagicMock()
    models_mod.ManagementAccount = MagicMock()
    models_mod.OrganizationUnit = MagicMock()
    sys.modules["application.models.models"] = models_mod

# Load enterprise_ai_tools
tools_spec = importlib.util.spec_from_file_location("enterprise_ai_tools", TOOLS_PATH)
enterprise_ai_tools = importlib.util.module_from_spec(tools_spec)
sys.modules["application.services.enterprise_ai_tools"] = enterprise_ai_tools
tools_spec.loader.exec_module(enterprise_ai_tools)

detect_enterprise_intent = enterprise_ai_tools.detect_enterprise_intent
format_enterprise_response = enterprise_ai_tools.format_enterprise_response
get_employee_attendance_status = enterprise_ai_tools.get_employee_attendance_status
is_admin_or_executive = enterprise_ai_tools.is_admin_or_executive
is_manager = enterprise_ai_tools.is_manager

# Load chatbot_service
chatbot_spec = importlib.util.spec_from_file_location("chatbot_service", SERVICE_PATH)
chatbot_module = importlib.util.module_from_spec(chatbot_spec)
chatbot_spec.loader.exec_module(chatbot_module)
ChatbotService = chatbot_module.ChatbotService


class EnterpriseAiAssistantTests(unittest.TestCase):
    def test_intent_detection_attendance(self):
        # 1. Company attendance today
        intent = detect_enterprise_intent("kiểm tra nhân viên hôm nay có làm việc không")
        self.assertIsNotNone(intent)
        self.assertEqual(intent["tool"], "get_employee_attendance_status")
        self.assertEqual(intent["arguments"]["date"], datetime.date.today().strftime("%Y-%m-%d"))

        # 2. Specific employee attendance
        intent2 = detect_enterprise_intent("nhân viên Nguyễn Văn A hôm nay có đi làm không")
        self.assertIsNotNone(intent2)
        self.assertEqual(intent2["tool"], "get_employee_attendance_status")
        self.assertIn("Nguyễn Văn A", intent2["arguments"]["employee_name"])

        # 3. Department attendance
        intent3 = detect_enterprise_intent("hôm nay phòng kỹ thuật có ai đi làm không")
        self.assertIsNotNone(intent3)
        self.assertEqual(intent3["tool"], "get_employee_attendance_status")
        self.assertTrue("ky thuat" in intent3["arguments"]["department"].lower() or "kỹ thuật" in intent3["arguments"]["department"].lower())

    def test_intent_detection_tasks(self):
        # 1. Overdue tasks
        intent = detect_enterprise_intent("những task nào đang bị trễ hạn")
        self.assertIsNotNone(intent)
        self.assertEqual(intent["tool"], "get_company_tasks_summary")
        self.assertTrue(intent["arguments"]["overdue_only"])

        # 2. General task progress
        intent2 = detect_enterprise_intent("tiến độ công việc hôm nay thế nào")
        self.assertIsNotNone(intent2)
        self.assertEqual(intent2["tool"], "get_company_tasks_summary")
        self.assertFalse(intent2["arguments"]["overdue_only"])

    def test_intent_detection_roster(self):
        intent = detect_enterprise_intent("xem cơ cấu phòng ban công ty")
        self.assertIsNotNone(intent)
        self.assertEqual(intent["tool"], "get_department_roster")

    def test_intent_detection_ignores_knowledge_and_greetings(self):
        self.assertIsNone(detect_enterprise_intent("Chào bạn, bạn là ai?"))
        self.assertIsNone(detect_enterprise_intent("Quy trình xin nghỉ phép gồm những bước nào?"))
        self.assertIsNone(detect_enterprise_intent("Cảm ơn bạn nhé"))

    def test_rbac_member_cannot_query_others_attendance(self):
        user_context = {
            "id": "user-123",
            "username": "nguyenvana",
            "full_name": "Nguyễn Văn A",
            "role": "member",
            "department": "Kỹ thuật",
            "tenant_id": "tenant-test",
        }
        # Member asks about someone else: Trần Thị B
        result = get_employee_attendance_status(
            user_context=user_context,
            employee_name="Trần Thị B",
        )
        self.assertEqual(result.get("error"), "PERMISSION_DENIED")
        self.assertIn("chính sách bảo mật", result.get("message", "").lower())

    def test_rbac_manager_cannot_query_other_departments(self):
        user_context = {
            "id": "mgr-123",
            "username": "lead_it",
            "full_name": "Trưởng Phòng IT",
            "role": "manager",
            "department": "Kỹ thuật",
            "tenant_id": "tenant-test",
        }
        # Manager of Kỹ thuật asks about Kế toán
        result = get_employee_attendance_status(
            user_context=user_context,
            department="Kế toán",
        )
        self.assertEqual(result.get("error"), "PERMISSION_DENIED")
        self.assertIn("phòng ban quản lý", result.get("message", "").lower())

    def test_format_enterprise_response_attendance_single(self):
        tool_result = {
            "date": "2026-10-16",
            "total_employees": 1,
            "employees": [{
                "full_name": "Nguyễn Văn A",
                "username": "nguyenvana",
                "department": "Phòng Kỹ thuật",
                "title": "Kỹ sư phần mềm",
                "status": "PRESENT",
                "check_in_time": "08:15",
                "check_out_time": None,
                "method": "WEB",
                "last_login_time": "08:14 16/10/2026",
                "task_activity_count_today": 3,
                "note": None,
            }],
        }
        formatted = format_enterprise_response("get_employee_attendance_status", tool_result, "Nguyễn Văn A", {})
        self.assertIn("NGUYỄN VĂN A", formatted)
        self.assertIn("08:15", formatted)
        self.assertIn("Đang làm việc", formatted)

    def test_format_enterprise_response_tasks_overdue(self):
        tool_result = {
            "total_tasks": 2,
            "overdue_count": 2,
            "in_progress_count": 2,
            "completed_count": 0,
            "tasks": [{
                "id": "t1",
                "title": "Báo cáo tài chính quý 3",
                "status": "IN_PROGRESS",
                "priority": "HIGH",
                "owner_name": "Trần Thị B",
                "assignees": ["Trần Thị B"],
                "due_date": "17:00 14/10/2026",
                "is_overdue": True,
            }],
        }
        formatted = format_enterprise_response("get_company_tasks_summary", tool_result, "các task trễ hạn", {})
        self.assertIn("CÔNG VIỆC TRỄ HẠN", formatted)
        self.assertIn("Báo cáo tài chính quý 3", formatted)

    def test_chatbot_service_routes_enterprise_intent(self):
        config = {
            "CHATBOT_ENABLED": True,
            "CHATBOT_PROVIDER": "external-webhook",
            "CHATBOT_API_URL": "https://knowledge-ai.gonapp.net/api/v1/chat",
            "CHATBOT_API_KEY": "test-key",
            "CHATBOT_MODEL": "test-model",
        }
        service = ChatbotService(SimpleNamespace(config=config))

        user_context = {
            "id": "admin-1",
            "username": "boss",
            "full_name": "Tổng Giám Đốc",
            "role": "admin",
            "department": "Ban Giám Đốc",
            "tenant_id": "tenant-test",
        }

        with patch.object(enterprise_ai_tools, "execute_enterprise_tool") as mock_exec:
            mock_exec.return_value = {
                "date": "2026-10-16",
                "total_employees": 5,
                "present_count": 5,
                "late_count": 0,
                "remote_count": 0,
                "not_checked_in_count": 0,
                "employees": [],
            }
            reply_result = asyncio.run(service.reply(
                message="kiểm tra nhân viên hôm nay có làm việc không",
                user=user_context,
            ))
            self.assertEqual(reply_result.get("provider"), "enterprise-tools")
            self.assertEqual(reply_result.get("tool_called"), "get_employee_attendance_status")
            self.assertIn("BÁO CÁO TÌNH HÌNH LÀM VIỆC", reply_result.get("reply", ""))


if __name__ == "__main__":
    unittest.main()
