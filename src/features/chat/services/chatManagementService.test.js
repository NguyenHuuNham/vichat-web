import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  chatManagementService,
  employeeLoginPayload,
  managementAuthClient,
  normalizeChatAuthMode,
  normalizeTenantOptions,
  retryTinodeMembershipRequest,
  shouldRequestTinodeAuth,
  shouldRetryTinodeMembership,
  tinodeRefreshPayload,
} from './chatManagementService.js';

const appSource = readFileSync(new URL('../../../app/App.jsx', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../../../styles/index.css', import.meta.url), 'utf8');
const managementServiceSource = readFileSync(new URL('./chatManagementService.js', import.meta.url), 'utf8');
const mobileStoreSource = readFileSync(new URL('../../../../mobile/src/store/appStore.ts', import.meta.url), 'utf8');

test('sends only manual UpGO credentials for employee login', () => {
  const payload = employeeLoginPayload({
    identity: '  nhanvien.a  ',
    password: 'StrongPassword!2026',
  });

  assert.deepEqual(payload, {
    identity: 'nhanvien.a',
    password: 'StrongPassword!2026',
  });
  assert.equal('tenant_id' in payload, false);
  assert.equal('role' in payload, false);
  assert.equal('user_id' in payload, false);
});

test('defaults ChatUI to manual UpGO credential login', () => {
  assert.equal(managementAuthClient.mode, 'account_password');
  assert.equal(normalizeChatAuthMode('account_sso'), 'account_password');
  assert.equal(normalizeChatAuthMode('account_password'), 'account_password');
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

test('membership mutations reuse or refresh any available Tinode session', () => {
  assert.equal(shouldRequestTinodeAuth({ connection: 'tinode' }), true);
  assert.equal(shouldRequestTinodeAuth({ connection: 'management', tinodeAuth: { token: 'short-token' } }), true);
  assert.equal(shouldRequestTinodeAuth({ connection: 'management' }), false);
  assert.equal(shouldRequestTinodeAuth({ connection: 'management' }, true), true);
  assert.equal(shouldRetryTinodeMembership({ code: 'TINODE_MEMBERSHIP_FAILED', status: 401 }), true);
  assert.equal(shouldRetryTinodeMembership({ code: 'TINODE_MEMBERSHIP_FAILED', status: 409 }), true);
  assert.equal(shouldRetryTinodeMembership({ code: 'TINODE_TOKEN_REQUIRED', status: 400 }), true);
  assert.equal(shouldRetryTinodeMembership({ code: 'TENANT_VIOLATION', status: 400 }), false);
});

test('membership mutations retry exactly once with a forced Tinode refresh', async () => {
  const attempts = [];
  const result = await retryTinodeMembershipRequest(async force => {
    attempts.push(force);
    if (!force) {
      const error = new Error('expired');
      error.code = 'TINODE_MEMBERSHIP_FAILED';
      error.status = 401;
      throw error;
    }
    return 'updated';
  });

  assert.equal(result, 'updated');
  assert.deepEqual(attempts, [false, true]);
});

test('managed group additions rely on the server-side owner bridge', () => {
  const addSource = managementServiceSource
    .split('async addConversationParticipants')[1]
    .split('async removeConversationParticipant')[0];
  assert.match(addSource, /apiRequest\(`\/api\/v1\/conversation\/\$\{encodeURIComponent\(conversationId\)\}\/participants`/);
  assert.doesNotMatch(addSource, /membershipApiRequest/);
});

test('restores a cookie-backed session after a full page reload', () => {
  assert.equal(typeof chatManagementService.restoreSession, 'function');
  assert.equal(typeof managementAuthClient.restoreSession, 'function');
  assert.match(managementServiceSource, /apiRequest\('\/api\/v1\/auth\/me'\)/);
  assert.match(appSource, /managementAuthClient\.restoreSession\(\)/);
  assert.match(appSource, /sessionRestoreAttemptedRef/);
});

test('keeps only safe active tenant options and switches without logout', () => {
  assert.deepEqual(normalizeTenantOptions([
    { id: 'tenant-a', name: 'Tenant A', role: 'admin', active: true, logo_url: 'https://account.upgo.vn/company-a.png' },
    { id: 'tenant-a', name: 'Duplicate', active: true },
    { id: 'tenant-disabled', name: 'Disabled', active: false },
  ]), [{
    id: 'tenant-a',
    name: 'Tenant A',
    role: 'admin',
    accountRole: 'member',
    active: true,
    logo: 'https://account.upgo.vn/company-a.png',
  }]);
  assert.equal(typeof chatManagementService.switchTenant, 'function');
  assert.match(managementServiceSource, /apiRequest\('\/api\/v1\/auth\/switch-tenant'/);
  assert.match(managementServiceSource, /activeTinodePassword = ''/);
  assert.match(appSource, /chatManagementService\.switchTenant\(requestedTenantId\)/);
  assert.match(appSource, /window\.location\.reload\(\)/);
  const switchUiSource = appSource.split('const handleTenantSwitch = async option')[1].split('const handleForcedLogout')[0];
  assert.doesNotMatch(switchUiSource, /chatManagementService\.logout/);
  assert.doesNotMatch(appSource, /tenant-switcher-menu/);
  assert.match(appSource, /<TenantLogo src=\{option\.logo\}/);
  assert.match(appSource, /requestTenantSwitch\(option\)/);
});

test('requires explicit confirmation before switching tenants', () => {
  assert.match(appSource, /const \[pendingTenantSwitch, setPendingTenantSwitch\] = useState\(null\)/);
  assert.match(appSource, /onClick=\{\(\) => requestTenantSwitch\(option\)\}/);
  assert.match(appSource, /setPendingTenantSwitch\(option\)/);
  assert.match(appSource, /tenant-switch-confirm-modal/);
  assert.match(appSource, /aria-describedby="tenant-switch-confirm-description"/);
  assert.match(appSource, /onClick=\{confirmTenantSwitch\}/);
  const tenantOptionSource = appSource.split('{tenantOptions.map(option => {')[1].split('{tenantSwitchNotice &&')[0];
  assert.doesNotMatch(tenantOptionSource, /handleTenantSwitch\(option\)/);
  const confirmationSource = appSource.split('const confirmTenantSwitch = () => {')[1].split('useEffect(() => {')[0];
  assert.match(confirmationSource, /handleTenantSwitch\(pendingTenantSwitch\)/);
  assert.match(stylesSource, /\.workspace-overlay \{[\s\S]*?z-index: 80;/);
  assert.match(stylesSource, /\.tenant-switch-confirm-backdrop \{ z-index: 90; \}/);
});

test('refreshes company logo metadata without resetting the active chat session', () => {
  assert.equal(typeof chatManagementService.refreshSessionMetadata, 'function');
  assert.match(managementServiceSource, /async refreshSessionMetadata\(\)/);
  assert.match(managementServiceSource, /hydrateActiveSession\(payload, \{ preserveExisting: true \}\)/);
  assert.match(appSource, /chatManagementService\.refreshSessionMetadata\(\)/);
  assert.match(appSource, /tenantOptions: nextTenantOptions/);
  assert.match(appSource, /title=\{option\.name\}/);
  assert.doesNotMatch(appSource, /tenant-switcher-option-copy/);
  assert.deepEqual(normalizeTenantOptions([{
    id: 'tenant-a',
    name: 'Tenant A',
    logo_url: 'https://account.upgo.vn/company-a.png',
    logo_updated_at: '2026-08-18T21:30:00Z',
  }]), [{
    id: 'tenant-a',
    name: 'Tenant A',
    role: 'member',
    accountRole: 'member',
    active: true,
    logo: 'https://account.upgo.vn/company-a.png',
    logoVersion: '2026-08-18T21:30:00Z',
  }]);
});

test('group member controls use the synced company directory with owner-only mutations', () => {
  for (const removedBinding of [
    'isAddMembersOpen',
    'isAddingMembers',
    'addMembersRequestRef',
    'openAddMembers',
    'handleAddMembers',
    'handleSearchGroupMembers',
    'groupSearchResults',
    'isSearchingMembers',
    'group-members-modal',
  ]) {
    assert.equal(appSource.includes(removedBinding), false, removedBinding);
  }

  for (const retainedBinding of [
    'isCreateGroupOpen',
    'handleFilterGroupMembers',
    'companyDirectoryContacts(directoryAccounts, currentUser)',
    'matchesCompanyDirectoryContact(member, groupMemberSearch)',
    'btn-add-member',
    'isGroupMemberPickerOpen',
    'groupMemberAddIds',
    'handleAddGroupMembers',
    'canManageGroupMembers(activeChat, directoryAccounts, currentUser)',
    'handleRemoveGroupMember',
    'handleLeaveGroup',
    'handleDeleteConversation',
  ]) {
    assert.equal(appSource.includes(retainedBinding), true, retainedBinding);
  }

  assert.equal(typeof chatManagementService.addConversationParticipants, 'function');
  const addSource = appSource.split('const handleAddGroupMembers')[1].split('const closeCreateGroupModal')[0];
  assert.doesNotMatch(addSource, /canManageGroupMembers\(activeChat, directoryAccounts, currentUser\)/);
  assert.match(appSource, /members-section-toggle/);
  assert.match(appSource, /btn-add-member group-member-add-trigger/);
  assert.match(appSource, /member-menu-trigger/);
  assert.match(appSource, /Xóa khỏi nhóm/);
  assert.doesNotMatch(appSource, /Thêm phó nhóm/);
});

test('group mute and reaction controls preserve the existing checkbox flow and expose actor details', () => {
  const muteSource = appSource.split('const handleConversationMuteToggle')[1].split('const handleNotificationMuteSubmit')[0];
  assert.match(muteSource, /typeof event\?\.target\?\.checked === 'boolean'/);
  assert.match(muteSource, /!activeChatMuted/);
  assert.match(appSource, /reactionUsers/);
  assert.match(appSource, /reaction-details-modal/);
  assert.match(appSource, /fa-key/);
  assert.match(appSource, /activeChat\.isGroup\s*\n?\s*&& identitiesOverlap\(\{ id: messageSenderId \}/);
});

test('conversation actions use the authoritative Chatmgt id on web and mobile', () => {
  assert.match(appSource, /deleteConversationForCurrentUser\(activeChat\.managementId \|\| activeChat\.id\)/);
  assert.match(appSource, /const managementConversationId = room\.managementId \|\| room\.id;/);
  assert.match(mobileStoreSource, /conversation\.managementId \|\| conversation\.id,[\s\S]*until,/);
  assert.match(mobileStoreSource, /deleteConversationForCurrentUser\(conversation\.managementId \|\| conversation\.id, tinodeAuth\.token\)/);
});

test('managed member removal does not re-bind an already bound topic first', () => {
  const removeSource = appSource.split('const handleRemoveGroupMember')[1].split('const persistDemoGroupMessage')[0];
  assert.match(removeSource, /activeChat\.tinodeTopic \|\| await ensureTinodeConversationTopic\(activeChat\)/);
  assert.match(removeSource, /sendSystemEvent\(topicName, event\)\.catch/);
  assert.match(removeSource, /openConversation\(topicName\)\.catch/);
  assert.match(removeSource, /\[stateConversationId\]: safeMergeTinodeConversation/);
  assert.match(removeSource, /messages: roomMessages\(realtimeRoom\)\.length > 0/);
});

test('managed direct chats hydrate Tinode history before committing the room state', () => {
  assert.match(appSource, /const restoredRoom = await tinodeClient\.restoreConversation\(tinodeTopic\)/);
  assert.match(appSource, /\[stateConversationId\]: safeMergeTinodeConversation\(previousRoom, restoredStateRoom\)/);
});

test('managed member addition keeps the Chatmgt id separate from the UI room key', () => {
  const addSource = appSource.split('const handleAddGroupMembers')[1].split('const closeCreateGroupModal')[0];
  assert.match(addSource, /const stateConversationId = activeChat\.id/);
  assert.match(addSource, /const managementConversationId = activeChat\.managementId \|\| stateConversationId/);
  assert.match(addSource, /addConversationParticipants\(\s*managementConversationId/);
  assert.match(addSource, /\[stateConversationId\]: safeMergeTinodeConversation/);
});

test('marks Chatmgt conversation responses as authoritative membership snapshots', () => {
  assert.match(managementServiceSource, /managementSnapshot: true/);
  assert.match(appSource, /conversationManagementMergePolicy/);
});

test('web self recall removes the local message while all recall keeps a placeholder', () => {
  assert.match(
    appSource,
    /if \(mode === 'self'\) \{[\s\S]*removeMessageFromConversation\(room, message\)[\s\S]*return;[\s\S]*\}[\s\S]*applyMessagePatch\(message,/,
  );
});

test('directory-started chats keep malformed rooms isolated from the app render', () => {
  assert.match(appSource, /safeNormalizeConversationForRender/);
  assert.match(appSource, /safeMergeTinodeConversation/);
  assert.match(appSource, /<ConversationErrorBoundary/);
  assert.doesNotMatch(appSource, /activeChat\.members\?/);

  const directChatSource = appSource
    .split('const handleStartDirectChat')[1]
    .split('const publicProfileFor')[0];
  assert.match(directChatSource, /try \{\s*const safeContact/);
  assert.match(directChatSource, /safeConversationValues\(conversationsRef\.current\)/);
  assert.doesNotMatch(directChatSource, /Object\.values\(conversations\)/);
});

test('declares the account presence helper before render labels use it', () => {
  const currentUserOnlineIndex = appSource.indexOf('const isCurrentUserOnline = Boolean(');
  const accountOnlineIndex = appSource.indexOf('const isAccountOnline = account =>');
  const accountLabelIndex = appSource.indexOf('const accountPresenceLabel = account =>');
  const activeLabelIndex = appSource.indexOf('const activeChatPresenceLabel =');

  assert.ok(currentUserOnlineIndex >= 0);
  assert.ok(accountOnlineIndex > currentUserOnlineIndex);
  assert.ok(accountLabelIndex > accountOnlineIndex);
  assert.ok(activeLabelIndex > accountOnlineIndex);
});

test('directory chat navigates before remote provisioning can reject', () => {
  const directChatSource = appSource
    .split('const handleStartDirectChat')[1]
    .split('const publicProfileFor')[0];
  const navigationIndex = directChatSource.indexOf('closeWorkspacePanel();');
  const remoteProvisioningIndex = directChatSource.indexOf('if (usesManagementData && safeContact.id)');

  assert.ok(navigationIndex >= 0);
  assert.ok(remoteProvisioningIndex > navigationIndex);
  assert.match(directChatSource, /const optimisticRoom/);
  assert.match(directChatSource, /pendingDirect/);
  assert.match(directChatSource, /migrateOptimisticRoom/);
  assert.match(appSource, /selectedRoom = previousRooms\[currentChatIdRef\.current\]/);
});
