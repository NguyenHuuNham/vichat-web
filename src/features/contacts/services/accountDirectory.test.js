import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canManageGroupMembers,
  canRemoveGroupMember,
  companyDirectoryContacts,
  companyDirectoryHeading,
  countGroupPresence,
  directoryUsernameMeta,
  findAccount,
  findDirectPeer,
  identitiesOverlap,
  identityValues,
  matchesCompanyDirectoryContact,
  mergeDirectoryAccountSnapshots,
  mergeRealtimeAccountProfile,
  mergeRealtimeMemberPresence,
  normalizeAccountShape,
  normalizeTenantShape,
  resolveGroupAdministrator,
  updateAccountProfiles,
  updateAccountPresence,
} from './accountDirectory.js';

test('company directory lists every other active employee without friendship data', () => {
  const viewer = { id: 'account-viewer', tinodeUid: 'usr-viewer', name: 'Viewer' };
  const accounts = [
    { id: 'account-z', tinodeUid: 'usr-z', name: 'Zeta', active: true },
    viewer,
    { id: 'account-a', tinodeUid: 'usr-a', name: 'An', active: true },
    { id: 'account-disabled', name: 'Disabled', active: false },
    { id: 'account-a', tinodeUid: 'usr-a', name: 'An duplicate', active: true },
  ];

  const result = companyDirectoryContacts(accounts, { id: 'usr-viewer' });

  assert.deepEqual(result.map(account => account.id), ['account-a', 'account-z']);
});

test('company directory heading uses the current UpGO tenant name', () => {
  assert.equal(
    companyDirectoryHeading({ tenantName: 'Gon Platform' }),
    'Nhân viên · Gon Platform',
  );
  assert.equal(companyDirectoryHeading({}), 'Nhân viên công ty');
});

test('company directory excludes accounts from another tenant', () => {
  const viewer = { id: 'viewer', tenantId: 'tenant-a' };
  const accounts = [
    { id: 'same-company', tenantId: 'tenant-a', name: 'Nhân viên A', active: true },
    { id: 'other-company', tenantId: 'tenant-b', name: 'Nhân viên B', active: true },
    { id: 'missing-tenant', name: 'Không rõ công ty', active: true },
  ];

  assert.deepEqual(
    companyDirectoryContacts(accounts, viewer).map(account => account.id),
    ['same-company'],
  );
});

test('company directory contact filtering is local and ignores Vietnamese accents', () => {
  const account = {
    name: 'Nguyễn Văn Đức',
    username: 'duc.nguyen',
    email: 'duc.nguyen@example.com',
    title: 'Kế toán viên',
    department: 'Tài chính',
  };

  assert.equal(matchesCompanyDirectoryContact(account, 'nguyen van duc'), true);
  assert.equal(matchesCompanyDirectoryContact(account, 'example.com'), true);
  assert.equal(matchesCompanyDirectoryContact(account, 'ke toan'), true);
  assert.equal(matchesCompanyDirectoryContact(account, 'khong co'), false);
  assert.equal(matchesCompanyDirectoryContact(account, ''), true);
});

test('directory username removes an email domain without changing plain usernames', () => {
  assert.equal(directoryUsernameMeta({ username: 'nhanvien@gmail.com' }), ' · @nhanvien');
  assert.equal(directoryUsernameMeta({ username: 'nhanvien.noibo' }), ' · @nhanvien.noibo');
  assert.equal(directoryUsernameMeta({ username: '' }), '');
});

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

test('group administrator resolves from Chatmgt adminId even when the directory omits the creator', () => {
  const creator = { id: 'account-owner', uid: 'usr-owner', name: 'Người tạo nhóm' };
  const member = { id: 'account-member', uid: 'usr-member', name: 'Thành viên' };
  const room = {
    isGroup: true,
    adminId: creator.id,
    admin: '',
    members: [creator, member],
  };

  assert.deepEqual(resolveGroupAdministrator(room, [member]), creator);
  assert.equal(canManageGroupMembers(room, [member], { id: 'usr-owner' }), true);
  assert.equal(canManageGroupMembers(room, [member], member), false);
});

test('group administrator resolves a Tinode owner to the matching Chatmgt account', () => {
  const creator = {
    id: 'account-owner',
    tinodeUid: 'usr-owner',
    name: 'Tên quản trị viên',
  };
  const room = {
    isGroup: true,
    members: [
      { id: 'usr-owner', name: 'Tinode owner', mode: 'JRWPASO' },
      { id: 'usr-member', name: 'Thành viên', mode: 'JRWPAS' },
    ],
  };

  assert.deepEqual(resolveGroupAdministrator(room, [creator]), {
    id: 'account-owner',
    tinodeUid: 'usr-owner',
    name: 'Tên quản trị viên',
    mode: 'JRWPASO',
  });
});

test('only the creator can remove another member and the owner cannot remove themselves', () => {
  const creator = { id: 'account-owner', tinodeUid: 'usr-owner', name: 'Người tạo nhóm' };
  const member = { id: 'account-member', tinodeUid: 'usr-member', name: 'Thành viên' };
  const room = {
    isGroup: true,
    adminId: creator.id,
    members: [creator, member],
  };
  const accounts = [creator, member];

  assert.equal(canRemoveGroupMember(room, accounts, creator, member), true);
  assert.equal(canRemoveGroupMember(room, accounts, member, creator), false);
  assert.equal(canRemoveGroupMember(room, accounts, creator, creator), false);
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

test('direct peer lookup ignores malformed member collections', () => {
  const viewer = { id: 'account-a', tinodeUid: 'usr-a' };
  const peer = { id: 'account-b', tinodeUid: 'usr-b', name: 'Peer' };
  assert.strictEqual(findDirectPeer({ members: { peer }, participantIds: { peer } }, [viewer, peer], viewer), null);
});

test('identity matching ignores malformed optional profile fields', () => {
  const account = { id: 'account-a', username: { invalid: true }, email: null, name: { invalid: true } };
  assert.strictEqual(findAccount([account], 'account-a'), account);
  assert.equal(findAccount([account], 'not-the-account'), null);
});

test('account snapshots convert malformed profile values to render-safe scalars', () => {
  const account = normalizeAccountShape({
    id: 'account-peer',
    name: { value: 'Peer' },
    display_name: 'Peer name',
    username: { value: 'peer' },
    email: { value: 'peer@example.com' },
    avatar: { ref: '/tinode-media/v0/file/u/avatar' },
    tenant: { id: 'tenant-a', name: { value: 'Tenant A' } },
    active: { value: true },
  });

  assert.equal(account.id, 'account-peer');
  assert.equal(account.name, 'Peer name');
  assert.equal(account.username, '');
  assert.equal(account.email, '');
  assert.equal(account.avatar, '/tinode-media/v0/file/u/avatar');
  assert.equal(account.tenantId, 'tenant-a');
  assert.equal(account.tenantName, 'tenant-a');
  assert.equal(account.active, true);
  assert.equal(normalizeTenantShape({ id: 'tenant-a', name: { invalid: true } }).name, 'tenant-a');
});
