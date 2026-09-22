import { Conversation } from '../types';

function conversationTimestamp(conversation: Conversation) {
  const value = conversation.updatedAt;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function conversationKey(conversation: Conversation) {
  const topic = String(conversation.tinodeTopic || '').trim();
  if (topic) return `topic:${topic}`;
  const managementId = String(conversation.managementId || conversation.id || '').trim();
  return managementId ? `management:${managementId}` : '';
}

function conversationRichness(conversation: Conversation) {
  return (conversation.tinodeTopic ? 4 : 0)
    + (conversation.managementId ? 2 : 0)
    + (conversation.members?.length ? 2 : 0)
    + (conversation.participantIds?.length ? 1 : 0)
    + (conversation.lastMsg ? 1 : 0)
    + (conversation.updatedAt ? 1 : 0);
}

function mergeDuplicateConversation(first: Conversation, second: Conversation) {
  const firstTime = conversationTimestamp(first);
  const secondTime = conversationTimestamp(second);
  const preferred = secondTime > firstTime
    || (secondTime === firstTime && conversationRichness(second) > conversationRichness(first))
    ? second
    : first;
  const fallback = preferred === first ? second : first;
  return {
    ...fallback,
    ...preferred,
    id: preferred.id || fallback.id,
    managementId: preferred.managementId || fallback.managementId || preferred.id,
    tinodeTopic: preferred.tinodeTopic || fallback.tinodeTopic,
    name: preferred.name || fallback.name,
    avatarUrl: preferred.avatarUrl || fallback.avatarUrl,
    description: preferred.description || fallback.description,
    members: preferred.members?.length ? preferred.members : fallback.members || [],
    participantIds: preferred.participantIds?.length ? preferred.participantIds : fallback.participantIds || [],
    messages: preferred.messages?.length ? preferred.messages : fallback.messages || [],
  };
}

/** Keep one mobile row for each Chatmgt/Tinode conversation identity. */
export function dedupeConversations(conversations: Conversation[]) {
  const byKey = new Map<string, Conversation>();
  conversations.forEach(conversation => {
    const key = conversationKey(conversation);
    if (!key) return;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeDuplicateConversation(existing, conversation) : conversation);
  });
  return [...byKey.values()];
}

export function retainAvailableConversations(conversations: Conversation[], availableTopics: Set<string>) {
  if (!availableTopics.size) return conversations;
  return conversations.filter(conversation => Boolean(
    conversation.tinodeTopic && availableTopics.has(conversation.tinodeTopic),
  ));
}
