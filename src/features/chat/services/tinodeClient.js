import tinodeSdk from 'tinode-sdk';
import { resolveTinodePresenceOnline } from './chatRealtime';

/*
 * Thin integration layer around the Tinode browser SDK.
 *
 * Tinode owns realtime topics and messages only. Account, tenant, directory,
 * and conversation-list operations stay in chatManagementService.
 */

const { Drafty, Tinode } = tinodeSdk;

const env = import.meta.env || {};

const config = {
  host: env.VITE_TINODE_HOST || '',
  apiKey: env.VITE_TINODE_API_KEY || '',
  secure: env.VITE_TINODE_SECURE !== 'false',
  transport: env.VITE_TINODE_TRANSPORT || 'ws',
  appName: env.VITE_TINODE_APP_NAME || 'VICHAT/1.0',
  persist: env.VITE_TINODE_PERSIST === 'true',
};

const listeners = new Set();
let client = null;
let meTopic = null;
let currentSession = null;
let sessionAuth = null;
let sessionTokenProvider = null;
let sessionRequest = null;
let reconnectRequest = null;
let restoreAfterDisconnect = false;
let intentionalDisconnect = false;
const mediaObjectUrlCache = new Map();
const userProfileCache = new Map();
const userProfileRequests = new Map();
const userProfilesLoaded = new Set();
const topicSubscriptionRequests = new Map();
const fullHistoryRequests = new Map();
const fullHistoryTopics = new Set();
const groupPermissionMigrationRequests = new Map();
const groupPrivacyMigrationRequests = new Map();
const privateGroupTopics = new Set();
const conversationEmitTimers = new Map();
let conversationListRequest = null;
let contactsEventQueued = false;
let allowedConversationTopics = new Set();
const SYSTEM_EVENT_PREFIX = '__VICHAT_SYSTEM_EVENT__:';
const FRIEND_EVENT_PREFIX = '__SONGHONG_FRIEND_EVENT__:';
const REACTION_EVENT_PREFIX = '__VICHAT_REACTION_EVENT__:';
const RECALL_EVENT_PREFIX = '__VICHAT_RECALL_EVENT__:';
const MEDIA_PROXY_PREFIX = '/tinode-media';
// Keep room for Tinode's restricted auth/email/tel tags (server maximum is 16).
const MAX_DISCOVERY_TAGS = 13;
const MAX_TAG_LENGTH = 24;
const GROUP_MEMBER_MODE = 'JRWAS';
const GROUP_DEFAULT_AUTH_MODE = 'N';
const BACKGROUND_HISTORY_LIMIT = 100;
const RECONNECT_HISTORY_LIMIT = 100;
const OPEN_HISTORY_LIMIT = 1000;

// A host is enough to opt into Tinode mode; assertConfigured below provides a
// useful error when the API key is missing instead of silently using demo mode.
export const isTinodeConfigured = Boolean(config.host);

function emitEvent(event) {
  listeners.forEach(listener => listener(event));
}

function getTinodeConstructor() {
  return Tinode || null;
}

function getDrafty() {
  return Drafty || null;
}

function mediaProxyUrl(relativeUrl) {
  const path = String(relativeUrl || '');
  if (/^(?:https?:|data:|blob:)/i.test(path)) return path;
  if (path.startsWith(MEDIA_PROXY_PREFIX)) return path;
  return `${MEDIA_PROXY_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
}

function tinodeRequestHeaders(tinode) {
  const headers = { 'X-Tinode-APIKey': config.apiKey };
  const token = tinode.getAuthToken?.()?.token;
  if (token) headers['X-Tinode-Auth'] = `Token ${token}`;
  return headers;
}

async function uploadFile(tinode, file, avatarFor = '') {
  const form = new FormData();
  form.append('file', file, file.name || 'tep-dinh-kem');
  form.set('id', tinode.getNextUniqueId());
  if (avatarFor) form.set('topic', avatarFor);
  let response;
  try {
    response = await fetch(mediaProxyUrl('/v0/file/u/'), {
      method: 'POST',
      headers: tinodeRequestHeaders(tinode),
      body: form,
    });
  } catch (error) {
    throw new Error(`Không kết nối được máy chủ upload: ${error?.message || 'lỗi mạng'}`);
  }

  let packet;
  try {
    packet = await response.json();
  } catch {
    packet = null;
  }
  const url = packet?.ctrl?.params?.url;
  if (!response.ok || !url) {
    const detail = packet?.ctrl?.text || `HTTP ${response.status}`;
    throw new Error(`Tinode từ chối file: ${detail}`);
  }
  return url;
}

function assertConfigured() {
  if (!config.host || !config.apiKey) {
    throw new Error('Tinode chưa được cấu hình. Hãy khai báo VITE_TINODE_HOST và VITE_TINODE_API_KEY.');
  }
  if (!getTinodeConstructor()) {
    throw new Error('Không tải được package tinode-sdk. Hãy kiểm tra dependency của ứng dụng.');
  }
}

function normalizeDiscoveryKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function discoveryTag(prefix, value) {
  const key = normalizeDiscoveryKey(value);
  if (!key) return '';
  return `${prefix}_${key}`.slice(0, MAX_TAG_LENGTH);
}

function buildDiscoveryTags(username, name) {
  const normalizedName = normalizeDiscoveryKey(name);
  const nameParts = normalizedName.split('_').filter(Boolean);
  const tags = [
    String(username || '').trim().toLowerCase(),
    discoveryTag('user', username),
    discoveryTag('name', normalizedName),
    ...nameParts.map(part => discoveryTag('name', part)),
  ];

  // Add name prefixes so a partial query such as "nguy" can find "Nguyễn".
  nameParts.forEach(part => {
    for (let length = 2; length < part.length; length += 1) {
      tags.push(discoveryTag('name', part.slice(0, length)));
    }
  });

  return [...new Set(tags)]
    .filter(tag => /^[a-z0-9][a-z0-9_.-]{3,23}$/.test(tag))
    .slice(0, MAX_DISCOVERY_TAGS);
}

function buildDiscoveryQueries(value) {
  const raw = String(value || '').trim().toLowerCase();
  const normalized = normalizeDiscoveryKey(raw);
  return [...new Set([
    raw,
    normalized,
    `basic:${raw}`,
    `basic:${normalized}`,
    raw.includes('@') ? `email:${raw}` : '',
    discoveryTag('user', normalized),
    discoveryTag('name', normalized),
  ].filter(Boolean))];
}

function buildDirectoryDiscoveryQueries(value, accounts = []) {
  const keyword = normalizeDiscoveryKey(value);
  if (!keyword || !Array.isArray(accounts)) return [];

  return accounts
    .filter(account => account?.active !== false)
    .filter(account => normalizeDiscoveryKey([
      account.name,
      account.username,
      account.email,
      account.department,
    ].filter(Boolean).join(' ')).includes(keyword))
    .flatMap(account => [
      account.username ? `basic:${String(account.username).trim().toLowerCase()}` : '',
      account.email ? `email:${String(account.email).trim().toLowerCase()}` : '',
    ])
    .filter(Boolean);
}

function getClient() {
  assertConfigured();
  if (!client) {
    const Tinode = getTinodeConstructor();
    const nextClient = new Tinode({
      appName: config.appName,
      host: config.host,
      apiKey: config.apiKey,
      transport: config.transport,
      secure: config.secure,
      platform: 'web',
      persist: config.persist,
    });
    client = nextClient;
    nextClient.onDisconnect = (err) => {
      if (client !== nextClient || intentionalDisconnect || !sessionAuth) return;
      restoreAfterDisconnect = true;
      emitEvent({ type: 'disconnect', error: err });
    };
    nextClient.onAutoreconnectIteration = timeout => {
      if (client !== nextClient || !restoreAfterDisconnect || timeout < 0) return;
      emitEvent({ type: 'reconnecting', timeout });
    };
    nextClient.onConnect = () => {
      if (client !== nextClient || !restoreAfterDisconnect || intentionalDisconnect || !sessionAuth) return;
      restoreSessionAfterReconnect(nextClient).catch(() => {});
    };
  }
  return client;
}

function publicName(topic) {
  return topic?.public?.fn || topic?.public?.name || topic?.public?.title || topic?.name || 'Cuộc trò chuyện';
}

function normalizeAvatar(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    return value.startsWith('/v0/file/') ? mediaProxyUrl(value) : value;
  }
  if (typeof value.ref === 'string') return normalizeAvatar(value.ref);
  if (typeof value.url === 'string') return normalizeAvatar(value.url);
  if (typeof value.val === 'string') {
    return `data:${value.mime || 'image/jpeg'};base64,${value.val}`;
  }
  return '';
}

async function resolveProtectedMedia(value) {
  const normalized = normalizeAvatar(value);
  if (!normalized || !normalized.startsWith(MEDIA_PROXY_PREFIX)) return normalized;
  if (!mediaObjectUrlCache.has(normalized)) {
    const request = (async () => {
      const response = await fetch(normalized, {
        headers: tinodeRequestHeaders(getClient()),
      });
      if (!response.ok) throw new Error(`Không thể tải ảnh đại diện (HTTP ${response.status}).`);
      return URL.createObjectURL(await response.blob());
    })().catch(error => {
      mediaObjectUrlCache.delete(normalized);
      throw error;
    });
    mediaObjectUrlCache.set(normalized, request);
  }
  return mediaObjectUrlCache.get(normalized);
}

function isOpaqueUserId(value) {
  return /^usr[a-z0-9_-]+$/i.test(String(value || '').trim());
}

function usableProfileName(value) {
  const name = String(value || '').trim();
  return name && !isOpaqueUserId(name) ? name : '';
}

function cacheUserProfile(uid, publicProfile = {}) {
  if (!uid) return null;
  const previous = userProfileCache.get(uid) || {};
  const next = {
    id: uid,
    name: usableProfileName(publicProfile.fn || publicProfile.name || previous.name),
    avatar: normalizeAvatar(publicProfile.photo || publicProfile.avatar) || previous.avatar || '',
  };
  userProfileCache.set(uid, next);
  if (previous.id && (previous.name !== next.name || previous.avatar !== next.avatar)) {
    queueMicrotask(() => {
      listeners.forEach(listener => listener({ type: 'user-profile', profile: next }));
    });
  }
  return next;
}

async function loadUserProfile(uid, tinode = getClient()) {
  if (!uid) return null;
  const cached = userProfileCache.get(uid);
  // Subscriber snapshots may include a name while omitting the profile photo.
  // Complete one canonical user-description lookup before reusing the cache.
  if (userProfilesLoaded.has(uid)) return cached || null;
  if (userProfileRequests.has(uid)) return userProfileRequests.get(uid);

  const request = (async () => {
    let publicProfile = cached || {};
    if (uid === tinode.getCurrentUserID()) {
      publicProfile = meTopic?.public || {};
    } else {
      // A metadata request against a usr topic creates a P2P subscription in
      // Tinode. Profiles must come from existing subscription snapshots or the
      // management directory, never from a side-effecting lookup.
      publicProfile = tinode.cacheGetTopic?.(uid)?.public || publicProfile;
    }
    const profile = cacheUserProfile(uid, publicProfile) || cached || null;
    userProfilesLoaded.add(uid);
    return profile;
  })().finally(() => userProfileRequests.delete(uid));
  userProfileRequests.set(uid, request);
  return request;
}

function avatarFromTopic(topic) {
  return normalizeAvatar(topic?.public?.photo || topic?.public?.avatar);
}

function formatSystemEvent(event, viewerId) {
  const actorName = event.actorName || event.actorId || 'Một thành viên';
  const targets = event.targets || [];
  const targetNames = targets.map(target => target.name || target.id);
  if (event.action === 'member_added') {
    if (event.actorId === viewerId) return `Bạn đã thêm ${targetNames.join(', ')} vào nhóm`;
    if (targets.some(target => target.id === viewerId)) return `${actorName} đã thêm bạn vào nhóm`;
    return `${actorName} đã thêm ${targetNames.join(', ')} vào nhóm`;
  }
  if (event.action === 'member_left') {
    return event.actorId === viewerId ? 'Bạn đã rời khỏi nhóm' : `${actorName} đã rời khỏi nhóm`;
  }
  if (event.action === 'member_removed') {
    if (targets.some(target => target.id === viewerId)) return `${actorName} đã xóa bạn khỏi nhóm`;
    return `${actorName} đã xóa ${targetNames.join(', ')} khỏi nhóm`;
  }
  if (event.action === 'group_created') {
    return event.actorId === viewerId ? 'Bạn đã tạo nhóm' : `${actorName} đã tạo nhóm`;
  }
  return event.text || 'Hoạt động nhóm';
}

function draftyAttachment(content) {
  let attachment = content?.ent?.find?.(entity => entity?.tp === 'EX' || entity?.tp === 'IM') || null;
  if (!attachment && Drafty?.entities && content) {
    Drafty.entities(content, (data, _index, type) => {
      if (type !== 'EX' && type !== 'IM') return false;
      attachment = { tp: type, data };
      return true;
    });
  }
  return attachment;
}

function deliveryStatusName(status) {
  if (status >= 70) return 'read';
  if (status >= 60) return 'received';
  if (status >= 50) return 'sent';
  if (status >= 30) return 'failed';
  if (status >= 20) return 'sending';
  return 'none';
}

function toMessage(msg, tinode, topic = null) {
  if (!msg || msg._deleted) return null;
  // Locally acknowledged messages may not have `from` yet; Tinode treats
  // those as outgoing and fills the sender when history is loaded again.
  // Never infer "outgoing" solely from a missing `from`: some Tinode
  // callbacks omit it for an optimistic/replayed packet. We stamp the sender
  // id in a private header when publishing and use it as a safe fallback.
  const messageSenderId = msg.from || msg.head?.['x-sender-id'] || '';
  const isOutgoing = messageSenderId ? tinode.isMe(messageSenderId) : false;
  const attachment = draftyAttachment(msg.content);
  const content = typeof msg.content === 'string' ? msg.content : (msg.content?.txt || '');
  let systemEvent = null;
  let friendEvent = null;
  let reactionEvent = null;
  let recallEvent = null;
  if (content.startsWith(SYSTEM_EVENT_PREFIX)) {
    try {
      systemEvent = JSON.parse(content.slice(SYSTEM_EVENT_PREFIX.length));
    } catch {
      systemEvent = null;
    }
  } else if (content.startsWith(FRIEND_EVENT_PREFIX)) {
    try {
      friendEvent = JSON.parse(content.slice(FRIEND_EVENT_PREFIX.length));
    } catch {
      friendEvent = null;
    }
  } else if (content.startsWith(REACTION_EVENT_PREFIX)) {
    try {
      reactionEvent = JSON.parse(content.slice(REACTION_EVENT_PREFIX.length));
    } catch {
      reactionEvent = null;
    }
  } else if (content.startsWith(RECALL_EVENT_PREFIX)) {
    try {
      recallEvent = JSON.parse(content.slice(RECALL_EVENT_PREFIX.length));
    } catch {
      recallEvent = null;
    }
  }
  const attachmentData = attachment?.data;
  const attachmentName = attachmentData?.name || 'Tệp đính kèm';
  const attachmentMime = attachmentData?.mime || 'application/octet-stream';
  const attachmentUrl = attachmentData?.ref
    || attachmentData?.url
    || (attachmentData?.val ? Drafty?.getDownloadUrl?.(attachmentData) : '');
  const attachmentExt = attachmentMime.includes('pdf') || /\.pdf$/i.test(attachmentName)
    ? 'pdf'
    : (/(spreadsheet|excel|csv)/i.test(attachmentMime) || /\.(xlsx?|csv)$/i.test(attachmentName) ? 'excel' : 'file');
  const clientId = msg.head?.['x-client-id'] || msg.head?.clientId;
  let replyTo = null;
  if (msg.head?.['x-reply-to']) {
    try { replyTo = JSON.parse(msg.head['x-reply-to']); } catch { replyTo = null; }
  }
  const friendActorId = friendEvent?.action === 'request' ? friendEvent.requesterId : friendEvent?.responderId;
  const friendActorName = friendEvent?.action === 'request' ? friendEvent.requesterName : friendEvent?.responderName;
  const deliveryStatus = topic?.msgStatus ? deliveryStatusName(topic.msgStatus(msg)) : 'none';
  return {
    id: friendEvent?.requestId
      ? `friend-${friendEvent.action}-${friendEvent.requestId}`
      : clientId || `${msg.from || 'system'}-${msg.seq || msg.ts || Date.now()}`,
    seq: msg.seq,
    type: friendEvent ? 'friend_event' : reactionEvent ? 'reaction_event' : recallEvent ? 'recall_event' : systemEvent ? 'system' : attachment ? (attachment.tp === 'IM' ? 'image' : 'file') : 'text',
    action: friendEvent?.action || systemEvent?.action,
    sender: isOutgoing ? 'outgoing' : 'incoming',
    senderId: friendActorId || systemEvent?.actorId || messageSenderId || (isOutgoing ? tinode.getCurrentUserID() : undefined),
    senderName: friendActorName || systemEvent?.actorName || (isOutgoing ? undefined : (messageSenderId || 'Thành viên')),
    targetIds: systemEvent?.targets?.map?.(target => target.id) || [],
    systemEvent,
    friendEvent,
    reactionEvent,
    recallEvent,
    replyTo,
    text: friendEvent ? (friendEvent.note || '') : systemEvent ? formatSystemEvent(systemEvent, tinode.getCurrentUserID()) : content,
    image: attachment?.tp === 'IM' ? attachmentUrl : undefined,
    file: attachment?.tp === 'EX' ? {
      name: attachmentName,
      ext: attachmentExt,
      size: attachmentData?.size ? `${Math.round(attachmentData.size / 1024)} KB` : 'Tinode attachment',
      url: attachmentUrl,
      mime: attachmentMime,
    } : undefined,
    time: msg.ts ? new Date(msg.ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '',
    createdAt: msg.ts ? new Date(msg.ts).toISOString() : undefined,
    pending: false,
    deliveryStatus,
    raw: msg,
  };
}

function toConversation(topic, tinode) {
  const isGroup = topic.isGroupType?.() || topic.name?.startsWith('grp');
  const deletedAt = topic.private?.vichatDeletedAt || '';
  const deletedTimestamp = Date.parse(deletedAt) || 0;
  const loadedMessages = [];
  topic.messages?.(msg => {
    const mapped = toMessage(msg, tinode, topic);
    if (mapped) loadedMessages.push(mapped);
  });
  const friendEvents = loadedMessages.filter(message => message.type === 'friend_event');
  const reactionEvents = loadedMessages.filter(message => message.type === 'reaction_event');
  const recallEvents = loadedMessages.filter(message => message.type === 'recall_event');
  const reactionState = new Map();
  reactionEvents.forEach(event => {
    const targetId = event.reactionEvent?.targetId;
    const emoji = event.reactionEvent?.emoji;
    const actorId = event.reactionEvent?.actorId || event.senderId || event.id;
    if (!targetId || !emoji) return;
    const states = reactionState.get(targetId) || {};
    states[`${actorId}:${emoji}`] = event.reactionEvent?.active !== false;
    reactionState.set(targetId, states);
  });
  const reactionCounts = new Map([...reactionState.entries()].map(([targetId, states]) => {
    const counts = {};
    Object.entries(states).forEach(([key, active]) => {
      if (!active) return;
      const emoji = key.slice(key.indexOf(':') + 1);
      counts[emoji] = (counts[emoji] || 0) + 1;
    });
    return [targetId, counts];
  }));
  const recallsById = new Map();
  const recallsBySeq = new Map();
  recallEvents.forEach(message => {
    const event = message.recallEvent || {};
    if (event.targetId) recallsById.set(String(event.targetId), message);
    if (Number(event.targetSeq) > 0) recallsBySeq.set(Number(event.targetSeq), message);
  });
  const appliedRecallEvents = new Set();
  const chatMessages = loadedMessages
    .filter(message => !['friend_event', 'reaction_event', 'recall_event'].includes(message.type))
    .map(message => {
      const recallMessage = recallsById.get(String(message.id)) || recallsBySeq.get(Number(message.seq));
      if (recallMessage) {
        appliedRecallEvents.add(recallMessage.id);
        return {
          ...message,
          type: 'text',
          text: 'Tin nhắn đã được thu hồi',
          recalled: true,
          file: undefined,
          image: undefined,
          replyTo: null,
          reactions: {},
        };
      }
      const withReactions = reactionCounts.has(message.id) ? { ...message, reactions: reactionCounts.get(message.id) } : message;
      return withReactions.replyTo?.id && recallsById.has(String(withReactions.replyTo.id))
        ? { ...withReactions, replyTo: { ...withReactions.replyTo, text: 'Tin nhắn đã được thu hồi' } }
        : withReactions;
    });

  // A successful hard delete removes the original packet from Tinode's cache.
  // Keep a synthetic placeholder from the recall event so every participant
  // still sees where the recalled message was in the conversation.
  recallEvents.forEach(message => {
    if (appliedRecallEvents.has(message.id)) return;
    const event = message.recallEvent || {};
    const originalCreatedAt = event.originalCreatedAt || message.createdAt;
    const originalSenderId = event.originalSenderId || event.actorId || message.senderId;
    const targetSeq = Number(event.targetSeq) || undefined;
    chatMessages.push({
      id: event.targetId || `recalled-${targetSeq || message.seq}`,
      seq: targetSeq,
      type: 'text',
      sender: tinode.isMe(originalSenderId) ? 'outgoing' : 'incoming',
      senderId: originalSenderId,
      senderName: originalSenderId,
      text: 'Tin nhắn đã được thu hồi',
      time: originalCreatedAt ? new Date(originalCreatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : message.time,
      createdAt: originalCreatedAt,
      recalled: true,
      pending: false,
      deliveryStatus: message.deliveryStatus,
      raw: message.raw,
    });
  });
  chatMessages.sort((first, second) => {
    if (Number.isFinite(first.seq) && Number.isFinite(second.seq) && first.seq !== second.seq) return first.seq - second.seq;
    return (Date.parse(first.createdAt || '') || 0) - (Date.parse(second.createdAt || '') || 0);
  });
  const messages = deletedTimestamp
    ? chatMessages.filter(message => (Date.parse(message.createdAt || '') || 0) > deletedTimestamp)
    : chatMessages;
  const latestMapped = messages[messages.length - 1];

  const members = [];
  topic.subscribers?.(sub => {
    if (sub?.user) {
      const cachedProfile = cacheUserProfile(sub.user, sub.public || {}) || {};
      members.push({
        id: sub.user,
        name: usableProfileName(sub.public?.fn || sub.public?.name) || cachedProfile.name || 'Thành viên',
        avatar: normalizeAvatar(sub.public?.photo || sub.public?.avatar) || cachedProfile.avatar || '',
        online: sub.online === true,
        mode: sub.acs?.getMode?.() || sub.mode,
      });
    }
  });

  // Tinode stores P2P presence on the contact topic. Direct topics often have
  // no subscriber list, so expose the peer from the topic itself.
  if (!isGroup && topic.name) {
    const cachedProfile = userProfileCache.get(topic.name) || {};
    const directMember = {
      id: topic.name,
      name: usableProfileName(topic.public?.fn || topic.public?.name) || cachedProfile.name || publicName(topic),
      avatar: normalizeAvatar(topic.public?.photo || topic.public?.avatar) || cachedProfile.avatar || avatarFromTopic(topic),
      online: topic.online === true,
      mode: topic.acs?.getMode?.() || '',
    };
    const existingIndex = members.findIndex(member => member.id === topic.name);
    if (existingIndex >= 0) members[existingIndex] = { ...members[existingIndex], ...directMember };
    else members.push(directMember);
  }

  const directPeer = !isGroup
    ? members.find(member => member.id !== tinode.getCurrentUserID()) || members[0]
    : null;

  return {
    id: topic.name,
    name: publicName(topic),
    isGroup,
    avatarUrl: avatarFromTopic(topic),
    avatarClass: isGroup ? 'group blue' : '',
    membersCount: isGroup ? `${members.length || 1} thành viên` : (directPeer?.online ? 'Online' : 'Offline'),
    description: topic.public?.note || topic.public?.fn || '',
    admin: members.find(member => member.mode?.includes?.('O'))?.name || '',
    adminId: members.find(member => member.mode?.includes?.('O'))?.id || '',
    members,
    messages,
    friendEvents,
    lastMsg: latestMapped?.text || latestMapped?.file?.name || (latestMapped?.image ? 'Image' : ''),
    time: latestMapped?.time || '',
    updatedAt: latestMapped?.createdAt || (topic.touched ? new Date(topic.touched).toISOString() : undefined),
    badge: messages.length > 0 ? Math.max(0, topic.unread || ((topic.seq || 0) - (topic.read || 0))) : 0,
    deletedAt,
    topic,
  };
}

async function enrichConversationProfiles(conversation, tinode = getClient()) {
  if (!conversation) return conversation;
  const profileIds = [...new Set([
    ...(conversation.members || []).map(member => member.id),
    ...(conversation.messages || []).map(message => message.senderId),
    ...(conversation.messages || []).flatMap(message => message.targetIds || []),
    ...(conversation.friendEvents || []).flatMap(message => [
      message.friendEvent?.requesterId,
      message.friendEvent?.recipientId,
      message.friendEvent?.responderId,
    ]),
  ].filter(Boolean))];
  const loadedProfiles = await Promise.all(profileIds.map(uid => loadUserProfile(uid, tinode)));
  const profilesById = new Map(profileIds.map((uid, index) => [uid, loadedProfiles[index]]));
  const members = (conversation.members || []).map(member => {
    const profile = profilesById.get(member.id) || {};
    return {
      ...member,
      name: usableProfileName(member.name) || profile.name || 'Thành viên',
      // Always prefer the current Tinode profile over an old topic snapshot.
      avatar: profile.avatar || member.avatar || '',
    };
  });
  members.forEach(member => profilesById.set(member.id, member));
  const peer = members.find(member => member.id !== tinode.getCurrentUserID()) || members[0];
  const messages = (conversation.messages || []).map(message => {
    const profile = profilesById.get(message.senderId) || userProfileCache.get(message.senderId);
    const next = {
      ...message,
      senderName: usableProfileName(message.senderName) || profile?.name || 'Thành viên',
      avatar: profile?.avatar || message.avatar || '',
    };
    if (message.type === 'system' && message.systemEvent) {
      const event = {
        ...message.systemEvent,
        actorName: profile?.name || message.systemEvent.actorName,
        targets: (message.systemEvent.targets || []).map(target => ({
          ...target,
          name: profilesById.get(target.id)?.name || target.name || target.id,
        })),
      };
      next.systemEvent = event;
      next.text = formatSystemEvent(event, tinode.getCurrentUserID());
    }
    return next;
  });
  const friendEvents = (conversation.friendEvents || []).map(message => {
    const event = message.friendEvent || {};
    const requester = profilesById.get(event.requesterId) || userProfileCache.get(event.requesterId) || {};
    const responder = profilesById.get(event.responderId) || userProfileCache.get(event.responderId) || {};
    const actor = event.action === 'request' ? requester : responder;
    return {
      ...message,
      senderName: actor.name || message.senderName,
      avatar: actor.avatar || message.avatar || '',
      friendEvent: {
        ...event,
        requesterName: requester.name || event.requesterName,
        responderName: responder.name || event.responderName,
      },
    };
  });
  return {
    ...conversation,
    avatarUrl: conversation.isGroup
      ? conversation.avatarUrl
      : (peer?.avatar || conversation.avatarUrl || ''),
    name: conversation.isGroup
      ? conversation.name
      : (usableProfileName(conversation.name) || peer?.name || 'Cuộc trò chuyện'),
    members,
    messages,
    friendEvents,
    admin: members.find(member => member.mode?.includes?.('O'))?.name || conversation.admin || '',
  };
}

function emitConversation(topic, tinode = topic?._tinode || getClient()) {
  if (!topic || tinode !== client || !allowedConversationTopics.has(topic.name)) return;
  const sessionUid = tinode.getCurrentUserID();
  const eventKey = `${sessionUid}:${topic.name}`;
  const pendingTimer = conversationEmitTimers.get(eventKey);
  if (pendingTimer) clearTimeout(pendingTimer);
  conversationEmitTimers.set(eventKey, setTimeout(() => {
    conversationEmitTimers.delete(eventKey);
    if (tinode !== client || sessionUid !== currentSession?.uid) return;
    enrichConversationProfiles(toConversation(topic, tinode), tinode)
      .then(next => {
        if (tinode !== client || sessionUid !== currentSession?.uid) return;
        listeners.forEach(listener => listener({ type: 'conversation', conversation: next, sessionUid }));
      })
      .catch(() => {
        if (tinode !== client || sessionUid !== currentSession?.uid) return;
        const next = toConversation(topic, tinode);
        listeners.forEach(listener => listener({ type: 'conversation', conversation: next, sessionUid }));
      });
  }, 20));
}

function presenceSnapshot(tinode = getClient()) {
  const snapshot = {};
  const me = tinode?.getMeTopic?.();
  me?.contacts?.(contact => {
    if (contact?.name && contact.isP2PType?.()) snapshot[contact.name] = contact.online === true;
  });
  return snapshot;
}

function emitPresence(uid, online) {
  if (!uid) return;
  listeners.forEach(listener => listener({
    type: 'presence',
    uid,
    online: Boolean(online),
  }));
}

function emitContactPresence(contact, eventType = '') {
  if (!contact?.name || !contact.isP2PType?.()) return;
  emitPresence(contact.name, resolveTinodePresenceOnline(eventType, contact.online));
  emitConversation(contact);
}

function emitPresenceSnapshot(tinode = getClient()) {
  const snapshot = presenceSnapshot(tinode);
  listeners.forEach(listener => listener({ type: 'presence-snapshot', snapshot }));
}

function emitContactsSoon() {
  if (contactsEventQueued) return;
  contactsEventQueued = true;
  queueMicrotask(() => {
    contactsEventQueued = false;
    listeners.forEach(listener => listener({ type: 'contacts' }));
  });
}

function wireTopic(topic) {
  const topicClient = topic?._tinode || getClient();
  topic.onData = () => emitConversation(topic, topicClient);
  topic.onMetaDesc = () => emitConversation(topic, topicClient);
  topic.onMetaSub = () => emitConversation(topic, topicClient);
  topic.onSubsUpdated = () => emitConversation(topic, topicClient);
  topic.onPres = () => emitConversation(topic, topicClient);
  topic.onInfo = info => {
    if (topicClient !== client || !info?.what) return;
    if (['kp', 'kpa', 'kpv'].includes(info.what)) {
      const subscriber = topic.subscriber?.(info.from);
      const profile = subscriber?.public || userProfileCache.get(info.from) || {};
      listeners.forEach(listener => listener({
        type: 'typing',
        topic: topic.name,
        uid: info.from,
        active: true,
        name: usableProfileName(profile.fn || profile.name) || 'Thành viên',
      }));
      return;
    }
    // Read/received receipts update Tinode's per-message status. Re-emit the
    // conversation so the React view can replace its check mark immediately.
    if (['read', 'recv'].includes(info.what)) emitConversation(topic, topicClient);
  };
  return topic;
}

function modeWithInvitePermissions(mode = '') {
  const permissions = new Set(String(mode).split(''));
  permissions.add('A');
  permissions.add('S');
  return 'JRWPASDO'.split('').filter(permission => permissions.has(permission)).join('');
}

async function ensurePrivateGroupDefaults(topic) {
  if (!topic?.isGroupType?.() || privateGroupTopics.has(topic.name)) return true;
  const access = topic.getAccessMode?.() || topic.acs;
  if (!String(access?.getMode?.() || '').includes('O')) return true;
  if (!groupPrivacyMigrationRequests.has(topic.name)) {
    const request = (async () => {
      const authMode = String(topic.defacs?.auth || GROUP_DEFAULT_AUTH_MODE);
      const anonMode = String(topic.defacs?.anon || GROUP_DEFAULT_AUTH_MODE);
      if (authMode !== GROUP_DEFAULT_AUTH_MODE || anonMode !== GROUP_DEFAULT_AUTH_MODE) {
        await topic.setMeta({
          desc: {
            defacs: {
              auth: GROUP_DEFAULT_AUTH_MODE,
              anon: GROUP_DEFAULT_AUTH_MODE,
            },
          },
        });
      }
      privateGroupTopics.add(topic.name);
      return true;
    })().finally(() => groupPrivacyMigrationRequests.delete(topic.name));
    groupPrivacyMigrationRequests.set(topic.name, request);
  }
  return groupPrivacyMigrationRequests.get(topic.name);
}

async function ensureGroupInvitePermissions(topic) {
  if (!topic?.isGroupType?.()) return true;
  if (!groupPermissionMigrationRequests.has(topic.name)) {
    const request = (async () => {
      let access = topic.getAccessMode?.() || topic.acs;
      const initialMode = access?.getMode?.() || '';

      // Keep discovery private and grant invite permissions only to explicit
      // members. Public JRWAS defaults let any authenticated user self-join.
      if (initialMode.includes('O')) {
        await ensurePrivateGroupDefaults(topic);
        const updates = [];
        topic.subscribers?.(sub => {
          if (!sub?.user || sub.user === getClient().getCurrentUserID()) return;
          const memberMode = sub.acs?.getMode?.() || sub.mode || '';
          if (!memberMode.includes('A') || !memberMode.includes('S')) {
            updates.push(topic.invite(sub.user, modeWithInvitePermissions(memberMode || GROUP_MEMBER_MODE)));
          }
        });
        await Promise.all(updates);
      }

      // Access is the intersection of what the owner grants and what the member
      // requests. Legacy members still request JRWS even after the owner grants
      // JRWAS, so update their complete wanted mode instead of applying "+AS".
      access = topic.getAccessMode?.() || topic.acs;
      let effectiveMode = access?.getMode?.() || '';
      if (!effectiveMode.includes('A') || !effectiveMode.includes('S')) {
        const wantedMode = access?.getWant?.() || effectiveMode || GROUP_MEMBER_MODE;
        await topic.updateMode(null, modeWithInvitePermissions(wantedMode));
        access = topic.getAccessMode?.() || topic.acs;
        effectiveMode = access?.getMode?.() || '';
      }
      return effectiveMode.includes('A') && effectiveMode.includes('S');
    })().finally(() => groupPermissionMigrationRequests.delete(topic.name));
    groupPermissionMigrationRequests.set(topic.name, request);
  }
  return groupPermissionMigrationRequests.get(topic.name);
}

async function subscribeTopic(topicName, { historyLimit = BACKGROUND_HISTORY_LIMIT, newerOnly = false } = {}) {
  const tinode = getClient();
  const topic = wireTopic(tinode.getTopic(topicName));
  if (!topic.isSubscribed?.()) {
    if (!topicSubscriptionRequests.has(topicName)) {
      const request = (async () => {
        const queryBuilder = topic.startMetaQuery()
          .withDesc()
          .withSub();
        if (historyLimit > 0) {
          if (newerOnly) {
            queryBuilder.withLaterData(historyLimit).withLaterDel(historyLimit);
          } else {
            queryBuilder.withEarlierData(historyLimit).withDel(undefined, historyLimit);
          }
        }
        const query = queryBuilder.build();
        await topic.subscribe(query);
        if (!newerOnly && historyLimit >= 1000) fullHistoryTopics.add(topicName);
      })().finally(() => topicSubscriptionRequests.delete(topicName));
      topicSubscriptionRequests.set(topicName, request);
    }
    await topicSubscriptionRequests.get(topicName);
  }

  // Existing owners migrate legacy public groups once per session. A failed
  // hardening request must not make an otherwise valid conversation unusable.
  await ensurePrivateGroupDefaults(topic).catch(() => false);

  if (!newerOnly && historyLimit >= 1000 && !fullHistoryTopics.has(topicName)) {
    if (!fullHistoryRequests.has(topicName)) {
      const request = (async () => {
        const query = topic.startMetaQuery()
          .withEarlierData(historyLimit)
          .withDel(undefined, historyLimit)
          .build();
        await topic.getMeta(query);
        fullHistoryTopics.add(topicName);
      })().finally(() => fullHistoryRequests.delete(topicName));
      fullHistoryRequests.set(topicName, request);
    }
    await fullHistoryRequests.get(topicName);
  }
  emitConversation(topic);
  return topic;
}

function sessionToken(value) {
  return value?.token || value || '';
}

function runSessionRequest(factory) {
  if (!sessionRequest) {
    sessionRequest = Promise.resolve().then(factory);
    const activeRequest = sessionRequest;
    const clearRequest = () => {
      if (sessionRequest === activeRequest) sessionRequest = null;
    };
    activeRequest.then(clearRequest, clearRequest);
  }
  return sessionRequest;
}

function rememberSessionAuth(session, fallback = {}) {
  sessionAuth = {
    username: session?.login || fallback.username || '',
    token: sessionToken(session?.token) || sessionToken(fallback.token),
    displayName: session?.profile?.name || fallback.displayName || '',
  };
}

function resetSessionState({ clearEventListeners = false } = {}) {
  intentionalDisconnect = true;
  restoreAfterDisconnect = false;
  sessionAuth = null;
  currentSession = null;
  meTopic = null;
  const activeClient = client;
  client = null;
  activeClient?.disconnect?.();
  for (const request of mediaObjectUrlCache.values()) {
    Promise.resolve(request).then(url => URL.revokeObjectURL(url)).catch(() => {});
  }
  mediaObjectUrlCache.clear();
  userProfileCache.clear();
  userProfileRequests.clear();
  userProfilesLoaded.clear();
  topicSubscriptionRequests.clear();
  fullHistoryRequests.clear();
  fullHistoryTopics.clear();
  groupPermissionMigrationRequests.clear();
  groupPrivacyMigrationRequests.clear();
  privateGroupTopics.clear();
  conversationEmitTimers.forEach(timer => clearTimeout(timer));
  conversationEmitTimers.clear();
  conversationListRequest = null;
  contactsEventQueued = false;
  allowedConversationTopics = new Set();
  sessionRequest = null;
  reconnectRequest = null;
  if (clearEventListeners) {
    listeners.clear();
    sessionTokenProvider = null;
  }
  intentionalDisconnect = false;
}

async function loginSession(tinode, { username, password, token, displayName = '' }) {
  if (!tinode.isConnected()) await tinode.connect();
  const normalizedToken = sessionToken(token);
  if (normalizedToken) {
    await tinode.loginToken(normalizedToken);
  } else {
    if (!username || !password) throw new Error('Thiếu thông tin xác thực Tinode.');
    await tinode.loginBasic(username, password);
  }
  const session = await initializeSession(tinode, username, displayName);
  rememberSessionAuth(session, { username, token: normalizedToken, displayName });
  return session;
}

async function registerSession(tinode, { username, password, name }) {
  if (!tinode.isConnected()) await tinode.connect();
  await tinode.createAccountBasic(username, password, {
    public: { fn: name },
    tags: buildDiscoveryTags(username, name),
  });
  const session = await initializeSession(tinode, username, name);
  rememberSessionAuth(session, { username, displayName: name });
  return session;
}

async function resubscribeAfterReconnect(tinode) {
  const topics = [];
  meTopic?.contacts(topic => {
    if (topic?.isCommType?.() && allowedConversationTopics.has(topic.name)) topics.push(topic);
  });
  await Promise.allSettled(topics.map(topic => subscribeTopic(topic.name, {
    historyLimit: RECONNECT_HISTORY_LIMIT,
    newerOnly: true,
  })));
  emitPresenceSnapshot(tinode);
}

function restoreSessionAfterReconnect(tinode) {
  if (reconnectRequest || !restoreAfterDisconnect || intentionalDisconnect || !sessionAuth) {
    return reconnectRequest || Promise.resolve(currentSession);
  }
  const authenticationRequest = sessionRequest || runSessionRequest(async () => {
    let reconnectAuth = sessionAuth;
    if (sessionTokenProvider) {
      const refreshedAuth = await sessionTokenProvider();
      reconnectAuth = { ...sessionAuth, ...refreshedAuth };
    }
    return loginSession(tinode, reconnectAuth);
  });
  reconnectRequest = authenticationRequest.then(async session => {
    await resubscribeAfterReconnect(tinode);
    restoreAfterDisconnect = false;
    emitEvent({ type: 'reconnect', session });
    return session;
  }).catch(error => {
    emitEvent({ type: 'reconnect-error', error });
    throw error;
  }).finally(() => {
    reconnectRequest = null;
  });
  return reconnectRequest;
}

async function initializeSession(tinode, fallbackLogin = '', preferredName = '') {
  meTopic = tinode.getMeTopic();
  meTopic.onMetaSub = contact => {
    emitContactsSoon();
    emitContactPresence(contact);
  };
  meTopic.onSubsUpdated = emitContactsSoon;
  meTopic.onContactUpdate = (what, contact) => {
    emitContactPresence(contact, what);
    if (what === 'msg' && contact?.isCommType?.()) {
      emitContactsSoon();
      if (allowedConversationTopics.has(contact.name)) {
        subscribeTopic(contact.name, { historyLimit: BACKGROUND_HISTORY_LIMIT, newerOnly: true }).catch(() => {});
      }
    } else if (['acs', 'gone', 'upd'].includes(what)) {
      emitContactsSoon();
    }
  };
  meTopic.onPres = presence => {
    if (presence?.src && (presence.what === 'on' || presence.what === 'off')) {
      emitPresence(presence.src, presence.what === 'on');
    }
  };
  const previousMetaDesc = meTopic.onMetaDesc;
  const previousSubsUpdated = meTopic.onSubsUpdated;
  let finishDescription;
  let finishSubscriptions;
  const descriptionReady = new Promise(resolve => {
    const timeout = setTimeout(resolve, 1000);
    finishDescription = () => {
      clearTimeout(timeout);
      resolve();
    };
  });
  // subscribe() resolves after the control packet, while the list of topics is
  // delivered in a following meta packet. Wait for that packet before building
  // the first conversation list, otherwise login can briefly replace histories
  // with empty contact snapshots.
  const subscriptionsReady = new Promise(resolve => {
    const timeout = setTimeout(resolve, 1000);
    finishSubscriptions = () => {
      clearTimeout(timeout);
      resolve();
    };
  });
  meTopic.onMetaDesc = topic => {
    previousMetaDesc?.(topic);
    finishDescription();
  };
  meTopic.onSubsUpdated = (...args) => {
    previousSubsUpdated?.(...args);
    finishSubscriptions();
  };
  const meQuery = meTopic.startMetaQuery().withDesc().withSub().build();
  await meTopic.subscribe(meQuery);
  await Promise.all([descriptionReady, subscriptionsReady]);
  meTopic.onMetaDesc = previousMetaDesc;
  meTopic.onSubsUpdated = previousSubsUpdated;
  emitPresenceSnapshot(tinode);

  let publicProfile = meTopic.public || {};
  const resolvedName = usableProfileName(publicProfile.fn || publicProfile.name)
    || usableProfileName(preferredName)
    || usableProfileName(fallbackLogin)
    || 'Người dùng';
  if (!usableProfileName(publicProfile.fn || publicProfile.name) && resolvedName) {
    try {
      await meTopic.setMeta({
        desc: {
          public: {
            ...publicProfile,
            fn: resolvedName,
          },
        },
      });
      publicProfile = { ...publicProfile, fn: resolvedName };
    } catch {
      // Login must remain usable even when an older server rejects profile repair.
    }
  }
  cacheUserProfile(tinode.getCurrentUserID(), publicProfile);
  currentSession = {
    uid: tinode.getCurrentUserID(),
    login: tinode.getCurrentLogin() || fallbackLogin,
    token: tinode.getAuthToken(),
    profile: {
      name: resolvedName,
      title: publicProfile.note || '',
      avatar: normalizeAvatar(publicProfile.photo || publicProfile.avatar),
    },
  };
  return currentSession;
}

export const tinodeClient = {
  get enabled() {
    return isTinodeConfigured;
  },

  onEvent(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  setTokenProvider(provider) {
    sessionTokenProvider = typeof provider === 'function' ? provider : null;
  },

  get authenticated() {
    return Boolean(currentSession && client?.isConnected?.() && client?.isAuthenticated?.());
  },

  get currentUserId() {
    return currentSession?.uid || '';
  },

  getPresenceSnapshot() {
    return presenceSnapshot(getClient());
  },

  getPendingConversationTopics() {
    const pendingTopics = [];
    meTopic?.contacts(topic => {
      if (topic?.isCommType?.() && topic.name && !allowedConversationTopics.has(topic.name)) {
        pendingTopics.push(String(topic.name));
      }
    });
    return pendingTopics;
  },

  async ensureSession(auth = {}) {
    const expectedUid = String(auth.uid || '');
    if (this.authenticated) {
      if (!expectedUid || String(currentSession?.uid || '') === expectedUid) return currentSession;
      resetSessionState();
    }
    const token = auth.token?.token || auth.token;
    intentionalDisconnect = false;
    const session = await runSessionRequest(() => auth.createAccount
      ? registerSession(getClient(), { username: auth.username, password: auth.password, name: auth.name })
      : loginSession(getClient(), {
          username: auth.username,
          password: auth.password,
          token,
          displayName: auth.displayName || auth.name || '',
        }));
    if (expectedUid && String(session?.uid || '') !== expectedUid) {
      resetSessionState();
      throw new Error('Phiên Tinode không khớp với tài khoản quản lý hiện tại.');
    }
    return session;
  },

  async login({ username, password, token, displayName = '' }) {
    intentionalDisconnect = false;
    return runSessionRequest(() => loginSession(getClient(), {
      username,
      password,
      token,
      displayName,
    }));
  },

  async register({ username, password, name }) {
    intentionalDisconnect = false;
    return runSessionRequest(() => registerSession(getClient(), { username, password, name }));
  },

  async resolveAvatarUrl(value) {
    return resolveProtectedMedia(value);
  },

  async updateCurrentProfile({ name = '', avatarFile = null, avatarUrl = '' } = {}) {
    const tinode = getClient();
    if (!meTopic) throw new Error('Phiên đăng nhập chưa sẵn sàng.');
    const currentPublic = meTopic.public || {};
    const resolvedName = usableProfileName(name)
      || usableProfileName(currentPublic.fn || currentPublic.name)
      || usableProfileName(tinode.getCurrentLogin())
      || 'Người dùng';
    let photo = currentPublic.photo || currentPublic.avatar || null;
    if (avatarFile) {
      const uploadedAvatarUrl = await uploadFile(tinode, avatarFile, 'me');
      photo = {
        ref: uploadedAvatarUrl,
        mime: avatarFile.type || 'image/jpeg',
        size: avatarFile.size || 0,
      };
    } else if (avatarUrl) {
      photo = { ref: avatarUrl };
    }
    await meTopic.setMeta({
      desc: {
        public: {
          ...currentPublic,
          fn: resolvedName,
          ...(photo ? { photo } : {}),
        },
      },
    });
    const profile = cacheUserProfile(tinode.getCurrentUserID(), { ...currentPublic, fn: resolvedName, photo });
    listeners.forEach(listener => listener({ type: 'profile', profile }));
    return profile;
  },

  setAllowedConversationTopics(topicNames = []) {
    allowedConversationTopics = new Set((topicNames || []).filter(Boolean).map(String));
    conversationListRequest = null;
  },

  allowConversationTopic(topicName) {
    if (topicName) allowedConversationTopics.add(String(topicName));
    conversationListRequest = null;
  },

  disallowConversationTopic(topicName) {
    if (topicName) allowedConversationTopics.delete(String(topicName));
    conversationListRequest = null;
  },

  async listConversations() {
    if (!meTopic) return [];
    if (!conversationListRequest) {
      const tinode = getClient();
      const activeMeTopic = meTopic;
      const request = (async () => {
        const topics = [];
        activeMeTopic.contacts(topic => {
          if (topic?.isCommType?.() && allowedConversationTopics.has(topic.name)) topics.push(topic);
        });
        await Promise.allSettled(topics.map(topic => subscribeTopic(topic.name, {
          historyLimit: BACKGROUND_HISTORY_LIMIT,
        })));
        if (tinode !== client || activeMeTopic !== meTopic) return [];
        const result = topics.map(topic => toConversation(topic, tinode));
        return Promise.all(result.map(conversation => enrichConversationProfiles(conversation, tinode)));
      })();
      conversationListRequest = request;
      const clearRequest = () => {
        if (conversationListRequest === request) conversationListRequest = null;
      };
      request.then(clearRequest, clearRequest);
    }
    return conversationListRequest;
  },

  async searchUsers(query, directoryAccounts = []) {
    const value = query.trim();
    if (!value) return [];
    const tinode = getClient();
    const fnd = tinode.getFndTopic();
    await fnd.subscribe();
    const result = new Map();

    const discoveryQueries = [...new Set([
      ...buildDiscoveryQueries(value),
      ...buildDirectoryDiscoveryQueries(value, directoryAccounts),
    ])];

    for (const discoveryQuery of discoveryQueries) {
      await fnd.setMeta({ desc: { public: discoveryQuery } });
      await fnd.getMeta(fnd.startMetaQuery().withSub(undefined, 30).build());
      fnd.contacts(sub => {
        // User discovery results from Tinode use `topic` for the user's UID.
        // Some server versions use `user`, so support both representations.
        const uid = sub?.user || sub?.topic;
        if (uid && uid !== tinode.getCurrentUserID()) {
          const profile = cacheUserProfile(uid, sub.public || {}) || {};
          result.set(uid, {
            id: uid,
            name: profile.name || 'Người dùng',
            avatar: profile.avatar || '',
            online: sub.online === true,
          });
        }
      });
    }

    return [...result.values()];
  },

  async resolveUserTopic(account = {}) {
    const knownUid = account.tinodeUid || account.tinode_uid || account.uid;
    if (/^usr[a-z0-9]{6,}$/i.test(String(knownUid || ''))) return knownUid;

    const queries = [...new Set([
      account.username ? `basic:${String(account.username).trim().toLowerCase()}` : '',
      account.email ? `email:${String(account.email).trim().toLowerCase()}` : '',
    ].filter(Boolean))];
    if (queries.length === 0) {
      throw new Error('Management service did not provide a Tinode user mapping.');
    }

    const tinode = getClient();
    const fnd = tinode.getFndTopic();
    if (!fnd.isSubscribed?.()) await fnd.subscribe();
    for (const query of queries) {
      await fnd.setMeta({ desc: { public: query } });
      await fnd.getMeta(fnd.startMetaQuery().withSub(undefined, 10).build());
      let resolved = '';
      fnd.contacts(sub => {
        if (!resolved) resolved = sub?.user || sub?.topic || '';
      });
      if (resolved && resolved !== tinode.getCurrentUserID()) return resolved;
    }
    throw new Error('Management account has no matching Tinode user.');
  },

  async openConversation(topicName) {
    const topic = await subscribeTopic(topicName, { historyLimit: OPEN_HISTORY_LIMIT });
    return enrichConversationProfiles(toConversation(topic, getClient()), getClient());
  },

  async restoreConversation(topicName) {
    const topic = await subscribeTopic(topicName, { historyLimit: OPEN_HISTORY_LIMIT });
    return enrichConversationProfiles(toConversation(topic, getClient()), getClient());
  },

  async markRead(topicName) {
    const topic = await subscribeTopic(topicName);
    topic.noteRead();
    emitConversation(topic);
  },

  async sendTyping(topicName) {
    const topic = await subscribeTopic(topicName, { historyLimit: 0 });
    topic.noteKeyPress();
  },

  async sendText(topicName, text, clientId, metadata = {}) {
    const topic = await subscribeTopic(topicName);
    const draft = topic.createMessage(text, false);
    const head = { ...(draft.head || {}) };
    if (clientId) head['x-client-id'] = clientId;
    head['x-sender-id'] = getClient().getCurrentUserID();
    if (metadata.replyTo) head['x-reply-to'] = JSON.stringify(metadata.replyTo);
    if (metadata.sharedFrom) head['x-shared-from'] = String(metadata.sharedFrom);
    draft.head = head;
    return topic.publishMessage(draft);
  },

  async sendReaction(topicName, targetId, emoji, active = true) {
    const topic = await subscribeTopic(topicName);
    const event = {
      targetId: String(targetId || ''),
      emoji: String(emoji || '').slice(0, 8),
      actorId: getClient().getCurrentUserID(),
      active: Boolean(active),
    };
    if (!event.targetId || !event.emoji) throw new Error('Thiếu tin nhắn hoặc biểu cảm.');
    return topic.publish(`${REACTION_EVENT_PREFIX}${JSON.stringify(event)}`);
  },

  async recallMessage(topicName, message = {}) {
    const topic = await subscribeTopic(topicName);
    const targetSeq = Number(message.seq) || 0;
    const targetId = String(message.id || '').trim();
    if (!targetId && !targetSeq) throw new Error('Tin nhắn không có định danh để thu hồi.');
    const actorId = getClient().getCurrentUserID();
    const event = {
      targetId,
      targetSeq,
      actorId,
      originalSenderId: message.senderId || actorId,
      originalCreatedAt: message.createdAt || message.raw?.ts || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    await topic.publish(`${RECALL_EVENT_PREFIX}${JSON.stringify(event)}`);
    // Some legacy topics do not grant hard-delete permission to regular
    // members. The persisted recall event still hides the original for all
    // subscribers; hard deletion is attempted as an additional safeguard.
    if (targetSeq) await topic.delMessagesList([targetSeq], true).catch(() => null);
    emitConversation(topic);
    return event;
  },

  async deleteMessage(topicName, seq, hard = false) {
    const topic = await subscribeTopic(topicName);
    if (!seq) throw new Error('Tin nhắn không có số thứ tự để thu hồi.');
    return topic.delMessagesList([Number(seq)], Boolean(hard));
  },

  async sendSystemEvent(topicName, event) {
    const topic = await subscribeTopic(topicName);
    return topic.publish(`${SYSTEM_EVENT_PREFIX}${JSON.stringify(event)}`);
  },

  async sendFriendRequest(uid, note = '') {
    const tinode = getClient();
    if (!uid || uid === tinode.getCurrentUserID()) {
      throw new Error('Không thể gửi lời mời kết bạn cho chính mình.');
    }
    const topic = await subscribeTopic(uid);
    const conversation = toConversation(topic, tinode);
    const events = (conversation.friendEvents || []).map(item => item.friendEvent).filter(Boolean);
    const responses = new Map(events
      .filter(event => event.requestId && event.action !== 'request')
      .map(event => [event.requestId, event]));
    const latestRequest = events
      .filter(event => event.action === 'request' && [event.requesterId, event.recipientId].includes(uid))
      .sort((first, second) => Date.parse(second.createdAt || '') - Date.parse(first.createdAt || ''))[0];
    const latestResponse = latestRequest ? responses.get(latestRequest.requestId) : null;
    if (latestRequest && !latestResponse) {
      throw new Error(latestRequest.requesterId === tinode.getCurrentUserID()
        ? 'Bạn đã gửi lời mời kết bạn tới tài khoản này.'
        : 'Tài khoản này đã gửi lời mời cho bạn. Hãy xử lý trong mục Thông báo.');
    }
    if (latestResponse?.action === 'accepted') {
      throw new Error('Hai tài khoản đã là bạn bè.');
    }

    const currentProfile = userProfileCache.get(tinode.getCurrentUserID()) || cacheUserProfile(tinode.getCurrentUserID(), meTopic?.public || {}) || {};
    const createdAt = new Date().toISOString();
    const event = {
      action: 'request',
      requestId: `friend-${tinode.getCurrentUserID()}-${uid}-${Date.now()}`,
      requesterId: tinode.getCurrentUserID(),
      requesterName: currentProfile.name || 'Một người dùng',
      recipientId: uid,
      note: String(note || '').trim().slice(0, 500),
      createdAt,
    };
    await topic.publish(`${FRIEND_EVENT_PREFIX}${JSON.stringify(event)}`);
    return event;
  },

  async respondFriendRequest(topicName, request, accepted) {
    const tinode = getClient();
    if (!request?.requestId || request.recipientId !== tinode.getCurrentUserID()) {
      throw new Error('Lời mời kết bạn không hợp lệ hoặc không thuộc tài khoản này.');
    }
    const topic = await subscribeTopic(topicName);
    const conversation = toConversation(topic, tinode);
    const alreadyHandled = (conversation.friendEvents || []).some(item => {
      const event = item.friendEvent;
      return event?.requestId === request.requestId && event.action !== 'request';
    });
    if (alreadyHandled) throw new Error('Lời mời kết bạn này đã được xử lý.');

    const currentProfile = userProfileCache.get(tinode.getCurrentUserID()) || cacheUserProfile(tinode.getCurrentUserID(), meTopic?.public || {}) || {};
    const event = {
      action: accepted ? 'accepted' : 'rejected',
      requestId: request.requestId,
      requesterId: request.requesterId,
      recipientId: request.recipientId,
      responderId: tinode.getCurrentUserID(),
      responderName: currentProfile.name || 'Một người dùng',
      createdAt: new Date().toISOString(),
    };
    await topic.publish(`${FRIEND_EVENT_PREFIX}${JSON.stringify(event)}`);
    topic.noteRead();
    return event;
  },

  async sendFile(topicName, file, clientId) {
    const tinode = getClient();
    const topic = await subscribeTopic(topicName);
    const url = await uploadFile(tinode, file);
    const Drafty = getDrafty();
    if (!Drafty?.attachFile) {
      throw new Error('Không tải được bộ đóng gói file của Tinode.');
    }
    // Tinode only forwards an uploaded file when its URL is embedded in a
    // Drafty EX entity. Passing the URL as a second argument to Topic's
    // publishMessage is ignored by the SDK and produces an empty message.
    const content = Drafty.attachFile(null, {
      mime: file.type || 'application/octet-stream',
      filename: file.name || 'Tệp đính kèm',
      refurl: url,
      size: file.size || 0,
    });
    const draft = topic.createMessage(content, false);
    draft.head = { ...(draft.head || {}), 'x-sender-id': tinode.getCurrentUserID() };
    if (clientId) draft.head['x-client-id'] = clientId;
    const result = await topic.publishMessage(draft);
    if (!result) throw new Error('Tinode không xác nhận tin nhắn đính kèm.');
    return {
      ctrl: result,
      file: {
        name: file.name || 'attachment',
        mime: file.type || 'application/octet-stream',
        size: file.size || 0,
        url,
      },
    };
  },

  async downloadFile(file) {
    if (!file?.url) throw new Error('File này chưa có đường dẫn tải xuống.');
    const tinode = getClient();
    const response = await fetch(mediaProxyUrl(file.url), {
      headers: tinodeRequestHeaders(tinode),
    });
    if (!response.ok) throw new Error(`Không thể tải file (HTTP ${response.status}).`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = file.name || 'tep-dinh-kem';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  },

  async fetchFile(file) {
    if (!file?.url) throw new Error('File này chưa có đường dẫn tải xuống.');
    const response = await fetch(mediaProxyUrl(file.url), {
      headers: tinodeRequestHeaders(getClient()),
    });
    if (!response.ok) throw new Error(`Không thể tải file (HTTP ${response.status}).`);
    const blob = await response.blob();
    return new File([blob], file.name || 'tep-chat', {
      type: file.mime || blob.type || 'application/octet-stream',
    });
  },

  async createGroup({ name, description = '', memberIds = [], avatarFile = null }) {
    const tinode = getClient();
    const topic = wireTopic(tinode.getTopic(tinode.newGroupTopicName(false)));
    const query = topic.startMetaQuery().withDesc().withSub().build();
    await topic.subscribe(
      query,
      {
        desc: {
          public: { fn: name, note: description },
          defacs: { auth: GROUP_DEFAULT_AUTH_MODE, anon: GROUP_DEFAULT_AUTH_MODE },
        },
      },
    );
    if (avatarFile) {
      const avatarUrl = await uploadFile(tinode, avatarFile, topic.name);
      await topic.setMeta({
        desc: {
          public: {
            fn: name,
            note: description,
            photo: {
              ref: avatarUrl,
              mime: avatarFile.type || 'image/jpeg',
              size: avatarFile.size || 0,
            },
          },
        },
      });
    }
    await Promise.all(memberIds.filter(Boolean).map(uid => topic.invite(uid, GROUP_MEMBER_MODE)));
    emitConversation(topic);
    return enrichConversationProfiles(toConversation(topic, tinode), tinode);
  },

  async discardGroupTopic(topicName) {
    if (!String(topicName || '').startsWith('grp')) return;
    const tinode = getClient();
    const topic = tinode.getTopic(topicName);
    if (topic) await topic.delTopic(true);
    tinode.cacheRemTopic?.(topicName);
    allowedConversationTopics.delete(String(topicName));
    topicSubscriptionRequests.delete(topicName);
    fullHistoryRequests.delete(topicName);
    fullHistoryTopics.delete(topicName);
    conversationListRequest = null;
  },

  async addMember(topicName, uid, mode = GROUP_MEMBER_MODE) {
    const topic = await subscribeTopic(topicName);
    const canInvite = await ensureGroupInvitePermissions(topic);
    if (!canInvite) {
      throw new Error('Bạn chưa được cấp quyền thêm thành viên. Chủ nhóm cần mở nhóm một lần để hệ thống nâng quyền thành viên.');
    }
    await topic.invite(uid, mode);
    return enrichConversationProfiles(toConversation(topic, getClient()), getClient());
  },

  async removeMember(topicName, uid) {
    const topic = await subscribeTopic(topicName);
    const currentMode = topic.getAccessMode?.()?.getMode?.() || topic.acs?.getMode?.() || '';
    if (!currentMode.includes('O')) {
      throw new Error('Chỉ quản trị viên của nhóm mới có thể xóa thành viên.');
    }
    if (!uid || uid === getClient().getCurrentUserID()) {
      throw new Error('Quản trị viên không thể tự xóa mình. Hãy dùng chức năng rời khỏi nhóm.');
    }
    await topic.delSubscription(uid);
    await topic.getMeta(topic.startMetaQuery().withSub().build());
    return enrichConversationProfiles(toConversation(topic, getClient()), getClient());
  },

  async leave(topicName) {
    const tinode = getClient();
    const topic = tinode.getTopic(topicName);
    if (topic) await topic.leave(true);
    topicSubscriptionRequests.delete(topicName);
    fullHistoryRequests.delete(topicName);
    fullHistoryTopics.delete(topicName);
  },

  async deleteConversation(topicName, { isGroup = false, unsubscribe = false } = {}) {
    const tinode = getClient();
    const topic = await subscribeTopic(topicName);
    // A soft server-side deletion is scoped to the current account. It hides
    // the full history without destroying other members' copy of a group.
    await topic.delMessagesAll(false);
    const deletedAt = new Date().toISOString();
    if (isGroup || unsubscribe) {
      await topic.leave(true);
      tinode.cacheRemTopic?.(topicName);
      topicSubscriptionRequests.delete(topicName);
      fullHistoryRequests.delete(topicName);
      fullHistoryTopics.delete(topicName);
    } else {
      await topic.setMeta({
        desc: {
          private: {
            ...(topic.private || {}),
            vichatDeletedAt: deletedAt,
          },
        },
      });
    }
    return { deletedAt };
  },

  async logout() {
    resetSessionState({ clearEventListeners: true });
  },
};

export function normalizeTinodeConversation(conversation) {
  const { topic: _topic, ...safeConversation } = conversation;
  return safeConversation;
}
