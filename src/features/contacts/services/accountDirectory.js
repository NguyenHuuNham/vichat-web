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
  const members = (room?.members || []).map(member => (
    findAccount(accounts, member?.id || member?.uid || member?.tinodeUid || member?.tinode_uid || member?.name)
    || member
  ));
  const participants = (room?.participantIds || [])
    .map(identity => findAccount(accounts, identity))
    .filter(Boolean);
  return [...members, ...participants]
    .find(account => account && !identitiesOverlap(account, currentUser)) || null;
}

export function findAccount(accounts, identity) {
  if (!identity || !Array.isArray(accounts)) return null;
  const normalized = String(identity).trim().toLowerCase();
  return accounts.find(item =>
    [item.id, item.uid, item.tinodeUid, item.tinode_uid]
      .filter(Boolean)
      .some(value => String(value).trim().toLowerCase() === normalized) ||
    item.username?.toLowerCase() === normalized ||
    item.email?.toLowerCase() === normalized ||
    item.name?.toLowerCase() === normalized
  ) || null;
}
