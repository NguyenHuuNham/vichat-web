import assert from 'node:assert/strict';
import test from 'node:test';

import { buildConversationCategoryConversations } from './conversationCategoryConversations.js';

const viewer = {
  id: 'viewer-1',
  uid: 'viewer-1',
  name: 'Viewer',
  tenantId: 'tenant-a',
};

test('keeps different accounts with the same name and adds identity metadata', () => {
  const first = { id: 'account-1', name: 'Bich Hop', username: 'bich.one', tenantId: 'tenant-a' };
  const second = { id: 'account-2', name: 'Bich Hop', email: 'bich.two@example.com', tenantId: 'tenant-a' };
  const result = buildConversationCategoryConversations({
    conversations: [
      { id: 'room-1', managementId: 'room-1', members: [viewer, first], isGroup: false },
      { id: 'room-2', managementId: 'room-2', members: [viewer, second], isGroup: false },
    ],
    accounts: [viewer, first, second],
    currentUser: viewer,
  });

  assert.equal(result.length, 2);
  assert.deepEqual(result.map(item => item.meta), ['@bich.one', 'bich.two@example.com']);
  assert.deepEqual(result.map(item => item.conversationIds), [['room-1'], ['room-2']]);
});

test('collapses duplicate direct rooms while retaining every assignment key', () => {
  const contact = { id: 'account-1', name: 'Bich Hop', username: 'bich.one', tenantId: 'tenant-a' };
  const result = buildConversationCategoryConversations({
    conversations: [
      { id: 'room-old', managementId: 'room-old', members: [viewer, contact], isGroup: false },
      { id: 'room-new', managementId: 'room-new', members: [viewer, contact], isGroup: false },
    ],
    accounts: [viewer, contact],
    currentUser: viewer,
  });

  assert.equal(result.length, 1);
  assert.deepEqual(result[0].conversationIds, ['room-old', 'room-new']);
  assert.equal(result[0].meta, '');
});

test('keeps groups separate even when their subjects match', () => {
  const result = buildConversationCategoryConversations({
    conversations: [
      { id: 'group-1', managementId: 'group-1', name: 'Project', isGroup: true },
      { id: 'group-2', managementId: 'group-2', name: 'Project', isGroup: true },
    ],
    accounts: [viewer],
    currentUser: viewer,
  });

  assert.equal(result.length, 2);
  assert.deepEqual(result.map(item => item.id), ['group-1', 'group-2']);
  assert.equal(result.every(item => item.isGroup), true);
});

test('does not merge direct rooms by a shared display name when identity is missing', () => {
  const result = buildConversationCategoryConversations({
    conversations: [
      { id: 'room-1', managementId: 'room-1', members: [{ name: 'Bich Hop' }, viewer], isGroup: false },
      { id: 'room-2', managementId: 'room-2', members: [{ name: 'Bich Hop' }, viewer], isGroup: false },
    ],
    accounts: [viewer],
    currentUser: viewer,
  });

  assert.equal(result.length, 2);
  assert.deepEqual(result.map(item => item.id), ['room-1', 'room-2']);
});
