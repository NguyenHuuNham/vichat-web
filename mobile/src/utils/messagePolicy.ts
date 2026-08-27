import { ChatMessage, PickerFile, RecallMode } from '../types';
import { config } from '../constants/config';

export const REACTION_EVENT_PREFIX = '__VICHAT_REACTION_EVENT__:';
export const RECALL_EVENT_PREFIX = '__VICHAT_RECALL_EVENT__:';
export const SYSTEM_EVENT_PREFIX = '__VICHAT_SYSTEM_EVENT__:';
export const EDIT_EVENT_PREFIX = '__VICHAT_EDIT_EVENT__:';

export function attachmentValidationError(file?: PickerFile | null) {
  const size = Number(file?.size) || 0;
  if (size > config.maxAttachmentBytes) return 'File hoặc ảnh không được lớn hơn 500 MB.';
  return '';
}

export function canRecallMessage(message?: ChatMessage | null) {
  return Boolean(
    message
    && !message.recalled
    && !message.pending
    && !message.failed
    && message.deliveryStatus !== 'sending',
  );
}

export function canEditMessage(message?: ChatMessage | null) {
  return Boolean(
    message
    && message.type === 'text'
    && String(message.text || '').trim()
    && !message.recalled
    && !message.pending
    && !message.failed
    && message.deliveryStatus !== 'sending',
  );
}

export function canInteractWithMessage(message?: ChatMessage | null) {
  return Boolean(message && !message.recalled);
}

export function recallAppliesToViewer(event: any, client: { isMe?: (uid: string) => boolean } | null | undefined) {
  if (event?.mode !== 'self') return true;
  const actorId = String(event?.actorId || event?.originalSenderId || '');
  return Boolean(actorId && client?.isMe?.(actorId));
}

export function buildRecallEvent(message: ChatMessage, actorId: string, mode: RecallMode = 'all') {
  return {
    targetId: String(message.id || ''),
    targetSeq: Number(message.seq) || 0,
    actorId,
    originalSenderId: actorId,
    originalCreatedAt: message.createdAt || new Date().toISOString(),
    createdAt: new Date().toISOString(),
    mode,
  };
}

export function buildEditEvent(message: ChatMessage, actorId: string, text: string, mentions: any[] = []) {
  return {
    targetId: String(message.id || '').trim(),
    targetSeq: Number(message.seq) || 0,
    actorId: String(actorId || '').trim(),
    text: String(text || '').trim(),
    mentions: Array.isArray(mentions) ? mentions.slice(0, 50) : [],
    previousText: String(message.text || ''),
    previousMentions: Array.isArray(message.mentions) ? message.mentions.slice(0, 50) : [],
    createdAt: new Date().toISOString(),
  };
}

export function editEventActorId(editMessage: any) {
  return String(
    editMessage?.senderId
      || editMessage?.raw?.from
      || editMessage?.raw?.head?.['x-sender-id']
      || '',
  ).trim();
}

export function editTargetsMessage(editMessage: any, message?: ChatMessage | null) {
  const event = editMessage?.editEvent || editMessage?.raw?.editEvent || {};
  const targetId = String(event.targetId || '').trim();
  const targetSeq = Number(event.targetSeq) || 0;
  const messageId = String(message?.id || '').trim();
  const messageSeq = Number(message?.seq) || Number(message?.raw?.seq) || 0;
  if (targetSeq > 0 && messageSeq > 0) return Boolean(message && targetSeq === messageSeq);
  return Boolean(message && targetId && targetId === messageId);
}

export function editActorMatchesMessage(editMessage: any, message?: ChatMessage | null) {
  const actorId = editEventActorId(editMessage);
  const senderId = String(
    message?.senderId
      || message?.raw?.from
      || message?.raw?.head?.['x-sender-id']
      || '',
  ).trim();
  return Boolean(actorId && senderId && actorId === senderId);
}

export function applyEditToMessage(message: ChatMessage, editMessage: any): ChatMessage {
  if (!message || message.recalled || message.type !== 'text' || !editMessage) return message;
  const event = editMessage.editEvent || editMessage.raw?.editEvent || {};
  const nextText = String(event.text || '').trim();
  if (!nextText) return message;
  const eventId = String(editMessage.id || '').trim();
  const eventSeq = Number(editMessage.seq) || 0;
  const history = Array.isArray(message.editHistory) ? message.editHistory : [];
  if (
    (eventId && history.some(item => String(item?.eventId || '').trim() === eventId))
    || (eventSeq > 0 && history.some(item => Number(item?.seq) === eventSeq))
  ) return message;
  const previousText = typeof event.previousText === 'string' ? event.previousText : String(message.text || '');
  const previousMentions = Array.isArray(event.previousMentions)
    ? event.previousMentions.slice(0, 50)
    : (Array.isArray(message.mentions) ? message.mentions.slice(0, 50) : []);
  const editedAt = String(event.createdAt || editMessage.createdAt || new Date().toISOString());
  return {
    ...message,
    text: nextText,
    mentions: Array.isArray(event.mentions) ? event.mentions.slice(0, 50) : [],
    edited: true,
    editedAt,
    editHistory: [
      ...history,
      {
        ...(eventId ? { eventId } : {}),
        ...(eventSeq > 0 ? { seq: eventSeq } : {}),
        text: previousText,
        mentions: previousMentions,
        editedAt,
      },
    ],
  };
}
