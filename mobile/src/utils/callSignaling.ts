export type NormalizedCallDescription = {
  type: string;
  sdp: string;
};

/**
 * Tinode relays call payloads as either JSON values or JSON-encoded strings.
 * Some relay paths also wrap the value in a `payload` property.
 */
export function normalizeCallPayload(payload: unknown): unknown {
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
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.payload !== undefined
      && record.type === undefined
      && record.sdp === undefined
      && record.candidate === undefined) {
      return normalizeCallPayload(record.payload);
    }
  }
  return value;
}

export function normalizeCallDescription(payload: unknown, fallbackType = ''): NormalizedCallDescription | null {
  const value = normalizeCallPayload(payload);
  const description = value && typeof value === 'object'
    && (value as Record<string, unknown>).description
    && typeof (value as Record<string, unknown>).description === 'object'
    ? (value as Record<string, unknown>).description
    : value;
  if (typeof description === 'string') {
    return fallbackType && description ? { type: fallbackType, sdp: description } : null;
  }
  if (!description || typeof description !== 'object') return null;
  const record = description as Record<string, unknown>;
  const type = String(record.type || fallbackType || '').trim().toLowerCase();
  const sdp = typeof record.sdp === 'string' ? record.sdp : '';
  return type && sdp ? { type, sdp } : null;
}

export function normalizeCallCandidate(payload: unknown): Record<string, unknown> | null {
  const value = normalizeCallPayload(payload);
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.candidate && typeof record.candidate === 'object') return record.candidate as Record<string, unknown>;
  return record;
}

export function extractCallSequence(ctrl: any, draft: any = null) {
  for (const value of [ctrl?.params?.seq, draft?.seq]) {
    const sequence = Number(value);
    if (Number.isInteger(sequence) && sequence > 0) return sequence;
  }
  return 0;
}

function callPublishErrorMessage(error: unknown, draft: any = null) {
  const source = error as any;
  const code = Number(source?.code || source?.status || 0);
  const serverMessage = String(source?.message || source?.text || '').trim();
  if (code === 501 || /not implemented/i.test(serverMessage)) {
    return 'Tinode trung tâm chưa bật WebRTC/ICE authoritative. Vui lòng cấu hình ICE/TURN trên máy chủ Tinode rồi thử lại.';
  }
  if (code === 401 || code === 403) {
    return 'Phiên Tinode không còn quyền gửi cuộc gọi. Vui lòng tải lại trang và đăng nhập lại.';
  }
  if (serverMessage) return `Không thể gửi tín hiệu cuộc gọi lên Tinode: ${serverMessage}`;
  if (draft?._failed) {
    return 'Máy chủ Tinode đã từ chối bản tin mở cuộc gọi. Kiểm tra quyền cuộc trò chuyện và cấu hình WebRTC.';
  }
  return 'Tinode không trả về mã cuộc gọi. Vui lòng thử lại.';
}

export async function publishCallInvite({
  publish,
  draft,
}: {
  publish: (draft: any) => Promise<any>;
  draft: any;
}) {
  let ctrl;
  try {
    ctrl = await publish(draft);
  } catch (error) {
    const wrapped = new Error(callPublishErrorMessage(error, draft));
    (wrapped as any).cause = error;
    (wrapped as any).code = (error as any)?.code;
    throw wrapped;
  }
  const sequence = extractCallSequence(ctrl, draft);
  if (!sequence) throw new Error(callPublishErrorMessage(null, draft));
  draft.seq = sequence;
  if (ctrl?.ts) draft.ts = ctrl.ts;
  return { ctrl, seq: sequence };
}
