type AvatarError = {
  code?: unknown;
  status?: unknown;
  message?: unknown;
};

function readError(error: unknown): AvatarError {
  return error && typeof error === 'object' ? error as AvatarError : {};
}

export function canKeepTinodeAvatarAfterProfileRejection(error: unknown) {
  const value = readError(error);
  return Number(value.status || 0) === 403 && [
    'ACCOUNT_PROFILE_READ_ONLY',
    'ACCOUNT_PROFILE_UPDATE_FORBIDDEN',
  ].includes(String(value.code || ''));
}

export function avatarUploadErrorMessage(error: unknown) {
  const value = readError(error);
  const code = String(value.code || '');
  const status = Number(value.status || 0);
  const message = String(value.message || '');
  if (code === 'ACCOUNT_AVATAR_UPLOAD_NOT_CONFIGURED') {
    return 'Máy chủ chưa cấu hình dịch vụ upload avatar. Vui lòng báo quản trị viên.';
  }
  if (code === 'ACCOUNT_AVATAR_UNSUPPORTED') {
    return 'Tài khoản không hỗ trợ upload trực tiếp. Cần kết nối Tinode để upload avatar thay thế.';
  }
  if (status === 408 || code === 'REQUEST_TIMEOUT' || /network request failed|failed to fetch|timeout|kết nối/i.test(message)) {
    return 'Upload avatar quá thời gian hoặc mất kết nối. Vui lòng kiểm tra mạng và thử lại.';
  }
  return message || 'Thử lại sau.';
}
