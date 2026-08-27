import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyLocalConversationPins,
  readConversationPins,
  toggleConversationPinIds,
} from './conversationPinPolicy.js';

test('applies local pin state without changing conversation identity', () => {
  const previousWindow = globalThis.window;
  const values = new Map([
    ['vichat.conversation-pins.v1.viewer-1', JSON.stringify(['room-2'])],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
  };

  const rooms = applyLocalConversationPins({
    first: { id: 'room-1', name: 'A' },
    second: { id: 'room-2', name: 'B' },
  }, 'viewer-1');

  assert.equal(rooms.first.pinned, false);
  assert.equal(rooms.second.pinned, true);
  assert.equal(rooms.second.name, 'B');
  globalThis.window = previousWindow;
});

test('toggles a local pin and removes it again', () => {
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
  };

  assert.deepEqual(toggleConversationPinIds('viewer-1', 'room-1', true), ['room-1']);
  assert.deepEqual(toggleConversationPinIds('viewer-1', 'room-1', false), []);
  globalThis.window = previousWindow;
});

test('migrates alias-only pins and clears every alias on explicit unpin', () => {
  const previousWindow = globalThis.window;
  const values = new Map([
    ['vichat.conversation-pins.v1.legacy-uid', JSON.stringify(['room-legacy'])],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
  };

  try {
    assert.deepEqual(readConversationPins('account-1', ['legacy-uid']), ['room-legacy']);
    assert.deepEqual(JSON.parse(values.get('vichat.conversation-pins.v1.account-1')), ['room-legacy']);
    assert.deepEqual(toggleConversationPinIds('account-1', 'room-legacy', false, ['legacy-uid']), []);
    assert.deepEqual(JSON.parse(values.get('vichat.conversation-pins.v1.account-1')), []);
    assert.deepEqual(JSON.parse(values.get('vichat.conversation-pins.v1.legacy-uid')), []);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
