import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));

import { useThemeStore } from './themeStore';

describe('mobile theme store', () => {
  beforeEach(() => {
    storage.getItem.mockResolvedValue(null);
    storage.setItem.mockResolvedValue(undefined);
    useThemeStore.setState({ mode: 'system', resolved: 'light', initialized: false });
  });

  it('initializes system theme without passing null to Android Appearance', async () => {
    await expect(useThemeStore.getState().initialize()).resolves.toBeUndefined();
    expect(useThemeStore.getState().mode).toBe('system');
    expect(useThemeStore.getState().resolved).toBe('light');
  });

  it('persists an explicit light or dark choice', async () => {
    await useThemeStore.getState().setMode('dark');
    expect(useThemeStore.getState().resolved).toBe('dark');
    expect(storage.setItem).toHaveBeenCalledWith('vichat.mobile.theme-mode.v1', 'dark');
  });
});
