const STORAGE_PREFIX = 'vichat.conversation-backgrounds.v1';

export const CONVERSATION_BACKGROUND_MAX_BYTES = 8 * 1024 * 1024;
export const CONVERSATION_BACKGROUND_LOCAL_MAX_BYTES = 2 * 1024 * 1024;
const DATABASE_NAME = 'vichat-conversation-backgrounds';
const STORE_NAME = 'background-files';

// These images are served by Unsplash and are used as optional presets. The
// active value is stored as metadata, so a group preference remains viewer-local.
export const CONVERSATION_BACKGROUND_PRESETS = Object.freeze([
  Object.freeze({
    id: 'misty-mountains',
    label: 'Núi mây',
    url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1280&h=860&q=82',
  }),
  Object.freeze({
    id: 'quiet-ocean',
    label: 'Biển xanh',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1280&h=860&q=82',
  }),
  Object.freeze({
    id: 'sunset-road',
    label: 'Hoàng hôn',
    url: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1280&h=860&q=82',
  }),
  Object.freeze({
    id: 'tropical-leaves',
    label: 'Lá nhiệt đới',
    url: 'https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=1280&h=860&q=82',
  }),
  Object.freeze({
    id: 'blue-forest',
    label: 'Rừng xanh',
    url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1280&h=860&q=82',
  }),
  Object.freeze({
    id: 'colorful-abstract',
    label: 'Màu trừu tượng',
    url: 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?auto=format&fit=crop&w=1280&h=860&q=82',
  }),
  Object.freeze({
    id: 'pink-blossom',
    label: 'Hoa dịu nhẹ',
    url: 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1280&h=860&q=82',
  }),
  Object.freeze({
    id: 'city-lights',
    label: 'Đèn thành phố',
    url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1280&h=860&q=82',
  }),
  Object.freeze({
    id: 'pastel-clouds',
    label: 'Mây pastel',
    url: 'https://images.unsplash.com/photo-1499346030926-9a72daac6c63?auto=format&fit=crop&w=1280&h=860&q=82',
  }),
  Object.freeze({
    id: 'warm-coffee',
    label: 'Cà phê ấm',
    url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1280&h=860&q=82',
  }),
]);

function text(value) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
}

function storageKey(viewerId, tenantId, conversationId) {
  return [STORAGE_PREFIX, viewerId || 'anonymous', tenantId || 'default', conversationId || 'conversation']
    .map(value => encodeURIComponent(String(value)))
    .join(':');
}

export function normalizeConversationBackground(value) {
  if (!value || typeof value !== 'object') return null;
  const customKey = text(value.customKey || value.custom_key);
  const url = text(value.url || value.backgroundUrl || value.background_url)
    || (customKey ? `indexeddb://${customKey}` : '');
  if (!url || url.length > 8_000_000) return null;
  return {
    id: text(value.id),
    url,
    customKey,
    label: text(value.label || value.backgroundLabel || value.background_label) || 'Hình nền cuộc trò chuyện',
    kind: text(value.kind || value.backgroundKind || value.background_kind) || 'custom',
    updatedAt: text(value.updatedAt || value.updated_at) || new Date().toISOString(),
  };
}

export function readConversationBackground(viewerId, tenantId, conversationId, storage = globalThis?.localStorage) {
  if (!viewerId || !conversationId || !storage) return null;
  try {
    const raw = storage.getItem(storageKey(viewerId, tenantId, conversationId));
    return raw ? normalizeConversationBackground(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeConversationBackground(viewerId, tenantId, conversationId, value, storage = globalThis?.localStorage) {
  const normalized = normalizeConversationBackground(value);
  if (!normalized || !viewerId || !conversationId || !storage) return normalized;
  try {
    storage.setItem(storageKey(viewerId, tenantId, conversationId), JSON.stringify(normalized));
  } catch {
    // A local preference must not block the active chat if storage is full.
  }
  return normalized;
}

export function clearConversationBackground(viewerId, tenantId, conversationId, storage = globalThis?.localStorage) {
  if (!viewerId || !conversationId || !storage) return false;
  try {
    storage.removeItem(storageKey(viewerId, tenantId, conversationId));
    return true;
  } catch {
    return false;
  }
}

export function validateConversationBackgroundFile(file, { localOnly = false } = {}) {
  if (!file) return 'Hãy chọn một ảnh làm hình nền.';
  const type = text(file.type).toLowerCase();
  const name = text(file.name).toLowerCase();
  const isImage = type.startsWith('image/') || /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i.test(name);
  if (!isImage) return 'Chỉ hỗ trợ file hình ảnh.';
  const size = Number(file.size);
  const maxBytes = localOnly ? CONVERSATION_BACKGROUND_LOCAL_MAX_BYTES : CONVERSATION_BACKGROUND_MAX_BYTES;
  if (!Number.isFinite(size) || size <= 0) return 'Ảnh hình nền không hợp lệ.';
  if (size > maxBytes) return `Ảnh hình nền phải nhỏ hơn hoặc bằng ${Math.round(maxBytes / (1024 * 1024))} MB.`;
  return '';
}

export function latestSharedConversationBackground(room) {
  const messages = Array.isArray(room?.messages) ? room.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const event = message?.systemEvent || message;
    if (event?.action !== 'conversation_background_changed') continue;
    const background = normalizeConversationBackground({
      id: event.backgroundId,
      url: event.backgroundUrl || event.background_url,
      label: event.backgroundLabel || event.background_label,
      kind: event.backgroundKind || event.background_kind,
      updatedAt: event.updatedAt || event.updated_at || message.createdAt,
    });
    return background;
  }
  return undefined;
}

export function conversationBackgroundStorageKey(viewerId, tenantId, conversationId) {
  return storageKey(viewerId, tenantId, conversationId);
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

function openBackgroundDatabase(factory = indexedDbFactory()) {
  return new Promise((resolve, reject) => {
    if (!factory?.open) {
      resolve(null);
      return;
    }
    let request;
    try {
      request = factory.open(DATABASE_NAME, 1);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Không thể mở kho hình nền.'));
    request.onblocked = () => reject(new Error('Kho hình nền đang bị khóa bởi tab khác.'));
  });
}

function backgroundFileKey(viewerId, tenantId, conversationId) {
  return storageKey(viewerId, tenantId, conversationId);
}

function backgroundFileRecord(record) {
  if (!record?.blob || !record?.key) return null;
  const background = normalizeConversationBackground({
    id: 'custom',
    customKey: record.key,
    label: record.label || 'Ảnh tải lên',
    kind: 'custom',
    updatedAt: record.updatedAt,
  });
  return background ? { ...background, blob: record.blob } : null;
}

export async function readConversationBackgroundFile(viewerId, tenantId, conversationId, factory = indexedDbFactory()) {
  const metadata = readConversationBackground(viewerId, tenantId, conversationId);
  if (!metadata?.customKey) return null;
  const database = await openBackgroundDatabase(factory);
  if (!database) return null;
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = database
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(metadata.customKey);
    } catch (error) {
      closeDatabase(database);
      reject(error);
      return;
    }
    request.onsuccess = () => {
      closeDatabase(database);
      const record = backgroundFileRecord(request.result);
      resolve(record ? { ...record, ...metadata } : null);
    };
    request.onerror = () => {
      closeDatabase(database);
      reject(request.error || new Error('Không thể đọc ảnh nền đã lưu.'));
    };
  });
}

export async function writeConversationBackgroundFile(viewerId, tenantId, conversationId, file, factory = indexedDbFactory()) {
  const validationError = validateConversationBackgroundFile(file, { localOnly: true });
  if (validationError) throw new Error(validationError);
  if (!viewerId || !conversationId) throw new Error('Thiếu cuộc trò chuyện để lưu hình nền.');
  const database = await openBackgroundDatabase(factory);
  if (!database) throw new Error('Trình duyệt không hỗ trợ lưu ảnh hình nền.');
  const key = backgroundFileKey(viewerId, tenantId, conversationId);
  const metadata = normalizeConversationBackground({
    id: 'custom',
    customKey: key,
    label: text(file.name) || 'Ảnh tải lên',
    kind: 'custom',
    updatedAt: new Date().toISOString(),
  });
  const record = {
    key,
    blob: typeof file.slice === 'function' ? file.slice(0, file.size, file.type) : file,
    label: metadata.label,
    type: text(file.type) || 'image/*',
    size: Number(file.size) || 0,
    updatedAt: metadata.updatedAt,
  };
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record);
    } catch (error) {
      closeDatabase(database);
      reject(error);
      return;
    }
    request.onsuccess = () => {
      closeDatabase(database);
      resolve({ ...metadata, blob: record.blob });
    };
    request.onerror = () => {
      closeDatabase(database);
      reject(request.error || new Error('Không thể lưu ảnh hình nền.'));
    };
  });
}

export async function deleteConversationBackgroundFile(viewerId, tenantId, conversationId, factory = indexedDbFactory()) {
  if (!viewerId || !conversationId) return false;
  const database = await openBackgroundDatabase(factory);
  if (!database) return false;
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = database
        .transaction(STORE_NAME, 'readwrite')
        .objectStore(STORE_NAME)
        .delete(backgroundFileKey(viewerId, tenantId, conversationId));
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
      reject(request.error || new Error('Không thể xóa ảnh hình nền.'));
    };
  });
}
