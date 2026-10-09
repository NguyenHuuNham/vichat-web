import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterConversationIds,
  getChannelBadge,
  resolveConversationChannel,
} from './conversationListFilter.js';

const conversations = {
  direct: { id: 'direct', isGroup: false, category: 'customer' },
  group: { id: 'group', isGroup: true, category: 'work' },
  unread: { id: 'unread', isGroup: false, category: 'friends' },
  zaloOA: { id: 'zalo_oa_123', channel: 'zalo_oa', isGroup: false },
  livechat: { id: 'livechat_user_1', channel: 'livechat', isGroup: false },
};

test('filters groups without changing the source order', () => {
  assert.deepEqual(filterConversationIds({
    baseIds: ['direct', 'group', 'unread'],
    conversations,
    tab: 'groups',
  }), ['group']);
});

test('filters zalo conversations', () => {
  assert.deepEqual(filterConversationIds({
    baseIds: ['direct', 'group', 'zaloOA', 'livechat'],
    conversations,
    tab: 'zalo',
  }), ['zaloOA']);
});

test('filters livechat conversations', () => {
  assert.deepEqual(filterConversationIds({
    baseIds: ['direct', 'group', 'zaloOA', 'livechat'],
    conversations,
    tab: 'livechat',
  }), ['livechat']);
});

test('filters unread conversations by unread tab', () => {
  assert.deepEqual(filterConversationIds({
    baseIds: ['direct', 'group', 'unread'],
    conversations,
    tab: 'unread',
    isUnread: room => room.id === 'unread',
  }), ['unread']);
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

test('resolves channel badges correctly', () => {
  assert.deepEqual(getChannelBadge({ channel: 'zalo_oa' }), {
    label: 'Zalo OA',
    badgeColor: '#0068FF',
    textColor: '#FFFFFF',
  });
  assert.deepEqual(getChannelBadge({ channel: 'livechat' }), {
    label: 'Live Chat',
    badgeColor: '#10B981',
    textColor: '#FFFFFF',
  });
  assert.equal(getChannelBadge({ channel: 'internal' }), null);
});
