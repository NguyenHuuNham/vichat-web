import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import {
  PIN_VALIDATION_ERRORS,
  clearPinTabAccess,
  createPinConfig,
  hasPinTabAccess,
  markPinTabUnlocked,
  readPinConfig,
  removePinConfig,
  validatePin,
  verifyPin,
  writePinConfig,
} from './pinLock.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test('validates numeric PINs without accepting plaintext shortcuts', () => {
  assert.equal(validatePin(''), PIN_VALIDATION_ERRORS.REQUIRED);
  assert.equal(validatePin('12a4'), PIN_VALIDATION_ERRORS.DIGITS_ONLY);
  assert.equal(validatePin('123'), PIN_VALIDATION_ERRORS.LENGTH);
  assert.equal(validatePin('1234567'), PIN_VALIDATION_ERRORS.LENGTH);
  assert.equal(validatePin('0123'), '');
});

test('creates, persists and verifies a salted PIN hash per viewer', async () => {
  const localStorage = memoryStorage();
  const config = await createPinConfig('0123', webcrypto);

  assert.equal(config.enabled, true);
  assert.equal(config.salt.length > 0, true);
  assert.equal(config.hash.length > 0, true);
  assert.equal('pin' in config, false);
  assert.equal(writePinConfig('usrA', config, localStorage), true);
  assert.deepEqual(readPinConfig('usrA', localStorage), config);
  assert.equal(await verifyPin('0123', config, webcrypto), true);
  assert.equal(await verifyPin('0124', config, webcrypto), false);
  assert.equal(readPinConfig('usrB', localStorage), null);
  assert.equal(removePinConfig('usrA', localStorage), true);
  assert.equal(readPinConfig('usrA', localStorage), null);
});

test('keeps tab access separate from the persisted PIN configuration', () => {
  const sessionStorage = memoryStorage();
  assert.equal(hasPinTabAccess('usrA', sessionStorage), false);
  assert.equal(markPinTabUnlocked('legacy-uid', sessionStorage), true);
  assert.equal(hasPinTabAccess('usrA', sessionStorage, ['legacy-uid']), true);
  assert.equal(sessionStorage.getItem('vichat.pin-tab.v1.usrA'), 'unlocked');
  assert.equal(hasPinTabAccess('usrB', sessionStorage), false);
  assert.equal(clearPinTabAccess('usrA', sessionStorage, ['legacy-uid']), true);
  assert.equal(hasPinTabAccess('usrA', sessionStorage, ['legacy-uid']), false);
});

test('migrates PIN configuration from an identity alias and removes all copies explicitly', async () => {
  const localStorage = memoryStorage();
  const config = await createPinConfig('0123', webcrypto);
  assert.equal(writePinConfig('legacy-uid', config, localStorage), true);
  assert.deepEqual(readPinConfig('account-1', localStorage, ['legacy-uid']), config);
  assert.equal(localStorage.getItem('vichat.pin-lock.v1.account-1') !== null, true);
  assert.equal(localStorage.getItem('vichat.pin-lock.v1.legacy-uid') !== null, true);
  assert.equal(removePinConfig('account-1', localStorage, ['legacy-uid']), true);
  assert.equal(readPinConfig('account-1', localStorage, ['legacy-uid']), null);
});
