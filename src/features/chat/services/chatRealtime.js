export const TINODE_CONTACT_SYNC_DELAYS_MS = Object.freeze([120, 600, 1800]);

export function resolvePreparedTinodeTopic(room, preparedRoom, cachedTopic = '') {
  return String(room?.tinodeTopic || preparedRoom?.tinodeTopic || cachedTopic || '').trim();
}

export function tinodeContactsSyncDelay(attempt, {
  sessionActive = true,
  pendingTopicNames = [],
} = {}) {
  const attemptIndex = Number.isInteger(attempt) && attempt >= 0 ? attempt : 0;
  if (!sessionActive) return null;
  if (attemptIndex > 0 && pendingTopicNames.length === 0) return null;
  return TINODE_CONTACT_SYNC_DELAYS_MS[attemptIndex] ?? null;
}

export function readyTinodeTypingTopic(room, authenticated) {
  if (!authenticated || !room || room.isChatbot) return '';
  return String(room.tinodeTopic || '').trim();
}

export function resolveTinodePresenceOnline(eventType, currentOnline = false) {
  if (eventType === 'on') return true;
  if (eventType === 'off' || eventType === 'gone' || eventType === 'term') return false;
  return currentOnline === true;
}
