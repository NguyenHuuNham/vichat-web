import { create } from 'zustand';
import { authService } from '../services/authService';
import { chatManagementService } from '../services/chatManagementService';
import { tinodeClient, TinodeEvent } from '../services/tinodeClient';
import { workspaceService } from '../services/workspaceService';
import { Conversation, ChatMessage, ConnectionState, Session, User, WorkspaceItem } from '../types';
import { storageService } from '../services/storageService';

interface AppStore {
  status: 'booting' | 'signed_out' | 'loading' | 'ready' | 'error';
  error: string;
  session: Session | null;
  connection: ConnectionState;
  conversations: Conversation[];
  directory: User[];
  workspaceItems: WorkspaceItem[];
  workspaceSummary: any;
  typingByTopic: Record<string, string>;
  activeConversationId: string;
  boot: () => Promise<void>;
  login: (identity: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reconnect: () => Promise<void>;
  refreshData: () => Promise<void>;
  openConversation: (conversationId: string) => Promise<Conversation | null>;
  createDirectConversation: (user: User) => Promise<Conversation>;
  createGroupConversation: (subject: string, participantIds: string[]) => Promise<Conversation>;
  sendText: (conversationId: string, text: string) => Promise<void>;
  sendFile: (conversationId: string, file: any) => Promise<void>;
  sendReaction: (conversationId: string, message: ChatMessage, emoji: string) => Promise<void>;
  recallMessage: (conversationId: string, message: ChatMessage) => Promise<void>;
  sendTyping: (conversationId: string) => Promise<void>;
  markRead: (conversationId: string) => Promise<void>;
  muteConversation: (conversationId: string, until: number | null) => Promise<void>;
  applyWorkspaceAction: (itemId: string, action: string) => Promise<void>;
  updateProfile: (profile: Partial<User>) => Promise<void>;
  updateAvatar: (file: { uri: string; name: string; type: string }) => Promise<void>;
  setActiveConversation: (conversationId: string) => void;
  clearError: () => void;
}

let tinodeUnsubscribe: (() => void) | null = null;
let bootstrapRequest: Promise<void> | null = null;

function mergeConversation(previous: Conversation[], incoming: Conversation) {
  const index = previous.findIndex(item => item.id === incoming.id || (incoming.tinodeTopic && item.tinodeTopic === incoming.tinodeTopic));
  if (index < 0) return [incoming, ...previous];
  const next = [...previous];
  next[index] = {
    ...next[index],
    ...incoming,
    messages: incoming.messages.length ? incoming.messages : next[index].messages,
    name: incoming.name || next[index].name,
    avatarUrl: incoming.avatarUrl || next[index].avatarUrl,
    managementId: incoming.managementId !== incoming.tinodeTopic ? incoming.managementId : next[index].managementId,
  };
  return next.sort((a, b) => (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0));
}

function conversationForId(conversations: Conversation[], id: string) {
  return conversations.find(item => item.id === id || item.tinodeTopic === id) || null;
}

async function loadRemoteData(set: any, get: () => AppStore) {
  const [conversations, directory, workspace] = await Promise.all([
    chatManagementService.listConversations(),
    chatManagementService.listUsers(),
    workspaceService.listItems().catch(() => ({ items: [], summary: null })),
  ]);
  const prepared = await Promise.all(conversations.map(async conversation => {
    if (conversation.tinodeTopic || !conversation.managementId) return conversation;
    try { return await chatManagementService.prepareTinodeConversation(conversation.managementId); } catch { return conversation; }
  }));
  const chatbot = await chatManagementService.listBotConfig();
  const withBot = chatbot.enabled && (chatbot.tinodeUid || chatbot.uid)
    ? [...prepared, {
      id: 'bot-songhong', managementId: 'bot-songhong', tinodeTopic: String(chatbot.tinodeUid || chatbot.uid),
      name: chatbot.name || 'Trợ lý AI', isGroup: false, isChatbot: true, avatarUrl: chatbot.avatar || '',
      messages: [], badge: 0, members: [], participantIds: [], membersCount: 'Trợ lý nội bộ',
    } as Conversation]
    : prepared;
  set({ conversations: withBot, directory, workspaceItems: workspace.items, workspaceSummary: workspace.summary });
  if (get().session?.tinodeAuth?.token) {
    await tinodeClient.syncTopics(withBot.map(item => item.tinodeTopic).filter(Boolean));
  }
}

async function bootstrapAuthenticated(set: any, get: () => AppStore) {
  const session = await authService.currentSession();
  set({ session, status: 'loading', error: '' });
  try {
    const tinodeAuth = await authService.refreshTinodeToken();
    const updatedSession = { ...session, tinodeAuth };
    set({ session: updatedSession });
    await storageService.savePublicSession(updatedSession);
    tinodeClient.setTokenProvider(() => authService.refreshTinodeToken());
    tinodeUnsubscribe?.();
    tinodeUnsubscribe = tinodeClient.onEvent((event: TinodeEvent) => {
      const current = get();
      if (event.type === 'connection') {
        const state: ConnectionState = event.state === 'connected'
          ? 'connected'
          : event.state === 'connecting'
            ? 'connecting'
            : event.state === 'reconnecting'
              ? 'reconnecting'
              : event.state === 'error' ? 'error' : 'offline';
        set({ connection: state });
      } else if (event.type === 'conversation') {
        set({ conversations: mergeConversation(current.conversations, event.conversation) });
      } else if (event.type === 'typing') {
        set({ typingByTopic: { ...current.typingByTopic, [event.topic]: event.active ? event.uid : '' } });
        setTimeout(() => set((latest: AppStore) => ({ typingByTopic: { ...latest.typingByTopic, [event.topic]: '' } })), 1800);
      } else if (event.type === 'presence') {
        set({ directory: current.directory.map(user => user.uid === event.uid || user.id === event.uid ? { ...user, online: event.online } : user) });
      }
    });
    await tinodeClient.connect(tinodeAuth, () => authService.refreshTinodeToken());
  } catch (error) {
    // Metadata remains usable while Tinode is temporarily unavailable.
    set({ connection: 'error', error: error instanceof Error ? error.message : 'Tinode đang tạm thời không kết nối.' });
  }
  try {
    await loadRemoteData(set, get);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không tải được dữ liệu Chatmgt.';
    set({ error: message });
  }
  set({ status: 'ready' });
}

export const useAppStore = create<AppStore>((set, get) => ({
  status: 'booting',
  error: '',
  session: null,
  connection: 'offline',
  conversations: [],
  directory: [],
  workspaceItems: [],
  workspaceSummary: null,
  typingByTopic: {},
  activeConversationId: '',

  async boot() {
    if (get().status !== 'booting') return;
    try {
      const token = await authService.restoreToken();
      if (!token) {
        set({ status: 'signed_out' });
        return;
      }
      await bootstrapAuthenticated(set, get);
    } catch {
      await storageService.clear();
      set({ status: 'signed_out', session: null });
    }
  },

  async login(identity, password) {
    set({ status: 'loading', error: '' });
    try {
      const session = await authService.login(identity, password);
      set({ session, status: 'loading', error: '' });
      await bootstrapAuthenticated(set, get);
    } catch (error) {
      set({ status: 'signed_out', error: error instanceof Error ? error.message : 'Đăng nhập thất bại.' });
      throw error;
    }
  },

  async logout() {
    await tinodeClient.disconnect();
    tinodeUnsubscribe?.();
    tinodeUnsubscribe = null;
    await authService.logout();
    set({ status: 'signed_out', session: null, conversations: [], directory: [], workspaceItems: [], connection: 'offline', error: '' });
  },

  async reconnect() {
    if (get().status !== 'ready') return;
    await tinodeClient.reconnect();
    if (!get().conversations.length || !get().directory.length) await get().refreshData();
  },

  async refreshData() {
    if (bootstrapRequest) return bootstrapRequest;
    bootstrapRequest = loadRemoteData(set, get).finally(() => { bootstrapRequest = null; });
    return bootstrapRequest;
  },

  async openConversation(conversationId) {
    let conversation = conversationForId(get().conversations, conversationId);
    if (!conversation) return null;
    if (!conversation.tinodeTopic && conversation.managementId) {
      try {
        const prepared = await chatManagementService.prepareTinodeConversation(conversation.managementId);
        conversation = prepared;
        set({ conversations: mergeConversation(get().conversations, prepared) });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Không chuẩn bị được cuộc trò chuyện.' });
        return conversation;
      }
    }
    if (conversation.tinodeTopic && tinodeClient.connected) {
      try {
        const loaded = await tinodeClient.openConversation(conversation.tinodeTopic);
        set({ conversations: mergeConversation(get().conversations, { ...conversation, ...loaded, id: conversation.id, managementId: conversation.managementId, isChatbot: conversation.isChatbot }) });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Không mở được cuộc trò chuyện.' });
      }
    }
    set({ activeConversationId: conversation.id });
    return conversationForId(get().conversations, conversation.id) || conversation;
  },

  async createDirectConversation(user) {
    const existing = get().conversations.find(item => !item.isGroup && item.participantIds?.includes(user.id));
    if (existing) return existing;
    const created = await chatManagementService.createConversation({ subject: user.name, participantIds: [user.id] });
    set({ conversations: mergeConversation(get().conversations, created) });
    await get().openConversation(created.id);
    return created;
  },

  async createGroupConversation(subject, participantIds) {
    const created = await chatManagementService.createConversation({ subject, isGroup: true, participantIds });
    set({ conversations: mergeConversation(get().conversations, created) });
    return created;
  },

  async sendText(conversationId, text) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.tinodeTopic) throw new Error('Cuộc trò chuyện chưa sẵn sàng realtime.');
    const clientId = `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pending: ChatMessage = { id: clientId, type: 'text', sender: 'outgoing', senderId: tinodeClient.currentUserId, senderName: 'Bạn', text, createdAt: new Date().toISOString(), pending: true, deliveryStatus: 'sending' };
    set({ conversations: mergeConversation(get().conversations, { ...conversation, messages: [...conversation.messages, pending], lastMsg: text, updatedAt: pending.createdAt }) });
    try {
      await tinodeClient.sendText(conversation.tinodeTopic, text, clientId);
      await get().openConversation(conversationId);
    } catch (error) {
      set({ conversations: get().conversations.map(item => item.id === conversationId ? { ...item, messages: item.messages.map(message => message.id === clientId ? { ...message, pending: false, failed: true, deliveryStatus: 'failed' } : message) } : item) });
      throw error;
    }
  },

  async sendFile(conversationId, file) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.tinodeTopic) throw new Error('Cuộc trò chuyện chưa sẵn sàng realtime.');
    const clientId = `mobile-file-${Date.now()}`;
    await tinodeClient.sendFile(conversation.tinodeTopic, file, clientId);
    await get().openConversation(conversationId);
  },

  async sendReaction(conversationId, message, emoji) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.tinodeTopic) return;
    await tinodeClient.sendReaction(conversation.tinodeTopic, message, emoji);
    await get().openConversation(conversationId);
  },

  async recallMessage(conversationId, message) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.tinodeTopic) return;
    await tinodeClient.recallMessage(conversation.tinodeTopic, message);
    await get().openConversation(conversationId);
  },

  async sendTyping(conversationId) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (conversation?.tinodeTopic && tinodeClient.connected) await tinodeClient.sendTyping(conversation.tinodeTopic);
  },

  async markRead(conversationId) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (conversation?.tinodeTopic && tinodeClient.connected) {
      await tinodeClient.markRead(conversation.tinodeTopic);
      set({ conversations: get().conversations.map(item => item.id === conversationId ? { ...item, badge: 0 } : item) });
    }
  },

  async muteConversation(conversationId, until) {
    const updated = await chatManagementService.updateConversationNotifications(conversationId, until);
    set({ conversations: mergeConversation(get().conversations, updated) });
  },

  async applyWorkspaceAction(itemId, action) {
    const updated = await workspaceService.applyAction(itemId, action);
    set({ workspaceItems: get().workspaceItems.map(item => item.id === itemId ? updated : item) });
  },

  async updateProfile(profile) {
    const user = await authService.updateProfile(profile);
    const session = get().session ? { ...get().session!, user: { ...get().session!.user, ...user } } : null;
    set({ session });
    await storageService.savePublicSession(session);
  },

  async updateAvatar(file) {
    const user = await authService.updateAvatar(file);
    const session = get().session ? { ...get().session!, user: { ...get().session!.user, ...user } } : null;
    set({ session });
    await storageService.savePublicSession(session);
  },

  setActiveConversation(conversationId) { set({ activeConversationId: conversationId }); },
  clearError() { set({ error: '' }); },
}));

export function getConversation(conversations: Conversation[], id: string) {
  return conversationForId(conversations, id);
}
