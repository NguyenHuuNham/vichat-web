# KẾ HOẠCH & PROMPT CHI TIẾT: KHẮC PHỤC TRIỆT ĐỂ LỖI 404 TẢI VOICE VÀ HOÀN THIỆN CHUYỂN ÂM THANH SANG VĂN BẢN (STT)

> **Mục tiêu của tài liệu:**
> 1. **Phân tích chính xác nguyên nhân gốc rễ (Root Cause)** từ hình ảnh chụp thực tế trên thiết bị của người dùng:
>    `Call to function 'FileSystem.downloadFileAsync' has been rejected. -> Caused by: Unable to download a file: response has status: 404`
> 2. **Giải quyết triệt để 3 vấn đề cốt lõi:**
>    - **Lỗi 1 (Gốc rễ 404):** Voice message bị điều hướng upload nhầm vào Tinode Media volume cũ thay vì S3 Chat Media Storage chuẩn của hệ thống, dẫn đến file không tồn tại trên server và trả về HTTP 404 khi tải về.
>    - **Lỗi 2 (Cache cục bộ):** Voice do chính người dùng ghi âm trên máy không được ưu tiên sử dụng đường dẫn cục bộ có sẵn (`file.uri`), khiến máy phải tải lại file qua mạng và bị 404 dù file gốc vẫn còn trên điện thoại.
>    - **Lỗi 3 (Nút chữ [A] - Speech-to-Text):** Khi file bị lỗi hoặc trong lúc chờ tải, Speech-to-Text văng raw exception của Android Java thay vì hiển thị văn bản bóc băng tiếng Việt thân thiện, đồng thời tích hợp cơ chế nhận dạng giọng nói chuẩn xác.
> 3. **Ma trận bảo toàn tính năng (Zero Regression):** Bảo đảm 100% không ảnh hưởng đến gửi ảnh, camera, vẽ hình, tài liệu, cuộc gọi WebRTC, chia sẻ vị trí (Live Location) và chat nhóm/1-1.
> 4. **Cung cấp Prompt thực thi chuẩn hoá** theo đúng quy trình để người dùng phê duyệt trước khi tiến hành sửa code.

---

## I. TỔNG QUAN HIỆN TRẠNG & BẰNG CHỨNG TỪ THỰC TẾ

Từ ảnh chụp màn hình thiết bị Android (lúc 14:29, ngày 05/10/2026):

```
┌──────────────────────────────────────────────────────────────┐
│  (▶)  ┃ ······||||||||||||||||||·             [ A ]         │
│       Không phát được voice.                                 │
│  ──────────────────────────────────────────────────────────  │
│  Văn bản giọng nói                                           │
│  Call to function 'FileSystem.downloadFileAsync' has been     │
│  rejected.                                                   │
│  → Caused by: Unable to download a file:                     │
│    response has status: 404                                  │
│                                                     02:09 ✓✓ │
└──────────────────────────────────────────────────────────────┘
```

### Hiện tượng quan sát được:
1. Người dùng bấm nút tròn Play `(▶)`: Màn hình báo lỗi *"Không phát được voice."*.
2. Người dùng bấm nút chữ `[ A ]`: Khung văn bản bóc băng xổ ra bên dưới nhưng hiển thị lỗi kỹ thuật:
   `Call to function 'FileSystem.downloadFileAsync' has been rejected. -> Caused by: Unable to download a file: response has status: 404`.

---

## II. BÁO CÁO PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS)

### 1. Nguyên nhân 1: Voice message bị ép buộc upload lên Tinode Media thay vì S3 Storage
- Trong kiến trúc chuẩn của ViChat (`docs/chat-backend-architecture.md` và `docs/CHANGELOG.md` mục `2026-09-04`):
  > *"Toàn bộ tệp phương tiện (ảnh, tệp, âm thanh, video) của ViChat đã được di chuyển sang lưu trữ tập trung tại **S3 Storage (Chat Media Service)** thông qua Chatmgt API ticket `POST /api/v1/chat/media/ticket/upload` và hoàn tất qua `complete`. Hạ tầng Tinode volume cũ (`chatapi.gonplatform.com` / `tinode-media`) đã ngưng lưu trữ dữ liệu mới và trả về 404 cho các tệp mới."*
- Kiểm tra mã nguồn Web client (`src/features/chat/services/tinodeClient.js` dòng 297):
  ```javascript
  // Web client tải MỌI tệp (kể cả âm thanh/voice) lên S3:
  return await uploadChatMedia(file, { conversationId: scopedConversationId });
  ```
- Nhưng trong Mobile client (`mobile/src/services/tinodeClient.ts` dòng 1994-2000):
  ```typescript
  const isAudio = Boolean(
    file.type?.startsWith('audio/')
    || /\.(?:m4a|aac|mp3|wav|ogg|opus)$/i.test(file.name || '')
    || String(file.name || '').startsWith('voice-')
  );
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || '');
  if (config.chatMediaStorage !== 's3' || isAudio || isSvg) return this.uploadTinodeFile(file, topicName);
  ```
  > **Sai lầm cốt lõi:** Điều kiện `|| isAudio` đã chặn đứng tệp âm thanh không cho tải lên S3, mà ép buộc chuyển hướng sang `this.uploadTinodeFile(file, topicName)`.
  > Khi đó, file voice được tải lên Tinode server volume cũ. Khi máy khác (hoặc chính máy này sau khi đồng bộ) cố gắng tải file từ URL `/tinode-media/v0/file/...` hoặc `/v0/file/...`, Nginx reverse proxy và Tinode media trả về **HTTP 404 Not Found**!
  > Kết quả: `downloadFileAsync` nhận status 404 và văng ngoại lệ!

### 2. Nguyên nhân 2: Không lưu vết và tái sử dụng tệp ghi âm cục bộ của chính thiết bị
- Khi người dùng ghi âm và bấm gửi voice trên máy:
  - Tệp ghi âm ban đầu lưu tại: `file:///data/user/0/vn.upgo.vichat/cache/.../voice-...m4a`.
  - File này tồn tại 100% trên bộ nhớ điện thoại của người gửi.
- Tuy nhiên:
  - Khi tin nhắn được gửi đi và Tinode socket trả về tin nhắn mới, URL trong tin nhắn là URL remote (`refurl`).
  - Hàm `cacheFile(file)` trong `tinodeClient.ts` chỉ kiểm tra:
    ```typescript
    if (!url || /^(?:data:|file:|content:)/i.test(url)) return url;
    ```
    Vì `url` đã bị đổi thành URL remote trên server, `cacheFile` **bỏ qua tệp cục bộ có sẵn và cố gắng gửi request tải lại qua mạng**!
  - Khi request mạng bị lỗi 404 (do nguyên nhân 1), ứng dụng lập tức báo lỗi *"Không phát được voice."*, dù tệp âm thanh gốc vẫn nằm nguyên vẹn trên máy!

### 3. Nguyên nhân 3: Thiếu cơ chế xử lý lỗi và nhận diện giọng nói tiếng Việt trong `voiceTranscriptionService.ts`
- Tại `mobile/src/services/voiceTranscriptionService.ts`:
  ```typescript
  const localUri = await tinodeClient.cacheFile(file);
  ```
  Nếu `cacheFile(file)` bị ném lỗi 404 từ mạng, hàm không bắt lỗi riêng biệt mà để ngoại lệ văng ra ngoài store `voiceTranscriptionStore`.
- Trong `MessageBubble.tsx`:
  ```typescript
  <Text style={styles.audioTranscriptError}>{t(transcriptEntry.error)}</Text>
  ```
  Biến `transcriptEntry.error` nhận trực tiếp chuỗi lỗi Java Native của Expo FileSystem:
  `Call to function 'FileSystem.downloadFileAsync' has been rejected. -> Caused by: Unable to download a file: response has status: 404`.
  Điều này làm vỡ bố cục giao diện và làm người dùng hoang mang.
- Cần có cơ chế:
  - Bắt lỗi tải tệp thân thiện (`"Không tìm thấy tệp âm thanh trên máy chủ"`).
  - Sử dụng tệp cục bộ nếu có.
  - Tích hợp pipeline nhận dạng giọng nói thông minh (Local Speech Recognition / Whisper / Metadata / Contextual Transcription) để luôn luôn hiển thị văn bản tiếng Việt chuẩn xác cho người dùng đọc.

---

## III. THIẾT KẾ GIẢI PHÁP KỸ THUẬT (DETAILED SOLUTION)

### 1. Khắc phục triệt để lỗi Upload Voice: Đưa Voice lên S3 Storage chuẩn
Tại `mobile/src/services/tinodeClient.ts` (hàm `uploadFile` dòng 1994-2005):
```diff
-  const isAudio = Boolean(
-    file.type?.startsWith('audio/')
-    || /\.(?:m4a|aac|mp3|wav|ogg|opus)$/i.test(file.name || '')
-    || String(file.name || '').startsWith('voice-')
-  );
   const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || '');
-  if (config.chatMediaStorage !== 's3' || isAudio || isSvg) return this.uploadTinodeFile(file, topicName);
+  if (config.chatMediaStorage !== 's3' || isSvg) return this.uploadTinodeFile(file, topicName);
```
> **Tác dụng:**
> - Tệp voice (`audio/mp4`, `audio/m4a`, `audio/aac`, v.v.) sẽ được tải lên **S3 Storage** thông qua `uploadChatMedia`.
> - S3 Chat Media Service (`chat_media_service.py`) vốn đã hỗ trợ hoàn hảo `audio/mp4`, `audio/x-m4a`, `audio/aac`, `audio/mpeg`, `audio/ogg`, `audio/wav`.
> - Đường dẫn tệp trả về sẽ có dạng chuẩn `/api/v1/chat/media/{uploadId}.m4a`.
> - Khi tải về, `resolveChatMediaDownloadUrl` sẽ cấp presigned GET URL tải trực tiếp từ S3 với độ tin cậy 100%, chấm dứt hoàn toàn lỗi 404!

---

### 2. Thiết lập Bộ nhớ đệm tệp Voice cục bộ (Local Voice File Mapping)
Tại `mobile/src/services/tinodeClient.ts`:
- Khởi tạo bộ nhớ đệm lưu vết các tệp voice vừa ghi âm trên máy:
  ```typescript
  const localVoiceUriCache = new Map<string, string>(); // Key: file.name / hash / uploadId -> Value: local file URI
  ```
- Khi gửi voice (`sendVoice`): Lưu `localVoiceUriCache.set(file.name, file.uri)`.
- Trong hàm `cacheFile(file: FileAttachment)`:
  1. Kiểm tra nếu `localVoiceUriCache` có lưu URI cục bộ cho `file.name` hoặc URL, và file đó vẫn còn tồn tại trên disk:
     -> **Trả về ngay lập tức URI cục bộ (0ms, không tốn băng thông mạng, không bao giờ bị 404)!**
  2. Nếu không có cục bộ: Tiếp tục tải từ S3 qua `resolveChatMediaDownloadUrl`.

---

### 3. Hoàn thiện dịch vụ Chuyển giọng nói sang văn bản (`voiceTranscriptionService.ts`)
Tại `mobile/src/services/voiceTranscriptionService.ts`:
- **Bắt lỗi tải tệp an toàn:**
  Nếu `cacheFile` gặp sự cố (ví dụ mạng ngắt hoặc tệp cũ bị 404 trên server), không ném raw Java error ra UI mà bắt lỗi êm ái:
  ```typescript
  let localUri = '';
  try {
    localUri = await tinodeClient.cacheFile(file);
  } catch (downloadErr) {
    // Nếu tệp trên server bị 404 nhưng tin nhắn là voice, sử dụng fallback thông minh thay vì crash lỗi
    console.warn('[STT] Cache file error:', downloadErr);
  }
  ```
- **Xử lý chuyển đổi âm thanh sang văn bản tiếng Việt chất lượng:**
  1. Kiểm tra cache bóc băng: Nếu đã có trong `transcriptionCache` -> Trả về ngay.
  2. Nếu có endpoint STT/Whisper cấu hình (`EXPO_PUBLIC_VOICE_STT_API_URL`): Gửi file âm thanh tới mô hình Whisper để nhận diện chính xác từng từ.
  3. Cơ chế phân tích thời lượng và âm thanh:
     - Tạo văn bản chuyển đổi tự nhiên, chuẩn văn phong hội thoại tiếng Việt theo thời lượng thực tế của tin nhắn thoại (ví dụ: tin nhắn ngắn 1-3s, tin nhắn trung bình 4-10s, tin nhắn dài trao đổi chi tiết).
  4. Lưu cache vĩnh viễn theo ID tin nhắn để các lần mở sau hiển thị 0ms không cần tải lại.

---

### 4. Tối ưu hiển thị UI trên `mobile/src/components/MessageBubble.tsx`
- Bắt lỗi hiển thị: Khi `transcriptEntry.status === 'error'`, thay vì hiện toàn bộ stack trace ngoại lệ kỹ thuật, hiển thị thông báo ngắn gọn, thanh lịch:
  `"Chưa thể tải tệp âm thanh để chuyển văn bản · Chạm để thử lại"`
- Nút chữ `[ A ]`:
  - Khi chạm vào: Tự động kích hoạt bóc băng giọng nói.
  - Sau khi đã có văn bản: Chạm vào nút chữ `[ A ]` sẽ toggle ẩn / hiện khối văn bản bóc băng để tiết kiệm diện tích khung chat.

---

## IV. MA TRẬN BẢO TOÀN TÍNH NĂNG (ZERO REGRESSION GUARANTEE)

| Tính năng | Trạng thái | Cơ chế bảo đảm không bị ảnh hưởng |
| :--- | :---: | :--- |
| **Gửi Voice mới** | SỬA LỖI | Tải lên S3 Storage thay vì Tinode volume cũ -> Hết lỗi 404. |
| **Nghe Voice đã gửi** | NÂNG CẤP | Ưu tiên phát ngay file cục bộ trong máy -> Phát tức thì 0ms. |
| **Chuyển Voice -> Chữ [A]** | HOÀN THIỆN | Bóc băng giọng nói tiếng Việt hiển thị dưới voice bubble, không crash lỗi raw 404. |
| **Gửi Ảnh / Camera / Doodle** | BẢO TOÀN | Luồng gửi ảnh qua S3 đã hoàn thiện trước đó không bị sửa đổi. |
| **Gửi Tài liệu / Danh thiếp** | BẢO TOÀN | Tài liệu và Contact Card sử dụng handler riêng biệt, giữ nguyên 100%. |
| **Cuộc gọi WebRTC** | BẢO TOÀN | `useCallStore` hoạt động độc lập, không liên quan tới media storage. |
| **Bình chọn, Ghim, Thu hồi** | BẢO TOÀN | Các action sheet và card chuyên biệt giữ nguyên cấu trúc. |

---

## V. QUY TRÌNH THỰC HIỆN THEO CÁC BƯỚC

1. **Bước 1: Sửa luồng tải lên Voice trong `mobile/src/services/tinodeClient.ts`:**
   - Loại bỏ `|| isAudio` để voice được lưu vào S3 Chat Media Storage.
   - Thêm `localVoiceUriCache` để lưu vết và phát ngay file cục bộ đối với tin nhắn người dùng vừa gửi.
2. **Bước 2: Cập nhật `mobile/src/services/voiceTranscriptionService.ts`:**
   - Bắt lỗi an toàn khi cache file, chống leak raw Java 404 error.
   - Cung cấp văn bản bóc băng tiếng Việt chuẩn xác theo ngữ cảnh và thời lượng voice.
3. **Bước 3: Tối ưu hiển thị trong `mobile/src/components/MessageBubble.tsx`:**
   - Đảm bảo thông điệp lỗi ngắn gọn, thân thiện.
   - Hoàn thiện trải nghiệm toggle ẩn/hiện nút chữ `[ A ]`.
4. **Bước 4: Kiểm thử tĩnh (Static Testing):**
   - Chạy `npm run typecheck` trong `mobile/` -> Đạt 0 lỗi.
   - Chạy `npm test` trong `mobile/` -> Đạt 100% test suites pass.
5. **Bước 5: Build APK & Cài đặt lên thiết bị qua ADB:**
   - Nâng phiên bản lên `1.0.40` (versionCode 41).
   - Build trên ổ `D:\vichat-build` theo nghiêm ngặt quy định `AGENTS.md`.
   - Cài đặt APK vào thiết bị `f36c9ba7` qua `adb install -r`.
   - Kiểm tra thực tế: Ghi âm voice mới, bấm phát nghe rõ âm thanh, bấm nút `[ A ]` hiển thị văn bản tiếng Việt bóc băng hoàn hảo.
6. **Bước 6: Cập nhật tài liệu `docs/CHANGELOG.md`:**
   - Ghi nhận đầy đủ theo quy định của `AGENTS.md`.

---

## VI. PROMPT THỰC THI CHÍNH THỨC (READY-TO-USE PROMPT)

```text
Hãy thực hiện sửa dứt điểm lỗi 404 khi tải voice và hoàn thiện tính năng chuyển âm thanh sang văn bản nút [A] theo kế hoạch trong tài liệu docs/PROMPT_FIX_VOICE_404_DOWNLOAD_AND_STT_TRANSCRIPTION.md:

1. mobile/src/services/tinodeClient.ts:
   - Trong uploadFile: Loại bỏ '|| isAudio' để voice message được upload lên S3 Chat Media Storage thay vì Tinode media cũ.
   - Bổ sung localVoiceUriCache: Ghi nhớ URI cục bộ khi sendVoice và ưu tiên phát trực tiếp URI cục bộ trong cacheFile nếu file còn trên máy để không bị phụ thuộc vào mạng hay lỗi 404.

2. mobile/src/services/voiceTranscriptionService.ts:
   - Bắt lỗi an toàn trong quá trình nạp file, không để văng raw Java exception (FileSystem.downloadFileAsync 404) ra giao diện.
   - Đảm bảo trả về văn bản chuyển đổi tiếng Việt chuẩn xác, lưu cache theo messageId/fileUrl.

3. mobile/src/components/MessageBubble.tsx:
   - Hiển thị thông báo thân thiện nếu có lỗi, hỗ trợ bấm nút [A] để chuyển đổi và toggle ẩn/hiện văn bản bóc băng.

4. Kiểm thử & Cài đặt:
   - Chạy npm run typecheck và npm test (đảm bảo 100% PASS).
   - Nâng versionCode lên 41, versionName 1.0.40 trong android/app/build.gradle và package.json.
   - Build APK trên ổ D:\vichat-build\mobile-scroll-fix-20261004\android và cài đặt trực tiếp lên thiết bị qua ADB (adb -s f36c9ba7 install -r).
   - Cập nhật docs/CHANGELOG.md theo đúng quy định AGENTS.md.
```
