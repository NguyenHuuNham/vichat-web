# Nhat ky thay doi ViChat

Day la bo nho ky thuat theo thu tu moi nhat truoc. Moi lan sua code, cau hinh, database, ha tang hoac cap nhat tinh nang phai them mot muc theo `docs/DEVELOPMENT_WORKFLOW.md`.

Khong ghi mat khau, token, cookie, khoa API, du lieu ca nhan hoac gia tri bi mat vao file nay.

## Lich su thay doi

## 2026-08-17-14 - Deploy account membership login len production

- Thoi gian: 2026-08-17 19:48 (Asia/Saigon)
- Loai: Trien khai | Xac thuc | UpGO Account | Kiem thu production
- Trang thai: Da deploy production; san sang UAT
- Muc tieu: Dua luong dang nhap tai khoan/mat khau UpGO va tu dong nhan membership doanh nghiep/brand vao ChatUI production, khong gan tenant CTY NHAM.
- Quyet dinh trien khai: Upload release `/opt/deploy/chat/releases/account-membership-07d7ab6-20260817-1845`, build lan luot `chatmgt`, `tinode-account-bridge`, `chat` voi uu tien CPU/I/O thap, sau do recreate tung service voi `--no-deps`; giu nguyen PostgreSQL, Redis, Tinode va volume hien co. Symlink `current` tro vao release moi, `previous` tro ve `nav-language-1500b7e-20260817-1645`.
- Cau hinh production da xac minh: `VITE_CHAT_AUTH_MODE=account_password`, `VITE_CHAT_TENANT_ID` trong; `CHAT_ACCOUNT_CREDENTIAL_LOGIN_ENABLED=true`. Chatmgt health tra endpoint `/api/v1/auth/account-login`, credential login va Tinode bridge deu duoc cau hinh.
- Backup/rollback: Pre-migration backup tai `/opt/deploy/chat/backups/account-membership-07d7ab6-20260817-1845-chatservice.dump`; khong migration database. Khong dung `docker compose down -v`.
- Kiem thu production: `https://chat.upgo.vn/healthz` tra `200 ok`; `https://chatmgt.upgo.vn/api/v1/auth/health` tra `200` voi `status=ok`, credential login va bridge true; health `chat`, `chatmgt`, `tinode-account-bridge`, `chat-postgres`, `tinode-postgres` deu `healthy`; Docker `active`; public bundle moi `index-D1eV74bT.js`, `App-C96PTG9x.js`, `ManagementApp-CQTFatFw.js` co marker `account_password`, `tenant_id`, `account-login`.
- Rui ro con lai: Chua UAT bang tai khoan employee duoc moi o hai doanh nghiep/brand that; can hard refresh ChatUI va nhap thu cong tai khoan/mat khau UpGO de xac nhan membership, danh ba, Tinode token va tenant isolation.
- Commit/PR: `07d7ab6` (source); deploy release production da hoan tat.

## 2026-08-17-13 - Tu dong nhan membership UpGO khi dang nhap thu cong

- Thoi gian: 2026-08-17 18:31 (Asia/Saigon)
- Loai: Sua loi | Xac thuc | UpGO Account | Kiem thu
- Trang thai: Hoan tat code; chua deploy, can UAT
- Muc tieu: Giữ ChatUI bat buoc nhap tai khoan/mat khau UpGO, nhung tu dong nhan dung doanh nghiep/brand duoc moi ma khong bat nguoi dung chon tenant.
- Pham vi: Chuan hoa Account session trong `chatservice-main/application/services/sso_identity.py`, ChatUI credential mode/payload, thong bao loi, unit test membership, README, tai lieu kien truc va fallback build Docker/Compose; khong thay doi Chatmgt thanh trang tao nhan vien.
- Noi dung: Chap nhan cac dang membership UpGO dung `tenants`, `companies`, `brands`, `organizations` hoac `memberships`, cung alias ID/ten/role. Neu Account khong tra `current_tenant_id`, Chatmgt tu chon membership active dau tien theo thu tu Account; chi tu choi khi khong con membership active. Credential van di qua `POST /api/v1/auth/account-login`, Tinode van duoc cap credential server-side sau khi xac thuc.
- Quyet dinh ky thuat: Khong bat SSO nhanh va khong dua tenant selector vao ChatUI. Mat khau nguoi dung nhap la mat khau UpGO; khong luu, tra ve hoac gui mat khau do sang Tinode. Chatmgt chi giu projection/danh ba va mapping tenant-scoped.
- Database/API/cau hinh: Khong migration; giu nguyen endpoint credential va tenant isolation. Khong them tenant mac dinh moi. Default ChatUI trong source, Dockerfile va Compose deu la `account_password` de khong co quick-login khi thieu env.
- Kiem thu: `python -m unittest discover -s chatservice-main/tests -p 'test_sso_identity.py' -q` dat 23/23; `node --test src/features/chat/services/chatManagementService.test.js` dat 8/8; `npm run test:frontend` dat 89/89; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` dat; 3 targeted auth-contract tests dat 3/3; `python -m py_compile chatservice-main/application/controllers/api_chat_management.py chatservice-main/application/services/sso_identity.py chatservice-main/scripts/tinode_account_bridge.py chatservice-main/tests/test_chat_auth_contract.py chatservice-main/tests/test_sso_identity.py` dat; `docker compose -f infrastructure/production/compose.yaml config -q` dat voi placeholder local cho bien bat buoc (chi canh bao `TINODE_CORS_ORIGINS` trong local env); `git diff --check` dat.
- Rui ro con lai: Neu mot tai khoan co nhieu membership active nhung Account khong tra current tenant, he thong dung membership dau tien do Account tra ve; can UAT bang tai khoan co brand VN TEST va mot doanh nghiep khac.
- Viec tiep theo: Rebuild/redeploy `chatmgt` va `chat`, hard refresh ChatUI, nhap tai khoan/mat khau UpGO cua employee duoc moi va kiem tra danh ba/Tinode.
- Commit/PR: Chua tao.

## 2026-08-17-12 - Sua dang nhap UpGO cho nhieu doanh nghiep

- Thoi gian: 2026-08-17 17:29 (Asia/Saigon)
- Loai: Sua loi | Bao mat | Xac thuc | Cau hinh | Kiem thu
- Trang thai: Hoan tat code; chua deploy, can UAT
- Muc tieu: Cho phep tai khoan UpGO duoc moi vao bat ky doanh nghiep active nao dang nhap Chat, khong bi tu choi vi tenant mac dinh cua CTY NHAM.
- Pham vi: ChatUI, Chatmgt credential login, Tinode Account bridge, mobile login va production build configuration; giu nguyen tenant isolation sau khi cap session.
- File da thay doi: `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/chatManagementService.test.js`, `src/features/management/services/managementAdminService.js`, `mobile/src/services/authService.ts`, `mobile/src/constants/config.ts`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/config/config.py`, `chatservice-main/application/controllers/api_chatbot.py`, `chatservice-main/scripts/tinode_account_bridge.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `scripts/build-production.mjs`, `.env.example`, `infrastructure/production/Dockerfile`, `infrastructure/production/Dockerfile.chatmgt`, `infrastructure/production/compose.yaml`, `infrastructure/production/.env.example`, `infrastructure/production/README.md`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Bo `tenant_id` khoi payload dang nhap UpGO cua web/mobile; Chatmgt xac thuc email/mat khau voi UpGO truoc, sau do dung tenant active do `current_user`/membership UpGO tra ve de tao projection, JWT va Tinode mapping. Tenant hint tu client khong con quyen chon hoac tu choi company. Tinode bridge cung gui credential khong kem tenant co dinh. Fallback `VITE_CHAT_TENANT_ID` va default build production deu de trong, khong con gan vao tenant CTY NHAM; `CHATMGT_DEFAULT_TENANT` chi con danh cho bootstrap/local recovery. Fallback `CHATBOT_DEFAULT_TENANT` trong production cung de trong; request da xac thuc lay tenant tu Chatmgt session.
- Quyet dinh ky thuat: Khong them tenant selector tren trinh duyet va khong tin tenant do client gui; UpGO Account la nguon chuan duy nhat. Neu mot user co nhieu membership, user can chon company hien tai trong UpGO Account truoc khi dang nhap. Cac truy van sau dang nhap van lay tenant tu JWT va tiep tuc cach ly du lieu.
- Database/API/cau hinh: Khong migration. `POST /api/v1/auth/account-login` giu nguyen endpoint, nhung bo qua `tenant_id` tu body va dinh tuyen theo membership da verify; build args tenant chi nhan gia tri tuy chon; bridge khong con can `CHATMGT_DEFAULT_TENANT`.
- Kiem thu: `node --test src/features/chat/services/chatManagementService.test.js` dat 7/7; `npm run test:frontend` dat 88/88; `npm run lint` exit 0 voi warning legacy/vendor; `npm run build:production` dat; trong `mobile/`, `npm run typecheck` va `npm run lint` dat; `python -m py_compile ...` cho cac file Python anh huong dat; `python -m unittest chatservice-main/tests/test_sso_identity.py chatservice-main/tests/test_account_sso_service.py -q` dat 39 test, skip 18; contract auth/bridge/UI login va build tenant dong muc tieu dat 4/4; `docker compose ... config -q` dat sau khi cap placeholder local cho bien secret bat buoc; `git diff --check` dat. `python -m unittest discover -s chatservice-main/tests -q` chay 154 test, skip 50 va con 1 assertion notification desktop da co truoc trong `test_chatui_keeps_muted_notifications_in_app_without_desktop_popups`; khong ghi full contract la dat.
- Rui ro con lai: Chua rebuild/redeploy production va chua UAT bang hai tai khoan thuoc hai tenant that; neu UpGO session co nhieu membership, ket qua phu thuoc `current_tenant_id` hoac thu tu membership active do Account tra ve. Chatbot knowledge/external tenant van la cau hinh rieng; fallback tenant mac dinh da duoc bo de khong gan vao CTY NHAM.
- Viec tiep theo: Rebuild/redeploy `chatmgt`, `chat` va Tinode bridge; hard refresh `https://chat.upgo.vn`; UAT tai khoan tenant CTY NHAM va mot doanh nghiep khac, kiem tra login, directory, conversation, Tinode token va khong lo du lieu cheo tenant.
- Commit/PR: Chua tao.

## 2026-08-17-11 - Them dark mode theo tai khoan ChatUI

- Thoi gian: 2026-08-17 17:14 (Asia/Saigon)
- Loai: Tinh nang | Web
- Trang thai: Da kiem thu; cho deploy
- Muc tieu: Cho phep moi tai khoan tu chon giao dien Sang, Toi hoac He thong ma khong lam thay doi giao dien cua tai khoan khac; mac dinh la Sang.
- Pham vi: ChatUI panel Cai dat, preference localStorage theo viewer va CSS theme; khong doi chat, nhom, Work, Tinode, Chatmgt hay database.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/conversationNotifications.js`, `src/features/chat/services/conversationNotifications.test.js`, `src/styles/index.css`, `README.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Them preview ba lua chon giao dien, ap dung `data-theme` cho toan bo ChatUI, theo doi thay doi `prefers-color-scheme` khi chon He thong va luu `theme` trong preference record theo ID viewer.
- Quyet dinh ky thuat: Tai su dung storage key per viewer hien co de giu giao dien doc lap giua cac tai khoan; khong tao cookie, token, API hay migration moi.
- Database/API/cau hinh: Khong migration, API, dependency hoac bien moi truong moi.
- Kiem thu: `npm run test:frontend` dat 88/88; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` dat voi bundle `index-Bz4VN1y1.js`, `App-BML5nbZE.js`, `index-CDd2UX-G.css`; `git diff --check` dat.
- Rui ro con lai: Mot so mau file/avatar va overlay co mau dac thu co the can UAT them trong theme Toi; browser runtime co the khong san sang cho UAT tu dong.
- Viec tiep theo: Deploy rieng ChatUI, kiem tra health/public bundle va UAT ba tuy chon tren hai tai khoan.
- Commit/PR: Chua tao.

## 2026-08-17-10 - Sap xep menu chinh va them chon ngon ngu ChatUI

- Thoi gian: 2026-08-17 16:57 (Asia/Saigon)
- Loai: Tinh nang | Web
- Trang thai: Da deploy production; san sang UAT
- Muc tieu: Rut gon thanh dieu huong con Chat, Nhom, Work va Cai dat; thay tuy chon Giao dien gon bang chon Tieng Viet/English.
- Pham vi: ChatUI sidebar va panel Cai dat; giu nguyen cac panel danh ba, file, thong bao cung cac luong chat, nhom va Work ben trong.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/conversationNotifications.js`, `src/features/chat/services/conversationNotifications.test.js`, `src/styles/index.css`, `README.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: An ba muc Danh ba, File dung chung va Thong bao khoi menu chinh, doi nhan Workspace thanh Work, them selector ngon ngu co co Viet/Anh va luu lua chon theo viewer trong localStorage. Cac panel bi an van duoc giu nguyen de khong lam dut luong hien co.
- Quyet dinh ky thuat: Tai su dung preference record theo ID tai khoan dang nhap; normalize chi chap nhan `vi` va `en`, mac dinh `vi`, dong thoi cap nhat `document.documentElement.lang` khi doi ngon ngu.
- Database/API/cau hinh: Khong migration, API, dependency hoac bien moi truong moi.
- Kiem thu: `npm run test:frontend` dat 88/88; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` dat voi bundle `index-ip5gQJb2.js`, `App-6SGUobUE.js`, `index-B6WVCdci.css`; `git diff --check` dat; public bundle moi co marker `English` va `Choose the application display language`, khong con marker `compactMode`; `https://chat.upgo.vn/healthz` tra `ok`; ChatUI healthy; `docker compose ps` xac nhan Chatmgt, Tinode bridge/webhook, ChatAPI, PostgreSQL, Redis va Coturn van healthy/Up. Mot lenh kiem tra phu dung nham service key chatbot va tra `no such service`, sau do da chay lai lenh tong thanh cong.
- Noi dung deploy: Archive SHA-256 `E50EB6492B189D8B2BAD7F5DE946822E51DAF869B9739D66A0D340DB06F1F654` duoc staging vao `/opt/deploy/chat/releases/nav-language-1500b7e-20260817-1645`; `current` tro vao release nay, `previous` tro ve `/opt/deploy/chat/releases/custom-sound-7c0b880-20260817-1553`; image ChatUI `sha256:5b1ebdca3918529e1884189b1ca726e527aa276266168720fc197117172f716a`, container `b3feecb1d8997ebc72188c648c7d52754ae598f18b7437ab11d303c54442212a`; chi recreate `chat`, khong restart Chatmgt/Tinode bridge/chatbot, database, Redis/Coturn hay reset volume.
- Rui ro con lai: Chua UAT thao tac bang browser that vi browser runtime hien khong co session kha dung; can hard refresh, chon English/Tieng Viet, F5, doi tai khoan va xac nhan localStorage tach theo viewer.
- Viec tiep theo: Mo `https://chat.upgo.vn`, vao Cai dat, doi selector ngon ngu va kiem tra lai cac luong chat/nhom/Work; neu can rollback dung symlink `previous`.
- Commit/PR: Source `1500b7e` da push `origin/master`; deploy record follow-up.

## 2026-08-17-09 - Tai am bao tuy chinh tu may tinh

- Thoi gian: 2026-08-17 15:47 (Asia/Saigon)
- Loai: Tinh nang | Web | Kiem thu
- Trang thai: Da deploy production; san sang UAT
- Muc tieu: Cho phep nguoi dung chon file am thanh tu may tinh lam am bao tin nhan tren tung tai khoan.
- Pham vi: ChatUI panel Cai dat va dich vu preference am bao; khong doi Tinode message, Chatmgt, API, schema, membership hay mobile.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/conversationNotifications.js`, `src/features/chat/services/conversationNotifications.test.js`, `src/styles/index.css`, `README.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Them kiem tra MIME/duoi file va gioi han 8 MB; luu Blob am thanh theo management account ID trong IndexedDB cua origin; luu chi ID lua chon trong localStorage. Settings co nut tai file, thay file, xoa file va nghe thu; khi gui tin den, am bao tuy chinh duoc phat bang HTML Audio, con cac profile san co van dung Web Audio.
- Quyet dinh ky thuat: Tach Blob khoi localStorage de khong vuot gioi han chuoi va khong dua file am thanh len server; IndexedDB khong kha dung thi giu chat hoat dong va bao loi khi tai file. Khong luu token, mat khau hay noi dung tin nhan.
- Database/API/cau hinh: Khong migration/schema/API/env moi; them database IndexedDB `vichat-notification-sounds.v1` phia trinh duyet, khong lien quan database production.
- Kiem thu: `npm run test:frontend` dat 88/88; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` dat voi bundle local `index-CwMhF8Ph.js`, `App-CvHstrn5.js`, `index-DOsfZ-Qm.css`; `git diff --check` dat. Production release build dat; ChatUI healthy; `http://127.0.0.1:8094/healthz` va `https://chat.upgo.vn/healthz` deu tra `ok`; public bundle `index-7EaRdqMY.js` tai chunk `App-DMvWkzwk.js` va CSS `index-DOsfZ-Qm.css` co marker `notification-custom-sound`, `vichat-notification-sounds` va `notification-upload-button`; log ChatUI sau recreate khong co traceback/panic/fatal/critical/emerg/exception/error. Browser skill chua co runtime/session de UAT upload va phat file.
- Rui ro con lai: File phu thuoc IndexedDB, quota va kha nang phat audio cua trinh duyet theo tung origin; can UAT tai file nho hon 8 MB, F5, doi tai khoan va thu tin nhan den tren hai trinh duyet that.
- Noi dung deploy: Archive SHA-256 `BAC764BADF6DEAE0825C71FADE3977EECEF3297A5394E939D6A246A097513CC6` duoc staging vao `/opt/deploy/chat/releases/custom-sound-7c0b880-20260817-1553`; `current` tro vao release nay, `previous` tro ve `/opt/deploy/chat/releases/session-notify-e259d03-20260817-1511`; image ChatUI `sha256:a900266f1663cf50ee81aef2a0af7c43772a79cc1d6d10e8311765169d546338`, container `e8f7884c64f4`; chi recreate `chat`, khong restart Chatmgt/Tinode bridge/chatbot, database, Redis/Coturn hay reset volume. Lan build/recreate dau bi timeout sau khi image da build; image moi duoc giu lai, kiem tra lai health/marker va recreate khong build da dat truoc khi doi symlink.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, vao Cai dat tai file am thanh nho hon 8 MB, nghe thu/chon am bao, gui tin tu tai khoan khac; sau do thu F5, thay file, xoa file va doi tai khoan de xac nhan IndexedDB tach theo viewer.
- Commit/PR: Code `7c0b880` da push `origin/master`; deploy record follow-up.

## 2026-08-17-08 - Khoi phuc phien sau F5 va thong bao desktop

- Thoi gian: 2026-08-17 15:29 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Web | Kiem thu
- Trang thai: Da deploy production; san sang UAT
- Muc tieu: Giu nguyen phien dang nhap sau khi F5 va cho phep bat/tat thong bao desktop cung am bao tin nhan theo tung tai khoan.
- Pham vi: ChatUI auth restore, Tinode message notification, panel Cai dat; khong doi noi dung tin nhan, membership, Chatmgt schema hay mobile.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/chatManagementService.test.js`, `src/features/chat/services/conversationNotifications.js`, `src/features/chat/services/conversationNotifications.test.js`, `src/styles/index.css`, `README.md`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: ChatUI goi `GET /api/v1/auth/me` qua cookie HttpOnly sau reload de khoi phuc session trong memory, sau do nap lai Chatmgt/Tinode nhu luong dang nhap. Them thong bao desktop cho tin nhan den khi viewer dang o xa hoi thoai, co yeu cau quyen trinh duyet, bat/tat theo viewer, am bao Web Audio voi 4 profile va nut nghe thu; mute hoi thoai van chan ca hai loai thong bao.
- Quyet dinh ky thuat: Khong luu token/mat khau; chi luu preference khong nhay cam theo management account ID trong localStorage. Desktop Notification dung `silent: true` de am bao tuy chon duoc phat bang Web Audio; neu trinh duyet khong cap quyen thi van giu chat va am bao rieng.
- Database/API/cau hinh: Khong migration/schema moi; tai su dung `GET /api/v1/auth/me` va cookie Chatmgt hien co; khong them bien moi truong hay dependency.
- Kiem thu: `npm run test:frontend` dat 87/87; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` dat voi bundle `index-qcpbtzqr.js`, `App-CEUEPDeI.js`, `index-B_IDmWGu.css`; `git diff --check` dat; remote build ChatUI dat, container healthy, `https://chat.upgo.vn/healthz` tra `ok`, public chunk `/assets/App-DBmM0Ch2.js` co `restoreSession`, `desktopNotifications`, `requestPermission` va CSS co `notification-preference-card`; log sau recreate khong co traceback/panic/fatal/critical/emerg/error. Browser skill da thu ket noi nhung moi truong khong co browser kha dung nen chua UAT thao tac F5/quyen notification.
- Noi dung deploy: Archive SHA-256 `58cc2851af0baa4d5a12446b4178cba9b0ae18ad6e2ea8f5f9c1cd82c17d8ea7` staging tai `/opt/deploy/chat/releases/session-notify-e259d03-20260817-1511`; `current` tro vao release nay, `previous` tro ve `/opt/deploy/chat/releases/member-reconcile-88165e9-20260817-1414`; chi recreate `chat`, khong restart Chatmgt, Tinode bridge, database, Redis/Coturn hay reset volume. Image ChatUI `sha256:7c251d55197b90aa3b4edff0ef72d5a43cbc084264c285e2879007a52d3e9c0c`, container `d381b4325af6`; Chatmgt giu container `7a942d11f1f6`.
- Rui ro con lai: Desktop notification phu thuoc quyen cua browser va chi hoat dong khi web runtime con song; can UAT bang hai tai khoan that de xac nhan tin nhan, am bao, click notification mo dung hoi thoai va refresh khong mat phien.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, dang nhap hai tai khoan cung tenant, kiem tra F5 khong dang xuat; vao Cai dat chon Bat, cap quyen, nghe thu 4 am bao va gui tin tu tai khoan con lai.
- Commit/PR: Source `e259d03`; deploy record follow-up.

## 2026-08-17-07 - Dong bo lai thanh vien Tinode sau khi xoa

- Thoi gian: 2026-08-17 14:23 (Asia/Saigon)
- Loai: Sua loi | Web | Realtime | Kiem thu | Van hanh
- Trang thai: Da deploy production; san sang UAT
- Muc tieu: Xoa thanh vien khoi nhom xong van gui tin binh thuong, ke ca khi topic Tinode con subscriber stale tu thao tac truoc.
- Pham vi: Chatmgt/Tinode membership bridge, ChatUI remove member va snapshot thanh vien; khong doi schema, message content hay tenant authorization.
- File da thay doi: `chatservice-main/application/services/auth_service.py`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/tests/test_tinode_bridge_service.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `src/app/App.jsx`, `src/features/chat/services/chatManagementService.test.js`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`, `dist/index.html`.
- Noi dung: Them doc va reconcile subscriber Tinode theo active member set cua Chatmgt sau add/remove va khi bind gap lech; dung owner bridge credential de sua UID du/thieu. ChatUI khong bind lai topic da co truoc khi xoa, coi system event/open topic la best-effort va giu member list tu Chatmgt sau response.
- Quyet dinh ky thuat: Chatmgt van la nguon thanh vien chuan; thao tac reconcile duoc gioi han trong bridge va dung token owner server-side, khong cho browser tu phat minh membership.
- Database/API/cau hinh: Khong migration; khong doi endpoint/payload; khong doi bien moi truong.
- Kiem thu: `npm run test:frontend` dat 84/84; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` dat voi bundle `index-DG5URbPh.js`, `App-Ypm7DEba.js`; `python -m unittest discover -s tests -q` dat 154 test, skip 50; `python -m py_compile application/services/auth_service.py application/controllers/api_chat_management.py tests/test_tinode_bridge_service.py tests/test_chat_auth_contract.py` dat; `git diff --check` dat; remote `python -m unittest tests.test_tinode_bridge_service -q` dat 15/15 va 5 test contract anh huong dat; full contract trong production image khong the chay tron bo vi image khong chua source frontend `/src/...` ma mot test doc truc tiep; remote build, health va smoke endpoint deu dat.
- Noi dung deploy: Archive SHA-256 `07f5bde309e92428bae7d5604c934e1efecaa7f641b1bb80dc4c1a8d7162b367` duoc staging tai `/opt/deploy/chat/releases/member-reconcile-88165e9-20260817-1414`; `current` tro vao release nay, `previous` tro ve `/opt/deploy/chat/releases/avatar-pin-af69a9a-20260817-1305`; chi recreate `chatmgt` va `chat`, khong migration/reset volume. Image ChatUI `sha256:47b88605b57310d8323e02987bbd90948080eec5360d5be5b2d2288f5849f041`, container `a3dc3e2b863`; image Chatmgt `sha256:edef98143e7873826ab79fcb293389a0a0964147ef25a51fde1119d42c9e9e8d`, container `7a942d11f1f6`; rollback tag luu ve image release truoc.
- Kiem tra production: ChatUI, Chatmgt, Tinode account bridge, chatbot webhook, ChatAPI va hai PostgreSQL healthy; Redis/Coturn running; `https://chat.upgo.vn/healthz` tra `ok`; Chatmgt `/api/v1/auth/health` tra `status: ok`; public bundle phuc vu `index-ZraCiGwW.js` va CSS co marker mention/context-menu; log sau recreate khong co traceback/panic/fatal/critical/emerg/error.
- Rui ro con lai: Chua UAT production bang hai tai khoan that cho kich ban xoa member roi gui tin ngay; full contract test khong phu hop de chay trong image production vi phu thuoc source frontend ngoai image; can theo doi log reconciliation neu Tinode tu choi token owner.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, mo group, xoa mot member, gui tin ngay khong refresh, refresh roi gui tiep; neu can rollback dung symlink `previous` va release `avatar-pin-af69a9a-20260817-1305`.
- Commit/PR: Source `88165e9`; deploy record follow-up.

## 2026-08-17-06 - Dong bo avatar nhom va menu ghim hoi thoai

- Thoi gian: 2026-08-17 13:01 (Asia/Saigon)
- Loai: Tinh nang | Web | Realtime | Du lieu | Kiem thu
- Trang thai: Da deploy production; san sang UAT
- Muc tieu: Dong bo avatar nhom cho moi thanh vien, hien mention mau xanh va them menu thao tac hoi thoai co ghim/bo ghim hoat dong nhu web that.
- Pham vi: ChatUI sidebar/composer/group detail, Chatmgt conversation metadata, Tinode avatar snapshot va migration database; giu nguyen cac luong tin nhan, file, goi va mobile.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/tinodeClient.js`, `src/features/chat/services/chatManagementService.js`, `src/features/chat/services/conversationPinPolicy.js`, `src/features/chat/services/conversationPinPolicy.test.js`, `src/styles/index.css`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/models/models.py`, `chatservice-main/migrations/011_conversation_pins.sql`, `chatservice-main/alembic/versions/20260817_11_conversation_pins.py`, `chatservice-main/tests/test_chat_auth_contract.py`, tai lieu va `dist/index.html`.
- Noi dung: ChatUI lay avatar group tu topic Tinode va ghi lai vao metadata Chatmgt de cac thanh vien dung cung mot avatar; bo panel `Mo ta nhom` trong thong tin nhom; token mention da chon duoc to mau xanh; menu ba cham nam tren moi hoi thoai, dat `Ghim hoi thoai` la muc dau, doi thanh `Bo ghim hoi thoai` sau khi ghim, sap xep hoi thoai ghim len tren, va giu cac thao tac doc chua doc/tat thong bao/xoa. Da bo `Bao xau` va `Phan loai`.
- Quyet dinh ky thuat: Pin duoc luu tren `conversation_participant` theo tung viewer, khong thay doi topic Tinode hay lich su tin nhan; che do demo dung localStorage theo viewer de giu luong local, production dung Chatmgt lam nguon chuan. Avatar group chi dong bo qua topic da duoc Chatmgt xac nhan, tranh ghi de membership client.
- Database/API/cau hinh: Them Alembic `20260817_11` va SQL `011_conversation_pins.sql`; them `PUT /api/v1/conversation/<id>/pin`; danh sach conversation tra `pinned`, `pinnedAt`, `avatar` va sap xep pin truoc. Backup Chatmgt tai `/opt/deploy/chat/backups/avatar-pin-af69a9a-20260817-1305-chatservice.dump` (99651 bytes); `alembic upgrade head` da chay tu `20260804_10` len `20260817_11` truoc khi switch release.
- Kiem thu: Local `npm run test:frontend` dat 83/83; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build:production` dat voi bundle `index-BVgHC-Xz.js`, `App-DXiLL2jC.js`, `index-qWJaSBuU.css`; `python -m unittest tests.test_chat_auth_contract tests.test_enterprise_workspace -q` dat 45 test; `python -m py_compile application/controllers/api_chat_management.py application/models/models.py alembic/versions/20260817_11_conversation_pins.py` dat; `git diff --check` dat. Production archive SHA-256 `8ff039ecd5cc90351ecbc5d351a5c8dfba7dbb0feef5a109f567aaf0a87e7ddc`; Compose config/build, migration head, tenant isolation, Nginx syntax, ChatUI/Chatmgt/chatbot health, public bundle marker `conversation-context-menu`/`message-mention` va container health deu dat; log 3 phut sau recreate khong co traceback/panic/fatal/critical/emerg/exception/error.
- Noi dung deploy: Release `/opt/deploy/chat/releases/avatar-pin-af69a9a-20260817-1305` da tro vao `current`, `previous` tro ve `/opt/deploy/chat/releases/ab0ab55-20260817-1211`; recreate chi `chatmgt` va `chat`. Image Chatmgt `sha256:bf20809855f27ea2c7e22f8c003746bf1f3b73c30cf110a1de7da15525628aca`, container `ddf4f39a67bd`; image ChatUI `sha256:a42c8438c0c3531d18f1955af9d472aece9602f8abcab3117a2183c8d543fc80`, container `9bb59e70d470`; bridge, worker, ChatAPI, PostgreSQL, Redis va Coturn giu nguyen container.
- Rui ro con lai: Full `verify_deployment.py` dung o gate co san cua Tinode trung tam vi public hello chua xac nhan WebRTC/ICE authoritative; khong lien quan avatar, mention, pin hay migration. Browser tich hop trong phien nay khong co browser/session kha dung, nen chua UAT bang hai tai khoan that.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, dang nhap hai tai khoan cung tenant, kiem tra avatar group giong nhau, mention hien xanh, ghim/bo ghim chi doi thu tu viewer dang thao tac; neu can rollback dung symlink `previous` va release `ab0ab55-20260817-1211`.
- Commit/PR: Code `283e94e`, docs implementation `af69a9a`; deploy record follow-up.

## 2026-08-17-05 - Deploy production commit ab0ab55

- Thoi gian: 2026-08-17 12:24 (Asia/Saigon)
- Loai: Van hanh | Web | Kiem thu | Tai lieu
- Trang thai: Da deploy production; san sang UAT group mention
- Muc tieu: Dua tinh nang mention thanh vien trong nhom cua commit `ab0ab55` len ChatUI production de kiem thu tren tai khoan that.
- Pham vi: Chi ChatUI; Chatmgt, Tinode bridge/chatbot, ChatAPI, PostgreSQL, Redis va Coturn duoc giu nguyen.
- File da thay doi: `docs/CHANGELOG.md`; source release tu commit `ab0ab55`.
- Noi dung: Archive SHA-256 `b3f5bc38e023bdeb70865645ff98e68650bb510a679a62738bbea455cf6596c3` duoc staging tai `/opt/deploy/chat/releases/ab0ab55-20260817-1211`. Symlink `current` da chuyen sang release nay va `previous` tro ve `6bac0dd-20260817-1120`; image ChatUI moi duoc build thanh cong.
- Quyet dinh ky thuat: Build tu thu muc release de `context: ../..` resolve dung source; recreate duy nhat service `chat` bang `docker compose ... up -d --no-deps chat`, khong dung `down`, khong reset volume/topic/message va khong restart backend.
- Database/API/cau hinh: Khong migration, schema, API hay thay doi `.env` production.
- Kiem thu: Remote build ChatUI dat; `songhong-production-chat-1` tra `running healthy`; `http://127.0.0.1:8094/healthz` va `https://chat.upgo.vn/healthz` deu tra `ok`; index public da phuc vu bundle `index-exz5oMSi.js` va `index-0KtUrc1_.css`; Compose `ps` xac nhan cac service con lai van healthy/Up.
- Rui ro con lai: Chua UAT tren browser voi group tenant that de xac nhan picker, snapshot thanh vien, avatar protected media va echo `x-mentions` tu Tinode.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, mo group that, go `@`, thu `@All`, loc/chon mot nguoi bang chuot va ban phim, sau do gui tin va kiem tra mention hien dung.
- Commit/PR: Source `ab0ab55`; deploy record follow-up commit.

## 2026-08-17-04 - Mention thanh vien trong nhom

- Thoi gian: 2026-08-17 12:03 (Asia/Saigon)
- Loai: Tinh nang | Web | UX | Realtime | Kiem thu
- Trang thai: Hoan tat code va kiem thu local; chua UAT tai khoan that
- Muc tieu: Cho phep go `@` trong composer nhom de chon `@All` hoac mot thanh vien cu the.
- Pham vi: Composer web, picker thanh vien, draft theo tung cuoc tro chuyen, metadata message Tinode/demo; khong doi Chatmgt, mobile, schema hay quyen thanh vien.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/mentionPolicy.js`, `src/features/chat/services/mentionPolicy.test.js`, `src/features/chat/services/tinodeClient.js`, `src/styles/index.css`, `package.json`, va `docs/CHANGELOG.md`.
- Noi dung: Picker chi hien trong group, loc theo ten/username/email khong dau, co `@All`, avatar, chon bang chuot hoac `ArrowUp`/`ArrowDown` + `Enter`/`Tab`, `Escape` de dong, va chen token dung vi tri caret. Mention duoc giu trong draft, message optimistic va header `x-mentions` cua Tinode de khong lam thay doi text/send flow hien co.
- Quyet dinh ky thuat: Dung regex context chi kich hoat khi `@` o dau token sau khoang trang/dau mo, tranh bat popup trong email; danh sach lay tu snapshot thanh vien group va danh ba tenant da dong bo, khong tu goi API moi hay mo rong quyen truy cap.
- Database/API/cau hinh: Khong migration/schema; them metadata client-side trong header Tinode da co co che metadata, backend van coi noi dung la tin nhan text.
- Kiem thu: `node --test src/features/chat/services/mentionPolicy.test.js` dat 3/3; `npm run test:frontend` dat 81/81; `npm run lint` exit 0 voi warning legacy/vendor da co; `npm run build` dat; `git diff --check` dat.
- Rui ro con lai: Chua UAT tren browser voi group tenant that de xac nhan snapshot thanh vien, avatar protected media va echo `x-mentions` tu Tinode.
- Viec tiep theo: Hard refresh ChatUI, mo group that, go `@`, thu loc/chon `@All`, chon nguoi bang ban phim va gui mot tin co mention.
- Commit/PR: Chua tao.

## 2026-08-17-03 - Deploy production commit 6bac0dd

- Thoi gian: 2026-08-17 11:44 (Asia/Saigon)
- Loai: Van hanh | Kiem thu | Tai lieu
- Trang thai: Da deploy production; can operator cau hinh Tinode trung tam
- Muc tieu: Dua commit `6bac0dd` len production theo release flow cua repository.
- Pham vi: ChatUI, Chatmgt, Tinode account bridge va chatbot worker trong `infrastructure/production/compose.yaml`; PostgreSQL, Redis, ChatAPI va Coturn duoc giu nguyen.
- File da thay doi: `docs/CHANGELOG.md`; source release tu commit `6bac0dd`.
- Noi dung: Tao archive SHA-256 `cfd4c589ac3ced9c9b12a76a98d4ae289b4ef3e19ce2665ac176c8b4bb1967c0`, giai nen tai `/opt/deploy/chat/releases/6bac0dd-20260817-1120`, sao chep `.env`/runtime production, build 4 image moi va chuyen symlink `current` sang release moi. ChatUI phuc vu bundle `index-BzVEuxbE.js`; `previous` tro ve `call-guard-79519d2-20260816`.
- Quyet dinh ky thuat: Dung release bat bien, khong ghi de worktree production dang co thay doi va chi recreate 4 service bi anh huong. Khi bridge doi container, ChatUI duoc recreate tiep de Nginx refresh upstream DNS; khong dung `down -v`, khong reset volume/topic/message.
- Database/API/cau hinh: Backup Chatmgt PostgreSQL va Tinode PostgreSQL tai `/opt/deploy/chat/backups/6bac0dd-20260817-1120`; `alembic upgrade head` chay thanh cong va database da o head; khong sua `.env` production. Rollback tags `songhong-production-chat:rollback-before-6bac0dd`, `songhong-production-chatmgt:rollback-before-6bac0dd`, `songhong-production-tinode-account-bridge:rollback-before-6bac0dd` va `songhong-production-tinode-chatbot-webhook:rollback-before-6bac0dd` da tao.
- Kiem thu: Local `npm run test:frontend` dat 78/78; `python -m unittest discover -s chatservice-main/tests -q` dat 152, skip 49; `npm run lint` exit 0 voi warning legacy/vendor; `npm run build:production`, `python -m py_compile ...` va `git diff --check` dat. Remote Compose config/build dat; production verifier dat database/credential policy va tenant isolation; health ChatUI/Chatmgt/chatbot HTTP 200; 4 container healthy; log 2 phut sau recreate khong co traceback/panic/fatal/critical/emerg/exception/error.
- Rui ro con lai: Tinode hello authoritative tra `helloCode=201`, 2 ICE entries nhung `webrtcEnabled=false`, nen voice/video van bi khoa dung. Full `verify_deployment.py` dung o gate WebRTC; day la cau hinh trung tam Tinode `.215`, khong phai loi release. Chua UAT hai tai khoan that.
- Viec tiep theo: Operator cau hinh `webrtc.enabled=true` va ICE authoritative tren Tinode trung tam `.215`, probe lai voi Origin production, chay lai verifier va UAT voice/video. Neu can rollback toan bo, dung symlink `previous` va cac rollback tags da ghi.
- Commit/PR: Source `6bac0dd`; deploy record `8d90b0b` da push `origin/master`.

## 2026-08-17-02 - Chon thanh vien nhom tu danh ba cong ty

- Thoi gian: 2026-08-17 10:11 (Asia/Saigon)
- Loai: Tinh nang | Web | UX | Kiem thu
- Trang thai: Hoan tat code va kiem thu local; chua UAT danh ba tenant that
- Muc tieu: Cho phep nguoi tao nhom chon ngay nhan vien trong danh ba cong ty da dong bo, khong phai cho tim kiem tung nguoi.
- Pham vi: Modal `Tao nhom tro chuyen` cua ChatUI web va helper loc danh ba client-side; khong doi Chatmgt, Tinode, mobile, schema hay quyen thanh vien.
- File da thay doi: `src/app/App.jsx`, `src/features/contacts/services/accountDirectory.js`, `src/features/contacts/services/accountDirectory.test.js`, `src/features/chat/services/chatManagementService.test.js`, va `docs/CHANGELOG.md`.
- Noi dung: Modal hien toan bo nhan vien active cung tenant ngay khi mo va cho phep chon/bo chon truc tiep. O nhap nay la bo loc cuc bo theo ten, username, email, chuc vu hoac phong ban (ho tro go khong dau), nen modal khong con goi `searchUsers` khi nguoi dung go. Van hien so luong da chon, trang thai va username de nhan dien dung nguoi.
- Quyet dinh ky thuat: Tai su dung `companyDirectoryContacts` - danh ba da duoc Chatmgt dong bo trong phien dang nhap va da loc current user, nhan vien inactive va tenant khac - lam nguon duy nhat cua picker. Loc tai client tranh request mang lap lai, giu nguyen API va rang buoc tenant hien co.
- Database/API/cau hinh: Khong co migration, endpoint, payload, bien moi truong hoac thay doi kien truc. `docs/chat-backend-architecture.md` khong can cap nhat vi nguon du lieu va ranh gioi dich vu giu nguyen.
- Kiem thu: `node --test src/features/contacts/services/accountDirectory.test.js` dat 19/19; `npm run test:frontend` dat 78/78; `npm run lint` exit 0 voi cac warning legacy/vendor va worktree co san; `npx vite build --mode production --outDir <thu-muc-tam>` dat, sinh 13 file. `git diff --check` dat.
- Rui ro con lai: Chua UAT bang phien nhan vien that co danh ba tenant tren trinh duyet; can xac nhan danh sach hien ngay khi mo modal, loc va chon nhieu nguoi truoc khi tao nhom.
- Viec tiep theo: Hard refresh ChatUI va UAT mot nhom moi bang danh ba cong ty that; khong co migration hay cau hinh bo sung.
- Commit/PR: `1b029c9`.

## 2026-08-17-01 - Khac phuc signaling cuoc goi mobile

- Thoi gian: 2026-08-17 00:17 (Asia/Saigon)
- Loai: Sua loi | Realtime | Kiem thu
- Trang thai: Hoan tat; chua UAT hai tai khoan that
- Muc tieu: Khoi phuc loi moi va ket noi cuoc goi thoai/video mobile.
- Pham vi: Tinode call invite, sequence server, va payload SDP/ICE trong ung dung mobile; giu nguyen luong web va cac luong chat khac.
- File da thay doi: `mobile/src/services/tinodeClient.ts`, `mobile/src/store/callStore.ts`, `mobile/src/utils/callSignaling.ts`, `mobile/src/utils/callSignaling.test.ts`.
- Noi dung: Chuyen publish loi moi tu `Topic.publishMessage()` sang `Tinode.publishMessage()` de khong bi SDK 0.25.3 nuot loi PUB va de lay dung sequence do server cap; them thong bao loi co hanh dong va giai ma payload JSON/string/wrapper truoc khi tao SDP/ICE native.
- Quyet dinh ky thuat: Khong doi signaling protocol, server Tinode, hay cau hinh WebRTC; chi bo sung lop tuong thich mobile theo luong web da co.
- Database/API/cau hinh: Khong co migration hoac API moi. Tinode van can tra `webrtcEnabled=true` va ICE/TURN; `EXPO_PUBLIC_CALLS_ENABLED` phai la `true`.
- Kiem thu: `npx vitest run src/utils/callSignaling.test.ts` dat 3/3; `npm run typecheck` dat; `npm run lint` dat; `npm run test:frontend` dat 77/77; `npm run lint` web exit 0 voi warning legacy; `npx vite build --mode production --outDir <thu-muc-tam>` dat; `node scripts/debug_call_signaling.mjs` tra `helloCode=201`, `webrtcEnabled=true` va STUN/TURN. `npm test -- --run` mobile con 1 suite legacy khong parse duoc Flow trong `react-native/index.js` (`workspaceService.test.ts`), 29 test van dat.
- Rui ro con lai: Chua UAT hai tai khoan that tren browser/mobile vi browser runtime khong co phien kha dung (`agent.browsers.list()` tra `[]`); `.env.local` hien o `VITE_CHAT_MODE=external` nen web local co chu y vo hieu hoa call, khong tu doi de tranh anh huong luong chat external.
- Viec tiep theo: UAT voice/video 1-1 tren hai tai khoan va hai mang, sau do build/deploy mobile va web theo quy trinh phat hanh.
- Commit/PR: Chua tao.

## 2026-08-16-09 - Dinh chinh probe WebRTC authoritative

- Thoi gian: 2026-08-16 21:35 (Asia/Saigon)
- Loai: Dinh chinh | Realtime | Kiem thu | Tai lieu
- Trang thai: Can operator cau hinh Tinode trung tam
- Muc tieu: Dinh chinh ket qua probe truoc do da suy ra `webrtcEnabled=true` chi tu viec hello co ICE.
- Pham vi: Kiem tra public Tinode hello va dieu kien mo nut voice/video; khong thay doi code san pham hay database.
- Noi dung: Raw WebSocket hello hien tra `webrtcEnabled=false` nhung van co STUN/TURN. ICE nay la fallback do relay quang ba, khong phai capability authoritative; ChatUI mau xam la hanh vi dung de tranh `501 not implemented`.
- Quyet dinh ky thuat: Chi mo call khi field `ctrl.params.webrtcEnabled` cua Tinode trung tam la `true`; khong mo bang cach chi thay doi `WEBRTC_ENABLED` tren host ChatUI `.206`.
- Database/API/cau hinh: Operator can cap nhat block `webrtc.enabled=true` va `ice_servers_file` tren Tinode `.215`, sau do restart service trung tam. SSH tu workstation hien bi tu choi.
- Kiem thu: Raw probe `wss://chat.upgo.vn/v0/channels` tra code `201`, `webrtcEnabled=false`, co mot STUN va mot TURN record; ChatUI/Chatmgt health van `ok`/`200`.
- Rui ro con lai: Voice/video van bi khoa cho den khi authoritative hello tra `webrtcEnabled=true`; chua UAT hai tai khoan.
- Viec tiep theo: Cau hinh/restart Tinode `.215`, probe lai raw field, hard refresh ChatUI va test voice/video 1-1.
- Commit/PR: Commit docs follow-up.

## 2026-08-16-08 - Xac nhan Tinode trung tam da bat WebRTC

- Thoi gian: 2026-08-16 21:17 (Asia/Saigon)
- Loai: Van hanh | Realtime | Kiem thu | Tai lieu
- Trang thai: Da xac nhan capability production; chua UAT hai tai khoan that
- Muc tieu: Xac nhan blocker authoritative WebRTC da duoc go bo sau khi Tinode trung tam cap nhat cau hinh.
- Pham vi: Public Tinode relay/hello va dieu kien mo lai voice/video; khong thay doi code, database hay signaling payload.
- Noi dung: Probe `wss://chat.upgo.vn/v0/channels` tra `helloCode=201`, `webrtcEnabled=true`, mot STUN va mot TURN record; username/credential duoc redact. Dieu nay xac nhan hello public hien da quang ba ICE authoritative, khac voi ket qua `false` da ghi o muc truoc.
- Quyet dinh ky thuat: Tiep tuc dung hello cua Tinode trung tam lam nguon chuan; khong dua credential TURN vao log hoac bundle. Capability da san sang nhung khong dong nghia da UAT media hai chieu.
- Database/API/cau hinh: Khong thay doi trong repository; cau hinh WebRTC trung tam da duoc quan sat o trang thai active.
- Kiem thu: `https://chat.upgo.vn/healthz` tra `ok`; Chatmgt auth health tra `200`; chatbot health tra `200` va `provider_configured=true`; `node scripts/debug_call_signaling.mjs` tra hello `201` voi STUN/TURN va credential da redact. Browser smoke test chua chay duoc vi browser runtime loi `failed to write kernel assets`.
- Rui ro con lai: Chua xac nhan call voice/video hai chieu, accept/reject/timeout/hang-up, mute micro/camera va TURN tren hai mang bang hai tai khoan that.
- Viec tiep theo: Hard refresh, dang nhap hai tai khoan that, test voice/video hai chieu va neu van loi thi thu thap ma loi/console sau khi cap nhat central.
- Commit/PR: `4694349` da ghi release guard; muc xac minh nay cho commit follow-up.

## 2026-08-16-07 - Chan false-positive WebRTC khi Tinode trung tam thieu ICE

- Thoi gian: 2026-08-16 20:43 (Asia/Saigon)
- Loai: Sua loi | Realtime | Ha tang | Kiem thu
- Trang thai: Da commit, push va deploy production; chua UAT hai tai khoan that
- Muc tieu: Khong de ChatUI/mobile hien nut goi roi nhan `501 not implemented` khi relay chi co ICE fallback ma server Tinode authoritative chua duoc cau hinh.
- Pham vi: Tinode account bridge, capability call web/mobile, verifier production, tai lieu va regression test; khong doi signaling payload, database, Chatmgt auth hay noi dung message.
- File da thay doi: `chatservice-main/scripts/tinode_account_bridge.py`, `chatservice-main/tests/test_tinode_account_bridge.py`, `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `src/features/chat/services/callSignaling.js`, `src/features/chat/services/callSignaling.test.js`, `src/features/chat/services/tinodeClient.js`, `mobile/src/services/tinodeClient.ts`, `docs/chat-backend-architecture.md`, `infrastructure/production/README.md`.
- Noi dung: Xac nhan Tinode trung tam `web.vichat.net` tra build `mongodb:v0.25.1`, hello goc khong co `iceServers`; relay truoc day them ICE Coturn vao hello nen client tuong co the goi, nhung server van tu choi `PUB` co header `webrtc` bang 501. Bridge nay gan `webrtcEnabled=false` cho ICE fallback va `true` chi khi hello trung tam co ICE authoritative; client vo hieu hoa call dung ly do cau hinh va map 501 thanh thong bao hanh dong.
- Quyet dinh ky thuat: Khong gia lap signaling ngoai Tinode va khong coi ICE relay fallback la kha nang server. Tinode authoritative phai duoc cau hinh `webrtc.enabled=true` va `ice_servers`/`ice_servers_file` bang Coturn truoc khi mo lai call.
- Database/API/cau hinh: Khong migration/schema. Can cap nhat cau hinh rieng cua `web.vichat.net` va restart Tinode trung tam; `.206` chi la ChatUI/bridge/Coturn host va SSH hien tai khong co quyen vao `.215`.
- Kiem thu: Local `npm run test:frontend` dat 77/77; `npm run lint` exit 0 voi warning legacy/worktree; targeted `npx oxlint` dat; `python -m unittest chatservice-main/tests/test_chat_auth_contract.py -q` dat 33/33; mobile `typecheck` va `lint` dat; Vite production build vao thu muc tam dat. Production bridge test trong image dat 2/2; `https://chat.upgo.vn/healthz` va `http://127.0.0.1:8094/healthz` tra `ok`; bridge/chat healthy; public hello tra code 201, co STUN/TURN va `webrtcEnabled=false`; public bundle nap `index-VkPpfXCg.js`; log 3 phut sau recreate khong co exception/error/fatal/panic.
- Rui ro con lai: Chua co quyen restart/cap cau hinh Tinode trung tam `.215`, nen voice/video van bi khoa dung trong production cho den khi central `webrtc.enabled=true` va hello authoritative co ICE. Chua UAT hai tai khoan that, accept/reject/timeout/hang-up, mute micro/camera va TURN hai mang.
- Viec tiep theo: Cap cau hinh Tinode `.215`, restart central, xac nhan public hello `webrtcEnabled=true`, sau do dang nhap hai tai khoan va test voice/video hai chieu; khong can deploy lai bridge/ChatUI neu chi thay doi central.
- Trien khai: Release `/opt/deploy/chat/releases/call-guard-79519d2-20260816`; image ChatUI `sha256:bd180054ad8143dc232748caa28e42e9ef888200e9152cacce9ca9b72ebac70f`, container `672769935e13`; image bridge `sha256:7fda560f0d89ca1c8a88b17f6aec99e1e01ca38c67463b3531e7dcc5ea14897a`, container `3824e5f30744`; rollback tags `songhong-production-chat:rollback-before-7c89db5` va `songhong-production-tinode-account-bridge:rollback-before-7c89db5`; chi recreate `chat` va `tinode-account-bridge`, giu nguyen Chatmgt `a6e65c1f0074`, chatbot worker `2ba71cde63df`, ChatAPI `8476615ad4ac`, Coturn `aa680d35fdc0`, PostgreSQL/Redis.
- Commit/PR: Code `7c89db5`, test fixture follow-up `79519d2`; da push `origin/master`.

## 2026-08-16-06 - Sua publish mo cuoc goi Tinode

- Thoi gian: 2026-08-16 19:29 (Asia/Saigon)
- Loai: Sua loi | Web | Realtime | Kiem thu
- Trang thai: Da commit, push va deploy production; chua UAT hai tai khoan that vi Browser runtime tich hop khong khoi tao duoc trong phien nay
- Muc tieu: Lam cho luong goi thoai va goi video lay duoc ma cuoc goi tu Tinode, khong hien thong bao chung khi server tu choi ban tin mo cuoc goi.
- Pham vi: ChatUI Web Tinode publish/signaling va test pure cho call; giu nguyen Chatmgt, database, API, mobile va media WebRTC sau khi signaling thanh cong.
- File da thay doi: `src/features/chat/services/callSignaling.js`, `src/features/chat/services/callSignaling.test.js`, `src/features/chat/services/tinodeClient.js`, `docs/CHANGELOG.md`.
- Noi dung: Tranh loi SDK Tinode 0.25.3 trong `Topic.publishMessage()` khi SDK nuot reject cua `PUB` bang cach dung publish cap client cho ban tin `VC` dau tien; trich xuat `seq` tu control hoac draft, luu timestamp, map loi 401/403 va loi server de UI co thong tin hanh dong. Tin hieu `ringing/accept/offer/answer/ICE/hang-up` kiem tra kha nang SDK truoc khi gui; canh bao ICE chi ghi so luong entry, khong ghi credential.
- Quyet dinh ky thuat: Chi bypass `Topic.publishMessage()` cho call invite de giu error response cua Tinode; khong sua `node_modules`, khong ghi token/credential vao log, khong thay doi hop dong Tinode hoac signaling payload.
- Database/API/cau hinh: Khong migration, khong doi API/schema; server van can `WEBRTC_ENABLED` va ICE/TURN hop le.
- Kiem thu: Local `node --test src/features/chat/services/callSignaling.test.js` dat 12/12; `npm run test:frontend` dat 77/77; `npx oxlint src/features/chat/services/callSignaling.js src/features/chat/services/callSignaling.test.js src/features/chat/services/tinodeClient.js` dat; `npm run lint` exit 0 voi warning legacy/vendor/worktree co san; Vite production build vao thu muc tam dat; `git diff --cached --check` va `git diff HEAD^ HEAD --check` dat. Docker build production tren release cu dung lai truoc recreate vi syntax pre-existing tai `tinodeClient.js:646`; commit build fix `e750c36` sua dung hai delimiter va build release moi dat.
- Trien khai: Commit call `91bfd82` va build fix `e750c36` da push `origin/master`. Release cu `/opt/deploy/chat/releases/call-publish-91bfd82-20260816` khong active vi build fail truoc khi recreate. Release active `/opt/deploy/chat/releases/call-publish-e750c36-20260816`; image ChatUI `sha256:8880e8198484418e4e526904c4ddc89bc1b7e8f57340eb92359723c41036c915`, container `331d9d4d3657`; rollback tag `songhong-production-chat:rollback-before-call-91bfd82` tro image cu `sha256:1d17c245496608b1303b3601c8d8cd0ca967ccb6af5ba43005b10b410b895a94`. Chi recreate `chat`; Chatmgt `a6e65c1f0074`, bridge `d62dce7b5d00`, worker `2ba71cde63df`, ChatAPI `8476615ad4ac`, PostgreSQL, Redis va Coturn giu nguyen ID.
- Kiem thu production: `https://chat.upgo.vn/healthz` va local `http://127.0.0.1:8094/healthz` deu `ok`; public index nap `index-Dzg0WDuD.js` va App bundle `App-BhdW3bFo.js`; container running/healthy; `node scripts/debug_call_signaling.mjs` tra hello `201`, `webrtcEnabled=true`, 1 STUN + 1 TURN entry voi credential da redact; log chat khong co `panic`, `fatal`, `traceback`, `exception` hoac `critical` trong 5 phut sau recreate.
- Rui ro con lai: Chua publish call bang token tai khoan that va chua UAT voice/video hai chieu, accept/reject, timeout, hang-up, mute micro/camera tren hai trinh duyet/mang; browser runtime tra loi `failed to write kernel assets` nen khong mo duoc hai phien Account trong phien nay.
- Viec tiep theo: Dang nhap hai Account user cung tenant tren hai browser/mang, hard refresh, thu voice va video hai chieu, accept/reject/timeout/hang-up va mute micro/camera; neu call bi Tinode tu choi thi dung thong tin loi 401/403/server de sua quyen/cau hinh. Khong can deploy lai tru khi gate UAT that bai.
- Commit/PR: Code `91bfd82`, build fix `e750c36`; docs deploy record se duoc ghi bo sung trong commit follow-up.

## 2026-08-16-05 - Sua owner roi nhom bi Tinode tu choi

- Thoi gian: 2026-08-16 17:38 (Asia/Saigon)
- Loai: Sua loi | Web | Realtime | Phan quyen | Kiem thu
- Trang thai: Da deploy production; chua UAT bang tai khoan that
- Muc tieu: Khi owner bam `Roi khoi nhom`, thao tac phai xoa membership that, khong hien thong bao roi nhom gia khi Tinode tu choi.
- Pham vi: Chatmgt/Tinode transfer owner va ChatUI group leave/delete; giu nguyen schema, API endpoint, mobile va cac luong tin nhan khac.
- Noi dung: Tinode yeu cau thanh vien moi chap nhan quyen `O` bang phien cua chinh thanh vien do truoc khi owner cu co the `leave`. Chatmgt thuc hien grant -> accept -> remove, publish su kien `member_left` bang tai khoan con lai sau khi commit; ChatUI khong publish su kien truoc endpoint management nua. Them bao toan loi Tinode chi tiet va rollback owner transfer khi buoc sau that bai.
- Quyet dinh ky thuat: Khong de frontend tu dong song song hai nguon membership; Chatmgt van la transaction coordinator. Su kien nhom la best-effort sau commit, vi loi phat su kien khong duoc lam rollback membership da thanh cong.
- Database/API/cau hinh: Khong migration, khong doi endpoint/payload/bien moi truong.
- Kiem thu: Local `python -m unittest discover -s chatservice-main/tests -q` dat 152 test, skip 49; `python -m unittest chatservice-main/tests/test_chat_auth_contract.py -q` dat 33/33; `npm run test:frontend` dat 73/73; `npm run lint` exit 0 voi warning legacy/worktree co san; Vite production build vao thu muc tam dat; `python -m py_compile` va `git diff --check` dat. Trong image production, Tinode bridge dat 14/14 va Chatmgt contract dat 33/33. Full image suite con 3 loi contract chatbot cu (`test_external_chatbot_contract` 2, `test_tinode_chatbot_webhook` 1), khong lien quan owner leave.
- Trien khai: Release `/opt/deploy/chat/releases/owner-leave-20260816-1742`; symlink `current` da tro release moi. Image Chatmgt `sha256:e59fbee03eab86a7c2926e6e675b1f7000d7dcfc94e02cff5e8a5373594636a5`, container `a6e65c1f0074`; image ChatUI `sha256:1d17c245496608b1303b3601c8d8cd0ca967ccb6af5ba43005b10b410b895a94`, container `fd4c670478b0`. Rollback tag Chatmgt `songhong-production-chatmgt:rollback-before-owner-leave-20260816-1742` (image `sha256:4cf465bdccff5fa9a246dd4d973e1a2be3d42c6715dbc26a2827f6fe9e36bfd3`); rollback tag ChatUI `songhong-production-chat:rollback-before-owner-leave-20260816-1742` (image `sha256:6e6bbea4bc27b77cadce50fe65eec19dcc8076f54b436f0e6911513741a4e694`).
- Kiem thu production: `https://chatmgt.upgo.vn/api/v1/auth/health`, `https://chat.upgo.vn/healthz` va `https://chatmgt.upgo.vn/api/v1/chatbot/health` deu tra HTTP 200; hai container moi healthy; log 3 phut sau recreate khong co traceback/panic/fatal/critical/emerg/error. Tinode bridge, worker, ChatAPI, PostgreSQL, Redis va Coturn giu nguyen container ID.
- Rui ro con lai: Can UAT bang tai khoan owner va it nhat mot thanh vien trong cung nhom; nhom chi con owner khong co nguoi nhan su kien de hien activity.
- Viec tiep theo: Hard refresh ChatUI, dung hai tai khoan that cho owner roi nhom va xac nhan thanh vien duoc chon co quyen quan tri/xoa thanh vien; neu gate loi thi dung rollback tag da ghi.
- Commit/PR: Chua tao.

## 2026-08-16-04 - Ban giao quan tri vien ngau nhien khi owner roi nhom

- Thoi gian: 2026-08-16 17:06 (Asia/Saigon)
- Loai: Tinh nang | Sua loi | Web | Phan quyen | Kiem thu
- Trang thai: Da deploy production; chua UAT bang tai khoan that
- Muc tieu: Khi quan tri vien/owner roi nhom, mot thanh vien active con lai bat ky tiep quan tri vien voi dung quyen hien co.
- Pham vi: Chatmgt owner transfer khi roi group va group store cua che do demo local; giu nguyen API, Tinode mode, mobile va cac luong khac.
- File da thay doi: `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `src/features/demo/services/demoGroupStore.js`, `docs/CHANGELOG.md`.
- Noi dung: Thay cach chon thanh vien tham gia som nhat bang `func.random()` tren danh sach thanh vien active con lai. Backend van gan role `OWNER` va cap lai Tinode mode `JRWPASO`; demo local cung chon ngau nhien mot lan khi owner roi hoac xoa khoi nhom va luu lai owner moi.
- Quyet dinh ky thuat: Chon ngau nhien tai backend de moi client dung cung mot owner va khong de frontend tu suy dien quyen. Khong doi rang buoc ai duoc them/xoa thanh vien hoac quyen cua owner moi.
- Database/API/cau hinh: Khong migration, khong doi endpoint/schema/bien moi truong.
- Kiem thu: `python -m unittest chatservice-main/tests/test_chat_auth_contract.py -v` dat 33/33; `python -m unittest discover -s chatservice-main/tests -q` dat 150 test, skip 47; `npm run test:frontend` dat 73/73; `npm run lint` exit 0 voi cac warning legacy/worktree co san; `node --check src/features/demo/services/demoGroupStore.js`; `python -m py_compile chatservice-main/application/controllers/api_chat_management.py chatservice-main/tests/test_chat_auth_contract.py`; `git diff --check` deu dat.
- Kiem thu production: Release `owner-transfer-20260816-171635` build thanh cong; Compose `config --no-interpolate -q` dat; contract group membership trong image dat 1/1; selector `func.random()` da xac nhan trong source image; `https://chatmgt.upgo.vn/api/v1/auth/health`, `https://chat.upgo.vn/healthz` va chatbot health deu tra thanh cong; log `chatmgt` 2 phut sau recreate co 0 mau `traceback/panic/fatal/critical/emerg/exception/error`. Full `python -m unittest discover -s tests -q` trong image chua dat do 9 test tich hop Tinode/external-chatbot bao `ERROR`, khong lien quan selector owner-transfer.
- Trien khai: Release `/opt/deploy/chat/releases/owner-transfer-20260816-171635`; image Chatmgt `sha256:267ee4f19e789a16698c1e12fbd1e61fff181ccc211327a02eb6e9a8c4e37653`, container `13e2675aa495`; rollback tag `songhong-production-chatmgt:rollback-before-owner-transfer-20260816-171635` tro image cu `sha256:49b210041f9f765ee8cf20cbfe841dc1fe2cb9ba7dc4b86201e235578b9d1db2`; symlink `current` da tro release moi; chi recreate `chatmgt`, giu nguyen ChatUI, Tinode bridge/chatbot, ChatAPI, PostgreSQL, Redis va Coturn.
- Rui ro con lai: Chua UAT viec owner roi nhom bang hai tai khoan that; full image suite van con 9 test tich hop Tinode/external-chatbot loi nhu tren.
- Viec tiep theo: Hard refresh ChatUI, dung hai tai khoan trong cung tenant, cho owner roi nhom va xac nhan mot thanh vien con lai co the quan tri/xoa thanh vien; neu gate loi thi dung rollback tag da ghi.
- Commit/PR: Chua tao.

## 2026-08-16-03 - Hien dung quan tri vien va quyen xoa thanh vien nhom

- Thoi gian: 2026-08-16 14:51 (Asia/Saigon)
- Loai: Sua loi | Web | Phan quyen | Kiem thu
- Trang thai: Da commit va deploy production; chua UAT bang hai tai khoan trinh duyet that
- Muc tieu: Bao dam nguoi tao nhom duoc hien la quan tri vien trong thong tin nhom va chi quan tri vien co the xoa thanh vien khac, trong khi giu nguyen chat, goi, mobile va cac luong con lai.
- Pham vi: Nhan dien danh tinh quan tri vien Chatmgt/Tinode va dieu kien hien/thuc thi nut xoa thanh vien tren ChatUI web; khong sua backend, mobile, Tinode message/call, database, schema hay cau hinh.
- File da thay doi: `src/app/App.jsx`, `src/features/contacts/services/accountDirectory.js`, `src/features/contacts/services/accountDirectory.test.js`, `docs/CHANGELOG.md`.
- Noi dung: Web nay giai `adminId` tu thanh vien nhom truoc, bo sung anh xa owner Tinode ve tai khoan Chatmgt khi can, hien ten quan tri vien thay vi truong `admin` rong va dung cung mot policy cho nut xoa lan handler. Quan tri vien chi xoa duoc thanh vien khac; thanh vien thuong va chinh owner khong co thao tac xoa.
- Quyet dinh ky thuat: Giu Chatmgt `OWNER` la nguon quyen chuan, khong suy dien nguoi dau tien trong danh sach la owner va khong thay doi API. Kiem tra read-only production xac nhan cac nhom hien co, gom nhom `Vj`, deu co dung mot active `OWNER`, nen khong can migration/backfill.
- Database/API/cau hinh: Khong migration, khong doi API/schema/bien moi truong; `docs/chat-backend-architecture.md` khong can cap nhat vi ranh gioi du lieu va quyen backend giu nguyen.
- Kiem thu local: Focused `node --test src/features/contacts/services/accountDirectory.test.js` dat 18/18; `npm run test:frontend` dat 73/73; `python -m unittest chatservice-main/tests/test_chat_auth_contract.py -v` dat 32/32; `npm run lint` exit 0 voi warning legacy/worktree co san; build Vite production vao thu muc tam dat; `git diff --check` dat cho cac file code trong pham vi.
- Kiem thu production: `https://chat.upgo.vn/healthz`, `https://chatmgt.upgo.vn/api/v1/auth/health` va `https://chatmgt.upgo.vn/api/v1/chatbot/health` deu HTTP 200; worker Tinode chatbot healthy; public bundle `App-CgIU9uA8.js` co marker `adminId` va `btn-remove-member`; ChatUI healthy.
- Trien khai: Release `/opt/deploy/chat/releases/chatui-group-owner-c0c54b8`, symlink `current` da tro release moi; image ChatUI `sha256:8bdf7e99e31e6a05b265bd037b6465e8ea753792312e81b19452c39b915d0395`, container `6a090a0fdc97`; rollback tag `songhong-production-chat:rollback-before-group-owner-c0c54b8` (`sha256:f9d0ea977713233a649367100e44a6baee151fec788156f99641aa6fe30d3c8e`); chi recreate `chat`, Chatmgt `3f2ef755c041`, bridge `d62dce7b5d00`, worker `2ba71cde63df`, ChatAPI `8476615ad4ac`, PostgreSQL/Redis/Coturn giu nguyen.
- Rui ro con lai: Chua UAT click xoa bang hai tai khoan trinh duyet that; can hard refresh de tai bundle moi sau khi deploy.
- Viec tiep theo: Dang nhap hai tai khoan cung tenant, xac nhan creator hien la quan tri vien, admin xoa duoc member khac, member thuong khong co nut xoa; neu gate loi thi tro `current` ve release truoc va dung rollback tag da ghi ben tren.
- Commit/PR: Code `c0c54b8`; deploy record duoc ghi trong commit tai lieu follow-up.

## 2026-08-16-02 - Sua cuoc goi WebRTC ChatUI web

- Thoi gian: 2026-08-16 02:50 (Asia/Saigon)
- Loai: Sua loi | Web | Realtime | Kiem thu | Van hanh
- Trang thai: Da deploy production; chua UAT bang hai tai khoan trinh duyet that
- Muc tieu: Sua loi goi thoai va goi video tren ChatUI web, bao dam phia nhan khong tu dong dong overlay khi chap nhan va co the chon loa ngoai khi trinh duyet ho tro.
- Pham vi: `src/features/chat/components/CallOverlay.jsx`, `src/features/chat/services/callSignaling.js`, `src/features/chat/services/callSignaling.test.js`, hunk giao dien loa trong `src/styles/index.css`; giu nguyen mobile, Chatmgt, Tinode message/topic, database va cac service khac.
- Noi dung: Chi xu ly tin hieu `accept` echo tu phien web khac khi dong overlay incoming; chuan hoa SDP/ICE tu object, JSON string va payload relay; ghep remote track khi browser khong gui `event.streams`; tu phat lai remote media khi autoplay bi chan; them danh sach thiet bi output qua `setSinkId` voi fallback loa mac dinh.
- Quyet dinh ky thuat: Dung helper pure de giu hop dong Tinode cu va test duoc payload relay; khong thay doi signaling server hay them fallback STUN cong cong. Loa ngoai la tuy chon output cua phan tu media, nen trinh duyet khong ho tro van dung loa mac dinh.
- Database/API/cau hinh: Khong migration, khong doi API/schema/bien moi truong.
- Kiem thu: `node --test src/features/chat/services/callSignaling.test.js src/features/chat/services/chatManagementService.test.js` dat 13/13; `npm run test:frontend` dat 70/70; `npm run lint` exit 0 voi warning legacy/worktree co san; `npx vite build --mode production --outDir <temp>` dat; `git diff --check` dat. Sau deploy, public `/healthz`, Chatmgt auth health va chatbot health deu tra thanh cong; bundle co marker `call-output-control`, `setSinkId` va `call-audio-unlock`; container ChatUI healthy.
- Rui ro con lai: Chua UAT bang hai tai khoan trinh duyet that va hai mang; browser runtime tich hop hien khong co session dang nhap de kiem tra audio/video hai chieu, TURN va autoplay.
- Viec tiep theo: Hard refresh web, dang nhap hai tai khoan that va UAT voice/video hai chieu, autoplay va loa ngoai; neu gate loi thi tro `current` ve release truoc bang rollback tag da ghi ben duoi. Khong thay doi mobile.
- Trien khai: Release `/opt/deploy/chat/releases/chatui-web-call-f08b387-merged`; image ChatUI `sha256:d28948b12e35142f4096608895fd2d3d375264b6a2fb5a2de272c5306ebb2fea`, container `71d37323eaf5`; rollback tag `songhong-production-chat:rollback-before-web-call-f08b387`; symlink `current` da tro release moi; chi recreate `chat`, Chatmgt `3f2ef755c041`, bridge `d62dce7b5d00`, worker `2ba71cde63df`, ChatAPI `8476615ad4ac`, PostgreSQL/Redis/Coturn giu nguyen container ID.
- Commit/PR: `f08b387` (code fix; changelog deploy duoc ghi bo sung trong commit docs tiep theo).

## 2026-08-16-01 - On dinh ChatUI va loai hoi thoai rong

- Thoi gian: 2026-08-16 01:40 (Asia/Saigon)
- Loai: Sua loi | Web | Realtime | Kiem thu | Van hanh
- Trang thai: Da deploy production; chua UAT bang tai khoan trinh duyet that
- Muc tieu: Sua loi `Cannot read properties of null (reading 'seq')`, loai cac direct chat chua co noi dung khoi danh sach web va trien khai lai ma khong thay doi mobile.
- Pham vi: ChatUI web, phep chieu recall Tinode, giao diem metadata Chatmgt/Tinode, tai lieu kien truc va release ChatUI; giu nguyen mobile, database, Account SSO, Tinode topic/message va cac service khac.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/chatRealtime.test.js`, `src/features/chat/services/tinodeClient.js`, `src/features/chat/services/messagePolicy.js`, `src/features/chat/services/messagePolicy.test.js`, `src/features/chat/services/chatManagementService.test.js`, `docs/chat-backend-architecture.md`, `docs/CHANGELOG.md`.
- Noi dung: Recall `mode=self` loai message khoi phep chieu thay vi de `null` di vao buoc sap xep theo `seq`; sidebar chi hien direct conversation khi Tinode da co message hoac nguoi dung co draft, va bo qua metadata direct rong khi chon hoi thoai ban dau. Group va ViChat AI van hien; Chatmgt van giu ID/membership/topic mapping de mo lai cung cap direct tu danh ba.
- Quyet dinh ky thuat: Khong xoa cac row Chatmgt hoac topic Tinode vi Chatmgt khong so huu message content va khong the phan biet an toan row rong voi history dang tam thoi khong tai duoc. UI ket hop metadata duoc Chatmgt cho phep voi lich su Tinode da tai, dong thoi compact ket qua recall truoc moi truy cap sequence.
- Database/API/cau hinh: Khong migration, khong doi API/schema/bien moi truong.
- Kiem thu: Focused frontend `node --test src/features/chat/services/chatRealtime.test.js src/features/chat/services/messagePolicy.test.js src/features/chat/services/chatManagementService.test.js` dat 22/22; `npm run test:frontend` dat 68/68; `npm run lint` exit 0 voi warning legacy/vendor/worktree co san; `npm run build:production` dat; `git diff --check` dat. Production public `/healthz`, Chatmgt auth health va chatbot health deu HTTP 200; worker `/healthz` tra 200 voi `connected=true`; bundle `App-BmbMM6kb.js` co marker release; ChatUI/Chatmgt/bridge/worker khong co traceback/panic/fatal/critical/emerg trong 5 phut sau deploy.
- Rui ro con lai: Chua UAT giao dien bang browser dang nhap that do browser runtime tich hop khong khoi tao duoc; direct metadata khong co history Tinode se duoc mo lai tu Danh ba thay vi nam san trong sidebar.
- Viec tiep theo: Hard refresh web, dang nhap hai tai khoan Account that va smoke test direct chat, recall self/all, group, file/call; neu can rollback thi tro `current` ve release truoc va dung tag `songhong-production-chat:rollback-before-chatui-conversation-sync-20260816`.
- Van hanh: Hai lan gate chuyen thu truoc tu dong rollback an toan (mot lan do cu phap `grep` BusyBox, mot lan do public health race); lan cuoi dung retry lien tiep va chi cap nhat `current` sau khi health, bundle va container-preservation deu dat.
- Trien khai: Release `/opt/deploy/chat/releases/chatui-conversation-sync-20260816-014503`; image ChatUI `sha256:86d7ad8e0a7fa5de07d797e721dca8190efcfbf29fc85c94d883b73042d4de2c`, container `2823b6f73184`; rollback tag giu image cu `sha256:673f86e7b6af9456328f3212e5ac9ccef47be9b8f41d5ce4276f6d69fc57e659`; chi recreate `chat`, Chatmgt `3f2ef755c041`, bridge `d62dce7b5d00`, ChatAPI `8476615ad4ac`, hai PostgreSQL, Redis va Coturn giu nguyen container ID; symlink `current` da tro release moi; khong migration, reset volume, topic hay message.
- Commit/PR: `c972e57` (focused web/realtime fix; cac thay doi khac trong worktree khong nam trong commit nay).

## 2026-08-14-04 - Sua retry media protected tren ChatUI web

- Thoi gian: 2026-08-14 12:20 (Asia/Saigon)
- Loai: Sua loi | Web | Realtime | Kiem thu | Van hanh
- Trang thai: Da deploy production; chua UAT media voi tai khoan trinh duyet that
- Muc tieu: Khong de xem/tai file va anh dai dien tren web bi ket thuc loi khi token Tinode ngan han het han.
- Pham vi: ChatUI web protected media; giu nguyen mobile, Chatmgt, Tinode contract, database, chatbot va cac luong dang hoat dong.
- File da thay doi: `src/features/chat/services/tinodeClient.js`, `src/features/chat/services/mediaRetryPolicy.js`, `src/features/chat/services/mediaRetryPolicy.test.js`, `package.json`.
- Noi dung: Hop nhat request media cho avatar, xem file va tai file; khi relay tra `401/403`, web xin token Tinode moi qua provider da co va thu lai dung mot lan. `404`, loi mang va loi server khac khong retry.
- Quyet dinh ky thuat: Tach policy retry thanh helper pure de test duoc va khong lap request; khong doi cache, URL relay, auth contract hay session lifetime.
- Database/API/cau hinh: Khong migration, khong doi API/schema/bien moi truong.
- Kiem thu: `node --test src/features/chat/services/mediaRetryPolicy.test.js` dat 3/3; `npm run test:frontend` dat 66/66; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build:production` dat; `git diff --check` dat. Remote build lan dau dung lai an toan vi source local co export `messagePolicy` chua co trong snapshot production; build lai tu baseline production voi patch media toi thieu dat. Sau deploy: `https://chat.upgo.vn/healthz` 200, Chatmgt auth health 200, chatbot health 200, `vichat-ai.svg` 200/1081 bytes, media relay file thieu 403, Tinode WSS hello 201 voi STUN/TURN, container `chat` healthy, log 5 phut khong co traceback/panic/fatal/critical/emerg/error.
- Rui ro con lai: Chua UAT giao dien bang browser dang nhap that do browser runtime tich hop khong khoi tao duoc; file Tinode da bi xoa that van tra 404; chua co commit/PR cho worktree hien tai.
- Viec tiep theo: Hard refresh web, dang nhap tai khoan that va thu xem/tai mot file protected sau khi token het han; neu gap loi thi rollback tag `songhong-production-chat:rollback-before-chatui-media-retry-20260814` va tro `current` ve release truoc.
- Trien khai: Release `/opt/deploy/chat/releases/chatui-media-retry-20260814-1225`; image ChatUI `sha256:673f86e7b6af9456328f3212e5ac9ccef47be9b8f41d5ce4276f6d69fc57e659`, container `4e39ce527125`; rollback tag giu image cu `sha256:ce781b55c98a8f52dc484cad3a790c37fc320c0015b0dea165609d2d102bb080`; chi recreate `chat`, cac container Chatmgt/Tinode/worker/database/Redis/Coturn giu nguyen ID; symlink `current` da tro release moi.
- Commit/PR: Chua tao.

## 2026-08-14-03 - Tao local Q&A bridge cho Knowledge API va LLM

- Thoi gian: 2026-08-14 10:30 (Asia/Saigon)
- Loai: Tinh nang | API | Bao mat | Kiem thu | Tai lieu
- Trang thai: Hoan tat code, local model/API va public tunnel da smoke-test thanh cong; khong phai dich vu 24/7
- Muc tieu: Cho phep dich vu Knowledge/Q&A cua doi tac goi vao may Windows cua nguoi dung de nhan cau tra loi do LLM local sinh ra, khong deploy them len VPS.
- Pham vi: Local HTTP bridge `POST /api/ask`, contract request/response, token auth, Knowledge API adapter, Ollama/OpenAI-compatible local model adapter va huong dan chay workstation; khong thay doi Tinode production, Chatmgt production hay luong chat nhan vien.
- File da thay doi: `scripts/local_vichat_ai_api.py`, `scripts/start-local-vichat-api.ps1`, `scripts/start-local-vichat-llm.ps1`, `scripts/start-local-vichat-tunnel.ps1`, `scripts/allow-local-vichat-api-firewall.ps1`, `.env.local-ai-api.example`, `docs/local-ai-api.md`, `docs/chat-backend-architecture.md`, `.gitignore`, `chatservice-main/tests/test_local_vichat_ai_api.py`.
- Noi dung: Bridge chap nhan `question`, `query` hoac `message`, gui `message` va `top_k` toi Knowledge API, sau do dung model local (mac dinh Ollama `qwen2.5:1.5b`) de tong hop. Response tra ca `answer` va `reply`, kem `grounded` va nguon da gioi han. Token vao duoc chap nhan qua `X-Local-AI-Token`, `Authorization: Bearer` hoac `X-API-Key`; khong log token/API key. Tunnel launcher tu nhan ban `cloudflared` portable tai `D:\ViChatLocalAI\bin\cloudflared.exe` de truy cap tu ngoai LAN ma khong dua AI len VPS. Them launcher llama.cpp portable cho Qwen 1.5B tren o D va gioi han output token de tranh request treo. Huong dan Windows neu ro phai `Set-Location` vao repo truoc khi goi script.
- Quyet dinh ky thuat: Dung Python standard library de chay tren may Windows hien tai khong can them framework server; cho phep upstream tra answer san hoac chi tra sources; khong cho port 8000 public mac dinh va khong tu dong mo firewall.
- Database/API/cau hinh: Them file mau `.env.local-ai-api` (ignored) voi URL/key Knowledge, URL/model LLM, token vao va port 8000. Khong migration, khong them secret vao Git, khong deploy VPS.
- Kiem thu: `python -m py_compile scripts/local_vichat_ai_api.py chatservice-main/tests/test_local_vichat_ai_api.py` dat; `python -m unittest chatservice-main/tests/test_local_vichat_ai_api.py -v` dat 6/6; `python -m unittest discover -s chatservice-main/tests -q` dat 149 test, skip 47; HTTP contract test xac nhan token sai tra 401 va alias `query` tra `answer`/`reply`; probe Knowledge API that bang credential ngoai Git tra HTTP 200 voi 5 source va bridge chuan hoa `grounded=true`; cloudflared `2026.8.1` tao quick HTTPS tunnel va smoke request den `/api/ask` tra `answer`/`reply` sau khi xac thuc token; llama.cpp health `200`, OpenAI-compatible local completion `200`, va public ngrok POST tra `200` voi 5 source/answer.
- Rui ro con lai: Cac cua so llama-server, bridge va ngrok phai cung duoc giu mo; quick-tunnel URL doi moi lan khoi dong va khong co uptime bao dam; model CPU tra loi co the mat khoang 18 giay/cau; named tunnel/domain can cau hinh Cloudflare rieng.
- Viec tiep theo: Moi phien bat `scripts/start-local-vichat-llm.ps1`, `scripts/start-local-vichat-api.ps1` va ngrok; gui URL tunnel moi cung local token cho doi tac. Neu can URL co dinh, cau hinh named tunnel/domain.
- Commit/PR: Chua tao.

## 2026-08-14-02 - Trien khai ViChat AI retrieval-only len production

- Thoi gian: 2026-08-14 02:06 (Asia/Saigon)
- Loai: Tinh nang | Bao mat | Web | Mobile | Van hanh | Kiem thu | Tai lieu
- Trang thai: Da deploy production; chua UAT chat tu tai khoan trinh duyet/mobile
- Muc tieu: Dua ban ViChat AI co nguon vao production, dung Knowledge AI retrieval-only qua ranh gioi server-side.
- Pham vi: Chatmgt provider adapter, Tinode chatbot worker, ChatUI/mobile chatbot surface, production Compose/Dockerfile va cau hinh display; khong migration, khong reset database/volume/topic/message, khong doi auth/SSO, chat nhan vien, group, file, call hay Workspace.
- Quyet dinh ky thuat: Tao release bat bien tu snapshot production `05004d6`, backup env/database/container state truoc recreate, chi cap nhat endpoint Knowledge AI, header `X-API-Key`, request mode retrieval, API key server-side va nhan dien `ViChat AI`; giu nguyen cac secret runtime khac.
- Bao mat: Provider nhan toi thieu `message` va `top_k`; khong gui API key, lich su, conversation ID, danh tinh nhan vien hay context noi bo; archive deploy khong chua `.env`, key, `.git`, `node_modules` hoac `dist`.
- Kiem thu local snapshot: `npm run test:frontend` 60/60; `npm run lint` exit 0 (warning legacy/vendor); `npm run build:production` dat; backend `python -m unittest discover -s chatservice-main/tests -q` 136 test, skip 45; `py_compile` dat; mobile typecheck/lint dat; focused Vitest 3/3; `git diff --check` dat truoc build artifact; Compose config voi env production hien tai dat.
- Kiem thu production: Release `/opt/deploy/chat/releases/vichat-ai-20260814-020607`; `https://chat.upgo.vn/healthz` HTTP 200; public chatbot health bao `enabled=true`, `provider_configured=true`, `request_mode=knowledge-retrieval`; worker `/healthz` `status=ok`, `connected=true`; Knowledge AI probe tu container HTTP 200 voi 5 source; avatar `/vichat-ai.svg` HTTP 200/1081 bytes; bundle co marker `ViChat AI` va `vichat-ai`; image/container: `chatmgt` `sha256:49b210041f9f765ee8cf20cbfe841dc1fe2cb9ba7dc4b86201e235578b9d1db2` / `3f2ef755c041`, worker `sha256:6b6790f3e38f42277ed8dfee28cca35c7316216dc45b1d4eeb7c385e33af2797` / `2ba71cde63df`, ChatUI `sha256:ce781b55c98a8f52dc484cad3a790c37fc320c0015b0dea165609d2d102bb080` / `df79997bf387`; backup `/opt/deploy/chat/backups/vichat-ai-20260814-020607` gom env mode `600`, runtime va `chat-postgres.dump` 92421 bytes; rollback tags da tao cho ba image. Chatmgt, worker va ChatUI logs 5 phut sau deploy khong co traceback/panic/fatal/critical/emerg/error.
- Rui ro con lai: Browser runtime khong co san nen chua UAT dang nhap cau co nguon/cau khong co nguon tren web/mobile; can hard refresh va smoke test cac luong chat khac.
- Viec tiep theo: Hard refresh va UAT mot cau co nguon, mot cau khong co nguon tren tai khoan that web/mobile; neu health gate loi, tro `current` ve release `05004d6` va khoi phuc env backup; khong xoa volume/database/topic/message.

## 2026-08-14-01 - Thay chatbot cu bang trai nghiem ViChat AI co nguon

- Thoi gian: 2026-08-14 00:43 (Asia/Saigon)
- Loai: Tinh nang | Giao dien | API | Bao mat | Web | Mobile | Kiem thu | Tai lieu
- Trang thai: Hoan tat code va kiem thu local; chua deploy/UAT voi tai khoan va API key production
- Muc tieu: Thay nhan dien chatbot Song Hong cu bang ViChat AI dong nhat, de tra cuu tri thuc de dung va de kiem chung tren ca web/mobile ma khong doi cac luong chat khac.
- Pham vi: Chatbot UI/service web, UI Tinode mobile, metadata nguon qua worker/Chatmgt, cau hinh hien thi va tai lieu; khong sua auth/SSO, chat nhan vien 1-1, nhom, file, call, Workspace, schema database hoac Tinode topic/message ownership.
- File da thay doi: `public/vichat-ai.svg`, `scripts/build-production.mjs`, `src/app/App.jsx`, `src/styles/index.css`, `src/features/chatbot/`, `src/features/chat/services/tinodeClient.js`, `chatservice-main/application/services/chatbot_service.py`, `chatservice-main/application/controllers/api_chatbot.py`, `chatservice-main/application/services/chat_manager_service.py`, `chatservice-main/application/services/tinode_chatbot_service.py`, `chatservice-main/scripts/tinode_chatbot_webhook.py`, `chatservice-main/knowledge/songhong-default.json`, cac test chatbot, `mobile/src/store/appStore.ts`, `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/components/MessageBubble.tsx`, `mobile/src/services/tinodeClient.ts`, `mobile/src/types/index.ts`, cac env/Compose/Dockerfile example, `docs/chat-backend-architecture.md` va muc nhat ky nay.
- Noi dung: Doi bot mac dinh thanh `ViChat AI` voi ID client `vichat-ai`, avatar rieng, mo ta tro ly tri thuc, man hinh chao, ba cau hoi goi y, strip trang thai rieng tu/nguon, composer rieng va giao dien answer card tren web/mobile. Xoa component `KnowledgeManager` va cac ham CRUD knowledge legacy khoi frontend. Retrieval reply nay tom tat cac snippet theo thu tu, khong lap nhan nguon trong text; source card hien title/snippet rieng. Chatmgt luu `grounded`/`sources` voi history, worker gui toi da nam source da cat gon qua Tinode header de web va mobile render nhat quan, ke ca khi replay duplicate. Production build defaults cung dung ViChat AI; history API va localStorage doc alias `bot-songhong` khi key moi chua co du lieu de khong an lich su fallback cu.
- Quyet dinh ky thuat: Giu Knowledge AI la retrieval-only va khong gia lap cau tra loi generative khi khong co tai lieu; truong hop khong match yeu cau user bo sung tu khoa. Chi metadata trinh bay co gioi han di qua Tinode header; API key, danh tinh nhan vien, lich su rieng, conversation ID va context noi bo van khong gui toi provider. Tinode UID runtime van do server cap, con `vichat-ai` chi la ID UI/fallback on dinh.
- Database/API/cau hinh: Khong migration/schema va khong them endpoint. Response webhook/fallback bo sung `sources` va `grounded`; history properties luu cung metadata. Dong bo defaults `TINODE_CHATBOT_DISPLAY_NAME=ViChat AI`, title, avatar public va fallback message; production van phai dien `CHATBOT_API_KEY` trong secret `.env` ngoai Git, khong co secret nao duoc ghi vao source/nhat ky.
- Kiem thu: `npm run test:frontend` dat 63/63; `npm run lint` exit 0 voi warning legacy/vendor/worktree co san; `npm run build:production` dat; `python -m unittest chatservice-main/tests/test_chatbot_webhook_provider.py chatservice-main/tests/test_tinode_chatbot_webhook.py -v` dat 18/18; `python -m unittest discover -s chatservice-main/tests -q` dat 143 test, skip 47; `python -m py_compile chatservice-main/application/services/chatbot_service.py chatservice-main/application/controllers/api_chatbot.py chatservice-main/scripts/tinode_chatbot_webhook.py` dat; mobile `npm run typecheck` va `npm run lint` dat; `mobile/npx vitest run src/utils/mediaUrl.test.ts` dat 3/3; production Compose `config --no-interpolate -q` dat; `node --check scripts/build-production.mjs` va `git diff --check` dat.
- Rui ro con lai: Chua co production `CHATBOT_API_KEY` trong workspace, chua UAT response that tren hai tai khoan web/mobile va chua xac minh truc quan tren browser dang nhap production. Retrieval-only van chi tong hop snippet tim duoc, khong thay the mot LLM suy luan tong quat.
- Viec tiep theo: Dien secret Knowledge AI trong `.env` production mode `0600`, rebuild/recreate `chatmgt`, `tinode-chatbot-webhook` va ChatUI, cai lai mobile neu muon nhan UI moi; sau do UAT mot cau co nguon, mot cau khong co nguon va kiem tra nhanh direct/group/file/call khong doi.
- Commit/PR: Chua tao.

## 2026-08-13-09 - Ket noi Knowledge AI retrieval cho chatbot web va mobile

- Thoi gian: 2026-08-13 17:23 (Asia/Saigon)
- Loai: Tinh nang | Sua loi | API | Bao mat | Web | Mobile | Kiem thu | Tai lieu
- Trang thai: Hoan tat code va kiem thu local; chua deploy/UAT noi dung AI voi API key production
- Muc tieu: Lam cho tro ly AI dung dung endpoint Knowledge AI dang chay, thay vi goi hostname cu tra `404`, dong thoi giu mot hop dong chung cho web va mobile qua Tinode/Chatmgt.
- Pham vi: Chatmgt provider adapter, health/config contract, production va local Compose/env example, tai lieu API/kien truc, regression tests; giu nguyen UI Chatbot, Tinode worker, tenant mapping, history/idempotency, chat nhan vien, file, call va database schema.
- Noi dung: Xac minh thuc te `knowledge.gonapp.net/api/v1/chat` tra `404`, con `knowledge-ai.gonapp.net/api/v1/chat` tra `401` va OpenAPI cong khai xac nhan day la API retrieval-only yeu cau `X-API-Key`, nhan `{message, top_k}` va tra `sources[].snippet`. Them `CHATBOT_EXTERNAL_REQUEST_MODE=knowledge-retrieval`; adapter server-side bat buoc `CHATBOT_API_KEY`, gui payload toi thieu khong kem user/history/conversation ID, gioi han `top_k` 1-20, chuan hoa snippets thanh reply co nguon cho ca fallback HTTP va Tinode worker. Health hien thi request mode va provider readiness; key khong bao gio vao browser/mobile.
- Quyet dinh ky thuat: Khong gia lap truong `reply` ma Knowledge AI khong co; hien thi snippets co nhan nguon de bao toan tinh trung thuc retrieval-only. Cac mode external webhook cu van duoc giu tuong thich khi `CHATBOT_EXTERNAL_REQUEST_MODE=chat`; local KnowledgeService va external partner data API khong bi xoa.
- Database/API/cau hinh: Khong migration/schema. Doi mac dinh URL sang `https://knowledge-ai.gonapp.net/api/v1/chat`, header `X-API-Key`, request mode retrieval trong `infrastructure/production/compose.yaml`, `infrastructure/chatservice/compose.yaml` va cac env example. Production `.env` that khong nam trong workspace; can dien key Knowledge AI server-side truoc khi recreate Chatmgt/worker.
- Kiem thu: Probe DNS/HTTPS: hostname cu `404`, hostname moi `401` khi thieu key; `openapi.json` `200`, xac nhan schema/response retrieval-only. `python -m unittest chatservice-main/tests/test_chatbot_webhook_provider.py chatservice-main/tests/test_external_chatbot_contract.py chatservice-main/tests/test_tinode_chatbot_webhook.py -v` dat 23/23; `python -m unittest discover -s chatservice-main/tests -q` dat 142 test, skip 47; `npm run test:frontend` dat 60/60; `mobile/npm run typecheck` dat; `mobile/npm run lint` dat; `docker compose -f infrastructure/production/compose.yaml config --no-interpolate -q` dat; Compose local dat; `python -m py_compile ...`, `node --check scripts/debug_call_signaling.mjs` va `git diff --check` dat.
- Rui ro con lai: Chua co `CHATBOT_API_KEY` production trong workspace nen chua goi duoc API moi voi credential that, chua xac minh chat answer tren hai tai khoan web/mobile, va chua UAT worker Tinode reconnect/push. Retrieval-only khong tu sinh cau tra loi generative; neu muon cau tra loi tu nhien can them LLM provider server-side sau nay.
- Viec tiep theo: Dien key trong secret manager/.env `0600`, recreate rieng `chatmgt` va `tinode-chatbot-webhook`, kiem tra `/api/v1/chatbot/health` bao `enabled=true`/`provider_configured=true`, sau do UAT mot cau hoi co tai lieu va mot cau hoi khong co tai lieu tren web + mobile. Khong commit secret, khong deploy cac service khac.
- Commit/PR: Chua tao.

## 2026-08-13-08 - Dong goi APK day du sau sua media protected mobile

- Thoi gian: 2026-08-13 16:52 (Asia/Saigon)
- Loai: Phat hanh noi bo | Mobile | Kiem thu | Tai lieu
- Trang thai: Hoan tat APK tu ma hien tai va kiem tra tinh toan ven; chua UAT hai tai khoan that
- Muc tieu: Tao lai APK arm64 sau bo sung retry Tinode token cho protected media mobile, de ban cai thu nghiem chua day du cac sua loi mute/xoa, recall anh, xem anh, avatar va voice/video call thay vi dung artifact build truoc thay doi moi nhat.
- Pham vi: Expo Android prebuild, Gradle release arm64, artifact `outputs/vichat-mobile/ViChat-1.0.11-full-fixes-arm64.apk` va nhat ky; khong sua them logic production, khong ghi de APK cu, khong cham cac thay doi `dist/`, file phan tich hoac worktree phu.
- Noi dung: Tao lai native Android tu `mobile/app.json`, xac nhan manifest sinh ra co ca camera va micro, build release arm64 tu worktree hien tai, sau do sao chep thanh artifact moi co ten rieng. APK chua cac thay doi retry protected image/file `401/403` moi nhat cung toan bo sua loi cross-client da duoc ghi tai cac muc truoc.
- Quyet dinh ky thuat: Giu version `1.0.11`/code `12` vi khong thay doi contract phat hanh ke tu artifact truoc; artifact dung Android Debug signer chi de cai thu nghiem noi bo. Khong commit TURN credential, khong them STUN public fallback va khong tuyen bo call production hoan tat truoc UAT hai mang.
- Database/API/cau hinh: Khong migration, khong doi endpoint/schema/cau hinh trong buoc dong goi nay.
- Kiem thu: Truoc build, `npm run test:frontend` dat 60/60; `python -m unittest discover -s chatservice-main/tests -q` dat 138 test, skip 47; `mobile/npm run typecheck` dat; `mobile/npm run lint` dat; focused mobile Vitest 5 file/16 test dat; `git diff --check` dat. Trong buoc dong goi, `npx expo prebuild --platform android --no-install` dat; Gradle `app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon --offline` sinh APK `47,713,444` byte; `aapt` xac nhan package `vn.upgo.vichat`, version `1.0.11`/code `12`, min SDK 24, target SDK 36, ABI `arm64-v8a`, quyen `CAMERA` va `RECORD_AUDIO`; `apksigner verify --verbose --print-certs` dat APK Signature Scheme v2 voi Android Debug signer; `zipalign -c -v 4` dat; SHA-256 `E6E8052928FCBC487C8786E7AB0E55E388E26F3B62753A8F075A3E9668A82F7D`.
- Rui ro con lai: Chua cai APK tren thiet bi that va chua UAT hai tai khoan Web-Mobile tren hai mang cho voice/video hai chieu, TURN, mute/xoa, recall `self`/`all`, protected media va avatar. Push khi app bi kill van phu thuoc Firebase/APNs va Tinode provider; APK arm64/debug signer khong phai artifact Play Store.
- Viec tiep theo: Cai artifact moi tren Android arm64, cap quyen camera/micro va chay checklist UAT bat buoc; chi commit/push/deploy khi duoc phep.
- Commit/PR: Chua tao.

## 2026-08-13-07 - Bo sung retry token media mobile va chot kiem thu local

- Thoi gian: 2026-08-13 15:58 (Asia/Saigon)
- Loai: Sua loi | Media | Mobile | Realtime | Kiem thu
- Trang thai: Hoan tat code va kiem thu local; chua UAT hai tai khoan that
- Muc tieu: Khong de anh/file protected tren mobile tiep tuc loi khi Tinode token ngan han da het han, dong thoi ghi nhat ket qua kiem thu thuc te cua toan bo nhom sua loi mute/xoa, recall, avatar va call.
- Pham vi: `mobile/src/services/tinodeClient.ts`, `mobile/src/utils/mediaRetryPolicy.ts` va test retry tai media mot lan sau khi download bi tu choi `401/403`, cap nhat tai lieu kien truc/changelog; giu nguyen hop dong Tinode, Chatmgt, database, chatbot va cac artifact `dist/` co san.
- Noi dung: Mobile dung `tokenProvider` de lay Tinode token moi, cap nhat auth token trong SDK, roi thu lai cung URL protected media mot lan. Loi mang, file khong ton tai hoac ma HTTP khac van duoc tra ve nhu cu; cache key van tach theo token/version de khong hien anh cu sau khi doi avatar.
- Quyet dinh ky thuat: Retry chi xay ra voi `401/403` va toi da mot lan, tranh vong lap/lam cham cac loi khac. ICE/TURN van lay tu Tinode, khong them STUN fallback cong cong.
- Database/API/cau hinh: Khong migration, khong doi endpoint hay schema.
- Kiem thu: `npm run test:frontend` dat 60/60; `python -m unittest discover -s chatservice-main/tests -q` dat 138 test, skip 47; `mobile/npm run typecheck` dat; `mobile/npm run lint` dat; focused mobile Vitest 5 file/16 test dat; `node --check scripts/debug_call_signaling.mjs` dat; `git diff --check` dat.
- Rui ro con lai: Chua UAT hai tai khoan Web-Mobile tren hai mang, chua xac minh media retry voi HTTP 401/403 tu thiet bi that; full `mobile/npm test` van co test legacy `workspaceService.test.ts` khong parse Flow trong `react-native/index.js`.
- Viec tiep theo: Cai APK `1.0.11`, dang nhap hai tai khoan va UAT mute/xoa/recall anh/avatar va audio-video hai chieu; chi deploy khi duoc phep.
- Commit/PR: Chua tao.

## 2026-08-13-06 - Dong bo recall self va don notification call foreground

- Thoi gian: 2026-08-13 15:35 (Asia/Saigon)
- Loai: Sua loi | Realtime | Web | Mobile | Kiem thu
- Trang thai: Hoan tat code va kiem thu local; chua UAT hai tai khoan that
- Muc tieu: Bao dam `Thu hoi phia toi` tren web bien mat ngay va khong bi placeholder optimistic giu lai trong luc cho snapshot Tinode; dong thoi don notification cuoc goi neu invite den khi mobile da foreground.
- Pham vi: State ChatUI sau khi Tinode xac nhan recall `self`, cleanup notification call foreground tren mobile, regression test va nhat ky; khong thay doi event recall, message publish, recall `all`, backend, database, chatbot hay cac artifact `dist/` co san.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatManagementService.test.js`, `mobile/src/services/notificationService.ts`, `docs/CHANGELOG.md`.
- Noi dung: Sau khi publish event `mode=self` thanh cong, ChatUI loai tin theo ca `id` va `seq`, cap nhat preview/thoi gian cuoc tro chuyen tu tin con lai va dung lai nhanh xu ly. `mode=all` van giu placeholder `Tin nhan da duoc thu hoi`; snapshot Tinode tiep tuc la nguon chuan cho cac lan dong bo sau. Mobile cung don notification cuoc goi cung topic/sequence neu invite den dung luc app da active, tranh de thong bao OS treo sau khi overlay foreground da hien.
- Quyet dinh ky thuat: Chi optimistic-remove sau khi Tinode da xac nhan, khong an truoc request de tranh mat tin khi publish that bai. Khong doi materializer hay contract recall cross-client.
- Database/API/cau hinh: Khong co.
- Kiem thu: `npm run test:frontend` dat 60/60; `python -m unittest discover -s chatservice-main/tests -q` dat 138 test, skip 47; mobile `npm run typecheck` dat; mobile `npm run lint` dat; focused mobile Vitest 4 file/14 test dat; `node --check scripts/debug_call_signaling.mjs` dat; `git diff --check` dat. Root lint/build va APK da co ket qua tai muc `2026-08-13-05`; khong chay lai build de giu nguyen artifact `dist/` co san cua nguoi dung.
- Rui ro con lai: Chua UAT hai Account tren web-mobile de quan sat recall anh/tin nhan thuc te va snapshot cross-client.
- Viec tiep theo: Cai APK `1.0.11`, deploy web/backend hien tai neu duoc phep, sau do UAT mute/xoa/recall/media/avatar va audio-video hai chieu.
- Commit/PR: Chua tao.

## 2026-08-13-05 - Khoi phuc quyen micro Android va chot APK goi dien 1.0.11

- Thoi gian: 2026-08-13 14:48 (Asia/Saigon)
- Loai: Sua loi | Mobile | Phat hanh | Kiem thu | Tai lieu
- Trang thai: Hoan tat code, cau hinh va APK test noi bo; chua UAT hai tai khoan that
- Muc tieu: Bao dam ban Android phat hanh co quyen micro/camera that de voice/video call co the khoi tao media, dong thoi chot lai cac sua loi mute/xoa, recall/media web-mobile va avatar ma khong thay doi luong chat/chatbot dang on dinh.
- Pham vi: Native Android generated manifest va phien ban mobile, APK arm64, kiem thu web/mobile/backend, tai lieu release; giu nguyen message publish, chatbot, database/schema va cac thay doi `dist/`/artifact co san cua nguoi dung.
- File da thay doi: `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`, generated `mobile/android/app/src/main/AndroidManifest.xml`, `mobile/README.md`, `docs/chat-backend-architecture.md`, va `docs/CHANGELOG.md`; APK `outputs/vichat-mobile/ViChat-1.0.11-call-permissions-arm64.apk`.
- Noi dung: Phat hien APK `1.0.10` bi generated native manifest cu ghi de `android.permission.RECORD_AUDIO` bang `tools:node=\"remove\"`, nen JavaScript/WebRTC van chay nhung Android khong the cap micro. Da chay lai Expo prebuild de materialize ca `CAMERA` va `RECORD_AUDIO`, tang mobile len `1.0.11`/Android `versionCode=12`, va tao APK arm64 co du hai quyen. Cac ban sua truoc do van giu dung pham vi: thao tac mute/xoa dung Chatmgt `managementId`, recall web loc message `null` truoc sort, Tinode media web refresh token mot lan khi `401/403`, avatar chi thanh cong khi Account xac nhan dung URL upload, va call mobile don timeout/notification trung.
- Quyet dinh ky thuat: `mobile/app.json` la nguon khai bao native; truoc moi Android release phai prebuild va kiem tra quyen trong APK, khong tin vao thu muc generated bi ignore. Khong them STUN public fallback va khong gia lap killed-state push; ICE/TURN Tinode va credential Firebase/APNs/provider van la dieu kien production.
- Database/API/cau hinh: Khong migration/schema. Mobile version `1.0.11`, Android `versionCode=12`; APK package `vn.upgo.vichat`, ABI `arm64-v8a`. Bien `ACCOUNT_AVATAR_UPLOAD_TIMEOUT=60`, `VITE_CALLS_ENABLED=true`, `EXPO_PUBLIC_CALLS_ENABLED=true` va production call defaults da duoc dong bo trong cac file example/Compose cua cung worktree; can rebuild/redeploy Chatmgt/web va cai APK moi de production nhan thay doi.
- Kiem thu: `python -m unittest discover -s chatservice-main/tests -q` dat 138 test, skip 47; `python -m py_compile ...` va `node --check scripts/debug_call_signaling.mjs` dat; `npm run test:frontend` dat 59/59; root `npm run lint` exit 0 voi warning legacy/vendor/worktree co san; `npm run build:production` dat; Compose `config --no-interpolate -q` dat; mobile `npm run typecheck` va `npm run lint` dat; focused Vitest 4 file/14 test dat; tat ca 9 file Vitest khong phu thuoc React Native runtime dat 24/24. Full `mobile/npm test` van fail rieng `src/services/workspaceService.test.ts` do Rolldown khong parse Flow trong `react-native/index.js`, 24 test con lai dat. APK build arm64 truoc buoc chot nay dat `BUILD SUCCESSFUL in 7m 17s`; `aapt` xac nhan version `1.0.11`/code `12`, ABI `arm64-v8a`, `CAMERA` va `RECORD_AUDIO`; `apksigner verify --verbose --print-certs` dat APK Signature Scheme v2 voi Android Debug signer; `zipalign -c -v 4` dat; SHA-256 `6C3D278D5A7795EB218775211DB5A6AFFA647485719FF47DE383E6EDEFF179FD`; `git diff --check` dat.
- Rui ro con lai: Chua deploy worktree hien tai; chua cai APK/kiem tra micro-camera tren thiet bi; chua UAT hai Account Web-Mobile cho mute, xoa, recall anh, xem anh, avatar va audio/video hai chieu. TURN can duoc test tren hai mang va firewall can mo TCP/UDP `3478`, UDP `49160-49200`; push khi app bi kill van can Firebase/APNs va Tinode provider. APK chi co arm64 va dung debug signer, khong phai artifact Play Store.
- Viec tiep theo: Cai APK `1.0.11` tren Android arm64, cap quyen micro/camera va UAT bang hai tai khoan that; sau do commit/push/deploy tung service dung pham vi va xac minh production. Khong tuyen bo voice/video call hoan tat truoc khi audio/video hai chieu va TURN qua hai mang dat.
- Commit/PR: Chua tao.

## 2026-08-13-04 - Chot edge case cuoc goi nen va cap nhat kiem thu

- Thoi gian: 2026-08-13 13:32 (Asia/Saigon)
- Loai: Sua loi | Realtime | Mobile | Cau hinh | Kiem thu | Tai lieu
- Trang thai: Hoan tat code va kiem thu local; chua UAT tai khoan that
- Muc tieu: Bao dam notification cuoc goi khong mo lai invite da het han, khong tang bo nho vo han, va overlay cuoc goi co the duoc xu ly khi app dang khoa PIN.
- Pham vi: Mobile incoming-call notification/call overlay, call diagnostic script, tai lieu kien truc; khong thay doi message publish, chatbot, schema hoac cac thay doi san co trong `dist/`.
- File da thay doi: `mobile/src/utils/callNotificationPolicy.ts`, `mobile/src/utils/callNotificationPolicy.test.ts`, `mobile/src/services/notificationService.ts`, `mobile/src/components/MobileCallOverlay.tsx`, `mobile/App.tsx`, `scripts/debug_call_signaling.mjs`, `docs/chat-backend-architecture.md`, va `docs/CHANGELOG.md`.
- Noi dung: Dong bo TTL notification voi timeout setup WebRTC 40 giay; notification het han va tombstone deu tu dong don sau TTL; thong bao script neu khong co peer token se dung phien thu hai cung sender token; dua CallOverlay len tren AppLockScreen de thao tac accept/reject khong bi khoa man hinh.
- Quyet dinh ky thuat: Chi cho phep route notification con han qua Tinode reconnect va call store; khong gia lap push killed-state. `VICHAT_TINODE_PEER_TOKEN` la tuy chon cho probe publish, khong bat buoc neu dung cung sender token.
- Database/API/cau hinh: Khong migration/schema/API. Them `VITE_CALLS_ENABLED=true` vao `.env.local` bi ignore de web dev hien nut goi, khong thay doi cac endpoint local va khong dua file vao Git. Production van can `VITE_CALLS_ENABLED=true`, `EXPO_PUBLIC_CALLS_ENABLED=true`, `WEBRTC_ENABLED=true`, ICE/TURN va credential push ngoai repo.
- Kiem thu: `npm run test:frontend` dat 59/59; `npm run lint` exit 0 voi warning legacy/vendor/worktree co san; frontend build tam voi `VITE_CALLS_ENABLED=true` dat va da don artifact, khong cham `dist/`; `mobile/npm run typecheck` dat; `mobile/npm run lint` dat; `mobile/npx vitest run src/utils/callNotificationPolicy.test.ts src/utils/tinodeState.test.ts src/utils/messagePolicy.test.ts src/utils/mediaUrl.test.ts` dat 4 file/14 test; `python -m unittest discover -s chatservice-main/tests -q` dat 137 test, skip 46; `python -m py_compile ...` dat; `bash -n infrastructure/production/start.sh` dat; Compose `config --no-interpolate -q` dat; `node --check scripts/debug_call_signaling.mjs` dat; hello probe production tra `201` va 2 ICE server, credential da redact. Browser UAT chua chay duoc vi runtime khong co browser kha dung; khong build APK moi trong lan nay.
- Rui ro con lai: `mobile/npm test` full van fail duy nhat `src/services/workspaceService.test.ts` do Rolldown khong parse Flow trong `react-native/index.js`, nhung 24 test con lai dat; chua UAT hai tai khoan Web-Mobile, permission media, TURN qua hai mang, avatar/recall/mute/xoa; push khi app bi kill phu thuoc Firebase/APNs va Tinode provider.
- Viec tiep theo: Cai/rebuild APK neu can va UAT hai tai khoan tren web/mobile; khong tuyen bo killed-state push hoat dong truoc khi cap credential/provider.
- Commit/PR: Chua tao.

## 2026-08-13-03 - Sua dong bo recall/media, avatar va cuoc goi nen

- Thoi gian: 2026-08-13 12:44 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | API | Realtime | Mobile | Ha tang | Kiem thu | Tai lieu
- Trang thai: Hoan tat code va kiem thu local; chua UAT hai tai khoan that tren hai mang
- Muc tieu: Lam cho thu hoi tin nhan/anh phan hoi dung giua web-mobile, avatar xac nhan dung anh moi, cuoc goi khong tu ngat sau khi ket noi, va thao tac mute/xoa dung ID Chatmgt authoritative.
- Pham vi: `src/features/chat/services/`, `mobile/src/store/`, `mobile/src/services/`, `mobile/src/utils/`, `mobile/App.tsx`, Account SSO avatar service/config, production Compose/env example, diagnostic script va tai lieu; khong doi schema, Tinode message publish, chatbot hay cac thay doi san co trong `dist/`.
- File da thay doi: `src/features/chat/services/messagePolicy.js`, `src/features/chat/services/messagePolicy.test.js`, `src/features/chat/services/tinodeClient.js`, `mobile/src/store/callStore.ts`, `mobile/src/store/appStore.ts`, `mobile/src/services/notificationService.ts`, `mobile/src/utils/callNotificationPolicy.ts`, `mobile/src/utils/callNotificationPolicy.test.ts`, `mobile/App.tsx`, `chatservice-main/application/services/account_sso_service.py`, `chatservice-main/application/config/config.py`, `chatservice-main/tests/test_account_sso_service.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `infrastructure/production/compose.yaml`, `infrastructure/production/.env.example`, `.env.example`, `mobile/.env.example`, `scripts/debug_call_signaling.mjs`, `docs/chat-backend-architecture.md`, va `docs/CHANGELOG.md`.
- Noi dung: Web recall projection loc `null` truoc khi sort va dung helper pure de khong lam vo danh sach khi recall self; media relay thu lai mot lan sau `401/403` bang Tinode token moi; mobile xoa setup timer khi WebRTC connected va bo qua invite trung cung topic/sequence. Mobile them kenh local notification uu tien cao cho incoming call khi runtime con song, payload duoc validate, tap notification se reconnect va mo cung call store foreground. Mobile mute nay gui `managementId` thay vi state id.
- Quyet dinh ky thuat: Khong dung STUN Google fallback; ICE/TURN production tu hello Tinode van la nguon chuan. Notification killed-state chi duoc coi la kha dung khi co du credential Firebase/APNs va Tinode push provider; code local nay khong gia lap push server. Avatar chi thanh cong khi Account xac nhan dung URL upload; neu `/current_user` stale thi doc lai `/me` mot lan, khong chap nhan avatar cu.
- Database/API/cau hinh: Khong migration/schema. Them `ACCOUNT_AVATAR_UPLOAD_TIMEOUT` (mac dinh 60 giay) cho upload Account; dong bo vi du `VITE_CALLS_ENABLED=true` va `EXPO_PUBLIC_CALLS_ENABLED=true`. Them `scripts/debug_call_signaling.mjs`; probe mac dinh chi hello, redact TURN credential, publish chi khi set token/topic va co co `VICHAT_CALL_DEBUG_PUBLISH=true`.
- Kiem thu: Ket qua ban dau cua muc nay la `npm run test:frontend` 58/58; lan chot 2026-08-13-04 cap nhat lai thanh 59/59 trong muc moi nhat. `npm run lint` exit 0 voi warning legacy/vendor/worktree co san; `mobile/npm run typecheck` dat; focused mobile Vitest 4 file/14 test dat; `mobile/npm test` chua dat do test cu `workspaceService.test.ts` khong parse Flow trong `react-native/index.js`, 24 test con lai dat; `python -m unittest discover -s chatservice-main/tests -q` dat 137 test, skip 46; `python -m py_compile ...` dat; `npm run build:production` dat; `bash -n infrastructure/production/start.sh` dat; Compose `config --no-interpolate -q` dat; `git diff --check` dat; `node scripts/debug_call_signaling.mjs` probe hello production tra 2 ICE server va da redact credential.
- Rui ro con lai: Chua co browser runtime/UAT hai tai khoan that Web-Mobile; probe TCP TURN tu mang phat trien truoc do timeout, can test hai mang that va mo firewall nha cung cap neu can. Push khi app bi kill van phu thuoc credential/provider ngoai repo. `dist/` va cac artifact/untracked cua nguoi dung duoc giu nguyen.
- Viec tiep theo: Cai APK/rebuild native neu can, dang nhap hai tai khoan tren web va mobile, test mute/xoa/recall anh/avatar va voice/video tren hai mang; sau do deploy Chatmgt/Web bundle theo quy trinh release neu muon dua code len production.
- Commit/PR: Chua tao.

## 2026-08-13-02 - Dong bo thao tac chat, avatar va WebRTC production

- Thoi gian: 2026-08-13 09:46 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Realtime | Mobile | Ha tang | Van hanh | Tai lieu
- Trang thai: Da commit/push va deploy production; chua UAT bang tai khoan that
- Muc tieu: Dua dung cac ban sua mute, xoa phia toi, recall/media, avatar va voice/video call len web/mobile ma khong thay doi luong gui nhan tin dang on dinh.
- Pham vi: ChatUI materializer, mobile call cleanup, Tinode Account bridge, production Compose/env, deployment verifier va tai lieu kien truc; khong migration, khong sua database, chatbot worker, bridge auth, topic/message publish hoac push provider.
- File da thay doi: `src/features/chat/services/tinodeClient.js`, `mobile/src/store/callStore.ts`, `chatservice-main/scripts/tinode_account_bridge.py`, `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/tests/test_tinode_account_bridge.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `infrastructure/production/.env.example`, `infrastructure/production/compose.yaml`, `docs/chat-backend-architecture.md`, va `docs/CHANGELOG.md`.
- Noi dung: Web recall `self` an hoan toan tin goc nhu mobile; mobile dung ca remote media stream khi ket thuc cuoc goi. Tinode trung tam hien tra hello khong co `iceServers`, nen bridge doc file runtime ICE/TURN mode bao mat va chi bo sung vao hello khi upstream bo trong; verifier production nay tu choi release neu public hello van thieu ICE/TURN. Production defaults bat call UI/WebRTC va bridge mount runtime cung release. Kiem tra production truoc sua xac nhan web dang chay bundle cu, route `/self` chua co, trong khi upload service Account van tra URL anh hop le.
- Quyet dinh ky thuat: Khong sua Tinode trung tam va khong dua TURN credential vao bundle/mobile config; relay chi bo sung metadata hello, con moi packet login/message/presence/call sau do van proxy nguyen trang. Khong thay sentinel mute `0`. Avatar tiep tuc lay UpGO Account lam nguon chuan; khong tao kho anh hay fallback du lieu moi.
- Database/API/cau hinh: Khong migration. Them `TINODE_BRIDGE_ICE_SERVERS_FILE` noi bo va mount `./runtime` read-only cho `tinode-account-bridge`; giu endpoint `DELETE /api/v1/conversation/<id>/self` tu commit `9279aa9`. Release can ke thua private `.env`, `runtime/tinode-bootstrap.json` va `runtime/ice-servers.json`; khong ghi secret vao Git.
- Kiem thu: `npm run test:frontend` dat 57/57; `npm run lint` exit 0, chi warning legacy/vendor/worktree co san; `npm run build:production` dat; `python -m unittest discover -s chatservice-main/tests -q` dat 136 test, skip 45; focused auth contract dat 32/32; focused bridge local skip 2 do Python Windows khong co `aiohttp` nhung da chay lai trong image production; `python -m py_compile ...` dat; `mobile/npm run typecheck` dat; `mobile/npm run lint` dat; `bash -n infrastructure/production/start.sh` dat; Compose production `config --no-interpolate -q` dat; `git diff --check` dat. Production Chatmgt/bridge image tests dat 34 test, skip 12; `nginx -t` dat. Public `/healthz` va Chatmgt `/api/v1/auth/health` tra `200`; public bundle `index-DGn_HuSH.js` + `App-Bc9PNXvh.js` co marker `recall-self`, `recall-all`, `media-invalidated`, `/self` va WebRTC call; anonymous self-remove/avatar tra `401` (khong con `404`) va CORS avatar tra dung origin; public Tinode hello tra `201` voi 2 ICE server (STUN/TURN), khong in credential.
- Trien khai: Commit `05004d6` da push `origin/master`; archive release bat bien `/opt/deploy/chat/releases/05004d6` co SHA-256 `F79A2BFC24D8ECD8B0F450E577C0ADF7C67655527C8D547E97358D842500FEE2`; `current` da tro release moi. Recreate rieng `chatmgt` (`1842ae1b79f9`) voi image `sha256:47df0e0d94f797961935660c6edb31a8f08c3d1559e6aa0583b1c23bc566110c`, bridge (`d62dce7b5d00`) voi image `sha256:447f7cd0aca632a4a28d97df1fe4f8c193e7d863da5f2d94002cfda5128d5629`) va ChatUI (`52fae3b7a0ca`) voi image `sha256:9281c9d78e51885c8888e694a9f2f7fc35f4f5266eb56e4441cc5b8095617525`; ca ba healthy. Worker, ChatAPI, hai PostgreSQL, Redis va Coturn giu nguyen container ID; khong migration, khong reset volume/topic/message.
- Rui ro con lai: Chua UAT hai Account user that cho mute/xoa/recall/avatar va voice/video web-mobile; Browser skill khong co browser runtime. Provider firewall van lam probe TCP `103.74.122.206:3478` tu may phat trien timeout du UFW host da mo, nen TURN giua hai mang khac nhau can xac nhan thuc te. Push khi app bi kill van phu thuoc Firebase/APNs/Tinode provider.
- Viec tiep theo: Dang nhap hai tai khoan that tren web va mobile, thu mute/xoa/thu hoi/anh va audio-video tren hai mang; neu TURN khong relay duoc, mo inbound TCP/UDP `3478` va UDP `49160-49200` tai firewall nha cung cap. Khong can restart service ngoai pham vi.
- Commit/PR: `05004d6` da push `origin/master`; deployment release `/opt/deploy/chat/releases/05004d6`. APK arm64 cuoi `outputs/vichat-mobile/ViChat-1.0.10-cross-client-final-arm64.apk`, package `vn.upgo.vichat`, version `1.0.10`/code `11`, ABI `arm64-v8a`, camera permission va WebRTC native module; `apksigner` v2 va `zipalign` dat; SHA-256 `B7E2FDDCD3B6CCA4CE1691BF27F858FE635989004A42B15E382613CB849E70DC`.

## 2026-08-13-01 - Hoan thien thao tac realtime va build APK Mobile

- Thoi gian: 2026-08-13 08:20 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Mobile | Tinode | Kiem thu | Phat hanh | Tai lieu
- Trang thai: Hoan tat code va build APK; chua deploy production, cho UAT tai khoan that
- Muc tieu: Sua mute, xoa phia toi va recall self tren Mobile; giu dong bo media, avatar va signaling cuoc goi ma khong thay doi luong gui nhan tin.
- Pham vi: `mobile/`, `chatservice-main/` self-remove endpoint, Tinode/WebRTC relay va ChatUI call/media thay doi san co; khong deploy lai web.
- File da thay doi: `mobile/src/store/appStore.ts`, `mobile/src/screens/chat/ConversationListScreen.tsx`, `mobile/src/services/tinodeClient.ts`, `mobile/src/utils/messagePolicy.ts`, `mobile/src/utils/messagePolicy.test.ts`, `mobile/src/components/MobileCallOverlay.tsx`, `mobile/src/store/callStore.ts`, `src/app/App.jsx`, `src/features/chat/services/tinodeClient.js`, `src/features/chat/components/CallOverlay.jsx`, `chatservice-main/application/controllers/api_chat_management.py`, `infrastructure/production/Dockerfile`, `infrastructure/production/compose.yaml`, `scripts/build-production.mjs`, `docs/chat-backend-architecture.md`, va artifact `outputs/vichat-mobile/ViChat-1.0.10-actions-recall-arm64.apk`.
- Noi dung: Mobile refresh Tinode token truoc khi xoa cuoc tro chuyen de tranh token het han; loi mute/xoa hien qua Alert thay vi bi nuot; policy recall self chi ap dung cho actor va khong tao lai placeholder khi goi tin goc da bi xoa. Tinode media cache, avatar/anh nhom va signaling audio/video tiep tuc dung relay chung; recall all van hien placeholder va chan reply/reaction/action.
- Quyet dinh ky thuat: Recall van la event overlay, khong thay doi publish message binh thuong. Xoa la per-user membership removal tren Chatmgt va leave topic cua actor. Cuoc goi chi duoc phep khi Tinode tra ICE/TURN, khong gia lap ket noi khi thieu relay.
- Database/API/cau hinh: Them route DELETE self cho Chatmgt; khong migration. Production defaults cho phep build call UI nhung van can `.env` voi Coturn va mo TCP/UDP `3478`, UDP `49160-49200` truoc khi bat media that.
- Kiem thu: `mobile/npx vitest run src/utils/messagePolicy.test.ts src/utils/tinodeState.test.ts src/utils/mediaUrl.test.ts` dat 3 file/12 test; `mobile/npm run typecheck` dat; `mobile/npm run lint` dat; `npm run test:frontend` dat 57/57; `python -m unittest discover -s chatservice-main/tests -q` dat 134 test, skip 43; `git diff --check` dat; Gradle `app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon --offline` dat; `aapt` xac nhan package `vn.upgo.vichat`, version `1.0.10`/code `11`; `apksigner verify --verbose` dat; `zipalign -c -v 4` dat; APK SHA-256 `C7881E59809D1F733B1A5D34ECAC894A1697D9863D4F34549E62FB5B77C67F29`.
- Rui ro con lai: Chua UAT hai tai khoan tren hai thiet bi; chua xac minh upload/avatar, recall cross-device, mute/xoa va audio/video voi production account. Khong co production `.env`/TURN firewall trong workspace va chua co quyen SSH de deploy; push khi app bi kill van phu thuoc Firebase/APNs va Tinode provider. APK arm64 dung debug signer, chi phu hop test noi bo.
- Viec tiep theo: Cai APK, UAT tren mobile/web cung tai khoan; deploy rieng Chatmgt backend neu can route self-remove; chi bat media production sau khi xac minh ICE/TURN va firewall. Khong deploy web trong lan nay.
- Commit/PR: `9279aa9`.

## 2026-08-12-08 - Sua upload va dong bo avatar ViChat Mobile

- Thoi gian: 2026-08-12 21:20 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Mobile | Kiem thu | Phat hanh | Tai lieu
- Trang thai: Hoan tat code va build APK; cho UAT avatar tren thiet bi Android
- Muc tieu: Sua luong thay avatar mobile theo `implementation_plan.md` ma khong thay doi web, backend, Tinode server hay luong tin nhan dang on dinh.
- Pham vi: Chi `mobile/` va nhat ky thay doi; khong sua `src/`, `dist/`, Chatmgt API, database, Tinode, realtime message flow hoac service production.
- File da thay doi: `mobile/src/services/apiClient.ts`, `mobile/src/services/authService.ts`, `mobile/src/store/appStore.ts`, `mobile/src/screens/settings/EditProfileScreen.tsx`, `mobile/src/utils/avatarPolicy.ts`, `mobile/src/utils/avatarPolicy.test.ts`, `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`, va `docs/CHANGELOG.md`.
- Noi dung: Xoa moi `Content-Type` cu khi request dung React Native `FormData` de fetch tu tao multipart boundary; chuan hoa avatar file part va tang timeout upload len 10 phut. Fallback Tinode duoc giu lai khi Account tra `ACCOUNT_AVATAR_UNSUPPORTED`; neu Account tu choi luu profile vi read-only/forbidden thi van giu avatar da publish tren Tinode. Store tra user da cap nhat, dong bo avatar vao session, directory, member, conversation va message; man hinh ho so khong con luu URI local thay cho URL server va tu dong theo doi thay doi tu store.
- Quyet dinh ky thuat: Tach policy avatar thanh helper pure de kiem thu duoc nhung khong tao message store hay luong upload moi. Account van la nguon chuan khi endpoint cho phep; Tinode chi la fallback cho tai khoan khong ho tro Account avatar.
- Database/API/cau hinh: Khong migration, khong doi API/backend hay production config; tang mobile version `1.0.10`, Android `versionCode=11`.
- Kiem thu: `mobile/npm run typecheck` dat; `mobile/npm run lint` dat; focused Vitest 4 file/12 test dat; `mobile/npm run export` dat; `npx expo prebuild --platform android --no-install` dat; Gradle `app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon` dat voi JDK Temurin 17 va SDK `D:\\VichatBuild\\android-sdk`; `aapt` xac nhan package `vn.upgo.vichat`, version `1.0.10`/code `11`, min SDK 24, target SDK 36, ABI arm64; `apksigner` xac nhan v2; `zipalign -c -v 4` dat; APK `outputs/vichat-mobile/ViChat-1.0.10-avatar-fix-arm64.apk` SHA-256 `2C5A30F873DB15F6E8C72B2D677C237F12FE5D6858C27A3FD110E7150920D190`; `adb devices` khong co thiet bi de UAT truc tiep.
- Rui ro con lai: Chua xac minh upload avatar voi tai khoan Account that va hai thiet bi; endpoint upload Account production van can UAT thuc te. APK chi co ABI arm64 va debug signer, phu hop test noi bo, khong phai artifact Play Store.
- Viec tiep theo: Cai APK tren Android arm64, dang nhap tai khoan that, chon anh tai `Cai dat > Chinh sua ho so`, kiem tra Settings/danh sach chat va doi chieu avatar tren web; khong deploy web/backend cho thay doi nay.
- Commit/PR: Chua tao.

## 2026-08-12-07 - Deploy Chatmgt va ban APK test profile linked devices

- Thoi gian: 2026-08-12 20:20 (Asia/Saigon)
- Loai: Van hanh | Phat hanh | Kiem thu | Tai lieu
- Trang thai: Da deploy Chatmgt; APK san sang UAT tai khoan that
- Muc tieu: Dua fix profile va phien thiet bi cua commit `8ca0411` len production va cung cap ban mobile de kiem tra.
- Pham vi: Chi service `chatmgt` va APK mobile; khong deploy lai `chat`, Tinode bridge/worker, ChatAPI, PostgreSQL, Redis, Coturn hoac web ChatUI.
- File da thay doi: `docs/CHANGELOG.md`; artifact `outputs/vichat-mobile/ViChat-1.0.9-profile-devices-arm64.apk`.
- Noi dung: Tao release bat bien `/opt/deploy/chat/releases/8ca0411` tu archive SHA-256 `DCEDDECC4961A51ADF6DAAB20E3557656BD9288856BDE6B134FF359DC6B60283`, giu nguyen `.env`/runtime production, build image Chatmgt moi va recreate rieng container. Release `current` da tro sang `8ca0411`; API devices/profile da vao dung route sau deploy.
- Quyet dinh ky thuat: Gan rollback image Chatmgt cu `songhong-production-chatmgt:rollback-before-8ca0411`; khong migration va khong restart cac service ngoai Chatmgt de bao toan luong web/Tinode dang on dinh.
- Database/API/cau hinh: Khong migration; image Chatmgt moi `sha256:55e2ee2182ce670d77364c6048cf8c6995e1fb551c6aaf5d658940386e8c9cba`; container `af94c4635e1c474ab06eb96f12a556cc84d59af7dda8ae47a93ef272dc421eb` healthy.
- Kiem thu: Test trong image: Account profile `16/16`, auth session/linked devices `6/6`; full suite con 9 test source-only khong chay duoc trong production image do phu thuoc frontend/runtime ngoai image. Public `GET /api/v1/auth/health` `200`; public `GET /api/v1/auth/devices` va `PUT /api/v1/auth/profile` `401` khi chua dang nhap, khong con `404`. Container `chat` va cac service Tinode/DB/Redis giu nguyen ID. APK package `vn.upgo.vichat`, version `1.0.9`/code `10`, SHA-256 `72BACA38ED1F819DA07886EB2A6FA99A27D48675669E53094C2362B5AC8030FF`; signature v2 va zipalign da dat tu build truoc.
- Rui ro con lai: Chua UAT tai khoan Account that tren mobile/web de xac nhan phien cross-device va cap nhat ho so qua Account; push khi app bi kill van phu thuoc credential Firebase/APNs/Tinode provider.
- Viec tiep theo: Cai APK tren Android arm64, dang nhap tai khoan that, mo Cai dat > Thiet bi lien ket, dang nhap them web/thiet bi khac va thu cap nhat ho so; khong thay doi luong message dang on dinh.
- Commit/PR: Deploy release `8ca0411`; changelog deploy commit sau.

## 2026-08-12-06 - Lam ro loi ho so va trang thai tai thiet bi Mobile

- Thoi gian: 2026-08-12 19:00 (Asia/Saigon)
- Loai: Sua loi | API | Mobile | Bao mat | Kiem thu | Tai lieu | Phat hanh
- Trang thai: Hoan tat code va build APK; chua deploy Chatmgt, can UAT tai khoan that
- Muc tieu: Khong hien trang thai phien rong trong luc dang tai va khong danh nham loi ho so chi-doc cua UpGO Account thanh loi het phien.
- Pham vi: Chatmgt Account profile error contract va hai man hinh auth/profile cua mobile; khong sua `src/`, `dist/`, giao dien web, Tinode message flow, recall, presence, group, avatar hoac push.
- File da thay doi: `chatservice-main/application/services/account_sso_service.py`, `chatservice-main/tests/test_account_sso_service.py`, `mobile/src/screens/settings/EditProfileScreen.tsx`, `mobile/src/screens/settings/LinkedDevicesScreen.tsx`, `docs/chat-backend-architecture.md`, va `docs/CHANGELOG.md`.
- Noi dung: Giu nguyen ly do tu Account khi PUT profile tra 403; loi chi-doc duoc tra voi ma `ACCOUNT_PROFILE_READ_ONLY`, loi cam quyen khac duoc tach thanh `ACCOUNT_PROFILE_UPDATE_FORBIDDEN`, va mobile hien huong dan cap nhat tai UpGO Account. Man hinh Thiet bi lien ket hien trang thai dang tai truoc khi ket luan danh sach rong.
- Quyet dinh ky thuat: Khong ghi profile fallback vao Chatmgt khi Account tu choi; Account van la nguon chuan. Chi sua phan phan loai loi va hien thi, giu nguyen luong Tinode/realtime va giao dien web.
- Database/API/cau hinh: Khong migration; bo sung ma loi profile `ACCOUNT_PROFILE_READ_ONLY`/`ACCOUNT_PROFILE_UPDATE_FORBIDDEN`; can rebuild/redeploy rieng Chatmgt, khong deploy lai web.
- Kiem thu: `python -m unittest discover -s chatservice-main/tests -q` dat 134 test, skip 43; `mobile/npm run typecheck` dat; `mobile/npm run lint` dat; `mobile/npx vitest run src/utils/tinodeState.test.ts src/utils/messagePolicy.test.ts src/utils/mediaUrl.test.ts` dat 3 file/10 test; `npx expo prebuild --platform android --no-install` dat; Gradle `app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon` dat voi JDK Temurin 17 va SDK tam; `aapt` xac nhan package `vn.upgo.vichat`, version `1.0.9`/code `10`; `apksigner verify --verbose` dat v2; `zipalign -c -v 4` dat; SHA-256 APK `72BACA38ED1F819DA07886EB2A6FA99A27D48675669E53094C2362B5AC8030FF`; public `GET https://chatmgt.upgo.vn/api/v1/auth/devices` van tra 404.
- Rui ro con lai: Production chua chay endpoint linked devices/profile moi; SSH bang key deploy hien tai bi `Permission denied (publickey,password)` voi cac user da thu, nen chua the recreate Chatmgt; chua UAT tai khoan Account that va hai thiet bi.
- Viec tiep theo: Deploy rieng Chatmgt tu commit nay khi co user SSH/quyen server, sau do dang nhap mobile/web cung tai khoan de kiem tra phien, Redis recovery va profile; khong deploy lai web.
- Commit/PR: `bedb2b4`.

## 2026-08-12-05 - Sua phien dang nhap va cap nhat ho so Account tren Mobile

- Thoi gian: 2026-08-12 18:00 (Asia/Saigon)
- Loai: Sua loi | API | Mobile | Bao mat | Kiem thu | Tai lieu | Phat hanh
- Trang thai: Hoan tat code va build APK; can deploy Chatmgt va UAT tai khoan that
- Muc tieu: Khong de `Thiet bi lien ket` hien rong sau khi dang nhap va cho phep user Account cap nhat ten/chuc vu tu mobile.
- Pham vi: Chatmgt Account SSO/profile, Redis linked-session registry va man hinh auth mobile; khong sua `src/`, `dist/`, giao dien web, Tinode message flow hoac realtime chat flow.
- File da thay doi: `chatservice-main/application/services/account_sso_service.py`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/services/auth_service.py`, `chatservice-main/tests/test_account_sso_service.py`, `chatservice-main/tests/test_auth_session_scope.py`, `mobile/src/services/authService.ts`, `mobile/src/store/appStore.ts`, `mobile/src/screens/settings/LinkedDevicesScreen.tsx`, `mobile/src/screens/settings/SettingsScreen.tsx`, `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`, `docs/chat-backend-architecture.md`, va `docs/CHANGELOG.md`.
- Noi dung: Account-backed profile update goi Account `/api/v1/user/{id}`, chi gui cac truong cong khai can thiet va doc lai `/current_user` de dong bo projection Chatmgt. Linked session luon tra phien hien tai khi Redis chua san sang, con danh sach cac thiet bi khac tu dong tro lai khi Redis phuc hoi. Mobile khong con nuot loi server thanh danh sach rong; hien loi tai du lieu de phan biet voi tai khoan chua co phien.
- Quyet dinh ky thuat: Account van la nguon chuan cho identity/profile; Chatmgt khong cho phep luu gia tri profile canh tranh. Redis van la nguon dong bo cross-device, khong tao session gia local; fallback chi hien phien hien tai trong thoi gian Redis loi.
- Database/API/cau hinh: Khong migration; thay doi hanh vi `PUT /api/v1/auth/profile` cho Account-backed user va giu `GET /api/v1/auth/devices`; can rebuild/deploy container Chatmgt cung release, khong deploy lai ChatUI web.
- Kiem thu: `python -m unittest discover -s chatservice-main/tests -q` dat 133 test, skip 42; `mobile/npm run typecheck` dat; `mobile/npm run lint` dat; `mobile/npx vitest run src/utils/tinodeState.test.ts src/utils/messagePolicy.test.ts src/utils/mediaUrl.test.ts` dat 3 file/10 test; `mobile/npm test` chua dat do test hien co `src/services/workspaceService.test.ts` bi Rolldown khong parse Flow trong `react-native/index.js`, 18 test con lai pass; `git diff --check` dat.
- Rui ro con lai: Chua goi Account update voi tai khoan production that; API Account phai cho phep role cua user hien tai sua cac truong da gui. Chua deploy Chatmgt production va chua UAT hai thiet bi cho linked devices.
- Viec tiep theo: Build va cai APK `1.0.8`, deploy Chatmgt backend, dang nhap tren mobile/web bang cung tai khoan va kiem tra ten/chuc vu, phien, logout va Redis recovery; khong deploy lai web.
- Commit/PR: `9021e81`.

## 2026-08-12-04 - Sua dong bo recall, avatar, phien thiet bi va presence tren Mobile

- Thoi gian: 2026-08-12 01:50 (Asia/Saigon)
- Loai: Sua loi | API | Mobile | Tinode | Kiem thu | Tai lieu
- Trang thai: Hoan tat code, build APK arm64 va kiem thu local; can UAT hai tai khoan that
- Muc tieu: Khac phuc recall `all` khong den thiet bi nhan, avatar nhom khong hien tren native, danh sach thiet bi lien ket rong va hien thi nham trang thai online.
- Pham vi: Mobile Tinode control event, media avatar, auth session registry/API va direct-chat presence; khong sua giao dien web hoac luong gui tin nhan.
- File da thay doi: `mobile/src/services/tinodeClient.ts`, `mobile/src/components/Avatar.tsx`, `mobile/src/services/apiClient.ts`, `mobile/src/services/authService.ts`, `mobile/src/services/chatManagementService.ts`, `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/screens/settings/LinkedDevicesScreen.tsx`, `mobile/src/utils/tinodeState.ts`, `mobile/src/utils/tinodeState.test.ts`, `chatservice-main/application/controllers/api_chat_management.py`, `docs/chat-backend-architecture.md`, va `docs/CHANGELOG.md`.
- Noi dung: Recall publish bang `publishMessage` co client id va kiem tra ctrl, khong hard-delete message goc de materializer cua moi client luon tao placeholder; avatar native tai qua cache/relay co header Tinode; moi API native gui marker mobile, tu dong nhan bearer moi khi Chatmgt rotate session va fallback `/auth/me`; login mobile tra linked devices ngay; header direct chat chi hien Online khi peer co presence that.
- Quyet dinh ky thuat: Receipt mot/two check chi la delivery state, khong duoc dung lam presence; recall la event overlay ben vung, khong phu thuoc quyen hard-delete Tinode. Du lieu linked session van luu Redis theo JWT `jti`, khong tao thiet bi gia o local.
- Database/API/cau hinh: Khong migration; bo sung `linked_devices` trong response login mobile va bearer rollover trong `POST /api/v1/auth/tinode-token`; backend Chatmgt phai duoc deploy cung release de danh sach phien hien tren production.
- Kiem thu: `mobile/npm run typecheck` dat; `mobile/npm run lint` dat; `mobile/npx vitest run src/utils/tinodeState.test.ts src/utils/messagePolicy.test.ts src/utils/mediaUrl.test.ts` dat 3 file/10 test; `python -m unittest discover -s chatservice-main/tests -q` dat 131 test, skip 40; `mobile/npm run export` dat; Gradle assemble release arm64 tao APK package `vn.upgo.vichat`, version `1.0.7`/code `8`; `apksigner` v2 va `zipalign -c -v 4` dat; SHA-256 `B5892A398951D85C86607A820140A13561D35DB4C4EA1FBF897E65FCD7D9188F`; `adb install` chua chay vi khong co thiet bi/emulator.
- Rui ro con lai: Chua UAT hai tai khoan that cho recall/avatar/presence; linked devices van rong neu production chua chay code Chatmgt co Redis registry; push khi app bi kill van phu thuoc credential Firebase/APNs va Tinode provider.
- Viec tiep theo: Cai APK tren hai thiet bi, UAT recall/avatar/presence va deploy rieng Chatmgt backend; khong deploy lai ChatUI web.
- Commit/PR: `18f70c7`.

## 2026-08-12-03 - Dong bo recall, group, avatar va linked devices cho Mobile

- Thoi gian: 2026-08-12 01:09 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | API | Mobile | Tinode | Tai lieu | Kiem thu | Phat hanh
- Trang thai: Hoan tat code va build APK arm64; cho UAT hai tai khoan that
- Muc tieu: Hoan thien cac luong mobile tren cung backend/Tinode ma khong thay doi luong gui nhan tin dang on dinh.
- Pham vi: Recall self/all, tao nhom kem avatar, linked devices tu server, cap nhat avatar ca nhan realtime va tuong thich event recall toi thieu cho ChatUI web.
- File da thay doi: `mobile/`, `chatservice-main/application/services/auth_service.py`, `chatservice-main/application/controllers/api_chat_management.py`, `src/features/chat/services/messagePolicy.js`, `src/features/chat/services/messagePolicy.test.js`, `src/features/chat/services/tinodeClient.js`, `docs/chat-backend-architecture.md`, va `docs/CHANGELOG.md`.
- Noi dung: Recall `self` chi an tin o phia nguoi gui, `all` an va hien placeholder cho moi nguoi; group tao topic Tinode sau khi Chatmgt prepare UID va upload avatar; Redis luu session theo JWT `jti` va API `/api/v1/auth/devices` tra thiet bi/nen tang/thoi diem; avatar duoc publish lai vao Tinode public profile de dong bo directory, member va message history.
- Quyet dinh ky thuat: Khong thay doi message publish/subscribe; recall la event overlay, chi hard-delete bo sung cho `all`; ChatUI chi them parser de khong ap dung recall `self` len nguoi nhan.
- Database/API/cau hinh: Khong migration; them `GET /api/v1/auth/devices`; session registry dung Redis TTL theo JWT, khong luu token vao record.
- Kiem thu: `mobile/npm run typecheck` dat; `mobile/npm run lint` dat; focused `npx vitest run ...` dat 7 file/17 test; `mobile/npm run export` dat; `npm run test:frontend` dat 57/57; `node --test src/features/chat/services/messagePolicy.test.js` dat 4/4; `python -m unittest discover -s chatservice-main/tests -q` dat 131 test, skip 40; Gradle `app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon` dat; `aapt` xac nhan package `vn.upgo.vichat`, version `1.0.6`/code `7`; `apksigner` truc tiep xac nhan v2; `zipalign -c -v 4` dat; `adb install -r` dat va `MainActivity` resumed, PID `11952`, khong co crash marker trong logcat; hash SHA-256 `06844B8E28A248DA21657CB56D3DCA3C752E9851F4692B81BFCF6F0D549530BF`.
- Rui ro con lai: `mobile/npm test` full con fail rieng `src/services/workspaceService.test.ts` vi Rolldown khong parse Flow trong `react-native/index.js`; focused suite van dat. Chua UAT hai tai khoan that cho recall/group/avatar/linked devices va chua xac nhan push khi app bi suspend/kill tren binary co credential Firebase/APNs.
- Viec tiep theo: Cai APK cho nguoi dung test hai tai khoan trong cung tenant; neu dua linked devices len production thi deploy Chatmgt/backend release tuong ung, khong deploy lai ChatUI web.
- Commit/PR: `173e870` (commit mobile/backend/docs; khong deploy ChatUI web).

## 2026-08-12-02 - Tinh chinh header va them thiet bi lien ket cho ViChat Mobile

- Thoi gian: 2026-08-12 00:35 (Asia/Saigon)
- Loai: Giao dien | Tinh nang | Mobile | Kiem thu | Tai lieu
- Trang thai: Hoan tat code va build APK arm64; cho UAT tren thiet bi Android
- Muc tieu: Can lai avatar/header va nut tim kiem theo bo cuc mobile moi, bo chu `Realtime` o header nhung giu dau online tren avatar; rut gon ten Danh ba, bo dong ghi chu ho so va them muc xem thiet bi dang lien ket.
- Pham vi: Chi `mobile/` va nhat ky; khong sua web `src/`/`dist/`, API, database, Tinode, realtime message flow, recall, receipt, presence, file, push hay app lock.
- File da thay doi: `mobile/src/screens/chat/ConversationListScreen.tsx`, `mobile/src/screens/contacts/ContactsScreen.tsx`, `mobile/src/screens/contacts/UserProfileScreen.tsx`, `mobile/src/screens/settings/SettingsScreen.tsx`, `mobile/src/screens/settings/LinkedDevicesScreen.tsx`, `mobile/src/navigation/AppNavigator.tsx`, `mobile/src/navigation/types.ts`, `mobile/src/services/authService.ts`, `mobile/src/services/storageService.ts`, `mobile/src/types/index.ts`, va `docs/CHANGELOG.md`.
- Noi dung: Header hien avatar can giua hai dong ten khong gian va Tin nhan, nut tim kiem can theo hang; trang Cai dat co muc Thiet bi lien ket voi icon web/mobile/desktop va thoi gian phien; auth normalize du lieu `linked_devices`/`linkedDevices`/`sessions` neu backend tra ve va luu thoi diem dang nhap hien tai tren may.
- Quyet dinh ky thuat: Khong tao session gia cho web hay may khac. Backend hien chi tra thong tin tai khoan va phien hien tai, chua co endpoint liet ke cac session; man hinh hien chinh xac thiet bi mobile hien tai va tu dong hien cac phien xa neu auth payload sau nay cung cap du lieu.
- Database/API/cau hinh: Khong migration, khong them endpoint, khong doi bien moi truong, khong doi giao dien web va khong doi luong chuc nang dang hoat dong.
- Kiem thu: `mobile/npm run typecheck` dat; `mobile/npm run lint` dat; `mobile/npm test` dat 8 file/18 test; `mobile/npm run export` dat; Gradle `app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon` dat; `aapt dump badging` xac nhan package `vn.upgo.vichat`, version `1.0.5`/code `6`; `apksigner verify --verbose` dat v2; `git diff --check` dat. APK `outputs/vichat-mobile/ViChat-1.0.5-header-linked-devices-arm64.apk`, SHA-256 `7BD6A6301459A9D1964F519A279072310D1CBE3C631953483166BBFE9A8FADC9`.
- Rui ro con lai: Chua co thiet bi ADB trong moi truong de UAT truc quan. Danh sach web/thiet bi khac chi hien khi backend bo sung du lieu linked session; hien tai khong bao cao nham la da theo doi duoc cac phien xa.
- Viec tiep theo: Cai APK tren Android arm64, mo header/Danh ba/Cai dat > Thiet bi lien ket va kiem tra lai cac luong nhan tin/realtime cu.
- Commit/PR: Tao commit mobile sau khi ra soat staged diff; khong deploy web.

## 2026-08-12-01 - Tai bo cuc Lumina cho ViChat Mobile

- Thoi gian: 2026-08-12 00:10 (Asia/Saigon)
- Loai: Giao dien | Mobile | Kiem thu | Tai lieu
- Trang thai: Hoan tat layout va build APK; chua UAT truc tiep vi may khong co thiet bi ADB
- Muc tieu: Dua bo cuc mobile theo ZIP `stitch_internal_enterprise_messenger.zip` (header lon, filter chips, card hoi thoai, danh ba theo phong ban, ho so dang card, tab bar noi va composer moi) nhung giu nguyen mau hien tai cua ViChat va toan bo luong chuc nang.
- Pham vi: Chi `mobile/` va nhat ky; khong sua web `src/`/`dist/`, API, database, Tinode topic, auth, receipt, presence, recall, file, push hay app lock.
- File da thay doi: `mobile/src/screens/chat/ConversationListScreen.tsx`, `mobile/src/components/ConversationRow.tsx`, `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/components/MessageBubble.tsx`, `mobile/src/screens/contacts/ContactsScreen.tsx`, `mobile/src/screens/settings/SettingsScreen.tsx`, `mobile/src/screens/workspace/WorkspaceScreen.tsx`, `mobile/src/navigation/MainTabNavigator.tsx`, `mobile/src/components/SearchField.tsx`, va `docs/CHANGELOG.md`.
- Noi dung: Danh sach chat co header avatar, tim kiem bat/tat, bo loc Tat ca/Chua doc/Nhom, card hoi thoai va nut mo Danh ba; Danh ba gom theo phong ban va giu tao nhom/tao direct chat; Ho so & Cai dat dung profile card va cac nhom cai dat; chat detail giu thao tac attach/reply/reaction/recall nhung doi header, bubble va composer; tab bar dung dang pill noi de khong che list.
- Quyet dinh ky thuat: Chi thay StyleSheet va presentation component, them filter local tu state hien co, khong tao data demo va khong thay doi handler store/service. Mau van dung `mobile/src/theme/colors.ts`, khong copy palette Midnight Navy/Indigo cua ZIP.
- Database/API/cau hinh: Khong migration, khong doi API, secret, version app hay native credential.
- Kiem thu: `mobile/npm run typecheck` dat; `mobile/npm run lint` dat; `mobile/npm test` dat 8 file/18 test; `mobile/npm run export` dat; Gradle `app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon` dat; `aapt dump badging` xac nhan package `vn.upgo.vichat`, version `1.0.5`/code `6`; `apksigner verify --verbose` dat v2. APK `outputs/vichat-mobile/ViChat-1.0.5-layout-arm64.apk`, SHA-256 `096D9D384543B4A5FBDB6C34D32A89BC6C58D99E8986988B16FCB0967A1BC56E`.
- Rui ro con lai: `adb devices` khong co thiet bi nen chua xac minh screenshot native, tab bar khi cuon, composer khi mo ban phim va tap tren man hinh that; can cai APK tren Android arm64 de UAT layout.
- Viec tiep theo: Cai `outputs/vichat-mobile/ViChat-1.0.5-layout-arm64.apk` tren thiet bi Android, kiem tra 4 man hinh theo ZIP va xac nhan cac luong chat/realtime cu van hoat dong.
- Commit/PR: Chua tao.

## 2026-08-11-13 - Sua realtime presence receipt va recall cho ViChat Mobile

- Thoi gian: 2026-08-11 23:11 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Mobile | Tinode | Kiem thu | Tai lieu
- Trang thai: Hoan tat code, kiem thu local va build APK arm64; chua UAT push khi app bi suspend/kill
- Muc tieu: Khi tai khoan khac vao mobile, presence va trang thai hai dau tich cap nhat realtime; tin nhan thu hoi van con placeholder va khong con thao tac reply/view/reaction; giu duong push Tinode cho nhieu thiet bi.
- Pham vi: `mobile/` Tinode client, receipt/presence state, message policy, notification registration, tai lieu; khong sua ChatUI web, Chatmgt API, database, topic, file, call hoac chatbot.
- File da thay doi: `mobile/src/services/tinodeClient.ts`, `mobile/src/utils/tinodeState.ts`, `mobile/src/utils/tinodeState.test.ts`, `mobile/src/utils/messagePolicy.ts`, `mobile/src/utils/messagePolicy.test.ts`, `mobile/src/components/MessageActionSheet.tsx`, `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/store/appStore.ts`, `mobile/src/services/notificationService.ts`, `docs/chat-backend-architecture.md`, va `docs/CHANGELOG.md`.
- Noi dung: Mobile lang nghe presence tu topic `me` va topic P2P, hydrate lai snapshot sau khi Chatmgt load directory, ACK `recv` ngay khi nhan data, luu cursor `recv/read` tang dan de snapshot cu khong ha trang thai receipt. Recall chi publish event, khong goi hard-delete; message cu da bi xoa trong cache Tinode duoc dung lai thanh placeholder `Tin nhan da duoc thu hoi`, xoa quote/reaction/attachment va chan toan bo menu thao tac. Dang ky device token duoc reset khi logout de moi phien tren tung thiet bi dang ky lai voi Tinode.
- Quyet dinh ky thuat: Tinode van la nguon chuan cua presence, receipt va message; khong tao message store thay the, khong doi API/schema. Event recall la lop an noi dung de tuong thich voi web va khong phuc hoi noi dung goc. Push background/killed van dung native FCM/APNs token qua `hi.dev`, khong luu token vao Chatmgt.
- Database/API/cau hinh: Khong migration, khong doi API hay secret. Muon co push khi app suspend/kill phai bat `EXPO_PUBLIC_PUSH_ENABLED=true`, nhung production con can Firebase/APNs credential trong binary va Tinode push provider tuong ung.
- Kiem thu: `mobile/npm run typecheck` dat; `mobile/npm test` dat 8 file/18 test; `mobile/npm run lint` dat; `mobile/npm run export` dat; `npx expo prebuild --platform android --no-install` dat; Gradle `app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon` dat. APK `outputs/vichat-mobile/ViChat-1.0.5-arm64.apk` package `vn.upgo.vichat`, version `1.0.5`/code `6`, SHA-256 `448720C1042B72FD75D80B5C011F8F2580C392EFFA763BEF116C161A85CEB070`.
- Rui ro con lai: Chua UAT hai tai khoan that cho presence/receipt/recall va chua xac nhan push khi app bi kill vi thieu native/provider credential; khong bao cao push kill-state la da hoat dong.
- Viec tiep theo: UAT hai thiet bi/tai khoan trong cung tenant; sau khi cap credential Firebase/APNs va Tinode provider thi rebuild development/production build va test notification khi app background/killed.
- Commit/PR: Tao commit mobile sau khi ra soat staged diff; khong deploy web.

## 2026-08-11-12 - Hoan thien media, thao tac tin nhan, khoa PIN va push cho ViChat Mobile

- Thoi gian: 2026-08-11 22:45 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Bao mat | Giao dien | Mobile | Kiem thu | Tai lieu
- Trang thai: Hoan tat code va build APK; cho UAT thong bao nen/khi app bi dong
- Muc tieu: Hien thi anh trong bong chat nhu ung dung nhan tin hien dai, bo sung thao tac nhan giu, khoa app bang ma PIN va khoi phuc dang ky thong bao native ma khong thay doi ChatUI web, Chatmgt, Tinode API hay du lieu khac.
- Pham vi: Chi `mobile/` va tai lieu kien truc/nhat ky; khong sua web ChatUI, Chatmgt, Tinode server, database, tenant, chatbot hoac luong nghiep vu khac.
- File da thay doi: `mobile/App.tsx`, `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`, `mobile/src/components/MessageBubble.tsx`, `mobile/src/components/MessageActionSheet.tsx`, `mobile/src/components/AppLockScreen.tsx`, `mobile/src/components/PinSettingsModal.tsx`, `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/screens/settings/EditProfileScreen.tsx`, `mobile/src/screens/settings/SettingsScreen.tsx`, `mobile/src/services/tinodeClient.ts`, `mobile/src/services/notificationService.ts`, `mobile/src/services/appLockService.ts`, `mobile/src/services/appLifecycleService.ts`, `mobile/src/store/appLockStore.ts`, `mobile/src/store/appStore.ts`, `mobile/src/types/index.ts`, `mobile/src/utils/mediaUrl.ts`, `mobile/src/utils/mediaUrl.test.ts`, `mobile/src/utils/appLockPolicy.ts`, `mobile/src/utils/appLockPolicy.test.ts`, `README.md`, `docs/chat-backend-architecture.md`, va `docs/CHANGELOG.md`.
- Noi dung: Anh Tinode duoc chuyen qua relay xac thuc, tai vao cache native truoc khi render, co trang thai dang tai/thu lai, xem toan man hinh va mo/tai; bong anh chi hien mot lan khong kem file-card. Nhan giu mo bottom sheet voi reaction, tra loi, sao chep, chia se, chi tiet, mo/tai tep va thu hoi chi khi message da duoc Tinode xac nhan. Metadata `x-reply-to` duoc gui qua Tinode de tuong thich voi web. Cai dat thay muc phien/quyen rieng tu bang `Ma PIN khi mo ViChat`; PIN 4 so duoc luu salt + hash trong SecureStore, khoa khi cold start/background va co quy trinh quen PIN dang xuat de dang nhap lai. Camera, thu vien, picker va chia se duoc danh dau trusted transition de khong khoa giua thao tac. Notification channel/local notification van hoat dong khi JS con song, dong thoi dang ky native FCM/APNs device token vao Tinode khi duoc bat.
- Quyet dinh ky thuat: Khong luu PIN, file cache hay device token vao Chatmgt; khong tao message store thay the. Anh protected khong dung `Image` truc tiep voi URL trung tam vi thieu header Tinode tren native. Recall/reaction/reply tiep tuc dung Tinode topic hien tai; khong thay doi API hay schema.
- Database/API/cau hinh: Them dependency `expo-crypto`; tang mobile version `1.0.4`, Android `versionCode=5`; khong migration. Push nen/khi app bi kill can dong thoi `EXPO_PUBLIC_PUSH_ENABLED=true`, credential Firebase/APNs trong binary va Tinode push provider production; production hien thieu `FCM_PUSH_ENABLED`, `FCM_PROJECT_ID`, `FCM_CRED_FILE` va credential google-services nen chua the xac nhan push kill-state.
- Kiem thu: `mobile/npm run typecheck` dat; `mobile/npm test` dat 8 file/16 test; `mobile/npm run lint` exit 0; `git diff --check` dat. `npx expo prebuild --platform android --no-install` va Gradle `app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon` da dat; APK `outputs/vichat-mobile/ViChat-1.0.4-arm64.apk` package `vn.upgo.vichat`, version `1.0.4`/code `5`, SHA-256 `A267B6441CFC3AEC366349A460350005CA5FB23A35EC61F974FED138173B0434`, apksigner v2 dat. `adb install -r` dat tren Xiaomi `M2104K10AC` serial `z5lfxgnf8dw4ucjj`; cold start giu process song, chua UAT truc quan vi thiet bi dang bi khoa.
- Rui ro con lai: Push khi ung dung bi kill/suspend phu thuoc credential Firebase/APNs va Tinode provider chua co trong production; chua gui tin/anh that de tranh lam thay doi du lieu chat cua cong ty.
- Viec tiep theo: Hard refresh/UAT anh, nhan giu, PIN va local notification tren thiet bi; bo sung credential push rieng roi rebuild/release neu can thong bao khi app bi kill.
- Commit/PR: Chua tao.

## 2026-08-11-11 - Dong bo lai ViChat Mobile va sua gui media

- Thoi gian: 2026-08-11 18:58 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Mobile | Kiem thu | Phat hanh
- Trang thai: Hoan tat code va build APK; cho UAT thiet bi Android that
- Muc tieu: Loai cac doan chat khong co topic Tinode, nhan du tin nhan sau khi mat mang, gui duoc file/anh/camera va hien thong bao ung dung ma khong thay doi ChatUI web, Chatmgt hay Tinode server.
- Pham vi: `mobile/` va asset logo; khong sua API, database, tenant, backend hay service production.
- File da thay doi: `mobile/src/services/tinodeClient.ts`, `mobile/src/store/appStore.ts`, `mobile/src/services/notificationService.ts`, `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/utils/conversationSync.ts`, `mobile/src/utils/conversationSync.test.ts`, `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`, `mobile/assets/`, va `docs/CHANGELOG.md`.
- Noi dung: Chi giu hoi thoai co topic subscribe thanh cong khi Tinode dang online; reconnect resubscribe cac topic da theo doi va lay data sau sequence cu; dung Expo native multipart upload de tranh loi `FormData` voi file lon; xin quyen thu vien/camera; tao channel `messages` va local notification khi co tin nhan moi luc app o nen; thay icon chu V bang logo web cam tren nen kem.
- Quyet dinh ky thuat: Khong xoa record Chatmgt; neu Tinode khong xac minh duoc topic nao thi giu metadata de khong lam mat du lieu khi relay tam thoi loi. Push token van khong dang ky backend vi chua co endpoint trong pham vi; notification local chi bao dam khi JS/Tinode dang chay o nen.
- Database/API/cau hinh: Khong migration, khong doi API/backend; tang mobile version `1.0.3`, Android `versionCode=4`.
- Kiem thu: `mobile/npm run typecheck` dat; `mobile/npm test` dat 13/13 test; `mobile/npm run lint` dat; `git diff --check` dat; `npx expo config --type public` nhan icon/logo va version; `npx expo prebuild --platform android --no-install` dat; Gradle `app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon` dat; `aapt` xac nhan package/version va quyen camera/notification; `apksigner` v2 dat; `zipalign -c -v 4` dat; APK arm64 SHA-256 `02CC88F78FCCB036B6BDC24084DD5427F3ECA7750D168D73C3DA2AE568642143`.
- Rui ro con lai: `adb devices` hien khong co thiet bi nen chua cai/UAT cold-start, upload, reconnect va notification tren Android that; thong bao khi app bi kill hoan toan can FCM/APNs backend rieng.
- Viec tiep theo: Cai `outputs/vichat-mobile/ViChat-1.0.3-arm64.apk` tren thiet bi ADB, chay cold-start/UI/logcat va UAT cac luong topic stale/reconnect/file/anh/camera/notification; khong can thay doi backend.
- Commit/PR: `1e63055`; chua co PR.

## 2026-08-11-10 - Sua receipt, presence va giao dien ViChat Mobile

- Thoi gian: 2026-08-11 18:06-18:30 (Asia/Saigon)
- Loai: Sua loi | Giao dien | Mobile | Kiem thu | Phat hanh
- Trang thai: Hoan tat; da build va cai xac minh tren thiet bi Android that
- Muc tieu: Dong bo trang thai gui/nhan/doc va online/offline tren mobile, khong de ban phim che o nhap, khong de status bar/tab bar che noi dung, va dua thuong hieu GON PLATFORM dung logo web vao luong dang nhap.
- Pham vi: Chi `mobile/` va nhat ky thay doi; khong sua ChatUI web, Chatmgt, Tinode server, chatbot, API, database, tenant, file, recall hay service production.
- File da thay doi: `mobile/App.tsx`, `mobile/app.json`, `mobile/src/components/GonLogo.tsx`, `mobile/src/components/MessageBubble.tsx`, `mobile/src/navigation/AppNavigator.tsx`, `mobile/src/navigation/MainTabNavigator.tsx`, `mobile/src/screens/auth/ForgotPasswordScreen.tsx`, `mobile/src/screens/auth/LoginScreen.tsx`, `mobile/src/screens/chat/ChatDetailScreen.tsx`, `mobile/src/screens/chat/ConversationListScreen.tsx`, `mobile/src/screens/chat/NewGroupScreen.tsx`, `mobile/src/screens/contacts/ContactsScreen.tsx`, `mobile/src/screens/contacts/UserProfileScreen.tsx`, `mobile/src/screens/settings/EditProfileScreen.tsx`, `mobile/src/screens/settings/SettingsScreen.tsx`, `mobile/src/screens/workspace/WorkspaceDetailScreen.tsx`, `mobile/src/screens/workspace/WorkspaceScreen.tsx`, `mobile/src/services/tinodeClient.ts`, `mobile/src/store/appStore.ts`, `mobile/src/utils/tinodeState.ts`, `mobile/src/utils/tinodeState.test.ts`, va `docs/CHANGELOG.md`.
- Noi dung: Map `topic.msgStatus()` cua Tinode theo cac moc sent/received/read `50/60/70`, hien thi `...`, `✓` va `✓✓`; luu presence theo UID va cap nhat dong thoi danh ba, member va header direct conversation. Them resolver presence dung wrapper mobile trong `materializeConversation`; ban APK dau tien phat hien crash do goi nham method tren raw SDK, da sua va build lai truoc khi cai ban cuoi. Them `SafeAreaProvider`, safe-area cho tab/man hinh phu, Android `softwareKeyboardLayoutMode=resize`, KeyboardAvoidingView va thao tac ban phim cho composer. Rut gon login chi con logo web `public/chat-logo.svg`/`GON PLATFORM`, email, mat khau, dang nhap va quen mat khau.
- Quyet dinh ky thuat: Receipt/presence chi duoc tinh tu Tinode SDK va state mobile, khong tao store tin nhan thay the hay thay doi hop dong publish/subscribe; safe-area chi bao quanh layout, khong chen vao auth/message/file flow.
- Database/API/cau hinh: Khong migration, API, secret hay bien production moi. Tang mobile version `1.0.2`, Android `versionCode=3`; native `mobile/android/` la generated/ignored.
- Kiem thu: Trong `mobile/`, `npm run typecheck` dat; `npm test` dat 5 file/11 test; `npm run lint` dat; `git diff --check` dat. `npx expo prebuild --platform android --no-install` dat; Gradle `app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon` dat. `aapt` xac nhan package `vn.upgo.vichat`, version `1.0.2`/code `3`, min SDK 24, target SDK 36; `apksigner verify` v2 dat; `zipalign -c -v 4` dat; APK arm64 SHA-256 `124F88EE18BD6C518CA50A7F22832D576304055E913642D3E73BED56E9A60F08`.
- Kiem thu thiet bi: `adb install -r` dat tren Xiaomi `M2104K10AC` serial `z5lfxgnf8dw4ucjj`; cold start bang `am start -W` tra `Status: ok`, process `vn.upgo.vichat` con PID `11581`, activity duoc focus la `vn.upgo.vichat/.MainActivity`, log khong co `FATAL EXCEPTION`, `ReactNativeJS TypeError` hay crash marker. UI dump hien receipt `✓✓`; khi mo ban phim composer van nam tren ban phim tren man hinh 1080x2400.
- Rui ro con lai: APK chi co ABI `arm64-v8a` va debug/test signer, phu hop UAT noi bo chua phai Play Store; chua gui them tin nhan test de khong lam ban chat that thay doi.
- Viec tiep theo: UAT tai khoan that tren dien thoai voi login, gui text/file, doi receipt/presence va chatbot; neu can phat hanh store thi tao AAB voi release credential.
- Commit/PR: `382ed83`.

## 2026-08-11-09 - Sua crash khoi dong ViChat Mobile tren Android 11

- Thoi gian: 2026-08-11 17:18-17:38 (Asia/Saigon)
- Loai: Sua loi | Mobile | Kiem thu | Phat hanh
- Trang thai: Hoan tat; da cai va xac minh tren thiet bi Android that
- Muc tieu: Khac phuc APK mo len roi tu thoat, phat hanh ban test moi ma khong thay doi ChatUI, Chatmgt, Tinode server hay cac service production.
- Pham vi: Thu tu khoi tao polyfill/Tinode SDK, lazy-load module notification, version Android va APK test arm64; khong doi API, auth, tenant, database, message/file flow hoac ha tang production.
- File da thay doi: `mobile/app.json`, `mobile/index.ts`, `mobile/src/polyfills/intlSegmenter.ts`, `mobile/src/polyfills/intlSegmenter.test.ts`, `mobile/src/services/notificationService.ts`, `mobile/src/services/tinodeClient.ts`, va `docs/CHANGELOG.md`.
- Noi dung: ADB log tren Redmi `M2104K10AC` xac nhan `tinode-sdk` goi `new Intl.Segmenter` trong luc module duoc danh gia, trong khi Hermes tren Android 11 chua co constructor nay; React Native nem `JavascriptException` roi tien trinh bi `SIGABRT`. Tinode SDK nay duoc nap dong sau khi cai fallback `Intl.Segmenter`; notification native cung chi nap khi push duoc bat. Tang app version len `1.0.1`, Android versionCode len `2`.
- Quyet dinh ky thuat: Khong sua hoac fork `tinode-sdk`; giu SDK va chat contract hien tai, chi doi thoi diem import de fallback duoc cai truoc code UMD cua SDK. Kiem tra constructor sau import de tra loi co kiem soat neu binary SDK khong hop le.
- Database/API/cau hinh: Khong co migration, API hoac bien production moi. Khong deploy/recreate bat ky service production nao.
- Kiem thu: Symbolicate source map anh xa loi bundle toi `tinode-sdk/umd/tinode.prod.js` dong khoi tao `Intl.Segmenter`; `npm run typecheck`, `npm test` dat 4 file/8 test va `npm run lint` dat. `expo prebuild --platform android --no-install` dat; Gradle `app:assembleRelease` dat; `aapt` xac nhan `vn.upgo.vichat` version `1.0.1`/code `2`, min SDK 24, target SDK 36, ABI `arm64-v8a`; `apksigner` v2 dat va SHA-256 APK la `A048F6AE8D9DC7FB8F849A02109E212E6F2A52C7FE7094AF595EADC951F99F3F`.
- Kiem thu thiet bi: `adb install -r` dat va giu phien cu; cold-start sau 12 giay con PID `31757`, `FocusedApp` la `vn.upgo.vichat/.MainActivity`, package tren may la versionCode `2`/versionName `1.0.1`, UI da tai danh sach va hien `Realtime`; log theo PID khong con `JavascriptException`, `undefined cannot be used as a constructor` hoac `SIGABRT` cua ViChat.
- Rui ro con lai: APK van dung test/debug signer va chi co `arm64-v8a`, phu hop UAT noi bo nhung chua phai artifact Play Store. Log ROM co crash lap lai cua `/vendor/bin/soterd`, day la service he thong Xiaomi va khong lam tien trinh ViChat thoat.
- Viec tiep theo: UAT mo/dong app nhieu lan, chat 1-1/nhom, gui file va chatbot tren dien thoai; neu dat moi tao AAB/release-signed cho store.
- Commit/PR: `33c20e5`.

## 2026-08-11-08 - Phat hanh APK Android test ViChat Mobile

- Thoi gian: 2026-08-11 17:03 (Asia/Saigon)
- Loai: Phat hanh | Mobile | Kiem thu | Tai lieu
- Trang thai: Hoan tat; san sang UAT tren thiet bi Android that
- Muc tieu: Tao binary Android de kiem thu ViChat Mobile tren dien thoai that ma khong thay doi luong web, Chatmgt, Tinode hoac du lieu production.
- Pham vi: Native project sinh tai `mobile/android/` (generated/ignored) va artifact giao den tai `outputs/vichat-mobile/`; khong sua source runtime/backend va khong recreate service production.
- File da thay doi: `docs/CHANGELOG.md`; artifact khong commit `outputs/vichat-mobile/ViChat-1.0.0-arm64.apk`.
- Noi dung: Build release APK cho `arm64-v8a`, package `vn.upgo.vichat`, version `1.0.0` (versionCode `1`), min SDK 24 (Android 7+) va target/compile SDK 36. APK da nhung production JavaScript bundle cua mobile app.
- Quyet dinh ky thuat: Dung test/debug signer `CN=Android Debug` de co the cai dat ngay cho UAT noi bo; day khong phai artifact Play Store ky bang release credential.
- Database/API/cau hinh: Khong co; khong thay doi production config hay service runtime.
- Kiem thu: Gradle release build truoc do dat `BUILD SUCCESSFUL` (17m42s); `apksigner verify --verbose --print-certs` dat voi APK Signature Scheme v2; `zipalign -c -v 4` dat; `aapt dump badging` xac nhan package/version/minSdk/targetSdk/arm64; SHA-256 `D786157960EE81BA6E96AF917AEC57FB1BCE27147E54CA70567ED4CCD8D988E4`.
- Rui ro con lai: Chi co ABI `arm64-v8a`; may Android qua cu hoac ABI 32-bit khong cai duoc. Test signer phu hop UAT, khong dung de phat hanh store.
- Viec tiep theo: Cai APK tren dien thoai Android bat USB debugging bang `adb install -r outputs\\vichat-mobile\\ViChat-1.0.0-arm64.apk`, sau do UAT dang nhap, danh ba, chat Tinode, file va chatbot.
- Commit/PR: `6c62cc4`.

## 2026-08-11-07 - Xay dung ViChat Mobile dung chung Chatmgt va Tinode

- Thoi gian: 2026-08-11 16:15-16:31 (Asia/Saigon)
- Loai: Tinh nang | Bao mat | API | Mobile | Kiem thu | Tai lieu
- Trang thai: Hoan tat code va deploy Chatmgt; cho xac nhan binary native va UAT tai khoan that
- Muc tieu: Xay dung ung dung React Native/Expo cho Android/iOS dung chung tai khoan UpGO, danh ba tenant, conversation, Tinode message/file, chatbot va Workspace voi ChatUI production.
- Pham vi: Du an mobile tach biet tai `mobile/`; hop dong bearer opt-in cho mobile; tai lieu kien truc, Compose/env va kiem thu. Khong thay doi hanh vi dang nhap web, quyen management, message store, group membership, call production hay luong RAG da loai bo.
- File da thay doi: `mobile/` (Expo SDK 57, React Navigation, Zustand, Tinode SDK, SecureStore, picker, Workspace, chatbot topic, theme va test); `chatservice-main/application/config/config.py`; `chatservice-main/application/services/auth_service.py`; `chatservice-main/application/controllers/api_chat_management.py`; `chatservice-main/tests/test_auth_session_scope.py`; `chatservice-main/tests/test_chat_auth_contract.py`; `infrastructure/production/compose.yaml`; `infrastructure/production/.env.example`; `infrastructure/chatservice/compose.yaml`; `infrastructure/chatservice/.env.example`; `README.md`; `docs/chat-backend-architecture.md`; `infrastructure/production/README.md`; `docs/CHANGELOG.md`.
- Noi dung: Mobile dung chung Chatmgt va Tinode theo tenant hien tai, luu Chatmgt bearer JWT trong SecureStore, giu Account session cookie cho SSO revalidation, dong bo realtime text/file/presence/typing/receipt/reaction/recall, danh ba nhan vien active khong can ket ban, tao direct/group conversation, Workspace va topic chatbot Tinode. Calls/push la capability-gated; khong hien Tri thuc AI. Bo sung typing throttle va chup anh native; file vuot 500 MB bi chan truoc upload.
- Quyet dinh ky thuat: Bearer token chi tra khi request co `X-Vichat-Client: mobile` va server bat `CHAT_MOBILE_BEARER_ENABLED`; web van cookie-only. Tinode va Chatmgt tiep tuc la nguon du lieu chuan, khong luu password, khong gui password sang Tinode. Mobile giu metadata khi Tinode tam gian doan va chi vo hieu hoa thao tac realtime.
- Database/API/cau hinh: Khong migration. Them `CHAT_MOBILE_BEARER_ENABLED` (production mac dinh `true`, chatservice local mac dinh `false`) va response auth mobile gom `access_token`, `token_type`, `expires_in`; API web khong doi.
- Kiem thu: `mobile/npm run typecheck` dat; `mobile/npm test` dat 3 file/5 test; `mobile/npm run lint` dat; `mobile/npx expo-doctor` dat 20/20; `mobile/npm run export` dat; `npm run test:frontend` dat 56/56; `python -m unittest chatservice-main/tests/test_chat_auth_contract.py -v` dat 32/32; `python -m py_compile ...` dat; Compose config va `git diff --check` dat. Production image chay auth/session contract 37 test, 12 skip do source frontend khong nam trong image; verifier `verify_deployment.py` va `verify_tenant_isolation.py` deu dat; `/api/v1/auth/health` local/public tra 200; `chatmgt` container healthy, `CHAT_MOBILE_BEARER_ENABLED=true`, ChatUI health `ok`. `npm audit --omit=dev` con 19 advisory transitive (8 moderate, 11 high) tu Expo 57/RN 0.86/Metro, khong ha Expo/RN xuong major cu de tranh pha SDK.
- Rui ro con lai: Chua co JDK/Android SDK, Apple/Google signing credential hoac EAS session tren may nay, nen chua tao APK/AAB/IPA ky va chua UAT WebSocket/upload tren thiet bi that; push dang tat mac dinh vi chua co endpoint dang ky device token. Browser skill khong chay duoc visual QA do runtime khong tao duoc kernel assets.
- Viec tiep theo: Tao development build/EAS voi credential that, dang nhap hai tai khoan trong cung tenant va UAT direct/group/file/chatbot/Workspace tren Android/iOS; push notification van tat mac dinh cho den khi co endpoint dang ky device token.
- Commit/PR: `299943d` da push `origin/master`; release production `/opt/deploy/chat/releases/299943d`, symlink `current` da tro release moi; chi recreate `chatmgt` image `sha256:7fda143321172340885ded40f322e02505193a753de727b20e0922d1f72fa89f`, container `aaf27b1314faffe9006c9fd7ad9b97ba3aa2b5b46ff550d5b4b56e7a1c2b6e3d` healthy. Rollback an toan ve release `/opt/deploy/chat/releases/37510ba`; ChatUI, Tinode bridge/worker, ChatAPI, PostgreSQL, Redis va Coturn khong recreate.

## 2026-08-11-06 - ViChat AI goi provider truc tiep, bo RAG khoi luong chat

- Thoi gian: 2026-08-11 12:48-13:06 (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Giao dien | API | Kiem thu | Tai lieu
- Trang thai: Da deploy production; cho doi tac mo route provider
- Muc tieu: Dua ca luong Tinode chatbot va HTTP fallback cua ViChat AI goi thang API chatbot doi tac, khong truy xuat kho tri thuc/noi dung RAG, dong thoi bo muc `Tri thuc AI` khong con duoc su dung tren ChatUI.
- Pham vi: `POST /api/v1/chatbot/tinode-webhook`, `POST /api/v1/chatbot/message`, payload provider external, menu ChatUI, regression test va tai lieu; khong sua worker Tinode, mapping tenant/UID, history/idempotency, conversation nhan vien/nhom, file, call, auth, database hay cac external knowledge API tuong thich.
- File da thay doi: `chatservice-main/application/controllers/api_chatbot.py`, `chatservice-main/application/services/chatbot_service.py`, `chatservice-main/tests/test_chatbot_webhook_provider.py`, `chatservice-main/tests/test_external_chatbot_contract.py`, `src/app/App.jsx`, `src/features/chatbot/services/chatbotService.js`, `src/features/chatbot/services/chatbotService.test.js`, `README.md`, `docs/chat-backend-architecture.md`, `infrastructure/production/README.md`, va `docs/CHANGELOG.md`.
- Noi dung: Webhook Tinode va endpoint fallback da bo `ChatManagerService.reply()` khoi duong di ViChat AI, goi truc tiep `ChatbotService.reply()` va dat `include_context=False`; payload outbound khong con truong `context`, frontend khong gui `knowledge_base_id`. Xoa import, role guard, menu, title va panel `Tri thuc AI` khoi `App.jsx`. Backend knowledge/external APIs cu van duoc giu de tranh pha integration khac nhung khong con duoc ChatUI hoac ViChat AI su dung.
- Quyet dinh ky thuat: Giu tenant lookup, UID mapping, bounded history, idempotency va worker topic filter nhu cu; chi tach provider call ra khoi retrieval. Tham so `include_context` mac dinh `true` de bao toan contract cua external compatibility endpoint, trong khi hai route ViChat AI truyen `false` de khong gui RAG.
- Database/API/cau hinh: Khong migration, khong doi URL/secret production va khong doi schema request bat buoc. `knowledge_base_id` tu client duoc bo khoi luong `/message`; API chatbot doi tac van cau hinh tai `https://knowledge.gonapp.net/api/v1/chat`.
- Kiem thu: Probe thuc te xac nhan `GET` va `POST https://knowledge.gonapp.net/api/v1/chat` deu tra `404`; `/docs`, `/openapi.json`, cac route chat pho bien cung khong ton tai. Static UI cua doi tac chi su dung CRUD `/api/v1/question_answer_history` va ghi AI auto-answer dang phat trien; ban ghi probe tam da duoc xoa ngay. `python -m unittest chatservice-main/tests/test_chatbot_webhook_provider.py -v` dat 7/7; `npm run test:frontend` dat 56/56; `python -m unittest discover -s chatservice-main/tests -q` dat 130 test, skip 39 test runtime; `python -m py_compile ...` dat; `npm run lint` exit 0 voi warning legacy/vendor/worktree co san; `npm run build:production` dat voi `App-BacIH4Gr.js`; Compose `config --no-interpolate -q` va `git diff --check` dat. Production image test lai 7/7; release health ChatUI `200 ok`, Chatmgt `200 ok`, ca container `healthy`; bundle public khong con `Tri thuc AI`, `KnowledgeManager` hay `VITE_CHATBOT_KNOWLEDGE_BASE_ID`; log 10 phut cua ChatUI/Chatmgt/worker khong co crash marker.
- Rui ro con lai: API doi tac hien van tra 404 nen chua the nhan cau tra loi AI that du backend ViChat da goi dung luong truc tiep. Can don vi van hanh `knowledge.gonapp.net` mo `POST /api/v1/chat` hoac cung cap route/contract dang chay; khong co cach tao noi dung AI tu CRUD history hien tai.
- Viec tiep theo: Don vi van hanh mo va xac nhan `POST /api/v1/chat` tren `knowledge.gonapp.net`, sau do gui mot tin nhan UAT vao topic Tro ly AI; worker se tu dung duong provider truc tiep ma khong can sua lai ChatUI. Cac service employee/group/file khong can thao tac.
- Commit/PR: `37510ba`; release `/opt/deploy/chat/releases/37510ba`, symlink `current` da tro release moi. Chi recreate `chat` (`1d81d2eae5d7`) va `chatmgt` (`9fab40306bca`); worker `2a97cdc39705`, bridge `0919575eb188`, ChatAPI `8476615ad4ac`, hai PostgreSQL, Redis va Coturn giu nguyen.

## 2026-08-11-05 - Tich hop Chatbot qua Tinode webhook

- Thoi gian: 2026-08-11 10:33-11:02 (Asia/Saigon)
- Loai: Tinh nang | Bao mat | API | Ha tang | Kiem thu | Tai lieu
- Trang thai: Hoan tat production; cho UAT tin nhan bot bang tai khoan UpGO that
- Muc tieu: Dua chatbot vao cung luong Tinode dang chay, giu chatbot theo tenant cua nhan vien va khong doc/anh huong cac topic nhan vien, nhom, file hay goi dien.
- Pham vi: Tai khoan bot Tinode server-side, worker `tinode-chatbot-webhook`, hai endpoint Chatmgt cho runtime config/webhook, ChatUI transport Tinode co fallback HTTP, Compose/env production, test va tai lieu; khong migration, khong doi schema Tinode/Chatmgt va khong doi luong chat thuong.
- Noi dung: Chatmgt tu login/provision bot qua relay noi bo, cap `GET /api/v1/chatbot/tinode-config` cho phien da xac thuc. Worker chi subscribe topic truc tiep `usr*`, loc bo system/friend/reaction/recall, goi `POST /api/v1/chatbot/tinode-webhook` bang shared key, map `sender_uid` vao `ManagementAccount` active cung tenant, luu history/idempotency va publish cau tra loi ve dung topic. ChatUI giu synthetic ID `bot-songhong` nhung dung UID Tinode lam topic; neu bot/realtime khong san sang thi van dung provider HTTP hien tai.
- Quyet dinh ky thuat: Khong cho browser goi truc tiep doi tac. Cursor worker duoc ghi atomic trong volume rieng; loi provider chi tao cau tra loi tam thoi. Endpoint doi tac `https://knowledge.gonapp.net/api/v1/chat` hien dang tra `404` khi probe, vi vay production se an toan fallback cho den khi route duoc mo.
- Database/API/cau hinh: Them cac bien `TINODE_CHATBOT_*`, service Compose `tinode-chatbot-webhook` va volume `tinode_chatbot_state`; khong migration. Shared webhook key va mat khau bot chi dat trong `.env` production, khong ghi vao nhat ky.
- Kiem thu: `npm run test:frontend` dat 55/55; `npm run lint` exit 0 (chi warning legacy/vendor/worktree co san); `npm run build:production` dat voi bundle `App-GtSLfGNI.js`; `python -m unittest discover -s chatservice-main/tests -q` dat 128 test, skip 39 test can dependency runtime; `python -m py_compile ...` dat; `docker compose -f infrastructure/production/compose.yaml config --no-interpolate -q` dat; `git diff --check` dat. Build/image production phat hien `asyncio.Lock()` tao luc import khong tuong thich `uvloop` va worker entrypoint keo theo package Chatmgt/Redis; code doi sang lazy lock, sau do tach worker thanh runtime Tinode doc lap khong import `application` va khong nhan secret DB/JWT. Chatmgt moi da healthy HTTP 200; worker duoc rebuild rieng voi regression test.
- Kiem thu production: `chat` public health 200, `chatmgt` public health 200, worker `/healthz` healthy va log `Tinode chatbot connected`; request khong session vao `tinode-config` tra 401, webhook khong shared key tra 401, bundle ChatUI co marker `tinode-config`; chat/chatmgt/worker khong co marker `traceback|panic|fatal|critical|emerg`. Probe doi tac tra 404 nen worker dang giu failure reply an toan cho den khi route duoc mo.
- Trien khai: Commit code `19acfb7`, fix lazy lock `2ee2ce9`, worker isolation `db7b64f`; release bat bien `/opt/deploy/chat/releases/db7b64f` (archive SHA-256 `FC096C193FFDD00ADE02EFDA52705F1946DC43EBAD2B748C63D0E755CC0C616D`); image ChatUI `sha256:223696ca24f161e965365372886f34bbeb8e02ed3216e27e5a06ec4e090d0c31`, Chatmgt `sha256:a647eb4f96a81040011e7541e805832b2cd71842f75bf086ec02bd5d0f78e61d`, worker `sha256:93c132a2d8981d8222aab05957fcea9273a59788c065b704ca6a1bc434f74a10`; container `chat=ece6600d1e4a`, `chatmgt=39b494547a04`, `tinode-chatbot-webhook=2a97cdc39705`. Chi ba service nay duoc recreate; bridge `0919575eb188`, ChatAPI `8476615ad4ac`, Chat PostgreSQL `78a434b49404`, Tinode PostgreSQL `9f6e4dcc9c2f`, Redis `ceef7df23feb` va Coturn `aa680d35fdc0` giu nguyen.
- Rui ro con lai: Doi tac `https://knowledge.gonapp.net/api/v1/chat` dang tra 404, nen chua the xac nhan noi dung AI that; bot van ket noi Tinode va fallback reply khong lam anh huong chat thuong. Can UAT voi mot tai khoan UpGO that sau khi doi tac mo route.
- Viec tiep theo: Hard refresh ChatUI, mo topic Tro ly AI va gui mot cau hoi; neu provider da mo route thi doi chieu reply/history cung tenant, sau do kiem tra nhanh direct/group/file/upload khong thay doi.
- Commit/PR: `19acfb7`, `2ee2ce9`, `db7b64f`.

## 2026-08-11-04 - Mo rong upload va sua vi tri tin nhan thu hoi

- Thoi gian: 2026-08-11 09:33 (Asia/Saigon)
- Loai: Sua loi | Giao dien | Cau hinh | Kiem thu | Tai lieu
- Trang thai: Da commit, push va deploy ChatUI; dang cho UAT upload file that
- Muc tieu: Cho phep gui file/anh lon nhu file 161 MB trong gioi han an toan, khong cho thu hoi khi noi dung chua gui xong va giu placeholder thu hoi o dung phia nguoi gui.
- Pham vi: Upload media ChatUI qua Nginx/Tinode, policy thao tac tin nhan, recall event va regression test; khong sua auth, tenant, danh ba, Chatmgt API, database, topic, noi dung tin nhan khac hay cac luong realtime ngoai gui/thu hoi.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/tinodeClient.js`, `src/features/chat/services/messagePolicy.js`, `src/features/chat/services/messagePolicy.test.js`, `infrastructure/production/nginx.conf`, `infrastructure/production/nginx-host-chat.conf`, `package.json`, va `docs/CHANGELOG.md`.
- Noi dung: Tang body limit cua ca Nginx public va Nginx trong image tu muc 9/50 MB len 600 MB de du multipart overhead cho file toi da 500 MB; ChatUI chan ngay file vuot 500 MB truoc khi tao bubble. Nut thu hoi bi an khi message dang `pending`/`sending`, da loi hoac da thu hoi; handler va Tinode client tiep tuc tu choi neu bi goi truc tiep. File sau publish luu them sequence server de hard-delete dung packet. Recall event dung Tinode UID da xac thuc cua actor va placeholder legacy uu tien actor UID, nen ben nguoi gui van render outgoing thay vi nhay sang phia nguoi nhan.
- Quyet dinh ky thuat: Nguon tac gia cua recall la Tinode session hien tai vi optimistic message co the con mang Chatmgt account ID; chi noi dung da duoc Tinode xac nhan moi duoc thu hoi. Gioi han UI 500 MB thap hon Nginx 600 MB de chua multipart overhead va thap hon media limit 512 MiB cua Tinode. Probe `Content-Length` 161 MB truoc deploy xac nhan `chat.upgo.vn` tra `413` ngay tai Nginx host, con probe sau deploy khong con bi tu choi tai lop nay.
- Database/API/cau hinh: Khong migration, khong doi API va khong them bien moi truong. Doi duy nhat `client_max_body_size` cua hai lop Nginx lien quan upload; ChatUI image da rebuild va host Nginx da reload.
- Kiem thu: `npm run test:frontend` dat 54/54, gom policy file/recall va formatter UI; `npm run lint` exit 0 voi warning legacy/vendor/worktree co san; `npm run build:production` dat voi `App-DpBLu8xt.js`; Compose `config --no-interpolate -q` dat; `git diff --check` dat. Chua chay `nginx -t` local vi Docker daemon/Nginx khong kha dung; test contract da xac nhan ca hai config dung `600m`.
- Kiem thu production: `nginx -t` va reload host Nginx dat; ChatUI public `/healthz` va Chatmgt `/api/v1/auth/health` deu HTTP 200; bundle public la `index-BnVa9alt.js` + `App-epuS0SMG.js` va co marker gioi han 500 MB, recall guard va moc thoi gian; probe `Content-Length` 161 MB qua `https://chat.upgo.vn/v0/file/u/` khong con tra `413` ngay ma cho body; rollback filesystem backup `/opt/deploy/chat/backups/chatui-before-b9e80de.tar` co SHA-256 `7608ad9e011f61a53d0ce9616e85f3afd8ceb9078010e36747709d3f829f8f70`.
- Trien khai: Commit `b9e80de` da push `origin/master`; release bat bien `/opt/deploy/chat/releases/b9e80de`; image ChatUI `sha256:599b1380f6cb8b345e19e87f7cd48b13d43e12e1ef8d3d47165455d7f405e7ca`, container `c77deafabfa3` healthy; chi service `chat` duoc force-recreate va Nginx host `chat` duoc reload voi `client_max_body_size 600m`; Chatmgt, bridge, ChatAPI, hai PostgreSQL, Redis va Coturn giu nguyen container ID.
- Rui ro con lai: Chua UAT bang tai khoan that voi file 161 MB va file vuot 500 MB; probe khong gui body nen chua thay ket qua Tinode sau khi upload du lieu day du.
- Viec tiep theo: Hard refresh ChatUI, gui file 161 MB, xac nhan file tren 500 MB bi chan ngay, sau do thu hoi tin text/anh/file da gui thanh cong tu hai tai khoan; neu UAT loi can giu nguyen cac luong khac va chi mo log upload.
- Commit/PR: `b9e80de`.

## 2026-08-11-03 - Lam gon nut thao tac va hien thi moc thoi gian ChatUI

- Thoi gian: 2026-08-11 01:29 (Asia/Saigon)
- Loai: Giao dien | Kiem thu | Tai lieu
- Trang thai: Da deploy cung release `b9e80de`; dang cho UAT truc quan
- Muc tieu: Lam gon nut trong chi tiet cuoc tro chuyen va hien thi tuoi tin nhan ngan gon, de doc nhanh hon ma khong doi luong du lieu hay thao tac.
- Pham vi: Chi ChatUI detail actions, dong thoi gian danh sach hoi thoai, nhan thoi gian trong bong chat va moc ngay trong lich su; khong sua auth, danh ba, tenant, Tinode, Chatmgt, API, database hay noi dung tin nhan.
- File da thay doi: `src/app/App.jsx`, `src/styles/index.css`, `src/features/chat/services/timeFormatting.js`, `src/features/chat/services/timeFormatting.test.js`, va `docs/CHANGELOG.md`.
- Noi dung: Nut tat thong bao duoc dat trong the bo tron co vien/hover, nut roi nhom va xoa hoi thoai dung radius 16px voi trang thai hover/focus ro rang; danh sach hien `Vua xong`, phut, gio, `Hom qua`, so ngay, sau 7 ngay chuyen `dd/mm`; tooltip van giu ngay gio day du. Lich su chat hien moc `Hom nay`, `Hom qua` hoac ngay cu the va moi tin van hien gio `HH:mm`.
- Quyet dinh ky thuat: Formatter thuần duoc tach rieng de test, lay `createdAt`/`updatedAt` lam nguon chuan va chi fallback ve chuoi gio cu; clock giao dien cap nhat moi phut de tuoi tin nhan tu thay doi, khong sua payload hoac state realtime.
- Database/API/cau hinh: Khong migration, khong doi API, khong them bien moi truong va khong doi cau hinh deploy.
- Kiem thu: `node --test src/features/chat/services/timeFormatting.test.js` dat 4/4; `npm run test:frontend` dat 47/47; `npm run lint` exit 0 voi warning legacy/vendor/worktree co san; `npm run build:production` dat; `git diff --check` dat. Browser skill da thu ket noi nhung moi truong khong co browser kha dung, nen chua UAT truc quan desktop/mobile.
- Rui ro con lai: Chua UAT truc quan tren tai khoan production; can hard refresh de xac nhan style va moc thoi gian voi du lieu Tinode that.
- Viec tiep theo: Hard refresh va review moc thoi gian, nut chi tiet tren desktop/mobile bang du lieu Tinode that.
- Commit/PR: `b9e80de`; chi tiet release duoc ghi tai muc `2026-08-11-04`.

## 2026-08-11-02 - Rut gon username email trong danh ba ChatUI

- Thoi gian: 2026-08-11 00:45 (Asia/Saigon)
- Loai: Giao dien | Kiem thu | Tai lieu
- Trang thai: Hoan tat production; cho UAT danh ba that
- Muc tieu: Bo phan domain email dai dong trong username phu cua danh ba, giu giao dien gon ma khong thay doi danh tinh hay du lieu tai khoan.
- Pham vi: Duy nhat dong username ben duoi ten nhan vien trong danh sach mac dinh cua panel `Danh ba`, helper/test hien thi va nhat ky thay doi; khong sua ten nhan vien, trang thai, tenant filter, tim kiem, nut nhan tin, backend, Account, Tinode, database hay cau hinh.
- File da thay doi: `src/app/App.jsx`, `src/features/contacts/services/accountDirectory.js`, `src/features/contacts/services/accountDirectory.test.js`, va `docs/CHANGELOG.md`.
- Noi dung: Username dang email nhu `nhanvien@gmail.com` hien thanh `@nhanvien`; username khong phai email nhu `nhanvien.noibo` van hien `@nhanvien.noibo`; username trong thi khong them metadata phu.
- Quyet dinh ky thuat: Chi dinh dang chuoi khi render bang cach bo cac dau `@` dau chuoi va lay phan truoc dau `@` domain dau tien. Gia tri username goc tu API khong bi sua va tiep tuc duoc dung cho xac thuc/anh xa nhu cu.
- Database/API/cau hinh: Khong migration, khong doi API va khong them bien moi truong.
- Kiem thu: `node --test src/features/contacts/services/accountDirectory.test.js` dat 15/15; `npm run test:frontend` dat 47/47; `npm run build:production` dat voi `App-C_iWggvc.js`, `index-2ufs2t9s.js`, `ManagementApp-ClHfwRxc.js` va cac CSS tuong ung; `npm run lint` exit 0, chi con warning legacy/vendor/worktree co san; `git diff --check` dat. Production archive SHA-256 `f90ef6e496630beb9a7b5a4c71302a8158fdef68f35440211beced3f2bc225a0`; Compose config va Nginx syntax dat; source/image/public bundle deu co logic `split('@')[0]`; public `/healthz` va Chatmgt auth health deu HTTP 200; public entry `index-A9KGAcA9.js` tham chieu chunk `App-CSOrRsxL.js`; ChatUI healthy va log khong co `traceback|panic|fatal|critical|emerg`.
- Trien khai: Commit `28215e2` da push `origin/master`; release bat bien `/opt/deploy/chat/releases/28215e2`; image ChatUI `sha256:de36338e0ee20bc9dd75c0ef6477cf63ad2d45414b605b8c0861562f2e2f41fe`, container `1b2fd1fc50c6` healthy va rollback tag `songhong-production-chat:rollback-before-28215e2` giu image cu `sha256:94569b6c8807330996ad008e2a47a3b836456fa80d13e1d28acdec7ff8febd8e`. Chi service `chat` duoc force-recreate; Chatmgt `8724737473f3`, bridge `0919575eb188`, ChatAPI `8476615ad4ac`, Chat PostgreSQL `78a434b49404`, Tinode PostgreSQL `9f6e4dcc9c2f`, Redis `ceef7df23feb` va Coturn `aa680d35fdc0` khong doi; symlink `current` da tro release moi; khong migration, reset volume, topic hay message.
- Rui ro con lai: Chua UAT truc quan bang danh ba production sau hard refresh.
- Viec tiep theo: Hard refresh ChatUI va mo `Danh ba` de xac nhan username email chi con phan dau, vi du `@nhanvien`.
- Commit/PR: Code `28215e2`; commit ghi nhan trien khai xem `git log`.

## 2026-08-11-01 - Hien thi ten cong ty UpGO trong danh ba ChatUI

- Thoi gian: 2026-08-11 00:33 (Asia/Saigon)
- Loai: Giao dien | Bao mat | Kiem thu | Tai lieu
- Trang thai: Hoan tat production; cho UAT hai tenant UpGO that
- Muc tieu: Thay tieu de danh ba chung bang ten cong ty cua tenant UpGO hien tai va bo sung lop phong thu frontend de danh ba/ket qua tim kiem khong hien thi tai khoan thuoc cong ty khac.
- Pham vi: Tieu de va tap du lieu hien thi trong panel `Danh ba` cua ChatUI, helper/test danh ba va nhat ky thay doi; khong sua API backend, login, Account session, friendship, conversation/group, Tinode, database, cau hinh hay cac man hinh khac.
- File da thay doi: `src/app/App.jsx`, `src/features/contacts/services/accountDirectory.js`, `src/features/contacts/services/accountDirectory.test.js`, va `docs/CHANGELOG.md`.
- Noi dung: Tieu de danh sach mac dinh hien `Nhan vien · <ten cong ty>` tu `tenantName` trong phien UpGO da xac thuc, fallback ve `Nhan vien cong ty` neu ten trong. Danh sach mac dinh va ket qua tim kiem cung dung mot bo loc chi chap nhan tai khoan active co `tenantId` trung voi current user; khi current user co tenant thi ban ghi thieu tenant cung khong duoc hien thi.
- Quyet dinh ky thuat: Chi dung tenant ID/tenant name da tra ve trong phien Chatmgt, khong cho browser chon hoac truyen tenant moi. Lop frontend nay la phong thu bo sung; backend `/api/v1/chat/users` van lay tenant tu JWT va loc `ManagementAccount.tenant_id == tenant_id` nhu cu, nen khong thay doi nguon du lieu chuan hay luong dang hoat dong.
- Database/API/cau hinh: Khong migration, khong doi request/response API va khong them bien moi truong.
- Kiem thu: `node --test src/features/contacts/services/accountDirectory.test.js` dat 14/14; `npm run test:frontend` dat 46/46; `npm run build:production` dat voi `App-DlJa3EoV.js`, `index-DDvaCTYS.js`, `ManagementApp-BGNQ4fYT.js` va cac CSS tuong ung; `npm run lint` exit 0, chi con warning legacy/vendor/worktree co san va khong co warning trong pham vi; `git diff --check` dat. Production archive SHA-256 `11ece709165b866b69cbdb0a62b79c842f826a539ed9eeaaedacce75a38af317`; Compose config va Nginx syntax dat; image marker xac nhan co ca tieu de dong `Nhan vien ·` va fallback; public `/healthz` va Chatmgt auth health deu HTTP 200; public entry `index-CTORNgBh.js` tham chieu chunk `App-D1T_OTh4.js` co marker ten cong ty; ChatUI healthy va log khong co `traceback|panic|fatal|critical|emerg`. Browser skill khong co browser session kha dung, nen chua UAT truc quan bang phien UpGO production.
- Trien khai: Commit `ccab56d` da push `origin/master`; release bat bien `/opt/deploy/chat/releases/ccab56d`; image ChatUI `sha256:94569b6c8807330996ad008e2a47a3b836456fa80d13e1d28acdec7ff8febd8e`, container `21485a095879` healthy va rollback tag `songhong-production-chat:rollback-before-ccab56d` giu image cu `sha256:d41131e98feeb251e503aef14e096d1a68fdffb3217e9b155f45a93aaa9e0644`. Chi service `chat` duoc force-recreate; Chatmgt `8724737473f3`, bridge `0919575eb188`, ChatAPI `8476615ad4ac`, Chat PostgreSQL `78a434b49404`, Tinode PostgreSQL `9f6e4dcc9c2f`, Redis `ceef7df23feb` va Coturn `aa680d35fdc0` khong doi; symlink `current` da tro release moi; khong migration, reset volume, topic hay message.
- Rui ro con lai: Chua xac nhan truc quan ten cong ty that co do dai lon trong panel nho va chua nghiem thu bang hai tenant UpGO production.
- Viec tiep theo: Hard refresh ChatUI, mo `Danh ba` bang hai cong ty khac nhau va xac nhan moi phien hien dung ten cong ty cung chi cac nhan vien cung tenant.
- Commit/PR: Code `ccab56d`; commit ghi nhan trien khai xem `git log`.

## 2026-08-10-01 - Gioi han Chatmgt chi quan ly van hanh user

- Thoi gian: 2026-08-10 17:02 (Asia/Saigon)
- Loai: Bao mat | Sua loi | Giao dien | API | Tai lieu
- Trang thai: Hoan tat production; cho UAT tai khoan UpGO that
- Muc tieu: Chi cho `admin`, `owner` hoac `superadmin` cua dung cong ty dang nhap Chatmgt qua UpGO Account; khong hien thi thong tin conversation/nhom va chi cho phep thao tac bat tai khoan khac dang xuat khoi Chat.
- Pham vi: Management UI, management-only API create/update/reset/conversation metadata, deployment verifier va tai lieu ranh gioi dich vu; khong sua ChatUI cua nhan vien, API conversation/group/friendship dung boi ChatUI, Tinode message/topic, Account credential login, database hay du lieu dang chay.
- File da thay doi: `src/features/management/ManagementApp.jsx`, `src/features/management/management.css`, `src/features/management/services/managementAdminService.js`, `src/features/management/services/managementAdminService.test.js`, `chatservice-main/application/config/config.py`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `README.md`, `docs/chat-backend-architecture.md`, `infrastructure/production/README.md`, va `docs/CHANGELOG.md`.
- Noi dung: Go menu, metric, danh sach va request metadata conversation khoi Chatmgt; go nut/link them hoac moi nhan vien, sua ho so, khoa/mo khoa va reset mat khau. Danh ba quan tri tiep tuc hien projection user cung tenant, trang thai Account/Tinode, health va audit; thao tac tren tung user chi con `Bat dang xuat khoi Chat`. Backend tu choi management create/update/reset bang `403 MANAGEMENT_USER_ACTION_DISABLED` va tu choi `/api/v1/admin/conversations` bang `403 MANAGEMENT_CHAT_METADATA_HIDDEN`; revoke-session giu nguyen auth-version, tenant filter va audit hien tai.
- Quyet dinh ky thuat: Bao ve hai lop UI va API de khong the goi truc tiep cac chuc nang da an. Giu code local-recovery cu nhung khoa mac dinh bang `CHATMGT_MANAGEMENT_USER_MUTATIONS_ENABLED = False`; khong them bien moi truong production de tranh vo tinh bat lai. Giu UpGO Account la nguon chuan cho membership/profile/role/status va giu Chatmgt/Tinode lien ket nhu cu cho luong nhan vien.
- Database/API/cau hinh: Khong migration va khong doi schema. API doc user, audit, health va revoke-session giu hop dong; ba mutation management va admin conversation overview doi thanh `403` theo policy moi. Khong sua Compose runtime hay secret.
- Kiem thu: `node --test src/features/management/services/managementAdminService.test.js` dat 3/3; `npm run test:frontend` dat 44/44; `npm run build:production` dat voi `ManagementApp-DBA9xoFv.js`, `ManagementApp-9vxvFDdJ.css`, `App-DdAT4C8N.js` va `index-GUQaBgZW.js`; `python -m unittest chatservice-main/tests/test_chat_auth_contract.py -v` dat 32/32; `python -m unittest discover -s chatservice-main/tests -q` dat 122 test, skip 39 test can dependency runtime; `python -m py_compile ...` dat; `npm run lint` exit 0, chi con warning legacy/vendor/worktree co san; `git diff --check` dat. Production `verify_deployment.py` dat database/credential policy, health/CORS, directory, conversation, Tinode WebSocket, login/logout; `verify_tenant_isolation.py` dat hai tenant user/conversation/friend/participant; Nginx syntax dat; public ChatUI `/healthz` va Chatmgt `/api/v1/auth/health` deu HTTP 200; bundle cong khai dung `index-BNrSCk79.js` va `ManagementApp-DiAGCT_T.js`, khong con ba marker UI bi cam va van co `Bắt đăng xuất khỏi Chat`; log hai container khong co `traceback|panic|fatal|critical|emerg`.
- Trien khai: Commit `3961f80` da push `origin/master`; archive release `/opt/deploy/chat/releases/3961f80` co SHA-256 `9e2a55a7fff4883c538d010fb8874616ebe4ff883f5be674bb2f88ea5a266d30`; image ChatUI `sha256:d41131e98feeb251e503aef14e096d1a68fdffb3217e9b155f45a93aaa9e0644`, container `6fd274f17a91` healthy; image Chatmgt `sha256:d91e56e67328c7db5421ee28d7e35ac7519d39070c7ccd33e4bc3d3322f62cb7`, container `8724737473f3` healthy. Rollback tags `songhong-production-chat:rollback-before-3961f80` (`sha256:6f98ed19504dba7f1d58604278dfe7d8024a70deb80a4864edf53bf8917c1d86`) va `songhong-production-chatmgt:rollback-before-3961f80` (`sha256:1c0b34b3f8958cc881a02eaa831358a44e106b7d1427d343b7618d382a0c779c`) da giu lai. Chi `chat` va `chatmgt` duoc force-recreate; bridge `0919575eb188`, ChatAPI `8476615ad4ac`, Chat PostgreSQL `78a434b49404`, Tinode PostgreSQL `9f6e4dcc9c2f`, Redis `ceef7df23feb`, Coturn `aa680d35fdc0` khong doi; symlink `current` da tro release moi; khong migration, reset volume, topic hay message.
- Rui ro con lai: Chua UAT bang UpGO employee thuong, admin dung tenant, admin tenant khac va thao tac bat dang xuat tren trinh duyet that.
- Viec tiep theo: Hard refresh `chatmgt.upgo.vn`, dang nhap bang UpGO Account admin va xac nhan danh ba/audit/health; thu bat dang xuat mot tai khoan test va doi chieu ChatUI nhan `SESSION_REVOKED`.
- Commit/PR: Code `3961f80`; commit ghi nhan trien khai xem `git log`.

## 2026-08-08-04 - Bo them thanh vien khoi chi tiet nhom ChatUI

- Thoi gian: 2026-08-08 01:36 (Asia/Saigon)
- Loai: Sua loi | Giao dien | Tai lieu
- Trang thai: Hoan tat production; cho UAT group detail
- Muc tieu: Khong con hien thi hoac thuc thi luong `Them thanh vien` tu group detail panel vi viec moi nhan vien vao tenant duoc quan ly qua UpGO Account.
- Pham vi: Duy nhat group detail/add-member flow trong `src/app/App.jsx`, contract test frontend va nhat ky thay doi; khong sua backend Chatmgt, Tinode, tao nhom, xoa thanh vien, roi nhom, xoa cuoc tro chuyen, tin nhan, mute hay demo group con lai.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatManagementService.test.js`, va `docs/CHANGELOG.md`.
- Noi dung: Xoa nut `Them`, modal them thanh vien, state/ref, `openAddMembers()` va `handleAddMembers()` cung import demo khong con dung. Candidate list cua modal tao nhom tiep tuc dung `existingMemberIds = []`, nen tim/chon thanh vien khi tao nhom khong bi loc theo nhom dang mo.
- Quyet dinh ky thuat: Chi bo entry point UI va logic cuc bo trong ChatUI. Giu nguyen `chatManagementService.addConversationParticipants()` va `tinodeClient.addMember()` de bao toan hop dong backend/utility cho use case khac. Contract test xac nhan cac binding add-member da bien mat trong khi create/remove/leave/delete group flow van ton tai.
- Database/API/cau hinh: Khong migration, khong doi API, khong doi bien moi truong va khong sua CSS cu.
- Kiem thu: Local `node --test src/features/chat/services/chatManagementService.test.js` dat 3/3; `npm run test:frontend` dat 45/45; `npm run build:production` dat voi bundle ChatUI `App-CkWsVoVO.js`; `npm run lint` exit 0, chi con warning legacy/vendor/worktree co san va khong co warning trong file pham vi; source checks xac nhan add-member bindings khong con, cac handler create/remove/leave/delete va hai service API van con; `git diff --check` dat. Production archive SHA-256 `66c0efdaaa4754b2715dfe1370f157d2ded1dbd6c0ed61f262ce63da2382bf54`; Compose config va Nginx syntax dat; container/image/release label dat; public `/healthz`, entry bundle `index-BfFx2XEk.js`, chunk `App-JYOtruUZ.js` va Chatmgt auth health deu HTTP 200. Entry bundle tham chieu dung chunk App; chunk khong con `btn-add-member`/`group-members-modal` va van co `btn-remove-member`, `btn-leave-group`, `btn-delete-conversation`, `create-group-modal`; log ChatUI sau deploy khong co `panic|fatal|critical|emerg|error`.
- Trien khai: Commit `72a6013` da push `origin/master`; release bat bien `/opt/deploy/chat/releases/72a6013`; image ChatUI `sha256:9144b3529ddf6a985073010bb5d358c67a2feeff80fed396b35569dfcc080734`, container `7a0622e99013` healthy va rollback tag `songhong-production-chat:rollback-before-72a6013` giu image cu `sha256:dad77a148c3b5cbd403c5d80fa9d412211f92fdecd4c590feef85bd08214f153`. Chi service `chat` duoc recreate va symlink `current` da tro release moi; ID Chatmgt `04b6fa6d175d`, bridge `0919575eb188`, ChatAPI `8476615ad4ac`, hai PostgreSQL, Redis va Coturn khong doi; khong migration, reset volume, topic hay message.
- Rui ro con lai: Chua thao tac UAT group detail va modal tao nhom bang tai khoan that tren trinh duyet.
- Viec tiep theo: Hard refresh ChatUI, mo mot nhom de xac nhan khong con nut/modal `Them`, sau do tao nhom, xoa mot thanh vien, roi nhom va xoa conversation de doi chieu cac luong giu nguyen.
- Commit/PR: Code `72a6013`; commit ghi nhan trien khai xem `git log`.

## 2026-08-08-03 - Fallback tenant active khi dang nhap UpGO Account

- Thoi gian: 2026-08-08 01:03 (Asia/Saigon)
- Loai: Sua loi | Xac thuc | Tai lieu
- Trang thai: Hoan tat production; cho UAT tai khoan UpGO that
- Muc tieu: Khong tra `ACCOUNT_TENANT_INVALID` khi UpGO Account con it nhat mot membership active nhung `current_tenant_id` dang cu, khong con trong danh sach active, hoac dang o trang thai inactive/invited/pending.
- Pham vi: Chuan hoa Account session trong Chatmgt, log chan doan tai hai luong credential login/current session, unit test lien quan, mo ta kien truc Step 2 va release bat bien `/opt/deploy/chat/releases/db899e1`; chi recreate `chatmgt`, khong sua controller tenant boundary, ChatUI, danh ba, conversation, Tinode, database hay cau hinh production.
- File da thay doi: `chatservice-main/application/services/sso_identity.py`, `chatservice-main/application/services/account_sso_service.py`, `chatservice-main/tests/test_sso_identity.py`, `chatservice-main/tests/test_account_sso_service.py`, `docs/chat-backend-architecture.md`, va `docs/CHANGELOG.md`.
- Noi dung: Giu nguyen tenant hien tai khi membership do active. Neu tenant hien tai khong hop le, chon membership active dau tien theo thu tu UpGO tra ve va dung role cua membership duoc chon thay vi `current_tenant_role` cu. Chi bao loi membership trong truong hop khong co membership active. Hai diem bat `SSOIdentityError` ghi warning gom user ID, user name, current tenant ID, danh sach tenant ID va noi dung loi; khong ghi password, cookie, token hay profile day du.
- Quyet dinh ky thuat: Dat fallback ngay trong `normalize_account_session()` de moi consumer nhan cung identity da chuan hoa. Sau fallback dat lai co tenant explicit de role duoc lay tu membership moi. Giu nguyen phep so sanh tenant co dinh tai bien controller, nen membership active cua cong ty khac van bi tu choi.
- Database/API/cau hinh: Khong co migration, khong doi hop dong API va khong them bien moi truong.
- Kiem thu: Local `python -m unittest chatservice-main/tests/test_sso_identity.py -v` dat 21/21; `uv run --with aiohttp==3.13.5 python -m unittest chatservice-main/tests/test_account_sso_service.py -v` dat 14/14; `python -m unittest discover -s chatservice-main/tests -v` dat 122 test, skip 39 test can dependency runtime; `python -m py_compile ...` va `git diff --check` dat. Production archive SHA-256 `2e3deec36d935e99924f0b9010c760c1429de50195c5d76f886587daf0887297`; focused gate trong image dat 80 test, skip 12 source-only; running container dat lai 4/4 test fallback/logging. Full suite image chay 122 test nhung con 8 loi test harness co san, da tai hien tren image production cu: 6 fake Tinode WebSocket khong nhan tham so `headers` va 2 source-contract tim frontend/Compose khong duoc copy vao image. `verify_deployment.py`, `verify_tenant_isolation.py`, database revision, credential policy, health/CORS/directory/conversation/Tinode WebSocket/login/logout, Nginx syntax, public auth health va empty credential `400 ACCOUNT_CREDENTIALS_REQUIRED` deu dat; log khong co traceback/panic/fatal/critical/emerg.
- Trien khai: Commit `db899e1` da push `origin/master`; image Chatmgt moi `sha256:d9f3c3a0d135c26203e0d4047bffc0967d7af85a8ac720767b11ecf8d67b6f6b`, container `04b6fa6d175d` healthy va rollback tag `songhong-production-chatmgt:rollback-before-db899e1` giu image cu `sha256:a2853d9447c55d37b87b1f064b2c3c51cdeffdfda3ce9c895cd3344f059aab94`. Hai lan acceptance dau tu rollback an toan do checkpoint Docker label/HTTP harness, khong do loi ung dung; lan cuoi tat ca gate dat va symlink `current` tro release moi. ID ChatUI `3556150c67fe`, bridge `0919575eb188`, ChatAPI `8476615ad4ac`, hai PostgreSQL, Redis va Coturn khong doi; khong migration, reset volume, topic hay message.
- Rui ro con lai: Chua UAT bang response UpGO Account that co current tenant stale/inactive va membership cong ty active. Tam thoi full suite trong image van co 8 loi test harness co san neu chay khong loc nhu mo ta o muc kiem thu.
- Viec tiep theo: Dang nhap lai bang tai khoan employee tung gap loi, xac nhan ChatUI chon membership active dung cong ty, tai danh ba va lay Tinode token binh thuong; sua rieng fake WebSocket/source-only guards cua full-suite trong mot thay doi doc lap neu can.
- Commit/PR: Code `db899e1`; commit ghi nhan trien khai xem `git log`.

## 2026-08-08-02 - Bo thuong hieu Song Hong khoi preview link ChatUI

- Thoi gian: 2026-08-08 00:27 (Asia/Saigon)
- Loai: Sua loi | Thuong hieu | Giao dien | Van hanh
- Trang thai: Hoan tat production; cho cache preview cap nhat
- Muc tieu: Link `chat.upgo.vn` khi chia se khong con hien dong `SONG HONG`; metadata phai ghi ro san pham do Gon Platform phat trien.
- Pham vi: Duy nhat the mo ta HTML dung cho preview link ChatUI, nhat ky thay doi va release bat bien `/opt/deploy/chat/releases/949d32d`; khong sua component, auth, danh ba, conversation, Tinode, chatbot, API, database, cau hinh hay du lieu.
- File da thay doi: `index.html` va `docs/CHANGELOG.md`.
- Noi dung: Doi `meta description` tu mo ta thuong hieu Song Hong sang `Nen tang chat va cong tac noi bo doanh nghiep do Gon Platform phat trien.`; giu nguyen title `Chat - Power by Gon Platform` va toan bo runtime.
- Quyet dinh ky thuat: Sua dung nguon ma cac trinh tao link preview dang doc, khong tim/thay the cac chuoi Song Hong o Tinode app name, chatbot, CSS hoac du lieu demo vi cac chuoi do thuoc luong khac va khong tao dong preview trong anh bao loi.
- Database/API/cau hinh: Khong co.
- Kiem thu: Local `npm run build:production` dat; `npm run test:frontend` dat 44/44; `dist/index.html` sau build co description Gon Platform moi; `git diff --check` dat. Production archive SHA-256 `5eb1f61efbb96365b7c2e56666db1b0b028e57968e4f0e4112668be66cbbb109`; Compose config va Nginx syntax dat; public HTML co description moi va khong con description Song Hong cu; ChatUI/Chatmgt health deu HTTP 200. Bundle van co danh ba `Nhan vien cong ty`, `account_password` va tenant `tn6913580727957397`; ID cac container backend khong doi.
- Trien khai: Commit `949d32d` da push `origin/master`; image ChatUI moi `sha256:dad77a148c3b`, container `3556150c67fe` healthy va rollback tag `songhong-production-chat:rollback-before-949d32d` giu image `sha256:b2fad041e52e`. Symlink `current` da tro release moi; chi service `chat` duoc recreate.
- Rui ro con lai: Dich vu/ung dung nhan link co the cache preview cu; co the can gui URL kem query vo hai, vi du `https://chat.upgo.vn/?v=gon`, hoac doi cache het han de thay metadata moi ngay.
- Viec tiep theo: Gui lai link va doi chieu preview moi; neu client van hien du lieu cu thi xoa message preview cu hoac dung URL kem query de buoc client lay lai metadata.
- Commit/PR: Code `949d32d`; commit ghi nhan trien khai xem `git log`.

## 2026-08-08-01 - Hien toan bo nhan vien trong danh ba noi bo

- Thoi gian: 2026-08-08 00:14 (Asia/Saigon)
- Loai: Tinh nang | Giao dien | Van hanh
- Trang thai: Hoan tat production; cho UAT hai employee
- Muc tieu: Moi tai khoan duoc admin moi lam nhan vien trong UpGO Account tu dong xuat hien trong danh ba cong ty va co the nhan tin truc tiep, khong can gui hoac chap nhan loi moi ket ban.
- Pham vi: Danh ba va tim kiem nhan vien cua ChatUI, bo loc projection Account cung tenant, kiem thu frontend, tai lieu kien truc va release bat bien `/opt/deploy/chat/releases/75bdc61`; chi recreate service `chat`, khong thay doi Tinode, database hay API backend.
- File da thay doi: `src/app/App.jsx`, `src/features/contacts/services/accountDirectory.js`, `src/features/contacts/services/accountDirectory.test.js`, `docs/chat-backend-architecture.md`, va `docs/CHANGELOG.md`.
- Noi dung: Danh ba mac dinh dung toan bo projection nhan vien active do `/api/v1/chat/users` tra ve, loai tai khoan dang dang nhap va ban ghi trung lap. Tieu de duoc doi thanh `Nhan vien cong ty`; ca danh sach mac dinh va ket qua tim kiem deu co nut `Nhan tin` mo chat 1-1 ngay. ChatUI khong con hien nut/modal gui loi moi ket ban trong luong danh ba.
- Quyet dinh ky thuat: Giu UpGO Account/Chatmgt lam nguon danh ba va giu rang buoc backend chi cho tao direct conversation giua cac tai khoan active cung tenant. Khong tu tao truoc conversation hoac Tinode topic cho toan bo cong ty; chi tao/tai su dung khi nguoi dung bam nhan tin de tranh phat sinh du lieu va subscription khong can thiet. API friendship cu van duoc giu lam metadata tuong thich cho du lieu da co, nhung khong con la dieu kien de thay hoac nhan tin cho dong nghiep.
- Database/API/cau hinh: Khong co migration, khong doi hop dong API va khong them bien moi truong. Private `.env` cua release moi duoc dong bo cac gia tri khong nhay cam dang chay thuc te: tenant `tn6913580727957397`, `VITE_CHAT_AUTH_MODE=account_password` va `VITE_CHAT_MODE=internal`; khong in/sua secret va khong recreate Chatmgt/bridge.
- Kiem thu: Local `npm run test:frontend` dat 44/44; `npm run build:production` dat; `npm run lint` exit 0, con 140 warning legacy/worktree co san va khong co warning trong pham vi; `git diff --check` dat. Production archive SHA-256 `c51871d29b82cec0971fece141e79d1378c2343a607623995041682250df464d`; Compose config, Nginx trong dung network, image marker va health deu dat. Public `/healthz` va Chatmgt auth health tra HTTP 200; health bao credential login, directory va Tinode bridge da configured. Bundle `App-CFlu8rES.js` co `Nhan vien cong ty`, `account_password`, tenant dung va khong con modal `Gui loi moi ket ban`. Lan validate dau dung container co lap nen Nginx khong resolve `chatmgt`; script dung truoc recreate va giu production cu, sau do kiem tra lai trong Compose network dat.
- Trien khai: Commit `75bdc61` da push `origin/master`; image moi `sha256:b2fad041e52e`, container ChatUI `ecc8611ada39` healthy va rollback tag `songhong-production-chat:rollback-before-75bdc61` giu image cu `sha256:9bf1278951d9`. Symlink `current` da tro release moi. ID Chatmgt `a407705a0409`, bridge `0919575eb188`, ChatAPI `8476615ad4ac`, hai PostgreSQL, Redis va Coturn khong doi; khong reset volume/topic/message.
- Rui ro con lai: Chua UAT bang admin moi mot employee moi va hai phien employee that. Loi moi ket ban cu co the van xuat hien trong muc Thong bao de tuong thich du lieu lich su, nhung khong can xu ly de su dung danh ba hoac chat 1-1.
- Viec tiep theo: Hard refresh hai phien employee, moi/them mot employee trong UpGO Account, xac nhan danh ba cap nhat va bam `Nhan tin` de tai su dung/tao dung direct conversation roi gui tin qua Tinode.
- Commit/PR: Code `75bdc61`; commit ghi nhan trien khai xem `git log`.

## 2026-08-07-10 - Sua tenant production khi dang nhap UpGO employee

- Thoi gian: 2026-08-07 (Asia/Saigon)
- Loai: Sua loi | Xac thuc | Cau hinh | Van hanh
- Trang thai: Dang thuc hien
- Muc tieu: Khong de employee hop le bi tu choi voi loi `The UpGO Account is not active in this company. (401)` khi Tinode Web bridge dang nhap.
- Pham vi: Production tenant config, ChatUI build-time tenant, Chatmgt account-login va Tinode Account bridge.
- File da thay doi: `docs/CHANGELOG.md`; production `.env` se cap nhat rieng, khong commit secret.
- Noi dung: Log cho thay production dang dung `CHATMGT_DEFAULT_TENANT=song-hong`, trong khi database co tenant cong ty `tn6913580727957397` (`CTY NHAM`). Bridge gui tenant sai cho `account-login` nen Account user cua cong ty dung bi tu choi.
- Quyet dinh ky thuat: Dung duy nhat tenant `tn6913580727957397` cho production va rebuild ChatUI de `VITE_CHAT_TENANT_ID`, Chatmgt va bridge cung mot tenant; khong cho client tu chon tenant khac.
- Database/API/cau hinh: Khong migration. Cap nhat env production, recreate `chatmgt`, `tinode-account-bridge`, `chat`; khong reset database/volume Tinode.
- Kiem thu: Da xac nhan DB co tenant `tn6913580727957397` active va production env hien tai dang la `song-hong`; chua deploy ban sua.
- Rui ro con lai: Can dang nhap lai bang tai khoan employee that sau khi hard refresh va doi chieu UID/lich su Tinode.
- Viec tiep theo: Build release moi voi tenant dung, deploy, chay verifier/health va UAT lai Tinode Web goc.
- Commit/PR: Chua tao.

## 2026-08-07-09 - Dong bo ceiling TTL voi Tinode trung tam

- Thoi gian: 2026-08-07 (Asia/Saigon)
- Loai: Sua loi | Cau hinh | Van hanh
- Trang thai: Hoan tat production; cho UAT lai
- Muc tieu: Bao dam verifier va lan khoi dong production chap nhan dung TTL token do `web.vichat.net` tra ve.
- Pham vi: Compose production, env example, huong dan acceptance va release dang chay.
- File da thay doi: `infrastructure/production/.env.example`, `infrastructure/production/compose.yaml`, `infrastructure/production/README.md`.
- Noi dung: Do token central thuc te con khoang 14 ngay (`1209599s` tai thoi diem kiem tra), cap ceiling tu `900` len `1209600`; day la ceiling kiem tra expiry, khong thay doi UID, token issuance hay database.
- Quyet dinh ky thuat: Giu ceiling bang policy cua Tinode trung tam thay vi dung default ngan hon lam verifier bao loi gia; token van do central Tinode phat hanh.
- Database/API/cau hinh: Khong migration. Production release da them `TINODE_CENTRAL_TOKEN_MAX_TTL=1209600` vao env da bao ve; khong ghi secret.
- Kiem thu: Da do token central `1209599s`; test contract 32/32; Compose config validation dat; verifier production voi env that, khong override, dat day du health/CORS/directory/conversation/Tinode WebSocket/login/logout.
- Trien khai: Da push commit `918f736`; active release `/opt/deploy/chat/releases/918f736`; recreate Chatmgt va xac nhan bridge healthy; current da tro release moi; khong migration, khong reset database/volume Tinode.
- Rui ro con lai: UAT bang tai khoan employee that va doi chieu lich su Tinode van can thuc hien.
- Viec tiep theo: Mo `https://web.vichat.net/#`, dat Server `chat.upgo.vn`, dang nhap tai khoan UpGO employee va doi chieu UID/topic/lich su voi ChatUI.
- Commit/PR: `918f736` (production config release).

## 2026-08-07-08 - Sua loi 401 khi bridge Tinode Web doi token

- Thoi gian: 2026-08-07 (Asia/Saigon)
- Loai: Sua loi | Xac thuc | Tinode | Van hanh
- Trang thai: Hoan tat production; cho UAT lai
- Muc tieu: Loai bo loi `Account login is required (401)` sau khi Tinode Web da dang nhap UpGO Account thanh cong.
- Pham vi: Chatmgt token exchange, WebSocket Account bridge, hop dong kiem thu va tai lieu kien truc.
- File da thay doi: `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/scripts/tinode_account_bridge.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `docs/chat-backend-architecture.md`.
- Noi dung: Them endpoint noi bo `POST /api/v1/auth/tinode-token-bridge`, yeu cau JWT Chatmgt scope chat va header key noi bo. Bridge lay `vichat_access_token` tu response `account-login` va gui Bearer token cho endpoint nay, khong con phu thuoc Account browser cookie khi doi Tinode token.
- Quyet dinh ky thuat: Giay phep endpoint bang `TINODE_BRIDGE_INTERNAL_KEY` va `hmac.compare_digest`; van giu Account password chi trong request login va khong ghi token/password vao log. UID deterministic va Tinode token flow khong thay doi.
- Database/API/cau hinh: Khong migration. Them route noi bo va su dung bien da co `TINODE_BRIDGE_INTERNAL_KEY`; Compose da yeu cau cung key cho Chatmgt va bridge.
- Kiem thu: `python -m unittest discover -s chatservice-main/tests -p 'test_chat_auth_contract.py' -v` dat 32/32; `npm run test:frontend` dat 43/43; `python -m unittest discover -s chatservice-main/tests -v` dat 118 tests, skip 38 do local thieu dependency runtime; `python -m py_compile ...` dat; `npm run build:production` dat; Compose config validation va `git diff --check` dat. Production bridge endpoint test tra `200 connection=tinode` voi UID/token; verifier sau deploy dat health/CORS/directory/conversation/Tinode WebSocket/login/logout; public ChatUI/Chatmgt health `200`; log service khong co severe error.
- Trien khai: Da push commit `a8e95bd`; build/recreate `chatmgt` va `tinode-account-bridge`; active code release `/opt/deploy/chat/releases/a8e95bd` truoc release config `918f736`; khong migration, khong reset database/volume Tinode.
- Rui ro con lai: Chua xac nhan UAT bang tai khoan UpGO employee that sau khi deploy; can doi chieu UID/topic/lich su tren `https://web.vichat.net/#` va ChatUI.
- Viec tiep theo: UAT lai Tinode Web goc voi Server `chat.upgo.vn` bang cung tai khoan employee va hard refresh ChatUI.
- Commit/PR: `a8e95bd` (bridge 401 fix; production code release).

## 2026-08-07-07 - Giu Tinode Web trung tam lam giao dien kiem tra duy nhat

- Thoi gian: 2026-08-07 (Asia/Saigon)
- Loai: Sua loi | Tinode | Realtime | Cau hinh
- Trang thai: Hoan tat production; cho UAT lai
- Muc tieu: Dung `https://web.vichat.net/#` lam giao dien Tinode duy nhat; khong tao hoac huong dan dung mot Tinode Web proxy khac.
- Noi dung: Go route `/tinode-web/` proxy khoi Nginx va tai lieu. `web.vichat.net` van dung Server `chat.upgo.vn` de basic login di qua Account bridge; ChatUI va Tinode Web lay token rieng cho cung UID deterministic, cung topic va kho tin nhan.
- Quyet dinh ky thuat: Khong truyen browser token truc tiep giua hai giao dien; token ngan han rieng giup tach session nhung van dong bo UID/topic/message tren Tinode trung tam.
- Kiem thu: Test contract 32/32; `npm run build:production` dat; Compose config validation va `git diff --check` dat; production Nginx `-t` dat; ChatUI healthy sau recreate; bridge cookie fix van healthy.
- Trien khai: Da push commit `e61bf28`; active release `/opt/deploy/chat/releases/e61bf28`; recreate rieng service `chat`, khong doi bridge/database/volume Tinode.
- Rui ro con lai: Chua UAT lai bang tai khoan employee that sau cookie fix tren giao dien goc.
- Viec tiep theo: Mo `https://web.vichat.net/#`, dat Server `chat.upgo.vn`, dang nhap UpGO va doi chieu UID/topic/lich su voi ChatUI.
- Commit/PR: `e61bf28` (central Tinode Web only, production release).

## 2026-08-07-06 - Sua loi 401 cookie khi Tinode Web doi Tinode token

- Thoi gian: 2026-08-07 (Asia/Saigon)
- Loai: Sua loi | Xac thuc | Tinode | Van hanh
- Trang thai: Hoan tat production; cho UAT lai
- Muc tieu: Khong de Tinode Web bi `Account login is required (401)` sau khi UpGO Account da chap nhan email/mat khau.
- Noi dung: Bridge doc ca cookie da parse boi aiohttp va `Set-Cookie` header thu cong tu Chatmgt, uu tien gui ro cookie Account `session` cung cookie phien Chatmgt khi goi `POST /api/v1/auth/tinode-token`.
- Quyet dinh ky thuat: Khong log gia tri cookie, token hoac mat khau; chi bo sung fallback parse cookie va cau hinh ten cookie khong nhay cam.
- Kiem thu: Test contract 32/32, py_compile bridge, Compose config validation va git diff check dat. Production bridge healthy; public WebSocket hello tra `201`; Basic credential gia van tra `401 Invalid UpGO Account email or password.`; log khong ghi gia tri cookie/token/mat khau.
- Trien khai: Da push commit `7022e5a`; active release `/opt/deploy/chat/releases/7022e5a`; build va recreate rieng `tinode-account-bridge`, `current` da tro release moi. Khong migration, khong reset database hoac volume Tinode.
- Rui ro con lai: Can UAT lai bang tai khoan employee that sau khi xoa session cu/nhan `Ctrl+F5`; neu van 401 thi doi chieu log cua lan thu moi.
- Viec tiep theo: Dang nhap lai tai `https://chat.upgo.vn/tinode-web/` hoac Server `chat.upgo.vn`, xac nhan Tinode tra UID/topic va lich su tin nhan.
- Commit/PR: `7022e5a` (cookie bridge fix, production release).

## 2026-08-07-05 - Ket noi Tinode Web voi UpGO Account va cung kho tin nhan

- Thoi gian: 2026-08-07 (Asia/Saigon)
- Loai: Sua loi | Xac thuc | Realtime | Tinode | Van hanh
- Trang thai: Hoan tat production; cho UAT tai khoan that
- Muc tieu: Cho Tinode Web dang nhap bang email/mat khau UpGO cua employee duoc moi va xem dung UID/topic/lich su tin nhan trung tam.
- Pham vi: WebSocket relay `chat.upgo.vn/v0/channels`, Chatmgt Account login/Tinode token bridge, ChatUI token login, production Compose/Nginx va verifier.
- File da thay doi: `chatservice-main/scripts/tinode_account_bridge.py`, `chatservice-main/application/config/config.py`, `chatservice-main/application/services/auth_service.py`, `infrastructure/production/compose.yaml`, `infrastructure/production/nginx.conf`, `infrastructure/production/start.sh`, `infrastructure/production/.env.example`, `chatservice-main/tests/test_chat_auth_contract.py`, `README.md`, `docs/chat-backend-architecture.md`, `infrastructure/production/README.md`.
- Noi dung: Them `tinode-account-bridge` chi nhan WebSocket noi bo. Basic login packet tu Tinode Web duoc decode tai bridge, xac thuc qua `POST /api/v1/auth/account-login`, lay `POST /api/v1/auth/tinode-token`, thay bang `scheme=token`, roi relay cac packet con lai den `web.vichat.net`. Token login tu ChatUI va basic login noi bo cua Chatmgt duoc giu nguyen. Them `https://chat.upgo.vn/tinode-web/` proxy de giao dien Tinode Web tu dong dung bridge; giao dien goc `web.vichat.net` van can dat Server la `chat.upgo.vn`.
- Quyet dinh ky thuat: Dung internal key rieng de phan biet basic credential deterministic cua Chatmgt voi basic credential UpGO tu Tinode Web; khong gui mat khau UpGO sang Tinode, khong log password. Khong sua static Tinode Web tren may `103.74.122.215`; thay vao do phuc vu cung giao dien qua hostname ChatUI de hostname mac dinh tro dung bridge.
- Database/API/cau hinh: Khong migration. Them service/route WebSocket, `TINODE_CENTRAL_WS_URL`, `TINODE_BRIDGE_TIMEOUT`, `TINODE_BRIDGE_INTERNAL_KEY`; key duoc generate tren production va khong ghi vao log/changelog.
- Kiem thu: Local `python -m unittest chatservice-main/tests/test_chat_auth_contract.py -v` dat 32/32; `npm run test:frontend` dat 43/43; `npm run build:production` dat; Compose config validation dat voi secret gia lap chi trong process; `git diff --check` dat. Production Nginx `-t` dat; `https://chat.upgo.vn/healthz` va `https://chatmgt.upgo.vn/api/v1/auth/health` deu HTTP 200; Tinode Web proxy HTML va asset deu HTTP 200; public WebSocket hello tra `201`; Basic credential gia tra `401 Invalid UpGO Account email or password.`; log bridge/chatmgt/chat khong co traceback/panic/fatal/critical/emerg/exception.
- Trien khai: Da push commit `980421e`; active release `/opt/deploy/chat/releases/980421e`; build va recreate rieng service `chat`; `current` da tro release moi. Khong migration, khong reset database, khong thay doi volume Tinode, Chatmgt, PostgreSQL, Redis hoac Coturn.
- Rui ro con lai: Chua UAT bang tai khoan employee UpGO that de doi chieu UID/topic/lich su tin nhan hai chieu. `https://web.vichat.net/#` nguyen ban van mac dinh tro vao hostname rieng; dung `https://chat.upgo.vn/tinode-web/` hoac vao Settings va dat Server la `chat.upgo.vn`. Relay van bo qua xac minh certificate upstream `web.vichat.net` do certificate trung tam chua hop le.
- Viec tiep theo: Mo `https://chat.upgo.vn/tinode-web/`, dang nhap email/mat khau UpGO cua employee duoc moi, roi doi chieu cung UID/topic/lich su voi ChatUI. Neu can dung link goc `web.vichat.net`, dat Server la `chat.upgo.vn` truoc khi dang nhap.
- Commit/PR: `980421e` (production release).

## 2026-08-07-04 - Dang nhap employee bang credential UpGO Account va dong bo Tinode

- Thoi gian: 2026-08-07 (Asia/Saigon)
- Loai: Tinh nang | Xac thuc | Tinode | Cau hinh | Van hanh
- Trang thai: Hoan tat production; cho UAT tai khoan that
- Muc tieu: Cho employee duoc admin moi trong UpGO Account dang nhap ChatUI bang email/mat khau UpGO va dung ngay tai khoan Tinode trung tam.
- Pham vi: ChatUI login, Chatmgt Account credential exchange, projection tenant, Tinode provisioning/token bridge, production config va verifier.
- File da thay doi: `chatservice-main/application/config/config.py`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/services/account_sso_service.py`, `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/tests/test_account_sso_service.py`, `chatservice-main/tests/test_chat_auth_contract.py`, `src/features/auth/components/Login.jsx`, `src/features/chat/services/chatManagementService.js`, `scripts/build-production.mjs`, `infrastructure/production/compose.yaml`, `infrastructure/production/.env.example`, `infrastructure/production/README.md`, `README.md`, `docs/chat-backend-architecture.md`.
- Noi dung: Them `POST /api/v1/auth/account-login`; Chatmgt gui credential chi den Account `POST /login`, lay session cookie, xac minh `/current_user`, tenant membership va projection. Tinode dung UID/credential deterministic derive tu `TINODE_SSO_SECRET`; mat khau UpGO khong duoc luu, tra ve hoac gui sang Tinode. ChatUI mac dinh hien form email/mat khau va khong dung luong local password trong production.
- Quyet dinh ky thuat: Giữ `POST /api/v1/auth/sso` cho client tuong thich, nhung production build dung `account_password`; session cookie Account duoc forward HttpOnly tren shared domain de Chatmgt tiep tuc kiem tra directory, revoke va membership.
- Database/API/cau hinh: Khong migration. Them `CHAT_ACCOUNT_CREDENTIAL_LOGIN_ENABLED` va `ACCOUNT_SSO_LOGIN_PATH`; health verifier kiem tra endpoint employee va request credential rong.
- Kiem thu: `python -m unittest discover -s chatservice-main/tests -v` dat 117 tests, skip 38 do thieu dependency runtime; `npm run test:frontend` dat 43/43; `python -m py_compile chatservice-main/application/config/config.py chatservice-main/application/controllers/api_chat_management.py chatservice-main/application/services/account_sso_service.py chatservice-main/scripts/verify_deployment.py` dat; `npm run lint` exit 0 voi warning legacy/vendor/worktree co san; `npm run build:production` dat; Compose config validation dat voi secret gia lap chi trong process; `git diff --check` dat. Production `verify_deployment.py` dat database/credential policy, health/CORS, directory, conversation, Tinode WebSocket, login/logout va credential endpoint; `verify_tenant_isolation.py` dat user/conversation/friend/participant hai tenant; public health bao `/api/v1/auth/account-login`, `credential_login_enabled=true`, `tinode_bridge_configured=true`; empty credential tra `400 ACCOUNT_CREDENTIALS_REQUIRED`, credential gia tra `401 ACCOUNT_LOGIN_FAILED`, local login tra `403 AUTH_METHOD_DISABLED`; public bundle co `account_password` va `/api/v1/auth/account-login`; container log 10 phut khong co traceback/panic/fatal/critical/exception/emerg.
- Trien khai: Da push commit `111910a`; tao release bat bien `/opt/deploy/chat/releases/111910a`, copy `.env` va runtime production, cap nhat `VITE_CHAT_AUTH_MODE=account_password`, `CHAT_ACCOUNT_CREDENTIAL_LOGIN_ENABLED=true`, `ACCOUNT_SSO_LOGIN_PATH=/login`, build/recreate `chatmgt` va `chat` bang Compose, va cap nhat `current` sang release moi. Khong migration, khong reset database, khong thay doi volume Tinode.
- Rui ro con lai: Chua UAT credential that voi tai khoan employee duoc admin moi va hai browser; OTP/account policy neu bat se tra `ACCOUNT_OTP_REQUIRED` va can luong xac minh rieng. Kiem tra UI browser tu dong khong khoi tao duoc trong moi truong nay, nen da dung public HTTP/bundle checks thay the.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, dang nhap bang tai khoan UpGO Account da duoc admin moi, xac nhan directory, Tinode token, gui tin 1-1/nhom va doi chieu tren `web.vichat.net`.
- Commit/PR: `111910a` (feature release); deployment verification ghi trong commit tai lieu tiep theo.

## 2026-08-07-03 - Sua verifier cho credential Tinode dan xuat trong Account SSO

- Thoi gian: 2026-08-07 21:32 (Asia/Saigon)
- Loai: Sua loi | Van hanh | Xac thuc | Tinode
- Trang thai: Hoan tat production; cho UAT tai khoan that
- Muc tieu: Bao dam acceptance verifier phan anh dung luong production: employee dang nhap Account SSO, Chatmgt cap token Tinode bang credential dan xuat, va tenant isolation khong goi password login.
- Pham vi: `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/scripts/verify_tenant_isolation.py` va release production.
- Noi dung: Verifier deployment khong bat buoc local credential mirroring khi Account SSO dang bat; verifier tenant isolation tao projection Account va dung JWT noi bo tin cay de test tenant filter ma khong gia mao Account cookie, trong khi van giu nhanh password cho che do recovery/local.
- Quyet dinh ky thuat: Khong bat `TINODE_MIRROR_LOCAL_CREDENTIALS` de phu hop voi nguyen tac khong sao chep mat khau UpGO Account sang Tinode; chi kiem tra Tinode token bridge va UID mapping.
- Database/API/cau hinh: Khong doi schema, API hoac gia tri secret; chi thay doi logic verifier.
- Kiem thu: `python -m py_compile chatservice-main/scripts/verify_deployment.py chatservice-main/scripts/verify_tenant_isolation.py` dat; `python -m unittest discover -s chatservice-main/tests -v` dat 115 tests, skip 37 do dependency runtime; `npm run test:frontend` dat 43/43; `npm run lint` exit 0 voi warning legacy/vendor/worktree; `npm run build:production` dat; `git diff --check` dat. Production `verify_deployment.py` dat health/CORS/directory/conversation/Tinode WebSocket/login/logout; `verify_tenant_isolation.py` dat user/conversation/friend/participant hai tenant; public ChatUI/Chatmgt tra HTTP 200; SSO khong co Account cookie tra `401 ACCOUNT_LOGIN_REQUIRED`; local employee password tra `403 AUTH_METHOD_DISABLED`; public bundle la `index-CHxBvhp1.js`; container healthy va log 10 phut khong co traceback/panic/fatal/critical/exception/emerg.
- Trien khai: Da push cac commit `90a9745`, `14368c5`, `d132e2b`; active release `/opt/deploy/chat/releases/d132e2b`; Chatmgt va ChatUI da build/recreate, khong migration/reset database va khong thay doi Tinode volume. Full `start.sh` van can current Tinode root password neu chay lai bootstrap; lan nay deploy compose build/up khong dung lai password do.
- Rui ro con lai: Chua hoan tat UAT voi tai khoan UpGO Account duoc admin moi trong hai browser va chua xac nhan thao tac UI sau redirect; browser automation cua moi truong khong khoi tao duoc. Verifier noi bo da xac nhan bridge/token/WebSocket va tenant isolation.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, dang nhap bang tai khoan UpGO Account da duoc moi vao cong ty, xac nhan nut SSO redirect, directory, Tinode token va gui tin 1-1/nhom; khong dung form user/password.
- Commit/PR: `d132e2b` (production release); changelog cap nhat tiep theo.

## 2026-08-07-02 - Sua verifier production sau khi bat UpGo Account SSO

- Thoi gian: 2026-08-07 21:09 (Asia/Saigon)
- Loai: Sua loi | Van hanh | Xac thuc
- Trang thai: Dang thuc hien
- Muc tieu: Cho phep verifier chay tron ven sau khi ChatUI dang nhap UpGo Account va Chatmgt provision Tinode cho employee.
- Pham vi: `chatservice-main/scripts/verify_deployment.py` va release production `eee1253`.
- Noi dung: Bo sung import `secrets` bi thieu, loi nay chi lo ra khi verifier production tao tai khoan kiem tra sau khi SSO da bat.
- Quyet dinh ky thuat: Khong bo qua verifier; giu migration, health check va Tinode contract lam dieu kien chuyen release.
- Database/API/cau hinh: Khong doi schema/API; release production da dung `CHAT_ACCOUNT_SSO_ENABLED=true` va `VITE_CHAT_AUTH_MODE=account_sso`.
- Kiem thu: `python -m py_compile chatservice-main/scripts/verify_deployment.py` dat; `python -m unittest discover -s chatservice-main/tests -v` dat 115 tests, skip 37 do thieu dependency runtime. Verifier tren release `eee1253` da chay den buoc tao deployment verifier va dung tai loi thieu import.
- Rui ro con lai: Can chay lai verifier sau khi build release chua loi va can UAT employee UpGo Account -> Tinode tren hai browser.
- Viec tiep theo: Commit/push ban sua, build release moi, chay verifier va cap nhat symlink `current` sau khi tat ca gate dat.
- Commit/PR: Chua tao.

## 2026-08-07-01 - Chuyen employee auth sang UpGo Account va provision Tinode theo directory

- Thoi gian: 2026-08-07 13:41 (Asia/Saigon)
- Loai: Tinh nang | Xac thuc | Tinode | Chatmgt | Cau hinh
- Trang thai: Da commit va push; chua deploy production
- Muc tieu: Chatmgt khong con tao tai khoan nhan vien trong production; ChatUI dang nhap nhanh bang UpGo Account da duoc tenant admin moi va moi identity active duoc tao mapping Tinode on dinh.
- Quyet dinh ky thuat: UpGo Account la nguon chuan cho invitation, membership, profile, role, status va password. Chatmgt chi giu projection tenant-scoped va mapping Tinode deterministic de khong mat conversation/friendship khi Account thay doi. Directory sync provision Tinode best-effort, co retry tu dong qua lan sync/login sau neu Tinode tam thoi khong san sang. Sau khi merge Enterprise Workspace va Tinode central, ChatUI khong day normal message/file tu Tinode vao Chatmgt knowledge; Workspace chi luu tham chieu message.
- Pham vi: Chatmgt Account SSO employee, directory sync, Tinode bridge, ChatUI login mac dinh, giao dien quan tri nhan vien, production config, verifier, tai lieu va test; khong migration database.
- File da thay doi: `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/services/sso_identity.py`, `chatservice-main/application/config/config.py`, `src/features/chat/services/chatManagementService.js`, `src/features/management/ManagementApp.jsx`, `scripts/build-production.mjs`, `infrastructure/production/`, `chatservice-main/tests/`, `README.md`, `docs/chat-backend-architecture.md`, `docs/DEVELOPMENT_WORKFLOW.md`, va `docs/CHANGELOG.md`.
- Kiem thu: `python -m unittest discover -s chatservice-main/tests -v` dat 115 tests, skip 37 do thieu dependency runtime; `npm run test:frontend` dat 43/43; `npm run lint` exit 0 voi warning legacy/vendor va worktree tam; `npm run build:production` dat; `docker compose --env-file infrastructure/production/.env.example -f infrastructure/production/compose.yaml config -q` dat voi `TINODE_SSO_SECRET` gia lap chi trong process; `git diff --check` dat; `git push origin master` thanh cong va `git ls-remote origin refs/heads/master` tra `e6315ba`.
- Trien khai: Chua deploy. Public `https://chat.upgo.vn/` van tra bundle cu `index-DWzHceAX.js`; `https://chatmgt.upgo.vn/api/v1/auth/health` van bao employee login `/api/v1/auth/login` va `account_sso.enabled=false`, cho thay push chua kich hoat deploy.
- Rui ro con lai: Chua co webhook/quyen SSH deploy trong phien nay; production van chay release cu va chua co UAT payload that cua `/api/v1/tenant_user`, tai khoan duoc moi that tren UpGo Account va hai browser; khong ghi credential vao log.
- Viec tiep theo: Cap nhat `.env` production that sang `CHAT_ACCOUNT_SSO_ENABLED=true`, `VITE_CHAT_AUTH_MODE=account_sso`, `ACCOUNT_SSO_DIRECTORY_PATH=/api/v1/tenant_user`, `ACCOUNT_SSO_DIRECTORY_SYNC_TTL=10`; apply Alembic `20260804_10`; cap quyen deploy vao `103.74.122.215` hoac webhook release; deploy Chatmgt/ChatUI, hard refresh va UAT invite -> directory -> Tinode UID -> login -> remove/disable.
- Commit/PR: `e6315ba` (da push `origin/master`); deployment chua thuc hien.

## 2026-08-06-20 - Dong bo avatar va receipt ChatUI

- Thoi gian: 2026-08-06 (Asia/Saigon)
- Loai: Sua loi | Giao dien | Realtime | Chatmgt | Tinode
- Trang thai: Hoan tat code va build; chua deploy production
- Muc tieu: Avatar moi khong bi snapshot cu ghi de o cac man hinh; tin nhan da nhan hien hai dau tich on dinh.
- Pham vi: Luong directory/profile avatar trong `src/app/App.jsx` va `src/features/contacts`; luong receipt trong `src/features/chat/services`; khong doi database, API, auth, upload, group hay chatbot.
- File da thay doi: `src/app/App.jsx`, `src/features/contacts/services/accountDirectory.js`, `src/features/contacts/services/accountDirectory.test.js`, `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/chatRealtime.test.js`, `src/features/chat/services/tinodeClient.js`, va `docs/CHANGELOG.md`.
- Noi dung: Giu avatar da biet khi profile/snapshot Chatmgt hoac Tinode rong/stale va cap nhat theo ca identity Chatmgt/Tinode cho directory, room, member va message. Ghi nho cursor `recv/read` theo topic va merge receipt theo thu tu tang dan de snapshot Tinode khong lam tut hai dau tich ve mot dau.
- Quyet dinh ky thuat: Chatmgt/Tinode van la nguon du lieu hien co; chi them lop merge client-side va cursor receipt, khong thay doi hop dong server.
- Database/API/cau hinh: Khong co.
- Kiem thu: `npm run test:frontend` dat 40/40; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build:production` dat; `git diff --check` dat.
- Rui ro con lai: Chua UAT hai browser production va chua deploy bundle moi.
- Viec tiep theo: Deploy rieng ChatUI, hard refresh, doi avatar tren tai khoan A va gui tin tu A sang B de xac nhan avatar va hai dau tich trong direct/group.
- Commit/PR: b01db58.

## 2026-08-06-19 - Them nut khoa tai khoan trong Chatmgt

- Thoi gian: 2026-08-06 15:52 (Asia/Saigon)
- Loai: Tinh nang | Bao mat | Chatmgt
- Trang thai: Hoan tat code; chua deploy production
- Muc tieu: Cho phep admin tenant khoa/mo khoa tai khoan nhan vien ngay tai cot thao tac cua Chatmgt.
- Pham vi: Bang Nhan vien trong `src/features/management`; khong doi ChatUI, Tinode, chatbot, database hoac cau hinh.
- File da thay doi: `src/features/management/ManagementApp.jsx`, `src/features/management/management.css`, `src/features/management/services/managementAdminService.js`, `src/features/management/services/managementAdminService.test.js`, va `docs/CHANGELOG.md`.
- Noi dung: Them nut khoa/mo khoa voi xac nhan, cap nhat lai trang thai tren bang va tai audit log. Khoa tai khoan su dung API cap nhat `active` da co; backend tang `auth_version` khi khoa nen phien cu bi tu choi. Khong cho admin tu khoa chinh minh va giu projection UpGO Account o che do chi doc.
- Quyet dinh ky thuat: Tai su dung `PUT /api/v1/chat/users/<id>` thay vi them endpoint/migration moi, chi gui truong `active` de tranh thay doi ngoai y muon.
- Database/API/cau hinh: Khong co migration; khong them hop dong API. Tai khoan projection Account van phai quan ly o UpGO Account theo kien truc hien tai.
- Kiem thu: `npm run test:frontend` dat 38/38; `npm run lint` exit 0 voi warning legacy/vendor co san; `npm run build:production` dat; `git diff --check` dat. `python -m unittest chatservice-main/tests/test_chat_auth_contract.py -v` chua dat do test hien tai doi chu mo ta da bi xoa trong thay doi co san cua `ManagementApp.jsx`, khong lien quan nut khoa.
- Rui ro con lai: Bundle build da tao nhung chua deploy production; chua UAT tai khoan production.
- Viec tiep theo: Deploy bundle Chatmgt moi, hard refresh, thu khoa/mo khoa tai khoan nhan vien va xac nhan phien cu bi dang xuat.
- Commit/PR: 8199183.

## 2026-08-06-18 - Xac minh web that dang phuc vu bundle cu

- Thoi gian: 2026-08-06 (Asia/Saigon)
- Loai: Van hanh | Sua loi | ChatUI
- Trang thai: Can deploy production
- Muc tieu: Xac dinh vi sao luong ket ban da co trong source nhung nguoi dung van khong thao tac duoc tren web that.
- Pham vi: Chi kiem tra bundle public ChatUI; khong sua Tinode, Chatmgt, database, chat, file hoac avatar.
- Noi dung: `https://chat.upgo.vn` tra `index-DWzHceAX.js`; bundle nay khong co `friend-request`, `Chấp nhận`, `Kết bạn`, `image-preview-button` hoac `onPasteCapture`. Bundle local moi da build co cac marker nay, nen web that dang chay release cu.
- Quyet dinh ky thuat: Khong tiep tuc sua source ngoai pham vi khi nguyen nhan la release chua duoc cap nhat; deploy dung bundle moi roi hard refresh truoc khi UAT.
- Database/API/cau hinh: Khong co thay doi.
- Kiem thu: `Invoke-WebRequest -UseBasicParsing https://chat.upgo.vn/` tra HTTP 200; kiem tra asset public va `npm run build:production` local dat.
- Rui ro con lai: Web that van khong co luong ket ban cho den khi deploy; phien nay chua co quyen SSH de deploy.
- Viec tiep theo: Deploy bundle `dist` moi, hard refresh, sau do test hai tai khoan theo thu tu gui -> nhan thong bao -> chap nhan/tu choi -> danh ba.
- Commit/PR: Chua tao.

## 2026-08-06-17 - Khoa renderer anh khong hien ten file

- Thoi gian: 2026-08-06 (Asia/Saigon)
- Loai: Sua loi | Giao dien | ChatUI
- Trang thai: Hoan tat code va build; chua deploy production trong phien nay
- Muc tieu: Anh gui trong chat chi hien preview anh, khong hien ten file ben duoi nhu file dinh kem.
- Pham vi: Renderer attachment anh trong `src/app/App.jsx`; file thuong van giu ten, kich thuoc va nut mo/tai.
- Noi dung: Uu tien nhanh hien thi anh va dat `alt` chung `Anh dinh kem`; ten file khong duoc render trong nhanh image. Ghi invariant nay de khong tai su dung card file cho anh o lan sua sau.
- Quyet dinh ky thuat: Phan biet anh bang MIME/duoi file; chi nhanh file thuong moi duoc render `.file-name`.
- Database/API/cau hinh: Khong co.
- Kiem thu: `npm run test:frontend` dat 38/38; `npm run lint` exit 0 voi warning legacy/vendor; `npm run build:production` dat; `git diff --check` dat.
- Trien khai: Chua deploy production trong phien nay; can deploy bundle moi va hard refresh de UAT.
- Rui ro con lai: Web dang phuc vu bundle cu se van con tieu de cho den khi deploy va xoa cache.
- Viec tiep theo: Deploy rieng ChatUI, hard refresh, gui lai mot anh va xac nhan chi con preview anh.
- Commit/PR: Chua tao.

## 2026-08-06-16 - Dong bo loi moi ket ban va avatar realtime

- Thoi gian: 2026-08-06 15:17 (Asia/Saigon)
- Loai: Sua loi | Giao dien | Realtime | Chatmgt
- Trang thai: Hoan tat code va build; chua deploy production trong phien nay
- Muc tieu: Clipboard copy/paste hoat dong on dinh; loi moi ket ban hien dung o ben nhan; chap nhan them vao danh ba, tu choi khong them va co the gui lai; avatar ca nhan cap nhat tren cac man hinh ma khong can reload.
- Pham vi: `src/app/App.jsx`; khong doi Tinode message, receipt, upload, dang nhap hay database.
- Noi dung: Tach identity Chatmgt cho friendship thay vi dung Tinode UID; them nut `Chap nhan`/`Tu choi` cho request pending; dong bo danh ba, request va avatar moi 5 giay qua service da co, cap nhat ca ket qua tim kiem, room, member va message; giu room request khi refresh danh sach Tinode; them fallback `document.execCommand('copy')` va bat paste o capture phase; doi chieu avatar theo ca id/uid/Tinode UID va hien avatar room neu notification chua co avatar message; ghi ro invariant renderer: anh chi hien preview va thoi gian, tuyet doi khong hien ten file ben duoi.
- Quyet dinh ky thuat: Chatmgt van la nguon chuan cua friendship/avatar; polling ngan duoc dung lam cau noi realtime vi API hien tai chua co kenh push cho hai loai du lieu nay. Luong Tinode chat khong bi thay doi.
- Database/API/cau hinh: Khong co migration hay thay doi hop dong API.
- Kiem thu: `npm run test:frontend` dat 38/38; `npm run lint` exit 0 voi warning legacy/vendor; `npm run build:production` dat; `git diff --check` dat.
- Trien khai: Chua deploy production trong phien nay; SSH production chua duoc cap quyen.
- Rui ro con lai: Chua UAT bang hai tai khoan production; dong bo nen phu thuoc cookie Chatmgt con han va cap nhat trong toi da 5 giay.
- Viec tiep theo: Deploy rieng ChatUI, hard refresh, gui request tu tai khoan A sang B, thu ca chap nhan/tu choi/gui lai va doi avatar tren ca hai phien.
- Commit/PR: Chua tao.

## 2026-08-06-15 - Hoan thien clipboard va receipt realtime

- Thoi gian: 2026-08-06 14:58 (Asia/Saigon)
- Loai: Sua loi | Giao dien | Realtime | Tinode
- Trang thai: Hoan tat code va build; chua deploy production trong phien nay
- Muc tieu: Ctrl+V anh chup gui thang anh, Ctrl+V tep gui thang tep, Ctrl+V text gui thang tin nhan; receipt cua tin nhan cu khong bi quay lai mot dau tich.
- Pham vi: ChatUI composer, Tinode attachment, receipt cua topic 1-1/nhom va test frontend; khong doi dang nhap, danh ba, upload API hay luong nhom.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/chatRealtime.js`, `src/features/chat/services/chatRealtime.test.js`, `src/features/chat/services/tinodeClient.js`.
- Noi dung: Xu ly clipboard file co/khong ten, chan paste tep vao chatbot, giu text paste gui truc tiep; giu trang thai receipt cao nhat khi snapshot conversation realtime ve sau ghi de state vua cap nhat.
- Quyet dinh ky thuat: Tinode van la nguon receipt chuan; UI chi bo sung cap nhat theo cursor `seq` va khong suy dien hai dau tich tu presence online.
- Database/API/cau hinh: Khong co.
- Kiem thu: `npm run test:frontend` dat 38/38; `npm run lint` exit 0 voi warning legacy/vendor; `npm run build:production` dat; `git diff --check` dat.
- Trien khai: Chua deploy production trong phien nay; SSH production chua duoc cap quyen.
- Rui ro con lai: Chua UAT bang hai tai khoan that voi screenshot, tep clipboard va receipt cua tin nhan cu.
- Viec tiep theo: Chay bo kiem tra local, sau do deploy rieng bundle ChatUI khi co quyen va hard refresh de UAT.
- Commit/PR: Chua tao.

## 2026-08-06-14 - Rut gon anh va gui nhanh bang Ctrl+V

- Thoi gian: 2026-08-06 14:40 (Asia/Saigon)
- Loai: Sua loi | Giao dien | ChatUI | Tien ich soan tin
- Trang thai: Hoan tat code va build; chua deploy production trong phien nay
- Muc tieu: Anh trong phong chat chi hien preview, khong lap lai ten file; nut bieu cam mo va chon duoc; anh chup hoac noi dung copy co the gui truc tiep bang `Ctrl+V`.
- Pham vi: `src/app/App.jsx` va `src/styles/index.css`; khong doi receipt, Tinode topic, upload API, file thuong hay luong dang nhap.
- Noi dung: An dong ten file/caption tren image bubble va image viewer; neo emoji picker vao cum nut de khong bi lech va them focus/accessibility; tach handler gui file dung chung cho file picker va clipboard; clipboard uu tien anh, neu khong co anh thi gui text ngay.
- Quyet dinh ky thuat: Anh clipboard khong co ten duoc gan ten tam thoi truoc khi upload de Tinode nhan dang dung; paste text duoc `preventDefault` de khong chen lai vao input sau khi da gui.
- Database/API/cau hinh: Khong co.
- Kiem thu: `npm run test:frontend` dat 36/36; `npm run lint` exit 0 voi warning legacy; `npm run build:production` dat; `git diff --check` dat.
- Trien khai: Chua thuc hien vi phien nay khong co khoa/quyen SSH toi host production; khong bao cao la web that da cap nhat.
- Rui ro con lai: Chua UAT bang browser that voi paste PNG va paste text, cung nhu click nut emoji tren production. Can deploy rieng ChatUI va hard refresh sau deploy.
- Viec tiep theo: Deploy bundle ChatUI moi, nhan `Ctrl + F5`, thu chon emoji, paste mot anh chup man hinh va paste mot cau text trong ca chat 1-1/nhom.
- Commit/PR: Chua tao.

## 2026-08-06-13 - Sua receipt anh Tinode bi dung mot dau tich

- Thoi gian: 2026-08-06 14:11 (Asia/Saigon)
- Loai: Sua loi | Realtime | Tinode | Trien khai
- Trang thai: Hoan tat deploy production; cho UAT anh realtime
- Muc tieu: Anh da gui phai chuyen sang hai dau tich khi Tinode da ghi nhan nguoi nhan da nhan, giong file va text.
- Pham vi: Chi cach ChatUI tinh `deliveryStatus` cho message echo cua Tinode; khong doi upload, media preview, noi dung tin nhan, presence hay read flow.
- Nguyen nhan: Mot so message anh echo thieu truong `from` nhung van co header `x-sender-id`; UI nhan dien outgoing dung nhung `topic.msgStatus()` khong nhan dien sender nen tra trang thai rong va renderer roi ve mot dau tich.
- Noi dung: Khi tinh receipt, bo sung `from` tam thoi tu `x-sender-id` neu message thieu `from`; receipt `recv/read` cua Tinode tiep tuc la nguon chuan.
- Quyet dinh ky thuat: Chi bo sung fallback cho viec tinh trang thai, khong tu dong gan hai dau tich theo presence de tranh hien sai khi nguoi dung online nhung chua nhan message.
- Database/API/cau hinh: Khong co.
- Kiem thu: `npm run test:frontend` dat 36/36; `npm run lint` exit 0 voi warning legacy; `npm run build:production` dat; `git diff --check` dat. Public `https://chat.upgo.vn/healthz` tra `200 ok`; bundle public co `x-sender-id` va `msgStatus`; log ChatUI 5 phut khong co loi nghiem trong.
- Trien khai: Release `/opt/deploy/chat/releases/chatui-image-receipt-fallback-20260806-071600`; image `sha256:eca6d533c779` va rollback `songhong-production-chat:rollback-before-image-receipt-fallback-20260806` (image cu `sha256:b4e05940b73f`). Container ChatUI moi `e16e39f57d5f`; Chatmgt `23a55b61fa98`, ChatAPI `1cccca891456`, Chat PostgreSQL `78a434b49404`, Tinode PostgreSQL `9f6e4dcc9c2f`, Redis `ceef7df23feb` va Coturn `aa680d35fdc0` giu nguyen.
- Rui ro con lai: Chua co hai browser session production trong moi truong agent de replay anh voi tai khoan that.
- Viec tiep theo: Deploy rieng ChatUI, hard refresh va gui lai mot anh khi tai khoan nhan dang Online.
- Commit/PR: Chua tao.

## 2026-08-06-12 - Hien thi nguoi gui anh va tep trong preview cuoc tro chuyen

- Thoi gian: 2026-08-06 13:55 (Asia/Saigon)
- Loai: Sua loi | Giao dien | Kha dung
- Trang thai: Hoan tat deploy production; cho UAT phong chat
- Muc tieu: Khi chua mo phong chat, preview o danh sach cuoc tro chuyen phai noi ro ai vua gui anh hoac tep.
- Pham vi: Chat 1-1, nhom, snapshot Tinode va cap nhat optimistic luc gui tep; tin nhan text va renderer trong phong chat giu nguyen.
- Noi dung: Doi preview ten file thanh dang `Phuong da gui 1 anh`, `Phuong da gui 1 tep` hoac `Ban da gui 1 anh`; ten file van duoc giu trong noi dung tin nhan khi mo phong chat.
- Quyet dinh ky thuat: Dung formatter attachment dung chung de khong lech hanh vi giua du lieu demo, Tinode va danh sach cap nhat realtime.
- Database/API/cau hinh: Khong co.
- Kiem thu: `npm run test:frontend` dat 35/35; `npm run lint` exit 0 voi warning legacy; `npm run build:production` dat; `git diff --check` dat.
- Trien khai: Release `/opt/deploy/chat/releases/chatui-attachment-preview-20260806-065600`; image `sha256:5c24472bc270` va rollback `songhong-production-chat:rollback-before-attachment-preview-20260806` (image cu `sha256:abada310da18`). Container ChatUI moi `99ae6cb4666a`; Chatmgt `23a55b61fa98`, ChatAPI `1cccca891456`, Chat PostgreSQL `78a434b49404`, Tinode PostgreSQL `9f6e4dcc9c2f`, Redis `ceef7df23feb` va Coturn `aa680d35fdc0` giu nguyen. Public health `200 ok`, bundle co chuoi `1 anh` va `1 tep`, log 5 phut khong co loi nghiem trong.
- Rui ro con lai: Chua UAT click qua browser production voi hai tai khoan; can xac nhan preview anh/tep cua nguoi khac trong nhom sau deploy.
- Viec tiep theo: Nhan `Ctrl + F5`, kiem tra chat 1-1 va nhom; gui anh/tep tu tai khoan khac de xac nhan hien ten nguoi gui.
- Commit/PR: Chua tao.

## 2026-08-06-11 - Can bang vi tri preview anh trong nhom

- Thoi gian: 2026-08-06 13:42 (Asia/Saigon)
- Loai: Sua loi | Giao dien | Van hanh
- Trang thai: Hoan tat deploy production; cho UAT hai tai khoan trong nhom
- Muc tieu: Anh do ca nguoi gui lan nguoi nhan hien thi cung mot khung, khong bi thut vao khi xem trong nhom.
- Pham vi: Rieng renderer tin nhan anh trong `src/app/App.jsx` va layout message trong `src/styles/index.css`; khong doi luong file thuong, text, nhom, auth hay Tinode.
- Noi dung: Gan khung kich thuoc co dinh theo viewport cho image message, cho anh va bubble dung cung chieu rong, dua nut tuy chon ra khoi flow layout; ap dung cho ca incoming va outgoing dua tren cung mot nhanh render.
- Quyet dinh ky thuat: Khong chen margin/padding rieng theo tai khoan; dung class image-only tren wrapper de hai nguoi dung trong nhom nhan cung mot layout.
- Database/API/cau hinh: Khong co.
- Kiem thu: `npm run test:frontend` dat 32/32; `npm run lint` exit 0 voi warning legacy; `npm run build:production` dat; `git diff --check` dat. Public `https://chat.upgo.vn/healthz` tra `200 ok`; bundle public co `image-message-content` trong JS/CSS; log ChatUI 5 phut khong co loi nghiem trong.
- Trien khai: Release `/opt/deploy/chat/releases/chatui-image-layout-20260806-064300`; image `sha256:abada310da18` va rollback `songhong-production-chat:rollback-before-image-layout-20260806` (image cu `sha256:9473a1f370d9`). Container ChatUI moi `d91fba1c50db`; Chatmgt `23a55b61fa98`, ChatAPI `1cccca891456`, Chat PostgreSQL `78a434b49404`, Tinode PostgreSQL `9f6e4dcc9c2f`, Redis `ceef7df23feb` va Coturn `aa680d35fdc0` giu nguyen.
- Rui ro con lai: Moi truong nay khong co browser session production de click anh that bang hai tai khoan; can UAT mot anh gui tu moi tai khoan trong nhom.
- Viec tiep theo: Nhan `Ctrl + F5` tai `https://chat.upgo.vn`, mo cung mot nhom bang hai tai khoan, gui anh theo ca hai chieu va xac nhan khong con thut vao.
- Commit/PR: Chua tao.

## 2026-08-06-10 - Mo anh trong ChatUI voi nut dong quay lai chat

- Thoi gian: 2026-08-06 (Asia/Saigon)
- Loai: Giao dien | Kha dung | Trien khai
- Trang thai: Hoan tat deploy production; cho UAT thao tac
- Muc tieu: Khi bam thumbnail anh, nguoi dung xem anh ngay trong ChatUI va co nut `X` o goc trai de quay lai trang nhan tin, khong mo tab moi.
- Noi dung: Them image viewer overlay toan man hinh, nut dong co the bam/nhan `Escape`, click vung nen de dong, khoa scroll nen khi viewer mo; file thuong van giu nut mo/tai xuong hien tai.
- Kiem thu: `npm run test:frontend` dat 32/32; `npm run lint` exit 0 voi warning legacy; `npm run build:production` dat; `git diff --check` dat. Public health tra HTTP 200; bundle va CSS public co `image-viewer-overlay`, `image-viewer-close`, `image-viewer-image`; ChatUI log 5 phut khong co loi nghiem trong.
- Trien khai: Release `/opt/deploy/chat/releases/chatui-image-viewer-20260806-060728`; image `sha256:9473a1f370d9` va rollback `songhong-production-chat:rollback-before-image-viewer-20260806` (`sha256:33234a7aaef0`). Container `chat` moi `ad87e9d01db6`; Chatmgt `23a55b61fa98`, ChatAPI `1cccca891456`, hai PostgreSQL, Redis va Coturn giu nguyen.
- Viec tiep theo: Nhan `Ctrl + F5` tai `https://chat.upgo.vn`, bam mot anh, kiem tra nut `X` goc trai va phim `Escape`; khong can UAT lai luong dang nhap.

## 2026-08-06-09 - Sua preview va mo anh Tinode co xac thuc

- Thoi gian: 2026-08-06 (Asia/Saigon)
- Loai: Sua loi | Giao dien | Realtime | Trien khai
- Trang thai: Hoan tat deploy production; cho UAT anh that
- Muc tieu: Anh Tinode hien preview trong ChatUI va bam vao anh mo duoc, ke ca anh trong lich su, thay vi hien icon anh hong.
- Nguyen nhan: Tinode tra URL `/v0/file/...` nhung the `img` va `window.open` khong tu gui `X-Tinode-APIKey`/token. Code da co proxy media cho upload/download nhung chua dung proxy co xac thuc cho renderer anh.
- Quyet dinh ky thuat: Chuan hoa URL media ve `/tinode-media`, tai blob bang header Tinode trong `resolveMediaUrl`, cache object URL cho preview va dung `openFile` de mo blob sau click; file thuong tiep tuc download qua fetch co xac thuc. Them fallback trang thai thay cho broken-image icon.
- Kiem thu: `npm run test:frontend` dat 32/32; `npm run lint` exit 0 voi warning legacy; `npm run build:production` dat; `git diff --check` dat. Public health tra HTTP 200; route media khong token tra HTTP 403 (route da toi ChatAPI); bundle public co `resolveMediaUrl`, `openFile`, `/tinode-media` va `image-preview-button`; log ChatUI 5 phut khong co loi nghiem trong.
- Trien khai: Release `/opt/deploy/chat/releases/chatui-tinode-media-preview-20260806-060200`; image `sha256:33234a7aaef0` va rollback `songhong-production-chat:rollback-before-tinode-media-preview-20260806` (`sha256:dd7517812ff0`). Container `chat` moi `34a94d2c76b4`; Chatmgt `23a55b61fa98`, ChatAPI `1cccca891456`, hai PostgreSQL, Redis va Coturn giu nguyen.
- Rui ro con lai: Chua co browser session production de click anh bang tai khoan that; neu media URL cu da het han hoac bi thu hoi, fallback se bao loi thay vi hien anh. Can UAT anh moi va anh lich su sau hard refresh.
- Viec tiep theo: Nhan `Ctrl + F5` tai `https://chat.upgo.vn`, mo lai hoi thoai co anh, bam thumbnail va thu gui mot anh moi tu tai khoan khac.

## 2026-08-06-08 - Khoi phuc day du dieu huong ChatUI production

- Thoi gian: 2026-08-06 (Asia/Saigon)
- Loai: Sua loi | Giao dien | Cau hinh | Trien khai
- Trang thai: Hoan tat deploy production; cho UAT nguoi dung
- Muc tieu: Khoi phuc cac muc Chat, Danh ba, Nhom, File dung chung, Thong bao, tim kiem va thao tac workspace tren ChatUI thay vi de production chay che do external chatbot-only.
- Pham vi: Mac dinh `VITE_CHAT_MODE` cua build production, Dockerfile, Compose va file mau cau hinh; giu nguyen tenant `tn6913580727957397`, auth, Tinode va preview anh/file.
- Ly do va quyet dinh ky thuat: `external` an cac nhanh directory/Tinode va cac muc dieu huong bang ca logic React lan CSS. Dat mac dinh ve `internal` de luong ChatUI chinh hien lai day du; external chatbot van co the bat lai bang bien moi truong khi can.
- Kiem thu: `npm run test:frontend` dat 32/32; `npm run lint` exit 0 voi warning legacy; `npm run build:production` dat; Compose `config -q` dat voi `TINODE_SSO_SECRET` dummy chi trong process; `git diff --check` dat. Public `https://chat.upgo.vn/healthz` tra HTTP 200 `ok`; bundle public co `VITE_CHAT_MODE=internal`, tenant `tn6913580727957397`, marker `image-preview-button`, khong co `127.0.0.1:6060`; log ChatUI 5 phut sau deploy khong co emerg/alert/crit/error/fatal/panic/traceback.
- Trien khai: Release `/opt/deploy/chat/releases/chatui-internal-navigation-20260806-050250`; image ChatUI `sha256:dd7517812ff0` duoc build tu image cu va chi thay `dist`; rollback `songhong-production-chat:rollback-before-internal-navigation-20260806` (`sha256:f614bb8d2166`). Container `chat` moi `b87c5414ee0b`; `chatmgt` `23a55b61fa98`, ChatAPI `1cccca891456`, Chat PostgreSQL `78a434b49404`, Tinode PostgreSQL `9f6e4dcc9c2f`, Redis `ceef7df23feb` va Coturn `aa680d35fdc0` giu nguyen.
- Rui ro con lai: Moi truong nay khong co browser session de UAT pixel desktop/mobile; can hard refresh de loai bundle cache, sau do dang nhap va xac nhan cac muc Danh ba, Nhom, File dung chung, Thong bao, tim kiem va preview anh.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, dang nhap lai va xac nhan day du dieu huong; neu trinh duyet van hien giao dien cu, mo tab an danh hoac xoa cache site.

## 2026-08-06-07 - Sua tenant build production lam dang nhap that bai

- Thoi gian: 2026-08-06 (Asia/Saigon)
- Loai: Sua loi | Xac thuc | Cau hinh | Trien khai
- Trang thai: Hoan tat khoi phuc production; cho UAT tai khoan that
- Muc tieu: Khoi phuc dang nhap ChatUI va tranh build production vo tinh gui sai tenant doanh nghiep.
- Pham vi: Tenant build-time cua ChatUI, Dockerfile/Compose production, tai lieu cau hinh; khong migration, khong doi password, cookie, Tinode database, Chatmgt database hay service du lieu.
- Noi dung: Production dang phuc vu bundle tao bang `npm run build`, nen Vite lay `.env.local` va gui `tenant_id=song-hong`. Audit production xac nhan tai khoan that nam trong tenant `tn6913580727957397`; log `POST /api/v1/auth/login` tra `401` roi `429`. Cap nhat cac mac dinh production sang tenant that va yeu cau build lai bang `npm run build:production`.
- Quyet dinh ky thuat: Giu tenant co dinh cho domain `chat.upgo.vn`, khong them tenant selector tren trinh duyet. Local/demo `.env.local` van co the dung tenant rieng; production defaults khong duoc im lang roi ve tenant local.
- Kiem thu: `npm run test:frontend` dat 32/32; `npm run lint` exit 0 voi warning legacy; `npm run build:production` dat; `docker compose --env-file infrastructure/production/.env.example -f infrastructure/production/compose.yaml config -q` dat voi `TINODE_SSO_SECRET` dummy chi trong process; `git diff --check` dat. Production `verify_deployment.py` dat database/credential, health, CORS, directory, conversation, Tinode WebSocket, login/logout; `verify_tenant_isolation.py` dat. Public ChatUI/Chatmgt health `200`, preflight CORS cho `https://chat.upgo.vn` dat, probe sai credential voi tenant that tra `401`; bundle public `App-DzD7eZWy.js` co tenant `tn6913580727957397` va `image-preview-button`, khong co `127.0.0.1:6060`.
- Trien khai: Release `/opt/deploy/chat/releases/tenant-auth-image-preview-20260806-1230`; image ChatUI `sha256:f614bb8d2166` duoc tao tu image rollback cu va chi thay `dist`; rollback `songhong-production-chat:rollback-before-tenant-auth-20260806` (`sha256:435965f52e2b`). Container `chat` moi `e8ed61d62ad1` healthy; `chatmgt`, ChatAPI, hai PostgreSQL, Redis va Coturn giu nguyen ID.
- Rui ro con lai: Chua replay tao employee/reset password bang phien Account admin that trong moi truong nay; log truoc deploy co mot request tao user `400` va reset password `502`, can UAT lai voi du lieu/luong admin that, khong ghi mat khau vao log. Neu UAT van loi, lay error code va thoi diem moi de doi chieu.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, dang nhap bang tai khoan employee trong tenant `tn6913580727957397`, sau do thu tao employee va reset password tren `https://chatmgt.upgo.vn`; khong can migration.

## 2026-08-06-06 - Dang trien khai preview anh len ChatUI production

- Thoi gian: 2026-08-06 11:18 (Asia/Saigon)
- Loai: Van hanh | Giao dien
- Trang thai: Hoan tat deploy production, cho UAT Tinode
- Muc tieu: Dua bundle ChatUI co preview anh vao `https://chat.upgo.vn` thay cho asset cu dang duoc phuc vu.
- Pham vi: Rieng service `chat` va image Nginx frontend; khong recreate Chatmgt, Tinode/ChatAPI, PostgreSQL, Redis, Coturn, database hay API.
- File da thay doi: `dist/index.html`, `dist/assets/*`, `docs/CHANGELOG.md`; source UI da duoc cap nhat truoc do tai `src/app/App.jsx` va `src/styles/index.css`.
- Noi dung: Da xac nhan public web van tra asset cu, remote deploy host co quyen SSH, service `chat` dang healthy va release hien tai co the gan tag rollback truoc khi thay image. Da build image `songhong-production-chat:image-preview-20260806` tu image ChatUI cu, gan tag rollback `songhong-production-chat:rollback-before-image-preview-20260806`, tao release `/opt/deploy/chat/releases/image-preview-20260806-1120` va recreate rieng service `chat`.
- Quyet dinh ky thuat: Tao image frontend moi tu image ChatUI production hien tai va chi thay cac file `dist` da build; khong dua worktree backend dang dirty len production.
- Database/API/cau hinh: Khong co thay doi.
- Kiem thu truoc deploy: `npm run test:frontend` 32/32, `npm run build` exit 0, `npm run lint` exit 0 voi warning legacy, `git diff --check` exit 0; public `https://chat.upgo.vn` truoc deploy da xac nhan asset cu. Sau deploy, container `chat` ID `7612225ba732` healthy, `http://127.0.0.1:8094/healthz` va `https://chat.upgo.vn/healthz` tra 200, public index tro den `index-Doxh_obU.js`/`index-DzLBjWaQ.css`, lazy chunk `App-v-WWPVzG.js` co marker `image-preview-button`; Chatmgt/Tinode/database/Redis/Coturn khong bi recreate.
- Rui ro con lai: Chua UAT bang tai khoan Tinode that de xac nhan anh tu tai khoan khac hien preview va mo duoc tren desktop/mobile; local temp archive da duoc xoa, release va rollback tag tren server duoc giu lai.
- Viec tiep theo: Hard refresh `https://chat.upgo.vn`, gui anh tu tai khoan khac va bam thumbnail; rollback bang tag `songhong-production-chat:rollback-before-image-preview-20260806` neu UAT phat hien loi.
- Commit/PR: Chua tao.

## 2026-08-06-05 - Hien thi anh gui den ngay trong hoi thoai

- Thoi gian: 2026-08-06 11:07 (Asia/Saigon)
- Loai: Giao dien | Kha dung
- Trang thai: Hoan tat code va kiem thu local, cho UAT Tinode
- Muc tieu: Anh PNG/JPG nguoi khac gui den phai hien thi ngay trong chat de nguoi dung xem va bam mo anh, khong bi coi nhu file tai xuong.
- Pham vi: Renderer attachment anh trong chat; PDF, audio, Excel va file thuong tiep tuc dung card tai/mo; khong doi database, API public, auth, Tinode protocol hay backend Chatmgt.
- File da thay doi: `src/app/App.jsx`, `src/styles/index.css` va file nay.
- Noi dung: Tach nhanh anh khoi nhanh file; anh co thumbnail that, nhan dien loi anh theo MIME/duoi file, hien goi y `Xem anh` khi hover/focus va bam vao anh de mo URL media. Anh pending van dung preview local, con file thuong van co nut mo/tai xuong. Build lai bundle `dist` de surface dang phuc vu khong con dung asset cu.
- Quyet dinh ky thuat: Dung mot nguon preview uu tien URL attachment, sau do fallback `msg.image` cho Tinode/optimistic message; khong goi ham tai file khi click vao anh.
- Database/API/cau hinh: Khong co thay doi.
- Kiem thu: `npm run test:frontend` exit 0, 32/32; `npm run build` exit 0 va `dist/index.html` tro den asset moi; `npx vite build --outDir .codex-build-attachment --emptyOutDir` exit 0 va da xoa build tam; `npm run lint` exit 0 voi warning legacy; `git diff --check` exit 0.
- Rui ro con lai: Can hard refresh bundle va UAT bang anh tu tai khoan Tinode khac de xac nhan media URL hien truc tiep va bam mo anh tren desktop/mobile.
- Viec tiep theo: Build/deploy bundle moi, hard refresh trinh duyet, gui anh tu tai khoan khac va bam thumbnail de xac nhan khong bi tai xuong.
- Commit/PR: Chua tao.

## 2026-08-06-04 - Lam lai card anh va file dinh kem

- Thoi gian: 2026-08-06 11:01 (Asia/Saigon)
- Loai: Giao dien | Kha dung
- Trang thai: Hoan tat code va kiem thu local, cho UAT giao dien
- Muc tieu: Bo cach hien thi anh/file cu, kho, va khong dong nhat voi mau card mong muon; anh PNG/JPG cung hien compact attachment card nhu file.
- Pham vi: Renderer attachment trong chat, panel File dung chung va responsive CSS; khong doi database, API public, auth, Tinode protocol hay backend Chatmgt.
- File da thay doi: `src/app/App.jsx`, `src/styles/index.css` va file nay.
- Noi dung: Anh khong con bung thanh preview lon; moi attachment co icon theo loai, ten file, dung luong, trang thai `Da co tren Cloud`, nut mo file va nut tai xuong. Card gui di dung nen xanh dam, card nhan dung nen sang; panel File dung chung dung cung layout va thao tac.
- Quyet dinh ky thuat: Dung mot renderer duy nhat cho `image` va `file`, tach nut noi dung tai file khoi nhom action de tranh nested button; giu fallback metadata cho message anh cu va khong can migration du lieu.
- Database/API/cau hinh: Khong co thay doi.
- Kiem thu: `npm run test:frontend` exit 0, 32/32; `npx vite build --outDir .codex-build-attachment --emptyOutDir` exit 0 va da xoa build tam; `npm run lint` exit 0 voi warning legacy; `git diff --check` exit 0. Browser local khong kha dung trong moi truong nen chua co screenshot UAT desktop/mobile.
- Rui ro con lai: Can hard refresh bundle va UAT bang anh PNG/JPG, file PDF/Excel/audio va file dung chung tren Tinode that; can xac nhan nut mo/tai xuong tren mobile.
- Viec tiep theo: Build/deploy bundle moi, hard refresh trinh duyet, gui lai anh va file, mo panel File dung chung de xac nhan card khong con nen cam cu.
- Commit/PR: Chua tao.

## 2026-08-06-03 - Sua nhan dien anh trong attachment Tinode

- Thoi gian: 2026-08-06 10:42 (Asia/Saigon)
- Loai: Sua loi | Giao dien | Realtime
- Trang thai: Hoan tat code va kiem thu local, cho UAT Tinode
- Muc tieu: Khong de anh PNG/JPG bi hien thi nhu the file khi Tinode tra ve attachment dang `EX` hoac echo ghi de message preview.
- Pham vi: Chuan hoa message Tinode, merge message trong ChatUI va renderer attachment; khong doi database, API public, auth hay backend Chatmgt.
- File da thay doi: `src/features/chat/services/tinodeClient.js`, `src/app/App.jsx` va file nay.
- Noi dung: Nhan dien anh theo `IM`, MIME va duoi file; gan lai `image`, metadata va type `image` cho ca attachment cu; merge echo uu tien type image khi message optimistic da co preview.
- Quyet dinh ky thuat: Bao tuong thich voi anh da gui bang luong `EX`, vi vay khong can migration hay gui lai du lieu Tinode.
- Database/API/cau hinh: Khong co thay doi.
- Kiem thu: `npm run lint` exit 0 voi warning legacy; `npm run test:frontend` dat 32/32; `npx vite build --outDir .codex-build-attachment --emptyOutDir` dat; `git diff --check` dat.
- Rui ro con lai: Can hard refresh bundle va UAT mot anh moi/anh cu bang tai khoan Tinode that de xac nhan URL media qua proxy.
- Viec tiep theo: Build/deploy bundle moi, hard refresh trinh duyet, sau do gui lai mot PNG va mo lai hoi thoai co anh cu.
- Commit/PR: Chua tao.

## 2026-08-06-02 - Hien thi anh va file dinh kem theo dung loai

- Thoi gian: 2026-08-06 10:31 (Asia/Saigon)
- Loai: Giao dien | Tinh nang | Realtime
- Trang thai: Hoan tat code va kiem thu local, cho UAT Tinode
- Muc tieu: Hien thi anh nhu anh xem truoc va file nhu the tai lieu gon, de ten, dung luong, thoi gian va trang thai de doc hon.
- Pham vi: ChatUI va luong gui attachment Tinode; khong sua backend Chatmgt, database, API public, auth, notification hay call.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/tinodeClient.js`, `src/styles/index.css` va file nay.
- Noi dung: Anh duoc preview ngay khi chon, giu dung ty le thay vi bi crop; sau khi upload thanh cong preview doi sang URL Tinode. File dung layout grid voi bieu tuong, ten ellipsis, dung luong va thoi gian; card van bam de tai xuong va hien trang thai dang gui/loi.
- Quyet dinh ky thuat: Phan biet anh bang MIME/duoi file; Tinode dong goi anh bang Drafty `IM`/`appendImage`, file thuong bang `EX`/`attachFile`, de thiet bi nhan cung nhan dung loai attachment. Object URL preview duoc thu hoi sau upload thanh cong.
- Database/API/cau hinh: Khong migration, khong doi request/response Chatmgt, khong them bien moi truong.
- Kiem thu: `npm run lint` exit 0, chi con warning legacy; `npm run test:frontend` dat 32/32; `npx vite build --outDir .codex-build-attachment --emptyOutDir` dat; `git diff --check` dat. Build tam da duoc xoa.
- Rui ro con lai: Chua UAT bang hai tai khoan Tinode that de xac nhan anh hien dung o phia nguoi nhan va tai file tren mobile.
- Viec tiep theo: Gui thu mot anh va mot file trong direct/group chat, xac nhan preview anh, card file, download va hard refresh khong loi.
- Commit/PR: Chua tao.

## 2026-08-06-01 - Sua tao employee Chatmgt khi trung username Tinode

- Thoi gian: 2026-08-06 09:20-09:34 (Asia/Saigon)
- Loai: Sua loi | Xac thuc | Trien khai
- Trang thai: Hoan tat va da trien khai production
- Muc tieu: Cho phep admin tao employee Chatmgt va provision san tai khoan Tinode ngay ca khi cung username da ton tai o tenant khac, khong anh huong cac luong ChatUI, ChatAPI va nguon du lieu khac.
- Pham vi: Rieng nhanh `management_user_create` khi `TINODE_MIRROR_LOCAL_CREDENTIALS=true`, tai lieu kien truc va release Chatmgt production; khong doi API, database, migration, UI, conversation, message, chatbot, Account SSO hoac Tinode server.
- File da thay doi: Runtime release `chatservice-main/application/controllers/api_chat_management.py`, `docs/chat-backend-architecture.md` va file nay.
- Noi dung: Giu kiem tra trung username/email trong tenant nhu cu. Neu raw username da duoc tenant khac dung tren Tinode, Chatmgt van luu username employee da nhap nhung provision Tinode basic account bang `stable_tinode_username(tenant_id, account_id)` va luu mapping vao `tinode_username`; mat khau employee tiep tuc duoc mirror server-side de tai khoan co the dang nhap va nhan Tinode token.
- Quyet dinh ky thuat: Khong bo tenant isolation va khong tai su dung Tinode UID cua tai khoan trung ten. Raw Tinode username van duoc giu cho tai khoan dau tien de tuong thich; chi collision cross-tenant moi dung ten `upgo_<hash>` on dinh. Hotfix duoc ap dung tren snapshot production hien tai vi backend local dang o revision cu hon va worktree co thay doi nguoi dung khong thuoc pham vi.
- Database/API/cau hinh: Khong migration, khong doi contract request/response va khong doi bien moi truong. Release moi la `/opt/deploy/chat/releases/chatmgt-tinode-username-fix-20260806-092916`; chi image/service `chatmgt` duoc build va force-recreate.
- Kiem thu: Production `docker compose config -q` dat; `python -m py_compile` controller dat; image build dat; focused unittest mirror credential dat 1/1 va full `tests.test_chat_auth_contract` dat 31 test, 12 skip do runtime image khong kem source frontend/deployment; source assertion xac nhan co fallback stable username va khong con `TINODE_USERNAME_EXISTS`; Chatmgt healthy; public `https://chatmgt.upgo.vn/api/v1/auth/health` HTTP 200 va bao `tinode_bridge_configured=true`, `local_credentials_mirrored=true`; log 10 phut khong co emerg/fatal/panic/critical/traceback/exception. ChatUI, ChatAPI, hai PostgreSQL, Redis va Coturn giu nguyen container ID.
- Trien khai: Image Chatmgt moi `sha256:707e8e95619fa8d3ed4f8bf3c9d0de61bc4e4ce1e453d21728d0a4a33eeee22b`, container `23a55b61fa98`; image cu `sha256:b5b8dad0dfafc8349c6b050e58e31ea851afb19965e53ec9bc033e576463f8f9` duoc gan tag `rollback-before-account-create-20260806`; symlink `current` da chuyen sang release moi.
- Rui ro con lai: Chua gui lai request tao employee bang phien admin that de tranh tu y tao du lieu production; can admin thu lai username bi loi va xac nhan employee dang nhap ChatUI/Tinode binh thuong.
- Viec tiep theo: Thu tao lai employee bi loi tren `chatmgt.upgo.vn`; neu van gap loi, ghi lai error code/thoi gian de doi chieu log ma khong gui mat khau.
- Commit/PR: Chua tao.

## 2026-08-05-01 - Don giao dien, bo chu huong dan va trien khai production

- Thoi gian: 2026-08-05 22:52-23:18 (Asia/Saigon)
- Loai: Giao dien | Kha dung | Trien khai
- Trang thai: Hoan tat va da trien khai production
- Muc tieu: Xoa cac doan helper va huong dan du thua tren ChatUI/Chatmgt theo yeu cau, giu giao dien va luong nghiep vu con lai.
- Pham vi: Man hinh dang nhap ChatUI, chatbot/kho tri thuc, cac panel workspace, form thong bao/nhom va man hinh quan tri Chatmgt. Khong doi API, database, auth, Tinode, validation, handler hoac quyen.
- File da thay doi: src/app/App.jsx, src/features/auth/components/Login.jsx, src/features/chatbot/components/KnowledgeManager.jsx, src/features/management/ManagementApp.jsx va file nay.
- Noi dung: Bo subtitle/security note dang nhap, helper text trong panel/form, mo ta he thong trong the Chatmgt, thong diep empty-state mang tinh chi dan va mo ta tu sinh cua direct chat. Giu nhan truong, nut, loi, loading, ket qua tim kiem, trang thai va canh bao reset mat khau; footer modal duoc can lai sau khi bo ghi chu. Production phuc vu ChatUI bundle `App-UjR8gkXN.js` va Chatmgt bundle `ManagementApp-BpfM6UqB.js`.
- Quyet dinh ky thuat: Chi thay doi JSX text va layout phu tro; khong thay doi state, payload, dieu kien, service call hay luong dang nhap/chat/quan tri. Mo ta nhom do nguoi dung luu van duoc giu nguyen. Do worktree local con cac thay doi luong external-chat chua thuoc pham vi, release bat bien `/opt/deploy/chat/releases/ui-clean-20260805-2312` duoc sao chep tu snapshot production `/opt/deploy/chat/releases/211ad40` va patch exact-match rieng bon file UI. Chi build/recreate `chatmgt` va `chat`; symlink `current` da chuyen sang release moi.
- Database/API/cau hinh: Khong co thay doi.
- Trien khai: `docker compose config -q` dat; image moi la ChatUI `sha256:8f767d832609fb13f7a65b50eec0097aa544196fc4d7015d3a255ae5b6f0b6e7` va Chatmgt `sha256:b5b8dad0dfafc8349c6b050e58e31ea851afb19965e53ec9bc033e576463f8f9`. Container moi la `chat` `2eb84324ecd7` va `chatmgt` `a5537f1636ad`. Image cu duoc gan tag `rollback-before-ui-clean-20260805` voi ID ChatUI `sha256:5fc2fad15561a87e84b2c28696ba163cc091912914377e456139aa385df04fe3` va Chatmgt `sha256:8256b6077a66d01c079d356bcf98737b24ccfce2118b15b045d3a5c2c2f5788d`.
- Kiem thu: Local `npm run lint` dat exit 0, chi con warning legacy trong `src/App.jsx` va `public/ChatBotWidget/tinode.js`; `npm run test:frontend` dat 32/32; `npm run build -- --outDir .codex-build-ui-guidance --emptyOutDir` dat; `git diff --check` dat. Production build ca hai image dat; ChatUI/Chatmgt healthy; Nginx syntax dat; local va public health deu HTTP 200; bundle public co chu ngan gon moi va khong con cac helper marker da xoa; log 10 phut khong co emerg/fatal/panic/critical/traceback/exception. ChatAPI, hai PostgreSQL, Redis va Coturn giu nguyen container ID truoc/sau.
- Rui ro con lai: Moi truong Codex khong co browser session kha dung de UAT truc quan desktop/mobile; can hard refresh va xem lai cac modal/panel bang tai khoan that.
- Viec tiep theo: Hard refresh `chat.upgo.vn` va `chatmgt.upgo.vn`, sau do UAT login, workspace, chatbot, form ket ban/tat thong bao va cac man hinh Chatmgt; rollback bang hai image tag neu phat hien loi giao dien.
## 2026-08-05-06 - Hardening response truc tiep tu Chatmgt

- Thoi gian: 2026-08-05 18:00 (Asia/Saigon)
- Loai: Bao mat | Van hanh
- Trang thai: Hoan tat va da deploy production
- Muc tieu: Bao dam `chatmgt.upgo.vn` tra security header ngay ca khi chua co quyen sua reverse proxy host `.218`.
- Pham vi: Response middleware Chatmgt va test cau hinh; khong thay doi auth, tenant, database, Tinode token/topic/message, Workspace hay chatbot.
- File da thay doi: `chatservice-main/application/server.py`, `chatservice-main/tests/test_tinode_central_switch.py`, `docs/CHANGELOG.md`.
- Noi dung: Chatmgt them CSP, `Referrer-Policy`, `X-Content-Type-Options` va `X-Frame-Options` vao moi response, bao gom static management UI va API.
- Quyet dinh ky thuat: Dat header tai ung dung de khong phu thuoc quyen SSH `.218`; giu CSP cung contract voi ChatUI va khong sua CORS/cookie/session.
- Database/API/cau hinh: Khong migration, endpoint, payload, secret hay bien moi truong moi.
- Kiem thu: `python -m py_compile chatservice-main/application/server.py` dat; backend local dat 107 test, 37 skip dependency runtime; image production dat 107 test, 15 skip source frontend/infrastructure; E2E production voi hai verifier account dat direct receive, group receive, typing va receipt qua Tinode public WSS; public header/CORS/health va verifier dat; account verifier da xoa sach, database count khong doi va log khong co severe match.
- Rui ro con lai: Credential admin Tinode trung tam bi tu choi va certificate `web.vichat.net` het han; hai muc nay can quyen tren `103.74.122.215`.
- Viec tiep theo: Tinode operator cap credential admin hop le va gia han certificate tren `103.74.122.215`; sau do bat lai upstream TLS verification.
- Commit/PR: `211ad40`.

## 2026-08-05-05 - Bo sung browser security headers cho ChatUI production

- Thoi gian: 2026-08-05 17:00 (Asia/Saigon)
- Loai: Bao mat | Van hanh
- Trang thai: Hoan tat phan ViChat va da deploy production; con blocker tu Tinode trung tam
- Muc tieu: Them lop hardening HTTP cho ChatUI ma khong thay doi luong dang nhap, Tinode, Chatmgt, API hay noi dung chat.
- Pham vi: Nginx production cua ChatUI va test cau hinh; khong thay doi Tinode trung tam, database, Redis, ChatAPI, Coturn hay employee flow.
- File da thay doi: `infrastructure/production/nginx.conf`, `chatservice-main/tests/test_tinode_central_switch.py`, `docs/CHANGELOG.md`.
- Noi dung: Them CSP tuong thich voi SPA, Font Awesome/Google Fonts, Tinode WebSocket va media; them `Referrer-Policy`, `X-Content-Type-Options` va `X-Frame-Options` cho ca response thanh cong va loi.
- Quyet dinh ky thuat: Dung `always` de header khong mat tren response loi; khong bat TLS verification upstream Tinode trong thay doi nay vi chung chi `web.vichat.net` dang het han va can ben quan tri Tinode gia han truoc.
- Database/API/cau hinh: Khong migration; thay doi chi o Nginx response headers.
- Kiem thu: `python -m unittest discover -s chatservice-main/tests -v` dat 106 test, 37 skip; `npm run test:frontend` dat 35/35; `npm run lint` khong co error, chi warning legacy; Compose config va Nginx syntax test dat; public verifier dat login/logout, CORS, directory, conversation va Tinode WebSocket; asset/health/header production tra HTTP 200; container du lieu/realtime khong doi ID va log khong co severe match.
- Rui ro con lai: Credential quan tri Tinode trung tam dang bi tu choi va certificate upstream het han; can quyen ben `103.74.122.215` de xu ly doc lap.
- Viec tiep theo: Tinode operator cap credential admin hop le va gia han certificate tren `103.74.122.215`; sau do chay lai admin reset va bat `proxy_ssl_verify on`.
- Commit/PR: `ad528bf`, `e2a77a1`.

## 2026-08-05-04 - Chuan hoa release Tinode mirror dang chay

- Thoi gian: 2026-08-05 16:24 (Asia/Saigon)
- Loai: Van hanh | Trien khai | Realtime | Xac thuc
- Trang thai: Hoan tat va da nghiem thu production
- Muc tieu: Bao dam cac lenh van hanh tiep theo su dung dung release da trien khai cho luong Chatmgt username/password va Tinode Web.
- Pham vi: Symlink release production, Chatmgt/ChatUI dang chay, verifier noi bo va public HTTPS; khong thay doi source, database, secret hay service du lieu/realtime.
- File da thay doi: `docs/CHANGELOG.md`; tren server chi chuyen symlink `/opt/deploy/chat/current` sang release `/opt/deploy/chat/releases/e1aa969`.
- Noi dung: Xac nhan container Chatmgt `e1aa969` va ChatUI dang chay san; chuan hoa `current` tu release cu `f58919a` sang `e1aa969` de tranh cac lenh restart ve code cu. PostgreSQL, Redis, ChatAPI va Coturn duoc giu nguyen, khong recreate.
- Quyet dinh ky thuat: Khong rebuild hoac reset du lieu vi image da duoc kiem thu va verifier da pass; chi cap nhat con tro release bat bien sau khi doi chieu file private mode `0600`.
- Database/API/cau hinh: Khong migration, khong doi `.env`; giu `TINODE_MIRROR_LOCAL_CREDENTIALS=true`, tenant production va relay central Tinode hien tai.
- Kiem thu: `python scripts/verify_deployment.py --base-url http://127.0.0.1:8093` dat; verifier public voi `--base-url https://chatmgt.upgo.vn --origin https://chat.upgo.vn` dat; `/healthz` ChatUI va `/api/v1/auth/health` Chatmgt tra HTTP 200; credential basic Tinode mo dung UID; cac container du lieu/realtime khong doi ID.
- Rui ro con lai: UAT trinh duyet voi tai khoan nhan vien that van can nguoi van hanh dang nhap ChatUI va Tinode Web bang cung username/password; cert/TTL trung tam Tinode van la hardening rieng.
- Viec tiep theo: Hard refresh hai tai khoan, dang nhap bang username/password vua cap trong Chatmgt, doi chieu UID/nhom/lich su va nhan tin hai chieu tren `web.vichat.net`.
- Commit/PR: Commit ghi nhan van hanh chua muc nay (xem `git log`).

## 2026-08-05-03 - Dong bo dang nhap nhan vien Chatmgt voi Tinode Web

- Thoi gian: 2026-08-05 16:13 (Asia/Saigon)
- Loai: Xac thuc | API | Realtime | Tai lieu
- Trang thai: Hoan tat code va deploy production; cho UAT trinh duyet hai tai khoan
- Muc tieu: Khi admin tao/reset nhan vien trong Chatmgt, nhan vien dung cung
  username/password trong ChatUI va Tinode Web; UID, nhom va lich su Tinode
  van duoc giu nguyen.
- Quyet dinh ky thuat: Bat `TINODE_MIRROR_LOCAL_CREDENTIALS` cho local employee.
  Chatmgt chi luu bcrypt; ChatUI giu mat khau trong volatile tab memory de
  renew token khi can, khong ghi vao storage/cookie/log. Tinode UID duoc kiem
  tra truoc khi adopt/migrate; duplicate UID khac tenant bi tu choi, khong tu
  dong bo nham. Account SSO quan tri van tach rieng.
- Pham vi: Chatmgt auth bridge, login/reset/change/revoke/deactivate, production
  env/compose examples, README va tai lieu architecture; khong sua message,
  topic, presence, receipt, call hay Workspace.
- Kiem thu: `python -m py_compile ...` dat; `python -m unittest discover -s
  chatservice-main/tests -v` dat 105 test, 37 skip do local thieu dependency
  runtime; `npm run test:frontend` dat 35/35; `npm run lint` khong co error,
  chi warning legacy; `npm run build:production` dat; Compose config validation
  va `git diff --check` dat. Docker image production dat 105 test, 14 skip do
  image khong dong goi source frontend/infrastructure. Release
  `/opt/deploy/chat/releases/e1aa969` da build/recreate rieng `chatmgt` va
  `chat`; verifier production dat database, health, CORS, directory,
  conversation, Tinode WebSocket, login/logout va cung credential basic.
- Rui ro con lai: Provider trung tam dang tra token TTL dai; da them
  `TINODE_CENTRAL_TOKEN_MAX_TTL` de verifier khong nham TTL local ChatAPI voi
  TTL trung tam, nhung can ben van hanh Tinode giam TTL neu muon hardening day
  du. Admin Tinode reset/revoke van can credential server hop le neu legacy
  credential khong con dung. Username Chatmgt khong tuong thich Tinode bi chan
  khi tao moi; tai khoan legacy dang dung username email can doi ten truoc khi
  dang nhap truc tiep Tinode Web.
- Viec con lai: UAT tren trinh duyet voi tai khoan moi: dang nhap ChatUI va
  Tinode Web bang cung username/password, kiem tra UID/nhom/lich su; ben van
  hanh Tinode nen giam TTL 14 ngay neu can hardening. Khong recreate
  PostgreSQL/Redis/ChatAPI/Coturn.
- Commit/PR: release code `e1aa969`; docs record tiep theo.

## 2026-08-05-02 - Trien khai relay Tinode trung tam len production

- Thoi gian: 2026-08-05 12:38 (Asia/Saigon)
- Loai: Trien khai | Van hanh | Du lieu | Realtime
- Trang thai: Hoan tat functional deployment, can khac phuc TTL/TLS de nghiem thu bao mat
- Muc tieu: Chuyen ChatUI va Chatmgt production sang Tinode trung tam `web.vichat.net` ma khong recreate ChatAPI, PostgreSQL, Redis hoac Coturn.
- Pham vi: Release `/opt/deploy/chat/releases/f58919a`, private `.env`, runtime Tinode bootstrap, proxy WSS, ChatUI, Chatmgt va mapping Tinode cua tenant `song-hong`.
- File da thay doi: `docs/CHANGELOG.md`; source runtime production la commit `f58919a`. Private `.env`, runtime va backup chi nam tren server.
- Noi dung: Tao archive sach SHA-256 `3fbe839f164989dd5afb78a2d2911ad3c2985f9aa9b938fc108b08b846bba240`, build image ChatUI/Chatmgt moi, gan rollback tag `rollback-before-f58919a`, cap nhat `TINODE_INTERNAL_WS_URL=ws://chat:80/v0/channels`, chuyen symlink `current` va giu `chatapi` cu cho rollback.
- Quyet dinh ky thuat: Theo chap thuan tam thoi cua nguoi dung, Nginx giu `proxy_ssl_verify off` de upstream Tinode het han van ket noi duoc; khong sua verifier de che giau TTL, functional verifier chi bypass rieng buoc expiry.
- Database/API/cau hinh: Tao backup Chatmgt PostgreSQL tai `/opt/deploy/chat/backups/pre-central-20260805T053143Z`; reset mapping song-hong gom 9 UID, 5 topic, xoa 91 chat-derived documents/chunks; khong migration schema.
- Kiem thu: Compose config, build, container health, public `chat.upgo.vn`/`chatmgt.upgo.vn` health, relay env va Nginx central proxy dat; functional verifier voi duy nhat TTL check bypass dat CORS, login/logout, directory, conversations, Tinode internal/public WebSocket va publish/delete. Official verifier chua dat vi Tinode trung tam cap token khoang 14 ngay.
- Rui ro con lai: Chung chi `web.vichat.net` da het han va `AUTH_TOKEN_EXPIRE_IN` trung tam chua nam trong cua so 60-900 giay; token/browser co the dai hon chinh sach. Can gia han cert va dat TTL <= 900 truoc khi goi la hoan tat bao mat.
- Viec tiep theo: Hard refresh hai tai khoan nhan vien, kiem tra login, tin nhan 1-1/nhom, file, presence, receipt va reconnect; sau khi ben van hanh Tinode sua cert/TTL thi chay lai verifier chinh thuc.
- Commit/PR: Commit ghi nhan trien khai duoc tao trong cung lan lam viec nay (xem git log).

## 2026-08-05-01 - Chuyen Tinode trung tam sang web.vichat.net

- Thoi gian: 2026-08-05 10:20 (Asia/Saigon)
- Loai: Tai cau truc | Bao mat | Van hanh | Du lieu
- Trang thai: Hoan tat code va kiem thu local, cho cau hinh trung tam va deploy
- Muc tieu: Dua Tinode tai `web.vichat.net` thanh nguon trung tam cho token, noi dung tin nhan, tep va realtime cua ChatUI; giu nguyen tai khoan, tenant, nhom va metadata Chatmgt, chap nhan reset lich su Tinode cu.
- Pham vi: Nginx ChatUI proxy, Chatmgt Tinode bridge, ChatUI ingestion, script reset mapping va tai lieu trien khai; khong thay doi luong dang nhap, directory, phan quyen tenant hay Workspace ngoai viec loai bo ban sao noi dung chat.
- File da thay doi: `README.md`, `chatservice-main/README.md`, `chatservice-main/application/controllers/api_chat_management.py`, `chatservice-main/application/controllers/api_chatbot.py`, `chatservice-main/application/services/auth_service.py`, `chatservice-main/application/services/enterprise_workspace_service.py`, `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/scripts/switch_tinode_central.py`, `chatservice-main/tests/test_tinode_bridge_service.py`, `chatservice-main/tests/test_tinode_central_switch.py`, `docs/chat-backend-architecture.md`, `infrastructure/production/.env.example`, `infrastructure/production/README.md`, `infrastructure/production/compose.yaml`, `infrastructure/production/nginx.conf`, `infrastructure/production/start.sh`, `src/app/App.jsx`, `src/features/chat/services/tinodeClient.js`, `src/features/chatbot/services/chatbotService.js`, `src/features/workspace/components/EnterpriseWorkspace.jsx` va bundle `dist/`.
- Noi dung: Ket noi noi bo Chatmgt va WebSocket public cua ChatUI se di qua Nginx toi `web.vichat.net`; Chatmgt uu tien dang nhap credential xac dinh va chi dung admin reset khi credential bi tu choi; tin nhan/tep Tinode khong con tu dong sao chep vao kho tri thuc Chatmgt; script rieng reset UID/topic va xoa du lieu chat-derived sau khi da backup.
- Quyet dinh ky thuat: Giu `chatapi` cu chay de rollback nhung khong con la endpoint duoc su dung. Proxy tat verify TLS upstream vi chung chi dich vu dich het han; SNI/Host van co dinh `web.vichat.net`. Khong reset mapping truoc khi proxy va provisioning moi duoc kiem tra.
- Database/API/cau hinh: Doi `TINODE_INTERNAL_WS_URL` sang `ws://chat:80/v0/channels`; them lenh mot lan de dat `tinode_uid`/`tinode_topic` ve NULL va xoa document/chunk co `CHAT_*`; khong migration schema.
- Kiem thu: `npm run test:frontend` dat 34/34; `npm run lint` dat, chi con warning legacy trong `src/App.jsx` va `public/ChatBotWidget/tinode.js`; `npm run build:production` dat; `python -m unittest discover -s chatservice-main/tests -v` dat 97 test, 30 skip do dependency runtime chi co trong image; test central switch dat 5/5; `python -m py_compile` dat; Compose config dat voi secret tam khong nhat vao source; DNS/handshake/provision/delete probe toi `web.vichat.net` dat.
- Rui ro con lai: Chung chi public cua `web.vichat.net` van het han; proxy la bien phap tam thoi. Probe cho thay Tinode trung tam cap token khoang 14 ngay, chua phu hop cua so 60-900 giay hien tai; can ben van hanh Tinode dat `AUTH_TOKEN_EXPIRE_IN` <= 900 va renew certificate truoc khi nghiem thu bao mat. Chua backup/reset/deploy production.
- Viec tiep theo: Cap nhat cau hinh Tinode trung tam, commit/push, backup production, kiem tra proxy/provisioning, reset mapping va deploy rieng ChatUI/Chatmgt; chi reset sau khi TTL va cert dat.
- Commit/PR: `7090d34`.

## 2026-08-04-05 - Trien khai Enterprise Workspace len production

- Thoi gian: 2026-08-04 21:15 (Asia/Saigon)
- Loai: Trien khai | Van hanh | Du lieu | Tinh nang
- Trang thai: Hoan tat trien khai production, cho UAT hai tai khoan nhan vien that
- Muc tieu: Dua Enterprise Workspace theo tenant cua commit `9f91e17` len `chat.upgo.vn`/`chatmgt.upgo.vn` voi backup va rollback day du, khong lam gian doan hoac recreate cac service Tinode/du lieu dang on dinh.
- Pham vi: Release bat bien `/opt/deploy/chat/releases/9f91e17`, migration Chatmgt PostgreSQL `20260804_10`, image/container `chatmgt` va `chat`; khong recreate `chatapi`, hai PostgreSQL, Redis hoac Coturn.
- File da thay doi: `docs/CHANGELOG.md`; source production la commit `9f91e17`. Private `.env`, Tinode bootstrap va backup chi nam tren server, khong dua vao Git.
- Noi dung: Xac minh backup tong the cu tai `/opt/deploy/chat/backups/pre-enterprise-suite-20260804T132212Z`; tao them backup sat migration tai `/opt/deploy/chat/backups/before-9f91e17-20260804T140855Z` gom Chatmgt dump, `.env`, checksum va container/image ID mode `0600`; gan tag rollback cho hai image cu. Build image moi, chay test trong image, nang Alembic, recreate rieng Chatmgt/ChatUI, nghiem thu API Workspace va chuyen symlink `current` sang release moi sau khi tat ca gate dat.
- Quyet dinh ky thuat: Migration chi duoc chay sau khi dump doc duoc bang `pg_restore` PostgreSQL 16; symlink chi doi sau verifier, tenant isolation, Workspace smoke test, public bundle va health check. Tinode tiep tuc giu message/presence/receipt/realtime; Workspace chi them business metadata theo tenant.
- Database/API/cau hinh: Alembic tu `20260803_09` len `20260804_10 (head)`; them ba bang `enterprise_item`, `enterprise_item_participant`, `enterprise_activity` va API `/api/v1/workspace/*`. Khong them/chinh secret, domain, port hay bien moi truong production.
- Kiem thu: Image production chay `python -m unittest discover -s tests -v` dat 90 test, 11 skip frontend-only; `verify_deployment.py` dat database/credential, health, CORS, directory, conversation, Tinode WebSocket, login/logout; `verify_tenant_isolation.py` dat user/conversation/friend/participant hai tenant. Workspace smoke test dat create/search/action/archive, tenant isolation va admin-only guard; public `App-KlOtrVEZ.js` co `/api/v1/workspace/items`; Nginx syntax, public health ChatUI/Chatmgt va container integrity deu dat, log khong co panic/fatal/traceback/critical/emerg.
- Rui ro con lai: Chua UAT truc quan bang hai nhan vien that cho responsive UI, polling 15 giay, phan quyen approval/announcement va luong `Giao viec tu tin nhan`; integration registry moi luu metadata an toan, chua tu dong goi he thong ngoai.
- Viec tiep theo: Hai user hard refresh, kiem tra task/ticket/wiki/event, admin publish announcement/integration, approval dung vai tro, message-to-task va regression tin nhan 1-1/nhom, presence, receipt, notification; lap lai bang tenant thu hai neu dua vao nghiem thu chinh thuc.
- Commit/PR: Tinh nang `9f91e17`; commit ghi nhan trien khai duoc tao trong cung lan lam viec nay.

## 2026-08-04-04 - Bo sung Enterprise Workspace theo tenant

- Thoi gian: 2026-08-04 16:00 (Asia/Saigon)
- Loai: Dang thuc hien
- Trang thai: Hoan tat code va kiem thu local, cho commit/push/trien khai production
- Muc tieu: Bo sung cac module giao viec, thong bao bat buoc, phe duyet, ticket, wiki, lich, tim kiem va audit cho ChatUI ma khong thay doi luong Tinode/chat dang on dinh.
- Pham vi: Chatmgt metadata/API, migration PostgreSQL, Enterprise Workspace ChatUI, phan quyen tenant va tai lieu; khong doc/ghi noi dung tin nhan Tinode.
- File da thay doi: `chatservice-main/application/models/models.py`, `chatservice-main/application/services/enterprise_workspace_service.py`, `chatservice-main/application/controllers/api_enterprise_workspace.py`, `chatservice-main/application/controllers/__init__.py`, `chatservice-main/migrations/010_enterprise_workspace.sql`, `chatservice-main/alembic/versions/20260804_10_enterprise_workspace.py`, `chatservice-main/scripts/verify_deployment.py`, `chatservice-main/tests/test_enterprise_workspace.py`, `src/features/workspace/components/EnterpriseWorkspace.jsx`, `src/features/workspace/components/enterpriseWorkspace.css`, `src/features/workspace/services/enterpriseWorkspaceService.js`, `src/features/workspace/services/enterpriseWorkspaceService.test.js`, `src/app/App.jsx`, `package.json`, `README.md`, `docs/chat-backend-architecture.md`, `infrastructure/production/README.md` va file nay.
- Noi dung: Them ba bang enterprise rieng voi participant/activity, API CRUD/search/stats/meta/action co tenant guard, allow-list property va audit; ChatUI co Workspace tong quan, task, announcement, approval, ticket, wiki, event, integration registry, tim kiem, activity timeline, polling 15 giay va nut giao viec tu tin nhan. Khong sua Tinode client, topic, message, presence, receipt, notification hay composer.
- Quyet dinh ky thuat: Tinode tiep tuc la nguon chuan cho message, presence, receipt va realtime; Workspace chi luu business metadata. Integration registry khong nhan/luu API key, token hay password. Message-to-task chi gui snapshot bounded do nguoi dung chon va message reference.
- Database/API/cau hinh: Them Alembic head `20260804_10` va SQL migration; verifier bat buoc ba bang Workspace va unique participant index; khong them secret/domain/env moi.
- Kiem thu: `python -m unittest discover -s tests -v` dat 90 test, 28 skip do dependency runtime chi co trong image; `python -m unittest tests.test_enterprise_workspace -v` dat 11/11; `python -m py_compile ...` dat; `npm run test:frontend` dat 34/34; `npm run lint` khong co error, chi warning legacy; `VITE_CHAT_MODE=internal npm run build:production` dat; local Vite HTTP root/source tra 200. Browser skill khong khoi tao duoc do moi truong kernel asset thieu, nen chua co screenshot UAT.
- Rui ro con lai: Chua chay migration/verifier tren PostgreSQL production va chua UAT hai tai khoan that cho Workspace; polling phu thuoc session Chatmgt va co the tre toi 15 giay. Integration registry moi la metadata, chua tu dong goi dich vu ngoai.
- Viec tiep theo: Review diff, commit/push snapshot sach, backup va upgrade Alembic tren release moi, deploy rieng Chatmgt/ChatUI, chay verifier va UAT tenant/role/action/realtime regression.
- Commit/PR: Chua tao.

## 2026-08-04-03 - Trien khai an cuoc goi va chatbot webhook len production

- Thoi gian: 2026-08-04 10:39 (Asia/Saigon)
- Loai: Trien khai | Van hanh | Cau hinh | API
- Trang thai: Hoan tat trien khai; chatbot doi tac cho mo endpoint de UAT end-to-end
- Muc tieu: Dua commit `0849061` len `chat.upgo.vn`/`chatmgt.upgo.vn`, tam an call va nap cau hinh outbound chatbot ma khong gian doan hoac recreate cac service du lieu/realtime khac.
- Pham vi: Release bat bien `/opt/deploy/chat/releases/0849061`, image/container `chatmgt` va `chat`, private `.env`, runtime Tinode bootstrap va nghiem thu production; khong recreate ChatAPI, hai PostgreSQL, Redis, Coturn va khong migration.
- File da thay doi: `docs/CHANGELOG.md`; source runtime production la commit `0849061`. Private `.env`/runtime chi duoc sao chep va cap nhat tren server, khong dua vao Git.
- Noi dung: Archive sach SHA-256 `47fce3e3b73729410bcfd66d5cb03abf736b3522b33419e8a54aa2d48d4455cb` duoc build thanh image ChatUI `sha256:8ff7eacf50152dee13e2a678e98d59f05bda11755f7ce08af9d274572cdde8fa` va Chatmgt `sha256:c1cfe7a39857a13e9358480de2dc0c80f6338c33a4587fa0eb3c6e25fd0b022a`. Bundle production la `App-CI7j_rYa.js`; symlink `current` da chuyen sang release moi.
- Quyet dinh ky thuat: Sao luu `.env` mode `0600`, giu runtime private va tenant `tn6913580727957397`; tag hai image cu thanh rollback `0a42a42` truoc build. Chi force-recreate `chatmgt`/`chat`; container ID ChatAPI, PostgreSQL, Redis va Coturn duoc doi chieu khong thay doi.
- Database/API/cau hinh: Khong migration. Production dat `VITE_CALLS_ENABLED=false`, `CHATBOT_ENABLED=true`, `CHATBOT_PROVIDER=external-webhook`, `CHATBOT_API_URL=https://knowledge.gonapp.net/api/v1/chat`, auth header/scheme mac dinh va `CHATBOT_KNOWLEDGE_ONLY=false`; `CHATBOT_API_KEY` van rong theo thong tin hien co.
- Kiem thu: Image Chatmgt dat 79 test, 10 skip do source frontend khong nam trong runtime image; `verify_deployment.py` dat database/credential, health, CORS, directory, conversation, Tinode WebSocket, login/logout. ChatUI/Chatmgt local va public deu HTTP 200; chatbot health public bao enabled/provider `external-webhook`; bundle co marker Tinode/password login, call-disabled va khong co external-only label; log khong co emerg/fatal/panic/critical. Probe tu server toi endpoint doi tac van tra HTTP 404 `Requested URL /api/v1/chat not found`.
- Rui ro con lai: Chua the UAT chatbot tra loi vi route doi tac dang 404 va chua co schema/API key chinh thuc. Runtime browser QA cua agent khong khoi tao duoc, nen UI duoc nghiem thu bang build, bundle marker va HTTP; nguoi dung can hard refresh de nap bundle moi.
- Viec tiep theo: Ben chatbot mo/xac nhan dung route va contract, sau do dang nhap mot tai khoan nhan vien de gui cau hoi UAT; khong can deploy lai neu URL va auth hien tai la dung.
- Commit/PR: Code `0849061`; commit ghi nhan trien khai duoc tao sau muc nay.

## 2026-08-04-02 - Tam an cuoc goi va ket noi chatbot webhook doanh nghiep

- Thoi gian: 2026-08-04 10:29 (Asia/Saigon)
- Loai: Tinh nang | Cau hinh | Bao mat | Giao dien | API
- Trang thai: Hoan tat code va kiem thu local, cho commit/push/trien khai production
- Muc tieu: Tam an toan bo diem vao goi thoai/video tren ChatUI va chuyen tro ly hien co sang API `https://knowledge.gonapp.net/api/v1/chat` ma khong thay doi chat noi bo, Tinode realtime, tenant, dang nhap hay cac chuc nang dang on dinh.
- Pham vi: Feature flag ChatUI cho call, adapter outbound Chatmgt-chatbot, cau hinh Docker/Compose/env, tai lieu kien truc va kiem thu; khong migration, khong sua Tinode/ChatAPI, database, Account SSO, danh ba, tin nhan, nhom, presence, receipt hay notification.
- File da thay doi: `.env.example`, `chatservice-main/.env.chatbot.example`, `chatservice-main/application/config/config.py`, `chatservice-main/application/services/chat_manager_service.py`, `chatservice-main/application/services/chatbot_service.py`, `chatservice-main/tests/test_chatbot_webhook_provider.py`, `docs/chat-backend-architecture.md`, `infrastructure/chatservice/.env.example`, `infrastructure/chatservice/compose.yaml`, `infrastructure/production/.env.example`, `infrastructure/production/Dockerfile`, `infrastructure/production/compose.yaml`, `scripts/build-production.mjs`, `src/app/App.jsx`, `src/features/chat/services/callSignaling.js`, `src/features/chat/services/callSignaling.test.js` va file nay.
- Noi dung: `VITE_CALLS_ENABLED=false` an nut goi thoai, goi video, goi lai va overlay cuoc goi; client bi tat tu choi call invite den de khong treo giao dien. ChatUI tiep tuc goi endpoint co xac thuc cua Chatmgt; provider `external-webhook` gui payload gioi han gom cau hoi, conversation ID, toi da 10 muc history, identity cong khai da loc va context duoc phep, dong thoi chap nhan cac response shape webhook thong dung.
- Quyet dinh ky thuat: Giu che do ChatUI noi bo hien tai, khong bat `VITE_CHAT_MODE=external` va khong de browser goi thang dich vu doi tac. API key neu co chi nam o Chatmgt; cookie, mat khau, token va secret khong di qua bien doi tac. Provider ngoai bo qua fallback small-talk/no-context noi bo de moi cau hoi duoc chuyen dung endpoint.
- Database/API/cau hinh: Khong migration va khong doi API ChatUI-Chatmgt. Them `VITE_CALLS_ENABLED`, `CHATBOT_PROVIDER=external-webhook`, `CHATBOT_API_URL`, `CHATBOT_EXTERNAL_AUTH_HEADER`, `CHATBOT_EXTERNAL_AUTH_SCHEME`; `CHATBOT_API_KEY` la tuy chon va `CHATBOT_KNOWLEDGE_ONLY=false` cho outbound webhook.
- Kiem thu: Snapshot sach tu Git index dat `npm run test:frontend` 32/32; `npm run lint` khong co error, chi warning legacy; `VITE_CHAT_MODE=internal npm run build:production` dat; `python -m unittest tests.test_chatbot_webhook_provider -v` dat 5/5; full backend dat 79 test, 28 skip do dependency runtime chi co trong image; `python -m compileall application tests`, Compose config local/production va `git diff --cached --check` deu dat. Probe `POST https://knowledge.gonapp.net/api/v1/chat` tra HTTP 404 tai thoi diem 10:20.
- Rui ro con lai: Endpoint doi tac dang 404 va chua co OpenAPI/API key/schema chinh thuc, nen chua the xac nhan chatbot tra loi end-to-end; can probe lai tu production va phoi hop ben dich vu neu route van chua duoc mo.
- Viec tiep theo: Commit/push snapshot sach, cap nhat `.env` production, rebuild/recreate rieng `chatmgt` va `chat`, sau do chay verifier, health check va probe chatbot tu server `.206`.
- Commit/PR: Commit chua muc nay (xem `git log`).

## 2026-08-04-01 - Trien khai dong bo avatar realtime len production

- Thoi gian: 2026-08-04 00:13 (Asia/Saigon)
- Loai: Trien khai | Sua loi | Realtime | Van hanh
- Trang thai: Hoan tat trien khai, cho UAT hai phien nguoi dung that
- Muc tieu: Dua hotfix avatar `0a42a42` len `chat.upgo.vn` de profile moi cap nhat trong hoi thoai, typing va lich su tin nhan/cuoc goi ma khong thay doi cac luong dang on dinh.
- Pham vi: Release bat bien `/opt/deploy/chat/releases/0a42a42`, image/container rieng service `chat`; khong recreate Chatmgt, ChatAPI, hai PostgreSQL, Redis, Coturn, khong migration va khong sua cau hinh production.
- File da thay doi: `docs/CHANGELOG.md`; source runtime production la commit `0a42a42`.
- Noi dung: Archive sach SHA-256 `38b6d36fcbea4e8ed1ac81a54e61ee27aeaa974ac07057fba84899a160088650` duoc build thanh image `sha256:127e62877605e51de42cb0907939a3727210c7abcef720a2f1a5e59f7acb4913`; container healthy la `453b20cb98c722177706ddde08d5d6c93940dae6e99c0d0043796375ee903422`. Public entry la `assets/index-BSYqbSc3.js` va ChatUI bundle la `App-uriIdy9w.js`.
- Quyet dinh ky thuat: Tiep tuc deploy tu archive commit sach, sao chep private `.env`/runtime mode an toan tu release cu va chi force-recreate ChatUI. Hai lan acceptance dau rollback dung image cu: lan mot do script truyen CRLF lam `head` nhan tham so `1\\r`, lan hai do regex bat nham `ManagementApp-*.js` thanh ChatUI `App-*.js`; ca hai la loi harness nghiem thu, khong phai loi runtime. Regex cuoi cung doi chieu dung `App-*.js` va moi cho phep cap nhat symlink `current`.
- Database/API/cau hinh: Khong thay doi. Giu `CHAT_ACCOUNT_SSO_ENABLED=false`, `CHATMGT_ADMIN_ACCOUNT_SSO_ENABLED=true`, `VITE_CHAT_AUTH_MODE=password`, tenant, secret, domain, reverse proxy va volume hien co.
- Kiem thu: Snapshot commit sach dat frontend 31/31, lint chi co warning legacy va production build dat. Production dat Nginx syntax, local/public health HTTP `200`, Chatmgt/ChatAPI healthy, public bundle co marker profile moi, log ChatUI khong co `emerg/fatal/panic/critical`; ID Chatmgt, ChatAPI, hai PostgreSQL, Redis va Coturn khong doi.
- Rui ro con lai: Chua co hai phien nguoi dung that de thay avatar doi truc tiep tren browser ben kia. Nguoi dung dang mo trang can hard refresh mot lan de nap bundle moi; cac lan doi avatar sau do phai cap nhat realtime.
- Viec tiep theo: Dang nhap hai tai khoan cung tenant, doi avatar tai mot phien va xac nhan phien con lai cap nhat ngay trong direct/group, typing indicator va lich su call ma khong reload.
- Commit/PR: Code `0a42a42`; commit ghi nhan trien khai duoc tao sau muc nay.

## 2026-08-03-14 - Dong bo avatar Tinode theo danh tinh Chatmgt

- Thoi gian: 2026-08-03 23:59 (Asia/Saigon)
- Loai: Sua loi | Realtime | Giao dien
- Trang thai: Hoan tat va da trien khai production, cho UAT hai phien nguoi dung that
- Muc tieu: Avatar moi cua nhan vien phai cap nhat realtime trong danh ba, header hoi thoai, danh sach thanh vien, typing indicator va lich su tin nhan/cuoc goi ma khong can tai lai trang.
- Pham vi: Chi luong profile/avatar giua ChatUI va Tinode; khong sua message content, call signaling, presence, receipt, notification, membership, Chatmgt API, database, authentication hoac chatbot.
- File da thay doi: `src/app/App.jsx`, `src/features/chat/services/tinodeClient.js`, `src/features/contacts/services/accountDirectory.js`, `src/features/contacts/services/accountDirectory.test.js`, `docs/chat-backend-architecture.md` va file nay.
- Noi dung: Tinode phat profile bang Tinode UID trong khi ChatUI giu account ID cua Chatmgt, nen avatar cu khong duoc thay trong room va message history. ChatUI nay doi chieu tat ca ID quan ly/Tinode, cache profile tu metadata topic truoc moi lan phat snapshot, cap nhat cac ban sao dang render va tim avatar typing bang cung phep doi chieu danh tinh. Tai khoan Chatmgt local khong con bi gan nham la profile Account chi-doc.
- Quyet dinh ky thuat: Giu Chatmgt la nguon danh tinh tenant va Tinode la kenh profile realtime; chi merge `name`/`avatar` vao entity trung danh tinh, bao toan ID va cac truong nghiep vu khac de tranh tao lai conversation hoac anh huong luong chat/call.
- Database/API/cau hinh: Khong thay doi. Khong migration, endpoint, payload, dependency, secret hoac bien moi truong moi.
- Kiem thu: `npm run test:frontend` dat 31/31; `npm run lint` dat voi warning legacy co san; `npm run build:production` dat; `git diff --check` se duoc chay lai tren diff staged truoc commit.
- Rui ro con lai: Chua UAT hai phien nguoi dung that de quan sat avatar doi ngay tren trinh duyet ben kia; can hard refresh mot lan sau deploy de nap bundle moi, sau do avatar thay doi tiep theo phai cap nhat realtime.
- Viec tiep theo: UAT avatar trong direct/group, typing va lich su cuoc goi bang hai phien nguoi dung that.
- Commit/PR: `0a42a42`.

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
- Commit/PR: Chua tao.

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

## 2026-08-03-03 - Gan endpoint chatbot localhost vao Chatmgt

- Thoi gian: 2026-08-03 11:03 (Asia/Saigon)
- Loai: Cau hinh | Tich hop API | Van hanh
- Trang thai: Hoan tat cau hinh, cho chatbot cong 8000 khoi dong de kiem thu runtime
- Muc tieu: Dung API chatbot do nguoi dung cung cap tai `http://localhost:8000/api/v1/chat` thay cho URL doi tac mau, trong khi ChatUI van goi qua Chatmgt va bo qua chat nhan vien noi bo.
- Pham vi: Cau hinh local truc tiep, local Docker, production Compose/env example, tai lieu tich hop; khong sua database, Account SSO, API ChatUI-Chatmgt hay cac chuc nang on dinh khac.
- File da thay doi: `.env.local`, `.env.example`, `chatservice-main/.env`, `chatservice-main/.env.chatbot.example`, `infrastructure/chatservice/.env`, `infrastructure/chatservice/.env.example`, `infrastructure/chatservice/compose.yaml`, `infrastructure/production/.env.example`, `infrastructure/production/compose.yaml`, `infrastructure/production/README.md`, `docs/external-chatbot-api.md`, `docs/chat-backend-architecture.md` va `docs/CHANGELOG.md`.
- Noi dung: Chatmgt chay truc tiep gui webhook toi `localhost:8000/api/v1/chat`; Chatmgt trong container dung `host.docker.internal:8000/api/v1/chat`. ChatUI local bat `VITE_CHAT_MODE=external` va gui tin toi `/chatmgt-api/api/v1/chatbot/message`, khong goi truc tiep chatbot cong 8000.
- Quyet dinh ky thuat: Giu proxy server-to-server de bao toan Account session, RAG context va kha nang them khoa API ma khong lo cau hinh ra browser. Them host-gateway cho production Compose vi `localhost` ben trong container khong phai deployment host.
- Database/API/cau hinh: Khong migration. Outbound endpoint khong co API key theo thong tin hien co; `CHATBOT_API_KEY` de trong va co the dien sau neu dich vu bat xac thuc. API nhan/truyen hien tai dung payload webhook gom `message`, `conversation_id`, `history`, `user`, `context`.
- Kiem thu: `python -m unittest tests.test_external_chatbot_contract -v` dat 7/7; doi chieu cau hinh xac nhan dung URL cho direct/Docker va ChatUI external mode; `docker compose ... config --quiet` dat cho local va production khi cap cac gia tri validation tam cho nhung secret bat buoc khong duoc commit; `git diff --check` dat. Probe `GET http://localhost:8000/openapi.json`, `GET http://localhost:8000/api/v1/chat` va health Chatmgt cong 8093 chua ket noi duoc vi hai dich vu local chua chay tai thoi diem cau hinh.
- Rui ro con lai: Chua xac minh schema request/response thuc te cua API cong 8000. Neu endpoint khong nhan truong `message` hoac khong tra mot trong `reply`, `answer`, `text`, `message`, `content`, `data.answer`, OpenAI `choices`, can them adapter theo contract cua dich vu.
- Viec tiep theo: Khoi dong chatbot cong 8000, recreate Chatmgt de nap env, sau do gui tin UAT va xac nhan log khong co loi 4xx/5xx.
- Commit/PR: Chua tao.

## 2026-08-03-02 - Ket noi chatbot ben ngoai va tat luong chat nhan vien trong ChatUI production

- Thoi gian: 2026-08-03 10:28 (Asia/Saigon)
- Loai: Tinh nang | Bao mat | API | Cau hinh | Giao dien
- Trang thai: Hoan tat code, cho cau hinh doi tac va UAT
- Muc tieu: Cho phep Chatmgt ket noi chatbot do he thong khac so huu, cung cap RAG context co kiem soat cho chatbot doi tac, va chuyen ChatUI production sang chi dung tro ly ben ngoai ma khong khoi tao danh ba/conversation/Tinode noi bo.
- Pham vi: ChatbotService/ChatManagerService, knowledge retrieval, API chatbot external, ChatUI mode external, Compose/Docker/env example, tai lieu kien truc-trien khai va test hop dong; khong sua database migration, Account SSO, trang quan tri hoac du lieu Tinode hien co.
- File da thay doi: `.env.example`, `README.md`, `chatservice-main/.env.chatbot.example`, `chatservice-main/application/config/config.py`, `chatservice-main/application/controllers/api_chatbot.py`, `chatservice-main/application/services/chat_manager_service.py`, `chatservice-main/application/services/chatbot_service.py`, `chatservice-main/application/services/knowledge_service.py`, `chatservice-main/tests/test_external_chatbot_contract.py`, `docs/chat-backend-architecture.md`, `docs/external-chatbot-api.md`, `infrastructure/chatservice/.env.example`, `infrastructure/chatservice/README.md`, `infrastructure/chatservice/compose.yaml`, `infrastructure/production/.env.example`, `infrastructure/production/Dockerfile`, `infrastructure/production/README.md`, `infrastructure/production/compose.yaml`, `scripts/build-production.mjs`, `src/app/App.jsx`, `src/features/chatbot/services/chatbotService.js`, `src/styles/index.css` va `docs/CHANGELOG.md`.
- Noi dung: Them `POST /api/v1/chatbot/external/context` va `POST /api/v1/chatbot/external/message` voi API key rieng, tenant bat buoc tu cau hinh server, tuy chon pin knowledge base, gioi han query/limit, HMAC reference cho external user va loai tru source `CHAT_*`. Them provider `external-webhook` gui payload trung lap gom message, history, user da loc va context; parser chap nhan reply/answer/text/message/data.answer/OpenAI choices. ChatUI nhan `VITE_CHAT_MODE=external`, chi tai chatbot history sau SSO va bo qua listUsers/listConversations/friend/Tinode; che do `internal` van la duong lui bang build config.
- Quyet dinh ky thuat: Tach `CHATBOT_EXTERNAL_API_KEY` (inbound) khoi `CHATBOT_API_KEY` (outbound); khong tin tenant/department do caller tu gui; tenant va knowledge base duoc co dinh hoac kiem tra phia server. External provider luon nhan ca cau hoi khong co context voi context rong, tranh fallback ve tro ly noi bo cu. Khong dua secret vao frontend hoac repository.
- Database/API/cau hinh: Khong co migration. Them `CHATBOT_EXTERNAL_AUTH_HEADER`, `CHATBOT_EXTERNAL_AUTH_SCHEME`, `CHATBOT_EXTERNAL_API_KEY`, `CHATBOT_EXTERNAL_TENANT`, `CHATBOT_EXTERNAL_KNOWLEDGE_BASE_ID`, `VITE_CHAT_MODE` va cac bien hien thi chatbot. Production `.env` that phai tu bo sung URL/keys/tenant/base ID; khong tu dong sua file dang bi ignore.
- Kiem thu: `npm run test:frontend` dat 22/22; `npm run lint` dat voi warning legacy co san; `npm run build -- --outDir .codex-build-external --emptyOutDir` dat va da xoa build tam; `python -m unittest tests.test_external_chatbot_contract -v` dat 7/7; full `python -m unittest discover -s tests -v` dat 78 test, 28 test runtime duoc skip vi may local thieu dependency trong image; `python -m py_compile ...`, `python -m compileall application tests`, hai lenh `docker compose ... config --quiet` va `git diff --check` deu dat. Browser runtime khong co browser kha dung nen chua QA thao tac UI.
- Rui ro con lai: Chua co URL/schema thuc te cua chatbot doi tac, API key production, knowledge base da phe duyet hoac phien Account that de UAT; chua chay nhom test phu thuoc aiohttp/bcrypt/Tinode trong production image. Khi `VITE_CHAT_MODE=external`, ChatUI khong con chat nhan vien trong browser nhung cac service Tinode/metadata van con trong source de rollback.
- Viec tiep theo: Dien gia tri that trong `infrastructure/production/.env`, nap tai lieu vao knowledge base, cap API key cho doi tac, goi thu context/message bang tenant dung, build/recreate rieng `chatmgt` va `chat`, sau do UAT login va chat ngoai tren desktop/mobile. Rollback bang `VITE_CHAT_MODE=internal` va rebuild ChatUI, khong can migration.
- Commit/PR: Chua tao.

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

## 2026-08-01-07 - Dinh chinh bo slide ViChat theo thuong hieu GonStack

- Thoi gian: 2026-08-01 12:59 (Asia/Saigon)
- Loai: Tai lieu | Thuyet trinh | Dinh vi san pham
- Trang thai: Hoan tat
- Muc tieu: Sua dinh vi bo thuyet trinh de ViChat duoc gioi thieu la san pham do GonStack phat trien cho nhieu doanh nghiep, khong phai san pham rieng cua Song Hong.
- Pham vi: Viet lai noi dung va nhan dien cua bo PowerPoint 15 slide; khong sua code, API, database, cau hinh, ha tang hay hanh vi nguoi dung.
- File da thay doi: `outputs/vichat-gonstack-gioi-thieu-san-pham-doanh-nghiep.pptx` va `docs/CHANGELOG.md`. Ban PPTX cu duoc giu nguyen vi dang bi PowerPoint khoa khi xuat ban moi.
- Noi dung: Xoa anh va moi ten goi Song Hong khoi ban moi; dat ro `VICHAT` la san pham phat trien boi `GONSTACK`; doi tro ly thanh `ViChat AI`; viet lai bai toan, gia tri, kien truc va loi keu goi pilot theo huong quang ba san pham cho thi truong doanh nghiep. Them slide dinh vi ViChat va Zalo theo muc tieu su dung: Zalo la kenh lien lac pho thong, con ViChat tap trung vao van hanh noi bo, SSO, tenant, quan tri, audit, realtime, tich hop va tri thuc doanh nghiep.
- Quyet dinh ky thuat: Giu visual system 16:9, mau cam `#F4511E` va bo cuc editorial cua ban truoc de khong tao lai deck tu dau. So sanh Zalo duoc viet trung lap theo dinh huong su dung, khong tuyen bo day la bang doi chieu day du tinh nang. Xuat thanh ten file moi vi file cu dang mo va khong the ghi de an toan.
- Database/API/cau hinh: Khong thay doi. Khong migration, dependency runtime, secret hoac gia tri moi truong moi.
- Kiem thu: Tao lai bang `@oai/artifact-tool`; render va kiem tra rieng ca 15 slide o kich thuoc day du; khong con chu/anh Song Hong trong inspect cua ban moi; cac nhan `GonStack`, `ViChat AI` va slide dinh vi Zalo hien thi dung. `slides_test.py outputs/vichat-gonstack-gioi-thieu-san-pham-doanh-nghiep.pptx` dat voi ket qua `Test passed. No overflow detected.`
- Rui ro con lai: Ban cu `outputs/vichat-gioi-thieu-du-an-doanh-nghiep.pptx` van ton tai vi dang duoc mo trong PowerPoint; can dung ban co ten `vichat-gonstack-*` de thuyet trinh. Neu can thay the dung ten file cu, dong PowerPoint roi ghi de trong lan tiep theo.
- Viec tiep theo: Bo sung logo GonStack chinh thuc, thong tin lien he, goi pilot va bang gia neu doanh nghiep da co bo nhan dien/thuong mai duoc phe duyet.
- Commit/PR: Chua tao.

## 2026-08-01-06 - Tao bo slide gioi thieu ViChat cho doanh nghiep

- Thoi gian: 2026-08-01 12:40 (Asia/Saigon)
- Loai: Tai lieu | Thuyet trinh | Kiem thu truc quan
- Trang thai: Hoan tat
- Muc tieu: Tao bo thuyet trinh 15 slide bang tieng Viet de gioi thieu bai toan, gia tri, trai nghiem, kien truc, bao mat, muc san sang va de xuat pilot cua ViChat truoc doanh nghiep.
- Pham vi: Chi tao artifact PowerPoint va cap nhat changelog; khong sua code, API, database, cau hinh, ha tang hay hanh vi nguoi dung.
- File da thay doi: `outputs/vichat-gioi-thieu-du-an-doanh-nghiep.pptx` va `docs/CHANGELOG.md`.
- Noi dung: Bo slide trinh bay nhu cau giao tiep noi bo, gia tri cho nhan vien/IT/lanh dao, ChatUI, Tro ly Song Hong, ranh gioi UpGO Account - Chatmgt - Tinode/ChatAPI - Chatbot/RAG, SSO, quyen so huu du lieu, cach ly trang quan tri, realtime, bon cong nghiem thu, bang chung production, rui ro con lai va lo trinh pilot/UAT.
- Quyet dinh ky thuat: Dung ty le 16:9 va phong cach editorial doanh nghiep voi mau cam du an `#F4511E`; tai su dung logo va anh thuoc repository. Khong suy dien KPI kinh doanh; cac so lieu 69 backend test, 10/10 frontend test, HTTP 200 va verifier lay tu changelog. Man hinh ChatUI la mockup theo capability va duoc gan nhan ro, khong dung du lieu production.
- Database/API/cau hinh: Khong thay doi. Khong migration, dependency runtime, secret hoac gia tri moi truong moi.
- Kiem thu: Render ban cuoi bang `@oai/artifact-tool` thanh 15 anh PNG va da kiem tra rieng tung slide; khong thay chu bi cat, phan tu chong lap hoac noi dung tran khung. `slides_test.py outputs/vichat-gioi-thieu-du-an-doanh-nghiep.pptx` dat voi ket qua `Test passed. No overflow detected.` Browser skill da duoc thu dung nhung runtime khong co browser backend, nen QA duoc thuc hien tren ban render cua artifact-tool.
- Rui ro con lai: Slide minh hoa giao dien khong phai anh chup production; truoc buoi hop chinh thuc nen thay ten nguoi trinh bay, thoi luong pilot va tieu chi nghiem thu theo doanh nghiep cu the neu can.
- Viec tiep theo: Mo file PowerPoint de rehearse, thong nhat pham vi pilot, dau moi UAT, tieu chi nghiem thu va thoi diem rollout.
- Commit/PR: Chua commit.

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
