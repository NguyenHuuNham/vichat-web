# ViChat Mobile

Ứng dụng React Native/Expo SDK 57 cho Android và iOS, dùng chung Chatmgt + Tinode với ChatUI web production.

## Luồng production

- Đăng nhập qua `POST /api/v1/auth/account-login` với `X-Vichat-Client: mobile`. Chatmgt chỉ trả `access_token` khi `CHAT_MOBILE_BEARER_ENABLED=true`; web vẫn cookie-only.
- JWT Chatmgt được lưu trong `expo-secure-store`. Mật khẩu không được lưu hoặc gửi tới Tinode. Native fetch giữ Account `session` cookie để các endpoint SSO server-side tiếp tục xác minh tenant.
- Danh bạ lấy trực tiếp từ `/api/v1/chat/users` và chỉ hiển thị nhân viên active trong tenant hiện tại. Không có luồng kết bạn trung gian.
- Metadata conversation/workspace ở Chatmgt; tin nhắn, presence, receipt, reaction và file ở Tinode qua `wss://chat.upgo.vn`.
- Gọi điện được bật khi Tinode trả ICE/TURN; Android native phải có cả `CAMERA` và `RECORD_AUDIO`. Push vẫn capability-gated cho đến khi credential/provider native tương ứng được cấu hình. Không hiển thị “Tri thức AI”. Chatbot là topic Tinode do Chatmgt cấp.

## Chạy và kiểm tra

```powershell
npm install
npm run typecheck
npm test
npm run lint
npm run export
npx expo start --dev-client
```

Đây là development-build project, không dùng Expo Go cho push/native cookie verification. Trước mỗi Android release phải chạy `npx expo prebuild --platform android --no-install`, rồi kiểm tra APK bằng `aapt dump permissions` để bảo đảm có cả `android.permission.CAMERA` và `android.permission.RECORD_AUDIO`. Android APK/AAB và iOS archive cần JDK/Android SDK hoặc EAS credentials.

Không commit `.env` hoặc token/session thật.
