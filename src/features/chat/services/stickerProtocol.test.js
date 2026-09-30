import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  STICKER_HEAD,
  buildStickerTextMarker,
  normalizeStickerMetadata,
  parseStickerMetadata,
  parseStickerTextMarker,
} from './stickerProtocol.js';

const tinodeSource = readFileSync(new URL('./tinodeClient.js', import.meta.url), 'utf8');

test('builds a stable text marker and parses encoded sticker metadata', () => {
  const marker = buildStickerTextMarker({
    id: 'positive-1',
    packId: 'positive',
    version: '1',
  });
  assert.equal(marker, 'vichat-sticker:positive:positive-1:1');
  assert.deepEqual(parseStickerTextMarker(marker), {
    id: 'positive-1',
    stickerId: 'positive-1',
    packId: 'positive',
    label: '',
    version: '1',
  });
});

test('keeps the structured head backward compatible and falls back to text', () => {
  const headValue = JSON.stringify({
    stickerId: 'cat-1',
    packId: 'cat',
    label: 'Mèo cam',
    version: '2',
  });
  assert.equal(STICKER_HEAD, 'x-vichat-sticker');
  assert.deepEqual(parseStickerMetadata({ [STICKER_HEAD]: headValue }, 'ordinary text'), {
    id: 'cat-1',
    stickerId: 'cat-1',
    packId: 'cat',
    label: 'Mèo cam',
    version: '2',
  });
  assert.equal(parseStickerMetadata({}, 'ordinary text'), null);
  assert.equal(parseStickerMetadata({}, 'vichat-sticker:cat:cat-1:2')?.stickerId, 'cat-1');
});

test('built-in stickers publish text markers without the file or S3 path', () => {
  const method = tinodeSource.split('  async sendSticker(')[1].split('  async downloadFile(')[0];
  assert.match(method, /sticker\.custom !== true/);
  assert.match(method, /buildStickerTextMarker/);
  assert.match(method, /this\.sendText/);
  assert.doesNotMatch(method.split('if (sticker.custom !== true)')[1].split('let blob')[0], /sendFile|new File|fetch\(/);
  assert.match(tinodeSource, /parseStickerMetadata\(msg\.head, content\)/);
});

test('rejects incomplete sticker metadata before constructing a marker', () => {
  assert.equal(normalizeStickerMetadata({ id: 'only-id' }), null);
  assert.equal(buildStickerTextMarker({ id: 'only-id' }), '');
  assert.equal(parseStickerTextMarker('vichat-sticker:positive:bad'), null);
});
