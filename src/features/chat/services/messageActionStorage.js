import { viewerStorageIds } from './viewerPreferenceStorage.js';

export const MESSAGE_ACTION_STORAGE_PREFIX = 'songhong.message-actions';

export function messageActionStorageKey(viewerId) {
  return `${MESSAGE_ACTION_STORAGE_PREFIX}.${String(viewerId || '')}`;
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

export function readMessageActions(viewerId, storage = globalThis?.localStorage, aliasViewerIds = []) {
  if (!viewerId || !storage) return {};
  const viewerIds = viewerStorageIds(viewerId, aliasViewerIds);
  const records = [];
  for (const candidateId of viewerIds) {
    try {
      const raw = storage.getItem(messageActionStorageKey(candidateId));
      if (!raw) continue;
      const value = JSON.parse(raw);
      records.push({ candidateId, value: actionRecord(value) });
    } catch {
      // A corrupt alias must not hide valid local message actions.
    }
  }
  const merged = mergeMessageActions(...records.map(record => record.value));
  if (records.some(record => record.candidateId !== viewerIds[0])) {
    try {
      storage.setItem(messageActionStorageKey(viewerIds[0]), JSON.stringify(merged));
    } catch {
      // The current view still uses the merged in-memory actions.
    }
  }
  return merged;
}

export function writeMessageActions(viewerId, value, storage = globalThis?.localStorage, aliasViewerIds = []) {
  const viewerIds = viewerStorageIds(viewerId, aliasViewerIds);
  const next = mergeMessageActions(value, readMessageActions(viewerId, storage, aliasViewerIds));
  if (viewerId && storage) {
    const record = JSON.stringify(next);
    viewerIds.forEach(candidateId => {
      try {
        storage.setItem(messageActionStorageKey(candidateId), record);
      } catch {
        // Local actions are optional and must not block the active chat.
      }
    });
  }
  return next;
}
