import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_KEYBOARD_SHORTCUT_SETTINGS,
  KEYBOARD_SHORTCUTS_STORAGE_PREFIX,
  SHORTCUT_ACTIONS,
  formatShortcut,
  isSafeShortcut,
  normalizeKeyboardShortcutSettings,
  normalizeShortcut,
  readKeyboardShortcutSettings,
  shortcutConflict,
  shortcutFromKeyboardEvent,
  shortcutMatchesEvent,
  writeKeyboardShortcutSettings,
} from './keyboardShortcuts.js';

test('normalizes shortcut modifiers, aliases and punctuation', () => {
  assert.equal(normalizeShortcut('Ctrl + Shift + k'), 'Mod+Shift+K');
  assert.equal(normalizeShortcut('Cmd+,'), 'Mod+Comma');
  assert.equal(normalizeShortcut('Esc'), 'Escape');
  assert.equal(normalizeShortcut('Shift'), null);
  assert.equal(formatShortcut('Mod+ArrowDown'), 'Ctrl/Cmd + ↓');
  assert.equal(isSafeShortcut('Escape'), true);
  assert.equal(isSafeShortcut('A'), false);
});

test('converts browser keyboard events into portable shortcuts', () => {
  assert.equal(shortcutFromKeyboardEvent({ key: 'k', ctrlKey: true }), 'Mod+K');
  assert.equal(shortcutFromKeyboardEvent({ key: 'K', metaKey: true, shiftKey: true }), 'Mod+Shift+K');
  assert.equal(shortcutFromKeyboardEvent({ key: 'Control', ctrlKey: true }), null);
  assert.equal(shortcutFromKeyboardEvent({ key: 'ArrowDown', altKey: true }), 'Alt+ArrowDown');
  assert.equal(shortcutMatchesEvent('Mod+K', { key: 'k', metaKey: true }), true);
  assert.equal(shortcutMatchesEvent('Mod+K', { key: 'k', altKey: true }), false);
});

test('normalizes persisted settings without losing explicit disabled bindings', () => {
  const settings = normalizeKeyboardShortcutSettings({
    enabled: false,
    bindings: { closeOverlay: null, focusSearch: 'Ctrl+K', unknown: 'Alt+X' },
  });
  assert.equal(settings.enabled, false);
  assert.equal(settings.bindings.closeOverlay, null);
  assert.equal(settings.bindings.focusSearch, 'Mod+K');
  assert.equal(settings.bindings.openContacts, DEFAULT_KEYBOARD_SHORTCUT_SETTINGS.bindings.openContacts);
  assert.equal(Object.keys(settings.bindings).length, SHORTCUT_ACTIONS.length);
});

test('persists shortcut settings per viewer and detects conflicts', () => {
  const storage = {
    values: new Map(),
    getItem(key) { return this.values.get(key) || null; },
    setItem(key, value) { this.values.set(key, value); },
  };
  const saved = writeKeyboardShortcutSettings('usrA', {
    bindings: { focusSearch: 'Alt+S' },
  }, storage);
  assert.equal(readKeyboardShortcutSettings('usrA', storage).bindings.focusSearch, 'Alt+S');
  assert.equal(readKeyboardShortcutSettings('usrB', storage).bindings.focusSearch, 'Mod+K');
  assert.equal(shortcutConflict(saved.bindings, 'Escape', 'focusSearch'), 'closeOverlay');
  assert.equal(shortcutConflict(saved.bindings, 'Alt+S', 'focusSearch'), null);
});

test('migrates shortcut settings from an identity alias without deleting the old record', () => {
  const storage = {
    values: new Map([
      [`${KEYBOARD_SHORTCUTS_STORAGE_PREFIX}.legacy%2Fuid`, JSON.stringify({
        enabled: false,
        bindings: { closeOverlay: null, focusSearch: 'Alt+S' },
      })],
    ]),
    getItem(key) { return this.values.get(key) || null; },
    setItem(key, value) { this.values.set(key, value); },
  };

  const migrated = readKeyboardShortcutSettings('account-1', storage, ['legacy/uid']);
  assert.equal(migrated.enabled, false);
  assert.equal(migrated.bindings.closeOverlay, null);
  assert.equal(migrated.bindings.focusSearch, 'Alt+S');
  assert.equal(storage.values.has(`${KEYBOARD_SHORTCUTS_STORAGE_PREFIX}.account-1`), true);
  assert.equal(storage.values.has(`${KEYBOARD_SHORTCUTS_STORAGE_PREFIX}.legacy%2Fuid`), true);
});

test('merges partial binding writes and keeps primary and alias records synchronized', () => {
  const storage = {
    values: new Map(),
    getItem(key) { return this.values.get(key) || null; },
    setItem(key, value) { this.values.set(key, value); },
  };
  writeKeyboardShortcutSettings('account-1', {
    enabled: false,
    bindings: { closeOverlay: null, focusSearch: 'Alt+S' },
  }, storage, ['legacy-uid']);

  const saved = writeKeyboardShortcutSettings('account-1', {
    bindings: { focusComposer: 'Mod+Shift+M' },
  }, storage, ['legacy-uid']);
  assert.equal(saved.enabled, false);
  assert.equal(saved.bindings.closeOverlay, null);
  assert.equal(saved.bindings.focusSearch, 'Alt+S');
  assert.equal(saved.bindings.focusComposer, 'Mod+Shift+M');
  assert.deepEqual(
    JSON.parse(storage.values.get(`${KEYBOARD_SHORTCUTS_STORAGE_PREFIX}.legacy-uid`)),
    JSON.parse(storage.values.get(`${KEYBOARD_SHORTCUTS_STORAGE_PREFIX}.account-1`)),
  );
});
