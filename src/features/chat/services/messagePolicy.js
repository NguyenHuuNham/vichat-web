export const MAX_CHAT_ATTACHMENT_BYTES = 500 * 1024 * 1024;
// Keep multi-megabyte pastes out of React before the byte check runs.
export const MAX_MESSAGE_TEXT_BYTES = 120 * 1024;
export const MAX_MESSAGE_TEXT_CHARACTERS = MAX_MESSAGE_TEXT_BYTES;
export const MESSAGE_TEXT_TOO_LONG_ERROR = 'Tin nhắn quá dài. Vui lòng rút gọn nội dung rồi thử lại.';
export const EDIT_EVENT_PREFIX = '__VICHAT_EDIT_EVENT__:';

export function messageTextByteLength(value, maxBytes = Number.POSITIVE_INFINITY) {
  const text = String(value ?? '');
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else if (codeUnit <= 0x7F) {
      bytes += 1;
    } else if (codeUnit <= 0x7FF) {
      bytes += 2;
    } else {
      // TextEncoder represents an unpaired surrogate as U+FFFD (3 bytes).
      bytes += 3;
    }
    if (bytes > maxBytes) return bytes;
  }
  return bytes;
}

export function messageTextValidationError(value, label = 'Tin nhắn') {
  const text = String(value ?? '');
  if (text.length > MAX_MESSAGE_TEXT_CHARACTERS) {
    return label === 'Tin nhắn'
      ? MESSAGE_TEXT_TOO_LONG_ERROR
      : `${label} quá dài. Vui lòng rút gọn nội dung rồi thử lại.`;
  }
  if (messageTextByteLength(text, MAX_MESSAGE_TEXT_BYTES) > MAX_MESSAGE_TEXT_BYTES) {
    return label === 'Tin nhắn'
      ? MESSAGE_TEXT_TOO_LONG_ERROR
      : `${label} quá dài. Vui lòng rút gọn nội dung rồi thử lại.`;
  }
  return '';
}

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

export function canEditDeliveredMessage(message) {
  return Boolean(
    message
    && message.type === 'text'
    && String(message.text || '').trim()
    && !message.recalled
    && !message.pending
    && !message.failed
    && message.deliveryStatus !== 'sending'
  );
}

export function buildEditEvent(
  message,
  actorId,
  text,
  mentions = [],
  createdAt = new Date().toISOString(),
) {
  return {
    targetId: String(message?.id || '').trim(),
    targetSeq: Number(message?.seq) || 0,
    actorId: String(actorId || '').trim(),
    text: String(text || '').trim(),
    mentions: Array.isArray(mentions) ? mentions.slice(0, 50) : [],
    // Keep the old version in normal-sized events so history remains useful
    // even when an older client did not retain the original packet locally.
    previousText: String(message?.text || ''),
    previousMentions: Array.isArray(message?.mentions) ? message.mentions.slice(0, 50) : [],
    createdAt,
  };
}

export function editEventActorId(editMessage) {
  return String(
    editMessage?.senderId
      || editMessage?.raw?.from
      || editMessage?.raw?.head?.['x-sender-id']
      || '',
  ).trim();
}

export function editTargetsMessage(editMessage, message) {
  const event = editMessage?.editEvent || editMessage?.raw?.editEvent || {};
  const targetId = String(event.targetId || '').trim();
  const targetSeq = Number(event.targetSeq) || 0;
  const messageId = String(message?.id || '').trim();
  const messageSeq = Number(message?.seq) || Number(message?.raw?.seq) || 0;
  const idMatches = Boolean(targetId && targetId === messageId);
  const sequenceMatches = Boolean(targetSeq > 0 && targetSeq === messageSeq);
  // Tinode sequences are unique within a topic and remain stable when a
  // client-generated message ID changes between legacy and current clients.
  // Prefer the sequence when both packets expose it; use the ID only for
  // optimistic/legacy packets which do not have a usable sequence.
  if (targetSeq > 0 && messageSeq > 0) return Boolean(message && sequenceMatches);
  return Boolean(message && idMatches);
}

export function editActorMatchesMessage(editMessage, message) {
  const actorId = editEventActorId(editMessage);
  const senderId = String(
    message?.senderId
      || message?.raw?.from
      || message?.raw?.head?.['x-sender-id']
      || '',
  ).trim();
  return Boolean(actorId && senderId && actorId === senderId);
}

export function applyEditToMessage(message, editMessage) {
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
  const historyEntry = {
    ...(eventId ? { eventId } : {}),
    ...(eventSeq > 0 ? { seq: eventSeq } : {}),
    text: previousText,
    mentions: previousMentions,
    editedAt,
  };
  return {
    ...message,
    text: nextText,
    mentions: Array.isArray(event.mentions) ? event.mentions.slice(0, 50) : [],
    edited: true,
    editedAt,
    editHistory: [...history, historyEntry],
  };
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

export function applyRecallToMessage(message, recallMessage) {
  if (!recallMessage) return message;
  if (recallMessage.recallEvent?.mode === 'self') return null;
  return {
    ...message,
    type: 'text',
    text: 'Tin nhắn đã được thu hồi',
    recalled: true,
    file: undefined,
    image: undefined,
    sticker: undefined,
    replyTo: null,
    reactions: {},
    reactionUsers: {},
  };
}

export function compactMessages(messages = []) {
  return messages.filter(Boolean);
}
