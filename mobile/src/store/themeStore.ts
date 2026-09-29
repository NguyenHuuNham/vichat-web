import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const THEME_KEY = 'vichat.mobile.theme-mode.v1';
let appearanceSubscription: { remove: () => void } | null = null;

function resolveTheme(mode: ThemeMode, systemTheme = Appearance.getColorScheme()): ResolvedTheme {
  if (mode === 'system') return systemTheme === 'dark' ? 'dark' : 'light';
  return mode;
}

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  initialized: boolean;
  initialize: () => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'system',
  resolved: resolveTheme('system'),
  initialized: false,

  async initialize() {
    if (get().initialized) return;
    let mode: ThemeMode = 'system';
    try {
      const saved = await AsyncStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') mode = saved;
    } catch {
      // Use the device appearance when the local preference is unavailable.
    }
    set({ mode, resolved: resolveTheme(mode), initialized: true });
    appearanceSubscription?.remove();
    appearanceSubscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (get().mode === 'system') set({ resolved: resolveTheme('system', colorScheme) });
    });
  },

  async setMode(mode) {
    set({ mode, resolved: resolveTheme(mode) });
    try {
      await AsyncStorage.setItem(THEME_KEY, mode);
    } catch {
      // The in-memory theme still applies for the current session.
    }
  },
}));
