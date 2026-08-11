export function normalizeMuteUntil(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function isConversationMuted(value: unknown, nowMs = Date.now()) {
  const muteUntil = normalizeMuteUntil(value);
  if (muteUntil === null) return false;
  if (muteUntil === 0) return true;
  return muteUntil * 1000 > nowMs;
}

export function resolveMuteOption(option: 'hour' | 'day' | 'forever' | 'off', nowMs = Date.now()) {
  if (option === 'off') return null;
  if (option === 'forever') return 0;
  return Math.floor((nowMs + (option === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000)) / 1000);
}
