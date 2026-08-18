import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acknowledgeTopicReceived,
  applyReceiptToMessages,
  conversationDisplayName,
  deliveryStatusFromReceiptCursor,
  firstVisibleConversationId,
  mergeDeliveryStatus,
  normalizeConversationShape,
  messageForDeliveryStatus,
  modeWithRealtimePresence,
  readyTinodeTypingTopic,
  resolvePreparedTinodeTopic,
  resolveTinodePresenceOnline,
  shouldShowConversation,
  topicReceiptSequence,
  tinodeContactsSyncDelay,
} from './chatRealtime.js';

test('prepared Chatmgt group topic is reused instead of creating a conflicting topic', () => {
  assert.equal(resolvePreparedTinodeTopic(
    { tinodeTopic: '' },
    { isGroup: true, tinodeTopic: 'grpPrepared123' },
    'grpStaleCache123',
  ), 'grpPrepared123');
  assert.equal(resolvePreparedTinodeTopic(
    { tinodeTopic: 'grpExisting123' },
    { isGroup: true, tinodeTopic: 'grpPrepared123' },
  ), 'grpExisting123');
});

test('Tinode contacts sync retries only while an unknown topic and account session remain active', () => {
  assert.equal(tinodeContactsSyncDelay(0), 120);
  assert.equal(tinodeContactsSyncDelay(1, { pendingTopicNames: ['grpPending123'] }), 600);
  assert.equal(tinodeContactsSyncDelay(2, { pendingTopicNames: ['grpPending123'] }), 1800);
  assert.equal(tinodeContactsSyncDelay(3, { pendingTopicNames: ['grpPending123'] }), null);
  assert.equal(tinodeContactsSyncDelay(1, { pendingTopicNames: [] }), null);
  assert.equal(tinodeContactsSyncDelay(1, {
    sessionActive: false,
    pendingTopicNames: ['grpPending123'],
  }), null);
});

test('typing is sent only for an authenticated prepared Tinode topic', () => {
  assert.equal(readyTinodeTypingTopic({ tinodeTopic: 'usrPeer123456' }, true), 'usrPeer123456');
  assert.equal(readyTinodeTypingTopic({ tinodeTopic: '' }, true), '');
  assert.equal(readyTinodeTypingTopic({ tinodeTopic: 'usrPeer123456' }, false), '');
  assert.equal(readyTinodeTypingTopic({ isChatbot: true, tinodeTopic: 'usrPeer123456' }, true), '');
});

test('conversation list hides empty direct metadata until Tinode history or a draft exists', () => {
  const emptyManagedDirect = {
    id: 'c86b5c06-9f90-4d27-b6e6-0123456789ab',
    managementId: 'c86b5c06-9f90-4d27-b6e6-0123456789ab',
    messages: [],
  };

  assert.equal(shouldShowConversation(emptyManagedDirect), false);
  assert.equal(shouldShowConversation(emptyManagedDirect, 'Dang soan'), true);
  assert.equal(shouldShowConversation({ ...emptyManagedDirect, messages: [null, { id: 'message-1' }] }), true);
  assert.equal(shouldShowConversation({ ...emptyManagedDirect, isGroup: true }), true);
  assert.equal(shouldShowConversation({ ...emptyManagedDirect, isChatbot: true }), true);
});

test('conversation display names tolerate incomplete direct room metadata', () => {
  assert.equal(conversationDisplayName({ id: 'direct-1', members: [{ name: 'Nguyen Van A' }] }), 'Nguyen Van A');
  assert.equal(conversationDisplayName({ id: 'direct-1', name: 'direct-1' }, 'Cuoc tro chuyen ca nhan'), 'Cuoc tro chuyen ca nhan');
  assert.equal(conversationDisplayName({ id: 'direct-1', name: 42 }), '42');
  assert.equal(conversationDisplayName({ id: 'direct-1' }, 'Cuoc tro chuyen ca nhan'), 'Cuoc tro chuyen ca nhan');
});

test('normalizes malformed direct room metadata before the UI iterates it', () => {
  const room = normalizeConversationShape({
    id: 'direct-1',
    name: { invalid: true },
    members: {
      peer: { id: 'account-peer', name: 'Peer', username: { invalid: true } },
    },
    participantIds: { viewer: 'account-viewer', peer: { id: 'account-peer' } },
    messages: {
      first: {
        id: 'message-1',
        sender: 'incoming',
        text: { invalid: true },
        replyTo: { senderName: { invalid: true }, text: { invalid: true } },
      },
    },
  });

  assert.equal(room.name, '');
  assert.deepEqual(room.participantIds, ['account-viewer', 'account-peer']);
  assert.equal(room.members.length, 1);
  assert.equal(room.members[0].name, 'Peer');
  assert.equal(room.messages.length, 1);
  assert.equal(room.messages[0].text, '');
  assert.equal(room.messages[0].replyTo.text, '');
  assert.equal(room.messages[0].replyTo.senderName, '');
});

test('initial selection skips empty Chatmgt direct metadata', () => {
  const conversations = {
    empty: { messages: [] },
    active: { messages: [{ id: 'message-1' }] },
    bot: { isChatbot: true, messages: [] },
  };

  assert.equal(firstVisibleConversationId(conversations, {}, 'fallback'), 'active');
  assert.equal(firstVisibleConversationId({ empty: conversations.empty }, {}, 'fallback'), 'fallback');
});

test('Tinode on and off events override stale contact presence immediately', () => {
  assert.equal(resolveTinodePresenceOnline('on', false), true);
  assert.equal(resolveTinodePresenceOnline('off', true), false);
  assert.equal(resolveTinodePresenceOnline('msg', true), true);
  assert.equal(resolveTinodePresenceOnline('msg', false), false);
});

test('group permissions include presence for existing and new members', () => {
  assert.equal(modeWithRealtimePresence('JRWAS'), 'JRWPAS');
  assert.equal(modeWithRealtimePresence('JRWPASDO'), 'JRWPASDO');
});

test('background receipt acknowledgement uses the latest topic sequence', () => {
  let acknowledged = 0;
  const topic = {
    maxMsgSeq: () => 12,
    latestMessage: () => ({ seq: 8 }),
    noteRecv: sequence => { acknowledged = sequence; },
  };

  assert.equal(acknowledgeTopicReceived(topic), 12);
  assert.equal(acknowledged, 12);
  assert.equal(topicReceiptSequence({ maxMsgSeq: () => 0, latestMessage: () => ({ seq: 8 }) }), 8);
  assert.equal(topicReceiptSequence({ maxMsgSeq: () => 0, latestMessage: () => null }), 0);
});

test('delivery status can identify attachment echoes without a from field', () => {
  const stamped = messageForDeliveryStatus({ head: { 'x-sender-id': 'usrSender' }, seq: 42 });
  assert.equal(stamped.from, 'usrSender');
  const existing = { from: 'usrExisting', head: { 'x-sender-id': 'usrOther' } };
  assert.equal(messageForDeliveryStatus(existing), existing);
});

test('receipt updates older outgoing messages without downgrading a read status', () => {
  const messages = [
    { id: 'old', seq: 4, sender: 'outgoing', deliveryStatus: 'sent' },
    { id: 'new', seq: 8, sender: 'outgoing', deliveryStatus: 'sent' },
    { id: 'read', seq: 3, sender: 'outgoing', deliveryStatus: 'read' },
    { id: 'incoming', seq: 2, sender: 'incoming', deliveryStatus: 'none' },
  ];
  const received = applyReceiptToMessages(messages, { seq: 8, what: 'recv' });
  assert.equal(received.find(message => message.id === 'old').deliveryStatus, 'received');
  assert.equal(received.find(message => message.id === 'new').deliveryStatus, 'received');
  assert.equal(received.find(message => message.id === 'read').deliveryStatus, 'read');
  assert.equal(received.find(message => message.id === 'incoming').deliveryStatus, 'none');
  assert.equal(applyReceiptToMessages(received, { seq: 8, what: 'read' }).find(message => message.id === 'old').deliveryStatus, 'read');
});

test('conversation refresh does not downgrade a receipt already shown in the UI', () => {
  assert.equal(mergeDeliveryStatus('received', 'sent'), 'received');
  assert.equal(mergeDeliveryStatus('read', 'received'), 'read');
  assert.equal(mergeDeliveryStatus('sent', 'received'), 'received');
});

test('receipt cursor keeps outgoing messages at two checks after a snapshot refresh', () => {
  const message = {
    seq: 12,
    sender: 'outgoing',
    senderId: 'usr-me',
    deliveryStatus: 'sent',
  };

  assert.equal(deliveryStatusFromReceiptCursor(message, {
    receivedSeq: 12,
    viewerId: 'usr-me',
  }), 'received');
  assert.equal(deliveryStatusFromReceiptCursor({ ...message, deliveryStatus: 'received' }, {
    receivedSeq: 12,
    readSeq: 12,
    viewerId: 'usr-me',
  }), 'read');
  assert.equal(deliveryStatusFromReceiptCursor({ ...message, sender: 'incoming', senderId: 'usr-peer' }, {
    receivedSeq: 12,
    viewerId: 'usr-me',
  }), 'sent');
});
