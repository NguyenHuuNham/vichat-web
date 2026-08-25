import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  chatManagementService,
  employeeLoginPayload,
  isAccountManaged,
  isSessionRestoreAuthFailure,
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
const tinodeSource = readFileSync(new URL('./tinodeClient.js', import.meta.url), 'utf8');
const avatarCropSource = readFileSync(new URL('../../contacts/components/AvatarCropModal.jsx', import.meta.url), 'utf8');
const managementServiceSource = readFileSync(new URL('./chatManagementService.js', import.meta.url), 'utf8');
const mobileStoreSource = readFileSync(new URL('../../../../mobile/src/store/appStore.ts', import.meta.url), 'utf8');
const mobileConversationListSource = readFileSync(new URL('../../../../mobile/src/screens/chat/ConversationListScreen.tsx', import.meta.url), 'utf8');

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

test('exposes group member approval snapshots and mutations through Chatmgt', () => {
  assert.equal(typeof chatManagementService.updateConversationParticipantApproval, 'function');
  assert.match(managementServiceSource, /pendingMembers/);
  assert.match(managementServiceSource, /pendingParticipantIds/);
  assert.match(managementServiceSource, /participants\/\$\{encodeURIComponent\(participantId\)\}\/approval/);
  assert.match(appSource, /activePendingMembers/);
  assert.match(appSource, /handleGroupMemberApproval/);
  assert.match(appSource, /Danh sách cần duyệt/);
  assert.match(appSource, /pending-member-action approve/);
  assert.match(appSource, /pending-member-action reject/);
});

test('restores a cookie-backed session after a full page reload', () => {
  assert.equal(typeof chatManagementService.restoreSession, 'function');
  assert.equal(typeof managementAuthClient.restoreSession, 'function');
  assert.equal(isSessionRestoreAuthFailure({ status: 401 }), true);
  assert.equal(isSessionRestoreAuthFailure({ status: 403 }), false);
  assert.equal(isSessionRestoreAuthFailure(new Error('network timeout')), false);
  assert.match(managementServiceSource, /apiRequest\('\/api\/v1\/auth\/me'\)/);
  assert.match(appSource, /managementAuthClient\.restoreSession\(\)/);
  assert.match(appSource, /sessionRestoreAttemptedRef/);
  assert.match(appSource, /sessionRestoreState/);
  assert.match(appSource, /SessionBootstrapScreen/);
  assert.match(appSource, /if \(isSessionRestoreAuthFailure\(error\)\)/);
  assert.match(appSource, /setSessionRestoreState\('error'\)/);
  assert.match(appSource, /retrySessionRestore/);
});

test('keeps unread emphasis and latest-message navigation in the ChatUI layer', () => {
  assert.match(appSource, /unreadCountForConversation/);
  assert.match(appSource, /indicatorCleared/);
  assert.match(appSource, /latest-message-jump-button/);
  assert.match(appSource, /chatIsNearBottomRef/);
  assert.match(appSource, /const acknowledgedReadSeq = await tinodeClient\.markRead\(topicName\)/);
  assert.match(appSource, /const notificationFloor = Math\.max/);
  assert.match(appSource, /openingConversationRef\.current !== String\(stateId\)/);
  assert.match(tinodeSource, /const topicReadFloors = new Map\(\)/);
  assert.match(tinodeSource, /topic\.noteRead\(readSequence\)/);
  const markReadSource = tinodeSource
    .split('async markRead')[1]
    .split('async sendTyping')[0];
  assert.doesNotMatch(markReadSource, /delMessages|deleteMessage/);
  assert.match(stylesSource, /\.conversation-item\.unread/);
  assert.match(stylesSource, /\.latest-message-jump-button/);
});

test('conversation activity ordering is monotonic and pin values are strict', () => {
  assert.match(appSource, /conversationActivityTimestamp\(room\)/);
  assert.match(appSource, /resolveMergedConversationActivity\(safeExisting, safeIncoming, messages\)/);
  assert.match(appSource, /pinned: safeIncoming\.pinnedExplicit \? safeIncoming\.pinned : safeExisting\.pinned/);
  assert.match(managementServiceSource, /normalizeConversationFlag\(record\?\.pinned/);
});

test('automatic topic binding never sends an empty group avatar', () => {
  const bindSource = managementServiceSource
    .split('async bindTinodeTopic')[1]
    .split('async enableTinodeChatbot')[0];
  assert.match(bindSource, /String\(avatarUrl \|\| ''\)\.trim\(\)/);
  assert.doesNotMatch(bindSource, /avatar: avatarUrl \|\| ''/);
  assert.doesNotMatch(tinodeSource, /else delete publicMetadata\.photo/);
});

test('renders per-user message receipts without changing the Tinode receipt flow', () => {
  assert.match(tinodeSource, /receiptUsersForTopicMessage/);
  assert.match(tinodeSource, /subscriber\?\.read/);
  assert.match(tinodeSource, /subscriber\?\.recv/);
  assert.match(appSource, /message-receipt-avatar-stack/);
  assert.match(appSource, /message-receipt-overflow/);
  assert.match(appSource, /message-receipt-sections/);
  assert.match(appSource, /receiptUser: event\.from/);
  assert.match(stylesSource, /\.message-receipt-avatar-stack/);
  assert.match(stylesSource, /\.message-receipt-details-avatar/);
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
  assert.match(appSource, /tenant-switcher-menu/);
  assert.match(appSource, /<TenantLogo src=\{currentTenantOption\.logo\}/);
  assert.match(appSource, /tenant-switcher-current-copy/);
  assert.match(appSource, /tenant-switcher-toggle/);
  const tenantSwitcherUiSource = appSource.split('{canSwitchTenant && (')[1].split('{tenantSwitchNotice &&')[0];
  const tenantToggleSource = tenantSwitcherUiSource.split('className="tenant-switcher-toggle"')[1].split('</button>')[0];
  assert.match(tenantSwitcherUiSource, /<div className="tenant-switcher-current"/);
  assert.match(tenantSwitcherUiSource, /tenant-switcher-current-name/);
  assert.equal((tenantSwitcherUiSource.match(/setTenantSwitcherOpen\(previous => !previous\)/g) || []).length, 1);
  assert.match(tenantToggleSource, /aria-controls="tenant-switcher-menu"/);
  assert.match(tenantToggleSource, /onClick=\{\(\) => setTenantSwitcherOpen\(previous => !previous\)\}/);
  assert.match(tenantSwitcherUiSource, /id="tenant-switcher-menu"/);
  assert.match(appSource, /const \[tenantSwitcherOpen, setTenantSwitcherOpen\] = useState\(false\)/);
  assert.match(appSource, /data-tenant-name=\{option\.name\}/);
  assert.match(appSource, /tenant-switcher-menu-list/);
  assert.match(appSource, /<strong>\{option\.name\}<\/strong>/);
  assert.match(appSource, /requestTenantSwitch\(option\)/);
  assert.doesNotMatch(appSource, /tenantSwitcherIndex|shiftTenantSwitcher|tenant-switcher-viewport|tenant-switcher-track/);
});

test('keeps Chatmgt directory responses isolated to the active tenant', () => {
  const accountTenantSource = managementServiceSource
    .split('function accountTenant')[1]
    .split('function activeSessionTenantId')[0];
  assert.doesNotMatch(accountTenantSource, /return value \|\| tenantId/);
  assert.match(managementServiceSource, /function activeSessionTenantId\(\)/);
  assert.match(managementServiceSource, /function accountsForActiveTenant\(accounts\)/);
  assert.match(
    managementServiceSource,
    /return accountsForActiveTenant\(responseItems\(payload\)\.map\(publicAccount\)\.filter\(Boolean\)\)/,
  );
  assert.match(
    managementServiceSource,
    /return accountsForActiveTenant\(responseItems\(payload\)\.map\(publicAccount\)\)/,
  );
  assert.match(appSource, /filterAccountsByTenant\(\s*directoryAccountsRef\.current/);
  assert.match(appSource, /filterAccountsByTenant\(\s*accounts,\s*currentUserRef\.current \|\| currentUser/);
});

test('requires explicit confirmation before switching tenants', () => {
  assert.match(appSource, /const \[pendingTenantSwitch, setPendingTenantSwitch\] = useState\(null\)/);
  assert.match(appSource, /onClick=\{\(\) => requestTenantSwitch\(option\)\}/);
  assert.match(appSource, /setPendingTenantSwitch\(option\)/);
  assert.match(appSource, /tenant-switch-confirm-modal/);
  assert.match(appSource, /aria-describedby="tenant-switch-confirm-description"/);
  assert.match(appSource, /onClick=\{confirmTenantSwitch\}/);
  assert.doesNotMatch(appSource, /onClick=\{\(\) => handleTenantSwitch\(selectedTenantOption\)\}/);
  const confirmationSource = appSource.split('const confirmTenantSwitch = () => {')[1].split('useEffect(() => {')[0];
  assert.match(confirmationSource, /handleTenantSwitch\(pendingTenantSwitch\)/);
  assert.match(stylesSource, /\.workspace-overlay \{[\s\S]*?z-index: 80;/);
  assert.match(stylesSource, /\.tenant-switch-confirm-backdrop \{ z-index: 90; \}/);
  assert.match(stylesSource, /\.tenant-switcher-control \{/);
  assert.doesNotMatch(stylesSource, /\.tenant-switcher-viewport \{|\.tenant-switcher-track \{/);
  assert.match(stylesSource, /\.tenant-switcher-current \{/);
  assert.match(stylesSource, /\.tenant-switcher-current \{[^}]*width: min\(128px, 18vw\);[^}]*max-width: 128px;[^}]*min-width: 124px;/);
  assert.match(stylesSource, /\.tenant-switcher-current \{ width: min\(128px, calc\(100vw - 154px\)\); max-width: 128px; min-width: 0; \}/);
  assert.match(stylesSource, /\.tenant-switcher-toggle \{/);
  assert.match(stylesSource, /\.tenant-switcher-menu-list \{ display: flex; flex-direction: column;/);
  assert.match(stylesSource, /\.tenant-switcher-menu-option \{/);
  assert.match(stylesSource, /max-height: min\(158px, calc\(100vh - 96px\)\)/);
  assert.match(stylesSource, /scrollbar-gutter: stable/);
  assert.match(appSource, /data-tenant-current=\{isCurrent \? 'true' : 'false'\}/);
  assert.match(appSource, /TenantSwitchLoadingOverlay/);
  assert.match(appSource, /Đang chuyển công ty\.\.\./);
  assert.match(appSource, /tenantMenuOptions/);
  assert.match(appSource, /vichat-loading-icon/);
  assert.match(stylesSource, /@keyframes vichatLoadingSpin/);
  assert.match(stylesSource, /@keyframes vichatLoadingPulse/);
  assert.match(appSource, /reloadStarted/);
  assert.match(stylesSource, /\.tenant-switch-loading-backdrop \{/);
});

test('refreshes company logo metadata without resetting the active chat session', () => {
  assert.equal(typeof chatManagementService.refreshSessionMetadata, 'function');
  assert.match(managementServiceSource, /async refreshSessionMetadata\(\)/);
  assert.match(managementServiceSource, /hydrateActiveSession\(payload, \{ preserveExisting: true \}\)/);
  assert.match(appSource, /chatManagementService\.refreshSessionMetadata\(\)/);
  assert.match(appSource, /tenantOptions: nextTenantOptions/);
  assert.match(appSource, /title=\{currentTenantOption\.name\}/);
  assert.match(appSource, /title=\{option\.name\}/);
  assert.match(appSource, /tenant-switcher-menu-option-icon/);
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

test('uses the Chatmgt heartbeat for directory presence and cleans it up on logout', () => {
  assert.equal(typeof chatManagementService.heartbeatPresence, 'function');
  assert.equal(typeof chatManagementService.listPresence, 'function');
  assert.equal(typeof chatManagementService.clearPresence, 'function');
  assert.match(managementServiceSource, /\/api\/v1\/chat\/presence\/heartbeat/);
  assert.match(managementServiceSource, /\/api\/v1\/chat\/presence\/batch/);
  assert.match(managementServiceSource, /\/api\/v1\/chat\/presence\/offline/);
  assert.match(appSource, /chatManagementService\.heartbeatPresence\(accountIds\)/);
  assert.match(appSource, /setInterval\(syncDirectoryPresence, 2000\)/);
  assert.doesNotMatch(appSource, /getDirectoryPresence\(/);
});

test('routes Account-managed profiles through the Account avatar contract', () => {
  assert.equal(isAccountManaged({ accountManaged: true }), true);
  assert.equal(isAccountManaged({ auth_source: 'account' }), true);
  assert.equal(isAccountManaged({ authSource: 'local' }), false);
  assert.match(managementServiceSource, /async updateAvatar\(file\)/);
  assert.match(appSource, /isAccountManaged\(currentUser\) \|\| chatManagementService\.accountManaged/);
  assert.match(appSource, /chatManagementService\.updateAvatar\(file\)/);
});

test('personal profile keeps only synced name and email fields and opens avatar crop before upload', () => {
  const profileSection = (appSource.split("{workspacePanel === 'profile' && (")[1] || '')
    .split("{workspacePanel === 'contacts' && (")[0];
  assert.doesNotMatch(profileSection, /profileForm\.title|profileForm\.department/);
  assert.match(appSource, /setAvatarCropFile\(file\)/);
  assert.match(appSource, /AvatarCropModal/);
  assert.match(avatarCropSource, /canvas\.toBlob/);
  assert.match(avatarCropSource, /avatarCropSourceRect/);
  assert.match(managementServiceSource, /updateProfile\(profile\)/);
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

test('group poll creation follows the administrator setting while voting remains available', () => {
  assert.match(appSource, /allowPolls/);
  assert.match(appSource, /const canCreatePollInActiveGroup/);
  assert.match(appSource, /isActiveGroupAdmin \|\| groupSettingEnabled\(activeGroupSettings, 'allowPolls'\)/);
  assert.match(appSource, /if \(!canCreatePollInActiveGroup\)/);
  assert.match(appSource, /poll-input-action/);
});

test('group information exposes a poll-only board without changing direct-chat details', () => {
  assert.match(appSource, /const \[isGroupBoardOpen, setIsGroupBoardOpen\] = useState\(false\)/);
  assert.match(appSource, /const groupBoardPolls = activeChat\.isGroup/);
  assert.match(appSource, /className=\{`detail-section group-board-section/);
  assert.match(appSource, /appCopy\.t\('Bảng tin nhóm'\)/);
  assert.match(appSource, /<PollMessageCard/);
  assert.match(appSource, /onVote=\{handlePollVote\}/);
  assert.match(appSource, /onAddOption=\{handlePollAddOption\}/);
  assert.match(appSource, /onLock=\{handlePollLock\}/);
  assert.match(appSource, /\{activeChat\.isGroup && \(\s*<section className=\{`detail-section group-board-section/);
});

test('pinned message overflow reuses message actions and can open the group board', () => {
  assert.match(appSource, /const \[pinnedMessageMenu, setPinnedMessageMenu\] = useState\(null\)/);
  assert.match(appSource, /const openPinnedMessageMenu = event =>/);
  assert.match(appSource, /className="pinned-messages-more pinned-messages-menu-button"/);
  assert.match(appSource, /appCopy\.t\('Copy tin nhắn'\)/);
  assert.match(appSource, /appCopy\.t\('Mở bảng tin nhóm'\)/);
  assert.match(appSource, /handlePinnedMessageMenuAction\('unpin'\)/);
  assert.match(appSource, /setIsDetailOpen\(true\);\s*setIsGroupBoardOpen\(true\);/);
  assert.match(stylesSource, /\.pinned-messages-more:hover/);
});

test('chat header uses a stateful information panel control for direct and group chats', () => {
  assert.match(appSource, /btn-header-action btn-header-detail/);
  assert.match(appSource, /isDetailOpen \? 'active is-open' : 'is-closed'/);
  assert.match(appSource, /fa-table-columns/);
  assert.match(appSource, /aria-expanded=\{isDetailOpen\}/);
  assert.match(appSource, /id="conversation-details-sidebar"/);
  assert.match(stylesSource, /\.btn-header-detail\.is-closed/);
  assert.match(stylesSource, /\.btn-header-detail\.is-open/);
});

test('group owner departure transfers to survivors but lets the final member close the group', () => {
  assert.match(appSource, /pendingGroupLeave/);
  assert.match(appSource, /groupLeaveReplacementId/);
  assert.match(appSource, /Chọn trưởng nhóm mới/);
  assert.match(appSource, /replacementId/);
  assert.match(appSource, /Chuyển quyền và rời nhóm/);
  assert.match(appSource, /ownerReplacementMembers\.length > 0 && !replacementId/);
  assert.match(appSource, /function groupOwnerReplacementMembers[\s\S]*roomParticipantIds\(room\)/);
  assert.match(appSource, /const groupLeaveMembers = pendingGroupLeaveRoom[\s\S]*const groupLeaveCandidates = \[\.\.\.groupLeaveMembers\][\s\S]*matchesCompanyDirectoryContact/);
  assert.match(appSource, /Bạn là thành viên cuối cùng\. Rời nhóm sẽ đóng nhóm này\./);
  assert.match(appSource, /void executeGroupLeave\(targetRoom, '', '', mode\)/);
  assert.match(managementServiceSource, /replacement_id/);
  assert.match(appSource, /replacementName/);
  assert.match(appSource, /leaveDemoGroup\(targetRoom\.id, actorId, replacementId\)/);
  assert.match(mobileConversationListSource, /candidates\.length === 0/);
  assert.match(mobileConversationListSource, /Bạn là thành viên cuối cùng\. Rời nhóm sẽ đóng nhóm này\./);
  assert.match(mobileConversationListSource, /\(\) => deleteConversation\(item\.id\)/);
  assert.doesNotMatch(appSource, /randomMemberId/);
});

test('group lifecycle actions confirm before leaving and expose owner-only dissolve controls', () => {
  assert.equal(typeof chatManagementService.dissolveGroup, 'function');
  assert.match(managementServiceSource, /async dissolveGroup\(conversationId\)/);
  assert.match(managementServiceSource, /\/dissolve/);
  assert.match(appSource, /const \[isDissolvingGroup, setIsDissolvingGroup\] = useState\(false\)/);
  assert.match(appSource, /handleDissolveGroup/);
  assert.match(appSource, /group-dissolve-button/);
  assert.match(appSource, /Bạn có chắc muốn giải tán nhóm/);
  assert.match(appSource, /Bạn có chắc muốn rời nhóm/);
  assert.match(appSource, /Bạn có chắc muốn xóa hội thoại/);
  assert.match(stylesSource, /\.group-management-danger-zone/);
});

test('group message pinning announces the actor without changing direct-chat pin behavior', () => {
  assert.match(appSource, /message_pinned/);
  assert.match(appSource, /message_unpinned/);
  assert.match(appSource, /tinodeClient\.sendSystemEvent\(topicName, pinEvent\)/);
  assert.match(appSource, /appendDemoGroupMessage\(activeChat\.id, systemMessage\)/);
  assert.match(appSource, /activeChat\.isGroup && chatMode === 'tinode'/);
  assert.match(appSource, /activeChat\.isGroup && chatMode === 'demo'/);
  assert.match(appSource, /group_dissolved/);
});

test('keeps dark stickers crisp and group activity announcements readable', () => {
  assert.match(appSource, /group-system-message-\$\{systemEventClass\}/);
  assert.match(appSource, /group-system-message-copy/);
  assert.match(appSource, /member_joined/);
  assert.match(stylesSource, /\.group-system-message-copy/);
  assert.match(stylesSource, /background: rgba\(246, 249, 248, \.96\)/);
  assert.match(stylesSource, /\.sticker-message-image \{ filter: none !important; mix-blend-mode: normal; \}/);
});

test('keeps conversation background scope isolated from the message and presence flows', () => {
  assert.match(appSource, /writeConversationBackgroundPreference\([\s\S]*CONVERSATION_BACKGROUND_SCOPES\.LOCAL/);
  assert.match(appSource, /tinodeClient\.uploadConversationBackground\(topicName, selectedUpload\)/);
  assert.match(appSource, /tinodeClient\.updateConversationBackground\(topicName, nextBackground\)/);
  assert.match(tinodeSource, /const latestBackground = latestSharedConversationBackground\(\{ messages: finalMessages \}\)/);
  assert.match(tinodeSource, /scope: CONVERSATION_BACKGROUND_SCOPES\.SHARED/);
});

test('group info controls follow realtime permission changes and publish visible activity events', () => {
  assert.match(appSource, /canEditActiveGroupInfo/);
  assert.match(appSource, /activeChat\.isGroup && activeChat\.id !== 'empty' && canEditActiveGroupInfo/);
  assert.match(appSource, /isGroupRenameOpen && activeChat\.isGroup && canEditActiveGroupInfo/);
  assert.match(appSource, /event\.type === 'group-settings'/);
  assert.match(appSource, /groupNameRefreshRef/);
  assert.match(appSource, /refreshManagementConversations\(accountSession\)/);
  assert.match(appSource, /groupInfoErrorMessage\(error, 'Không thể cập nhật hình nền cuộc trò chuyện\.'\)/);
  assert.match(appSource, /setConversationBackgroundNotice\(GROUP_INFO_PERMISSION_MESSAGE\)/);
  assert.match(appSource, /action: 'group_name_changed'/);
  assert.match(appSource, /action: 'group_avatar_changed'/);
  assert.match(appSource, /action: 'group_settings_changed'/);
  assert.match(tinodeSource, /emitGroupSettingsChange\(topic, topicClient\)/);
  assert.match(tinodeSource, /type: 'group-settings'/);
  assert.match(tinodeSource, /isGroup: topic\.isGroupType\?\.\(\) \|\| topic\.name\?\.startsWith\('grp'\)/);
});

test('group mute and reaction controls preserve the existing checkbox flow and expose actor details', () => {
  const muteSource = appSource.split('const handleConversationMuteToggle')[1].split('const handleNotificationMuteSubmit')[0];
  assert.match(muteSource, /typeof event\?\.target\?\.checked === 'boolean'/);
  assert.match(muteSource, /!activeChatMuted/);
  assert.match(appSource, /reactionUsers/);
  assert.match(appSource, /reaction-details-modal/);
  assert.match(appSource, /activeChat\.isGroup\s*\n?\s*&& identitiesOverlap\(\{ id: messageSenderId \}/);
});

test('renders the group owner key on incoming owner avatars only', () => {
  const avatarBlock = appSource.split('{!isOutgoing && (')[1].split('</button>')[0];
  assert.match(avatarBlock, /isOwnerMessage/);
  assert.match(avatarBlock, /group-owner-avatar-badge/);
  assert.match(avatarBlock, /fa-key/);
  assert.doesNotMatch(appSource, /group-owner-message-badge/);
  assert.doesNotMatch(appSource, /isOutgoing && isOwnerMessage/);
  assert.match(stylesSource, /\.message-avatar \{[\s\S]*?position: relative;[\s\S]*?overflow: visible;/);
  assert.match(stylesSource, /\.group-owner-avatar-badge \{[\s\S]*?position: absolute;[\s\S]*?right: -4px;[\s\S]*?bottom: -3px;/);
});

test('conversation actions use the authoritative Chatmgt id on web and mobile', () => {
  assert.match(appSource, /deleteConversationForCurrentUser\(activeChat\.managementId \|\| activeChat\.id\)/);
  assert.match(appSource, /const managementConversationId = room\.managementId \|\| room\.id;/);
  assert.match(mobileStoreSource, /conversation\.managementId \|\| conversation\.id,[\s\S]*until,/);
  assert.match(mobileStoreSource, /deleteConversationForCurrentUser\(conversation\.managementId \|\| conversation\.id, tinodeAuth\.token, replacementId\)/);
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

test('managed direct deletion keeps the topic and reopens after a post-delete message', () => {
  assert.match(appSource, /const isManagedDirect = usesManagementData && !activeChat\.isGroup/);
  assert.match(appSource, /tinodeClient\.deleteConversation\(removedTopic, \{ isGroup: false \}\)/);
  assert.match(appSource, /if \(removedTopic && isManagedDirect\) tinodeClient\.allowConversationTopic\(removedTopic\)/);
  assert.match(appSource, /const reopenDirectConversation = async/);
  assert.match(appSource, /chatManagementService\.createConversation\(\{[\s\S]*participantIds: \[peerId\]/);
  assert.match(appSource, /messages: roomMessages\(conversation\)\.filter\(message => messageTimestamp\(message\) > deletedAt\)/);
  assert.match(managementServiceSource, /deletedAt: record\?\.deletedAt/);
  assert.match(tinodeSource, /await topic\.delMessagesAll\(false\)/);
  assert.match(tinodeSource, /vichatDeletedAt/);
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
