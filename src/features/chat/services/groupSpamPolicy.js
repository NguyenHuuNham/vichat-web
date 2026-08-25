export const GROUP_SPAM_ERROR_CODE = 'GROUP_SPAM_COOLDOWN';
export const GROUP_SPAM_WINDOW_MS = 5 * 1000;
export const GROUP_SPAM_ACTION_LIMIT = 4;
export const GROUP_SPAM_BASE_COOLDOWN_MS = 5 * 1000;
export const GROUP_SPAM_MAX_COOLDOWN_MS = 5 * 60 * 1000;
export const GROUP_SPAM_RECOVERY_MS = 60 * 1000;
export const GROUP_SPAM_ACTION_TTL_MS = 30 * 1000;
export const GROUP_SPAM_ACTION_REPEAT_LIMIT = 100;

function finiteTimestamp(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

function normalizeActionId(value) {
  return String(value || '').trim().replace(/[^a-z0-9._:-]+/gi, '-').slice(0, 96);
}

export function createGroupSpamState(source = {}) {
  return {
    actionTimes: Array.isArray(source.actionTimes)
      ? source.actionTimes.map(finiteTimestamp).filter(Boolean).slice(-GROUP_SPAM_ACTION_LIMIT)
      : [],
    penaltyLevel: Math.max(0, Math.min(16, Math.trunc(Number(source.penaltyLevel) || 0))),
    blockedUntil: finiteTimestamp(source.blockedUntil),
    lastViolationAt: finiteTimestamp(source.lastViolationAt),
    lastActivityAt: finiteTimestamp(source.lastActivityAt),
    recentActions: Array.isArray(source.recentActions)
      ? source.recentActions.map(action => ({
        id: normalizeActionId(action?.id),
        at: finiteTimestamp(action?.at),
        repeats: Math.max(1, Math.min(
          GROUP_SPAM_ACTION_REPEAT_LIMIT,
          Math.trunc(Number(action?.repeats) || 1),
        )),
      })).filter(action => action.id && action.at).slice(-GROUP_SPAM_ACTION_LIMIT * 2)
      : [],
  };
}

export function createGroupSpamActionId(prefix = 'web-group') {
  const safePrefix = normalizeActionId(prefix) || 'web-group';
  const uuid = globalThis?.crypto?.randomUUID?.();
  const token = uuid
    ? uuid.replace(/-/g, '').slice(0, 16)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${safePrefix}-${token}`.slice(0, 96);
}

function cooldownForLevel(level) {
  return Math.min(
    GROUP_SPAM_BASE_COOLDOWN_MS * (2 ** Math.max(0, Math.trunc(level) || 0)),
    GROUP_SPAM_MAX_COOLDOWN_MS,
  );
}

export function groupSpamRemainingMs(state, now = Date.now()) {
  return Math.max(0, createGroupSpamState(state).blockedUntil - finiteTimestamp(now));
}

export function groupSpamRemainingSeconds(state, now = Date.now()) {
  return Math.ceil(groupSpamRemainingMs(state, now) / 1000);
}

export function groupSpamCooldownMessage(seconds) {
  const remaining = Math.max(1, Math.ceil(Number(seconds) || 0));
  return `Bạn đang gửi quá nhanh. Có thể gửi lại sau ${remaining} giây.`;
}

export function registerGroupSpamAttempt(state, {
  now = Date.now(),
  actionId = '',
} = {}) {
  const timestamp = finiteTimestamp(now) || Date.now();
  const normalizedActionId = normalizeActionId(actionId);
  const current = createGroupSpamState(state);
  let next = {
    ...current,
    actionTimes: current.actionTimes.filter(value => timestamp - value < GROUP_SPAM_WINDOW_MS),
    recentActions: current.recentActions.filter(action => timestamp - action.at < GROUP_SPAM_ACTION_TTL_MS),
  };

  if (next.blockedUntil > 0 && timestamp >= next.blockedUntil + GROUP_SPAM_RECOVERY_MS) {
    next = {
      ...next,
      actionTimes: [],
      penaltyLevel: 0,
      blockedUntil: 0,
      lastViolationAt: 0,
    };
  }

  const duplicateIndex = normalizedActionId
    ? next.recentActions.findIndex(action => action.id === normalizedActionId)
    : -1;
  if (duplicateIndex >= 0 && next.recentActions[duplicateIndex].repeats < GROUP_SPAM_ACTION_REPEAT_LIMIT) {
    const recentActions = [...next.recentActions];
    recentActions[duplicateIndex] = {
      ...recentActions[duplicateIndex],
      repeats: recentActions[duplicateIndex].repeats + 1,
    };
    return {
      allowed: true,
      blocked: false,
      counted: false,
      actionId: normalizedActionId,
      cooldownMs: 0,
      retryAfterMs: 0,
      state: { ...next, recentActions, lastActivityAt: timestamp },
    };
  }

  if (next.blockedUntil > timestamp) {
    return {
      allowed: false,
      blocked: true,
      counted: false,
      actionId: normalizedActionId,
      cooldownMs: Math.max(0, next.blockedUntil - next.lastViolationAt),
      retryAfterMs: next.blockedUntil - timestamp,
      state: { ...next, lastActivityAt: timestamp },
    };
  }

  if (next.actionTimes.length >= GROUP_SPAM_ACTION_LIMIT) {
    const cooldownMs = cooldownForLevel(next.penaltyLevel);
    const blockedUntil = timestamp + cooldownMs;
    return {
      allowed: false,
      blocked: true,
      counted: true,
      actionId: normalizedActionId,
      cooldownMs,
      retryAfterMs: cooldownMs,
      state: {
        ...next,
        actionTimes: [],
        penaltyLevel: Math.min(16, next.penaltyLevel + 1),
        blockedUntil,
        lastViolationAt: timestamp,
        lastActivityAt: timestamp,
      },
    };
  }

  return {
    allowed: true,
    blocked: false,
    counted: true,
    actionId: normalizedActionId,
    cooldownMs: 0,
    retryAfterMs: 0,
    state: {
      ...next,
      actionTimes: [...next.actionTimes, timestamp],
      lastActivityAt: timestamp,
      recentActions: normalizedActionId
        ? [...next.recentActions, { id: normalizedActionId, at: timestamp, repeats: 1 }]
        : next.recentActions,
    },
  };
}

export function applyGroupSpamCooldown(state, retryAfterMs, now = Date.now()) {
  const timestamp = finiteTimestamp(now) || Date.now();
  const duration = Math.max(
    GROUP_SPAM_BASE_COOLDOWN_MS,
    Math.min(GROUP_SPAM_MAX_COOLDOWN_MS, Number(retryAfterMs) || 0),
  );
  const inferredLevel = Math.max(
    1,
    Math.min(16, Math.ceil(Math.log2(duration / GROUP_SPAM_BASE_COOLDOWN_MS)) + 1),
  );
  const current = createGroupSpamState(state);
  return {
    ...current,
    actionTimes: [],
    penaltyLevel: Math.max(current.penaltyLevel, inferredLevel),
    blockedUntil: Math.max(current.blockedUntil, timestamp + duration),
    lastViolationAt: timestamp,
    lastActivityAt: timestamp,
  };
}

export function groupSpamErrorRetryAfterMs(error) {
  const explicit = Number(
    error?.retryAfterMs
    || error?.retry_after_ms
    || error?.params?.retry_after_ms
    || 0,
  );
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const seconds = Number(
    error?.retryAfter
    || error?.retry_after
    || error?.params?.retry_after
    || 0,
  );
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const message = String(error?.message || error?.text || error || '');
  const match = message.match(/(?:sau|trong)\s+(\d+)\s+gi[aâ]y|(?:after|for)\s+(\d+)\s+seconds?/iu);
  return Math.max(0, Number(match?.[1] || match?.[2] || 0) * 1000);
}

export function isGroupSpamCooldownError(error) {
  const code = String(
    error?.errorCode
    || error?.error_code
    || error?.params?.error_code
    || error?.codeName
    || '',
  ).trim().toUpperCase();
  if (code === GROUP_SPAM_ERROR_CODE) return true;
  const status = Number(error?.status || error?.statusCode || error?.code || 0);
  const message = String(error?.message || error?.text || error || '').trim();
  return status === 429 && /gửi quá nhanh|send(?:ing)? too (?:fast|quickly)/iu.test(message);
}
