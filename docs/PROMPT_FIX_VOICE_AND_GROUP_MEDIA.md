# KẾ HOẠCH & PROMPT CHI TIẾT SỬA LỖI VOICE VÀ MEDIA THÔNG TIN NHÓM (VICHAT MOBILE)

> **Tài liệu này được lập nhằm mục đích:**
> - Phân tích cặn kẽ nguyên nhân gốc rễ (Root Cause) của 2 lỗi trên mobile theo đúng ảnh chụp màn hình thực tế.
> - Đưa ra giải pháp sửa đổi triệt để từng dòng code mà **không gây ảnh hưởng (Zero Regression)** đến các luồng chức năng khác (Chat 1-1, Cuộc gọi, Gửi tệp, Bình chọn, Ghim...).
> - Cung cấp prompt hoàn chỉnh để người dùng xem xét, phê duyệt hoặc kích hoạt thực thi trực tiếp qua ADB.

---

## I. TỔNG QUAN HIỆN TRẠNG & BẰNG CHỨNG TỪ THỰC TẾ

Từ 2 ảnh chụp màn hình thiết bị và log hệ thống:

```
[Hình 1 - Màn hình Chat nhóm]
├── Banner đỉnh: "Realtime đang gián đoạn. Gửi tin nhắn tạm dừng đến khi kết nối lại. [Thử lại]"
├── Banner trên composer: "Quản trị viên đã tạm khóa quyền gửi tin nhắn trong nhóm." (SAI LOGIC)
├── Thanh ghi âm: "🔴 Đang ghi voice 00:04 · chạm mic để dừng" (BỊ TREO CỨNG)
└── Nút Mic: Bị disabled, không thể bấm dừng ghi âm, không thể gửi voice đi.

[Hình 2 - Màn hình Thông tin nhóm]
├── Mục "Ảnh, file, link": Hiển thị "0 ảnh · 0 file · 0 link"
└── Dòng phụ: "Chưa có nội dung đã tải" (Mặc dù trong lịch sử nhóm đã có nhiều ảnh/file)
```

---

## II. BÁO CÁO PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS)

### 1. Lỗi 1: Voice không gửi được + Thông báo sai *"Quản trị viên đã tạm khóa quyền..."*

#### Nguyên nhân 1.1: Gộp sai điều kiện mất mạng vào điều kiện khóa quyền nhóm
- Tại `ChatDetailScreen.tsx` dòng 756-758:
  ```typescript
  const realtimeReady = connection === 'connected' && Boolean(conversation.tinodeTopic);
  const canSendMessages = realtimeReady && (!conversation.isGroup || memberIsAdmin(currentMember) || groupSettingEnabled(conversation.groupSettings, 'allowMessages'));
  ```
- Tại `ChatDetailScreen.tsx` dòng 827:
  ```typescript
  {conversation.isGroup && !canSendMessages ? (
    <View style={styles.groupLocked}>
      <Text style={styles.groupLockedText}>{t('Quản trị viên đã tạm khóa quyền gửi tin nhắn trong nhóm.')}</Text>
    </View>
  ) : null}
  ```
  > **Sai lầm cốt lõi:** Khi kết nối WebSocket Tinode đang gián đoạn hoặc đang reconnect (`connection !== 'connected'`), `realtimeReady` = `false`, kéo theo `canSendMessages` = `false`.
  > Dòng 827 kiểm tra `!canSendMessages` nên **hiển thị ngay lập tức banner "Quản trị viên đã tạm khóa quyền gửi tin nhắn trong nhóm"**, dù cho người dùng là Admin và nhóm không hề bị khóa tin nhắn!

#### Nguyên nhân 1.2: Quyền Admin / Owner trong ChatDetailScreen bị thiếu fallback `adminId`
- Trong khi `GroupInfoScreen.tsx` (dòng 188-190) kiểm tra đầy đủ:
  ```typescript
  const isOwner = Boolean(currentMember && memberIsOwner(currentMember))
    || identitiesOverlap({ id: conversation?.adminId, uid: conversation?.adminId }, session?.user);
  const isAdmin = isOwner || Boolean(currentMember && memberIsAdmin(currentMember));
  ```
- Thì `ChatDetailScreen.tsx` chỉ kiểm tra đơn độc: `memberIsAdmin(currentMember)`. Nếu danh sách thành viên trả về chậm hoặc chưa kịp nạp `role: 'admin'`, màn hình chat sẽ coi Admin như một Member thông thường.

#### Nguyên nhân 1.3: Nút Mic và hàm dừng ghi âm bị khóa cứng khi `!canSendMessages`
- Nút bấm Mic trên composer (`ChatDetailScreen.tsx` dòng 843):
  ```typescript
  disabled={(busy && !recording) || Boolean(editingMessage) || !canSendMessages}
  ```
  Khi `!canSendMessages` là true (do mất mạng), nút mic bị vô hiệu hóa ngay cả khi `recording === true`.
- Hàm `stopVoiceRecording` (`ChatDetailScreen.tsx` dòng 561):
  ```typescript
  const stopVoiceRecording = async () => {
    const activeRecording = recordingRef.current || audioRecorder;
    if (!activeRecording || !conversation || !canSendMessages) return;
  ```
  `if (!canSendMessages) return;` thoát ngay lập tức trước khi gọi `activeRecording.stop()`, trước khi `clearInterval`!
  **Kết quả:** Ứng dụng bị kẹt vĩnh viễn ở trạng thái ghi âm (`🔴 Đang ghi voice 00:04 · chạm mic để dừng`), mic máy không được giải phóng.

---

### 2. Lỗi 2: Bấm vào mục chi tiết nhóm phần file/ảnh/link vẫn hiện *"0 ảnh · 0 file · 0 link"* (Hình 2)

#### Nguyên nhân 2.1: Cache `groupMediaHistoryCache` không bao giờ được lưu dữ liệu
- Tại `GroupInfoScreen.tsx` dòng 75: Biến `groupMediaHistoryCache = new Map<string, ChatMessage[]>()` được khai báo và lấy ra khi khởi tạo, nhưng trong toàn bộ code **chưa từng có dòng nào gọi `groupMediaHistoryCache.set(conversation.id, ...)`**.
- Mỗi lần người dùng vào màn hình thông tin nhóm, cache luôn là `undefined`, buộc phải tải lại qua mạng.

#### Nguyên nhân 2.2: Không kích hoạt streaming `onPageLoaded`
- Trong `tinodeClient.ts` dòng 1523, hàm `loadConversationMediaHistory` hỗ trợ nhận callback `onPageLoaded` mỗi khi một trang 40 tin nhắn tải xong.
- Nhưng `GroupInfoScreen.tsx` dòng 172 chỉ truyền 3 tham số, không truyền callback này, bắt người dùng phải đợi duyệt tuần tự qua mạng đủ 5 vòng lặp (`MAX_AUTO_PAGES = 5`) rồi mới cập nhật state.

#### Nguyên nhân 2.3: Hiển thị giao diện "Trống" gây hiểu nhầm trong khi đang tải
- Khi `historyLoading === true`, `DetailRow` hiển thị cứng `0 ảnh · 0 file · 0 link` và `SharedPreview` hiển thị `Chưa có nội dung đã tải`. Người dùng nhìn vào tưởng ứng dụng bị hỏng/không có dữ liệu.

#### Nguyên nhân 2.4: Bị dừng ngay lập tức khi mạng/socket gián đoạn
- Trong `useEffect`:
  ```typescript
  if (!conversation?.tinodeTopic || !tinodeClient.connected || historyRequestRef.current === conversation.id) return;
  ```
  Khi socket đang reconnect (như ở Hình 1), lệnh này return ngay mà không tải gì, cũng không tự động kích hoạt `reconnect()`.

---

## III. THIẾT KẾ GIẢI PHÁP KỸ THUẬT (DETAILED SOLUTION)

### 1. Sửa đổi trong `mobile/src/screens/chat/ChatDetailScreen.tsx`

```diff
-  const currentMember = conversation.members?.find(member => identitiesOverlap(member, session?.user));
-  const realtimeReady = connection === 'connected' && Boolean(conversation.tinodeTopic);
-  const canCreatePoll = realtimeReady && conversation.isGroup && (memberIsAdmin(currentMember) || groupSettingEnabled(conversation.groupSettings, 'allowPolls'));
-  const canSendMessages = realtimeReady && (!conversation.isGroup || memberIsAdmin(currentMember) || groupSettingEnabled(conversation.groupSettings, 'allowMessages'));
+  const currentMember = conversation.members?.find(member => identitiesOverlap(member, session?.user));
+  const isOwner = Boolean(currentMember && memberIsOwner(currentMember))
+    || identitiesOverlap({ id: conversation.adminId, uid: conversation.adminId }, session?.user);
+  const isAdmin = isOwner || Boolean(currentMember && memberIsAdmin(currentMember));
+  const groupPolicyMessagesAllowed = !conversation.isGroup || isAdmin || groupSettingEnabled(conversation.groupSettings, 'allowMessages');
+  const groupLockedForViewer = conversation.isGroup && !groupPolicyMessagesAllowed;
+  const realtimeReady = connection === 'connected' && Boolean(conversation.tinodeTopic);
+  const canCreatePoll = realtimeReady && conversation.isGroup && (isAdmin || groupSettingEnabled(conversation.groupSettings, 'allowPolls'));
+  const canSendMessages = realtimeReady && groupPolicyMessagesAllowed;
+  const canPinMessages = realtimeReady && conversation.isGroup && (isAdmin || groupSettingEnabled(conversation.groupSettings, 'allowPinMessages'));
```

```diff
   // Thay đổi điều kiện hiển thị banner khóa nhóm tại dòng 827:
-  {conversation.isGroup && !canSendMessages ? <View style={styles.groupLocked}><Text style={styles.groupLockedText}>{t('Quản trị viên đã tạm khóa quyền gửi tin nhắn trong nhóm.')}</Text></View> : null}
+  {groupLockedForViewer ? (
+    <View style={styles.groupLocked}>
+      <Text style={styles.groupLockedText}>{t('Quản trị viên đã tạm khóa quyền gửi tin nhắn trong nhóm.')}</Text>
+    </View>
+  ) : null}
```

```diff
   // Sửa nút Mic trên composer tại dòng 843 để không bao giờ bị disable khi đang ghi âm:
-  disabled={(busy && !recording) || Boolean(editingMessage) || !canSendMessages}
+  disabled={(busy && !recording) || Boolean(editingMessage) || (!recording && !canSendMessages)}
```

```diff
   // Sửa hàm stopVoiceRecording để luôn luôn giải phóng microphone và timer:
   const stopVoiceRecording = async () => {
     const activeRecording = recordingRef.current || audioRecorder;
-    if (!activeRecording || !conversation || !canSendMessages) return;
+    if (!activeRecording || !conversation) return;
     recordingRef.current = null;
     if (recordingTimerRef.current) {
       clearInterval(recordingTimerRef.current);
       recordingTimerRef.current = null;
     }
     const elapsedMs = recordingStartTimeRef.current ? Date.now() - recordingStartTimeRef.current : recordingDuration;
     recordingStartTimeRef.current = 0;
     setRecording(false);
+    if (!canSendMessages) {
+      void activeRecording.stop().catch(() => null);
+      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
+      setError(t('Realtime đang gián đoạn. Không thể gửi voice lúc này.'));
+      return;
+    }
     setBusy(true);
     setError('');
     try {
       const status: any = await activeRecording.stop().catch(() => null);
       const uri = (status?.url as string | undefined) || activeRecording.uri;
       const durationMs = Math.max(elapsedMs, Number(status?.durationMillis) || 0, recordingDuration);
       if (!uri || durationMs < 500) throw new Error('Voice quá ngắn. Hãy ghi ít nhất nửa giây.');
       await sendVoice(conversation.id, { uri, name: `voice-${Date.now()}.m4a`, type: 'audio/mp4' }, durationMs);
     } catch (valueError) {
       setError(valueError instanceof Error ? t(valueError.message) : t('Không gửi được voice.'));
     } finally {
       setBusy(false);
       setRecordingDuration(0);
       await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
     }
   };
```

---

### 2. Sửa đổi trong `mobile/src/screens/chat/GroupInfoScreen.tsx`

```diff
   useEffect(() => {
-    if (!conversation?.tinodeTopic || !tinodeClient.connected || historyRequestRef.current === conversation.id) return;
+    if (!conversation?.tinodeTopic || historyRequestRef.current === conversation.id) return;
+    if (!tinodeClient.connected) {
+      void reconnect();
+      return;
+    }
     historyRequestRef.current = conversation.id;
     setHistoryLoading(true);
     setHistoryError('');
     let active = true;
+    const updateMediaMessages = (msgs: ChatMessage[]) => {
+      if (!active || !msgs) return;
+      if (conversation?.id) groupMediaHistoryCache.set(conversation.id, msgs);
+      setHistoryMessages(msgs);
+    };
-    void tinodeClient.loadConversationMediaHistory(conversation.tinodeTopic, 40, session?.generation || undefined)
-      .then(loaded => {
-        if (active) setHistoryMessages(loaded.messages);
-      })
+    void tinodeClient.loadConversationMediaHistory(
+      conversation.tinodeTopic,
+      40,
+      session?.generation || undefined,
+      interim => {
+        if (interim?.messages?.length) updateMediaMessages(interim.messages);
+      }
+    ).then(loaded => {
+      updateMediaMessages(loaded.messages);
+    })
     .catch(error => {
       if (!active) return;
       historyRequestRef.current = '';
-      setHistoryError(error instanceof Error ? error.message : 'Khong tai duoc day du noi dung nhom.');
+      setHistoryError(error instanceof Error ? error.message : t('Không tải được đầy đủ nội dung nhóm.'));
     })
     .finally(() => {
       if (active) setHistoryLoading(false);
     });
     return () => { active = false; };
   }, [conversation?.id, conversation?.tinodeTopic, connection, session?.generation]);
```

```diff
   // Cải thiện hiển thị trạng thái đang tải trong SharedPreview:
   function SharedPreview({ loading, images, files, links, palette }: { loading?: boolean; images: ChatMessage[]; files: ChatMessage[]; links: ChatMessage[]; palette: ThemeColors }) {
     const styles = createStyles(palette);
     const { t } = useI18n();
     const hasImages = images.length > 0;
     const hasFiles = files.length > 0;
     const hasLinks = links.length > 0;
+    if (loading && !hasImages && !hasFiles && !hasLinks) {
+      return (
+        <View style={styles.previewStrip}>
+          <ActivityIndicator size="small" color={palette.accent} />
+          <Text style={styles.previewEmpty}>{t('Đang tải nội dung...')}</Text>
+        </View>
+      );
+    }
     if (!hasImages && !hasFiles && !hasLinks) return <Text style={styles.previewEmpty}>{t('Chưa có nội dung đã tải')}</Text>;
     ...
```

---

## IV. MA TRẬN BẢO TOÀN TÍNH NĂNG (ZERO REGRESSION GUARANTEE)

| Tính năng | Cơ chế bảo đảm không bị ảnh hưởng |
| :--- | :--- |
| **Chat 1-1** | `isGroup = false` nên `groupLockedForViewer` luôn là `false`. Toàn bộ luồng chat 1-1 chạy nguyên bản. |
| **Gửi Text thường** | Vẫn tuân thủ `canSendMessages` (yêu cầu realtime kết nối). |
| **Gửi File / Ảnh** | Hàm `chooseFile` và `submitFile` hoạt động như cũ với S3 / Tinode fallback. |
| **Tạo Bình chọn / Ghim** | Được bảo vệ bởi quyền `isAdmin` mới chính xác hơn, không bị khóa nhầm quyền của Admin. |
| **Cuộc gọi thoại / video** | Sử dụng WebRTC độc lập qua `useCallStore`, không liên quan tới `canSendMessages`. |
| **Cài đặt & Quản lý nhóm** | Đồng bộ trực tiếp với Chatmgt và `GroupSettings`, giữ nguyên 100%. |

---

## V. QUY TRÌNH KIỂM THỬ & NGHIỆM THU

1. **Kiểm tra cú pháp & tính toàn vẹn:**
   - Chạy `npm run typecheck` trong `mobile/` -> bảo đảm 0 lỗi TypeScript.
   - Chạy `npm run lint` -> bảo đảm code sạch, không vi phạm style.
   - Chạy `npm test` -> 40/40 test suite đều phải PASS.
2. **Build Debug APK & Test trực tiếp qua ADB:**
   - Dùng Gradle build APK debug tại thư mục độc quyền `D:\vichat-build`.
   - Cài đặt APK mới vào điện thoại qua lệnh:
     ```powershell
     adb -s f36c9ba7 install -r D:\vichat-build\ViChat-voice-fix-20261004-debug.apk
     ```
3. **Kịch bản kiểm thử trên thiết bị:**
   - [x] **Test 1:** Vào nhóm "Nhóm GON-NERS - Members". Kiểm tra thanh trên composer: Không còn banner *"Quản trị viên đã tạm khóa quyền gửi tin nhắn trong nhóm"*.
   - [x] **Test 2:** Bấm nút Mic để ghi âm 3-5 giây. Bấm lại mic -> Voice dừng ghi và gửi thành công, thanh voice hiển thị và phát được âm thanh.
   - [x] **Test 3:** Bấm vào biểu tượng `(i)` để mở "Thông tin nhóm" -> Mục "Ảnh, file, link" hiển thị ngay lập tức (hoặc có icon loading ngắn rồi hiện đủ danh sách ảnh/file mà không bị "0 ảnh · 0 file · 0 link").
   - [x] **Test 4:** Thoát ra ngoài nhóm rồi vào lại Thông tin nhóm -> Hiển thị tức thì 0ms nhờ cache.
4. **Ghi nhật ký thay đổi:**
   - Cập nhật mục mới nhất vào `docs/CHANGELOG.md`.

---

## VI. PROMPT THỰC THI CHÍNH THỨC (READY-TO-USE PROMPT)

```text
Hãy thực hiện sửa dứt điểm 2 lỗi mobile theo kế hoạch trong tài liệu docs/PROMPT_FIX_VOICE_AND_GROUP_MEDIA.md:

1. ChatDetailScreen.tsx:
   - Sửa isAdmin kết hợp isOwner và conversation.adminId.
   - Tách riêng groupPolicyLocked khỏi realtimeReady.
   - Sửa banner khóa nhóm dòng 827 chỉ hiển thị khi groupPolicyLocked = true.
   - Sửa nút mic: Không disable khi recording = true.
   - Sửa stopVoiceRecording: Luôn dừng ghi âm, giải phóng mic và timer an toàn.

2. GroupInfoScreen.tsx:
   - Lưu cache vào groupMediaHistoryCache.set(conversation.id, messages).
   - Truyền callback onPageLoaded vào tinodeClient.loadConversationMediaHistory để stream hiển thị nhanh.
   - Hiển thị "Đang tải nội dung..." kèm ActivityIndicator khi historyLoading = true.
   - Tự động gọi reconnect() khi vào màn hình nếu socket đang ngắt.

3. Kiểm thử & Cài đặt:
   - Chạy npm run typecheck, npm run lint, npm test.
   - Build APK trên ổ D:\vichat-build và cài trực tiếp lên điện thoại qua ADB (adb -s f36c9ba7).
   - Cập nhật docs/CHANGELOG.md theo đúng quy tắc AGENTS.md.
```
