import { viewerStorageIds } from './viewerPreferenceStorage.js';

export const CUSTOM_STICKER_PACK_ID = 'custom';
export const CUSTOM_STICKER_MAX_ITEMS = 48;
export const CUSTOM_STICKER_MAX_BYTES = 2 * 1024 * 1024;
export const CUSTOM_STICKER_TOTAL_MAX_BYTES = 32 * 1024 * 1024;

const DATABASE_NAME = 'vichat-custom-stickers.v1';
const STORE_NAME = 'stickers';
const VIEWER_INDEX_NAME = 'viewerId';
const ALLOWED_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const MIME_EXTENSIONS = Object.freeze({
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});
const EXTENSION_MIME_TYPES = Object.freeze({
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
});

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

function openCustomStickerDatabase(factory = indexedDbFactory()) {
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
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      if (!store.indexNames.contains(VIEWER_INDEX_NAME)) {
        store.createIndex(VIEWER_INDEX_NAME, VIEWER_INDEX_NAME, { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Không thể mở kho sticker cá nhân.'));
    request.onblocked = () => reject(new Error('Kho sticker cá nhân đang bị khóa bởi tab khác.'));
  });
}

function fileExtension(fileName = '') {
  return String(fileName || '').trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
}

function normalizedMime(file) {
  const type = String(file?.type || '').trim().toLowerCase();
  if (ALLOWED_MIME_TYPES.has(type)) return type;
  return EXTENSION_MIME_TYPES[fileExtension(file?.name)] || '';
}

function normalizedFileName(file, mime) {
  const extension = MIME_EXTENSIONS[mime] || 'png';
  const original = Array.from(String(file?.name || ''))
    .filter(character => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const fallback = `sticker-${Date.now()}.${extension}`;
  const withExtension = EXTENSION_MIME_TYPES[fileExtension(original)]
    ? original
    : `${original || 'sticker'}.${extension}`;
  return (withExtension || fallback).slice(0, 140);
}

function stickerLabel(fileName = '') {
  return String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Sticker của tôi';
}

function randomStickerToken() {
  const uuid = globalThis?.crypto?.randomUUID?.();
  if (uuid) return uuid.replace(/-/g, '').slice(0, 12);
  return Math.random().toString(36).slice(2, 14);
}

function customStickerKey(viewerId, stickerId) {
  return `${encodeURIComponent(String(viewerId || ''))}:${String(stickerId || '')}`;
}

function fileFingerprint(file, mime, fileName) {
  return [
    String(fileName || '').toLocaleLowerCase('vi'),
    mime,
    Number(file?.size) || 0,
    Number(file?.lastModified) || 0,
  ].join('|');
}

export function validateCustomStickerFile(file) {
  if (!file) return 'Hãy chọn một ảnh sticker.';
  const type = String(file.type || '').trim().toLowerCase();
  const extensionMime = EXTENSION_MIME_TYPES[fileExtension(file.name)] || '';
  const genericType = !type || type === 'application/octet-stream';
  if (!ALLOWED_MIME_TYPES.has(type) && !(genericType && extensionMime)) {
    return 'Chỉ hỗ trợ ảnh PNG, JPG, WEBP, GIF hoặc AVIF.';
  }
  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) return 'Ảnh sticker không hợp lệ hoặc đang trống.';
  if (size > CUSTOM_STICKER_MAX_BYTES) return 'Mỗi sticker phải nhỏ hơn hoặc bằng 2 MB.';
  return '';
}

export function createCustomStickerRecord(viewerId, file, index = 0, timestamp = Date.now()) {
  const validationError = validateCustomStickerFile(file);
  if (validationError) throw new Error(validationError);
  const normalizedViewerId = String(viewerId || '').trim();
  if (!normalizedViewerId) throw new Error('Thiếu tài khoản để lưu sticker cá nhân.');
  const mime = normalizedMime(file);
  const fileName = normalizedFileName(file, mime);
  const id = `custom-${timestamp.toString(36)}-${index}-${randomStickerToken()}`.slice(0, 80);
  const createdAt = new Date(timestamp).toISOString();
  return {
    key: customStickerKey(normalizedViewerId, id),
    viewerId: normalizedViewerId,
    id,
    packId: CUSTOM_STICKER_PACK_ID,
    label: stickerLabel(fileName),
    keywords: `${stickerLabel(fileName)} sticker custom ca nhan`,
    mime,
    fileName,
    size: Number(file.size),
    lastModified: Number(file.lastModified) || 0,
    fingerprint: fileFingerprint(file, mime, fileName),
    version: String(timestamp),
    createdAt,
    blob: typeof file.slice === 'function' ? file.slice(0, file.size, mime) : file,
    custom: true,
  };
}

export function normalizeCustomStickerRecord(record) {
  const id = String(record?.id || '').trim();
  const viewerId = String(record?.viewerId || '').trim();
  if (!id || !viewerId || !record?.blob) return null;
  const mime = ALLOWED_MIME_TYPES.has(String(record.mime || '').toLowerCase())
    ? String(record.mime).toLowerCase()
    : normalizedMime({ type: record.blob.type, name: record.fileName });
  if (!mime) return null;
  const fileName = normalizedFileName({ name: record.fileName }, mime);
  return {
    key: customStickerKey(viewerId, id),
    viewerId,
    id: id.slice(0, 80),
    packId: CUSTOM_STICKER_PACK_ID,
    label: String(record.label || stickerLabel(fileName)).trim().slice(0, 80) || 'Sticker của tôi',
    keywords: String(record.keywords || `${record.label || ''} sticker custom ca nhan`).slice(0, 240),
    mime,
    fileName,
    size: Math.max(0, Number(record.size) || 0, Number(record.blob.size) || 0),
    lastModified: Math.max(0, Number(record.lastModified) || 0),
    fingerprint: String(record.fingerprint || fileFingerprint(record, mime, fileName)),
    version: String(record.version || '1').slice(0, 24),
    createdAt: String(record.createdAt || '').trim() || new Date(0).toISOString(),
    blob: record.blob,
    custom: true,
  };
}

function requestResult(request, fallbackMessage) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(fallbackMessage));
  });
}

function stickerForViewer(record, viewerId) {
  const normalized = normalizeCustomStickerRecord(record);
  if (!normalized) return null;
  return {
    ...normalized,
    key: customStickerKey(viewerId, normalized.id),
    viewerId,
  };
}

function copyCustomStickerRecords(database, viewerId, records) {
  if (records.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      records.forEach(record => store.put({
        ...record,
        key: customStickerKey(viewerId, record.id),
        viewerId,
      }));
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('CUSTOM_STICKER_COPY_FAILED'));
    transaction.onabort = () => reject(transaction.error || new Error('CUSTOM_STICKER_COPY_FAILED'));
  });
}

function boundedStickers(stickers) {
  const bounded = [];
  let totalBytes = 0;
  stickers
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    .forEach(sticker => {
      if (bounded.length >= CUSTOM_STICKER_MAX_ITEMS) return;
      if (sticker.size <= 0 || sticker.size > CUSTOM_STICKER_MAX_BYTES) return;
      if (totalBytes + sticker.size > CUSTOM_STICKER_TOTAL_MAX_BYTES) return;
      bounded.push(sticker);
      totalBytes += sticker.size;
    });
  return bounded;
}

export async function readCustomStickers(viewerId, factory = indexedDbFactory(), aliasViewerIds = []) {
  const normalizedViewerId = String(viewerId || '').trim();
  if (!normalizedViewerId) return [];
  const database = await openCustomStickerDatabase(factory);
  if (!database) return [];
  const viewerIds = viewerStorageIds(normalizedViewerId, aliasViewerIds);
  try {
    const stickers = [];
    const copiedIds = new Set();
    for (const [index, candidateId] of viewerIds.entries()) {
      const request = database
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .index(VIEWER_INDEX_NAME)
        .getAll(candidateId);
      const records = await requestResult(request, 'Không thể đọc kho sticker cá nhân.');
      (Array.isArray(records) ? records : []).forEach(record => {
        const sticker = stickerForViewer(record, normalizedViewerId);
        const id = String(sticker?.id || '').trim();
        if (!sticker || !id || stickers.some(item => item.id === id)) return;
        stickers.push(sticker);
        if (index > 0) copiedIds.add(id);
      });
    }
    if (copiedIds.size > 0) {
      const records = stickers
        .filter(sticker => copiedIds.has(sticker.id))
        .map(sticker => ({ ...sticker, viewerId: normalizedViewerId }));
      try {
        await copyCustomStickerRecords(database, normalizedViewerId, records);
      } catch {
        // The alias records remain available if copy-on-read is blocked.
      }
    }
    return boundedStickers(stickers);
  } finally {
    closeDatabase(database);
  }
}

export async function writeCustomStickerFiles(viewerId, files, factory = indexedDbFactory(), aliasViewerIds = []) {
  const normalizedViewerId = String(viewerId || '').trim();
  if (!normalizedViewerId) throw new Error('Thiếu tài khoản để lưu sticker cá nhân.');
  const sourceFiles = Array.from(files || []).filter(Boolean);
  if (sourceFiles.length === 0) return { added: [], duplicateCount: 0 };
  sourceFiles.forEach(file => {
    const validationError = validateCustomStickerFile(file);
    if (validationError) throw new Error(validationError);
  });

  const existing = await readCustomStickers(normalizedViewerId, factory, aliasViewerIds);
  const existingFingerprints = new Set(existing.map(sticker => sticker.fingerprint));
  const uniqueFiles = [];
  let duplicateCount = 0;
  sourceFiles.forEach(file => {
    const mime = normalizedMime(file);
    const fileName = normalizedFileName(file, mime);
    const fingerprint = fileFingerprint(file, mime, fileName);
    if (existingFingerprints.has(fingerprint)) {
      duplicateCount += 1;
      return;
    }
    existingFingerprints.add(fingerprint);
    uniqueFiles.push(file);
  });
  if (uniqueFiles.length === 0) return { added: [], duplicateCount };
  if (existing.length + uniqueFiles.length > CUSTOM_STICKER_MAX_ITEMS) {
    throw new Error(`Bạn chỉ có thể lưu tối đa ${CUSTOM_STICKER_MAX_ITEMS} sticker trên thiết bị này.`);
  }
  const nextTotalBytes = existing.reduce((total, sticker) => total + sticker.size, 0)
    + uniqueFiles.reduce((total, file) => total + (Number(file.size) || 0), 0);
  if (nextTotalBytes > CUSTOM_STICKER_TOTAL_MAX_BYTES) {
    throw new Error('Kho sticker cá nhân trên thiết bị này tối đa 32 MB.');
  }

  const timestamp = Date.now();
  const records = uniqueFiles.map((file, index) => createCustomStickerRecord(
    normalizedViewerId,
    file,
    index,
    timestamp + index,
  ));
  const database = await openCustomStickerDatabase(factory);
  if (!database) throw new Error('Trình duyệt không hỗ trợ lưu sticker cá nhân.');

  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      records.forEach(record => store.put(record));
    } catch (error) {
      closeDatabase(database);
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      closeDatabase(database);
      resolve({ added: records.map(normalizeCustomStickerRecord).filter(Boolean), duplicateCount });
    };
    transaction.onerror = () => {
      closeDatabase(database);
      reject(transaction.error || new Error('Không thể lưu sticker cá nhân.'));
    };
    transaction.onabort = () => {
      closeDatabase(database);
      reject(transaction.error || new Error('Không thể lưu sticker cá nhân.'));
    };
  });
}

export async function deleteCustomSticker(viewerId, stickerId, factory = indexedDbFactory(), aliasViewerIds = []) {
  const normalizedViewerId = String(viewerId || '').trim();
  const normalizedStickerId = String(stickerId || '').trim();
  if (!normalizedViewerId || !normalizedStickerId) return false;
  const database = await openCustomStickerDatabase(factory);
  if (!database) return false;
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      viewerStorageIds(normalizedViewerId, aliasViewerIds).forEach(candidateId => {
        store.delete(customStickerKey(candidateId, normalizedStickerId));
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
      reject(transaction.error || new Error('Không thể xóa sticker cá nhân.'));
    };
    transaction.onabort = () => {
      closeDatabase(database);
      reject(transaction.error || new Error('Không thể xóa sticker cá nhân.'));
    };
  });
}
