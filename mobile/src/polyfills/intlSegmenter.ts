type SegmenterOptions = {
  granularity?: 'grapheme' | 'word' | 'sentence';
};

type SegmentData = {
  segment: string;
  index: number;
  input: string;
  isWordLike?: boolean;
};

class BasicSegmenter {
  private readonly granularity: 'grapheme' | 'word' | 'sentence';

  constructor(_locales?: unknown, options?: SegmenterOptions) {
    this.granularity = options?.granularity || 'grapheme';
  }

  segment(input: unknown) {
    const value = String(input ?? '');
    let index = 0;
    const segments: SegmentData[] = Array.from(value, segment => {
      const item = { segment, index, input: value };
      index += segment.length;
      return item;
    });

    return segments;
  }

  resolvedOptions() {
    return { locale: 'vi', granularity: this.granularity };
  }
}

export function installIntlSegmenterPolyfill() {
  const intl = globalThis.Intl as typeof Intl & { Segmenter?: unknown };
  if (typeof intl?.Segmenter === 'function') return false;

  Object.defineProperty(intl, 'Segmenter', {
    configurable: true,
    writable: true,
    value: BasicSegmenter,
  });
  return true;
}

installIntlSegmenterPolyfill();
