import { describe, expect, it } from 'vitest';
import {
  incomingCallNotificationData,
  incomingCallNotificationKey,
  isIncomingCallNotificationFresh,
  isFreshTinodeCallInvite,
  parseIncomingCallNotification,
} from './callNotificationPolicy';

describe('incoming call notification policy', () => {
  it('round-trips a valid Tinode call invite', () => {
    const data = incomingCallNotificationData({
      topic: 'usrPeer123',
      seq: 42,
      from: 'usrPeer123',
      audioOnly: false,
    }, { name: 'Nguoi goi', avatar: 'https://example.test/avatar.png' }, 1_000);

    expect(parseIncomingCallNotification(data)).toEqual(data);
    expect(incomingCallNotificationKey(data)).toBe('usrPeer123:42');
    expect(isIncomingCallNotificationFresh(data, 40_999)).toBe(true);
    expect(isIncomingCallNotificationFresh(data, 41_001)).toBe(false);
  });

  it('rejects message notifications and malformed call payloads', () => {
    expect(parseIncomingCallNotification({ conversationId: 'one' })).toBeNull();
    expect(parseIncomingCallNotification({ type: 'incoming-call', topic: 'grpRoom', seq: 42, from: 'usrPeer123', issuedAt: 1_000 })).toBeNull();
    expect(parseIncomingCallNotification({ type: 'incoming-call', topic: 'usrPeer123', seq: 0, from: 'usrPeer123', issuedAt: 1_000 })).toBeNull();
    expect(parseIncomingCallNotification({ type: 'incoming-call', topic: 'usrPeer123', seq: 42, from: 'usrPeer123' })).toBeNull();
  });

  it('accepts only live Tinode call packets', () => {
    const issuedAt = Date.parse('2026-10-02T12:00:00.000Z');
    expect(isFreshTinodeCallInvite({ ts: '2026-10-02T12:00:00.000Z' }, issuedAt + 39_999)).toBe(true);
    expect(isFreshTinodeCallInvite({ ts: '2026-10-02T12:00:00.000Z' }, issuedAt + 40_001)).toBe(false);
    expect(isFreshTinodeCallInvite({ ts: '2026-09-01T12:00:00.000Z' }, issuedAt)).toBe(false);
    expect(isFreshTinodeCallInvite({}, issuedAt)).toBe(false);
  });
});
