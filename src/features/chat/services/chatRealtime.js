export const TINODE_CONTACT_SYNC_DELAYS_MS = Object.freeze([120, 600, 1800]);

const MANAGEMENT_CONVERSATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isManagementConversationId(value) {
  return MANAGEMENT_CONVERSATION_ID_PATTERN.test(String(value || ''));
}

export function conversationManagementMergePolicy(existing = {}, incoming = {}) {
  const incomingManagementSnapshot = Boolean(
    incoming?.managementSnapshot || incoming?.management_snapshot,
  );
  const managementId = incoming?.managementId
    || existing?.managementId
    || (incomingManagementSnapshot ? incoming?.id : existing?.id)
    || incoming?.id;
  const managementOwned = isManagementConversationId(managementId) && Boolean(
    incomingManagementSnapshot
      || existing?.accountSession
      || incoming?.accountSession,
  );

  return {
    managementOwned,
    incomingManagementSnapshot: managementOwned && incomingManagementSnapshot,
  };
}

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

function conversationObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function conversationArray(value) {
  if (Array.isArray(value)) return value;
  const object = conversationObject(value);
  if (!object) return [];
  const looksLikeRecord = ['id', 'uid', 'name', 'type', 'senderId', 'text', 'seq']
    .some(key => Object.prototype.hasOwnProperty.call(object, key));
  return looksLikeRecord ? [object] : Object.values(object);
}

function conversationIdentity(value) {
  return conversationText(value);
}

function conversationMedia(value) {
  const direct = conversationText(value);
  if (direct) return direct;
  const object = conversationObject(value);
  if (!object) return '';
  return conversationText(object.url)
    || conversationText(object.ref)
    || conversationText(object.src)
    || conversationText(object.href);
}

function normalizeAttachment(value) {
  const attachment = conversationObject(value);
  if (!attachment) return null;
  return {
    ...attachment,
    name: conversationText(attachment.name),
    ext: conversationText(attachment.ext),
    size: conversationText(attachment.size),
    url: conversationMedia(attachment.url || attachment.ref),
    mime: conversationText(attachment.mime),
  };
}

function normalizeReply(value) {
  const reply = conversationObject(value);
  if (!reply) return null;
  return {
    ...reply,
    id: conversationIdentity(reply.id),
    senderName: conversationText(reply.senderName),
    text: conversationText(reply.text),
    type: conversationText(reply.type),
    fileName: conversationText(reply.fileName),
    fileMime: conversationText(reply.fileMime),
    file: normalizeAttachment(reply.file),
    voiceDuration: Number(reply.voiceDuration) > 0 ? Number(reply.voiceDuration) : 0,
  };
}

function normalizeMember(value) {
  const member = conversationObject(value);
  if (!member) return null;
  return {
    ...member,
    id: conversationIdentity(member.id),
    uid: conversationIdentity(member.uid),
    tinodeUid: conversationIdentity(member.tinodeUid || member.tinode_uid),
    name: conversationText(member.name) || conversationText(member.username) || conversationText(member.email),
    username: conversationText(member.username),
    email: conversationText(member.email),
    title: conversationText(member.title),
    department: conversationText(member.department),
    avatar: conversationMedia(member.avatar || member.photo),
  };
}

function normalizeMention(value) {
  const mention = conversationObject(value);
  if (!mention) return null;
  return {
    ...mention,
    id: conversationIdentity(mention.id),
    tinodeUid: conversationIdentity(mention.tinodeUid || mention.tinode_uid),
    name: conversationText(mention.name),
    username: conversationText(mention.username),
    email: conversationText(mention.email),
    token: conversationText(mention.token),
    isAll: Boolean(mention.isAll),
  };
}

function normalizeEvent(value) {
  const event = conversationObject(value);
  if (!event) return null;
  return {
    ...event,
    action: conversationText(event.action),
    actorId: conversationIdentity(event.actorId),
    actorName: conversationText(event.actorName),
    text: conversationText(event.text),
    targets: conversationArray(event.targets).map(target => {
      const normalized = conversationObject(target);
      if (!normalized) return null;
      return {
        ...normalized,
        id: conversationIdentity(normalized.id),
        name: conversationText(normalized.name),
      };
    }).filter(Boolean),
  };
}

function normalizeReactions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([emoji, count]) => [conversationText(emoji), Number(count)])
    .filter(([emoji, count]) => emoji && Number.isFinite(count)));
}

function normalizeMessage(value, index) {
  const message = conversationObject(value);
  if (!message) return null;
  const sequence = Number(message.seq);
  return {
    ...message,
    id: conversationIdentity(message.id) || (Number.isFinite(sequence) ? `message-${sequence}` : `message-${index}`),
    seq: Number.isFinite(sequence) ? sequence : undefined,
    type: conversationText(message.type) || 'text',
    sender: conversationText(message.sender) || 'incoming',
    senderId: conversationIdentity(message.senderId),
    senderName: conversationText(message.senderName),
    text: conversationText(message.text),
    image: conversationMedia(message.image),
    avatar: conversationMedia(message.avatar || message.photo),
    file: normalizeAttachment(message.file),
    replyTo: normalizeReply(message.replyTo),
    targetIds: conversationArray(message.targetIds).map(conversationIdentity).filter(Boolean),
    mentions: conversationArray(message.mentions).map(normalizeMention).filter(Boolean),
    sources: conversationArray(message.sources).map(source => {
      const normalized = conversationObject(source);
      if (!normalized) return null;
      return {
        ...normalized,
        document_id: conversationIdentity(normalized.document_id),
        title: conversationText(normalized.title),
        file_name: conversationText(normalized.file_name),
        snippet: conversationText(normalized.snippet),
      };
    }).filter(Boolean),
    reactions: normalizeReactions(message.reactions),
    systemEvent: normalizeEvent(message.systemEvent),
    friendEvent: normalizeEvent(message.friendEvent),
    voiceDuration: Number(message.voiceDuration) > 0 ? Number(message.voiceDuration) : 0,
  };
}

// Normalize untrusted API/Tinode snapshots before any React code iterates them.
export function normalizeConversationShape(conversation) {
  const source = conversationObject(conversation) || {};
  const managementId = conversationText(source.managementId) || conversationText(source.management_id);
  const tinodeTopic = conversationText(source.tinodeTopic) || conversationText(source.tinode_topic);
  const participantIds = conversationArray(source.participantIds)
    .map(value => conversationIdentity(conversationObject(value)?.id || value))
    .filter(Boolean);
  const members = conversationArray(source.members).map(normalizeMember).filter(Boolean);
  const messages = conversationArray(source.messages).map(normalizeMessage).filter(Boolean);
  const friendEvents = conversationArray(source.friendEvents).map((message, index) => normalizeMessage(message, index)).filter(Boolean);
  const isGroup = source.isGroup === true || source.isGroup === 1 || source.isGroup === 'true';
  const mutedUntil = typeof source.notificationMutedUntil === 'string' || typeof source.notificationMutedUntil === 'number'
    ? source.notificationMutedUntil
    : undefined;
  const badge = Number(source.badge);

  return {
    ...source,
    id: conversationIdentity(source.id),
    managementId,
    tinodeTopic,
    name: conversationText(source.name),
    isGroup,
    // Chatmgt snapshots carry authoritative account/member IDs. Tinode
    // snapshots only carry realtime UIDs and must not replace that mapping.
    managementSnapshot: Boolean(source.managementSnapshot || source.management_snapshot),
    isChatbot: Boolean(source.isChatbot),
    avatarUrl: source.avatarUrl !== undefined || source.avatar !== undefined
      ? (conversationMedia(source.avatarUrl) || conversationMedia(source.avatar))
      : undefined,
    avatarClass: conversationText(source.avatarClass),
    membersCount: conversationText(source.membersCount),
    description: conversationText(source.description),
    admin: conversationText(source.admin),
    adminId: conversationIdentity(source.adminId),
    members,
    participantIds,
    messages,
    friendEvents,
    lastMsg: conversationText(source.lastMsg),
    time: conversationText(source.time),
    updatedAt: conversationText(source.updatedAt),
    deletedAt: conversationText(source.deletedAt),
    category: conversationText(source.category),
    notificationMutedUntil: mutedUntil,
    badge: Number.isFinite(badge) ? badge : 0,
    pinned: Boolean(source.pinned),
  };
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

export function ensureConversationEntry(conversations = {}, conversationId, fallbackRoom) {
  const id = conversationText(conversationId);
  const source = conversations && typeof conversations === 'object' && !Array.isArray(conversations)
    ? conversations
    : {};
  if (!id || source[id] !== undefined && source[id] !== null) return source;
  return { ...source, [id]: fallbackRoom };
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
