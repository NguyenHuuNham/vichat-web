import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONVERSATION_BACKGROUND_PRESETS,
  CONVERSATION_BACKGROUND_SCOPES,
  latestSharedConversationBackground,
  normalizeConversationBackground,
  readConversationBackground,
  readConversationBackgroundPreference,
  sharedConversationBackgroundFromEvent,
  validateConversationBackgroundFile,
  writeConversationBackgroundPreference,
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
  writeConversationBackgroundPreference(
    'viewer-a',
    'tenant-a',
    'conversation-1',
    CONVERSATION_BACKGROUND_SCOPES.LOCAL,
    preset,
    storage,
  );

  assert.equal(readConversationBackground('viewer-a', 'tenant-a', 'conversation-1', storage).id, preset.id);
  assert.equal(
    readConversationBackgroundPreference('viewer-a', 'tenant-a', 'conversation-1', storage).scope,
    CONVERSATION_BACKGROUND_SCOPES.LOCAL,
  );
  assert.equal(readConversationBackground('viewer-b', 'tenant-a', 'conversation-1', storage), null);
  assert.equal(readConversationBackground('viewer-a', 'tenant-a', 'conversation-2', storage), null);
});

test('a local clear keeps a viewer override over a shared background', () => {
  const storage = memoryStorage();
  writeConversationBackgroundPreference(
    'viewer-a',
    'tenant-a',
    'conversation-1',
    CONVERSATION_BACKGROUND_SCOPES.LOCAL,
    null,
    storage,
  );

  assert.deepEqual(
    readConversationBackgroundPreference('viewer-a', 'tenant-a', 'conversation-1', storage),
    { scope: CONVERSATION_BACKGROUND_SCOPES.LOCAL, background: null },
  );
  assert.equal(readConversationBackground('viewer-a', 'tenant-a', 'conversation-1', storage), null);
});

test('shared preferences retain the shared scope without hiding the value', () => {
  const storage = memoryStorage();
  const preset = normalizeConversationBackground({ ...CONVERSATION_BACKGROUND_PRESETS[2], kind: 'preset' });
  writeConversationBackgroundPreference(
    'viewer-a',
    'tenant-a',
    'conversation-1',
    CONVERSATION_BACKGROUND_SCOPES.SHARED,
    preset,
    storage,
  );

  assert.deepEqual(
    readConversationBackgroundPreference('viewer-a', 'tenant-a', 'conversation-1', storage),
    { scope: CONVERSATION_BACKGROUND_SCOPES.SHARED, background: { ...preset, scope: CONVERSATION_BACKGROUND_SCOPES.SHARED } },
  );
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

test('shared background events are normalized for both direct and group realtime snapshots', () => {
  const background = sharedConversationBackgroundFromEvent({
    action: 'conversation_background_changed',
    backgroundId: 'shared-preset',
    backgroundUrl: 'https://example.test/background.jpg',
    backgroundLabel: 'Shared preset',
    backgroundKind: 'preset',
    updatedAt: '2026-08-24T12:00:00.000Z',
  });

  assert.deepEqual(background, {
    id: 'shared-preset',
    url: 'https://example.test/background.jpg',
    customKey: '',
    label: 'Shared preset',
    kind: 'preset',
    updatedAt: '2026-08-24T12:00:00.000Z',
    scope: CONVERSATION_BACKGROUND_SCOPES.SHARED,
  });
  assert.equal(sharedConversationBackgroundFromEvent({
    action: 'conversation_background_changed',
    backgroundUrl: '',
  }), null);
  assert.equal(sharedConversationBackgroundFromEvent({
    action: 'conversation_background_changed',
    scope: CONVERSATION_BACKGROUND_SCOPES.LOCAL,
    backgroundUrl: 'https://example.test/local-only.jpg',
  }), undefined);
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
