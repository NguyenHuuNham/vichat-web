const LEGACY_STORAGE_PREFIX = 'vichat.conversation-categories.v1';
const STORAGE_PREFIX = 'vichat.conversation-categories.v2';
const STORAGE_VERSION = 2;
const MAX_CATEGORY_COUNT = 50;
const MAX_CATEGORY_NAME_LENGTH = 40;

export const CONVERSATION_CATEGORY_COLORS = Object.freeze([
  '#e11d2e',
  '#e817ad',
  '#ff6a13',
  '#ffbd0a',
  '#49c77b',
  '#34bfc4',
  '#1478ef',
  '#734fd1',
]);

export const CONVERSATION_CATEGORY_OPTIONS = Object.freeze([
  Object.freeze({ id: 'customer', label: 'Khách hàng', color: '#e11d2e', builtIn: true }),
  Object.freeze({ id: 'family', label: 'Gia đình', color: '#e817ad', builtIn: true }),
  Object.freeze({ id: 'work', label: 'Công việc', color: '#ff6a13', builtIn: true }),
  Object.freeze({ id: 'friends', label: 'Bạn bè', color: '#ffbd0a', builtIn: true }),
  Object.freeze({ id: 'reply-later', label: 'Trả lời sau', color: '#49c77b', builtIn: true }),
  Object.freeze({ id: 'colleagues', label: 'Đồng nghiệp', color: '#1478ef', builtIn: true }),
]);

const LEGACY_OTHER_CATEGORY = Object.freeze({
  id: 'other',
  label: 'Khác',
  color: '#64748b',
  builtIn: true,
});

function storageKey(prefix, viewerId) {
  return `${prefix}.${String(viewerId || 'anonymous')}`;
}

function categoryId(value) {
  return String(value || '').trim().slice(0, 80);
}

function categoryName(value) {
  return String(value || '').trim().replace(/\s+/gu, ' ').slice(0, MAX_CATEGORY_NAME_LENGTH);
}

function categoryColor(value, fallback = CONVERSATION_CATEGORY_COLORS[0]) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/u.test(normalized) ? normalized : fallback;
}

function categoryDefinition(value, index = 0) {
  const id = categoryId(value?.id);
  const label = categoryName(value?.label || value?.name);
  if (!id || !label) return null;
  return {
    id,
    label,
    color: categoryColor(value?.color, CONVERSATION_CATEGORY_COLORS[index % CONVERSATION_CATEGORY_COLORS.length]),
    builtIn: Boolean(value?.builtIn),
  };
}

function normalizeCategoryDefinitions(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map(categoryDefinition)
    .filter(category => {
      if (!category || seen.has(category.id)) return false;
      seen.add(category.id);
      return true;
    })
    .slice(0, MAX_CATEGORY_COUNT);
}

function normalizeAssignments(values, categories) {
  const categoryIds = new Set(categories.map(category => category.id));
  if (!values || typeof values !== 'object' || Array.isArray(values)) return {};
  return Object.fromEntries(Object.entries(values)
    .map(([conversationId, value]) => [String(conversationId || '').trim(), categoryId(value)])
    .filter(([conversationId, value]) => Boolean(conversationId && categoryIds.has(value))));
}

function defaultState(legacyAssignments = {}) {
  const categories = CONVERSATION_CATEGORY_OPTIONS.map(category => ({ ...category }));
  if (Object.values(legacyAssignments).some(value => categoryId(value) === LEGACY_OTHER_CATEGORY.id)) {
    categories.push({ ...LEGACY_OTHER_CATEGORY });
  }
  return {
    version: STORAGE_VERSION,
    categories,
    assignments: normalizeAssignments(legacyAssignments, categories),
  };
}

function normalizedState(value, legacyAssignments = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== STORAGE_VERSION) {
    return defaultState(legacyAssignments);
  }
  const categories = normalizeCategoryDefinitions(value.categories);
  return {
    version: STORAGE_VERSION,
    categories,
    assignments: normalizeAssignments(value.assignments, categories),
  };
}

function readStorage(key, fallback = null) {
  if (typeof window === 'undefined') return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

function legacyAssignments(viewerId) {
  const value = readStorage(storageKey(LEGACY_STORAGE_PREFIX, viewerId), {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function writeStorage(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // React state still keeps the latest categories for the current session.
  }
}

function newCategoryId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `category-${crypto.randomUUID()}`;
  }
  return `category-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readConversationCategoryState(viewerId) {
  if (!viewerId) return defaultState();
  const legacy = legacyAssignments(viewerId);
  const stored = readStorage(storageKey(STORAGE_PREFIX, viewerId));
  return normalizedState(stored, legacy);
}

export function writeConversationCategoryState(viewerId, value) {
  const state = normalizedState(value);
  if (viewerId) {
    writeStorage(storageKey(STORAGE_PREFIX, viewerId), state);
    // Keep fixed legacy assignments available if a ChatUI rollback is needed.
    writeStorage(storageKey(LEGACY_STORAGE_PREFIX, viewerId), state.assignments);
  }
  return state;
}

export function normalizeConversationCategory(value, categories = CONVERSATION_CATEGORY_OPTIONS) {
  const normalized = categoryId(value);
  return categories.some(category => category.id === normalized) ? normalized : '';
}

export function readConversationCategories(viewerId) {
  if (!viewerId) return {};
  return readConversationCategoryState(viewerId).assignments;
}

export function writeConversationCategories(viewerId, categories) {
  const state = readConversationCategoryState(viewerId);
  return writeConversationCategoryState(viewerId, {
    ...state,
    assignments: categories,
  }).assignments;
}

export function setConversationCategory(viewerId, conversationId, value) {
  const state = readConversationCategoryState(viewerId);
  const next = { ...state.assignments };
  const key = String(conversationId || '').trim();
  const normalized = normalizeConversationCategory(value, state.categories);
  if (!key) return next;
  if (normalized) next[key] = normalized;
  else delete next[key];
  return writeConversationCategoryState(viewerId, { ...state, assignments: next }).assignments;
}

export function saveConversationCategory(viewerId, value) {
  const state = readConversationCategoryState(viewerId);
  const id = categoryId(value?.id) || newCategoryId();
  const label = categoryName(value?.label || value?.name);
  if (!label) return { state, category: null, error: 'name_required' };
  const duplicate = state.categories.find(category => (
    category.id !== id && category.label.localeCompare(label, 'vi', { sensitivity: 'base' }) === 0
  ));
  if (duplicate) return { state, category: null, error: 'name_duplicate' };
  const existing = state.categories.find(category => category.id === id);
  if (!existing && state.categories.length >= MAX_CATEGORY_COUNT) {
    return { state, category: null, error: 'limit_reached' };
  }
  const category = {
    id,
    label,
    color: categoryColor(value?.color, existing?.color || CONVERSATION_CATEGORY_COLORS[0]),
    builtIn: Boolean(existing?.builtIn && label === existing.label),
  };
  const categories = existing
    ? state.categories.map(item => item.id === id ? category : item)
    : [...state.categories, category];
  const nextState = writeConversationCategoryState(viewerId, { ...state, categories });
  return { state: nextState, category, error: '' };
}

export function removeConversationCategory(viewerId, value) {
  const state = readConversationCategoryState(viewerId);
  const id = categoryId(value);
  const categories = state.categories.filter(category => category.id !== id);
  const assignments = Object.fromEntries(Object.entries(state.assignments)
    .filter(([, assignedCategoryId]) => assignedCategoryId !== id));
  return writeConversationCategoryState(viewerId, { ...state, categories, assignments });
}

export function reorderConversationCategories(viewerId, orderedIds) {
  const state = readConversationCategoryState(viewerId);
  const byId = new Map(state.categories.map(category => [category.id, category]));
  const categories = [];
  (Array.isArray(orderedIds) ? orderedIds : []).forEach(value => {
    const category = byId.get(categoryId(value));
    if (!category) return;
    categories.push(category);
    byId.delete(category.id);
  });
  categories.push(...byId.values());
  return writeConversationCategoryState(viewerId, { ...state, categories });
}

export function setCategoryConversations(viewerId, value, conversationIds) {
  const state = readConversationCategoryState(viewerId);
  const id = normalizeConversationCategory(value, state.categories);
  if (!id) return state;
  const selected = new Set((Array.isArray(conversationIds) ? conversationIds : [])
    .map(conversationId => String(conversationId || '').trim())
    .filter(Boolean));
  const assignments = Object.fromEntries(Object.entries(state.assignments)
    .filter(([, assignedCategoryId]) => assignedCategoryId !== id));
  selected.forEach(conversationId => {
    assignments[conversationId] = id;
  });
  return writeConversationCategoryState(viewerId, { ...state, assignments });
}

export function applyLocalConversationCategories(rooms, viewerId) {
  const categories = readConversationCategories(viewerId);
  return Object.fromEntries(Object.entries(rooms || {}).map(([id, room]) => {
    const key = String(room?.managementId || room?.id || id);
    return [id, { ...room, category: categories[key] || '' }];
  }));
}
