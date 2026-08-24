import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_POLL_SETTINGS,
  applyPollEvent,
  normalizePoll,
  normalizePollEvent,
  pollCanViewerLock,
  pollIsClosed,
  pollOptionVoteCounts,
  pollViewerIdentities,
} from './poll.js';

const basePoll = normalizePoll({
  id: 'poll-1',
  question: 'Chọn lịch họp',
  options: [
    { id: 'a', text: 'Sáng' },
    { id: 'b', text: 'Chiều' },
  ],
  creatorId: 'usr-owner',
  settings: DEFAULT_POLL_SETTINGS,
});

test('poll normalization keeps bounded options and safe settings', () => {
  assert.equal(basePoll.options.length, 2);
  assert.equal(basePoll.question, 'Chọn lịch họp');
  assert.equal(basePoll.settings.allowMultiple, false);
  assert.equal(normalizePoll({ id: 'x', question: 'x', options: [{ id: 'a', text: 'only' }] }), null);
});

test('single-choice vote replaces the same actor vote', () => {
  const first = applyPollEvent(basePoll, {
    action: 'poll_vote', pollId: 'poll-1', optionIds: ['a'], actorName: 'A', createdAt: '2026-08-24T01:00:00Z',
  }, 'usr-a', 3);
  const second = applyPollEvent(first, {
    action: 'poll_vote', pollId: 'poll-1', optionIds: ['b'], actorName: 'A', createdAt: '2026-08-24T01:01:00Z',
  }, 'usr-a', 4);
  assert.deepEqual(second.votes['usr-a'].optionIds, ['b']);
  assert.deepEqual(pollOptionVoteCounts(second), { a: 0, b: 1 });
});

test('multiple-choice vote preserves selected options', () => {
  const poll = normalizePoll({ ...basePoll, settings: { allowMultiple: true } });
  const voted = applyPollEvent(poll, {
    action: 'poll_vote', pollId: 'poll-1', optionIds: ['a', 'b'],
  }, 'usr-a', 5);
  assert.deepEqual(voted.votes['usr-a'].optionIds, ['a', 'b']);
  assert.deepEqual(pollOptionVoteCounts(voted), { a: 1, b: 1 });
});

test('option addition and lock follow poll settings', () => {
  const poll = normalizePoll({ ...basePoll, settings: { allowAddOptions: true } });
  const withOption = applyPollEvent(poll, {
    action: 'poll_option_added', pollId: 'poll-1', optionId: 'c', optionText: 'Tối',
  }, 'usr-a', 6);
  assert.equal(withOption.options.at(-1).text, 'Tối');
  const locked = applyPollEvent(withOption, { action: 'poll_locked', pollId: 'poll-1' }, 'usr-owner', 7);
  assert.equal(locked.locked, true);
  assert.equal(applyPollEvent(locked, { action: 'poll_vote', pollId: 'poll-1', optionIds: ['a'] }, 'usr-b', 8).votes['usr-b'], undefined);
});

test('poll viewer and creator checks use stable identities', () => {
  const voted = applyPollEvent(basePoll, { action: 'poll_vote', pollId: 'poll-1', optionIds: ['a'] }, 'usr-a', 9);
  assert.ok(pollViewerIdentities(voted, ['account-a', 'usr-a']));
  assert.equal(pollCanViewerLock(voted, ['usr-owner']), true);
  assert.equal(pollCanViewerLock(voted, ['usr-a']), false);
});

test('poll expiry closes voting without changing stored state', () => {
  const expiresAt = '2026-08-24T01:00:00.000Z';
  const poll = normalizePoll({ ...basePoll, settings: { expiresAt } });
  assert.equal(pollIsClosed(poll, Date.parse('2026-08-24T00:59:59Z')), false);
  assert.equal(pollIsClosed(poll, Date.parse('2026-08-24T01:00:01Z')), true);
});

test('expired votes and added options are ignored when replaying history', () => {
  const poll = normalizePoll({
    ...basePoll,
    settings: {
      expiresAt: '2026-08-24T01:00:00.000Z',
      allowAddOptions: true,
    },
  });
  const afterVote = applyPollEvent(poll, {
    action: 'poll_vote', pollId: 'poll-1', optionIds: ['a'], createdAt: '2026-08-24T01:00:00Z',
  }, 'usr-a', 10);
  const afterOption = applyPollEvent(afterVote, {
    action: 'poll_option_added', pollId: 'poll-1', optionId: 'c', optionText: 'Tối', createdAt: '2026-08-24T01:01:00Z',
  }, 'usr-a', 11);
  assert.equal(afterVote.votes['usr-a'], undefined);
  assert.equal(afterOption.options.some(option => option.id === 'c'), false);
});

test('only the poll creator can lock a poll', () => {
  const unchanged = applyPollEvent(basePoll, {
    action: 'poll_locked', pollId: 'poll-1', actorId: 'usr-other',
  }, 'usr-other', 12);
  assert.equal(unchanged.locked, false);
  const locked = applyPollEvent(basePoll, {
    action: 'poll_locked', pollId: 'poll-1', actorId: 'usr-owner',
  }, 'usr-owner', 13);
  assert.equal(locked.locked, true);
});

test('malformed poll events are ignored', () => {
  assert.equal(normalizePollEvent({ action: 'unknown' }), null);
  assert.deepEqual(applyPollEvent(basePoll, { action: 'poll_vote', pollId: 'other', optionIds: ['a'] }, 'usr-a'), basePoll);
});
