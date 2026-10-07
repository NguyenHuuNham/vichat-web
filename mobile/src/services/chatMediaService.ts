import { Platform } from 'react-native';
import { config } from '../constants/config';
import { PickerFile } from '../types';
import { chatMediaReferenceId, isChatMediaUploadId } from '../utils/chatMedia';
import { apiRequest } from './apiClient';

export {
  chatMediaReferenceId,
  isChatMediaReference,
  shouldFallbackToTinodeMedia,
} from '../utils/chatMedia';

export type SignedUploadTicket = {
  upload_id: string;
  upload_url: string;
  upload_token: string;
  method?: 'PUT';
  headers?: Record<string, string>;
  ref?: string;
};

export const CHAT_MEDIA_PREPARE_TIMEOUT_MS = 30_000;
export const CHAT_MEDIA_COMPLETE_TIMEOUT_MS = 180_000;
export const CHAT_MEDIA_BIND_TIMEOUT_MS = 30_000;
export const CHAT_MEDIA_DISCARD_TIMEOUT_MS = 30_000;
export const CHAT_MEDIA_DOWNLOAD_TIMEOUT_MS = 30_000;
const CHAT_MEDIA_BIND_RETRY_DELAYS_MS = [750, 1_500] as const;

function normalizedUploadId(value: string) {
  const referenceId = chatMediaReferenceId(value);
  if (referenceId) return referenceId;
  const rawId = String(value || '').trim();
  return isChatMediaUploadId(rawId) ? rawId : '';
}

function validateUploadTicket(ticket: SignedUploadTicket) {
  const uploadId = String(ticket?.upload_id || '').trim();
  const uploadUrl = String(ticket?.upload_url || '').trim();
  const uploadToken = String(ticket?.upload_token || '').trim();
  let protocol: string;
  try {
    protocol = new URL(uploadUrl).protocol;
  } catch {
    protocol = '';
  }
  if (!isChatMediaUploadId(uploadId) || !uploadUrl || !['http:', 'https:'].includes(protocol) || !uploadToken) {
    throw directUploadError('Chatmgt tra ve phieu upload S3 khong hop le.', 502);
  }
  if (ticket.method && ticket.method !== 'PUT') {
    throw directUploadError('Phuong thuc upload S3 khong duoc ho tro.', 502);
  }
  if (ticket.headers && (typeof ticket.headers !== 'object' || Array.isArray(ticket.headers))) {
    throw directUploadError('Header upload S3 khong hop le.', 502);
  }
  return { ...ticket, upload_id: uploadId, upload_url: uploadUrl, upload_token: uploadToken };
}

function retryableMediaError(error: any) {
  const status = Number(error?.status || 0);
  return !status || [408, 409, 429, 500, 502, 503, 504].includes(status);
}

function waitForMediaRetry(delayMs: number) {
  return new Promise<void>(resolve => setTimeout(resolve, delayMs));
}

function directUploadError(message: string, status = 0) {
  const error: any = new Error(message);
  error.code = status ? 'MEDIA_UPLOAD_REJECTED' : 'MEDIA_UPLOAD_FAILED';
  error.status = status;
  error.source = 's3';
  return error;
}

export async function putFileToS3(file: PickerFile, ticket: SignedUploadTicket) {
  ticket = validateUploadTicket(ticket);
  const contentType = file.type || 'application/octet-stream';
  if (Platform.OS === 'web') {
    const localResponse = await fetch(file.uri);
    if (!localResponse.ok) throw new Error('Không thể đọc file đã chọn.');
    let response;
    try {
      response = await fetch(ticket.upload_url, {
        method: ticket.method || 'PUT',
        headers: { 'Content-Type': contentType, ...(ticket.headers || {}) },
        body: await localResponse.blob(),
        credentials: 'omit',
      });
    } catch {
      throw directUploadError('Không kết nối được máy chủ S3.');
    }
    if (!response.ok) throw directUploadError(`S3 từ chối file (HTTP ${response.status}).`, response.status);
    return;
  }

  const fileSystem: any = require('expo-file-system');
  if (!fileSystem.File || fileSystem.UploadType?.BINARY_CONTENT === undefined) {
    throw new Error('Thiết bị chưa hỗ trợ upload trực tiếp lên S3.');
  }
  const localFile = new fileSystem.File(file.uri);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  try {
    const result = await localFile.upload(ticket.upload_url, {
      httpMethod: ticket.method || 'PUT',
      uploadType: fileSystem.UploadType.BINARY_CONTENT,
      mimeType: contentType,
      headers: { 'Content-Type': contentType, ...(ticket.headers || {}) },
      signal: controller.signal,
    });
    if (Number(result.status) < 200 || Number(result.status) >= 300) {
      throw directUploadError(
        `S3 từ chối file (HTTP ${result.status || 'không xác định'}).`,
        Number(result.status) || 0,
      );
    }
  } catch (error: any) {
    if (error?.source === 's3') throw error;
    throw directUploadError(
      error?.name === 'AbortError' ? 'Upload S3 quá thời gian cho phép.' : 'Không kết nối được máy chủ S3.',
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function selectedFileSize(file: PickerFile): Promise<number> {
  if (Platform.OS !== 'web' && file.uri) {
    try {
      const fileSystem: any = require('expo-file-system');
      if (fileSystem.getInfoAsync) {
        const info = await fileSystem.getInfoAsync(file.uri, { size: true });
        if (info.exists && typeof info.size === 'number' && info.size > 0) {
          return info.size;
        }
      }
      if (fileSystem.File) {
        const localFile = new fileSystem.File(file.uri);
        const size = Number(localFile.size);
        if (size > 0) return size;
      }
    } catch {
      // Fallback if filesystem not available
    }
  }

  if (Platform.OS === 'web' && file.uri) {
    try {
      const response = await fetch(file.uri);
      if (response.ok) {
        const blob = await response.blob();
        if (blob.size > 0) return blob.size;
      }
    } catch {
      // ignore
    }
  }

  return Number(file.size) || 0;
}

export async function uploadChatMedia(file: PickerFile, options: { conversationId?: string } = {}) {
  if (config.chatMediaStorage !== 's3') {
    const error: any = new Error('S3 media storage is disabled.');
    error.code = 'MEDIA_STORAGE_DISABLED';
    error.status = 503;
    throw error;
  }
  const conversationId = String(options.conversationId || '').trim();
  if (!conversationId) {
    const error: any = new Error('Thiếu cuộc trò chuyện để gắn file S3.');
    error.code = 'MEDIA_CONVERSATION_REQUIRED';
    error.status = 400;
    throw error;
  }
  const size = await selectedFileSize(file);
  if (size <= 0) {
    const error: any = new Error('Khong the doc kich thuoc file da chon.');
    error.code = 'MEDIA_FILE_EMPTY';
    error.status = 400;
    throw error;
  }
  const ticket = await apiRequest<SignedUploadTicket>('/api/v1/chat/media/uploads', {
    method: 'POST',
    timeoutMs: CHAT_MEDIA_PREPARE_TIMEOUT_MS,
    body: JSON.stringify({
      file_name: file.name || 'tep-dinh-kem',
      content_type: file.type || 'application/octet-stream',
      size,
      conversation_id: conversationId,
    }),
  });
  try {
    await putFileToS3(file, ticket);
  } catch (error) {
    await discardChatMedia(ticket.ref || ticket.upload_id, { conversationId }).catch(() => {});
    throw error;
  }
  let completed: { ref?: string };
  try {
    completed = await apiRequest<{ ref?: string }>(
      `/api/v1/chat/media/uploads/${encodeURIComponent(ticket.upload_id)}/complete`,
      {
        method: 'POST',
        timeoutMs: CHAT_MEDIA_COMPLETE_TIMEOUT_MS,
        body: JSON.stringify({ size, upload_token: ticket.upload_token }),
      },
    );
  } catch (error) {
    await discardChatMedia(ticket.ref || ticket.upload_id, { conversationId }).catch(() => {});
    throw error;
  }
  const reference = String(completed.ref || ticket.ref || '');
  if (!reference) {
    await discardChatMedia(ticket.ref || ticket.upload_id, { conversationId }).catch(() => {});
    throw new Error('Chatmgt không trả về tham chiếu file S3.');
  }
  return reference;
}

export async function bindChatMedia(value: string, options: { conversationId: string; messageRef: string }) {
  const uploadId = normalizedUploadId(value);
  const conversationId = String(options.conversationId || '').trim();
  const messageRef = String(options.messageRef || '').trim();
  if (!uploadId || !conversationId || !messageRef) {
    throw new Error('Thiếu thông tin để gắn file S3 vào tin nhắn.');
  }
  return apiRequest(`/api/v1/chat/media/${encodeURIComponent(uploadId)}/bind`, {
    method: 'POST',
    timeoutMs: CHAT_MEDIA_BIND_TIMEOUT_MS,
    body: JSON.stringify({ conversation_id: conversationId, message_ref: messageRef }),
  });
}

export async function bindChatMediaWithRetry(
  value: string,
  options: { conversationId: string; messageRef: string },
) {
  let lastError: any;
  for (let attempt = 0; attempt <= CHAT_MEDIA_BIND_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await bindChatMedia(value, options);
    } catch (error) {
      lastError = error;
      if (attempt >= CHAT_MEDIA_BIND_RETRY_DELAYS_MS.length || !retryableMediaError(error)) throw error;
      await waitForMediaRetry(CHAT_MEDIA_BIND_RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

export async function discardChatMedia(value: string, options: { conversationId: string }) {
  const uploadId = normalizedUploadId(value);
  const conversationId = String(options.conversationId || '').trim();
  if (!uploadId || !conversationId) return null;
  return apiRequest(`/api/v1/chat/media/${encodeURIComponent(uploadId)}/discard`, {
    method: 'POST',
    timeoutMs: CHAT_MEDIA_DISCARD_TIMEOUT_MS,
    body: JSON.stringify({ conversation_id: conversationId }),
  });
}

export async function resolveChatMediaDownloadUrl(value: string, options: { download?: boolean; fileName?: string; conversationId?: string } = {}) {
  const uploadId = chatMediaReferenceId(value);
  if (!uploadId) return value;
  const query = new URLSearchParams({ format: 'json' });
  if (options.download) query.set('download', '1');
  if (options.fileName) query.set('name', options.fileName.slice(0, 180));
  if (options.conversationId) query.set('conversation_id', options.conversationId);
  const payload = await apiRequest<{ url?: string }>(
    `/api/v1/chat/media/${encodeURIComponent(uploadId)}?${query.toString()}`,
    { timeoutMs: CHAT_MEDIA_DOWNLOAD_TIMEOUT_MS },
  );
  if (!payload.url) throw new Error('Chatmgt không trả về đường dẫn tải S3.');
  return payload.url;
}
