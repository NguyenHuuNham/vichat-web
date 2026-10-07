import { ChannelType, Conversation } from '../types';

export type ChannelFilterKey = 'all' | 'zalo' | 'livechat' | 'groups' | 'unread' | 'facebook';

export interface ChannelBadgeInfo {
  label: string;
  badgeColor: string;
  textColor: string;
}

/**
 * Determine the channel type of a conversation based on its explicit properties
 * or topic/management namespace indicators.
 */
export function resolveConversationChannel(conversation?: Partial<Conversation> | null): ChannelType {
  if (!conversation) return 'internal';

  if (conversation.channel) return conversation.channel;
  if (conversation.channelType) return conversation.channelType;

  const sourceType = String(conversation.sourceType || '').toLowerCase();
  if (sourceType.includes('zalo_oa')) return 'zalo_oa';
  if (sourceType.includes('zalo_group')) return 'zalo_group';
  if (sourceType.includes('zalo')) return 'zalo';
  if (sourceType.includes('livechat')) return 'livechat';
  if (sourceType.includes('facebook') || sourceType.includes('fb')) return 'facebook';

  const topic = String(conversation.tinodeTopic || '').toLowerCase();
  const managementId = String(conversation.managementId || '').toLowerCase();

  if (topic.startsWith('zalo:') || managementId.startsWith('zalo_') || managementId.startsWith('zalo:')) {
    return 'zalo';
  }
  if (topic.startsWith('livechat:') || managementId.startsWith('livechat_') || managementId.startsWith('livechat:')) {
    return 'livechat';
  }
  if (topic.startsWith('fb:') || topic.startsWith('facebook:') || managementId.startsWith('fb_')) {
    return 'facebook';
  }

  return 'internal';
}

/**
 * Matches a conversation against the current chat list filter tab.
 */
export function isConversationMatchingFilter(
  conversation: Conversation,
  filter: ChannelFilterKey,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'unread') return Number(conversation.badge) > 0;
  if (filter === 'groups') return Boolean(conversation.isGroup);

  const channel = resolveConversationChannel(conversation);
  if (filter === 'zalo') {
    return channel === 'zalo' || channel === 'zalo_oa' || channel === 'zalo_group';
  }
  if (filter === 'livechat') {
    return channel === 'livechat';
  }
  if (filter === 'facebook') {
    return channel === 'facebook';
  }

  return true;
}

/**
 * Returns visual styling for external channel badges.
 */
export function getChannelBadgeInfo(channel: ChannelType): ChannelBadgeInfo | null {
  switch (channel) {
    case 'zalo_oa':
      return {
        label: 'Zalo OA',
        badgeColor: '#0068FF',
        textColor: '#FFFFFF',
      };
    case 'zalo_group':
      return {
        label: 'Zalo Group',
        badgeColor: '#0068FF',
        textColor: '#FFFFFF',
      };
    case 'zalo':
      return {
        label: 'Zalo',
        badgeColor: '#0068FF',
        textColor: '#FFFFFF',
      };
    case 'livechat':
      return {
        label: 'Live Chat',
        badgeColor: '#10B981',
        textColor: '#FFFFFF',
      };
    case 'facebook':
      return {
        label: 'Facebook',
        badgeColor: '#1877F2',
        textColor: '#FFFFFF',
      };
    default:
      return null;
  }
}
