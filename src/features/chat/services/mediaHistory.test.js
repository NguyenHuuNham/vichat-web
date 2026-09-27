import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isMediaHistoryPacket,
  mediaHistoryMessageKeys,
  mergeMediaHistoryMessages,
} from './mediaHistory.js';

test('media history scan ignores only old packets and keeps newer live packets', () => {
  const topic = { __vichatMediaHistoryScanMaxSeq: 100 };

  assert.equal(isMediaHistoryPacket(topic, { seq: 99 }), true);
  assert.equal(isMediaHistoryPacket(topic, { seq: 100 }), true);
  assert.equal(isMediaHistoryPacket(topic, { seq: 101 }), false);
  assert.equal(isMediaHistoryPacket(topic, { seq: 0 }), false);
});

test('media history identities include both message id and Tinode sequence', () => {
  assert.deepEqual(mediaHistoryMessageKeys({ id: 'message-7', seq: 42 }), ['id:message-7', 'seq:42']);
  assert.deepEqual(mediaHistoryMessageKeys({ raw: { clientId: 'client-7', seq: 43 } }), ['id:client-7', 'seq:43']);
  assert.deepEqual(mediaHistoryMessageKeys({ text: 'legacy message' }), []);
});

test('media history merge keeps live messages and appends older messages once', () => {
  const live = { id: 'message-7', seq: 42, file: { url: '/current-file' } };
  const history = [
    { id: 'message-7', seq: 42, file: { url: '/stale-file' } },
    { id: 'message-3', seq: 12, file: { url: '/older-file' } },
  ];

  assert.deepEqual(mergeMediaHistoryMessages([live], history), [
    live,
    history[1],
  ]);
});
