export const INCOMING_CALL_NOTIFICATION_TYPE = 'incoming-call';
// Keep notification routing inside the same lifetime as the call setup timer.
export const INCOMING_CALL_NOTIFICATION_TTL_MS = 40_000;

export interface IncomingCallNotificationData {
  type: typeof INCOMING_CALL_NOTIFICATION_TYPE;
  topic: string;
  seq: number;
  from: string;
  audioOnly: boolean;
  issuedAt: number;
  peerName?: string;
  peerAvatar?: string;
}

export function incomingCallNotificationData(event: {
  topic: string;
  seq: number;
  from: string;
  audioOnly: boolean;
}, peer: { name?: string; avatar?: string } = {}, issuedAt = Date.now()): IncomingCallNotificationData {
  return {
    type: INCOMING_CALL_NOTIFICATION_TYPE,
    topic: String(event.topic || ''),
    seq: Number(event.seq) || 0,
    from: String(event.from || ''),
    audioOnly: Boolean(event.audioOnly),
    issuedAt: Number(issuedAt) || Date.now(),
    peerName: String(peer.name || ''),
    peerAvatar: String(peer.avatar || ''),
  };
}

export function incomingCallNotificationKey(value: { topic: string; seq: number }) {
  return `${String(value.topic || '')}:${Number(value.seq) || 0}`;
}

export function isIncomingCallNotificationFresh(
  value: Pick<IncomingCallNotificationData, 'issuedAt'>,
  now = Date.now(),
  ttlMs = INCOMING_CALL_NOTIFICATION_TTL_MS,
) {
  const issuedAt = Number(value?.issuedAt) || 0;
  return issuedAt > 0 && Number(now) >= issuedAt && Number(now) - issuedAt <= ttlMs;
}

export function parseIncomingCallNotification(value: unknown): IncomingCallNotificationData | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const topic = String(data.topic || '');
  const seq = Number(data.seq) || 0;
  const from = String(data.from || '');
  const issuedAt = Number(data.issuedAt) || 0;
  if (data.type !== INCOMING_CALL_NOTIFICATION_TYPE || !/^usr[a-z0-9_-]+$/i.test(topic) || !seq || !from || !issuedAt) {
    return null;
  }
  return {
    type: INCOMING_CALL_NOTIFICATION_TYPE,
    topic,
    seq,
    from,
    audioOnly: data.audioOnly === true || data.audioOnly === 'true',
    issuedAt,
    peerName: String(data.peerName || ''),
    peerAvatar: String(data.peerAvatar || ''),
  };
}
