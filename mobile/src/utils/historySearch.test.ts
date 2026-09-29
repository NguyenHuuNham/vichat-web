import { describe, expect, it } from 'vitest';
import { searchHistoryMessages } from './historySearch';

describe('history search', () => {
  it('matches Vietnamese text and sender/file metadata', () => {
    const messages = [
      { id: '1', seq: 1, type: 'text', sender: 'incoming', senderId: 'usr-a', senderName: 'Nguyen An', text: 'Quy trinh nghi phep' },
      { id: '2', seq: 2, type: 'file', sender: 'incoming', senderId: 'usr-b', senderName: 'Binh', text: '', file: { name: 'Bao-cao-thang.pdf', mime: 'application/pdf', size: 10, url: '' } },
    ] as any;

    expect(searchHistoryMessages(messages, 'nghỉ phép').map(message => message.id)).toEqual(['1']);
    expect(searchHistoryMessages(messages, 'báo cáo').map(message => message.id)).toEqual(['2']);
  });

  it('does not return control messages or empty queries', () => {
    const messages = [
      { id: 'system', seq: 3, type: 'system', sender: 'incoming', senderId: 'usr-a', senderName: 'A', text: 'group settings changed' },
      { id: 'text', seq: 2, type: 'text', sender: 'incoming', senderId: 'usr-a', senderName: 'A', text: 'hello' },
    ] as any;

    expect(searchHistoryMessages(messages, 'settings')).toEqual([]);
    expect(searchHistoryMessages(messages, '')).toEqual([]);
  });
});
