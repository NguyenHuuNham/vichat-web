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
  const { headers: requestHeaders = {}, ...requestOptions } = options;
  const response = await fetch(`${apiBase}${path}`, {
    ...requestOptions,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...requestHeaders,
    },
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
    version: Number.isFinite(Number(item.version)) ? Number(item.version) : 1,
    properties: item.properties && typeof item.properties === 'object' ? item.properties : {},
    participants: Array.isArray(item.participants) ? item.participants : [],
    activity: Array.isArray(item.activity) ? item.activity : [],
    allowedActions: Array.isArray(item.allowedActions) ? item.allowedActions : [],
    canEdit: Boolean(item.canEdit),
  };
}

export function mergeWorkspaceProperties(existing = {}, incoming = {}) {
  const merged = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? { ...existing }
    : {};
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return merged;
  Object.entries(incoming).forEach(([key, value]) => {
    if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) delete merged[key];
    else merged[key] = value;
  });
  return merged;
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
    const { signal, ...queryParams } = params || {};
    const payload = await apiRequest(`/api/v1/workspace/items${queryString(queryParams)}`, { signal });
    return {
      items: responseItems(payload).map(normalizeWorkspaceItem),
      summary: payload?.summary || null,
      nextCursor: payload?.next_cursor || payload?.nextCursor || null,
      hasMore: Boolean(payload?.has_more ?? payload?.hasMore ?? payload?.next_cursor ?? payload?.nextCursor),
      total: Number.isFinite(Number(payload?.total)) ? Number(payload.total) : null,
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

  async getItem(itemId, { signal } = {}) {
    const payload = await apiRequest(`/api/v1/workspace/items/${encodeURIComponent(itemId)}`, { signal });
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

  async archiveItem(itemId, version) {
    return apiRequest(`/api/v1/workspace/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
      body: JSON.stringify({ version }),
    });
  },

  async applyAction(itemId, action, comment = '', version) {
    const payload = await apiRequest(`/api/v1/workspace/items/${encodeURIComponent(itemId)}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action, comment, version }),
    });
    return normalizeWorkspaceItem(payload);
  },

  async listActivity(itemId, { signal } = {}) {
    const payload = await apiRequest(`/api/v1/workspace/items/${encodeURIComponent(itemId)}/activity`, { signal });
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

export const PARTICIPANT_ROLE_LABELS = {
  ASSIGNEE: 'Người phụ trách',
  COLLABORATOR: 'Người cùng làm việc',
  APPROVER: 'Người duyệt / nghiệm thu',
  WATCHER: 'Người theo dõi',
  RECIPIENT: 'Người nhận',
  EDITOR: 'Biên tập viên',
  ATTENDEE: 'Người tham dự',
  OWNER: 'Phụ trách',
};

export function getDueStatus(dueAt, status) {
  if (!dueAt) return { isOverdue: false, isDueToday: false, isUpcoming: false, label: null, tone: 'neutral' };
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) {
    return { isOverdue: false, isDueToday: false, isUpcoming: false, label: null, tone: 'neutral' };
  }
  const now = new Date();
  const isCompleted = ['DONE', 'CANCELLED', 'APPROVED', 'REJECTED', 'RESOLVED', 'CLOSED', 'ARCHIVED'].includes(String(status).toUpperCase());

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 86400000);
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const isDueToday = startOfDue.getTime() === startOfToday.getTime();
  const isOverdue = !isCompleted && due.getTime() < now.getTime() && !isDueToday;
  const isUpcoming = due.getTime() >= startOfTomorrow.getTime();

  let label = `${due.getDate()}/${due.getMonth() + 1}`;
  if (isDueToday) {
    const hours = String(due.getHours()).padStart(2, '0');
    const mins = String(due.getMinutes()).padStart(2, '0');
    label = `Hôm nay${due.getHours() || due.getMinutes() ? ` ${hours}:${mins}` : ''}`;
  } else if (isOverdue) {
    const diffDays = Math.max(1, Math.floor((now.getTime() - due.getTime()) / 86400000));
    label = `Trễ ${diffDays} ngày`;
  }

  const tone = isOverdue ? 'danger' : isDueToday ? 'warning' : 'neutral';
  return { isOverdue, isDueToday, isUpcoming, label, tone, dueTime: due.getTime() };
}

function resolveAccount(accountId, accounts = []) {
  if (!accountId) return null;
  const match = accounts.find(a => String(a.id || a.uid) === String(accountId));
  if (match) {
    return {
      id: String(match.id || match.uid),
      name: match.name || match.fullName || match.username || 'Thành viên',
      avatar: match.avatar || null,
      department: match.department || match.title || '',
    };
  }
  return { id: String(accountId), name: String(accountId), avatar: null, department: '' };
}

export function normalizeTaskExtended(item = {}, accounts = [], currentUserId = '') {
  const normalized = normalizeWorkspaceItem(item);
  const props = normalized.properties || {};
  const currentUid = String(currentUserId || '');

  // Resolve Creator
  const creatorId = normalized.createdBy || normalized.ownerId || item.created_by || item.owner_id || '';
  const creator = normalized.owner && normalized.owner.name
    ? normalized.owner
    : resolveAccount(creatorId, accounts) || { id: creatorId, name: 'Người giao việc' };

  // Resolve Participants by Role
  const participants = normalized.participants || [];
  const assigneeEntry = participants.find(p => p.role === 'ASSIGNEE');
  const assigneeId = assigneeEntry ? (assigneeEntry.accountId || assigneeEntry.id) : (normalized.ownerId || creatorId);
  const assignee = assigneeEntry?.account?.name
    ? assigneeEntry.account
    : resolveAccount(assigneeId, accounts) || { id: assigneeId, name: 'Chưa chỉ định' };

  const collaborators = participants
    .filter(p => p.role === 'COLLABORATOR')
    .map(p => p.account?.name ? p.account : resolveAccount(p.accountId || p.id, accounts));

  const approverEntry = participants.find(p => p.role === 'APPROVER');
  const approver = approverEntry
    ? (approverEntry.account?.name ? approverEntry.account : resolveAccount(approverEntry.accountId || approverEntry.id, accounts))
    : (props.report_to_name ? { id: '', name: props.report_to_name } : null);

  // Subtasks normalization
  const rawSubtasks = Array.isArray(props.subtasks)
    ? props.subtasks
    : Array.isArray(props.checklist)
    ? props.checklist
    : [];

  const subtasks = rawSubtasks.map((entry, idx) => {
    if (typeof entry === 'object' && entry !== null) {
      return {
        id: String(entry.id || idx + 1),
        title: String(entry.title || entry.text || ''),
        completed: Boolean(entry.completed || entry.done),
      };
    }
    return {
      id: String(idx + 1),
      title: String(entry || ''),
      completed: false,
    };
  }).filter(s => Boolean(s.title));

  const completedSubtasks = subtasks.filter(s => s.completed).length;
  const subtaskProgress = subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 0;

  // Due status
  const dueStatus = getDueStatus(normalized.dueAt, normalized.status);

  // User relationship
  const isAssignedToMe = String(assignee.id) === currentUid;
  const isCollaboratingWithMe = collaborators.some(c => String(c.id) === currentUid);
  const isCreatedByMe = String(creatorId) === currentUid;
  const isApproverMe = approver ? String(approver.id) === currentUid : false;

  const isCompleted = normalized.status === 'DONE' || normalized.status === 'CANCELLED';
  const isMyTodayTask = (isAssignedToMe || isCollaboratingWithMe) &&
    !isCompleted &&
    (dueStatus.isDueToday || dueStatus.isOverdue || normalized.status === 'IN_PROGRESS');

  return {
    ...normalized,
    creator,
    assignee,
    collaborators,
    approver,
    subtasks,
    subtaskStats: {
      total: subtasks.length,
      completed: completedSubtasks,
      progress: subtaskProgress,
    },
    groupName: String(props.group_name || props.source_conversation_name || 'Nhóm chung'),
    taskHash: String(props.task_hash || ''),
    dueStatus,
    isAssignedToMe,
    isCollaboratingWithMe,
    isCreatedByMe,
    isApproverMe,
    isMyTodayTask,
  };
}

export function filterWorkspaceTasks(tasks = [], { scope = 'TODAY', statusFilter = 'ALL', query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return tasks.filter(task => {
    if (q) {
      const matchTitle = (task.title || '').toLowerCase().includes(q);
      const matchDesc = (task.description || '').toLowerCase().includes(q);
      const matchGroup = (task.groupName || '').toLowerCase().includes(q);
      const matchAssignee = (task.assignee?.name || '').toLowerCase().includes(q);
      const matchCreator = (task.creator?.name || '').toLowerCase().includes(q);
      const matchCollab = (task.collaborators || []).some(c => (c.name || '').toLowerCase().includes(q));
      if (!matchTitle && !matchDesc && !matchGroup && !matchAssignee && !matchCreator && !matchCollab) {
        return false;
      }
    }

    const isDone = task.status === 'DONE' || task.status === 'CANCELLED';
    if (statusFilter === 'ONGOING' && isDone) return false;
    if (statusFilter === 'COMPLETED' && !isDone) return false;

    switch (scope) {
      case 'TODAY':
        return task.isMyTodayTask;
      case 'ASSIGNED':
        return task.isAssignedToMe && !isDone;
      case 'COLLABORATING':
        return task.isCollaboratingWithMe && !isDone;
      case 'CREATED':
        return task.isCreatedByMe;
      case 'COMPLETED':
        return isDone;
      case 'ALL':
      default:
        return true;
    }
  });
}

export function groupWorkspaceTasks(tasks = [], groupBy = 'DUE_DATE') {
  if (groupBy === 'NONE') {
    return [{ id: 'all', title: 'Tất cả tác vụ', badge: tasks.length, tasks }];
  }

  if (groupBy === 'DUE_DATE') {
    const overdue = [];
    const today = [];
    const upcoming = [];
    const noDue = [];

    tasks.forEach(task => {
      if (!task.dueAt) {
        noDue.push(task);
      } else if (task.dueStatus.isOverdue) {
        overdue.push(task);
      } else if (task.dueStatus.isDueToday) {
        today.push(task);
      } else {
        upcoming.push(task);
      }
    });

    const groups = [];
    if (overdue.length > 0) groups.push({ id: 'overdue', title: 'Quá hạn', badge: overdue.length, tone: 'danger', tasks: overdue });
    if (today.length > 0) groups.push({ id: 'today', title: 'Hôm nay', badge: today.length, tone: 'warning', tasks: today });
    if (upcoming.length > 0) groups.push({ id: 'upcoming', title: 'Sắp tới', badge: upcoming.length, tone: 'neutral', tasks: upcoming });
    if (noDue.length > 0) groups.push({ id: 'no_due', title: 'Không có hạn', badge: noDue.length, tone: 'muted', tasks: noDue });
    return groups;
  }

  if (groupBy === 'PRIORITY') {
    const priorityOrder = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];
    const map = { URGENT: [], HIGH: [], NORMAL: [], LOW: [] };
    tasks.forEach(t => {
      const p = map[t.priority] ? t.priority : 'NORMAL';
      map[p].push(t);
    });
    const labels = { URGENT: 'Khẩn cấp', HIGH: 'Ưu tiên cao', NORMAL: 'Bình thường', LOW: 'Ưu tiên thấp' };
    const tones = { URGENT: 'danger', HIGH: 'warning', NORMAL: 'neutral', LOW: 'muted' };
    return priorityOrder
      .filter(p => map[p].length > 0)
      .map(p => ({ id: p, title: labels[p], badge: map[p].length, tone: tones[p], tasks: map[p] }));
  }

  if (groupBy === 'GROUP') {
    const groupMap = new Map();
    tasks.forEach(task => {
      const gName = task.groupName || 'Nhóm chung';
      if (!groupMap.has(gName)) groupMap.set(gName, []);
      groupMap.get(gName).push(task);
    });
    return Array.from(groupMap.entries()).map(([name, list]) => ({
      id: name,
      title: name,
      badge: list.length,
      tone: 'neutral',
      tasks: list,
    }));
  }

  return [{ id: 'all', title: 'Danh sách tác vụ', badge: tasks.length, tasks }];
}
