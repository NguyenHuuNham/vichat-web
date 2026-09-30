import AsyncStorage from '@react-native-async-storage/async-storage';

export type ConversationDisplayMode = 'comfortable' | 'compact';
export type ConversationCategory = '' | 'customer' | 'work' | 'urgent' | 'follow-up' | 'other';

export interface ConversationViewerPreference {
  displayMode: ConversationDisplayMode;
  category: ConversationCategory;
  hidden: boolean;
}

const STORAGE_PREFIX = 'vichat.mobile.conversation-preferences.v1';
const DEFAULT_PREFERENCE: ConversationViewerPreference = {
  displayMode: 'comfortable',
  category: '',
  hidden: false,
};

function scopeKey(viewerId: string, tenantId: string) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(String(tenantId || 'default'))}:${encodeURIComponent(String(viewerId || 'anonymous'))}`;
}

function normalizePreference(value: unknown): ConversationViewerPreference {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const displayMode = record.displayMode === 'compact' ? 'compact' : 'comfortable';
  const categories: ConversationCategory[] = ['', 'customer', 'work', 'urgent', 'follow-up', 'other'];
  const category = categories.includes(record.category as ConversationCategory) ? record.category as ConversationCategory : '';
  return { displayMode, category, hidden: record.hidden === true };
}

export function conversationPreferenceStorageKey(viewerId: string, tenantId: string) {
  return scopeKey(viewerId, tenantId);
}

export function normalizeConversationPreference(value: unknown) {
  return normalizePreference(value);
}

async function readAll(viewerId: string, tenantId: string): Promise<Record<string, ConversationViewerPreference>> {
  if (!viewerId) return {};
  try {
    const raw = await AsyncStorage.getItem(scopeKey(viewerId, tenantId));
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed)
      .filter(([key, value]) => Boolean(String(key).trim()) && value && typeof value === 'object')
      .map(([key, value]) => [key, normalizePreference(value)]));
  } catch {
    return {};
  }
}

export async function loadConversationPreference(viewerId: string, tenantId: string, conversationId: string) {
  const key = String(conversationId || '').trim();
  if (!key) return { ...DEFAULT_PREFERENCE };
  const all = await readAll(viewerId, tenantId);
  return { ...DEFAULT_PREFERENCE, ...(all[key] || {}) };
}

export async function loadConversationPreferences(viewerId: string, tenantId: string) {
  return readAll(viewerId, tenantId);
}

export async function saveConversationPreference(
  viewerId: string,
  tenantId: string,
  conversationId: string,
  patch: Partial<ConversationViewerPreference>,
) {
  const key = String(conversationId || '').trim();
  if (!viewerId || !key) return { ...DEFAULT_PREFERENCE };
  const all = await readAll(viewerId, tenantId);
  const next = { ...DEFAULT_PREFERENCE, ...(all[key] || {}), ...patch };
  all[key] = normalizePreference(next);
  await AsyncStorage.setItem(scopeKey(viewerId, tenantId), JSON.stringify(all));
  return all[key];
}

export { DEFAULT_PREFERENCE };

