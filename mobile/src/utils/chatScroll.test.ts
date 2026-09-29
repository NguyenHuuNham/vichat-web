import { describe, expect, it } from 'vitest';
import { firstUnreadMessageIndex, isNearChatBottom, messageKey } from './chatScroll';

const message = (id: string, seq: number, sender: 'incoming' | 'outgoing' = 'incoming', type: any = 'text') => ({
  id,
  seq,
  type,
  sender,
  senderId: sender === 'incoming' ? 'usr-peer' : 'usr-me',
  senderName: sender === 'incoming' ? 'Peer' : 'Bạn',
  text: id,
}) as any;

describe('chat scroll state', () => {
  it('finds the first incoming user message after the read cursor', () => {
    expect(firstUnreadMessageIndex([
      message('outgoing-1', 1, 'outgoing'),
      message('reaction-2', 2, 'incoming', 'reaction'),
      message('incoming-3', 3),
    ], 2, 1)).toBe(2);
  });

  it('falls back to the first loaded incoming message when unread history is older than the page', () => {
    expect(firstUnreadMessageIndex([message('incoming-30', 30)], 5, 8)).toBe(0);
    expect(firstUnreadMessageIndex([message('incoming-30', 30)], 30, 0)).toBeNull();
  });

  it('keeps message keys stable when a message has no server sequence yet', () => {
    expect(messageKey(message('client-1', 0, 'outgoing'))).toBe('client-1');
    expect(messageKey({ ...message('', 12), id: '' })).toBe('seq-12');
  });

  it('uses a fixed pixel threshold for the latest-message affordance', () => {
    expect(isNearChatBottom(400, 1000, 450)).toBe(false);
    expect(isNearChatBottom(554, 1000, 450)).toBe(true);
  });
});
