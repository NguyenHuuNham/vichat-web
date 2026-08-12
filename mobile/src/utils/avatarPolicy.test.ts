import { describe, expect, it } from 'vitest';
import { avatarUploadErrorMessage, canKeepTinodeAvatarAfterProfileRejection } from './avatarPolicy';

describe('avatar policy', () => {
  it('keeps a Tinode avatar when Account profile persistence is read-only', () => {
    expect(canKeepTinodeAvatarAfterProfileRejection({ status: 403, code: 'ACCOUNT_PROFILE_READ_ONLY' })).toBe(true);
    expect(canKeepTinodeAvatarAfterProfileRejection({ status: 403, code: 'ACCOUNT_PROFILE_UPDATE_FORBIDDEN' })).toBe(true);
    expect(canKeepTinodeAvatarAfterProfileRejection({ status: 403, code: 'ACCOUNT_LOGIN_REQUIRED' })).toBe(false);
  });

  it('maps avatar upload failures to actionable messages', () => {
    expect(avatarUploadErrorMessage({ code: 'ACCOUNT_AVATAR_UPLOAD_NOT_CONFIGURED' })).toContain('chưa cấu hình');
    expect(avatarUploadErrorMessage({ code: 'ACCOUNT_AVATAR_UNSUPPORTED' })).toContain('Tinode');
    expect(avatarUploadErrorMessage({ status: 408 })).toContain('mất kết nối');
    expect(avatarUploadErrorMessage({ message: 'Server rejected image' })).toBe('Server rejected image');
  });
});
