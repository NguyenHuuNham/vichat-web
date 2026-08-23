import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONVERSATION_BACKGROUND_PRESETS,
  latestSharedConversationBackground,
  normalizeConversationBackground,
  readConversationBackground,
  validateConversationBackgroundFile,
  writeConversationBackground,
} from './conversationBackground.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

test('background presets normalize and remain scoped per viewer and conversation', () => {
  const storage = memoryStorage();
  const preset = normalizeConversationBackground({ ...CONVERSATION_BACKGROUND_PRESETS[0], kind: 'preset' });
  writeConversationBackground('viewer-a', 'tenant-a', 'conversation-1', preset, storage);

  assert.equal(readConversationBackground('viewer-a', 'tenant-a', 'conversation-1', storage).id, preset.id);
  assert.equal(readConversationBackground('viewer-b', 'tenant-a', 'conversation-1', storage), null);
  assert.equal(readConversationBackground('viewer-a', 'tenant-a', 'conversation-2', storage), null);
});

test('latest shared background event wins, including an explicit reset', () => {
  const background = { ...CONVERSATION_BACKGROUND_PRESETS[1], kind: 'preset' };
  assert.equal(
    latestSharedConversationBackground({
      messages: [
        { type: 'system', systemEvent: { action: 'conversation_background_changed', backgroundId: background.id, backgroundUrl: background.url, backgroundLabel: background.label, backgroundKind: background.kind } },
        { type: 'system', systemEvent: { action: 'conversation_background_changed', backgroundUrl: '' } },
      ],
    }),
    null,
  );
  assert.equal(
    latestSharedConversationBackground({
      messages: [{ type: 'system', systemEvent: { action: 'conversation_background_changed', backgroundId: background.id, backgroundUrl: background.url, backgroundLabel: background.label, backgroundKind: background.kind } }],
    }).id,
    background.id,
  );
});

test('background file validation accepts images and enforces the local group limit', () => {
  assert.equal(validateConversationBackgroundFile({ name: 'wallpaper.jpg', type: 'image/jpeg', size: 1024 }, { localOnly: true }), '');
  assert.match(
    validateConversationBackgroundFile({ name: 'wallpaper.jpg', type: 'image/jpeg', size: 3 * 1024 * 1024 }, { localOnly: true }),
    /2 MB/,
  );
  assert.match(
    validateConversationBackgroundFile({ name: 'wallpaper.pdf', type: 'application/pdf', size: 1024 }, { localOnly: true }),
    /hình ảnh/,
  );
});
