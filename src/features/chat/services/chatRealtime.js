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

export function modeWithRealtimePresence(mode = '') {
  const permissions = new Set(String(mode).split(''));
  permissions.add('A');
  permissions.add('S');
  permissions.add('P');
  return 'JRWPASDO'.split('').filter(permission => permissions.has(permission)).join('');
}

export function topicReceiptSequence(topic) {
  const maxSequence = Number(topic?.maxMsgSeq?.());
  if (Number.isFinite(maxSequence) && maxSequence > 0) return maxSequence;
  const latestSequence = Number(topic?.latestMessage?.()?.seq);
  return Number.isFinite(latestSequence) && latestSequence > 0 ? latestSequence : 0;
}

export function acknowledgeTopicReceived(topic) {
  const sequence = topicReceiptSequence(topic);
  if (sequence <= 0 || typeof topic?.noteRecv !== 'function') return 0;
  topic.noteRecv(sequence);
  return sequence;
}
