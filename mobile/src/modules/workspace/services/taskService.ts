import { apiRequest, responseItems } from '../../../services/apiClient';
import { CreateTaskPayload, TaskItem, TaskPriority, TaskStatus } from '../types';

function parseTimestamp(value: any): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeTask(raw: any = {}): TaskItem {
  const props = (raw.properties && typeof raw.properties === 'object') ? raw.properties : {};
  const participants = Array.isArray(raw.participants) ? raw.participants : [];
  const assignee = participants.find((p: any) => p.role === 'ASSIGNEE') || participants[0];

  return {
    id: String(raw.id || ''),
    title: String(raw.title || ''),
    description: String(raw.description || ''),
    status: (String(raw.status || 'TODO').toUpperCase() as TaskStatus),
    priority: (String(raw.priority || 'NORMAL').toUpperCase() as TaskPriority),
    dueAt: parseTimestamp(raw.dueAt || raw.due_at),
    startsAt: parseTimestamp(raw.startsAt || raw.starts_at),
    createdAt: parseTimestamp(raw.createdAt || raw.created_at),
    updatedAt: parseTimestamp(raw.updatedAt || raw.updated_at),
    ownerId: String(raw.ownerId || raw.owner_id || raw.createdBy || raw.created_by || ''),
    ownerName: String(raw.ownerName || raw.owner_name || raw.creatorName || raw.creator_name || ''),
    assigneeId: assignee ? String(assignee.accountId || assignee.account_id || assignee.id || '') : null,
    assigneeName: assignee ? String(assignee.name || assignee.fullName || assignee.full_name || '') : null,
    groupName: String(props.group_name || props.source_conversation_name || 'Nhóm mặc định'),
    subtasks: Array.isArray(props.checklist)
      ? props.checklist.map((item: any, idx: number) => ({
          id: String(idx + 1),
          title: typeof item === 'string' ? item : String(item?.title || item?.text || ''),
          completed: typeof item === 'object' ? Boolean(item?.completed || item?.done) : false,
        }))
      : [],
    version: Number(raw.version || 1),
    rawItem: raw,
  };
}

export const taskService = {
  async listTasks(params: { query?: string; status?: string } = {}): Promise<TaskItem[]> {
    const query = new URLSearchParams();
    query.set('type', 'TASK');
    if (params.query) query.set('q', params.query);
    if (params.status) query.set('status', params.status);

    const payload = await apiRequest(`/api/v1/workspace/items?${query.toString()}`);
    const items = responseItems(payload);
    return items.map(normalizeTask);
  },

  async createTask(payload: CreateTaskPayload): Promise<TaskItem> {
    const body: Record<string, any> = {
      type: 'TASK',
      title: payload.title.trim(),
      description: payload.description?.trim() || '',
      status: 'TODO',
      priority: payload.priority || 'NORMAL',
      visibility: 'COMPANY',
      due_at: payload.dueAt || null,
      properties: {
        source_conversation_name: payload.groupName?.trim() || 'Nhóm mặc định',
        checklist: (payload.subtasks || []).map(t => String(t || '').trim()).filter(Boolean),
      },
    };

    if (payload.assigneeId) {
      body.participants = [
        { account_id: payload.assigneeId, role: 'ASSIGNEE' },
      ];
    }

    const created = await apiRequest('/api/v1/workspace/items', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return normalizeTask(created);
  },

  async toggleComplete(task: TaskItem): Promise<TaskItem> {
    const action = task.status === 'DONE' ? 'REOPEN' : 'COMPLETE';
    try {
      const updated = await apiRequest(`/api/v1/workspace/items/${encodeURIComponent(task.id)}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      return normalizeTask(updated);
    } catch {
      // Fallback direct status update if actions fails
      const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
      const updated = await apiRequest(`/api/v1/workspace/items/${encodeURIComponent(task.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: newStatus,
          version: task.version,
        }),
      });
      return normalizeTask(updated);
    }
  },

  async updateTask(id: string, patch: Partial<CreateTaskPayload>, version: number): Promise<TaskItem> {
    const body: Record<string, any> = { version };
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.description !== undefined) body.description = patch.description;
    if (patch.priority !== undefined) body.priority = patch.priority;
    if (patch.dueAt !== undefined) body.due_at = patch.dueAt;
    if (patch.groupName !== undefined) {
      body.properties = { source_conversation_name: patch.groupName };
    }

    const updated = await apiRequest(`/api/v1/workspace/items/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return normalizeTask(updated);
  },

  async deleteTask(id: string): Promise<void> {
    await apiRequest(`/api/v1/workspace/items/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async getStats(): Promise<any> {
    return apiRequest('/api/v1/workspace/stats');
  },
};
