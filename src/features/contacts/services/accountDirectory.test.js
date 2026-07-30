import test from 'node:test';
import assert from 'node:assert/strict';

import { updateAccountPresence } from './accountDirectory.js';

test('presence update preserves the account array when nothing changes', () => {
  const accounts = [
    { id: 'account-1', tinodeUid: 'usr-one', online: true },
    { id: 'account-2', tinodeUid: 'usr-two', online: false },
  ];

  const result = updateAccountPresence(accounts, {
    'usr-one': true,
    'usr-two': false,
  }, { id: 'viewer' });

  assert.strictEqual(result, accounts);
});

test('presence update changes only accounts with a new Tinode state', () => {
  const unchanged = { id: 'account-1', tinodeUid: 'usr-one', online: true };
  const changed = { id: 'account-2', tinodeUid: 'usr-two', online: false };
  const accounts = [unchanged, changed];

  const result = updateAccountPresence(accounts, {
    'usr-one': true,
    'usr-two': true,
  }, { id: 'viewer' });

  assert.notStrictEqual(result, accounts);
  assert.strictEqual(result[0], unchanged);
  assert.notStrictEqual(result[1], changed);
  assert.equal(result[1].online, true);
});

test('presence update never overwrites the current account state', () => {
  const viewer = { id: 'account-1', tinodeUid: 'usr-one', online: true };
  const accounts = [viewer];

  const result = updateAccountPresence(accounts, { 'usr-one': false }, viewer);

  assert.strictEqual(result, accounts);
  assert.strictEqual(result[0], viewer);
});
