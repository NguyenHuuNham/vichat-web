# KẾ HOẠCH & PROMPT CHI TIẾT: NÂNG CẤP MÀN HÌNH THÔNG TIN TRÒ CHUYỆN 1-1, TỐI ƯU HEADER VÀ BẢO TỒN CUỘC GỌI WEBRTC (VICHAT MOBILE)

> **Mục tiêu tài liệu:**
> 1. Đặc tả và phân tích giải pháp kỹ thuật mở rộng màn hình Thông tin cuộc trò chuyện (`GroupInfoScreen` / `ConversationInfoScreen`) để hỗ trợ đồng nhất cho cả **Nhóm (Group)** và **Trò chuyện 1-1 (Direct Chat)**.
> 2. Chuẩn hoá cấu trúc nội dung màn hình thông tin theo ngữ cảnh cuộc trò chuyện:
>    - **Khi là trò chuyện 1-1:**
>      - Ẩn hoàn toàn các mục chỉ thuộc về nhóm: **Thành viên & nhóm**, **Bình chọn**, **Lịch nhóm (Nhắc hẹn)**, **Cài đặt quản trị nhóm**, và **Quyền trưởng nhóm / Giải tán nhóm / Rời nhóm**.
>      - Giữ nguyên và tối ưu các tiện ích thiết yếu: **Kho lưu trữ (Ảnh, File, Link đã chia sẻ)**, **Tìm kiếm tin nhắn trong lịch sử**, **Ghim trò chuyện**, **Tắt/Bật thông báo**, **Dịch trò chuyện**, **Phân loại thẻ**.
>      - Bổ sung cụm hành động nhanh (Quick Action Row) trực quan ngay dưới Hero Card: **Gọi thoại (Audio Call)**, **Gọi video (Video Call)**, **Tìm kiếm**, và **Tắt thông báo**.
>      - Đưa tính năng **Đổi biệt danh (Conversation Nickname)** vào trong màn hình Thông tin (nằm trong mục Cuộc trò chuyện / Tùy chỉnh) thay vì đặt ngoài thanh Header chính để giúp Header thanh thoát, gọn gàng ("đỡ chật").
>    - **Khi là trò chuyện nhóm (Group Chat):** Bảo tồn 100% tất cả các tính năng nhóm hiện có (danh sách thành viên, duyệt thành viên, phân quyền Admin/Owner, đổi tên & avatar nhóm, tạo poll, tạo lịch nhóm, cài đặt nhóm, giải tán).
> 3. Tối ưu thanh tiêu đề cuộc trò chuyện ([ChatDetailScreen.tsx](file:///d:/C%C3%94NG_VI%E1%BB%86C/vichat-web/mobile/src/screens/chat/ChatDetailScreen.tsx)):
>    - Bật và giữ nguyên 2 nút bấm **Gọi thoại** (`Phone`) và **Gọi video** (`Video`) trên Header khi điều kiện cuộc gọi khả dụng.
>    - Di chuyển nút đổi biệt danh (`Pencil`) vào màn hình Thông tin, giải phóng không gian cho Header.
>    - Cho phép mở màn hình Thông tin khi bấm nút [ (i) ] hoặc khi chạm vào khu vực tên / avatar của đối phương trên Header.
> 4. Tuyệt đối tuân thủ nguyên tắc **Zero Regression** (không ảnh hưởng tới WebRTC Call signaling, Tinode realtime, Live & Static Location, Media upload, Audio voice recording).
> 5. Tuân thủ nghiêm ngặt quy chế làm việc tại `AGENTS.md` (toàn bộ cache, build và staging trên ổ `D:`).

---

## I. HIỆN TRẠNG & PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS)

### 1. Hiện trạng màn hình thông tin 1-1
- Trong [GroupInfoScreen.tsx](file:///d:/C%C3%94NG_VI%E1%BB%86C/vichat-web/mobile/src/screens/chat/GroupInfoScreen.tsx#L567):
  ```typescript
  if (!conversation?.isGroup) return <View style={styles.screen}><Text style={styles.empty}>{t('Nhóm không còn khả dụng.')}</Text></View>;
  ```
  Màn hình từ chối hiển thị và báo lỗi nếu cuộc trò chuyện không phải là nhóm (`!conversation?.isGroup`).
- Trong [ChatDetailScreen.tsx](file:///d:/C%C3%94NG_VI%E1%BB%86C/vichat-web/mobile/src/screens/chat/ChatDetailScreen.tsx#L1023):
  ```typescript
  <Pressable 
    accessibilityLabel={t('Thông tin cuộc trò chuyện')} 
    onPress={() => conversation.isGroup 
      ? navigation.navigate('GroupInfo', { conversationId: conversation.id }) 
      : Alert.alert(t('Thông tin'), conversation.description || t('Cuộc trò chuyện nội bộ'))
    } 
    style={styles.more}
  >
    <Info color={palette.inkSoft} size={21} />
  </Pressable>
  ```
  Khi người dùng đang ở chat 1-1 và bấm icon `(i)`, ứng dụng chỉ hiển thị popup `Alert.alert` đơn giản, không mở được màn hình xem thông tin chi tiết, kho media, file, link hay tùy chỉnh.

### 2. Hiện trạng thanh Header trò chuyện
- Trên Header của [ChatDetailScreen.tsx](file:///d:/C%C3%94NG_VI%E1%BB%86C/vichat-web/mobile/src/screens/chat/ChatDetailScreen.tsx#L1021-L1023):
  ```tsx
  {callCapability.available ? (
    <>
      <Pressable accessibilityLabel={t('Gọi thoại')} ...><Phone ... /></Pressable>
      <Pressable accessibilityLabel={t('Gọi video')} ...><Video ... /></Pressable>
    </>
  ) : null}
  {canEditNickname ? (
    <Pressable accessibilityLabel={t('Đổi biệt danh')} onPress={() => { if (peer) setNicknameMember(peer); }} ...>
      <Pencil ... />
    </Pressable>
  ) : null}
  <Pressable accessibilityLabel={t('Thông tin cuộc trò chuyện')} ...><Info ... /></Pressable>
  ```
- **Hạn chế:** Cùng lúc hiển thị quá nhiều icon bên phải header (Gọi thoại, Gọi video, Đổi biệt danh Pencil, Thông tin Info `(i)`), khiến tiêu đề tên người nhận bị chèn ép co ngắn, gây cảm giác chật chội và dễ bấm nhầm trên màn hình điện thoại có bề ngang hẹp.
- **Yêu cầu:** Đưa việc đổi biệt danh vào bên trong màn hình Thông tin; giữ lại nút Gọi thoại & Gọi video và nút Info trên Header.

---

## II. ĐẶC TẢ GIẢI PHÁP KỸ THUẬT (ARCHITECTURAL & TECHNICAL DESIGN)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    KIẾN TRÚC THÔNG TIN HỘI THOẠI TOÀN DIỆN                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. HEADER CHATDETAILSCREEN                                                  │
│    • Giữ nguyên nút [ 📞 Gọi thoại ] & [ 📹 Gọi video ] khi đủ điều kiện.    │
│    • Loại bỏ nút Pencil (Đổi biệt danh) khỏi Header -> chuyển vào Thông tin.│
│    • Bấm nút [ ℹ️ ] hoặc chạm Title -> điều hướng vào Thông tin cuộc chat.   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. HERO CARD TRONG THÔNG TIN 1-1                                            │
│    • Avatar tròn (rounded) lớn kèm trạng thái Online/Offline chấm xanh.     │
│    • Tên người dùng / Biệt danh hiển thị trang trọng.                       │
│    • Phụ đề: Chức danh · Phòng ban · Email/SĐT nếu có từ Danh bạ.           │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. CỤM HÀNH ĐỘNG NHANH (QUICK ACTION ROW TRONG 1-1)                         │
│    • [ 📞 Gọi thoại ]  -> Khởi tạo cuộc gọi WebRTC Audio tức thì.          │
│    • [ 📹 Gọi video ]  -> Khởi tạo cuộc gọi WebRTC Video tức thì.          │
│    • [ 🔍 Tìm kiếm ]   -> Mở ô tìm kiếm lịch sử tin nhắn.                  │
│    • [ 🔔 Tắt/Bật chuông ] -> Bật/tắt thông báo cuộc trò chuyện.            │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. LỌC BỎ CÁC PHẦN MỤC KHÔNG PHÙ HỢP VỚI 1-1                                │
│    • ẨN: Lịch nhóm (Events) & Bình chọn (Polls) trong mục Nội dung.         │
│    • ẨN: Xem thành viên & Quản trị thành viên nhóm.                        │
│    • ẨN: Cài đặt nhóm (bảng switch quyền thành viên).                       │
│    • ẨN: Nút Giải tán nhóm & Nút Rời nhóm.                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. BẢO TỒN VÀ BỔ SUNG CÁC TÍNH NĂNG TIỆN ÍCH TRONG 1-1                       │
│    • GIỮ NGUYÊN: Kho nội dung (Ảnh, File, Link đã chia sẻ trong lịch sử).    │
│    • BỔ SUNG: Dòng "Đổi biệt danh" có icon Pencil, chạm vào mở              │
│      ConversationNicknameModal để chỉnh sửa biệt danh cho đối phương.      │
│    • GIỮ NGUYÊN: Ghim trò chuyện, Dịch trò chuyện, Thẻ phân loại, Ẩn chat.  │
│    • GIỮ NGUYÊN: Tìm kiếm lịch sử tin nhắn.                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## III. BẢN THIẾT KẾ CHI TIẾT THEO TỪNG FILE MÃ NGUỒN (FILE-BY-FILE BLUEPRINT)

### 1. `mobile/src/screens/chat/GroupInfoScreen.tsx`
- **Mục tiêu**: Xử lý ngữ cảnh `isGroup`:
  - `isGroup === true`: Giữ nguyên toàn bộ luồng nhóm hiện có.
  - `isGroup === false`: Hiển thị giao diện thông tin liên hệ 1-1 với Hero, Quick Actions (Phone, Video, Search, Mute), Kho media/files/links, Đổi biệt danh, Ghim, Dịch và Tìm kiếm lịch sử.
- **Chi tiết các điểm chạm**:
  1. **Khử điều kiện chặn 1-1**:
     ```typescript
     // Cũ:
     if (!conversation?.isGroup) return <View style={styles.screen}><Text style={styles.empty}>{t('Nhóm không còn khả dụng.')}</Text></View>;
     // Mới:
     if (!conversation) return <View style={styles.screen}><Text style={styles.empty}>{t('Cuộc trò chuyện không còn khả dụng.')}</Text></View>;
     const isGroup = Boolean(conversation.isGroup);
     ```
  2. **Tiêu đề màn hình Header**:
     ```typescript
     <Text style={styles.headerTitle}>{isGroup ? t('Thông tin nhóm') : t('Thông tin hội thoại')}</Text>
     ```
  3. **Xác định đối phương (Peer) & Thông tin chi tiết trong danh bạ**:
     ```typescript
     const peer = useMemo(() => {
       if (isGroup) return null;
       return conversation.members?.find(member => 
         !identitiesOverlap(member, session?.user) && 
         !identitiesOverlap(member, { id: tinodeClient.currentUserId, uid: tinodeClient.currentUserId })
       ) || conversation.members?.[0] || null;
     }, [isGroup, conversation.members, session?.user]);

     const peerUser = useMemo(() => {
       if (!peer) return null;
       return directory.find(u => identitiesOverlap(u, peer)) || null;
     }, [peer, directory]);

     const peerOnline = !isGroup && directPeerOnline(conversation, tinodeClient.currentUserId);
     ```
  4. **Tích hợp WebRTC Call trong Info Screen**:
     - Import `useCallStore` và các icon `Phone`, `Video` từ `lucide-react-native`.
     - Tính `callCapability`:
       ```typescript
       const callCapability = !isGroup && !conversation.isChatbot
         ? tinodeClient.getCallCapability(conversation.tinodeTopic, { isGroup: false, isChatbot: false })
         : { available: false, reason: '' };
       const beginCall = (audioOnly: boolean) => {
         void startCall(conversation.tinodeTopic, audioOnly, {
           name: peer?.name || conversation.name,
           avatar: peer?.avatar || conversation.avatarUrl,
         }).catch(err => Alert.alert(t('Lỗi cuộc gọi'), err instanceof Error ? t(err.message) : t('Không thể bắt đầu cuộc gọi.')));
       };
       ```
  5. **Render Hero Card theo ngữ cảnh**:
     - Nhóm: Avatar vuông bo góc, nút đổi avatar và tên nhóm (nếu có quyền), số lượng thành viên.
     - 1-1: Avatar tròn (`rounded={true}`), chấm online/offline, tên liên hệ, subtitle (chức danh · phòng ban hoặc trạng thái hoạt động).
  6. **Render Quick Actions**:
     - Nhóm: Nút Mute và Nút Rời nhóm (`LogOut`).
     - 1-1: 4 nút gồm **Gọi thoại** (`Phone`), **Gọi video** (`Video`), **Tìm kiếm** (`Search`), **Tắt/Bật thông báo** (`Bell`/`BellOff`).
  7. **Render Nội dung (Shared Content)**:
     - Nhóm: Ảnh/file/link, Lịch nhóm, Tin nhắn đã ghim, Bình chọn.
     - 1-1: Ảnh/file/link, Tin nhắn đã ghim (nếu có). **Ẩn** Lịch nhóm và Bình chọn.
  8. **Render Thành viên**:
     - Nhóm: Danh sách thành viên, duyệt thành viên, thêm/xóa thành viên.
     - 1-1: **Ẩn hoàn toàn**.
  9. **Render Cài đặt cuộc trò chuyện**:
     - Trong 1-1: Bổ sung dòng **Đổi biệt danh** (`Pencil`):
       ```tsx
       {canEditNickname && peer ? (
         <DetailRow
           icon={Pencil}
           label={t('Đổi biệt danh')}
           detail={conversationNicknameForMember(peer) || t('Đặt biệt danh riêng cho người này')}
           onPress={() => setNicknameMember(peer)}
           palette={palette}
         />
       ) : null}
       ```
     - Dịch tin nhắn, Ghim trò chuyện, Phân loại thẻ, Ẩn trò chuyện.
  10. **Render Cài đặt nhóm & Giải tán**:
      - Chỉ hiển thị khi `isGroup === true`.

---

### 2. `mobile/src/screens/chat/ChatDetailScreen.tsx`
- **Mục tiêu**: Tinh giản Header để không bị chật, bảo toàn nút Gọi điện thoại & Gọi video, và kết nối điều hướng vào màn hình Thông tin.
- **Chi tiết các điểm chạm**:
  1. **Nút Info `(i)`**:
     ```tsx
     <Pressable
       accessibilityLabel={t('Thông tin cuộc trò chuyện')}
       onPress={() => navigation.navigate('GroupInfo', { conversationId: conversation.id })}
       style={styles.more}
     >
       <Info color={palette.inkSoft} size={21} />
     </Pressable>
     ```
  2. **Bấm vào Tên / Avatar trên Header**:
     - Bổ sung `onPress` trên `headerTitle` và `Avatar` để người dùng có thể chạm trực tiếp vào tên đối phương để mở thông tin (tương tự như Telegram, Zalo, WhatsApp, Messenger).
  3. **Bảo tồn nút Gọi thoại & Gọi video**:
     ```tsx
     {callCapability.available ? (
       <>
         <Pressable accessibilityLabel={t('Gọi thoại')} disabled={Boolean(activeCall)} onPress={() => beginCall(true)} style={styles.more}>
           <Phone color={palette.accent} size={19} />
         </Pressable>
         <Pressable accessibilityLabel={t('Gọi video')} disabled={Boolean(activeCall)} onPress={() => beginCall(false)} style={styles.more}>
           <Video color={palette.accent} size={19} />
         </Pressable>
       </>
     ) : null}
     ```
  4. **Loại bỏ nút Pencil đổi biệt danh khỏi Header chính**:
     - Xoá bỏ dòng `{canEditNickname ? <Pressable ... Pencil ... /> : null}` khỏi Header chính để giao diện thoáng đãng, không bị chật chội. Biệt danh được chỉnh sửa trọn vẹn trong màn hình Thông tin.

---

## IV. NGUYÊN TẮC BẢO VỆ ZERO-REGRESSION (CHỐNG LỖI LUỒNG KHÁC)

1. **Bảo tồn toàn vẹn tính năng Nhóm (Group Chat):**
   - Mọi logic thêm/xóa thành viên, phân quyền Admin/Owner, đổi tên/avatar nhóm, tạo bình chọn, tạo nhắc hẹn và giải tán nhóm khi `conversation.isGroup === true` không bị biến đổi bất kỳ logic nào.
2. **Bảo tồn WebRTC Call Signaling:**
   - Việc bắt đầu cuộc gọi từ màn hình Thông tin gọi chung hàm `startCall` từ `useCallStore`, bảo toàn trạng thái `activeCall` và không gây conflict với luồng gọi từ Header.
3. **Bảo tồn Media History Cache:**
   - Cơ chế `loadConversationMediaHistory` của Tinode hoạt động dựa trên `conversation.tinodeTopic`, tương thích đồng nhất cho cả nhóm và 1-1, đảm bảo tab Ảnh/File/Link tải nhanh và chuẩn xác.
4. **Bảo tồn Biệt danh (Nicknames):**
   - `setNicknameMember(peer)` sử dụng chung `ConversationNicknameModal`, lưu trữ vào Chatmgt API và Tinode topic metadata mà không làm lệch namespace.

---

## V. KẾ HOẠCH KIỂM THỬ & TIÊU CHÍ CHẤP THUẬN (VERIFICATION PLAN)

### 1. Static Verification
```powershell
npm run typecheck
npm run lint
npm test
```
*Tiêu chí:* 0 errors, 0 warnings, 100% unit tests passed.

### 2. Thiết bị thực tế (ADB testing)
1. **Kiểm tra Header 1-1:**
   - Mở cuộc trò chuyện 1-1. Header hiển thị tên đối phương rõ ràng, chỉ có nút Gọi thoại (`Phone`), Gọi video (`Video`) và Thông tin (`Info`). Không còn icon Pencil chật chội.
2. **Kiểm tra Màn hình Thông tin 1-1:**
   - Bấm vào icon `(i)` hoặc chạm vào tên liên hệ trên Header ➔ Màn hình thông tin mở ra mượt mà.
   - Hero hiển thị avatar tròn, tên, chức vụ, phòng ban, trạng thái online.
   - Quick Action Row có 4 nút: Gọi thoại, Gọi video, Tìm kiếm, Tắt thông báo.
   - Thử bấm Gọi thoại / Gọi video ➔ Khởi chạy cuộc gọi thành công.
   - Thử bấm "Đổi biệt danh" ➔ Modal đổi biệt danh mở ra, nhập biệt danh mới và lưu ➔ Biệt danh cập nhật chuẩn xác.
   - Thử mở "Ảnh, file, link" ➔ Hiển thị đầy đủ các file và ảnh đã gửi trong cuộc trò chuyện 1-1.
   - Kiểm tra không thấy mục Thành viên, không thấy mục Bình chọn, không thấy Lịch nhóm, không thấy Cài đặt nhóm, không thấy Rời nhóm / Giải tán nhóm.
3. **Kiểm tra Màn hình Thông tin Nhóm:**
   - Mở cuộc trò chuyện nhóm ➔ Bấm `(i)`.
   - Vẫn hiển thị đầy đủ danh sách thành viên, duyệt thành viên, bình chọn, lịch nhóm, cài đặt nhóm và giải tán nhóm.

---

## VI. BUILD APK & GHI NHẬT KÝ THAY ĐỔI TRÊN Ổ D: (TUÂN THỦ AGENTS.MD)

1. Staging và build hoàn toàn trên `D:\vichat-build\mobile-scroll-fix-20261004\android`.
2. Đồng bộ mã nguồn từ `mobile/src` sang staging.
3. Chạy lệnh assembleDebug với kiến trúc `arm64-v8a`.
4. Copy APK ra `D:\vichat-build\ViChat-direct-info-debug.apk` và cài đặt lên thiết bị qua ADB.
5. Cập nhật `docs/CHANGELOG.md` theo quy định.
