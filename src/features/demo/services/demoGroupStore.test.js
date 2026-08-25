import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deleteDemoGroupForUser,
  leaveDemoGroup,
  listDemoGroupsForUser,
  saveDemoGroup,
} from './demoGroupStore.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test('the final demo group owner may leave while groups with survivors still require transfer', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: memoryStorage() };
  try {
    saveDemoGroup({ id: 'sole-leave', name: 'Sole leave', ownerId: 'owner' });
    leaveDemoGroup('sole-leave', 'owner');
    assert.equal(listDemoGroupsForUser('owner').length, 0);

    saveDemoGroup({ id: 'sole-delete', name: 'Sole delete', ownerId: 'owner' });
    deleteDemoGroupForUser('sole-delete', 'owner');
    assert.equal(listDemoGroupsForUser('owner').length, 0);

    saveDemoGroup({
      id: 'needs-transfer',
      name: 'Needs transfer',
      ownerId: 'owner',
      memberIds: ['member'],
    });
    assert.throws(
      () => leaveDemoGroup('needs-transfer', 'owner'),
      /phải chọn một thành viên mới/,
    );
    leaveDemoGroup('needs-transfer', 'owner', 'member');
    const remainingGroup = listDemoGroupsForUser('member')[0];
    assert.equal(remainingGroup.ownerId, 'member');
    assert.deepEqual(remainingGroup.memberIds, ['member']);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
