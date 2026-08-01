import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acknowledgeTopicReceived,
  modeWithRealtimePresence,
  readyTinodeTypingTopic,
  resolvePreparedTinodeTopic,
  resolveTinodePresenceOnline,
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
