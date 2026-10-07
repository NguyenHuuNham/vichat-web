import { ChatMessage, FileAttachment } from '../types';

export type SharedContentKind = 'media' | 'files' | 'links';

export function messageLinks(message: ChatMessage) {
  const explicitLinks = Array.isArray((message as any)?.links)
    ? (message as any).links
      .map((link: any) => typeof link === 'string' ? link : link?.url || link?.href)
      .filter(Boolean)
    : [];
  const textLinks = String(message?.text || '').match(/https?:\/\/[^\s<]+/gi) || [];
  return [...new Set([...explicitLinks, ...textLinks]
    .map(value => String(value).replace(/[),.;!?]+$/g, '')))]
    .filter(value => /^https?:\/\//i.test(value));
}

export function messageFile(message: ChatMessage): FileAttachment | null {
  if (message?.sticker || message?.type === 'sticker') return null;
  if (message?.file) return message.file;
  if (message?.image) {
    return {
      name: 'hinh-anh.jpg',
      mime: 'image/jpeg',
      size: 0,
      url: message.image,
    };
  }
  return null;
}

export function isImageMessage(message: ChatMessage) {
  if (message?.sticker || message?.type === 'sticker') return false;
  const file = message?.file;
  return Boolean(message?.image)
    || Boolean(file && (/^image\//i.test(file.mime) || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name || '')));
}

export function messagesForSharedKind(messages: ChatMessage[], kind: SharedContentKind) {
  return (Array.isArray(messages) ? messages : []).filter(message => {
    if (!message || message.sticker || message.type === 'sticker' || ['system', 'reaction', 'recall', 'edit', 'call', 'poll_event', 'live_location_event'].includes(message.type)) return false;
    if (kind === 'media') return isImageMessage(message);
    if (kind === 'files') return Boolean(message?.file) && !isImageMessage(message);
    return messageLinks(message).length > 0;
  });
}

export function mergeGroupHistoryMessages(current: ChatMessage[] = [], history: ChatMessage[] = []) {
  const byIdentity = new Map<string, ChatMessage>();
  const keysFor = (message: ChatMessage) => {
    const keys: string[] = [];
    const id = String(message.id || '').trim();
    const seq = Number(message.seq) || 0;
    if (id) keys.push(`id:${id}`);
    if (seq > 0) keys.push(`seq:${seq}`);
    return keys.length ? keys : [`fallback:${message.createdAt || message.time || message.text}`];
  };
  const preserveMedia = (preferred: ChatMessage, fallback: ChatMessage) => ({
    ...preferred,
    ...(!preferred.file && fallback.file ? { file: fallback.file } : {}),
    ...(!preferred.image && fallback.image ? { image: fallback.image } : {}),
    ...(preferred.type === 'text' && fallback.type !== 'text' && (fallback.file || fallback.image) ? { type: fallback.type } : {}),
  });
  [...current, ...history].filter(Boolean).forEach(message => {
    const keys = keysFor(message);
    const previous = keys.map(key => byIdentity.get(key)).find(Boolean);
    // Prefer the live snapshot because it contains the latest edit, recall and
    // media reference while the background history walk fills older messages.
    const merged = previous ? preserveMedia(previous, message) : message;
    [...keysFor(merged), ...keys].forEach(key => byIdentity.set(key, merged));
  });
  return [...new Set(byIdentity.values())].sort((first, second) => (
    (Number(first.seq) || 0) - (Number(second.seq) || 0)
    || (Date.parse(first.createdAt || '') || 0) - (Date.parse(second.createdAt || '') || 0)
  ));
}
