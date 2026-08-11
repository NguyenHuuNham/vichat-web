import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Session } from '../types';

const TOKEN_KEY = 'vichat.mobile.chatmgt-token.v1';
const SESSION_KEY = 'vichat.mobile.public-session.v1';
const SESSION_STARTED_KEY = 'vichat.mobile.session-started-at.v1';

export const storageService = {
  async saveAccessToken(token: string) {
    if (!token) return SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.setItemAsync(TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  loadAccessToken() {
    return SecureStore.getItemAsync(TOKEN_KEY);
  },

  async savePublicSession(session: Session | null) {
    if (!session) return AsyncStorage.removeItem(SESSION_KEY);
    return AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
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
      SecureStore.deleteItemAsync(TOKEN_KEY),
      AsyncStorage.removeItem(SESSION_KEY),
      AsyncStorage.removeItem(SESSION_STARTED_KEY),
    ]);
  },
};
