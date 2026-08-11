import { ChatMessage, PickerFile } from '../types';
import { config } from '../constants/config';

export const REACTION_EVENT_PREFIX = '__VICHAT_REACTION_EVENT__:';
export const RECALL_EVENT_PREFIX = '__VICHAT_RECALL_EVENT__:';
export const SYSTEM_EVENT_PREFIX = '__VICHAT_SYSTEM_EVENT__:';

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

export function canInteractWithMessage(message?: ChatMessage | null) {
  return Boolean(message && !message.recalled);
}

export function buildRecallEvent(message: ChatMessage, actorId: string) {
  return {
    targetId: String(message.id || ''),
    targetSeq: Number(message.seq) || 0,
    actorId,
    originalSenderId: actorId,
    originalCreatedAt: message.createdAt || new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}
