import { config } from '../constants/config';

const CHAT_MEDIA_PATH = '/api/v1/chat/media/';
const UPLOAD_ID_PATTERN = /^[0-9]{8}-[a-f0-9]{32}(?:\.[a-z0-9]{1,10})?$/i;

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
  return UPLOAD_ID_PATTERN.test(uploadId) ? uploadId : '';
}

export function isChatMediaReference(value: unknown) {
  return Boolean(chatMediaReferenceId(value));
}

export function shouldFallbackToTinodeMedia(error: any) {
  if (!config.chatMediaFallbackToTinode || [401, 403].includes(Number(error?.status))) return false;
  return error?.source === 's3'
    || error?.source === 'network'
    || (!Number(error?.status) && ['TypeError', 'AbortError'].includes(String(error?.name || '')))
    || [404, 408, 409, 429, 500, 502, 503, 504].includes(Number(error?.status))
    || ['MEDIA_STORAGE_DISABLED', 'MEDIA_STORAGE_UNAVAILABLE'].includes(String(error?.code || ''));
}
