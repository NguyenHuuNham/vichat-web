import { describe, expect, it } from 'vitest';
import { getMentionContext, insertMentionAt, mentionTokenExists, matchesMentionCandidate, serializeMentionForTransport } from './mentionPolicy';

describe('mobile mention policy', () => {
  it('finds the active mention query and inserts the selected member', () => {
    const value = 'Chào @ngu';
    const context = getMentionContext(value, value.length);
    const result = insertMentionAt(value, context, { id: 'u-1', uid: 'usr-1', name: 'Nguyễn An' });
    expect(context).toEqual({ start: 5, end: 9, query: 'ngu' });
    expect(result.text).toBe('Chào @Nguyễn An ');
    expect(result.caret).toBe(result.text.length);
  });

  it('matches Vietnamese names without requiring the accent in the search', () => {
    expect(matchesMentionCandidate({ name: 'Nguyễn An' }, 'nguyen')).toBe(true);
    expect(mentionTokenExists('Chào @Nguyễn An nhé', '@Nguyễn An')).toBe(true);
  });

  it('uses the same canonical account name as web mentions', () => {
    const candidate = {
      id: 'account-2',
      uid: 'usr-2',
      name: 'Biệt danh trong nhóm',
      default_name: 'Đặng Dũng',
    };
    expect(matchesMentionCandidate(candidate, 'dung')).toBe(true);
    expect(serializeMentionForTransport(candidate)).toMatchObject({
      name: 'Đặng Dũng',
      token: '@Đặng Dũng',
    });
  });

  it('serializes the stable account identity used by Tinode and web', () => {
    expect(serializeMentionForTransport({ id: 'account-1', uid: 'usr-1', name: 'Nguyễn An' })).toEqual({
      id: 'account-1',
      tinodeUid: 'usr-1',
      name: 'Nguyễn An',
      token: '@Nguyễn An',
      isAll: false,
      isBot: false,
    });
  });
});
