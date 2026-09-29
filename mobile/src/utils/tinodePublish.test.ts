import { describe, expect, it } from 'vitest';
import { publishSequence } from './tinodePublish';

describe('Tinode publish responses', () => {
  it('reads sequences from SDK control response shapes', () => {
    expect(publishSequence({ ctrl: { params: { seq: '12' } } })).toBe(12);
    expect(publishSequence({ params: { seq: 13 } })).toBe(13);
    expect(publishSequence({ seq: 14 })).toBe(14);
  });

  it('returns zero for an unsequenced response', () => {
    expect(publishSequence({ ctrl: { code: 200 } })).toBe(0);
  });
});
