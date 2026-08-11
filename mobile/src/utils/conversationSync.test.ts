import { describe, expect, it } from 'vitest';
import { retainAvailableConversations } from './conversationSync';

const conversation = (id: string, tinodeTopic: string) => ({
  id,
  managementId: id,
  tinodeTopic,
  name: id,
  isGroup: false,
  messages: [],
  badge: 0,
});

describe('conversation sync', () => {
  it('removes metadata conversations whose Tinode topic is unavailable', () => {
    const conversations = [conversation('valid', 'usr-valid'), conversation('stale', 'usr-stale')];
    expect(retainAvailableConversations(conversations, new Set(['usr-valid']))).toEqual([conversations[0]]);
  });

  it('preserves Chatmgt metadata when Tinode cannot verify any topic', () => {
    const conversations = [conversation('metadata', 'usr-metadata')];
    expect(retainAvailableConversations(conversations, new Set())).toBe(conversations);
  });
});
