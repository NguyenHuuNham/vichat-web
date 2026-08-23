import { Platform } from 'react-native';
import { config } from '../constants/config';
import { ChatMessage, Conversation, FileAttachment, PickerFile, RecallMode, TinodeAuth } from '../types';
import { installIntlSegmenterPolyfill } from '../polyfills/intlSegmenter';
import {
  REACTION_EVENT_PREFIX,
  RECALL_EVENT_PREFIX,
  SYSTEM_EVENT_PREFIX,
  buildRecallEvent,
  canRecallMessage,
  recallAppliesToViewer,
} from '../utils/messagePolicy';
import { formatMessageTime } from '../utils/timeFormatting';
import { mapTinodeDeliveryStatus, ReceiptCursor } from '../utils/tinodeState';
import { normalizeMediaUrl } from '../utils/mediaUrl';
import { shouldRetryProtectedMedia } from '../utils/mediaRetryPolicy';
import { publishCallInvite } from '../utils/callSignaling';

export { normalizeMediaUrl } from '../utils/mediaUrl';

export const CALL_HEAD_STARTED = 'started';
export const CALL_SIGNAL_EVENTS = Object.freeze({
  RINGING: 'ringing',
  ACCEPT: 'accept',
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice-candidate',
  HANG_UP: 'hang-up',
});

function callEntity(content: any) {
  return content?.ent?.find?.((entity: any) => entity?.tp === 'VC')?.data || null;
}

export function parseCallMessage(content: any, head: any = {}, incoming = false) {
  const entity = callEntity(content);
  if (!entity && !head?.webrtc) return null;
  const duration = Number(entity?.duration ?? head?.['webrtc-duration'] ?? 0);
  return {
    audioOnly: Boolean(entity?.aonly ?? head?.aonly),
    state: String(entity?.state || head?.webrtc || CALL_HEAD_STARTED),
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    incoming: Boolean(entity?.incoming ?? incoming),
  };
}

function formatCallDuration(durationMs = 0) {
  const seconds = Math.max(0, Math.floor(Number(durationMs) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function callHistoryLabel(call: ReturnType<typeof parseCallMessage>, outgoing = false) {
  if (!call) return '';
  const direction = outgoing ? 'Cuộc gọi đi' : 'Cuộc gọi đến';
  if (call.state === 'busy') return `${direction} - Máy bận`;
  if (call.state === 'declined') return `${direction} - Đã từ chối`;
  if (call.state === 'missed') return outgoing ? 'Cuộc gọi đã hủy' : 'Cuộc gọi nhỡ';
  if (call.state === 'disconnected') return `${direction} - Mất kết nối`;
  if (call.duration > 0) return `${direction} - ${formatCallDuration(call.duration)}`;
  if (call.state === 'accepted') return `${direction} - Đang diễn ra`;
  return direction;
}

export type MobileCallSignalEvent = {
  type: 'call-signal';
  topic: string;
  seq: number;
  event: string;
  payload?: any;
  from?: string;
  viaMe?: boolean;
};

let TinodeConstructor: any = null;
let Drafty: any = null;

async function loadTinodeSdk() {
  if (TinodeConstructor && Drafty) return;

  // tinode-sdk constructs Intl.Segmenter during module evaluation. Hermes on
  // older Android versions needs the fallback installed before importing it.
  installIntlSegmenterPolyfill();
  const module = await import('tinode-sdk');
  const sdk = (module as any).default || module;
  TinodeConstructor = sdk.Tinode;
  Drafty = sdk.Drafty;
  if (typeof TinodeConstructor !== 'function') {
    throw new Error('Tinode SDK khong san sang tren thiet bi nay.');
  }
}

type Listener = (event: TinodeEvent) => void;
export type TinodeEvent =
  | { type: 'connection'; state: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'; error?: unknown }
  | { type: 'conversation'; conversation: Conversation }
  | { type: 'profile'; uid: string; name?: string; avatar?: string }
  | { type: 'incoming-message'; conversation: Conversation; message: ChatMessage }
  | { type: 'typing'; topic: string; uid: string; active: boolean }
  | { type: 'presence'; uid: string; online: boolean }
  | { type: 'media-invalidated'; url: string }
  | { type: 'call-invite'; topic: string; seq: number; from: string; audioOnly: boolean }
  | MobileCallSignalEvent;

const imageCacheRequests = new Map<string, Promise<string>>();
const imageCacheVersions = new Map<string, number>();

function tinodeHeaders(token = '') {
  return {
    'X-Tinode-APIKey': config.tinodeApiKey,
    ...(token ? { 'X-Tinode-Auth': `Token ${token}` } : {}),
  };
}

function tokenExpiry(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value < 10_000_000_000 ? value * 1000 : value);
  const parsed = new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? new Date(Date.now() + 60_000) : parsed;
}

function messageContent(raw: any) {
  if (typeof raw?.content === 'string') return raw.content;
  return String(raw?.content?.txt || '');
}

function normalizeMediaValue(value: any, mime = 'image/jpeg') {
  if (!value) return '';
  if (typeof value === 'string') {
    if (/^(?:data:|blob:|file:|content:|https?:)/i.test(value)) return normalizeMediaUrl(value);
    return /^[-A-Za-z0-9+/=]+$/.test(value) ? `data:${mime};base64,${value}` : normalizeMediaUrl(value);
  }
  if (typeof value.ref === 'string') return normalizeMediaValue(value.ref, value.mime || mime);
  if (typeof value.url === 'string') return normalizeMediaValue(value.url, value.mime || mime);
  if (typeof value.val === 'string') return `data:${value.mime || mime};base64,${value.val}`;
  return '';
}

function rawAttachment(raw: any) {
  const content = raw?.content;
  let entity = content?.ent?.find?.((item: any) => item?.tp === 'EX' || item?.tp === 'IM');
  if (!entity && Drafty?.entities && content) {
    Drafty.entities(content, (data: any, _index: number, type: string) => {
      if (type !== 'EX' && type !== 'IM') return false;
      entity = { tp: type, data };
      return true;
    });
  }
  if (!entity) return null;
  const data = entity.data || {};
  const name = String(data.name || 'Tệp đính kèm');
  const mime = String(data.mime || 'application/octet-stream');
  const url = normalizeMediaValue(data.ref || data.url || (Drafty?.getDownloadUrl?.(data) || ''), mime)
    || (data.val ? `data:${mime};base64,${data.val}` : '');
  return {
    isImage: entity.tp === 'IM' || /^image\//i.test(mime) || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(name),
    file: {
      name,
      mime,
      size: Number(data.size || 0),
      url,
      ext: mime.includes('pdf') || /\.pdf$/i.test(name) ? 'pdf' : 'file',
    } as FileAttachment,
  };
}

function parseEvent(content: string, prefix: string) {
  if (!content.startsWith(prefix)) return null;
  try { return JSON.parse(content.slice(prefix.length)); } catch { return null; }
}

function formatSystemEvent(event: any, client: any) {
  if (event?.action === 'member_left') {
    const actor = event.actorId && client.isMe?.(event.actorId)
      ? 'Bạn'
      : String(event.actorName || event.actorId || 'Một thành viên');
    const leaveText = actor === 'Bạn' ? 'Bạn đã rời khỏi nhóm' : `${actor} đã rời khỏi nhóm`;
    const replacement = String(event.replacementName || '').trim();
    return replacement ? `${leaveText}. ${replacement} đã trở thành trưởng nhóm mới` : leaveText;
  }
  return String(event?.text || event?.action || 'Hoạt động hệ thống');
}

async function publishControlEvent(topic: any, content: string, clientId: string, senderId: string) {
  const draft = topic.createMessage(content, false);
  draft.head = {
    ...(draft.head || {}),
    'x-client-id': clientId,
    'x-sender-id': senderId,
  };
  const result = await topic.publishMessage(draft);
  if (!result) throw new Error('Tinode khong xac nhan su kien realtime.');
  return result;
}

function messageReply(raw: any) {
  const value = raw?.head?.['x-reply-to'];
  if (!value) return undefined;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed?.id) return undefined;
    return {
      id: String(parsed.id),
      text: String(parsed.text || 'Tin nhắn'),
      senderName: String(parsed.senderName || 'Thành viên'),
    };
  } catch {
    return undefined;
  }
}

function chatbotMetadata(raw: any) {
  let sources: ChatMessage['sources'] = [];
  const encodedSources = raw?.head?.['x-vichat-chatbot-sources'];
  if (encodedSources) {
    try {
      const parsed = typeof encodedSources === 'string' ? JSON.parse(encodedSources) : encodedSources;
      sources = Array.isArray(parsed) ? parsed : [];
    } catch {
      sources = [];
    }
  }
  return {
    sources,
    grounded: raw?.head?.['x-vichat-chatbot-grounded'] === '1',
  };
}

function normalizeMessage(raw: any, client: any, topic: any, receiptCursor?: ReceiptCursor): ChatMessage | null {
  if (!raw || raw._deleted) return null;
  const senderId = String(raw.from || raw.head?.['x-sender-id'] || '');
  const outgoing = Boolean(senderId && client.isMe?.(senderId));
  const content = messageContent(raw);
  const call = parseCallMessage(raw.content, raw.head, !outgoing);
  const reaction = parseEvent(content, REACTION_EVENT_PREFIX);
  const recall = parseEvent(content, RECALL_EVENT_PREFIX);
  const system = parseEvent(content, SYSTEM_EVENT_PREFIX);
  const attachment = rawAttachment(raw);
  const id = String(raw.head?.['x-client-id'] || `${senderId || 'system'}-${raw.seq || raw.ts || Date.now()}`);
  const chatbot = chatbotMetadata(raw);
  if (reaction) return {
    id, seq: raw.seq, type: 'reaction', sender: outgoing ? 'outgoing' : 'incoming', senderId,
    senderName: '', text: '', createdAt: raw.ts, reaction: undefined,
    raw: { ...raw, reactionEvent: reaction },
  } as any;
  if (recall) return {
    id, seq: raw.seq, type: 'recall', sender: outgoing ? 'outgoing' : 'incoming', senderId,
    senderName: '', text: '', createdAt: raw.ts, raw: { ...raw, recallEvent: recall },
  };
  const type = call ? 'call' : system ? 'system' : attachment ? (attachment.isImage ? 'image' : 'file') : 'text';
  return {
    id,
    seq: Number(raw.seq) || undefined,
    type,
    sender: outgoing ? 'outgoing' : 'incoming',
    senderId: senderId || (outgoing ? client.getCurrentUserID?.() : ''),
    senderName: outgoing ? 'Bạn' : 'Thành viên',
    text: call ? callHistoryLabel(call, outgoing) : system ? formatSystemEvent(system, client) : content,
    image: attachment?.isImage ? attachment.file.url : undefined,
    file: attachment?.file,
    createdAt: raw.ts ? new Date(raw.ts).toISOString() : undefined,
    time: formatMessageTime(raw.ts),
    deliveryStatus: mapTinodeDeliveryStatus(topic?.msgStatus?.(raw, false) ?? raw._status, outgoing, raw.seq, receiptCursor),
    replyTo: messageReply(raw),
    ...chatbot,
    call: call || undefined,
    raw,
  };
}

function materializeConversation(topic: any, client: any, presenceResolver: (uid: string, fallback: boolean) => boolean, receiptCursor?: ReceiptCursor): Conversation {
  const isGroup = Boolean(topic.isGroupType?.() || String(topic.name || '').startsWith('grp'));
  const loaded: ChatMessage[] = [];
  topic.messages?.((raw: any) => {
    const message = normalizeMessage(raw, client, topic, receiptCursor);
    if (message) loaded.push(message);
  });
  const reactionState = new Map<string, Record<string, boolean>>();
  const recalls = new Map<string, any>();
  loaded.filter(message => message.type === 'reaction').forEach(message => {
    const event = message.raw?.reactionEvent;
    if (!event?.targetId || !event?.emoji) return;
    const state = reactionState.get(String(event.targetId)) || {};
    state[`${event.actorId || message.senderId}:${event.emoji}`] = event.active !== false;
    reactionState.set(String(event.targetId), state);
  });
  const visibleRecallMessages = loaded.filter(message => message.type === 'recall').filter(message => {
    const event = message.raw?.recallEvent;
    return recallAppliesToViewer(event, client);
  });
  visibleRecallMessages.forEach(message => {
    const event = message.raw?.recallEvent;
    if (event?.targetId) recalls.set(String(event.targetId), event);
    if (event?.targetSeq) recalls.set(`seq:${event.targetSeq}`, event);
  });
  const appliedRecallIds = new Set<string>();
  const messages = loaded
    .filter(message => !['reaction', 'recall'].includes(message.type))
    .map(message => {
      const recall = recalls.get(String(message.id)) || recalls.get(`seq:${message.seq}`);
      const reactions: Record<string, number> = {};
      Object.entries(reactionState.get(String(message.id)) || {}).forEach(([key, active]) => {
        if (active) {
          const emoji = key.slice(key.indexOf(':') + 1);
          reactions[emoji] = (reactions[emoji] || 0) + 1;
        }
      });
      if (recall) {
        const recallMessage = loaded.find(item => item.type === 'recall' && item.raw?.recallEvent === recall);
        if (recallMessage) appliedRecallIds.add(recallMessage.id);
        if (recall.mode === 'self' && client.isMe?.(recall.actorId)) return null;
        return {
          ...message,
          type: 'text' as const,
          text: 'Tin nhắn đã được thu hồi',
          recalled: true,
          file: undefined,
          image: undefined,
          replyTo: undefined,
          reactions: {},
          raw: undefined,
        };
      }
      return message.replyTo && (recalls.has(String(message.replyTo.id)) || recalls.has(`seq:${message.replyTo.id}`))
        ? { ...message, replyTo: undefined, reactions }
        : { ...message, reactions };
    })
    .filter(Boolean) as ChatMessage[];
  visibleRecallMessages.forEach(message => {
    if (appliedRecallIds.has(message.id)) return;
    const event = message.raw?.recallEvent || {};
    // A self recall is visible only to its author. If the original packet was
    // hard-deleted, do not recreate a placeholder for that same author.
    if (event.mode === 'self' && client.isMe?.(event.actorId || event.originalSenderId)) return;
    const targetSeq = Number(event.targetSeq) || undefined;
    const senderId = String(event.actorId || event.originalSenderId || message.senderId || '');
    const outgoing = Boolean(senderId && client.isMe?.(senderId));
    const createdAt = event.originalCreatedAt || message.createdAt;
    messages.push({
      id: String(event.targetId || `recalled-${targetSeq || message.seq || message.id}`),
      seq: targetSeq,
      type: 'text',
      sender: outgoing ? 'outgoing' : 'incoming',
      senderId,
      senderName: outgoing ? 'Bạn' : 'Thành viên',
      text: 'Tin nhắn đã được thu hồi',
      createdAt,
      time: formatMessageTime(createdAt),
      recalled: true,
      reactions: {},
      deliveryStatus: message.deliveryStatus,
      raw: undefined,
    });
  });
  const members: any[] = [];
  topic.subscribers?.((sub: any) => {
    if (sub?.user) members.push({
      id: sub.user,
      uid: sub.user,
      username: sub.user,
      name: sub.public?.fn || sub.public?.name || 'Thành viên',
      avatar: normalizeMediaValue(sub.public?.photo || sub.public?.avatar || ''),
      active: true,
      tenantId: config.tenantId,
      online: presenceResolver(sub.user, sub.online === true),
      mode: sub.acs?.getMode?.() || sub.mode || '',
    });
  });
  if (!isGroup && topic.name) {
    const peer = members.find(item => item.id !== client.getCurrentUserID?.());
    if (!peer) members.push({ id: topic.name, uid: topic.name, username: topic.name, name: topic.public?.fn || topic.name, active: true, tenantId: config.tenantId, online: presenceResolver(topic.name, topic.online === true) });
  }
  messages.sort((a, b) => (Number(a.seq || 0) - Number(b.seq || 0)) || ((Date.parse(a.createdAt || '') || 0) - (Date.parse(b.createdAt || '') || 0)));
  const latest = messages[messages.length - 1];
  const directPeer = members.find(item => item.id !== client.getCurrentUserID?.()) || members[0];
  const owner = members.find(member => String(member.mode || '').includes('O'));
  return {
    id: topic.name,
    managementId: topic.name,
    tinodeTopic: topic.name,
    name: String(topic.public?.fn || topic.public?.name || directPeer?.name || topic.name || 'Cuộc trò chuyện'),
    isGroup,
    adminId: owner?.id || '',
    avatarUrl: normalizeMediaValue(topic.public?.photo || topic.public?.avatar || directPeer?.avatar || ''),
    description: String(topic.public?.note || ''),
    membersCount: isGroup ? `${members.length} thành viên` : (directPeer?.online ? 'Đang hoạt động' : 'Offline'),
    members,
    participantIds: members.map(member => member.id),
    messages,
    lastMsg: latest?.file ? `${latest.sender === 'outgoing' ? 'Bạn' : 'Thành viên'} đã gửi tệp` : latest?.text || '',
    time: latest?.time || '',
    updatedAt: latest?.createdAt,
    badge: Math.max(0, Number(topic.unread || 0)),
  };
}

export class TinodeMobileClient {
  private client: any = null;
  private meTopic: any = null;
  private listeners = new Set<Listener>();
  private intentionalDisconnect = false;
  private auth: TinodeAuth | null = null;
  private tokenProvider: (() => Promise<TinodeAuth>) | null = null;
  private topics = new Map<string, any>();
  private presenceByUid = new Map<string, boolean>();
  private receiptCursors = new Map<string, ReceiptCursor>();
  private notifiedSeqByTopic = new Map<string, number>();
  private deviceToken: string | null = null;
  private blockedTopics = new Set<string>();
  private callInviteKeys = new Set<string>();

  onEvent(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setTokenProvider(provider: (() => Promise<TinodeAuth>) | null) {
    this.tokenProvider = provider;
  }

  private emit(event: TinodeEvent) {
    this.listeners.forEach(listener => listener(event));
  }

  private invalidateImageCache(value: string) {
    const url = normalizeMediaUrl(value);
    if (!url) return;
    imageCacheVersions.set(url, (imageCacheVersions.get(url) || 0) + 1);
    [...imageCacheRequests.keys()]
      .filter(key => key.startsWith(`${url}|`))
      .forEach(key => imageCacheRequests.delete(key));
    this.emit({ type: 'media-invalidated', url });
  }

  getMediaVersion(value: string) {
    const url = normalizeMediaUrl(value);
    return url ? (imageCacheVersions.get(url) || 0) : 0;
  }

  allowConversationTopic(topicName: string) {
    if (topicName) this.blockedTopics.delete(String(topicName));
  }

  disallowConversationTopic(topicName: string) {
    const name = String(topicName || '');
    if (!name) return;
    this.blockedTopics.add(name);
    const topic = this.topics.get(name);
    if (topic?.leave) Promise.resolve(topic.leave(true)).catch(() => {});
    this.topics.delete(name);
  }

  private materialize(topic: any) {
    return materializeConversation(topic, this.client, (uid, fallback) => this.getPresenceStatus(uid, fallback), this.receiptCursors.get(topic?.name));
  }

  private emitIncomingMessage(topic: any, raw: any, conversation?: Conversation) {
    const message = normalizeMessage(raw, this.client, topic);
    if (!message || message.sender !== 'incoming' || ['reaction', 'recall', 'system'].includes(message.type)) return;
    const seq = Number(message.seq || 0);
    const notifiedSeq = this.notifiedSeqByTopic.get(topic.name) || 0;
    if (seq > 0 && seq <= notifiedSeq) return;
    if (seq > 0) this.notifiedSeqByTopic.set(topic.name, seq);
    this.emit({ type: 'incoming-message', conversation: conversation || this.materialize(topic), message });
  }

  getPresenceStatus(uid: string, fallback = false) {
    const key = String(uid || '');
    return key && this.presenceByUid.has(key) ? Boolean(this.presenceByUid.get(key)) : fallback;
  }

  private updatePresence(presence: any) {
    const uid = String(presence?.src || '');
    if (!uid || !['on', 'off'].includes(presence?.what)) return;
    const online = presence.what === 'on';
    this.presenceByUid.set(uid, online);
    this.emit({ type: 'presence', uid, online });
  }

  private emitContactProfile(contact: any) {
    const uid = String(contact?.name || contact?.user || '');
    if (!uid) return;
    const publicData = contact?.public || {};
    const name = String(publicData.fn || publicData.name || contact?.fn || '').trim();
    const avatar = normalizeMediaUrl(
      publicData.photo?.ref
      || publicData.photo?.url
      || publicData.avatar
      || contact?.avatar
      || '',
    );
    if (name || avatar) this.emit({ type: 'profile', uid, name, avatar });
  }

  private updateContactPresence(contact: any, eventType = '') {
    const uid = String(contact?.name || contact?.user || '');
    if (!uid || !contact?.isP2PType?.()) return;
    if (eventType && !['on', 'off', 'gone', 'term'].includes(eventType)) return;
    const online = eventType === 'on' ? true : eventType === 'off' || eventType === 'gone' || eventType === 'term'
      ? false
      : typeof contact.online === 'boolean' ? contact.online : this.getPresenceStatus(uid, false);
    this.updatePresence({ src: uid, what: online ? 'on' : 'off' });
  }

  private syncPresenceSnapshot(emitAll = false) {
    this.meTopic?.contacts?.((contact: any) => {
      const uid = String(contact?.name || '');
      if (!uid || !contact?.isP2PType?.()) return;
      if (typeof contact.online !== 'boolean' && this.presenceByUid.has(uid)) return;
      const online = contact.online === true;
      const changed = this.presenceByUid.get(uid) !== online;
      this.presenceByUid.set(uid, online);
      if (emitAll || changed) this.emit({ type: 'presence', uid, online });
    });
  }

  private updateReceiptCursor(topic: any, what: string, seq: number) {
    const sequence = Number(seq) || 0;
    if (!topic?.name || sequence <= 0 || !['recv', 'read'].includes(what)) return;
    const previous = this.receiptCursors.get(topic.name) || {};
    const next: ReceiptCursor = {
      receivedSeq: Math.max(Number(previous.receivedSeq) || 0, what === 'recv' ? sequence : Number(previous.receivedSeq) || 0, what === 'read' ? sequence : 0),
      readSeq: Math.max(Number(previous.readSeq) || 0, what === 'read' ? sequence : 0),
    };
    this.receiptCursors.set(topic.name, next);
  }

  private acknowledgeTopicReceived(topic: any, seq?: number) {
    const sequence = Number(seq || topic?.maxMsgSeq?.() || 0);
    if (sequence > 0) topic?.noteRecv?.(sequence);
  }

  get connected() {
    return Boolean(this.client?.isConnected?.() && this.client?.isAuthenticated?.());
  }

  get currentUserId() {
    return String(this.client?.getCurrentUserID?.() || this.auth?.uid || '');
  }

  getMediaHeaders() {
    return tinodeHeaders(this.client?.getAuthToken?.()?.token || '');
  }

  private async refreshMediaAuth() {
    if (!this.tokenProvider) return false;
    const refreshed = await this.tokenProvider();
    const token = String(refreshed?.token || '').trim();
    if (!token) return false;
    const expires = tokenExpiry(refreshed?.expires);
    this.client?.setAuthToken?.({ token, expires });
    this.auth = { ...(this.auth || refreshed), ...refreshed, token };
    return true;
  }

  setDeviceToken(token: string | null) {
    this.deviceToken = token || null;
    return Boolean(this.client?.setDeviceToken?.(this.deviceToken));
  }

  async cacheImage(value: string) {
    const url = normalizeMediaUrl(value);
    if (!url || /^(?:data:|file:|content:)/i.test(url)) return url;
    // Tinode can reuse the same protected path after an avatar replacement.
    // Include the current auth token in the cache key so native images do not
    // remain stuck on the previous avatar.
    const token = this.client?.getAuthToken?.()?.token || '';
    const cacheKey = `${url}|${token}|${imageCacheVersions.get(url) || 0}`;
    if (!imageCacheRequests.has(cacheKey)) {
      const request = (async () => {
        const fileSystem: any = require('expo-file-system');
        if (!fileSystem.File?.downloadFileAsync || !fileSystem.Paths?.cache) {
          throw new Error('Bộ nhớ ảnh chưa sẵn sàng.');
        }
        let hash = 5381;
        for (let index = 0; index < cacheKey.length; index += 1) hash = ((hash << 5) + hash) ^ cacheKey.charCodeAt(index);
        const extension = url.match(/\.(?:avif|bmp|gif|jpe?g|png|webp)(?:\?|$)/i)?.[0]?.replace(/\?.*$/, '') || '.jpg';
        const target = new fileSystem.File(fileSystem.Paths.cache, `vichat-image-${Math.abs(hash)}${extension}`);
        const download = () => fileSystem.File.downloadFileAsync(url, target, {
          headers: this.getMediaHeaders(),
          idempotent: true,
        });
        let downloaded;
        try {
          downloaded = await download();
        } catch (error: any) {
          // Protected media can outlive the short Tinode token; renew once,
          // then retry the same request without hiding other download errors.
          if (!shouldRetryProtectedMedia(error)) throw error;
          let refreshed = false;
          try { refreshed = await this.refreshMediaAuth(); } catch { /* Keep the original media error. */ }
          if (!refreshed) throw error;
          downloaded = await download();
        }
        return downloaded.uri;
      })().catch(error => {
        imageCacheRequests.delete(cacheKey);
        throw error;
      });
      imageCacheRequests.set(cacheKey, request);
    }
    return imageCacheRequests.get(cacheKey)!;
  }

  async downloadFile(file: FileAttachment) {
    if (!file?.url) throw new Error('Tep chua co duong dan tai xuong.');
    const safeName = String(file.name || 'tep-dinh-kem').replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileSystem: any = require('expo-file-system');
    const sharing: any = require('expo-sharing');
    if (!fileSystem.File?.downloadFileAsync || !fileSystem.Paths?.cache) throw new Error('Bộ nhớ tải tệp chưa sẵn sàng.');
    const target = new fileSystem.File(fileSystem.Paths.cache, `vichat-${Date.now()}-${safeName}`);
    const download = () => fileSystem.File.downloadFileAsync(file.url, target, { headers: this.getMediaHeaders(), idempotent: true });
    let downloaded;
    try {
      downloaded = await download();
    } catch (error) {
      if (!shouldRetryProtectedMedia(error)) throw error;
      let refreshed = false;
      try { refreshed = await this.refreshMediaAuth(); } catch { /* Keep the original media error. */ }
      if (!refreshed) throw error;
      downloaded = await download();
    }
    if (await sharing.isAvailableAsync()) await sharing.shareAsync(downloaded.uri, { mimeType: file.mime, dialogTitle: file.name });
    return downloaded.uri;
  }

  private wireTopic(topic: any) {
    if (!topic || topic.__vichatMobileWired) return topic;
    topic.__vichatMobileWired = true;
    topic.onData = (raw: any) => {
      if (this.blockedTopics.has(String(topic.name || ''))) return;
      this.emitCallInvite(topic, raw);
      if (!raw?.from || !this.client?.isMe?.(raw.from)) this.acknowledgeTopicReceived(topic, raw?.seq);
      const conversation = this.materialize(topic);
      this.emit({ type: 'conversation', conversation });
      if (!topic.__vichatMobileSyncing) this.emitIncomingMessage(topic, raw, conversation);
    };
    topic.onMetaDesc = () => {
      if (!this.blockedTopics.has(String(topic.name || ''))) this.emit({ type: 'conversation', conversation: this.materialize(topic) });
    };
    topic.onMetaSub = () => {
      if (!this.blockedTopics.has(String(topic.name || ''))) this.emit({ type: 'conversation', conversation: this.materialize(topic) });
    };
    topic.onSubsUpdated = () => {
      if (!this.blockedTopics.has(String(topic.name || ''))) this.emit({ type: 'conversation', conversation: this.materialize(topic) });
    };
    topic.onPres = (presence: any) => {
      if (this.blockedTopics.has(String(topic.name || ''))) return;
      this.updatePresence(presence);
      this.emit({ type: 'conversation', conversation: this.materialize(topic) });
    };
    topic.onInfo = (info: any) => {
      if (this.blockedTopics.has(String(topic.name || ''))) return;
      if (info?.what === 'call') {
        this.emit({
          type: 'call-signal',
          topic: topic.name,
          seq: Number(info.seq) || 0,
          event: String(info.event || ''),
          payload: info.payload,
          from: info.from,
        });
        return;
      }
      if (['kp', 'kpa', 'kpv'].includes(info?.what)) this.emit({ type: 'typing', topic: topic.name, uid: info.from, active: true });
      if (['read', 'recv'].includes(info?.what) && !this.client?.isMe?.(info?.from)) {
        this.updateReceiptCursor(topic, info.what, info.seq);
        this.emit({ type: 'conversation', conversation: this.materialize(topic) });
      }
    };
    return topic;
  }

  private emitCallInvite(topic: any, raw: any) {
    if (!raw?.seq || !raw?.from || this.client?.isMe?.(raw.from)) return;
    if (raw.head?.webrtc !== CALL_HEAD_STARTED) return;
    const content = raw.content;
    const entity = content?.ent?.find?.((item: any) => item?.tp === 'VC')?.data;
    const key = `${topic.name}:${raw.seq}`;
    if (!entity || topic.name?.startsWith('grp') || this.callInviteKeys.has(key)) return;
    this.callInviteKeys.add(key);
    this.emit({ type: 'call-invite', topic: topic.name, seq: Number(raw.seq), from: String(raw.from), audioOnly: Boolean(entity.aonly || raw.head?.aonly) });
  }

  private getTopic(name: string) {
    const topic = this.wireTopic(this.client.getTopic(name));
    this.topics.set(name, topic);
    return topic;
  }

  async connect(auth: TinodeAuth, tokenProvider: () => Promise<TinodeAuth>) {
    if (this.connected && this.auth?.uid === auth.uid) return;
    await loadTinodeSdk();
    this.intentionalDisconnect = false;
    this.auth = auth;
    this.tokenProvider = tokenProvider;
    if (!this.client) {
      this.client = new TinodeConstructor({
        appName: config.appName,
        host: config.tinodeHost,
        apiKey: config.tinodeApiKey,
        transport: config.tinodeTransport,
        secure: config.tinodeSecure,
        platform: Platform.OS,
        persist: false,
      });
      this.client.onDisconnect = (error: unknown) => {
        if (!this.intentionalDisconnect) this.emit({ type: 'connection', state: 'disconnected', error });
      };
      this.client.onAutoreconnectIteration = () => {
        if (!this.intentionalDisconnect) this.emit({ type: 'connection', state: 'reconnecting' });
      };
      this.client.onConnect = () => {
        if (!this.intentionalDisconnect) this.emit({ type: 'connection', state: 'connected' });
      };
    }
    this.emit({ type: 'connection', state: 'connecting' });
    if (!this.client.isConnected()) await this.client.connect();
    const fresh = auth.token || (await this.tokenProvider()).token;
    await this.client.loginToken(fresh);
    this.auth = { ...auth, token: fresh };
    if (this.deviceToken) this.client.setDeviceToken?.(this.deviceToken);
    this.meTopic = this.client.getMeTopic();
    this.meTopic.onMetaSub = (contact: any) => {
      this.emitContactProfile(contact);
      this.updateContactPresence(contact);
      const topic = this.topics.get(String(contact?.name || ''));
      if (topic) this.emit({ type: 'conversation', conversation: this.materialize(topic) });
    };
    this.meTopic.onSubsUpdated = () => this.syncPresenceSnapshot();
    this.meTopic.onContactUpdate = (what: string, contact: any) => {
      this.emitContactProfile(contact);
      this.updateContactPresence(contact, what);
      const topic = this.topics.get(String(contact?.name || ''));
      if (topic) this.emit({ type: 'conversation', conversation: this.materialize(topic) });
    };
    this.meTopic.onPres = (presence: any) => {
      this.updatePresence(presence);
    };
    const previousInfo = this.meTopic.onInfo;
    this.meTopic.onInfo = (info: any) => {
      previousInfo?.(info);
      if (info?.what !== 'call' || !info?.src) return;
      this.emit({
        type: 'call-signal',
        topic: String(info.src),
        seq: Number(info.seq) || 0,
        event: String(info.event || ''),
        payload: info.payload,
        from: info.from,
        viaMe: true,
      });
    };
    if (!this.meTopic.isSubscribed?.()) {
      await this.meTopic.subscribe(this.meTopic.startMetaQuery().withDesc().withSub().build());
    }
    this.syncPresenceSnapshot(true);
    this.emit({ type: 'connection', state: 'connected' });
  }

  async reconnect() {
    if (!this.auth || this.intentionalDisconnect) return new Set<string>();
    const trackedTopics = [...this.topics.keys()];
    try {
      const auth = this.tokenProvider ? await this.tokenProvider() : this.auth;
      await this.connect(auth, this.tokenProvider || (async () => auth));
      return await this.syncTopics(trackedTopics);
    } catch (error) {
      this.emit({ type: 'connection', state: 'error', error });
      return new Set<string>();
    }
  }

  async disconnect() {
    this.intentionalDisconnect = true;
    this.client?.setDeviceToken?.(null);
    this.auth = null;
    this.meTopic = null;
    this.topics.clear();
    this.presenceByUid.clear();
    this.receiptCursors.clear();
    this.notifiedSeqByTopic.clear();
    this.blockedTopics.clear();
    this.callInviteKeys.clear();
    imageCacheRequests.clear();
    imageCacheVersions.clear();
    this.client?.disconnect?.();
    this.client = null;
    this.emit({ type: 'connection', state: 'disconnected' });
  }

  async subscribeTopic(name: string, historyLimit = 100) {
    this.allowConversationTopic(name);
    if (!this.client || !name) throw new Error('Tinode chưa kết nối.');
    const topic = this.getTopic(name);
    const historyLoaded = Boolean(topic.__vichatMobileHistoryLoaded);
    const previousMaxSeq = Number(topic.maxMsgSeq?.() || 0);
    topic.__vichatMobileSyncing = true;
    try {
      if (!topic.isSubscribed?.()) {
        const query = topic.startMetaQuery().withDesc().withSub();
        if (historyLimit > 0) {
          if (historyLoaded && previousMaxSeq > 0) query.withLaterData(historyLimit).withLaterDel(historyLimit);
          else query.withEarlierData(historyLimit).withDel(undefined, historyLimit);
        }
        await topic.subscribe(query.build());
      } else if (historyLimit > 0 && !historyLoaded) {
        await topic.getMeta(topic.startMetaQuery().withEarlierData(historyLimit).withDel(undefined, historyLimit).build());
      }
    } finally {
      topic.__vichatMobileSyncing = false;
    }
    if (historyLimit > 0) topic.__vichatMobileHistoryLoaded = true;
    this.acknowledgeTopicReceived(topic);
    const conversation = this.materialize(topic);
    this.emit({ type: 'conversation', conversation });
    const latestSeq = Number(topic.maxMsgSeq?.() || 0);
    if (!historyLoaded) {
      this.notifiedSeqByTopic.set(name, latestSeq);
    } else if (latestSeq > previousMaxSeq) {
      const missed = conversation.messages.filter(message =>
        message.sender === 'incoming'
        && !['reaction', 'recall', 'system'].includes(message.type)
        && Number(message.seq || 0) > previousMaxSeq,
      ).at(-1);
      if (missed) this.emitIncomingMessage(topic, missed.raw, conversation);
      else this.notifiedSeqByTopic.set(name, latestSeq);
    }
    return conversation;
  }

  async syncTopics(names: string[]) {
    const uniqueNames = [...new Set(names.filter(Boolean))];
    const results = await Promise.allSettled(uniqueNames.map(async name => {
      await this.subscribeTopic(name, 40);
      return name;
    }));
    return new Set(results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []));
  }

  openConversation(name: string) { return this.subscribeTopic(name, 100); }

  getCallIceServers() {
    const servers = this.client?.getServerParam?.('iceServers', []);
    return Array.isArray(servers) ? servers : [];
  }

  getCallCapability(topicName: string, options: { isGroup?: boolean; isChatbot?: boolean } = {}) {
    if (!config.callsEnabled) return { available: false, reason: 'Cuộc gọi chưa được bật trong app.' };
    if (!this.connected) return { available: false, reason: 'Kết nối Tinode realtime chưa sẵn sàng.' };
    if (options.isChatbot) return { available: false, reason: 'Không thể gọi trợ lý chatbot.' };
    if (options.isGroup || !/^usr[a-z0-9_-]+$/i.test(String(topicName || ''))) return { available: false, reason: 'Cuộc gọi mobile chỉ hỗ trợ hội thoại 1-1.' };
    const serverInfo = this.client?.getServerInfo?.() || {};
    if (serverInfo.webrtcEnabled === false || String(serverInfo.webrtcEnabled || '').trim().toLowerCase() === 'false') {
      return { available: false, reason: 'Máy chủ Tinode trung tâm chưa bật WebRTC/ICE authoritative.' };
    }
    if (!this.getCallIceServers().length) return { available: false, reason: 'Máy chủ chưa cấu hình ICE/TURN cho cuộc gọi.' };
    return { available: true, reason: '' };
  }

  async startCall(topicName: string, audioOnly = false) {
    const capability = this.getCallCapability(topicName);
    if (!capability.available) throw new Error(capability.reason);
    await this.subscribeTopic(topicName, 0);
    const topic = this.getTopic(topicName);
    if (!Drafty?.videoCall) throw new Error('Tinode SDK không hỗ trợ cuộc gọi.');
    const draft = topic.createMessage(Drafty.videoCall(Boolean(audioOnly)), false);
    draft.head = { ...(draft.head || {}), webrtc: CALL_HEAD_STARTED, aonly: Boolean(audioOnly), 'x-sender-id': this.currentUserId };
    const client = this.client;
    if (!client?.publishMessage) throw new Error('Tinode chưa sẵn sàng gửi cuộc gọi.');
    // Topic.publishMessage in Tinode SDK 0.25.3 swallows rejected PUB errors.
    const published = await publishCallInvite({
      draft,
      publish: message => client.publishMessage(message),
    });
    return { seq: published.seq, topic: topicName, audioOnly: Boolean(audioOnly) };
  }

  async sendCallSignal(topicName: string, seq: number, event: string, payload?: any) {
    if (!Object.values(CALL_SIGNAL_EVENTS).includes(event as any)) throw new Error('Tín hiệu cuộc gọi không hợp lệ.');
    if (!Number(seq)) throw new Error('Cuộc gọi chưa có mã tin nhắn.');
    await this.subscribeTopic(topicName, 0);
    await this.getTopic(topicName).videoCall(event, Number(seq), payload);
  }

  async sendText(topicName: string, text: string, clientId: string, replyTo?: ChatMessage['replyTo']) {
    await this.subscribeTopic(topicName, 0);
    const topic = this.getTopic(topicName);
    const draft = topic.createMessage(text, false);
    draft.head = { ...(draft.head || {}), 'x-client-id': clientId, 'x-sender-id': this.currentUserId };
    if (replyTo?.id) draft.head['x-reply-to'] = JSON.stringify(replyTo);
    const result = await topic.publishMessage(draft);
    if (!result) throw new Error('Tinode không xác nhận tin nhắn.');
    return result;
  }

  async sendTyping(topicName: string) {
    await this.subscribeTopic(topicName, 0);
    const topic = this.getTopic(topicName);
    topic.noteKeyPress?.();
  }

  async markRead(topicName: string) {
    await this.subscribeTopic(topicName, 0);
    const topic = this.getTopic(topicName);
    topic.noteRead?.();
  }

  async sendReaction(topicName: string, message: ChatMessage, emoji: string) {
    if (message.recalled) throw new Error('Tin nhắn đã được thu hồi và không thể biểu cảm.');
    await this.subscribeTopic(topicName, 0);
    const topic = this.getTopic(topicName);
    await topic.publish(`${REACTION_EVENT_PREFIX}${JSON.stringify({
      targetId: message.id,
      emoji: emoji.slice(0, 8),
      actorId: this.currentUserId,
      active: true,
    })}`);
  }

  async recallMessage(topicName: string, message: ChatMessage, mode: RecallMode = 'all') {
    if (!canRecallMessage(message)) throw new Error('Chỉ có thể thu hồi sau khi tin nhắn đã gửi thành công.');
    if (message.sender !== 'outgoing' || !this.client.isMe?.(message.senderId)) throw new Error('Chỉ người gửi mới có thể thu hồi tin nhắn này.');
    await this.subscribeTopic(topicName, 0);
    const topic = this.getTopic(topicName);
    const event = buildRecallEvent(message, this.currentUserId, mode);
    const target = String(event.targetSeq || event.targetId || Date.now());
    await publishControlEvent(
      topic,
      `${RECALL_EVENT_PREFIX}${JSON.stringify(event)}`,
      `mobile-recall-${target}-${Date.now()}`,
      this.currentUserId,
    );
  }

  async deleteConversation(topicName: string) {
    this.disallowConversationTopic(topicName);
  }

  getAuthTokenValue() {
    return String(this.client?.getAuthToken?.()?.token || '');
  }

  private async uploadFile(file: PickerFile, topicName = '') {
    if (Number(file.size) > config.maxAttachmentBytes) throw new Error('File hoặc ảnh không được lớn hơn 500 MB.');
    const uploadUrl = `${config.mediaBase}/v0/file/u/`;
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const headers = tinodeHeaders(this.getAuthTokenValue());
    let uploadResponse: { status: number; body: string };
    try {
      const fileSystem: any = require('expo-file-system');
      const parameters = { id: uploadId, ...(topicName ? { topic: topicName } : {}) };
      if (fileSystem.File && fileSystem.UploadType?.MULTIPART !== undefined) {
        const localFile = new fileSystem.File(file.uri);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
        try {
          const result = await localFile.upload(uploadUrl, {
            httpMethod: 'POST',
            uploadType: fileSystem.UploadType.MULTIPART,
            fieldName: 'file',
            mimeType: file.type || 'application/octet-stream',
            parameters,
            headers,
            signal: controller.signal,
          });
          uploadResponse = { status: Number(result.status || 0), body: String(result.body || '') };
        } finally {
          clearTimeout(timeout);
        }
      } else {
        const form = new FormData();
        form.append('file', { uri: file.uri, name: file.name || 'tep-dinh-kem', type: file.type || 'application/octet-stream' } as any);
        form.append('id', uploadId);
        if (topicName) form.append('topic', topicName);
        const response = await fetch(uploadUrl, { method: 'POST', headers, body: form });
        uploadResponse = { status: response.status, body: await response.text() };
      }
    } catch (error) {
      const detail = error instanceof Error && error.name === 'AbortError'
        ? 'Upload quá thời gian cho phép.'
        : error instanceof Error ? error.message : 'lỗi mạng';
      throw new Error(`Không kết nối được máy chủ upload: ${detail}`, { cause: error });
    }
    const payload = (() => {
      try { return JSON.parse(uploadResponse.body); } catch { return {}; }
    })();
    const url = payload?.ctrl?.params?.url;
    if (uploadResponse.status < 200 || uploadResponse.status >= 300 || !url) {
      throw new Error(payload?.ctrl?.text || `Tinode từ chối file (HTTP ${uploadResponse.status || 'không xác định'}).`);
    }
    return normalizeMediaUrl(url);
  }

  async updateCurrentProfile({ name = '', avatarFile = null as PickerFile | null, avatarUrl = '' } = {}) {
    if (!this.meTopic) throw new Error('Phiên đăng nhập Tinode chưa sẵn sàng.');
    const currentPublic = this.meTopic.public || {};
    const resolvedName = String(name || currentPublic.fn || currentPublic.name || 'Người dùng').trim();
    let photo = currentPublic.photo || currentPublic.avatar || null;
    if (avatarFile) {
      const uploadedUrl = await this.uploadFile(avatarFile, 'me');
      photo = { ref: uploadedUrl, mime: avatarFile.type || 'image/jpeg', size: avatarFile.size || 0 };
    } else if (avatarUrl) {
      photo = { ref: avatarUrl };
    }
    await this.meTopic.setMeta({
      desc: {
        public: {
          ...currentPublic,
          fn: resolvedName,
          ...(photo ? { photo } : {}),
        },
      },
    });
    const avatar = normalizeMediaUrl(photo?.ref || photo?.url || '');
    this.invalidateImageCache(avatar);
    this.emit({ type: 'profile', uid: this.currentUserId, name: resolvedName, avatar });
    return { id: this.currentUserId, name: resolvedName, avatar };
  }

  async createGroup({
    name,
    description = '',
    memberIds = [],
    avatarFile = null,
  }: {
    name: string;
    description?: string;
    memberIds?: string[];
    avatarFile?: PickerFile | null;
  }) {
    if (!this.client) throw new Error('Tinode chưa kết nối.');
    const topic = this.wireTopic(this.client.getTopic(this.client.newGroupTopicName(false)));
    await topic.subscribe(
      topic.startMetaQuery().withDesc().withSub().build(),
      { desc: { public: { fn: name, note: description }, defacs: { auth: 'N', anon: 'N' } } },
    );
    let avatarUrl = '';
    if (avatarFile) {
      avatarUrl = await this.uploadFile(avatarFile, topic.name);
      await topic.setMeta({ desc: { public: {
        fn: name,
        note: description,
        photo: { ref: avatarUrl, mime: avatarFile.type || 'image/jpeg', size: avatarFile.size || 0 },
      } } });
    }
    await Promise.all([...new Set(memberIds.filter(Boolean))].map(uid => topic.invite(uid, 'JRWPAS')));
    const conversation = this.materialize(topic);
    return { ...conversation, avatarUrl: avatarUrl || conversation.avatarUrl };
  }

  async discardGroupTopic(topicName: string) {
    if (!String(topicName || '').startsWith('grp')) return;
    const topic = this.client?.getTopic?.(topicName);
    if (topic) await topic.delTopic?.(true);
    this.client?.cacheRemTopic?.(topicName);
    this.topics.delete(topicName);
  }

  async sendFile(topicName: string, file: PickerFile, clientId: string) {
    if (Number(file.size) > config.maxAttachmentBytes) throw new Error('File hoặc ảnh không được lớn hơn 500 MB.');
    await this.subscribeTopic(topicName, 0);
    const topic = this.getTopic(topicName);
    const url = await this.uploadFile(file, topicName);
    const attachment = { mime: file.type || 'application/octet-stream', filename: file.name || 'Tệp đính kèm', refurl: url, size: file.size || 0 };
    const isImage = /^image\//i.test(attachment.mime) || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(attachment.filename);
    if (!Drafty || (isImage ? !Drafty.appendImage : !Drafty.attachFile)) throw new Error('Tinode SDK không hỗ trợ file trên thiết bị này.');
    const content = isImage ? Drafty.appendImage(null, attachment) : Drafty.attachFile(null, attachment);
    const draft = topic.createMessage(content, false);
    draft.head = { ...(draft.head || {}), 'x-client-id': clientId, 'x-sender-id': this.currentUserId };
    const result = await topic.publishMessage(draft);
    if (!result) throw new Error('Tinode không xác nhận tệp đính kèm.');
    return { url: normalizeMediaUrl(url), file: { name: attachment.filename, mime: attachment.mime, size: attachment.size, url: normalizeMediaUrl(url) } };
  }
}

export const tinodeClient = new TinodeMobileClient();
