# KẾ HOẠCH & PROMPT CHI TIẾT: KHẮC PHỤC TRIỆT ĐỂ LỖI LOAD ẢNH/FILE PHƯƠNG TIỆN CHẬM VÀ THIẾU FILE (VICHAT MOBILE)

> **Mục tiêu của tài liệu:**
> 1. Phân tích chính xác nguyên nhân gốc rễ (Root Cause) vì sao khi vào chat hoặc vào mục "Ảnh, file, link" trong Thông tin nhóm vẫn phải chờ tải lâu, bị chớp spinner, và danh sách file hiển thị không đầy đủ.
> 2. Đưa ra giải pháp kỹ thuật sửa đổi chi tiết, tối ưu hiệu năng đạt chuẩn tức thì (0ms cho nội dung đã xem) và quét trọn vẹn 100% lịch sử file.
> 3. Đảm bảo nguyên tắc **Zero Regression** (không gây lỗi luồng cho Chat 1-1, Chat nhóm, Cuộc gọi, Ghi âm Voice, Tin nhắn thường, v.v.).
> 4. Cung cấp hướng dẫn triển khai, kiểm thử và build APK staging trên ổ `D:` chuẩn theo `AGENTS.md`.

---

## I. HIỆN TRẠNG & VẤN ĐỀ NGƯỜI DÙNG PHẢN ÁNH

Theo phản ánh và ảnh chụp màn hình thực tế từ thiết bị di động:

```
[Màn hình Thông tin nhóm - Nhóm GON-NERS - Members (22 thành viên)]
├── Mục "Nội dung" ➔ "Ảnh, file, link":
│   ├── Đang chỉ hiển thị: "1 ảnh · 3 file · 0 link"
│   └── Strip preview: 1 thumbnail ảnh + 1 chip file "voice-1...5.m4a"
└── Vấn đề thực tế gặp phải:
    1. Khi vào xem chat hoặc mở Thông tin nhóm: Phải chờ tải (loading spinner) rất lâu, gây giật lag và khó chịu cho người dùng.
    2. Danh sách file/ảnh bị thiếu trầm trọng: Các hình ảnh, tài liệu PDF, Excel, file ghi âm voice được gửi từ các ngày trước hoặc các tin nhắn cũ hơn hoàn toàn không hiển thị.
    3. Trong phòng chat chính (ChatDetailScreen): Các bong bóng ảnh (ProtectedMessageImage) mỗi lần mở lại phòng chat đều bị reset về trạng thái trắng/spinner "Đang tải ảnh...", sau một lúc mới hiện ra.
```

---

## II. PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS)

### 1. Nguyên nhân 1: Giới hạn cứng `MAX_AUTO_PAGES = 5` (chỉ 200 tin nhắn) trong `tinodeClient.ts`
- **Vị trí**: `mobile/src/services/tinodeClient.ts` (dòng 1554 - 1562):
  ```typescript
  let hasEarlier = true;
  let pageCount = 0;
  const MAX_AUTO_PAGES = 5;
  while (hasEarlier && pageCount < MAX_AUTO_PAGES) {
    const page = await this.loadEarlierConversationInternal(topicName, boundedLimit, generation, false);
    hasEarlier = page.hasEarlier && page.loaded > 0;
    pageCount += 1;
    if (onPageLoaded && page.conversation) {
      try { onPageLoaded(page.conversation); } catch { /* Ignore callback errors */ }
    }
  }
  ```
- **Hậu quả**:
  - `boundedLimit = 40`, `MAX_AUTO_PAGES = 5` ➔ Hệ thống chỉ quét lùi tối đa `40 × 5 = 200` tin nhắn!
  - Trong các nhóm chat hoạt động thường xuyên (như nhóm 22 thành viên), 200 tin nhắn có thể chỉ diễn ra trong vòng 1-2 ngày.
  - Mọi ảnh, tệp đính kèm, liên kết được gửi trước 200 tin nhắn đó **bị bỏ sót hoàn toàn 100%**. Đây là nguyên nhân trực tiếp khiến người dùng thấy *"load còn không đầy đủ file"*.

### 2. Nguyên nhân 2: Không có cơ chế phân trang / "Tải thêm" trong màn hình Modal "Ảnh, file, link"
- **Vị trí**: `mobile/src/screens/chat/GroupInfoScreen.tsx` (dòng 598 - 626):
  - Modal hiển thị `contentItems` chỉ đọc danh sách từ `historyMessages` đã được nạp trong lần quét đầu tiên.
  - Khi người dùng cuộn đến cuối danh sách (cuộn xuống đáy ScrollView), **không có sự kiện `onEndReached` hay nút "Tải tiếp file cũ hơn"**.
  - Người dùng không có bất kỳ cách nào để yêu cầu hệ thống tải thêm các tệp cũ hơn trong lịch sử nhóm.

### 3. Nguyên nhân 3: Thiếu L1 Synchronous Memory Cache cho `cacheImage` và `cacheFile`
- **Vị trí**: `mobile/src/services/tinodeClient.ts` (dòng 966 - 1012):
  - Hàm `cacheImage(value)` chỉ lưu request Promise vào `imageCacheRequests` (Map trong phiên chạy).
  - Không có hàm đồng bộ `getCachedImageUri(value): string | null` để trả về đường dẫn file local ngay lập tức trong frame render đầu tiên của React.
- **Vị trí**: `mobile/src/components/MessageBubble.tsx` (dòng 238, 252 - 258):
  ```typescript
  const [source, setSource] = useState('');
  ...
  useEffect(() => {
    let active = true;
    setSource(''); setFailed(false);
    void tinodeClient.cacheImage(uri).then(value => { if (active) setSource(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt, uri, mediaVersion]);
  ```
  - `setSource('')` xóa sạch nguồn ảnh mỗi khi component mount hoặc prop thay đổi.
  - Khi `source === ''`, component render:
    `<ActivityIndicator /><Text>Đang tải ảnh...</Text>`
  - Ngay cả khi ảnh đã được tải về bộ nhớ máy từ trước, người dùng mở chat vẫn phải nhìn thấy spinner quay tròn rồi mới giật sang ảnh thật, gây ức chế thị giác và layout shift.

### 4. Nguyên nhân 4: Không kiểm tra file cục bộ đã tồn tại (`target.exists`) trước khi gửi request tải
- **Vị trí**: `mobile/src/services/tinodeClient.ts` (dòng 984 - 994):
  ```typescript
  const target = new fileSystem.File(fileSystem.Paths.cache, `vichat-image-${Math.abs(hash)}${extension}`);
  const download = () => fileSystem.File.downloadFileAsync(downloadUrl, target, { ... });
  downloaded = await download();
  ```
  - Mã nguồn tạo đối tượng `target` nhưng **không kiểm tra `target.exists`**.
  - Mỗi khi khởi động lại app hoặc cache key thay đổi phiên, nó lại kích hoạt tải lại qua mạng dù file ảnh/tệp đã nằm sẵn trong bộ nhớ đệm thiết bị.

### 5. Nguyên nhân 5: `groupMediaHistoryCache` chỉ là RAM Cache tạm bợ, mất sạch khi thoát app
- **Vị trí**: `mobile/src/screens/chat/GroupInfoScreen.tsx` (dòng 75):
  ```typescript
  const groupMediaHistoryCache = new Map<string, ChatMessage[]>();
  ```
  - Cache này chỉ tồn tại trong vòng đời JavaScript bundle hiện tại. Khi người dùng đóng ứng dụng hoặc mở lại, cache trống rỗng.
  - Mỗi lần mở Thông tin nhóm, ứng dụng lại phải kích hoạt subscribe WebSocket, chờ duyệt từng trang mạng từ server, khiến preview "Ảnh, file, link" bị chậm.

---

## III. GIẢI PHÁP KỸ THUẬT CHI TIẾT (ZERO REGRESSION)

### 1. Nâng cấp `tinodeClient.ts`: Tối ưu cache ảnh/tệp và mở rộng quét toàn diện lịch sử phương tiện

#### A. Thêm L1 Synchronous Memory Cache & kiểm tra `target.exists`
- Thêm `memoryImageCache = new Map<string, string>()` lưu trực tiếp URI file local đã tải thành công.
- Bổ sung hàm đồng bộ:
  ```typescript
  getCachedImageUri(value: string): string {
    const url = normalizeMediaUrl(value);
    if (!url) return '';
    if (/^(?:data:|file:|content:)/i.test(url)) return url;
    return memoryImageCache.get(url) || '';
  }
  ```
- Trong `cacheImage`:
  - Kiểm tra `memoryImageCache.get(url)` ➔ Trả về ngay lập tức (0ms).
  - Tính đường dẫn `target`: Nếu `target.exists === true`, lưu vào `memoryImageCache` và trả về ngay `target.uri` mà **không gọi `downloadFileAsync`**.

#### B. Mở rộng `loadConversationMediaHistory` thành 2 chế độ thông minh
1. **Chế độ tự động ban đầu (Initial Fast Scan)**:
   - Tăng `MAX_AUTO_PAGES` từ `5` lên `15` (quét tới 600 tin nhắn gần nhất) với streaming `onPageLoaded` sau mỗi trang (~100ms).
   - Tối ưu truy vấn: dừng sớm nếu đã chạm đầu topic (`after <= 1`).
2. **Hỗ trợ hàm tải tiếp lịch sử sâu hơn (`loadMoreConversationMediaHistory`)**:
   - Nhận `topicName`, vị trí con trỏ `minSeq` hiện tại của cache, tiếp tục quét ngược thêm 15 trang tiếp theo cho đến khi đạt tận cùng (`seq = 1`).
   - Cung cấp cờ `hasMoreMediaHistory` để giao diện biết khi nào đã tải hết toàn bộ lịch sử nhóm.

---

### 2. Sửa đổi `mobile/src/components/MessageBubble.tsx`: Hiển thị ảnh tức thì không chớp nháy

- Sửa đổi `ProtectedMessageImage`:
  ```typescript
  // Khởi tạo state bằng ảnh đã cache trong RAM (nếu có) thay vì chuỗi rỗng
  const [source, setSource] = useState(() => tinodeClient.getCachedImageUri(uri));
  ```
- Trong `useEffect`:
  - Nếu `tinodeClient.getCachedImageUri(uri)` đã có giá trị, đặt ngay `setSource(...)` và không bao giờ reset `setSource('')`.
  - Chỉ hiển thị placeholder spinner nếu ảnh thực sự chưa có trong cache và đang tải lần đầu.

---

### 3. Sửa đổi `mobile/src/screens/chat/GroupInfoScreen.tsx`: Giao diện mượt mà và hỗ trợ tải 100% file

#### A. Khởi tạo tức thì từ Persistent Cache / RAM Cache
- Lưu metadata các file/ảnh đã tải vào `AsyncStorage` hoặc persistent local store theo key `@vichat_group_media_${conversationId}` để khi mở Thông tin nhóm, strip preview hiển thị tức thì 0ms, không còn tình trạng chớp tắt hay chờ loading.

#### B. Thêm tính năng "Tải tiếp file cũ hơn" trong Modal "Ảnh, file, link"
- Khi người dùng bấm vào xem toàn bộ Ảnh/File/Link:
  - Nếu topic còn tin nhắn cũ hơn chưa quét hết (`hasMoreHistory === true`), hiển thị nút bấm ở cuối danh sách:
    `[ Tải thêm nội dung cũ hơn ]` kèm indicator khi đang tải.
  - Người dùng có thể chủ động tải toàn bộ 100% tài liệu, hình ảnh từ những ngày đầu lập nhóm.
  - Cập nhật số lượng đếm chính xác ("X ảnh · Y file · Z link").

---

## IV. BƯỚC THỰC HIỆN CỤ THỂ (STEP-BY-STEP IMPLEMENTATION)

### Bước 1: Cập nhật `mobile/src/services/tinodeClient.ts`
1. Khai báo `memoryImageCache = new Map<string, string>()`.
2. Xuất hàm `getCachedImageUri(value: string): string`.
3. Cập nhật `cacheImage`:
   - Kiểm tra `memoryImageCache`.
   - Kiểm tra `target.exists` trước khi tải mạng.
   - Ghi nhớ `memoryImageCache.set(url, target.uri)` khi thành công.
4. Nâng cấp `loadConversationMediaHistory`:
   - Nâng giới hạn quét ban đầu lên 15 trang (600 tin nhắn).
   - Bổ sung hàm `loadMoreConversationMediaHistory(topicName, beforeSeq, limit, onPageLoaded)` để hỗ trợ tải sâu không giới hạn khi người dùng yêu cầu.

### Bước 2: Cập nhật `mobile/src/components/MessageBubble.tsx`
1. Nhập `getCachedImageUri` từ `tinodeClient`.
2. Khởi tạo `source` trong `ProtectedMessageImage` với `getCachedImageUri(uri)`.
3. Loại bỏ dòng `setSource('')` gây chớp spinner khi re-render ảnh đã có sẵn.

### Bước 3: Cập nhật `mobile/src/screens/chat/GroupInfoScreen.tsx`
1. Tận dụng `getCachedImageUri` trong `CachedMessageImage`.
2. Bổ sung state `hasMoreHistory` và hàm `loadMoreMedia()`.
3. Trong Modal `contentView === 'shared'`:
   - Thêm nút / footer `Tải thêm nội dung cũ hơn` khi `hasMoreHistory === true`.
   - Hiển thị tiến trình tải mượt mà, cập nhật trực tiếp danh sách `contentItems`.

### Bước 4: Kiểm thử tự động & Xác minh Zero Regression
1. Chạy `npm run typecheck` trong `mobile/` ➔ Đảm bảo 0 lỗi TypeScript.
2. Chạy `npm run lint` trong `mobile/` ➔ Đảm bảo 0 cảnh báo linter.
3. Chạy `npm test` trong `mobile/` ➔ Đảm bảo toàn bộ 41 bộ test (182+ tests) đều PASS.

### Bước 5: Build APK trên ổ D: & Triển khai qua ADB
1. Thiết lập biến môi trường chuẩn ổ D: (`GRADLE_USER_HOME=D:\vichat-build\gradle-user-home`, v.v.).
2. Đồng bộ mã nguồn sang thư mục staging `D:\vichat-build\mobile-scroll-fix-20261004`.
3. Build APK debug:
   ```powershell
   .\gradlew.bat :app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a
   ```
4. Cài đặt APK lên thiết bị thật qua ADB:
   ```powershell
   adb -s f36c9ba7 install -r D:\vichat-build\ViChat-media-fix-debug.apk
   ```
5. Kiểm tra trực quan trên thiết bị:
   - Mở màn hình chat có ảnh: Ảnh hiển thị tức thì, không giật spinner.
   - Mở màn hình Thông tin nhóm: Mục "Ảnh, file, link" hiển thị đầy đủ các file cũ, bấm "Tải thêm" nạp thêm file mượt mà.

### Bước 6: Cập nhật nhật ký `docs/CHANGELOG.md`
- Ghi nhận đầy đủ mục `2026-10-05-01` theo đúng quy định tại `AGENTS.md`.

---

## V. CHECKLIST KIỂM THỬ KHÔNG GÂY LỖI LUỒNG KHÁC (ZERO REGRESSION)

| STT | Luồng chức năng kiểm tra | Tiêu chuẩn đạt |
|---|---|---|
| 1 | Mở phòng chat có nhiều ảnh | Ảnh hiển thị ngay (0ms) nếu đã cache; không chớp giật layout |
| 2 | Gửi ảnh mới / file mới | Gửi thành công, thumbnail hiển thị mượt mà |
| 3 | Ghi âm Voice (Mic) | Bấm mic ghi âm ➔ KHÔNG bị banner vàng, dừng và gửi voice bình thường |
| 4 | Xem "Ảnh, file, link" trong nhóm | Hiển thị đủ các file cũ; có nút tải tiếp nếu còn dữ liệu lịch sử |
| 5 | Tải file đính kèm (Download) | Tải và mở tệp bình thường qua ứng dụng ngoài |
| 6 | Chat 1-1 & Chatbot AI | Hoạt động trơn tru, không ảnh hưởng đến logic định tuyến tin nhắn |
| 7 | Cuộc gọi thoại / Video WebRTC | Không bị ảnh hưởng bởi cơ chế cache media |
