import { FileAttachment } from '../types';
import { normalizeMediaUrl } from './mediaUrl';

const MAX_AUDIO_DURATION_MS = 60 * 60 * 1000;
const DRAFTY_ATTACHMENT_TYPES = new Set(['EX', 'IM', 'AU', 'VD']);

function boundedDurationMs(value: unknown) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(MAX_AUDIO_DURATION_MS, Math.round(duration));
}

function parseStructuredValue(value: unknown) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

export function parseAudioDurationMetadata(head: any = {}) {
  const encoded = parseStructuredValue(head?.['x-vichat-audio']);
  const durationMs = boundedDurationMs(encoded?.durationMs ?? encoded?.duration_ms);
  if (durationMs > 0) return durationMs;

  // The web client stores voice duration in seconds for compatibility with
  // its browser audio model; mobile stores milliseconds in x-vichat-audio.
  const webSeconds = boundedDurationMs(Number(head?.['x-voice-duration']) * 1000);
  return webSeconds > 0 ? webSeconds : 0;
}

function draftyAudioDurationMs(data: any) {
  const explicitMilliseconds = boundedDurationMs(data?.durationMs ?? data?.duration_ms);
  if (explicitMilliseconds > 0) return explicitMilliseconds;
  return boundedDurationMs(Number(data?.duration) * 1000);
}

export function findDraftyAttachment(content: any, drafty?: any) {
  let entity = content?.ent?.find?.((item: any) => DRAFTY_ATTACHMENT_TYPES.has(String(item?.tp || '').toUpperCase())) || null;
  if (!entity && drafty?.entities && content) {
    drafty.entities(content, (data: any, _index: number, type: string) => {
      if (!DRAFTY_ATTACHMENT_TYPES.has(String(type || '').toUpperCase())) return false;
      entity = { tp: type, data };
      return true;
    });
  }
  return entity;
}

export function normalizeTinodeMediaValue(value: any, mime = 'image/jpeg') {
  if (!value) return '';
  if (typeof value === 'string') {
    if (/^(?:data:|blob:|file:|content:|https?:)/i.test(value)) return normalizeMediaUrl(value);
    return /^[-A-Za-z0-9+/=]+$/.test(value) ? `data:${mime};base64,${value}` : normalizeMediaUrl(value);
  }
  if (typeof value.ref === 'string') return normalizeTinodeMediaValue(value.ref, value.mime || mime);
  if (typeof value.refurl === 'string') return normalizeTinodeMediaValue(value.refurl, value.mime || mime);
  if (typeof value.url === 'string') return normalizeTinodeMediaValue(value.url, value.mime || mime);
  if (typeof value.val === 'string') return `data:${value.mime || mime};base64,${value.val}`;
  return '';
}

export function normalizeDraftyAttachment(
  content: any,
  drafty?: any,
  explicitAudioDurationMs = 0,
) {
  const entity = findDraftyAttachment(content, drafty);
  if (!entity) return null;
  const type = String(entity.tp || '').toUpperCase();
  const data = entity.data || {};
  const isAudioType = type === 'AU';
  const isVideoType = type === 'VD';
  const name = String(data.name || data.filename || (isAudioType ? 'voice' : isVideoType ? 'video' : 'Tep dinh kem'));
  const mime = String(data.mime || (isAudioType ? 'audio/ogg' : isVideoType ? 'video/mp4' : 'application/octet-stream'));
  const url = normalizeTinodeMediaValue(
    data.ref || data.refurl || data.url || (drafty?.getDownloadUrl?.(data) || ''),
    mime,
  ) || (data.val ? `data:${mime};base64,${data.val}` : '');
  const isImage = type === 'IM'
    || /^image\//i.test(mime)
    || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(name);
  const isAudio = isAudioType
    || /^audio\//i.test(mime)
    || /\.(?:aac|flac|m4a|mp3|ogg|opus|wav|webm)$/i.test(name);
  const durationMs = boundedDurationMs(explicitAudioDurationMs) || (isAudio ? draftyAudioDurationMs(data) : 0);
  const file: FileAttachment = {
    name,
    mime,
    size: Number(data.size || 0),
    url,
    ext: isAudio ? 'audio' : mime.includes('pdf') || /\.pdf$/i.test(name) ? 'pdf' : 'file',
    ...(durationMs > 0 ? { audioDurationMs: durationMs } : {}),
  };
  return { isImage, isAudio, file };
}
