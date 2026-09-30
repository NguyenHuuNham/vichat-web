export const STICKER_HEAD = 'x-vichat-sticker';
export const STICKER_TEXT_PREFIX = 'vichat-sticker:';

const MAX_STICKER_ID_LENGTH = 80;
const MAX_PACK_ID_LENGTH = 80;
const MAX_LABEL_LENGTH = 120;
const MAX_VERSION_LENGTH = 24;

function boundedText(value, limit) {
  return String(value || '').trim().slice(0, limit);
}

export function normalizeStickerMetadata(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const stickerId = boundedText(value.stickerId || value.sticker_id || value.id, MAX_STICKER_ID_LENGTH);
  const packId = boundedText(value.packId || value.pack_id, MAX_PACK_ID_LENGTH);
  if (!stickerId || !packId) return null;
  return {
    id: stickerId,
    stickerId,
    packId,
    label: boundedText(value.label, MAX_LABEL_LENGTH),
    version: boundedText(value.version, MAX_VERSION_LENGTH) || '1',
  };
}

export function buildStickerTextMarker(value) {
  const normalized = normalizeStickerMetadata(value);
  if (!normalized) return '';
  const parts = [normalized.packId, normalized.stickerId, normalized.version]
    .map(part => encodeURIComponent(part));
  return `${STICKER_TEXT_PREFIX}${parts.join(':')}`;
}

export function parseStickerTextMarker(value = '') {
  const raw = String(value || '').trim();
  if (!raw.startsWith(STICKER_TEXT_PREFIX)) return null;
  const encodedParts = raw.slice(STICKER_TEXT_PREFIX.length).split(':');
  if (encodedParts.length !== 3 || encodedParts.some(part => !part)) return null;
  try {
    const [packId, stickerId, version] = encodedParts.map(part => decodeURIComponent(part));
    return normalizeStickerMetadata({ packId, stickerId, version });
  } catch {
    return null;
  }
}

export function parseStickerMetadata(head = {}, content = '') {
  const raw = head?.[STICKER_HEAD];
  if (raw) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const normalized = normalizeStickerMetadata(parsed);
      if (normalized) return normalized;
    } catch {
      // A malformed head may still have a valid text marker.
    }
  }
  return parseStickerTextMarker(content);
}
