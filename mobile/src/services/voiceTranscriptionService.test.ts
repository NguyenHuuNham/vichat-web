import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAudioCacheKey, getCachedTranscription, setCachedTranscription, transcribeAudioMessage } from './voiceTranscriptionService';

vi.mock('./tinodeClient', () => ({
  tinodeClient: {
    cacheFile: vi.fn().mockResolvedValue('file:///cache/vichat-file-123-voice.m4a'),
  },
}));

vi.mock('../constants/config', () => ({
  config: {
    voiceSttApiUrl: '',
  },
}));

describe('voiceTranscriptionService', () => {
  const dummyFile = {
    name: 'voice-123.m4a',
    mime: 'audio/mp4',
    size: 2048,
    url: 'https://media.example.com/voice-123.m4a',
    audioDurationMs: 2500,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates consistent cache key from url or messageId', () => {
    expect(getAudioCacheKey(dummyFile, 'msg-1')).toBe('https://media.example.com/voice-123.m4a');
    expect(getAudioCacheKey({ ...dummyFile, url: '' }, 'msg-1')).toBe('msg-1');
  });

  it('caches and retrieves transcription correctly', () => {
    setCachedTranscription(dummyFile, 'Alo alo alo alo lô lô', 'msg-1');
    expect(getCachedTranscription(dummyFile, 'msg-1')).toBe('Alo alo alo alo lô lô');
  });

  it('returns cached text immediately when available', async () => {
    const file = {
      name: 'voice-cached.m4a',
      mime: 'audio/mp4',
      size: 1024,
      url: 'https://media.example.com/voice-cached.m4a',
      audioDurationMs: 2000,
    };
    setCachedTranscription(file, 'Nội dung bóc băng đã lưu', 'msg-cached');
    const result = await transcribeAudioMessage(file, 'msg-cached');
    expect(result).toBe('Nội dung bóc băng đã lưu');
  });

  it('transcribes via STT endpoint when configured', async () => {
    const { config } = await import('../constants/config');
    (config as any).voiceSttApiUrl = 'https://stt.example.com/transcribe';

    const globalFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'Alo alo alo alo lô lô' }),
    });
    vi.stubGlobal('fetch', globalFetch);

    const file = {
      name: 'voice-real.m4a',
      mime: 'audio/mp4',
      size: 1024,
      url: 'https://media.example.com/voice-real.m4a',
      audioDurationMs: 2000,
    };

    const transcript = await transcribeAudioMessage(file, 'msg-real');
    expect(transcript).toBe('Alo alo alo alo lô lô');
    expect(getCachedTranscription(file, 'msg-real')).toBe('Alo alo alo alo lô lô');

    (config as any).voiceSttApiUrl = '';
    vi.unstubAllGlobals();
  });

  it('throws friendly error without returning fake canned text when STT is not configured', async () => {
    const file = {
      name: 'voice-no-stt.m4a',
      mime: 'audio/mp4',
      size: 1024,
      url: 'https://media.example.com/voice-no-stt.m4a',
      audioDurationMs: 2000,
    };

    await expect(transcribeAudioMessage(file, 'msg-no-stt')).rejects.toThrow(
      'Chưa thể nhận dạng âm thanh · Chạm để thử lại'
    );
  });
});
