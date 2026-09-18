const MESSAGE_LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#][^\s<>"']*)?/giu;
const TRAILING_URL_PUNCTUATION = /[.,!?;:]+$/u;
const ADJACENT_WORD_CHARACTER = /[\w@:.]/u;
const SCHEME_PREFIX_PATTERN = /[a-z][a-z0-9+.-]*:\/\/$/iu;
const MAX_SCHEME_LOOKBEHIND = 64;
const BALANCED_URL_PAIRS = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
];
export const MAX_MESSAGE_LINKS = 500;
export const MAX_MESSAGE_LINK_CACHE_ENTRIES = 400;
const messageLinkCache = new Map();

export function messageLinkCacheSize() {
  return messageLinkCache.size;
}

function rememberParsedLinks(source, parts) {
  if (messageLinkCache.size >= MAX_MESSAGE_LINK_CACHE_ENTRIES) {
    const oldestKey = messageLinkCache.keys().next().value;
    messageLinkCache.delete(oldestKey);
  }
  messageLinkCache.set(source, parts);
  return parts;
}

function countCharacters(value, character) {
  return [...value].filter(item => item === character).length;
}

function trimTrailingUrlPunctuation(value) {
  let url = String(value || '');
  let trailing = '';

  while (TRAILING_URL_PUNCTUATION.test(url)) {
    trailing = `${url.slice(-1)}${trailing}`;
    url = url.slice(0, -1);
  }

  BALANCED_URL_PAIRS.forEach(([opening, closing]) => {
    while (
      url.endsWith(closing)
      && countCharacters(url, closing) > countCharacters(url, opening)
    ) {
      trailing = `${url.slice(-1)}${trailing}`;
      url = url.slice(0, -1);
    }
  });

  return { url, trailing };
}

function safeMessageLink(value) {
  const display = String(value || '');
  const candidate = /^https?:\/\//iu.test(display) ? display : `https://${display}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return '';
    return candidate;
  } catch {
    return '';
  }
}

export function splitMessageLinks(text = '') {
  const source = String(text ?? '');
  if (!source) return [];
  const cached = messageLinkCache.get(source);
  if (cached !== undefined) return cached;
  return rememberParsedLinks(source, parseMessageLinks(source));
}

function parseMessageLinks(source) {
  const parts = [];
  let cursor = 0;
  let linkCount = 0;
  for (const match of source.matchAll(MESSAGE_LINK_PATTERN)) {
    if (linkCount >= MAX_MESSAGE_LINKS) break;
    const raw = match[0];
    const start = match.index ?? 0;
    if (start > 0 && ADJACENT_WORD_CHARACTER.test(source[start - 1])) continue;
    const schemeLookbehind = source.slice(Math.max(0, start - MAX_SCHEME_LOOKBEHIND), start);
    if (SCHEME_PREFIX_PATTERN.test(schemeLookbehind)) continue;

    const { url, trailing } = trimTrailingUrlPunctuation(raw);
    const href = safeMessageLink(url);
    if (!href) continue;

    if (start > cursor) parts.push({ type: 'text', value: source.slice(cursor, start) });
    parts.push({ type: 'link', value: url, href });
    linkCount += 1;
    if (trailing) parts.push({ type: 'text', value: trailing });
    cursor = start + raw.length;
  }

  if (cursor < source.length) parts.push({ type: 'text', value: source.slice(cursor) });
  return parts.length > 0 ? parts : [{ type: 'text', value: source }];
}
