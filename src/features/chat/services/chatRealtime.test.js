import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationDelivery, createLatestHistoryLoader, fetchTopicData } from './tinodeDelivery.js';
import {
  acknowledgeTopicReceived,
  applyReceiptToMessages,
  conversationManagementMergePolicy,
  conversationDisplayName,
  deliveryStatusFromReceiptCursor,
  ensureConversationEntry,
  firstVisibleConversationId,
  mergeManagementAvatar,
  mergeConversationReadState,
  mergeDeliveryStatus,
  latestConversationMessage,
  messageActivityTimestamp,
  normalizeConversationFlag,
  normalizeConversationShape,
  messageForDeliveryStatus,
  modeWithRealtimePresence,
  readyTinodeTypingTopic,
  resolveConversationDeletedAt,
  resolveConversationPreview,
  resolveMergedConversationActivity,
  resolvePreparedTinodeTopic,
  resolveTopicReadState,
  resolveTopicViewerReadSeq,
  resolveTinodePresenceOnline,
  shouldShowConversation,
  topicReceiptSequence,
  tinodeContactsSyncDelay,
} from './chatRealtime.js';
import { conversationActivityTimestamp } from './timeFormatting.js';

function createHistoryTopic(sequence = 10) {
  return {
    seq: sequence,
    loadedSequence: 0,
    queries: [],
    isSubscribed: () => true,
    maxMsgSeq() { return this.loadedSequence; },
    startMetaQuery() {
      const query = {};
      return {
        withData(since, before, limit) { query.data = { since, before, limit }; return this; },
        withDel(since, limit) { query.del = { since, limit }; return this; },
        withLaterDel(limit) { query.del = { since: 1, limit }; return this; },
        build() { return { ...query, what: Object.keys(query).join(' ') }; },
      };
    },
    async getMeta(query) {
      this.queries.push(query);
      if (query.what === 'data') this.loadedSequence = this.seq;
      return { code: 200 };
    },
  };
}

test('already subscribed topics fetch a fresh bounded tail instead of reusing stale history', async () => {
  const loader = createLatestHistoryLoader();
  const topic = createHistoryTopic();
  await loader.load(topic, 100);
  topic.seq = 20;
  await loader.load(topic, 100);
  assert.equal(topic.loadedSequence, 20);
  assert.deepEqual(topic.queries.filter(query => query.what === 'data').map(query => query.data), [
    { since: undefined, before: undefined, limit: 100 },
    { since: undefined, before: undefined, limit: 100 },
  ]);
});

test('overlapping history requests coalesce and an open upgrades background history only once', async () => {
  const loader = createLatestHistoryLoader();
  const topic = createHistoryTopic();
  await Promise.all([loader.load(topic, 100), loader.load(topic, 100), loader.load(topic, 1000)]);
  assert.deepEqual(topic.queries.filter(query => query.what === 'data').map(query => query.data.limit), [100, 1000]);
});

test('message metadata arriving during a refresh receives a follow-up catch-up', async () => {
  const loader = createLatestHistoryLoader();
  const topic = createHistoryTopic();
  const originalGetMeta = topic.getMeta.bind(topic);
  let finishFirst;
  const first = new Promise(resolve => { finishFirst = resolve; });
  topic.getMeta = async query => {
    const result = await originalGetMeta(query);
    if (topic.queries.length === 1) await first;
    return result;
  };
  const pending = loader.load(topic, 100);
  topic.seq = 12;
  finishFirst();
  await pending;
  assert.equal(topic.loadedSequence, 12);
  assert.equal(topic.queries.filter(query => query.what === 'data').length, 2);
});

test('session reset and leaving a topic cancel pending history without starting more requests', async () => {
  for (const cancel of ['clear', 'remove']) {
    const loader = createLatestHistoryLoader();
    const topic = createHistoryTopic();
    let finish;
    const response = new Promise(resolve => { finish = resolve; });
    topic.getMeta = async query => { topic.queries.push(query); return response; };
    const pending = assert.rejects(loader.load(topic, 100), /cancelled/);
    loader[cancel](topic);
    topic.seq = 12;
    finish({ code: 200 });
    await pending;
    assert.equal(topic.queries.filter(query => query.what === 'data').length, 1);
  }
});

test('late partial read snapshots cannot erase newer unread messages already received', () => {
  const existing = { readSeq: 10, latestSeq: 15, unreadFromSeq: 11, badge: 5, messages: [{ seq: 15 }] };
  assert.deepEqual(mergeConversationReadState(existing, {
    readSeq: 12, latestSeq: 12, unreadFromSeq: 0, badge: 0, messages: [{ seq: 12 }],
  }), { readSeq: 12, unreadFromSeq: 13, badge: 3 });
});

test('history waits for SDK data dispatch after the control response', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const messages = [];
  const query = { data: { since: 42, before: 142, limit: 100 } };
  const topic = {
    async getMeta(request) {
      assert.deepEqual(request, { what: 'data', data: query.data });
      setTimeout(() => messages.push({ seq: 42 }), 0);
      return { code: 200, params: { what: 'data', count: 1 } };
    },
  };
  const request = fetchTopicData(topic, query);
  await Promise.resolve();
  assert.equal(messages.length, 0);
  context.mock.timers.tick(0);
  await request;
  assert.equal(messages[0].seq, 42);
});

test('history errors propagate instead of returning stale cached content', async () => {
  const failure = new Error('history unavailable');
  await assert.rejects(fetchTopicData({ getMeta: async () => { throw failure; } }, {}), failure);
});

test('deletion metadata cannot resolve a history request before its data finishes', async () => {
  const requests = [];
  const topic = { async getMeta(query) { requests.push(query); return { code: 200 }; } };
  await fetchTopicData(topic, { what: 'data del', data: { limit: 100 }, del: { since: 4 } });
  assert.deepEqual(requests, [
    { what: 'data', data: { limit: 100 } },
    { what: 'del', del: { since: 4 } },
  ]);
});

test('new message metadata retains unread state before the body is loaded', () => {
  const existing = { readSeq: 10, latestSeq: 10, unreadFromSeq: 0, badge: 0, messages: [] };
  const incoming = { readSeq: 10, latestSeq: 13, unreadFromSeq: 11, badge: 3, messages: [] };
  assert.deepEqual(mergeConversationReadState(existing, incoming, { viewerId: 'me' }), {
    readSeq: 10, unreadFromSeq: 11, badge: 3,
  });
});

test('message delivery does not wait for slow profiles or starve during continuous traffic', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const delivery = createConversationDelivery();
  const emitted = [];
  let sequence = 1;
  let finishProfile;
  const profile = new Promise(resolve => { finishProfile = resolve; });
  const callbacks = {
    snapshot: () => ({ seq: sequence }),
    enrich: () => profile,
    emit: value => emitted.push(value),
    isCurrent: () => true,
  };
  delivery.enqueue('room', callbacks);
  context.mock.timers.tick(10);
  sequence = 2;
  delivery.enqueue('room', callbacks);
  context.mock.timers.tick(10);
  assert.deepEqual(emitted, [{ seq: 2 }]);
  finishProfile({ seq: 2, name: 'resolved' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(emitted.at(-1), { seq: 2, name: 'resolved' });
  delivery.clear();
});

test('stale profile completion cannot overwrite newer messages or read state', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const delivery = createConversationDelivery();
  const emitted = [];
  let finishOldProfile;
  const oldProfile = new Promise(resolve => { finishOldProfile = resolve; });
  const callbacks = {
    snapshot: () => ({ seq: 1, readSeq: 0 }),
    enrich: () => oldProfile,
    emit: value => emitted.push(value),
    isCurrent: () => true,
  };
  delivery.enqueue('room', callbacks);
  context.mock.timers.tick(20);
  delivery.enqueue('room', { ...callbacks, snapshot: () => ({ seq: 2, readSeq: 2 }), enrich: async value => value });
  finishOldProfile({ seq: 1, readSeq: 0, name: 'stale' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(emitted, [{ seq: 1, readSeq: 0 }]);
  context.mock.timers.tick(20);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(emitted.at(-1).seq, 2);
  assert.equal(emitted.at(-1).readSeq, 2);
  delivery.clear();
});

test('logout cancels queued snapshots and in-flight profile results', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const delivery = createConversationDelivery();
  const emitted = [];
  let finishProfile;
  const profile = new Promise(resolve => { finishProfile = resolve; });
  const callbacks = { snapshot: () => ({}), enrich: () => profile, emit: value => emitted.push(value), isCurrent: () => true };
  delivery.enqueue('room', callbacks);
  context.mock.timers.tick(20);
  delivery.enqueue('other', callbacks);
  delivery.clear();
  finishProfile({ stale: true });
  context.mock.timers.tick(20);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(emitted, [{}]);
});

test('prepared Chatmgt topic wins over stale room and cache bindings', () => {
  assert.equal(resolvePreparedTinodeTopic(
    { tinodeTopic: '' },
    { isGroup: true, tinodeTopic: 'grpPrepared123' },
    'grpStaleCache123',
  ), 'grpPrepared123');
  assert.equal(resolvePreparedTinodeTopic(
    { tinodeTopic: 'grpExisting123' },
    { isGroup: true, tinodeTopic: 'grpPrepared123' },
  ), 'grpPrepared123');
  assert.equal(resolvePreparedTinodeTopic(
    { tinodeTopic: 'grpStale123' },
    { isGroup: true, tinodeTopic: '' },
    'grpCached123',
  ), '');
  assert.equal(resolvePreparedTinodeTopic(
    { tinodeTopic: 'grpExisting123' },
    null,
    'grpCached123',
  ), 'grpExisting123');
});

test('conversation activity prefers the newest message over a stale metadata timestamp', () => {
  const stale = '2026-08-25T08:00:00.000Z';
  const fresh = '2026-08-25T08:05:00.000Z';
  const latest = latestConversationMessage([
    { id: 'old', createdAt: stale, text: 'Cu', seq: 10 },
    { id: 'new', createdAt: fresh, text: 'Moi', seq: 11 },
  ]);
  const activity = resolveMergedConversationActivity(
    { updatedAt: stale, lastMsg: 'Cu' },
    { updatedAt: stale, lastMsg: 'Cu' },
    [{ id: 'old', createdAt: stale, text: 'Cu', seq: 10 }, { id: 'new', createdAt: fresh, text: 'Moi', seq: 11 }],
  );

  assert.equal(latest.id, 'new');
  assert.equal(messageActivityTimestamp(latest), Date.parse(fresh));
  assert.equal(activity.updatedAt, fresh);
  assert.equal(activity.latestMessage.text, 'Moi');
  assert.equal(resolveConversationPreview({
    existingPreview: 'Cu',
    incomingPreview: 'Cu',
    latestMessagePreview: activity.latestMessage.text,
  }), 'Moi');
  assert.equal(conversationActivityTimestamp({ updatedAt: stale, messages: [{ createdAt: fresh }] }), Date.parse(fresh));
});

test('conversation pin normalization rejects string false values', () => {
  assert.equal(normalizeConversationFlag('false'), false);
  assert.equal(normalizeConversationFlag('true'), true);
  assert.equal(normalizeConversationShape({ pinned: 'false' }).pinned, false);
  assert.equal(normalizeConversationShape({ pinned: 'true' }).pinned, true);
});

test('Tinode snapshots without pin metadata preserve their non-authoritative marker', () => {
  const realtime = normalizeConversationShape({ id: 'grp-live', messages: [] });
  const normalizedAgain = normalizeConversationShape(realtime);
  const management = normalizeConversationShape({ id: 'managed', pinned: false, managementSnapshot: true });

  assert.equal(realtime.pinnedExplicit, false);
  assert.equal(normalizedAgain.pinnedExplicit, false);
  assert.equal(management.pinnedExplicit, true);
});

test('Tinode snapshots cannot clear viewer-scoped direct block metadata', () => {
  const realtime = normalizeConversationShape({ id: 'usrPeer123456', messages: [] });
  const management = normalizeConversationShape({
    id: 'direct-managed',
    managementSnapshot: true,
    blockedByViewer: true,
    blockedByPeer: false,
    directMessagingBlocked: true,
  });

  assert.equal(realtime.directBlockExplicit, false);
  assert.equal(realtime.directMessagingBlocked, false);
  assert.equal(management.directBlockExplicit, true);
  assert.equal(management.blockedByViewer, true);
  assert.equal(management.directMessagingBlocked, true);
});

test('management placeholders cannot erase an existing conversation preview', () => {
  assert.equal(resolveConversationPreview({
    existingPreview: 'Bạn: Tin moi',
    incomingPreview: 'Chưa có tin nhắn',
    incomingManagementSnapshot: true,
  }), 'Bạn: Tin moi');
});

test('persisted group avatars win over stale Tinode-only metadata', () => {
  assert.equal(mergeManagementAvatar('/chatmgt-new.jpg', '/tinode-old.jpg'), '/chatmgt-new.jpg');
  assert.equal(mergeManagementAvatar('', '/tinode-current.jpg'), '/tinode-current.jpg');
  assert.equal(
    mergeManagementAvatar('/chatmgt-old.jpg', '/chatmgt-new.jpg', { incomingManagementSnapshot: true }),
    '/chatmgt-new.jpg',
  );
});

test('empty avatar snapshots never clear an existing group avatar', () => {
  assert.equal(mergeManagementAvatar('/group-kept.jpg', ''), '/group-kept.jpg');
  assert.equal(mergeManagementAvatar('/group-kept.jpg', '   ', { incomingManagementSnapshot: true }), '/group-kept.jpg');
});

test('stale read snapshots cannot resurrect an acknowledged unread boundary', () => {
  const existing = {
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
    messages: [{ seq: 100 }],
  };
  const stale = {
    readSeq: 90,
    unreadFromSeq: 91,
    badge: 10,
    messages: [{ seq: 100 }],
  };

  assert.deepEqual(mergeConversationReadState(existing, stale), {
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
  });

  assert.deepEqual(mergeConversationReadState(existing, {
    ...stale,
    messages: [{ seq: 100 }, { seq: 101 }],
    badge: 11,
  }), {
    readSeq: 100,
    unreadFromSeq: 101,
    badge: 1,
  });
});

test('a newer read cursor clears unread state while a genuinely newer message remains unread', () => {
  const existing = {
    readSeq: 100,
    unreadFromSeq: 101,
    badge: 1,
    messages: [{ seq: 101 }],
  };
  assert.deepEqual(mergeConversationReadState(existing, {
    readSeq: 101,
    unreadFromSeq: 0,
    badge: 0,
    messages: [{ seq: 101 }],
  }), {
    readSeq: 101,
    unreadFromSeq: 0,
    badge: 0,
  });

  assert.deepEqual(mergeConversationReadState({
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
    messages: [{ seq: 100 }],
  }, {
    readSeq: 100,
    unreadFromSeq: 101,
    badge: 1,
    messages: [{ seq: 100 }, { seq: 101 }],
  }), {
    readSeq: 100,
    unreadFromSeq: 101,
    badge: 1,
  });

  assert.deepEqual(mergeConversationReadState({
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
    messages: [],
  }, {
    readSeq: 100,
    unreadFromSeq: 101,
    badge: 1,
    messages: [],
  }), {
    readSeq: 100,
    unreadFromSeq: 101,
    badge: 1,
  });

  assert.deepEqual(mergeConversationReadState(existing, {
    readSeq: 0,
    unreadFromSeq: 0,
    badge: 0,
    messages: [],
    managementSnapshot: true,
  }), {
    readSeq: 100,
    unreadFromSeq: 101,
    badge: 1,
  });
});

test('derives unread from a newer incoming message when Tinode unread metadata is stale', () => {
  assert.deepEqual(mergeConversationReadState({
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
    messages: [{ seq: 100, sender: 'incoming', senderId: 'usr-peer' }],
  }, {
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
    // Tinode can deliver this message before refreshing topic.unread.
    messages: [
      { seq: 100, sender: 'incoming', senderId: 'usr-peer' },
      { seq: 101, sender: 'incoming', senderId: 'usr-peer' },
    ],
  }, { viewerId: 'usr-me' }), {
    readSeq: 100,
    unreadFromSeq: 101,
    badge: 1,
  });

  assert.deepEqual(mergeConversationReadState({
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
    messages: [{ seq: 100, sender: 'incoming', senderId: 'usr-peer' }],
  }, {
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
    messages: [{ seq: 100, sender: 'incoming', senderId: 'usr-peer' }, { seq: 101, sender: 'outgoing', senderId: 'usr-me' }],
  }, { viewerId: 'usr-me' }), {
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
  });

  assert.deepEqual(mergeConversationReadState({
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
    messages: [{ seq: 101, sender: 'outgoing' }],
  }, {
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
    messages: [{ seq: 101, sender: 'outgoing' }],
  }, { viewerId: 'usr-me' }), {
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
  });

  assert.deepEqual(mergeConversationReadState({
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
    // The message can already be present after the first onData callback.
    messages: [{ seq: 101, sender: 'incoming', senderId: 'usr-peer' }],
  }, {
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
    messages: [{ seq: 101, sender: 'incoming', senderId: 'usr-peer' }],
  }, { viewerId: 'usr-me' }), {
    readSeq: 100,
    unreadFromSeq: 101,
    badge: 1,
  });

  assert.deepEqual(mergeConversationReadState({
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
    // A prior realtime merge may already contain the packet while read
    // metadata is still stale.
    messages: [{ seq: 101, sender: 'outgoing', senderId: 'usr-peer' }],
  }, {
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
    messages: [{ seq: 101, sender: 'outgoing', senderId: 'usr-peer' }],
  }, { viewerId: 'usr-me' }), {
    readSeq: 100,
    unreadFromSeq: 101,
    badge: 1,
  });

  assert.deepEqual(mergeConversationReadState({
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
    messages: [{ seq: 101, sender: 'incoming', senderId: 'usr-me' }],
  }, {
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
    messages: [{ seq: 101, sender: 'incoming', senderId: 'usr-me' }],
  }, { viewerId: 'usr-me' }), {
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
  });
});

test('local read floors override stale explicit Tinode unread counters', () => {
  assert.deepEqual(resolveTopicReadState({
    topicSequence: 100,
    serverReadSeq: 80,
    localReadFloor: 100,
    explicitUnreadCount: 20,
  }), {
    readSeq: 100,
    unreadFromSeq: 0,
    badge: 0,
  });
  assert.deepEqual(resolveTopicReadState({
    topicSequence: 120,
    serverReadSeq: 80,
    localReadFloor: 100,
    explicitUnreadCount: 40,
  }), {
    readSeq: 100,
    unreadFromSeq: 101,
    badge: 20,
  });
});

test('new data derives unread from the latest sequence before Tinode refreshes topic.unread', () => {
  assert.deepEqual(resolveTopicReadState({
    topicSequence: 101,
    serverReadSeq: 100,
    localReadFloor: 0,
    explicitUnreadCount: 0,
  }), {
    readSeq: 100,
    unreadFromSeq: 101,
    badge: 1,
  });

  assert.deepEqual(resolveTopicReadState({
    topicSequence: 0,
    explicitUnreadCount: 3,
  }), {
    readSeq: 0,
    unreadFromSeq: 1,
    badge: 3,
  });
});

test('edit event sequences do not create unread messages', () => {
  assert.deepEqual(resolveTopicReadState({
    topicSequence: 43,
    serverReadSeq: 42,
    explicitUnreadCount: 1,
    ignoredSequences: [43],
  }), {
    readSeq: 42,
    unreadFromSeq: 0,
    badge: 0,
  });
  assert.deepEqual(resolveTopicReadState({
    topicSequence: 44,
    serverReadSeq: 42,
    explicitUnreadCount: 2,
    ignoredSequences: [43],
  }), {
    readSeq: 42,
    unreadFromSeq: 44,
    badge: 1,
  });
});

test('incoming read cap prevents an SDK auto-read from hiding a peer packet', () => {
  assert.deepEqual(resolveTopicReadState({
    topicSequence: 101,
    serverReadSeq: 101,
    localReadFloor: 0,
    incomingReadCap: 100,
    explicitUnreadCount: 0,
  }), {
    readSeq: 100,
    unreadFromSeq: 101,
    badge: 1,
  });
  assert.deepEqual(resolveTopicReadState({
    topicSequence: 101,
    serverReadSeq: 101,
    localReadFloor: 101,
    incomingReadCap: 100,
    explicitUnreadCount: 0,
  }), {
    readSeq: 101,
    unreadFromSeq: 0,
    badge: 0,
  });
});

test('the viewer own echo advances read state without hiding an incoming message', () => {
  const outgoingReadSeq = resolveTopicViewerReadSeq({
    serverReadSeq: 100,
    latestMessage: { seq: 101, from: 'usr-me' },
    viewerId: 'usr-me',
  });
  const incomingReadSeq = resolveTopicViewerReadSeq({
    serverReadSeq: 100,
    latestMessage: { seq: 101, from: 'usr-peer' },
    viewerId: 'usr-me',
  });
  assert.equal(outgoingReadSeq, 101);
  assert.equal(incomingReadSeq, 100);
  assert.deepEqual(resolveTopicReadState({
    topicSequence: 101,
    serverReadSeq: outgoingReadSeq,
    explicitUnreadCount: 0,
  }), {
    readSeq: 101,
    unreadFromSeq: 0,
    badge: 0,
  });
  assert.deepEqual(resolveTopicReadState({
    topicSequence: 101,
    serverReadSeq: incomingReadSeq,
    explicitUnreadCount: 0,
  }), {
    readSeq: 100,
    unreadFromSeq: 101,
    badge: 1,
  });
  assert.equal(resolveTopicViewerReadSeq({
    serverReadSeq: 100,
    latestMessage: { seq: 101, head: { 'x-sender-id': 'usr-me' } },
    viewerId: 'usr-me',
  }), 101);
  const unknownSenderReadSeq = resolveTopicViewerReadSeq({
    serverReadSeq: 100,
    latestMessage: { seq: 101 },
    viewerId: 'usr-me',
  });
  assert.equal(unknownSenderReadSeq, 100);
  assert.deepEqual(resolveTopicReadState({
    topicSequence: 101,
    serverReadSeq: unknownSenderReadSeq,
    explicitUnreadCount: 0,
  }), {
    readSeq: 100,
    unreadFromSeq: 101,
    badge: 1,
  });
  assert.equal(resolveTopicViewerReadSeq({
    serverReadSeq: 100,
    latestMessage: { seq: 101 },
    viewerId: 'usr-me',
    isChannel: true,
  }), 100);
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
