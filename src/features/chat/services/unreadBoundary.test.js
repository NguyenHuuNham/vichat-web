import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUnreadBoundary,
  isUnreadBoundaryEnd,
  mergeUnreadBoundary,
  unreadBadgeLabel,
  unreadCountForConversation,
  unreadBoundaryStartIndex,
  unreadMessagesForConversation,
} from './unreadBoundary.js';

const messages = [
  { id: 'one', seq: 1, senderId: 'me', sender: 'outgoing', createdAt: '2026-08-24T08:00:00.000Z' },
  { id: 'two', seq: 2, senderId: 'peer', sender: 'incoming', createdAt: '2026-08-24T08:01:00.000Z' },
  { id: 'three', seq: 3, senderId: 'peer', sender: 'incoming', createdAt: '2026-08-24T08:02:00.000Z' },
  { id: 'four', seq: 4, senderId: 'peer', sender: 'incoming', createdAt: '2026-08-24T08:03:00.000Z' },
];

test('creates a sequence-based boundary at the first message after the read cursor', () => {
  const boundary = createUnreadBoundary(messages, {
    viewerId: 'me',
    firstUnreadSeq: 2,
    unreadCount: 3,
  });

  assert.equal(boundary.firstUnreadId, 'two');
  assert.equal(boundary.firstUnreadSeq, 2);
  assert.equal(boundary.lastUnreadId, 'four');
  assert.equal(boundary.unreadCount, 3);
  assert.equal(boundary.indicatorCleared, false);
  assert.equal(unreadBoundaryStartIndex(messages, boundary), 1);
  assert.equal(isUnreadBoundaryEnd(messages[3], boundary), true);
});

test('uses the viewer read timestamp for demo conversations', () => {
  const boundary = createUnreadBoundary(messages, {
    viewerId: 'me',
    lastReadAt: '2026-08-24T08:01:30.000Z',
  });

  assert.equal(boundary.firstUnreadId, 'three');
  assert.equal(boundary.lastUnreadId, 'four');
  assert.equal(boundary.unreadCount, 2);
});

test('keeps the first boundary while extending its unread tail', () => {
  const first = createUnreadBoundary(messages.slice(1, 3), { viewerId: 'me', firstUnreadSeq: 2 });
  const next = createUnreadBoundary(messages, { viewerId: 'me', firstUnreadSeq: 2 });
  const merged = mergeUnreadBoundary(first, next);

  assert.equal(merged.firstUnreadId, 'two');
  assert.equal(merged.lastUnreadId, 'four');
  assert.equal(merged.revealed, false);
});

test('preserves the dismissed sidebar indicator while extending the boundary', () => {
  const first = {
    ...createUnreadBoundary(messages.slice(1, 3), { viewerId: 'me', firstUnreadSeq: 2 }),
    indicatorCleared: true,
  };
  const next = createUnreadBoundary(messages, { viewerId: 'me', firstUnreadSeq: 2 });
  const merged = mergeUnreadBoundary(first, next);

  assert.equal(merged.indicatorCleared, true);
  assert.equal(merged.revealed, false);
});

test('keeps a visible unread count when the server exposes only a cursor', () => {
  assert.equal(unreadCountForConversation({ badge: 4 }), 4);
  assert.equal(unreadCountForConversation({ badge: 0 }, { unreadCount: 3 }), 3);
  assert.equal(unreadCountForConversation({ unreadFromSeq: 42 }), 1);
  assert.equal(unreadCountForConversation({}, { firstUnreadSeq: 42 }), 1);
  assert.equal(unreadCountForConversation({}, null), 0);
});

test('caps visible unread badges at five messages', () => {
  assert.equal(unreadBadgeLabel(0), '');
  assert.equal(unreadBadgeLabel(1), '1');
  assert.equal(unreadBadgeLabel(4), '4');
  assert.equal(unreadBadgeLabel(5), '5+');
  assert.equal(unreadBadgeLabel(57), '5+');
});

test('returns only the unread tail when a conversation has no durable cursor', () => {
  assert.deepEqual(
    unreadMessagesForConversation({ messages, badge: 2 }, null, { viewerId: 'me' }).map(message => message.id),
    ['three', 'four'],
  );
  assert.deepEqual(
    unreadMessagesForConversation({ messages, unreadFromSeq: 3 }, null, { viewerId: 'me' }).map(message => message.id),
    ['three', 'four'],
  );
});
