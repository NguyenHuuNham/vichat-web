import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  GROUP_SPAM_ACTION_LIMIT,
  GROUP_SPAM_BASE_COOLDOWN_MS,
  GROUP_SPAM_MAX_COOLDOWN_MS,
  GROUP_SPAM_RECOVERY_MS,
  applyGroupSpamCooldown,
  createGroupSpamState,
  groupSpamCooldownMessage,
  groupSpamErrorRetryAfterMs,
  groupSpamRemainingSeconds,
  isGroupSpamCooldownError,
  registerGroupSpamAttempt,
} from './groupSpamPolicy.js';

const appSource = readFileSync(new URL('../../../app/App.jsx', import.meta.url), 'utf8');
const tinodeSource = readFileSync(new URL('./tinodeClient.js', import.meta.url), 'utf8');
const bridgeSource = readFileSync(new URL('../../../../chatservice-main/scripts/tinode_account_bridge.py', import.meta.url), 'utf8');
const mobileSource = readFileSync(new URL('../../../../mobile/src/services/tinodeClient.ts', import.meta.url), 'utf8');

function attemptMany(state, count, start = 1_000, actionPrefix = 'action') {
  let current = state;
  const results = [];
  for (let index = 0; index < count; index += 1) {
    const result = registerGroupSpamAttempt(current, {
      now: start + index * 100,
      actionId: `${actionPrefix}-${index}`,
    });
    current = result.state;
    results.push(result);
  }
  return { state: current, results };
}

test('allows a short normal burst and blocks the next group action for five seconds', () => {
  const burst = attemptMany(createGroupSpamState(), GROUP_SPAM_ACTION_LIMIT + 1);
  assert.equal(burst.results.slice(0, GROUP_SPAM_ACTION_LIMIT).every(result => result.allowed), true);
  assert.equal(burst.results.at(-1).blocked, true);
  assert.equal(burst.results.at(-1).cooldownMs, GROUP_SPAM_BASE_COOLDOWN_MS);
  assert.equal(groupSpamRemainingSeconds(burst.state, 1_000 + GROUP_SPAM_ACTION_LIMIT * 100), 5);
});

test('doubles the cooldown after another burst and resets after a normal recovery period', () => {
  const first = attemptMany(createGroupSpamState(), GROUP_SPAM_ACTION_LIMIT + 1, 10_000, 'first');
  const afterFirstCooldown = first.results.at(-1).state.blockedUntil + 1;
  const second = attemptMany(first.state, GROUP_SPAM_ACTION_LIMIT + 1, afterFirstCooldown, 'second');
  assert.equal(second.results.at(-1).cooldownMs, GROUP_SPAM_BASE_COOLDOWN_MS * 2);

  const recoveredAt = second.state.blockedUntil + GROUP_SPAM_RECOVERY_MS + 1;
  const recovered = attemptMany(second.state, GROUP_SPAM_ACTION_LIMIT + 1, recoveredAt, 'recovered');
  assert.equal(recovered.results.at(-1).cooldownMs, GROUP_SPAM_BASE_COOLDOWN_MS);
});

test('counts a multi-file logical action once and bounds duplicate packets', () => {
  let state = createGroupSpamState();
  const first = registerGroupSpamAttempt(state, { now: 20_000, actionId: 'batch-one' });
  state = first.state;
  for (let index = 0; index < 20; index += 1) {
    const duplicate = registerGroupSpamAttempt(state, { now: 20_100 + index, actionId: 'batch-one' });
    assert.equal(duplicate.allowed, true);
    assert.equal(duplicate.counted, false);
    state = duplicate.state;
  }
  assert.equal(state.actionTimes.length, 1);
});

test('merges a bridge cooldown and recognizes the structured or Tinode 429 error', () => {
  const state = applyGroupSpamCooldown(createGroupSpamState(), 10_000, 30_000);
  assert.equal(groupSpamRemainingSeconds(state, 30_000), 10);
  assert.equal(isGroupSpamCooldownError({ params: { error_code: 'GROUP_SPAM_COOLDOWN' } }), true);
  assert.equal(isGroupSpamCooldownError({ code: 429, message: 'Bạn đang gửi quá nhanh. Có thể gửi lại sau 10 giây. (429)' }), true);
  assert.equal(groupSpamErrorRetryAfterMs({ message: 'Có thể gửi lại sau 10 giây. (429)' }), 10_000);
  assert.equal(groupSpamCooldownMessage(5), 'Bạn đang gửi quá nhanh. Có thể gửi lại sau 5 giây.');
  assert.equal(state.blockedUntil <= 30_000 + GROUP_SPAM_MAX_COOLDOWN_MS, true);
});

test('wires the web guard and bridge enforcement without adding mobile policy', () => {
  assert.match(appSource, /registerGroupSpamAttempt/);
  assert.match(appSource, /handleGroupSpamCooldownError/);
  assert.match(tinodeSource, /x-vichat-group-action/);
  assert.match(bridgeSource, /GROUP_SPAM_COOLDOWN/);
  assert.match(bridgeSource, /client_platform.*web/);
  assert.doesNotMatch(mobileSource, /GROUP_SPAM_COOLDOWN|groupSpam|x-vichat-group-action/);
});
