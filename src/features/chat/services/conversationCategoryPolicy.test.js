import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyLocalConversationCategories,
  readConversationCategories,
  readConversationCategoryState,
  removeConversationCategory,
  reorderConversationCategories,
  saveConversationCategory,
  setCategoryConversations,
  setConversationCategory,
} from './conversationCategoryPolicy.js';

function withLocalStorage(entries, callback) {
  const previousWindow = globalThis.window;
  const values = new Map(entries);
  globalThis.window = {
    localStorage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  try {
    return callback(values);
  } finally {
    globalThis.window = previousWindow;
  }
}

test('migrates viewer-scoped legacy assignments and keeps rollback data', () => withLocalStorage([
  ['vichat.conversation-categories.v1.viewer-1', JSON.stringify({ 'room-2': 'work', 'room-3': 'other' })],
], values => {
  const state = readConversationCategoryState('viewer-1');
  assert.equal(state.assignments['room-2'], 'work');
  assert.equal(state.assignments['room-3'], 'other');
  assert.equal(state.categories.find(category => category.id === 'other')?.label, 'Khác');

  setConversationCategory('viewer-1', 'room-1', 'customer');
  assert.deepEqual(JSON.parse(values.get('vichat.conversation-categories.v1.viewer-1')), {
    'room-1': 'customer',
    'room-2': 'work',
    'room-3': 'other',
  });
}));

test('migrates a versioned category record from an identity alias without deleting it', () => withLocalStorage([
  ['vichat.conversation-categories.v2.legacy-uid', JSON.stringify({
    version: 2,
    categories: [{ id: 'vip', label: 'VIP', color: '#734fd1', builtIn: false }],
    assignments: { 'room-1': 'vip' },
    updatedAt: 100,
  })],
], values => {
  const state = readConversationCategoryState('account-1', ['legacy-uid']);
  assert.equal(state.categories[0].id, 'vip');
  assert.deepEqual(state.assignments, { 'room-1': 'vip' });
  assert.equal(values.has('vichat.conversation-categories.v2.account-1'), true);
  assert.equal(values.has('vichat.conversation-categories.v2.legacy-uid'), true);
}));

test('applies categories without changing room identity or unrelated data', () => withLocalStorage([
  ['vichat.conversation-categories.v1.viewer-1', JSON.stringify({ 'room-2': 'work' })],
], () => {
  const rooms = applyLocalConversationCategories({
    first: { id: 'room-1', name: 'A', pinned: true },
    second: { id: 'room-2', name: 'B', badge: 3 },
  }, 'viewer-1');

  assert.equal(rooms.first.category, '');
  assert.equal(rooms.first.pinned, true);
  assert.equal(rooms.second.category, 'work');
  assert.equal(rooms.second.name, 'B');
  assert.equal(rooms.second.badge, 3);
}));

test('creates, renames and rejects duplicate category names per viewer', () => withLocalStorage([], () => {
  const created = saveConversationCategory('viewer-1', { label: 'Đối tác VIP', color: '#734fd1' });
  assert.equal(created.error, '');
  assert.equal(created.category.label, 'Đối tác VIP');
  assert.equal(created.category.color, '#734fd1');

  const renamed = saveConversationCategory('viewer-1', {
    id: created.category.id,
    label: 'Đối tác chiến lược',
    color: '#34bfc4',
  });
  assert.equal(renamed.category.label, 'Đối tác chiến lược');
  assert.equal(renamed.state.categories.filter(category => category.id === created.category.id).length, 1);

  const duplicate = saveConversationCategory('viewer-1', { label: 'công việc', color: '#e11d2e' });
  assert.equal(duplicate.error, 'name_duplicate');

  const renamedBuiltIn = saveConversationCategory('viewer-1', {
    id: 'work',
    label: 'Việc quan trọng',
    color: '#ff6a13',
  });
  assert.equal(renamedBuiltIn.category.builtIn, false);
}));

test('assigns many conversations to one category and replaces previous tags', () => withLocalStorage([], () => {
  const custom = saveConversationCategory('viewer-1', { label: 'Ưu tiên', color: '#e11d2e' }).category;
  setConversationCategory('viewer-1', 'room-1', 'work');
  setConversationCategory('viewer-1', 'room-2', 'family');

  const state = setCategoryConversations('viewer-1', custom.id, ['room-1', 'room-3']);
  assert.equal(state.assignments['room-1'], custom.id);
  assert.equal(state.assignments['room-2'], 'family');
  assert.equal(state.assignments['room-3'], custom.id);

  const cleared = setCategoryConversations('viewer-1', custom.id, ['room-3']);
  assert.equal(cleared.assignments['room-1'], undefined);
  assert.equal(cleared.assignments['room-3'], custom.id);
}));

test('reorders and removes categories without leaking assignments to another viewer', () => withLocalStorage([], () => {
  const created = saveConversationCategory('viewer-1', { label: 'Theo dõi', color: '#49c77b' }).category;
  setConversationCategory('viewer-1', 'room-1', created.id);
  setConversationCategory('viewer-2', 'room-2', 'work');

  const reordered = reorderConversationCategories('viewer-1', [created.id, 'work']);
  assert.equal(reordered.categories[0].id, created.id);
  assert.equal(reordered.categories[1].id, 'work');

  const removed = removeConversationCategory('viewer-1', created.id);
  assert.equal(removed.categories.some(category => category.id === created.id), false);
  assert.equal(removed.assignments['room-1'], undefined);
  assert.deepEqual(readConversationCategories('viewer-2'), { 'room-2': 'work' });
}));

test('sets and clears only valid categories', () => withLocalStorage([], () => {
  assert.deepEqual(setConversationCategory('viewer-1', 'room-1', 'customer'), { 'room-1': 'customer' });
  assert.deepEqual(readConversationCategories('viewer-1'), { 'room-1': 'customer' });
  assert.deepEqual(setConversationCategory('viewer-1', 'room-1', ''), {});
  assert.deepEqual(setConversationCategory('viewer-1', 'room-1', 'unknown'), {});
}));
