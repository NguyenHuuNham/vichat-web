const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function parseTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const source = typeof value === 'object' && value !== null
    ? value.createdAt || value.updatedAt || value.timestamp || value.time
    : value;
  if (typeof source === 'number' && Number.isFinite(source)) return source;
  const parsed = Date.parse(String(source || ''));
  if (Number.isFinite(parsed)) return parsed;

  const clock = String(source || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!clock) return 0;
  const today = new Date();
  today.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
  return today.getTime();
}

function calendarDayDifference(timestamp, now) {
  const messageDate = new Date(timestamp);
  const currentDate = new Date(now);
  const messageDay = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
  const currentDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
  return Math.max(0, Math.floor((currentDay.getTime() - messageDay.getTime()) / DAY_MS));
}

function pad(value) {
  return String(value).padStart(2, '0');
}

export function formatConversationListTime(value, now = Date.now()) {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return typeof value === 'object' ? String(value?.time || '') : String(value || '');

  const days = calendarDayDifference(timestamp, now);
  if (days === 1) return 'Hôm qua';
  if (days >= 7) {
    const date = new Date(timestamp);
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
  }
  if (days > 1) return `${days} ngày`;

  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < MINUTE_MS) return 'Vừa xong';
  if (elapsed < HOUR_MS) return `${Math.max(1, Math.floor(elapsed / MINUTE_MS))} phút`;
  return `${Math.max(1, Math.floor(elapsed / HOUR_MS))} giờ`;
}

export function formatMessageTime(value, fallback = '') {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return fallback || (typeof value === 'object' ? String(value?.time || '') : String(value || ''));
  return new Date(timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function formatMessageDateLabel(value, now = Date.now()) {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return '';

  const days = calendarDayDifference(timestamp, now);
  if (days === 0) return 'Hôm nay';
  if (days === 1) return 'Hôm qua';
  const date = new Date(timestamp);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatFullMessageDateTime(value, fallback = '') {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return fallback || (typeof value === 'object' ? String(value?.time || '') : String(value || ''));
  return new Date(timestamp).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
