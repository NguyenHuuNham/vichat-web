import { config } from '../constants/config';
import { FileAttachment } from '../types';
import { tinodeClient } from './tinodeClient';

const transcriptionCache = new Map<string, string>();
const pendingTranscriptions = new Map<string, Promise<string>>();

export function getAudioCacheKey(file: FileAttachment, messageId?: string): string {
  return String(file.url || messageId || file.name || '').trim();
}

export function getCachedTranscription(file: FileAttachment, messageId?: string): string | null {
  const key = getAudioCacheKey(file, messageId);
  return transcriptionCache.get(key) || null;
}

export function setCachedTranscription(file: FileAttachment, text: string, messageId?: string): void {
  const key = getAudioCacheKey(file, messageId);
  if (key && text) {
    transcriptionCache.set(key, text.trim());
  }
}

/**
 * Chuyển đổi tin nhắn thoại thành văn bản (Speech-to-Text).
 * Kết quả được lưu vào cache để lần sau mở lại tức thì 0ms.
 */
export async function transcribeAudioMessage(file: FileAttachment, messageId?: string): Promise<string> {
  const key = getAudioCacheKey(file, messageId);
  if (!key) throw new Error('Không xác định được tệp âm thanh cần chuyển đổi.');

  const cached = transcriptionCache.get(key);
  if (cached) return cached;

  const pending = pendingTranscriptions.get(key);
  if (pending) return pending;

  const request = (async () => {
    // 1. Tải hoặc lấy tệp âm thanh cục bộ
    let localUri = '';
    try {
      localUri = await tinodeClient.cacheFile(file);
    } catch (downloadErr) {
      console.warn('[STT] Cache audio file error:', downloadErr);
    }

    // 2. Kiểm tra nếu có cấu hình endpoint STT (Whisper/Speech API)
    const sttEndpoint = config.voiceSttApiUrl || (globalThis as any)?.process?.env?.EXPO_PUBLIC_VOICE_STT_API_URL;
    if (sttEndpoint && localUri) {
      try {
        const formData = new FormData();
        const filename = file.name || 'voice.m4a';
        formData.append('file', {
          uri: localUri,
          name: filename,
          type: file.mime || 'audio/mp4',
        } as any);
        formData.append('model', 'whisper-1');
        formData.append('language', 'vi');

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        const res = await fetch(sttEndpoint, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
          },
        });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          const transcript = String(data?.text || data?.transcript || data?.result || '').trim();
          if (transcript) {
            setCachedTranscription(file, transcript, messageId);
            return transcript;
          }
        }
      } catch (sttError) {
        console.warn('[STT] External STT request failed:', sttError);
      }
    }

    // 3. Khi không có STT endpoint hoặc chưa nhận dạng được:
    // Tuyệt đối không sinh câu nói giả tạo (như "Chào bạn, mình vừa gửi tin nhắn thoại").
    // Báo lỗi thân thiện để người dùng biết và có thể chạm để thử lại.
    throw new Error('Chưa thể nhận dạng âm thanh · Chạm để thử lại');
  })().finally(() => {
    pendingTranscriptions.delete(key);
  });

  pendingTranscriptions.set(key, request);
  return request;
}
