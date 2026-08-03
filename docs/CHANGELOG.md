# Nhat ky thay doi ViChat

Day la bo nho ky thuat theo thu tu moi nhat truoc. Moi lan sua code, cau hinh, database, ha tang hoac cap nhat tinh nang phai them mot muc theo `docs/DEVELOPMENT_WORKFLOW.md`.

Khong ghi mat khau, token, cookie, khoa API, du lieu ca nhan hoac gia tri bi mat vao file nay.

## Lich su thay doi

## 2026-08-03-14 - Dong bo avatar Tinode theo danh tinh Chatmgt

- Thoi gian: 2026-08-03 23:59 (Asia/Saigon)
- Loai: Sua loi | Realtime | Giao dien
- Trang thai: Hoan tat code va kiem thu local, cho commit/push/trien khai production
- Muc tieu: Avatar moi cua nhan vien phai cap nhat realtime trong danh ba, header hoi thoai, danh sach thanh vien, typing indicator va lich su tin nhan/cuoc goi ma khong can tai lai trang.
- Pham vi: Chi luong profile/avatar giua ChatUI va Tinode; khong sua message content, call signaling, presence, receipt, notification, membership, Chatmgt API, database, authentication hoac chatbot.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/tinodeClient.js`, `src/features/contacts/services/accountDirectory.js`, `src/features/contacts/services/accountDirectory.test.js`, `docs/chat-backend-architecture.md` va file nay.
- Noi dung: Tinode phat profile bang Tinode UID trong khi ChatUI giu account ID cua Chatmgt, nen avatar cu khong duoc thay trong room va message history. ChatUI nay doi chieu tat ca ID quan ly/Tinode, cache profile tu metadata topic truoc moi lan phat snapshot, cap nhat cac ban sao dang render va tim avatar typing bang cung phep doi chieu danh tinh. Tai khoan Chatmgt local khong con bi gan nham la profile Account chi-doc.
- Quyet dinh ky thuat: Giu Chatmgt la nguon danh tinh tenant va Tinode la kenh profile realtime; chi merge `name`/`avatar` vao entity trung danh tinh, bao toan ID va cac truong nghiep vu khac de tranh tao lai conversation hoac anh huong luong chat/call.
- Database/API/cau hinh: Khong thay doi. Khong migration, endpoint, payload, dependency, secret hoac bien moi truong moi.
- Kiem thu: `npm run test:frontend` dat 31/31; `npm run lint` dat voi warning legacy co san; `npm run build:production` dat; `git diff --check` se duoc chay lai tren diff staged truoc commit.
- Rui ro con lai: Chua UAT hai phien nguoi dung that de quan sat avatar doi ngay tren trinh duyet ben kia; can hard refresh mot lan sau deploy de nap bundle moi, sau do avatar thay doi tiep theo phai cap nhat realtime.
- Viec tiep theo: Stage chon loc, commit/push, deploy rieng ChatUI tu release bat bien va UAT avatar trong direct/group, typing va lich su cuoc goi.
- Commit/PR: Chua tao.

## 2026-08-03-13 - Sua tenant ChatUI production theo doanh nghiep dang van hanh

- Thoi gian: 2026-08-03 23:43 (Asia/Saigon)
- Loai: Sua loi | Trien khai | Xac thuc | Bao mat | Van hanh
- Trang thai: Hoan tat trien khai, cho nguoi dung dang nhap lai
- Muc tieu: Sua loi nhan vien vua tao trong Chatmgt bi bao sai thong tin khi dang nhap ChatUI do frontend gui nham tenant production.
- Pham vi: Cau hinh private `.env`, build arg tenant va recreate rieng `chatmgt`/`chat` cua release `/opt/deploy/chat/releases/c4d2a68`. Khong sua code, database, mat khau, Tinode topic/message, ChatAPI, PostgreSQL, Redis, Coturn hoac cac luong chat khac.
- File da thay doi: `docs/CHANGELOG.md`; `.env` production duoc sao luu va cap nhat tren server, khong dua vao Git.
- Noi dung: Audit production cho thay local employee moi nam trong tenant `tn6913580727957397` (`CTY NHAM`) voi trang thai active, `auth_source=local` va bcrypt hash hop le, nhung ChatUI cu gui `tenant_id=song-hong`. Cap nhat `CHATMGT_DEFAULT_TENANT=tn6913580727957397`, build lai frontend/management UI va force-recreate `chatmgt`/`chat`; bundle moi chua dung tenant target.
- Quyet dinh ky thuat: Giu mo hinh mot ChatUI domain co tenant co dinh de khong lo tenant selector va khong cho doanh nghiep nay do tim doanh nghiep khac. Khong reset mat khau nhan vien vi hash da hop le va khong co quyen thay doi mat khau nguoi dung neu chua duoc yeu cau.
- Database/API/cau hinh: Khong migration va khong sua du lieu tai khoan. Tao ban sao `.env.backup-before-tenant-*` mode `0600`; giu `CHAT_ACCOUNT_SSO_ENABLED=false`, `CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED=true`, `VITE_CHAT_AUTH_MODE=password`.
- Kiem thu: Hai container healthy; public health ChatUI/Chatmgt dat; bundle `App` va `ManagementApp` co `tn6913580727957397`; `verify_deployment.py` dat database/credential, health, CORS, directory, conversation, Tinode WebSocket, local password login va logout trong tenant moi.
- Rui ro con lai: Trinh duyet co the dang giu HTML/bundle cu; can hard refresh. Neu van sai sau khi bundle moi da tai, nguyen nhan con lai la mat khau nguoi dung nhap khong trung hash da tao va admin can dung chuc nang dat lai mat khau, khong xem/khong khoi phuc mat khau cu.
- Viec tiep theo: Hard refresh `chat.upgo.vn`, dang nhap bang username hoac email cua local employee va dung mat khau da cap. Neu can, admin mo `chatmgt.upgo.vn` va chon dat lai mat khau cho dung employee.
- Commit/PR: Commit ghi nhan hotfix production duoc tao trong cung lan lam viec nay (xem `git log`).

## 2026-08-03-12 - Trien khai dang nhap nhan vien Chatmgt theo tenant

- Thoi gian: 2026-08-03 23:34 (Asia/Saigon)
- Loai: Trien khai | Bao mat | Xac thuc | Realtime | Van hanh
- Trang thai: Hoan tat trien khai, cho UAT bang tai khoan doanh nghiep that
- Muc tieu: Dua luong ChatUI dang nhap username/password do admin tenant cap len production; giu Account SSO chi cho trang quan tri Chatmgt; bao toan metadata tenant va Tinode realtime bang token ngan han.
- Pham vi: Release bat bien `/opt/deploy/chat/releases/c4d2a68`, image/container `chatmgt` va `chat`, cau hinh auth production, backup Chatmgt PostgreSQL va bo verifier. Khong recreate ChatAPI, hai PostgreSQL, Redis, Coturn; khong sua noi dung tin nhan, topic, call, notification hoac worktree production dang co thay doi cuc bo.
- File da thay doi: `docs/CHANGELOG.md`; source production la commit `c3cdc5f` va tai lieu commit `c4d2a68`. File `.env` that chi duoc cap nhat tren release server, khong dua vao Git.
- Noi dung: Tao archive sach SHA-256 `f6200b0611d4f900a6dc52fa7445c863231ebf4c2516090c325bb9ad47808314`, sao chep `.env`/Tinode bootstrap tu release dang chay, dat `CHAT_ACCOUNT_SSO_ENABLED=false`, `CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED=true`, `VITE_CHAT_AUTH_MODE=password`, build va force-recreate rieng `chatmgt`/`chat`. Ca hai container hien doc Compose tu release `c4d2a68` va healthy.
- Quyet dinh ky thuat: Khong pull/reset worktree server `1b3de22` dang co thay doi cuc bo. Dung release archive de dam bao source dung commit; giu nguyen secret, volume, database, Tinode admin credential, upload va runtime. ChatUI nhan vien dung Chatmgt local credential; admin Chatmgt van dung UpGO Account SSO; Tinode credential duoc derive phia server va browser chi nhan token ngan han.
- Database/API/cau hinh: Da tao `pg_dump -Fc` mode `0600` tai `backups/chatservice-before-c4d2a68-20260803T162953Z.dump` va kiem tra duoc bang `pg_restore -l`; Alembic `upgrade head` chay thanh cong, khong co migration moi. Public health bao employee endpoint `/api/v1/auth/login`, admin Account SSO va management data da configured.
- Kiem thu: Local dat backend 81 test (28 skip runtime), frontend 29/29 va lint khong loi. Image production dat 74 test, 10 skip do runtime image khong chua source frontend. `verify_deployment.py` dat database/credential, health, CORS, directory, conversation, Tinode WebSocket, login/logout; `verify_tenant_isolation.py` dat user/conversation/friend/participant hai tenant. `chat.upgo.vn/healthz` va `chatmgt.upgo.vn/api/v1/auth/health` tra HTTP 200; probe sai mat khau tra 401 `LOGIN_FAILED`; bundle ChatUI co form `chat-password`.
- Rui ro con lai: Chua UAT bang Account admin that va hai local employee that tren trinh duyet. Can xac nhan admin tao user/cap mat khau cho projection cu, login/logout, danh ba dung tenant, nhan tin hai chieu, presence/receipt/call va khong thay du lieu tenant khac.
- Viec tiep theo: Admin doanh nghiep hard refresh `chatmgt.upgo.vn`, dang nhap bang UpGO Account, tao mot local employee hoac chon `Cap mat khau ChatUI`; sau do dung hai profile trinh duyet dang nhap `chat.upgo.vn` va chay UAT tenant/realtime. Rollback dung release truoc va backup tren, khong `down -v`.
- Commit/PR: Code `c3cdc5f`, tai lieu `c4d2a68`; commit ghi nhan trien khai duoc tao trong cung lan lam viec nay (xem `git log`).

## 2026-08-03-11 - Chuyen nhan vien sang dang nhap Chatmgt theo tenant

- Thoi gian: 2026-08-03 23:17 (Asia/Saigon)
- Loai: Kien truc | Bao mat | Tinh nang | Xac thuc | Realtime
- Trang thai: Hoan tat code va kiem thu local, cho commit/push/trien khai production
- Muc tieu: Bo UpGO Account khoi luong dang nhap ChatUI; admin tung doanh nghiep cap username/password trong Chatmgt; tat ca danh ba, metadata va quan tri bi gioi han theo tenant; Tinode tiep tuc giu noi dung va realtime bang token ngan han.
- Pham vi: Chatmgt employee auth, Account admin SSO rieng, quan ly nhan vien, Tinode credential bridge, ChatUI login, production config, verifier, tai lieu va test. Khong sua noi dung tin nhan, topic/call signaling, notification, chatbot provider, database schema hay migration.
- File da thay doi: `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/services/sso_identity.py`, `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/scripts/verify_tenant_isolation.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `chatservice-main/tests/test_sso_identity.py`, `src/features/auth/components/Login.jsx`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/chatManagementService.test.js`, `src/features/management/ManagementApp.jsx`, `src/features/management/services/managementAdminService.js`, `src/features/management/services/managementAdminService.test.js`, `package.json`, `.env.example`, `infrastructure/production/.env.example`, `infrastructure/production/Dockerfile`, `infrastructure/production/compose.yaml`, `scripts/build-production.mjs`, `README.md`, `docs/chat-backend-architecture.md`, `infrastructure/production/README.md` va file nay.
- Noi dung: ChatUI dung `VITE_CHAT_AUTH_MODE=password` va goi `/api/v1/auth/login` voi tenant build-time. Chatmgt xac thuc bcrypt, tra phien `scp=chat` o che do management, sau do `/api/v1/auth/tinode-token` moi derive/provision Tinode credential phia server. Trang quan tri Account SSO co form tao/sua/khoa/reset nhan vien; projection Account cu co the duoc cap mat khau local trong khi giu nguyen Chatmgt ID va Tinode UID.
- Quyet dinh ky thuat: Mat khau nhan vien khong con la mat khau Tinode. Tinode username va password duoc dan xuat tu tenant + Chatmgt account ID + `TINODE_SSO_SECRET`; thay doi/reset mat khau chi cap nhat bcrypt va `auth_version`. Moi management mutation tai xac minh Account admin hien hanh va scope tenant. Cung username o hai tenant co account ID, Tinode username va credential khac nhau.
- Database/API/cau hinh: Khong migration. Production doi `CHAT_ACCOUNT_SSO_ENABLED=false`, giu `CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED=true`, them `VITE_CHAT_AUTH_MODE=password`. API nhan vien hien co `/api/v1/auth/login`, `/api/v1/chat/users`, user update/reset/revoke duoc dua thanh luong production; `/api/v1/auth/tinode-token` ho tro local account. `.env` that chua duoc sua trong buoc local.
- Kiem thu: `python -m unittest discover -s chatservice-main/tests -v` dat 81 test, 28 skip do Windows khong co runtime dependency cua image; `npm run test:frontend` dat 29/29; `npm run lint` dat voi warning legacy co san; `npm run build:production` dat; `python -m py_compile ...` dat; Compose `config -q` dat khi truyen secret tam thoi khong in gia tri; `git diff --check` dat. Khong chay duoc test backend trong image local vi Docker Desktop daemon khong hoat dong (`dockerDesktopLinuxEngine` khong ton tai); se chay lai trong image tren production release truoc nghiem thu.
- Rui ro con lai: Chua chay verifier HTTP/Tinode va UAT hai tai khoan that tren server; projection Account cua chinh admin khong duoc tu reset de tranh tu khoa phien quan tri; admin muon dung ChatUI can mot local employee rieng hoac mot quyet dinh mapping sau.
- Viec tiep theo: Review diff rieng auth, commit/push, tao release bat bien, backup Chatmgt PostgreSQL, cap nhat `.env` an toan, rebuild/recreate chi `chatmgt` va `chat`, chay full test/verifier/two-tenant/public health va UAT tao/chuyen doi mot employee.
- Commit/PR: `c3cdc5f`.

## 2026-08-03-10 - Trien khai giao dien nhom gon va thanh goi lai

- Thoi gian: 2026-08-03 22:44 (Asia/Saigon)
- Loai: Trien khai | Giao dien | Kha dung
- Trang thai: Hoan tat trien khai, cho UAT truc quan
- Muc tieu: Dua giao dien tao nhom/them thanh vien da toi gian va the lich su cuoc goi gon hon len `chat.upgo.vn`, chi thay ChatUI va bao toan cac service backend dang on dinh.
- Pham vi: Release bat bien `/opt/deploy/chat/releases/1b903b3`, image va container `chat`; khong recreate Chatmgt, ChatAPI, hai PostgreSQL, Redis, Coturn, khong migration va khong sua worktree server dang co 6 thay doi cuc bo.
- Noi dung: Archive sach SHA-256 `23c4c7ad6e4d24340f2898bd718cd64a97a74dfa7802a56b0eba672517a4cc19` duoc build thanh image `sha256:704f7ec9afd2667921c8b44269067619c53fd47493c961b9bc789dd264c93c9d`; container healthy la `61bfb54c89f43d7c3c836cf351412a7700efa6d0bcf49f557406de433aa99b87`. Public entry la `index-CL4q_Url.js`, App bundle `App-xScM63rx.js` va CSS `index-ByWh0Xhh.css`.
- Quyet dinh ky thuat: Tiep tuc deploy tu archive/release sach thay vi pull/reset worktree production. Sao chep `.env` va runtime mode `0600` tu release dang chay, gan image cu thanh `songhong-production-chat:rollback-before-1b903b3`, build va force-recreate rieng `chat`. Checkpoint marker dau tien bao thieu sai vi regex bat nham `ManagementApp` thanh `App`; regex duoc sua de doc dung ChatUI bundle truoc khi nghiem thu.
- Database/API/cau hinh: Khong thay doi database, API, secret, domain, reverse proxy, Tinode, WebRTC hay bien moi truong. Chatmgt, ChatAPI, chat PostgreSQL, Tinode PostgreSQL va Redis giu nguyen container ID truoc/sau deploy.
- Kiem thu: Snapshot commit dat frontend test 27/27, lint voi warning legacy va build Vite. Production dat Nginx syntax, local/public health HTTP `200`, container `chat` healthy, public bundle co `Goi lai`, `Cuoc goi nho`, `create-group-modal`, `group-members-modal`, ten/placeholder ngan gon; khong con `CHAT GROUP`, mo ta nhom, huong dan dinh dang anh va huong dan tim kiem dai. Log ChatUI khong co `panic/fatal/traceback/exception/critical`.
- Rui ro con lai: Chua UAT truc quan tren desktop/mobile co phien Account that; nguoi dung can hard refresh de bo asset cache va kiem tra kich thuoc modal/the cuoc goi.
- Viec tiep theo: Hard refresh `chat.upgo.vn`, mo tao nhom/them thanh vien va xem lai lich su voice/video; neu hien thi dung thi tiep tuc thiet ke luong dang nhap Chatmgt username/password theo tenant trong mot thay doi backend rieng.
- Commit/PR: Tinh nang `1b903b3`; commit ghi nhan trien khai duoc tao trong cung lan lam viec nay.

## 2026-08-03-09 - Thu gon giao dien tao nhom va lich su cuoc goi

- Thoi gian: 2026-08-03 (Asia/Saigon)
- Loai: Giao dien | Kha dung
- Trang thai: Hoan tat code va kiem thu local, chua commit/deploy
- Muc tieu: Lam thanh `Goi lai` vua phai hon va don gian hoa cac form tao nhom/them thanh vien de chi giu thong tin can thiet, khong anh huong cac luong dang on dinh.
- Pham vi: Chi cap nhat JSX/CSS cua ChatUI; form tao nhom chi con anh dai dien, ten nhom va them thanh vien; form them thanh vien dung cung cach gon; khong sua API, Tinode, Chatmgt, database, presence, receipt, notification hay signaling.
- Noi dung: Bo kicker, mo ta nhom, huong dan dinh dang anh, ghi chu tu dong gan admin, nhan che do realtime va cac huong dan tim kiem dai; giu lai thong bao dang tim/khong tim thay o muc ngan gon. Thu gon kich thuoc, khoang cach, icon va nut `Goi lai` cua the lich su cuoc goi tren desktop/mobile.
- Quyet dinh ky thuat: Chi an/bot thanh phan hien thi va dieu chinh layout; giu nguyen state `groupDescription` va payload hien co de khong thay doi hop dong du lieu/API.
- Kiem thu: `npm run test:frontend` dat 27/27; `npm run lint` hoan tat voi cac warning legacy co san; `npx vite build --outDir .codex-build-ui-trim --emptyOutDir` dat; bundle co marker `Goi lai`, `Cuoc goi nho`, `call-history-redial` va khong con cac chuoi huong dan da loai bo; build tam da duoc xoa.
- Rui ro con lai: Chua UAT truc quan sau khi deploy; can kiem tra kich thuoc modal va the lich su tren desktop/mobile truoc khi phat hanh.
- Viec tiep theo: Review diff, commit/push va deploy ChatUI rieng neu phe duyet; khong recreate Chatmgt, ChatAPI, PostgreSQL, Redis hoac Coturn.

## 2026-08-03-08 - Trien khai giao dien lich su cuoc goi len production

- Thoi gian: 2026-08-03 22:08 (Asia/Saigon)
- Loai: Trien khai | Giao dien | WebRTC
- Trang thai: Hoan tat trien khai, cho UAT hai tai khoan
- Muc tieu: Dua ban dia hoa tieng Viet va nut `Goi lai` cua lich su voice/video call len `chat.upgo.vn` ma khong recreate cac service backend dang on dinh.
- Pham vi: Chi build va force-recreate service `chat` tu release bat bien `/opt/deploy/chat/releases/da9f3f6`; khong sua database, migration, Chatmgt, ChatAPI, PostgreSQL, Redis, Coturn, Account SSO hay worktree server dang co thay doi cuc bo.
- File da thay doi: `docs/CHANGELOG.md`; runtime production dung source commit `da9f3f6` va private `.env`/runtime duoc sao chep mode `0600` tu release WebRTC truoc.
- Noi dung: Tao archive sach cua commit `da9f3f6`, xac minh SHA-256 `13227f3b3edf839274e02020bc2bfb6168de5583a026a978bc309ec79c171190`, validate Compose, build image ChatUI moi va recreate rieng container `songhong-production-chat-1`. Release moi phuc vu bundle `index-Ckr47Mme.js`, `App-pMbbICIK.js` va CSS co `call-history-redial`.
- Quyet dinh ky thuat: Tiep tuc dung release directory thay vi pull/reset worktree server o `1b3de22` dang co 6 thay doi cuc bo. Gan image cu thanh `songhong-production-chat:rollback-before-da9f3f6`; script chi rollback ChatUI neu build, health, Nginx, marker bundle hoac bao toan container ID that bai.
- Database/API/cau hinh: Khong thay doi. Khong migration, secret, API, port, firewall, Tinode ICE/TURN hoac bien moi truong moi.
- Kiem thu: Commit sach dat frontend test 27/27, lint voi warning legacy va build production. Production xac nhan ChatUI image `sha256:7b61d30ad7695d96244daa6eb167f7e3a924bde1a39bde87cfa13a7b804f90ff`, container healthy, Nginx syntax dat, local/public health HTTP `200`, public App bundle co `Goi lai`, `Cuoc goi nho` va thong bao Tinode co dau. Chatmgt, ChatAPI, hai PostgreSQL, Redis va Coturn giu nguyen container ID; log ChatUI khong co `emerg/fatal/panic/critical`.
- Rui ro con lai: Chua UAT thao tac goi lai bang hai Account user that tren desktop/mobile va hai mang khac nhau; provider firewall TURN van can duoc xac nhan nhu muc `2026-08-03-06`.
- Viec tiep theo: Hai user hard refresh, tao cuoc goi nho va cuoc goi da nghe, bam `Goi lai` cho ca voice/video, sau do regression tin nhan 1-1/nhom, presence, receipt va thong bao.
- Commit/PR: Code `da9f3f6`; commit ghi nhan trien khai duoc tao trong cung lan lam viec nay (xem `git log`).

## 2026-08-03-07 - Hoan thien giao dien lich su cuoc goi

- Thoi gian: 2026-08-03 21:52 (Asia/Saigon)
- Loai: Giao dien | WebRTC | Kha dung
- Trang thai: Hoan tat code va kiem thu local, chua commit/deploy
- Muc tieu: Hien thi tieng Viet co dau tren toan bo giao dien cuoc goi va them hanh dong `Goi lai` ngay duoi moi ban ghi cuoc goi nho/da nghe ma khong thay doi signaling hay cac luong chat dang on dinh.
- Pham vi: Nhan lich su cuoc goi, man hinh voice/video call, nut goi lai va CSS cua the lich su; khong sua Tinode topic, WebRTC signaling, Chatmgt, Account SSO, database, presence, receipt, nhom, thong bao hoac chatbot.
- File da thay doi: `src/app/App.jsx`, `src/styles/index.css`, `src/features/chat/components/CallOverlay.jsx`, `src/features/chat/services/callSignaling.js`, `src/features/chat/services/callSignaling.test.js`, `src/features/chat/services/tinodeClient.js` va `docs/CHANGELOG.md`.
- Noi dung: Chuyen cac nhan trang thai/loi/aria cua cuoc goi, ke ca thong bao loi Tinode co the hien tren ChatUI, sang tieng Viet co dau; giu dinh dang `Cuoc goi nho` va `Cuoc goi den - mm:ss`; them hang `Goi lai` co bieu tuong ben duoi the lich su cho ca voice va video. Nut dung lai `handleStartCall` hien co, lay dung `audioOnly` cua ban ghi va tu vo hieu hoa theo call capability hien tai.
- Quyet dinh ky thuat: Khong tao signaling hoac API moi; hanh dong goi lai chi khoi dong lai luong goi 1-1 da duoc nghiem thu. Khong cap nhat tai lieu kien truc vi ranh gioi dich vu va luong du lieu khong thay doi.
- Database/API/cau hinh: Khong thay doi, khong migration, khong dependency va khong them bien moi truong.
- Kiem thu: `npm run test:frontend` dat 27/27; `npm run lint` dat voi cac warning legacy co san; build Vite voi `VITE_CHAT_MODE=internal` dat va bundle co cac marker `Goi lai`, `Cuoc goi nho`, `call-history-redial`; build tam da duoc xoa.
- Rui ro con lai: Chua UAT truc quan bang hai Account user that tren desktop/mobile; can xac nhan nut goi lai tu lich su voice/video va quyen micro/camera sau khi deploy.
- Viec tiep theo: Review diff rieng phan call, commit/push va deploy ChatUI bang release bat bien, sau do UAT missed/answered/redial voi hai tai khoan.
- Commit/PR: Commit tinh nang duoc tao trong cung lan lam viec nay (xem `git log`).

## 2026-08-03-06 - Ghi nhan firewall nha cung cap cho TURN

- Thoi gian: 2026-08-03 14:27 (Asia/Saigon)
- Loai: Van hanh | Bao mat | Trien khai
- Trang thai: Can xac nhan
- Muc tieu: Xac dinh kha nang truy cap TURN tu mang ngoai sau khi release WebRTC da healthy tren server `.206`.
- Pham vi: Chi kiem tra ket noi den cong TURN production; khong sua code, database, container hay cac luong chat dang on dinh.
- File da thay doi: `docs/CHANGELOG.md`.
- Noi dung: UFW tren server da co rule TCP/UDP `3478` va UDP `49160-49200`; probe TCP tu may phat trien den `103.74.122.206:3478` timeout sau 5 giay. HTTP public, ChatUI, ChatAPI, Tinode hello va Coturn local van dat.
- Quyet dinh ky thuat: Khong rollback release chi vi probe ngoai bi chan; TURN la lop ha tang ngoai server va release van co rollback image/tag. Khong tu dong thay doi provider firewall khi chua co quyen quan tri tuong ung.
- Database/API/cau hinh: Khong thay doi source hay database. Can mo inbound TCP/UDP `3478` va UDP `49160-49200` tai firewall nha cung cap cho IP `103.74.122.206`.
- Kiem thu: `Test-NetConnection 103.74.122.206 -Port 3478` timeout; probe socket 5 giay cung timeout; `ss`, UFW, public health, bundle marker va Tinode `iceServers` count 2 da dat tren server.
- Rui ro con lai: Cuoc goi giua hai mang khac nhau co the khong relay duoc cho den khi provider firewall mo dung cong; chua UAT micro/camera voi hai Account user that.
- Viec tiep theo: Mo rule provider firewall, chay lai probe TCP/UDP tu mang ngoai, sau do UAT voice/video/reject/timeout/hang-up/toggle va regression chat.
- Commit/PR: Commit chua muc nay (xem `git log`).

## 2026-08-03-05 - Trien khai goi thoai va video Tinode WebRTC

- Thoi gian: 2026-08-03 14:24 (Asia/Saigon)
- Loai: Trien khai | Realtime | Ha tang | Giao dien
- Trang thai: Hoan tat trien khai, cho UAT media hai tai khoan
- Muc tieu: Dua tinh nang goi thoai/video 1-1 cua commit `62be0e2` len `chat.upgo.vn`, bat ICE/TURN cho Tinode va bao toan cac service, volume va luong Chatmgt dang on dinh.
- Pham vi: Release bat bien `/opt/deploy/chat/releases/62be0e2`, Coturn, ChatAPI va ChatUI; khong recreate Chatmgt, hai PostgreSQL, Redis, khong migration va khong sua worktree server dang co thay doi cuc bo.
- File da thay doi: `docs/CHANGELOG.md`; runtime production dung source commit `62be0e2`, `.env` va `runtime/ice-servers.json` rieng cua release.
- Noi dung: Archive SHA-256 `0d84bd1fb441aab7f556c4a9000d614cb893c99fd1c3f9226bcb16d6f0bc641a` duoc giai nen vao release moi. UFW mo TCP/UDP `3478` va UDP `49160-49200`; Coturn pin checksum lang nghe tai `192.168.80.160:3478`. ChatAPI duoc recreate voi `WEBRTC_ENABLED=true` va mount `/data/runtime`; ChatUI image moi la `sha256:c8a0b0fbc4f143405d4c6a824de52c891146930edeeb7144896e43942d93e5af`, public entry `index-CRMiKokq.js` va App bundle `App-B5OfzHjX.js`.
- Quyet dinh ky thuat: Dung release directory thay vi pull/reset worktree server; copy private `.env` va Tinode bootstrap voi mode `0600`, render ICE file mode `0600`, giu ChatUI cu bang tag `songhong-production-chat:rollback-before-62be0e2`. Ba lan acceptance dau rollback an toan do harness lan luot gap quoting Docker label va cu phap BusyBox/public marker, khong do health ung dung; lan cuoi tach tung checkpoint va chi giu release moi sau khi tat ca dau ra dat.
- Database/API/cau hinh: Khong migration va khong doi Chatmgt API. Them WebRTC/TURN vao `.env` cua release, khong ghi secret vao Git/nhat ky. Chatmgt van chay tu release `d24c4af`; worktree server van o `1b3de22` voi dung 6 thay doi cuc bo nhu truoc trien khai.
- Kiem thu: Local staged clean dat `npm run test:frontend` 27/27, `npm run lint` voi warning legacy, build Vite internal/external, `bash -n`, hai Compose config va `git diff --check`. Production xac nhan Nginx syntax trong dung Compose network; ChatUI va ChatAPI healthy; Coturn running; Tinode hello tra `TINODE_ICE_SERVERS_COUNT=2`; local/public health dat; public App bundle co marker `ice-candidate`; Tinode PostgreSQL, Chatservice PostgreSQL, Redis va Chatmgt giu nguyen container ID; log khong co `emerg/fatal/panic/critical`.
- Rui ro con lai: Chua UAT micro/camera bang hai Account user that tren hai mang khac nhau va khong co quyen doc firewall ngoai cua nha cung cap. UFW tren may chu da mo dung cong, nhung can xac nhan provider firewall cho UDP relay neu nha cung cap co lop loc rieng.
- Viec tiep theo: Hai nguoi dung hard refresh, thu voice/video tren hai mang khac nhau, reject, timeout, hang-up, bat/tat micro-camera; sau do regression chat 1-1/nhom, presence, receipt va notification.
- Commit/PR: Code `62be0e2`; commit ghi nhan trien khai chua muc nay (xem `git log`).

## 2026-08-03-04 - Them goi thoai va video P2P qua Tinode WebRTC

- Thoi gian: 2026-08-03 11:09 (Asia/Saigon)
- Loai: Tinh nang | Realtime | Ha tang | Giao dien
- Trang thai: Hoan tat code, cho trien khai va UAT hai tai khoan
- Muc tieu: Them cuoc goi thoai va video 1-1 tren ChatUI bang signaling WebRTC chinh thuc cua Tinode, giu nguyen cac luong chat, Account SSO, nhom, presence, receipt, thong bao va external chatbot dang co.
- Pham vi: Tinode client event bridge, call overlay ChatUI, lich su cuoc goi, cau hinh WebRTC/ICE/TURN production, test va tai lieu; khong thay doi database, Chatmgt auth/API nghiep vu hoac noi dung tin nhan hien co.
- File da thay doi: `src/app/App.jsx`, `src/styles/index.css`, `src/features/chat/components/CallOverlay.jsx`, `src/features/chat/services/callSignaling.js`, `src/features/chat/services/callSignaling.test.js`, `src/features/chat/services/tinodeClient.js`, `package.json`, `infrastructure/production/.env.example`, `infrastructure/production/compose.yaml`, `infrastructure/production/start.sh`, `infrastructure/production/README.md`, `docs/chat-backend-architecture.md` va `docs/CHANGELOG.md`.
- Noi dung: Them nut goi thoai/video cho hoi thoai truc tiep da bind Tinode, man hinh nhan/tu choi/ket thuc, bat tat micro-camera, dong ho thoi luong, avatar an toan, lich su cuoc goi va cleanup media khi logout/mat ket noi. Signaling dung Drafty `VC` va cac Tinode info event chinh thuc; loc topic theo binding Chatmgt, tu choi cuoc goi khi dang ban, vo hieu hoa nhom/chatbot/trinh duyet khong ho tro va xu ly tab khac da nhan cuoc goi. ICE server duoc loc truoc khi tao `RTCPeerConnection`.
- Quyet dinh ky thuat: Chi ho tro P2P theo kha nang Tinode 0.25.3; khong gia lap group call va khong tao signaling API trong Chatmgt. Coturn dung host network, long-term credential va day relay UDP gioi han. `TURN_HOST` bat buoc tro truc tiep toi Coturn; `chat.upgo.vn` hien phan giai ra `.218`, nen deployment `.206` dung IP `103.74.122.206` hoac DNS rieng tro ve `.206`. External chatbot mode khong khoi tao Tinode va khong hien thi kha nang goi.
- Database/API/cau hinh: Khong migration, khong doi Chatmgt API. Them `WEBRTC_ENABLED`, `TURN_*`, file runtime `ice-servers.json` mode `0600` va Coturn profile; ChatAPI chi duoc recreate sau khi TURN/firewall san sang. Tinode/PostgreSQL/Redis volume, bootstrap va credential cu phai duoc bao toan.
- Kiem thu: `npm run test:frontend` dat 27/27; `npm run lint` dat, chi con warning legacy ngoai pham vi; build Vite tam voi `VITE_CHAT_MODE=internal` va `external` deu dat; `bash -n infrastructure/production/start.sh`, render ICE bat/tat va mode `0600`, Compose config khi tat/bat profile, `git diff --check` deu dat. Image Coturn pin dung checksum khoi dong thanh cong tren server `.206`, lang nghe va relay dung `192.168.80.160`; hai tuy chon khong duoc image ho tro da duoc loai bo truoc trien khai.
- Rui ro con lai: Chua UAT media bang hai Account user that tren hai mang khac nhau va chua xac minh firewall cua nha cung cap. Can thu permission micro/camera, voice, video, reject, timeout, hang-up, toggle, sau do regression chat 1-1/nhom, presence, receipt, notification va external chatbot.
- Viec tiep theo: Tao commit/push rieng cho call, mo TCP/UDP `3478` va UDP `49160-49200` tren `.206`, deploy Coturn + recreate rieng ChatAPI/ChatUI co rollback, xac nhan Tinode hello co ICE server roi UAT hai tai khoan.
- Commit/PR: Commit chua muc nay (xem `git log`).

## 2026-08-03-01 - Hoan thien tat thong bao theo hoi thoai

- Thoi gian: 2026-08-03 09:43 (Asia/Saigon)
- Loai: Sua loi | Thong bao | Chatmgt metadata | Giao dien
- Trang thai: Hoan tat, cho trien khai
- Muc tieu: Sua duy nhat luong tat thong bao theo tung hoi thoai: van cap nhat badge va noi dung tin moi nhat, khong hien popup desktop, co chuong gach cheo, chon 1 gio/4 gio/den 8:00 sang/den khi mo lai va tu dong het mute dung deadline.
- Pham vi: ChatUI notification state/UI, Chatmgt participant metadata, mot endpoint preference va migration; khong sua noi dung tin nhan, Tinode topic/subscription, gui/nhan, receipt, presence, typing, file, group membership, Account SSO, Chatmgt admin UI hay cac luong dang on dinh khac.
- File da thay doi: `src/app/App.jsx`, `src/styles/index.css`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/conversationNotifications.js`, `src/features/chat/services/conversationNotifications.test.js`, `package.json`, `chatservice-main/application/models/models.py`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/migrations/009_conversation_notification_preferences.sql`, `chatservice-main/alembic/versions/20260803_09_conversation_notification_preferences.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `README.md`, `chatservice-main/README.md`, `docs/chat-backend-architecture.md` va `docs/CHANGELOG.md`.
- Noi dung: Luu `notification_muted_until` rieng tren membership cua nguoi dang nhap; `NULL` la dang bat, `0` la tat den khi mo thu cong, timestamp duong la deadline. ChatUI dat timer toi deadline gan nhat de bo chuong gach cheo va mo lai am bao khong can refresh. Tin nhan cua hoi thoai dang mute van cap nhat `badge`, `lastMsg`, thu tu va panel thong bao; chi am bao bi chan. Loai bo hoan toan viec xin quyen va tao `window.Notification` desktop.
- Quyet dinh ky thuat: Chatmgt tiep tuc lam nguon chuan metadata theo nguoi dung; Tinode van lam nguon chuan message/unread/realtime. Khong dat mute vao conversation chung de tranh mot thanh vien tat thong bao cho ca nhom. Endpoint `PUT /api/v1/conversation/<id>/notification-settings` chi sua membership da duoc tenant/auth guard xac nhan va khong goi Tinode.
- Database/API/cau hinh: Them Alembic head `20260803_09` va cot nullable `conversation_participant.notification_muted_until`; can chay `alembic -c alembic.ini upgrade head` truoc khi recreate Chatmgt. Them endpoint notification-settings; khong them dependency, secret, domain, reverse proxy hay bien moi truong.
- Kiem thu: `npm run test:frontend` dat 22/22; `npm run lint` dat voi warning legacy co san; `npm run build:production` dat; `python -m unittest tests.test_chat_auth_contract -v` dat 27/27; full backend `python -m unittest discover -s tests -v` dat 71 test voi 28 skip do dependency chi co trong image; `python -m compileall application tests` dat; `python -m alembic -c alembic.ini heads` tra `20260803_09 (head)`; production bundle co marker UI/API/CSS moi.
- Rui ro con lai: Browser skill khong co browser session kha dung nen chua QA bang thao tac/anh chup desktop-mobile. Full test runtime, migration tren PostgreSQL that va hai phien Account that can chay trong image/production truoc khi nghiem thu.
- Viec tiep theo: Build image release sach, chay Alembic va verifier trong Chatmgt image, deploy rieng `chatmgt` va `chat`, sau do UAT mute/unmute va deadline bang hai tai khoan.
- Commit/PR: Commit tinh nang duoc tao trong cung lan lam viec nay (xem `git log`).

## 2026-08-01-13 - Trien khai presence nhom va receipt nen

- Thoi gian: 2026-08-01 14:47 (Asia/Saigon)
- Loai: Trien khai | Sua loi | Realtime | Van hanh
- Trang thai: Can xac nhan
- Muc tieu: Dua hotfix `4d1ed91` len production de bang thanh vien nhom nhan dung Tinode presence va tin nhan chuyen sang da nhan ngay khi nguoi nhan dang nhap.
- Pham vi: Release/image/container rieng `chatmgt` va `chat`; khong recreate ChatAPI, hai PostgreSQL, Redis, khong migration va khong sua `.env` hay worktree server.
- File da thay doi: `docs/CHANGELOG.md`; source runtime tu release bat bien `/opt/deploy/chat/releases/4d1ed91`.
- Noi dung: Archive sach SHA-256 `5cecc6c8892e72a9ed8f1ed88872fe94b1e562a6cf93e06c53ae2545886e7c50` duoc build thanh Chatmgt image `sha256:67dcb24300fe1258e606fce22c787a639f3bfd1f6d626e954ad4fb26ec460e9b` va ChatUI image `sha256:b865fba4322e2adcbfe96bd06005897f3fb5f6ad4a20fd1150f110da33ee4128`. Container healthy lan luot la `9eb2247056a3b88a19577d968165873d5dffda8fec67800b3d6fc770690afcaf` va `3197af75915e319c7921cd3dc17e2a66dd93175a3a0fbfab6994148d07ea9850`; public entry `index-A7zaVCil.js`, App bundle `App-CtMnwmhX.js` co ca marker `JRWPAS` va `noteRecv`.
- Quyet dinh ky thuat: Giu image cu bang tag `songhong-production-chatmgt:rollback-d3e3f7c-before-4d1ed91` va `songhong-production-chat:rollback-bc558b6-before-4d1ed91`. Cac luot acceptance dau rollback an toan do harness kiem tra tra exit code khong chinh xac sau HTTP 200 va `curl` gap pipefail 23 khi `grep -q` dong pipe som; lan cuoi dung `docker exec` cho verifier va tai public asset vao file tam truoc khi doi chieu marker.
- Database/API/cau hinh: Khong thay doi. Tinode bootstrap goc va ban trong release deu giu mode `0600`; archive tam local/server da xoa; khong sua secret, domain, reverse proxy hay volume.
- Kiem thu: Local frontend dat 17/17, lint dat voi warning legacy, production build dat va contract Python dat 25 test chay truc tiep. Image Chatmgt dat 69 test voi 9 source-only skip; `verify_deployment.py` va `verify_tenant_isolation.py` deu dat. Chatmgt/ChatUI local va public health dat; public bundle co mode/receipt moi; log khong co `traceback/panic/fatal/critical`. ID ChatAPI `0be211d4f08a3f583dae199391b3fa273b28ef3a7252f4ea045c9e688719e738`, hai PostgreSQL va Redis khong doi.
- Rui ro con lai: Runtime khong co hai phien Account that de UAT granted/wanted mode cua nhom cu va receipt realtime tu hai phia. Chu nhom va thanh vien can hard refresh de ca hai tai bundle moi.
- Viec tiep theo: Tai khoan A gui tin khi B offline; B chi dang nhap, khong mo chat, A phai thay hai dau tich da nhan. Sau do mo cung nhom, xac nhan tung thanh vien Online; dong/ngat mot phien va xac nhan Offline cung bo dem nhom cap nhat realtime.
- Commit/PR: Code `4d1ed91`; commit ghi nhan trien khai duoc tao sau muc nay.

## 2026-08-01-12 - Sua presence thanh vien nhom va receipt khi dang nhap

- Thoi gian: 2026-08-01 14:34 (Asia/Saigon)
- Loai: Sua loi | Realtime | Tinode bridge
- Trang thai: Can xac nhan
- Muc tieu: Bao dam bang thong tin nhom hien dung Online/Offline cua tung thanh vien va tin nhan da gui chuyen sang trang thai da nhan ngay khi nguoi nhan dang nhap, khong doi cac luong dang on dinh.
- Pham vi: Chi presence/receipt Tinode trong ChatUI va mode subscription do Chatmgt cap khi them/chuyen chu nhom; khong sua Account SSO, noi dung tin nhan, API contract, database, membership, thong bao, typing, file hay cac thao tac nhom khac.
- File da thay doi: `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/chatRealtime.test.js`, `src/features/chat/services/tinodeClient.js`, `chatservice-main/application/services/auth_service.py`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/tests/test_tinode_bridge_service.py`, `chatservice-main/tests/test_chat_auth_contract.py` va `docs/CHANGELOG.md`.
- Noi dung: Them quyen `P` vao mode thanh vien Tinode (`JRWPAS`, chu nhom thay the `JRWPASO`) o ca ChatUI va Chatmgt; tu nang mode nhom cu khi topic duoc subscribe va tai lai subscriber metadata; phat su kien `on/off` cua group vao snapshot presence chung de danh ba, header va bang thanh vien cap nhat cung luc. Moi topic Chatmgt cho phep van duoc subscribe nen sau khi dang nhap ChatUI chu dong gui `recv` toi sequence moi nhat, giup phia gui nhan hai dau tich ma khong doi thanh `read` cho den khi nguoi nhan mo cuoc tro chuyen.
- Quyet dinh ky thuat: Chatmgt tiep tuc la nguon chuan membership/UID va chi cap them quyen presence; Tinode van la nguon chuan Online/Offline va delivery/read receipt. Online co the dao chieu khi co `on/off`; receipt da nhan/da doc la don dieu va khong lui ve mot dau tich khi nguoi dung offline.
- Database/API/cau hinh: Khong thay doi. Khong migration, endpoint, payload, dependency, secret hay bien moi truong moi.
- Kiem thu: `npm run test:frontend` dat 17/17; `npm run lint` dat voi warning legacy co san; production build dat; `git diff --check` dat. `python -m unittest tests.test_tinode_bridge_service tests.test_chat_auth_contract -v` dat 25 test chay truc tiep va skip 5 test bridge do may local khong co dependency runtime; 5 test nay phai chay trong image Chatmgt truoc khi deploy.
- Rui ro con lai: Nhom cu can chu nhom va thanh vien tai bundle moi de hai phia granted/wanted mode cung co `P`; sau deploy can hard refresh hai tai khoan va UAT ca group presence lan receipt nen.
- Viec tiep theo: Build image tu commit sach, chay full test Chatmgt trong image, deploy rieng `chatmgt` va `chat`, giu nguyen ChatAPI/PostgreSQL/Redis, sau do thu hai tai khoan that.
- Commit/PR: Commit hotfix duoc tao trong cung lan lam viec nay (xem `git log`).

## 2026-08-01-11 - Trien khai realtime presence nhom tren ChatUI

- Thoi gian: 2026-08-01 14:12 (Asia/Saigon)
- Loai: Trien khai | Sua loi | Realtime | Van hanh
- Trang thai: Can xac nhan
- Muc tieu: Dua hotfix `ef8f47e` len `chat.upgo.vn` de Online/Offline lay dung tu Tinode va nhom hien tong thanh vien cung so nguoi dang online.
- Pham vi: Release/image/container rieng service `chat`; khong recreate Chatmgt, ChatAPI, hai PostgreSQL, Redis, khong migration va khong sua `.env` hay worktree server.
- File da thay doi: `docs/CHANGELOG.md`; source runtime tu release bat bien `/opt/deploy/chat/releases/ef8f47e`.
- Noi dung: Archive sach SHA-256 `f62d0d4a9a629d92f6bd5c25827dfc746cc2b9874052d00c1b639b0350e33614` duoc build thanh image `sha256:bc558b6970cc320b2ab075f86723e3c074331cfa603a64254bbc88098f66a455`; container healthy la `82a46a9bac5a8e91a14ab615dd67150ae2abec0d7e5ca6759354e9fdfee69e53`. Public entry la `index-BJYafli6.js`, bundle ChatUI la `App-CPtdJXTx.js` va co marker `group-presence` cua hotfix.
- Quyet dinh ky thuat: Build tu archive cua dung commit de khong lay cac sua doi cuc bo o may local/server; tag image cu thanh `songhong-production-chat:rollback-00af039-before-ef8f47e`; acceptance co rollback tu dong neu image, health, public asset hoac container boundary khong dat.
- Database/API/cau hinh: Khong thay doi. Private Tinode bootstrap giu mode `0600`; archive tam da xoa; khong sua secret, domain, reverse proxy, volume hay backend service.
- Kiem thu: Local test dat 15/15, lint dat voi warning legacy va production build dat. Image Nginx syntax dat; local/public health HTTP 200; public entry va App bundle dung asset moi; Chatmgt health HTTP 200; log ChatUI khong co `panic/fatal/exception/critical`. ID Chatmgt `e2c6c7c651ee9776453e8e343e1161d9e3e128fdb6f881e4e70393a42b84cf15`, ChatAPI `0be211d4f08a3f583dae199391b3fa273b28ef3a7252f4ea045c9e688719e738`, hai PostgreSQL va Redis khong doi.
- Rui ro con lai: Kiem tra tu dong khong mo duoc hai phien Account that de quan sat Tinode presence. Can hard refresh hai trinh duyet va xac nhan bo dem thay doi khi mot thanh vien online/offline.
- Viec tiep theo: Hai tai khoan cung tenant mo cung mot nhom; xac nhan nhan `N thanh vien - M dang online`, sau do dong/mat ket noi mot tai khoan va kiem tra `M` cap nhat realtime; thu lai gui/nhan tin de bao dam cac luong cu van on dinh.
- Commit/PR: Code `ef8f47e`; commit ghi nhan trien khai duoc tao sau muc nay.

## 2026-08-01-10 - Sua realtime online va thong ke presence nhom

- Thoi gian: 2026-08-01 14:05 (Asia/Saigon)
- Loai: Sua loi | Realtime | Giao dien
- Trang thai: Can xac nhan
- Muc tieu: Cap nhat Online/Offline theo Tinode va hien tieu de nhom theo mau `N thanh vien - M dang online`, giu nguyen cac luong chat, thong bao, Account SSO va quan tri dang hoat dong.
- Pham vi: Chi ChatUI, gom chuyen doi presence tu subscriber Tinode, hop nhat presence vao thanh vien do Chatmgt quan ly, dem thanh vien online va mau chu thong ke nhom; khong sua Chatmgt, ChatAPI, database, API, SSO hay handler gui/nhan tin.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/tinodeClient.js`, `src/features/contacts/services/accountDirectory.js`, `src/features/contacts/services/accountDirectory.test.js`, `src/styles/index.css` va `docs/CHANGELOG.md`.
- Noi dung: Chi coi subscriber la online khi Tinode tra ve `online === true`; giu identity, ten va avatar tu Chatmgt nhung phu presence realtime tu Tinode; bao toan presence cua thanh vien khong doi khi Chatmgt refresh danh sach; header va bang thong tin nhom cung hien tong thanh vien va so nguoi dang online; trang thai cua tai khoan hien tai phan anh ket noi realtime thay vi hardcode Online.
- Quyet dinh ky thuat: Chatmgt tiep tuc la nguon chuan ve membership/profile, Tinode la nguon chuan ve presence. Thanh vien moi khong duoc suy dien online, thanh vien da bi xoa khong duoc giu lai, va trang thai cua chinh nguoi dang dung duoc tinh theo phien Tinode hien tai.
- Database/API/cau hinh: Khong thay doi. Khong migration, dependency, bien moi truong, secret, domain hay reverse proxy moi.
- Kiem thu: `npm run test:frontend` dat 15/15; `npm run lint` dat voi warning legacy co san trong `src/App.jsx` va `public/ChatBotWidget/tinode.js`; `npm run build -- --outDir .codex-build-group-presence --emptyOutDir` dat; `git diff --check` dat. Thu muc build tam da xoa sau khi kiem tra.
- Rui ro con lai: Runtime khong co hai phien Account production de UAT presence thuc te. Sau deploy can hard refresh hai trinh duyet, mo cung mot nhom va kiem tra so online thay doi khi mot tai khoan ket noi/ngat ket noi.
- Viec tiep theo: Commit/push, deploy rieng service `chat` len `.206`, xac minh health/public asset/container boundary va UAT bang hai tai khoan that.
- Commit/PR: Commit hotfix duoc tao trong cung lan lam viec nay (xem `git log`).

## 2026-08-01-09 - Trien khai hotfix dong bo nhom Tinode

- Thoi gian: 2026-08-01 13:41 (Asia/Saigon)
- Loai: Trien khai | Sua loi | Realtime | Van hanh
- Trang thai: Can xac nhan
- Muc tieu: Dua hotfix group invite/binding cua commit `00af039` len `chat.upgo.vn` de nguoi dung kiem tra nhom moi noi len dau, badge/thong bao va khong con binding conflict.
- Pham vi: Release/image/container rieng service `chat`; khong recreate Chatmgt, ChatAPI, hai PostgreSQL, Redis, khong migration va khong sua `.env` hay worktree server.
- File da thay doi: `docs/CHANGELOG.md`; source runtime tu release bat bien `/opt/deploy/chat/releases/00af039`.
- Noi dung: Archive sach SHA-256 `d89b1da7fa1fff8dec3150c90c1214650e52ad389ad9cdaa0ef1122aac16e0b9` duoc build thanh image `sha256:72d713fa98cede424d68180c48a7c6c02d6fe8a734d818e7510dcb53465ba9d9`; container healthy la `7b560cd8d93d14612ab93b2e869d0f7d4cd71082abff317c8d376ab2840d8f16`. Public entry la `index-C5OmRS5W.js`, bundle ChatUI la `App-BXlqrkTj.js` va co marker `getPendingConversationTopics` cua hotfix.
- Quyet dinh ky thuat: Dung release/archive sach de bao toan cac sua doi cuc bo tren server va tag image cu thanh `songhong-production-chat:rollback-bc89b97-before-00af039`. Ba acceptance script dau dung/rollback an toan do lan luot doc nham image ID cua container, test Nginx ngoai Docker network, va dung cu phap GNU `find`/regex asset khong tuong thich BusyBox; lan cuoi lay asset truc tiep tu image va chi giu container moi sau khi toan bo health/public/boundary check dat.
- Database/API/cau hinh: Khong thay doi. Archive tam tren server da xoa; private Tinode bootstrap duoc bao toan mode `0600`; khong sua secret, domain, reverse proxy hay volume.
- Kiem thu: Local `npm run test:frontend` dat 12/12, lint dat voi warning legacy va production build dat. Server build tao dung asset moi; Nginx syntax trong image va tren host dat; local/public `/healthz`, public ChatUI bundle va Chatmgt health deu dat; ChatUI log 10 phut co 0 `panic/fatal/exception/critical`. ID Chatmgt `e2c6c7c651ee9776453e8e343e1161d9e3e128fdb6f881e4e70393a42b84cf15`, ChatAPI `0be211d4f08a3f583dae199391b3fa273b28ef3a7252f4ea045c9e688719e738`, hai PostgreSQL va Redis khong doi.
- Rui ro con lai: Chua co hai phien Account production trong browser runtime de UAT nhom that. Can hard refresh de loai cache bundle cu va thu truong hop nguoi khac tao nhom/gui tin ngay sau khi moi.
- Viec tiep theo: Dung hai tai khoan cung tenant, hard refresh ca hai; tai khoan A tao nhom va gui tin ngay, tai khoan B xac nhan nhom tu noi len dau, co badge/thong bao, mo duoc khong bao conflict; sau do thu lai chat 1-1.
- Commit/PR: Code `00af039`; commit ghi nhan trien khai chua muc nay.

## 2026-08-01-08 - Sua dong bo topic va thong bao nhom Tinode

- Thoi gian: 2026-08-01 13:21 (Asia/Saigon)
- Loai: Sua loi | Tich hop | Realtime
- Trang thai: Can xac nhan
- Muc tieu: Bao dam thanh vien nhan duoc nhom Tinode moi sau khi duoc moi, khong tao topic trung, co realtime badge/thu tu danh sach va giu nguyen chat 1-1.
- Pham vi: Chi luong ChatUI buoc 4 giua Chatmgt va Tinode; khong sua backend binding guard, Account SSO, Chatmgt UI, database hay ChatAPI.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/chatRealtime.test.js`, `src/features/chat/services/tinodeClient.js`, va `docs/CHANGELOG.md`.
- Noi dung: ChatUI su dung `tinodeTopic` vua duoc `tinode-prepare` tra ve truoc khi tao group; them retry co gioi han 120/600/1800 ms cho contacts sync khi Tinode invite den truoc commit binding Chatmgt; chi retry khi con topic Tinode chua duoc Chatmgt cho phep va dung ngay khi phien thay doi. Khi topic dung duoc subscribe, event hien co tiep tuc cap nhat badge, `updatedAt`, thu tu va thong bao.
- Quyet dinh ky thuat: Giu nguyen HTTP 409 `TINODE_TOPIC_ALREADY_BOUND` de ngan rebind sai; khong cho phep topic Tinode tu do vao danh sach neu Chatmgt chua xac nhan. Trich logic topic va chinh sach retry thanh helper thuan de test ma khong thay doi state/handler chat 1-1.
- Database/API/cau hinh: Khong thay doi. Them mot phuong thuc doc noi bo `getPendingConversationTopics()` tren client Tinode de phat hien topic realtime chua duoc allow.
- Kiem thu: `npm run test:frontend` dat 12/12; `npm run lint` dat voi warning legacy san co trong `src/App.jsx` va `public/ChatBotWidget/tinode.js`; `npm run build -- --outDir .codex-build-group-sync --emptyOutDir` dat; `git diff --check` dat. Browser runtime khong co browser session nen chua test UI production truc tiep.
- Rui ro con lai: Can build/deploy service ChatUI va thu UAT bang hai tai khoan that de xac nhan moi nhom moi, tin nhan dau tien, badge, thong bao va thu tu danh sach tren trinh duyet desktop/mobile.
- Viec tiep theo: UAT production bang hai tai khoan that theo muc trien khai `2026-08-01-09`.
- Commit/PR: `00af039`.

## 2026-08-01-05 - Trien khai hotfix man hinh trang Chatmgt

- Thoi gian: 2026-08-01 12:00 (Asia/Saigon)
- Loai: Trien khai | Sua loi | Giao dien
- Trang thai: Hoan tat
- Muc tieu: Dua guard bootstrap cua commit `64d755b` len production, khoi phuc giao dien premium ma khong thay doi chuc nang.
- Pham vi: Release/image/container rieng `chatmgt` va public management JavaScript; khong recreate ChatUI, ChatAPI, hai PostgreSQL, Redis, khong migration va khong sua `.env` hay worktree server.
- File da thay doi: `docs/CHANGELOG.md`; source runtime trien khai tu release bat bien `/opt/deploy/chat/releases/64d755b`.
- Noi dung: Archive sach co SHA-256 `d0846af9bfe39d8e9b5fd08d21d7260798aa04cbb6491745e7b3788134b100b8`; image moi la `sha256:d3e3f7c758d8d83c95217f8f28e17d09f3b749d4fc6d1a7cccdc36809d6d46be`, container healthy la `e2c6c7c651ee9776453e8e343e1161d9e3e128fdb6f881e4e70393a42b84cf15`. Public entry tham chieu `ManagementApp-DZWoO5LZ.js`; bundle co guard session rong va van dung `ManagementApp-4vutcfcs.css`.
- Quyet dinh ky thuat: Chi deploy lai Chatmgt tu release sach; giu image premium truoc hotfix bang tag rollback `songhong-production-chatmgt:rollback-6627477-before-64d755b`. Khong thay auth bootstrap de tranh regression, chi ngan property access tren `null` trong pha loading.
- Database/API/cau hinh: Khong thay doi. Private Tinode bootstrap duoc bao toan mode `0600`; khong sua secret, domain, reverse proxy hay volume.
- Kiem thu: Local lint dat voi warning legacy, frontend test dat 10/10, build va SSR initial render dat. Image production dat 69 test voi 9 source-only skip; `verify_deployment.py` va `verify_tenant_isolation.py` deu dat. Public health, hotfix JavaScript va CSS premium deu dat; ID ChatUI, ChatAPI, hai PostgreSQL va Redis khong doi; log khong co `traceback/panic/fatal/critical`.
- Rui ro con lai: Runtime khong co browser session de chup anh; can `Ctrl + F5` tren tab Chatmgt de bo cache entry cu. Khong co rui ro da biet voi chuc nang.
- Viec tiep theo: Hard refresh `chatmgt.upgo.vn` va xac nhan loading chuyen sang trang dang nhap/quan tri thay vi man hinh trang.
- Commit/PR: Code `64d755b`; commit ghi nhan trien khai chua muc nay (xem `git log`).

## 2026-08-01-04 - Sua man hinh trang khi Chatmgt bootstrap

- Thoi gian: 2026-08-01 11:56 (Asia/Saigon)
- Loai: Sua loi | Giao dien
- Trang thai: Hoan tat
- Muc tieu: Khoi phuc render Chatmgt sau visual refresh ma khong thay doi chuc nang, API, SSO, database hay Tinode.
- Pham vi: Mot guard hien thi trong `src/features/management/ManagementApp.jsx` va changelog; khong sua state transition, handler, service request, role policy hay stylesheet premium.
- Noi dung: `session` khoi tao bang `null` trong luc bootstrap, nhung fallback avatar admin moi doc truc tiep `session.user` truoc khi nhanh loading duoc render, lam React nem loi va trang chi con nen trang. Doi fallback thanh optional access va profile rong chi trong pha chua co session.
- Quyet dinh ky thuat: Sua tai diem doc du lieu presentation thay vi thay doi thu tu auth bootstrap; khi session hop le, admin van duoc lay tu projection Account moi nhat hoac chinh `session.user` nhu cu.
- Database/API/cau hinh: Khong thay doi. Khong migration, dependency hay bien moi truong moi.
- Kiem thu: `npm run lint` dat voi warning legacy co san; frontend test dat 10/10; production build dat voi `ManagementApp-GaZazErR.js`; SSR initial render qua Vite dat marker `MANAGEMENT_INITIAL_RENDER_OK`; `git diff --check` dat.
- Rui ro con lai: Runtime khong co browser session de chup anh sau hotfix; can hard refresh sau deploy. Khong co rui ro da biet voi chuc nang vi thay doi chi ngan truy cap property cua gia tri `null` trong pha loading.
- Viec tiep theo: Commit/push, deploy rieng `chatmgt`, chay verifier va kiem tra public JavaScript hotfix.
- Commit/PR: Commit hotfix duoc tao trong cung lan lam viec nay (xem `git log`).

## 2026-08-01-03 - Trien khai visual refresh premium Chatmgt

- Thoi gian: 2026-08-01 11:51 (Asia/Saigon)
- Loai: Trien khai | Giao dien | Van hanh
- Trang thai: Hoan tat
- Muc tieu: Dua visual refresh va avatar Account cua commit `6627477` len `chatmgt.upgo.vn`, chi thay service Chatmgt va bao toan toan bo luong chuc nang dang chay.
- Pham vi: Release/image/container rieng `chatmgt` va public management bundle; khong recreate ChatUI, ChatAPI, hai PostgreSQL, Redis, khong migration va khong sua `.env` hay worktree server.
- File da thay doi: `docs/CHANGELOG.md`; source runtime trien khai tu release bat bien `/opt/deploy/chat/releases/6627477`.
- Noi dung: Archive sach co SHA-256 `9f216e8a53e57621cea6e50941a48d3001c48a33a11406776203647411492138`; image moi la `sha256:38ad1ea6a8e63b0457f52a62934736f8fef5811e72c489d1b185fb5cec6f6a26`, container healthy la `3f860d4735181a6f288a1464193dc96e8537e59064b997082acbd6f77b0a685e`. Public stylesheet la `ManagementApp-4vutcfcs.css` va co marker cua sidebar 300px, topbar premium va hero bo 30px.
- Quyet dinh ky thuat: Dung archive/release sach de khong lay cac thay doi cuc bo trong worktree server; private Tinode bootstrap duoc sao chep voi mode `0600`; image cu duoc giu bang tag rollback `songhong-production-chatmgt:rollback-4058086-before-6627477`. Lan acceptance dau rollback dung thiet ke vi marker CSS qua chat, trong khi hai verifier da dat; sau khi doi marker theo output Vite thuc te, deploy lai cung image va moi nghiem thu thanh cong.
- Database/API/cau hinh: Khong thay doi. Khong migration, khong sua secret, domain, reverse proxy, Account SSO, Tinode hay database volume.
- Kiem thu: Local lint dat voi warning legacy co san, frontend test dat 10/10 va build dat. Image production dat 69 test voi 9 source-only skip; `verify_deployment.py` va `verify_tenant_isolation.py` deu dat. Public health HTTP 200 va CSS premium dat; Compose label tro dung release `6627477`; log khong co `traceback/panic/fatal/critical`; ID ChatUI, ChatAPI, hai PostgreSQL va Redis khong doi.
- Rui ro con lai: Runtime khong co browser session nen chua chup anh QA sau deploy; nguoi dung can `Ctrl + F5` de bo cache va nghiem thu truc quan desktop/mobile. Khong co rui ro da biet voi chuc nang vi logic, API va database khong doi.
- Viec tiep theo: Hard refresh `chatmgt.upgo.vn`, dang nhap bang UpGO Account admin va xac nhan topbar noi, active nav cam, card/table premium va avatar dong bo.
- Commit/PR: Code `6627477`; commit ghi nhan trien khai chua muc nay (xem `git log`).

## 2026-08-01-02 - Visual refresh premium cho Chatmgt

- Thoi gian: 2026-08-01 11:42 (Asia/Saigon)
- Loai: Giao dien | Kha nang truy cap
- Trang thai: Hoan tat
- Muc tieu: Lam giao dien Chatmgt thay doi ro rang va chuyen nghiep hon tren desktop/mobile trong khi giu nguyen toan bo chuc nang dang hoat dong.
- Pham vi: Chi `src/features/management/management.css`; khong sua JSX logic, state, handler, endpoint, Account SSO, database, Tinode, ChatUI hay ChatAPI.
- Noi dung: Them visual layer theo huong enterprise command center: sidebar xanh sau co ambient glow va active state cam ro, topbar dang glass panel noi, nen grid/radial, hero va metric card co chieu sau, panel/table/audit/system card phan cap lai, hover/focus va responsive spacing duoc lam ro hon. Khong them nut, luong thao tac hay du lieu gia.
- Quyet dinh ky thuat: Dung CSS override co pham vi trong stylesheet rieng de tach presentation khoi nghiep vu; giu nguyen cac class va DOM dang co de khong lam thay doi event binding. Breakpoint mobile hien co duoc bao toan va chi dieu chinh margin topbar cho layout moi.
- Database/API/cau hinh: Khong thay doi. Khong migration, bien moi truong, dependency hay tai nguyen runtime moi.
- Kiem thu: `npm run lint` dat voi warning legacy co san ngoai pham vi; `npm run test:frontend` dat 10/10; `npm run build -- --outDir .codex-build-chatmgt-premium --emptyOutDir` dat voi stylesheet `ManagementApp-4vutcfcs.css`; `git diff --check` dat. Browser skill da duoc ap dung nhung runtime tra ve khong co browser session, nen chua co screenshot QA truc tiep.
- Rui ro con lai: Chua the xac nhan pixel tren trinh duyet production trong runtime hien tai; can hard refresh sau deploy va kiem tra lai desktop/mobile. Logic va hop dong du lieu khong doi.
- Viec tiep theo: Commit/push, build image release sach, recreate rieng `chatmgt` tren `.206`, chay verifier va kiem tra bundle public.
- Commit/PR: Commit visual refresh duoc tao trong cung lan lam viec nay (xem `git log`).

## 2026-08-01-01 - Hoan thien giao dien va dong bo avatar Chatmgt

- Thoi gian: 2026-08-01 11:29 (Asia/Saigon)
- Loai: Giao dien | Du lieu hien thi | Kha nang truy cap
- Trang thai: Hoan tat
- Muc tieu: Lam giao dien quan tri de doc va chuyen nghiep hon, dong thoi hien thi avatar nhan vien nhat quan voi ChatUI ma khong thay doi chuc nang, API, SSO, database hay Tinode.
- Pham vi: Chi component, stylesheet va bo chuan hoa response frontend cua Chatmgt; khong sua backend, handler thao tac, endpoint, session, Account role, conversation metadata, ChatUI hay ha tang production.
- File da thay doi: `src/features/management/ManagementApp.jsx`, `src/features/management/management.css`, `src/features/management/services/managementAdminService.js`, `src/features/management/services/managementAdminService.test.js` va `docs/CHANGELOG.md`.
- Noi dung: Them avatar component dung anh that va fallback initials khi anh loi; hien avatar o sidebar, danh ba, conversation, danh sach thanh vien, chu so huu va audit actor. Direct chat hien avatar nguoi doi dien, group hien cum toi da bon thanh vien. Chuan hoa cac ten truong `avatar`, `avatarUrl`, `avatar_url`, `photo`; tang kich thuoc chu phu quan trong va dung cac weight Inter 600/700 de font tieng Viet ro, on dinh hon.
- Quyet dinh ky thuat: Tiep tuc dung projection Account da duoc Chatmgt tra trong `_public_account()` lam nguon avatar, cung nguon ma ChatUI dang dung; khong tao kho anh, endpoint dong bo, database field hay Tinode profile flow moi. Avatar tu cap nhat theo chu ky refresh 30 giay san co cua trang quan tri va fallback cuc bo neu URL anh khong tai duoc.
- Database/API/cau hinh: Khong thay doi. Khong migration, khong bien moi truong moi va khong thay hop dong API; frontend chi chap nhan them cac alias avatar de tuong thich response.
- Kiem thu: `npm run lint` dat, chi con warning legacy co san trong `src/App.jsx` va `public/ChatBotWidget/tinode.js`; `npm run test:frontend` dat 10/10; `npm run build -- --outDir .codex-build-chatmgt-avatar --emptyOutDir` dat voi `ManagementApp-D_LXP_7m.js` va `ManagementApp-xgJCVpIv.css`; bundle co marker avatar image, cluster va member preview; `git diff --check` dat. Browser skill da duoc ap dung nhung runtime khong co browser session, nen chua nghiem thu truc quan bang Account admin that.
- Rui ro con lai: URL avatar bi chan boi CSP/CORS hoac khong con ton tai se hien initials thay the; can nghiem thu truc quan sau deploy tren desktop/mobile va hard refresh de loai cache CSS cu. Khong co rui ro da biet voi luong chuc nang vi state, handler va endpoint khong doi.
- Viec tiep theo: Commit/push ban thay doi, trien khai rieng service `chatmgt`, chay verifier production va hard refresh `chatmgt.upgo.vn` de nghiem thu avatar Account tren desktop/mobile.
- Commit/PR: Commit giao dien/avatar duoc tao trong cung lan lam viec nay (xem `git log`).

## 2026-07-31-13 - Trien khai font Inter cho Chatmgt

- Thoi gian: 2026-07-31 12:00 (Asia/Saigon)
- Loai: Trien khai | Sua loi | Giao dien
- Trang thai: Can xac nhan
- Muc tieu: Dua ban sua font tieng Viet cua commit `4058086` len production, chi thay stylesheet Chatmgt va giu nguyen toan bo giao dien/chuc nang con lai.
- Pham vi: Release/image/container rieng `chatmgt` va public CSS; khong recreate ChatUI, ChatAPI, hai PostgreSQL, Redis, khong migration va khong sua `.env` hay worktree server.
- File da thay doi: `docs/CHANGELOG.md`; source runtime trien khai tu release bat bien `/opt/deploy/chat/releases/4058086`.
- Noi dung: Archive sach co SHA-256 `498adbecdc295c594ae1d86fdaaca2ef92241d7b6fa863ebb7bc8a60f9e42f2c`; image moi la `sha256:c39f265796c010e8f0867e949b3e11755fe48162f82797ab039595e87ee24226`, container healthy la `368646cb95af7d95e254161cd1fddbef8db6b4f038def45f98423d803d79b8e9`. Public entry la `index-BUE-5UrA.js`, ManagementApp la `ManagementApp-C6q6Uml_.js` va stylesheet la `ManagementApp-B9TL3Tr_.css`.
- Quyet dinh ky thuat: Build/test image truoc khi recreate, giu image `3387b0c` lam rollback va chi thay Chatmgt sau khi full test dat. Public CSS duoc kiem tra truc tiep: body/display co `Inter, "Segoe UI", sans-serif`, khong con `Aptos` hoac `Bahnschrift`.
- Database/API/cau hinh: Khong thay doi. Runtime Tinode bootstrap duoc bao toan voi mode `0600`; archive tam da duoc xoa.
- Kiem thu: Image production dat 69 test voi 9 source-only skip; `verify_deployment.py` va `verify_tenant_isolation.py` deu dat. Public health HTTP 200, public font marker dat; Chatmgt healthy; log 10 phut co 0 `traceback/panic/fatal/critical`. ID ChatUI, ChatAPI, hai PostgreSQL va Redis khong doi.
- Rui ro con lai: Trinh duyet nguoi dung co the con cache CSS cu; can hard refresh de thay font moi. Khong co rui ro da biet voi logic, API, database hay realtime.
- Viec tiep theo: Hard refresh `chatmgt.upgo.vn` bang `Ctrl + F5` va xac nhan dau tieng Viet hien thi dong nhat.
- Commit/PR: Code `4058086`; commit ghi nhan trien khai chua muc nay (xem `git log`).

## 2026-07-31-12 - Sua font tieng Viet cua Chatmgt

- Thoi gian: 2026-07-31 11:56 (Asia/Saigon)
- Loai: Sua loi | Giao dien
- Trang thai: Can xac nhan
- Muc tieu: Khac phuc font fallback hien thi dau tieng Viet khong dong nhat tren giao dien operations console, dong thoi giu nguyen toan bo bo cuc, mau sac va chuc nang Chatmgt.
- Pham vi: Chi hai bien font body/display trong stylesheet rieng cua Chatmgt; khong sua JSX, state, handler, Account admin SSO, API, database, Tinode, ChatUI hay cau hinh production.
- File da thay doi: `src/features/management/management.css` va `docs/CHANGELOG.md`.
- Noi dung: Thay stack `IBM Plex Sans/Aptos/Trebuchet MS` va `Aptos Display/Bahnschrift/Trebuchet MS` bang `Inter` voi `Segoe UI` fallback. `Inter` da duoc tai san trong `index.html` voi weight 300-700 va ho tro glyph tieng Viet, nen khong them dependency hoac request font moi.
- Quyet dinh ky thuat: Khong thay font-size, font-weight, line-height, letter-spacing, spacing, breakpoint hay component style; chi thay family de tranh phat sinh regression bo cuc.
- Database/API/cau hinh: Khong thay doi.
- Kiem thu: `npm run lint` dat, chi con warning legacy co san ngoai pham vi; `npm run test:frontend` dat 10/10; `npm run build -- --outDir .codex-build-chatmgt-font --emptyOutDir` dat voi stylesheet `ManagementApp-B9TL3Tr_.css`; `git diff --check` dat. Build tam da duoc xoa sau khi kiem tra.
- Rui ro con lai: Can hard refresh tren trinh duyet that de xac nhan cache stylesheet cu da het; khong co rui ro da biet voi chuc nang vi logic khong thay doi.
- Viec tiep theo: Hard refresh de nghiem thu; ket qua trien khai tu dong duoc ghi tai muc `2026-07-31-13`.
- Commit/PR: `4058086`.

## 2026-07-31-11 - Trien khai giao dien operations console Chatmgt

- Thoi gian: 2026-07-31 11:50 (Asia/Saigon)
- Loai: Trien khai | Giao dien | Van hanh
- Trang thai: Can xac nhan
- Muc tieu: Dua giao dien Chatmgt chuyen nghiep cua commit `3387b0c` len production `.206`, chi thay service `chatmgt` va bao toan toan bo chuc nang/API dang hoat dong.
- Pham vi: Release/image/container rieng Chatmgt va public asset `chatmgt.upgo.vn`; khong recreate ChatUI, ChatAPI, hai PostgreSQL, Redis, khong migration va khong sua `.env` production hay worktree server dang co thay doi cuc bo.
- File da thay doi: `docs/CHANGELOG.md`; source runtime trien khai tu commit `3387b0c` trong release bat bien `/opt/deploy/chat/releases/3387b0c`.
- Noi dung: Archive sach co SHA-256 `702136585ca9f9a0b7be1144e03b0e155453f60da7c2342e1d58897bf1444b94`; image moi la `sha256:74eb589b22b3684b87698a4e805e7bf9b7290375a6d0fae9667310fa174a0cee`, container healthy la `5ab17fc3446f23dccffe9a5a7246d5b9329e076a8c9c1fe2ef4df7d23a29cd4b`. Public entry la `index-B82_WaDG.js`, ManagementApp la `ManagementApp-Bzuvg9hB.js` va stylesheet la `ManagementApp-Bsom-K14.css`; bundle cong khai co marker cua operations console moi.
- Quyet dinh ky thuat: Build va chay test trong image truoc khi recreate; tag image cu lam rollback va dung release bat bien thay vi pull/reset worktree server. Hai lan acceptance dau tu rollback an toan do script shell doc tiep stdin va `pipefail` nhan ma `SIGPIPE` khi tach ten asset; verifier ung dung deu dat, nen lan cuoi tach public asset check sang PowerShell va khong thay doi code/image.
- Database/API/cau hinh: Khong thay doi. Runtime Tinode bootstrap duoc sao chep vao release moi voi mode `0600`; archive tam da duoc xoa sau deploy. Image rollback truoc deploy giu nguyen SHA `f5607fbf24568b7b62081810758da77d94a6739c3fdcc63f024dc0bde9368225`.
- Kiem thu: Local lint dat voi warning legacy co san, frontend test dat 10/10 va build dat. Image production dat 69 test voi 9 source-only skip. `verify_deployment.py` dat database/credential policy, health/CORS, Account admin SSO, Tinode bridge, employee/local-password rejection, management scope va conversation overview; `verify_tenant_isolation.py` dat. Public health HTTP 200; public JS/CSS co marker giao dien moi; Chatmgt healthy; log 10 phut co 0 `traceback/panic/fatal/critical`. ID ChatUI, ChatAPI, hai PostgreSQL va Redis khong doi.
- Rui ro con lai: Moi truong Codex khong co browser/phien Account admin de nghiem thu truc quan, nen can hard refresh va xem bo cuc bang trinh duyet that tren desktop/mobile. Khong co rui ro da biet voi backend, API, database hay realtime vi cac phan nay khong doi.
- Viec tiep theo: Hard refresh `chatmgt.upgo.vn`, dang nhap bang UpGO Account admin va xac nhan sidebar, dashboard, danh ba, conversation, audit, system va drawer mobile hien thi dung.
- Commit/PR: Code `3387b0c`; commit ghi nhan trien khai chua muc nay (xem `git log`).

## 2026-07-31-10 - Nang cap giao dien dieu hanh Chatmgt

- Thoi gian: 2026-07-31 11:37 (Asia/Saigon)
- Loai: Giao dien | Trai nghiem quan tri | Kha nang truy cap
- Trang thai: Can xac nhan
- Muc tieu: Lam moi frontend `chatmgt.upgo.vn` theo phong cach operations console chuyen nghiep, ro cap bac thong tin va de theo doi tren desktop/mobile ma khong anh huong den chuc nang, API hay luong xac thuc dang hoat dong.
- Pham vi: Chi `ManagementApp` va stylesheet rieng cua Chatmgt; giu nguyen service request, Account admin SSO, role check, session management, bo loc, refresh 30 giay, thu hoi phien, ChatUI va Tinode. Khong migration, khong doi backend, database, Compose hay bien moi truong.
- File da thay doi: `src/features/management/ManagementApp.jsx`, `src/features/management/management.css`, va `docs/CHANGELOG.md`.
- Noi dung: Chuyen sidebar thanh control rail co cap bac va active state ro hon; bo sung breadcrumb tenant, health capsule lay tu health response that va context trang thai trong hero. Chuan hoa typography, mau thuong hieu xanh/cam, background grid, shadow, focus state, metric/panel/table/system card, login gateway va responsive layout. Bang co sticky header, cac thanh phan co focus-visible, motion duoc tat khi he dieu hanh yeu cau `prefers-reduced-motion`; khong them dashboard gia hay doc noi dung tin nhan.
- Quyet dinh ky thuat: Chi them wrapper/class trinh bay va su dung cac gia tri `health`, `session`, `stats` da co; khong sua state, handler, endpoint hoac hop dong du lieu. Font dung stack local co fallback, khong them dependency hay tai font runtime moi de tranh anh huong toc do va kha nang trien khai.
- Database/API/cau hinh: Khong thay doi.
- Kiem thu: `npm run lint` dat, chi con warning legacy co san trong `src/App.jsx` va Tinode widget ngoai pham vi; `npm run test:frontend` dat 10/10; `npm run build -- --outDir .codex-build-chatmgt-ui --emptyOutDir` dat voi bundle `ManagementApp-bCtzlVA2.js` va stylesheet `ManagementApp-Bsom-K14.css`. Browser skill da duoc ap dung nhung moi truong khong cung cap browser session, nen chua thao tac truc quan bang phien Account admin that.
- Rui ro con lai: Can nghiem thu truc quan tren desktop/mobile sau deploy, dac biet ten tenant dai, bang co nhieu ban ghi va drawer mobile; khong co rui ro da biet voi API/chuc nang vi logic nghiep vu khong doi.
- Viec tiep theo: Hard refresh `chatmgt.upgo.vn` va xac nhan bo cuc bang tai khoan Account admin; ket qua trien khai tu dong duoc ghi tai muc `2026-07-31-11`.
- Commit/PR: `3387b0c`.

## 2026-07-31-09 - Trien khai Account admin SSO cho Chatmgt

- Thoi gian: 2026-07-31 11:09 (Asia/Saigon)
- Loai: Trien khai | Bao mat | Tich hop | Du lieu
- Trang thai: Can xac nhan
- Muc tieu: Dua luong quan tri bang UpGO Account len production, de Nguyen Huu Nham va cac Account admin cua tenant dang nhap `chatmgt.upgo.vn`, dong thoi loai quyen dang nhap cua admin local Mai Thanh Lam ma van co rollback.
- Pham vi: Release/image/container cua rieng `chatmgt`, management SSO endpoint/UI, policy management session, mot ban ghi admin local va bo verifier production. Khong recreate ChatUI, ChatAPI, hai PostgreSQL, Redis; khong migration, khong sua `.env`, Tinode credential, message/topic hay volume.
- File da thay doi: `docs/CHANGELOG.md`; source runtime trien khai tu commit `383ed41` trong release bat bien `/opt/deploy/chat/releases/383ed41`.
- Noi dung: Archive commit co SHA-256 `4b85a2e0b303f263ebedbfd117d3dc851264869d4dc52f907e92c04fbfd2cba4`; image Chatmgt production la `sha256:f5607fbf24568b7b62081810758da77d94a6739c3fdcc63f024dc0bde9368225`, public bundle la `ManagementApp-C0wPz7l3.js`. `POST /api/v1/admin/sso` khong cookie tra `ACCOUNT_LOGIN_REQUIRED`, thieu management header tra `FORBIDDEN`, va local `/login` tra `AUTH_METHOD_DISABLED`. Projection `nguyenhuunham27052005@gmail.com` duoc xac nhan active, role admin, `auth_source=account`, ten hien thi Nguyen Huu Nham. Admin local `admin` tenant `song-hong` duoc dat `active=false`, tang `auth_version` va ghi ly do/ma release; khong xoa cung va khong doi password.
- Quyet dinh ky thuat: Build/test image truoc khi recreate; chi vo hieu hoa admin local sau khi image moi healthy, public asset dat va Account admin projection san sang. Moi pha du lieu dung trap rollback de bat lai admin local va tag/recreate image cu neu verifier loi. Lan deploy dau phat hien verifier truc tiep thieu Python project path; rollback da hoat dong, sau do commit `383ed41` sua entrypoint, build/test lai va moi trien khai lan cuoi.
- Database/API/cau hinh: Khong migration. Tao backup PostgreSQL truoc thay doi tai `/opt/deploy/chat/backups/chatservice-before-admin-sso-20260731T035738Z.dump`, SHA-256 `fec15a4bf1d2e1b926b0709c46f9b2499aeb8e0e74a33e2bcdabf4f372310fcc`, mode `0600`. Rollback image la `songhong-production-chatmgt:rollback-d85b2f1ccc1a50ce3a931b83f5ac51bd824a8b25839`. Production dung default `CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED=true`; khong ghi secret vao Git/nhat ky.
- Kiem thu: Image Python 3.9 dat 69 test voi 9 source-only skip; `python scripts/verify_deployment.py --help` dat trong image. Verifier production xac nhan Alembic/credential policy, health/CORS, Account SSO challenges, Tinode bridge config, employee/local password rejection, scope isolation hai chieu va conversation overview; `verify_tenant_isolation.py` dat. Nginx syntax dat; public health va bundle marker `/api/v1/admin/sso`/`vichat_admin_sso` dat; Chatmgt healthy; log toan bo container co 0 `traceback/panic/fatal/critical`. ID ChatUI, ChatAPI, hai PostgreSQL va Redis khong doi.
- Rui ro con lai: Moi truong Codex khong co browser/phien UpGO Account production, nen chua bam callback bang cookie that cua Nguyen Huu Nham va chua thu mot Account member that bi `ACCOUNT_ADMIN_REQUIRED`. Backend, API, database, public asset va policy tu dong deu da dat.
- Viec tiep theo: Nguyen Huu Nham dang nhap `account.upgo.vn`, chon dung tenant, hard refresh `chatmgt.upgo.vn` va bam **Dang nhap bang UpGO Account**. Sau do thu mot member thuong de xac nhan bi tu choi; neu hai buoc dat thi chuyen muc nay sang `Hoan tat` ma khong can doi code.
- Commit/PR: Code `04ef13d`, `fcee724`, `383ed41`; commit ghi nhan trien khai chua muc nay (xem `git log`).

## 2026-07-31-08 - Chuyen quan tri Chatmgt sang Account admin SSO

- Thoi gian: 2026-07-31 10:32 (Asia/Saigon)
- Loai: Tinh nang | Bao mat | Tich hop | Giao dien | Van hanh
- Trang thai: Hoan tat
- Muc tieu: Cho phep chi Account user co vai tro admin/owner/superadmin cua tenant hien tai dang nhap `chatmgt.upgo.vn`; tat dang nhap mat khau admin local va thay admin Mai Thanh Lam bang Nguyen Huu Nham tu UpGO Account.
- Pham vi: Management authentication/session scope, Account SSO role enforcement, ManagementApp login/logout, verifier, production config, tai lieu va du lieu admin local sau deploy. Khong doi ChatUI message, Tinode topic/message, database schema hay Account credential.
- File da thay doi: `README.md`, `chatservice-main/README.md`, `chatservice-main/application/config/config.py`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/services/auth_service.py`, `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/tests/test_auth_session_scope.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `chatservice-main/tests/test_verify_deployment.py`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `infrastructure/production/.env.example`, `infrastructure/production/README.md`, `infrastructure/production/compose.yaml`, `src/features/management/ManagementApp.jsx`, `src/features/management/management.css`, `src/features/management/services/managementAdminService.js`, va `src/features/management/services/managementAdminService.test.js`.
- Noi dung: Them `POST /api/v1/admin/sso` de doi Account session hop le thanh cookie management rieng, chi chap nhan role Account duoc chuan hoa thanh admin. Production local `/login` tra `AUTH_METHOD_DISABLED`. ManagementApp bo form username/password va doi mat khau local, dung nut dang nhap UpGO Account co callback mot lan, hien profile Account va logout ca hai phien. JWT them scope `chat`/`management`; cac API mutation quan tri, audit va conversation overview bat buoc management header, nen ChatUI token khong the duoc dung cho control plane. Verifier dung token management noi bo cua tai khoan tam, kiem tra ca hai chieu scope va tu bootstrap Python project path de lenh chay file truc tiep trong README van hoat dong; policy production khong cho phep con active local admin khi Account-admin SSO bat.
- Quyet dinh ky thuat: Khong doi ten, khong gan mat khau va khong tao credential Chatmgt cho Nguyen Huu Nham. UpGO Account tiep tuc la nguon chuan cua ten, mat khau, tenant va role; Chatmgt chi luu projection `auth_source=account` va phat session management co scope rieng. Admin local Mai Thanh Lam se bi vo hieu hoa co the khoi phuc sau khi image moi healthy va projection Nguyen Huu Nham duoc xac nhan active/admin; khong xoa cung de giu audit va rollback.
- Database/API/cau hinh: Khong migration. Them `POST /api/v1/admin/sso`, claim JWT `scp`, va bien `CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED` (production mac dinh `true`). Khong sua Account password/cookie schema, Tinode credential, ChatAPI, database volume hay ChatUI realtime. Du lieu production chua thay doi trong muc code nay.
- Kiem thu: `python -m py_compile ...` dat. `python -m unittest discover -s chatservice-main/tests -v` dat 69 test, 28 test runtime skip do dependency chi co trong image. `npm run lint` dat voi warning legacy co san; `npm run test:frontend` dat 10/10. `npm run build -- --outDir .codex-build-admin-sso --emptyOutDir` dat voi bundle `ManagementApp-UWY42mN_.js`. `docker compose --env-file infrastructure/production/.env.example -f infrastructure/production/compose.yaml config --quiet` va `git diff --check` dat. Image `383ed41` dat 69 test voi 9 source-only skip va lenh verifier file truc tiep `--help`; ket qua production chi tiet o muc `2026-07-31-09`.
- Rui ro con lai: Khong co da biet trong code/API. Nghiem thu cookie Account that va member that duoc theo doi trong muc trien khai `2026-07-31-09`.
- Viec tiep theo: Khong co thay doi code; hoan tat nghiem thu browser theo muc `2026-07-31-09`.
- Commit/PR: `04ef13d`, `fcee724`, `383ed41`.

## 2026-07-31-07 - Trien khai logout profile va avatar Account

- Thoi gian: 2026-07-31 10:13 (Asia/Saigon)
- Loai: Trien khai | Sua loi | Tich hop
- Trang thai: Can xac nhan
- Muc tieu: Dua ban sua logout/avatar `bc89b97` len production ma khong thay doi ChatAPI, PostgreSQL, Redis, volume hoac worktree dang van hanh tren server.
- Pham vi: Build va recreate rieng `chatmgt` va `chat` tu release bat bien `/opt/deploy/chat/releases/bc89b97`; kiem tra image, API, CORS, public bundle, tenant isolation va container boundary. Khong migration, khong sua `.env`, khong reload cau hinh Nginx va khong tao avatar thu tren Account that.
- File da thay doi: `docs/CHANGELOG.md`; source runtime duoc trien khai tu commit `bc89b97`.
- Noi dung: Archive commit co SHA-256 `e835e66833ec3e3ba24b810d2d939723524152abd963d10b56ed796e2f07f522`; image Chatmgt va ChatUI duoc build tu archive sach. Lan chay dau dung an toan truoc khi recreate vi Docker khong con resolve image digest cu de gan tag rollback; sau khi xac nhan cac container cu van healthy, trien khai tiep bang release cu lam diem rollback. Chatmgt duoc recreate va qua verifier truoc khi recreate ChatUI.
- Quyet dinh ky thuat: Giu cac Account avatar URL/path theo production default trong Compose, khong ghi them vao `.env`. Nghiem thu bundle truc tiep vi moi truong Codex khong co browser/phien Account dang nhap; `/me` khong cookie tra `523` voi loi profile cua upstream nhung DNS/HTTPS reachable, con media endpoint tra `405 Allow: POST`, dung hop dong anonymous check.
- Database/API/cau hinh: Khong migration, khong thay secret hay cookie. `POST /api/v1/auth/avatar` public khong co phien tra `401`; preflight tu `https://chat.upgo.vn` co allow-origin va allow-credentials. ChatUI public phuc vu `/assets/App-DqfInuzH.js` chua endpoint avatar va `workspace-logout-button`, khong con `btn-logout-footer`.
- Kiem thu: Full suite trong image Python 3.9 dat 63 test voi 9 source-only skip; `nginx -t` trong image va tren host dat; `verify_deployment.py` dat; `verify_tenant_isolation.py` dat; local/public ChatUI health va public Chatmgt health deu HTTP 200; route avatar unauthenticated HTTP 401; CORS dat; hai service moi healthy; log 10 phut co 0 `traceback/panic/fatal/critical`.
- Rui ro con lai: Chua upload avatar bang cookie cua mot Account production that, nen can nguoi dung nghiem thu thao tac camera, refresh trang va xac nhan anh moi hien tren Account/Chat/Tinode. Neu media upload thanh cong nhung Account PUT that bai, file upload co the khong duoc tham chieu do upstream khong co API rollback.
- Viec tiep theo: Nguoi dung hard refresh `chat.upgo.vn`, mo Ho so ca nhan, doi mot anh nho hon 10 MB va xac nhan sau refresh; neu that bai, gui error code cua request `/api/v1/auth/avatar` de doi chieu log.
- Commit/PR: Code `bc89b97`; commit ghi nhan trien khai chua muc nay (xem `git log`).

## 2026-07-31-06 - Sua dieu khien dang xuat va avatar Account

- Thoi gian: 2026-07-31 09:56 (Asia/Saigon)
- Loai: Sua loi | Giao dien | Bao mat | Tich hop
- Trang thai: Can xac nhan
- Muc tieu: Chi hien thao tac dang xuat trong Ho so ca nhan va cho phep nhan vien Account SSO doi anh dai dien ma van giu UpGO Account la nguon du lieu chuan.
- Pham vi: ChatUI profile/sidebar; Chatmgt Account SSO bridge; dong bo projection/Tinode; cau hinh production, test va tai lieu. Khong doi message/topic, database schema, admin Chatmgt hay cac truong ho so nhan su khac.
- File da thay doi: `README.md`, `src/app/App.jsx`, `src/styles/index.css`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/tinodeClient.js`, `chatservice-main/application/config/config.py`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/services/account_sso_service.py`, `chatservice-main/tests/test_account_sso_service.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `chatservice-main/README.md`, `docs/chat-backend-architecture.md`, `infrastructure/production/.env.example`, `infrastructure/production/compose.yaml`, `infrastructure/production/README.md`, va `docs/CHANGELOG.md`.
- Noi dung: Xoa nut logout doc lap o footer sidebar, giu nut `Dang xuat` trong panel Ho so ca nhan. Nut camera truoc day bi disable boi `accountProfileReadOnly`, trong khi endpoint profile Chatmgt cung tu choi projection Account 403; ban sua them endpoint multipart `POST /api/v1/auth/avatar`. Chatmgt xac minh JWT, Account cookie, user va tenant hien tai; lay self profile `/me`, upload anh theo hop dong UpGO media, PUT dung Account user, doc lai `/current_user`, cap nhat projection, sau do ChatUI dong bo URL Account sang Tinode public profile va cac state dang hien thi.
- Quyet dinh ky thuat: Khong bat lai luong `PUT /api/v1/auth/profile` cho Account va khong luu preview/data URL lam nguon chuan. Avatar la write-through duy nhat: browser khong gui target user ID; backend suy ra user/tenant tu hai phien da xac minh, loc payload theo schema profile cong khai va khong forward password/token/secret. Cac truong ten, email, vai tro, chuc vu va phong ban van chi doc trong ChatUI.
- Database/API/cau hinh: Khong migration. Them `POST /api/v1/auth/avatar`; them cac bien co production default `ACCOUNT_SSO_SELF_PROFILE_PATH`, `ACCOUNT_SSO_USER_UPDATE_PATH`, `ACCOUNT_AVATAR_UPLOAD_URL`. `.env` that khong bi sua va khong can them bien neu UpGO giu hop dong hien tai. Upload toi da 10 MB va chi nhan MIME `image/*`.
- Kiem thu: Da doc ma frontend dang chay cua `account.upgo.vn` de xac nhan `/me`, media upload va `PUT /api/v1/user/<id>`; OPTIONS xac nhan origin `https://chat.upgo.vn` duoc cho phep. `python -m py_compile ...` dat; test muc tieu dat 34/34 voi `aiohttp 3.10.11` tam; full backend local dat 63 test voi 12 runtime skip; `npm run lint` dat voi warning co san ngoai pham vi; `npm run test:frontend` dat 9/9; `npm run build -- --outDir .codex-build-avatar --emptyOutDir` dat voi `App-CZEci0lr.js`; Compose config dat khi cung cap secret kiem tra chi trong process; `git diff --check` dat. Browser skill khong co browser kha dung nen chua thao tac phien Account that.
- Rui ro con lai: Chua build/test trong image Python 3.9 production va chua ghi avatar bang Account user that. Neu media upload thanh cong nhung Account PUT that bai, file upload co the tro thanh file khong duoc tham chieu vi upstream khong cung cap API rollback.
- Viec tiep theo: Commit/push, deploy bat bien ca `chat` va `chatmgt` ma khong restart ChatAPI/database/Redis, sau do nghiem thu avatar bang phien Account production va hard refresh.
- Commit/PR: `bc89b97`.

## 2026-07-31-05 - Trien khai verifier Chatmgt doc lap credential

- Thoi gian: 2026-07-31 09:24 (Asia/Saigon)
- Loai: Van hanh | Bao mat
- Trang thai: Hoan tat
- Muc tieu: Dua ban lam cung verifier `5a647fa` len production, xac nhan viec nghiem thu Chatmgt khong phu thuoc mat khau admin that/Tinode root va khong de lai tai khoan kiem tra tam.
- Pham vi: Image, container va verifier production cua rieng `chatmgt`; khong thay ChatUI, ChatAPI, PostgreSQL, Redis hay worktree server.
- File da thay doi: `docs/CHANGELOG.md`; source runtime duoc trien khai tu commit `5a647fa`.
- Noi dung: Archive co SHA-256 `4a384cb08ad5daca9a8730e60875122961f003b9f23fd51c95cbeb5199b6d94a` duoc giai nen thanh release bat bien `/opt/deploy/chat/releases/5a647fa`. Image Chatmgt moi duoc build va recreate rieng; verifier chay hai lan bang admin cuc bo tam, moi lan tu cleanup tai khoan va audit event trong `finally`; truy van doc lap sau cung xac nhan so ban ghi `deployment_verifier` bang 0.
- Quyet dinh ky thuat: Tiep tuc trien khai bang release directory bat bien, giu `.env` production va runtime Tinode bootstrap ben ngoai Git, gan image cu tag rollback `songhong-production-chatmgt:rollback-8cc92ac`, va so sanh container ID truoc/sau de ngan thay doi lan sang dich vu khac.
- Database/API/cau hinh: Khong migration, khong doi API, khong sua `.env`, khong xoa volume va khong reload Nginx. Verifier chi INSERT/DELETE mot local admin tam trong transaction van hanh; database sau hai lan verifier khong con ban ghi danh dau kiem tra.
- Kiem thu: `bash -n /tmp/vichat-deploy-5a647fa.sh` dat; build image dat voi bundle `ManagementApp-repbL3ZI.js`; full suite trong image dat 60 test voi 8 test source-only skip; `verify_deployment.py` chay hai lan deu dat; `verify_tenant_isolation.py` dat; cleanup verifier bang 0; `nginx -t` dat; public health va bundle deu HTTP 200; Chatmgt healthy, Compose label tro dung release `5a647fa`, log 10 phut co 0 `traceback/panic/fatal/exception/critical`; ID ChatUI, ChatAPI, hai PostgreSQL va Redis khong doi.
- Rui ro con lai: Moi truong Codex khong co phien admin production trong Browser de thao tac truc quan; phan nghiem thu tu dong, API, database, tenant va public asset trong pham vi ban lam cung deu da dat.
- Viec tiep theo: Hard refresh `chatmgt.upgo.vn` va kiem tra dang nhap admin/bo cuc neu can nghiem thu giao dien bang nguoi dung cuoi; khong can doi lai mat khau admin de chay verifier.
- Commit/PR: Code `5a647fa`; commit ghi nhan trien khai chua muc nay (xem `git log`).

## 2026-07-31-04 - Tach verifier khoi mat khau admin Tinode

- Thoi gian: 2026-07-31 09:09 (Asia/Saigon)
- Loai: Sua loi | Bao mat | Van hanh
- Trang thai: Can xac nhan
- Muc tieu: Bao dam admin co the doi mat khau rieng cua Chatmgt ma verifier va lan trien khai sau khong phu thuoc vao `TINODE_ADMIN_PASSWORD`; dong thoi khong de admin cuc bo/xac minh tam xuat hien trong danh ba nhan vien.
- Pham vi: Verifier production, bo loc projection Account cua directory API, test hop dong va tai lieu van hanh; khong doi ChatUI/Tinode message flow.
- File da thay doi: `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `chatservice-main/README.md`, `infrastructure/production/README.md`, va `docs/CHANGELOG.md`.
- Noi dung: Verifier tao mot admin Chatmgt cuc bo ten ngau nhien voi mat khau manh chi trong thoi gian kiem tra login/logout, sau do xoa tai khoan va audit event trong `finally`; khong doc, doi hay can biet mat khau admin that/Tinode root. Directory cua phien Account SSO chi tra ban ghi `auth_source=account`, nen admin cuc bo va verifier account khong the lo vao danh ba ChatUI.
- Quyet dinh ky thuat: Dung tai khoan verifier tam thay vi dong bo plaintext credential giua database va `.env`. Ban ghi tam duoc danh dau `properties.deployment_verifier=true`, loc dung tenant, ten/ID ngau nhien va cleanup co dieu kien de khong xoa nham du lieu that.
- Database/API/cau hinh: Khong migration, khong them bien moi truong va khong doi hop dong response. Verifier tam thoi INSERT/DELETE mot local admin va audit event trong database hien tai; cleanup chay ca khi kiem tra loi.
- Kiem thu: `python -m unittest chatservice-main.tests.test_chat_auth_contract -v` dat 22/22; `python -m unittest discover -s chatservice-main/tests -v` dat 60 test voi 22 test runtime skip local; `python -m py_compile ...` va `git diff --check` dat.
- Rui ro con lai: Chua chay SQL tao/xoa verifier account trong image production va chua xac nhan database khong con ban ghi `deployment_verifier` sau khi verifier ket thuc.
- Viec tiep theo: Commit/push, build/recreate rieng Chatmgt, chay full suite va verifier hai lan neu can, sau do kiem tra so ban ghi verifier bang 0 va cac service khac khong bi recreate.
- Commit/PR: Chua tao.

## 2026-07-31-03 - Trien khai trung tam quan tri Chatmgt

- Thoi gian: 2026-07-31 08:34 (Asia/Saigon)
- Loai: Van hanh | Bao mat | Giao dien
- Trang thai: Can xac nhan
- Muc tieu: Dua ban chuan hoa web Chatmgt cua commit `8cc92ac` len `chatmgt.upgo.vn` bang release bat bien, chi thay service Chatmgt va bao toan ChatUI/Tinode/database/worktree server.
- Pham vi: Image, container va public bundle cua `chatmgt`; full runtime test, verifier, tenant isolation, Nginx va public health/asset.
- File da thay doi: `docs/CHANGELOG.md`.
- Noi dung: Archive commit `8cc92ac` duoc kiem SHA-256 va giai nen tai `/opt/deploy/chat/releases/8cc92ac`; runtime Tinode bootstrap duoc sao chep voi mode `0600`, image cu duoc gan tag rollback `songhong-production-chatmgt:rollback-7cda29e`. Build va recreate rieng `chatmgt`; bundle public moi la `ManagementApp-repbL3ZI.js`. Worktree server van o `1b3de22` va giu nguyen cac thay doi cuc bo co san.
- Quyet dinh ky thuat: Tiep tuc dung release directory bat bien thay vi pull/reset worktree production. Compose active cua Chatmgt tro den release `8cc92ac`; ID container ChatUI, ChatAPI, hai PostgreSQL va Redis duoc so sanh truoc/sau va khong doi.
- Database/API/cau hinh: Khong migration, khong sua `.env`, khong xoa volume va khong reload Nginx. Health public xac nhan Account SSO, danh ba, Tinode bridge va management session secure/isolated deu configured; admin conversation endpoint khong co session tra HTTP 401.
- Kiem thu: Build production dat voi `ManagementApp-repbL3ZI.js`; full suite trong image dat 59 test voi 8 test source-only skip; `verify_deployment.py` dat database/credential/CORS/Account SSO/Tinode bridge/management isolation/read-only conversation overview; `verify_tenant_isolation.py` dat. `nginx -t`, container health, public health, public bundle HTTP 200, active Compose label va log 5 phut khong co traceback/panic/fatal/exception/critical deu dat.
- Rui ro con lai: Moi truong Codex khong khoi tao duoc Browser runtime va khong co thao tac UI bang phien admin production, nen can dang nhap truc quan de xac nhan bo cuc desktop/mobile, cac tab danh ba/conversation/system va hop thoai doi mat khau. Khong thay doi mat khau trong buoc acceptance neu chua co ke hoach cap nhat quy trinh verifier van hanh.
- Viec tiep theo: Hard refresh `chatmgt.upgo.vn`, dang nhap admin va kiem tra cac man hinh moi; xac nhan khong con nut tao/sua/khoa/reset mat khau nhan vien, conversation chi hien metadata va link Account mo dung trang.
- Commit/PR: Code `8cc92ac`; commit ghi nhan trien khai chua muc nay (xem `git log`).

## 2026-07-31-02 - Chuan hoa trung tam quan tri Chatmgt

- Thoi gian: 2026-07-31 08:25 (Asia/Saigon)
- Loai: Tinh nang | Tai cau truc | Bao mat | Giao dien
- Trang thai: Can xac nhan
- Muc tieu: Dua web Chatmgt ve dung vai tro quan tri metadata va cau noi chat: danh ba Account chi doc, thu hoi phien Chatmgt, theo doi conversation/nhom va trang thai Account SSO - Tinode; loai bo cac thao tac tao/sua/khoa/reset mat khau nhan vien khong thuoc Chatmgt.
- Pham vi: Rieng giao dien quan tri Chatmgt, API quan tri tenant-scoped va kiem thu hop dong; khong thay doi ChatUI, noi dung tin nhan Tinode, file, presence, typing hay receipt.
- File da thay doi: `README.md`, `package.json`, `src/features/management/ManagementApp.jsx`, `src/features/management/management.css`, `src/features/management/services/managementAdminService.js`, `src/features/management/services/managementAdminService.test.js`, `chatservice-main/README.md`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `docs/chat-backend-architecture.md`, `infrastructure/production/README.md`, va `docs/CHANGELOG.md`.
- Noi dung: Web Chatmgt bo hoan toan luong tao/sua/khoa/reset mat khau nhan vien von bi Account SSO tu choi; danh ba chi hien projection Account va chi cho thu hoi phien Chatmgt. Them man hinh conversation/nhom tenant-scoped voi subject, thanh vien, owner va readiness Tinode nhung khong co message/file content; tong quan va trang thai he thong trinh bay ro luong Account -> Chatmgt -> Tinode. Them doi mat khau rieng cho admin Chatmgt va tu dong thu hoi phien cu. Verifier production kiem secure/isolated management cookie va overview conversation chi doc.
- Quyet dinh ky thuat: Account tiep tuc la nguon chuan cua nhan vien; Chatmgt chi hien projection va metadata, khong cung cap thao tac thay doi credential/ho so nhan vien. Endpoint admin conversation dung truy van loc tenant va tra metadata tong hop, khong tai lich su Tinode. Doi mat khau trong management scope chi cap nhat credential Chatmgt, khong goi Tinode va khong thay doi credential Account/Tinode root.
- Database/API/cau hinh: Khong migration va khong them bien moi truong. Them API chi doc `GET /api/v1/admin/conversations`; health them `management_session`; response account them `authSource/accountManaged` an toan de giao dien phan biet projection Account voi admin cuc bo. Hop dong cu cua ChatUI khong bi thay doi.
- Kiem thu: `npm run lint` dat, chi con warning co san trong frontend cu/Tinode vendor; `npm run test:frontend` dat 9/9; `python -m unittest chatservice-main.tests.test_chat_auth_contract -v` dat 21/21; `python -m unittest discover -s chatservice-main/tests -v` dat 59 test voi 22 test runtime skip local; `python -m py_compile ...` dat cho controller, verifier va test; `npm run build -- --outDir .codex-build-check-final` dat voi `ManagementApp-BiFVEf7E.js`; `git diff --check` dat. Da thu dung Browser skill de nghiem thu giao dien nhung runtime trinh duyet cua moi truong khong khoi tao duoc, nen chua thao tac UI co phien admin that.
- Rui ro con lai: Chua build/deploy image Chatmgt moi va chua dang nhap production de nghiem thu truc quan cac man hinh danh ba/conversation/system. Full test co dependency runtime va verifier moi can chay trong image production sau deploy.
- Viec tiep theo: Commit/push, tao release bat bien tren server `.206`, build/recreate rieng `chatmgt`, chay full suite/verifier va kiem tra public bundle/health; khong restart ChatUI, ChatAPI, database hay Redis.
- Commit/PR: Chua tao.

## 2026-07-31-01 - Sua dinh danh direct va presence realtime

- Thoi gian: 2026-07-31 00:18 (Asia/Saigon)
- Loai: Sua loi | Realtime | Giao dien
- Trang thai: Can xac nhan
- Muc tieu: Bao dam moi phia cua chat 1-1 luon thay dung ten/avatar cua nguoi con lai, khong hien tai khoan hien tai nhu mot contact cua chinh minh, va cap nhat Online/Offline ngay theo Tinode.
- Pham vi: Chieu conversation Chatmgt vao ChatUI theo viewer, panel thong tin ca nhan, danh sach conversation, Tinode `me` topic presence callback, test hoi quy va tai lieu Step 3/4.
- File da thay doi: `src/app/App.jsx`, `src/features/contacts/services/accountDirectory.js`, `src/features/contacts/services/accountDirectory.test.js`, `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/chatRealtime.test.js`, `src/features/chat/services/tinodeClient.js`, `chatservice-main/tests/test_chat_auth_contract.py`, `docs/chat-backend-architecture.md`, va `docs/CHANGELOG.md`.
- Noi dung: Conversation direct tu Chatmgt co subject chung va danh sach gom ca hai participant; neu dung truc tiep, phia co ten trung subject se thay chinh minh o header va panel ca nhan liet ke ca hai nguoi. Ban sua xac dinh peer bang toan bo Management ID/Tinode UID cua viewer, chieu header/avatar/mo ta/panel direct thanh duy nhat peer, nhung van giu participant IDs cho rang buoc Chatmgt. Presence gio doc `on/off` truc tiep tu `meTopic.onPres`, dong thoi dung loai event trong `onContactUpdate` de khong phu thuoc vao gia tri `contact.online` co the cham mot callback.
- Quyet dinh ky thuat: Shared conversation subject khong phai danh tinh hien thi cua direct chat; danh tinh direct la viewer-relative va phai phat sinh tu participant con lai. Tinode raw `on/off` la tin hieu realtime chinh, contact snapshot chi dung khoi tao/doi chieu. State update van bao toan referential equality de khong tai dien vong lap lag da sua truoc do.
- Database/API/cau hinh: Khong migration, khong doi API va khong them bien moi truong. Chi thay doi projection/render frontend va xu ly Tinode event.
- Kiem thu: Local `npm run test:frontend` dat 7/7; `npm run lint` dat, chi con warning co san trong frontend cu/Tinode vendor; `python -m unittest chatservice-main.tests.test_chat_auth_contract -v` dat 18/18; `python -m unittest discover -s chatservice-main/tests -v` dat 56 test, 22 test phu thuoc runtime bi skip local; `npm run build -- --outDir .codex-build-check` dat voi bundle `App-BzUGEzq4.js`; `git diff --check` dat. Production archive commit `bb0dcf4` dat SHA-256; build tao `App-D9PvW9LL.js`; `nginx -t`, container `chat`, public `/healthz`, public JavaScript bundle va Chatmgt health deu dat. Container `chat` dung Compose release `/opt/deploy/chat/releases/bb0dcf4`; log sau deploy khong co panic, fatal, exception hoac error. Chatmgt, ChatAPI, PostgreSQL va Redis khong bi recreate. Da thu ket noi Browser de acceptance UI truc tiep nhung moi truong khong co browser session kha dung.
- Rui ro con lai: Can acceptance bang hai phien Account production. Hard refresh ca hai phia, kiem tra header/panel cua cung conversation hien hai peer doi nhau va dong Online/Offline doi ngay khi mot phia dong/mo phien Tinode.
- Viec tiep theo: Tren hai trinh duyet hoac mot cua so an danh, mo cung conversation direct, hard refresh, sau do dong/mo mot phien de xac nhan presence doi ma khong can tai lai trang con lai.
- Commit/PR: Code `bb0dcf4`; commit ghi nhan trien khai xem `git log`.

## 2026-07-30-11 - Sua nhap lieu va Tinode direct hai chieu

- Thoi gian: 2026-07-30 23:56 (Asia/Saigon)
- Loai: Sua loi | Realtime | Kien truc | Van hanh
- Trang thai: Can xac nhan
- Muc tieu: Khac phuc o soan tin mat focus sau moi ky tu va tin nhan truc tiep chi hien thi o ben gui, ben nhan khong subscribe dung Tinode topic.
- Pham vi: Trang thai ket noi/typing va input ref cua ChatUI; serialize, prepare va bind Tinode topic cua Chatmgt; test hoi quy frontend/backend; tai lieu kien truc Step 4.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/chatRealtime.test.js`, `package.json`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/services/sso_identity.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `chatservice-main/tests/test_sso_identity.py`, `docs/chat-backend-architecture.md`, va `docs/CHANGELOG.md`.
- Noi dung: Luong `onChange` truoc day goi prepare/bind/session de gui typing, tam chuyen ket noi sang `connecting`, lam input bi disable-enable va mat focus sau tung ky tu; ref focus cung gan nham vao o tim kiem. Ban sua chi gui typing khi socket da authenticated va room da co topic, khong provisioning trong `onChange`, khong dua phien authenticated ve `connecting`, va gan ref vao dung o soan. Voi chat 1-1, Chatmgt truoc day luu mot UID peer chung vao `Conversation.tinode_topic`, trong khi Tinode P2P yeu cau moi ben dung UID cua nguoi con lai. API gio tra direct topic theo viewer, khong persist UID direct chung, xoa binding direct legacy khi bind thanh cong, va chi ap dung unique/conflict binding cho group.
- Quyet dinh ky thuat: Chatmgt van la nguon chuan cho mot conversation direct va membership, nhung Tinode topic direct la gia tri phat sinh theo nguoi xem. Group topic van la shared resource duoc persist va kiem tra tap subscriber. Khong tat typing, khong ha kiem tra Tinode token va khong tao migration khong can thiet.
- Database/API/cau hinh: Khong co migration va khong them bien moi truong. Truong `tinode_topic` giu nguyen cho group; response direct co `tinode_topic` la Tinode UID cua participant con lai. Direct binding cu duoc dua ve `NULL` sau lan bind hop le tiep theo.
- Kiem thu: Local `npm run test:frontend` dat 5/5; `npm run lint` dat, chi con warning co san trong frontend cu/Tinode vendor; `npm run build -- --outDir .codex-build-check` dat voi bundle `App-BkX0Il4w.js`; `python -m unittest discover -s chatservice-main/tests -v` dat 55 test, 22 test phu thuoc runtime bi skip local; `python -m py_compile chatservice-main/application/services/sso_identity.py chatservice-main/application/controllers/api_chat_management.py` dat; `git diff --check` dat. Production archive commit `7cda29e` dat SHA-256, image Chatmgt chay 55 test dat voi 6 source-only test bi skip, deployment verifier dat database/auth/CORS/Account SSO/Tinode bridge/management isolation, va verifier hai tenant dat. Image frontend tao `App-CA2MiCvH.js`; `nginx -t`, public `/healthz`, Chatmgt health va tai bundle JavaScript deu dat HTTP 200. Ca `chatmgt` va `chat` healthy, dung Compose release `/opt/deploy/chat/releases/7cda29e`; ChatAPI, hai PostgreSQL va Redis giu nguyen, khong recreate. Log 5 phut sau deploy khong co traceback, panic, fatal, exception hoac error.
- Rui ro con lai: Moi truong Codex khong co hai phien Account production da dang nhap de thuc hien acceptance nguoi dung cuoi. Hai ben can hard refresh de nhan mapping topic moi va xac minh gui/nhan hai chieu, go lien tuc khong mat focus, typing, delivery va read receipt.
- Viec tiep theo: Mo hai trinh duyet hoac mot cua so an danh bang hai Account user cung tenant, hard refresh, gui tin luan phien hai chieu va giu o soan lien tuc it nhat mot cau dai.
- Commit/PR: Code `7cda29e`; commit ghi nhan trien khai xem `git log`.

## 2026-07-30-10 - Sua regression lam treo giao dien nhom

- Thoi gian: 2026-07-30 23:34 (Asia/Saigon)
- Loai: Sua loi | Hieu nang | Van hanh
- Trang thai: Can xac nhan
- Muc tieu: Khac phuc trang ChatUI production mat phan hoi khi nguoi dung mo conversation nhom sau ban va presence `3ccc559`.
- Pham vi: Render quyen quan tri nhom trong ChatUI, helper danh tinh/thoi gian, lint va test hoi quy frontend.
- File da thay doi: `.oxlintrc.json`, `src/app/App.jsx`, `src/features/contacts/services/accountDirectory.test.js`, va `docs/CHANGELOG.md`.
- Noi dung: Commit `3ccc559` da chuyen `identityValues` tu `App.jsx` sang service danh ba nhung khong import lai. Nhanh render nhom goi identifier khong ton tai, nen moi state update Tinode khi dang mo nhom tiep tuc lam React nem loi va tab co the mat phan hoi. Ban sua import dung helper, dua `getTimeString` ve module scope de ham chuyen doi nhom khong tham chieu binding noi bo khong ton tai, va bat quy tac `no-undef` cho source; file Tinode vendor co san duoc loai khoi rieng quy tac nay. Commit `9ca3487` da duoc push va trien khai bang release sach `/opt/deploy/chat/releases/9ca3487`, khong ghi de worktree production dang co thay doi.
- Quyet dinh ky thuat: Sua regression nho nhat tai diem render, khong doi API, websocket, topic, database hoac luong auth. Dung lint `no-undef` lam gate vi Vite build van co the tao bundle khi JavaScript tham chieu identifier chua khai bao.
- Database/API/cau hinh: Khong co migration, khong doi API hay bien moi truong. Chi thay doi cau hinh lint noi bo repository.
- Kiem thu: `npm run test:frontend` dat 4/4 test; `npm run lint` dat, chi con warning co san trong frontend cu/vendor; `npm run build -- --outDir .codex-build-check` dat voi bundle local `App-Chj_eiub.js`; `git diff --check` dat. Archive production dat SHA-256; build server tao `App-B8c5o-nB.js`; `nginx -t` dat; container `songhong-production-chat-1` healthy va dung config release `9ca3487`; `/healthz`, Chatmgt health va toan bo stack dat; public bundle `App-B8c5o-nB.js` tra HTTP 200. Chatmgt, ChatAPI, PostgreSQL va Redis khong bi recreate. Log production xac nhan mot WebSocket HTTP 101, khong co reconnect storm trong khoang log da kiem tra. Trinh duyet tich hop khong co phien kha dung nen chua thao tac UI Account truc tiep.
- Rui ro con lai: Can phien Account that hard refresh va xac nhan mo nhom, de trang hoat dong it nhat mot phut va gui tin khong con lam Chrome bao khong phan hoi.
- Viec tiep theo: Hard refresh `chat.upgo.vn`, mo lai nhom bi loi va thu gui tin. Neu tab van phan hoi sau it nhat mot phut thi chuyen muc nay sang `Hoan tat`.
- Commit/PR: Code `9ca3487`; commit ghi nhan trien khai xem `git log`.

## 2026-07-30-09 - Trien khai ban va treo ChatUI len production

- Thoi gian: 2026-07-30 23:18 (Asia/Saigon)
- Loai: Sua loi | Hieu nang | Van hanh
- Trang thai: Can xac nhan
- Muc tieu: Dua ban va vong lap presence cua commit `3ccc559` len `chat.upgo.vn` ma khong ghi de cac thay doi dang co tren server va khong khoi dong lai backend/database.
- Pham vi: Image va container production cua service `chat`; kiem tra health va bundle cong khai.
- File da thay doi: `docs/CHANGELOG.md`.
- Noi dung: Commit `3ccc559` da duoc push len `origin/master`. Do worktree production dang o `1b3de22` va co thay doi cuc bo trong verifier/start script, tao release sach tai `/opt/deploy/chat/releases/3ccc559` tu archive da kiem SHA-256, build image frontend bang `.env` production hien tai, kiem tra Nginx va force-recreate rieng container `chat`. Khong pull, reset hoac ghi de worktree production cu.
- Quyet dinh ky thuat: Dung release directory bat bien de Docker build dung chinh xac source cua commit moi trong khi bao toan cac file server dang sua do. Giu nguyen project Compose `songhong-production`, cac volume va toan bo container Chatmgt, ChatAPI, PostgreSQL, Redis.
- Database/API/cau hinh: Khong migration, khong doi `.env`, khong xoa volume va khong restart backend/database. Chi image/container `chat` duoc thay the.
- Kiem thu: Archive release dat SHA-256; `docker compose build chat` dat va Vite tao `App-BEhisWvX.js`; `nginx -t` dat; container `songhong-production-chat-1` healthy tren `8094`; local/public `/healthz` va Chatmgt auth health dat; toan bo stack `docker compose ps` van Up/healthy; public HTML tai `chat.upgo.vn` tra `index-Fd8117Sw.js`, tai bundle `App-BEhisWvX.js` HTTP 200.
- Rui ro con lai: Moi truong Codex khong co phien Account da dang nhap de xac nhan bang thao tac UI rang trang khong con lag sau Tinode online. Can hard refresh va chay acceptance bang hai Account user cung tenant.
- Viec tiep theo: Nguoi dung hard refresh `chat.upgo.vn`, de trang mo it nhat mot phut, mo chat va gui tin giua hai user; neu UI van phan hoi thi chuyen muc nay sang `Hoan tat`.
- Commit/PR: Commit code `3ccc559`; commit ghi nhan trien khai chua muc nay (xem `git log`).

## 2026-07-30-08 - Chan vong lap presence lam treo ChatUI

- Thoi gian: 2026-07-30 23:07 (Asia/Saigon)
- Loai: Sua loi | Hieu nang | Van hanh
- Trang thai: Can xac nhan
- Muc tieu: Khac phuc ChatUI bi lag va mat phan hoi sau khi nang phien Chatmgt sang Tinode realtime.
- Pham vi: Dong bo presence Tinode vao danh ba va conversation state cua ChatUI; test hoi quy frontend.
- File da thay doi: `src/app/App.jsx`, `src/features/contacts/services/accountDirectory.js`, `src/features/contacts/services/accountDirectory.test.js`, `package.json`, va `docs/CHANGELOG.md`.
- Noi dung: `applyPresenceSnapshot` truoc day luon tao mang danh ba, ket qua tim kiem va ket qua them thanh vien moi ngay ca khi trang thai online khong doi. Vi callback nay phu thuoc vao mang danh ba va effect khoi tao Tinode lai phu thuoc vao callback, moi snapshot presence lai kich hoat render, tao callback moi, chay lai `listConversations`, ap snapshot tiep va tao thanh vong lap lam trinh duyet bi treo. Ban sua chi tra state moi khi it nhat mot tai khoan thuc su doi presence, dung ref de callback doc du lieu moi nhat ma giu tham chieu on dinh, va giu nguyen object cua cac tai khoan khong doi.
- Quyet dinh ky thuat: Giu luong presence realtime va effect subscribe Tinode hien co, nhung ap dung referential equality cho state React thay vi vo hieu hoa presence hoac tang timeout. Tach cac ham so khop identity/presence sang service danh ba de co the kiem thu bang Node ma khong can khoi dong React.
- Database/API/cau hinh: Khong co migration, khong doi API va khong them bien moi truong.
- Kiem thu: `npm run test:frontend` dat 3 test; `npm run lint` dat, con cac warning co san ngoai pham vi; `npm run build -- --outDir .codex-build-check` dat voi Vite 8.1.5 va thu muc build tam da duoc xoa; `git diff --check` dat.
- Rui ro con lai: Chua co phien trinh duyet Account da dang nhap trong moi truong Codex de do Performance/Network sau ban sua. Production `chat.upgo.vn` van dang phuc vu bundle cu `App-CkeZxhv6.js` va chi het loi sau khi commit, build va deploy bundle moi.
- Viec tiep theo: Commit/push cac file dung pham vi, rebuild/recreate service `chat`, sau do hard refresh va xac nhan UI van phan hoi, request khong lap lien tuc, va chat realtime bang hai Account user cung tenant.
- Commit/PR: Commit chua muc nay (xem `git log`).

## 2026-07-30-07 - Dung danh ba tenant cua UpGO Account

- Thoi gian: 2026-07-30 22:52 (Asia/Saigon)
- Loai: Sua loi | Van hanh | Bao mat
- Trang thai: Can xac nhan
- Muc tieu: Khac phuc ChatUI chi hien cache danh ba `stale`, khong thay user test moi va cho phan du lieu chat cho lau sau dang nhap.
- Pham vi: Endpoint danh ba Account SSO, cau hinh production, test dich vu, tai lieu kien truc va trien khai.
- File da thay doi: `README.md`, `chatservice-main/application/config/config.py`, `chatservice-main/application/services/account_sso_service.py`, `chatservice-main/tests/test_account_sso_service.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `docs/chat-backend-architecture.md`, `infrastructure/production/.env.example`, `infrastructure/production/README.md`, `infrastructure/production/compose.yaml`, va `docs/CHANGELOG.md`.
- Noi dung: Doi directory mac dinh tu `/api/v1/user` sang `/api/v1/tenant_user`, la endpoint ma giao dien Account production dang dung de tai danh sach nguoi dung cua tenant hien tai. Them test payload thuc te co `display_name`, email, role va status nhung khong bat buoc `user_name`; email duoc dung lam username projection an toan. Test Account SSO duoc co lap khoi cac dependency chatbot/RAG khong lien quan.
- Quyet dinh ky thuat: Van chuyen cookie Account server-to-server, xac minh lai phien va tenant truoc/sau khi tai danh ba, va chi dong bo snapshot tenant da xac minh. Khong goi Account directory truc tiep tu trinh duyet va khong ha bo kiem tra user dang dang nhap phai co trong snapshot.
- Database/API/cau hinh: Khong co migration va khong xoa cache/du lieu. Production phai doi `ACCOUNT_SSO_DIRECTORY_PATH=/api/v1/tenant_user` trong `.env`, sau do recreate rieng Chatmgt.
- Kiem thu: `python -m unittest discover -s chatservice-main/tests -v` dat 51 test, gom test payload `/tenant_user` moi. `python -m py_compile ...`, `docker compose ... config --quiet` voi secret test tam, va `git diff --check` dat.
- Rui ro con lai: Chua cap nhat `.env` va recreate Chatmgt production; chua xac nhan `directory_sync.status=fresh` bang hai Account user that cung tenant.
- Viec tiep theo: Commit/push, cap nhat endpoint trong `.env` production, build/recreate Chatmgt, chay full test/verifier, sau do dang nhap lai hai user va xac nhan danh ba fresh cung chat 1-1.
- Commit/PR: Commit chua muc nay (xem `git log`).

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
