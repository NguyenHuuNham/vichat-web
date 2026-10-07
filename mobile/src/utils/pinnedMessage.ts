import { ChatMessage } from '../types';

export function getPinnedMessageSnippet(message: ChatMessage, t: (text: string) => string = text => text): string {
  if (message.recalled) return t('Tin nhắn đã thu hồi');
  if (message.poll) return `[${t('Bình chọn')}] ${message.poll.question}`;
  if (message.type === 'audio' || /^audio\//i.test(message.file?.mime || '')) return `[${t('Tin nhắn thoại')}]`;
  if (message.image) {
    const caption = message.text ? ` ${message.text}` : '';
    return `[${t('Hình ảnh')}]${caption}`.trim();
  }
  if (message.file) return `[${t('Tệp')}] ${message.file.name || ''}`.trim();
  if (message.location) return `[${t('Vị trí')}] ${message.location.title || message.location.address || ''}`.trim();
  if (message.contactCard) return `[${t('Danh thiếp')}] ${message.contactCard.name || ''}`.trim();
  if (message.sticker) return `[${t('Sticker')}]`;
  if (message.text) {
    const raw = message.text.trim();
    const urlMatch = raw.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      const cleanUrl = urlMatch[0].replace(/^https?:\/\//i, '');
      return `[Link] ${cleanUrl}`;
    }
    return raw;
  }
  return t('Tin nhắn');
}
