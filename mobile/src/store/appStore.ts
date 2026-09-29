import { create } from 'zustand';
import { authService } from '../services/authService';
import { chatManagementService } from '../services/chatManagementService';
import { cancelPendingRequests } from '../services/apiClient';
import { tinodeClient, TinodeEvent } from '../services/tinodeClient';
import { routeMobileCallEvent } from './callStore';
import { workspaceService } from '../services/workspaceService';
import { Conversation, ChatMessage, ConnectionState, GroupSettings, LinkedDevice, PickerFile, Poll, RecallMode, Session, Sticker, User, WorkspaceItem } from '../types';
import { storageService } from '../services/storageService';
import { notifyIncomingCall, notifyIncomingMessage, resetPushNotificationRegistration } from '../services/notificationService';
import { applyPresenceToConversation } from '../utils/tinodeState';
import { dedupeConversations, isDirectConversationForUser, isTinodeConversationSnapshot, mergeConversation as mergeConversationSnapshot, mergeConversationIntoList } from '../utils/conversationSync';
import { canKeepTinodeAvatarAfterProfileRejection } from '../utils/avatarPolicy';
import { useCallStore } from './callStore';
import { canonicalAccountIds, identitiesOverlap, normalizeParticipant, tinodeUidForMember } from '../utils/identity';
import { groupSettingEnabled, memberIsAdmin } from '../utils/groupSettings';

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
  switchTenant: (tenantId: string) => Promise<void>;
  logout: () => Promise<void>;
  reconnect: () => Promise<void>;
  refreshData: () => Promise<void>;
  openConversation: (conversationId: string) => Promise<Conversation | null>;
  loadEarlier: (conversationId: string, limit?: number) => Promise<boolean>;
  createDirectConversation: (user: User) => Promise<Conversation>;
  createGroupConversation: (subject: string, participantIds: string[], avatarFile?: PickerFile | null, idempotencyKey?: string) => Promise<Conversation>;
  addGroupMembers: (conversationId: string, participantIds: string[]) => Promise<Conversation>;
  approveGroupMember: (conversationId: string, participantId: string, approved: boolean) => Promise<Conversation>;
  setGroupMemberRole: (conversationId: string, participantId: string, role: 'ADMIN' | 'MEMBER') => Promise<Conversation>;
  removeGroupMember: (conversationId: string, participantId: string) => Promise<Conversation>;
  renameGroup: (conversationId: string, name: string) => Promise<Conversation>;
  updateGroupAvatar: (conversationId: string, file: PickerFile) => Promise<Conversation>;
  updateGroupSettings: (conversationId: string, settings: GroupSettings) => Promise<Conversation>;
  updateConversationPin: (conversationId: string, pinned: boolean) => Promise<Conversation>;
  dissolveGroup: (conversationId: string) => Promise<void>;
  searchConversationHistory: (conversationId: string, query: string) => Promise<any[]>;
  createPoll: (conversationId: string, poll: Pick<Poll, 'question' | 'options' | 'settings'>) => Promise<void>;
  votePoll: (conversationId: string, pollId: string, optionIds: string[]) => Promise<void>;
  addPollOption: (conversationId: string, pollId: string, optionId: string, optionText: string) => Promise<void>;
  lockPoll: (conversationId: string, pollId: string) => Promise<void>;
  toggleMessagePin: (conversationId: string, message: ChatMessage) => Promise<void>;
  sendText: (conversationId: string, text: string, replyTo?: ChatMessage['replyTo'], mentions?: any[]) => Promise<void>;
  sendFile: (conversationId: string, file: any) => Promise<void>;
  sendSticker: (conversationId: string, sticker: Sticker) => Promise<void>;
  sendReaction: (conversationId: string, message: ChatMessage, emoji: string) => Promise<void>;
  editMessage: (conversationId: string, message: ChatMessage, text: string) => Promise<void>;
  recallMessage: (conversationId: string, message: ChatMessage, mode?: RecallMode) => Promise<void>;
  sendTyping: (conversationId: string) => Promise<void>;
  markRead: (conversationId: string) => Promise<void>;
  muteConversation: (conversationId: string, until: number | null) => Promise<void>;
  deleteConversation: (conversationId: string, replacementId?: string) => Promise<void>;
  applyWorkspaceAction: (itemId: string, action: string) => Promise<void>;
  updateProfile: (profile: Partial<User>) => Promise<void>;
  updateAvatar: (file: { uri: string; name: string; type: string }) => Promise<User>;
  updateLinkedDevices: (devices: LinkedDevice[]) => void;
  setActiveConversation: (conversationId: string) => void;
  clearError: () => void;
}

let tinodeUnsubscribe: (() => void) | null = null;
let remoteDataRequest: { generation: number; promise: Promise<void> } | null = null;
let reconnectRequest: Promise<void> | null = null;
let realtimeSyncRequest: { generation: number; topicsKey: string; promise: Promise<void> } | null = null;
let nextSessionGeneration = 0;
const deletedConversationIds = new Set<string>();
const groupCreationRequests = new Map<string, Promise<Conversation>>();
const directCreationRequests = new Map<string, Promise<Conversation>>();

function mergeConversation(previous: Conversation[], incoming: Conversation) {
  const index = previous.findIndex(item => item.id === incoming.id
    || (incoming.managementId && item.managementId === incoming.managementId)
    || (incoming.tinodeTopic && item.tinodeTopic === incoming.tinodeTopic));
  if (index < 0) return mergeConversationIntoList(previous, incoming);
  const next = [...previous];
  const current = next[index];
  const incomingTinodeSnapshot = isTinodeConversationSnapshot(incoming);
  const incomingMembers = Array.isArray(incoming.members) ? incoming.members : [];
  const currentMembersByIdentity = new Map<string, NonNullable<Conversation['members']>[number]>();
  (current.members || []).forEach(member => {
    [member.id, member.uid, member.username].filter(Boolean).forEach(identity => currentMembersByIdentity.set(String(identity), member));
  });
  const mergedMembers = incomingMembers.length
    ? incomingMembers.map(member => {
      const existing = [member.id, member.uid, member.username]
        .filter(Boolean)
        .map(identity => currentMembersByIdentity.get(String(identity)))
        .find(Boolean);
      if (!existing) return member;
      const incomingName = String(member.name || '').trim();
      const genericName = !incomingName || ['member', 'thành viên', 'thÃ nh viÃªn'].includes(incomingName.toLowerCase());
      return {
        ...existing,
        ...member,
        id: existing.id || member.id,
        uid: member.uid || existing.uid,
        username: member.username || existing.username,
        name: genericName ? existing.name || member.name : member.name,
        avatar: member.avatar || existing.avatar,
        groupRole: member.groupRole || existing.groupRole,
        role: member.role || existing.role,
        mode: member.mode || existing.mode,
      };
    })
    : current.members;
  const membersForMessages = mergedMembers || [];
  // Tinode may emit a partial snapshot while an earlier page is arriving.
  // Keep the loaded range so FlashList cannot retain an offset past a shorter
  // replacement array and render a blank viewport.
  const mergedMessageSnapshot = mergeConversationSnapshot(current, incoming).messages;
  const enrichMessages = (messages: ChatMessage[]) => messages.map(message => {
    if (message.sender === 'outgoing') return message;
    const sender = membersForMessages.find(member => identitiesOverlap(member, { id: message.senderId, uid: message.senderId }));
    if (!sender) return message;
    return {
      ...message,
      senderName: message.senderName === 'Thành viên' || message.senderName === 'ThÃ nh viÃªn' ? sender.name : (message.senderName || sender.name),
      avatar: message.avatar || sender.avatar,
    };
  });
  next[index] = {
    ...current,
    ...incoming,
    id: incoming.managementId === incoming.tinodeTopic ? next[index].id : incoming.id,
    adminId: incoming.adminId || current.adminId,
    members: mergedMembers,
    pendingMembers: incoming.pendingMembers !== undefined ? incoming.pendingMembers : current.pendingMembers,
    participantIds: incoming.participantIds?.length ? incoming.participantIds : current.participantIds,
    messages: enrichMessages(mergedMessageSnapshot),
    name: incoming.name || current.name,
    avatarUrl: incoming.avatarUrl || current.avatarUrl,
    membersCount: incoming.membersCount || current.membersCount,
    // Tinode has no viewer-scoped mute field; retain Chatmgt's value until a
    // management snapshot explicitly changes it.
    notificationMutedUntil: incomingTinodeSnapshot
      ? current.notificationMutedUntil
      : incoming.notificationMutedUntil !== undefined
        ? incoming.notificationMutedUntil
        : current.notificationMutedUntil,
    pinned: incoming.pinned !== undefined ? incoming.pinned : current.pinned,
    // Tinode is not authoritative for group policy. Keep the last Chatmgt
    // snapshot when realtime metadata contains stale settings.
    groupSettings: incomingTinodeSnapshot
      ? current.groupSettings
      : incoming.groupSettings !== undefined ? incoming.groupSettings : current.groupSettings,
    conversationNicknames: incoming.conversationNicknames !== undefined ? incoming.conversationNicknames : current.conversationNicknames,
    conversationBackground: incomingTinodeSnapshot
      ? current.conversationBackground
      : incoming.conversationBackground !== undefined ? incoming.conversationBackground : current.conversationBackground,
    lastMsg: incoming.lastMsg || current.lastMsg,
    time: incoming.time || current.time,
    badge: incoming.messages.length || incoming.lastMsg || incoming.updatedAt ? incoming.badge : current.badge,
    readSeq: incoming.readSeq !== undefined ? incoming.readSeq : current.readSeq,
    updatedAt: incoming.updatedAt || current.updatedAt,
    managementId: incoming.managementId !== incoming.tinodeTopic ? incoming.managementId : current.managementId,
  };
  return mergeConversationIntoList(previous, next[index]);
}

function conversationForId(conversations: Conversation[], id: string) {
  return conversations.find(item => item.id === id || item.managementId === id || item.tinodeTopic === id) || null;
}

async function mergeManagedConversation(set: any, get: () => AppStore, conversationId: string, managed: Conversation) {
  const existing = conversationForId(get().conversations, conversationId) || managed;
  let next: Conversation = {
    ...existing,
    ...managed,
    id: existing.id || managed.id,
    managementId: managed.managementId || existing.managementId || existing.id,
    tinodeTopic: managed.tinodeTopic || existing.tinodeTopic,
    messages: existing.messages || [],
  };
  if (next.tinodeTopic && tinodeClient.connected) {
    try {
      const realtime = await tinodeClient.subscribeTopic(next.tinodeTopic, 0, { emitSnapshot: false });
      next = {
        ...(realtime || {}),
        ...next,
        id: existing.id,
        managementId: next.managementId,
        tinodeTopic: next.tinodeTopic,
        messages: realtime?.messages?.length ? realtime.messages : existing.messages,
      };
    } catch {
      // Chatmgt metadata remains usable while Tinode catches up.
    }
  }
  set({ conversations: mergeConversation(get().conversations, next) });
  return conversationForId(get().conversations, existing.id) || next;
}

async function syncRealtimeTopics(get: () => AppStore, reason = 'metadata'): Promise<void> {
  if (!tinodeClient.connected || !get().session) return;
  const generation = get().session?.generation || 0;
  const topics = get().conversations.map(item => item.tinodeTopic).filter(Boolean);
  const topicsKey = [...new Set(topics)].sort().join('|');
  if (realtimeSyncRequest?.generation === generation) {
    if (realtimeSyncRequest.topicsKey === topicsKey) return realtimeSyncRequest.promise;
    return realtimeSyncRequest.promise.then(() => syncRealtimeTopics(get, reason));
  }
  const promise = tinodeClient.syncTopics(topics, {
    generation,
    concurrency: 2,
    emitSnapshot: false,
    historyLimit: 0,
    newerOnly: true,
    notifyMissed: reason !== 'background-resume',
  }).then(() => {}).finally(() => {
    if (realtimeSyncRequest?.generation === generation && realtimeSyncRequest.promise === promise) realtimeSyncRequest = null;
  });
  realtimeSyncRequest = { generation, topicsKey, promise };
  return promise;
}

function botConversation(config: any): Conversation | null {
  if (!config?.enabled || !(config.tinodeUid || config.uid)) return null;
  return {
    id: 'vichat-ai',
    managementId: 'vichat-ai',
    tinodeTopic: String(config.tinodeUid || config.uid),
    name: config.name || 'ViChat AI',
    isGroup: false,
    isChatbot: true,
    avatarUrl: config.avatar || '',
    messages: [],
    badge: 0,
    members: [],
    participantIds: [],
    membersCount: 'Tra cứu tri thức · Có nguồn kiểm chứng',
    description: 'Trợ lý AI dùng dữ liệu doanh nghiệp đã được phê duyệt.',
  } as Conversation;
}

async function loadAuxiliaryData(set: any, get: () => AppStore, sessionUserId: string, generation: number) {
  const [workspaceResult, botResult] = await Promise.allSettled([
    workspaceService.listItems(),
    chatManagementService.listBotConfig(),
  ]);
  if (get().session?.user.id !== sessionUserId || get().session?.generation !== generation) return;
  if (workspaceResult.status === 'fulfilled') {
    set({ workspaceItems: workspaceResult.value.items, workspaceSummary: workspaceResult.value.summary });
  }
  if (botResult.status === 'fulfilled') {
    const withoutBot = get().conversations.filter(item => item.id !== 'vichat-ai');
    const bot = botConversation(botResult.value);
    const conversations = dedupeConversations(bot ? [...withoutBot, bot] : withoutBot);
    tinodeClient.setAllowedConversationTopics(conversations.map(item => item.tinodeTopic).filter(Boolean));
    set({ conversations });
    void syncRealtimeTopics(get, 'bot-config').catch(() => {});
  }
}

async function loadRemoteData(set: any, get: () => AppStore, signal: AbortSignal, generation: number) {
  if (!get().session) return;
  const sessionUserId = String(get().session?.user.id || '');
  const [conversationResult, directoryResult] = await Promise.allSettled([
    chatManagementService.listConversations(signal),
    chatManagementService.listUsers('', signal),
  ]);
  if (get().session?.user.id !== sessionUserId || get().session?.generation !== generation || signal.aborted) return;

  const currentConversations = get().conversations.filter(item => item.id !== 'vichat-ai');
  const conversations = conversationResult.status === 'fulfilled'
    ? dedupeConversations(conversationResult.value.reduce((list, incoming) => {
      return mergeConversationIntoList(list, incoming);
    }, currentConversations).filter(item => conversationResult.value.some(incoming => (
      incoming.id === item.id
      || (incoming.tinodeTopic && incoming.tinodeTopic === item.tinodeTopic)
      || (incoming.managementId && incoming.managementId === item.managementId)
    ))))
    : currentConversations;
  const directory = directoryResult.status === 'fulfilled'
    ? directoryResult.value.map(user => ({
      ...user,
      online: tinodeClient.getPresenceStatus(user.uid || user.id, user.online === true),
    }))
    : get().directory;
  tinodeClient.setAllowedConversationTopics(conversations.map(item => item.tinodeTopic).filter(Boolean));
  set({ conversations, directory });

  const failures = [conversationResult, directoryResult].filter(result => result.status === 'rejected');
  if (failures.length) {
    set({ error: 'Một phần dữ liệu Chatmgt chưa tải được. Hãy kéo xuống để thử lại.' });
  }
  void loadAuxiliaryData(set, get, sessionUserId, generation).catch(() => {});
  void syncRealtimeTopics(get, 'metadata').catch(() => {});
}

function requestRemoteData(set: any, get: () => AppStore) {
  const generation = get().session?.generation || 0;
  if (!generation) return Promise.resolve();
  if (remoteDataRequest?.generation === generation) return remoteDataRequest.promise;
  const controller = new AbortController();
  const promise = loadRemoteData(set, get, controller.signal, generation).finally(() => {
    if (remoteDataRequest?.generation === generation && remoteDataRequest.promise === promise) remoteDataRequest = null;
  });
  remoteDataRequest = { generation, promise };
  return promise;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(value => {
      clearTimeout(timer);
      resolve(value);
    }, error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function bootstrapAuthenticated(set: any, get: () => AppStore, providedSession?: Session) {
  const session = providedSession || await authService.currentSession();
  const generation = ++nextSessionGeneration;
  const sessionUserId = String(session.user.id || '');
  tinodeUnsubscribe?.();
  tinodeUnsubscribe = null;
  cancelPendingRequests();
  realtimeSyncRequest = null;
  remoteDataRequest = null;
  await tinodeClient.disconnect();
  tinodeClient.setSessionGeneration(generation);
  deletedConversationIds.clear();
  const hydratedSession: Session = { ...session, generation, hydratedAt: Date.now() };
  set({
    session: hydratedSession,
    status: 'loading',
    error: '',
    conversations: [],
    directory: [],
    workspaceItems: [],
    workspaceSummary: null,
    activeConversationId: '',
    connection: 'offline',
  });
  await storageService.savePublicSession(hydratedSession);
  tinodeClient.setTokenProvider(() => authService.refreshTinodeToken());
  tinodeClient.setCurrentIdentity({
    accountId: session.user.id,
    tinodeUid: session.user.tinodeUid || session.user.uid,
    userId: session.user.id,
    uid: session.user.uid,
  });
  tinodeUnsubscribe = tinodeClient.onEvent((event: TinodeEvent) => {
    const current = get();
    if (current.session?.generation !== generation || current.session?.user.id !== sessionUserId) return;
    if (event.type === 'connection') {
      const state: ConnectionState = event.state === 'connected'
        ? 'connected'
        : event.state === 'connecting'
          ? 'connecting'
          : event.state === 'reconnecting'
            ? 'reconnecting'
            : event.state === 'error' ? 'error' : 'offline';
      set({ connection: state });
      if (event.state === 'connected') void syncRealtimeTopics(get, 'connection').catch(() => {});
    } else if (event.type === 'conversation') {
      const eventConversation = event.conversation;
      if (!tinodeClient.isConversationTopicAllowed(eventConversation.tinodeTopic)) return;
      if (deletedConversationIds.has(String(eventConversation.id)) || deletedConversationIds.has(String(eventConversation.tinodeTopic))) return;
      set({ conversations: mergeConversation(current.conversations, event.conversation) });
    } else if (event.type === 'profile') {
       const matches = (value: User) => identitiesOverlap(value, { id: event.uid, uid: event.uid });
      const patch = { ...(event.name ? { name: event.name } : {}), ...(event.avatar ? { avatar: event.avatar } : {}) };
      const nextSession = current.session && matches(current.session.user)
        ? { ...current.session, user: { ...current.session.user, ...patch } }
        : current.session;
      const directory = current.directory.map(user => matches(user) ? { ...user, ...patch } : user);
      const conversations = current.conversations.map(conversation => {
        if (!conversation.members?.some(matches)) return conversation;
        return {
          ...conversation,
          avatarUrl: !conversation.isGroup ? (event.avatar || conversation.avatarUrl) : conversation.avatarUrl,
          name: !conversation.isGroup && event.name ? event.name : conversation.name,
          members: conversation.members.map(member => matches(member) ? { ...member, ...patch } : member),
          messages: conversation.messages.map(message => matches({ id: message.senderId, uid: message.senderId } as User)
            ? { ...message, ...patch, senderName: event.name || message.senderName }
            : message),
        };
      });
      set({ session: nextSession, directory, conversations });
    } else if (event.type === 'incoming-message') {
      if (!tinodeClient.isConversationTopicAllowed(event.conversation.tinodeTopic)) return;
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
      if (!tinodeClient.isConversationTopicAllowed(event.topic)) return;
      const conversation = conversationForId(current.conversations, event.topic);
      const peer = conversation?.members?.find(member => identitiesOverlap(member, { id: event.from, uid: event.from }));
      const callPeer = { name: peer?.name || conversation?.name, avatar: peer?.avatar || conversation?.avatarUrl };
      routeMobileCallEvent(event, callPeer);
      if (event.type === 'call-invite') void notifyIncomingCall(event, callPeer);
    }
  });

  void (async () => {
    try {
      const tinodeAuth = await withTimeout(
        authService.refreshTinodeToken(),
        8000,
        'Tinode đang khởi tạo quá lâu.',
      );
      if (get().session?.user.id !== sessionUserId) return;
      const updatedSession: Session = {
        ...get().session!,
        user: { ...get().session!.user, uid: tinodeAuth.uid, tinodeUid: tinodeAuth.uid },
        tinodeAuth,
        hydratedAt: Date.now(),
      };
      if (get().session?.generation !== generation) return;
      set({ session: updatedSession });
      await storageService.savePublicSession(updatedSession);
      // Update identity with confirmed Tinode UID from server.
      tinodeClient.setCurrentIdentity({
        accountId: sessionUserId,
        tinodeUid: tinodeAuth.uid,
        userId: sessionUserId,
        uid: tinodeAuth.uid,
      });
      await withTimeout(
        tinodeClient.connect(tinodeAuth, () => authService.refreshTinodeToken()),
        10000,
        'Realtime Tinode không phản hồi.',
      );
      await syncRealtimeTopics(get, 'initial');
    } catch (error) {
      if (get().session?.user.id === sessionUserId && get().session?.generation === generation) {
        set({ connection: 'error', error: error instanceof Error ? error.message : 'Realtime đang tạm thời không kết nối.' });
      }
    }
  })();

  const remoteData = requestRemoteData(set, get);
  if (get().session?.user.id === sessionUserId && get().session?.generation === generation) set({ status: 'ready' });
  void remoteData.catch(error => {
    if (get().session?.user.id === sessionUserId && get().session?.generation === generation) {
      set({ error: error instanceof Error ? error.message : 'Không tải được dữ liệu Chatmgt.' });
    }
  });
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
      await bootstrapAuthenticated(set, get, session);
    } catch (error) {
      set({ status: 'signed_out', error: error instanceof Error ? error.message : 'Đăng nhập thất bại.' });
      throw error;
    }
  },

  async switchTenant(tenantId) {
    const previousSession = get().session;
    set({ status: 'loading', error: '' });
    try {
      const session = await authService.switchTenant(tenantId);
      await bootstrapAuthenticated(set, get, session);
    } catch (error) {
      set({
        status: previousSession ? 'ready' : 'error',
        error: error instanceof Error ? error.message : 'Không thể chuyển công ty.',
      });
      throw error;
    }
  },

  async logout() {
    useCallStore.getState().hangUp();
    await tinodeClient.disconnect();
    tinodeClient.setCurrentIdentity(null);
    resetPushNotificationRegistration();
    tinodeUnsubscribe?.();
    tinodeUnsubscribe = null;
    try {
      await authService.logout();
    } finally {
      cancelPendingRequests();
    }
    deletedConversationIds.clear();
    remoteDataRequest = null;
    realtimeSyncRequest = null;
    set({ status: 'signed_out', session: null, conversations: [], directory: [], workspaceItems: [], connection: 'offline', error: '' });
  },

  async reconnect() {
    if (get().status !== 'ready') return;
    if (tinodeClient.connected) return;
    if (reconnectRequest) return reconnectRequest;
    reconnectRequest = (async () => {
      const sessionUserId = get().session?.user.id;
      const generation = get().session?.generation || 0;
      await tinodeClient.reconnect();
      if (get().status !== 'ready' || get().session?.user.id !== sessionUserId || get().session?.generation !== generation) return;
      set({ conversations: dedupeConversations(get().conversations) });
      if (!get().conversations.length || !get().directory.length) await get().refreshData();
      await syncRealtimeTopics(get, 'reconnect');
    })().finally(() => { reconnectRequest = null; });
    return reconnectRequest;
  },

  async refreshData() {
    return requestRemoteData(set, get);
  },

  async openConversation(conversationId) {
    const generation = get().session?.generation || 0;
    let conversation = conversationForId(get().conversations, conversationId);
    if (!conversation) return null;
    if (!conversation.tinodeTopic && conversation.managementId) {
      try {
        const prepared = await chatManagementService.prepareTinodeConversation(conversation.managementId);
        if (get().session?.generation !== generation) return null;
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
        if (get().session?.generation !== generation) return null;
        set({ conversations: mergeConversation(get().conversations, { ...conversation, ...loaded, id: conversation.id, managementId: conversation.managementId, isChatbot: conversation.isChatbot }) });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Không mở được cuộc trò chuyện.' });
      }
    }
    set({ activeConversationId: conversation.id });
    return conversationForId(get().conversations, conversation.id) || conversation;
  },

  async loadEarlier(conversationId, limit = 40) {
    const generation = get().session?.generation || 0;
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.tinodeTopic || !tinodeClient.connected) return false;
    const loaded = await tinodeClient.loadEarlierConversation(conversation.tinodeTopic, limit, generation);
    if (get().session?.generation !== generation) return false;
    set({ conversations: mergeConversation(get().conversations, {
      ...loaded.conversation,
      id: conversation.id,
      managementId: conversation.managementId,
      isChatbot: conversation.isChatbot,
    }) });
    return loaded.hasEarlier;
  },

  async createDirectConversation(user) {
    const existing = get().conversations.find(item => isDirectConversationForUser(item, user));
    if (existing) return existing;
    const accountIds = canonicalAccountIds([user], get().directory);
    if (accountIds.length !== 1) throw new Error('Chat 1-1 can Account ID cua nhan vien cung cong ty.');
    const accountId = accountIds[0];
    const requestKey = `mobile-direct-${get().session?.generation || 0}-${accountId}`;
    const previous = directCreationRequests.get(requestKey);
    if (previous) return previous;

    const request = (async () => {
      const created = await chatManagementService.createConversation({ subject: user.name, participantIds: [accountId] });
      set({ conversations: mergeConversation(get().conversations, created) });
      await get().openConversation(created.id);
      return conversationForId(get().conversations, created.id) || created;
    })();
    directCreationRequests.set(requestKey, request);
    try {
      return await request;
    } finally {
      if (directCreationRequests.get(requestKey) === request) directCreationRequests.delete(requestKey);
    }
  },

  async createGroupConversation(subject, participantIds, avatarFile, idempotencyKey = '') {
    const rawIds = [...new Set(participantIds.map(value => String(value || '').trim()).filter(Boolean))];
    const accountIds = canonicalAccountIds(rawIds, get().directory);
    if (accountIds.length !== rawIds.length) throw new Error('Nhom chi nhan Account ID cua thanh vien cung cong ty.');
    if (!accountIds.length) throw new Error('Nhom phai co it nhat mot thanh vien.');
    if (accountIds.includes(String(get().session?.user.id || ''))) throw new Error('Tai khoan hien tai khong can duoc chon lai.');
    const requestKey = idempotencyKey || `mobile-group-${get().session?.generation || 0}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const previous = groupCreationRequests.get(requestKey);
    if (previous) return previous;

    const request = (async () => {
      const created = await chatManagementService.createConversation({
        subject,
        isGroup: true,
        participantIds: accountIds,
        idempotencyKey: requestKey,
      });
      let topicName = '';
      try {
        const prepared = await chatManagementService.prepareTinodeConversation(created.managementId);
        const preparedParticipants = (prepared.members || []).map(member => normalizeParticipant(member, get().directory));
        const selectedParticipants = accountIds.map(accountId => preparedParticipants.find(member => member.accountId === accountId));
        const missingParticipant = selectedParticipants.find(member => !member || !member.active || !member.tinodeUid);
        if (missingParticipant) throw new Error('Chatmgt chua chuan bi mapping Account ID va Tinode UID cho day du thanh vien.');

        if (prepared.tinodeTopic) {
          const ready = { ...created, ...prepared, id: created.id, managementId: created.managementId };
          set({ conversations: mergeConversation(get().conversations, ready) });
          await get().openConversation(created.id);
          return ready;
        }

        const currentAccountId = String(get().session?.user.id || '');
        const memberIds = selectedParticipants
          .filter(member => member && member.accountId !== currentAccountId)
          .map(member => member?.tinodeUid || '')
          .filter(Boolean);
        if (memberIds.length !== accountIds.length) throw new Error('Chatmgt chua tra ve du mapping Tinode cho nhom.');

        // Chatmgt owns the conversation first. Tinode is created only after
        // every selected Account ID has an explicit realtime mapping.
        const realtimeGroup = await tinodeClient.createGroup({
          name: subject,
          memberIds: [...new Set(memberIds)],
          avatarFile: avatarFile || null,
          conversationId: created.managementId,
        });
        topicName = realtimeGroup.tinodeTopic || realtimeGroup.id;
        const bound = await chatManagementService.bindTinodeTopic(
          created.managementId,
          topicName,
          tinodeClient.getAuthTokenValue(),
          realtimeGroup.avatarUrl || '',
        );
        if (realtimeGroup.avatarUrl) {
          await tinodeClient.bindChatMediaReference(
            realtimeGroup.avatarUrl,
            created.managementId,
            `group-avatar:${created.managementId}`,
          ).catch(() => {});
        }
        const canonicalTopic = bound.tinodeTopic || topicName;
        if (canonicalTopic !== topicName) await tinodeClient.discardGroupTopic(topicName).catch(() => {});
        const ready = {
          ...created,
          ...realtimeGroup,
          ...bound,
          id: created.id,
          managementId: created.managementId,
          tinodeTopic: canonicalTopic,
          avatarUrl: realtimeGroup.avatarUrl || bound.avatarUrl || created.avatarUrl || '',
        };
        set({ conversations: mergeConversation(get().conversations, ready) });
        await get().openConversation(created.id);
        return ready;
      } catch (error) {
        if (topicName) {
          // Re-read Chatmgt before cleanup. A lost bind response must not
          // delete a topic that the server already accepted.
          try {
            const reconciled = await chatManagementService.prepareTinodeConversation(created.managementId);
            if (reconciled.tinodeTopic) {
              const ready = { ...created, ...reconciled, id: created.id, managementId: created.managementId };
              set({ conversations: mergeConversation(get().conversations, ready) });
              return ready;
            }
            await tinodeClient.discardGroupTopic(topicName);
          } catch {
            // Keep the topic for an explicit retry when bind status is unknown.
          }
        }
        throw error;
      }
    })();
    groupCreationRequests.set(requestKey, request);
    try {
      return await request;
    } finally {
      if (groupCreationRequests.get(requestKey) === request) groupCreationRequests.delete(requestKey);
    }
  },

  async addGroupMembers(conversationId, participantIds) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.isGroup) throw new Error('Chỉ có thể thêm thành viên vào nhóm.');
    const managed = await chatManagementService.addConversationParticipants(conversation.managementId || conversation.id, participantIds);
    return mergeManagedConversation(set, get, conversation.id, managed);
  },

  async approveGroupMember(conversationId, participantId, approved) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.isGroup) throw new Error('Cuộc trò chuyện không phải nhóm.');
    const managed = await chatManagementService.updateConversationParticipantApproval(conversation.managementId || conversation.id, participantId, approved);
    return mergeManagedConversation(set, get, conversation.id, managed);
  },

  async setGroupMemberRole(conversationId, participantId, role) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.isGroup) throw new Error('Cuộc trò chuyện không phải nhóm.');
    const managed = await chatManagementService.updateConversationParticipantRole(conversation.managementId || conversation.id, participantId, role);
    return mergeManagedConversation(set, get, conversation.id, managed);
  },

  async removeGroupMember(conversationId, participantId) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.isGroup) throw new Error('Cuộc trò chuyện không phải nhóm.');
    const token = (await authService.refreshTinodeToken()).token;
    const managed = await chatManagementService.removeConversationParticipant(conversation.managementId || conversation.id, participantId, token);
    return mergeManagedConversation(set, get, conversation.id, managed);
  },

  async renameGroup(conversationId, name) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.isGroup) throw new Error('Cuộc trò chuyện không phải nhóm.');
    const managed = await chatManagementService.updateGroupProfile(conversation.managementId || conversation.id, { name: name.trim() });
    return mergeManagedConversation(set, get, conversation.id, managed);
  },

  async updateGroupAvatar(conversationId, file) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.isGroup || !conversation.tinodeTopic) throw new Error('Nhóm chưa sẵn sàng realtime.');
    const managementId = conversation.managementId || conversation.id;
    const avatar = await tinodeClient.uploadGroupAvatar(conversation.tinodeTopic, file, managementId);
    let managed;
    try {
      managed = await chatManagementService.updateGroupProfile(managementId, { avatar });
    } catch (error) {
      await tinodeClient.discardChatMediaReference(avatar, managementId).catch(() => {});
      throw error;
    }
    await tinodeClient.bindChatMediaReference(avatar, managementId, `group-avatar:${managementId}`).catch(() => {});
    return mergeManagedConversation(set, get, conversation.id, managed);
  },

  async updateGroupSettings(conversationId, settings) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.isGroup) throw new Error('Cuộc trò chuyện không phải nhóm.');
    let managed = await chatManagementService.updateGroupSettings(conversation.managementId || conversation.id, { settings });
    // If the response is missing groupSettings, re-fetch the conversation
    // from Chatmgt so the store retains authoritative settings.
    if (!managed.groupSettings) {
      try {
        const refetched = await chatManagementService.prepareTinodeConversation(conversation.managementId || conversation.id);
        if (refetched.groupSettings) managed = { ...managed, groupSettings: refetched.groupSettings };
      } catch {
        // Keep the response as-is; the settings in the local draft remain usable.
      }
    }
    return mergeManagedConversation(set, get, conversation.id, managed);
  },

  async updateConversationPin(conversationId, pinned) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation) throw new Error('Cuộc trò chuyện không tồn tại.');
    const managed = await chatManagementService.updateConversationPin(conversation.managementId || conversation.id, pinned);
    return mergeManagedConversation(set, get, conversation.id, managed);
  },

  async dissolveGroup(conversationId) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.isGroup) throw new Error('Cuộc trò chuyện không phải nhóm.');
    await chatManagementService.dissolveGroup(conversation.managementId || conversation.id);
    if (conversation.tinodeTopic) tinodeClient.disallowConversationTopic(conversation.tinodeTopic);
    set({ conversations: get().conversations.filter(item => item.id !== conversation.id), activeConversationId: get().activeConversationId === conversation.id ? '' : get().activeConversationId });
  },

  async searchConversationHistory(conversationId, query) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation) return [];
    return chatManagementService.searchConversationHistory(conversation.managementId || conversation.id, query);
  },

  async createPoll(conversationId, poll) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.tinodeTopic || !conversation.isGroup) throw new Error('Bình chọn chỉ khả dụng trong nhóm.');
    const clientId = `mobile-poll-${Date.now()}`;
    const result = await tinodeClient.sendPoll(conversation.tinodeTopic, poll, clientId);
    if (poll.settings.pinPoll) {
      const actor = get().session?.user;
      await tinodeClient.sendSystemEvent(conversation.tinodeTopic, {
        action: 'message_pinned',
        actorId: tinodeClient.currentUserId || actor?.uid || actor?.id || '',
        actorName: actor?.name || 'Thành viên',
        messageId: clientId,
        messageSeq: result.seq,
        messagePreview: `Bình chọn: ${poll.question}`,
      }, `mobile-pin-poll-${result.seq || clientId}`);
    }
  },

  async votePoll(conversationId, pollId, optionIds) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.tinodeTopic) throw new Error('Nhóm chưa sẵn sàng realtime.');
    await tinodeClient.sendPollEvent(conversation.tinodeTopic, { action: 'poll_vote', pollId, optionIds }, `mobile-poll-vote-${Date.now()}`);
  },

  async addPollOption(conversationId, pollId, optionId, optionText) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.tinodeTopic) throw new Error('Nhóm chưa sẵn sàng realtime.');
    await tinodeClient.sendPollEvent(conversation.tinodeTopic, { action: 'poll_option_added', pollId, optionId, optionText }, `mobile-poll-option-${Date.now()}`);
  },

  async lockPoll(conversationId, pollId) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.tinodeTopic) throw new Error('Nhóm chưa sẵn sàng realtime.');
    await tinodeClient.sendPollEvent(conversation.tinodeTopic, { action: 'poll_locked', pollId }, `mobile-poll-lock-${Date.now()}`);
  },

  async toggleMessagePin(conversationId, message) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.isGroup || !conversation.tinodeTopic) throw new Error('Chỉ có thể ghim tin nhắn trong nhóm.');
    const currentMember = conversation.members?.find(member => identitiesOverlap(member, get().session?.user));
    if (!memberIsAdmin(currentMember) && !groupSettingEnabled(conversation.groupSettings, 'allowPinMessages')) {
      throw new Error('Quản trị viên đã tắt quyền ghim tin nhắn trong nhóm.');
    }
    const pinned = !message.pinned;
    const actor = get().session?.user;
    await tinodeClient.sendSystemEvent(conversation.tinodeTopic, {
      action: pinned ? 'message_pinned' : 'message_unpinned',
      actorId: tinodeClient.currentUserId || actor?.uid || actor?.id || '',
      actorName: actor?.name || 'Thành viên',
      messageId: String(message.id || '').slice(0, 200),
      messageSeq: Number(message.seq) || 0,
      messagePreview: String(message.text || message.file?.name || (message.sticker ? 'Sticker' : 'Nội dung đính kèm'))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120),
    }, `mobile-pin-${message.seq || message.id || Date.now()}`);
  },

  async sendText(conversationId, text, replyTo, mentions = []) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.tinodeTopic || !tinodeClient.connected) throw new Error('Realtime chưa sẵn sàng. Hãy thử lại sau khi kết nối lại.');
    const clientId = `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pending: ChatMessage = { id: clientId, type: 'text', sender: 'outgoing', senderId: tinodeClient.currentUserId, senderName: 'Bạn', text, replyTo, mentions, createdAt: new Date().toISOString(), pending: true, deliveryStatus: 'sending' };
    set({ conversations: mergeConversation(get().conversations, { ...conversation, messages: [...conversation.messages, pending], lastMsg: text, updatedAt: pending.createdAt }) });
    try {
      await tinodeClient.sendText(conversation.tinodeTopic, text, clientId, replyTo, mentions);
    } catch (error) {
      set({ conversations: get().conversations.map(item => item.id === conversationId ? { ...item, messages: item.messages.map(message => message.id === clientId ? { ...message, pending: false, failed: true, deliveryStatus: 'failed' } : message) } : item) });
      throw error;
    }
  },

  async sendFile(conversationId, file) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.tinodeTopic || !tinodeClient.connected) throw new Error('Realtime chưa sẵn sàng. Hãy thử lại sau khi kết nối lại.');
    const clientId = `mobile-file-${Date.now()}`;
    await tinodeClient.sendFile(conversation.tinodeTopic, file, clientId, {
      conversationId: conversation.managementId || conversation.id,
    });
  },

  async sendSticker(conversationId, sticker) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.tinodeTopic || !tinodeClient.connected) throw new Error('Realtime chưa sẵn sàng. Hãy thử lại sau khi kết nối lại.');
    const clientId = `mobile-sticker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await tinodeClient.sendSticker(conversation.tinodeTopic, sticker, clientId, {
      conversationId: conversation.managementId || conversation.id,
    });
  },

  async sendReaction(conversationId, message, emoji) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.tinodeTopic || !tinodeClient.connected) throw new Error('Realtime chưa sẵn sàng. Hãy thử lại sau khi kết nối lại.');
    await tinodeClient.sendReaction(conversation.tinodeTopic, message, emoji);
  },

  async editMessage(conversationId, message, text) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.tinodeTopic || !tinodeClient.connected) throw new Error('Realtime chưa sẵn sàng. Hãy thử lại sau khi kết nối lại.');
    await tinodeClient.editMessage(conversation.tinodeTopic, message, text, message.mentions || []);
  },

  async recallMessage(conversationId, message, mode = 'all') {
    const conversation = conversationForId(get().conversations, conversationId);
    if (!conversation?.tinodeTopic || !tinodeClient.connected) throw new Error('Realtime chưa sẵn sàng. Hãy thử lại sau khi kết nối lại.');
    await tinodeClient.recallMessage(conversation.tinodeTopic, message, mode);
  },

  async sendTyping(conversationId) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (conversation?.tinodeTopic && tinodeClient.connected) await tinodeClient.sendTyping(conversation.tinodeTopic);
  },

  async markRead(conversationId) {
    const conversation = conversationForId(get().conversations, conversationId);
    if (conversation?.tinodeTopic && tinodeClient.connected) {
      await tinodeClient.markRead(conversation.tinodeTopic);
      const readSeq = conversation.messages.reduce((latest, message) => Math.max(latest, Number(message.seq) || 0), Number(conversation.readSeq) || 0);
      set({ conversations: get().conversations.map(item => item.id === conversationId ? { ...item, badge: 0, readSeq } : item) });
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

  async deleteConversation(conversationId, replacementId = '') {
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
      await chatManagementService.deleteConversationForCurrentUser(conversation.managementId || conversation.id, tinodeAuth.token, replacementId);
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
