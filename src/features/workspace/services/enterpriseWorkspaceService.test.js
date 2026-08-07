import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWorkspaceItem,
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
