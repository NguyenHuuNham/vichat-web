import { Platform } from 'react-native';
import { config } from '../constants/config';
import { ChatMessage, Conversation, FileAttachment, PickerFile, RecallMode, Sticker, TinodeAuth } from '../types';
import { installIntlSegmenterPolyfill } from '../polyfills/intlSegmenter';
import {
  EDIT_EVENT_PREFIX,
  REACTION_EVENT_PREFIX,
  RECALL_EVENT_PREFIX,
  SYSTEM_EVENT_PREFIX,
  applyEditToMessage,
  buildEditEvent,
  buildRecallEvent,
  canEditMessage,
  canRecallMessage,
  editActorMatchesMessage,
  editTargetsMessage,
  recallAppliesToViewer,
} from '../utils/messagePolicy';
import { formatMessageTime } from '../utils/timeFormatting';
import { mapTinodeDeliveryStatus, ReceiptCursor } from '../utils/tinodeState';
import { normalizeMediaUrl } from '../utils/mediaUrl';
import { shouldRetryProtectedMedia } from '../utils/mediaRetryPolicy';
import { normalizeIceServers, publishCallInvite } from '../utils/callSignaling';
import {
  POLL_EVENT_PREFIX,
  applyPollEvent,
  normalizePoll,
  normalizePollEvent,
} from '../utils/poll';
import {
  bindChatMedia,
  discardChatMedia,
  isChatMediaReference,
  resolveChatMediaDownloadUrl,
  shouldFallbackToTinodeMedia,
  uploadChatMedia,
} from './chatMediaService';
import { identitiesOverlap } from '../utils/identity';
import { isOwnTinodeMessage, isOwnMessageOrigin, resolveTinodeMessageOrigin, CurrentIdentity } from '../utils/messageOrigin';
import { normalizeGroupSettings } from '../utils/groupSettings';
import { publishSequence } from '../utils/tinodePublish';

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

const CENTRAL_MESSAGE_TEXT_LIMIT = 120 * 1024;
const STICKER_HEAD = 'x-vichat-sticker';
const POLL_HEAD = 'x-vichat-poll';
const STICKER_MAX_BYTES = 2 * 1024 * 1024;
const TINODE_REQUEST_TIMEOUT_MS = 15_000;
const INITIAL_HISTORY_LIMIT = 0;
const OPEN_HISTORY_LIMIT = 30;
const HISTORY_PAGE_LIMIT = 40;
const BACKGROUND_HISTORY_LIMIT = 20;

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    Promise.resolve(operation).then(value => {
      clearTimeout(timer);
      resolve(value);
    }, error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

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
    throw new Error('Tinode SDK không sẵn sàng trên thiết bị này.');
  }
}

type Listener = (event: TinodeEvent) => void;
type TopicOptions = {
  emitSnapshot?: boolean;
  newerOnly?: boolean;
  notifyMissed?: boolean;
  generation?: number;
  signal?: AbortSignal;
};
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

function utf8ByteLength(value: string) {
  try {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
  } catch {
    // Fall through to the conservative character count on older runtimes.
  }
  return String(value).length;
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

function parseStickerMetadata(head: any = {}) {
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

function parsePollMetadata(head: any = {}) {
  const raw = head?.[POLL_HEAD];
  if (!raw) return null;
  try {
    return normalizePoll(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch {
    return null;
  }
}

function parseMentionMetadata(head: any = {}) {
  const raw = head?.['x-mentions'];
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed)
      ? parsed.filter(item => item && typeof item === 'object' && !Array.isArray(item)).slice(0, 50)
      : [];
  } catch {
    return [];
  }
}

function parseEvent(content: string, prefix: string) {
  if (!content.startsWith(prefix)) return null;
  try { return JSON.parse(content.slice(prefix.length)); } catch { return null; }
}

function groupSettingsFromTopic(topic: any) {
  if (!topic?.isGroupType?.() && !String(topic?.name || '').startsWith('grp')) return null;
  return topic.public?.vichat?.groupSettings
    || topic.public?.vichat?.group_settings
    || topic.public?.groupSettings
    || topic.public?.group_settings
    || null;
}

function formatSystemEvent(event: any, client: any) {
  const actorId = String(event?.actorId || '').trim();
  const viewerId = String(client?.getCurrentUserID?.() || '').trim();
  const actorName = String(event?.actorName || actorId || 'Một thành viên');
  const targets = Array.isArray(event?.targets) ? event.targets : [];
  const targetNames = targets.map((target: any) => String(target?.name || target?.id || 'thành viên')).filter(Boolean);
  const targetIsViewer = targets.some((target: any) => client?.isMe?.(String(target?.id || target?.uid || '')));
  const actorText = actorId && client?.isMe?.(actorId) ? 'Bạn' : actorName;
  const targetText = targetNames.join(', ') || 'thành viên';

  if (event?.action === 'member_added') {
    if (actorId === viewerId) return `Bạn đã thêm ${targetText} vào nhóm`;
    if (targetIsViewer) return `${actorName} đã thêm bạn vào nhóm`;
    return `${actorName} đã thêm ${targetText} vào nhóm`;
  }
  if (event?.action === 'member_approved') {
    if (actorId === viewerId) return `Bạn đã duyệt ${targetText} vào nhóm`;
    if (targetIsViewer) return `${actorName} đã duyệt bạn vào nhóm`;
    return `${actorName} đã duyệt ${targetText} vào nhóm`;
  }
  if (event?.action === 'member_pending') return `${actorName} đã gửi yêu cầu thêm ${targetText} vào nhóm`;
  if (event?.action === 'member_rejected') return `${actorName} đã từ chối ${targetText}`;
  if (event?.action === 'group_role_changed') {
    const role = String(event.role || event.groupRole || '').toUpperCase();
    return role === 'ADMIN'
      ? `${actorText} đã bổ nhiệm ${targetText} làm phó nhóm`
      : `${actorText} đã thu hồi quyền phó nhóm của ${targetText}`;
  }
  if (event?.action === 'member_left') {
    const leaveText = actorText === 'Bạn' ? 'Bạn đã rời khỏi nhóm' : `${actorName} đã rời khỏi nhóm`;
    const replacement = String(event.replacementName || '').trim();
    return replacement ? `${leaveText}. ${replacement} đã trở thành trưởng nhóm mới` : leaveText;
  }
  if (event?.action === 'member_removed') {
    return targetIsViewer ? `${actorName} đã xóa bạn khỏi nhóm` : `${actorName} đã xóa ${targetText} khỏi nhóm`;
  }
  if (event?.action === 'group_created') return actorId === viewerId ? 'Bạn đã tạo nhóm' : `${actorName} đã tạo nhóm`;
  if (event?.action === 'message_pinned' || event?.action === 'message_unpinned') {
    const actionText = event.action === 'message_pinned' ? 'đã ghim tin nhắn' : 'đã bỏ ghim tin nhắn';
    const preview = String(event.messagePreview || '').trim();
    return preview ? `${actorText} ${actionText}: “${preview}”` : `${actorText} ${actionText}`;
  }
  if (event?.action === 'group_name_changed') {
    const name = String(event.newName || event.name || '').trim();
    return name ? `${actorText} đổi tên nhóm thành “${name}”` : `${actorText} đổi tên nhóm`;
  }
  if (event?.action === 'conversation_nickname_changed') {
    const targetName = String(event.targetName || targets[0]?.name || 'thành viên').trim();
    const nickname = String(event.newNickname || '').trim();
    return nickname
      ? `${actorText} đã đặt biệt danh "${nickname}" cho ${targetName}`
      : `${actorText} đã xóa biệt danh của ${targetName}`;
  }
  if (event?.action === 'group_avatar_changed') return `${actorText} đổi ảnh đại diện nhóm`;
  if (event?.action === 'group_settings_changed') return `${actorText} cập nhật quyền của nhóm`;
  if (event?.action === 'group_dissolved') return actorText === 'Bạn' ? 'Bạn đã giải tán nhóm' : `${actorName} đã giải tán nhóm`;
  if (event?.action === 'poll_locked') return `${actorText} đã khóa bình chọn`;
  return String(event?.text || event?.action || 'Hoạt động nhóm');
}

async function publishControlEvent(topic: any, content: string, clientId: string, senderId: string): Promise<any> {
  const draft = topic.createMessage(content, false);
  draft.head = {
    ...(draft.head || {}),
    'x-client-id': clientId,
    'x-sender-id': senderId,
  };
  const result = await withTimeout(topic.publishMessage(draft), TINODE_REQUEST_TIMEOUT_MS, 'Tinode không phản hồi khi gửi sự kiện.');
  if (!result) throw new Error('Tinode không xác nhận sự kiện realtime.');
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
  const origin = resolveTinodeMessageOrigin(raw, client);
  const senderId = origin.senderId;
  const outgoing = origin.outgoing;
  const content = messageContent(raw);
  const call = parseCallMessage(raw.content, raw.head, !outgoing);
  const reaction = parseEvent(content, REACTION_EVENT_PREFIX);
  const recall = parseEvent(content, RECALL_EVENT_PREFIX);
  const edit = parseEvent(content, EDIT_EVENT_PREFIX);
  const system = parseEvent(content, SYSTEM_EVENT_PREFIX);
  const pollEvent = normalizePollEvent(parseEvent(content, POLL_EVENT_PREFIX));
  const attachment = rawAttachment(raw);
  const sticker = parseStickerMetadata(raw.head);
  const poll = parsePollMetadata(raw.head);
  const mentions = parseMentionMetadata(raw.head);
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
  if (edit) return {
    id, seq: raw.seq, type: 'edit', sender: outgoing ? 'outgoing' : 'incoming', senderId,
    senderName: '', text: '', createdAt: raw.ts ? new Date(raw.ts).toISOString() : undefined,
    raw: { ...raw, editEvent: edit },
  };
  if (pollEvent) return {
    id, seq: raw.seq, type: 'poll_event', sender: outgoing ? 'outgoing' : 'incoming', senderId,
    senderName: outgoing ? 'Bạn' : 'Thành viên', text: '', createdAt: raw.ts,
    pollEvent, raw,
  };
  const type = call ? 'call' : system ? 'system' : poll ? 'text' : attachment ? (sticker ? 'sticker' : attachment.isImage ? 'image' : 'file') : 'text';
  return {
    id,
    seq: Number(raw.seq) || undefined,
    type,
    sender: outgoing ? 'outgoing' : 'incoming',
    senderId: senderId || (outgoing ? client.getCurrentUserID?.() : ''),
    senderName: outgoing ? 'Bạn' : 'Thành viên',
    text: call ? callHistoryLabel(call, outgoing) : system ? formatSystemEvent(system, client) : poll ? poll.question : content,
    image: attachment?.isImage ? attachment.file.url : undefined,
    file: attachment?.file,
    sticker: sticker || undefined,
    createdAt: raw.ts ? new Date(raw.ts).toISOString() : undefined,
    time: formatMessageTime(raw.ts),
    deliveryStatus: mapTinodeDeliveryStatus(topic?.msgStatus?.(raw, false) ?? raw._status, outgoing, raw.seq, receiptCursor),
    replyTo: messageReply(raw),
    mentions,
    ...chatbot,
    systemEvent: system || undefined,
    poll: poll || undefined,
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
  const editMessages = loaded
    .filter(message => message.type === 'edit')
    .sort((first, second) => (Number(first.seq) || 0) - (Number(second.seq) || 0));
  const pollEventsById = new Map<string, ChatMessage[]>();
  loaded.filter(message => message.type === 'poll_event').forEach(message => {
    const pollId = message.pollEvent?.pollId;
    if (!pollId) return;
    pollEventsById.set(pollId, [...(pollEventsById.get(pollId) || []), message]);
  });
  const pinnedById = new Map<string, boolean>();
  const pinnedBySeq = new Map<number, boolean>();
  loaded
    .filter(message => message.type === 'system' && message.systemEvent?.action)
    .sort((first, second) => (Number(first.seq) || 0) - (Number(second.seq) || 0))
    .forEach(message => {
      const event = message.systemEvent || {};
      if (!['message_pinned', 'message_unpinned'].includes(String(event.action))) return;
      const pinned = event.action === 'message_pinned';
      const targetId = String(event.messageId || event.message_id || '').trim();
      const targetSeq = Number(event.messageSeq || event.message_seq) || 0;
      if (targetId) pinnedById.set(targetId, pinned);
      if (targetSeq > 0) pinnedBySeq.set(targetSeq, pinned);
    });
  const editsById = new Map<string, ChatMessage[]>();
  const editsBySeq = new Map<number, ChatMessage[]>();
  editMessages.forEach(message => {
    const event = message.raw?.editEvent || {};
    const targetId = String(event.targetId || '').trim();
    const targetSeq = Number(event.targetSeq) || 0;
    if (targetId) editsById.set(targetId, [...(editsById.get(targetId) || []), message]);
    if (targetSeq > 0) editsBySeq.set(targetSeq, [...(editsBySeq.get(targetSeq) || []), message]);
  });
  const appliedRecallIds = new Set<string>();
  const appliedEditIds = new Set<string>();
  const messages = loaded
    .filter(message => !['reaction', 'recall', 'edit', 'poll_event'].includes(message.type))
    .map(message => {
      const editCandidates = [
        ...(editsById.get(String(message.id || '')) || []),
        ...(editsBySeq.get(Number(message.seq) || 0) || []),
      ]
        .filter((candidate, index, all) => all.findIndex(item => item.id === candidate.id) === index)
        .sort((first, second) => (Number(first.seq) || 0) - (Number(second.seq) || 0));
      const projected = editCandidates.reduce((current, editMessage) => {
        if (!editTargetsMessage(editMessage, current) || !editActorMatchesMessage(editMessage, current)) return current;
        const next = applyEditToMessage(current, editMessage);
        if (next !== current) appliedEditIds.add(editMessage.id);
        return next;
      }, message);
      const poll = projected.poll
        ? (pollEventsById.get(projected.poll.id) || []).reduce(
          (current, eventMessage) => applyPollEvent(current, eventMessage.pollEvent, eventMessage.senderId, eventMessage.seq, members),
          normalizePoll(projected.poll),
        )
        : null;
      const latestPollEvent = projected.poll ? (pollEventsById.get(projected.poll.id) || []).at(-1)?.pollEvent : undefined;
      const withPoll = poll ? { ...projected, poll, text: poll.question, ...(latestPollEvent ? { pollActivity: latestPollEvent } : {}) } : projected;
      const pinState = pinnedById.get(String(withPoll.id)) ?? (Number(withPoll.seq) > 0 ? pinnedBySeq.get(Number(withPoll.seq)) : undefined);
      const withPin = pinState === undefined ? withPoll : { ...withPoll, pinned: pinState };
      const recall = recalls.get(String(withPin.id)) || recalls.get(`seq:${withPin.seq}`);
      const reactions: Record<string, number> = {};
      Object.entries(reactionState.get(String(projected.id)) || {}).forEach(([key, active]) => {
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
          ...withPin,
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
      return withPin.replyTo && (recalls.has(String(withPin.replyTo.id)) || recalls.has(`seq:${withPin.replyTo.id}`))
        ? { ...withPin, replyTo: undefined, reactions }
        : { ...withPin, reactions };
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
  const enrichedMessages = messages.map(message => {
    if (message.sender === 'outgoing') return message;
    const sender = members.find(member => identitiesOverlap(member, { id: message.senderId, uid: message.senderId }));
    if (!sender) return message;
    return {
      ...message,
      senderName: message.senderName === 'ThÃ nh viÃªn' || message.senderName === 'Thành viên' ? sender.name : (message.senderName || sender.name),
      avatar: message.avatar || sender.avatar,
    };
  });
  enrichedMessages.sort((a, b) => (Number(a.seq || 0) - Number(b.seq || 0)) || ((Date.parse(a.createdAt || '') || 0) - (Date.parse(b.createdAt || '') || 0)));
  const latest = enrichedMessages[enrichedMessages.length - 1];
  const latestEdit = editMessages.filter(message => appliedEditIds.has(message.id)).at(-1);
  const latestActivityAt = (Date.parse(latestEdit?.raw?.editEvent?.createdAt || latestEdit?.createdAt || '') || 0)
    > (Date.parse(latest?.createdAt || '') || 0)
    ? latestEdit?.raw?.editEvent?.createdAt || latestEdit?.createdAt
    : latest?.createdAt;
  const topicSequence = Number(topic.maxMsgSeq?.() || 0);
  const topicRead = Number(topic.read) || 0;
  const unreadEditCount = editMessages.filter(message => {
    const sequence = Number(message.seq) || 0;
    return sequence > topicRead && (!topicSequence || sequence <= topicSequence);
  }).length;
  const unreadPollEventCount = loaded.filter(message => {
    if (message.type !== 'poll_event') return false;
    const sequence = Number(message.seq) || 0;
    return sequence > topicRead && (!topicSequence || sequence <= topicSequence);
  }).length;
  const directPeer = members.find(item => item.id !== client.getCurrentUserID?.()) || members[0];
  const owner = members.find(member => String(member.mode || '').includes('O'));
  const latestGroupSettingsEvent = loaded
    .filter(message => message.type === 'system' && message.systemEvent?.action === 'group_settings_changed' && message.systemEvent?.groupSettings)
    .sort((first, second) => (Number(first.seq) || 0) - (Number(second.seq) || 0))
    .at(-1)?.systemEvent?.groupSettings;
  const rawGroupSettings = groupSettingsFromTopic(topic) || latestGroupSettingsEvent;
  return {
    id: topic.name,
    managementId: topic.name,
    tinodeTopic: topic.name,
    snapshotSource: 'tinode',
    name: String(topic.public?.fn || topic.public?.name || directPeer?.name || topic.name || 'Cuộc trò chuyện'),
    isGroup,
    adminId: owner?.id || '',
    avatarUrl: normalizeMediaValue(topic.public?.photo || topic.public?.avatar || directPeer?.avatar || ''),
    description: String(topic.public?.note || ''),
    membersCount: isGroup ? `${members.length} thành viên` : (directPeer?.online ? 'Đang hoạt động' : 'Offline'),
    ...(isGroup && rawGroupSettings ? { groupSettings: normalizeGroupSettings(rawGroupSettings) } : {}),
    members,
    participantIds: members.map(member => member.id),
    messages: enrichedMessages,
    readSeq: topicRead,
    lastMsg: latest?.poll
      ? `Bình chọn: ${latest.poll.question}`
      : latest?.sticker
      ? `${latest.sender === 'outgoing' ? 'Bạn' : 'Thành viên'} đã gửi sticker`
      : latest?.file ? `${latest.sender === 'outgoing' ? 'Bạn' : 'Thành viên'} đã gửi tệp` : latest?.text || '',
    time: latest?.time || '',
    updatedAt: latestActivityAt,
    // Edit packets are stored in Tinode history but are control data, not
    // user-facing messages, so they must not add unread state.
    badge: Math.max(0, Number(topic.unread || 0) - unreadEditCount - unreadPollEventCount),
  };
}

export class TinodeMobileClient {
  private client: any = null;
  private meTopic: any = null;
  private listeners = new Set<Listener>();
  private intentionalDisconnect = false;
  private backgroundSuspended = false;
  private auth: TinodeAuth | null = null;
  private tokenProvider: (() => Promise<TinodeAuth>) | null = null;
  private topics = new Map<string, any>();
  private presenceByUid = new Map<string, boolean>();
  private receiptCursors = new Map<string, ReceiptCursor>();
  private notifiedSeqByTopic = new Map<string, number>();
  private deviceToken: string | null = null;
  private blockedTopics = new Set<string>();
  private allowedConversationTopics: Set<string> | null = null;
  private callInviteKeys = new Set<string>();
  private topicSubscriptionRequests = new Map<string, Promise<Conversation | null>>();
  private snapshotTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private historyRequests = new Map<string, Promise<{ conversation: Conversation; hasEarlier: boolean; loaded: number }>>();
  private sessionGeneration = 0;
  private syncAbortController: AbortController | null = null;
  private lifecycleVersion = 0;
  private currentIdentitySnapshot: CurrentIdentity | null = null;

  onEvent(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setTokenProvider(provider: (() => Promise<TinodeAuth>) | null) {
    this.tokenProvider = provider;
  }

  setCurrentIdentity(identity: CurrentIdentity | null) {
    this.currentIdentitySnapshot = identity;
  }

  setSessionGeneration(generation: number) {
    const next = Math.max(0, Math.trunc(Number(generation) || 0));
    if (next === this.sessionGeneration) return;
    this.syncAbortController?.abort();
    this.syncAbortController = null;
    this.sessionGeneration = next;
  }

  cancelSync(generation?: number) {
    if (generation !== undefined && generation !== this.sessionGeneration) return;
    this.syncAbortController?.abort();
    this.syncAbortController = null;
  }

  private isGenerationCurrent(generation?: number, signal?: AbortSignal) {
    return !signal?.aborted && (generation === undefined || generation === this.sessionGeneration);
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

  disallowConversationTopic(topicName: string) {
    const name = String(topicName || '');
    if (!name) return;
    this.allowedConversationTopics?.delete(name);
    this.blockedTopics.add(name);
    const topic = this.topics.get(name);
    if (topic?.leave) Promise.resolve(topic.leave(true)).catch(() => {});
    this.topics.delete(name);
  }

  setAllowedConversationTopics(topicNames: string[] = []) {
    const nextAllowedTopics = new Set(topicNames.filter(Boolean).map(String));
    this.allowedConversationTopics = nextAllowedTopics;
    this.topics.forEach((topic, topicName) => {
      if (nextAllowedTopics.has(topicName)) {
        this.blockedTopics.delete(topicName);
        return;
      }
      this.blockedTopics.add(topicName);
      Promise.resolve(topic?.leave?.(true)).catch(() => {});
      this.topics.delete(topicName);
    });
  }

  allowConversationTopic(topicName: string) {
    const name = String(topicName || '');
    if (!name) return;
    this.allowedConversationTopics?.add(name);
    this.blockedTopics.delete(name);
  }

  isConversationTopicAllowed(topicName: string) {
    const name = String(topicName || '');
    return Boolean(name && !this.blockedTopics.has(name)
      && (this.allowedConversationTopics === null || this.allowedConversationTopics.has(name)));
  }

  private materialize(topic: any) {
    return materializeConversation(topic, this.client, (uid, fallback) => this.getPresenceStatus(uid, fallback), this.receiptCursors.get(topic?.name));
  }

  private scheduleConversationSnapshot(topic: any) {
    const name = String(topic?.name || '');
    if (!name || !this.isConversationTopicAllowed(name) || topic?.__vichatMobileSyncing || this.snapshotTimers.has(name)) return;
    const timer = setTimeout(() => {
      this.snapshotTimers.delete(name);
      if (!this.isConversationTopicAllowed(name) || !this.client) return;
      this.emit({ type: 'conversation', conversation: this.materialize(topic) });
    }, 0);
    this.snapshotTimers.set(name, timer);
  }

  private emitIncomingMessage(topic: any, raw: any, conversation?: Conversation) {
    if (!this.isConversationTopicAllowed(topic?.name)) return;
    // A server echo may expose a different `from` alias than the sender header.
    // Never turn an own echo into a local incoming notification.
    // Check both Tinode UID and Account ID to cover all sender header formats.
    if (isOwnMessageOrigin(raw, this.client, this.currentIdentitySnapshot)) return;
    const message = normalizeMessage(raw, this.client, topic);
    if (!message || message.sender !== 'incoming' || ['reaction', 'recall', 'edit', 'poll_event', 'system'].includes(message.type)) return;
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
    this.deviceToken = String(token || '').trim() || null;
    return Boolean(this.client?.setDeviceToken?.(this.deviceToken));
  }

  async cacheImage(value: string) {
    const url = normalizeMediaUrl(value);
    if (!url || /^(?:data:|file:|content:)/i.test(url)) return url;
    // Tinode can reuse the same protected path after an avatar replacement.
    // Include the current auth token in the cache key so native images do not
    // remain stuck on the previous avatar.
    const chatMediaReference = isChatMediaReference(url);
    const token = chatMediaReference ? '' : this.client?.getAuthToken?.()?.token || '';
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
        const downloadUrl = chatMediaReference
          ? await resolveChatMediaDownloadUrl(url)
          : url;
        const download = () => fileSystem.File.downloadFileAsync(downloadUrl, target, {
          headers: chatMediaReference ? {} : this.getMediaHeaders(),
          idempotent: true,
        });
        let downloaded;
        try {
          downloaded = await download();
        } catch (error: any) {
          // Protected media can outlive the short Tinode token; renew once,
          // then retry the same request without hiding other download errors.
          if (chatMediaReference || !shouldRetryProtectedMedia(error)) throw error;
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
    if (!file?.url) throw new Error('Tệp chưa có đường dẫn tải xuống.');
    const safeName = String(file.name || 'tep-dinh-kem').replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileSystem: any = require('expo-file-system');
    const sharing: any = require('expo-sharing');
    if (!fileSystem.File?.downloadFileAsync || !fileSystem.Paths?.cache) throw new Error('Bộ nhớ tải tệp chưa sẵn sàng.');
    const target = new fileSystem.File(fileSystem.Paths.cache, `vichat-${Date.now()}-${safeName}`);
    const chatMediaReference = isChatMediaReference(file.url);
    const downloadUrl = chatMediaReference
      ? await resolveChatMediaDownloadUrl(file.url, { download: true, fileName: file.name })
      : file.url;
    const download = () => fileSystem.File.downloadFileAsync(downloadUrl, target, {
      headers: chatMediaReference ? {} : this.getMediaHeaders(),
      idempotent: true,
    });
    let downloaded;
    try {
      downloaded = await download();
    } catch (error) {
      if (chatMediaReference || !shouldRetryProtectedMedia(error)) throw error;
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
      if (!this.isConversationTopicAllowed(topic.name)) return;
      // Tinode delivers every packet in a history query through onData. Do not
      // rebuild the complete conversation once per packet while catching up.
      if (topic.__vichatMobileSyncing) return;
      if (!raw?.from || !this.client?.isMe?.(raw.from)) this.acknowledgeTopicReceived(topic, raw?.seq);
      this.emitCallInvite(topic, raw);
      const conversation = this.materialize(topic);
      this.emit({ type: 'conversation', conversation });
      this.emitIncomingMessage(topic, raw, conversation);
    };
    topic.onMetaDesc = () => {
      this.scheduleConversationSnapshot(topic);
    };
    topic.onMetaSub = () => {
      this.scheduleConversationSnapshot(topic);
    };
    topic.onSubsUpdated = () => {
      this.scheduleConversationSnapshot(topic);
    };
    topic.onPres = (presence: any) => {
      if (!this.isConversationTopicAllowed(topic.name)) return;
      this.updatePresence(presence);
    };
    topic.onInfo = (info: any) => {
      if (!this.isConversationTopicAllowed(topic.name)) return;
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
        this.scheduleConversationSnapshot(topic);
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
    if (!entity || !/^usr[a-z0-9_-]+$/i.test(String(topic.name || '')) || this.callInviteKeys.has(key)) return;
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
    const lifecycleVersion = this.lifecycleVersion;
    const assertCurrent = () => {
      if (lifecycleVersion !== this.lifecycleVersion) throw new Error('Tinode connection was cancelled.');
    };
    await loadTinodeSdk();
    assertCurrent();
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
    // Put the device token into Tinode before the first hello packet. If the
    // app is backgrounded immediately after login, the server has already
    // received the token instead of relying on a last-second hi update.
    const tokenAtConnectStart = this.deviceToken;
    if (tokenAtConnectStart) this.client.setDeviceToken?.(tokenAtConnectStart);
    this.emit({ type: 'connection', state: 'connecting' });
    if (!this.client.isConnected()) {
      await withTimeout(this.client.connect(), TINODE_REQUEST_TIMEOUT_MS, 'Tinode không phản hồi khi kết nối.');
    }
    assertCurrent();
    const fresh = auth.token || (await this.tokenProvider()).token;
    assertCurrent();
    await withTimeout(this.client.loginToken(fresh), TINODE_REQUEST_TIMEOUT_MS, 'Tinode không phản hồi khi đăng nhập.');
    assertCurrent();
    this.auth = { ...auth, token: fresh };
    const tokenAfterLogin = this.deviceToken;
    if (tokenAfterLogin) {
      // A native token may arrive while connect/login is in flight. Force one
      // authenticated update when it was not present in the initial hello.
      if (tokenAfterLogin !== tokenAtConnectStart) this.client.setDeviceToken?.(null);
      this.client.setDeviceToken?.(tokenAfterLogin);
    }
    this.meTopic = this.client.getMeTopic();
    this.meTopic.onMetaSub = (contact: any) => {
      this.emitContactProfile(contact);
      this.updateContactPresence(contact);
      const topic = this.topics.get(String(contact?.name || ''));
      if (topic) this.scheduleConversationSnapshot(topic);
    };
    this.meTopic.onSubsUpdated = () => this.syncPresenceSnapshot();
    this.meTopic.onContactUpdate = (what: string, contact: any) => {
      this.emitContactProfile(contact);
      this.updateContactPresence(contact, what);
      const topic = this.topics.get(String(contact?.name || ''));
      if (topic) this.scheduleConversationSnapshot(topic);
      const topicName = String(contact?.name || '');
      if (what === 'msg'
        && contact?.isCommType?.()
        && this.allowedConversationTopics?.has(topicName)
        && Number(contact?.seq || 0) > Number(topic?.maxMsgSeq?.() || 0)) {
        void this.subscribeTopic(topicName, BACKGROUND_HISTORY_LIMIT, {
          emitSnapshot: true,
          newerOnly: true,
        }).catch(() => {});
      }
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
      await withTimeout(
        this.meTopic.subscribe(this.meTopic.startMetaQuery().withDesc().withSub().build()),
        TINODE_REQUEST_TIMEOUT_MS,
        'Tinode không phản hồi khi đồng bộ danh bạ.',
      );
    }
    assertCurrent();
    this.syncPresenceSnapshot(true);
    this.emit({ type: 'connection', state: 'connected' });
  }

  async reconnect() {
    if (!this.auth) return new Set<string>();
    const resumedFromBackground = this.backgroundSuspended;
    if (resumedFromBackground) {
      this.intentionalDisconnect = false;
    }
    if (this.intentionalDisconnect) return new Set<string>();
    try {
      const auth = this.tokenProvider ? await this.tokenProvider() : this.auth;
      await this.connect(auth, this.tokenProvider || (async () => auth));
      this.backgroundSuspended = false;
      // Generation-aware sync is owned by the store so reconnect callers do
      // not create a second history worker.
      return new Set<string>();
    } catch (error) {
      if (resumedFromBackground) this.intentionalDisconnect = true;
      this.emit({ type: 'connection', state: 'error', error });
      return new Set<string>();
    }
  }

  async suspendForBackground() {
    if (!this.auth || !this.client || this.backgroundSuspended) return;
    // Keep the realtime fallback alive until native push registration succeeds.
    // Disconnecting without a device token would guarantee missed background alerts.
    if (!this.deviceToken) return;
    this.backgroundSuspended = true;
    this.intentionalDisconnect = true;
    this.client.disconnect?.();
    this.emit({ type: 'connection', state: 'disconnected' });
  }

  async disconnect() {
    this.lifecycleVersion += 1;
    this.cancelSync();
    this.backgroundSuspended = false;
    this.intentionalDisconnect = true;
    this.client?.setDeviceToken?.(null);
    this.deviceToken = null;
    this.auth = null;
    this.meTopic = null;
    this.topics.clear();
    this.presenceByUid.clear();
    this.receiptCursors.clear();
    this.notifiedSeqByTopic.clear();
    this.blockedTopics.clear();
    this.allowedConversationTopics = null;
    this.callInviteKeys.clear();
    this.topicSubscriptionRequests.clear();
    this.historyRequests.clear();
    this.snapshotTimers.forEach(timer => clearTimeout(timer));
    this.snapshotTimers.clear();
    imageCacheRequests.clear();
    imageCacheVersions.clear();
    this.client?.disconnect?.();
    this.client = null;
    this.emit({ type: 'connection', state: 'disconnected' });
  }

  async subscribeTopic(name: string, historyLimit = INITIAL_HISTORY_LIMIT, options: TopicOptions = {}): Promise<Conversation | null> {
    if (!this.isGenerationCurrent(options.generation, options.signal)) return null;
    this.allowConversationTopic(name);
    if (!this.connected || !name) throw new Error('Tinode chưa kết nối.');
    const inFlight = this.topicSubscriptionRequests.get(name);
    if (inFlight) {
      await inFlight;
      if (this.topicSubscriptionRequests.get(name) === inFlight) this.topicSubscriptionRequests.delete(name);
      return this.subscribeTopic(name, historyLimit, options);
    }
    const request = this.subscribeTopicInternal(name, historyLimit, options);
    this.topicSubscriptionRequests.set(name, request);
    try {
      return await request;
    } finally {
      if (this.topicSubscriptionRequests.get(name) === request) this.topicSubscriptionRequests.delete(name);
    }
  }

  private async subscribeTopicInternal(name: string, historyLimit = INITIAL_HISTORY_LIMIT, options: TopicOptions = {}) {
    const emitSnapshot = options.emitSnapshot !== false;
    if (!this.isGenerationCurrent(options.generation, options.signal)) return null;
    this.allowConversationTopic(name);
    if (!this.connected || !name) throw new Error('Tinode chưa kết nối.');
    const topic = this.getTopic(name);
    const initialized = Boolean(topic.__vichatMobileInitialized);
    const historyLoaded = Boolean(topic.__vichatMobileHistoryLoaded);
    const loadedHistoryLimit = Number(topic.__vichatMobileHistoryLimit || 0);
    const previousMaxSeq = Number(topic.maxMsgSeq?.() || 0);
    topic.__vichatMobileSyncing = true;
    try {
      if (!topic.isSubscribed?.()) {
        const query = topic.startMetaQuery().withDesc().withSub();
        if (historyLimit > 0) {
          if ((options.newerOnly === true || historyLoaded) && previousMaxSeq > 0) query.withLaterData(historyLimit).withLaterDel(historyLimit);
          else query.withEarlierData(historyLimit).withDel(undefined, historyLimit);
        }
        await withTimeout(topic.subscribe(query.build()), TINODE_REQUEST_TIMEOUT_MS, 'Tinode không phản hồi khi mở cuộc trò chuyện.');
      } else if (historyLimit > 0 && !historyLoaded) {
        await withTimeout(
          topic.getMeta(topic.startMetaQuery().withEarlierData(historyLimit).withDel(undefined, historyLimit).build()),
          TINODE_REQUEST_TIMEOUT_MS,
          'Tinode không phản hồi khi tải lịch sử trò chuyện.',
        );
      } else if (historyLimit > loadedHistoryLimit) {
        await withTimeout(
          topic.getMeta(topic.startMetaQuery().withEarlierData(historyLimit).withDel(undefined, historyLimit).build()),
          TINODE_REQUEST_TIMEOUT_MS,
          'Tinode không phản hồi khi tải lịch sử trò chuyện.',
        );
      }
    } finally {
      topic.__vichatMobileSyncing = false;
    }
    if (!this.isGenerationCurrent(options.generation, options.signal)) return null;
    if (historyLimit > 0) {
      topic.__vichatMobileHistoryLoaded = true;
      topic.__vichatMobileHistoryLimit = Math.max(loadedHistoryLimit, historyLimit);
    }
    const latestSeq = Number(topic.maxMsgSeq?.() || 0);
    this.acknowledgeTopicReceived(topic);
    topic.__vichatMobileInitialized = true;
    let conversation: Conversation | null = null;
    if (emitSnapshot) {
      conversation = this.materialize(topic);
      this.emit({ type: 'conversation', conversation });
      if (!initialized) {
        this.notifiedSeqByTopic.set(name, latestSeq);
      } else if (latestSeq > previousMaxSeq && options.notifyMissed !== false) {
        const missed = conversation.messages.filter(message =>
          message.sender === 'incoming'
          && !['reaction', 'recall', 'edit', 'poll_event', 'system'].includes(message.type)
          && Number(message.seq || 0) > previousMaxSeq,
        ).slice(-20);
        if (missed.length > 0) missed.forEach(message => this.emitIncomingMessage(topic, message.raw, conversation || undefined));
        else this.notifiedSeqByTopic.set(name, latestSeq);
      } else if (latestSeq > previousMaxSeq) {
        this.notifiedSeqByTopic.set(name, latestSeq);
      }
    } else if (!initialized) {
      this.notifiedSeqByTopic.set(name, latestSeq);
    }
    return conversation;
  }

  async syncTopics(names: string[], options: { historyLimit?: number; emitSnapshot?: boolean; concurrency?: number; newerOnly?: boolean; notifyMissed?: boolean; generation?: number; signal?: AbortSignal } = {}) {
    if (!this.isGenerationCurrent(options.generation, options.signal)) return new Set<string>();
    const uniqueNames = [...new Set(names.filter(name => name && this.isConversationTopicAllowed(name)))];
    const historyLimit = Math.max(0, Math.min(100, Math.trunc(Number(options.historyLimit ?? 0))));
    const concurrency = Math.max(1, Math.min(3, Math.trunc(Number(options.concurrency ?? 2))));
    const controller = new AbortController();
    this.syncAbortController?.abort();
    this.syncAbortController = controller;
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const completed = new Set<string>();
    let cursor = 0;
    const worker = async () => {
      while (cursor < uniqueNames.length) {
        if (!this.isGenerationCurrent(options.generation, controller.signal)) return;
        const index = cursor;
        cursor += 1;
        const name = uniqueNames[index];
        try {
          await this.subscribeTopic(name, historyLimit, {
            emitSnapshot: options.emitSnapshot === true,
            newerOnly: options.newerOnly === true,
            notifyMissed: options.notifyMissed !== false,
            generation: options.generation,
            signal: controller.signal,
          });
          completed.add(name);
        } catch {
          // A single stale topic must not block the rest of the mobile app.
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, uniqueNames.length) }, () => worker()));
    if (this.syncAbortController === controller) this.syncAbortController = null;
    return completed;
  }

  openConversation(name: string) { return this.subscribeTopic(name, OPEN_HISTORY_LIMIT); }

  getCallIceServers() {
    const servers = this.client?.getServerParam?.('iceServers', []);
    return normalizeIceServers(servers);
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
    await this.subscribeTopic(topicName, 0, { emitSnapshot: false });
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
    await this.subscribeTopic(topicName, 0, { emitSnapshot: false });
    await this.getTopic(topicName).videoCall(event, Number(seq), payload);
  }

  async sendText(topicName: string, text: string, clientId: string, replyTo?: ChatMessage['replyTo'], mentions: any[] = []) {
    await this.subscribeTopic(topicName, 0, { emitSnapshot: false });
    const topic = this.getTopic(topicName);
    const draft = topic.createMessage(text, false);
    draft.head = { ...(draft.head || {}), 'x-client-id': clientId, 'x-sender-id': this.currentUserId };
    if (replyTo?.id) draft.head['x-reply-to'] = JSON.stringify(replyTo);
    if (Array.isArray(mentions) && mentions.length > 0) draft.head['x-mentions'] = JSON.stringify(mentions.slice(0, 50));
    const result = await withTimeout(topic.publishMessage(draft), TINODE_REQUEST_TIMEOUT_MS, 'Tinode không phản hồi khi gửi tin nhắn.');
    if (!result) throw new Error('Tinode không xác nhận tin nhắn.');
    return result;
  }

  async loadEarlierConversation(topicName: string, limit = HISTORY_PAGE_LIMIT, generation = this.sessionGeneration) {
    const previous = this.historyRequests.get(topicName);
    if (previous) return previous;
    const request = this.loadEarlierConversationInternal(topicName, limit, generation);
    this.historyRequests.set(topicName, request);
    try {
      return await request;
    } finally {
      if (this.historyRequests.get(topicName) === request) this.historyRequests.delete(topicName);
    }
  }

  private async loadEarlierConversationInternal(topicName: string, limit = HISTORY_PAGE_LIMIT, generation = this.sessionGeneration) {
    await this.subscribeTopic(topicName, 0, { emitSnapshot: false, generation });
    if (!this.isGenerationCurrent(generation)) throw new Error('Tinode history request is stale.');
    const topic = this.getTopic(topicName);
    const before = Number(topic.minMsgSeq?.() || topic._minSeq || 0);
    if (before <= 1) return { conversation: this.materialize(topic), hasEarlier: false, loaded: 0 };
    const boundedLimit = Math.max(1, Math.min(50, Math.trunc(Number(limit) || HISTORY_PAGE_LIMIT)));
    const query = topic.startMetaQuery().withEarlierData(boundedLimit);
    if (typeof query.withDel === 'function') query.withDel(undefined, boundedLimit);
    // Tinode delivers each history packet through onData. Suppress those
    // intermediate snapshots and publish one stable page after the query.
    const wasSyncing = Boolean(topic.__vichatMobileSyncing);
    topic.__vichatMobileSyncing = true;
    try {
      await withTimeout(topic.getMeta(query.build()), TINODE_REQUEST_TIMEOUT_MS, 'Tinode không phản hồi khi tải lịch sử trò chuyện.');
    } finally {
      topic.__vichatMobileSyncing = wasSyncing;
    }
    if (!this.isGenerationCurrent(generation)) throw new Error('Tinode history request is stale.');
    const after = Number(topic.minMsgSeq?.() || topic._minSeq || 0);
    const conversation = this.materialize(topic);
    this.emit({ type: 'conversation', conversation });
    return { conversation, hasEarlier: after > 1 && after < before, loaded: Math.max(0, before - after) };
  }

  async sendTyping(topicName: string) {
    await this.subscribeTopic(topicName, 0, { emitSnapshot: false });
    const topic = this.getTopic(topicName);
    topic.noteKeyPress?.();
  }

  async markRead(topicName: string) {
    await this.subscribeTopic(topicName, 0, { emitSnapshot: false });
    const topic = this.getTopic(topicName);
    topic.noteRead?.();
  }

  async sendReaction(topicName: string, message: ChatMessage, emoji: string) {
    if (message.recalled) throw new Error('Tin nhắn đã được thu hồi và không thể biểu cảm.');
    await this.subscribeTopic(topicName, 0, { emitSnapshot: false });
    const topic = this.getTopic(topicName);
      await withTimeout(topic.publish(`${REACTION_EVENT_PREFIX}${JSON.stringify({
      targetId: message.id,
      emoji: emoji.slice(0, 8),
      actorId: this.currentUserId,
      active: true,
      })}`), TINODE_REQUEST_TIMEOUT_MS, 'Tinode không phản hồi khi gửi biểu cảm.');
  }

  async sendSystemEvent(topicName: string, event: Record<string, unknown>, clientId = `mobile-system-${Date.now()}`) {
    await this.subscribeTopic(topicName, 0, { emitSnapshot: false });
    const topic = this.getTopic(topicName);
    const payload = {
      ...event,
      actorId: event.actorId || this.currentUserId,
    };
    return publishControlEvent(
      topic,
      `${SYSTEM_EVENT_PREFIX}${JSON.stringify(payload)}`,
      clientId,
      this.currentUserId,
    );
  }

  async sendPoll(topicName: string, poll: { id?: string; question: string; options: Array<{ id?: string; text: string }>; settings?: unknown }, clientId: string) {
    await this.subscribeTopic(topicName, 0, { emitSnapshot: false });
    const topic = this.getTopic(topicName);
    if (!topic.isGroupType?.() && !String(topic.name || '').startsWith('grp')) throw new Error('Bình chọn chỉ khả dụng trong nhóm.');
    const actorId = this.currentUserId;
    const normalized = normalizePoll({
      ...poll,
      id: poll.id || `poll-${actorId}-${Date.now()}`,
      creatorId: actorId,
      options: poll.options.map((option, index) => ({ id: option.id || `option-${index + 1}`, text: option.text })),
    });
    if (!normalized) throw new Error('Bình chọn không hợp lệ.');
    const draft = topic.createMessage(normalized.question, false);
    draft.head = {
      ...(draft.head || {}),
      [POLL_HEAD]: JSON.stringify(normalized),
      'x-client-id': clientId,
      'x-sender-id': actorId,
    };
    const result: any = await withTimeout(topic.publishMessage(draft), TINODE_REQUEST_TIMEOUT_MS, 'Tinode không phản hồi khi gửi bình chọn.');
    if (!result) throw new Error('Tinode không xác nhận bình chọn.');
    return { poll: normalized, seq: publishSequence(result) };
  }

  async sendPollEvent(topicName: string, event: { action: 'poll_vote' | 'poll_option_added' | 'poll_locked'; pollId: string; optionIds?: string[]; optionId?: string; optionText?: string }, clientId: string) {
    await this.subscribeTopic(topicName, 0, { emitSnapshot: false });
    const topic = this.getTopic(topicName);
    if (!topic.isGroupType?.() && !String(topic.name || '').startsWith('grp')) throw new Error('Bình chọn chỉ khả dụng trong nhóm.');
    const normalized = normalizePollEvent({ ...event, actorId: this.currentUserId, createdAt: new Date().toISOString() });
    if (!normalized) throw new Error('Sự kiện bình chọn không hợp lệ.');
    await publishControlEvent(topic, `${POLL_EVENT_PREFIX}${JSON.stringify(normalized)}`, clientId, this.currentUserId);
    return normalized;
  }

  async editMessage(topicName: string, message: ChatMessage, text: string, mentions: any[] = []) {
    if (!canEditMessage(message)) throw new Error('Chỉ có thể sửa tin nhắn văn bản đã gửi thành công.');
    if (message.sender !== 'outgoing' || !this.client?.isMe?.(message.senderId)) {
      throw new Error('Chỉ người gửi mới có thể sửa tin nhắn này.');
    }
    const nextText = String(text || '').trim();
    if (!nextText) throw new Error('Nội dung sửa không được để trống.');
    await this.subscribeTopic(topicName, 0, { emitSnapshot: false });
    const topic = this.getTopic(topicName);
    const event = buildEditEvent(message, this.currentUserId, nextText, mentions);
    if (!event.targetId && !event.targetSeq) throw new Error('Tin nhắn không có định danh để sửa.');
    const clientId = `mobile-edit-${event.targetSeq || event.targetId}-${Date.now()}`;
    let content = `${EDIT_EVENT_PREFIX}${JSON.stringify(event)}`;
    if (utf8ByteLength(content) > CENTRAL_MESSAGE_TEXT_LIMIT) {
      const compactEvent: Record<string, unknown> = { ...event };
      delete compactEvent.previousText;
      delete compactEvent.previousMentions;
      content = `${EDIT_EVENT_PREFIX}${JSON.stringify(compactEvent)}`;
    }
    if (utf8ByteLength(content) > CENTRAL_MESSAGE_TEXT_LIMIT) {
      throw new Error('Tin nhắn sửa vượt quá giới hạn 120 KB của máy chủ Tinode.');
    }
    const result = await publishControlEvent(
      topic,
      content,
      clientId,
      this.currentUserId,
    );
    const sequence = publishSequence(result);
    return { ...event, eventId: clientId, ...(sequence > 0 ? { seq: sequence } : {}) };
  }

  async recallMessage(topicName: string, message: ChatMessage, mode: RecallMode = 'all') {
    if (!canRecallMessage(message)) throw new Error('Chỉ có thể thu hồi sau khi tin nhắn đã gửi thành công.');
    if (message.sender !== 'outgoing' || !this.client.isMe?.(message.senderId)) throw new Error('Chỉ người gửi mới có thể thu hồi tin nhắn này.');
    await this.subscribeTopic(topicName, 0, { emitSnapshot: false });
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

  private async uploadTinodeFile(file: PickerFile, topicName = '') {
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

  private async uploadFile(file: PickerFile, topicName = '', conversationId = '', requireConversation = false) {
    if (Number(file.size) > config.maxAttachmentBytes) throw new Error('File hoặc ảnh không được lớn hơn 500 MB.');
    if (config.chatMediaStorage !== 's3') return this.uploadTinodeFile(file, topicName);
    const scopedConversationId = String(conversationId || '').trim();
    if (!scopedConversationId) {
      if (requireConversation) throw new Error('Thiếu cuộc trò chuyện để tải file lên S3.');
      // Account/Tinode profile fallback remains available when the Account
      // avatar contract rejects an upload; chat media must stay conversation-scoped.
      return this.uploadTinodeFile(file, topicName);
    }
    try {
      return normalizeMediaUrl(await uploadChatMedia(file, { conversationId: scopedConversationId }));
    } catch (error) {
      if (!shouldFallbackToTinodeMedia(error)) throw error;
      return this.uploadTinodeFile(file, topicName);
    }
  }

  async uploadGroupAvatar(topicName: string, file: PickerFile, conversationId: string) {
    if (!topicName || !file) throw new Error('Vui lòng chọn ảnh nhóm.');
    if (!conversationId) throw new Error('Nhóm chưa có định danh Chatmgt để lưu ảnh S3.');
    await this.subscribeTopic(topicName, 0, { emitSnapshot: false });
    return this.uploadFile(file, topicName, conversationId, true);
  }

  async bindChatMediaReference(value: string, conversationId: string, messageRef: string) {
    if (!isChatMediaReference(value)) return null;
    return bindChatMedia(value, { conversationId, messageRef });
  }

  async discardChatMediaReference(value: string, conversationId: string) {
    if (!isChatMediaReference(value)) return null;
    return discardChatMedia(value, { conversationId });
  }

  async updateGroupMetadata(topicName: string, input: { name?: string; avatar?: string; settings?: unknown } = {}) {
    if (!topicName) throw new Error('Nhóm chưa có topic Tinode.');
    await this.subscribeTopic(topicName, 0, { emitSnapshot: false });
    const topic = this.getTopic(topicName);
    const publicData = { ...(topic.public || {}) };
    if (input.name !== undefined) {
      const name = String(input.name || '').trim();
      if (!name) throw new Error('Tên nhóm không được để trống.');
      publicData.fn = name;
    }
    if (input.avatar !== undefined && String(input.avatar || '').trim()) publicData.photo = { ref: String(input.avatar).trim() };
    await topic.setMeta({ desc: { public: publicData } });
    return this.materialize(topic);
  }

  private async stickerFile(sticker: Sticker): Promise<PickerFile> {
    const rawSource = String(sticker.src || '').trim();
    const source = /^https?:\/\//i.test(rawSource)
      ? rawSource
      : `${config.stickerBase}/${rawSource.replace(/^\/+/, '')}`;
    const mime = String(sticker.mime || 'image/png').toLowerCase();
    if (!/^image\/(?:avif|gif|jpeg|png|webp)$/i.test(mime)) throw new Error('Sticker không hợp lệ.');
    const fileSystem: any = require('expo-file-system');
    if (!fileSystem.File?.downloadFileAsync || !fileSystem.Paths?.cache) throw new Error('Bộ nhớ sticker chưa sẵn sàng.');
    const safeId = String(sticker.id || 'sticker').replace(/[^a-z0-9_-]/gi, '-').slice(0, 80);
    const extension = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1];
    const target = new fileSystem.File(fileSystem.Paths.cache, `vichat-sticker-${safeId}.${extension}`);
    const downloaded = await fileSystem.File.downloadFileAsync(source, target, { idempotent: true });
    const size = Number(downloaded?.size || downloaded?.fileSize || target?.size || 0);
    if (size > STICKER_MAX_BYTES) throw new Error('Moi sticker phai nho hon hoac bang 2 MB.');
    return {
      uri: downloaded.uri,
      name: sticker.fileName || `${safeId}.${extension}`,
      type: mime,
      ...(size > 0 ? { size } : {}),
    };
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
    conversationId = '',
  }: {
    name: string;
    description?: string;
    memberIds?: string[];
    avatarFile?: PickerFile | null;
    conversationId?: string;
  }) {
    if (!this.client) throw new Error('Tinode chưa kết nối.');
    const topic = this.wireTopic(this.client.getTopic(this.client.newGroupTopicName(false)));
    await topic.subscribe(
      topic.startMetaQuery().withDesc().withSub().build(),
      { desc: { public: { fn: name, note: description }, defacs: { auth: 'N', anon: 'N' } } },
    );
    let avatarUrl = '';
    if (avatarFile) {
      avatarUrl = await this.uploadFile(avatarFile, topic.name, conversationId, true);
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

  async sendFile(topicName: string, file: PickerFile, clientId: string, metadata: { conversationId?: string; sticker?: ChatMessage['sticker'] } = {}) {
    if (Number(file.size) > config.maxAttachmentBytes) throw new Error('File hoặc ảnh không được lớn hơn 500 MB.');
    await this.subscribeTopic(topicName, 0, { emitSnapshot: false });
    const topic = this.getTopic(topicName);
    const mime = file.type || 'application/octet-stream';
    const filename = file.name || 'Tệp đính kèm';
    const isImage = /^image\//i.test(mime) || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(filename);
    if (!Drafty || (isImage ? !Drafty.appendImage : !Drafty.attachFile)) throw new Error('Tinode SDK không hỗ trợ file trên thiết bị này.');
    const conversationId = String(metadata.conversationId || '').trim();
    const url = await this.uploadFile(file, topicName, conversationId, true);
    const attachment = { mime, filename, refurl: url, size: file.size || 0 };
    const content = isImage ? Drafty.appendImage(null, attachment) : Drafty.attachFile(null, attachment);
    const draft = topic.createMessage(content, false);
    draft.head = { ...(draft.head || {}), 'x-client-id': clientId, 'x-sender-id': this.currentUserId };
    if (metadata.sticker?.stickerId && metadata.sticker.packId) {
      draft.head[STICKER_HEAD] = JSON.stringify({
        stickerId: String(metadata.sticker.stickerId).slice(0, 80),
        packId: String(metadata.sticker.packId).slice(0, 80),
        label: String(metadata.sticker.label || '').slice(0, 120),
        version: String(metadata.sticker.version || '1').slice(0, 24),
      });
    }
    let result: any;
    try {
      result = await withTimeout(topic.publishMessage(draft), TINODE_REQUEST_TIMEOUT_MS, 'Tinode không phản hồi khi gửi tệp.');
    } catch (error) {
      await this.discardChatMediaReference(url, conversationId).catch(() => {});
      throw error;
    }
    if (!result) {
      await this.discardChatMediaReference(url, conversationId).catch(() => {});
      throw new Error('Tinode không xác nhận tệp đính kèm.');
    }
    if (isChatMediaReference(url) && conversationId) {
      const messageRef = String(clientId || publishSequence(result) || '').trim();
      if (messageRef) {
        // Binding is idempotent; keep a published message visible if this
        // follow-up is temporarily unavailable and let the backend retry path handle it.
        await this.bindChatMediaReference(url, conversationId, messageRef).catch(() => {});
      }
    }
    return { url: normalizeMediaUrl(url), file: { name: attachment.filename, mime: attachment.mime, size: attachment.size, url: normalizeMediaUrl(url) } };
  }

  async sendSticker(topicName: string, sticker: Sticker, clientId: string, metadata: { conversationId?: string } = {}) {
    if (!sticker?.id || !sticker?.packId || !sticker?.src) throw new Error('Sticker không hợp lệ.');
    const file = await this.stickerFile(sticker);
    return this.sendFile(topicName, file, clientId, {
      conversationId: metadata.conversationId,
      sticker: {
        id: sticker.id,
        stickerId: sticker.id,
        packId: sticker.packId,
        label: sticker.label,
        version: sticker.version || '1',
      },
    });
  }
}

export const tinodeClient = new TinodeMobileClient();
