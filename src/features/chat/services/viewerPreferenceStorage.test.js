import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canMigrateLegacyViewerPreference,
  markLegacyViewerPreferenceMigrated,
  viewerPreferenceMigrationKey,
  viewerStorageCandidates,
  viewerStorageKeyId,
} from './viewerPreferenceStorage.js';

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test('keeps preference keys separate for the same viewer in different tenants', () => {
  assert.notEqual(viewerStorageKeyId('viewer-1', 'tenant-a'), viewerStorageKeyId('viewer-1', 'tenant-b'));
  assert.equal(viewerStorageKeyId('viewer-1', 'tenant-a'), 'tenant:tenant-a:viewer:viewer-1');
});

test('scopes legacy migration markers by tenant and preserves the legacy record', () => {
  const storage = memoryStorage();
  const prefix = 'vichat.preference.v1';

  markLegacyViewerPreferenceMigrated(prefix, 'viewer-1', 'tenant-a', storage);

  assert.equal(canMigrateLegacyViewerPreference(prefix, 'viewer-1', 'tenant-a', storage), false);
  assert.equal(canMigrateLegacyViewerPreference(prefix, 'viewer-1', 'tenant-b', storage), true);
  assert.notEqual(
    viewerPreferenceMigrationKey(prefix, 'viewer-1', 'tenant-a'),
    viewerPreferenceMigrationKey(prefix, 'viewer-1', 'tenant-b'),
  );

  const tenantB = viewerStorageCandidates(prefix, 'viewer-1', [], 'tenant-b', storage);
  assert.equal(tenantB.some(candidate => candidate.legacy && candidate.storageId === 'viewer-1'), true);
  assert.equal(storage.values.has(viewerPreferenceMigrationKey(prefix, 'viewer-1', 'tenant-a')), true);
  assert.equal(storage.values.has(`${prefix}.viewer-1`), false);
});
