import {
  markLegacyViewerPreferenceMigrated,
  viewerStorageCandidates,
  viewerStorageKeyId,
  viewerStorageWriteCandidates,
} from './viewerPreferenceStorage.js';

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

function storageKey(prefix, viewerId, tenantId = '') {
  const storageId = tenantId
    ? viewerStorageKeyId(viewerId, tenantId)
    : String(viewerId || 'anonymous');
  return `${prefix}.${storageId}`;
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

function legacyAssignments(viewerId, tenantId = '', allowLegacy = true) {
  if (tenantId && !allowLegacy) return {};
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

function categoryStateDifference(state) {
  const defaults = defaultState();
  return Number(JSON.stringify(state.categories) !== JSON.stringify(defaults.categories))
    + Number(Object.keys(state.assignments).length > 0);
}

function categoryRecord(candidate, tenantId = '') {
  const legacy = legacyAssignments(candidate.viewerId, tenantId, candidate.legacy || !tenantId);
  const stored = readStorage(storageKey(
    STORAGE_PREFIX,
    candidate.viewerId,
    candidate.legacy ? '' : tenantId,
  ));
  const state = normalizedState(stored, legacy);
  return {
    candidate,
    state,
    updatedAt: Number(stored?.updatedAt) || 0,
    difference: categoryStateDifference(state),
    hasData: Boolean(stored) || Object.keys(legacy).length > 0,
  };
}

function writeCategoryStateForViewer(viewerId, state, tenantId = '') {
  writeStorage(storageKey(STORAGE_PREFIX, viewerId, tenantId), { ...state, updatedAt: Date.now() });
  // Keep fixed legacy assignments available only for the old unscoped API.
  if (!tenantId) writeStorage(storageKey(LEGACY_STORAGE_PREFIX, viewerId), state.assignments);
}

function newCategoryId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `category-${crypto.randomUUID()}`;
  }
  return `category-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readConversationCategoryState(viewerId, aliasViewerIds = [], tenantId = '') {
  if (!viewerId) return defaultState();
  const candidates = viewerStorageCandidates(STORAGE_PREFIX, viewerId, aliasViewerIds, tenantId);
  const records = candidates
    .map(candidate => categoryRecord(candidate, tenantId))
    .filter(record => record.hasData);
  if (records.length === 0) return defaultState();
  const usableRecords = records.some(record => !record.candidate.legacy)
    ? records.filter(record => !record.candidate.legacy)
    : records;
  const order = new Map(candidates.map((candidate, index) => [candidate.storageId, index]));
  const timestamped = usableRecords.filter(record => record.updatedAt > 0);
  const selected = timestamped.length > 0
    ? timestamped.sort((left, right) => right.updatedAt - left.updatedAt || order.get(left.candidate.storageId) - order.get(right.candidate.storageId))[0]
    : (usableRecords.find(record => record.difference > 0) || usableRecords[0]);
  if (selected.candidate.storageId !== candidates[0]?.storageId) {
    writeCategoryStateForViewer(viewerId, selected.state, tenantId);
    if (selected.candidate.legacy) {
      markLegacyViewerPreferenceMigrated(STORAGE_PREFIX, viewerId, tenantId);
    }
  }
  return selected.state;
}

export function writeConversationCategoryState(viewerId, value, aliasViewerIds = [], tenantId = '') {
  const state = normalizedState(value);
  if (viewerId) {
    viewerStorageWriteCandidates(viewerId, aliasViewerIds, tenantId)
      .forEach(candidate => writeCategoryStateForViewer(candidate.viewerId, state, tenantId));
  }
  return state;
}

export function normalizeConversationCategory(value, categories = CONVERSATION_CATEGORY_OPTIONS) {
  const normalized = categoryId(value);
  return categories.some(category => category.id === normalized) ? normalized : '';
}

export function readConversationCategories(viewerId, aliasViewerIds = [], tenantId = '') {
  if (!viewerId) return {};
  return readConversationCategoryState(viewerId, aliasViewerIds, tenantId).assignments;
}

export function writeConversationCategories(viewerId, categories, aliasViewerIds = [], tenantId = '') {
  const state = readConversationCategoryState(viewerId, aliasViewerIds, tenantId);
  return writeConversationCategoryState(viewerId, {
    ...state,
    assignments: categories,
  }, aliasViewerIds, tenantId).assignments;
}

export function setConversationCategory(viewerId, conversationId, value, aliasViewerIds = [], tenantId = '') {
  const state = readConversationCategoryState(viewerId, aliasViewerIds, tenantId);
  const next = { ...state.assignments };
  const key = String(conversationId || '').trim();
  const normalized = normalizeConversationCategory(value, state.categories);
  if (!key) return next;
  if (normalized) next[key] = normalized;
  else delete next[key];
  return writeConversationCategoryState(viewerId, { ...state, assignments: next }, aliasViewerIds, tenantId).assignments;
}

export function saveConversationCategory(viewerId, value, aliasViewerIds = [], tenantId = '') {
  const state = readConversationCategoryState(viewerId, aliasViewerIds, tenantId);
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
  const nextState = writeConversationCategoryState(viewerId, { ...state, categories }, aliasViewerIds, tenantId);
  return { state: nextState, category, error: '' };
}

export function removeConversationCategory(viewerId, value, aliasViewerIds = [], tenantId = '') {
  const state = readConversationCategoryState(viewerId, aliasViewerIds, tenantId);
  const id = categoryId(value);
  const categories = state.categories.filter(category => category.id !== id);
  const assignments = Object.fromEntries(Object.entries(state.assignments)
    .filter(([, assignedCategoryId]) => assignedCategoryId !== id));
  return writeConversationCategoryState(viewerId, { ...state, categories, assignments }, aliasViewerIds, tenantId);
}

export function reorderConversationCategories(viewerId, orderedIds, aliasViewerIds = [], tenantId = '') {
  const state = readConversationCategoryState(viewerId, aliasViewerIds, tenantId);
  const byId = new Map(state.categories.map(category => [category.id, category]));
  const categories = [];
  (Array.isArray(orderedIds) ? orderedIds : []).forEach(value => {
    const category = byId.get(categoryId(value));
    if (!category) return;
    categories.push(category);
    byId.delete(category.id);
  });
  categories.push(...byId.values());
  return writeConversationCategoryState(viewerId, { ...state, categories }, aliasViewerIds, tenantId);
}

export function setCategoryConversations(viewerId, value, conversationIds, aliasViewerIds = [], tenantId = '') {
  const state = readConversationCategoryState(viewerId, aliasViewerIds, tenantId);
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
  return writeConversationCategoryState(viewerId, { ...state, assignments }, aliasViewerIds, tenantId);
}

export function applyLocalConversationCategories(rooms, viewerId, aliasViewerIds = [], tenantId = '') {
  const categories = readConversationCategories(viewerId, aliasViewerIds, tenantId);
  return Object.fromEntries(Object.entries(rooms || {}).map(([id, room]) => {
    const key = String(room?.managementId || room?.id || id);
    return [id, { ...room, category: categories[key] || '' }];
  }));
}
