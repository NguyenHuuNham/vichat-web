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

  it('does not jump to old history when the unread badge is stale', () => {
    expect(firstUnreadMessageIndex([
      message('incoming-30', 30),
      message('incoming-31', 31),
    ], 31, 8)).toBeNull();
  });

  it('returns null when read cursor covers all messages even if unreadCount > 0', () => {
    expect(firstUnreadMessageIndex([
      message('incoming-1', 1),
      message('incoming-2', 2),
      message('incoming-3', 3),
    ], 3, 5)).toBeNull();
  });

  it('returns null when no incoming message has seq greater than readSeq', () => {
    expect(firstUnreadMessageIndex([
      message('incoming-1', 1),
      message('outgoing-2', 2, 'outgoing'),
      message('system-3', 3, 'incoming', 'system'),
    ], 1, 2)).toBeNull();
  });

  it('returns null when messages list is empty', () => {
    expect(firstUnreadMessageIndex([], 0, 5)).toBeNull();
  });

  it('does not treat a zero read cursor as unread when the badge is clear', () => {
    expect(firstUnreadMessageIndex([message('incoming-1', 1)], 0, 0)).toBeNull();
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
