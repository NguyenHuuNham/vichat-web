import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatConversationListTime,
  formatFullMessageDateTime,
  formatMessageDateLabel,
  formatMessageTime,
  parseTimestamp,
} from './timeFormatting.js';

const NOW = new Date(2026, 7, 11, 15, 30, 0).getTime();

test('formats recent conversation activity as compact relative time', () => {
  assert.equal(formatConversationListTime(NOW - 5 * 60 * 1000, NOW), '5 phút');
  assert.equal(formatConversationListTime(NOW - 2 * 60 * 60 * 1000, NOW), '2 giờ');
});

test('accepts Chatmgt Unix timestamps in seconds and numeric strings', () => {
  const seconds = Math.floor(NOW / 1000);
  assert.equal(parseTimestamp(seconds), seconds * 1000);
  assert.equal(parseTimestamp(String(seconds)), seconds * 1000);
  assert.equal(formatConversationListTime({ updatedAt: String(seconds) }, NOW), 'Vừa xong');
});

test('uses yesterday and day counts before switching to calendar dates', () => {
  assert.equal(formatConversationListTime(new Date(2026, 7, 10, 20, 0).getTime(), NOW), 'Hôm qua');
  assert.equal(formatConversationListTime(new Date(2026, 7, 8, 20, 0).getTime(), NOW), '3 ngày');
  assert.equal(formatConversationListTime(new Date(2026, 7, 4, 20, 0).getTime(), NOW), '04/08');
  assert.equal(formatConversationListTime(new Date(2026, 7, 4, 20, 0).getTime(), NOW, 'en-US'), 'Aug 4');
});

test('localizes legacy Vietnamese fallback time labels', () => {
  assert.equal(formatConversationListTime({ time: 'Hôm qua' }, NOW, 'en-US'), 'Yesterday');
  assert.equal(formatConversationListTime({ time: 'Thứ 6' }, NOW, 'en-US'), 'Friday');
});

test('keeps message bubbles on an exact clock and labels date boundaries', () => {
  const message = new Date(2026, 7, 11, 0, 20, 0).toISOString();
  assert.equal(formatMessageTime(message), '00:20');
  assert.equal(formatMessageDateLabel(message, NOW), 'Hôm nay');
  assert.equal(formatMessageDateLabel(new Date(2026, 7, 10, 23, 59).getTime(), NOW), 'Hôm qua');
  assert.equal(formatMessageDateLabel(new Date(2026, 7, 8, 23, 59).getTime(), NOW, 'en-US'), 'Aug 8, 2026');
});

test('provides an exact tooltip value for conversation list timestamps', () => {
  assert.match(formatFullMessageDateTime(new Date(2026, 7, 11, 0, 20).getTime()), /00:20/);
});
