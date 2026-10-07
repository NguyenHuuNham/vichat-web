# KẾ HOẠCH & PROMPT CHI TIẾT: KHẮC PHỤC LỖI GỬI ẢNH, BỔ SUNG GỬI NHIỀU ẢNH & CAMERA, SỬA LỖI VẼ HÌNH, DANH THIẾP NHẮN TIN VÀ GỬI TÀI LIỆU (VICHAT MOBILE)

> **Mục tiêu của tài liệu:**
> 1. Phân tích chính xác nguyên nhân gốc rễ (Root Cause) của 5 vấn đề phương tiện và tính năng mở rộng trên ViChat Mobile:
>    - **Gửi ảnh:** Lỗi `"The uploaded object size is invalid."`, chưa cho phép chọn và gửi nhiều ảnh cùng lúc.
>    - **Camera:** Thiếu tính năng chụp ảnh trực tiếp từ camera để gửi vào chat.
>    - **Vẽ hình (Doodle):** Không gửi được hình vẽ tay vào cuộc trò chuyện.
>    - **Danh thiếp (Contact Card):** Gửi được nhưng khi chạm vào card không mở được cuộc trò chuyện 1-1 với người đó.
>    - **Tài liệu (Document):** Không gửi được tài liệu/tệp đính kèm.
> 2. Đưa ra giải pháp kỹ thuật triệt để, chuẩn chỉ, tối ưu trải nghiệm người dùng.
> 3. Tuyệt đối tuân thủ nguyên tắc **Zero Regression** (không làm gián đoạn hay ảnh hưởng đến các tính năng hiện có: Chia sẻ vị trí trực tiếp & tĩnh, Ghi âm voice, Cuộc gọi WebRTC, Tin nhắn nhanh, Soạn thảo văn bản, Nhắc hẹn, v.v.).
> 4. Tuân thủ nghiêm ngặt quy chế làm việc tại `AGENTS.md` (toàn bộ cache, build và staging trên ổ `D:`).

---

## I. HIỆN TRẠNG & CÁC VẤN ĐỀ CẦN XỬ LÝ

Theo phản ánh và kiểm thử thực tế trên thiết bị di động:

```
[Các lỗi phát sinh trong tương tác Media & Actions Panel ViChat Mobile]
├── 1. Gửi ảnh (Photo Gallery):
│   ├── Hiện tượng: Chọn ảnh từ thư viện bấm gửi thì bị báo lỗi "The uploaded object size is invalid." (HTTP 409).
│   └── Thiếu sót: Chỉ cho chọn duy nhất 1 ảnh mỗi lần, chưa hỗ trợ chọn và gửi nhiều ảnh một lúc (batch multi-image).
│
├── 2. Camera chụp ảnh:
│   └── Thiếu sót: Chưa có nút hoặc luồng bật Camera thiết bị để chụp ảnh gửi tức thì vào cuộc trò chuyện.
│
├── 3. Vẽ hình (Doodle):
│   └── Hiện tượng: Sau khi vẽ tay trên canvas và bấm "Gửi hình vẽ", tin nhắn không gửi được hoặc bị máy chủ từ chối.
│
├── 4. Danh thiếp (Contact Card):
│   └── Hiện tượng: Tin nhắn danh thiếp hiển thị đẹp mắt, nhưng chỉ có nút "Gọi điện", không có nút "Nhắn tin" 
│       và khi chạm vào card không tự động mở màn hình chat 1-1 với liên hệ đó.
│
└── 5. Tài liệu (Document Picker):
    └── Hiện tượng: Chọn file tài liệu (PDF, Word, Excel, ZIP...) từ bộ nhớ máy bấm gửi thì bị lỗi tương tự gửi ảnh 
        ("The uploaded object size is invalid." hoặc không upload được).
```

---

## II. PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS)

### 1. Nguyên nhân lỗi `"The uploaded object size is invalid."` khi gửi ảnh & tài liệu
- **Vị trí 1 - Client Mobile**: `mobile/src/services/chatMediaService.ts` (dòng 127 - 141 & 157 - 173):
  ```typescript
  export async function selectedFileSize(file: PickerFile) {
    const declaredSize = Number(file.size) || 0;
    if (declaredSize > 0) return declaredSize;
    ...
  }
  ```
- **Vị trí 2 - Client Mobile**: `mobile/src/screens/chat/ChatDetailScreen.tsx` (dòng 833 - 834):
  ```typescript
  const asset: any = !result.canceled ? result.assets?.[0] : null;
  if (asset) file = { uri: asset.uri, name: asset.fileName || `anh-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg', size: asset.fileSize };
  ```
- **Vị trí 3 - Backend S3 Service**: `chatservice-main/application/services/chat_media_service.py` (dòng 690 - 702):
  ```python
  actual_size = int(getattr(pending_stat, "size", 0) or 0)
  if (
      requested_size <= 0
      or requested_size != ticket_size
      or actual_size != ticket_size
      or actual_size > status["max_size"]
  ):
      raise ChatMediaError("MEDIA_UPLOAD_SIZE_MISMATCH", "The uploaded object size is invalid.", 409)
  ```
- **Cơ chế lỗi**:
  1. Khi người dùng chọn ảnh từ thư viện, Expo `ImagePicker.launchImageLibraryAsync({ quality: 0.9 })` nén ảnh và lưu file tạm vào cache directory.
  2. Tuy nhiên, thuộc tính `asset.fileSize` trả về từ hệ điều hành thường là kích thước của file gốc ban đầu trong thư viện (ví dụ 4.5 MB), trong khi file thực tế được nén và ghi trên đĩa cache chỉ là 1.2 MB.
  3. Client tin tưởng `file.size = asset.fileSize` và gửi yêu cầu tạo phiếu upload S3 (`ticket`) với `size = 4,500,000 bytes`.
  4. Client upload file thực tế từ `asset.uri` lên MinIO/S3 (chỉ có `1,200,000 bytes`).
  5. Khi gọi API `complete`, backend kiểm tra `actual_size in S3 (1.2MB) != ticket_size (4.5MB)` ➔ Backend lập tức ném ngoại lệ `The uploaded object size is invalid.` với mã lỗi HTTP 409!
  6. Đối với `DocumentPicker`, một số thiết bị trả về `asset.size` không khớp với kích thước thực tế sau khi `copyToCacheDirectory` hoàn tất.

### 2. Nguyên nhân chưa gửi được nhiều ảnh cùng lúc
- **Vị trí**: `mobile/src/screens/chat/ChatDetailScreen.tsx` (dòng 832 - 833):
  ```typescript
  const result = await ImagePicker.launchImageLibraryAsync({ 
    mediaTypes: ['images'] as any, 
    quality: 0.9, 
    allowsEditing: false 
  });
  const asset: any = !result.canceled ? result.assets?.[0] : null;
  ```
- **Hạn chế**:
  - Không truyền `allowsMultipleSelection: true`.
  - Chỉ lấy phần tử đầu tiên `result.assets?.[0]`.
  - Hàm `chooseFile` chỉ đóng gói 1 đối tượng `file` và gọi `await submitFile(file)`.

### 3. Nguyên nhân thiếu chức năng Camera
- **Vị trí**: Trong `ChatDetailScreen.tsx` và `ChatMorePanel.tsx`, chưa có nút hành động mở Camera cũng như chưa gọi `ImagePicker.launchCameraAsync`.
- Mặc dù quyền `android.permission.CAMERA` đã được khai báo trong `AndroidManifest.xml` và `expo-camera` / `expo-image-picker` đã có sẵn, giao diện chưa cung cấp điểm chạm (touchpoint) để người dùng kích hoạt Camera.

### 4. Nguyên nhân lỗi gửi vẽ hình (Doodle)
- **Vị trí 1 - Client**: `mobile/src/components/DoodleModal.tsx` (dòng 124 - 136):
  - DoodleModal tạo chuỗi SVG dạng text và lưu thành file `.svg` với MIME type `image/svg+xml`.
  - Giá trị `size: svgString.length` là độ dài chuỗi ký tự UTF-16 của JS, không phải số byte UTF-8 trên đĩa thực tế.
- **Vị trí 2 - Backend**: `chatservice-main/application/services/chat_media_service.py` (dòng 23 - 52 & 472 - 515):
  - Danh mục `UPLOAD_POLICIES` và hàm kiểm tra `_magic_matches` trong backend Chatmgt hoàn toàn **không cho phép** MIME type `image/svg+xml`.
  - Khi client yêu cầu upload S3 với `content_type: 'image/svg+xml'`, backend từ chối với lỗi loại file không hợp lệ hoặc lỗi magic byte.

### 5. Nguyên nhân danh thiếp (Contact Card) không nhắn tin được
- **Vị trí**: `mobile/src/components/MessageBubble.tsx` (dòng 402 - 438):
  - `ContactCardMessage` chỉ render thông tin Avatar, Tên, Chức danh, Số điện thoại và duy nhất 1 nút `[ Gọi điện ]` (`tel:${contact.phone}`).
  - Không có nút `[ Nhắn tin ]` (`MessageSquare`).
  - Container card là `<View>` tĩnh, không hỗ trợ sự kiện `onPress` để mở cuộc trò chuyện 1-1 với liên hệ đó.
  - Chưa truyền callback hoặc `navigation` để thực hiện `useAppStore.getState().createDirect(...)` và điều hướng sang `ChatDetail`.

---

## III. ĐẶC TẢ GIẢI PHÁP KỸ THUẬT (ARCHITECTURAL & TECHNICAL DESIGN)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           KIẾN TRÚC GIẢI PHÁP TOÀN DIỆN                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. ĐO LƯỜNG KÍCH THƯỚC FILE CHUẨN XÁC TRÊN ĐĨA (ACCURATE DISK SIZE)         │
│    • Loại bỏ việc tin tưởng mù quáng vào `asset.fileSize` hay `file.size`. │
│    • Sử dụng `expo-file-system` (`getInfoAsync` hoặc `new File(uri).size`) │
│      để đọc byte size thực tế của file trên filesystem trước khi tạo ticket.│
│    • S3 upload ticket và S3 actual object size sẽ khớp nhau 100%.          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. CHỌN & GỬI NHIỀU ẢNH (MULTI-IMAGE PICKER & BATCH UPLOAD)                │
│    • Cấu hình `allowsMultipleSelection: true`, `selectionLimit: 10`.        │
│    • Duyệt qua danh sách `result.assets`, chuẩn hoá từng ảnh và gửi tuần tự │
│      hoặc theo hàng đợi an toàn, có toast/indicator trạng thái.             │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. CAMERA CHỤP ẢNH TỨC THÌ (INSTANT CAMERA CAPTURE)                        │
│    • Thêm nút "Máy ảnh" (Camera) trong Actions Panel (Grid) hoặc composer.   │
│    • Xin quyền camera `requestCameraPermissionsAsync()`.                    │
│    • Mở `ImagePicker.launchCameraAsync({ quality: 0.9 })`.                  │
│    • Chụp xong tự động gửi ngay vào cuộc trò chuyện.                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. CHUẨN HOÁ VẼ HÌNH DOODLE (PNG/JPEG RASTERIZATION HOẶC TINODE DIRECT)     │
│    • Tính kích thước byte chính xác của file vẽ từ filesystem.              │
│    • Hỗ trợ định dạng hình ảnh chuẩn hoặc cấu hình fallback sang Tinode     │
│      Media Upload (trực tiếp qua socket/HTTP) khi S3 không hỗ trợ SVG.     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. TƯƠNG TÁC NHẮN TIN TRÊN DANH THIẾP (CONTACT CARD CLICK-TO-CHAT)          │
│    • Bổ sung nút hành động "Nhắn tin" (`[ 💬 Nhắn tin ]`) trên card.       │
│    • Hỗ trợ chạm vào cả card để tự động gọi `createDirect(contact)`         │
│      và điều hướng ngay sang `ChatDetail` của người đó.                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## IV. BẢN THIẾT KẾ CHI TIẾT THEO TỪNG FILE MÃ NGUỒN (FILE-BY-FILE BLUEPRINT)

### 1. `mobile/src/services/chatMediaService.ts`
- **Mục tiêu**: Đảm bảo `selectedFileSize` luôn đo kích thước file thực tế trên đĩa (disk bytes), giải quyết triệt để lỗi `The uploaded object size is invalid.`
- **Chi tiết sửa đổi**:
  ```typescript
  export async function selectedFileSize(file: PickerFile): Promise<number> {
    // 1. Luôn ưu tiên đọc kích thước file thực tế từ FileSystem của thiết bị
    if (Platform.OS !== 'web' && file.uri) {
      try {
        const fileSystem: any = require('expo-file-system');
        // Hỗ trợ cả API File mới và getInfoAsync truyền thống của Expo
        if (fileSystem.getInfoAsync) {
          const info = await fileSystem.getInfoAsync(file.uri, { size: true });
          if (info.exists && typeof info.size === 'number' && info.size > 0) {
            return info.size;
          }
        }
        if (fileSystem.File) {
          const localFile = new fileSystem.File(file.uri);
          const size = Number(localFile.size);
          if (size > 0) return size;
        }
      } catch {
        // Fallback tiếp tục nếu không đọc được filesystem
      }
    }

    // 2. Với Web hoặc fallback nếu filesystem không khả dụng
    if (Platform.OS === 'web' && file.uri) {
      try {
        const response = await fetch(file.uri);
        if (response.ok) {
          const blob = await response.blob();
          if (blob.size > 0) return blob.size;
        }
      } catch {
        // ignore
      }
    }

    // 3. Fallback cuối cùng mới dùng file.size khai báo
    return Number(file.size) || 0;
  }
  ```
- **Fallback an toàn**: Trong `uploadFile` của `tinodeClient.ts`, nếu `uploadChatMedia` thất bại vì lỗi kích thước hoặc định dạng S3 (`MEDIA_UPLOAD_SIZE_MISMATCH`, `MEDIA_UPLOAD_TYPE_MISMATCH`), tự động chuyển sang `uploadTinodeFile` trực tiếp để tin nhắn của người dùng không bao giờ bị nghẽn.

---

### 2. `mobile/src/screens/chat/ChatDetailScreen.tsx`
- **Mục tiêu**: 
  1. Hỗ trợ chọn và gửi **nhiều ảnh cùng lúc**.
  2. Bổ sung tính năng **Chụp ảnh bằng Camera**.
  3. Bổ sung hỗ trợ mở cuộc trò chuyện khi chạm vào Danh thiếp.
- **Chi tiết sửa đổi**:
  - **Hỗ trợ gửi nhiều ảnh cùng lúc trong `chooseFile`**:
    ```typescript
    const chooseImages = async () => {
      try {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          throw new Error('ViChat cần quyền truy cập ảnh để gửi hình từ thư viện.');
        }
        beginTrustedExternalActivity();
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'] as any,
          allowsMultipleSelection: true,
          selectionLimit: 10,
          quality: 0.9,
          allowsEditing: false,
        });
        if (result.canceled || !result.assets?.length) return;

        // Gửi tuần tự tất cả các ảnh đã chọn
        for (const asset of result.assets) {
          const file: PickerFile = {
            uri: asset.uri,
            name: asset.fileName || `anh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`,
            type: asset.mimeType || 'image/jpeg',
            size: asset.fileSize,
          };
          await submitFile(file);
        }
      } catch (valueError) {
        setError(valueError instanceof Error ? t(valueError.message) : t('Không gửi được ảnh.'));
      }
    };
    ```
  - **Thêm tính năng Chụp ảnh bằng Camera (`captureCameraPhoto`)**:
    ```typescript
    const captureCameraPhoto = async () => {
      try {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          throw new Error('ViChat cần quyền sử dụng máy ảnh để chụp ảnh.');
        }
        beginTrustedExternalActivity();
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'] as any,
          quality: 0.9,
          allowsEditing: false,
        });
        if (result.canceled || !result.assets?.length) return;

        const asset = result.assets[0];
        const file: PickerFile = {
          uri: asset.uri,
          name: asset.fileName || `camera-${Date.now()}.jpg`,
          type: asset.mimeType || 'image/jpeg',
          size: asset.fileSize,
        };
        await submitFile(file);
      } catch (valueError) {
        setError(valueError instanceof Error ? t(valueError.message) : t('Không chụp được ảnh.'));
      }
    };
    ```
  - **Xử lý tài liệu (`chooseDocument`)**:
    ```typescript
    const chooseDocument = async () => {
      try {
        beginTrustedExternalActivity();
        const result = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          copyToCacheDirectory: true,
          multiple: true,
        });
        if (result.canceled || !result.assets?.length) return;

        for (const asset of result.assets) {
          const file: PickerFile = {
            uri: asset.uri,
            name: asset.name || 'tep-dinh-kem',
            type: asset.mimeType || 'application/octet-stream',
            size: asset.size,
          };
          await submitFile(file);
        }
      } catch (valueError) {
        setError(valueError instanceof Error ? t(valueError.message) : t('Không gửi được tệp.'));
      }
    };
    ```
  - **Xử lý điều hướng nhắn tin từ Danh thiếp**:
    ```typescript
    const handleOpenContactChat = async (contact: ContactCardAttachment) => {
      if (!contact.userId) return;
      try {
        setBusy(true);
        const targetUser: Partial<User> = {
          id: contact.userId,
          name: contact.name,
          avatar: contact.avatar,
        };
        const conv = await useAppStore.getState().createDirect(targetUser);
        if (conv?.id && conv.id !== conversation.id) {
          navigation.navigate('ChatDetail', { conversationId: conv.id });
        }
      } catch (err) {
        setError(t('Không thể mở cuộc trò chuyện với liên hệ này.'));
      } finally {
        setBusy(false);
      }
    };
    ```

---

### 3. `mobile/src/components/ChatMorePanel.tsx`
- **Mục tiêu**: Bổ sung icon **Máy ảnh (Camera)** vào Actions Panel 3 chấm để người dùng thao tác trực quan.
- **Chi tiết sửa đổi**:
  - Bổ sung prop `onSelectCamera: () => void`.
  - Thêm icon `Camera` từ `lucide-react-native` với màu nền nhận diện (`#2ED573` hoặc `#10B981` xanh lá hiện đại).
  - Bố trí danh sách action hài hoà trong layout Grid:
    - Hàng 1: **Vị trí** (`#F25C54`), **Máy ảnh** (`#2ED573`), **Tài liệu** (`#4A6CF7`), **Nhắc hẹn** (`#E84393`).
    - Hàng 2: **Tin nhắn nhanh** (`#0984E3`), **Danh thiếp** (`#00CEC9`), **@GIF** (`#0068FF`), **Vẽ hình** (`#E056FD`), **Kiểu chữ** (`#F39C12`).

---

### 4. `mobile/src/components/DoodleModal.tsx`
- **Mục tiêu**: Khắc phục lỗi không gửi được hình vẽ tay.
- **Chi tiết sửa đổi**:
  - Đảm bảo tính toán chính xác kích thước file trên đĩa sau khi ghi:
    ```typescript
    const fileSystem: any = require('expo-file-system');
    const filename = `doodle-${Date.now()}.svg`;
    const fileUri = `${fileSystem.cacheDirectory || ''}${filename}`;
    await fileSystem.writeAsStringAsync(fileUri, svgString, {
      encoding: fileSystem.EncodingType ? fileSystem.EncodingType.UTF8 : 'utf8',
    });
    
    let fileSize = 0;
    try {
      const info = await fileSystem.getInfoAsync(fileUri, { size: true });
      fileSize = info.size || 0;
    } catch {
      fileSize = new TextEncoder().encode(svgString).length;
    }
    
    const file: PickerFile = {
      uri: fileUri,
      name: filename,
      type: 'image/svg+xml',
      size: fileSize,
    };
    onSend(file);
    ```
  - Trong `tinodeClient.ts`, khi gặp file `.svg` hoặc `image/svg+xml`, nếu Chatmgt S3 không hỗ trợ thì tự động upload thẳng qua `uploadTinodeFile` để đảm bảo file luôn gửi thành công 100%.

---

### 5. `mobile/src/components/MessageBubble.tsx`
- **Mục tiêu**: Hoàn thiện tương tác trên Danh thiếp (Contact Card), bổ sung nút "Nhắn tin" và sự kiện chạm mở chat.
- **Chi tiết sửa đổi**:
  - Bổ sung prop `onOpenContactChat?: (contact: ContactCardAttachment) => void` cho `MessageBubble` và `ContactCardMessage`.
  - Cập nhật giao diện `ContactCardMessage`:
    ```tsx
    <Pressable 
      onPress={() => onOpenContactChat?.(contact)}
      style={[styles.contactCard, outgoing && styles.contactCardOutgoing]}
    >
      <View style={styles.contactCardHeader}>
        <Avatar name={contact.name} uri={contact.avatar} size={44} rounded />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text numberOfLines={1} style={[styles.contactCardName, outgoing && styles.outgoingText]}>
            {contact.name}
          </Text>
          <Text numberOfLines={1} style={[styles.contactCardSub, outgoing && styles.outgoingSub]}>
            {[contact.title, contact.department].filter(Boolean).join(' · ') || t('Danh thiếp')}
          </Text>
          {contact.phone ? (
            <Text numberOfLines={1} style={[styles.contactCardPhone, outgoing && styles.outgoingSub]}>
              {contact.phone}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.contactCardActionRow}>
        {contact.userId ? (
          <Pressable 
            onPress={() => onOpenContactChat?.(contact)} 
            style={[styles.contactCardActionBtn, outgoing && styles.contactCardActionBtnOutgoing]}
          >
            <MessageSquare color={outgoing ? '#FFFFFF' : palette.accent} size={15} />
            <Text style={[styles.contactCardActionText, outgoing && styles.contactCardActionTextOutgoing]}>
              {t('Nhắn tin')}
            </Text>
          </Pressable>
        ) : null}

        {contact.phone ? (
          <Pressable 
            onPress={handleCall} 
            style={[styles.contactCardActionBtn, outgoing && styles.contactCardActionBtnOutgoing]}
          >
            <Phone color={outgoing ? '#FFFFFF' : palette.accent} size={15} />
            <Text style={[styles.contactCardActionText, outgoing && styles.contactCardActionTextOutgoing]}>
              {t('Gọi điện')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
    ```

---

## V. NGUYÊN TẮC BẢO VỆ ZERO-REGRESSION (CHỐNG LỖI LUỒNG)

1. **Bảo tồn tính năng Vị trí (Live & Static Location):**
   - Giữ nguyên toàn bộ `LocationPickerModal`, `liveLocationService`, Leaflet OSM WebView và `__VICHAT_LIVE_LOCATION_EVENT__:`.
2. **Bảo tồn tính năng Ghi âm Voice:**
   - Cơ chế `beginTrustedExternalActivity()` và `endTrustedExternalActivity()` phải tiếp tục được gọi khi mở Camera, Thư viện ảnh, và File Picker để không làm trigger gián đoạn realtime socket.
3. **Bảo tồn Cuộc gọi WebRTC & Nhóm chat:**
   - Không thay đổi bất kỳ logic báo hiệu cuộc gọi hay phân quyền thành viên nhóm nào.
4. **Cô lập phần hệ Mobile:**
   - Chỉ chỉnh sửa trong phạm vi `mobile/**`, tuyệt đối không tác động đến Web (`src/**`) hay backend trừ khi cần hỗ trợ MIME type cho S3.

---

## VI. KẾ HOẠCH KIỂM THỬ & TIÊU CHÍ CHẤP THUẬN (TESTING & VERIFICATION)

### 1. Kiểm thử tĩnh (Static Verification)
```powershell
# Chạy linter
npm run lint

# Kiểm tra kiểu dữ liệu TypeScript
npm run typecheck

# Chạy toàn bộ 43 test suite unit tests
npm test
```
*Tiêu chí:* 0 errors, 0 warnings, 100% unit tests passed.

### 2. Kiểm thử thực tế trên thiết bị qua ADB
1. **Kiểm tra Gửi nhiều ảnh:**
   - Mở thư viện, chọn cùng lúc 3 ảnh, bấm chọn ➔ Cả 3 bong bóng ảnh phải được gửi vào chat và hiển thị đúng thumbnail.
2. **Kiểm tra Camera:**
   - Bấm nút Máy ảnh, chụp 1 bức ảnh thực tế, bấm xác nhận ➔ Ảnh chụp được gửi ngay lập tức vào cuộc trò chuyện mà không báo lỗi size.
3. **Kiểm tra Gửi tài liệu:**
   - Chọn file PDF hoặc Excel từ máy ➔ File gửi thành công, hiển thị card tài liệu kèm tên file và dung lượng chuẩn.
4. **Kiểm tra Vẽ hình:**
   - Mở Vẽ hình, vẽ một nét bất kỳ, bấm "Gửi hình vẽ" ➔ Bong bóng hình vẽ xuất hiện trong chat.
5. **Kiểm tra Danh thiếp:**
   - Mở tin nhắn danh thiếp đã gửi, bấm vào nút "Nhắn tin" ➔ Ứng dụng tự động điều hướng sang cuộc trò chuyện 1-1 với người trong danh thiếp.

---

## VII. HƯỚNG DẪN THỰC THI & BUILD APK TRÊN Ổ D: (TUÂN THỦ AGENTS.MD)

1. Thiết lập biến môi trường trỏ toàn bộ về `D:\vichat-build`:
   ```powershell
   $env:GRADLE_USER_HOME="D:\vichat-build\gradle-user-home"
   $env:TEMP="D:\vichat-build\tmp"
   $env:TMP="D:\vichat-build\tmp"
   $env:ANDROID_HOME="D:\vichat-build\android-sdk"
   $env:ANDROID_SDK_ROOT="D:\vichat-build\android-sdk"
   $env:JAVA_HOME="D:\vichat-build\jdk"
   $env:npm_config_cache="D:\vichat-build\npm-cache"
   $env:npm_config_prefix="D:\vichat-build\npm-global"
   ```
2. Đồng bộ mã nguồn từ workspace sang staging:
   ```powershell
   robocopy D:\CÔNG_VIỆC\vichat-web\mobile\src D:\vichat-build\mobile-scroll-fix-20261004\src /MIR /NFL /NDL /NJH /NJS
   ```
3. Đóng gói APK Debug:
   ```powershell
   & "D:\vichat-build\mobile-scroll-fix-20261004\android\gradlew.bat" -p "D:\vichat-build\mobile-scroll-fix-20261004\android" :app:assembleDebug -x lint -x test --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a
   ```
4. Cài đặt và xác minh trên thiết bị:
   ```powershell
   adb install -r D:\vichat-build\ViChat-location-debug.apk
   adb shell am force-stop vn.upgo.vichat
   adb shell am start -W -n vn.upgo.vichat/.MainActivity
   ```
5. Cập nhật nhật ký thay đổi trong `docs/CHANGELOG.md` theo quy định.
