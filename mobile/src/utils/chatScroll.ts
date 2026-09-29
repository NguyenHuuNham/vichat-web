import { ChatMessage } from '../types';

export const CHAT_BOTTOM_THRESHOLD = 96;

const NON_USER_MESSAGE_TYPES = new Set<ChatMessage['type']>([
  'reaction',
  'recall',
  'edit',
  'poll_event',
  'system',
]);

export function isUserVisibleMessage(message: ChatMessage) {
  return !NON_USER_MESSAGE_TYPES.has(message.type);
}

export function messageKey(message: ChatMessage) {
  const id = String(message.id || '').trim();
  if (id) return id;
  const sequence = Number(message.seq) || 0;
  return sequence > 0 ? `seq-${sequence}` : '';
}

export function firstUnreadMessageIndex(
  messages: ChatMessage[],
  readSeq: number | undefined,
  unreadCount = 0,
) {
  if (readSeq === undefined && Number(unreadCount) <= 0) return null;
  const lastReadSequence = Number(readSeq) || 0;
  const unreadIndex = messages.findIndex(message => (
    message.sender === 'incoming'
    && isUserVisibleMessage(message)
    && Number(message.seq) > lastReadSequence
  ));
  if (unreadIndex >= 0) return unreadIndex;
  if (Number(unreadCount) > 0) {
    const fallbackIndex = messages.findIndex(message => message.sender === 'incoming' && isUserVisibleMessage(message));
    return fallbackIndex >= 0 ? fallbackIndex : null;
  }
  return null;
}

export function isNearChatBottom(
  offsetY: number,
  contentHeight: number,
  viewportHeight: number,
  threshold = CHAT_BOTTOM_THRESHOLD,
) {
  if (contentHeight <= 0 || viewportHeight <= 0) return true;
  return contentHeight - (offsetY + viewportHeight) <= threshold;
}
