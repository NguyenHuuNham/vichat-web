const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function parseTimestamp(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const source = typeof value === 'object' && value !== null
    ? (value as any).createdAt || (value as any).updatedAt || (value as any).timestamp || (value as any).time
    : value;
  const parsed = Date.parse(String(source || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dayDifference(timestamp: number, now: number) {
  const date = new Date(timestamp);
  const current = new Date(now);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const currentStart = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  return Math.max(0, Math.floor((currentStart - start) / DAY_MS));
}

const pad = (value: number) => String(value).padStart(2, '0');

export function formatConversationTime(value: unknown, now = Date.now()) {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return '';
  const days = dayDifference(timestamp, now);
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

export function formatMessageTime(value: unknown) {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function formatMessageDateLabel(value: unknown, now = Date.now()) {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return '';
  const days = dayDifference(timestamp, now);
  if (days === 0) return 'Hôm nay';
  if (days === 1) return 'Hôm qua';
  const date = new Date(timestamp);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatWorkspaceDate(value: unknown, withTime = true) {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return 'Chưa đặt';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(timestamp));
}
