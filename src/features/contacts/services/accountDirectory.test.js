import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canAppointGroupDeputy,
  canApproveGroupMembers,
  canManageGroupMembers,
  canRemoveGroupMember,
  canRevokeGroupDeputy,
  accountTenantId,
  companyDirectoryContacts,
  companyDirectoryHeading,
  countGroupPresence,
  directoryUsernameMeta,
  filterAccountsByTenant,
  findAccount,
  findAccountByIdentities,
  findDirectPeer,
  groupRoleForIdentity,
  identitiesOverlap,
  identityValues,
  matchesCompanyDirectoryContact,
  applyContactNicknames,
  mergeDirectoryAccountSnapshots,
  mergeRealtimeAccountProfile,
  mergeRealtimeMemberPresence,
  normalizeAccountShape,
  normalizeTenantShape,
  resolveGroupAdministrator,
  updateAccountProfiles,
  updateAccountPresence,
} from './accountDirectory.js';
import {
  AVATAR_CROP_MAX_ZOOM,
  AVATAR_CROP_MIN_ZOOM,
  avatarCropMetrics,
  avatarCropSourceRect,
} from './avatarCrop.js';

test('company directory lists every other active employee without friendship data', () => {
  const viewer = { id: 'account-viewer', tinodeUid: 'usr-viewer', name: 'Viewer', tenantId: 'tenant-a' };
  const accounts = [
    { id: 'account-z', tinodeUid: 'usr-z', name: 'Zeta', tenantId: 'tenant-a', active: true },
    viewer,
    { id: 'account-a', tinodeUid: 'usr-a', name: 'An', tenantId: 'tenant-a', active: true },
    { id: 'account-disabled', tenantId: 'tenant-a', name: 'Disabled', active: false },
    { id: 'account-a', tinodeUid: 'usr-a', tenantId: 'tenant-a', name: 'An duplicate', active: true },
  ];

  const result = companyDirectoryContacts(accounts, { id: 'usr-viewer', tenantId: 'tenant-a' });

  assert.deepEqual(result.map(account => account.id), ['account-a', 'account-z']);
});

test('company directory promotes online employees before offline employees', () => {
  const result = companyDirectoryContacts([
    { id: 'offline-z', tenantId: 'tenant-a', name: 'Zeta', online: false, active: true },
    { id: 'online-b', tenantId: 'tenant-a', name: 'Beta', online: true, active: true },
    { id: 'offline-a', tenantId: 'tenant-a', name: 'Alpha', online: false, active: true },
    { id: 'online-a', tenantId: 'tenant-a', name: 'An', online: true, active: true },
  ], { id: 'viewer', tenantId: 'tenant-a' });

  assert.deepEqual(result.map(account => account.id), [
    'online-a',
    'online-b',
    'offline-a',
    'offline-z',
  ]);
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

test('tenant directory fails closed when the viewer tenant is missing', () => {
  const accounts = [
    { id: 'tenant-a-user', tenantId: 'tenant-a', active: true },
    { id: 'tenant-b-user', tenantId: 'tenant-b', active: true },
    { id: 'unknown-user', active: true },
  ];

  assert.deepEqual(companyDirectoryContacts(accounts, { id: 'viewer' }), []);
  assert.deepEqual(filterAccountsByTenant(accounts, {}), []);
});

test('tenant directory keeps only explicitly matching tenant records', () => {
  const accounts = [
    { id: 'same-company', tenantId: 'tenant-a' },
    { id: 'other-company', tenantId: 'tenant-b' },
    { id: 'missing-tenant' },
  ];

  assert.deepEqual(
    filterAccountsByTenant(accounts, 'tenant-a').map(account => account.id),
    ['same-company'],
  );
});

test('tenant directory accepts nested tenant metadata without falling back to another company', () => {
  assert.equal(accountTenantId({ tenantId: { id: 'tenant-a' } }), 'tenant-a');
  assert.equal(
    normalizeAccountShape({ id: 'nested-account', tenantId: { id: 'tenant-a' } }).tenantId,
    'tenant-a',
  );
  assert.deepEqual(
    filterAccountsByTenant([
      { id: 'same-company', tenantId: { id: 'tenant-a' } },
      { id: 'other-company', tenantId: { id: 'tenant-b' } },
    ], { tenant: { id: 'tenant-a' } }).map(account => account.id),
    ['same-company'],
  );
});

test('tenant-scoped directory snapshots discard old-company rows before merging', () => {
  const currentUser = { id: 'viewer-a', tenantId: 'tenant-a' };
  const result = mergeDirectoryAccountSnapshots([
    { id: 'old-company', tenantId: 'tenant-b', name: 'Tenant B' },
    { id: 'same-company', tenantId: 'tenant-a', name: 'Old name' },
  ], [
    { id: 'old-company', tenantId: 'tenant-b', name: 'Still Tenant B' },
    { id: 'same-company', tenantId: 'tenant-a', name: 'New name' },
  ], currentUser);

  assert.deepEqual(result.map(account => account.id), ['same-company']);
  assert.equal(result[0].name, 'New name');
});

test('tenant-scoped realtime profile updates cannot cross company boundaries', () => {
  const currentUser = { id: 'viewer-a', tenantId: 'tenant-a' };
  const account = { id: 'shared-id', tenantId: 'tenant-a', name: 'Tenant A name' };

  const result = updateAccountProfiles(
    [account],
    { id: 'shared-id', tenantId: 'tenant-b', name: 'Tenant B name' },
    currentUser,
  );

  assert.strictEqual(result[0], account);
  assert.equal(result[0].name, 'Tenant A name');
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

test('display lookup falls through every realtime identity before using a name', () => {
  const account = {
    id: 'account-peer',
    uid: 'account-peer',
    tinodeUid: 'usr-peer',
    name: 'Bi danh rieng',
    defaultName: 'Ten chinh thuc',
  };

  assert.strictEqual(
    findAccountByIdentities([account], ['missing-id', 'usr-peer']),
    account,
  );
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

test('directory metadata never clears a newer presence lease', () => {
  const previous = [{ id: 'account-1', name: 'One', online: true }];
  const incoming = [{ id: 'account-1', name: 'One updated' }];

  const result = mergeDirectoryAccountSnapshots(previous, incoming);

  assert.equal(result[0].name, 'One updated');
  assert.equal(result[0].online, true);
});

test('Account-managed avatar snapshots cannot clear a confirmed avatar', () => {
  const result = mergeRealtimeAccountProfile(
    { id: 'account-1', avatar: '/old.jpg' },
    { id: 'account-1', avatar: '', accountManaged: true },
  );

  assert.equal(result.avatar, '/old.jpg');
});

test('avatar crop starts centered and keeps the image inside the circular viewport', () => {
  const metrics = avatarCropMetrics({ imageWidth: 1200, imageHeight: 800, zoom: AVATAR_CROP_MIN_ZOOM });
  assert.equal(metrics.offsetX, 0);
  assert.equal(metrics.offsetY, 0);
  assert.ok(metrics.displayedWidth >= metrics.viewportSize);
  assert.ok(metrics.displayedHeight >= metrics.viewportSize);

  const moved = avatarCropMetrics({
    imageWidth: 1200,
    imageHeight: 800,
    zoom: AVATAR_CROP_MAX_ZOOM,
    offsetX: 99999,
    offsetY: -99999,
  });
  assert.equal(moved.offsetX, moved.maxOffsetX);
  assert.equal(moved.offsetY, -moved.maxOffsetY);
});

test('avatar crop source is a square and remains within the source image', () => {
  const crop = avatarCropSourceRect({ imageWidth: 900, imageHeight: 600, zoom: 1.6, offsetX: 42, offsetY: -18 });
  assert.equal(crop.sourceSize, Math.min(crop.imageWidth, crop.imageHeight, crop.viewportSize / crop.scale));
  assert.ok(crop.sourceX >= 0);
  assert.ok(crop.sourceY >= 0);
  assert.ok(crop.sourceX + crop.sourceSize <= crop.imageWidth);
  assert.ok(crop.sourceY + crop.sourceSize <= crop.imageHeight);
});

test('directory snapshots can explicitly clear a previous contact nickname', () => {
  const previous = [{
    id: 'account-1',
    name: 'Nickname',
    defaultName: 'Official name',
    nickname: 'Nickname',
  }];
  const incoming = [{
    id: 'account-1',
    name: 'Official name',
    defaultName: 'Official name',
    nickname: '',
  }];

  const result = mergeDirectoryAccountSnapshots(previous, incoming);

  assert.equal(result[0].name, 'Official name');
  assert.equal(result[0].nickname, '');
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

test('group owners and deputies share management controls while the owner stays unique', () => {
  const owner = { id: 'account-owner', tinodeUid: 'usr-owner', name: 'Owner', groupRole: 'OWNER' };
  const deputy = { id: 'account-deputy', tinodeUid: 'usr-deputy', name: 'Deputy', groupRole: 'ADMIN' };
  const member = { id: 'account-member', tinodeUid: 'usr-member', name: 'Member', groupRole: 'MEMBER' };
  const room = {
    isGroup: true,
    adminId: owner.id,
    members: [owner, deputy, member],
  };
  const accounts = [owner, deputy, member];

  assert.equal(groupRoleForIdentity(room, owner, accounts), 'OWNER');
  assert.equal(groupRoleForIdentity(room, deputy, accounts), 'ADMIN');
  assert.equal(groupRoleForIdentity(room, member, accounts), 'MEMBER');
  assert.equal(canManageGroupMembers(room, accounts, deputy), true);
  assert.equal(canAppointGroupDeputy(room, accounts, deputy, member), true);
  assert.equal(canRevokeGroupDeputy(room, accounts, owner, deputy), true);
  assert.equal(canRemoveGroupMember(room, accounts, deputy, member), true);
  assert.equal(canRemoveGroupMember(room, accounts, deputy, owner), false);
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

test('tenant administrators can approve membership without receiving owner-only group controls', () => {
  const owner = { id: 'account-owner', tinodeUid: 'usr-owner', name: 'Owner', role: 'member' };
  const tenantAdmin = { id: 'account-admin', tinodeUid: 'usr-admin', name: 'Admin', role: 'admin' };
  const room = {
    isGroup: true,
    adminId: owner.id,
    members: [owner, tenantAdmin],
  };

  assert.equal(canManageGroupMembers(room, [owner, tenantAdmin], tenantAdmin), false);
  assert.equal(canApproveGroupMembers(room, [owner, tenantAdmin], tenantAdmin), true);
  assert.equal(canApproveGroupMembers(room, [owner, tenantAdmin], { ...tenantAdmin, role: 'member' }), false);
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

test('contact nicknames override only the viewer display name and retain the official name', () => {
  const accounts = [
    { id: 'account-peer', uid: 'account-peer', name: 'Tên chính thức', defaultName: 'Tên chính thức' },
    { id: 'account-other', uid: 'account-other', name: 'Người khác', defaultName: 'Người khác' },
  ];

  const result = applyContactNicknames(accounts, { 'account-peer': 'Anh thân' });

  assert.equal(result[0].name, 'Anh thân');
  assert.equal(result[0].nickname, 'Anh thân');
  assert.equal(result[0].defaultName, 'Tên chính thức');
  assert.equal(result[0].full_name, 'Tên chính thức');
  assert.equal(result[1].name, 'Người khác');
  assert.equal(result[1].nickname, '');
});

test('clearing a contact nickname restores the account default name', () => {
  const account = {
    id: 'account-peer',
    name: 'Tên gợi nhớ',
    defaultName: 'Tên chính thức',
    nickname: 'Tên gợi nhớ',
  };

  const result = applyContactNicknames([account], {});

  assert.equal(result[0].name, 'Tên chính thức');
  assert.equal(result[0].nickname, '');
  assert.equal(result[0].default_name, 'Tên chính thức');
});

test('realtime profile merges preserve a viewer nickname while updating the official profile', () => {
  const account = {
    id: 'account-peer',
    uid: 'account-peer',
    name: 'Tên gợi nhớ',
    defaultName: 'Tên cũ',
    nickname: 'Tên gợi nhớ',
  };

  const result = mergeRealtimeAccountProfile(account, {
    id: 'account-peer',
    name: 'Tên mới',
    defaultName: 'Tên mới',
  });

  assert.equal(result.name, 'Tên gợi nhớ');
  assert.equal(result.nickname, 'Tên gợi nhớ');
  assert.equal(result.defaultName, 'Tên mới');
});
