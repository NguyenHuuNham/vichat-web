import {
  markLegacyViewerPreferenceMigrated,
  viewerStorageCandidates,
  viewerStorageKeyId,
  viewerStorageWriteCandidates,
} from './viewerPreferenceStorage.js';

export const MESSAGE_ACTION_STORAGE_PREFIX = 'songhong.message-actions';

export function messageActionStorageKey(viewerId, tenantId = '') {
  const storageId = tenantId
    ? viewerStorageKeyId(viewerId, tenantId)
    : String(viewerId || '');
  return `${MESSAGE_ACTION_STORAGE_PREFIX}.${storageId}`;
}

function actionRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function mergeMessageActions(...sources) {
  const merged = {};
  sources.forEach(source => {
    Object.entries(actionRecord(source)).forEach(([key, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      merged[key] = {
        ...value,
        ...(merged[key] || {}),
      };
    });
  });
  return merged;
}

export function readMessageActions(
  viewerId,
  storage = globalThis?.localStorage,
  aliasViewerIds = [],
  tenantId = '',
) {
  if (!viewerId || !storage) return {};
  const candidates = viewerStorageCandidates(
    MESSAGE_ACTION_STORAGE_PREFIX,
    viewerId,
    aliasViewerIds,
    tenantId,
    storage,
  );
  const records = [];
  for (const candidate of candidates) {
    try {
      const raw = storage.getItem(messageActionStorageKey(
        candidate.viewerId,
        candidate.legacy ? '' : tenantId,
      ));
      if (!raw) continue;
      const value = JSON.parse(raw);
      records.push({ candidate, value: actionRecord(value) });
    } catch {
      // A corrupt alias must not hide valid local message actions.
    }
  }
  const usableRecords = records.some(record => !record.candidate.legacy)
    ? records.filter(record => !record.candidate.legacy)
    : records;
  const merged = mergeMessageActions(...usableRecords.map(record => record.value));
  if (usableRecords.some(record => record.candidate.storageId !== candidates[0]?.storageId)) {
    try {
      storage.setItem(messageActionStorageKey(viewerId, tenantId), JSON.stringify(merged));
      if (usableRecords.some(record => record.candidate.legacy)) {
        markLegacyViewerPreferenceMigrated(
          MESSAGE_ACTION_STORAGE_PREFIX,
          viewerId,
          tenantId,
          storage,
        );
      }
    } catch {
      // The current view still uses the merged in-memory actions.
    }
  }
  return merged;
}

export function writeMessageActions(
  viewerId,
  value,
  storage = globalThis?.localStorage,
  aliasViewerIds = [],
  tenantId = '',
) {
  const next = mergeMessageActions(value, readMessageActions(viewerId, storage, aliasViewerIds, tenantId));
  if (viewerId && storage) {
    const record = JSON.stringify(next);
    viewerStorageWriteCandidates(viewerId, aliasViewerIds, tenantId).forEach(candidate => {
      try {
        storage.setItem(messageActionStorageKey(candidate.viewerId, tenantId), record);
      } catch {
        // Local actions are optional and must not block the active chat.
      }
    });
  }
  return next;
}
