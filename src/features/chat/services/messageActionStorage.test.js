import assert from 'node:assert/strict';
import test from 'node:test';

import {
  messageActionStorageKey,
  readMessageActions,
  writeMessageActions,
} from './messageActionStorage.js';

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test('migrates local message actions across viewer aliases without deleting the old record', () => {
  const storage = memoryStorage();
  const actions = {
    'room-1:message-1': { marked: true, pinned: true },
  };
  storage.setItem(messageActionStorageKey('legacy-uid'), JSON.stringify(actions));

  assert.deepEqual(readMessageActions('account-1', storage, ['legacy-uid']), actions);
  assert.deepEqual(
    JSON.parse(storage.values.get(messageActionStorageKey('account-1'))),
    actions,
  );
  assert.deepEqual(
    JSON.parse(storage.values.get(messageActionStorageKey('legacy-uid'))),
    actions,
  );
});

test('gives an explicit false action update precedence over stored alias state', () => {
  const storage = memoryStorage();
  storage.setItem(messageActionStorageKey('legacy-uid'), JSON.stringify({
    'room-1:message-1': { marked: true, pinned: true },
  }));

  const next = writeMessageActions('account-1', {
    'room-1:message-1': { marked: false },
  }, storage, ['legacy-uid']);

  assert.deepEqual(next['room-1:message-1'], { marked: false, pinned: true });
  assert.deepEqual(
    JSON.parse(storage.values.get(messageActionStorageKey('legacy-uid'))),
    next,
  );
});
