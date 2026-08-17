import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { chatManagementService, employeeLoginPayload, tinodeRefreshPayload } from './chatManagementService.js';

const appSource = readFileSync(new URL('../../../app/App.jsx', import.meta.url), 'utf8');

test('builds a tenant-scoped employee login payload', () => {
  const payload = employeeLoginPayload({
    identity: '  nhanvien.a  ',
    password: 'StrongPassword!2026',
  });

  assert.deepEqual(payload, {
    identity: 'nhanvien.a',
    password: 'StrongPassword!2026',
    tenant_id: 'song-hong',
  });
  assert.equal('role' in payload, false);
  assert.equal('user_id' in payload, false);
});

test('resends the employee password only when the volatile Tinode token needs renewal', () => {
  assert.deepEqual(tinodeRefreshPayload({
    token: 'fresh-token',
    expires: Date.now() / 1000 + 120,
  }, 'EmployeePassword!2026'), {});
  assert.deepEqual(tinodeRefreshPayload({
    token: 'expiring-token',
    expires: Date.now() / 1000 + 10,
  }, 'EmployeePassword!2026'), {
    password: 'EmployeePassword!2026',
  });
  assert.deepEqual(tinodeRefreshPayload({
    token: 'expired-token',
    expires: Date.now() / 1000 - 10,
  }, ''), {});
});

test('create-group picker uses the synced company directory while group detail stays read-only', () => {
  for (const removedBinding of [
    'isAddMembersOpen',
    'isAddingMembers',
    'addMembersRequestRef',
    'openAddMembers',
    'handleAddMembers',
    'handleSearchGroupMembers',
    'groupSearchResults',
    'isSearchingMembers',
    'btn-add-member',
    'group-members-modal',
  ]) {
    assert.equal(appSource.includes(removedBinding), false, removedBinding);
  }

  for (const retainedBinding of [
    'isCreateGroupOpen',
    'handleFilterGroupMembers',
    'companyDirectoryContacts(directoryAccounts, currentUser)',
    'matchesCompanyDirectoryContact(member, groupMemberSearch)',
    'handleRemoveGroupMember',
    'handleLeaveGroup',
    'handleDeleteConversation',
  ]) {
    assert.equal(appSource.includes(retainedBinding), true, retainedBinding);
  }

  assert.equal(typeof chatManagementService.addConversationParticipants, 'function');
});
