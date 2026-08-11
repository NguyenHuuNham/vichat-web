import { describe, expect, it } from 'vitest';
import { formatConversationTime, formatMessageDateLabel } from './timeFormatting';

describe('mobile time formatting', () => {
  const now = new Date(2026, 7, 11, 15, 0, 0).getTime();
  it('uses relative time today, yesterday and concrete dates after seven days', () => {
    expect(formatConversationTime(now - 10 * 60 * 1000, now)).toBe('10 phút');
    expect(formatConversationTime(new Date(2026, 7, 10, 15).getTime(), now)).toBe('Hôm qua');
    expect(formatConversationTime(new Date(2026, 7, 1, 15).getTime(), now)).toBe('01/08');
  });
  it('keeps date separators deterministic', () => {
    expect(formatMessageDateLabel(now, now)).toBe('Hôm nay');
    expect(formatMessageDateLabel(new Date(2026, 7, 10).getTime(), now)).toBe('Hôm qua');
  });
});
