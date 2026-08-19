const env = import.meta.env || {};

export const EXTERNAL_CHAT_ONLY = String(env.VITE_CHAT_MODE || 'internal').toLowerCase() === 'external';

export const CHATBOT_STARTER_PROMPTS = [
  {
    icon: 'fa-file-shield',
    title: 'Tìm quy trình',
    prompt: 'Tóm tắt quy trình nghỉ phép và các bước cần thực hiện.',
  },
  {
    icon: 'fa-clipboard-check',
    title: 'Tra cứu chính sách',
    prompt: 'Các chính sách nội bộ quan trọng mà nhân viên mới cần biết là gì?',
  },
  {
    icon: 'fa-magnifying-glass-chart',
    title: 'Tìm nhanh tài liệu',
    prompt: 'Hãy giúp tôi tìm tài liệu liên quan đến quy trình phê duyệt công việc.',
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
  avatar: String(env.VITE_CHATBOT_DISPLAY_AVATAR || '/vichat-ai.svg'),
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
      avatar: String(config.avatar || CHATBOT_ACCOUNT.avatar),
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
    avatar: String(env.VITE_CHATBOT_DISPLAY_AVATAR || CHATBOT_ACCOUNT.avatar),
  });
}

const API_URL = String(env.VITE_CHATBOT_API_URL || '/api/v1/chatbot/message').trim();
const API_ROOT = API_URL.replace(/\/message\/?$/, '');
const TINODE_CHATBOT_CONFIG_URL = API_ROOT ? `${API_ROOT}/tinode-config` : '';
const WITH_CREDENTIALS = String(env.VITE_CHATBOT_WITH_CREDENTIALS || 'true').toLowerCase() === 'true';
const STORAGE_PREFIX = `vichat.chatbot.${CHATBOT_ACCOUNT.id}.messages.`;
const LEGACY_STORAGE_PREFIXES = CHATBOT_ACCOUNT.id === 'vichat-ai'
  ? ['vichat.chatbot.bot-songhong.messages.']
  : [];

function unavailableReply() {
  return {
    text: 'Chatbot hiện không kết nối được dịch vụ nội bộ. Vui lòng thử lại sau.',
    source: 'unavailable',
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

// Merge legacy HTTP history with Tinode history without duplicating messages.
export function mergeChatbotMessages(...sources) {
  const merged = [];
  const ids = new Set();
  const fingerprints = new Map();
  sources.forEach((source, sourceIndex) => {
    (Array.isArray(source) ? source : []).forEach(message => {
      if (!message || typeof message !== 'object') return;
      const id = String(message.id || '').trim();
      const fingerprint = chatbotMessageFingerprint(message);
      const createdAt = Date.parse(message.createdAt || '') || 0;
      const duplicate = fingerprint && (fingerprints.get(fingerprint) || []).some(previous => (
        previous.sourceIndex !== sourceIndex
        && createdAt > 0
        && previous.createdAt > 0
        && Math.abs(createdAt - previous.createdAt) <= 5000
      ));
      if ((id && ids.has(id)) || duplicate) return;
      if (id) ids.add(id);
      if (fingerprint) {
        const matches = fingerprints.get(fingerprint) || [];
        matches.push({ sourceIndex, createdAt });
        fingerprints.set(fingerprint, matches);
      }
      merged.push(message);
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
    const next = [...loadChatbotMessages(userId), message].slice(-200);
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // Browser storage can be disabled; the active conversation still works in memory.
  }
}

function query(extra = {}) {
  return new URLSearchParams(extra);
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
      return {
      id: item.message_ref || item.id || `bot-history-${index}`,
      type: 'text',
      sender: item.role === 'user' ? 'outgoing' : 'incoming',
      senderId: item.role === 'user' ? (user?.id || user?.uid) : CHATBOT_ACCOUNT.id,
      senderName: item.role === 'user' ? user?.name : CHATBOT_ACCOUNT.name,
      avatar: item.role === 'user' ? user?.avatar : CHATBOT_ACCOUNT.avatar,
      text: item.content,
      time: item.created_at ? new Date(item.created_at * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '',
      createdAt: item.created_at ? new Date(item.created_at * 1000).toISOString() : undefined,
      source: item.properties?.provider,
      sources: Array.isArray(item.properties?.sources) ? item.properties.sources : [],
      grounded: Boolean(item.properties?.grounded),
      ...(hasSequence ? {
        seq: item.role === 'user' ? historySequence : undefined,
        correlationKey: `${item.role === 'user' ? 'user' : 'assistant'}:${historySequence}`,
      } : {}),
      };
    });
  } catch {
    return loadChatbotMessages(user?.id || user?.uid);
  }
}

export async function requestChatbotReply({ message, messageId, conversationId, history = [] }) {
  if (!API_URL) return unavailableReply();
  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      credentials: WITH_CREDENTIALS ? 'include' : 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        message_id: messageId,
        conversation_id: conversationId,
        history,
      }),
    });
  } catch {
    return unavailableReply();
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if ([401, 403, 404, 502, 503, 504].includes(response.status)) return unavailableReply();
    throw new Error(payload.error_message || `Chatbot API tra ve ${response.status}.`);
  }
  const reply = payload.reply || payload.message || payload.text;
  if (!reply) return unavailableReply();
  return {
    text: String(reply),
    source: 'api',
    sources: Array.isArray(payload.sources) ? payload.sources : [],
    grounded: Boolean(payload.grounded),
  };
}
