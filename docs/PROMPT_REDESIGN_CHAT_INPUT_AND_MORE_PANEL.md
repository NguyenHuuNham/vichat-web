# TÀI LIỆU ĐẶC TẢ KỸ THUẬT & PROMPT THI CÔNG: THIẾT KẾ LẠI THANH NHẬP CHAT VÀ PHÁT TRIỂN ACTIONS PANEL 3 CHẤM (VICHAT MOBILE)

> **Mục tiêu chính:**
> 1. **Gọn gàng hoá thanh nhập tin nhắn (Chat Input Bar)** theo đúng thiết kế Ảnh 1: Di chuyển các nút phụ rườm rà vào menu tiện ích, trả lại không gian tối đa cho ô nhập văn bản.
> 2. **Xây dựng Actions Panel (Menu 3 chấm)** bật từ nút `···` theo đúng bố cục lưới 4 cột x 2 hàng của Ảnh 2, bao gồm đầy đủ 8 tính năng: **Vị trí, Tài liệu, Nhắc hẹn, Tin nhắn nhanh, Danh thiếp, @GIF, Vẽ hình, Kiểu chữ** (cùng tính năng **Bình chọn** cho nhóm).
> 3. **Đảm bảo 100% các tính năng đều hoạt động thực tế (Fully Functional)**, có luồng dữ liệu, lưu trữ, xử lý quyền và render bong bóng tin nhắn tương ứng trong `MessageBubble.tsx`.
> 4. **Nguyên tắc Zero Regression:** Tuyệt đối không làm gián đoạn luồng ghi âm Voice, gửi Ảnh chụp/Thư viện, Gõ @mention, Trả lời (Reply), Sửa tin nhắn (Edit), Thu hồi, hay Realtime WebSocket.
> 5. **Tuân thủ quy chuẩn ổ D:** Mọi build/cache theo đúng `AGENTS.md`.

---

## I. HIỆN TRẠNG & PHÂN TÍCH SO SÁNH GIAO DIỆN

### 1. Hiện trạng thanh nhập chat hiện tại (`mobile/src/screens/chat/ChatDetailScreen.tsx`)
Hiện tại, cụm nút đính kèm nằm dàn hàng ngang bên trái ô `TextInput`:
```
[ Cụm nút đính kèm bên trái: Mic | Ảnh | Tệp | Sticker | Bình chọn ] [ Ô TextInput bị bẹp ] [ Gửi ]
```
- **Nhược điểm lớn:**
  - Chiếm hơn 45% chiều ngang màn hình điện thoại.
  - Ô `TextInput` bị bóp nghẹt chỉ còn 1 dòng ngắn ngủn, khi người dùng gõ văn bản hoặc nhắn tin dài rất khó quan sát.
  - Nhìn rối mắt, không đạt tiêu chuẩn trải nghiệm thanh thoát của các ứng dụng chat hàng đầu (Zalo, Telegram, iMessage).

---

### 2. Thiết kế mới mong muốn (Theo Ảnh 1 & Ảnh 2 thực tế)

#### A. Thanh nhập tin nhắn ở trạng thái thu gọn (Ảnh 1):
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  😊   ┌─────────────────────────────────────────────── ··· ┐   🎙️A     🖼️   │
│ (Icon)│  Tin nhắn...                           (Nút 3 chấm)│ (Voice) (Ảnh)  │
│       └────────────────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────────────────┘
```
- **Bên ngoài bên trái:** Nút Sticker / Emoji (icon mặt cười lé lưỡi ngộ nghĩnh).
- **Ở giữa:** Ô nhập `TextInput` dáng viên thuốc (Pill-shaped) viền mềm mại, nền canvas nhẹ nhàng, placeholder `"Tin nhắn"`.
- **Góc phải bên trong ô nhập:** Nút ba chấm `···` (`MoreHorizontal`). Khi chưa mở thì có màu xám nhẹ, khi mở panel thì đổi sang màu xanh accent rực rỡ (`#0084FF`).
- **Bên ngoài bên phải:**
  - Nút Thu âm Voice / Nhập giọng nói (`Mic`).
  - Nút Chọn ảnh từ thư viện (`ImageIcon`).
  - Khi người dùng gõ văn bản (`text.trim().length > 0`): Nút Send (`Send`) màu xanh xuất hiện mượt mà để gửi tin nhắn.

#### B. Actions Panel khi chạm nút `···` (Ảnh 2):
Bàn phím tự động ẩn xuống, bên dưới hiện ra Actions Drawer dạng Grid 4 cột x 2 hàng với các icon tròn nền màu sinh động:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  😊   ┌─────────────────────────────────────────────── [···] ┐   🎙️A    🖼️   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│     ( 📍 )            ( 📎 )            ( ⏰ )            ( ⚡ )           │
│     Vị trí           Tài liệu          Nhắc hẹn       Tin nhắn nhanh       │
│  [Đỏ cam #F25C54]  [Xanh #4A6CF7]   [Hồng #E84393]    [Xanh #0984E3]        │
│                                                                             │
│     ( 🪪 )            ( GIF )           ( 🎨 )            ( Aa )           │
│    Danh thiếp          @GIF             Vẽ hình          Kiểu chữ          │
│  [Cyan #00CEC9]    [Xanh #0068FF]   [Tím #E056FD]    [Vàng #F39C12]        │
│                                                                             │
│  *(Nếu là Nhóm chat: Thêm mục Bình chọn (Poll) [Tím #6C5CE7] vào danh sách)*│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## II. ĐẶC TẢ CHI TIẾT 8+ TÍNH NĂNG MỞ RỘNG (MỤC 3 CHẤM)

Tất cả các tính năng dưới đây **phải hoạt động thực tế**, có flow hoàn chỉnh từ lúc chọn/nhập cho đến khi phát sinh tin nhắn trong cuộc trò chuyện:

| STT | Tên mục | Icon & Màu chủ đạo | Hành vi khi bấm vào (Interaction Flow) | Data Model & Render trong phòng chat |
| :-- | :--- | :--- | :--- | :--- |
| **1** | **Vị trí** | `MapPin` tròn đỏ cam (`#F25C54`) | Mở màn hình Vị trí chuẩn gồm Bản đồ nửa trên và Bottom Sheet nửa dưới. Có 2 chế độ: **1. Chia sẻ hành trình trực tiếp** (Live tracking 15p, 30p, 1h, 8h) & **2. Gửi địa điểm cụ thể** (Vị trí hiện tại với độ chính xác mét + Danh sách POI lân cận). | Gửi tin nhắn Vị trí: Live Card (có avatar di chuyển realtime, đếm ngược thời gian, nút Dừng chia sẻ) hoặc Static Card (ảnh map, địa chỉ, nút mở Google Maps). |
| **2** | **Tài liệu** | `Paperclip` tròn xanh dương (`#4A6CF7`) | Mở `DocumentPicker.getDocumentAsync` hỗ trợ file PDF, Word, Excel, PowerPoint, ZIP, TXT. | Gửi file đính kèm với tên file, dung lượng, định dạng và nút tải xuống/mở xem trực tiếp. |
| **3** | **Nhắc hẹn** | `AlarmClock` tròn hồng đỏ (`#E84393`) | Mở modal tạo lịch hẹn / nhắc việc (`GroupEventComposer` / ReminderModal): Nhập tiêu đề, ngày, giờ, ghi chú, thời gian nhắc trước (15p, 30p, 1h). | Gửi thẻ Sự kiện / Nhắc hẹn vào phòng chat, có nút "Thêm vào lịch" hoặc "Nhắc tôi". |
| **4** | **Tin nhắn nhanh** | `Zap` tròn xanh biển (`#0984E3`) | Mở danh sách các câu trả lời mẫu (Lưu trữ `AsyncStorage`). Cho phép tạo thêm câu mới, chỉnh sửa, xóa. Bấm vào câu nào là chèn vào ô nhập hoặc gửi ngay. | Tin nhắn dạng văn bản chuẩn, giúp phản hồi công việc tức thì trong 1 giây. |
| **5** | **Danh thiếp** | `Contact` / `UserCheck` tròn cyan (`#00CEC9`) | Mở modal danh sách đồng nghiệp / danh bạ (`ContactPickerModal`). Người dùng tìm kiếm và chọn 1 người để chia sẻ. | Gửi card danh thiếp (VCard): Tên, Avatar, Chức vụ, Email/SĐT, kèm nút "Nhắn tin" hoặc "Xem trang cá nhân". |
| **6** | **@GIF** | `Film` / Chữ GIF tròn xanh (`#0068FF`) | Mở panel tìm kiếm ảnh động GIF (kho Tenor/Giphy trending & search keyword). Chạm chọn GIF để gửi. | Tin nhắn dạng hình ảnh động GIF tự động loop mượt mà trong khung chat. |
| **7** | **Vẽ hình** | `Spline` / `PenTool` tròn tím (`#E056FD`) | Mở modal bảng vẽ tay nguệch ngoạc (`DoodleModal`): Chọn màu bút, nét cọ, tẩy, hoàn tác (Undo), xóa hết. Bấm **"Gửi hình vẽ"**. | Xuất nét vẽ ra hình ảnh (PNG/JPEG) gửi vào tin nhắn như một bức vẽ tay trực quan. |
| **8** | **Kiểu chữ** | `Type` / `Aa` tròn vàng cam (`#F39C12`) | Mở thanh công cụ định dạng chữ nhanh: **Đậm**, *Nghiêng*, ~~Gạch ngang~~, `Mã code`, > Trích dẫn, Tiêu đề lớn. Tự động wrap chữ đang chọn trong ô text. | Hỗ trợ soạn thảo Markdown trực quan ngay trên bàn phím điện thoại. |
| **+** | **Bình chọn** | `BarChart3` tròn tím pastel (`#6C5CE7`) | *(Áp dụng khi đang ở trong Nhóm)* Mở `PollComposer` để tạo cuộc thăm dò ý kiến nhiều lựa chọn. | Render khối bình chọn tương tác realtime đã có sẵn. |

---

## III. KIẾN TRÚC PHẦN MỀM & DANH MỤC FILE CẦN TẠO / SỬA ĐỔI

### 1. File cần tạo mới:
1. `mobile/src/components/ChatMorePanel.tsx`:
   - Component hiển thị lưới Grid 4 cột x 2 hàng với animation mở/đóng mượt mà.
   - Quản lý kích hoạt các tính năng tương ứng.
2. `mobile/src/components/QuickMessagesModal.tsx`:
   - Quản lý danh sách tin nhắn mẫu, lưu cache offline vào `@vichat_quick_messages`.
   - Có sẵn các mẫu câu công việc chuyên nghiệp (Ví dụ: *"Tôi đang bận cuộc họp, sẽ liên hệ lại sau"*, *"Đã nhận được thông tin, tôi sẽ xử lý ngay"*, v.v.).
3. `mobile/src/components/ContactPickerModal.tsx`:
   - Cho phép tìm kiếm và chọn thành viên trong tổ chức / danh bạ để gửi danh thiếp.
4. `mobile/src/components/DoodleModal.tsx`:
   - Bảng vẽ tay doodle canvas với `PanResponder` và `react-native-svg` (hoặc capture view), xuất ảnh PNG gửi trực tiếp.
5. `mobile/src/components/LocationPickerModal.tsx`:
   - Modal định vị GPS hiện tại hoặc chọn toạ độ gửi qua chat.
6. `mobile/src/components/GifPickerModal.tsx`:
   - Modal tìm kiếm và chọn ảnh động GIF (kho Tenor/Giphy).
7. `mobile/src/components/TextFormatBar.tsx`:
   - Thanh công cụ định dạng chữ nhanh (Bold, Italic, Strikethrough, Code, Quote, List).

### 2. File cần cập nhật:
1. `mobile/src/types/index.ts`:
   - Bổ sung các kiểu dữ liệu cho tin nhắn:
     ```typescript
     export interface LocationAttachment {
       latitude: number;
       longitude: number;
       address?: string;
       title?: string;
       previewUrl?: string;
     }

     export interface ContactCardAttachment {
       userId: string;
       name: string;
       avatar?: string;
       title?: string;
       department?: string;
       phone?: string;
       email?: string;
     }

     export interface ChatMessage {
       // ... các trường hiện có
       location?: LocationAttachment;
       contactCard?: ContactCardAttachment;
     }
     ```
2. `mobile/src/screens/chat/ChatDetailScreen.tsx`:
   - Tái cấu trúc lại `styles.composer`:
     * Loại bỏ `attachGroup` cồng kềnh nằm chắn bên trái.
     * Thêm nút Sticker ngoài cùng bên trái.
     * Bọc `TextInput` và nút `···` vào cùng một container viên thuốc sang trọng.
     * Cụm nút phải: Nút Mic, Nút Ảnh (chuyển sang nút Send màu xanh khi có text).
   - Quản lý state `morePanelOpen`:
     * Khi bấm `···`: Đóng bàn phím (`Keyboard.dismiss()`), mở `morePanelOpen = true`.
     * Khi chạm vào ô input để gõ: Tự động đóng `morePanelOpen = false` để bàn phím đẩy lên.
     * Khi bấm lại `···`: Toggle đóng/mở panel.
3. `mobile/src/components/MessageBubble.tsx`:
   - Thêm giao diện hiển thị cho:
     * **Bong bóng Vị trí:** Thẻ bản đồ có pin đỏ, địa chỉ, bấm vào gọi `Linking.openURL` mở Google Maps / Apple Maps.
     * **Bong bóng Danh thiếp:** Thẻ danh thiếp bo tròn viền xịn xò, avatar, tên, chức danh, nút "Nhắn tin" (chuyển phòng chat đến người đó).

---

## IV. ĐẶC TẢ IMPLEMENTATION CHI TIẾT TỪNG COMPONENT

### 1. Tái cấu trúc Thanh nhập liệu trong `ChatDetailScreen.tsx`

```tsx
{/* THANH NHẬP LIỆU GỌN GÀNG THEO CHUẨN ẢNH 1 */}
<View style={styles.composerBar}>
  {/* 1. Nút Sticker / Mặt cười bên trái */}
  <Pressable
    accessibilityLabel={t('Chọn sticker biểu cảm')}
    onPress={() => {
      setMorePanelOpen(false);
      setStickerPickerOpen(true);
    }}
    disabled={busy || recording || Boolean(editingMessage) || !canSendMessages}
    style={styles.composerIconButton}
  >
    <Smile color={palette.inkSoft} size={26} strokeWidth={1.8} />
  </Pressable>

  {/* 2. Khung nhập tin nhắn (Pill Container) chứa TextInput và nút 3 chấm */}
  <View style={styles.inputPillContainer}>
    <TextInput
      ref={inputRef}
      value={text}
      onChangeText={updateComposerText}
      onFocus={() => setMorePanelOpen(false)}
      onSelectionChange={event => {
        const caret = Number(event.nativeEvent.selection?.start || 0);
        setSelectionRange(event.nativeEvent.selection);
        setMentionContext(!editingMessage && conversation.isGroup ? getMentionContext(composerTextRef.current, caret) : null);
      }}
      placeholder={editingMessage ? t('Nhập nội dung mới...') : conversation.isChatbot ? t('Hỏi ViChat AI...') : t('Tin nhắn')}
      placeholderTextColor={palette.muted}
      multiline
      maxLength={120000}
      style={styles.pillInput}
      editable={!busy && !recording && canSendMessages}
    />

    {/* Nút 3 chấm bên trong mép phải của ô nhập */}
    <Pressable
      accessibilityLabel={t('Chức năng mở rộng')}
      onPress={() => {
        Keyboard.dismiss();
        setMorePanelOpen(current => !current);
      }}
      style={[styles.moreDotsButton, morePanelOpen && styles.moreDotsButtonActive]}
    >
      <MoreHorizontal color={morePanelOpen ? palette.accent : palette.inkSoft} size={22} strokeWidth={2.2} />
    </Pressable>
  </View>

  {/* 3. Cụm nút bên phải ngoài ô nhập */}
  {text.trim().length > 0 ? (
    /* Có văn bản -> Hiện nút Gửi Send màu xanh nổi bật */
    <Pressable
      onPress={() => void submitText()}
      disabled={busy || recording || !canSendMessages}
      style={styles.sendButtonPrimary}
      accessibilityLabel={t('Gửi tin nhắn')}
    >
      <Send color="#fff" size={19} />
    </Pressable>
  ) : (
    /* Trống văn bản -> Hiện nút Mic và nút Ảnh như Ảnh 1 */
    <View style={styles.rightActionGroup}>
      <Pressable
        accessibilityLabel={recording ? t('Dừng ghi âm') : t('Ghi âm giọng nói')}
        onPress={() => void (recording ? stopVoiceRecording() : startVoiceRecording())}
        disabled={(busy && !recording) || Boolean(editingMessage) || (!recording && !canSendMessages)}
        style={[styles.composerIconButton, recording && styles.iconRecordingActive]}
      >
        {recording ? <CircleStop color={palette.danger} size={24} /> : <MicWithLetterA color={palette.inkSoft} size={24} />}
      </Pressable>

      <Pressable
        accessibilityLabel={t('Chọn ảnh từ thư viện')}
        onPress={() => void chooseFile(true)}
        disabled={busy || recording || Boolean(editingMessage) || !canSendMessages}
        style={styles.composerIconButton}
      >
        <ImageLucide color={palette.inkSoft} size={24} strokeWidth={1.8} />
      </Pressable>
    </View>
  )}
</View>

{/* ACTIONS PANEL 3 CHẤM (MỞ RA KHI BẤM NÚT 3 CHẤM) */}
{morePanelOpen ? (
  <ChatMorePanel
    isGroup={conversation.isGroup}
    onSelectLocation={() => setLocationModalOpen(true)}
    onSelectDocument={() => void chooseFile(false)}
    onSelectReminder={() => setEventModalOpen(true)}
    onSelectQuickMessages={() => setQuickMessagesModalOpen(true)}
    onSelectContact={() => setContactModalOpen(true)}
    onSelectGif={() => setGifModalOpen(true)}
    onSelectDoodle={() => setDoodleModalOpen(true)}
    onSelectTextStyle={() => setTextFormatBarOpen(current => !current)}
    onSelectPoll={() => setPollComposerOpen(true)}
    onClose={() => setMorePanelOpen(false)}
  />
) : null}
```

---

### 2. Thiết kế Actions Panel (`ChatMorePanel.tsx`) theo chuẩn Ảnh 2

Panel chứa danh sách các tính năng được dàn trải theo Grid 4 cột:
```tsx
export interface MoreActionItem {
  id: string;
  title: string;
  icon: any;
  bgColor: string;
  iconColor: string;
  onPress: () => void;
  groupOnly?: boolean;
}

export function ChatMorePanel({ ...props }: Props) {
  const { t } = useI18n();
  const palette = useThemePalette();

  const ACTIONS: MoreActionItem[] = [
    {
      id: 'location',
      title: t('Vị trí'),
      icon: MapPin,
      bgColor: '#F25C54',
      iconColor: '#FFFFFF',
      onPress: props.onSelectLocation,
    },
    {
      id: 'document',
      title: t('Tài liệu'),
      icon: Paperclip,
      bgColor: '#4A6CF7',
      iconColor: '#FFFFFF',
      onPress: props.onSelectDocument,
    },
    {
      id: 'reminder',
      title: t('Nhắc hẹn'),
      icon: AlarmClock,
      bgColor: '#E84393',
      iconColor: '#FFFFFF',
      onPress: props.onSelectReminder,
    },
    {
      id: 'quick_message',
      title: t('Tin nhắn nhanh'),
      icon: Zap,
      bgColor: '#0984E3',
      iconColor: '#FFFFFF',
      onPress: props.onSelectQuickMessages,
    },
    {
      id: 'contact',
      title: t('Danh thiếp'),
      icon: Contact,
      bgColor: '#00CEC9',
      iconColor: '#FFFFFF',
      onPress: props.onSelectContact,
    },
    {
      id: 'gif',
      title: t('@GIF'),
      icon: Film, // Hoặc SVG chữ GIF
      bgColor: '#0068FF',
      iconColor: '#FFFFFF',
      onPress: props.onSelectGif,
    },
    {
      id: 'doodle',
      title: t('Vẽ hình'),
      icon: Spline,
      bgColor: '#E056FD',
      iconColor: '#FFFFFF',
      onPress: props.onSelectDoodle,
    },
    {
      id: 'text_style',
      title: t('Kiểu chữ'),
      icon: Type,
      bgColor: '#F39C12',
      iconColor: '#FFFFFF',
      onPress: props.onSelectTextStyle,
    },
  ];

  // Nếu là nhóm chat, bổ sung mục Bình chọn (Poll)
  if (props.isGroup) {
    ACTIONS.push({
      id: 'poll',
      title: t('Bình chọn'),
      icon: BarChart3,
      bgColor: '#6C5CE7',
      iconColor: '#FFFFFF',
      onPress: props.onSelectPoll,
    });
  }

  return (
    <View style={styles.panelContainer}>
      <View style={styles.grid}>
        {ACTIONS.map(item => (
          <Pressable
            key={item.id}
            onPress={item.onPress}
            style={({ pressed }) => [styles.gridItem, pressed && styles.gridItemPressed]}
          >
            <View style={[styles.iconCircle, { backgroundColor: item.bgColor }]}>
              <item.icon color={item.iconColor} size={26} strokeWidth={2} />
            </View>
            <Text numberOfLines={1} style={styles.itemTitle}>{item.title}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
```

---

### 3. Logic Hoạt Động của 8 Tính Năng Cốt Lõi

#### 📍 1. Vị trí (`LocationPickerModal.tsx`):
- Khi chọn mục "Vị trí", app kích hoạt `Location.requestForegroundPermissionsAsync()`.
- Lấy tọa độ hiện tại `Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })`.
- Hiển thị bản đồ mini hoặc preview tọa độ kèm địa chỉ (reverse geocoding hoặc OpenStreetMap Nominatim).
- Bấm **"Gửi vị trí"** ➔ gửi message với payload:
  ```json
  {
    "type": "text",
    "text": "📍 Vị trí: 72 Lê Thánh Tôn, Bến Nghé, Quận 1, TP.HCM",
    "location": {
      "latitude": 10.776889,
      "longitude": 106.700806,
      "address": "72 Lê Thánh Tôn, Bến Nghé, Quận 1, TP.HCM",
      "title": "Vị trí hiện tại"
    }
  }
  ```
- Trong `MessageBubble.tsx`: Hiển thị card vị trí với nút **[Xem bản đồ]**, bấm vào tự động mở Google Maps (`geo:lat,lng` hoặc URL `https://maps.google.com/?q=lat,lng`).

#### 📎 2. Tài liệu:
- Gọi trực tiếp `DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })`.
- Giữ nguyên luồng upload chunk mượt mà hiện tại của `tinodeClient.uploadMediaFile`, gửi tin nhắn đính kèm với MIME type chính xác.

#### ⏰ 3. Nhắc hẹn:
- Mở modal `GroupEventComposer` đã có sẵn trong dự án.
- Cho phép người dùng nhập tiêu đề họp/nhắc việc, chọn ngày giờ, ghi chú.
- Nhấn "Tạo nhắc hẹn" ➔ xuất bản sự kiện `groupEvent` vào cuộc trò chuyện, lưu thông báo nhắc nhở.

#### ⚡ 4. Tin nhắn nhanh (`QuickMessagesModal.tsx`):
- Sử dụng `@react-native-async-storage/async-storage` với key `@vichat_canned_responses`.
- Cung cấp sẵn 6 mẫu tin nhắn mặc định:
  1. *"Tôi đang bận, sẽ phản hồi bạn sớm nhất có thể."*
  2. *"Đã nhận được thông tin, tôi đang xử lý ngay."*
  3. *"Vui lòng gửi lại cho tôi tài liệu chi tiết nhé."*
  4. *"Tôi đang trên đường tới chỗ hẹn."*
  5. *"Cảm ơn bạn rất nhiều!"*
  6. *"Xác nhận đã hoàn thành công việc."*
- Có nút **[+ Thêm mẫu mới]** và nút sửa/xóa.
- Khi người dùng chạm vào một câu ➔ Tự động điền vào ô `text` của `ChatDetailScreen` và focus con trỏ, hoặc bấm gửi ngay nếu người dùng cấu hình "Gửi ngay".

#### 🪪 5. Danh thiếp (`ContactPickerModal.tsx`):
- Mở danh sách thành viên trong công ty (`groupMembers` hoặc danh bạ `contacts`).
- Tìm kiếm nhanh theo tên / phòng ban / chức vụ.
- Người dùng chọn 1 người ➔ Gửi tin nhắn chứa thông tin vCard:
  ```json
  {
    "type": "text",
    "text": "🪪 Danh thiếp: Nguyễn Văn A",
    "contactCard": {
      "userId": "usr_123",
      "name": "Nguyễn Văn A",
      "avatar": "https://...",
      "title": "Trưởng phòng Kỹ thuật",
      "department": "Khối Công nghệ",
      "phone": "0912345678",
      "email": "vana@congty.com"
    }
  }
  ```
- Trong `MessageBubble.tsx`: Hiển thị thẻ danh thiếp chuyên nghiệp với Avatar, Tên in đậm, Chức vụ và nút bấm **[Nhắn tin]** (điều hướng thẳng vào cuộc trò chuyện với người đó).

#### 🎬 6. @GIF (`GifPickerModal.tsx`):
- Tích hợp kho GIF phổ biến với các danh mục: Trending, Vui vẻ, Cảm ơn, Chúc mừng, Buồn, Ngạc nhiên...
- Ô tìm kiếm từ khóa GIF tiện lợi.
- Khi chọn 1 GIF ➔ gửi tin nhắn `type: 'image'` với URL GIF và cờ `isGif: true`, render động trên `ProtectedMessageImage`.

#### 🎨 7. Vẽ hình (`DoodleModal.tsx`):
- Bảng vẽ tương tác toàn màn hình hoặc nửa màn hình.
- Công cụ: Bút chì (chọn 6 màu: Đen, Đỏ, Xanh, Vàng, Tím, Trắng), nét cọ dày/mỏng, Tẩy xóa, Nút Hoàn tác (Undo).
- Khi vẽ xong bấm **"Gửi"** ➔ chuyển đổi các nét vẽ thành file ảnh PNG và gửi qua `submitImage`.

#### 🔤 8. Kiểu chữ (`TextFormatBar.tsx`):
- Bật thanh floating bar ngay trên ô input khi soạn thảo:
  - **B** (In đậm): Bọc `**nội dung**`
  - *I* (In nghiêng): Bọc `*nội dung*`
  - ~~S~~ (Gạch ngang): Bọc `~~nội dung~~`
  - `</>` (Mã code): Bọc ````mã code````
  - `"` (Trích dẫn): Thêm `> ` ở đầu dòng
  - **H** (Tiêu đề): Thêm `# ` ở đầu dòng
- Nếu người dùng đang bôi đen một đoạn chữ (`selectionRange`), công cụ tự động bọc đoạn chữ đó mà không làm mất văn bản.

---

## V. KẾ HOẠCH TRIỂN KHAI THEO TỪNG BƯỚC (STEP-BY-STEP CHECKLIST)

```
[KẾ HOẠCH TRIỂN KHAI VICHAT MOBILE - CHAT COMPOSER REDESIGN]
├── BƯỚC 1: Mở rộng Data Model & Types (`mobile/src/types/index.ts`)
│   ├── Bổ sung `LocationAttachment` & `ContactCardAttachment`
│   └── Mở rộng `ChatMessage` interface hỗ trợ `location` và `contactCard`
├── BƯỚC 2: Xây dựng các Sub-Components Tiện ích
│   ├── Tạo `mobile/src/components/ChatMorePanel.tsx` (Grid 4x2 theo Ảnh 2)
│   ├── Tạo `mobile/src/components/QuickMessagesModal.tsx` (Tin nhắn mẫu + AsyncStorage)
│   ├── Tạo `mobile/src/components/ContactPickerModal.tsx` (Chọn danh thiếp đồng nghiệp)
│   ├── Tạo `mobile/src/components/LocationPickerModal.tsx` (Chia sẻ vị trí GPS)
│   ├── Tạo `mobile/src/components/DoodleModal.tsx` (Bảng vẽ tay nguệch ngoạc)
│   ├── Tạo `mobile/src/components/GifPickerModal.tsx` (Tìm kiếm & gửi ảnh GIF)
│   └── Tạo `mobile/src/components/TextFormatBar.tsx` (Công cụ định dạng Markdown)
├── BƯỚC 3: Tái Cấu Trúc Giao Diện Thanh Input trong `ChatDetailScreen.tsx`
│   ├── Thay thế cụm nút `attachGroup` cồng kềnh bằng bố cục chuẩn Ảnh 1
│   ├── Tạo container `inputPillContainer` chứa TextInput + nút `···` bên trong
│   ├── Thêm nút Sticker bên trái, cụm nút Mic + Ảnh bên phải (chuyển sang Send khi có text)
│   ├── Tích hợp logic đóng mở mượt mà giữa bàn phím và `ChatMorePanel`
│   └── Nối toàn bộ sự kiện của 8+ tính năng vào các modal tương ứng
├── BƯỚC 4: Nâng Cấp Hiển Thị Tin Nhắn Trong `MessageBubble.tsx`
│   ├── Render thẻ Bong bóng Vị trí (kèm nút xem trên Google Maps)
│   ├── Render thẻ Danh thiếp VCard (kèm nút nhắn tin cho liên hệ)
│   └── Render ảnh GIF và nét vẽ tay Doodle mượt mà
├── BƯỚC 5: Kiểm Thử Đảm Bảo Zero Regression & Viết Unit Test
│   ├── Chạy test suite: `npm run test` (đảm bảo passed 100%)
│   ├── Kiểm tra Typecheck: `npm run typecheck`
│   ├── Kiểm tra Lint: `npm run lint`
│   └── Thao tác kiểm thử thực tế trên máy ảo / thiết bị thật
└── BƯỚC 6: Cập Nhật Tài Liệu & Build APK Staging Ổ D:
    ├── Cập nhật `docs/CHANGELOG.md`
    └── Thực hiện lệnh build staging theo đúng `AGENTS.md`
```

---

## VI. QUY CHUẨN BUILD & KIỂM THỬ TRÊN THIẾT BỊ (THEO `AGENTS.md`)

Mọi câu lệnh kiểm thử và build APK **bắt buộc** phải tuân thủ nghiêm ngặt quy định ổ `D:`:

### 1. Kiểm tra Typecheck và Lint:
```powershell
Set-Item -Path env:TEMP -Value "D:\vichat-build\tmp"
Set-Item -Path env:TMP -Value "D:\vichat-build\tmp"
Set-Item -Path env:npm_config_cache -Value "D:\vichat-build\npm-cache"

cd D:\CÔNG_VIỆC\vichat-web\mobile
npm run typecheck
npm run lint
npm run test
```

### 2. Build APK Staging và Cài Đặt Lên Thiết Bị Qua ADB:
```powershell
$env:GRADLE_USER_HOME="D:\vichat-build\gradle-user-home"
$env:TEMP="D:\vichat-build\tmp"
$env:TMP="D:\vichat-build\tmp"
$env:ANDROID_HOME="D:\vichat-build\android-sdk"
$env:ANDROID_SDK_ROOT="D:\vichat-build\android-sdk"
$env:JAVA_HOME="D:\vichat-build\jdk"
$env:npm_config_cache="D:\vichat-build\npm-cache"
$env:npm_config_prefix="D:\vichat-build\npm-global"

cd D:\CÔNG_VIỆC\vichat-web\mobile\android
.\gradlew.bat assembleRelease --no-daemon

# Cài đặt file APK đã build trực tiếp vào thiết bị Android
adb install -r D:\CÔNG_VIỆC\vichat-web\mobile\android\app\build\outputs\apk\release\app-release.apk
```

---

## VII. CHECKLIST NGHIỆM THU ĐẠT CHUẨN (ACCEPTANCE CRITERIA)

- [ ] **Giao diện thanh input giống hệt Ảnh 1:** Ô nhập tin nhắn rộng rãi, nút Sticker bên trái, nút 3 chấm nằm gọn gàng bên phải ô nhập, nút Mic và Ảnh ở ngoài cùng bên phải.
- [ ] **Chuyển đổi trạng thái gửi thông minh:** Khi có ký tự trong ô input, nút Mic/Ảnh nhường chỗ cho nút Gửi Send màu xanh nổi bật.
- [ ] **Actions Panel mở chuẩn Ảnh 2:** Khi bấm nút 3 chấm `···`, nút sáng xanh active, mở ra lưới 4 cột x 2 hàng với 8 icon tròn màu sắc trực quan.
- [ ] **8 tính năng hoạt động thực tế:**
  - Vị trí: Lấy được GPS và gửi card vị trí mở được Google Maps.
  - Tài liệu: Chọn và gửi file PDF/Office thành công.
  - Nhắc hẹn: Tạo lịch hẹn và thông báo nhắc việc thành công.
  - Tin nhắn nhanh: Chọn tin nhắn mẫu gửi tức thì, lưu thêm tin mới vào máy.
  - Danh thiếp: Chọn người dùng và gửi thẻ danh thiếp liên hệ.
  - @GIF: Tìm kiếm và gửi GIF động mượt mà.
  - Vẽ hình: Vẽ nguệch ngoạc và gửi nét vẽ thành ảnh.
  - Kiểu chữ: Chèn các định dạng Markdown nhanh chóng.
  - Bình chọn: Giữ nguyên trong nhóm và hoạt động chuẩn xác.
- [ ] **Không phát sinh lỗi phụ (Zero Regression):** Ghi âm Voice, Chọn ảnh thư viện, Reply, Edit, Thu hồi, Cuộc gọi WebRTC hoạt động 100% ổn định.
