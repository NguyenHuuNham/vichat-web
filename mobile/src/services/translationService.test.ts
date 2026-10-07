import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearTranslationCache, defaultTranslationTarget, detectTranslationSource, translateText } from './translationService';

describe('mobile translation service', () => {
  afterEach(() => {
    clearTranslationCache();
    vi.unstubAllGlobals();
  });

  it('detects Vietnamese text and translates it to English', async () => {
    expect(detectTranslationSource('Xin chào bạn')).toBe('vi');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ responseStatus: 200, responseData: { translatedText: 'Hello' } }),
    }));

    await expect(translateText('Xin chào bạn', 'en')).resolves.toEqual({ text: 'Hello', sourceLanguage: 'vi' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not call the network when the target matches the detected source', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(translateText('Hello', 'en')).resolves.toEqual({ text: 'Hello', sourceLanguage: 'en' });
    expect(request).not.toHaveBeenCalled();
  });

  it('defaults a message translation to the opposite language when it matches the UI language', () => {
    expect(defaultTranslationTarget('Xin chào bạn', 'vi')).toBe('en');
    expect(defaultTranslationTarget('Hello team', 'vi')).toBe('vi');
    expect(defaultTranslationTarget('Xin chào bạn', 'en')).toBe('en');
  });

  it('rejects provider errors instead of displaying an empty translation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ responseStatus: 403, responseData: { translatedText: 'quota finished' } }),
    }));
    await expect(translateText('Xin chào', 'en')).rejects.toThrow('Dịch tin nhắn tạm thời không khả dụng.');
  });
});
