import { describe, expect, it } from 'vitest';
import { normalizeMediaUrl } from './mediaUrl';

describe('Tinode media URL', () => {
  it('routes central Tinode file URLs through the authenticated ViChat relay', () => {
    expect(normalizeMediaUrl('https://web.vichat.net/v0/file/s/photo.jpg?asatt=1'))
      .toBe('https://chat.upgo.vn/tinode-media/v0/file/s/photo.jpg?asatt=1');
  });

  it('normalizes already-relayed Tinode paths without preserving the central host', () => {
    expect(normalizeMediaUrl('https://web.vichat.net/tinode-media/v0/file/s/photo.jpg?asatt=1'))
      .toBe('https://chat.upgo.vn/tinode-media/v0/file/s/photo.jpg?asatt=1');
    expect(normalizeMediaUrl('/tinode-media/v0/file/s/photo.jpg'))
      .toBe('https://chat.upgo.vn/tinode-media/v0/file/s/photo.jpg');
  });

  it('keeps ordinary public HTTPS images unchanged', () => {
    expect(normalizeMediaUrl('https://cdn.example.com/photo.jpg')).toBe('https://cdn.example.com/photo.jpg');
  });

});
