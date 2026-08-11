import { afterEach, describe, expect, it } from 'vitest';
import { installIntlSegmenterPolyfill } from './intlSegmenter';

const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');

afterEach(() => {
  if (descriptor) Object.defineProperty(Intl, 'Segmenter', descriptor);
  else delete (Intl as any).Segmenter;
});

describe('installIntlSegmenterPolyfill', () => {
  it('keeps the native implementation when it exists', () => {
    const nativeSegmenter = (Intl as any).Segmenter;
    expect(installIntlSegmenterPolyfill()).toBe(false);
    expect((Intl as any).Segmenter).toBe(nativeSegmenter);
  });

  it('provides the iterable contract required by tinode-sdk', () => {
    Object.defineProperty(Intl, 'Segmenter', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    expect(installIntlSegmenterPolyfill()).toBe(true);
    const parts = Array.from(new (Intl as any).Segmenter('vi').segment('A😀'));
    expect(parts).toEqual([
      { segment: 'A', index: 0, input: 'A😀' },
      { segment: '😀', index: 1, input: 'A😀' },
    ]);
  });

  it('allows tinode-sdk to evaluate when the native constructor is missing', async () => {
    Object.defineProperty(Intl, 'Segmenter', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    installIntlSegmenterPolyfill();
    const module = await import('tinode-sdk');
    const sdk = (module as any).default || module;

    expect(typeof sdk.Tinode).toBe('function');
    expect(typeof sdk.Drafty).toBe('function');
  });
});
