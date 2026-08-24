export const KEYBOARD_SHORTCUTS_STORAGE_PREFIX = 'vichat.keyboard-shortcuts.v1';

export const SHORTCUT_ACTIONS = Object.freeze([
  Object.freeze({ id: 'closeOverlay', labelKey: 'shortcutClose', descriptionKey: 'shortcutCloseDescription', defaultShortcut: 'Escape' }),
  Object.freeze({ id: 'focusSearch', labelKey: 'shortcutSearch', descriptionKey: 'shortcutSearchDescription', defaultShortcut: 'Mod+K' }),
  Object.freeze({ id: 'focusComposer', labelKey: 'shortcutComposer', descriptionKey: 'shortcutComposerDescription', defaultShortcut: 'Mod+Shift+M' }),
  Object.freeze({ id: 'openContacts', labelKey: 'shortcutContacts', descriptionKey: 'shortcutContactsDescription', defaultShortcut: 'Mod+Shift+O' }),
  Object.freeze({ id: 'openSettings', labelKey: 'shortcutSettings', descriptionKey: 'shortcutSettingsDescription', defaultShortcut: 'Mod+,' }),
  Object.freeze({ id: 'nextConversation', labelKey: 'shortcutNextConversation', descriptionKey: 'shortcutNextConversationDescription', defaultShortcut: 'Alt+ArrowDown' }),
  Object.freeze({ id: 'previousConversation', labelKey: 'shortcutPreviousConversation', descriptionKey: 'shortcutPreviousConversationDescription', defaultShortcut: 'Alt+ArrowUp' }),
]);

const MODIFIER_ORDER = Object.freeze(['Mod', 'Alt', 'Shift']);
const MODIFIER_ALIASES = Object.freeze({
  cmd: 'Mod',
  command: 'Mod',
  control: 'Mod',
  ctrl: 'Mod',
  meta: 'Mod',
  mod: 'Mod',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
});
const KEY_ALIASES = Object.freeze({
  esc: 'Escape',
  return: 'Enter',
  spacebar: 'Space',
  ' ': 'Space',
  del: 'Delete',
  ins: 'Insert',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
});
const PUNCTUATION_KEYS = Object.freeze({
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  ';': 'Semicolon',
  ':': 'Semicolon',
  "'": 'Quote',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  '-': 'Minus',
  '=': 'Equal',
  '`': 'Backquote',
});
const DISPLAY_KEYS = Object.freeze({
  Mod: 'Ctrl/Cmd',
  Escape: 'Esc',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  Backquote: '`',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Delete: 'Del',
  Enter: 'Enter',
  Equal: '=',
  Minus: '-',
  Period: '.',
  Quote: "'",
  Semicolon: ';',
  Slash: '/',
  Space: 'Space',
  Tab: 'Tab',
});

const modifierKeyNames = new Set(['Alt', 'Control', 'Meta', 'Shift']);

export const DEFAULT_KEYBOARD_SHORTCUT_SETTINGS = Object.freeze({
  enabled: true,
  bindings: Object.freeze(Object.fromEntries(
    SHORTCUT_ACTIONS.map(action => [action.id, action.defaultShortcut]),
  )),
});

function normalizedKeyName(value) {
  const input = String(value ?? '');
  const raw = input === ' ' ? input : input.trim();
  if (!raw) return '';
  const alias = KEY_ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  if (raw.length === 1) {
    if (/[a-z]/i.test(raw)) return raw.toUpperCase();
    if (/\d/.test(raw)) return raw;
    return PUNCTUATION_KEYS[raw] || '';
  }
  if (/^f\d{1,2}$/i.test(raw)) return raw.toUpperCase();
  if (/^arrow(up|down|left|right)$/i.test(raw)) {
    const direction = raw.slice(5).toLowerCase();
    return `Arrow${direction[0].toUpperCase()}${direction.slice(1)}`;
  }
  return raw[0].toUpperCase() + raw.slice(1);
}

export function normalizeShortcut(value) {
  if (value === null || value === undefined || value === false || String(value).trim() === '') return null;
  const parts = String(value).split('+').map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const keyPart = parts.pop();
  const modifiers = new Set();
  parts.forEach(part => {
    const modifier = MODIFIER_ALIASES[part.toLowerCase()];
    if (modifier) modifiers.add(modifier);
  });
  const key = normalizedKeyName(keyPart);
  if (!key || modifierKeyNames.has(key) || MODIFIER_ALIASES[key.toLowerCase()]) return null;
  return [
    ...MODIFIER_ORDER.filter(modifier => modifiers.has(modifier)),
    key,
  ].join('+');
}

export function shortcutFromKeyboardEvent(event) {
  if (!event) return null;
  const key = normalizedKeyName(event.key);
  if (!key || modifierKeyNames.has(key)) return null;
  const modifiers = [];
  if (event.ctrlKey || event.metaKey) modifiers.push('Mod');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  return normalizeShortcut([...modifiers, key].join('+'));
}

export function isSafeShortcut(shortcut) {
  const normalized = normalizeShortcut(shortcut);
  return Boolean(normalized && (normalized === 'Escape' || normalized.includes('+')));
}

export function shortcutMatchesEvent(shortcut, event) {
  const expected = normalizeShortcut(shortcut);
  return Boolean(expected && expected === shortcutFromKeyboardEvent(event));
}

export function formatShortcut(shortcut, unassignedLabel = 'Not assigned') {
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) return unassignedLabel;
  return normalized
    .split('+')
    .map(key => DISPLAY_KEYS[key] || key)
    .join(' + ');
}

export function normalizeKeyboardShortcutSettings(value = {}) {
  const rawBindings = value?.bindings && typeof value.bindings === 'object' ? value.bindings : {};
  const bindings = Object.fromEntries(SHORTCUT_ACTIONS.map(action => {
    const hasBinding = Object.prototype.hasOwnProperty.call(rawBindings, action.id);
    const normalized = hasBinding ? normalizeShortcut(rawBindings[action.id]) : action.defaultShortcut;
    return [action.id, isSafeShortcut(normalized) ? normalized : null];
  }));
  return {
    enabled: value?.enabled !== false,
    bindings,
  };
}

function shortcutStorageKey(viewerId) {
  return `${KEYBOARD_SHORTCUTS_STORAGE_PREFIX}.${encodeURIComponent(String(viewerId || 'anonymous'))}`;
}

export function readKeyboardShortcutSettings(viewerId, storage = globalThis?.localStorage) {
  if (!viewerId || !storage) return normalizeKeyboardShortcutSettings(DEFAULT_KEYBOARD_SHORTCUT_SETTINGS);
  try {
    const raw = storage.getItem(shortcutStorageKey(viewerId));
    return normalizeKeyboardShortcutSettings(raw ? JSON.parse(raw) : DEFAULT_KEYBOARD_SHORTCUT_SETTINGS);
  } catch {
    return normalizeKeyboardShortcutSettings(DEFAULT_KEYBOARD_SHORTCUT_SETTINGS);
  }
}

export function writeKeyboardShortcutSettings(viewerId, value, storage = globalThis?.localStorage) {
  const next = normalizeKeyboardShortcutSettings(value);
  if (viewerId && storage) {
    try {
      storage.setItem(shortcutStorageKey(viewerId), JSON.stringify(next));
    } catch {
      // Keep the active tab usable when browser storage is unavailable.
    }
  }
  return next;
}

export function shortcutConflict(bindings, shortcut, excludedActionId = '') {
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) return null;
  return SHORTCUT_ACTIONS.find(action => (
    action.id !== excludedActionId
    && normalizeShortcut(bindings?.[action.id]) === normalized
  ))?.id || null;
}
