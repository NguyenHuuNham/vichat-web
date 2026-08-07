# Tinode cho SÃ”NG Há»’NG Chat

Bá»™ nÃ y cháº¡y hai service:

- `tinode`: mÃ¡y chá»§ chat realtime chÃ­nh thá»©c cá»§a Tinode, cá»•ng `6060`.
- `postgres`: nÆ¡i lÆ°u tÃ i khoáº£n, nhÃ³m, thÃ nh viÃªn vÃ  toÃ n bá»™ tin nháº¯n.

Ba Docker named volumes giá»¯ dá»¯ liá»‡u qua cÃ¡c láº§n restart hoáº·c thay container:

- `songhong-chat_tinode_postgres_data`: database chÃ­nh.
- `songhong-chat_tinode_uploads`: áº£nh vÃ  tá»‡p Ä‘Ã­nh kÃ¨m.
- `songhong-chat_tinode_botdata`: dá»¯ liá»‡u chatbot Tinode náº¿u báº­t sau nÃ y.

## Cháº¡y láº§n Ä‘áº§u trÃªn Windows

1. CÃ i Docker Desktop vÃ  má»Ÿ Docker Desktop.
2. Tá»« thÆ° má»¥c gá»‘c dá»± Ã¡n, cháº¡y:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\infrastructure\tinode\start.ps1
   ```

3. Khá»Ÿi Ä‘á»™ng láº¡i Vite. Script táº¡o `.env.local` Ä‘á»ƒ web dÃ¹ng `ws://127.0.0.1:6060`.
4. ÄÄƒng nháº­p báº±ng cÃ¡c tÃ i khoáº£n trong `tai khoan noi bo trong PostgreSQL`, vÃ­ dá»¥ `admin` / `123456`.

CÃ¡c tÃ i khoáº£n SÃ”NG Há»’NG Ä‘Æ°á»£c náº¡p vÃ o PostgreSQL á»Ÿ láº§n táº¡o database Ä‘áº§u tiÃªn tá»« `songhong-data.json`. File nÃ y khÃ´ng Ä‘Æ°á»£c cháº¡y láº¡i khi database Ä‘Ã£ tá»“n táº¡i, vÃ¬ váº­y restart khÃ´ng ghi Ä‘Ã¨ tin nháº¯n.

## Dá»«ng mÃ  khÃ´ng máº¥t dá»¯ liá»‡u

```powershell
powershell -ExecutionPolicy Bypass -File .\infrastructure\tinode\stop.ps1
```

KhÃ´ng cháº¡y `docker compose down -v` náº¿u muá»‘n giá»¯ tin nháº¯n. Tham sá»‘ `-v` xÃ³a volume database.

## ÄÆ°a lÃªn server tháº­t

TrÃªn mÃ¡y chá»§ cÃ³ Docker, dÃ¹ng cÃ¹ng `compose.yaml`, Ä‘áº·t reverse proxy HTTPS/WSS trÆ°á»›c cá»•ng `6060`, sau Ä‘Ã³ build frontend vá»›i:

```dotenv
VITE_TINODE_HOST=chat-api.ten-mien-cua-ban.vn
VITE_TINODE_API_KEY=AQEAAAABAAD_rAp4DJh05a1HAwFT3A6K
VITE_TINODE_SECURE=true
VITE_TINODE_TRANSPORT=ws
VITE_TINODE_PERSIST=false
VITE_TINODE_APP_NAME=SONGHONG/1.0
```

Giữ cache IndexedDB của trình duyệt ở trạng thái tắt. Tinode/chatapi vẫn là
nguồn dữ liệu chuẩn và giao diện tải lại lịch sử từ máy chủ; bật cache với
phiên bản SDK hiện tại có thể tạo lỗi khóa tin nhắn trùng và làm treo giao diện.

Cáº­p nháº­t `TINODE_CORS_ORIGINS` trong `infrastructure/tinode/.env` thÃ nh JSON chá»©a domain frontend rá»“i cháº¡y láº¡i `docker compose up -d`.

## Sao lÆ°u PostgreSQL

```powershell
docker compose --env-file .\infrastructure\tinode\.env -f .\infrastructure\tinode\compose.yaml exec -T postgres pg_dump -U postgres -d tinode -Fc -f /tmp/tinode.dump
docker compose --env-file .\infrastructure\tinode\.env -f .\infrastructure\tinode\compose.yaml cp postgres:/tmp/tinode.dump .\tinode-backup.dump
```

Giá»¯ cáº£ file backup vÃ  `infrastructure/tinode/.env`: khÃ³a `UID_ENCRYPTION_KEY` lÃ  cáº§n thiáº¿t Ä‘á»ƒ Ä‘á»c Ä‘Ãºng cÃ¡c ID Ä‘Ã£ lÆ°u.
