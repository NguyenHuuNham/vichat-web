import { Conversation } from '../types';

export function retainAvailableConversations(conversations: Conversation[], availableTopics: Set<string>) {
  if (!availableTopics.size) return conversations;
  return conversations.filter(conversation => Boolean(
    conversation.tinodeTopic && availableTopics.has(conversation.tinodeTopic),
  ));
}
