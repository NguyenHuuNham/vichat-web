const STORAGE_PREFIX = 'vichat.conversation-categories.v1';

export const CONVERSATION_CATEGORY_OPTIONS = Object.freeze([
  Object.freeze({ id: 'customer', label: 'Khách hàng', color: '#2563eb' }),
  Object.freeze({ id: 'family', label: 'Gia đình', color: '#db2777' }),
  Object.freeze({ id: 'work', label: 'Công việc', color: '#d97706' }),
  Object.freeze({ id: 'friends', label: 'Bạn bè', color: '#16a34a' }),
  Object.freeze({ id: 'colleagues', label: 'Đồng nghiệp', color: '#7c3aed' }),
  Object.freeze({ id: 'other', label: 'Khác', color: '#64748b' }),
]);

const CATEGORY_IDS = new Set(CONVERSATION_CATEGORY_OPTIONS.map(option => option.id));

function storageKey(viewerId) {
  return `${STORAGE_PREFIX}.${String(viewerId || 'anonymous')}`;
}

export function normalizeConversationCategory(value) {
  const categoryId = String(value || '').trim();
  return CATEGORY_IDS.has(categoryId) ? categoryId : '';
}

export function readConversationCategories(viewerId) {
  if (typeof window === 'undefined' || !viewerId) return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(viewerId)) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value)
      .map(([conversationId, categoryId]) => [String(conversationId), normalizeConversationCategory(categoryId)])
      .filter(([, categoryId]) => Boolean(categoryId)));
  } catch {
    return {};
  }
}

export function writeConversationCategories(viewerId, categories) {
  const next = Object.fromEntries(Object.entries(categories || {})
    .map(([conversationId, categoryId]) => [String(conversationId), normalizeConversationCategory(categoryId)])
    .filter(([conversationId, categoryId]) => Boolean(conversationId && categoryId)));
  if (typeof window !== 'undefined' && viewerId) {
    try {
      window.localStorage.setItem(storageKey(viewerId), JSON.stringify(next));
    } catch {
      // The current session still keeps the selected category in React state.
    }
  }
  return next;
}

export function setConversationCategory(viewerId, conversationId, categoryId) {
  const next = { ...readConversationCategories(viewerId) };
  const key = String(conversationId || '');
  const normalized = normalizeConversationCategory(categoryId);
  if (!key) return next;
  if (normalized) next[key] = normalized;
  else delete next[key];
  return writeConversationCategories(viewerId, next);
}

export function applyLocalConversationCategories(rooms, viewerId) {
  const categories = readConversationCategories(viewerId);
  return Object.fromEntries(Object.entries(rooms || {}).map(([id, room]) => {
    const key = String(room?.managementId || room?.id || id);
    return [id, { ...room, category: categories[key] || '' }];
  }));
}
