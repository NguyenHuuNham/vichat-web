import { describe, expect, it } from 'vitest';
import { normalizeMediaUrl } from './mediaUrl';

describe('Tinode media URL', () => {
  it('routes central Tinode file URLs through the authenticated ViChat relay', () => {
    expect(normalizeMediaUrl('https://web.vichat.net/v0/file/s/photo.jpg?asatt=1'))
      .toBe('https://chat.gonplatform.com/tinode-media/v0/file/s/photo.jpg?asatt=1');
  });

  it('normalizes already-relayed Tinode paths without preserving the central host', () => {
    expect(normalizeMediaUrl('https://web.vichat.net/tinode-media/v0/file/s/photo.jpg?asatt=1'))
      .toBe('https://chat.gonplatform.com/tinode-media/v0/file/s/photo.jpg?asatt=1');
    expect(normalizeMediaUrl('/tinode-media/v0/file/s/photo.jpg'))
      .toBe('https://chat.gonplatform.com/tinode-media/v0/file/s/photo.jpg');
  });

  it('keeps ordinary public HTTPS images unchanged', () => {
    expect(normalizeMediaUrl('https://cdn.example.com/photo.jpg')).toBe('https://cdn.example.com/photo.jpg');
  });

  it('routes relative Chatmgt S3 references through the authenticated API host', () => {
    expect(normalizeMediaUrl('/api/v1/chat/media/20260902-0123456789abcdef0123456789abcdef.jpg'))
      .toBe('https://chatmgt.gonplatform.com/api/v1/chat/media/20260902-0123456789abcdef0123456789abcdef.jpg');
  });

});
