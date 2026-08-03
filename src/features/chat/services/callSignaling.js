export const CALL_HEAD_STARTED = 'started';

export const CALL_SIGNAL_EVENTS = Object.freeze({
  RINGING: 'ringing',
  ACCEPT: 'accept',
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice-candidate',
  HANG_UP: 'hang-up',
});

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
  if (isChatbot) return { available: false, reason: 'Khong the goi tro ly chatbot.' };
  if (isGroup) return { available: false, reason: 'Tinode 0.25.3 chi ho tro cuoc goi 1-1.' };
  if (!authenticated) return { available: false, reason: 'Ket noi Tinode realtime chua san sang.' };
  if (!/^usr[a-z0-9_-]+$/i.test(String(topicName || ''))) {
    return { available: false, reason: 'Cuoc tro chuyen chua co topic Tinode 1-1 hop le.' };
  }
  if (!browserSupported) return { available: false, reason: 'Trinh duyet nay khong ho tro WebRTC.' };
  if (normalizeIceServers(iceServers).length === 0) {
    return { available: false, reason: 'May chu chua cau hinh ICE/TURN cho cuoc goi.' };
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
  const direction = outgoing ? 'Cuoc goi di' : 'Cuoc goi den';
  if (call.state === 'busy') return `${direction} - May ban`;
  if (call.state === 'declined') return `${direction} - Da tu choi`;
  if (call.state === 'missed') return outgoing ? 'Cuoc goi da huy' : 'Cuoc goi nho';
  if (call.state === 'disconnected') return `${direction} - Mat ket noi`;
  if (call.duration > 0) return `${direction} - ${formatCallDuration(call.duration)}`;
  if (call.state === 'accepted') return `${direction} - Dang dien ra`;
  return direction;
}
