import { describe, expect, it } from 'vitest';
import { applyEditToMessage, buildEditEvent, buildRecallEvent, canEditMessage, canInteractWithMessage, canRecallMessage, editActorMatchesMessage, editTargetsMessage, recallAppliesToViewer } from './messagePolicy';

describe('message policy', () => {
  it('does not allow recall while a message is pending or failed', () => {
    expect(canRecallMessage({ id: 'a', type: 'text', sender: 'outgoing', senderId: 'usr1', senderName: 'Bạn', text: 'x', pending: true })).toBe(false);
    expect(canRecallMessage({ id: 'a', type: 'text', sender: 'outgoing', senderId: 'usr1', senderName: 'Bạn', text: 'x', deliveryStatus: 'sent' })).toBe(true);
  });
  it('allows only delivered text messages to be edited', () => {
    const message: any = { id: 'a', seq: 9, type: 'text', sender: 'outgoing', senderId: 'usr1', senderName: 'Bạn', text: 'x', deliveryStatus: 'sent' };
    expect(canEditMessage(message)).toBe(true);
    expect(canEditMessage({ ...message, pending: true })).toBe(false);
    expect(canEditMessage({ ...message, failed: true })).toBe(false);
    expect(canEditMessage({ ...message, type: 'file' })).toBe(false);
    expect(canEditMessage({ ...message, recalled: true })).toBe(false);
  });
  it('uses the Tinode actor and sequence for edit projection', () => {
    const message: any = { id: 'current', seq: 9, type: 'text', sender: 'incoming', senderId: 'usr1', text: 'old' };
    expect(buildEditEvent(message, 'usr-real', 'new').actorId).toBe('usr-real');
    expect(editTargetsMessage({ editEvent: { targetId: 'legacy', targetSeq: 9 } }, message)).toBe(true);
    expect(editTargetsMessage({ editEvent: { targetId: 'current', targetSeq: 8 } }, message)).toBe(false);
    expect(editActorMatchesMessage({ senderId: 'usr1' }, message)).toBe(true);
    expect(editActorMatchesMessage({ senderId: 'usr-other' }, message)).toBe(false);
  });
  it('keeps edit history ordered and ignores duplicate events', () => {
    const message: any = { id: 'a', seq: 9, type: 'text', sender: 'incoming', senderId: 'usr1', text: 'one' };
    const first = applyEditToMessage(message, { id: 'edit-1', seq: 10, senderId: 'usr1', editEvent: { targetId: 'a', targetSeq: 9, text: 'two', previousText: 'one', createdAt: '2026-08-28T01:00:00.000Z' } });
    const second = applyEditToMessage(first, { id: 'edit-2', seq: 11, senderId: 'usr1', editEvent: { targetId: 'a', targetSeq: 9, text: 'three', previousText: 'two', createdAt: '2026-08-28T01:01:00.000Z' } });
    expect(second.text).toBe('three');
    expect(second.editHistory?.map(item => item.text)).toEqual(['one', 'two']);
    expect(applyEditToMessage(second, { id: 'other-id', seq: 11, senderId: 'usr1', editEvent: { targetId: 'a', targetSeq: 9, text: 'three' } })).toBe(second);
  });
  it('binds recall to the Tinode actor', () => {
    expect(buildRecallEvent({ id: 'a', seq: 9, type: 'text', sender: 'outgoing', senderId: 'legacy', senderName: 'Bạn', text: 'x' }, 'usr-real').actorId).toBe('usr-real');
    expect(buildRecallEvent({ id: 'a', seq: 9, type: 'text', sender: 'outgoing', senderId: 'legacy', senderName: 'Bạn', text: 'x' }, 'usr-real', 'self').mode).toBe('self');
  });
  it('blocks every message action after recall', () => {
    expect(canInteractWithMessage({ recalled: true } as any)).toBe(false);
    expect(canInteractWithMessage({ recalled: false } as any)).toBe(true);
  });
  it('shows self recall only to the authenticated author', () => {
    const author = { isMe: (uid: string) => uid === 'usr-author' };
    const other = { isMe: (uid: string) => uid === 'usr-other' };
    expect(recallAppliesToViewer({ mode: 'self', actorId: 'usr-author' }, author)).toBe(true);
    expect(recallAppliesToViewer({ mode: 'self', actorId: 'usr-author' }, other)).toBe(false);
    expect(recallAppliesToViewer({ mode: 'all', actorId: 'usr-author' }, other)).toBe(true);
  });
});
