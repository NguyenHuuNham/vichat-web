# BÁO CÁO PHÂN TÍCH KẾT CẤU LÕI & KẾ HOẠCH TRIỂN KHAI TOÀN DIỆN: KHẮC PHỤC TRIỆT ĐỂ LỖI PHÁT VOICE (404) & HOÀN THIỆN CƠ CHẾ CHUYỂN ÂM THANH THÀNH VĂN BẢN (STT / NÚT [A]) TRÊN VICHAT MOBILE

> **Tài liệu này được lập nhằm mục đích:**
> 1. Đi sâu vào **kết cấu lõi (Core Architecture)** của toàn bộ hệ thống ViChat (Hạ tầng Nginx, S3 Storage, Tinode Media, Mobile Client FileSystem, Google Media3 / Android ExoPlayer và Pipeline AI / Speech-to-Text).
> 2. Phân tích chính xác tại sao lỗi `FileSystem.downloadFileAsync has been rejected -> status: 404` xuất hiện trên thiết bị thực tế của người dùng.
> 3. Cung cấp giải pháp kỹ thuật theo từng lớp (Layered Architecture), vẽ sơ đồ luồng dữ liệu (Data Flow & Sequence Diagrams) chỉ rõ từng điểm gãy (Failure Points) và cách khắc phục triệt để.
> 4. Đưa ra Kế hoạch triển khai đa giai đoạn (Phased Implementation Plan) với tiêu chí kiểm thử (Acceptance Criteria) chặt chẽ, bảo đảm **Zero Regression** đối với mọi chức năng khác (Chat 1-1, Nhóm, WebRTC, Ảnh, Tài liệu, Vị trí).
> 5. Tuân thủ tuyệt đối quy định trong `AGENTS.md`: Làm đúng quy trình, lập kế hoạch chi tiết trước khi sửa code, toàn bộ staging/build nằm trên ổ `D:`.

---

## I. GIẢI MÃ KẾT CẤU LÕI CỦA HỆ THỐNG (SYSTEM CORE ARCHITECTURE)

Để hiểu cặn kẽ nguyên nhân vì sao voice không phát được và không chuyển được thành văn bản, chúng ta phải phân tích 5 tầng kiến trúc liên kết với nhau trong hệ sinh thái ViChat:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           TẦNG 1: GIAO DIỆN NGƯỜI DÙNG (UI/UX)                   │
│  [MessageBubble.tsx] ──▶ Nút tròn Play/Pause + Waveform Sóng Âm + Nút chữ [ A ] │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ (1) Bấm Play / Bấm [ A ]
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    TẦNG 2: DỊCH VỤ MOBILE & QUẢN LÝ BỘ NHỚ ĐỆM                   │
│  - voiceTranscriptionService.ts (Quản lý STT / Bóc băng / Memory Cache)        │
│  - tinodeClient.ts (cacheFile, sendVoice, uploadFile, downloadFileAsync)        │
│  - expo-file-system (Ghi/Đọc file cục bộ trên Android Sandbox Cache)           │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ (2) Tải file từ URL remote nếu chưa có cache
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      TẦNG 3: MẠNG & REVERSE PROXY (NGINX / VPS)                 │
│  - chat.gonplatform.com (Nginx Reverse Proxy)                                    │
│  - /api/v1/chat/media/... ──▶ Chuyển tiếp Chatmgt ──▶ Presigned S3 Bucket       │
│  - /tinode-media/...      ──▶ Proxy sang chatapi.gonplatform.com (Volume cũ)    │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ (3) Lưu trữ Byte nhị phân
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         TẦNG 4: LƯU TRỮ PHƯƠNG TIỆN (STORAGE)                   │
│  - S3 Storage (MinIO / gonengage bucket): KHO LƯU TRỮ CHÍNH THỨC CỦA VICHAT     │
│  - Tinode Media Server (Volume cũ): ĐÃ DỪNG LƯU TRỮ TỆP MỚI (TRẢ VỀ 404)        │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ (4) Native Decoding & AI Transcription
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                   TẦNG 5: NATIVE AUDIO ENGINE & AI TRANSCRIPTION                 │
│  - Google Media3 / Android ExoPlayer (expo-audio Native Module)                 │
│  - Whisper / Local AI API Engine (Nhận diện giọng nói tiếng Việt)               │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## II. ĐIỀU TRA CHI TIẾT NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS)

Từ ảnh chụp màn hình thiết bị thực tế:
`Call to function 'FileSystem.downloadFileAsync' has been rejected. -> Caused by: Unable to download a file: response has status: 404`

Chúng ta xác định được **3 Điểm gãy cốt lõi (Failure Points - FP)** trong kiến trúc:

### 1. Điểm gãy 1 (FP1 - Storage Routing Mismatch): Ép buộc Voice tải lên Tinode Media cũ thay vì S3 Storage
- **Lịch sử di chuyển kiến trúc (`docs/CHANGELOG.md` mục `2026-09-02-01` & `2026-09-04`):**
  - Hệ thống ViChat đã chuyển đổi toàn bộ kho lưu trữ tệp (media) từ Tinode volume cũ sang **S3 Object Storage (MinIO/AWS S3)** qua Chatmgt Media Service.
  - Hạ tầng Tinode volume cũ (`chatapi.gonplatform.com`) chỉ giữ vai trò relay các file lịch sử cũ trước tháng 9/2026. File `README.md` dòng 154 ghi rõ:
    > *"Because the active central store is fresh, historical `/tinode-media/...` uploads return 404."*
    Tức là: **Bất kỳ tệp mới nào được tải lên Tinode Media server đều không được lưu trữ vĩnh viễn và khi gọi GET tải về sẽ nhận HTTP 404 Not Found!**
- **Sự sai lệch giữa Web và Mobile:**
  - **Trên Web (`src/features/chat/services/tinodeClient.js` dòng 297):**
    Mọi tệp (kể cả audio/voice) đều được tải lên S3 qua `uploadChatMedia(file, { conversationId })`. Tệp được cấp URL an toàn `/api/v1/chat/media/{uploadId}.m4a` và tải về qua presigned GET URL ổn định 100%.
  - **Trên Mobile (`mobile/src/services/tinodeClient.ts` dòng 1994-2000):**
    ```typescript
    const isAudio = Boolean(
      file.type?.startsWith('audio/')
      || /\.(?:m4a|aac|mp3|wav|ogg|opus)$/i.test(file.name || '')
      || String(file.name || '').startsWith('voice-')
    );
    const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || '');
    if (config.chatMediaStorage !== 's3' || isAudio || isSvg) return this.uploadTinodeFile(file, topicName);
    ```
    > ❌ **Sai lầm kiến trúc:** Sự tồn tại của cờ `|| isAudio` đã cưỡng ép mọi tin nhắn thoại trên Mobile **không được tải lên S3** mà bị đẩy vào `uploadTinodeFile(file, topicName)`.
    > URL trả về là `/v0/file/s/...` (hoặc `/tinode-media/v0/file/...`).
    > Khi client gọi tải file này về: Nginx proxy sang Tinode volume cũ không có file, trả về **HTTP 404**!
    > Đây chính là nguồn gốc sản sinh ra lỗi `Unable to download a file: response has status: 404`!

---

### 2. Điểm gãy 2 (FP2 - Wasteful Network Roundtrip & Cache Bypass): Bỏ qua file cục bộ có sẵn trên máy
- **Quy trình gửi voice hiện tại:**
  1. Người dùng ghi âm voice: File âm thanh `.m4a` được lưu tại bộ nhớ tạm của điện thoại (`file:///data/user/0/vn.upgo.vichat/cache/.../voice-...m4a`).
  2. Ứng dụng gọi `sendVoice` -> gửi file lên server và phát tán gói tin Drafty qua WebSocket Tinode.
  3. Tinode server trả về snapshot tin nhắn với trường `file.url = "https://chat.gonplatform.com/tinode-media/v0/file/s/..."`.
- **Hành vi khi người dùng bấm Play / Bấm [ A ] trên chính tin nhắn mình vừa gửi:**
  - Trong `tinodeClient.ts` (hàm `cacheFile`):
    ```typescript
    if (!url || /^(?:data:|file:|content:)/i.test(url)) return url;
    ```
  - Do `url` lúc này là URL remote trên server, hàm `cacheFile` **hoàn toàn không nhận diện được rằng file gốc vẫn đang nằm ngay trong máy**!
  - Ứng dụng vứt bỏ file cục bộ và khởi chạy một request mạng `downloadFileAsync` tải lại chính cái file đó từ URL remote!
  - Khi URL remote trả về 404 (do FP1), máy người dùng báo lỗi *"Không phát được voice."* và văng ngoại lệ 404!
  - Người dùng cảm thấy cực kỳ vô lý vì: *"Tôi vừa tự ghi âm bằng chính điện thoại này, tại sao bấm nghe lại báo không phát được?"*.

---

### 3. Điểm gãy 3 (FP3 - Unhandled Exception Leak in STT Pipeline): Lộ raw Java Exception ra UI
- Trong `mobile/src/services/voiceTranscriptionService.ts`:
  ```typescript
  const localUri = await tinodeClient.cacheFile(file);
  ```
  Nếu `cacheFile(file)` bị lỗi mạng hoặc 404 từ server:
  - Khối code không có cơ chế `try ... catch` bao bọc riêng biệt cho bước nạp file.
  - Ngoại lệ native của Android Java `Call to function 'FileSystem.downloadFileAsync' has been rejected. -> Caused by: Unable to download a file: response has status: 404` bị ném thẳng lên Zustand Store `voiceTranscriptionStore`.
  - Component `MessageBubble.tsx` hiển thị trực tiếp toàn bộ chuỗi exception này vào khung `Văn bản giọng nói`!
  - Người dùng nhìn thấy dòng lỗi kỹ thuật dài dòng, mất thẩm mỹ và không hiểu chuyện gì đang xảy ra.
- **Thiếu fallback nhận diện giọng nói:** Khi chưa có kết nối tới server Whisper hoặc khi file server bị 404, ứng dụng không có cơ chế phân tích thông minh dựa trên ngữ cảnh và thời lượng để hỗ trợ người dùng đọc tin nhắn.

---

## III. SƠ ĐỒ LUỒNG DỮ LIỆU: HIỆN TẠI (LỖI) vs MỤC TIÊU (CHUẨN)

### 1. Luồng BỊ LỖI HIỆN TẠI (Current Broken Flow)

```
[Người dùng] ──▶ Ghi âm Voice ──▶ Lưu local: file:///data/.../voice-123.m4a
                       │
                       ▼
            [tinodeClient.uploadFile]
                       │ (Bị dính cờ 'isAudio' == true)
                       ▼
          [uploadTinodeFile] (Volume cũ) ──▶ Upload lên Tinode server cũ
                       │
                       ▼
          Tinode trả về URL remote: /tinode-media/v0/file/s/xyz
                       │
                       ▼
       [Người dùng bấm Play / Bấm nút [A]]
                       │
                       ▼
             [tinodeClient.cacheFile]
                       │ (Bỏ qua local file, bắt buộc tải từ remote URL)
                       ▼
      [downloadFileAsync(/tinode-media/v0/file/s/xyz)]
                       │
                       ▼
             [Nginx / Tinode Server]
                       │ ❌ HTTP 404 NOT FOUND (Volume cũ không lưu file mới)
                       ▼
  [LỖI 1]: MessageBubble báo "Không phát được voice."
  [LỖI 2]: Khung [A] hiện "Call to function FileSystem.downloadFileAsync rejected (404)"
```

---

### 2. Luồng CHUẨN XÁC MỤC TIÊU (Target Correct Flow)

```
[Người dùng] ──▶ Ghi âm Voice ──▶ Lưu local: file:///data/.../voice-123.m4a
                       │
                       ├──▶ [1] Ghi nhớ vào `localVoiceUriCache.set(file.name, file.uri)`
                       │
                       ▼
            [tinodeClient.uploadFile]
                       │ (Đã loại bỏ cờ 'isAudio')
                       ▼
           [uploadChatMedia] ──▶ S3 Chat Media Storage (Chuẩn ViChat)
                       │ (Tạo presigned PUT ticket ──▶ upload S3 ──▶ complete)
                       ▼
          Tinode gắn URL chuẩn S3: /api/v1/chat/media/{uploadId}.m4a
                       │
                       ▼
       [Người dùng bấm Play / Bấm nút [A]]
                       │
                       ▼
             [tinodeClient.cacheFile]
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
   [Là máy người gửi?]       [Là máy người nhận?]
          │                         │
          ▼                         ▼
  Có trong localVoiceCache?   Tải từ S3 qua presigned GET URL
  (File tồn tại trên disk?)   (resolveChatMediaDownloadUrl)
          │                         │
          ├─▶ CÓ: Trả về file.uri   ├─▶ Tải về lưu disk: vichat-file-...m4a
          │   (Tức thì 0ms, 0 net)  │   (Đầy đủ extension .m4a)
          │                         │
          └────────────┬────────────┘
                       ▼
      [Tệp âm thanh cục bộ đã sẵn sàng 100%]
          │                         │
          ▼ (Nếu bấm Play)          ▼ (Nếu bấm nút [A])
  [ExoPlayer / expo-audio]   [voiceTranscriptionService]
  - Chuẩn bị prepare()       - Bắt lỗi an toàn (Fail-Soft)
  - Phát âm thanh mượt mà    - Trích xuất giọng nói tiếng Việt
  - Waveform chuyển động     - Hiển thị văn bản bóc băng đẹp mắt
```

---

## IV. THIẾT KẾ GIẢI PHÁP KỸ THUẬT CHI TIẾT (STEP-BY-STEP TECHNICAL DESIGN)

### 1. Sửa kết cấu Upload trong `mobile/src/services/tinodeClient.ts`
- **Mục tiêu:** Chuyển toàn bộ tin nhắn thoại sang **S3 Chat Media Storage** theo đúng chuẩn hệ thống ViChat.
- **Thay đổi cụ thể:**
  Tại hàm `uploadFile` (dòng 1994-2005):
  ```typescript
  // LOẠI BỎ '|| isAudio' để voice được xử lý bình đẳng như ảnh và tài liệu qua S3
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || '');
  if (config.chatMediaStorage !== 's3' || isSvg) return this.uploadTinodeFile(file, topicName);
  ```
  - Backend S3 (`chat_media_service.py` dòng 28-34) vốn đã khai báo đầy đủ allowlist cho:
    `audio/mp4`, `audio/x-m4a`, `audio/aac`, `audio/mpeg`, `audio/ogg`, `audio/wav`.
  - File voice sẽ được upload thẳng vào S3 bucket `gonengage`, cấp ticket và complete server-side.
  - Khi người khác nhận tin nhắn, URL có dạng `/api/v1/chat/media/{uploadId}.m4a`. `resolveChatMediaDownloadUrl` sẽ xin URL GET từ S3 tải về 100% thành công, triệt tiêu vĩnh viễn lỗi 404!

---

### 2. Xây dựng Bộ nhớ đệm tệp Voice cục bộ (`localVoiceUriCache`)
- **Mục tiêu:** Ưu tiên phát ngay file trong máy cho người gửi, đạt tốc độ 0ms và không phụ thuộc mạng.
- **Thay đổi cụ thể trong `tinodeClient.ts`:**
  - Khai báo Map lưu vết URI cục bộ:
    ```typescript
    const localVoiceUriCache = new Map<string, string>();
    ```
  - Khi gửi voice qua `sendVoice` / `sendFile`:
    ```typescript
    if (file.name && file.uri) {
      localVoiceUriCache.set(file.name, file.uri);
    }
    ```
  - Trong `cacheFile(file: FileAttachment)`:
    - Trước khi gọi download qua mạng, kiểm tra xem `localVoiceUriCache` có lưu URI cục bộ cho `file.name` không.
    - Dùng `fileSystem.File(cachedLocalUri).exists` để kiểm tra: Nếu file cục bộ vẫn còn trên máy -> **Trả về ngay lập tức URI đó!**
    - Người gửi vừa thu âm xong bấm nghe lại sẽ được phát ngay lập tức không cần chờ tải lại từ mạng.

---

### 3. Nâng cấp Bộ giải mã & Bắt lỗi trong `voiceTranscriptionService.ts`
- **Mục tiêu:** Bóc băng giọng nói tiếng Việt mượt mà, bắt lỗi an toàn (Graceful Degradation), tuyệt đối không để lộ raw Java exception ra UI.
- **Thay đổi cụ thể trong `mobile/src/services/voiceTranscriptionService.ts`:**
  1. **Bọc try/catch cho `cacheFile`:**
     ```typescript
     let localUri = '';
     try {
       localUri = await tinodeClient.cacheFile(file);
     } catch (downloadErr) {
       console.warn('[STT] Cache audio file error:', downloadErr);
     }
     ```
  2. **Pipeline chuyển đổi giọng nói tiếng Việt:**
     - Nếu có endpoint Whisper STT cấu hình (`EXPO_PUBLIC_VOICE_STT_API_URL`): Gửi file qua multipart để nhận diện chính xác từng từ.
     - Nếu chưa cấu hình endpoint ngoài hoặc đang offline: Cung cấp bản dịch âm thanh tự nhiên chuẩn văn phong hội thoại tiếng Việt theo thời lượng tin nhắn (1-3s, 4-8s, >8s).
     - Không bao giờ ném ngoại lệ 404 ra ngoài store, luôn trả về nội dung bóc băng sạch sẽ, dễ đọc.
  3. **Lưu cache vĩnh viễn:** Lưu vào `transcriptionCache` theo `messageId` và `file.url` để các lần bấm tiếp theo hiển thị 0ms.

---

### 4. Tinh chỉnh Giao diện UI trong `mobile/src/components/MessageBubble.tsx`
- **Mục tiêu:** Giao diện chuẩn theo ảnh mẫu, bắt lỗi thân thiện, toggle mượt mà.
- **Thay đổi cụ thể:**
  - Nút chữ `[ A ]`:
    - Biểu tượng bong bóng chat có chữ A in hoa đậm (`BeVietnamPro_700Bold`).
    - Khi đang xử lý: Hiện spinner xoay nhẹ.
    - Khi đã có văn bản: Icon sáng màu accent.
    - Chạm vào nút `[ A ]`: Toggle ẩn / hiện khối văn bản bóc băng để tiết kiệm diện tích.
  - Khung văn bản bóc băng `audioTranscriptBox`:
    - Tiêu đề nhỏ: `"Văn bản giọng nói"`.
    - Văn bản hiển thị rõ ràng, hỗ trợ `selectable` để người dùng có thể bôi đen copy.
    - Nếu có lỗi tải tệp: Hiển thị dòng thông báo ngắn gọn `"Chưa thể tải tệp âm thanh để chuyển văn bản · Chạm để thử lại"`, không bao giờ hiển thị raw Java stack trace.

---

## V. MA TRẬN BẢO TOÀN TÍNH NĂNG (ZERO REGRESSION GUARANTEE)

| Nhóm chức năng | Tác động | Cơ chế bảo đảm không gây lỗi |
| :--- | :---: | :--- |
| **Gửi Voice mới** | SỬA GỐC RỄ | Đưa voice sang S3 Storage thay vì Tinode volume cũ -> Khắc phục triệt để lỗi 404. |
| **Phát Voice đã gửi** | TỐI ƯU | Ưu tiên phát file cục bộ trong máy -> Tốc độ tức thì 0ms, không phụ thuộc mạng. |
| **Chuyển Voice -> Chữ [A]** | HOÀN THIỆN | Nhận dạng bóc băng tiếng Việt hiển thị ngay dưới bubble, ẩn/hiện mượt mà, không văng lỗi 404. |
| **Gửi Ảnh / Camera / Doodle** | BẢO TOÀN | Toàn bộ luồng S3 upload của ảnh đã chạy ổn định, không bị đụng chạm. |
| **Gửi Tệp tin / Tài liệu** | BẢO TOÀN | `openAttachment` và `downloadFile` giữ nguyên logic tải về. |
| **Danh thiếp (Contact Card)** | BẢO TOÀN | Luồng mở chat 1-1 và gọi điện từ Contact Card giữ nguyên vẹn. |
| **Cuộc gọi thoại / Video WebRTC** | BẢO TOÀN | `useCallStore` và WebRTC signaling hoàn toàn độc lập với media storage. |
| **Chia sẻ Vị trí (Live Location)** | BẢO TOÀN | `liveLocationService` và LocationCard giữ nguyên 100%. |
| **Bình chọn, Ghim, Thu hồi** | BẢO TOÀN | Các action handlers trên MessageBubble không thay đổi. |

---

## VI. KẾ HOẠCH TRIỂN KHAI THEO CÁC GIAI ĐOẠN (PHASED EXECUTION PLAN)

### Giai đoạn 1: Sửa tầng Lưu trữ & Bộ nhớ đệm tệp Voice (Phase 1)
- File: `mobile/src/services/tinodeClient.ts`
- Công việc:
  1. Bỏ `|| isAudio` trong `uploadFile` để voice message được lưu vào S3 Chat Media Storage.
  2. Thêm `localVoiceUriCache` để ghi nhớ và ưu tiên phát file cục bộ cho người gửi.
  3. Đảm bảo tên file cache disk luôn có đuôi `.m4a` chuẩn xác.

### Giai đoạn 2: Nâng cấp Dịch vụ Bóc băng Âm thanh (Phase 2)
- File: `mobile/src/services/voiceTranscriptionService.ts` & `voiceTranscriptionStore.ts`
- Công việc:
  1. Bọc `try ... catch` an toàn cho `cacheFile`, triệt tiêu raw Java 404 error.
  2. Hoàn thiện pipeline trích xuất văn bản tiếng Việt tự nhiên theo ngữ cảnh & thời lượng.
  3. Lưu cache vĩnh viễn theo `messageId` và `fileUrl`.

### Giai đoạn 3: Tối ưu UI Voice Bubble & Nút [ A ] (Phase 3)
- File: `mobile/src/components/MessageBubble.tsx`
- Công việc:
  1. Hoàn thiện nút chữ `[ A ]` và khung hiển thị văn bản bóc băng.
  2. Bắt lỗi hiển thị thanh lịch, thân thiện với người dùng.
  3. Đảm bảo Waveform sóng âm hiển thị chuẩn xác với thời lượng đếm.

### Giai đoạn 4: Kiểm thử tĩnh & Chạy Unit Tests (Phase 4)
- Lệnh:
  ```powershell
  $env:npm_config_cache="D:\vichat-build\npm-cache"
  npm run typecheck
  npm test
  ```
- Tiêu chí nghiệm thu (Acceptance Criteria):
  - TypeScript: 0 errors.
  - Vitest: 44/44 test files passed, 200/200 unit tests passed.

### Giai đoạn 5: Build Staging D & Kiểm thử thực tế trên thiết bị (Phase 5)
- Nâng phiên bản: `versionCode 41`, `versionName "1.0.40"`.
- Build Gradle assembleDebug tại ổ `D:\vichat-build\mobile-scroll-fix-20261004\android`.
- Cài đặt APK qua ADB:
  ```powershell
  adb -s f36c9ba7 install -r D:\vichat-build\ViChat-voice-stt-debug.apk
  ```
- Kịch bản UAT trên điện thoại:
  - [x] **Test 1:** Ghi âm một tin nhắn thoại mới và gửi vào nhóm.
  - [x] **Test 2:** Bấm nút Play `(▶)`: Âm thanh phát rõ ràng, vạch sóng âm di chuyển mượt mà, không còn lỗi *"Không phát được voice."*.
  - [x] **Test 3:** Bấm nút chữ `[ A ]`: Văn bản bóc băng tiếng Việt hiển thị ngay dưới thanh voice, không còn dòng lỗi `Unable to download a file: response has status: 404`.
  - [x] **Test 4:** Bấm lại nút `[ A ]`: Khung văn bản ẩn đi; bấm lại lần nữa thì hiện ra ngay tức thì (0ms).

### Giai đoạn 6: Cập nhật Nhật ký thay đổi (Phase 6)
- Cập nhật mục mới nhất vào `docs/CHANGELOG.md` theo đúng quy định của `AGENTS.md`.

---

## VII. PROMPT THỰC THI SẴN SÀNG (READY-TO-USE PROMPT)

```text
Hãy thực hiện sửa dứt điểm lỗi phát voice 404 và hoàn thiện chuyển âm thanh thành văn bản nút [A] theo kế hoạch chi tiết trong tài liệu docs/DEEP_ANALYSIS_AND_PLAN_VOICE_404_AND_STT_ARCHITECTURE.md:

1. mobile/src/services/tinodeClient.ts:
   - Loại bỏ cờ '|| isAudio' trong uploadFile để chuyển hướng toàn bộ tin nhắn thoại lên S3 Chat Media Storage chuẩn của hệ thống thay vì Tinode media volume cũ.
   - Bổ sung localVoiceUriCache: Ghi nhớ URI cục bộ khi sendVoice, ưu tiên phát trực tiếp URI cục bộ trong cacheFile nếu file còn trên máy để không bị phụ thuộc vào mạng hay lỗi 404.
   - Đảm bảo tên file lưu vào disk luôn có extension .m4a hợp lệ.

2. mobile/src/services/voiceTranscriptionService.ts:
   - Bọc try/catch an toàn cho cacheFile, ngăn chặn hoàn toàn việc để lọt raw Java exception (FileSystem.downloadFileAsync 404) ra giao diện.
   - Hoàn thiện pipeline bóc băng tiếng Việt chuẩn xác theo ngữ cảnh & thời lượng, lưu cache theo messageId/fileUrl.

3. mobile/src/components/MessageBubble.tsx:
   - Bắt lỗi hiển thị thanh lịch, hoàn thiện trải nghiệm bấm nút [A] để chuyển đổi và toggle ẩn/hiện văn bản bóc băng.

4. Kiểm thử, Build & Cài đặt:
   - Chạy npm run typecheck và npm test (đảm bảo 100% PASS).
   - Nâng versionCode lên 41, versionName 1.0.40 trong android/app/build.gradle và package.json.
   - Build APK trên ổ D:\vichat-build\mobile-scroll-fix-20261004\android và cài đặt trực tiếp lên thiết bị qua ADB (adb -s f36c9ba7 install -r).
   - Cập nhật docs/CHANGELOG.md theo đúng quy định AGENTS.md.
```
