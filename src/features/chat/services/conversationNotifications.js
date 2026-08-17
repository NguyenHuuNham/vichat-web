const HOUR_MS = 60 * 60 * 1000;

export const NOTIFICATION_SETTINGS_STORAGE_PREFIX = 'vichat.notification-settings.v1';

export const MESSAGE_SOUND_OPTIONS = Object.freeze([
  Object.freeze({ id: 'chime', label: 'Chuông nhẹ', tones: [[660, 0, 0.14], [880, 0.12, 0.2]] }),
  Object.freeze({ id: 'bell', label: 'Chuông ngân', tones: [[740, 0, 0.18], [988, 0.14, 0.28]] }),
  Object.freeze({ id: 'pop', label: 'Âm pop', tones: [[520, 0, 0.1], [780, 0.08, 0.12]] }),
  Object.freeze({ id: 'soft', label: 'Âm dịu', tones: [[440, 0, 0.2], [554, 0.18, 0.26]] }),
]);

export const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  desktopNotifications: true,
  sounds: true,
  sound: 'chime',
  compactMode: false,
});

function notificationSettingsStorageKey(viewerId) {
  return `${NOTIFICATION_SETTINGS_STORAGE_PREFIX}.${encodeURIComponent(String(viewerId || 'anonymous'))}`;
}

export function normalizeNotificationSettings(value = {}) {
  const sound = MESSAGE_SOUND_OPTIONS.some(option => option.id === value?.sound)
    ? value.sound
    : DEFAULT_NOTIFICATION_SETTINGS.sound;
  return {
    desktopNotifications: value?.desktopNotifications !== false,
    sounds: value?.sounds !== false,
    sound,
    compactMode: value?.compactMode === true,
  };
}

export function readNotificationSettings(viewerId, storage = globalThis?.localStorage) {
  if (!viewerId || !storage) return { ...DEFAULT_NOTIFICATION_SETTINGS };
  try {
    const raw = storage.getItem(notificationSettingsStorageKey(viewerId));
    return normalizeNotificationSettings(raw ? JSON.parse(raw) : DEFAULT_NOTIFICATION_SETTINGS);
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

export function writeNotificationSettings(viewerId, value, storage = globalThis?.localStorage) {
  const next = normalizeNotificationSettings(value);
  if (viewerId && storage) {
    try {
      storage.setItem(notificationSettingsStorageKey(viewerId), JSON.stringify(next));
    } catch {
      // Preferences remain active for the current tab when storage is unavailable.
    }
  }
  return next;
}

export function notificationMessageBody(message = {}) {
  if (message.type === 'image') return 'Đã gửi một hình ảnh.';
  if (message.type === 'file') return `Đã gửi tệp ${message.file?.name || 'đính kèm'}.`;
  return String(message.text || 'Có tin nhắn mới.').trim() || 'Có tin nhắn mới.';
}

export function messageSoundProfile(soundId) {
  return MESSAGE_SOUND_OPTIONS.find(option => option.id === soundId)
    || MESSAGE_SOUND_OPTIONS[0];
}

export const NOTIFICATION_MUTE_OPTIONS = Object.freeze({
  ONE_HOUR: 'one-hour',
  FOUR_HOURS: 'four-hours',
  UNTIL_EIGHT: 'until-eight',
  UNTIL_MANUAL: 'until-manual',
});

export function normalizeNotificationMuteUntil(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) return null;
  return Math.trunc(normalized);
}

export function isConversationMuted(value, nowMs = Date.now()) {
  const muteUntil = normalizeNotificationMuteUntil(value);
  if (muteUntil === null) return false;
  return muteUntil === 0 || muteUntil * 1000 > nowMs;
}

export function resolveNotificationMuteUntil(option, nowMs = Date.now()) {
  if (option === NOTIFICATION_MUTE_OPTIONS.UNTIL_MANUAL) return 0;
  if (option === NOTIFICATION_MUTE_OPTIONS.ONE_HOUR) {
    return Math.floor((nowMs + HOUR_MS) / 1000);
  }
  if (option === NOTIFICATION_MUTE_OPTIONS.FOUR_HOURS) {
    return Math.floor((nowMs + (4 * HOUR_MS)) / 1000);
  }
  if (option === NOTIFICATION_MUTE_OPTIONS.UNTIL_EIGHT) {
    const now = new Date(nowMs);
    const target = new Date(nowMs);
    target.setHours(8, 0, 0, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    return Math.floor(target.getTime() / 1000);
  }
  throw new Error('Thời hạn tắt thông báo không hợp lệ.');
}

export function nextNotificationMuteExpiry(conversations, nowMs = Date.now()) {
  const expiries = (conversations || [])
    .map(conversation => normalizeNotificationMuteUntil(conversation?.notificationMutedUntil))
    .filter(value => value !== null && value > 0)
    .map(value => value * 1000)
    .filter(value => value > nowMs);
  return expiries.length > 0 ? Math.min(...expiries) : null;
}

export function notificationMuteLabel(value, nowMs = Date.now()) {
  const muteUntil = normalizeNotificationMuteUntil(value);
  if (!isConversationMuted(muteUntil, nowMs)) return '';
  if (muteUntil === 0) return 'Đã tắt cho đến khi được mở lại';
  const target = new Date(muteUntil * 1000);
  const now = new Date(nowMs);
  const sameDay = target.getFullYear() === now.getFullYear()
    && target.getMonth() === now.getMonth()
    && target.getDate() === now.getDate();
  const time = target.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Đã tắt đến ${time}`;
  return `Đã tắt đến ${time} ${target.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}
