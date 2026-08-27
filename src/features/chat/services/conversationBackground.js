import { viewerStorageIds } from './viewerPreferenceStorage.js';

const STORAGE_PREFIX = 'vichat.conversation-backgrounds.v1';

export const CONVERSATION_BACKGROUND_MAX_BYTES = 8 * 1024 * 1024;
export const CONVERSATION_BACKGROUND_LOCAL_MAX_BYTES = 2 * 1024 * 1024;
export const CONVERSATION_BACKGROUND_SCOPES = Object.freeze({
  LOCAL: 'local',
  SHARED: 'shared',
});
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

function backgroundViewerIds(viewerId, aliasViewerIds = []) {
  return viewerStorageIds(viewerId, aliasViewerIds);
}

function parseStoredBackground(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const nested = value.background && typeof value.background === 'object' ? value.background : value;
    const scope = text(value.scope || nested?.scope) === CONVERSATION_BACKGROUND_SCOPES.SHARED
      ? CONVERSATION_BACKGROUND_SCOPES.SHARED
      : CONVERSATION_BACKGROUND_SCOPES.LOCAL;
    const background = value.cleared === true ? null : normalizeConversationBackground(nested);
    if (value.cleared !== true && !background) return null;
    return {
      scope,
      background: background ? { ...background, scope } : null,
      cleared: value.cleared === true,
      updatedAt: text(value.updatedAt),
    };
  } catch {
    return null;
  }
}

function readStoredBackground(storage, viewerId, tenantId, conversationId) {
  try {
    const raw = storage.getItem(storageKey(viewerId, tenantId, conversationId));
    const preference = parseStoredBackground(raw);
    return preference ? { viewerId, preference } : null;
  } catch {
    return null;
  }
}

function backgroundForViewer(background, viewerId, tenantId, conversationId) {
  if (!background?.customKey) return background;
  const key = backgroundFileKey(viewerId, tenantId, conversationId);
  return {
    ...background,
    customKey: key,
    url: `indexeddb://${key}`,
  };
}

function writeStoredBackground(storage, viewerId, tenantId, conversationId, preference) {
  const background = preference.background
    ? backgroundForViewer(preference.background, viewerId, tenantId, conversationId)
    : null;
  storage.setItem(storageKey(viewerId, tenantId, conversationId), JSON.stringify({
    scope: preference.scope,
    background,
    cleared: !background,
    ...(preference.updatedAt ? { updatedAt: preference.updatedAt } : {}),
  }));
}

function selectStoredBackground(viewerId, tenantId, conversationId, storage, aliasViewerIds = []) {
  if (!storage) return null;
  const viewerIds = backgroundViewerIds(viewerId, aliasViewerIds);
  for (const [index, candidateId] of viewerIds.entries()) {
    const record = readStoredBackground(storage, candidateId, tenantId, conversationId);
    if (!record) continue;
    if (index > 0) {
      try {
        writeStoredBackground(storage, viewerIds[0], tenantId, conversationId, record.preference);
      } catch {
        // The alias remains usable when copy-on-read is unavailable.
      }
    }
    return { ...record, index };
  }
  return null;
}

export function normalizeConversationBackground(value) {
  if (!value || typeof value !== 'object') return null;
  const scope = text(value.scope || value.visibility || value.backgroundScope);
  const normalizedScope = Object.values(CONVERSATION_BACKGROUND_SCOPES).includes(scope)
    ? scope
    : '';
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
    ...(normalizedScope ? { scope: normalizedScope } : {}),
  };
}

export function readConversationBackground(
  viewerId,
  tenantId,
  conversationId,
  storage = globalThis?.localStorage,
  aliasViewerIds = [],
) {
  const record = selectStoredBackground(viewerId, tenantId, conversationId, storage, aliasViewerIds);
  return record?.preference.background || null;
}

export function writeConversationBackground(
  viewerId,
  tenantId,
  conversationId,
  value,
  storage = globalThis?.localStorage,
  aliasViewerIds = [],
) {
  const normalized = normalizeConversationBackground(value);
  if (!normalized || !viewerId || !conversationId || !storage) return normalized;
  const preference = { scope: normalized.scope || CONVERSATION_BACKGROUND_SCOPES.LOCAL, background: normalized };
  backgroundViewerIds(viewerId, aliasViewerIds).forEach(candidateId => {
    try {
      writeStoredBackground(storage, candidateId, tenantId, conversationId, preference);
    } catch {
      // A local preference must not block the active chat if storage is full.
    }
  });
  return normalized;
}

export function createClearedConversationBackground(
  scope = CONVERSATION_BACKGROUND_SCOPES.LOCAL,
  updatedAt = new Date().toISOString(),
) {
  return {
    id: '',
    url: '',
    customKey: '',
    label: '',
    kind: 'none',
    updatedAt: text(updatedAt) || new Date().toISOString(),
    scope,
    cleared: true,
  };
}

export function readConversationBackgroundPreference(
  viewerId,
  tenantId,
  conversationId,
  storage = globalThis?.localStorage,
  aliasViewerIds = [],
) {
  const record = selectStoredBackground(viewerId, tenantId, conversationId, storage, aliasViewerIds);
  if (!record?.preference) return null;
  return {
    scope: record.preference.scope,
    background: record.preference.background,
  };
}

export function writeConversationBackgroundPreference(
  viewerId,
  tenantId,
  conversationId,
  scope,
  value,
  storage = globalThis?.localStorage,
  aliasViewerIds = [],
) {
  const normalizedScope = scope === CONVERSATION_BACKGROUND_SCOPES.SHARED
    ? CONVERSATION_BACKGROUND_SCOPES.SHARED
    : CONVERSATION_BACKGROUND_SCOPES.LOCAL;
  const normalized = value ? normalizeConversationBackground({ ...value, scope: normalizedScope }) : null;
  if (!viewerId || !conversationId || !storage) return normalized;
  const preference = {
    scope: normalizedScope,
    background: normalized,
    updatedAt: new Date().toISOString(),
  };
  backgroundViewerIds(viewerId, aliasViewerIds).forEach(candidateId => {
    try {
      writeStoredBackground(storage, candidateId, tenantId, conversationId, preference);
    } catch {
      // A local preference must not block the active chat if storage is full.
    }
  });
  return normalized;
}

export function clearConversationBackground(
  viewerId,
  tenantId,
  conversationId,
  storage = globalThis?.localStorage,
  aliasViewerIds = [],
) {
  if (!viewerId || !conversationId || !storage) return false;
  let cleared = false;
  for (const candidateId of backgroundViewerIds(viewerId, aliasViewerIds)) {
    try {
      storage.removeItem(storageKey(candidateId, tenantId, conversationId));
      cleared = true;
    } catch {
      // Keep clearing other identity aliases.
    }
  }
  return cleared;
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

export function sharedConversationBackgroundFromEvent(event, fallbackUpdatedAt = '') {
  if (event?.action !== 'conversation_background_changed') return undefined;
  const eventScope = text(event.scope || event.visibility || event.backgroundScope);
  if (eventScope && eventScope !== CONVERSATION_BACKGROUND_SCOPES.SHARED) return undefined;
  const backgroundUrl = text(event.backgroundUrl || event.background_url);
  if (!backgroundUrl) return null;
  return normalizeConversationBackground({
    id: event.backgroundId || event.background_id,
    url: backgroundUrl,
    label: event.backgroundLabel || event.background_label,
    kind: event.backgroundKind || event.background_kind,
    scope: CONVERSATION_BACKGROUND_SCOPES.SHARED,
    updatedAt: event.updatedAt || event.updated_at || fallbackUpdatedAt,
  });
}

export function latestSharedConversationBackground(room) {
  const messages = Array.isArray(room?.messages) ? room.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const event = message?.systemEvent || message;
    const background = sharedConversationBackgroundFromEvent(event, message?.createdAt);
    if (background !== undefined) return background;
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

function requestResult(request, fallbackMessage) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(fallbackMessage));
  });
}

function copyBackgroundFileRecord(database, targetKey, sourceRecord) {
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({ ...sourceRecord, key: targetKey });
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('BACKGROUND_COPY_FAILED'));
    transaction.onabort = () => reject(transaction.error || new Error('BACKGROUND_COPY_FAILED'));
  });
}

export async function readConversationBackgroundFile(
  viewerId,
  tenantId,
  conversationId,
  factory = indexedDbFactory(),
  aliasViewerIds = [],
) {
  const selected = selectStoredBackground(
    viewerId,
    tenantId,
    conversationId,
    globalThis?.localStorage,
    aliasViewerIds,
  );
  const metadata = selected?.preference.background;
  if (!metadata?.customKey) return null;
  const database = await openBackgroundDatabase(factory);
  if (!database) return null;
  const viewerIds = backgroundViewerIds(viewerId, aliasViewerIds);
  const keys = [...new Set([
    metadata.customKey,
    ...viewerIds.map(candidateId => backgroundFileKey(candidateId, tenantId, conversationId)),
  ])];
  try {
    for (const key of keys) {
      const request = database
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(key);
      const sourceRecord = await requestResult(request, 'BACKGROUND_READ_FAILED');
      const record = backgroundFileRecord(sourceRecord);
      if (!record) continue;
      const primaryKey = backgroundFileKey(viewerIds[0], tenantId, conversationId);
      if (key !== primaryKey) {
        try {
          await copyBackgroundFileRecord(database, primaryKey, sourceRecord);
        } catch {
          // The legacy file remains available when copy-on-read is blocked.
        }
      }
      const primaryMetadata = backgroundForViewer(metadata, viewerIds[0], tenantId, conversationId);
      return { ...record, ...primaryMetadata };
    }
    return null;
  } finally {
    closeDatabase(database);
  }
}

export async function writeConversationBackgroundFile(
  viewerId,
  tenantId,
  conversationId,
  file,
  factory = indexedDbFactory(),
  aliasViewerIds = [],
) {
  const validationError = validateConversationBackgroundFile(file, { localOnly: true });
  if (validationError) throw new Error(validationError);
  if (!viewerId || !conversationId) throw new Error('Thiếu cuộc trò chuyện để lưu hình nền.');
  const database = await openBackgroundDatabase(factory);
  if (!database) throw new Error('Trình duyệt không hỗ trợ lưu ảnh hình nền.');
  const normalizedViewerId = String(viewerId).trim();
  const viewerIds = backgroundViewerIds(normalizedViewerId, aliasViewerIds);
  const key = backgroundFileKey(normalizedViewerId, tenantId, conversationId);
  const metadata = normalizeConversationBackground({
    id: 'custom',
    customKey: key,
    label: text(file.name) || 'Ảnh tải lên',
    kind: 'custom',
    scope: CONVERSATION_BACKGROUND_SCOPES.LOCAL,
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
  const records = viewerIds.map(candidateId => ({
    ...record,
    key: backgroundFileKey(candidateId, tenantId, conversationId),
  }));
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      records.forEach(candidateRecord => store.put(candidateRecord));
    } catch (error) {
      closeDatabase(database);
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      closeDatabase(database);
      resolve({ ...metadata, blob: record.blob });
    };
    transaction.onerror = () => {
      closeDatabase(database);
      reject(transaction.error || new Error('BACKGROUND_WRITE_FAILED'));
    };
    transaction.onabort = () => {
      closeDatabase(database);
      reject(transaction.error || new Error('BACKGROUND_WRITE_FAILED'));
    };
  });
}

export async function deleteConversationBackgroundFile(
  viewerId,
  tenantId,
  conversationId,
  factory = indexedDbFactory(),
  aliasViewerIds = [],
) {
  if (!viewerId || !conversationId) return false;
  const database = await openBackgroundDatabase(factory);
  if (!database) return false;
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      backgroundViewerIds(viewerId, aliasViewerIds).forEach(candidateId => {
        store.delete(backgroundFileKey(candidateId, tenantId, conversationId));
      });
    } catch (error) {
      closeDatabase(database);
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      closeDatabase(database);
      resolve(true);
    };
    transaction.onerror = () => {
      closeDatabase(database);
      reject(transaction.error || new Error('BACKGROUND_DELETE_FAILED'));
    };
    transaction.onabort = () => {
      closeDatabase(database);
      reject(transaction.error || new Error('BACKGROUND_DELETE_FAILED'));
    };
  });
}
