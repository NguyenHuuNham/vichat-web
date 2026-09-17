const env = import.meta.env || {};

export const EXTERNAL_CHAT_ONLY = String(env.VITE_CHAT_MODE || 'internal').toLowerCase() === 'external';
export const CHATBOT_DEFAULT_AVATAR = '/vichat-ai.svg';

export const CHATBOT_STARTER_PROMPTS = [
  {
    icon: 'fa-file-lines',
    title: 'Trích lọc tài liệu',
    hint: 'Điền tên tài liệu để tìm ý liên quan',
    prompt: 'Trích lọc các ý chính trong tài liệu về [tên tài liệu hoặc chủ đề], kèm nguồn để kiểm tra.',
  },
  {
    icon: 'fa-route',
    title: 'Tìm đúng quy trình',
    hint: 'Tra cứu theo công việc hoặc phòng ban',
    prompt: 'Tìm quy trình về [công việc hoặc phòng ban] và trích dẫn các bước cần thực hiện.',
  },
  {
    icon: 'fa-scale-balanced',
    title: 'Tra cứu chính sách',
    hint: 'Tìm điều kiện, phạm vi và lưu ý',
    prompt: 'Tra cứu [tên chính sách] và trích dẫn điều kiện áp dụng, kèm nguồn để kiểm tra.',
  },
];

export const CHATBOT_ACCOUNT = {
  id: 'vichat-ai',
  username: 'vichat_ai',
  name: 'ViChat AI',
  email: '',
  role: 'assistant',
  department: 'GON Platform',
  title: 'Trợ lý tri thức doanh nghiệp',
  avatar: CHATBOT_DEFAULT_AVATAR,
  online: true,
  type: 'bot',
};

export function applyTinodeChatbotConfig(config = {}) {
  const uid = String(config.tinodeUid || config.uid || '').trim();
  const enabled = Boolean(config.enabled && uid);
  CHATBOT_ACCOUNT.tinodeUid = enabled ? uid : '';
  if (enabled) {
    Object.assign(CHATBOT_ACCOUNT, {
      name: String(config.name || CHATBOT_ACCOUNT.name),
      title: String(config.title || CHATBOT_ACCOUNT.title),
      department: String(config.organization || CHATBOT_ACCOUNT.department),
      avatar: CHATBOT_DEFAULT_AVATAR,
      online: true,
    });
  }
  return enabled;
}

if (EXTERNAL_CHAT_ONLY) {
  Object.assign(CHATBOT_ACCOUNT, {
    id: String(env.VITE_CHATBOT_ID || 'vichat-ai'),
    username: String(env.VITE_CHATBOT_USERNAME || 'vichat_ai'),
    email: '',
    name: String(env.VITE_CHATBOT_DISPLAY_NAME || 'ViChat AI'),
    title: String(env.VITE_CHATBOT_DISPLAY_TITLE || 'Trợ lý tri thức doanh nghiệp'),
    department: String(env.VITE_CHATBOT_DISPLAY_ORGANIZATION || 'GON Platform'),
    avatar: CHATBOT_DEFAULT_AVATAR,
  });
}

const API_URL = String(env.VITE_CHATBOT_API_URL || '/api/v1/chatbot/message').trim();
const API_ROOT = API_URL.replace(/\/message\/?$/, '');
const TINODE_CHATBOT_CONFIG_URL = API_ROOT ? `${API_ROOT}/tinode-config` : '';
const CHAT_FILE_INGEST_URL = API_ROOT ? `${API_ROOT}/knowledge/chat-files` : '';
const WITH_CREDENTIALS = String(env.VITE_CHATBOT_WITH_CREDENTIALS || 'true').toLowerCase() === 'true';
export const CHATBOT_REQUEST_TIMEOUT_MS = 45_000;
const CHAT_FILE_INGEST_MAX_SIZE = 20 * 1024 * 1024;
const CHAT_FILE_INGEST_EXTENSIONS = new Set([
  'pdf', 'txt', 'md', 'markdown', 'csv', 'json', 'docx', 'xlsx', 'xls',
]);
const STORAGE_PREFIX = `vichat.chatbot.${CHATBOT_ACCOUNT.id}.messages.`;
const LEGACY_STORAGE_PREFIXES = CHATBOT_ACCOUNT.id === 'vichat-ai'
  ? ['vichat.chatbot.bot-songhong.messages.']
  : [];

function unavailableReply(reason = 'unavailable') {
  return {
    text: reason === 'timeout'
      ? 'ViChat AI phản hồi quá lâu. Bạn có thể thử lại sau.'
      : reason === 'session'
        ? 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại để hỏi ViChat AI.'
        : 'Chatbot hiện không kết nối được dịch vụ nội bộ. Vui lòng thử lại sau.',
    source: 'unavailable',
    errorCode: reason,
    sources: [],
    grounded: false,
    fallback: true,
  };
}

function storageKey(userId, prefix = STORAGE_PREFIX) {
  return `${prefix}${userId || 'anonymous'}`;
}

function storedMessages(key) {
  try {
    const raw = window.localStorage.getItem(key);
    const messages = raw ? JSON.parse(raw) : [];
    return Array.isArray(messages) ? messages : [];
  } catch {
    return [];
  }
}

export function loadChatbotMessages(userId) {
  try {
    const current = storedMessages(storageKey(userId));
    const legacySources = LEGACY_STORAGE_PREFIXES.map(prefix => (
      storedMessages(storageKey(userId, prefix))
    ));
    return mergeChatbotMessages(current, ...legacySources);
  } catch {
    return [];
  }
}

function chatbotMessageFingerprint(message) {
  const text = String(message?.text || '').trim().replace(/\s+/gu, ' ');
  const createdAt = Date.parse(message?.createdAt || '') || 0;
  if (!text || !createdAt) return '';
  const sender = message?.sender === 'outgoing' ? 'user' : 'assistant';
  return `${sender}|${text}`;
}

function normalizedChatbotRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'user' || role === 'outgoing') return 'user';
  if (role === 'assistant' || role === 'incoming') return 'assistant';
  return '';
}

function chatbotIdentityMatches(value) {
  const identity = String(value || '').trim().toLowerCase();
  if (!identity) return false;
  return [CHATBOT_ACCOUNT.id, CHATBOT_ACCOUNT.tinodeUid, CHATBOT_ACCOUNT.username]
    .filter(Boolean)
    .some(candidate => identity === String(candidate).trim().toLowerCase());
}

function isChatbotAssistantMessage(message) {
  return normalizedChatbotRole(message?.role || message?.sender) === 'assistant'
    || [message?.senderId, message?.sender_id, message?.uid, message?.tinodeUid, message?.tinode_uid]
      .some(chatbotIdentityMatches);
}

// Old local/Tinode copies may contain a configurable bot avatar. Normalize
// those copies at the storage boundary so every session renders one identity.
export function normalizeChatbotMessage(message) {
  if (!message || typeof message !== 'object') return message;
  const replyTo = message.replyTo || message.reply_to;
  const replyIsChatbot = chatbotIdentityMatches(
    replyTo?.senderId || replyTo?.sender_id || replyTo?.uid || replyTo?.tinodeUid || replyTo?.tinode_uid,
  );
  const isAssistant = isChatbotAssistantMessage(message);
  const assistantAvatarNeedsNormalization = isAssistant && message.avatar !== CHATBOT_DEFAULT_AVATAR;
  const replyAvatarNeedsNormalization = replyIsChatbot && replyTo && replyTo.avatar !== CHATBOT_DEFAULT_AVATAR;
  const legacyReplyAvatarNeedsNormalization = replyIsChatbot
    && message.reply_to
    && message.reply_to.avatar !== CHATBOT_DEFAULT_AVATAR;
  if (!assistantAvatarNeedsNormalization && !replyAvatarNeedsNormalization && !legacyReplyAvatarNeedsNormalization) {
    return message;
  }
  return {
    ...message,
    ...(assistantAvatarNeedsNormalization ? { avatar: CHATBOT_DEFAULT_AVATAR } : {}),
    ...(replyIsChatbot && replyTo && (replyAvatarNeedsNormalization || legacyReplyAvatarNeedsNormalization) ? {
      replyTo: { ...replyTo, avatar: CHATBOT_DEFAULT_AVATAR },
      ...(message.reply_to ? { reply_to: { ...message.reply_to, avatar: CHATBOT_DEFAULT_AVATAR } } : {}),
    } : {}),
  };
}

function positiveSequence(value) {
  const sequence = Number(value);
  return Number.isFinite(sequence) && sequence > 0 ? sequence : 0;
}

function chatbotTopicScope(topic, counterpartTopic = '') {
  const primary = String(topic || '').trim();
  const counterpart = String(counterpartTopic || '').trim();
  if (!primary) return '';
  if (primary.startsWith('grp')) return `group:${primary}`;
  const participants = [...new Set([primary, counterpart].filter(Boolean))].sort();
  return `${participants.length > 1 ? 'direct' : 'topic'}:${participants.join('~')}`;
}

export function chatbotMessageCorrelationKey({
  role,
  sender,
  topic,
  counterpartTopic,
  sourceSequence,
  sequence,
} = {}) {
  const normalizedRole = normalizedChatbotRole(role || sender);
  const normalizedSequence = normalizedRole === 'assistant'
    ? positiveSequence(sourceSequence)
    : positiveSequence(sequence);
  const scope = chatbotTopicScope(topic, counterpartTopic);
  return normalizedRole && normalizedSequence && scope
    ? `${scope}|${normalizedRole}:${normalizedSequence}`
    : '';
}

function resolvedChatbotCorrelationKey(message) {
  const derived = chatbotMessageCorrelationKey({
    sender: message?.sender,
    topic: message?.chatbotTopic,
    counterpartTopic: message?.chatbotCounterpartTopic,
    sourceSequence: message?.chatbotSourceSequence,
    sequence: message?.seq,
  });
  if (derived) return derived;
  return String(message?.correlationKey || '').trim();
}

function chatbotMessageScope(message) {
  const correlationKey = resolvedChatbotCorrelationKey(message);
  const separator = correlationKey.indexOf('|');
  return separator > 0 ? correlationKey.slice(0, separator) : '';
}

function richerChatbotArray(previousValue, incomingValue) {
  const previous = Array.isArray(previousValue) ? previousValue : [];
  const incoming = Array.isArray(incomingValue) ? incomingValue : [];
  if (previous.length !== incoming.length) return previous.length > incoming.length ? previous : incoming;
  try {
    return JSON.stringify(previous).length >= JSON.stringify(incoming).length ? previous : incoming;
  } catch {
    return previous.length > 0 ? previous : incoming;
  }
}

function mergeChatbotDeliveryStatus(previousStatus, incomingStatus) {
  const statusRank = { failed: 0, none: 1, sending: 2, sent: 3, received: 4, read: 5 };
  const previousRank = statusRank[previousStatus] ?? -1;
  const incomingRank = statusRank[incomingStatus] ?? -1;
  return previousRank >= incomingRank ? previousStatus : incomingStatus;
}

function mergeChatbotMessage(previous, incoming) {
  const hasSuccessfulCopy = [previous, incoming].some(message => (
    message?.pending !== true && message?.failed !== true
  ));
  const hasFailedCopy = Boolean(previous?.failed || incoming?.failed);
  const pending = hasSuccessfulCopy || hasFailedCopy
    ? false
    : Boolean(previous?.pending || incoming?.pending);
  const failed = hasSuccessfulCopy ? false : hasFailedCopy;
  const previousCorrelationKey = resolvedChatbotCorrelationKey(previous);
  const incomingCorrelationKey = resolvedChatbotCorrelationKey(incoming);
  return normalizeChatbotMessage({
    ...previous,
    ...incoming,
    id: previous?.id || incoming?.id,
    sender: previous?.sender || incoming?.sender,
    senderId: previous?.senderId || incoming?.senderId,
    senderName: previous?.senderName || incoming?.senderName,
    avatar: previous?.avatar || incoming?.avatar,
    text: incoming?.text || previous?.text,
    time: previous?.time || incoming?.time,
    createdAt: previous?.createdAt || incoming?.createdAt,
    seq: positiveSequence(incoming?.seq) || positiveSequence(previous?.seq) || undefined,
    correlationKey: previousCorrelationKey.includes('|')
      ? previousCorrelationKey
      : incomingCorrelationKey || previousCorrelationKey || undefined,
    chatbotTopic: previous?.chatbotTopic || incoming?.chatbotTopic,
    chatbotCounterpartTopic: previous?.chatbotCounterpartTopic || incoming?.chatbotCounterpartTopic,
    chatbotSourceSequence: positiveSequence(previous?.chatbotSourceSequence)
      || positiveSequence(incoming?.chatbotSourceSequence)
      || undefined,
    source: incoming?.source || previous?.source,
    sources: richerChatbotArray(previous?.sources, incoming?.sources),
    grounded: Boolean(previous?.grounded || incoming?.grounded),
    deliveryStatus: mergeChatbotDeliveryStatus(previous?.deliveryStatus, incoming?.deliveryStatus),
    receiptUsers: richerChatbotArray(previous?.receiptUsers, incoming?.receiptUsers),
    raw: incoming?.raw || previous?.raw,
    pending,
    failed,
  });
}

// Merge legacy HTTP history with Tinode history without duplicating messages.
export function mergeChatbotMessages(...sources) {
  const merged = [];
  const ids = new Map();
  const correlationKeys = new Map();
  const fingerprints = new Map();
  sources.forEach((source, sourceIndex) => {
    (Array.isArray(source) ? source : []).forEach(rawMessage => {
      const message = normalizeChatbotMessage(rawMessage);
      if (!message || typeof message !== 'object') return;
      const id = String(message.id || '').trim();
      const correlationKey = resolvedChatbotCorrelationKey(message);
      const fingerprint = chatbotMessageFingerprint(message);
      const scope = chatbotMessageScope(message);
      const createdAt = Date.parse(message.createdAt || '') || 0;
      let index = id ? ids.get(id) : undefined;
      if (index === undefined && correlationKey) index = correlationKeys.get(correlationKey);
      if (index === undefined && fingerprint) {
        index = (fingerprints.get(fingerprint) || []).find(previous => (
          previous.sourceIndex !== sourceIndex
          && (!correlationKey || !previous.correlationKey || !scope || !previous.scope)
          && (!scope || !previous.scope || scope === previous.scope)
          && createdAt > 0
          && previous.createdAt > 0
          && Math.abs(createdAt - previous.createdAt) <= 5000
        ))?.index;
      }

      if (index !== undefined) {
        merged[index] = mergeChatbotMessage(merged[index], message);
      } else {
        index = merged.length;
        merged.push(message);
      }

      if (id) ids.set(id, index);
      const stableId = String(merged[index]?.id || '').trim();
      if (stableId) ids.set(stableId, index);
      if (correlationKey) correlationKeys.set(correlationKey, index);
      const stableCorrelationKey = resolvedChatbotCorrelationKey(merged[index]);
      if (stableCorrelationKey) correlationKeys.set(stableCorrelationKey, index);
      if (fingerprint) {
        const matches = fingerprints.get(fingerprint) || [];
        matches.push({ sourceIndex, createdAt, scope, correlationKey, index });
        fingerprints.set(fingerprint, matches);
      }
    });
  });
  return merged
    .map((message, index) => ({ message, index }))
    .sort((first, second) => {
      const firstTime = Date.parse(first.message?.createdAt || '') || 0;
      const secondTime = Date.parse(second.message?.createdAt || '') || 0;
      return firstTime && secondTime && firstTime !== secondTime
        ? firstTime - secondTime
        : first.index - second.index;
    })
    .map(item => item.message);
}

export function saveChatbotMessage(userId, message) {
  try {
    const next = [...loadChatbotMessages(userId), normalizeChatbotMessage(message)].slice(-200);
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // Browser storage can be disabled; the active conversation still works in memory.
  }
}

function query(extra = {}) {
  return new URLSearchParams(extra);
}

export function canIngestChatDocument(file) {
  const name = String(file?.name || '').trim().toLowerCase();
  const extension = name.includes('.') ? name.split('.').pop() : '';
  const mime = String(file?.type || '').trim().toLowerCase();
  return Boolean(
    name
    && Number(file?.size) > 0
    && Number(file.size) <= CHAT_FILE_INGEST_MAX_SIZE
    && !/^(?:audio|image|video)\//u.test(mime)
    && CHAT_FILE_INGEST_EXTENSIONS.has(extension),
  );
}

export async function ingestChatDocument({
  file,
  conversationId,
  tinodeTopic,
  sequence,
  caption = '',
} = {}) {
  if (!CHAT_FILE_INGEST_URL || !canIngestChatDocument(file)) {
    return { accepted: false, skipped: true };
  }
  const normalizedConversationId = String(conversationId || '').trim();
  const normalizedTopic = String(tinodeTopic || '').trim();
  const normalizedSequence = Number(sequence);
  if (!normalizedConversationId || !normalizedTopic || !Number.isInteger(normalizedSequence) || normalizedSequence <= 0) {
    return { accepted: false, skipped: true };
  }

  const body = new FormData();
  body.append('file', file, file.name);
  body.append('conversation_id', normalizedConversationId);
  body.append('tinode_topic', normalizedTopic);
  body.append('sequence', String(normalizedSequence));
  const normalizedCaption = String(caption || '').trim();
  if (normalizedCaption) body.append('caption', normalizedCaption);

  const response = await fetch(CHAT_FILE_INGEST_URL, {
    method: 'POST',
    credentials: WITH_CREDENTIALS ? 'include' : 'omit',
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_message || `Chat file ingest returned ${response.status}.`);
  }
  return payload;
}

export async function loadTinodeChatbotConfig() {
  if (!TINODE_CHATBOT_CONFIG_URL) return { enabled: false };
  try {
    const response = await fetch(TINODE_CHATBOT_CONFIG_URL, {
      credentials: WITH_CREDENTIALS ? 'include' : 'omit',
      headers: { Accept: 'application/json' },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { enabled: false, error_code: `HTTP_${response.status}` };
    return payload && typeof payload === 'object' ? payload : { enabled: false };
  } catch {
    return { enabled: false, error_code: 'NETWORK_ERROR' };
  }
}

export async function loadChatbotMessagesFromServer(user, conversationId = CHATBOT_ACCOUNT.id) {
  if (!API_ROOT) return loadChatbotMessages(user?.id || user?.uid);
  try {
    const response = await fetch(`${API_ROOT}/history?${query({ conversation_id: conversationId, limit: '200' })}`, {
      credentials: WITH_CREDENTIALS ? 'include' : 'omit',
    });
    if (!response.ok) throw new Error(`History returned ${response.status}.`);
    const payload = await response.json();
    return (payload.objects || []).map((item, index) => {
      const historySequence = Number(item.properties?.seq);
      const hasSequence = Number.isFinite(historySequence) && historySequence > 0;
      const historyTopic = String(item.properties?.topic || '').trim();
      const viewerTinodeUid = String(user?.tinodeUid || user?.tinode_uid || '').trim();
      const botTinodeUid = String(CHATBOT_ACCOUNT.tinodeUid || '').trim();
      const isGroupHistory = Boolean(item.properties?.is_group || historyTopic.startsWith('grp'));
      const counterpartTopic = isGroupHistory
        ? ''
        : historyTopic === botTinodeUid ? viewerTinodeUid : botTinodeUid || viewerTinodeUid;
      const correlationKey = hasSequence ? chatbotMessageCorrelationKey({
        role: item.role,
        topic: historyTopic,
        counterpartTopic,
        sourceSequence: historySequence,
        sequence: historySequence,
      }) : '';
      return {
        id: item.message_ref || item.id || `bot-history-${index}`,
        type: 'text',
        sender: item.role === 'user' ? 'outgoing' : 'incoming',
        senderId: item.role === 'user' ? (user?.id || user?.uid) : CHATBOT_ACCOUNT.id,
        senderName: item.role === 'user' ? user?.name : CHATBOT_ACCOUNT.name,
        avatar: item.role === 'user' ? user?.avatar : CHATBOT_DEFAULT_AVATAR,
        text: item.content,
        time: item.created_at ? new Date(item.created_at * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '',
        createdAt: item.created_at ? new Date(item.created_at * 1000).toISOString() : undefined,
        source: item.properties?.provider,
        sources: Array.isArray(item.properties?.sources) ? item.properties.sources : [],
        grounded: Boolean(item.properties?.grounded),
        ...(hasSequence ? {
          seq: item.role === 'user' ? historySequence : undefined,
          chatbotTopic: historyTopic || undefined,
          chatbotCounterpartTopic: counterpartTopic || undefined,
          chatbotSourceSequence: item.role === 'assistant' ? historySequence : undefined,
          correlationKey: correlationKey || undefined,
        } : {}),
      };
    });
  } catch {
    return loadChatbotMessages(user?.id || user?.uid);
  }
}

export async function requestChatbotReply({ message, messageId, conversationId, history = [], signal, timeoutMs = CHATBOT_REQUEST_TIMEOUT_MS }) {
  if (typeof message !== 'string' || !message.trim()) throw new Error('Vui lòng nhập câu hỏi cho ViChat AI.');
  if (message.trim().length > 4000) throw new Error('Câu hỏi cho ViChat AI không được vượt quá 4000 ký tự.');
  if (!API_URL) return unavailableReply();
  const controller = new AbortController();
  const abortRequest = () => controller.abort();
  if (signal?.aborted) return unavailableReply('cancelled');
  signal?.addEventListener('abort', abortRequest, { once: true });
  let timedOut = false;
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Number.isFinite(timeoutMs) ? Math.max(1, Math.min(timeoutMs, CHATBOT_REQUEST_TIMEOUT_MS)) : CHATBOT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      credentials: WITH_CREDENTIALS ? 'include' : 'omit',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        message: message.trim(),
        message_id: messageId,
        conversation_id: conversationId,
        history: (Array.isArray(history) ? history : [])
          .filter(item => ['user', 'assistant'].includes(item?.role) && typeof item.content === 'string' && item.content.trim())
          .slice(-10)
          .map(item => ({ role: item.role, content: item.content.trim().slice(0, 4000) })),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (controller.signal.aborted) return unavailableReply(timedOut ? 'timeout' : 'cancelled');
    if (!response.ok) return unavailableReply([401, 403].includes(response.status) ? 'session' : [408, 504].includes(response.status) ? 'timeout' : 'unavailable');
    const reply = payload?.reply || payload?.message || payload?.text;
    if (typeof reply !== 'string' || !reply.trim()) return unavailableReply();
    const sources = (Array.isArray(payload.sources) ? payload.sources : [])
      .filter(item => item && typeof item === 'object' && (
        (typeof item.title === 'string' && item.title.trim()) || (typeof item.file_name === 'string' && item.file_name.trim())
      ))
      .slice(0, 20)
      .map(item => ({
        title: typeof item.title === 'string' ? item.title.trim().slice(0, 500) : '',
        file_name: typeof item.file_name === 'string' ? item.file_name.trim().slice(0, 500) : '',
        snippet: typeof item.snippet === 'string' ? item.snippet.slice(0, 2000) : '',
      }));
    return { text: reply.trim(), source: 'api', sources, grounded: payload.grounded === true && sources.length > 0 };
  } catch {
    return unavailableReply(timedOut ? 'timeout' : signal?.aborted ? 'cancelled' : 'unavailable');
  } finally {
    globalThis.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortRequest);
  }
}
