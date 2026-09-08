import {
  companyDirectoryContacts,
  findDirectPeer,
  identityValues,
  identitiesOverlap,
} from '../../contacts/services/accountDirectory.js';

function recipientIdentity(entity) {
  return identityValues(entity)[0] || '';
}

function recipientName(entity) {
  return String(
    entity?.name
      || entity?.defaultName
      || entity?.default_name
      || entity?.username
      || entity?.email
      || 'Nguoi dung',
  ).trim();
}

function recipientNameKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi')
    .trim();
}

function recipientMeta(account) {
  const username = String(account?.username || '').trim().replace(/^@+/, '');
  if (username) return `@${username.split('@')[0]}`;
  return String(account?.email || account?.id || account?.uid || '').trim();
}

function recipientKey(room, peer = null) {
  if (room?.isGroup) return `group:${String(room.managementId || room.id || '').trim()}`;
  const peerId = recipientIdentity(peer);
  if (peerId) return `direct:${peerId}`;
  return `room:${String(room?.managementId || room?.id || '').trim()}`;
}

function isUsableRecipientKey(key) {
  return key && !key.endsWith(':');
}

function isChatbotAccount(account, chatbotId) {
  return account?.isChatbot === true
    || String(account?.type || account?.kind || '').toLowerCase() === 'bot'
    || (chatbotId && identitiesOverlap(account, { id: chatbotId }));
}

function preferRecipient(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  if (existing.shareRecipientType === 'conversation' && incoming.shareRecipientType !== 'conversation') return existing;
  if (incoming.shareRecipientType === 'conversation' && existing.shareRecipientType !== 'conversation') return incoming;
  const existingHasManagementId = Boolean(String(existing.managementId || '').trim());
  const incomingHasManagementId = Boolean(String(incoming.managementId || '').trim());
  if (existingHasManagementId !== incomingHasManagementId) return incomingHasManagementId ? incoming : existing;
  return String(incoming.updatedAt || '').localeCompare(String(existing.updatedAt || '')) > 0
    ? incoming
    : existing;
}

function mergeRecipient(existing, incoming) {
  const preferred = preferRecipient(existing, incoming);
  if (!existing) return incoming;
  if (!incoming) return existing;
  const other = preferred === existing ? incoming : existing;
  return {
    ...other,
    ...preferred,
    shareRecipientKey: preferred.shareRecipientKey || other.shareRecipientKey,
    shareContact: preferred.shareContact || other.shareContact,
    ...(preferred.shareContact || other.shareContact
      ? { members: preferred.members?.length ? preferred.members : other.members }
      : {}),
  };
}

function directoryRecipient(account, currentUser, accountSession = 0) {
  const accountId = recipientIdentity(account);
  return {
    id: `share-contact:${accountId}`,
    managementId: '',
    tinodeTopic: '',
    isGroup: false,
    isChatbot: false,
    name: recipientName(account),
    avatarUrl: account?.avatar || '',
    avatarClass: '',
    members: [account],
    participantIds: [
      recipientIdentity(currentUser),
      accountId,
    ].filter(Boolean),
    messages: [],
    friendEvents: [],
    lastMsg: '',
    time: '',
    updatedAt: '',
    badge: 0,
    accountSession,
    directContactId: accountId,
    pendingDirect: true,
    shareContact: account,
    shareRecipientType: 'directory',
    shareRecipientKey: `direct:${accountId}`,
  };
}

export function buildMessageShareRecipients({
  conversations = [],
  accounts = [],
  currentUser = null,
  activeConversation = null,
  accountSession = 0,
  chatbotId = '',
} = {}) {
  const recipientMap = new Map();
  const activePeer = activeConversation?.isGroup
    ? null
    : findDirectPeer(activeConversation, accounts, currentUser);
  const activeContactId = recipientIdentity(activePeer)
    || String(activeConversation?.directContactId || '').trim();
  const activeKey = activeConversation
    ? recipientKey(activeConversation, activePeer)
    : '';

  const add = (room, peer = null, type = 'conversation') => {
    const key = recipientKey(room, peer);
    if (!isUsableRecipientKey(key) || key === activeKey || (peer && recipientIdentity(peer) === activeContactId)) return;
    const recipient = {
      ...room,
      name: peer && !room.isGroup ? recipientName(peer) : recipientName(room),
      avatarUrl: peer && !room.isGroup ? (peer.avatar || room.avatarUrl || '') : room.avatarUrl,
      shareContact: peer || room.shareContact || null,
      shareRecipientType: type,
      shareRecipientKey: key,
    };
    recipientMap.set(key, mergeRecipient(recipientMap.get(key), recipient));
  };

  (Array.isArray(conversations) ? conversations : []).forEach(room => {
    if (!room || room.id === activeConversation?.id || room.id === chatbotId || room.isChatbot) return;
    const peer = room.isGroup ? null : findDirectPeer(room, accounts, currentUser);
    add(room, peer);
  });

  companyDirectoryContacts(accounts, currentUser).forEach(account => {
    const accountId = recipientIdentity(account);
    if (!accountId || isChatbotAccount(account, chatbotId)) return;
    add(directoryRecipient(account, currentUser, accountSession), account, 'directory');
  });

  const recipients = [...recipientMap.values()];
  const nameCounts = new Map();
  recipients.forEach(recipient => {
    const key = recipientNameKey(recipient.name);
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  });

  return recipients
    .map(recipient => {
      const nameKey = recipientNameKey(recipient.name);
      const duplicateName = (nameCounts.get(nameKey) || 0) > 1;
      const shareRecipientMeta = duplicateName && !recipient.isGroup
        ? recipientMeta(recipient.shareContact)
        : '';
      return { ...recipient, shareRecipientMeta };
    })
    .sort((first, second) => {
      const byName = recipientName(first).localeCompare(recipientName(second), 'vi', { sensitivity: 'base' });
      if (byName !== 0) return byName;
      return String(first.shareRecipientKey || '').localeCompare(String(second.shareRecipientKey || ''));
    });
}

export function messageShareRecipientMatchesContact(room, contact) {
  if (!room || !contact || room.isGroup) return false;
  if (room.shareContact && identitiesOverlap(room.shareContact, contact)) return true;
  if (room.members?.some(member => identitiesOverlap(member, contact))) return true;
  return room.participantIds?.some(identity => identitiesOverlap({ id: identity }, contact)) || false;
}
