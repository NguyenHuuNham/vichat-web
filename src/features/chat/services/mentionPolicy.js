export const ALL_MENTION_ID = '__all__';

const MENTION_CONTEXT_PATTERN = /(^|[\s([{])@([^\s@]*)$/u;

function clampCaretPosition(value, caretPosition) {
  const text = String(value || '');
  const numericPosition = Number(caretPosition);
  if (!Number.isFinite(numericPosition)) return text.length;
  return Math.max(0, Math.min(Math.trunc(numericPosition), text.length));
}

export function normalizeMentionSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .toLocaleLowerCase('vi');
}

export function getMentionContext(value, caretPosition) {
  const text = String(value || '');
  const position = clampCaretPosition(text, caretPosition);
  const beforeCaret = text.slice(0, position);
  const match = beforeCaret.match(MENTION_CONTEXT_PATTERN);
  if (!match) return null;

  return {
    start: (match.index || 0) + match[1].length,
    end: position,
    query: match[2] || '',
  };
}

export function mentionCandidateText(candidate) {
  return String(candidate?.name || candidate?.nickname || candidate?.username || candidate?.email || '').trim();
}

// Shared message metadata must use the official identity label, never a
// viewer-scoped nickname. Directory snapshots provide defaultName for this.
export function mentionCanonicalText(candidate) {
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

export function mentionDisplayTokenFor(candidate) {
  if (candidate?.id === ALL_MENTION_ID) return candidate?.token || '@All';
  if (candidate?.type === 'bot' || candidate?.isChatbot || candidate?.id === 'vichat-ai') return '@ViChatAI';
  const label = mentionCandidateText(candidate).replace(/^@+/u, '');
  return label ? `@${label}` : String(candidate?.token || '').trim();
}

export function mentionTokenFor(candidate) {
  if (candidate?.id === ALL_MENTION_ID) return '@All';
  if (candidate?.type === 'bot' || candidate?.isChatbot || candidate?.id === 'vichat-ai') return '@ViChatAI';
  const label = mentionCanonicalText(candidate);
  return label ? `@${label}` : '';
}

export function serializeMentionForTransport(mention) {
  if (!mention || typeof mention !== 'object' || Array.isArray(mention)) return null;
  const isAll = Boolean(mention.isAll || mention.id === ALL_MENTION_ID);
  const canonicalName = isAll ? 'All' : mentionCanonicalText(mention);
  const token = isAll
    ? '@All'
    : mentionTokenFor({
      ...mention,
      name: canonicalName,
      defaultName: canonicalName,
      nickname: '',
    });
  if (!token) return null;
  return {
    id: String(mention.id || '').trim(),
    tinodeUid: String(mention.tinodeUid || mention.uid || '').trim(),
    name: canonicalName,
    token,
    isAll,
    isBot: Boolean(mention.isBot || mention.type === 'bot' || mention.isChatbot || mention.id === 'vichat-ai'),
  };
}

export function matchesMentionCandidate(candidate, query) {
  const normalizedQuery = normalizeMentionSearch(query).trim();
  if (!normalizedQuery) return true;
  return [
    candidate?.name,
    candidate?.nickname,
    candidate?.defaultName,
    candidate?.default_name,
    candidate?.username,
    candidate?.email,
    ...(candidate?.mentionAliases || []),
  ]
    .filter(Boolean)
    .some(value => normalizeMentionSearch(value).includes(normalizedQuery));
}

export function insertMentionAt(value, context, candidate) {
  const text = String(value || '');
  const token = mentionTokenFor(candidate);
  if (!token || !context) return { text, caret: text.length, token: '' };

  const before = text.slice(0, context.start);
  const after = text.slice(context.end);
  const separator = after && /^\s/u.test(after) ? '' : ' ';
  const nextText = `${before}${token}${separator}${after}`;
  return {
    text: nextText,
    caret: before.length + token.length + separator.length,
    token,
  };
}

export function mentionTokenExists(text, token) {
  const value = String(text || '');
  const target = String(token || '').trim();
  if (!target) return false;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[\\s([{])${escaped}(?=$|[\\s.,!?;:])`, 'iu').test(value);
}

function mentionIdentityValues(entity) {
  return [...new Set([
    entity?.id,
    entity?.uid,
    entity?.tinodeUid,
    entity?.tinode_uid,
    entity?.userId,
    entity?.user_id,
  ].filter(Boolean).map(value => String(value).trim()).filter(Boolean))];
}

function mentionNameValues(entity) {
  return [...new Set([
    entity?.name,
    entity?.defaultName,
    entity?.default_name,
    entity?.fullName,
    entity?.full_name,
    entity?.username,
    entity?.email,
  ]
    .filter(Boolean)
    .map(value => normalizeMentionSearch(String(value).replace(/^@+/u, '')).trim())
    .filter(Boolean))];
}

function mentionMetadataEntryIsUsable(mention) {
  if (!mention || typeof mention !== 'object' || Array.isArray(mention)) return false;
  return Boolean(
    mention.isAll
      || mention.id
      || mention.uid
      || mention.tinodeUid
      || mention.tinode_uid
      || mention.userId
      || mention.user_id
      || mention.token
      || mention.name
      || mention.defaultName
      || mention.default_name
      || mention.username
      || mention.email,
  );
}

function mentionTokenExistsInText(text, token) {
  const normalizedText = normalizeMentionSearch(text);
  const normalizedToken = normalizeMentionSearch(token).replace(/^@+/u, '').trim();
  if (!normalizedText || !normalizedToken) return false;
  const escapedToken = normalizedToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[\\s([{])@${escapedToken}(?=$|[\\s\\p{P}])`, 'u').test(normalizedText);
}

export function mentionTargetsViewer(mention, viewer) {
  if (!mention || typeof mention !== 'object' || Array.isArray(mention) || !viewer) return false;
  const normalizedToken = normalizeMentionSearch(mention.token).trim();
  if (
    mention.isAll
    || mention.id === ALL_MENTION_ID
    || normalizedToken === '@all'
  ) return true;

  const viewerIdentities = new Set(mentionIdentityValues(viewer));
  const mentionIdentities = mentionIdentityValues(mention);
  if (mentionIdentities.some(identity => viewerIdentities.has(identity))) return true;
  if (mentionIdentities.length > 0) return false;

  const viewerNames = new Set(mentionNameValues(viewer));
  const legacyMentionNames = mentionNameValues({
    ...mention,
    name: mention.name || String(mention.token || '').replace(/^@+/u, ''),
  });
  return legacyMentionNames.some(name => viewerNames.has(name));
}

export function messageMentionsViewer(message, viewer) {
  const mentions = Array.isArray(message?.mentions) ? message.mentions : [];
  const usableMentions = mentions.filter(mentionMetadataEntryIsUsable);
  if (usableMentions.length > 0) {
    return usableMentions.some(mention => mentionTargetsViewer(mention, viewer));
  }

  // Older/external senders can preserve the literal token without x-mentions.
  const text = String(message?.text || message?.caption || '');
  if (!text || !viewer) return false;
  if (mentionTokenExistsInText(text, '@All')) return true;
  return mentionNameValues(viewer)
    .filter(name => !name.includes('@'))
    .sort((first, second) => second.length - first.length)
    .some(name => mentionTokenExistsInText(text, `@${name}`));
}
