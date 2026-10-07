# Hướng dẫn Deploy Zalo OA Synchronization lên Server Production

Thư mục chứa các gói triển khai sẵn tại máy: `D:\vichat-build\deploy-packages\`
- Gói Chatbot: `D:\vichat-build\deploy-packages\deploy-chatbot-zalo.tar.gz` (hoặc `.zip`)
- Gói ViChat: `D:\vichat-build\deploy-packages\deploy-vichat-chatmgt.tar.gz` (hoặc `.zip`)

---

## 1. Triển khai phía Chatbot (`chatbot.gonplatform.com`)

Gói file: `deploy-chatbot-zalo.tar.gz`

### Bước 1: Copy file lên Server Chatbot
Từ máy tính (hoặc công cụ SCP/SFTP/MobaXterm):
```bash
scp D:\vichat-build\deploy-packages\deploy-chatbot-zalo.tar.gz <user>@<server-chatbot-ip>:/path/to/chatbot/
```

### Bước 2: Giải nén đè vào thư mục mã nguồn Chatbot
Trên server Chatbot, tại thư mục gốc của project chatbot:
```bash
tar -xzvf deploy-chatbot-zalo.tar.gz
```
*Các file được cập nhật:*
- `application/controllers/zalo/vichat_bridge.py` (Mới)
- `application/controllers/zalo/__init__.py` (Cập nhật)

### Bước 3: Khởi động lại service Chatbot
```bash
# Nếu chạy bằng Docker:
docker restart <chatbot-container-name>

# Hoặc nếu chạy bằng Supervisor:
supervisorctl restart chatbot

# Hoặc nếu chạy bằng Systemd:
sudo systemctl restart chatbot
```

---

## 2. Triển khai phía ViChat Management (`chatmgt.gonplatform.com`)

Gói file: `deploy-vichat-chatmgt.tar.gz`

### Bước 1: Copy file lên Server ViChat (VPS `192.168.80.20`)
```bash
scp D:\vichat-build\deploy-packages\deploy-vichat-chatmgt.tar.gz ubuntu@103.74.122.206:/tmp/
# Sau đó trên jump host copy tiếp sang 192.168.80.20:
scp /tmp/deploy-vichat-chatmgt.tar.gz ubuntu@192.168.80.20:/tmp/
```

### Bước 2: Giải nén đè vào thư mục mã nguồn `chatservice-main`
Tại thư mục mã nguồn backend trên server (`/opt/deploy/chat/current/chatservice-main/` hoặc container tương ứng):
```bash
tar -xzvf /tmp/deploy-vichat-chatmgt.tar.gz -C /opt/deploy/chat/current/chatservice-main/
```
*Các file được cập nhật:*
- `application/controllers/api_zalo.py` (Mới)
- `application/services/zalo_service.py` (Mới)
- `application/controllers/api_chat_management.py` (Cập nhật)
- `application/controllers/__init__.py` (Cập nhật)

### Bước 3: Khởi động lại container `chatmgt`
```bash
docker restart chatmgt
```
*(Chỉ khởi động lại `chatmgt`, không khởi động lại Tinode hay cơ sở dữ liệu).*

---

## 3. Xác minh sau khi Deploy thành công

1. Kiểm tra endpoint ViChat:
```bash
curl -I https://chatmgt.gonplatform.com/api/v1/zalo/conversations
# Kết quả mong đợi: HTTP 200 OK (thay vì HTTP 404 như trước)
```

2. Kiểm tra webhook ViChat:
```bash
curl -I -X POST https://chatmgt.gonplatform.com/api/v1/zalo/webhook
# Kết quả mong đợi: HTTP 200 OK (thay vì HTTP 404)
```

3. Gửi tin nhắn thử trên ứng dụng Zalo tới OA **Gonstack**:
- Mở ViChat Mobile trên OPPO Find X5, chọn tab **Zalo OA**.
- Cuộc trò chuyện sẽ xuất hiện ngay lập tức với nội dung vừa nhắn.
- Nhân viên gõ phản hồi và bấm Gửi: khách nhận được tin nhắn trên Zalo, Bot AI tự động tạm dừng trong 30 phút.
