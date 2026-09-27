function messageSequence(message) {
  return Number(message?.seq || message?.raw?.seq) || 0;
}

export function mediaHistoryMessageKeys(message) {
  if (!message || typeof message !== 'object') return [];
  const keys = [];
  const id = String(message.id || message.raw?.clientId || '').trim();
  const sequence = messageSequence(message);
  if (id) keys.push(`id:${id}`);
  if (sequence > 0) keys.push(`seq:${sequence}`);
  return keys;
}

// Prefer the current room snapshot so live edits, recalls, and attachment
// URLs remain authoritative while older history fills in missing media.
export function mergeMediaHistoryMessages(currentMessages = [], historyMessages = []) {
  const merged = [];
  const seen = new Set();
  [...(Array.isArray(currentMessages) ? currentMessages : []), ...(Array.isArray(historyMessages) ? historyMessages : [])]
    .filter(Boolean)
    .forEach(message => {
      const keys = mediaHistoryMessageKeys(message);
      if (keys.some(key => seen.has(key))) return;
      keys.forEach(key => seen.add(key));
      merged.push(message);
    });
  return merged;
}
