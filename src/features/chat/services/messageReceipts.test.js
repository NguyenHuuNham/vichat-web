import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeReceiptUsers,
  normalizeReceiptUsers,
  receiptAvatarPreview,
  receiptUsersFromMembers,
} from './messageReceipts.js';

test('normalizes receipts and keeps users who viewed out of the received list', () => {
  assert.deepEqual(normalizeReceiptUsers({
    read: [{ id: 'usr-read', name: 'Đã xem' }],
    received: [
      { id: 'usr-read', name: 'Trùng' },
      { uid: 'usr-received', fn: 'Đã nhận' },
    ],
  }), {
    read: [{ id: 'usr-read', name: 'Đã xem', uid: '', tinodeUid: '', avatar: '' }],
    received: [{ id: 'usr-received', uid: 'usr-received', tinodeUid: '', name: 'Đã nhận', avatar: '' }],
  });
});

test('derives per-message receipt users from Tinode member cursors', () => {
  const receipts = receiptUsersFromMembers([
    { id: 'usr-me', read: 99, recv: 99 },
    { id: 'usr-read', name: 'Đã xem', read: 12, recv: 12 },
    { id: 'usr-received', name: 'Đã nhận', read: 3, recv: 12 },
    { id: 'usr-later', read: 4, recv: 5 },
  ], 10, 'usr-me');

  assert.deepEqual(receipts.read.map(user => user.id), ['usr-read']);
  assert.deepEqual(receipts.received.map(user => user.id), ['usr-received']);
});

test('updates a receipt in place and caps the avatar preview at five viewers', () => {
  const current = {
    read: [{ id: 'usr-1', name: 'Một' }],
    received: [{ id: 'usr-2', name: 'Hai' }],
  };
  const withRead = mergeReceiptUsers(current, {
    what: 'read',
    user: { id: 'usr-2', name: 'Hai' },
  });
  const manyReaders = {
    read: [...Array.from({ length: 6 }, (_, index) => ({ id: `usr-${index + 1}`, name: `User ${index + 1}` }))],
    received: [],
  };

  assert.deepEqual(withRead.read.map(user => user.id), ['usr-1', 'usr-2']);
  assert.deepEqual(withRead.received, []);
  const normalizedReaders = normalizeReceiptUsers(manyReaders).read;
  assert.deepEqual(receiptAvatarPreview(manyReaders), {
    users: normalizedReaders.slice(0, 5),
    overflowCount: 1,
    totalCount: 6,
  });
});
