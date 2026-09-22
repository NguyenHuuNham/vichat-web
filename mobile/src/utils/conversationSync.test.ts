import { describe, expect, it } from 'vitest';
import { dedupeConversations, retainAvailableConversations } from './conversationSync';

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

  it('keeps one canonical row when duplicate records share a Tinode topic', () => {
    const duplicate = {
      ...conversation('newer', 'usr-peer'),
      name: 'Current name',
      updatedAt: '2026-09-21T10:00:00Z',
    };
    const older = {
      ...conversation('older', 'usr-peer'),
      name: 'Old name',
      updatedAt: '2026-09-20T10:00:00Z',
    };

    expect(dedupeConversations([older, duplicate])).toEqual([
      expect.objectContaining({ id: 'newer', name: 'Current name', tinodeTopic: 'usr-peer' }),
    ]);
  });
});
