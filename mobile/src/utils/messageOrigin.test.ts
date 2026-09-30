import { describe, expect, it } from 'vitest';
import {
  hasKnownMessageOrigin,
  isOwnTinodeMessage,
  isOwnMessageOrigin,
  isSafeIncomingMessageOrigin,
  resolveTinodeMessageOrigin,
} from './messageOrigin';

function client(currentUserId = 'usr-current') {
  return {
    getCurrentUserID: () => currentUserId,
    isMe: (uid: string) => uid === currentUserId,
  };
}

describe('Tinode message origin', () => {
  it('treats the sender header as own when the packet from field is an alias', () => {
    expect(resolveTinodeMessageOrigin({
      from: 'usr-current-alias',
      head: { 'x-sender-id': 'usr-current' },
    }, client())).toEqual({ senderId: 'usr-current', outgoing: true });
  });

  it('keeps a normal own Tinode echo outgoing', () => {
    expect(isOwnTinodeMessage({ from: 'usr-current' }, client())).toBe(true);
  });

  it('does not classify another user as outgoing', () => {
    expect(resolveTinodeMessageOrigin({
      from: 'usr-other',
      head: { 'x-sender-id': 'usr-other' },
    }, client())).toEqual({ senderId: 'usr-other', outgoing: false });
  });
});

describe('isOwnMessageOrigin with Account ID', () => {
  it('detects own message via x-vichat-sender-id header', () => {
    expect(isOwnMessageOrigin({
      from: 'usr-unknown',
      head: { 'x-vichat-sender-id': 'account-123' },
    }, client(), { accountId: 'account-123', tinodeUid: 'usr-current' })).toBe(true);
  });

  it('detects own message via x-sender-id Account ID', () => {
    expect(isOwnMessageOrigin({
      from: 'usr-other',
      head: { 'x-sender-id': 'account-123' },
    }, client('usr-different'), { accountId: 'account-123' })).toBe(true);
  });

  it('detects own message via content.sender_id Account ID', () => {
    expect(isOwnMessageOrigin({
      from: 'usr-other',
      content: { sender_id: 'my-account-id' },
    }, client('usr-current'), { accountId: 'my-account-id', tinodeUid: 'usr-current' })).toBe(true);
  });

  it('does not classify another user as own via Account ID', () => {
    expect(isOwnMessageOrigin({
      from: 'usr-other',
      head: { 'x-sender-id': 'account-456' },
    }, client(), { accountId: 'account-123', tinodeUid: 'usr-current' })).toBe(false);
  });

  it('allows a verified recipient packet to notify', () => {
    const packet = { from: 'usr-other', head: { 'x-sender-id': 'account-456' } };
    expect(hasKnownMessageOrigin(packet, client(), { accountId: 'account-123' })).toBe(true);
    expect(isSafeIncomingMessageOrigin(packet, client(), { accountId: 'account-123' })).toBe(true);
  });

  it('blocks own packets even when the Tinode from field is an alias', () => {
    const packet = { from: 'usr-current-alias', head: { 'x-vichat-sender-id': 'account-123' } };
    expect(isSafeIncomingMessageOrigin(packet, client(), { accountId: 'account-123' })).toBe(false);
  });

  it('fails closed when sender or viewer identity is missing', () => {
    expect(isSafeIncomingMessageOrigin({}, client(), { accountId: 'account-123' })).toBe(false);
    expect(isSafeIncomingMessageOrigin({ from: 'usr-other' }, {})).toBe(false);
  });

  it('falls back to Tinode check when no currentIdentity', () => {
    expect(isOwnMessageOrigin({ from: 'usr-current' }, client(), null)).toBe(true);
    expect(isOwnMessageOrigin({ from: 'usr-other' }, client(), null)).toBe(false);
  });

  it('returns false when currentIdentity is empty', () => {
    expect(isOwnMessageOrigin({
      from: 'usr-other',
      head: { 'x-sender-id': 'usr-other' },
    }, client(), {})).toBe(false);
  });

  it('handles missing sender identity safely without treating as incoming', () => {
    // When there's no sender info at all but we have identity, don't create notification
    expect(isOwnMessageOrigin({}, client(), { accountId: 'account-123' })).toBe(false);
  });

  it('detects own message via data.account_id', () => {
    expect(isOwnMessageOrigin({
      data: { account_id: 'my-account' },
    }, client('usr-x'), { accountId: 'my-account' })).toBe(true);
  });
});
