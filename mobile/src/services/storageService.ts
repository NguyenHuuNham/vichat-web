import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Session } from '../types';

const TOKEN_KEY = 'vichat.mobile.chatmgt-token.v1';
const SESSION_KEY = 'vichat.mobile.public-session.v1';
const SESSION_STARTED_KEY = 'vichat.mobile.session-started-at.v1';

export const storageService = {
  async saveAccessToken(token: string) {
    if (!token) {
      await Promise.all([
        SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {}),
        AsyncStorage.removeItem(TOKEN_KEY).catch(() => {}),
      ]);
      return;
    }
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } catch {
      // In environments where Keychain is unavailable (such as unsigned builds,
      // free Apple ID sideloading, or iOS Simulator without keychain entitlement),
      // fallback gracefully to AsyncStorage so login and session persistence succeed.
      await AsyncStorage.setItem(TOKEN_KEY, token);
    }
  },

  async loadAccessToken() {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (token) return token;
    } catch {
      // Fallback
    }
    return AsyncStorage.getItem(TOKEN_KEY);
  },

  async savePublicSession(session: Session | null) {
    if (!session) return AsyncStorage.removeItem(SESSION_KEY);
    // Tinode credentials are short-lived and must never be copied to the
    // non-secure public-session cache.
    const safeSession = {
      ...session,
      tinodeAuth: session.tinodeAuth
        ? { ...session.tinodeAuth, token: '' }
        : null,
    };
    return AsyncStorage.setItem(SESSION_KEY, JSON.stringify(safeSession));
  },

  saveSessionStartedAt(value: string) {
    return AsyncStorage.setItem(SESSION_STARTED_KEY, value);
  },

  loadSessionStartedAt() {
    return AsyncStorage.getItem(SESSION_STARTED_KEY);
  },

  async loadPublicSession(): Promise<Session | null> {
    try {
      const value = await AsyncStorage.getItem(SESSION_KEY);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  },

  async clear() {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {}),
      AsyncStorage.removeItem(TOKEN_KEY).catch(() => {}),
      AsyncStorage.removeItem(SESSION_KEY).catch(() => {}),
      AsyncStorage.removeItem(SESSION_STARTED_KEY).catch(() => {}),
    ]);
  },
};
