import { config } from '../constants/config';

export function normalizeMediaUrl(value: unknown) {
  const raw = String(value || '');
  if (!raw) return '';
  if (/^(?:data:|blob:|file:|content:)/i.test(raw)) return raw;
  if (raw.startsWith('/tinode-media/')) {
    return `${config.mediaBase}${raw.slice('/tinode-media'.length)}`;
  }
  if (raw.startsWith('/v0/file/')) return `${config.mediaBase}${raw}`;
  try {
    const parsed = new URL(raw);
    if (parsed.pathname.startsWith('/tinode-media/v0/file/')) {
      return `${config.mediaBase}${parsed.pathname.slice('/tinode-media'.length)}${parsed.search}`;
    }
    if (parsed.pathname.startsWith('/v0/file/')) {
      return `${config.mediaBase}${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // Relative paths are normalized against the configured media relay below.
  }
  if (/^https?:/i.test(raw)) return raw;
  return `${config.mediaBase}/${raw.replace(/^\/+/, '')}`;
}
