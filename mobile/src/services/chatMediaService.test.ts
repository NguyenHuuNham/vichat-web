import { describe, expect, it } from 'vitest';
import {
  chatMediaReferenceId,
  isChatMediaReference,
  shouldFallbackToTinodeMedia,
} from '../utils/chatMedia';

const uploadId = '20260902-0123456789abcdef0123456789abcdef.png';

describe('mobile S3 chat media', () => {
  it('recognizes Chatmgt references and preserves legacy Tinode references', () => {
    expect(chatMediaReferenceId(`/api/v1/chat/media/${uploadId}`)).toBe(uploadId);
    expect(chatMediaReferenceId(`https://chatmgt.gonplatform.com/api/v1/chat/media/${uploadId}`)).toBe(uploadId);
    expect(isChatMediaReference(`/tinode-media/v0/file/s/${uploadId}`)).toBe(false);
    expect(chatMediaReferenceId('/api/v1/chat/media/%E0%A4%A')).toBe('');
  });

  it('does not silently fall back to Tinode with the production-safe default', () => {
    expect(shouldFallbackToTinodeMedia({ source: 's3', status: 503 })).toBe(false);
  });
});
