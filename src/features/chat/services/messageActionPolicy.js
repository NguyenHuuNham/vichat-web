export const MESSAGE_QUICK_REACTIONS = Object.freeze(['👍', '❤️', '😂', '😮', '😢']);

function reactionEmojiKey(value) {
  return String(value || '').normalize('NFC').trim();
}

function reactionUserKey(user) {
  return [user?.id, user?.uid, user?.accountId, user?.account_id, user?.tinodeUid, user?.tinode_uid]
    .map(value => String(value || '').trim())
    .find(Boolean) || '';
}

export function mergeReactionCounts(...sources) {
  const counts = new Map();
  sources.forEach(source => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return;
    Object.entries(source).forEach(([rawEmoji, rawCount]) => {
      const emoji = reactionEmojiKey(rawEmoji);
      const count = Math.max(0, Number(rawCount) || 0);
      if (!emoji) return;
      counts.set(emoji, (counts.get(emoji) || 0) + count);
    });
  });
  return Object.fromEntries(counts);
}

export function mergeReactionUsers(...sources) {
  const usersByEmoji = new Map();
  sources.forEach(source => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return;
    Object.entries(source).forEach(([rawEmoji, rawUsers]) => {
      const emoji = reactionEmojiKey(rawEmoji);
      if (!emoji || !Array.isArray(rawUsers)) return;
      const users = usersByEmoji.get(emoji) || [];
      const knownUsers = new Set(users.map(reactionUserKey).filter(Boolean));
      rawUsers.forEach(user => {
        if (!user || typeof user !== 'object') return;
        const key = reactionUserKey(user);
        if (key && knownUsers.has(key)) return;
        users.push(user);
        if (key) knownUsers.add(key);
      });
      usersByEmoji.set(emoji, users);
    });
  });
  return Object.fromEntries(usersByEmoji);
}

export function reactionEntries(reactions = {}) {
  return Object.entries(mergeReactionCounts(reactions))
    .filter(([, count]) => count > 0);
}

export function messageActionKey(roomId, messageId) {
  return `${roomId}:${messageId}`;
}

export function pinnedMessagesForRoom(messages, actions = {}, roomId = '') {
  if (!Array.isArray(messages)) return [];
  return messages.filter(message => {
    if (!message?.id || message.recalled || ['system', 'friend_event'].includes(message.type)) return false;
    const state = actions[messageActionKey(roomId, message.id)];
    return Boolean(state?.pinned) && !state?.hidden;
  });
}
