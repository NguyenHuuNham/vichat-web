# Nhat ky thay doi ViChat

Day la bo nho ky thuat theo thu tu moi nhat truoc. Moi lan sua code, cau hinh, database, ha tang hoac cap nhat tinh nang phai them mot muc theo `docs/DEVELOPMENT_WORKFLOW.md`.

Khong ghi mat khau, token, cookie, khoa API, du lieu ca nhan hoac gia tri bi mat vao file nay.

## Lich su thay doi

## 2026-07-30-06 - Sua verifier cho tai khoan Account SSO

- Thoi gian: 2026-07-30 22:35 (Asia/Saigon)
- Loai: Sua loi | Bao mat | Van hanh
- Trang thai: Hoan tat
- Muc tieu: Cho phep verifier production nghiem thu projection nhan vien Account SSO co marker mat khau khong the dang nhap, trong khi van kiem soat chat tai khoan quan tri cuc bo.
- Pham vi: Kiem tra database va chinh sach credential trong `verify_deployment.py`; test hoi quy cho tai khoan Account va quan tri Chatmgt.
- File da thay doi: `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/tests/test_verify_deployment.py`, va `docs/CHANGELOG.md`.
- Noi dung: Verifier khong con dua marker `!account-sso-only` cua projection Account vao `bcrypt.checkpw`. Projection Account bat buoc co `properties.auth_source=account` va dung chinh xac marker khong dang nhap; chi tai khoan cuc bo moi duoc kiem tra bcrypt va mat khau mac dinh. Tai khoan Account co role `admin` khong con duoc tinh nham la quan tri vien cuc bo cua Chatmgt.
- Quyet dinh ky thuat: Phan loai bang nguon xac thuc trong `properties`, khong bo qua moi hash khong hop le theo gia tri marker don le. Cach nay giu duoc rang buoc khong luu mat khau Account va van phat hien hash hong hoac mat khau mac dinh cua tai khoan cuc bo.
- Database/API/cau hinh: Khong co migration, khong sua du lieu va khong doi API/cau hinh. Khong reset hay bcrypt hoa marker cua projection Account.
- Kiem thu: `python -m unittest` cho `test_chat_auth_contract.py`, `test_sso_identity.py`, `test_tinode_bridge_service.py` va `test_verify_deployment.py` dat 41 test voi dependency tam `aiohttp 3.10.11`, `bcrypt 4.2.1`, `requests 2.32.4`; rieng verifier dat 7 test. `python -m py_compile ...` va `git diff --check` dat. Tren production, full suite trong image dat 50 test voi 5 test duoc skip; `verify_deployment.py` xac nhan database, credential policy, health, CORS, Account SSO challenge, Tinode bridge, employee password rejection va management isolation deu dat. Chatmgt va ChatAPI deu healthy sau recreate.
- Rui ro con lai: Khong co da biet trong pham vi verifier. Nghiem thu chat realtime bang hai Account user that van thuoc gate buoc 4 rieng.
- Viec tiep theo: Xac nhan `/api/v1/auth/tinode-token` tra 200, WSS online va chat hai nguoi cung tenant truoc khi danh dau buoc 4 hoan tat.
- Commit/PR: Commit chua muc nay (xem `git log`).

## 2026-07-30-05 - Sua provision Tinode cho tai khoan Account

- Thoi gian: 2026-07-30 20:43 (Asia/Saigon)
- Loai: Sua loi | Bao mat | Van hanh
- Trang thai: Can xac nhan
- Muc tieu: Khac phuc loi production khien `POST /api/v1/auth/tinode-token` tra 401 va khoa gui tin khi Tinode khong tao duoc basic auth cho username Account qua dai.
- Pham vi: Dinh danh Tinode theo tenant, tu sua projection Account chua provision, bao loi tao tai khoan Tinode, kiem thu bridge va tai lieu kien truc.
- File da thay doi: `chatservice-main/application/services/sso_identity.py`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/services/auth_service.py`, `chatservice-main/tests/test_sso_identity.py`, `chatservice-main/tests/test_tinode_bridge_service.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `docs/chat-backend-architecture.md`, va `docs/CHANGELOG.md`.
- Noi dung: Log Tinode production xac nhan username 32 ky tu bi luu thanh khoa `basic:<username>` vuot cot `auth.uname VARCHAR(32)`, lam giao dich tao user that bai va bi luong retry che thanh loi credential 401. Username xac dinh duoc rut xuong 26 ky tu; projection chua co Tinode UID tu dong chuyen sang username moi khi SSO, cap token hoac chuan bi participant. Loi server 5xx khi tao user khong con bi coi nham la xung dot 409.
- Quyet dinh ky thuat: Giu 21 ky tu SHA-256 sau tien to `upgo_`, cung cap 84 bit phan biet va dam bao `basic:<username>` khong qua 32 ky tu. Khong tu doi username cua projection da co Tinode UID de tranh dut topic, message va subscription hien co.
- Database/API/cau hinh: Khong co migration va khong doi hop dong API. Ban ghi Chatmgt chua provision duoc sua khi co request tiep theo. Khong duoc xoa volume hoac tao lai Tinode database.
- Kiem thu: `python -m unittest discover -s chatservice-main/tests -v` dat 46 test, 17 test runtime skip do moi truong Python local thieu dependency; 5 test `test_tinode_bridge_service.py`, gom test loi tao account moi, dat rieng voi `aiohttp 3.10.11` va `bcrypt 4.2.1` trong thu muc tam; `python -m py_compile ...` va `git diff --check` dat.
- Rui ro con lai: Chua build/deploy image sua loi va chua xac nhan voi Tinode production. Account directory production van can sua payload vi co record thieu username va snapshot bo sot user dang dang nhap. Log Tinode duoc cung cap trong qua trinh chan doan co chua credential noi bo; can xoay `TINODE_ADMIN_PASSWORD` va `TINODE_SSO_SECRET` sau khi trien khai, khong cong khai gia tri moi, va xu ly log cu an toan.
- Viec tiep theo: Tao commit/push, pull tren server, chay `start.sh`, xac nhan `/auth/tinode-token` tra 200 va WSS online, sau do xoay credential va kiem thu chat 1-1/nhom bang hai Account user cung tenant.
- Commit/PR: Commit chua muc nay (xem `git log`).

## 2026-07-30-04 - Noi Chatmgt voi Tinode realtime

- Thoi gian: 2026-07-30 14:57 (Asia/Saigon)
- Loai: Tinh nang | Bao mat | Van hanh
- Trang thai: Can xac nhan
- Muc tieu: Hoan thanh buoc 4 de nang phien Account/Chatmgt cua buoc 2-3 sang Tinode realtime ma khong dua mat khau Account vao Chatmgt/Tinode/frontend, khong lech tenant/topic/thanh vien va khong lam treo UI khi ChatAPI loi.
- Pham vi: Cau noi token Account SSO sang Tinode, chuan bi UID participant, rang buoc topic, dong bo thanh vien nhom, ChatUI messages/files/presence/receipt, reconnect, production verifier va tai lieu trien khai.
- File da thay doi: `README.md`, `src/app/App.jsx`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/tinodeClient.js`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/services/auth_service.py`, `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `chatservice-main/tests/test_tinode_bridge_service.py`, `docs/chat-backend-architecture.md`, `infrastructure/production/.env.example`, `infrastructure/production/README.md`, `infrastructure/production/compose.yaml`, va `infrastructure/production/start.sh`.
- Noi dung: ChatUI tai xong du lieu Chatmgt roi moi goi endpoint token rieng de nang tu `management` sang `tinode`; reconnect lay token moi. Chatmgt chuan bi UID Tinode theo projection Account/tenant, kiem topic truc tiep/nhom va tap subscriber truoc khi bind. Them/xoa/roi nhom duoc Chatmgt kiem quyen va dieu phoi Tinode truoc khi ghi membership; UI khong con tu sua hai he thong rieng le. Khi Tinode loi, UI giu che do du lieu Chatmgt va khoa realtime thay vi roi sang demo.
- Quyet dinh ky thuat: Account van la nguon danh tinh; Chatmgt la nguon metadata/membership va diem dieu phoi quyen; Tinode chi la nguon realtime. `POST /api/v1/auth/sso` van khong goi Tinode. Credential Tinode duoc dan xuat phia server bang `TINODE_SSO_SECRET`; browser chi nhan token ngan han. Topic event chi duoc chap nhan neu dang co binding Chatmgt cua phien hien tai.
- Database/API/cau hinh: Khong co migration. Them `POST /api/v1/conversation/<id>/tinode-prepare`; `POST/DELETE participants` nhan token Tinode ngan han khi conversation da bind; bind nhom kiem day du subscriber. Production bat buoc `TINODE_SSO_SECRET`, `start.sh` tu sinh khi gia tri trong `.env` dang trong.
- Kiem thu: `npm run lint` dat voi cac warning co san ngoai pham vi; `npm run build:production` dat; `python -m py_compile ...` dat; `python -m unittest discover -s tests -v` dat 45 test, 16 test runtime skip tren Python local; 4 test WebSocket bridge moi dat rieng voi `aiohttp 3.10.11` tu thu muc tam (index local khong co ban lock `3.13.5`); `docker compose ... config --quiet` va `git diff --check` dat. Thu build/test image Chatmgt khong chay duoc vi Docker Desktop daemon tren may nay khong hoat dong.
- Rui ro con lai: Chua chay test trong image dung `aiohttp 3.13.5`, chua xac nhan protocol voi Tinode server that, va chua chay E2E bang cookie Account that/hai nguoi/hai tenant tren server. Verifier tu dong chi kiem cau hinh bridge va cach ly management, khong tu tao phien Account.
- Viec tiep theo: Deploy sau khi server da pull/xac nhan buoc 3, chay full test/verifier trong image production, roi chay acceptance Tinode hai nguoi/hai tenant.
- Commit/PR: Commit chua muc nay (xem `git log`).

## 2026-07-30-03 - ChatUI dung du lieu quan ly tu Chatmgt

- Thoi gian: 2026-07-30 14:24 (Asia/Saigon)
- Loai: Tinh nang | Bao mat | Van hanh
- Trang thai: Can xac nhan
- Muc tieu: Hoan thanh buoc 3 de ChatUI lay danh ba, loi moi ket ban va metadata cuoc tro chuyen tu Chatmgt sau khi dang nhap UpGO Account, khong roi sang demo va khong ghep Tinode realtime vao buoc nay.
- Pham vi: Dong bo danh ba Account theo tenant, Chatmgt user/friend/conversation API, che do `management` cua ChatUI, bo kiem thu production va tai lieu trien khai/kien truc.
- File da thay doi: `README.md`, `src/app/App.jsx`, `src/styles/index.css`, `src/features/chat/services/chatManagementService.js`, `chatservice-main/application/config/config.py`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/services/account_sso_service.py`, `chatservice-main/application/services/sso_identity.py`, `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/tests/test_account_sso_service.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `chatservice-main/tests/test_sso_identity.py`, `chatservice-main/tests/test_verify_deployment.py`, `docs/chat-backend-architecture.md`, `infrastructure/production/.env.example`, `infrastructure/production/README.md`, va `infrastructure/production/compose.yaml`.
- Noi dung: Chatmgt xac minh lai Account session/tenant truoc va sau khi tai danh ba, goi server-to-server `GET /api/v1/user`, chuan hoa/upsert projection nhan su khong co credential, va vo hieu hoa projection vang mat trong snapshot da xac minh. ChatUI dung Chatmgt cho tim kiem, ket ban, tao chat 1-1/nhom, them/xoa/roi thanh vien va an cuoc tro chuyen; chat 1-1 cung cap nguoi dung duoc tai su dung. Che do `management` duoc tach khoi demo, hien nhan `Du lieu Chatmgt`, khoa tin nhan/file nhan vien voi thong bao buoc 4, va khoa sua ho so Account.
- Quyet dinh ky thuat: Account van la nguon chuan cua ho so nhan su; Chatmgt la nguon API cua ChatUI va chi luu projection theo cap `(tenant_id, account_user_id)`. Khi Account directory tam loi, Chatmgt co the tra cache tenant da xac minh voi `directory_sync.status=stale`; loi dang nhap, sai tenant hoac phien bi thu hoi khong duoc ha cap thanh cache. Tinode khong duoc goi trong che do `management`.
- Database/API/cau hinh: Khong co migration. Them `ACCOUNT_SSO_DIRECTORY_PATH` mac dinh `/api/v1/user`; health them `account_sso.directory_configured` va `management_data`. `POST /api/v1/conversation` them khoa cap participant de tai su dung chat 1-1 va kich hoat lai membership da an.
- Kiem thu: `npm run lint` dat, chi con warning co san ngoai pham vi; `npm run build:production` dat; `python -m unittest discover -s tests -v` trong `chatservice-main` dat 37 test, 12 test runtime duoc skip vi Python local thieu `aiohttp`/cac dependency verifier; `python -m py_compile ...`, `docker compose ... config --quiet` va `git diff --check` deu dat. Chua chay toan bo test trong image production moi.
- Rui ro con lai: Chua xac nhan payload danh ba bang cookie Account that tren server, chua chay E2E hai nguoi cung tenant/hai tenant, va chua xac nhan cac test `aiohttp` trong image. Tin nhan, file, presence va receipt van bi khoa cho den buoc 4.
- Viec tiep theo: Build image production, chay full backend test/verifier trong container, sau do test danh ba, ket ban, chat 1-1, nhom va reload bang tai khoan Account that cua hai tenant. Chi khi dat moi chuyen muc nay sang `Hoan tat`.
- Commit/PR: Commit chua muc nay (xem `git log`).

## 2026-07-30-02 - Xac thuc Chat bang UpGO Account

- Thoi gian: 2026-07-30 12:47 (Asia/Saigon)
- Loai: Tinh nang | Bao mat | Van hanh
- Trang thai: Can xac nhan
- Muc tieu: Hoan thanh buoc 2 de nhan vien dang nhap/dang xuat Chat bang tai khoan da co tai `account.upgo.vn`, khong tao hoac nhan mat khau nhan vien trong Chatmgt, va khong ghep Tinode vao luong xac thuc nay.
- Pham vi: ChatUI login, Chatmgt Account SSO/session/profile projection, logout hai phien, dang nhap quan tri rieng, cau hinh production, kiem tra trien khai va tai lieu kien truc.
- File da thay doi: `README.md`, `src/features/auth/components/Login.jsx`, `src/features/chat/services/chatManagementService.js`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/services/account_sso_service.py`, `chatservice-main/application/services/sso_identity.py`, `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/tests/test_account_sso_service.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `chatservice-main/tests/test_sso_identity.py`, `docs/chat-backend-architecture.md`, `infrastructure/production/.env.example`, `infrastructure/production/README.md`, va `infrastructure/production/compose.yaml`.
- Noi dung: ChatUI chi hien nut dang nhap UpGO Account, goi `POST /api/v1/auth/sso`, chuyen den Account bang tham so `continue`, va tu thu lai SSO mot lan khi quay ve. Chatmgt xac minh cookie `session` qua `/current_user`, tu choi membership khong hop le, dong bo profile/tenant projection, phat rieng Chatmgt JWT voi `amr=account_sso`, va tra `connection=management` khong kem Tinode token. Logout goi Account `/logout`, thu hoi Chatmgt JWT va xoa ca hai cookie. Tai khoan quan tri cuc bo dung `/login` voi management header rieng va khong goi Tinode.
- Quyet dinh ky thuat: Account la nguon chuan cho ID nguoi dung, tenant, role, email, ten hien thi, avatar va mat khau. Dong `management_account` chi la projection phuc vu quan he du lieu Chat; `password_hash` cua projection dung marker khong the dang nhap `!account-sso-only`. Nhan vien khong the dang nhap, doi/reset mat khau, sua profile nguon Account hoac duoc tao credential moi trong Chatmgt khi SSO bat. Tinode token/provisioning duoc giu ngoai buoc 2.
- Database/API/cau hinh: Khong co migration. `POST /api/v1/auth/sso` tro thanh endpoint dang nhap nhan vien production; `POST /api/v1/auth/login` bi vo hieu hoa khi `CHAT_ACCOUNT_SSO_ENABLED=true`; `/login` chi cho management scope. Production can `CHAT_ACCOUNT_SSO_ENABLED=true`, `ACCOUNT_URL=https://account.upgo.vn`, profile path `/current_user`, logout path `/logout`, cookie `session`, domain `.upgo.vn`, Secure bat. File `.env` that tren server khong duoc tu dong sua va phai cap nhat truoc khi rebuild.
- Kiem thu: `npm run lint` dat (chi con cac warning co san ngoai pham vi); `npm run build:production` dat; `python -m unittest chatservice-main/tests/test_chat_auth_contract.py chatservice-main/tests/test_sso_identity.py chatservice-main/tests/test_account_sso_service.py -v` dat 24 test, 6 test dich vu duoc skip vi Python cuc bo thieu `aiohttp`; `python -m py_compile ...` dat cho controller, hai SSO service va verifier; `docker compose --env-file infrastructure/production/.env.example -f infrastructure/production/compose.yaml config --quiet` dat; `git diff --check` dat. Chua chay test trong image Chatmgt vi Docker daemon tren may nay khong hoat dong.
- Rui ro con lai: Chua co cookie/tai khoan Account thuc de xac nhan end-to-end tren `chat.upgo.vn`; can xac nhan Account chap nhan `continue`, cookie `.upgo.vn` duoc gui toi Chatmgt, va `POST /logout` hoat dong voi phien production. Buoc 3 va buoc 4 van la cong viec rieng, nen dang nhap thanh cong chua dong nghia toan bo chat/realtime da dung duoc.
- Viec tiep theo: Cap nhat `.env` tren server, rebuild/redeploy, chay test backend trong container, sau do lam acceptance bang mot tai khoan Account active, mot membership inactive va hai tenant. Chi sau khi dat moi chuyen muc nay sang `Hoan tat` va bat dau buoc 3.
- Commit/PR: Commit chua muc nay (xem `git log`).

## 2026-07-30-01 - Thiet lap quy trinh luu vet thay doi

- Thoi gian: 2026-07-30 01:36 (Asia/Saigon)
- Loai: Tai lieu
- Trang thai: Hoan tat
- Muc tieu: Tao bo nho dung chung de cac lan sua code va cap nhat tinh nang sau co the tiep tuc voi day du ngu canh.
- Pham vi: Quy tac lam viec va tai lieu phat trien cua toan repository.
- File da thay doi: `AGENTS.md`, `README.md`, `docs/DEVELOPMENT_WORKFLOW.md`, `docs/CHANGELOG.md`.
- Noi dung: Bo sung quy tac bat buoc cap nhat nhat ky, quy trinh tu tiep nhan den ban giao, va mau ghi nhan ket qua/kiem thu/rui ro.
- Quyet dinh ky thuat: Dung `AGENTS.md` de cong cu lam viec tu dong nhan quy tac; dung `docs/CHANGELOG.md` lam nguon lich su duy nhat; dat muc moi nhat len tren.
- Database/API/cau hinh: Khong co.
- Kiem thu: `git diff --check` dat; da xac nhan tat ca duong dan tai lieu duoc tham chieu deu ton tai.
- Rui ro con lai: Quy trinh chi day du khi nguoi va cong cu tuan thu viec cap nhat nhat ky trong cung lan thay doi.
- Viec tiep theo: Ap dung mau nhat ky cho moi thay doi tiep theo.
- Commit/PR: Chua tao.
