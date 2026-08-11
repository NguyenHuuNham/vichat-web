import { describe, expect, it } from 'vitest';
import { applyPresenceToConversation, mapTinodeDeliveryStatus } from './tinodeState';

describe('mapTinodeDeliveryStatus', () => {
  it('maps Tinode receipt thresholds for outgoing messages', () => {
    expect(mapTinodeDeliveryStatus(50, true, 10)).toBe('sent');
    expect(mapTinodeDeliveryStatus(60, true, 10)).toBe('received');
    expect(mapTinodeDeliveryStatus(70, true, 10)).toBe('read');
  });

  it('keeps incoming and pending states stable', () => {
    expect(mapTinodeDeliveryStatus(0, false, 10)).toBe('received');
    expect(mapTinodeDeliveryStatus(20, true)).toBe('sending');
    expect(mapTinodeDeliveryStatus(30, true)).toBe('failed');
    expect(mapTinodeDeliveryStatus(0, true, 10)).toBe('sent');
  });
});

describe('applyPresenceToConversation', () => {
  it('updates the matching direct conversation without changing other topics', () => {
    const conversation: any = {
      id: 'usr-peer', tinodeTopic: 'usr-peer', managementId: '1', name: 'Peer', isGroup: false,
      membersCount: 'Offline', members: [{ id: 'usr-peer', uid: 'usr-peer', online: false }], messages: [], badge: 0,
    };

    expect(applyPresenceToConversation(conversation, 'usr-peer', true).membersCount).toBe('Đang hoạt động');
    expect(applyPresenceToConversation(conversation, 'usr-other', true)).toBe(conversation);
  });
});
