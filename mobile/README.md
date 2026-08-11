# ViChat Mobile

Ứng dụng React Native/Expo SDK 57 cho Android và iOS, dùng chung Chatmgt + Tinode với ChatUI web production.

## Luồng production

- Đăng nhập qua `POST /api/v1/auth/account-login` với `X-Vichat-Client: mobile`. Chatmgt chỉ trả `access_token` khi `CHAT_MOBILE_BEARER_ENABLED=true`; web vẫn cookie-only.
- JWT Chatmgt được lưu trong `expo-secure-store`. Mật khẩu không được lưu hoặc gửi tới Tinode. Native fetch giữ Account `session` cookie để các endpoint SSO server-side tiếp tục xác minh tenant.
- Danh bạ lấy trực tiếp từ `/api/v1/chat/users` và chỉ hiển thị nhân viên active trong tenant hiện tại. Không có luồng kết bạn trung gian.
- Metadata conversation/workspace ở Chatmgt; tin nhắn, presence, receipt, reaction và file ở Tinode qua `wss://chat.upgo.vn`.
- Gọi điện và push được capability-gated (`false` mặc định) cho đến khi credential/native setup tương ứng được cấu hình. Không hiển thị “Tri thức AI”. Chatbot là topic Tinode do Chatmgt cấp.

## Chạy và kiểm tra

```powershell
npm install
npm run typecheck
npm test
npm run lint
npm run export
npx expo start --dev-client
```

Đây là development-build project, không dùng Expo Go cho push/native cookie verification. Android APK/AAB và iOS archive cần JDK/Android SDK hoặc EAS credentials; máy Windows hiện tại chỉ có thể kiểm tra TypeScript, unit test và export.

Không commit `.env` hoặc token/session thật.
