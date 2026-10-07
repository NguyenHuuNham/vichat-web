export const CONVERSATION_LIST_TABS = Object.freeze({
  ALL: 'all',
  ZALO: 'zalo',
  LIVECHAT: 'livechat',
  GROUPS: 'groups',
  CATEGORIES: 'categories',
  FACEBOOK: 'facebook',
});

export function resolveConversationChannel(room) {
  if (!room) return 'internal';
  if (room.channel) return room.channel;
  if (room.channelType) return room.channelType;

  const sourceType = String(room.sourceType || '').toLowerCase();
  if (sourceType.includes('zalo_oa')) return 'zalo_oa';
  if (sourceType.includes('zalo_group')) return 'zalo_group';
  if (sourceType.includes('zalo')) return 'zalo';
  if (sourceType.includes('livechat')) return 'livechat';
  if (sourceType.includes('facebook') || sourceType.includes('fb')) return 'facebook';

  const topic = String(room.tinodeTopic || room.topic || '').toLowerCase();
  const id = String(room.id || '').toLowerCase();
  if (topic.startsWith('zalo:') || id.startsWith('zalo_') || id.startsWith('zalo:')) return 'zalo';
  if (topic.startsWith('livechat:') || id.startsWith('livechat_') || id.startsWith('livechat:')) return 'livechat';
  if (topic.startsWith('fb:') || topic.startsWith('facebook:') || id.startsWith('fb_')) return 'facebook';

  return 'internal';
}

export function getChannelBadge(room) {
  const channel = resolveConversationChannel(room);
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

export function filterConversationIds({
  baseIds = [],
  conversations = {},
  tab = CONVERSATION_LIST_TABS.ALL,
  status = 'all',
  categoryIds = [],
  strangersOnly = false,
  isUnread = () => false,
  isStranger = () => false,
} = {}) {
  const selectedCategories = new Set(
    (Array.isArray(categoryIds) ? categoryIds : [])
      .map(value => String(value || '').trim())
      .filter(Boolean),
  );
  return (Array.isArray(baseIds) ? baseIds : []).filter(id => {
    const room = conversations?.[id];
    if (!room) return false;
    if (tab === CONVERSATION_LIST_TABS.GROUPS && !room.isGroup) return false;
    if (tab === CONVERSATION_LIST_TABS.ZALO) {
      const channel = resolveConversationChannel(room);
      if (channel !== 'zalo' && channel !== 'zalo_oa' && channel !== 'zalo_group') return false;
    }
    if (tab === CONVERSATION_LIST_TABS.LIVECHAT) {
      const channel = resolveConversationChannel(room);
      if (channel !== 'livechat') return false;
    }
    if (tab === CONVERSATION_LIST_TABS.FACEBOOK) {
      const channel = resolveConversationChannel(room);
      if (channel !== 'facebook') return false;
    }
    if (status === 'unread' && !isUnread(room, id)) return false;
    if (selectedCategories.size > 0) {
      const categoryId = String(room.categoryId || room.category || '').trim();
      if (!selectedCategories.has(categoryId)) return false;
    }
    if (strangersOnly && !isStranger(room, id)) return false;
    return true;
  });
}
