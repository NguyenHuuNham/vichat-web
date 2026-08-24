import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDirectoryPresenceBatches,
  directoryPresenceTerms,
  presenceSnapshotFromDiscovery,
} from './directoryPresence.js';

test('directory presence uses the deterministic Tinode username before public identity fields', () => {
  const terms = directoryPresenceTerms({
    tinodeUsername: 'upgo_abc123',
    username: 'employee@example.com',
    email: 'employee@example.com',
  });

  assert.deepEqual(terms.slice(0, 2), ['basic:upgo_abc123', 'upgo_abc123']);
  assert.ok(terms.includes('email:employee@example.com'));
  assert.ok(!terms.includes('basic:employee@example.com'));
});

test('presence discovery batches are bounded and keep every known UID', () => {
  const accounts = Array.from({ length: 5 }, (_, index) => ({
    id: `account-${index}`,
    tinodeUid: `usr-${index}`,
    tinodeUsername: `upgo_${index}`,
  }));

  const batches = buildDirectoryPresenceBatches(accounts, {
    maxQueryLength: 36,
    maxAccountsPerQuery: 2,
  });

  assert.ok(batches.length > 1);
  assert.ok(batches.every(batch => batch.query.length <= 36));
  assert.deepEqual(
    batches.flatMap(batch => batch.uids).sort(),
    accounts.map(account => account.tinodeUid).sort(),
  );
});

test('discovery presence filters foreign users and keeps explicit offline states', () => {
  const accounts = [
    { tinodeUid: 'usr-OnLineA', active: true },
    { tinodeUid: 'usr-offline', active: true },
    { tinodeUid: 'usr-disabled', active: false },
  ];
  const result = presenceSnapshotFromDiscovery(accounts, [
    { user: 'usr-OnLineA', online: true },
    { user: 'usr-offline', online: false },
    { user: 'usr-foreign', online: true },
  ], ['usr-online', 'usr-offline']);

  assert.deepEqual(result, {
    'usr-OnLineA': true,
    'usr-offline': false,
  });
});
