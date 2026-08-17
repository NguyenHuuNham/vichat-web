const env = import.meta.env || {};
const apiBase = String(env.VITE_CHAT_MANAGEMENT_API_URL || '').replace(/\/$/, '');
const remoteAuth = String(env.VITE_CHAT_MANAGEMENT_REMOTE_AUTH || '').toLowerCase() === 'true';

export const ENTERPRISE_TYPES = [
  { value: 'TASK', label: 'Công việc', icon: 'fa-list-check', color: 'orange' },
  { value: 'ANNOUNCEMENT', label: 'Thông báo bắt buộc', icon: 'fa-bullhorn', color: 'red' },
  { value: 'APPROVAL', label: 'Phê duyệt', icon: 'fa-stamp', color: 'purple' },
  { value: 'TICKET', label: 'Yêu cầu hỗ trợ', icon: 'fa-ticket', color: 'blue' },
  { value: 'WIKI', label: 'Wiki / Quy trình', icon: 'fa-book-open', color: 'green' },
  { value: 'EVENT', label: 'Lịch công ty', icon: 'fa-calendar-days', color: 'teal' },
  { value: 'INTEGRATION', label: 'Ứng dụng tích hợp', icon: 'fa-plug', color: 'slate' },
];

export const ENTERPRISE_STATUSES = {
  TASK: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'],
  ANNOUNCEMENT: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  APPROVAL: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
  TICKET: ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'],
  WIKI: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  EVENT: ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
  INTEGRATION: ['ACTIVE', 'PAUSED', 'ERROR', 'ARCHIVED'],
};

function assertConfigured() {
  if (!apiBase || !remoteAuth) throw new Error('Enterprise Workspace chưa được cấu hình kết nối Chatmgt.');
}

async function apiRequest(path, options = {}) {
  assertConfigured();
  const response = await fetch(`${apiBase}${path}`, {
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
    const error = new Error(payload?.error_message || payload?.message || `Workspace HTTP ${response.status}`);
    error.code = payload?.error_code || `HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return payload;
}

function responseItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.objects)) return payload.objects;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeWorkspaceItem(item = {}) {
  return {
    ...item,
    id: String(item.id || ''),
    type: String(item.type || item.itemType || '').toUpperCase(),
    title: String(item.title || ''),
    description: String(item.description || ''),
    status: String(item.status || '').toUpperCase(),
    priority: String(item.priority || 'NORMAL').toUpperCase(),
    visibility: String(item.visibility || 'COMPANY').toUpperCase(),
    createdAt: normalizeTimestamp(item.createdAt),
    updatedAt: normalizeTimestamp(item.updatedAt),
    dueAt: normalizeTimestamp(item.dueAt),
    startsAt: normalizeTimestamp(item.startsAt),
    endsAt: normalizeTimestamp(item.endsAt),
    publishedAt: normalizeTimestamp(item.publishedAt),
    closedAt: normalizeTimestamp(item.closedAt),
    properties: item.properties && typeof item.properties === 'object' ? item.properties : {},
    participants: Array.isArray(item.participants) ? item.participants : [],
    activity: Array.isArray(item.activity) ? item.activity : [],
    allowedActions: Array.isArray(item.allowedActions) ? item.allowedActions : [],
    canEdit: Boolean(item.canEdit),
  };
}

function queryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') query.set(key, String(value));
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

export const enterpriseWorkspaceService = {
  async listItems(params = {}) {
    const payload = await apiRequest(`/api/v1/workspace/items${queryString(params)}`);
    return {
      items: responseItems(payload).map(normalizeWorkspaceItem),
      summary: payload?.summary || null,
    };
  },

  async search(query, params = {}) {
    return this.listItems({ ...params, q: String(query || '').trim() });
  },

  async stats() {
    return apiRequest('/api/v1/workspace/stats');
  },

  async meta() {
    return apiRequest('/api/v1/workspace/meta');
  },

  async getItem(itemId) {
    const payload = await apiRequest(`/api/v1/workspace/items/${encodeURIComponent(itemId)}`);
    return normalizeWorkspaceItem(payload);
  },

  async createItem(input) {
    const payload = await apiRequest('/api/v1/workspace/items', {
      method: 'POST',
      body: JSON.stringify(input || {}),
    });
    return normalizeWorkspaceItem(payload);
  },

  async updateItem(itemId, input) {
    const payload = await apiRequest(`/api/v1/workspace/items/${encodeURIComponent(itemId)}`, {
      method: 'PUT',
      body: JSON.stringify(input || {}),
    });
    return normalizeWorkspaceItem(payload);
  },

  async archiveItem(itemId) {
    return apiRequest(`/api/v1/workspace/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
  },

  async applyAction(itemId, action, comment = '') {
    const payload = await apiRequest(`/api/v1/workspace/items/${encodeURIComponent(itemId)}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action, comment }),
    });
    return normalizeWorkspaceItem(payload);
  },

  async listActivity(itemId) {
    const payload = await apiRequest(`/api/v1/workspace/items/${encodeURIComponent(itemId)}/activity`);
    return responseItems(payload);
  },
};

export function formatWorkspaceDate(value, { withTime = true, locale = 'vi-VN' } = {}) {
  const fallback = locale.startsWith('en') ? 'Not set' : 'Chưa đặt';
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function workspaceTypeMeta(type) {
  return ENTERPRISE_TYPES.find(item => item.value === type) || ENTERPRISE_TYPES[0];
}

export function workspaceStatusLabel(status) {
  const labels = {
    TODO: 'Chưa làm', IN_PROGRESS: 'Đang làm', BLOCKED: 'Bị chặn', DONE: 'Hoàn tất', CANCELLED: 'Đã hủy',
    DRAFT: 'Bản nháp', PUBLISHED: 'Đã phát hành', ARCHIVED: 'Đã lưu trữ', PENDING: 'Chờ duyệt',
    APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', OPEN: 'Mở', WAITING: 'Đang chờ', RESOLVED: 'Đã xử lý',
    CLOSED: 'Đã đóng', SCHEDULED: 'Đã lên lịch', ACTIVE: 'Đang hoạt động', COMPLETED: 'Đã hoàn tất',
    PAUSED: 'Tạm dừng', ERROR: 'Lỗi',
  };
  return labels[status] || status || 'Chưa xác định';
}
