import test from 'node:test';
import assert from 'node:assert/strict';
import { readyTinodeTypingTopic } from './chatRealtime.js';

test('typing is sent only for an authenticated prepared Tinode topic', () => {
  assert.equal(readyTinodeTypingTopic({ tinodeTopic: 'usrPeer123456' }, true), 'usrPeer123456');
  assert.equal(readyTinodeTypingTopic({ tinodeTopic: '' }, true), '');
  assert.equal(readyTinodeTypingTopic({ tinodeTopic: 'usrPeer123456' }, false), '');
  assert.equal(readyTinodeTypingTopic({ isChatbot: true, tinodeTopic: 'usrPeer123456' }, true), '');
});
