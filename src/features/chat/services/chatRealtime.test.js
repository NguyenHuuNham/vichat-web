import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acknowledgeTopicReceived,
  applyReceiptToMessages,
  conversationManagementMergePolicy,
  conversationDisplayName,
  deliveryStatusFromReceiptCursor,
  ensureConversationEntry,
  firstVisibleConversationId,
  mergeManagementAvatar,
  mergeDeliveryStatus,
  normalizeConversationShape,
  messageForDeliveryStatus,
  modeWithRealtimePresence,
  readyTinodeTypingTopic,
  resolveConversationDeletedAt,
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

test('persisted group avatars win over stale Tinode-only metadata', () => {
  assert.equal(mergeManagementAvatar('/chatmgt-new.jpg', '/tinode-old.jpg'), '/chatmgt-new.jpg');
  assert.equal(mergeManagementAvatar('', '/tinode-current.jpg'), '/tinode-current.jpg');
  assert.equal(
    mergeManagementAvatar('/chatmgt-old.jpg', '/chatmgt-new.jpg', { incomingManagementSnapshot: true }),
    '/chatmgt-new.jpg',
  );
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

test('default conversation entry is restored without changing existing rooms', () => {
  const direct = { id: 'direct-1', messages: [{ id: 'message-1' }] };
  const chatbot = { id: 'vichat-ai', isChatbot: true, messages: [{ id: 'bot-welcome' }] };
  const rooms = { [direct.id]: direct };
  const restored = ensureConversationEntry(rooms, chatbot.id, chatbot);

  assert.equal(restored[direct.id], direct);
  assert.equal(restored[chatbot.id], chatbot);
  assert.equal(ensureConversationEntry(restored, chatbot.id, { id: chatbot.id }), restored);
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
    managementId: { invalid: true },
    management_id: 'managed-1',
    tinodeTopic: { invalid: true },
    tinode_topic: 'usr-peer-123456',
    name: { invalid: true },
    lastMsg: { invalid: true },
    avatarUrl: { invalid: true },
    avatarClass: { invalid: true },
    category: { invalid: true },
    members: {
      peer: { id: 'account-peer', name: 'Peer', username: { invalid: true } },
    },
    participantIds: { viewer: 'account-viewer', peer: { id: 'account-peer' } },
    messages: {
      first: {
        id: 'message-1',
        sender: 'incoming',
        text: { invalid: true },
        avatar: { ref: '/tinode-media/v0/file/u/avatar' },
        reactions: { like: { invalid: true }, heart: 2 },
        reactionUsers: {
          heart: [{ id: 'usr-peer', name: 'Peer', avatar: { ref: '/avatar' } }],
          invalid: [{ name: 'Missing id' }],
        },
        replyTo: { senderName: { invalid: true }, text: { invalid: true } },
      },
    },
  });

  assert.equal(room.name, '');
  assert.equal(room.managementId, 'managed-1');
  assert.equal(room.tinodeTopic, 'usr-peer-123456');
  assert.equal(room.lastMsg, '');
  assert.equal(room.avatarUrl, '');
  assert.equal(room.avatarClass, '');
  assert.equal(room.category, '');
  assert.deepEqual(room.participantIds, ['account-viewer', 'account-peer']);
  assert.equal(room.members.length, 1);
  assert.equal(room.members[0].name, 'Peer');
  assert.equal(room.messages.length, 1);
  assert.equal(room.messages[0].text, '');
  assert.equal(room.messages[0].replyTo.text, '');
  assert.equal(room.messages[0].replyTo.senderName, '');
  assert.equal(room.messages[0].avatar, '/tinode-media/v0/file/u/avatar');
  assert.deepEqual(room.messages[0].reactions, { heart: 2 });
  assert.deepEqual(room.messages[0].reactionUsers, {
    heart: [{ id: 'usr-peer', name: 'Peer', avatar: '/avatar', uid: '', tinodeUid: '' }],
  });
});

test('normalizes sticker metadata without letting malformed fields reach the UI', () => {
  const room = normalizeConversationShape({
    id: 'direct-sticker',
    messages: [{
      id: 'sticker-1',
      type: 'sticker',
      sender: 'incoming',
      sticker: {
        id: 'positive-1',
        stickerId: 'positive-1',
        packId: 'positive',
        label: ' Tuyệt vời! ',
        src: { url: '/stickers/puppysoft/positive-1.png' },
      },
    }],
  });

  assert.equal(room.messages[0].type, 'sticker');
  assert.equal(room.messages[0].sticker.id, 'positive-1');
  assert.equal(room.messages[0].sticker.packId, 'positive');
  assert.equal(room.messages[0].sticker.label, 'Tuyệt vời!');
  assert.equal(room.messages[0].sticker.src, '/stickers/puppysoft/positive-1.png');
});

test('normalizes poll state and latest poll activity for realtime rendering', () => {
  const room = normalizeConversationShape({
    id: 'group-poll',
    isGroup: true,
    messages: [{
      id: 'poll-1',
      type: 'poll',
      seq: 12,
      poll: {
        id: 'poll-1',
        question: 'Chọn giờ họp',
        options: [{ id: 'a', text: 'Sáng' }, { id: 'b', text: 'Chiều' }],
        creatorId: 'usr-owner',
      },
      pollActivity: {
        action: 'poll_vote',
        pollId: 'poll-1',
        actorId: 'usr-voter',
        actorName: 'Người vote',
        seq: 18,
      },
      pollActivitySeq: 18,
      pollActivityActorId: 'usr-voter',
      pollActivityActorName: 'Người vote',
    }],
  });
  assert.equal(room.messages[0].poll.question, 'Chọn giờ họp');
  assert.equal(room.messages[0].pollActivity.action, 'poll_vote');
  assert.equal(room.messages[0].pollActivity.seq, 18);
  assert.equal(room.messages[0].pollActivityActorId, 'usr-voter');
});

test('keeps the source of a management snapshot separate from Tinode realtime data', () => {
  assert.equal(normalizeConversationShape({ managementSnapshot: true }).managementSnapshot, true);
  assert.equal(normalizeConversationShape({ management_snapshot: true }).managementSnapshot, true);
  assert.equal(normalizeConversationShape({}).managementSnapshot, false);
});

test('a fresh management snapshot clears a viewer-scoped direct delete marker', () => {
  const deletedAt = '2026-08-24T10:00:00.000Z';
  assert.equal(resolveConversationDeletedAt(
    { deletedAt },
    { managementSnapshot: true, deletedAt: '' },
  ), '');
  assert.equal(resolveConversationDeletedAt(
    { deletedAt },
    { managementSnapshot: false, deletedAt: '' },
  ), deletedAt);
  assert.equal(resolveConversationDeletedAt(
    { deletedAt: '' },
    { managementSnapshot: true, deletedAt },
  ), deletedAt);
});

test('normalizes owner-only pending group member snapshots separately from active members', () => {
  const room = normalizeConversationShape({
    isGroup: true,
    participantIds: ['owner-1'],
    members: [{ id: 'owner-1', name: 'Owner' }],
    pendingParticipantIds: ['pending-1'],
    pendingMembers: [{ id: 'pending-1', name: ' Pending user ' }],
  });

  assert.deepEqual(room.participantIds, ['owner-1']);
  assert.deepEqual(room.pendingParticipantIds, ['pending-1']);
  assert.equal(room.members.length, 1);
  assert.equal(room.pendingMembers[0].id, 'pending-1');
  assert.equal(room.pendingMembers[0].name, 'Pending user');
});

test('accepts a first Chatmgt snapshot over an earlier Tinode-only room', () => {
  const managementId = 'c86b5c06-9f90-4d27-b6e6-0123456789ab';
  assert.deepEqual(conversationManagementMergePolicy(
    { id: 'grpTinodeOnly', members: [{ id: 'usr-owner' }] },
    {
      id: managementId,
      managementId,
      managementSnapshot: true,
      accountSession: 3,
    },
  ), {
    managementOwned: true,
    incomingManagementSnapshot: true,
  });
  assert.deepEqual(conversationManagementMergePolicy(
    { id: managementId, managementId, accountSession: 3 },
    { id: managementId, managementId, members: [{ id: 'usr-owner' }] },
  ), {
    managementOwned: true,
    incomingManagementSnapshot: false,
  });
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

test('realtime receipt events retain the viewer identity for message details', () => {
  const messages = [{
    id: 'message-1',
    seq: 12,
    sender: 'outgoing',
    senderId: 'usr-me',
    deliveryStatus: 'received',
    receiptUsers: { received: [{ id: 'usr-peer', name: 'Peer' }] },
  }];

  const next = applyReceiptToMessages(messages, {
    seq: 12,
    what: 'read',
    viewerId: 'usr-me',
    receiptUser: { id: 'usr-peer', name: 'Peer' },
  });

  assert.equal(next[0].deliveryStatus, 'read');
  assert.deepEqual(next[0].receiptUsers.read.map(user => user.id), ['usr-peer']);
  assert.deepEqual(next[0].receiptUsers.received, []);
});
