import { describe, expect, it } from 'vitest';
import { accountIdForMember, canonicalAccountIds, normalizeParticipant, tinodeUidForMember } from './identity';

describe('mobile participant identity contract', () => {
  const directory = [
    { id: 'account-a', uid: 'usr-a', tinodeUid: 'usr-a', name: 'A' },
    { id: 'account-b', uid: 'usr-b', tinodeUid: 'usr-b', name: 'B' },
  ];

  it('resolves Account ID from a Tinode-only member through the directory', () => {
    expect(accountIdForMember({ id: 'usr-a', uid: 'usr-a' }, directory)).toBe('account-a');
    expect(tinodeUidForMember({ id: 'usr-a', uid: 'usr-a' })).toBe('usr-a');
  });

  it('never sends Tinode UIDs as Chatmgt participant IDs', () => {
    expect(canonicalAccountIds(['account-a', 'usr-b'], directory)).toEqual(['account-a']);
  });

  it('returns both IDs when the backend mapping is complete', () => {
    expect(normalizeParticipant({ id: 'account-a', uid: 'usr-a', name: 'A' }, directory)).toMatchObject({
      accountId: 'account-a',
      tinodeUid: 'usr-a',
      name: 'A',
    });
  });
});
