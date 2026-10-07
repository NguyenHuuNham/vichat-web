import { describe, expect, it } from 'vitest';
import { config } from '../constants/config';
import { normalizeDraftyAttachment, parseAudioDurationMetadata } from './tinodeMedia';

const uploadId = '20260902-0123456789abcdef0123456789abcdef';

describe('Tinode media normalization', () => {
  it('keeps S3 image references available for the native resolver', () => {
    const attachment = normalizeDraftyAttachment({
      txt: ' ',
      ent: [{ tp: 'IM', data: { name: 'photo.jpg', mime: 'image/jpeg', ref: `/api/v1/chat/media/${uploadId}.jpg`, size: 42 } }],
    });

    expect(attachment?.isImage).toBe(true);
    expect(attachment?.file.url).toBe(`${config.apiBase}/api/v1/chat/media/${uploadId}.jpg`);
    expect(attachment?.file.size).toBe(42);
  });

  it('reads web voice duration in seconds from the shared Tinode header', () => {
    expect(parseAudioDurationMetadata({ 'x-voice-duration': '4' })).toBe(4000);
    const attachment = normalizeDraftyAttachment(
      { txt: ' ', ent: [{ tp: 'EX', data: { name: 'voice.m4a', mime: 'audio/mp4', ref: `/api/v1/chat/media/${uploadId}.m4a` } }] },
      undefined,
      parseAudioDurationMetadata({ 'x-voice-duration': '4' }),
    );

    expect(attachment?.isAudio).toBe(true);
    expect(attachment?.file.audioDurationMs).toBe(4000);
  });

  it('supports native Drafty audio entities and their duration', () => {
    const attachment = normalizeDraftyAttachment({
      txt: ' ',
      ent: [{ tp: 'AU', data: { name: 'voice.ogg', mime: 'audio/ogg', refurl: `/api/v1/chat/media/${uploadId}.ogg`, duration: 3, size: 18 } }],
    });

    expect(attachment?.isAudio).toBe(true);
    expect(attachment?.file.url).toBe(`${config.apiBase}/api/v1/chat/media/${uploadId}.ogg`);
    expect(attachment?.file.audioDurationMs).toBe(3000);
  });

  it('recognizes Drafty video entities as shared files', () => {
    const attachment = normalizeDraftyAttachment({
      txt: ' ',
      ent: [{ tp: 'VD', data: { name: 'clip.mp4', mime: 'video/mp4', ref: `/api/v1/chat/media/${uploadId}.mp4` } }],
    });

    expect(attachment?.isImage).toBe(false);
    expect(attachment?.isAudio).toBe(false);
    expect(attachment?.file.url).toContain(`/api/v1/chat/media/${uploadId}.mp4`);
  });

  it('accepts legacy attachment casing and filename metadata', () => {
    const attachment = normalizeDraftyAttachment({
      txt: ' ',
      ent: [{ tp: 'ex', data: { filename: 'report.pdf', mime: 'application/pdf', ref: `/api/v1/chat/media/${uploadId}.pdf` } }],
    });

    expect(attachment?.file.name).toBe('report.pdf');
    expect(attachment?.file.url).toContain(`/api/v1/chat/media/${uploadId}.pdf`);
  });
});
