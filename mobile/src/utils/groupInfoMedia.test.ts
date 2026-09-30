import { describe, expect, it } from 'vitest';
import { mergeGroupHistoryMessages, messageLinks, messagesForSharedKind } from './groupInfoMedia';
import { ChatMessage } from '../types';

const message = (value: Partial<ChatMessage>): ChatMessage => ({
  id: String(value.id || 'message'),
  type: value.type || 'text',
  sender: 'incoming',
  senderId: 'user-1',
  senderName: 'User',
  text: '',
  ...value,
});

describe('group info shared content', () => {
  it('extracts explicit and text links without punctuation', () => {
    expect(messageLinks(message({ text: 'Xem https://example.com/a.' }))).toEqual(['https://example.com/a']);
  });

  it('separates image attachments from regular files', () => {
    const image = message({ id: 'image', type: 'image', image: '/api/v1/chat/media/image' });
    const file = message({ id: 'file', type: 'file', file: { name: 'report.pdf', mime: 'application/pdf', size: 10, url: '/api/v1/chat/media/file' } });
    expect(messagesForSharedKind([image, file], 'media').map(item => item.id)).toEqual(['image']);
    expect(messagesForSharedKind([image, file], 'files').map(item => item.id)).toEqual(['file']);
  });

  it('keeps live message fields when history contains an older duplicate', () => {
    const live = message({ id: 'same', seq: 3, text: 'new', image: 's3-ref' });
    const history = message({ id: 'same', seq: 3, text: 'old' });
    expect(mergeGroupHistoryMessages([live], [history])).toEqual([live]);
  });
});

