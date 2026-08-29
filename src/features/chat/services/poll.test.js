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
  pollVoterDetails,
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

test('the poll creator and a deputy can lock a poll, but a member or claimed role cannot', () => {
  const unchanged = applyPollEvent(basePoll, {
    action: 'poll_locked', pollId: 'poll-1', actorId: 'usr-other',
  }, 'usr-other', 12);
  assert.equal(unchanged.locked, false);
  const deputyLocked = applyPollEvent(basePoll, {
    action: 'poll_locked', pollId: 'poll-1', actorId: 'usr-deputy', actorGroupRole: 'ADMIN',
  }, 'usr-deputy', 13, [
    { id: 'account-deputy', tinodeUid: 'usr-deputy', groupRole: 'ADMIN' },
  ]);
  assert.equal(deputyLocked.locked, true);
  assert.equal(applyPollEvent(basePoll, {
    action: 'poll_locked', pollId: 'poll-1', actorId: 'usr-member', actorGroupRole: 'ADMIN',
  }, 'usr-member', 13, [
    { id: 'account-member', tinodeUid: 'usr-member', groupRole: 'MEMBER' },
  ]).locked, false);
  const locked = applyPollEvent(basePoll, {
    action: 'poll_locked', pollId: 'poll-1', actorId: 'usr-owner',
  }, 'usr-owner', 14);
  assert.equal(locked.locked, true);
  assert.equal(pollCanViewerLock(basePoll, ['usr-deputy'], [
    { id: 'account-deputy', tinodeUid: 'usr-deputy', groupRole: 'ADMIN' },
  ]), true);
  assert.equal(pollCanViewerLock(basePoll, ['usr-member'], [
    { id: 'account-member', tinodeUid: 'usr-member', groupRole: 'MEMBER' },
  ]), false);
});

test('malformed poll events are ignored', () => {
  assert.equal(normalizePollEvent({ action: 'unknown' }), null);
  assert.deepEqual(applyPollEvent(basePoll, { action: 'poll_vote', pollId: 'other', optionIds: ['a'] }, 'usr-a'), basePoll);
});

test('voter details match account and Tinode identities without losing pending members', () => {
  const voted = applyPollEvent(
    applyPollEvent(basePoll, {
      action: 'poll_vote', pollId: 'poll-1', optionIds: ['a'], actorName: 'A',
    }, 'tinode-a', 14),
    {
      action: 'poll_vote', pollId: 'poll-1', optionIds: ['b'], actorName: 'B',
    },
    'tinode-b',
    15,
  );
  const details = pollVoterDetails(voted, 'a', [
    { id: 'account-a', tinodeUid: 'tinode-a', name: 'An' },
    { id: 'account-b', tinodeUid: 'tinode-b', name: 'Bình' },
    { id: 'account-c', tinodeUid: 'tinode-c', name: 'Chi' },
  ]);
  assert.deepEqual(details.selected.map(user => user.name), ['An']);
  assert.deepEqual(details.other.map(user => user.name), ['Bình']);
  assert.deepEqual(details.notVoted.map(user => user.name), ['Chi']);
});

test('multiple-choice voter details include a member in every selected option', () => {
  const voted = applyPollEvent(normalizePoll({ ...basePoll, settings: { allowMultiple: true } }), {
    action: 'poll_vote', pollId: 'poll-1', optionIds: ['a', 'b'], actorName: 'A',
  }, 'tinode-a', 16);
  const details = pollVoterDetails(voted, 'b', [
    { id: 'account-a', tinodeUid: 'tinode-a', name: 'An' },
    { id: 'account-b', tinodeUid: 'tinode-b', name: 'Bình' },
  ]);
  assert.deepEqual(details.selected.map(user => user.name), ['An']);
  assert.deepEqual(details.other, []);
  assert.deepEqual(details.notVoted.map(user => user.name), ['Bình']);
});

test('voter details tolerate malformed legacy vote records', () => {
  const details = pollVoterDetails({ votes: { 'usr-legacy': null } }, 'a');
  assert.deepEqual(details.other.map(user => user.name), ['usr-legacy']);
  assert.deepEqual(details.selected, []);
  assert.deepEqual(details.notVoted, []);
});
