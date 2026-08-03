const HOUR_MS = 60 * 60 * 1000;

export const NOTIFICATION_MUTE_OPTIONS = Object.freeze({
  ONE_HOUR: 'one-hour',
  FOUR_HOURS: 'four-hours',
  UNTIL_EIGHT: 'until-eight',
  UNTIL_MANUAL: 'until-manual',
});

export function normalizeNotificationMuteUntil(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) return null;
  return Math.trunc(normalized);
}

export function isConversationMuted(value, nowMs = Date.now()) {
  const muteUntil = normalizeNotificationMuteUntil(value);
  if (muteUntil === null) return false;
  return muteUntil === 0 || muteUntil * 1000 > nowMs;
}

export function resolveNotificationMuteUntil(option, nowMs = Date.now()) {
  if (option === NOTIFICATION_MUTE_OPTIONS.UNTIL_MANUAL) return 0;
  if (option === NOTIFICATION_MUTE_OPTIONS.ONE_HOUR) {
    return Math.floor((nowMs + HOUR_MS) / 1000);
  }
  if (option === NOTIFICATION_MUTE_OPTIONS.FOUR_HOURS) {
    return Math.floor((nowMs + (4 * HOUR_MS)) / 1000);
  }
  if (option === NOTIFICATION_MUTE_OPTIONS.UNTIL_EIGHT) {
    const now = new Date(nowMs);
    const target = new Date(nowMs);
    target.setHours(8, 0, 0, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    return Math.floor(target.getTime() / 1000);
  }
  throw new Error('Thời hạn tắt thông báo không hợp lệ.');
}

export function nextNotificationMuteExpiry(conversations, nowMs = Date.now()) {
  const expiries = (conversations || [])
    .map(conversation => normalizeNotificationMuteUntil(conversation?.notificationMutedUntil))
    .filter(value => value !== null && value > 0)
    .map(value => value * 1000)
    .filter(value => value > nowMs);
  return expiries.length > 0 ? Math.min(...expiries) : null;
}

export function notificationMuteLabel(value, nowMs = Date.now()) {
  const muteUntil = normalizeNotificationMuteUntil(value);
  if (!isConversationMuted(muteUntil, nowMs)) return '';
  if (muteUntil === 0) return 'Đã tắt cho đến khi được mở lại';
  const target = new Date(muteUntil * 1000);
  const now = new Date(nowMs);
  const sameDay = target.getFullYear() === now.getFullYear()
    && target.getMonth() === now.getMonth()
    && target.getDate() === now.getDate();
  const time = target.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Đã tắt đến ${time}`;
  return `Đã tắt đến ${time} ${target.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}
