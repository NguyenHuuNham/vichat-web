import {
  identityValues,
  identitiesOverlap,
} from '../../contacts/services/accountDirectory.js';
import { conversationDisplayName } from './chatRealtime.js';

function conversationId(room) {
  return String(room?.managementId || room?.id || '').trim();
}

function displayNameKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi')
    .trim();
}

function entityName(entity, fallback = '') {
  return String(
    entity?.name
      || entity?.defaultName
      || entity?.default_name
      || entity?.username
      || entity?.email
      || fallback,
  ).trim();
}

function identityKey(entity) {
  return identityValues(entity)
    .map(value => String(value).trim().toLowerCase())
    .find(Boolean) || '';
}

function identityMeta(account, fallback = '') {
  const username = String(account?.username || account?.user_name || '').trim().replace(/^@+/, '');
  if (username) return `@${username.split('@')[0]}`;
  const email = String(account?.email || '').trim();
  if (email) return email;
  return identityValues(account)[0] || fallback;
}

function accountForIdentity(accounts, entity) {
  const identities = new Set(identityValues(entity));
  if (identities.size === 0) return null;
  return (Array.isArray(accounts) ? accounts : []).find(account => (
    identityValues(account).some(value => identities.has(value))
  )) || null;
}

function directPeerForCategory(room, accounts, currentUser) {
  const candidates = [
    ...(Array.isArray(room?.members) ? room.members : []),
    ...(Array.isArray(room?.participantIds) ? room.participantIds.map(id => ({ id })) : []),
  ];
  const resolved = candidates
    .map(candidate => accountForIdentity(accounts, candidate) || candidate)
    .find(candidate => identityValues(candidate).length > 0 && !identitiesOverlap(candidate, currentUser));
  return resolved || null;
}

function categoryConversation(room, accounts, currentUser, groupFallback, directFallback) {
  const id = conversationId(room);
  if (!id) return null;
  if (room.isGroup) {
    return {
      id,
      conversationIds: [id],
      name: conversationDisplayName({ ...room, members: [] }, groupFallback),
      meta: '',
      isGroup: true,
    };
  }

  const peer = directPeerForCategory(room, accounts, currentUser);
  const name = entityName(peer, conversationDisplayName(room, directFallback));
  return {
    id,
    conversationIds: [id],
    name,
    meta: identityMeta(peer, id),
    isGroup: false,
    directIdentity: identityKey(peer),
  };
}

export function buildConversationCategoryConversations({
  conversations = [],
  accounts = [],
  currentUser = null,
  groupFallback = 'Group',
  directFallback = 'Direct conversation',
} = {}) {
  const grouped = new Map();
  (Array.isArray(conversations) ? conversations : []).forEach(room => {
    if (!room || room.isChatbot || room.id === 'empty') return;
    const item = categoryConversation(room, accounts, currentUser, groupFallback, directFallback);
    if (!item) return;
    const key = item.isGroup
      ? `group:${item.id}`
      : item.directIdentity
        ? `direct:${item.directIdentity}`
        : `room:${item.id}`;
    const previous = grouped.get(key);
    if (!previous) {
      grouped.set(key, item);
      return;
    }
    previous.conversationIds = [...new Set([...previous.conversationIds, ...item.conversationIds])];
  });

  const values = [...grouped.values()];
  const nameCounts = new Map();
  values.forEach(item => {
    const key = displayNameKey(item.name);
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  });

  return values
    .map(item => ({
      ...item,
      meta: !item.isGroup && (nameCounts.get(displayNameKey(item.name)) || 0) > 1
        ? item.meta
        : '',
    }))
    .sort((first, second) => {
      const byName = first.name.localeCompare(second.name, 'vi', { sensitivity: 'base' });
      if (byName !== 0) return byName;
      const byMeta = first.meta.localeCompare(second.meta, 'vi', { sensitivity: 'base' });
      if (byMeta !== 0) return byMeta;
      return first.id.localeCompare(second.id);
    });
}
