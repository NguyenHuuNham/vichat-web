import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGE_QUICK_REACTIONS,
  compactReactionEntries,
  mergeReactionCounts,
  mergeReactionUsers,
  messageActionKey,
  pinnedMessagesForRoom,
  reactionEntries,
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

test('groups reaction counts into one entry per emoji', () => {
  const counts = mergeReactionCounts(
    { '👍': 1, '❤️': 2 },
    { '👍': 2, '😂': 0 },
  );

  assert.deepEqual(counts, { '👍': 3, '❤️': 2, '😂': 0 });
  assert.deepEqual(reactionEntries(counts), [['👍', 3], ['❤️', 2]]);
});

test('keeps two reaction pills and reports the compact overflow count', () => {
  assert.deepEqual(
    compactReactionEntries({ '👍': 1, '❤️': 2, '😂': 3, '😮': 1 }),
    {
      visible: [['👍', 1], ['❤️', 2]],
      overflowCount: 2,
    },
  );
  assert.deepEqual(compactReactionEntries({ '👍': 1 }, 2), {
    visible: [['👍', 1]],
    overflowCount: 0,
  });
});

test('deduplicates reaction users when local and realtime state overlap', () => {
  const users = mergeReactionUsers(
    { '👍': [{ id: 'user-a', name: 'A' }] },
    { '👍': [{ uid: 'user-a', name: 'A updated' }, { id: 'user-b', name: 'B' }] },
  );

  assert.deepEqual(users['👍'].map(user => user.id || user.uid), ['user-a', 'user-b']);
});
