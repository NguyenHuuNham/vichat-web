import { describe, expect, it } from 'vitest';
import { Conversation } from '../types';
import {
  getChannelBadgeInfo,
  isConversationMatchingFilter,
  resolveConversationChannel,
} from './channelPolicy';

function makeMockConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    managementId: 'mgmt-1',
    tinodeTopic: 'grpTest',
    name: 'Nguyễn Văn A',
    isGroup: false,
    messages: [],
    badge: 0,
    ...overrides,
  };
}

describe('channelPolicy', () => {
  it('resolves explicit channel property', () => {
    expect(resolveConversationChannel(makeMockConversation({ channel: 'zalo_oa' }))).toBe('zalo_oa');
    expect(resolveConversationChannel(makeMockConversation({ channelType: 'livechat' }))).toBe('livechat');
    expect(resolveConversationChannel(makeMockConversation({ sourceType: 'facebook_page' }))).toBe('facebook');
  });

  it('infers channel from tinodeTopic or managementId prefix', () => {
    expect(resolveConversationChannel(makeMockConversation({ tinodeTopic: 'zalo:oa_12345' }))).toBe('zalo');
    expect(resolveConversationChannel(makeMockConversation({ managementId: 'livechat_user_99' }))).toBe('livechat');
    expect(resolveConversationChannel(makeMockConversation({ tinodeTopic: 'fb:10001234' }))).toBe('facebook');
  });

  it('falls back to internal when no external markers exist', () => {
    expect(resolveConversationChannel(makeMockConversation({ tinodeTopic: 'usr1234' }))).toBe('internal');
    expect(resolveConversationChannel(null)).toBe('internal');
  });

  it('filters conversations correctly', () => {
    const zaloConv = makeMockConversation({ channel: 'zalo_oa', name: 'Zalo Customer' });
    const livechatConv = makeMockConversation({ channel: 'livechat', name: 'Web Guest' });
    const groupConv = makeMockConversation({ isGroup: true, name: 'Nhóm Kỹ Thuật' });
    const unreadConv = makeMockConversation({ badge: 3, name: 'Sếp Cường' });

    expect(isConversationMatchingFilter(zaloConv, 'all')).toBe(true);
    expect(isConversationMatchingFilter(zaloConv, 'zalo')).toBe(true);
    expect(isConversationMatchingFilter(zaloConv, 'livechat')).toBe(false);

    expect(isConversationMatchingFilter(livechatConv, 'livechat')).toBe(true);
    expect(isConversationMatchingFilter(livechatConv, 'zalo')).toBe(false);

    expect(isConversationMatchingFilter(groupConv, 'groups')).toBe(true);
    expect(isConversationMatchingFilter(unreadConv, 'unread')).toBe(true);
    expect(isConversationMatchingFilter(zaloConv, 'unread')).toBe(false);
  });

  it('provides badge visual configurations', () => {
    expect(getChannelBadgeInfo('zalo_oa')).toEqual({
      label: 'Zalo OA',
      badgeColor: '#0068FF',
      textColor: '#FFFFFF',
    });
    expect(getChannelBadgeInfo('zalo_group')).toEqual({
      label: 'Zalo Group',
      badgeColor: '#0068FF',
      textColor: '#FFFFFF',
    });
    expect(getChannelBadgeInfo('zalo')).toEqual({
      label: 'Zalo',
      badgeColor: '#0068FF',
      textColor: '#FFFFFF',
    });
    expect(getChannelBadgeInfo('livechat')).toEqual({
      label: 'Live Chat',
      badgeColor: '#10B981',
      textColor: '#FFFFFF',
    });
    expect(getChannelBadgeInfo('facebook')).toEqual({
      label: 'Facebook',
      badgeColor: '#1877F2',
      textColor: '#FFFFFF',
    });
    expect(getChannelBadgeInfo('internal')).toBeNull();
  });
});
