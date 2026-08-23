import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STICKER_ITEMS,
  STICKER_PACKS,
  filterStickers,
  recentStickerStorageKey,
  stickerById,
  stickerPackById,
} from './stickerCatalog.js';

test('contains the ten categorized sticker packs and all extracted assets', () => {
  assert.equal(STICKER_PACKS.length, 10);
  assert.equal(STICKER_ITEMS.length, 112);
  assert.equal(new Set(STICKER_ITEMS.map(item => item.id)).size, STICKER_ITEMS.length);
  assert.ok(STICKER_ITEMS.every(item => item.src.startsWith('/stickers/puppysoft/')));
  assert.equal(stickerById('positive-1')?.packId, 'positive');
  assert.equal(stickerPackById('quick-actions')?.items.length, 8);
  assert.equal(stickerPackById('chick')?.items.length, 16);
  assert.equal(stickerById('cat-16')?.label, 'Baiii');
});

test('filters stickers by Vietnamese label and keyword without changing the catalog', () => {
  const result = filterStickers(STICKER_ITEMS, 'cảm ơn');
  assert.deepEqual(result.map(item => item.id), ['positive-4']);
  assert.equal(STICKER_ITEMS.length, 112);
  assert.equal(filterStickers(STICKER_ITEMS, 'deadline')[0]?.id, 'attention-5');
});

test('scopes recent sticker storage by account', () => {
  assert.equal(recentStickerStorageKey('account-1'), 'vichat.stickers.recent.v1:account-1');
  assert.notEqual(recentStickerStorageKey('account-1'), recentStickerStorageKey('account-2'));
});
