import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countGroupPresence,
  findDirectPeer,
  identitiesOverlap,
  identityValues,
  mergeDirectoryAccountSnapshots,
  mergeRealtimeAccountProfile,
  mergeRealtimeMemberPresence,
  updateAccountProfiles,
  updateAccountPresence,
} from './accountDirectory.js';

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

test('Tinode profile updates the matching Chatmgt account and preserves its identity', () => {
  const account = {
    id: 'account-1',
    uid: 'account-1',
    tinodeUid: 'usr-one',
    name: 'Old name',
    avatar: '/old-avatar.jpg',
  };

  const updated = mergeRealtimeAccountProfile(account, {
    id: 'usr-one',
    name: 'New name',
    avatar: '/new-avatar.jpg',
  });

  assert.notStrictEqual(updated, account);
  assert.equal(updated.id, 'account-1');
  assert.equal(updated.tinodeUid, 'usr-one');
  assert.equal(updated.name, 'New name');
  assert.equal(updated.avatar, '/new-avatar.jpg');
});

test('realtime profile refresh changes only the matching directory account', () => {
  const first = { id: 'account-1', tinodeUid: 'usr-one', avatar: '/old.jpg' };
  const second = { id: 'account-2', tinodeUid: 'usr-two', avatar: '/two.jpg' };
  const accounts = [first, second];

  const result = updateAccountProfiles(accounts, { id: 'usr-one', avatar: '/new.jpg' });

  assert.notStrictEqual(result, accounts);
  assert.equal(result[0].avatar, '/new.jpg');
  assert.strictEqual(result[1], second);
});

test('directory polling keeps the latest known avatar when the server snapshot is stale', () => {
  const previous = [{ id: 'account-1', tinodeUid: 'usr-one', name: 'One', avatar: '/new.jpg' }];
  const incoming = [{ id: 'account-1', tinodeUid: 'usr-one', name: 'One updated', avatar: '' }];

  const result = mergeDirectoryAccountSnapshots(previous, incoming);

  assert.equal(result[0].name, 'One updated');
  assert.equal(result[0].avatar, '/new.jpg');
});

test('realtime group presence overlays Chatmgt members without replacing their identities', () => {
  const members = [
    { id: 'account-1', tinodeUid: 'usr-one', name: 'One', online: false },
    { id: 'account-2', tinodeUid: 'usr-two', name: 'Two', online: true },
  ];

  const result = mergeRealtimeMemberPresence(members, [
    { id: 'usr-one', online: true },
    { id: 'usr-two', online: false },
  ]);

  assert.notStrictEqual(result, members);
  assert.equal(result[0].id, 'account-1');
  assert.equal(result[0].online, true);
  assert.equal(result[1].online, false);
});

test('a refreshed Chatmgt member list retains known presence only for unchanged members', () => {
  const refreshedMembers = [
    { id: 'account-1', tinodeUid: 'usr-one', name: 'One updated' },
    { id: 'account-3', tinodeUid: 'usr-three', name: 'Three' },
  ];

  const result = mergeRealtimeMemberPresence(refreshedMembers, [
    { id: 'account-1', tinodeUid: 'usr-one', name: 'One', online: true },
    { id: 'account-2', tinodeUid: 'usr-two', name: 'Two', online: true },
  ]);

  assert.equal(result.length, 2);
  assert.equal(result[0].name, 'One updated');
  assert.equal(result[0].online, true);
  assert.equal(result[1].online, undefined);
});

test('group presence count always includes the connected current member', () => {
  const viewer = { id: 'account-1', tinodeUid: 'usr-one' };
  const members = [
    { id: 'account-1', tinodeUid: 'usr-one', online: false },
    { id: 'account-2', tinodeUid: 'usr-two', online: true },
    { id: 'account-3', tinodeUid: 'usr-three', online: false },
  ];

  assert.deepEqual(countGroupPresence(members, viewer, true), {
    memberCount: 3,
    onlineCount: 2,
  });
  assert.deepEqual(countGroupPresence(members, viewer, false), {
    memberCount: 3,
    onlineCount: 1,
  });
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
