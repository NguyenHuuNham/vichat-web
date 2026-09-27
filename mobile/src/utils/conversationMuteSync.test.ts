import { describe, expect, it } from 'vitest';
import { dedupeConversations } from './conversationSync';

describe('conversation notification mute sync', () => {
  it('keeps Chatmgt mute metadata when a Tinode snapshot is merged', () => {
    const managed = {
      id: 'conversation-1',
      managementId: 'conversation-1',
      tinodeTopic: 'usr-peer',
      name: 'Peer',
      isGroup: false,
      messages: [],
      badge: 0,
      notificationMutedUntil: 0,
      snapshotSource: 'management',
    } as any;
    const realtime = {
      id: 'usr-peer',
      managementId: 'usr-peer',
      tinodeTopic: 'usr-peer',
      name: 'Peer',
      isGroup: false,
      messages: [],
      badge: 0,
      notificationMutedUntil: null,
      snapshotSource: 'tinode',
    } as any;

    expect(dedupeConversations([managed, realtime])[0].notificationMutedUntil).toBe(0);
    expect(dedupeConversations([
      { ...managed, updatedAt: '2026-09-27T20:00:00Z' },
      { ...managed, notificationMutedUntil: null, updatedAt: '2026-09-27T20:01:00Z' },
    ])[0].notificationMutedUntil).toBeNull();
  });
});
