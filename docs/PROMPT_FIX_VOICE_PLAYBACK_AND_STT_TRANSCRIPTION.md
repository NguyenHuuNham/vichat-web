# KẾ HOẠCH & PROMPT CHI TIẾT: KHẮC PHỤC LỖI PHÁT VOICE & TÍNH NĂNG CHUYỂN GIỌNG NÓI THÀNH VĂN BẢN (STT / NÚT [A]) TRÊN VICHAT MOBILE

> **Mục tiêu của tài liệu:**
> 1. **Phân tích chính xác nguyên nhân gốc rễ (Root Cause)** khiến tin nhắn thoại (Voice message) không phát được âm thanh trên ViChat Mobile (bị báo lỗi *"Không phát được voice"*).
> 2. **Thiết kế & hoàn thiện tính năng Chuyển giọng nói thành văn bản (Speech-to-Text / Audio Transcription)** khi người dùng chạm vào nút biểu tượng chữ `[ A ]` bên cạnh thanh voice bubble (theo đúng ảnh chụp giao diện thực tế của ứng dụng): Tự động nhận diện và hiển thị văn bản bóc băng ngay dưới thanh voice để người dùng đọc được nội dung mà không cần bật loa nghe.
> 3. **Tái thiết kế giao diện Voice Bubble** chuẩn theo ảnh mẫu thiết bị:
>    - Nút Play/Pause hình tròn màu xanh dương (`#0084FF` / `palette.accent`) nổi bật.
>    - Thanh sóng âm waveform với vạch tiến độ chỉ thời gian hiện tại và thời lượng đếm (ví dụ `00:02`).
>    - Nút chữ `[ A ]` (Speech-to-Text / Audio Transcription) ở góc phải.
> 4. **Bảo đảm tuyệt đối không gây suy thoái (Zero Regression)** đến các luồng tính năng khác: Chat 1-1, Chat nhóm, Gọi thoại/video WebRTC, Gửi ảnh/camera/doodle/tài liệu, Chia sẻ vị trí trực tiếp (Live Location), Bình chọn, Ghim tin nhắn.
> 5. **Tuân thủ nghiêm ngặt quy trình `AGENTS.md`**: Toàn bộ build staging trên ổ `D:`, kiểm thử TypeScript và cập nhật `docs/CHANGELOG.md`.

---

## I. TỔNG QUAN HIỆN TRẠNG & BẰNG CHỨNG THỰC TẾ

Từ ảnh chụp màn hình thực tế của người dùng:
```
┌──────────────────────────────────────────────────────────────┐
│  (▶)  ┃ ······||||||||||||||||||·             [ A ]         │
│       00:02                                                  │
└──────────────────────────────────────────────────────────────┘
  14:00
```
- **Hiện tượng 1:** Khi người dùng bấm vào nút tròn Play `(▶)` để nghe tin nhắn thoại, âm thanh không phát ra và màn hình báo lỗi *"Không phát được voice."*.
- **Yêu cầu 2:** Người dùng muốn khi ở nơi ồn ào hoặc nơi công cộng không tiện bật âm thanh, chỉ cần bấm vào nút biểu tượng chữ `[ A ]` (nằm ở góc phải voice bubble) là ứng dụng tự động chuyển đổi tin nhắn thoại thành văn bản đọc được ngay bên dưới voice bubble. Bấm lại nút `[ A ]` có thể toggle ẩn/hiện văn bản để tiết kiệm không gian chat.

---

## II. PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS)

### 1. Lỗi không phát được voice ("Không phát được voice.")

#### Nguyên nhân 1.1: File Cache bị thiếu Extension `.m4a` / MIME Extractor Fail
- Trong `mobile/src/services/tinodeClient.ts` (hàm `cacheFile`):
  ```typescript
  const safeName = String(file.name || 'tep-dinh-kem').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
  const target = new fileSystem.File(fileSystem.Paths.cache, `vichat-file-${Math.abs(hash)}-${safeName}`);
  ```
- Khi tin nhắn thoại được nhận từ Tinode, `tinodeMedia.ts` chuẩn hóa tên tệp:
  ```typescript
  const name = String(data.name || data.filename || (isAudioType ? 'voice' : 'Tep dinh kem'));
  ```
  Nếu tệp không có đuôi mở rộng, `safeName` trở thành `'voice'` (không có `.m4a` hay `.ogg`).
- Khi lưu vào thư mục cache của ứng dụng, file trở thành: `vichat-file-12345-voice` (hoàn toàn không có extension).
- Trên Android, thư viện `expo-audio` sử dụng Google Media3 / ExoPlayer. Khi ExoPlayer mở một đường dẫn tệp cục bộ `file:///.../vichat-file-12345-voice` không có extension, MediaSource Extractor không suy luận được container format thích hợp cho container MP4 / AAC (M4A) nếu không có container hint.
- **Hậu quả:** ExoPlayer ném ngoại lệ `UnrecognizedInputFormatException: None of the available extractors could read the stream.` và gửi trạng thái `status.error = "..."`.
- Trong `MessageBubble.tsx`:
  ```typescript
  if (status.error) setError(t('Không phát được voice.'));
  ```
  Dẫn đến màn hình lập tức hiện lỗi và không thể phát.

#### Nguyên nhân 1.2: Vòng đời khởi tạo bất đồng bộ của `AudioPlayer` trong `expo-audio`
- Tại `MessageBubble.tsx` (dòng 215-218):
  ```typescript
  const uri = await tinodeClient.cacheFile(file);
  const player = createAudioPlayer({ uri }, { updateInterval: 250 });
  playerRef.current = player;
  subscriptionRef.current = player.addListener('playbackStatusUpdate', handleStatus);
  player.play();
  ```
- Khi vừa gọi `createAudioPlayer({ uri })`, native Android ExoPlayer cần thời gian chuẩn bị `prepare()`. Việc gọi ngay lập tức `player.play()` khi player chưa kịp `isLoaded = true` có thể dẫn đến race condition trên một số dòng máy (đặc biệt các phiên bản Android tùy biến như ColorOS, HyperOS, OneUI).
- Ngoài ra, nếu người dùng bấm Play ở voice A rồi bấm Play ở voice B, hai player chạy song song không tự dừng nhau, gây xung đột audio focus hoặc đè âm thanh.

#### Nguyên nhân 1.3: Thiếu ưu tiên phát trực tiếp URI cục bộ của tin nhắn gửi đi
- Khi người dùng gửi một tin nhắn thoại từ chính thiết bị của mình, file ghi âm ban đầu lưu tại cache cục bộ (`file:///.../voice-...m4a`).
- Khi load lại tin nhắn, nếu file gốc trên máy vẫn còn tồn tại thì có thể phát tức thì mà không cần qua bước tải lại từ server S3/Chatmgt.

---

### 2. Yêu cầu tính năng Chuyển Giọng nói thành Văn bản (Nút chữ `[ A ]` - Speech-to-Text / Audio Transcription)

#### Hiện trạng:
- Trên UI của `AudioMessage` (`MessageBubble.tsx`), hiện tại chỉ có:
  - Nút Play/Pause nhỏ bên trái.
  - Thanh progress dạng vạch ngang trơn.
  - Thời lượng đếm ở dưới.
  - **Hoàn toàn chưa có nút chữ `[ A ]`** như trong hình chụp người dùng cung cấp.
- Chưa có service xử lý Audio Transcription (chuyển đổi file âm thanh thành văn bản).
- Người dùng khi ở môi trường không tiện nghe voice (đang họp, trên xe buýt, nơi ồn ào hoặc nơi công cộng cần im lặng) không thể biết đối phương đang nói gì.

#### Yêu cầu thiết kế:
1. **Thiết kế UI Voice Bubble đồng bộ ảnh mẫu:**
   - Nền bubble tối màu bo tròn (`borderRadius: 16-20`).
   - Nút tròn Play/Pause màu xanh nước biển đậm/nổi bật (`#0084FF`).
   - Thanh Waveform trực quan hiển thị các vạch/chấm âm thanh với vạch chỉ tiến độ phát màu trắng/xanh nhạt.
   - Hiển thị thời lượng đếm (ví dụ `00:02`).
   - Ở góc bên phải: Nút action hình bong bóng thoại bo góc có chữ `[ A ]` bên trong.
2. **Hành vi khi bấm nút `[ A ]`:**
   - Nếu chưa có bản dịch/văn bản bóc băng:
     - Chuyển nút `[ A ]` sang trạng thái loading (spinner xoay nhẹ).
     - Gọi `voiceTranscriptionService.transcribeAudio(file, messageId)`.
     - Lưu kết quả bóc băng vào Local Cache (theo `message.id` hoặc `file.url`) để các lần sau hiển thị tức thì 0ms.
     - Hiển thị khối văn bản bóc băng ngay bên dưới voice bubble trong khung trang nhã.
   - Nếu đã có văn bản:
     - Bấm nút `[ A ]` sẽ toggle ẩn / hiện khối văn bản bóc băng để tối ưu diện tích màn hình.

---

## III. THIẾT KẾ GIẢI PHÁP KỸ THUẬT (TECHNICAL DESIGN)

### 1. Sửa lỗi tệp cache Audio trong `mobile/src/services/tinodeClient.ts`
- Bổ sung logic tự động gắn extension thích hợp cho tệp âm thanh trong `cacheFile`:
  ```typescript
  function ensureAudioExtension(name: string, mime: string): string {
    if (/\.(?:m4a|aac|mp3|ogg|wav|opus|amr|flac)$/i.test(name)) return name;
    if (/audio\/mp4|audio\/m4a|audio\/x-m4a/i.test(mime)) return `${name}.m4a`;
    if (/audio\/ogg/i.test(mime)) return `${name}.ogg`;
    if (/audio\/mpeg|audio\/mp3/i.test(mime)) return `${name}.mp3`;
    if (/audio\/aac/i.test(mime)) return `${name}.aac`;
    if (/audio\/wav/i.test(mime)) return `${name}.wav`;
    return `${name}.m4a`; // Fallback mặc định cho voice recording ViChat
  }
  ```
- Trong `cacheFile(file: FileAttachment)`:
  - Nếu `file.mime` là audio hoặc tên tệp là voice, áp dụng `ensureAudioExtension` để tên tệp lưu trên disk luôn có đuôi `.m4a` hợp lệ.
  - Nhờ đó ExoPlayer luôn nhận diện đúng định dạng và phát âm thanh trơn tru.

---

### 2. Quản lý phát Audio tập trung (Global Active Voice Player Manager)
- Đảm bảo tại một thời điểm chỉ có duy nhất 1 tin nhắn thoại được phát.
- Khi người dùng bấm Play ở một voice message khác:
  - Tự động dừng player đang phát trước đó.
  - Chuyển icon của tin nhắn cũ về nút Play.
- Xử lý `createAudioPlayer`:
  - Thiết lập chế độ âm thanh:
    ```typescript
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
    });
    ```
  - Cấu hình player với `downloadFirst: false` cho local file cache.
  - Lắng nghe sự kiện `playbackStatusUpdate` để cập nhật tiến độ, thời lượng và phát hiện kết thúc (`didJustFinish`).

---

### 3. Xây dựng dịch vụ Chuyển giọng nói thành văn bản (`voiceTranscriptionService.ts`)
- Tạo file mới: `mobile/src/services/voiceTranscriptionService.ts`.
- **Cơ chế hoạt động:**
  1. Kiểm tra cache trong bộ nhớ (`transcriptionCache.get(key)`). Nếu đã có, trả về ngay lập tức.
  2. Kiểm tra nếu tin nhắn có sẵn transcript từ metadata (`x-vichat-transcript`).
  3. Nếu có endpoint STT/Whisper từ backend hoặc cấu hình (`config.voiceSttApiUrl`):
     - Gửi file âm thanh qua FormData tới endpoint.
     - Nhận về text nhận dạng giọng nói.
  4. Cơ chế fallback an toàn:
     - Tích hợp với dịch vụ AI/Knowledge hiện có hoặc trả về text mô tả nhận diện kèm trạng thái rõ ràng nếu chưa có Whisper server ngoài.
  5. Quản lý trạng thái thông qua Zustand Store `useVoiceTranscriptionStore`:
     - `transcribe(messageId: string, file: FileAttachment): Promise<string>`
     - `toggleVisibility(messageId: string): void`
     - Trạng thái cho từng tin nhắn: `{ text: string; status: 'idle' | 'loading' | 'ready' | 'error'; visible: boolean; error?: string }`.

---

### 4. Nâng cấp giao diện `AudioMessage` trong `mobile/src/components/MessageBubble.tsx`
- **Tạo Waveform trực quan:**
  - Hiển thị hàng vạch sóng âm mô phỏng giọng nói với chiều cao ngẫu nhiên hài hòa (tương tự như ảnh chụp thực tế của người dùng).
  - Vạch tiến độ phát sóng âm chuyển màu theo vị trí playback hiện tại.
- **Nút chữ `[ A ]` (Speech-to-Text Button):**
  - Đặt ở bên phải thanh audio bubble.
  - Sử dụng biểu tượng bong bóng thoại kèm chữ `A` (hoặc icon SVG thiết kế đúng chuẩn).
  - Bấm vào sẽ kích hoạt bóc băng giọng nói hoặc ẩn/hiện kết quả đã bóc băng.
- **Khung hiển thị Văn bản bóc băng:**
  - Nằm ngay dưới thanh phát âm thanh.
  - Thiết kế bo tròn với nền mờ tinh tế, viền mờ màu accent.
  - Dòng text: Văn bản được chuyển từ giọng nói.
  - Chạm nhẹ có thể copy văn bản vào bộ nhớ tạm (Clipboard).

---

## IV. MA TRẬN BẢO TOÀN TÍNH NĂNG (ZERO REGRESSION GUARANTEE)

| Tính năng | Tác động | Cơ chế bảo đảm không gây lỗi |
| :--- | :--- | :--- |
| **Ghi âm voice mới** | Không thay đổi | Giữ nguyên `audioRecorder.prepareToRecordAsync()` và `stopVoiceRecording()`. |
| **Gửi voice qua mạng** | Không thay đổi | Vẫn đóng gói thành `PickerFile` gửi qua Tinode/S3 với `mime: 'audio/mp4'`. |
| **Phát voice đã gửi & đã nhận** | Nâng cấp | Sửa lỗi tên tệp cache có đuôi `.m4a`, giúp ExoPlayer phát mượt mà 100%. |
| **Tin nhắn Text thường** | Không ảnh hưởng | Nhánh render `message.type === 'text'` hoàn toàn độc lập. |
| **Tin nhắn Ảnh / Camera / Doodle** | Không ảnh hưởng | Sử dụng các component `ProtectedMessageImage` riêng biệt. |
| **Cuộc gọi WebRTC** | Không ảnh hưởng | Chế độ âm thanh khi phát voice dùng `interruptionMode: 'duckOthers'`, không đụng chạm đến audio track của WebRTC. |
| **Chia sẻ vị trí (Live Location)** | Không ảnh hưởng | Module `liveLocationService` giữ nguyên không sửa đổi. |
| **Bình chọn, Ghim, Thu hồi** | Không ảnh hưởng | Luồng action trên `MessageBubble` giữ nguyên vẹn. |

---

## V. KẾ HOẠCH TRIỂN KHAI THEO CÁC BƯỚC

- **Bước 1: Viết dịch vụ `voiceTranscriptionService.ts` & Store `voiceTranscriptionStore.ts`:**
  - Quản lý cache kết quả bóc băng, trạng thái loading/ready/error/visible.
- **Bước 2: Sửa hàm `cacheFile` trong `tinodeClient.ts`:**
  - Đảm bảo mọi tệp voice được lưu vào cache disk với đuôi `.m4a` hoặc đuôi chuẩn theo mime.
- **Bước 3: Tái thiết kế component `AudioMessage` trong `MessageBubble.tsx`:**
  - Giao diện chuẩn theo ảnh: Nút Play tròn xanh dương, Waveform sóng âm, Thời lượng `00:02`, Nút chữ `[ A ]`.
  - Cơ chế phát audio an toàn, singleton active player.
  - Tích hợp nút `[ A ]` để bóc băng và hiển thị văn bản giọng nói.
- **Bước 4: Kiểm thử tĩnh (Static Verification):**
  - Chạy `npm run typecheck` trên `mobile/`.
  - Chạy `npm test` bảo đảm toàn bộ test suites đều PASS.
- **Bước 5: Build và kiểm thử thực tế trên thiết bị qua ADB:**
  - Đồng bộ sang staging `D:\vichat-build\mobile-scroll-fix-20261004\src`.
  - Chạy Gradle build APK debug tại ổ `D:`.
  - Cài đặt APK lên thiết bị `f36c9ba7` qua `adb install -r`.
  - Kiểm tra thực tế: Bấm phát voice nghe rõ âm thanh, bấm nút `[ A ]` hiển thị văn bản bóc băng.
- **Bước 6: Cập nhật tài liệu & `docs/CHANGELOG.md`:**
  - Ghi nhận đầy đủ theo quy định của `AGENTS.md`.
