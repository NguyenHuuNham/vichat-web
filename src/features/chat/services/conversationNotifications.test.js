import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_NOTIFICATION_SETTINGS,
  MESSAGE_SOUND_OPTIONS,
  NOTIFICATION_MUTE_OPTIONS,
  isConversationMuted,
  messageSoundProfile,
  notificationMessageBody,
  nextNotificationMuteExpiry,
  normalizeNotificationSettings,
  normalizeNotificationMuteUntil,
  readNotificationSettings,
  resolveNotificationMuteUntil,
  writeNotificationSettings,
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

test('normalizes and persists per-viewer desktop notification preferences', () => {
  const storage = {
    values: new Map(),
    getItem(key) { return this.values.get(key) || null; },
    setItem(key, value) { this.values.set(key, value); },
  };
  assert.deepEqual(normalizeNotificationSettings({ desktopNotifications: false, sound: 'missing' }), {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    desktopNotifications: false,
  });
  const saved = writeNotificationSettings('usrA', {
    desktopNotifications: false,
    sounds: false,
    sound: 'bell',
    compactMode: true,
  }, storage);
  assert.deepEqual(readNotificationSettings('usrA', storage), saved);
  assert.notDeepEqual(readNotificationSettings('usrB', storage), saved);
});

test('exposes notification sound profiles and concise message bodies', () => {
  assert.ok(MESSAGE_SOUND_OPTIONS.length >= 3);
  assert.equal(messageSoundProfile('bell').id, 'bell');
  assert.equal(messageSoundProfile('missing').id, DEFAULT_NOTIFICATION_SETTINGS.sound);
  assert.equal(notificationMessageBody({ type: 'image' }), 'Đã gửi một hình ảnh.');
  assert.equal(notificationMessageBody({ type: 'file', file: { name: 'brief.pdf' } }), 'Đã gửi tệp brief.pdf.');
  assert.equal(notificationMessageBody({ text: '  Xin chào  ' }), 'Xin chào');
});
