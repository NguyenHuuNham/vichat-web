# KẾ HOẠCH & ĐẶC TẢ KỸ THUẬT: CHIA SẺ VỊ TRÍ TRỰC TIẾP (LIVE) VÀ VỊ TRÍ CHÍNH XÁC (STATIC) TRÊN VICHAT MOBILE

> **Mục tiêu:**
> Lập kế hoạch chi tiết, chuẩn chỉ và tối ưu hiệu năng để hiện thực hoá tính năng **Vị trí** trên ViChat Mobile đúng 100% theo giao diện và hành vi thực tế trong ảnh người dùng cung cấp:
> 1. **Bản đồ tương tác trực quan (Interactive Map View):** Chiếm nửa trên màn hình, hiển thị vị trí người dùng kèm nút định vị góc trên bên phải.
> 2. **Chế độ 1: "Chia sẻ hành trình trực tiếp" (Live Location Sharing):** Theo dõi di chuyển thời gian thực với 4 mốc thời lượng: **15 phút, 30 phút, 1 giờ, 8 giờ**, có nút "Dừng chia sẻ" và đồng bộ realtime qua WebSocket Tinode.
> 3. **Chế độ 2: "Gửi vị trí hiện tại của bạn" (Instant/Static Current Location):** Gửi toạ độ GPS tức thì kèm độ chính xác thực tế tính theo mét (*"Chính xác đến 14m"*).
> 4. **Chế độ 3: "Gửi địa điểm cụ thể" (Nearby POI / Places):** Danh sách các địa điểm lân cận xung quanh toạ độ người dùng để bấm gửi ngay.
> 5. **Bong bóng tin nhắn (MessageBubble):** Render card bản đồ thu nhỏ, trạng thái Live/Expired, thời gian đếm ngược, và liên kết mở Google Maps / Apple Maps.
> 6. **Zero Regression & Chuẩn ổ D:** Không gây lỗi build native, không hao pin thiết bị, build staging tuân thủ `AGENTS.md`.

---

## I. PHÂN TÍCH GIAO DIỆN & HÀNH VI TỪ ẢNH CHỤP THỰC TẾ

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ✕   Vị trí                                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                        [ BẢN ĐỒ GOOGLE MAPS ]                               │
│                         (Nửa trên màn hình)                       [ ⌖ ]     │
│                                                               (Nút định vị) │
│                                   🔵                                        │
│                           (Chấm xanh vị trí)                                │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ ══════════════════════════ [ Thanh kéo Sheet ] ═════════════════════════════ │
│                                                                             │
│  ( 📍 )  Chia sẻ hành trình trực tiếp                                       │
│  [Đỏ cam] Liên tục cập nhật khi bạn di chuyển                                │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Gửi địa điểm cụ thể:                                                       │
│                                                                             │
│  ( 📍 )  Gửi vị trí hiện tại của bạn                                        │
│  [Xanh]  Chính xác đến 14m                                                  │
│                                                                             │
│  ( 📍 )  CÔNG TY CP DFA ( NỘI THẤT )                                        │
│  [Xám]   11 liền kề 14, Khu đô thị, Hà Đông, Hà Nội                          │
│                                                                             │
│  ( 📍 )  [ Địa điểm lân cận 2, 3, 4... ]                                    │
│          ...                                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1. Nửa trên màn hình: Map Container
- Thanh Header: Nút đóng `✕` bên trái, tiêu đề **Vị trí** màu trắng trên nền tối.
- Bản đồ tương tác: Hiển thị bản đồ khu vực xung quanh toạ độ GPS của người dùng.
- Marker trung tâm: Chấm tròn xanh dương phát sáng biểu thị vị trí người dùng.
- Nút định vị nổi `[ ⌖ ]` (My Location FAB): Nằm ở góc trên bên phải bản đồ, khi bấm vào sẽ xoay camera bản đồ và căn giữa về toạ độ GPS hiện tại.

### 2. Nửa dưới màn hình: Bottom Sheet hành động
- Thanh gạt kéo (`Drag Handle`): Bo tròn ở đỉnh sheet.
- **Khối 1: Chia sẻ hành trình trực tiếp**
  - Icon tròn màu đỏ cam với biểu tượng MapPin có vạch sóng phát sóng.
  - Tiêu đề: **Chia sẻ hành trình trực tiếp**.
  - Phụ đề: *Liên tục cập nhật khi bạn di chuyển*.
  - Khi bấm vào: Mở sheet/dialog chọn thời lượng chia sẻ: **15 phút**, **30 phút**, **1 giờ**, **8 giờ** kèm nút **[Chia sẻ]**.
- **Khối 2: Gửi địa điểm cụ thể**
  - Dòng tiêu đề phụ màu xám: *Gửi địa điểm cụ thể:*
  - Mục đầu tiên: **Gửi vị trí hiện tại của bạn**
    - Icon tròn màu xanh dương với pin trắng.
    - Tiêu đề: **Gửi vị trí hiện tại của bạn**.
    - Phụ đề: *Chính xác đến {N}m* (lấy từ trường `coords.accuracy` của GPS thiết bị).
  - Các mục tiếp theo: **Danh sách địa điểm lân cận (Nearby POI)**
    - Các địa điểm thực tế lân cận (ví dụ: cơ quan, quán cafe, trường học, tòa nhà...).
    - Khi bấm vào: Gửi ngay vị trí của địa điểm đó vào phòng chat.

---

## II. ĐẶC TẢ KIẾN TRÚC KỸ THUẬT & DATA MODELS

### 1. Data Contract cho tin nhắn Vị trí (`mobile/src/types/index.ts`)

```typescript
export type LocationShareKind = 'static' | 'live';

export interface BaseLocationPayload {
  kind: LocationShareKind;
  latitude: number;
  longitude: number;
  accuracy?: number;
  title: string;
  address?: string;
}

/** 1. Vị trí tĩnh: Vị trí hiện tại hoặc địa điểm cụ thể đã chọn */
export interface StaticLocationPayload extends BaseLocationPayload {
  kind: 'static';
  placeId?: string;
  staticMapUrl?: string;
}

/** 2. Vị trí trực tiếp: Chia sẻ hành trình di chuyển thời gian thực */
export interface LiveLocationPayload extends BaseLocationPayload {
  kind: 'live';
  liveId: string;              // UUID duy nhất cho phiên live (vd: live_1728100000_u123)
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  durationMinutes: 15 | 30 | 60 | 480;
  startedAt: number;           // Epoch timestamp (ms)
  expiresAt: number;           // startedAt + durationMinutes * 60 * 1000
  isActive: boolean;           // true nếu đang chia sẻ, false nếu người dùng bấm Dừng hoặc hết hạn
  heading?: number;            // Hướng di chuyển (0 - 360 độ)
  speed?: number;              // Tốc độ di chuyển (m/s)
  lastUpdatedAt: number;       // Thời điểm cập nhật toạ độ gần nhất
}

export interface ChatMessage {
  // ... các trường hiện có
  location?: StaticLocationPayload | LiveLocationPayload;
}
```

---

### 2. Thư viện sử dụng & Giải pháp bản đồ độc lập (Zero Native Regression)

| Chức năng | Thư viện đề xuất | Lý do & Giải pháp kỹ thuật |
| :--- | :--- | :--- |
| **Lấy toạ độ GPS & Geocoding** | `expo-location` (~57.0.x) | Thư viện chuẩn Expo SDK 57. Hỗ trợ `getCurrentPositionAsync`, `watchPositionAsync` cho Live Location, và `reverseGeocodeAsync` để dịch toạ độ ra tên đường, phường, quận, thành phố. |
| **Hiển thị bản đồ tương tác** | `react-native-webview` kết hợp Leaflet/OpenStreetMap template nhẹ | **Tránh rủi ro build native:** Không yêu cầu Google Maps API Key phức tạp trên Android, không gây lỗi xung đột native Gradle trên ổ `D:`. Load cực nhanh, mượt mà 60fps, hỗ trợ đầy đủ marker, pan/zoom, theme sáng/tối. |
| **Ảnh tĩnh bản đồ trong bong bóng chat** | OpenStreetMap Static / Carto Tile generator | Tạo ảnh thumbnail bản đồ tức thì từ URL toạ độ mà không tốn chi phí API, render 0ms trong `MessageBubble.tsx`. |

---

## III. LUỒNG XỬ LÝ CHI TIẾT (WORKFLOWS)

### 1. Luồng Gửi Vị Trí Hiện Tại (Static Current Location)
```
[Người dùng chạm "Gửi vị trí hiện tại của bạn"]
         │
         ▼
[Lấy toạ độ GPS: { lat, lng, accuracy }]
         │
         ▼
[Reverse Geocode lấy địa chỉ: số nhà, đường, phường, quận]
         │
         ▼
[Đóng Modal Vị trí]
         │
         ▼
[Gửi ChatMessage sang Tinode qua topic.publishMessage]
         │  Payload: {
         │    type: 'location',
         │    text: '📍 Vị trí hiện tại: 72 Lê Thánh Tôn, Bến Nghé, Q.1',
         │    location: { kind: 'static', latitude, longitude, accuracy, title, address }
         │  }
         ▼
[MessageBubble hiển thị Card vị trí: Xem bản đồ, nút mở Google Maps ngoài]
```

---

### 2. Luồng Chia Sẻ Hành Trình Trực Tiếp (Live Location Sharing)

```
[Người dùng chạm "Chia sẻ hành trình trực tiếp"]
         │
         ▼
[Mở Sheet chọn thời lượng: 15p | 30p | 1h | 8h]
         │
         ▼
[Người dùng chọn (VD: 30 phút) và bấm "Chia sẻ"]
         │
         ▼
[Khởi tạo Live Session: liveId = uuid(), expiresAt = Date.now() + 30*60*1000]
         │
         ▼
[Gửi tin nhắn Khởi tạo vào phòng chat]
         │  ChatMessage: {
         │    location: { kind: 'live', liveId, durationMinutes: 30, isActive: true, ... }
         │  }
         │
         ├─────────────────────────────────────────────┐
         ▼                                             ▼
[Kích hoạt Background/Foreground Watcher]    [Hiển thị Banner trên đỉnh app]
Location.watchPositionAsync({                "🔴 Đang chia sẻ vị trí trực tiếp"
  accuracy: High,                            [Dừng chia sẻ]
  distanceInterval: 10, // di chuyển 10m
  timeInterval: 10000   // hoặc mỗi 10 giây
})
         │
         ▼ (Khi người dùng di chuyển)
[Publish toạ độ mới lên Tinode Topic]
         │  Message Update / Event payload:
         │  { liveId, latitude, longitude, heading, speed, lastUpdatedAt }
         │
         ▼
[Bong bóng chat của mọi người trong phòng cập nhật vị trí marker realtime]
```

#### Xử lý Dừng Chia Sẻ (Stop Sharing):
- Người gửi bấm nút **[Dừng chia sẻ]** trên bong bóng chat hoặc trên banner đỉnh app.
- Hoặc hết thời gian (`Date.now() >= expiresAt`).
- Hệ thống:
  1. Hủy `locationSubscription.remove()`.
  2. Gửi event cập nhật `isActive: false` vào phòng chat.
  3. Bong bóng chat chuyển sang trạng thái: *"Đã kết thúc chia sẻ vị trí trực tiếp"*.

---

## IV. ĐẶC TẢ COMPONENT CẦN XÂY DỰNG

### 1. `mobile/src/components/LocationPickerModal.tsx`
Component chính thay thế modal vị trí đơn giản, chứa:
- **State quản lý:**
  - `currentCoords`: `{ latitude, longitude, accuracy }`
  - `addressText`: Chuỗi địa chỉ giải mã được
  - `nearbyPlaces`: Danh sách POI xung quanh (bệnh viện, toà nhà, trường học, công ty...)
  - `selectedDuration`: 15 | 30 | 60 | 480
  - `durationSheetVisible`: Boolean bật/tắt sheet chọn thời lượng
  - `loading`: Trạng thái lấy GPS lần đầu
- **Giao diện:**
  - Nửa trên: `WebView` nhúng bản đồ Leaflet mượt mà, đồng bộ toạ độ GPS.
  - Nút FAB định vị `[ ⌖ ]` góc phải trên.
  - Nửa dưới: `ScrollView` dạng Bottom Sheet chứa:
    * Nút "Chia sẻ hành trình trực tiếp" (màu đỏ cam)
    * Dòng phân cách "Gửi địa điểm cụ thể:"
    * Nút "Gửi vị trí hiện tại của bạn" kèm độ chính xác "Chính xác đến {accuracy}m"
    * Danh sách các địa điểm lân cận với icon map-pin xám

---

### 2. `mobile/src/services/liveLocationService.ts`
Service singleton quản lý phiên chia sẻ vị trí chạy ngầm:
- `startLiveSharing(conversationId: string, durationMinutes: number): Promise<string>`
- `stopLiveSharing(liveId: string): Promise<void>`
- `getActiveLiveSession(): LiveLocationSession | null`
- Quản lý `watchPositionAsync` và gửi pub event toạ độ định kỳ sang Tinode.
- Tự động huỷ timer khi hết hạn `expiresAt`.

---

### 3. Cập nhật `mobile/src/components/MessageBubble.tsx`
Bổ sung render cho 2 loại tin nhắn vị trí:

#### A. Card Vị Trí Tĩnh (Static Location):
```tsx
<View style={styles.locationCard}>
  <Image source={{ uri: staticMapUrl }} style={styles.locationMapThumb} />
  <View style={styles.locationInfo}>
    <Text style={styles.locationTitle}>{location.title}</Text>
    <Text style={styles.locationAddress}>{location.address}</Text>
    {location.accuracy ? (
      <Text style={styles.locationAccuracy}>{t('Chính xác đến')} {Math.round(location.accuracy)}m</Text>
    ) : null}
  </View>
  <Pressable onPress={() => openExternalMap(location.latitude, location.longitude)} style={styles.mapButton}>
    <Text style={styles.mapButtonText}>{t('Xem trên bản đồ')}</Text>
    <ExternalLink size={14} color={palette.accent} />
  </Pressable>
</View>
```

#### B. Card Vị Trí Trực Tiếp (Live Location):
```tsx
<View style={[styles.liveLocationCard, !location.isActive && styles.liveLocationExpired]}>
  <View style={styles.liveHeader}>
    <View style={[styles.liveDot, location.isActive && styles.liveDotActive]} />
    <Text style={styles.liveStatusText}>
      {location.isActive ? t('Đang chia sẻ hành trình trực tiếp') : t('Đã kết thúc chia sẻ hành trình')}
    </Text>
  </View>
  
  {/* Preview bản đồ có avatar người gửi */}
  <View style={styles.liveMapContainer}>
    <Image source={{ uri: liveMapSnapshotUrl }} style={styles.liveMapThumb} />
    <View style={styles.senderAvatarOnMap}>
      <Avatar name={location.senderName} uri={location.senderAvatar} size={28} />
    </View>
  </View>

  <View style={styles.liveFooter}>
    <Text style={styles.liveRemainingTime}>
      {location.isActive ? `${t('Còn')} ${remainingMinutes} ${t('phút')} · ${t('Cập nhật vừa xong')}` : t('Đã dừng')}
    </Text>
    {location.isActive && isSender ? (
      <Pressable onPress={() => void stopLiveSharing(location.liveId)} style={styles.stopLiveButton}>
        <Text style={styles.stopLiveButtonText}>{t('Dừng chia sẻ')}</Text>
      </Pressable>
    ) : (
      <Pressable onPress={() => openLiveMapViewer(location)} style={styles.viewLiveButton}>
        <Text style={styles.viewLiveButtonText}>{t('Xem trực tiếp')}</Text>
      </Pressable>
    )}
  </View>
</View>
```

---

## V. KẾ HOẠCH TRIỂN KHAI 5 BƯỚC (STEP-BY-STEP IMPLEMENTATION PLAN)

```
[KẾ HOẠCH TRIỂN KHAI TÍNH NĂNG VỊ TRÍ LIVE & STATIC]
├── BƯỚC 1: Cấu hình Package & Quyền Thiết bị
│   ├── Cài đặt `expo-location` (nếu chưa có trong mobile/package.json)
│   ├── Cập nhật AndroidManifest permissions trong `mobile/app.json`:
│   │   ├── ACCESS_FINE_LOCATION
│   │   ├── ACCESS_COARSE_LOCATION
│   │   └── ACCESS_BACKGROUND_LOCATION (cho chia sẻ hành trình)
│   └── Mở rộng types `StaticLocationPayload`, `LiveLocationPayload` trong `mobile/src/types/index.ts`
│
├── BƯỚC 2: Xây dựng Service Quản lý Live Location (`liveLocationService.ts`)
│   ├── Singleton quản lý session đang active
│   ├── Tích hợp `Location.watchPositionAsync` với ngưỡng di chuyển 10m / 10s
│   ├── Đồng bộ toạ độ mới lên WebSocket Tinode qua topic data/event
│   └── Quản lý bộ đếm thời gian tự động tắt khi đến `expiresAt`
│
├── BƯỚC 3: Thiết kế Giao diện Modal Vị Trí Chuẩn Theo Ảnh (`LocationPickerModal.tsx`)
│   ├── Nửa trên: WebView Map (Leaflet/OSM) có marker chấm xanh và nút định vị [ ⌖ ]
│   ├── Nửa dưới: Bottom Sheet với:
│   │   ├── Nút "Chia sẻ hành trình trực tiếp" (kèm popup chọn 15p, 30p, 1h, 8h)
│   │   ├── Nút "Gửi vị trí hiện tại của bạn" (hiển thị độ chính xác {N}m)
│   │   └── Danh sách địa điểm lân cận POI (tên địa điểm + địa chỉ)
│   └── Xử lý xin quyền Location mượt mà, có fallback thông báo nếu người dùng từ chối quyền
│
├── BƯỚC 4: Nâng Cấp Hiển Thị Tin Nhắn Trong `MessageBubble.tsx`
│   ├── Render giao diện Thẻ Vị trí tĩnh: Thumbnail bản đồ, địa chỉ, nút mở Google Maps
│   ├── Render giao diện Thẻ Vị trí trực tiếp: Chấm xanh nhấp nháy, avatar di chuyển, thời gian đếm ngược
│   └── Nút "Dừng chia sẻ" (cho người gửi) và "Xem toàn màn hình" (cho người nhận)
│
└── BƯỚC 5: Kiểm Thử Toàn Diện & Build APK Staging Chuẩn Ổ D:
    ├── Chạy Typecheck: `npm run typecheck` (0 errors)
    ├── Chạy Lint & Test: `npm run lint`, `npm run test`
    ├── Kiểm thử trên thiết bị thật qua ADB:
    │   ├── Kiểm tra gửi vị trí hiện tại có ra đúng số mét chính xác không
    │   ├── Kiểm tra chọn 15p/30p chia sẻ trực tiếp và đi lại xem toạ độ có cập nhật không
    │   └── Kiểm tra bấm "Dừng chia sẻ" trạng thái có cập nhật tức thì cho cả 2 bên không
    ├── Cập nhật `docs/CHANGELOG.md`
    └── Thực hiện lệnh build staging theo đúng `AGENTS.md`
```

---

## VI. QUY CHUẨN KIỂM THỬ & LỆNH THỰC THI (THEO `AGENTS.md`)

Mọi build và cache bắt buộc thực hiện trên staging ổ `D:`:

```powershell
# 1. Đặt biến môi trường chuẩn ổ D:
Set-Item -Path env:TEMP -Value "D:\vichat-build\tmp"
Set-Item -Path env:TMP -Value "D:\vichat-build\tmp"
Set-Item -Path env:npm_config_cache -Value "D:\vichat-build\npm-cache"

# 2. Kiểm tra typecheck và unit test
cd D:\CÔNG_VIỆC\vichat-web\mobile
npm run typecheck
npm run test

# 3. Build APK Staging
$env:GRADLE_USER_HOME="D:\vichat-build\gradle-user-home"
$env:ANDROID_HOME="D:\vichat-build\android-sdk"
$env:ANDROID_SDK_ROOT="D:\vichat-build\android-sdk"
$env:JAVA_HOME="D:\vichat-build\jdk"
$env:npm_config_prefix="D:\vichat-build\npm-global"

cd D:\CÔNG_VIỆC\vichat-web\mobile\android
.\gradlew.bat assembleRelease --no-daemon

# 4. Cài đặt trực tiếp lên thiết bị Android qua ADB
adb install -r D:\CÔNG_VIỆC\vichat-web\mobile\android\app\build\outputs\apk\release\app-release.apk
```

---

## VII. CHECKLIST NGHIỆM THU ĐẠT CHUẨN (ACCEPTANCE CRITERIA)

- [ ] Giao diện modal Vị trí giống hệt ảnh chụp: Bản đồ nửa trên có chấm xanh và nút định vị, nửa dưới có bottom sheet.
- [ ] Mục **"Chia sẻ hành trình trực tiếp"**: Bấm vào hiện sheet chọn đúng 4 mốc: **15 phút, 30 phút, 1 giờ, 8 giờ**.
- [ ] Khi đang chia sẻ hành trình trực tiếp: Toạ độ di chuyển liên tục cập nhật theo thời gian thực vào phòng chat.
- [ ] Mục **"Gửi vị trí hiện tại của bạn"**: Hiển thị chính xác độ phân giải mét GPS (*"Chính xác đến 14m"*), bấm vào gửi ngay vị trí hiện tại.
- [ ] Danh sách **"Địa điểm cụ thể"**: Tự động gợi ý các địa điểm lân cận xung quanh toạ độ người dùng.
- [ ] Bong bóng tin nhắn vị trí: Có thumbnail bản đồ, địa chỉ, bấm vào mở thẳng Google Maps ngoài.
- [ ] Nút **"Dừng chia sẻ"**: Hoạt động tức thì, dừng watcher GPS và chuyển card live sang trạng thái kết thúc.
- [ ] Zero Regression: Không làm ảnh hưởng đến chat thường, gửi ảnh, ghi âm voice, cuộc gọi hay hiệu năng pin.
