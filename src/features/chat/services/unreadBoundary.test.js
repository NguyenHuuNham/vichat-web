import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUnreadBoundary,
  isUnreadBoundaryEnd,
  markUnreadBoundaryIndicatorCleared,
  mergeUnreadBoundary,
  unreadBadgeLabel,
  unreadCountForConversation,
  unreadBoundaryStartIndex,
  unreadIndicatorVisible,
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

test('keeps an old boundary dismissed but shows a newer unread tail', () => {
  const first = markUnreadBoundaryIndicatorCleared(
    createUnreadBoundary(messages.slice(1, 3), { viewerId: 'me', firstUnreadSeq: 2 }),
  );
  const next = createUnreadBoundary(messages, { viewerId: 'me', firstUnreadSeq: 2 });
  const merged = mergeUnreadBoundary(first, next);

  assert.equal(merged.indicatorCleared, true);
  assert.equal(merged.indicatorClearedThroughSeq, 3);
  assert.equal(unreadIndicatorVisible(merged, unreadCountForConversation({}, merged)), true);
  assert.equal(merged.revealed, false);
});

test('does not resurrect a dismissed boundary when only a stale snapshot arrives', () => {
  const cleared = markUnreadBoundaryIndicatorCleared(
    createUnreadBoundary(messages, { viewerId: 'me', firstUnreadSeq: 2, unreadCount: 3 }),
  );
  const merged = mergeUnreadBoundary(
    cleared,
    createUnreadBoundary(messages, { viewerId: 'me', firstUnreadSeq: 2, unreadCount: 3 }),
  );

  assert.equal(unreadIndicatorVisible(merged, unreadCountForConversation({}, merged)), false);
});

test('does not treat a late history snapshot as a newer message after clearing an empty tail', () => {
  const cleared = markUnreadBoundaryIndicatorCleared(
    createUnreadBoundary([], { viewerId: 'me', firstUnreadSeq: 10, unreadCount: 3 }),
  );
  const staleHistory = createUnreadBoundary([
    { id: 'ten', seq: 10, senderId: 'peer' },
    { id: 'eleven', seq: 11, senderId: 'peer' },
    { id: 'twelve', seq: 12, senderId: 'peer' },
  ], { viewerId: 'me', firstUnreadSeq: 10, unreadCount: 3 });
  const merged = mergeUnreadBoundary(cleared, staleHistory);

  assert.equal(unreadIndicatorVisible(merged, unreadCountForConversation({}, merged)), false);
  assert.equal(
    unreadIndicatorVisible(
      mergeUnreadBoundary(cleared, createUnreadBoundary([
        { id: 'ten', seq: 10, senderId: 'peer' },
        { id: 'eleven', seq: 11, senderId: 'peer' },
        { id: 'twelve', seq: 12, senderId: 'peer' },
        { id: 'thirteen', seq: 13, senderId: 'peer' },
      ], { viewerId: 'me', firstUnreadSeq: 10, unreadCount: 4 })),
      4,
    ),
    true,
  );
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

test('keeps the durable first unread sequence when bounded history starts later', () => {
  const boundary = createUnreadBoundary(messages.slice(2), {
    viewerId: 'me',
    firstUnreadSeq: 2,
    unreadCount: 3,
  });

  assert.equal(boundary.firstUnreadSeq, 2);
  assert.equal(boundary.firstUnreadId, '');
  assert.equal(boundary.firstUnreadAt, '');
  assert.equal(boundary.lastUnreadId, 'four');
  assert.equal(boundary.unreadCount, 3);
  assert.equal(unreadBoundaryStartIndex(messages.slice(2), boundary), 0);
});
