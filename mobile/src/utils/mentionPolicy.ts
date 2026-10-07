export const ALL_MENTION_ID = '__all__';

const MENTION_CONTEXT_PATTERN = /(^|[\s([{])@([^\s@]*)$/u;

export interface MentionContext {
  start: number;
  end: number;
  query: string;
}

function clampCaret(value: string, caret: number) {
  const numeric = Number(caret);
  if (!Number.isFinite(numeric)) return value.length;
  return Math.max(0, Math.min(Math.trunc(numeric), value.length));
}

export function normalizeMentionSearch(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLocaleLowerCase('vi');
}

export function getMentionContext(value: string, caretPosition: number): MentionContext | null {
  const text = String(value || '');
  const position = clampCaret(text, caretPosition);
  const match = text.slice(0, position).match(MENTION_CONTEXT_PATTERN);
  if (!match) return null;
  return {
    start: (match.index || 0) + match[1].length,
    end: position,
    query: match[2] || '',
  };
}

export function mentionCandidateText(candidate: any) {
  return String(candidate?.name || candidate?.nickname || candidate?.username || candidate?.email || '').trim();
}

// Shared mention metadata must use the account's official name, not a local nickname.
export function mentionCanonicalText(candidate: any) {
  return String(
    candidate?.defaultName
      || candidate?.default_name
      || candidate?.fullName
      || candidate?.full_name
      || candidate?.username
      || candidate?.email
      || candidate?.name
      || '',
  ).trim();
}

export function mentionTokenFor(candidate: any) {
  if (candidate?.id === ALL_MENTION_ID) return '@All';
  if (candidate?.isBot || candidate?.isChatbot || candidate?.type === 'bot' || candidate?.id === 'vichat-ai') return '@ViChatAI';
  const label = mentionCanonicalText(candidate)
    .trim()
    .replace(/^@+/u, '');
  return label ? `@${label}` : '';
}

export function matchesMentionCandidate(candidate: any, query: string) {
  const normalizedQuery = normalizeMentionSearch(query).trim();
  if (!normalizedQuery) return true;
  return [
    candidate?.name,
    candidate?.nickname,
    candidate?.defaultName,
    candidate?.default_name,
    candidate?.fullName,
    candidate?.full_name,
    candidate?.username,
    candidate?.email,
    candidate?.department,
    candidate?.title,
    candidate?.roleLabel,
    ...(Array.isArray(candidate?.mentionAliases) ? candidate.mentionAliases : []),
  ].filter(Boolean).some(value => normalizeMentionSearch(value).includes(normalizedQuery));
}

export function insertMentionAt(value: string, context: MentionContext | null, candidate: any) {
  const text = String(value || '');
  const token = mentionTokenFor(candidate);
  if (!context || !token) return { text, caret: text.length, token: '' };
  const before = text.slice(0, context.start);
  const after = text.slice(context.end);
  const separator = after && /^\s/u.test(after) ? '' : ' ';
  const nextText = `${before}${token}${separator}${after}`;
  return { text: nextText, caret: before.length + token.length + separator.length, token };
}

export function mentionTokenExists(text: string, token: string) {
  const value = String(text || '');
  const target = String(token || '').trim();
  if (!target) return false;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[\\s([{])${escaped}(?=$|[\\s.,!?;:])`, 'iu').test(value);
}

export function serializeMentionForTransport(mention: any) {
  if (!mention || typeof mention !== 'object' || Array.isArray(mention)) return null;
  const isAll = Boolean(mention.isAll || mention.id === ALL_MENTION_ID);
  const canonicalName = isAll ? 'All' : mentionCanonicalText(mention);
  const token = isAll ? '@All' : mentionTokenFor({
    ...mention,
    name: canonicalName,
    nickname: '',
    defaultName: canonicalName,
  });
  if (!token) return null;
  return {
    id: String(mention.id || '').trim(),
    tinodeUid: String(mention.tinodeUid || mention.uid || '').trim(),
    name: canonicalName,
    token,
    isAll,
    isBot: Boolean(mention.isBot || mention.isChatbot || mention.type === 'bot' || mention.id === 'vichat-ai'),
  };
}
