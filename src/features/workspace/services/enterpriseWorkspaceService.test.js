import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWorkspaceItem,
  formatWorkspaceDate,
  workspaceStatusLabel,
  workspaceTypeMeta,
} from './enterpriseWorkspaceService.js';

test('normalizes enterprise item dates and safe collections', () => {
  const item = normalizeWorkspaceItem({
    id: 42,
    type: 'task',
    createdAt: '2026-08-04T08:00:00Z',
    participants: null,
    properties: null,
  });
  assert.equal(item.id, '42');
  assert.equal(item.type, 'TASK');
  assert.equal(item.createdAt, '2026-08-04T08:00:00.000Z');
  assert.deepEqual(item.participants, []);
  assert.deepEqual(item.properties, {});
});

test('exposes stable labels and type metadata for every module', () => {
  assert.equal(workspaceTypeMeta('WIKI').label, 'Wiki / Quy trình');
  assert.equal(workspaceStatusLabel('IN_PROGRESS'), 'Đang làm');
  assert.equal(workspaceStatusLabel('UNKNOWN'), 'UNKNOWN');
});

test('uses the selected locale for workspace date fallbacks', () => {
  assert.equal(formatWorkspaceDate(null, { locale: 'en-US' }), 'Not set');
  assert.equal(formatWorkspaceDate(null, { locale: 'vi-VN' }), 'Chưa đặt');
});

test('normalizes extended task with collaborator, approver, subtasks and relationships', async () => {
  const { normalizeTaskExtended, getDueStatus, filterWorkspaceTasks, groupWorkspaceTasks } = await import('./enterpriseWorkspaceService.js');
  const accounts = [
    { id: 'u-boss', name: 'Sếp Cường', department: 'Ban Giám Đốc' },
    { id: 'u-dev', name: 'Nguyễn Văn A', department: 'Kỹ Thuật' },
    { id: 'u-collab1', name: 'Trần Thị B', department: 'Thiết Kế' },
    { id: 'u-collab2', name: 'Lê Văn C', department: 'Kiểm Thử' },
    { id: 'u-qa', name: 'Phạm Văn D', department: 'QA' },
  ];

  const now = new Date();
  const todayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0).toISOString();

  const rawItem = {
    id: 't-101',
    type: 'TASK',
    title: 'Nâng cấp giao diện Workspace',
    description: 'Chuyển sang dạng TaskBoard và tích hợp hội thoại',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    createdBy: 'u-boss',
    dueAt: todayIso,
    participants: [
      { accountId: 'u-dev', role: 'ASSIGNEE' },
      { accountId: 'u-collab1', role: 'COLLABORATOR' },
      { accountId: 'u-collab2', role: 'COLLABORATOR' },
      { accountId: 'u-qa', role: 'APPROVER' },
    ],
    properties: {
      group_name: 'Dự án ViChat Web',
      checklist: [
        { id: '1', title: 'Thiết kế TaskCard', completed: true },
        { id: '2', title: 'Tích hợp 1-Click Chat', completed: false },
      ],
    },
  };

  const task = normalizeTaskExtended(rawItem, accounts, 'u-dev');
  assert.equal(task.title, 'Nâng cấp giao diện Workspace');
  assert.equal(task.creator.name, 'Sếp Cường');
  assert.equal(task.assignee.name, 'Nguyễn Văn A');
  assert.equal(task.collaborators.length, 2);
  assert.equal(task.collaborators[0].name, 'Trần Thị B');
  assert.equal(task.approver.name, 'Phạm Văn D');
  assert.equal(task.subtasks.length, 2);
  assert.equal(task.subtaskStats.completed, 1);
  assert.equal(task.subtaskStats.progress, 50);
  assert.equal(task.isAssignedToMe, true);
  assert.equal(task.isMyTodayTask, true);
  assert.equal(task.dueStatus.isDueToday, true);

  // Test filter
  const todayTasks = filterWorkspaceTasks([task], { scope: 'TODAY' });
  assert.equal(todayTasks.length, 1);

  const completedTasks = filterWorkspaceTasks([task], { scope: 'COMPLETED' });
  assert.equal(completedTasks.length, 0);

  // Test groups
  const groups = groupWorkspaceTasks([task], 'DUE_DATE');
  assert.ok(groups.some(g => g.id === 'today' && g.tasks.length === 1));
});
