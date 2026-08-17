const STORAGE_KEY = 'vichat.demo.groups.v1';
const BACKUP_KEY = `${STORAGE_KEY}.recovery-backup`;
const LEGACY_DEMO_MESSAGE_IDS = new Set([
  'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 't1', 't2', 't3', 'h1', 'h2', 'h3',
  'k1', 'k2', 'i1', 'l1', 'l2', 'g1', 'g2', 'p1', 'p2', 'p3',
]);

function isRealMessage(message) {
  const id = String(message?.id || '');
  return !id.startsWith('incoming-') && !LEGACY_DEMO_MESSAGE_IDS.has(id);
}

function randomMemberId(memberIds) {
  const candidates = uniqueIds(memberIds);
  return candidates[Math.floor(Math.random() * candidates.length)] || '';
}

function reconcileGroupMembership(group) {
  const messages = (group.messages || []).filter(isRealMessage);
  let memberIds = uniqueIds([
    ...(group.memberIds || []),
    ...messages.map(message => message.senderId),
  ]);
  let ownerLeft = false;
  for (const message of messages) {
    if (message.type !== 'system') continue;
    if (message.action === 'member_added') {
      memberIds = uniqueIds([...memberIds, ...(message.targetIds || [])]);
    }
    if (message.action === 'member_left' && message.senderId) {
      memberIds = memberIds.filter(id => id !== message.senderId);
      if (message.senderId === group.ownerId) ownerLeft = true;
    }
    if (message.action === 'member_removed') {
      memberIds = memberIds.filter(id => !(message.targetIds || []).includes(id));
    }
  }
  const ownerId = ownerLeft || !memberIds.includes(group.ownerId)
    ? randomMemberId(memberIds.filter(id => id !== group.ownerId)) || memberIds[0]
    : group.ownerId;
  return { ...group, memberIds, ownerId, messages };
}

function readGroups() {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    const records = Array.isArray(value) ? value : Object.values(value || {});
    return records.filter(group => group && typeof group === 'object').map(reconcileGroupMembership);
  } catch {
    return [];
  }
}

function persistRecoveredGroups(groups) {
  if (typeof window === 'undefined') return;
  const original = window.localStorage.getItem(STORAGE_KEY);
  if (original && !window.localStorage.getItem(BACKUP_KEY)) {
    window.localStorage.setItem(BACKUP_KEY, original);
  }
  writeGroups(groups);
}

function writeGroups(groups) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  }
  return groups;
}

function uniqueIds(ids) {
  return [...new Set(ids.filter(Boolean))];
}

export function listDemoGroupsForUser(userId) {
  const groups = readGroups();
  persistRecoveredGroups(groups);
  return groups.filter(group => group.memberIds?.includes(userId));
}

export function saveDemoGroup({ id, name, description = '', ownerId, memberIds = [], messages = [] }) {
  const groups = readGroups();
  const now = new Date().toISOString();
  const groupId = id || `demo-grp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const previous = groups.find(group => group.id === groupId);
  const effectiveOwnerId = previous?.ownerId || ownerId;
  const record = reconcileGroupMembership({
    ...previous,
    id: groupId,
    name,
    description,
    ownerId: effectiveOwnerId,
    memberIds: previous
      ? uniqueIds([...(previous.memberIds || []), ...memberIds])
      : uniqueIds([effectiveOwnerId, ...memberIds]),
    messages: [
      ...(previous?.messages || []),
      ...messages.filter(message => isRealMessage(message) && !(previous?.messages || []).some(existing => existing.id === message.id)),
    ],
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  });
  writeGroups([...groups.filter(group => group.id !== groupId), record]);
  return record;
}

export function appendDemoGroupMessage(groupId, message) {
  const groups = readGroups();
  const group = groups.find(item => item.id === groupId);
  if (!group) throw new Error('Nhóm demo không còn tồn tại.');
  const updated = {
    ...group,
    messages: [...(group.messages || []), message],
    readBy: message.senderId ? { ...(group.readBy || {}), [message.senderId]: message.createdAt || new Date().toISOString() } : group.readBy,
    updatedAt: message.createdAt || new Date().toISOString(),
  };
  writeGroups([...groups.filter(item => item.id !== groupId), updated]);
  return updated;
}

export function updateDemoGroupMessage(groupId, messageId, patch) {
  const groups = readGroups();
  const group = groups.find(item => item.id === groupId);
  if (!group) return;
  const updated = {
    ...group,
    messages: (group.messages || []).map(message => message.id === messageId
      ? { ...message, ...(typeof patch === 'function' ? patch(message) : patch) }
      : message),
    updatedAt: new Date().toISOString(),
  };
  writeGroups([...groups.filter(item => item.id !== groupId), updated]);
  return updated;
}

export function markDemoGroupRead(groupId, userId) {
  const groups = readGroups();
  const group = groups.find(item => item.id === groupId);
  if (!group) return;
  const updated = { ...group, readBy: { ...(group.readBy || {}), [userId]: new Date().toISOString() } };
  writeGroups([...groups.filter(item => item.id !== groupId), updated]);
}

export function addDemoGroupMembers(groupId, memberIds) {
  const groups = readGroups();
  const group = groups.find(item => item.id === groupId);
  if (!group) throw new Error('Nhóm demo không còn tồn tại.');
  const updated = {
    ...group,
    memberIds: uniqueIds([...(group.memberIds || []), ...memberIds]),
    updatedAt: new Date().toISOString(),
  };
  writeGroups([...groups.filter(item => item.id !== groupId), updated]);
  return updated;
}

export function removeDemoGroupMember(groupId, memberId, ownerId) {
  const groups = readGroups();
  const group = groups.find(item => item.id === groupId);
  if (!group) throw new Error('Nhóm demo không còn tồn tại.');
  if (group.ownerId !== ownerId) throw new Error('Chỉ quản trị viên của nhóm mới có thể xóa thành viên.');
  if (memberId === ownerId) throw new Error('Quản trị viên không thể tự xóa mình.');
  const updated = {
    ...group,
    memberIds: (group.memberIds || []).filter(id => id !== memberId),
    updatedAt: new Date().toISOString(),
  };
  writeGroups([...groups.filter(item => item.id !== groupId), updated]);
  return updated;
}

export function leaveDemoGroup(groupId, userId) {
  const groups = readGroups();
  const group = groups.find(item => item.id === groupId);
  if (!group) return;
  const memberIds = (group.memberIds || []).filter(id => id !== userId);
  const ownerId = group.ownerId === userId ? randomMemberId(memberIds) : group.ownerId;
  writeGroups(memberIds.length > 0
    ? [...groups.filter(item => item.id !== groupId), { ...group, memberIds, ownerId, updatedAt: new Date().toISOString() }]
    : groups.filter(item => item.id !== groupId));
}

export function deleteDemoGroupForUser(groupId, userId, userName = 'Một thành viên') {
  const groups = readGroups();
  const group = groups.find(item => item.id === groupId);
  if (!group) return;
  const deletedAt = new Date().toISOString();
  const memberIds = (group.memberIds || []).filter(id => id !== userId);
  const ownerId = group.ownerId === userId ? randomMemberId(memberIds) : group.ownerId;
  const leaveMessage = {
    id: `system-delete-${Date.now()}`,
    type: 'system',
    action: 'member_left',
    senderId: userId,
    senderName: userName,
    text: `${userName} đã rời khỏi nhóm`,
    time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    createdAt: deletedAt,
  };
  writeGroups(memberIds.length > 0
    ? [...groups.filter(item => item.id !== groupId), {
      ...group,
      memberIds,
      ownerId,
      messages: [...(group.messages || []), leaveMessage],
      deletedAtByUser: { ...(group.deletedAtByUser || {}), [userId]: deletedAt },
      updatedAt: deletedAt,
    }]
    : groups.filter(item => item.id !== groupId));
}
