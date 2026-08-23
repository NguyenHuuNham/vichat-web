export const GROUP_SETTING_KEYS = Object.freeze([
  'allowMembersEditInfo',
  'allowPinMessages',
  'allowMessages',
  'approveMembers',
  'newMemberHistory',
]);

export const DEFAULT_GROUP_SETTINGS = Object.freeze({
  allowMembersEditInfo: false,
  allowPinMessages: true,
  allowMessages: true,
  approveMembers: false,
  newMemberHistory: true,
});

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
