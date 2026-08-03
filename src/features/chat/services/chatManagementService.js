import { normalizeNotificationMuteUntil } from './conversationNotifications';

const env = import.meta.env || {};
const apiBase = String(env.VITE_CHAT_MANAGEMENT_API_URL || '').replace(/\/$/, '');
const remoteAuth = String(env.VITE_CHAT_MANAGEMENT_REMOTE_AUTH || '').toLowerCase() === 'true';
const tenantId = env.VITE_CHAT_TENANT_ID || 'song-hong';
const accountUrl = String(env.VITE_ACCOUNT_URL || 'https://account.upgo.vn').replace(/\/+$/, '');
const topicBindingsKey = 'vichat.management.topic-bindings.v1';

let activeSession = null;
let lastDirectorySync = null;
let tinodeTokenRequest = null;

function tinodeTokenExpiresSoon(auth, skewSeconds = 30) {
  if (!auth?.token) return true;
  if (!auth.expires) return false;
  const expiresAt = typeof auth.expires === 'number'
    ? auth.expires * 1000
    : Date.parse(auth.expires);
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt <= Date.now() + (skewSeconds * 1000);
}

function readStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value));
  return value;
}

function accountTenant(account) {
  return account?.tenantId || account?.tenant_id || tenantId;
}

function publicAccount(account) {
  if (!account) return null;
  const { password: _password, ...safe } = account;
  return {
    ...safe,
    id: safe.id || safe.user_id || safe.uid,
    uid: safe.uid || safe.tinode_uid || safe.tinodeUid,
    username: safe.username || safe.user_name || safe.login,
    name: safe.name || safe.full_name || safe.display_name || safe.username || safe.user_name,
    avatar: safe.avatar || safe.photo || '',
    tenantId: accountTenant(safe),
    active: safe.active ?? safe.is_active ?? true,
  };
}

function responseItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.objects)) return payload.objects;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

async function apiRequest(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(`${apiBase}${path}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error_message || payload?.message || `Management service HTTP ${response.status}`);
    error.code = payload?.error_code || `HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return payload;
}

function normalizeConversation(record) {
  const properties = record?.properties || {};
  const tinodeTopic = record?.tinodeTopic || record?.tinode_topic || record?.channel_thread_id || '';
  const managementId = String(record?.managementId || record?.id || record?.conversation_no || tinodeTopic);
  const notificationMutedUntil = normalizeNotificationMuteUntil(
    record?.notificationMutedUntil ?? record?.notification_muted_until,
  );
  return {
    id: managementId,
    managementId,
    tinodeTopic,
    name: record?.name || record?.subject || properties.name || 'Cuoc tro chuyen',
    isGroup: record?.isGroup ?? properties.isGroup ?? properties.is_group ?? false,
    avatarHtml: record?.avatarHtml,
    avatarUrl: record?.avatarUrl || record?.avatar || properties.avatar || '',
    avatarClass: record?.avatarClass || (record?.isGroup ? 'group' : ''),
    membersCount: record?.membersCount || properties.membersCount || '',
    description: record?.description || properties.description || '',
    admin: record?.admin || properties.admin || '',
    adminId: record?.adminId || properties.adminId || '',
    members: record?.members || properties.members || [],
    participantIds: record?.participantIds || properties.participantIds || [],
    // Message history is loaded exclusively from Tinode/chatapi.
    messages: [],
    lastMsg: record?.lastMsg || properties.lastMessage || '',
    time: record?.time || properties.time || '',
    updatedAt: record?.updatedAt || record?.last_message_at || properties.updatedAt,
    badge: record?.badge || properties.unreadCount || 0,
    notificationMutedUntil,
  };
}

function bindingKey(userId, conversationId) {
  const sessionTenantId = activeSession?.tenant?.id || activeSession?.user?.tenantId || tenantId;
  return `${sessionTenantId}:${userId || 'anonymous'}:${conversationId}`;
}

export const chatManagementService = {
  get tenantId() {
    return tenantId;
  },

  get remote() {
    return Boolean(apiBase && remoteAuth);
  },

  get chatEngine() {
    return env.VITE_TINODE_HOST ? 'tinode' : 'demo';
  },

  get directorySync() {
    return lastDirectorySync;
  },

  async login() {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest('/api/v1/auth/sso', {
      method: 'POST',
    });
    const account = publicAccount(payload.user || payload.current_user || payload);
    const tenant = payload.tenant || account?.tenant || null;
    const rawTinodeAuth = payload.tinode || payload.tinode_auth || {};
    const hasTinodeToken = Boolean(rawTinodeAuth.token || payload.tinode_token);
    const connection = payload.connection || (hasTinodeToken ? 'tinode' : 'management');
    tinodeTokenRequest = null;
    activeSession = {
      user: account,
      tenant,
      connection,
      tinodeAuth: hasTinodeToken ? {
        ...rawTinodeAuth,
        username: rawTinodeAuth.username || account?.tinodeUsername || account?.tinode_username || account?.username,
        uid: rawTinodeAuth.uid || account?.tinodeUid || account?.tinode_uid,
        token: rawTinodeAuth.token || payload.tinode_token,
        displayName: account?.name || '',
        avatar: account?.avatar || '',
        tenantId: tenant?.id || account?.tenantId || account?.tenant_id || tenantId,
        tenantName: tenant?.name || account?.tenantName || account?.tenant_name || '',
      } : null,
    };
    return { ...account, tenant, connection };
  },

  async currentSession() {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest('/api/v1/auth/me');
    return publicAccount(payload.user || payload.current_user || payload);
  },

  async refreshTinodeToken() {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    if (!activeSession) throw new Error('Phiên Chatmgt chưa sẵn sàng.');
    if (!tinodeTokenRequest) {
      const requestedSession = activeSession;
      const request = apiRequest('/api/v1/auth/tinode-token', { method: 'POST' })
        .then(payload => {
          if (!requestedSession || activeSession !== requestedSession) {
            throw new Error('Phiên tài khoản đã thay đổi trong khi kết nối Tinode.');
          }
          const tinodeAuth = payload.tinode_auth || payload.tinode || {};
          if (!tinodeAuth.token) throw new Error('Chatmgt did not return a Tinode token.');
          const mergedAuth = {
            ...(requestedSession.tinodeAuth || {}),
            ...tinodeAuth,
            displayName: requestedSession.user?.name || '',
            avatar: requestedSession.user?.avatar || '',
            tenantId: requestedSession.tenant?.id || requestedSession.user?.tenantId || tenantId,
            tenantName: requestedSession.tenant?.name || requestedSession.user?.tenantName || '',
          };
          requestedSession.tinodeAuth = mergedAuth;
          requestedSession.connection = payload.connection || 'tinode';
          return mergedAuth;
        })
        .finally(() => {
          if (tinodeTokenRequest === request) tinodeTokenRequest = null;
        });
      tinodeTokenRequest = request;
    }
    return tinodeTokenRequest;
  },

  async getFreshTinodeAuth({ force = false } = {}) {
    const current = activeSession?.tinodeAuth || null;
    if (!force && current && !tinodeTokenExpiresSoon(current)) return current;
    return this.refreshTinodeToken();
  },

  async logout({ throwOnError = false } = {}) {
    let payload = null;
    let logoutError = null;
    if (apiBase && remoteAuth) {
      try {
        payload = await apiRequest('/api/v1/auth/logout', { method: 'POST' });
      } catch (error) {
        logoutError = error;
      }
    }
    activeSession = null;
    lastDirectorySync = null;
    tinodeTokenRequest = null;
    if (logoutError && throwOnError) throw logoutError;
    return payload;
  },

  async requestPasswordReset(identity) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    return apiRequest('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identity: String(identity || '').trim(), tenant_id: tenantId }),
    });
  },

  async resetPassword(token, newPassword) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    return apiRequest('/api/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    });
  },

  async changePassword(currentPassword, newPassword) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    return apiRequest('/api/v1/auth/password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
  },

  async updateProfile(profile) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest('/api/v1/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profile || {}),
    });
    const account = publicAccount(payload.user || payload);
    if (activeSession && account) activeSession.user = account;
    return account;
  },

  async updateAvatar(file) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    if (!file) throw new Error('Vui lòng chọn ảnh đại diện.');
    const form = new FormData();
    form.append('avatar', file, file.name || 'avatar');
    const payload = await apiRequest('/api/v1/auth/avatar', {
      method: 'POST',
      body: form,
    });
    const account = publicAccount(payload.user || payload);
    if (activeSession && account) activeSession.user = account;
    return account;
  },

  getTinodeAuth() {
    return activeSession?.tinodeAuth || null;
  },

  async listUsers() {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest('/api/v1/chat/users?results_per_page=1000');
    lastDirectorySync = payload?.directory_sync || null;
    return responseItems(payload).map(publicAccount).filter(Boolean);
  },

  async searchUsers(query, { excludeUserId = '' } = {}) {
    const value = String(query || '').trim();
    if (!value) return [];
    if (apiBase && remoteAuth) {
      const params = new URLSearchParams({ q: value, results_per_page: '50' });
      if (excludeUserId) params.set('exclude_user_id', excludeUserId);
      const payload = await apiRequest(`/api/v1/chat/users?${params}`);
      return responseItems(payload).map(publicAccount).filter(account => account?.id !== excludeUserId);
    }
    throw new Error('Management service authentication is not configured.');
  },

  async sendFriendRequest({ sender, recipient, note = '' }) {
    if (!sender?.id || !recipient?.id) throw new Error('Thong tin loi moi ket ban khong hop le.');
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    return apiRequest('/api/v1/friend-request', {
      method: 'POST',
      body: JSON.stringify({
        recipient_id: recipient.id,
        note: String(note || '').trim().slice(0, 500),
      }),
    });
  },

  async respondFriendRequest({ request, responder, accepted }) {
    if (!request?.requestId || !responder?.id) throw new Error('Loi moi ket ban khong hop le.');
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    return apiRequest(`/api/v1/friend-request/${encodeURIComponent(request.requestId)}`, {
      method: 'PUT',
      body: JSON.stringify({ accepted: Boolean(accepted) }),
    });
  },

  async listFriendRequests(userId) {
    if (!userId) return [];
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest('/api/v1/friend-request');
    return responseItems(payload);
  },

  async listConversations() {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest('/api/v1/conversation');
    const conversations = responseItems(payload).map(normalizeConversation);
    return {
      conversations,
      groups: [],
      directs: [],
    };
  },

  async createConversation({ subject, isGroup = false, participantIds = [], properties = {} }) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest('/api/v1/conversation', {
      method: 'POST',
      body: JSON.stringify({
        subject,
        is_group: isGroup,
        participant_ids: participantIds,
        properties,
      }),
    });
    return normalizeConversation(payload);
  },

  async addConversationParticipants(conversationId, participantIds = []) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const tinodeAuth = activeSession?.connection === 'tinode'
      ? await this.getFreshTinodeAuth()
      : null;
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/participants`, {
      method: 'POST',
      body: JSON.stringify({
        participant_ids: participantIds,
        tinode_token: tinodeAuth?.token || '',
      }),
    });
    return normalizeConversation(payload);
  },

  async removeConversationParticipant(conversationId, participantId) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const tinodeAuth = activeSession?.connection === 'tinode'
      ? await this.getFreshTinodeAuth()
      : null;
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(participantId)}`, {
      method: 'DELETE',
      body: JSON.stringify({ tinode_token: tinodeAuth?.token || '' }),
    });
    return normalizeConversation(payload);
  },

  async updateConversationNotifications(conversationId, mutedUntil) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/notification-settings`, {
      method: 'PUT',
      body: JSON.stringify({ muted_until: mutedUntil }),
    });
    return normalizeConversation(payload);
  },

  async prepareTinodeConversation(conversationId) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/tinode-prepare`, {
      method: 'POST',
    });
    return normalizeConversation(payload);
  },

  getTinodeTopic(userId, conversationId) {
    // In remote mode chatmgt is authoritative. Old browser bindings may point
    // at a topic created before the management conversation was persisted.
    if (apiBase && remoteAuth) return '';
    const bindings = readStorage(topicBindingsKey, {});
    return bindings[bindingKey(userId, conversationId)] || '';
  },

  async bindTinodeTopic(userId, conversationId, topicName, { avatarUrl = '' } = {}) {
    if (!conversationId || !topicName) return topicName;
    if (apiBase && remoteAuth) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(conversationId))) {
        throw new Error('Mã cuộc trò chuyện của chatmgt không hợp lệ.');
      }
      const tinodeAuth = await this.getFreshTinodeAuth();
      await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/tinode-topic`, {
        method: 'PUT',
        body: JSON.stringify({
          tinode_topic: topicName,
          tinode_token: tinodeAuth?.token || '',
          avatar: avatarUrl || '',
        }),
      });
    }
    const bindings = readStorage(topicBindingsKey, {});
    bindings[bindingKey(userId, conversationId)] = topicName;
    writeStorage(topicBindingsKey, bindings);
    return topicName;
  },
};

function toLoginSession(account) {
  const auth = chatManagementService.getTinodeAuth();
  const tenant = account.tenant || null;
  return {
    uid: account.id,
    login: account.username,
    connection: account.connection || (auth?.token ? 'tinode' : 'management'),
    role: account.role,
    email: account.email,
    department: account.department,
    tenantId: account.tenantId || account.tenant_id,
    tenantName: tenant?.name || account.tenantName || account.tenant_name || '',
    tenant,
    tinodeUid: account.tinodeUid || auth?.uid,
    tinodeAuth: auth,
    mustChangePassword: Boolean(account.mustChangePassword || account.must_change_password),
    profile: {
      name: account.name,
      title: account.title || '',
      avatar: account.avatar || '',
    },
  };
}

export const managementAuthClient = {
  enabled: Boolean(apiBase && remoteAuth),
  accountUrl,

  accountLoginUrl() {
    if (typeof window === 'undefined') return accountUrl;
    const continueUrl = new URL(window.location.href);
    continueUrl.searchParams.set('account_sso', '1');
    const loginUrl = new URL(`${accountUrl}/`);
    loginUrl.searchParams.set('continue', continueUrl.toString());
    return loginUrl.toString();
  },

  async login() {
    return toLoginSession(await chatManagementService.login());
  },

  async logout() {
    return chatManagementService.logout({ throwOnError: true });
  },

  async requestPasswordReset(identity) {
    return chatManagementService.requestPasswordReset(identity);
  },

  async resetPassword(token, newPassword) {
    return chatManagementService.resetPassword(token, newPassword);
  },
};
