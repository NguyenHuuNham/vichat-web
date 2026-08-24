const DEFAULT_MAX_QUERY_LENGTH = 6000;
const DEFAULT_MAX_ACCOUNTS_PER_QUERY = 80;

function text(value) {
  return String(value || '').trim().toLowerCase();
}

function uidText(value) {
  return String(value || '').trim();
}

function accountTinodeUid(account) {
  return uidText(account?.tinodeUid || account?.tinode_uid);
}

function rawTag(value) {
  const normalized = text(value);
  if (!normalized || normalized.length > 96 || /[\s,]/.test(normalized)) return '';
  return normalized;
}

function basicTag(value) {
  const normalized = text(value);
  if (!/^[a-z0-9](?:[a-z0-9._]{0,30}[a-z0-9])?$/i.test(normalized)) return '';
  return `basic:${normalized}`;
}

function emailTag(value) {
  const normalized = text(value);
  return /^[^\s@]+@[^\s@]+$/.test(normalized) ? `email:${normalized}` : '';
}

export function directoryPresenceTerms(account) {
  return [...new Set([
    basicTag(account?.tinodeUsername),
    rawTag(account?.tinodeUsername),
    basicTag(account?.tinode_username),
    rawTag(account?.tinode_username),
    basicTag(account?.username),
    rawTag(account?.username),
    emailTag(account?.email),
  ].filter(Boolean))];
}

export function buildDirectoryPresenceBatches(accounts = [], {
  maxQueryLength = DEFAULT_MAX_QUERY_LENGTH,
  maxAccountsPerQuery = DEFAULT_MAX_ACCOUNTS_PER_QUERY,
} = {}) {
  const descriptors = [];
  const seenUids = new Set();
  (Array.isArray(accounts) ? accounts : []).forEach(account => {
    if (!account || account.active === false) return;
    const uid = accountTinodeUid(account);
    if (!uid || seenUids.has(uid)) return;
    const terms = directoryPresenceTerms(account);
    if (terms.length === 0) return;
    seenUids.add(uid);
    descriptors.push({ uid, terms });
  });

  const batches = [];
  let terms = [];
  let uids = [];
  const flush = () => {
    if (terms.length > 0) batches.push({ query: terms.join(','), uids });
    terms = [];
    uids = [];
  };

  descriptors.forEach(descriptor => {
    const nextTerms = [...terms, ...descriptor.terms];
    const exceedsLength = terms.length > 0 && nextTerms.join(',').length > maxQueryLength;
    const exceedsAccounts = uids.length >= maxAccountsPerQuery;
    if (exceedsLength || exceedsAccounts) flush();
    terms.push(...descriptor.terms);
    uids.push(descriptor.uid);
  });
  flush();
  return batches;
}

export function presenceSnapshotFromDiscovery(accounts = [], contacts = [], offlineUids = []) {
  const expectedUids = new Set(
    (Array.isArray(accounts) ? accounts : [])
      .filter(account => account?.active !== false)
      .map(accountTinodeUid)
      .filter(Boolean),
  );
  const snapshot = {};
  (Array.isArray(contacts) ? contacts : []).forEach(contact => {
    const uid = uidText(contact?.user || contact?.topic);
    if (!uid || !expectedUids.has(uid)) return;
    snapshot[uid] = contact.online === true;
  });
  (Array.isArray(offlineUids) ? offlineUids : []).forEach(uid => {
    const normalizedUid = uidText(uid);
    if (normalizedUid && expectedUids.has(normalizedUid) && !Object.prototype.hasOwnProperty.call(snapshot, normalizedUid)) {
      snapshot[normalizedUid] = false;
    }
  });
  return snapshot;
}
