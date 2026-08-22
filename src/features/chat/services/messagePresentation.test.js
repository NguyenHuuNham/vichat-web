import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAudioDuration,
  isAudioAttachment,
  isImageFile,
  messageContentLabel,
  replyContentLabel,
  splitAttachmentSelection,
} from './messagePresentation.js';

test('detects audio attachments from mime and extension', () => {
  assert.equal(isAudioAttachment({ mime: 'audio/webm' }), true);
  assert.equal(isAudioAttachment({ name: 'voice.m4a' }), true);
  assert.equal(isAudioAttachment({ mime: 'application/pdf', name: 'brief.pdf' }), false);
});

test('separates multiple image and file selections while preserving order', () => {
  const image = { name: 'photo.PNG', type: 'image/png' };
  const document = { name: 'report.pdf', type: 'application/pdf' };
  const archive = { name: 'backup.zip', type: 'application/zip' };

  assert.equal(isImageFile(image), true);
  assert.equal(isImageFile(document), false);
  assert.deepEqual(splitAttachmentSelection([image, document, archive], 'image'), {
    accepted: [image],
    rejected: [document, archive],
  });
  assert.deepEqual(splitAttachmentSelection([document, image, archive], 'file'), {
    accepted: [document, archive],
    rejected: [image],
  });
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
  assert.equal(messageContentLabel({ type: 'sticker', sticker: { label: 'Tuyệt vời!' } }), 'Sticker: Tuyệt vời!');
  assert.equal(replyContentLabel({ type: 'sticker', sticker: { label: 'Tuyệt vời!' } }), 'Sticker: Tuyệt vời!');
});
