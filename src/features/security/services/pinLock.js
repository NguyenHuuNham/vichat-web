export const PIN_LOCK_STORAGE_PREFIX = 'vichat.pin-lock.v1';
export const PIN_TAB_STORAGE_PREFIX = 'vichat.pin-tab.v1';
export const PIN_LENGTH_MIN = 4;
export const PIN_LENGTH_MAX = 6;
export const PIN_HASH_ITERATIONS = 120000;

export const PIN_VALIDATION_ERRORS = Object.freeze({
  REQUIRED: 'PIN_REQUIRED',
  DIGITS_ONLY: 'PIN_DIGITS_ONLY',
  LENGTH: 'PIN_LENGTH',
});

function browserStorage(name) {
  try {
    return globalThis?.[name] || null;
  } catch {
    return null;
  }
}

function browserCrypto(provider) {
  return provider || globalThis?.crypto || null;
}

function storageKey(prefix, viewerId) {
  return `${prefix}.${encodeURIComponent(String(viewerId || ''))}`;
}

function encodeBase64(bytes) {
  if (typeof btoa !== 'function') throw new Error('PIN_CRYPTO_UNAVAILABLE');
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeBase64(value) {
  if (typeof atob !== 'function' || typeof value !== 'string') return null;
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function isStorageAvailable(storage) {
  return Boolean(storage?.getItem && storage?.setItem && storage?.removeItem);
}

function isPinConfig(value) {
  const salt = decodeBase64(value?.salt);
  const hash = decodeBase64(value?.hash);
  return Boolean(
    value
    && value.version === 1
    && value.enabled === true
    && value.algorithm === 'PBKDF2-SHA-256'
    && Number.isInteger(value.iterations)
    && value.iterations >= 10000
    && value.iterations <= 1000000
    && salt?.length === 16
    && hash?.length === 32
  );
}

export function validatePin(pin) {
  const value = String(pin ?? '');
  if (!value) return PIN_VALIDATION_ERRORS.REQUIRED;
  if (!/^\d+$/.test(value)) return PIN_VALIDATION_ERRORS.DIGITS_ONLY;
  if (value.length < PIN_LENGTH_MIN || value.length > PIN_LENGTH_MAX) {
    return PIN_VALIDATION_ERRORS.LENGTH;
  }
  return '';
}

async function hashPin(pin, salt, iterations, cryptoProvider) {
  const provider = browserCrypto(cryptoProvider);
  if (!provider?.subtle || typeof TextEncoder === 'undefined') {
    throw new Error('PIN_CRYPTO_UNAVAILABLE');
  }
  const key = await provider.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(pin)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await provider.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function createPinConfig(pin, cryptoProvider) {
  const validationError = validatePin(pin);
  if (validationError) throw new Error(validationError);
  const provider = browserCrypto(cryptoProvider);
  if (!provider?.getRandomValues) throw new Error('PIN_CRYPTO_UNAVAILABLE');
  const salt = new Uint8Array(16);
  provider.getRandomValues(salt);
  const hash = await hashPin(pin, salt, PIN_HASH_ITERATIONS, provider);
  return {
    version: 1,
    enabled: true,
    algorithm: 'PBKDF2-SHA-256',
    iterations: PIN_HASH_ITERATIONS,
    salt: encodeBase64(salt),
    hash: encodeBase64(hash),
    createdAt: new Date().toISOString(),
  };
}

export function readPinConfig(viewerId, storage = browserStorage('localStorage')) {
  if (!viewerId || !isStorageAvailable(storage)) return null;
  try {
    const raw = storage.getItem(storageKey(PIN_LOCK_STORAGE_PREFIX, viewerId));
    if (!raw) return null;
    const config = JSON.parse(raw);
    return isPinConfig(config) ? config : null;
  } catch {
    return null;
  }
}

export function writePinConfig(viewerId, config, storage = browserStorage('localStorage')) {
  if (!viewerId || !isStorageAvailable(storage) || !isPinConfig(config)) return false;
  try {
    storage.setItem(storageKey(PIN_LOCK_STORAGE_PREFIX, viewerId), JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

export function removePinConfig(viewerId, storage = browserStorage('localStorage')) {
  if (!viewerId || !isStorageAvailable(storage)) return false;
  try {
    storage.removeItem(storageKey(PIN_LOCK_STORAGE_PREFIX, viewerId));
    return true;
  } catch {
    return false;
  }
}

export async function verifyPin(pin, config, cryptoProvider) {
  if (validatePin(pin) || !isPinConfig(config)) return false;
  try {
    const salt = decodeBase64(config.salt);
    const expected = decodeBase64(config.hash);
    const actual = await hashPin(pin, salt, config.iterations, cryptoProvider);
    if (!expected || actual.length !== expected.length) return false;
    let difference = 0;
    actual.forEach((byte, index) => { difference |= byte ^ expected[index]; });
    return difference === 0;
  } catch {
    return false;
  }
}

export function hasPinTabAccess(viewerId, storage = browserStorage('sessionStorage')) {
  if (!viewerId || !isStorageAvailable(storage)) return false;
  try {
    return storage.getItem(storageKey(PIN_TAB_STORAGE_PREFIX, viewerId)) === 'unlocked';
  } catch {
    return false;
  }
}

export function markPinTabUnlocked(viewerId, storage = browserStorage('sessionStorage')) {
  if (!viewerId || !isStorageAvailable(storage)) return false;
  try {
    storage.setItem(storageKey(PIN_TAB_STORAGE_PREFIX, viewerId), 'unlocked');
    return true;
  } catch {
    return false;
  }
}

export function clearPinTabAccess(viewerId, storage = browserStorage('sessionStorage')) {
  if (!viewerId || !isStorageAvailable(storage)) return false;
  try {
    storage.removeItem(storageKey(PIN_TAB_STORAGE_PREFIX, viewerId));
    return true;
  } catch {
    return false;
  }
}
