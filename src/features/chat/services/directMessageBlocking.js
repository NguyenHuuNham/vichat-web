export const DIRECT_MESSAGE_BLOCKED_CODE = 'DIRECT_MESSAGE_BLOCKED';
export const DIRECT_MESSAGE_BLOCKED_TEXT = 'Người dùng đã chặn tin nhắn.';

function strictFlag(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  }
  return value === true || value === 1;
}

export function normalizeDirectMessageBlockState(source = {}) {
  const blockedByViewer = strictFlag(source.blockedByViewer ?? source.blocked_by_viewer);
  const blockedByPeer = strictFlag(source.blockedByPeer ?? source.blocked_by_peer);
  return {
    blockedByViewer,
    blockedByPeer,
    directMessagingBlocked: blockedByViewer
      || blockedByPeer
      || strictFlag(source.directMessagingBlocked ?? source.direct_messaging_blocked),
  };
}

export function isDirectMessageBlockedError(error) {
  const errorCode = String(
    error?.errorCode
    || error?.error_code
    || error?.code
    || error?.params?.error_code
    || error?.codeName
    || '',
  ).trim();
  if (errorCode === DIRECT_MESSAGE_BLOCKED_CODE) return true;
  const message = String(error?.message || error?.text || error || '').trim();
  return /chặn\s+tin\s+nhắn/iu.test(message)
    || /blocked\s+(?:direct\s+)?messages?/iu.test(message);
}
