export const MAX_CHAT_ATTACHMENT_BYTES = 500 * 1024 * 1024;

export function chatAttachmentValidationError(file) {
  const size = Number(file?.size) || 0;
  if (size > MAX_CHAT_ATTACHMENT_BYTES) {
    return 'File hoặc ảnh không được lớn hơn 500 MB.';
  }
  return '';
}

export function canRecallDeliveredMessage(message) {
  return Boolean(
    message
    && !message.recalled
    && !message.pending
    && !message.failed
    && message.deliveryStatus !== 'sending'
  );
}

export function buildRecallEvent(message, actorId, createdAt = new Date().toISOString(), mode = 'all') {
  return {
    targetId: String(message?.id || '').trim(),
    targetSeq: Number(message?.seq) || 0,
    actorId,
    // Recall is restricted to the author, so the authenticated Tinode UID is
    // authoritative even when the optimistic UI still carries a Chatmgt ID.
    originalSenderId: actorId,
    originalCreatedAt: message?.createdAt || message?.raw?.ts || createdAt,
    createdAt,
    mode,
  };
}

export function recallAppliesToViewer(event, tinode) {
  if (event?.mode !== 'self') return true;
  const actorId = event?.actorId || event?.originalSenderId;
  return Boolean(actorId && tinode?.isMe?.(actorId));
}

export function recallPlaceholderSenderId(event, fallbackSenderId = '') {
  return event?.actorId || event?.originalSenderId || fallbackSenderId;
}
