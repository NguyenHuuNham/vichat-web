const RECEIPT_AVATAR_LIMIT = 5;

function receiptText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function receiptObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function receiptMedia(value) {
  const direct = receiptText(value);
  if (direct) return direct;
  const source = receiptObject(value);
  if (!source) return '';
  return receiptText(source.url)
    || receiptText(source.ref)
    || receiptText(source.src)
    || receiptText(source.href);
}

function receiptArray(value) {
  if (Array.isArray(value)) return value;
  const source = receiptObject(value);
  return source ? Object.values(source) : [];
}

export function normalizeReceiptUser(value) {
  const source = receiptObject(value) || {};
  const id = receiptText(
    source.id
      || source.uid
      || source.tinodeUid
      || source.tinode_uid
      || source.user,
  );
  if (!id) return null;
  return {
    id,
    uid: receiptText(source.uid),
    tinodeUid: receiptText(source.tinodeUid || source.tinode_uid),
    name: receiptText(source.name || source.fn || source.displayName) || id,
    avatar: receiptMedia(source.avatar || source.photo),
  };
}

function normalizeReceiptList(value) {
  const seen = new Set();
  return receiptArray(value)
    .map(normalizeReceiptUser)
    .filter(user => {
      if (!user || seen.has(user.id)) return false;
      seen.add(user.id);
      return true;
    });
}

export function normalizeReceiptUsers(value) {
  const source = receiptObject(value) || {};
  const read = normalizeReceiptList(source.read || source.readUsers || source.readBy);
  const readIds = new Set(read.map(user => user.id));
  const received = normalizeReceiptList(source.received || source.receivedUsers || source.recv || source.receivedBy)
    .filter(user => !readIds.has(user.id));
  return { read, received };
}

export function receiptUsersFromMembers(members = [], sequence = 0, viewerId = '') {
  const messageSequence = Number(sequence);
  if (!Number.isFinite(messageSequence) || messageSequence <= 0) return { read: [], received: [] };
  const currentViewerId = receiptText(viewerId);
  const read = [];
  const received = [];
  const seen = new Set();

  (Array.isArray(members) ? members : []).forEach(member => {
    const user = normalizeReceiptUser(member);
    if (!user || user.id === currentViewerId || seen.has(user.id)) return;
    seen.add(user.id);
    const readSequence = Number(member.readSeq ?? member.read);
    const receivedSequence = Number(member.receivedSeq ?? member.recv ?? member.received);
    if (Number.isFinite(readSequence) && readSequence >= messageSequence) {
      read.push(user);
    } else if (Number.isFinite(receivedSequence) && receivedSequence >= messageSequence) {
      received.push(user);
    }
  });

  return { read, received };
}

export function mergeReceiptUsers(current, { what = '', user = null, viewerId = '' } = {}) {
  const normalized = normalizeReceiptUsers(current);
  const nextUser = normalizeReceiptUser(user);
  if (!nextUser || nextUser.id === receiptText(viewerId)) return normalized;

  const removeUser = users => users.filter(item => item.id !== nextUser.id);
  if (what === 'read') {
    return {
      read: [...removeUser(normalized.read), nextUser],
      received: removeUser(normalized.received),
    };
  }
  if (what === 'recv') {
    if (normalized.read.some(item => item.id === nextUser.id)) return normalized;
    return { read: normalized.read, received: [...removeUser(normalized.received), nextUser] };
  }
  return normalized;
}

export function receiptAvatarPreview(receiptUsers, limit = RECEIPT_AVATAR_LIMIT) {
  const safeLimit = Math.max(0, Number(limit) || 0);
  const readUsers = normalizeReceiptUsers(receiptUsers).read;
  return {
    users: readUsers.slice(0, safeLimit),
    overflowCount: Math.max(0, readUsers.length - safeLimit),
    totalCount: readUsers.length,
  };
}

export { RECEIPT_AVATAR_LIMIT };
