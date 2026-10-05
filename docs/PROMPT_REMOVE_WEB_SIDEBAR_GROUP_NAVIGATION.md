# TÀI LIỆU ĐẶC TẢ KỸ THUẬT & PROMPT THI CÔNG: LOẠI BỎ PHÂN MỤC "NHÓM" TRÊN THANH ĐIỀU HƯỚNG CHÍNH (SIDEBAR PRIMARY) WEB VICHAT

> **MỤC TIÊU CỐT LÕI:**
> 1. **Loại bỏ phân mục "Nhóm" (icon `fa-users`, text `Nhóm`)** khỏi thanh điều hướng chính bên trái (Sidebar Primary - Cột 1) của phiên bản Web ViChat.
> 2. **Tối ưu hóa thanh điều hướng Web:** Thanh menu chính chỉ gồm 4 phân mục chuẩn: **Chat**, **Công việc**, **Danh bạ**, **Cài đặt** (kèm Profile cá nhân ở chân trang).
> 3. **Bảo toàn 100% tính năng Nhóm trong phân hệ Chat (Zero Feature Loss):**
>    - Nút `+` ("Tạo nhóm mới") ở header danh sách hội thoại (Cột 2) mở modal tạo nhóm `renderCreateGroupForm('modal')`.
>    - Tab lọc **"Nhóm"** trong `ConversationListToolbar` (Cột 2) cho phép lọc danh sách các cuộc trò chuyện nhóm.
>    - Toàn bộ tính năng phòng chat nhóm: nhắn tin, biểu cảm, @mention, bình chọn (poll), media, thông tin nhóm (Cột 4), quản lý thành viên, bổ nhiệm phó nhóm, chuyển quyền trưởng nhóm, rời nhóm, giải tán nhóm.
> 4. **Phạm vi nghiêm ngặt:** **CHỈ SỬA PHÂN HỆ WEB (`src/`), TUYỆT ĐỐI KHÔNG CHẠM VÀO PHÂN HỆ MOBILE (`mobile/**`)**.
> 5. **Nguyên tắc Zero Regression:** Đảm bảo luồng điều hướng sâu (URL route `/groups` fallback an toàn về `/chat`, không văng lỗi/trắng trang), không ảnh hưởng phím tắt, drawer responsive, hay các panel Workspace khác.
> 6. **Xác minh chất lượng:** Toàn bộ 458+ unit tests frontend (`npm run test:frontend`) và lệnh build Vite production (`npm run build`) phải hoàn thành thành công 100%.

---

## I. BỐI CẢNH & PHÂN TÍCH HIỆN TRẠNG

### 1. Hiện trạng giao diện Sidebar Web (Ảnh đính kèm từ người dùng)

Trên giao diện Web ViChat hiện tại, cột điều hướng chính ngoài cùng bên trái (Sidebar Primary - Cột 1) đang hiển thị 5 phân mục:

```text
┌────────────────────────────────────────────────────────┐
│  (LOGO) CHAT                                       <   │
├────────────────────────────────────────────────────────┤
│  [💬] Chat          (active / mặc định)                 │
│  [👥] Nhóm          <── CẦN LOẠI BỎ                     │
│  [💼] Công việc                                         │
│  [📇] Danh bạ                                           │
│  [⚙️] Cài đặt                                          │
├────────────────────────────────────────────────────────┤
│  (Avatar) Nhâm Nguyễn                                  │
│  🟢 Trực tuyến                                         │
└────────────────────────────────────────────────────────┘
```

### 2. Nguyên nhân kỹ thuật & Lý do cần loại bỏ mục "Nhóm" trên Sidebar

1. **Sự trùng lặp và gây nhầm lẫn luồng người dùng (UX Redundancy):**
   - Phân mục "Nhóm" ở Cột 1 (`workspacePanel === 'groups'`, route `/groups`) thực chất chỉ mở một lớp phủ Workspace Overlay (`.workspace-overlay`) chứa form tạo nhóm dạng toàn trang (`renderCreateGroupForm('page')`).
   - Mục này **không** hiển thị danh sách các nhóm mà người dùng đang tham gia.
2. **Tính năng Nhóm đã được tích hợp hoàn chỉnh và tự nhiên trong mục "Chat":**
   - **Tạo nhóm mới:** Ngay trên đỉnh Cột 2 (Header danh sách hội thoại) đã có nút `+` chuyên dụng ("Tạo nhóm mới"). Khi bấm vào, modal `renderCreateGroupForm('modal')` xuất hiện nhẹ nhàng, cho phép đặt tên nhóm, tải ảnh đại diện, tìm kiếm và tick chọn thành viên công ty một cách trực quan.
   - **Lọc danh sách nhóm:** Thanh công cụ `ConversationListToolbar` trong Cột 2 đã có sẵn tab **"Nhóm"** (`tab === 'groups'`) nằm cạnh tab "Tất cả" và "Phân loại", giúp người dùng lọc riêng các hội thoại nhóm chỉ với 1 click.
   - **Không gian làm việc nhóm:** Khung chat (Cột 3) và thanh chi tiết nhóm (Cột 4) đã tích hợp đầy đủ mọi nghiệp vụ nhóm (bình chọn poll, tài liệu, quản lý thành viên, phân quyền phó nhóm/trưởng nhóm, ghim tin nhắn, v.v.).
3. **Kết luận:**
   - Việc duy trì mục "Nhóm" ở Cột 1 là thừa thãi, chiếm dụng diện tích thanh điều hướng và làm phân mảnh trải nghiệm của người dùng.
   - Cần loại bỏ mục này khỏi Sidebar Primary để trả lại bố cục thanh thoát, đồng thời chuẩn hóa luồng route `/groups` về `/chat`.

---

## II. BẢNG SO SÁNH TRẠNG THÁI (BEFORE VS. AFTER)

| Thành phần / Luồng | Trạng thái hiện tại (Before) | Trạng thái mong muốn (After) | Ghi chú an toàn |
| :--- | :--- | :--- | :--- |
| **Sidebar Primary (Cột 1)** | 5 nút: Chat, **Nhóm**, Công việc, Danh bạ, Cài đặt | 4 nút: **Chat**, **Công việc**, **Danh bạ**, **Cài đặt** | Bỏ thẻ `<a>` Nhóm, giữ nguyên hiệu ứng active, tooltip, collapse toggle. |
| **Route `/groups`** | Mở workspace panel `groups` (render form tạo nhóm toàn trang) | Fallback mượt mà về `null` (hiển thị giao diện Chat chuẩn `/chat`) | Không gây lỗi 404, không vỡ layout, xử lý an toàn qua `workspaceRouting.js`. |
| **Workspace Panel `groups`** | Nhánh `{workspacePanel === 'groups' && renderCreateGroupForm('page')}` | Loại bỏ nhánh render thừa trong `App.jsx`, dọn dẹp biến kiểm tra `workspacePanel === 'groups'` | Giảm tải DOM và giải phóng state không cần thiết. |
| **Nút `+` Tạo nhóm (Cột 2 Header)** | Mở modal popup `isCreateGroupOpen = true` | **GIỮ NGUYÊN 100% KHÔNG ĐỔI** | Đây là luồng tạo nhóm chính thức của phân hệ Chat. |
| **Tab "Nhóm" trong `ConversationListToolbar`** | Lọc danh sách hội thoại có `room.isGroup === true` | **GIỮ NGUYÊN 100% KHÔNG ĐỔI** | Luồng xem danh sách nhóm của người dùng. |
| **Quản trị nhóm (Cột 4)** | Đầy đủ tính năng thành viên, quyền hạn, giải tán, rời nhóm | **GIỮ NGUYÊN 100% KHÔNG ĐỔI** | Tuyệt đối không ảnh hưởng đến Tinode topic / backend. |
| **Mobile App (`mobile/**`)** | Hoạt động bình thường | **TUYỆT ĐỐI KHÔNG CHẠM VÀO** | Không sửa bất kỳ file nào trong thư mục `mobile/`. |

---

## III. MA TRẬN FILE & PHẠM VI SỬA ĐỔI CHI TIẾT

```text
vichat-web/
├── src/
│   ├── app/
│   │   └── App.jsx                                  [CẦN SỬA: Bỏ nav-item Nhóm & dọn dẹp workspacePanel 'groups']
│   ├── features/
│   │   └── workspace/
│   │       └── services/
│   │           ├── workspaceRouting.js              [CẦN SỬA: Bỏ route 'groups', fallback về /chat]
│   │           └── workspaceRouting.test.js         [CẦN SỬA: Cập nhật test case khẳng định /groups về null]
│   └── App.jsx (prototype nếu cần)                  [CẦN SỬA: Bỏ nav-item Nhóm nếu có]
├── docs/
│   └── CHANGELOG.md                                 [CẦN CẬP NHẬT: Ghi nhận thay đổi theo AGENTS.md]
└── mobile/                                          [NGHIÊM CẤM CHẠM VÀO - DO NOT TOUCH]
```

---

## IV. ĐẶC TẢ CODE CHI TIẾT TỪNG BƯỚC THI CÔNG

### Bước 1: Loại bỏ mục "Nhóm" khỏi Sidebar Primary (`src/app/App.jsx`)

Tìm khối điều hướng `<nav className="primary-nav">` (khoảng dòng 14571 - 14592):

```jsx
// TRƯỚC KHI SỬA (HIỆN TẠI):
<nav className="primary-nav">
  <a href={workspacePathForPanel(null)} className={`nav-item ${!workspacePanel ? 'active' : ''}`} data-tooltip={appCopy.chat} onClick={(e) => { e.preventDefault(); closeWorkspacePanel(); }}>
    <i className="fa-solid fa-comment-dots"></i>
    <span>{appCopy.chat}</span>
  </a>
  <a href={workspacePathForPanel('groups')} className={`nav-item ${workspacePanel === 'groups' ? 'active' : ''}`} data-tooltip={appCopy.groups} onClick={(e) => { e.preventDefault(); openWorkspacePanel('groups'); }}>
    <i className="fa-solid fa-users"></i>
    <span>{appCopy.groups}</span>
  </a>
  <a href={workspacePathForPanel('enterprise')} className={`nav-item ${workspacePanel === 'enterprise' ? 'active' : ''}`} data-tooltip={appCopy.work} onClick={(e) => { e.preventDefault(); openWorkspacePanel('enterprise'); }}>
    <i className="fa-solid fa-briefcase"></i>
    <span>{appCopy.work}</span>
  </a>
  <a href={workspacePathForPanel('contacts')} className={`nav-item ${workspacePanel === 'contacts' ? 'active' : ''}`} data-tooltip={appCopy.contacts} onClick={(e) => { e.preventDefault(); openWorkspacePanel('contacts'); }}>
    <i className="fa-solid fa-address-book"></i>
    <span>{appCopy.contacts}</span>
  </a>
  <a href={workspacePathForPanel('settings')} className={`nav-item ${workspacePanel === 'settings' ? 'active' : ''}`} data-tooltip={appCopy.settings} onClick={(e) => { e.preventDefault(); openWorkspacePanel('settings'); }}>
    <i className="fa-solid fa-gear"></i>
    <span>{appCopy.settings}</span>
  </a>
</nav>
```

**Thao tác thực hiện:**
Xóa bỏ hoàn toàn thẻ `<a>` chứa `workspacePathForPanel('groups')`:

```jsx
// SAU KHI SỬA (KẾT QUẢ):
<nav className="primary-nav">
  <a href={workspacePathForPanel(null)} className={`nav-item ${!workspacePanel ? 'active' : ''}`} data-tooltip={appCopy.chat} onClick={(e) => { e.preventDefault(); closeWorkspacePanel(); }}>
    <i className="fa-solid fa-comment-dots"></i>
    <span>{appCopy.chat}</span>
  </a>
  <a href={workspacePathForPanel('enterprise')} className={`nav-item ${workspacePanel === 'enterprise' ? 'active' : ''}`} data-tooltip={appCopy.work} onClick={(e) => { e.preventDefault(); openWorkspacePanel('enterprise'); }}>
    <i className="fa-solid fa-briefcase"></i>
    <span>{appCopy.work}</span>
  </a>
  <a href={workspacePathForPanel('contacts')} className={`nav-item ${workspacePanel === 'contacts' ? 'active' : ''}`} data-tooltip={appCopy.contacts} onClick={(e) => { e.preventDefault(); openWorkspacePanel('contacts'); }}>
    <i className="fa-solid fa-address-book"></i>
    <span>{appCopy.contacts}</span>
  </a>
  <a href={workspacePathForPanel('settings')} className={`nav-item ${workspacePanel === 'settings' ? 'active' : ''}`} data-tooltip={appCopy.settings} onClick={(e) => { e.preventDefault(); openWorkspacePanel('settings'); }}>
    <i className="fa-solid fa-gear"></i>
    <span>{appCopy.settings}</span>
  </a>
</nav>
```

---

### Bước 2: Dọn dẹp các nhánh code thừa liên quan đến `workspacePanel === 'groups'` trong `src/app/App.jsx`

Vì mục "Nhóm" không còn là một workspace panel riêng biệt, cần dọn dẹp các điểm kiểm tra thừa để code sạch sẽ, rõ ràng:

1. **Tại dòng ~10664:**
   ```javascript
   // TRƯỚC:
   if (workspacePanel === 'groups') closeWorkspacePanel();
   // SAU: Xóa dòng này (không còn cần thiết).
   ```

2. **Tại dòng ~14213:**
   ```javascript
   // TRƯỚC:
   if (workspacePanel === 'groups' && isCreatingGroup) return true;
   // SAU: Xóa dòng này (navigation guard không còn panel 'groups').
   ```

3. **Tại dòng ~17051 (Overlay onMouseDown):**
   ```jsx
   // TRƯỚC:
   onMouseDown={event => {
     if (event.target === event.currentTarget && !(workspacePanel === 'groups' && isCreatingGroup)) closeWorkspacePanel();
   }}
   
   // SAU:
   onMouseDown={event => {
     if (event.target === event.currentTarget) closeWorkspacePanel();
   }}
   ```

4. **Tại dòng ~17057 (Tiêu đề Header Workspace Panel):**
   ```jsx
   // TRƯỚC:
   <h2 id="workspace-panel-title">{appCopy.t(workspacePanel === 'groups' ? appCopy.groups : workspacePanel === 'profile' ? 'Hồ sơ cá nhân' : workspacePanel === 'cloud' ? 'Cloud của tôi' : workspacePanel === 'contacts' ? 'Danh bạ' : workspacePanel === 'files' ? 'File dùng chung' : workspacePanel === 'enterprise' ? appCopy.work : workspacePanel === 'notifications' ? 'Thông báo' : workspacePanel === 'search' ? 'Tìm trong hội thoại' : appCopy.settings)}</h2>

   // SAU: Bỏ điều kiện workspacePanel === 'groups':
   <h2 id="workspace-panel-title">{appCopy.t(workspacePanel === 'profile' ? 'Hồ sơ cá nhân' : workspacePanel === 'cloud' ? 'Cloud của tôi' : workspacePanel === 'contacts' ? 'Danh bạ' : workspacePanel === 'files' ? 'File dùng chung' : workspacePanel === 'enterprise' ? appCopy.work : workspacePanel === 'notifications' ? 'Thông báo' : workspacePanel === 'search' ? 'Tìm trong hội thoại' : appCopy.settings)}</h2>
   ```

5. **Tại dòng ~17151 (Nút đóng Workspace Panel):**
   ```jsx
   // TRƯỚC:
   <button type="button" className="btn-close-detail" onClick={() => { if (workspacePanel === 'groups') closeCreateGroupModal(); closeWorkspacePanel(); }} aria-label={appCopy.t('Đóng')} title={appCopy.t('Đóng')} disabled={workspacePanel === 'groups' && isCreatingGroup}><i className="fa-solid fa-xmark"></i></button>

   // SAU:
   <button type="button" className="btn-close-detail" onClick={closeWorkspacePanel} aria-label={appCopy.t('Đóng')} title={appCopy.t('Đóng')}><i className="fa-solid fa-xmark"></i></button>
   ```

6. **Tại dòng ~17155 (Render form tạo nhóm dạng full page):**
   ```jsx
   // TRƯỚC:
   {workspacePanel === 'groups' && renderCreateGroupForm('page')}
   // SAU: Xóa bỏ dòng này hoàn toàn.
   ```

> [!IMPORTANT]
> **ĐIỀU CẤM KỴ - KHÔNG ĐƯỢC XÓA:**
> - Tuyệt đối **KHÔNG XÓA** hàm `renderCreateGroupForm` (dòng ~13584).
> - Tuyệt đối **KHÔNG XÓA** đoạn render modal ở cuối file `App.jsx` (dòng ~18257 - 18265):
>   ```jsx
>   {isCreateGroupOpen && (
>     <div className="modal-overlay" role="presentation" onMouseDown={...}>
>       {renderCreateGroupForm('modal')}
>     </div>
>   )}
>   ```
> - Tuyệt đối **KHÔNG XÓA** nút `+` trong Cột 2 Header (dòng ~14619 - 14621):
>   ```jsx
>   <button type="button" className="btn-action" title={appCopy.t('Tạo nhóm mới')} aria-label={appCopy.t('Tạo nhóm mới')} onClick={() => setIsCreateGroupOpen(true)}>
>     <i className="fa-solid fa-plus" aria-hidden="true"></i>
>   </button>
>   ```

---

### Bước 3: Cập nhật Router Web (`src/features/workspace/services/workspaceRouting.js`)

File `workspaceRouting.js` ánh xạ giữa đường dẫn trình duyệt và tên panel workspace.

```javascript
// TRƯỚC KHI SỬA:
const WORKSPACE_ROUTE_BY_PANEL = Object.freeze({
  enterprise: '/work',
  groups: '/groups',
  contacts: '/friends',
  settings: '/settings',
  profile: '/profile',
  files: '/files',
  cloud: '/my-cloud',
  notifications: '/notifications',
  search: '/search',
});
```

**Thao tác thực hiện:**
Bỏ dòng `groups: '/groups',`:

```javascript
// SAU KHI SỬA:
const WORKSPACE_ROUTE_BY_PANEL = Object.freeze({
  enterprise: '/work',
  contacts: '/friends',
  settings: '/settings',
  profile: '/profile',
  files: '/files',
  cloud: '/my-cloud',
  notifications: '/notifications',
  search: '/search',
});
```

**Cơ chế hoạt động sau khi sửa:**
- Hàm `workspacePanelFromPath(pathname)`: Khi người dùng gõ hoặc bookmark đường dẫn `/groups`, hàm sẽ tìm trong `WORKSPACE_PANEL_BY_ROUTE` và không thấy, tự động trả về `null`.
- Giá trị `null` đại diện cho màn hình chính (Chat conversation surface).
- Hàm `workspacePathForPanel('groups')`: Trả về fallback mặc định `/chat`.
- Kết quả: Khi người dùng truy cập `/groups`, web tự động hiển thị màn hình Chat chính, không bị lỗi 404, không vỡ giao diện.

---

### Bước 4: Cập nhật Unit Test Router (`src/features/workspace/services/workspaceRouting.test.js`)

Mở file `src/features/workspace/services/workspaceRouting.test.js`:

```javascript
// CẬP NHẬT TEST CASE ĐỂ BẢO ĐẢM /groups ĐƯỢC XỬ LÝ AN TOÀN VỀ NULL:
test('resolves known paths and treats chat/root as the conversation surface', () => {
  assert.equal(workspacePanelFromPath('/friends'), 'contacts');
  assert.equal(workspacePanelFromPath('/settings/'), 'settings');
  assert.equal(workspacePanelFromPath('/work'), 'enterprise');
  assert.equal(workspacePanelFromPath('/my-cloud'), 'cloud');
  assert.equal(workspacePanelFromPath('/chat'), null);
  assert.equal(workspacePanelFromPath('/groups'), null); // <-- Xác nhận /groups fallback về chat an toàn
  assert.equal(workspacePanelFromPath('/'), null);
  assert.equal(workspacePanelFromPath('/unknown'), null);
});
```

---

### Bước 5: Kiểm tra và dọn dẹp file prototype `src/App.jsx` (Nếu cần)

Trong file `src/App.jsx` (dòng 438 - 441):
```jsx
// NẾU CÓ:
<a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); setLegacyNotice("Chức năng [Nhóm] yêu cầu môi trường Enterprise."); }}>
  <i className="fa-solid fa-users"></i>
  <span>Nhóm</span>
</a>
// THAO TÁC: Xóa bỏ khối thẻ <a> này để giao diện prototype đồng bộ với src/app/App.jsx.
```

---

## V. NGUYÊN TẮC ZERO REGRESSION (BẢO TOÀN CÁC LUỒNG LIÊN QUAN)

Người thực hiện phải kiểm tra kỹ lưỡng các luồng sau đây để đảm bảo **tuyệt đối không phát sinh lỗi phụ**:

1. **Luồng Chat 1-1 và Chat Nhóm:**
   - Chọn một nhóm chat bất kỳ trong danh sách Cột 2 ➔ Cuộc trò chuyện mở bình thường ở Cột 3.
   - Gửi tin nhắn văn bản, emoji, sticker, ảnh, video, file, ghi âm giọng nói trong nhóm hoạt động bình thường.
   - Nhắc tên `@mention` thành viên trong nhóm hoạt động bình thường.
   - Mở Cột 4 ("Thông tin nhóm"): Xem danh sách thành viên, thêm thành viên, đổi tên nhóm, đổi ảnh đại diện nhóm, rời nhóm, chuyển quyền trưởng nhóm đều giữ nguyên chức năng.
2. **Luồng Tạo nhóm mới từ nút `+` (Chat Header):**
   - Bấm nút `+` cạnh tiêu đề "Cuộc trò chuyện" ở Cột 2 ➔ Modal `renderCreateGroupForm('modal')` mở lên.
   - Nhập tên nhóm, chọn thành viên từ danh sách đồng nghiệp, bấm "Tạo nhóm" ➔ Nhóm mới được tạo thành công qua Tinode và tự động kích hoạt phòng chat.
3. **Luồng Bộ lọc hội thoại (ConversationListToolbar):**
   - Tab "Tất cả": Hiển thị cả tin nhắn cá nhân và nhóm.
   - Tab "Nhóm": Chỉ hiển thị các nhóm chat (`room.isGroup`).
   - Tab "Phân loại": Mở menu lọc theo thẻ phân loại, trạng thái chưa đọc, tin nhắn người lạ.
4. **Luồng các mục Sidebar còn lại:**
   - **Chat**: Đóng mọi panel, hiển thị danh sách chat và phòng chat hiện tại.
   - **Công việc**: Bấm vào mở đúng Workspace Enterprise (`/work`), URL cập nhật thành `/work`.
   - **Danh bạ**: Bấm vào mở đúng panel Danh bạ (`/friends`), URL cập nhật thành `/friends`.
   - **Cài đặt**: Bấm vào mở đúng panel Cài đặt (`/settings`), URL cập nhật thành `/settings`.
   - **Profile cá nhân**: Bấm vào avatar ở chân trang mở đúng panel Hồ sơ cá nhân.
   - Nút thu gọn / mở rộng menu (`sidebar-collapse-toggle`): Hoạt động mượt mà ở cả chế độ thu nhỏ icon và mở rộng đầy đủ text.
5. **Mobile Guard:**
   - Kiểm tra `git status` trước và sau khi hoàn thành: `mobile/` **phải giữ nguyên 100% không có bất kỳ thay đổi nào**.

---

## VI. QUY TRÌNH XÁC MINH & BÀN GIAO (VERIFICATION CHECKLIST)

Sau khi sửa xong code, chạy các lệnh kiểm thử theo thứ tự:

### 1. Chạy toàn bộ Unit Tests Frontend
```powershell
npm run test:frontend
```
- **Yêu cầu:** Toàn bộ 458+ bài kiểm thử phải đạt kết quả `pass`, 0 bài `fail`.
- Đặc biệt bài kiểm thử `workspaceRouting.test.js` phải chạy qua thành công.

### 2. Chạy Build Production Vite
```powershell
npm run build
```
- **Yêu cầu:** Lệnh build hoàn tất thành công (`built in ...s`), không phát sinh bất kỳ lỗi bundle, thiếu import hay syntax error nào.

### 3. Kiểm tra Diff Git
```powershell
git status
```
- Xác nhận các file thay đổi chỉ gồm:
  + `src/app/App.jsx`
  + `src/features/workspace/services/workspaceRouting.js`
  + `src/features/workspace/services/workspaceRouting.test.js`
  + `src/App.jsx` (nếu có dọn prototype)
  + `docs/CHANGELOG.md`
- Xác nhận không có bất kỳ file nào trong `mobile/` bị chỉnh sửa.

### 4. Cập nhật `docs/CHANGELOG.md`
Ghi nhận thay đổi lên đầu mục Lịch sử thay đổi theo đúng chuẩn `AGENTS.md`:
- **Loại:** Tinh nang | Tai cau truc
- **Trạng thái:** Hoan tat
- **Mục tiêu:** Loại bỏ phân mục "Nhóm" thừa trên Sidebar Primary Web ViChat, tinh gọn menu về 4 mục cốt lõi và bảo toàn trọn vẹn luồng nhóm trong phân hệ Chat.
- **Phạm vi:** Web UI (`src/app/App.jsx`, `src/features/workspace/services/workspaceRouting.js`).

---

## VII. TỔNG KẾT BÀN GIAO

Prompt này đã được thiết kế đầy đủ, chi tiết từ hiện trạng, nguyên nhân kỹ thuật, ma trận code so sánh diff, danh mục bảo toàn tính năng, đến quy trình kiểm thử và nghiệm thu nghiêm ngặt. Bất kỳ AI Agent hoặc lập trình viên nào khi tiếp nhận tài liệu này đều có thể thực hiện thay đổi một cách chuẩn xác 100%, an toàn tuyệt đối và không gây bất kỳ tác dụng phụ nào cho hệ thống.
