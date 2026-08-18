// The account directory is private and is loaded through the management API.
// Keep identity matching here so existing chat rendering code remains unchanged.
export async function loadAccountDirectory() {
  throw new Error('Account directory is available only through the authenticated management service.');
}

export async function authenticateDemoAccount() {
  throw new Error('Public account login is disabled.');
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

function tenantId(entity) {
  return String(entity?.tenantId || entity?.tenant_id || entity?.tenant?.id || '').trim();
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
  const currentTenantId = tenantId(currentUser);
  (Array.isArray(accounts) ? accounts : []).forEach(account => {
    if (!account || account.active === false || identitiesOverlap(account, currentUser)) return;
    const accountTenantId = tenantId(account);
    if (currentTenantId && accountTenantId !== currentTenantId) return;
    if (contacts.some(contact => identitiesOverlap(contact, account))) return;
    contacts.push(account);
  });
  return contacts.sort((first, second) => (
    String(first.name || first.username || first.email || '')
      .localeCompare(String(second.name || second.username || second.email || ''), 'vi', { sensitivity: 'base' })
  ));
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
  if (!entity || !profile || !identitiesOverlap(entity, profile)) return entity;
  const nextName = profile.name || entity.name;
  const nextAvatar = profile.avatar || entity.avatar || '';
  if (nextName === entity.name && nextAvatar === entity.avatar) return entity;
  return { ...entity, name: nextName, avatar: nextAvatar };
}

export function updateAccountProfiles(accounts, profile) {
  let changed = false;
  const next = (accounts || []).map(account => {
    const updated = mergeRealtimeAccountProfile(account, profile);
    if (updated !== account) changed = true;
    return updated;
  });
  return changed ? next : accounts;
}

export function mergeDirectoryAccountSnapshots(previousAccounts = [], incomingAccounts = []) {
  const previous = Array.isArray(previousAccounts) ? previousAccounts : [];
  const incoming = Array.isArray(incomingAccounts) ? incomingAccounts : [];
  let changed = false;
  const next = incoming.map(account => {
    const previousAccount = findAccount(previous, account?.id || account?.uid || account?.tinodeUid || account?.tinode_uid);
    if (!previousAccount) return account;
    const avatar = account.avatar || previousAccount.avatar || '';
    const name = account.name || previousAccount.name || '';
    const merged = {
      ...account,
      name,
      // Directory polling may briefly return an old/empty avatar after upload.
      avatar,
    };
    const accountChanged = name !== account.name || avatar !== account.avatar;
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
  )) || null;
}
