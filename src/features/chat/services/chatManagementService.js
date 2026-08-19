import { normalizeNotificationMuteUntil } from './conversationNotifications.js';
import { normalizeConversationShape } from './chatRealtime.js';
import { normalizeAccountShape, normalizeTenantShape } from '../../contacts/services/accountDirectory.js';

const env = import.meta.env || {};
const apiBase = String(env.VITE_CHAT_MANAGEMENT_API_URL || '').replace(/\/$/, '');
const remoteAuth = String(env.VITE_CHAT_MANAGEMENT_REMOTE_AUTH || '').toLowerCase() === 'true';
const tenantId = String(env.VITE_CHAT_TENANT_ID || '').trim();
// Employee ChatUI only permits manual credentials; Account SSO is reserved for admin.
export function normalizeChatAuthMode(value) {
  return String(value || '').trim().toLowerCase() === 'password' ? 'password' : 'account_password';
}
const authMode = normalizeChatAuthMode(env.VITE_CHAT_AUTH_MODE || 'account_password');
const accountUrl = String(env.VITE_ACCOUNT_URL || 'https://account.upgo.vn').replace(/\/+$/, '');
const topicBindingsKey = 'vichat.management.topic-bindings.v1';

let activeSession = null;
let activeTinodePassword = '';
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

export function tinodeRefreshPayload(auth, password) {
  if (!tinodeTokenExpiresSoon(auth) || !password) return {};
  return { password: String(password) };
}

export function shouldRequestTinodeAuth(session, force = false) {
  return Boolean(force || session?.connection === 'tinode' || session?.tinodeAuth?.token);
}

export function shouldRetryTinodeMembership(error) {
  return ['TINODE_TOKEN_REQUIRED', 'TINODE_MEMBERSHIP_FAILED'].includes(error?.code)
    && [400, 401, 403, 409].includes(Number(error?.status));
}

export async function retryTinodeMembershipRequest(request, retryAvailable = true) {
  try {
    return await request(false);
  } catch (error) {
    if (!retryAvailable || !shouldRetryTinodeMembership(error)) throw error;
    return request(true);
  }
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
  const value = [account?.tenantId, account?.tenant_id, account?.tenant?.id]
    .map(item => typeof item === 'string' || typeof item === 'number' ? String(item).trim() : '')
    .find(Boolean);
  return value || tenantId;
}

function scalarText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function avatarText(value) {
  const direct = scalarText(value);
  if (direct) return direct;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return ['url', 'ref', 'src', 'href', 'path', 'uri']
    .map(name => scalarText(value[name]))
    .find(Boolean) || '';
}

function mediaVersionText(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return ['version', 'updatedAt', 'updated_at', 'lastModified', 'last_modified']
    .map(name => scalarText(value[name]))
    .find(Boolean) || '';
}

function booleanValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

export function normalizeTenantOptions(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map(option => {
    if (!option || typeof option !== 'object') return null;
    const id = [option.id, option.tenantId, option.tenant_id].map(scalarText).find(Boolean) || '';
    if (!id || seen.has(id)) return null;
    seen.add(id);
    const name = [option.name, option.tenantName, option.tenant_name, id].map(scalarText).find(Boolean) || id;
    const normalized = {
      id,
      name,
      role: ([option.role, 'member'].map(scalarText).find(Boolean) || 'member').toLowerCase(),
      accountRole: ([option.accountRole, option.account_role, 'member'].map(scalarText).find(Boolean) || 'member').toLowerCase(),
      active: booleanValue(option.active ?? option.is_active, true),
    };
    const logo = [
      option.logo,
      option.logoUrl,
      option.logo_url,
      option.companyLogo,
      option.company_logo,
      option.company_logo_url,
      option.brandLogo,
      option.brand_logo,
      option.brand_logo_url,
    ].map(avatarText).find(Boolean) || '';
    const logoVersion = [
      option.logoVersion,
      option.logo_version,
      option.logoUpdatedAt,
      option.logo_updated_at,
      option.companyLogoVersion,
      option.company_logo_version,
      option.brandLogoVersion,
      option.brand_logo_version,
      option.updatedAt,
      option.updated_at,
      option.companyUpdatedAt,
      option.company_updated_at,
      option.brandUpdatedAt,
      option.brand_updated_at,
    ].map(scalarText).find(Boolean)
      || [option.logo, option.companyLogo, option.company_logo, option.brandLogo, option.brand_logo]
        .map(mediaVersionText)
        .find(Boolean)
      || '';
    if (logo) normalized.logo = logo;
    if (logoVersion) normalized.logoVersion = logoVersion;
    return normalized;
  }).filter(option => option?.active);
}

export function employeeLoginPayload(credentials = {}) {
  const payload = {
    identity: String(credentials.identity || credentials.username || '').trim(),
    password: String(credentials.password || ''),
  };
  // Account login derives the tenant from UpGO's verified current membership.
  // Only the legacy local-password flow needs the configured tenant hint.
  if (authMode === 'password' && tenantId) payload.tenant_id = tenantId;
  return payload;
}

function publicAccount(account) {
  if (!account) return null;
  const {
    password: _password,
    password_hash: _passwordHash,
    passwordHash: _passwordHashCamel,
    secret: _secret,
    ...safe
  } = account;
  const normalized = normalizeAccountShape(safe);
  if (!normalized) return null;
  const tenantOptions = normalizeTenantOptions(
    safe.tenantOptions || safe.tenant_options,
  );
  return {
    ...normalized,
    tenantId: accountTenant(normalized),
    tenant_id: accountTenant(normalized),
    tenantOptions,
    tenant_options: tenantOptions,
    tenant: normalizeTenantShape(safe.tenant || normalized.tenant),
  };
}

function hydrateActiveSession(payload, { preserveExisting = true } = {}) {
  const account = publicAccount(payload?.user || payload?.current_user || payload);
  const tenantOptions = normalizeTenantOptions(
    payload?.tenantOptions || payload?.tenant_options || account?.tenantOptions,
  );
  if (account) {
    account.tenantOptions = tenantOptions;
    account.tenant_options = tenantOptions;
  }
  const tenant = normalizeTenantShape(payload?.tenant || account?.tenant);
  const rawTinodeAuth = payload?.tinode || payload?.tinode_auth || {};
  const hasTinodeToken = Boolean(rawTinodeAuth.token || payload?.tinode_token);
  const previous = preserveExisting ? activeSession : null;
  const tinodeAuth = previous?.tinodeAuth || (hasTinodeToken ? {
    ...rawTinodeAuth,
    username: rawTinodeAuth.username || account?.tinodeUsername || account?.tinode_username || account?.username,
    uid: rawTinodeAuth.uid || account?.tinodeUid || account?.tinode_uid,
    token: rawTinodeAuth.token || payload?.tinode_token,
    displayName: account?.name || '',
    avatar: account?.avatar || '',
    tenantId: tenant?.id || account?.tenantId || account?.tenant_id || tenantId,
    tenantName: tenant?.name || account?.tenantName || account?.tenant_name || '',
  } : null);
  const connection = previous?.connection || payload?.connection || (hasTinodeToken ? 'tinode' : 'management');
  activeSession = {
    ...(previous || {}),
    user: account,
    tenant,
    tenantOptions,
    connection,
    tinodeAuth,
  };
  return { ...account, tenant, tenantOptions, connection };
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

async function membershipApiRequest(path, method, body = {}) {
  const request = async force => {
    const tinodeAuth = shouldRequestTinodeAuth(activeSession, force)
      ? await chatManagementService.getFreshTinodeAuth({ force })
      : null;
    return apiRequest(path, {
      method,
      body: JSON.stringify({
        ...body,
        tinode_token: tinodeAuth?.token || '',
      }),
    });
  };

  return retryTinodeMembershipRequest(
    request,
    Boolean(activeSession),
  );
}

function normalizeConversation(record) {
  const properties = record?.properties || {};
  const tinodeTopic = record?.tinodeTopic || record?.tinode_topic || record?.channel_thread_id || '';
  const managementId = String(record?.managementId || record?.id || record?.conversation_no || tinodeTopic);
  const notificationMutedUntil = normalizeNotificationMuteUntil(
    record?.notificationMutedUntil ?? record?.notification_muted_until,
  );
  return normalizeConversationShape({
    id: managementId,
    managementId,
    tinodeTopic,
    managementSnapshot: true,
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
    pinned: Boolean(record?.pinned ?? record?.isPinned ?? properties.pinned),
    pinnedAt: record?.pinnedAt || record?.pinned_at || properties.pinnedAt || null,
  });
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

  async login(credentials = {}) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const passwordLogin = authMode === 'password';
    const accountCredentialLogin = authMode === 'account_password';
    const credentialLogin = passwordLogin || accountCredentialLogin;
    activeTinodePassword = '';
    const payload = await apiRequest(
      accountCredentialLogin
        ? '/api/v1/auth/account-login'
        : (passwordLogin ? '/api/v1/auth/login' : '/api/v1/auth/sso'),
      {
        method: 'POST',
        ...(credentialLogin ? {
          body: JSON.stringify(employeeLoginPayload(credentials)),
        } : {}),
      },
    );
    const account = publicAccount(payload.user || payload.current_user || payload);
    const tenantOptions = normalizeTenantOptions(
      payload.tenantOptions || payload.tenant_options || account?.tenantOptions,
    );
    if (account) {
      account.tenantOptions = tenantOptions;
      account.tenant_options = tenantOptions;
    }
    const tenant = normalizeTenantShape(payload.tenant || account?.tenant);
    const rawTinodeAuth = payload.tinode || payload.tinode_auth || {};
    const hasTinodeToken = Boolean(rawTinodeAuth.token || payload.tinode_token);
    const connection = payload.connection || (hasTinodeToken ? 'tinode' : 'management');
    tinodeTokenRequest = null;
    activeTinodePassword = passwordLogin ? String(credentials.password || '') : '';
    activeSession = {
      user: account,
      tenant,
      tenantOptions,
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
    return { ...account, tenant, tenantOptions, connection };
  },

  async currentSession() {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const session = await this.refreshSessionMetadata();
    return publicAccount(session);
  },

  async refreshSessionMetadata() {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest('/api/v1/auth/me');
    return hydrateActiveSession(payload, { preserveExisting: true });
  },

  async restoreSession() {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest('/api/v1/auth/me');
    return hydrateActiveSession(payload, { preserveExisting: false });
  },

  async switchTenant(nextTenantId) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const requestedTenantId = String(nextTenantId || '').trim();
    if (!requestedTenantId) throw new Error('A company is required.');
    const payload = await apiRequest('/api/v1/auth/switch-tenant', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: requestedTenantId }),
    });
    activeTinodePassword = '';
    tinodeTokenRequest = null;
    lastDirectorySync = null;
    return hydrateActiveSession(payload, { preserveExisting: false });
  },

  async refreshTinodeToken() {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    if (!activeSession) throw new Error('Phiên Chatmgt chưa sẵn sàng.');
    if (!tinodeTokenRequest) {
      const requestedSession = activeSession;
      const request = apiRequest('/api/v1/auth/tinode-token', {
        method: 'POST',
        body: JSON.stringify(tinodeRefreshPayload(
          requestedSession.tinodeAuth,
          activeTinodePassword,
        )),
      })
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
    activeTinodePassword = '';
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
    const payload = await membershipApiRequest(
      `/api/v1/conversation/${encodeURIComponent(conversationId)}/participants`,
      'POST',
      { participant_ids: participantIds },
    );
    return normalizeConversation(payload);
  },

  async removeConversationParticipant(conversationId, participantId) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await membershipApiRequest(
      `/api/v1/conversation/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(participantId)}`,
      'DELETE',
    );
    return normalizeConversation(payload);
  },

  async deleteConversationForCurrentUser(conversationId) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const tinodeAuth = activeSession?.tinodeAuth
      ? await this.getFreshTinodeAuth()
      : null;
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/self`, {
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

  async updateConversationPin(conversationId, pinned) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ pinned: Boolean(pinned) }),
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

  async enableTinodeChatbot(conversationId) {
    if (!apiBase || !remoteAuth) return false;
    await membershipApiRequest(
      `/api/v1/conversation/${encodeURIComponent(conversationId)}/tinode-chatbot`,
      'POST',
    );
    return true;
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
    tenantOptions: normalizeTenantOptions(account.tenantOptions || account.tenant_options),
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
  mode: authMode,

  accountLoginUrl() {
    if (typeof window === 'undefined') return accountUrl;
    const continueUrl = new URL(window.location.href);
    continueUrl.searchParams.set('account_sso', '1');
    const loginUrl = new URL(`${accountUrl}/`);
    loginUrl.searchParams.set('continue', continueUrl.toString());
    return loginUrl.toString();
  },

  async login(credentials) {
    return toLoginSession(await chatManagementService.login(credentials));
  },

  async restoreSession() {
    return toLoginSession(await chatManagementService.restoreSession());
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
