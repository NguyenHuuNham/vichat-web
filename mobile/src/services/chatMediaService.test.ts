import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './apiClient';
import {
  CHAT_MEDIA_BIND_TIMEOUT_MS,
  CHAT_MEDIA_COMPLETE_TIMEOUT_MS,
  CHAT_MEDIA_DISCARD_TIMEOUT_MS,
  CHAT_MEDIA_DOWNLOAD_TIMEOUT_MS,
  CHAT_MEDIA_PREPARE_TIMEOUT_MS,
  bindChatMedia,
  discardChatMedia,
  putFileToS3,
  resolveChatMediaDownloadUrl,
  selectedFileSize,
  uploadChatMedia,
} from './chatMediaService';
import {
  chatMediaReferenceId,
  isChatMediaReference,
  isChatMediaUuid,
  shouldFallbackToTinodeMedia,
} from '../utils/chatMedia';

vi.mock('./apiClient', () => ({ apiRequest: vi.fn() }));

const uploadId = '20260902-0123456789abcdef0123456789abcdef.png';

const apiRequestMock = vi.mocked(apiRequest);

beforeEach(() => {
  apiRequestMock.mockReset();
  vi.restoreAllMocks();
});

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

  it('falls back to Tinode on size mismatch, unsupported type, or HTTP 409', () => {
    expect(shouldFallbackToTinodeMedia({ code: 'MEDIA_UPLOAD_SIZE_MISMATCH' })).toBe(true);
    expect(shouldFallbackToTinodeMedia({ status: 409, message: 'The uploaded object size is invalid.' })).toBe(true);
    expect(shouldFallbackToTinodeMedia({ code: 'MEDIA_FILE_TYPE_UNSUPPORTED' })).toBe(true);
    expect(shouldFallbackToTinodeMedia({ code: 'MEDIA_UPLOAD_TYPE_MISMATCH' })).toBe(true);
  });

  it('determines accurate file size on web or falls back to declared size', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('12345678', { status: 200 }));
    const size = await selectedFileSize({ uri: 'file:///blob.png', name: 'blob.png', type: 'image/png', size: 999 });
    expect(size).toBe(8);

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    const fallbackSize = await selectedFileSize({ uri: 'file:///failed.png', name: 'failed.png', type: 'image/png', size: 123 });
    expect(fallbackSize).toBe(123);
  });

  it('validates UUIDs properly for Chatmgt API', () => {
    expect(isChatMediaUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isChatMediaUuid('grp1234567890abcdef')).toBe(false);
    expect(isChatMediaUuid('usr1234567890abcdef')).toBe(false);
    expect(isChatMediaUuid(undefined)).toBe(false);
  });

  it('rejects an invalid S3 ticket before touching the selected file', async () => {
    await expect(putFileToS3(
      { uri: 'file:///photo.png', name: 'photo.png', type: 'image/png', size: 12 },
      { upload_id: 'invalid', upload_url: 'not-a-url', upload_token: '' },
    )).rejects.toMatchObject({ code: 'MEDIA_UPLOAD_REJECTED', status: 502 });
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('uses long Chatmgt completion timeout and sends the conversation scope', async () => {
    const ticket = {
      upload_id: uploadId,
      upload_url: 'https://s3.example.test/pending-upload',
      upload_token: 'signed-ticket',
      ref: `https://chatmgt.example.test/api/v1/chat/media/${uploadId}`,
    };
    apiRequestMock
      .mockResolvedValueOnce(ticket)
      .mockResolvedValueOnce({ ref: ticket.ref });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === 'file:///photo.png') {
        return new Response('photo-bytes', { status: 200 });
      }
      return new Response(null, { status: 200 });
    });

    await expect(uploadChatMedia(
      { uri: 'file:///photo.png', name: 'photo.png', type: 'image/png', size: 12 },
      { conversationId: 'conversation-1' },
    )).resolves.toBe(ticket.ref);

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, '/api/v1/chat/media/uploads', expect.objectContaining({
      timeoutMs: CHAT_MEDIA_PREPARE_TIMEOUT_MS,
      body: expect.stringContaining('conversation-1'),
    }));
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, `/api/v1/chat/media/uploads/${uploadId}/complete`, expect.objectContaining({
      timeoutMs: CHAT_MEDIA_COMPLETE_TIMEOUT_MS,
    }));
  });

  it('uses bounded timeouts for media bind, discard, and download signing', async () => {
    apiRequestMock
      .mockResolvedValueOnce({ bound: true })
      .mockResolvedValueOnce({ discarded: true })
      .mockResolvedValueOnce({ url: 'https://s3.example.test/media' });

    await bindChatMedia(uploadId, { conversationId: 'conversation-1', messageRef: 'mobile-1' });
    await discardChatMedia(uploadId, { conversationId: 'conversation-1' });
    await resolveChatMediaDownloadUrl(`https://chatmgt.example.test/api/v1/chat/media/${uploadId}`);

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, `/api/v1/chat/media/${uploadId}/bind`, expect.objectContaining({
      timeoutMs: CHAT_MEDIA_BIND_TIMEOUT_MS,
    }));
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, `/api/v1/chat/media/${uploadId}/discard`, expect.objectContaining({
      timeoutMs: CHAT_MEDIA_DISCARD_TIMEOUT_MS,
    }));
    expect(apiRequestMock).toHaveBeenNthCalledWith(3, `/api/v1/chat/media/${uploadId}?format=json`, {
      timeoutMs: CHAT_MEDIA_DOWNLOAD_TIMEOUT_MS,
    });
  });

  it('successfully uploads audio voice recording via S3 chat media', async () => {
    const voiceUploadId = '20261005-0123456789abcdef0123456789abcdef.m4a';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === 'file:///data/voice-test.m4a') {
        return new Response('voice-audio-bytes', { status: 200 });
      }
      return new Response(null, { status: 200 });
    });
    apiRequestMock
      .mockResolvedValueOnce({
        upload_id: voiceUploadId,
        upload_url: 'https://s3.example.test/put-voice',
        method: 'PUT',
        ref: `/api/v1/chat/media/${voiceUploadId}`,
        upload_token: 'token-voice',
      })
      .mockResolvedValueOnce({ ref: `/api/v1/chat/media/${voiceUploadId}` });

    const ref = await uploadChatMedia(
      { uri: 'file:///data/voice-test.m4a', name: 'voice-test.m4a', type: 'audio/mp4', size: 10240 },
      { conversationId: 'conversation-voice-1' },
    );
    expect(ref).toBe(`/api/v1/chat/media/${voiceUploadId}`);
    expect(apiRequestMock).toHaveBeenNthCalledWith(1, '/api/v1/chat/media/uploads', expect.objectContaining({
      body: expect.stringContaining('audio/mp4'),
    }));
  });
});
