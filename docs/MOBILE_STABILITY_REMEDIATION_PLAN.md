# Ke hoach khac phuc mobile ViChat

- Ngay lap ke hoach: 2026-09-28 (Asia/Saigon)
- Trang thai: Da hoan tat phan code, contract, kiem tra static va APK test; chua UAT tren thiet bi that
- Pham vi chinh: mobile/
- Thanh phan phoi hop: Chatmgt, Tinode, Account tenant va quy trinh build/UAT
- Muc tieu: sua dung nguyen nhan mat ten cong ty, group khong hoat dong, app bi do va cac loi lien quan den dong bo/reconnect

Cap nhat implement: da ap dung session/tenant normalizer, ranh gioi Account ID va
Tinode UID, group lifecycle co idempotency, lazy history, generation guard,
single-flight reconnect va gioi han render/list. Dot chot moi them history search
normalization, tim chat 1-1 qua ca hai namespace va single-flight khi double tap,
dong bo version Settings/lockfile. Unit test `26 file, 97/97`, typecheck, lint,
contract test backend, Expo config/prebuild va Android release build da dat.
Artifact test la `D:\vichat-build\ViChat-1.0.26-mobile-full-audit-20260929-universal.apk`
voi SHA-256 `C84F58B96C54AA58D3D8DE85192873809F03FC08CF5EA6FEA885D51F2B3931A8`.
Cac muc UAT, performance tren thiet bi that va E2E Chatmgt/Tinode van de mo.

Tai lieu nay la runbook ky thuat cho cac phien sua tiep theo. Moi thay doi phai cap nhat trang thai task, ket qua kiem thu thuc te va rui ro con lai trong docs/CHANGELOG.md. Khong danh dau hoan tat neu chua UAT tren thiet bi that.

## 1. Hien trang va bang chung

### 1.1 Ket qua da biet

- Mobile la Expo SDK 57, app version hien tai la 1.0.26.
- cd mobile; npm test -- --reporter=dot: 26 file, 97/97 pass.
- cd mobile; npm run typecheck: pass.
- cd mobile; npm run lint: pass.
- Cac ket qua tren chi kiem tra unit/static; chua chung minh luong login, group, realtime va hieu nang tren Android/iOS that.
- APK 1.0.26 da build va verify package/ABI/signature; chua duoc UAT day du voi hai tai khoan that trong cung tenant.
- Worktree dang co nhieu thay doi san co cua nguoi dung. Khi trien khai phai bao ton cac thay doi nay, khong dung git reset --hard, git checkout --, hoac ghi de file khong thuoc pham vi.

### 1.2 Van de uu tien

| Ma | Uu tien | Bieu hien | Nguyen nhan can xac minh | File/khu vuc dau moi |
|---|---|---|---|---|
| MOB-001 | P0 | Dang nhap xong mat ten cong ty | Mobile chi doc payload.tenant.name, trong khi backend co the tra tenantName, tenant_name, user.tenantName, user.tenant_name; hydration /auth/me co the ghi de session | mobile/src/services/authService.ts, mobile/src/screens/chat/ConversationListScreen.tsx, mobile/src/screens/contacts/ContactsScreen.tsx |
| MOB-002 | P0 | Tao group, them/xoa thanh vien, doi quyen khong dung | Client dang phan biet Account ID va Tinode UID khong nhat quan; tao topic Tinode truc tiep roi moi bind lai Chatmgt; mapping thieu co the lam thao tac bi khoa | mobile/src/store/appStore.ts, mobile/src/utils/identity.ts, mobile/src/services/chatManagementService.ts, backend group endpoints |
| MOB-003 | P0 | Login/resume lam app bi do | Sau login app tai nhieu du lieu, sync nhieu topic dong thoi va preload history cho tung topic | mobile/src/store/appStore.ts, mobile/src/services/tinodeClient.ts, mobile/src/utils/conversationSync.ts |
| MOB-004 | P0 | Reconnect co the tao request/trang thai trung | Login, AppState va NetInfo co the cung goi sync; chua co single-flight theo session generation | mobile/src/store/appStore.ts, mobile/src/services/tinodeClient.ts, mobile/src/services/apiClient.ts |
| MOB-005 | P1 | Nhieu chuc nang khac khong on dinh | Chua co ma tran UAT day du cho loading, error/retry, offline, permission va tenant boundary | Toan bo mobile capability |
| MOB-006 | P1 | Lich su, media, group lon lam cham | Merge/materialize co the dung lai toan bo danh sach; pagination cho phep quet qua nhieu page; render chua tach theo thay doi nho | mobile/src/services/chatManagementService.ts, mobile/src/services/tinodeClient.ts, mobile/src/store/appStore.ts |

### 1.3 Gia dinh can tranh

Trong giai doan baseline, cac muc nguyen nhan can xac minh khong duoc coi la ket luan. Phai co log thoi gian, request trace, reproduction va test truoc khi chon giai phap. Khong sua bang cach an loi tren UI hoac tang timeout neu chua biet request nao dang tre.

## 2. Nguyen tac bat buoc

1. **Tenant tu backend la nguon chuan.** Client khong tu chon tenant cho cac request sau khi session da duoc cap. Moi query, group, directory, profile va Tinode token phai duoc backend kiem tra theo tenant trong session.
2. **Chatmgt la nguon chuan cho metadata.** Conversation, participant, role, mute, profile va group settings phai lay tu Chatmgt. Tinode la nguon chuan cho message, topic realtime, presence, typing va receipt.
3. **Account ID va Tinode UID khong duoc tron.** Account ID dung cho permission/membership Chatmgt. Tinode UID chi dung cho Tinode. Mobile khong tu suy doan UID tu chuoi ID neu backend chua tra mapping.
4. **Khong de du lieu tenant cu roi sang tenant moi.** Moi session/login generation phai co cache namespace rieng. Logout, token expiry va tenant switch phai clear hoac vo hieu hoa request/cache cu.
5. **Khong coi optimistic update la thanh cong.** UI chi hien trang thai ready sau khi backend va Tinode xac nhan. Neu optimistic update duoc dung, phai co rollback ro rang.
6. **Moi thao tac retry phai idempotent.** Bam lai, reconnect hoac request timeout khong duoc tao group, participant, topic hoac notification trung.
7. **Khoi dong truoc, du lieu nen sau.** Man hinh dau tien phai tuong tac duoc truoc khi tai history/media/workspace phu.
8. **Khong tang version APK truoc UAT.** Build test chi la artifact; chi phat hanh sau khi co bang chung tren thiet bi that.

## 3. Phan cong va thu tu phu thuoc

Thu tu bat buoc:

~~~text
Baseline va instrumentation
        |
        +--> Session/tenant contract
        |          |
        |          +--> Group ID contract va lifecycle
        |
        +--> Startup/realtime scheduler
                   |
                   +--> Capability audit va E2E
                              |
                              +--> UAT release
~~~

Khong lam audit UI dai dien truoc khi session, group identity va sync scheduler co contract ro rang; neu khong, cung mot loi se lap lai o nhieu man hinh.

## 4. Giai doan 0 - Baseline va tai hien loi

### 4.1 Muc tieu

Tao du lieu do de biet app cham o dau, loi xuat hien trong dieu kien nao va thay doi nao thuc su lam tot hon.

### 4.2 Ma tran thiet bi va tai khoan

| Nhom | Dieu kien toi thieu |
|---|---|
| Android | 1 may cau hinh thap, 1 may trung binh; release APK; fresh install va upgrade |
| iOS | 1 thiet bi that; fresh install va update neu co build |
| Tai khoan | Tai khoan A tao group; B duoc them vao; them mot tai khoan khong cung tenant de kiem tra tu choi |
| Mang | Wi-Fi binh thuong, 4G cham, mat mang luc login, mat mang luc gui message, reconnect |
| Vong doi | Cold start, warm start, background 1 phut, background lau, kill app roi mo lai |
| Du lieu | 0, 1, 10, 100+ conversation; topic it message va topic nhieu history/media |

### 4.3 Su kien can do

Them instrumentation khong ghi token, cookie, password, noi dung nhay cam hoac PII. Moi su kien nen co sessionGeneration, tenantId da hash/obfuscate neu can, conversationId da hash va request correlation id.

| Su kien | Thoi diem |
|---|---|
| app_boot_start | App process bat dau |
| auth_request_start/end | Bat dau/ket thuc login |
| session_ready | Session co tenant, account va token hop le |
| shell_interactive | Man hinh dau tien nhan duoc thao tac |
| metadata_ready | Conversation/directory metadata da hien |
| realtime_sync_start/end | Moi dot sync Tinode |
| topic_subscribe_start/end | Moi topic subscribe |
| history_page_start/end | Moi page history tai on demand |
| group_action_start/end | Tao group/member/role/leave |
| render_slow | Render vuot nguong da chot |
| api_error | API error sau khi da redact |

### 4.4 Cach tai hien bat buoc

- Ghi lai video hoac log cho tung reproduction.
- Ghi request count va duration theo tung buoc; khong chi ghi tong thoi gian.
- Xac dinh app bi do o JS thread, native thread, network wait, render, memory hay Tinode callback.
- Tai hien it nhat 3 lan cho moi loi de phan biet loi ngau nhien va loi deterministic.
- Khong sua code production trong luc do baseline neu thay doi lam mat kha nang so sanh; instrumentation phai duoc ghi ro trong changelog.

### 4.5 Dau ra

- Bang baseline truoc sua.
- Danh sach reproduction co ma MOB-xxx.
- Trace cua login, group create va cold start.
- Danh sach request bi lap, request tre, topic sync cham va render cham.
- Uu tien P0/P1/P2 da xac nhan.

## 5. Giai doan 1 - Chuan hoa session va tenant

### 5.1 Contract de xuat

Mobile can co mot model noi bo duy nhat, khong de UI doc truc tiep payload raw:

~~~ts
type MobileSession = {
  token: string;
  account: {
    id: string;
    name: string;
    email?: string;
  };
  tenant: {
    id: string;
    name: string;
  };
  tinodeUid: string;
  generation: number;
  hydratedAt: number;
};
~~~

Day la contract noi bo de thiet ke, khong copy nguyen mau neu type hien tai co ten khac. Moi field bat buoc phai co validation truoc khi set session_ready.

### 5.2 Quy tac normalize

Uu tien ten cong ty theo thu tu:

1. payload.tenant.name
2. payload.tenantName
3. payload.tenant_name
4. payload.user.tenant.name
5. payload.user.tenantName
6. payload.user.tenant_name

Uu tien tenant ID theo thu tu tuong tu, nhung khong dung company name lam ID. Neu co nhieu gia tri khac nhau:

- Tenant ID phai dung theo backend/session authoritative.
- Ten cong ty dung gia tri cung tenant ID.
- Neu mismatch khong the giai quyet, danh dau session invalid va yeu cau refresh/login; khong lay gia tri cache cu lam fallback im lang.

### 5.3 Thay doi can thuc hien

- Tao mot ham normalizeAuthPayload() hoac ten tuong duong trong mobile/src/services/authService.ts.
- Chuyen login response va /auth/me qua cung mot normalizer.
- Khong de ConversationListScreen va ContactsScreen doc truc tiep payload.tenant.
- Khi /auth/me thieu ten cong ty, chi giu ten tu login neu tenant ID van trung khop.
- Khi /auth/me tra tenant moi, tang sessionGeneration, clear cache tenant cu va chay lai bootstrap tu dau.
- Khi logout/token expiry, huy request dang chay, unsubscribe Tinode va clear conversation/directory/workspace cache.
- Dam bao Tinode token thuoc cung account/tenant voi session Chatmgt.
- Chan bootstrap neu session chua co tenantId, accountId hoac tinodeUid hop le.

### 5.4 Test bat buoc

| Ma | Input | Ket qua mong doi |
|---|---|---|
| S01 | Chi co tenant.name | Hien dung ten cong ty |
| S02 | Chi co tenantName | Hien dung ten cong ty |
| S03 | Chi co tenant_name | Hien dung ten cong ty |
| S04 | Ten nam trong user | Hien dung ten cong ty |
| S05 | Login co ten, /auth/me khong co ten nhung cung ID | Giu ten hop le, khong mat header |
| S06 | /auth/me tra tenant ID khac | Khong hien du lieu cu; invalid session/refresh theo contract |
| S07 | Logout roi login cong ty khac | Khong con ten, group, directory cua cong ty cu |
| S08 | Token het han trong bootstrap | Chi co mot luong xu ly auth; khong loop request |
| S09 | App kill sau login roi mo lai | Rehydrate dung tenant va ten cong ty |

### 5.5 Tieu chi dat P0

- 100% fixture auth variants pass.
- UAT login/logout/rehydrate pass tren Android va iOS.
- Khong con UI nao doc raw tenant field ngoai normalizer.
- Khong co tenant data leak qua cache hoac request sau logout/switch.

## 6. Giai doan 2 - Sua group va ranh gioi ID

### 6.1 Contract ID

| Truong | Nguon | Muc dich | Quy tac |
|---|---|---|---|
| accountId | Chatmgt/Account projection | Permission, membership, role | Bat buoc cho group API; phai thuoc tenant hien tai |
| tinodeUid | Backend prepare participant | Subscribe, invite, message | Chi dung voi Tinode; khong tu suy doan o client |
| conversationId | Chatmgt | Metadata, member/role actions | La ID authoritative cua group |
| topicName | Tinode sau bind | Realtime | Phai duoc backend xac nhan bind voi conversation |
| role | Chatmgt | Owner/admin/member | Khong suy ra tu Tinode permission string |

Mobile phai co ham mapping ro rang, vi du normalizeParticipant(), tra ve ca accountId va tinodeUid neu backend da cung cap. Neu chi co Tinode UID ma thieu Account ID, khong duoc goi action permission; hien loi co the thu retry/refresh directory.

### 6.2 Luong tao group muc tieu

~~~text
User chon thanh vien
  -> Validate accountId, tenant, active status, duplicate
  -> Create Chatmgt conversation voi accountIds
  -> Backend prepare participant va tra mapping accountId <-> tinodeUid
  -> Backend/client bind topic theo contract hien co
  -> Tinode topic ready va membership duoc xac nhan
  -> Refresh conversation tu Chatmgt
  -> Hien group trong UI
~~~

Khong coi viec tinodeClient.createGroup() thanh thanh cong cuoi cung neu Chatmgt chua co conversation va bind record. Neu endpoint backend hien tai chua gop duoc flow, uu tien them aggregate endpoint hoac transaction/idempotency o backend thay vi de mobile tu dieu phoi nhieu buoc ma khong co compensation.

### 6.3 Thay doi mobile

- mobile/src/store/appStore.ts: tach createGroupConversation() thanh cac buoc co trang thai va correlation id; khong tiep tuc buoc Tinode neu Chatmgt create that bai.
- mobile/src/services/chatManagementService.ts: cac method nhan accountIds/participantIds theo mot ten canonical; khong truyen lan Tinode UID vao endpoint membership.
- mobile/src/utils/identity.ts: bo sung mapping uu tien Account ID, chi dung Tinode UID cho realtime; khong suy doan khong an toan.
- mobile/src/screens/chat/NewGroupScreen.tsx: chon thanh vien phai luu object co accountId, display name va mapping state; khong chi luu mot chuoi khong ro loai ID.
- mobile/src/screens/chat/GroupInfoScreen.tsx: action member/role phai dung conversationId authoritative va refresh sau mutation.
- Them loading state cho tung action; khoa nut trong cung request nhung cho phep retry sau loi.
- Loi backend phai hien thi theo nhom: thieu quyen, thanh vien khong ton tai, khac tenant, mapping thieu, topic bind that bai, timeout/retry.

### 6.4 Thay doi backend/contract neu can

- Moi endpoint group phai derive tenant tu session va validate tat ca accountId trong cung tenant.
- Response participant nen tra ca accountId, tinodeUid, role, active, status voi ten field on dinh.
- Them idempotency key cho create/add member; key phai duoc gan voi current user, tenant va operation payload.
- Neu create Chatmgt thanh cong nhung bind Tinode that bai, luu trang thai loi co the retry; khong tao ban ghi moi moi lan retry.
- Neu co aggregate endpoint, phai tuong thich nguoc voi client cu trong thoi gian rollout.
- Khong xoa group/member tu dong neu chua co quy tac compensation an toan; danh dau orphan va co job/endpoint retry hoac cleanup duoc audit.

### 6.5 State machine group

~~~text
idle
  -> validating
  -> creating_management
  -> preparing_participants
  -> binding_topic
  -> ready

Bat ky buoc nao -> retryable_error neu timeout/network
Bat ky buoc nao -> terminal_error neu permission/tenant/invalid input
retryable_error -> retrying -> quay lai buoc that bai voi cung idempotency key
~~~

UI khong hien group ready trong creating_management, preparing_participants hoac binding_topic neu group chua co snapshot day du.

### 6.6 Test group bat buoc

| Ma | Kich ban | Ket qua mong doi |
|---|---|---|
| G01 | Tao group voi 2 tai khoan cung tenant | Mot conversation, topic va membership dung |
| G02 | Bam Tao nhieu lan | Khong tao group trung; cung idempotency key tra ve ket qua cu |
| G03 | Mat mang sau Chatmgt create | Retry tiep tuc flow, khong tao conversation thu hai |
| G04 | Prepare thieu mot participant | Hien loi ro, khong bind group sai; co retry/refresh |
| G05 | Thanh vien khac tenant | Backend tu choi; khong lo thong tin |
| G06 | Them thanh vien hop le | Chatmgt va Tinode cung cap nhat; app khac nhan sau refresh/reconnect |
| G07 | Xoa thanh vien | Member bien mat sau server success; UI rollback neu fail |
| G08 | Doi role admin/member | Role duoc cap nhat theo Chatmgt, khong suy tu UI |
| G09 | Chuyen owner | Chi owner/admin hop le duoc phep; role cu/moi nhat quan |
| G10 | Roi group | Current user bi xoa dung ca metadata va Tinode subscription |
| G11 | Mo group sau kill app | Group, member, role, topic dung sau bootstrap |
| G12 | Tinode reconnect sau group action | Khong tao member/topic trung |
| G13 | Avatar/settings/poll/pin trong group | Khong lam mat membership/role; loi phu khong lam group bi ghost |

## 7. Giai doan 3 - Chua app bi do va toi uu realtime

### 7.1 Pipeline khoi dong muc tieu

~~~text
App boot
  -> Restore token/session tu SecureStore
  -> Validate /auth/me va normalize session
  -> Render shell + cached conversation metadata
  -> Load management metadata can thiet
  -> Subscribe topic can thiet
  -> Load history cua conversation dang mo/on demand
  -> Background: directory phu, Workspace, chatbot, media index
~~~

Khong de background history cua tat ca topic chan shell_interactive.

### 7.2 Chinh sach history

De xuat ban dau, phai chot lai sau baseline:

- Bootstrap danh sach: metadata/latest preview, khong tai 100 message cho moi topic.
- Topic dang mo: tai page gan nhat voi limit cau hinh duoc, de xuat 20-30 message.
- Cuon len: tai page tiep theo, de xuat 30-50 message/page.
- Media/search history: loader nen rieng, khong day toan bo vao message list neu khong can.
- Cache history theo tenant + account + conversation/topic + sessionGeneration.
- Khi doi tenant/logout, huy va discard cache cu.

Khong hard-code nhieu limit o nhieu file. Dinh nghia constants/config trung tam va ghi ly do cua tung limit.

### 7.3 Single-flight va scheduler

syncRealtimeTopics() phai co:

- Key theo sessionGeneration va danh sach topic da normalize.
- Mot sync active cho moi generation; request moi chi merge reason va khong tao worker trung.
- Huy worker cua generation cu khi logout/tenant switch.
- AppState resume va NetInfo reconnect goi requestSync(reason) thay vi goi truc tiep full sync.
- Retry exponential co gioi han; khong retry vo han khi 401/permission.
- Gioi han concurrency theo mobile, de xuat bat dau 2 va do lai; khong dung concurrency cao de che giau bottleneck.
- Moi worker phai co timeout va ghi topic name da redact/correlation id.

### 7.4 Thay doi can thuc hien

- mobile/src/store/appStore.ts: tach bootstrap metadata, topic subscription va active history; them generation guard truoc moi state update.
- mobile/src/services/tinodeClient.ts: cho phep subscribe khong history, history on demand va cancel/ignore stale generation.
- mobile/src/utils/conversationSync.ts: merge incrementally, khong tao snapshot moi neu du lieu khong doi.
- mobile/src/services/chatManagementService.ts: listAllPages() phai dung hasMore/cursor neu server co; co maxPages, timeout, abort va telemetry.
- mobile/src/components/ConversationRow.tsx va man hinh danh sach: memo hoa row, chi re-render conversation bi doi.
- Tat ca AppState/NetInfo listener phai unsubscribe khi store/service dispose.

### 7.5 Quy tac merge state

- Khong merge snapshot cua tenant/session generation cu vao state hien tai.
- Message moi chi cap nhat topic/conversation tuong ung.
- Member/role metadata tu Chatmgt khong bi Tinode snapshot null/default ghi de.
- Unread/latest preview co quy tac nguon ro rang va test cho ca live event/history event.
- Merge phai idempotent theo message key/sequence; khong duplicate khi event den lai.
- Neu snapshot khong day du, khong xoa danh sach cu mot cach im lang; danh dau stale/loading va refresh.

### 7.6 Pagination an toan

- Uu tien cursor/hasMore tu server.
- maxPages chi la safety guard, khong duoc la co che binh thuong de tai hang nghin page.
- Dung abort khi logout, doi tenant, doi man hinh hoac request moi thay the request cu.
- Khong giu ca page raw trong memory neu chi can latest preview.
- Neu server khong tra hasMore, bo sung contract test truoc khi thay doi client.

### 7.7 Ngan render va memory spike

- Do kich thuoc message/member list truoc va sau merge.
- Memo hoa component row/bubble neu props khong doi.
- Kiem tra FlatList key, extraData, initialNumToRender, windowSize, removeClippedSubviews theo behavior thuc te.
- Tranh tao array/object moi cho toan bo conversation list moi khi mot message den.
- Khong preload media/image bytes trong luong message list; dung thumbnail/lazy load.
- Neu co memory warning, log count/size da redact thay vi log noi dung.

### 7.8 Ngan sach hieu nang de nghiem thu

Day la muc tieu de do, khong phai ket qua da dat:

| Chi so | Muc tieu de xuat |
|---|---|
| Shell co the tuong tac | <= 3 giay warm start, <= 5 giay cold start tren mang binh thuong |
| Conversation list tu cache | Hien truoc background history; khong bi block boi topic phu |
| Mo conversation da cache | Hien metadata trong <= 500 ms, history tiep tuc tai nen |
| Sync cung generation | Toi da 1 dot active tai mot thoi diem |
| Render freeze | Khong co long task JS > 200 ms trong luong chat thong thuong |
| Reconnect | Khong duplicate message/member/topic sau 3 lan reconnect |
| Offline | Hien duoc cache va thong bao trang thai; request co retry khi online |

Neu baseline cho thay muc tieu khong phu hop thiet bi, ghi lai so lieu va ly do dieu chinh trong changelog.

## 8. Giai doan 4 - Audit toan bo capability mobile

Moi hang phai co owner, reproduction, test va acceptance; khong chi tick UI hien ra.

| Nhom | Luong can audit | P0/P1 | Tieu chi chinh |
|---|---|---|---|
| Auth/tenant | Login, logout, rehydrate, token expiry, tenant switch | P0 | Dung tenant, khong leak cache, khong loop auth |
| Directory | Load, search, profile, empty/error/retry | P1 | Chi thay employee active cung tenant |
| Chat 1-1 | Tao, mo, gui, nhan, unread, latest preview | P0 | Message idempotent, realtime va history khop |
| Group | Create, add/remove, role, leave, owner, settings | P0 | Chatmgt/Tinode nhat quan, retry an toan |
| Realtime | Subscribe, reconnect, typing, presence, receipt | P0 | Khong duplicate, khong mat event sau resume |
| History/search | Page, pull earlier, search, large history | P1 | Khong block shell, cancel duoc request cu |
| Media | Anh, file, voice, avatar, download/error | P1 | Auth dung tenant, lazy load, retry ro |
| Message actions | Reaction, edit, recall, pin, poll, mention, forward | P1 | Permission dung, offline/error co rollback |
| Notification | Foreground/background/killed, badge, deep link | P1 | Den dung tai khoan/room, khong duplicate |
| Call | 1-1 invite, accept/reject, background, reconnect | P1 | State lifecycle ro, permission va timeout dung |
| Workspace/Cloud | Load, create/update/delete, tenant/user scope | P1 | Khong nham du lieu chat va Cloud |
| Profile/settings | Avatar, display name, mute, app lock | P2 | Persist sau restart, logout clear dung |
| Offline/recovery | Read cache, retry queue, server down | P0 | Khong crash, co thong bao va recovery |

### 8.1 Trang thai phai test cho moi capability

- Loading lan dau.
- Success lan dau.
- Empty data.
- API 4xx permission/tenant.
- API 5xx.
- Timeout/mat mang.
- Retry sau khi online.
- App background/foreground.
- Logout/doi tenant trong khi request dang chay.
- Du lieu cu/cache stale.
- Double tap/repeated action.

## 9. Ke hoach test chi tiet

### 9.1 Unit test

Bo sung test cho:

- Auth payload normalization va precedence.
- Session generation/tenant cache invalidation.
- Account ID <-> Tinode UID mapping.
- Group idempotency key va state machine.
- Retry classification: retryable vs terminal.
- Incremental conversation merge.
- Duplicate event/message suppression.
- History pagination/cancel.
- AppState/NetInfo scheduler single-flight.

### 9.2 Contract/integration test

Backend va mobile phai cung test:

- Login response va /auth/me co cac alias field.
- Current tenant authoritative va tenant mismatch bi tu choi.
- Create group/prepare participant/bind topic.
- Add/remove member, role, leave, owner transfer.
- Idempotent retry sau timeout.
- Account ID sai, Tinode UID sai, participant inactive, participant khac tenant.
- Tinode unavailable trong luc Chatmgt van available.
- Chatmgt unavailable trong luc Tinode reconnect.

### 9.3 E2E tren thiet bi that

Bat buoc co hai tai khoan A/B va it nhat mot tai khoan khac tenant:

1. A login, xac nhan ten cong ty.
2. A mo danh sach, mo chat 1-1, gui/nhan message.
3. A tao group voi B.
4. B login va thay group.
5. A them member, doi role, pin/poll neu duoc ho tro.
6. Tat mang, thao tac, bat mang lai, kiem tra retry va khong duplicate.
7. Kill app, mo lai, kiem tra history/realtime.
8. Logout A, login tai khoan cong ty khac, kiem tra khong con du lieu cu.
9. Test notification foreground/background/killed.
10. Lap lai tren Android va iOS trong pham vi build co san.

### 9.4 Performance test

- Cold start voi 0/10/100 conversation.
- Warm resume sau 1 phut va sau thoi gian dai.
- Topic co 100/1000+ message va media.
- 3 lan reconnect lien tiep.
- Mo nhanh 10 conversation lien tuc.
- Gui 20 message trong dieu kien mang dao dong.
- Do JS long task, FPS/scroll, memory, request count, duplicate event.

### 9.5 Lenh kiem tra local

Chay tu thu muc mobile/ sau moi nhom thay doi:

~~~text
npm test -- --reporter=dot
npm run typecheck
npm run lint
npx expo config --json --type public
npx expo prebuild --platform android --no-install
~~~

Neu chay build Android release, ghi dung command, artifact path, package/version, signer va ket qua adb/install smoke test. Khong ghi dat neu chua chay tren moi truong tuong ung.

## 10. Thu tu commit va cach chia nho thay doi

De de review va rollback, uu tien chia thanh cac nhom doc lap:

1. docs: plan, contract va test matrix.
2. mobile-auth: normalizer, session generation, tenant cache va auth tests.
3. group-contract: mapping DTO, idempotency, group lifecycle va group tests.
4. mobile-sync: startup pipeline, scheduler, history lazy load va merge tests.
5. mobile-ui-performance: render/memoization/list tuning sau khi co profile.
6. uat-release: E2E evidence, build artifact, changelog va release checklist.

Moi nhom phai chay test lien quan truoc khi gop. Khong gom mot commit vua doi API, vua doi Tinode transport, vua doi toan bo UI neu khong can.

## 11. Phat hanh, deploy va rollback

### 11.1 Thu tu rollout

~~~text
1. Chot contract backend va backward compatibility
2. Deploy backend/Chatmgt/Tinode bridge neu co thay doi
3. Health check API, auth, group va Tinode relay
4. Build mobile test voi version/build rieng
5. UAT hai thiet bi/tai khoan
6. Chot APK/IPA release
7. Theo doi error, auth, group va sync sau phat hanh
~~~

### 11.2 Migration va compatibility

- Session normalizer va lazy sync thuong khong can database migration.
- Idempotency backend co the can migration/index; phai them migration backward-compatible, test upgrade va rollback.
- Khong deploy mobile bat buoc endpoint moi truoc khi backend da san sang.
- Neu response field doi ten, giu alias trong mot khoang rollout va cap nhat contract test.
- Neu Tinode bridge doi mapping, phai verify topic cu va topic moi khong bi nham UID.

### 11.3 Dieu kien rollback

Rollback hoac dung phat hanh neu co mot trong cac dieu kien:

- Tenant A nhin thay ten/data cua tenant B.
- Tao group tao duplicate, orphan hoac mat thanh vien.
- Message duplicate/mat sau reconnect.
- Cold start/regression lam app khong vao duoc man hinh chinh.
- Crash rate tang ro rang tren build moi.
- Auth loop, token bi dung sai hoac notification gui nham user.

Rollback phai ghi artifact/version, ly do, pham vi anh huong va buoc verify sau rollback. Khong rollback bang cach xoa thay doi cua nguoi dung trong worktree.

## 12. Definition of Done

### P0

- [ ] Ten cong ty dung sau login, /auth/me, restart, logout/login lai.
- [ ] Khong co tenant data leak qua state/cache/request.
- [ ] Tao group va group actions pass voi hai tai khoan that.
- [ ] Account ID/Tinode UID mapping co test va khong con check cung sai nguyen nhan.
- [ ] Bootstrap khong preload history cua tat ca topic.
- [ ] Login/resume/reconnect khong chay sync trung.
- [ ] Error/retry/timeout co thong bao va state ro rang.

### P1

- [ ] Capability audit co ket qua cho loading/success/empty/error/offline.
- [ ] Realtime/history/media khong lam block shell.
- [ ] Notification, call, Workspace/Cloud va settings da co UAT phu hop.
- [ ] Co performance baseline truoc/sau va khong chi dua vao cam nhan.

### Release

- [ ] Unit, typecheck, lint pass.
- [ ] Contract/integration test pass.
- [ ] E2E tren Android/iOS trong pham vi build.
- [ ] Build artifact duoc verify package/version/signer.
- [ ] docs/CHANGELOG.md ghi command va ket qua thuc te.
- [ ] docs/chat-backend-architecture.md da cap nhat neu doi data flow/API/source of truth.
- [ ] Co release/rollback note va viec tiep theo.

## 13. Checklist ban giao moi phien

Truoc khi ket thuc mot phien sua:

- [ ] Doc lai git status va tach thay doi co san khoi thay doi moi.
- [ ] Khong reset/checkout/ghi de file ngoai pham vi.
- [ ] Cap nhat task status trong tai lieu nay.
- [ ] Chay dung test lien quan; ghi ket qua that.
- [x] Review git diff --check.
- [x] Cap nhat docs/CHANGELOG.md neu co code/config/API/behavior thay doi.
- [x] Cap nhat architecture doc neu co thay doi data flow/contract.
- [x] Ghi rui ro con lai va reproduction cho loi chua giai quyet.
- [x] Khong tuyen bo UAT/deploy neu chua co bang chung.

## 14. Trang thai task

| Task | Trang thai ban dau | Ket qua can cap nhat |
|---|---|---|
| Baseline MOB-001..006 | Static root-cause da ghi nhan; device baseline chua bat dau | So lieu request/render tren thiet bi that |
| Session/tenant normalizer | Da code, fixture unit va stale-session guard; UAT chua bat dau | UAT login/logout/rehydrate |
| Group identity contract | Da code, migration idempotency va contract test `2/2`; UAT chua bat dau | Integration/E2E hai tai khoan that |
| Single-flight realtime sync | Da code generation guard, abort va concurrency cap; UAT/reconnect trace chua bat dau | Request trace, reconnect test |
| Lazy history/pagination | Da code lazy history, cursor/hasMore guard va unit test; performance profile chua bat dau | Performance profile voi history lon |
| Capability audit | Code path co loading/error/retry guard; ma tran day du chua chay | Bang ket qua loading/success/empty/error/offline |
| Release UAT | APK test da build va verify package/ABI/signature; chua cai/UAT thiet bi | Thiet bi, tai khoan, ket qua E2E |

## 15. Quyet dinh tam thoi va cau hoi can xac nhan khi implement

- Mac dinh Chatmgt la authority cho group metadata va membership; neu backend hien tai khac, phai cap nhat architecture doc truoc khi sua client.
- Mac dinh mobile khong tu tao Tinode group authoritative; client chi thuc hien phan Tinode ma contract backend yeu cau va phai bind voi conversation.
- Mac dinh bootstrap chi can metadata/latest preview; history day du la on demand.
- Mac dinh retry dung cung idempotency key; khong tao request moi voi payload khac neu chua xac dinh request cu that bai terminal.
- Can xac nhan backend co ho tro cursor/hasMore day du cho moi API pagination hay khong.
- Can xac nhan endpoint group hien tai co the tra mapping accountId va tinodeUid trong cung response hay can aggregate endpoint.
- Can xac nhan framework E2E hien co; neu chua co, chon mot cong cu co the chay tren thiet bi that va ghi cach cai dat trong changelog/README phu hop.

## 16. Ket qua chot code va artifact

- APK test: `D:\vichat-build\ViChat-1.0.26-mobile-full-audit-20260929-universal.apk`.
- Package/version: `vn.upgo.vichat`, `1.0.26`, Android `versionCode=27`; ABI `arm64-v8a,x86_64`.
- SHA-256: `C84F58B96C54AA58D3D8DE85192873809F03FC08CF5EA6FEA885D51F2B3931A8`.
- Static gate: mobile `26 file / 97 test`, typecheck, lint, web export, backend mobile contract `2/2`, chat auth contract `61/61`, Python compile, Expo config/prebuild va Gradle release build `520 tasks` deu dat.
- Khong chay emulator/`adb` theo yeu cau; vi vay plan chi co the dong phan code/static/artifact, khong danh dau UAT hoac release production hoan tat.
- Trien khai tiep theo: apply migration `20260928_17_mobile_group_idempotency` tren staging, chay UAT Android/iOS theo section 9, ghi request/render/performance evidence, sau do moi chot release.
