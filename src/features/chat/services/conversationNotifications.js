const HOUR_MS = 60 * 60 * 1000;

export const NOTIFICATION_SETTINGS_STORAGE_PREFIX = 'vichat.notification-settings.v1';
export const CUSTOM_NOTIFICATION_SOUND_ID = 'custom';
export const CUSTOM_NOTIFICATION_SOUND_MAX_BYTES = 8 * 1024 * 1024;
export const APP_LANGUAGE_OPTIONS = Object.freeze([
  Object.freeze({ id: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' }),
  Object.freeze({ id: 'en', label: 'English', flag: '🇺🇸' }),
]);
export const APP_THEME_OPTIONS = Object.freeze([
  Object.freeze({ id: 'light', label: 'Sáng' }),
  Object.freeze({ id: 'dark', label: 'Tối' }),
  Object.freeze({ id: 'system', label: 'Hệ thống' }),
]);

const NOTIFICATION_SOUND_DATABASE_NAME = 'vichat-notification-sounds.v1';
const NOTIFICATION_SOUND_STORE_NAME = 'sounds';

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
  language: 'vi',
  theme: 'light',
});

function notificationSettingsStorageKey(viewerId) {
  return `${NOTIFICATION_SETTINGS_STORAGE_PREFIX}.${encodeURIComponent(String(viewerId || 'anonymous'))}`;
}

export function normalizeNotificationSettings(value = {}) {
  const sound = MESSAGE_SOUND_OPTIONS.some(option => option.id === value?.sound)
    || value?.sound === CUSTOM_NOTIFICATION_SOUND_ID
    ? value.sound
    : DEFAULT_NOTIFICATION_SETTINGS.sound;
  const language = APP_LANGUAGE_OPTIONS.some(option => option.id === value?.language)
    ? value.language
    : DEFAULT_NOTIFICATION_SETTINGS.language;
  const theme = APP_THEME_OPTIONS.some(option => option.id === value?.theme)
    ? value.theme
    : DEFAULT_NOTIFICATION_SETTINGS.theme;
  return {
    desktopNotifications: value?.desktopNotifications !== false,
    sounds: value?.sounds !== false,
    sound,
    language,
    theme,
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

function indexedDbFactory() {
  return typeof globalThis !== 'undefined' ? globalThis.indexedDB : null;
}

function closeDatabase(database) {
  try {
    database?.close?.();
  } catch {
    // Closing is best-effort and must not mask the storage result.
  }
}

function openNotificationSoundDatabase(factory = indexedDbFactory()) {
  return new Promise((resolve, reject) => {
    if (!factory?.open) {
      resolve(null);
      return;
    }
    let request;
    try {
      request = factory.open(NOTIFICATION_SOUND_DATABASE_NAME, 1);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(NOTIFICATION_SOUND_STORE_NAME)) {
        database.createObjectStore(NOTIFICATION_SOUND_STORE_NAME, { keyPath: 'viewerId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Không thể mở kho âm báo.'));
    request.onblocked = () => reject(new Error('Kho âm báo đang bị khóa bởi một tab khác.'));
  });
}

function normalizedCustomNotificationSound(record) {
  if (!record?.blob) return null;
  return {
    blob: record.blob,
    name: String(record.name || 'Âm báo tùy chỉnh'),
    type: String(record.type || record.blob.type || 'audio/*'),
    size: Number.isFinite(Number(record.size)) ? Number(record.size) : 0,
    lastModified: Number.isFinite(Number(record.lastModified)) ? Number(record.lastModified) : 0,
  };
}

export function validateCustomNotificationSoundFile(file) {
  if (!file) return 'Hãy chọn một file âm thanh.';
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  const hasAudioType = type.startsWith('audio/');
  const hasRecognizedAudioExtension = /\.(aac|flac|m4a|mp3|oga|ogg|wav|webm)$/i.test(name);
  if (!hasAudioType && !(type === '' && hasRecognizedAudioExtension)) {
    return 'Chỉ hỗ trợ file âm thanh.';
  }
  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) return 'File âm thanh không hợp lệ.';
  if (size > CUSTOM_NOTIFICATION_SOUND_MAX_BYTES) {
    return 'File âm thanh phải nhỏ hơn hoặc bằng 8 MB.';
  }
  return '';
}

export async function readCustomNotificationSound(viewerId, factory = indexedDbFactory()) {
  if (!viewerId) return null;
  const database = await openNotificationSoundDatabase(factory);
  if (!database) return null;
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = database
        .transaction(NOTIFICATION_SOUND_STORE_NAME, 'readonly')
        .objectStore(NOTIFICATION_SOUND_STORE_NAME)
        .get(String(viewerId));
    } catch (error) {
      closeDatabase(database);
      reject(error);
      return;
    }
    request.onsuccess = () => {
      closeDatabase(database);
      resolve(normalizedCustomNotificationSound(request.result));
    };
    request.onerror = () => {
      closeDatabase(database);
      reject(request.error || new Error('Không thể đọc file âm báo.'));
    };
  });
}

export async function writeCustomNotificationSound(viewerId, file, factory = indexedDbFactory()) {
  if (!viewerId) throw new Error('Thiếu tài khoản để lưu file âm báo.');
  const validationError = validateCustomNotificationSoundFile(file);
  if (validationError) throw new Error(validationError);
  const database = await openNotificationSoundDatabase(factory);
  if (!database) throw new Error('Trình duyệt không hỗ trợ lưu file âm thanh.');
  const record = {
    viewerId: String(viewerId),
    blob: typeof file.slice === 'function' ? file.slice(0, file.size, file.type) : file,
    name: String(file.name || 'Âm báo tùy chỉnh'),
    type: String(file.type || 'audio/*'),
    size: Number(file.size),
    lastModified: Number(file.lastModified) || 0,
  };
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = database
        .transaction(NOTIFICATION_SOUND_STORE_NAME, 'readwrite')
        .objectStore(NOTIFICATION_SOUND_STORE_NAME)
        .put(record);
    } catch (error) {
      closeDatabase(database);
      reject(error);
      return;
    }
    request.onsuccess = () => {
      closeDatabase(database);
      resolve(normalizedCustomNotificationSound(record));
    };
    request.onerror = () => {
      closeDatabase(database);
      reject(request.error || new Error('Không thể lưu file âm báo.'));
    };
  });
}

export async function deleteCustomNotificationSound(viewerId, factory = indexedDbFactory()) {
  if (!viewerId) return false;
  const database = await openNotificationSoundDatabase(factory);
  if (!database) return false;
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = database
        .transaction(NOTIFICATION_SOUND_STORE_NAME, 'readwrite')
        .objectStore(NOTIFICATION_SOUND_STORE_NAME)
        .delete(String(viewerId));
    } catch (error) {
      closeDatabase(database);
      reject(error);
      return;
    }
    request.onsuccess = () => {
      closeDatabase(database);
      resolve(true);
    };
    request.onerror = () => {
      closeDatabase(database);
      reject(request.error || new Error('Không thể xóa file âm báo.'));
    };
  });
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
