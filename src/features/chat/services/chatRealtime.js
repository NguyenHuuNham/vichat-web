import { normalizeGroupSettings } from './groupSettings.js';
import { normalizeConversationBackground } from './conversationBackground.js';
import { normalizeImageBatch } from './imageBatchLayout.js';
import { normalizePoll, normalizePollEvent } from './poll.js';
import { mergeReceiptUsers, normalizeReceiptUsers } from './messageReceipts.js';
import { conversationActivityTimestamp, parseTimestamp } from './timeFormatting.js';
import { normalizeDirectMessageBlockState } from './directMessageBlocking.js';

export const TINODE_CONTACT_SYNC_DELAYS_MS = Object.freeze([120, 600, 1800]);

const MANAGEMENT_CONVERSATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeConversationFlag(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
  return false;
}

export function messageActivityTimestamp(message) {
  return Math.max(
    parseTimestamp(message?.createdAt || message?.created_at),
    parseTimestamp(message?.raw?.ts),
    parseTimestamp(message?.pollActivityAt || message?.poll_activity_at),
  );
}

export function latestConversationMessage(messages = []) {
  const list = Array.isArray(messages) ? messages : [];
  let latest = null;
  let latestTimestamp = 0;
  let latestSequence = 0;
  let latestIndex = -1;
  list.forEach((message, index) => {
    if (!message) return;
    const timestamp = messageActivityTimestamp(message);
    const sequence = Number(message?.seq) || 0;
    if (
      latest === null
      || timestamp > latestTimestamp
      || (timestamp === latestTimestamp && sequence > latestSequence)
      || (timestamp === latestTimestamp && sequence === latestSequence && index > latestIndex)
    ) {
      latest = message;
      latestTimestamp = timestamp;
      latestSequence = sequence;
      latestIndex = index;
    }
  });
  return latest;
}

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

export function mergeManagementAvatar(existingAvatar, incomingAvatar, { incomingManagementSnapshot = false } = {}) {
  const existing = conversationText(existingAvatar);
  const incoming = conversationText(incomingAvatar);
  return incomingManagementSnapshot
    ? incoming || existing
    : existing || incoming;
}

function conversationSequenceFloor(conversation) {
  return (Array.isArray(conversation?.messages) ? conversation.messages : [])
    .concat(Array.isArray(conversation?.friendEvents) ? conversation.friendEvents : [])
    .reduce((maximum, message) => Math.max(
      maximum,
      Number(message?.seq) || 0,
      Number(message?.raw?.seq) || 0,
      Number(message?.pollActivitySeq) || 0,
    ), 0);
}

function incomingConversationSequenceFloor(conversation, viewerId = '') {
  const normalizedViewerId = String(viewerId || '').trim();
  return (Array.isArray(conversation?.messages) ? conversation.messages : [])
    .filter(message => {
      const senderId = String(
        message?.senderId
          || message?.raw?.from
          || message?.raw?.head?.['x-sender-id']
          || '',
      ).trim();
      // A concrete sender ID is authoritative. Without one, retain an
      // explicit local outgoing marker; all other packets remain incoming.
      if (normalizedViewerId && senderId) return senderId !== normalizedViewerId;
      if (!senderId) return message?.sender !== 'outgoing';
      return message?.sender !== 'outgoing';
    })
    .reduce((maximum, message) => Math.max(
      maximum,
      Number(message?.seq) || 0,
      Number(message?.raw?.seq) || 0,
      Number(message?.pollActivitySeq) || 0,
    ), 0);
}

/**
 * Merge viewer read state monotonically. Tinode can emit an older topic
 * snapshot after a local markRead; that snapshot must never resurrect an
 * unread badge or boundary which was already acknowledged.
 */
export function mergeConversationReadState(existing = {}, incoming = {}, { viewerId = '' } = {}) {
  const existingReadSeq = Math.max(0, Number(existing?.readSeq) || 0);
  const incomingReadSeq = Math.max(0, Number(incoming?.readSeq) || 0);
  const readSeq = Math.max(existingReadSeq, incomingReadSeq);
  const existingUnreadFromSeq = Math.max(0, Number(existing?.unreadFromSeq) || 0);
  const incomingUnreadFromSeq = Math.max(0, Number(incoming?.unreadFromSeq) || 0);
  const existingBadge = Math.max(0, Number(existing?.badge) || 0);
  const incomingBadge = Math.max(0, Number(incoming?.badge) || 0);
  const existingLatestSeq = conversationSequenceFloor(existing);
  const incomingLatestSeq = conversationSequenceFloor(incoming);
  const incomingLatestIncomingSeq = incomingConversationSequenceFloor(incoming, viewerId);
  const incomingHasNewMessages = incomingLatestSeq > existingLatestSeq;
  const incomingHasExplicitUnread = incomingUnreadFromSeq > 0 || incomingBadge > 0;
  const incomingHasUnreadAfterRead = incomingLatestIncomingSeq > readSeq;
  const incomingHasNewUnread = incomingHasUnreadAfterRead
    || (incomingHasNewMessages && incomingLatestSeq > readSeq && incomingHasExplicitUnread);
  const existingHasUnread = existingUnreadFromSeq > existingReadSeq || existingBadge > 0;
  const existingHasReadState = Boolean(existingReadSeq || existingUnreadFromSeq || existingBadge);
  const incomingCursorAdvanced = incomingReadSeq > existingReadSeq;
  const incomingEqualUnreadIsValid = incomingReadSeq === existingReadSeq
    && incomingHasExplicitUnread
    && !existingHasUnread
    && (incomingUnreadFromSeq > readSeq || incomingLatestSeq > readSeq);
  const incomingStateCanReplace = incomingCursorAdvanced
    || incomingEqualUnreadIsValid
    || incomingHasNewUnread
    || (!existingHasReadState && (incomingUnreadFromSeq > 0 || incomingBadge > 0));

  let unreadFromSeq = existingUnreadFromSeq;
  let badge = existingBadge;
  if (incomingStateCanReplace) {
    if (incomingHasNewUnread) {
      const maximumUnread = Math.max(1, incomingLatestSeq - readSeq);
      unreadFromSeq = incomingUnreadFromSeq > readSeq
        ? incomingUnreadFromSeq
        : readSeq + 1;
      badge = incomingBadge > 0 ? Math.min(incomingBadge, maximumUnread) : maximumUnread;
    } else {
      unreadFromSeq = incomingUnreadFromSeq > readSeq ? incomingUnreadFromSeq : 0;
      badge = incomingBadge;
    }
  }

  // A boundary at or below the effective read cursor is never unread. Keep
  // the badge only when the source supplied a valid unread boundary.
  if (unreadFromSeq > 0 && unreadFromSeq <= readSeq) unreadFromSeq = 0;
  if (unreadFromSeq === 0 && incomingStateCanReplace && incomingBadge === 0) badge = 0;

  return { readSeq, unreadFromSeq, badge };
}

export function resolveConversationDeletedAt(existing = {}, incoming = {}) {
  const incomingDeletedAt = String(incoming?.deletedAt || '').trim();
  const existingDeletedAt = String(existing?.deletedAt || '').trim();
  const incomingManagementSnapshot = Boolean(
    incoming?.managementSnapshot || incoming?.management_snapshot,
  );
  return incomingManagementSnapshot && !incomingDeletedAt
    ? ''
    : incomingDeletedAt || existingDeletedAt;
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

const EMPTY_CONVERSATION_PREVIEWS = new Set([
  'Chưa có tin nhắn',
  'Bắt đầu cuộc trò chuyện',
  'Nhóm mới được tạo',
]);

function meaningfulConversationPreview(value) {
  const preview = conversationText(value);
  return EMPTY_CONVERSATION_PREVIEWS.has(preview) ? '' : preview;
}

export function resolveConversationPreview({
  existingPreview = '',
  incomingPreview = '',
  latestMessagePreview = '',
  incomingManagementSnapshot = false,
} = {}) {
  const latest = meaningfulConversationPreview(latestMessagePreview);
  const existing = meaningfulConversationPreview(existingPreview);
  const incoming = meaningfulConversationPreview(incomingPreview);
  if (latest) return latest;
  if (incomingManagementSnapshot) return existing || incoming || conversationText(incomingPreview) || conversationText(existingPreview);
  return incoming || existing || conversationText(incomingPreview) || conversationText(existingPreview);
}

export function resolveMergedConversationActivity(existing = {}, incoming = {}, messages = []) {
  const latestMessage = latestConversationMessage(messages);
  const existingTimestamp = conversationActivityTimestamp(existing);
  const incomingTimestamp = conversationActivityTimestamp(incoming);
  const latestMessageTimestamp = messageActivityTimestamp(latestMessage);
  const timestamp = Math.max(existingTimestamp, incomingTimestamp, latestMessageTimestamp);
  const metadataTime = incomingTimestamp >= existingTimestamp
    ? conversationText(incoming?.time) || conversationText(existing?.time)
    : conversationText(existing?.time) || conversationText(incoming?.time);

  return {
    latestMessage,
    timestamp,
    updatedAt: timestamp > 0
      ? new Date(timestamp).toISOString()
      : conversationText(incoming?.updatedAt) || conversationText(existing?.updatedAt),
    time: conversationText(latestMessage?.time) || metadataTime,
  };
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

function normalizeSticker(value) {
  const sticker = conversationObject(value);
  if (!sticker) return null;
  return {
    ...sticker,
    id: conversationIdentity(sticker.id || sticker.stickerId),
    stickerId: conversationIdentity(sticker.stickerId || sticker.id),
    packId: conversationIdentity(sticker.packId || sticker.pack),
    label: conversationText(sticker.label || sticker.name),
    src: conversationMedia(sticker.src || sticker.url),
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
  const defaultName = conversationText(
    member.defaultName
      || member.default_name
      || member.name
      || member.username
      || member.email,
  );
  const nickname = conversationText(member.nickname || member.contactNickname || member.contact_nickname);
  return {
    ...member,
    id: conversationIdentity(member.id),
    uid: conversationIdentity(member.uid),
    tinodeUid: conversationIdentity(member.tinodeUid || member.tinode_uid),
    name: nickname || defaultName,
    defaultName,
    default_name: defaultName,
    nickname,
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

function normalizeReactionUsers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([emoji, users]) => [
      conversationText(emoji),
      conversationArray(users).map(user => {
        const normalized = conversationObject(user);
        if (!normalized) return null;
        const id = conversationIdentity(
          normalized.id
          || normalized.uid
          || normalized.tinodeUid
          || normalized.tinode_uid,
        );
        if (!id) return null;
        return {
          ...normalized,
          id,
          uid: conversationIdentity(normalized.uid),
          tinodeUid: conversationIdentity(normalized.tinodeUid || normalized.tinode_uid),
          name: conversationText(normalized.name) || id,
          avatar: conversationMedia(normalized.avatar || normalized.photo),
        };
      }).filter(Boolean),
    ])
    .filter(([emoji, users]) => emoji && users.length > 0));
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
    imageBatch: normalizeImageBatch(message.imageBatch || message.image_batch),
    poll: normalizePoll(message.poll || message.pollData || message.poll_data),
    pollEvent: normalizePollEvent(message.pollEvent || message.poll_event),
    pollActivity: (() => {
      const source = message.pollActivity || message.poll_activity;
      const normalized = normalizePollEvent(source);
      return normalized
        ? { ...normalized, seq: Number(source?.seq) > 0 ? Number(source.seq) : 0 }
        : null;
    })(),
    pollActivitySeq: Number(message.pollActivitySeq || message.poll_activity_seq) > 0
      ? Number(message.pollActivitySeq || message.poll_activity_seq)
      : 0,
    pollActivityAt: conversationText(message.pollActivityAt || message.poll_activity_at),
    pollActivityActorId: conversationIdentity(message.pollActivityActorId || message.poll_activity_actor_id),
    pollActivityActorName: conversationText(message.pollActivityActorName || message.poll_activity_actor_name),
    sticker: normalizeSticker(message.sticker),
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
    reactionUsers: normalizeReactionUsers(message.reactionUsers),
    receiptUsers: normalizeReceiptUsers(message.receiptUsers || message.receipts),
    systemEvent: normalizeEvent(message.systemEvent),
    friendEvent: normalizeEvent(message.friendEvent),
    voiceDuration: Number(message.voiceDuration) > 0 ? Number(message.voiceDuration) : 0,
  };
}

// Normalize untrusted API/Tinode snapshots before any React code iterates them.
export function normalizeConversationShape(conversation) {
  const source = conversationObject(conversation) || {};
  const properties = conversationObject(source.properties) || {};
  const hasPinnedExplicitMarker = Object.prototype.hasOwnProperty.call(source, 'pinnedExplicit');
  const hasPinnedValue = hasPinnedExplicitMarker
    ? normalizeConversationFlag(source.pinnedExplicit)
    : Object.prototype.hasOwnProperty.call(source, 'pinned')
      || Object.prototype.hasOwnProperty.call(source, 'isPinned')
      || Object.prototype.hasOwnProperty.call(properties, 'pinned');
  const pinnedValue = Object.prototype.hasOwnProperty.call(source, 'pinned')
    ? source.pinned
    : Object.prototype.hasOwnProperty.call(source, 'isPinned')
      ? source.isPinned
      : properties.pinned;
  const hasDirectBlockExplicitMarker = Object.prototype.hasOwnProperty.call(source, 'directBlockExplicit');
  const hasDirectBlockValue = hasDirectBlockExplicitMarker
    ? normalizeConversationFlag(source.directBlockExplicit)
    : [
      'blockedByViewer',
      'blocked_by_viewer',
      'blockedByPeer',
      'blocked_by_peer',
      'directMessagingBlocked',
      'direct_messaging_blocked',
    ].some(key => Object.prototype.hasOwnProperty.call(source, key));
  const directBlockState = hasDirectBlockValue
    ? normalizeDirectMessageBlockState(source)
    : {
      blockedByViewer: false,
      blockedByPeer: false,
      directMessagingBlocked: false,
    };
  const managementId = conversationText(source.managementId) || conversationText(source.management_id);
  const tinodeTopic = conversationText(source.tinodeTopic) || conversationText(source.tinode_topic);
  const participantIds = conversationArray(source.participantIds)
    .map(value => conversationIdentity(conversationObject(value)?.id || value))
    .filter(Boolean);
  const pendingParticipantIds = conversationArray(
    source.pendingParticipantIds || source.pending_participant_ids,
  )
    .map(value => conversationIdentity(conversationObject(value)?.id || value))
    .filter(Boolean);
  const members = conversationArray(source.members).map(normalizeMember).filter(Boolean);
  const pendingMembers = conversationArray(
    source.pendingMembers || source.pending_members,
  ).map(normalizeMember).filter(Boolean);
  const messages = conversationArray(source.messages).map(normalizeMessage).filter(Boolean);
  const friendEvents = conversationArray(source.friendEvents).map((message, index) => normalizeMessage(message, index)).filter(Boolean);
  const isGroup = source.isGroup === true || source.isGroup === 1 || source.isGroup === 'true';
  const groupSettings = isGroup
    ? normalizeGroupSettings(
      source.groupSettings
      || source.group_settings
      || source.properties?.groupSettings
      || source.properties?.group_settings,
    )
    : undefined;
  const mutedUntil = typeof source.notificationMutedUntil === 'string' || typeof source.notificationMutedUntil === 'number'
    ? source.notificationMutedUntil
    : undefined;
  const badge = Number(source.badge);
  const readSeq = Number(source.readSeq);
  const unreadFromSeq = Number(source.unreadFromSeq);
  const readAt = typeof source.readAt === 'string' || typeof source.readAt === 'number'
    ? source.readAt
    : undefined;
  const hasConversationBackground = Object.prototype.hasOwnProperty.call(source, 'conversationBackground')
    || Object.prototype.hasOwnProperty.call(source, 'conversation_background');
  const conversationBackground = hasConversationBackground
    ? normalizeConversationBackground(source.conversationBackground || source.conversation_background)
    : undefined;
  const directAvatar = conversationMedia(source.avatarUrl) || conversationMedia(source.avatar);
  const persistedAvatar = conversationMedia(
    source.properties?.group_avatar || source.properties?.avatar,
  );
  const hasConversationAvatar = Object.prototype.hasOwnProperty.call(source, 'avatarUrl')
    || Object.prototype.hasOwnProperty.call(source, 'avatar')
    || Boolean(persistedAvatar);

  return {
    ...source,
    id: conversationIdentity(source.id),
    managementId,
    tinodeTopic,
    name: conversationText(source.name),
    isGroup,
    groupSettings,
    // Chatmgt snapshots carry authoritative account/member IDs. Tinode
    // snapshots only carry realtime UIDs and must not replace that mapping.
    managementSnapshot: Boolean(source.managementSnapshot || source.management_snapshot),
    isChatbot: Boolean(source.isChatbot),
    avatarUrl: hasConversationAvatar ? (directAvatar || persistedAvatar) : undefined,
    avatarClass: conversationText(source.avatarClass),
    membersCount: conversationText(source.membersCount),
    description: conversationText(source.description),
    admin: conversationText(source.admin),
    adminId: conversationIdentity(source.adminId),
    members,
    participantIds,
    pendingMembers,
    pendingParticipantIds,
    messages,
    friendEvents,
    lastMsg: conversationText(source.lastMsg),
    time: conversationText(source.time),
    updatedAt: conversationText(source.updatedAt),
    readSeq: Number.isFinite(readSeq) && readSeq > 0 ? readSeq : 0,
    unreadFromSeq: Number.isFinite(unreadFromSeq) && unreadFromSeq > 0 ? unreadFromSeq : 0,
    ...(readAt !== undefined ? { readAt } : {}),
    ...(hasConversationBackground ? { conversationBackground } : {}),
    deletedAt: conversationText(source.deletedAt),
    category: conversationText(source.category),
    notificationMutedUntil: mutedUntil,
    badge: Number.isFinite(badge) ? badge : 0,
    // Realtime Tinode snapshots do not carry the viewer's Chatmgt pin.
    pinned: hasPinnedValue ? normalizeConversationFlag(pinnedValue) : false,
    pinnedExplicit: hasPinnedValue,
    ...directBlockState,
    // Tinode snapshots never own Chatmgt's viewer-scoped direct block state.
    directBlockExplicit: hasDirectBlockValue,
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

export function resolveTopicViewerReadSeq({
  serverReadSeq = 0,
  latestMessage = null,
  viewerId = '',
} = {}) {
  const serverRead = Math.max(0, Number(serverReadSeq) || 0);
  const latestSequence = Math.max(0, Number(latestMessage?.seq) || 0);
  const senderId = String(
    latestMessage?.from || latestMessage?.head?.['x-sender-id'] || '',
  ).trim();
  // Missing sender metadata is ambiguous. Treat it as incoming until the
  // server/read cursor confirms it; otherwise a new peer message can advance
  // the viewer cursor and suppress the unread indicator.
  const isOutgoing = latestSequence > 0
    && Boolean(senderId)
    && senderId === String(viewerId || '');
  return Math.max(serverRead, isOutgoing ? latestSequence : 0);
}

export function resolveTopicReadState({
  topicSequence = 0,
  serverReadSeq = 0,
  localReadFloor = 0,
  explicitUnreadCount,
} = {}) {
  const sequence = Math.max(0, Number(topicSequence) || 0);
  const serverRead = Math.max(0, Number(serverReadSeq) || 0);
  const readFloor = Math.max(0, Number(localReadFloor) || 0);
  const readSeq = Math.max(serverRead, readFloor);
  const derivedUnreadCount = Math.max(0, sequence - readSeq);
  const explicitUnread = Number(explicitUnreadCount);
  // Tinode invokes topic.onData before refreshing topic.unread. The newest
  // sequence and the monotonic read cursor are therefore the authoritative
  // pair whenever a sequence is available; explicitUnread is only a fallback
  // for metadata snapshots which do not expose one.
  const badge = sequence > 0
    ? derivedUnreadCount
    : Number.isFinite(explicitUnread) ? Math.max(0, explicitUnread) : 0;

  return {
    readSeq,
    unreadFromSeq: badge > 0 ? readSeq + 1 : 0,
    badge,
  };
}

export function messageForDeliveryStatus(message) {
  const senderId = message?.from || message?.head?.['x-sender-id'] || '';
  return message?.from || !senderId ? message : { ...message, from: senderId };
}

function receiptUsersChanged(previous, next) {
  const current = normalizeReceiptUsers(previous);
  const updated = normalizeReceiptUsers(next);
  return ['read', 'received'].some(key => (
    current[key].length !== updated[key].length
      || current[key].some((user, index) => user.id !== updated[key][index]?.id)
  ));
}

export function applyReceiptToMessages(messages = [], {
  seq = 0,
  what = '',
  viewerId = '',
  receiptUser = null,
} = {}) {
  const receiptSequence = Number(seq);
  if (!Number.isFinite(receiptSequence) || receiptSequence <= 0 || !['recv', 'read'].includes(what)) return messages;
  let changed = false;

  const nextMessages = messages.map(message => {
    const messageSequence = Number(message?.seq || message?.raw?.seq);
    const senderId = message?.senderId || message?.raw?.from || message?.raw?.head?.['x-sender-id'] || '';
    const outgoing = message?.sender === 'outgoing' || Boolean(viewerId && senderId === viewerId);
    if (!outgoing || !Number.isFinite(messageSequence) || messageSequence <= 0 || messageSequence > receiptSequence) return message;

    const nextStatus = deliveryStatusForReceipt(message, { seq: receiptSequence, what, viewerId });
    const nextReceiptUsers = mergeReceiptUsers(message.receiptUsers, {
      what,
      user: receiptUser,
      viewerId,
    });
    const receiptChanged = receiptUsersChanged(message.receiptUsers, nextReceiptUsers);
    if (nextStatus === (message.deliveryStatus || 'none') && !message.pending && !receiptChanged) return message;
    changed = true;
    return {
      ...message,
      pending: false,
      failed: false,
      deliveryStatus: nextStatus,
      receiptUsers: nextReceiptUsers,
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
