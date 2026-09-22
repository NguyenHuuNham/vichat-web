import { describe, expect, it } from 'vitest';
import { STICKER_ITEMS, STICKER_PACKS, filterStickers, stickerById } from './stickerCatalog';

describe('mobile sticker catalog', () => {
  it('keeps the same sticker inventory as the web catalog', () => {
    expect(STICKER_ITEMS).toHaveLength(272);
    expect(new Set(STICKER_ITEMS.map(item => item.id)).size).toBe(272);
    expect(STICKER_PACKS).toHaveLength(20);
  });

  it('resolves a sticker to the shared web asset and supports search', () => {
    expect(stickerById('positive-1')?.src).toContain('/stickers/puppysoft/positive-1.png');
    expect(filterStickers(STICKER_ITEMS, 'deadline')[0]?.id).toBe('attention-5');
  });
});
