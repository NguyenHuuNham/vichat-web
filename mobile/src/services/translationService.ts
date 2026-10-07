import { config } from '../constants/config';
import { TranslationLanguage } from '../types';

const MAX_TRANSLATION_CHARS = 5000;
const TRANSLATION_TIMEOUT_MS = 15000;
const MAX_CACHE_ENTRIES = 500;

const translationCache = new Map<string, { text: string; sourceLanguage: TranslationLanguage }>();
const pendingRequests = new Map<string, Promise<{ text: string; sourceLanguage: TranslationLanguage }>>();

function cacheKey(text: string, sourceLanguage: TranslationLanguage, targetLanguage: TranslationLanguage) {
  return `${sourceLanguage}:${targetLanguage}:${text}`;
}

export function detectTranslationSource(text: string): TranslationLanguage {
  const value = String(text || '').trim();
  return /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu.test(value)
    || /\b(?:xin\s+chao|chào|bạn|mình|tôi|đang|không|được|và|là|có|của|nhóm|tin|nhắn)\b/iu.test(value)
    ? 'vi'
    : 'en';
}

export function defaultTranslationTarget(text: string, currentLanguage: TranslationLanguage): TranslationLanguage {
  const sourceLanguage = detectTranslationSource(text);
  return sourceLanguage === currentLanguage ? (currentLanguage === 'vi' ? 'en' : 'vi') : currentLanguage;
}

function remember(key: string, value: { text: string; sourceLanguage: TranslationLanguage }) {
  translationCache.delete(key);
  translationCache.set(key, value);
  while (translationCache.size > MAX_CACHE_ENTRIES) {
    const oldest = translationCache.keys().next().value;
    if (!oldest) break;
    translationCache.delete(oldest);
  }
}

async function requestTranslation(text: string, sourceLanguage: TranslationLanguage, targetLanguage: TranslationLanguage) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSLATION_TIMEOUT_MS);
  try {
    const query = `${config.translationApiUrl}?q=${encodeURIComponent(text)}&langpair=${sourceLanguage}%7C${targetLanguage}`;
    const response = await fetch(query, { signal: controller.signal, headers: { Accept: 'application/json' } });
    const payload: any = await response.json().catch(() => ({}));
    const translated = String(payload?.responseData?.translatedText || '').trim();
    const responseStatus = String(payload?.responseStatus ?? response.status);
    if (!response.ok || responseStatus !== '200' || !translated || /invalid source language|quota finished|error/i.test(translated)) {
      throw new Error('Dịch tin nhắn tạm thời không khả dụng.');
    }
    return { text: translated, sourceLanguage };
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error('Dịch tin nhắn quá thời gian.', { cause: error });
    throw error instanceof Error ? error : new Error('Dịch tin nhắn tạm thời không khả dụng.', { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

export async function translateText(text: string, targetLanguage: TranslationLanguage) {
  const value = String(text || '').trim();
  if (!value) throw new Error('Không có nội dung để dịch.');
  if (value.length > MAX_TRANSLATION_CHARS) throw new Error('Tin nhắn quá dài để dịch.');

  const sourceLanguage = detectTranslationSource(value);
  const key = cacheKey(value, sourceLanguage, targetLanguage);
  if (sourceLanguage === targetLanguage) return { text: value, sourceLanguage };
  const cached = translationCache.get(key);
  if (cached) return cached;
  const pending = pendingRequests.get(key);
  if (pending) return pending;

  const request = requestTranslation(value, sourceLanguage, targetLanguage).then(result => {
    remember(key, result);
    return result;
  }).finally(() => {
    if (pendingRequests.get(key) === request) pendingRequests.delete(key);
  });
  pendingRequests.set(key, request);
  return request;
}

export function clearTranslationCache() {
  translationCache.clear();
  pendingRequests.clear();
}
