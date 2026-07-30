# Nhat ky thay doi ViChat

Day la bo nho ky thuat theo thu tu moi nhat truoc. Moi lan sua code, cau hinh, database, ha tang hoac cap nhat tinh nang phai them mot muc theo `docs/DEVELOPMENT_WORKFLOW.md`.

Khong ghi mat khau, token, cookie, khoa API, du lieu ca nhan hoac gia tri bi mat vao file nay.

## Lich su thay doi

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
