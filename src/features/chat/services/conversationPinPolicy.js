import { viewerStorageIds } from './viewerPreferenceStorage.js';

const STORAGE_PREFIX = 'vichat.conversation-pins.v1';

function storageKey(viewerId) {
  return `${STORAGE_PREFIX}.${String(viewerId || 'anonymous')}`;
}

function normalizedPinIds(value) {
  if (Array.isArray(value)) return [...new Set(value.map(String).filter(Boolean))];
  if (Array.isArray(value?.ids)) return [...new Set(value.ids.map(String).filter(Boolean))];
  return [];
}

function readPinRecord(viewerId) {
  try {
    const raw = window.localStorage.getItem(storageKey(viewerId));
    if (!raw) return null;
    const value = JSON.parse(raw);
    return { viewerId: String(viewerId), ids: normalizedPinIds(value) };
  } catch {
    return null;
  }
}

function writePinStorage(viewerId, ids) {
  try {
    window.localStorage.setItem(storageKey(viewerId), JSON.stringify(ids));
  } catch {
    // The current session still keeps the updated pin in React state.
  }
}

export function readConversationPins(viewerId, aliasViewerIds = []) {
  if (typeof window === 'undefined' || !viewerId) return [];
  const viewerIds = viewerStorageIds(viewerId, aliasViewerIds);
  const records = viewerIds.map(readPinRecord).filter(Boolean);
  if (records.length === 0) return [];
  const next = [...new Set(records.flatMap(record => record.ids))];
  if (records.some(record => record.viewerId !== viewerIds[0])) {
    writePinStorage(viewerIds[0], next);
  }
  return next;
}

export function writeConversationPins(viewerId, ids, aliasViewerIds = []) {
  const next = [...new Set((ids || []).map(String).filter(Boolean))];
  if (typeof window !== 'undefined' && viewerId) {
    viewerStorageIds(viewerId, aliasViewerIds).forEach(candidateId => writePinStorage(candidateId, next));
  }
  return next;
}

export function applyLocalConversationPins(rooms, viewerId, aliasViewerIds = []) {
  const pins = new Set(readConversationPins(viewerId, aliasViewerIds));
  return Object.fromEntries(Object.entries(rooms || {}).map(([id, room]) => [id, {
    ...room,
    pinned: pins.has(String(room.managementId || room.id || id)),
  }]));
}

export function toggleConversationPinIds(viewerId, conversationId, pinned, aliasViewerIds = []) {
  const current = new Set(readConversationPins(viewerId, aliasViewerIds));
  const key = String(conversationId || '');
  if (!key) return [...current];
  if (pinned) current.add(key);
  else current.delete(key);
  return writeConversationPins(viewerId, [...current], aliasViewerIds);
}
