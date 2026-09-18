import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_MESSAGE_TEXT_BYTES,
  MAX_MESSAGE_TEXT_CHARACTERS,
  MESSAGE_TEXT_TOO_LONG_ERROR,
  MAX_CHAT_ATTACHMENT_BYTES,
  applyEditToMessage,
  applyRecallToMessage,
  canEditDeliveredMessage,
  buildRecallEvent,
  canRecallDeliveredMessage,
  chatAttachmentValidationError,
  compactMessages,
  editActorMatchesMessage,
  editTargetsMessage,
  messageTextByteLength,
  messageTextValidationError,
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
const appSource = readFileSync(new URL('../../../app/App.jsx', import.meta.url), 'utf8');
const tinodeSource = readFileSync(new URL('./tinodeClient.js', import.meta.url), 'utf8');

test('rejects oversized message text before it reaches UI state or Tinode', () => {
  assert.equal(messageTextByteLength('a'.repeat(MAX_MESSAGE_TEXT_BYTES)), MAX_MESSAGE_TEXT_BYTES);
  assert.equal(messageTextValidationError('a'.repeat(MAX_MESSAGE_TEXT_BYTES)), '');
  assert.equal(messageTextValidationError('a'.repeat(MAX_MESSAGE_TEXT_CHARACTERS + 1)), MESSAGE_TEXT_TOO_LONG_ERROR);

  const emojiText = '\u{1F600}'.repeat(Math.floor(MAX_MESSAGE_TEXT_BYTES / 4) + 1);
  assert.equal(messageTextByteLength('\u{1F600}'), 4);
  assert.equal(messageTextValidationError(emojiText), MESSAGE_TEXT_TOO_LONG_ERROR);
  assert.doesNotMatch(MESSAGE_TEXT_TOO_LONG_ERROR, /120 KB/i);
  assert.match(messageTextValidationError('x'.repeat(MAX_MESSAGE_TEXT_BYTES + 1), 'Mô tả tệp'), /Mô tả tệp quá dài/);
  assert.equal(messageTextByteLength('x'.repeat(MAX_MESSAGE_TEXT_BYTES + 1), MAX_MESSAGE_TEXT_BYTES), MAX_MESSAGE_TEXT_BYTES + 1);
  assert.match(appSource, /if \(!updateCurrentDraft\(value\)\)/);
  assert.match(appSource, /maxLength=\{MAX_MESSAGE_TEXT_CHARACTERS\}/);
  assert.match(tinodeSource, /messageTextValidationError\(text\)/);
  const sendSource = appSource.split('const handleSendMessage = async')[1].split('const handleComposerSubmit')[0];
  assert.ok(sendSource.indexOf('messageTextValidationError') < sendSource.indexOf('registerGroupSendAttempt'));
  assert.ok(sendSource.indexOf('messageTextValidationError') < sendSource.indexOf('setConversations'));
});

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

test('only a delivered text message can be edited by its authenticated sender', () => {
  const delivered = {
    id: 'message-1',
    seq: 42,
    type: 'text',
    sender: 'outgoing',
    senderId: 'usr-author',
    text: 'Nội dung cũ',
    pending: false,
    failed: false,
    deliveryStatus: 'sent',
  };
  assert.equal(canEditDeliveredMessage(delivered), true);
  assert.equal(canEditDeliveredMessage({ ...delivered, pending: true }), false);
  assert.equal(canEditDeliveredMessage({ ...delivered, failed: true }), false);
  assert.equal(canEditDeliveredMessage({ ...delivered, type: 'file' }), false);
  assert.equal(canEditDeliveredMessage({ ...delivered, recalled: true }), false);
  assert.equal(editActorMatchesMessage({ senderId: 'usr-author' }, delivered), true);
  assert.equal(editActorMatchesMessage({ senderId: 'usr-other' }, delivered), false);
});

test('edit events use Tinode sequence when client message IDs differ', () => {
  assert.equal(editTargetsMessage({ editEvent: { targetId: 'legacy-id', targetSeq: 42 } }, {
    id: 'current-id',
    seq: 42,
  }), true);
  assert.equal(editTargetsMessage({ editEvent: { targetId: 'current-id', targetSeq: 41 } }, {
    id: 'current-id',
    seq: 42,
  }), false);
  assert.equal(editTargetsMessage({ editEvent: { targetId: 'legacy-id' } }, {
    id: 'current-id',
    seq: 42,
  }), false);
});

test('replaying edit events builds ordered history and ignores duplicate events', () => {
  const original = {
    id: 'message-1',
    seq: 42,
    type: 'text',
    sender: 'incoming',
    senderId: 'usr-author',
    text: 'Bản đầu',
    mentions: [],
  };
  const firstEdit = {
    id: 'edit-1',
    seq: 43,
    senderId: 'usr-author',
    createdAt: '2026-08-28T01:00:00.000Z',
    editEvent: {
      targetId: 'message-1',
      targetSeq: 42,
      actorId: 'spoofed-value',
      text: 'Bản hai',
      previousText: 'Bản đầu',
      mentions: [],
      createdAt: '2026-08-28T01:00:00.000Z',
    },
  };
  const secondEdit = {
    id: 'edit-2',
    seq: 44,
    senderId: 'usr-author',
    createdAt: '2026-08-28T01:01:00.000Z',
    editEvent: {
      targetId: 'message-1',
      targetSeq: 42,
      text: 'Bản ba',
      previousText: 'Bản hai',
      mentions: [],
      createdAt: '2026-08-28T01:01:00.000Z',
    },
  };
  const afterFirst = applyEditToMessage(original, firstEdit);
  const afterSecond = applyEditToMessage(afterFirst, secondEdit);
  const afterDuplicate = applyEditToMessage(afterSecond, { ...secondEdit, id: 'different-client-id' });
  assert.equal(afterSecond.text, 'Bản ba');
  assert.deepEqual(afterSecond.editHistory.map(entry => entry.text), ['Bản đầu', 'Bản hai']);
  assert.equal(afterDuplicate, afterSecond);
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
    reactionUsers: {},
  });
});
