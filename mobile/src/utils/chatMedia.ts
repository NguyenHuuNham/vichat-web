import { config } from '../constants/config';

const CHAT_MEDIA_PATH = '/api/v1/chat/media/';
export const CHAT_MEDIA_UPLOAD_ID_PATTERN = /^[0-9]{8}-[a-f0-9]{32}(?:\.[a-z0-9]{1,10})?$/i;

export function isChatMediaUploadId(value: unknown) {
  return CHAT_MEDIA_UPLOAD_ID_PATTERN.test(String(value || '').trim());
}

export function chatMediaReferenceId(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let pathname: string;
  try { pathname = new URL(raw).pathname; } catch { pathname = raw.split(/[?#]/, 1)[0]; }
  const marker = pathname.lastIndexOf(CHAT_MEDIA_PATH);
  if (marker < 0) return '';
  let uploadId: string;
  try {
    uploadId = decodeURIComponent(pathname.slice(marker + CHAT_MEDIA_PATH.length)).replace(/\/+$/, '');
  } catch {
    return '';
  }
  return isChatMediaUploadId(uploadId) ? uploadId : '';
}

export function isChatMediaReference(value: unknown) {
  return Boolean(chatMediaReferenceId(value));
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isChatMediaUuid(value: unknown): boolean {
  return UUID_PATTERN.test(String(value || '').trim());
}

export function shouldFallbackToTinodeMedia(error: any) {
  if ([401, 403].includes(Number(error?.status))) return false;
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  if (
    code === 'MEDIA_FILE_TYPE_UNSUPPORTED'
    || code === 'MEDIA_FILE_TYPE_MISMATCH'
    || code === 'MEDIA_UPLOAD_SIZE_MISMATCH'
    || code === 'MEDIA_UPLOAD_TYPE_MISMATCH'
    || code === 'MEDIA_FILE_EMPTY'
    || error?.status === 409
    || message.includes('not allowed')
    || message.includes('size is invalid')
  ) {
    return true;
  }
  if (!config.chatMediaFallbackToTinode) return false;
  return error?.source === 's3'
    || error?.source === 'network'
    || (!Number(error?.status) && ['TypeError', 'AbortError'].includes(String(error?.name || '')))
    || [400, 404, 408, 409, 429, 500, 502, 503, 504].includes(Number(error?.status))
    || ['MEDIA_CONVERSATION_INVALID', 'MEDIA_CONVERSATION_NOT_FOUND', 'MEDIA_STORAGE_DISABLED', 'MEDIA_STORAGE_UNAVAILABLE'].includes(code);
}
