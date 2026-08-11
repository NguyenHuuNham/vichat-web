import { Platform } from 'react-native';
import { config } from '../constants/config';
import { ChatMessage, Conversation, FileAttachment, PickerFile, TinodeAuth } from '../types';
import { installIntlSegmenterPolyfill } from '../polyfills/intlSegmenter';
import {
  REACTION_EVENT_PREFIX,
  RECALL_EVENT_PREFIX,
  SYSTEM_EVENT_PREFIX,
  buildRecallEvent,
  canRecallMessage,
} from '../utils/messagePolicy';
import { formatMessageTime } from '../utils/timeFormatting';

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
  | { type: 'typing'; topic: string; uid: string; active: boolean }
  | { type: 'presence'; uid: string; online: boolean };

function mediaUrl(value: unknown) {
  const raw = String(value || '');
  if (!raw) return '';
  if (/^(?:data:|blob:|https?:)/i.test(raw)) return raw;
  if (raw.startsWith('/tinode-media/')) return `https://chat.upgo.vn${raw}`;
  if (raw.startsWith('/v0/file/')) return `${config.mediaBase}${raw}`;
  return `${config.mediaBase}/${raw.replace(/^\/+/, '')}`;
}

function tinodeHeaders(token = '') {
  return {
    'X-Tinode-APIKey': config.tinodeApiKey,
    ...(token ? { 'X-Tinode-Auth': `Token ${token}` } : {}),
  };
}

function messageContent(raw: any) {
  if (typeof raw?.content === 'string') return raw.content;
  return String(raw?.content?.txt || '');
}

function rawAttachment(raw: any) {
  const content = raw?.content;
  const entity = content?.ent?.find?.((item: any) => item?.tp === 'EX' || item?.tp === 'IM');
  if (!entity) return null;
  const data = entity.data || {};
  const name = String(data.name || 'Tệp đính kèm');
  const mime = String(data.mime || 'application/octet-stream');
  const url = mediaUrl(data.ref || data.url || data.val || (Drafty?.getDownloadUrl?.(data) || ''));
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

function normalizeMessage(raw: any, client: any, _topic: any): ChatMessage | null {
  if (!raw || raw._deleted) return null;
  const senderId = String(raw.from || raw.head?.['x-sender-id'] || '');
  const outgoing = Boolean(senderId && client.isMe?.(senderId));
  const content = messageContent(raw);
  const reaction = parseEvent(content, REACTION_EVENT_PREFIX);
  const recall = parseEvent(content, RECALL_EVENT_PREFIX);
  const system = parseEvent(content, SYSTEM_EVENT_PREFIX);
  const attachment = rawAttachment(raw);
  const id = String(raw.head?.['x-client-id'] || `${senderId || 'system'}-${raw.seq || raw.ts || Date.now()}`);
  if (reaction) return {
    id, seq: raw.seq, type: 'reaction', sender: outgoing ? 'outgoing' : 'incoming', senderId,
    senderName: '', text: '', createdAt: raw.ts, reaction: undefined,
    raw: { ...raw, reactionEvent: reaction },
  } as any;
  if (recall) return {
    id, seq: raw.seq, type: 'recall', sender: outgoing ? 'outgoing' : 'incoming', senderId,
    senderName: '', text: '', createdAt: raw.ts, raw: { ...raw, recallEvent: recall },
  };
  const type = system ? 'system' : attachment ? (attachment.isImage ? 'image' : 'file') : 'text';
  return {
    id,
    seq: Number(raw.seq) || undefined,
    type,
    sender: outgoing ? 'outgoing' : 'incoming',
    senderId: senderId || (outgoing ? client.getCurrentUserID?.() : ''),
    senderName: outgoing ? 'Bạn' : 'Thành viên',
    text: system ? String(system.text || system.action || 'Hoạt động hệ thống') : content,
    image: attachment?.isImage ? attachment.file.url : undefined,
    file: attachment?.file,
    createdAt: raw.ts ? new Date(raw.ts).toISOString() : undefined,
    time: formatMessageTime(raw.ts),
    deliveryStatus: outgoing ? 'sent' : 'received',
    raw,
  };
}

function materializeConversation(topic: any, client: any): Conversation {
  const isGroup = Boolean(topic.isGroupType?.() || String(topic.name || '').startsWith('grp'));
  const loaded: ChatMessage[] = [];
  topic.messages?.((raw: any) => {
    const message = normalizeMessage(raw, client, topic);
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
  loaded.filter(message => message.type === 'recall').forEach(message => {
    const event = message.raw?.recallEvent;
    if (event?.targetId) recalls.set(String(event.targetId), event);
    if (event?.targetSeq) recalls.set(`seq:${event.targetSeq}`, event);
  });
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
      return recall ? {
        ...message,
        type: 'text' as const,
        text: 'Tin nhắn đã được thu hồi',
        recalled: true,
        file: undefined,
        image: undefined,
        reactions: {},
      } : { ...message, reactions };
    });
  const members: any[] = [];
  topic.subscribers?.((sub: any) => {
    if (sub?.user) members.push({
      id: sub.user,
      uid: sub.user,
      username: sub.user,
      name: sub.public?.fn || sub.public?.name || 'Thành viên',
      avatar: mediaUrl(sub.public?.photo?.ref || sub.public?.avatar || ''),
      active: true,
      tenantId: config.tenantId,
      online: sub.online === true,
      mode: sub.acs?.getMode?.() || sub.mode || '',
    });
  });
  if (!isGroup && topic.name) {
    const peer = members.find(item => item.id !== client.getCurrentUserID?.());
    if (!peer) members.push({ id: topic.name, uid: topic.name, username: topic.name, name: topic.public?.fn || topic.name, active: true, tenantId: config.tenantId, online: topic.online === true });
  }
  messages.sort((a, b) => (Number(a.seq || 0) - Number(b.seq || 0)) || ((Date.parse(a.createdAt || '') || 0) - (Date.parse(b.createdAt || '') || 0)));
  const latest = messages[messages.length - 1];
  const directPeer = members.find(item => item.id !== client.getCurrentUserID?.()) || members[0];
  return {
    id: topic.name,
    managementId: topic.name,
    tinodeTopic: topic.name,
    name: String(topic.public?.fn || topic.public?.name || directPeer?.name || topic.name || 'Cuộc trò chuyện'),
    isGroup,
    avatarUrl: mediaUrl(topic.public?.photo?.ref || topic.public?.avatar || directPeer?.avatar || ''),
    description: String(topic.public?.note || ''),
    membersCount: isGroup ? `${members.length} thành viên` : (directPeer?.online ? 'Online' : 'Offline'),
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

  get connected() {
    return Boolean(this.client?.isConnected?.() && this.client?.isAuthenticated?.());
  }

  get currentUserId() {
    return String(this.client?.getCurrentUserID?.() || this.auth?.uid || '');
  }

  getMediaHeaders() {
    return tinodeHeaders(this.client?.getAuthToken?.()?.token || '');
  }

  async downloadFile(file: FileAttachment) {
    if (!file?.url) throw new Error('Tep chua co duong dan tai xuong.');
    const safeName = String(file.name || 'tep-dinh-kem').replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileSystem: any = require('expo-file-system');
    const sharing: any = require('expo-sharing');
    if (!fileSystem.File?.downloadFileAsync || !fileSystem.Paths?.cache) throw new Error('Bộ nhớ tải tệp chưa sẵn sàng.');
    const target = new fileSystem.File(fileSystem.Paths.cache, `vichat-${Date.now()}-${safeName}`);
    const downloaded = await fileSystem.File.downloadFileAsync(file.url, target, { headers: this.getMediaHeaders(), idempotent: true });
    if (await sharing.isAvailableAsync()) await sharing.shareAsync(downloaded.uri, { mimeType: file.mime, dialogTitle: file.name });
    return downloaded.uri;
  }

  private wireTopic(topic: any) {
    if (!topic || topic.__vichatMobileWired) return topic;
    topic.__vichatMobileWired = true;
    topic.onData = () => this.emit({ type: 'conversation', conversation: materializeConversation(topic, this.client) });
    topic.onMetaSub = () => this.emit({ type: 'conversation', conversation: materializeConversation(topic, this.client) });
    topic.onSubsUpdated = () => this.emit({ type: 'conversation', conversation: materializeConversation(topic, this.client) });
    topic.onPres = (presence: any) => {
      if (presence?.src && ['on', 'off'].includes(presence.what)) this.emit({ type: 'presence', uid: presence.src, online: presence.what === 'on' });
      this.emit({ type: 'conversation', conversation: materializeConversation(topic, this.client) });
    };
    topic.onInfo = (info: any) => {
      if (['kp', 'kpa', 'kpv'].includes(info?.what)) this.emit({ type: 'typing', topic: topic.name, uid: info.from, active: true });
      if (['read', 'recv'].includes(info?.what)) this.emit({ type: 'conversation', conversation: materializeConversation(topic, this.client) });
    };
    return topic;
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
    this.meTopic = this.client.getMeTopic();
    this.meTopic.onPres = (presence: any) => {
      if (presence?.src && ['on', 'off'].includes(presence.what)) this.emit({ type: 'presence', uid: presence.src, online: presence.what === 'on' });
    };
    if (!this.meTopic.isSubscribed?.()) {
      await this.meTopic.subscribe(this.meTopic.startMetaQuery().withDesc().withSub().build());
    }
    this.emit({ type: 'connection', state: 'connected' });
  }

  async reconnect() {
    if (!this.auth || this.intentionalDisconnect) return;
    try {
      const auth = this.tokenProvider ? await this.tokenProvider() : this.auth;
      await this.connect(auth, this.tokenProvider || (async () => auth));
    } catch (error) {
      this.emit({ type: 'connection', state: 'error', error });
    }
  }

  async disconnect() {
    this.intentionalDisconnect = true;
    this.auth = null;
    this.meTopic = null;
    this.topics.clear();
    this.client?.disconnect?.();
    this.client = null;
    this.emit({ type: 'connection', state: 'disconnected' });
  }

  async subscribeTopic(name: string, historyLimit = 100) {
    if (!this.client || !name) throw new Error('Tinode chưa kết nối.');
    const topic = this.getTopic(name);
    if (!topic.isSubscribed?.()) {
      await topic.subscribe(topic.startMetaQuery().withDesc().withSub().withEarlierData(historyLimit).withDel(undefined, historyLimit).build());
    } else if (historyLimit > 0 && !topic.__vichatMobileHistoryLoaded) {
      await topic.getMeta(topic.startMetaQuery().withEarlierData(historyLimit).withDel(undefined, historyLimit).build());
    }
    topic.__vichatMobileHistoryLoaded = true;
    const conversation = materializeConversation(topic, this.client);
    this.emit({ type: 'conversation', conversation });
    return conversation;
  }

  async syncTopics(names: string[]) {
    await Promise.allSettled([...new Set(names.filter(Boolean))].map(name => this.subscribeTopic(name, 40)));
  }

  openConversation(name: string) { return this.subscribeTopic(name, 100); }

  async sendText(topicName: string, text: string, clientId: string) {
    await this.subscribeTopic(topicName, 0);
    const topic = this.getTopic(topicName);
    const draft = topic.createMessage(text, false);
    draft.head = { ...(draft.head || {}), 'x-client-id': clientId, 'x-sender-id': this.currentUserId };
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
    await this.subscribeTopic(topicName, 0);
    const topic = this.getTopic(topicName);
    await topic.publish(`${REACTION_EVENT_PREFIX}${JSON.stringify({
      targetId: message.id,
      emoji: emoji.slice(0, 8),
      actorId: this.currentUserId,
      active: true,
    })}`);
  }

  async recallMessage(topicName: string, message: ChatMessage) {
    if (!canRecallMessage(message)) throw new Error('Chỉ có thể thu hồi sau khi tin nhắn đã gửi thành công.');
    if (message.sender !== 'outgoing' || !this.client.isMe?.(message.senderId)) throw new Error('Chỉ người gửi mới có thể thu hồi tin nhắn này.');
    await this.subscribeTopic(topicName, 0);
    const topic = this.getTopic(topicName);
    await topic.publish(`${RECALL_EVENT_PREFIX}${JSON.stringify(buildRecallEvent(message, this.currentUserId))}`);
    if (message.seq) await topic.delMessagesList?.([Number(message.seq)], true).catch(() => null);
  }

  async sendFile(topicName: string, file: PickerFile, clientId: string) {
    if (Number(file.size) > config.maxAttachmentBytes) throw new Error('File hoặc ảnh không được lớn hơn 500 MB.');
    await this.subscribeTopic(topicName, 0);
    const topic = this.getTopic(topicName);
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name || 'tep-dinh-kem', type: file.type || 'application/octet-stream' } as any);
    form.append('id', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const response = await fetch(`${config.mediaBase}/v0/file/u/`, {
      method: 'POST',
      headers: tinodeHeaders(this.client.getAuthToken?.()?.token || ''),
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    const url = payload?.ctrl?.params?.url;
    if (!response.ok || !url) throw new Error(payload?.ctrl?.text || `Tinode từ chối file (HTTP ${response.status}).`);
    const attachment = { mime: file.type || 'application/octet-stream', filename: file.name || 'Tệp đính kèm', refurl: url, size: file.size || 0 };
    const isImage = /^image\//i.test(attachment.mime) || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(attachment.filename);
    if (!Drafty || (isImage ? !Drafty.appendImage : !Drafty.attachFile)) throw new Error('Tinode SDK không hỗ trợ file trên thiết bị này.');
    const content = isImage ? Drafty.appendImage(null, attachment) : Drafty.attachFile(null, attachment);
    const draft = topic.createMessage(content, false);
    draft.head = { ...(draft.head || {}), 'x-client-id': clientId, 'x-sender-id': this.currentUserId };
    const result = await topic.publishMessage(draft);
    if (!result) throw new Error('Tinode không xác nhận tệp đính kèm.');
    return { url: mediaUrl(url), file: { name: attachment.filename, mime: attachment.mime, size: attachment.size, url: mediaUrl(url) } };
  }
}

export const tinodeClient = new TinodeMobileClient();
