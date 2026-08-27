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

function accountManagedValue(account) {
  return Boolean(
    account?.accountManaged
      || account?.account_managed
      || account?.authSource === 'account'
      || account?.auth_source === 'account',
  );
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
    account.name,
    account.full_name,
    account.display_name,
    username,
  );
  const nickname = firstText(account.nickname, account.contactNickname, account.contact_nickname);
  const name = nickname || defaultName;
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
    name,
    full_name: defaultName,
    display_name: name,
    defaultName,
    default_name: defaultName,
    nickname,
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
    active: booleanValue(account.active ?? account.is_active, true),
    ...(authSource || hasAccountManaged ? {
      authSource,
      auth_source: authSource,
      accountManaged,
      account_managed: accountManaged,
    } : {}),
  };
  if (account.online !== undefined) safe.online = booleanValue(account.online);
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

export function updateAccountPresence(accounts, snapshot, currentUser) {
  let changed = false;
  const next = (accounts || []).map(account => {
    const online = identitiesOverlap(account, currentUser) ? undefined : snapshotPresence(account, snapshot);
    if (online === undefined || account?.online === online) return account;
    changed = true;
    return { ...account, online };
  });
  return changed ? next : accounts;
}

export function mergeRealtimeAccountProfile(entity, profile) {
  if (!entity || !profile || !tenantsCompatible(entity, profile) || !identitiesOverlap(entity, profile)) return entity;
  const nextDefaultName = firstText(profile.defaultName, profile.default_name, profile.name, entity.defaultName, entity.name);
  const nextNickname = firstText(entity.nickname, profile.nickname);
  const nextName = nextNickname || nextDefaultName;
  // Account snapshots can briefly omit the avatar while the Account CDN/cache catches up.
  const nextAvatar = accountManagedValue(profile)
    ? (scalarText(profile.avatar) || scalarText(entity.avatar))
    : (profile.avatar || entity.avatar || '');
  if (
    nextName === entity.name
    && nextDefaultName === entity.defaultName
    && nextAvatar === entity.avatar
  ) return entity;
  return {
    ...entity,
    name: nextName,
    full_name: nextDefaultName,
    defaultName: nextDefaultName,
    default_name: nextDefaultName,
    nickname: nextNickname,
    avatar: nextAvatar,
  };
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

export function applyContactNicknames(accounts, nicknames = {}) {
  const source = nicknames && typeof nicknames === 'object' && !Array.isArray(nicknames)
    ? nicknames
    : {};
  let changed = false;
  const next = (accounts || []).map(account => {
    const identity = identityValues(account).find(value => (
      Object.prototype.hasOwnProperty.call(source, value)
    )) || '';
    const defaultName = firstText(account?.defaultName, account?.default_name, account?.name, account?.username);
    const nickname = scalarText(identity ? source[identity] : '');
    const name = nickname || defaultName;
    if (
      account?.name === name
      && account?.defaultName === defaultName
      && account?.nickname === nickname
    ) return account;
    changed = true;
    return {
      ...account,
      name,
      full_name: defaultName,
      display_name: name,
      defaultName,
      default_name: defaultName,
      nickname,
    };
  });
  return changed ? next : accounts;
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
    const hasIncomingNickname = Object.prototype.hasOwnProperty.call(account || {}, 'nickname');
    const hasIncomingOnline = Object.prototype.hasOwnProperty.call(account || {}, 'online');
    const nickname = hasIncomingNickname
      ? scalarText(account.nickname)
      : scalarText(previousAccount.nickname);
    const defaultName = firstText(
      account.defaultName,
      account.default_name,
      previousAccount.defaultName,
      previousAccount.default_name,
      account.name,
      previousAccount.name,
    );
    const name = hasIncomingNickname
      ? (nickname || defaultName)
      : (nickname || account.name || previousAccount.name || defaultName);
    const merged = {
      ...account,
      name,
      defaultName,
      default_name: defaultName,
      display_name: name,
      nickname,
      // Directory polling may briefly return an old/empty avatar after upload.
      avatar,
      ...(hasIncomingOnline || typeof previousAccount.online === 'boolean'
        ? {
          online: typeof previousAccount.online === 'boolean'
            ? previousAccount.online
            : account.online === true,
        }
        : {}),
    };
    const accountChanged = name !== account.name
      || defaultName !== account.defaultName
      || nickname !== scalarText(account.nickname)
      || avatar !== account.avatar
      || merged.online !== account.online;
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
    if (!realtimeMember || typeof realtimeMember.online !== 'boolean' || member.online === realtimeMember.online) {
      return member;
    }
    changed = true;
    return { ...member, online: realtimeMember.online };
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

export function resolveGroupAdministrator(room, accounts = []) {
  if (!room?.isGroup) return null;
  const members = Array.isArray(room.members) ? room.members : [];
  const tinodeOwner = members.find(member => String(member?.mode || '').includes('O')) || null;
  const adminId = String(
    room.adminId
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
  const administrator = resolveGroupAdministrator(room, accounts);
  if (identitiesOverlap(administrator, currentUser)) return true;
  const adminId = String(room.adminId || '').trim();
  if (adminId && identityValues(currentUser).includes(adminId)) return true;
  return !adminId && Boolean(room.admin) && room.admin === currentUser.name;
}

export function canApproveGroupMembers(room, accounts, currentUser) {
  if (canManageGroupMembers(room, accounts, currentUser)) return true;
  return room?.isGroup
    && ['admin', 'owner', 'superadmin'].includes(String(currentUser?.role || '').toLowerCase());
}

export function canRemoveGroupMember(room, accounts, currentUser, member) {
  if (!member?.id || !canManageGroupMembers(room, accounts, currentUser)) return false;
  const administrator = resolveGroupAdministrator(room, accounts);
  return !identitiesOverlap(member, currentUser) && !identitiesOverlap(member, administrator);
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
