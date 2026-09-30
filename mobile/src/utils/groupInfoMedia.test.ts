import { describe, expect, it } from 'vitest';
import { ChatMessage } from '../types';
import { isImageMessage, messageFile, messagesForSharedKind } from './groupInfoMedia';

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
});
