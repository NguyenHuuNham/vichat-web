# Chatbot dùng dữ liệu nội bộ

ChatManager đã được thêm vào Chat Service theo luồng RAG:

1. Quản trị viên tạo kho tri thức.
2. Tải PDF/TXT/Markdown/CSV/JSON hoặc gửi nội dung văn bản.
3. Service trích xuất và chia tài liệu thành các đoạn trong PostgreSQL.
4. Khi người dùng hỏi, ChatManager chỉ lấy dữ liệu đúng tenant và phạm vi phòng ban.
5. Dữ liệu phù hợp được gửi cùng câu hỏi tới API AI; câu trả lời trả về kèm nguồn.

Tin nhắn chat vẫn do Tinode lưu. PostgreSQL của Chat Service lưu tài liệu nguồn, đoạn tra cứu và nhật ký chatbot.

## 1. Khởi tạo PostgreSQL và Redis

Chat Service có database riêng, không dùng chung database `tinode`. Từ thư mục gốc dự án:

```powershell
Copy-Item .\infrastructure\chatservice\.env.example .\infrastructure\chatservice\.env
# Đổi CHATSERVICE_DB_PASSWORD trong file .env, sau đó:
.\infrastructure\chatservice\start.ps1
```

Lần khởi tạo đầu tiên, PostgreSQL tự chạy `chatservice-main/migrations/001_chatbot_knowledge.sql`. Dữ liệu được giữ tại `infrastructure/chatservice/data`, nên restart container không làm mất dữ liệu.

Cấu hình kết nối mặc định cho Chat Service:

```env
SQLALCHEMY_DATABASE_URI=postgresql://chatservice:<CHATSERVICE_DB_PASSWORD>@127.0.0.1:5434/chatservice
REDIS_ADDR=127.0.0.1
REDIS_PORT=6380
REDIS_DB=0
```

Nếu database đã tồn tại, chạy migration thủ công:

```powershell
Get-Content .\chatservice-main\migrations\001_chatbot_knowledge.sql -Raw |
  docker compose --env-file .\infrastructure\chatservice\.env -f .\infrastructure\chatservice\compose.yaml exec -T postgres `
  psql -U chatservice -d chatservice
```

## 2. Cấu hình chatbot

Sao chép các biến trong `.env.chatbot.example` vào môi trường Chat Service:

```env
CHATBOT_ENABLED=true
CHATBOT_REQUIRE_AUTH=true
CHATBOT_API_URL=https://api.openai.com/v1/chat/completions
CHATBOT_API_KEY=replace-on-server
CHATBOT_MODEL=your-model-name
CHATBOT_DEFAULT_TENANT=songhong
CHATBOT_KNOWLEDGE_ONLY=true
CHATBOT_KNOWLEDGE_REQUIRE_AUTH=true
```

Không đưa `CHATBOT_API_KEY` vào frontend hoặc commit lên Git. Endpoint có thể là OpenAI hoặc một server nội bộ tương thích OpenAI.

Frontend cần:

```env
VITE_CHATBOT_API_URL=http://127.0.0.1:8093/api/v1/chatbot/message
VITE_CHATBOT_KNOWLEDGE_BASE_ID=<uuid-kho-tri-thuc-tuy-chon>
```

## 3. Nạp dữ liệu

API quản lý dữ liệu yêu cầu session hiện tại hoặc header nội bộ:

```text
X-INTERNAL-TOKEN: <INTERNAL_ACCESS_TOKEN>
X-Tenant-Id: songhong
```

Tạo kho tri thức:

```http
POST /api/v1/chatbot/knowledge/bases
Content-Type: application/json

{
  "code": "quy-trinh-noi-bo",
  "name": "Quy trình nội bộ",
  "description": "Các quy trình đã được phê duyệt",
  "access_scope": "COMPANY"
}
```

Nạp văn bản:

```http
POST /api/v1/chatbot/knowledge/documents
Content-Type: application/json

{
  "knowledge_base_id": "<uuid>",
  "title": "Quy trình xin nghỉ phép",
  "content": "Nội dung quy trình..."
}
```

Nạp tệp bằng `multipart/form-data`:

```text
POST /api/v1/chatbot/knowledge/documents/upload
file=<PDF/TXT/MD/CSV/JSON>
knowledge_base_id=<uuid>
title=<tùy chọn>
```

API hỗ trợ:

- `GET/POST /api/v1/chatbot/knowledge/bases`
- `GET/POST /api/v1/chatbot/knowledge/documents`
- `POST /api/v1/chatbot/knowledge/documents/upload`
- `DELETE /api/v1/chatbot/knowledge/documents/<uuid>`
- `POST /api/v1/chatbot/knowledge/search`
- `GET /api/v1/chatbot/health`
- `POST /api/v1/chatbot/message`

Khi `CHATBOT_KNOWLEDGE_ONLY=true` mà không tìm thấy dữ liệu phù hợp, service không gọi AI và trả lời rằng dữ liệu nội bộ chưa đủ.

## 4. Triển khai an toàn

- Dùng PostgreSQL production có backup định kỳ.
- Chỉ cấp API nạp/xóa dữ liệu cho quản trị viên hoặc service nội bộ.
- Dùng HTTPS và giữ secret trong secret manager.
- Dữ liệu theo phòng ban dùng `access_scope=DEPARTMENT` và `allowed_department_ids`.
- Giai đoạn hiện tại tìm kiếm từ khóa có hỗ trợ tiếng Việt không dấu. Khi dữ liệu lớn, có thể đổi `embedding` sang pgvector mà không đổi API ChatManager.
