import { create } from 'zustand';
import { authService } from '../services/authService';
import { chatManagementService } from '../services/chatManagementService';
import { tinodeClient, TinodeEvent } from '../services/tinodeClient';
import { routeMobileCallEvent } from './callStore';
import { workspaceService } from '../services/workspaceService';
import { Conversation, ChatMessage, ConnectionState, LinkedDevice, PickerFile, RecallMode, Session, User, WorkspaceItem } from '../types';
import { storageService } from '../services/storageService';
import { notifyIncomingCall, notifyIncomingMessage, resetPushNotificationRegistration } from '../services/notificationService';
import { applyPresenceToConversation } from '../utils/tinodeState';
import { retainAvailableConversations } from '../utils/conversationSync';
import { canKeepTinodeAvatarAfterProfileRejection } from '../utils/avatarPolicy';
import { useCallStore } from './callStore';

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
  createGroupConversation: (subject: string, participantIds: string[], avatarFile?: PickerFile | null) => Promise<Conversation>;
  sendText: (conversationId: string, text: string, replyTo?: ChatMessage['replyTo']) => Promise<void>;
  sendFile: (conversationId: string, file: any) => Promise<void>;
  sendReaction: (conversationId: string, message: ChatMessage, emoji: string) => Promise<void>;
  recallMessage: (conversationId: string, message: ChatMessage, mode?: RecallMode) => Promise<void>;
  sendTyping: (conversationId: string) => Promise<void>;
  markRead: (conversationId: string) => Promise<void>;
  muteConversation: (conversationId: string, until: number | null) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  applyWorkspaceAction: (itemId: string, action: string) => Promise<void>;
  updateProfile: (profile: Partial<User>) => Promise<void>;
  updateAvatar: (file: { uri: string; name: string; type: string }) => Promise<User>;
  updateLinkedDevices: (devices: LinkedDevice[]) => void;
  setActiveConversation: (conversationId: string) => void;
  clearError: () => void;
}

let tinodeUnsubscribe: (() => void) | null = null;
let bootstrapRequest: Promise<void> | null = null;
let reconnectRequest: Promise<void> | null = null;
const deletedConversationIds = new Set<string>();

function mergeConversation(previous: Conversation[], incoming: Conversation) {
  const index = previous.findIndex(item => item.id === incoming.id || (incoming.tinodeTopic && item.tinodeTopic === incoming.tinodeTopic));
  if (index < 0) return [incoming, ...previous];
  const next = [...previous];
  next[index] = {
    ...next[index],
    ...incoming,
    id: incoming.managementId === incoming.tinodeTopic ? next[index].id : incoming.id,
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
      id: 'vichat-ai', managementId: 'vichat-ai', tinodeTopic: String(chatbot.tinodeUid || chatbot.uid),
      name: chatbot.name || 'ViChat AI', isGroup: false, isChatbot: true, avatarUrl: chatbot.avatar || '',
      messages: [], badge: 0, members: [], participantIds: [], membersCount: 'Tra cứu tri thức · Có nguồn kiểm chứng',
      description: 'Trợ lý AI dùng dữ liệu doanh nghiệp đã được phê duyệt.',
    } as Conversation]
    : prepared;
  const hydratedDirectory = directory.map(user => ({
    ...user,
    online: tinodeClient.getPresenceStatus(user.uid || user.id, user.online === true),
  }));
  set({ conversations: withBot, directory: hydratedDirectory, workspaceItems: workspace.items, workspaceSummary: workspace.summary });
  if (get().session?.tinodeAuth?.token) {
    const availableTopics = await tinodeClient.syncTopics(withBot.map(item => item.tinodeTopic).filter(Boolean));
    set((current: AppStore) => ({
      conversations: retainAvailableConversations(current.conversations, availableTopics),
    }));
  }
}

async function bootstrapAuthenticated(set: any, get: () => AppStore) {
  deletedConversationIds.clear();
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
        const eventConversation = event.conversation;
        if (deletedConversationIds.has(String(eventConversation.id)) || deletedConversationIds.has(String(eventConversation.tinodeTopic))) return;
        set({ conversations: mergeConversation(current.conversations, event.conversation) });
      } else if (event.type === 'profile') {
        const matches = (value: User) => value.id === event.uid || value.uid === event.uid;
        const patch = { ...(event.name ? { name: event.name } : {}), ...(event.avatar ? { avatar: event.avatar } : {}) };
        const session = current.session && matches(current.session.user)
          ? { ...current.session, user: { ...current.session.user, ...patch } }
          : current.session;
        const directory = current.directory.map(user => matches(user) ? { ...user, ...patch } : user);
        const conversations = current.conversations.map(conversation => ({
          ...conversation,
          avatarUrl: !conversation.isGroup && conversation.members?.some(matches) ? (event.avatar || conversation.avatarUrl) : conversation.avatarUrl,
          name: !conversation.isGroup && conversation.members?.some(matches) && event.name ? event.name : conversation.name,
          members: conversation.members?.map(member => matches(member) ? { ...member, ...patch } : member),
          messages: conversation.messages.map(message => matches({ id: message.senderId, uid: message.senderId } as User)
            ? { ...message, ...patch, senderName: event.name || message.senderName }
            : message),
        }));
        set({ session, directory, conversations });
      } else if (event.type === 'incoming-message') {
        const notificationConversation = conversationForId(current.conversations, event.conversation.tinodeTopic) || event.conversation;
        void notifyIncomingMessage(notificationConversation, event.message);
      } else if (event.type === 'typing') {
        set({ typingByTopic: { ...current.typingByTopic, [event.topic]: event.active ? event.uid : '' } });
        setTimeout(() => set((latest: AppStore) => ({ typingByTopic: { ...latest.typingByTopic, [event.topic]: '' } })), 1800);
      } else if (event.type === 'presence') {
        set({
          directory: current.directory.map(user => user.uid === event.uid || user.id === event.uid ? { ...user, online: event.online } : user),
          conversations: current.conversations.map(conversation => applyPresenceToConversation(conversation, event.uid, event.online)),
        });
      } else if (event.type === 'call-invite' || event.type === 'call-signal') {
        const conversation = conversationForId(current.conversations, event.topic);
        const peer = conversation?.members?.find(member => member.uid === event.from || member.id === event.from);
        const callPeer = {
          name: peer?.name || conversation?.name,
          avatar: peer?.avatar || conversation?.avatarUrl,
        };
        routeMobileCallEvent(event, callPeer);
        if (event.type === 'call-invite') void notifyIncomingCall(event, callPeer);
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
    useCallStore.getState().hangUp();
    await tinodeClient.disconnect();
    resetPushNotificationRegistration();
    tinodeUnsubscribe?.();
    tinodeUnsubscribe = null;
    await authService.logout();
    deletedConversationIds.clear();
    set({ status: 'signed_out', session: null, conversations: [], directory: [], workspaceItems: [], connection: 'offline', error: '' });
  },

  async reconnect() {
    if (get().status !== 'ready') return;
    if (reconnectRequest) return reconnectRequest;
    reconnectRequest = (async () => {
      const sessionUserId = get().session?.user.id;
      const availableTopics = await tinodeClient.reconnect();
      if (get().status !== 'ready' || get().session?.user.id !== sessionUserId) return;
      set({ conversations: retainAvailableConversations(get().conversations, availableTopics) });
      if (!get().conversations.length || !get().directory.length) await get().refreshData();
    })().finally(() => { reconnectRequest = null; });
    return reconnectRequest;
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

  async createGroupConversation(subject, participantIds, avatarFile) {
    const created = await chatManagementService.createConversation({ subject, isGroup: true, participantIds });
    let topicName = '';
    try {
      const prepared = await chatManagementService.prepareTinodeConversation(created.managementId);
      const currentUid = tinodeClient.currentUserId;
      const memberIds = [...new Set((prepared.members || [])
        .map(member => String(member.uid || (member as any).tinodeUid || (member as any).tinode_uid || ''))
        .filter(uid => uid && uid !== currentUid))];
      if (memberIds.length !== participantIds.length) throw new Error('Chatmgt chưa chuẩn bị đủ thành viên Tinode cho nhóm.');
      const realtimeGroup = await tinodeClient.createGroup({ name: subject, memberIds, avatarFile: avatarFile || null });
      topicName = realtimeGroup.tinodeTopic || realtimeGroup.id;
      const bound = await chatManagementService.bindTinodeTopic(
        created.managementId,
        topicName,
        tinodeClient.getAuthTokenValue(),
        realtimeGroup.avatarUrl || '',
      );
      const ready = {
        ...created,
        ...realtimeGroup,
        ...bound,
        id: created.id,
        managementId: created.managementId,
        tinodeTopic: topicName,
        avatarUrl: realtimeGroup.avatarUrl || bound.avatarUrl || created.avatarUrl || '',
      };
      set({ conversations: mergeConversation(get().conversations, ready) });
      await get().openConversation(created.id);
      return ready;
    } catch (error) {
      if (topicName) await tinodeClient.discardGroupTopic(topicName).catch(() => {});
      throw error;
    }
  },

  async sendText(conversationId, text, replyTo) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.tinodeTopic) throw new Error('Cuộc trò chuyện chưa sẵn sàng realtime.');
    const clientId = `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pending: ChatMessage = { id: clientId, type: 'text', sender: 'outgoing', senderId: tinodeClient.currentUserId, senderName: 'Bạn', text, replyTo, createdAt: new Date().toISOString(), pending: true, deliveryStatus: 'sending' };
    set({ conversations: mergeConversation(get().conversations, { ...conversation, messages: [...conversation.messages, pending], lastMsg: text, updatedAt: pending.createdAt }) });
    try {
      await tinodeClient.sendText(conversation.tinodeTopic, text, clientId, replyTo);
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

  async recallMessage(conversationId, message, mode = 'all') {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.tinodeTopic) return;
    await tinodeClient.recallMessage(conversation.tinodeTopic, message, mode);
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
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation) return;
    const updated = await chatManagementService.updateConversationNotifications(
      conversation.managementId || conversation.id,
      until,
    );
    set({ conversations: mergeConversation(get().conversations, updated) });
  },

  async deleteConversation(conversationId) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation) return;
    const deletedKeys = [conversation.id, conversation.managementId, conversation.tinodeTopic].filter(Boolean).map(String);
    deletedKeys.forEach(key => deletedConversationIds.add(key));
    try {
      // The backend validates this Tinode token against the current session.
      // Refresh it first so a long-lived mobile session cannot fail deletion.
      const tinodeAuth = await authService.refreshTinodeToken();
      set((current: AppStore) => current.session ? ({
        session: { ...current.session, tinodeAuth },
      }) : ({}));
      await chatManagementService.deleteConversationForCurrentUser(conversation.managementId || conversation.id, tinodeAuth.token);
      if (conversation.tinodeTopic) tinodeClient.disallowConversationTopic(conversation.tinodeTopic);
      set({
        conversations: get().conversations.filter(item => item.id !== conversation.id),
        activeConversationId: get().activeConversationId === conversation.id ? '' : get().activeConversationId,
      });
      setTimeout(() => deletedKeys.forEach(key => deletedConversationIds.delete(key)), 5000);
    } catch (error) {
      deletedKeys.forEach(key => deletedConversationIds.delete(key));
      throw error;
    }
  },

  async applyWorkspaceAction(itemId, action) {
    const updated = await workspaceService.applyAction(itemId, action);
    set({ workspaceItems: get().workspaceItems.map(item => item.id === itemId ? updated : item) });
  },

  async updateProfile(profile) {
    const user = await authService.updateProfile(profile);
    if (user.name && tinodeClient.connected) {
      await tinodeClient.updateCurrentProfile({ name: user.name });
    }
    const currentUser = get().session?.user;
    const matchesCurrent = (value: User) => value.id === currentUser?.id || value.uid === currentUser?.uid;
    const updatedUser = { ...currentUser, ...user } as User;
    const session = get().session ? { ...get().session!, user: updatedUser } : null;
    const directory = get().directory.map(item => matchesCurrent(item) ? { ...item, ...user } : item);
    const conversations = get().conversations.map(item => ({
      ...item,
      name: !item.isGroup && item.members?.some(matchesCurrent) && user.name ? user.name : item.name,
      members: item.members?.map(member => matchesCurrent(member) ? { ...member, ...user } : member),
      messages: item.messages.map(message => matchesCurrent({ id: message.senderId, uid: message.senderId } as User)
        ? { ...message, avatar: user.avatar || message.avatar, senderName: user.name || message.senderName }
        : message),
    }));
    set({ session, directory, conversations });
    await storageService.savePublicSession(session);
  },

  async updateAvatar(file) {
    let user: User;
    try {
      user = await authService.updateAvatar(file);
    } catch (error: any) {
      if (error?.status !== 403 || error?.code !== 'ACCOUNT_AVATAR_UNSUPPORTED' || !tinodeClient.connected) throw error;
      const current = get().session?.user;
      const profile = await tinodeClient.updateCurrentProfile({ name: current?.name, avatarFile: file as PickerFile });
      try {
        user = await authService.updateProfile({ avatar: profile.avatar });
      } catch (profileError: any) {
        if (!canKeepTinodeAvatarAfterProfileRejection(profileError) || !current) throw profileError;
        user = { ...current, avatar: profile.avatar };
      }
    }
    if (user.avatar && tinodeClient.connected) {
      await tinodeClient.updateCurrentProfile({ name: user.name, avatarUrl: user.avatar });
    }
    const currentUser = get().session?.user;
    const matchesCurrent = (value: User) => value.id === currentUser?.id || value.uid === currentUser?.uid;
    const avatar = user.avatar || currentUser?.avatar || '';
    const updatedUser = { ...currentUser, ...user, avatar } as User;
    const session = get().session ? { ...get().session!, user: updatedUser } : null;
    const directory = get().directory.map(item => matchesCurrent(item) ? { ...item, ...user, avatar } : item);
    const conversations = get().conversations.map(item => ({
      ...item,
      avatarUrl: !item.isGroup && item.members?.some(matchesCurrent) ? (avatar || item.avatarUrl) : item.avatarUrl,
      members: item.members?.map(member => matchesCurrent(member) ? { ...member, ...user, avatar } : member),
      messages: item.messages.map(message => matchesCurrent({ id: message.senderId, uid: message.senderId } as User)
        ? { ...message, avatar: avatar || message.avatar, senderName: user.name || message.senderName }
        : message),
    }));
    set({ session, directory, conversations });
    await storageService.savePublicSession(session);
    return updatedUser;
  },

  updateLinkedDevices(devices) {
    const session = get().session ? { ...get().session!, linkedDevices: devices } : null;
    set({ session });
    void storageService.savePublicSession(session);
  },

  setActiveConversation(conversationId) { set({ activeConversationId: conversationId }); },
  clearError() { set({ error: '' }); },
}));

export function getConversation(conversations: Conversation[], id: string) {
  return conversationForId(conversations, id);
}
