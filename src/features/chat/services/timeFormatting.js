const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const LEGACY_TIME_LABELS = new Set(['Hôm nay', 'Hôm qua', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']);

function parseTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const source = typeof value === 'object' && value !== null
    ? value.createdAt || value.updatedAt || value.timestamp || value.time
    : value;
  if (typeof source === 'number' && Number.isFinite(source)) return source;
  if (LEGACY_TIME_LABELS.has(String(source || '').trim())) return 0;
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

function formatFallbackTime(value, locale) {
  const fallback = typeof value === 'object' ? String(value?.time || '') : String(value || '');
  if (!locale.startsWith('en')) return fallback;
  return {
    'Hôm nay': 'Today',
    'Hôm qua': 'Yesterday',
    'Thứ 2': 'Monday',
    'Thứ 3': 'Tuesday',
    'Thứ 4': 'Wednesday',
    'Thứ 5': 'Thursday',
    'Thứ 6': 'Friday',
    'Thứ 7': 'Saturday',
    'Chủ nhật': 'Sunday',
  }[fallback] || fallback;
}

export function formatConversationListTime(value, now = Date.now(), locale = 'vi-VN') {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return formatFallbackTime(value, locale);

  const days = calendarDayDifference(timestamp, now);
  if (days === 1) return locale.startsWith('en') ? 'Yesterday' : 'Hôm qua';
  if (days >= 7) {
    const date = new Date(timestamp);
    if (locale.startsWith('en')) return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
  }
  if (days > 1) return locale.startsWith('en') ? `${days} days` : `${days} ngày`;

  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < MINUTE_MS) return locale.startsWith('en') ? 'Just now' : 'Vừa xong';
  if (elapsed < HOUR_MS) {
    const minutes = Math.max(1, Math.floor(elapsed / MINUTE_MS));
    return locale.startsWith('en') ? `${minutes} minute${minutes === 1 ? '' : 's'}` : `${minutes} phút`;
  }
  const hours = Math.max(1, Math.floor(elapsed / HOUR_MS));
  return locale.startsWith('en') ? `${hours} hour${hours === 1 ? '' : 's'}` : `${hours} giờ`;
}

export function formatMessageTime(value, fallback = '', locale = 'vi-VN') {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return formatFallbackTime(fallback || value, locale);
  return new Date(timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

export function formatMessageDateLabel(value, now = Date.now(), locale = 'vi-VN') {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return '';

  const days = calendarDayDifference(timestamp, now);
  if (days === 0) return locale.startsWith('en') ? 'Today' : 'Hôm nay';
  if (days === 1) return locale.startsWith('en') ? 'Yesterday' : 'Hôm qua';
  const date = new Date(timestamp);
  if (locale.startsWith('en')) return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatFullMessageDateTime(value, fallback = '', locale = 'vi-VN') {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return formatFallbackTime(fallback || value, locale);
  return new Date(timestamp).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
