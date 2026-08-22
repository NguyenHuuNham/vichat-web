import { isAudioAttachment } from './messagePresentation.js';

function isImageFile(file, type = '', image = '') {
  const name = String(file?.name || '').toLowerCase();
  const mime = String(file?.mime || '').toLowerCase();
  return type === 'image'
    || Boolean(image)
    || mime.startsWith('image/')
    || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(name);
}

export function attachmentConversationPreview(message) {
  if (!message) return '';
  if (message.type === 'sticker' || message.sticker) {
    const sender = message.sender === 'outgoing' ? 'Bạn' : (message.senderName || 'Thành viên');
    return `${sender} đã gửi sticker`;
  }
  const image = isImageFile(message.file, message.type, message.image);
  const isAttachment = image || message.type === 'file' || Boolean(message.file);
  if (!isAttachment) return '';

  const sender = message.sender === 'outgoing'
    ? 'Bạn'
    : (message.senderName || 'Thành viên');
  return `${sender} đã gửi ${isAudioAttachment(message.file, message.type) ? 'tin nhắn thoại' : image ? '1 ảnh' : '1 tệp'}`;
}
