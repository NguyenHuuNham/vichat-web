const env = import.meta.env || {};
const apiBase = String(env.VITE_CHAT_MANAGEMENT_API_URL || '').replace(/\/+$/, '');
const storageMode = String(env.VITE_CHAT_MEDIA_STORAGE || 'tinode').trim().toLowerCase();
const fallbackToTinode = String(env.VITE_CHAT_MEDIA_FALLBACK_TO_TINODE || 'false').trim().toLowerCase() === 'true';
const CHAT_MEDIA_PATH = '/api/v1/chat/media/';
const UPLOAD_ID_PATTERN = /^[0-9]{8}-[a-f0-9]{32}(?:\.[a-z0-9]{1,10})?$/i;

class ChatMediaClientError extends Error {
  constructor(message, { code = 'MEDIA_REQUEST_FAILED', status = 0, source = 'chatmgt' } = {}) {
    super(message);
    this.name = 'ChatMediaClientError';
    this.code = code;
    this.status = status;
    this.source = source;
  }
}

function mediaApiUrl(path) {
  return `${apiBase}${path}`;
}

async function mediaApiRequest(path, options = {}) {
  const { headers: requestHeaders = {}, ...requestOptions } = options;
  let response;
  try {
    response = await fetch(mediaApiUrl(path), {
      ...requestOptions,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...requestHeaders,
      },
    });
  } catch {
    throw new ChatMediaClientError('Chat media service is unreachable.', {
      code: 'MEDIA_STORAGE_UNAVAILABLE',
      source: 'network',
    });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ChatMediaClientError(
      payload?.error_message || `Chat media service HTTP ${response.status}`,
      {
        code: payload?.error_code || `HTTP_${response.status}`,
        status: response.status,
      },
    );
  }
  return payload;
}

export function chatMediaReferenceId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let pathname = raw;
  try {
    pathname = new URL(raw, 'https://chat-media.invalid').pathname;
  } catch {
    pathname = raw.split(/[?#]/, 1)[0];
  }
  const marker = pathname.lastIndexOf(CHAT_MEDIA_PATH);
  if (marker < 0) return '';
  let uploadId;
  try {
    uploadId = decodeURIComponent(pathname.slice(marker + CHAT_MEDIA_PATH.length)).replace(/\/+$/, '');
  } catch {
    return '';
  }
  return UPLOAD_ID_PATTERN.test(uploadId) ? uploadId : '';
}

export function isChatMediaReference(value) {
  return Boolean(chatMediaReferenceId(value));
}

export function isChatMediaStorageEnabled() {
  return storageMode === 's3';
}

export function shouldFallbackToTinode(error) {
  if (!fallbackToTinode || Number(error?.status) === 401 || Number(error?.status) === 403) return false;
  return error?.source === 's3'
    || error?.source === 'network'
    || [404, 408, 409, 429, 500, 502, 503, 504].includes(Number(error?.status))
    || ['MEDIA_STORAGE_DISABLED', 'MEDIA_STORAGE_UNAVAILABLE'].includes(String(error?.code || ''));
}

export async function uploadChatMedia(file, { conversationId = '', signal } = {}) {
  if (!isChatMediaStorageEnabled()) {
    throw new ChatMediaClientError('S3 media storage is disabled.', {
      code: 'MEDIA_STORAGE_DISABLED',
      status: 503,
    });
  }
  const size = Number(file?.size) || 0;
  const contentType = String(file?.type || 'application/octet-stream');
  const prepared = await mediaApiRequest('/api/v1/chat/media/uploads', {
    method: 'POST',
    body: JSON.stringify({
      file_name: String(file?.name || 'attachment'),
      content_type: contentType,
      size,
      conversation_id: String(conversationId || '').trim(),
    }),
    signal,
  });
  try {
    const uploadResponse = await fetch(prepared.upload_url, {
      method: prepared.method || 'PUT',
      headers: { 'Content-Type': contentType, ...(prepared.headers || {}) },
      body: file,
      credentials: 'omit',
      signal,
    });
    if (!uploadResponse.ok) {
      throw new ChatMediaClientError(`S3 rejected the upload (HTTP ${uploadResponse.status}).`, {
        code: 'MEDIA_UPLOAD_REJECTED',
        status: uploadResponse.status,
        source: 's3',
      });
    }
  } catch (error) {
    await discardChatMedia(prepared.ref || prepared.upload_id, { conversationId }).catch(() => {});
    if (error instanceof ChatMediaClientError) throw error;
    throw new ChatMediaClientError('The direct S3 upload failed.', {
      code: 'MEDIA_UPLOAD_FAILED',
      source: 's3',
    });
  }

  let completed;
  try {
    completed = await mediaApiRequest(
      `/api/v1/chat/media/uploads/${encodeURIComponent(prepared.upload_id)}/complete`,
      {
        method: 'POST',
        body: JSON.stringify({
          size,
          upload_token: prepared.upload_token,
        }),
        signal,
      },
    );
  } catch (error) {
    await discardChatMedia(prepared.ref || prepared.upload_id, { conversationId }).catch(() => {});
    throw error;
  }
  const reference = completed.ref || prepared.ref;
  if (!reference) {
    throw new ChatMediaClientError('Chat media service did not return a stable reference.', {
      code: 'MEDIA_REFERENCE_MISSING',
      status: 502,
    });
  }
  return reference;
}

export async function bindChatMedia(value, { conversationId = '', messageRef = '', signal } = {}) {
  const uploadId = chatMediaReferenceId(value) || String(value || '').trim();
  if (!UPLOAD_ID_PATTERN.test(uploadId)) {
    throw new ChatMediaClientError('The chat media reference is invalid.', {
      code: 'MEDIA_REFERENCE_INVALID',
      status: 404,
    });
  }
  return mediaApiRequest(`/api/v1/chat/media/${encodeURIComponent(uploadId)}/bind`, {
    method: 'POST',
    body: JSON.stringify({
      conversation_id: String(conversationId || '').trim(),
      message_ref: String(messageRef || '').trim(),
    }),
    signal,
  });
}

export async function discardChatMedia(value, { conversationId = '', signal } = {}) {
  const uploadId = chatMediaReferenceId(value) || String(value || '').trim();
  if (!UPLOAD_ID_PATTERN.test(uploadId)) return null;
  return mediaApiRequest(`/api/v1/chat/media/${encodeURIComponent(uploadId)}/discard`, {
    method: 'POST',
    body: JSON.stringify({ conversation_id: String(conversationId || '').trim() }),
    signal,
  });
}

export async function resolveChatMediaDownloadUrl(value, { download = false, fileName = '', conversationId = '' } = {}) {
  const uploadId = chatMediaReferenceId(value);
  if (!uploadId) {
    throw new ChatMediaClientError('The chat media reference is invalid.', {
      code: 'MEDIA_REFERENCE_INVALID',
      status: 404,
    });
  }
  const query = new URLSearchParams({ format: 'json' });
  if (download) query.set('download', '1');
  if (fileName) query.set('name', String(fileName).slice(0, 180));
  if (conversationId) query.set('conversation_id', String(conversationId));
  const payload = await mediaApiRequest(
    `/api/v1/chat/media/${encodeURIComponent(uploadId)}?${query.toString()}`,
  );
  if (!payload?.url) {
    throw new ChatMediaClientError('Chat media service did not return a download URL.', {
      code: 'MEDIA_DOWNLOAD_URL_MISSING',
      status: 502,
    });
  }
  return payload.url;
}

export async function fetchChatMedia(value, options = {}) {
  const { download = false, fileName = '', conversationId = '', ...fetchOptions } = options;
  const downloadUrl = await resolveChatMediaDownloadUrl(value, {
    download: Boolean(download),
    fileName,
    conversationId,
  });
  return fetch(downloadUrl, {
    ...fetchOptions,
    credentials: 'omit',
  });
}
