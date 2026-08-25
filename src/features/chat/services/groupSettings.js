export const GROUP_SETTING_KEYS = Object.freeze([
  'allowMembersEditInfo',
  'allowPinMessages',
  'allowMessages',
  'allowPolls',
  'approveMembers',
  'newMemberHistory',
]);

export const DEFAULT_GROUP_SETTINGS = Object.freeze({
  allowMembersEditInfo: false,
  allowPinMessages: true,
  allowMessages: true,
  allowPolls: true,
  approveMembers: false,
  newMemberHistory: true,
});

// Keep permission-denied copy consistent across Chatmgt, Tinode and the UI.
export const GROUP_INFO_PERMISSION_MESSAGE = 'Bạn chưa được admin cấp phép.';

export function isGroupInfoPermissionError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const code = String(error?.code || error?.error_code || '').trim().toUpperCase();
  const detail = String(error?.message || error?.text || error?.error_message || '').trim().toLowerCase();
  return status === 403
    || code === '403'
    || code === 'HTTP_403'
    || code === 'FORBIDDEN'
    || code === 'GROUP_INFO_PERMISSION_REQUIRED'
    || /(?:\b403\b|forbidden|permission|quyền|từ chối|administrator permission)/i.test(detail);
}

export function groupInfoErrorMessage(error, fallback = '') {
  return isGroupInfoPermissionError(error)
    ? GROUP_INFO_PERMISSION_MESSAGE
    : (error?.message || fallback);
}

export function normalizeGroupSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return GROUP_SETTING_KEYS.reduce((settings, key) => {
    settings[key] = typeof source[key] === 'boolean'
      ? source[key]
      : DEFAULT_GROUP_SETTINGS[key];
    return settings;
  }, { ...DEFAULT_GROUP_SETTINGS });
}

export function groupSettingEnabled(settings, key) {
  return normalizeGroupSettings(settings)[key] === true;
}
