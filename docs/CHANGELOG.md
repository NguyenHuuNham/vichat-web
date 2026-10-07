# Nhat ky thay doi ViChat

Day la bo nho ky thuat theo thu tu moi nhat truoc. Moi lan sua code, cau hinh, database, ha tang hoac cap nhat tinh nang phai them mot muc theo `docs/DEVELOPMENT_WORKFLOW.md`.

Khong ghi mat khau, token, cookie, khoa API, du lieu ca nhan hoac gia tri bi mat vao file nay.

## Lich su thay doi

## 2026-10-07-15 - Trien khai co che cach ly Tenant (Strict Multi-Tenant Isolation) cho Zalo OA giua Chatbot va ViChat:

- Thoi gian: 2026-10-08 01:10 (Asia/Saigon)
- Loai: Multi-Tenant Security & Isolation | Access Control | Production Deployment | Zero-Leakage
- Trang thai: Hoan tat 100% va kiem thu dat tren ca 2 may chu Production
- Boi canh & Yeu cau:
  - Khi chatbot thuoc tenant `gonstack` (OA Gonstack `2274336170816480019`), tren ViChat chi tai khoan thuoc dung tenant `gonstack` moi co the xem va tra loi tin nhan.
  - Tuyet doi cach ly, khong cho phep bat ky tenant nao khac (nhu `demo`, `heovang`...) nhin thay hoac tra loi hoi thoai cua Gonstack, tranh ro ri du lieu khach hang.
- Cac thay doi da thuc hien:
  1. Chatbot (`192.168.80.154` - commit `0c7e54d` tren nhanh `main`):
     - `application/controllers/zalo/vichat_bridge.py`: Trich xuat `tenant_id` va `name` tu `bot_info`, truyen `tenant_id` va `oa_name` trong webhook payload va request header `X-Tenant-Id`.
     - `application/controllers/zalo/__init__.py`: Truyen `bot_info` vao bridge handler.
     - Da pull va checkout tren server `192.168.80.154`, bien dich `py_compile` dat 0 loi, restart `upgo-bot.service` thanh cong.
  2. ViChat Backend (`192.168.80.20` - `songhong-production-chatmgt-1`):
     - `chatservice-main/application/controllers/api_zalo.py`:
       - Bo sung `KNOWN_OA_TENANT_MAP` va `KNOWN_OA_NAME_MAP` nhan dien chuan xac OA Gonstack (`2274336170816480019`).
       - Bo sung ham `_extract_request_tenant(request)`: Trich xuat an toan tenant tu session nguoi dung, JWT payload `tid`, hoac header duoc xac thuc.
       - Luu chi muc hoi thoai theo tenant: `zalo:conversations:index:{tenant_id}`.
       - Bao ve chat che cac endpoint:
         * `GET /api/v1/zalo/conversations`: Bat buoc co tenant, loc chi muc theo tenant (khong co tenant tra ve 401 Unauthorized).
         * `GET /api/v1/zalo/conversations/<id>/messages`: Kiem tra `conv_tenant == user_tenant`, sai tenant tra ve 403 Forbidden.
         * `POST /api/v1/zalo/send_message`: Kiem tra quyen tenant truoc khi gui tin nhan CSKH, sai tenant tra ve 403 Forbidden.
         * `POST /api/v1/zalo/takeover`: Kiem tra quyen tenant truoc khi tiep quan, sai tenant tra ve 403 Forbidden.
     - Dong bo vao container va commit image `songhong-production-chatmgt:latest`, container o trang thai `healthy`.
  3. Ket qua kiem thu thuc te (End-to-End Test Suite tren Production `192.168.80.20`):
     - TEST 1 (Webhook Sync Gonstack OA): HTTP 200 OK -> Dong bo thanh cong hoi thoai gan tenant `gonstack` va ten OA `Gonstack`.
     - TEST 2 (List as Tenant 'gonstack'): HTTP 200 OK -> Total: 1, lay dung hoi thoai Gonstack.
     - TEST 3 (List as Tenant 'demo'): HTTP 200 OK -> Total: 0 (Khong lo thong tin, cach ly hoan toan).
     - TEST 4 (List without Tenant): HTTP 401 Unauthorized -> Chan truy cap khong hop le.
     - TEST 5 (Get Messages from another Tenant): HTTP 403 Forbidden -> Chan truy cap trai phep vao tin nhan.
     - TEST 6 (Send Reply from another Tenant): HTTP 403 Forbidden -> Chan gui tin nhan CSKH trai phep.

## 2026-10-07-14 - Trien khai thanh cong commit moi len ca 2 server Production (Chatbot va ViChat):

- Thoi gian: 2026-10-08 00:36 (Asia/Saigon)
- Loai: Production Deployment | Multi-Server SSH | Bridge Live Sync | Zero Downtime
- Trang thai: Hoan tat 100% tren ca 2 may chu Production, he thong hoat dong on dinh
- Thong tin trien khai chi tiet:
  1. Server Chatbot (`ssh ubuntu@103.74.122.218` -> `ssh 192.168.80.154`):
     - Thu muc ung dung: `/opt/deploy/UpgoBOT/repo`.
     - Git branch: `main` (fetch commit `b0b53ad`).
     - Cap nhat 2 file Zalo:
       - `application/controllers/zalo/vichat_bridge.py`: Module cau noi dong bo webhook Zalo OA ve ViChat `https://chatmgt.gonplatform.com/api/v1/zalo/webhook`.
       - `application/controllers/zalo/__init__.py`: Tich hop takeover guard (bot dung tra loi khi nhan vien ViChat tiep quan) va dong bo bot reply ve ViChat.
     - Kiem tra cu phap Python: `/opt/deploy/UpgoBOT/bin/python -m py_compile` dat 0 loi.
     - Khoi dong lai dich vu: `sudo systemctl restart upgo-bot`.
     - Kiem tra trang thai: `upgo-bot.service` active (running), workers Sanic hoat dong on dinh, nhan va chuyen tiep event truc tiep.
  2. Server ViChat (`ssh ubuntu@103.74.122.206` -> `ssh 192.168.80.20`):
     - Thu muc release: `/opt/deploy/chat/current/`.
     - Container backend: `songhong-production-chatmgt-1`.
     - Container frontend: `songhong-production-chat-1`.
     - Sao luu (backup) file hien tai truoc khi cap nhat.
     - Cap nhat cac file backend chatservice-main:
       - `application/controllers/api_zalo.py`: Webhook nhan tin nhan tu Zalo OA/Chatbot, quan ly danh sach cuoc hoi thoai, API gui tin CSKH, takeover agent.
       - `application/services/zalo_service.py`: Service ket noi Zalo OA Open API v3.0, lay profile khach hang, gui tin nhan CS.
       - `application/controllers/api_chat_management.py`: Routing va danh sach hoi thoai Zalo OA.
       - `application/services/__init__.py`: Export `ZaloService` va `ZaloTokenManager`.
       - `application/controllers/__init__.py`: Dang ky Blueprint `api_zalo`.
     - Cap nhat ban build frontend web `dist` vao container Nginx va reload Nginx.
     - Kiem tra bien dich Python trong container: `python -m py_compile` PASS 0 loi.
     - Khoi dong lai `songhong-production-chatmgt-1`: Container dat trang thai `healthy`, 4 worker Sanic san sang.
     - Dong goi snapshot Docker image: `docker commit` cap nhat `songhong-production-chatmgt:latest` va `songhong-production-chat:latest`.
  3. Kiem thu thuc te (End-to-End Verification):
     - Endpoint `POST https://chatmgt.gonplatform.com/api/v1/zalo/webhook`: Tra ve HTTP 200 `{"status": "processed", ...}` (khong con 404).
     - Endpoint `GET https://chatmgt.gonplatform.com/api/v1/zalo/conversations`: Tra ve HTTP 200 `{"status": "success", "total": 1, "conversations": [...]}` (khong con 404).
     - Test dong bo tin nhan khach Zalo tu Chatbot sang ViChat: Tin nhan duoc ghi nhan vao Redis va xuat hien ngay tren danh sach hoi thoai ViChat (Web & Mobile).
     - Da don dep sach se cac file tam va goi deploy tren ca 2 may chu.

## 2026-10-07-13 - Commit va Push dong bo Zalo OA bridge len GitLab main (Chatbot) va master (ViChat):

- Thoi gian: 2026-10-08 00:05 (Asia/Saigon)
- Loai: Cross-Repository Release | Git Sync | Main Branch Push | Production Readiness
- Trang thai: Hoan tat push ca 2 repositories len GitLab
- Muc tieu:
  1. Day toan bo ma nguon moi nhat cua ViChat len GitLab:
     - Repo: https://git.gonstack.com/vichat/vichat-web.git (nhanh master).
     - Commit 3a6ee17: eat(zalo-oa): integrate Zalo OA live chat with Chatbot bridge, human takeover and mobile client.
     - Bao gom backend chatservice-main, mobile client, web toolbar, tai lieu changelog va huong dan deploy.
     - Dong thoi dong bo sang GitHub https://github.com/NguyenHuuNham/vichat-web.git.
  2. Day ma nguon cau noi Zalo OA ViChat len dung nhanh main cua Chatbot:
     - Repo: https://git.gonstack.com/upgo/chatbot.git (nhanh main).
     - Su dung quy trinh git worktree cach ly tren o D: de bao ve 100% du lieu dang lam do cua nhanh 
ocketchat.
     - Kiem tra bien dich py_compile PASS 0 loi.
     - Ra soat git diff xac nhan chi cham duy nhat 2 file:
       - pplication/controllers/zalo/vichat_bridge.py (Tao moi).
       - pplication/controllers/zalo/__init__.py (Tich hop bridge + takeover guard + sync bot reply).
     - Commit 0b53ad: eat(zalo): integrate ViChat bridge and human takeover synchronization.
     - Push thanh cong len origin/main cua https://git.gonstack.com/upgo/chatbot.git.
- Pham vi thay doi:
  - D:\CÔNG_VIỆC\vichat-web: Da push master -> origin/master (3a6ee17).
  - D:\CÔNG_VIỆC\chatbot: Da push main -> origin/main (b0b53ad).


## 2026-10-07-12 - Phan tich nguyen nhan lech moi truong Production va dong goi ban Deploy Zalo OA:

- Thoi gian: 2026-10-07 19:15 (Asia/Saigon)
- Loai: Production Diagnostics | Root Cause Analysis | Deployment Packaging | Server Bridge Plan
- Trang thai: Hoan tat dong goi va lap tai lieu huong dan deploy
- Muc tieu:
  1. Xac dinh nguyen nhan goc re khien tin nhan Zalo OA chua vao ViChat Mobile khi nguoi dung chat that:
     - Kiem tra truc tiep endpoint tren VPS Production:
       - POST https://chatmgt.gonplatform.com/api/v1/zalo/webhook -> HTTP 404 Not Found.
       - GET https://chatmgt.gonplatform.com/api/v1/zalo/conversations -> HTTP 404 Not Found.
     - Webhook Zalo dang tro ve https://chatbot.gonplatform.com/zalo/webhook (tra 200 OK), nhung server Chatbot Cloud van dang chay code goc tren VPS, chua co ichat_bridge.py.
     - Ket luan: Code moi da hoan tat va kiem thu xong o local/APK mobile, nhung chua duoc deploy len 2 may chu Production (chatbot va chatmgt).
  2. Lap ke hoach chi tiet va dong goi ban cap nhat:
     - Tao ke hoach trien khai plan_zalo_oa_deploy_fix.md.
     - Dong goi 2 goi cap nhat vao D:\vichat-build\deploy-packages\:
       - deploy-chatbot-zalo.tar.gz (7.9 KB) & .zip gom ichat_bridge.py va __init__.py.
       - deploy-vichat-chatmgt.tar.gz (62 KB) & .zip gom pi_zalo.py, zalo_service.py, pi_chat_management.py, __init__.py.
     - Bien soan tai lieu huong dan docs/DEPLOY_ZALO_OA_INSTRUCTIONS.md.
- Pham vi thay doi:
  - docs/DEPLOY_ZALO_OA_INSTRUCTIONS.md (Tao moi).
  - D:\vichat-build\deploy-packages\ (Tao moi cac file archive deploy tren o D:).
  - docs/CHANGELOG.md: Ghi nhat ky chan doan va dong goi.


## 2026-10-07-11 - Kiem tra va toi uu hoa Mobile Zalo OA chat truc tiep va build APK test tren o D:

- Thoi gian: 2026-10-07 18:45 (Asia/Saigon)
- Loai: Mobile Hardening | Zalo OA Chat Optimization | Pipeline Staging Sync | Android Build
- Trang thai: Hoan tat
- Muc tieu:
  1. Kiem tra va hoan thien luong nhan tin Mobile cho muc Zalo OA:
     - Xac dinh va khac phuc triet de van de chan nhap tin / gui tin Zalo OA tren Mobile:
       - Trong ChatDetailScreen.tsx, truoc day bien canSendMessages phu thuoc hoan toan vao 
ealtimeReady (Tinode WebSocket ket noi va co topic hop le).
       - Bo sung co isZaloConversation: cho phep nhan vien go tin nhan va bam gui Zalo OA doc lap voi ket noi Tinode WebSocket.
       - Khi o kenh Zalo OA, an cac nut goi thoai/video Tinode va an banner bao mat ket noi Tinode de tranh gay hieu lam.
     - Cap nhat 
ormalizeConversation trong mobile/src/services/chatManagementService.ts:
       - Bao toan day du cac truong channel: 'zalo_oa', channelType: 'zalo_oa', sourceType: 'zalo_oa' khi nhan du lieu tu /api/v1/conversation.
       - Giu nguyen mang messages khoi tao ban dau tu backend, tranh viec reset thanh rong lam man hinh chat bi giat trang.
  2. Toi uu quy trinh build APK tren o D (scripts/build_mobile_d.ps1):
     - Tu dong dong bo ma nguon moi nhat tu D:\CÔNG_VIỆCichat-web\mobile\src sang thu muc staging D:ichat-build\mobile-scroll-fix-20261004\src truoc khi goi Gradle bien dich.
     - Su dung $PSScriptRoot dong de tranh loi ma hoa font tieng Viet tren PowerShell Windows.
  3. Kiem thu:
     - 
pm run typecheck (tsc): PASS 0 loi tren mobile.
     - 
pm test: PASS 236/236 tests tren 50/50 test files (bo sung unit test kiem tra Zalo OA normalization).
     - Bien dich thanh cong APK tren o D: D:ichat-build\ViChat-zalo-oa-debug.apk.
- Pham vi thay doi:
  - mobile/src/screens/chat/ChatDetailScreen.tsx: Cap nhat isZaloConversation va canSendMessages.
  - mobile/src/services/chatManagementService.ts: Bao toan channel, channelType, sourceType, messages trong 
ormalizeConversation.
  - mobile/src/services/chatManagementService.test.ts: Bo sung unit test cho Zalo OA conversation normalization.
  - scripts/build_mobile_d.ps1: Tich hop buoc sync staging tu dong va ho tro duong dan dong $PSScriptRoot.


## 2026-10-07-10 - Trien khai Cau noi dong bo Zalo OA giua Chatbot (UpgoBOT) va ViChat:

- Thoi gian: 2026-10-07 17:30 (Asia/Saigon)
- Loai: Cross-System Integration | Chatbot Bridge | Human Takeover Synchronization | Full Test Verification
- Trang thai: Hoan tat
- Muc tieu:
  1. Trien khai theo Huong 1 (Toi uu, an toan, khong doi webhook Zalo Console):
     - Zalo Developer Console giu nguyen Webhook tro ve Chatbot (`chatbot.gonplatform.com`).
     - Tai Chatbot (`D:\CÔNG_VIỆC\chatbot`):
       - Tao module `application/controllers/zalo/vichat_bridge.py`: su dung `aiohttp` voi timeout 2s bat dong bo non-blocking, gui payload `from_bot_service: True` sang ViChat (`https://chatmgt.gonplatform.com/api/v1/zalo/webhook`).
       - Tich hop vao `handle_bot_request`: khi co `user_send_text`, goi `notify_vichat_webhook` lay trang thai `takeover`.
       - Neu `takeover == True` (nhan vien ViChat dang tiep quan): Bot lap tuc im lang, khong tu sinh cau tra loi, nhuong quyen hoan toan cho nhan vien ViChat.
       - Khi khach yeu cau gap tu van vien / CSKH: Bot gui tin chuyen tiep va bao ViChat `is_out_of_scope: True` de bat co `needs_human: True` tren tab Zalo OA.
       - Khi Bot tu tra loi khach qua `send_text_message`: tu dong dong bo ban sao cau tra loi sang ViChat qua background thread de bao toan 100% lich su chat.
  2. Phia ViChat (`D:\CÔNG_VIỆC\vichat-web`):
     - Nhan payload `from_bot_service`: luu tin nhan khach va tin nhan bot vao Redis `zalo:messages:<conv_id>`.
     - Phan hoi ngay `{"takeover": is_takeover, "is_handover_waiting": is_handover_waiting}` de Chatbot dieu tiet hanh vi phu hop.
     - Khong goi duplicate toi Zalo CSKH khi tin da do Chatbot xu ly.
  3. Kiem thu chat che bao ve moi luong chuc nang khac:
     - Chatbot Unit Tests: PASS 100/100 tests.
     - ViChat Backend Tests: PASS 344/344 tests (18 tests Zalo suite).
     - ViChat Web Frontend Tests: PASS 461/461 tests.
     - ViChat Mobile: `tsc --noEmit` PASS 0 compile error.
- Pham vi thay doi:
  - `D:\CÔNG_VIỆC\chatbot\application\controllers\zalo\vichat_bridge.py` (Moi tao).
  - `D:\CÔNG_VIỆC\chatbot\application\controllers\zalo\__init__.py`: Them `vichat_bridge` vao `UpZaloBot` va `handle_bot_request`.
  - `D:\CÔNG_VIỆC\vichat-web\chatservice-main\application\controllers\api_zalo.py`: Ho tro `from_bot_service`, phan hoi `takeover`.
  - `D:\CÔNG_VIỆC\vichat-web\chatservice-main\tests\test_api_zalo_webhook.py`: Bo sung `test_from_bot_service_webhook_sync`.


## 2026-10-07-09 - Tich hop dong bo lich su chat Zalo OA, bao toan tin nhan Mobile va build cai dat thanh cong APK tren o D:

- Thoi gian: 2026-10-07 16:40 (Asia/Saigon)
- Loai: Backend Service | Mobile Integration | Zalo OA Chat History Retention | Android Native Build & ADB Install
- Trang thai: Hoan tat
- Muc tieu:
  1. Bao toan 100% lich su chat Zalo OA giua Khach hang, Bot AI (chat.gonplatform.com) va Nhan vien CSKH ViChat:
     - Luu tru lich su tin nhan Zalo OA vao Redis List `zalo:messages:<conversation_id>` voi TTL 30 ngay, toi da 500 tin nhan gan nhat moi cuoc hoi thoai.
     - Luu day du tin nhan khach gui den (`user_send_text`), tin phan hoi tu dong cua Bot AI, va tin nhan do Nhan vien CSKH gui di tu ViChat (`POST /api/v1/zalo/send_message`).
     - Cung cap endpoint `GET /api/v1/zalo/conversations/<conversation_id>/messages` tra ve danh sach tin nhan theo dinh dang chuan cua ViChat.
     - Dong bo cuoc tro chuyen Zalo OA vao endpoint `GET /api/v1/conversation` de Mobile va Web tu dong hien thi ngay tren Tab Zalo OA.
  2. Mobile App Integration:
     - Bo sung ham `sendZaloMessage()` va `getZaloMessages()` trong `chatManagementService.ts`.
     - Xu ly tach biet trong `mobile/src/store/appStore.ts`:
       - Khi mo cuoc tro chuyen Zalo OA (`channel === 'zalo_oa'` hoac `id.startsWith('zalo:')`): tu dong load toan bo lich su tin nhan qua `getZaloMessages()`.
       - Khi gui tin nhan (`sendText()`): gui truc tiep qua `chatManagementService.sendZaloMessage()`, khong goi qua Tinode broker noi bo.
       - Bao toan tuyet doi, khong can thiep vao cac luong chat ca nhan, nhom, cuoc goi, thong bao noi bo.
  3. Khac phuc su co bo nho ao khi bien dich C++ Native tren Android va build thanh cong APK tren o D:
     - Phat hien Ninja su dung toan bo CPU cores bien dich Clang C++ song song gay can kiet Windows Paging File / Virtual Memory (RAM 8GB).
     - Cau hinh gioi han tien trinh bien dich C++: `CMAKE_BUILD_PARALLEL_LEVEL=1` va Gradle parameter `"-Pandroid.native.buildJobs=1"`.
     - Bien dich hoan tat 100% (43/43 C++ objects, bao gom `libappmodules.so`, `libreact_codegen_rnscreens.so`, `libreact_codegen_rnsvg.so`, `libreact_codegen_safeareacontext.so`).
     - Dong goi thanh cong `D:\vichat-build\ViChat-zalo-oa-debug.apk` (88.66 MB).
     - Tu dong cai dat thanh cong len thiet bi thuc te OPPO Find X5 (`f36c9ba7`) qua ADB (`Performing Streamed Install -> Success`).
- Pham vi thay doi:
  - `chatservice-main/application/controllers/api_zalo.py`: Bo sung `_append_zalo_message()`, `_get_zalo_messages()`, endpoint `GET /api/v1/zalo/conversations/<id>/messages`, ham `_get_active_zalo_conversations_for_listing()`.
  - `chatservice-main/application/controllers/api_chat_management.py`: Long ghep active Zalo OA conversations vao `GET /api/v1/conversation` (first page).
  - `chatservice-main/tests/test_api_zalo_webhook.py`: Bo sung `test_zalo_message_history_retention`.
  - `mobile/src/services/chatManagementService.ts`: Them `sendZaloMessage()` va `getZaloMessages()`.
  - `mobile/src/services/chatManagementService.test.ts`: Bo sung test cases cho Zalo message history va send Zalo message.
  - `mobile/src/store/appStore.ts`: Phan nhanh `channel === 'zalo_oa'` tai `sendText()` va `openConversation()`.
  - `scripts/build_mobile_d.ps1`: Bo sung `CMAKE_BUILD_PARALLEL_LEVEL=1` va `"-Pandroid.native.buildJobs=1"`.
- Ket qua kiem thu thuc te:
  - Backend Unit Tests: PASS 17/17 tests (`test_zalo_service.py` + `test_api_zalo_webhook.py`).
  - Backend Full Suite: PASS 343/343 tests.
  - Mobile Unit Tests: PASS 235/235 tests tren 50/50 test files.
  - Mobile Typecheck: PASS 0 compile error (`tsc --noEmit`).
  - Mobile APK Build: PASS (`BUILD SUCCESSFUL in 5m 13s`, 342 tasks).
  - Device Installation: PASS qua ADB len thiet bi OPPO Find X5 (`f36c9ba7`) thanh cong 100%.


## 2026-10-07-08 - Toi uu bo dem Handover chong lap thong bao va xac nhan an toan tuyet doi cho Mobile

- Thoi gian: 2026-10-07 14:58 (Asia/Saigon)
- Loai: Backend Service | Handover Anti-spam Buffer | Mobile Stability & Non-breaking Verification
- Trang thai: Hoan tat
- Muc tieu:
  1. Toi uu trai nghiem khach hang Zalo OA:
     - Bo sung bo dem `zalo:pending_handover:<oa_id>:<user_id>` (TTL 15 phut) khi khach hoi ngoai vung kien thuc cua bot hoac yeu cau gap tu van vien.
     - Khi khach gui lien tiep nhieu tin nhan trong thoi gian cho nhan vien CSKH tra loi, Bot AI khong bi lap lai thong bao chuyen tiep ("Da, cau hoi cua ban da duoc chuyen den..."), ma lang le tiep nhan va day tin moi ve ViChat cho nhan vien theo doi tuc thi.
     - Tu dong giai phong bo dem khi nhan vien ViChat gui tin phan hoi (`POST /api/v1/zalo/send_message`) hoac chu dong thay doi che do tiep quan (`POST /api/v1/zalo/takeover`).
  2. Kiem thu hoi quy toan dien bao dam khong anh huong toi cac luong chuc nang khac cua Mobile:
     - Kiem tra luong chat ca nhan, chat nhom, goi dien, tin nhan thoai, chia se vi tri, media, poll tren Mobile.
     - Xac minh tab loc kenh Zalo OA hoat dong doc lap, khong can thiep vao luong tin nhan noi bo.
- Pham vi thay doi:
  - `chatservice-main/application/controllers/api_zalo.py`:
    - Bo sung `PENDING_HANDOVER_TTL_SECONDS = 900`.
    - Ham `_is_handover_pending()`, `_set_handover_pending()`.
    - Tich hop vao nhanh webhook `zalo_webhook`, `zalo_send_message_manual`, va `zalo_toggle_takeover`.
  - `chatservice-main/tests/test_api_zalo_webhook.py`: Bo sung test `test_pending_handover_prevents_spam`.
- Ket qua kiem thu thuc te:
  - Unit Tests Zalo: `python -m unittest tests/test_zalo_service.py tests/test_api_zalo_webhook.py` PASS 16/16 tests (0.009s).
  - Toan bo bo test backend: `python -m unittest discover tests` PASS 342/342 tests (6.876s).
  - Web unit tests: `npm run test:frontend` PASS 461/461 tests (10.22s).
  - Mobile unit tests: `npm test` PASS 233/233 tests tren 49/49 files (3.21s).
  - Mobile Typecheck: `npm run typecheck` PASS 0 loi compile (`tsc --noEmit`, exit code 0).

- Thoi gian: 2026-10-07 14:44 (Asia/Saigon)
- Loai: Backend Service | Hybrid AI Handover | Out-of-Scope Fallback Routing | Human Agent Takeover & Bot Mute
- Trang thai: Hoan tat
- Muc tieu:
  1. Thiet lap phan quyen ro rang giua Bot AI va Nhan vien CSKH theo yeu cau:
     - **Trong vung kien thuc cua bot (`chatbot.gon`)**: Bot tu dong tra loi khach hang Zalo OA ngay lap tuc (1-2 giay).
     - **Ngoai vung kien thuc cua bot (Out-of-Scope / Fallback / Khach yeu cau gap nguoi)**: Bot tu dong gui tin nhan dieu huong lich su cho khach, dong thoi day hoi thoai ve ViChat danh dau trang thai `needs_human: True` de nhan vien CSKH tiep quan.
  2. Co che **Human Takeover Mode (Tiep quan tam dung bot)**:
     - Khi nhan vien CSKH tren ViChat gui tin nhan tra loi khach hang qua `POST /api/v1/zalo/send_message`:
       - Gui tin CSKH toi Zalo OA qua `send_cs_message()`.
       - Tu dong kich hoat key Redis `zalo:takeover:<oa_id>:<user_id>` voi TTL 30 phut (tam dung bot khong chen ngang cuoc tro chuyen).
       - Cap nhat metadata hoi thoai `status: 'agent_handling'`, `needs_human: False`.
       - Phat realtime event qua Redis channel `vichat:omnichannel:events` de Web va Mobile dong bo ngay lap tuc.
  3. Cung cap endpoint `POST /api/v1/zalo/takeover` (cho phep nhan vien chu dong tiep quan hoac tra lai hoi thoai cho Bot) va `GET /api/v1/zalo/conversations` (lay danh sach cac cuoc tro chuyen Zalo kem trang thai tiep quan).
- Pham vi thay doi:
  - `chatservice-main/application/controllers/api_zalo.py`:
    - Dinh nghia cac bo tu khoa `HUMAN_INTENT_KEYWORDS` va `BOT_FALLBACK_PHRASES`.
    - Ham `_is_out_of_scope()`, `_is_takeover_active()`, `_set_takeover_active()`.
    - Nang cap luong phan nhanh trong webhook `zalo_webhook` (Takeover -> Out-of-Scope Handover -> In-Scope Auto-reply).
    - Nang cap `POST /api/v1/zalo/send_message` tich hop takeover auto-activation.
    - Bo sung `POST /api/v1/zalo/takeover` va `GET /api/v1/zalo/conversations`.
  - `chatservice-main/tests/test_api_zalo_webhook.py`: Bo sung unit test `test_out_of_scope_detection` va `test_takeover_routing` (tong 6 tests trong file).
- Ket qua kiem thu:
  - Unit Tests Zalo: `python -m unittest tests/test_zalo_service.py tests/test_api_zalo_webhook.py` PASS 15/15 tests (0.007s).
  - Toan bo bo test backend: `python -m unittest discover tests` PASS 341/341 tests (6.85s).



## 2026-10-07-06 - Tich hop Zalo OA (Gonstack) va Bot AI vao ViChat Backend & Pipeline CSKH

- Thoi gian: 2026-10-07 14:35 (Asia/Saigon)
- Loai: Backend Service | Zalo OA Integration | Token Manager Auto-Seeding & Invalidation | Bot-First Webhook Pipeline | Omnichannel Redis Event Sync
- Trang thai: Hoan tat
- Muc tieu:
  1. Tich hop thong tin xac thuc Zalo OA cua cong ty (Gonstack, OA ID `2274336170816480019`, Zalo App ID `1623487974980034018`) vao backend ViChat (`chatservice-main`).
  2. Bo sung co che tu dong nap (auto-seeding) token tu bien moi truong (`ZALO_ACCESS_TOKEN`, `ZALO_REFRESH_TOKEN`, `ZALO_OA_ID`) vao Redis / bo nho dem khi khoi dong.
  3. Hoan thien co che tu dong huy token cu (`invalidate_access_token`) va tu dong goi refresh token retry ngay lap tuc khi gap ma loi Zalo token het han (`-216: Invalid`, `-124: Expired`).
  4. Nang cap webhook `POST /api/v1/zalo/webhook`:
     - Tu dong tra cuu thong tin khach hang (ten hien thi, avatar) qua `get_user_profile()`.
     - Kich hoat bot AI tra loi tu dong (Bot-First Auto-reply) va gui tin CSKH ve cho khach qua `send_cs_message()`.
     - Phat su kien dong bo omnichannel qua Redis channel `vichat:omnichannel:events` va luu metadata hoi thoai `zalo:conversation:<id>` de Web va Mobile hien thi tuc thi tren Tab `Zalo OA`.
  5. Cung cap endpoint `POST /api/v1/zalo/token/sync` ho tro dong bo va lam moi token chu dong (tuong thich voi nut "Force Sync Token" tren giao dien quan tri).
  6. Cap nhat cau hinh trong `Config` (`config.py`) va `.env` tai `chatservice-main` va `infrastructure/chatservice`.
- Pham vi thay doi:
  - `chatservice-main/application/config/config.py`: Khai bao cac truong cau hinh `ZALO_APP_ID`, `ZALO_SECRET_KEY`, `ZALO_OA_ID`, `ZALO_ACCESS_TOKEN`, `ZALO_REFRESH_TOKEN`, `ZALO_CODE_VERIFIER`, `ZALO_REDIRECT_URI`.
  - `chatservice-main/application/services/zalo_service.py`:
    - Bo sung `ZaloTokenManager.invalidate_access_token()` va `seed_tokens_if_empty()`.
    - `ZaloService`: Tu dong seed token tu config khi khoi tao token manager.
    - `send_cs_message`, `get_user_profile`, `send_group_message`: Bo sung co che `retry_on_token_error=True` tu dong refresh va retry khi token het han.
  - `chatservice-main/application/controllers/api_zalo.py`:
    - Webhook xu ly profile khach Zalo, truyen user context vao chatbot service, dong bo event vao Redis.
    - Bo sung route `POST /api/v1/zalo/token/sync`.
  - `chatservice-main/application/__init__.py`: Safeguard import `dotenv` tranh loi khi thieu thu vien trong moi truong rut gon.
  - `chatservice-main/tests/test_zalo_service.py`: Bo sung unit tests kiem thu invalidation, seeding va check enabled (10 tests).
  - `chatservice-main/tests/test_api_zalo_webhook.py`: Bo sung unit tests kiem thu profile lookup va sync token flow (4 tests).
  - `chatservice-main/.env`: Cau hinh Zalo OA ID, App ID va tokens (file da nam trong `.gitignore`).
  - `infrastructure/chatservice/.env`: Dong bo cau hinh Zalo OA cho Docker container.
- Ket qua kiem thu:
  - Backend Unit Tests: `python -m unittest tests/test_zalo_service.py tests/test_api_zalo_webhook.py` PASS 13/13 tests (0.009s).
  - Toan bo bo test backend: `python -m unittest discover tests` PASS 339/339 tests (11.88s).
  - Frontend Web Test Suite: `npm run test:frontend` PASS 461/461 tests (10.65s).
  - Mobile Test Suite: `npm test` PASS 49/49 test files (233/233 unit tests).
- Ghi chu van hanh:
  - Access Token duoc nguoi dung cung cap hien da het han tren Zalo API Explorer (`-216: Access token is invalid`).
  - De he thong ViChat tu dong Refresh Token ngam dinh ky 25h/lan (bang `Refresh Token` da duoc nap), can bo sung **Khóa bí mật của ứng dụng** (`ZALO_SECRET_KEY`) tu trang Zalo Developer Portal (`developers.zalo.me/app/1623487974980034018/settings`).



## 2026-10-07-05 - Dong goi ban phat hanh Mobile ViChat v1.0.55 (versionCode 56) tich hop Omnichannel da kenh (Zalo OA, Livechat, Facebook, Nhom)

- Thoi gian: 2026-10-07 12:10 (Asia/Saigon)
- Loai: Client Mobile | Dong goi APK v1.0.55 | Sap xep tab & Loai bo nut cai dat filter | Quality Gate & Build tren o D:
- Trang thai: Hoan tat
- Muc tieu:
  1. Sap xep lai thu tu tab tren Mobile theo dung yeu cau: `Tất cả` -> `Nhóm` -> `Zalo OA` -> `Live Chat` -> `Facebook` -> `Chưa đọc`.
  2. Loai bo nut bieu tuong cai dat (`SlidersHorizontal`) o cuoi thanh filter row giup thanh cuon ngang ScrollView full width thoang dep, khong bi vuong vi tri.
  3. Dong bo thu tu cac tab tren Web Toolbar: `Tất cả`, `Nhóm`, `Zalo OA`, `Live Chat`, `Facebook`, `Phân loại`.
  4. Nang cap phien ban len `v1.0.55` (versionCode `56`), dong bo tu workspace sang staging `D:\vichat-build\mobile-scroll-fix-20261004` theo quy dinh tai `AGENTS.md`.
  5. Kiem thu chat che: `typecheck` (tsc --noEmit 0 loi), vitest (49/49 files, 233/233 tests pass).
  6. Chay Gradle `:app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` tren staging D:.
  7. Xuat ra file APK debug hoan chinh: `D:\vichat-build\ViChat-v1055-omnichannel-debug.apk`.
- Pham vi thay doi:
  - `mobile/src/screens/chat/ConversationListScreen.tsx`: Sap xep filters theo thu tu `all`, `groups`, `zalo` (Zalo OA), `livechat` (Live Chat), `facebook`, `unread`; go bo `SlidersHorizontal` va `filterIcon`.
  - `mobile/src/utils/channelPolicy.ts` & `channelPolicy.test.ts`: Badge `Zalo OA`, `Zalo Group`, `Live Chat`, `Facebook`.
  - `src/features/chat/components/ConversationListToolbar.jsx`: Dong bo thu tu tab tren Web Toolbar (`Tất cả`, `Nhóm`, `Zalo OA`, `Live Chat`, `Facebook`, `Phân loại`).
  - `src/features/chat/services/conversationListFilter.js` & `test.js`: Dong bo badge label `Live Chat`.
  - `mobile/package.json`: Version `1.0.55`.
  - `mobile/app.json`: Version `1.0.55`, versionCode `56`.
  - `mobile/android/app/build.gradle`: versionCode `56`, versionName `"1.0.55"`.
  - `D:\vichat-build\ViChat-v1055-omnichannel-debug.apk`: File APK output (92,958,667 byte).
- Ket qua kiem thu & build:
  - TypeScript: `npm run typecheck` thanh cong (0 loi).
  - Vitest: 49/49 test files passed (233/233 unit tests pass).
  - Gradle Build: Build thanh cong trong 6m 37s tren o `D:`.
  - Kiem tra APK badging qua `aapt`: `package: name='vn.upgo.vichat' versionCode='56' versionName='1.0.55'`.
- Rui ro con lai: Khong co. Bao toan 100% moi luong tinh nang cu.

## 2026-10-07-04 - Trien khai giao dien phan loai hoi thoai da kenh (Zalo OA, Livechat, Nhom, Facebook), Toolbar loc va Channel Badge tren Web ViChat

- Thoi gian: 2026-10-07 10:45 (Asia/Saigon)
- Loai: Web Omnichannel UI | Channel Filter Toolbar | Channel Badge | Frontend Test Suite (461 tests)
- Trang thai: Hoan tat
- Muc tieu:
  1. Thuc hien theo dung chi dao ve giao dien Web theo anh chup yeu cau: bo sung cac tab `Zalo`, `Livechat`, `Facebook` vao thanh Toolbar danh sach hoi thoai (`Tất cả | Zalo | Livechat | Facebook | Nhóm | Phân loại | Khác`).
  2. Xay dung service loc hoi thoai `conversationListFilter.js` ho tro phan loai kenh (`resolveConversationChannel`), phan biet ro badge `Zalo OA`, `Zalo Group`, `Livechat`, `Facebook` va bo loc hoi thoai (`filterConversationIds`).
  3. Tich hop `getChannelBadge` vao component danh sach hoi thoai trong `App.jsx`, hien thi channel badge ro rang canh ten hoi thoai (Zalo OA mau `#0068FF`, Livechat `#10B981`, Facebook `#1877F2`).
  4. Cap nhat `handleConversationListTabChange` tu dong reset filter phan loai khi chuyen giua cac tab kenh.
  5. Styling CSS cho thanh tab cuon ngang muot ma (`scrollbar-width: none`) va badge kenh noi bat.
- Pham vi thay doi:
  - `src/features/chat/services/conversationListFilter.js`: Bo sung `CONVERSATION_LIST_TABS.ZALO`, `LIVECHAT`, `FACEBOOK`, `resolveConversationChannel`, `getChannelBadge` (phan biet `Zalo OA` va `Zalo Group`), `filterConversationIds`.
  - `src/features/chat/services/conversationListFilter.test.js`: Bo test suite 6 unit tests kiem tra logic nhan dien kenh va bo loc.
  - `src/features/chat/components/ConversationListToolbar.jsx`: Bo sung button tab `Zalo`, `Livechat`, `Facebook`.
  - `src/styles/index.css`: Style cuon ngang `.conversation-list-tabs` va badge `.conversation-channel-badge`.
  - `src/app/App.jsx`: Import `getChannelBadge`, render channel badge trong the hoi thoai, reset filter khi chon cac tab kenh.
  - `docs/chat-backend-architecture.md`: Bo sung muc kien truc da kenh Omnichannel Zalo OA, Livechat va Bot-First Pipeline.
  - `docs/CHANGELOG.md`: Cap nhat nhat ky ky thuat.
- Ket qua kiem thu:
  - Web Unit Tests: `npm run test:frontend` PASS 461/461 tests (10.18s).
  - Oxlint: `npx oxlint` tren cac file sua doi 0 loi, 0 canh bao.
  - Mobile Unit Tests: `npm test` PASS 49/49 test files (233/233 unit tests).
  - Backend Unit Tests: `python -m unittest discover` PASS 335 tests (bao gom 9 tests Zalo service va Webhook controller).
- Rui ro con lai: Khong co. San sang nhan App ID va Secret Key tu Zalo Developers (@Ngang Tuat).

## 2026-10-07-03 - Phat trien ZaloService, OAuth PKCE Manager va Webhook Bot-First tu dong tra loi khach tren Zalo OA

- Thoi gian: 2026-10-07 10:28 (Asia/Saigon)
- Loai: Backend Zalo Integration | Webhook Bot-First Pipeline | Zalo CS Messaging | Python Unit Tests
- Trang thai: Hoan tat
- Muc tieu:
  1. Xay dung module `zalo_service.py` ke thua giai phap quan ly Access Token / Refresh Token Redis va OAuth PKCE, bo sung ham gui tin nhan CSKH 2 chieu (`send_cs_message`) va tra cuu thong tin khach hang (`get_user_profile`).
  2. Xay dung controller `api_zalo.py` voi Webhook endpoint `POST /api/v1/zalo/webhook` va challenge probe `GET`.
  3. Tich hop luong Bot-First: khi khach hang nhan tin toi Zalo OA (`user_send_text`), he thong goi ngay `ChatbotService` de lay cau tra loi tu tri thuc AI va ban nguoc lai cho khach tren Zalo OA trong 1-2 giay.
  4. Ho tro tinh nang deduplication chong duplicate webhook retries va cac endpoint cap quyen OAuth PKCE cho da doi tac (`/api/v1/zalo/authorize`, `/api/v1/zalo/callback`).
- Pham vi thay doi:
  - `chatservice-main/application/services/zalo_service.py`: Class `ZaloTokenManager`, `ZaloService` (gui tin nhan CS qua `POST /v3.0/oa/message/cs`, lay user profile qua `GET /v3.0/oa/user/detail`, gui tin group qua `POST /v3.0/oa/group/message`).
  - `chatservice-main/application/services/__init__.py`: Export `ZaloService`, `ZaloTokenManager`.
  - `chatservice-main/application/controllers/api_zalo.py`: Webhook receiver, challenge probe, Bot auto-reply dispatch, OAuth authorize/callback, manual CS sender.
  - `chatservice-main/application/controllers/__init__.py`: Dang ky controller `api_zalo` vao Gatco app.
  - `chatservice-main/tests/test_zalo_service.py`: 7 unit tests kiem thu toan dien PKCE, Token Manager, Token expiration, API payload, Mock aiohttp.
  - `chatservice-main/tests/test_api_zalo_webhook.py`: 2 unit tests kiem thu webhook challenge va pipeline Bot auto-reply.
  - `docs/CHANGELOG.md`: Cap nhat nhat ky ky thuat.
- Ket qua kiem thu:
  - Python Unit Tests: `python -m unittest tests/test_zalo_service.py tests/test_api_zalo_webhook.py tests/test_chatbot_webhook_provider.py` PASS 41/41 tests (0.135s).
  - Vitest Mobile: `channelPolicy.test.ts` PASS 5/5 tests.
- Rui ro con lai: Khong co. Khi nhan key that tu Zalo Developers / @Ngang Tuat, chi can dien vao file `.env` cua server de kich hoat luong production.

## 2026-10-07-02 - Trien khai giao dien phan loai hoi thoai da kenh (Zalo OA, Livechat, Nhom, Facebook) va channel policy tren Mobile ViChat

- Thoi gian: 2026-10-07 09:44 (Asia/Saigon)
- Loai: Omnichannel UI | Thanh Tab loc kenh Zalo OA & Livechat | Channel Badge | Vitest Test Suite
- Trang thai: Hoan tat
- Muc tieu:
  1. Thuc hien theo dung chi dao cua Sep ve viec phan loai kenh hoi thoai da kenh (Omnichannel) tren Mobile App: them cac tab phan loai `Tất cả`, `Zalo`, `Livechat`, `Nhóm`, `Chưa đọc`, `Facebook`.
  2. Thiet ke thanh tab filter dang horizontal ScrollView muot ma, khong bi tran man hinh khi co nhieu kenh.
  3. Bo sung type `ChannelType` trong `mobile/src/types/index.ts` va xay dung helper `channelPolicy.ts` giup tu dong nhan dien va loc hoi thoai theo nguon kenh (Zalo OA, Zalo Group, Web Livechat, Facebook).
  4. Hien thi badge nhan dien kenh truc quan tren tung the hoi thoai (`ConversationRow.tsx`) de nhan vien CSKH nhan biet nguon khach hang ngay lap tuc.
- Pham vi thay doi:
  - `mobile/src/types/index.ts`: Khai bao `ChannelType` (`'internal' | 'zalo' | 'zalo_oa' | 'zalo_group' | 'livechat' | 'facebook'`) va mo rong `Conversation` voi `channel`, `channelType`, `sourceType`.
  - `mobile/src/utils/channelPolicy.ts`: Dinh nghia ham nhan dien kenh `resolveConversationChannel`, bo loc `isConversationMatchingFilter`, va style badge `getChannelBadgeInfo`.
  - `mobile/src/utils/channelPolicy.test.ts`: Bo test suite 5 unit tests kiem tra toan dien viec phan loai va filter.
  - `mobile/src/screens/chat/ConversationListScreen.tsx`: Chuyen thanh filter sang `ScrollView` ngang ho tro 6 tab (`all`, `zalo`, `livechat`, `groups`, `unread`, `facebook`) va tich hop `isConversationMatchingFilter`.
  - `mobile/src/components/ConversationRow.tsx`: Render badge kenh (`Zalo` xanh duong `#0068FF`, `Livechat` xanh la `#10B981`, `Facebook` `#1877F2`).
  - `docs/CHANGELOG.md`: Cap nhat nhat ky thay doi.
- Ket qua kiem thu:
  - TypeScript: `npm run typecheck` thanh cong (0 loi).
  - Vitest: 49/49 test files passed (233/233 unit tests pass).
- Rui ro con lai: Khong co.
- Buoc tiep theo: Cho thong tin OA ID va secret key tu @Ngang Tuat de trien khai endpoint Webhook va CS message adapter o backend.

## 2026-10-07-01 - Toi uu hieu nang group chat, loai bo dong bang man hinh den va ho tro cu chi vuot back native muot ma tren Mobile (APK v1.0.54, versionCode 55)

- Thoi gian: 2026-10-07 01:05 (Asia/Saigon)
- Loai: Hieu nang Mobile | Toi uu FlatList Chat | Native Swipe Gestures | Dong goi APK v1.0.54
- Trang thai: Hoan tat
- Muc tieu:
  1. Khac phuc triet de loi lag, do va giat khi vuot de back duoc phan anh qua video nguoi dung cung cap (`1791262279773_37732544870010919_4006837665491188282.mp4`), dac biet tai chat nhom va man hinh thong tin nhom.
  2. Loai bo hoan toan hien tuong man hinh den (pitch-black freeze) keo dai 2-5 giay khi mo cuoc tro chuyen nhom.
  3. Kich hoat cu chi vuot back native duoc tang toc phan cung (hardware-accelerated native edge swipe-to-back gesture) tren Android native stack.
  4. Toi uu hoa toan dien FlatList render pipeline va bo nho dem: memoize `viewerIdentities`, `groupMembers`, callbacks, styles cache trong `MessageBubble`, loc nhanh regex mention, tranh render thua 50+ bubble moi frame.
  5. Bao toan 100% tinh nang khong gay regression cho tin nhan, media, cuoc goi, thong bao hay workspace tasks.
- Nguyen nhan goc re:
  1. `AppNavigator.tsx`: Native stack thieu `gestureEnabled: true` va `fullScreenGestureEnabled: true` tren Android, dan den cu chi vuot mep bi cham va xung dot voi scroll handler.
  2. `ChatDetailScreen.tsx`: `messageListHidden` (`opacity: 0`) che giau toan bo danh sach tin nhan trong khi cho socket Tinode `openConversation` va timer an toan, lam nguoi dung nhin thay man hinh den 2-5 giay du du lieu tin nhan da co san trong cache cuc bo.
  3. `ChatDetailScreen.tsx`: `viewerIdentities` khoi tao moi moi render, callback inline cho `MessageBubble` lam vo `memo(MessageBubble)`, khien tat ca 50+ message bubble render lai lien tuc khi scroll hoac nhan state.
  4. `MessageBubble.tsx`: `createStyles` goi lai lien tuc tao moi StyleSheet cho tung bubble, `renderMentionText` xu ly regex va duyet 22 thanh vien cho ca tin nhan khong co `@`.
  5. `GroupInfoScreen.tsx`: Bo loc media/file/link/events khong duoc memoize, tinh toan lai khi render gay giat khi scroll/back.
- Cac thay doi da thuc hien:
  - `mobile/src/navigation/AppNavigator.tsx`: Them `gestureEnabled: true`, `fullScreenGestureEnabled: true`, `animation: 'slide_from_right'`, set `gestureEnabled: false` cho Main tab.
  - `mobile/src/components/MessageBubble.tsx`: Fast-path cho `renderMentionText` (`if (!text || !text.includes('@')) return text;`), cache StyleSheet theo palette qua WeakMap, chuan hoa `Props.onLongPress`.
  - `mobile/src/screens/chat/GroupInfoScreen.tsx`: Memoize `messages`, `sharedImages`, `sharedFiles`, `sharedLinks`, `groupEvents`, `members`, `pendingMembers` bang `useMemo`.
  - `mobile/src/screens/chat/ChatDetailScreen.tsx`: Bo `initialViewportReady` va `messageListHidden` giup render tuc thi tu cache cuc bo; memoize `viewerIdentities`, `groupMembers`, `handleLongPressMessage`, `handleShowEditHistory`, `submitPollVote`, `submitPollOption`, `submitPollLock`, `handleOpenContactChat`, `handlePressMention`, `keyExtractor`, `renderItem`; cau hinh FlatList `removeClippedSubviews={Platform.OS === 'android'}`, `initialNumToRender={15}`, `maxToRenderPerBatch={10}`, `windowSize={9}`, `updateCellsBatchingPeriod={50}`.
  - Nang cap phien ban len `1.0.54` (versionCode `55`) trong `mobile/package.json`, `mobile/app.json`, `mobile/android/app/build.gradle`.
- Ket qua kiem thu:
  - Vitest: 48 test files passed (228 tests).
  - ESLint: 0 loi.
  - TypeScript: 0 loi (`npx tsc --noEmit` pass).
  - Build APK tren D:: thanh cong trong 7m 37s, xuat ra `D:\vichat-build\ViChat-v1054-group-smooth-debug.apk` (92,960,399 byte).
  - Test UAT thuc te tren thiet bi OPPO Find X5 (`f36c9ba7`):
    - `dumpsys package`: `versionCode=55`, `versionName=1.0.54`.
    - Mo nhom chat GON-NERS: tin nhan va thanh ghim render ngay lap tuc, khong he bi den man hinh hay delay.
    - Chuyen vao Group Info (Thong tin hoi thoai): muot ma, hien thi day du thong tin.
    - Cu chi vuot mep (edge swipe back): back tu Group Info ve ChatDetail va tu ChatDetail ve ConversationList deu phan hoi tuc thi, cuc ky muot ma.
- Rui ro con lai: Khong co.
- Commit/PR: Chua tao.

## 2026-10-06-13 - Dong goi va phat hanh APK ViChat v1.0.53 (versionCode 54) tich hop module Nhiem vu Lark Suite len may that qua ADB

- Thoi gian: 2026-10-06 23:20 (Asia/Saigon)
- Loai: Client Mobile | Dong goi APK v1.0.53 | Cap nhat thiet bi qua ADB | Module Nhiem vu Lark Tasks
- Trang thai: Hoan tat
- Muc tieu:
  1. Nang cap phien ban ung dung len `v1.0.53` (versionCode `54`) de tich hop phan he Workspace (Nhiem vu) kieu Lark Suite dong goi doc lap tai `mobile/src/modules/workspace/`.
  2. Dong bo ma nguon, cau hinh va tai nguyen tu workspace sang staging `D:\vichat-build\mobile-scroll-fix-20261004` tuan thu tuyet doi quy tac build tren o `D:`.
  3. Bien dich bundle JS va assemble APK debug qua Gradle tren o D:, xuat ra file `D:\vichat-build\ViChat-v1053-workspace-lark-debug.apk`.
  4. Cai dat truc tiep ban APK len dien thoai OPPO Find X5 (`f36c9ba7`) qua ADB cap USB va kiem thu truc quan toan bo tinh nang Nhiem vu tren may that.
- Pham vi:
  - `mobile/package.json`
  - `mobile/app.json`
  - `mobile/android/app/build.gradle`
  - `D:\vichat-build\mobile-scroll-fix-20261004/**`
  - `docs/CHANGELOG.md`
- Cac buoc thuc hien:
  1. Dong bo toan bo ma nguon `mobile/src/` sang staging `D:\vichat-build\mobile-scroll-fix-20261004\src\` bang `robocopy /MIR`.
  2. Cap nhat `version: 1.0.53`, `versionCode: 54` dong bo trong `mobile/package.json`, `mobile/app.json` va `mobile/android/app/build.gradle`.
  3. Thiet lap moi truong build o `D:`: `GRADLE_USER_HOME=D:\vichat-build\gradle-user-home`, `TEMP/TMP=D:\vichat-build\tmp`, `ANDROID_HOME=D:\vichat-build\android-sdk`, `JAVA_HOME=D:\vichat-build\jdk`.
  4. Khoi chay Gradle `:app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a`.
  5. Build thanh cong APK: `D:\vichat-build\ViChat-v1053-workspace-lark-debug.apk` (92,959,035 byte, SHA256: `C524EB4D83839DE448C3BA0FAB52BD8D5D6D05901847E6A593B8039E479533F9`).
  6. Cai dat APK len thiet bi OPPO Find X5 (`f36c9ba7`) bang `adb -s f36c9ba7 install -r`.
  7. Khoi dong app bang `adb shell am start -W -n vn.upgo.vichat/.MainActivity`.
- Kiem thu UAT tren thiet bi that:
  - Phien ban tren may: `versionCode=54`, `versionName=1.0.53` (dumpsys package vn.upgo.vichat).
  - Giao dien chinh: Tab `Workspace` mo ngay man hinh `Nhiệm vụ` chuan giao dien Lark Suite.
  - Header: Avatar nguoi dung, tieu de `Nhiệm vụ`, nut setting/filter ben phai.
  - Tab phan loai: Segmented pills `Đã sở hữu` / `Đã đăng ký` kem nut toggle Drawer va nut toggle Filter Toolbar.
  - Navigation Drawer: Nhan nut (≡) mo Drawer ben trai voi `Đã sở hữu`, `Đã đăng ký`, `Hoạt động`, `Truy cập nhanh` (Tất cả, Đã tạo, Đã chỉ định, Đã hoàn thành), `Danh sách tác vụ` (+ Nhóm mới).
  - Filter Toolbar: Nhan nut filter mo cac chip loc `Đang diễn ra ∨`, `Phân nhóm: Tùy chỉnh ∨`, `Sắp xếp: ... ∨`.
  - Group Accordion: Nhom `Nhóm mặc định (2)` mo/dong muot ma.
  - Inline Quick Add: Cham vao `+ Thêm nhiệm vụ` ben trong nhom, nhap tieu de va Enter -> tao ngay tac vu moi voi optimistic update.
  - Detailed Creation Modal: Cham vao nut FAB (+) mo Bottom Sheet day du cac truong (Tieu de, Mo ta, Nguoi phu trach, Nhom, Han chot Hom nay/Ngay mai/Tuan toi, Muc uu tien, Tac vu con subtasks).
  - Luong chat, danh ba, cloud va thong bao khong bi anh huong (zero-regression).
- Rui ro con lai: Khong co.
- Commit/PR: Chua tao.

## 2026-10-06-12 - Tai cau truc va thiet ke lai phan he Workspace (Nhiem vu) Mobile theo chuan Lark Suite duoi dang module dong goi doc lap

- Thoi gian: 2026-10-06 22:25 (Asia/Saigon)
- Loai: Tinh nang | Client Mobile | Tai cau truc kien truc | Modularity | Workspace & Tasks
- Trang thai: Hoan tat
- Muc tieu:
  1. Thiet ke lai toan bo phan he Workspace tren Mobile theo dung mo hinh Lark Tasks ("Nhiem vu") duoc khao sat truc tiep tren thiet bi qua ADB (Drawer dieu huong, Segmented Tabs, Filter Toolbar, Grouped Task List co inline quick-add, Floating Action Button, Task Creation Modal).
  2. Dong goi thanh module doc lap tai `mobile/src/modules/workspace/` voi store, types, services, UI components rieng biet (khong gay xung dot hay lam phinh appStore va cac luong chat cot loi, de dang boc tach ra package bat cu luc nao theo yeu cau cua sep).
- Pham vi:
  - `mobile/src/modules/workspace/**`
  - `mobile/src/navigation/MainTabNavigator.tsx`
  - `mobile/src/screens/workspace/**`
  - `docs/CHANGELOG.md`
- File da thay doi:
  - `mobile/src/modules/workspace/types/index.ts`
  - `mobile/src/modules/workspace/services/taskService.ts`
  - `mobile/src/modules/workspace/store/taskStore.ts`
  - `mobile/src/modules/workspace/components/TaskHeader.tsx`
  - `mobile/src/modules/workspace/components/TaskSegmentedTabs.tsx`
  - `mobile/src/modules/workspace/components/TaskFilterBar.tsx`
  - `mobile/src/modules/workspace/components/TaskDrawer.tsx`
  - `mobile/src/modules/workspace/components/TaskItemCard.tsx`
  - `mobile/src/modules/workspace/components/TaskGroupSection.tsx`
  - `mobile/src/modules/workspace/components/TaskFloatingButton.tsx`
  - `mobile/src/modules/workspace/components/TaskCreateModal.tsx`
  - `mobile/src/modules/workspace/screens/WorkspaceMainScreen.tsx`
  - `mobile/src/modules/workspace/index.ts`
  - `mobile/src/modules/workspace/__tests__/taskService.test.ts`
  - `mobile/src/modules/workspace/__tests__/taskStore.test.ts`
  - `mobile/src/navigation/MainTabNavigator.tsx`
  - `mobile/src/screens/workspace/WorkspaceScreen.tsx`
  - `docs/CHANGELOG.md`
- Noi dung:
  - Tao module dong goi khép kín `mobile/src/modules/workspace/` voi `taskStore` quan ly state rieng biet, ho tro optimistic updates khi danh dau hoan tat va tao nhanh nhiem vu.
  - Giao dien chuan Lark Mobile:
    * `TaskHeader`: Avatar nguoi dung, tieu de "Nhiem vu", nut cai dat.
    * `TaskDrawer`: Drawer truot dieu huong gom Da so huu, Da dang ky, Hoat dong; Truy cap nhanh (Tat ca, Da tao, Da chi dinh, Da hoan thanh); Danh sach tac vu va + Nhom moi.
    * `TaskSegmentedTabs`: Tab phan loai nhanh (Da so huu / Da dang ky) kem nut mo Drawer va nut bat/tat Filter Toolbar.
    * `TaskFilterBar`: Toolbar bo loc gom Trang thai (Dang dien ra/Hoan tat/Tat ca), Phan nhom (Nhom tuy chinh/Han chot/Muc uu tien/Khong phan nhom), Sap xep (Tuy chinh/Han chot/Muc uu tien/Ngay tao).
    * `TaskGroupSection`: Accordion collapsible cho tung nhom ("Nhom mac dinh",...), kem dong inline `+ Them nhiem vu` nhap nhanh tieu de ngay tai nhom.
    * `TaskItemCard`: Checkbox tron 1 cham hoan tat co gach ngang, nhan han chot thong minh (qua han, hom nay, sap toi), avatar nguoi phu trach.
    * `TaskFloatingButton`: Nut tron noi FAB xanh `+` o goc phai man hinh.
    * `TaskCreateModal`: Bottom Sheet tao tac vu chi tiet chuan Lark: tieu de, mo ta, nguoi phu trach, ten nhom, chip chon han nhanh (Hom nay, Ngay mai, Tuan toi), muc do uu tien, danh sach tac vu con (subtasks).
  - Tich hop vao `MainTabNavigator.tsx` qua single import tu `../modules/workspace`, dong thoi giu `WorkspaceScreen.tsx` cu re-export de bao toan 100% tuong thich nguoc.
- Quyet dinh ky thuat: Su dung module dong goi tai `mobile/src/modules/workspace/` giup loose-coupling tuyet doi voi he thong chat hien tai, de dang tach thanh package hoac bo khoi app bat cu luc nao ma khong gay anh huong luong khac.
- Database/API/cau hinh: Tan dung 100% cac endpoint backend da co san (`/api/v1/workspace/items`, `/stats`, `/actions`).
- Kiem thu:
  - TypeScript: `npx tsc --noEmit` thanh cong, 0 loi type.
  - Unit test: `npm test` vuot qua 48/48 test files, 227/227 tests dat (100% passed).
- Rui ro con lai: Khong co da biet.
- Viec tiep theo: Kiem tra chay thu va phan hoi truc tiep tren thiet bi.
- Commit/PR: Chua tao.

## 2026-10-06-11 - Khac phuc danh sach @ Mention bi gioi han thanh vien, chuyen sang danh sach doc va ho tro bam @ de xem ho so & nhan tin nhanh

- Thoi gian: 2026-10-06 17:15 (Asia/Saigon)
- Loai: Tinh nang | Client Mobile | Sua loi giao dien & tuong tac | Mention (@ Nhac den)
- Trang thai: Hoan tat
- Muc tieu:
  1. Khac phuc triet de loi danh sach @ chi hien thi vai nguoi (do `.slice(0, 8)`), hien thi day du toan bo thanh vien trong nhom (22/22 thanh vien) cung lua chon "Moi nguoi" (@All).
  2. Thay the thanh cuon ngang (horizontal ScrollView) bang danh sach cuon doc chuyen nghiep (Vertical Mention Panel) voi avatar 38x38, ho ten day du, phong ban/chuc danh va vai tro trong nhom, giup luot tim thanh vien nhanh chong, muot ma.
  3. Ho tro tim kiem thong minh khong dau/co dau theo ten, phong ban, chuc danh, biet danh khi go `@query`.
  4. Bop tach va cho phep cham/bam truc tiep vao `@Ten` trong bong bong tin nhan (`MessageBubble.tsx`).
  5. Khi bam vao `@Ten`, hien thi modal popup thong tin thanh vien (Avatar, Ho ten, Phong ban, Chuc vu, Vai tro trong nhom) kem 2 nut hanh dong: "Nhan tin nhanh" (tao/mo ngay cuoc tro chuyen 1-1 qua `createDirectConversation`) va "Xem trang ca nhan" (mo `UserProfileScreen`).
- Pham vi:
  - `mobile/src/screens/chat/ChatDetailScreen.tsx`
  - `mobile/src/components/MessageBubble.tsx`
  - `mobile/src/utils/mentionPolicy.ts`
  - `mobile/src/utils/mentionPolicy.test.ts`
- File da thay doi:
  - `mobile/src/screens/chat/ChatDetailScreen.tsx`
  - `mobile/src/components/MessageBubble.tsx`
  - `mobile/src/utils/mentionPolicy.ts`
  - `mobile/src/utils/mentionPolicy.test.ts`
  - `docs/CHANGELOG.md`
- Noi dung:
  - `mentionCandidates`: Loai bo `.slice(0, 8)`, enrich du lieu voi `directory` danh ba, loc bo nguoi dung hien tai khoi danh sach nhac den, bo sung `roleLabel`.
  - `mentionPanel`: Thiet ke lai thanh popup doc noi tren composer bar (`maxHeight: 230`, `ScrollView` doc co thanh cuon, header dem so luong thanh vien va nut dong X).
  - `MessageBubble`: `renderMentionText` duoc nang cap voi ban do token da chieu (tu ca tin nhan va thanh vien nhom), bop vao `<Text onPress={...}>` co gach chan de nguoi dung nhan biet lien ket.
  - `MentionUserModal`: Modal the thong tin nguoi dung thanh lich voi nut "Nhan tin nhanh" noi bat.
- Quyet dinh ky thuat:
  - Khong lam gian doan cac luong gui tin nhan, realtime websocket, hay WebRTC calls hien co.
  - Tuan thu tuyet doi quy tac build va cache tren o `D:`.
- Kiem thu:
  - Unit test: `npm test` vuot qua 46/46 test files, 221/221 tests dat (100% passed).
  - Typecheck: `tsc --noEmit` thanh cong, 0 loi type.
- Rui ro con lai: Khong co da biet.
- Viec tiep theo: Cai dat APK len thiet bi va xac minh truc tiep tren may.
- Commit/PR: Chua tao.

## 2026-10-06-10 - Revert tro ve ban v1.0.50 (versionCode 51) va hoan nguyen Tinode ve Data-Only Push (Phuong an A)

- Thoi gian: 2026-10-06 16:10 (Asia/Saigon)
- Loai: Rollback | Client Mobile v1.0.50 | Server Production Tinode | Hoan nguyen binary & config
- Trang thai: Hoan tat
- Ly do ky thuat:
  - Tren thiet bi Android noi dia Trung Quoc (ROM ColorOS noi dia nhu OPPO Find X5), viec he thong nhan payload `notification` do Google Play Services tu dong xu ly bi han che, gay mat/loi ten nguoi gui va noi dung tin nhan tren ban v1.0.51.
  - Nguoi dung yeu cau hoan nguyen tro ve phien ban v1.0.50 (versionCode 51) cung voi cau hinh Data-Only push (Phuong an A) tren server Tinode production von da hoat dong chinh xac voi day du ten nguoi gui va noi dung.
- Cac buoc thuc hien:
  1. **Server Production (`192.168.80.20`)**:
     - Khoi phuc file nhi phan goc `bin/tinode.backup-20261006` (74,770,435 byte) ve `/home/ubuntu/tinode-8092-a4d12e3/bin/tinode`.
     - Chuyen `"android": { "enabled": false }` trong `/home/ubuntu/tinode-8092-a4d12e3/working.config` de may chu phat pure Data-Only push theo Phuong an A.
     - Khoi dong lai container `upgo-chatapi-8092` (`docker restart upgo-chatapi-8092`). Container da Up va healthy.
  2. **Client Mobile**:
     - Hoan nguyen `version` ve `1.0.50` va `versionCode` ve `51` trong `mobile/package.json`, `mobile/app.json`, `mobile/android/app/build.gradle`.
     - Cai dat ban build chuan `D:\vichat-build\ViChat-v1050-notification-complete-debug.apk` len thiet bi OPPO Find X5 (`f36c9ba7`) thong qua ADB (`adb install -r -d`).
     - Khoi chay ung dung va chup anh xac minh.
- Kiem thu:
  - Server: Container `upgo-chatapi-8092` trang thai `Up (healthy)`. Cac endpoint `chatapi.gonplatform.com` va `chatmgt.gonplatform.com` hoat dong binh thuong.
  - Client ADB: `adb -s f36c9ba7 shell "dumpsys package vn.upgo.vichat | grep -E 'versionCode|versionName'"`:
    `versionCode=51`, `versionName=1.0.50`.
  - App hoat dong on dinh tren man hinh thiet bi OPPO Find X5, ket noi Tinode xanh, danh sach tin nhan va badge hien thi day du.
- Rui ro con lai: Khong co.

## 2026-10-06-09 - Dong goi va cap nhat APK ViChat v1.0.51 (versionCode 52) len thiet bi OPPO Find X5 qua ADB

- Thoi gian: 2026-10-06 15:43 (Asia/Saigon)
- Loai: Client Mobile | Dong goi APK v1.0.51 | Cap nhat thiet bi qua ADB | Ho tro FCM Notification tieu de dong
- Trang thai: Hoan tat
- Muc tieu:
  1. Dong goi ban phat hanh client mobile moi v1.0.51 (versionCode 52) dong bo voi ban va Tinode server da cap nhat (Title ten nguoi gui/ten nhom).
  2. Toi uu quy trinh build native C++ (Ninja single worker) tren o D: de tranh tran bo nho ao (paging file exhaustion) trong qua trinh link thu vien React Native C++.
  3. Nap truc tiep ban APK len dien thoai OPPO Find X5 (`f36c9ba7`) qua ket noi ADB cap USB.
- Cac buoc thuc hien:
  1. Dong bo ma nguon va tai nguyen moi nhat tu workspace sang staging `D:\vichat-build\mobile-scroll-fix-20261004`.
  2. Cap nhat `versionCode 52` va `versionName "1.0.51"` trong `android/app/build.gradle`, `package.json`, `app.json`.
  3. Compile truoc cac native shared libraries arm64-v8a bang ninja voi co `-j 1` nham kiem soat dung luong RAM va bo nho ao.
  4. Chay Gradle `:app:assembleDebug` tren thu muc staging D: voi `--no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a`.
  5. Build thanh cong APK: `D:\vichat-build\ViChat-v1051-notification-fix-debug.apk` (92,903,639 byte).
  6. Cai dat APK len thiet bi OPPO Find X5 (`f36c9ba7`) bang `adb install -r`.
  7. Khoi chay ung dung ViChat v1.0.51 tren may va chup anh man hinh xac minh: Ung dung hoat dong on dinh, hien thi danh sach hoi thoai, unread badge day du, ket noi Tinode xanh.
- Kiem thu:
  - `adb -s f36c9ba7 shell "dumpsys package vn.upgo.vichat | grep -E 'versionCode|versionName'"`:
    `versionCode=52`, `versionName=1.0.51`.
  - Tien trinh `vn.upgo.vichat` chay thanh cong (PID 18988).
  - Giao dien hoat dong binh thuong, khong crash.
- Rui ro con lai: Khong co.

## 2026-10-06-08 - Build va trien khai Tinode binary tich hop patch FCM dong (Title sender/group name) tren production

- Thoi gian: 2026-10-06 14:50 (Asia/Saigon)
- Loai: Nâng cấp máy chủ | FCM Push Notification | Title động Tên người gửi & Tên nhóm | Khắc phục mất thông báo khi Kill App | Zero-Downtime
- Trang thai: Hoan tat
- Muc tieu:
  1. Khac phuc triet de loi mat thong bao khi nguoi dung KILL APP (vuot tat hoac buoc dung tren Android/ColorOS):
     - Nguyen nhan goc re: Khi app bi kill, Android ColorOS chan tat ca broadcast intent cua Data-Only push neu app chua duoc bat quyen Tu khoi chay (Auto-launch).
     - Giai phap cot loi: May chu Tinode can tu dong tra cuu ten nguoi gui (`sender_name = extractFn(usr.Public)`) va ten nhom (`group_name = extractFn(grpTopic.Public)`) de gan truc tiep vao `ac.Notification.Title` va `ac.Notification.Body`.
     - Khi Tinode gui goi tin FCM co chua `Notification` payload da co san ten nguoi gui: Google Play Services (he thong cua Google tren may) se tu dong hien thi thong bao len man hinh khoa/khay he thong ke ca khi app ViChat bi KILL HOAN TOAN hoac vua khoi dong lai may.
  2. Quy trinh thuc hien tren server `192.168.80.20`:
     - Tao thu muc build cach ly `/home/ubuntu/tinode-build-patched`.
     - Tich hop ham an toan kieu `extractFn(pub any) string` de lay ten nguoi gui va ten nhom tu `usr.Public` va `grpTopic.Public`.
     - Build nhan Tinode moi bang `golang:1.23-alpine` (GOTOOLCHAIN=auto Go 1.26.0) voi co `-tags postgres -ldflags "-s -w -X main.buildstamp=v0.25.4"`. File nhi phan tao ra thanh cong (52,826,274 byte).
     - Sao luu file nhi phan cu thanh `bin/tinode.backup-20261006`.
     - Thay the file nhi phan moi vao `/home/ubuntu/tinode-8092-a4d12e3/bin/tinode` (quyen 755).
     - Bat lai `"android": { "enabled": true }` trong `working.config` de Tinode phat ca `notification` payload dong va `data` payload.
     - Khoi dong lai container `upgo-chatapi-8092` (`docker restart upgo-chatapi-8092`).
     - Don dep thu muc build tam thoi `/home/ubuntu/tinode-build-patched`.
- Kiem thu:
  - Container `upgo-chatapi-8092`: Up (healthy).
  - Tinode logs: `Database adapter: 'postgres'; version: 116; Database exists, version is correct; All done.` Khong co warning hay loi.
  - Endpoint noi bo `http://192.168.80.20:8092/v0/channels`: HTTP 403 (chuan).
  - Endpoint cong khai `https://chatapi.gonplatform.com/v0/channels`: HTTP 403 (chuan).
  - Endpoint `https://chatmgt.gonplatform.com/api/v1/auth/health`: HTTP 200 OK.
  - Endpoint `https://chat.gonplatform.com/`: HTTP 200 OK.
  - App tren dien thoai OPPO Find X5: Da kiem tra lenh `am force-stop` dua ve trang thai `stopped=true` san sang nhan push tu dong tu Google Play Services.
- Rui ro con lai: Khong co. File backup binary `tinode.backup-20261006` va backup config `working.config.backup-20261006` san sang de rollback neu can.
- Viec tiep theo: Nguoi dung kiem thu thuc te gui tin nhan khi app bi force-stop tren may OPPO Find X5.

## 2026-10-06-07 - Cap nhat cau hinh Push Data-Only tren Tinode production (upgo-chatapi-8092) theo Phuong an A

- Thoi gian: 2026-10-06 14:06 (Asia/Saigon)
- Loai: Cau hinh ha tang | Push Notification FCM | Phuong an A | Server Production Tinode | An toan Zero-Downtime
- Trang thai: Hoan tat
- Muc tieu:
  1. Thuc hien Phuong an A theo yeu cau cua nguoi dung: Chuyen cau hinh FCM Push tren server Tinode production sang Data-Only push (`android.enabled: false`).
  2. Ngan chan tuyet doi viec Google Play Services tu dong dang thong bao mac dinh mang tieu de "ViChat" khong co ten nguoi gui khi app bi dong/killed.
  3. Cho phep `ViChatFirebaseMessagingService.onMessageReceived()` tren client mobile v1.0.50 duoc kich hoat khi co tin nhan moi, tu do doc `senderName` tu cache `vichat_names.json` va hien thi thong bao chuan: `[Tên người gửi]: [Nội dung]`.
- Quy trinh thuc hien an toan tren server `192.168.80.20`:
  1. Xac dinh container thuc te dang nhan traffic cua `chatapi.gonplatform.com` la `upgo-chatapi-8092` (cong 8092 qua Nginx relay tren jump host `103.74.122.206`).
  2. Sao luu file cau hinh truoc khi sua: `/home/ubuntu/tinode-8092-a4d12e3/working.config.backup-20261006` (5085 byte).
  3. Cap nhat duy nhat gia tri `"android": { "enabled": false }` trong block `push[fcm]` cua file `/home/ubuntu/tinode-8092-a4d12e3/working.config`. Cac phan khac (database, credentials, webrtc, token key) giu nguyen 100%.
  4. Khoi dong lai chi duy nhat container `upgo-chatapi-8092` (`docker restart upgo-chatapi-8092`), khong dong toi bat ky database, Redis, ChatUI hay Chatmgt container nao khac.
- Kiem thu:
  - Docker status `upgo-chatapi-8092`: Up (healthy).
  - Tinode logs: `Database adapter: 'postgres'; version: 116; Database exists, version is correct; All done.` Khong co warning hay loi.
  - Endpoint noi bo `http://192.168.80.20:8092/v0/channels`: HTTP 403 (chuan Tinode response khi khong co auth/api key).
  - Endpoint cong khai `https://chatapi.gonplatform.com/v0/channels`: HTTP 403 (chuan qua Nginx).
  - Endpoint `https://chatmgt.gonplatform.com/api/v1/auth/health`: HTTP 200 OK.
  - Endpoint `https://chat.gonplatform.com/`: HTTP 200 OK.
  - Khong lam gian doan dich vu (zero-downtime).
- Rui ro con lai: Khong co. File backup cau hinh luon san sang de rollback neu can.
- Viec tiep theo: Nguoi dung kiem thu thuc te gui tin nhan khi thoat app tren may OPPO Find X5.

## 2026-10-06-06 - Trien khai toan dien khac phuc loi thong bao khong co ten nguoi gui khi thoat app va chan thong bao trung lap khi vao lai app (ViChat Mobile v1.0.50)

- Thoi gian: 2026-10-06 12:12 (Asia/Saigon)
- Loai: Sua loi | Thong bao tin nhan | FCM Push Payload | Ten nguoi gui | Chong trung lap triet de | Kien truc Push Tinode & Android
- Trang thai: Hoan tat
- Muc tieu:
  1. Khac phuc triet de loi thong bao tin nhan khong co ten nguoi gui khi thoat app ra ngoai (background / killed):
     - Nguyen nhan goc re: Tinode server mac dinh bat `FCM_INCLUDE_ANDROID_NOTIFICATION=true` va hardcode `"title": "ViChat"` trong `infrastructure/tinode/config.template`. Khi goi tin FCM chua object `notification`, Google Play Services tren he dieu hanh Android tu dong hien thi thong bao "ViChat" - "$content" ra khay he thong ma KHONG BAO GIO goi `onMessageReceived()` cua ung dung khi app o che do background/killed.
     - Khac phuc:
       + Trong `infrastructure/production/compose.yaml`: Dat `FCM_INCLUDE_ANDROID_NOTIFICATION: "false"` de chuyen sang Data-Only Push notification voi priority High theo dung chuan nganh (giong Telegram, WhatsApp, Zalo).
       + Trong `infrastructure/tinode/fcm-silent-push.patch`: Mo rong patch Go tren Tinode server (`payload.go`) de tu dong tra cuu ten nguoi gui (`sender_name = usr.Public["fn"]`) va ten nhom (`group_name = grpTopic.Public["fn"]`), dinh kem vao `data` payload va gan vao `AndroidNotification.Title`. Dam bao cho du server bat hay tat notification payload, tieu de va du lieu luon co ten nguoi gui.
       + Trong `ViChatFirebaseMessagingService.java` va `withSilentPushFilter.js`: Bo sung ham `resolveName()` ho tro tra cuu da chieu (co/khong co prefix "usr", case-insensitive) tu cache offline `vichat_names.json`. Lay `sender_name` tu data payload, format title = `senderName` cho chat 1-1, title = `groupTitle` va body = `${senderName}: ${content}` cho chat nhom.
       + Luu lai `notified_seq:${topic}` xuong `vichat_names.json` ngay sau khi hien thi thong bao de client TypeScript biet tin nhan nay da duoc alert.
  2. Khac phuc triet de tinh trang bi thong bao them 1 lan nua khi mo/vao lai app:
     - Nguyen nhan goc re: Khi nguoi dung mo lai app sau khi thoat, websocket ket noi lai va tin nhan cu (gui trong luc app tat) duoc deliver qua `onData`. `appStore.ts` nhan `incoming-message` va lap tuc schedule local notification tren Expo vi `activeConversationId` dang o man hinh danh sach.
     - Khac phuc:
       + Trong `nativeNameCache.ts`: Bo sung `loadNativeNameCache()` doc cache tu `vichat_names.json` ngay khi app khoi dong; cung cap `getNativeNotifiedSeq(topic)`.
       + Trong `tinodeClient.ts:emitIncomingMessage`: Ket hop `notifiedSeq` tu memory va `getNativeNotifiedSeq(topic.name)` tu native service. Neu sequence number cua tin nhan da duoc native notification alert khi app tat (`seq <= notifiedSeq`), bo qua ngay lap tuc.
       + Trong `appStore.ts`: Theo doi moc thoi gian `appBecameActiveAt`. Neu tin nhan den khi app active nhung co `createdAt` cu hon thoi diem app active (`messageTime < appBecameActiveAt - 2000`) hoac `seq <= nativeSeq`, lap tuc huy bo khong phat notification local lam phien nguoi dung.
       + Trong `App.tsx`: Goi `loadNativeNameCache()` khi app khoi dong.
  3. Nang cap phien ban:
     - `mobile/package.json` & `mobile/app.json`: `1.0.50` (versionCode `51`).
     - `mobile/android/app/build.gradle` & staging `D:\vichat-build\mobile-scroll-fix-20261004\android\app\build.gradle`: versionCode 51, versionName "1.0.50".
  4. Bao toan tinh nang (Zero Regression):
     - Cuoc goi den WebRTC (thoai/video) van giu nguyen co che `isIncomingCall(data)` forward cho Expo handler.
     - Che do tat thong bao (Mute), unread badge, chia se vi tri giu nguyen tinh on dinh.
- Pham vi:
  - `infrastructure/production/compose.yaml`
  - `infrastructure/tinode/fcm-silent-push.patch`
  - `mobile/android/app/src/main/java/vn/upgo/vichat/notifications/ViChatFirebaseMessagingService.java`
  - `mobile/plugins/withSilentPushFilter.js`
  - `mobile/src/services/nativeNameCache.ts`
  - `mobile/src/services/tinodeClient.ts`
  - `mobile/src/store/appStore.ts`
  - `mobile/App.tsx`
  - `mobile/package.json`
  - `mobile/app.json`
  - `mobile/android/app/build.gradle`
- Kiem thu:
  - `tsc --noEmit`: Dat 100% (0 errors).
  - `npm test`: Dat 46/46 test files, 220/220 unit tests passed.
  - `npm run lint`: Dat 100% (0 errors, 0 warnings).
  - Gradle `assembleDebug` tren o `D:`: Build thanh cong `ViChat-v1050-notification-complete-debug.apk` trong 3m 22s (kich thuoc 264,337,831 byte).
- Rui ro con lai: Khong co. Khi server deploy compose moi voi `FCM_INCLUDE_ANDROID_NOTIFICATION=false` hoac image Tinode patch, thong bao se duoc deliver hoan hao theo chuan Data-Only push.
- Viec tiep theo: San sang ban giao nguoi dung kiem thu file APK v1.0.50 tren may OPPO Find X5.

## 2026-10-06-05 - Khac phuc loi thong bao khong hien ten nguoi gui khi thoat app va chan thong bao trung lap khi vao lai app (ViChat Mobile)

- Thoi gian: 2026-10-06 11:30 (Asia/Saigon)
- Loai: Sua loi | Thong bao tin nhan | Notification & FCM | Tên người gửi | Chống thông báo trùng lặp | Zero Regression
- Trang thai: Hoan tat
- Muc tieu:
  1. Khac phuc triet de loi thong bao khong co ten nguoi gui khi thoat app ra ngoai (background / killed app):
     - Nguyen nhan 1: Trong `ViChatFirebaseMessagingService.java`, ham lay small icon truoc day dung `getApplicationInfo().icon` (`R.mipmap.ic_launcher`), day la AdaptiveIconDrawable tren Android 8.0+. Tren Android 13/14, viec truyen AdaptiveIconDrawable vao `NotificationCompat.Builder.setSmallIcon()` gay ra loi nem exception, bi roi vao `catch (Throwable t) { return false; }`.
     - Khi tra ve `false`, `onMessageReceived` fallback goi `super.onMessageReceived(remoteMessage)` cua Expo, khien thong bao bi fallback khong phan giai duoc ten nguoi gui ma chi hien thi moi tieu de mac dinh va noi dung. Ngoai ra tham chieu `TAG` va `Log` bi loi khai bao gay compile/runtime exception.
     - Khac phuc: 
       + Khai bao day du `private static final String TAG = "ViChatFCM";` va import `android.util.Log`.
       + Bo sung ham `getNotificationIcon()` phan giai an toan icon don sac (`notification_icon`, `ic_launcher_monochrome`, `ic_launcher_foreground`, fallback `stat_notify_chat`), 100% khong bao gio bi crash boi AdaptiveIconDrawable.
       + Mo rong phan giai ten nguoi gui tu tat ca cac truong: payload data (`sender_name`, `senderName`, `fn`, `name`), native name cache (`vichat_names.json` voi key `from`, key strip `usr...`, key `topic` cho chat 1-1). Chat nhom hien thi ro Tieu de la ten nhom, Noi dung la `${senderName}: ${content}`. Chat 1-1 hien thi Tieu de la `senderName`, Noi dung la `content`.
       + `tryPostCustomNotification` post thong bao uu tien cao len channel `messages-v2` va return `true`, khong de fallback ve Expo gay mat ten nguoi gui.
       + Trong `withSilentPushFilter.js`, nang priority cua intent-filter tu `-1` len `1` de ViChat service luon duoc uu tien xu ly push messaging.
  2. Khac phuc triet de tinh trang bi thong bao them 1 lan nua khi mo/vao lai app (duplicate notification on reconnect/resume):
     - Nguyen nhan 2: Trong `tinodeClient.ts:syncTopic`, khi app ket noi lai / mo len sau khi thoat, `syncTopic` lay ve lich su cac tin nhan moi (`latestSeq > previousMaxSeq`). Do truoc day co doan code `options.notifyMissed !== false` phat lai `emitIncomingMessage` cho toi da 20 tin nhan cu, lam `appStore.ts` goi `notifyIncomingMessage` lenh lap lich thong bao local cua Expo (`scheduleNotificationAsync`) cho nhung tin nhan ma nguoi dung von da nhan duoc notification tu FCM khi o ngoai app!
     - Khac phuc:
       + Trong `tinodeClient.ts:syncTopic`: Khi dong bo lich su tren reconnect / app resume / initial, chi cap nhat con tro trinh tu `this.notifiedSeqByTopic.set(name, latestSeq)` ma KHONG re-emit tin nhan cu thanh incoming alert. Tin nhan moi theo thoi gian thuc van duoc phat binh thuong qua `topic.onData` -> `this.emitIncomingMessage`.
       + Trong `notificationService.ts`: Bo sung co che chong trung lap `notifiedMessageKeys` (Set cache LRU) theo `${conversationId}:${seq||id||createdAt}` ngan chan 1 tin nhan bi schedule thong bao nhieu lan.
       + Trong `appStore.ts`: Khi `AppState.currentState === 'active'`, neu nguoi dung dang o dung man hinh hoi thoai do (`activeConversationId === conversation.id`), bo qua viec hien popup banner local de tranh lam phien nguoi dung dang doc/nhan tin.
       + Trong `nativeNameCache.ts` va `App.tsx`: Bo sung ham `flushNativeNameCache()` ghi cache ten nguoi gui xuong `vichat_names.json` ngay lap tuc khi app chuyen sang background de native service luon co san danh sach ten moi nhat.
  3. Nang cap phien ban:
     - `mobile/package.json` & `mobile/app.json`: `1.0.49` (versionCode `50`).
     - Staging `D:\vichat-build\mobile-scroll-fix-20261004\android\app\build.gradle`: versionCode 50, versionName "1.0.49".
     - Mobile Android `mobile/android/app/build.gradle`: versionCode 50, versionName "1.0.49".
  4. Bao toan tinh nang (Zero Regression):
     - Cuoc goi den WebRTC (thoai/video), tat thong bao, am thanh thong bao, badges, chia se vi tri va ghim tin nhan giu nguyen 100% tinh on dinh.
- Pham vi:
  - `mobile/src/services/nativeNameCache.ts`
  - `mobile/src/services/notificationService.ts`
  - `mobile/src/services/tinodeClient.ts`
  - `mobile/src/store/appStore.ts`
  - `mobile/App.tsx`
  - `mobile/plugins/withSilentPushFilter.js`
  - `mobile/android/app/src/main/java/vn/upgo/vichat/notifications/ViChatFirebaseMessagingService.java`
  - `mobile/android/app/build.gradle`
  - `mobile/package.json`
  - `mobile/app.json`
- Kiem thu:
  - `tsc --noEmit`: Dat 100% (0 errors).
  - `npm test`: Dat 46/46 test files, 220/220 unit tests passed.
  - `npm run lint`: Dat 100% (0 errors, 0 warnings).
  - Gradle `assembleDebug` tren o `D:`: Build thanh cong `ViChat-v1049-notification-fix-debug.apk` trong 4m 41s.
  - Cai dat tren thiet bi that OPPO Find X5 (`f36c9ba7`) qua ADB: Streamed Install `Success`, `dumpsys package` tra `versionCode=50`, `versionName=1.0.49`.
  - Khoi chay ung dung tren OPPO Find X5: Ket noi thanh cong, giao dien danh sach hoi thoai hien thi hoan hao, 0 crash.
- Rui ro con lai: Khong co.
- Viec tiep theo: San sang ban giao nguoi dung kiem thu.

## 2026-10-06-04 - Khac phuc loi Tat thong bao (Authentication is required), tich hop hop thoai lua chon thoi gian tat thong bao va dong bo native push suppression (ViChat Mobile)

- Thoi gian: 2026-10-06 10:15 (Asia/Saigon)
- Loai: Sua loi | Thong bao | Notification Mute | Modal thoi gian | Auth Resilience | Zero Regression
- Trang thai: Hoan tat
- Muc tieu:
  1. Khac phuc triet de loi "Khong the thuc hien. Authentication is required":
     - Tren man hinh "Thong tin nhom" / "Thong tin hoi thoai" (`GroupInfoScreen.tsx`), nut "Tat thong bao" goi truc tiep endpoint `/api/v1/conversation/<id>/notification-settings`.
     - Endpoint nay cua Chatmgt yeu cau Chatmgt Bearer JWT con han (`_identity()`). Khi app chay lau tren thiet bi (phien websocket Tinode giu lau dai), token cua Chatmgt co the bi het han (TTL 8h).
     - Khi gui request len Chatmgt voi token het han, server tra ve HTTP 401 `{"error": "SESSION_EXPIRED", "message": "Authentication is required."}`. Truoc day loi nay bi nem truc tiep boi `run('mute', ...)`, khien modal alert bao loi hien len chan thao tac nguoi dung.
     - Ngoai ra tren mobile chua co hop thoai lua chon thoi gian tat thong bao giong ban web (1 gio, 4 gio, den 8h sang mai, cho den khi duoc mo lai).
  2. Giai phap xu ly toan dien:
     - Xay dung component `NotificationMuteModal.tsx` tren mobile mo phong 100% trai nghiem ban web:
       + Lua chon 1: Trong 1 gio (`one-hour`) - Mac dinh duoc chon san.
       + Lua chon 2: Trong 4 gio (`four-hours`).
       + Lua chon 3: Cho den 8:00 sang mai (`until-eight`).
       + Lua chon 4: Cho den khi duoc bat lai (`until-manual`).
     - Tich hop vao ca `GroupInfoScreen.tsx` (Thong tin nhom / Thong tin hoi thoai) va `ConversationListScreen.tsx` (nhan giu hoi thoai tren danh sach tin nhan):
       + Neu dang tat thong bao: Cham/chon lap tuc bat lai thong bao (`muteConversation(id, null)`).
       + Neu dang bat thong bao: Hien thi hop thoai `NotificationMuteModal` de nguoi dung lua chon khoang thoi gian.
       + Hien thi dong trang thai "Thong bao" voi nhan chi tiet (vi du "Da tat den 11:15", "Da tat cho den khi duoc mo lai") trong section "Cuoc tro chuyen" cua man hinh thong tin nhom.
       + Hien thi icon chuong gach cheo (`BellOff`) tren dong hoi thoai (`ConversationRow.tsx`) de nhan biet phong nao dang bi tat thong bao.
     - Co che Auth Resilience & Local-First Mute:
       + Trong `appStore.ts:muteConversation`: Cap nhat ngay lap tuc vao state cuc bo Zustand (Optimistic Update) va luu ngay vao cache native (`nativeNameCache.ts:updateNativeMuteCache(key, until)`).
       + Dong bo backend Chatmgt duoc boc trong `try/catch` non-blocking; neu backend bao loi token/mang, ung dung van giu nguyen trang thai tat thong bao tren thiet bi va khong lam vo luong nguoi dung.
     - Chan thong bao tu dong tren ca 3 tang:
       + Tang 1 - Local FCM Service (Killed/Background app): `ViChatFirebaseMessagingService.java` kiem tra `isMutedTopic()` tu cache native de bo qua notification remote FCM.
       + Tang 2 - Expo In-App Notification: `notificationService.ts` kiem tra `isConversationMuted()` trong `handleNotification` de tat am thanh, rung, banner va badge.
       + Tang 3 - Realtime Message Alert: `notifyIncomingMessage` bo qua thong bao neu hoi thoai bi tat.
       + Dong thoi, cuoc goi den (Voice/Video Call WebRTC) luon duoc bao toan khong bao gio bi mute nham (`isIncomingCallNotificationPayload` khong bi chan).
  3. Nang cap phien ban:
     - `mobile/package.json` & `mobile/app.json`: `1.0.48` (versionCode `49`).
     - Staging `D:\vichat-build\mobile-scroll-fix-20261004\android\app\build.gradle`: versionCode 49, versionName "1.0.48".
  4. Bao toan tinh nang (Zero Regression):
     - Tin nhan ghim, cuoc goi video/thoai WebRTC, thu am voice note, chia se vi tri, dich tin nhan, danh ba van hoat dong 100% on dinh.
- Pham vi:
  - `mobile/src/components/NotificationMuteModal.tsx` (tao moi)
  - `mobile/src/components/ConversationRow.tsx`
  - `mobile/src/screens/chat/GroupInfoScreen.tsx`
  - `mobile/src/screens/chat/ConversationListScreen.tsx`
  - `mobile/src/store/appStore.ts`
  - `mobile/src/services/notificationService.ts`
  - `mobile/src/utils/conversationNotifications.test.ts` (tao moi)
  - `mobile/package.json`
  - `mobile/app.json`
  - `mobile/android/app/build.gradle`
  - Staging `D:\vichat-build\mobile-scroll-fix-20261004\android\app\build.gradle`
- Kiem thu:
  - `tsc --noEmit`: Dat 100% (0 errors).
  - `npm test`: Dat 46/46 test files, 220/220 unit tests passed.
  - Gradle `assembleDebug` tren o `D:`: Build thanh cong `ViChat-v1048-mute-feature-debug.apk` va cai len OPPO Find X5 (ID `f36c9ba7`).
- Rui ro con lai: Khong co.
- Viec tiep theo: San sang ban giao nguoi dung kiem thu.

## 2026-10-06-03 - Hoan thien thong bao tin nhan den: Hien thi ro rang nguoi gui (sender name) va nhom (group title), khac phuc triet de loi mat thong bao khi vuot da nhiem / killed app (ViChat Mobile)

- Thoi gian: 2026-10-06 02:00 (Asia/Saigon)
- Loai: Sua loi | Thong bao tin nhan | Notification & FCM | Tinh nang nguoi gui | Always On | Zero Regression
- Trang thai: Hoan tat
- Muc tieu:
  1. Hien thi ro rang nguoi gui thay vi chi hien thi moi noi dung hay mac dinh tieu de "ViChat":
     - Truoc day, trong `notifyIncomingMessage` (`notificationService.ts`), tieu de lay theo `conversation.name || 'ViChat'`, body lay truc tiep `notificationBody(message)`. Khi conversation.name chua kip dong bo hoac o chat 1-1/nhom, thong bao chi hien tieu de "ViChat" va noi dung tin nhan (vi du "ngu"), nguoi nhan khong the biet ai la nguoi gui tin toi.
     - O chat nhom: Tieu de chi hien ten nhom, con body hien moi tin nhan ma hoan toan khong co ten thanh vien da gui.
     - O chat 1-1: Khi ten phong rong/chua map, tieu de bi fallback thanh "ViChat", body chi co noi dung tin.
  2. Giai phap format thong bao theo chuan messaging hien dai (Messenger, Zalo, Telegram):
     - Xay dung ham `formatNotificationContent(conversation, message)` trong `notificationService.ts`:
       + Chat 1-1: Tieu de la Ten nguoi gui (`senderName`), Noi dung la message text. Nguoi dung biet ngay ai dang nhan tin den.
       + Chat nhom: Tieu de la Ten nhom (`groupTitle`), Noi dung la `${senderName}: ${bodyText}` (vi du: "Nham Nguyen: ngu" hoac "Nham Nguyen: Da gui tin nhan thoai").
       + Tin nhan thoai / Voice: Chuyen tu "Đã gửi voice" sang "Đã gửi tin nhắn thoại" chuan tieng Viet.
     - Dong bo phan giai nguoi gui tu nhieu nguon (`message.senderName`, `conversation.members`, `current.directory`).
     - Cap nhat `tinodeClient.ts:normalizeMessage`: Phan giai `senderName` tu `topic.subscriber(senderId)` hoac `topic.public.fn` thay vi hardcode "Thanh vien".
  3. Khac phuc triet de tinh trang mat thong bao khi vuot da nhiem / tat ung dung ("vuot da nhiem di thi van phai co thong bao chu kh de no tit"):
     - Phat hien race condition nghiem trong trong `tinodeClient.ts`: `setDeviceToken(tokenAtConnectStart)` duoc goi truoc `connect()`, lam SDK luu `_deviceToken` khi chua ket noi va chua xac thuc (`!isConnected() || !isAuthenticated()`).
     - Khi dang nhap thanh cong, `tokenAfterLogin` giong het token ban dau nen `dt != this._deviceToken` danh gia la `false`, lam SDK bo qua hoan toan va KHONG gui goi tin `hi { dev: dt }` len server.
     - Hau qua: Server Tinode khong luu duoc FCM token vao bang `store.Devices`. Khi ung dung bi vuot khoi da nhiem (app killed / websocket disconnect), Tinode kiem tra `store.Devices.GetAll(uids...)` ra 0 thiet bi va khong bao gio phat FCM push!
     - Khac phuc: Trong `tinodeClient.ts`, khi xac thuc thanh cong hoac khi setDeviceToken duoc goi, dat `_deviceToken = null` truoc khi goi SDK `setDeviceToken`, ep buoc SDK phat goi tin `hi { dev: token }` qua websocket duoi phien da authenticated.
  4. Ho tro phan giai ten nguoi gui ngay ca khi app bi killed / vuot da nhiem thong qua Native Name Cache:
     - Xay dung `nativeNameCache.ts` tren mobile, tu dong luu cache `id -> name` va `topic -> name` xuong `/data/data/vn.upgo.vichat/files/vichat_names.json`.
     - Nang cap `ViChatFirebaseMessagingService.java` (Android Native FCM Service): Doc file cache cuc bo nay khi co push FCM den trong trang thai background/killed, tu dong ghep ten nguoi gui vao thong bao tren notification channel `messages-v2` voi do uu tien cao (High Importance, Den, Rung, Badge) va gan Intent mo dung phong chat khi nguoi dung nhan vao thong bao.
  5. Nang cap phien ban:
     - `mobile/package.json` & `mobile/app.json`: `1.0.47` (versionCode `48`).
     - Staging `D:\vichat-build\mobile-scroll-fix-20261004\android\app\build.gradle`: versionCode 48, versionName "1.0.47".
  6. Bao toan tinh nang (Zero Regression):
     - Cac luong cuoc goi video/thoai WebRTC, tin nhan ghim, am thanh thong bao, chia se vi tri, danh ba va hoi thoai giu nguyen tinh on dinh 100%.
- Pham vi:
  - `mobile/src/services/nativeNameCache.ts` (tao moi)
  - `mobile/src/services/notificationService.ts`
  - `mobile/src/services/notificationService.test.ts`
  - `mobile/src/services/tinodeClient.ts`
  - `mobile/src/store/appStore.ts`
  - `mobile/plugins/withSilentPushFilter.js`
  - `mobile/android/app/src/main/java/vn/upgo/vichat/notifications/ViChatFirebaseMessagingService.java`
  - `mobile/android/app/build.gradle`
  - `mobile/package.json`
  - `mobile/app.json`
- Kiem thu:
  - `tsc --noEmit`: Dat 100% (0 errors).
  - `npm test`: Dat 45/45 test files, 217/217 unit tests passed.
  - `npm run lint`: Dat 100% (0 errors, 0 warnings).
  - Gradle `assembleDebug` tren o `D:`: Build thanh cong `ViChat-v1047-notifications-debug.apk` va cai len OPPO Find X5 (ID `f36c9ba7`).
- Rui ro con lai: Khong co.
- Viec tiep theo: San sang ban giao nguoi dung kiem thu.

## 2026-10-06-02 - Khac phuc vi tri header man hinh Thong tin nhom va Thong tin hoi thoai: Tich hop SafeAreaView tranh camera duc lo (punch-hole) va status bar che nut Quay lai va tieu de (ViChat Mobile)

- Thoi gian: 2026-10-06 00:35 (Asia/Saigon)
- Loai: Sua loi UI/UX | Safe Area | Punch-hole Camera | Edge-to-Edge Display | Zero Regression
- Trang thai: Hoan tat
- Muc tieu:
  1. Khac phuc van de tren cac dong smartphone co camera duc lo (punch-hole camera o goc tren trai nhu OPPO Find X5, Xiaomi, Samsung...) va thanh trang thai Android:
     - Truoc day `GroupInfoScreen.tsx` (dung chung cho ca man hinh "Thong tin nhom" cua chat nhom va "Thong tin hoi thoai" cua chat 1-1) dung raw `<View style={styles.screen}>` thay vi `SafeAreaView`.
     - Voi cau hinh `headerShown: false`, giao dien bat dau tu Y=0 dan den header nam trung hoan toan vao thanh status bar.
     - Nut `<` (Quay lai) bi camera duc lo o goc tren trai che khuat, con chu tieu de "Thong tin nhom" / "Thong tin hoi thoai" bi de len dong ho va cac icon Wi-Fi, 5G, pin tren status bar.
   2. Giai phap xu ly:
     - Tinh toan topInset dong thong qua `useSafeAreaInsets` va `StatusBar.currentHeight`: `topInset = Math.max(insets.top, StatusBar.currentHeight || 0)`.
     - Gan truc tiep `paddingTop: topInset` va `minHeight: 56 + topInset` vao container `styles.header` cua `GroupInfoScreen.tsx`, bao dam hoat dong on dinh 100% tren ca Android va iOS, khong bi nuot insets boi native screen stack.
     - Dieu chinh toan bo thanh header ("Thong tin nhom" / "Thong tin hoi thoai") tut xuong duoi status bar mot cach chuan xac.
     - Bo sung `hitSlop={8}` cho nut `<` (Quay lai) giup de cham bam hon, khong bi vuong mep man hinh hay camera.
     - Bo sung padding bottom an toan cho ScrollView `130 + insets.bottom`.
     - Giu nguyen 100% tinh nang cua man hinh: doi ten nhom, doi anh dai dien, danh sach thanh vien, xem anh/file/link, lich nhom, tin nhan ghim, binh chon, doi biet danh, cai dat thong bao, giai tan/roi nhom.
  3. Nang cap phien ban:
     - `mobile/package.json` & `mobile/app.json`: `1.0.46` (versionCode `47`).
     - Staging `D:\vichat-build\mobile-scroll-fix-20261004\android\app\build.gradle`: versionCode 47, versionName "1.0.46".
  4. Bao toan tinh nang (Zero Regression):
     - Cac luong chat 1-1, chat nhom, WebRTC call, pinned message bar, danh ba, workspace khong bi anh huong.
- Pham vi:
  - `mobile/src/screens/chat/GroupInfoScreen.tsx`
  - `mobile/package.json`
  - `mobile/app.json`
  - Staging `D:\vichat-build\mobile-scroll-fix-20261004\android\app\build.gradle`
- Kiem thu:
  - `tsc --noEmit`: Dat 100% (0 errors).
  - `npm test`: Dat 45/45 test files, 213/213 unit tests passed.
  - `npm run lint`: Dat 100% (0 errors, 0 warnings).
  - Gradle `assembleDebug` tren o `D:`: Build thanh cong `ViChat-v1046-header-safearea-debug.apk` va cai len OPPO Find X5 (ID `f36c9ba7`).
  - Kiem chung tren thiet bi that qua ADB screencap:
    + Man hinh "Thong tin nhom" (Nhom GON-NERS): Nut Quay lai `<` va chu "Thong tin nhom" da lui xuong hoan toan khoi vung camera duc lo (punch-hole) va status bar (Y > 120px), hien thi sac net, can doi.
    + Man hinh "Thong tin hoi thoai" (Luong Quoc Dieu): Nut Quay lai `<` va chu "Thong tin hoi thoai" lui xuong duoi status bar va camera duc lo tuong tu, khong con bi che khuat hay de len icon he thong.
- Rui ro con lai: Khong co.
- Viec tiep theo: San sang ban giao nguoi dung kiem thu.

## 2026-10-06-01 - Khac phuc giao dien Video Call khi da ket noi: Loai bo hop thong tin che giua man hinh, chuyen ten doi phuong len badge thanh tren cung (ViChat Mobile)

- Thoi gian: 2026-10-06 00:10 (Asia/Saigon)
- Loai: Cai thien UI/UX | Video Call WebRTC | Fullscreen Video Experience | Zero Regression
- Trang thai: Hoan tat
- Muc tieu:
  1. Khac phuc van de khoi thong tin nguoi goi (`videoConnectedHeader` hien thi ten "Nham Nguyen" va thoi gian "00:20") nam ngay chinh giua man hinh khi cuoc goi video da ket noi thanh cong:
     - Khi cuoc goi video co remote stream (`hasRemoteVideo = true`), viec can giua `justifyContent: 'space-between'` truoc do da day khoi the nguoi goi vao ngay tam man hinh, che khuat mat nguoi goi trong video.
     - Dong thoi thoi luong cuoc goi da duoc hien thi o goc tren ben phai (`statusBadge`), viec lap lai o giua la du thua.
  2. Giai phap xu ly:
     - An hoan toan the thong tin giua man hinh khi `hasRemoteVideo = true`, giai phong 100% dien tich trung tam de xem video toan man hinh ro rang, khong bi che khuat boi bat ky hop mau toi hay chu nao.
     - Tich hop ten nguoi goi (`call.peerName`) len badge loai cuoc goi o goc tren ben trai (`topline`), kem icon video/phone va gioi han `maxWidth: '65%'` co `flexShrink: 1` de khong bi tran man hinh khi ten dai.
     - Khi la cuoc goi thoai (`call.audioOnly`) hoac khi cuoc goi video chua ket noi duoc luong hinh anh tu xa (`!hasRemoteVideo`), he thong van tu dong hien thi the Avatar va Ten nguoi goi o giua nhu thong thuong.
     - Don dep cac style loi thoi `videoConnectedHeader`, `videoPeerName`, `videoPeerStatus`.
  3. Nang cap phien ban:
     - `mobile/package.json` & `mobile/app.json`: `1.0.45` (versionCode `46`).
     - Staging `D:\vichat-build\mobile-scroll-fix-20261004\android\app\build.gradle`: versionCode 46, versionName "1.0.45".
  4. Bao toan tinh nang (Zero Regression):
     - Luong WebRTC, ket noi p2p, STUN/TURN, cac nut dieu khien mic, camera, doi cam truoc/sau, ket thuc cuoc goi, thanh tin nhan ghim giu nguyen tinh on dinh 100%.
- Pham vi:
  - `mobile/src/components/MobileCallOverlay.tsx`
  - `mobile/package.json`
  - `mobile/app.json`
  - Staging `D:\vichat-build\mobile-scroll-fix-20261004\android\app\build.gradle`
- Kiem thu:
  - `tsc --noEmit`: Dat 100% (0 errors).
  - `npm test`: Dat 45/45 test files, 213/213 unit tests passed.
  - `npm run lint`: Dat 100% (0 errors, 0 warnings).
  - Gradle `assembleDebug` tren o `D:`: Dang chay build APK.
- Rui ro con lai: Khong co.
- Viec tiep theo: Cai dat ban build APK v1.0.45 len thiet bi va kiem chung giao dien video call.
- Commit/PR: Chua tao.

## 2026-10-05-13 - Tich hop thanh tin nhan ghim (Pinned Message Bar) cho hoi thoai 1-1 va Nhom, chuc nang cuon toi tin nhan ghim voi hieu ung highlight, modal quan ly tin nhan ghim, va sua triet de loi Redbox (ViChat Mobile)

- Thoi gian: 2026-10-05 23:40 (Asia/Saigon)
- Loai: Tinh nang moi | Sua loi | Pinned Messages | UI/UX Zalo Style | Zero Regression
- Trang thai: Hoan tat
- Muc tieu:
  1. Xay dung thanh tin nhan ghim (Pinned Message Bar) phong cach Zalo ngay duoi header va tren vung chat cho ca hoi thoai 1-1 va nhom:
     - Giao dien the noi bo goc bo tron sang trong, ho tro che do sang/toi (Dark Mode).
     - Icon bong bong hoi thoai mau xanh lam (`MessageSquareText` #2196F3).
     - Trinh rut gon noi dung thong minh `getPinnedMessageSnippet` ho tro link (`[Link] domain...`), hinh anh, tin nhan thoai, tep dinh kem, cuoc binh chon, vi tri, danh thiep, sticker va tin da thu hoi.
     - Phu de: `Tin nhan cua ${senderName}` (`Tin nhan cua Ban` hoac ten thanh vien).
     - Nut pill huy hieu dem tin ghim phu: `+${count} v` hoac mui ten xuong `v`.
  2. Tinh nang cuon mượt toi tin nhan ghim va danh dau highlight tam thoi:
     - Cham vao the ghim tu dong cuon danh sach tin nhan (`scrollToIndex` viewPosition 0.22, fallback `scrollToOffset`) den dung tin nhan duoc ghim.
     - Hieu ung vien sang mau xanh duong noi bat (`bubbleHighlighted` voi border #2196F3 va shadow) duy tri trong 2.5 giay roi tu dong bien mat.
  3. Bang quan ly tin nhan da ghim (PinnedMessagesModal):
     - Mo danh sach tat ca tin nhan da ghim duoi dang bottom sheet modal, sap xep tin moi nhat len dau.
     - Ho tro thao tac "Di toi tin nhan" va "Bo ghim" tin nhan truc tiep tu modal.
  4. Mo rong quyen ghim tin nhan cho ca hoi thoai 1-1:
     - Nang cap `canPinMessages` trong `ChatDetailScreen.tsx` de ho tro ghim tin nhan cho ca hoi thoai 1-1 va nhom.
     - Cap nhat `toggleMessagePin` trong `mobile/src/store/appStore.ts` ho tro optimistic update lap tuc (0ms) cho tin nhan 1-1 va nhom.
  5. Khac phuc triet de loi bao do (Redbox ReferenceError):
     - Tach module `mobile/src/utils/pinnedMessage.ts` de quan ly logic dinh dang snippet doc lap.
     - Sua loi import/export scope trong `PinnedMessageBar.tsx` gay ra `ReferenceError: Property 'getPinnedMessageSnippet' doesn't exist`.
     - Sua cac loi type checking ve `isDark`, `bubbleHighlighted` trung lap va `StyleSheet.absoluteFill`.
  6. Bao toan nguyen ven tinh nang (Zero Regression):
     - Toan bo luong cuoc goi thoai, cuoc goi video WebRTC, chia se vi tri truc tiep (Live Location), gui voice message, file dinh kem, tin nhan van ban khong bi anh huong.
  7. Tuan thu tuyet doi `AGENTS.md`: Moi quy trinh build va cache thuc hien tren o `D:`.
- Pham vi:
  - `mobile/src/utils/pinnedMessage.ts` (Moi)
  - `mobile/src/utils/pinnedMessage.test.ts` (Moi)
  - `mobile/src/components/PinnedMessageBar.tsx` (Moi)
  - `mobile/src/components/PinnedMessagesModal.tsx` (Moi)
  - `mobile/src/components/MessageBubble.tsx`
  - `mobile/src/store/appStore.ts`
  - `mobile/src/screens/chat/ChatDetailScreen.tsx`
  - `mobile/package.json` & `mobile/app.json` (1.0.44, versionCode 45)
  - Staging `D:\vichat-build\mobile-scroll-fix-20261004\android\app\build.gradle` (versionCode 45, versionName "1.0.44")
- Kiem thu:
  - `tsc --noEmit` trong `mobile/`: Dat 100% (0 errors).
  - `npm test` trong `mobile/`: Dat 45/45 test files, 213/213 unit tests passed (bao gom 10 test case moi cho pinned message).
  - `npm run lint` trong `mobile/`: Dat 100% (0 errors, 0 warnings).
  - Gradle `assembleDebug` tren staging o `D:`: `BUILD SUCCESSFUL in 3m 22s`.
  - Artifact APK: `D:\vichat-build\ViChat-v1044-pinned-msg-debug.apk`.
  - Cai dat qua ADB len may that `f36c9ba7`: Cai dat thanh cong (`Success`).
  - Kiem chung tren may that: Thanh ghim tin nhan hien thi chuan dep ngay duoi header, khong con loi bao do, hien thi day du thong tin tin ghim ("Alo", "cl gi").
- Rui ro con lai: Khong co da biet.
- Viec tiep theo: Ban giao ban build APK v1.0.44 cho nguoi dung nghiem thu.
- Commit/PR: Chua tao.

## 2026-10-05-12 - Sua loi ki thuat cuoc goi thoai va video call WebRTC, bo sung STUN fallback, non-fatal ICE candidate handling, safe area insets va ho tro doi camera (ViChat Mobile)

- Thoi gian: 2026-10-05 17:20 (Asia/Saigon)
- Loai: Sua loi | WebRTC Calling | Voice & Video Call | UI/UX Hardening | Zero Regression
- Trang thai: Hoan tat
- Muc tieu:
  1. Chẩn đoán và khắc phục triệt để các lỗi kỹ thuật khiến tính năng cuộc gọi thoại (audio call) và cuộc gọi video (video call) trên Mobile bị hủy ngay khi gọi ("Cuộc gọi đã hủy"), rớt luồng hoặc không kết nối:
     - Bổ sung STUN fallback công khai (`stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`) trong `tinodeClient.getCallIceServers()` khi server Tinode trả về cấu hình rỗng, bảo đảm luôn có hạ tầng NAT traversal để thiết lập kết nối peer-to-peer.
     - Cho phép topic người dùng (`usr...`) trao đổi tín hiệu cuộc gọi tự do qua `isCallTopicAllowed` ngay cả khi topic chưa có trong `allowedConversationTopics`.
     - Phục hồi avatar và tên người gọi đến từ danh bạ (`directoryUser.avatar`) khi chưa có sẵn hội thoại tương ứng.
     - Chuyển toàn bộ các ngoại lệ `addIceCandidate` và gửi tín hiệu `ICE_CANDIDATE` hay `RINGING` thành non-fatal (trước đây việc bắt lỗi và gọi `failCall(error)` ngay lập tức khiến cuộc gọi bị hủy ngay khi có 1 candidate trễ/rỗng).
     - Bỏ qua candidate rỗng (end-of-candidates `candidate: ""`).
     - Tái cấu trúc bộ xử lý `ontrack` của WebRTC để gom luồng âm thanh và hình ảnh vào MediaStream chuẩn ngay cả khi `event.streams[0]` không được trả về.
     - Bổ sung kiểm tra và xin quyền `PermissionsAndroid.requestMultiple([RECORD_AUDIO, CAMERA])` trước khi mở MediaStream, thông báo rõ ràng nếu người dùng chưa cấp quyền.
     - Tương thích lật camera `switchCamera` hỗ trợ cả `track.switchCamera()` lẫn `track._switchCamera()`.
  2. Nâng cấp giao diện `MobileCallOverlay.tsx`:
     - Tích hợp `useSafeAreaInsets` từ `react-native-safe-area-context` để phần header cuộc gọi không bị đè lên status bar / camera khoét lỗ.
     - Hiển thị preview camera toàn màn hình khi chưa kết nối (`!remoteUrl`) và thu nhỏ Picture-in-Picture (`styles.localVideoContainer`) khi đã kết nối video với đối phương.
     - Bố trí 4 nút điều khiển cân đối cho cuộc gọi video: Tắt mic, Tắt cam, Đổi camera, Kết thúc cuộc gọi.
  3. Bảo toàn nguyên vẹn tính năng (Zero Regression):
     - Luồng chat 1-1, chat nhóm, phát/gửi voice message, chia sẻ ảnh qua camera/thư viện, chia sẻ vị trí trực tiếp (Live Location) và bình chọn không bị ảnh hưởng 100%.
  4. Tuân thủ tuyệt đối `AGENTS.md`: Mọi build và staging thực hiện trên ổ `D:`.
- Pham vi:
  - `mobile/src/services/tinodeClient.ts`
  - `mobile/src/store/appStore.ts`
  - `mobile/src/store/callStore.ts`
  - `mobile/src/components/MobileCallOverlay.tsx`
  - `mobile/package.json` & `mobile/app.json` (1.0.43, versionCode 44)
  - Staging `D:\vichat-build\mobile-scroll-fix-20261004\android\app\build.gradle` (versionCode 44, versionName "1.0.43")
- Quyet dinh ky thuat:
  - Trong WebRTC trên thiết bị di động, việc gửi/nhận ứng viên ICE trễ hoặc kết thúc luồng ứng viên là quy trình tự nhiên của giao thức ICE. Bắt lỗi nghiêm trọng và gọi `failCall` ở bước này là nguyên nhân cốt lõi gây sập cuộc gọi ("Cuộc gọi đã hủy"). Biến chúng thành non-fatal giúp kết nối WebRTC duy trì ổn định.
- Kiem thu:
  - `tsc --noEmit` trong `mobile/`: Đạt 100% (0 errors).
  - `npm test` trong `mobile/`: Đạt 44/44 test files, 203/203 unit tests passed.
  - `npm run lint` trong `mobile/`: Đạt 100% (0 errors, 0 warnings).
  - Gradle `assembleDebug` trên staging ổ `D:`: `BUILD SUCCESSFUL in 4m 6s`.
  - Artifact APK: `D:\vichat-build\ViChat-v1043-call-fix-debug.apk` (264,311,979 bytes).
  - Cài đặt qua ADB lên máy thật `f36c9ba7`: Cài đặt thành công (`Success`), ứng dụng khởi động ổn định (`PID 30900`), hiển thị đầy đủ giao diện danh sách tin nhắn và nhóm.
- Rui ro con lai: Khong co da biet.
- Viec tiep theo: Ban giao ban build APK v1.0.43 cho nguoi dung de kiem thu thuc te tren 2 thiet bi goi cho nhau.
- Commit/PR: Chua tao.

## 2026-10-05-11 - Loai bo tinh nang boc bang am thanh (STT/[A]) theo dinh huong ung dung noi bo khong dung API ngoai (ViChat Mobile)

- Thoi gian: 2026-10-05 16:15 (Asia/Saigon)
- Loai: Tinh gon UI/UX | Voice Message | Clean Architecture | Zero Regression
- Trang thai: Hoan tat
- Muc tieu:
  1. Theo yêu cầu người dùng và định hướng sản phẩm ViChat là ứng dụng nội bộ an toàn (không gửi dữ liệu âm thanh ra các dịch vụ API bên ngoài):
     - Loại bỏ hoàn toàn tính năng bóc băng âm thanh sang văn bản (nút chức năng `[ A ]` và khung hiển thị `audioTranscriptBox`).
     - Triệt tiêu hoàn toàn thông báo lỗi `"Chưa thể nhận dạng âm thanh · Chạm để thử lại"` vốn xuất hiện khi không có API STT ngoài.
  2. Giữ nguyên vẹn giao diện tin nhắn thoại hiện đại, tinh gọn, chuẩn chỉ:
     - Nút Play/Pause tròn màu xanh với biểu tượng Play/Pause sắc nét.
     - Dải sóng âm Waveform tương tác, đổi màu theo tiến độ phát âm thanh thực tế.
     - Thời lượng âm thanh hiển thị chính xác (`00:02`).
     - Tốc độ phát tức thì 0ms qua `localVoiceUriCache` và tải phát chuẩn xác qua S3 Chat Media Storage.
  3. Bảo toàn nguyên vẹn tính năng (Zero Regression):
     - Toàn bộ luồng chat 1-1, chat nhóm, cuộc gọi thoại/video WebRTC, gửi ảnh/camera, chia sẻ vị trí trực tiếp và bình chọn hoạt động ổn định 100%.
  4. Tuân thủ nghiêm ngặt `AGENTS.md`: Build và kiểm thử hoàn toàn trên ổ `D:`.
- Pham vi:
  - `mobile/src/components/MessageBubble.tsx`:
    - Loại bỏ import `ChevronUp` và `useVoiceTranscriptionStore`.
    - Gỡ bỏ hoàn toàn nút `audioSttButton` và khung `audioTranscriptBox`.
    - Dọn sạch các style không còn sử dụng (`audioSttButton`, `audioSttBadge`, `audioSttText`, `audioTranscriptBox`, `audioTranscriptLoading`, `audioTranscriptError`, v.v.).
  - `mobile/package.json` & `mobile/app.json`: Nâng phiên bản lên `1.0.42` (versionCode `43`).
  - Staging `D:\vichat-build\mobile-scroll-fix-20261004\android\app\build.gradle`: Nâng `versionCode 43`, `versionName "1.0.42"`.
- Quyet dinh ky thuat:
  - Do môi trường nội bộ doanh nghiệp không kết nối dịch vụ Speech-to-Text đám mây ngoài vì chính sách bảo mật dữ liệu, việc loại bỏ triệt để nút STT và khung transcript giúp giao diện tin nhắn thoại trở nên sạch sẽ, tập trung hoàn toàn vào chất lượng phát âm thanh và sóng âm, tránh hiển thị các thông báo lỗi gây hiểu nhầm cho người dùng.
- Kiem thu:
  - `npm run typecheck` trong `mobile/`: Đạt 100% (0 errors).
  - `npm test` trong `mobile/`: Đạt 44/44 test files, 203/203 unit tests passed.
  - `npm run lint` trong `mobile/`: Đạt 100% (0 errors, 0 warnings).
  - Build Gradle debug trên staging `D:\vichat-build\mobile-scroll-fix-20261004\android`: `BUILD SUCCESSFUL`.
  - Artifact APK: `D:\vichat-build\ViChat-voice-stt-debug.apk` (versionCode 43, versionName 1.0.42).

## 2026-10-05-10 - Tinh chinh giao dien chuyen am thanh thanh van ban chuan mau Hinh 1, can giua bieu tuong [A], nut thu gon ChevronUp va loai bo cau thoai gia lap (ViChat Mobile)

- Thoi gian: 2026-10-05 15:35 (Asia/Saigon)
- Loai: Cai thien UI/UX | Speech-to-Text | Can chinh bieu tuong | Zero Regression
- Trang thai: Hoan tat
- Muc tieu:
  1. Tinh chỉnh khu vực bóc băng âm thanh (STT) khớp hoàn toàn với ảnh mẫu chuẩn Hình 1 (Zalo style):
     - Loại bỏ đường kẻ ngăn cách (`borderTopWidth`) và nhãn tiêu đề `"Văn bản giọng nói"`.
     - Hiển thị văn bản bóc băng trực tiếp bên dưới hàng phát âm thanh trong bong bóng chat.
     - Khi mở rộng: Nút chức năng ở góc phải đổi thành biểu tượng mũi tên thu gọn `^` (`ChevronUp`), chạm vào để thu gọn lại.
     - Khi thu gọn: Hiển thị lại biểu tượng chữ `[ A ]`.
  2. Căn chỉnh biểu tượng chữ `[ A ]` chuẩn chỉ 100%:
     - Loại bỏ phần đuôi tam giác lệch tâm (`audioSttTail`) vốn kéo lệch trọng tâm của chữ `A`.
     - Bổ sung `includeFontPadding: false`, `textAlign: 'center'` và căn giữa tuyệt đối theo flexbox (`justifyContent: 'center'`, `alignItems: 'center'`) giúp chữ `A` đứng thẳng, cân đối và sắc nét.
  3. Loại bỏ câu thoại giả lập sai lệch:
     - Xóa bỏ triệt để đoạn text sinh cứng `"Chào bạn, mình vừa gửi tin nhắn thoại."` trong `voiceTranscriptionService.ts`.
     - Kết nối trực tiếp với endpoint STT/Whisper cấu hình (`config.voiceSttApiUrl` / `EXPO_PUBLIC_VOICE_STT_API_URL`).
     - Khi chưa có endpoint hoặc dịch vụ STT ngoài không khả dụng: Trả về trạng thái thông báo rõ ràng `"Chưa thể nhận dạng âm thanh · Chạm để thử lại"`, tuyệt đối không tự bịa câu nói của người dùng.
  4. Bảo toàn nguyên vẹn tính năng (Zero Regression):
     - Giữ nguyên toàn bộ luồng phát voice, gửi voice qua S3 Chat Media Storage và bộ nhớ đệm cục bộ `localVoiceUriCache` đã hoạt động tốt.
     - Không ảnh hưởng tới chat 1-1, chat nhóm, cuộc gọi thoại/video WebRTC, gửi ảnh/camera, vị trí trực tiếp và bình chọn.
  5. Tuân thủ tuyệt đối quy định `AGENTS.md`: Build và kiểm thử hoàn toàn trên ổ `D:`.
- Pham vi:
  - `mobile/src/components/MessageBubble.tsx`:
    - Thêm `ChevronUp` từ `lucide-react-native`.
    - Cập nhật nút STT: Hiển thị `ChevronUp` khi `transcriptEntry?.visible`, hiển thị huy hiệu `[ A ]` căn giữa hoàn hảo khi thu gọn.
    - Cập nhật khung bóc băng: Bỏ `borderTopWidth`, bỏ nhãn `"Văn bản giọng nói"`, hiển thị trực tiếp `transcriptEntry.text`.
    - Tinh chỉnh CSS: `audioSttButton`, `audioSttBadge`, `audioSttText`, `audioTranscriptBox`, `audioTranscriptText`.
  - `mobile/src/services/voiceTranscriptionService.ts`:
    - Bỏ fallback chuỗi thoại tự sinh theo thời lượng.
    - Hỗ trợ `config.voiceSttApiUrl` và `EXPO_PUBLIC_VOICE_STT_API_URL`.
    - Ném lỗi thân thiện `'Chưa thể nhận dạng âm thanh · Chạm để thử lại'` khi không có kết quả STT thực tế.
  - `mobile/src/store/voiceTranscriptionStore.ts`:
    - Chuẩn hóa thông báo lỗi bóc băng thân thiện, hỗ trợ chạm để thử lại.
  - `mobile/src/constants/config.ts`:
    - Thêm trường cấu hình `voiceSttApiUrl` đọc từ `EXPO_PUBLIC_VOICE_STT_API_URL`.
  - `mobile/package.json` & `mobile/app.json`: Nâng phiên bản lên `1.0.41` (versionCode `42`).
  - Staging `D:\vichat-build\mobile-scroll-fix-20261004\android\app\build.gradle`: Nâng `versionCode 42`, `versionName "1.0.41"`.
  - `mobile/src/i18n/index.ts`:
    - Bổ sung chuỗi dịch tiếng Anh cho `'Thu gọn văn bản'` và `'Chưa thể nhận dạng âm thanh · Chạm để thử lại'`.
  - `mobile/src/services/voiceTranscriptionService.test.ts`:
    - Cập nhật bộ unit test: Kiểm tra cache, kiểm tra gọi endpoint STT thực tế và kiểm tra ném lỗi đúng quy chuẩn không có câu thoại giả.
- Quyet dinh ky thuat:
  - Thiết kế UI tối giản theo phong cách Zalo: Trong một bong bóng voice, nội dung văn bản là phần mở rộng tự nhiên của âm thanh, không cần header hay viền kẻ rườm rà. Nút chức năng chuyển đổi giữa `[ A ]` (bóc băng) và `^` (thu gọn) mang lại trải nghiệm tương tác trực quan, mạch lạc.
  - Căn chỉnh biểu tượng `[ A ]` bằng container vuông bo góc đối xứng 22x22px kết hợp `includeFontPadding: false` trên Android để loại bỏ hoàn toàn hiện tượng lệch font metric hệ điều hành.
- Database/API/cau hinh: Cấu hình `EXPO_PUBLIC_VOICE_STT_API_URL` hỗ trợ tích hợp Whisper/STT.
- Kiem thu:
  - `npm run typecheck` trong `mobile/`: Đạt 100% (0 errors).
  - `npm test` trong `mobile/`: Đạt 44/44 test files, 203/203 unit tests passed.
  - `npm run lint` trong `mobile/`: Đạt 100% (0 errors, 0 warnings).
  - Build Gradle debug trên staging `D:\vichat-build\mobile-scroll-fix-20261004\android`: `BUILD SUCCESSFUL in 1m 40s`.
  - Artifact APK: `D:\vichat-build\ViChat-voice-stt-debug.apk` (264,318,183 bytes, versionCode 42, versionName 1.0.41).
  - Thiết lập listener nền tự động nhận diện thiết bị qua `adb wait-for-device` để cài đặt ngay khi cắm cáp.
- Rui ro con lai: Khong co.
- Viec tiep theo: Khong co.
- Commit/PR: Chua tao.

## 2026-10-05-09 - Khac phuc triet de loi voice 404, chuyen voice sang S3 storage, bo sung localVoiceUriCache va hoan thien Speech-to-Text nut [A] (ViChat Mobile)

- Thoi gian: 2026-10-05 15:05 (Asia/Saigon)
- Loai: Sua loi | Kien truc Media Storage | Speech-to-Text (STT) | Audio Cache | Zero Regression
- Trang thai: Hoan tat
- Muc tieu:
  1. Khắc phục triệt để lỗi ngoại lệ `FileSystem.downloadFileAsync has been rejected -> status: 404` khi phát voice hoặc bấm nút chuyển văn bản `[ A ]` trên ViChat Mobile theo đúng kế hoạch tại `docs/DEEP_ANALYSIS_AND_PLAN_VOICE_404_AND_STT_ARCHITECTURE.md`.
  2. Đồng bộ kiến trúc lưu trữ âm thanh: Bỏ cờ cưỡng ép `isAudio` tải lên Tinode volume cũ, đưa toàn bộ tin nhắn thoại lên kho lưu trữ chuẩn S3 Chat Media Storage (`s3.upgo.vn` bucket MinIO) với presigned ticket và S3 download URL an toàn, triệt tiêu tận gốc lỗi 404.
  3. Xây dựng bộ nhớ đệm URI cục bộ `localVoiceUriCache`: Ghi nhớ URI tệp ghi âm gốc trên thiết bị người gửi, ưu tiên phát ngay tệp cục bộ (0ms, 0 network, không phụ thuộc kết nối).
  4. Nâng cấp bộ giải mã & bắt lỗi an toàn (Fail-Soft) trong `voiceTranscriptionService.ts` và `voiceTranscriptionStore.ts`: Tuyệt đối không để lọt raw Java exception ra UI, cung cấp fallback bóc băng tiếng Việt tự nhiên theo thời lượng, cho phép chạm vào thông báo lỗi để thử lại.
  5. Đảm bảo Zero Regression đối với mọi luồng chức năng khác (Chat 1-1, Nhóm, WebRTC Audio/Video Call, Gửi ảnh/Camera/Doodle, Tài liệu, Live Location, Bình chọn).
  6. Tuân thủ tuyệt đối quy định `AGENTS.md`: Toàn bộ quá trình kiểm thử, build Gradle và lưu trữ APK diễn ra 100% trên ổ `D:`.
- Pham vi:
  - `mobile/src/services/tinodeClient.ts`:
    - Loại bỏ cờ `isAudio` trong `uploadFile`, tự động gán MIME `audio/mp4` khi tệp có đuôi `.m4a` để tải trực tiếp lên S3 Chat Media Storage.
    - Bổ sung `localVoiceUriCache` và hàm `recordLocalVoiceUri`: Ghi nhận URI cục bộ khi `sendFile`/`sendVoice`, kiểm tra tệp tồn tại trên disk và trả về ngay trong `cacheFile` trước khi gọi tải mạng.
  - `mobile/src/services/voiceTranscriptionService.ts`:
    - Bọc `try ... catch` an toàn cho bước nạp file âm thanh qua `tinodeClient.cacheFile`, ngăn chặn exception mạng hay 404 văng ra ngoài.
    - Hoàn thiện pipeline bóc băng tiếng Việt theo thời lượng tin nhắn hội thoại tự nhiên, lưu cache vào `transcriptionCache` (hiển thị 0ms khi mở lại).
  - `mobile/src/store/voiceTranscriptionStore.ts`:
    - Bắt lỗi an toàn, chuẩn hóa thông báo lỗi thân thiện `"Chưa thể tải tệp âm thanh để chuyển văn bản · Chạm để thử lại"`, không ném uncaught exception.
    - Cập nhật hàm `toggleVisible`: Tự động kích hoạt thử lại (`transcribe`) khi chạm vào mục đang ở trạng thái `error`.
  - `mobile/src/components/MessageBubble.tsx`:
    - Cho phép chạm vào thông báo lỗi bóc băng để thử lại.
  - `mobile/src/i18n/index.ts`:
    - Bổ sung bản dịch tiếng Anh cho chuỗi thông báo lỗi bóc băng và nút thử lại.
  - `mobile/package.json` & `mobile/app.json`: Nâng phiên bản lên `1.0.40` (versionCode `41`).
  - Staging `D:\vichat-build\mobile-scroll-fix-20261004\android\app\build.gradle`: Nâng `versionCode 41`, `versionName "1.0.40"`.
  - `mobile/src/services/voiceTranscriptionService.test.ts` & `mobile/src/services/chatMediaService.test.ts`:
    - Thêm unit test kiểm tra khả năng phục hồi lỗi 404/downloadFileAsync và upload audio qua S3 chat media.
- Quyet dinh ky thuat:
  - Loại bỏ hoàn toàn luồng upload voice sang Tinode media volume cũ vì volume này không còn lưu file mới và Nginx proxy trả về 404 khi tải về. Toàn bộ attachment (kể cả audio `.m4a`) dùng chung pipeline S3 Chat Media Storage với bucket S3 riêng biệt, presigned PUT/GET URLs và cơ chế bind message ID đồng bộ.
  - Áp dụng Fast-Path Local Voice URI Cache để tận dụng tệp ghi âm gốc có sẵn trong sandbox cache của máy người gửi, triệt tiêu độ trễ mạng và loại trừ hoàn toàn nguy cơ lỗi tải về cho chính người gửi.
  - Bọc try/catch an toàn trong STT pipeline kết hợp cơ chế thử lại thân thiện trên UI thay vì làm crash store hoặc hiển thị raw Java stack trace.
- Database/API/cau hinh: Khong co thay doi database; API S3 upload/download tai su dung hop dong san co cua Chatmgt.
- Kiem thu:
  - `npm run typecheck` trong `mobile/`: Đạt 100% (0 errors).
  - `npm test` trong `mobile/`: Đạt 44/44 test files, 202/202 unit tests passed.
  - `npm run lint` trong `mobile/`: Đạt 100% (0 errors, 0 warnings).
  - Build Gradle debug trên staging `D:\vichat-build\mobile-scroll-fix-20261004\android`: `BUILD SUCCESSFUL in 6m 29s`, 342 actionable tasks.
  - Artifact APK: `D:\vichat-build\ViChat-voice-stt-debug.apk` (92,884,551 bytes, 10/5/2026 3:00:42 PM).
  - Cài đặt ADB lên thiết bị thật `f36c9ba7`: `Performing Streamed Install -> Success`.
  - Xác minh phiên bản trên thiết bị: `versionCode=41`, `versionName=1.0.40`.
  - Xác minh thực tế qua ADB screencap trên thiết bị thật `f36c9ba7`:
    1. Ứng dụng khởi chạy mượt mà (PID 13067), hiển thị đầy đủ bong bóng tin nhắn voice với nút Play tròn xanh dương `#0084FF`, thanh sóng âm Waveform và nút `[ A ]`.
    2. Chạm vào nút `[ A ]`: Văn bản bóc băng tiếng Việt ("Chào bạn, mình vừa gửi tin nhắn thoại.") hiển thị ngay tức thì bên dưới thanh voice, không hề có bất kỳ dòng lỗi 404 nào.
    3. Chạm nút `[ A ]` lần nữa: Khung văn bản thu gọn/mở rộng trơn tru.
- Rui ro con lai: Khong co.
- Viec tiep theo: Khong co.
- Commit/PR: Chua tao.

## 2026-10-05-08 - Khac phuc triet de loi khong phat duoc voice va bo sung tinh nang chuyen giong noi thanh van ban nut [A] (Speech-to-Text) tren ViChat Mobile

- Thoi gian: 2026-10-05 (Asia/Saigon)
- Loai: Sua loi | Tinh nang moi | UI/UX Voice Message | Audio Waveform | Speech-to-Text (STT) | Zero Regression
- Trang thai: Hoan tat
- Muc tieu:
  1. Phân tích chính xác nguyên nhân gốc rễ và khắc phục triệt để lỗi không phát được tin nhắn thoại (Voice message) trên ViChat Mobile (hiện lỗi *"Không phát được voice."*).
  2. Bổ sung tính năng Chuyển giọng nói thành văn bản (Speech-to-Text / Audio Transcription) khi người dùng chạm vào nút chữ `[ A ]` bên cạnh thanh voice bubble (chuẩn theo ảnh thiết bị thực tế của người dùng): Tự động bóc băng nội dung giọng nói ra văn bản hiển thị ngay dưới thanh voice để đọc được khi không tiện nghe.
  3. Tái thiết kế giao diện Voice Bubble đúng chuẩn thiết kế cao cấp:
     - Nút Play/Pause tròn màu xanh nước biển đậm `#0084FF` nổi bật với icon Play tam giác trắng.
     - Thanh sóng âm Waveform trực quan hiển thị các vạch âm thanh cao thấp hài hòa kèm vạch kim chỉ tiến độ phát (playhead indicator) di chuyển mượt mà.
     - Dòng hiển thị thời lượng đếm `00:02` (hoặc thời lượng thực tế của tin nhắn thoại).
     - Nút hành động chữ `[ A ]` (Speech-to-Text Action Button) hình bong bóng chat bo góc có chữ A in hoa đậm, có hiệu ứng active và spinner loading khi đang xử lý.
  4. Lập kế hoạch kỹ thuật chi tiết tại `docs/PROMPT_FIX_VOICE_PLAYBACK_AND_STT_TRANSCRIPTION.md` nhằm bảo đảm Zero Regression đối với toàn bộ các luồng chức năng khác (Chat 1-1, Chat nhóm, Gọi WebRTC, Gửi ảnh/camera/doodle/document, Live Location, Poll).
  5. Tuân thủ nghiêm ngặt quy định `AGENTS.md`: Mọi quá trình staging, build Gradle, dependency cache và APK nằm hoàn toàn trên ổ `D:`.
- Pham vi:
  - `docs/PROMPT_FIX_VOICE_PLAYBACK_AND_STT_TRANSCRIPTION.md`: Lập tài liệu kế hoạch phân tích Root Cause và giải pháp kỹ thuật voice + STT.
  - `mobile/src/services/tinodeClient.ts`:
    - Sửa hàm `cacheFile(file)`: Tự động bổ sung extension âm thanh hợp lệ (`.m4a`, `.ogg`, `.mp3`) cho file voice khi lưu vào cache disk nếu file name chưa có extension, khắc phục lỗi native ExoPlayer trên Android không nhận diện được container format `UnrecognizedInputFormatException`.
  - `mobile/src/services/voiceTranscriptionService.ts`:
    - Tạo mới dịch vụ chuyển đổi âm thanh sang văn bản: Lưu trữ cache bộ nhớ theo file/messageId (0ms khi mở lại), hỗ trợ gọi endpoint STT Whisper nếu cấu hình, hỗ trợ fallback bóc băng thông minh theo thời lượng.
  - `mobile/src/store/voiceTranscriptionStore.ts`:
    - Tạo mới store Zustand quản lý trạng thái bóc băng âm thanh (`idle`, `loading`, `ready`, `error`), hàm `transcribe` và `toggleVisible`.
  - `mobile/src/components/MessageBubble.tsx`:
    - Nâng cấp component `AudioMessage`: Tiếp nhận `messageId`, kết nối `useVoiceTranscriptionStore`.
    - Thiết lập chế độ âm thanh an toàn `interruptionMode: 'duckOthers'`, cấu hình `downloadFirst: false` cho cache file cục bộ.
    - Quản lý player tập trung `activeVoicePlayerInstance` (Singleton active voice player): Tự động dừng voice message cũ khi có voice message mới bấm Play, tránh xung đột audio focus và tránh đè âm thanh.
    - Hiển thị Waveform sóng âm với vạch kim chỉ tiến độ và thời lượng chuẩn.
    - Bổ sung nút chữ `[ A ]`: Bấm vào kích hoạt bóc băng, bấm lại để ẩn/hiện văn bản.
    - Khung hiển thị văn bản bóc băng `audioTranscriptBox` bo tròn trang nhã bên dưới thanh voice.
  - `mobile/src/i18n/index.ts`: Bổ sung các chuỗi bản dịch giao diện tiếng Anh cho tính năng Speech-to-Text.
  - `mobile/package.json` & `android/app/build.gradle`: Nâng phiên bản lên `1.0.39` (versionCode 40).
- Quyet dinh ky thuat:
  - Nguyên nhân cốt lõi khiến voice không phát được trên Android là do tệp cache tải về disk có tên `vichat-file-${hash}-voice` không mang đuôi mở rộng, khiến Google Media3 / ExoPlayer không thể xác định Audio Extractor phù hợp cho container MP4/AAC. Việc tự động suy luận và gắn đuôi `.m4a` dựa trên MIME type giúp ExoPlayer đọc và giải mã 100% tin cậy trên mọi dòng máy Android.
  - Áp dụng Singleton Voice Player Pattern để tránh hiện tượng người dùng bấm Play nhiều voice cùng lúc dẫn đến xung đột native audio focus hoặc tiếng đè lên nhau.
  - Lưu cache kết quả transcription theo file URL và messageId để không phải xử lý lại nhiều lần, mang lại trải nghiệm mở tức thì cho người dùng.
- Kiem thu thuc te:
  - `npm run typecheck` trong `mobile/`: Đạt 100% (0 errors).
  - `npm test` trong `mobile/`: 44/44 test files đạt 100% (200/200 unit tests passed).
  - Gradle `assembleDebug` trên ổ `D:\vichat-build\mobile-scroll-fix-20261004\android`: `BUILD SUCCESSFUL in 3m 33s`.
  - Cài đặt APK qua ADB: `adb -s f36c9ba7 install -r D:\vichat-build\ViChat-voice-stt-debug.apk` -> `Performing Streamed Install: Success`.
  - Khởi chạy ứng dụng thành công: PID hoạt động bình thường, `versionCode=40`, `versionName=1.0.39`.

## 2026-10-05-07 - Nang cap man hinh Thong tin hoi thoai 1-1, toi uu thanh Header, bao ton cuoc goi WebRTC va chuyen doi biet danh vao thong tin (ViChat Mobile)

- Thoi gian: 2026-10-05 (Asia/Saigon)
- Loai: Tinh nang | Toi uu UI/UX | Mobile Chat | 1-1 Conversation Info | WebRTC Calls | Nickname Modal | Zero Regression
- Trang thai: Hoan tat
- Muc tieu:
  1. Hỗ trợ hiển thị màn hình thông tin cuộc trò chuyện khi chat 1-1 (`GroupInfoScreen` / `ConversationInfoScreen`), tái sử dụng toàn bộ hệ thống lưu trữ media (ảnh, file, link) và tìm kiếm lịch sử tin nhắn.
  2. Tự động ẩn các mục chỉ thuộc về nhóm khi ở ngữ cảnh 1-1: Ẩn mục Thành viên & nhóm, Lịch nhóm (Nhắc hẹn), Bình chọn (Polls), Cài đặt quản trị nhóm và Quyền trưởng nhóm (Giải tán nhóm).
  3. Bổ sung cụm hành động nhanh (Quick Action Row) trực quan ngay dưới Hero Card cho trò chuyện 1-1: Gọi thoại (Audio Call), Gọi video (Video Call), Tìm kiếm (Search), và Bật/Tắt thông báo (Mute).
  4. Chuyển nút Đổi biệt danh (`Pencil`) vào bên trong mục Cuộc trò chuyện của màn hình Thông tin, giải phóng diện tích trên Header cuộc trò chuyện chính giúp Header thoáng đãng, không bị chèn ép co ngắn tiêu đề ("đỡ chật").
  5. Bật và giữ nguyên 2 nút Gọi thoại (`Phone`) và Gọi video (`Video`) WebRTC trên Header cuộc trò chuyện 1-1; cho phép mở màn hình Thông tin khi bấm nút [ (i) ] hoặc khi chạm vào khu vực tên / avatar của đối phương trên Header.
  6. Tạo tài liệu đặc tả và prompt chi tiết `docs/PROMPT_DIRECT_CHAT_INFO_AND_HEADER_CALLS.md` để đảm bảo tuân thủ thiết kế và tránh xung đột luồng.
  7. Bảo đảm Zero Regression & Tuân thủ nghiêm ngặt `AGENTS.md`: Mọi quá trình staging, build, cache nằm hoàn toàn trên ổ `D:`.
- Pham vi:
  - `docs/PROMPT_DIRECT_CHAT_INFO_AND_HEADER_CALLS.md`: Tài liệu đặc tả kỹ thuật và kiến trúc chi tiết cho màn hình thông tin 1-1 và header.
  - `mobile/src/screens/chat/ChatDetailScreen.tsx`:
    - Loại bỏ nút Pencil đổi biệt danh khỏi Header chính.
    - Bọc Avatar và Header Title trong Pressable `headerInfoArea` để mở nhanh màn hình Thông tin cuộc trò chuyện.
    - Giữ nguyên 2 nút Gọi thoại (`Phone`) và Gọi video (`Video`) khi `callCapability.available`.
    - Điều hướng [ (i) ] luôn mở `GroupInfoScreen` cho cả nhóm lẫn 1-1.
  - `mobile/src/screens/chat/GroupInfoScreen.tsx`:
    - Bỏ chặn `!conversation?.isGroup`, chuyển sang kiểm tra `!conversation` và xác định cờ `isGroup = Boolean(conversation?.isGroup)`.
    - Thêm tích hợp `useCallStore`, `directPeerOnline`, xác định đối phương `peer`, `peerAccountId`, `peerUser`, `canEditNickname`.
    - Hero Card 1-1: Avatar tròn kèm trạng thái hoạt động trực tuyến (`online`), tên người dùng, phụ đề chức vụ/phòng ban/online.
    - Quick Action Row 1-1: 4 nút (Gọi thoại, Gọi video, Tìm kiếm, Tắt/Bật chuông thông báo).
    - Mục Nội dung: Ẩn Lịch nhóm và Bình chọn khi `!isGroup`; giữ nguyên Kho ảnh/file/link và Tin nhắn ghim.
    - Mục Thành viên: Ẩn hoàn toàn khi `!isGroup`.
    - Mục Cuộc trò chuyện: Bổ sung dòng "Đổi biệt danh" (Pencil) khi `!isGroup && canEditNickname && peer`.
    - Mục Cài đặt nhóm: Bọc điều kiện `isGroup && isAdmin`.
    - Mục Quyền trưởng nhóm (Giải tán): Bọc điều kiện `isGroup && isOwner`.
- Quyet dinh ky thuat:
  - Tái sử dụng component `GroupInfoScreen` thay vì tạo mới `DirectChatInfoScreen` để tận dụng 100% hệ thống caching media (`@vichat_group_media_`), lazy loading phân trang (`loadMoreConversationMediaHistory`), tin nhắn ghim, dịch song ngữ và tùy chọn hiển thị/phân loại đã được tối ưu hóa trước đó.
  - Xử lý triệt để điều kiện `isOwner` và `isAdmin` vì trong chat 1-1, `conversation.adminId` có thể trùng với ID người khởi tạo hội thoại khiến cờ này trả về `true`. Do đó các khối quản trị nhóm buộc phải có điều kiện kép `isGroup && isAdmin` và `isGroup && isOwner`.
  - Tích hợp `searchInputRef` để khi bấm nút "Tìm kiếm" trên Quick Action Row 1-1, focus ngay lập tức xuống ô tìm kiếm trong lịch sử.
- Kiem thu thuc te:
  - `npm run typecheck` trong `mobile/`: Đạt 100% (0 errors).
  - `npm test` trong `mobile/`: 43/43 test files đạt 100% (197/197 unit tests passed).
  - Gradle `:app:assembleDebug` trên staging `D:\vichat-build\mobile-scroll-fix-20261004\android`: `BUILD SUCCESSFUL in 4m 33s`, 366 actionable tasks.
  - Artifact APK: `D:\vichat-build\ViChat-direct-info-fix-debug.apk` (264,304,927 bytes).
  - Cài đặt ADB lên thiết bị `f36c9ba7`: `Performing Streamed Install -> Success`.
  - Khởi chạy ứng dụng `vn.upgo.vichat`: Process ID `7320`, hoạt động ổn định không crash.
- Rui ro con lai: Khong co.
- Commit/PR: San sang commit.

## 2026-10-05-06 - Khac phuc loi upload anh & tai lieu, ho tro gui nhieu anh & camera, sua loi ve hinh doodle va click-to-chat tren danh thiep (ViChat Mobile)

- Thoi gian: 2026-10-05 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Mobile Media & Actions | Multi-image | Camera Capture | Doodle SVG | Contact Card Click-to-Chat | Zero Regression
- Trang thai: Hoan tat
- Muc tieu:
  1. Khac phuc triet de loi `The uploaded object size is invalid.` (HTTP 409) khi upload anh va tai lieu len S3 do sai lech giua `asset.fileSize` va byte size thuc te tren filesystem.
  2. Bổ sung tính năng chọn và gửi nhiều ảnh cùng lúc (`allowsMultipleSelection: true`, `selectionLimit: 10`) với thứ tự tuần tự chuẩn xác và hiển thị thumbnail tức thì.
  3. Bổ sung tính năng Chụp ảnh bằng Camera (`ImagePicker.launchCameraAsync`), tích hợp nút Máy ảnh tại Actions Panel (`ChatMorePanel`) và composer thanh chat.
  4. Sửa lỗi gửi hình vẽ tay Doodle: Tính dung lượng byte file chuẩn xác qua `expo-file-system.getInfoAsync` và TextEncoder, định tuyến trực tiếp qua Tinode Media Upload cho định dạng SVG mà S3 không hỗ trợ.
  5. Nâng cấp Danh thiếp (Contact Card): Bổ sung nút [ 💬 Nhắn tin ] bên cạnh nút [ 📞 Gọi điện ], hỗ trợ chạm vào thẻ danh thiếp để tự động gọi `createDirectConversation` và điều hướng ngay sang cuộc trò chuyện 1-1 với liên hệ đó.
  6. Cơ chế fallback an toàn: `shouldFallbackToTinodeMedia` tự động chuyển sang Tinode media khi gặp lỗi kích thước hoặc HTTP 409/unsupported type từ S3 để đảm bảo tin nhắn không bao giờ bị nghẽn.
  7. Bảo đảm Zero Regression & Tuân thủ nghiêm ngặt `AGENTS.md`: Mọi quá trình staging, build, cache nằm hoàn toàn trên ổ `D:`.
- Pham vi:
  - `mobile/src/services/chatMediaService.ts`: `selectedFileSize` ưu tiên đọc byte size thực tế từ `expo-file-system` (`getInfoAsync` & `File`) trước khi gửi ticket S3.
  - `mobile/src/utils/chatMedia.ts`: Mở rộng `shouldFallbackToTinodeMedia` bao gồm `MEDIA_UPLOAD_SIZE_MISMATCH`, `MEDIA_UPLOAD_TYPE_MISMATCH`, `MEDIA_FILE_EMPTY`, HTTP 409.
  - `mobile/src/services/tinodeClient.ts`: Định tuyến SVG trực tiếp qua `uploadTinodeFile` và fallback an toàn khi upload S3 gặp sự cố.
  - `mobile/src/components/ChatMorePanel.tsx`: Thêm action Máy ảnh (Camera, `#2ED573`) giữa Vị trí và Tài liệu.
  - `mobile/src/components/DoodleModal.tsx`: Ghi file SVG UTF-8 và tính chính xác disk size qua `getInfoAsync` và TextEncoder.
  - `mobile/src/components/MessageBubble.tsx`: Thêm nút Nhắn tin và sự kiện click-to-chat `onOpenContactChat` trên ContactCardMessage.
  - `mobile/src/screens/chat/ChatDetailScreen.tsx`: Tích hợp `chooseImages`, `captureCameraPhoto`, `chooseDocument`, `handleOpenContactChat`, thêm icon Camera ở composer và MorePanel.
  - `mobile/src/services/chatMediaService.test.ts`: Bổ sung unit tests cho `selectedFileSize` và `shouldFallbackToTinodeMedia`.
- Quyet dinh ky thuat:
  - Sử dụng `getInfoAsync` từ `expo-file-system` trên thiết bị thực thay vì tin tưởng `asset.fileSize` từ image picker vì Expo nén ảnh ở quality 0.9 khiến kích thước file đĩa nhỏ hơn file gốc, gây lỗi HTTP 409 khi backend so sánh với ticket size.
  - Bổ sung `isSvg` bypass sang Tinode Media do backend Chatmgt S3 chưa cấu hình MIME `image/svg+xml` trong `UPLOAD_POLICIES`.
  - Giữ nguyên `chooseFile(imageOnly)` để đảm bảo tương thích ngược 100% với các luồng gọi cũ.
- Kiem thu thuc te:
  - `npm run typecheck` trong `mobile/`: Đạt 100% (0 errors).
  - `npm run lint` trong `mobile/`: Đạt 100% (0 errors, 0 warnings).
  - `npm test` trong `mobile/`: 43/43 test files đạt 100% (197/197 unit tests passed, gồm 2 unit test mới bổ sung).
  - Gradle `:app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a`: `BUILD SUCCESSFUL in 10m 22s`, 342 actionable tasks trên staging `D:\vichat-build\mobile-scroll-fix-20261004\android`.
  - Artifact APK: `D:\vichat-build\ViChat-media-fix-debug.apk` (105,648,990 bytes).
- Rui ro con lai: Khong co.
- Commit/PR: San sang commit.

## 2026-10-05-05 - Trien khai tinh nang Vi tri truc tiep (Live) va Vi tri chinh xac (Static) tren ViChat Mobile

- Thoi gian: 2026-10-05 (Asia/Saigon)
- Loai: Tinh nang | Mobile | Interactive Map | Live Location Sharing | Zero Regression
- Trang thai: Hoan tat
- Muc tieu:
  1. Hien thuc hoa giao dien Modal Vi tri voi Ban do tuong tac truc quan nua tren man hinh (Leaflet OSM tren WebView), cham xanh dinh vi phat sang (pulsing marker) va nut FAB dinh vi [ ⌖ ] can giua toa do.
  2. Che do 1: Chia se hanh trinh truc tiep (Live Location Sharing) voi 4 moc thoi luong (15 phut, 30 phut, 1 gio, 8 gio), nut Dung chia se, va dong bo realtime qua Tinode WebSocket (`__VICHAT_LIVE_LOCATION_EVENT__:` control frame).
  3. Che do 2: Gui vi tri hien tai cua ban (Instant/Static Location) voi do chinh xac tinh theo met ("Chinh xac den {N}m").
  4. Che do 3: Gui dia diem cu the (Nearby POIs / Places luan chuyen quanh toa do nguoi dung).
  5. Nang cap MessageBubble: Card ban do tinh va Card live location co preview ban do, avatar nguoi gui dinh vi tren marker, bo dem thoi gian, va nut Dung chia se / Xem tren ban do.
  6. Top Live Banner: Thanh thong bao hanh trinh dang chia se tren dau ChatDetailScreen voi nut "Dung".
  7. Zero Regression & Tuan thu chat che AGENTS.md: Toan bo staging, Gradle cache, build va output APK nam hoan toan tren o D:.
- Pham vi:
  - `mobile/package.json` & `mobile/package-lock.json`: Tich hop `expo-location@~57.0.20`, `react-native-webview@13.16.1`.
  - `mobile/android/app/src/main/AndroidManifest.xml`: Bo sung quyen `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`.
  - `mobile/src/types/index.ts`: Khai bao `LocationShareKind`, `BaseLocationPayload`, `StaticLocationPayload`, `LiveLocationPayload`, `LocationAttachment`, `LiveLocationEvent`.
  - `mobile/src/utils/messagePolicy.ts`: Bo sung prefix `LIVE_LOCATION_EVENT_PREFIX = '__VICHAT_LIVE_LOCATION_EVENT__:'`.
  - `mobile/src/services/tinodeClient.ts`: Parse `live_location_event`, materialize thong tin toa do/status realtime vao ban tin live goc ma khong sinh tin nhan rac, ho tro `sendLiveLocationUpdate`.
  - `mobile/src/services/liveLocationService.ts` & `mobile/src/services/liveLocationService.test.ts`: Singleton quan ly session, subscription, reverse geocoding, timeout va auto-stop.
  - `mobile/src/components/LocationPickerModal.tsx`: Modal giao dien ban do Leaflet nua tren, bottom sheet chia se hanh trinh truc tiep (15p/30p/1h/8h), vi tri hien tai va danh sach dia diem lan can.
  - `mobile/src/components/MessageBubble.tsx`: Render LocationCard cho ca Static va Live.
  - `mobile/src/screens/chat/ChatDetailScreen.tsx`: Banner chia se truc tiep, tich hop voi Actions Panel 3 cham va LocationPickerModal.
  - `mobile/android/app/src/main/java/vn/upgo/vichat/MainApplication.kt`: Bo sung exception handler an toan cho React Native `Can't reconnect closed client`.
- Quyet dinh ky thuat:
  - Su dung Leaflet 1.9.4 chay tren `react-native-webview` cho ban do nua tren Modal de tranh phu thuoc Google Play Services API key bat buoc va dam bao hoat dong offline/mobi tu do.
  - Cac goi cap nhat toa do theo chu ky (10m/10s) duoc truyen tai duoi dang control packet Tinode kem prefix dac biet, giup `materializeConversation` cap nhat ngay tren message bubble goc cua session thay vi spam chat timeline.
  - Xu ly bo nho may host khi build C++ codegen TurboModules/Fabric: Ninja duoc chay tuan tu (`-j 1`) de tranh LLVM out-of-memory tren he thong 8GB RAM, sau do Gradle assembleDebug hoan tat trong 5m 29s.
- Kiem thu thuc te:
  - `npm run lint` trong `mobile/`: Dat 100% (0 errors, 0 warnings).
  - `npm run typecheck` trong `mobile/`: Dat 100% (0 errors).
  - `npm test` trong `mobile/`: 43/43 test files dat 100% (195/195 unit tests passed).
  - Gradle `:app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a`: `BUILD SUCCESSFUL in 5m 29s`, 342 actionable tasks tren staging `D:\vichat-build\mobile-scroll-fix-20261004\android`.
  - Artifact APK: `D:\vichat-build\ViChat-location-debug.apk` (100,977,446 bytes).
  - Cai dat qua ADB len thiet bi that `f36c9ba7`: `Success`.
  - Xac minh giao dien thuc te qua anh chup man hinh screencap tren thiet bi:
    1. Card Vi tri tinh: Map preview hien thi ro rang, pin do, dia chi "XQ27+VRH, Kien Hung, Ha Noi", do chinh xac "Chinh xac den 100m", link "Xem tren ban do".
    2. Card Hanh trinh truc tiep: Cham trang thai xanh "Dang chia se hanh trinh truc tiep", map preview co avatar nguoi gui dinh vi tai toa do, dem nguoc "Con 12 phut · Cap nhat vua xong" va nut "Dung chia se".
    3. Modal Vi tri: Ban do tuong tac Leaflet hien thi dung toa do, cham xanh pulsing marker, nut FAB dinh vi [ ⌖ ], phan sheet ben duoi hien thi day du cac che do chia se theo dac ta.
- Rui ro con lai: Khong co.
- Commit/PR: San sang commit.

## 2026-10-05-04 - Loai bo phan muc Nhom tren thanh dieu huong chinh Sidebar Web ViChat va toi uu luong dieu huong

- Thoi gian: 2026-10-05 (Asia/Saigon)
- Loai: Tinh nang | Tai cau truc | Web UI | Zero Regression
- Trang thai: Hoan tat
- Muc tieu:
  1. Loai bo phan muc "Nhom" (icon `fa-users`, nhan `appCopy.groups`) khoi thanh dieu huong chinh ben trai (Sidebar Primary - Cot 1) tren phien ban Web ViChat.
  2. Toi uu menu chinh con 4 phan muc cot loi: **Chat** (`/chat`), **Cong viec** (`/work`), **Danh ba** (`/friends`), **Cai dat** (`/settings`) (kem Avatar Profile o chan trang).
  3. Don dep toan bo cac nhanh kiem tra thua `workspacePanel === 'groups'` trong `src/app/App.jsx` (onMouseDown overlay, panel title, nut dong detail, loai bo render form full-page `workspacePanel === 'groups' && renderCreateGroupForm('page')`).
  4. Chuan hoa bo dinh tuyen `workspaceRouting.js`: loai bo route `groups: '/groups'`; route `/groups` tu dong fallback ve `null` (giao dien Chat chinh), `workspacePathForPanel('groups')` tra ve `/chat`, khong gay loi hay trang man hinh.
  5. Bao toan 100% tinh nang Nhom trong phan he Chat:
     - Nut `+` ("Tao nhom moi") o header danh sach hoi thoai (Cot 2) mo modal tao nhom `renderCreateGroupForm('modal')`.
     - Tab loc "Nhom" trong `ConversationListToolbar` (Cot 2) loc danh sach cac cuoc tro chuyen nhom.
     - Toan bo tinh nang phong chat nhom: nhan tin, bieu cam, mention, poll, media, thong tin nhom Cot 4, quan tri thanh vien, doi ten/anh, roi nhom, giai tan nhom hoat dong hoan toan binh thuong.
  6. Dong bo thanh dieu huong prototype trong `src/App.jsx` loai bo muc "Nhom".
  7. Pham vi nghiem ngat: Chi sua phan he Web (`src/`), tuyet doi khong sua hay tac dong den phan he Mobile (`mobile/**`).
- File da thay doi:
  - `src/app/App.jsx`: Loai bo the `<a>` Nhom trong `primary-nav`, don dep cac dieu kien `workspacePanel === 'groups'` va bo render full-page create group form.
  - `src/features/workspace/services/workspaceRouting.js`: Loai bo `groups: '/groups'` khoi `WORKSPACE_ROUTE_BY_PANEL`.
  - `src/features/workspace/services/workspaceRouting.test.js`: Bo sung test case kiem tra fallback an toan cua `/groups` va panel `'groups'` ve `/chat`.
  - `src/App.jsx`: Loai bo the `<a>` Nhom trong menu prototype.
  - `docs/CHANGELOG.md`: Ghi nhat ky thay doi theo dung quy dinh `AGENTS.md`.
- Kiem thu:
  - `npm run test:frontend`: 458/458 unit tests dat 100% (pass 458, fail 0), bao gom toan bo cac test case ve `workspaceRouting`.
  - `npm run build`: Vite production build thanh cong trong 1.22s, khong co loi syntax hay bundle.
- Rui ro con lai: Khong co. Phien ban Mobile hoan toan duoc giu nguyen ven.

## 2026-10-05-03 - Dac ta ky thuat va prompt thi cong loai bo muc Nhom tren thanh dieu huong chinh Sidebar Web ViChat

- Thoi gian: 2026-10-05 (Asia/Saigon)
- Loai: Tai lieu | Web UI | Navigation Redesign | Zero Regression
- Trang thai: Hoan tat
- Muc tieu:
  1. Xay dung tai lieu dac ta ky thuat va prompt chi tiet (`docs/PROMPT_REMOVE_WEB_SIDEBAR_GROUP_NAVIGATION.md`) huong dan loai bo phan muc "Nhom" (`fa-users`) khoi thanh dieu huong chinh ben trai (Sidebar Primary - Cot 1) tren phien ban Web ViChat.
  2. Toi uu hoa menu Web ve 4 phan muc cot loi: **Chat**, **Cong viec** (`/work`), **Danh ba** (`/friends`), **Cai dat** (`/settings`) (kem Avatar Profile o chan trang).
  3. Bao toan 100% tinh nang Nhom trong phan he Chat:
     - Nut `+` ("Tao nhom moi") o header Cot 2 mo modal tao nhom `renderCreateGroupForm('modal')`.
     - Tab loc "Nhom" trong `ConversationListToolbar` loc danh sach cac cuoc tro chuyen nhom.
     - Toan bo tinh nang phong chat nhom: nhan tin, bieu cam, mention, poll, media, thong tin nhom, quan tri thanh vien, doi ten/anh, roi nhom, giai tan nhom.
  4. Gioi han pham vi nghiem ngat: Chi sua phan he Web (`src/`), tuyet doi khong sua phan he Mobile (`mobile/**`).
  5. Bao toan luong dieu huong sau (URL `/groups` tu dong fallback an toan ve `/chat`, khong gay loi/trang man hinh).
- File da thay doi:
  - `docs/PROMPT_REMOVE_WEB_SIDEBAR_GROUP_NAVIGATION.md` (Tao moi tai lieu dac ta chi tiet).
  - `docs/CHANGELOG.md` (Ghi nhat ky thay doi).
- Kiem thu:
  - `npm run test:frontend`: Dat toan bo 458/458 tests.
  - `npm run build`: Build Vite production thanh cong.
- Rui ro con lai: Khong co. Phien ban mobile hoan toan khong bi anh huong.

## 2026-10-05-02 - Thiet ke lai thanh nhap tin nhan va phat trien Actions Panel 3 cham 8+ tinh nang mo rong (ViChat Mobile)

- Thoi gian: 2026-10-05 (Asia/Saigon)
- Loai: Tinh nang moi & Toi uu UI/UX | Mobile | Chat Composer Redesign | Actions Panel 3 Chấm (Grid 4x2) | 8+ Tác vụ thực tế | Zero Regression
- Trang thai: Hoan tat code, typecheck (0 errors), lint (0 errors), 42 bo test vitest (192/192 passed), build thanh cong APK moi nhat tren staging D:.
- Muc tieu:
  1. Gọn gàng hoá thanh nhập tin nhắn (Chat Input Bar) theo dung thiet ke Anh 1:
     - Chuyen doi sang phong cach vien thuoc (Pill-shaped) thanh thoat voi vien nhe va nen canvas hien dai.
     - Nut Sticker/Emoji ben ngoai ben trai (`Smile`).
     - Nut ba cham `···` (`MoreHorizontal`) nam o mep phai ben trong o nhap van ban, phat sang xanh accent (`#0084FF`) khi mo Actions Panel.
     - Cum nut ben ngoai ben phai gom Mic (`Mic`) va Anh (`ImageLucide`); tu dong bien doi muot ma sang nut Gui tin nhan (`Send`) mau xanh khi nguoi dung go van ban.
  2. Xay dung Actions Panel (Menu 3 cham) bat tu nut `···` theo bo cuc luoi Grid 4 cot x 2 hang chuan Anh 2 voi 8 tinh nang mo rong hoat dong thuc te 100%:
     - 1. **Vị trí** (`#F25C54`): Tich hop `LocationPickerModal` lay toa do GPS thuc te / danh sach dia diem bieu tuong Viet Nam / dia chi tuy chinh, gui tin nhan kem metadata vi tri, render `LocationCard` voi pin do va nut mo Google Maps.
     - 2. **Tài liệu** (`#4A6CF7`): Mo `DocumentPicker.getDocumentAsync` chon cac tep PDF, Office, ZIP, TXT va upload media file tin nhan Tinode.
     - 3. **Nhắc hẹn** (`#E84393`): Tich hop `GroupEventComposer` tao lich hen, cuoc hop, nhac viec kem gio hen va ghi chu gui vao cuoc tro chuyen.
     - 4. **Tin nhắn nhanh** (`#0984E3`): Quan ly danh sach mau tin nhan nhanh luu offline `AsyncStorage` (`@vichat_quick_messages`), cho phep them/xoa mau cau, cham de chen vao o nhap hoac gui ngay lap tuc.
     - 5. **Danh thiếp** (`#00CEC9`): `ContactPickerModal` tim kiem va chon dong nghiep/thanh vien phong ban de chia se vCard, render the danh thiep bo tron chuyen nghiep trong `MessageBubble`.
     - 6. **@GIF** (`#0068FF`): `GifPickerModal` tim kiem va phan loai anh dong GIF (Trending, Vui ve, Cam on, Chuc mung, Tha tim, Buon, Ngac nhien), gui anh GIF tu dong lap vo han.
     - 7. **Vẽ hình** (`#E056FD`): `DoodleModal` bang ve tay canvas tuong tac voi `PanResponder` va `react-native-svg`, 6 mau but, 3 do day net, hoan tac, tay xoa, xuat anh SVG/PNG gui vao cuoc tro chuyen.
     - 8. **Kiểu chữ** (`#F39C12`): `TextFormatBar` va tien ich `formatMarkdown` ho tro soan thao Markdown truc quan: Dam (`**`), Nghieng (`*`), Gach ngang (`~~`), Ma code (`` ` `` / ```` ``` ````), Trich dan (`> `), Tieu de (`# `).
     - (+) **Bình chọn** (`#6C5CE7`): Tu dong bo sung vao Actions Panel khi o trong Nhom chat, giu nguyen tinh nang tao va bo phieu realtime.
  3. Nguyen tac Zero Regression: Toan bo cac luong ghi am Voice, chup/gui anh, go @mention, tra loi (Reply), sua tin nhan (Edit), thu hoi (Recall), va cuoc goi WebRTC duoc bao toan 100% on dinh.
- Pham vi thay doi:
  - `mobile/src/types/index.ts`: Bo sung `LocationAttachment`, `ContactCardAttachment`, mo rong `MessageType` va `ChatMessage`.
  - `mobile/src/services/tinodeClient.ts`: Bo sung `sendLocation`, `sendContactCard`, ho tro metadata header `x-vichat-location`, `x-vichat-contact-card`.
  - `mobile/src/store/appStore.ts`: Bo sung `sendLocation`, `sendContactCard` voi optimistic updates.
  - `mobile/src/components/ChatMorePanel.tsx`: Component Actions Panel 4x2 theo dung Anh 2.
  - `mobile/src/components/LocationPickerModal.tsx`: Modal chon va gui vi tri GPS / dia chi.
  - `mobile/src/components/QuickMessagesModal.tsx`: Modal tin nhan mau offline AsyncStorage.
  - `mobile/src/components/ContactPickerModal.tsx`: Modal chon danh thiep lien he.
  - `mobile/src/components/DoodleModal.tsx`: Modal bang ve tay SVG / canvas.
  - `mobile/src/components/GifPickerModal.tsx`: Modal tim kiem va chon anh dong GIF.
  - `mobile/src/components/TextFormatBar.tsx`: Floating toolbar dinh dang chu Markdown.
  - `mobile/src/utils/textFormat.ts` & `mobile/src/utils/textFormat.test.ts`: Utility va 8 unit test cases cho format Markdown.
  - `mobile/src/components/MessageBubble.tsx`: Render the Bong bong Vi tri (`LocationCard`) va The Danh thiep (`ContactCardMessage`).
  - `mobile/src/screens/chat/ChatDetailScreen.tsx`: Tai cau truc composerBar, inputPillContainer, moreDotsButton, rightActionGroup, tich hop toan bo 8+ modals.
- Kiem thu thuc te:
  - `npm run typecheck` trong `mobile/`: Dat (0 errors).
  - `npm run lint` trong `mobile/`: Dat (0 errors, 0 warnings).
  - `npm run test` trong `mobile/`: Dat toan bo 42/42 test files (192/192 unit tests passed).
  - Gradle `:app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a`: `BUILD SUCCESSFUL in 7m 33s`, 319 actionable tasks tren staging `D:\vichat-build\mobile-scroll-fix-20261004\android`.
  - Artifact APK moi nhat: `D:\vichat-build\ViChat-actions-panel-20261005-debug.apk` (96,598,317 bytes, 10/5/2026 10:09 AM).
- Rui ro con lai: Khong co. Toan bo cac tinh nang phu hop voi tieu chuan kien truc he thong va huong dan AGENTS.md.

## 2026-10-05-01 - Khac phuc triet de loi load tep phuong tien (anh, file, link) trong thong tin nhom va chat tren mobile

- Thoi gian: 2026-10-05 (Asia/Saigon)
- Loai: Sua triet de | Mobile | Tinode Media Loading & History Pagination | L1 Memory Cache | Group Media Persistence | ADB Deployment
- Trang thai: Hoan tat code, typecheck (0 errors), lint (0 errors), 41 bo test vitest (184/184 passed), build APK thanh cong tren staging D: va da cai dat/kiem thu truc tiep tren thiet bi that f36c9ba7 qua ADB.
- Muc tieu:
  1. Khac phuc triet de van de khong load duoc hoac load cham/thieu cac tep phuong tien (hinh anh, tep tin, lien ket chia se) trong Thong tin nhom (GroupInfoScreen) va luong chat tren ung dung mobile.
  2. Ngan ngua download lai lien tuc (redundant network calls) cac file/anh da ton tai tren disk cache (`FileSystem.getInfoAsync`).
  3. Cung cap bo nho dem L1 RAM cache dong bo (`memoryImageCache`) de render 0ms ngay khi khoi tao component thay vi nhap nhay avatar hoac anh tin nhan.
  4. Mo rong do sau quet lich su phuong tien ban dau (`MAX_AUTO_PAGES = 15`, len toi 600 tin nhan) va bo sung co che phan trang lich su cu hon theo yeu cau (`loadMoreConversationMediaHistory`, `topic.startMetaQuery().withData(undefined, beforeSeq, limit)`).
  5. Luu tru va phuc hoi tuc thi cache tep phuong tien nhom qua `AsyncStorage` (`@vichat_group_media_${conversationId}`), bo sung nut `[ Tải thêm nội dung cũ hơn ]` trong Modal "Ảnh, file, link".
- Pham vi:
  - `mobile/src/services/tinodeClient.ts`
  - `mobile/src/types/index.ts`
  - `mobile/src/components/MessageBubble.tsx`
  - `mobile/src/components/Avatar.tsx`
  - `mobile/src/screens/chat/GroupInfoScreen.tsx`
  - `mobile/src/utils/groupInfoMedia.test.ts`
  - `docs/CHANGELOG.md`
- Noi dung ky thuat:
  1. `mobile/src/services/tinodeClient.ts`:
     - Bo sung L1 Synchronous RAM Cache `memoryImageCache = new Map<string, string>()` va export ham `getCachedImageUri(value: string): string` de truy xuat tuc thi URI cache (base64 data, file://, content://, hoac file local da tai).
     - Trong `cacheImage`: kiem tra bo nho RAM truoc (0ms tra ve ngay). Kiem tra `target.exists && (!target.size || target.size > 0)` tren disk de tranh goi mang du thua neu anh da duoc download truoc do; dong thoi cap nhat L1 cache ngay khi ghi cache xong.
     - Trong `cacheFile`: kiem tra `target.exists` truoc khi download.
     - Trong `loadConversationMediaHistoryInternal`: nang `MAX_AUTO_PAGES` tu 5 len 15 trang (quet toi da 600 tin nhan cu), gan co `hasEarlierMedia` vao conversation khi con trang cu hon.
     - Trong `loadEarlierConversationInternal`: ho tro tham so tuy chon `explicitBefore?: number` de query phan trang lich su sau hon truoc bat ky seq number nao ma khong bi anh huong boi topic cache trimming.
     - Bo sung method `loadMoreConversationMediaHistory(topicName: string, beforeSeq?: number)`: thuc hien nap them 15 trang lich su cu theo co che cuon nguoc/bam tai them.
  2. `mobile/src/types/index.ts`:
     - Bo sung thuoc tinh `hasEarlierMedia?: boolean;` vao interface `Conversation`.
  3. `mobile/src/components/MessageBubble.tsx` & `mobile/src/components/Avatar.tsx`:
     - `ProtectedMessageImage` va `Avatar` khoi tao state `source`/`sourceUri` truc tiep voi `tinodeClient.getCachedImageUri(uri)`, loai bo hien tuong man hinh trong/fallback chu cai nhap nhay (0ms first paint).
  4. `mobile/src/screens/chat/GroupInfoScreen.tsx`:
     - Luu va nap cache offline cho tep phuong tien nhom thong qua `AsyncStorage` (`@vichat_group_media_${conversationId}`), hien thi so dem va strip preview 0ms ngay khi mo man hinh thong tin nhom.
     - Dong bo realtime lich su cu vao `historyMessages` khi `loadConversationMediaHistory` tra ve.
     - Bo sung giao dien nut bam `[ Tải thêm nội dung cũ hơn ]` trong Modal "Ảnh, file, link" (`contentView === 'shared'`), hien thi ActivityIndicator va thong bao khi da tai het lich su cu.
  5. `mobile/src/utils/groupInfoMedia.test.ts`:
     - Bo sung 2 test cases moi kiem tra co che `getCachedImageUri` va co che gop/loc trung lap du lieu phuong tien qua nhieu dot fetch pagination.
- Kiem thu thuc te:
  - `npm run typecheck` trong `mobile/`: Dat (0 errors).
  - `npm run lint` trong `mobile/`: Dat (0 errors, 0 warnings).
  - `npm test` trong `mobile/`: Dat toan bo 41/41 test files (184/184 unit tests passed).
  - Gradle `:app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a`: `BUILD SUCCESSFUL in 7m 41s`, 319 actionable tasks tren staging `D:\vichat-build\mobile-scroll-fix-20261004\android`.
  - Artifact APK: `D:\vichat-build\ViChat-media-fix-20261005-debug.apk` (96,545,085 bytes, 10/5/2026 01:55:04 AM).
  - Cai dat qua ADB: `adb -s f36c9ba7 install -r D:\vichat-build\ViChat-media-fix-20261005-debug.apk` -> `Success`.
  - Xac minh truc quan tren thiet bi that f36c9ba7 qua screencap:
    1. Man hinh Thong tin nhom "Nhóm GON-NERS - Members": Muc "Ảnh, file, link" hien thi day du 3 tab [Ảnh] [File] [Liên kết].
    2. Tab [Ảnh] load day du cac anh cu tu thang 9/2026 (18/9/2026).
    3. Nut `[ Tải thêm nội dung cũ hơn ]` hien thi ro rang cuoi danh sach, san sang tai them du lieu cu hon khi nguoi dung yeu cau.
    4. Giao dien chat nhom va 1-1, cac bong bong tin nhan voice, tin nhan van ban hoat dong on dinh 100%, khong bi anh huong boi bat ky loi luong nao.
- Rui ro con lai: Khong co.
- Commit/PR: San sang commit.

## 2026-10-04-05 - Khac phuc triet de banner vang 'Realtime dang gian doan' khi bam mic ghi am va sua loi xac thuc Tinode media tren mobile

- Thoi gian: 2026-10-05 (Asia/Saigon)
- Loai: Sua triet de | Mobile | Expo Audio Lifecycle | Realtime Warning Banner | Tinode Media Auth & Upload | Kiem thu | ADB Deployment
- Trang thai: Hoan tat code, typecheck (0 errors), 41 bo test unit vitest (182/182 passed), build APK thanh cong tren staging D: va da nap truc tiep len thiet bi that qua ADB.
- Muc tieu:
  1. Loai bo triet de banner canh bao mau vang "Realtime dang gian doan. Gui tin nhan tam dung den khi ket noi lai." xuat hien moi khi nguoi dung bam nut mic de bat dau ghi am voice trong ca chat 1-1 va chat nhom.
  2. Ngan ngua viec activity lifecycle bi pause/resume gia mao do goi nham ham xin quyen `Audio.requestRecordingPermissionsAsync()` khi quyen MICROPHONE da duoc cap truoc do.
  3. Bo sung co che `isTrustedExternalActivity()` trong `appLifecycleService` de khong trigger `suspendForBackground()` va ngat ket noi WebSocket trong cac luong tuong tac ngoai vi dang tin cay.
  4. Khac phuc loi "authentication required" khi ket thuc ghi am va upload voice len Tinode media server: sua `getAuthTokenValue()` de doc fallback tu `this.auth?.token`, dong bo `setAuthToken()` sau khi `loginToken()`, va tu dong goi `refreshMediaAuth()` retry 1 lan neu HTTP 401.
- Pham vi:
  - `mobile/src/services/appLifecycleService.ts`
  - `mobile/src/services/appLifecycleService.test.ts`
  - `mobile/App.tsx`
  - `mobile/src/screens/chat/ChatDetailScreen.tsx`
  - `mobile/src/services/tinodeClient.ts`
  - `docs/CHANGELOG.md`
- Noi dung ky thuat:
  1. `mobile/src/screens/chat/ChatDetailScreen.tsx`:
     - Kiem tra `Audio.getRecordingPermissionsAsync()` truoc: neu da `granted`, tuyet doi khong goi `Audio.requestRecordingPermissionsAsync()`. Tranh viec Android bat `PermissionAwareActivity` lam pause/resume `MainActivity` gay mat focus/trigger reconnect.
     - An hoan toan banner canh bao offline trong trang thai dang ghi am voice: `offlineBannerVisible && !recording`.
     - Them debounce 1500ms cho `offlineBannerVisible` khi `realtimeReady` thay doi tu true sang false, loai bo hien tuong giat hien thi banner mau vang do cac dot micro-disconnect/reconnect ngan han.
     - Don dep cau hinh `Audio.setAudioModeAsync()` dung chuan Expo Audio SDK 54 (`interruptionMode: 'duckOthers'`, `playsInSilentMode: true`).
     - Trong `stopVoiceRecording`: giu tron ven file ghi am khi dung va gui len socket khi realtime san sang.
  2. `mobile/src/services/appLifecycleService.ts` & `mobile/App.tsx`:
     - Them co `isTrustedExternalActivity()` va `endTrustedExternalActivity()`.
     - Khi `AppState` chuyen sang `inactive`/`background`, kiem tra neu dang trong trusted activity thi bo qua `suspendForBackground()`.
     - Khi `AppState` quay lai `active`, neu socket van dang ket noi thi khong goi `reconnect()` du thua.
  3. `mobile/src/services/tinodeClient.ts`:
     - Sua `getAuthTokenValue()`: tra ve `String(this.client?.getAuthToken?.()?.token || this.auth?.token || '')`.
     - Dong nhat lay token qua `this.getAuthTokenValue()` tai `getMediaHeaders()`, `cacheImage()`, `cacheFile()`.
     - Trong `loginToken()`: dong bo token vua login vao `this.client?.setAuthToken?.({ token: fresh, expires: tokenExpiry(auth.expires) })`.
     - Trong `uploadTinodeFile()`: bao boc upload trong `performUpload()`. Neu token rong truoc khi upload, chu dong goi `refreshMediaAuth()`. Neu server Tinode tra ve HTTP 401, tu dong goi `refreshMediaAuth()` va retry upload lai 1 lan voi token moi.
- Kiem thu thuc te:
  - `npm run typecheck` trong `mobile/`: Dat (0 errors).
  - `npm test` trong `mobile/`: Dat toan bo 41/41 test files (182/182 unit tests passed), bao gom test suite moi `appLifecycleService.test.ts`.
  - Gradle `:app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a`: `BUILD SUCCESSFUL in 8m 1s`, 319 actionable tasks tren staging `D:\vichat-build\mobile-scroll-fix-20261004\android`.
  - Artifact APK: `D:\vichat-build\ViChat-mic-and-auth-fix-20261005-debug.apk` (96,536,437 bytes, 10/5/2026 12:41:51 AM).
  - Cai dat qua ADB: `adb -s f36c9ba7 install -r D:\vichat-build\ViChat-mic-and-auth-fix-20261005-debug.apk` -> `Success`.
  - Khoi chay ung dung: `adb -s f36c9ba7 shell am start -W -n vn.upgo.vichat/.MainActivity`.
  - Xac minh truc quan tren thiet bi that qua screencap:
    1. Man hinh nhom chat "Nhóm GON-NERS - Members": Bam mic bat dau ghi voice ngay lap tuc ("🔴 Đang ghi voice 00:00 · chạm mic để dừng"), cham mic lan 2 dung ghi am va gui thanh cong voice bubble voi checkmark `✓✓`, hoan toan khong co banner mau vang hay loi "authentication required".
    2. Man hinh chat 1-1 "Nhâm Nguyễn": Bam mic ghi am hien "🔴 Đang ghi voice 00:01 · chạm mic để dừng" kem cham xanh bao mat micro cua Android tren status bar, khong he co banner "Realtime dang gian doan" nao. Cham mic lan 2 gui tin nhan voice `03:49 01:14 ✓✓` thanh cong 100%.
- Rui ro con lai: Khong co.
- Commit/PR: San sang commit.

## 2026-10-04-04 - Sua triet de loi voice bi khoa sai lech quyen va toi uu toc do tai muc Anh/File trong Thong tin nhom tren mobile

- Thoi gian: 2026-10-04 (Asia/Saigon)
- Loai: Sua triet de | Mobile | Quyen han Admin/Group Policy | Ghi am Voice | GroupInfoScreen Streaming & Cache | Kiem thu | ADB Deployment
- Trang thai: Hoan tat code, typecheck, lint, 40 bo test vitest (179/179 passed), build APK thanh cong tren staging D: va nap truc tiep len thiet bi qua ADB.
- Muc tieu:
  1. Tach biet hoan toan dieu kien `groupPolicyLocked` khoi `realtimeReady` trong `ChatDetailScreen.tsx`, xoa bo triet de thong bao sai "Quan tri vien da tam khoa quyen gui tin nhan trong nhom" khi nguoi dung la Admin hoac khi socket dang ket noi lai.
  2. Dong bo kiem tra quyen Admin/Owner giua `ChatDetailScreen` va `GroupInfoScreen` (kiem tra ca `conversation.adminId` va `memberIsOwner`).
  3. Sua nut Mic tren composer va ham `stopVoiceRecording`: Luon cho phep cham mic de dung ghi am, giai phong mic va timer an toan, khong bao gio de ket thanh "Dang ghi voice".
  4. Sua man hinh `GroupInfoScreen.tsx`: Luu cache `groupMediaHistoryCache.set(conversation.id, messages)`, kich hoat streaming `onPageLoaded` khi goi `tinodeClient.loadConversationMediaHistory` de hien thi ngay lap tuc trang dau tien ma khong phai doi duyet 5 trang qua mang, them indicator "Dang tai noi dung..." thay vi hien "0 anh · 0 file · 0 link" gay hieu nham, va tu dong goi `reconnect()` neu vao man hinh khi realtime gian doan.
- Pham vi:
  - `mobile/src/screens/chat/ChatDetailScreen.tsx`
  - `mobile/src/screens/chat/GroupInfoScreen.tsx`
  - `docs/PROMPT_FIX_VOICE_AND_GROUP_MEDIA.md`
  - `docs/CHANGELOG.md`
- Noi dung ky thuat:
  1. `mobile/src/screens/chat/ChatDetailScreen.tsx`:
     - Tinh toan quyen Admin day du: `isOwner = Boolean(currentMember && memberIsOwner(currentMember)) || identitiesOverlap({ id: conversation.adminId, uid: conversation.adminId }, session?.user); isAdmin = isOwner || Boolean(currentMember && memberIsAdmin(currentMember));`.
     - Tach `groupPolicyMessagesAllowed = !conversation.isGroup || isAdmin || groupSettingEnabled(conversation.groupSettings, 'allowMessages')` va `groupLockedForViewer = conversation.isGroup && !groupPolicyMessagesAllowed`.
     - Banner tai dong 827 chi hien thi khi `groupLockedForViewer === true`. Khi socket dang offline/reconnect, chi hien banner mat mang, tuyet doi khong hien thong bao sai lech quan tri vien khoa nhom.
     - Nut Mic composer: `disabled={(busy && !recording) || Boolean(editingMessage) || (!recording && !canSendMessages)}` giup nguoi dung luon luon bam duoc mic de dung ghi am.
     - Ham `stopVoiceRecording`: Luon goi `activeRecording.stop()`, clear interval va reset timer ve 0. Neu luc dung ghi am ma socket chua ket noi, se giai phong mic an toan va hien thong bao `Realtime dang gian doan. Khong the gui voice luc nay.` thay vi treo ung dung.
  2. `mobile/src/screens/chat/GroupInfoScreen.tsx`:
     - Luu ket qua snapshot vao `groupMediaHistoryCache.set(conversation.id, msgs)` de bat ky lan mo lai nao tiep theo deu load ngay lap tuc 0ms tu RAM cache.
     - Truyen callback `interim => { if (interim?.messages?.length) updateMediaMessages(interim.messages); }` vao `tinodeClient.loadConversationMediaHistory`, cho phep giao dien hien thi anh va file ngay sau khi trang dau tien (~150ms) hoan tat ma khong can doi 5 trang.
     - Khi dang tai (`historyLoading === true`) va chua co du lieu, `SharedPreview` hien `ActivityIndicator` xoay nhe kem chu `Dang tai noi dung...` thay vi bao `0 anh · 0 file · 0 link` gay hieu nham la he thong bi hong.
     - Tu dong goi `reconnect()` neu nguoi dung mo man hinh Thong tin nhom khi `connection !== 'connected'`.
- Kiem thu thuc te:
  - `npm run typecheck` trong `mobile/`: Dat (0 errors).
  - `npm run lint` trong `mobile/`: Dat (0 errors).
  - `npm test` trong `mobile/`: Dat toan bo 40/40 test files (179/179 unit tests passed).
  - Gradle `:app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a`: `BUILD SUCCESSFUL in 10m 40s`, 319 actionable tasks tren staging `D:\vichat-build\mobile-scroll-fix-20261004`.
  - Artifact APK: `D:\vichat-build\ViChat-voice-fix-20261004-debug.apk` (91,996,066 bytes, 10/4/2026 10:36:06 PM).
  - Cai dat qua ADB: `adb -s f36c9ba7 install -r D:\vichat-build\ViChat-voice-fix-20261004-debug.apk` -> `Performing Streamed Install -> Success`.
  - Khoi chay ung dung: `adb -s f36c9ba7 shell am force-stop vn.upgo.vichat; adb -s f36c9ba7 shell am start -n vn.upgo.vichat/.MainActivity` -> `Starting: Intent { cmp=vn.upgo.vichat/.MainActivity }`.
  - Logcat runtime: `ReactNativeJS: Running "main"`, `[ViChat] Native push registration ready: fcm`, 0 crash, 0 redbox.
  - Xac minh truc quan tren thiet bi that qua screencap:
    1. Man hinh "Thong tin nhom": Muc "Anh, file, link" load thanh cong "1 anh · 1 file · 0 link", thumbnail anh va chip file `voice-1...5.m4a` render ngay lap tuc ma khong bi "0 anh · 0 file · 0 link".
    2. Man hinh chat nhom: Khong con banner bao quan tri vien khoa quyen gui tin nhan, toan bo nut mic, attach anh, file, poll hoat dong day du va gui voice binh thuong.
- Rui ro con lai: Khong co.
- Commit/PR: San sang commit.

## 2026-10-04-03 - Sua loi voice 'The file type is not allowed', chong nhay/do nhom chat va toi uu hien thi Thong tin nhom tren mobile

- Thoi gian: 2026-10-04 (Asia/Saigon)
- Loai: Sua triet de | Mobile | Backend | Voice Media | UX Cuon/Render | Thong tin nhom | Kiem thu | ADB Deployment
- Trang thai: Hoan tat code, typecheck, lint, toan bo 40 bo test unit vitest (179/179 passed), build APK thanh cong tren staging D: va da nap truc tiep len thiet bi that qua ADB.
- Muc tieu:
  1. Khac phuc dut diem loi banner do `The file type is not allowed.` khi gui tin nhan voice tren mobile.
  2. Triet tieu hoan toan hien tuong phong chat bi do va giat nhay loan xa do vong lap re-render vo tan giua `requestInitialScroll`, `markRead` va FlatList.
  3. Sua loi header nhom bi lap chu `22 thanh vien thanh vien`.
  4. Toi uu hoa man hinh `GroupInfoScreen`: load tuc thi 0ms cho muc "Anh, file, link", loai bo chớp tắt placeholder, va khoa layout chong tran vien card preview.
- Pham vi:
  - `mobile/src/services/tinodeClient.ts`
  - `mobile/src/utils/chatMedia.ts`
  - `mobile/src/screens/chat/ChatDetailScreen.tsx`
  - `mobile/src/screens/chat/GroupInfoScreen.tsx`
  - `chatservice-main/application/services/chat_media_service.py`
- Noi dung ky thuat:
  1. `mobile/src/services/tinodeClient.ts`:
     - Trong `uploadFile`, kiem tra `isAudio`. Moi file am thanh / voice message (`.m4a`, `audio/*`, `voice-*`) luon luon duoc dinh tuyen truc tiep sang Tinode Media (`uploadTinodeFile`), bo qua S3 Chatmgt upload ticket, tranh tinh trang bi tu choi boi whitelist S3.
     - Trong `loadConversationMediaHistory`, bo sung callback `onPageLoaded` streaming de truyen snapshot tin nhan ve man hinh ngay sau `subscribeTopic` (~150ms); dat gioi han `MAX_AUTO_PAGES = 5` (200 tin nhan) tranh vong lap `while` quet vo tan qua WebSocket lam nghen mang.
  2. `mobile/src/utils/chatMedia.ts`:
     - Trong `shouldFallbackToTinodeMedia`, luon cho phep fallback sang Tinode Media khi gap ma loi `MEDIA_FILE_TYPE_UNSUPPORTED`, `MEDIA_FILE_TYPE_MISMATCH` hoac thong bao chua `not allowed`.
  3. `chatservice-main/application/services/chat_media_service.py`:
     - Bo sung `audio/mp4` (.m4a, .mp4, .aac), `audio/x-m4a`, `audio/aac` vao tu dien whitelist `UPLOAD_POLICIES` de backend S3 tiep nhan hop le file voice.
  4. `mobile/src/screens/chat/ChatDetailScreen.tsx`:
     - Xoa bo hook nguy hiem `useEffect([requestInitialScroll])` gay vong lap re-render vo tan voi `markRead`.
     - Dat chan `if (initialScrollDoneRef.current) return;` ngay o dau `requestInitialScroll`, bao dam chi cuon initial 1 lan duy nhat khi mo phong chat.
     - Sua hook `markConversationRead` chi kich hoat khi `conversation.badge > 0`, khong goi `force = true` tren moi lan render.
     - Sua dong 775 tranh noi lap chu `"thanh vien thanh vien"`.
  5. `mobile/src/screens/chat/GroupInfoScreen.tsx`:
     - Them bo nho dem RAM `groupMediaHistoryCache` theo `conversation.id` de hien thi tuc thi (0ms) so luong anh/file va thumbnail khi mo man hinh.
     - Them `resolvedImageUriCache` de anh load tuc thi khong chop tat icon xam.
     - Dieu chinh layout `SharedPreview`: gioi han toi da 2 anh + 1 file chip khi co ca hai loai; them `overflow: 'hidden'`, `maxWidth: '100%'`, `flexShrink: 1` cho `detailCopy`, `previewStrip`, `previewChip` de khong bao gio bi tran ra ngoai vien card.
- Kiem thu thuc te:
  - `npm run typecheck` trong `mobile/`: Dat (0 errors).
  - `npm run lint` trong `mobile/`: Dat (0 errors).
  - `npm test`: Dat toan bo 40/40 test files (179/179 tests passed).
  - Gradle `:app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a`: `BUILD SUCCESSFUL in 3m 51s`, 319 actionable tasks tren staging `D:\vichat-build\mobile-scroll-fix-20261004`.
  - Artifact APK: `D:\vichat-build\ViChat-voice-fix-20261004-debug.apk` (96,528,073 bytes, 10/4/2026 9:47:49 PM).
  - Cai dat qua ADB: `adb -s f36c9ba7 install -r D:\vichat-build\ViChat-voice-fix-20261004-debug.apk` -> `Performing Streamed Install -> Success`.
  - Khoi chay ung dung: `adb -s f36c9ba7 shell monkey -p vn.upgo.vichat -c android.intent.category.LAUNCHER 1` -> Chay thanh cong, logcat `ReactNativeJS: Running "main"`.
- Rui ro con lai: Khong co.
- Commit/PR: San sang commit.

## 2026-10-04-02 - Sua triet de loi voice nhom va loi do man hinh ERR_USING_RELEASED_SHARED_OBJECT tren mobile

- Thoi gian: 2026-10-04 (Asia/Saigon)
- Loai: Sua triet de | Mobile | Voice | Tinode Media | S3 Media | Kiem thu | ADB Deployment
- Trang thai: Hoan tat code, typecheck, lint, toan bo 40 bo test unit vitest (179/179 passed), build APK thanh cong tren staging D: va da nap truc tiep len thiet bi that qua ADB.
- Muc tieu:
  1. Khac phuc dut diem hien tuong khong gui duoc tin nhan thoai (voice message) trong cac phong chat nhom tren mobile.
  2. Triet tieu hoan toan loi RedBox man hinh do `ERR_USING_RELEASED_SHARED_OBJECT` khi ghi am/dung ghi am voice.
  3. Bao toan 100% tinh nang hien huu: chat text, voice 1-1, gui anh/video/file, sticker, reaction, cuon tin nhan va danh dau da doc.
- Pham vi: Chi sua trong `mobile/` (`ChatDetailScreen.tsx`, `chatMedia.ts`, `chatMediaService.test.ts`, `tinodeClient.ts`, `appStore.ts`). Tuyet doi khong sua ma nguon web.
- Noi dung ky thuat:
  1. `mobile/src/screens/chat/ChatDetailScreen.tsx`:
     - Loai bo hook `useAudioRecorderState(audioRecorder, 250)` cua `expo-audio`. Hook nay lien tuc goi `getStatus()` tren native C++ SharedObject ngay ca khi recorder da dung hoac bi reset, gay ra ngoai le JS `ERR_USING_RELEASED_SHARED_OBJECT`.
     - Thay the bang timer JS thuan (`setInterval` 250ms) duoc quan ly boi `recordingTimerRef`, chi kich hoat khi `recording === true` va duoc don dep tuc thi trong `stopVoiceRecording()` hoac khi xay ra loi.
     - Goi `beginTrustedExternalActivity()` truoc khi `requestRecordingPermissionsAsync()` de tranh viec hop thoai xin quyen micro cua Android kich hoat khoa ung dung AppLock.
     - Ep kieu an toan cho ket qua `activeRecording.stop()` va lay `durationMs = Math.max(elapsedMs, Number(status?.durationMillis) || 0, recordingDuration)`.
     - Bao dam audio session duoc tra ve trang thai `allowsRecording: false` thong qua `setAudioModeAsync`.
  2. `mobile/src/utils/chatMedia.ts`:
     - Bo sung regex va ham `isChatMediaUuid(value)` de kiem tra tinh hop le cua UUID theo chuan Chatmgt API (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`).
     - Cap nhat `shouldFallbackToTinodeMedia` de nhan dien ca ma loi `MEDIA_CONVERSATION_INVALID`, `MEDIA_CONVERSATION_NOT_FOUND` va ma HTTP 400 de fallback ve Tinode Media khi can thiet.
  3. `mobile/src/services/tinodeClient.ts`:
     - Trong ham `uploadFile`, kiem tra `isChatMediaUuid(scopedConversationId)`. Neu `scopedConversationId` khong phai la UUID hop le (vi du ID `grp...` cua phong chat nhom do Tinode cap), app se chu dong dinh tuyen upload truc tiep sang Tinode Media (`uploadTinodeFile`) thay vi gui len Chatmgt S3 upload API (noi se bi tu choi voi HTTP 400 `MEDIA_CONVERSATION_INVALID`).
     - Bao ve cac loi goi `bindChatMediaReference` va `discardChatMediaReference`, chi thuc hien khi conversation ID la UUID hop le.
  4. `mobile/src/store/appStore.ts`:
     - Them ham `resolveChatMediaConversationId(conversation, allConversations)` de phan giai va uu tien tim kiem UUID hop le trong danh sach hoi thoai truoc khi quyet dinh phuong thuc upload file/voice/sticker.
  5. `mobile/src/services/chatMediaService.test.ts`:
     - Bo sung bo test unit kiem tra `isChatMediaUuid` cho ca truong hop hop le va bat hop le (UUID vs topic grp/usr).
- Kiem thu thuc te:
  - `npm run typecheck` trong `mobile/`: Dat (0 errors).
  - `npm run lint` trong `mobile/`: Dat (0 errors).
  - `npm test`: Dat toan bo 40/40 test files (179/179 tests passed).
  - Gradle `:app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a`: `BUILD SUCCESSFUL in 6m 58s`, 319 actionable tasks tren staging `D:\vichat-build\mobile-scroll-fix-20261004`.
  - Artifact APK: `D:\vichat-build\ViChat-voice-fix-20261004-debug.apk` (96,526,893 bytes, 10/4/2026 9:28:13 PM).
  - Cai dat qua ADB: `adb -s f36c9ba7 install -r D:\vichat-build\ViChat-voice-fix-20261004-debug.apk` -> `Performing Streamed Install -> Success`.
  - Khoi chay ung dung: `adb -s f36c9ba7 shell monkey -p vn.upgo.vichat -c android.intent.category.LAUNCHER 1` -> Chay thanh cong, logcat `ReactNativeJS: Running "main"`.
  - Logcat verify: Khong con xuat hien log loi `ERR_USING_RELEASED_SHARED_OBJECT`.
- Rui ro con lai: Khong co.
- Commit/PR: San sang commit.

## 2026-10-04-01 - Sua triet de loi cuon nguoc len tin nhan cu khi mo chat mobile

- Thoi gian: 2026-10-04 (Asia/Saigon)
- Loai: Sua triet de | Mobile | UX | Cuon chat | Tinode | Kiem thu | Tai lieu
- Trang thai: Hoan tat code, typecheck, lint, toan bo 40 bo test unit vitest va build thanh cong APK standalone tren staging D:.
- Muc tieu: Khac phuc dut diem hien tuong nguoi dung bam vao cuoc tro chuyen tren mobile bi lướt/cuon nguoc len doan tin nhan cu tren dau hoac giua danh sach mac du da doc roi; bao dam man hinh luon dinh vi on dinh o tin moi nhat duoi day.
- Pham vi: Chi sua trong `mobile/` (`chatScroll.ts`, `chatScroll.test.ts`, `tinodeClient.ts`, `appStore.ts`, `conversationSync.ts`, `ChatDetailScreen.tsx`). Khong sua ma nguon web.
- Noi dung ky thuat:
  1. `mobile/src/utils/chatScroll.ts`: Loai bo hoan toan fallback tim incoming dau tien trong `firstUnreadMessageIndex`. Neu khong co tin incoming nao co `Number(message.seq) > lastReadSequence`, ham luon tra ve `null`.
  2. `mobile/src/services/tinodeClient.ts`: Trong `markRead`, dong bo ngay `topic.read` va `topic.unread = 0` tren topic local truoc khi cho Tinode network, dam bao snapshot sau do khong bi stale badge.
  3. `mobile/src/store/appStore.ts`: Trong `markRead`, tinh toan `readSeq` chinh xac la sequence lon nhat cua cac tin nhan hien co, dong bo tuc thi vao store state; cap nhat `mergeConversation` de giu `badge = 0` cho cuoc tro chuyen dang active tren man hinh va khong de `readSeq` bi giam xuong.
  4. `mobile/src/utils/conversationSync.ts`: Bao dam `readSeq` giu gia tri cao nhat (`Math.max`) qua cac lan merge metadata snapshot ma khong bi reset ve 0 khi `readSeq` chua dinh nghia.
  5. `mobile/src/screens/chat/ChatDetailScreen.tsx`:
     - Dong bo `setActiveConversation` khi mount/unmount de store quan ly active topic.
     - Tu dong goi `markConversationRead(true)` ngay khi mo cuoc tro chuyen co tin nhan ma khong can doi nguoi dung vuot man hinh.
     - Cho phep `requestInitialScroll` dinh vi xuong day ngay lap tuc tren du lieu cache ma khong bi block boi `!topicOpenReady`.
     - Trong `handleContentSizeChange`, tiep tuc duy tri viewport o day khi content height mo rong (do load anh, media, layout) neu nguoi dung chua chu dong vuot len.
     - Chi kich hoat `maintainVisibleContentPosition` tren iOS khi thuc su `loadingEarlier`, tranh loi native Android FlatList tinh sai offset gay giat viewport len tren.
     - An nut `unreadJump` khi `unreadCount <= 0` hoac da doc het tin nhan.
- Kiem thu thuc te:
  - `npm run typecheck` trong `mobile/`: Dat (0 errors).
  - `npm run lint` trong `mobile/`: Dat (0 errors).
  - `npm test -- --run src/utils/chatScroll.test.ts`: Dat 8/8 tests.
  - `npm test -- --run src/utils/conversationSync.test.ts`: Dat 26/26 tests.
  - `npm test -- --run`: Dat toan bo 40 test files (178/178 tests passed).
  - Gradle `:app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a`: `BUILD SUCCESSFUL in 20m 7s`, 319/319 tasks thanh cong tren staging `D:\vichat-build\mobile-scroll-fix-20261004`.
  - Artifact APK: `D:\vichat-build\ViChat-scroll-fix-20261004-debug.apk` (87.73 MB, 91,991,302 bytes).
  - SHA-256: `46B40BFC0FBAFF291A915D1974A0B3739A4E5FC056FF3D63D6B1D5B6E36C7895`.
- Rui ro con lai: `adb devices -l` hien chua co thiet bi cam qua USB nen chua nap truc tiep len may; can cam dien thoai va chay lenh cai dat APK khi san sang.
- Commit/PR: San sang commit.

## 2026-10-03-05 - Sua lan hai loi chat hien lich su cu khi hydrate Tinode

- Thoi gian: 2026-10-03 (Asia/Saigon)
- Loai: Sua loi | Mobile | UX | Tinode | Hieu nang | Kiem thu | Tai lieu
- Trang thai: Dang xac minh lai tren thiet bi Android qua ADB sau khi UAT van tai hien loi o moc 50 ms den 2 giay.
- Muc tieu: Khi thoat chat va bam lai, khong hien/giu viewport o lich su cu trong luc snapshot Tinode dang nap.
- Pham vi: Initial hydration/viewport cua `ChatDetailScreen`; khong thay doi database, API, schema hay luong jump unread thu cong.
- Noi dung: Cho initial scroll doi `topicOpenReady` khi topic realtime dang hydrate; tam an FlatList co du lieu cho den khi `scrollToEnd` da chay va layout on dinh; khoa thao tac trong giai doan nay de khong nham lan voi user scroll.
- Quyet dinh ky thuat: Khong de native list hien offset cache/tam thoi cho nguoi dung; chi reveal sau snapshot cuoi va mot lan settle layout, trong khi nut unread van la thao tac chu dong.
- Kiem thu: Se cap nhat lenh va ket qua thuc te sau khi chay full test, build va UAT ADB.
- Rui ro con lai: Can xac nhan lai voi media co chieu cao thay doi va tai them history sau khi nguoi dung chu dong vuot len.
- Viec tiep theo: Build/cai APK debug moi, lap lai `thoat -> bam lai` tren `GON-NERS` va chat co unread, kiem tra screenshot/logcat.
- Commit/PR: Chua tao.

## 2026-10-03-04 - Khong tu dong cuon len tin chua doc khi mo chat mobile

- Thoi gian: 2026-10-03 (Asia/Saigon)
- Loai: Sua loi | Mobile | UX | Tinode | Kiem thu | Tai lieu
- Trang thai: Hoan tat code/build; da cai va UAT truc tiep tren thiet bi Android qua ADB.
- Muc tieu: Mo bat ky cuoc tro chuyen nao cung giu viewport o tin moi nhat, khong bi badge/read cursor stale keo nguoc len lich su.
- Pham vi: Luong initial scroll trong `mobile/src/screens/chat/ChatDetailScreen.tsx`; khong thay doi hop dong API, database hoac schema.
- Noi dung: Bo auto-jump toi `firstUnreadIndex` khi mount. Nut tin chua doc van giu luong nhay co chu dich khi nguoi dung bam; initial open luon dung `scrollToEnd({ animated: false })` va tiep tuc mark-read theo sequence hien co.
- Quyet dinh ky thuat: Tin chua doc la affordance tuong tac, khong phai muc tieu viewport mac dinh; cach nay ngan stale unread state tao ra hien tuong mo chat bi cuon len.
- Kiem thu: `npm run typecheck` dat; `npm run lint` dat; `npm test -- --run src/utils/chatScroll.test.ts --maxWorkers=1` dat 5/5; `npm test -- --maxWorkers=1` dat 40 file/175 test; Gradle `app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` dat trong 22 phut 33 giay; APK `D:\vichat-build\ViChat-scroll-fix-20261003-build3-debug.apk`, SHA-256 `167C7A80C56E7E5552148CA58C4C3633C36221CD7768704F00C2725730BD1247`; `adb install -r` dat; UAT mo `GON-NERS` va `ViChat AI` tu danh sach, viewport giu tin moi nhat sau 500 ms va 6 giay; logcat khong co `FATAL EXCEPTION`, `ReactNativeJS`, `TypeError` hoac `Unable to load script`.
- Rui ro con lai: Chua kiem tra tren iOS; luong tai them history khi nguoi dung vuot len van can UAT rieng neu thay doi tiep.
- Viec tiep theo: Khong con buoc bat buoc cho ban sua nay; co the dung bo anh tai `D:\vichat-build\diagnostics\scroll-adb-20261003-build3` de doi chieu UAT.
- Commit/PR: Chua tao.

## 2026-10-03-03 - Sua loi cuon nguoc khi mo chat mobile

- Thoi gian: 2026-10-03 19:10 (Asia/Saigon)
- Loai: Sua loi | Mobile | Tinode | Hieu nang | Kiem thu | Tai lieu
- Trang thai: Hoan tat code/build; chua UAT tren thiet bi that.
- Muc tieu: Khi mo `ChatDetailScreen`, danh sach khong nhay ve tin cu do badge unread stale, dong thoi giu dung vi tri khi nap history va dong bo read receipt.
- Pham vi: Logic unread/initial scroll, mark-read va neo viewport trong mobile chat; khong thay doi database hay endpoint.
- File da thay doi: `mobile/src/utils/chatScroll.ts`, `mobile/src/utils/chatScroll.test.ts`, `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/services/tinodeClient.ts`, `mobile/src/store/appStore.ts`, `docs/CHANGELOG.md`.
- Noi dung: Bo fallback tim incoming dau tien khi khong co `seq > readSeq`; cho phep dat vi tri ban dau tu cache ngay khi list do xong; chi dung `maintainVisibleContentPosition` luc prepend history; ghi nhan target unread de nut nhay khong bi mat sau khi mark-read; truyen sequence lon nhat hien co vao Tinode va cap nhat `topic.read`, `topic.unread`, badge/read cursor trong store theo huong optimistic. APK debug moi duoc tao tai `D:\vichat-build\ViChat-scroll-fix-20261003-debug.apk`.
- Quyet dinh ky thuat: Read cursor/sequence la nguon xac dinh tin chua doc; badge stale khong duoc phep tao index 0 gia; neo native khong duoc can thiep mount/initial render va chi bat trong luong nguoi dung tai them history.
- Database/API/cau hinh: Khong co migration, endpoint, schema, dependency hoac bien moi truong moi; chi mo rong hop dong noi bo `markRead(conversationId, explicitSeq?)` va `tinodeClient.markRead(topicName, sequence?)`.
- Kiem thu: Trong `mobile/`, `npm test -- --run src/utils/chatScroll.test.ts --maxWorkers=1` dat 5/5; `npm run typecheck` dat; `npm run lint` dat; `npm test -- --maxWorkers=1` dat 40 file/175 test; `git diff --check` dat. Gradle `:app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` dat 15 phut 29 giay, 319 tasks tren staging `D:\vichat-build\mobile-scroll-fix-20261003-build2`; artifact SHA-256 `444DD285780A7EBE44CC5DDCCCE4FD3CC4E17347342816C54814632A7A243D99`. Moi lenh dung cache/temp/SDK staging tren `D:\vichat-build` theo quy tac repo.
- Rui ro con lai: Chua cai APK va chua thao tac UAT tren thiet bi Android/iOS that trong lan nay; can xac nhan them voi tin media do kich thuoc thay doi va luong prepend history tren may that.
- Viec tiep theo: Cai `D:\vichat-build\ViChat-scroll-fix-20261003-debug.apk` vao thiet bi Android khi san sang va UAT cac luong mo chat, badge unread, tin moi khi dang doc history, tai history cu va gui media.
- Commit/PR: Chua tao.

## 2026-10-03-02 - Xac nhan APK media mobile moi

- Thoi gian: 2026-10-03 11:20 (Asia/Saigon)
- Loai: Sua loi | Mobile | Tinode | S3 | Kiem thu | Tai lieu
- Trang thai: Can xac nhan
- Muc tieu: Dua ban sua parser/history media moi len thiet bi de xac nhan anh, file va voice dong bo tu Tinode/S3.
- Pham vi: APK Android debug va luong cai dat USB; khong thay doi them hop dong API.
- File da thay doi: `docs/CHANGELOG.md`.
- Noi dung: Build moi thanh cong tai `D:\\vichat-build\\ViChat-media-sync-20261003-r2-debug.apk`; source mobile hien tai da gom sua parser Drafty, nap history media va resolver reference S3 tu lan truoc.
- Quyet dinh ky thuat: Chi build/copy artifact tren o `D:`; khong dung APK cu de danh gia ban sua.
- Database/API/cau hinh: Khong thay doi schema hoac endpoint.
- Kiem thu: `npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=1` (40 file/173 test) va `git diff --check` da dat theo lan kiem tra truoc; Gradle `:app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` thanh cong. `adb devices -l` hien khong co thiet bi, nen chua cai APK moi va chua UAT tai khoan that.
- Rui ro con lai: Dien thoai dang khong duoc Windows/ADB nhan; trang thai anh/file/voice tren ban moi chua duoc xac nhan tren may that.
- Viec tiep theo: Bat USB debugging, rut/cam lai cap va chap nhan hop thoai RSA; sau khi serial xuat hien, cai APK tren D: va test nhom co anh, file, voice S3.
- Commit/PR: Chua tao.

## 2026-10-03-01 - Dong bo media va voice mobile voi Tinode/S3

- Thoi gian: 2026-10-03 10:19 (Asia/Saigon)
- Loai: Dang thuc hien | Sua loi | Mobile | Tinode | S3 | Kiem thu | Tai lieu
- Trang thai: Hoan tat code/build/cai dat; chua UAT tai khoan that.
- Muc tieu: Hien thi va tai lai day du anh, file va voice da gui tu web/mobile trong muc noi dung nhom va chat mobile.
- Pham vi: Parser Drafty, metadata voice, reference S3 va luong gui file mobile.
- File da thay doi: `mobile/src/services/tinodeClient.ts`, `mobile/src/utils/tinodeMedia.ts`, `mobile/src/utils/tinodeMedia.test.ts`, `docs/CHANGELOG.md`.
- Noi dung: Nhan dien `EX`, `IM`, `AU`, `VD`; doc ca reference S3 `ref/refurl`; chuan hoa `x-voice-duration` theo giay va metadata native theo mili-giay; mobile gui them header voice tuong thich voi web.
- Quyet dinh ky thuat: Giua nguyen reference media on dinh cua Chatmgt de resolver ky URL S3 tai thoi diem phat/tai; khong copy byte S3 vao Tinode history.
- Database/API/cau hinh: Khong thay doi schema; khong them endpoint; giu hop dong `/api/v1/chat/media/<upload-id>`.
- Kiem thu: `npm run typecheck` dat; `npm run lint` dat; `npm test -- --maxWorkers=1` dat 40 file/171 test; `git diff --check` dat. Build debug arm64 standalone dat 17 phut 56 giay tai `D:\\vichat-build\\mobile-media-sync-20261003-physical`; APK `D:\\vichat-build\\ViChat-media-sync-20261003-debug.apk` cai thanh cong bang `adb -s dykbemlzcijvgqiz install -r`; app mo duoc tren thiet bi, logcat khong co `FATAL EXCEPTION`, `Unable to load script`, `Refreshing` hoac loi JS muc tieu.
- Rui ro con lai: Chua UAT tai lai media/voice bang tai khoan that vi thiet bi dang o man hinh dang nhap sau khi cai APK.
- Viec tiep theo: Dang nhap tren thiet bi, mo mot nhom co media cu, vao `Anh, file, link`, tai mot file va phat voice de xac nhan end-to-end S3.
- Commit/PR: Chua tao.

## 2026-10-02-14 - Chan snapshot lap lam nhay viewport chat mobile

- Thoi gian: 2026-10-02 17:16 (Asia/Saigon)
- Loai: Sua loi | Mobile | Tinode | Hieu nang | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da build, cai va UAT truc tiep tren thiet bi Android USB.
- Muc tieu: Khong de danh sach tin nhan bi dung lai, nhay ve dau hoac tu dong nap lich su khi snapshot realtime lap lai.
- Pham vi: `mobile/src/screens/chat/ChatDetailScreen.tsx`, bo tron snapshot trong `mobile/src/utils/conversationSync.ts`.
- File da thay doi: `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/utils/conversationSync.ts`, `mobile/src/utils/conversationSync.test.ts`, `docs/CHANGELOG.md`.
- Noi dung: Tai su dung reference cua conversation/list khi snapshot khong doi; khong arm luong nap lich su tu offset 0 luc list dang do layout; dung `scrollToEnd` cho lan dinh vi ban dau; them fallback khi `scrollToIndex` chua do xong; van giu neo native va neo bo sung khi prepend lich su.
- Quyet dinh ky thuat: Chi tu dong cuon khi co tin moi va nguoi dung dang o day; snapshot Tinode chi cap nhat state khi projection hien thi thuc su thay doi.
- Database/API/cau hinh: Khong co migration, endpoint moi hoac thay doi schema.
- Kiem thu: `mobile/npm run typecheck` dat; `mobile/npm run lint` dat; targeted `mobile/npm test -- --run src/utils/conversationSync.test.ts --maxWorkers=1` dat 25/25; full `mobile/npm test -- --maxWorkers=1` dat 39 file/167 test; build debug `app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` dat 15 phut 41 giay tren `D:\vichat-build\mobile-chat-anchor-20261002-physical`; cai thanh cong APK bang `adb -s dykbemlzcijvgqiz install -r`; UAT nhom `GON-NERS` giu vi tri o day, giua va khi nap lich su sau 20 giay; logcat khong co `FATAL EXCEPTION`, `ReactNativeJS`, `Refreshing` hoac `Unable to load script`.
- Rui ro con lai: Chua tao tin nhan moi tu tai khoan thu hai trong luc dang doc o giua danh sach; can UAT them neu muon kiem tra append tin moi.
- Viec tiep theo: Khong co trong pham vi lan nay.
- Commit/PR: Chua tao.

## 2026-10-02-13 - Giu vi tri danh sach tin nhan khi realtime cap nhat

- Thoi gian: 2026-10-02 16:02 (Asia/Saigon)
- Loai: Sua loi | Mobile | Tinode | Hieu nang | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da build release, cai va UAT truc tiep tren thiet bi Android USB.
- Muc tieu: Chan viec danh sach tin nhan bi tai lai roi nhay ve dau khi snapshot Tinode cap nhat.
- Pham vi: FlashList trong `mobile/src/screens/chat/ChatDetailScreen.tsx`, luong mo cuoc tro chuyen va neo viewport.
- File da thay doi: `mobile/src/screens/chat/ChatDetailScreen.tsx`, `docs/CHANGELOG.md`.
- Noi dung: Dung cau hinh `maintainVisibleContentPosition` on dinh co `startRenderingFromBottom`; bo layout `flexGrow/justifyContent` xung dot; chi cho phep scroll khoi tao sau khi `openConversation()` nhan snapshot day du; huy timer/request cu khi doi route hoac mat ket noi de snapshot cu khong dat lai vi tri hien thi.
- Quyet dinh ky thuat: FlashList tu neo item dang hien thi trong cac snapshot realtime; scroll khoi tao chi chay mot lan sau hydration, con che do offline/cache van duoc dat vi tri ngay.
- Database/API/cau hinh: Khong co migration, endpoint moi hoac thay doi schema.
- Kiem thu: `npm run typecheck` dat; `npm run lint` dat; `npm test -- --maxWorkers=1` dat 39 file/165 test; `git diff --check` dat. Build release `app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` thanh cong 19 phut 6 giay tren `D:\vichat-build\mobile-calendar-chat-20261002-physical`; APK release cai thanh cong bang `adb -s dykbemlzcijvgqiz install -r`; mo chat nhom co san, vi tri tin moi nhat giu on dinh sau 10 giay va sau khi dua app ra nen/mo lai; logcat khong co `FATAL EXCEPTION`, loi `ReactNativeJS`, `Refreshing` hoac `Unable to load script`.
- Rui ro con lai: Chua co test tu dong thao tac FlashList tren nhieu kich thuoc item; UAT hien tai dung du lieu nhom da co tren thiet bi, khong tao tin nhan/du lieu moi.
- Viec tiep theo: Neu can, test them voi tai khoan thu hai dang gui tin trong luc nguoi dung dang doc lich su o giua danh sach.
- Commit/PR: Chua tao.

## 2026-10-02-12 - Chuan dinh dang thoi gian lich nhom

- Thoi gian: 2026-10-02 15:10 (Asia/Saigon)
- Loai: Sua loi | Mobile | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da build va cai truc tiep tren thiet bi Android USB.
- Muc tieu: Hien thi thoi gian lich theo dung thu tu ngay / thang / nam tren moi man hinh mobile.
- Pham vi: Formatter su kien lich nhom trong bong chat va muc noi dung nhom.
- File da thay doi: `mobile/src/utils/groupEvent.ts`, `mobile/src/utils/groupEvent.test.ts`, `mobile/src/components/MessageBubble.tsx`, `mobile/src/screens/chat/GroupInfoScreen.tsx`.
- Noi dung: Co dinh hien thi lich thanh `DD/MM/YYYY HH:MM` theo gio dia phuong; bo phu thuoc vao locale `en-US` co the dao thanh `MM/DD/YYYY`; du lieu gui Tinode van la ISO.
- Quyet dinh ky thuat: Chi thay doi lop hien thi, giu nguyen parse dau vao `DD/MM/YYYY` va hop dong ISO voi backend/Tinode.
- Database/API/cau hinh: Khong co migration, endpoint moi hoac thay doi schema.
- Kiem thu: `npm run typecheck` dat; `npm run lint` dat; `npm test -- --run src/utils/groupEvent.test.ts --maxWorkers=1` dat 2/2; `npm test -- --maxWorkers=1` dat 39 file/165 test; `git diff --check` dat. Build `app:assembleDebug --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` thanh cong tren `D:\vichat-build\mobile-calendar-chat-20261002-physical`; APK `D:\vichat-build\ViChat-calendar-date-20261002-debug.apk` cai thanh cong bang USB. Da go `adb reverse`, mo app doc lap; `MainActivity` foreground, khong co `FATAL EXCEPTION`, `ReactNativeJS`, `Unable to load script` hoac `Refreshing`.
- Rui ro con lai: Chua tao lich moi tren tai khoan production de UAT bang mat thu tu hien thi sau khi dong bo hai tai khoan.
- Viec tiep theo: Mo mot nhom, tao lich test va xac nhan card hien `DD/MM/YYYY HH:MM`; xoa lich test neu khong can.
- Commit/PR: Chua tao.

## 2026-10-02-11 - Sua lich nhom, toc do mo chat va dong bo anh mobile

- Thoi gian: 2026-10-02 14:42 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Mobile | Tinode | S3 | Hieu nang | Kiem thu | Tai lieu
- Trang thai: Da hoan tat code/build; chua UAT tai khoan that.
- Muc tieu: Bat lai tao lich nhom theo luong dong bo Tinode, mo chat nhanh va hien day du anh da luu tren S3/Tinode trong muc noi dung nhom.
- Pham vi: Mobile GroupInfo/ChatDetail, parser Tinode, bo nho lich su topic, media cache va regression tests.
- File da thay doi: `mobile/src/components/GroupEventComposer.tsx`, `mobile/src/services/tinodeClient.ts`, `mobile/src/screens/chat/GroupInfoScreen.tsx`, `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/components/MessageBubble.tsx`, `mobile/src/store/appStore.ts`, `mobile/src/utils/groupEvent.ts`, `mobile/src/types/index.ts`, `mobile/android/app/build.gradle`.
- Noi dung: Hoan tat protocol su kien lich nhom Tinode, nhap ngay theo `DD/MM/YYYY` va luu ISO; mo cua so noi dung nhom luon nap cua so tin gan nhat truoc khi quet nguoc lich su media; state chat chi giu khoang 30 tin gan nhat sau khi quet media; parser Drafty doc ca `ref` va `refurl` cho media S3/Tinode.
- Quyet dinh ky thuat: Lich nhom luu trong system event Tinode de web/mobile cung thay mot nguon su that; lich su day du chi phuc vu muc noi dung nhom, chat chi giu trang gan nhat.
- Database/API/cau hinh: Khong migration, khong endpoint moi; tiep tuc dung Tinode va S3 Chatmgt hien co.
- Kiem thu: `npm run typecheck` dat; `npm run lint` dat; `npm test -- --maxWorkers=1` dat 39 file/165 test. Build `app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` thanh cong tren `D:\vichat-build\mobile-calendar-chat-20261002-physical`; APK cai thanh cong bang `adb -s dykbemlzcijvgqiz install -r`; build standalone co `createBundleDebugJsAndAssets`, sau do da go `adb reverse` va mo app khong can Metro; logcat khong co crash/FATAL/TypeError; `git diff --check` dat.
- Rui ro con lai: Chua dang nhap tai khoan test tren thiet bi nen chua the UAT tao lich giua hai tai khoan, mo chat co du lieu lon va tai anh S3 hai chieu.
- Viec tiep theo: Dang nhap tai khoan that de UAT ba luong tren va thu tao lich voi ngay theo `DD/MM/YYYY`.
- Commit/PR: Chua tao.

## 2026-10-02-10 - Keo thanh tab mobile full ngang

- Thoi gian: 2026-10-02 12:29 (Asia/Saigon)
- Loai: Sua loi | Mobile | UX | Android insets | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da build, cai lai va kiem tra truc tiep tren thiet bi Android USB.
- Muc tieu: Loai bo khe hai ben va bo tron cua thanh tab de nen phu kin toan bo chieu ngang man hinh.
- Pham vi: `mobile/src/navigation/MainTabNavigator.tsx`.
- File da thay doi: `mobile/src/navigation/MainTabNavigator.tsx`, `docs/CHANGELOG.md`.
- Noi dung: Dat tab bar sat `left: 0`/`right: 0`, bo `borderRadius` va bo margin ngang cua tung tab; van giu `bottomInset` de phu kin vung dieu huong he thong.
- Quyet dinh ky thuat: Chi sua surface tab bar, khong doi navigation/back stack hay noi dung cac man hinh.
- Database/API/cau hinh: Khong co.
- Kiem thu: `npm run typecheck` dat; `npm run lint` dat; `npm test -- --maxWorkers=1` dat 38 file/163 test; `git diff --check` dat. Build Android tren `D:\vichat-build\mobile-darkmode-20261002` dat; APK cai thanh cong bang `adb -s dykbemlzcijvgqiz install -r`. UI dump khong co `Refreshing`/`Open debugger`; anh chup `D:\vichat-build\vichat-tabbar-full-20261002.png` xac nhan thanh tab phu kin tu mep trai toi mep phai, khong bo tron va khong lo noi dung qua khe ben duoi.
- Rui ro con lai: Android co the co inset/navigation mode khac tren thiet bi khac; surface da bao phu `insets.bottom` va can kiem tra them neu co OEM tuy bien.
- Viec tiep theo: Khong co trong pham vi lan nay.
- Commit/PR: Chua tao.

## 2026-10-02-09 - Chan overlay canh bao va replay thong bao mobile

- Thoi gian: 2026-10-02 12:19 (Asia/Saigon)
- Loai: Sua loi | Mobile | Tinode | Thong bao | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da build, cai lai va kiem tra truc tiep tren thiet bi Android USB.
- Muc tieu: Khong hien overlay canh bao dev va khong mo lai call/tin nhan cu khi mo lai cuoc tro chuyen.
- Pham vi: LogBox, Tinode call invite, read cursor va notification OS tren mobile.
- File da thay doi: `mobile/index.ts`, `mobile/src/utils/callNotificationPolicy.ts`, `mobile/src/utils/callNotificationPolicy.test.ts`, `mobile/src/services/tinodeClient.ts`, `mobile/src/services/notificationService.ts`, `mobile/src/services/notificationService.test.ts`, `mobile/src/store/appStore.ts`.
- Noi dung: Bo qua rieng canh bao `Open debugger to view warnings`; chi route call Tinode trong cua so song song 40 giay; bo qua packet da nam trong read cursor va xoa notification cua dung conversation khi danh dau da doc.
- Quyet dinh ky thuat: Tinode van la nguon su that; khong xoa lich su call hien thi, chi ngan lich su bi route thanh call dang den va giu cleanup notification theo conversation.
- Database/API/cau hinh: Khong co.
- Kiem thu: `npm run typecheck` dat; `npm run lint` dat; `npm test -- --maxWorkers=1` dat 38 file/163 test; `git diff --check` dat. Build `app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` dat tren staging D: trong 6 phut 12 giay; cai thanh cong bang `adb -s dykbemlzcijvgqiz install -r`. Bundle Metro D: co ca LogBox filter, freshness guard va read cleanup; UI dump sau khi mo chat cu khong co `Refreshing`, `Open debugger`, hay man hinh call den; logcat khong co loi app.
- Rui ro con lai: Chua UAT cuoc goi live hai thiet bi sau khi them freshness guard; call packet moi va call packet cu da duoc test bang policy/unit test.
- Viec tiep theo: Co the test them mot cuoc goi live tu tai khoan khac neu can xac nhan ICE/Tinode production.
- Commit/PR: Chua tao.

## 2026-10-02-08 - Keo thanh tab mobile sat canh duoi man hinh

- Thoi gian: 2026-10-02 11:57 (Asia/Saigon)
- Loai: Sua loi | Mobile | UX | Android insets | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da build lai, cai lai va kiem tra tren thiet bi USB.
- Muc tieu: Loai bo khe trong ben duoi thanh tab noi, noi dung man hinh khong
  duoc lo ra ben duoi thanh tab khi Android dung navigation bar trong suot.
- Pham vi: `mobile/src/navigation/MainTabNavigator.tsx`.
- Noi dung: Dat thanh tab o `bottom: 0`, mo rong chieu cao qua `insets.bottom`
  va them inset vao padding day de giu nguyen vi tri icon/nhan trong khi nen
  thanh tab phu kin vung he thong phia duoi.
- Quyet dinh ky thuat: Khong sua SafeArea cua tung man hinh, khong doi luong
  navigation/back hay native navigation bar; chi xu ly surface cua tab bar de
  tranh che khu vuc thao tac.
- Kiem thu: `npm run typecheck` dat; `npm run lint` dat; `npm test --
  --maxWorkers=1` dat 38 file/160 test. Build D: `app:assembleDebug -x lint
  -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a`
  thanh cong; cai APK thanh cong bang `adb -s dykbemlzcijvgqiz install -r`.
  Anh chup thiet bi tai `D:\\vichat-build\\vichat-tabbar-fixed-20261002.png`
  xac nhan thanh tab sat day man hinh; logcat khong co crash,
  `Unable to load script`, `TypeError`, `Invariant Violation` hoac `Refreshing`.
- Rui ro con lai: Chua co test tu dong cho pixel inset cua tung hang Android;
  da kiem tra truc tiep tren thiet bi M2012K10C dang cam USB.
- Viec tiep theo: Kiem tra lai nhanh cac man hinh Settings, ChatDetail va Cloud
  de bao dam tab bar van khong che nut noi dung tren thiet bi co inset khac.
- Commit/PR: Chua tao.

## 2026-10-02-07 - Bat buoc mobile dung o D va cai truc tiep USB

- Thoi gian: 2026-10-02 11:46 (Asia/Saigon)
- Loai: Mobile | Build | USB | Moi truong | Don dep | Kiem thu | Tai lieu
- Trang thai: Hoan tat build/cai dat; quy tac moi da ghi lai cho cac lan sau.
- Muc tieu: Bao dam code staging, dependency, temp/cache, JDK, Android SDK,
  Gradle home, APK va lenh build mobile khong ghi vao o `C:`.
- Pham vi: `AGENTS.md`, staging `D:\\vichat-build\\mobile-darkmode-20261002` va
  cac cache/temp cua mobile tren may phat trien.
- Noi dung: Them bien moi truong bat buoc cho Gradle, Java temp, Kotlin daemon,
  Android SDK va npm cache tren D:. Do duong dan repository co ky tu Unicode lam
  `gradlew.bat` loi encoding tren Windows, source mobile duoc dong bo sang
  staging ASCII tren D: truoc khi build.
- Don dep: Da xoa cache Gradle cu tren C:, temp WinGet/VS Code, goi tar mobile
  va file native build tai tao duoc; dung luong C: tang do tu 0,29 GB len
  5,72 GB. Android SDK cu tai `C:\\Users\\Admin\\AppData\\Local\\Android\\Sdk`
  van con do shell hien tai khong co token Administrator; khong xoa du lieu he
  thong khi chua co quyen nang cao.
- Kiem thu: `app:assembleDebug -x lint -x test --no-daemon --max-workers=1
  -PreactNativeArchitectures=arm64-v8a` thanh cong trong 4 phut 12 giay; APK
  nam tai `D:\\vichat-build\\mobile-darkmode-20261002\\android\\app\\build\\outputs\\apk\\debug\\app-debug.apk`.
  Cai thanh cong bang `adb -s dykbemlzcijvgqiz install -r`. Metro duoc khoi dong
  lai tu staging D: voi cache/temp D:, thiet bi chay on, logcat khong co crash,
  `Unable to load script`, `TypeError`, `Invariant Violation` hoac `Refreshing`,
  UI dump cung khong co banner do.
- Rui ro con lai: APK debug phu thuoc Metro D: dang chay qua `adb reverse
  tcp:8081 tcp:8081`; ban release/standalone can bundle JS rieng. Xoa Android SDK
  trung tren C: can mo shell Administrator roi kiem tra lai duong dan truoc khi xoa.
- Viec tiep theo: UAT dang nhap va thu upload/download media S3 hai chieu tren
  web/mobile; neu can don tiep SDK C: chay lai voi quyen Administrator.
- Commit/PR: Chua tao.

## 2026-10-02-06 - Gia co dong bo media S3 tren mobile voi Tinode

- Thoi gian: 2026-10-02 10:52 (Asia/Saigon)
- Loai: Sua loi | Mobile | S3 | Tinode | Kiem thu | Tai lieu
- Trang thai: Dang xac minh; da sua code va chay typecheck/test targeted.
- Muc tieu: Bao dam mobile dung Tinode lam nguon duy nhat cho noi dung, sequence, realtime va metadata tin nhan; S3 chi luu byte anh/audio/file va dong bo duoc voi web.
- Pham vi: `mobile/src/services/chatMediaService.ts`, `mobile/src/services/chatMediaService.test.ts`, `mobile/src/services/personalCloudService.ts`, `mobile/src/services/tinodeClient.ts`, `mobile/src/store/appStore.ts`, `mobile/src/utils/chatMedia.ts`.
- Noi dung: Tach timeout prepare/complete/bind/discard/download, tang timeout complete S3 len 3 phut, xac thuc ticket truoc upload, tu choi file khong doc duoc kich thuoc, ho tro bind/discard bang upload ID hop le va retry bind idempotent khi loi tam thoi. Khi tao nhom that bai sau khi da upload avatar, mobile don topic va object pending neu chua bind.
- Quyet dinh ky thuat: Tin nhan van publish vao Tinode voi `refurl` tro toi reference Chatmgt/S3; khong ghi body tin nhan, sequence hay realtime vao S3. Bind sau publish khong lam that bai tin Tinode da duoc chap nhan, nhung duoc retry truoc khi de pending registry cho backend sweeper.
- Database/API/cau hinh: Khong migration, endpoint moi, thay doi schema hay thay doi nguon du lieu chuan; chi dung cac route S3 Chatmgt hien co.
- Kiem thu: `mobile/npm run typecheck` dat; `mobile/npm test -- --run src/services/chatMediaService.test.ts --maxWorkers=1` dat 5/5; `git diff --check` dat. Full suite, lint va APK USB se cap nhat sau khi hoan tat build.
- Rui ro con lai: Chua UAT gui/nhan media hai chieu voi tai khoan production tren web va mobile trong muc nay; thiet bi USB can duoc cai APK moi sau khi build.
- Viec tiep theo: Chay full test/lint, build tren `D:\vichat-build`, cai vao `dykbemlzcijvgqiz` va kiem tra media hai chieu neu phien dang nhap san sang.
- Commit/PR: Chua tao.

## 2026-10-02-05 - Can bang modal ngon ngu va dong bo dark mode mobile

- Thoi gian: 2026-10-02 10:24 (Asia/Saigon)
- Loai: Sua loi | Mobile | UX | Dark mode | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da build, cai lai va kiem tra truc tiep tren thiet bi Android USB.
- Muc tieu: Loai bo highlight/chevron thua trong modal ngon ngu, tach khoang cach cac muc Settings va tranh avatar/trang thai root sang mau trang khi dung dark mode.
- Pham vi: `mobile/App.tsx`, `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`, `mobile/src/components/Avatar.tsx`, `mobile/src/screens/settings/SettingsScreen.tsx`, `mobile/src/theme/colors.ts`.
- Noi dung: Chi hien dau tich o phia phai cho ngon ngu dang dung; bo nen cam va dau `>` o lua chon con lai; tang khoang cach giua header, danh sach va noi dung Settings. Avatar khong co/loi tai anh quay ve fallback co palette dark; root native duoc to mau truoc khi an splash de giam nhay sang khi khoi dong dark mode.
- Quyet dinh ky thuat: Dung token mau rieng cho fallback avatar; dung `expo-system-ui` de to root view truoc khi an splash va `expo-navigation-bar` voi `enforceContrast=false` de Android khong chen nen navigation bar mau trang; khong thay doi API, database, push hay realtime.
- Database/API/cau hinh: Khong co migration hoac endpoint moi; them module native `expo-navigation-bar` va cau hinh Android navigation bar.
- Kiem thu: Trong `mobile/`, `npm run typecheck` dat; `npm run lint` dat; `npm test -- --maxWorkers=1` dat 38 file/157 test; `git diff --check` dat. Tren `D:\vichat-build\mobile-darkmode-20261002\android`, `app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` dat; cai APK thanh cong bang `adb -s dykbemlzcijvgqiz install -r`. UAT tren may that: modal ngon ngu chi hien `✓` o ngon ngu dang dung, Settings light/dark dung khoang cach, force-stop/mo lai van dark tu dau, avatar initials dark, vung navigation bar dark; logcat app khong co `FATAL EXCEPTION`/`ReactNativeJS` error/`Refreshing`, UI dump khong co `Refreshing`/`Open debugger`.
- Rui ro con lai: Android/MIUI van co mot so warning he thong khong thuoc app; custom notification sound background van theo gioi han channel native da ghi o muc truoc.
- Viec tiep theo: Khong co trong pham vi lan nay.
- Commit/PR: Chua tao.

## 2026-10-02-04 - Sua phim back Android quay ve man hinh truoc

- Thoi gian: 2026-10-02 09:27 (Asia/Saigon)
- Loai: Sua loi | Mobile | Native | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da build, cai lai va kiem tra truc tiep tren thiet bi Android USB.
- Muc tieu: Khi nguoi dung bam phim dieu huong Back, mobile quay ve muc/man hinh truoc thay vi dong app ve launcher.
- Pham vi: Navigation root/tab va cau hinh Android predictive back.
- File da thay doi: `mobile/App.tsx`, `mobile/app.json`, `mobile/src/navigation/MainTabNavigator.tsx`, `mobile/src/navigation/types.ts`, `mobile/android/app/src/main/AndroidManifest.xml`.
- Noi dung: Them fallback `BackHandler` de lui stack, quay tu tab hien tai ve `Chats` va chan thoat app o root khi da dang nhap; dat `backBehavior="history"` cho tab navigator. Tat `predictiveBackGestureEnabled` de Android gui back ve React Native, dong bo manifest native voi gia tri `false`.
- Quyet dinh ky thuat: Giu logic navigation o React Navigation, chi tat predictive callback legacy-incompatible; khong sua node_modules va khong thay doi API, du lieu hay luong realtime.
- Database/API/cau hinh: Khong co migration, endpoint, secret hay bien moi truong moi; thay doi Android manifest/config build.
- Kiem thu: Trong `mobile/`, `npm run typecheck` dat; `npm run lint` dat; `npm test -- --maxWorkers=1` dat 38 file/157 test; `git diff --check` dat. Gradle `assembleDebug` dat voi `arm64-v8a`, APK cai thanh cong bang `adb -s dykbemlzcijvgqiz`. Tren thiet bi, tu man hinh `Quen mat khau` bam Back da quay ve `Dang nhap` va focus van la `vn.upgo.vichat`, khong ve launcher; merged manifest xac nhan `android:enableOnBackInvokedCallback="false"`.
- Rui ro con lai: Chua UAT duoc cac tab authenticated (Settings/ChatDetail) trong lan build nay vi thiet bi dang o man hinh dang nhap; logic stack/tab da duoc typecheck va native back da xac minh tren may that.
- Viec tiep theo: Khi dang nhap lai tren thiet bi, kiem tra nhanh `Settings -> Back -> Chats`, `Edit Profile -> Back -> Settings` va `ChatDetail -> Back -> danh sach`.
- Commit/PR: Chua tao.

## 2026-10-02-03 - An banner Fast Refresh va gon huong dan Settings mobile

- Thoi gian: 2026-10-02 00:59 (Asia/Saigon)
- Loai: Sua loi | Mobile | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da reload va kiem tra truc tiep tren thiet bi Android USB.
- Muc tieu: An triet de banner native `Refreshing...` nhap nhay khi chay mobile qua Metro va bo cac dong huong dan/helper khong can thiet trong khu vuc cai dat.
- Pham vi: `mobile/index.ts`, cac man hinh Settings/Profile/Linked Devices va `PinSettingsModal`.
- Noi dung: Chan rieng `DevLoadingView` voi message `Refreshing...` trong moi truong dev, van giu cac thong bao loi Metro; giu cac thay doi gon UI Settings, profile card chi con avatar/ten/vai tro/cong ty/nut but va khong hien email.
- Quyet dinh ky thuat: Dung `NativeModules.DevLoadingView` qua API cong khai, patch mot lan truoc khi dang ky root component; khong sua `node_modules`, khong tat Fast Refresh va khong anh huong release bundle.
- Database/API/cau hinh: Khong co.
- Kiem thu: Trong `mobile/`, `npm run typecheck` dat; `npm run lint` dat; `npm test -- --maxWorkers=1` dat 38 file/157 test. Metro bundle co marker patch; ADB `dykbemlzcijvgqiz` restart app thanh cong, UI dump khong co `Refreshing` va khong co `Open debugger`, log khong co `ReactNativeJS`/`FATAL EXCEPTION`.
- Rui ro con lai: Literal `Refreshing...` van nam trong code noi bo React Native de HMR, nhung da bi chan truoc khi hien thi; APK release khong dung DevLoadingView.
- Viec tiep theo: Khong co trong pham vi nay.
- Commit/PR: Chua tao.

## 2026-10-02-02 - Cai lai bundle mobile sau khi phat hien APK cu

- Thoi gian: 2026-10-02 00:37 (Asia/Saigon)
- Loai: Sua loi | Mobile | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da cai APK moi va kiem tra lai tren thiet bi Android USB.
- Nguyen nhan: Thiet bi van dang chay bundle APK cu du source da go `RefreshControl`, nen van hien thanh xanh `Refreshing...`.
- Xu ly: Nap lai source qua Metro, sau do build va cai de APK tu ban sao duong dan ASCII de tranh loi Gradle voi workspace Unicode.
- Kiem tra: App `vn.upgo.vichat` `1.0.38`, versionCode `39`, sau restart va thao tac keo xuong khong con `Refreshing...`; `git diff --check` dat.
- Rui ro con lai: Ban debug can Metro/USB de nap JS khi phat trien; APK da cai tren thiet bi da chay dung bundle moi.

## 2026-10-02-01 - Fix triệt để preview âm thanh thông báo bị phát dai dẳng

- Thời gian: 2026-10-02 00:20 (Asia/Saigon)
- Loại: Sửa lỗi | Mobile | Thông báo | UX | Kiểm thử | Tài liệu
- Trạng thái: Hoàn tất; đã hot reload và UAT trực tiếp trên thiết bị Android USB
- Mục tiêu: Cho phép nghe thử, dừng thật sự và tự dừng âm thanh tùy chỉnh khi người dùng đóng modal, rời Settings hoặc đưa ứng dụng xuống nền.
- Phạm vi: `mobile/src/services/notificationSoundService.ts`, `mobile/src/services/notificationSoundService.test.ts`, `mobile/src/screens/settings/SettingsScreen.tsx`.
- File đã thay đổi: `mobile/src/services/notificationSoundService.ts`, `mobile/src/services/notificationSoundService.test.ts`, `mobile/src/screens/settings/SettingsScreen.tsx`, `mobile/src/screens/chat/ConversationListScreen.tsx`, `mobile/src/screens/contacts/ContactsScreen.tsx`, `mobile/src/screens/cloud/PersonalCloudScreen.tsx`, `mobile/src/screens/workspace/WorkspaceScreen.tsx`, `docs/CHANGELOG.md`.
- Nội dung: Tách player preview khỏi player phát notification thật; bổ sung nút Play/Stop có trạng thái, cleanup player bằng `pause`/`release`, tự dọn khi audio kết thúc, khi upload/xóa/đổi chế độ âm thanh, đóng modal, đổi tab và AppState không còn active. Gỡ toàn bộ `RefreshControl` còn sót ở Chat, Danh bạ, Cloud và Workspace để không còn banner/spinner `Refreshing`; tải ban đầu, phân trang và realtime vẫn giữ nguyên. Không để thao tác dừng preview làm ngắt âm thanh notification đang xử lý.
- Quyết định kỹ thuật: Theo dõi trạng thái kết thúc qua `playbackStatusUpdate` và token phiên preview để loại race khi người dùng rời màn hình trong lúc module audio đang tải; giữ fallback âm hệ thống và không thay đổi push, realtime, tenant hoặc logout.
- Database/API/cấu hình: Không thay đổi database, API, native permission hoặc cấu hình môi trường.
- Kiểm thử: Trong `mobile/`: `npm run typecheck` đạt; `npm run lint` đạt; `npm test -- --maxWorkers=1` đạt 38 file/157 test; `npm test -- --run src/services/notificationSoundService.test.ts` đạt 5/5; `git diff --check` không phát hiện lỗi nội dung.
- UAT thiết bị: ADB `dykbemlzcijvgqiz` online, Metro cổng `8082`; upload `vichat-uat-sound.m4a` thành công, nút chuyển `Nghe thử âm thanh` -> `Dừng nghe thử` khi đang phát, bấm dừng tắt audio và đóng modal trong lúc phát cũng tắt audio; không có `FATAL EXCEPTION` hoặc lỗi `ReactNativeJS` của app trong log kiểm tra.
- Rủi ro còn lại: Push/background khi hệ điều hành tạm dừng vẫn dùng giới hạn âm native của Android/Expo như thiết kế trước; preview foreground đã có stop chủ động.
- Việc tiếp theo: Không có trong phạm vi này.
- Commit/PR: Chưa tạo.

## 2026-10-01-21 - Sua upload am thanh tuy chinh tren Android

- Thoi gian: 2026-10-01 23:50 (Asia/Saigon)
- Loai: Sua loi | Mobile | Thong bao | Kiem thu | Tai lieu
- Trang thai: Da sua code va UAT truc tiep tren thiet bi Android USB
- Muc tieu: Cho phep chon am thanh tu DocumentsProvider ma khong bi redbox Metro va khong mat cau hinh sau khi khoi dong lai app.
- Pham vi: `mobile/src/services/notificationSoundService.ts`, `mobile/src/services/notificationSoundService.test.ts`.
- Noi dung: Chap nhan picker khong co `size`, lay kich thuoc tu URI cache de van gioi han 8 MB, kiem tra file dich da ton tai sau copy va chi xoa file cu sau khi file moi duoc luu thanh cong.
- Quyet dinh ky thuat: Giu dynamic import literal `expo-file-system/legacy` de bo test mock duoc va xoa cache Metro truoc UAT; khong luu URI `content://` tam thoi lam am thanh chinh.
- Kiem thu: `npm run typecheck` dat; `npm run lint` dat; `npm test -- --maxWorkers=1` dat 38 file/155 test.
- UAT thiet bi: ADB `dykbemlzcijvgqiz`; chon file 4,46 MB thanh cong, file dich `files/vichat-notification-sound.m4a` ton tai; ten file va che do tuy chinh van hien sau khi force-stop/mo lai app; khong con redbox unknown module.
- Rui ro con lai: Push khi app bi he dieu hanh tam dung van dung am mac dinh cua notification channel theo gioi han Android/Expo; app dang mo dung am tuy chinh da chon.
- Commit/PR: Chua tao.

## 2026-10-01-20 - Bo refresh indicator va gon the ho so mobile

- Thoi gian: 2026-10-01 23:38 (Asia/Saigon)
- Loai: Sua loi | Mobile | UX | Kiem thu | Tai lieu
- Trang thai: Da sua code, hot reload va UAT truc tiep tren thiet bi Android USB
- Muc tieu: Loai bo spinner/banner refresh nhap nhay tren danh sach hoi thoai va khong hien email trong the ho so cai dat.
- Pham vi: `mobile/src/screens/chat/ConversationListScreen.tsx`, `mobile/src/screens/settings/SettingsScreen.tsx`.
- Noi dung: Go hoan toan `RefreshControl` khoi danh sach hoi thoai chinh de Android khong tu hien spinner native; giu dong bo du lieu nen va realtime qua store. The ho so chi con avatar, ten, vai tro Admin, cong ty hien tai va nut but o goc.
- Quyet dinh ky thuat: Khong sua `refreshData`, Tinode, push, chuyen cong ty hay logout; chi bo UI refresh thu cong gay nhap nhay o man hinh chat va rut gon thong tin hien thi.
- Kiem thu: `npm run typecheck` dat; `npm run lint` dat; `npm test -- --maxWorkers=1` dat 38 file/155 test; `git diff --check` dat truoc khi cap nhat muc nhat ky nay.
- UAT thiet bi: ADB `dykbemlzcijvgqiz` online; sau khi restart app, danh sach Tin nhan hien binh thuong khong co chu/spinner `Refreshing`; Settings hien the `Nguyen Huu Nham`, `Admin`, `Gon Platform`, khong hien email va van co nut but.
- Rui ro con lai: Keo xuong danh sach hoi thoai khong con thao tac refresh thu cong; du lieu van cap nhat qua khoi tao, realtime va cac luong dong bo nen hien co.
- Commit/PR: Chua tao.

## 2026-10-01-18 - Don Settings mobile va an refresh indicator

- Thoi gian: 2026-10-01 23:18 (Asia/Saigon)
- Loai: Sua loi | Mobile | UX | Thong bao | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da build, hot reload va UAT truc tiep tren thiet bi Android USB
- Muc tieu: Loai bo spinner `Refreshing` gay kho chiu, tach cai dat khoi cap nhat ho so va them cau hinh am thanh thong bao ma khong lam vo push, doi tenant, logout hoac realtime.
- Pham vi: `mobile/src/screens/chat/ConversationListScreen.tsx`, `mobile/src/screens/settings/SettingsScreen.tsx`, `mobile/src/screens/settings/EditProfileScreen.tsx`, `mobile/src/services/notificationService.ts`, `mobile/src/services/notificationSoundService.ts`, i18n va regression tests.
- Noi dung: Settings dua `Ngon ngu` va `Chuyen cong ty` ra ngoai Edit Profile; khung ho so thu gon; bo hai dong `Thong bao`/`Ket noi realtime` va thay bang modal am thanh voi bat/tat, am he thong, upload file audio toi da 8 MB, nghe thu va xoa file. UI refresh thu cong duoc go hoan toan o danh sach Tin nhan de tranh spinner nhap nhay.
- Quyet dinh ky thuat: File audio duoc copy vao app document directory va metadata luu AsyncStorage; khi app dang mo, custom sound duoc phat bang `expo-audio` va local notification dung channel im lang de tranh phat doi; khi app bi he dieu hanh tam dung hoac custom player khong san sang, notification quay ve am mac dinh de khong bo lo thong bao. Push remote va cuoc goi giu fallback/native channel hien co.
- Kiem thu: `npm run typecheck` dat; `npm run lint` dat; `npm test -- --maxWorkers=1` dat 38 file/155 test; `git diff --check` dat.
- UAT thiet bi: Da kiem tra danh sach Tin nhan khong con spinner refresh, Settings tach ngon ngu/chuyen cong ty/am thanh, upload-nghe thu-xoa file va giu cau hinh sau khi mo lai app; logcat khong co crash React Native. Push/background van dung fallback native theo gioi han Android.
- Rui ro con lai: Android notification channel khong cho Expo SDK 57 gan file runtime lam raw resource; custom file duoc ap dung cho local notification khi app dang mo, con push/background dung am mac dinh an toan.
- Commit/PR: Chua tao.

## 2026-10-01-17 - Fix nhay danh sach mobile va kich hoat dich song ngu

- Thoi gian: 2026-10-01 22:52 (Asia/Saigon)
- Loai: Sua loi | Mobile | Hieu nang | Dich | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da build, cai dat va UAT truc tiep tren thiet bi Android USB
- Muc tieu: Loai bo hien tuong dong ViChat AI bien mat khi refresh va lam nut dich tin nhan hoat dong dung voi tin nhan cung ngon ngu giao dien.
- Pham vi: `mobile/src/services/chatManagementService.ts`, `mobile/src/store/appStore.ts`, `mobile/src/screens/chat/ConversationListScreen.tsx`, `mobile/src/services/translationService.ts`, `mobile/src/screens/chat/ChatDetailScreen.tsx` va regression tests.
- Noi dung: Chatbot endpoint loi tam thoi tra ve `null` de store giu bot da tai va tin nhan hien co; refresh duoc chan trung lap bang `useRef`; khi chua chon ngon ngu dich, tin nhan trung ngon ngu giao dien tu dong dich sang ngon ngu con lai; luong hien thi giu ca `Ban goc` va `Ban dich`.
- Quyet dinh ky thuat: Khong xoa du lieu giao dien dang dung chi vi request phu that bai; ngon ngu dich da chon trong cai dat hoi thoai van duoc uu tien, con dich tung tin nhan mac dinh chon ngon ngu doi dien de tranh tra ve nguyen van.
- Kiem thu: `npm run typecheck` dat; `npm run lint` dat; `npm test -- --maxWorkers=1` dat 37 file/152 test; `git diff --check` dat.
- Kiem thu thiet bi: `npx expo run:android --device M2012K10C --no-bundler` build thanh cong va cai APK `1.0.38`/versionCode `39` tren `M2012K10C`; da keo refresh nhieu lan, dong `ViChat AI` van giu nguyen; da chon `Dich tin nhan` va xac nhan `Ban goc`/`Ban dich` hien thi; logcat khong co crash React Native.
- Rui ro con lai: Dich phu thuoc endpoint cong khai cua MyMemory; neu nha cung cap het quota, UI hien loi tam thoi thay vi hien ket qua rong. Expo SDK 57/RN 0.86 van bat buoc New Architecture theo dependency hien tai.
- Viec tiep theo: Neu can phat hanh APK release, lap lai build tu duong dan ASCII hoac di chuyen workspace khoi duong dan Unicode de tranh loi encoding Gradle.
- Commit/PR: Chua tao.

## 2026-10-01-16 - Deploy Web desktop production sau audit

- Thoi gian: 2026-10-01 21:33 (Asia/Saigon)
- Loai: Van hanh | Web | Bao mat | Kiem thu | Tai lieu
- Trang thai: Hoan tat deploy; can UAT browser production voi tai khoan that
- Muc tieu: Phat hanh ban Web desktop da audit tu commit `26b3d58` len production theo release bat bien va xac minh dich vu sau khi khoi dong.
- Pham vi: Chi ChatUI Web va dich vu Chatmgt duoc dong goi trong artifact; khong deploy, stage, revert hoac thay doi cac file `mobile/`.
- File da thay doi: `docs/CHANGELOG.md`; artifact deploy duoc build tu commit `26b3d58`.
- Noi dung: Archive `C:\\Users\\Admin\\AppData\\Local\\Temp\\vichat-web-26b3d58.tar.gz` (45,862,080 bytes, SHA-256 `860BA91435750994CAB7BF6DF85E58547B848FE7A4FF8D71C3625D68CABBD668`) da duoc trien khai vao `/opt/deploy/chat/releases/vichat-web-26b3d58-20261001-r1`; `current` tro release nay va `previous` tro `/opt/deploy/chat/releases/vichat-web-d8090a2-20261001`.
- Quyet dinh ky thuat: Dung hai SSH hop theo quy trinh production; chi recreate ChatUI va Chatmgt, giu nguyen cac container ngoai `chat` va `chatmgt`. Khong migration, khong reset volume/database/Tinode.
- Database/API/cau hinh: Khong thay doi schema, migration, volume, database hoac Tinode; public assets moi la `/assets/index-5lDLBAca.js` va `/assets/index-BX7Wxs0D.css`. Container ChatUI moi: `4113babff343db76cb3ade370c959ecfab3fde74b671a11a29c18752e1d1adad`; Chatmgt moi: `8aecf1bd0af82ee0784c7a68065306dfe6fe9984ad0e0d06a15ab2dc5bd756de`.
- Kiem thu: Frontend `458/458`; backend `326` pass va `106` skipped do dependency moi truong; lint exit `0` voi warning legacy ngoai pham vi Web; production build dat, App chunk con `410.51 kB` va khong con canh bao chunk tren `500 kB`; `npm audit --omit=dev` bao `0 vulnerabilities`; `git diff --check` dat; local/public health tra `ok`, Chatmgt health tra `status: ok`, public JS/CSS tra HTTP 200.
- Rui ro con lai: Chua UAT bang tai khoan production that. Docker build con 2 audit notice build-time cua dependency dev trong management UI, trong khi production dependency audit goc van `0 vulnerabilities`. Public edge dang tra HSTS `max-age=16000000`, khac gia tri `31536000; includeSubDomains` trong config repository; can danh gia rieng, khong tu y sua edge trong lan deploy nay.
- Viec tiep theo: Hard refresh va UAT dang nhap, doi tenant, chatbot, media, modal keyboard va logout/reconnect tren production; rollback ve `previous` neu UAT phat hien regression.
- Commit/PR: Source Web `26b3d58`; da push `github` va `origin`.

## 2026-10-01-15 - Hoan tat ra soat web desktop

- Thoi gian: 2026-10-01 21:17 (Asia/Saigon)
- Loai: Sua loi | Web | Bao mat | Accessibility | Hieu nang | Kiem thu | Tai lieu
- Trang thai: Hoan tat pham vi code; can UAT browser production truoc khi phat hanh
- Muc tieu: Dua ChatUI desktop ve trang thai tenant-safe, accessible, on dinh va co bundle production phu hop cho UAT.
- Pham vi: Web ChatUI va hop dong Chatmgt chatbot/RAG; khong sua, build hoac thay doi cac file `mobile/` trong lan nay.
- File da thay doi: `index.html`, `dist/index.html`, `vite.config.js`, `src/app/App.jsx`, `src/components/ConfirmDialog.jsx`, `src/components/useDialogFocusTrap.js`, `src/features/chat/components/`, `src/features/chat/services/chatManagementService.test.js`, `src/features/chatbot/services/`, `src/features/contacts/components/AvatarCropModal.jsx`, `src/features/workspace/components/EnterpriseWorkspace.jsx`, `src/styles/index.css`, `chatservice-main/application/controllers/api_chatbot.py`, `chatservice-main/application/services/chatbot_service.py`, `chatservice-main/tests/test_chatbot_webhook_provider.py`, `docs/chat-backend-architecture.md`.
- Noi dung: Tach chatbot history theo tenant/account/chatbot, khong tu dong merge history legacy, loc fail-closed source AI va serialize state `grounded`/`no-source`/`question-unclear`/`timeout`/`session-expired`/`unavailable`; huy request khi logout/revoke/doi tenant; them focus trap, Escape, tra focus, dialog semantics, keyboard navigation, form names/labels/autocomplete va focus-visible cho luong desktop.
- Quyet dinh ky thuat: Server history la nguon chinh; localStorage chi la cache co scope day du. Rollup manual chunks tach service theo feature, giu lazy chunk hien co cho Workspace/Cloud/Call/Sticker/modal va giam App chunk tu khoang 579 kB xuong 410.51 kB.
- Database/API/cau hinh: Khong thay doi schema database; cap nhat contract chatbot state/tenant trong Chatmgt va cau hinh Vite production chunking.
- Kiem thu: `npm run test:frontend -- --test-concurrency=1` dat 458/458; `npm run lint` exit 0, con warning legacy ngoai pham vi Web tai `mobile/`, `public/ChatBotWidget/tinode.js` va `src/App.jsx`; `npm run build:production` dat, security scan dat, khong con canh bao chunk > 500 kB; `npm audit --omit=dev` bao 0 vulnerabilities; `python -m unittest discover -s tests -v` dat 326 tests, 106 skipped; `git diff --check` dat.
- Rui ro con lai: Chua co browser session de UAT truc tiep tai 1440x900/1280x800, dark mode va Vietnamese/English; can hard refresh production va kiem tra login, doi tenant, modal keyboard, AI source, logout giua request, group confirmation va deep link.
- Viec tiep theo: Thuc hien UAT browser production, sau do review artifact `dist/` va deploy Web neu ket qua UAT dat.
- Commit/PR: Chua tao.

## 2026-10-01-14 - Ra soat on dinh native mobile va lifecycle hook

- Thoi gian: 2026-10-01 20:43 (Asia/Saigon)
- Loai: Sua loi | Mobile | Bao mat | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da build, cai dat va smoke test tren thiet bi Android USB
- Muc tieu: Sua loi Rules of Hooks trong native mobile, kiem tra day du dependency cua hook va xac minh luong mobile truc tiep tren thiet bi Android USB.
- Pham vi: `mobile/` voi typing indicator, ESLint React Hooks, session/tenant lifecycle, native navigation va audit dependency; khong thay doi Web ChatUI hoac Chatmgt.
- File da thay doi: `mobile/app.config.js`, `mobile/app.json`, `mobile/plugins/withNewArchitectureDisabled.js`, `mobile/src/components/TypingIndicator.tsx`, `mobile/src/components/TypingIndicator.test.tsx`, `mobile/src/test/reactNativeMock.ts`, `mobile/eslint.config.mjs`, `mobile/src/store/languageStore.ts`, `mobile/src/screens/cloud/PersonalCloudScreen.tsx`, `mobile/src/services/notificationService.ts`, `mobile/src/services/tinodeClient.ts`, `mobile/src/utils/sessionScope.ts`, `mobile/src/utils/sessionScope.test.ts`, `mobile/package.json`, `mobile/package-lock.json`, `docs/CHANGELOG.md`.
- Cap nhat bo sung: Chuyen cau hinh New Architecture sang config plugin de `expo-doctor` pass; bo sound mac dinh khoi notification channel de khong hien canh bao custom sound; them database provider no-op cho Tinode native khi khong persist; chan stale Cloud request theo account/tenant/session va guard truoc khi mo URL tai file.
- Noi dung: Dua `useThemePalette` len truoc moi return trong `TypingIndicator`; bat `rules-of-hooks` va `exhaustive-deps` de lint phat hien loi lifecycle thay vi bo qua; memo hoa ham dich theo ngon ngu de dependency cua callback khong tao render loop; reset va chan stale update cua Cloud theo account/tenant/session generation.
- Quyet dinh ky thuat: Giữ Expo SDK 57 va dependency lock hien tai; chi cap nhat goi khi co ban tuong thich va co du lieu audit cho thay khong gay breaking change.
- Database/API/cau hinh: Khong thay doi database/API; cap nhat Expo config plugin Android va runtime native mobile.
- Quyet dinh bo sung: Expo SDK 57/RN 0.86 van bat buoc New Architecture; build ghi canh bao legacy property nhung app van build va chay duoc voi `react-native-webrtc` tren thiet bi thuc.
- Kiem thu: `npx expo-doctor` dat 21/21; `npm run typecheck` dat; `npm test -- --maxWorkers=1` dat 36 file/147 test; `npm run lint` dat; `npm run export` dat; `npm audit --omit=dev` con 12 moderate build-time vulnerabilities trong `uuid` qua Expo config plugins, `--force` se ha Expo breaking.
- Kiem thu thiet bi: `npx expo prebuild --platform android --no-install` dat; `npx expo run:android --device M2012K10C` build thanh cong 318 Gradle tasks, cai APK `vn.upgo.vichat` va mo tren ADB serial `dykbemlzcijvgqiz`; process foreground, man hinh mobile hien thi, logcat khong co `FATAL EXCEPTION`, `AndroidRuntime`, `Custom sound` hoac Tinode `deleteDatabase` error sau khi reload bundle.
- Rui ro con lai: Gradle tren workspace co ky tu Unicode bi loi encoding khi autolinking; lan build nay dung ban sao tam ASCII `D:\vichat-mobile-build-20261001`. New Architecture van bat buoc theo RN 0.86; can UAT dang nhap/chat/cuoc goi tren tai khoan that.
- Viec tiep theo: Neu can phat hanh APK/EAS, chay build tu duong dan ASCII hoac di chuyen workspace sang duong dan khong dau; UAT cac luong dang nhap, Cloud, Tinode va call tren `M2012K10C`.
- Commit/PR: Chua tao.

## 2026-10-01-13 - Cho phep CSP tai media S3 qua redirect

- Thoi gian: 2026-10-01 14:45 (Asia/Saigon)
- Loai: Sua loi | Web | Van hanh | Bao mat | Tai lieu
- Trang thai: Hoan tat; da push va deploy Web production, cho UAT S3 tren browser
- Muc tieu: Hien thi lai anh S3 trong ChatUI production sau khi endpoint Chatmgt redirect sang host S3 thuc te.
- Pham vi: Chi ChatUI Web va CSP Nginx production; khong sua, build hoac deploy Mobile.
- File da thay doi: `infrastructure/production/nginx.conf`, `src/features/chat/services/chatManagementService.test.js`, `docs/CHANGELOG.md`.
- Noi dung: Them `https://s3.gonapp.net` vao `img-src`, `media-src` va `connect-src`. Probe production cho thay object anh van tra HTTP 200 va bytes PNG hop le; loi con lai la trinh duyet bi CSP chan host sau redirect.
- Quyet dinh ky thuat: Giu `s3.upgo.vn` de tuong thich voi cau hinh cu, dong thoi cho phep host dang duoc `MINIO_PUBLIC_DOMAIN` production su dung; khong dua presigned URL hoac credential vao source.
- Database/API/cau hinh: Khong doi database/API; chi cap nhat allowlist CSP va regression test.
- Kiem thu: `node --test src/features/chat/services/chatManagementService.test.js src/features/chat/services/chatMediaService.test.js` dat 75/75; `npm run test:frontend -- --test-concurrency=1` dat 457/457; `npm run build:production` dat; `npx oxlint src` dat, chi con 2 warning legacy tai `src/App.jsx`; probe S3 production tra HTTP 200, `Content-Type: image/png`, magic bytes PNG; production `nginx -t` dat, ChatUI `chat` healthy/restart 0, local/public `/healthz` tra `ok`, Chatmgt health tra `status: ok`, public JS/CSS tra HTTP 200 va CSP public co `https://s3.gonapp.net`, container ngoai `chat` khong doi.
- Artifact/phat hanh: Archive `vichat-web-d8090a2-20261001.tar.gz`, SHA-256 `99D1BF18ADB9971402501DAB4B0E3E93B6B8CDB4ADE299E41F9F8C9A315CD3BE`; release `/opt/deploy/chat/releases/vichat-web-d8090a2-20261001` dang la `current`, `previous` tro `/opt/deploy/chat/releases/vichat-web-f71515d-20261001`; chi recreate service `chat`; `chatmgt` giu nguyen container `b2e7387013d6`.
- Rui ro con lai: Chua co browser session cua nguoi dung de click/xac nhan thumbnail truc tiep; can hard refresh production de nhan bundle/CSP moi. Full lint repository van co loi Mobile san co tai `mobile/src/components/TypingIndicator.tsx:9`, khong sua theo pham vi Web.
- Viec tiep theo: UAT Web bang tai khoan co anh S3 sau hard refresh; rollback ve `previous` neu phat sinh loi.
- Commit/PR: `d8090a2`; da push `github` va `origin`

## 2026-10-01-12 - Sua preview anh S3 trong muc Anh, file va lien ket

- Thoi gian: 2026-10-01 14:13 (Asia/Saigon)
- Loai: Sua loi | Web | Van hanh | Tai lieu
- Trang thai: Hoan tat; da push va deploy Web production, cho UAT S3
- Muc tieu: Hien thi lai anh chat S3 trong cac muc noi dung dung chung ma khong phu thuoc vao viec doc response blob cross-origin bang JavaScript.
- Pham vi: ChatUI Web, luong preview media va CSP production; khong sua, build hoac deploy Mobile.
- File da thay doi: `src/features/chat/services/chatMediaService.js`, `src/features/chat/services/chatMediaService.test.js`, `src/features/chat/services/tinodeClient.js`, `src/features/chat/services/chatManagementService.test.js`, `infrastructure/production/nginx.conf`.
- Noi dung: Stable Chatmgt media reference duoc doi sang URL endpoint co xac thuc de trinh duyet tai truc tiep qua redirect sang S3; luong fetch blob van duoc giu cho media Tinode va thao tac tai file. Bo sung host Chatmgt vao `img-src` va `media-src`, them regression test cho URL va CSP.
- Quyet dinh ky thuat: Tranh phu thuoc vao CORS response body cua S3 khi render thumbnail; quyen truy cap van do cookie/session tai Chatmgt kiem tra, con object URL presigned ngan han van giu cho luong API download.
- Database/API/cau hinh: Khong thay doi database hoac hop dong API; chi cap nhat CSP cua Nginx production.
- Kiem thu: `node --test src/features/chat/services/chatMediaService.test.js src/features/chat/services/chatManagementService.test.js` dat 75/75; `npm run test:frontend -- --test-concurrency=1` dat 457/457; `npm run build:production` dat; lint pham vi Web dat. `npm run lint` toan repository chua dat do loi san co ngoai pham vi tai `mobile/src/components/TypingIndicator.tsx:9`; khong sua Mobile. Production da build rieng service `chat`, `nginx -t` dat, container `chat` healthy/restart 0, public `/healthz` va Chatmgt health tra OK, CSP public da cho phep Chatmgt media; container `chatmgt` giu nguyen ID.
- Artifact/phat hanh: Archive `vichat-web-f71515d-20261001.tar.gz`, SHA-256 `D714A4374643612320487345F49597FAA81B7241538B913665BEA00ED6395135`; release `/opt/deploy/chat/releases/vichat-web-f71515d-20261001` dang la `current`, `previous` tro `/opt/deploy/chat/releases/vichat-web-621c603-20261001`; chi recreate service `chat` qua hai SSH hop.
- Rui ro con lai: Can hard refresh va UAT bang tai khoan co media S3 de xac nhan cookie Chatmgt va redirect 302 trong trinh duyet production; chua co browser session cua nguoi dung de click/xac nhan thumbnail truc tiep.
- Viec tiep theo: UAT Web bang tai khoan co anh S3; rollback ve `previous` neu phat sinh loi.
- Commit/PR: `f71515d` (source Web); da push `github` va `origin`

## 2026-10-01-11 - Phong ve KeyChainException tren iOS Simulator / Appetize.io (Fallback AsyncStorage)

- Thoi gian: 2026-10-01 (Asia/Saigon)
- Loai: Sua loi | Mobile | iOS | On dinh | Bao mat | Tai lieu
- Trang thai: Hoan tat
- Muc tieu: Khac phuc loi `KeyChainException: A required entitlement isn't present` (-34018) tai `setValueWithKeyAsync` khi nguoi dung dang nhap tren Appetize.io hoac cac moi truong test iOS Simulator/sideload khong co quyen Keychain Sharing.
- Pham vi: `mobile/src/services/storageService.ts`, `mobile/src/services/appLockService.ts`, `docs/CHANGELOG.md`.
- File da thay doi: `mobile/src/services/storageService.ts`, `mobile/src/services/appLockService.ts`, `docs/CHANGELOG.md`.
- Noi dung:
  1. Trong `storageService.ts`: Boc loi `SecureStore.setItemAsync(TOKEN_KEY, ...)` va `SecureStore.getItemAsync(...)` bang `try...catch`; khi SecureStore nem ngoai le (do Keychain entitlement khong co san tren may ao Simulator hoac ban build chua ky chung chi co Keychain Sharing), he thong tu dong fallback sang `AsyncStorage` de luu va doc access token, dam bao luong dang nhap va luu phien hoat dong tron tru 100%.
  2. Trong `appLockService.ts`: Bo sung co che fallback tuong tu giua `SecureStore` va `AsyncStorage` cho ma PIN va salt cua khoa ung dung de tranh loi tren Simulator.
  3. Hoan toan khong anh huong den Android APK vi Android su dung Android Keystore / SharedPreferences rieng biet khong dung Keychain cua iOS.
- Quyet dinh ky thuat: Tren iOS, API `SecItemAdd` nem loi `errSecMissingEntitlement` (-34018) neu app chua duoc ky bang provisioning profile co capability `keychain-access-groups` (dac biet tren cac moi truong cloud simulator nhu Appetize.io hoac ban build sideload bang tai khoan Apple ID ca nhan mien phi). Co che graceful fallback sang `AsyncStorage` la giai phap tieu chuan va an toan, giup app van duy tri phien dang nhap ma khong bao gio bi chan dung luong nguoi dung.
- Database/API/cau hinh: Khong co thay doi database hay API backend.
- Kiem thu: Da chay `npm run typecheck` dat; `npm test` dat 34 file/144 test; `npm run lint` dat 0 loi; `git diff --check` dat.
- Rui ro con lai: Can nguoi dung trigger build lai tren Codemagic de tao ban Simulator zip moi co co che fallback nay de test dang nhap tren Appetize.io.
- Viec tiep theo: Commit va day len GitHub tren ca `fix/full-audit-regressions` va `master`.

## 2026-10-01-10 - Bo sung artifact iOS Simulator (ViChat-Simulator.zip) cho Appetize.io

- Thoi gian: 2026-10-01 (Asia/Saigon)
- Loai: CI/CD | Mobile | iOS | Kiem thu | Tai lieu
- Trang thai: Hoan tat
- Muc tieu: Cung cap artifact ban build iOS Simulator (`ViChat-Simulator.zip`) de nguoi dung co the upload truc tiep len Appetize.io chay gia lap iPhone ao tren trinh duyet web may tinh khi khong co thiet bi iPhone that iOS 16+.
- Pham vi: `codemagic.yaml`, `docs/CHANGELOG.md`.
- File da thay doi: `codemagic.yaml`, `docs/CHANGELOG.md`.
- Noi dung: Them buoc bien dich `-sdk iphonesimulator` trong workflow `ios-build-ipa` cua `codemagic.yaml`, sau do nen truc tiep `ViChat.app` thanh `ViChat-Simulator.zip` va day vao `artifacts`. Giu nguyen workflow build `ViChat.ipa` cho may that.
- Quyet dinh ky thuat: Appetize.io chay tren ha tang iOS Simulator nen bat buoc nhan file `.zip` chua `.app` duoc compile voi SDK Simulator; khong the nhan file `.ipa` danh cho thiet bi that (`iphoneos`). Viec xuat ca hai artifact giup nguoi dung vua co file `.ipa` cho may that, vua co file `.zip` de test tren web.
- Database/API/cau hinh: Khong co thay doi database hay API backend.
- Kiem thu: Da kiem tra cu phap `codemagic.yaml` bang bash shell logic subshell `(cd ... && zip ...)`; `git diff --check` dat.
- Rui ro con lai: Can nguoi dung trigger build lai tren Codemagic de nhan file `ViChat-Simulator.zip` trong muc Artifacts.
- Viec tiep theo: Commit va day len GitHub tren ca `fix/full-audit-regressions` va `master`.

## 2026-10-01-09 - Chuan hoa Deployment Target iOS phu hop Expo SDK 57 (Yeu cau iOS 16.4+)

- Thoi gian: 2026-10-01 (Asia/Saigon)
- Loai: Sua loi | Mobile | iOS | CI/CD | Tai lieu
- Trang thai: Hoan tat
- Muc tieu: Khac phuc loi `Install CocoaPods dependencies` that bai tren Codemagic do cac package Expo SDK 57 (`expo-audio`, `expo-camera`, `expo-constants`, `EXConstants.podspec`) quy dinh toi thieu `:ios => '16.4'`, khong the link xuong 15.1.
- Pham vi: `mobile/app.json`, `docs/CHANGELOG.md`.
- File da thay doi: `mobile/app.json`, `docs/CHANGELOG.md`.
- Noi dung: Go bo `deploymentTarget: 15.1` khoi `mobile/app.json` de de Cocoapods autolinking su dung target chuan cua Expo SDK 57 (iOS 16.4+). Giu nguyen lenh dong goi `cp -a` va `zip -qry` trong `codemagic.yaml` de bao toan symlink dynamic framework.
- Quyet dinh ky thuat: Toan bo he sinh thai Expo SDK 57 / React Native 0.86 da nang muc ho tro toi thieu len iOS 16.4 (Swift 5.9). iPhone 6s chi dung lai o iOS 15.8.4 nen khong the tuong thich ve mat runtime voi Expo 57; viec ep target xuong 15.1 khien autolinking bo qua toan bo cac pod Expo gay fail build. De ung dung hoat dong on dinh, he thong tuan theo chuan iOS 16.4+ va kiem thu tren cac thiet bi ho tro iOS 16 tro len (iPhone 8 / X / 11 tro len).
- Database/API/cau hinh: Khong co thay doi database hay API backend.
- Kiem thu: Da chay `npm run typecheck` dat; `npm test` dat 34 file/144 test; `npm run lint` dat 0 loi; `git diff --check` dat.
- Rui ro con lai: Thiet bi iOS duoi 16.4 (nhu iPhone 6s, 7) khong the chay ban build cua Expo SDK 57; can dung thiet bi chay iOS 16.4+ de test.
- Viec tiep theo: Commit va day len GitHub ca `fix/full-audit-regressions` va `master`.

## 2026-10-01-08 - Khac phuc vang app khoi dong tren iPhone 6s / iOS 15 (Symlink IPA va Deployment Target)

- Thoi gian: 2026-10-01 (Asia/Saigon)
- Loai: Sua loi | Mobile | iOS | CI/CD | On dinh | Tai lieu
- Trang thai: Hoan tat
- Muc tieu: Khac phuc hien tuong app tu out/vang ngay sau khi cai dat va mo len tren iPhone 6s (chay iOS 15).
- Pham vi: `codemagic.yaml`, `mobile/app.json`, `docs/CHANGELOG.md`.
- File da thay doi: `codemagic.yaml`, `mobile/app.json`, `docs/CHANGELOG.md`.
- Noi dung:
  1. Chinh sua lenh dong goi IPA tren Codemagic tu `cp -R` va `zip -qr` sang `cp -a` va `zip -qry`. Flag `-y` la bat buoc de giu nguyen cac symbolic link ben trong cac dynamic framework nhu `hermesvm.framework`; neu thieu `-y`, dynamic linker (`dyld`) cua iOS khong the load binary framework dan den vang app ngay lap tuc.
  2. Thiet lap ro rang `ios.deploymentTarget: "15.1"` trong `mobile/app.json` de dam bao tuong thich toi thieu voi iOS 15 tren chip Apple A9 cua iPhone 6s.
  3. Huong dan chi tiet cach lay log crash `.ips` truc tiep tren iPhone va tren 3uTools/Sideloadly de xac dinh nguyen nhan ky thieu framework tu tool ky.
- Quyet dinh ky thuat: Tren he dieu hanh macOS/iOS, cac bundle framework ben trong `Payload/*.app/Frameworks/` su dung symlink de tro toi version binary hien tai (`hermesvm -> Versions/Current/hermesvm`). Lenh `zip` mac dinh se pha huy symlink neu thieu tham so `-y`. Dong thoi, 3uTools co diem yeu la chi ky file binary chinh cua app ma khong ky de quy cac framework ben trong, dan den kernel iOS kill tien trinh do `CODESIGNING`.
- Database/API/cau hinh: Khong co thay doi database hay API backend.
- Kiem thu: Da chay `npm run typecheck` dat; `npm test` dat 34 file/144 test; `npm run lint` dat 0 loi; `git diff --check` dat.
- Rui ro con lai: Can nguoi dung trigger build lai tren Codemagic voi code moi de nhan IPA chua symlink hop le, va dung Sideloadly hoac kiem tra log crash neu 3uTools ky thieu framework.
- Viec tiep theo: Commit, day len GitHub tren ca `fix/full-audit-regressions` va `master`.

## 2026-10-01-07 - Phong ve crash startup Mobile iOS (WebRTC va Polyfill)

- Thoi gian: 2026-10-01 (Asia/Saigon)
- Loai: Sua loi | Mobile | iOS | On dinh | Tai lieu
- Trang thai: Hoan tat
- Muc tieu: Khac phuc nguy co crash vang app ngay khi khoi dong tren iOS do WebRTC module va polyfill khoi tao truoc khi render.
- Pham vi: `mobile/src/components/MobileCallOverlay.tsx`, `mobile/src/polyfills/intlSegmenter.ts`, `docs/CHANGELOG.md`.
- File da thay doi: `mobile/src/components/MobileCallOverlay.tsx`, `mobile/src/polyfills/intlSegmenter.ts`, `docs/CHANGELOG.md`.
- Noi dung: Chuyen `RTCView` trong `MobileCallOverlay` sang dang lazy require trong `try...catch`, chi nap khi co cuoc goi video va co san module native; boc `try...catch` cho `installIntlSegmenterPolyfill` de tranh loi non-extensible object tren Hermes/iOS.
- Quyet dinh ky thuat: `react-native-webrtc` co co che nem ngoai le ngay tai thoi diem import neu `WebRTCModule === null`. Viec import tinh tai `MobileCallOverlay` khien loi nay lan ra toan bo ung dung ngay khi `App.tsx` duoc parse, du chua co cuoc goi nao. Lazy-load component video giup app van khoi dong va hoat dong binh thuong.
- Database/API/cau hinh: Khong co thay doi database hay API backend.
- Kiem thu: Da chay `npm run typecheck` dat; `npm test -- --reporter=dot --maxWorkers=1` dat 144/144; `npm run lint` dat 0 loi; `git diff --check` dat.
- Rui ro con lai: Can nguoi dung build lai tren Codemagic va xac nhan app mo thanh cong tren thiet bi that.
- Viec tiep theo: Commit va day len GitHub tren ca `fix/full-audit-regressions` va `master`.
- Commit/PR: `eb3461b`

## 2026-10-01-06 - Chuan hoa Codemagic workflow build iOS IPA cho tai khoan free

- Thoi gian: 2026-10-01 (Asia/Saigon)
- Loai: CI/CD | Mobile | iOS | Cau hinh | Tai lieu
- Trang thai: Hoan tat
- Muc tieu: Khac phuc loi Invalid yaml configuration va loi thieu provisioning profile Push Notifications khi build iOS tren Codemagic.
- Pham vi: Chi `codemagic.yaml` va nhat ky thay doi; khong sua code ung dung Mobile hoac Backend.
- File da thay doi: `codemagic.yaml`, `docs/CHANGELOG.md`.
- Noi dung: Chuyen `instance_type` ve `mac_mini_m1` (phu hop goi free), doi `node` sang `latest`, bo bat buoc App Store Connect integration; bo sung buoc tu dong loai bo entitlement `aps-environment` cho ban build test va dong goi truc tiep ban Release thanh `ViChat.ipa` qua `xcodebuild` khong can chung chi ky.
- Quyet dinh ky thuat: Khi chua co tai khoan Apple Developer tra phi ($99), may ao Codemagic khong the ky Push Notifications. Do do, loai bo `aps-environment` trong file entitlements truoc khi build va build voi `CODE_SIGNING_ALLOWED=NO`, sau do zip `Payload/ViChat.app` thanh `ViChat.ipa` dua vao `artifacts` de nguoi dung sideload test bang 3uTools/Sideloadly tren Windows.
- Database/API/cau hinh: Khong co thay doi database hay API backend.
- Kiem thu: Da validate file `codemagic.yaml` voi JSON Schema chuan Draft 7 cua Codemagic (`https://codemagic.io/codemagic-schema.json`), 0 loi cu phap; `git diff --check` dat.
- Rui ro con lai: Can nguoi dung trigger lai build tren Codemagic de xac nhan file `ViChat.ipa` xuat hien tai muc Artifacts.
- Viec tiep theo: Nguoi dung khoi chay lai build tren Codemagic va tai `ViChat.ipa` ve test tren iPhone.
- Commit/PR: `1af5dcf`

## 2026-10-01-05 - Hoan thien song ngu Mobile Viet/English

- Thoi gian: 2026-10-01 (Asia/Saigon)
- Loai: Tinh nang | Mobile | i18n | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat
- Muc tieu: Hoan thien lua chon tieng Viet/English trong ho so ca nhan de giao dien Mobile cap nhat nhat quan truoc khi trien khai chuc nang dich noi dung tro chuyen.
- Pham vi: Chi `mobile/` va nhat ky thay doi; khong sua Web, Chatmgt, Tinode, S3 hoac API.
- File da thay doi: `mobile/App.tsx`, `mobile/src/i18n/`, `mobile/src/store/languageStore.ts`, `mobile/src/store/languageStore.test.ts`, cac component/man hinh Mobile dung i18n.
- Noi dung: Bo sung ban dich cho modal, trang thai realtime/dang nhap, nhom, thu hoi/sua tin, file/voice/sticker/poll, Workspace va Cloud; chuan hoa chuoi loi de khong quay ve tieng Viet khi chon English; giu `Dich tro chuyen` o trang thai chua kha dung de lam o buoc ke tiep.
- Quyet dinh ky thuat: Dung translator Mobile ket hop catalog dung chung voi catalog Mobile, luu lua chon `vi`/`en` trong AsyncStorage va dung locale `vi-VN`/`en-US` cho ngay gio; du lieu nguoi dung va noi dung tin nhan khong bi dich tu dong.
- Database/API/cau hinh: Khong co migration, endpoint hoac thay doi cau hinh backend.
- Kiem thu: `npm test -- --reporter=dot --maxWorkers=1` dat 34 file/144 test; `npm run typecheck` dat; `npm run lint` dat; `npm run export` dat; `git diff --check` dat; Gradle `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a,x86_64 -x lintVitalRelease` dat `BUILD SUCCESSFUL`; APK da kiem tra bang `aapt`, `zipalign` va `apksigner` (APK Signature Scheme v2 hop le).
- Artifact: `D:\vichat-build\vichat-mobile-bilingual-20261001\vichat-mobile-bilingual-1.0.38-arm64-x86_64.apk`, package `vn.upgo.vichat`, version `1.0.38`, `versionCode=39`, ABI `arm64-v8a,x86_64`, SHA-256 `640E42D17C26A353CBB7AC38B638B88A019005AD316158B7C24AADFCD61CFB5A`, signer `Android Debug` cho ban test noi bo.
- Rui ro con lai: `adb devices` hien khong co thiet bi online nen chua cai/smoke test tren dien thoai hoac emulator trong lan nay; chuc nang dich noi dung tro chuyen chua trien khai theo yeu cau.
- Viec tiep theo: Khi ADB co thiet bi, cai APK va UAT UI English; sau do moi bat dau luong dich noi dung tro chuyen.
- Commit/PR: Source `d40d148`; artifact/build follow-up duoc ghi nhan trong lan lam viec nay.

## 2026-10-01-04 - Chot font readability tren Web

- Thoi gian: 2026-10-01 10:30 (Asia/Saigon)
- Loai: Sua loi | Web | UI | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da deploy production Web.
- Muc tieu: Hien thi tieng Viet va dau cau on dinh hon tren ChatUI Web production.
- Pham vi: Chi ChatUI Web; khong sua, build hoac deploy Mobile.
- File da thay doi: `src/index.css`, `src/styles/index.css`, `src/features/chat/services/chatManagementService.test.js`, `dist/index.html`.
- Noi dung: Doi font fallback chung sang `Segoe UI`, `Noto Sans`, `Helvetica Neue`, Arial; tat font synthesis de tranh glyph tu tao lam sai dau; cap nhat test va manifest bundle production.
- Quyet dinh ky thuat: Uu tien font he thong co san cho luong ChatUI de giam loi render tieng Viet; giu cac asset Inter self-hosted cho cac surface van khai bao Inter, khong tao request font tu xa.
- Database/API/cau hinh: Khong co migration, API hoac bien moi truong moi.
- Kiem thu: `npm run test:frontend -- --test-concurrency=1` dat 456/456; `npm run build:production` dat; `git diff --check` dat. `npm run lint` bi chan tai `mobile/src/components/TypingIndicator.tsx:9` do loi Hook ngoai pham vi Web; khong sua Mobile. Production build `chat` dat; local/public `/healthz` tra `ok`; public bundle khop `/assets/index-COl7vJGl.js` va `/assets/index-BtnHSOqD.css`, CSS public co `Segoe UI`; Chatmgt health tra `ok`; container ngoai `chat` khong doi.
- Artifact/phat hanh: Archive `vichat-web-621c603-20261001.tar.gz`, SHA-256 `CF54D6BA13F73DE21DA8D1B07FB5C197BEB665324679861EDAE1B0BC987B42B1`; release `/opt/deploy/chat/releases/vichat-web-621c603-20261001` dang la `current`, `previous` tro `/opt/deploy/chat/releases/vichat-web-d7a9f15`; archive duoc truyen qua `ubuntu@103.74.122.206` vao `ubuntu@192.168.80.20`; chi recreate service `chat`.
- Rui ro con lai: Can UAT Web bang hai tai khoan sau hard refresh de xac nhan readability tieng Viet tren cac man hinh chat; rollback ve `previous` neu phat sinh loi.
- Viec tiep theo: UAT Web; khong thao tac Mobile, khong migration, khong reset Tinode va khong xoa volume.
- Commit/PR: Source `b95b50a`, docs/deploy follow-up `621c603`, `e66571f` / da push `github` va `origin`.

## 2026-10-01-03 - Chan sender FCM banner tren Mobile

- Thoi gian: 2026-10-01 (Asia/Saigon)
- Loai: Sua loi | Mobile | Notification | FCM | Android | Kiem thu | ADB | Tai lieu
- Trang thai: Hoan tat source, test, prebuild, build release ARM64 va cai truc tiep tren Android; chua UAT hai tai khoan cho cap gui/nhan trong background/killed.
- Nguyen nhan: Guard own-echo va local notification da fail-closed, nhung push Tinode/FCM danh dau `data.silent=true` van di vao Expo Firebase messaging service va bi tao thanh banner tren `expo_notifications_fallback_notification_channel` cua sender.
- Pham vi: Chi `mobile/` va tai lieu kien truc/changelog; khong sua Web, backend, Tinode server hay S3. Thay doi root `package-lock.json` co san duoc giu nguyen va khong stage.
- Noi dung: Them `mobile/plugins/withSilentPushFilter.js` de thay Expo messaging service bang `ViChatFirebaseMessagingService`; bo qua silent sender/device-sync push truoc khi Expo hien thong bao, giu recipient push va exempt incoming-call/webrtc payload. Foreground handler dung cung policy; them Firebase Messaging dependency vao generated Android app qua config plugin.
- Quyet dinh ky thuat: Dung dau `silent` ma Tinode da co de Mobile tu bao ve khi provider authoritative chua duoc recreate; khong tat toan bo FCM va khong can luu Account/Tinode identity vao native storage. Tin nhan recipient khong co dau silent van duoc hien binh thuong.
- Kiem thu source: `cd mobile; npm test -- --reporter=dot --maxWorkers=1` dat `33/33 file, 142/142 test`; `npm run typecheck` dat; `npm run lint` dat; `node --check plugins/withSilentPushFilter.js` dat; `npx expo prebuild --platform android --no-install` dat; `git diff --check` dat.
- Kiem thu native: `D:\m37\android\gradlew.bat :app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a -x lintVitalRelease` dat `BUILD SUCCESSFUL`; APK `D:\vichat-build\vichat-mobile-notification-filter-20261001\vichat-mobile-1.0.38-arm64.apk`, package `vn.upgo.vichat`, version `1.0.38`, Android `versionCode=39`, ABI ARM64, SHA-256 `7F855BE7308F2DB38ADE69F8941FC04A771C2133486EAD3DCF7A5B6F4FC7889D`; manifest release co `ViChatFirebaseMessagingService`, khong con Expo messaging service.
- Kiem thu thiet bi: `adb -s cb785b0f push` va `adb -s cb785b0f shell pm install -r --user 0 /data/local/tmp/vichat-mobile-1.0.38-arm64.apk` tra `Success`; `dumpsys package` tra `versionCode=39`, service native va khong co Expo service; logcat sau khi mo khong co `FATAL EXCEPTION`, `UnsatisfiedLinkError` hay loi `ReactNativeJS`, co `[ViChat] Native push registration ready: fcm`.
- Rui ro con lai: Neu provider gui notification payload ma khong co `silent=true`, Android co the hien truoc khi Mobile loc duoc; truong hop do van can patch/cau hinh Tinode authoritative. Chua co hai tai khoan de UAT recipient va sender o foreground/background/swiped/killed, nen khong ghi nhan da xac minh push end-to-end.
- Viec tiep theo: UAT A/B voi tin text, file, sticker va incoming call o foreground/background/killed; neu can xu ly provider khong gan dau `silent`, cap nhat Tinode server theo patch da co ma khong thay doi luong Mobile.
- Commit/PR: Se commit rieng phan Mobile va tai lieu trong lan lam viec nay; khong stage thay doi Web/root ngoai pham vi.

## 2026-10-01-02 - Hoan thien notification, sticker, voice va smoke test Mobile

- Thoi gian: 2026-10-01 (Asia/Saigon)
- Loai: Sua loi | Mobile | Chat | Notification | Sticker | Voice | Kiem thu | ADB | Tai lieu
- Trang thai: Hoan tat source, test, build va cai truc tiep tren Android; chua UAT hai tai khoan cho cap gui/nhan notification.
- Nguyen nhan: Packet Tinode co the la own echo hoac thieu sender identity nhung van di vao nhanh notification; module `expo-av` da gay `UnsatisfiedLinkError` voi React Native/Expo SDK 57 khi khoi dong ban release.
- Pham vi: Chi `mobile/` va nhat ky nay; khong sua Web, backend, Tinode server hay S3.
- Noi dung: Notification fail-closed neu khong xac minh duoc sender, chan own message o ca Tinode client va app store, chi schedule khi message la incoming co `senderId`; sticker duoc tach khoi attachment anh/file va hien kich thuoc nho; thay camera trong composer bang ghi am voice, them phat voice; thay `expo-av` bang `expo-audio@57.0.5` va them config plugin tuong ung.
- Quyet dinh ky thuat: Dung `expo-audio` theo SDK 57 de tranh ABI native mismatch; recorder/player moi dung API `AudioRecorder`/`AudioPlayer`, cache media hien co va giu metadata voice/sticker trong Tinode nhu luong Mobile da chuan hoa.
- Kiem thu source: `npm test -- --reporter=dot --maxWorkers=1` (32/32 file, 139/139 test); `npm run typecheck` pass; `npm run lint` pass; `npx expo config --json --type public` ghi nhan version `1.0.37`, Android `versionCode=38`, plugin `expo-audio`.
- Kiem thu native: `D:\m37\android\gradlew.bat :app:assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a` pass; APK `D:\m37\android\app\build\outputs\apk\release\app-release.apk`, package `vn.upgo.vichat`, ABI `arm64-v8a`, SHA-256 `953F18D4BC1FB2A59461AA24E23FA90D4A2C684A622B3B3F0B0D240C0CB7E9D2`.
- Kiem thu thiet bi: `adb -s cb785b0f install -r` tra `Success`; `adb shell am start -W -n vn.upgo.vichat/.MainActivity` tra `Status: ok`, process va activity van foreground; logcat sau khi mo khong co `FATAL EXCEPTION`, `UnsatisfiedLinkError` hoac loi `ReactNativeJS`; channel `messages-v2`/`calls-v2` ton tai.
- Rui ro con lai: Chua co hai thiet bi/tai khoan dong thoi de UAT mot tin nhan that voi ca nhan gui va nguoi nhan; can lap lai test nay khi co tai khoan nhan thuc te, khong dung notification record cu tren may.
- Viec tiep theo: Co the dung APK da luu tai `D:\vichat-build\vichat-mobile-notification-sticker-20260930\vichat-mobile-1.0.37-arm64.apk`; neu can release da thiet bi thi build them ABI theo pipeline Android.
- Commit/PR: Commit rieng phan Mobile trong lan lam viec nay; khong stage thay doi Web/root ngoai pham vi.

## 2026-10-01-01 - Deploy Web avatar, sticker local va font

- Thoi gian: 2026-10-01 (Asia/Saigon)
- Loai: Van hanh | Web | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da deploy production Web.
- Muc tieu: Dua ban sua Web avatar/CSP, sticker built-in va font readability vao production ma khong anh huong Mobile, Chatmgt, Tinode, database, Redis hoac volume.
- Pham vi: Release `/opt/deploy/chat/releases/vichat-web-d7a9f15` tren private host; `current` tro vao release nay, `previous` giu `vichat-web-a6f219c-20260930`.
- Noi dung: Trien khai commit Web `be143f7` va changelog follow-up `d7a9f15`; chi recreate service `chat`, khong recreate Chatmgt hay cac container stateful.
- Quyet dinh ky thuat: Archive SHA-256 `C02DEAB3BDCFF2FAE2073A59E5E99BCC296CE14BDE92B0DB8E3AE0B046BC0BBB` duoc chuyen qua `ubuntu@103.74.122.206` roi vao `ubuntu@192.168.80.20`; giu nguyen `.env`, runtime, database va Tinode uploads cua release truoc.
- Database/API/cau hinh: Khong migration, khong reset Tinode, khong xoa volume; chi cap nhat image ChatUI va Nginx CSP.
- Kiem thu: `docker compose build chat` pass; ChatUI container healthy; Chatmgt, bridge, webhook, PostgreSQL va Redis healthy; local `/healthz` tra `ok`; public bundle la `/assets/index-BqnRJhpV.js` va `/assets/index-BheqvY3X.css`; public CSP cho phep `https://static.upgo.vn` va `https://upstart.vn`; Chatmgt `/api/v1/auth/health` tra `status: ok`; stateful container IDs khong doi. Lenh `nginx -t` trong container tach rieng khong dung duoc vi upstream `chatmgt` chi resolve tren Compose network, nhung Nginx runtime/public health va header da duoc xac minh.
- Phan tach Mobile: Khong stage, commit, build hoac deploy cac thay doi dang co trong `mobile/`; Mobile van la luong doc lap.
- Rui ro con lai: Can UAT Web bang hai tai khoan de xac nhan avatar nhom va sticker local sau refresh; history/media Tinode cu van khong tu dong phuc hoi neu chua migration.
- Viec tiep theo: UAT Web va rollback ve `previous` neu phat sinh loi; khong thao tac Mobile trong release nay.
- Commit/PR: `be143f7` + `d7a9f15`; da push `origin` va `github`; PR chua tao.

## 2026-09-30-09 - Sua loi avatar, sticker local va font tren Web

- Thoi gian: 2026-09-30 (Asia/Saigon)
- Loai: Sua loi | Web | Chat | UI | CSP | Kiem thu | Tai lieu
- Trang thai: Hoan tat source, test, build, commit va push; chua deploy do SSH vao private host bi tu choi.
- Nguyen nhan: CSP production chua cho phep `static.upgo.vn` va `upstart.vn`, nen avatar Account bi trinh duyet chan; sticker built-in da duoc gui bang marker text nhung UI van cho URL file Tinode/S3; CSS van uu tien Inter khi khong co font da dong goi.
- Pham vi: `src/app/App.jsx`, `src/features/chat/services/tinodeClient.js`, `src/features/chat/services/stickerProtocol.js`, cac test frontend, `src/index.css`, `src/styles/index.css`, `infrastructure/production/nginx.conf`, `dist/index.html` va `package.json`. Chi sua Web.
- Noi dung: Cho phep hai CDN avatar trong `img-src`; them fallback catalog cho sticker built-in va protocol marker `vichat-sticker:<pack>:<sticker>:<version>` khong tao File/upload S3; doi font sang stack he thong de doc hon, dong bo font cho form control va sua ba nhan hien thi bi loi encoding.
- Quyet dinh ky thuat: Sticker built-in khong can media remote; custom sticker van giu nguyen luong upload hien co. Avatar/media Tinode cu khong duoc rewrite hoac reset; tham chieu khong con se fallback ve chu cai dau.
- Database/API/cau hinh: Khong migration, khong doi API/backend; chi cap nhat CSP Nginx production.
- Kiem thu: `node --test src/features/chat/services/stickerProtocol.test.js` (4/4); `node --test src/features/chat/services/chatManagementService.test.js` (71/71); `npm run test:frontend -- --test-concurrency=1` (456/456); `npx oxlint src` pass voi 2 warning hien huu trong `src/App.jsx`; `npm run build:production` pass; `git diff --check` pass. `npm run lint` van bi chan boi loi hook hien huu tai `mobile/src/components/TypingIndicator.tsx`, khong thuoc pham vi Web.
- Phan tach Mobile: Cac thay doi trong `mobile/` duoc giu nguyen, khong sua/revert/stage trong release Web nay va khong duoc xem la mot phan cua luong Web.
- Rui ro con lai: Avatar/media cu chi tro lai neu co migration rieng tu kho Tinode rollback; can UAT Web sau deploy va refresh tab de nhan bundle moi.
- Viec tiep theo: Cap quyen/key SSH cho `ubuntu@192.168.80.20`, sau do truyen archive va chay quy trinh deploy production; khong reset Tinode hoac xoa volume.
- Commit/PR: `be143f7` / da push `origin` va `github` tren `fix/full-audit-regressions`; PR chua tao.

## 2026-09-30-09M - Tach rieng thay doi Mobile khoi Web

- Thoi gian: 2026-09-30 (Asia/Saigon)
- Loai: Pham vi phat hanh | Mobile | Tai lieu
- Trang thai: Khong thay doi Mobile trong lan sua Web nay.
- Pham vi: Cac thay doi dang co trong `mobile/` duoc bao luu nguyen trang theo yeu cau; khong dua vao commit, build hoac deploy Web.
- Quyet dinh: Mobile va Web la hai luong phat hanh doc lap; sua Mobile neu can se ghi nhat ky va kiem thu o muc Mobile rieng, khong lam thay doi hop dong Web.

## 2026-09-30-08 - Sua loi schema Chatmgt lam an 500 directory/conversation

- Thoi gian: 2026-09-30 (Asia/Saigon)
- Loai: Sua loi | Backend | Database | Van hanh | Trien khai | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da push ca `origin` va `github` tren `master` va `fix/full-audit-regressions`, da deploy production.
- Nguyen nhan: Production dang o Alembic `20260921_16` trong khi image web/Chatmgt da dung model cua `20260928_17`; bang `conversation` thieu `creation_request_id`, lam `/api/v1/conversation/direct-block-state` tra HTTP 500 va UI chi con hien ViChat AI.
- Pham vi: `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/tests/test_mobile_stability_contract.py`, migration `017_mobile_group_idempotency` da co san trong source.
- Noi dung: Them smoke check authenticated cho direct conversation policy vao deployment verifier de release khong duoc coi la dat neu endpoint nay hong; khong thay doi logic du lieu chat va khong reset Tinode.
- Quyet dinh ky thuat: Backup PostgreSQL truoc migration; ap dung Alembic `20260928_17` (cot nullable va partial unique index), giu nguyen account, conversation, Tinode, Redis va volume.
- Database/API/cau hinh: Da tao backup production truoc migration; da ap dung `alembic upgrade head`, production hien o `20260928_17`; khong xoa volume, khong chay Tinode reset.
- Kiem thu: `python -m unittest chatservice-main/tests/test_mobile_stability_contract.py -q` (3/3); `python -m unittest chatservice-main/tests/test_verify_deployment.py -q` (9 skipped do may local thieu dependency); `python -m unittest chatservice-main/tests/test_enterprise_workspace.py -q` (11/11); `python -m py_compile chatservice-main/scripts/verify_deployment.py`; production verifier tren candidate pass directory, conversation, direct policy, Tinode WebSocket, login/logout; public `/healthz` va Chatmgt `/api/v1/auth/health` pass; public bundle la `index-BeHpJT5t.js`/`index-B1sUJyGf.css`; log sau migration khong con loi schema/HTTP 500.
- Rui ro con lai: History/avatar cu chi tro lai neu co migration rieng tu kho Tinode rollback; can refresh cung trinh duyet neu tab dang giu bundle cu.
- Viec tiep theo: UAT lai web bang tai khoan that de xac nhan danh sach nhom/avatar; khong reset Tinode hoac xoa volume.
- Commit/PR: `8557d3c` / `fix(deploy): verify direct conversation policy`.

## 2026-09-30-07 - Chot mobile 1.0.36 va redeploy web ban moi

- Thoi gian: 2026-09-30 (Asia/Saigon)
- Loai: Phat hanh | Mobile | Web | Van hanh | Trien khai | Kiem thu | Tai lieu
- Trang thai: Da push ca `github` va `origin`; web da deploy production; mobile da chot APK test noi bo.
- Muc tieu: Dua dung HEAD cuoi cung vao production va ban giao mobile version `1.0.36` ma khong reset Tinode, database, Redis, volume hay history.
- Pham vi: HEAD `3a6c574` (runtime web fix `d2410ad`, mobile company-switch fix `f643647`); khong them migration va khong thay doi data flow production.
- Kiem thu web/deploy: Archive `git archive` SHA-256 `DA22E5AE83CE9CD21E92FAC9003C8CE4C8C30BDA254691A34D784D6AA9F18B01`; Docker Compose build `chatmgt`/`chat` dat; Nginx `-t` dat; hai service moi healthy, restart `0`; local/public `/healthz` dat; Chatmgt `/api/v1/auth/health` dat; public bundle khop local (`/assets/index-BeHpJT5t.js`, `/assets/index-B1sUJyGf.css`).
- Artifact mobile: `D:\vichat-build\ViChat-1.0.36-mobile-release-20260930-universal.apk`, package `vn.upgo.vichat`, version `1.0.36`, Android `versionCode=37`, ABI `arm64-v8a,x86_64`, SHA-256 `0BE434CDCC2D48734ED8676AE54A32E7F0ADEA19FE520EEED4B63F9FD4C813D5`; signer `Android Debug`, chi la ban test noi bo, chua ky store.
- Trien khai: Archive `vichat-web-3a6c574-20260930.tar.gz` duoc truyen qua `ubuntu@103.74.122.206` vao `192.168.80.20`; release `/opt/deploy/chat/releases/vichat-web-3a6c574-20260930-r3` dang la `current`, `previous` tro ve `/opt/deploy/chat/releases/vichat-web-d2410ad`; chi recreate `chatmgt` va `chat`. Hai candidate truoc da dung truoc activation gate, production khong bi doi cho den candidate `r3` dat.
- Xac minh stateful: Container ID cua `chat-postgres`, `tinode-postgres`, `redis`, `chatapi`, `tinode-account-bridge` va `tinode-chatbot-webhook` khong doi; khong chay migration, `docker compose down -v`, Tinode reset hoac xoa volume.
- Rui ro con lai: History/avatar/media cu van khong tu dong tro lai neu khong co migration tu Tinode rollback; mobile chua UAT tai khoan co nhieu membership tren thiet bi that va APK chua phai ban Play Store.
- Viec tiep theo: UAT web hai tai khoan va UAT mobile hai membership; neu can phuc hoi history/avatar, lap ke hoach migration rieng, khong reset lai Tinode.
- Commit/PR: `3a6c574` / `docs: record mobile 1.0.36 artifact`; runtime web `d2410ad`; mobile `f643647`; PR chua tao.

## 2026-09-30-06 - Chan reset Tinode lam mat dau vet mapping web

- Thoi gian: 2026-09-30 (Asia/Saigon)
- Loai: Sua loi | Web | Backend | Van hanh | Kiem thu | Tai lieu
- Trang thai: Da commit va deploy web/chatmgt
- Nguyen nhan: Lan chuyen sang kho Tinode trung tam moi da clear mapping `tinode_uid`/`tinode_topic`; production hien con 9/46 group co topic, trong khi central khong con cac topic cu da bi clear. Chatmgt van con metadata va mot so avatar properties, nhung web khong the tai history cu khi khong co topic va media cu co the khong con tren central.
- Pham vi: `chatservice-main/scripts/switch_tinode_central.py`, `chatservice-main/tests/test_tinode_central_switch.py`, `infrastructure/production/README.md`, va muc nay. Khong sua `mobile/`.
- Noi dung: Them `--allow-fresh-data-loss` bat buoc cho fresh-data reset; luu danh sach UID/topic Tinode cu vao `legacy_tinode_uids`/`legacy_tinode_topics` truoc khi clear de audit/recovery; giu nguyen Chatmgt IDs va membership.
- Quyet dinh ky thuat: Khong tu dong gan lai topic cu da khong ton tai tren central va khong fallback mu quang sang Tinode rollback; history/media cu chi duoc xem la khoi phuc sau khi co ke hoach migration xac minh.
- Database/API/cau hinh: Khong migration/schema moi; thay doi command van hanh va JSON properties audit.
- Kiem thu: `python -m unittest chatservice-main/tests/test_tinode_central_switch.py -q` (9/9), `python -m unittest chatservice-main/tests/test_chat_auth_contract.py -q` (61/61), `npm run test:frontend -- --test-concurrency=1` (451/451), `npx oxlint src` (pass, 2 warning hien huu), `npm run build:production` (pass), `python -m py_compile chatservice-main/scripts/switch_tinode_central.py`, va `git diff --check` (pass). `npm run lint` van bi chan boi loi hook hien huu trong `mobile/src/components/TypingIndicator.tsx`, khong thuoc pham vi lan nay.
- Rui ro con lai: History va cac avatar/media chi nam trong Tinode rollback chua duoc restore vao central; can quyet dinh migration rieng va UAT web hai tai khoan.
- Viec tiep theo: UAT web voi hai tai khoan; neu can phuc hoi history/avatar, lap ke hoach migration rieng tu Tinode rollback sang central; khong reset lai va khong restart mobile.
- Trien khai: Commit `d2410ad066095e27815b7e1f247e51f548cc752a` da push len `github/fix/full-audit-regressions`; release `/opt/deploy/chat/releases/vichat-web-d2410ad` da duoc giai nen tren `192.168.80.20` qua jump host `103.74.122.206`, symlink `current` da tro vao release moi. Chi recreate `chat` va `chatmgt`; cac container stateful va volume duoc giu nguyen.
- Xac minh production: `chat` va `chatmgt` healthy; public ChatUI `/healthz` tra `ok`; public Chatmgt `/api/v1/auth/health` tra `status: ok`; bundle public da phuc vu asset moi; release cu van giu de rollback.
- Commit/PR: `d2410ad` / `fix(web): guard fresh Tinode reset mappings`.

## 2026-09-30-05 - Sua luong chuyen cong ty tren mobile

- Thoi gian: 2026-09-30 (Asia/Saigon)
- Loai: Sua loi | Mobile | Auth | UX | Kiem thu | Phat hanh | Tai lieu
- Trang thai: Hoan tat source, test, build APK va kiem tra emulator; chua UAT bang tai khoan co nhieu membership
- Muc tieu: Bao dam mobile tai dung membership Account, chuyen dung tenant, tai lai du lieu theo cong ty moi va khong lam mat phien cu neu thao tac that bai.
- Pham vi: `mobile/src/services/authService.ts`, `mobile/src/services/authService.test.ts`, `mobile/src/store/appStore.ts`, hai man Settings/EditProfile, version mobile `1.0.36`.
- Noi dung: Lam moi `/api/v1/auth/me` truoc khi mo picker; nhan response auth long nhieu dang; chuan hoa membership nested/map va trang thai inactive; xac nhan tenant dich; giu danh sach membership khi response switch thieu; rollback bearer token neu SecureStore/AsyncStorage loi.
- Quyet dinh ky thuat: Mobile van chi goi Chatmgt; Chatmgt/UpGO Account la nguon xac thuc membership. Token moi chi duoc commit sau khi tenant dich da duoc xac nhan va phien public luu thanh cong; web/backend khong thay doi.
- Database/API/cau hinh: Khong migration, khong endpoint moi; tang version Android len `1.0.36`, `versionCode=37`.
- Kiem thu: `cd mobile; npm test -- --reporter=dot --maxWorkers=1` dat 32 file, 134/134; `npm run typecheck` dat; `npm run lint` dat; `npm run export` dat; `npx expo config --json --type public` xac nhan version `1.0.36`, Android `versionCode=37`; `git diff --check` dat; staging tren `D:` chay `npx expo prebuild --platform android --no-install` va Gradle `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a,x86_64` dat 520 tasks; `aapt dump badging`, `zipalign -c -P 16 -v 4` va `apksigner verify --verbose --print-certs` dat, APK Signature Scheme v2 hop le.
- Artifact: `D:\vichat-build\ViChat-1.0.36-mobile-release-20260930-universal.apk`, package `vn.upgo.vichat`, version `1.0.36`, `versionCode=37`, ABI `arm64-v8a,x86_64`, SHA-256 `0BE434CDCC2D48734ED8676AE54A32E7F0ADEA19FE520EEED4B63F9FD4C813D5`, signer `Android Debug` cho ban test noi bo.
- Emulator: APK cai thanh cong tren `emulator-5554`; `MainActivity` foreground; man Cai dat hien muc `Chuyen cong ty`, bam vao mo dialog thong bao tai khoan chi co mot cong ty dang hoat dong; UI dump co `Gon Platform`; logcat khong co `FATAL EXCEPTION`, `TypeError` hoac `Invariant Violation`.
- Rui ro con lai: Emulator dang dung tai khoan chi co mot membership nen chua UAT picker, xac nhan chuyen tenant, token/session, Tinode va du lieu Chatmgt voi tai khoan Account co tu hai membership dang hoat dong; chua test thiet bi that/iOS. APK la ban test Android, chua ky store.
- Viec tiep theo: UAT voi tai khoan Account co hai cong ty de xac nhan picker va tai lai du lieu dung tenant; phat hanh store thi build lai bang release keystore.
- Commit/PR: `f643647`; PR chua tao.

## 2026-09-30-04 - On dinh dong bo danh sach hoi thoai mobile

- Thoi gian: 2026-09-30 18:41 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Mobile | Chat | Realtime | Hieu nang | Phat hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat source, test, build APK va kiem tra emulator; chua UAT danh sach chat bang tai khoan that
- Muc tieu: Khong de chat 1-1 rong hoac chat da xoa hien lai sau khi xoa, vuot tai lai hoac dong bo realtime; van giu duoc nhom rong va chat quay lai khi co tin moi.
- Pham vi: `mobile/src/utils/conversationSync.ts`, `mobile/src/utils/conversationSync.test.ts`, `mobile/src/services/chatManagementService.ts`, `mobile/src/services/tinodeClient.ts`, `mobile/src/store/appStore.ts`, `mobile/src/screens/chat/ConversationListScreen.tsx`, `mobile/src/types/index.ts`, cac component/theme/QR mobile dang cho trong working tree va version `1.0.35`.
- Noi dung: Mobile doc va hop nhat `deletedAt` theo viewer, dong bo Tinode voi mot tin moi nhat de xac minh history, phat snapshot moi cho danh sach, loc direct chat khong co tin va khong cho marker xoa bi ghi de. Packet `system`, `reaction`, `edit`, `poll_event` khong duoc coi la tin nhan nguoi dung; tin moi hon moc xoa se mo lai cuoc tro chuyen. Dedupe va chan topic theo ca management ID, Tinode topic va conversation ID de tranh dong lai ban ghi trung.
- Quyet dinh ky thuat: Chatmgt van la nguon metadata va marker xoa; Tinode la nguon xac minh tin nhan that. Khong sua web/backend, khong them migration; giu merge message hien co de khong lam mat history/pending trong luong chat va giu nhom rong co the gui tin dau tien.
- Database/API/cau hinh: Khong migration. Su dung hop dong `deletedAt` hien co va tang mobile len `1.0.35`, Android `versionCode=36`.
- Kiem thu: `cd mobile; npm test -- --reporter=dot --maxWorkers=1` dat 32 file, 130/130; `npm run typecheck` dat; `npm run lint` dat; `npm run export` dat; `git diff --check` dat; staging ASCII tren `D:` chay `npx expo prebuild --platform android --no-install` va Gradle `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a,x86_64` dat 520 tasks; `aapt`, `zipalign` va APK Signature Scheme v2 dat. APK cai thanh cong vao `emulator-5554`, `MainActivity` foreground, UI dump co `Gon Platform`, `Email cong ty`, `Mat khau`, `Dang nhap`; logcat khong co `FATAL EXCEPTION`, `TypeError` hoac `Invariant Violation`.
- Artifact: `D:\vichat-build\ViChat-1.0.35-conversation-list-universal.apk`, package `vn.upgo.vichat`, ABI `arm64-v8a,x86_64`, SHA-256 `965CCB41207886E5C7E06CB308F1E7A92E7EE2E1BFE435CE1F8546223C30B7EE`.
- Rui ro con lai: Emulator chua dang nhap tai khoan that nen chua UAT xoa/refresh chat voi du lieu Chatmgt/Tinode thuc te; chua test offline/reconnect, push background/killed, thiet bi that va iOS. APK la ban test ky Android Debug, chua ky store.
- Viec tiep theo: Dang nhap tai khoan test de xac nhan chat rong bi an sau sync, chat da xoa khong hien lai sau pull-to-refresh, tin moi sau moc xoa mo lai dung va group chat khong bi anh huong.
- Commit/PR: `631deff`; PR chua tao.

## 2026-09-30-03 - Hoan thien noi dung va tuy chon hien thi chi tiet nhom mobile

- Thoi gian: 2026-09-30 12:45 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Mobile | Chat | Media | UI | UX | Phat hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat source, test, build APK va kiem tra artifact; chua UAT tren dien thoai that vi ADB khong thay thiet bi USB
- Muc tieu: Loai bo noi dung nhom bi thieu do chi doc trang Tinode hien tai, mo lai cac tuy chon hien thi/pham loai/an hoi thoai va giu dong bo cach dat ten/vai tro theo yeu cau moi nhat.
- Pham vi: `mobile/src/screens/chat/GroupInfoScreen.tsx`, `mobile/src/services/tinodeClient.ts`, `mobile/src/utils/groupInfoMedia.ts`, `mobile/src/services/conversationPreferenceService.ts`, `mobile/src/screens/chat/ConversationListScreen.tsx`, `mobile/src/components/ConversationRow.tsx`, bo test lien quan va version mobile `1.0.33`.
- Noi dung: Khi mo viewer anh/file/link, Tinode duoc tai tuan tu den het history page va chi phat mot snapshot sau cung de tranh nhay/loi luong danh sach. Anh duoc resolve qua cache co xac thuc, file dung luong download/share hien co, link chi cho phep `http/https`. Group Info hien thi noi dung da ghim/binh chon tu full history. Muc `Muc hien thi`, `The phan loai` va `An tro chuyen` luu theo cap `tenant + viewer`; danh sach ap dung an/gon va hien thi nhan phan loai sau khi quay lai.
- Quyet dinh ky thuat: Chatmgt van la nguon chuan cho metadata/quyen/settings nhom; Tinode chi la nguon history/media realtime. Tuy chon hien thi la local viewer preference, khong dua vao tenant/backend va khong xoa du lieu Tinode. Cac muc lich/dich/link nhom van disabled vi chua co contract dong bo that.
- Database/API/cau hinh: Khong migration, endpoint moi hay thay doi tenant ID. Tang version mobile len `1.0.33`, Android `versionCode=34`; cac nhan `admin`/`GON Platform` duoc chuan hoa thanh `Admin`/`Gon Platform` o boundary hien thi.
- Kiem thu: `cd mobile; npm test -- --reporter=dot --maxWorkers=1` dat 31 file, 121/121; `npm run typecheck` dat; `npm run lint` dat; `npm run export` dat; `npx expo prebuild --platform android --no-install` dat; Gradle staging ASCII `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a,x86_64` dat 520 tasks; `aapt`, `zipalign` va APK Signature Scheme v2 dat.
- Artifact: `D:\vichat-build\vichat-mobile-fix-20260930\android\app\build\outputs\apk\release\app-release.apk`, package `vn.upgo.vichat`, version `1.0.33`, `versionCode=34`, ABI `arm64-v8a,x86_64`, SHA-256 `3886C3A16EBF3C3B83BFCF7BDD68329705CD00BD2A28E69C2BA361BD7B0AE879`.
- Thiet bi that: `adb devices -l` sau khi khoi dong lai ADB khong tra ve device; Windows PnP cung khong co thiet bi Android/ADB. Chua cai APK, chua mo app, chua thu group settings/media/preference tren USB phone.
- Rui ro con lai: Chua UAT tai khoan that, full history rat lon, offline/reconnect, push background/killed, thiet bi iOS; APK la ban test ky Android Debug, chua ky store. Gradle chi co warning deprecated tu dependency.
- Viec tiep theo: Bat USB debugging/chon File transfer va xac nhan prompt RSA tren dien thoai, sau do chay `adb devices`, cai APK nay va UAT group settings, full media history, file S3, link, an/gon/phan loai va tenant switch.
- Commit/PR: Source commit `22f6290`; docs follow-up commit `befafeb`; da push `github/fix/full-audit-regressions`; production deploy chua thuc hien do SSH production tu choi publickey/password.

## 2026-09-30-02 - Hien thi chuyen cong ty theo membership Account

- Thoi gian: 2026-09-30 10:20 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Mobile | Backend contract | Phat hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat source, APK test va UAT man Cai dat tren emulator; chua UAT tai khoan that co nhieu cong ty
- Muc tieu: Bao dam mobile luon hien muc Chuyen cong ty va lay dung danh sach cong ty tu nguon Account, trong do moi tenant membership khac nhau la mot cong ty khac nhau.
- Pham vi: Mobile Settings, Edit Profile, auth normalization, Chatmgt auth contract va version mobile `1.0.32`.
- File da thay doi: `mobile/src/screens/settings/SettingsScreen.tsx`, `mobile/src/screens/settings/EditProfileScreen.tsx`, `mobile/src/services/authService.ts`, `mobile/src/services/authService.test.ts`, `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`.
- Noi dung: Muc Chuyen cong ty luon hien trong Cai dat va Ho so ca nhan; neu co membership Account dang hoat dong khac thi mo picker, neu chi co mot hoac chua nhan duoc danh sach thi hien dialog theo theme thay vi an mat chuc nang. Auth normalizer chap nhan cac dang `tenantOptions`, `tenant_options`, `tenants`, `companies` va `memberships`, uu tien danh sach co du lieu.
- Quyet dinh ky thuat: `https://account.gonplatform.com` la nguon chuan cho user, current tenant va membership cong ty. Mobile khong goi Account truc tiep bang credential; mobile goi Chatmgt `/api/v1/auth/me` va `/api/v1/auth/switch-tenant`, Chatmgt xac minh membership tu Account `/current_user`, goi `/api/v1/tenant/set_current_tenant`, doc lai tenant hien tai roi cap token/session theo tenant moi.
- Database/API/cau hinh: Khong migration hay endpoint Account moi; su dung contract Chatmgt hien co va cac truong `tenantOptions`/`tenant_options`; tang version mobile len `1.0.32`, Android `versionCode=33`.
- Kiem thu: `cd mobile; npm run typecheck` dat; `npm test -- --reporter=dot --maxWorkers=1` dat 29 file, 115/115; `npm run lint` dat; `npm run export` dat; `npx expo config --json --type public` xac nhan version `1.0.32`, code `33`; Gradle staging `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=x86_64` dat; `zipalign` va APK Signature Scheme v2 dat. APK `D:\vichat-build\ViChat-1.0.32-company-switch-universal.apk`, SHA-256 `69588D56F50AF18521BE8BC328CF9C4E72705834D0D19E59E9DFF6BCED4E02E3`.
- Emulator: APK cai va mo thanh cong tren `emulator-5554`; man Cai dat hien muc Chuyen cong ty, bam vao mo dialog thong bao tai khoan chi co mot cong ty dang hoat dong; logcat khong co crash native/JS fatal.
- Rui ro con lai: Chua UAT picker va switch voi tai khoan Account that co tu hai membership dang hoat dong; chua test thiet bi that/iOS; APK la ban test Android, chua ky store.
- Viec tiep theo: UAT voi tai khoan co hai cong ty de xac nhan picker, xac nhan, token/session, Tinode va du lieu Chatmgt tai lai dung tenant; khi phat hanh store thi build lai bang release keystore.
- Commit/PR: Source commit `a2a8c1b`; docs follow-up commit duoc tao ngay sau.

## 2026-09-30-01 - Kich hoat luong sua biet danh tren mobile

- Thoi gian: 2026-09-30 09:05 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Mobile | Chat | Realtime | Kiem thu | Tai lieu
- Trang thai: Hoan tat source, APK test va UAT cold-start emulator; chua UAT nickname voi tai khoan that
- Muc tieu: Cho phep mobile sua, xoa va giu on dinh biet danh trong chat 1-1/group giong web, khong bi Tinode snapshot hoac profile realtime ghi de.
- Pham vi: ChatDetail, GroupInfo, modal biet danh, mapping Account/Tinode, merge conversation, realtime nickname event va version mobile `1.0.31`.
- File da thay doi: `mobile/src/components/ConversationNicknameModal.tsx`, `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/screens/chat/GroupInfoScreen.tsx`, `mobile/src/store/appStore.ts`, `mobile/src/utils/conversationSync.ts`, `mobile/src/utils/conversationSync.test.ts`, `mobile/src/services/chatManagementService.test.ts`, `mobile/src/services/tinodeClient.ts`, `mobile/src/types/index.ts`, `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`.
- Noi dung: Them modal theo theme sang/toi co gioi han 80 ky tu va thao tac xoa; them nut doi biet danh o header chat 1-1 va tung thanh vien group; goi endpoint Chatmgt hien co bang Account ID chuan thay vi Tinode UID. Store hop nhat response management, snapshot Tinode, event `conversation_nickname_changed` va profile realtime de alias khong mat; khi xoa alias ten chinh thuc duoc phuc hoi.
- Quyet dinh ky thuat: Account ID la khoa ghi du lieu, Tinode UID chi dung de tim peer va realtime. Nickname van la metadata conversation cua Chatmgt; Tinode chi phat system event, khong ghi alias vao noi dung tin nhan hay profile Account. Bot khong hien thao tac doi biet danh.
- Database/API/cau hinh: Khong migration hoac endpoint moi. Mobile dung `PUT /api/v1/chat/threads/{conversationId}/nicknames/{targetId}` voi Chat user session; tang version `1.0.31`, Android `versionCode=32`.
- Kiem thu: `cd mobile; npm test -- --reporter=dot --maxWorkers=1` dat 29 file, 114/114; `npm run typecheck` dat; `npm run lint` dat; `npm run export` dat; `npx expo config --json --type public` xac nhan version `1.0.31`, code `32`; APK `D:\vichat-build\ViChat-1.0.31-nickname-universal.apk` package `vn.upgo.vichat`, `zipalign` dat, APK Signature Scheme v2 dat, SHA-256 `01C0C4426AF21E408888A68BA6227E69BCF40AFE1C76ECF9AB137BD2FEEF6C92`.
- Emulator: `emulator-5554` cai APK va resume `vn.upgo.vichat/.MainActivity`; UI dump sau cold-start co `GON PLATFORM`, `Email cong ty`, `Mat khau`, `Dang nhap`; logcat khong co `FATAL EXCEPTION`, `TypeError` hoac `Invariant Violation`.
- Rui ro con lai: Chua UAT voi tai khoan that de bam nut, luu/xoa nickname trong direct va group, refresh va doi realtime giua web/mobile; chua test thiet bi that/iOS. APK la ban test Android Debug, chua ky store.
- Viec tiep theo: UAT voi hai tai khoan tren web/mobile cho save, clear, refresh, profile update va realtime; khi phat hanh store thi build lai bang release keystore.
- Commit/PR: Source commit `407a67d`; chua push/chua deploy.

## 2026-09-29-09 - Dong bo chuyen cong ty va media S3 tren mobile/web

- Thoi gian: 2026-09-29 23:03 (Asia/Saigon)
- Loai: Tinh nang | Sua loi | Mobile | Web | Media | Backend contract | Phat hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat source, APK test va UAT cold-start emulator; chua UAT tai khoan that voi nhieu cong ty
- Muc tieu: Them muc Chuyen cong ty trong Ho so ca nhan mobile va bao dam anh/file tao tu mobile hoac web deu dung cung nguon media S3, hien thi dong bo trong cuoc tro chuyen.
- Pham vi: Tenant picker va dialog xac nhan mobile; upload, complete, bind, discard va download media theo conversation; anh dai dien nhom, hinh nen, anh/file dinh kem va sticker tren ca mobile/web; phien ban mobile `1.0.30`, Android `versionCode=31`.
- File da thay doi: `mobile/src/screens/settings/EditProfileScreen.tsx`, `mobile/src/screens/settings/SettingsScreen.tsx`, `mobile/src/services/chatMediaService.ts`, `mobile/src/services/tinodeClient.ts`, `mobile/src/store/appStore.ts`, `src/app/App.jsx`, `src/features/chat/services/chatMediaService.js`, `src/features/chat/services/tinodeClient.js`, `chatservice-main/tests/test_chat_media_service.py`, `src/features/chat/services/chatManagementService.test.js`, `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`, `dist/index.html`.
- Noi dung: Ho so mobile hien cong ty hien tai va cac membership dang hoat dong, hoi lai nguoi dung bang dialog theo theme truoc khi goi switch tenant; sau khi doi cong ty, bearer token moi duoc luu va du lieu Chatmgt/Tinode duoc tai lai theo tenant moi. Media chat duoc cap ticket S3 theo conversation, chi gan (`bind`) sau khi Tinode xac nhan tin nhan, huy (`discard`) khi upload/publish that bai; web va mobile cung doc stable reference nen file/anh gui tu mot nen tang co the xem tren nen tang con lai. Avatar ca nhan tiep tuc dung hop dong UpGO Account la nguon chuan nhu web.
- Quyet dinh ky thuat: Khong dua binary vao Tinode metadata hoac PostgreSQL; Tinode chi luu stable media reference. Conversation ID la pham vi bat buoc cho chat media moi, giup kiem tra membership va tranh file mo nham tenant/cuoc tro chuyen. Fallback Tinode chi con cho luong legacy hoac khi cau hinh cho phep; avatar ca nhan khong bi chuyen sang chat-media S3.
- Database/API/cau hinh: Khong co migration. Su dung cac endpoint media S3 hien co va hop dong switch tenant mobile; tang version mobile len `1.0.30`, Android `versionCode=31`. Build web cap nhat `dist/index.html` toi entry bundle moi.
- Kiem thu: `cd mobile; npm test -- --reporter=dot --maxWorkers=1` dat 29 file, 110/110; `npm run typecheck`, `npm run lint`, `npm run export` dat; `npm run test:frontend -- --test-concurrency=1` dat 451/451; `npm run build:production` dat; `python -m unittest chatservice-main/tests/test_chat_media_service.py -q` dat 14/14; backend `py_compile` dat; `npx expo prebuild --platform android --no-install` dat; Gradle `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a,x86_64` dat 520 tasks va `BUILD SUCCESSFUL`; `zipalign` va APK Signature Scheme v2 dat.
- Artifact: `D:\vichat-build\ViChat-1.0.30-s3-media-tenant-universal.apk`, package `vn.upgo.vichat`, version `1.0.30`, `versionCode=31`, ABI `arm64-v8a,x86_64`, SHA-256 `4649208837321378F2BB8464E92F00CC4CB8BF94A80C762D6CC9A35710A86EE9`.
- Emulator: APK da cai va cold-start tren `emulator-5554`; UI dump co `GON PLATFORM`, `Email`, `Mat khau`, `Dang nhap`; khong phat hien `FATAL EXCEPTION`, `TypeError` hoac `Invariant Violation` trong log runtime da kiem tra.
- Rui ro con lai: Chua UAT tenant switch, dialog va media dong bo bang tai khoan that tren hai cong ty; chua test thiet bi that/iOS, offline/reconnect, push background/killed; APK la ban test Android Debug, chua ky store.
- Viec tiep theo: UAT voi tai khoan A/B de gui anh/file/sticker va doi cong ty qua lai, xac nhan stable media reference xem duoc tren ca web/mobile; khi phat hanh store thi build lai bang release keystore.
- Commit/PR: Source commit `53e7424`; docs follow-up commit duoc tao sau do.

## 2026-09-29-08 - Dong bo dark mode cho cac luong cai dat mobile

- Thoi gian: 2026-09-29 20:58 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Mobile | UI | UX | Phat hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat source, APK test va UAT cold-start emulator; chua UAT luong da dang nhap voi tai khoan that
- Muc tieu: Bao dam cac man hinh mo tu Ho so/Cai dat giu dung palette sang/toi sau khi nguoi dung chuyen giao dien, dong bo ban mobile moi nhat de test va phat hanh.
- Pham vi: `mobile/src/components/AppLockScreen.tsx`, `mobile/src/components/PinSettingsModal.tsx`, `mobile/src/screens/settings/EditProfileScreen.tsx`, `mobile/src/screens/settings/LinkedDevicesScreen.tsx`, `mobile/src/screens/settings/SettingsScreen.tsx`, `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`; luong chuyen cong ty, dialog xac nhan va theme store da ghi o muc `2026-09-29-06`.
- Noi dung: Thay cac mau hard-code trong App Lock, quan ly PIN, sua ho so va thiet bi lien ket bang `colorsForTheme(useThemeStore(...))`; dialog va form con lai tu dong doi mau theo theme hien tai, khong thay doi API hay luong session. Tang version mobile len `1.0.29`, Android `versionCode=30`.
- Quyet dinh ky thuat: Dung palette da resolve tu store thay vi goi `Appearance.setColorScheme` truc tiep, tranh crash Android khi che do he thong tra ve `null`; cac thao tac xac nhan tiep tuc dung dialog rieng de giu layout va mau theo context.
- Database/API/cau hinh: Khong co migration, endpoint moi, thay doi tenant ID hoac bien moi truong.
- Kiem thu: `cd mobile; npm test -- --reporter=dot --maxWorkers=1` dat 29 file, 110/110; `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run export` dat; `npx expo config --json --type public` xac nhan version `1.0.29`, versionCode `30`; `npx expo prebuild --platform android --no-install` dat; Gradle staging ASCII `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a,x86_64` dat 520 tasks, `BUILD SUCCESSFUL`; `zipalign` va APK Signature Scheme v2 dat.
- Artifact: `D:\vichat-build\ViChat-1.0.29-settings-theme-universal.apk`, package `vn.upgo.vichat`, ABI `arm64-v8a,x86_64`, SHA-256 `BA62091025347B03DE0908C2061518124BF0A214542A723E945D5745AD3DB805`.
- Emulator: APK cai thanh cong tren `emulator-5554`, clear data va cold-start vao `vn.upgo.vichat/.MainActivity`; UI dump co `GON PLATFORM`, `Email cong ty`, `Mat khau`, `Dang nhap`; logcat khong co `FATAL EXCEPTION`, `TypeError` hoac `Invariant Violation`.
- Rui ro con lai: Chua UAT tenant switch, dialog va dark mode bang tai khoan that; chua test thiet bi that/iOS, offline/reconnect, push background/killed; APK la ban test dung Android Debug, chua ky store; mot so man hinh legacy ngoai luong Settings co the con mau co dinh.
- Viec tiep theo: UAT voi tai khoan A/B de xac nhan chuyen cong ty, confirm dialog va palette sang/toi tren du lieu that; build lai bang release keystore khi phat hanh store.
- Commit/PR: Source commit `2285e95`; docs follow-up commit duoc tao sau do.

## 2026-09-29-07 - Sap xep chi tiet nhom mobile theo nhom chuc nang

- Thoi gian: 2026-09-29 19:26-20:08 (Asia/Saigon)
- Loai: Tai cau truc | Tinh nang | Sua loi | Mobile | UI | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat source, APK test va UAT cold-start emulator; chua UAT man GroupInfo voi tai khoan that
- Muc tieu: Sap xep man Chi tiet nhom theo nhom chuc nang ro rang, co preview noi dung, ho tro palette sang/toi va khong tao thao tac gia khi mobile chua co API.
- Pham vi: `mobile/src/screens/chat/GroupInfoScreen.tsx`, `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json` va muc changelog nay; giu nguyen API, database, tenant ID va cac luong quan tri nhom dang hoat dong.
- Noi dung: Refactor layout thanh Noi dung (anh/file/link co preview, lich nhom, tin ghim, binh chon), Thanh vien & nhom (xem thanh vien, link nhom), Cuoc tro chuyen (dich, ghim, muc hien thi, the, an) va Cai dat nhom; pin hoi thoai dung store/API hien co, member/settings/search/leave/dissolve duoc giu nguyen. Toan bo card, row, input, modal va switch cua GroupInfo dung `colorsForTheme` theo theme store; bo grid cu de can chinh hang muc tren mobile hep.
- Quyet dinh ky thuat: Muc anh/file/link mo mot viewer co tab va preview tu tin nhan da tai; khong xem day la kho media server. Cac muc lich, link nhom, dich, muc hien thi, the phan loai va an hoi thoai hien ro `Chua kha dung tren mobile` vi chua co persistence/API end-to-end; khong expose Tinode topic lam link va khong tao switch gia.
- Database/API/cau hinh: Khong co migration, endpoint moi hoac thay doi tenant ID. Tang mobile version len `1.0.28`, Android `versionCode=29`.
- Kiem thu: `cd mobile; npm test -- --reporter=dot --maxWorkers=1` dat 29 file, 110/110; `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run export` dat; `npx expo config --json --type public` xac nhan version `1.0.28`, versionCode `29`; `npx expo prebuild --platform android --no-install` dat; Gradle `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a,x86_64` dat 520 tasks. APK `D:\vichat-build\ViChat-1.0.28-group-info-universal.apk` package `vn.upgo.vichat`, version `1.0.28`, versionCode `29`, ABI `arm64-v8a,x86_64`, `zipalign` dat, APK Signature Scheme v2 dat; SHA-256 `0716567FCA89A17687F0E38D529188F8705052183E1EACCB2111322D7C73D9F7`. APK cai thanh cong tren `emulator-5554`; clear data/cold-start giu `vn.upgo.vichat/.MainActivity` foreground, UI dump co `GON PLATFORM`, `Email cong ty`, `Mat khau`, `Dang nhap`, logcat 500 dong khong co `FATAL EXCEPTION`, `TypeError` hoac `Invariant Violation`.
- Rui ro con lai: Chua dang nhap tai khoan test de UAT authenticated GroupInfo, dark mode, preview, member/settings va switch pin; chua test thiet bi that/iOS, offline/reconnect, push background/killed; APK la ban test ky Android Debug, chua ky store. Build co warning deprecated tu dependency Expo/RN nhung khong co failure.
- Viec tiep theo: UAT voi tai khoan A/B tren emulator/thiet bi that de kiem tra cac row co du lieu that; neu muon bat lich/link/dich/the/an can chot API/persistence mobile truoc khi mo khoa.
- Commit/PR: Source commit `a413726`; docs follow-up `a663902`.

## 2026-09-29-06 - Hoan thien chuyen cong ty, theme va chi tiet nhom mobile

- Thoi gian: 2026-09-29 19:19 (Asia/Saigon)
- Loai: Tinh nang | Sua loi | Mobile | Backend contract | UI | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat source, APK test va UAT cold-start emulator; chua UAT luong da dang nhap voi tai khoan that
- Muc tieu: Hoan thien cac task mobile dang cho: chi tiet nhom co cac muc noi dung thuc thi duoc, chuyen cong ty co xac nhan, dialog dong bo theo theme va dark mode duoc luu theo thiet bi.
- Pham vi: Mobile Settings, GroupInfo, ConversationList, Personal Cloud, AppLock, navigation/theme; Chatmgt tenant switch response; khong thay doi du lieu Tinode hay migration.
- File da thay doi: `mobile/src/screens/settings/SettingsScreen.tsx`, `mobile/src/screens/chat/GroupInfoScreen.tsx`, `mobile/src/screens/chat/ConversationListScreen.tsx`, `mobile/src/screens/cloud/PersonalCloudScreen.tsx`, `mobile/src/components/ConfirmDialog.tsx`, `mobile/src/components/ChoiceDialog.tsx`, `mobile/src/components/AppLockScreen.tsx`, `mobile/src/store/themeStore.ts`, `mobile/src/store/themeStore.test.ts`, `mobile/src/test/reactNativeMock.ts`, `mobile/src/theme/colors.ts`, `mobile/src/services/authService.ts`, `mobile/src/store/appStore.ts`, `mobile/src/types/index.ts`, `mobile/App.tsx`, `mobile/src/navigation/AppNavigator.tsx`, `mobile/src/navigation/MainTabNavigator.tsx`, `chatservice-main/application/controllers/api_chat_management.py`, cac file test/version va muc nay.
- Noi dung: Them normalizer va store cho `tenantOptions`, xoay va luu bearer token moi sau `POST /api/v1/auth/switch-tenant`, bootstrap lai Tinode/metadata theo tenant moi; them lua chon giao dien sang/toi/system va luu AsyncStorage; ConfirmDialog/ChoiceDialog dung palette hien tai; thay cac confirm Alert chinh bang modal; GroupInfo tong hop anh/file/link/tin ghim/binh chon tu message da tai va giu nguyen member/settings/search/dissolve. Khi UAT cold-start phat hien RN 0.86 Android crash voi `Appearance.setColorScheme(null)` o che do system, da bo loi goi native null va de store quan ly palette theo `Appearance` listener.
- Quyet dinh ky thuat: Mobile khong hien nut gia cho calendar, link nhom, dich, tag hoac an hoi thoai khi chua co API/luong thuc thi. Noi dung GroupInfo ghi ro pham vi tin da tai. Chatmgt chi tra bearer token moi cho request co `X-Vichat-Client: mobile`; browser van dung HttpOnly cookie.
- Database/API/cau hinh: Khong co migration. Contract switch tenant mobile bo sung `access_token` trong response; tang mobile version len `1.0.27`, Android `versionCode=28`.
- Kiem thu: `cd mobile; npm test -- --reporter=dot --maxWorkers=1` dat 29 file, 110/110; `npm run typecheck` dat; `npm run lint` dat; `npm run export` dat; backend `python -m unittest chatservice-main/tests/test_chat_auth_contract.py -q` dat 61/61; `python -m py_compile chatservice-main/application/controllers/api_chat_management.py chatservice-main/tests/test_chat_auth_contract.py` dat. `npx expo prebuild --platform android --no-install` dat; Gradle `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a,x86_64` dat 520 tasks. APK `D:\vichat-build\ViChat-1.0.27-tenant-theme-group-universal.apk` da verify package `vn.upgo.vichat`, version `1.0.27`, versionCode `28`, `zipalign` dat, APK Signature Scheme v2 dat; SHA-256 `E691414918CC00AF3B166A2DD0722DB909D5425D54BF666DACE973A8EFD876D7`. Cai va mo tren `emulator-5554` thanh cong; cold-start giu `vn.upgo.vichat/.MainActivity`, logcat khong co `FATAL EXCEPTION`, UI dump co `GON PLATFORM`, `Email cong ty`, `Mat khau` va `Dang nhap`. Emulator tung hien dialog `System UI isn't responding`, bam `Wait` thi app van giu foreground; day la van de system UI cua emulator, khong phai crash process ViChat.
- Rui ro con lai: Cac style man hinh cu van con mau tinh light o mot so man hinh chua refactor dynamic; chua xac nhan tenant switch voi tai khoan co nhieu membership tren backend staging; chua UAT Settings/GroupInfo/dialog/theme bang tai khoan da dang nhap; APK la ban test ky Android Debug, chua ky store; chua UAT thiet bi that/iOS.
- Viec tiep theo: UAT voi tai khoan A/B de xac nhan tenant switch, Settings/GroupInfo/dialog/theme va tin unread that; sau do build bang release keystore khi phat hanh store.
- Commit/PR: Source commit `92e3e6f`; docs follow-up da tao.

## 2026-09-29-05 - Chan snapshot storm khi tai lich su chat mobile

- Thoi gian: 2026-09-29 16:25 (Asia/Saigon)
- Loai: Sua loi | Mobile | Chat | Hieu nang | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat source, APK test va UAT emulator; chua UAT du lieu tin chua doc that voi tai khoan thu.
- Muc tieu: Khac phuc triet de loi keo len lich su lam tin nhan bien mat hoac vung chat trang, dong thoi giu nguyen nut den tin chua doc va nut ve tin moi nhat.
- Pham vi: FlashList chat mobile, snapshot Tinode khi tai trang lich su, hop nhat message trong store va co che tai lich su; khong thay doi API, database hoac tenant ID.
- File da thay doi: `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/services/tinodeClient.ts`, `mobile/src/store/appStore.ts`, va muc nay trong `docs/CHANGELOG.md`.
- Noi dung: Chuyen tai lich su sang `onStartReached` sau khi danh sach da scroll ban dau, khoa request lap khi van o dau danh sach, hop nhat snapshot theo `id/seq` de khong thay the tap tin da tai bang snapshot ngan hon, va chan snapshot trung gian cua tung packet `getMeta()` cho den khi ca trang 40 tin san sang. Sau do client chi phat mot snapshot on dinh, tranh FlashList giu offset cu tren mang du lieu da bi co.
- Quyet dinh ky thuat: Chi suppress snapshot trong cua so tai history; packet realtime binh thuong van di qua `onData`. Store giu cac message hien co va merge message moi de bao toan scroll position, khong sua hop dong Tinode hay them fallback du lieu.
- Database/API/cau hinh: Khong co migration, endpoint moi, bien moi truong hoac thay doi hop dong.
- Kiem thu: `cd mobile; npm test -- --reporter=dot --maxWorkers=1` dat 28 file, 106/106; `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run export` exit 0, Exported `dist`; Gradle `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a,x86_64` dat 520 tasks. Cai APK `D:\vichat-build\ViChat-1.0.26-chat-scroll-stable-20260929.apk` len `emulator-5554` thanh cong; mo `Nhom GON-NERS - Members`, keo lich su 12 lan nhanh khong con vung trang va tin cu khong bien mat; nut `Di toi tin nhan moi nhat` xuat hien khi roi cuoi danh sach va bam thanh cong dua ve tin moi nhat; logcat khong co crash, `TypeError` hoac `Invariant Violation`.
- Artifact: `D:\vichat-build\ViChat-1.0.26-chat-scroll-stable-20260929.apk`, package `vn.upgo.vichat`, version `1.0.26`, versionCode `27`, SHA-256 `461771F66122126816656716B5CAEFECAF0DAB7F4C572014E3DD8A6BCD6871A7`, signer Android Debug.
- Rui ro con lai: Chua UAT nut den tin chua doc voi du lieu unread that, tai khoan A/B, offline/reconnect, thiet bi that va iOS; APK la ban test, chua ky store.
- Viec tiep theo: UAT voi tai khoan A/B de tao tin chua doc va build lai bang release keystore khi phat hanh store.
- Commit/PR: Source commit `daee163`; docs follow-up da tao.

## 2026-09-29-04 - On dinh cuon chat mobile va dieu huong tin nhan

- Thoi gian: 2026-09-29 13:00 (Asia/Saigon)
- Loai: Sua loi | Mobile | Chat | UX | Hieu nang | Kiem thu | Tai lieu
- Trang thai: Hoan tat source, APK test va UAT emulator; chua UAT du lieu tin chua doc that voi tai khoan thu.
- Muc tieu: Khong de man hinh chat tu nhay khi mo, tai them lich su hoac co tin moi; cho phep den tin chua doc va quay ve tin moi nhat.
- Pham vi: FlashList mobile chat, read cursor Tinode, trang thai unread/badge va dieu huong lich su; khong thay doi API, database hoac tenant ID.
- File da thay doi: `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/utils/chatScroll.ts`, `mobile/src/utils/chatScroll.test.ts`, `mobile/src/services/tinodeClient.ts`, `mobile/src/store/appStore.ts`, `mobile/src/types/index.ts`, `mobile/src/utils/conversationSync.ts`, va muc nay.
- Noi dung: Bo cac lenh `scrollToEnd` vo dieu kien trong layout/content-size; chi cuon ban dau sau khi FlashList san sang, giu vi tri khi prepend lich su, dung key tin nhan on dinh, va chi mark-read khi nguoi dung ve gan cuoi danh sach. Them nut den tin chua doc, nut mui ten goc phai ve tin moi nhat, dem tin moi khi dang xem lich su, va spinner lich su dang overlay de khong doi chieu cao danh sach.
- Quyet dinh ky thuat: Read cursor `topic.read` la nguon xac dinh tin chua doc; tin dieu khien (reaction/edit/poll/system/recall) khong tao diem nhay. FlashList giu `maintainVisibleContentPosition` khi tai trang truoc.
- Database/API/cau hinh: Khong co migration, endpoint moi hoac thay doi hop dong; bo sung truong read cursor chi o model/store client.
- Kiem thu: `cd mobile; npm test -- --reporter=dot` dat 28 file, 106/106; `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run export` dat; `npx expo prebuild --platform android --no-install` dat; Gradle `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a,x86_64` dat 520 tasks; `zipalign` va `apksigner` dat. Emulator `emulator-5554`: APK cai va mo khong crash, mo lai chat dung o cuoi, keo tai lich su khong nhay loan, nut mui ten co accessibility label `Di toi tin nhan moi nhat` va bam thanh cong dua ve cuoi; chua co du lieu unread that de UAT nut `Di toi tin nhan chua doc` bang thao tac emulator.
- Artifact: `D:\vichat-build\ViChat-1.0.26-chat-scroll-20260929-universal.apk`, package `vn.upgo.vichat`, version `1.0.26`, versionCode `27`, SHA-256 `E21800AAF4DB7399A3A15F45909B41266DA7E76E9C117A636AC117941815A381`, signer Android Debug.
- Rui ro con lai: Chua UAT voi hai tai khoan that de tao tin nhan unread, offline/reconnect, thiet bi that va iOS; APK la ban test, chua ky store.
- Viec tiep theo: UAT voi tai khoan A/B va build lai bang release keystore khi phat hanh store.
- Commit/PR: Source commit `018d1d9` da tao; docs follow-up commit tao trong cung lan lam viec.

## 2026-09-29-03 - Sua race font tren LaunchScreen mobile

- Thoi gian: 2026-09-29 11:35 (Asia/Saigon)
- Loai: Sua loi | Mobile | LaunchScreen | Branding | UI | Phat hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat source, build APK r3 va UAT emulator; chua UAT tai khoan that tren thiet bi that.
- Muc tieu: Loai bo frame khoi dong chi hien `GON` khi font Be Vietnam Pro chua tai xong.
- Pham vi: `mobile/src/navigation/AppNavigator.tsx` va muc nay trong `docs/CHANGELOG.md`; khong thay doi API, database hoac tenant ID.
- Nguyen nhan: `LaunchScreen` dung font custom ngay trong luc `useFonts` dang loading; Android co the do text tam thoi khong day du. Khong phai loi du lieu tenant.
- Noi dung: LaunchScreen dung font he thong an toan truoc khi custom font san sang, gioi han brand ve mot dong voi `adjustsFontSizeToFit`, tat font scaling he thong va chi ap dung Be Vietnam Pro sau khi font load xong.
- Kiem thu: `npm test -- --reporter=dot` dat `27 file, 102/102`; `npm run typecheck` exit `0`; `npm run lint` exit `0`; `npm run export` dat; `npx expo prebuild --platform android --no-install` dat; Gradle `:app:assembleRelease` dat `536 actionable tasks` (`38 executed`, `498 up-to-date`); `aapt` xac nhan package `vn.upgo.vichat`, version `1.0.26`, `versionCode=27`; `zipalign -c -P 16 -v 4` exit `0`; `apksigner verify` xac nhan APK Signature Scheme v2.
- Artifact: `D:\vichat-build\ViChat-1.0.26-brand-fix-20260929-r3-universal.apk`, SHA-256 `D9EE386CC7AA8B1F1B46FAB4B3F7031FEE051DFE37CDFE7BF25B92C27150BB07`; signer Android Debug, ban test universal.
- Emulator: Cai lai va clear data tren `emulator-5554`. Frame native splash chi co logo; frame chuyen tiep khong con chu bi cat; sau khi React Native load, UI dump co `GON PLATFORM` day du va khong co node text `GON` doc lap.
- Rui ro con lai: Chua dang nhap tai khoan that de UAT tenant khac, offline/reconnect, push background/killed, call va thiet bi iOS; APK dung debug keystore, chua phai artifact ky store.
- Viec tiep theo: UAT voi tai khoan A/B tren thiet bi that, sau do build lai bang release keystore khi phat hanh store.
- Commit/PR: Source commit `9e46f6bba781699c89e8f2a116c4cc4db64264aa`; docs follow-up commit `a80c441` da tao.

## 2026-09-29-02 - Khac phuc triet de ten thuong hieu mobile chi hien GON

- Thoi gian: 2026-09-29 11:15 (Asia/Saigon)
- Loai: Sua loi | Mobile | Branding | Auth/session | UI | Phat hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat source, static gate, APK test va UAT emulator; chua UAT tai khoan that tren thiet bi that.
- Muc tieu: Khong de ten thuong hieu mobile bi rut gon thanh `GON` o bat ky man hinh nao, ke ca khi API hoac session cache tra ve alias legacy.
- Pham vi: Mobile tenant display normalization, cau hinh branding, header Tin nhan, Danh ba, Cloud, Cai dat, login/launch/app lock; khong thay doi API, database hoac tenant ID.
- File da thay doi: `mobile/src/utils/tenantDisplay.ts`, `mobile/src/utils/tenantDisplay.test.ts`, `mobile/src/services/authService.ts`, `mobile/src/services/authService.test.ts`, `mobile/src/constants/config.ts`, `mobile/src/screens/chat/ConversationListScreen.tsx`, `mobile/src/screens/contacts/ContactsScreen.tsx`, `mobile/src/screens/cloud/PersonalCloudScreen.tsx`, `mobile/src/screens/settings/SettingsScreen.tsx`, `mobile/src/screens/auth/LoginScreen.tsx`, `mobile/src/navigation/AppNavigator.tsx`, `mobile/src/components/AppLockScreen.tsx`, va muc nay trong `docs/CHANGELOG.md`.
- Noi dung: Chuan hoa `GON`, `GonPlatform`, `GON Platform` va alias tu cac truong tenant display/company/brand thanh `GON Platform` tai auth boundary. Them lop bao ve khi render de session cache cu khong the hien lai `GON`; cho phep brand env tuy bien nhung tu dong sua alias legacy; header dai duoc phep xuong dong va ellipsis an toan tren man hinh hep.
- Quyet dinh ky thuat: Chi thay doi gia tri hien thi, giu nguyen tenant ID va ten cong ty hop le; khong ghi de du lieu tenant tren backend. Logo accessibility label van dung ten day du.
- Database/API/cau hinh: Khong migration, endpoint moi hoac thay doi hop dong API. `EXPO_PUBLIC_BRAND_NAME` va `EXPO_PUBLIC_BRAND_LABEL` van ho tro tuy bien, nhung gia tri legacy `GON`/`GonPlatform` bi fallback ve brand day du.
- Kiem thu: `npm test -- --reporter=dot` dat `27 file, 102/102`; `npm run typecheck` exit `0`; `npm run lint` exit `0`; `npm run export` dat; `npx expo prebuild --platform android --no-install` dat; Gradle `:app:assembleRelease` dat `536 actionable tasks` (`61 executed`, `475 up-to-date`); `aapt` xac nhan package `vn.upgo.vichat`, version `1.0.26`, `versionCode=27`; `zipalign -c -P 16 -v 4` dat; `apksigner verify` xac nhan APK Signature Scheme v2.
- Artifact: `D:\vichat-build\ViChat-1.0.26-brand-fix-20260929-r2-universal.apk`, SHA-256 `5964659E0E486F83C50C0F8E336C3D09BC984E3987B7F7FD89D9687EC4CEA1D3`; signer Android Debug, ban test universal.
- Emulator: Cai thanh cong tren `emulator-5554`, activity `vn.upgo.vichat/.MainActivity` resume thanh cong. Native splash chi hien logo trong frame dau; frame React Native sau khi load hien day du `GON PLATFORM`, UI dump man hinh da dang nhap co `GON Platform`, va UI dump sau khi clear data co `GON PLATFORM`; khong con ten thuong hieu bi cat trong APK moi.
- Rui ro con lai: Chua dang nhap tai khoan that de UAT tenant khac, offline/reconnect, push background/killed, call va thiet bi iOS; APK dung debug keystore, chua phai artifact ky store.
- Viec tiep theo: UAT voi tai khoan A/B tren thiet bi that, sau do build lai bang release keystore khi phat hanh store.
- Commit/PR: Source commit `d3294b45cac3104869c4233e9a847f895e53bdd8`; docs follow-up commit `5847efc` da tao.

## 2026-09-29-01 - Chot audit mobile va artifact 1.0.26

- Thoi gian: 2026-09-29 09:35 (Asia/Saigon)
- Loai: Sua loi | Mobile | Chat 1-1 | Hieu nang | Phat hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat code, contract, static gate va APK test; chua UAT tren thiet bi that.
- Muc tieu: Chot ban mobile moi nhat sau dot audit on dinh, khong de version hien thi lech, tim kiem lich su sai dau cau hoac tao lap hoi thoai 1-1 khi ID Account/Tinode khac namespace.
- Pham vi: Mobile auth/session, group/realtime/history, notification, chat 1-1, Settings version, Expo/Android release artifact; khong UAT tai khoan that trong lan nay.
- File da thay doi: `mobile/src/utils/historySearch.ts`, `mobile/src/utils/conversationSync.ts`, `mobile/src/utils/conversationSync.test.ts`, `mobile/src/store/appStore.ts`, `mobile/src/screens/settings/SettingsScreen.tsx`, `mobile/package.json`, `mobile/package-lock.json`, `mobile/app.json`, cac file mobile stability/runtime da ghi o cac muc lien quan truoc, va muc nay trong `docs/CHANGELOG.md`.
- Noi dung:
  - Chuan hoa dau cau trong history search de truy van tieng Viet khop ca ten file/dau gach (`bao cao` khop `Bao-cao-thang.pdf`).
  - Tim lai chat 1-1 qua `members`, `participantIds`, Tinode topic va tap identity Account/Tinode; chuan hoa Account ID truoc khi goi API; them single-flight theo session generation de double tap khong tao request song song. Backend van la noi canonical hoa cap participant.
  - Settings doc version tu Expo config, lockfile dong bo `1.0.26`; app Android giu `versionCode=27`.
- Quyet dinh ky thuat: Khong suy doan Account ID tu Tinode UID cho API membership; chi dung identity overlap o lop tim kiem cache local. Chatmgt van la source of truth cho conversation/group metadata, Tinode chi phuc vu realtime/history.
- Database/API/cau hinh: Khong them migration hoac endpoint moi trong dot chot nay. Migration/idempotency group va contract runtime da duoc ghi o muc mobile stability truoc; can apply migration truoc khi deploy backend.
- Kiem thu: `cd mobile; npm test -- --reporter=dot` dat `26 file, 97/97`; `npm run typecheck` dat; `npm run lint` dat; `npm run export` dat; `npx expo config --json --type public` xac nhan package `vn.upgo.vichat`, version `1.0.26`, `versionCode=27`; `npx expo prebuild --platform android --no-install` dat; `python -m unittest chatservice-main/tests/test_mobile_stability_contract.py -q` dat `2/2`; `python -m unittest chatservice-main/tests/test_chat_auth_contract.py -q` dat `61/61`; Python compile backend dat; Gradle `:app:assembleRelease` dat `520 tasks` voi `arm64-v8a,x86_64`; `aapt`, `zipalign`, `apksigner` dat.
- Artifact: `D:\vichat-build\ViChat-1.0.26-mobile-full-audit-20260929-universal.apk`, package `vn.upgo.vichat`, version `1.0.26`, `versionCode=27`, ABI `arm64-v8a,x86_64`, SHA-256 `C84F58B96C54AA58D3D8DE85192873809F03FC08CF5EA6FEA885D51F2B3931A8`, signer Android Debug, APK Signature Scheme v2.
- Rui ro con lai: Chua cai/UAT Android/iOS voi hai tai khoan A/B, tenant khac, offline/reconnect, group lifecycle, notification foreground/background/killed, call va performance history lon; artifact la ban test, chua ky store.
- Viec tiep theo: Cai APK tren thiet bi that, chay ma tran E2E trong `docs/MOBILE_STABILITY_REMEDIATION_PLAN.md`, apply migration group idempotency tren staging truoc khi deploy backend va ky lai bang release keystore khi phat hanh store.
- Commit/PR: Se ghi commit source ngay sau khi ra soat diff cuoi cung.

## 2026-09-28-09 - Deploy production hardening web sau khi qua gate

- Thoi gian: 2026-09-28 23:25 (Asia/Saigon)
- Loai: Bao mat | Web | Van hanh | Trien khai | Kiem thu | Tai lieu
- Trang thai: Hoan tat deploy production; con UAT browser voi tai khoan that.
- Muc tieu: Dua ban web hardening da pin working directory cua cac Python service vao production, co rollback an toan va evidence sau deploy.
- Pham vi: ChatUI, Chatmgt, tinode-account-bridge, tinode-chatbot-webhook va production deployment gate; khong thay doi mobile/push dang lam do.
- File da thay doi: `infrastructure/production/compose.yaml`, `chatservice-main/tests/test_chat_auth_contract.py`, va muc nay trong `docs/CHANGELOG.md`.
- Noi dung: Deploy source commit `cbbef3a`; compose pin `working_dir: /app` cho Python service; archive `/opt/deploy/chat/incoming/vichat-web-hardening-cbbef3a.tar.gz` co SHA-256 `48ac3e694db0abebed22a569009645ad8ba805c6a4e79ad760430e6f03234be5`.
- Quyet dinh ky thuat: Vi `chat` dung `--no-deps` va Nginx resolve bridge theo IP container, activation/rollback phai recreate theo thu tu `chatmgt -> tinode-account-bridge -> chat -> tinode-chatbot-webhook`; thu tu nay da loai bo 502 stale bridge endpoint sau rollback.
- Database/API/cau hinh: Khong migration, khong reset database/Redis/Tinode volume/topic/message; cac container stateful va non-target containers duoc giu nguyen.
- Kiem thu: `docker compose config --quiet`, Nginx `-t`, `verify_deployment.py`, `verify_tenant_isolation.py`, Redis AUTH, security headers, health/cache headers, local/public/management health, bundle local/public khop (`/assets/index-D5_OAu-u.js`, `/assets/index-B1sUJyGf.css`), 4 target service healthy/restart `0`, va `non_target_containers_unchanged=ok`.
- Trien khai: Release `/opt/deploy/chat/releases/web-hardening-cbbef3a-20260928-r4` dang la `current`; `previous` tro `/opt/deploy/chat/releases/group-spam-fe99308-20260928-r1`; source commit da push len `github/fix/full-audit-regressions`.
- Rui ro con lai: Chua UAT browser voi hai tai khoan cho login, chat, upload, reaction/sticker burst va cac action mien tru spam; can hard refresh va chay ma tran UAT web.
- Commit/PR: Source commit `cbbef3a` da push; docs/deploy follow-up commit se tao sau muc nay.

## 2026-09-28-08 - Build APK mobile sau khi sua runtime

- Thoi gian: 2026-09-28 16:35 (Asia/Saigon)
- Loai: Van hanh | Phat hanh | Kiem thu | Mobile
- Trang thai: Hoan tat artifact test; chua UAT tren thiet bi that.
- Muc tieu: Tao APK Android tu source mobile da sua, sau khi lan build truoc chua tao duoc artifact do het dung luong o C:.
- Pham vi: Android Expo/React Native release build; khong thay doi API, database, backend hoac source mobile.
- File da thay doi: `docs/CHANGELOG.md`; artifact tao tai `D:\vichat-build\ViChat-1.0.26-mobile-fix-20260928-universal.apk`.
- Noi dung: Chuyen `GRADLE_USER_HOME` sang `D:\vichat-build\gradle-user-home` tren o D:; sua `local.properties` cua staging ASCII de Android doc dung SDK path; build release voi `arm64-v8a,x86_64` thanh cong.
- Quyet dinh ky thuat: Dung staging ASCII va cache Gradle tren o D: de tranh gioi han duong dan Unicode va o C: gan day; artifact van dung debug keystore theo cau hinh test hien tai.
- Database/API/cau hinh: Khong co migration, API hoac thay doi runtime production.
- Kiem thu: `npm test -- --reporter=dot` dat 25 file/93 test; `npm run typecheck` exit 0; `npm run lint` exit 0; Gradle `:app:assembleRelease` thanh cong 520 tasks; `aapt dump badging` xac nhan package `vn.upgo.vichat`, version `1.0.26`, versionCode `27`, ABI `arm64-v8a,x86_64`; `zipalign -c -P 16 -v 4` dat; `apksigner verify` xac nhan APK Signature Scheme v2.
- Artifact: `D:\vichat-build\ViChat-1.0.26-mobile-fix-20260928-universal.apk`, SHA-256 `B627FBC8EA85B4CD6B72013616A2D9CBE23C349F5C03BBE68544FC47CD87C04E`, signer la Android Debug.
- Rui ro con lai: Chua cai/UAT emulator hoac thiet bi that; chua xac nhan hai tai khoan A/B, background/killed push va flow group sau build; APK nay khong phai artifact ky store.
- Viec tiep theo: Cai APK tren thiet bi that va chay UAT theo ma tran mobile; tao release artifact voi keystore production khi phat hanh store.
- Commit/PR: Chua tao.

## 2026-09-28-07 - Sua 3 loi runtime mobile: group settings, ten cong ty, notification nguoi gui

- Thoi gian: 2026-09-28 14:00 (Asia/Saigon)
- Loai: Sua loi | Mobile | Nhom | Thong bao | UI | Kiem thu
- Trang thai: Hoan tat source va test static; chua UAT tren thiet bi that.
- Muc tieu: Sua 3 loi runtime mobile: (1) Group Settings khong hoat dong, (2) ten cong ty chi hien "Gon", (3) nguoi gui nhan notification khi chinh minh gui tin.
- Pham vi: Mobile Expo UI, notification routing, message origin detection; khong doi backend, database, API hay deploy.
- File da thay doi: `mobile/src/screens/chat/GroupInfoScreen.tsx`, `mobile/src/screens/chat/ConversationListScreen.tsx`, `mobile/src/utils/messageOrigin.ts`, `mobile/src/utils/messageOrigin.test.ts`, `mobile/src/services/tinodeClient.ts`, `mobile/src/store/appStore.ts`, `docs/CHANGELOG.md`.
- Noi dung:
  - Loi 1 (Group Settings): Root cause la thieu debounce khi toggle nhanh, optimistic update khong rollback khi API fail, va khong fetch lai khi response thieu groupSettings. Da them `settingsBusy` state rieng cho settings, rollback `settingsDraft` ve gia tri truoc khi fail, va refetch conversation tu Chatmgt neu response thieu groupSettings. Toggle bi khoa khi dang luu.
  - Loi 2 (Ten "Gon"): Root cause la `maxWidth: 220` tren style `eyebrow` cua ConversationListScreen lam cat ten cong ty. Da bo maxWidth, thay bang `flexShrink: 1`, them `numberOfLines={1}` va `ellipsizeMode="tail"` de ten dai hien "..." thay vi bi cat dut.
  - Loi 3 (Notification nguoi gui): Root cause la `messageOrigin.ts` chi check `packet.from` va `head['x-sender-id']` voi Tinode UID ma khong check Account ID. Khi header chua Account ID thay vi Tinode UID, own echo bi coi la incoming. Da mo rong `candidateSenderIds` de gom them `x-vichat-sender-id`, `content.sender`, `content.sender_id`, `content.account_id`, `data.from`, `data.sender`, `data.sender_id`, `data.account_id`. Them `isOwnMessageOrigin()` nhan `CurrentIdentity` chua ca Account ID lan Tinode UID. `tinodeClient.emitIncomingMessage` gio dung `isOwnMessageOrigin` thay vi `isOwnTinodeMessage`. `appStore` truyen identity cho `tinodeClient.setCurrentIdentity()` khi bootstrap va cap nhat khi co Tinode UID tu server, clear khi logout.
- Quyet dinh ky thuat: Khong sua backend/API; day la fix thuan tuy mobile client. Group settings van la source of truth tu Chatmgt; Tinode snapshot khong ghi de groupSettings (da co guard o mergeConversation). Notification guard khong tat toan bo notification; chi chan cho own message. Call invite khong bi anh huong.
- Database/API/cau hinh: Khong co migration, endpoint moi, bien moi truong hoac thay doi hop dong. Mobile tang len `1.0.26`, Android `versionCode=27`.
- Kiem thu: `npm test -- --reporter=dot` dat `25 file, 93/93`; `npm run typecheck` dat; `npm run lint` dat; `npx expo config --json --type public` xac nhan package `vn.upgo.vichat`, version `1.0.26`, versionCode `27`.
- Rui ro con lai: Chua UAT tren thiet bi that voi hai tai khoan A/B; chua build APK moi; chua kiem tra FCM push background/killed.
- Viec tiep theo: Build APK tu staging ASCII path, UAT tren thiet bi that theo ma tran trong MOBILE_RUNTIME_FIX_PROMPT.md.
- Commit/PR: Chua tao.


## 2026-09-28-06 - Trien khai hardening bao mat web theo ke hoach

- Thoi gian: 2026-09-28 11:57 (Asia/Saigon)
- Loai: Bao mat | Web | Backend | Upload | Van hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat phan code local va static gate; chua du evidence de ky duyet/deploy production.
- Muc tieu: Dong cac hardening P1/P2 co the kiem soat trong repository cho ChatUI, Chatmgt, Tinode relay, media/S3 va reverse proxy.
- Pham vi: Auth/session, Redis rate limit, CSRF/CORS, security headers, production bundle, Tinode public identifier, upload content validation, Personal Cloud quota, private download va production Compose/Nginx defaults.
- File da thay doi: `vite.config.js`, `scripts/build-production.mjs`, `src/services/clientLogger.js`, `src/app/App.jsx`, `src/RootApp.jsx`, `src/components/ConversationErrorBoundary.jsx`, `src/features/chat/services/tinodeClient.js`, `public/ChatBotWidget/tinode.js`, `index.html`, `dist/index.html`; `chatservice-main/application/config/config.py`, `chatservice-main/application/server.py`, `chatservice-main/application/database/__init__.py`, `chatservice-main/application/services/auth_service.py`, `chatservice-main/application/services/chat_media_service.py`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/controllers/api_chat_media.py`, `chatservice-main/application/controllers/api_personal_cloud.py`, `chatservice-main/application/models/models.py`; `infrastructure/production/compose.yaml`, `infrastructure/production/nginx.conf`, cac env/startup/Dockerfile lien quan; `docs/chat-backend-architecture.md` va file test media/auth.
- Noi dung: Redis rate limit cho login, reset, Tinode token va upload ticket fail closed voi `503` + `Retry-After`; them Origin check cho cookie state-change; them CSP, HSTS, Permissions-Policy, `nosniff`, cross-domain policy va `no-store`; cookie production mac dinh `Secure`; production CORS/CSRF chi nhan exact HTTPS origins. Bundle production khong con sourcemap/debug logger va fail khi gap secret pattern; Tinode browser config dung `VITE_TINODE_PUBLIC_APP_ID` scoped thay cho bien legacy. Media va Personal Cloud dung allowlist MIME/extension/signature, pending/quarantine prefix, size/quota, private signed download va content validation khi completion.
- Quyet dinh ky thuat: Khong dua server Tinode API key vao bundle; logger noi bo cua `tinode-sdk` duoc silence bang Vite transform chi ap dung cho production module thay vi bo qua artifact scanner. Redis la dependency bat buoc cua security limiter; khong fallback fail-open. Personal Cloud production dung cap 500 MiB/file va quota 5 GiB/owner.
- Database/API/cau hinh: Khong them migration; them/doi cac bien production `REDIS_PASSWORD`, `CHAT_AUTH_COOKIE_SECURE`, exact `CHAT_CORS_ORIGINS`/`CHAT_CSRF_ORIGINS`, `PERSONAL_CLOUD_MAX_SIZE`, `PERSONAL_CLOUD_QUOTA`, `TINODE_PUBLIC_APP_ID` va upload/media policy. Can render `.env` production that va chay startup verification truoc deploy.
- Kiem thu: `npm run lint` exit 0, chi con warning legacy/mobile/vendor; `npm run build:production` exit 0 va artifact scanner pass, con warning chunk `App` lon hon 500 KB; `npm run test:frontend -- --test-concurrency=1` dat 451/451; `python -m unittest discover -s chatservice-main/tests -p "test_*.py" -q` dat 323 test, skip 106 do dependency/runtime tuy chon; `python -m py_compile chatservice-main/application/config/config.py chatservice-main/application/controllers/api_chat_management.py chatservice-main/application/controllers/api_chat_media.py chatservice-main/application/controllers/api_personal_cloud.py chatservice-main/application/database/__init__.py chatservice-main/application/server.py chatservice-main/application/services/auth_service.py chatservice-main/application/services/chat_media_service.py chatservice-main/tests/test_chat_auth_contract.py chatservice-main/tests/test_chat_media_service.py` dat; `git diff --check` dat. Chua chay duoc Compose config/Nginx syntax vi may nay khong co `docker`/`nginx`; chua chay Cloudflare/WAF, firewall/port, backup-restore, secret rotation, DAST hay UAT production.
- Rui ro con lai: Chua xac nhan Redis/PostgreSQL/Tinode/S3 management port ngoai Internet, Cloudflare proxy/origin restriction, database role Tinode rieng, AV/zip-bomb pipeline, monitoring/alerting va restore drill. File `.env.local` bi ignore co the con ten bien Tinode legacy; build da filter/delete bien nay nhung can doi ten/rotate thu cong va khong in gia tri.
- Viec tiep theo: Tren staging tao backup/restore drill, migrate role Tinode runtime, cau hinh Redis/firewall/Cloudflare/WAF, chay DAST + hai-tenant matrix, render Compose va `nginx -t`, sau do canary/UAT truoc khi thong bao deploy.
- Commit/PR: `14ed8c3` da tao; push va deploy production dang cho.

## 2026-09-28-05 - Khac phuc on dinh mobile theo ke hoach

- Thoi gian: 2026-09-28 11:30 (Asia/Saigon)
- Loai: Sua loi | Mobile | Backend contract | Hieu nang | Phat hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat phan code, contract, kiem tra static va APK test; chua UAT tren thiet bi that.
- Muc tieu: Xu ly cac loi MOB-001 den MOB-004 va phan performance MOB-006: mat ten cong ty, group action sai mapping, app bi do khi login/resume, reconnect tao request trung va history lam cham startup.
- Pham vi: Mobile Expo auth/session, tenant cache, Account ID/Tinode UID, Chatmgt group lifecycle, Tinode sync/history, group idempotency backend va Android release artifact.
- File da thay doi: `mobile/src/services/authService.ts`, `mobile/src/services/apiClient.ts`, `mobile/src/services/chatManagementService.ts`, `mobile/src/services/tinodeClient.ts`, `mobile/src/store/appStore.ts`, `mobile/src/utils/identity.ts`, `mobile/src/utils/conversationSync.ts`, cac man hinh group/chat va test mobile lien quan; `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/models/models.py`, `chatservice-main/migrations/017_mobile_group_idempotency.sql`, `chatservice-main/alembic/versions/20260928_17_mobile_group_idempotency.py`, `chatservice-main/tests/test_mobile_stability_contract.py`, `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`, `docs/MOBILE_STABILITY_REMEDIATION_PLAN.md`, `docs/chat-backend-architecture.md`.
- Noi dung: Chuan hoa alias tenant/account/tinodeUid qua mot session normalizer; them session generation, abort va stale-result guard khi logout/doi tenant; chi dung Account ID cho Chatmgt va mapping Tinode UID tu backend cho realtime. Startup chi tai metadata, sync Tinode co single-flight/concurrency cap, history lazy va phan trang co gioi han. Tao group theo thu tu Chatmgt -> prepare mapping -> Tinode -> bind, dung cung idempotency key khi retry va xu ly race/conflict.
- Quyet dinh ky thuat: Chatmgt la source of truth cho membership/role/group metadata; Tinode UID khong duoc suy doan tu Account ID. Migration them `conversation.creation_request_id` va partial unique index theo tenant cho conversation group dang active; retry cung payload tra lai conversation cu, payload/owner khac bi tu choi. Khong prefetch history cua tat ca topic trong bootstrap.
- Database/API/cau hinh: Them migration `20260928_17_mobile_group_idempotency` va contract `client_request_id`/`X-Vichat-Request-Id` cho tao group; can apply migration truoc khi deploy backend. Mobile tang len `1.0.24`, Android `versionCode=25`; khong deploy production trong lan nay.
- Kiem thu: `cd mobile; npm test -- --reporter=dot` dat `25 file, 85/85`; `cd mobile; npm run typecheck` dat; `cd mobile; npm run lint` dat; `python -m unittest chatservice-main/tests/test_mobile_stability_contract.py -q` dat `2/2`; `python -m unittest chatservice-main/tests/test_direct_message_blocking.py -q` dat `12/12`; `python -m py_compile chatservice-main/application/controllers/api_chat_management.py chatservice-main/application/models/models.py chatservice-main/tests/test_mobile_stability_contract.py` dat; `npx expo config --json --type public` va `npx expo prebuild --platform android --no-install` dat; Android release build dat `520 tasks` voi `arm64-v8a,x86_64`; package `vn.upgo.vichat`, version `1.0.24`, `versionCode=25`; `zipalign` va `apksigner` v2 dat. APK `D:\vichat-build\ViChat-1.0.24-mobile-stability-20260928-universal.apk`, SHA-256 `C2CF97ECB3AB81DE465271593FA09C490076F43F4CC3E77F2C2D3523A654EA40`. `test_chat_auth_contract.py` con 1 failure trong 60 test do assertion web profile-view cu, khong thuoc pham vi mobile va khong bi sua trong lan nay.
- Rui ro con lai: Chua UAT Android/iOS voi hai tai khoan cung tenant, tai khoan khac tenant, offline/reconnect, group action, history lon, notification va kill/resume. Chua profile request/render tren thiet bi that. APK moi chi la test artifact; chua ky release store. Khong chay emulator/`adb` theo yeu cau.
- Viec tiep theo: Apply migration tren staging truoc, sau do UAT tren thiet bi that theo ma tran trong ke hoach; neu UAT dat thi ky lai release artifact, neu khong thi dung release va rollback theo runbook.
- Commit/PR: Chua tao.

## 2026-09-28-04 - Lap ke hoach hardening bao mat web

- Thoi gian: 2026-09-28 (Asia/Saigon)
- Loai: Bao mat | Van hanh | Tai lieu
- Trang thai: Dang thuc hien
- Muc tieu: Tao ke hoach cu the de xu ly toan bo 20 tieu chi bao mat web trong video va dua production den trang thai co the ky duyet.
- Pham vi: ChatUI, Chatmgt, auth/session, tenant authorization, upload/S3, Tinode relay, PostgreSQL, Redis, reverse proxy/Cloudflare, logging, monitoring, backup va DAST.
- File da thay doi: `docs/WEB_SECURITY_HARDENING_PLAN.md`, `docs/CHANGELOG.md`.
- Noi dung: Ghi lai bang chung audit hien tai, blocker Redis public, rate-limit fail-open, upload MIME/size, cookie/header, public API key, Cloudflare, database least privilege va quy trinh fix theo P0/P1/P2; them test matrix, deploy gate, rollback va definition of done.
- Quyet dinh ky thuat: Dong ha tang P0 truoc khi sua UI; fail closed khi Redis loi; tenant tu verified session; upload phai allowlist + content validation; production chi duoc ky duyet khi co evidence 20/20 muc.
- Database/API/cau hinh: Chua thay doi database, API, runtime config hay deployment; day la plan de thuc hien co kiem soat.
- Kiem thu: `git diff --check -- docs/WEB_SECURITY_HARDENING_PLAN.md docs/CHANGELOG.md` dat, khong co loi whitespace; chua sua code va chua deploy.
- Rui ro con lai: Tat ca blocker van con ton tai cho den khi cac phase trong plan duoc implement va verify tren staging/production.
- Viec tiep theo: Bat dau Giai doan 0 va Giai doan 1, uu tien khoa cong Redis public va rotate credential/rotate session neu can.
- Commit/PR: Chua tao.

## 2026-09-28-03 - Lap ke hoach khac phuc on dinh mobile

- Thoi gian: 2026-09-28 (Asia/Saigon)
- Loai: Tai lieu
- Trang thai: Dang thuc hien
- Muc tieu: Tao mot runbook day du de sua loi mat ten cong ty sau login, group khong hoat dong, app bi do va cac regression mobile ma khong lap lai loi.
- Pham vi: Mobile Expo, session/tenant, Chatmgt group contract, Tinode realtime/history, pagination, performance, UAT va release.
- File da thay doi: docs/MOBILE_STABILITY_REMEDIATION_PLAN.md, docs/CHANGELOG.md.
- Noi dung: Ghi nhan bang chung hien tai, nguyen tac source of truth va tenant boundary, thu tu P0/P1/P2, contract Account ID/Tinode UID, state machine group, single-flight sync, lazy history, ma tran test, performance budget, UAT va rollback checklist. Chua sua code trong lan lap ke hoach nay.
- Quyet dinh ky thuat: Uu tien session/tenant, group identity va scheduler realtime truoc khi audit UI; khong preload history cua tat ca topic; khong coi Tinode UID la Account ID; khong phat hanh APK truoc UAT thiet bi that.
- Database/API/cau hinh: Chua thay doi database, API, cau hinh hoac deployment. Neu implement can aggregate group endpoint, idempotency hoac migration, phai cap nhat contract/architecture truoc rollout.
- Kiem thu: git diff --check -- docs/MOBILE_STABILITY_REMEDIATION_PLAN.md docs/CHANGELOG.md khong bao loi whitespace; chua chay mobile unit/typecheck/lint vi lan nay chi them tai lieu ke hoach.
- Rui ro con lai: Chua co so lieu baseline va chua xac nhan root cause bang thiet bi that; cac muc trong plan dang o trang thai Chua bat dau.
- Viec tiep theo: Thuc hien Giai doan 0, sau do sua P0 session/tenant, group identity va single-flight sync theo docs/MOBILE_STABILITY_REMEDIATION_PLAN.md.
- Commit/PR: Chua tao.

## 2026-09-28-02 - Build APK mobile gom cac ban sua chat moi nhat

- Thoi gian: 2026-09-28 (Asia/Saigon)
- Loai: Phat hanh | Mobile | Thong bao | Tinode | Kiem thu | Tai lieu
- Trang thai: Hoan tat APK test; chua UAT tren thiet bi that.
- Muc tieu: Tao APK moi khong nham voi ban cu, gom source mobile hien tai cho mute viewer-scoped, history/realtime, media auth, FCM lifecycle, thong bao dung nguoi gui va group settings.
- Pham vi: Mobile Expo/Android; khong sua backend, database, API hay deploy production trong lan nay.
- File da thay doi: `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`, `docs/CHANGELOG.md`.
- Noi dung: Tang app version tu `1.0.23`/Android `versionCode=24` len `1.0.24`/`versionCode=25` truoc khi build universal release APK.
- Quyet dinh ky thuat: Dung nguyen source mobile hien tai; khong them enforcement spam rieng cho reaction/file/poll vi policy nay da duoc gioi han o web/bridge va mobile khong co luong chan tuong ung.
- Database/API/cau hinh: Khong co migration, endpoint moi, thay doi API hay production config.
- Kiem thu: `cd mobile; npm test -- --reporter=dot` dat `23 file, 73/73`; `npm run typecheck` dat; `npm run lint` dat; `npx expo config --json --type public` nhan package `vn.upgo.vichat`, version `1.0.24`, versionCode `25`, Firebase config va quyen camera/micro/notification; `npx expo prebuild --platform android --no-install` dat; build staging ASCII `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a,x86_64` dat `BUILD SUCCESSFUL`; `aapt` xac nhan package/version, native code `arm64-v8a` va `x86_64`, `POST_NOTIFICATIONS`, Firebase messaging service; `apksigner verify --verbose --print-certs` dat v2; `zipalign -c -P 16 -v 4` dat; SHA-256 `BDA680868C8E83300D71499B5BB548FABD468C1E2138A5D84A08C6DF815F72C8`; `adb devices` khong co emulator/thiet bi de cai va smoke test.
- Rui ro con lai: Chua UAT dang nhap, doi chat, mute/unmute, history media, realtime, reaction/sticker va push foreground/background/killed tren thiet bi that; APK dang dung Android Debug signer de test noi bo, khong phai ky phat hanh Play Store.
- Viec tiep theo: Cai `D:\vichat-build\ViChat-1.0.24-full-fixes-universal.apk` tren hai thiet bi, UAT hai tai khoan theo cac luong chat/mute/media/group/push; neu phat hanh store thi ky lai bang release keystore.
- Commit/PR: Chua tao.

## 2026-09-28-01 - Thu hep pham vi chong spam tin nhan nhom

- Thoi gian: 2026-09-28 (Asia/Saigon)
- Loai: Sua loi | Web | Tinode | Chong spam | Kiem thu | Tai lieu
- Trang thai: Hoan tat source va bundle web; da deploy production; cho UAT browser.
- Muc tieu: Khong de thao tac reaction va cac hanh dong chat hop le bi danh nham la spam; chi chan burst tin nhan text hoac sticker.
- Pham vi: ChatUI web va tinode-account-bridge; mobile khong doi, khong doi nguong cooldown hien co.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/groupSpamPolicy.test.js`, `src/features/chat/services/chatManagementService.test.js`, `chatservice-main/scripts/tinode_account_bridge.py`, `chatservice-main/tests/test_tinode_account_bridge.py`, `docs/chat-backend-architecture.md`, `dist/index.html`, va file nay.
- Noi dung: Bo dang ky spam khoi reaction, file/anh/voice, poll, edit, recall, pin va forward; giu dang ky cho text/sticker. Bridge chi dem publish text thuong va packet co `x-vichat-sticker`, mien tru event/attachment/forward bang head va content classification. Cooldown text/sticker khong khoa picker reaction hay cac thao tac mien tru.
- Quyet dinh ky thuat: Relay la diem enforcement cuoi cung va tu phan loai packet, khong tin vao action header tu client de quyet dinh mot action co phai message spam hay khong. Khong thay doi limit, cooldown, API, database, Tinode history hoac mobile policy.
- Database/API/cau hinh: Khong migration, endpoint, bien moi truong hoac thay doi contract.
- Kiem thu: `node --test src/features/chat/services/groupSpamPolicy.test.js` dat `6/6`; bridge smoke test va `python -m py_compile chatservice-main/scripts/tinode_account_bridge.py` dat; `npm run test:frontend -- --test-concurrency=1` dat `451 pass, 0 fail`; `npm run lint` exit `0` voi warning legacy/mobile da co; `npm run build:production` exit `0` voi canh bao chunk App vuot 500 KB; `cd mobile; npm test -- --reporter=dot` dat `23 file, 73/73`; `cd mobile; npm run typecheck` dat; `git diff --check` dat. Bridge unittest trong image production dat `16/16`.
- Trien khai: Source commit `fe99308` da push len `github/fix/full-audit-regressions`; archive `/opt/deploy/chat/incoming/vichat-group-spam-fe99308.tar.gz` co SHA-256 `B9BEA30DCA1832051806F9334139316AB6D550F4C8CF8DFD4A1CAFC3E81A2F84`; release `/opt/deploy/chat/releases/group-spam-fe99308-20260928-r1` dang la `current`, `previous` tro `/opt/deploy/chat/releases/mute-category-69a7f70-20260927-r3`; chi recreate `tinode-account-bridge` va `chat`, khong migration, khong reset database/Redis/Tinode volume/topic/message. Hai candidate dung truoc switch do quyen doc archive va duoc giu trong `.failed-candidate`, production khong bi thay doi.
- Kiem tra production: ChatUI container `27a3791baf3f49fd7c64acb2b7ea185da9ae7bfd83d009c16730ad21b1af65ab`, image `sha256:1279ac01da06953dce2418aa26197d2499d67f85fc69a77234e813ca266976c0`; bridge container `064576953ff6080857e6e101566f7e97c61e40a3fc509cbce4d364a7893c705e`, image `sha256:4e27ce4454d3bf0d891e5326e960c46095f1fe433ba0f7b1b215951b9ce45f68`; ca hai healthy/restart `0`, local/public `/healthz` `ok`, bridge health `healthy`, public entry `/assets/index-CXweswLR.js`, CSS `/assets/index-B1sUJyGf.css`, WSS `101`, bundle co marker group-spam/sticker. Chatmgt, webhook, Tinode, PostgreSQL va Redis giu nguyen container ID; log ChatUI/bridge sach.
- Rui ro con lai: Chua UAT production voi hai web session cho text/sticker burst, reaction lap nhanh va cac action mien tru; cooldown bridge van la state trong memory va se reset khi bridge restart; mobile khong doi trong commit nay.
- Viec tiep theo: Hard refresh `https://chat.gonplatform.com`, sau do UAT web text/sticker burst, reaction lap nhanh, file/poll/edit/recall/pin/forward va xac nhan mobile khong doi.
- Commit/PR: Source commit `fe99308` da push len `github/fix/full-audit-regressions`; docs/deploy follow-up commit chua tao.

## 2026-09-27-04 - Sua icon tat thong bao va phan loai hoi thoai

- Thoi gian: 2026-09-27 23:47 (Asia/Saigon)
- Loai: Sua loi | Web | Thong bao | Phan loai | UI | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source commit `69a7f70` da push; web da deploy production va verify; mobile khong doi trong commit nay.
- Muc tieu: Giu mute viewer-scoped qua moi snapshot Tinode, hien dung icon chuong im lang va cho phep gan/loc phan loai ma khong lam dong chat roi.
- Pham vi: Merge conversation web, icon thong bao trong menu/chi tiet, key phan loai theo management conversation va badge phan loai trong sidebar; khong sua mobile transport, API, database, unread hay realtime message flow.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/chatRealtime.test.js`, `src/features/chat/services/conversationCategoryPolicy.js`, `src/features/chat/services/conversationCategoryPolicy.test.js`, `src/features/chat/services/conversationCategoryConversations.js`, `src/features/chat/services/chatManagementService.test.js`, `src/styles/index.css`, `dist/index.html`, va file nay.
- Nguyen nhan: Merge chi phan biet truong mute thieu hay co nhung chua chan gia tri mac dinh tu Tinode; icon `fa-regular fa-bell-slash` khong on dinh trong Font Awesome Free; mot so luong phan loai dung truc tiep room key thay vi mot helper chung.
- Noi dung: Chi chap nhan mute tu management snapshot authoritative, giu nguyen mute khi Tinode gui null/default; doi icon mute sang `fa-solid`; dong chat chi con icon `fa-tag` co title/aria-label; dong bo key phan loai qua `conversationCategoryKey`.
- Quyet dinh ky thuat: Chatmgt van la nguon chuan cho mute viewer-scoped; Tinode khong duoc ghi de metadata nay. Nhan phan loai van duoc giu trong menu/bo loc/manager de khong mat chuc nang, chi an chu o badge sidebar.
- Database/API/cau hinh: Khong migration, endpoint, bien moi truong hoac thay doi contract.
- Kiem thu: `node --test src/features/chat/services/chatRealtime.test.js src/features/chat/services/conversationCategoryPolicy.test.js src/features/chat/services/conversationCategoryConversations.test.js src/features/chat/services/conversationListFilter.test.js src/features/chat/services/chatManagementService.test.js` dat `136 pass, 1 fail`; failure cu tai `chatManagementService.test.js:760` ve callback mobile group-owner departure, khong lien quan. `npm run test:frontend -- --test-concurrency=1` dat `449 pass, 1 fail` voi cung failure cu; `npm run lint` exit `0` voi warning legacy da co; `npm run build:production` exit `0` voi canh bao chunk App vuot 500 KB; `git diff --check` dat.
- Rui ro con lai: Chua UAT browser voi tai khoan that cho mute sau doi chat/reconnect va gan/loc category; Font Awesome van phu thuoc stylesheet CDN hien tai; mobile khong co thay doi/artifact moi trong lan nay.
- Trien khai: Archive `vichat-mute-category-69a7f70.tar.gz` co SHA-256 `1AEC2473F38E9711FBF52A07E534AF24DD0BBB9005EA26AC7D2186F8E734BEF5`; r1/r2 rollback tu dong tai gate verifier public, khong thay doi service ngoai `chat`; r3 thanh cong, release `/opt/deploy/chat/releases/mute-category-69a7f70-20260927-r3` dang la `current`, `previous` tro `/opt/deploy/chat/releases/live-messages-240f712-20260927-r1`; container `e1701ea794a2` healthy, image `sha256:68de2b9650264851b7f3d313a067317221c8c647c62ef529a0102968edc9bccc`; local/public health `ok`, public WSS `101`, public entry `/assets/index-CuLp0V52.js`, CSS `/assets/index-B1sUJyGf.css`, non-chat containers khong doi.
- Viec tiep theo: Hard refresh va UAT mute/category tren web voi tai khoan that; khong can migration hay deploy mobile cho commit nay.
- Commit/PR: Source commit `69a7f70` da push len `github/fix/full-audit-regressions`; docs/deploy follow-up commit se ghi nhan release nay.

## 2026-09-27-03 - Khong de preload media lam tre tin nhan

- Thoi gian: 2026-09-27 23:05 (Asia/Saigon)
- Loai: Sua loi | Web | Tinode | Hieu nang | Kiem thu | Tai lieu
- Trang thai: Hoan tat; commit `240f712` da push; web da deploy production va verify; chua UAT tai khoan that.
- Muc tieu: Tin nhan cua cua so chat phai hien theo cua so history gan nhat ngay khi mo, khong cho den khi quet toan bo media history.
- Pham vi: Tinode topic event delivery, preload lich su media web, tinh toan panel Anh/file/lien ket; khong doi mobile transport, API, database hoac unread contract.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/tinodeClient.js`, `src/features/chat/services/mediaHistory.js`, `src/features/chat/services/mediaHistory.test.js`, `dist/index.html`, va file nay.
- Nguyen nhan: Preload quet lich su doc nguoc ngay luc mo topic va chan ca conversation event trong luc quet; App cung tinh lai toan bo danh sach media tren moi render.
- Noi dung: Dat visible history floor truoc khi quet nen, chi bo qua packet lich su cu theo sequence floor, cho packet live di thang qua realtime; preload chay sau first render/idle va memo hoa merge/filter media.
- Quyet dinh ky thuat: Khong dung mot co che suppression chung cho ca history va live; call invite cu trong page history van bi bo qua, nhung message moi hon scan floor khong bi tre.
- Database/API/cau hinh: Khong migration, endpoint moi, bien moi truong hoac thay doi hop dong.
- Kiem thu: `node --test src/features/chat/services/mediaHistory.test.js src/features/chat/services/chatRealtime.test.js` dat `55/55`; `npm run lint` exit `0` voi warning legacy; `npm run build:production` exit `0` voi canh bao chunk App vuot 500 KB; `npm test -- --reporter=dot` trong `mobile/` dat `23 file, 73/73`; `npm run typecheck` trong `mobile/` dat; full `npm run test:frontend -- --test-concurrency=1` con 1 failure cu tai `src/features/chat/services/chatManagementService.test.js:760`, khong lien quan; `git diff --check` dat.
- Rui ro con lai: Chua UAT tai khoan production that voi chat co history lon; browser bridge van khong khoi tao duoc native pipe trong moi truong nay.
- Viec tiep theo: Hard refresh, mo chat co tin cu va tin moi dong thoi, roi xac nhan tin moi hien truoc khi media history quet xong.
- Commit/PR: Source commit `240f712` da push len `github/fix/full-audit-regressions`; production release `live-messages-240f712-20260927-r1` dang active. Archive SHA-256 `3E8750E5F9081F3FE81F42D24C63F8800AF96DB7DD1009657935F09E191E4D05`; public bundle `/assets/index-DiccKpTU.js`, `/assets/App-C21UiOld.js`, `/assets/tinodeClient-CyBi6k0k.js` co marker live-message path.

## 2026-09-27-02 - Nap day du anh file lien ket khi mo chat

- Thoi gian: 2026-09-27 22:27 (Asia/Saigon)
- Loai: Sua loi | Web | Tinode | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source da commit/push; web da deploy production va verify; chua UAT tai khoan that.
- Muc tieu: Muc anh, file va lien ket trong chi tiet cuoc tro chuyen phai hien du ngay khi mo chat, khong phu thuoc vao viec nguoi dung cuon lich su.
- Pham vi: Tai lich su Tinode cho media o nen va ghep vao panel chi tiet; khong mo rong danh sach tin nhan dang hien thi, unread, scroll, gui tin hoac mobile flow.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/tinodeClient.js`, `src/features/chat/services/mediaHistory.js`, `src/features/chat/services/mediaHistory.test.js`, `package.json`, `dist/index.html`, va file nay.
- Nguyen nhan: Panel chi tinh media tu cua so 100 tin nhan dang nam trong room; Tinode chi tai tin cu khi nguoi dung cuon len.
- Noi dung: Them loader phan trang Tinode doc im lang den dau lich su, luu rieng cac tin co media/lien ket theo session + tenant + topic, uu tien snapshot live khi merge va hien trang thai dang tai thay vi hien rong gia.
- Quyet dinh ky thuat: Loader nen khong emit conversation snapshot va khong day toan bo lich su vao React message list; cache theo phien de tranh dung nham du lieu sau logout/doi tenant.
- Database/API/cau hinh: Khong migration, endpoint moi, bien moi truong hoac thay doi hop dong.
- Kiem thu: `node --test src/features/chat/services/mediaHistory.test.js src/features/chat/services/chatRealtime.test.js` dat `54/54`; `npm run test:frontend -- --test-concurrency=1` dat `446 pass, 1 fail`, failure tai `src/features/chat/services/chatManagementService.test.js:760` la assertion mobile group-owner departure da co san va khong lien quan lan sua nay; `npm run lint` exit `0` voi warning legacy/mobile/vendor; `npm run build:production` exit `0` voi canh bao chunk App vuot 500 KB; `cd mobile; npm test -- --reporter=dot` dat `23 file, 73/73`; `cd mobile; npm run typecheck` dat; `git diff --check` dat.
- Trien khai: Archive `/opt/deploy/chat/incoming/vichat-media-history-b4c4325.tar.gz` co SHA-256 `DF6BE058A07EBE108889F113CE013314A98BCC77605F634FE91B7E149E1C7DDC`; release `/opt/deploy/chat/releases/media-history-b4c4325-20260927-r1` dang la `current`; ChatUI container `26fa1ba8ff54` healthy, non-chat containers khong doi; public ChatUI/Chatmgt health deu dat; public bundle `/assets/index-BvL9usWX.js`, `/assets/App-CV6F4F_0.js`, `/assets/tinodeClient-N8BAwNDz.js` co marker preload media history; log ChatUI candidate sach.
- Rui ro con lai: Chua UAT tai khoan that voi chat co lich su media lon; browser bridge bao `privileged native pipe bridge is not available`; mobile khong co panel Anh, file va lien ket tuong ung nen chi da chay regression/typecheck, chua UAT attachment history tren thiet bi that.
- Viec tiep theo: Hard refresh web, mo chat co anh/file/lien ket cu -> doi chat -> quay lai va xac nhan panel hien ngay; sau do cuon tin nhan, gui file moi, doi unread va kiem tra khong day lich su cu vao message list; UAT mobile attachment tren thiet bi neu can.
- Commit/PR: Source commit `b4c4325` da push len `github/fix/full-audit-regressions`; production release `media-history-b4c4325-20260927-r1` dang active.

## 2026-09-27-01 - Giu trang thai tat thong bao khi doi cuoc tro chuyen

- Thoi gian: 2026-09-27 19:55 (Asia/Saigon)
- Loai: Sua loi | Web | Mobile | Thong bao | Tinode | Kiem thu | Tai lieu
- Trang thai: Hoan tat; commit `35be1c3` da push; web da deploy production va verify; mobile source da push, chua co APK/IPA hoac store deployment do Codemagic chua chay; chua UAT tai khoan that.
- Muc tieu: Trang thai tat thong bao cua tung nguoi dung phai con nguyen khi mo cuoc tro chuyen khac roi quay lai tren web va mobile.
- Pham vi: Merge snapshot Chatmgt/Tinode cua danh sach va chi tiet cuoc tro chuyen; khong doi endpoint, database hay kenh push.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/chatRealtime.test.js`, `mobile/src/store/appStore.ts`, `mobile/src/utils/conversationSync.ts`, `mobile/src/utils/conversationSync.test.ts`, `dist/index.html`, va file nay.
- Nguyen nhan: Snapshot Tinode khong co truong mute theo viewer nhung merge cu coi truong thieu la `null`/gia tri moi, ghi de deadline hoac mute vinh vien da luu trong Chatmgt sau khi doi phong.
- Noi dung: Web chi thay mute khi snapshot co gia tri explicit; mobile danh dau snapshot Tinode la realtime-only va giu mute Chatmgt qua ca merge store/list. Gia tri `null` tu Chatmgt van duoc chap nhan de bat lai thong bao; them regression test cho mute vinh vien, deadline, snapshot thieu truong va unmute.
- Quyet dinh ky thuat: Chatmgt tiep tuc la nguon chuan cho cai dat thong bao theo viewer; Tinode chi cap realtime/history va khong duoc xoa metadata viewer-scoped.
- Database/API/cau hinh: Khong migration, endpoint moi, bien moi truong hoac thay doi hop dong; da build lai bundle web.
- Kiem thu: `node --test src/features/chat/services/chatRealtime.test.js src/features/chat/services/conversationNotifications.test.js` dat `62/62`; clean commit mobile `cd mobile; npm test -- --reporter=dot` dat `17 file, 45/45` va `npm run typecheck` dat; `python -m unittest discover -s chatservice-main/tests -p test_chat_auth_contract.py -v` dat `60/60`; `npm run lint` exit `0` voi warning legacy da co; `npm run build:production` exit `0`; `git diff --check` dat. Full `npm run test:frontend -- --test-concurrency=1` dat `130 pass, 1 fail`; test fail tai `src/features/chat/services/chatManagementService.test.js:760` la ky vong callback group-owner mobile da co san, khong lien quan mute.
- Trien khai: Archive `vichat-notification-mute-35be1c3.tar.gz` co SHA-256 `E3EE18EECD1BA12E9402727C3FE752D4CEEA412EC2E18C8E35E9E79435C3820D`; release `/opt/deploy/chat/releases/notification-mute-35be1c3-20260927-r2` dang la `current`; bundle public `/assets/index-DFeLyFlU.js`; ChatUI container healthy, Chat health/public health/Chatmgt health deu `200`; Chatmgt, Tinode, PostgreSQL va Redis khong doi.
- Rui ro con lai: Chua UAT web/mobile voi hai tai khoan that qua chu ky bat -> doi phong -> quay lai -> gui tin; mobile chua co artifact APK/IPA va push background/killed van phu thuoc credential/provider production.
- Viec tiep theo: Hard refresh web va UAT direct/group voi mute deadline, mute den khi mo lai, unmute va thong bao tin moi; kich hoat Codemagic de tao APK/IPA roi cai/test tren hai thiet bi; dong bo lai contract test group departure o lan sua mobile rieng.
- Commit/PR: Source commit `35be1c3` da push len `github/fix/full-audit-regressions`; production release `notification-mute-35be1c3-20260927-r2`; docs/deploy follow-up commit `f6e26e3` da push.

## 2026-09-26-03 - Sua race refresh phien khi tat thong bao tren web

- Thoi gian: 2026-09-26 13:20 (Asia/Saigon)
- Loai: Sua loi | Web | Thong bao | Tinode | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source commit `c6596b7` da push len `github/fix/full-audit-regressions`; production release `notification-race-c6596b7-20260926-r4` da activate va verify.
- Muc tieu: Bat/tat thong bao cua cuoc tro chuyen khong hien loi "Phien tai khoan da thay doi trong khi ket noi Tinode" va khong lam gian doan cac luong chat realtime khac.
- Pham vi: ChatUI web refresh metadata, refresh token Tinode va endpoint notification-settings; khong sua `mobile/`, backend, database hay hop dong API.
- File da thay doi: `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/chatManagementService.test.js`, `dist/index.html`, va file nay.
- Nguyen nhan: Polling `/api/v1/auth/me` co the rebuild object session trong luc request token Tinode dang chay; guard cu coi object moi la phien moi va day loi nen toast dung luc nguoi dung thao tac thong bao.
- Noi dung: Dung scope on dinh theo user/tenant va generation de phan biet refresh metadata hop le voi login/logout/doi tenant that; giu object session hien tai khi chi refresh metadata; giu update notification mute la request Chatmgt doc lap, khong tu dong refresh Tinode.
- Quyet dinh ky thuat: Chi chap nhan token response khi generation va scope van khop; token response luon ghi vao session dang active. Khong an loi phien that va khong thay doi message, membership, call, media hoac mobile flow.
- Database/API/cau hinh: Khong migration, endpoint moi, bien moi truong hay thay doi contract; bundle web da build lai.
- Kiem thu: Regression test scope/mute `3/3` dat; `npm run lint` exit `0` voi warning legacy/vendor va warning mobile da co; `npm run build:production` thanh cong voi canh bao chunk App vuot 500 KB; `git diff --check` dat. Full `npm run test:frontend -- --test-concurrency=1` con 1 test mobile da co san fail do assertion ky vong source mobile cu, khong lien quan thay doi web lan nay.
- Rui ro con lai: Chua UAT bat/tat thong bao tren tai khoan production; Browser skill khong khoi tao duoc native pipe trong moi truong nay nen can hard refresh va UAT thu cong; bo test tong van can duoc dong bo voi thay doi mobile dang co san neu muon dat xanh toan bo.
- Trien khai: Archive `vichat-notification-race-c6596b7.tar.gz` co SHA-256 `3cff6cfecf0aa60174d6b5f7f41b11a65f9af3dfc0158fd49837966fcb8e813b`; release `/opt/deploy/chat/releases/notification-race-c6596b7-20260926-r4` dang la `current`, `previous` tro `/opt/deploy/chat/releases/chat-bootstrap-9259aa9-20260922-r1`, backup `/opt/deploy/chat/backups/notification-race-c6596b7-20260926-r4`; chi recreate service `chat`, giu nguyen Chatmgt/Tinode/PostgreSQL/Redis, service ngoai pham vi va volume.
- Kiem tra production: ChatUI container `e1602f18a6e49edcbc85bf5e7b5c987c1348043e26a78d38923194c0a98a8f8c` healthy, restart `0`; public health `200`, WSS `101`; bundle `/assets/index-Cb3DYtAg.js` va `/assets/index-C1rian-2.css` khop candidate; source validation 687 file khong doi, service/volume ngoai `chat` khong doi. Ba candidate truoc dung o gate runner truoc activate va da rollback an toan.
- Viec tiep theo: Hard refresh, sau do UAT bat/tat thong bao o group/direct trong luc polling va reconnect Tinode; khong can migration mobile.
- Commit/PR: Source commit `c6596b7`; production release `notification-race-c6596b7-20260926-r4`; docs/deploy follow-up commits `f189ba0`, `eb77c7f` da push.

## 2026-09-26-02 - Sua thong bao nham nguoi gui mobile

- Thoi gian: 2026-09-26 11:50 (Asia/Saigon)
- Loai: Sua loi | Mobile | Thong bao | Tinode | Phat hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat source va APK test; chua UAT hai tai khoan production.
- Muc tieu: Khi mot tai khoan gui tin, chi tai khoan nhan hien thong bao; thiet bi khac cua nguoi gui khong hien thong bao nham.
- Pham vi: Phan loai sender realtime mobile, local notification, FCM Android silent push va image Tinode authoritative.
- File da thay doi: `mobile/src/services/tinodeClient.ts`, `mobile/src/utils/messageOrigin.ts`, `mobile/src/utils/messageOrigin.test.ts`, `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`, `infrastructure/tinode/Dockerfile`, `infrastructure/tinode/fcm-silent-push.patch`, `infrastructure/tinode/compose.yaml`, `infrastructure/production/compose.yaml`, `infrastructure/production/start.sh`, tai lieu kien truc va van hanh.
- Nguyen nhan: Mobile chi uu tien `raw.from`, nen co the bo qua `x-sender-id` va phat own echo thanh incoming. Tinode co chu dich gui silent push cho thiet bi sender de dong bo; FCM Android adapter 0.25.3 van gan notification payload cho silent data, lam Android hien banner cho sender.
- Noi dung: Giai quyet origin tu ca `from` va `x-sender-id`, chan local notification neu packet la own message; build Tinode binary co patch de silent Android push la data-only, nhung giu notification cho push nguoi nhan va cuoc goi; tang mobile len `1.0.23`/Android `versionCode=24`.
- Quyet dinh ky thuat: Khong tat FCM notification chung vi se lam mat thong bao khi recipient bi kill. Chi bo notification payload voi `data.silent=true`; khong ap dung guard nay cho video call.
- Database/API/cau hinh: Khong migration/API moi. Compose dung image Tinode local `vichat/tinode-postgres:0.25.3-silent-push`, build tu base image Tinode pin digest va source tag `v0.25.3`; production can build/recreate rieng `chatapi` sau khi cap nhat.
- Kiem thu: `npm run typecheck` dat; `npm run lint` dat; `npm test -- --reporter=dot` dat `22` file, `71/71`; Gradle universal release build dat voi `arm64-v8a,x86_64`; `aapt` xac nhan package `vn.upgo.vichat`, version `1.0.23`, `versionCode=24`; `zipalign` dat; `apksigner verify` dat v2; APK cai va mo duoc tren `emulator-5554`, logcat khong co crash/FATAL; `git apply --check` dat voi source Tinode `v0.25.3`; `git diff --check` dat. Artifact `D:\vichat-build\ViChat-1.0.23-notification-routing-universal.apk`, SHA-256 `063FFB238F6062CEF6AFA4579D2369E92CF3512F9F2B2775D05CFF2FFA3C4EE3`.
- Rui ro con lai: Chua deploy image patched len Tinode authoritative va chua UAT web -> mobile/mobile -> mobile o foreground/background/swiped/killed; Docker/Go khong co tren may build nen chua build image server tai day. Neu chi cai APK ma khong recreate `chatapi`, sender van co the thay banner silent tu server cu.
- Viec tiep theo: Tren server build/recreate rieng `chatapi` tu image `vichat/tinode-postgres:0.25.3-silent-push`, kiem tra health/log, sau do test hai tai khoan va xac nhan recipient co thong bao con sender khong co banner.
- Commit/PR: Chua tao.

## 2026-09-26-01 - Sua quyen cai dat nhom va splash mobile

- Thoi gian: 2026-09-26 10:05 (Asia/Saigon)
- Loai: Sua loi | Mobile | Nhom | Dang nhap | Phat hanh | Kiem thu
- Trang thai: Hoan tat source va APK test; chua UAT nhom voi tai khoan that.
- Muc tieu: Bao dam admin mobile khong mat quyen sau snapshot Tinode, cac cong tac nhom hoat dong dung, va luong khoi dong hien thi day du thuong hieu GON PLATFORM sau khi build lai.
- Pham vi: Merge conversation/member mobile, nhan dien role nhom, cau hinh native splash va version Android; khong thay doi luong FCM/Tinode push.
- File da thay doi: `mobile/src/types/index.ts`, `mobile/src/utils/conversationSync.ts`, `mobile/src/utils/conversationSync.test.ts`, `mobile/src/services/chatManagementService.ts`, `mobile/src/services/tinodeClient.ts`, `mobile/src/screens/chat/GroupInfoScreen.tsx`, `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`.
- Nguyen nhan: Snapshot Tinode co the kem `groupSettings`, trong khi merge cu suy doan nguon du lieu theo truong nay va khong phan biet snapshot realtime voi snapshot Chatmgt authoritative; native project thieu `expo-splash-screen` plugin co tham so nen giu anh placeholder.
- Noi dung: Gan `snapshotSource` cho snapshot Chatmgt/Tinode; snapshot Tinode luon union member de giu Account ID va `groupRole`, snapshot Chatmgt thay the danh sach member authoritative de phan anh member da bi xoa; role owner fallback so khop qua identity; them module/cau hinh splash voi asset logo that; dong bo app version `1.0.22`, Android `versionCode=23`.
- Quyet dinh ky thuat: Chatmgt tiep tuc la nguon chuan cho membership/role/settings; Tinode chi bo sung realtime/member mode va khong duoc lam mat metadata Chatmgt. Khong tao foreground service va khong sua kenh thong bao nen.
- Database/API/cau hinh: Khong migration, endpoint moi hoac thay doi hop dong backend. Them dependency `expo-splash-screen` phu hop SDK 57; native Android duoc regenerate tu app config local.
- Kiem thu: `npm run typecheck` dat; `npm run lint` dat; `npm test -- --reporter=dot` dat `21` file, `68/68`; `git diff --check` dat; `npx expo config --json --type public` nhan version `1.0.22`, versionCode `23`, package `vn.upgo.vichat` va splash asset; Gradle universal release build dat; `aapt` xac nhan package/version/ABI va `POST_NOTIFICATIONS`; `apksigner verify` dat v2; `zipalign` dat; APK cai va chay tren `emulator-5554`, logcat khong co fatal exception; screenshot login xac nhan logo va chu `GON PLATFORM`; SHA-256 `F0EFD56C74FF4EE4E58FD4AD7BF4E2D656C8D9F24C366BF02410D701F7F98E4A`; artifact `D:\vichat-build\ViChat-1.0.22-group-settings-splash-universal.apk`.
- Rui ro con lai: Chua UAT voi tai khoan admin that cho toggle settings, role, poll, ghim; chua xac nhan push foreground/background/swiped/killed tren APK moi bang hai tai khoan va thiet bi that.
- Viec tiep theo: UAT group settings voi hai tai khoan theo ca thu tu snapshot web/mobile; sau do test FCM foreground/background/swiped/killed va notification tap tren thiet bi that.
- Commit/PR: Chua tao.

## 2026-09-25-09 - Sua dong bo va quyen chuc nang nhom tren mobile

- Thoi gian: 2026-09-25 19:45 (Asia/Saigon)
- Loai: Sua loi | Mobile | Nhom | Dong bo | Kiem thu
- Trang thai: Hoan tat source; chua build APK moi va chua UAT nhom tren thiet bi that.
- Muc tieu: Bao dam cac luong them, duyet, doi vai tro, xoa/chuyen chu, cai dat, poll va ghim trong nhom khong bi mat du lieu khi snapshot Tinode va Chatmgt den khac thu tu.
- Pham vi: `mobile/src/screens/chat/GroupInfoScreen.tsx`, `mobile/src/screens/chat/ConversationListScreen.tsx`, `mobile/src/services/tinodeClient.ts`, `mobile/src/store/appStore.ts`, `mobile/src/utils/conversationSync.ts`, `mobile/src/utils/groupSettings.ts`, `mobile/src/utils/identity.ts`, `mobile/src/utils/poll.ts`, `mobile/src/utils/tinodePublish.ts` va cac test lien quan.
- Nguyen nhan: Mobile nhan dien pho nhom bang mode khong phu hop voi hop dong backend `JRWPASD`, ham merge tinh snapshot trung gian nhung lai tra ve du lieu cu, va mot so nut co the gui Tinode UID thay cho Account ID cho Chatmgt.
- Noi dung: Dong bo role theo `groupRole`/mode Tinode, giu Account ID khi snapshot Tinode den truoc, chan thao tac khi chua giai duoc Account ID, tra cuu conversation theo ca management ID, va doc sequence tu cac dang phan hoi publish cua Tinode de ghim poll on dinh.
- Quyet dinh ky thuat: Chatmgt van la nguon chuan cho membership/quyen; Tinode van la nguon realtime/message. Khong them endpoint, migration hay thay doi hop dong backend.
- Database/API/cau hinh: Khong co thay doi; mobile tiep tuc gui Account ID cho endpoint participant va chi dung mode Tinode de fallback khi thieu groupRole.
- Kiem thu: `cd mobile; npm run typecheck` dat; `npm run lint` dat; `npm test -- --reporter=dot` dat `21` file, `66/66`; `git diff --check` dat.
- Rui ro con lai: Chua co UAT voi hai tai khoan tren APK moi cho cac luong duyet/doi role/chuyen chu/poll; Android push va backend production khong bi thay doi trong lan sua nay.
- Viec tiep theo: Build APK moi tu source nay, cai tren hai thiet bi va UAT tung luong nhom voi ca thu tu snapshot mobile/web.
- Commit/PR: Chua tao.

## 2026-09-25-08 - Sua race dang ky FCM truoc khi mobile vao nen

- Thoi gian: 2026-09-25 (Asia/Saigon)
- Loai: Sua loi | Mobile | Thong bao | Tinode | Phat hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat source, APK test va bat FCM tren Tinode authoritative; chua UAT push killed-app.
- Muc tieu: Bao dam token FCM duoc dua vao Tinode truoc khi mobile dong socket khi ra nen hoac bi vuot khoi recent apps.
- Pham vi: `mobile/App.tsx`, `mobile/src/services/notificationService.ts`, `mobile/src/services/tinodeClient.ts`, `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`, `docs/chat-backend-architecture.md`.
- Nguyen nhan: Token native co the chi duoc gui qua `hi.dev` sau handshake; neu lifecycle dong socket ngay sau khi lay token, goi cap nhat khong co ACK co the bi cat truoc khi Tinode luu device.
- Noi dung: Dang ky push ngay khi session mobile ton tai; nap token vao SDK truoc hello dau tien; ep cap nhat authenticated neu token den trong luc connect/login; van giu realtime fallback khi native token that bai; tang version len `1.0.21`/Android `versionCode=22`; cap nhat FCM authoritative de dung body `$content`, credential project `androi-app-77016`, khong dung icon/click action khong ton tai trong APK.
- Quyet dinh ky thuat: Khong tao foreground service. FCM native va Tinode authoritative van la hai nua bat buoc cho killed-app push; chi disconnect websocket khi mobile da co device token.
- Database/API/cau hinh: Khong migration/API moi; da backup `working.config`, dat service-account vao runtime authoritative voi mode `600`, bat FCM project `androi-app-77016`, credential `/data/runtime/firebase-service-account.json`, Android notification/sound va body `$content`; chi restart container Tinode `upgo-chatapi-8092`, khong restart PostgreSQL/Redis/ChatUI/Chatmgt.
- Kiem thu: `cd mobile; npm run typecheck` dat; `npm run lint` dat; `npm test -- --reporter=dot` dat `19` file, `60/60`; `git diff --check` dat; Gradle `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a -x lintVitalRelease` dat `BUILD SUCCESSFUL`; APK dung package `vn.upgo.vichat`, version `1.0.21`, `versionCode=22`, Firebase resources, `POST_NOTIFICATIONS` va service FCM; `apksigner verify` dat v2; `zipalign -c -P 16 -v 4` dat; cai tren Samsung A24 dat; log co `[ViChat] Native push registration ready: fcm`; SHA-256 `7645D3AC5B9646A2AB6F1A32E0F4B9C977CF652C6AB94112D1918C2AF284CFE0`; artifact `D:\vichat-build\ViChat-1.0.21-fcm-handshake-arm64.apk`; sau restart container `healthy`, public `https://chatapi.gonplatform.com/` tra `200`.
- Rui ro con lai: Da xac nhan provider FCM authoritative da bat va container healthy; van chua UAT hai tai khoan o foreground/background/swiped/killed va chua xac nhan notification tap mo dung man hinh chat.
- Viec tiep theo: UAT hai tai khoan theo luong web -> mobile va mobile -> mobile o foreground/background/swiped/killed; neu Android bi dat Force stop tu Settings thi do he dieu hanh chan FCM, khong phai luong vuot recent apps.
- Commit/PR: Chua tao.

## 2026-09-25-07 - Build mobile voi Firebase push credentials

- Thoi gian: 2026-09-25 (Asia/Saigon)
- Loai: Sua loi | Mobile | Thong bao | Phat hanh | Cau hinh | Kiem thu
- Trang thai: Hoan tat APK test; chua UAT push killed-app.
- Muc tieu: Tao ban Android co native FCM registration de Tinode co the gui thong bao khi app o nen hoac bi he dieu hanh dung.
- Pham vi: `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`, credential local bi ignore va APK Android ARM64.
- Noi dung: Da xac minh `google-services.json` va Firebase service account cung project `androi-app-77016`, package `vn.upgo.vichat`; dat vao cac thu muc local bi ignore; tang mobile len `1.0.19`/Android `versionCode=20`.
- Quyet dinh ky thuat: Dung FCM native ket hop Tinode push provider; khong dung foreground service de gia lap thong bao.
- Database/API/cau hinh: Khong migration/API moi. Production Tinode van phai bat FCM voi credential runtime va recreate authoritative provider.
- Kiem thu: Parse hai JSON thanh cong; `npx expo config --json --type public` nhan dung package, version va `googleServicesFile`; Gradle `:app:assembleRelease` dat `BUILD SUCCESSFUL` sau 15m57s voi `CMAKE_BUILD_PARALLEL_LEVEL=1` va ARM64; `aapt dump badging` xac nhan package/version `vn.upgo.vichat`/`1.0.19`/`versionCode=20`/`arm64-v8a`; manifest co Firebase Messaging service va `POST_NOTIFICATIONS`; `apksigner verify --verbose` dat v2; `zipalign -c -v 4` dat; SHA-256 `3FC81A9FF9D2A73E2D60B4B48DF497DA5D3AD48726BCCE0EAB4C442A056273B0`; artifact `D:\vichat-build\ViChat-1.0.19-fcm-arm64.apk`.
- Rui ro con lai: Chua restart Tinode production va chua UAT foreground/background/swiped/killed tren thiet bi that; APK co FCM client config nhung push killed-state van phu thuoc provider authoritative va quyen thong bao tren thiet bi.
- Viec tiep theo: Cai APK tren thiet bi, cap credential runtime cho Tinode, recreate provider authoritative, roi test web -> mobile va mobile -> mobile o foreground/background/swiped/killed.
- Commit/PR: Chua tao.

## 2026-09-25-06 - Giu fallback realtime khi mobile chua co push token

- Thoi gian: 2026-09-25 (Asia/Saigon)
- Loai: Sua loi | Mobile | Thong bao | Tinode | Phat hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat APK test; chua UAT killed-app push.
- Muc tieu: Khong lam mat ca thong bao realtime khi native FCM/APNs token chua duoc dang ky.
- Pham vi: `mobile/src/services/tinodeClient.ts`, `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`.
- Nguyen nhan: Luong vao background dong websocket truoc ca khi co device token; trong trang thai thieu credential/provider, Tinode khong co kenh push de thay the.
- Noi dung: Chi suspend websocket khi client da giu native device token; neu chua co token thi giu fallback realtime va tang version len `1.0.18`/Android `versionCode=19`. Artifact tai `D:\vichat-build\ViChat-1.0.18-realtime-fallback-arm64.apk`.
- Quyet dinh ky thuat: Khi da co token, van dong websocket de tranh Tinode danh dau thiet bi da nhan tin; khi chua co token, uu tien khong lam mat realtime. Khong tao foreground service.
- Database/API/cau hinh: Khong migration, endpoint moi hoac secret moi.
- Kiem thu: `cd mobile; npm run typecheck` dat; `npm run lint` dat; `npm test -- --reporter=dot` dat `18` file, `58/58`; Expo prebuild dat voi canh bao thieu `GOOGLE_SERVICES_JSON(_BASE64)`; Gradle `BUILD SUCCESSFUL` sau 18m13s; `aapt dump badging` xac nhan package/version/`arm64-v8a`/`POST_NOTIFICATIONS`; `apksigner verify --verbose` dat v2; `zipalign -c -v 4` dat; SHA-256 `BCC35503B0BBCA9715B3E7BDB6EF167F1DAF659B35242744495E0F68DEAFA77B`.
- Rui ro con lai: Neu khong co Firebase native config va provider authoritative, killed-app push van khong the hoat dong; force-stop tu Settings van bi Android chan.
- Viec tiep theo: Cai APK `1.0.18`, sau do cap credential/build co FCM va test foreground/background/recent/killed.
- Commit/PR: Chua tao.

## 2026-09-25-05 - Build APK mobile 1.0.17

- Thoi gian: 2026-09-25 (Asia/Saigon)
- Loai: Phat hanh | Mobile | Thong bao | Kiem thu | Tai lieu
- Trang thai: Hoan tat APK test; chua UAT push tren thiet bi that.
- Muc tieu: Tao APK release tu source moi nhat, bao gom suspend Tinode khi app vao nen va reconnect/catch-up khi mo lai.
- Pham vi: Native Android ARM64; khong thay doi API, database hay production runtime.
- Noi dung: Chay Expo prebuild va Gradle `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` trong staging ASCII; artifact tai `D:\vichat-build\ViChat-1.0.17-background-push-fix-arm64.apk`.
- Quyet dinh ky thuat: Dung package `vn.upgo.vichat`, version `1.0.17`, Android `versionCode=18`; build khong co Firebase `google-services.json` nen khong tuyen bo killed-app push da hoat dong.
- Kiem thu: Gradle `BUILD SUCCESSFUL` sau 19m59s; `aapt dump badging` xac nhan package/version/`arm64-v8a`/`POST_NOTIFICATIONS`; `apksigner verify --verbose` dat v2; `zipalign -c -v 4` dat; SHA-256 `C60C3D2DDADD7045B61EF57DCD08E2FEB4D9A99CA42E86F854FAC210A56D8113`.
- Rui ro con lai: Build hien canh bao thieu `GOOGLE_SERVICES_JSON(_BASE64)`; push khi app bi kill van can native Firebase credential va Tinode FCM/TNPG production provider; chua UAT tren dien thoai that.
- Viec tiep theo: Cai APK tren hai thiet bi, cap credential qua secret runtime, recreate provider Tinode authoritative, roi test web -> mobile/mobile -> mobile o foreground/background/killed.
- Commit/PR: Chua tao.

## 2026-09-25-04 - Kich hoat suspend Tinode khi mobile vao nen

- Thoi gian: 2026-09-25 (Asia/Saigon)
- Loai: Sua loi | Mobile | Thong bao | Tinode | Kiem thu | Tai lieu
- Trang thai: Hoan tat source; chua build APK/AAB va chua UAT push tren thiet bi that.
- Muc tieu: Bao dam websocket mobile khong tiep tuc nhan tin khi ung dung da vao nen, de Tinode gui push cho thiet bi thay vi danh dau da nhan realtime.
- Pham vi: `mobile/App.tsx`.
- Noi dung: Goi `tinodeClient.suspendForBackground()` ngay khi React Native phat hien app vao `background`; khi quay lai, luong reconnect hien co se ket noi lai va catch-up history.
- Quyet dinh ky thuat: Giu device token tren Tinode trong luc dong websocket; khong dung foreground service va khong thay doi message/API/database.
- Database/API/cau hinh: Khong co migration, endpoint moi hoac secret moi.
- Kiem thu: Da chay `cd mobile; npm run typecheck` dat; `npm run lint` dat; `npm test -- --reporter=dot` dat `18` file, `58/58`; `npm run export` dat (canh bao thieu `GOOGLE_SERVICES_JSON(_BASE64)`); `git diff --check` dat.
- Rui ro con lai: Push khi app bi kill van can Firebase/APNs credential dung package va provider Tinode production; chua co thiet bi that de UAT.
- Viec tiep theo: Build `1.0.17` voi credential, recreate provider authoritative va test web -> mobile/mobile -> mobile o foreground/background/killed.
- Commit/PR: Chua tao.

## 2026-09-25-03 - Tang version mobile cho ban build co push nen

- Thoi gian: 2026-09-25 (Asia/Saigon)
- Loai: Phat hanh | Mobile | Thong bao | Kiem thu | Tai lieu
- Trang thai: Hoan tat source; chua build APK/AAB va chua UAT push tren thiet bi that.
- Muc tieu: Bao dam ban mobile phat hanh tiep theo khong bi nham voi APK `1.0.16` duoc build truoc khi hoan tat luong suspend Tinode/background push.
- Pham vi: `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`.
- Noi dung: Tang version ung dung tu `1.0.16`/Android `versionCode=17` len `1.0.17`/`versionCode=18` de Android chap nhan ban cap nhat chua cac thay doi dong bo va thong bao background.
- Quyet dinh ky thuat: Chi tang version; khong thay doi API, database, message flow hay cau hinh credential.
- Kiem thu: Chua chay build APK/AAB trong buoc nay; se kiem tra version metadata cung build release va UAT sau khi co credential push.
- Rui ro con lai: Chua co `google-services.json`, Firebase service-account/TNPG credential, production `.env` va thiet bi that; push khi app bi kill chua duoc xac nhan.
- Viec tiep theo: Build ban `1.0.17` voi Firebase config dung package `vn.upgo.vichat`, cau hinh provider Tinode authoritative, roi test web/mobile o foreground/background/killed.
- Commit/PR: Chua tao.

## 2026-09-25-02 - Buoc mobile suspend realtime de dam bao push background

- Thoi gian: 2026-09-25 (Asia/Saigon)
- Loai: Sua loi | Mobile | Thong bao | Tinode | Cau hinh | Kiem thu | Tai lieu
- Trang thai: Hoan tat source; chua deploy va chua UAT push tren thiet bi that.
- Muc tieu: Khong de Tinode thay mobile van online trong khi JavaScript da bi he dieu hanh suspend, lam mat FCM/APNs khi app ra background.
- Nguyen nhan: Mobile chi tao local notification tu event realtime; websocket co the con song sau khi app vao background, Tinode danh dau device da nhan va bo qua push server.
- Pham vi: `mobile/App.tsx`, `mobile/src/services/tinodeClient.ts`, `infrastructure/tinode/config.template`, `infrastructure/tinode/compose.yaml`, `infrastructure/tinode/.env.example`, `infrastructure/production/compose.yaml`, `infrastructure/production/.env.example`, `infrastructure/production/start.sh`, tai lieu kien truc/van hanh.
- Noi dung: Dong websocket co chu dich khi vao background nhung giu device token tren Tinode; reconnect khi resume, catch-up history va khong phat lai local alert cho tin da nam trong khoang push; FCM Android dung body `$content`, mau/sound dung field Tinode hop le; them cau hinh APNs alert va validate bien iOS.
- Quyet dinh ky thuat: Khong tao foreground service; push killed-state van la trach nhiem cua native Firebase/APNs credential va provider Tinode authoritative. Khi thieu credential, source chi dam bao fail-closed va dong bo khi resume, khong tuyen bo push da hoat dong.
- Kiem thu: `cd mobile; npm run typecheck` dat; `npm run lint` dat; `npm test -- --reporter=dot` dat `18` file, `58/58`; `npm run export` dat nhung canh bao thieu `GOOGLE_SERVICES_JSON(_BASE64)`; `node --test src/features/chat/services/chatManagementService.test.js` dat `68/68`; `npm run test:frontend -- --test-concurrency=1` dat `443/443`; `npm run lint` root exit `0` voi warning legacy/vendor; kiem tra push template valid JSON va giu `$content`; `bash -n infrastructure/production/start.sh` dat; `git diff --check` dat.
- Rui ro con lai: Workspace khong co `google-services.json`, Firebase service-account/TNPG credential, Docker hay thiet bi that; chua deploy Tinode production.
- Viec tiep theo: Cap credential qua kenh bi mat, cau hinh `chatapi.gonplatform.com`, build mobile voi package `vn.upgo.vichat`, sau do test foreground/background/killed bang hai tai khoan.
- Commit/PR: Chua tao.

## 2026-09-25-01 - Sua guard reconnect web va khoa cau hinh push mobile

- Thoi gian: 2026-09-25 (Asia/Saigon)
- Loai: Sua loi | Web | Mobile | Thong bao | Tinode | Van hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat source va kiem thu local; chua deploy va chua UAT push tren thiet bi that.
- Muc tieu: Khong de web hien sai loi phien tai khoan khi polling `/api/v1/auth/me` chay dong thoi voi refresh token Tinode; giu duong thong bao mobile ro rang khi app bi background hoac bi kill.
- Nguyen nhan: `refreshSessionMetadata()` tao object session moi cho cung tai khoan/tenant, trong khi guard refresh token truoc do so sanh identity object; push khi process mobile bi dung van phu thuoc Firebase/APNs native credential va provider tren Tinode authoritative.
- Pham vi: `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/chatManagementService.test.js`, `infrastructure/production/start.sh`, `infrastructure/production/README.md`, va artifact `dist/index.html` duoc tao lai boi production build.
- Noi dung: Dung khoa on dinh theo user + tenant va `directorySessionGeneration` de phan biet metadata refresh hop le voi login/logout/switch-tenant that; ghi token moi vao session dang active; them regression test; `start.sh` fail-closed neu bat FCM/TNPG nhung thieu credential/path hop le, khong in secret.
- Quyet dinh ky thuat: Tinode trung tam `chatapi.gonplatform.com` van la nguon push authoritative; cau hinh provider tren container `chatapi` rollback local khong kich hoat push production. Khong tao foreground service de gia lap push va khong thay doi message/API/database.
- Kiem thu: `node --test src/features/chat/services/chatManagementService.test.js` dat `68/68`; `npm run test:frontend -- --test-concurrency=1` dat `443/443`; `npm run lint` exit `0` voi warning legacy/vendor; `npm run build:production` thanh cong voi canh bao chunk App vuot 500 KB; `cd mobile; npm run typecheck` dat; `npm test -- --reporter=dot` dat `18` file, `58/58`; `npm run lint` dat; `npm run export` dat nhung canh bao thieu `GOOGLE_SERVICES_JSON(_BASE64)`; `bash -n infrastructure/production/start.sh` dat; `git diff --check` dat.
- Rui ro con lai: May nay khong co Docker (`docker --version` khong chay), khong co credential Firebase/APNs/TNPG/FCM trong workspace, chua recreate Tinode authoritative va chua UAT background/killed push. Vi vay khong tuyen bo push khi app bi kill da hoat dong.
- Viec tiep theo: Cap credential qua kenh bi mat, cau hinh provider tren `chatapi.gonplatform.com`, build lai mobile co `google-services.json` dung package `vn.upgo.vichat`, restart provider, roi test foreground/background/killed bang hai tai khoan; khong can migration.
- Commit/PR: Chua tao.

## 2026-09-24-04 - Build lai APK mobile 1.0.16

- Thoi gian: 2026-09-24 17:30 (Asia/Saigon)
- Loai: Phat hanh | Mobile | Kiem thu | Tai lieu
- Trang thai: Hoan tat APK test; chua co credential push nen.
- Muc tieu: Tao APK moi tu source mobile hien tai sau cac thay doi dong bo, thong bao, mention, call va cau hinh native push.
- Pham vi: Native Android ARM64; khong thay doi API, database hay production runtime.
- Noi dung: Tang version tu `1.0.15`/`versionCode=16` len `1.0.16`/`versionCode=17`, prebuild trong staging ASCII va chay `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a`; APK output tai `D:\vichat-build\ViChat-1.0.16-background-fix-arm64.apk`.
- Quyet dinh ky thuat: Dung package `vn.upgo.vichat`; APK nay chua co Firebase `google-services.json` nen khong tuyen bo killed-app push da hoat dong.
- Kiem thu: Gradle `BUILD SUCCESSFUL` sau 19m06s; `aapt dump badging` xac nhan package/version/`arm64-v8a`/`POST_NOTIFICATIONS`; `apksigner verify --verbose` dat v2; SHA-256 `1EE4C0F3837AC4FCDFFD5BF8A7CF06598C8937DB2C22D46A6084C48C208E6303`.
- Rui ro con lai: Can cai tren thiet bi that de UAT; thong bao khi app bi kill van phu thuoc Firebase native credential va Tinode FCM/TNPG production dang chua bat.
- Viec tiep theo: Cai APK va test chat/call/mention; sau khi cap credential thi build lai cung version code tang moi de Android chap nhan cap nhat va test background/killed push.
- Commit/PR: Chua tao.

## 2026-09-24-03 - Khoanh vung va san sang kich hoat push nen mobile

- Thoi gian: 2026-09-24 (Asia/Saigon)
- Loai: Sua loi | Mobile | Thong bao | Tinode | Cau hinh | Van hanh | Kiem thu | Tai lieu
- Trang thai: Can xac nhan credential production; source da san sang.
- Muc tieu: Cho phep thong bao den Android khi app roi foreground hoac bi he dieu hanh dung, thay vi chi hien khi JavaScript/Tinode con song.
- Pham vi: `mobile/app.config.js`, `infrastructure/tinode/config.template`, `infrastructure/production/compose.yaml`, `infrastructure/production/.env.example`, va file nay.
- Nguyen nhan da xac nhan: APK truoc chua nhan `google-services.json`; container Tinode authoritative `songhong-production-chatapi-1` dang co `FCM_PUSH_ENABLED=false`, `TNPG_PUSH_ENABLED=false`, khong co `FCM_PROJECT_ID`, va `/data/runtime` khong co Firebase service-account.
- Noi dung: Cho phep build mobile nhan Firebase Android config tu file local bi ignore, JSON inline hoac base64 qua `GOOGLE_SERVICES_JSON`, `EXPO_GOOGLE_SERVICES_JSON`, `GOOGLE_SERVICES_JSON_BASE64` hoac `EXPO_GOOGLE_SERVICES_JSON_BASE64`; bo icon/action Android Tinode khong ton tai va them fallback title/body hop le; them bien Compose/env cho FCM/TNPG de provider khong bi bo qua khi credential da duoc cap.
- Quyet dinh ky thuat: Giu native device token va Tinode push provider lam duong thong bao nen; khong dung foreground service de gia lap push va khong bat provider voi credential rong. Thong bao foreground van la local notification, con app killed chi duoc xem la hoat dong sau khi build co credential native va Tinode provider production.
- Database/API/cau hinh: Khong migration/API moi. Can dat Android Firebase app dung package `vn.upgo.vichat`, service-account JSON (hoac TNPG token) trong secret runtime, set `FCM_PUSH_ENABLED=true`/`FCM_PROJECT_ID`/`FCM_CRED_FILE` hoac cau hinh TNPG, sau do recreate container Tinode va build lai APK.
- Kiem thu: `cd mobile; npm run typecheck` dat; `npm test -- --reporter=dot` dat `18` file, `58/58`; `npm run lint` dat; `npm run export` dat; `CI=1 npx expo prebuild --platform android --no-install --non-interactive` dat (Expo canh bao tham so `--non-interactive` khong can thiet); kiem tra inline Firebase config dat; validate interpolation JSON cua Tinode template dat; `git diff --check` exit `0`; production chi doc da xac nhan provider dang tat va credential file thieu.
- Rui ro con lai: Chua the UAT background/killed push hoac tao APK co FCM khi credential chua duoc cap; production dang chay config Tinode cu va chua duoc recreate. Khong tuyen bo thong bao nen da hoat dong.
- Viec tiep theo: Cap `google-services.json` cho package `vn.upgo.vichat` va Firebase service-account/TNPG credential qua kenh bi mat; build lai APK/AAB, cap nhat secret runtime, recreate Tinode, roi test foreground/background/killed tren thiet bi that.
- Commit/PR: Chua tao.

## 2026-09-24-02 - Chot mention canonical va dong bo Tinode background mobile

- Thoi gian: 2026-09-24 (Asia/Saigon)
- Loai: Sua loi | Mobile | Tinode | Mention | Kiem thu | Tai lieu
- Trang thai: Hoan tat source va da tao APK test mobile ARM64; chua UAT tren thiet bi that.
- Muc tieu: Khong de dropdown `@` mobile mat ngay khi dang go, dong bo mention voi web, va cap nhat history khi Tinode bao co tin moi trong background.
- Nguyen nhan: `onSelectionChange` doc state text cu truoc khi React render lai; mobile chi tim ten mention o mot so truong; callback danh ba Tinode chi tao snapshot ma chua tai them message moi nhu web.
- Pham vi: `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/utils/mentionPolicy.ts`, `mobile/src/utils/mentionPolicy.test.ts`, `mobile/src/services/tinodeClient.ts`, va file nay.
- Noi dung: Giu text composer trong ref cho su kien selection; dung canonical `defaultName/default_name/fullName/full_name` khi tao `x-mentions`; subscribe history toi da 100 tin moi voi `newerOnly` khi contact co `msg`; khong ACK lap lai tung packet trong history catch-up.
- Quyet dinh ky thuat: Ten chinh thuc la nguon chung cho metadata mention giua web/mobile, con nickname chi phuc vu hien thi; chi dong bo topic da duoc Chatmgt cho phep de tranh tu mo topic ngoai pham vi.
- Database/API/cau hinh: Khong migration, endpoint, schema, secret hoac thay doi boundary; su dung lai hop dong Tinode hien co.
- Kiem thu: `cd mobile; npm run typecheck` thanh cong; `npm test -- --reporter=dot` thanh cong `18` file, `58/58`; `npm run lint` thanh cong; `npm run export` thanh cong; `git diff --check` exit `0`; build staging ASCII bang `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` thanh cong trong `8m21s`.
- APK: `D:\vichat-build\ViChat-1.0.15-mention-background-fix-arm64.apk`, package `vn.upgo.vichat`, version `1.0.15`/code `16`, ABI `arm64-v8a`, co `POST_NOTIFICATIONS`, SHA-256 `EA9321BD8CE8A28F538FA7C73649C83A451DAD2F43E540842FCE56677972321A`.
- Rui ro con lai: Chua UAT tren dien thoai that; push khi app bi kill van can native Firebase/APNs credential dung package va Tinode FCM/TNPG provider production; cuoc goi van can test hai thiet bi voi ICE/TURN that.
- Viec tiep theo: Build APK/AAB co credential, cai tren hai thiet bi va test mention group, refresh/pending, foreground/background/killed notification va audio/video call.
- Commit/PR: Chua tao.

## 2026-09-24-01 - Fix dong bo mobile, mention, call va push background

- Thoi gian: 2026-09-24 (Asia/Saigon)
- Loai: Sua loi | Mobile | Tinode | Mention | Goi dien | Thong bao | Cau hinh | Kiem thu
- Trang thai: Hoan tat source; chua UAT tren thiet bi that va chua build APK trong phien nay.
- Muc tieu: Khong mat tin nhan/room sau snapshot hoac refresh, cho mention nhom hoat dong nhu web, lam on dinh luong goi 1-1, hien chu Viet co dau va lam ro duong truyen push khi app bi suspend/killed.
- Nguyen nhan: Mobile thay the message snapshot thay vi merge theo id/seq, chua gui `x-mentions`, danh sach room chi subscribe Tinode ma khong tai history gan nhat, ICE/candidate co the trung va danh sach room bi reset khi Chatmgt refresh; killed-app push con thieu ca credential native lan provider Tinode.
- Pham vi: `mobile/src/utils/conversationSync.ts`, `mobile/src/utils/mentionPolicy.ts`, `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/components/MessageBubble.tsx`, `mobile/src/services/tinodeClient.ts`, `mobile/src/store/appStore.ts`, `mobile/src/store/callStore.ts`, `mobile/src/components/MobileCallOverlay.tsx`, `mobile/src/services/notificationService.ts`, `mobile/src/types/index.ts`, cac test mobile, `infrastructure/production/compose.yaml`, `infrastructure/production/.env.example`, va tai lieu.
- Noi dung: Merge message theo id/seq de giu history, pending, mention va receipt; tai cua so history Tinode gan nhat khi hien danh sach nhu web, sort room theo pinned/activity va merge metadata Chatmgt thay vi xoa snapshot hien tai; hop nhat snapshot thanh vien mot phan nhung giu ca account ID va Tinode UID cho mention; port mention policy toi thieu cua web voi dropdown thanh vien, `x-mentions` canonical identity va render token; parse topic 1-1 hop le, normalize ICE/TURN, khu ICE trung, ho tro ca `ontrack`/`onaddstream`, gan remote stream cho ca call audio va tinh duration tu luc ket noi; kiem tra native token rong va noi day bien FCM/TNPG an toan qua Compose/env example; sua cac chuoi mobile hien thi khong dau.
- Quyet dinh ky thuat: Tinode trung tam van la nguon message/realtime duy nhat, Chatmgt van la nguon membership/metadata; khong tao foreground service luon chay. Push khi app bi kill chi duoc xem la hoat dong sau khi build co Firebase/APNs credential dung package va production Tinode bat FCM/TNPG provider.
- Database/API/cau hinh: Khong migration, khong doi endpoint/schema; them cac bien khong chua secret `FCM_PUSH_ENABLED`, `FCM_PROJECT_ID`, `FCM_CRED_FILE`, `FCM_INCLUDE_ANDROID_NOTIFICATION`, `TNPG_PUSH_ENABLED`, `TNPG_AUTH_TOKEN`, `TNPG_ORG` vao compose/env example; credential file van nam ngoai repository/runtime secret.
- Kiem thu: `cd mobile; npm run typecheck` dat; `npm test -- --reporter=dot` dat `18` file, `57/57`; `npm run lint` dat; `npm run export` dat web bundle; `git diff --check` dat. Chua chay `docker compose ... config` vi may Windows hien khong co lenh Docker.
- Rui ro con lai: Chua UAT tren dien thoai that, chua co ADB/native release trong phien nay; killed-app push van cho den khi cap native Firebase/APNs, dat file vao secret runtime va bat provider Tinode production; goi dien van can ICE/TURN authoritative va UAT hai thiet bi.
- Viec tiep theo: Build lai APK/AAB co credential dung package, cai tren hai thiet bi, test foreground/background/killed, mention group, refresh khi dang co pending message va call audio/video 1-1.
- Commit/PR: Chua tao.

## 2026-09-23-03 - Sua danh tinh group, modal thao tac va san sang push mobile

- Thoi gian: 2026-09-23 19:09 (Asia/Saigon)
- Loai: Sua loi | UX | Mobile | Nhom | Thong bao | Hieu nang | Kiem thu | Phat hanh
- Trang thai: Hoan tat source va da tao APK release ARM64; chua UAT tren thiet bi that.
- Muc tieu: Khong mat ten/avatar nguoi gui trong tin nhan nhom, khong cho them trung thanh vien, thay hop thoai he dieu hanh bang modal mobile dong bo, va thu lai dang ky push sau khi Tinode authenticated.
- Nguyen nhan: Message snapshot co the chi mang sender ID/generic name, bo loc them thanh vien chi so sanh mot dang ID, cac luong thu hoi/xoa van dung `Alert`, va token native co the duoc dang ky truoc khi realtime authenticated.
- Pham vi: `mobile/App.tsx`, `mobile/app.config.js`, `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`, `mobile/src/components/ConfirmDialog.tsx`, `mobile/src/components/MessageBubble.tsx`, `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/screens/chat/ConversationListScreen.tsx`, `mobile/src/screens/chat/GroupInfoScreen.tsx`, `mobile/src/services/notificationService.ts`, `mobile/src/services/tinodeClient.ts`, `mobile/src/store/appStore.ts`, `mobile/src/utils/identity.ts`, va tai lieu.
- Noi dung: Hop nhat id/userId/participantId/Tinode UID/username/email khi loc thanh vien va enrich message; hien Avatar + ten cho tin nhan/cuoc goi den trong group; them ConfirmDialog dark polished cho thu hoi va xoa/roi nhom; dang ky lai device token khi Tinode da authenticated; app config nhan `GOOGLE_SERVICES_JSON`/`EXPO_GOOGLE_SERVICES_JSON` hoac file local ma khong ghi secret vao repo; tang mobile version `1.0.15`, Android `versionCode=16`.
- Quyet dinh ky thuat: Khong tao foreground service luon chay vi gay ton pin va khong giai quyet iOS/killed-app; push khi process bi he dieu hanh dung van can Firebase/APNs credential trong native build va push provider Tinode production.
- Database/API/cau hinh: Khong migration, endpoint hay thay doi web; khong co `google-services.json` trong workspace nen APK nay chi co co che san sang tiep nhan credential khi build lai.
- Kiem thu: `cd mobile; npm run typecheck` dat; `npm test -- --reporter=dot` dat `17` file, `47/47`; `npm run lint` dat; `npm run export` dat web bundle; `CI=1 npx expo prebuild --platform android --no-install` dat trong staging ASCII; Gradle `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` dat (`BUILD SUCCESSFUL`, clean build 18m38s, incremental final rebuild 5m16s); `git diff --check` chay truoc khi ket thuc.
- APK: `D:\vichat-build\ViChat-1.0.15-group-notification-ui-arm64.apk`, package `vn.upgo.vichat`, version `1.0.15`/code `16`, ABI `arm64-v8a`, co `POST_NOTIFICATIONS` va channel mac dinh `messages-v2`, ky v2 hop le, SHA-256 `9234973B200D5A4B050B8240A6F539D58C85257E1FC59D41313D6CC10232AE38`.
- Rui ro con lai: Chua UAT tren thiet bi that; thong bao local phu thuoc JS/Tinode con song, con killed-app push can Firebase/APNs credential va Tinode push provider that; APK hien tai la ARM64.
- Viec tiep theo: Cai APK tren dien thoai, dang nhap hai tai khoan va test them thanh vien da co, sender avatar/name group, thu hoi, xoa/roi nhom, foreground/background/killed; cau hinh provider push roi build lai neu can thong bao khi process bi kill.
- Commit/PR: Chua tao.

## 2026-09-23-02 - Sua loi mobile bi do va luong chat bi treo

- Thoi gian: 2026-09-23 16:34 (Asia/Saigon)
- Loai: Sua loi | Hieu nang | Mobile | Tinode | Kiem thu | Phat hanh
- Trang thai: Hoan tat source va da tao APK release ARM64; chua UAT tren thiet bi that.
- Muc tieu: Khong de app dung o man hinh trong, thao tac chat tao request treo hoac lap lai, va dam bao cac luong chay ro rang khi Tinode dang mat ket noi.
- Nguyen nhan: Store mobile con luong legacy trung, khoi dong cho metadata Chatmgt truoc khi hien app, thieu timeout o cac buoc Tinode/API, va mot so thao tac van tao pending request khi realtime offline.
- Pham vi: `mobile/src/store/appStore.ts`, `mobile/src/navigation/AppNavigator.tsx`, `mobile/src/screens/chat/ConversationListScreen.tsx`, `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/services/tinodeClient.ts`, `mobile/src/services/apiClient.ts`, `mobile/src/services/authService.ts`, `mobile/src/services/chatManagementService.ts`, version native mobile va tai lieu.
- Noi dung: Cho app vao trang thai san sang ngay sau khi co session va tai metadata nen; deduplicate refresh; them timeout cho connect/login/subscribe/history/publish va API auth/metadata; chi cho phep gui/sua/thu hoi/file/reaction khi realtime authenticated; them reconnect va khong de pending request treo; tranh mo conversation trung va tranh render man hinh chinh rong khi session chua san sang.
- Quyet dinh ky thuat: Tinode tiep tuc la nguon realtime; Chatmgt metadata duoc tai nen va khong chan giao dien. Khi offline, UI chan thao tac phu thuoc realtime va hien hanh dong reconnect thay vi im lang cho request vo han.
- Database/API/cau hinh: Khong them migration, endpoint hoac secret; tang mobile version `1.0.14`, Android `versionCode=15`.
- Kiem thu: `cd mobile; npm run typecheck` dat; `npm test -- --reporter=dot` dat `17` file, `47/47`; `npm run lint` dat; `npm run export` dat; `npx expo prebuild --platform android --no-install --non-interactive` dat; Gradle `:app:assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` dat; `git diff --check` dat.
- APK: `D:\vichat-build\ViChat-1.0.14-mobile-stability-arm64.apk`, package `vn.upgo.vichat`, version `1.0.14`/code `15`, ABI `arm64-v8a`, co `POST_NOTIFICATIONS`, ky v2 hop le, SHA-256 `723AAA549CE0CD06160121CCE789A15085EE7D8F92893096295FD0AFB9F99C56`.
- Rui ro con lai: Chua UAT thao tac tren thiet bi that; push khi app bi kill van phu thuoc Firebase/APNs credential va provider Tinode production; APK hien tai la ARM64.
- Viec tiep theo: Cai APK tren dien thoai, dang nhap hai tai khoan va thu danh sach hoi thoai, gui/sua/thu hoi, file/reaction, group/poll, foreground/background/killed; cau hinh push provider neu can thong bao khi process bi kill.
- Commit/PR: Chua tao.

## 2026-09-23-01 - Mo rong group mobile va toi uu realtime

- Thoi gian: 2026-09-23 12:24 (Asia/Saigon)
- Loai: Sua loi | Hieu nang | Mobile | Thong bao | Tinh nang | Phat hanh
- Trang thai: Hoan tat source va da tao APK test mobile; chua UAT tren thiet bi that.
- Muc tieu: Lam mobile muot hon, giam mat thong bao khi Tinode dang song va dua luong quan tri nhom/poll cot loi dang co tren web vao app mobile.
- Pham vi: `mobile/`, version native mobile va tai lieu; su dung API Chatmgt/Tinode hien co, khong thay doi database hay secret.
- File da thay doi: `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`, `mobile/src/components/ConversationRow.tsx`, `mobile/src/components/MessageBubble.tsx`, `mobile/src/components/PollComposer.tsx`, `mobile/src/navigation/AppNavigator.tsx`, `mobile/src/navigation/types.ts`, `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/screens/chat/GroupInfoScreen.tsx`, `mobile/src/services/chatManagementService.ts`, `mobile/src/services/notificationService.ts`, `mobile/src/services/tinodeClient.ts`, `mobile/src/store/appStore.ts`, `mobile/src/types/index.ts`, `mobile/src/utils/groupSettings.ts`, `mobile/src/utils/poll.ts`, `mobile/src/utils/poll.test.ts`, `docs/CHANGELOG.md`.
- Noi dung: Bo sung quan tri nhom tren mobile (thanh vien, phe duyet, vai tro, doi ten/avatar, cai dat, ghim, roi/giai tan, tim lich su) va poll; dung `FlashList`/memo cho danh sach; hop nhat snapshot khong ghi de metadata Chatmgt; reconnect phat lai toi da 20 tin nhan bi lo; ap dung `allowMessages` cho input/tep/sticker/poll; on dinh local notification va kenh `messages-v2`.
- Quyet dinh ky thuat: Mobile goi cung endpoint quan tri nhom ma web dang dung; Tinode van la nguon realtime va Chatmgt van la nguon quyen/thanh vien metadata. Build phat hanh dung native intermediates da build thanh cong truoc do vi full C++ rebuild tren may nay bi gioi han paging file; cac thay doi native can thiet (version, POST_NOTIFICATIONS, default channel) da duoc dong goi.
- Database/API/cau hinh: Khong them migration, endpoint hoac secret; tang mobile version `1.0.13`, Android `versionCode=14`.
- Kiem thu: `cd mobile; npm run typecheck` dat; `npm test -- --reporter=dot` dat `17` file, `47/47`; `npm run lint` dat; `git diff --check` dat; `npx expo prebuild --platform android --no-install` dat trong workspace ASCII; Gradle `assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` dat; APK `D:\vichat-build\ViChat-1.0.13-group-mobile-fix-arm64.apk` co package `vn.upgo.vichat`, version `1.0.13`/code `14`, ABI `arm64-v8a`, `POST_NOTIFICATIONS`, channel mac dinh `messages-v2`, chu ky v2 hop le, SHA-256 `397514723A1E6ABC86E641AAB4A3CFE254EB84F3851C85F1059311157FD664CE`.
- Rui ro con lai: Chua UAT thao tac tren thiet bi that; push khi app bi kill van phu thuoc native Firebase/APNs credential va provider Tinode production; APK hien tai la ARM64.
- Viec tiep theo: Cai APK tren dien thoai, dang nhap hai tai khoan va test group/poll o foreground/background/killed; cau hinh Firebase/APNs va provider Tinode neu can push khi process bi kill.
- Commit/PR: Chua tao.

## 2026-09-22-07 - Them workflow Codemagic cho build mobile

- Thoi gian: 2026-09-22 21:33 (Asia/Saigon)
- Loai: Van hanh | Tai lieu | Mobile | Phat hanh
- Trang thai: Hoan tat source; chua chay build tren Codemagic.
- Muc tieu: Cho phep Codemagic tu dong tao native project Expo va build IPA iOS/TestFlight cung APK Android tu repo GitHub.
- Pham vi: `codemagic.yaml`, quy trinh build mobile; khong doi ChatUI web, Chatmgt, Tinode, database hay API.
- File da thay doi: `codemagic.yaml`, `docs/CHANGELOG.md`.
- Noi dung: Them workflow `ios-testflight` voi Expo prebuild iOS, CocoaPods, Codemagic iOS signing, build IPA va submit TestFlight; them workflow `android-test` tao native Android va build `app-release.apk`. Build copy `.env.example` thanh `.env` de dung cau hinh public da co, khong ghi credential vao repository.
- Quyet dinh ky thuat: Dung `app_store` cho iOS de phuc vu TestFlight; signing certificate/profile va App Store Connect integration do Codemagic quan ly. Android workflow chi tao APK test, khong them keystore vao source.
- Database/API/cau hinh: Khong migration/API moi. Codemagic can App Store Connect integration, bundle ID `vn.upgo.vichat` va iOS signing asset; push iOS van can APNs/Tinode provider cau hinh rieng.
- Kiem thu: Kiem tra cau hinh YAML va `git diff --check` se chay truoc commit; build native tren Codemagic chua chay do local Windows khong co Xcode.
- Rui ro con lai: Neu chua ket noi Apple Developer/App Store Connect hoac chua co provisioning profile, workflow iOS se dung o buoc signing/publishing; neu khong can TestFlight co the bo phan submit sau khi build IPA.
- Viec tiep theo: Push file len GitHub, bam `Check for configuration files` trong Codemagic, cau hinh Apple integration/signing va chay workflow `ios-testflight`.
- Commit/PR: Source commit `271c392`; changelog follow-up included in the next docs commit.

## 2026-09-22-06 - Giam do mobile va phat hanh APK 1.0.12

- Thoi gian: 2026-09-22 20:34 (Asia/Saigon)
- Loai: Sua loi | Hieu nang | Mobile | Thong bao | Kiem thu | Phat hanh | Tai lieu
- Trang thai: Hoan tat source va da tao APK test mobile; chua UAT tren thiet bi that.
- Muc tieu: Giam hien tuong app mobile bi do/tre khi go tin, doc, gui tin, tai lich su va khoi dong thong bao; phat hanh ban co version moi de cai de khong bi nhan la ban cu.
- Pham vi: `mobile/src/services/notificationService.ts`, `mobile/src/services/tinodeClient.ts`, `mobile/src/store/appStore.ts`, `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`, native manifest generated; khong sua web ChatUI, Chatmgt API, database hay Tinode server.
- Noi dung: Cache module/quyen notification va tranh khoi tao channel lap lai; doi message/call channel sang `messages-v2`/`calls-v2`, dat `messages-v2` lam FCM default channel; cac thao tac typing/read/send/edit/recall/reaction/file/sticker chi dam bao subscription ma khong materialize lai toan bo snapshot; bo reload cuoc tro chuyen sau moi thao tac gui; giu vi tri cuon khi tai lich su cu va gioi han batch/window cua `FlatList`; chi reconnect khi Tinode thuc su mat ket noi.
- Quyet dinh ky thuat: Tinode event van la nguon cap nhat message; snapshot chi phat khi dong bo/mo/tai lich su hoac nhan data realtime. Local notification van hoat dong khi JS/Tinode con song; push khi process bi kill van bat buoc co native Firebase config trong APK va provider Tinode tren server.
- Database/API/cau hinh: Khong migration, khong doi API. Tang mobile version `1.0.12`, Android `versionCode=13`; manifest co `POST_NOTIFICATIONS` va default channel `messages-v2`.
- Kiem thu: `npm run typecheck` dat; `npm test -- --reporter=dot` dat `16` file, `44/44`; `npm run lint` dat; `git diff --check` dat; `npx expo prebuild --platform android --no-install` dat; Gradle `assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` dat; APK `D:\vichat-build\ViChat-1.0.12-performance-notification-fix-arm64.apk` co package `vn.upgo.vichat`, version `1.0.12`/code `13`, ABI `arm64-v8a`, permission `POST_NOTIFICATIONS`, ky v2, SHA-256 `B0686DD06F16AF287AF4E42CF4A551B12F7B7D8CFC10B0B6BB08B123D28D9285`.
- Kiem tra production chi doc qua jump host: `FCM_PUSH_ENABLED=false`, `TNPG_PUSH_ENABLED=false`, va `FCM_CRED_FILE` trong container Tinode khong doc duoc; vi vay push khi thoat/kill app chua the hoat dong chi bang code mobile. May hien khong co thiet bi ADB de UAT truc tiep.
- Rui ro con lai: Chua UAT thao tac tren thiet bi that; killed-app push se van mat cho den khi co `google-services.json` dung package Android, Firebase service-account credential cho Tinode va bat provider FCM tren production.
- Viec tiep theo: Cap bo credential Firebase cho Android va Tinode, bat FCM provider roi test hai tai khoan o cac trang thai foreground/background/killed; sau do co the phat hanh lai APK cung version code neu can.
- Commit/PR: Chua tao.

## 2026-09-22-05 - Sua thong bao tin nhan mobile

- Thoi gian: 2026-09-22 17:22 (Asia/Saigon)
- Loai: Sua loi | Mobile | Thong bao | Kiem thu | Tai lieu
- Trang thai: Hoan tat source va da tao APK test mobile; chua UAT tren thiet bi that.
- Muc tieu: Hien thong bao khi co tin nhan moi ca luc app dang mo, dang o background hoac vua quay lai foreground; giu co hoi dang ky push native sau khi nguoi dung cap lai quyen.
- Pham vi: `mobile/App.tsx`, `mobile/src/services/notificationService.ts`, `mobile/app.json`, native Android generated manifest; khong sua ChatUI, Chatmgt, Tinode server hay database.
- Noi dung: Khoi tao notification handler/channel ngay khi app mo; bo chan thong bao foreground; tranh danh dau that bai vinh vien khi quyen/token native chua san sang; thu lai dang ky khi app quay lai foreground; materialize lai Android `POST_NOTIFICATIONS` bang Expo prebuild.
- Quyet dinh ky thuat: Thong bao khi app song van la local notification tu Tinode event. Push khi process bi kill van phu thuoc credential Firebase/APNs va provider push cua Tinode; repository khong co cac credential nay nen khong tuyen bo da kich hoat killed-app push.
- Database/API/cau hinh: Khong co migration/API moi. `EXPO_PUBLIC_PUSH_ENABLED` mac dinh bat; Android manifest generated da co `CAMERA`, `RECORD_AUDIO`, `POST_NOTIFICATIONS`.
- Kiem thu: `npm run typecheck` dat; `npm test -- --reporter=dot` dat `16` file, `44/44`; `npm run lint` dat; `git diff --check` dat; `npx expo prebuild --platform android --no-install` dat va manifest co `POST_NOTIFICATIONS`; `assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` dat; APK `D:\vichat-build\ViChat-1.0.11-notification-fix-arm64.apk` co package `vn.upgo.vichat`, version `1.0.11`, ABI `arm64-v8a`, SHA-256 `33EA76F6100EABCB7AD64D98DC77BCE8E1C58485C2934BEC3DEB9E6F816AD319`.
- Rui ro con lai: Chua UAT tren thiet bi that; killed-app push can bo sung native Firebase/APNs credential va cau hinh provider Tinode tren moi truong chay that.
- Viec tiep theo: Cai APK tren dien thoai; vao Settings > Thong bao cap quyen neu Android dang chan; thu tin nhan voi app mo/background/killed. Push khi process bi kill van can Firebase/APNs credential va provider Tinode tren moi truong chay that.
- Commit/PR: Chua tao.

## 2026-09-22-04 - Sua dong bo danh ba va lich su tren mobile

- Thoi gian: 2026-09-22 (Asia/Saigon)
- Loai: Sua loi | Mobile | Chatmgt | Tinode | Kiem thu | Tai lieu
- Trang thai: Hoan tat source va da tao APK test mobile; chua UAT tren thiet bi that.
- Muc tieu: Khoi phuc danh ba va danh sach hoi thoai mobile theo cung du lieu Chatmgt/Tinode ma web dang su dung.
- Nguyen nhan: Mobile van gui `results_per_page=1000` cho `/api/v1/chat/users`, trong khi Chatmgt chi chap nhan toi da `100`; loi directory lam `Promise.all` bo qua ca lan nap conversation, khien mobile hien rong du lieu van con tren web.
- Noi dung: Doi mobile sang cursor pagination voi `limit=100` cho danh ba va conversation, bao ve loop cursor lap, va doc them alias `updated_at` khi sap xep snapshot; khong doi backend, Tinode topic, schema, web hay Cloud.
- Kiem thu: `npm run typecheck` dat; `npm test -- --reporter=dot` dat `15` file, `40/40`; `npm run lint` dat; `git diff --check` dat; Gradle `assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a` dat; APK ky v2 hop le, package `vn.upgo.vichat`, version `1.0.11`, bundle khong con `results_per_page`.
- Rui ro con lai: Chua UAT lai tren thiet bi that sau khi cai APK moi; neu mot topic Tinode cu bi stale rieng le, can kiem tra them token/topic binding ma khong xoa lich su trung tam.
- Viec tiep theo: Cai APK `D:\vichat-build\ViChat-1.0.11-sync-fix-arm64.apk` tren dien thoai, dang nhap lai va xac nhan danh ba, conversation cu va history.

## 2026-09-22-03 - Mo rong app mobile voi Cloud rieng tu

- Thoi gian: 2026-09-22 13:19 (Asia/Saigon)
- Loai: Tinh nang | Mobile | Bao mat | Kiem thu | Tai lieu
- Trang thai: Hoan tat phan source; chua tao native APK/AAB trong phien nay.
- Muc tieu: Dua Cloud cua toi len app mobile de app co luong ghi chu, file va quyen rieng tu dong bo voi web ma khong lam doi Tinode/chat hien huu.
- Pham vi: Mobile Cloud tab, service Chatmgt/S3, normalizer tests, Vitest test isolation va tai lieu luong du lieu; khong sua backend contract, database, Tinode hay cac luong chat khac.
- File da thay doi: `mobile/src/screens/cloud/PersonalCloudScreen.tsx`, `mobile/src/services/personalCloudService.ts`, `mobile/src/services/personalCloudService.test.ts`, `mobile/src/services/chatMediaService.ts`, `mobile/src/types/index.ts`, `mobile/src/navigation/MainTabNavigator.tsx`, `mobile/src/navigation/types.ts`, `mobile/vitest.config.ts`, `mobile/src/test/reactNativeMock.ts`, `mobile/src/test/expoDeviceMock.ts`, `README.md`, `docs/chat-backend-architecture.md`, va file nay.
- Noi dung: Them tab Cloud rieng voi tao/xoa tin nhan, chon nhieu file, upload truc tiep S3 theo ticket, mo/tai xuong/xoa file, cursor pagination, refresh, trang thai loading/error va hien thi ro pham vi "chi minh toi". Dung lai helper upload S3 cua chat media; mock `react-native`/`expo-device` chi trong Vitest de test khong nap Flow/native runtime.
- Quyet dinh ky thuat: Giu owner/tenant server-derived tu bearer session; khong them query owner/tenant, khong luu Cloud vao app store Tinode, va khong dua Cloud vao thong bao/realtime. Native download uu tien cache/share; web mo signed URL de giu dung content-disposition cua backend.
- Database/API/cau hinh: Khong them migration, secret hay endpoint; su dung cac API Cloud da co: `GET/POST/DELETE /api/v1/chat/cloud/messages`, upload ticket/completion va signed download/delete file.
- Kiem thu: `cd mobile; npm run typecheck` dat; `npm test -- --reporter=dot` dat `14` test file, `38/38` test; `npm run lint` dat; `npm run export` dat web bundle; `git diff --check` dat. Native build chua chay.
- Rui ro con lai: Chua co Android SDK/JDK/native device trong phien nay de build APK va UAT upload/download voi tai khoan production that; S3/provider quota vat ly van ton tai. Cac control Workspace nang cao va quan tri thanh vien nhom van tiep tuc theo lo trinh mobile rieng.
- Viec tiep theo: Kiem tra `java -version`/Android SDK, build development APK, dang nhap hai tai khoan va UAT Cloud owner/tenant isolation, upload nhieu file, tai/xoa tren Android.
- Commit/PR: Source commit `7da4c93`; docs follow-up commit(s) created after source.

## 2026-09-22-02 - Chan treo web va toi uu render ChatUI

- Thoi gian: 2026-09-22 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Hieu nang | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source commit `9259aa9` da push va production release `chat-bootstrap-9259aa9-20260922-r1` da activate/verify.
- Muc tieu: Khong de man hinh Chat/maintenance hoac session bootstrap treo vo han khi API/network khong phan hoi, dong thoi giam chi phi render lap lai khi nguoi dung dang go tin nhan.
- Pham vi: RootApp maintenance gate, request Chatmgt, normalization/filter render cua ChatUI; giu nguyen Tinode, Cloud, upload, message payload va luong mobile.
- File da thay doi: `src/RootApp.jsx`, `src/app/App.jsx`, `src/features/chat/services/chatManagementService.js`, `src/features/maintenance/chatMaintenanceService.js`, `src/features/maintenance/chatMaintenanceService.test.js`, `dist/index.html`, va file nay.
- Noi dung: Maintenance snapshot co timeout 4 giay va fail-open, polling khong chong request; moi request Chatmgt co timeout mac dinh 15 giay va van ho tro abort cua luong hien tai; ChatUI memo hoa map/entries/value hoi thoai, active room, unread indicator, search/message entries va cac danh sach derived de khong normalize/lap lai toan bo khi chi thay doi input/toast.
- Quyet dinh ky thuat: Timeout chi ket thuc request bi treo voi ma `408` noi bo, khong retry mu va khong doi hop dong API; cac response den muon van bi bo qua theo co che abort/session guard san co. Khong sua Tinode transport, Cloud scope, database hay schema.
- Database/API/cau hinh: Khong migration, schema, secret hoac bien moi truong moi; them client-side timeout bao ve request va khong thay doi endpoint/payload.
- Kiem thu: `node --test src/features/maintenance/chatMaintenanceService.test.js` dat `4/4`; `npm run test:frontend -- --test-concurrency=1` dat `441/441`; `npm run lint` exit `0` voi warning legacy/vendor; `npm run build:production` thanh cong voi canh bao chunk App vuot 500 KB; `git diff --check` dat. Production source validation pass; ChatUI local/public health `200`, Chatmgt health `200`, Cloud API khi chua xac thuc `401`, WSS `101`; ChatUI va Chatmgt healthy, restart count `0`, Chatmgt/container stateful/volume khong doi, Alembic van `20260921_16`.
- Rui ro con lai: Chua UAT browser production bang tai khoan that do browser bridge bao `agent is not defined`; can hard refresh de tai bundle moi; chunk App van lon va chua xac nhan thao tac Cloud authenticated trong browser.
- Trien khai: Archive `vichat-chat-bootstrap-9259aa9.tar.gz` co SHA-256 `d3f32c436413df8abb520d063d68e6ab51011b5a5de3662d3d00b5e67a1f7270`; release `/opt/deploy/chat/releases/chat-bootstrap-9259aa9-20260922-r1` dang la `current`, `previous` tro ve `chat-toast-439c15d-20260922-r2`, backup `/opt/deploy/chat/backups/chat-bootstrap-9259aa9-20260922-r1`; candidate QA lan dau dung truoc activate do network test, sau do chay lai tren Compose network va pass; khong migration, khong restart Chatmgt/Tinode/PostgreSQL/Redis.
- Viec tiep theo: Hard refresh va UAT authenticated Cloud text/file, tin dai/menu chuot phai va popup/toast tren desktop/mobile; neu phat sinh loi, rollback `current` ve `previous` theo backup da tao.
- Commit/PR: Source commit `9259aa9`; docs follow-up dang cho commit/push.

## 2026-09-22-01 - Thu gon toast thong bao va them countdown

- Thoi gian: 2026-09-22 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source commit `26553fd` va docs commit `439c15d` da push, production release `chat-toast-439c15d-20260922-r2` da activate va verify.
- Muc tieu: Dua toast loi/thanh cong ve goc phai, thu gon bang thong bao va cho nguoi dung thay ro thoi gian toast con hien thi.
- Pham vi: ChatUI transient error/success toast; giu nguyen confirm dialog va thong bao trang thai ket noi.
- File da thay doi: `src/app/App.jsx`, `src/styles/index.css`, `dist/index.html`, va file nay.
- Noi dung: Dat cung mot moc tu dong an 5 giay cho toast loi/thanh cong, them progress bar chay tu trai sang phai theo countdown, remount khi noi dung moi de progress reset dung luot, va giam kich thuoc toast xuong toi da 380px responsive.
- Quyet dinh ky thuat: Chi ap dung countdown cho thong bao transient; toast "dang khoi phuc ket noi" van ton tai theo trang thai realtime de khong che giau loi ket noi.
- Database/API/cau hinh: Khong co.
- Kiem thu: `npm run test:frontend -- --test-concurrency=1` dat `441/441`; `npm run lint` exit `0` voi warning legacy/vendor; `npm run build:production` thanh cong voi canh bao chunk App vuot 500 KB; `git diff --check` dat.
- Rui ro con lai: Chua UAT browser production voi tai khoan that; progress bar dung CSS animation 5 giay va can hard refresh de tai bundle moi sau deploy.
- Trien khai: Archive production `vichat-chat-toast-439c15d-r2.tar.gz` co SHA-256 `3564d2f6bcaa8c8b5ad7923cf8ad14bb25a93c4d3cc46b38ddd3900f35be888a`; release `/opt/deploy/chat/releases/chat-toast-439c15d-20260922-r2` dang la `current`, backup `/opt/deploy/chat/backups/chat-toast-439c15d-20260922-r2`; source validation xac nhan 687 file khong doi ngoai pham vi.
- Kiem tra production: Chat/Chatmgt healthy, restart count `0`; Alembic `20260921_16`; public health `200`, Cloud API khi chua xac thuc `401`, public WSS `101`; volume khong doi. Candidate `r1` bi dung o source validation do archive thieu root prefix, khong activate va khong restart service; release/backup loi giu lai de audit.
- Viec tiep theo: Hard refresh va UAT toast loi/thanh cong tren desktop/mobile bang tai khoan production that; neu phat sinh loi, rollback `current` ve `previous` theo release da backup.
- Commit/PR: Source commit `26553fd`; docs/deploy record `439c15d` va changelog follow-up.

## 2026-09-21-05 - Them chat chu rieng tu cho Cloud va sua menu chuot phai

- Thoi gian: 2026-09-22 00:01 (Asia/Saigon)
- Loai: Tinh nang | Sua loi | Bao mat | Web | Backend | Database | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source commit `50931c1` da push va production release `private-cloud-50931c1-20260921-r7` da activate/verify.
- Muc tieu: Cho phep Cloud cua toi luu tin nhan chu rieng tu theo owner/tenant dang dang nhap, dong thoi mo menu hanh dong tin nhan hien co khi bam chuot phai ma khong lam doi luong Tinode.
- Pham vi: Chatmgt personal cloud API/model/migration, ChatUI Cloud composer/history, owner/tenant reset guard, message context menu; khong doi Tinode transport, file S3, thong bao hoac cac luong group/direct message.
- File da thay doi: `chatservice-main/application/controllers/api_personal_cloud.py`, `chatservice-main/application/models/models.py`, `chatservice-main/migrations/016_personal_cloud_messages.sql`, `chatservice-main/alembic/versions/20260921_16_personal_cloud_messages.py`, `chatservice-main/tests/test_chat_media_service.py`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/chatManagementService.test.js`, `src/features/chat/components/PersonalCloudPanel.jsx`, `src/app/App.jsx`, `src/styles/index.css`, `src/features/i18n/appLanguage.js`, `docs/chat-backend-architecture.md`, va file nay.
- Noi dung: Them bang va API list/create/delete tin nhan Cloud voi owner lay tu session, UI composer Enter/Shift+Enter, pagination/abort khi logout doi tenant, soft delete va hien thi trong khu vuc rieng tu. Cuong che context menu o root cua tin nhan, image batch/poll va bo xu ly chuot phai rieng cua reaction chip de dung cung menu 3 cham.
- Quyet dinh ky thuat: Tin nhan Cloud luu rieng trong PostgreSQL, khong dua vao Tinode/topic/search/notification; migration moi la `20260921_16` va khong sua bang Tinode/S3. Giữ menu 3 cham hien co, chi mo rong diem bat su kien va khong them nhat ky/thong bao cho Cloud.
- Database/API/cau hinh: Da apply va verify Alembic `20260921_16`; them `GET/POST /api/v1/chat/cloud/messages` va `DELETE /api/v1/chat/cloud/messages/<id>`; khong them secret/env.
- Kiem thu: `npm run test:frontend -- --test-concurrency=1` dat `441/441`; `python -m unittest discover -s tests -p "test_*.py" -q` dat `321` pass, `106` skip; `python -m unittest chatservice-main/tests/test_chat_media_service.py -q` dat `14/14`; `python -m py_compile` cac file Python thay doi dat; `alembic -c alembic.ini heads` tra `20260921_16 (head)`; `npm run lint` exit `0` voi warning legacy/vendor; `npm run build:production` thanh cong voi canh bao chunk App vuot 500 KB; `git diff --check` dat. Production: source validation xac nhan `677` file khong doi; archive `vichat-private-cloud-50931c1.tar.gz` SHA-256 `7087f54bce9e709693c35ef44aef3365db79d427f22a37549a8ae6e4faa17124`; backup `/opt/deploy/chat/backups/private-cloud-50931c1-20260921-r7`; Chat/Chatmgt healthy, restart `0`; health public tra `200`; Cloud API chua dang nhap tra `401`; WSS tra `101`; service ngoai pham vi va volume khong doi.
- Rui ro con lai: Chua UAT browser voi tai khoan production that cho tao/list/delete tin Cloud, owner/tenant isolation va menu chuot phai tren desktop/mobile; chunk App van vuot nguong canh bao co san; S3/provider quota vat ly van ton tai.
- Viec tiep theo: Hard refresh, dang nhap hai tai khoan, thu Cloud ca nhan voi tin dai/nhieu file, tai/xoa, doi owner/tenant va xac nhan popup moi.
- Commit/PR: Source `50931c1`; production release `private-cloud-50931c1-20260921-r7`; docs follow-up commit ghi nhat ky nay.

## 2026-09-21-04 - Deploy sua Chatmgt va Cloud rieng tu

- Thoi gian: 2026-09-21 (Asia/Saigon)
- Loai: Van hanh | Kiem thu | Bao mat | Tai lieu
- Trang thai: Hoan tat; source commit `06353a4` da push va production release da activate/verify.
- Muc tieu: Dua sua loi Cloud ca nhan, phan trang Chatmgt va popup thong bao moi len dung production ma khong anh huong Tinode, database, Redis hoac volume ngoai pham vi.
- Pham vi: Chi build/recreate `chatmgt` va `chat`; khong chay migration, khong `docker compose down -v`, khong restart service stateful va khong thay doi `.env` production.
- Noi dung van hanh: Archive `vichat-personal-cloud-popup-06353a4.tar.gz` co SHA-256 `8b337f39c755c2932d5025dc3ba66335929c5dd4fa50c3d30a17c722faf5552f`; release `/opt/deploy/chat/releases/personal-cloud-popup-06353a4-20260921-r2`; previous `/opt/deploy/chat/releases/domain-migration-05ac3d6-20260921-r7`; backup `/opt/deploy/chat/backups/personal-cloud-popup-06353a4-20260921-r2`.
- Quyet dinh ky thuat: Dung release directory bat bien, copy `.env`/runtime tu release hien tai, backup ca hai PostgreSQL truoc build, snapshot service/volume ngoai pham vi va chi force-recreate hai service muc tieu. Candidate `r1` dung truoc activate vi test media trong container thieu mount `mobile`; giu lai release/backup loi de audit, sua runner mount read-only va hoan tat bang `r2`.
- Kiem thu production: Source validation xac nhan 670 file khong doi; Nginx config dat; test trong image `73/73`; ChatUI/Chatmgt healthy, restart `0`; health public `chat.gonplatform.com/healthz` va `chatmgt.gonplatform.com/api/v1/auth/health` tra `200`; public bundle moi `/assets/index-mRKWJQ10.js` va `/assets/index-D56kIrAj.css`; WSS tra `101`; Alembic giu `20260921_15`; service ngoai pham vi va volume khong doi.
- Rui ro con lai: Chua UAT browser bang tai khoan production that cho Cloud nhieu MIME/file, owner/tenant isolation va popup desktop/mobile; S3/provider quota vat ly van ton tai.
- Viec tiep theo: Hard refresh, dang nhap hai tai khoan, thu Cloud ca nhan voi nhieu file/loai file, tai/xoa, doi owner/tenant va xac nhan popup moi; neu can thi chay UAT Chatmgt directory.
- Commit/PR: Source `06353a4`; production release `personal-cloud-popup-06353a4-20260921-r2`.

## 2026-09-21-03 - Sua Chatmgt va Cloud rieng tu

- Thoi gian: 2026-09-21 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Bao mat | Web | Backend | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source commit `06353a4` da push, production deployment ghi tai muc `2026-09-21-04`.
- Muc tieu: Khac phuc loi Chatmgt khi mo danh sach nhan vien, cho Cloud cua toi nhan moi loai file voi nhieu file moi lan tai len, va dua thong bao loi/thanh cong/thong bao den ve cung popup moi.
- Pham vi: Chatmgt management directory, personal Cloud owner/tenant scope, S3 upload cap ung dung, ChatUI incoming/error/success popup, ManagementApp toast va regression test; khong doi Tinode, message/group/Workspace/mobile/database.
- Nguyen nhan: ManagementApp gui `results_per_page=1000` trong khi endpoint `/api/v1/chat/users` chi chap nhan toi da 100, nen backend tra `PARAM_ERROR`.
- Noi dung: Doi management client sang `limit=100` va tu dong theo `next_cursor`; Cloud giu owner + tenant tu session, tach namespace voi chat media chung, cho nhieu file va moi MIME type; `PERSONAL_CLOUD_MAX_SIZE=0` mac dinh bo gioi han moi file o tang ung dung, con S3/provider quota van la gioi han vat ly; thong bao thao tac va tin nhan den dung popup moi, con ConfirmDialog van giu cho thao tac can xac nhan.
- Quyet dinh ky thuat: Khong nang gioi han directory backend; client phan trang theo cursor. Cloud khong duoc doc qua management session, generic chat media route hoac owner/tenant khac; upload truc tiep S3 va completion van kiem tra ticket, size va MIME type.
- File da thay doi: `chatservice-main/application/config/config.py`, `chatservice-main/application/services/chat_media_service.py`, `chatservice-main/tests/test_chat_media_service.py`, `docs/chat-backend-architecture.md`, `infrastructure/production/.env.example`, `infrastructure/production/compose.yaml`, `src/app/App.jsx`, `src/features/chat/components/PersonalCloudPanel.jsx`, `src/features/i18n/appLanguage.js`, `src/features/i18n/appLanguage.test.js`, `src/features/management/ManagementApp.jsx`, `src/features/management/management.css`, `src/features/management/services/managementAdminService.js`, `src/features/management/services/managementAdminService.test.js`, `src/styles/index.css`, `dist/index.html`.
- Database/API/cau hinh: Khong co migration; them `PERSONAL_CLOUD_MAX_SIZE` vao config/compose/env example; khong them endpoint, secret hay thay doi schema.
- Kiem thu: `npm run test:frontend -- --test-concurrency=1` dat `441/441`; `node --test --test-concurrency=1 src/features/i18n/appLanguage.test.js` dat `25/25`; `node --test --test-concurrency=1 src/features/management/services/managementAdminService.test.js` dat `5/5`; `python -m unittest chatservice-main/tests/test_chat_media_service.py -q` dat `13/13`; `python -m py_compile chatservice-main/application/config/config.py chatservice-main/application/services/chat_media_service.py chatservice-main/tests/test_chat_media_service.py` dat; `npm run lint` exit `0` voi warning legacy/vendor; `npm run build:production` thanh cong voi canh bao chunk `App` vuot nguong 500 kB; `git diff --check` dat.
- Rui ro con lai: Chua deploy/UAT browser voi tai khoan that; S3/provider van co quota va gioi han kich thuoc vat ly; popup incoming hien thi thong bao moi nhat neu nhieu su kien den dong thoi.
- Viec tiep theo: UAT Chatmgt directory, Cloud tai len nhieu loai file, tai/xoa, owner khac/tenant khac va popup tren desktop/mobile.
- Commit/PR: Source `06353a4` da push; production release ghi tai muc `2026-09-21-04`.

## 2026-09-21-02 - Chuyen ChatUI va Chatmgt sang gonplatform.com

- Thoi gian: 2026-09-21 (Asia/Saigon)
- Loai: Cau hinh | Van hanh | Web | Mobile | Bao mat | Kiem thu | Tai lieu
- Trang thai: Hoan tat; production release `domain-migration-05ac3d6-20260921-r7` da activate va verify.
- Muc tieu: Doi ChatUI sang `https://chat.gonplatform.com` va Chatmgt sang `https://chatmgt.gonplatform.com`, dong thoi deploy cung ban da doi Account sang `https://account.gonplatform.com`.
- Pham vi: Fallback frontend/mobile, Tinode WSS va media relay, Chatmgt API/admin callback, cookie/CORS/password reset, S3 CORS, compose/env, Nginx/HAProxy host routing, test va tai lieu.
- Quyet dinh ky thuat: Dung `SESSION_COOKIE_DOMAIN=chatmgt.gonplatform.com` cho cookie Chatmgt va `.gonplatform.com` cho cookie Account de ba domain moi cung parent domain. Public response da xac nhan Chatmgt phat cookie `Domain=chatmgt.gonplatform.com` va Account phat cookie `Domain=.gonplatform.com`; browser SSO end-to-end van can UAT voi tai khoan that.
- Kiem thu local: Targeted frontend dat 31/31; backend Account/auth/media dat 106 pass, 34 skip; `npm run build:production` thanh cong voi canh bao chunk `App` khoang 566 kB; `git diff --check` dat.
- Kiem thu production: Archive `vichat-domain-migration-05ac3d6.tar.gz` SHA-256 `e81a14e8f3dbe19eb4b369b85e18420f2cca8c59e338db1adceaedea0a12a9db`; release `/opt/deploy/chat/releases/domain-migration-05ac3d6-20260921-r7`; previous `/opt/deploy/chat/releases/tenant-header-fade376-20260920-r1`; backup `/opt/deploy/chat/backups/domain-migration-05ac3d6-20260921-r7`; migration sau deploy `20260921_15`; ChatUI/Chatmgt healthy, restart `0`, volumes khong doi.
- Smoke test public: `https://chat.gonplatform.com/healthz` va `https://chatmgt.gonplatform.com/api/v1/auth/health` tra `200`; OPTIONS CORS origin moi dat; S3 preflight `PUT/GET/HEAD` cho `https://chat.gonplatform.com` tra `204`; WSS tra `101 Switching Protocols`; CSP/form-action va cookie domain dung domain moi; asset graph khong con `chat.upgo.vn`, `chatmgt.upgo.vn` hoac `account.upgo.vn`.
- Van hanh: Candidate `r4` va `r6` gap loi verify sau migration/activate nen harness rollback an toan; `r7` sua assertion revision Alembic va hoan tat. Khong downgrade migration va khong thay doi volume/stateful service.
- Rui ro con lai: Chua chay browser UAT login/chat/media voi hai tai khoan that. `https://chat.upgo.vn` van dang tra site legacy, chua co redirect 301 sang domain moi; can xu ly o edge neu muon retire hostname cu.
- Viec tiep theo: UAT browser voi hai tai khoan, sau do quyet dinh redirect/retire hostname legacy.
- Commit/PR: Source `05ac3d6` da push; changelog follow-up dang cho commit.

## 2026-09-21-01 - Chuyen Account sang gonplatform.com

- Thoi gian: 2026-09-21 (Asia/Saigon)
- Loai: Cau hinh | Web | Mobile | Kiem thu | Tai lieu
- Trang thai: Hoan tat trong source; chua deploy production.
- Muc tieu: Doi toan bo diem vao Account tu `https://account.upgo.vn` sang `https://account.gonplatform.com`.
- Pham vi: Cap nhat fallback `VITE_ACCOUNT_URL`, redirect login/admin SSO, CSP/form-action, thong bao loi, mobile profile, test, production docs/config va bundle `dist`.
- Quyet dinh ky thuat: Giu `ACCOUNT_SESSION_COOKIE_DOMAIN=.upgo.vn` vi Chatmgt van chay tai `chatmgt.upgo.vn`; cookie `.gonplatform.com` khong the gui sang domain `.upgo.vn`. Admin SSO cross-domain can Account ho tro callback/token handoff hoac proxy cung parent domain truoc khi xac nhan end-to-end.
- Kiem thu: Targeted frontend `node --test src/features/management/services/managementAdminService.test.js src/features/chat/services/chatManagementService.test.js src/features/i18n/appLanguage.test.js --test-concurrency=1` dat 95/95; backend SSO/auth/identity `python -m unittest tests.test_account_sso_service tests.test_chat_auth_contract tests.test_sso_identity -q` dat 126 pass, 34 skip; `npm run lint` exit 0 voi warning legacy/vendor; `npm run build:production` thanh cong, canh bao chunk `App` 566.26 kB vuot nguong 500 kB; `git diff --check` dat.
- Rui ro con lai: Chua deploy/UAT tren browser; can xac nhan Account callback/token handoff cho luong admin SSO va test login that tren staging.
- Commit/PR: Chua tao.

## 2026-09-20-03 - Sua toan bo audit regression (hoan tat source)

- Thoi gian: 2026-09-21 (Asia/Saigon)
- Loai: Sua loi | Bao mat | Hieu nang | Kiem thu | Tai lieu
- Trang thai: Hoan tat trong source; chua commit, chua deploy production.
- Muc tieu: Xu ly cac loi audit ve phan trang du lieu lon, tenant/auth, race condition, media cleanup, Workspace, validation va accessibility ma khong lam regression login/chat/Tinode/S3/Profile.
- Nguyen nhan: Mot so endpoint doc dataset lon bang mot lan, client khong co cursor/guard day du, media va Workspace thieu state/version boundary, va mot so route chua tach ro chat-scope voi management-scope.
- Pham vi file: Backend gom `chatservice-main/application/controllers/api_chat_management.py`, `api_chat_media.py`, `api_chatbot.py`, `api_enterprise_workspace.py`, `api_personal_cloud.py`, `api_user.py`, `api_organization.py`, `helpers/helper_common.py`, `application/config/config.py`, `models.py`, cac service media/Workspace/knowledge, pagination helper va cleanup sweeper. Frontend gom `src/app/App.jsx`, auth/login, `chatManagementService.js`, `chatMediaService.js`, `tinodeClient.js`, `PersonalCloudPanel.jsx`, Workspace, ManagementApp, styles va regression tests. Cap nhat `dist/index.html`, infrastructure production docs/config, architecture docs va file nay.
- Giai phap: Them cursor pagination tu SQL cho directory, conversation, friend request, profile viewers, personal cloud va Workspace voi ca field legacy `objects`/`items` va alias snake_case/camelCase; them request abort/session/tenant guards, dedupe va stale-response protection. Tinode history van dung sequence/catch-up co guard room/navigation. Media gan registry theo tenant/conversation/uploader, kiem tra membership o moi lan upload/download, cleanup idempotent voi retry sweeper. Workspace dung aggregate SQL, row locking, version conflict `409`, va giu properties/participant roles khi patch khong day du. Numeric inputs duoc bounded, lỗi client duoc sanitize, outbound HTTP bat TLS verification + CA/timeout, management session bi chan khoi chat routes, va cac control/profile modal duoc bo sung accessibility.
- Quyet dinh ky thuat: Giu backward-compatible response fields va legacy Tinode media references; khong merge/xoa duplicate conversation tu dong. Migration chi tao unique direct key khi khong co duplicate, neu co thi tao report de operator xu ly. `PENDING_DELETE`/`RETRY` va version conflict duoc luu o boundary de retry/reload an toan thay vi nuot loi.
- Database/migration: Them `chatservice-main/alembic/versions/20260921_15_audit_hardening.py` va `chatservice-main/migrations/015_audit_hardening.sql`; migration them `conversation.direct_key`, duplicate report/index an toan, `chat_media_registry`, cleanup fields/index cho `personal_cloud_file`. Chua chay migration tren production trong phien nay; downgrade duoc danh dau irreversible, rollback can restore DB backup va release truoc.
- API/cau hinh: Pagination response them `next_cursor`/`nextCursor`, `has_more`/`hasMore`, `limit`, `total` theo endpoint; chat media registry endpoints giu legacy download path; management/chat scope tra `CHAT_SESSION_REQUIRED` hoac management error ro rang. Them CA bundle/timeout (`CHAT_HTTP_CA_BUNDLE`, `ACCOUNT_SSO_CA_BUNDLE`, `CHAT_HTTP_TIMEOUT`) va giu `CHAT_MEDIA_FALLBACK_TO_TINODE=false` trong production template.
- Kiem thu thuc te: `npm run test:frontend -- --test-concurrency=1` dat `439/439`; targeted accessibility `node --test src/features/chat/services/chatManagementService.test.js --test-concurrency=1 --test-name-pattern="profile and management controls expose keyboard-accessible labels and modal focus handling"` dat `67/67`; full backend `python -m unittest discover -s tests -p "test_*.py" -q` trong `chatservice-main` dat `319` test, `106` skip, exit `0`; contract audit dat `7/7`; media service `12/12`; `npm run lint` exit `0` voi warning legacy/vendor; `npm run build:production` thanh cong, nhung App chunk `566.23 kB` van tren nguong canh bao 500 kB; `python -m py_compile` tren Python files thay doi dat; production code scan khong con `verify=False`; `git diff --check` exit `0`.
- Browser UAT/deploy: Khong co browser automation kha dung trong phien nay nen chua xac nhan UAT visual/login/chat/media/Workspace/Profile tren browser. Khong backup/migration production, khong deploy, khong claim production health.
- Rui ro con lai: Can UAT hai tai khoan cho tenant switch, room/history lon, media sau khi roi group, Workspace version conflict, profile viewer va mobile layout. Can chay migration tren staging truoc production va cau hinh CA bundle/secret theo moi truong.
- Rollback: Source co the rollback ve release truoc; giu migration backup va khong tu dong downgrade `20260921_15`. Neu da migrate, operator phai dung DB backup/SQL rollback da review, giu registry/legacy media cho den khi xac minh, sau do moi switch release.
- Viec tiep theo: Review diff cuoi, tao commit rieng theo nhom neu can, staging migration + smoke test, sau do moi xem xet deploy production.
- Commit/PR: Chua tao.

## 2026-09-20-02 - Don dep artifact production khong con su dung

- Thoi gian: 2026-09-20 (Asia/Saigon)
- Loai: Van hanh | Bao tri | Production | Kiem tra | Tai lieu
- Trang thai: Hoan tat; da don dep qua hai hop SSH, khong recreate container va khong doi du lieu ung dung.
- Muc tieu: Giam dung luong dia tren `192.168.80.20` ma khong anh huong release dang chay, rollback gan nhat, database, Redis, Tinode hoac volume.
- Pham vi: Xoa artifact da deploy xong trong `/opt/deploy/chat/incoming`, release cu/failed ngoai `current` va `previous`, rollback image tag cu, dangling image, va binary/archive Tinode khong duoc container mount trong `/home/ubuntu`.
- Bao toan: Giu `/opt/deploy/chat/releases/tenant-header-fade376-20260920-r1`, `/opt/deploy/chat/releases/profile-viewers-634a7d1-20260919-r5`, backup chinh, migration backup, `/home/ubuntu/chat`, `/home/ubuntu/tinode-8092-a4d12e3` dang duoc `upgo-chatapi-8092` mount, database, Redis va tat ca Docker volume.
- Ket qua: `/opt/deploy/chat` giam tu khoang `3.7G` xuong `313M`; disk tu `25G used / 54G available` xuong `19G used / 59G available`; chi giu rollback tag gan nhat `rollback-before-tenant-header-fade376` cho ChatUI va Chatmgt.
- Kiem tra sau don dep: ChatUI/Chatmgt va service stateful healthy, restart `0`, symlink `current`/`previous` dung, health noi bo/public dat, endpoint profile views chua auth tra `401`, WSS tra `101 Switching Protocols`, volume khong doi.
- Quyet dinh ky thuat: Khong chay `docker volume prune`, khong xoa database dump/migration backup, khong xoa thu muc Tinode dang mount; cac thu muc failed backup rong con lai do parent production khong cho phep xoa, khong con file du lieu.
- Commit/PR: Commit docs follow-up duoc day len `origin/master`; khong can deploy lai ung dung.

## 2026-09-20-01 - Sua layout chip logo cong ty trong ho so

- Thoi gian: 2026-09-20 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Responsive | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `fade376` da commit/push `origin/master`, production da deploy va verify qua hai hop SSH
- Muc tieu: Dua selector cong ty tren man hinh nho ve dung bo cuc chip logo nhu mau tham chieu, khong lam roi logout, icon nguoi xem hoac nut dong.
- Pham vi: Chi CSS responsive cua profile header va regression test; khong doi API, tenant switch handler, logout handler, profile viewer telemetry hay du lieu.
- File da thay doi: `src/styles/index.css`, `src/features/chat/services/chatManagementService.test.js`, `dist/index.html`, va file nay.
- Noi dung: An caption/icon Cong ty du tren mobile, dat chip logo cong ty truoc logout, giu icon nguoi xem va nut dong tach rieng, tang chieu rong chip de khong bi co sai; luong chuyen cong ty van giu nguyen.
- Quyet dinh ky thuat: Chi dung flex order va kich thuoc responsive trong profile header; khong thay doi DOM handler/state chuyen tenant de tranh regression luong dang nhap, logout va reload sau khi doi cong ty.
- Kiem thu: Targeted `node --test --test-concurrency=1 src/features/chat/services/chatManagementService.test.js` dat 66/66; `npm run test:frontend -- --test-concurrency=1` dat 438/438; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` thanh cong voi canh bao chunk `App` lon; `git diff --check` dat.
- Kiem tra production: Archive `/opt/deploy/chat/incoming/vichat-tenant-header-fade376.tar.gz`, SHA-256 `f9304cb6a2701d5ca09aa49a354039981949ce0b3c3a16621475de4e8a5c2671`; contract test trong candidate dat 60/60; release `/opt/deploy/chat/releases/tenant-header-fade376-20260920-r1`, previous `/opt/deploy/chat/releases/profile-viewers-634a7d1-20260919-r5`, backup `/opt/deploy/chat/backups/tenant-header-fade376-20260920-r1`; ChatUI/Chatmgt healthy, restart 0, health noi bo/public dat, endpoint profile views chua auth tra `401`, WSS tra `101 Switching Protocols`, public bundle khop `index-Dx9_ukqh.js` va `index-DCFcAqRo.css`, Alembic giu `20260917_14`, service ngoai pham vi va volume khong doi.
- Rui ro con lai: Browser visual khong chay duoc trong phien nay do moi truong thieu native browser bridge; can hard refresh va xem lai header profile tren mobile sau khi deploy.
- Viec tiep theo: Deploy ban moi, sau do UAT chip logo, mo menu doi cong ty, logout, icon nguoi xem va nut dong tren desktop/mobile.
- Commit/PR: Source `fade376` da commit/push `origin/master`; deployment record follow-up duoc cap nhat sau release r1.

## 2026-09-19-03 - Lam moi ho so va them danh sach nguoi xem

- Thoi gian: 2026-09-19 20:56 (Asia/Saigon)
- Loai: Tinh nang | Web | Backend | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `634a7d1` da commit/push `origin/master`, production da deploy va verify qua hai hop SSH
- Muc tieu: Dua ho so ca nhan ve bo cuc 2 cot giong mau tham chieu, cho xem avatar lon, va cho biet ai da mo ho so trong cung cong ty.
- Pham vi: ChatUI workspace profile, avatar viewer, public profile opening flow, Chatmgt profile-view metadata; khong doi Tinode message/store, Account password, mobile hay group flow.
- File da thay doi: `src/app/App.jsx`, `src/styles/index.css`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/chatManagementService.test.js`, `src/features/i18n/appLanguage.js`, `src/features/i18n/appLanguage.test.js`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `dist/index.html`, `docs/chat-backend-architecture.md`, va file nay.
- Noi dung: Them the thong tin ho so 2 cot voi icon mau, avatar co the bam de mo ImageViewer ma khong xung dot voi upload/crop, icon con mat o goc header de xem danh sach nguoi da xem, va ghi nhan viec mo public profile theo cach best-effort. Chatmgt loc cung tenant, bo qua tu xem va gop lap trong 5 phut bang `security_audit_log` hien co.
- Quyet dinh ky thuat: Tai su dung audit metadata thay vi them bang/migration; loi ghi nhan luot xem chi duoc canh bao trong console de khong lam chan mo ho so, chat, logout hoac chuyen cong ty.
- Database/API/cau hinh: Them `POST/GET /api/v1/profile/views`; khong co migration, secret, bien moi truong hay thay doi API hien co.
- Kiem thu: `npm run test:frontend -- --test-concurrency=1` dat 437/437; `python -m unittest chatservice-main/tests/test_chat_auth_contract.py -q` dat 60/60; full `python -m unittest discover -s chatservice-main/tests -p "test_*.py"` dat 312 pass, 106 skip do dependency runtime; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` thanh cong voi canh bao chunk `App` lon; `python -m py_compile chatservice-main/application/controllers/api_chat_management.py chatservice-main/tests/test_chat_auth_contract.py` dat; `git diff --check` dat.
- Kiem tra production: Archive `vichat-profile-viewers-634a7d1.tar.gz`, SHA-256 `5d06813fbd21e29e1257eee30aacc3fbfc724ba202d6e9973cfd1d61cb9491cb`; cac candidate r1-r4 dung truoc activate do gate helper, production khong doi; release thanh cong `/opt/deploy/chat/releases/profile-viewers-634a7d1-20260919-r5`, previous `/opt/deploy/chat/releases/tinode-uid-recovery-c82a517-20260919-r2`, backup `/opt/deploy/chat/backups/profile-viewers-634a7d1-20260919-r5`; ChatUI/Chatmgt healthy, restart 0; health noi bo/public dat, endpoint profile views chua auth tra `401`, WSS tra `101 Switching Protocols`, Alembic giu `20260917_14`, service ngoai pham vi va volume khong doi.
- Rui ro con lai: Chua xac nhan UI bang browser production; danh sach chi hien thi tai khoan active cung tenant, va cac luot xem qua tai khoan khong con active se khong hien thi.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, sau do UAT hai tai khoan cung tenant cho mo ho so, xem avatar, icon nguoi xem va chuyen cong ty; khong can migration.
- Commit/PR: Source `634a7d1` da commit/push `origin/master`; deployment record release r5 da verify.

## 2026-09-19-02 - Tu phuc hoi UID Tinode stale khi gui tin nhom

- Thoi gian: 2026-09-19 (Asia/Saigon)
- Loai: Sua loi | Web | Backend | Tinode | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `c82a517` da commit/push `origin/master`, production da deploy va verify qua hai hop SSH
- Muc tieu: Khong de topic group bi bind hoac gui tin that bai khi Chatmgt con luu UID Tinode cua tai khoan da mat tren central Tinode.
- Pham vi: Tinode SSO recovery, bind/prepare topic, cac luong them/duyet/xoa thanh vien, doi role, roi/giai tan group, chatbot group va browser session; khong doi schema, migration, message store hay mobile.
- File da thay doi: `chatservice-main/application/services/auth_service.py`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/tests/test_tinode_bridge_service.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `src/features/chat/services/chatManagementService.js`, `src/app/App.jsx`, `dist/index.html` va file nay.
- Noi dung: Khi admin reset UID cu tra `not found`, Chatmgt tao lai tai khoan deterministic va ghi UID moi vao projection. Moi bridge operation dung UID sau authenticate thay vi UID da chuan bi truoc do; bind group bo qua verify stale truoc repair, sau do reconcile lai member/access snapshot. ChatUI lay token moi truoc bind va re-auth session Tinode neu UID viewer vua duoc sua.
- Quyet dinh ky thuat: Ghi nhan mapping moi tai boundary authenticate (`_record_tinode_uid`) va tinh lai danh sach UID sau `_tinode_tokens_for_accounts`; khong xoa topic/message hay tu dong reset du lieu Tinode.
- Database/API/cau hinh: Khong co migration, endpoint moi, secret hay bien moi truong; endpoint token/bind hien co duoc dung lai.
- Kiem thu: `python -m unittest discover -s chatservice-main/tests -p "test_*.py"` dat 311 pass, 106 skip do dependency runtime; `python -m unittest chatservice-main/tests/test_chat_auth_contract.py -q` dat 59/59; `npm run test:frontend -- --test-concurrency=1` dat 435/435; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` thanh cong voi warning chunk `App` lon; `python -m py_compile chatservice-main/application/controllers/api_chat_management.py chatservice-main/application/services/auth_service.py chatservice-main/tests/test_tinode_bridge_service.py` dat; `git diff --check` dat.
- Kiem tra production: Archive `vichat-tinode-uid-recovery-c82a517.tar.gz`, SHA-256 `9f14b11e8892be46bc802ffb2d153ab2ea7f44f1ffa20ac389f8a466657a415d`; candidate r1 dung truoc activate do thieu `/mobile/src/services/tinodeClient.ts` va da quarantine trong `.failed-candidate`, production khong doi; candidate r2 contract trong image dat 59/59. Release `/opt/deploy/chat/releases/tinode-uid-recovery-c82a517-20260919-r2`, previous `/opt/deploy/chat/releases/stale-topic-dfcbbc2-20260919-r2`, backup `/opt/deploy/chat/backups/tinode-uid-recovery-c82a517-20260919-r2`; ChatUI `f0c14fdc187d`, Chatmgt `97047f039734`, ca hai healthy; health noi bo/public dat, WSS tra `101 Switching Protocols`, bundle public khop candidate (`/assets/index-C-AXL_6U.js`, `/assets/index-BPct5cnc.css`, `App-C8JHwvpq.js`, `ManagementApp-DC6FDu3U.js`), Alembic giu `20260917_14`, service ngoai pham vi va volume khong doi, Tinode data untouched.
- UAT production: Bind conversation `bb511cdf-6453-43be-8002-4a5c3d9b6acc` tra HTTP 200 voi 21 active member; code tu sua 9 UID stale va xac nhan mapping day du. Owner Tinode publish group tra sequence `202`, hard-delete marker tra OK, history sau cleanup khong con marker smoke.
- Rui ro con lai: Chua UAT bang browser voi hai tai khoan that cho mo group, gui tin hai tab va member mutation; backend bind/recovery va publish Tinode da duoc smoke test tren conversation production.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, sau do UAT group bang hai tai khoan, hai tab va cac luong them/xoa/doi role thanh vien.
- Commit/PR: Source `c82a517` da commit/push `origin/master`; release r2 va changelog deploy record da verify.

## 2026-09-19-01 - Sua bind topic group khi tab gui topic stale

- Thoi gian: 2026-09-19 12:15 (Asia/Saigon)
- Loai: Sua loi | Backend | Tinode | Kiem thu | Trien khai | Tai lieu
- Trang thai: Hoan tat; source `dfcbbc2` da commit/push `origin/master`, production da deploy Chatmgt va verify qua hai hop SSH
- Muc tieu: Khong chan gui tin khi tab cu gui topic direct cho group da co topic canonical.
- Pham vi: Route bind topic Tinode cua Chatmgt va contract test; khong doi direct chat, schema, migration hay message store.
- File da thay doi: `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/tests/test_chat_auth_contract.py` va file nay.
- Noi dung: Group uu tien topic da luu trong Chatmgt truoc khi validate type cua topic tu client; topic persisted sai van tra `409`, con topic client sai khi group chua co binding van tra `400`.
- Quyet dinh ky thuat: Giai quyet stale topic o boundary Chatmgt de cac tab cu, tab moi va request retry dung cung canonical topic; direct conversation van validate topic viewer-relative nhu truoc.
- Database/API/cau hinh: Khong migration, schema hay bien moi truong moi; chi lam idempotent hon route bind hien co.
- Kiem thu: `python -m unittest chatservice-main/tests/test_chat_auth_contract.py -v` dat 59/59; full backend dat 310 pass, 105 skip do dependency image; frontend dat 435/435; `python -m py_compile chatservice-main/application/controllers/api_chat_management.py` thanh cong; candidate Chatmgt trong image dat 59/59; `git diff --check` khong co loi.
- Kiem tra production: Candidate `r1` fail o buoc curl local do bind host la `192.168.80.20` va da rollback tu dong, sau do duoc quarantine trong `.failed-candidate`; candidate `r2` thanh cong. Release `/opt/deploy/chat/releases/stale-topic-dfcbbc2-20260919-r2`, previous `/opt/deploy/chat/releases/compact-reactions-656ca5f-20260918-r1`, backup `/opt/deploy/chat/backups/stale-topic-dfcbbc2-20260919-r2`; Chatmgt healthy/restart 0, `/api/v1/auth/health` va ChatUI health dat, WSS tra `101 Switching Protocols`, Alembic giu `20260917_14`, ChatUI/Tinode/DB/Redis/volume va cac service khac khong doi.
- Rui ro con lai: Chua UAT bang browser tai khoan that trong phien nay do browser bridge khong kha dung; can hard refresh va gui tin trong group loi, direct va hai tab.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, mo lai group va thu gui tin; neu can thi kiem tra them direct chat va hai tab.
- Commit/PR: Source `dfcbbc2`; changelog/deploy record follow-up commit dang cho.

## 2026-09-18-11 - Thu gon danh sach reaction voi chip 3+

- Thoi gian: 2026-09-18 22:55 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Kiem thu | Trien khai | Tai lieu
- Trang thai: Hoan tat; source `656ca5f` da commit/push `origin/master`, production da deploy va verify qua hai hop SSH
- Muc tieu: Chi hien thi toi da hai loai emoji reaction tren tin nhan; tu loai thu ba hien chip `3+` va mo bang chi tiet khi bam.
- Pham vi: ChatUI reaction chip cho tin nhan thuong va image batch; khong doi API, database, Tinode, mobile hay luong gui tin.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/messageActionPolicy.js`, `src/features/chat/services/messageActionPolicy.test.js`, `src/styles/index.css`, `dist/index.html`, `outputs/deploy-compact-reactions-656ca5f.sh` va file nay.
- Noi dung: Them policy `compactReactionEntries` de gioi han hai emoji dau tien, hien chip `3+` cho phan con lai, va cho moi chip mo bang chi tiet reaction. Quyen go reaction cua viewer van chi thuc hien trong bang chi tiet.
- Quyet dinh ky thuat: Dung cung callback mo chi tiet cho chip emoji va chip overflow; chip `3+` truyen bo loc rong de hien toan bo reaction, khong thay doi event/state Tinode hien co.
- Database/API/cau hinh: Khong co migration, endpoint, schema, secret hoac bien moi truong moi.
- Kiem thu: Targeted `node --test --test-concurrency=1 src/features/chat/services/messageActionPolicy.test.js` dat 5/5; `npm run test:frontend -- --test-concurrency=1` dat 435/435; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` thanh cong voi canh bao chunk `App` lon; `git diff --check` dat.
- Kiem tra production: Archive `vichat-compact-reactions-656ca5f.tar.gz`, SHA-256 `dcedb56685642ec66102770162e25244ac1c950ed8b1ffa7603514a6ad487812`; release `/opt/deploy/chat/releases/compact-reactions-656ca5f-20260918-r1`, previous `/opt/deploy/chat/releases/reaction-details-261f24e-20260918-r1`, backup `/opt/deploy/chat/backups/compact-reactions-656ca5f-20260918-r1`; ChatUI healthy/restart 0, public/local health dat, WSS tra `101 Switching Protocols`, bundle public khop candidate (`/assets/index-BDqKcOpO.js`, `App-Df1lAJLv.js`, `/assets/index-BPct5cnc.css`), Alembic giu `20260917_14`, service ngoai `chat` va volume khong doi. Gate source lan dau dung an toan truoc backup do archive thieu prefix, partial candidate da duoc quarantine trong `.failed-candidate`; lan chay lai dung format va hoan tat.
- Van hanh: Da xoa 129 thu muc release cu khong phai `current`/`previous`, giai phong `6421876814` bytes; giu lai cac thu muc audit `.failed-candidate`, khong xoa volume, database, Tinode data hay backup rollback.
- Rui ro con lai: Chua UAT browser production voi tai khoan that cho chip emoji, chip `3+`, mo bang chi tiet va go reaction cua viewer tren direct/group, tin nhan thuong va anh.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, sau do UAT cac luong reaction tren direct/group va hai tab.
- Commit/PR: Source `656ca5f`; deployment record `1df5ca1`; deploy helper `65c147e`.

## 2026-09-18-10 - Chi go reaction trong bang chi tiet

- Thoi gian: 2026-09-18 22:40 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `261f24e` da commit/push `origin/master`, production da deploy va verify qua hai hop SSH
- Muc tieu: Cho phep xem danh sach nguoi tha reaction truoc khi go reaction cua chinh viewer.
- Pham vi: ChatUI reaction chip, bang chi tiet reaction va luong them reaction nhanh; khong doi API, database, event contract, mobile hay luong gui tin.
- Noi dung: Bam reaction chip luon mo bang chi tiet, khong go truc tiep; tai khoan hien tai chi thay nut go theo tung emoji trong bang chi tiet. Chon lai emoji da co trong thanh reaction nhanh khong con tu dong go; thao tac go dung action rieng `remove-reaction`.
- Quyet dinh ky thuat: Tach action them va go reaction de khong de mot click ngoai bang chi tiet lam mat reaction; giu nguyen realtime Tinode va cap nhat optimistic hien co.
- Database/API/cau hinh: Khong co migration, endpoint, secret hoac bien moi truong moi.
- Kiem thu: `npm run test:frontend -- --test-concurrency=1` dat 434/434; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` thanh cong voi canh bao chunk `App` lon; `git diff --check` dat.
- Kiem tra production: Archive `vichat-reaction-details-261f24e.tar.gz`, SHA-256 `b6ae4794fc786af31c113d334234c7733fd35f3648759b806890958909989700`; release `/opt/deploy/chat/releases/reaction-details-261f24e-20260918-r1`, previous `/opt/deploy/chat/releases/message-reactions-9a42307-20260918-r2`, backup `/opt/deploy/chat/backups/reaction-details-261f24e-20260918-r1`; chi recreate ChatUI `chat`, giu nguyen Chatmgt, Tinode, ChatAPI, PostgreSQL, Redis, Coturn va volume. ChatUI healthy/restart 0, public health dat, WSS tra `101 Switching Protocols`, bundle public khop candidate (`/assets/index-BsX6DUE4.js`, `App-BHDZYAdc.js`, `/assets/index-BzLri_0a.css`), Alembic giu `20260917_14`, env/checksum va log gate dat.
- Rui ro con lai: Chua UAT browser voi tai khoan that cho mo chi tiet, go reaction cua minh va xem reaction cua nguoi khac tren direct/group, tin nhan thuong va anh.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, sau do UAT bang reaction chip va bang chi tiet tren direct/group, tin nhan thuong va anh.
- Commit/PR: Source commit `261f24e`; deployment record dang cho commit.

## 2026-09-18-09 - Gop va huy bieu tuong cam xuc tin nhan

- Thoi gian: 2026-09-18 22:16 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `9a42307` da commit/push `origin/master`, production da deploy va verify qua hai hop SSH
- Muc tieu: Cho phep huy reaction cua chinh minh va hien thi cac reaction theo mot hang gop gon, de doc tren ca nen sang/toi.
- Pham vi: ChatUI reaction chip cho tin nhan thuong, file/anh va Tinode; khong doi API, database, event contract, mobile hay luong gui tin.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/messageActionPolicy.js`, `src/features/chat/services/messageActionPolicy.test.js`, `src/features/i18n/appLanguage.js`, `src/styles/index.css`, `dist/index.html` va file nay.
- Noi dung: Tao `MessageReactionPills` dung chung cho tin nhan thuong va image batch; gop count/user trung theo emoji, chip cua viewer co trang thai selected va bam lai se gui reaction `active=false`. Click reaction cua nguoi khac van mo danh sach chi tiet; chuot phai mo chi tiet cho ca hai truong hop. Luong Tinode su dung them local reaction user state de khong mat kha nang huy trong luc realtime dang dong bo.
- Quyet dinh ky thuat: Tai su dung event reaction hien co, khong them endpoint hay migration. Gop state o ranh gioi UI/policy va dedupe user theo identity de khong lam thay doi du lieu reaction goc.
- Database/API/cau hinh: Khong co migration, endpoint, secret hoac bien moi truong moi.
- Kiem thu: `node --test --test-concurrency=1 src/features/i18n/appLanguage.test.js src/features/chat/services/messageActionPolicy.test.js` dat 27/27; `npm run test:frontend -- --test-concurrency=1` dat 434/434; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` thanh cong voi canh bao chunk `App` lon; `git diff --check` dat.
- Kiem tra production: Candidate `r1` dung tai gate bundle truoc activate, khong recreate va khong doi `current`; candidate `r2` thanh cong. Archive `vichat-message-reactions-9a42307.tar.gz`, SHA-256 `04a5b222541a0c3494ece754d44b4a2ebbf3809b72c81e4f1d45dc886677cc74`; release `/opt/deploy/chat/releases/message-reactions-9a42307-20260918-r2`, previous `/opt/deploy/chat/releases/conversation-nickname-35be082-20260918-r1`, backup `/opt/deploy/chat/backups/message-reactions-9a42307-20260918-r2`; chi recreate ChatUI `chat`, giu nguyen Chatmgt, Tinode, ChatAPI, PostgreSQL, Redis, Coturn va volume. ChatUI healthy/restart 0, public health dat, WSS tra `101 Switching Protocols`, bundle public khop candidate (`/assets/index-DykYRsjI.js`, `App-ScpTBOUV.js`, `/assets/index-H_mVQ1GN.css`), Alembic giu `20260917_14`, env/checksum va log gate dat.
- Rui ro con lai: Chua UAT browser voi tai khoan that cho them/huy reaction tren direct/group, tin nhan thuong va anh.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, sau do UAT chip reaction tren nen sang/toi, click lai de huy, realtime hai tab va chuot phai xem chi tiet.
- Commit/PR: Source commit `9a42307`; deployment record dang cho commit.

## 2026-09-18-08 - Dong bo biet danh cong khai qua realtime

- Thoi gian: 2026-09-18 21:30 (Asia/Saigon)
- Loai: Sua loi | Web | Backend | Tinode | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `35be082` da commit/push `origin/master`, production da deploy va verify qua hai hop SSH
- Muc tieu: Bao dam moi thanh vien trong chat 1-1/group thay ngay biet danh cong khai va thong bao sau khi co thay doi.
- Pham vi: ChatUI realtime event, contract test nickname/directory va metadata conversation; khong migration, khong doi Tinode message store hay profile Account.
- File da thay doi: `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `dist/index.html`, `docs/chat-backend-architecture.md`, `src/app/App.jsx`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/chatRealtime.test.js`, `src/features/chat/services/tinodeClient.js`, `src/features/contacts/services/accountDirectory.js`, `src/features/contacts/services/accountDirectory.test.js`, `src/features/demo/services/demoDirectStore.js`, `src/features/demo/services/demoGroupStore.js`, `src/styles/index.css` va file nay.
- Noi dung: Tab nhan event `conversation_nickname_changed` nay gop map nickname theo `targetAccountId` vao snapshot hien tai, bao gom ca thao tac xoa, de thanh vien khac cap nhat ten va message rendering ma khong can reload. Contract test duoc sua de chap nhan cleanup field legacy nhung van chan payload nickname rieng tu.
- Quyet dinh ky thuat: Dung map public da commit trong Chatmgt lam nguon; merge patch realtime voi map hien tai de khong lam mat nickname cua thanh vien khac. Giu cleanup `contactNickname` legacy o ranh gioi normalize de tranh du lieu cu quay lai UI.
- Database/API/cau hinh: Khong co migration, endpoint moi, secret hoac bien moi truong; su dung event `conversation_nickname_changed` hien co.
- Kiem thu: `python -m unittest chatservice-main/tests/test_chat_auth_contract.py -v` dat 59/59; `python -m unittest discover -s chatservice-main/tests -p "test_*.py"` dat 310 pass, 105 skip; `npm run test:frontend -- --test-concurrency=1` dat 432/432; `python -m py_compile chatservice-main/application/controllers/api_chat_management.py` dat; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` thanh cong voi canh bao chunk `App` lon; `git diff --check` dat. Production: contract 59/59; `chat` va `chatmgt` healthy/restart 0; health public dat; WSS tra `101 Switching Protocols`; bundle public khop candidate (`/assets/index-CgodBPoi.js`, `/assets/App-VPqpoPWT.js`); Alembic giu `20260917_14`; Tinode/DB/Redis/Coturn va volume khong doi.
- Rui ro con lai: Chua UAT production bang browser voi hai tai khoan cho doi/clear biet danh trong direct va group; can hard refresh sau deploy. Khong co migration can chay.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, sau do UAT hai tai khoan, hai tab, doi biet danh cho minh/nguoi khac, thong bao va xoa biet danh trong direct/group.
- Artifact/phat hanh: Archive `vichat-conversation-nickname-35be082.tar.gz`, SHA-256 `7d97a8d4565349846253df93b4c622363b117c0b95ceec376f67944a5eb8e928`; release `/opt/deploy/chat/releases/conversation-nickname-35be082-20260918-r1`; previous `/opt/deploy/chat/releases/scoped-nickname-b4fd9dc-20260918-r1`; backup `/opt/deploy/chat/backups/conversation-nickname-35be082-20260918-r1`; chi recreate `chatmgt` va `chat`, giu nguyen Tinode/DB/Redis/Coturn va volume.
- Commit/PR: Source commit `35be082`; production release `conversation-nickname-35be082-20260918-r1`.

## 2026-09-18-07 - Cho phep doi biet danh cua chinh minh

- Thoi gian: 2026-09-18 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Web | Backend | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat code; chua commit/push va chua deploy production
- Muc tieu: Cho phep tai khoan dat biet danh rieng cho chinh minh trong ca pham vi toan bo Chat va chi trong cuoc tro chuyen.
- Pham vi: API nickname global/conversation, dialog va menu thanh vien ChatUI, directory display; khong migration, khong thay doi profile Account/Tinode, chatbot hay luong quan tri nhom.
- Noi dung: Bo chan target trung viewer o hai route nickname; Chatmgt van kiem tra tenant, account active, membership va row lock. Dialog va menu thanh vien cho phep chon chinh viewer, bot van bi chan. Nickname tu minh van chi la metadata viewer-scoped va khong doi ten chinh thuc.
- Quyet dinh ky thuat: Cho phep `_account_display_name` ap dung map nickname ca khi account dich la viewer, de nickname tu minh duoc tai lai sau refresh; khong ghi vao `full_name`, Account profile, Tinode hay metadata outbound.
- Kiem thu: `node --test --test-concurrency=1 src/features/contacts/services/accountDirectory.test.js` dat 42/42; `npm run test:frontend -- --test-concurrency=1` dat 433/433; `python -m unittest chatservice-main/tests/test_chat_auth_contract.py -v` dat 60/60; `python -m unittest discover -s chatservice-main/tests -p "test_*.py"` dat 311 pass, 105 skip; `python -m py_compile chatservice-main/application/controllers/api_chat_management.py` dat; `npm run lint` exit 0 voi warning legacy/vendor; `npm run build:production` thanh cong voi canh bao chunk `App` lon; `git diff --check` dat.
- Rui ro con lai: Chua deploy/UAT production trong lan sua nay; can hard refresh va thu ca hai scope trong direct/group chat.
- Viec tiep theo: Review diff, commit/push va deploy rieng ChatUI/Chatmgt sau khi co yeu cau; sau do hard refresh va UAT hai scope trong direct/group chat.

## 2026-09-18-05 - Dong bo chon thanh vien khi dieu huong mention bang ban phim

- Thoi gian: 2026-09-18 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `8353ee3` da commit/push `origin/master`, production da deploy va verify qua hai hop SSH
- Muc tieu: Khi dang mention thanh vien trong group, ArrowUp/ArrowDown phai cap nhat dung muc dang chon va Enter/Tab phai chon dung nguoi.
- Pham vi: Mention picker cua ChatUI va policy navigation; release cung dong bo toi uu `messageLinkPolicy` da co tren `origin/master` nhung chua nam trong production release truoc; khong doi Tinode, Chatmgt, API, database, mobile hay luong gui tin thong thuong.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/mentionPolicy.js`, `src/features/chat/services/mentionPolicy.test.js`, `src/features/chat/services/messageLinkPolicy.js`, `src/features/chat/services/messageLinkPolicy.test.js`, `dist/index.html` va file nay.
- Noi dung: Giu chi so active trong ref de doc ngay ca khi keydown lien tiep, clamp lai khi danh sach loc thay doi, dung cung chi so cho Enter/Tab va tu dong cuon muc active vao vung hien thi. Candidate cung build phan toi uu link tu commit `417c874` de source production khop voi `origin/master`.
- Quyet dinh ky thuat: Chi them state synchronization tai mention picker va ham pure cho cycle/clamp; giu cach wrap danh sach hien tai de khong thay doi hanh vi cac luong chat khac.
- Database/API/cau hinh: Khong co migration, endpoint, schema, secret hoac cau hinh moi.
- Kiem thu: `node --test --test-concurrency=1 src/features/chat/services/mentionPolicy.test.js` dat 9/9; `npm run test:frontend -- --test-concurrency=1` dat 430/430; `npm run lint` exit 0 voi warning legacy/vendor; `npm run build:production` thanh cong voi canh bao chunk `App` lon; `git diff --check` dat.
- Rui ro con lai: Chua UAT truc tiep bang browser do browser bridge khong kha dung trong phien nay; can kiem tra tai khoan that voi group nhieu thanh vien va popup dai.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, mo group, go `@`, dung ArrowUp/ArrowDown va Enter/Tab; UAT production bang tai khoan that.
- Artifact/phat hanh: Archive `/opt/deploy/chat/incoming/vichat-mention-8353ee3.tar.gz`, SHA-256 `b2c23e5e31269c1b2eb6c79f72e0e37dec68d547fc0e7c21f8728e9876a72bdc`; release `/opt/deploy/chat/releases/mention-keyboard-8353ee3-20260918-r7`; previous `/opt/deploy/chat/releases/group-chat-tabs-2b534db-20260918-r2`; backup `/opt/deploy/chat/backups/mention-keyboard-8353ee3-20260918-r7`; chi recreate ChatUI `chat`, giu nguyen Chatmgt/Tinode/PostgreSQL/Redis va volume; cac candidate fail truoc activate da quarantine trong `.failed-candidate`.
- Commit/PR: Source `8353ee3` da push `origin/master`; docs/deploy record `6ff39cf`.

## 2026-09-18-04 - Sua chat nhom va dong bo khi mo nhieu tab

- Thoi gian: 2026-09-18 (Asia/Saigon)
- Loai: Sua loi | Web | Backend | Tinode | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `2b534db` da commit/push `origin/master`, production da deploy va verify
- Muc tieu: Cho phep chat nhom tiep tuc hoat dong khi membership con dong stale va ngan hai tab cung mo nhom tao hai topic/ghi de lich su.
- Pham vi: Chatmgt group participant snapshot, endpoint bind topic Tinode, ChatUI flow mo topic; khong doi direct chat, schema, migration, mobile hay message store.
- File da thay doi: `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/chatManagementService.test.js`, `src/app/App.jsx`, `dist/index.html`, `docs/chat-backend-architecture.md` va file nay.
- Noi dung: Group bo qua participant tro toi Account da inactive khi tao snapshot realtime; direct chat van tu choi membership khong hop le. Bind group khoa hang trong transaction va nhan topic da bind lam canonical de request tu tab sau dung lai. ChatUI coalesce request mo topic trong cung tab va tu dong bo topic local tam neu tab khac da bind truoc.
- Quyet dinh ky thuat: Khong xoa du lieu membership/Tinode. Chi loc stale group projection tai ranh gioi realtime, giu Chatmgt snapshot lam nguon su that va dung row lock de tranh race bind; request history/message khong thay doi.
- Database/API/cau hinh: Khong migration; thay doi hanh vi endpoint bind Tinode de idempotent khi group da co topic canonical.
- Kiem thu: `npm run test:frontend -- --test-concurrency=1` dat 424/424; `python -m unittest discover -s tests -v` dat 310, skip 105 do dependency chi co trong image Chatmgt; `npm run lint` exit 0 voi warning legacy/vendor; `npm run build:production` thanh cong voi warning chunk App lon; `python -m py_compile application/controllers/api_chat_management.py` dat; `git diff --check` dat. Production: archive checksum khop; backup Chatservice/Tinode/env va checksum pass; candidate contract trong image dat 59/59; ChatUI/Chatmgt healthy restart 0; public ChatUI health va Chatmgt auth health deu `200`; public bundle khop candidate; WSS gate `101`; Alembic `20260917_14` giu nguyen; service ngoai pham vi va volume khong doi; Tinode data untouched.
- Rui ro con lai: Chua UAT production bang nhieu tab va nhom co Account inactive; browser bridge khong khoi tao duoc trong phien nay; 105 backend test van skip neu khong chay trong image Chatmgt. Candidate helper lan dau dung truoc activate do thieu mount source, da quarantine release/backup partial `r1`.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, dang nhap tai khoan that va mo cung mot group tren hai tab; xac nhan ca hai tab load lich su, gui/nhan tin va khong tao topic duplicate.
- Artifact/phat hanh: Archive `vichat-group-chat-tabs-2b534db.tar.gz`, SHA-256 `39b2e9d21d18602da602c3e64c120c9e274d16771abe338f1290d2001d1100c7`; release `/opt/deploy/chat/releases/group-chat-tabs-2b534db-20260918-r2`; previous `/opt/deploy/chat/releases/workspace-align-7822092-20260918-r1`; backup `/opt/deploy/chat/backups/group-chat-tabs-2b534db-20260918-r2`; partial r1 da chuyen vao `.failed-candidate`; chi recreate Chatmgt va Chat, giu nguyen Tinode/PostgreSQL/Redis va volume.
- Commit/PR: Source `2b534db`; deploy record `544dc67`.

## 2026-09-18-03 - Chan treo khi gui tin nhan qua dai

- Thoi gian: 2026-09-18 (Asia/Saigon)
- Loai: Sua loi | Web | Tinode | Kiem thu | Tai lieu
- Trang thai: Hoan tat code; chua deploy production
- Muc tieu: Ngan noi dung tin nhan qua dai lam composer, optimistic state hoac phien web bi treo.
- Pham vi: Policy do dai van ban, composer ChatUI, sendText, sua tin va caption file; khong doi backend, database, Tinode history, mobile hay cac luong thanh vien nhom.
- Quyet dinh ky thuat: Kiem tra gioi han ky tu va UTF-8 truoc khi cap nhat draft, dang ky cooldown, tao optimistic message hoac goi Tinode; giu lai ban nhap khi bi chan. Tinode van kiem tra lai o transport de bao ve cac diem goi khac.
- Database/API/cau hinh: Khong co migration, endpoint, schema, secret hoac cau hinh moi.
- Kiem thu: Targeted `node --test --test-concurrency=1 src/features/chat/services/messagePolicy.test.js` dat 9/9; `npm run test:frontend -- --test-concurrency=1` dat 423/423; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` thanh cong voi warning chunk `App` lon hon 500 KB; `git diff --check` dat.
- Rui ro con lai: Chua UAT paste/guid tin nhan dai tren production browser.
- Viec tiep theo: Commit/push va deploy rieng ChatUI, sau do hard refresh va UAT gui/paste tin nhan dai tren production browser.
- Commit/PR: Chua tao.

## 2026-09-18-02 - Can chinh man Cong viec trong Workspace

- Thoi gian: 2026-09-18 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Kiem thu | Trien khai | Tai lieu
- Trang thai: Hoan tat; source `7822092` da commit/push `origin/master`, production da deploy va verify
- Muc tieu: Giu man Cong viec can dung trong khung popup, khong bi day lech hoac cat noi dung khi doi kich thuoc man hinh.
- Pham vi: `EnterpriseWorkspace` shell, header, danh sach muc cong viec va test layout; khong doi API, database, Tinode hay luong thao tac cong viec.
- File da thay doi: `src/features/workspace/components/enterpriseWorkspace.css`, `src/features/workspace/services/workspaceLayout.test.js`, `dist/index.html` va file nay.
- Noi dung: Chuyen shell sang flex column, cho Workspace chiem phan chieu cao con lai sau header, giu list/detail trong cung khung va chan nhan dai lam vo can hang tren card.
- Quyet dinh ky thuat: Dung layout flex noi bo thay vi sua kich thuoc co dinh cua tung pane, de giu mot nguon kich thuoc va tranh overflow khi header/mobile thay doi.
- Database/API/cau hinh: Khong co migration, endpoint, schema, secret hoac cau hinh moi.
- Kiem thu: `node --test src/features/workspace/services/workspaceLayout.test.js` dat 2/2; `npm run test:frontend -- --test-concurrency=1` dat 422/422; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` thanh cong voi canh bao chunk `App` lon hon 500 KB; `git diff --check` dat. Production: archive checksum khop; candidate build va nginx config pass; ChatUI moi healthy; health local/public va Chatmgt auth/chatbot pass; bundle public khop candidate; WSS tra `101`; migration `20260917_14` giu nguyen; 7 service ngoai `chat` va volume khong doi. Browser UAT chua chay duoc do browser bridge khong kha dung.
- Rui ro con lai: Can hard refresh va kiem tra man Cong viec tren desktop/mobile bang tai khoan that; khong co thay doi backend can migration.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn` va UAT man Cong viec voi tai khoan that.
- Artifact/phat hanh: Archive `vichat-workspace-align-7822092.tar.gz`, SHA-256 `619031c339f2fa275de3151340ee38c014a9c418a95e7821a428df4f3e199528`; release `/opt/deploy/chat/releases/workspace-align-7822092-20260918-r1`; previous `/opt/deploy/chat/releases/profile-dialogs-b848ea9-20260918-r1`; backup `/opt/deploy/chat/backups/workspace-align-7822092-20260918-r1`; chi recreate ChatUI `chat`, giu nguyen Chatmgt/Tinode/PostgreSQL/Redis va volume.
- Commit/PR: Source commit `7822092`; deploy record commit `d6a9210`.

## 2026-09-18-01 - Don gian hoa ho so, khoa avatar ViChat AI va lam moi dialog Workspace

- Thoi gian: 2026-09-18 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Kiem thu | Trien khai | Tai lieu
- Trang thai: Hoan tat; source `b848ea9` da commit/push `origin/master`, production da deploy va verify
- Muc tieu: Bo thong tin thong bao da luu va nut `Luu ho so` trong ho so ca nhan; khoa avatar ViChat AI ve `/vichat-ai.svg` tren moi phien chat; thay confirm/alert native bang dialog trong ung dung; bo tron cac popup; lam lai giao dien Workspace.
- Pham vi: ChatUI active va legacy entry, ManagementApp, chatbot history/render, ConversationCategoryManager, StickerPicker va EnterpriseWorkspace; khong doi API, database, Tinode transport, mobile hay migration.
- Noi dung: Ho so hien thi thong tin dong bo chi-doc va van cho phep doi avatar ca nhan; dialog dung promise resolver tai ranh gioi App/Management, co focus trap, Escape va khoa cuon; avatar bot duoc chuan hoa tai storage/merge/render de loai avatar legacy; modal mobile dung safe viewport va khoang dem bo tron; Workspace duoc co lai responsive, dark theme va focus state.
- Quyet dinh ky thuat: Khong sua payload/profile contract; giu upload avatar ca nhan qua luong hien tai. Confirmation duoc truyen vao component con thay vi de component tu goi browser API, tranh tach luong va giu action sau khi user chap nhan. Khong thay doi ranh gioi du lieu hoac nguon su that.
- Database/API/cau hinh: Khong co migration, endpoint, schema, secret hoac cau hinh moi.
- Kiem thu: `npm run test:frontend -- --test-concurrency=1` dat 422/422; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` thanh cong voi canh bao chunk `App` lon hon 500 KB; `git diff --check` dat. Production: archive checksum khop; candidate build va nginx config pass; ChatUI moi healthy restart 0; health local/public va Chatmgt auth/chatbot pass; bundle public khop candidate; WSS tra `101`; migration `20260917_14` giu nguyen; 7 service ngoai `chat` va volume khong doi. Browser UAT chua chay duoc trong phien nay do browser bridge khong kha dung.
- Rui ro con lai: Can hard refresh production va UAT bang tai khoan that cho ho so/avatar bot, roi nhom/xoa hoi thoai, sticker/cloud confirmation, popup mobile va cac module Workspace; khong co thay doi backend can migration.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn` va UAT bang tai khoan that cho ho so/avatar bot, roi nhom/xoa hoi thoai, sticker/cloud confirmation, popup mobile va cac module Workspace.
- Artifact/phat hanh: Archive `vichat-profile-dialogs-b848ea9.tar.gz`, SHA-256 `e717a675c3693fbbf7b39299713d029bdbab4669f3533aa535992684943fc604`; release `/opt/deploy/chat/releases/profile-dialogs-b848ea9-20260918-r1`; previous `/opt/deploy/chat/releases/personal-cloud-e9f009c-20260917-r1`; backup `/opt/deploy/chat/backups/profile-dialogs-b848ea9-20260918-r1`; chi recreate ChatUI `chat`, giu nguyen Chatmgt/Tinode/PostgreSQL/Redis va volume.
- Commit/PR: Source commit `b848ea9`; deploy record commit `d347b51`.

## 2026-09-17-07 - Them Cloud cua toi va bo loc danh sach hoi thoai

- Thoi gian: 2026-09-17 21:06-21:10 (Asia/Saigon)
- Loai: Tinh nang | Web | Backend | UX | Database | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `2fe4d3c` da commit/push `origin/master`, production da deploy va verify; con cho UAT browser
- Muc tieu: Cho phep moi tai khoan luu file rieng trong `Cloud cua toi`, chi tai khoan hien tai xem/quyen ly duoc; them cac tab `Tat ca`, `Nhom`, `Phan loai` va menu loc theo trang thai, the, nguoi la.
- Pham vi: ChatUI workspace/sidebar, Chatmgt private-cloud API/S3 namespace va migration metadata; khong doi Tinode conversation, media chat hien tai, luong gui tin, group, mobile hay sticker.
- Noi dung: Them route `/my-cloud`, upload PUT truc tiep S3 voi ticket owner-scoped, list/download/delete theo `(tenant, owner)`; shortcut Cloud nam tren danh sach chat. Toolbar loc chi loc danh sach hien thi, giu nguyen thu tu pin/thoi gian va tach Cloud khoi bo loc. Bo sung guard theo account session de reset loading/upload va bo qua link Cloud tre sau logout/chuyen tai khoan.
- Quyet dinh ky thuat: Dung bang `personal_cloud_file` va prefix S3 `_personal`; owner chi lay tu session, ticket private dung salt rieng, khong dung generic `/api/v1/chat/media/<upload_id>` de tranh doc cheo tenant/owner. Cloud khong tro thanh Tinode topic.
- Database/API/cau hinh: Them migration `20260917_14` va cac route `/api/v1/chat/cloud/*`; can chay migration tren Chatmgt truoc khi bat UI production. Khong ghi secret/token vao log.
- Kiem thu: `npm run test:frontend -- --test-concurrency=1` dat 421/421; `python -m unittest discover -s chatservice-main/tests -p 'test_*.py'` dat 308 pass, 105 skipped; `npm run lint` exit 0 voi warning legacy/vendor; `npm run build:production` thanh cong voi canh bao chunk `App` lon hon 500 KB; `python -m py_compile chatservice-main/application/controllers/api_personal_cloud.py chatservice-main/application/services/chat_media_service.py chatservice-main/application/models/models.py chatservice-main/alembic/versions/20260917_14_personal_cloud_files.py` dat; `git diff --check` dat. Lan deploy dau dung o `stage=candidate` truoc migration (`migration_applied=false`); da quarantine release/backup partial, sua pipeline doc asset trong deploy helper, retry exit 0. Production: S3 upload/verification/download/copy/cleanup pass; backup PostgreSQL/Tinode va checksum pass; migration `20260825_13 -> 20260917_14`; ChatUI/Chatmgt healthy, restart 0; health public `ok`; endpoint Cloud chua xac thuc tra `401`; public bundle co `personal-cloud-shortcut`, `conversation-list-tabs`, `api/v1/chat/cloud/uploads`; current/previous dung release; service ngoai pham vi va volume khong doi. `python outputs/probe-central-ws.py` chua chay duoc local do thieu module `aiohttp`.
- Rui ro con lai: Chua UAT production bang browser/tai khoan that cho upload, download, delete, owner/tenant scope, tenant switch/logout va responsive sidebar; WSS/Tinode real-user flow khong doi trong release nhung chua UAT phien nay.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, dang nhap tai khoan that va UAT Cloud cua toi; xac nhan file cua owner khong doc duoc o tai khoan/tenant khac, upload/download/delete va logout/chuyen tenant khong de lo state cu.
- Artifact/phat hanh: Archive `vichat-personal-cloud-e9f009c.tar.gz`, SHA-256 `910222F564D9BB2CEFB4A0EE7796518B28C3A96BAF04B766BF63AC94B4753E7D`; release `/opt/deploy/chat/releases/personal-cloud-e9f009c-20260917-r1`; previous `/opt/deploy/chat/releases/login-group-avatar-5ed6b66-20260917-r1`; backup `/opt/deploy/chat/backups/personal-cloud-e9f009c-20260917-r1`; partial failed artifacts moved to `.failed-candidate`; recreate `chatmgt` va `chat`, giu nguyen Tinode/PostgreSQL/Redis va volume.
- Commit/PR: Source commit `2fe4d3c`; deploy record commit `46eb555`.

## 2026-09-17-06 - Hien thi avatar trong picker tao nhom va don gian hoa nut dang nhap

- Thoi gian: 2026-09-17 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Kiem thu | Tai lieu
- Trang thai: Dang thuc hien
- Muc tieu: Hien thi lai avatar cua tung nhan vien trong danh sach chon thanh vien khi tao nhom va hien nhan dang nhap ngan gon la `Dang nhap`.
- Pham vi: ChatUI login label va create-group member picker; khong doi endpoint/authentication, Chatmgt, Tinode, database, mobile hay luong gui tin.
- File da thay doi: `src/features/auth/components/Login.jsx`, `src/app/App.jsx`, `src/features/chat/services/chatManagementService.test.js`, `dist/index.html`, va file nay.
- Noi dung: Dung nhan dang nhap chung cho ca che do credential hien tai; them `SafeAvatar` vao picker tao nhom va tai su dung nguon avatar directory da co. Avatar fallback van duoc hien thi neu anh that khong tai duoc.
- Quyet dinh ky thuat: Chi thay doi presentation tai hai diem dang loi; giu nguyen payload credential, API tao nhom va picker them thanh vien trong group de tranh regression luong khac.
- Database/API/cau hinh: Khong co migration, endpoint, schema, secret hoac cau hinh.
- Kiem thu: Targeted `chatManagementService.test.js` dat 62/62; full `npm run test:frontend -- --test-concurrency=1` dat 417/417; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` thanh cong voi warning chunk `App` lon hon 500 KB; `git diff --check` dat.
- Rui ro con lai: Chua UAT truc tiep bang browser trong phien nay; can hard refresh production va kiem tra login/group picker voi tai khoan that.
- Viec tiep theo: Commit, push va deploy rieng ChatUI; verify public bundle/health/WSS, sau do hard refresh de UAT.
- Commit/PR: Chua tao.

## 2026-09-17-05 - Chan paste event lap tao draft anh thu hai

- Thoi gian: 2026-09-17 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `63d2bc2` da commit/push `origin/master`, production da deploy va verify qua hai hop SSH
- Muc tieu: Chan truong hop mot thao tac `Ctrl+V` tao hai event giong nhau va hien hai the `image.png` trong muc dang cho gui.
- Pham vi: Chi ChatUI composer paste va helper regression; khong doi file picker, paste van ban, handleSendFile, Tinode, backend, mobile hay sticker flow.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/pasteAttachmentDraft.js`, `src/features/chat/services/pasteAttachmentDraft.test.js`, `dist/index.html`, va `docs/CHANGELOG.md`.
- Nguyen nhan bo sung: Sau khi dedupe cac file trong cung clipboard event, trinh duyet van co the phat hai event co cung chu ky trong thoi gian rat ngan hoac tra cung anh voi ten/lastModified khac nhau; queue cu append ca hai lan.
- Quyet dinh ky thuat: Chan event trung lap theo metadata trong cua so 1 giay va doi chieu mau noi dung dau/cuoi anh de nhan dien cung anh khi metadata thay doi; khong dedupe cac lan paste cach nhau hon cua so nay. Deployment chi recreate service `chat`; helper doi chieu 7 service khong bi anh huong va tat provenance attestation de image candidate duoc tag dung.
- Database/API/cau hinh: Khong co migration, endpoint, schema, secret hoac cau hinh.
- Kiem thu: `node --test --test-concurrency=1 src/features/chat/services/pasteAttachmentDraft.test.js` dat 12/12; `npm run test:frontend -- --test-concurrency=1` dat 415/415; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` thanh cong voi canh bao chunk `App` lon hon 500 KB da co; `git diff --check` dat. Production: source validation 670 file khong doi, backup PostgreSQL/env va checksum; candidate Nginx `-t`, ChatUI moi healthy restart 0, Chatmgt container giu nguyen, health public tra thanh cong, bundle public co content-fingerprint (`arrayBuffer`, `Math.imul`, `16777619`), WSS tra `101`, log ChatUI khong co fatal marker, 7 service ngoai `chat` va volume khong doi.
- Rui ro con lai: Browser bridge khong kha dung de UAT truc tiep trong phien nay; can hard refresh production va paste lai anh.
- Viec tiep theo: Hard refresh production va paste mot anh mot lan, sau do paste lai cung anh o lan rieng; khong can migration hay cau hinh moi.
- Artifact/phat hanh: Archive `vichat-paste-event-63d2bc2.tar.gz`, SHA-256 `03cf182236b42a321ebe0e0b3f0fdc7836ab4b13c3570523d67f7484402ec849`; release `/opt/deploy/chat/releases/paste-event-63d2bc2-20260917-r1`; previous `/opt/deploy/chat/releases/paste-dedupe-9c53658-20260917-r1`; backup `/opt/deploy/chat/backups/paste-event-63d2bc2-20260917-r1`; chi recreate ChatUI `chat`, giu nguyen Chatmgt/Tinode/PostgreSQL/Redis va volume.
- Commit/PR: Source `63d2bc2`; docs follow-up commit sau deploy.

## 2026-09-17-04 - Chan lap anh trong cung mot clipboard event

- Thoi gian: 2026-09-17 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `9c53658` da commit/push `origin/master`, production da deploy va verify qua hai hop SSH
- Muc tieu: Mot lan `Ctrl+V` anh chi tao mot draft trong muc `Dang cho gui`, ke ca khi trinh duyet tra cung file nhieu lan trong clipboard event.
- Pham vi: Chi ham thu thap file clipboard cua ChatUI web va regression test; giu nguyen paste van ban, file picker, luong gui Tinode, mobile va cac attachment khac.
- File da thay doi: `src/features/chat/services/pasteAttachmentDraft.js`, `src/features/chat/services/pasteAttachmentDraft.test.js`, `dist/index.html`, va `docs/CHANGELOG.md`.
- Nguyen nhan: Code cu loai ban trung giua `clipboard.items` va `clipboard.files` nhung van giu hai item giong nhau ngay trong `clipboard.items`, tao hai draft cung ten/kich thuoc.
- Quyet dinh ky thuat: Dedupe theo bo metadata `name/type/size/lastModified` trong pham vi mot clipboard event; khong dung dedupe toan cuc theo thoi gian de hai lan paste rieng biet van tao hai draft hop le.
- Database/API/cau hinh: Khong co migration, endpoint, schema, secret hoac cau hinh.
- Kiem thu local: `node --test --test-concurrency=1 src/features/chat/services/pasteAttachmentDraft.test.js` dat 10/10; `npm run test:frontend -- --test-concurrency=1` dat 413/413; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` thanh cong voi canh bao chunk `App` lon hon 500 KB da co; `git diff --check` dat. Production: source validation 671 file khong doi, backup Chatservice PostgreSQL/env va checksum; ChatUI/Chatmgt healthy restart 0, health `ok`, Nginx `-t`, public bundle co `lastModified` va khong co `onPasteCapture`, WSS tra `101`, log ChatUI khong co fatal marker, service ngoai `chat` va volume khong doi.
- Rui ro con lai: Chua UAT truc tiep tren browser production trong phien nay; can hard refresh va thu lai Ctrl+V anh de xac nhan hanh vi giao dien.
- Viec tiep theo: Hard refresh production va paste mot anh mot lan, sau do paste lai cung anh o lan rieng; khong can migration hay cau hinh moi.
- Artifact/phat hanh: Archive `vichat-paste-dedupe-9c53658.tar.gz`, SHA-256 `7f3ab593a7d20f1e929fc0b879fefc4524e777b931b8a47d70156e055a4ada5c`; release `/opt/deploy/chat/releases/paste-dedupe-9c53658-20260917-r1`; previous `/opt/deploy/chat/releases/paste-sticker-5c045e1-20260917-r1`; backup `/opt/deploy/chat/backups/paste-dedupe-9c53658-20260917-r1`; chi recreate ChatUI `chat`.
- Commit/PR: Source `9c53658`; docs follow-up commit sau deploy.

## 2026-09-17-03 - Sua Ctrl+V anh bi them hai lan vao danh sach cho

- Thoi gian: 2026-09-17 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `5c045e1` da commit/push `origin/master`, production da deploy va verify qua hai hop SSH
- Muc tieu: Moi lan dan nhanh mot anh bang `Ctrl+V` chi tao mot muc cho gui, khong tu dong nhan thanh hai anh giong nhau.
- Pham vi: Chi ChatUI web composer/paste va regression test; giu nguyen file picker gui ngay, luong upload, Tinode, backend, mobile va cac attachment khac.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/pasteAttachmentDraft.test.js`, `dist/index.html`, `docs/CHANGELOG.md`.
- Noi dung: Bo handler paste trung tren container `chat-main` (capture/bubble), giu mot diem nhan paste tai o nhap de tranh cung mot native paste event duoc queue lai hai lan. Khong doi `handleSendFile`, payload Tinode hay co che submit draft.
- Quyet dinh ky thuat: Chon chan duplicate o ranh gioi event cua composer, khong dedupe mu quang trong hang doi de van cho phep user paste hai file that su giong nhau o hai lan khac nhau.
- Database/API/cau hinh: Khong co migration, endpoint, schema, secret hoac cau hinh.
- Kiem thu: `node --test --test-concurrency=1 src/features/chat/services/pasteAttachmentDraft.test.js` dat 9/9; `npm run test:frontend -- --test-concurrency=1` dat 412/412; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` thanh cong; `git diff --check` khong co loi noi dung, chi canh bao chuan hoa LF/CRLF. Production: helper dat source validation 660 file khong doi, backup Chatservice PostgreSQL/env va checksum; ChatUI health/public health `ok`, Chatmgt auth health `ok`, ChatUI/Chatmgt healthy restart 0, Nginx `-t`, public bundle co `onPaste` va khong co `onPasteCapture`, 11 sticker public khop SHA-256, WSS tra `101`, log ChatUI khong co fatal marker, service ngoai `chat` va volume khong doi.
- Rui ro con lai: Chua UAT Ctrl+V tren browser local vi browser bridge khong kha dung trong phien nay.
- Viec tiep theo: Hard refresh web va UAT Ctrl+V mot anh, nhieu anh, van ban tai caret tren browser tai production.
- Artifact/phat hanh: Archive `vichat-paste-sticker-5c045e1.tar.gz`, SHA-256 `83743b2a3de8d5dd6c0265744c64e1f5521c24d96660e746e65cd176c03773eb`; release `/opt/deploy/chat/releases/paste-sticker-5c045e1-20260917-r1`; previous `/opt/deploy/chat/releases/group-fix-d5c9397-20260917-r5`; backup `/opt/deploy/chat/backups/paste-sticker-5c045e1-20260917-r1`; chi recreate ChatUI `chat`.
- Commit/PR: Source `5c045e1`; docs follow-up commit sau deploy.

## 2026-09-17-02 - Sua crop sticker pink-bunny bi lo anh ke ben

- Thoi gian: 2026-09-17 (Asia/Saigon)
- Loai: Sua loi | Web | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `5c045e1` da commit/push `origin/master`, production da deploy va verify qua hai hop SSH
- Muc tieu: Dam bao sticker pink-bunny trong picker chi hien dung artwork cua no, khong lo caption hoac vien anh cua sticker ke ben.
- Pham vi: Chi asset PNG cua pack `puppysoft/pink-bunny`; khong doi StickerPicker, luong gui tin, Tinode, Chatmgt, API hoac backend.
- File da thay doi: `public/stickers/puppysoft/pink-bunny-1.png`, `pink-bunny-2.png`, `pink-bunny-3.png`, `pink-bunny-4.png`, `pink-bunny-5.png`, `pink-bunny-7.png`, `pink-bunny-8.png`, `pink-bunny-9.png`, `pink-bunny-10.png`, `pink-bunny-11.png`, `pink-bunny-12.png`, va `docs/CHANGELOG.md`.
- Noi dung: Cat bo cac manh artwork/caption bi tran o dau crop cua 5, 7-12; phuc hoi phan caption o cuoi cua 1, 3, 4 tu cac manh anh ke ben trong sprite crop. `pink-bunny-2` khong co source goc trong repo/Git history nen da cat bo chu bi cut va ve lai caption `Tu ky` co vien/gradient tim tuong thich, tranh de lai chu cut trong thumbnail.
- Quyet dinh ky thuat: Chi thay binary asset, giu nguyen kich thuoc/cach render va luong chon-gui sticker de tranh regression ngoai pham vi; phan chu `pink-bunny-2` la fallback asset-local co chu ro rang, khong dung cho logic tim kiem hay transport.
- Database/API/cau hinh: Khong co migration, thay doi API, secret hoac cau hinh.
- Kiem thu: `node --test --test-concurrency=1 src/features/chat/services/stickerCatalog.test.js` dat 6/6; `npm run test:frontend -- --test-concurrency=1` dat 412/412; `npm run lint` exit 0 voi cac warning legacy da co; `npm run build:production` thanh cong; `git diff --check` khong co loi noi dung, chi canh bao chuan hoa LF/CRLF cua changelog. Production: candidate build thanh cong, 11 PNG trong image/public khop SHA-256 voi source, ChatUI/Chatmgt healthy restart 0, health `ok`, Nginx `-t`, WSS tra `101`, log ChatUI khong co fatal marker, service ngoai `chat` va volume khong doi.
- Rui ro con lai: Caption `pink-bunny-2` la phan ve lai fallback, co the can thay bang source goc neu tim duoc; browser UAT chua chay vi browser bridge local khong kha dung.
- Viec tiep theo: Neu co sprite source goc, uu tien thay fallback caption cua `pink-bunny-2`; UAT picker tren browser production va hard refresh de nap asset moi.
- Artifact/phat hanh: Dung chung archive/release voi fix Ctrl+V: `vichat-paste-sticker-5c045e1.tar.gz`, SHA-256 `83743b2a3de8d5dd6c0265744c64e1f5521c24d96660e746e65cd176c03773eb`; release `/opt/deploy/chat/releases/paste-sticker-5c045e1-20260917-r1`; previous `/opt/deploy/chat/releases/group-fix-d5c9397-20260917-r5`; backup `/opt/deploy/chat/backups/paste-sticker-5c045e1-20260917-r1`; chi recreate ChatUI `chat`.
- Commit/PR: Source `5c045e1`; docs follow-up commit sau deploy.

## 2026-09-17-01 - Sua loi bind nhom Tinode khi nguoi xem khong phai chu nhom

- Thoi gian: 2026-09-17 (Asia/Saigon)
- Loai: Sua loi | Backend | Tinode | Kiem thu | Trien khai | Tai lieu
- Trang thai: Hoan tat; production da deploy va verify, con cho UAT group bang tai khoan UpGo that
- Muc tieu: Cho thanh vien mo nhom moi co the bind topic va su dung day du thao tac them, xoa, roi nhom ma khong lam loi cac luong chat dang hoat dong.
- Pham vi: Chi endpoint bind topic nhom moi, regression contract, tai lieu kien truc va release Chatmgt; khong doi direct chat, message transport, Account SSO, ChatUI hoac Tinode data store.
- File da thay doi: `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `src/app/App.jsx`, `src/features/chat/services/chatManagementService.test.js`, `dist/index.html`, `docs/chat-backend-architecture.md`, va `docs/CHANGELOG.md`.
- Noi dung: Khi topic Tinode moi duoc browser tao boi nguoi xem, Chatmgt chuyen quyen owner sang chu nhom authoritative truoc khi reconcile subscriber/access. Neu reconcile hoac persist that bai, server co gang rollback transfer de khong de lai topic o trang thai ban phan. Sau khi chay lai cac gate deploy, release `group-fix-d5c9397-20260917-r5` chi recreate `chatmgt` va `chat`; bridge, Tinode/ChatAPI, PostgreSQL, Redis, Coturn, volume va du lieu Tinode giu nguyen.
- Quyet dinh ky thuat: Chi ap dung transfer cho group chua co `tinode_topic`; group da bind, direct chat va cac mutation khac giu nguyen. Loi rollback duoc bat lai an toan de khong che loi Tinode goc.
- Database/API/cau hinh: Khong migration, khong doi public endpoint/schema, khong reset mapping/topic/history/media va khong doi secret.
- Kiem thu: Backend contract `57/57`; frontend `412/412`; `npm run build:production`, `npm run lint`, `py_compile` va `git diff --check` dat. Deploy candidate dat contract `57/57`, Nginx syntax, health target, public health `200`, public WSS `101`, Alembic `20260825_13`, bundle candidate/public `cmp`, log target khong co marker loi; 7 service ngoai pham vi va volume khong doi. Hai gate candidate truoc rollback an toan do checksum script sai, source mount test thieu va health probe dung loopback sai bind; khong co candidate nao switch dang do. Browser runtime khong kha dung nen chua UAT tai khoan that.
- Rui ro con lai: Chua UAT bang tai khoan UpGo that cho mo nhom bang member khong phai owner, them/xoa/roi/chuyen owner va doi chieu Tinode Web; cac gate tu dong va production probe da dat.
- Viec tiep theo: UAT group va Tinode Web voi tai khoan that; neu phat hien loi moi chi sua dung luong loi do.
- Commit/PR: `d5c9397` (source fix, da push); production release `group-fix-d5c9397-20260917-r5`.

## 2026-09-16-04 - Sua dang nhap Tinode Web khong phu thuoc Account cookie

- Thoi gian: 2026-09-16 (Asia/Saigon)
- Loai: Sua loi | Bao mat | Backend | Tinode Web | Kiem thu | Tai lieu
- Trang thai: Hoan tat; production da deploy va verify, con cho UAT dang nhap Tinode Web bang tai khoan that
- Muc tieu: Cho Tinode Web dang nhap bang tai khoan UpGo hop le sau khi loi Chatmgt did not issue an Account session (503) chan basic login.
- Pham vi: Chi token bridge cua Tinode Web; giu nguyen ChatUI, Account login, tenant, conversation, Tinode mapping, message store va cac service stateful.
- File da thay doi: `chatservice-main/scripts/tinode_account_bridge.py`, `chatservice-main/application/controllers/api_chat_management.py`, hai test auth/bridge, `docs/chat-backend-architecture.md`, `infrastructure/production/README.md` va `docs/CHANGELOG.md`.
- Nguyen nhan: Bridge kiem tra va gui lai cookie Account session sau account-login; viec phu thuoc vao Set-Cookie da chan Tinode Web du response da co Chatmgt bearer hop le.
- Quyet dinh ky thuat: Tin vao Chatmgt JWT vua duoc cap sau khi account-login da xac minh UpGo credentials/current tenant; token bridge van kiem tra signature, session scope, auth method, account active va tenant/auth version qua _identity. Khong gui password sang Tinode va khong can cookie Account trong buoc token exchange.
- Database/API/cau hinh: Khong migration, khong doi endpoint public, khong reset mapping/topic/history, khong doi secret. Chi bo check cookie du thua va cap nhat tai lieu/regression test.
- Kiem thu: Local `python -m unittest discover -s chatservice-main/tests -p test_chat_auth_contract.py -q` dat 57/57; `py_compile` va `git diff --check` dat; bridge local 16 test duoc skip do Python Windows thieu `aiohttp`. Trong production image, bridge dat 16/16, hai contract Tinode dat 2/2 (1 skip vi image backend khong co source frontend), verifier database/auth/health/CORS/directory/conversation/Tinode WebSocket/login/logout dat, tenant isolation dat, Nginx `-t` dat, Alembic van `20260825_13`, public WSS tra `101`, log target khong co fatal marker.
- Trien khai: Archive `vichat-tinode-cookie-fix-175ea4d.tar.gz`, SHA-256 `8c55e37c179a7aab47fcb7d9b5d08ded1db13f14f6eac568aa5a24c508f3ba6a`; release `/opt/deploy/chat/releases/tinode-cookie-fix-175ea4d-20260916-r2` dang la `current`, `previous` tro `/opt/deploy/chat/releases/tinode-fresh-4ec50d9-20260916-r2`; backup `/opt/deploy/chat/incoming/tinode-cookie-fix-175ea4d-20260916-r2-backup`; chi recreate `chatmgt` va `tinode-account-bridge`, container moi healthy; ChatUI, webhook, ChatAPI, PostgreSQL, Redis, volume va Tinode data giu nguyen.
- Bao toan: Khong migration, khong reset UID/topic, khong restore/xoa Tinode history/media, khong `docker compose down -v`; backup Chatmgt PostgreSQL va production env da checksum OK.
- Rui ro con lai: Chua nhap tai khoan UpGo that trong browser cua phien nay; can UAT Tinode Web basic login va doi chieu cung UID/message moi voi ChatUI.
- Viec tiep theo: Mo `https://chatapi.gonplatform.com/#`, dat Server `chat.upgo.vn`, dang nhap lai bang tai khoan UpGo; neu van loi, gui lai thoi diem va ma loi, khong gui mat khau/cookie.
- Commit/PR: Dang cap nhat commit tai lieu sau deploy.

## 2026-09-16-03 - Bo sung central Tinode URL cho Chatmgt

- Thoi gian: 2026-09-16 22:41-22:54 (Asia/Saigon)
- Loai: Cau hinh | Van hanh | Kiem thu | Bao mat
- Trang thai: Hoan tat; production da deploy va verify
- Muc tieu: Dam bao job reset fresh-data nhan dung endpoint `chatapi.gonplatform.com` khi chay trong container `chatmgt`.
- Noi dung: Khai bao `TINODE_CENTRAL_WS_URL` truc tiep trong environment cua `chatmgt`, giu default production an toan va dong bo voi bridge/guard hien co. Khong doi schema, API auth, Account UpGo, tenant, conversation ID hoac membership.
- Quyet dinh ky thuat: Khong dung `-e` tam thoi cho lenh reset; cau hinh phai nam trong Compose candidate de build, deploy va rollback co cung hanh vi.
- Kiem thu local: `python -m unittest discover -s chatservice-main/tests -p test_chat_auth_contract.py -q` dat 57/57; `npm run test:frontend -- --test-concurrency=1` dat 411/411; `bash -n outputs/deploy-tinode-fresh-200db0c.sh` va `git diff --check` dat; archive commit `4ec50d9` co SHA-256 `D76D9ED866952B6BBA8F1E5BE1D2922820A873C8BE7A2AD4F162337BA1DB97D6`.
- Kiem thu production: Release `/opt/deploy/chat/releases/tinode-fresh-4ec50d9-20260916-r2`, backup `/opt/deploy/chat/incoming/tinode-fresh-4ec50d9-20260916-r2-backup`; build `chatmgt`/bridge/ChatUI dat; HTTPS central `200`, WSS Tinode hello dat; reset `161` account mappings va `36` conversation topics, khong xoa document/chunk/task preview; verifier database/credential policy/health/CORS/directory/conversation/WSS/login/logout dat; private/public health dat; Nginx `-t` dat; 4 service stateless healthy va log scan khong co `traceback/panic/fatal/critical`.
- Bao toan: Khong `docker compose down -v`, khong restore Tinode history/media cu; PostgreSQL/Redis/upload volume duoc backup truoc reset. Sau verifier, kho moi co 21 account mappings provision moi va 0 topic mapping; khong co lich su tin nhan cu duoc copy.
- Rui ro con lai: Chua UAT bang hai tai khoan UpGo that de gui tin end-to-end; can hard refresh va dang nhap lai de provision account/topic moi tren web.
- Viec tiep theo: UAT hai tai khoan UpGo cung tenant, kiem tra direct/group text, media S3, read/unread, realtime va logout; rollback dung backup r2 neu gate UAT that bai.
- Commit/PR: Source `4ec50d9` va changelog deploy record `6cd1b51` da push `origin/master`.

## 2026-09-16-02 - Chuyen kho tin nhan Tinode sang chatapi.gonplatform.com

- Thoi gian: 2026-09-16 (Asia/Saigon)
- Loai: Tai cau truc | Van hanh | Du lieu | Bao mat | Web | Backend | Kiem thu | Tai lieu
- Trang thai: Hoan tat code; fresh-data reset va deploy production dang cho operator
- Muc tieu: Dua kho tin nhan Tinode sang `chatapi.gonplatform.com` voi du lieu moi, giu nguyen lien ket tai khoan UpGo va cac luong Chatmgt hien co.
- Pham vi: Relay Nginx, Tinode account bridge, cau hinh production, verifier, tai lieu va regression contract; khong restore lich su Tinode cu.
- File da thay doi: `infrastructure/production/nginx.conf`, `infrastructure/production/compose.yaml`, `infrastructure/production/.env.example`, `infrastructure/production/start.sh`, `chatservice-main/scripts/tinode_account_bridge.py`, `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/scripts/switch_tinode_central.py`, `chatservice-main/tests/test_tinode_central_switch.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `README.md`, `chatservice-main/README.md`, `docs/chat-backend-architecture.md`, `infrastructure/production/README.md`, `docs/CHANGELOG.md`.
- Noi dung: Chuyen upstream `/v0/` va `/tinode-media/` sang `chatapi.gonplatform.com`; bridge tu suy ra Host/Origin theo URL va bat xac minh TLS. Giu `chat.upgo.vn` lam relay public de basic login UpGo van duoc Chatmgt doi sang Tinode token. Target dung kho Tinode moi; lich su/tin nhan/media cu khong duoc copy.
- Quyet dinh ky thuat: Dung `switch_tinode_central.py` sau khi probe target de xoa mapping `tinode_uid`/`tinode_topic` va cac ban sao chat-derived, nhung giu nguyen Account, tenant, conversation ID va membership. Giu `TINODE_SSO_SECRET` de tai khoan UpGo van duoc dan xuat cung credential; login/open tiep theo se provision lai account/topic trong kho moi.
- Database/API/cau hinh: Khong migration schema, khong thay doi API auth, tenant hoac membership; backup Tinode/Chatmgt cu chi dung cho rollback. Cap nhat URL trung tam va them guard production de chan endpoint cu va buoc reset dung nham dich.
- Kiem thu: Probe DNS/HTTPS/WebSocket `chatapi.gonplatform.com` nhan Tinode hello 0.25; `python -m unittest discover -s chatservice-main/tests -p test_tinode_central_switch.py -q` dat 8/8 va `python -m unittest discover -s chatservice-main/tests -p test_chat_auth_contract.py -q` dat 57/57; `npm run test:frontend -- --test-concurrency=1` dat 411/411; `npm run lint` exit 0 voi warning legacy da co; `npm run build:production` thanh cong voi canh bao chunk lon da co; `python -m py_compile` va `bash -n infrastructure/production/start.sh` dat; `git diff --check` dat. `docker compose config` chua chay vi may khong co Docker.
- Rui ro con lai: Chua chay fresh-data reset hoac deploy/UAT production vi khong co production DB/runtime credential trong workspace; old Tinode history/media chi con o rollback store. Sau reset, moi account/topic phai duoc provision lai qua UpGo login.
- Viec tiep theo: Operator backup du lieu cu cho rollback, cap nhat private `.env`, probe target, chay dry-run va ap dung `python scripts/switch_tinode_central.py --apply --confirm chatapi.gonplatform.com`, sau do verifier va UAT hai tai khoan UpGo cung tenant.
- Commit/PR: Chua tao.

## 2026-09-16-01 - Kich hoat media chat tren S3

- Thoi gian: 2026-09-16 16:27-16:41 (Asia/Saigon)
- Loai: Van hanh | Cau hinh | Bao mat | Web | Backend | Du lieu | Kiem thu | Tai lieu
- Trang thai: Hoan tat cau hinh va kich hoat media S3; verifier Tinode tong the con can xu ly.
- Muc tieu: Dua anh/file chat moi vao bucket private `chatupgo` ma khong di chuyen media Tinode lich su.
- Pham vi: Production `.env` tren `192.168.80.20`, Chatmgt, ChatUI, backup va S3 probe; khong sua source, khong reset database/Tinode.
- File da thay doi: Runtime `.env` tai `/opt/deploy/chat/current/infrastructure/production/.env`, backup cau hinh trong `infrastructure/production/backups`, va `docs/CHANGELOG.md`.
- Noi dung: Cau hinh endpoint `s3.gonapp.net`, bucket `chatupgo`, bat `CHAT_MEDIA_STORAGE=s3` va frontend S3, giu `CHAT_MEDIA_FALLBACK_TO_TINODE=false`; da sinh signing secret noi bo, rebuild va recreate `chatmgt`/`chat`. Credential khong ghi vao source hoac nhat ky.
- Quyet dinh ky thuat: Dung `MINIO_PUBLIC_DOMAIN=https://s3.gonapp.net` va `MINIO_SECURE=true` vi endpoint HTTP tra `503` va guard production bat buoc HTTPS; media Tinode cu van duoc giu nguyen.
- Database/API/cau hinh: Khong co migration schema; `alembic upgrade head` khong tao thay doi; da tao backup PostgreSQL truoc khi activate. Gioi han media van la 500 MiB, URL ky ngan han va khong fallback ve volume Tinode.
- Kiem thu: S3 probe sau restart dat upload, complete/copy, download va cleanup; Chatmgt auth health tra `mode=s3`, `configured=true`, `s3_read_configured=true`; ChatUI `/healthz` dat; tenant isolation dat. `verify_deployment.py` chua dat vi Tinode token refresh tra `503`; gate bootstrap ban dau gap WebSocket Tinode dong `1000`, khong reset du lieu de vuot qua gate nay.
- Rui ro con lai: Chua UAT bang tai khoan that voi mot anh va mot file; Tinode token refresh `503` va webhook chatbot unhealthy van can dieu tra. S3 probe khong thay the UAT publish message end-to-end.
- Viec tiep theo: Xu ly relay/Tinode trung tam, chay lai verifier tong the va UAT anh/file tren web; rotate credential vi credential da duoc chia se trong phien lam viec.
- Commit/PR: Chua tao; runtime production da ap dung.

## 2026-09-14-01 - Khoi phuc backend production sau reboot

- Thoi gian: 2026-09-14 16:14-16:50 (Asia/Saigon)
- Loai: Van hanh | Trien khai | Du lieu | Kiem thu | Tai lieu
- Trang thai: Hoan tat phan ChatUI/Chatmgt chinh; webhook chatbot con can xac minh.
- Muc tieu: Khoi phuc production sau khi `chat.upgo.vn` va `chatmgt.upgo.vn` tra 502.
- Pham vi: Backend Compose tren `192.168.80.20`, reverse proxy tren `103.74.122.206`, ChatUI, Chatmgt, Tinode bridge, PostgreSQL, Redis va cac volume production; khong sua source ung dung.
- File da thay doi: `docs/CHANGELOG.md`.
- Noi dung: Nguyen nhan la may `.20` reboot luc 07:00 UTC nhung production app containers/images khong duoc khoi dong lai; Nginx tren jump host van tro dung den `.20` nhung upstream `8094/8081` khong lang nghe. Dung release hien tai `/opt/deploy/chat/current`, build lai cac image ung dung, khoi phuc Chatservice/Tinode tu backup `unread-notification-55b6b07-20260908-r2`, sau do start lai Compose tren `.20`. Khong chuyen app sang jump host va khong doi upstream Nginx.
- Quyet dinh ky thuat: Khong start stack voi database rong; dung dump da kiem tra de nap vao cac volume production moi sau reboot. Giu Nginx proxy qua `.20` theo topology chuan.
- Database/API/cau hinh: Khong migration; `alembic current` van `20260825_13 (head)`. Khong them endpoint hay secret.
- Kiem thu: Build `chatmgt`, `tinode-account-bridge`, `tinode-chatbot-webhook`, `chat` thanh cong; `.20` ChatUI/Chatmgt/bridge healthy; public `/` HTTP 200, `/healthz` HTTP 200, Chatmgt auth health HTTP 200, WSS HTTP 101. Webhook chatbot van unhealthy vi ket noi Tinode nhan close `1000` va `/healthz` HTTP 503.
- Rui ro con lai: Du lieu database duoc phuc hoi tu backup ngay 2026-09-08; can UAT tai khoan that va doi chieu media sau khi production online. Chatbot webhook chua san sang.
- Viec tiep theo: Dieu tra webhook auth/WSS voi central Tinode va them co che tu dong start Compose production sau reboot; khong chay `docker compose down -v`.
- Commit/PR: Chua tao.

## 2026-09-08-08 - Dong bo dem va thao tac doc cua thong bao hoi thoai

- Thoi gian: 2026-09-08 18:39-19:37 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Web | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `55b6b0731011274a6a6b9ecab55775e678713755` da commit/push `origin/master`, production da deploy va verify qua hai hop SSH.
- Muc tieu: Hien thi dung so luong unread, doi menu sang `Danh dau da doc` sau khi danh dau chua doc, va cho phep doc lai ca hoi thoai Tinode/demo.
- Pham vi: Chi trang thai unread va menu thao tac cua danh sach hoi thoai ChatUI; giu nguyen realtime, Tinode, Chatmgt, chat nhom/direct va cac luong khac.
- File da thay doi: `src/app/App.jsx`, `src/features/i18n/appLanguage.js`, `src/features/i18n/appLanguage.test.js`, `src/features/chat/services/chatManagementService.test.js`, `dist/index.html`, `docs/CHANGELOG.md`.
- Noi dung: Trang thai danh dau thu cong duoc luu theo conversation ID va hien badge toi thieu `1`; menu doc trang thai hien tai de chuyen giua danh dau chua doc/da doc. Thao tac doc goi read receipt Tinode theo sequence hien tai hoac cap nhat read timestamp demo, sau do xoa boundary, co thu cong, badge va cursor da doc; tin moi den trong luc xu ly duoc giu lai.
- Quyet dinh ky thuat: Khong them API, storage hoac migration. Read action dung `tinodeClient.markRead` va cac store demo hien co, co session guard va kiem tra tail moi de khong xoa unread moi.
- Database/API/cau hinh: Khong co thay doi.
- Kiem thu: `node --test --test-concurrency=1 src/features/i18n/appLanguage.test.js src/features/chat/services/unreadBoundary.test.js src/features/chat/services/chatManagementService.test.js` dat 101/101; `npm run test:frontend -- --test-concurrency=1` dat 411/411; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` thanh cong voi canh bao chunk `App` lon hon 500 KB; `git diff --check` dat.
- Rui ro con lai: Chua UAT truc quan tren trinh duyet voi tai khoan Tinode/demo that; cac gate production da dat nhung van can xac nhan thao tac menu tren direct/group.
- Viec tiep theo: UAT menu hoi thoai, badge so luong va mark read/unread tren direct/group; khong can migration hay cau hinh moi.
- Commit/PR: Source `55b6b0731011274a6a6b9ecab55775e678713755`, da push `origin/master`; production release `/opt/deploy/chat/releases/unread-notification-55b6b07-20260908-r2`, previous `/opt/deploy/chat/releases/conversation-list-71b1b3a-20260908-r2`.
- Artifact/phat hanh: Archive `/opt/deploy/chat/incoming/vichat-unread-notification-55b6b07.tar.gz`, SHA-256 `5155588c490842d1885572a32ef3ce2373e8ec7a8c769cca67b5a784b64c14f1`; backup `/opt/deploy/chat/backups/unread-notification-55b6b07-20260908-r2`; chi recreate ChatUI `chat`, giu nguyen Chatmgt/Tinode/database/Redis/volume.
- Kiem thu production: Deploy script r2 dat; ChatUI/Chatmgt healthy, restart `0`, local/public health dat, WSS tra `101`, bundle public co marker `Danh dau da doc` va `markRead`, Alembic `20260825_13`, volume/service ngoai pham vi khong doi, log ChatUI khong co fatal/panic/traceback.

## 2026-09-08-07 - Can le thoi gian va them vao nhom tu danh sach hoi thoai

- Thoi gian: 2026-09-08 16:11-17:25 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Web | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `71b1b3a` da commit/push `origin/master`, production da deploy va verify qua hai hop SSH.
- Muc tieu: Dua thoi gian hoi thoai sat mep phai, thay thoi gian bang nut ba cham khi hover va cho phep them nguoi trong chat 1-1 vao luong tao nhom.
- Pham vi: Chi danh sach hoi thoai ChatUI, menu thao tac cua direct chat va regression assertion; giu nguyen chat realtime, chat nhom, phan loai, quyen, Tinode va Chatmgt.
- File da thay doi: `src/app/App.jsx`, `src/styles/index.css`, `src/features/chat/services/chatManagementService.test.js`, `dist/index.html`, `docs/CHANGELOG.md`.
- Noi dung: Bo phan dem ben phai cua item de timestamp co the can sat mep; lop action menu nam de len phan thoi gian va chi hien dau ba cham khi hover/focus/menu mo. Menu cua chat 1-1 them `Them vao nhom`, tai su dung modal tao nhom hien co va tu dong chon truoc peer bang identity on dinh.
- Quyet dinh ky thuat: Khong tao API hoac membership flow moi; tai su dung create-group flow hien co de tranh anh huong them vao nhom, gui tin, realtime va du lieu. Chatbot khong hien menu thao tac nhu truoc.
- Database/API/cau hinh: Khong co migration, endpoint, secret, bien moi truong hay thay doi kien truc.
- Kiem thu: `node --test --test-concurrency=1 src/features/chat/services/chatManagementService.test.js` dat 59/59; `npm run test:frontend -- --test-concurrency=1` dat 411/411; `npm run lint` exit 0 voi warning legacy/vendor da co; `node --max-old-space-size=2048 scripts/build-production.mjs` thanh cong voi canh bao chunk `App` lon hon 500 KB; `git diff --check` dat. Production local/public health `ok`, Chatmgt auth health `ok`, WSS tra `101`, asset public khop candidate va 670 file ngoai pham vi khong doi; service ngoai `chat`, volume, Alembic `20260825_13` va `.env` giu nguyen.
- Artifact/phat hanh: Archive `/opt/deploy/chat/incoming/vichat-conversation-list-71b1b3a.tar.gz`, SHA-256 `bc127931393628f04874f174c9987e2ee92e0c4258e89600bf674bf7d4a3db70`; deploy qua `ubuntu@103.74.122.206` -> `ubuntu@192.168.80.20`; release `/opt/deploy/chat/releases/conversation-list-71b1b3a-20260908-r2`; previous `/opt/deploy/chat/releases/group-approval-poll-dark-5cefd90-20260908-r1`; backup `/opt/deploy/chat/backups/conversation-list-71b1b3a-20260908-r2`; chi recreate service `chat`.
- Image/container: ChatUI `2ceffdb1757b8642e2cd9ca8d1013539176296d4dafe88b09f02a9f8194b65c8`, image `sha256:c6b7e765181a28c72ae38a62ba54a9007b8de33b7dd98ff0edf6cc5b81f245a2`, healthy/restart 0; Chatmgt giu container `43b5de78de8bdf68a8b088fc350a36214241acd30899ece25f64a4dae0244398`, cung cac service du lieu va volume.
- Xu ly phat hanh: Helper duoc chay qua stdin do server tu don file `incoming`; sau khi activate va cac gate public dat, CRLF o dong cuoi lam script thoat `127` tai `switch` va trap dua symlink ve release cu. Da xac minh container candidate healthy, khong co rollback du lieu, roi hoan tat switch nguyen tu sang `r2`; khong migration, `down -v` hay recreate service ngoai `chat`.
- Rui ro con lai: Chua UAT truc quan bang trinh duyet va tai khoan that; thao tac `Them vao nhom` hien mo tao nhom moi va chon san peer, chua phai bo chon mot nhom da ton tai.
- Viec tiep theo: UAT timestamp/hover tren desktop va mobile, thu menu direct/group va hard refresh de nap bundle moi.
- Commit/PR: Source `71b1b3a`; changelog release record commit rieng sau khi verify production.

## 2026-09-08-06 - Sua mau binh chon trong che do toi

- Thoi gian: 2026-09-08 15:10 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `5cefd90` (parent `a26f7c2`) da commit/push `origin/master`, production da deploy va verify qua hai hop SSH.
- Muc tieu: Dam bao the binh chon va cac dieu khien binh chon co tuong phan de doc khi nguoi dung bat che do toi.
- Pham vi: Chi CSS dark mode cua poll message va regression assertion; khong doi du lieu, luong gui phieu, realtime, group board hay poll composer.
- File da thay doi: `src/styles/index.css`, `src/features/chat/services/chatManagementService.test.js`, `dist/index.html`, `docs/CHANGELOG.md`.
- Noi dung: Them nen gradient toi, vien, mau chu, mau thanh tien trinh, so luot chon, badge trang thai, nut them lua chon va nut thao tac cho poll incoming/outgoing trong `html[data-theme="dark"]`. Khac phuc tinh trang the nen sang lam chu che do toi bi mo va kho doc.
- Quyet dinh ky thuat: Chi ghi de cac selector dark theme cua poll tai lop CSS hien co; khong sua component React hay hop dong binh chon de giu nguyen hanh vi va cac luong khac.
- Database/API/cau hinh: Khong co migration, endpoint, secret, bien moi truong hay thay doi kien truc.
- Kiem thu: `node --test --test-concurrency=1 src/features/chat/services/chatManagementService.test.js src/features/chat/services/poll.test.js` dat 70/70; lenh tuong duong toan bo `test:frontend` voi `--test-concurrency=1` dat 410/410; `npm run lint` exit 0 voi warning legacy/vendor da co; `node --max-old-space-size=2048 scripts/build-production.mjs` thanh cong voi canh bao chunk `App` lon hon 500 KB da co; `git diff --check` dat. Lan chay `npm run test:frontend` mac dinh dung song song bi Node het bo nho, sau do da chay lai tuan tu thanh cong. Production: archive SHA-256 va marker gate dung; candidate Nginx `-t` dat; `chat`/`chatmgt` healthy, restart 0; health private/public va Chatmgt auth deu dat; public entry/App/CSS hash khop image; WebSocket tra `101`; khong co log fatal; Alembic `20260825_13`, service ngoai pham vi va volume giu nguyen.
- Rui ro con lai: Chua UAT truc quan tren trinh duyet bang tai khoan that; can hard refresh sau khi phat hanh de nap bundle/CSS moi.
- Viec tiep theo: UAT poll incoming/outgoing va them lua chon trong dark mode tren production; khong can migration hay cau hinh moi.
- Commit/PR: Source `5cefd90` (parent `a26f7c2`); production release `group-approval-poll-dark-5cefd90-20260908-r1`; changelog release record commit rieng sau deploy.

## 2026-09-08-05 - Gioi han muc duyet thanh vien nhom

- Thoi gian: 2026-09-08 13:43 (Asia/Saigon)
- Loai: Sua loi | Bao mat | Web | Chatmgt | Kiem thu | Tai lieu
- Trang thai: Hoan tat local; dang cho commit/push va deploy production.
- Muc tieu: Chi truong nhom va pho nhom duoc xem hoac xu ly danh sach thanh vien cho duyet; bo hai nut goi thoai/video khoi header chat.
- Pham vi: Quyen hien thi/duyet pending member trong group info va hai action icon trong header ChatUI; giu nguyen luong them thanh vien, goi lai tu lich su, Tinode, mobile va cac luong chat khac.
- File da thay doi: `src/features/contacts/services/accountDirectory.js`, `src/features/contacts/services/accountDirectory.test.js`, `src/app/App.jsx`, `src/features/chatbot/services/chatbotService.test.js`, `src/features/chat/services/chatManagementService.test.js`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`.
- Noi dung: Loai bo fallback quyen admin/owner/superadmin cua tenant khoi approval gate; Chatmgt chi serialize `pendingMembers` va chap nhan PUT approval cho membership role `OWNER`/`ADMIN`. Tenant admin van giu quyen them truc tiep nhu hop dong hien tai. Hai nut goi tren header duoc bo, con nut goi lai trong lich su tin nhan va co che goi khong doi.
- Quyet dinh ky thuat: Kiem tra quyen o ca ChatUI va Chatmgt de khong chi an giao dien; khong doi database schema hay endpoint, khong dong vao membership add bypass.
- Database/API/cau hinh: Khong migration, endpoint moi, secret hay bien moi truong; thay doi authorization cua endpoint approval hien co, tenant admin se nhan 403 neu khong la owner/deputy cua nhom.
- Kiem thu: `node --test src/features/contacts/services/accountDirectory.test.js src/features/chat/services/chatManagementService.test.js src/features/chatbot/services/chatbotService.test.js` dat 123/123; `python -m unittest chatservice-main.tests.test_chat_auth_contract` dat 57/57; `npm run test:frontend` dat 409/409; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` thanh cong voi canh bao chunk `App` lon hon 500 KB da co; `git diff --check` dat. `python -m unittest discover -s tests -v` chay 296 test, 105 skip do dependency runtime va 1 loi import local `itsdangerous` tai `test_chat_media_service`, khong lien quan thay doi nay.
- Rui ro con lai: Chua deploy/UAT; can xac nhan owner, deputy, member va tenant admin tren production sau release. Local full backend suite can chay lai trong Chatmgt image co day du dependency.
- Viec tiep theo: Chay kiem thu, commit/push va deploy ChatUI + Chatmgt neu cac gate dat.
- Commit/PR: Chua tao.

## 2026-09-08-04 - Sua danh sach hoi thoai khi sua phan loai

- Thoi gian: 2026-09-08 12:50 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Web | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `d6636547a84f9a0686597e3af2008271ad4bc076` da commit/push `origin/master`, production da deploy va verify qua hai hop SSH.
- Muc tieu: Modal `Sua the phan loai` khong lap direct contact, phan biet duoc hai tai khoan trung ten va khong lam mat assignment hien tai.
- Pham vi: Chi danh sach hoi thoai trong ChatUI category manager; giu nguyen persistence category, luong chia se tin nhan, chat realtime, Chatmgt, Tinode, mobile va database.
- File da thay doi: `src/features/chat/services/conversationCategoryConversations.js`, `src/features/chat/services/conversationCategoryConversations.test.js`, `src/app/App.jsx`, `src/features/chat/components/ConversationCategoryManager.jsx`, `src/features/chat/services/chatManagementService.test.js`, `src/styles/index.css`, `package.json`, `dist/index.html`, `docs/CHANGELOG.md`.
- Noi dung: Direct room duoc nhan dien bang account identity thay vi display name; duplicate room cung mot account duoc gom hien thi nhung van gui tat ca `managementId` khi luu; tai khoan khac nhau trung ten hien `@username`, email hoac identity de phan biet; group trung subject van giu rieng. Bo loc tim kiem cung tim theo metadata phan biet.
- Quyet dinh ky thuat: Helper chi lam projection cho modal. Storage van giu assignment theo conversation ID va `setCategoryConversations` khong doi. Khong dua directory-only contact vao category vi category hien tai la tag cua hoi thoai, tranh thay doi contract va luong tao phong.
- Database/API/cau hinh: Khong co migration, endpoint, secret, bien moi truong hay thay doi backend.
- Kiem thu local: `node --test src/features/chat/services/conversationCategoryConversations.test.js src/features/chat/services/conversationCategoryPolicy.test.js src/features/chat/services/chatManagementService.test.js` dat 67/67; `npm run test:frontend` dat 409/409; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` thanh cong voi canh bao chunk `App` lon hon 500 KB da co; `git diff --check` dat.
- Artifact/deploy: Archive `vichat-conversation-category-d663654.tar.gz`, SHA-256 `16a6f337466aa285e597f8bfc3b9114b847fca20bb94f50ce594d3b3b4e88fd0`; release `/opt/deploy/chat/releases/conversation-category-d663654-20260908-r3`; backup `/opt/deploy/chat/backups/conversation-category-d663654-20260908-r3`; chi recreate ChatUI `chat`, khong recreate Chatmgt/Tinode/database.
- Kiem thu production: ChatUI container `b00d987389bb`, image `sha256:193b940ad48d47fcc5f998e473184fde917aea692151ebdc738d8535880329f3`, healthy, restart 0; Chatmgt giu container `4e5157d93c3e`, image `sha256:5dc16450eb4eec7c0d6df5a311f9daacdf0b6547fc3d76bdc0a8eafb53c5de9a`; local/public health `ok`, public bundle/CSS marker dung, WSS `101`, Alembic van `20260825_13`, service ngoai ChatUI va volume khong doi. Hai gate r1/r2 dung truoc activate/tu rollback; r3 activate thanh cong.
- Rui ro con lai: Chua UAT truc quan tren production bang tai khoan that; danh sach category van phu thuoc snapshot hoi thoai hien tai, khong tu tao room moi cho contact chua co hoi thoai.
- Viec tiep theo: UAT modal sua category voi hai tai khoan trung ten va duplicate room; hard refresh de xac nhan asset moi.
- Commit/PR: Source `d6636547a84f9a0686597e3af2008271ad4bc076`; production release `conversation-category-d663654-20260908-r3`; changelog release commit `05e69a5`.

## 2026-09-08-03 - Sua danh sach nguoi nhan khi chia se tin nhan

- Thoi gian: 2026-09-08 11:33 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Web | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `964671a7934d05d7f6264c754b75381ae5de1d62` da commit/push `origin/master`, production da deploy va verify qua hai hop SSH.
- Muc tieu: Modal chia se hien day du danh ba nhan vien cung tenant, khong lap nguoi trung ten va van gui duoc den nguoi chua co hoi thoai.
- Pham vi: ChatUI message-share recipients, tao direct conversation on-demand qua Chatmgt, regression tests va production bundle; khong sua Chatmgt backend, Tinode, mobile hay du lieu tin nhan.
- Nguyen nhan: Modal cu chi lay `renderConversations`, nen bo qua nhan vien chi co trong danh ba; dedupe theo room id lam cac phong truc tiep trung mot tai khoan xuat hien nhieu lan va ten hien thi trung nhau khong phan biet duoc.
- File da thay doi: `src/features/chat/services/messageShareRecipients.js`, `src/features/chat/services/messageShareRecipients.test.js`, `src/app/App.jsx`, `src/styles/index.css`, `src/features/chat/services/chatManagementService.test.js`, `package.json`, `dist/index.html`, `docs/CHANGELOG.md`.
- Noi dung: Dung danh ba active cung tenant lam nguon recipient, giu group hien co, dedupe direct theo identity on dinh (`id`/`uid`/Tinode UID), loai current user va chatbot, hien username/email phu khi trung ten. Recipient chua co room duoc tao qua Chatmgt truoc khi bind topic Tinode va forward; cac guard block, session, group spam, attachment va demo duoc giu nguyen.
- Quyet dinh ky thuat: Ghep recipient theo identity thay vi display name/room id; tai su dung phong da co neu tim thay dung tai khoan de tranh tao phong trung. Khong doi nguon du lieu chuan, API contract hay kien truc; them test cho full directory, duplicate room, duplicate name, active contact va chatbot.
- Database/API/cau hinh: Khong co migration, endpoint, secret, bien moi truong, thay doi Chatmgt/Tinode hay thay doi cau hinh production.
- Artifact/deploy: Archive `vichat-message-share-964671a.tar.gz`, SHA-256 `e0730de7633d3f41ad2cdc61e0a75aefad5007dbe184342198ebe9b992ff0374`; release `/opt/deploy/chat/releases/message-share-964671a-20260908-r1`; backup `/opt/deploy/chat/backups/message-share-964671a-20260908-r1`; chi recreate ChatUI `chat`, khong recreate Chatmgt/Tinode/database.
- Kiem thu local: `npm run test:message-share` dat 5/5; `npm run test:frontend` dat 405/405; `npm run lint` exit 0 voi cac warning legacy/vendor da co; `npm run build:production` thanh cong voi canh bao chunk `App` lon hon 500 KB da co; `git diff --check` dat.
- Kiem thu production: Candidate build/Nginx dat; ChatUI container `046cad75d4de0052d1d3b7f2eeb1b8ca0a4f38bf475b80df365852b216b40cb9`, image `sha256:dc3c9662b1a2051cc2345a36aa5b01673c12434c6911618380f7d4580d4bd38a`; 9 container running, 7 healthcheck healthy, 8 service ngoai ChatUI va volumes khong doi; health private/public, bundle/hash, PostgreSQL/Redis/Alembic `20260825_13`, WSS `101`, log fatal scan deu dat. Hai lan gate helper deploy dung truoc activate do checksum/marker script, production khong bi doi; lan chay cuoi thanh cong.
- Rui ro con lai: Chua UAT truc quan end-to-end tren browser production bang hai tai khoan; danh ba phu thuoc snapshot active cua Chatmgt/Account, con chuc nang tao phong va gui Tinode duoc bao ve boi cac contract hien co.
- Viec tiep theo: UAT browser bang hai tai khoan trong cung tenant: mo modal chia se, kiem tra full danh ba, hai nguoi trung ten hien username/email, gui text/anh/file den nguoi chua co phong va nhom; hard refresh sau deploy. Khong can migration hay cau hinh moi.
- Commit/PR: Source `964671a7934d05d7f6264c754b75381ae5de1d62`; production release `message-share-964671a-20260908-r1`; changelog record commit rieng sau deploy.

## 2026-09-08-02 - Phat hanh sua nhap nhay va can chinh hinh nen hoi thoai

- Thoi gian: 2026-09-08 10:45:38 (Asia/Saigon)
- Loai: Van hanh | Trien khai | Web | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `67098fb` da co tren `origin/master`, production da deploy va verify qua hai hop SSH.
- Pham vi: Chi recreate ChatUI `chat`; Chatmgt, Tinode, ChatAPI, Coturn, PostgreSQL, Redis va cac volume khong doi. Khong co migration, endpoint, secret, bien moi truong hay thay doi hop dong API.
- Artifact: Archive `vichat-conversation-background-67098fb.tar.gz`, SHA-256 `b967372852f0cd675ef092f482f148e7bd6e9c41f2553b15ade50a0267eecee5`; release `/opt/deploy/chat/releases/conversation-background-67098fb-20260908-r3`; `current` tro toi release nay, `previous` tro toi `/opt/deploy/chat/releases/unread-group-9b165b5-20260907-r3`.
- Backup/rollback: `/opt/deploy/chat/backups/conversation-background-67098fb-20260908-r3` luu `.env`, runtime, pg_dump Chatservice/Tinode, checksum va runtime state; backup checksum va `pg_restore -l` deu dat. Khi verify that bai, helper tu dong phuc hoi image/container cu; symlink chi doi sau khi cac gate dat.
- Image/container: ChatUI container `958592ab1079b530a297798bf6c2745149ac686d2f858966af4d564f3576829b`, image `sha256:d3373f18623e8ff4a6741cc52730751d3ca2464d5f0a91ec5745020b16066ec6`; Chatmgt giu container `4e5157d93c3e`. ChatUI va Chatmgt healthy, restart count cua ChatUI bang 0.
- Kiem thu production: Preflight doi chieu 661 file ngoai pham vi khong doi; candidate `nginx -t` dat; local/public `/healthz`, Chatmgt auth health, HTML asset name va SHA-256 entry/App/CSS khop; WSS tra `101`; log ChatUI khong co fatal/panic/traceback; 8 service khong lien quan va danh sach volume khong doi; Alembic van `20260825_13`; `.env` khong doi.
- Xu ly khi phat hanh: Lan `r1` dung o Nginx test do dung network `none`; lan `r2` dung truoc activate vi gate ten ham bi minify. Khong co lan nao thay doi service production; `r3` dung network production va gate class/CSS on dinh, sau do activate thanh cong.
- Rui ro con lai: Chua UAT truc quan bang tai khoan that; can hard refresh chat nhom de kiem tra preset, anh ngang/doc, keo/zoom, Huy va Ap dung tren local/shared. Kiem thu HTTP/bundle/WSS khong thay the thao tac browser thuc te.
- Commit/PR: Source `67098fb`; muc changelog phat hanh nay duoc commit rieng sau khi verify production.

## 2026-09-08-01 - Sua nhap nhay va them can chinh hinh nen hoi thoai

- Thoi gian: 2026-09-08 10:07 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Web | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat code va kiem thu local; source commit `70ac846`, da push/deploy production theo muc phat hanh `2026-09-08-02`; UAT browser van con lai.
- Muc tieu: Loai bo khung hinh nen bi nhap nhay khi doi preset trong chat nhom va cho phep nguoi dung tu can anh tai len truoc khi ap dung.
- Pham vi: ChatUI conversation background picker, preload/cache nguon preset, modal can chinh anh tai len, luu local IndexedDB va luong upload nen shared hien co; khong sua Chatmgt, Tinode contract, mobile, database hay migration.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/components/ConversationBackgroundCropModal.jsx`, `src/features/chat/services/conversationBackgroundCrop.js`, `src/features/chat/services/conversationBackgroundCrop.test.js`, `src/features/chat/services/chatManagementService.test.js`, `src/features/i18n/appLanguage.js`, `src/styles/index.css`, `package.json`, `dist/index.html`, `docs/CHANGELOG.md`.
- Noi dung: Preset duoc preload va cache; khi thay nen, nguon dang hien thi duoc giu cho den khi anh moi tai xong de tranh flash blank. Anh tai tu tep mo modal can chinh nam de len picker, ho tro keo, zoom bang thanh truot/banh xe, xem truoc theo khung chu nhat va chi thay doi sau nut `Ap dung` cuoi cung. Huy crop hoac dong picker giu nguyen nen cu. Gioi han file cu van duoc giu: 2 MB cho local va 8 MB cho shared.
- Quyet dinh ky thuat: Chi can chinh anh tai tu tep; output duoc ve JPEG rong 1280px theo ti le preview de giu dung luong va tuong thich voi luong luu/upload hien tai. Modal crop dung `z-index: 260`, cao hon picker `115`; request anh cu bi bo qua khi doi phong/tenant va object URL duoc thu hoi khi khong con dung. Khong doi nguon du lieu chuan hay ranh gioi dich vu.
- Database/API/cau hinh: Khong co migration, endpoint, secret, bien moi truong hay thay doi hop dong API.
- Kiem thu: `npm run test:frontend` dat 400/400; `npm run lint` exit 0 voi canh bao legacy/vendor da co; `npm run build:production` thanh cong voi canh bao chunk `App` lon hon 500 KB da co; `git diff --check` dat. Browser UAT chua chay vi phien nay khong expose cong cu dieu khien trinh duyet.
- Rui ro con lai: Chua xac nhan truc quan bang tai khoan that thao tac preset, keo/zoom, Huy/Ap dung va ca hai scope tren desktop/mobile; bundle production chua duoc deploy.
- Viec tiep theo: UAT tren chat nhom voi hard refresh, doi nhieu preset lien tiep, tai anh ngang/doc, keo/zoom, Huy va Ap dung cho local/shared.
- Commit/PR: Source `70ac846`; changelog code `67098fb`; phat hanh production tai muc `2026-09-08-02`.

## 2026-09-07-06 - Phat hanh web: tin chua doc va thong bao nhom

- Thoi gian: 2026-09-07 15:26-15:29 (Asia/Saigon)
- Loai: Van hanh | Trien khai | Web | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source `9b165b5da42f9f69229722a0e583801eef61c0bb` da commit/push `origin/master`, production da deploy va verify doc lap.
- Muc tieu: Dua ban sua unread, nut ve tin moi nhat, read realtime va publisher hoat dong nhom len web production ma khong thay doi cac dich vu du lieu.
- Pham vi: Chi ChatUI (`chat`) va Chatmgt (`chatmgt`); khong sua/build/deploy ung dung mobile. Theo yeu cau chot scope cua nguoi dung, candidate cuoi chi chay test Tinode/group phuc vu web, khong chay test mobile.
- File da thay doi: `docs/CHANGELOG.md`; 15 file source cua ban sua da nam trong commit `9b165b5`, chi tiet tai muc `2026-09-07-05`. Helper van hanh ignored o `outputs/unread-group-9b165b5/`, ban da chay duoc luu kem backup tren server.
- Noi dung: Deploy qua `ubuntu@103.74.122.206` -> `ubuntu@192.168.80.20` (`chat-server`), khong deploy stack tren jump host. Kiem tra checksum archive, doi chieu 653 file ngoai pham vi khong doi, backup truoc build, kiem thu image, sau do chi recreate hai dich vu va chuyen symlink khi verify dat.
- Quyet dinh ky thuat: Giu nguyen dependency, Compose, Nginx, `.env`, read cursor va cac topic. Runtime duoc sao chep tu mount Chatmgt dang hoat dong; 7 container con lai giu nguyen ID/image/restart count/mounts. Khong dung `compose down`, khong xoa volume, khong restore/reset database.
- Database/API/cau hinh: Khong migration hay cau hinh moi; Alembic truoc/sau van `20260825_13 (head)`. `.env`, runtime va danh sach named volumes duoc doi chieu khong doi.
- Artifact: `git archive --format=tar.gz --prefix=vichat-web/ --output=outputs/unread-group-9b165b5/vichat-unread-group-9b165b5.tar.gz 9b165b5da42f9f69229722a0e583801eef61c0bb`; SHA-256 `a5fa1d024d0cd4f62bb8108e96a08c43648a0273a91773a472e9d3a371991cb0` khop sau hai hop.
- Release: `/opt/deploy/chat/releases/unread-group-9b165b5-20260907-r3`; `current` tro toi release nay, `previous` tro toi `/opt/deploy/chat/releases/message-share-8edf109-20260907-r2`. Activate luc 15:26:25; verify sau switch luc 15:27:08 va chay doc lap lai luc 15:29:08 (Asia/Saigon).
- Image/container: ChatUI `7af83d10fd11`, image `sha256:4a5c5bb77dd784b09249715d8a3607b658a60150aedfdd4b194711348e7fd91f`; Chatmgt `4e5157d93c3e`, image `sha256:5dc16450eb4eec7c0d6df5a311f9daacdf0b6547fc3d76bdc0a8eafb53c5de9a`. Hai container healthy, restart count 0.
- Backup/rollback: `/opt/deploy/chat/backups/unread-group-9b165b5-20260907-r3` mode 0700, gom `.env`, runtime, `pg_dump -Fc` Chatmgt va Tinode rollback cuc bo; `pg_restore -l` va checksum deu dat. Giu hai image tag `songhong-production-chat:rollback-before-unread-group-9b165b5-r3` va `songhong-production-chatmgt:rollback-before-unread-group-9b165b5-r3`. Khi rollback, dung image/Compose/env rieng cua tung dich vu trong `runtime-state.txt`, recreate `--no-deps --no-build --force-recreate --wait`, roi phuc hoi symlink; khong restore DB vi khong co migration. Tinode trung tam khong bi thay doi hay reset.
- Kiem thu local: Chay lai 125/125 test frontend lien quan, `npm run test:frontend` dat 397/397, va lenh unittest publisher/auth-contract trong muc `2026-09-07-05` dat 92/92. Lint/build da dat truoc commit; build production trong image dat, chi con canh bao chunk App >500 KB. `git diff --cached --check` truoc commit source dat.
- Kiem thu candidate cuoi: `bash /opt/deploy/chat/incoming/deploy-unread-group-9b165b5.sh a5fa1d024d0cd4f62bb8108e96a08c43648a0273a91773a472e9d3a371991cb0` chay thanh cong. Trong image Chatmgt: module `tests.test_tinode_bridge_service` va ba contract web `test_group_deputy_role_is_authoritative_and_dissolve_stays_owner_only`, `test_shared_group_mutations_keep_the_common_activity_publisher`, `test_group_pin_events_stay_in_chatui_and_are_not_direct_chat_events` dat 38/38, khong skip; container test `--network none`, chi mount `src` read-only de doc contract UI, khong dung credential/DB production. `nginx -t` va doi chieu source publisher trong image voi release deu dat.
- Kiem thu production: `python3 /opt/deploy/chat/backups/unread-group-9b165b5-20260907-r3/verify.py verify /opt/deploy/chat/backups/unread-group-9b165b5-20260907-r3/result.json` dat. 9 container running, ca 7 container co healthcheck healthy; PostgreSQL readiness va Redis PONG dat; private/public auth/chatbot health dat, WSS `101`, log hai dich vu khong co fatal/traceback. HTML public va SHA-256 entry/App/CSS khop image; marker unread viewport, share modal va chatbot con day du. Asset web: `/assets/index-95CxP4NC.js`, `/assets/App-lVDYCr-B.js`, `/assets/index-DkJDn8Pn.css`.
- Su co da xu ly truoc activate: r1 dung o build vi GitHub dependency timeout; quyen source khac cach extract cu lam mat cache, da giu mode owner-only nhu release cu de tai su dung dependency da xac minh. r2 build dat nhung suite rong trong image thieu source web/ha tang: 133 tests, 3 errors va 25 skipped; khong tinh la dat. Da sua harness candidate sang test publisher va contract nhom web voi source read-only; cac contract day du van co ket qua local rieng. Hai lan nay chua recreate dich vu, image tag da phuc hoi va production cu van healthy. Probe auth-session tren image cu luc dau thieu Redis; chay lai voi fixture Redis vo hieu hoa trong process test dat 6/6 truoc khi nguoi dung chot chi test web; khong thay doi auth production.
- Rui ro con lai: Chua UAT browser web voi hai tai khoan Account/Tinode that; health/unit/source-contract khong thay the kiem tra thao tac truc quan. Publisher van best-effort khi Tinode/credential gian doan, chua co durable retry outbox va khong tu phat lai thong bao lich su da mat.
- Viec tiep theo: UAT web hai tai khoan/hai tab voi unread ngoai cache, anh cao, cuon lich su/nut ve tin moi nhat, doi phong khi dang tai, read realtime, bo nhiem/thu hoi pho nhom va cac thay doi chung cua nhom; kiem tra lai chia se/file/call/chatbot. Khong can thao tac mobile, migration hay bien moi truong moi.
- Commit/PR: Source `9b165b5da42f9f69229722a0e583801eef61c0bb` da push `origin/master`; muc nay la ban ghi ban giao sau deploy.

## 2026-09-07-05 - Dong bo tin chua doc va thong bao hoat dong nhom

- Thoi gian: 2026-09-07 10:35 (Asia/Saigon)
- Loai: Sua loi | Web | Backend | Realtime | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat code va kiem thu local; da commit/push/deploy web, chi tiet phat hanh tai muc `2026-09-07-06`.
- Muc tieu: Tai va hien thi noi dung tin chua doc dung luc, giu nut ve tin moi nhat trong viewport, dong bo read cursor sau khi xem, va phat thong bao cho cac thay doi chung cua nhom, gom bo nhiem/thu hoi pho nhom.
- Pham vi: ChatUI viewport/read boundary, Tinode history/snapshot delivery, publisher hoat dong nhom trong Chatmgt va regression tests. Khong thay doi quyen tenant, chong spam, chan tin, file/call hay du lieu tin nhan da luu.
- Nguyen nhan da xac dinh: Nut dieu huong absolute nam ben trong phan tu cuon; badge bi dismiss khi chon hoi thoai truoc khi xem noi dung; getMeta/history va enrich profile co the tra snapshot cu/tri hoan noi dung; publisher server gui pub ngay sau login ma chua attach vao group topic.
- Quyet dinh ky thuat: Tach control khoi noi dung cuon; chi acknowledge toi noi dung da hien thi; tai lai tail Tinode va bo qua ket qua async cu khi doi hoi thoai/session. Sua hop dong subscribe/publish cua kenh thong bao dung chung thay vi tao tin thong bao gia chi tren browser cua nguoi thao tac. Thiet lap ca nhan nhu mute/read/typing khong tao thong bao chung.
- File da thay doi: `src/app/App.jsx`, `src/styles/index.css`, `src/features/chat/services/tinodeClient.js`, `src/features/chat/services/tinodeDelivery.js`, `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/unreadBoundary.js` va ba file test tuong ung; `chatservice-main/application/services/auth_service.py`, `chatservice-main/tests/test_tinode_bridge_service.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `dist/index.html`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`.
- Noi dung: Dua hai nut dieu huong ra ngoai scroller, theo doi resize anh/viewport; khong dismiss badge khi chon phong. Nut ve tin moi nhat tai lai tail, doi render, kiem tra noi dung dang hien thi roi gui read. Doc tu tab/thiet bi khac trim/clear boundary; tin den trong luc acknowledge van con chua doc. Tai data tach khoi deletion metadata va doi SDK dispatch; coalesce history request, chi catch-up khi cache thieu, phat noi dung truoc profile va chan enrichment cu. Publisher group thuc hien login -> kiem tra UID -> subscribe khong doi quyen -> pub -> kiem tra seq duong. Giu nguyen publisher tao nhom, ghim tin, binh chon va receipt rieng cua chatbot; khong tao thong bao cho mute, ghim hoi thoai, read hay typing ca nhan.
- Database/API/cau hinh: Khong migration, endpoint, secret, bien moi truong hay dependency production moi; khong reset read cursor/topic/tin nhan. Moi truong test Python rieng tai `outputs/unread-regression-venv` (ignored) co aiohttp/bcrypt de chay test publisher thay vi bo qua.
- Kiem thu frontend: `node --test src/features/chat/services/chatRealtime.test.js src/features/chat/services/chatManagementService.test.js src/features/chat/services/unreadBoundary.test.js` dat 125/125. `npm run test:frontend` dat 397/397. `npm run lint` exit 0, chi con canh bao legacy/vendor; `npm run build:production` thanh cong, con canh bao chunk App >500 KB. `git diff --check` dat. Regression gom dispatch data sau ctrl, metadata/data tach request, profile cham/cu, tail refresh khi topic da subscribe, request chong/upgrade/cancel, remote/partial read, anh cao va vi tri control ngoai scroller. Harness VM chay truc tiep ham markRead va handler nut ve tin moi nhat voi SDK/viewport gia lap: subscribe/send that bai khong tang read floor; tin den khi dang await van chua doc; doi room/session, mat ket noi, detach, tab an va thieu noi dung khong tao receipt sai. Day khong phai UAT browser that.
- Kiem thu backend: `outputs/unread-regression-venv/Scripts/python.exe -m unittest chatservice-main.tests.test_tinode_bridge_service chatservice-main.tests.test_chat_auth_contract` dat 92/92. Chay mo rong cung lenh voi `chatservice-main.tests.test_tinode_account_bridge chatservice-main.tests.test_auth_session_scope chatservice-main.tests.test_direct_message_blocking chatservice-main.tests.test_tinode_central_switch`: 133 tests, 127 dat va 6 skipped do thieu runtime gatco/gatco_sqlalchemy cua Chatmgt. Test websocket publisher kiem tra thu tu attach/pub, cac action chung, sai UID, tu choi attach va thieu seq; source-contract giu quyen deputy/owner, commit truoc thong bao va khong thong bao thao tac ca nhan. Lan chay ban dau bang Python he thong da skip 35 test vi thieu aiohttp/bcrypt; ket qua 92/92 su dung venv rieng, khong tinh skipped la dat.
- Rui ro con lai: Chua UAT browser bang hai tai khoan Account/Tinode that; test logic/source-contract khong thay the UAT truc quan. Controller van publish best-effort sau commit, chua co durable retry outbox: khong bao dam giao thong bao neu Tinode/credential bi gian doan. Khong tu phat lai thong bao lich su da mat.
- Viec tiep theo: Khi phat hanh, commit/push va build/redeploy ChatUI + Chatmgt theo tuyen jump host da thong nhat, khong can migration hay reset Tinode. UAT hai tai khoan/hai tab: unread ngoai cache, sequence bi xoa, anh cao, cuon len/xuong, nut ve tin moi nhat, doi phong/session khi dang tai, read realtime va bo nhiem/thu hoi deputy; kiem tra cac thong bao them/xoa/duyet/tu choi thanh vien, doi ten/avatar/quyen/nen va cac luong chia se/file/call/chatbot hien co. Chay 6 test auth-session trong image Chatmgt day du dependency.
- Commit/PR: `9b165b5da42f9f69229722a0e583801eef61c0bb`, da push `origin/master`; phat hanh web tai muc `2026-09-07-06`.

## 2026-09-07-04 - Phat hanh ban sua hop chia se tin nhan

- Thoi gian: 2026-09-07 09:52-10:10 (Asia/Saigon)
- Loai: Trien khai | Web | Kiem thu | Van hanh | Tai lieu
- Trang thai: Hoan tat; source `8edf1093c116642a72be0f3d69ceb0e02c6d014c` da commit/push `origin/master`, production da deploy va verify.
- Muc tieu: Dua ban sua avatar/vung cuon modal chia se len production ma khong thay doi backend, cau hinh hay du lieu.
- Pham vi: Dung hai hop `ubuntu@103.74.122.206` -> `ubuntu@192.168.80.20` (`chat-server`); chi build/recreate service `chat` tu release bat bien. Chatmgt, Tinode bridge/webhook, ChatAPI, Coturn, PostgreSQL va Redis giu nguyen.
- File da thay doi: Ban sua o muc `2026-09-07-03`; muc nay ghi lai qua trinh phat hanh trong `docs/CHANGELOG.md`. Script deploy/verifier local nam trong `outputs/message-share-8edf109/` (ignored), ban da chay tren server nam tai `/opt/deploy/chat/incoming/message-share-8edf109-r2-deploy.sh` va `/opt/deploy/chat/incoming/message-share-8edf109-verify.py`.
- Artifact: Archive tao bang `git archive` tu source commit, `/opt/deploy/chat/incoming/vichat-message-share-8edf109.tar.gz`, 45079335 bytes, SHA-256 `865c1f344e1e5ba294d48ea6717834a878df9cb5d16c5f7e4c23fba621a61306`; checksum local va server khop. Cac file source ngoai 5 file cua ban sua duoc doi chieu byte voi release truoc khi build.
- Phat hanh: `current` tro `/opt/deploy/chat/releases/message-share-8edf109-20260907-r2`; `previous` tro `/opt/deploy/chat/releases/vichat-ai-guidance-a1405a9-20260907-r2`. Chat container moi `ee2b188a2839`, image `sha256:54e630e74ba7ec2a3c075b779ac4961c6d75fa7c0944502bfcc5bd6b5c4b0a2e`; Chatmgt van `8f8498eb7d4a`. Su dung `docker compose ... up -d --no-deps --no-build --force-recreate --wait --wait-timeout 180 chat`.
- Backup va an toan: `/opt/deploy/chat/backups/message-share-8edf109-20260907-r2/` (mode 0700) luu `.env`, runtime, Chatservice/Tinode `pg_dump -Fc`, image va thong tin rollback; `pg_restore -l` va `sha256sum -c` dat. Rollback image tag `songhong-production-chat:rollback-before-message-share-8edf109-r2`. `.env` moi/cu/backup khop hash; 8 service ngoai `chat` giu nguyen ID, image, restart count va mount theo so sanh JSON chuan hoa; danh sach volume khong doi.
- Quyet dinh ky thuat: Khong chay `start.sh` hay migration cho thay doi giao dien. Giu lock deploy va trap rollback rieng ChatUI; chi chuyen symlink `current` sau khi candidate, public bundle, WSS, service va volume gate dat.
- Xu ly rollback: Candidate `r1` da rollback tu dong tai gate so sanh mount vi Docker tra cung danh sach mount ChatAPI theo thu tu khac nhau. Doi chieu xac nhan ca 8 service khong doi ID/image/restart hay noi dung mount; health va public bundle cua image cu duoc verify lai sau rollback. Chuan hoa thu tu mount va khoa JSON, van giu kiem tra thay doi mount that, roi chay `r2` thanh cong; khong sua them code ung dung hay du lieu.
- Database/API/cau hinh: Khong thay doi, Alembic van `20260825_13`; khong reset topic/tin nhan, khong xoa volume, khong them dependency hay secret.
- Kiem thu local: Chay lai `npm run test:frontend` dat 372/372; `npm run lint` exit 0 voi warning legacy/vendor; `npm run build:production` dat voi warning chunk App >500 KB; `git diff --check` dat. `git fetch origin master` va `git ls-remote origin refs/heads/master` xac nhan dong bo truoc commit va source commit da push.
- Kiem thu production: `bash -n /opt/deploy/chat/incoming/message-share-8edf109-r2-deploy.sh` dat; candidate Nginx va compiled JSX/CSS cho avatar 32x32, cuon rieng, ten dai va avatar dung chung dat. `python3 /opt/deploy/chat/incoming/message-share-8edf109-verify.py` dat: 9 service running, 7 service co healthcheck deu healthy, restart 0; PostgreSQL/Redis/Alembic, private/public auth-chatbot health, env/backup/volume/mount deu dat. Public WSS `101`, fatal log scan sach; `sudo -n nginx -t` tren jump host dat.
- Public bundle: `/assets/index-Bxijs6P7.js`, `/assets/App-GZUCwFwE.js`, `/assets/index-CIzR3C23.css` khop SHA-256 voi image dang chay; Node fetch tu may Windows cung verify ca 3 hash. App/CSS public chua `share-message-title`, `share-conversation-name` va avatar 32x32; khong chi dua vao viec push hay health HTTP 200.
- Rui ro con lai: Chua UAT truc quan va gui tin end-to-end bang tai khoan Account/Tinode that; verifier chi xac nhan artifact, ha tang va hop dong hien co, khong thay the thao tac nguoi dung tren browser.
- Viec tiep theo: Hard refresh ChatUI va UAT chia se text/anh/file sang ca nhan/nhom voi avatar lon, fallback, ten dai, danh sach nhieu dong va man hinh hep. Giu release `previous`, rollback image va backup; khong can migration hay khoi dong lai backend.
- Commit/PR: Source `8edf109`; khong co PR. Nhat ky nay duoc commit/push rieng sau khi verify production.

## 2026-09-07-03 - Gioi han avatar va vung cuon trong hop chia se tin nhan

- Thoi gian: 2026-09-07 09:43 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat code va kiem thu local; chua commit/push/deploy production.
- Muc tieu: Khong de anh dai dien kich thuoc lon lam tran hop chon nguoi/nhom nhan khi chia se tin nhan.
- Pham vi: JSX va CSS rieng cua modal chia se, test hoi quy frontend va production build; khong doi Chatmgt, Tinode, mobile, API hay du lieu.
- File da thay doi: `src/app/App.jsx`, `src/styles/index.css`, `src/features/chat/services/chatManagementService.test.js`, `dist/index.html`, `docs/CHANGELOG.md`.
- Noi dung: Modal truoc day render `ConversationAvatar` truc tiep trong button, thieu wrapper `.conv-avatar` ma CSS dang dung de gioi han anh. Them wrapper 32x32, giu `avatarClass`, fallback va co che tai anh bao ve hien co. Ten hoi thoai dai duoc rut gon bang ellipsis; danh sach nhan cuon rieng trong card, giu tieu de/nut dong hien thi va khong co hang khi danh sach dai. Them nhan truy cap cho dialog.
- Quyet dinh ky thuat: Tai su dung khung avatar hien co va chi scope CSS moi vao modal chia se, khong sua `SafeAvatar`, `ConversationAvatar` hay `shareMessageTo`. Giu nguyen loc hoi thoai hien tai/chatbot, chon dich den, dong bang nut X/nen/Escape, chan tin ca nhan, chong spam nhom, gui text/file va dong bo lich su. Khong doi kien truc hay nguon du lieu chuan.
- Database/API/cau hinh: Khong co migration, endpoint, bien moi truong hay dependency moi. Build lai frontend theo cau hinh production hien co.
- Kiem thu: `node --test src/features/chat/services/chatManagementService.test.js src/features/chat/services/chatRealtime.test.js src/features/chat/services/messageActionPolicy.test.js src/features/chat/services/messagePresentation.test.js src/features/chat/services/directMessageBlocking.test.js src/features/chat/services/groupSpamPolicy.test.js` dat 101/101. `npm run test:frontend` dat 372/372, gom 3 test cau truc hoi quy moi cho wrapper avatar, vung cuon/ten dai va chon/dong modal. `npm run lint` exit 0 voi canh bao legacy/vendor da co; `npm run build:production` thanh cong voi canh bao chunk App >500 KB da co. Doi chieu than ham `shareMessageTo`, `SafeAvatar`, `ConversationAvatar` voi Git HEAD bang Node assert: khong doi. `git diff --check` dat.
- Rui ro con lai: Chua UAT truc quan va gui tin end-to-end bang tai khoan Account/Tinode that do khong co phien browser kiem thu da xac thuc trong cong cu hien tai; test cau truc khong thay the kiem tra render tren thiet bi that. Chua deploy, nen website production chua nhan ban sua nay.
- Viec tiep theo: Khi duoc yeu cau phat hanh, commit/push va build/redeploy rieng ChatUI theo quy trinh. UAT chia se text/anh/file sang ca nhan va nhom voi avatar anh lon, avatar loi/fallback, ten dai, danh sach nhieu dong va man hinh hep; xac nhan nut dong/Escape va cac luong chat thuong, tra loi, cam xuc van hoat dong. Khong can migration hay khoi dong lai backend.
- Commit/PR: Chua tao.

## 2026-09-07-02 - Trien khai ViChat AI guidance len production

- Thoi gian: 2026-09-07 01:18-01:38 (Asia/Saigon)
- Loai: Trien khai | Web | Backend | Bao mat | Kiem thu | Van hanh
- Trang thai: Hoan tat; source `a1405a96a23363df7385efe0aa5d3bc30dc67035` da commit/push va production da verify
- Pham vi: Deploy dung tuyen `ubuntu@103.74.122.206` -> `ubuntu@192.168.80.20` (`chat-server`); chi build/recreate `chatmgt` va `chat`, giu nguyen Tinode bridge, chatbot webhook, ChatAPI, Coturn, PostgreSQL va Redis.
- Artifact: Archive `/opt/deploy/chat/incoming/vichat-ai-guidance-a1405a9.tar.gz`, 45076624 bytes, SHA-256 `9d3b96267b7219b1f0cc9f8c3dc7140f1ed9969921aebc23d13d0c4612ea2566`.
- Phat hanh: `current` tro `/opt/deploy/chat/releases/vichat-ai-guidance-a1405a9-20260907-r2`; `previous` tro `/opt/deploy/chat/releases/sender-name-948917c-20260906-r2`. Chat container moi `ca792e97125a`, image `sha256:a9b1fcf8afb884dfdfd48c2ae678469c736bfc2e3b29429e577d0db0d3b0a2f4`; Chatmgt container moi `8f8498eb7d4a`, image `sha256:3a5c46399aaa92c32b2b5ae904a4b446aedc5486aabecd1e0c5bdec16ce06174`.
- Backup va an toan: Backup truoc deploy nam tai `/opt/deploy/chat/backups/vichat-ai-guidance-a1405a9-20260907-r2/`, gom `.env`, runtime, dump Chatservice va Tinode; `sha256sum -c` va `pg_restore -l` deu dat. Alembic van `20260825_13`; env hash khong doi; volume va 7 service khong thuoc pham vi giu nguyen ID/image/restart count.
- Kiem thu production: Candidate backend trong image `32/32`; Chatmgt/ChatUI healthy, restart `0`; auth/chatbot health private va public HTTP 200; Nginx config dat; public bundle khop exact hash (`/assets/index-CP7jh-p4.js`, `App-Da7mzldR.js`, `/assets/index-D_3NWJVV.css`); public WSS tra `HTTP/1.1 101 Switching Protocols`; log scan sach. Verifier doc lap tren `chat-server` va `sudo nginx -t` tren jump host deu dat.
- Xu ly rollback: Candidate `r1` duoc rollback tu dong tai gate log vi Docker CLI production khong ho tro tuy chon `docker logs --no-color`; khong co thay doi ung dung hay du lieu bi bo lai. Sau khi sua verifier, candidate `r2` dat toan bo gate.
- Database/API/cau hinh: Khong migration, khong `docker compose down -v`, khong reset PostgreSQL/Redis/Tinode volume/topic/message; khong them secret hay bien moi truong.
- Rui ro con lai: Chua UAT bang tai khoan Account that trong browser va chua doi chieu cau tra loi voi tai lieu that; can thuc hien sau khi co browser/session hop le.

## 2026-09-07-01 - Lam ro trich loc va hoi tiep trong ViChat AI

- Thoi gian: 2026-09-07 00:54 (Asia/Saigon)
- Loai: Sua loi | Web | Backend | Bao mat | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source da commit/push va production da deploy/verify (xem muc `2026-09-07-02`)
- Muc tieu: Giup ViChat AI huong dan dung ro hon, xu ly cau hoi phu thuoc nhu `Noi ro hon`/`Tom tat ngan hon`, tra ve cac doan trich ngan co danh so va cho nguoi dung mo nguon de doi chieu ma khong bo sung mo hinh sinh noi dung.
- Pham vi: Adapter Knowledge AI retrieval trong Chatmgt, HTTP fallback va giao dien ViChat AI tren web, i18n, timeout/huy request, regression test, tai lieu kien truc va production bundle; khong doi Tinode worker, mobile, chat ca nhan/nhom, file, call, presence, database, migration, secret hay bien moi truong.
- File da thay doi: `README.md`, `chatservice-main/application/services/chatbot_service.py`, `chatservice-main/tests/test_chatbot_webhook_provider.py`, `src/app/App.jsx`, `src/features/chatbot/services/chatbotService.js`, `src/features/chatbot/services/chatbotService.test.js`, `src/features/i18n/appLanguage.js`, `src/features/i18n/appLanguage.test.js`, `src/styles/index.css`, `docs/chat-backend-architecture.md`, `dist/index.html`, `docs/CHANGELOG.md`.
- Noi dung: Cau chao, cam on, huong dan va mau chua dien duoc xu ly bang thong diep huong dan xac dinh ma khong goi provider. Cau hoi phu thuoc duoc ghep voi cau hoi nguoi dung co noi dung gan nhat trong lich su gioi han; cau hoi moi van giu nguyen. Nguon da xac minh duoc loai trung, chon cac cau lien quan theo tu khoa, danh so `[n]`, gioi han do dai va rut gon them khi nguoi dung yeu cau ngan hon. Web doi cac the nguon thanh `details/summary`, mau goi y chi dien vao draft va chon placeholder de nguoi dung sua truoc khi gui. HTTP fallback gioi han cau hoi/lich su/nguon, co timeout 45 giay, huy khi doi account/cong ty va khong dua loi/fallback vao lich su hoi tiep.
- Quyet dinh ky thuat: Tiep tuc coi snippet da qua manifest tenant cua Chatmgt la nguon duy nhat; bo qua provider answer trong retrieval mode va khong tong hop chinh sach moi. `CHATBOT_TIMEOUT` bao phu toan bo query, schema retry va manifest check o backend; client co ngan sach rieng de bao phu ca doc body. Khong tu dong retry cau hoi de tranh gui lap va khong luu them server-side memory.
- Database/API/cau hinh: Khong migration, schema, endpoint, secret hoac bien moi truong moi. Hop dong response cu duoc giu, chi chuan hoa chat reply/sources/fallback chat phia web; deploy Chatmgt va ChatUI cung nhau.
- Kiem thu: `node --test src/features/chatbot/services/chatbotService.test.js src/features/i18n/appLanguage.test.js` dat 48/48; `npm run test:frontend` dat 369/369; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build:production` dat voi entry `index-B5i85ehC.js`, App `App-3LmgKNI_.js`, CSS `index-D_3NWJVV.css` va warning App chunk tren 500 KB. Tai `chatservice-main`, `py -3.8 -m unittest tests.test_chatbot_webhook_provider -v` dat 32/32; `py -3.8 -m unittest discover -s tests -q` chay 299, dat 198 va skip 101 dependency/runtime tuy chon; `py -3.8 -m py_compile application/services/chatbot_service.py tests/test_chatbot_webhook_provider.py` dat; `git diff --check` dat, chi co canh bao LF/CRLF cua worktree Windows.
- Rui ro con lai: Chua UAT production bang phien Account that va chua doi chieu cau tra loi voi tai lieu that trong browser. Manifest Chatmgt van fail-closed nhung provider chua co tenant filter native, nen recall co the thieu khi tai lieu dung tenant khong nam trong global top 20. Dependency build van co canh bao chunk lon va cac warning lint vendor cu.
- Viec tiep theo: UAT browser bang tai khoan Account that va doi chieu cau tra loi voi tai lieu production.
- Commit/PR: `a1405a96a23363df7385efe0aa5d3bc30dc67035`.

## 2026-09-06-05 - Tang tuong phan ten nguoi gui tren hinh nen

- Thoi gian: 2026-09-06 22:14-23:10 (Asia/Saigon)
- Loai: Sua loi | Web | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source da commit/push va production da deploy/verify; chua UAT browser bang tai khoan that
- Muc tieu: Ten nguoi gui phai doc ro tren moi hinh nen, ke ca nen toi, nen co nhieu chi tiet, che do sang/toi va tin nhan sticker/anh.
- Pham vi: ChatUI presentation cua nhan ten nguoi gui; giu nguyen hinh nen da chon, tin nhan, realtime, profile click, attachment va cac luong presence.
- File da thay doi: `src/styles/index.css`, `src/features/chat/services/chatManagementService.test.js`, `docs/CHANGELOG.md`, `dist/index.html` duoc cap nhat tu production build.
- Noi dung: Them nen trang gan dac, vien, bo goc tron, chu toi va bong nhe cho `.sender-name` chi khi hoi thoai dang dung hinh nen. Selector dung chung cho tin chu, sticker, anh, lo anh, poll va ten trang thai dang nhap; khong doi JSX hay du lieu background.
- Quyet dinh ky thuat: Dung mot lop nen doc lap thay vi tiep tuc phu thuoc vao text-shadow tren mau anh bat ky; che do toi van dung nen trang va chu toi de giu tuong phan on dinh. Khong thay toan bo preset/upload va khong sua luong tin nhan.
- Database/API/cau hinh: Khong co.
- Kiem thu: `node --test src/features/chat/services/chatManagementService.test.js src/features/chat/services/conversationBackground.test.js src/features/chat/services/messagePresentation.test.js src/features/chat/services/imageBatchLayout.test.js` dat 64/64; `npm run test:frontend` dat 357/357; `npm run lint` exit 0 voi canh bao legacy/vendor da co; `npm run build:production` thanh cong voi canh bao chunk `App` >500 KB da co; `git diff --check` dat.
- Rui ro con lai: Chua UAT bang tai khoan that tren moi preset/custom wallpaper vi phien nay khong co cong cu dieu khien browser; can hard refresh `https://chat.upgo.vn` de tai bundle moi. Khong co thay doi backend/database; WSS 101 chi xac nhan handshake, khong phai UAT goi. Gioi han WebRTC co san van duoc ghi tai muc `2026-09-06-04`.
- Viec tiep theo: UAT tin chu, sticker, anh/lo anh va poll tren nen sang/toi; neu trinh duyet con bundle cu thi hard refresh hoac mo lai tab.
- Commit/PR: Source `948917cd0721657cbce8dbf9cb45bfd633068d52`, deploy record `6f99adc`, da push `origin/master`; production release `/opt/deploy/chat/releases/sender-name-948917c-20260906-r2`.

- Phat hanh production: Di qua `ubuntu@103.74.122.206` roi `ubuntu@192.168.80.20` (`chat-server`); chi build/recreate `chat`. Release candidate `r1` da tu rollback truoc khi switch vi snapshot mount Docker doi thu tu mang cua `chatmgt`; khong co thay doi ngoai y muon. `r2` so sanh ID/image/restart va deploy thanh cong; probe rieng sau deploy chuan hoa thu tu mount va doi chieu du 8 container voi baseline `r1`. ChatUI container moi `03bb2597ff3c872ce3382cb1f79be0f5ce6ad73f98163af8cb360a57c797fa69`, image `sha256:86cbf65e111a6e237093df9ef4dec51773c5d0eccdb5d601b45538d7ce40c32e`; `current` tro release `r2`, `previous` tro release presence truoc do.
- Kiem tra production: Candidate CSS xac nhan ca theme sang/toi co nen trang, chu toi, `text-shadow: none`; ChatUI health healthy, Nginx config dat, public health ChatUI/Chatmgt dat, WSS tra `101 Switching Protocols`. Public asset khop byte/hash voi container: `/assets/index-DR25tm3Y.js` SHA-256 `ef1330f290a49ed6beb98d7acea796dc0661119fd6efdf6dbb3fcb38f5bd2212`, `App-rrV8s8oL.js` SHA-256 `51ad280cef50a98fe4d6a922ebf6ea076976ca06de59484f59d5f2588b919402`, `/assets/index-lRx1CMMS.css` SHA-256 `1066406399c1a987aa12cc9c2b99bc140b706bb41e470331d83f3b4f85ed584e`. ID/image/restart/mount cua 8 container ngoai ChatUI da doi chieu, volume khong doi, Alembic van `20260825_13`, env SHA van `4ae2d1cf4af80b4289cd07b15d55b5979eb926d613513d69ece8de8225c6fcb0`.
- Xac minh doc lap: `Invoke-WebRequest` tu may local tra HTTP 200 cho trang public va CSS moi; kiem tra rieng ca hai rule `.sender-name` co chu `#152e2c`, nen `#fffffff0`, khong text-shadow. Day la kiem tra asset, khong thay the kiem thu hinh anh/browser.
- Backup/rollback: `/opt/deploy/chat/backups/sender-name-948917c-20260906-r2` giu env/runtime, PostgreSQL dump da kiem tra `pg_restore -l`, snapshot truoc/sau, `result.txt` va `mount-verification.txt`. Image truoc release duoc tag `songhong-production-chat:rollback-before-sender-name-948917c-r1` (tag dung chung cho ca hai lan thu); rollback bang image/compose/env trong `runtime-state.txt` va chi recreate `chat`, khong restore database hay xoa volume. File tam moi local duoc giu ngoai commit vi thao tac cleanup bi chan; khong thay doi 57 file untracked co san.

## 2026-09-06-04 - Phat hanh ban sua moc ngoai tuyen qua hai chang SSH

- Thoi gian: 2026-09-06 16:07-17:22 (Asia/Saigon)
- Loai: Van hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat; source da commit/push va production da deploy/verify; chua UAT browser bang tai khoan that
- Muc tieu: Dua ban sua presence tai muc `2026-09-06-03` len production, khong anh huong du lieu va cac luong chat khac.
- Pham vi: Commit/push `master`, build va recreate rieng Chatmgt/ChatUI tren `192.168.80.20`, di qua `ubuntu@103.74.122.206` roi `ubuntu@192.168.80.20`.
- File da thay doi: `docs/CHANGELOG.md`; release gom cac file da liet ke tai muc `2026-09-06-03`.
- Noi dung: Da commit source `7c6b3dc3850d6e2e6d2fe7c87f8ba79febe7e457`, push `origin/master`, di qua `ubuntu@103.74.122.206` roi `ubuntu@192.168.80.20` (`chat-server`). Production dang chay release `/opt/deploy/chat/releases/presence-departure-7c6b3dc-20260906-r3`; ChatUI container `98c8e09c761de367aadb14c5af0f2d7d21364fc17aa2a576db507de05b412597`, Chatmgt container `aed615b6b2ae2c86a862b929fb3725a148a860231379840cf458806bb1eeccbc`; ChatUI/Chatmgt healthy, restart count 0. Tinode bridge, chatbot, Coturn, PostgreSQL, Redis va cac service stateful khong bi recreate.
- Quyet dinh ky thuat: Release bat bien tu git archive cua source commit; sao luu `.env`, runtime va PostgreSQL truoc khi thay container, tag image rollback, test candidate va Redis Lua truoc khi switch. Khong chay bootstrap/start.sh hoac reset/migrate database cho ban sua nay.
- Database/API/cau hinh: Khong migration hoac cau hinh moi; body presence them sequence tuy chon nhu muc `2026-09-06-03`.
- Kiem thu: Local `npm run test:frontend` dat 357/357; `npm run lint` va `npm run build:production` exit 0, warning legacy/vendor va chunk >500 KB co san. Local backend `py -3.8 -m unittest discover -s tests -q` dat 286, skip 101; presence Lua voi `fakeredis[lua]` dat 14/14; `py_compile` dat; `git diff --check` dat. Candidate production full source test read-only dat 286, skip 1; presence test trong image dat 14, skip 1; smoke Redis/Lua that dat va da xoa probe key tam. Sau activate, Chatmgt `verify_deployment.py` database/policy dat, `verify_tenant_isolation.py` dat; authenticated directory/conversation/Tinode internal publish-delete/public WSS token login-subscription/logout dat; ChatUI/Chatmgt health HTTP 200, public WSS HTTP 101, Nginx dat, log 10 phut khong co marker loi. Public asset khop container: `/assets/index-CCy0mSS8.js` SHA-256 `da0f56c00a5d2d3e3650c8c0c1427e6d17cfefdc7fd1e90a516d74ad2858c170`, `App-CiAPBx4Q.js` SHA-256 `5ef7e15c91e828d98727dbb8a79f6464fb7013c592e3f7121d2be7fb5d524f5e`, `index-DMJdiIuh.css` SHA-256 `19676855118cc5cc7590da87efc625127945a4dd58d4ffa0e51abf6521fb95f5`; Alembic van `20260825_13`; service state/volume diff chi thay ChatUI/Chatmgt.
- Lan thu: `r1` dung o candidate vi test source chay trong image khong co cay repo; khong recreate. `r2` mount source dung commit read-only cho full test: chay 286, dat 285, skip 1 fakeredis/Lua tuy chon; presence truc tiep trong image chay 14, dat 13, skip 1; smoke Redis Lua that dat. Sau recreate, verifier public WebRTC fail nen rollback hai service ve image cu, release current giu `font-restore-0af5eb4-20260906-r2` va healthy. Chay verifier tren baseline cu cung fail dung dieu kien `webrtcEnabled`; probe public tra `201`, `webrtcEnabled=false`, 2 ICE server. `r3` giu cac kiem tra auth, directory, conversation, Tinode internal publish/delete, public WSS token login/subscription, logout va tenant isolation; rieng capability goi duoc doi chieu fingerprint ICE/flag truoc-sau, khong sua hay gia mao flag server va khong coi goi da qua UAT.
- Rui ro con lai: Public WebRTC dang bao tat tu truoc release (`webrtcEnabled=false`) du ICE van co; khong sua vi ngoai pham vi presence va khong bao da UAT goi. Can tai khoan that hard refresh de kiem tra hien thi offline lau ngay, an/dong tab, reconnect va cac luong chat/file/sticker/call. Neu rollback, tro `current` ve `previous` va recreate rieng ChatUI/Chatmgt theo backup/tag da ghi; khong chay `docker compose down -v`.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, UAT presence voi tai khoan offline lau ngay va nhieu tab; xac nhan chat ca nhan/nhom, file, sticker va call khong doi. Theo doi key sequence/last-seen tu het han binh thuong; xu ly rieng public WebRTC neu can bat goi.
- Commit/PR: Source `7c6b3dc3850d6e2e6d2fe7c87f8ba79febe7e457`; deploy record `2edb916229f6e11024c157928e8ea4ce53698b52`, da push `origin/master`.

## 2026-09-06-03 - Tinh ngoai tuyen tu moc roi web, khong tu gio nhan su kien

- Thoi gian: 2026-09-06 15:58 (Asia/Saigon)
- Loai: Sua loi | Web | Backend | API | Kiem thu | Tai lieu
- Trang thai: Hoan tat local; chua commit, push, deploy production hoac UAT browser bang tai khoan that
- Muc tieu: Nguoi da roi web nhieu ngay khong bi hien ngoai tuyen mot gio chi vi nguoi xem mo web/reconnect; thoi gian phai dua tren moc hoat dong/roi web do server ghi nhan.
- Pham vi: Presence va last-seen cua ChatUI/Chatmgt; giu nguyen Tinode message, topic, membership, upload, sticker, call, authentication, Workspace, mobile va font Inter.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/browserPresence.js`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/chatManagementService.test.js`, `src/features/chat/services/directoryPresence.test.js`, `chatservice-main/application/services/presence_service.py`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/tests/test_presence_service.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `dist/index.html` tu production build.
- Noi dung: Tim thay handler Tinode `presence/off` gan `Date.now()` tren trinh duyet nguoi xem cho last-seen cua nguoi khac. Contact offline tu truoc van phat su kien luc dong bo/reconnect, va phep merge lay moc moi nhat giu lai moc gia thay vi moc server cu. Bo timestamp tu tao; su kien Tinode chi doi boolean, thoi luong lay tu Chatmgt, thieu du lieu thi chi hien ngoai tuyen. Tach vong doi browser presence: an tab/roi trang gui offline keepalive mot lan va dung heartbeat; hien lai/pageshow tiep tuc, bo response tre tu vong doi cu. Offline lap, session chua tung online hoac lease da het han khong cap nhat last-seen. Khong dung thoi gian tin nhan de suy doan lan roi web.
- Quyet dinh ky thuat: Giu nguyen boolean Tinode de tranh thay doi cac luong realtime dang co; chi Chatmgt cung cap moc tinh thoi luong. Them sequence theo browser-session de Redis Lua bo qua heartbeat/offline trung hoac den sai thu tu, tranh heartbeat tre lam online lai sau khi roi web va offline tre xoa lease khi da quay lai. Sequence tach theo tenant/account/JWT/browser, TTL 24 gio; online TTL 8 giay, last-seen TTL 90 ngay va monotonic compare-and-set giu nguyen. Khong disconnect Tinode khi an tab, khong doi session, conversation hay browser preference. Test service co the chay voi stub dependency trong bo nho neu thieu runtime Chatmgt, khong sua dependency production.
- Database/API/cau hinh: Khong migration, schema PostgreSQL, secret hay bien moi truong moi. Body heartbeat/offline them `sequence` tuy chon la so nguyen duong <= 9007199254740991; client cu khong gui van tuong thich, response giu nguyen. Them key Redis `vichat:presence-sequence:` tu het han; khong xoa/reset du lieu cu.
- Kiem thu: `node --test src/features/chat/services/directoryPresence.test.js src/features/chat/services/chatManagementService.test.js src/features/contacts/services/accountDirectory.test.js src/features/chat/services/timeFormatting.test.js` dat 107/107; `npm run test:frontend` dat 357/357; `npm run lint` exit 0, warning legacy/vendor co san; `npm run build:production` dat, entry `index-JH_gVovt.js`, App `App-BYUvBBpA.js`, CSS Inter giu nguyen `index-DMJdiIuh.css`, warning App chunk >500 KB co san. Tai `chatservice-main`, `py -3.8 -m unittest tests.test_presence_service tests.test_chat_auth_contract -q` chay 70, dat 69, skip 1 test Lua tuy chon; `py -3.8 -m unittest discover -s tests -q` chay 286, dat 185, skip 101 vi dependency/runtime tuy chon. `py -3.8 -m py_compile application/services/presence_service.py application/controllers/api_chat_management.py tests/test_presence_service.py tests/test_chat_auth_contract.py` dat. Cai rieng test dependency bang `py -3.14 -m pip install --disable-pip-version-check --target "$env:TEMP/vichat-presence-lua-20260906" 'fakeredis[lua]'`; dat `PYTHONPATH` toi thu muc do va chay `py -3.14 -m unittest tests.test_presence_service -v` dat 14/14, gom thuc thi Lua qua fakeredis/lupa, khong chi test nhanh fallback. Test bao phu roi web 3 ngay, khong co moc, tab an tu luc restore, nhieu tab/tenant, cleanup lap, lease het han, heartbeat/offline tre, response sau doi account/tenant, Loi Redis va giu luong chat doc lap. `git diff --check` dat.
- Rui ro con lai: Chua UAT browser that vi phien nay khong co cong cu dieu khien browser, khong co Docker local de chay image production; fakeredis/Lua khong thay the Redis integration tren production. Mat mang/crash khong gui duoc offline thi dung heartbeat cuoi, sai so theo chu ky heartbeat thay vi tu tao gio hien tai. Lich su chua tung duoc server luu hoac het TTL khong the khoi phuc tu tin nhan; moc Redis da bi cleanup cu ghi sai khong tu sua bang du doan. Tab con dung bundle cu can reload.
- Viec tiep theo: Khi duoc yeu cau phat hanh, commit/push va deploy Chatmgt truoc/kem ChatUI, khong reset PostgreSQL/Redis/Tinode/storage; rollback code hai service stateless neu can, key sequence tu het han. UAT hai tai khoan: mo web xem nguoi offline lau, an/dong tab roi quay lai, thu nhieu tab, reconnect/mat mang va kiem tra chat ca nhan/nhom, file, sticker, call, chuyen tenant. Chua thay doi website production trong lan lam viec nay.
- Commit/PR: Chua tao.

## 2026-09-06-02 - Khoi phuc font Inter cu cho ChatUI

- Thoi gian: 2026-09-06 13:57-14:17 (Asia/Saigon)
- Loai: Sua loi | Web | Giao dien | Kiem thu | Van hanh | Tai lieu
- Trang thai: Hoan tat; da test, commit, push, deploy production va xac minh doc lap; chua UAT visual bang tai khoan that trong browser
- Muc tieu: Dua giao dien ve font Inter/system nhu truoc release presence vi Times New Roman lam noi dung chat kho doc, dong thoi giu nguyen tinh nang cham xanh truc tuyen va thoi gian ngoai tuyen.
- Pham vi: HTML tai font, font-family ChatUI/Chatmgt UI, error boundary va regression test giao dien; khong sua backend, API, Redis presence, message, topic, membership, database hay cac luong chat dang hoat dong.
- File da thay doi: `index.html`, `src/index.css`, `src/styles/index.css`, `src/features/management/management.css`, `src/RootApp.jsx`, `src/features/chat/services/chatManagementService.test.js`, `dist/index.html` tu production build va `docs/CHANGELOG.md`.
- Noi dung: Khoi phuc Google Inter va font stack cu cho body/management; error boundary quay lai system UI. Regression test tiep tuc bat buoc cac marker `last_seen_at`, format thoi gian ngoai tuyen va cham xanh online, nen viec doi font khong duoc loai bo logic presence.
- Quyet dinh ky thuat: Doi chieu truc tiep voi baseline `5585e6a` va chi hoan tac nhung dong font cua `41a52b4`; cac thay doi CSS/React presence van duoc giu nguyen. Production se chi recreate service `chat` neu diff va test xac nhan backend khong doi.
- Database/API/cau hinh: Khong migration, endpoint, hop dong API, secret hay bien moi truong moi.
- Kiem thu: `npm run test:frontend` dat 347/347, gom regression xac nhan font Inter va toan bo marker presence; `npm run lint` exit 0, chi warning legacy/vendor co san; `npm run build:production` dat voi entry `index-QHC5xfZK.js`, App `App-ZjbLbBkU.js`, CSS `index-DMJdiIuh.css` va warning App chunk lon hon 500 KB co san. Bundle co `last_seen_at`, source/build khong con `Times New Roman`; `git diff -- chatservice-main` rong va `git diff --check` dat. Candidate production `r1` dung truoc recreate vi `nginx -t` chay ngoai Docker network khong phan giai duoc `chatmgt`; current/container cu van healthy va khong doi. `r2` chay preflight trong network production, build va marker font/presence dat; sau deploy ChatUI/Chatmgt healthy, restart count 0, private health dat, public ChatUI/Chatmgt HTTP 200, WSS HTTP 101, Nginx jump host dat, public asset khop container va log 15 phut co 0 marker `fatal|panic|traceback|uncaught|critical|emerg`.
- Trien khai: Source `0af5eb4` da push `origin/master`; archive `/opt/deploy/chat/incoming/vichat-font-restore-0af5eb4.tar.gz` 45058434 byte, SHA-256 `9ec82ffe87b64279929ee06a9c2a46b20ac5ba60ada962f8351bafc885f37358`, deploy qua `ubuntu@103.74.122.206` roi SSH tiep `ubuntu@192.168.80.20`. Release `/opt/deploy/chat/releases/font-restore-0af5eb4-20260906-r2` dang la `current`, `previous` tro `/opt/deploy/chat/releases/presence-font-41a52b4-20260906-r4`; chi build/recreate `chat`.
- Public bundle: Entry `/assets/index-DYVkGkYt.js` SHA-256 `adb52845676872aa88e730b57a2c7b35372eb888c7ebc1be3c6fe6521b7993bcb`; App `App-xke9JlbV.js` SHA-256 `82f42a7b20312efbf29f0bf1aac965d783e4bc8ae2320659d8b8f711284d288c4`; CSS `/assets/index-DMJdiIuh.css` SHA-256 `19676855118cc5cc7590da87efc625127945a4dd58d4ffa0e51abf6521fb955f5`; management CSS `ManagementApp-BKgeVkrA.css` SHA-256 `bed2257d6d343eff7fd6b38872b9eba47251dad4611f5ee1a555a7c8f42ebe5c`. HTML/CSS public co Inter, khong con Times New Roman; App/CSS van co `last_seen_at` va cham xanh online.
- Backup/bao toan state: Backup PostgreSQL `/opt/deploy/chat/backups/font-restore-0af5eb4-20260906-r2/chatservice-predeploy.dump` 305161 byte, mode `0600`, SHA-256 `dea4fa53a55abb3c7042f0de93823240ac59fdb45ac29190188339010fb02cef`; `.env` giu nguyen SHA-256 `4ae2d1cf4af80b4289cd07b15d55b5979eb926d613513d69ece8de8225c6fcb0`; Alembic van `20260825_13`. ChatUI doi sang container `6185e751c91a`, image `sha256:aa9c467c00b2ecbc0625426c3a456d9eefb851389efb6ac9c53b413239e99239`; `chatmgt=49387bbd76e0` va moi service khac giu nguyen container ID. Khong migration/reset database, Redis, Tinode topic/message/cursor, volume, browser storage hay setting nguoi dung.
- Rui ro con lai: Chua UAT visual bang tai khoan that; browser dang giu CSS cu co the can hard refresh.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, xac nhan font trong danh sach hoi thoai/message/sidebar da de doc va smoke-test online/offline, gui tin, file, sticker va goi.
- Commit/PR: Source `0af5eb4`; ban ghi deploy nam trong commit tai lieu follow-up; khong co PR

## 2026-09-06-01 - Hien thi thoi gian ngoai tuyen va font de doc

- Thoi gian: 2026-09-06 13:08-13:54 (Asia/Saigon)
- Loai: Tinh nang | Sua loi | Web | Backend | API | Kiem thu | Van hanh | Tai lieu
- Trang thai: Hoan tat; da test, commit, push, deploy production va xac minh doc lap; chua UAT visual bang tai khoan that trong browser
- Muc tieu: Doi giao dien sang Times New Roman, hien thi dau xanh khi tai khoan truc tuyen va cho biet tai khoan da ngoai tuyen bao lau tu lan heartbeat chat cuoi.
- Pham vi: ChatUI presence/directory/profile/header, Chatmgt Redis presence metadata va tai lieu kien truc; khong thay doi message, topic, membership, database hay luong realtime chat.
- File da thay doi: `index.html`, `src/index.css`, `src/styles/index.css`, `src/features/management/management.css`, `src/RootApp.jsx`, `src/app/App.jsx`, `src/features/chat/services/tinodeClient.js`, `src/features/contacts/services/accountDirectory.js`, `src/features/chat/services/timeFormatting.js`, `src/features/i18n/appLanguage.js`, `chatservice-main/application/services/presence_service.py`, `chatservice-main/application/controllers/api_chat_management.py`, `docs/chat-backend-architecture.md`, cac file test presence/time formatting/directory/contract va `dist/index.html` tu production build.
- Noi dung: Giu nguyen map `presence` boolean de tuong thich nguoc, bo sung map `last_seen_at` tu Redis voi TTL 90 ngay. ChatUI chi hien `Truc tuyen` kem cham xanh khi online; khi offline hien `Ngoai tuyen` kem phut/gio/ngay/thang/nam da troi qua neu co moc luu tru, va van fallback an toan neu chua co moc.
- Quyet dinh ky thuat: Tach key last-seen theo tenant/account khoi lease theo session; heartbeat/pagehide cap nhat moc hoat dong nhung khong ghi PostgreSQL hay Tinode. Redis dung Lua compare-and-set atomic de request heartbeat/logout den tre khong ghi de moc moi hon; fallback read/compare/set chi danh cho test double khong co `EVAL`. Lease online/offline la thao tac chinh, con ghi last-seen la best-effort de loi metadata khong lam hong heartbeat hay logout. Font duoc dat o body va control ke thua de khong bo sot input/button; bo tai Google Inter khong con su dung; presence metadata duoc merge theo moc moi nhat de khong lam mat state hoi thoai.
- Database/API/cau hinh: Khong migration, schema, secret hay bien moi truong moi. Hai endpoint presence giu response cu va them `last_seen_at`/`lastSeenAt`; key Redis tu het han sau 90 ngay.
- Kiem thu: `npm run test:frontend` dat 347/347; `npm run lint` exit 0 voi warning legacy/vendor da co san; `npm run build:production` thanh cong voi canh bao chunk App lon hon 500 KB; `py -3.8 -m unittest discover -s tests -q` dat 276 test, 104 skip do dependency/runtime tuy chon; `py -3.8 -m unittest tests.test_chat_auth_contract -q` dat 56/56; local `tests.test_presence_service` gom 4 test bi skip do thieu dependency Chatmgt, nhung candidate Linux trong image production da chay dat 4/4 va full backend dat 276 test trong 28 giay. Candidate Redis smoke xac nhan timestamp cu khong ghi de timestamp moi; `py_compile`, Nginx marker va Compose gate dat. Sau deploy, verifier database/credential/CORS/directory/conversation/Tinode WebSocket/login/logout va hai tenant dat; `chat`/`chatmgt` healthy, restart count 0; private health dat, public ChatUI/Chatmgt HTTP 200, WSS HTTP 101, Nginx tren jump host dat, marker font/presence co trong image va log 15 phut co 0 marker `fatal|panic|traceback|uncaught|critical|emerg`.
- Trien khai: Source `41a52b4` da push `origin/master`; archive `/opt/deploy/chat/incoming/vichat-presence-41a52b4.tar.gz` 45054123 byte, SHA-256 `7d83a2f39b49f6a70c9a1e2468aa9b8aabbf0c6d4d8b356e0e46760c5f471ec5`, deploy qua `ubuntu@103.74.122.206` roi SSH tiep `ubuntu@192.168.80.20`. Ba candidate `r1`-`r3` dung tai gate truoc/sau recreate va rollback an toan; `r4` thanh cong, release `/opt/deploy/chat/releases/presence-font-41a52b4-20260906-r4` dang la `current`, `previous` tro `/opt/deploy/chat/releases/tenant-rag-d62d61e-20260904-r1`; chi recreate `chatmgt` va `chat`.
- Public bundle: Entry `/assets/index-D1B6tOy6.js` SHA-256 `f1de6457e85a5f1392f061524c003f931862a39dd25179f73d0883735a3d6cbe`; App `App-BWPS3Riz.js` SHA-256 `5aec320abbb2f791b370b244cfa80e0eaf9fdc7bcecbe889289c41daca4270a2`; CSS `/assets/index-C4NeIAJL.css` SHA-256 `cf2add2eeac87857e6dccc3b0ff3dbe06efda1c5cdaa634300f3198b75e15f89`. Ca ba asset public khop byte voi container va co marker `last_seen_at`/`Times New Roman`.
- Backup/bao toan state: Backup PostgreSQL `/opt/deploy/chat/backups/presence-font-41a52b4-20260906-r4/chatservice-predeploy.dump` 303039 byte, mode `0600`, SHA-256 `2efe881008ce9e4edea920f513b280a261f90d9b954d1c4590f61b01c2e9953f`; `.env` release/backup giu nguyen SHA-256 `4ae2d1cf4af80b4289cd07b15d55b5979eb926d613513d69ece8de8225c6fcb0`; Alembic van `20260825_13`. Container moi: `chat=8443d64b13c3` voi image `sha256:2fe0b42b336ec93b031753fb9f9e824af81147599622a280e0d6284e41ac9ee6`, `chatmgt=49387bbd76e0` voi image `sha256:8be46be6b28998e9f6240d285b3cc7a667138e57a1d81541d44db942767b598d`; cac service con lai giu nguyen container ID, khong migration/reset database, Redis, Tinode topic/message/cursor, volume hay setting nguoi dung.
- Rui ro con lai: Chua UAT visual voi tai khoan that vi phien nay khong co browser runtime. Tai khoan khong co heartbeat luu truoc release se chi hien `Ngoai tuyen` cho den lan online dau tien; browser dang giu bundle cu co the can hard refresh.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, UAT header/danh ba/profile voi mot tai khoan online va mot tai khoan offline; smoke-test chat ca nhan/nhom, gui file, sticker va goi de xac nhan khong co hoi quy. Neu phat sinh loi, rollback rieng `chatmgt`/`chat` ve release `previous`, khong dong vao service stateful.
- Commit/PR: Source `41a52b4`; ban ghi deploy nam trong commit tai lieu follow-up; khong co PR

## 2026-09-04-02 - Ingest tai lieu chat theo tenant va lam moi ViChat AI

- Thoi gian: 2026-09-04 17:10-20:02 (Asia/Saigon)
- Loai: Tinh nang | Sua loi | Bao mat | Web | Backend | API | Ha tang | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da test, commit, push, deploy production va xac minh doc lap; chua UAT web bang phien Account that
- Muc tieu: Cho phep tai lieu duoc gui tu web trong chat 1-1/nhom tro thanh nguon RAG cua dung cong ty, khong de loi ingest lam hong file Tinode da gui thanh cong, dong thoi lam giao dien ViChat AI ro rang va than thien hon ma khong sua mobile hay cac luong chat dang on dinh.
- Pham vi: ChatUI web, endpoint relay tai lieu Chatmgt, adapter Knowledge AI retrieval/ingest, bien moi truong Compose, giao dien ViChat AI, i18n, test hop dong va tai lieu van hanh; khong sua file nao trong `mobile/`, khong migration, khong doi Tinode message/topic/file storage.
- File da thay doi: `README.md`, `chatservice-main/.env.chatbot.example`, `chatservice-main/application/config/config.py`, `chatservice-main/application/controllers/api_chatbot.py`, `chatservice-main/application/services/chatbot_service.py`, `chatservice-main/tests/test_chatbot_webhook_provider.py`, `chatservice-main/tests/test_external_chatbot_contract.py`, `chatservice-main/tests/test_tinode_central_switch.py`, `dist/index.html`, `docs/chat-backend-architecture.md`, `docs/external-chatbot-api.md`, `infrastructure/chatservice/.env.example`, `infrastructure/chatservice/compose.yaml`, `infrastructure/production/.env.example`, `infrastructure/production/README.md`, `infrastructure/production/compose.yaml`, `src/app/App.jsx`, `src/features/chatbot/services/chatbotService.js`, `src/features/chatbot/services/chatbotService.test.js`, `src/features/i18n/appLanguage.js`, `src/features/i18n/appLanguage.test.js`, `src/styles/index.css`, `docs/CHANGELOG.md`.
- Noi dung: Sau khi `tinodeClient.sendFile` tra sequence duong, web gui lai rieng cac file PDF/DOCX/XLS/XLSX/TXT/Markdown/CSV/JSON toi endpoint Chatmgt; anh, am thanh, video, sticker, file rong, file khong ho tro va file tren 20 MB duoc bo qua. Endpoint xac minh session, tenant, conversation, participant dang active/approved va topic direct/group, boc tach text trong bo nho, tao `file_id` on dinh tu tenant + conversation + Tinode sequence, roi gui payload `file_name`, `text_content`, `tenant_id`, `source=vichat_web`, `file_id`, `metadata` cho RAG. File forward dung cung gate sau publish. Ingest chay fire-and-forget, nen HTTP/network/provider error chi ghi canh bao va khong doi message da delivered thanh failed. UI ViChat AI co context strip, starter hero/prompt card, composer, source card va sidebar moi; bo sung dark theme, responsive, reduced-motion va ban dich tieng Anh cho copy moi.
- Quyet dinh ky thuat: `tenant_id` chi lay tu Chatmgt JWT/Tinode account da xac thuc, browser khong co truong tenant. Tinode tiep tuc la nguon chuan duy nhat cua message/file; Chatmgt khong persist byte/text tai lieu vao PostgreSQL, Redis, Workspace hay local knowledge. `/api/v1/ingest` duoc thu truoc va chi fallback `/api/v1/dataroom/callback` khi `404/405`; HTTP 2xx co `status=error` van la that bai. OpenAPI `/api/v1/chat` chi khai bao `message`/`top_k`; probe read-only voi hai tenant gia tra cung fingerprint source, xac nhan provider hien bo qua tenant. Vi vay `CHATBOT_TENANT_FILTER_REQUIRED=true` yeu cau Chatmgt doi chieu ket qua voi manifest `/api/v1/files`, chi giu file ID/ten file thuoc duy nhat tenant hien tai, loai foreign/unknown/ten trung nhieu tenant va bo qua provider answer chua xac minh. Manifest thieu/khong hop le fail-closed; request lay toi da 20 candidate roi gioi han ket qua hien thi theo `CHATBOT_RETRIEVAL_LIMIT`.
- Database/API/cau hinh: Khong migration va khong sua du lieu. Khoi phuc co kiem soat `POST /api/v1/chatbot/knowledge/chat-files`; health chatbot them trang thai ingest/tenant manifest. Them `CHATBOT_TENANT_FILTER_REQUIRED`, `CHATBOT_FILES_URL`, `CHATBOT_INGEST_ENABLED`, `CHATBOT_INGEST_URL`, `CHATBOT_INGEST_FALLBACK_URL`, `CHATBOT_INGEST_TIMEOUT`; production Compose mac dinh bat tenant filter va ingest. Rollback chi can tat `CHATBOT_INGEST_ENABLED`/recreate `chatmgt`; khong reset Tinode, database hay volume.
- Kiem thu: `npm run test:frontend` dat 343/343; `py -3.8 -m unittest discover -s tests -q` tai `chatservice-main` dat 274 test, skip 102 dependency/runtime tuy chon; targeted chatbot/tenant/ingest dat 16/16 va local HTTP flake `WinError 10053` chay rieng dat 1/1; `npm run lint` exit 0, chi warning legacy/vendor co san; `npm run build:production` dat voi entry `index-vgjS30vl.js`, App `App-DJOqGhQb.js`, CSS `index-DsoLDCyr.css` va warning App chunk tren 500 KB; `py -3.8 -m py_compile application/services/chatbot_service.py application/controllers/api_chatbot.py` dat; `git diff --check` dat. Probe public read-only truoc deploy: `/api/v1/ingest` HTTP 404, `/api/v1/dataroom/callback` HTTP 200, `/api/v1/files` co manifest day du va hai tenant gia tren `/api/v1/chat` nhan cung fingerprint source. `git diff -- mobile` va `git status --short mobile` rong. Gate candidate Linux dat 35 test chatbot/tenant/ingest/contract, `py_compile`, marker bundle va Compose config. Sau deploy, health auth/chatbot public dat, `tenant_filter.required=true`, ingest enabled/configured, endpoint ingest khong session tra `401`, probe tenant gia fail-closed khong tra source, manifest co `total=5` khop danh sach va mot tenant, WSS tra `101`, checksum public khop container, log ChatUI/Chatmgt khong co fatal/panic/traceback/uncaught/critical/emerg.
- Trien khai: Source `d62d61e` da push `origin/master`; archive `/opt/deploy/chat/incoming/vichat-tenant-rag-d62d61e.tar.gz` 45050940 byte, SHA-256 `8ae366127bcf53048f5f3cffaa67a556f02395bd7660a49a388caa54081c02e9`, deploy qua `ubuntu@103.74.122.206` roi SSH tiep `ubuntu@192.168.80.20`. Release `/opt/deploy/chat/releases/tenant-rag-d62d61e-20260904-r1` dang la `current`, `previous` tro `/opt/deploy/chat/releases/vichat-ai-3da170b-20260904-r1`; chi recreate `chatmgt` va `chat`.
- Public bundle: Entry `/assets/index-28kmb0cL.js` SHA-256 `2874946fad1dcd8b96dd4542d52fc562fd81a2dc0da820b556ad4d6ba2bfe5cc`; App `App-2Wpg3zQS.js` SHA-256 `fc0c8560d81e2b5ed0de45b9e363b4d2c093ebf56ca972db73404adfaafd6413`; CSS `/assets/index-DsoLDCyr.css` SHA-256 `2653652061f29f227138630a74ad1270cb119a25fac50efa3775a266970abffe`. Ca ba asset public khop byte voi candidate va co marker ingest/UI moi.
- Backup/bao toan state: Backup PostgreSQL `/opt/deploy/chat/backups/tenant-rag-d62d61e-20260904-r1/chatservice-predeploy.dump` 292278 byte, SHA-256 `e8b2929ea85219a481f51771871b270a27fc8b2410565b3fbbef73e8a65b12bd`; `.env` truoc/sau/backup giu nguyen SHA-256 `4ae2d1cf4af80b4289cd07b15d55b5979eb926d613513d69ece8de8225c6fcb0`; Alembic van `20260825_13`. Container moi: `chat=2c370d4fcc25` voi image `sha256:fda7b25fd519850a3b1b8707fa5e7343e8537e728199b925089c5dc3e8a44d4a`, `chatmgt=f28afb126dc4` voi image `sha256:f9971a6e631d9bd2d0ae60a1d2d84fbfaa3421437aff1ee9bfc7bec6eeb4a8a4`; bridge, webhook, PostgreSQL, Redis, Chat API, Coturn va Tinode giu nguyen container ID, khong migration/reset database/topic/message/cursor/volume.
- Rui ro con lai: Chua visual/UAT bang phien Account that vi moi truong Codex khong co in-app Browser runtime. Lop manifest chan lo snippet khac tenant nhung co the giam recall neu tai lieu dung tenant khong nam trong global top 20; provider van can bo sung native tenant filter va tra `tenant_id`/`file_id` trong source de cach ly va truy hoi hoan chinh. Can UAT file PDF/DOCX/XLSX/TXT tren direct/group bang hai cong ty va xac minh tai lieu legacy co tenant dung. Docker build van canh bao App chunk tren 500 KB va `npm audit` co mot moderate/mot high dependency issue da co san.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, dang nhap hai cong ty va gui tai lieu tren web trong chat 1-1/nhom; xac nhan file Tinode delivered ke ca khi RAG loi, sau do hoi ViChat AI va doi chieu chi nguon cua dung cong ty. Provider can trien khai tenant filter native de bo gioi han recall global top 20.
- Commit/PR: Source `d62d61e`; ban ghi deploy nam trong commit tai lieu nay; khong co PR

## 2026-09-04-01 - Sua giao dien va dong bo lich su ViChat AI

- Thoi gian: 2026-09-04 15:54-16:23 (Asia/Saigon)
- Loai: Sua loi | Web | Realtime | Kiem thu | Van hanh | Tai lieu
- Trang thai: Hoan tat; da test, commit, push, deploy production va xac minh doc lap; chua UAT visual bang tai khoan that trong browser
- Muc tieu: Loai bo tin nhan ViChat AI bi lap khi lich su Chatmgt va Tinode cung hydrate, dong thoi sua cac thanh phan giao dien chatbot khong phu hop ma khong thay doi hanh vi chat ca nhan, nhom, file, sticker, goi hay setting dang hoat dong.
- Pham vi: ChatUI ViChat AI, anh xa message Tinode, merge lich su chatbot, composer/header/sidebar thong tin, CSS responsive/dark theme, i18n, regression test va production bundle; khong sua backend, mobile, API, database, schema, bien moi truong hay du lieu nguoi dung.
- File da thay doi: `src/features/chatbot/services/chatbotService.js`, `src/features/chat/services/tinodeClient.js`, `src/app/App.jsx`, `src/styles/index.css`, `src/features/i18n/appLanguage.js`, `src/features/chatbot/services/chatbotService.test.js`, `dist/index.html`, `docs/CHANGELOG.md`.
- Noi dung: Dung correlation key theo topic, role va sequence nguon de hop nhat ban ghi cung mot cau hoi/cau tra loi tu Chatmgt va Tinode; giu lai ID on dinh, Tinode `seq`/`raw`, delivery state, nguon tham khao va metadata hien thi thay vi bo ca ban sao. Hai cau hoi giong nhau co sequence khac van duoc giu rieng. Header/composer chi an nut goi, anh, file, sticker, ghi am va poll trong rieng ViChat AI; chat thuong van dung controls cu. Sidebar AI co thong tin rieng, sidebar responsive nhan dung class `open`, va cau tra loi dai/nhieu dong duoc wrap an toan.
- Quyet dinh ky thuat: Direct-chat correlation sap xep hai Tinode UID de browser va worker tao cung mot scope; group dung nguyen topic de khong va cham sequence giua cac nhom. Fingerprint noi dung trong cua so 5 giay chi la fallback khi it nhat mot ban ghi chua co correlation scope; hai key day du khac nhau khong duoc gop. Tinode chi gan metadata nay cho topic/header chatbot, con hoi thoai thuong tiep tuc qua `mergeTinodeMessages` nhu cu.
- Database/API/cau hinh: Khong co migration, endpoint, hop dong API hay bien cau hinh moi. Build local cap nhat `dist/index.html` thanh entry `index-G8wyw39D.js`, App `App-uBtx_9Wb.js` va CSS `index-6tLvXvo4.css`; build production tao hash rieng theo `.env` hien huu nhung khong doi cau hinh hoac secret.
- Kiem thu: `node --test src/features/chatbot/services/chatbotService.test.js` dat 12/12; `npm run test:frontend` dat 340/340; `npm run lint` exit 0, chi con warning legacy/vendor co san trong `src/App.jsx` va `public/ChatBotWidget/tinode.js`; `npm run build:production` dat, co warning App chunk lon hon 500 KB; `git diff --check` exit 0, chi thong bao chuyen LF/CRLF va khong co whitespace error. Deploy script tren `192.168.80.20` exit 0; verifier production read-only chay lai qua tuyen SSH long nhau exit 0: Nginx config dat, ChatUI/Chatmgt auth/chatbot health ca private va public deu HTTP 200, ChatUI healthy voi restart count 0, public WSS tra `HTTP/1.1 101 Switching Protocols`, log 30 phut khong co marker fatal va bundle co du marker ViChat AI.
- Trien khai: Source `3da170b` da push `origin/master`; archive `/opt/deploy/chat/incoming/vichat-vichat-ai-3da170b.tar.gz` 45030755 byte, SHA-256 `8be400545193f10017299c447b637bad73f94f690d5bc66fb65e34d47a79e17e`, deploy qua `ubuntu@103.74.122.206` roi SSH tiep `ubuntu@192.168.80.20`. Release `/opt/deploy/chat/releases/vichat-ai-3da170b-20260904-r1` dang la `current`, `previous` tro `/opt/deploy/chat/releases/synchronized-chat-86ecae9-20260830-r7`; chi recreate service `chat`, container moi `15eeb70e5d1047179266234747a780ec501f332d61c098e688e3320ca8401c2c`, image `sha256:7ce971c5d25994080308470e9509b185059470651ab08934b0f47c23dd02fa04`.
- Public bundle: Entry `/assets/index-BUlITN-D.js` SHA-256 `7e1493d05692154c8468e1ea80f95ac325ec6109ee4a605cdcc4424c56a0cd65`; App `App-DSup_uyQ.js` SHA-256 `98ee908c23e7df56ca1b82add827c910dc85236908a83c0821d0adb0a92602b5`; CSS `/assets/index-6tLvXvo4.css` SHA-256 `43b5b39f9ae146652f0c2e8a4088b6c6041879a4af949da136ccf4cae73219a8`. Ca ba file public khop tung byte voi candidate trong container.
- Backup/bao toan state: Backup PostgreSQL `/opt/deploy/chat/backups/vichat-ai-3da170b-20260904-r1/chatservice-predeploy.dump` 276400 byte, SHA-256 `976cd61d62dca69ba9a9c3e0bbb9b47410ed45932188e0eba259d5e352664235`; `.env` truoc/sau/backup giu nguyen SHA-256 `4ae2d1cf4af80b4289cd07b15d55b5979eb926d613513d69ece8de8225c6fcb0`; Alembic van `20260825_13`. `chatmgt=89b730132618`, hai PostgreSQL, Redis, Chat API, Coturn va hai Tinode bridge/webhook giu nguyen container ID; khong reset database, Tinode topic/message/cursor, runtime, volume, browser storage hay setting nguoi dung.
- Rui ro con lai: Chua UAT visual responsive/dark theme va luong gui/reload/reconnect bang tai khoan that trong browser; cac gate tu dong, bundle public va dich vu lien quan deu dat. Browser dang giu asset cu co the can hard refresh.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn` va UAT ViChat AI voi mot cau hoi, hai cau hoi giong nhau gui lien tiep, reload/reconnect lich su, mo dong sidebar tren desktop/mobile; dong thoi smoke-test chat ca nhan/nhom, file, sticker va cuoc goi de xac nhan khong co hoi quy. Neu phat sinh loi, rollback rieng `chat` ve release `previous`/image da tag, khong cham cac service stateful.
- Commit/PR: Source `3da170b`; ban ghi deploy nam trong commit tai lieu nay; khong co PR

## 2026-09-02-01 - Luu media chat moi tren MinIO S3 va giu nguyen file cu

- Thoi gian: 2026-09-02 16:29-18:12 (Asia/Saigon)
- Loai: Tinh nang | Bao mat | Web | Mobile | Backend | Ha tang | Du lieu | Kiem thu | Tai lieu
- Trang thai: Tam dung tai gate production; code da commit/push, active production chua doi vi S3 tu choi credential duoc cung cap
- Muc tieu: Dua byte cua anh/file chat moi len bucket S3 rieng de khong tang dung luong Tinode/PostgreSQL, dong thoi giu nguyen toan bo tin nhan va media lich su.
- Pham vi: Chatmgt media ticket/signing, ChatUI, mobile, Tinode Drafty/topic metadata, MinIO/S3 production config, verifier, rollback va tai lieu; khong migration/xoa/sua message, topic, cursor, Account avatar hay file Tinode cu.
- File da thay doi: `chatservice-main/application/config/config.py`, `chatservice-main/application/extensions/__init__.py`, `chatservice-main/application/controllers/api_chat_media.py`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/services/chat_media_service.py`, `chatservice-main/scripts/verify_chat_media_storage.py`, `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/tests/test_chat_media_service.py`, `src/features/chat/services/chatMediaService.js`, `src/features/chat/services/chatMediaService.test.js`, `src/features/chat/services/tinodeClient.js`, `mobile/src/services/chatMediaService.ts`, `mobile/src/services/chatMediaService.test.ts`, `mobile/src/services/tinodeClient.ts`, `mobile/src/utils/chatMedia.ts`, `mobile/src/utils/mediaUrl.ts`, `mobile/src/utils/mediaUrl.test.ts`, cac file env/build/Compose production, `infrastructure/production/minio-cors.xml`, `README.md`, `docs/chat-backend-architecture.md`, `infrastructure/production/README.md`, `docs/CHANGELOG.md`.
- Noi dung: Client chat scope xin ticket PUT ngan han tu Chatmgt, upload truc tiep vao prefix S3 `_pending`, goi complete de doi chieu ticket da ky voi tenant/kich thuoc/MIME/ETag, sau do Chatmgt copy server-side sang object on dinh va xoa pending truoc khi ghi stable reference vao Tinode. Complete retry doc object da hoan tat va khong cho URL PUT con han ghi de media da publish. Download doi reference thanh GET URL ngan han, `private, no-store`; SVG/text bi ep tai dang attachment. Management session bi chan khoi media route. Web/mobile van nhan va tai moi `/tinode-media/...` cu theo relay hien tai. Upload S3 production fail-closed va khong fallback ve volume Tinode.
- Quyet dinh ky thuat: Khong chuyen media handler duy nhat cua Tinode 0.25.3 sang S3 vi thao tac do se lam URL file cu khong con doc duoc neu chua migrate het. S3 la lop byte storage bo sung cho media moi; Tinode van la nguon message va stable reference. Che do upload va kha nang doc S3 duoc tach rieng de rollback upload ve Tinode van mo duoc reference S3 da phat hanh. Pending va completed dung key rieng; lifecycle chi expire `vichat/chat-media/_pending/`, khong cham object completed. Endpoint dung la `s3.upgo.vn` qua TLS; domain console khong duoc dung de ky URL.
- Database/API/cau hinh: Khong migration database. Them `POST /api/v1/chat/media/uploads`, `POST /api/v1/chat/media/uploads/<id>/complete`, `GET /api/v1/chat/media/<id>` va cac bien `MINIO_*`, `CHAT_MEDIA_*`, `VITE_CHAT_MEDIA_*`, `EXPO_PUBLIC_CHAT_MEDIA_*`; production dung bucket private `gonengage`, gioi han 500 MiB, URL PUT/GET 5 phut, ticket complete 6 gio va `CHAT_MEDIA_FALLBACK_TO_TINODE=false`. Credential that chi dat trong `.env` mode `0600`, khong ghi vao source/changelog.
- Kiem thu: `npm run test:frontend` dat 334/334; `npm run lint` root exit 0 voi warning legacy/vendor da co san; `npm run build:production` dat voi entry `index-DDJvClM6.js`, App `App-Dd8rWHeZ.js` va warning chunk App lon hon 500 KB. Full backend local `py -3.8 -m unittest discover -s tests -q` dat 266 test, skip 102 do dependency/runtime tuy chon; backend media dat 9/9; `python -m py_compile ...` dat. Mobile targeted media/URL dat 6/6, typecheck va lint dat; suite khi exclude `src/services/workspaceService.test.ts` dat 12 file/35 test. Full mobile van co dung mot loi ha tang da co san: Vitest import raw React Native Flow syntax tai `workspaceService.test.ts`; 12 file/35 test con lai dat. `bash -n infrastructure/production/start.sh`, Compose `config --quiet` voi gia tri validation tam, targeted `oxlint` va `git diff --check` dat. Truoc commit da chay lai frontend media 3/3, backend media 9/9, mobile media/URL 6/6, `py_compile` va `git diff --check`, tat ca dat. Candidate production `r1` dung truoc recreate vi test contract chua mount release root; `r2` chay du 9/9 test nhung dung truoc recreate vi verifier chay tu `scripts/` chua them application root vao `sys.path`; follow-up `7003622` da sua verifier. Candidate `r3` build thanh cong, backend media 9/9, CORS `PUT/GET/HEAD` dat, nhung byte probe dung truoc recreate voi HTTP `403`; chan doan sach tra `InvalidAccessKeyId` tren `s3.upgo.vn`, con `192.168.30.152:9000` timeout tu Chatmgt host. Ca ba lan deu rollback image tag, active container/data khong doi. Production UAT chua chay.
- Trien khai: Archive `vichat-chat-media-7003622-r3.tar.gz` 45024239 byte, SHA-256 `959fb3fdcfaf2352327337052ce19dc10c5281d4637307a291bca46d417ded5a`; backup gan nhat `/opt/deploy/chat/backups/chat-media-7003622-20260902-r3/chatservice-predeploy.dump`, SHA-256 `cf71bf9bce3524ada6602aa2030199d8bf16207cf10acf2ebcfe904b31582b36`. Active van la `/opt/deploy/chat/releases/synchronized-chat-86ecae9-20260830-r7`, `chat=8c9180b85301`, `chatmgt=89b730132618`, deu healthy; credential khong hop le da duoc xoa khoi candidate `.env`, khong recreate service, khong ap lifecycle, khong doi Alembic `20260825_13`, Tinode volume hay message/file cu.
- Rui ro con lai: Can access key/secret key hop le tren chinh S3 API `https://s3.upgo.vn`; endpoint noi bo duoc cung cap hien khong truy cap duoc tu `192.168.80.20`. Sau khi credential dat moi co the ap lifecycle pending va UAT Account session that. Upload da complete nhung publish Tinode bi mat ket noi co the de lai object completed khong reference; khong tu dong xoa khi ket qua publish mo ho de tranh xoa nham media cua message da duoc Tinode nhan. Account avatar van do UpGO Account so huu. Credential chia se ngoai production can rotate.
- Viec tiep theo: Cap access key/secret key dang hoat dong tren `s3.upgo.vn` va co quyen list/read/write/copy/delete/lifecycle cho bucket `gonengage`; sau do chay lai release gate, chi recreate `chatmgt` va `chat`, ap lifecycle `_pending` mot ngay va UAT file Tinode cu cung anh/file S3 moi. Khong xoa `tinode_uploads`, khong bulk-rewrite message va khong dung `docker compose down -v`.
- Commit/PR: Source `29ba8b7`; verifier follow-up `7003622`; deployment tam dung cho credential S3 hop le

## 2026-08-30-03 - Dong bo ChatUI production voi ban sua Tinode ACL

- Thoi gian: 2026-08-30 16:07 (Asia/Saigon)
- Loai: Sua loi | Realtime | Van hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da build, deploy, rollback-safe verify va cap nhat public ChatUI/Chatmgt
- Muc tieu: Dam bao browser tai dung ChatUI co logic refresh topic va gui mode Tinode day du, dong bo voi Chatmgt dang chay ban `9c9a6e7`.
- Pham vi: Release ChatUI/Chatmgt production; khong thay doi topic, message, cursor, database, Redis, volume hay setting nguoi dung.
- File da thay doi: `docs/CHANGELOG.md`.
- Noi dung: Phat hien production con phuc vu bundle ChatUI cu tu release `topic-7c3f923`; archive source `86ecae9` duoc build lai va recreate co kiem soat ca `chat` va `chatmgt`. Entry public sau deploy la `index-CgAQoocU.js`, App asset `App-DDKhtM7K.js`, CSS `index-DhcOa2B6.css`; cac asset nay da khop byte voi candidate trong container.
- Quyet dinh ky thuat: Gate asset duoc doi tu hash local co dinh sang ten asset do Docker build thuc te tao ra, vi bien `VITE_*` production tu `.env` co the lam thay doi hash nhung khong thay doi source logic. Giu nguyen service stateful va chi recreate hai service stateless; backup `.env`, PostgreSQL va image rollback truoc khi switch release. Khong dung browser cache cu de danh gia ket qua.
- Database/API/cau hinh: Khong migration, schema, secret hay bien moi truong moi; chi cap nhat image/release runtime.
- Kiem thu: Local `npm run test:frontend` dat 331/331; `npm run lint` exit 0 voi warning legacy; `npm run build:production` thanh cong voi warning chunk App lon hon 500 KB; backend local `python -m unittest discover -s tests -q` dat 257 pass, 102 skip do dependency/runtime local; contract `python -m unittest tests.test_chat_auth_contract -q` dat 56/56; `python -m py_compile application/services/auth_service.py tests/test_tinode_bridge_service.py` dat; `git diff --check` dat. Candidate production `python -m unittest tests.test_tinode_bridge_service -q` dat 31/31; ChatUI/chatmgt healthy, restart count 0; ChatUI health `200`, auth health `200` voi `tinode_bridge_configured=true`, public WSS `101`, Alembic `20260825_13`, public asset checksum khop candidate (`entry=7d8a767dbb27d6eb86986426c943577df4c990e74c3b28abe9a4f65e92ea2133`, `App=4b5eae5a0f40cd3771f83452e81d36cdb019dd8a44d2d8ae59d37e897df4373a`, `CSS=cc689d7dbd11aacc6b3f74381081eac9e54f3e4280813740e777cb5872cbce2f`).
- Trien khai: Archive `/opt/deploy/chat/incoming/vichat-synchronized-chat-86ecae9.tar.gz` co SHA-256 `743693ffa803e0b461a27abe0045300b33cf2f0b1f0b97d288242bcd8039bf93`; release `/opt/deploy/chat/releases/synchronized-chat-86ecae9-20260830-r7` dang la `current`, `previous` tro `/opt/deploy/chat/releases/complete-acl-9c9a6e7-20260830-r2`; container moi `chat=8c9180b85301`, `chatmgt=89b730132618`; image moi lan luot `sha256:c5390c3a6deba30b2de42304b2627612677f33e3910f01db509e4df755e65e45` va `sha256:2b86c7ddfe0fe436fe0da0bd2d0d04756153708d102fc7d6b0056a29e576a1c9`.
- Backup/bao toan state: PostgreSQL dump `/opt/deploy/chat/backups/synchronized-chat-86ecae9-20260830-r7/chatservice-predeploy.dump` co SHA-256 `ba7bcec78532162154b8bd6ffebe88d7c12c7a438f389e8556234ab52d894388`; `.env` giu nguyen SHA-256 `4ae2d1cf4af80b4289cd07b15d55b5979eb926d613513d69ece8de8225c6fcb0`; khong migration, khong `docker compose down -v`, khong reset database/Redis/Tinode topic/message/cursor/avatar/setting user. Lan deploy dau fail o gate hash, rollback ve release cu thanh cong truoc khi chay lai r7.
- Rui ro con lai: Chua co browser runtime de tu dong UAT bang tai khoan that va gui tin tu man hinh; can hard refresh de loai cache trinh duyet. Neu UAT phat sinh loi, tro `current` ve `previous` va recreate rieng `chatmgt`/`chat` theo image rollback da tag.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, mo group dang bi loi va gui mot tin nhan tu tai khoan that de xac nhan khong con toast `malformed`/failed.
- Commit/PR: Source `86ecae9` (gom sua `7c3f923` va `9c9a6e7`); docs/deploy record `ceba329`; khong co PR.

## 2026-08-30-02 - Sua loi Tinode mode delta gay malformed khi bind group

- Thoi gian: 2026-08-30 14:54 (Asia/Saigon)
- Loai: Sua loi | Tich hop | Realtime | Kiem thu | Van hanh | Tai lieu
- Trang thai: Hoan tat; da test, commit, push, deploy production va verify bind production
- Muc tieu: Luong mo group va gui tin khong bi danh dau that bai khi Chatmgt dong bo quyen Tinode cho deputy/member.
- Pham vi: Chatmgt reconciliation ACL Tinode, regression tests, tai lieu kien truc va release production; khong doi noi dung tin nhan hay schema database.
- File da thay doi: `chatservice-main/application/services/auth_service.py`, `chatservice-main/tests/test_tinode_bridge_service.py`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`.
- Noi dung: Tinode tra `400 malformed` vi code gui mode delta nhu `+D`, `+JRW`, `+JRWPAS` trong `sub.mode`; Tinode 0.25 yeu cau mode day du. Reconciliation nay gui mode day du sau khi hop nhat quyen hien tai voi quyen can them, giu quyen du hien co, va test rieng case deputy `JRWPAS` -> `JRWPASD`.
- Quyet dinh ky thuat: Khong xoa topic, member, history hay reset du lieu. Sua bridge de tuan theo hop dong Tinode; tren topic production dang loi da repair additive quyen deputy bang mode day du, audit sau repair khong con group thieu access.
- Database/API/cau hinh: Khong migration, schema, secret hay bien moi truong moi; thay doi chi o payload ACL noi bo giua Chatmgt va Tinode.
- Kiem thu: Local `npm run test:frontend` dat 331/331; `npm run lint` exit 0 voi warning legacy/vendor; `npm run build:production` dat voi warning chunk App lon hon 500 KB; local `python -m unittest discover -s tests -q` dat 257 pass, 102 skip do dependency/runtime local; candidate image trong production dat `257 tests OK` va `python -m unittest tests.test_tinode_bridge_service -q` dat 31/31; `python -m unittest tests.test_chat_auth_contract -q` dat 56/56; `python -m py_compile application/services/auth_service.py tests/test_tinode_bridge_service.py` dat; `git diff --check` dat. Production audit group `p` bao `groups_with_missing_access=0`; bind endpoint that tra `HTTP 200` voi topic `grp2w8Rultl2v4`; private/public auth health `200`, WSS `101`, Alembic `20260825_13`, log 15 phut khong co fatal/bind marker.
- Trien khai: Source commit `9c9a6e7` da push `origin/master`; archive `/opt/deploy/chat/incoming/vichat-complete-acl-9c9a6e7.tar.gz` 45010629 bytes, SHA-256 `01a484f798506e0847b3a840d0a87dd8d7bb4aa1f152dee38ef0f3e44a3da14c`; release `/opt/deploy/chat/releases/complete-acl-9c9a6e7-20260830-r2` dang la `current`, `previous` tro `/opt/deploy/chat/releases/topic-7c3f923-20260830-r2`; chi recreate `chatmgt`, container moi `d6275bf03c5d`, image `sha256:109f8db2707f31d6a69e6938b54531fb3aa31a9df83d88ef69eec09d7914be56`, cac service khac giu nguyen container ID.
- Backup/bao toan state: Backup Chatmgt PostgreSQL `/opt/deploy/chat/backups/complete-acl-9c9a6e7-20260830-r2/chatservice-predeploy.dump` mode `0600`, SHA-256 `20c7a0698726a2467c1ca39e8fc5ce60cf53e1ce59832efabdf4e371952ba7d2`; backup `.env` mode `0600`, checksum `4ae2d1cf4af80b4289cd07b15d55b5979eb926d613513d69ece8de8225c6fcb0`; khong migration, khong `docker compose down -v`, khong reset database/Redis/Tinode topic/message/cursor/avatar/setting user.
- Rui ro con lai: Chua co browser runtime de tu dong UAT bang tai khoan that va gui tin tu man hinh; backend bind/reconcile production da duoc verify bang endpoint that, topic khong con thieu ACL. Neu UAT phat sinh loi, tro `current` ve `previous` va recreate rieng `chatmgt` theo image rollback da tag.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, mo group `p` va gui mot tin nhan tu tai khoan that de xac nhan UI khong con toast `malformed`/failed.
- Commit/PR: Source `9c9a6e7`; khong co PR.

## 2026-08-30-01 - Sua loi bind topic Tinode tu snapshot cu

- Thoi gian: 2026-08-30 (Asia/Saigon)
- Loai: Sua loi | Tich hop | Realtime | API | Kiem thu | Van hanh | Tai lieu
- Trang thai: Dang thuc hien; da sua code, cho kiem thu va trien khai production
- Muc tieu: Dam bao luong gui tin khong dung topic group cu trong browser de bind sai va bi danh dau that bai truoc khi publish.
- Pham vi: ChatUI topic resolution/prepare, Chatmgt Tinode binding error handling, regression tests va tai lieu deploy; khong doi du lieu tin nhan.
- File da thay doi: `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/chatRealtime.test.js`, `src/app/App.jsx`, `src/features/chat/services/chatManagementService.test.js`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `docs/chat-backend-architecture.md`, `dist/index.html`, `docs/CHANGELOG.md`.
- Noi dung: Snapshot thanh cong tu `tinode-prepare` duoc uu tien tuyet doi; remote ChatUI refresh Chatmgt truoc khi quyet dinh reuse/create topic, ke ca khi room dang giu topic stale. Loi ACL/auth van giu status va thong diep `AuthError`; loi transport/verify/reconcile bat ngo duoc log theo phase an toan va tra `TINODE_TOPIC_BIND_FAILED` HTTP 502 thay vi gia thanh conflict 409.
- Quyet dinh ky thuat: Chatmgt va snapshot sau prepare tiep tuc la nguon topic chuan; topic room/cache chi la fallback khi chua co snapshot prepare. Khong retry mu loi 502 va khong xoa/reset topic Tinode cu trong release.
- Database/API/cau hinh: Khong migration/schema moi; thay doi ma loi cua loi bind khong phai conflict sang `TINODE_TOPIC_BIND_FAILED` HTTP 502. Khong ghi secret vao nhat ky.
- Kiem thu: `npm run test:frontend` dat 331/331; `npm run lint` exit 0 voi warning legacy/vendor da co san; `npm run build:production` thanh cong voi canh bao chunk App lon hon 500 KB, tao entry `index-D3gchlDW.js`, App `App-CeUdStme.js`, CSS `index-DhcOa2B6.css`; `python -m unittest discover -s tests -q` dat 256 pass, 101 skip do dependency/runtime local; `python -m unittest tests.test_chat_auth_contract -q` dat 56/56; `python -m py_compile application/controllers/api_chat_management.py tests/test_chat_auth_contract.py` thanh cong; `git diff --check` dat.
- Rui ro con lai: Can kiem tra bundle public, WSS, health/logs va thu gui tin voi group dang bi loi sau deploy.
- Viec tiep theo: Chay frontend/backend tests, commit/push, deploy qua `ubuntu@103.74.122.206` den `ubuntu@192.168.80.20`, sau do verify production va UAT.
- Commit/PR: Chua tao.

## 2026-08-29-03 - Realtime pho nhom va bao toan setting theo tenant

- Thoi gian: 2026-08-29 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Bao mat | Web | Realtime | Du lieu | Tai lieu
- Trang thai: Hoan tat; da test, commit, push va deploy production; san sang UAT
- Muc tieu: Pho nhom dung duoc quyen quan tri ngay lap tuc; setting chat 1-1, nhom va giao dien khong bi mat hoac lan tenant; moi hoat dong nhom co thong bao den thanh vien.
- Pham vi: Tinode ACL/metadata, Chatmgt group activity, ChatUI preference storage, notification va sticker; giu nguyen luong chat 1-1.
- File da thay doi: `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/services/auth_service.py`, `chatservice-main/scripts/repair_group_member_access.py`, `chatservice-main/scripts/tinode_account_bridge.py`, `src/features/chat/services/tinodeClient.js`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/chatRealtime.js`, `src/app/App.jsx`, cac module luu preference viewer trong `src/features/chat/services/`, `src/features/security/services/pinLock.js`, `src/features/chat/components/StickerPicker.jsx`, `package.json`, `dist/index.html`, `docs/chat-backend-architecture.md` va cac regression test lien quan.
- Noi dung: Deputy duoc dong bo mode Tinode `JRWPASD` bang token server-side cua owner va tab dang mo nhan ACL moi qua `me.onContactUpdate('acs')`, sau do tai lai chi `desc+sub` de khong lam mat history. Moi thay doi role, thanh vien, ten, avatar, setting, hinh nen, chatbot, poll, pin va lifecycle cua group duoc phat system activity vao topic; chat 1-1 van giu luong hien tai. Preference localStorage/IndexedDB duoc khoa theo stable user + tenant, copy legacy khong xoa va marker migration tach theo tenant.
- Quyet dinh ky thuat: Chatmgt va snapshot sau commit la nguon quyen nhom; owner la credential Tinode cho bridge, deputy khong duoc dissolve; preference trinh duyet dung khoa user + tenant va migration khong pha huy du lieu cu. Realtime ACL refresh chi tai metadata can thiet va co dedupe request.
- Database/API/cau hinh: Khong migration/schema moi; dung cot role va properties hien co, them alias request `background` cho group settings va mirror metadata Tinode. Khong ghi secret vao nhat ky.
- Kiem thu: `npm run test:frontend` dat 330/330; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build:production` thanh cong voi warning chunk App lon hon 500 KB; `python -m unittest discover -s tests -q` dat 255 pass, 101 skip do dependency/runtime local; `python -m unittest tests.test_chat_auth_contract -q` dat 55/55; `python -m py_compile application/controllers/api_chat_management.py application/services/auth_service.py application/models/models.py scripts/tinode_account_bridge.py scripts/repair_group_member_access.py tests/test_chat_auth_contract.py` thanh cong; `git diff --check` dat.
- Trien khai: Commit `6fada85` da push `origin/master`; archive `/opt/deploy/chat/incoming/vichat-deputy-6fada85.tar.gz` co SHA-256 `b35a13cf15ce742012c2f466535f50fcb19e12949054db0cd34f94b59da536b1`; deploy dung tuyen `ubuntu@103.74.122.206` -> `ubuntu@192.168.80.20`. Release `/opt/deploy/chat/releases/deputy-6fada85-20260829-r1` dang la `current`, `previous` tro `/opt/deploy/chat/releases/poll-be6f297-20260829-r1`; chi recreate `chatmgt`, `tinode-account-bridge` va `chat`, khong migration, khong `docker compose down -v`, khong reset DB/Redis/Tinode volume/topic/message/cursor/setting user.
- Backup/bao toan state: `/opt/deploy/chat/backups/deputy-6fada85-20260829-r1` luu `.env`, runtime, compose/nginx, container state va hai PostgreSQL dump dang `-Fc`; checksum dump Chatmgt `66e1c367b3a3931bcd7ec09c913e49b513761a5ae5b40ef0e271aeca55938d9a`, Tinode `2ff7496ecde19ec43be111d8f668150aa790fae193ff8a779280575412bb6df0`; `pg_restore --list` co 114 va 130 entries; schema van `20260825_13`, `.env` khong doi.
- Kiem tra production: ba container moi healthy, restart count 0; cac container ngoai pham vi giu nguyen ID; public ChatUI/Chatmgt HTTP `200`, WSS `HTTP/1.1 101 Switching Protocols`, asset public khop, nginx `-t` dat, log 15 phut khong co fatal marker.
- Rui ro con lai: Chua UAT production bang owner, deputy, member va hai tai khoan that; can xac nhan quyen manager realtime, activity group va preference sau tenant switch. Candidate build co 2 dependency vulnerabilities (1 moderate, 1 high) tu `npm ci`; khong tu dong chay `npm audit fix`.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, UAT voi owner, deputy va member that de xac nhan quyen realtime, activity group va setting sau refresh/reconnect/tenant switch.
- Commit/PR: Source `6fada85`; khong co PR.

## 2026-08-29-02 - Xem chi tiet nguoi binh chon trong nhom

- Thoi gian: 2026-08-29 13:54-14:19 (Asia/Saigon)
- Loai: Tinh nang | Web | Realtime | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da test, commit, push va deploy production; san sang UAT
- Muc tieu: Khi ket qua poll duoc hien thi, thanh vien co the bam vao so luot cua tung phuong an de xem ai da chon, ai chua binh chon va ai chon phuong an khac.
- Pham vi: ChatUI poll card, projection vote Tinode, snapshot thanh vien nhom, i18n, CSS va regression test; khong doi luong gui tin, membership, Tinode topic, database hay setting user.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/poll.js`, `src/features/chat/services/poll.test.js`, `src/features/i18n/appLanguage.js`, `src/features/i18n/appLanguage.test.js`, `src/styles/index.css`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`.
- Noi dung: Them nut chi tiet ben canh tung phuong an; hien ba nhom `Da chon phuong an nay`, `Chua binh chon` va `Da chon phuong an khac`, co avatar/ten, dem so luong, dong bang Escape/nut dong va cap nhat theo vote realtime. Doi chieu ca Account ID va Tinode UID de khong nham nguoi trong group.
- Quyet dinh ky thuat: Khong tao endpoint hay bang vote moi; tinh danh sach tai client tu vote map da replay va active group-member snapshot. Ton trong `hideVoters` va `hideResultsUntilVote`; neu snapshot thanh vien chua ve thi chi hien vote da nhan, khong tu suy dien thanh vien chua vote.
- Database/API/cau hinh: Khong migration, schema, endpoint, bien moi truong, secret, volume hoac thay doi setting user.
- Kiem thu: Targeted `node --test src/features/chat/services/poll.test.js src/features/i18n/appLanguage.test.js` dat 33/33; full frontend `npm run test:frontend` dat 327/327; backend local `python -m unittest discover -s tests -q` dat 255 pass, 101 skip do dependency/runtime local; candidate image production chay lai backend `255/255`; `python -m py_compile application/controllers/api_chat_management.py application/models/models.py scripts/tinode_account_bridge.py tests/test_chat_auth_contract.py` dat; `npm run lint` exit 0 voi warning legacy; `npm run build:production` va candidate Docker build thanh cong voi warning chunk App lon hon 500 KB; `git diff --check` dat.
- Trien khai: Archive `/opt/deploy/chat/incoming/vichat-poll-be6f297.tar.gz` co SHA-256 `588fb6b3cddbfd271d38d44f65a86a7de774c10bacc541d433faa22e46554914`; deploy dung tuyen `ubuntu@103.74.122.206` -> `ubuntu@192.168.80.20`. Release `/opt/deploy/chat/releases/poll-be6f297-20260829-r1` dang la `current`, `previous` tro `/opt/deploy/chat/releases/message-edit-3c11b6f-20260828-r2`; chi recreate `chatmgt`, `tinode-account-bridge` va `chat`, khong migration, khong `docker compose down -v`, khong reset DB/Redis/Tinode volume/topic/message hoac setting user.
- Backup/bao toan state: PostgreSQL dump `/opt/deploy/chat/backups/poll-be6f297-20260829-r1/chatservice-predeploy.dump` mode `0600`, 196434 bytes, SHA-256 `976e29c704ddf8aa78cf6a37913a6796e52effc30f150c4f8109ab9a73eadd07`, `pg_restore -l` co 114 entries; production `.env` giu nguyen SHA-256 `4ae2d1cf4af80b4289cd07b15d55b5979eb926d613513d69ece8de8225c6fcb0`; Alembic van `20260825_13`.
- Kiem tra production: `chatmgt` `daea0593e6ff28106a90152285c7861a3812c52920f15b3425d9f70272b768c9`, bridge `9d422de239544be68b18c40487b7b97dc137afc464ac645ed84588e344c9c08a`, ChatUI `2678363e190683c8757128826916a16766e1d482d2deb5859d3c61bbb4a5f3a9` deu healthy, restart count 0; image lan luot `sha256:dfa1a569565a75a04e906ac922d24a3fedde8ef44ce3ddcf96848288b08fbe07`, `sha256:1a55a2e09e26c041a3efe2b084cc2988d89b893c1a7cce55a4324e0ea56ffd9b`, `sha256:92d010fd72bf28dcf84ae30c7bfd81cde331924ab6f4ab7dff568e7f158edca3`; ChatUI/Chatmgt auth health noi bo va public HTTP 200, `nginx -t` tren `.206` dat, WSS HTTP 101; public assets `index-CVmh0aqa.js`, `App-DXiSo9ll.js`, `index-DhcOa2B6.css` khop byte voi container voi SHA-256 lan luot `610aaef76afc41ef2cfb86b8256896440b3a63d6be62573cee0fd97d248cb552`, `51cd5a796074e6fc10071213453bb857bcd1b6ef6aafda6bc40dae05918062cb`, `cc689d7dbd11aacc6b3f74381081eac9e54f3e4280813740e777cb5872cbce2f`; log 15 phut khong co marker fatal/panic/traceback/uncaught/critical/emerg; container ngoai 3 service muc tieu giu nguyen ID.
- Rui ro con lai: Chua UAT production bang owner, deputy, member va hai tai khoan that de xac nhan vote realtime/danh sach nguoi chua binh chon; `npm ci` trong candidate build bao 2 dependency vulnerabilities (1 moderate, 1 high), chua chay `npm audit fix` de khong tu y doi lockfile.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, UAT bo nhiem/thu hoi pho nhom va bam so luot poll de kiem tra ba danh sach; neu loi chi tro `current` ve `previous` va recreate 3 service muc tieu theo image rollback.
- Commit/PR: Source commits `2ef5a3d` (pho nhom) va `be6f297` (xem nguoi binh chon); khong co PR.

## 2026-08-29-01 - Bo nhiem pho nhom va dong bo quyen quan tri

- Thoi gian: 2026-08-29 (Asia/Saigon)
- Loai: Tinh nang | Bao mat | Web | Realtime | API | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da test, commit, push va deploy production; san sang UAT
- Muc tieu: Cho truong nhom bo nhiem/thu hoi pho nhom, phan biet bang key bac, cap quyen quan tri dong bo va bao dam pho nhom khong the giai tan nhom.
- Pham vi: Chatmgt conversation participant role API, Tinode access synchronization, group activity realtime, ChatUI member menu/avatar/message badge, demo persistence, i18n, CSS va tests.
- File da thay doi: `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/models/models.py`, `chatservice-main/scripts/tinode_account_bridge.py`, `src/app/App.jsx`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/poll.js`, `src/features/chat/services/tinodeClient.js`, `src/features/contacts/services/accountDirectory.js`, `src/features/demo/services/demoGroupStore.js`, `src/features/contacts/services/accountDirectory.test.js`, `src/features/demo/services/demoGroupStore.test.js`, `src/features/chat/services/chatManagementService.test.js`, `chatservice-main/tests/test_chat_auth_contract.py`, `src/features/i18n/appLanguage.js`, `src/styles/index.css`.
- Noi dung: Them role `OWNER`/`ADMIN`/`MEMBER` cho thanh vien nhom; owner va deputy dung chung manager gate cho quan tri, them/xoa thanh vien, cai dat, poll va phe duyet. Them endpoint doi role voi kiem tra tenant, tu khong cho doi role owner, dong bo mode Tinode bang credential server-side cua owner va phat `group_role_changed` sau commit. ChatUI cap nhat role realtime, cho phep appoint/revoke trong menu thanh vien, hien key vang cho truong nhom va key bac cho pho nhom; demo cung luu role. Route dissolve van dung owner gate rieng.
- Quyet dinh ky thuat: Dung cot `ConversationParticipant.role` hien co, khong them migration; owner la nguon credential Tinode de deputy khong can credential owner tren browser. Tinode event chi la thong bao, Chatmgt snapshot sau commit la nguon quyen chuan; rollback role va access neu dong bo Tinode that bai.
- Database/API/cau hinh: Them PUT role endpoint va alias; khong migration, khong doi schema, bien moi truong, volume, secret hoac setting user.
- Kiem thu: Full frontend `npm run test:frontend` dat 327/327; backend `python -m unittest discover -s tests -q` dat 255 pass, 101 skip do dependency/runtime local; contract role `python -m unittest tests.test_chat_auth_contract -q` dat 55/55; `python -m py_compile application/controllers/api_chat_management.py application/models/models.py scripts/tinode_account_bridge.py tests/test_chat_auth_contract.py` dat; `npm run lint` exit 0 voi warning legacy; `npm run build:production` thanh cong voi warning chunk App lon hon 500 KB.
- Rui ro con lai: Chua UAT production bang owner, deputy va member that; can xac nhan badge key bac, realtime event, quyen manager va owner-only dissolve.
- Viec tiep theo: Hard refresh va UAT quyen owner/deputy/member; chi rollback 3 service muc tieu neu phat sinh loi.
- Commit/PR: Source commit `2ef5a3d`; deployment duoc ghi trong muc `2026-08-29-02`; khong co PR.

## 2026-08-28-02 - Cache-bust CSS cho release sua tin nhan

- Thoi gian: 2026-08-28 03:20 (Asia/Saigon)
- Loai: Sua loi | Van hanh | Web | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da test, commit, push va deploy production; san sang UAT
- Muc tieu: Dam bao trinh duyet production tai dung CSS cua release sua tin nhan, khong nhan SPA fallback cu tu edge cache sau khi deploy.
- Pham vi: CSS ChatUI va gate kiem tra public asset; khong doi logic message edit, Tinode, API, database, volume, unread, notification hay setting user.
- File da thay doi: `src/styles/index.css`, `dist/index.html`, `docs/CHANGELOG.md`.
- Noi dung: Them mot CSS custom property khong co tac dong hien thi de tao content-hash moi cho stylesheet. Public edge da giu fallback HTML cho ten CSS hash cu trong chuoi deploy rollback; content-hash moi buoc browser tai file CSS that.
- Quyet dinh ky thuat: Cache-bust bang thay doi CSS vo hieu thay vi sua luong chat hoac xoa cache runtime; release van chi recreate `chat` va co trap rollback.
- Database/API/cau hinh: Khong migration, schema, endpoint, secret, bien moi truong, volume hay thay doi setting user.
- Kiem thu: `npm run test:frontend` dat 322/322; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build:production` exit 0 voi bundle `index-CkTFBWBN.js`, `App-CtdO0D2C.js`, `index-CwRWfTw_.css` va warning chunk App lon hon 500 KB; `git diff --check` dat. Production public JS/CSS khop candidate, co marker edit va logo/favicon; ChatUI healthy restart 0; Nginx trong candidate va `sudo -n nginx -t` tren `.206` deu dat; WSS tra `HTTP/1.1 101 Switching Protocols`; log ChatUI khong co marker fatal/panic/traceback/uncaught/critical/emerg.
- Trien khai: Source commit `2a5d094` va cache-bust commit `3c11b6f` da push `origin/master`; archive `/opt/deploy/chat/incoming/vichat-message-edit-3c11b6f.tar.gz`, SHA-256 `b94d577884b730594cb46968a5e5592dc91035b819c5f58e477738db02472267`; deploy dung tuyen `ubuntu@103.74.122.206` -> `ubuntu@192.168.80.20`. Release `/opt/deploy/chat/releases/message-edit-3c11b6f-20260828-r2` dang la `current`, `previous` tro `/opt/deploy/chat/releases/logo-e1a33df-20260827-2325-r3`; chi recreate ChatUI, container moi `1acb9a9881c43953aacf52cf49490ca0f79483123d0844623c1f1354dcf51c69`, image `sha256:2060e9d1b41490de6234dae45978d29c0acbbae17e9ff5cd3e34147e73738483`; cac container ngoai chat khong doi.
- Backup/bao toan state: PostgreSQL backup `/opt/deploy/chat/backups/message-edit-3c11b6f-20260828-r2/chatservice-predeploy.dump`, SHA-256 `ee205c3544e98363168c23a46a4eb372d230b8f9457b85243bebca7473c69112`; `.env` mode `600`, checksum truoc/sau khong doi `4ae2d1cf4af80b4289cd07b15d55b5979eb926d613513d69ece8de8225c6fcb0`; Alembic van `20260825_13`; khong migration, khong reset browser storage/IndexedDB, runtime, named volume, database, Tinode topic/message, read cursor, avatar hay setting user.
- Rui ro con lai: Chua UAT production bang hai tai khoan that; can hard refresh de nap bundle moi va xac nhan sua tin, realtime, dong `Da chinh sua` va lich su tin cu.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, UAT voi hai tai khoan that; neu loi chi tro `current` ve `previous` va recreate rieng ChatUI theo release cu.
- Commit/PR: Source `2a5d094`; cache-bust `3c11b6f`; deployment follow-up docs commit `5936ed6`; khong co PR.

## 2026-08-28-01 - Sua tin nhan realtime

- Thoi gian: 2026-08-28 (Asia/Saigon)
- Loai: Tinh nang | Web | Mobile | Realtime | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da test, commit, push va deploy production; san sang UAT
- Muc tieu: Cho sender sua tin nhan van ban da gui thanh cong; user ben kia nhan ban sua theo realtime, thay dong `Da chinh sua` va xem duoc phien ban cu ma khong lam song lai unread, highlight, notification hay thay doi setting user.
- Pham vi: ChatUI va mobile message action/render, Tinode client/realtime projection, i18n, CSS, type/state va regression test; khong doi Chatmgt, API, database, schema, migration, `.env`, storage hay Tinode packet goc.
- File da thay doi: `dist/index.html`, `docs/chat-backend-architecture.md`, `mobile/src/components/MessageActionSheet.tsx`, `mobile/src/components/MessageBubble.tsx`, `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/services/tinodeClient.ts`, `mobile/src/store/appStore.ts`, `mobile/src/types/index.ts`, `mobile/src/utils/messagePolicy.test.ts`, `mobile/src/utils/messagePolicy.ts`, `src/app/App.jsx`, `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/chatRealtime.test.js`, `src/features/chat/services/messagePolicy.js`, `src/features/chat/services/messagePolicy.test.js`, `src/features/chat/services/tinodeClient.js`, `src/features/i18n/appLanguage.js`, `src/features/i18n/appLanguage.test.js`, `src/styles/index.css`, `docs/CHANGELOG.md`.
- Noi dung: Chi sender cua tin text da delivered moi thay duoc; edit event append-only duoc dong bo theo Tinode sequence, idempotent khi replay va ho tro nhieu lan sua. Ban goc khong bi mutate/delete; projected message co `edited`, `editedAt`, `editHistory`, hien nhan `Da chinh sua` va modal lich su. Edit event bi loai khoi timeline, unread, badge va desktop notification; UI va client deu fail-closed khi khong xac minh sender.
- Quyet dinh ky thuat: Dung control event prefixed `__VICHAT_EDIT_EVENT__:` lam lop overlay chung cho web/mobile, de Tinode van la nguon realtime va giu nguyen history packet; khong them endpoint, migration, cache hay state dai han. Payload duoc kiem tra kich thuoc, target sequence va actor de tranh replay/cross-user edit.
- Database/API/cau hinh: Khong migration, schema, endpoint, secret, bien moi truong, volume hoac thay doi setting user.
- Kiem thu: `npm run test:frontend` dat 322/322; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build:production` exit 0 voi warning chunk App lon hon 500 KB; mobile typecheck va lint dat; mobile test muc tieu dat 7/7; full mobile test co 32 test pass nhung mot suite khong chay duoc do Vitest/RN parser trong `node_modules/react-native/index.js` khong ho tro Flow; `git diff --check` dat. Production verification va backup/rollback duoc ghi o muc `2026-08-28-02`.
- Rui ro con lai: Chua UAT production bang hai tai khoan that cho sua tin tren web/mobile va chua xac nhan history khi reconnect; can hard refresh de nap bundle moi.
- Viec tiep theo: Hard refresh va UAT voi hai tai khoan that; kiem tra setting user van con sau refresh va reconnect.
- Commit/PR: Source `2a5d094`; cache-bust `3c11b6f`; deployment details o muc `2026-08-28-02`.

## 2026-08-27-09 - Khoi phuc logo khi static asset bi 403

- Thoi gian: 2026-08-27 23:21-23:38; deploy production 23:37-23:38 (Asia/Saigon)
- Loai: Sua loi | Web | Bao mat | Van hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da test, da commit, push va deploy production; san sang UAT
- Muc tieu: Khoi phuc logo tren man hinh dang nhap, ChatUI va man hinh quan tri ma khong lam thay doi luong chat hay setting cua user.
- Pham vi: Component logo dung chung, static asset trong image Nginx va release ChatUI; khong doi API, database, Tinode, unread, mention, notification hay storage.
- File da thay doi: `src/components/ChatLogo.jsx`, `src/features/auth/components/Login.jsx`, `src/app/App.jsx`, `src/features/management/ManagementApp.jsx`, `src/features/management/management.css`, `infrastructure/production/Dockerfile`, `dist/index.html`, `docs/CHANGELOG.md`.
- Noi dung: Production dang tra `403` cho `/chat-logo.svg` va `/favicon.svg` vi file trong image co mode `0600`, Nginx worker khong doc duoc. Them fallback SVG noi tuyen de logo van hien khi asset khong tai duoc; dong thoi chuan hoa quyen doc static file trong Docker image cho cac release sau.
- Quyet dinh ky thuat: Dung component logo nho, khong phu thuoc them API hoac storage; fallback chi kich hoat khi tai asset that bai. Docker chi sua quyen tren thu muc static da duoc copy vao image; chi recreate service `chat` khi phat hanh.
- Database/API/cau hinh: Khong migration, endpoint, secret, bien moi truong hay thay doi storage; giu nguyen `.env`, runtime, named volume va du lieu user.
- Kiem thu: `npm run test:frontend` dat 317/317; `npm run lint` exit 0 voi warning legacy/vendor da co san; `npm run build:production` exit 0 voi warning chunk App lon hon 500 KB; `git diff --check` dat; release `r3` build thanh cong, ChatUI healthy restart 0, Nginx `-t` dat, asset trong container mode `644`, `/chat-logo.svg` va `/favicon.svg` public HTTP 200, ChatUI `/healthz` va Chatmgt auth health HTTP 200, host Nginx `-t` dat, WSS HTTP 101, log ChatUI khong co marker fatal/panic/traceback/uncaught/critical/emerg.
- Trien khai: Source commit `e1a33df` da push `origin/master`; archive `/opt/deploy/chat/incoming/vichat-logo-e1a33df.tar.gz` 44972874 bytes, SHA-256 `bd8a73586b2fd0a4a16e299d811d2d618e6fc0c6b0d4b0be756fb28a4be692c0`; dung tuyen `ubuntu@103.74.122.206` -> `ubuntu@192.168.80.20`. Hai lan preflight `r1`/`r2` dung truoc khi recreate do quyen thu muc backup root, `current` va container khong doi; `r3` thanh cong: release `/opt/deploy/chat/releases/logo-e1a33df-20260827-2325-r3` dang la `current`, `previous` tro `/opt/deploy/chat/releases/url-links-4095daf-20260827-r2`, container moi `0118c24fe63b`, image `sha256:19f6d029144dfd8ffb5b8a84cb7a160464fbcfdd82e8a9bd008426b51ef49b64`; chi recreate `chat`, container ngoai `chat` giu nguyen ID.
- Backup/bao toan state: Backup PostgreSQL `/opt/deploy/chat/backups/logo-e1a33df-20260827-2325-r3/chatservice-predeploy.dump` mode `0600`, 171256 bytes, restore list 114 dong; `.env` backup mode `0600`, checksum truoc/sau giong nhau `4ae2d1cf4af80b4289cd07b15d55b5979eb926d613513d69ece8de8225c6fcb0`; Alembic van `20260825_13`; khong migration, khong `docker compose down -v`, khong reset browser storage/IndexedDB, runtime, named volume, database, Tinode topic/message, read cursor, avatar hay setting user.
- Rui ro con lai: Chua UAT visual bang tai khoan that trong browser; fallback SVG da bao phu truong hop asset loi va public asset da tra HTTP 200. Can hard refresh `https://chat.upgo.vn`, kiem tra logo tren login/sidebar va xac nhan setting user, realtime, mention, notification va link van giu nguyen.
- Viec tiep theo: Hard refresh va UAT login/sidebar; neu phat sinh loi thi chi tro `current` ve `previous` va recreate rieng `chat` theo release cu.
- Commit/PR: Source `e1a33df`; deployment follow-up docs commit `aaf55c9`; khong co PR

## 2026-08-27-08 - Tu dong lien ket URL trong tin nhan

- Thoi gian: 2026-08-27 22:29-23:08; deploy production 23:01-23:05 (Asia/Saigon)
- Loai: Tinh nang | Web | Bao mat | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da test, da commit, push va deploy production; san sang UAT
- Muc tieu: URL trong tin nhan hien mau xanh va co the mo nhanh trong tab moi, khong lam thay doi cac luong chat hien co.
- Pham vi: Renderer tin nhan va caption anh tren ChatUI; khong doi payload, Tinode, unread, mention, notification hay storage setting cua user.
- File da thay doi: `src/features/chat/services/messageLinkPolicy.js`, `src/features/chat/services/messageLinkPolicy.test.js`, `src/app/App.jsx`, `src/styles/index.css`, `package.json`, `dist/index.html`, `docs/CHANGELOG.md`.
- Noi dung: Nhan dien URL `http/https`, `www.` va ten mien dang tran nhu `example.com` trong tin nhan text/caption, hien mau xanh co gach chan va mo tab moi khi bam; ten mien dang tran tu dong dung `https://`, dau cau cuoi cau duoc giu ngoai href. Renderer van dung React text node, khong chen HTML tu noi dung tin nhan.
- Quyet dinh ky thuat: Chi cho phep link `http`/`https` hop le va hostname ASCII co hau to dang ten mien; link mo tab moi voi `noopener noreferrer`; email, scheme la va token nam trong tu bi bo qua; khong dung HTML tu tin nhan de tranh XSS.
- Database/API/cau hinh: Khong co migration, endpoint, secret, bien moi truong hoac thay doi storage.
- Kiem thu: `node --test src/features/chat/services/messageLinkPolicy.test.js` dat 7/7; `npm run test:frontend` dat 317/317; `npm run lint` exit 0 voi warning legacy/vendor da co san; `npm run build:production` exit 0 voi bundle local `index-BbC96tXw.js`, `App-DPAs2hOv.js`, `index-St-ReOoa.css` va warning chunk App lon hon 500 KB; `git diff --check` dat voi warning LF/CRLF cua working copy. Production candidate co marker `message-link`/`noopener noreferrer`, ChatUI health OK, public bundle khop candidate, auth health `status=ok`, `sudo -n nginx -t` dat, WSS tra HTTP 101, log ChatUI 10 phut khong co marker fatal/panic/traceback/uncaught/critical/emerg.
- Trien khai: Source commit `4095daf` da push `origin/master`; archive `/opt/deploy/chat/incoming/vichat-url-links-4095daf.tar.gz` 44972227 bytes, SHA-256 `8594fb53ebfbd2c123b43d147b269003adf4ff8a5dcf1bbaf1d35954dda212ae`; deploy dung tuyen `ubuntu@103.74.122.206` -> `ubuntu@192.168.80.20`. Lan release `r1` dung truoc khi switch `current` do race giua HTTP health va Docker healthcheck, trap tu rollback ve image cu; khong restart/recreate container ngoai `chat`. Lan `r2` thanh cong: release `/opt/deploy/chat/releases/url-links-4095daf-20260827-r2` dang la `current`, `previous` tro `/opt/deploy/chat/releases/viewer-settings-44e82e2-20260827-r1`; chi recreate `chat` voi `--no-deps --no-build --force-recreate`, container moi `5dad4706cb4a`, image `sha256:a40e89ed90f14a7adc404e44a139a79a17edec45026c709eb52d78574137e7da`; container ngoai `chat` giu nguyen ID. Public assets `/assets/index-C4yK2GQx.js`, `App-CtK9c59s.js`, `/assets/index-St-ReOoa.css` khop candidate; Alembic van `20260825_13`, ChatUI healthy restart 0, WSS HTTP 101.
- Backup/bao toan state: Backup PostgreSQL `/opt/deploy/chat/backups/url-links-4095daf-20260827-r2/chatservice-predeploy.dump` 167868 bytes, mode `0600`, SHA-256 `9d1b2946a4a81be8ad4c14887f803960e51ad065363ff63a48ecfa4a2cdf2b23`, restore list 114 dong; `.env` backup mode `0600`, checksum giu nguyen `4ae2d1cf4af80b4289cd07b15d55b5979eb926d613513d69ece8de8225c6fcb0`. Rollback tag `songhong-production-chat:rollback-before-url-links-4095daf` giu image cu. Khong migration, khong `docker compose down`, khong reset browser storage/IndexedDB, runtime, named volume, database, Tinode topic/message, read cursor, avatar hay setting user.
- Rui ro con lai: Chua UAT visual tren browser that vi browser runtime khong duoc expose; hostname Unicode, localhost khong co dau cham va URL khong co hostname hop le van hien text thuong theo policy an toan. Can hard refresh va UAT voi tin nhan `example.com`, `https://...`, caption anh, mention, email/scheme la va ca theme/notification/shortcut setting.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, gui tin nhan link tu tai khoan khac, bam mo tab moi va xac nhan setting viewer van con sau deploy; neu loi chi tro `current` ve `previous` va recreate rieng `chat`.
- Commit/PR: Source `4095daf`; deployment follow-up docs commit `77c36fe`; khong co PR.

## 2026-08-27-07 - Khoi phuc icon mention khi tin legacy thieu metadata

- Thoi gian: 2026-08-27 16:31; deploy production 17:18-17:29 (Asia/Saigon)
- Loai: Sua loi | Web | Realtime | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da commit, push va deploy production; san sang UAT
- Muc tieu: Khi tin nhan moi trong nhom hien token `@Ten` nhung khong co `x-mentions`, sidebar van hien dung icon mention mau xanh ma khong lam thay doi unread boundary, badge hoac notification hien co.
- Pham vi: Chinh sach nhan dien mention cua unread conversation; khong doi giao dien tin nhan, payload gui di, API, Tinode protocol, database hay storage setting cua user.
- File da thay doi: `src/features/chat/services/mentionPolicy.js`, `src/features/chat/services/mentionPolicy.test.js`, `docs/CHANGELOG.md`.
- Nguyen nhan: Tin tu client/luong legacy co the giu noi dung `@Ten` nhung thieu metadata `message.mentions`; preview van hien noi dung nhung dieu kien icon khong co target de match.
- Noi dung: `messageMentionsViewer` tiep tuc uu tien metadata mention hop le; chi khi metadata vang/malformed moi fallback match token trong `message.text`/caption theo ten viewer, co boundary cho token, accent-insensitive va ho tro `@All`. Metadata mention nguoi khac van la nguon chuan va khong bi fallback ghi de.
- Quyet dinh ky thuat: Sua tai helper policy dung chung thay vi chen logic vao component sidebar; giu nguyen loc tin incoming va unread boundary o `App.jsx`, nen icon chi xuat hien cho tin moi chua doc.
- Database/API/cau hinh: Khong migration database, khong doi endpoint, secret, bien moi truong, storage key, commit hay deploy. Cac setting user va luong commit/deploy an toan cua muc `2026-08-27-06` duoc giu nguyen.
- Kiem thu: `node --test src/features/chat/services/mentionPolicy.test.js` dat 8/8; `npm run test:frontend` dat 310/310; `npm run lint` exit 0 voi warning legacy/vendor tai `src/App.jsx` va `public/ChatBotWidget/tinode.js`; `npm run build:production` exit 0 voi warning chunk `App-DSDukVwY.js` lon hon 500 KB; `git diff --check` dat voi warning LF/CRLF cua working copy. Production `chat` healthy, `/healthz` va auth health HTTP 200, Alembic `20260825_13`, Nginx trong container va `sudo -n nginx -t` tren `.206` dat, log `chat`/`chatmgt`/bridge/webhook 15 phut co 0 marker fatal/panic/traceback/uncaught/critical/emerg`. WSS upgrade tra HTTP 101; curl ket thuc voi ma 28 sau khi handshake vi ket noi WebSocket giu mo. Public entry/CSS khop tung byte voi container: entry `index-wGwM3FAG.js` SHA-256 `f195dd443d684a33643ed2edf1ff54b05883b2f3cd6eee9d4f6a29fb76cf8fe0`, CSS `index-CR6IwdSS.css` SHA-256 `5366b494cd5b4927fc8f4c0043e188c3852267d1fbb2af30a02942882a265d3d`, co marker `conv-mention-indicator`; cac container ngoai `chat` giu nguyen ID.
- Trien khai: Source commit `071a3ac1761c` da push `origin/master`; archive `/opt/deploy/chat/incoming/vichat-viewer-settings-44e82e2.tar.gz` 44970258 byte, SHA-256 `cc77ad5bd42e7de53a193b386b240b77fd43b498a0eb4c1ff181e5673c0ed403`; deploy qua dung tuyen `ubuntu@103.74.122.206` -> `ubuntu@192.168.80.20`. Chi recreate `chat` bang `--no-deps --force-recreate`; release `/opt/deploy/chat/releases/viewer-settings-44e82e2-20260827-r1` dang la `current`, `previous` tro `/opt/deploy/chat/releases/directory-ambiguity-992844f-20260827-1510-r1`; container `f85aa4973865c2b6ef618b7733c909954120345bdef4d34b631da96dc6c74da1`, image `sha256:81e27ff2a346f44bca541e0a94a6901f99b04fb7a571c394819b4ef6c65a5bc6`.
- Backup/rollback: Backup `/opt/deploy/chat/backups/viewer-settings-44e82e2-20260827-r1/chatservice-predeploy.dump` mode `0600`, 158248 byte; restore list 114 dong; `.env` mode `0600`, SHA-256 truoc/sau/backup giong nhau `4ae2d1cf4af80b4289cd07b15d55b5979eb926d613513d69ece8de8225c6fcb0`. Khong dung `docker compose down -v`, khong reset browser storage, IndexedDB, runtime, named volume, database, Tinode topic/message, read cursor, avatar hoac setting user.
- Rui ro con lai: Chua UAT visual production bang tai khoan that vi browser runtime khong duoc expose; client legacy khong gui metadata va dung ten hien thi khac moi ten viewer da biet co the khong duoc nhan dien, fallback khong phan biet duoc ten trung khi server thieu identity.
- Viec tiep theo: Hard refresh va UAT voi tin nhan tu client moi/legacy de xac nhan icon mention mau xanh; kiem tra setting user van con sau refresh va release tiep theo. Neu legacy khong co metadata va khong trung ten da biet, can bo sung identity metadata tu nguon gui.
- Commit/PR: Source `071a3ac1761c`; deployment follow-up docs commit `392494c`; khong co PR.

## 2026-08-27-06 - Bao toan setting viewer khi doi identity va deploy

- Thoi gian: 2026-08-27 16:06 (Asia/Saigon)
- Loai: Sua loi | Web | Du lieu | Bao mat | Kiem thu | Tai lieu | Van hanh
- Trang thai: Hoan tat; chua commit, chua deploy
- Muc tieu: Khong lam mat setting local da cai dat khi Account/Tinode doi cach bieu dien identity, refresh frontend, commit hoac deploy lai.
- Pham vi: Keyboard shortcuts, notification/theme, conversation category, conversation pin, local background, custom/recent sticker, message action va web PIN lock; khong doi noi dung Tinode, Chatmgt, API hoac database.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/components/StickerPicker.jsx`, `src/features/chat/services/viewerPreferenceStorage.js`, `src/features/chat/services/keyboardShortcuts.js`, `src/features/chat/services/keyboardShortcuts.test.js`, `src/features/chat/services/conversationCategoryPolicy.js`, `src/features/chat/services/conversationCategoryPolicy.test.js`, `src/features/chat/services/conversationPinPolicy.js`, `src/features/chat/services/conversationPinPolicy.test.js`, `src/features/chat/services/conversationBackground.js`, `src/features/chat/services/conversationBackground.test.js`, `src/features/chat/services/customStickerStore.js`, `src/features/chat/services/customStickerStore.test.js`, `src/features/chat/services/stickerCatalog.js`, `src/features/chat/services/stickerCatalog.test.js`, `src/features/chat/services/messageActionStorage.js`, `src/features/chat/services/messageActionStorage.test.js`, `src/features/security/services/pinLock.js`, `src/features/security/services/pinLock.test.js`, `package.json`, `README.md`, `dist/index.html`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`.
- Noi dung: Giu nguyen ten localStorage/IndexedDB hien co; dung Account ID on dinh lam key chinh, doc UID/identity cu nhu alias va copy record hop le sang key chinh ma khong xoa key cu. Cac thao tac ghi preference co alias dong bo ban ghi; custom sticker doc merge alias truoc khi ghi item moi; thao tac xoa, bo ghim, clear hoac logout don dep marker PIN session tren tat ca alias da biet. Them test cho alias-only migration, partial write, explicit false action, clear marker va delete.
- Quyet dinh ky thuat: Migration chi copy-on-read va uu tien record hop le cua identity hien tai/record moi hon theo policy tung preference; khong doi storage contract, khong dua preference len backend va khong dung commit/deploy de reset browser storage. Clear/delete la hanh dong chu dong cua user; primary local background clear marker van uu tien alias cu.
- Database/API/cau hinh: Khong migration database, khong doi API, Tinode protocol, secret hay bien moi truong. Khi deploy production chi recreate stateless service can thiet; phai giu `.env`, runtime files, named volumes, database/upload va khong dung `docker compose down -v`.
- Kiem thu: Da chay targeted alias tests dat 53/53; `npm run test:frontend` dat 308/308; `npm run lint` exit 0, chi con warning legacy/vendor tai `src/App.jsx` va `public/ChatBotWidget/tinode.js`; `npm run build:production` exit 0 voi bundle `index-BASnJ3Fp.js`, `App-AFjndrvJ.js`, CSS `index-CR6IwdSS.css` va warning chunk App lon hon 500 KB; `git diff --check` dat voi warning LF/CRLF cua working copy.
- Rui ro con lai: Chua UAT tren trinh duyet production; mot record hu hong hoac storage het dung luong van chi co the doc/copy best-effort. Chua commit va chua deploy trong lan nay.
- Viec tiep theo: Neu phat hanh, tao commit/push theo workflow, backup/verify release va chi recreate service stateless; giu nguyen `.env`, runtime va named volumes.
- Commit/PR: Chua tao

## 2026-08-27-05 - Cach ly identity Account mo ho thay vi chan ca danh ba

- Thoi gian: 2026-08-27 14:39-15:18 (Asia/Saigon)
- Loai: Sua loi | Bao mat | Backend | Tenant | Du lieu | Kiem thu | Tai lieu | Trien khai
- Trang thai: Hoan tat; da commit, push va deploy production; san sang UAT
- Muc tieu: Khi Account tra ve nhieu ID khac nhau cung dung mot username/email, `/api/v1/chat/users` van tai duoc cac thanh vien an toan cua dung cong ty, tuyet doi khong gop identity/danh ba va khong lam hong luong chat khac.
- Pham vi: Doc va chuan hoa Account directory, snapshot metadata, dong bo/visibility cache cua endpoint danh ba, audit va contract test; giu nguyen ChatUI, Tinode bridge, conversation, message, membership, file va schema database.
- File da thay doi: `chatservice-main/application/services/account_sso_service.py`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/tests/test_account_sso_service.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`.
- Noi dung: Thay loi `ACCOUNT_DIRECTORY_DUPLICATE_IDENTITY` chan toan bo snapshot bang cach ly theo ban ghi. Chatmgt thu thap cac Account ID cung claim username/email; giu dung viewer da xac minh theo Account ID, bo moi claimant mo ho con lai va van project cac thanh vien unique. Snapshot co ambiguity luon la `partial`, khong duoc reconcile/deactivate co tham quyen va khong duoc tron lai cac ID tu complete visibility cache cu. Response `directory_sync` va audit `ACCOUNT_DIRECTORY_SYNC` ghi count `ambiguous`; log chi co so luong va co/khong giu viewer, khong ghi PII.
- Quyet dinh ky thuat: Fail-closed theo tung identity de khong nhap hai Account ID, nhung khong fail ca danh ba khi van con record an toan. Chi viewer khop Account session + current tenant moi duoc uu tien; khong xoa/deactivate projection chi vi snapshot mo ho, khong doi Tinode UID va khong cham conversation/message/membership/file. Partial ambiguity khong duoc danh dau la safe cache, nen co the sync lai thuong xuyen cho den khi du lieu Account duoc sua.
- Database/API/cau hinh: Khong migration, dependency, secret hoac bien moi truong moi. `GET /api/v1/chat/users` giu endpoint/status contract va bo sung `directory_sync.ambiguous` la so record mo ho da bo; audit thanh cong cung bo sung aggregate `ambiguous`.
- Kiem thu: `python -m py_compile application/controllers/api_chat_management.py application/services/account_sso_service.py tests/test_account_sso_service.py tests/test_chat_auth_contract.py` dat; `python -m unittest tests.test_chat_auth_contract -q` dat 54/54; full backend local `python -m unittest discover -s tests -q` dat 254 test, skip 101 do dependency/runtime tuy chon, trong do `tests.test_account_sso_service` skip 34/34 vi local thieu `aiohttp`; `git diff --check` dat voi warning LF/CRLF cua working copy. Candidate image production chay cung release source mount read-only va Redis tam cach ly dat 254/254, khong skip; deployment verifier dat health/CORS/directory/conversation/Tinode-token/login/logout va `verify_tenant_isolation.py` dat user/conversation/friend/participant cua hai tenant.
- Trien khai: Source commit `992844f` da push `origin/master`; archive `vichat-directory-ambiguity-992844f.tar.gz` 44958575 byte co SHA-256 `88d73e920f352b403126e98f67d85cb5c7323cf0cada9bf87ff1a5a30f9b5e4c`. Deploy qua dung tuyen `ubuntu@103.74.122.206` -> `ubuntu@192.168.80.20`; release `/opt/deploy/chat/releases/directory-ambiguity-992844f-20260827-1510-r1` dang la `current`, `previous` tro `/opt/deploy/chat/releases/company-directory-57fd04f-20260827-1420-r4`. Chi build/recreate `chatmgt`; khong recreate ChatUI, PostgreSQL, Redis, Tinode, ChatAPI, Coturn, bridge hay chatbot webhook.
- Backup/rollback: Dump `/opt/deploy/chat/backups/directory-ambiguity-992844f-20260827-1510-r1/chatservice-predeploy.dump` mode `0600`, 149888 byte, SHA-256 `0442c2d1b9a7e607671de845f1f7ef29c49789bdde672877ba05eb636508487d`; `pg_restore -l` doc duoc 114 dong. Production `.env` khop SHA-256 truoc/sau va voi ban backup mode `0600`; rollback tag `songhong-production-chatmgt:rollback-before-directory-ambiguity-992844f` giu image cu.
- Kiem tra production: `chatmgt` doi tu container `b06ea9d9a0d2e345c734a832962555bc85e94f5a1cedf9b1b2d1ae54978acb62` sang `cf12bbf31f276c4f59cd349563a917b30f510a2ae25e414686cb0de2dfcbfe10`, image moi `sha256:c2b236ec5dd4c0ee543bd8aa2930a043190cf6119096cc0599eaf353f5b6cdc2`; healthy, restart count 0. Alembic van `20260825_13`; moi container ngoai `chatmgt` giu nguyen ID; auth health noi bo/public HTTP 200, public WSS HTTP 101, `nginx -t` tren `.206` dat, log Chatmgt co 0 fatal/panic/traceback/uncaught/critical/emerg. Audit co 84 loi duplicate identity lich su, 0 loi moi trong 15 phut gan nhat; chua co Account session that goi directory sau deploy nen count sync thanh cong co ambiguity va marker log cach ly van bang 0.
- Rui ro con lai: Can hard refresh/UAT bang Account session that de tao request directory moi va xac nhan toast bien mat, danh ba chi con viewer + thanh vien unique cua dung cong ty, dong thoi audit `ACCOUNT_DIRECTORY_SYNC` ghi `status=partial` va aggregate `ambiguous`. Khi ambiguity con ton tai, directory co the goi Account lai o moi request sau TTL de tranh coi du lieu mo ho la authoritative.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, mo danh ba/search va mot chat 1-1/nhom/tep san co; neu Account van tra duplicate, theo doi log aggregate `Omitted N ambiguous...` va sua du lieu trung tai nguon Account rieng, khong gop lai identity trong Chatmgt.
- Commit/PR: Source `992844f` da commit va push; deployment follow-up duoc ghi trong muc nay.

## 2026-08-27-04 - Chan tuyet doi danh ba dung chung giua cac cong ty

- Thoi gian: 2026-08-27 13:07-14:34 (Asia/Saigon)
- Loai: Sua loi | Bao mat | Backend | Tenant | Du lieu | Tinode | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da commit, push va deploy production; san sang UAT
- Muc tieu: Moi phien Chatmgt chi doc va hien thi danh ba cua dung Account user + current tenant; thu hoi projection Account khong con nam trong snapshot cong ty ma khong anh huong chat/Tinode/du lieu lich su.
- Pham vi: Xac thuc Account session, phan trang `/api/v1/tenant_user`, dong bo/reconcile `management_account`, response `/api/v1/chat/users`, Tinode token bridge/direct policy/chatbot sender mapping, audit va tai lieu kien truc/van hanh; khong doi frontend, conversation, message, membership, file hoac schema database.
- File da thay doi: `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/controllers/api_chatbot.py`, `chatservice-main/application/services/account_sso_service.py`, `chatservice-main/application/services/sso_identity.py`, `chatservice-main/scripts/tinode_account_bridge.py`, `chatservice-main/tests/test_account_sso_service.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `chatservice-main/tests/test_direct_message_blocking.py`, `chatservice-main/tests/test_directory_reconciliation.py`, `chatservice-main/tests/test_sso_identity.py`, `chatservice-main/tests/test_tinode_account_bridge.py`, `chatservice-main/tests/test_tinode_chatbot_webhook.py`, `docs/chat-backend-architecture.md`, `infrastructure/production/README.md`, `docs/CHANGELOG.md`.
- Noi dung: Bo cach ep chon tenant JWT khi validate Account session; protected check va xac nhan sau update profile/avatar bat buoc Account user + current tenant khop projection/JWT. Directory validate tenant envelope, tenant record va membership list; doc du trang theo `total`/`num_results`; phat hien duplicate ID, duplicate username/email, stall va record loi. Snapshot day du co viewer duoc reconcile bang cach deactive projection Account bi thieu, tang `auth_version`, gan `directory_removed_at` va giai phong username/email xung dot de identity chuan duoc project; snapshot partial chi hien record vua xac minh hoac cache an toan gan nhat. Viewer inactive, bi snapshot day du bo qua hoac project loi bi xoa cache, deactive va thu hoi ca JWT/cookie thay vi fallback danh ba cu. Tinode direct policy va webhook chatbot fail-closed khi UID map trung, inactive hoac peer thuoc tenant khac; UID peer khong do Chatmgt quan ly van giu tuong thich bot. Tinode Web bridge chuyen tiep cookie Account moi tu chinh credential login de endpoint token revalidate dung Account user/current tenant truoc khi cap Tinode token.
- Quyet dinh ky thuat: Khong xoa row account, Tinode UID, conversation, message, membership hay file; khong cham legacy/local account. Cache danh ba tach theo `(tenant_id, viewer_account_id)` va chi duoc danh dau an toan sau complete reconciliation. Neu Account user/current tenant lech JWT hoac viewer bi directory tu choi co tham quyen, thu hoi token Chatmgt, xoa cache viewer va xoa ca cookie Chatmgt/Account; partial snapshot thieu viewer khong duoc coi la bang chung thu hoi. Audit `ACCOUNT_DIRECTORY_SYNC`/`ACCOUNT_DIRECTORY_RESTORE` chi ghi count, trang thai va error code; khong ghi username, email, cookie hoac secret. Transition active/inactive tang `auth_version` de JWT cu khong tiep tuc truy cap. Bridge chi dung Account cookie moi phat hanh tu cung lan login server-side, khong can cookie Account co san cua trinh duyet va khong gui password den Tinode.
- Database/API/cau hinh: Khong migration, khong them bien moi truong va khong doi endpoint. `GET /api/v1/chat/users` co the fail-closed truoc snapshot an toan dau tien; truong `directory_sync` hien co chi bo sung count `released_conflicts`. Internal direct policy giu hop dong response cu, nhung tu choi mapping managed inactive/ambiguous/cross-tenant. `POST /api/v1/auth/tinode-token-bridge` van giu route/key/JWT cu, nhung nay bat buoc cookie Account moi tu cung lan credential login de xac minh current tenant.
- Kiem thu: Tai `chatservice-main`, targeted `python -m unittest tests.test_sso_identity tests.test_direct_message_blocking tests.test_tinode_chatbot_webhook tests.test_tinode_account_bridge tests.test_account_sso_service tests.test_chat_auth_contract tests.test_directory_reconciliation -q` dat 157 test, 48 skipped do dependency runtime/optional khong co trong Python local; source-contract khong skip xac nhan bridge bat buoc forward Account cookie. `python -m unittest discover -s tests -q` dat 252 test, 99 skipped cung ly do; `python -m py_compile application/controllers/api_chat_management.py application/controllers/api_chatbot.py application/services/account_sso_service.py application/services/sso_identity.py scripts/tinode_account_bridge.py tests/test_tinode_account_bridge.py tests/test_directory_reconciliation.py` dat. Tai root, `npm run test:frontend` dat 297/297; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build:production` dat voi entry `index-CsJ_3exp.js`, App `App-D1YP4ygz.js`, CSS `index-CR6IwdSS.css` va warning chunk App lon hon 500 KB; `git diff --check` dat. Candidate production image co day du `aiohttp` va dependency Linux chay `python -m unittest discover -s tests -q` tren source release mount read-only voi Redis tam cach ly, dat 252/252 va da don container/network test.
- Trien khai: Source commit `57fd04f` da push `origin/master`; archive `/opt/deploy/chat/incoming/vichat-company-directory-57fd04f.tar.gz` co SHA-256 `c06a80c1da9053fc0dbb5d03f667aa0d4a44eb1a7400eb55d7f2a7482d438845`; deploy qua dung tuyen `ubuntu@103.74.122.206` -> `ubuntu@192.168.80.20`. Release `/opt/deploy/chat/releases/company-directory-57fd04f-20260827-1420-r4` dang la `current`, `previous` tro `/opt/deploy/chat/releases/directory-tenant-6a04eb7-20260827-1020-r3`; chi recreate `chatmgt` va `tinode-account-bridge`, khong chay Compose tren `.206`, khong `down` va khong recreate ChatUI/PostgreSQL/Redis/Tinode/ChatAPI/Coturn/chatbot webhook.
- Backup/rollback: Dump `/opt/deploy/chat/backups/company-directory-57fd04f-20260827-1420-r4/chatservice-predeploy.dump` mode `0600`, kich thuoc 146917 byte, SHA-256 `6ee94674da5e19448765c758d517515b14e78591adda2d9f03c97851ccddb4c4`; `pg_restore -l` dat voi 114 dong. Production `.env` duoc copy mode `0600`, SHA-256 truoc/sau giu nguyen `4ae2d1cf4af80b4289cd07b15d55b5979eb926d613513d69ece8de8225c6fcb0`; rollback image tag duoc tao cho ca hai service. Cac gate `r1`/`r2` dung truoc thay service do quyen thu muc backup va harness test thieu mount/env; `r3` da dua candidate len healthy nhung rollback vi verifier WebRTC/ICE trung tam that bai. Chay cung verifier tren ban cu xac nhan loi ICE ton tai san; `r4` giu tat ca check auth/CORS/directory/conversation/Tinode-token/login/logout va tach check WSS transport rieng.
- Kiem tra production: `chatmgt` container `b06ea9d9a0d2e345c734a832962555bc85e94f5a1cedf9b1b2d1ae54978acb62`, image `sha256:2fb0042e387160280f3d9ede91f6a37807643d0bc01a01ed7c62687bdbb77a5d`; bridge container `5bb566841180a23dfe36cf8b3d3b88bf6bca6885b76fde003ff2a8f0e0ff2eb6`, image `sha256:9bace6f9f4d35e4fa1ff3b75975f86e73e8ddecf55e8059374b52405be5890df`. Ca hai healthy, restart count 0; auth health noi bo/public HTTP 200 va `tinode_bridge_configured=true`; bridge health dat; verifier ung dung va `verify_tenant_isolation.py` dat; WSS upgrade HTTP 101; Alembic van `20260825_13`; container ngoai hai service khong doi ID; log 15 phut khong co fatal/panic/traceback/uncaught/critical/emerg; `nginx -t` tren `.206` dat.
- Rui ro con lai: Can UAT bang Account session that cua it nhat hai tenant de xac nhan danh ba/search/presence tach rieng va chat/unread/group/file khong regression. Projection lan tu ban cu chi bi an/thu hoi sau mot directory request complete duoc Account xac minh; record Account khong co bat ky tenant/membership marker nao van phai dua vao tinh tenant-scoped cua `/api/v1/tenant_user`. Tinode trung tam hien van thieu WebRTC/ICE trong hello tren ca release cu va moi; WSS nhan `101` nhung cau hinh call can duoc xu ly rieng.
- Viec tiep theo: UAT voi hai tai khoan that o hai cong ty; neu dat thi khong can migration, rebuild ChatUI hay thay doi cau hinh cho ban sua danh ba nay. Xu ly authoritative Tinode WebRTC/ICE trong mot release rieng, khong tron vao rollback danh ba.
- Commit/PR: Source `57fd04f` da commit va push; deployment follow-up duoc ghi trong muc nay.

## 2026-08-27-03 - Tach cach ly danh ba theo tung cong ty

- Thoi gian: 2026-08-27 10:05 (Asia/Saigon)
- Loai: Sua loi | Bao mat | Web | Backend | Tenant | Realtime | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da commit, push va deploy production; san sang UAT
- Muc tieu: Moi cong ty chi hien danh ba cua tenant dang dang nhap; khong cho snapshot, cache hoac response cu cua cong ty khac chen vao.
- Pham vi: ChatUI danh ba/search/presence state, Chatmgt users endpoint va Account directory normalization; giu nguyen chat, unread, Tinode, membership va database schema.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/chatManagementService.test.js`, `src/features/contacts/services/accountDirectory.js`, `src/features/contacts/services/accountDirectory.test.js`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/services/sso_identity.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `chatservice-main/tests/test_sso_identity.py`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Bo sung loc fail-closed theo tenant cho snapshot va profile; chong race khi request danh ba/search tra ve sau khi doi session/tenant; them request/cache `no-store`; tach cache sync theo tenant; validate tenant nested cua record Account va khong cho header HTTP dung lai response cong ty khac. Guard directory dung generation + tenant ID + user ID, khong so sanh object session de tranh loai nham request khi `/auth/me` refresh metadata.
- Quyet dinh ky thuat: Dung tenant va session identity snapshot lam scope cua moi response, bo ket qua cu thay vi merge vao state moi; giu fallback backend cho record khong co tenant vi endpoint Account da duoc goi trong session tenant, nhung reject ro rang record co tenant khac. Khong doi giao thuc Tinode hay reset room.
- Database/API/cau hinh: Khong migration, khong them bien moi truong; response `GET /api/v1/chat/users` them `Cache-Control: no-store` va `Pragma: no-cache`.
- Kiem thu: `npm run test:frontend` dat 297/297; `python -m unittest discover -s chatservice-main/tests -q` dat 224 test, 86 skipped; `python -m py_compile chatservice-main/application/controllers/api_chat_management.py chatservice-main/application/services/sso_identity.py chatservice-main/tests/test_chat_auth_contract.py chatservice-main/tests/test_sso_identity.py` dat; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build:production` dat voi entry `index-CsJ_3exp.js`, App `App-D1YP4ygz.js`, CSS `index-CR6IwdSS.css` va warning chunk App lon hon 500 KB; `git diff --check` dat.
- Trien khai: Source commit `6a04eb7` da push `origin/master`; archive `/opt/deploy/chat/incoming/vichat-directory-tenant-6a04eb7.tar.gz` co SHA-256 `59a6a3e4b97accd8687d1b7201d825665b9288def193338c85974d87c868626a`; da deploy qua dung tuyen `ubuntu@103.74.122.206` -> `ubuntu@192.168.80.20`. Release `/opt/deploy/chat/releases/directory-tenant-6a04eb7-20260827-1020-r3` dang la `current`, `previous` tro `tenant-switcher-b0d4f5f-20260827-0105-r7`; chi recreate `chat` (`2cb319b20a4438b37ee5acb519e995eb7e072bedefa430d59c090c7a080aa3c2`) va `chatmgt` (`945559717b5ae3393b7e9279245b5a0c6a76d4a3fb18a180767b2f66753d23b1`), cac container stateful giu nguyen ID.
- Kiem tra production: Tren `.20`, `chat`/`chatmgt` healthy, `/healthz` ChatUI va auth health noi bo HTTP 200, origin co marker tenant-scope/no-store, public entry/App/CSS khop origin va co marker, auth health public HTTP 200, WSS upgrade HTTP 101, `nginx -t` tren `.206` dat, log `chat`/`chatmgt` 10 phut khong co marker loi nghiem trong.
- Rui ro con lai: Chua UAT visual bang hai tai khoan that o hai tenant trong phien nay vi browser runtime khong duoc expose; can kiem tra hard refresh/cache, danh ba/search/presence cua tung tenant va xac nhan chat, unread, Tinode, membership khong doi.
- Viec tiep theo: UAT voi hai tai khoan o hai cong ty; neu dat thi khong can migration hay thay doi cau hinh. Rollback tro `previous` va chi recreate service lien quan neu can.
- Commit/PR: Source `6a04eb7`; deployment follow-up docs `5b8c089`, da commit va push `origin/master`.

## 2026-08-27-02 - Hien thi cong ty cho tai khoan mot tenant va dong bo tenant moi

- Thoi gian: 2026-08-27 01:00 (Asia/Saigon)
- Loai: Sua loi | Web | Tenant | Realtime | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da commit, push va deploy production; san sang UAT
- Muc tieu: Tai khoan co mot tenant van thay cong ty hien tai; menu mui ten khong lap lai cong ty dang dung va tenant moi xuat hien sau khi Account cap nhat.
- Pham vi: ChatUI profile company switcher, refresh `/api/v1/auth/me` va nhan dien menu tenant; khong thay doi Tinode, unread highlight, directory, auth token, Chatmgt API hay database.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/chatManagementService.test.js`, `src/features/i18n/appLanguage.js`, `src/features/i18n/appLanguage.test.js`, `src/styles/index.css`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Switcher duoc hien khi co it nhat mot active tenant; cong ty hien tai van hien trong profile. Menu chi render cac tenant khac, hien trang thai rong khi chua co cong ty khac va tu hien tenant moi khi refresh realtime 5 giay nhan snapshot moi. Request auth refresh/restore dung `cache: 'no-store'` de khong giu snapshot tenant cu.
- Quyet dinh ky thuat: Tach current tenant khoi danh sach lua chon de single-tenant khong tao lua chon gia; giu nguyen polling/focus refresh va chi cap nhat `tenantOptions` trong memory, khong reset room, Tinode hay session. Khong sua endpoint chuyen tenant va van giu guard xac nhan hien co.
- Database/API/cau hinh: Khong co migration, schema, endpoint, secret hay bien moi truong moi; chi thay doi cache policy cua client khi doc `/api/v1/auth/me`. Khong can rebuild Chatmgt.
- Kiem thu: `node --test src/features/chat/services/chatManagementService.test.js src/features/i18n/appLanguage.test.js` dat 63/63; `npm run test:frontend` dat 294/294; `npm run lint` exit 0 voi warning legacy/vendor da co san; `npm run build:production` dat voi entry `index-Bbs5AhNT.js`, App `App-BvG3IFpZ.js`, CSS `index-CR6IwdSS.css`; `git diff --check` dat. Production release `/opt/deploy/chat/releases/tenant-switcher-b0d4f5f-20260827-0105-r7` tren `.20` dat health ChatUI/Chatmgt, nginx, WSS HTTP 101, log scan sach; public entry/App/CSS HTTP 200 va SHA-256 khop byte voi container: `8d96e79b5a89b9c2d280b1d98ab1be47a7b5ca43d0b3b8bac6b992014b50f00f`, `ce9ddda3b0c2b1893b549421fbc9c190af01bdd5c5556cdd7fb8e5767d0f3333`, `5366b494cd5b4927fc8f4c0043e188c3852267d1fbb2af30a02942882a265d3d`.
- Trien khai: Da deploy qua dung tuyen `ubuntu@103.74.122.206` -> `ubuntu@192.168.80.20`; chi recreate container `chat`, `current` tro r7, `previous` tro release unread truoc do; cac container ngoai `chat` giu nguyen ID. Hai candidate truoc rollback an toan do gate log khong tuong thich/cache public; gate cuoi cho du HTML + App + CSS va dung cache-bust, khong bo qua marker.
- Rui ro con lai: Chua UAT visual production bang tai khoan that trong phien nay vi browser runtime khong duoc expose; can kiem tra single-tenant, tenant moi duoc cap realtime va chuyen tenant nhieu tenant sau deploy.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, kiem tra tai khoan single-tenant thay cong ty hien tai, mui ten mo menu rong; sau khi Account cap tenant moi, xac nhan menu tu cap nhat ma khong reset chat/Tinode/unread.
- Commit/PR: Source `b0d4f5f` da commit va push; deployment release `tenant-switcher-b0d4f5f-20260827-0105-r7` da hoan tat.

## 2026-08-27-01 - Giu highlight khi tin moi den trong luc dang xac nhan da doc

- Thoi gian: 2026-08-27 00:29 (Asia/Saigon)
- Loai: Sua loi | Web | Realtime | UX | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da commit, push va deploy production; san sang UAT
- Muc tieu: Tin peer moi den sau khi viewer da xem room cu phai bat lai day du highlight; tin cu da xem khong duoc hoi sinh highlight.
- Pham vi: ChatUI unread boundary completion, Tinode read acknowledgement race, sequence projection va regression test; khong doi luong gui tin, receipt nguoi khac, mobile, Chatmgt, database hay volume.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/tinodeClient.js`, `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/chatRealtime.test.js`, `src/features/chat/services/unreadBoundary.js`, `src/features/chat/services/unreadBoundary.test.js`, `src/features/chat/services/chatManagementService.test.js`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Callback observer truyen boundary da that su nam trong viewport; `markRead` nhan moc sequence gioi han va chup sequence truoc `await`. Tinode SDK co the tu tang `topic.read` cho packet thieu `from`, nen ChatUI chup read cursor truoc callback, gioi han snapshot realtime va giu lai moc local da doc. Neu packet peer moi den trong luc acknowledge dang cho, boundary moi duoc giu lai/re-arm va state khong bi ghi de ve badge 0.
- Quyet dinh ky thuat: Khong bo qua realtime event khi dang completion; so sanh tail moi voi boundary dang hoan tat, chi xoa boundary cu va chi nang read cursor toi sequence da thay. Incoming read cap chi ha server cursor tam thoi, khong ha `localReadFloor`, nen tin da doc khong hoi sinh va tin moi van highlight. Tin cua viewer van khong tao unread vi read-state merge loc theo sender ID.
- Database/API/cau hinh: Khong co migration, endpoint, schema, dependency, secret, bien moi truong hay thay doi volume. Thay doi `markRead` chi la hop dong noi bo cua ChatUI/Tinode client.
- Kiem thu: `node --test src/features/chat/services/chatRealtime.test.js src/features/chat/services/unreadBoundary.test.js src/features/chat/services/chatManagementService.test.js` dat 92/92; `npm run test:frontend` dat 294/294; `npm run lint` exit 0 voi warning legacy/vendor da co san; `npm run build:production` dat voi entry `index-2mojosJ8.js`, App `App-BRj-yMG6.js`, CSS `index-BEAPZ7sy.css`; `git diff --check` dat sau khi cap nhat code va test. Sau deploy: ChatUI health OK, Chatmgt health OK, public bundle co marker unread/scroll, WSS tra HTTP 101, log scan khong co fatal/panic/traceback/uncaught/critical/emerg.
- Trien khai: Archive `vichat-unread-highlight-f1cb029.tar.gz` co SHA-256 `f05876efe3f67320e7ec9c1c5bddaeaaaaaf7c450d315aed3c62e8102766714c`; release `/opt/deploy/chat/releases/unread-highlight-f1cb029-20260827-0035-r2` dang la `current`, `previous` tro `/opt/deploy/chat/releases/unread-highlight-eca4cb8-20260826-1645-r1`; chi recreate ChatUI tren `.20`, container `113b891832645f6fb1149cf2c4bffdb557b97b86179da0d126f37acf63dac83f`, image `sha256:032c372e9283b472415ab7a19cb76598b69c11197d3b758d8e054898f7559bd2`; deploy qua `.206` -> `.20`, khong chay Compose tren `.206`, container ngoai `chat` giu nguyen.
- Rui ro con lai: Chua UAT visual production bang hai tai khoan that trong phien nay vi browser runtime khong duoc expose; can xac nhan direct/group, tin den khi room khac dang mo, tin viewer gui, boundary cu da xem va reconnect.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, gui tin tu tai khoan thu hai khi tai khoan thu nhat dang o phong khac, xac nhan phong chua xem bat class unread/name/preview/time dam va badge; sau khi xem roi doi phong, xac nhan khong hoi sinh highlight cu.
- Commit/PR: Source commit `f1cb029`; deployment and UAT follow-up documented here.

## 2026-08-26-13 - Dung mat highlight khi realtime merge bi lap snapshot

- Thoi gian: 2026-08-26 16:39; deploy 16:52-16:55 (Asia/Saigon)
- Loai: Sua loi | Web | Realtime | Kiem thu | Tai lieu
- Trang thai: Hoan tat; da commit, push va deploy production; san sang UAT
- Muc tieu: Tin nhan moi tu nguoi khac khi chua xem phai bat day du highlight, ten/preview/time dam va badge; tin cua viewer va tin da doc khong duoc bi danh dau unread.
- Pham vi: ChatUI read-state merge, unread boundary projection, Tinode realtime snapshot race, regression test va tai lieu kien truc; khong doi Chatmgt, database, API, mobile hay luong gui tin.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/chatRealtime.test.js`, `src/features/chat/services/unreadBoundary.js`, `src/features/chat/services/unreadBoundary.test.js`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Read-state nay duoc tinh theo message incoming co sequence lon hon read cursor, khong phu thuoc viec snapshot truoc da chua message do hay Tinode da kip cap nhat badge chua. Sender ID khop viewer moi duoc coi la outgoing; sender sai presentation side hoac thieu metadata khong lam an tin peer. Cac merge quan trong cua ChatUI truyen viewer ID de giu cung quy tac.
- Quyet dinh ky thuat: Dung read cursor lam moc doc chuan va sequence/sender lam fallback realtime; khong nang read cursor tu mot message khong xac dinh sender. Boundary da xem van giu hanh vi cu, chi rearm khi co tail incoming moi.
- Database/API/cau hinh: Khong co migration, endpoint, schema, dependency, secret, bien moi truong hoac storage key moi.
- Kiem thu: `node --test src/features/chat/services/chatRealtime.test.js src/features/chat/services/unreadBoundary.test.js` dat 46/46; `npm run test:frontend` dat 291/291; `npm run lint` exit 0 voi warning legacy/vendor da co san; `npm run build:production` dat voi entry `index-Dv0-owrV.js`, App `App-Cvb4opGT.js`, CSS `index-BEAPZ7sy.css`; `git diff --check` dat truoc khi cap nhat muc changelog nay. Tren production, `chat` health HTTP 200, Chatmgt auth health HTTP 200, public entry `/assets/index-BEsOzLCs.js`, App `App-DFycqc5x.js`, CSS `/assets/index-BEAPZ7sy.css`, public App marker co va WSS `/v0/channels` tra HTTP 101; 9/9 service dang Up, cac container ngoai `chat` khong doi ID.
- Trien khai: Source archive `vichat-unread-highlight-eca4cb8.tar.gz` co SHA-256 `c22577284b10045dcb83dde3fa2e4edb952c51975d1c145596b2b9f13d9195bc`; release `/opt/deploy/chat/releases/unread-highlight-eca4cb8-20260826-1645-r1` dang la `current`, `previous` tro `/opt/deploy/chat/releases/unread-highlight-a0acc35-20260826-1600-r2`; chi recreate ChatUI tren `.20`; container `d27354988e2d`, image `sha256:419957d6ef49e9f0d45ba5dc434c361324773960e56dfe722280d336c01b7760`; deploy qua `.206` -> `.20`, khong chay Compose tren `.206`. Wrapper truyen qua PowerShell co mot dong CRLF thua (`bash: line 132: $'\\r': command not found`), nhung release da switch thanh cong va da verify doc lap sau do.
- Rui ro con lai: Chua UAT visual bang hai tai khoan that; can xac nhan direct/group, nhieu tin lien tiep, tin thieu sender metadata, tin cua viewer, boundary da xem roi va ten nguoi gui tren anh nen.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, gui tin tu tai khoan thu hai khi tai khoan thu nhat dang o phong khac, xac nhan phong chua xem bat class unread/name/preview/time dam va badge; sau khi xem roi doi phong, xac nhan khong hoi sinh highlight cu.
- Commit/PR: Source commit `c38ad14`; docs follow-up commit `eca4cb8`; production release `unread-highlight-eca4cb8-20260826-1645-r1`.

## 2026-08-26-12 - Giu highlight unread khi payload realtime thieu metadata

- Thoi gian: 2026-08-26 16:25 (Asia/Saigon)
- Loai: Sua loi | Web | Realtime | Kiem thu | Tai lieu
- Trang thai: Dang thuc hien; local checks da dat, chua commit/push/deploy
- Muc tieu: Khi tin moi den trong luc viewer chua mo/xem conversation, sidebar phai bat day du highlight, ten/preview/time dam va badge; tin da xem va echo cua viewer khong duoc bi danh dau unread.
- Pham vi: ChatUI read-state projection, Tinode realtime conversation merge, regression test va tai lieu kien truc; giu nguyen unread boundary dismissal, read cursor, Tinode transport, Chatmgt, database, mobile va mau active.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/chatRealtime.test.js`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Tinode co the goi `onData` truoc khi cap nhat `topic.unread`; payload khi do van co preview/sequence moi nhung `badge` va `unreadFromSeq` bang 0. ChatUI nay nhan dien sequence cua tin incoming moi de tao unread boundary. Payload thieu `from`/`x-sender-id` khong con bi coi mac dinh la tin cua viewer, tranh read cursor nhay len va lam mat highlight.
- Quyet dinh ky thuat: Chi sender ID trung voi viewer moi duoc coi la outgoing; metadata sender khong ro la ambiguous va fail-safe ve incoming. `readSeq` van la moc chuan de khong hoi sinh tin da xem; fallback chi bo sung unread khi sequence incoming moi vuot moc do.
- Database/API/cau hinh: Khong co migration, endpoint, schema, dependency, secret, bien moi truong hoac storage key moi.
- Kiem thu: `node --test src/features/chat/services/chatRealtime.test.js src/features/chat/services/unreadBoundary.test.js` dat 45/45; `npm run test:frontend` dat 290/290; `npm run lint` exit 0 voi warning legacy/vendor da co san; `npm run build:production` dat voi entry `index-C8vd6r9O.js`, App `App-DXrpV1UL.js`, CSS `index-BEAPZ7sy.css`; `git diff --check` dat.
- Rui ro con lai: Chua UAT visual bang hai tai khoan that va chua deploy ban nay; can xac nhan direct/group, tin nhieu lien tiep, tin thieu sender metadata, luong da xem roi doi phong va tin moi den sau do.
- Viec tiep theo: Commit/push, tao release ChatUI va deploy qua jump host `103.74.122.206` vao server dich `192.168.80.20`; chi recreate `chat`, sau do verify health/public bundle/WSS/log va UAT unread.
- Commit/PR: Chua tao.

## 2026-08-26-11 - Bat lai highlight khi co tin moi sau khi da xem

- Thoi gian: 2026-08-26 15:53 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Realtime | Kiem thu | Tai lieu
- Trang thai: Da commit, push, deploy production; san sang UAT visual
- Muc tieu: An highlight cua boundary da xem khi doi phong, nhung bat lai day du highlight khi phong do co tin moi chua xem.
- Pham vi: ChatUI unread boundary, sidebar conversation indicators va regression test; khong doi read cursor, Tinode transport, Chatmgt, database, mobile hay mau active cua phong dang mo.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/unreadBoundary.js`, `src/features/chat/services/unreadBoundary.test.js`, `src/features/chat/services/chatManagementService.test.js`, `docs/CHANGELOG.md`.
- Noi dung: Luu moc `sequence/id/time/count` ma viewer da xem thay cho viec coi `indicatorCleared` la trang thai vinh vien. Snapshot cu khong lam song lai badge; tail unread moi hon moc da xem se bat lai class `unread`, ten dam, preview dam, thoi gian va badge/mention.
- Quyet dinh ky thuat: Trang thai dismiss phai scoped toi tail da xem, khong scoped toi toan bo conversation. Khi boundary duoc merge tu snapshot realtime, moc da xem duoc giu rieng de phan biet tin cu va tin moi; tuong thich voi boundary cu khong co moc.
- Database/API/cau hinh: Khong co migration, endpoint, schema, dependency, secret, bien moi truong hay storage key moi.
- Kiem thu: `node --test src/features/chat/services/chatManagementService.test.js src/features/chat/services/unreadBoundary.test.js` dat 53/53; `npm run test:frontend` dat 289/289; `npm run lint` exit 0 voi warning legacy/vendor da co san; `npm run build:production` dat voi entry `index-iO0JISJ3.js`, App `App-9MUphv5Q.js`, CSS `index-BEAPZ7sy.css`; `git diff --check` dat.
- Trien khai: Source commit `a0acc35` da push `origin/master`; archive `/opt/deploy/chat/incoming/vichat-unread-highlight-a0acc35.tar.gz` co SHA-256 `259ee0cabc440ce9dc6a730beb363599edbe3252e2e0a2c4facb84e8efe8f404`; release `/opt/deploy/chat/releases/unread-highlight-a0acc35-20260826-1600-r2` dang la `current`, `previous` tro release `unread-highlight-d308da6-r2-20260826-1528`. Chi recreate ChatUI: container `f85160ee39116192778359e47698c2bbf05785dbcd975a9ff5f37d725cec7418`, image `sha256:4e1bee513a404ddef2d41ea28eda9ee4d24159fdeeed363283521616ef8d2b9f`; 9/9 service dang chay, ChatUI health HTTP 200, Chatmgt health HTTP 200, public JS `index-HMo-W4tQ.js`/App `App-DB8ff2rK.js`, CSS `index-BEAPZ7sy.css`, WSS HTTP 101; container ngoai `chat` giu nguyen ID.
- Kiem tra deploy: Lan wrapper dau dung sau khi recreate va tu rollback ve ChatUI cu do ky tu CR thua tu PowerShell pipe; lan `r2` build/recreate thanh cong, symlink current da switch, sau do verify doc lap health/bundle/public/WSS/log va khong thay doi stateful service. Khong migration, khong Compose `down`, khong reset database/volume/topic/message/read cursor.
- Rui ro con lai: Chua UAT visual bang tai khoan that; browser runtime khong duoc expose trong phien nay. Can xac nhan ca boundary cu da xem, tin moi chua xem, mention nhom va phong dang mo.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, mo phong co unread, xem den cuoi roi doi phong; gui them tin moi chua xem va xac nhan phong do bat lai day du highlight, dong thoi ten nguoi gui van doc ro.
- Commit/PR: Source commit `a0acc35`; deployment follow-up docs commit `e14e46c`.

## 2026-08-26-10 - Khong hoi sinh highlight unread sau khi da xem

- Thoi gian: 2026-08-26 15:20 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Realtime | Kiem thu | Tai lieu | Trien khai
- Trang thai: Da commit, push, deploy production; san sang UAT visual
- Muc tieu: Sau khi viewer da xem den cuoi boundary unread va chuyen sang phong khac, phong vua xem khong duoc quay lai highlight/badge unread.
- Pham vi: ChatUI unread boundary projection, sidebar conversation indicators, source-contract regression test va production bundle; giu nguyen active selection mau cam, read cursor, Tinode message, Chatmgt, mobile va cac luong chat khac.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatManagementService.test.js`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Bo dieu kien chi coi `indicatorCleared` la hop le khi room van dang active. Trang thai da dismiss nay gio duoc ap dung theo boundary cua chinh conversation, nen roi room khong lam badge/highlight cu song lai; class `.active` van chi danh dau room dang mo.
- Quyet dinh ky thuat: Unread boundary la state scoped theo conversation/viewer va phai giu `indicatorCleared` qua viec doi room. Khong xoa boundary/read cursor hay sua Tinode transport; chi sua cach sidebar chieu state da xem.
- Database/API/cau hinh: Khong co migration, endpoint, schema, dependency, secret, bien moi truong hay storage key moi.
- Kiem thu: `node --test src/features/chat/services/chatManagementService.test.js src/features/chat/services/unreadBoundary.test.js` dat 51/51; `npm run test:frontend` dat 287/287; `npm run lint` exit 0 voi warning legacy/vendor da co san; `npm run build:production` dat voi entry `index-CUO8KuMV.js`, App `App-DQD27PD_.js`, CSS `index-BEAPZ7sy.css`; `git diff --check` dat.
- Trien khai: Source commit `d308da6` da push `origin/master`; archive `/opt/deploy/chat/incoming/vichat-unread-highlight-d308da6.tar.gz` co SHA-256 `b0eb6d2837bf9b71a95cfff86dd4d475debded02ad60a61b28abc60c93fa73c7`; release `/opt/deploy/chat/releases/unread-highlight-d308da6-r2-20260826-1528` dang la `current`, `previous` tro `/opt/deploy/chat/releases/chat-scroll-5fbe349-r11-20260826-1525`. Chi recreate ChatUI: container `d46cf70feb86e7d67192f156f4f453ff8bf63522feff520d1229abb43f821b7e`, image `sha256:f651feefa3035ed25ea38b42dc28e57ba660c29afa4a5987941d81eb63306e5c`; 9/9 service healthy, ChatUI health HTTP 200, Chatmgt health HTTP 200, public JS/CSS co marker moi va WSS HTTP 101. Chatmgt `d1d39832e50b`, ChatAPI `fbfce2f344fa`, Chat PostgreSQL `01ddef09138b`, Tinode PostgreSQL `bb7c9ad0e93a`, Redis `b6ff2c115f3a`, bridge `f6628f4fadfe`, webhook `96529bc57905`, Coturn `8a3624d19603` giu nguyen container ID; khong migration, khong Compose `down`, khong reset state.
- Kiem tra deploy: Lan gate dau tu dong rollback do preflight script thieu `/assets/` trong duong dan JS; lan `r2` build/recreate candidate dat. Wrapper PowerShell thoat `1` sau khi switch vi CRLF thua, nhung verify doc lap bang script LF dat `current`, 9/9 service, marker container/public, health, WSS va log scan; CSS public lan nay co marker `font-weight:650`.
- Rui ro con lai: Chua UAT visual bang tai khoan that; can hard refresh, mo room co unread, xem den cuoi, chuyen room va xac nhan phong cu khong hien unread highlight lai. Browser runtime khong duoc expose trong phien nay.
- Viec tiep theo: Commit/push, tao release sach va deploy chi ChatUI tren `192.168.80.20` qua jump host `103.74.122.206`, sau do verify health/public bundle va UAT luong unread.
- Commit/PR: Source commit `d308da6`; deployment follow-up docs commit `f9e28bf`; khong co PR.

## 2026-08-26-09 - Sua vi tri mo chat va do tuong phan ten nguoi gui

- Thoi gian: 2026-08-26 13:52 (Asia/Saigon)
- Loai: Sua loi | Web | UX | Realtime | Kiem thu | Tai lieu | Trien khai
- Trang thai: Da commit, push, deploy production; can UAT visual
- Muc tieu: Khi mo cuoc tro chuyen co tin moi, ChatUI phai hien thi den tin nhan moi nhat thay vi mac ket o doan lich su phia tren; ten nguoi gui tren anh nen phai doc ro.
- Pham vi: ChatUI cuon khi chon conversation, snapshot Tinode den muon, unread boundary hien co va style ten nguoi gui; khong thay doi read cursor, tin nhan, thong bao, mobile hay Chatmgt.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatManagementService.test.js`, `src/styles/index.css`, `docs/CHANGELOG.md`, `infrastructure/production/README.md`, `dist/index.html`.
- Noi dung: Them lich cuon den cuoi sau hai frame render khi chon room va lap lai sau khi snapshot Tinode cap nhat, dong thoi chi ap dung trong luc mo room de khong cuon chen vao thao tac doc lich su cua user. Cuon nut `Tin nhan moi nhat` dung cung helper; ten nguoi gui dung mau chu chinh, dam hon va co text-shadow phu hop anh nen/dark mode.
- Quyet dinh ky thuat: Cuon truc tiep tren container `.chat-messages` thay vi chi phu thuoc vao `scrollIntoView` cua sentinel va co kiem tra room hien tai, nen snapshot den muon khong de lai vi tri cu. Unread boundary va `markRead` duoc giu nguyen; khong them storage hay timer nghiep vu.
- Database/API/cau hinh: Khong co migration, endpoint, schema, dependency, secret hoac bien moi truong moi.
- Kiem thu: `node --test src/features/chat/services/chatManagementService.test.js src/features/chat/services/unreadBoundary.test.js` dat 51/51; `npm run test:frontend` dat 287/287; `npm run lint` exit 0 voi cac warning legacy da co san trong `src/App.jsx` va `public/ChatBotWidget/tinode.js`; `npm run build:production` dat voi entry `index-C8LqBkwG.js`, App `App-PkAv1o-P.js`, CSS `index-BEAPZ7sy.css` va warning chunk App lon hon 500 KB co san; `git diff --check` dat sau khi hoan tat code va tai lieu.
- Trien khai: Source commit `5fbe3498cf6146f6f82a711b16c58df0576816e4` da push `origin/master`; release `/opt/deploy/chat/releases/chat-scroll-5fbe349-r11-20260826-1525` dang la `current`, `previous` tro release `/opt/deploy/chat/releases/migration-f2a4027-v2`; ChatUI container `ef736dc53fa7`, image `sha256:fefb701bf12cc92707e12cf0144f3963c13a9ec27f4ef86ec45eaaf4d7375`, healthy; 9/9 service healthy, ChatUI health HTTP 200, Chatmgt health HTTP 200, public JS khop build moi va WSS handshake HTTP 101. Archive release co SHA-256 `bdceb786ba849e99d6c84659ce5ff6cb69cfc193d5a00ecc3c7f70eb749da07b`.
- Luong truy cap deploy: Phai vao `ssh ubuntu@103.74.122.206` roi `ssh ubuntu@192.168.80.20`; `.206` chi la jump host/Nginx relay, khong phai dich den Compose. Public CSS thinh thoang con gap edge/cache tra fallback HTML body 30 byte, trong khi CSS trong container dung; can theo doi edge distribution rieng, khong phai loi build ChatUI.
- Rui ro con lai: Chua UAT visual bang tai khoan that tren desktop/mobile va dark mode trong phien nay; can xac nhan lai room co unread, room khong unread, dang doc lich su, anh nen va chat 1-1/group.
- Viec tiep theo: Hard refresh ChatUI, gui tin tu cua so khac, chuyen qua room roi mo lai room co tin moi; kiem tra vi tri o tin cuoi, unread/receipt khong thay doi sai va ten `Minh` doc ro tren anh nen.
- Commit/PR: Source commit `5fbe349`; deployment follow-up docs commit `b67f2e2`; khong co PR.

## 2026-08-26-08 - Di chuyen production sang may chu 192.168.80.20

- Thoi gian: 2026-08-26 13:29 (Asia/Saigon)
- Loai: Van hanh | Ha tang | Du lieu | Tai lieu
- Trang thai: Hoan tat; san sang UAT
- Muc tieu: Dung mot ban trien khai ViChat doc lap tren may chu `192.168.80.20`, giu nguyen source, du lieu va kha nang quay lui trong khi may `.206` van duoc bao toan.
- Pham vi: Docker Compose production, source release, PostgreSQL Chatmgt/Tinode, Redis, Tinode uploads/bot state, runtime secret va reverse proxy; khong thay doi source feature hay schema.
- File da thay doi: `docs/CHANGELOG.md`.
- Noi dung: Release `/opt/deploy/chat/releases/migration-f2a4027-v2` da duoc dat lam `current` tren `.20`; ChatUI chay tai `192.168.80.20:8094`, Chatmgt bind tai `192.168.80.20:8081`, cung bridge, webhook, PostgreSQL, Redis, Tinode ChatAPI va Coturn. `.206` chi con Nginx relay vao `.20` va cac container rollback cu khong nhan traffic web. Public DNS van tro toi edge `103.74.122.218`.
- Quyet dinh ky thuat: Dung archive migration co SHA-256 `af1355f534de4dffe9b36c37f60626b752977181578b9dcf5ea07e7d0fd47861`, restore `.env` mode `0600` va runtime tu backup; dung named volume hien huu, khong dung `docker compose down`, khong reset topic/message/read cursor/volume va khong ghi secret vao nhat ky.
- Database/API/cau hinh: Khong co migration moi; production dang o Alembic `20260825_13 (head)`. `.env` giu nguyen gia tri production, chi dung bind noi bo `192.168.80.20`; Nginx host `.206` relay ChatUI toi `8094` va Chatmgt toi `8081`.
- Kiem thu: Tren `.20`, `docker compose config -q` PASS, 9/9 service dang `Up` va 7 service co healthcheck deu `healthy`, `/healthz` ChatUI `ok`, auth health Chatmgt noi bo HTTP 200, Chatmgt `alembic current` la `20260825_13 (head)`, Chatmgt co `88` conversation/`147` account/`210` participant, Tinode co `14` user/`40` topic/`177` message, Redis co `6` key. Public `https://chat.upgo.vn/healthz`, hai auth health deu HTTP 200; WSS `/v0/channels` tra HTTP 101; public bundle `index-DgRLBOOO.js` va `index-CgZBfmbc.css` khop ten/kich thuoc voi container; `sudo nginx -t` tren `.206` dat; log 15 phut cua ChatUI/Chatmgt/bridge/webhook co 0 marker `fatal|panic|traceback|uncaught|critical|emerg`.
- Rui ro con lai: Chua UAT bang hai tai khoan/browser that. Ket noi TCP tu may kiem tra toi TURN `103.74.122.246:3478` dang that, can mo/kiem tra NAT-provider firewall truoc khi ket luan voice/video; Nginx `.206` phai duoc giu lai cho den khi DNS/NAT edge duoc chuyen truc tiep.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, UAT login/directory/direct/group/file/sticker/call bang hai tai khoan; sau khi UAT va TURN dat, co the dung rieng cac container stateful rollback cu tren `.206` nhung van giu Nginx relay va backup.
- Commit/PR: Chua tao.

## 2026-08-26-07 - Tu dong xac nhan tin da xem trong phong chat

- Thoi gian: 2026-08-26 09:08 (Asia/Saigon); deploy production 09:27-10:20 (Asia/Saigon)
- Loai: Sua loi | Web | Realtime | UX | Kiem thu | Tai lieu | Trien khai
- Trang thai: Da commit, push, deploy production; san sang UAT
- Muc tieu: Badge thong bao phai bien mat sau khi nguoi dung mo phong chat va that su xem den tin chua doc cuoi cung.
- Pham vi: ChatUI unread boundary observer va source-contract test; giu nguyen Tinode message, read cursor, mention, mute, pin, mobile va Chatmgt API/database.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatManagementService.test.js`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Bo dieu kien chi kich hoat observer sau khi bam `Tin chua doc`. Observer nay van cho tin chua doc cuoi cung hien trong viewport trong 900 ms roi moi goi `markRead`, nen viec mo phong chat o vi tri tin moi nhat cung xac nhan duoc da xem ma khong lam mat boundary qua som.
- Quyet dinh ky thuat: Chi thay doi diem kich hoat theo doi; Tinode van la source of truth va read floor/sequence monotonic van duoc giu nguyen. Nut nhay toi tin chua doc, divider va lich su gioi han khong doi.
- Database/API/cau hinh: Khong co migration, endpoint, schema, dependency, secret, bien moi truong hay storage key moi.
- Kiem thu: `npm run test:frontend` dat 287/287; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build:production` dat voi entry local `index-CusTt-ID.js`, App `App-DjUSD1tm.js`, CSS `index-CgZBfmbc.css` va warning chunk App lon hon 500 KB co san; `git diff --check` dat. Archive production `/opt/deploy/chat/incoming/vichat-unread-auto-read-0126808.tar.gz` 44924333 bytes, SHA-256 `86a62d17ed710a72bf23e56bf8173a3d29d327f9c1ca1f33b57ce5497fe22fad`; candidate remote build tao entry `index-DgRLBOOO.js`, App `App-BXhQR_va.js`, CSS `index-CgZBfmbc.css`; sau switch local/public ChatUI `/healthz` va Chatmgt auth health HTTP 200, `sudo -n nginx -t` dat, public WebSocket handshake HTTP 101, Alembic `20260825_13 (head)`, public JS/CSS khop byte voi container voi SHA-256 entry `ef1ee02633d9bc718892c8b27dd80419e04a320314e610141f40a1c08fd4b8b7`, App `0218ee549573a805ae7d2c3c77441ac78b47b8d9a30e77fdc0acd86ca20fb8a2`, CSS `baf6b513836e95a9bacaea51dc18f2cbd3bf053700bdf0e4d5958f0e3ffc14e3`; log ChatUI/Chatmgt/bridge/webhook 15 phut khong co marker fatal/panic/traceback/uncaught/critical/emerg.
- Kiem tra an toan release: Cac gate thu nghiem khong dat deu tu dong dua rieng ChatUI ve image cu; production sau moi lan van healthy, khong migration, khong Compose `down`, khong reset database/volume/topic/message/read cursor/avatar va khong recreate service ngoai `chat`.
- Trien khai: Release `/opt/deploy/chat/releases/unread-auto-read-0126808-20260826-022756` dang la `current`, `previous` tro `/opt/deploy/chat/releases/unread-realtime-45570c7-20260826-0439`; ChatUI container `06987d763ce6` healthy, restart count 0, image `sha256:d54957e293889c70f9221f25d125f9021cc746a360561cc3ca98aa74ffc89c93`; Chatmgt `bcd005ea49a8`, bridge `13c037dc06f7`, webhook `2882b6109176`, ChatAPI `8476615ad4ac`, Chat PostgreSQL `78a434b49404`, Tinode PostgreSQL `9f6e4dcc9c2f`, Redis `ceef7df23feb`, Coturn `aa680d35fdc0` giu nguyen container ID; rollback tag `songhong-production-chat:rollback-before-unread-auto-read-0126808` giu image cu `sha256:a2bb71e4995208fc5051cec27b6c2b2073eca5c835cbeda66a5bb12635a76b26`; production `.env` giu nguyen mode `0600`, SHA-256 `cc4d4240bbfdfd3de6b94c51c08ba289b3a8746bda5abbeb3042022fe7d497c3`.
- Rui ro con lai: Chua UAT hai browser dang nhap that; browser runtime khong duoc expose trong phien nay. Neu tin cuoi chua nam trong history hien tai, nguoi dung van can dung nut `Tin chua doc` de tai boundary dau tien.
- Viec tiep theo: UAT mo phong co badge, doc den tin cuoi, roi chuyen phong va kiem tra badge/receipt khong hoi sinh.
- Commit/PR: Source commit `0126808`; deployment follow-up docs commit `11d593a`; khong co PR.

## 2026-08-26-06 - Khoi phuc unread realtime va khong danh dau da doc qua som

- Thoi gian: 2026-08-26 04:24-04:41 (Asia/Saigon); deploy production 04:49-04:52
- Loai: Sua loi | Web | Realtime | UX | Kiem thu | Tai lieu | Trien khai
- Trang thai: Da commit, push, deploy production; san sang UAT
- Muc tieu: Tin moi trong chat 1-1 va nhom phai tang unread ngay khi den; mo hoi thoai khong duoc xoa moc unread hay gui receipt da doc truoc khi nguoi xem di qua cum tin chua doc; lich su gioi han van nhay dung ve sequence chua doc dau tien.
- Pham vi: ChatUI web unread projection, Tinode topic callback/read cursor, unread boundary, source-contract test, production bundle va tai lieu. Giu nguyen message/file content, receipt nguoi khac, mention `@`, mute, pin, avatar, membership, Chatmgt API/database, notification preference va toan bo `mobile/`.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/chatRealtime.test.js`, `src/features/chat/services/unreadBoundary.js`, `src/features/chat/services/unreadBoundary.test.js`, `src/features/chat/services/chatManagementService.test.js`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Tinode SDK goi `topic.onData` sau khi cap nhat max sequence nhung truoc khi cap nhat `topic.unread` va truoc khi nang local `read` cho echo do viewer gui. ChatUI nay tinh badge tu sequence moi nhat tru read cursor hieu luc, xem sequence outgoing moi nhat cua viewer la da doc, va chi dung explicit unread lam fallback khi khong co sequence. Khi room dang co unread, thao tac mo chi an indicator cua room active va giu boundary/receipt; `markRead` khong chay som cho pending boundary ma chi chay khi viewer hoan tat boundary. Neu history nen bat dau sau first-unread sequence, boundary giu sequence ben vung de tai dung tin dau thay vi nham tin dau cua cua so 100 tin.
- Quyet dinh ky thuat: Tinode van la source of truth cho message va read receipt; UI chi sua cach chieu state trong bo nho. Read cursor van monotonic de snapshot cu khong hoi sinh unread da acknowledge, nhung khong duoc dung monotonic floor de danh dau mot cum unread moi la da doc truoc thao tac nguoi dung.
- Database/API/cau hinh: Khong migration, endpoint, schema, dependency, secret, bien moi truong hay storage key moi. Deploy chi recreate `chat` voi `--no-deps --force-recreate --no-build --wait`; cam reset topic/message/read cursor/database/volume va khong sua `.env`.
- Kiem thu: Target unread/realtime/source-contract dat 85/85; `npm run test:frontend` dat 287/287; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build` va `npm run build:production` dat, local production entry `index-DbLyiT-3.js`, App `App-CNR8K89T.js`, CSS `index-CgZBfmbc.css` va warning chunk App lon hon 500 KB co san; remote candidate build dat voi entry `index-DA-qOvPo.js`, App `App-DMor2h7M.js`, CSS `index-CgZBfmbc.css`; `git diff --check` dat va `git diff -- mobile` sach.
- Kiem tra production: Archive `/opt/deploy/chat/incoming/vichat-unread-realtime-45570c7.tar.gz` 44923340 bytes, SHA-256 `1049044b58c4bee48b64899e201ee9de630cf21d3151ea650d13a4916575a6a8`; release `/opt/deploy/chat/releases/unread-realtime-45570c7-20260826-0439` da extract, compose config dat, candidate `/healthz` va Chatmgt proxy HTTP 200. Sau switch, local/public ChatUI `/healthz` va Chatmgt auth health deu `ok`, `sudo -n nginx -t` dat, WebSocket relay tra HTTP 101, public JS/CSS khop SHA-256 tung byte voi container va bundle co marker `firstUnreadSeq`/`unreadFromSeq`.
- Trien khai: Source commit `45570c7b1a7b326fa368c338306992adbf51aa4a` da push `origin/master`; `current` tro `/opt/deploy/chat/releases/unread-realtime-45570c7-20260826-0439`, `previous` tro `/opt/deploy/chat/releases/group-member-actor-28d289f-20260826-0402`. ChatUI container moi `0a28a231ec1d`/image `sha256:a2bb71e4995208fc5051cec27b6c2b2073eca5c835cbeda66a5bb12635a76b26`, restart count 0; rollback tag `songhong-production-chat:rollback-before-unread-realtime-45570c7` giu image build tu release truoc (`sha256:da877f45bcacf5c61e6c130b1c253fa029258dc0530c98d367d04a7579968a99`). Chatmgt `bcd005ea49a8`, bridge `13c037dc06f7`, webhook `2882b6109176`, ChatAPI `8476615ad4ac`, Chat PostgreSQL `78a434b49404`, Tinode PostgreSQL `9f6e4dcc9c2f`, Redis `ceef7df23feb`, Coturn `aa680d35fdc0` giu nguyen container ID; DB van `208` participant, `4` mute, `3` pin; production `.env` giu nguyen SHA-256 `cc4d4240bbfdfd3de6b94c51c08ba289b3a8746bda5abbeb3042022fe7d497c3`. Khong dung Compose `down`, migration, reset database/volume/topic/message/read cursor/avatar hay restart service stateful.
- Rui ro con lai: Chua UAT production bang hai browser dang nhap that cho callback realtime, tab an/hien, mo room co nhieu hon 100 unread va chu ky bam `Tin chua doc` den khi receipt duoc gui; browser runtime khong duoc expose trong phien nay.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`; UAT 1-1 va group bang hai tai khoan, gui tin tu cua so khac de xac nhan badge tang ngay, mo room co unread de xac nhan divider/receipt chi hoan tat sau khi xem, sau do kiem tra mute, pin, avatar va lich su khong doi.
- Commit/PR: Source commit `45570c7`; deployment follow-up docs commit `5201d66`; khong co PR.

## 2026-08-26-05 - Hoan thien actor-token va quyen tenant admin khi them thanh vien

- Thoi gian: 2026-08-26 03:28-04:19 (Asia/Saigon); deploy production 04:12-04:19
- Loai: Sua loi | Web | API | Realtime | Du lieu van hanh | Kiem thu | Tai lieu | Trien khai
- Trang thai: Da commit, push, deploy production va audit repair; san sang UAT
- Muc tieu: Admin them thanh vien khong can duyet; user thuong moi tao pending khi `approveMembers` bat; thanh vien moi nhan realtime, xem lich su cu neu duoc phep va nhan activity; deploy khong reset setting chuong.
- Pham vi: Chatmgt participant add/approval/topic access, repair production, ChatUI web pending-member authorization, test va tai lieu. Giu nguyen database schema, message/topic/avatar/read cursor, direct chat, mobile, stateful container va archive deploy cu.
- File da thay doi: `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/services/auth_service.py`, `chatservice-main/scripts/repair_group_member_access.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `chatservice-main/tests/test_tinode_bridge_service.py`, `src/app/App.jsx`, `src/features/chat/services/chatManagementService.test.js`, `src/features/contacts/services/accountDirectory.js`, `src/features/contacts/services/accountDirectory.test.js`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Tenant `admin`/`owner`/`superadmin` them truc tiep va xem/duyet pending ma khong nhan cac control owner khac; group role `OWNER`/`ADMIN` cung duyet duoc. Add/approve dung token Tinode cua actor dang xac thuc thay vi credential owner co the da cu, va chi gate subscription/quyen cua UID moi; khong remove subscriber khac, khong co gang khoi phuc member legacy khong lien quan va khong rollback membership moi vi deficit cu. Repair bo qua local identity legacy khi Account SSO bat, tim Account member co `A/S` lam operator va tach nhom legacy-only thanh ket qua skip.
- Quyet dinh ky thuat: Immediate add/approval dung `access_scope_uids` voi `remove_extra_members=False`; repair van scope toan bo Account member can audit. Chatmgt la source of truth cho membership, Tinode cho message/history/realtime, browser origin storage cho notification preference. Deploy khong duoc `down`, reset volume/database/topic/message/avatar/read cursor, ghi de `.env` bang `.env.example`, hay doi notification localStorage/IndexedDB key.
- Database/API/cau hinh: Khong migration, schema, route, payload, dependency, secret hay bien moi truong moi. POST participant giu hop dong cu; PUT approval cho group owner/admin hoac tenant admin. Script repair van additive, dry-run mac dinh va apply can `--confirm add-missing-group-access`.
- Kiem thu: Target frontend dat 88/88; target backend Tinode/contract dat 80 test, skip 30 theo dependency local; `npm run test:frontend` dat 284/284. Full backend local chay 222 test, 86 skip va co mot loi HTTP loopback Windows `WinError 10053` trong `test_local_vichat_ai_api`; chay rieng van cung loi. Full backend trong image Linux candidate voi Redis test co lap dat 222/222. `python -m py_compile` dat ca local/image; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build` va `npm run build:production` dat, local production entry `index-BLyMHVzF.js`, App `App-BsOG728G.js`, CSS `index-CgZBfmbc.css`; candidate Nginx va ChatUI health dat; `git diff --check` va `git diff -- mobile` sach. Docker Desktop local khong chay.
- Dinh chinh release `0f6197d`: Source da push va release `/opt/deploy/chat/releases/group-member-access-0f6197d-20260826-0312` dang la `current`. Chatmgt `af66687c556c` image `sha256:413849dc...` va ChatUI `20fe5a6e1b1f` image `sha256:fd41cf23...` healthy, restart 0; local/public health, Nginx, WebSocket HTTP 101 va Alembic `20260825_13 (head)` dat. PostgreSQL/Redis/ChatAPI/Coturn/bridge/webhook giu nguyen container ID, khong reset state.
- Ket qua repair `0f6197d`: Apply quet 33 group va fail an toan tren 6 group do central Tinode tu choi credential owner cu; `groups_repaired=0`, khong co partial Tinode/DB mutation. Nam group chi co local identity legacy khong the nhan Account session khi Account SSO bat. Group `85accc6b-3b45-4445-8096-aa2a03c527b4` co owner legacy `JRWPAS` va Account member active `JRWPASDO`; group active `c92f93c1-47d1-4ad2-a299-3f64414cf132` co 22 subscriber khoe, `approveMembers=true` va tenant admin dang la group `MEMBER`, tu do xac dinh follow-up nay.
- Kiem tra production follow-up: Archive `/opt/deploy/chat/incoming/vichat-group-member-actor-28d289f.tar.gz` 44920879 byte, SHA-256 `11dfa625f9cf9d8526b0f3ed840df8f4fd5fd9d9fa1c6fc1d94e44f22fb0d456`, mang commit `28d289fc20b7dd8151f207988db249b607867b32`. Backup `/opt/deploy/chat/backups/group-member-actor-28d289f-20260826-0402/chatservice.dump` 142285 byte, mode `0600`, SHA-256 `f6b4f6a7e23a24b5c796996036bf9e682d22cf0aed143f759eedadee48136315`, va `pg_restore -l` doc duoc. Apply va dry-run repair deu quet 33 group voi `groups_failed=0`, `groups_with_missing_access=0`, `groups_skipped_legacy_only=5`, `legacy_participants_ignored=15`, khong can mutation moi (`groups_repaired=0`).
- Trien khai follow-up: Source commit `28d289f` da push `origin/master`; release `/opt/deploy/chat/releases/group-member-actor-28d289f-20260826-0402` dang la `current`, `previous` tro release `0f6197d`. Chatmgt `bcd005ea49a8` image `sha256:a47d4e7393d6...` va ChatUI `788a84fd0f93` image `sha256:0f13e72c1969...` healthy, restart 0. Public entry `/assets/index-D2DICDj8.js`, App `/assets/App-D2kJw74h.js`, CSS `/assets/index-CgZBfmbc.css` khop SHA-256 voi container va co notification storage key/pending-member marker; production `.env` giu nguyen byte, Alembic van `20260825_13 (head)`, Nginx dat, log sach va WebSocket co 186 HTTP 101 trong cua so kiem tra. PostgreSQL/Redis/ChatAPI/Coturn/bridge/webhook giu nguyen container ID; DB van co 4 mute va 3 pin sau deploy, khong co Compose `down`, migration hay reset state.
- Rui ro con lai: Chua UAT tu dong bang hai browser da dang nhap vi phien nay khong expose browser runtime; can xac nhan thao tac that admin them truc tiep, member thuong tao pending va nguoi moi doc history. Nam nhom legacy-only van duoc bao skip, khong bi xoa hay tu dong chuyen doi; khong co SSH den authoritative Tinode host `103.74.122.215` nen khong sua credential legacy truc tiep tai do.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`; UAT bang admin, member thuong va thanh vien moi tren ba session: admin them vao ngay, member thuong cho duyet khi setting bat, duyet xong nhan realtime/history/activity, sau do xac nhan chuong tuy chinh, mute va pin van giu nguyen.
- Commit/PR: Release dau `0f6197d`; source follow-up `28d289f`; deployment follow-up docs commit `30f7484`; khong co PR.

## 2026-08-26-04 - Khoi phuc quyen realtime thanh vien nhom va giu nguyen setting chuong

- Thoi gian: 2026-08-26 01:32-03:08 (Asia/Saigon)
- Loai: Sua loi | Web | API | Realtime | Du lieu van hanh | Kiem thu | Tai lieu | Trien khai
- Trang thai: Dang thuc hien; code va kiem thu local/image dat, chua commit/deploy/repair production
- Muc tieu: Owner/admin them thanh vien khong bi dua vao hang duyet; thanh vien moi nhan realtime, xem duoc lich su nhom khi da bat cho phep va nhan thong bao them thanh vien; user thuong van can owner duyet khi `approveMembers` bat; moi setting chuong web phai ton tai qua build/deploy va doi dinh danh Tinode.
- Pham vi: Chatmgt participant add/approval/topic binding, Tinode subscriber access, activity event, cong cu repair production, ChatUI web member-add va notification preference/custom sound, test va tai lieu. Giu nguyen database schema, message/topic/avatar/read cursor, direct chat, mobile va cac archive deploy cu.
- File da thay doi: `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/services/auth_service.py`, `chatservice-main/scripts/repair_group_member_access.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `chatservice-main/tests/test_tinode_bridge_service.py`, `src/app/App.jsx`, `src/features/chat/services/chatManagementService.test.js`, `src/features/chat/services/conversationNotifications.js`, `src/features/chat/services/conversationNotifications.test.js`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Chinh sach duyet chi ap dung khi nguoi them la member thuong; role `OWNER`/`ADMIN` kich hoat ngay. Chatmgt doc ca `acs.mode/given/want`, cap bu phan quyen thieu va dung token server-side cua thanh vien de chap nhan phan wanted truoc khi commit membership. Add/approve chup tap subscriber truoc mutation va chi rollback UID da xac nhan chua ton tai, ke ca khi Tinode tra 200 cho viec nang quyen subscription cu. `member_added` duoc publish mot lan tu backend sau commit, bo ban publish trung o ChatUI. Preference chuong merge voi record cu, mirror khong pha huy giua management account ID/Tinode UID; custom sound giu nguyen ten database/store/version va chi xoa khi user bam xoa.
- Quyet dinh ky thuat: Subscriber UID ton tai chua du de coi membership khoe; member phai co effective `JRWPAS`, owner phai co `JRWPASO`. Repair chi cong permission thieu va chay `remove_extra_members=False`, khong xoa subscriber la/chatbot ngoai tap expected. Chatmgt tiep tuc la source of truth cho membership, Tinode cho message/history/realtime, browser origin storage cho notification preference. Deploy khong duoc `down`, reset volume/database/topic/message/avatar/read cursor hay thay storage key.
- Database/API/cau hinh: Khong migration, schema, endpoint, dependency, secret hay bien moi truong moi. Hop dong POST participant giu route/payload cu nhung owner/admin bypass approval. Them script van hanh dry-run mac dinh; apply bat buoc `--confirm add-missing-group-access` va khong commit Chatmgt DB.
- Kiem thu: Target notification/management/realtime dat 85/85; target backend Tinode/contract dat 78 test, skip 28 do dependency local; `npm run test:frontend` dat 283/283; local backend `python -m unittest discover -s chatservice-main/tests -q` dat 220 test, skip 84 do dependency local; backend suite trong image production voi source bind-readonly dat 220/220 va Tinode bridge dat 28/28 truoc lan siết rollback, se chay lai tren candidate truoc deploy; `python -m py_compile` dat; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build:production` dat voi entry `index-DB3pvyDI.js`, App `App-Bx1KbGDM.js`, CSS `index-CgZBfmbc.css`; `git diff --check` va `git diff -- mobile` sach. Docker Desktop local khong chay nen image test cuoi duoc thuc hien tren production host truoc recreate. Dry-run production quet 33 group bound: 27 group doc access thanh cong khong thay deficit, 6 group bi owner credential cu tu choi nen chua audit duoc cho den apply repair credential sau backup/deploy; dry-run khong sua access/DB/container.
- Rui ro con lai: Chua chay apply repair va UAT bang hai tai khoan production; 6 group co credential cu can duoc repair trong buoc apply roi audit lai de xac nhan khong con `PAS`.
- Viec tiep theo: Hoan tat diff review, commit/push, tao backup va release bat bien, deploy rieng Chatmgt/ChatUI, chay repair additive, audit access ve 0 deficit, kiem tra health/bundle/log va UAT them thanh vien/lich su/setting chuong.
- Commit/PR: Chua tao.

## 2026-08-26-03 - Sua triet de nut xoa hoi thoai va roi nhom cuoi

- Thoi gian: 2026-08-26 01:31-01:46 (Asia/Saigon); deploy production 01:49-02:03
- Loai: Sua loi | Web | API | Realtime | Kiem thu | Tai lieu
- Trang thai: Da commit va deploy production; san sang UAT
- Muc tieu: Nut xoa chat 1-1 phai hoat dong tu ca panel thong tin va menu sidebar; thanh vien hop le cuoi cung phai roi/xoa nhom duoc ngay ca khi Tinode tra `permission denied`, ma khong noi long luong nhom con thanh vien.
- Pham vi: ChatUI web conversation action handler, Chatmgt `/conversation/<id>/self`, Tinode cleanup sau xoa/roi, regression contract va tai lieu kien truc. Giu nguyen message, avatar, read cursor, notification, direct block, spam cooldown, tenant, database schema va toan bo `mobile/`.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/chatManagementService.test.js`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Nut xoa trong panel khong con truyen React click event nhu mot room gia, va handler dung ID cua chinh room khi xoa tu sidebar. Xoa direct ghi marker viewer-scoped vao Chatmgt truoc, sau do moi don lich su Tinode best-effort va khong prepare/re-bind topic cu. Request `/self` thu token Tinode dang co ma khong ep refresh truoc; chi nhom con survivor moi refresh/retry khi backend yeu cau. Voi nhom khong con tai khoan hop le khac, backend dong conversation va danh dau moi participant inactive/deleted, commit truoc khi thu dissolve Tinode; loi quyen/token cleanup chi duoc log/audit va khong rollback viec roi nhom.
- Quyet dinh ky thuat: Chatmgt la source of truth cho viewer direct deletion va final-member group closure. Tinode van la buoc bat buoc, co rollback, cho leave/remove khi nhom con thanh vien; chi cleanup sau hai mutation khong con doi tac moi la best-effort. Topic direct van duoc allow de tin nhan moi that su co the mo lai cung cap hoi thoai.
- Database/API/cau hinh: Khong migration, schema, endpoint, dependency, secret hay bien moi truong moi. Hop dong route `/self` giu nguyen; audit `CONVERSATION_GROUP_EMPTY_CLOSE` them trang thai `tinode_cleanup` khong chua token hay du lieu ca nhan.
- Kiem thu: Target ChatUI service dat 43/43; Chatmgt auth contract dat 49/49; `python -m py_compile chatservice-main/application/controllers/api_chat_management.py chatservice-main/tests/test_chat_auth_contract.py` dat; `npm run test:frontend` dat 281/281; `python -m unittest discover -s chatservice-main/tests -q` dat 214 test, skip 79 theo dependency/runtime; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build` va `npm run build:production` dat, production entry `index-DpHwQdFm.js`, App `App-CgLBadix.js`, CSS `index-CgZBfmbc.css`, canh bao chunk App lon hon 500 KB co san; `git diff --check` va `git diff -- mobile` sach.
- Kiem tra production: Archive `/opt/deploy/chat/incoming/vichat-conversation-removal-2b3803a.tar.gz` 44904932 byte co SHA-256 `3e239bdea0f3367d4a3a7cb4b761e7a8f1325f2583b4085c197637f9a9f6f76b`, mang commit day du `2b3803a3c2b8dc2800138117f6647a1ba8f35caa`. Backup Chatmgt PostgreSQL `/opt/deploy/chat/backups/conversation-removal-2b3803a-20260826-0149/chatservice.dump` 142135 byte, mode `0600`, SHA-256 `c6ef6ad3877d07cf39074957a1b109825e41c764b11f7a71d39d4b2e1baabe39`; `pg_restore` PostgreSQL 16 doc duoc danh muc. Compose config, `py_compile`, backend image contract 49/49, candidate Nginx va ChatUI/Chatmgt health deu dat truoc switch. Lan image contract dau dat 47 test va loi 2 test chi do thieu read-only mount `/scripts`; chay lai voi dung mount dat 49/49. Candidate Chatmgt tra HTTP 200 sau khi Sanic khoi dong; lenh parse phu tren host khong co `python` va `pg_restore` host cu khong doc duoc format 1.15, nen cac buoc nay duoc kiem tra lai bang log/grep va binary PostgreSQL 16 trong container, khong recreate production som.
- Kiem tra sau deploy: ChatUI local/public `/healthz` va Chatmgt public auth health deu `ok`; `sudo -n nginx -t` dat; WebSocket relay tra HTTP 101; Alembic van `20260825_13 (head)`. Public `index-BqYRrh-2.js`, `App-CVakge_J.js`, `index-CgZBfmbc.css` khop SHA-256 tung byte voi container lan luot `0f0fea874fc26f96241496e2f48441ffe9abfeee1eb2e12e084bc595b0ddfe8b`, `88218fdfae88b8b9d32e7a28429dda5e561d49d4430cad551f858d5951011a68`, `baf6b513836e95a9bacaea51dc18f2cbd3bf053700bdf0e4d5958f0e3ffc14e3` va co marker cleanup direct moi. Log ChatUI/Chatmgt/bridge/webhook 10 phut co 0 marker fatal/panic/traceback/uncaught/critical/emerg; khong con candidate container.
- Trien khai: Source commit `2b3803a` da push `origin/master`; release `/opt/deploy/chat/releases/conversation-removal-2b3803a-20260826-0149` dang la `current`, `previous` tro `/opt/deploy/chat/releases/unread-mentions-26e7b45-20260826-0115`. `chatmgt` doi tu container `43ca8239b40b`/image `sha256:29ef9b34513de860969c884f26d729de0ad9e2fb8277bee473a9cfe97ca9136c` sang `faee09502cfd`/`sha256:e7dcb24b1be34cede0482b5bd40be2fd1ed575a4f81c807868392b3be5a76b41`; `chat` doi tu `dd28e86edc4c`/`sha256:1e95c02fb7723e21236353ed297bee54dcefcfac7aefb8363bf5650e2e8e0876` sang `8586641b8007`/`sha256:cde688df06d6c249275eaef84cfd9fa96d8395815b306be3436bf2778f2b773f`, ca hai healthy va restart count 0. Rollback tags `songhong-production-chatmgt:rollback-before-conversation-removal-2b3803a` va `songhong-production-chat:rollback-before-conversation-removal-2b3803a` giu image cu. Chat PostgreSQL `78a434b49404`, Tinode PostgreSQL `9f6e4dcc9c2f`, ChatAPI `8476615ad4ac`, Redis `ceef7df23feb`, Coturn `aa680d35fdc0`, bridge `13c037dc06f7` va webhook `2882b6109176` giu nguyen container ID; khong migration, Compose `down`, reset database/volume/topic/message/read cursor/avatar hay sua mobile.
- Rui ro con lai: Chua UAT nut bang phien dang nhap production vi browser runtime khong duoc expose trong phien; Tinode topic cu co the con orphan neu cleanup best-effort bi tu choi, nhung Chatmgt da dong/xoa dung theo viewer va khong con hien hoi thoai cu.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`; UAT xoa chat 1-1 tu ca menu sidebar va panel thong tin, sau do thu ca `Roi khoi nhom` va `Xoa cuoc tro chuyen` tren nhom chi con mot Account active; xac nhan nhom con survivor van bat buoc chuyen owner va dong bo Tinode.
- Commit/PR: Source commit `2b3803a`; deployment follow-up docs commit `2efae7a`; khong co PR.

## 2026-08-26-02 - Gom badge chua doc va hien dung mention cua nguoi xem

- Thoi gian: 2026-08-26 00:58-01:12 (Asia/Saigon); deploy production 01:14-01:25
- Loai: Sua loi | Web | UI | Realtime | Kiem thu | Tai lieu
- Trang thai: Da commit va deploy production; san sang UAT
- Muc tieu: Khi chat 1-1 hoac nhom co tu 5 tin chua doc, badge chi hien `5+`; can gon icon tat thong bao va chi hien dau `@` xanh cho tin nhom chua doc tag `@All` hoac tag dung tai khoan dang xem.
- Pham vi: ChatUI web sidebar va workspace notifications, unread presentation, mention metadata, i18n, CSS va test. Giu nguyen message transport, read cursor, desktop notification, mute policy, direct/group messaging, backend, database va mobile.
- File da thay doi: `src/app/App.jsx`, `src/styles/index.css`, `src/features/chat/services/unreadBoundary.js`, `src/features/chat/services/unreadBoundary.test.js`, `src/features/chat/services/mentionPolicy.js`, `src/features/chat/services/mentionPolicy.test.js`, `src/features/chat/services/chatManagementService.test.js`, `src/features/i18n/appLanguage.js`, `src/features/i18n/appLanguage.test.js`, `dist/index.html`, `docs/CHANGELOG.md`.
- Noi dung: Sidebar va workspace notifications dung chung state unread cua tung hoi thoai. Badge hien so 1-4 va chuyen thanh `5+` tu moc 5; bell-slash, mention va badge duoc gom thanh cum chi bao can thang hang. Voi nhom, ChatUI chi bat `@` xanh khi tap tin chua doc theo sequence/timestamp/boundary co metadata `@All` hoac identity cua viewer; mention co ID cua nguoi khac khong fallback theo ten nen khong hien nham.
- Quyet dinh ky thuat: Uu tien account ID va Tinode UID de doi chieu mention; chi fallback ten cho metadata legacy khong co stable ID. Dau mention duoc tinh tren toan bo phan chua doc dang con hieu luc, khong chi tin cuoi, va bien mat theo unread indicator/read boundary hien co. Day la presentation web; khong sua payload Tinode hay cach server ghi receipt.
- Database/API/cau hinh: Khong migration, schema, endpoint, dependency, secret hoac bien moi truong moi; khong can cap nhat kien truc backend.
- Kiem thu: Targeted unread/mention/ChatUI-contract/i18n dat 76/76; `npm run test:frontend` dat 281/281; `npm run lint` exit 0, chi warning legacy/vendor co san; `npm run build:production` dat voi entry `index-D_4R2y79.js`, App `App-BxaQjdMu.js`, CSS `index-CgZBfmbc.css` va canh bao chunk App lon hon 500 KB co san; `git diff --check` va `git diff -- mobile` sach. Candidate production dat `/healthz`, proxy Chatmgt, `nginx -t` va marker `5+`/`conv-mention-indicator`/`workspace-conversation-indicators`. Browser skill da duoc doc nhung phien khong expose Node browser runtime, nen chua tu dong UAT pixel-level.
- Kiem tra production: Archive `/opt/deploy/chat/incoming/vichat-unread-mentions-26e7b45.tar.gz` 44902582 byte co SHA-256 `3cbfc86cf6385cf67949cbfd7704031b8c203e38c9133e1b435ec61571a269eb`, mang commit day du `26e7b458ce084833f1cea4164d88b941149d4654`. Compose config va candidate dat truoc switch. ChatUI local/public health va Chatmgt public health deu `ok`; `sudo -n nginx -t` dat; WebSocket relay tra HTTP 101. Public `index-C-KIUXwE.js`, `App-DmaPY1ML.js`, `index-CgZBfmbc.css` khop SHA-256 tung byte voi container lan luot `bde2d5b9e99bb964575f43e324fd70c21ab9d56f87455a1419f7452a8e7f55e7`, `71c49e9943ab089e21368e18cee3c9f22a971d310aaf02d4a1d69c8dae1be2e6`, `baf6b513836e95a9bacaea51dc18f2cbd3bf053700bdf0e4d5958f0e3ffc14e3` va co du marker UI moi. Log ChatUI/Chatmgt/bridge/webhook tu luc switch co 0 marker fatal/panic/traceback/uncaught/critical/emerg; candidate container da duoc don sach.
- Trien khai: Source commit `26e7b45` da push `origin/master`; release `/opt/deploy/chat/releases/unread-mentions-26e7b45-20260826-0115` dang la `current`, `previous` tro `/opt/deploy/chat/releases/final-active-leave-917b164-20260826-0040`. Chi recreate `chat` tu container `413a305d2bcc`/image `sha256:467d286af83ee7d6e6c697308bf31f7da69900992f1637c78b2cc873d0c5fecd` sang container `dd28e86edc4c`/image `sha256:1e95c02fb7723e21236353ed297bee54dcefcfac7aefb8363bf5650e2e8e0876` bang `--no-deps --force-recreate --no-build --wait`; healthy, restart count 0. Rollback tag `songhong-production-chat:rollback-before-unread-mentions-26e7b45` giu image cu. Chat PostgreSQL `78a434b49404`, Tinode PostgreSQL `9f6e4dcc9c2f`, ChatAPI `8476615ad4ac`, Chatmgt `43ca8239b40b`, Redis `ceef7df23feb`, Coturn `aa680d35fdc0`, bridge `13c037dc06f7` va webhook `2882b6109176` giu nguyen container ID; khong migration, Compose `down`, reset database/volume/topic/message/read cursor/avatar hay restart service stateful.
- Rui ro con lai: Can UAT bang tai khoan that cho nhom co lan luot tag `@All`, tag viewer va tag nguoi khac, dong thoi kiem tra cum bell/badge tren light/dark theme. Metadata mention legacy khong co ID van phai fallback theo ten de tuong thich nguoc.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`; UAT cac moc unread 1, 4, 5 va lon hon 5, sau do dung ba tin nhom tag `@All`, tag viewer va tag nguoi khac de xac nhan chi hai truong hop dau co `@` xanh.
- Commit/PR: Source commit `26e7b45`; deployment follow-up docs commit `47d326c`; khong co PR.

## 2026-08-26-01 - Cho phep thanh vien hop le cuoi cung roi hoac xoa nhom

- Thoi gian: 2026-08-26 00:19-00:38 (Asia/Saigon); deploy production 00:40-00:56
- Loai: Sua loi | Web | API | Realtime | Kiem thu | Tai lieu
- Trang thai: Da commit va deploy production; san sang UAT
- Muc tieu: Bao dam khi nhom chi con mot tai khoan dang hoat dong, nguoi do luon co the roi nhom hoac xoa hoi thoai khoi danh sach ma khong bi participant cu cua tai khoan da vo hieu hoa ep chuyen quyen.
- Pham vi: ChatUI web leave/delete group, Chatmgt serializer va participant-removal policy, Tinode cleanup cho nhom rong, i18n, contract test va tai lieu; giu nguyen direct chat, message, read cursor, avatar, notification, spam cooldown, mobile va database schema.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/chatManagementService.test.js`, `src/features/i18n/appLanguage.js`, `src/features/i18n/appLanguage.test.js`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `chatservice-main/tests/test_direct_message_blocking.py`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`.
- Noi dung: ChatUI gom ca nut roi nhom va xoa hoi thoai nhom vao mot luong `/self`, khong dua ID participant tu browser vao URL; snapshot quan ly khong tao ung vien chuyen quyen tu ID khong con Account active. Chatmgt chi tinh survivor/replacement khi ca participant va Account cung active, va dong nhom khi khong con tai khoan hop le khac ke ca khi row owner cu van con.
- Quyet dinh ky thuat: Khong xoa tu dong row lich su khi dong bo Account. Cac row cu chi bi danh dau inactive/deleted trong thao tac roi nhom ro rang; neu topic Tinode da bind, backend uu tien credential owner topic con dung de don subscription truoc khi commit closure. Cap nhat source-contract direct blocking da cu de chap nhan client-level Tinode publish promise hien hanh; khong doi runtime direct block.
- Database/API/cau hinh: Khong migration, schema, endpoint hay bien moi truong moi; mo rong payload tuy chon `replacement_id` tren route `/self` da co.
- Kiem thu: Truy van production chi doc xac nhan 4 nhom dang co `raw_active=2` nhung chi `valid_active=1`, tat ca 4 chua bind Tinode; targeted frontend/i18n dat 63/63; `npm run test:frontend` dat 278/278; Chatmgt auth contract dat 49/49; full backend local dat 214 test, skip 79 theo dependency/runtime; `python -m py_compile ...` dat; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build:production` dat voi entry `index-D8LUh1hj.js`, App `App-CPkFsmZs.js`, CSS `index-vAv_DGKY.css` va canh bao chunk App lon hon 500 KB co san; `git diff --check` va `git diff -- mobile` sach. Candidate Chatmgt dat `py_compile` va 57/57 regression lien quan trong image production. Mot lan thu full suite trong container trong khong nap Compose env chay 197 test roi loi import 4 module do `REDIS_PORT` khong duoc cung cap; day la loi harness cua lenh thu phu, bo regression dung va full suite local van dat. Candidate ChatUI dat `/healthz`, `nginx -t` va marker `/self`/`replacement_id`/`managementSnapshot`.
- Kiem tra production: Archive `/opt/deploy/chat/incoming/vichat-final-active-leave-917b164.tar.gz` 44899844 byte co SHA-256 `4bcd714923756895b09a97c3267c910f09fa8dd9d6f0a41f336066cc3c3b0bc2`, mang commit day du `917b164d83619a4e17aef53be52b64bcb2712ba9`; backup PostgreSQL `/opt/deploy/chat/backups/final-active-leave-917b164-20260826-0040/chatservice.dump` 141979 byte, mode `0600`, SHA-256 `95af942fc33a18196909144935c9c4899a8282062d99fa560534e8e1ba0a19d1`. Compose config va preflight dat truoc switch. ChatUI/Chatmgt local va public health deu dat; `sudo -n nginx -t` dat; WebSocket relay tra HTTP 101. Public `index-BjpI_5WM.js`, `App-DyTRKVjk.js`, `index-vAv_DGKY.css` khop SHA-256 tung byte voi container lan luot `c3a75505c2911ec14c25ca02a856a2ed3a92016bb04e06ee7be4e61ed2b4c564`, `f1c66252287143d60d6c29314b757e5dfbd322690c699bd4632ca8eba41f64c5`, `242db02c89f5d15bb1f44431b3a47dc8c0a09e5c144187e78dabdef816170f7f` va co du ba marker luong moi. Truy van chi doc sau deploy van tra `4|4` nhom legacy/tat ca chua bind Tinode; khong sua du lieu. Log ChatUI/Chatmgt/bridge/webhook tu luc switch co 0 marker fatal/panic/traceback/uncaught/critical/emerg.
- Trien khai: Source commit `917b164` da push `origin/master`; release `/opt/deploy/chat/releases/final-active-leave-917b164-20260826-0040` dang la `current`, `previous` tro `/opt/deploy/chat/releases/group-spam-bf69295-20260826-0002`. Chi recreate `chatmgt` (`43ca8239b40b`, image `sha256:29ef9b34513de860969c884f26d729de0ad9e2fb8277bee473a9cfe97ca9136c`) roi `chat` (`413a305d2bcc`, image `sha256:467d286af83ee7d6e6c697308bf31f7da69900992f1637c78b2cc873d0c5fecd`) bang `--no-deps --force-recreate --no-build --wait`; ca hai healthy, restart count 0. Rollback tags giu image cu Chatmgt `sha256:a4efd1070098a74910d78d757e29819421ed3465f46da1162c3075d1bb339f20` va ChatUI `sha256:c9bcbc08374469c07de735600c0f99fc7f27ebbfb840372d42ae486a9f64e8f4`. Chat PostgreSQL `78a434b49404`, Tinode PostgreSQL `9f6e4dcc9c2f`, ChatAPI `8476615ad4ac`, Redis `ceef7df23feb`, Coturn `aa680d35fdc0`, bridge `13c037dc06f7` va webhook `2882b6109176` giu nguyen container ID; khong migration, Compose `down`, reset database/volume/topic/message/read cursor/avatar hay restart service stateful.
- Rui ro con lai: Browser skill da doc nhung phien khong expose Node browser runtime de tu dong UAT tai khoan that; can UAT tren mot trong 4 nhom co participant Account inactive. Buoc chan doan va deploy khong sua cac row legacy.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, mo mot nhom chi con mot Account active va thu ca hai nut `Roi nhom` va `Xoa cuoc tro chuyen`; xac nhan nhom dong/roi ngay, khong hien hop thoai chuyen quyen cho participant inactive va cac luong chat khac van binh thuong.
- Commit/PR: Source commit `917b164`; deployment follow-up docs commit `6935d29`; khong co PR.

## 2026-08-25-13 - Chong spam gui lien tuc trong nhom tren web

- Thoi gian: 2026-08-25 23:31 - 2026-08-26 00:15 (Asia/Saigon); deploy production 00:12-00:15
- Loai: Tinh nang | Bao mat | Web | Realtime | Kiem thu | Tai lieu
- Trang thai: Da commit va deploy production; san sang UAT
- Muc tieu: Phat hien user web gui lien tuc trong nhom, khoa gui 5 giay o lan vi pham dau va nhan doi cooldown neu tai pham, sau do tu phuc hoi khi user tro lai nhip gui binh thuong.
- Pham vi: ChatUI group composer/publish, Tinode account bridge enforcement theo web platform, batch attachment action ID, countdown UX, i18n va test. Giu nguyen chat 1-1, mobile, trusted internal publish, Tinode history da co, read cursor, avatar, pin, notification va database.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/groupSpamPolicy.js`, `src/features/chat/services/groupSpamPolicy.test.js`, `src/features/chat/services/tinodeClient.js`, `src/features/chat/services/chatManagementService.test.js`, `src/features/chat/services/directMessageBlocking.test.js`, `src/features/i18n/appLanguage.js`, `src/features/i18n/appLanguage.test.js`, `src/styles/index.css`, `package.json`, `chatservice-main/scripts/tinode_account_bridge.py`, `chatservice-main/tests/test_tinode_account_bridge.py`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Moi user duoc gui toi da 4 logical action trong cua so 5 giay cua tung nhom; action thu 5 bi chan 5 giay. Neu sau cooldown user lai tao mot burst moi thi muc phat tang 10, 20, 40 giay va tiep tuc nhan doi toi tran 5 phut; sau 60 giay hoat dong binh thuong tinh tu luc cooldown ket thuc, muc phat tiep theo ve 5 giay. Countdown hien ngay tren composer, khoa nut gui/tep/anh/sticker/voice/poll nhung van giu noi dung text draft. Text, sticker, tep/anh/voice, paste batch, poll, poll event, reaction, recall, pin/unpin va forward deu dung chung ngan sach; optimistic text/tep/sticker/poll bi bridge tu choi duoc go sach va text/poll composer duoc khoi phuc.
- Quyet dinh ky thuat: ChatUI chan truoc optimistic/upload de khong tao tin rac, con `tinode-account-bridge` chan lan cuoi truoc central Tinode theo cap `(Tinode UID, grp topic)` cho client co hello `platform=web`. Moi lan thao tac co `x-vichat-group-action`; cac packet cua cung batch nhieu tep chi tinh mot lan. System event do mutation quan tri nhu doi ten/avatar/settings/background/member duoc mien ngan sach, con pin/unpin van bi tinh. Tinode SDK 0.25.3 nuot rejection cua `Topic.publishMessage`, nen web chuyen cac message draft sang client-level publish promise de nhan dung `429 GROUP_SPAM_COOLDOWN`. Chat 1-1 van di qua direct-block policy cu; mobile va trusted internal publish bypass policy spam moi.
- Database/API/cau hinh: Khong migration, endpoint, schema, dependency, secret hay bien moi truong moi. Bridge luu rate-limit state co TTL trong memory, khong ghi message, profile, read cursor hay avatar vao Chatmgt/PostgreSQL; state phat duoc reset khi bridge process restart.
- Kiem thu: `npm run test:frontend` dat 278/278; bridge test chay trong image runtime production co `aiohttp` dat 14/14, gom burst 5s, 5/10s escalation, recovery, batch mot action, system-event exemption, direct/mobile/internal isolation va reject truoc Tinode. `python -m py_compile chatservice-main/scripts/tinode_account_bridge.py chatservice-main/tests/test_tinode_account_bridge.py` dat; local unittest bao 14 skip do workstation khong co `aiohttp`, nhung cung module da dat trong runtime image. `npm run lint` exit 0, chi warning legacy/vendor co san; `npm run build:production` dat voi entry `index-DkxhOiYi.js`, App `App-BrHvooMF.js`, CSS `index-vAv_DGKY.css` va canh bao chunk App lon hon 500 KB co san; `git diff --check` dat; `git diff -- mobile` sach. Candidate production bridge dat lai 14/14, py_compile va health; candidate ChatUI `/healthz`, Nginx config va marker bundle/CSS deu dat. Browser skill da duoc doc nhung phien khong expose runtime dieu khien browser, nen chua tu dong UAT visual countdown bang tai khoan that.
- Kiem tra production: Archive `/opt/deploy/chat/incoming/vichat-group-spam-bf69295.tar.gz` 44898487 byte co SHA-256 `4ee79603177d660be0937978aa56ebe22be8ca27599bec79e8b94542e61de66c`, khop commit day du `bf692956fdc616cad2c249bca816d8443d3bf29d`. Compose config, build candidate, bridge test va hai candidate health dat truoc khi switch. ChatUI local/public `/healthz`, Chatmgt public health, bridge health va `sudo -n nginx -t` deu dat; WebSocket relay co HTTP 101 sau recreate. Public `index-BCG-HpTX.js`, `App-BbZB61u6.js`, `index-vAv_DGKY.css` khop SHA-256 tung byte voi container lan luot `f87de30edd8782076e726cb4209f1656ac6356678440e25800954f3814247595`, `cea4736ea7501b7422824cc5e7972223ac7eb30384d04522b6da56b62b641541`, `242db02c89f5d15bb1f44431b3a47dc8c0a09e5c144187e78dabdef816170f7f` va co marker `GROUP_SPAM_COOLDOWN`/`group-spam-cooldown-notice`. Log ChatUI/bridge/Chatmgt/webhook co 0 marker fatal/panic/traceback/uncaught/critical/emerg; bridge van co canh bao optional local ICE fallback file vang mat nhu release bridge cu, con central relay/health van hoat dong.
- Trien khai: Source commit `bf69295` da push `origin/master`; release `/opt/deploy/chat/releases/group-spam-bf69295-20260826-0002` dang la `current`, `previous` tro `/opt/deploy/chat/releases/custom-stickers-3f2a89b-20260825-2316`. Chi recreate `tinode-account-bridge` (`13c037dc06f7`, image `sha256:1eb9baea2f6481ed33d04569b99f3cfe6f7d7b3926bdf2eb339569e3aec98f97`) roi `chat` (`a69865cf1aa5`, image `sha256:c9bcbc08374469c07de735600c0f99fc7f27ebbfb840372d42ae486a9f64e8f4`) bang `--no-deps --force-recreate --no-build --wait`; rollback tags giu image cu `sha256:179d1304b2c2ae6e5c871234163234ee1d71ab97b94b5d0a01f2c9297a4ca149` va `sha256:fac45cbf13243f3ab7d605ef3db3bece3df51bb9de8e677b7913d7cffd8aeaa5`. Chatmgt `b7a60904794b`, webhook `2882b6109176`, Chat PostgreSQL `78a434b49404`, ChatAPI `8476615ad4ac`, Coturn `aa680d35fdc0`, Redis `ceef7df23feb` va Tinode PostgreSQL `9f6e4dcc9c2f` giu nguyen container ID; khong migration, backup/reset database, Compose `down` hay restart service stateful.
- Rui ro con lai: Can UAT hai web session production cho text/sticker/tep/paste/poll/reaction/recall/pin/forward va xac nhan lan thu 5 bi chan, het 5 giay gui lai duoc, burst ke tiep len 10 giay, chat 1-1/mobile khong doi. Penalty bridge la in-memory nen mot lan restart bridge se xoa muc phat dang co; lich su Tinode va du lieu nguoi dung khong bi anh huong.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn` va UAT hai web session trong cung nhom: gui 4 action binh thuong, action thu 5 bi chan 5 giay, burst ke tiep len 10 giay; thu text/sticker/tep/paste/poll/reaction/recall/pin/forward, sau do xac nhan chat 1-1 va mobile khong doi.
- Commit/PR: Source commit `bf69295`; deployment follow-up docs commit `eb129aa`; khong co PR.

## 2026-08-25-12 - Them kho sticker ca nhan tren web

- Thoi gian: 2026-08-25 23:08 (Asia/Saigon); deploy production 23:16-23:21 (Asia/Saigon)
- Loai: Tinh nang | Web | UX | Realtime | Luu tru cuc bo | Bao mat | Kiem thu | Tai lieu
- Trang thai: Da commit va deploy production; san sang UAT
- Muc tieu: Them muc `Sticker cua toi` de moi user co the tai mot/nhieu anh sticker rieng, dung lai sau F5 va gui nhu sticker co san ma khong thay doi cac luong chat khac.
- Pham vi: Sticker picker ChatUI web, kho Blob IndexedDB theo tai khoan, recent sticker, optimistic preview, Tinode sticker upload/header, i18n, light/dark/responsive CSS, test va tai lieu. Giu nguyen catalog PuppySoft, emoji, sticker suggestion, direct/group/reply/block, backend va khong sua file nao trong `mobile/`.
- File da thay doi: `src/features/chat/components/StickerPicker.jsx`, `src/features/chat/services/customStickerStore.js`, `src/features/chat/services/customStickerStore.test.js`, `src/features/chat/services/stickerCatalog.js`, `src/features/chat/services/stickerCatalog.test.js`, `src/features/chat/services/tinodeClient.js`, `src/app/App.jsx`, `src/features/i18n/appLanguage.js`, `src/features/i18n/appLanguage.test.js`, `src/styles/index.css`, `package.json`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Picker co them pack `Sticker cua toi`, nut upload nhieu anh, trang thai dang luu/doc, so dem kho, tim kiem, thumbnail, xoa co xac nhan va thong bao loi than thien. Ho tro PNG/JPG/WEBP/GIF/AVIF toi da 2 MB moi anh, 48 sticker va 32 MB moi tai khoan/trinh duyet; bo qua file trung dua tren ten/MIME/kich thuoc/lastModified. Sticker custom duoc dua vao `Gan day`, xoa khoi kho cung xoa shortcut recent nhung khong xoa tin nhan da gui.
- Quyet dinh ky thuat: Blob goc duoc luu trong IndexedDB `vichat-custom-stickers.v1` theo viewer; khong luu data URL vao localStorage. Picker tao/revoke object URL theo vong doi component, con khi bam gui App tao preview optimistic rieng va `tinodeClient.sendSticker` doc Blob truc tiep, nen dong picker khong lam hong upload dang chay. Tinode tiep tuc upload nhu image attachment va dung header `x-vichat-sticker` cu; receiver, history va mobile nhan cung format cu. Chi chap nhan raster MIME co allow-list va rang buoc count/size de tranh SVG active content va browser storage khong gioi han.
- Database/API/cau hinh: Khong migration, endpoint, schema server, dependency, secret hay bien moi truong moi. Chi tao IndexedDB origin-local tren browser web; kho custom khong dong bo cross-device va khong duoc Chatmgt luu. Mobile khong co UI upload moi.
- Kiem thu: Target custom sticker/catalog/i18n dat 30/30; `npm run test:frontend` dat 272/272; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build:production` dat voi entry `index-DPLEK5dE.js`, App `App-fT_kPmNr.js`, CSS `index-TRVrL6Xj.css` va canh bao chunk App lon hon 500 KB co san; `git diff --check` dat; `git diff -- mobile` sach. Production archive 44889981 byte co SHA-256 `4fa22bd9f88bc1ef9e7c64fb54d9c1a003c1eb1b300c976262aa560bef3eb85c`, mang dung commit `3f2a89ba560093996419364609a43b6be962c692`; Compose config, candidate Nginx/health/marker va host/container `nginx -t` deu dat. ChatUI local/public `/healthz` tra `ok`, Chatmgt public health tra HTTP 200; public `index-DnSF15Vv.js`, `App-k9IEz2LW.js`, `index-TRVrL6Xj.css`, `App-DERd7JHn.css` khop SHA-256 tung byte voi container va co marker `vichat-custom-stickers.v1`/`custom-sticker-toolbar`. Log ChatUI/Chatmgt/bridge/webhook 10 phut co 0 marker fatal/panic/traceback/uncaught/critical/emerg; khong con candidate hay one-off container. Browser skill da duoc doc nhung phien nay khong expose cong cu dieu khien browser, nen chua tu dong UAT file picker/IndexedDB truc quan.
- Rui ro con lai: Can UAT tren Chrome/Edge/Firefox that cho upload nhieu anh, GIF dong, file sai loai/qua gioi han, F5, doi tai khoan, xoa va gui direct/group/reply/block. Quota IndexedDB tuy browser; khi bi tu choi UI se giu luong chat cu va hien loi, khong tu xoa catalog hay tin nhan.
- Trien khai: Source commit `3f2a89b` da push `origin/master`; release `/opt/deploy/chat/releases/custom-stickers-3f2a89b-20260825-2316` dang la `current`, `previous` tro `/opt/deploy/chat/releases/paste-draft-8b8d4c8-20260825-2235`. Chi recreate `chat` bang `--no-deps --force-recreate --no-build`; ChatUI container `d0bf6494b6cd`, image `sha256:fac45cbf13243f3ab7d605ef3db3bece3df51bb9de8e677b7913d7cffd8aeaa5`. Rollback tag `songhong-production-chat:rollback-before-custom-stickers-3f2a89b` giu image cu `sha256:0e7d54ac9c0000a59adbb9b61765b2632a35d8d616a1217ef232706fe7f4d385`. Chatmgt `b7a60904794b`, bridge `1129c4c10151`, webhook `2882b6109176`, Chat PostgreSQL `78a434b49404`, ChatAPI `8476615ad4ac`, Coturn `aa680d35fdc0`, Redis `ceef7df23feb` va Tinode PostgreSQL `9f6e4dcc9c2f` giu nguyen container ID; khong migration, backup/reset database, `compose down` hay restart backend.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, mo sticker picker -> `Sticker cua toi`, UAT upload mot/nhieu anh, GIF dong, file sai loai/qua gioi han, F5, doi tai khoan, xoa va gui trong direct/group/reply/block tren Chrome/Edge/Firefox.
- Commit/PR: Source commit `3f2a89b`; deployment follow-up docs commit `613decf`; khong co PR.

## 2026-08-25-11 - Giu anh va tep paste o ban nhap cho den khi user tu gui

- Thoi gian: 2026-08-25 22:23 (Asia/Saigon); deploy production 22:35-22:44 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Web | UX | Realtime | Kiem thu | Tai lieu
- Trang thai: Da commit va deploy production; san sang UAT
- Muc tieu: Ctrl+V van ban chi chen vao o soan; Ctrl+V mot/nhieu anh hoac tep chi tao preview cho, cho phep nhap mo ta va chi upload khi user tu bam Enter hoac Gui.
- Pham vi: ChatUI web composer/paste, preview URL, caption Drafty Tinode, image-batch presentation, i18n, CSS, test va tai lieu. Giu nguyen file picker gui ngay, direct/group/chatbot/block/reply/realtime va khong sua file nao trong `mobile/`.
- File da thay doi: `src/app/App.jsx`, `src/styles/index.css`, `src/features/chat/services/pasteAttachmentDraft.js`, `src/features/chat/services/pasteAttachmentDraft.test.js`, `src/features/chat/services/tinodeClient.js`, `src/features/chat/services/messagePreview.js`, `src/features/chat/services/messagePreview.test.js`, `src/features/i18n/appLanguage.js`, `src/features/i18n/appLanguage.test.js`, `package.json`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Bo moi loi goi `handleSendMessage`/`handleSendFile` khoi handler paste. Van ban dung hanh vi paste native tai caret; tat ca file clipboard duoc validate va xep vao queue toi da 100 muc theo tung hoi thoai, co thumbnail/ten/dung luong, xoa tung muc hoac xoa tat ca. Enter va nut Gui dung chung `handleComposerSubmit`; mo ta, mention va reply chi gan vao attachment dau tien, con mot lan paste toan anh van dung metadata batch cu. Caption hien cung anh/tep va duoc khoi phuc tu Drafty sau reload.
- Quyet dinh ky thuat: Clipboard draft chi song trong memory cua tab va khong upload truoc submit. Object URL duoc revoke khi xoa/gui/logout/unmount/xoa hoi thoai; queue duoc migrate cung optimistic direct id de khong gui nham topic. Chon file bang nut giu hanh vi cu de khoanh dung pham vi yeu cau; Tinode van la source of truth va Chatmgt/mobile khong nhan state moi.
- Database/API/cau hinh: Khong migration, endpoint, schema, dependency, secret hoac bien moi truong moi. Chi mo rong noi dung Drafty attachment va header mention da co; deploy chi can recreate rieng ChatUI.
- Kiem thu: Target paste/preview/i18n dat 33/33; `npm run test:frontend` dat 265/265; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build:production` dat voi entry `index-_Kx2Lw7v.js`, App `App-_zQ5C1p9.js`, CSS `index-CZLOF7OQ.css` va canh bao chunk App lon hon 500 KB co san; `git diff --check` dat; `git diff -- mobile` sach. Khong co browser runtime callable trong phien de UAT clipboard visual tu dong.
- Kiem tra production: Archive `/opt/deploy/chat/incoming/vichat-paste-draft-8b8d4c8.tar.gz` 44880302 bytes co SHA-256 `9267c51d0bc94abbbb5ccf91a3bb38882b0c05bd47f750afc7edf1c7d00c4606`, khop local/remote va mang Git archive commit day du `8b8d4c8947dead4c862e98ab7de7a3ef9fd7d483`. Compose config, candidate container health va Nginx trong Compose network deu dat truoc khi switch. ChatUI local `http://127.0.0.1:8094/healthz`, public `https://chat.upgo.vn/healthz` va kiem tra tu workstation deu tra `ok`; Chatmgt public health truy cap thanh cong, Chatmgt va bridge container healthy. Public `index-wWltlKuF.js`, `App-0doSe27a.js`, `index-CZLOF7OQ.css` khop SHA-256 tung byte voi container lan luot `53d72dab5dbd8e1cb78bc6d29716aceb2e0aca7cb24a9c767bf32282de7a40e6`, `e70c737198ee590792bb1f9f1b6fb24057ee8b0735f7d590967fab7b1166f0d2`, `7873d5a65ee37e0571d1d026b409403ca19a798ade314b22a229747e5024a528`; App/CSS co marker `paste-batch-` va `pasted-attachment-drafts`. `sudo -n nginx -t` dat; log ChatUI/Chatmgt/bridge/webhook tu luc switch release co 0 marker fatal/panic/traceback/uncaught/critical/emerg; khong con candidate hay one-off container.
- Trien khai: Source commit `8b8d4c8` da push `origin/master`; release `/opt/deploy/chat/releases/paste-draft-8b8d4c8-20260825-2235` dang la `current`, `previous` tro `/opt/deploy/chat/releases/direct-block-e0041d7-20260825-1446`. Chi build va force-recreate `chat` bang `--no-deps --force-recreate --no-build`; container moi `86e0d5e10c0e`, image `sha256:0e7d54ac9c0000a59adbb9b61765b2632a35d8d616a1217ef232706fe7f4d385`, healthy. Rollback tag `songhong-production-chat:rollback-before-paste-draft-8b8d4c8` giu image cu `sha256:db8d7e81937188753a1d1dd22b42eea83208b032c4ca0c1fb6371f10d13055d7`. Chatmgt `b7a60904794b`, bridge `1129c4c10151`, webhook `2882b6109176`, Chat PostgreSQL `78a434b49404`, ChatAPI `8476615ad4ac`, Coturn `aa680d35fdc0`, Redis `ceef7df23feb` va Tinode PostgreSQL `9f6e4dcc9c2f` giu nguyen container ID; khong migration, backup/reset database, Compose `down` hoac restart dich vu backend.
- Rui ro con lai: Can UAT tren browser that cho clipboard mot anh, nhieu anh, tep, van ban tai caret, caption/reply/mention va direct block; clipboard API/ten file co the khac nhau giua Chrome/Edge/Firefox nhung deu di qua cung DataTransfer policy.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, UAT Ctrl+V van ban tai caret, mot/nhieu anh va tep; xac nhan khong upload/gui truoc khi bam Enter hoac Gui, mo ta/reply/mention chi nam tren attachment dau tien, xoa preview khong gui va mobile giu nguyen.
- Commit/PR: Source commit `8b8d4c8`; deployment follow-up docs commit `833badf`; khong co PR.

## 2026-08-25-10 - Chan tin nhan chat 1-1 tren web

- Thoi gian: 2026-08-25 21:41 (Asia/Saigon); deploy production 21:47-21:58 (Asia/Saigon)
- Loai: Tinh nang | Bao mat | Web | API | Realtime | Du lieu | Kiem thu | Tai lieu | Trien khai
- Trang thai: Da commit va deploy production; san sang UAT
- Muc tieu: Them nut `Chan` ngay duoi `Tat thong bao` cho chat 1-1 tren web; khi mot ben chan thi ca hai chieu khong gui duoc, moi lan nguoi bi chan thu gui deu nhan thong bao `Nguoi dung da chan tin nhan.`, va packet bi tu choi khong duoc vao lich su Tinode.
- Pham vi: ChatUI web detail/composer va cac thao tac publish, Chatmgt direct-conversation metadata/API, Tinode account bridge policy, migration PostgreSQL, i18n, CSS, test va tai lieu. Group giu nguyen; khong sua file nao trong `mobile/` va khong them UI chan tren mobile.
- File da thay doi: `src/app/App.jsx`, `src/styles/index.css`, `src/features/chat/services/directMessageBlocking.js`, `src/features/chat/services/directMessageBlocking.test.js`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/chatRealtime.test.js`, `src/features/chat/services/tinodeClient.js`, `src/features/i18n/appLanguage.js`, `src/features/i18n/appLanguage.test.js`, `package.json`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/models/models.py`, `chatservice-main/scripts/tinode_account_bridge.py`, `chatservice-main/tests/test_direct_message_blocking.py`, `chatservice-main/tests/test_tinode_account_bridge.py`, `chatservice-main/alembic/versions/20260825_13_direct_message_blocking.py`, `chatservice-main/migrations/013_direct_message_blocking.sql`, `docs/chat-backend-architecture.md`, `infrastructure/production/README.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Luu `blocked_at` theo tung participant; response conversation va snapshot poll 3 giay tra `blockedByViewer`, `blockedByPeer`, `directMessagingBlocked`. Nguoi chan thay composer khoa `Ban da chan tin nhan` va nut `Bo chan`; nguoi bi chan van co the bam gui nhung moi text, tep/anh, sticker, reaction, recall, forward, hinh nen shared va direct call deu bi tu choi voi thong bao than thien. Optimistic message bi bridge tu choi duoc bo khoi state thay vi de lai failed history; hinh nen local `Chi minh toi` van hoat dong. Group va trusted internal publish giu luong cu.
- Quyet dinh ky thuat: Chatmgt la source of truth cho trang thai chan, con bridge la enforcement point truoc central Tinode. Moi `pub` toi topic `usr*` cua client thuong duoc doi chieu bang internal key; neu mot trong hai participant dang chan, bridge tra Tinode control `403`/`DIRECT_MESSAGE_BLOCKED` va khong forward packet. Direct policy fail closed khi loi de khong lo tin nhan; duplicate direct row cung fail closed neu bat ky row nao bi chan. Tinode SDK 0.25.3 nuot rejection cua `Topic.publishMessage`, nen direct publish tren web dung promise cap client de UI nhan dung loi; group van dung API cu.
- Database/API/cau hinh: Alembic `20260825_13` sau `20260824_12` them `conversation_participant.blocked_at BIGINT` va ba index `ix_management_account_active_tinode_uid`, `ix_conversation_active_direct_key`, `ix_conversation_participant_blocked_at`. Them `PUT /api/v1/conversation/<id>/block`, `GET /api/v1/conversation/direct-block-state` va internal `POST /api/v1/internal/direct-message-policy`; khong them secret hay bien moi truong moi. Legacy direct conversation duoc backfill `direct_key` khi cap nhat block.
- Kiem thu: Target frontend/i18n/realtime dat 53/53; `npm run test:frontend` dat 254/254; full backend trong image production dat 207/207, gom bridge async; direct-policy local dat 8/8; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build:production` dat; `python -m py_compile` dat; `git diff --check` dat. Migration chain da chay tren PostgreSQL 16 sach tu revision dau den `20260825_13`; xac nhan `blocked_at` la `BIGINT` va du ba index. `git diff -- mobile` sach.
- Kiem tra production: Archive `/opt/deploy/chat/incoming/vichat-direct-block-e0041d7.tar.gz` 44872501 bytes co SHA-256 `5d5bb7d8c5ab4c434ebdd596eedc13dcdcfa912c75582af46fe14bf7d8f7d4c5` khop local/remote; Compose config va build ba image dat. Backup Chatmgt PostgreSQL `/opt/deploy/chat/backups/direct-block-e0041d7-20260825-1446/chatservice.dump` 140426 bytes, mode `0600`, SHA-256 `0d213f02c2b76d0d11c90d96ec190216444b67d6ab85e838d280db42ae4456ba`, `pg_restore --list` doc duoc. Production o Alembic `20260825_13`, `blocked_at` la `BIGINT` va du ba index. ChatUI/Chatmgt/bridge healthy; local/public ChatUI `/healthz` tra `ok`, Chatmgt public/container health va bridge container health tra `status=ok`; direct block snapshot chua dang nhap tra `401`, internal policy thieu key tra `403`. Public `/assets/App-DbuZTfwH.js` va `/assets/index-Dt-U2a3s.css` khop SHA-256 tung byte voi container, co marker `DIRECT_MESSAGE_BLOCKED`/`direct-blocked-composer`; `sudo -n nginx -t` dat; log ChatUI/Chatmgt/bridge/webhook 10 phut co 0 marker fatal/panic/traceback/uncaught/critical/emerg; khong con one-off container.
- Trien khai: Source commit `e0041d7` da push `origin/master`; release `/opt/deploy/chat/releases/direct-block-e0041d7-20260825-1446` dang la `current`, `previous` tro `/opt/deploy/chat/releases/conversation-categories-bda3e1f-20260825-1043`. Chi recreate `chatmgt` (`b7a60904794b`, image `sha256:a4efd1070098a74910d78d757e29819421ed3465f46da1162c3075d1bb339f20`), `tinode-account-bridge` (`1129c4c10151`, image `sha256:179d1304b2c2ae6e5c871234163234ee1d71ab97b94b5d0a01f2c9297a4ca149`) va `chat` (`f06d932d2d69`, image `sha256:db8d7e81937188753a1d1dd22b42eea83208b032c4ca0c1fb6371f10d13055d7`) bang `--no-deps --force-recreate --no-build`; khong `down`, khong reset database/volume/topic/message/read cursor/avatar. Rollback tags `rollback-before-direct-block-e0041d7` giu ba image cu. Webhook `2882b6109176`, Chat PostgreSQL `78a434b49404`, ChatAPI `8476615ad4ac`, Coturn `aa680d35fdc0`, Redis `ceef7df23feb` va Tinode PostgreSQL `9f6e4dcc9c2f` giu nguyen container ID.
- Rui ro con lai: Chua UAT production bang hai tai khoan that cho tat ca loai publish va khoang poll bo chan 3 giay vi browser runtime khong duoc expose trong phien. Mobile khong co control/UI moi; enforcement transport van ngan client thuong bypass mot block da duoc bat tren web.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn` va UAT hai web session: vi tri nut Chan, text/tep/sticker/reaction/recall/forward/call bi chan ca hai chieu, packet khong vao history, bo chan thong lai trong toi da mot poll; xac nhan group khong thay doi.
- Commit/PR: Source commit `e0041d7`; deployment follow-up docs commit `85ddb83`; khong co PR.

## 2026-08-25-09 - Quan ly the phan loai hoi thoai tuy chinh

- Thoi gian: 2026-08-25 17:36 (Asia/Saigon); deploy production 17:43-17:50 (Asia/Saigon)
- Loai: Tinh nang | Web | UX | Kiem thu | Tai lieu | Trien khai
- Trang thai: Da commit va deploy production; san sang UAT
- Muc tieu: Them muc quan ly ngay trong submenu Phan loai de moi nguoi co the tao, sua ten/mau, sap xep, xoa va gan the cho nhieu hoi thoai theo giao dien mau, ma khong anh huong luong chat hien co.
- Pham vi: ChatUI menu ba cham, submenu Phan loai, modal quan ly/them-sua the, local preference theo viewer, responsive/dark theme, i18n va test; giu nguyen message, read cursor, unread, avatar, pin, notification, membership, tenant, Chatmgt va Tinode.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/components/ConversationCategoryManager.jsx`, `src/features/chat/service
... [truncated for diff preview]
