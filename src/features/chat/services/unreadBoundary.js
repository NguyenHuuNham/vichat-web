function messageSequence(message) {
  const sequence = Number(message?.seq);
  return Number.isFinite(sequence) && sequence > 0 ? sequence : 0;
}

function messageTimestamp(message) {
  return Date.parse(String(message?.createdAt || message?.raw?.ts || '')) || 0;
}

export const UNREAD_BADGE_CAP = 5;

export function unreadBadgeLabel(value, cap = UNREAD_BADGE_CAP) {
  const count = Math.max(Math.trunc(Number(value) || 0), 0);
  const limit = Math.max(Math.trunc(Number(cap) || UNREAD_BADGE_CAP), 1);
  if (count <= 0) return '';
  return count >= limit ? `${limit}+` : String(count);
}

function isIncomingMessage(message, viewerId) {
  if (!message) return false;
  const senderId = String(message.senderId || message.raw?.from || message.raw?.head?.['x-sender-id'] || '').trim();
  // A concrete sender ID overrides the presentation side. Without one, keep
  // the explicit local outgoing marker out of the unread candidate list.
  if (viewerId && senderId) return senderId !== String(viewerId);
  if (!senderId) return message.sender !== 'outgoing';
  return message.sender !== 'outgoing';
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
  const firstCandidateSequence = messageSequence(first);
  const firstCandidateIsBoundary = normalizedFirstSequence <= 0
    || firstCandidateSequence === normalizedFirstSequence;
  if (count <= 0 && normalizedFirstSequence <= 0) return null;
  return {
    // Keep the durable cursor even when the bounded history currently starts
    // after it. The UI can then fetch and reveal the actual first unread item.
    firstUnreadId: firstCandidateIsBoundary ? String(first?.id || '') : '',
    firstUnreadSeq: normalizedFirstSequence,
    firstUnreadAt: firstCandidateIsBoundary ? (first?.createdAt || first?.raw?.ts || '') : '',
    lastUnreadId: String(last?.id || ''),
    lastUnreadSeq: messageSequence(last),
    lastUnreadAt: last?.createdAt || last?.raw?.ts || '',
    unreadCount: count,
    topicName: String(topicName || ''),
    indicatorCleared: false,
    indicatorClearedThroughSeq: 0,
    indicatorClearedThroughId: '',
    indicatorClearedThroughAt: '',
    indicatorClearedThroughCount: 0,
    revealed: false,
  };
}

export function unreadCountForConversation(room = null, boundary = null) {
  const roomBadge = Math.max(Number(room?.badge) || 0, 0);
  const boundaryCount = Math.max(Number(boundary?.unreadCount) || 0, 0);
  const hasUnreadCursor = Number(room?.unreadFromSeq) > 0
    || Number(boundary?.firstUnreadSeq) > 0
    || Boolean(boundary?.firstUnreadId);
  return Math.max(roomBadge, boundaryCount, hasUnreadCursor ? 1 : 0);
}

export function markUnreadBoundaryIndicatorCleared(boundary = null) {
  if (!boundary) return boundary;
  return {
    ...boundary,
    indicatorCleared: true,
    indicatorClearedThroughSeq: Math.max(
      Number(boundary.indicatorClearedThroughSeq) || 0,
      Number(boundary.lastUnreadSeq) || 0,
    ),
    indicatorClearedThroughId: String(
      boundary.lastUnreadId || boundary.indicatorClearedThroughId || '',
    ),
    indicatorClearedThroughAt: boundary.lastUnreadAt || boundary.indicatorClearedThroughAt || '',
    indicatorClearedThroughCount: Math.max(
      Number(boundary.indicatorClearedThroughCount) || 0,
      Number(boundary.unreadCount) || 0,
    ),
  };
}

export function unreadIndicatorVisible(boundary = null, count = 0) {
  const unreadCount = Math.max(Number(count) || 0, 0);
  if (unreadCount <= 0) return false;
  if (!boundary?.indicatorCleared) return true;

  const clearedThroughCount = Number(boundary.indicatorClearedThroughCount) || 0;
  const lastUnreadSeq = Number(boundary.lastUnreadSeq) || 0;
  const clearedThroughSeq = Number(boundary.indicatorClearedThroughSeq) || 0;
  const hasClearMarker = clearedThroughSeq > 0
    || Boolean(boundary.indicatorClearedThroughId)
    || Boolean(boundary.indicatorClearedThroughAt)
    || clearedThroughCount > 0;
  // Boundaries created before the marker fields were introduced are already
  // dismissed; a later realtime merge will populate a marker if it advances.
  if (!hasClearMarker) return false;
  if (clearedThroughSeq > 0 && lastUnreadSeq > clearedThroughSeq) return true;
  if (clearedThroughSeq > 0) {
    if (unreadCount > clearedThroughCount) return true;
    return false;
  }

  const lastUnreadId = String(boundary.lastUnreadId || '');
  const clearedThroughId = String(boundary.indicatorClearedThroughId || '');
  if (clearedThroughId) {
    if (lastUnreadId && lastUnreadId !== clearedThroughId) return true;
    if (unreadCount > clearedThroughCount) return true;
    return false;
  }

  const lastUnreadAt = Date.parse(String(boundary.lastUnreadAt || '')) || 0;
  const clearedThroughAt = Date.parse(String(boundary.indicatorClearedThroughAt || '')) || 0;
  if (clearedThroughAt > 0 && lastUnreadAt > clearedThroughAt) return true;
  return unreadCount > clearedThroughCount;
}

export function unreadBoundaryReadSequence(boundary = null, messages = []) {
  const boundarySequence = Number(boundary?.lastUnreadSeq) || 0;
  if (boundarySequence > 0) return boundarySequence;
  return (Array.isArray(messages) ? messages : [])
    .reduce((maximum, message) => Math.max(maximum, messageSequence(message)), 0);
}

export function unreadBoundaryHasNewerTail(current = null, completed = null) {
  if (!current || !completed) return false;
  const currentSequence = Number(current.lastUnreadSeq) || 0;
  const completedSequence = Number(completed.lastUnreadSeq) || 0;
  if (currentSequence > 0 || completedSequence > 0) {
    return currentSequence > completedSequence;
  }

  const currentCount = Number(current.unreadCount) || 0;
  const completedCount = Number(completed.unreadCount) || 0;
  if (currentCount !== completedCount) return currentCount > completedCount;

  const currentId = String(current.lastUnreadId || '');
  const completedId = String(completed.lastUnreadId || '');
  if (currentId !== completedId) return Boolean(currentId);

  const currentAt = messageTimestamp({ createdAt: current.lastUnreadAt });
  const completedAt = messageTimestamp({ createdAt: completed.lastUnreadAt });
  return currentAt > completedAt;
}

export function unreadMessagesForConversation(room = null, boundary = null, {
  viewerId = '',
} = {}) {
  const messages = Array.isArray(room?.messages) ? room.messages : [];
  const firstUnreadSeq = Number(boundary?.firstUnreadSeq) > 0
    ? Number(boundary.firstUnreadSeq)
    : Number(room?.unreadFromSeq) > 0
      ? Number(room.unreadFromSeq)
      : Number(room?.readSeq) > 0 ? Number(room.readSeq) + 1 : 0;
  const firstUnreadId = String(boundary?.firstUnreadId || '').trim();
  const lastReadAt = room?.readAt || room?.readBy?.[viewerId] || '';
  const firstUnreadIndex = !firstUnreadSeq && firstUnreadId
    ? messages.findIndex(message => String(message?.id || '') === firstUnreadId)
    : -1;
  const scopedMessages = firstUnreadIndex >= 0 ? messages.slice(firstUnreadIndex) : messages;
  const candidates = unreadMessagesForBoundary(scopedMessages, {
    viewerId,
    firstUnreadSeq,
    lastReadAt,
  });
  if (firstUnreadSeq > 0 || firstUnreadIndex >= 0 || Date.parse(String(lastReadAt || ''))) {
    return candidates;
  }
  const unreadCount = unreadCountForConversation(room, boundary);
  return unreadCount > 0 ? candidates.slice(-unreadCount) : [];
}

export function mergeUnreadBoundary(existing, incoming) {
  if (!existing) return incoming || null;
  if (!incoming) return existing;
  const existingLastSeq = Number(existing.lastUnreadSeq) || 0;
  const incomingLastSeq = Number(incoming.lastUnreadSeq) || 0;
  const useIncomingLast = incomingLastSeq >= existingLastSeq;
  const existingClearedSeq = Number(existing.indicatorClearedThroughSeq)
    || (existing.indicatorCleared ? existingLastSeq : 0);
  const incomingClearedSeq = Number(incoming.indicatorClearedThroughSeq) || 0;
  const existingClearedId = String(
    existing.indicatorClearedThroughId || (existing.indicatorCleared ? existing.lastUnreadId : '') || '',
  );
  const existingClearedAt = existing.indicatorClearedThroughAt
    || (existing.indicatorCleared ? existing.lastUnreadAt : '')
    || '';
  const existingClearedCount = Number(existing.indicatorClearedThroughCount)
    || (existing.indicatorCleared ? Number(existing.unreadCount) || 0 : 0);
  const clearedMarker = incomingClearedSeq > existingClearedSeq ? incoming : existing;
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
    indicatorCleared: Boolean(existing.indicatorCleared || incoming.indicatorCleared),
    indicatorClearedThroughSeq: Math.max(existingClearedSeq, incomingClearedSeq),
    indicatorClearedThroughId: String(
      clearedMarker.indicatorClearedThroughId
        || (clearedMarker === existing ? existingClearedId : '')
        || existingClearedId
        || incoming.indicatorClearedThroughId
        || '',
    ),
    indicatorClearedThroughAt: clearedMarker.indicatorClearedThroughAt
      || (clearedMarker === existing ? existingClearedAt : '')
      || existingClearedAt
      || existing.indicatorClearedThroughAt
      || incoming.indicatorClearedThroughAt
      || '',
    indicatorClearedThroughCount: Math.max(
      existingClearedCount,
      Number(incoming.indicatorClearedThroughCount) || 0,
    ),
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
