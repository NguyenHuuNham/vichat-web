export function isAudioAttachment(file, type = '') {
  const name = String(file?.name || '').toLowerCase();
  const mime = String(file?.mime || '').toLowerCase();
  return type === 'audio'
    || mime.startsWith('audio/')
    || /\.(aac|flac|m4a|mp3|ogg|opus|wav|webm)$/i.test(name);
}

const IMAGE_FILE_EXTENSIONS = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;

export function isImageFile(file) {
  const name = String(file?.name || '').toLowerCase();
  const mime = String(file?.type || file?.mime || '').toLowerCase();
  return mime.startsWith('image/') || IMAGE_FILE_EXTENSIONS.test(name);
}

export function splitAttachmentSelection(files, source = 'file') {
  const selected = Array.from(files || []).filter(Boolean);
  const imageSelection = source === 'image';
  return {
    accepted: selected.filter(file => imageSelection === isImageFile(file)),
    rejected: selected.filter(file => imageSelection !== isImageFile(file)),
  };
}

export function formatAudioDuration(seconds) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function messageContentLabel(message, fallback = 'Tệp đính kèm') {
  if (!message) return fallback;
  const file = message.file || null;
  if (isAudioAttachment(file, message.type) || Number(message.voiceDuration) > 0) return 'Tin nhắn thoại';
  if (message.type === 'image' || String(file?.mime || '').toLowerCase().startsWith('image/')) return 'Ảnh';
  return String(message.text || file?.name || fallback).trim() || fallback;
}

export function replyContentLabel(reply, fallback = 'Tệp đính kèm') {
  if (!reply) return fallback;
  if (String(reply.text || '').trim()) return String(reply.text).trim();
  if (isAudioAttachment(reply.file || { name: reply.fileName, mime: reply.fileMime }, reply.type) || Number(reply.voiceDuration) > 0) return 'Tin nhắn thoại';
  if (reply.type === 'image' || String(reply.file?.mime || reply.fileMime || '').toLowerCase().startsWith('image/')) return 'Ảnh';
  return String(reply.fileName || reply.file?.name || fallback).trim() || fallback;
}
