import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentConversationPreview } from './messagePreview.js';

test('formats an incoming image with the sender name', () => {
  assert.equal(
    attachmentConversationPreview({
      type: 'image',
      sender: 'incoming',
      senderName: 'Phương',
      file: { name: 'screenshot.png', mime: 'image/png' },
    }),
    'Phương đã gửi 1 ảnh',
  );
});

test('formats an outgoing file as a self-authored attachment', () => {
  assert.equal(
    attachmentConversationPreview({
      type: 'file',
      sender: 'outgoing',
      file: { name: 'report.pdf', mime: 'application/pdf' },
    }),
    'Bạn đã gửi 1 tệp',
  );
});

test('formats a sticker as a lightweight conversation preview', () => {
  assert.equal(
    attachmentConversationPreview({
      type: 'sticker',
      sender: 'outgoing',
      sticker: { id: 'positive-1' },
    }),
    'Bạn đã gửi sticker',
  );
});

test('leaves text messages to the existing text preview flow', () => {
  assert.equal(attachmentConversationPreview({ type: 'text', text: 'Xin chào' }), '');
});
