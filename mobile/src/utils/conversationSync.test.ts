import { describe, expect, it } from 'vitest';
import { applyConversationNicknameEvent, dedupeConversations, isConversationVisibleInList, isDirectConversationForUser, mergeConversation, mergeConversationIntoList, retainAvailableConversations, sortConversations } from './conversationSync';

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
  it('uses the realtime group member count instead of stale management metadata', () => {
    const managementMembers = Array.from({ length: 15 }, (_, index) => ({ id: `usr-${index}`, uid: `usr-${index}` }));
    const realtimeMembers = Array.from({ length: 23 }, (_, index) => ({ id: `usr-${index}`, uid: `usr-${index}` }));
    const merged = mergeConversation({
      ...conversation('room', 'grp-room'),
      isGroup: true,
      snapshotSource: 'management',
      membersCount: '15 members',
      members: managementMembers,
    } as any, {
      ...conversation('room', 'grp-room'),
      isGroup: true,
      snapshotSource: 'tinode',
      members: realtimeMembers,
    } as any);

    expect(merged.members).toHaveLength(23);
    expect(merged.membersCount).toBe('23 members');
  });

  it('finds an existing direct chat across Account and Tinode identities', () => {
    const user = { id: 'account-peer', uid: 'usr-peer', tinodeUid: 'usr-peer' } as any;
    expect(isDirectConversationForUser({
      ...conversation('direct', 'usr-peer'),
      participantIds: ['account-me', 'account-peer'],
    }, user)).toBe(true);
    expect(isDirectConversationForUser({
      ...conversation('direct-tinode', 'usr-peer'),
      participantIds: ['usr-me', 'usr-peer'],
    }, user)).toBe(true);
    expect(isDirectConversationForUser({
      ...conversation('direct-member', 'p2p-peer'),
      members: [{ id: 'account-peer', uid: 'usr-peer' } as any],
    }, user)).toBe(true);
  });

  it('does not reuse a group or chatbot that happens to mention the user', () => {
    const user = { id: 'account-peer', uid: 'usr-peer' } as any;
    expect(isDirectConversationForUser({ ...conversation('group', 'grp-room'), isGroup: true, participantIds: ['account-peer'] }, user)).toBe(false);
    expect(isDirectConversationForUser({ ...conversation('bot', 'usr-peer'), isChatbot: true }, user)).toBe(false);
  });

  it('removes metadata conversations whose Tinode topic is unavailable', () => {
    const conversations = [conversation('valid', 'usr-valid'), conversation('stale', 'usr-stale')];
    expect(retainAvailableConversations(conversations, new Set(['usr-valid']))).toEqual([conversations[0]]);
  });

  it('preserves Chatmgt metadata when Tinode cannot verify any topic', () => {
    const conversations = [conversation('metadata', 'usr-metadata')];
    expect(retainAvailableConversations(conversations, new Set())).toBe(conversations);
  });

  it('hides empty direct records but keeps empty groups available', () => {
    expect(isConversationVisibleInList(conversation('unverified-direct', 'usr-peer') as any)).toBe(true);
    expect(isConversationVisibleInList({ ...conversation('empty-direct', 'usr-peer'), historyVerified: true } as any)).toBe(false);
    expect(isConversationVisibleInList({ ...conversation('empty-group', 'grp-room'), isGroup: true } as any)).toBe(true);
  });

  it('hides a deleted direct record until a newer message arrives', () => {
    const deletedAt = '2026-09-21T10:00:00.000Z';
    expect(isConversationVisibleInList({
      ...conversation('deleted-empty', 'usr-peer'),
      deletedAt,
      badge: 7,
    } as any)).toBe(false);
    expect(isConversationVisibleInList({
      ...conversation('deleted', 'usr-peer'),
      deletedAt,
      messages: [{ id: 'old', type: 'text', sender: 'incoming', senderId: 'usr-peer', senderName: 'Peer', text: 'Old', createdAt: deletedAt }],
    } as any)).toBe(false);
    expect(isConversationVisibleInList({
      ...conversation('restored', 'usr-peer'),
      deletedAt,
      messages: [{ id: 'new', type: 'text', sender: 'incoming', senderId: 'usr-peer', senderName: 'Peer', text: 'New', createdAt: '2026-09-21T10:01:00.000Z' }],
    } as any)).toBe(true);
  });

  it('does not treat control packets as a direct-chat message', () => {
    expect(isConversationVisibleInList({
      ...conversation('control-only', 'usr-peer'),
      historyVerified: true,
      messages: [{
        id: 'system-1',
        type: 'system',
        sender: 'incoming',
        senderId: 'usr-peer',
        senderName: 'Peer',
        text: 'Hoat dong he thong',
        createdAt: '2026-09-21T10:00:00.000Z',
      }],
    } as any)).toBe(false);
  });

  it('clears the direct deletion marker when a newer Tinode message is merged', () => {
    const deletedAt = '2026-09-21T10:00:00.000Z';
    const merged = mergeConversation({
      ...conversation('direct', 'usr-peer'),
      deletedAt,
      updatedAt: deletedAt,
      messages: [],
    } as any, {
      ...conversation('direct', 'usr-peer'),
      snapshotSource: 'tinode',
      messages: [{ id: 'new', type: 'text', sender: 'incoming', senderId: 'usr-peer', senderName: 'Peer', text: 'New', seq: 2, createdAt: '2026-09-21T10:01:00.000Z' }],
    } as any);
    expect(merged.deletedAt).toBe('');
    expect(isConversationVisibleInList(merged)).toBe(true);
  });

  it('keeps the deletion marker when only a control packet is merged', () => {
    const deletedAt = '2026-09-21T10:00:00.000Z';
    const merged = mergeConversation({
      ...conversation('direct', 'usr-peer'),
      deletedAt,
      updatedAt: deletedAt,
      messages: [],
    } as any, {
      ...conversation('direct', 'usr-peer'),
      snapshotSource: 'tinode',
      messages: [{
        id: 'system-1',
        type: 'system',
        sender: 'incoming',
        senderId: 'usr-peer',
        senderName: 'Peer',
        text: 'Hoat dong he thong',
        seq: 2,
        createdAt: '2026-09-21T10:01:00.000Z',
      }],
    } as any);
    expect(merged.deletedAt).toBe(deletedAt);
    expect(isConversationVisibleInList(merged)).toBe(false);
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

  it('merges realtime snapshots instead of replacing history and pending sends', () => {
    const current = {
      ...conversation('room', 'grp-room'),
      updatedAt: '2026-09-21T10:00:00Z',
      messages: [
        { id: 'history-1', type: 'text', sender: 'incoming', senderId: 'usr-a', senderName: 'A', text: 'Cũ', seq: 1, createdAt: '2026-09-21T09:00:00Z' },
        { id: 'pending-1', type: 'text', sender: 'outgoing', senderId: 'usr-me', senderName: 'Bạn', text: 'Đang gửi', pending: true },
      ],
    } as any;
    const snapshot = {
      ...conversation('room', 'grp-room'),
      updatedAt: '2026-09-21T10:01:00Z',
      messages: [
        { id: 'pending-1', type: 'text', sender: 'outgoing', senderId: 'usr-me', senderName: 'Bạn', text: 'Đang gửi', seq: 2, deliveryStatus: 'sent', createdAt: '2026-09-21T10:01:00Z' },
        { id: 'new-1', type: 'text', sender: 'incoming', senderId: 'usr-b', senderName: 'B', text: 'Mới', seq: 3, createdAt: '2026-09-21T10:02:00Z' },
      ],
    } as any;

    const merged = mergeConversation(current, snapshot);
    expect(merged.messages.map(message => message.id)).toEqual(['history-1', 'pending-1', 'new-1']);
    expect(merged.messages[1]).toEqual(expect.objectContaining({ pending: false, deliveryStatus: 'sent', seq: 2 }));
  });

  it('reuses unchanged message references across repeated realtime snapshots', () => {
    const existingMessage = {
      id: 'message-1',
      type: 'text',
      sender: 'incoming',
      senderId: 'usr-peer',
      senderName: 'Peer',
      text: 'Same message',
      seq: 7,
      createdAt: '2026-09-21T10:00:00Z',
      pending: false,
      failed: false,
    };
    const current = {
      ...conversation('room', 'usr-peer'),
      snapshotSource: 'tinode',
      messages: [existingMessage],
    } as any;
    const snapshot = {
      ...conversation('room', 'usr-peer'),
      snapshotSource: 'tinode',
      messages: [{ ...existingMessage, raw: { seq: 7 } }],
    } as any;

    const merged = mergeConversation(current, snapshot);
    expect(merged.messages).toBe(current.messages);
    expect(merged.messages[0]).toBe(existingMessage);
  });

  it('reuses the conversation and list references for an unchanged realtime snapshot', () => {
    const current = {
      ...conversation('room', 'grp-room'),
      snapshotSource: 'tinode',
      lastMsg: 'Same',
      time: '10:00',
      updatedAt: '2026-09-21T10:00:00Z',
      participantIds: ['usr-me', 'usr-peer'],
      pendingMembers: [],
      members: [{ id: 'usr-me', uid: 'usr-me', tinodeUid: 'usr-me', name: 'Me', nickname: '', conversationNickname: '', conversation_nickname: '' }, { id: 'usr-peer', uid: 'usr-peer', tinodeUid: 'usr-peer', name: 'Peer', nickname: '', conversationNickname: '', conversation_nickname: '' }],
      messages: [{ id: 'message-1', type: 'text', sender: 'incoming', senderId: 'usr-peer', senderName: 'Peer', text: 'Same', seq: 7, createdAt: '2026-09-21T10:00:00Z', pending: false, failed: false }],
    } as any;
    const snapshot = {
      ...current,
      participantIds: [...current.participantIds],
      members: current.members.map((member: any) => ({ ...member })),
      messages: current.messages.map((message: any) => ({ ...message, raw: { seq: 7 } })),
    } as any;

    expect(mergeConversation(current, snapshot)).toBe(current);
    expect(mergeConversationIntoList([current], snapshot)[0]).toBe(current);
  });

  it('keeps viewer-scoped notification mute across Tinode snapshots', () => {
    const managed = {
      ...conversation('room', 'grp-room'),
      snapshotSource: 'management',
      notificationMutedUntil: 0,
    } as any;
    const realtime = {
      ...conversation('room', 'grp-room'),
      snapshotSource: 'tinode',
      notificationMutedUntil: null,
    } as any;

    expect(mergeConversation(managed, realtime).notificationMutedUntil).toBe(0);
    expect(mergeConversation(managed, {
      ...managed,
      notificationMutedUntil: null,
    } as any).notificationMutedUntil).toBeNull();
  });

  it('keeps pinned rooms first while sorting activity newest first', () => {
    const pinned = { ...conversation('pinned', 'usr-pinned'), pinned: true, updatedAt: '2026-09-20T00:00:00Z' } as any;
    const active = { ...conversation('active', 'usr-active'), updatedAt: '2026-09-22T00:00:00Z' } as any;
    expect(sortConversations([active, pinned]).map(item => item.id)).toEqual(['pinned', 'active']);
  });

  it('keeps the Chatmgt id when a Tinode-only snapshot arrives', () => {
    const metadata = {
      ...conversation('conversation-1', 'usr-peer'),
      managementId: 'conversation-1',
      updatedAt: '2026-09-21T10:00:00Z',
    } as any;
    const snapshot = {
      ...conversation('usr-peer', 'usr-peer'),
      managementId: 'usr-peer',
      updatedAt: '2026-09-21T10:01:00Z',
      messages: [{ id: 'message-1', type: 'text', sender: 'incoming', senderId: 'usr-peer', senderName: 'Peer', text: 'Mới', seq: 1, createdAt: '2026-09-21T10:01:00Z' }],
    } as any;

    const merged = mergeConversation(metadata, snapshot);
    expect(merged.id).toBe('conversation-1');
    expect(merged.managementId).toBe('conversation-1');
    expect(merged.tinodeTopic).toBe('usr-peer');
  });

  it('keeps optimistic messages in chronological position instead of treating them as sequence zero', () => {
    const current = {
      ...conversation('room', 'usr-peer'),
      messages: [{ id: 'server-1', type: 'text', sender: 'incoming', senderId: 'usr-peer', senderName: 'Peer', text: 'Cũ', seq: 1, createdAt: '2026-09-21T10:00:00Z' }],
    } as any;
    const pending = {
      ...conversation('room', 'usr-peer'),
      messages: [{ id: 'pending-1', type: 'text', sender: 'outgoing', senderId: 'usr-me', senderName: 'Bạn', text: 'Đang gửi', pending: true, createdAt: '2026-09-21T10:03:00Z' }],
    } as any;
    const snapshot = {
      ...conversation('room', 'usr-peer'),
      messages: [{ id: 'server-2', type: 'text', sender: 'incoming', senderId: 'usr-peer', senderName: 'Peer', text: 'Mới', seq: 2, createdAt: '2026-09-21T10:02:00Z' }],
    } as any;

    const merged = mergeConversation(mergeConversation(current, pending), snapshot);
    expect(merged.messages.map(message => message.id)).toEqual(['server-1', 'server-2', 'pending-1']);
  });

  it('reconciles a server echo by sequence when the client id is not echoed back', () => {
    const current = {
      ...conversation('room', 'usr-peer'),
      messages: [{ id: 'mobile-pending', type: 'text', sender: 'outgoing', senderId: 'usr-me', senderName: 'Bạn', text: 'Đang gửi', seq: 2, pending: true, createdAt: '2026-09-21T10:01:00Z' }],
    } as any;
    const snapshot = {
      ...conversation('room', 'usr-peer'),
      messages: [{ id: 'usr-peer-2', type: 'text', sender: 'outgoing', senderId: 'usr-me', senderName: 'Bạn', text: 'Đang gửi', seq: 2, deliveryStatus: 'sent', createdAt: '2026-09-21T10:01:00Z' }],
    } as any;

    const merged = mergeConversation(current, snapshot);
    expect(merged.messages).toHaveLength(1);
    expect(merged.messages[0]).toEqual(expect.objectContaining({ id: 'usr-peer-2', seq: 2, pending: false, deliveryStatus: 'sent' }));
  });

  it('unions partial member snapshots while preserving the account id for mentions', () => {
    const current = {
      ...conversation('room', 'grp-room'),
      members: [
        { id: 'account-a', uid: 'usr-a', username: 'a', name: 'Nguyễn An' },
        { id: 'account-b', uid: 'usr-b', username: 'b', name: 'Trần Bình' },
      ],
    } as any;
    const snapshot = {
      ...conversation('room', 'grp-room'),
      messages: [],
      members: [{ id: 'usr-a', uid: 'usr-a', username: 'a', name: 'Thành viên' }],
    } as any;

    const merged = mergeConversation(current, snapshot);
    expect(merged.members?.map(member => member.id)).toEqual(['account-a', 'account-b']);
    expect(merged.members?.[0]).toEqual(expect.objectContaining({ id: 'account-a', uid: 'usr-a', name: 'Nguyễn An' }));
  });

  it('promotes an account member id when Tinode arrives before Chatmgt metadata', () => {
    const tinodeFirst = {
      ...conversation('grp-room', 'grp-room'),
      members: [{ id: 'usr-a', name: 'Thành viên', mode: 'JRWPASD' }],
      participantIds: ['usr-a'],
    } as any;
    const managementSnapshot = {
      ...conversation('account-conversation', 'grp-room'),
      managementId: 'account-conversation',
      members: [{ id: 'account-a', uid: 'usr-a', userId: 'account-a', name: 'Nguyễn An', groupRole: 'ADMIN' }],
      participantIds: ['account-a'],
      groupSettings: { allowMessages: true },
    } as any;

    const merged = mergeConversation(tinodeFirst, managementSnapshot);
    expect(merged.id).toBe('account-conversation');
    expect(merged.members).toEqual([
      expect.objectContaining({ id: 'account-a', uid: 'usr-a', groupRole: 'ADMIN', name: 'Nguyễn An' }),
    ]);
    expect(merged.participantIds).toEqual(['account-a']);
  });

  it('preserves Chatmgt group settings when a Tinode snapshot is stale', () => {
    const current = {
      ...conversation('room', 'grp-room'),
      snapshotSource: 'management',
      groupSettings: { allowMessages: true },
      members: [
        { id: 'account-a', uid: 'usr-a', name: 'Owner', groupRole: 'OWNER' },
        { id: 'account-b', uid: 'usr-b', name: 'Member', groupRole: 'MEMBER' },
      ],
    } as any;
    const snapshot = {
      ...conversation('room', 'grp-room'),
      snapshotSource: 'tinode',
      groupSettings: { allowMessages: false },
      members: [{ id: 'usr-a', uid: 'usr-a', name: 'Member', mode: 'JRWPASO' }],
    } as any;

    const merged = mergeConversation(current, snapshot);
    expect(merged.members).toEqual([
      expect.objectContaining({ id: 'account-a', uid: 'usr-a', groupRole: 'OWNER' }),
      expect.objectContaining({ id: 'account-b', uid: 'usr-b', groupRole: 'MEMBER' }),
    ]);
    expect(merged.groupSettings).toEqual({ allowMessages: true });
  });

  it('keeps a conversation nickname when Tinode publishes an official member name', () => {
    const managed = {
      ...conversation('direct', 'usr-peer'),
      snapshotSource: 'management',
      name: 'Alias',
      conversationNicknames: { 'account-peer': 'Alias' },
      members: [{ id: 'account-peer', uid: 'usr-peer', name: 'Alias', defaultName: 'Peer' }],
      messages: [{ id: 'old', type: 'text', sender: 'incoming', senderId: 'usr-peer', senderName: 'Alias', text: 'Cũ', seq: 1 }],
    } as any;
    const tinode = {
      ...conversation('usr-peer', 'usr-peer'),
      managementId: 'usr-peer',
      snapshotSource: 'tinode',
      name: 'Peer',
      members: [{ id: 'usr-peer', uid: 'usr-peer', name: 'Peer' }],
      messages: [{ id: 'new', type: 'text', sender: 'incoming', senderId: 'usr-peer', senderName: 'Peer', text: 'Mới', seq: 2 }],
    } as any;

    const merged = mergeConversation(managed, tinode);
    expect(merged.name).toBe('Alias');
    expect(merged.members?.[0]).toEqual(expect.objectContaining({ id: 'account-peer', name: 'Alias', conversationNickname: 'Alias' }));
    expect(merged.messages.map(message => message.senderName)).toEqual(['Alias', 'Alias']);
  });

  it('restores the official name when a conversation nickname is cleared', () => {
    const managed = {
      ...conversation('direct', 'usr-peer'),
      snapshotSource: 'management',
      name: 'Alias',
      conversationNicknames: { 'account-peer': 'Alias' },
      members: [{ id: 'account-peer', uid: 'usr-peer', name: 'Alias', defaultName: 'Peer', conversationNickname: 'Alias' }],
      messages: [{ id: 'old', type: 'text', sender: 'incoming', senderId: 'usr-peer', senderName: 'Alias', text: 'Cũ', seq: 1 }],
    } as any;
    const cleared = {
      ...managed,
      name: 'Peer',
      conversationNicknames: {},
      members: [{ id: 'account-peer', uid: 'usr-peer', name: 'Peer', defaultName: 'Peer', conversationNickname: '' }],
    } as any;

    const merged = mergeConversation(managed, cleared);
    expect(merged.conversationNicknames).toEqual({});
    expect(merged.name).toBe('Peer');
    expect(merged.members?.[0]).toEqual(expect.objectContaining({ name: 'Peer', conversationNickname: '' }));
    expect(merged.messages[0].senderName).toBe('Peer');
  });

  it('applies a realtime nickname event without dropping other aliases', () => {
    const room = {
      ...conversation('room', 'grp-room'),
      conversationNicknames: { 'account-other': 'Other' },
      members: [
        { id: 'account-peer', uid: 'usr-peer', name: 'Peer', defaultName: 'Peer' },
        { id: 'account-other', uid: 'usr-other', name: 'Other', defaultName: 'Other' },
      ],
      messages: [{ id: 'message-1', type: 'text', sender: 'incoming', senderId: 'usr-peer', senderName: 'Peer', text: 'Hi', seq: 1 }],
    } as any;

    const updated = applyConversationNicknameEvent(room, {
      action: 'conversation_nickname_changed',
      targetId: 'usr-peer',
      targetAccountId: 'account-peer',
      newNickname: 'Teammate',
    });
    expect(updated.conversationNicknames).toEqual({ 'account-other': 'Other', 'account-peer': 'Teammate' });
    expect(updated.members?.[0]).toEqual(expect.objectContaining({ name: 'Teammate' }));
    expect(updated.messages[0].senderName).toBe('Teammate');
  });

  it('lets an authoritative management snapshot remove a member', () => {
    const current = {
      ...conversation('room', 'grp-room'),
      snapshotSource: 'management',
      members: [
        { id: 'account-a', uid: 'usr-a', name: 'Owner', groupRole: 'OWNER' },
        { id: 'account-b', uid: 'usr-b', name: 'Member', groupRole: 'MEMBER' },
      ],
    } as any;
    const snapshot = {
      ...conversation('room', 'grp-room'),
      snapshotSource: 'management',
      members: [{ id: 'account-a', uid: 'usr-a', name: 'Owner', groupRole: 'OWNER' }],
    } as any;

    const merged = mergeConversation(current, snapshot);
    expect(merged.members?.map(member => member.id)).toEqual(['account-a']);
  });
});
