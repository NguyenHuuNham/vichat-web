import { describe, expect, it } from 'vitest';
import { applyPollEvent, normalizePoll, pollCanViewerLock, pollOptionVoteCounts } from './poll';

const basePoll = normalizePoll({
  id: 'poll-1',
  question: 'Chon mot',
  options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
  creatorId: 'usr-owner',
  settings: { allowMultiple: false },
})!;

describe('poll utilities', () => {
  it('normalizes options and keeps a safe default settings shape', () => {
    expect(basePoll).toEqual(expect.objectContaining({ id: 'poll-1', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }));
    expect(basePoll?.settings.allowMultiple).toBe(false);
    expect(normalizePoll({ question: 'Missing options' })).toBeNull();
  });

  it('projects a single-choice vote and replaces the same actor vote', () => {
    const first = applyPollEvent(basePoll, { action: 'poll_vote', pollId: 'poll-1', optionIds: ['a', 'b'] }, 'usr-voter', 3)!;
    const second = applyPollEvent(first, { action: 'poll_vote', pollId: 'poll-1', optionIds: ['b'] }, 'usr-voter', 4)!;
    expect(pollOptionVoteCounts(second)).toEqual({ a: 0, b: 1 });
  });

  it('allows an owner or admin to lock a poll, but not a regular member', () => {
    expect(pollCanViewerLock(basePoll, ['usr-member'], [{ id: 'usr-member', groupRole: 'MEMBER' }])).toBe(false);
    expect(pollCanViewerLock(basePoll, ['usr-admin'], [{ id: 'usr-admin', groupRole: 'ADMIN' }])).toBe(true);
    const locked = applyPollEvent(basePoll, { action: 'poll_locked', pollId: 'poll-1' }, 'usr-admin', 5, [{ id: 'usr-admin', groupRole: 'ADMIN' }]);
    expect(locked?.locked).toBe(true);
  });

  it('allows a Tinode deputy mode to lock a poll', () => {
    expect(pollCanViewerLock(basePoll, ['usr-deputy'], [
      { id: 'usr-deputy', mode: 'JRWPASD' },
    ])).toBe(true);
  });
});
