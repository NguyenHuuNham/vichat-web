import { describe, expect, it } from 'vitest';
import { isValidAppPin } from './appLockPolicy';

describe('app lock policy', () => {
  it('accepts exactly four numeric digits', () => {
    expect(isValidAppPin('0123')).toBe(true);
    expect(isValidAppPin('123')).toBe(false);
    expect(isValidAppPin('12345')).toBe(false);
    expect(isValidAppPin('12a4')).toBe(false);
  });
});
