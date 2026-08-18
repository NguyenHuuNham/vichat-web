import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGE_QUICK_REACTIONS,
  messageActionKey,
  pinnedMessagesForRoom,
} from './messageActionPolicy.js';

test('keeps pinned messages scoped to a room and excludes hidden/system entries', () => {
  const messages = [
    { id: 'one', type: 'text', text: 'first' },
    { id: 'two', type: 'text', text: 'second' },
    { id: 'event', type: 'system' },
    { id: 'hidden', type: 'text' },
  ];
  const actions = {
    [messageActionKey('room-a', 'one')]: { pinned: true },
    [messageActionKey('room-b', 'two')]: { pinned: true },
    [messageActionKey('room-a', 'event')]: { pinned: true },
    [messageActionKey('room-a', 'hidden')]: { pinned: true, hidden: true },
  };

  assert.deepEqual(pinnedMessagesForRoom(messages, actions, 'room-a').map(message => message.id), ['one']);
});

test('exposes the quick reaction order used by the message action bar', () => {
  assert.deepEqual(MESSAGE_QUICK_REACTIONS, ['👍', '❤️', '😂', '😮', '😢']);
});
