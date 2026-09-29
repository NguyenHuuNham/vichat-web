import { GroupSettings } from '../types';

export const GROUP_SETTING_KEYS = [
  'allowMembersEditInfo',
  'allowPinMessages',
  'allowMessages',
  'allowPolls',
  'approveMembers',
  'newMemberHistory',
] as const;

export const DEFAULT_GROUP_SETTINGS: GroupSettings = {
  allowMembersEditInfo: false,
  allowPinMessages: true,
  allowMessages: true,
  allowPolls: true,
  approveMembers: false,
  newMemberHistory: true,
};

export function normalizeGroupSettings(value: unknown): GroupSettings {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return GROUP_SETTING_KEYS.reduce((settings, key) => {
    settings[key] = typeof source[key] === 'boolean' ? source[key] as boolean : DEFAULT_GROUP_SETTINGS[key];
    return settings;
  }, { ...DEFAULT_GROUP_SETTINGS });
}

export function groupSettingEnabled(settings: unknown, key: keyof GroupSettings) {
  return normalizeGroupSettings(settings)[key] === true;
}

function explicitGroupRole(member: { role?: string; groupRole?: string } | null | undefined) {
  const groupRole = String(member?.groupRole || '').trim().toUpperCase();
  if (groupRole) return groupRole;
  const role = String(member?.role || '').trim().toUpperCase();
  return ['OWNER', 'ADMIN', 'MEMBER'].includes(role) ? role : '';
}

export function memberIsOwner(member: { mode?: string; role?: string; groupRole?: string } | null | undefined) {
  const role = explicitGroupRole(member);
  if (role) return role === 'OWNER';
  return String(member?.mode || '').toUpperCase().includes('O');
}

export function memberIsAdmin(member: { mode?: string; role?: string; groupRole?: string } | null | undefined) {
  const role = explicitGroupRole(member);
  if (role) return role === 'OWNER' || role === 'ADMIN';
  const mode = String(member?.mode || '').toUpperCase();
  // Chatmgt materializes deputies as JRWPASD and owners as JRWPASO.
  return mode.includes('O') || mode.includes('D');
}
