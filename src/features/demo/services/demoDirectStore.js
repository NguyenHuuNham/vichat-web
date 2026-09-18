const STORAGE_KEY = 'vichat.demo.directs.v1';
const BACKUP_KEY = `${STORAGE_KEY}.recovery-backup`;
const LEGACY_DEMO_MESSAGE_IDS = new Set([
  'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 't1', 't2', 't3', 'h1', 'h2', 'h3',
  'k1', 'k2', 'i1', 'l1', 'l2', 'g1', 'g2', 'p1', 'p2', 'p3',
]);

function isRealMessage(message) {
  const id = String(message?.id || '');
  return !id.startsWith('incoming-') && !LEGACY_DEMO_MESSAGE_IDS.has(id);
}

function reconcileDirect(direct) {
  const messages = (direct.messages || []).filter(isRealMessage);
  const idsFromKey = String(direct.id || '').startsWith('demo-dm-')
    ? String(direct.id).slice('demo-dm-'.length).split('--')
    : [];
  const participantIds = [...new Set([
    ...(direct.participantIds || []),
    ...idsFromKey,
    ...messages.map(message => message.senderId),
  ].filter(Boolean))].slice(0, 2);
  return { ...direct, participantIds, messages };
}

function readDirects() {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    const records = Array.isArray(value) ? value : Object.values(value || {});
    return records.filter(direct => direct && typeof direct === 'object').map(reconcileDirect);
  } catch {
    return [];
  }
}

function persistRecoveredDirects(directs) {
  if (typeof window === 'undefined') return;
  const original = window.localStorage.getItem(STORAGE_KEY);
  if (original && !window.localStorage.getItem(BACKUP_KEY)) {
    window.localStorage.setItem(BACKUP_KEY, original);
  }
  writeDirects(directs);
}

function writeDirects(directs) {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(directs));
  return directs;
}

export function directConversationId(firstUserId, secondUserId) {
  return `demo-dm-${[firstUserId, secondUserId].filter(Boolean).sort().join('--')}`;
}

export function listDemoDirectsForUser(userId) {
  const directs = readDirects();
  persistRecoveredDirects(directs);
  return directs
    .filter(item => item.participantIds?.includes(userId))
    .filter(item => {
      const deletedAt = Date.parse(item.deletedAtByUser?.[userId] || '') || 0;
      return !deletedAt || (Date.parse(item.updatedAt || '') || 0) > deletedAt;
    });
}

export function saveDemoDirect({ id, participantIds, messages = [] }) {
  const directs = readDirects();
  const directId = id || directConversationId(...participantIds);
  const previous = directs.find(item => item.id === directId);
  const record = {
    ...previous,
    id: directId,
    participantIds: [...new Set([...(previous?.participantIds || []), ...participantIds].filter(Boolean))],
    messages: [
      ...(previous?.messages || []),
      ...messages.filter(message => isRealMessage(message) && !(previous?.messages || []).some(existing => existing.id === message.id)),
    ],
    updatedAt: messages[messages.length - 1]?.createdAt || previous?.updatedAt || new Date().toISOString(),
  };
  writeDirects([...directs.filter(item => item.id !== directId), record]);
  return record;
}

export function updateDemoDirectConversationNickname(directId, targetId, nickname = '') {
  const directs = readDirects();
  const direct = directs.find(item => item.id === directId);
  if (!direct) throw new Error('Cuộc trò chuyện không còn tồn tại.');
  const nicknames = Object.fromEntries(
    Object.entries(direct.conversationNicknames || {})
      .filter(([key, value]) => typeof value === 'string' && key && value.trim()),
  );
  const value = String(nickname || '').trim().slice(0, 80);
  if (value) nicknames[String(targetId)] = value;
  else delete nicknames[String(targetId)];
  const updated = {
    ...direct,
    conversationNicknames: nicknames,
    updatedAt: new Date().toISOString(),
  };
  writeDirects([...directs.filter(item => item.id !== directId), updated]);
  return updated;
}

export function appendDemoDirectMessage(id, message) {
  const directs = readDirects();
  const direct = directs.find(item => item.id === id);
  if (!direct) throw new Error('Cuộc trò chuyện không còn tồn tại.');
  const now = message.createdAt || new Date().toISOString();
  const updated = {
    ...direct,
    messages: [...(direct.messages || []), message],
    readBy: message.senderId ? { ...(direct.readBy || {}), [message.senderId]: now } : direct.readBy,
    updatedAt: now,
  };
  writeDirects([...directs.filter(item => item.id !== id), updated]);
  return updated;
}

export function updateDemoDirectMessage(id, messageId, patch) {
  const directs = readDirects();
  const direct = directs.find(item => item.id === id);
  if (!direct) return;
  const updated = {
    ...direct,
    messages: (direct.messages || []).map(message => message.id === messageId
      ? { ...message, ...(typeof patch === 'function' ? patch(message) : patch) }
      : message),
    updatedAt: new Date().toISOString(),
  };
  writeDirects([...directs.filter(item => item.id !== id), updated]);
  return updated;
}

export function markDemoDirectRead(id, userId) {
  const directs = readDirects();
  const direct = directs.find(item => item.id === id);
  if (!direct) return;
  const updated = { ...direct, readBy: { ...(direct.readBy || {}), [userId]: new Date().toISOString() } };
  writeDirects([...directs.filter(item => item.id !== id), updated]);
}

export function deleteDemoDirectForUser(id, userId) {
  const directs = readDirects();
  const direct = directs.find(item => item.id === id);
  if (!direct) return;
  const deletedAt = new Date().toISOString();
  const updated = {
    ...direct,
    deletedAtByUser: { ...(direct.deletedAtByUser || {}), [userId]: deletedAt },
  };
  writeDirects([...directs.filter(item => item.id !== id), updated]);
}
