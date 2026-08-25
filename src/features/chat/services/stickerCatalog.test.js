import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STICKER_ITEMS,
  STICKER_PACKS,
  filterStickers,
  forgetStickerId,
  readRecentStickerIds,
  recentStickerStorageKey,
  rememberStickerId,
  stickerById,
  stickerPackById,
  suggestStickersForText,
} from './stickerCatalog.js';

test('contains the twenty categorized sticker packs and all extracted assets', () => {
  assert.equal(STICKER_PACKS.length, 20);
  assert.equal(STICKER_ITEMS.length, 272);
  assert.equal(new Set(STICKER_ITEMS.map(item => item.id)).size, STICKER_ITEMS.length);
  assert.ok(STICKER_ITEMS.every(item => item.src.startsWith('/stickers/puppysoft/')));
  assert.equal(stickerById('positive-1')?.packId, 'positive');
  assert.equal(stickerPackById('quick-actions')?.items.length, 8);
  assert.equal(stickerPackById('chick')?.items.length, 16);
  assert.equal(stickerById('cat-16')?.label, 'Baiii');
  assert.equal(stickerPackById('frog-v2')?.items.length, 16);
  assert.equal(stickerById('corgi-1')?.label, 'Alo alo');
  assert.equal(stickerById('pink-bunny-16')?.label, 'Byeee');
  assert.equal(stickerById('axolotl-16')?.label, 'Hẹn gặp');
  assert.equal(new Set(STICKER_PACKS.slice(10).map(pack => pack.items.length)).size, 1);
  assert.equal(STICKER_PACKS.slice(10).every(pack => pack.items.every(item => item.src.endsWith('.png'))), true);
});

test('filters stickers by Vietnamese label and keyword without changing the catalog', () => {
  const result = filterStickers(STICKER_ITEMS, 'cảm ơn');
  assert.deepEqual(result.map(item => item.id), ['positive-4', 'axolotl-15']);
  assert.equal(STICKER_ITEMS.length, 272);
  assert.equal(filterStickers(STICKER_ITEMS, 'deadline')[0]?.id, 'attention-5');
  assert.equal(filterStickers(STICKER_ITEMS, 'cà phê')[0]?.id, 'capybara-1');
});

test('suggests stickers from the current message without changing the catalog', () => {
  assert.equal(suggestStickersForText('deadline ngày mai')[0]?.id, 'attention-5');
  assert.equal(suggestStickersForText('Cảm ơn bạn')[0]?.id, 'positive-4');
  assert.deepEqual(suggestStickersForText('a'), []);
  assert.equal(STICKER_ITEMS.length, 272);
});

test('scopes recent sticker storage by account', () => {
  assert.equal(recentStickerStorageKey('account-1'), 'vichat.stickers.recent.v1:account-1');
  assert.notEqual(recentStickerStorageKey('account-1'), recentStickerStorageKey('account-2'));
});

test('keeps custom sticker ids in recent history and removes them with the library item', () => {
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem(key) { return values.get(key) || null; },
      setItem(key, value) { values.set(key, value); },
    },
  };
  try {
    assert.deepEqual(rememberStickerId('account-1', 'custom-one'), ['custom-one']);
    assert.deepEqual(rememberStickerId('account-1', 'positive-1'), ['positive-1', 'custom-one']);
    assert.deepEqual(readRecentStickerIds('account-1'), ['positive-1', 'custom-one']);
    assert.deepEqual(forgetStickerId('account-1', 'custom-one'), ['positive-1']);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
