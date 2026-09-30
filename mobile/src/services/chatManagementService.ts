import { Conversation, User, TinodeChatbotConfig } from '../types';
import { apiRequest, responseItems } from './apiClient';
import { authService, normalizeUser } from './authService';
import { normalizeMuteUntil } from '../utils/conversationNotifications';
import { normalizeMediaUrl } from '../utils/mediaUrl';
import { dedupeConversations } from '../utils/conversationSync';
import { normalizeGroupSettings } from '../utils/groupSettings';
import { isTinodeUid } from '../utils/identity';

const CHAT_PAGE_SIZE = 100;
const MAX_CHAT_PAGES = 50;
const CHAT_LIST_TIMEOUT_MS = 12_000;

async function listAllPages(
  path: string,
  params: Record<string, string> = {},
  timeoutMs = CHAT_LIST_TIMEOUT_MS,
  signal?: AbortSignal,
) {
  const records: any[] = [];
  const seenCursors = new Set<string>();
  let cursor = '';

  for (let page = 0; page < MAX_CHAT_PAGES; page += 1) {
    const query = new URLSearchParams({ ...params, limit: String(CHAT_PAGE_SIZE) });
    if (cursor) query.set('cursor', cursor);
    const payload = await apiRequest(`${path}?${query.toString()}`, { timeoutMs, signal });
    records.push(...responseItems(payload));

    const nextCursor = String(payload?.next_cursor || payload?.nextCursor || '').trim();
    const hasMore = payload?.has_more ?? payload?.hasMore;
    if (hasMore === false || !nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return records;
}

function normalizeConversation(record: any): Conversation {
  const properties = record?.properties || {};
  const isGroup = Boolean(record?.isGroup ?? record?.is_group ?? properties.isGroup ?? properties.is_group);
  const normalizeMember = (member: any) => ({
    ...normalizeUser(member),
    mode: String(member?.mode || member?.access_mode || ''),
    groupRole: String(member?.groupRole || member?.group_role || member?.role || '').toUpperCase(),
  });
  const topic = String(record?.tinodeTopic || record?.tinode_topic || record?.channel_thread_id || '');
  const id = String(record?.managementId || record?.id || record?.conversation_no || topic);
  return {
    id,
    managementId: id,
    tinodeTopic: topic,
    snapshotSource: 'management',
    name: String(record?.name || record?.subject || properties.name || 'Cuộc trò chuyện'),
    isGroup,
    adminId: String(record?.adminId || record?.admin_id || properties.adminId || properties.admin_id || ''),
    avatarUrl: normalizeMediaUrl(record?.avatarUrl || record?.avatar || properties.avatar || ''),
    description: String(record?.description || properties.description || ''),
    membersCount: String(record?.membersCount || properties.membersCount || ''),
    members: Array.isArray(record?.members) ? record.members.map(normalizeMember) : [],
    pendingMembers: Array.isArray(record?.pendingMembers || record?.pending_members)
      ? (record.pendingMembers || record.pending_members).map(normalizeMember)
      : [],
    participantIds: Array.isArray(record?.participantIds)
      ? record.participantIds.map(String)
      : (Array.isArray(properties.participantIds) ? properties.participantIds.map(String) : []),
    messages: [],
    lastMsg: String(record?.lastMsg || properties.lastMessage || ''),
    time: String(record?.time || properties.time || ''),
    updatedAt: record?.updatedAt || record?.updated_at || record?.last_message_at || properties.updatedAt || properties.updated_at,
    deletedAt: String(record?.deletedAt || record?.deleted_at || properties.deletedAt || properties.deleted_at || ''),
    badge: Number(record?.badge || properties.unreadCount || 0),
    notificationMutedUntil: normalizeMuteUntil(record?.notificationMutedUntil ?? record?.notification_muted_until),
    pinned: Boolean(record?.pinned ?? record?.isPinned ?? record?.is_pinned ?? properties.pinned),
    conversationNicknames: record?.conversationNicknames || record?.conversation_nicknames || properties.conversationNicknames || properties.conversation_nicknames || {},
    groupSettings: isGroup
      ? normalizeGroupSettings(record?.groupSettings || record?.group_settings || properties.groupSettings || properties.group_settings)
      : undefined,
    conversationBackground: record?.conversationBackground ?? record?.conversation_background ?? properties.conversationBackground ?? properties.conversation_background,
  };
}

export const chatManagementService = {
  async listUsers(search = '', signal?: AbortSignal): Promise<User[]> {
    const params: Record<string, string> = {};
    if (search.trim()) params.q = search.trim();
    const records = await listAllPages('/api/v1/chat/users', params, CHAT_LIST_TIMEOUT_MS, signal);
    return records.map(record => normalizeUser(record)).filter(user => user.active);
  },

  async listConversations(signal?: AbortSignal): Promise<Conversation[]> {
    const records = await listAllPages('/api/v1/conversation', {}, CHAT_LIST_TIMEOUT_MS, signal);
    return dedupeConversations(records.map(normalizeConversation));
  },

  async createConversation(input: {
    subject: string;
    isGroup?: boolean;
    participantIds: string[];
    properties?: Record<string, unknown>;
    idempotencyKey?: string;
  }) {
    const participantIds = [...new Set(input.participantIds.map(value => String(value || '').trim()).filter(Boolean))];
    if (participantIds.some(isTinodeUid)) {
      throw new Error('Group contract requires Account IDs, not Tinode UIDs.');
    }
    const payload = await apiRequest('/api/v1/conversation', {
      method: 'POST',
      headers: input.idempotencyKey ? { 'X-Vichat-Request-Id': input.idempotencyKey } : undefined,
      body: JSON.stringify({
        subject: input.subject,
        is_group: Boolean(input.isGroup),
        participant_ids: participantIds,
        client_request_id: input.idempotencyKey || undefined,
        properties: {
          ...(input.properties || {}),
          ...(input.idempotencyKey ? { mobile_request_id: input.idempotencyKey } : {}),
        },
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

  async addConversationParticipants(conversationId: string, participantIds: string[] = []) {
    const accountIds = [...new Set(participantIds.map(value => String(value || '').trim()).filter(Boolean))];
    if (!accountIds.length || accountIds.some(isTinodeUid)) {
      throw new Error('Group member actions require valid Account IDs.');
    }
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/participants`, {
      method: 'POST',
      body: JSON.stringify({ participant_ids: accountIds }),
    });
    return normalizeConversation(payload);
  },

  async updateConversationParticipantApproval(conversationId: string, participantId: string, approved: boolean) {
    if (!participantId || isTinodeUid(participantId)) throw new Error('Member approval requires an Account ID.');
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(participantId)}/approval`, {
      method: 'PUT',
      body: JSON.stringify({ approved: Boolean(approved) }),
    });
    return normalizeConversation(payload);
  },

  async updateConversationParticipantRole(conversationId: string, participantId: string, role: 'ADMIN' | 'MEMBER') {
    if (!participantId || isTinodeUid(participantId)) throw new Error('Role actions require an Account ID.');
    const normalizedRole = String(role || '').toUpperCase();
    if (!['ADMIN', 'MEMBER'].includes(normalizedRole)) throw new Error('Vai trò nhóm không hợp lệ.');
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(participantId)}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role: normalizedRole }),
    });
    return normalizeConversation(payload);
  },

  async updateConversationPin(conversationId: string, pinned: boolean) {
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ pinned: Boolean(pinned) }),
    });
    return normalizeConversation(payload);
  },

  async updateConversationNickname(conversationId: string, targetId: string, nickname: string) {
    const payload = await apiRequest(`/api/v1/chat/threads/${encodeURIComponent(conversationId)}/nicknames/${encodeURIComponent(targetId)}`, {
      method: 'PUT',
      body: JSON.stringify({ nickname: String(nickname || '').trim() }),
    });
    return normalizeConversation(payload);
  },

  async updateGroupSettings(conversationId: string, input: { name?: string; settings?: unknown; background?: unknown } = {}) {
    const body: Record<string, unknown> = {};
    if (input.name !== undefined) body.name = String(input.name || '').trim();
    if (input.settings !== undefined) body.settings = normalizeGroupSettings(input.settings);
    if (input.background !== undefined) body.background = input.background;
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/group-settings`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return normalizeConversation(payload);
  },

  async updateGroupProfile(conversationId: string, profile: { name?: string; avatar?: string } = {}) {
    const body: Record<string, unknown> = {};
    if (profile.name !== undefined) body.name = String(profile.name || '').trim();
    if (profile.avatar !== undefined) body.avatar = String(profile.avatar || '').trim();
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/group-settings`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return normalizeConversation(payload);
  },

  async dissolveGroup(conversationId: string) {
    return apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/dissolve`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async searchConversationHistory(conversationId: string, query: string) {
    const request = async (tinodeToken: string) => {
      const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/search`, {
        method: 'POST',
        body: JSON.stringify({
          query: String(query || '').trim(),
          type: 'all',
          limit: 100,
          tinode_token: tinodeToken,
        }),
      });
      return responseItems(payload);
    };

    const firstAuth = await authService.refreshTinodeToken();
    try {
      return await request(firstAuth.token);
    } catch (error: any) {
      if (!['TINODE_SEARCH_AUTH_FAILED', 'TINODE_TOKEN_REQUIRED'].includes(String(error?.code || ''))) throw error;
      const refreshedAuth = await authService.refreshTinodeToken();
      return request(refreshedAuth.token);
    }
  },

  async removeConversationParticipant(conversationId: string, participantId: string, tinodeToken = '', replacementId = '') {
    if (!participantId || isTinodeUid(participantId)) throw new Error('Member removal requires an Account ID.');
    if (replacementId && isTinodeUid(replacementId)) throw new Error('Owner replacement requires an Account ID.');
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
