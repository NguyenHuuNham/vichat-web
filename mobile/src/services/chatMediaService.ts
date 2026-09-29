import { Platform } from 'react-native';
import { config } from '../constants/config';
import { PickerFile } from '../types';
import { chatMediaReferenceId } from '../utils/chatMedia';
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

function directUploadError(message: string, status = 0) {
  const error: any = new Error(message);
  error.code = status ? 'MEDIA_UPLOAD_REJECTED' : 'MEDIA_UPLOAD_FAILED';
  error.status = status;
  error.source = 's3';
  return error;
}

export async function putFileToS3(file: PickerFile, ticket: SignedUploadTicket) {
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

export async function selectedFileSize(file: PickerFile) {
  const declaredSize = Number(file.size) || 0;
  if (declaredSize > 0) return declaredSize;
  if (Platform.OS === 'web') {
    const response = await fetch(file.uri);
    if (!response.ok) return 0;
    return Number((await response.blob()).size) || 0;
  }
  try {
    const fileSystem: any = require('expo-file-system');
    return Number(new fileSystem.File(file.uri).size) || 0;
  } catch {
    return 0;
  }
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
  const ticket = await apiRequest<SignedUploadTicket>('/api/v1/chat/media/uploads', {
    method: 'POST',
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
  const uploadId = chatMediaReferenceId(value);
  const conversationId = String(options.conversationId || '').trim();
  const messageRef = String(options.messageRef || '').trim();
  if (!uploadId || !conversationId || !messageRef) {
    throw new Error('Thiếu thông tin để gắn file S3 vào tin nhắn.');
  }
  return apiRequest(`/api/v1/chat/media/${encodeURIComponent(uploadId)}/bind`, {
    method: 'POST',
    body: JSON.stringify({ conversation_id: conversationId, message_ref: messageRef }),
  });
}

export async function discardChatMedia(value: string, options: { conversationId: string }) {
  const uploadId = chatMediaReferenceId(value);
  const conversationId = String(options.conversationId || '').trim();
  if (!uploadId || !conversationId) return null;
  return apiRequest(`/api/v1/chat/media/${encodeURIComponent(uploadId)}/discard`, {
    method: 'POST',
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
  );
  if (!payload.url) throw new Error('Chatmgt không trả về đường dẫn tải S3.');
  return payload.url;
}
