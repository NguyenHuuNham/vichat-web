export const CONVERSATION_LIST_TABS = Object.freeze({
  ALL: 'all',
  GROUPS: 'groups',
  CATEGORIES: 'categories',
});

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
    if (status === 'unread' && !isUnread(room, id)) return false;
    if (selectedCategories.size > 0) {
      const categoryId = String(room.categoryId || room.category || '').trim();
      if (!selectedCategories.has(categoryId)) return false;
    }
    if (strangersOnly && !isStranger(room, id)) return false;
    return true;
  });
}
