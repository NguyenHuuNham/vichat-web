import type { Conversation, DeliveryStatus } from '../types';

export interface ReceiptCursor {
  receivedSeq?: number;
  readSeq?: number;
}

function deliveryRank(status: DeliveryStatus) {
  return { none: 0, sending: 1, sent: 2, received: 3, read: 4, failed: 0 }[status] || 0;
}

export function mapTinodeDeliveryStatus(status: unknown, outgoing: boolean, seq?: number, cursor?: ReceiptCursor): DeliveryStatus {
  if (!outgoing) return 'received';
  const value = Number(status) || 0;
  const sequence = Number(seq) || 0;
  let mapped: DeliveryStatus;
  if (value >= 70) mapped = 'read';
  else if (value >= 60) mapped = 'received';
  else if (value >= 50) mapped = 'sent';
  else if (value === 10 || value === 20) mapped = 'sending';
  else if (value === 30 || value === 40) mapped = 'failed';
  else mapped = sequence > 0 ? 'sent' : 'none';

  if (sequence > 0 && Number(cursor?.receivedSeq) >= sequence && deliveryRank(mapped) < deliveryRank('received')) {
    mapped = 'received';
  }
  if (sequence > 0 && Number(cursor?.readSeq) >= sequence && deliveryRank(mapped) < deliveryRank('read')) {
    mapped = 'read';
  }
  return mapped;
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
