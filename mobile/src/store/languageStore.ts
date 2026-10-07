import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { create } from 'zustand';
import { AppLanguage, createTranslator } from '../i18n';

const LANGUAGE_KEY = 'vichat.mobile.language.v1';

interface LanguageState {
  language: AppLanguage;
  initialized: boolean;
  initialize: () => Promise<void>;
  setLanguage: (language: AppLanguage) => Promise<void>;
}

export const useLanguageStore = create<LanguageState>((set, get) => ({
  language: 'vi',
  initialized: false,

  async initialize() {
    if (get().initialized) return;
    let language: AppLanguage = 'vi';
    try {
      const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
      if (saved === 'vi' || saved === 'en') language = saved;
    } catch {
      // Vietnamese remains the safe default when local preferences are unavailable.
    }
    set({ language, initialized: true });
  },

  async setLanguage(language) {
    set({ language });
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // Keep the current session localized even if persistence is unavailable.
    }
  },
}));

export function useI18n() {
  const language = useLanguageStore(state => state.language);
  const t = useMemo(() => createTranslator(language), [language]);
  return { language, locale: language === 'en' ? 'en-US' : 'vi-VN', t };
}
