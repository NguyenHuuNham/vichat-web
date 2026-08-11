const env = import.meta.env || {};

export const EXTERNAL_CHAT_ONLY = String(env.VITE_CHAT_MODE || 'internal').toLowerCase() === 'external';

export const CHATBOT_ACCOUNT = {
  id: 'bot-songhong',
  username: 'songhong_bot',
  name: 'Trợ lý Sông Hồng',
  email: 'bot@songhong.vn',
  role: 'assistant',
  department: 'SÔNG HỒNG AI',
  title: 'Trợ lý AI nội bộ',
  avatar: '/favicon.svg',
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
    id: String(env.VITE_CHATBOT_ID || 'external-chatbot'),
    username: String(env.VITE_CHATBOT_USERNAME || 'external_bot'),
    email: '',
    name: String(env.VITE_CHATBOT_DISPLAY_NAME || 'External AI'),
    title: String(env.VITE_CHATBOT_DISPLAY_TITLE || 'External chatbot'),
    department: String(env.VITE_CHATBOT_DISPLAY_ORGANIZATION || 'Connected service'),
    avatar: String(env.VITE_CHATBOT_DISPLAY_AVATAR || CHATBOT_ACCOUNT.avatar),
  });
}

const API_URL = String(env.VITE_CHATBOT_API_URL || '/api/v1/chatbot/message').trim();
const API_ROOT = API_URL.replace(/\/message\/?$/, '');
const TINODE_CHATBOT_CONFIG_URL = API_ROOT ? `${API_ROOT}/tinode-config` : '';
const WITH_CREDENTIALS = String(env.VITE_CHATBOT_WITH_CREDENTIALS || 'true').toLowerCase() === 'true';
const KNOWLEDGE_BASE_ID = String(env.VITE_CHATBOT_KNOWLEDGE_BASE_ID || '').trim();
const STORAGE_PREFIX = `vichat.chatbot.${CHATBOT_ACCOUNT.id}.messages.`;

function unavailableReply() {
  return {
    text: 'Chatbot hiện không kết nối được dịch vụ nội bộ. Vui lòng thử lại sau.',
    source: 'unavailable',
    sources: [],
    grounded: false,
    fallback: true,
  };
}

function storageKey(userId) {
  return `${STORAGE_PREFIX}${userId || 'anonymous'}`;
}

export function loadChatbotMessages(userId) {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const messages = raw ? JSON.parse(raw) : [];
    return Array.isArray(messages) ? messages : [];
  } catch {
    return [];
  }
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
    return (payload.objects || []).map((item, index) => ({
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
    }));
  } catch {
    return loadChatbotMessages(user?.id || user?.uid);
  }
}

export async function listKnowledgeBases() {
  const response = await fetch(`${API_ROOT}/knowledge/bases`, { credentials: WITH_CREDENTIALS ? 'include' : 'omit' });
  if (!response.ok) throw new Error(`Khong tai duoc kho tri thuc (${response.status}).`);
  return (await response.json()).objects || [];
}

export async function listKnowledgeDocuments(_user, knowledgeBaseId = '') {
  const params = knowledgeBaseId ? `?${query({ knowledge_base_id: knowledgeBaseId })}` : '';
  const response = await fetch(`${API_ROOT}/knowledge/documents${params}`, { credentials: WITH_CREDENTIALS ? 'include' : 'omit' });
  if (!response.ok) throw new Error(`Khong tai duoc tai lieu (${response.status}).`);
  return (await response.json()).objects || [];
}

export async function uploadKnowledgeDocument(_user, knowledgeBaseId, file) {
  const form = new FormData();
  form.set('file', file, file.name);
  form.set('title', file.name);
  form.set('knowledge_base_id', knowledgeBaseId);
  const response = await fetch(`${API_ROOT}/knowledge/documents/upload`, {
    method: 'POST',
    credentials: WITH_CREDENTIALS ? 'include' : 'omit',
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_message || `Khong tai duoc tai lieu (${response.status}).`);
  return payload;
}

export async function deleteKnowledgeDocument(_user, documentId) {
  const response = await fetch(`${API_ROOT}/knowledge/documents/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
    credentials: WITH_CREDENTIALS ? 'include' : 'omit',
  });
  if (!response.ok) throw new Error(`Khong xoa duoc tai lieu (${response.status}).`);
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
        knowledge_base_id: KNOWLEDGE_BASE_ID || undefined,
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
