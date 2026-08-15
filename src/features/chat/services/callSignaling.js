export const CALL_HEAD_STARTED = 'started';

export const CALL_SIGNAL_EVENTS = Object.freeze({
  RINGING: 'ringing',
  ACCEPT: 'accept',
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice-candidate',
  HANG_UP: 'hang-up',
});

/**
 * Tinode transports call payloads as JSON values, while older relays may
 * deliver the same value as a JSON-encoded string. Decode both forms before
 * handing the value to the browser WebRTC constructors.
 */
export function normalizeCallPayload(payload) {
  let value = payload;
  for (let attempt = 0; attempt < 2 && typeof value === 'string'; attempt += 1) {
    const text = value.trim();
    if (!text) return value;
    try {
      value = JSON.parse(text);
    } catch {
      break;
    }
  }
  if (value && typeof value === 'object' && value.payload !== undefined
      && value.type === undefined && value.sdp === undefined && value.candidate === undefined) {
    return normalizeCallPayload(value.payload);
  }
  return value;
}

export function normalizeCallDescription(payload, fallbackType = '') {
  const value = normalizeCallPayload(payload);
  const description = value?.description && typeof value.description === 'object'
    ? value.description
    : value;
  if (typeof description === 'string') {
    return fallbackType && description ? { type: fallbackType, sdp: description } : null;
  }
  if (!description || typeof description !== 'object') return null;
  const type = String(description.type || fallbackType || '').trim().toLowerCase();
  const sdp = typeof description.sdp === 'string' ? description.sdp : '';
  return type && sdp ? { type, sdp } : null;
}

export function normalizeCallCandidate(payload) {
  const value = normalizeCallPayload(payload);
  if (!value || typeof value !== 'object') return null;
  if (value.candidate && typeof value.candidate === 'object') return value.candidate;
  return value;
}

export function isAnsweredElsewhereSignal(event, callDirection, currentUserId) {
  return callDirection === 'incoming'
    && Boolean(event?.viaMe)
    && event?.from === currentUserId
    && event?.event === CALL_SIGNAL_EVENTS.ACCEPT;
}

export function resolveCallsEnabled(value) {
  if (value === true) return true;
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function callEntity(content) {
  return content?.ent?.find?.(entity => entity?.tp === 'VC')?.data || null;
}

export function normalizeIceServers(value) {
  if (!Array.isArray(value)) return [];
  return value.map(server => {
    if (!server || typeof server !== 'object') return false;
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    const validUrls = urls
      .filter(url => typeof url === 'string')
      .map(url => url.trim())
      .filter(url => /^(?:stun|turn|turns):[^\s]+$/i.test(url));
    if (validUrls.length === 0) return null;
    return {
      ...server,
      urls: Array.isArray(server.urls) ? validUrls : validUrls[0],
    };
  }).filter(Boolean);
}

export function browserCallSupported(runtime = globalThis) {
  return Boolean(
    runtime?.navigator?.mediaDevices?.getUserMedia
    && runtime?.RTCPeerConnection
    && runtime?.RTCSessionDescription
    && runtime?.RTCIceCandidate,
  );
}

export function callCapability({
  authenticated = false,
  topicName = '',
  isGroup = false,
  isChatbot = false,
  iceServers = [],
  browserSupported = browserCallSupported(),
} = {}) {
  if (isChatbot) return { available: false, reason: 'Không thể gọi trợ lý chatbot.' };
  if (isGroup) return { available: false, reason: 'Tinode 0.25.3 chỉ hỗ trợ cuộc gọi 1-1.' };
  if (!authenticated) return { available: false, reason: 'Kết nối Tinode realtime chưa sẵn sàng.' };
  if (!/^usr[a-z0-9_-]+$/i.test(String(topicName || ''))) {
    return { available: false, reason: 'Cuộc trò chuyện chưa có topic Tinode 1-1 hợp lệ.' };
  }
  if (!browserSupported) return { available: false, reason: 'Trình duyệt này không hỗ trợ WebRTC.' };
  if (normalizeIceServers(iceServers).length === 0) {
    return { available: false, reason: 'Máy chủ chưa cấu hình ICE/TURN cho cuộc gọi.' };
  }
  return { available: true, reason: '' };
}

export function extractCallInvite(data, currentUserId, latestMessage = data) {
  const message = latestMessage || data;
  if (!data?.seq || !data?.topic || !data?.from || data.from === currentUserId) return null;
  if (data.head?.webrtc !== CALL_HEAD_STARTED || message?.head?.webrtc !== CALL_HEAD_STARTED) return null;
  if (!/^usr[a-z0-9_-]+$/i.test(String(data.topic))) return null;
  return {
    topic: String(data.topic),
    seq: Number(data.seq),
    from: String(data.from),
    audioOnly: Boolean(message.head?.aonly),
  };
}

export function parseCallMessage(content, head = {}, incoming = false) {
  const entity = callEntity(content);
  if (!entity && !head?.webrtc) return null;
  const duration = Number(entity?.duration ?? head?.['webrtc-duration'] ?? 0);
  return {
    audioOnly: Boolean(entity?.aonly ?? head?.aonly),
    state: String(entity?.state || head?.webrtc || CALL_HEAD_STARTED),
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    incoming: Boolean(entity?.incoming ?? incoming),
  };
}

export function formatCallDuration(durationMs = 0) {
  const seconds = Math.max(0, Math.floor(Number(durationMs) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function callHistoryLabel(call, outgoing = false) {
  if (!call) return '';
  const direction = outgoing ? 'Cuộc gọi đi' : 'Cuộc gọi đến';
  if (call.state === 'busy') return `${direction} - Máy bận`;
  if (call.state === 'declined') return `${direction} - Đã từ chối`;
  if (call.state === 'missed') return outgoing ? 'Cuộc gọi đã hủy' : 'Cuộc gọi nhỡ';
  if (call.state === 'disconnected') return `${direction} - Mất kết nối`;
  if (call.duration > 0) return `${direction} - ${formatCallDuration(call.duration)}`;
  if (call.state === 'accepted') return `${direction} - Đang diễn ra`;
  return direction;
}
