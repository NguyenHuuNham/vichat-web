import { describe, expect, it } from 'vitest';
import { normalizePersonalCloudFile, normalizePersonalCloudMessage } from './personalCloudService';

describe('personal cloud service normalization', () => {
  it('normalizes file aliases and safe numeric values', () => {
    expect(normalizePersonalCloudFile({
      file_id: 'file-1',
      upload_id: '20260922-deadbeef',
      file_name: 'notes.txt',
      mime_type: 'text/plain',
      size: '42',
      created_at: '1700000000',
    })).toEqual({
      id: 'file-1',
      uploadId: '20260922-deadbeef',
      fileName: 'notes.txt',
      mimeType: 'text/plain',
      size: 42,
      createdAt: 1700000000,
      updatedAt: 0,
    });
  });

  it('rejects records without stable ids and keeps message text', () => {
    expect(normalizePersonalCloudFile({ file_name: 'missing-id' })).toBeNull();
    expect(normalizePersonalCloudMessage({ message_id: 'message-1', content: 'private note', updated_at: 9 })).toEqual({
      id: 'message-1',
      text: 'private note',
      createdAt: 0,
      updatedAt: 9,
    });
  });
});
