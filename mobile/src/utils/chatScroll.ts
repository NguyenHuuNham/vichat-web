import { ChatMessage } from '../types';

export const CHAT_BOTTOM_THRESHOLD = 96;

const NON_USER_MESSAGE_TYPES = new Set<ChatMessage['type']>([
  'reaction',
  'recall',
  'edit',
  'poll_event',
  'system',
  'live_location_event',
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
  // A zero read cursor is the normal Tinode value for a fully-read topic
  // before the first receipt is persisted. Never use it to jump to the first
  // incoming message when the authoritative unread badge is already zero.
  if (Number(unreadCount) <= 0) return null;
  const lastReadSequence = Number(readSeq) || 0;
  const unreadIndex = messages.findIndex(message => (
    message.sender === 'incoming'
    && isUserVisibleMessage(message)
    && Number(message.seq) > lastReadSequence
  ));
  if (unreadIndex >= 0) return unreadIndex;
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
