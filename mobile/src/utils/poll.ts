import { Poll, PollEvent, PollOption, PollSettings } from '../types';
import { memberIsAdmin as groupMemberIsAdmin } from './groupSettings';

export const POLL_EVENT_PREFIX = '__VICHAT_POLL_EVENT__:';
export const DEFAULT_POLL_SETTINGS: PollSettings = {
  expiresAt: '',
  allowMultiple: false,
  allowAddOptions: false,
  hideResultsUntilVote: false,
  hideVoters: false,
  pinPoll: false,
};

const MAX_ID = 120;
const MAX_QUESTION = 200;
const MAX_OPTION = 120;
const MAX_OPTIONS = 20;

function text(value: unknown, max = 240) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, max) : '';
}

function isoDate(value: unknown) {
  const raw = text(value, 64);
  if (!raw) return '';
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function ids(values: unknown, max = MAX_OPTIONS) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => text(value, MAX_ID))
    .filter(Boolean))].slice(0, max);
}

export function normalizePollSettings(value: unknown): PollSettings {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    ...DEFAULT_POLL_SETTINGS,
    expiresAt: isoDate(source.expiresAt || source.expires_at),
    allowMultiple: source.allowMultiple === true || source.allow_multiple === true,
    allowAddOptions: source.allowAddOptions === true || source.allow_add_options === true,
    hideResultsUntilVote: source.hideResultsUntilVote === true || source.hide_results_until_vote === true,
    hideVoters: source.hideVoters === true || source.hide_voters === true,
    pinPoll: source.pinPoll === true || source.pin_poll === true,
  };
}

function normalizeOption(value: unknown): PollOption | null {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const id = text(source.id || source.optionId, MAX_ID);
  const optionText = text(source.text || source.label, MAX_OPTION);
  return id && optionText ? { id, text: optionText } : null;
}

export function normalizePoll(value: unknown): Poll | null {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  const id = text(source.id || source.pollId, MAX_ID);
  const question = text(source.question || source.text, MAX_QUESTION);
  const options: PollOption[] = [];
  const seen = new Set<string>();
  (Array.isArray(source.options) ? source.options : []).slice(0, MAX_OPTIONS).forEach(option => {
    const normalized = normalizeOption(option);
    if (!normalized || seen.has(normalized.id)) return;
    seen.add(normalized.id);
    options.push(normalized);
  });
  if (!id || !question || options.length < 2) return null;
  const allowed = new Set(options.map(option => option.id));
  const votes: Poll['votes'] = {};
  if (source.votes && typeof source.votes === 'object' && !Array.isArray(source.votes)) {
    Object.entries(source.votes).slice(0, 500).forEach(([actorId, value]) => {
      const vote = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
      const optionIds = ids(vote.optionIds || vote.option_ids).filter(optionId => allowed.has(optionId));
      if (optionIds.length) votes[text(actorId, MAX_ID)] = {
        optionIds,
        name: text(vote.name, 120),
        avatar: text(vote.avatar, 500),
        createdAt: isoDate(vote.createdAt || vote.created_at),
      };
    });
  }
  return {
    id,
    question,
    options,
    settings: normalizePollSettings(source.settings || source),
    creatorId: text(source.creatorId || source.creator_id, MAX_ID),
    creatorName: text(source.creatorName || source.creator_name, 120),
    creatorAvatar: text(source.creatorAvatar || source.creator_avatar, 500),
    locked: source.locked === true,
    votes,
    lastActivitySeq: Number(source.lastActivitySeq || source.last_activity_seq) > 0 ? Number(source.lastActivitySeq || source.last_activity_seq) : 0,
    lastActivityAt: isoDate(source.lastActivityAt || source.last_activity_at),
  };
}

export function normalizePollEvent(value: unknown): PollEvent | null {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  const action = text(source.action, 40);
  if (!['poll_vote', 'poll_option_added', 'poll_locked'].includes(action)) return null;
  return {
    action: action as PollEvent['action'],
    pollId: text(source.pollId || source.poll_id, MAX_ID),
    actorId: text(source.actorId || source.actor_id, MAX_ID),
    pollQuestion: text(source.pollQuestion || source.poll_question, MAX_QUESTION),
    optionIds: ids(source.optionIds || source.option_ids),
    optionId: text(source.optionId || source.option_id, MAX_ID),
    optionText: text(source.optionText || source.option_text, MAX_OPTION),
    actorName: text(source.actorName || source.actor_name, 120),
    actorAvatar: text(source.actorAvatar || source.actor_avatar, 500),
    createdAt: isoDate(source.createdAt || source.created_at),
  };
}

export function applyPollEvent(poll: Poll | null, value: unknown, actorId = '', sequence = 0, members: any[] = []) {
  const current = normalizePoll(poll);
  const event = normalizePollEvent(value);
  if (!current || !event || (event.pollId && event.pollId !== current.id)) return current;
  const actor = text(actorId || event.actorId, MAX_ID);
  const next: Poll = { ...current, options: current.options.map(option => ({ ...option })), votes: { ...current.votes } };
  next.lastActivitySeq = Math.max(next.lastActivitySeq || 0, Number(sequence) || 0);
  next.lastActivityAt = event.createdAt || new Date().toISOString();
  if (event.action === 'poll_locked') {
    const canLock = actor === current.creatorId || members.some(member => {
      const identities = [member?.id, member?.uid, member?.tinodeUid, member?.tinode_uid].map(String);
      return identities.includes(actor) && groupMemberIsAdmin(member);
    });
    if (canLock) next.locked = true;
    return next;
  }
  if (event.action === 'poll_option_added') {
    const expiresAt = Date.parse(next.settings.expiresAt || '');
    if (next.settings.allowAddOptions && event.optionId && event.optionText && next.options.length < MAX_OPTIONS
      && !next.options.some(option => option.id === event.optionId)
      && (!Number.isFinite(expiresAt) || Date.now() < expiresAt)) {
      next.options.push({ id: event.optionId, text: event.optionText });
    }
    return next;
  }
  if (event.action === 'poll_vote' && actor && !next.locked) {
    const expiresAt = Date.parse(next.settings.expiresAt || '');
    if (Number.isFinite(expiresAt) && Date.now() >= expiresAt) return next;
    const allowed = new Set(next.options.map(option => option.id));
    const selected = ids(event.optionIds).filter(optionId => allowed.has(optionId));
    next.votes[actor] = {
      optionIds: next.settings.allowMultiple ? selected : selected.slice(0, 1),
      name: event.actorName,
      avatar: event.actorAvatar,
      createdAt: event.createdAt,
    };
  }
  return next;
}

export function pollOptionVoteCounts(poll: Poll | undefined) {
  const counts: Record<string, number> = Object.fromEntries((poll?.options || []).map(option => [option.id, 0]));
  Object.values(poll?.votes || {}).forEach(vote => vote.optionIds.forEach(optionId => { if (optionId in counts) counts[optionId] += 1; }));
  return counts;
}

export function pollViewerVote(poll: Poll | undefined, identities: string[]) {
  const candidates = new Set(identities.map(value => String(value || '')).filter(Boolean));
  return Object.entries(poll?.votes || {}).find(([actorId]) => candidates.has(actorId))?.[1] || null;
}

export function pollIsClosed(poll: Poll | undefined, now = Date.now()) {
  if (!poll || poll.locked) return true;
  const expiresAt = Date.parse(poll.settings.expiresAt || '');
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

export function pollCanViewerLock(poll: Poll | undefined, identities: string[], members: any[] = []) {
  if (!poll || poll.locked) return false;
  const candidates = new Set(identities.map(value => String(value || '')).filter(Boolean));
  return candidates.has(poll.creatorId) || members.some(member => {
    const memberIds = [member?.id, member?.uid, member?.tinodeUid, member?.tinode_uid].map(String);
    return memberIds.some(id => candidates.has(id)) && groupMemberIsAdmin(member);
  });
}
