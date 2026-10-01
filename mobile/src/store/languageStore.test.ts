import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));

import { translateUiText } from '../i18n';
import { useLanguageStore } from './languageStore';

describe('mobile language store', () => {
  beforeEach(() => {
    storage.getItem.mockResolvedValue(null);
    storage.setItem.mockResolvedValue(undefined);
    useLanguageStore.setState({ language: 'vi', initialized: false });
  });

  it('keeps Vietnamese as the default and persists English', async () => {
    await useLanguageStore.getState().initialize();
    expect(useLanguageStore.getState().language).toBe('vi');

    await useLanguageStore.getState().setLanguage('en');
    expect(useLanguageStore.getState().language).toBe('en');
    expect(storage.setItem).toHaveBeenCalledWith('vichat.mobile.language.v1', 'en');
    expect(translateUiText('Cài đặt', 'en')).toBe('Settings');
    expect(translateUiText('Cài đặt', 'vi')).toBe('Cài đặt');
    expect(translateUiText('Dịch trò chuyện', 'en')).toBe('Translate conversation');
    expect(translateUiText('PRIVATE STORAGE', 'en')).toBe('PRIVATE STORAGE');
    expect(translateUiText('3 thành viên', 'en')).toBe('3 members');
  });

  it('restores a supported saved language only', async () => {
    storage.getItem.mockResolvedValueOnce('en');
    await useLanguageStore.getState().initialize();
    expect(useLanguageStore.getState().language).toBe('en');

    useLanguageStore.setState({ language: 'vi', initialized: false });
    storage.getItem.mockResolvedValueOnce('fr');
    await useLanguageStore.getState().initialize();
    expect(useLanguageStore.getState().language).toBe('vi');
  });
});
