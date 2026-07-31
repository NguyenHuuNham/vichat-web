import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeAdminConversation,
  normalizeManagementUser,
} from './managementAdminService.js';

test('normalizes Account projections as read-only management users', () => {
  const user = normalizeManagementUser({
    id: 'account-user-1',
    display_name: 'Nguyen Van A',
    auth_source: 'account',
    tinode_uid: 'usrTinodeA',
    updated_at: '2026-07-31T00:00:00Z',
  });

  assert.equal(user.name, 'Nguyen Van A');
  assert.equal(user.accountManaged, true);
  assert.equal(user.authSource, 'account');
  assert.equal(user.tinodeUid, 'usrTinodeA');
  assert.equal(user.updatedAt, '2026-07-31T00:00:00Z');
});

test('normalizes conversation metadata without requiring message content', () => {
  const conversation = normalizeAdminConversation({
    id: 'conversation-1',
    subject: 'Nhom van hanh',
    isGroup: true,
    members: [{ id: 'account-user-1', name: 'Nguyen Van A', authSource: 'account' }],
    realtime: {
      ready: true,
      binding: 'shared-group',
      provisionedParticipants: 1,
    },
  });

  assert.equal(conversation.isGroup, true);
  assert.equal(conversation.participantCount, 1);
  assert.equal(conversation.members[0].accountManaged, true);
  assert.deepEqual(conversation.realtime, {
    ready: true,
    binding: 'shared-group',
    provisionedParticipants: 1,
  });
  assert.equal('messages' in conversation, false);
});
