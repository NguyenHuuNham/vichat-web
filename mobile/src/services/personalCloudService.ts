import { PickerFile, PersonalCloudFile, PersonalCloudMessage } from '../types';
import { apiRequest, responseItems } from './apiClient';
import { putFileToS3, selectedFileSize, SignedUploadTicket } from './chatMediaService';

export interface PersonalCloudPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number | null;
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

function numericValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function normalizePersonalCloudFile(record: any): PersonalCloudFile | null {
  if (!record || typeof record !== 'object') return null;
  const id = textValue(record.id || record.fileId || record.file_id);
  const uploadId = textValue(record.uploadId || record.upload_id);
  if (!id || !uploadId) return null;
  return {
    id,
    uploadId,
    fileName: textValue(record.fileName || record.file_name) || 'tep-dinh-kem',
    mimeType: textValue(record.mimeType || record.mime_type) || 'application/octet-stream',
    size: numericValue(record.size),
    createdAt: numericValue(record.createdAt || record.created_at),
    updatedAt: numericValue(record.updatedAt || record.updated_at),
  };
}

export function normalizePersonalCloudMessage(record: any): PersonalCloudMessage | null {
  if (!record || typeof record !== 'object') return null;
  const id = textValue(record.id || record.messageId || record.message_id);
  if (!id) return null;
  return {
    id,
    text: typeof record.text === 'string' ? record.text : typeof record.content === 'string' ? record.content : '',
    createdAt: numericValue(record.createdAt || record.created_at),
    updatedAt: numericValue(record.updatedAt || record.updated_at),
  };
}

function nextCursor(payload: any) {
  return textValue(payload?.next_cursor || payload?.nextCursor) || null;
}

function page<T>(payload: any, values: T[]): PersonalCloudPage<T> {
  const cursor = nextCursor(payload);
  return {
    items: values,
    nextCursor: cursor,
    hasMore: Boolean(payload?.has_more ?? payload?.hasMore ?? cursor),
    total: Number.isFinite(Number(payload?.total ?? payload?.count)) ? Number(payload.total ?? payload.count) : null,
  };
}

function queryParams(cursor: string, limit: number) {
  const params = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, Number(limit) || 100))) });
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

export const personalCloudService = {
  async listFiles({ cursor = '', limit = 100 }: { cursor?: string; limit?: number } = {}) {
    const payload = await apiRequest(`/api/v1/chat/cloud/files?${queryParams(cursor, limit)}`);
    return page(payload, responseItems(payload).map(normalizePersonalCloudFile).filter(Boolean) as PersonalCloudFile[]);
  },

  async listMessages({ cursor = '', limit = 100 }: { cursor?: string; limit?: number } = {}) {
    const payload = await apiRequest(`/api/v1/chat/cloud/messages?${queryParams(cursor, limit)}`);
    return page(payload, responseItems(payload).map(normalizePersonalCloudMessage).filter(Boolean) as PersonalCloudMessage[]);
  },

  async sendMessage(text: string) {
    const value = String(text || '').trim();
    if (!value) throw new Error('Vui lòng nhập tin nhắn.');
    return normalizePersonalCloudMessage(await apiRequest('/api/v1/chat/cloud/messages', {
      method: 'POST',
      body: JSON.stringify({ text: value }),
    }));
  },

  async deleteMessage(messageId: string) {
    return apiRequest(`/api/v1/chat/cloud/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' });
  },

  async uploadFile(file: PickerFile) {
    const size = await selectedFileSize(file);
    if (size <= 0) throw new Error('Vui lòng chọn một file không rỗng.');
    const prepared = await apiRequest<SignedUploadTicket>('/api/v1/chat/cloud/uploads', {
      method: 'POST',
      body: JSON.stringify({
        file_name: file.name || 'tep-dinh-kem',
        content_type: file.type || 'application/octet-stream',
        size,
      }),
    });
    if (!prepared.upload_url || !prepared.upload_id) throw new Error('Máy chủ không trả về địa chỉ tải file.');
    await putFileToS3(file, prepared);
    const completed = await apiRequest(`/api/v1/chat/cloud/uploads/${encodeURIComponent(prepared.upload_id)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ size, upload_token: prepared.upload_token || '' }),
    });
    const normalized = normalizePersonalCloudFile(completed);
    if (!normalized) throw new Error('Máy chủ không trả về thông tin file Cloud.');
    return normalized;
  },

  async getDownloadUrl(fileId: string, download = false) {
    const params = new URLSearchParams({ format: 'json' });
    if (download) params.set('download', '1');
    const payload = await apiRequest<{ url?: string }>(
      `/api/v1/chat/cloud/files/${encodeURIComponent(fileId)}/download?${params.toString()}`,
    );
    const url = textValue(payload?.url);
    if (!url) throw new Error('Máy chủ không trả về đường dẫn file.');
    return url;
  },

  async deleteFile(fileId: string) {
    return apiRequest(`/api/v1/chat/cloud/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
  },
};
