import { GroupEvent } from '../types';

export const GROUP_EVENT_ACTION = 'group_event_created';

const MAX_ID = 120;
const MAX_TITLE = 180;
const MAX_NOTE = 1000;

function text(value: unknown, max: number) {
  return (typeof value === 'string' || typeof value === 'number')
    ? String(value).trim().slice(0, max)
    : '';
}

function isoDate(value: unknown) {
  if (typeof value === 'number') {
    const numeric = new Date(value < 10_000_000_000 ? value * 1000 : value);
    return Number.isNaN(numeric.getTime()) ? '' : numeric.toISOString();
  }
  const parsed = new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

export function normalizeGroupEvent(value: unknown): GroupEvent | null {
  const sourceValue = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
  const source = sourceValue.groupEvent && typeof sourceValue.groupEvent === 'object'
    ? sourceValue.groupEvent as Record<string, any>
    : sourceValue;
  const id = text(source.id || source.eventId || source.event_id, MAX_ID);
  const title = text(source.title || source.name, MAX_TITLE);
  const startsAt = isoDate(source.startsAt || source.starts_at || source.startAt || source.start_at);
  if (!id || !title || !startsAt) return null;
  const endsAt = isoDate(source.endsAt || source.ends_at || source.endAt || source.end_at);
  const reminderMinutes = Math.max(0, Math.min(7 * 24 * 60, Math.trunc(Number(source.reminderMinutes || source.reminder_minutes || 0))));
  return {
    id,
    title,
    startsAt,
    ...(endsAt ? { endsAt } : {}),
    note: text(source.note || source.description, MAX_NOTE),
    reminderMinutes,
    creatorId: text(source.creatorId || source.creator_id || source.actorId || source.actor_id || sourceValue.actorId || sourceValue.actor_id, MAX_ID),
    creatorName: text(source.creatorName || source.creator_name || source.actorName || source.actor_name || sourceValue.actorName || sourceValue.actor_name, 120),
  };
}

export function formatGroupEventDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}
