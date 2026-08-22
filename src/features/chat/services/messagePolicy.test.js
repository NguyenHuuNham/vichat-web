import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  applyRecallToMessage,
  buildRecallEvent,
  canRecallDeliveredMessage,
  chatAttachmentValidationError,
  compactMessages,
  recallAppliesToViewer,
  recallPlaceholderSenderId,
} from './messagePolicy.js';

const productionNginxSource = readFileSync(
  new URL('../../../../infrastructure/production/nginx.conf', import.meta.url),
  'utf8',
);
const productionHostNginxSource = readFileSync(
  new URL('../../../../infrastructure/production/nginx-host-chat.conf', import.meta.url),
  'utf8',
);

test('allows attachments through 500 MB and rejects larger files immediately', () => {
  assert.equal(chatAttachmentValidationError({ size: MAX_CHAT_ATTACHMENT_BYTES }), '');
  assert.equal(
    chatAttachmentValidationError({ size: MAX_CHAT_ATTACHMENT_BYTES + 1 }),
    'File hoặc ảnh không được lớn hơn 500 MB.',
  );
  assert.match(productionNginxSource, /client_max_body_size\s+600m;/);
  assert.match(productionHostNginxSource, /client_max_body_size\s+600m;/);
});

test('recall is unavailable until a message is delivered successfully', () => {
  assert.equal(canRecallDeliveredMessage({ pending: true }), false);
  assert.equal(canRecallDeliveredMessage({ deliveryStatus: 'sending' }), false);
  assert.equal(canRecallDeliveredMessage({ pending: false, failed: true }), false);
  assert.equal(canRecallDeliveredMessage({ pending: false, failed: false, seq: 42 }), true);
});

test('recall events use the authenticated Tinode author instead of an optimistic Chatmgt id', () => {
  const event = buildRecallEvent({
    id: 'client-message-id',
    seq: 42,
    senderId: 'management-account-id',
    createdAt: '2026-08-11T01:30:00.000Z',
  }, 'usrTinodeAuthor', '2026-08-11T01:31:00.000Z');

  assert.equal(event.originalSenderId, 'usrTinodeAuthor');
  assert.equal(event.targetSeq, 42);
  assert.equal(recallPlaceholderSenderId({
    actorId: 'usrTinodeAuthor',
    originalSenderId: 'management-account-id',
  }), 'usrTinodeAuthor');
});

test('self recall applies only to the author while all recall applies to everyone', () => {
  const author = { isMe: value => value === 'usr-author' };
  const other = { isMe: value => value === 'usr-other' };
  assert.equal(recallAppliesToViewer({ mode: 'self', actorId: 'usr-author' }, author), true);
  assert.equal(recallAppliesToViewer({ mode: 'self', actorId: 'usr-author' }, other), false);
  assert.equal(recallAppliesToViewer({ mode: 'all', actorId: 'usr-author' }, other), true);
});

test('recall projection removes self-only messages before conversation sorting', () => {
  const message = {
    id: 'message-1',
    type: 'image',
    text: '',
    image: '/tinode-media/v0/file/s/message-1',
    file: { url: '/tinode-media/v0/file/s/message-1' },
    replyTo: { id: 'older', text: 'Anh' },
    reactions: { '👍': 1 },
  };

  assert.deepEqual(compactMessages([
    applyRecallToMessage(message, { recallEvent: { mode: 'self' } }),
    { id: 'message-2' },
  ]), [{ id: 'message-2' }]);

  assert.deepEqual(applyRecallToMessage(message, { recallEvent: { mode: 'all' } }), {
    ...message,
    type: 'text',
    text: 'Tin nhắn đã được thu hồi',
    recalled: true,
    file: undefined,
    image: undefined,
    sticker: undefined,
    replyTo: null,
    reactions: {},
  });
});
