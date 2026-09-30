function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function isTruthy(value: unknown) {
  return ['true', '1', 'yes'].includes(stringValue(value));
}

function payloadRecord(value: unknown) {
  const record = asRecord(value);
  const nested = asRecord(record.data);
  return { ...record, ...nested };
}

export function isIncomingCallNotificationPayload(value: unknown) {
  const data = payloadRecord(value);
  const type = [
    data.type,
    data.notification_type,
    data.notificationType,
    data.kind,
    data.event,
    data.category,
    data.action,
  ].map(stringValue).join(' ');
  return type.includes('call')
    || type.includes('webrtc')
    || data.webrtc !== undefined
    || data.call !== undefined
    || data['incoming-call'] !== undefined;
}

/**
 * Tinode sender/device-sync pushes are not user-visible messages. Calls keep
 * their alert even if an older provider accidentally marks them as silent.
 */
export function shouldSuppressRemoteMessageNotification(value: unknown) {
  const data = payloadRecord(value);
  if (isIncomingCallNotificationPayload(data)) return false;
  return isTruthy(data.silent)
    || isTruthy(data['data.silent'])
    || isTruthy(data['gcm.n.silent'])
    || isTruthy(data['gcm.notification.silent']);
}
