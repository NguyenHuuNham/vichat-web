import {
  markLegacyViewerPreferenceMigrated,
  viewerStorageCandidates,
  viewerStorageKeyId,
  viewerStorageWriteCandidates,
} from './viewerPreferenceStorage.js';

const STORAGE_PREFIX = 'vichat.conversation-pins.v1';

function storageKey(viewerId, tenantId = '') {
  return `${STORAGE_PREFIX}.${tenantId ? viewerStorageKeyId(viewerId, tenantId) : String(viewerId || 'anonymous')}`;
}

function normalizedPinIds(value) {
  if (Array.isArray(value)) return [...new Set(value.map(String).filter(Boolean))];
  if (Array.isArray(value?.ids)) return [...new Set(value.ids.map(String).filter(Boolean))];
  return [];
}

function readPinRecord(candidate, tenantId = '') {
  try {
    const raw = window.localStorage.getItem(storageKey(
      candidate.viewerId,
      candidate.legacy ? '' : tenantId,
    ));
    if (!raw) return null;
    const value = JSON.parse(raw);
    return { candidate, ids: normalizedPinIds(value) };
  } catch {
    return null;
  }
}

function writePinStorage(viewerId, ids, tenantId = '') {
  try {
    window.localStorage.setItem(storageKey(viewerId, tenantId), JSON.stringify(ids));
  } catch {
    // The current session still keeps the updated pin in React state.
  }
}

export function readConversationPins(viewerId, aliasViewerIds = [], tenantId = '') {
  if (typeof window === 'undefined' || !viewerId) return [];
  const candidates = viewerStorageCandidates(STORAGE_PREFIX, viewerId, aliasViewerIds, tenantId);
  const records = candidates.map(candidate => readPinRecord(candidate, tenantId)).filter(Boolean);
  if (records.length === 0) return [];
  const scopedRecords = records.some(record => !record.candidate.legacy)
    ? records.filter(record => !record.candidate.legacy)
    : records;
  const next = [...new Set(scopedRecords.flatMap(record => record.ids))];
  if (scopedRecords.some(record => record.candidate.storageId !== candidates[0]?.storageId)) {
    writePinStorage(viewerId, next, tenantId);
    if (scopedRecords.some(record => record.candidate.legacy)) {
      markLegacyViewerPreferenceMigrated(STORAGE_PREFIX, viewerId, tenantId);
    }
  }
  return next;
}

export function writeConversationPins(viewerId, ids, aliasViewerIds = [], tenantId = '') {
  const next = [...new Set((ids || []).map(String).filter(Boolean))];
  if (typeof window !== 'undefined' && viewerId) {
    viewerStorageWriteCandidates(viewerId, aliasViewerIds, tenantId)
      .forEach(candidate => writePinStorage(candidate.viewerId, next, tenantId));
  }
  return next;
}

export function applyLocalConversationPins(rooms, viewerId, aliasViewerIds = [], tenantId = '') {
  const pins = new Set(readConversationPins(viewerId, aliasViewerIds, tenantId));
  return Object.fromEntries(Object.entries(rooms || {}).map(([id, room]) => [id, {
    ...room,
    pinned: pins.has(String(room.managementId || room.id || id)),
  }]));
}

export function toggleConversationPinIds(viewerId, conversationId, pinned, aliasViewerIds = [], tenantId = '') {
  const current = new Set(readConversationPins(viewerId, aliasViewerIds, tenantId));
  const key = String(conversationId || '');
  if (!key) return [...current];
  if (pinned) current.add(key);
  else current.delete(key);
  return writeConversationPins(viewerId, [...current], aliasViewerIds, tenantId);
}
