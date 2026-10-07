import { describe, expect, it } from 'vitest';
import { GROUP_EVENT_ACTION, formatGroupEventDate, normalizeGroupEvent } from './groupEvent';

describe('group events', () => {
  it('normalizes a Tinode group event envelope', () => {
    const event = normalizeGroupEvent({
      action: GROUP_EVENT_ACTION,
      groupEvent: {
        eventId: 'event-1',
        title: 'Họp nhóm',
        startsAt: '2026-10-03T09:30:00.000Z',
        note: 'Chuẩn bị nội dung.',
        reminderMinutes: 30,
      },
      actorId: 'usr-owner',
      actorName: 'Owner',
    });

    expect(event).toMatchObject({
      id: 'event-1',
      title: 'Họp nhóm',
      startsAt: '2026-10-03T09:30:00.000Z',
      note: 'Chuẩn bị nội dung.',
      reminderMinutes: 30,
      creatorId: 'usr-owner',
      creatorName: 'Owner',
    });
  });

  it('rejects incomplete events and formats dates as day/month/year', () => {
    expect(normalizeGroupEvent({ action: GROUP_EVENT_ACTION, title: 'Thiếu ngày' })).toBeNull();
    expect(formatGroupEventDate('2026-10-03T09:30:00')).toBe('03/10/2026 09:30');
  });
});
