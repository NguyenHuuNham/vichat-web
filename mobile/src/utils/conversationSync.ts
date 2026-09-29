import { ChatMessage, Conversation, ConversationMember } from '../types';
import { identitiesOverlap, identityValues } from './identity';

function conversationTimestamp(conversation: Conversation) {
  const value = conversation.updatedAt;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isTinodeConversationSnapshot(conversation: Partial<Conversation> = {}) {
  return Boolean(
    conversation.snapshotSource === 'tinode'
      || (conversation.snapshotSource !== 'management'
        && conversation.tinodeTopic
        && (conversation.managementId === conversation.tinodeTopic
          || (conversation.pendingMembers === undefined && conversation.groupSettings === undefined))),
  );
}

/** Match a direct chat even when its cached snapshot uses a different ID namespace. */
export function isDirectConversationForUser(conversation: Partial<Conversation>, user: unknown) {
  if (conversation.isGroup || conversation.isChatbot) return false;
  const targetIdentities = new Set(identityValues(user));
  if (!targetIdentities.size) return false;

  if ((conversation.members || []).some(member => identitiesOverlap(member, user))) return true;
  if ((conversation.participantIds || []).some(participantId => targetIdentities.has(String(participantId || '').trim().toLowerCase()))) {
    return true;
  }

  const topic = String(conversation.tinodeTopic || '').trim().toLowerCase();
  return Boolean(topic && targetIdentities.has(topic));
}

function messageTimestamp(message: ChatMessage) {
  const value = message.createdAt || message.time;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareMessages(first: ChatMessage, second: ChatMessage) {
  const firstSeq = Number(first.seq) || 0;
  const secondSeq = Number(second.seq) || 0;
  if (firstSeq > 0 && secondSeq > 0 && firstSeq !== secondSeq) return firstSeq - secondSeq;
  const timestampDifference = messageTimestamp(first) - messageTimestamp(second);
  if (timestampDifference) return timestampDifference;
  if ((firstSeq > 0) !== (secondSeq > 0)) return firstSeq > 0 ? -1 : 1;
  return String(first.id).localeCompare(String(second.id));
}

function messageKey(message: ChatMessage) {
  const id = String(message.id || '').trim();
  const seq = Number(message.seq) || 0;
  return { id, seq };
}

function messagePreview(message: ChatMessage) {
  if (message.recalled) return message.text || 'Tin nhắn đã được thu hồi';
  if (message.text) return message.text;
  if (message.poll) return `Bình chọn: ${message.poll.question}`;
  if (message.image) return 'Đã gửi một hình ảnh';
  if (message.file) return `Đã gửi tệp ${message.file.name || ''}`.trim();
  if (message.sticker) return `Đã gửi sticker${message.sticker.label ? `: ${message.sticker.label}` : ''}`;
  return '';
}

function mergeMessages(current: ChatMessage[] = [], incoming: ChatMessage[] = []) {
  const merged: ChatMessage[] = [];
  const byId = new Map<string, number>();
  const bySeq = new Map<number, number>();

  const add = (message: ChatMessage) => {
    const { id, seq } = messageKey(message);
    const existingIndex = (id ? byId.get(id) : undefined)
      ?? (seq > 0 ? bySeq.get(seq) : undefined);
    if (existingIndex === undefined) {
      const index = merged.push(message) - 1;
      if (id) byId.set(id, index);
      if (seq > 0) bySeq.set(seq, index);
      return;
    }

    const existing = merged[existingIndex];
    const hasServerSequence = seq > 0 || Number(existing.seq) > 0;
    const next = {
      ...existing,
      ...message,
      id: id || existing.id,
      seq: seq || existing.seq,
      pending: hasServerSequence ? false : (message.pending ?? existing.pending),
      failed: hasServerSequence ? false : (message.failed ?? existing.failed),
      deliveryStatus: message.deliveryStatus && message.deliveryStatus !== 'none'
        ? message.deliveryStatus
        : existing.deliveryStatus || message.deliveryStatus,
      mentions: message.mentions?.length ? message.mentions : existing.mentions,
      reactions: message.reactions || existing.reactions,
      raw: message.raw || existing.raw,
    };
    merged[existingIndex] = next;
    if (next.id) byId.set(String(next.id), existingIndex);
    if (Number(next.seq) > 0) bySeq.set(Number(next.seq), existingIndex);
  };

  current.forEach(add);
  incoming.forEach(add);
  return merged.sort(compareMessages);
}

function memberIdentityValues(member: Partial<ConversationMember>) {
  return [member.id, member.uid, (member as any).tinodeUid, (member as any).tinode_uid, member.username, (member as any).userId, (member as any).user_id, (member as any).participantId, (member as any).participant_id]
    .filter(Boolean)
    .map(value => String(value).trim().toLowerCase());
}

function isTinodeUid(value: unknown) {
  return /^usr[a-z0-9_-]+$/i.test(String(value || '').trim());
}

function memberTinodeIdentity(member: Partial<ConversationMember>) {
  const source = member as any;
  return String(
    source.tinodeUid
      || source.tinode_uid
      || (isTinodeUid(source.uid) ? source.uid : '')
      || (isTinodeUid(source.id) ? source.id : '')
      || '',
  ).trim();
}

function memberAccountIdentity(member: Partial<ConversationMember>) {
  const source = member as any;
  const explicit = [
    source.userId,
    source.user_id,
    source.accountId,
    source.account_id,
    source.participantId,
    source.participant_id,
  ].map(value => String(value || '').trim()).find(Boolean);
  if (explicit) return explicit;
  const id = String(source.id || '').trim();
  const tinodeId = memberTinodeIdentity(member);
  return id && id !== tinodeId && !isTinodeUid(id) ? id : '';
}

function isGenericMemberName(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized === 'member' || normalized === 'thành viên' || normalized === 'thanh vien'
    || normalized === 'thÃ nh viÃªn' || normalized === 'thÃƒÂ nh viÃƒÂªn';
}

export function mergeMembers(current: ConversationMember[] = [], incoming: ConversationMember[] = [], preserveMissing = false) {
  const merged: ConversationMember[] = [];

  const add = (member: ConversationMember) => {
    const memberIdentities = memberIdentityValues(member);
    const existingIndex = merged.findIndex(existing => {
      const existingIdentities = memberIdentityValues(existing);
      return existingIdentities.some(identity => memberIdentities.includes(identity));
    });
    if (existingIndex < 0) {
      merged.push(member);
      return;
    }

    const existing = merged[existingIndex];
    const existingId = String(existing.id || '').trim();
    const existingUid = String(existing.uid || (existing as any).tinodeUid || memberTinodeIdentity(existing) || '').trim();
    const incomingId = String(member.id || '').trim();
    const incomingUid = String(member.uid || (member as any).tinodeUid || memberTinodeIdentity(member) || '').trim();
    const existingAccountId = memberAccountIdentity(existing);
    const incomingAccountId = memberAccountIdentity(member);
    const existingIsTinodeOnly = Boolean(!existingAccountId && memberTinodeIdentity(existing));
    const id = incomingAccountId && existingIsTinodeOnly
      ? incomingAccountId
      : existingAccountId || incomingAccountId || existingId || incomingId;
    const uid = incomingUid || existingUid || incomingId || existingId;
    merged[existingIndex] = {
      ...existing,
      ...member,
      id,
      uid,
      tinodeUid: (member as any).tinodeUid || (existing as any).tinodeUid || memberTinodeIdentity(member) || memberTinodeIdentity(existing) || uid,
      username: member.username || existing.username,
      name: isGenericMemberName(member.name) ? existing.name || member.name : member.name || existing.name,
      avatar: member.avatar || existing.avatar,
      groupRole: member.groupRole || existing.groupRole,
      role: member.role || existing.role,
      mode: member.mode || existing.mode,
    };
  };

  if (preserveMissing) current.forEach(add);
  incoming.forEach(add);
  return merged;
}

function enrichMessages(messages: ChatMessage[], members: ConversationMember[]) {
  return messages.map(message => {
    if (message.sender === 'outgoing') return message;
    const sender = members.find(member => memberIdentityValues(member).includes(String(message.senderId || '').trim().toLowerCase()));
    if (!sender) return message;
    return {
      ...message,
      senderName: isGenericMemberName(message.senderName) ? sender.name : (message.senderName || sender.name),
      avatar: message.avatar || sender.avatar,
    };
  });
}

export function conversationActivityTimestamp(conversation: Conversation) {
  const latestMessage = conversation.messages?.reduce((latest, message) => Math.max(latest, messageTimestamp(message)), 0) || 0;
  return Math.max(conversationTimestamp(conversation), latestMessage);
}

export function sortConversations(conversations: Conversation[]) {
  return [...conversations].sort((first, second) => (
    Number(Boolean(second.pinned)) - Number(Boolean(first.pinned))
    || conversationActivityTimestamp(second) - conversationActivityTimestamp(first)
  ));
}

/** Merge realtime snapshots without dropping pending, historical, or enriched messages. */
export function mergeConversation(first: Conversation, second: Conversation): Conversation {
  const incomingTinodeSnapshot = isTinodeConversationSnapshot(second);
  const messages = mergeMessages(first.messages || [], second.messages || []);
  const incomingMembers = Array.isArray(second.members) ? second.members : [];
  const members = second.members === undefined && !incomingTinodeSnapshot
    ? (first.members || [])
    : mergeMembers(first.members || [], incomingMembers, incomingTinodeSnapshot);
  const pendingMembers = second.pendingMembers !== undefined
    ? mergeMembers([], second.pendingMembers)
    : first.pendingMembers || [];
  const enrichedMessages = enrichMessages(messages, members);
  const latestMessage = enrichedMessages[enrichedMessages.length - 1];
  const firstActivity = conversationActivityTimestamp(first);
  const secondActivity = conversationActivityTimestamp(second);
  const activity = Math.max(firstActivity, secondActivity);
  const preferred = secondActivity >= firstActivity ? second : first;
  const fallback = preferred === first ? second : first;
  const incomingTinodeOnly = Boolean(
    second.tinodeTopic
      && second.managementId === second.tinodeTopic
      && first.managementId
      && first.managementId !== first.tinodeTopic,
  );
  const latestMessageText = latestMessage ? messagePreview(latestMessage) : '';
  const latestMessageAt = latestMessage ? messageTimestamp(latestMessage) : 0;
  const participantIds = incomingTinodeSnapshot
    ? (first.participantIds?.length
      ? [...new Set(first.participantIds.map(value => String(value || '').trim()).filter(Boolean))]
      : [...new Set((second.participantIds || []).map(value => String(value || '').trim()).filter(Boolean))])
    : second.participantIds !== undefined
      ? [...new Set(second.participantIds.map(value => String(value || '').trim()).filter(Boolean))]
      : (first.participantIds || []);
  const preferredUpdatedAt = conversationTimestamp(preferred) >= latestMessageAt
    ? preferred.updatedAt
    : latestMessage?.createdAt;

  return {
    ...fallback,
    ...preferred,
    id: incomingTinodeOnly ? first.id : (preferred.id || fallback.id),
    managementId: incomingTinodeOnly
      ? first.managementId
      : (preferred.managementId || fallback.managementId || preferred.id),
    tinodeTopic: preferred.tinodeTopic || fallback.tinodeTopic,
    snapshotSource: preferred.snapshotSource || fallback.snapshotSource,
    name: preferred.name || fallback.name,
    adminId: preferred.adminId || fallback.adminId,
    avatarUrl: preferred.avatarUrl || fallback.avatarUrl,
    description: preferred.description || fallback.description,
    membersCount: preferred.membersCount || fallback.membersCount,
    members,
    participantIds,
    pendingMembers,
    messages: enrichedMessages,
    lastMsg: latestMessageText || preferred.lastMsg || fallback.lastMsg,
    time: latestMessage?.time || preferred.time || fallback.time,
    updatedAt: preferredUpdatedAt || (activity > 0 ? new Date(activity).toISOString() : undefined),
    badge: preferred.badge !== undefined ? preferred.badge : fallback.badge,
    // Tinode snapshots do not contain viewer-scoped notification settings.
    notificationMutedUntil: incomingTinodeSnapshot
      ? first.notificationMutedUntil
      : preferred.notificationMutedUntil !== undefined
        ? preferred.notificationMutedUntil
        : fallback.notificationMutedUntil,
    pinned: preferred.pinned !== undefined ? preferred.pinned : fallback.pinned,
    // Chatmgt owns group policy. A Tinode public snapshot may carry stale
    // settings from before the latest management update and must not restore
    // them over the authoritative metadata.
    groupSettings: incomingTinodeSnapshot
      ? fallback.groupSettings
      : preferred.groupSettings !== undefined ? preferred.groupSettings : fallback.groupSettings,
    conversationNicknames: preferred.conversationNicknames !== undefined
      ? preferred.conversationNicknames
      : fallback.conversationNicknames,
    conversationBackground: incomingTinodeSnapshot
      ? fallback.conversationBackground
      : preferred.conversationBackground !== undefined
      ? preferred.conversationBackground
      : fallback.conversationBackground,
  };
}

export function mergeConversationIntoList(conversations: Conversation[], incoming: Conversation) {
  const index = conversations.findIndex(item => (
    item.id === incoming.id
    || (incoming.tinodeTopic && item.tinodeTopic === incoming.tinodeTopic)
    || (incoming.managementId && item.managementId === incoming.managementId)
  ));
  if (index < 0) return sortConversations([incoming, ...conversations]);
  const next = [...conversations];
  next[index] = mergeConversation(next[index], incoming);
  return sortConversations(next);
}

function conversationKey(conversation: Conversation) {
  const topic = String(conversation.tinodeTopic || '').trim();
  if (topic) return `topic:${topic}`;
  const managementId = String(conversation.managementId || conversation.id || '').trim();
  return managementId ? `management:${managementId}` : '';
}

function conversationRichness(conversation: Conversation) {
  return (conversation.tinodeTopic ? 4 : 0)
    + (conversation.managementId ? 2 : 0)
    + (conversation.members?.length ? 2 : 0)
    + (conversation.participantIds?.length ? 1 : 0)
    + (conversation.lastMsg ? 1 : 0)
    + (conversation.updatedAt ? 1 : 0);
}

function mergeDuplicateConversation(first: Conversation, second: Conversation) {
  const preferred = conversationActivityTimestamp(second) > conversationActivityTimestamp(first)
    || (conversationActivityTimestamp(second) === conversationActivityTimestamp(first)
      && conversationRichness(second) > conversationRichness(first))
    ? second
    : first;
  const fallback = preferred === first ? second : first;
  return mergeConversation(fallback, preferred);
}

/** Keep one mobile row for each Chatmgt/Tinode conversation identity. */
export function dedupeConversations(conversations: Conversation[]) {
  const result: Conversation[] = [];
  conversations.forEach(conversation => {
    if (!conversationKey(conversation)) return;
    const index = result.findIndex(existing => (
      existing.id === conversation.id
      || (existing.tinodeTopic && existing.tinodeTopic === conversation.tinodeTopic)
      || (existing.managementId && existing.managementId === conversation.managementId)
    ));
    if (index < 0) result.push(conversation);
    else result[index] = mergeDuplicateConversation(result[index], conversation);
  });
  return sortConversations(result);
}

export function retainAvailableConversations(conversations: Conversation[], availableTopics: Set<string>) {
  if (!availableTopics.size) return conversations;
  return conversations.filter(conversation => Boolean(
    conversation.tinodeTopic && availableTopics.has(conversation.tinodeTopic),
  ));
}
