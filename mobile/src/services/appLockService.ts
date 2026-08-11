import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { isValidAppPin } from '../utils/appLockPolicy';

const PIN_HASH_KEY = 'vichat.mobile.app-lock-hash.v1';
const PIN_SALT_KEY = 'vichat.mobile.app-lock-salt.v1';

async function pinHash(pin: string, salt: string) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${pin}`,
  );
}

export const appLockService = {
  async isConfigured() {
    const [hash, salt] = await Promise.all([
      SecureStore.getItemAsync(PIN_HASH_KEY),
      SecureStore.getItemAsync(PIN_SALT_KEY),
    ]);
    return Boolean(hash && salt);
  },

  async setPin(pin: string) {
    if (!isValidAppPin(pin)) throw new Error('Mã PIN phải gồm đúng 4 chữ số.');
    const salt = Crypto.randomUUID();
    const hash = await pinHash(pin, salt);
    await Promise.all([
      SecureStore.setItemAsync(PIN_SALT_KEY, salt, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
      SecureStore.setItemAsync(PIN_HASH_KEY, hash, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    ]);
  },

  async verifyPin(pin: string) {
    if (!isValidAppPin(pin)) return false;
    const [hash, salt] = await Promise.all([
      SecureStore.getItemAsync(PIN_HASH_KEY),
      SecureStore.getItemAsync(PIN_SALT_KEY),
    ]);
    if (!hash || !salt) return false;
    return (await pinHash(pin, salt)) === hash;
  },

  async clearPin() {
    await Promise.all([
      SecureStore.deleteItemAsync(PIN_HASH_KEY),
      SecureStore.deleteItemAsync(PIN_SALT_KEY),
    ]);
  },
};
