import { describe, expect, it } from 'vitest';
import { normalizeWorkspaceItem } from './workspaceService';

describe('workspace service normalization', () => {
  it('normalizes safe dates and action arrays', () => {
    const item = normalizeWorkspaceItem({ id: '1', itemType: 'task', title: 'Ship', status: 'todo', properties: null, allowedActions: null, dueAt: 'invalid' });
    expect(item.type).toBe('TASK');
    expect(item.status).toBe('TODO');
    expect(item.properties).toEqual({});
    expect(item.dueAt).toBeNull();
    expect(item.allowedActions).toEqual([]);
  });
});
