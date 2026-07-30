import test from 'node:test';
import assert from 'node:assert/strict';

import { findDirectPeer, identitiesOverlap, identityValues, updateAccountPresence } from './accountDirectory.js';

test('account identities include both management and Tinode identifiers', () => {
  const account = { id: 'account-1', uid: 'account-alias', tinodeUid: 'usr-one' };

  assert.deepEqual(identityValues(account), ['account-1', 'account-alias', 'usr-one']);
  assert.equal(identitiesOverlap(account, { id: 'usr-one' }), true);
});

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

test('direct conversations resolve the other account for the current viewer', () => {
  const viewer = { id: 'account-a', tinodeUid: 'usr-a', name: 'Nguyen Huu Nham' };
  const peer = { id: 'account-b', tinodeUid: 'usr-b', name: 'minhne' };
  const accounts = [viewer, peer];

  assert.strictEqual(findDirectPeer({
    participantIds: ['account-a', 'account-b'],
    members: [viewer, peer],
    name: viewer.name,
  }, accounts, viewer), peer);
  assert.strictEqual(findDirectPeer({ members: [{ id: 'usr-b' }] }, accounts, viewer), peer);
});
