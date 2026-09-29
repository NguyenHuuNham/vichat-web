type IdentityRecord = Record<string, unknown>;

export interface NormalizedParticipant {
  accountId: string;
  tinodeUid: string;
  name: string;
  active: boolean;
  status: string;
}

function asRecord(value: unknown): IdentityRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as IdentityRecord : {};
}

function normalized(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

export function identityValues(value: unknown) {
  const source = asRecord(value);
  const raw = [
    source.id,
    source.userId,
    source.user_id,
    source.participantId,
    source.participant_id,
    source.uid,
    source.tinodeUid,
    source.tinode_uid,
    source.username,
    source.email,
  ];
  return [...new Set(raw.map(normalized).filter(Boolean))];
}

export function identitiesOverlap(first: unknown, second: unknown) {
  const secondIdentities = new Set(identityValues(second));
  return identityValues(first).some(identity => secondIdentities.has(identity));
}

export function matchesIdentity(value: unknown, identity: unknown) {
  const target = normalized(identity);
  return Boolean(target) && identityValues(value).includes(target);
}

export function isTinodeUid(value: unknown) {
  return /^usr[a-z0-9_-]+$/i.test(String(value || '').trim());
}

export function tinodeUidForMember(member: unknown) {
  const source = asRecord(member);
  const explicit = [source.tinodeUid, source.tinode_uid].map(value => String(value || '').trim()).find(Boolean);
  if (explicit) return explicit;
  const uid = String(source.uid || '').trim();
  if (isTinodeUid(uid)) return uid;
  const id = String(source.id || '').trim();
  return isTinodeUid(id) ? id : '';
}

/** Resolve the Account identifier required by Chatmgt participant endpoints. */
export function accountIdForMember(member: unknown, directory: unknown[] = []) {
  const directoryMatch = directory.find(user => identitiesOverlap(user, member));
  const directoryRecord = asRecord(directoryMatch);
  const source = asRecord(member);
  const explicit = [
    directoryRecord.id,
    directoryRecord.userId,
    directoryRecord.user_id,
    source.userId,
    source.user_id,
    source.accountId,
    source.account_id,
    source.participantId,
    source.participant_id,
  ].map(value => String(value || '').trim()).find(Boolean);
  if (explicit) return explicit;

  const memberId = String(source.id || '').trim();
  const tinodeIdentities = new Set([
    source.uid,
    source.tinodeUid,
    source.tinode_uid,
    source.username,
  ].map(value => String(value || '').trim().toLowerCase()).filter(Boolean));
  if (!memberId || isTinodeUid(memberId) || tinodeIdentities.has(memberId.toLowerCase())) return '';
  return memberId;
}

/** Keep Chatmgt permission IDs and Tinode realtime IDs explicit at the edge. */
export function normalizeParticipant(member: unknown, directory: unknown[] = []): NormalizedParticipant {
  const source = asRecord(member);
  const accountId = accountIdForMember(member, directory);
  return {
    accountId,
    tinodeUid: tinodeUidForMember(member),
    name: String(source.name || source.displayName || source.display_name || source.username || accountId || 'Thành viên').trim(),
    active: source.active !== false && source.is_active !== false,
    status: String(source.status || source.approvalStatus || source.approval_status || '').trim().toUpperCase(),
  };
}

export function canonicalAccountIds(values: unknown[], directory: unknown[] = []) {
  const result: string[] = [];
  const seen = new Set<string>();
  values.forEach(value => {
    const participant = normalizeParticipant(value, directory);
    const accountId = participant.accountId || String(value || '').trim();
    if (!accountId || isTinodeUid(accountId) || seen.has(accountId)) return;
    seen.add(accountId);
    result.push(accountId);
  });
  return result;
}
