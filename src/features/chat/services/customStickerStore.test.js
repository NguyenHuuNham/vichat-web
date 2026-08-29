import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CUSTOM_STICKER_MAX_BYTES,
  CUSTOM_STICKER_MAX_ITEMS,
  CUSTOM_STICKER_PACK_ID,
  createCustomStickerRecord,
  deleteCustomSticker,
  normalizeCustomStickerRecord,
  readCustomStickers,
  validateCustomStickerFile,
  writeCustomStickerFiles,
} from './customStickerStore.js';

const pickerSource = readFileSync(new URL('../components/StickerPicker.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../../app/App.jsx', import.meta.url), 'utf8');
const tinodeSource = readFileSync(new URL('./tinodeClient.js', import.meta.url), 'utf8');
const mobileComposerSource = readFileSync(new URL('../../../../mobile/src/screens/chat/ChatDetailScreen.tsx', import.meta.url), 'utf8');

function createIndexedDbStub() {
  const records = new Map();
  let storeCreated = false;
  let indexCreated = false;

  const createStore = transaction => ({
    indexNames: { contains: name => name === 'viewerId' && indexCreated },
    createIndex() { indexCreated = true; },
    put(record) { records.set(record.key, structuredClone(record)); },
    delete(key) {
      const request = {};
      queueMicrotask(() => {
        records.delete(key);
        request.onsuccess?.();
      });
      return request;
    },
    index() {
      return {
        getAll(viewerId) {
          const request = {};
          queueMicrotask(() => {
            request.result = [...records.values()].filter(record => record.viewerId === viewerId);
            request.onsuccess?.();
          });
          return request;
        },
      };
    },
    transaction,
  });

  const database = {
    objectStoreNames: { contains: () => storeCreated },
    createObjectStore() {
      storeCreated = true;
      return createStore(null);
    },
    transaction(_storeName, mode) {
      const transaction = {
        objectStore: () => createStore(transaction),
      };
      if (mode === 'readwrite') queueMicrotask(() => transaction.oncomplete?.());
      return transaction;
    },
    close() {},
  };

  return {
    records,
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = database;
        if (!storeCreated) {
          request.transaction = { objectStore: () => createStore(request.transaction) };
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });
      return request;
    },
  };
}

test('accepts bounded raster sticker formats and rejects unsupported files', () => {
  assert.equal(validateCustomStickerFile(new File(['png'], 'hello.png', { type: 'image/png' })), '');
  assert.equal(validateCustomStickerFile(new File(['gif'], 'hello.gif', { type: '' })), '');
  assert.equal(
    validateCustomStickerFile(new File(['svg'], 'hello.svg', { type: 'image/svg+xml' })),
    'Chỉ hỗ trợ ảnh PNG, JPG, WEBP, GIF hoặc AVIF.',
  );
  assert.equal(
    validateCustomStickerFile({ name: 'large.webp', type: 'image/webp', size: CUSTOM_STICKER_MAX_BYTES + 1 }),
    'Mỗi sticker phải nhỏ hơn hoặc bằng 2 MB.',
  );
  assert.equal(CUSTOM_STICKER_MAX_ITEMS, 48);
});

test('creates a viewer-scoped custom sticker record without persisting an object URL', () => {
  const file = new File(['image'], '  hello_team.webp  ', {
    type: 'image/webp',
    lastModified: 123,
  });
  const record = createCustomStickerRecord('viewer/one', file, 2, 1_787_684_400_000);

  assert.match(record.id, /^custom-/);
  assert.equal(record.id.length <= 80, true);
  assert.equal(record.key.startsWith('viewer%2Fone:'), true);
  assert.equal(record.packId, CUSTOM_STICKER_PACK_ID);
  assert.equal(record.label, 'hello team');
  assert.equal(record.mime, 'image/webp');
  assert.equal(record.custom, true);
  assert.equal(record.blob instanceof Blob, true);
  assert.equal(Object.hasOwn(record, 'src'), false);
});

test('normalizes stored records and degrades cleanly when IndexedDB is unavailable', async () => {
  const normalized = normalizeCustomStickerRecord({
    key: 'ignored',
    viewerId: 'viewer-a',
    id: 'custom-one',
    label: 'One',
    mime: 'image/png',
    fileName: 'one.png',
    blob: new Blob(['one'], { type: 'image/png' }),
    createdAt: '2026-08-25T00:00:00.000Z',
  });

  assert.equal(normalized.key, 'viewer-a:custom-one');
  assert.equal(normalized.packId, CUSTOM_STICKER_PACK_ID);
  assert.equal(normalizeCustomStickerRecord({ id: 'missing-blob', viewerId: 'viewer-a' }), null);
  assert.deepEqual(await readCustomStickers('viewer-a', null), []);
  assert.equal(await deleteCustomSticker('viewer-a', 'custom-one', null), false);
});

test('writes, reads, de-duplicates and deletes viewer-scoped stickers', async () => {
  const indexedDb = createIndexedDbStub();
  const first = new File(['one'], 'one.png', { type: 'image/png', lastModified: 1 });
  const second = new File(['two'], 'two.webp', { type: 'image/webp', lastModified: 2 });
  const saved = await writeCustomStickerFiles('viewer-a', [first, second], indexedDb);

  assert.equal(saved.added.length, 2);
  assert.equal((await readCustomStickers('viewer-a', indexedDb)).length, 2);
  assert.equal((await readCustomStickers('viewer-b', indexedDb)).length, 0);

  const duplicate = await writeCustomStickerFiles('viewer-a', [first], indexedDb);
  assert.equal(duplicate.added.length, 0);
  assert.equal(duplicate.duplicateCount, 1);

  assert.equal(await deleteCustomSticker('viewer-a', saved.added[0].id, indexedDb), true);
  assert.equal((await readCustomStickers('viewer-a', indexedDb)).length, 1);
});

test('rejects a batch that would exceed the per-account library limit', async () => {
  const indexedDb = createIndexedDbStub();
  const files = Array.from({ length: CUSTOM_STICKER_MAX_ITEMS + 1 }, (_, index) => (
    new File([String(index)], `sticker-${index}.png`, { type: 'image/png', lastModified: index + 1 })
  ));
  await assert.rejects(
    writeCustomStickerFiles('viewer-limit', files, indexedDb),
    new RegExp(`tối đa ${CUSTOM_STICKER_MAX_ITEMS} sticker`),
  );
  assert.deepEqual(await readCustomStickers('viewer-limit', indexedDb), []);
});

test('wires upload, delete and blob transport into the web picker without changing mobile', () => {
  assert.match(pickerSource, /writeCustomStickerFiles\(uploadScope, files, undefined, uploadScopeAliases, uploadTenantId\)/);
  assert.match(pickerSource, /deleteCustomSticker\(deleteScope, sticker\.id, undefined, deleteScopeAliases, deleteTenantId\)/);
  assert.match(pickerSource, /multiple/);
  assert.match(pickerSource, /CUSTOM_STICKER_PACK_ID/);
  assert.match(appSource, /const stickerBlob = sticker\.blob/);
  assert.match(appSource, /sticker: stickerMetadata/);
  assert.match(tinodeSource, /let blob = sticker\.blob/);
  assert.doesNotMatch(mobileComposerSource, /customSticker|Sticker của tôi|CUSTOM_STICKER/);
});

test('copies custom stickers from an identity alias and deletes all identity copies', async () => {
  const indexedDb = createIndexedDbStub();
  const file = new File(['legacy'], 'legacy.png', { type: 'image/png', lastModified: 8 });
  const saved = await writeCustomStickerFiles('legacy-uid', [file], indexedDb);
  const stickerId = saved.added[0].id;

  const migrated = await readCustomStickers('account-1', indexedDb, ['legacy-uid']);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].id, stickerId);
  assert.equal(indexedDb.records.has(`account-1:${stickerId}`), true);
  assert.equal(indexedDb.records.has(`legacy-uid:${stickerId}`), true);

  await deleteCustomSticker('account-1', stickerId, indexedDb, ['legacy-uid']);
  assert.equal(indexedDb.records.has(`account-1:${stickerId}`), false);
  assert.equal(indexedDb.records.has(`legacy-uid:${stickerId}`), false);
});
