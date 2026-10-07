import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_MUTE_OPTIONS,
  isConversationMuted,
  notificationMuteLabel,
  resolveNotificationMuteUntil,
} from './conversationNotifications';

describe('conversationNotifications', () => {
  const baseTime = new Date('2026-10-06T10:00:00Z').getTime();

  it('checks if conversation is muted correctly', () => {
    expect(isConversationMuted(null, baseTime)).toBe(false);
    expect(isConversationMuted(undefined, baseTime)).toBe(false);
    expect(isConversationMuted(0, baseTime)).toBe(true); // until manual
    expect(isConversationMuted(Math.floor(baseTime / 1000) + 3600, baseTime)).toBe(true); // 1 hour future
    expect(isConversationMuted(Math.floor(baseTime / 1000) - 3600, baseTime)).toBe(false); // past
  });

  it('resolves mute options to target timestamps matching web', () => {
    // ONE_HOUR
    const oneHour = resolveNotificationMuteUntil(NOTIFICATION_MUTE_OPTIONS.ONE_HOUR, baseTime);
    expect(oneHour).toBe(Math.floor((baseTime + 3600 * 1000) / 1000));

    // FOUR_HOURS
    const fourHours = resolveNotificationMuteUntil(NOTIFICATION_MUTE_OPTIONS.FOUR_HOURS, baseTime);
    expect(fourHours).toBe(Math.floor((baseTime + 4 * 3600 * 1000) / 1000));

    // UNTIL_MANUAL
    const manual = resolveNotificationMuteUntil(NOTIFICATION_MUTE_OPTIONS.UNTIL_MANUAL, baseTime);
    expect(manual).toBe(0);

    // UNTIL_EIGHT
    const untilEight = resolveNotificationMuteUntil(NOTIFICATION_MUTE_OPTIONS.UNTIL_EIGHT, baseTime);
    const targetDate = new Date(untilEight * 1000);
    expect(targetDate.getHours()).toBe(8);
    expect(targetDate.getMinutes()).toBe(0);
  });

  it('formats notification mute labels', () => {
    expect(notificationMuteLabel(0, baseTime, 'vi-VN')).toBe('Đã tắt cho đến khi được mở lại');
    expect(notificationMuteLabel(0, baseTime, 'en-US')).toBe('Muted until turned back on');
    expect(notificationMuteLabel(null, baseTime)).toBe('');
  });
});
