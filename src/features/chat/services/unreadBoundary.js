function messageSequence(message) {
  const sequence = Number(message?.seq);
  return Number.isFinite(sequence) && sequence > 0 ? sequence : 0;
}

function messageTimestamp(message) {
  return Date.parse(String(message?.createdAt || message?.raw?.ts || '')) || 0;
}

function isIncomingMessage(message, viewerId) {
  if (!message) return false;
  if (message.sender === 'outgoing') return false;
  const senderId = String(message.senderId || message.raw?.from || message.raw?.head?.['x-sender-id'] || '').trim();
  return !viewerId || !senderId || senderId !== String(viewerId);
}

export function unreadMessagesForBoundary(messages = [], {
  viewerId = '',
  firstUnreadSeq = 0,
  lastReadAt = '',
} = {}) {
  const minSequence = Number(firstUnreadSeq) > 0 ? Number(firstUnreadSeq) : 0;
  const readTimestamp = Date.parse(String(lastReadAt || '')) || 0;
  return (Array.isArray(messages) ? messages : [])
    .filter(Boolean)
    .filter(message => isIncomingMessage(message, viewerId))
    .filter(message => {
      const sequence = messageSequence(message);
      if (minSequence) return sequence > 0 && sequence >= minSequence;
      if (readTimestamp) return messageTimestamp(message) > readTimestamp;
      return true;
    });
}

export function createUnreadBoundary(messages = [], {
  viewerId = '',
  unreadCount = 0,
  firstUnreadSeq = 0,
  lastReadAt = '',
  topicName = '',
} = {}) {
  const candidates = unreadMessagesForBoundary(messages, {
    viewerId,
    firstUnreadSeq,
    lastReadAt,
  });
  const count = Math.max(Number(unreadCount) || 0, candidates.length);
  const first = candidates[0];
  const last = candidates.at(-1);
  const normalizedFirstSequence = Number(firstUnreadSeq) > 0 ? Number(firstUnreadSeq) : messageSequence(first);
  if (count <= 0 && normalizedFirstSequence <= 0) return null;
  return {
    firstUnreadId: String(first?.id || ''),
    firstUnreadSeq: messageSequence(first) || normalizedFirstSequence,
    firstUnreadAt: first?.createdAt || first?.raw?.ts || '',
    lastUnreadId: String(last?.id || ''),
    lastUnreadSeq: messageSequence(last),
    lastUnreadAt: last?.createdAt || last?.raw?.ts || '',
    unreadCount: count,
    topicName: String(topicName || ''),
    revealed: false,
  };
}

export function mergeUnreadBoundary(existing, incoming) {
  if (!existing) return incoming || null;
  if (!incoming) return existing;
  const existingLastSeq = Number(existing.lastUnreadSeq) || 0;
  const incomingLastSeq = Number(incoming.lastUnreadSeq) || 0;
  const useIncomingLast = incomingLastSeq >= existingLastSeq;
  return {
    ...existing,
    firstUnreadId: existing.firstUnreadId || incoming.firstUnreadId,
    firstUnreadSeq: Number(existing.firstUnreadSeq) || Number(incoming.firstUnreadSeq) || 0,
    firstUnreadAt: existing.firstUnreadAt || incoming.firstUnreadAt || '',
    ...(useIncomingLast ? {
      lastUnreadId: incoming.lastUnreadId || existing.lastUnreadId,
      lastUnreadSeq: incomingLastSeq || existingLastSeq,
      lastUnreadAt: incoming.lastUnreadAt || existing.lastUnreadAt || '',
    } : {}),
    unreadCount: Math.max(Number(existing.unreadCount) || 0, Number(incoming.unreadCount) || 0),
    topicName: existing.topicName || incoming.topicName || '',
    revealed: Boolean(existing.revealed || incoming.revealed),
  };
}

export function unreadBoundaryStartIndex(messages = [], boundary = null) {
  if (!boundary) return -1;
  const safeMessages = Array.isArray(messages) ? messages : [];
  if (boundary.firstUnreadId) {
    const exactIndex = safeMessages.findIndex(message => String(message?.id || '') === String(boundary.firstUnreadId));
    if (exactIndex >= 0) return exactIndex;
  }
  const firstSequence = Number(boundary.firstUnreadSeq) || 0;
  if (firstSequence > 0) {
    const sequenceIndex = safeMessages.findIndex(message => messageSequence(message) >= firstSequence);
    if (sequenceIndex >= 0) return sequenceIndex;
  }
  return safeMessages.length > 0 ? 0 : -1;
}

export function isUnreadBoundaryEnd(message, boundary) {
  if (!message || !boundary) return false;
  if (boundary.lastUnreadId && String(message.id || '') === String(boundary.lastUnreadId)) return true;
  const lastSequence = Number(boundary.lastUnreadSeq) || 0;
  return lastSequence > 0 && messageSequence(message) === lastSequence;
}
