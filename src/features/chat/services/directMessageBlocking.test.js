import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DIRECT_MESSAGE_BLOCKED_TEXT,
  isDirectMessageBlockedError,
  normalizeDirectMessageBlockState,
} from './directMessageBlocking.js';

const appSource = readFileSync(new URL('../../../app/App.jsx', import.meta.url), 'utf8');
const managementSource = readFileSync(new URL('./chatManagementService.js', import.meta.url), 'utf8');
const tinodeSource = readFileSync(new URL('./tinodeClient.js', import.meta.url), 'utf8');

test('normalizes viewer and peer block state without truthy string mistakes', () => {
  assert.deepEqual(normalizeDirectMessageBlockState({
    blockedByViewer: 'false',
    blockedByPeer: 'true',
  }), {
    blockedByViewer: false,
    blockedByPeer: true,
    directMessagingBlocked: true,
  });
  assert.equal(normalizeDirectMessageBlockState({ directMessagingBlocked: true }).directMessagingBlocked, true);
});

test('recognizes the bridge rejection shown for every blocked direct publish', () => {
  assert.equal(isDirectMessageBlockedError(new Error(DIRECT_MESSAGE_BLOCKED_TEXT)), true);
  assert.equal(isDirectMessageBlockedError({ params: { error_code: 'DIRECT_MESSAGE_BLOCKED' } }), true);
  assert.equal(isDirectMessageBlockedError({ code: 'DIRECT_MESSAGE_BLOCKED' }), true);
  assert.equal(isDirectMessageBlockedError(new Error('Temporary network failure')), false);
});

test('web surfaces publish rejections and removes blocked optimistic messages', () => {
  assert.match(tinodeSource, /function publishTopicMessage\(topic, draft\)/);
  assert.match(tinodeSource, /return getClient\(\)\.publishMessage\(draft/);
  assert.match(appSource, /\(blocked \|\| spamBlocked\) \? removeMessageFromConversation\(currentRoom, newMsg, previousActivity\)/);
  assert.match(appSource, /window\.setInterval\(syncDirectBlockStates, 3000\)/);
  assert.match(appSource, /if \(requestedSharedScope && !allowDirectMessagingAttempt\(activeChat\)\) return/);
  assert.doesNotMatch(appSource, /openConversationBackgroundPicker = \(\) => \{[\s\S]{0,240}!allowDirectMessagingAttempt/);
  assert.match(appSource, /<strong>\{appCopy\.t\('Chặn'\)\}<\/strong>/);
  assert.match(managementSource, /\/api\/v1\/conversation\/direct-block-state/);
  assert.match(managementSource, /\/block/);
});
