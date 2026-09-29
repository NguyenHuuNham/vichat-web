import { ChatMessage } from '../types';

function searchKey(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    // Treat punctuation (file-name separators included) like whitespace.
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Search materialized messages without exposing raw Tinode packets. */
export function searchHistoryMessages(messages: ChatMessage[], query: string, limit = 100) {
  const needle = searchKey(query).trim();
  if (!needle) return [];
  return messages
    .filter(message => {
      if (['reaction', 'recall', 'edit', 'poll_event', 'system'].includes(message.type)) return false;
      const haystack = [
        message.text,
        message.senderName,
        message.file?.name,
        message.sticker?.label,
        message.poll?.question,
      ].map(searchKey).join(' ');
      return haystack.includes(needle);
    })
    .sort((first, second) => (
      (Number(second.seq) || 0) - (Number(first.seq) || 0)
      || (Date.parse(String(second.createdAt || second.time || '')) || 0)
        - (Date.parse(String(first.createdAt || first.time || '')) || 0)
    ))
    .slice(0, Math.max(1, Math.min(200, Math.trunc(Number(limit) || 100))));
}
