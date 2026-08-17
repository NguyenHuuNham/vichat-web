import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyLocalConversationCategories,
  readConversationCategories,
  setConversationCategory,
} from './conversationCategoryPolicy.js';

test('applies viewer-scoped categories without changing room identity', () => {
  const previousWindow = globalThis.window;
  const values = new Map([
    ['vichat.conversation-categories.v1.viewer-1', JSON.stringify({ 'room-2': 'work' })],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
  };

  const rooms = applyLocalConversationCategories({
    first: { id: 'room-1', name: 'A' },
    second: { id: 'room-2', name: 'B' },
  }, 'viewer-1');

  assert.equal(rooms.first.category, '');
  assert.equal(rooms.second.category, 'work');
  assert.equal(rooms.second.name, 'B');
  globalThis.window = previousWindow;
});

test('sets and clears a valid category for one viewer', () => {
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
  };

  assert.deepEqual(setConversationCategory('viewer-1', 'room-1', 'customer'), { 'room-1': 'customer' });
  assert.deepEqual(readConversationCategories('viewer-1'), { 'room-1': 'customer' });
  assert.deepEqual(setConversationCategory('viewer-1', 'room-1', ''), {});
  assert.deepEqual(setConversationCategory('viewer-1', 'room-1', 'unknown'), {});
  globalThis.window = previousWindow;
});
