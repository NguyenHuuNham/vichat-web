export const MESSAGE_QUICK_REACTIONS = Object.freeze(['👍', '❤️', '😂', '😮', '😢']);

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
