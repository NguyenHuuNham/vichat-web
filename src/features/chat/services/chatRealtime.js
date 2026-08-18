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

function conversationText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export function conversationDisplayName(room, fallback = '') {
  const roomId = conversationText(room?.id);
  const roomName = conversationText(room?.name);
  if (roomName && roomName !== roomId) return roomName;

  const memberName = (Array.isArray(room?.members) ? room.members : [])
    .map(member => conversationText(member?.name))
    .find(Boolean);
  return memberName || (roomName !== roomId ? roomName : '') || conversationText(fallback);
}

export function shouldShowConversation(room, draft = '') {
  if (!room) return false;
  if (room.isGroup || room.isChatbot) return true;
  if (String(draft || '').trim()) return true;
  return Array.isArray(room.messages) && room.messages.some(Boolean);
}

export function firstVisibleConversationId(conversations = {}, drafts = {}, fallbackId = '') {
  return Object.keys(conversations).find(id => shouldShowConversation(conversations[id], drafts[id])) || fallbackId;
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

export function messageForDeliveryStatus(message) {
  const senderId = message?.from || message?.head?.['x-sender-id'] || '';
  return message?.from || !senderId ? message : { ...message, from: senderId };
}

export function applyReceiptToMessages(messages = [], { seq = 0, what = '', viewerId = '' } = {}) {
  const receiptSequence = Number(seq);
  if (!Number.isFinite(receiptSequence) || receiptSequence <= 0 || !['recv', 'read'].includes(what)) return messages;
  let changed = false;

  const nextMessages = messages.map(message => {
    const messageSequence = Number(message?.seq || message?.raw?.seq);
    const senderId = message?.senderId || message?.raw?.from || message?.raw?.head?.['x-sender-id'] || '';
    const outgoing = message?.sender === 'outgoing' || Boolean(viewerId && senderId === viewerId);
    if (!outgoing || !Number.isFinite(messageSequence) || messageSequence <= 0 || messageSequence > receiptSequence) return message;

    const nextStatus = deliveryStatusForReceipt(message, { seq: receiptSequence, what, viewerId });
    if (nextStatus === (message.deliveryStatus || 'none') && !message.pending) return message;
    changed = true;
    return {
      ...message,
      pending: false,
      failed: false,
      deliveryStatus: nextStatus,
    };
  });

  return changed ? nextMessages : messages;
}

export function deliveryStatusForReceipt(message, {
  seq = 0,
  what = '',
  viewerId = '',
  currentStatus = message?.deliveryStatus || 'none',
} = {}) {
  const receiptSequence = Number(seq);
  const messageSequence = Number(message?.seq || message?.raw?.seq);
  if (!Number.isFinite(receiptSequence) || receiptSequence <= 0 || !['recv', 'read'].includes(what)) {
    return currentStatus;
  }
  if (!Number.isFinite(messageSequence) || messageSequence <= 0 || messageSequence > receiptSequence) return currentStatus;
  const senderId = message?.senderId || message?.raw?.from || message?.raw?.head?.['x-sender-id'] || '';
  const outgoing = message?.sender === 'outgoing' || Boolean(viewerId && String(senderId) === String(viewerId));
  if (!outgoing) return currentStatus;
  return mergeDeliveryStatus(currentStatus, what === 'read' ? 'read' : 'received');
}

export function deliveryStatusFromReceiptCursor(message, {
  receivedSeq = 0,
  readSeq = 0,
  viewerId = '',
  currentStatus = message?.deliveryStatus || 'none',
} = {}) {
  const received = deliveryStatusForReceipt(message, {
    seq: receivedSeq,
    what: 'recv',
    viewerId,
    currentStatus,
  });
  return deliveryStatusForReceipt(message, {
    seq: readSeq,
    what: 'read',
    viewerId,
    currentStatus: received,
  });
}

export function mergeDeliveryStatus(previousStatus = 'none', incomingStatus = 'none') {
  const statusRank = { none: 0, sending: 1, sent: 2, received: 3, read: 4 };
  const previousRank = statusRank[previousStatus] || 0;
  const incomingRank = statusRank[incomingStatus] || 0;
  return previousRank > incomingRank ? previousStatus : incomingStatus;
}

export function acknowledgeTopicReceived(topic) {
  const sequence = topicReceiptSequence(topic);
  if (sequence <= 0 || typeof topic?.noteRecv !== 'function') return 0;
  topic.noteRecv(sequence);
  return sequence;
}
