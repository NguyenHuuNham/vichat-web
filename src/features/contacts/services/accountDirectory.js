// The account directory is private and is loaded through the management API.
// Keep identity matching here so existing chat rendering code remains unchanged.
export async function loadAccountDirectory() {
  throw new Error('Account directory is available only through the authenticated management service.');
}

export async function authenticateDemoAccount() {
  throw new Error('Public account login is disabled.');
}

function scalarText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function firstText(...values) {
  return values.map(scalarText).find(Boolean) || '';
}

function avatarText(value) {
  const direct = scalarText(value);
  if (direct) return direct;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return firstText(value.url, value.ref, value.src, value.href, value.path);
}

function booleanValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function timestampValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const text = scalarText(value);
  if (!text) return '';
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) return text;
  return Number.isFinite(Date.parse(text)) ? text : '';
}

function timestampMilliseconds(value) {
  const normalized = timestampValue(value);
  if (!normalized) return 0;
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(String(normalized));
  return Number.isFinite(parsed) ? parsed : 0;
}

function newerTimestamp(first, second) {
  const firstValue = timestampValue(first);
  const secondValue = timestampValue(second);
  if (!firstValue) return secondValue;
  if (!secondValue) return firstValue;
  return timestampMilliseconds(secondValue) > timestampMilliseconds(firstValue)
    ? secondValue
    : firstValue;
}

export function latestTimestampValue(...values) {
  return values.reduce((latest, value) => newerTimestamp(latest, value), '') || undefined;
}

function accountManagedValue(account) {
  return Boolean(
    account?.accountManaged
      || account?.account_managed
      || account?.authSource === 'account'
      || account?.auth_source === 'account',
  );
}

export const GROUP_ROLE_OWNER = 'OWNER';
export const GROUP_ROLE_ADMIN = 'ADMIN';
export const GROUP_ROLE_MEMBER = 'MEMBER';
const GROUP_ROLE_VALUES = new Set([GROUP_ROLE_OWNER, GROUP_ROLE_ADMIN, GROUP_ROLE_MEMBER]);

export function normalizeGroupRole(value, fallback = GROUP_ROLE_MEMBER) {
  const role = String(value || '').trim().toUpperCase();
  if (GROUP_ROLE_VALUES.has(role)) return role;
  const normalizedFallback = String(fallback || '').trim().toUpperCase();
  return GROUP_ROLE_VALUES.has(normalizedFallback) ? normalizedFallback : GROUP_ROLE_MEMBER;
}

export function explicitGroupRole(entity) {
  const role = String(entity?.groupRole ?? entity?.group_role ?? '').trim().toUpperCase();
  return GROUP_ROLE_VALUES.has(role) ? role : '';
}

export function groupRoleOf(entity, fallback = GROUP_ROLE_MEMBER) {
  return normalizeGroupRole(explicitGroupRole(entity), fallback);
}

export function normalizeTenantShape(tenant) {
  if (!tenant || typeof tenant !== 'object' || Array.isArray(tenant)) return null;
  const id = firstText(tenant.id, tenant.tenantId, tenant.tenant_id);
  const name = firstText(tenant.name, tenant.tenantName, tenant.tenant_name, id);
  if (!id && !name) return null;
  return { ...tenant, id, name };
}

// Keep API and realtime profile fields render-safe before they reach React.
export function normalizeAccountShape(account) {
  if (!account || typeof account !== 'object' || Array.isArray(account)) return null;
  const id = firstText(account.id, account.user_id, account.uid);
  const uid = firstText(account.uid, account.user_id, id);
  const tinodeUid = firstText(account.tinodeUid, account.tinode_uid);
  const tinodeUsername = firstText(account.tinodeUsername, account.tinode_username);
  const username = firstText(account.username, account.user_name, account.login, account.email);
  const defaultName = firstText(
    account.defaultName,
    account.default_name,
    account.full_name,
    account.name,
    account.display_name,
    username,
  );
  const email = firstText(account.email, account.mail);
  const avatar = [account.avatar, account.avatarUrl, account.avatar_url, account.photo]
    .map(avatarText)
    .find(Boolean) || '';
  const tenant = normalizeTenantShape(account.tenant);
  const tenantId = firstText(
    tenantValue(account.tenantId),
    tenantValue(account.tenant_id),
    tenant?.id,
  );
  const tenantName = firstText(
    scalarText(account.tenantName),
    scalarText(account.tenant_name),
    tenant?.name,
  );
  const authSource = firstText(account.authSource, account.auth_source).toLowerCase();
  const lastSeenAt = timestampValue(account.lastSeenAt ?? account.last_seen_at ?? account.last_seen);
  const groupRole = explicitGroupRole(account);
  const hasAccountManaged = account.accountManaged !== undefined || account.account_managed !== undefined;
  const accountManaged = hasAccountManaged
    ? booleanValue(account.accountManaged ?? account.account_managed)
    : authSource === 'account';
  const safe = {
    ...account,
    id,
    uid,
    tinodeUid,
    tinode_uid: tinodeUid,
    tinodeUsername,
    tinode_username: tinodeUsername,
    username,
    user_name: username,
    name: defaultName,
    full_name: defaultName,
    display_name: defaultName,
    defaultName,
    default_name: defaultName,
    nickname: '',
    email,
    title: firstText(account.title, account.job_title),
    department: firstText(account.department, account.department_name),
    avatar,
    avatarUrl: avatar,
    avatar_url: avatar,
    photo: avatar,
    tenantId,
    tenant_id: tenantId,
    tenantName,
    tenant_name: tenantName,
    tenant,
    role: firstText(account.role, account.accountRole, account.account_role),
    accountRole: firstText(account.accountRole, account.account_role, account.role),
    ...(groupRole ? { groupRole, group_role: groupRole } : {}),
    active: booleanValue(account.active ?? account.is_active, true),
    ...(authSource || hasAccountManaged ? {
      authSource,
      auth_source: authSource,
      accountManaged,
      account_managed: accountManaged,
    } : {}),
  };
  delete safe.contactNickname;
  delete safe.contact_nickname;
  if (account.online !== undefined) safe.online = booleanValue(account.online);
  if (lastSeenAt) {
    safe.lastSeenAt = lastSeenAt;
    safe.last_seen_at = lastSeenAt;
  }
  if (account.mustChangePassword !== undefined || account.must_change_password !== undefined) {
    safe.mustChangePassword = booleanValue(account.mustChangePassword ?? account.must_change_password);
  }
  return safe;
}

export function identityValues(entity) {
  return [...new Set([
    entity?.id,
    entity?.uid,
    entity?.tinodeUid,
    entity?.tinode_uid,
  ].filter(Boolean).map(value => String(value)))];
}

export function identitiesOverlap(first, second) {
  const secondValues = new Set(identityValues(second));
  return identityValues(first).some(value => secondValues.has(value));
}

function tenantValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return firstText(value.id, value.tenantId, value.tenant_id);
  }
  return scalarText(value);
}

export function accountTenantId(entity) {
  return firstText(
    tenantValue(entity?.tenantId),
    tenantValue(entity?.tenant_id),
    tenantValue(entity?.tenant),
  );
}

function tenantsCompatible(first, second) {
  const firstTenantId = accountTenantId(first);
  const secondTenantId = accountTenantId(second);
  return !firstTenantId || !secondTenantId || firstTenantId === secondTenantId;
}

// A directory snapshot without an active tenant is not safe to display or retain.
export function filterAccountsByTenant(accounts, currentTenantOrUser) {
  const currentTenantId = typeof currentTenantOrUser === 'string' || typeof currentTenantOrUser === 'number'
    ? String(currentTenantOrUser).trim()
    : accountTenantId(currentTenantOrUser);
  if (!currentTenantId) return [];
  return (Array.isArray(accounts) ? accounts : []).filter(account => (
    accountTenantId(account) === currentTenantId
  ));
}

export function companyDirectoryHeading(currentUser) {
  const companyName = String(
    currentUser?.tenantName || currentUser?.tenant_name || currentUser?.tenant?.name || '',
  ).trim();
  return companyName ? `Nhân viên · ${companyName}` : 'Nhân viên công ty';
}

export function directoryUsernameMeta(account) {
  const username = String(account?.username || '').trim().replace(/^@+/, '');
  if (!username) return '';
  return ` · @${username.split('@')[0]}`;
}

function normalizedDirectorySearchValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLocaleLowerCase('vi');
}

export function matchesCompanyDirectoryContact(account, query) {
  const normalizedQuery = normalizedDirectorySearchValue(query).trim();
  if (!normalizedQuery) return true;
  return [
    account?.name,
    account?.username,
    account?.email,
    account?.title,
    account?.department,
  ].some(value => normalizedDirectorySearchValue(value).includes(normalizedQuery));
}

export function companyDirectoryContacts(accounts, currentUser) {
  const contacts = [];
  filterAccountsByTenant(accounts, currentUser).forEach(account => {
    if (!account || account.active === false || identitiesOverlap(account, currentUser)) return;
    if (contacts.some(contact => identitiesOverlap(contact, account))) return;
    contacts.push(account);
  });
  return contacts.sort((first, second) => {
    const firstOnline = first.online === true;
    const secondOnline = second.online === true;
    if (firstOnline !== secondOnline) return secondOnline ? 1 : -1;
    return String(first.name || first.username || first.email || '')
      .localeCompare(String(second.name || second.username || second.email || ''), 'vi', { sensitivity: 'base' });
  });
}

export function snapshotPresence(entity, snapshot) {
  for (const value of identityValues(entity)) {
    if (Object.prototype.hasOwnProperty.call(snapshot || {}, value)) return Boolean(snapshot[value]);
  }
  return undefined;
}

export function snapshotLastSeenAt(entity, snapshot) {
  let latest = '';
  for (const value of identityValues(entity)) {
    if (!Object.prototype.hasOwnProperty.call(snapshot || {}, value)) continue;
    const timestamp = timestampValue(snapshot[value]);
    latest = newerTimestamp(latest, timestamp);
  }
  return latest || undefined;
}

export function updateAccountPresence(accounts, snapshot, currentUser, lastSeenSnapshot = {}) {
  let changed = false;
  const next = (accounts || []).map(account => {
    const online = identitiesOverlap(account, currentUser) ? undefined : snapshotPresence(account, snapshot);
    const lastSeenAt = online === false
      ? latestTimestampValue(account?.lastSeenAt ?? account?.last_seen_at, snapshotLastSeenAt(account, lastSeenSnapshot))
      : undefined;
    const onlineChanged = online !== undefined && account?.online !== online;
    const lastSeenChanged = lastSeenAt !== undefined
      && (account?.lastSeenAt ?? account?.last_seen_at) !== lastSeenAt;
    if (!onlineChanged && !lastSeenChanged) return account;
    changed = true;
    return {
      ...account,
      ...(online !== undefined ? { online } : {}),
      ...(lastSeenAt !== undefined ? { lastSeenAt, last_seen_at: lastSeenAt } : {}),
    };
  });
  return changed ? next : accounts;
}

export function mergeRealtimeAccountProfile(entity, profile) {
  if (!entity || !profile || !tenantsCompatible(entity, profile) || !identitiesOverlap(entity, profile)) return entity;
  const nextDefaultName = firstText(profile.defaultName, profile.default_name, profile.name, entity.defaultName, entity.name);
  // Account snapshots can briefly omit the avatar while the Account CDN/cache catches up.
  const nextAvatar = accountManagedValue(profile)
    ? (scalarText(profile.avatar) || scalarText(entity.avatar))
    : (profile.avatar || entity.avatar || '');
  if (
    nextDefaultName === entity.name
    && nextDefaultName === entity.defaultName
    && nextAvatar === entity.avatar
    && entity.nickname === ''
  ) return entity;
  const next = {
    ...entity,
    name: nextDefaultName,
    full_name: nextDefaultName,
    defaultName: nextDefaultName,
    default_name: nextDefaultName,
    nickname: '',
    avatar: nextAvatar,
  };
  delete next.contactNickname;
  delete next.contact_nickname;
  return next;
}

export function updateAccountProfiles(accounts, profile, currentTenantOrUser) {
  let changed = false;
  const source = currentTenantOrUser === undefined
    ? (accounts || [])
    : filterAccountsByTenant(accounts, currentTenantOrUser);
  const next = source.map(account => {
    const updated = mergeRealtimeAccountProfile(account, profile);
    if (updated !== account) changed = true;
    return updated;
  });
  return changed ? next : source;
}

export function mergeDirectoryAccountSnapshots(
  previousAccounts = [],
  incomingAccounts = [],
  currentTenantOrUser,
) {
  const previous = currentTenantOrUser === undefined
    ? (Array.isArray(previousAccounts) ? previousAccounts : [])
    : filterAccountsByTenant(previousAccounts, currentTenantOrUser);
  const incoming = currentTenantOrUser === undefined
    ? (Array.isArray(incomingAccounts) ? incomingAccounts : [])
    : filterAccountsByTenant(incomingAccounts, currentTenantOrUser);
  let changed = false;
  const next = incoming.map(account => {
    const previousAccount = findAccount(previous, account?.id || account?.uid || account?.tinodeUid || account?.tinode_uid);
    if (!previousAccount) return account;
    const avatar = account.avatar || previousAccount.avatar || '';
    const hasIncomingOnline = Object.prototype.hasOwnProperty.call(account || {}, 'online');
    const lastSeenAt = latestTimestampValue(
      account.lastSeenAt ?? account.last_seen_at,
      previousAccount.lastSeenAt ?? previousAccount.last_seen_at,
    );
    const defaultName = firstText(
      account.defaultName,
      account.default_name,
      account.full_name,
      previousAccount.defaultName,
      previousAccount.default_name,
      previousAccount.full_name,
      account.name,
      previousAccount.name,
    );
    const name = defaultName || account.name || previousAccount.name;
    const merged = {
      ...account,
      name,
      defaultName,
      default_name: defaultName,
      display_name: name,
      nickname: '',
      // Directory polling may briefly return an old/empty avatar after upload.
      avatar,
      ...(hasIncomingOnline || typeof previousAccount.online === 'boolean'
        ? {
          online: typeof previousAccount.online === 'boolean'
            ? previousAccount.online
            : account.online === true,
        }
        : {}),
      ...(lastSeenAt ? { lastSeenAt, last_seen_at: lastSeenAt } : {}),
    };
    delete merged.contactNickname;
    delete merged.contact_nickname;
    const accountChanged = name !== account.name
      || defaultName !== account.defaultName
      || scalarText(account.nickname) !== ''
      || avatar !== account.avatar
      || merged.online !== account.online
      || merged.lastSeenAt !== account.lastSeenAt;
    if (accountChanged) changed = true;
    return accountChanged ? merged : account;
  });
  return changed ? next : incoming;
}

export function mergeRealtimeMemberPresence(members, realtimeMembers) {
  if (!Array.isArray(members) || !Array.isArray(realtimeMembers) || realtimeMembers.length === 0) {
    return members;
  }
  let changed = false;
  const next = members.map(member => {
    const realtimeMember = realtimeMembers.find(candidate => identitiesOverlap(member, candidate));
    if (!realtimeMember) return member;
    const hasOnline = typeof realtimeMember.online === 'boolean';
    const lastSeenAt = latestTimestampValue(
      member.lastSeenAt ?? member.last_seen_at,
      realtimeMember.lastSeenAt ?? realtimeMember.last_seen_at,
    );
    const onlineChanged = hasOnline && member.online !== realtimeMember.online;
    const lastSeenChanged = Boolean(lastSeenAt)
      && (member.lastSeenAt ?? member.last_seen_at) !== lastSeenAt;
    if (!onlineChanged && !lastSeenChanged) return member;
    changed = true;
    return {
      ...member,
      ...(hasOnline ? { online: realtimeMember.online } : {}),
      ...(lastSeenAt ? { lastSeenAt, last_seen_at: lastSeenAt } : {}),
    };
  });
  return changed ? next : members;
}

export function countGroupPresence(members, currentUser, currentUserOnline) {
  const groupMembers = Array.isArray(members) ? members : [];
  return {
    memberCount: groupMembers.length,
    onlineCount: groupMembers.filter(member => (
      identitiesOverlap(member, currentUser) ? currentUserOnline === true : member?.online === true
    )).length,
  };
}

export function findDirectPeer(room, accounts, currentUser) {
  const members = (Array.isArray(room?.members) ? room.members : []).map(member => (
    findAccount(accounts, member?.id || member?.uid || member?.tinodeUid || member?.tinode_uid || member?.name)
    || member
  ));
  const participants = (Array.isArray(room?.participantIds) ? room.participantIds : [])
    .map(identity => findAccount(accounts, identity))
    .filter(Boolean);
  return [...members, ...participants]
    .find(account => account && !identitiesOverlap(account, currentUser)) || null;
}

export function groupRoleForIdentity(room, identity, accounts = []) {
  if (!room?.isGroup || !identity) return GROUP_ROLE_MEMBER;
  const probe = typeof identity === 'object' ? identity : { id: identity };
  const members = Array.isArray(room.members) ? room.members : [];
  const member = members.find(candidate => identitiesOverlap(candidate, probe)) || null;
  const account = findAccount(accounts, identity) || null;
  const explicitRole = explicitGroupRole(member) || explicitGroupRole(account);
  if (explicitRole) return explicitRole;

  const ownerId = String(room.adminId || '').trim();
  if (ownerId && identitiesOverlap(probe, { id: ownerId })) return GROUP_ROLE_OWNER;
  const tinodeOwner = members.find(candidate => String(candidate?.mode || '').includes('O'));
  if (tinodeOwner && member && identitiesOverlap(member, tinodeOwner)) return GROUP_ROLE_OWNER;
  return GROUP_ROLE_MEMBER;
}

export function isGroupOwnerMember(member) {
  return groupRoleOf(member) === GROUP_ROLE_OWNER;
}

export function isGroupDeputyMember(member) {
  return groupRoleOf(member) === GROUP_ROLE_ADMIN;
}

export function resolveGroupAdministrator(room, accounts = []) {
  if (!room?.isGroup) return null;
  const members = Array.isArray(room.members) ? room.members : [];
  const roleOwner = members.find(member => explicitGroupRole(member) === GROUP_ROLE_OWNER) || null;
  const tinodeOwner = members.find(member => String(member?.mode || '').includes('O')) || null;
  const adminId = String(
    room.adminId
    || roleOwner?.id
    || roleOwner?.uid
    || roleOwner?.tinodeUid
    || roleOwner?.tinode_uid
    || tinodeOwner?.id
    || tinodeOwner?.uid
    || tinodeOwner?.tinodeUid
    || tinodeOwner?.tinode_uid
    || '',
  ).trim();
  const memberAccount = findAccount(members, adminId) || tinodeOwner;
  const directoryAccount = findAccount(accounts, adminId)
    || (room.admin ? findAccount(accounts, room.admin) : null);
  const resolved = memberAccount || directoryAccount
    ? { ...(memberAccount || {}), ...(directoryAccount || {}) }
    : null;

  if (resolved) {
    return {
      ...resolved,
      name: resolved.name || room.admin || tinodeOwner?.name || 'Quản trị viên',
    };
  }
  if (!adminId && !room.admin) return null;
  return { id: adminId, name: room.admin || 'Quản trị viên' };
}

export function canManageGroupMembers(room, accounts, currentUser) {
  if (!room?.isGroup || !currentUser) return false;
  if ([GROUP_ROLE_OWNER, GROUP_ROLE_ADMIN].includes(groupRoleForIdentity(room, currentUser, accounts))) return true;
  const administrator = resolveGroupAdministrator(room, accounts);
  if (identitiesOverlap(administrator, currentUser)) return true;
  const adminId = String(room.adminId || '').trim();
  if (adminId && identityValues(currentUser).includes(adminId)) return true;
  return !adminId && Boolean(room.admin) && room.admin === currentUser.name;
}

export function canApproveGroupMembers(room, accounts, currentUser) {
  // Approval is a group role, not a tenant-wide administration capability.
  return canManageGroupMembers(room, accounts, currentUser);
}

export function canRemoveGroupMember(room, accounts, currentUser, member) {
  if (!identityValues(member).length || !canManageGroupMembers(room, accounts, currentUser)) return false;
  const administrator = resolveGroupAdministrator(room, accounts);
  return !identitiesOverlap(member, currentUser)
    && groupRoleForIdentity(room, member, accounts) !== GROUP_ROLE_OWNER
    && !identitiesOverlap(member, administrator);
}

export function canAppointGroupDeputy(room, accounts, currentUser, member) {
  if (!identityValues(member).length || !room?.isGroup) return false;
  return canManageGroupMembers(room, accounts, currentUser)
    && !identitiesOverlap(member, currentUser)
    && groupRoleForIdentity(room, member, accounts) === GROUP_ROLE_MEMBER;
}

export function canRevokeGroupDeputy(room, accounts, currentUser, member) {
  if (!identityValues(member).length || !room?.isGroup) return false;
  return canManageGroupMembers(room, accounts, currentUser)
    && !identitiesOverlap(member, currentUser)
    && groupRoleForIdentity(room, member, accounts) === GROUP_ROLE_ADMIN;
}

export function findAccount(accounts, identity) {
  if (!identity || !Array.isArray(accounts)) return null;
  const normalized = String(identity).trim().toLowerCase();
  const matches = value => (
    (typeof value === 'string' || typeof value === 'number')
    && String(value).trim().toLowerCase() === normalized
  );
  return accounts.find(item => item && (
    [item.id, item.uid, item.tinodeUid, item.tinode_uid].some(matches)
    || matches(item.username)
    || matches(item.email)
    || matches(item.name)
    || matches(item.defaultName)
    || matches(item.default_name)
  )) || null;
}

export function findAccountByIdentities(accounts, identities = []) {
  const values = Array.isArray(identities) ? identities : [identities];
  for (const identity of values) {
    const account = findAccount(accounts, identity);
    if (account) return account;
  }
  return null;
}
