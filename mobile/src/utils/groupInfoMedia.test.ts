import { describe, expect, it } from 'vitest';
import { ChatMessage } from '../types';
import { isImageMessage, mergeGroupHistoryMessages, messageFile, messagesForSharedKind } from './groupInfoMedia';
import { getCachedImageUri } from '../services/tinodeClient';

const stickerMessage = {
  id: 'sticker-1',
  type: 'sticker',
  sender: 'outgoing',
  senderId: 'usr-me',
  senderName: 'You',
  text: '',
  image: 'https://media.example/sticker.png',
  file: { name: 'sticker.png', mime: 'image/png', size: 12, url: 'https://media.example/sticker.png' },
  sticker: { id: 'hello', stickerId: 'hello', packId: 'basic', label: 'Hello' },
} as ChatMessage;

describe('group shared media classification', () => {
  it('does not expose stickers as images or files', () => {
    expect(isImageMessage(stickerMessage)).toBe(false);
    expect(messageFile(stickerMessage)).toBeNull();
    expect(messagesForSharedKind([stickerMessage], 'media')).toEqual([]);
    expect(messagesForSharedKind([stickerMessage], 'files')).toEqual([]);
  });

  it('keeps normal images and audio attachments in their own categories', () => {
    const image = { ...stickerMessage, id: 'image-1', type: 'image', sticker: undefined, file: { ...stickerMessage.file!, name: 'photo.jpg', mime: 'image/jpeg' } } as ChatMessage;
    const audio = { ...stickerMessage, id: 'audio-1', type: 'audio', sticker: undefined, image: undefined, file: { name: 'voice.m4a', mime: 'audio/mp4', size: 10, url: 'https://media.example/voice.m4a' } } as ChatMessage;

    expect(messagesForSharedKind([image], 'media')).toEqual([image]);
    expect(messagesForSharedKind([audio], 'files')).toEqual([audio]);
  });

  it('fills a live message with the attachment recovered from history', () => {
    const live = { id: 'client-1', seq: 42, type: 'text', sender: 'incoming', text: '', senderId: 'usr-peer' } as ChatMessage;
    const historical = {
      id: 'server-1',
      seq: 42,
      type: 'image',
      sender: 'incoming',
      text: '',
      senderId: 'usr-peer',
      image: 'https://media.example/photo.jpg',
      file: { name: 'photo.jpg', mime: 'image/jpeg', size: 12, url: 'https://media.example/photo.jpg' },
    } as ChatMessage;

    const [merged] = mergeGroupHistoryMessages([live], [historical]);
    expect(merged.type).toBe('image');
    expect(merged.file?.url).toBe(historical.file?.url);
    expect(messagesForSharedKind([merged], 'media')).toEqual([merged]);
  });

  it('returns synchronous URIs immediately from getCachedImageUri', () => {
    expect(getCachedImageUri('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
    expect(getCachedImageUri('file:///data/user/0/cache/img.jpg')).toBe('file:///data/user/0/cache/img.jpg');
    expect(getCachedImageUri('content://media/external/images/1')).toBe('content://media/external/images/1');
    expect(getCachedImageUri('')).toBe('');
    expect(getCachedImageUri('https://example.com/not-cached-yet.jpg')).toBe('');
  });

  it('correctly merges multiple paginated history batches with deduplication and sorting', () => {
    const page1 = [
      { id: 'msg-30', seq: 30, type: 'text', sender: 'incoming', text: 'Hello', senderId: 'u1' } as ChatMessage,
      { id: 'msg-29', seq: 29, type: 'image', sender: 'incoming', text: '', senderId: 'u1', image: 'https://media.example/img29.jpg' } as ChatMessage,
    ];
    const page2 = [
      { id: 'msg-29', seq: 29, type: 'image', sender: 'incoming', text: '', senderId: 'u1', image: 'https://media.example/img29.jpg' } as ChatMessage,
      { id: 'msg-10', seq: 10, type: 'file', sender: 'incoming', text: '', senderId: 'u2', file: { name: 'doc.pdf', mime: 'application/pdf', size: 100, url: 'https://media.example/doc.pdf' } } as ChatMessage,
      { id: 'msg-1', seq: 1, type: 'text', sender: 'incoming', text: 'First message', senderId: 'u1' } as ChatMessage,
    ];
    const merged = mergeGroupHistoryMessages(page1, page2);
    expect(merged.length).toBe(4);
    expect(merged.map(m => m.seq)).toEqual([1, 10, 29, 30]);
    expect(messagesForSharedKind(merged, 'media').length).toBe(1);
    expect(messagesForSharedKind(merged, 'files').length).toBe(1);
  });
});
