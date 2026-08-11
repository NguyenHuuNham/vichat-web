import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  buildRecallEvent,
  canRecallDeliveredMessage,
  chatAttachmentValidationError,
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
