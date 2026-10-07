import { describe, expect, it } from 'vitest';
import { normalizeTask } from '../services/taskService';

describe('normalizeTask', () => {
  it('correctly maps raw backend enterprise workspace item with object checklist', () => {
    const raw = {
      id: 'task-123',
      title: 'Thiết kế module Workspace Lark',
      description: 'Đóng gói vào thư mục riêng biệt',
      status: 'TODO',
      priority: 'HIGH',
      dueAt: '2026-10-07T12:00:00Z',
      createdAt: '2026-10-06T10:00:00Z',
      ownerId: 'user-001',
      ownerName: 'Nguyễn Hữu Nhâm',
      participants: [
        { account_id: 'user-002', name: 'Đồng nghiệp', role: 'ASSIGNEE' },
      ],
      properties: {
        group_name: 'Dự án ViChat 2026',
        checklist: [
          { id: '1', title: 'Tạo UI Header & Drawer', completed: true },
          { id: '2', title: 'Tạo Quick-add & FAB', completed: false },
        ],
      },
      version: 2,
    };

    const task = normalizeTask(raw);

    expect(task.id).toBe('task-123');
    expect(task.title).toBe('Thiết kế module Workspace Lark');
    expect(task.description).toBe('Đóng gói vào thư mục riêng biệt');
    expect(task.status).toBe('TODO');
    expect(task.priority).toBe('HIGH');
    expect(task.dueAt).toBe('2026-10-07T12:00:00.000Z');
    expect(task.groupName).toBe('Dự án ViChat 2026');
    expect(task.assigneeId).toBe('user-002');
    expect(task.assigneeName).toBe('Đồng nghiệp');
    expect(task.subtasks).toHaveLength(2);
    expect(task.subtasks[0].completed).toBe(true);
    expect(task.subtasks[1].completed).toBe(false);
    expect(task.version).toBe(2);
  });

  it('correctly maps backend string array checklist and source_conversation_name', () => {
    const raw = {
      id: 'task-456',
      title: 'Xử lý báo cáo',
      status: 'IN_PROGRESS',
      priority: 'URGENT',
      properties: {
        source_conversation_name: 'Kế toán & Tài chính',
        checklist: ['Kiểm tra chứng từ', 'Ký duyệt số liệu'],
      },
    };

    const task = normalizeTask(raw);

    expect(task.id).toBe('task-456');
    expect(task.groupName).toBe('Kế toán & Tài chính');
    expect(task.subtasks).toHaveLength(2);
    expect(task.subtasks[0].title).toBe('Kiểm tra chứng từ');
    expect(task.subtasks[0].completed).toBe(false);
    expect(task.subtasks[1].title).toBe('Ký duyệt số liệu');
  });

  it('handles empty / fallback data gracefully', () => {
    const task = normalizeTask({});
    expect(task.id).toBe('');
    expect(task.title).toBe('');
    expect(task.status).toBe('TODO');
    expect(task.priority).toBe('NORMAL');
    expect(task.groupName).toBe('Nhóm mặc định');
    expect(task.subtasks).toEqual([]);
    expect(task.version).toBe(1);
  });
});
