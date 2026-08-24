const MAX_POLL_ID_LENGTH = 120;
const MAX_POLL_QUESTION_LENGTH = 200;
const MAX_POLL_OPTION_LENGTH = 120;
const MAX_POLL_OPTIONS = 20;

export const DEFAULT_POLL_SETTINGS = Object.freeze({
  expiresAt: '',
  allowMultiple: false,
  allowAddOptions: false,
  hideResultsUntilVote: false,
  hideVoters: false,
  pinPoll: false,
});

const POLL_EVENT_ACTIONS = new Set(['poll_vote', 'poll_option_added', 'poll_locked']);

function textValue(value, maxLength = 240) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().slice(0, maxLength);
}

function validIsoDate(value) {
  const raw = textValue(value, 64);
  if (!raw) return '';
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function uniqueIds(values = [], max = MAX_POLL_OPTIONS) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => textValue(value, MAX_POLL_ID_LENGTH))
    .filter(Boolean))].slice(0, max);
}

export function normalizePollSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ...DEFAULT_POLL_SETTINGS,
    expiresAt: validIsoDate(source.expiresAt || source.expires_at),
    allowMultiple: source.allowMultiple === true || source.allow_multiple === true,
    allowAddOptions: source.allowAddOptions === true || source.allow_add_options === true,
    hideResultsUntilVote: source.hideResultsUntilVote === true || source.hide_results_until_vote === true,
    hideVoters: source.hideVoters === true || source.hide_voters === true,
    pinPoll: source.pinPoll === true || source.pin_poll === true,
  };
}

function normalizePollOption(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const id = textValue(source.id || source.optionId, MAX_POLL_ID_LENGTH);
  const text = textValue(source.text || source.label, MAX_POLL_OPTION_LENGTH);
  return id && text ? { id, text } : null;
}

function normalizePollVotes(value, optionIds) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowed = new Set(optionIds);
  return Object.fromEntries(Object.entries(value).slice(0, 500).map(([actorId, record]) => {
    const source = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
    const selected = uniqueIds(source.optionIds || source.option_ids, MAX_POLL_OPTIONS)
      .filter(optionId => allowed.has(optionId));
    return [
      textValue(actorId, MAX_POLL_ID_LENGTH),
      {
        optionIds: selected,
        name: textValue(source.name, 120),
        avatar: textValue(source.avatar, 500),
        createdAt: validIsoDate(source.createdAt || source.created_at),
      },
    ];
  }).filter(([actorId, record]) => actorId && record.optionIds.length > 0));
}

export function normalizePoll(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const id = textValue(source.id || source.pollId, MAX_POLL_ID_LENGTH);
  const question = textValue(source.question || source.text, MAX_POLL_QUESTION_LENGTH);
  const options = [];
  const optionIds = new Set();
  (Array.isArray(source.options) ? source.options : []).slice(0, MAX_POLL_OPTIONS).forEach(option => {
    const normalized = normalizePollOption(option);
    if (!normalized || optionIds.has(normalized.id)) return;
    optionIds.add(normalized.id);
    options.push(normalized);
  });
  if (!id || !question || options.length < 2) return null;
  return {
    id,
    question,
    options,
    settings: normalizePollSettings(source.settings || source),
    creatorId: textValue(source.creatorId || source.creator_id, MAX_POLL_ID_LENGTH),
    creatorName: textValue(source.creatorName || source.creator_name, 120),
    creatorAvatar: textValue(source.creatorAvatar || source.creator_avatar, 500),
    locked: source.locked === true,
    votes: normalizePollVotes(source.votes, options.map(option => option.id)),
    lastActivitySeq: Number.isInteger(Number(source.lastActivitySeq)) && Number(source.lastActivitySeq) > 0
      ? Number(source.lastActivitySeq)
      : 0,
    lastActivityAt: validIsoDate(source.lastActivityAt || source.last_activity_at),
  };
}

export function normalizePollEvent(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const action = textValue(source.action, 40);
  if (!POLL_EVENT_ACTIONS.has(action)) return null;
  return {
    action,
    pollId: textValue(source.pollId || source.poll_id, MAX_POLL_ID_LENGTH),
    actorId: textValue(source.actorId || source.actor_id, MAX_POLL_ID_LENGTH),
    pollQuestion: textValue(source.pollQuestion || source.poll_question, MAX_POLL_QUESTION_LENGTH),
    optionIds: uniqueIds(source.optionIds || source.option_ids, MAX_POLL_OPTIONS),
    optionId: textValue(source.optionId || source.option_id, MAX_POLL_ID_LENGTH),
    optionText: textValue(source.optionText || source.option_text, MAX_POLL_OPTION_LENGTH),
    actorName: textValue(source.actorName || source.actor_name, 120),
    actorAvatar: textValue(source.actorAvatar || source.actor_avatar, 500),
    createdAt: validIsoDate(source.createdAt || source.created_at),
  };
}

function eventTimestamp(event) {
  return validIsoDate(event?.createdAt) || new Date().toISOString();
}

export function applyPollEvent(poll, value, actorId = '', sequence = 0) {
  const current = normalizePoll(poll);
  const event = normalizePollEvent(value);
  const actor = textValue(actorId || event?.actorId, MAX_POLL_ID_LENGTH);
  if (!current || !event || (event.pollId && event.pollId !== current.id)) return current;

  const next = {
    ...current,
    options: current.options.map(option => ({ ...option })),
    votes: { ...current.votes },
  };
  const eventAt = eventTimestamp(event);
  const eventSeq = Number(sequence) > 0 ? Number(sequence) : 0;
  next.lastActivitySeq = Math.max(next.lastActivitySeq || 0, eventSeq);
  next.lastActivityAt = eventAt;

  if (event.action === 'poll_locked') {
    if (!actor || !current.creatorId || actor !== current.creatorId) return current;
    next.locked = true;
    return next;
  }

  if (event.action === 'poll_option_added') {
    const expiresAt = Date.parse(current.settings.expiresAt || '');
    const eventAtMs = Date.parse(eventAt);
    const expiredAtEvent = Number.isFinite(expiresAt)
      && Number.isFinite(eventAtMs)
      && eventAtMs >= expiresAt;
    if (current.settings.allowAddOptions && !expiredAtEvent && event.optionId && event.optionText
      && next.options.length < MAX_POLL_OPTIONS
      && !next.options.some(option => option.id === event.optionId)) {
      next.options.push({ id: event.optionId, text: event.optionText });
    }
    return next;
  }

  if (event.action === 'poll_vote' && actor && !next.locked) {
    const expiresAt = Date.parse(current.settings.expiresAt || '');
    const eventAtMs = Date.parse(eventAt);
    if (Number.isFinite(expiresAt) && Number.isFinite(eventAtMs) && eventAtMs >= expiresAt) return next;
    const allowed = new Set(next.options.map(option => option.id));
    const optionIds = uniqueIds(event.optionIds, MAX_POLL_OPTIONS).filter(optionId => allowed.has(optionId));
    const selected = next.settings.allowMultiple ? optionIds : optionIds.slice(0, 1);
    if (selected.length > 0) {
      next.votes[actor] = {
        optionIds: selected,
        name: event.actorName,
        avatar: event.actorAvatar,
        createdAt: eventAt,
      };
    }
  }
  return next;
}

export function pollViewerIdentities(poll, identities = []) {
  const candidates = new Set((Array.isArray(identities) ? identities : [])
    .map(value => textValue(value, MAX_POLL_ID_LENGTH))
    .filter(Boolean));
  return Object.entries(poll?.votes || {}).find(([actorId]) => candidates.has(actorId))?.[1] || null;
}

export function pollOptionVoteCounts(poll) {
  const counts = Object.fromEntries((poll?.options || []).map(option => [option.id, 0]));
  Object.values(poll?.votes || {}).forEach(vote => {
    (vote?.optionIds || []).forEach(optionId => {
      if (Object.hasOwn(counts, optionId)) counts[optionId] += 1;
    });
  });
  return counts;
}

export function pollTotalVoters(poll) {
  return Object.keys(poll?.votes || {}).length;
}

export function pollIsClosed(poll, now = Date.now()) {
  if (!poll) return true;
  if (poll.locked) return true;
  const expiresAt = Date.parse(poll.settings?.expiresAt || '');
  return Number.isFinite(expiresAt) && expiresAt <= Number(now);
}

export function pollCanViewerLock(poll, identities = []) {
  const candidates = new Set((Array.isArray(identities) ? identities : [])
    .map(value => textValue(value, MAX_POLL_ID_LENGTH))
    .filter(Boolean));
  return Boolean(poll?.creatorId && candidates.has(poll.creatorId) && !poll.locked);
}

export const POLL_LIMITS = Object.freeze({
  maxQuestionLength: MAX_POLL_QUESTION_LENGTH,
  maxOptionLength: MAX_POLL_OPTION_LENGTH,
  maxOptions: MAX_POLL_OPTIONS,
});
