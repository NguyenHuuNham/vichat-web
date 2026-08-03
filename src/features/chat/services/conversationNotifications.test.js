import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NOTIFICATION_MUTE_OPTIONS,
  isConversationMuted,
  nextNotificationMuteExpiry,
  normalizeNotificationMuteUntil,
  resolveNotificationMuteUntil,
} from './conversationNotifications.js';

test('normalizes persisted notification mute deadlines', () => {
  assert.equal(normalizeNotificationMuteUntil(null), null);
  assert.equal(normalizeNotificationMuteUntil(''), null);
  assert.equal(normalizeNotificationMuteUntil('0'), 0);
  assert.equal(normalizeNotificationMuteUntil('1785733200'), 1785733200);
  assert.equal(normalizeNotificationMuteUntil(-1), null);
  assert.equal(normalizeNotificationMuteUntil('invalid'), null);
});

test('treats timed mutes as active only before their deadline', () => {
  const nowMs = 1_785_733_200_000;
  assert.equal(isConversationMuted(0, nowMs), true);
  assert.equal(isConversationMuted((nowMs / 1000) + 60, nowMs), true);
  assert.equal(isConversationMuted(nowMs / 1000, nowMs), false);
  assert.equal(isConversationMuted(null, nowMs), false);
});

test('resolves one-hour and four-hour choices from the confirmation time', () => {
  const nowMs = 1_785_733_200_000;
  assert.equal(
    resolveNotificationMuteUntil(NOTIFICATION_MUTE_OPTIONS.ONE_HOUR, nowMs),
    Math.floor((nowMs + 3_600_000) / 1000),
  );
  assert.equal(
    resolveNotificationMuteUntil(NOTIFICATION_MUTE_OPTIONS.FOUR_HOURS, nowMs),
    Math.floor((nowMs + 14_400_000) / 1000),
  );
  assert.equal(resolveNotificationMuteUntil(NOTIFICATION_MUTE_OPTIONS.UNTIL_MANUAL, nowMs), 0);
});

test('resolves the 8 AM choice to the next local 8 AM', () => {
  const beforeEight = new Date(2026, 7, 3, 7, 30, 0, 0);
  const afterEight = new Date(2026, 7, 3, 9, 30, 0, 0);
  const sameDayTarget = new Date(2026, 7, 3, 8, 0, 0, 0);
  const nextDayTarget = new Date(2026, 7, 4, 8, 0, 0, 0);

  assert.equal(
    resolveNotificationMuteUntil(NOTIFICATION_MUTE_OPTIONS.UNTIL_EIGHT, beforeEight.getTime()),
    Math.floor(sameDayTarget.getTime() / 1000),
  );
  assert.equal(
    resolveNotificationMuteUntil(NOTIFICATION_MUTE_OPTIONS.UNTIL_EIGHT, afterEight.getTime()),
    Math.floor(nextDayTarget.getTime() / 1000),
  );
});

test('finds the first active timed mute for exact automatic reopening', () => {
  const nowMs = 1_785_733_200_000;
  assert.equal(nextNotificationMuteExpiry([
    { notificationMutedUntil: 0 },
    { notificationMutedUntil: (nowMs / 1000) - 10 },
    { notificationMutedUntil: (nowMs / 1000) + 120 },
    { notificationMutedUntil: (nowMs / 1000) + 30 },
  ], nowMs), nowMs + 30_000);
  assert.equal(nextNotificationMuteExpiry([{ notificationMutedUntil: 0 }], nowMs), null);
});
