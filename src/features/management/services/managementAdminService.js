const env = import.meta.env || {};
const configuredBase = String(env.VITE_CHAT_MANAGEMENT_API_URL || '').replace(/\/$/, '');
const tenantId = env.VITE_CHAT_TENANT_ID || 'song-hong';

function managementBaseUrl() {
  if (typeof window !== 'undefined' && window.location.hostname === 'chatmgt.upgo.vn') return '';
  return configuredBase;
}

function responseItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.objects)) return payload.objects;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function normalizeUser(account) {
  if (!account) return null;
  return {
    ...account,
    id: account.id || account.user_id || account.uid,
    username: account.username || account.user_name || '',
    name: account.name || account.full_name || account.display_name || account.username || '',
    tenantId: account.tenantId || account.tenant_id || tenantId,
    tenantName: account.tenantName || account.tenant_name || account.tenant?.name || '',
    tinodeUid: account.tinodeUid || account.tinode_uid || '',
    active: account.active ?? account.is_active ?? true,
    lastLoginAt: account.lastLoginAt || account.last_login_at || null,
    createdAt: account.createdAt || account.created_at || null,
  };
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${managementBaseUrl()}${path}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error_message || payload?.message || `HTTP ${response.status}`);
    error.code = payload?.error_code || `HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export const managementAdminService = {
  async login({ identity, password }) {
    const payload = await apiRequest('/login', {
      method: 'POST',
      body: JSON.stringify({ identity: String(identity || '').trim(), password, tenant_id: tenantId }),
    });
    return {
      user: normalizeUser(payload.user || payload.current_user || payload),
      tenant: payload.tenant || null,
    };
  },

  async currentSession() {
    const payload = await apiRequest('/api/v1/auth/me');
    return {
      user: normalizeUser(payload.user || payload.current_user || payload),
      tenant: payload.tenant || null,
    };
  },

  async logout() {
    return apiRequest('/api/v1/auth/logout', { method: 'POST' });
  },

  async health() {
    return apiRequest('/api/v1/auth/health');
  },

  async listUsers({ query = '' } = {}) {
    const params = new URLSearchParams({ include_inactive: 'true', results_per_page: '1000' });
    if (query.trim()) params.set('q', query.trim());
    const payload = await apiRequest(`/api/v1/chat/users?${params}`);
    return responseItems(payload).map(normalizeUser).filter(Boolean);
  },

  async createUser(user) {
    return normalizeUser(await apiRequest('/api/v1/chat/users', {
      method: 'POST',
      body: JSON.stringify(user),
    }));
  },

  async updateUser(userId, changes) {
    return normalizeUser(await apiRequest(`/api/v1/chat/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify(changes),
    }));
  },

  async revokeSessions(userId) {
    return apiRequest(`/api/v1/chat/users/${encodeURIComponent(userId)}/revoke-session`, { method: 'POST' });
  },

  async resetPassword(userId, newPassword) {
    return apiRequest(`/api/v1/chat/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword }),
    });
  },

  async listAuditLogs({ event = '', limit = 150 } = {}) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (event.trim()) params.set('event', event.trim());
    const payload = await apiRequest(`/api/v1/admin/audit-logs?${params}`);
    return responseItems(payload);
  },
};
