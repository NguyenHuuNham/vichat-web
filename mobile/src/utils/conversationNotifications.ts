const HOUR_MS = 60 * 60 * 1000;

export const NOTIFICATION_MUTE_OPTIONS = Object.freeze({
  ONE_HOUR: 'one-hour',
  FOUR_HOURS: 'four-hours',
  UNTIL_EIGHT: 'until-eight',
  UNTIL_MANUAL: 'until-manual',
} as const);

export type NotificationMuteOption = typeof NOTIFICATION_MUTE_OPTIONS[keyof typeof NOTIFICATION_MUTE_OPTIONS];

export function normalizeMuteUntil(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : null;
}

export function isConversationMuted(value: unknown, nowMs = Date.now()): boolean {
  const muteUntil = normalizeMuteUntil(value);
  if (muteUntil === null) return false;
  if (muteUntil === 0) return true;
  return muteUntil * 1000 > nowMs;
}

export function resolveMuteOption(option: 'hour' | 'day' | 'forever' | 'off', nowMs = Date.now()): number | null {
  if (option === 'off') return null;
  if (option === 'forever') return 0;
  return Math.floor((nowMs + (option === 'hour' ? HOUR_MS : 24 * HOUR_MS)) / 1000);
}

export function resolveNotificationMuteUntil(option: NotificationMuteOption, nowMs = Date.now()): number {
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
  return 0;
}

export function notificationMuteLabel(value: unknown, nowMs = Date.now(), locale = 'vi-VN'): string {
  const muteUntil = normalizeMuteUntil(value);
  if (!isConversationMuted(muteUntil, nowMs)) return '';
  if (muteUntil === 0) {
    return locale.startsWith('en') ? 'Muted until turned back on' : 'Đã tắt cho đến khi được mở lại';
  }
  const target = new Date((muteUntil || 0) * 1000);
  const now = new Date(nowMs);
  const sameDay = target.getFullYear() === now.getFullYear()
    && target.getMonth() === now.getMonth()
    && target.getDate() === now.getDate();
  const time = target.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (sameDay) {
    return locale.startsWith('en') ? `Muted until ${time}` : `Đã tắt đến ${time}`;
  }
  const date = target.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  return locale.startsWith('en') ? `Muted until ${time} ${date}` : `Đã tắt đến ${time} ngày ${date}`;
}

