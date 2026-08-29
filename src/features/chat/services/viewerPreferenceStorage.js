// Keep browser preferences stable when one account is represented by multiple IDs.
const LEGACY_MIGRATION_PREFIX = 'vichat.viewer-preference-migration.v1';

function normalizedValue(value) {
  return String(value || '').trim();
}

export function viewerStorageIds(viewerId, aliasViewerIds = []) {
  const aliases = Array.isArray(aliasViewerIds) ? aliasViewerIds : [aliasViewerIds];
  return [...new Set([viewerId, ...aliases]
    .map(normalizedValue)
    .filter(Boolean))];
}

// Tenant-scoped keys are deliberately separate from the old account-only keys.
// This lets an existing browser migrate once without leaking settings between
// companies that use the same Account identity.
export function viewerStorageKeyId(viewerId, tenantId = '') {
  const viewer = normalizedValue(viewerId);
  const tenant = normalizedValue(tenantId);
  if (!tenant) return viewer;
  return `tenant:${encodeURIComponent(tenant)}:viewer:${encodeURIComponent(viewer)}`;
}

export function viewerStorageCandidates(prefix, viewerId, aliasViewerIds = [], tenantId = '', storage) {
  const ids = viewerStorageIds(viewerId, aliasViewerIds);
  const tenant = normalizedValue(tenantId);
  const scoped = ids.map((id, index) => ({
    viewerId: id,
    storageId: viewerStorageKeyId(id, tenant),
    index,
    legacy: false,
  }));
  if (!tenant || !canMigrateLegacyViewerPreference(prefix, viewerId, tenant, storage)) return scoped;
  return [
    ...scoped,
    ...ids.map((id, index) => ({
      viewerId: id,
      storageId: id,
      index,
      legacy: true,
    })),
  ];
}

export function viewerStorageWriteCandidates(viewerId, aliasViewerIds = [], tenantId = '') {
  const tenant = normalizedValue(tenantId);
  return viewerStorageIds(viewerId, aliasViewerIds).map((id, index) => ({
    viewerId: id,
    storageId: viewerStorageKeyId(id, tenant),
    index,
    legacy: false,
  }));
}

function migrationStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis?.localStorage || null;
  } catch {
    return null;
  }
}

export function viewerPreferenceMigrationKey(prefix, viewerId, tenantId = '') {
  return [
    LEGACY_MIGRATION_PREFIX,
    encodeURIComponent(String(prefix || 'preference')),
    encodeURIComponent(normalizedValue(viewerId)),
    encodeURIComponent(normalizedValue(tenantId) || 'legacy'),
  ].join('.');
}

export function canMigrateLegacyViewerPreference(prefix, viewerId, tenantId, storage) {
  const tenant = normalizedValue(tenantId);
  if (!tenant) return true;
  const target = migrationStorage(storage);
  if (!target?.getItem) return true;
  try {
    const marker = normalizedValue(target.getItem(viewerPreferenceMigrationKey(prefix, viewerId, tenant)));
    return !marker;
  } catch {
    return true;
  }
}

export function markLegacyViewerPreferenceMigrated(prefix, viewerId, tenantId, storage) {
  const tenant = normalizedValue(tenantId);
  if (!tenant) return;
  const target = migrationStorage(storage);
  if (!target?.getItem || !target?.setItem) return;
  try {
    const key = viewerPreferenceMigrationKey(prefix, viewerId, tenant);
    if (!normalizedValue(target.getItem(key))) target.setItem(key, tenant);
  } catch {
    // A migration marker is best-effort; the old record remains intact.
  }
}
