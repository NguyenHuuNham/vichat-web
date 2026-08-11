import { WorkspaceItem } from '../types';
import { apiRequest, responseItems } from './apiClient';

export const WORKSPACE_TYPES = [
  { value: 'TASK', label: 'Công việc' },
  { value: 'ANNOUNCEMENT', label: 'Thông báo' },
  { value: 'APPROVAL', label: 'Phê duyệt' },
  { value: 'TICKET', label: 'Yêu cầu hỗ trợ' },
  { value: 'WIKI', label: 'Wiki / Quy trình' },
  { value: 'EVENT', label: 'Lịch công ty' },
  { value: 'INTEGRATION', label: 'Ứng dụng tích hợp' },
] as const;

export const STATUS_LABELS: Record<string, string> = {
  TODO: 'Chưa làm', IN_PROGRESS: 'Đang làm', BLOCKED: 'Bị chặn', DONE: 'Hoàn tất', CANCELLED: 'Đã hủy',
  DRAFT: 'Bản nháp', PUBLISHED: 'Đã phát hành', ARCHIVED: 'Đã lưu trữ', PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối', OPEN: 'Mở', WAITING: 'Đang chờ', RESOLVED: 'Đã xử lý', CLOSED: 'Đã đóng', SCHEDULED: 'Đã lên lịch',
  ACTIVE: 'Đang hoạt động', COMPLETED: 'Đã hoàn tất', PAUSED: 'Tạm dừng', ERROR: 'Lỗi',
};

export function normalizeWorkspaceItem(item: any = {}): WorkspaceItem {
  const timestamp = (value: any) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };
  return {
    ...item,
    id: String(item.id || ''),
    type: String(item.type || item.itemType || '').toUpperCase(),
    title: String(item.title || ''),
    description: String(item.description || ''),
    status: String(item.status || '').toUpperCase(),
    priority: String(item.priority || 'NORMAL').toUpperCase(),
    visibility: String(item.visibility || 'COMPANY').toUpperCase(),
    createdAt: timestamp(item.createdAt),
    updatedAt: timestamp(item.updatedAt),
    dueAt: timestamp(item.dueAt),
    startsAt: timestamp(item.startsAt),
    endsAt: timestamp(item.endsAt),
    properties: item.properties && typeof item.properties === 'object' ? item.properties : {},
    participants: Array.isArray(item.participants) ? item.participants : [],
    activity: Array.isArray(item.activity) ? item.activity : [],
    allowedActions: Array.isArray(item.allowedActions) ? item.allowedActions : [],
    canEdit: Boolean(item.canEdit),
  };
}

export const workspaceService = {
  async listItems(params: Record<string, string> = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => value && query.set(key, value));
    const payload = await apiRequest(`/api/v1/workspace/items${query.toString() ? `?${query}` : ''}`);
    return { items: responseItems(payload).map(normalizeWorkspaceItem), summary: payload?.summary || null };
  },
  getItem(id: string) {
    return apiRequest(`/api/v1/workspace/items/${encodeURIComponent(id)}`).then(normalizeWorkspaceItem);
  },
  applyAction(id: string, action: string, comment = '') {
    return apiRequest(`/api/v1/workspace/items/${encodeURIComponent(id)}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action, comment }),
    }).then(normalizeWorkspaceItem);
  },
};
