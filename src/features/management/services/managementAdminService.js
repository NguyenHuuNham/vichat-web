import { normalizeChatMaintenanceState } from '../../maintenance/chatMaintenanceService.js';

const env = import.meta.env || {};
const configuredBase = String(env.VITE_CHAT_MANAGEMENT_API_URL || '').replace(/\/$/, '');
const tenantId = String(env.VITE_CHAT_TENANT_ID || '').trim();
const accountUrl = String(env.VITE_ACCOUNT_URL || 'https://account.gonplatform.com').replace(/\/+$/, '');
const accountAdminCallbackMarker = 'vichat_admin_sso';

const errorMessages = {
  ACCOUNT_ADMIN_REQUIRED: 'Tài khoản UpGO Account hiện tại không có quyền quản trị tenant này.',
  ACCOUNT_LOGIN_REQUIRED: 'Bạn cần đăng nhập UpGO Account trước khi vào trang quản trị.',
  AUTH_METHOD_DISABLED: 'Trang quản trị chỉ chấp nhận đăng nhập bằng UpGO Account.',
  FORBIDDEN: 'Phiên hiện tại chưa có quyền quản trị. Vui lòng đăng nhập lại.',
  LOGIN_FAILED: 'Tên đăng nhập hoặc mật khẩu không đúng.',
  LOGIN_RATE_LIMITED: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.',
  NOT_FOUND: 'Không tìm thấy tài khoản trong đơn vị này.',
  PARAM_ERROR: 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường đã nhập.',
  PASSWORD_INVALID: 'Mật khẩu chưa đáp ứng yêu cầu bảo mật.',
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  SESSION_REVOKE_FAILED: 'Không thể thu hồi phiên đăng nhập của tài khoản này.',
  MANAGEMENT_USER_ACTION_DISABLED: 'Chatmgt chỉ cho phép bắt tài khoản đăng xuất khỏi Chat.',
  MANAGEMENT_CHAT_METADATA_HIDDEN: 'Thông tin hội thoại không có trên trang quản trị.',
};

export function accountAdminLoginUrl(returnUrl) {
  const callback = new URL(returnUrl || window.location.href);
  callback.searchParams.set(accountAdminCallbackMarker, '1');
  const target = new URL(`${accountUrl}/`);
  target.searchParams.set('continue', callback.toString());
  return target.toString();
}

export function consumeAccountAdminCallback(currentUrl) {
  const url = new URL(currentUrl || window.location.href);
  const shouldRetry = url.searchParams.get(accountAdminCallbackMarker) === '1';
  if (shouldRetry) url.searchParams.delete(accountAdminCallbackMarker);
  return { shouldRetry, cleanUrl: url.toString() };
}

function managementBaseUrl() {
  if (typeof window !== 'undefined' && window.location.hostname === 'chatmgt.gonplatform.com') return '';
  return configuredBase;
}

function responseItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.objects)) return payload.objects;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

export function normalizeManagementUser(account) {
  if (!account) return null;
  const authSource = account.authSource || account.auth_source || 'local';
  return {
    ...account,
    id: account.id || account.user_id || account.uid,
    username: account.username || account.user_name || '',
    name: account.name || account.full_name || account.display_name || account.username || '',
    avatar: account.avatar || account.avatarUrl || account.avatar_url || account.photo || '',
    tenantId: account.tenantId || account.tenant_id || tenantId,
    tenantName: account.tenantName || account.tenant_name || account.tenant?.name || '',
    tinodeUid: account.tinodeUid || account.tinode_uid || '',
    authSource,
    accountManaged: account.accountManaged ?? account.account_managed ?? authSource === 'account',
    active: account.active ?? account.is_active ?? true,
    lastLoginAt: account.lastLoginAt || account.last_login_at || null,
    createdAt: account.createdAt || account.created_at || null,
    updatedAt: account.updatedAt || account.updated_at || null,
  };
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${managementBaseUrl()}${path}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'X-Vichat-Session-Scope': 'management',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorCode = payload?.error_code || `HTTP_${response.status}`;
    const error = new Error(errorMessages[errorCode] || payload?.error_message || payload?.message || `Lỗi HTTP ${response.status}`);
    error.code = errorCode;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export const managementAdminService = {
  async login() {
    const payload = await apiRequest('/api/v1/admin/sso', {
      method: 'POST',
    });
    return {
      user: normalizeManagementUser(payload.user || payload.current_user || payload),
      tenant: payload.tenant || null,
    };
  },

  async currentSession() {
    const payload = await apiRequest('/api/v1/auth/me');
    return {
      user: normalizeManagementUser(payload.user || payload.current_user || payload),
      tenant: payload.tenant || null,
    };
  },

  async logout() {
    return apiRequest('/api/v1/auth/logout', { method: 'POST' });
  },

  startAccountLogin() {
    if (typeof window !== 'undefined') window.location.assign(accountAdminLoginUrl(window.location.href));
  },

  consumeAccountLoginCallback() {
    if (typeof window === 'undefined') return false;
    const callback = consumeAccountAdminCallback(window.location.href);
    if (callback.shouldRetry) window.history.replaceState({}, '', callback.cleanUrl);
    return callback.shouldRetry;
  },

  async health() {
    return apiRequest('/api/v1/auth/health');
  },

  async getChatUiMaintenance() {
    const payload = await apiRequest('/api/v1/admin/chat-ui-maintenance');
    return normalizeChatMaintenanceState(payload);
  },

  async setChatUiMaintenance(enabled) {
    const payload = await apiRequest('/api/v1/admin/chat-ui-maintenance', {
      method: 'PUT',
      body: JSON.stringify({ enabled: Boolean(enabled) }),
    });
    return normalizeChatMaintenanceState(payload);
  },

  async listUsers({ query = '' } = {}) {
    const params = new URLSearchParams({ include_inactive: 'true', results_per_page: '1000' });
    if (query.trim()) params.set('q', query.trim());
    const payload = await apiRequest(`/api/v1/chat/users?${params}`);
    return responseItems(payload).map(normalizeManagementUser).filter(Boolean);
  },

  async revokeSessions(userId) {
    return apiRequest(`/api/v1/chat/users/${encodeURIComponent(userId)}/revoke-session`, { method: 'POST' });
  },

  async listAuditLogs({ event = '', limit = 150 } = {}) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (event.trim()) params.set('event', event.trim());
    const payload = await apiRequest(`/api/v1/admin/audit-logs?${params}`);
    return responseItems(payload);
  },
};
