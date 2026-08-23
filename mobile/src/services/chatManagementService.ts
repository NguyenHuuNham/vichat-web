import { Conversation, User, TinodeChatbotConfig } from '../types';
import { apiRequest, responseItems } from './apiClient';
import { normalizeUser } from './authService';
import { normalizeMuteUntil } from '../utils/conversationNotifications';
import { normalizeMediaUrl } from '../utils/mediaUrl';

function normalizeConversation(record: any): Conversation {
  const properties = record?.properties || {};
  const topic = String(record?.tinodeTopic || record?.tinode_topic || record?.channel_thread_id || '');
  const id = String(record?.managementId || record?.id || record?.conversation_no || topic);
  return {
    id,
    managementId: id,
    tinodeTopic: topic,
    name: String(record?.name || record?.subject || properties.name || 'Cuộc trò chuyện'),
    isGroup: Boolean(record?.isGroup ?? record?.is_group ?? properties.isGroup ?? properties.is_group),
    adminId: String(record?.adminId || record?.admin_id || properties.adminId || properties.admin_id || ''),
    avatarUrl: normalizeMediaUrl(record?.avatarUrl || record?.avatar || properties.avatar || ''),
    description: String(record?.description || properties.description || ''),
    membersCount: String(record?.membersCount || properties.membersCount || ''),
    members: Array.isArray(record?.members) ? record.members.map(normalizeUser) : [],
    participantIds: Array.isArray(record?.participantIds)
      ? record.participantIds.map(String)
      : (Array.isArray(properties.participantIds) ? properties.participantIds.map(String) : []),
    messages: [],
    lastMsg: String(record?.lastMsg || properties.lastMessage || ''),
    time: String(record?.time || properties.time || ''),
    updatedAt: record?.updatedAt || record?.last_message_at || properties.updatedAt,
    badge: Number(record?.badge || properties.unreadCount || 0),
    notificationMutedUntil: normalizeMuteUntil(record?.notificationMutedUntil ?? record?.notification_muted_until),
  };
}

export const chatManagementService = {
  async listUsers(search = ''): Promise<User[]> {
    const query = new URLSearchParams({ results_per_page: search ? '50' : '1000' });
    if (search.trim()) query.set('q', search.trim());
    const payload = await apiRequest(`/api/v1/chat/users?${query.toString()}`);
    return responseItems(payload).map(normalizeUser).filter(user => user.active);
  },

  async listConversations(): Promise<Conversation[]> {
    const payload = await apiRequest('/api/v1/conversation');
    return responseItems(payload).map(normalizeConversation);
  },

  async createConversation(input: {
    subject: string;
    isGroup?: boolean;
    participantIds: string[];
    properties?: Record<string, unknown>;
  }) {
    const payload = await apiRequest('/api/v1/conversation', {
      method: 'POST',
      body: JSON.stringify({
        subject: input.subject,
        is_group: Boolean(input.isGroup),
        participant_ids: input.participantIds,
        properties: input.properties || {},
      }),
    });
    return normalizeConversation(payload);
  },

  async prepareTinodeConversation(conversationId: string) {
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/tinode-prepare`, {
      method: 'POST',
    });
    return normalizeConversation(payload);
  },

  async bindTinodeTopic(conversationId: string, topicName: string, tinodeToken: string, avatarUrl = '') {
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/tinode-topic`, {
      method: 'PUT',
      body: JSON.stringify({ tinode_topic: topicName, tinode_token: tinodeToken, avatar: avatarUrl }),
    });
    return normalizeConversation(payload);
  },

  async updateConversationNotifications(conversationId: string, mutedUntil: number | null) {
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/notification-settings`, {
      method: 'PUT',
      body: JSON.stringify({ muted_until: mutedUntil }),
    });
    return normalizeConversation(payload);
  },

  async removeConversationParticipant(conversationId: string, participantId: string, tinodeToken = '', replacementId = '') {
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(participantId)}`, {
      method: 'DELETE',
      body: JSON.stringify({
        tinode_token: tinodeToken,
        ...(replacementId ? { replacement_id: replacementId } : {}),
      }),
    });
    return normalizeConversation(payload);
  },

  async deleteConversationForCurrentUser(conversationId: string, tinodeToken = '', replacementId = '') {
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/self`, {
      method: 'DELETE',
      body: JSON.stringify({
        tinode_token: tinodeToken,
        ...(replacementId ? { replacement_id: replacementId } : {}),
      }),
    });
    return normalizeConversation(payload);
  },

  async listBotConfig(): Promise<TinodeChatbotConfig> {
    try {
      const payload = await apiRequest<TinodeChatbotConfig>('/api/v1/chatbot/tinode-config');
      return { ...payload, enabled: Boolean(payload?.enabled && (payload?.tinodeUid || payload?.uid)) };
    } catch {
      return { enabled: false };
    }
  },
};

export { normalizeConversation };
