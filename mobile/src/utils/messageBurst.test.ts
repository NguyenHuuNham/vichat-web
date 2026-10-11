import { describe, expect, it } from 'vitest';
import { mergeConversation, mergeConversationIntoList } from './conversationSync';
import { Conversation, ChatMessage } from '../types';

describe('Message Burst & High Throughput Handling', () => {
  const baseTime = Date.now();
  const baseConversation = (id: string): Conversation => ({
    id,
    managementId: id,
    tinodeTopic: `grp-${id}`,
    snapshotSource: 'tinode',
    name: 'Burst Group Chat',
    isGroup: true,
    avatarUrl: '',
    messages: [],
    badge: 0,
    readSeq: 0,
    members: [
      { id: 'usr-me', uid: 'usr-me', name: 'Me', username: 'me', active: true, tenantId: 't1' },
      { id: 'usr-peer', uid: 'usr-peer', name: 'Peer', username: 'peer', active: true, tenantId: 't1' },
    ],
    participantIds: ['usr-me', 'usr-peer'],
    lastMsg: '',
    time: '10:00',
    updatedAt: new Date(baseTime).toISOString(),
  });

  it('correctly coalesces rapid burst message snapshots without dropping messages', () => {
    let current = baseConversation('room-burst');

    // Simulate 50 rapid burst messages arriving
    for (let i = 1; i <= 50; i++) {
      const burstMsg: ChatMessage = {
        id: `msg-burst-${i}`,
        type: 'text',
        sender: 'incoming',
        senderId: 'usr-peer',
        senderName: 'Peer',
        text: `Flood message ${i}`,
        seq: i,
        createdAt: new Date(baseTime + i * 500).toISOString(),
        pending: false,
        failed: false,
      };

      const incomingSnapshot: Conversation = {
        ...current,
        messages: [...current.messages, burstMsg],
        lastMsg: burstMsg.text,
        updatedAt: burstMsg.createdAt,
        badge: i,
      };

      current = mergeConversation(current, incomingSnapshot);
    }

    expect(current.messages.length).toBe(50);
    expect(current.messages[0].id).toBe('msg-burst-1');
    expect(current.messages[49].id).toBe('msg-burst-50');
    expect(current.lastMsg).toBe('Flood message 50');
    expect(current.badge).toBe(50);
  });

  it('deduplicates burst messages with identical sequence numbers or ids', () => {
    let current = baseConversation('room-dedupe');

    const msg1: ChatMessage = {
      id: 'dup-1',
      type: 'text',
      sender: 'incoming',
      senderId: 'usr-peer',
      senderName: 'Peer',
      text: 'Original',
      seq: 10,
      createdAt: new Date(baseTime + 1000).toISOString(),
      pending: false,
      failed: false,
    };

    current = mergeConversation(current, {
      ...current,
      messages: [msg1],
      lastMsg: msg1.text,
    });

    // Burst sends duplicate of msg-1 with updated delivery status
    const msg1Duplicate: ChatMessage = {
      ...msg1,
      deliveryStatus: 'read',
    };

    current = mergeConversation(current, {
      ...current,
      messages: [msg1Duplicate],
    });

    expect(current.messages.length).toBe(1);
    expect(current.messages[0].deliveryStatus).toBe('read');
  });

  it('correctly merges conversations into list preserving sorting and membership', () => {
    const conv1 = baseConversation('room-1');
    const conv2 = baseConversation('room-2');
    const list = [conv1, conv2];

    const updatedConv1: Conversation = {
      ...conv1,
      lastMsg: 'New burst message',
      updatedAt: new Date(baseTime + 5000).toISOString(),
    };

    const nextList = mergeConversationIntoList(list, updatedConv1);
    expect(nextList.length).toBe(2);
    expect(nextList[0].id).toBe('room-1');
    expect(nextList[0].lastMsg).toBe('New burst message');
  });
});
