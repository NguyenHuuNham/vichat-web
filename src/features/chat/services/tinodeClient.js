import tinodeSdk from 'tinode-sdk';
import {
  acknowledgeTopicReceived,
  deliveryStatusFromReceiptCursor,
  messageForDeliveryStatus,
  modeWithRealtimePresence,
  normalizeConversationShape,
  resolveTinodePresenceOnline,
} from './chatRealtime';
import {
  CALL_HEAD_STARTED,
  CALL_SIGNAL_EVENTS,
  callCapability,
  callHistoryLabel,
  extractCallInvite,
  normalizeIceServers,
  parseCallMessage,
  publishCallInvite,
} from './callSignaling';
import { attachmentConversationPreview } from './messagePreview';
import { normalizeImageBatch } from './imageBatchLayout';
import { normalizeGroupSettings } from './groupSettings';
import { applyPollEvent, normalizePoll, normalizePollEvent } from './poll';
import {
  CONVERSATION_BACKGROUND_SCOPES,
  latestSharedConversationBackground,
  normalizeConversationBackground,
} from './conversationBackground';
import { fetchProtectedMediaWithRetry } from './mediaRetryPolicy';
import {
  applyRecallToMessage,
  buildRecallEvent,
  canRecallDeliveredMessage,
  compactMessages,
  recallAppliesToViewer,
  recallPlaceholderSenderId,
} from './messagePolicy';

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
const conversationBackgroundAuxRequests = new Map();
const conversationBackgroundAuxTopics = new Set();
const fullHistoryRequests = new Map();
const fullHistoryTopics = new Set();
const groupPermissionMigrationRequests = new Map();
const groupPrivacyMigrationRequests = new Map();
const privateGroupTopics = new Set();
const callInviteKeys = new Set();
const conversationEmitTimers = new Map();
const topicReceiptCursors = new Map();
const mediaObjectUrlVersions = new Map();
let conversationListRequest = null;
let fndDiscoveryRequest = Promise.resolve();
let contactsEventQueued = false;
let allowedConversationTopics = new Set();
const SYSTEM_EVENT_PREFIX = '__VICHAT_SYSTEM_EVENT__:';
const FRIEND_EVENT_PREFIX = '__SONGHONG_FRIEND_EVENT__:';
const REACTION_EVENT_PREFIX = '__VICHAT_REACTION_EVENT__:';
const RECALL_EVENT_PREFIX = '__VICHAT_RECALL_EVENT__:';
const STICKER_HEAD = 'x-vichat-sticker';
const POLL_HEAD = 'x-vichat-poll';
const POLL_EVENT_PREFIX = '__VICHAT_POLL_EVENT__:';
const IMAGE_BATCH_HEAD = 'x-vichat-image-batch';
const CONVERSATION_BACKGROUND_AUX_KEY = 'x-vichat-conversation-background';
const TINODE_DELETE_CHAR = Tinode?.DEL_CHAR || '\u2421';
const MEDIA_PROXY_PREFIX = '/tinode-media';
// Keep room for Tinode's restricted auth/email/tel tags (server maximum is 16).
const MAX_DISCOVERY_TAGS = 13;
const MAX_TAG_LENGTH = 24;
const GROUP_MEMBER_MODE = 'JRWPAS';
const GROUP_DEFAULT_AUTH_MODE = 'N';
const BACKGROUND_HISTORY_LIMIT = 100;
const RECONNECT_HISTORY_LIMIT = 100;
const OPEN_HISTORY_LIMIT = 1000;
const CENTRAL_MESSAGE_TEXT_LIMIT = 120 * 1024;

// A host is enough to opt into Tinode mode; assertConfigured below provides a
// useful error when the API key is missing instead of silently using demo mode.
export const isTinodeConfigured = Boolean(config.host);

function emitEvent(event) {
  listeners.forEach(listener => listener(event));
}

function emitSessionReady(session) {
  if (session) emitEvent({ type: 'session-ready', session });
  return session;
}

function getTinodeConstructor() {
  return Tinode || null;
}

function getDrafty() {
  return Drafty || null;
}

function tinodeMediaPath(value) {
  const path = String(value || '');
  if (!path || /^(?:data:|blob:)/i.test(path)) return '';
  if (path.startsWith(`${MEDIA_PROXY_PREFIX}/`)) {
    const relayedPath = path.slice(MEDIA_PROXY_PREFIX.length);
    return relayedPath.startsWith('/v0/file/') ? relayedPath : '';
  }
  if (path.startsWith('/v0/file/')) return path;
  try {
    const parsed = new URL(path, 'https://tinode.invalid');
    if (parsed.pathname.startsWith('/v0/file/')) return `${parsed.pathname}${parsed.search}`;
    if (parsed.pathname.startsWith(`${MEDIA_PROXY_PREFIX}/v0/file/`)) {
      return `${parsed.pathname.slice(MEDIA_PROXY_PREFIX.length)}${parsed.search}`;
    }
    return '';
  } catch {
    return '';
  }
}

function isTinodeMediaUrl(value) {
  const path = String(value || '');
  return path.startsWith(MEDIA_PROXY_PREFIX) || Boolean(tinodeMediaPath(path));
}

function mediaProxyUrl(relativeUrl) {
  const path = String(relativeUrl || '');
  if (/^(?:data:|blob:)/i.test(path)) return path;
  if (path.startsWith(MEDIA_PROXY_PREFIX)) return path;
  const mediaPath = tinodeMediaPath(path);
  if (mediaPath) return `${MEDIA_PROXY_PREFIX}${mediaPath}`;
  if (/^https?:/i.test(path)) return path;
  return `${MEDIA_PROXY_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
}

function tinodeRequestHeaders(tinode) {
  const headers = { 'X-Tinode-APIKey': config.apiKey };
  const token = tinode.getAuthToken?.()?.token;
  if (token) headers['X-Tinode-Auth'] = `Token ${token}`;
  return headers;
}

function tokenExpiry(value) {
  if (!value) return new Date(Date.now() + 60_000);
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value < 10_000_000_000 ? value * 1000 : value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(Date.now() + 60_000) : parsed;
}

async function refreshTinodeAuth(tinode) {
  if (!sessionTokenProvider) return false;
  const refreshedAuth = await sessionTokenProvider();
  const refreshedToken = sessionToken(refreshedAuth?.token);
  if (!refreshedToken) return false;
  tinode.setAuthToken?.({
    token: refreshedToken,
    expires: tokenExpiry(refreshedAuth?.expires),
  });
  if (sessionAuth) sessionAuth = { ...sessionAuth, ...refreshedAuth, token: refreshedToken };
  return true;
}

function fetchProtectedMedia(value, options = {}) {
  const tinode = getClient();
  return fetchProtectedMediaWithRetry({
    request: () => fetch(mediaProxyUrl(value), {
      ...options,
      headers: tinodeRequestHeaders(tinode),
    }),
    refreshAuth: sessionTokenProvider ? () => refreshTinodeAuth(tinode) : null,
  });
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
    return isTinodeMediaUrl(value) ? mediaProxyUrl(value) : value;
  }
  if (typeof value.ref === 'string') return normalizeAvatar(value.ref);
  if (typeof value.url === 'string') return normalizeAvatar(value.url);
  if (typeof value.val === 'string') {
    return `data:${value.mime || 'image/jpeg'};base64,${value.val}`;
  }
  return '';
}

export function normalizeTinodeMediaUrl(value) {
  return normalizeAvatar(value);
}

function mediaCacheKey(value) {
  const normalized = normalizeAvatar(value);
  if (!normalized) return '';
  return `${normalized}|${mediaObjectUrlVersions.get(normalized) || 0}`;
}

function invalidateProtectedMedia(value) {
  const normalized = normalizeAvatar(value);
  if (!normalized || !normalized.startsWith(MEDIA_PROXY_PREFIX)) return;
  mediaObjectUrlVersions.set(normalized, (mediaObjectUrlVersions.get(normalized) || 0) + 1);
  [...mediaObjectUrlCache.entries()]
    .filter(([key]) => key.startsWith(`${normalized}|`))
    .forEach(([key, request]) => {
      mediaObjectUrlCache.delete(key);
      Promise.resolve(request).then(url => URL.revokeObjectURL(url)).catch(() => {});
    });
  listeners.forEach(listener => listener({ type: 'media-invalidated', url: normalized }));
}

async function resolveProtectedMedia(value) {
  const normalized = normalizeAvatar(value);
  if (!normalized || !normalized.startsWith(MEDIA_PROXY_PREFIX)) return normalized;
  const cacheKey = mediaCacheKey(normalized);
  if (!mediaObjectUrlCache.has(cacheKey)) {
    const request = (async () => {
      const response = await fetchProtectedMedia(normalized, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Không thể tải ảnh đại diện (HTTP ${response.status}).`);
      return URL.createObjectURL(await response.blob());
    })().catch(error => {
      mediaObjectUrlCache.delete(cacheKey);
      throw error;
    });
    mediaObjectUrlCache.set(cacheKey, request);
  }
  return mediaObjectUrlCache.get(cacheKey);
}

function isOpaqueUserId(value) {
  return /^usr[a-z0-9_-]+$/i.test(String(value || '').trim());
}

function usableProfileName(value) {
  const name = String(value || '').trim();
  return name && !isOpaqueUserId(name) ? name : '';
}

function cacheUserProfile(uid, publicProfile = {}, { refreshAvatar = false } = {}) {
  if (!uid) return null;
  const previous = userProfileCache.get(uid) || {};
  const next = {
    id: uid,
    name: usableProfileName(publicProfile.fn || publicProfile.name || previous.name),
    avatar: normalizeAvatar(publicProfile.photo || publicProfile.avatar) || previous.avatar || '',
  };
  const avatarChanged = previous.avatar !== next.avatar;
  if (previous.avatar && avatarChanged) {
    invalidateProtectedMedia(previous.avatar);
  }
  if (next.avatar && (avatarChanged || refreshAvatar)) {
    invalidateProtectedMedia(next.avatar);
  }
  userProfileCache.set(uid, next);
  if (previous.id && (previous.name !== next.name || previous.avatar !== next.avatar)) {
    queueMicrotask(() => {
      listeners.forEach(listener => listener({ type: 'user-profile', profile: next }));
    });
  }
  return next;
}

function cacheTopicProfiles(topic) {
  if (!topic) return;
  if (topic.name && topic.isP2PType?.()) {
    cacheUserProfile(topic.name, topic.public || {});
  }
  topic.subscribers?.(subscriber => {
    if (subscriber?.user) cacheUserProfile(subscriber.user, subscriber.public || {});
  });
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

function conversationBackgroundFromAux(topic) {
  if (!topic?.isP2PType?.() || typeof topic.aux !== 'function') return undefined;
  const raw = topic.aux(CONVERSATION_BACKGROUND_AUX_KEY);
  if (raw === undefined) return undefined;
  if (raw === TINODE_DELETE_CHAR || raw === null || raw === '') return null;
  try {
    return normalizeConversationBackground(JSON.parse(String(raw)));
  } catch {
    return undefined;
  }
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
  if (event.action === 'member_approved') {
    if (event.actorId === viewerId) return `Bạn đã duyệt ${targetNames.join(', ')} vào nhóm`;
    if (targets.some(target => target.id === viewerId)) return `${actorName} đã duyệt bạn vào nhóm`;
    return `${actorName} đã duyệt ${targetNames.join(', ')} vào nhóm`;
  }
  if (event.action === 'member_joined') {
    const joinedName = targetNames[0] || actorName;
    return event.actorId === viewerId || targets.some(target => target.id === viewerId)
      ? 'Bạn đã tham gia nhóm'
      : `${joinedName} đã tham gia nhóm`;
  }
  if (event.action === 'member_left') {
    const replacementName = String(event.replacementName || '').trim();
    const leaveText = event.actorId === viewerId ? 'Bạn đã rời khỏi nhóm' : `${actorName} đã rời khỏi nhóm`;
    return replacementName
      ? `${leaveText}. ${replacementName} đã trở thành trưởng nhóm mới`
      : leaveText;
  }
  if (event.action === 'member_removed') {
    if (targets.some(target => target.id === viewerId)) return `${actorName} đã xóa bạn khỏi nhóm`;
    return `${actorName} đã xóa ${targetNames.join(', ')} khỏi nhóm`;
  }
  if (event.action === 'group_created') {
    return event.actorId === viewerId ? 'Bạn đã tạo nhóm' : `${actorName} đã tạo nhóm`;
  }
  if (event.action === 'message_pinned' || event.action === 'message_unpinned') {
    const actionText = event.action === 'message_pinned' ? 'đã ghim tin nhắn' : 'đã bỏ ghim tin nhắn';
    const actorText = event.actorId === viewerId ? 'Bạn' : actorName;
    const preview = String(event.messagePreview || '').trim();
    return preview ? `${actorText} ${actionText}: “${preview}”` : `${actorText} ${actionText}`;
  }
  if (event.action === 'group_dissolved') {
    return event.actorId === viewerId ? 'Bạn đã giải tán nhóm' : `${actorName} đã giải tán nhóm`;
  }
  if (event.action === 'conversation_background_changed') {
    const actorText = event.actorId === viewerId ? 'Bạn đã' : `${actorName} đã`;
    return event.backgroundUrl
      ? `${actorText} đổi hình nền cuộc trò chuyện`
      : `${actorText} xóa hình nền cuộc trò chuyện`;
  }
  if (event.action === 'poll_vote') {
    const actorText = event.actorId === viewerId ? 'Bạn' : actorName;
    return `${actorText} đã bình chọn${event.optionText ? `: ${event.optionText}` : ''}`;
  }
  if (event.action === 'poll_option_added') {
    const actorText = event.actorId === viewerId ? 'Bạn' : actorName;
    return event.optionText
      ? `${actorText} đã thêm phương án “${event.optionText}”`
      : `${actorText} đã thêm một phương án`;
  }
  if (event.action === 'poll_locked') {
    const actorText = event.actorId === viewerId ? 'Bạn' : actorName;
    return `${actorText} đã khóa bình chọn`;
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

function parseStickerMetadata(head = {}) {
  const raw = head?.[STICKER_HEAD];
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const stickerId = String(parsed?.stickerId || parsed?.id || '').trim();
    const packId = String(parsed?.packId || '').trim();
    if (!stickerId || !packId || stickerId.length > 80 || packId.length > 80) return null;
    return {
      id: stickerId,
      stickerId,
      packId,
      label: String(parsed?.label || '').trim().slice(0, 120),
      version: String(parsed?.version || '1').slice(0, 24),
    };
  } catch {
    return null;
  }
}

function parsePollMetadata(head = {}) {
  const raw = head?.[POLL_HEAD];
  if (!raw) return null;
  try {
    return normalizePoll(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch {
    return null;
  }
}

function parsePollEventMetadata(content = '') {
  if (!String(content).startsWith(POLL_EVENT_PREFIX)) return null;
  try {
    return normalizePollEvent(JSON.parse(String(content).slice(POLL_EVENT_PREFIX.length)));
  } catch {
    return null;
  }
}

function parseImageBatchMetadata(head = {}) {
  const raw = head?.[IMAGE_BATCH_HEAD];
  if (!raw) return null;
  try {
    return normalizeImageBatch(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch {
    return null;
  }
}

function deliveryStatusName(status) {
  if (status >= 70) return 'read';
  if (status >= 60) return 'received';
  if (status >= 50) return 'sent';
  if (status >= 30) return 'failed';
  if (status >= 20) return 'sending';
  return 'none';
}

function rememberTopicReceipt(topicName, what, sequence) {
  const seq = Number(sequence);
  if (!topicName || !Number.isFinite(seq) || seq <= 0 || !['recv', 'read'].includes(what)) return;
  const current = topicReceiptCursors.get(topicName) || { receivedSeq: 0, readSeq: 0 };
  const key = what === 'read' ? 'readSeq' : 'receivedSeq';
  const next = Math.max(current[key] || 0, seq);
  if (next !== current[key]) topicReceiptCursors.set(topicName, { ...current, [key]: next });
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
  const call = parseCallMessage(msg.content, msg.head, !isOutgoing);
  const attachment = draftyAttachment(msg.content);
  const sticker = parseStickerMetadata(msg.head);
  const poll = parsePollMetadata(msg.head);
  const imageBatch = parseImageBatchMetadata(msg.head);
  const content = typeof msg.content === 'string' ? msg.content : (msg.content?.txt || '');
  const pollEvent = parsePollEventMetadata(content);
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
  const rawAttachmentUrl = attachmentData?.ref
    || attachmentData?.url
    || (attachmentData?.val
      ? (Drafty?.getDownloadUrl?.(attachmentData)
        || `data:${attachmentMime};base64,${attachmentData.val}`)
      : '');
  const attachmentUrl = rawAttachmentUrl ? mediaProxyUrl(rawAttachmentUrl) : '';
  const isImageAttachment = Boolean(attachment && (
    attachment.tp === 'IM'
    || /^image\//i.test(attachmentMime)
    || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(attachmentName)
  ));
  const attachmentExt = isImageAttachment
    ? 'image'
    : attachmentMime.includes('pdf') || /\.pdf$/i.test(attachmentName)
    ? 'pdf'
    : (/(spreadsheet|excel|csv)/i.test(attachmentMime) || /\.(xlsx?|csv)$/i.test(attachmentName) ? 'excel' : 'file');
  const clientId = msg.head?.['x-client-id'] || msg.head?.clientId;
  let replyTo = null;
  if (msg.head?.['x-reply-to']) {
    try { replyTo = JSON.parse(msg.head['x-reply-to']); } catch { replyTo = null; }
  }
  const voiceDuration = Number(msg.head?.['x-voice-duration']) > 0
    ? Number(msg.head['x-voice-duration'])
    : 0;
  let mentions = [];
  if (msg.head?.['x-mentions']) {
    try {
      const parsedMentions = JSON.parse(msg.head['x-mentions']);
      mentions = Array.isArray(parsedMentions) ? parsedMentions.slice(0, 50) : [];
    } catch {
      mentions = [];
    }
  }
  let chatbotSources = [];
  if (msg.head?.['x-vichat-chatbot-sources']) {
    try {
      const parsed = JSON.parse(msg.head['x-vichat-chatbot-sources']);
      chatbotSources = Array.isArray(parsed) ? parsed : [];
    } catch {
      chatbotSources = [];
    }
  }
  const friendActorId = friendEvent?.action === 'request' ? friendEvent.requesterId : friendEvent?.responderId;
  const friendActorName = friendEvent?.action === 'request' ? friendEvent.requesterName : friendEvent?.responderName;
  // Attachment echoes can omit `from` while retaining our stamped sender
  // header. Tinode's msgStatus uses `from` to count delivery receipts.
  const statusMessage = messageForDeliveryStatus(msg);
  const baseDeliveryStatus = topic?.msgStatus ? deliveryStatusName(topic.msgStatus(statusMessage)) : 'none';
  const receiptCursor = topicReceiptCursors.get(topic?.name) || {};
  const deliveryStatus = deliveryStatusFromReceiptCursor(
    { ...msg, sender: isOutgoing ? 'outgoing' : 'incoming', senderId: messageSenderId },
    {
      receivedSeq: receiptCursor.receivedSeq,
      readSeq: receiptCursor.readSeq,
      viewerId: tinode.getCurrentUserID(),
      currentStatus: baseDeliveryStatus,
    },
  );
  return {
    id: friendEvent?.requestId
      ? `friend-${friendEvent.action}-${friendEvent.requestId}`
      : clientId || `${msg.from || 'system'}-${msg.seq || msg.ts || Date.now()}`,
    seq: msg.seq,
    type: call ? 'call' : poll ? 'poll' : pollEvent ? 'poll_event' : friendEvent ? 'friend_event' : reactionEvent ? 'reaction_event' : recallEvent ? 'recall_event' : systemEvent ? 'system' : attachment ? (sticker ? 'sticker' : isImageAttachment ? 'image' : 'file') : 'text',
    action: friendEvent?.action || systemEvent?.action || pollEvent?.action,
    sender: isOutgoing ? 'outgoing' : 'incoming',
    senderId: friendActorId
      || (pollEvent ? (messageSenderId || pollEvent.actorId) : '')
      || systemEvent?.actorId
      || messageSenderId
      || (isOutgoing ? tinode.getCurrentUserID() : undefined),
    senderName: friendActorName
      || (pollEvent ? (pollEvent.actorName || (messageSenderId ? undefined : 'Thành viên')) : '')
      || systemEvent?.actorName
      || reactionEvent?.actorName
      || (isOutgoing ? undefined : (messageSenderId || 'Thành viên')),
    targetIds: systemEvent?.targets?.map?.(target => target.id) || [],
    messagePreview: systemEvent?.messagePreview || '',
    systemEvent,
    poll,
    pollEvent,
    friendEvent,
    reactionEvent,
    recallEvent,
    call,
    replyTo,
    sticker: sticker || undefined,
    voiceDuration,
    mentions,
    sources: chatbotSources,
    grounded: msg.head?.['x-vichat-chatbot-grounded'] === '1',
    text: call ? callHistoryLabel(call, isOutgoing) : poll ? poll.question : pollEvent ? '' : friendEvent ? (friendEvent.note || '') : systemEvent ? formatSystemEvent(systemEvent, tinode.getCurrentUserID()) : content,
    image: isImageAttachment ? attachmentUrl : undefined,
    imageBatch: imageBatch || undefined,
    file: attachment ? {
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
  const pollEventsById = new Map();
  loadedMessages.filter(message => message.type === 'poll_event').forEach(eventMessage => {
    const pollId = eventMessage.pollEvent?.pollId;
    if (!pollId) return;
    const events = pollEventsById.get(pollId) || [];
    events.push(eventMessage);
    pollEventsById.set(pollId, events);
  });
  pollEventsById.forEach(events => events.sort((first, second) => (
    (Number(first.seq) || 0) - (Number(second.seq) || 0)
  )));
  const visibleRecallEvents = recallEvents.filter(message => recallAppliesToViewer(message.recallEvent, tinode));
  const reactionState = new Map();
  reactionEvents.forEach(event => {
    const targetId = event.reactionEvent?.targetId;
    const emoji = event.reactionEvent?.emoji;
    // Tinode's packet sender is authoritative; the event payload only fills
    // the gap for legacy packets that omitted the sender field.
    const actorId = event.senderId || event.reactionEvent?.actorId || event.id;
    if (!targetId || !emoji) return;
    const targetStates = reactionState.get(targetId) || new Map();
    const emojiStates = targetStates.get(emoji) || new Map();
    emojiStates.set(String(actorId), {
      active: event.reactionEvent?.active !== false,
      user: {
        id: String(actorId),
        name: event.reactionEvent?.actorName || event.senderName || '',
        avatar: event.reactionEvent?.actorAvatar || event.avatar || '',
      },
    });
    targetStates.set(emoji, emojiStates);
    reactionState.set(targetId, targetStates);
  });
  const reactionCounts = new Map();
  const reactionUsers = new Map();
  reactionState.forEach((emojiStates, targetId) => {
    const counts = {};
    const usersByEmoji = {};
    emojiStates.forEach((actorStates, emoji) => {
      const activeUsers = [...actorStates.values()]
        .filter(state => state.active)
        .map(state => state.user);
      if (activeUsers.length > 0) {
        counts[emoji] = activeUsers.length;
        usersByEmoji[emoji] = activeUsers;
      }
    });
    reactionCounts.set(targetId, counts);
    reactionUsers.set(targetId, usersByEmoji);
  });
  const recallsById = new Map();
  const recallsBySeq = new Map();
  visibleRecallEvents.forEach(message => {
    const event = message.recallEvent || {};
    if (event.targetId) recallsById.set(String(event.targetId), message);
    if (Number(event.targetSeq) > 0) recallsBySeq.set(Number(event.targetSeq), message);
  });
  const appliedRecallEvents = new Set();
  const chatMessages = compactMessages(loadedMessages
    .filter(message => !['friend_event', 'reaction_event', 'recall_event', 'poll_event'].includes(message.type))
    .map(message => {
      const recallMessage = recallsById.get(String(message.id)) || recallsBySeq.get(Number(message.seq));
      if (recallMessage) {
        appliedRecallEvents.add(recallMessage.id);
        return applyRecallToMessage(message, recallMessage);
      }
      const withReactions = reactionCounts.has(message.id)
        ? {
          ...message,
          reactions: reactionCounts.get(message.id),
          reactionUsers: reactionUsers.get(message.id) || {},
        }
        : message;
      if (withReactions.type !== 'poll' || !withReactions.poll) {
        return withReactions.replyTo?.id && recallsById.has(String(withReactions.replyTo.id))
          ? { ...withReactions, replyTo: { ...withReactions.replyTo, text: 'Tin nhắn đã được thu hồi' } }
          : withReactions;
      }
      const pollEvents = pollEventsById.get(withReactions.poll.id) || [];
      let nextPoll = withReactions.poll;
      pollEvents.forEach(eventMessage => {
        nextPoll = applyPollEvent(
          nextPoll,
          eventMessage.pollEvent,
          eventMessage.senderId || eventMessage.pollEvent?.actorId,
          eventMessage.seq,
        );
      });
      const latestPollEvent = pollEvents.at(-1);
      const pollActivity = latestPollEvent?.pollEvent
        ? {
          ...latestPollEvent.pollEvent,
          actorId: latestPollEvent.senderId || latestPollEvent.pollEvent.actorId || '',
          actorName: latestPollEvent.pollEvent.actorName || latestPollEvent.senderName || '',
          seq: Number(latestPollEvent.seq) || 0,
        }
        : null;
      return {
        ...withReactions,
        poll: nextPoll,
        ...(pollActivity ? { action: pollActivity.action } : {}),
        ...(pollActivity ? {
          pollActivity,
          pollActivitySeq: pollActivity.seq,
          pollActivityAt: pollActivity.createdAt || nextPoll.lastActivityAt || withReactions.createdAt,
          pollActivityActorId: pollActivity.actorId,
          pollActivityActorName: pollActivity.actorName,
          seq: Math.max(Number(withReactions.seq) || 0, pollActivity.seq),
        } : {}),
      };
    }));

  // A successful hard delete removes the original packet from Tinode's cache.
  // Keep a synthetic placeholder from the recall event so every participant
  // still sees where the recalled message was in the conversation.
  visibleRecallEvents.forEach(message => {
    if (appliedRecallEvents.has(message.id)) return;
    const event = message.recallEvent || {};
    if (event.mode === 'self' && tinode.isMe?.(event.actorId || event.originalSenderId)) return;
    const originalCreatedAt = event.originalCreatedAt || message.createdAt;
    const originalSenderId = recallPlaceholderSenderId(event, message.senderId);
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
  pollEventsById.forEach(events => {
    events.forEach(eventMessage => {
      const pollEvent = eventMessage.pollEvent;
      if (!pollEvent) return;
      const systemEvent = {
        ...pollEvent,
        action: pollEvent.action,
        actorId: eventMessage.senderId || pollEvent.actorId || '',
        actorName: pollEvent.actorName || eventMessage.senderName || '',
      };
      chatMessages.push({
        id: `poll-activity-${eventMessage.id}`,
        seq: eventMessage.seq,
        type: 'system',
        action: pollEvent.action,
        sender: eventMessage.sender,
        senderId: systemEvent.actorId,
        senderName: systemEvent.actorName,
        systemEvent,
        pollEvent,
        text: formatSystemEvent(systemEvent, tinode.getCurrentUserID()),
        time: eventMessage.time,
        createdAt: eventMessage.createdAt,
        pending: false,
        raw: eventMessage.raw,
      });
    });
  });
  chatMessages.sort((first, second) => {
    if (Number.isFinite(first.seq) && Number.isFinite(second.seq) && first.seq !== second.seq) return first.seq - second.seq;
    return (Date.parse(first.createdAt || '') || 0) - (Date.parse(second.createdAt || '') || 0);
  });
  // A poll card follows its latest vote/lock event, while the event itself
  // remains in the normal timeline as the visible group activity notice.
  const movedPolls = chatMessages.filter(message => (
    message.type === 'poll'
      && Number(message.pollActivitySeq) > 0
      && Number(message.pollActivitySeq) > (Number(message.raw?.seq) || Number(message.seq) || 0)
  ));
  const projectedMessages = movedPolls.length > 0
    ? [
      ...chatMessages.filter(message => !movedPolls.includes(message)),
      ...movedPolls.sort((first, second) => Number(first.pollActivitySeq) - Number(second.pollActivitySeq)),
    ]
    : chatMessages;
  const finalMessages = deletedTimestamp
    ? projectedMessages.filter(message => (Date.parse(message.createdAt || '') || 0) > deletedTimestamp)
    : projectedMessages;
  const latestMapped = finalMessages[finalMessages.length - 1];
  const latestMappedActivityAt = latestMapped?.pollActivityAt || latestMapped?.createdAt;
  const latestMappedTime = latestMapped?.pollActivityAt
    ? new Date(latestMapped.pollActivityAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : latestMapped?.time;

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
  // The system event can arrive before the metadata packet on another client.
  // Use it as the immediate shared snapshot, while metadata remains the reload
  // fallback when the bounded message history no longer contains the event.
  const latestBackground = latestSharedConversationBackground({ messages: finalMessages });
  const auxBackground = !isGroup ? conversationBackgroundFromAux(topic) : undefined;
  const groupBackground = isGroup
    ? normalizeConversationBackground(
      topic.public?.vichat?.conversationBackground
        || topic.public?.vichat?.conversation_background
        || topic.public?.conversationBackground
        || topic.public?.conversation_background,
    )
    : undefined;
  const rawConversationBackground = latestBackground !== undefined
    ? latestBackground
    : isGroup
      ? groupBackground
      : auxBackground;
  const conversationBackground = rawConversationBackground
    ? { ...rawConversationBackground, url: normalizeAvatar(rawConversationBackground.url) }
    : rawConversationBackground;
  const topicSequence = Number(topic.seq) || 0;
  const topicReadSequence = Number(topic.read) || 0;
  const explicitUnreadCount = Number(topic.unread);
  const topicUnreadCount = Math.max(
    0,
    Number.isFinite(explicitUnreadCount) ? explicitUnreadCount : topicSequence - topicReadSequence,
  );

  return {
    id: topic.name,
    name: publicName(topic),
    isGroup,
    avatarUrl: avatarFromTopic(topic),
    avatarClass: isGroup ? 'group blue' : '',
    membersCount: isGroup ? `${members.length || 1} thành viên` : (directPeer?.online ? 'Đang hoạt động' : 'Ngoại tuyến'),
    description: topic.public?.note || topic.public?.fn || '',
    groupSettings: topic.public?.vichat?.groupSettings
      || topic.public?.vichat?.group_settings
      || topic.public?.groupSettings
      || topic.public?.group_settings,
    admin: members.find(member => member.mode?.includes?.('O'))?.name || '',
    adminId: members.find(member => member.mode?.includes?.('O'))?.id || '',
    members,
    messages: finalMessages,
    friendEvents,
    lastMsg: latestMapped?.type === 'poll'
      ? `Bình chọn: ${latestMapped.text || latestMapped.poll?.question || ''}`
      : attachmentConversationPreview(latestMapped) || latestMapped?.text || '',
    time: latestMappedTime || '',
    updatedAt: latestMappedActivityAt || (topic.touched ? new Date(topic.touched).toISOString() : undefined),
    ...(conversationBackground !== undefined ? { conversationBackground } : {}),
    readSeq: topicReadSequence,
    unreadFromSeq: topicUnreadCount > 0
      ? topicReadSequence + 1
      : 0,
    badge: finalMessages.length > 0 ? topicUnreadCount : 0,
    deletedAt,
    topic,
  };
}

async function enrichConversationProfiles(conversation, tinode = getClient()) {
  if (!conversation) return conversation;
  const safeConversation = normalizeConversationShape(conversation);
  const profileIds = [...new Set([
    ...(safeConversation.members || []).map(member => member.id),
    ...(safeConversation.messages || []).map(message => message.senderId),
    ...(safeConversation.messages || []).flatMap(message => message.targetIds || []),
    ...(safeConversation.messages || []).flatMap(message => Object.values(message.reactionUsers || {})
      .flatMap(users => (Array.isArray(users) ? users : []).map(user => user?.id))),
    ...(safeConversation.messages || []).flatMap(message => [
      message.poll?.creatorId,
      ...Object.keys(message.poll?.votes || {}),
      message.pollEvent?.actorId,
      message.pollActivityActorId,
      message.pollActivity?.actorId,
    ]),
    ...(safeConversation.friendEvents || []).flatMap(message => [
      message.friendEvent?.requesterId,
      message.friendEvent?.recipientId,
      message.friendEvent?.responderId,
    ]),
  ].filter(Boolean))];
  const loadedProfiles = await Promise.all(profileIds.map(uid => loadUserProfile(uid, tinode)));
  const profilesById = new Map(profileIds.map((uid, index) => [uid, loadedProfiles[index]]));
  const members = (safeConversation.members || []).map(member => {
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
  const messages = (safeConversation.messages || []).map(message => {
    const profile = profilesById.get(message.senderId) || userProfileCache.get(message.senderId);
    const next = {
      ...message,
      senderName: usableProfileName(message.senderName) || profile?.name || 'Thành viên',
      avatar: profile?.avatar || message.avatar || '',
      reactionUsers: Object.fromEntries(Object.entries(message.reactionUsers || {}).map(([emoji, users]) => [
        emoji,
        (Array.isArray(users) ? users : []).map(user => {
          const reactionProfile = profilesById.get(user.id) || userProfileCache.get(user.id) || {};
          return {
            ...user,
            name: usableProfileName(user.name) || reactionProfile.name || user.id,
            avatar: reactionProfile.avatar || user.avatar || '',
          };
        }),
      ])),
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
    if (message.poll) {
      const creator = profilesById.get(message.poll.creatorId) || userProfileCache.get(message.poll.creatorId) || {};
      const votes = Object.fromEntries(Object.entries(message.poll.votes || {}).map(([actorId, vote]) => {
        const voteProfile = profilesById.get(actorId) || userProfileCache.get(actorId) || {};
        return [actorId, {
          ...vote,
          name: usableProfileName(voteProfile.name) || vote.name || actorId,
          avatar: voteProfile.avatar || vote.avatar || '',
        }];
      }));
      next.poll = {
        ...message.poll,
        creatorName: usableProfileName(creator.name) || message.poll.creatorName,
        creatorAvatar: creator.avatar || message.poll.creatorAvatar || '',
        votes,
      };
    }
    if (message.pollActivity || message.pollActivityActorId) {
      const activityActorId = message.pollActivityActorId || message.pollActivity?.actorId || message.senderId;
      const activityProfile = profilesById.get(activityActorId) || userProfileCache.get(activityActorId) || {};
      const activityActorName = usableProfileName(activityProfile.name)
        || message.pollActivityActorName
        || message.pollActivity?.actorName
        || message.senderName;
      next.pollActivity = message.pollActivity
        ? { ...message.pollActivity, actorId: activityActorId, actorName: activityActorName }
        : message.pollActivity;
      next.pollActivityActorId = activityActorId;
      next.pollActivityActorName = activityActorName;
    }
    return next;
  });
  const friendEvents = (safeConversation.friendEvents || []).map(message => {
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
    ...safeConversation,
    avatarUrl: safeConversation.isGroup
      ? safeConversation.avatarUrl
      : (peer?.avatar || safeConversation.avatarUrl || ''),
    name: safeConversation.isGroup
      ? safeConversation.name
      : (usableProfileName(safeConversation.name) || peer?.name || 'Cuộc trò chuyện'),
    members,
    messages,
    friendEvents,
    admin: members.find(member => member.mode?.includes?.('O'))?.name || safeConversation.admin || '',
  };
}

function emitConversation(topic, tinode = topic?._tinode || getClient()) {
  if (!topic || tinode !== client || !allowedConversationTopics.has(topic.name)) return;
  cacheTopicProfiles(topic);
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

function emitCallInvite(topic, data, tinode) {
  if (!topic || !data || tinode !== client || !allowedConversationTopics.has(topic.name)) return;
  const latest = topic.latestMsgVersion?.(data.seq) || data;
  const invite = extractCallInvite(
    { ...data, topic: data.topic || topic.name },
    tinode.getCurrentUserID(),
    latest,
  );
  if (!invite) return;
  const key = `${invite.topic}:${invite.seq}`;
  if (callInviteKeys.has(key)) return;
  callInviteKeys.add(key);
  listeners.forEach(listener => listener({ type: 'call-invite', ...invite }));
}

function presenceSnapshot(tinode = getClient()) {
  const snapshot = {};
  const me = tinode?.getMeTopic?.();
  me?.contacts?.(contact => {
    if (contact?.name && contact.isP2PType?.()) snapshot[contact.name] = contact.online === true;
  });
  return snapshot;
}

// The fnd topic is shared by search and UID resolution. Serialize those
// requests because each query replaces the topic's result set.
function enqueueFndDiscovery(tinode, factory) {
  const run = async () => {
    if (tinode !== client) return null;
    const fnd = tinode.getFndTopic();
    if (!fnd.isSubscribed?.()) await fnd.subscribe();
    if (tinode !== client) return null;
    return factory(fnd, tinode);
  };
  const request = fndDiscoveryRequest.then(run, run);
  fndDiscoveryRequest = request.catch(() => {});
  return request;
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
  topic.onData = data => {
    emitCallInvite(topic, data, topicClient);
    emitConversation(topic, topicClient);
  };
  topic.onMetaDesc = () => emitConversation(topic, topicClient);
  topic.onMetaSub = () => emitConversation(topic, topicClient);
  topic.onSubsUpdated = () => emitConversation(topic, topicClient);
  topic.onAuxUpdated = () => emitConversation(topic, topicClient);
  topic.onPres = presence => {
    if (presence?.src && (presence.what === 'on' || presence.what === 'off')) {
      emitPresence(presence.src, presence.what === 'on');
    }
    emitConversation(topic, topicClient);
  };
  topic.onInfo = info => {
    if (topicClient !== client || !info?.what) return;
    if (info.what === 'call') {
      listeners.forEach(listener => listener({
        type: 'call-signal',
        topic: topic.name,
        seq: Number(info.seq) || 0,
        event: info.event,
        payload: info.payload,
        from: info.from,
      }));
      return;
    }
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
    if (['read', 'recv'].includes(info.what)) {
      rememberTopicReceipt(topic.name, info.what, info.seq);
      listeners.forEach(listener => listener({
        type: 'receipt',
        topic: topic.name,
        what: info.what,
        from: info.from,
        seq: Number(info.seq) || 0,
      }));
      emitConversation(topic, topicClient);
    }
  };
  return topic;
}

function modeWithInvitePermissions(mode = '') {
  return modeWithRealtimePresence(mode);
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
      let presenceChanged = false;

      // Keep discovery private and grant invite permissions only to explicit
      // members. Public JRWPAS defaults let any authenticated user self-join.
      if (initialMode.includes('O')) {
        await ensurePrivateGroupDefaults(topic);
        const updates = [];
        topic.subscribers?.(sub => {
          if (!sub?.user || sub.user === getClient().getCurrentUserID()) return;
          const memberMode = sub.acs?.getMode?.() || sub.mode || '';
          if (!memberMode.includes('A') || !memberMode.includes('S') || !memberMode.includes('P')) {
            presenceChanged = true;
            updates.push(topic.invite(sub.user, modeWithInvitePermissions(memberMode || GROUP_MEMBER_MODE)));
          }
        });
        await Promise.all(updates);
      }

      // Access is the intersection of what the owner grants and what the member
      // requests. Legacy members may still omit presence even after the owner
      // grants invite rights, so update their complete wanted mode at once.
      access = topic.getAccessMode?.() || topic.acs;
      let effectiveMode = access?.getMode?.() || '';
      if (!effectiveMode.includes('A') || !effectiveMode.includes('S') || !effectiveMode.includes('P')) {
        const wantedMode = access?.getWant?.() || effectiveMode || GROUP_MEMBER_MODE;
        presenceChanged = true;
        await topic.updateMode(null, modeWithInvitePermissions(wantedMode));
        access = topic.getAccessMode?.() || topic.acs;
        effectiveMode = access?.getMode?.() || '';
      }
      if (presenceChanged) {
        await topic.getMeta(topic.startMetaQuery().withSub().build());
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
        if (topic.isP2PType?.()) queryBuilder.withAux();
        if (historyLimit > 0) {
          if (newerOnly) {
            queryBuilder.withLaterData(historyLimit).withLaterDel(historyLimit);
          } else {
            queryBuilder.withEarlierData(historyLimit).withDel(undefined, historyLimit);
          }
        }
        const query = queryBuilder.build();
        await topic.subscribe(query);
        if (topic.isP2PType?.()) conversationBackgroundAuxTopics.add(topicName);
        if (!newerOnly && historyLimit >= 1000) fullHistoryTopics.add(topicName);
      })().finally(() => topicSubscriptionRequests.delete(topicName));
      topicSubscriptionRequests.set(topicName, request);
    }
    await topicSubscriptionRequests.get(topicName);
  }

  if (topic.isP2PType?.() && !conversationBackgroundAuxTopics.has(topicName)) {
    if (!conversationBackgroundAuxRequests.has(topicName)) {
      const request = topic
        .getMeta(topic.startMetaQuery().withAux().build())
        .then(() => {
          conversationBackgroundAuxTopics.add(topicName);
        })
        .finally(() => conversationBackgroundAuxRequests.delete(topicName));
      conversationBackgroundAuxRequests.set(topicName, request);
    }
    await conversationBackgroundAuxRequests.get(topicName);
  }

  // Existing owners migrate legacy public groups once per session. A failed
  // hardening request must not make an otherwise valid conversation unusable.
  await ensurePrivateGroupDefaults(topic).catch(() => false);
  await ensureGroupInvitePermissions(topic).catch(() => false);
  acknowledgeTopicReceived(topic);

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
  mediaObjectUrlVersions.clear();
  userProfileCache.clear();
  userProfileRequests.clear();
  userProfilesLoaded.clear();
  topicSubscriptionRequests.clear();
  conversationBackgroundAuxRequests.clear();
  conversationBackgroundAuxTopics.clear();
  fullHistoryRequests.clear();
  fullHistoryTopics.clear();
  groupPermissionMigrationRequests.clear();
  groupPrivacyMigrationRequests.clear();
  privateGroupTopics.clear();
  callInviteKeys.clear();
  conversationEmitTimers.forEach(timer => clearTimeout(timer));
  conversationEmitTimers.clear();
  topicReceiptCursors.clear();
  conversationListRequest = null;
  contactsEventQueued = false;
  allowedConversationTopics = new Set();
  fndDiscoveryRequest = Promise.resolve();
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
  const previousInfo = meTopic.onInfo;
  meTopic.onInfo = info => {
    previousInfo?.(info);
    if (info?.what !== 'call' || !info.src) return;
    listeners.forEach(listener => listener({
      type: 'call-signal',
      topic: info.src,
      seq: Number(info.seq) || 0,
      event: info.event,
      payload: info.payload,
      from: info.from,
      viaMe: true,
    }));
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

  getCallIceServers() {
    const raw = client?.getServerParam?.('iceServers', []);
    const servers = normalizeIceServers(raw);
    if (Array.isArray(raw) && raw.length > 0 && servers.length === 0) {
      console.warn('[ViChat] Tinode returned no valid ICE servers.', { advertised: raw.length });
    }
    return servers;
  },

  getMediaVersion(value) {
    const normalized = normalizeAvatar(value);
    return normalized ? (mediaObjectUrlVersions.get(normalized) || 0) : 0;
  },

  invalidateMediaUrl(value) {
    invalidateProtectedMedia(value);
  },

  getCallCapability(topicName, options = {}) {
    const serverInfo = client?.getServerInfo?.() || {};
    return callCapability({
      authenticated: this.authenticated,
      topicName,
      isGroup: Boolean(options.isGroup),
      isChatbot: Boolean(options.isChatbot),
      iceServers: this.getCallIceServers(),
      serverCallEnabled: serverInfo.webrtcEnabled,
    });
  },

  async startCall(topicName, audioOnly = false) {
    const capability = this.getCallCapability(topicName);
    if (!capability.available) throw new Error(capability.reason);
    const tinode = getClient();
    const topic = await subscribeTopic(topicName, { historyLimit: 0 });
    const Drafty = getDrafty();
    if (!Drafty?.videoCall) throw new Error('Tinode SDK khong ho tro goi WebRTC.');
    const draft = topic.createMessage(Drafty.videoCall(Boolean(audioOnly)), false);
    draft.head = {
      ...(draft.head || {}),
      webrtc: CALL_HEAD_STARTED,
      aonly: Boolean(audioOnly),
      'x-sender-id': tinode.getCurrentUserID(),
    };
    try {
      // Topic.publishMessage in Tinode SDK 0.25.3 swallows rejected PUB errors.
      // Use the client-level method so the server error reaches the UI.
      const published = await publishCallInvite({
        draft,
        publish: message => tinode.publishMessage(message),
      });
      return { seq: published.seq, topic: topicName, audioOnly: Boolean(audioOnly) };
    } catch (error) {
      console.warn('[ViChat] Tinode rejected the call invite.', {
        topic: topicName,
        audioOnly: Boolean(audioOnly),
        code: Number(error?.code || error?.status || 0) || undefined,
        errorName: error?.name || 'Error',
      });
      throw error;
    }
  },

  async sendCallSignal(topicName, seq, event, payload) {
    if (!Object.values(CALL_SIGNAL_EVENTS).includes(event)) {
      throw new Error('Tín hiệu cuộc gọi không hợp lệ.');
    }
    const callSeq = Number(seq);
    if (!callSeq) throw new Error('Cuộc gọi chưa có mã tin nhắn.');
    const topic = await subscribeTopic(topicName, { historyLimit: 0 });
    if (typeof topic.videoCall !== 'function') {
      throw new Error('Tinode SDK không hỗ trợ tín hiệu cuộc gọi.');
    }
    const result = topic.videoCall(event, callSeq, payload);
    if (result && typeof result.then === 'function') await result;
  },

  async ensureSession(auth = {}) {
    const expectedUid = String(auth.uid || '');
    if (this.authenticated) {
      if (!expectedUid || String(currentSession?.uid || '') === expectedUid) {
        return emitSessionReady(currentSession);
      }
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
    return emitSessionReady(session);
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

  async resolveMediaUrl(value) {
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
    const profile = cacheUserProfile(
      tinode.getCurrentUserID(),
      { ...currentPublic, fn: resolvedName, photo },
      { refreshAvatar: Boolean(avatarFile || avatarUrl) },
    );
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
    const response = await enqueueFndDiscovery(tinode, async fnd => {
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
    });
    return response === null ? [] : response;
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
    const resolved = await enqueueFndDiscovery(tinode, async (fnd, activeTinode) => {
      for (const query of queries) {
        await fnd.setMeta({ desc: { public: query } });
        await fnd.getMeta(fnd.startMetaQuery().withSub(undefined, 10).build());
        let found = '';
        fnd.contacts(sub => {
          if (!found) found = sub?.user || sub?.topic || '';
        });
        if (found && found !== activeTinode.getCurrentUserID()) return found;
      }
      return '';
    });
    if (resolved) return resolved;
    throw new Error('Management account has no matching Tinode user.');
  },

  async openConversation(topicName) {
    const topic = await subscribeTopic(topicName, { historyLimit: OPEN_HISTORY_LIMIT });
    return enrichConversationProfiles(toConversation(topic, getClient()), getClient());
  },

  async loadConversationMessages(topicName, sequences = []) {
    const normalizedSequences = [...new Set((sequences || [])
      .map(sequence => Number(sequence))
      .filter(sequence => Number.isFinite(sequence) && sequence > 0))];
    if (!topicName || normalizedSequences.length === 0) return null;
    const topic = await subscribeTopic(topicName, { historyLimit: 0 });
    await topic.getMeta(topic.startMetaQuery().withDataList(normalizedSequences).build());
    emitConversation(topic);
    return enrichConversationProfiles(toConversation(topic, getClient()), getClient());
  },

  async getConversationAvatar(topicName) {
    const topic = await subscribeTopic(topicName, { historyLimit: 0 });
    return avatarFromTopic(topic);
  },

  async updateGroupAvatar(topicName, avatarFile) {
    if (!topicName || !avatarFile) throw new Error('Vui lòng chọn ảnh nhóm.');
    const tinode = getClient();
    const topic = await subscribeTopic(topicName, { historyLimit: 0 });
    const avatarUrl = await uploadFile(tinode, avatarFile, topicName);
    await topic.setMeta({
      desc: {
        public: {
          ...(topic.public || {}),
          photo: {
            ref: avatarUrl,
            mime: avatarFile.type || 'image/jpeg',
            size: avatarFile.size || 0,
          },
        },
      },
    });
    emitConversation(topic);
    return avatarUrl;
  },

  async updateGroupName(topicName, name) {
    const nextName = String(name || '').trim();
    if (!topicName || !nextName) throw new Error('Tên nhóm không được để trống.');
    const topic = await subscribeTopic(topicName, { historyLimit: 0 });
    await topic.setMeta({
      desc: {
        public: {
          ...(topic.public || {}),
          fn: nextName,
        },
      },
    });
    emitConversation(topic);
    return nextName;
  },

  async updateGroupMetadata(topicName, { name, avatar, settings } = {}) {
    if (!topicName) throw new Error('Nhóm chưa có topic Tinode.');
    const topic = await subscribeTopic(topicName, { historyLimit: 0 });
    const publicMetadata = { ...(topic.public || {}) };
    if (name !== undefined) {
      const nextName = String(name || '').trim();
      if (!nextName) throw new Error('Tên nhóm không được để trống.');
      publicMetadata.fn = nextName;
    }
    if (avatar !== undefined) {
      const nextAvatar = String(avatar || '').trim();
      const avatarReference = tinodeMediaPath(nextAvatar) || nextAvatar;
      if (avatarReference) publicMetadata.photo = { ref: avatarReference };
      else delete publicMetadata.photo;
    }
    if (settings !== undefined) {
      publicMetadata.vichat = {
        ...(publicMetadata.vichat && typeof publicMetadata.vichat === 'object' ? publicMetadata.vichat : {}),
        groupSettings: normalizeGroupSettings(settings),
      };
    }
    await topic.setMeta({ desc: { public: publicMetadata } });
    emitConversation(topic);
    return toConversation(topic, getClient());
  },

  async restoreConversation(topicName) {
    const topic = await subscribeTopic(topicName, { historyLimit: OPEN_HISTORY_LIMIT });
    return enrichConversationProfiles(toConversation(topic, getClient()), getClient());
  },

  async clearConversationDeletion(topicName) {
    const topic = await subscribeTopic(topicName, { historyLimit: 0 });
    if (!topic.private?.vichatDeletedAt) return;
    await topic.setMeta({ desc: { private: { vichatDeletedAt: TINODE_DELETE_CHAR } } });
    emitConversation(topic);
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
    if (new TextEncoder().encode(String(text || '')).length > CENTRAL_MESSAGE_TEXT_LIMIT) {
      throw new Error('Tin nhắn vượt quá giới hạn 120 KB của máy chủ Tinode.');
    }
    const topic = await subscribeTopic(topicName);
    const draft = topic.createMessage(text, false);
    const head = { ...(draft.head || {}) };
    if (clientId) head['x-client-id'] = clientId;
    head['x-sender-id'] = getClient().getCurrentUserID();
    if (metadata.replyTo) head['x-reply-to'] = JSON.stringify(metadata.replyTo);
    if (metadata.sharedFrom) head['x-shared-from'] = String(metadata.sharedFrom);
    if (Array.isArray(metadata.mentions) && metadata.mentions.length > 0) {
      head['x-mentions'] = JSON.stringify(metadata.mentions.slice(0, 50));
    }
    draft.head = head;
    return topic.publishMessage(draft);
  },

  async sendPoll(topicName, poll, clientId) {
    const topic = await subscribeTopic(topicName);
    if (!topic.isGroupType?.() && !String(topic.name || '').startsWith('grp')) {
      throw new Error('Bình chọn chỉ khả dụng trong nhóm.');
    }
    const actorId = getClient().getCurrentUserID();
    const normalized = normalizePoll({ ...poll, creatorId: actorId });
    if (!normalized) throw new Error('Bình chọn không hợp lệ.');
    const draft = topic.createMessage(normalized.question, false);
    draft.head = {
      ...(draft.head || {}),
      [POLL_HEAD]: JSON.stringify(normalized),
      ...(clientId ? { 'x-client-id': clientId } : {}),
      'x-sender-id': actorId,
    };
    return topic.publishMessage(draft);
  },

  async sendPollEvent(topicName, event, clientId) {
    const topic = await subscribeTopic(topicName);
    if (!topic.isGroupType?.() && !String(topic.name || '').startsWith('grp')) {
      throw new Error('Bình chọn chỉ khả dụng trong nhóm.');
    }
    const actorId = getClient().getCurrentUserID();
    const normalized = normalizePollEvent({
      ...event,
      actorId,
      createdAt: event?.createdAt || new Date().toISOString(),
    });
    if (!normalized?.pollId) throw new Error('Thiếu bình chọn cần cập nhật.');
    const draft = topic.createMessage(`${POLL_EVENT_PREFIX}${JSON.stringify(normalized)}`, false);
    draft.head = {
      ...(draft.head || {}),
      ...(clientId ? { 'x-client-id': clientId } : {}),
      'x-sender-id': actorId,
    };
    return topic.publishMessage(draft);
  },

  async sendReaction(topicName, targetId, emoji, active = true) {
    const topic = await subscribeTopic(topicName);
    const actorId = getClient().getCurrentUserID();
    const event = {
      targetId: String(targetId || ''),
      emoji: String(emoji || '').slice(0, 8),
      actorId,
      actorName: currentSession?.profile?.name || '',
      actorAvatar: currentSession?.profile?.avatar || '',
      active: Boolean(active),
    };
    if (!event.targetId || !event.emoji) throw new Error('Thiếu tin nhắn hoặc biểu cảm.');
    return topic.publish(`${REACTION_EVENT_PREFIX}${JSON.stringify(event)}`);
  },

  async recallMessage(topicName, message = {}, mode = 'all') {
    if (!canRecallDeliveredMessage(message)) {
      throw new Error('Chỉ có thể thu hồi sau khi tin nhắn hoặc tệp đã được gửi thành công.');
    }
    const tinode = getClient();
    if (message.sender !== 'outgoing' && !tinode.isMe(message.senderId)) {
      throw new Error('Chỉ người gửi mới có thể thu hồi tin nhắn này.');
    }
    const topic = await subscribeTopic(topicName);
    const actorId = tinode.getCurrentUserID();
    const event = buildRecallEvent(message, actorId, new Date().toISOString(), mode === 'self' ? 'self' : 'all');
    if (!event.targetId && !event.targetSeq) throw new Error('Tin nhắn không có định danh để thu hồi.');
    const draft = topic.createMessage(`${RECALL_EVENT_PREFIX}${JSON.stringify(event)}`, false);
    draft.head = {
      ...(draft.head || {}),
      'x-client-id': `web-recall-${event.targetSeq || event.targetId}-${Date.now()}`,
      'x-sender-id': actorId,
    };
    const result = await topic.publishMessage(draft);
    if (!result) throw new Error('Tinode khong xac nhan su kien thu hoi.');
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

  async updateConversationBackground(topicName, background = null) {
    if (!topicName) throw new Error('Cuộc trò chuyện chưa có topic Tinode.');
    const topic = await subscribeTopic(topicName, { historyLimit: OPEN_HISTORY_LIMIT });
    const normalized = background ? normalizeConversationBackground(background) : null;
    if (background && !normalized) throw new Error('Hình nền cuộc trò chuyện không hợp lệ.');
    const actorId = getClient().getCurrentUserID();
    const actorName = currentSession?.profile?.name || '';
    const event = {
      action: 'conversation_background_changed',
      scope: CONVERSATION_BACKGROUND_SCOPES.SHARED,
      actorId,
      actorName,
      backgroundId: normalized?.id || '',
      backgroundUrl: normalized?.url || '',
      backgroundLabel: normalized?.label || '',
      backgroundKind: normalized?.kind || '',
      updatedAt: new Date().toISOString(),
    };
    const sharedBackground = normalized
      ? {
        ...normalized,
        scope: CONVERSATION_BACKGROUND_SCOPES.SHARED,
        url: tinodeMediaPath(normalized.url) || normalized.url,
      }
      : null;
    const isGroupTopic = topic.isGroupType?.() || topic.name?.startsWith('grp');
    if (isGroupTopic) {
      const publicMetadata = { ...(topic.public || {}) };
      const publicVichat = {
        ...(publicMetadata.vichat && typeof publicMetadata.vichat === 'object' ? publicMetadata.vichat : {}),
      };
      if (sharedBackground) publicVichat.conversationBackground = sharedBackground;
      else delete publicVichat.conversationBackground;
      publicMetadata.vichat = publicVichat;
      const metadataResult = await topic.setMeta({ desc: { public: publicMetadata } });
      if (metadataResult?.code >= 300) {
        throw new Error(metadataResult.text || 'Tinode từ chối cập nhật hình nền nhóm.');
      }
    } else {
      // P2P public metadata is reserved for the user profile. Store the shared
      // presentation preference in aux so both subscribers can read it safely.
      const auxValue = sharedBackground ? JSON.stringify(sharedBackground) : TINODE_DELETE_CHAR;
      const metadataResult = await topic.setMeta({ aux: { [CONVERSATION_BACKGROUND_AUX_KEY]: auxValue } });
      if (metadataResult?.code >= 300) {
        throw new Error(metadataResult.text || 'Tinode từ chối cập nhật hình nền cuộc trò chuyện.');
      }
    }
    const draft = topic.createMessage(`${SYSTEM_EVENT_PREFIX}${JSON.stringify(event)}`, false);
    draft.head = {
      ...(draft.head || {}),
      'x-client-id': `web-background-${Date.now()}`,
      'x-sender-id': actorId,
    };
    const result = await topic.publishMessage(draft);
    if (!result || result.code >= 300) throw new Error(result?.text || 'Tinode không xác nhận thay đổi hình nền.');
    emitConversation(topic);
    return normalized ? { ...normalized, scope: CONVERSATION_BACKGROUND_SCOPES.SHARED } : normalized;
  },

  async updateDirectConversationBackground(topicName, background = null) {
    return this.updateConversationBackground(topicName, background);
  },

  async uploadConversationBackground(topicName, file) {
    if (!topicName || !file) throw new Error('Thiếu ảnh hình nền hoặc cuộc trò chuyện.');
    const topic = await subscribeTopic(topicName, { historyLimit: 0 });
    const uploadedUrl = await uploadFile(getClient(), file, topic.name);
    const normalizedUrl = normalizeAvatar(uploadedUrl);
    if (!normalizedUrl) throw new Error('Tinode không trả về URL ảnh hình nền hợp lệ.');
    return normalizedUrl;
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

  async sendFile(topicName, file, clientId, metadata = {}) {
    const tinode = getClient();
    const topic = await subscribeTopic(topicName);
    const url = await uploadFile(tinode, file);
    const Drafty = getDrafty();
    const isImage = /^image\//i.test(file.type || '') || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name || '');
    if (!Drafty || (isImage ? !Drafty.appendImage : !Drafty.attachFile)) {
      throw new Error('Không tải được bộ đóng gói file của Tinode.');
    }
    const attachment = {
      mime: file.type || 'application/octet-stream',
      filename: file.name || 'Tệp đính kèm',
      refurl: url,
      size: file.size || 0,
    };
    // Use Tinode's image entity so recipients render an image preview instead
    // of receiving a generic EX/file attachment.
    const content = isImage
      ? Drafty.appendImage(null, attachment)
      : Drafty.attachFile(null, attachment);
    const draft = topic.createMessage(content, false);
    draft.head = { ...(draft.head || {}), 'x-sender-id': tinode.getCurrentUserID() };
    if (clientId) draft.head['x-client-id'] = clientId;
    if (metadata.replyTo) draft.head['x-reply-to'] = JSON.stringify(metadata.replyTo);
    if (metadata.sharedFrom) draft.head['x-shared-from'] = String(metadata.sharedFrom);
    const imageBatch = normalizeImageBatch(metadata.imageBatch);
    if (imageBatch) draft.head[IMAGE_BATCH_HEAD] = JSON.stringify(imageBatch);
    if (metadata.sticker?.stickerId && metadata.sticker?.packId) {
      draft.head[STICKER_HEAD] = JSON.stringify({
        stickerId: String(metadata.sticker.stickerId).slice(0, 80),
        packId: String(metadata.sticker.packId).slice(0, 80),
        label: String(metadata.sticker.label || '').slice(0, 120),
        version: String(metadata.sticker.version || '1').slice(0, 24),
      });
    }
    if (Number(metadata.voiceDuration) > 0) draft.head['x-voice-duration'] = String(Math.round(metadata.voiceDuration));
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
      voiceDuration: Number(metadata.voiceDuration) > 0 ? Math.round(metadata.voiceDuration) : 0,
      sticker: metadata.sticker || undefined,
    };
  },

  async sendSticker(topicName, sticker, clientId, metadata = {}) {
    if (!sticker?.src || !sticker?.id || !sticker?.packId) {
      throw new Error('Sticker không hợp lệ.');
    }
    const response = await fetch(sticker.src);
    if (!response.ok) throw new Error('Không thể tải asset sticker.');
    const blob = await response.blob();
    const file = new File([blob], `${sticker.id}.png`, { type: blob.type || sticker.mime || 'image/png' });
    return this.sendFile(topicName, file, clientId, {
      ...metadata,
      sticker: {
        id: sticker.id,
        stickerId: sticker.id,
        packId: sticker.packId,
        label: sticker.label,
        version: sticker.version || '1',
      },
    });
  },

  async downloadFile(file) {
    if (!file?.url) throw new Error('File này chưa có đường dẫn tải xuống.');
    const response = await fetchProtectedMedia(file.url);
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

  async openFile(file) {
    if (!file?.url) throw new Error('File này chưa có đường dẫn mở.');
    const popup = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    try {
      const objectUrl = await resolveProtectedMedia(file.url);
      if (popup) {
        popup.location.href = objectUrl;
      } else if (typeof window !== 'undefined') {
        const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
        if (!opened) window.location.href = objectUrl;
      }
      return objectUrl;
    } catch (error) {
      popup?.close();
      throw error;
    }
  },

  async fetchFile(file) {
    if (!file?.url) throw new Error('File này chưa có đường dẫn tải xuống.');
    const response = await fetchProtectedMedia(file.url);
    if (!response.ok) throw new Error(`Không thể tải file (HTTP ${response.status}).`);
    const blob = await response.blob();
    return new File([blob], file.name || 'tep-chat', {
      type: blob.type || (file.mime !== 'image/*' ? file.mime : '') || 'application/octet-stream',
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
  const source = conversation && typeof conversation === 'object' ? conversation : {};
  const { topic: _topic, ...safeConversation } = source;
  return normalizeConversationShape(safeConversation);
}
