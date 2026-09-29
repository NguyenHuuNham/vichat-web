# Prompt sua loi runtime mobile ViChat

Su dung prompt nay cho Codex hoac coding agent khi sua truc tiep repository:

`<repo-root>`

## Prompt

```text
Ban la senior engineer phu trach ViChat Mobile. Lam viec truc tiep trong repository:

<repo-root>

Muc tieu: sua triet de 3 loi runtime dang con ton tai trong APK mobile:

1. Group Settings khong hoat dong.
2. Sau login ten cong ty chi con hien thi "Gon".
3. Nguoi gui van nhan notification khi chinh minh gui tin nhan.

Khong duoc chi sua UI de che loi. Phai truy nguyen nhan, sua dung data flow,
viet regression test va build APK moi.

==================================================
I. QUY TAC LAM VIEC
==================================================

1. Doc truoc cac file:

- README.md
- docs/chat-backend-architecture.md
- docs/DEVELOPMENT_WORKFLOW.md
- docs/MOBILE_STABILITY_REMEDIATION_PLAN.md
- docs/CHANGELOG.md

2. Kiem tra git status, git diff --stat va cac thay doi chua commit.

Worktree co nhieu thay doi cu. Chi sua file can thiet cho 3 loi tren. Khong dung:

- git reset --hard
- git checkout --
- xoa hoac hoan tac thay doi cua nguoi dung
- ghi de file ngoai pham vi

3. Khong tuyen bo da sua neu chi unit test pass ma chua co bang chung source,
contract va data flow.

4. Khong chay emulator va khong chay adb. Chi chay static test, contract test,
prebuild va release APK build.

5. APK truoc da dung version 1.0.25 va Android versionCode 26. Ban moi bat buoc
phai tang version. Neu source hien tai van la 1.0.25/26 thi dung:

- version: 1.0.26
- Android versionCode: 27

Cap nhat dong bo:

- mobile/app.json
- mobile/package.json
- mobile/package-lock.json

==================================================
II. GIAI DOAN 0 - XAC DINH NGUYEN NHAN
==================================================

Truoc khi sua, dung rg de tim:

- Gon
- tenant
- company
- groupSettings
- updateGroupSettings
- notification
- scheduleNotificationAsync
- from
- x-sender-id
- tinodeUid
- currentUserId
- GroupInfoScreen

Kiem tra chinh xac:

1. "Gon" den tu backend response, fallback code, app config hay UI truncation.
2. Group Settings goi endpoint nao va dang gui loai ID nao.
3. Notification duoc tao tu realtime Tinode, own echo, FCM push hay silent push.
4. Account ID va Tinode UID dang duoc dung o tung buoc.
5. APK build co lay dung source mobile hien tai khong.

Moi ket luan phai co file va dong code lam bang chung.

==================================================
III. SUA LOI GROUP SETTINGS
==================================================

Phai ra soat:

- mobile/src/screens/chat/GroupInfoScreen.tsx
- mobile/src/store/appStore.ts
- mobile/src/services/chatManagementService.ts
- mobile/src/utils/groupSettings.ts
- mobile/src/utils/identity.ts
- mobile/src/types/index.ts
- backend group-settings controller/service/model
- docs/chat-backend-architecture.md neu contract thay doi

Nguyen tac bat buoc:

1. Chatmgt la nguon chuan cho group name, description, settings, membership,
role va owner/admin permission.

2. Tinode chi la nguon cho message, realtime topic, presence, typing va receipt.

3. API Group Settings phai nhan conversation ID authoritative cua Chatmgt.
Khong dung Tinode topic hoac Account ID lam conversation ID.

4. Account ID chi dung cho permission/membership API. Tinode UID chi dung cho
Tinode. Khong suy doan Tinode UID tu Account ID.

5. Khi mo Group Info:

- lay conversation tu store
- lay settings tu Chatmgt snapshot
- chuan hoa settings qua mot helper duy nhat
- xac dinh quyen bang Chatmgt role
- khong suy quyen tu Tinode permission string

6. Khi bat/tat setting:

- khoa dung nut dang thao tac
- gui request dung endpoint
- khong hien thanh cong truoc khi server xac nhan
- neu fail thi giu state cu va hien loi
- cho phep retry
- khong tao request trung khi bam nhanh nhieu lan
- dung correlation/operation id neu can

7. Sau khi API thanh cong:

- cap nhat conversation bang response authoritative
- neu response thieu settings thi fetch lai conversation tu Chatmgt
- khong de snapshot Tinode thieu field ghi de settings
- khi reconnect/reload phai doc lai settings tu Chatmgt

8. Kiem tra backend:

- tenant phai derive tu session
- conversation phai thuoc tenant hien tai
- owner/admin moi duoc sua
- member thuong phai nhan loi permission ro rang
- response phai tra field on dinh: conversationId, groupSettings, role, isGroup

9. Neu backend dung alias field khac, tao mot normalizer duy nhat. Khong lap alias
trong nhieu component.

10. Khong dung optimistic update neu khong co rollback ro rang.

Test bat buoc:

- Owner bat tung setting.
- Owner tat tung setting.
- Admin duoc phep neu policy cho phep.
- Member thuong bi tu choi.
- Reload van giu state.
- Logout/login lai van giu state.
- Reconnect Tinode khong lam mat state.
- Sai conversation ID bi tu choi.
- Tenant khac khong doc/sua duoc group.
- Double tap khong tao request trung.
- Timeout retry khong tao state sai.

==================================================
IV. SUA LOI TEN CONG TY CHI HIEN "GON"
==================================================

Phai ra soat:

- mobile/src/services/authService.ts
- mobile/src/store/appStore.ts
- mobile/src/screens/chat/ConversationListScreen.tsx
- mobile/src/screens/contacts/ContactsScreen.tsx
- mobile/src/navigation/*
- mobile/src/types/index.ts
- backend auth/me response neu can

Yeu cau:

1. Tim chinh xac component dang hien "Gon".

2. Khong hardcode ten moi va khong xoa chuoi "Gon" mu quang.

3. Tao hoac hoan thien mot auth normalizer duy nhat. Tenant name uu tien theo
response authoritative thuc te:

- payload.tenant.name
- payload.tenantName
- payload.tenant_name
- payload.user.tenant.name
- payload.user.tenantName
- payload.user.tenant_name
- alias company/brand chi dung neu backend thuc su tra ve

Tenant ID phai normalize cung logic va khong duoc dung company name lam ID.

4. Khi login:

- luu tenant.id
- luu tenant.name
- validate session truoc khi vao ready
- khong dung app product name thay cho tenant name

5. Khi goi /api/v1/auth/me:

- neu tenant ID giong session cu va response thieu name thi giu ten tu login
- neu tenant ID khac thi khong giu ten tenant cu
- clear cache conversation/directory/workspace cua tenant cu
- tang session generation
- bootstrap lai tu dau
- khong de response rong ghi de ten hop le

6. UI chi duoc doc session.tenant.name. Khong doc truc tiep raw payload, fallback
cu, hostname hoac chuoi hardcode.

7. Kiem tra ca UI truncation:

- numberOfLines
- ellipsizeMode
- width header/drawer
- string split theo dau cach
- fallback appName/brand/tenant nham field

Neu "Gon" la app label thi phai tach ro:

- app product name: ViChat
- tenant/company name: session.tenant.name

Test bat buoc:

- chi co tenant.name
- chi co tenantName
- chi co tenant_name
- chi co user.tenant.name
- login co ten, auth/me thieu ten nhung cung tenant ID
- auth/me tra tenant ID khac
- logout/login tenant khac
- app restart sau login
- tenant switch
- khong con "Gon" khi backend tra ten day du
- khong con du lieu tenant cu

==================================================
V. SUA LOI NGUOI GUI NHAN NOTIFICATION
==================================================

Phai ra soat:

- mobile/src/services/tinodeClient.ts
- mobile/src/services/notificationService.ts
- mobile/src/utils/messageOrigin.ts
- mobile/src/utils/tinodeState.ts neu lien quan
- mobile/src/store/appStore.ts
- Tinode bridge/server push payload neu source co lien quan
- infrastructure/tinode/* neu can sua silent push

Tao mot helper ro rang, vi du isOwnMessageOrigin(packet, currentIdentity).

Current identity phai gom:

- Account ID
- Tinode UID
- session.user.id
- session.user.uid
- session.user.tinodeUid
- tinodeClient.currentUserId

Sender packet phai kiem tra:

- packet.from
- packet.head['x-sender-id']
- packet.head['x-vichat-sender-id']
- packet.content.sender
- packet.content.sender_id
- packet.content.account_id
- data.from
- data.sender
- data.sender_id
- data.account_id

Quy tac:

1. Neu sender identity giao voi current identity thi la own message.
2. Own message khong duoc tao local notification.
3. Cac thiet bi khac cua cung tai khoan cung khong duoc hien banner.
4. Recipient van phai nhan notification.
5. Khong tat toan bo notification.
6. Khong lam anh huong call invite.
7. Van phai hoat dong foreground, background va killed.
8. Khong chi tin vao packet.from.
9. Neu thieu sender identity thi phai xu ly an toan, khong tu dong coi la incoming.
10. Dedupe theo message ID, Tinode seq, topic + seq hoac FCM message ID.

Kiem tra server push:

- sender token co bi gui notification payload khong
- silent push cua sender phai la data-only
- data.silent=true khong duoc tao banner
- recipient push moi duoc co notification payload
- khong ap dung silent rule cho call invite

Test voi tai khoan A va B:

1. A gui text, ca hai foreground.
2. A gui text, ca hai background.
3. A gui text, ca hai killed.
4. A gui file.
5. A gui sticker.
6. A gui poll neu mobile ho tro.
7. A co hai thiet bi.
8. B co hai thiet bi.
9. A gui lien tiep nhieu tin.
10. Reconnect sau own echo.
11. Call invite van hien dung.
12. B chi nhan mot notification cho mot message.

Ket qua mong doi:

- A khong co banner.
- Thiet bi khac cua A khong co banner.
- B co dung mot notification.
- Khong mat notification khi B bi kill app.

==================================================
VI. TEST VA BUILD
==================================================

Chay tu mobile:

npm test -- --reporter=dot
npm run typecheck
npm run lint
npx expo config --json --type public
npx expo prebuild --platform android --no-install

Backend:

python -m unittest chatservice-main/tests/test_mobile_stability_contract.py -q
python -m unittest chatservice-main/tests/test_chat_auth_contract.py -q
python -m py_compile <cac file backend da sua>

Neu chat auth contract co failure cu ngoai pham vi mobile, ghi ro test failure
va khong duoc bao toan bo pass.

Vi workspace co ky tu Unicode, build tu staging ASCII, vi du:

D:\vichat-build\vichat-mobile-fix-20260928

Chay Gradle tu thu muc android:

.\gradlew.bat :app:assembleRelease --no-daemon --max-workers=1 "-PreactNativeArchitectures=arm64-v8a,x86_64"

Khong chay emulator hoac adb.

Verify APK bang:

aapt dump badging app-release.apk
zipalign -c -P 16 -v 4 app-release.apk
apksigner verify --verbose --print-certs app-release.apk

APK phai xac nhan:

- package: vn.upgo.vichat
- version moi cao hon ban hien tai
- versionCode moi cao hon 26
- ABI arm64-v8a va x86_64
- bundle APK co code fix moi
- SHA-256 chinh xac

==================================================
VII. TAI LIEU VA BAN GIAO
==================================================

Cap nhat:

- docs/CHANGELOG.md
- docs/chat-backend-architecture.md neu sua backend/data flow
- docs/MOBILE_STABILITY_REMEDIATION_PLAN.md

Changelog phai ghi:

- root cause cua tung loi
- file da sua
- endpoint/field da doi
- migration neu co
- command test va ket qua that
- artifact path
- package/version/versionCode
- SHA-256
- phan chua the kiem tra do khong chay emulator
- UAT con can tren thiet bi that

Cuoi cung tra ve:

1. Root cause Group Settings.
2. Root cause ten "Gon".
3. Root cause notification gui nham nguoi gui.
4. File da sua.
5. Test pass/fail.
6. APK path, versionCode va SHA-256.
7. Khong noi da het loi neu chua UAT hai tai khoan that.
```

## Yeu cau UAT sau khi build

- Cai APK co versionCode moi len thiet bi that.
- Xac nhan About/App info hien dung version moi.
- Dung hai tai khoan A/B trong cung tenant.
- Kiem tra group settings sau reload va reconnect.
- Kiem tra ten cong ty sau login, restart va tenant switch.
- Xac nhan A khong nhan notification khi A gui tin, B van nhan dung notification.
