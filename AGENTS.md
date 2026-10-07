# Quy tac lam viec trong repository ViChat

Tai lieu nay ap dung cho moi cong cu/AI agent thuc hien thay doi trong repository.

## Bat dau cong viec

1. Doc `README.md`, `docs/chat-backend-architecture.md` va cac muc moi nhat trong `docs/CHANGELOG.md`.
2. Kiem tra trang thai Git de nhan dien thay doi da co cua nguoi dung; khong ghi de hoac hoan tac cac thay doi khong thuoc pham vi yeu cau.
3. Xac dinh ro pham vi, thanh phan bi anh huong va cach kiem thu truoc khi sua.

## Bat buoc su dung o D:

- Moi code checkout/staging, `node_modules`, dependency cache, temp/cache build,
  Gradle user home, JDK, Android SDK, APK va artifact phai nam tren o `D:`;
  khong cai dat, build hoac ghi cache cua ViChat vao o `C:`.
- Truoc khi chay npm/Expo/Gradle, dat cac bien moi truong ve staging D:
  `GRADLE_USER_HOME=D:\vichat-build\gradle-user-home`,
  `TEMP=D:\vichat-build\tmp`, `TMP=D:\vichat-build\tmp`,
  `ANDROID_HOME=D:\vichat-build\android-sdk`,
  `ANDROID_SDK_ROOT=D:\vichat-build\android-sdk`,
  `JAVA_HOME=D:\vichat-build\jdk`,
  `npm_config_cache=D:\vichat-build\npm-cache` va
  `npm_config_prefix=D:\vichat-build\npm-global`.
- APK chi duoc build vao `D:\vichat-build` va cai len thiet bi tu file APK tren
  D:; khong dung output, cache hoac lenh build mac dinh tro ve C:.
- Neu phat hien cache/build tam cua ViChat tren C:, phai kiem tra tien trinh va
  duong dan truoc khi xoa; chi xoa file tai tao duoc, khong xoa du lieu ca nhan
  hay thu muc he thong.

## Khi sua code hoac cap nhat tinh nang

- Tuan theo quy trinh tai `docs/DEVELOPMENT_WORKFLOW.md`.
- Moi thay doi code, cau hinh, database, API, bao mat, trien khai hoac hanh vi nguoi dung deu phai co mot muc trong `docs/CHANGELOG.md` trong cung lan lam viec.
- Ghi lai ly do va quyet dinh ky thuat, khong chi liet ke file da sua.
- Ghi dung lenh kiem thu va ket qua thuc te. Khong ghi "da dat" neu chua chay kiem thu.
- Neu khong the kiem thu, ghi ro ly do, rui ro con lai va cach nguoi tiep theo co the xac minh.
- Neu thay doi kien truc, luong du lieu, ranh gioi dich vu hoac nguon du lieu chuan, cap nhat `docs/chat-backend-architecture.md` cung luc.
- Khong ghi mat khau, token, cookie, khoa API, du lieu ca nhan hoac gia tri bi mat vao nhat ky.

## Ket thuc cong viec

1. Ra soat diff de bao dam chi co thay doi dung pham vi.
2. Chay cac kiem tra phu hop voi muc do rui ro.
3. Cap nhat `docs/CHANGELOG.md` theo mau, dat muc moi nhat len tren.
4. Ghi ro viec con lai, migration, cau hinh hoac buoc trien khai ma lan sau can biet.

Thay doi chi duoc xem la hoan tat khi code/tai lieu, ket qua kiem tra va nhat ky thay doi phu hop voi nhau.
