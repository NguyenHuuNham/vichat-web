import { describe, expect, it } from 'vitest';
import { normalizeQrUrl } from './qrCode';

describe('QR URL handling', () => {
  it('accepts http and https links', () => {
    expect(normalizeQrUrl('https://example.com/invite?code=abc')).toBe('https://example.com/invite?code=abc');
    expect(normalizeQrUrl('http://example.com')).toBe('http://example.com/');
  });

  it('rejects non-web payloads and unsafe schemes', () => {
    expect(normalizeQrUrl('wifi:T:WPA;S:Office;P:secret;;')).toBeNull();
    expect(normalizeQrUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeQrUrl('not a link')).toBeNull();
  });
});
