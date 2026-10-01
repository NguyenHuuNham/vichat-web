import AsyncStorage from '@react-native-async-storage/async-storage';
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

async function getStoreItem(key: string): Promise<string | null> {
  try {
    const value = await SecureStore.getItemAsync(key);
    if (value) return value;
  } catch {
    // Fallback to AsyncStorage when Keychain is unavailable
  }
  return AsyncStorage.getItem(key);
}

async function setStoreItem(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    await AsyncStorage.setItem(key, value);
  }
}

async function deleteStoreItem(key: string): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(key).catch(() => {}),
    AsyncStorage.removeItem(key).catch(() => {}),
  ]);
}

export const appLockService = {
  async isConfigured() {
    const [hash, salt] = await Promise.all([
      getStoreItem(PIN_HASH_KEY),
      getStoreItem(PIN_SALT_KEY),
    ]);
    return Boolean(hash && salt);
  },

  async setPin(pin: string) {
    if (!isValidAppPin(pin)) throw new Error('Mã PIN phải gồm đúng 4 chữ số.');
    const salt = Crypto.randomUUID();
    const hash = await pinHash(pin, salt);
    await Promise.all([
      setStoreItem(PIN_SALT_KEY, salt),
      setStoreItem(PIN_HASH_KEY, hash),
    ]);
  },

  async verifyPin(pin: string) {
    if (!isValidAppPin(pin)) return false;
    const [hash, salt] = await Promise.all([
      getStoreItem(PIN_HASH_KEY),
      getStoreItem(PIN_SALT_KEY),
    ]);
    if (!hash || !salt) return false;
    return (await pinHash(pin, salt)) === hash;
  },

  async clearPin() {
    await Promise.all([
      deleteStoreItem(PIN_HASH_KEY),
      deleteStoreItem(PIN_SALT_KEY),
    ]);
  },
};
