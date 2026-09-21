import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chatMediaReferenceId,
  fetchChatMedia,
  isChatMediaReference,
  isChatMediaStorageEnabled,
  shouldFallbackToTinode,
} from './chatMediaService.js';

const uploadId = '20260902-0123456789abcdef0123456789abcdef.jpg';

test('recognizes stable Chatmgt media references without treating legacy Tinode URLs as S3', () => {
  assert.equal(chatMediaReferenceId(`/api/v1/chat/media/${uploadId}`), uploadId);
  assert.equal(
    chatMediaReferenceId(`https://chatmgt.gonplatform.com/api/v1/chat/media/${uploadId}?download=1`),
    uploadId,
  );
  assert.equal(isChatMediaReference(`/tinode-media/v0/file/s/${uploadId}`), false);
  assert.equal(chatMediaReferenceId('/api/v1/chat/media/%E0%A4%A'), '');
});

test('keeps S3 opt-in and Tinode fallback disabled by default', () => {
  assert.equal(isChatMediaStorageEnabled(), false);
  assert.equal(shouldFallbackToTinode({ source: 'network', status: 503 }), false);
});

test('resolves an authenticated reference before fetching the short-lived S3 URL', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ url: 'https://s3.upgo.vn/private-object?signature=test' }),
      };
    }
    return { ok: true, status: 200 };
  };

  try {
    const response = await fetchChatMedia(`/api/v1/chat/media/${uploadId}`, {
      download: true,
      fileName: 'bao-cao.pdf',
      cache: 'no-store',
    });
    assert.equal(response.status, 200);
    assert.match(calls[0].url, new RegExp(`/api/v1/chat/media/${uploadId}\\?`));
    assert.equal(calls[0].options.credentials, 'include');
    assert.equal(calls[1].url, 'https://s3.upgo.vn/private-object?signature=test');
    assert.equal(calls[1].options.credentials, 'omit');
    assert.equal(calls[1].options.cache, 'no-store');
    assert.equal('download' in calls[1].options, false);
    assert.equal('fileName' in calls[1].options, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
