import { describe, expect, it } from 'vitest';
import { getPinnedMessageSnippet } from './pinnedMessage';
import { ChatMessage } from '../types';

describe('pinnedMessage getPinnedMessageSnippet', () => {
  const t = (k: string) => k;

  it('formats normal text snippet', () => {
    const msg = { text: 'Nội dung thông báo cuộc họp lúc 10h' } as ChatMessage;
    expect(getPinnedMessageSnippet(msg, t)).toBe('Nội dung thông báo cuộc họp lúc 10h');
  });

  it('formats link snippet cleanly with [Link] prefix and domain', () => {
    const msg = { text: 'Tham gia họp qua https://meet.google.com/abc-defg-hij nhé mọi người' } as ChatMessage;
    expect(getPinnedMessageSnippet(msg, t)).toBe('[Link] meet.google.com/abc-defg-hij');
  });

  it('formats image snippet with and without caption', () => {
    const msgWithoutCaption = { image: 'file://img.png' } as ChatMessage;
    expect(getPinnedMessageSnippet(msgWithoutCaption, t)).toBe('[Hình ảnh]');

    const msgWithCaption = { image: 'file://img.png', text: 'Sơ đồ thiết kế' } as ChatMessage;
    expect(getPinnedMessageSnippet(msgWithCaption, t)).toBe('[Hình ảnh] Sơ đồ thiết kế');
  });

  it('formats voice audio message snippet', () => {
    const msgAudio = { type: 'audio', file: { mime: 'audio/m4a' } } as ChatMessage;
    expect(getPinnedMessageSnippet(msgAudio, t)).toBe('[Tin nhắn thoại]');
  });

  it('formats attachment file snippet', () => {
    const msgFile = { file: { name: 'BaoCaoTuan.pdf' } } as ChatMessage;
    expect(getPinnedMessageSnippet(msgFile, t)).toBe('[Tệp] BaoCaoTuan.pdf');
  });

  it('formats poll snippet', () => {
    const msgPoll = { poll: { question: 'Chọn ngày liên hoan cuối năm' } } as ChatMessage;
    expect(getPinnedMessageSnippet(msgPoll, t)).toBe('[Bình chọn] Chọn ngày liên hoan cuối năm');
  });

  it('formats recalled message snippet', () => {
    const msgRecalled = { recalled: true, text: 'Nội dung đã bị thu hồi' } as ChatMessage;
    expect(getPinnedMessageSnippet(msgRecalled, t)).toBe('Tin nhắn đã thu hồi');
  });

  it('formats location snippet', () => {
    const msgLoc = { location: { title: 'Tòa nhà Viettel', address: 'Cầu Giấy, Hà Nội' } } as ChatMessage;
    expect(getPinnedMessageSnippet(msgLoc, t)).toBe('[Vị trí] Tòa nhà Viettel');
  });

  it('formats contact card snippet', () => {
    const msgContact = { contactCard: { name: 'Nguyễn Văn A' } } as ChatMessage;
    expect(getPinnedMessageSnippet(msgContact, t)).toBe('[Danh thiếp] Nguyễn Văn A');
  });

  it('formats sticker snippet', () => {
    const msgSticker = { sticker: true } as unknown as ChatMessage;
    expect(getPinnedMessageSnippet(msgSticker, t)).toBe('[Sticker]');
  });
});
