import { describe, expect, it } from 'vitest';
import { buildRecallEvent, canRecallMessage } from './messagePolicy';

describe('message policy', () => {
  it('does not allow recall while a message is pending or failed', () => {
    expect(canRecallMessage({ id: 'a', type: 'text', sender: 'outgoing', senderId: 'usr1', senderName: 'Bạn', text: 'x', pending: true })).toBe(false);
    expect(canRecallMessage({ id: 'a', type: 'text', sender: 'outgoing', senderId: 'usr1', senderName: 'Bạn', text: 'x', deliveryStatus: 'sent' })).toBe(true);
  });
  it('binds recall to the Tinode actor', () => {
    expect(buildRecallEvent({ id: 'a', seq: 9, type: 'text', sender: 'outgoing', senderId: 'legacy', senderName: 'Bạn', text: 'x' }, 'usr-real').actorId).toBe('usr-real');
  });
});
