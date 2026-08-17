const STORAGE_PREFIX = 'vichat.conversation-pins.v1';

function storageKey(viewerId) {
  return `${STORAGE_PREFIX}.${String(viewerId || 'anonymous')}`;
}

export function readConversationPins(viewerId) {
  if (typeof window === 'undefined' || !viewerId) return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(viewerId)) || '[]');
    return Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
  } catch {
    return [];
  }
}

export function writeConversationPins(viewerId, ids) {
  const next = [...new Set((ids || []).map(String).filter(Boolean))];
  if (typeof window !== 'undefined' && viewerId) {
    try {
      window.localStorage.setItem(storageKey(viewerId), JSON.stringify(next));
    } catch {
      // The current session still keeps the updated pin in React state.
    }
  }
  return next;
}

export function applyLocalConversationPins(rooms, viewerId) {
  const pins = new Set(readConversationPins(viewerId));
  return Object.fromEntries(Object.entries(rooms || {}).map(([id, room]) => [id, {
    ...room,
    pinned: pins.has(String(room.managementId || room.id || id)),
  }]));
}

export function toggleConversationPinIds(viewerId, conversationId, pinned) {
  const current = new Set(readConversationPins(viewerId));
  const key = String(conversationId || '');
  if (!key) return [...current];
  if (pinned) current.add(key);
  else current.delete(key);
  return writeConversationPins(viewerId, [...current]);
}
