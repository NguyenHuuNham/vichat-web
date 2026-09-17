import test from 'node:test';
import assert from 'node:assert/strict';

import { filterConversationIds } from './conversationListFilter.js';

const conversations = {
  direct: { id: 'direct', isGroup: false, category: 'customer' },
  group: { id: 'group', isGroup: true, category: 'work' },
  unread: { id: 'unread', isGroup: false, category: 'friends' },
};

test('filters groups without changing the source order', () => {
  assert.deepEqual(filterConversationIds({
    baseIds: ['direct', 'group', 'unread'],
    conversations,
    tab: 'groups',
  }), ['group']);
});
test('combines unread, category, and stranger filters', () => {
  assert.deepEqual(filterConversationIds({
    baseIds: ['direct', 'group', 'unread'],
    conversations,
    status: 'unread',
    categoryIds: ['friends'],
    strangersOnly: true,
    isUnread: room => room.id === 'unread',
    isStranger: room => room.id === 'unread',
  }), ['unread']);
});

test('does not apply category filtering when no category is selected', () => {
  assert.deepEqual(filterConversationIds({
    baseIds: ['direct', 'group'],
    conversations,
    categoryIds: [],
  }), ['direct', 'group']);
});
