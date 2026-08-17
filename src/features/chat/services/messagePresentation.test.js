import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAudioDuration,
  isAudioAttachment,
  messageContentLabel,
  replyContentLabel,
} from './messagePresentation.js';

test('detects audio attachments from mime and extension', () => {
  assert.equal(isAudioAttachment({ mime: 'audio/webm' }), true);
  assert.equal(isAudioAttachment({ name: 'voice.m4a' }), true);
  assert.equal(isAudioAttachment({ mime: 'application/pdf', name: 'brief.pdf' }), false);
});

test('formats voice duration for the message bubble', () => {
  assert.equal(formatAudioDuration(0), '0:00');
  assert.equal(formatAudioDuration(7.4), '0:07');
  assert.equal(formatAudioDuration(73), '1:13');
});

test('uses human-readable labels for replies and attachments', () => {
  assert.equal(messageContentLabel({ type: 'audio', voiceDuration: 4 }), 'Tin nhắn thoại');
  assert.equal(messageContentLabel({ type: 'image' }), 'Ảnh');
  assert.equal(replyContentLabel({ fileName: 'voice.webm', fileMime: 'audio/webm' }), 'Tin nhắn thoại');
  assert.equal(replyContentLabel({ fileName: 'report.pdf' }), 'report.pdf');
});
