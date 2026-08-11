import type { Conversation, DeliveryStatus } from '../types';

export function mapTinodeDeliveryStatus(status: unknown, outgoing: boolean, seq?: number): DeliveryStatus {
  if (!outgoing) return 'received';
  const value = Number(status) || 0;
  if (value >= 70) return 'read';
  if (value >= 60) return 'received';
  if (value >= 50) return 'sent';
  if (value === 10 || value === 20) return 'sending';
  if (value === 30 || value === 40) return 'failed';
  return Number(seq) > 0 ? 'sent' : 'none';
}

export function applyPresenceToConversation(conversation: Conversation, uid: string, online: boolean): Conversation {
  let matched = false;
  const members = (conversation.members || []).map(member => {
    if (member.uid !== uid && member.id !== uid) return member;
    matched = true;
    return { ...member, online };
  });
  const directTopicMatch = !conversation.isGroup && conversation.tinodeTopic === uid;
  if (!matched && !directTopicMatch) return conversation;
  return {
    ...conversation,
    members,
    membersCount: conversation.isGroup ? conversation.membersCount : (online ? 'Đang hoạt động' : 'Offline'),
  };
}
