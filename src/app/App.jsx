import React, { useState, useEffect, useRef, useCallback } from 'react';
import Login from '../features/auth/components/Login';
import KnowledgeManager from '../features/chatbot/components/KnowledgeManager';
import { isTinodeConfigured, tinodeClient, normalizeTinodeConversation } from '../features/chat/services/tinodeClient';
import { chatManagementService } from '../features/chat/services/chatManagementService';
import { findAccount } from '../features/contacts/services/accountDirectory';
import { addDemoGroupMembers, appendDemoGroupMessage, deleteDemoGroupForUser, leaveDemoGroup, markDemoGroupRead, removeDemoGroupMember, saveDemoGroup, updateDemoGroupMessage } from '../features/demo/services/demoGroupStore';
import { appendDemoDirectMessage, deleteDemoDirectForUser, directConversationId, markDemoDirectRead, saveDemoDirect, updateDemoDirectMessage } from '../features/demo/services/demoDirectStore';
import { CHATBOT_ACCOUNT, learnFromChatFile, learnFromChatMessage, loadChatbotMessages, loadChatbotMessagesFromServer, requestChatbotReply, saveChatbotMessage } from '../features/chatbot/services/chatbotService';

function tinodeTopicName(room) {
  return room?.tinodeTopic || room?.id || '';
}

function identityValues(entity) {
  return [...new Set([
    entity?.id,
    entity?.uid,
    entity?.tinodeUid,
    entity?.tinode_uid,
  ].filter(Boolean).map(value => String(value)))];
}

function identitiesOverlap(first, second) {
  const secondValues = new Set(identityValues(second));
  return identityValues(first).some(value => secondValues.has(value));
}

function snapshotPresence(entity, snapshot) {
  for (const value of identityValues(entity)) {
    if (Object.prototype.hasOwnProperty.call(snapshot || {}, value)) return Boolean(snapshot[value]);
  }
  return undefined;
}

// --- Initial Conversions Data ---
const INITIAL_CHAT_DATA = {};

function createChatbotConversation(messages = []) {
  const welcomeMessage = {
    id: 'bot-welcome',
    type: 'text',
    sender: 'incoming',
    senderId: CHATBOT_ACCOUNT.id,
    senderName: CHATBOT_ACCOUNT.name,
    avatar: CHATBOT_ACCOUNT.avatar,
    text: 'Chào bạn! Mình là Trợ lý Sông Hồng. Bạn có thể hỏi về quy trình nội bộ, hỗ trợ sử dụng hệ thống hoặc yêu cầu chuyển cho nhân viên.',
    time: '',
  };
  const conversationMessages = [welcomeMessage, ...messages.filter(message => message.id !== welcomeMessage.id)];
  const lastMessage = messages[messages.length - 1] || welcomeMessage;
  const lastContent = lastMessage?.text || 'Hỏi đáp và hỗ trợ nội bộ bằng AI';
  return {
    id: CHATBOT_ACCOUNT.id,
    name: CHATBOT_ACCOUNT.name,
    isGroup: false,
    isChatbot: true,
    avatarHtml: <img src={CHATBOT_ACCOUNT.avatar} alt={CHATBOT_ACCOUNT.name} />,
    avatarClass: 'chatbot-avatar',
    membersCount: 'Trợ lý AI · Online',
    description: 'Trợ lý AI hỗ trợ tra cứu và giải đáp thông tin nội bộ SÔNG HỒNG.',
    admin: '',
    members: [CHATBOT_ACCOUNT],
    participantIds: [CHATBOT_ACCOUNT.id],
    messages: conversationMessages,
    lastMsg: lastMessage ? `${lastMessage.sender === 'outgoing' ? 'Bạn' : CHATBOT_ACCOUNT.name}: ${lastContent}` : lastContent,
    time: lastMessage?.time || '',
    updatedAt: lastMessage?.createdAt,
    badge: 0,
  };
}

function createInitialConversations() {
  return {
    ...INITIAL_CHAT_DATA,
    [CHATBOT_ACCOUNT.id]: createChatbotConversation(),
  };
}

function personalizeGroupSystemText(message, accounts, viewerId) {
  const actorName = findAccount(accounts, message.senderId)?.name || message.senderName || 'Một thành viên';
  const targetIds = message.targetIds || [];
  const targetNames = targetIds.map(id => findAccount(accounts, id)?.name || id);
  if (message.action === 'member_added') {
    if (message.senderId === viewerId) return `Bạn đã thêm ${targetNames.join(', ')} vào nhóm`;
    if (targetIds.includes(viewerId)) return `${actorName} đã thêm bạn vào nhóm`;
    return `${actorName} đã thêm ${targetNames.join(', ')} vào nhóm`;
  }
  if (message.action === 'member_left') {
    return message.senderId === viewerId ? 'Bạn đã rời khỏi nhóm' : `${actorName} đã rời khỏi nhóm`;
  }
  if (message.action === 'group_created') {
    return message.senderId === viewerId ? 'Bạn đã tạo nhóm' : `${actorName} đã tạo nhóm`;
  }
  return message.text;
}

function isSelfDirectConversation(room, user, accounts) {
  if (!room || room.isGroup || !user) return false;
  const userId = user.id || user.uid;
  if (room.id === userId || room.id === user.uid) return true;
  const members = room.members || [];
  const peerMembers = members.filter(member => {
    const account = findAccount(accounts, member.id || member.name);
    return member.id !== userId && account?.id !== userId;
  });
  return peerMembers.length === 0 && room.name === user.name;
}

function canAccessRoomFiles(room, user, accounts, mode) {
  if (!room || room.isChatbot || isSelfDirectConversation(room, user, accounts)) return false;
  const viewerId = mode === 'tinode' ? (user?.tinodeUid || user?.uid || user?.id) : (user?.id || user?.uid);
  if (!viewerId) return false;
  if (mode === 'tinode') {
    if (!room.isGroup) return room.id !== viewerId;
    return (room.members || []).some(member => member.id === viewerId);
  }
  if (room.isGroup) {
    return (room.members || []).some(member => {
      const account = findAccount(accounts, member.id || member.name);
      return member.id === viewerId || account?.id === viewerId;
    });
  }
  return (room.participantIds || []).includes(viewerId);
}

function isConversationHiddenAfterDelete(room) {
  const deletedAt = Date.parse(room?.deletedAt || '') || 0;
  if (!deletedAt) return false;
  const latestMessageAt = Math.max(0, ...(room.messages || []).map(message => messageTimestamp(message)));
  const latestActivityAt = Math.max(latestMessageAt, Date.parse(room?.updatedAt || '') || 0);
  return latestActivityAt <= deletedAt;
}

function conversationTimestamp(room) {
  const storedTimestamp = Date.parse(room?.updatedAt || '');
  if (storedTimestamp) return storedTimestamp;
  const time = String(room?.time || '');
  const clock = time.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) {
    const date = new Date();
    date.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
    return date.getTime();
  }
  if (time.toLowerCase().includes('hôm qua')) return Date.now() - 24 * 60 * 60 * 1000;
  return 0;
}

function shouldShowInConversationList(room) {
  if (!room) return false;
  if (room.isGroup || room.isChatbot) return true;
  // Tinode may create an empty P2P topic while searching for a user or opening
  // their profile. It becomes a real conversation only after the first message.
  return Array.isArray(room.messages) && room.messages.length > 0;
}

function collectFriendshipRecords(conversations, viewerId) {
  const requests = new Map();
  const responses = new Map();
  Object.values(conversations || {}).forEach(room => {
    (room.friendEvents || []).forEach(message => {
      const event = message.friendEvent;
      if (!event?.requestId) return;
      const record = { roomId: room.id, room, message, event };
      if (event.action === 'request') requests.set(event.requestId, record);
      else responses.set(event.requestId, record);
    });
  });
  return [...requests.values()]
    .map(request => ({ ...request, response: responses.get(request.event.requestId) || null }))
    .filter(record => record.event.requesterId === viewerId || record.event.recipientId === viewerId)
    .sort((first, second) => {
      const firstTime = Date.parse(first.response?.event?.createdAt || first.event.createdAt || first.message.createdAt || '') || 0;
      const secondTime = Date.parse(second.response?.event?.createdAt || second.event.createdAt || second.message.createdAt || '') || 0;
      return secondTime - firstTime;
    });
}

function friendshipStatusFor(records, viewerId, contactId) {
  const latest = records.find(record => (
    record.event.requesterId === viewerId && record.event.recipientId === contactId
  ) || (
    record.event.requesterId === contactId && record.event.recipientId === viewerId
  ));
  if (!latest) return 'none';
  if (latest.response?.event?.action === 'accepted') return 'friends';
  if (latest.response?.event?.action === 'rejected') return 'none';
  return latest.event.requesterId === viewerId ? 'pending-sent' : 'pending-received';
}

function acceptedFriendContacts(records, viewerId, accounts = []) {
  const latestByContact = new Map();
  records.forEach(record => {
    const contactId = record.event.requesterId === viewerId
      ? record.event.recipientId
      : record.event.requesterId;
    if (!contactId || latestByContact.has(contactId)) return;
    latestByContact.set(contactId, record);
  });

  return [...latestByContact.entries()]
    .filter(([, record]) => record.response?.event?.action === 'accepted')
    .map(([contactId, record]) => {
      const account = findAccount(accounts, contactId);
      const member = record.room.members?.find(item => item.id === contactId);
      const requesterIsViewer = record.event.requesterId === viewerId;
      return {
        ...member,
        ...account,
        id: contactId,
        name: account?.name
          || member?.name
          || (requesterIsViewer ? record.response?.event?.responderName : record.event.requesterName)
          || record.room.name
          || 'Người dùng',
        avatar: account?.avatar || member?.avatar || record.room.avatarUrl || record.message.avatar || '',
        online: member?.online ?? account?.online ?? false,
      };
    })
    .sort((first, second) => first.name.localeCompare(second.name, 'vi'));
}

function messageTimestamp(message) {
  return Date.parse(message?.createdAt || message?.raw?.ts || '') || 0;
}

function messagePayloadKey(message) {
  return [
    message?.type || 'text',
    message?.text || '',
    message?.file?.name || '',
    message?.image || '',
  ].join('|');
}

function mergeTinodeMessages(existingMessages = [], incomingMessages = []) {
  const merged = [];
  const indexes = new Map();

  const upsert = message => {
    if (!message) return;
    const key = message.id || (message.seq ? `${message.senderId || message.sender || 'message'}-${message.seq}` : '');
    let index = key ? indexes.get(key) : undefined;

    // Reconcile a message sent just before this update with its server copy.
    if (index === undefined && Number.isFinite(message.seq)) {
      index = merged.findIndex(candidate => Number.isFinite(candidate?.seq) && candidate.seq === message.seq);
    }
    if (index === undefined && !message.pending) {
      const payloadKey = messagePayloadKey(message);
      index = merged.findIndex(candidate => candidate.pending && messagePayloadKey(candidate) === payloadKey);
    }

    if (index !== undefined && index >= 0) {
      const previousKey = merged[index]?.id;
      const previous = merged[index];
      merged[index] = {
        ...previous,
        ...message,
        // Reconcile Tinode's server echo with the optimistic message that was
        // already rendered locally. The echo can arrive without `from`; do
        // not let that overwrite the sender side while replacing pending UI.
        ...(previous.pending ? { sender: previous.sender, senderId: previous.senderId, senderName: previous.senderName } : {}),
        senderName: message.senderName || previous.senderName,
        avatar: message.avatar || previous.avatar,
        file: message.file || previous.file,
        image: message.image || previous.image,
      };
      if (previousKey && previousKey !== key) indexes.delete(previousKey);
      if (key) indexes.set(key, index);
      return;
    }

    if (key) indexes.set(key, merged.length);
    merged.push(message);
  };

  existingMessages.forEach(upsert);
  incomingMessages.forEach(upsert);

  return merged
    .map((message, index) => ({ message, index }))
    .sort((first, second) => {
      const firstTime = messageTimestamp(first.message);
      const secondTime = messageTimestamp(second.message);
      if (firstTime && secondTime && firstTime !== secondTime) return firstTime - secondTime;
      if (Number.isFinite(first.message?.seq) && Number.isFinite(second.message?.seq) && first.message.seq !== second.message.seq) {
        return first.message.seq - second.message.seq;
      }
      return first.index - second.index;
    })
    .map(item => item.message);
}

function mergeTinodeConversation(existing, incoming) {
  if (!existing) return incoming;
  const messages = mergeTinodeMessages(existing.messages, incoming.messages);
  const friendEvents = mergeTinodeMessages(existing.friendEvents, incoming.friendEvents);
  return {
    ...existing,
    ...incoming,
    name: incoming.name && incoming.name !== incoming.id ? incoming.name : existing.name,
    avatarHtml: incoming.avatarHtml || existing.avatarHtml,
    avatarUrl: incoming.avatarUrl !== undefined ? incoming.avatarUrl : existing.avatarUrl,
    description: incoming.description || existing.description,
    admin: incoming.admin || existing.admin,
    adminId: incoming.adminId || existing.adminId,
    members: incoming.members?.length ? incoming.members : (existing.members || []),
    messages,
    friendEvents,
    lastMsg: incoming.lastMsg || existing.lastMsg,
    time: incoming.time || existing.time,
    updatedAt: incoming.updatedAt || existing.updatedAt || messages[messages.length - 1]?.createdAt,
  };
}

function SafeAvatar({ src, name, className = '' }) {
  const [failed, setFailed] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState('');

  useEffect(() => {
    let active = true;
    setFailed(false);
    setResolvedSrc('');
    if (!src) return () => { active = false; };
    tinodeClient.resolveAvatarUrl(src)
      .then(url => {
        if (active) setResolvedSrc(url || '');
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => { active = false; };
  }, [src]);

  if (!resolvedSrc || failed) {
    return <span className={`${className} avatar-fallback`} aria-label={name || 'Avatar'}>{name?.trim?.().slice(0, 1).toUpperCase() || '?'}</span>;
  }
  return <img src={resolvedSrc} alt={name || 'Avatar'} className={className} onError={() => setFailed(true)} />;
}

function ConversationAvatar({ room }) {
  const legacySource = typeof room?.avatarHtml === 'string'
    ? room.avatarHtml.match(/src=["']([^"']+)["']/i)?.[1]
    : '';
  const source = typeof room?.avatarUrl === 'string' ? room.avatarUrl : legacySource;
  if (source) return <SafeAvatar src={source} name={room?.name} />;
  if (React.isValidElement(room?.avatarHtml)) return room.avatarHtml;
  if (room?.isGroup) return <i className="fa-solid fa-users"></i>;
  return <span>{room?.name?.trim?.().slice(0, 1).toUpperCase() || '?'}</span>;
}

function unreadMessageCount(messages, readBy, viewerId) {
  const lastReadAt = Date.parse(readBy?.[viewerId] || '') || 0;
  return (messages || []).filter(message =>
    message.senderId && message.senderId !== viewerId && (Date.parse(message.createdAt || '') || 0) > lastReadAt
  ).length;
}

function demoGroupToConversation(group, accounts, viewerId) {
  const members = (group.memberIds || []).map(memberId => {
    const account = findAccount(accounts, memberId);
    return account ? {
      id: account.id,
      name: account.name,
      avatar: account.avatar,
      online: Boolean(account.online),
      username: account.username,
      email: account.email,
    } : { id: memberId, name: memberId, online: false };
  });
  const owner = findAccount(accounts, group.ownerId);
  const deletedBefore = Date.parse(group.deletedAtByUser?.[viewerId] || '') || 0;
  const messages = (group.messages || [])
    .filter(message => (Date.parse(message.createdAt || '') || 0) > deletedBefore)
    .map(message => {
    const senderAccount = findAccount(accounts, message.senderId);
    const isOwnMessage = message.senderId === viewerId;
    return {
      ...message,
      sender: isOwnMessage ? 'outgoing' : 'incoming',
      senderName: senderAccount?.name || message.senderName || message.senderId,
      avatar: senderAccount?.avatar || message.avatar,
      text: message.type === 'system' ? personalizeGroupSystemText(message, accounts, viewerId) : message.text,
    };
  });
  const lastMessage = messages[messages.length - 1];
  const lastContent = lastMessage?.text || lastMessage?.file?.name || 'Nhóm mới được tạo';
  return {
    id: group.id,
    name: group.name,
    isGroup: true,
    avatarHtml: <i className="fa-solid fa-users"></i>,
    avatarClass: 'group blue',
    membersCount: `${members.length} thành viên`,
    description: group.description || '',
    admin: owner?.name || 'Quản trị viên',
    adminId: owner?.id || group.ownerId || '',
    members,
    messages,
    lastMsg: lastMessage ? (lastMessage.type === 'system' ? lastContent : `${lastMessage.sender === 'outgoing' ? 'Bạn' : lastMessage.senderName}: ${lastContent}`) : 'Nhóm mới được tạo',
    time: lastMessage?.time || (group.updatedAt ? new Date(group.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : getTimeString()),
    updatedAt: group.updatedAt,
    badge: unreadMessageCount(group.messages, group.readBy, viewerId),
  };
}

function demoDirectToConversation(direct, accounts, viewerId) {
  const other = (direct.participantIds || []).map(id => findAccount(accounts, id)).find(account => account && account.id !== viewerId);
  const deletedBefore = Date.parse(direct.deletedAtByUser?.[viewerId] || '') || 0;
  const messages = (direct.messages || [])
    .filter(message => (Date.parse(message.createdAt || '') || 0) > deletedBefore)
    .map(message => {
    const sender = findAccount(accounts, message.senderId);
    return {
      ...message,
      sender: message.senderId === viewerId ? 'outgoing' : 'incoming',
      senderName: sender?.name || message.senderName,
      avatar: sender?.avatar || message.avatar,
    };
  });
  const lastMessage = messages[messages.length - 1];
  const lastContent = lastMessage?.text || lastMessage?.file?.name || 'Bắt đầu cuộc trò chuyện';
  return {
    id: direct.id,
    name: other?.name || 'Cuộc trò chuyện cá nhân',
    isGroup: false,
    avatarHtml: other?.avatar ? <img src={other.avatar} alt={other.name} /> : <span>{other?.name?.slice(0, 1).toUpperCase() || '?'}</span>,
    avatarClass: '',
    membersCount: other?.online ? 'Online' : 'Offline',
    description: `Cuộc trò chuyện với ${other?.name || 'thành viên'}`,
    admin: '',
    members: other ? [{ ...other }] : [],
    participantIds: direct.participantIds,
    messages,
    lastMsg: lastMessage ? `${lastMessage.sender === 'outgoing' ? 'Bạn' : lastMessage.senderName}: ${lastContent}` : 'Bắt đầu cuộc trò chuyện',
    time: lastMessage?.time || (direct.updatedAt ? new Date(direct.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''),
    updatedAt: lastMessage?.createdAt || direct.updatedAt,
    badge: unreadMessageCount(direct.messages, direct.readBy, viewerId),
  };
}

function App() {
  const [currentChatId, setCurrentChatId] = useState(CHATBOT_ACCOUNT.id);
  const [conversations, setConversations] = useState(createInitialConversations);
  const [isDetailOpen, setIsDetailOpen] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [typingByTopic, setTypingByTopic] = useState({});
  const [inputText, setInputText] = useState("");
  const [drafts, setDrafts] = useState({});
  const [searchQuery, setSearchQuery] = useState("");

  // Trạng thái xác thực (Auth State)
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [chatMode, setChatMode] = useState('demo');
  const [connectionStatus, setConnectionStatus] = useState(isTinodeConfigured ? 'ready' : 'demo');
  const [chatError, setChatError] = useState('');

  // Group creation state. The same modal works with Tinode and demo fallback.
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupAvatarFile, setGroupAvatarFile] = useState(null);
  const [groupAvatarPreview, setGroupAvatarPreview] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupMemberIds, setGroupMemberIds] = useState([]);
  const [groupMemberProfiles, setGroupMemberProfiles] = useState({});
  const [groupMemberSearch, setGroupMemberSearch] = useState('');
  const [groupSearchResults, setGroupSearchResults] = useState([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false);
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState('');
  const [workspacePanel, setWorkspacePanel] = useState(null);
  const [workspaceQuery, setWorkspaceQuery] = useState('');
  const [workspaceResults, setWorkspaceResults] = useState([]);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [friendRequestTarget, setFriendRequestTarget] = useState(null);
  const [friendRequestNote, setFriendRequestNote] = useState('');
  const [isSendingFriendRequest, setIsSendingFriendRequest] = useState(false);
  const [respondingFriendRequestId, setRespondingFriendRequestId] = useState('');
  const [friendNotice, setFriendNotice] = useState('');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [messageMenu, setMessageMenu] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [messageDetails, setMessageDetails] = useState(null);
  const [shareMessage, setShareMessage] = useState(null);
  const [messageActions, setMessageActions] = useState({});
  const [mutedConversations, setMutedConversations] = useState({});
  const [settings, setSettings] = useState({ desktopNotifications: true, sounds: true, compactMode: false });
  const [directoryAccounts, setDirectoryAccounts] = useState([]);
  const [isUpdatingProfileAvatar, setIsUpdatingProfileAvatar] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', email: '', title: '', department: '' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);

  // Mobile navigation state
  const [isMobileChatActive, setIsMobileChatActive] = useState(false);
  const [isMobileSidebarOpen, _setIsMobileSidebarOpen] = useState(false);
  const [isPrimarySidebarCollapsed, setIsPrimarySidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('songhong.primary-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  // References
  const chatMessagesEndRef = useRef(null);
  const messageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const currentChatIdRef = useRef(currentChatId);
  const deletedConversationIdsRef = useRef(new Set());
  const memberSearchRequestRef = useRef(0);
  const createGroupRequestRef = useRef(false);
  const addMembersRequestRef = useRef(false);
  const tinodeSessionRequestRef = useRef(null);
  const learnedKnowledgeKeysRef = useRef(new Set());
  const conversationsRef = useRef(conversations);
  const typingNoticeAtRef = useRef(new Map());
  const typingClearTimersRef = useRef(new Map());
  const notificationBaselineRef = useRef(new Map());
  const notificationAudioContextRef = useRef(null);
  const contactsSyncTimerRef = useRef(null);

  // Event callbacks can run between React renders; keep the latest room map
  // available without forcing Tinode subscriptions to be recreated.
  conversationsRef.current = conversations;

  const activeChat = conversations[currentChatId] || Object.values(conversations)[0] || {
    id: 'empty',
    name: 'Chưa có cuộc trò chuyện',
    isGroup: false,
    avatarHtml: <i className="fa-regular fa-comments"></i>,
    avatarClass: 'group',
    membersCount: 'Hãy bắt đầu một cuộc trò chuyện mới',
    description: '',
    admin: '',
    members: [],
    messages: [],
    lastMsg: '',
    time: '',
    badge: 0,
  };

  const isCurrentUserOnline = Boolean(
    isLoggedIn && currentUser && (chatMode !== 'tinode' || connectionStatus === 'online')
  );
  const profileAccount = {
    ...(findAccount(directoryAccounts, currentUser?.id || currentUser?.uid) || {}),
    ...(currentUser || {}),
    online: isCurrentUserOnline,
  };
  const isKnowledgeAdmin = ['admin', 'superadmin', 'owner', 'administrator']
    .includes(String(profileAccount.role || '').toLowerCase());

  useEffect(() => {
    try {
      window.localStorage.setItem('songhong.primary-sidebar-collapsed', String(isPrimarySidebarCollapsed));
    } catch {
      // The layout still works when browser storage is unavailable.
    }
  }, [isPrimarySidebarCollapsed]);

  useEffect(() => {
    if (workspacePanel !== 'profile') return;
    setProfileForm({
      name: profileAccount.name || '',
      email: profileAccount.email || '',
      title: profileAccount.title || '',
      department: profileAccount.department || '',
    });
    setProfileNotice('');
  }, [workspacePanel, profileAccount.name, profileAccount.email, profileAccount.title, profileAccount.department]);
  const viewerId = chatMode === 'tinode'
    ? (currentUser?.tinodeUid || currentUser?.uid || currentUser?.id)
    : (currentUser?.id || currentUser?.uid);

  const applyPresenceSnapshot = useCallback(snapshot => {
    const updateAccount = account => {
      const online = identitiesOverlap(account, currentUser) ? undefined : snapshotPresence(account, snapshot);
      return online === undefined || account?.online === online ? account : { ...account, online };
    };

    setDirectoryAccounts(previous => previous.map(updateAccount));
    setWorkspaceResults(previous => previous.map(updateAccount));
    setGroupSearchResults(previous => previous.map(updateAccount));
    setConversations(previous => {
      let changed = false;
      const next = Object.fromEntries(Object.entries(previous).map(([id, room]) => {
        let membersChanged = false;
        const members = (room.members || []).map(member => {
          const account = findAccount(directoryAccounts, member.id || member.uid || member.name);
          const isCurrentAccount = identitiesOverlap(member, currentUser) || identitiesOverlap(account, currentUser);
          const online = isCurrentAccount
            ? undefined
            : snapshotPresence(member, snapshot) ?? snapshotPresence(account, snapshot);
          if (online === undefined || member.online === online) return member;
          membersChanged = true;
          return { ...member, online };
        });
        const peer = !room.isGroup && !room.isChatbot
          ? members.find(member => !identitiesOverlap(member, currentUser)) || members[0]
          : null;
        const membersCount = peer ? (peer.online ? 'Online' : 'Offline') : room.membersCount;
        if (!membersChanged && membersCount === room.membersCount) return [id, room];
        changed = true;
        return [id, { ...room, members, membersCount }];
      }));
      return changed ? next : previous;
    });
  }, [currentUser, directoryAccounts]);

  const isAccountOnline = account => identitiesOverlap(account, currentUser)
    ? isCurrentUserOnline
    : Boolean(account?.online);

  useEffect(() => {
    if (!viewerId) return;
    try {
      setMessageActions(JSON.parse(window.localStorage.getItem(`songhong.message-actions.${viewerId}`) || '{}'));
    } catch {
      setMessageActions({});
    }
  }, [viewerId]);
  const activeAdminId = activeChat.adminId
    || activeChat.members?.find(member => member.mode?.includes?.('O'))?.id
    || '';
  const isCurrentUserGroupAdmin = Boolean(activeChat.isGroup && (
    activeAdminId === viewerId
    || (!activeAdminId && activeChat.admin === currentUser?.name)
  ));

  // Auto scroll to bottom of chat
  const scrollToBottom = () => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversations, currentChatId, isTyping]);

  useEffect(() => {
    const closeMenu = () => setMessageMenu(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  useEffect(() => {
    currentChatIdRef.current = currentChatId;
  }, [currentChatId]);

  useEffect(() => {
    if (!isLoggedIn) {
      setDirectoryAccounts([]);
      return undefined;
    }
    chatManagementService.listUsers().then(setDirectoryAccounts).catch(err => setChatError(err.message));
    return undefined;
  }, [isLoggedIn]);

  useEffect(() => () => {
    if (groupAvatarPreview) URL.revokeObjectURL(groupAvatarPreview);
  }, [groupAvatarPreview]);

  const ensureTinodeSession = useCallback(async () => {
    if (chatMode !== 'tinode') return null;
    if (!tinodeSessionRequestRef.current) {
      tinodeSessionRequestRef.current = (async () => {
        const auth = chatManagementService.getTinodeAuth();
        if (!auth) throw new Error('Phien quan ly khong co thong tin ket noi Tinode.');
        setConnectionStatus('connecting');
        const session = await tinodeClient.ensureSession(auth);
        setCurrentUser(previous => ({
          ...previous,
          tinodeUid: session.uid,
          tinodeSession: session,
          name: session.profile?.name || previous?.name,
          avatar: session.profile?.avatar || previous?.avatar || '',
        }));
        setConnectionStatus('online');
        return session;
      })().catch(error => {
        setConnectionStatus('offline');
        throw error;
      }).finally(() => {
        tinodeSessionRequestRef.current = null;
      });
    }
    return tinodeSessionRequestRef.current;
  }, [chatMode]);

  const ensureTinodeConversationTopic = async room => {
    if (!room || room.isChatbot || chatMode !== 'tinode') return room?.id || '';
    await ensureTinodeSession();
    const managementUserId = currentUser?.id || currentUser?.uid;
    let topicName = room.tinodeTopic
      || chatManagementService.getTinodeTopic(managementUserId, room.managementId || room.id);

    if (!topicName && room.isGroup) {
      const memberAccounts = (room.members || [])
        .map(member => findAccount(directoryAccounts, member.id || member.name) || member)
        .filter(member => member?.id !== managementUserId && member?.username !== currentUser?.username);
      const resolvedMembers = await Promise.allSettled(memberAccounts.map(member => tinodeClient.resolveUserTopic(member)));
      const memberIds = [...new Set(resolvedMembers
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value)
        .filter(Boolean))];
      const created = await tinodeClient.createGroup({
        name: room.name,
        description: room.description || '',
        memberIds,
      });
      topicName = created.id;
    } else if (!topicName) {
      const contact = (room.members || [])
        .map(member => findAccount(directoryAccounts, member.id || member.name) || member)
        .find(member => member?.id !== managementUserId && member?.username !== currentUser?.username);
      topicName = await tinodeClient.resolveUserTopic(contact || { uid: room.participantIds?.find(id => id !== managementUserId) });
    }

    if (!topicName) throw new Error('Service quan ly chua gan Tinode topic cho cuoc tro chuyen nay.');
    chatManagementService.bindTinodeTopic(managementUserId, room.managementId || room.id, topicName);
    setConversations(previous => previous[room.id] ? ({
      ...previous,
      [room.id]: { ...previous[room.id], tinodeTopic: topicName },
    }) : previous);
    return topicName;
  };

  const queueMessageForKnowledge = useCallback((room, message, originalFile = null) => {
    if (!room || room.isChatbot || !message?.id || message.recalled || !currentUser) return;
    const key = `${room.managementId || room.id}:${message.id}`;
    if (learnedKnowledgeKeysRef.current.has(key)) return;
    learnedKnowledgeKeysRef.current.add(key);
    if (message.type === 'text' && message.text) {
      learnFromChatMessage({ room, message, user: currentUser })
        .then(result => { if (!result) learnedKnowledgeKeysRef.current.delete(key); });
      return;
    }
    if (message.type === 'file' && (originalFile || message.file?.url)) {
      const fileRequest = originalFile ? Promise.resolve(originalFile) : tinodeClient.fetchFile(message.file);
      fileRequest
        .then(file => learnFromChatFile({ room, message, file, user: currentUser }))
        .then(result => { if (!result) learnedKnowledgeKeysRef.current.delete(key); })
        .catch(() => learnedKnowledgeKeysRef.current.delete(key));
    }
  }, [currentUser]);

  const showIncomingNotification = useCallback((conversation, message, stateId) => {
    if (!message || message.senderId === viewerId || typeof window === 'undefined') return;
    const shouldAlert = document.visibilityState === 'hidden' || currentChatIdRef.current !== stateId;
    if (!shouldAlert) return;

    if (settings.sounds) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const context = notificationAudioContextRef.current || new AudioContext();
          notificationAudioContextRef.current = context;
          if (context.state === 'suspended') context.resume().catch(() => {});
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = 720;
          gain.gain.setValueAtTime(0.04, context.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 0.16);
        }
      } catch {
        // Browsers may block sound until the page has received user input.
      }
    }

    if (!settings.desktopNotifications || !('Notification' in window) || window.Notification.permission !== 'granted') return;
    const body = message.text || message.file?.name || (message.image ? 'Đã gửi một hình ảnh' : 'Có tin nhắn mới');
    const notification = new window.Notification(conversation.name || 'VICHAT', {
      body: `${message.senderName ? `${message.senderName}: ` : ''}${body}`,
      icon: '/favicon.svg',
      tag: `vichat-${conversation.id}`,
    });
    notification.onclick = () => {
      window.focus();
      setWorkspacePanel(null);
      setCurrentChatId(stateId);
      setIsMobileChatActive(true);
      setConversations(previous => previous[stateId] ? ({
        ...previous,
        [stateId]: { ...previous[stateId], badge: 0 },
      }) : previous);
      tinodeClient.markRead(conversation.id).catch(() => {});
      notification.close();
    };
  }, [settings.desktopNotifications, settings.sounds, viewerId]);

  // Keep the React view synchronized with Tinode's topic callbacks.
  useEffect(() => {
    if (!isLoggedIn || chatMode !== 'tinode') return undefined;
    return tinodeClient.onEvent(async event => {
      if (event.type === 'disconnect') {
        setConnectionStatus('offline');
        setChatError('Kết nối chat đã bị gián đoạn. Hệ thống sẽ tự kết nối lại.');
        return;
      }
      if (event.type === 'presence') {
        if (event.uid) applyPresenceSnapshot({ [event.uid]: Boolean(event.online) });
        return;
      }
      if (event.type === 'presence-snapshot') {
        applyPresenceSnapshot(event.snapshot || {});
        return;
      }
      if (event.type === 'contacts') {
        // A new invite or P2P topic is first reported through the `me` topic.
        // Subscribe it immediately so messages arrive without opening it.
        if (!contactsSyncTimerRef.current) {
          contactsSyncTimerRef.current = setTimeout(() => {
            contactsSyncTimerRef.current = null;
            tinodeClient.listConversations().catch(() => {});
          }, 120);
        }
        return;
      }
      if (event.type === 'typing') {
        if (!event.uid || event.uid === viewerId || !event.topic) return;
        setTypingByTopic(previous => ({
          ...previous,
          [event.topic]: { uid: event.uid, name: event.name || 'Thành viên' },
        }));
        const previousTimer = typingClearTimersRef.current.get(event.topic);
        if (previousTimer) clearTimeout(previousTimer);
        const timer = setTimeout(() => {
          setTypingByTopic(previous => {
            const next = { ...previous };
            delete next[event.topic];
            return next;
          });
          typingClearTimersRef.current.delete(event.topic);
        }, 2600);
        typingClearTimersRef.current.set(event.topic, timer);
        return;
      }
      if ((event.type === 'profile' || event.type === 'user-profile') && event.profile?.id) {
        const profile = event.profile;
        const viewerId = currentUser?.id || currentUser?.uid;
        if (profile.id === viewerId) {
          setCurrentUser(previous => ({
            ...previous,
            name: profile.name || previous?.name,
            avatar: profile.avatar || '',
          }));
        }
        const updateAccount = account => account.id === profile.id
          ? { ...account, name: profile.name || account.name, avatar: profile.avatar || '' }
          : account;
        setDirectoryAccounts(previous => previous.map(updateAccount));
        setWorkspaceResults(previous => previous.map(updateAccount));
        setGroupSearchResults(previous => previous.map(updateAccount));
        setConversations(previous => Object.fromEntries(Object.entries(previous).map(([id, room]) => {
          const members = (room.members || []).map(updateAccount);
          const peer = !room.isGroup ? members.find(member => member.id === profile.id) : null;
          return [id, {
            ...room,
            ...(peer ? { name: profile.name || room.name, avatarUrl: profile.avatar || '' } : {}),
            members,
            messages: (room.messages || []).map(message => message.senderId === profile.id
              ? { ...message, senderName: profile.name || message.senderName, avatar: profile.avatar || '' }
              : message),
          }];
        })));
        return;
      }
      if (event.type === 'conversation' && event.conversation) {
        const conversation = normalizeTinodeConversation(event.conversation);
        if (deletedConversationIdsRef.current.has(conversation.id)) return;
        if (isConversationHiddenAfterDelete(conversation)) {
          setConversations(prev => {
            const next = { ...prev };
            delete next[conversation.id];
            return next;
          });
          return;
        }
        if (isSelfDirectConversation(conversation, currentUser, directoryAccounts)) {
          deletedConversationIdsRef.current.add(conversation.id);
          tinodeClient.deleteConversation(conversation.id, { unsubscribe: true }).catch(() => {});
          setConversations(prev => {
            const next = { ...prev };
            delete next[conversation.id];
            return next;
          });
          if (currentChatIdRef.current === conversation.id) setCurrentChatId(CHATBOT_ACCOUNT.id);
          return;
        }
        (conversation.messages || []).forEach(message => queueMessageForKnowledge(conversation, message));
        const currentRooms = conversationsRef.current;
        const managedEntry = Object.entries(currentRooms).find(([, room]) => tinodeTopicName(room) === conversation.id)
          || Object.entries(currentRooms).find(([, room]) => (
            !room.tinodeTopic
            && room.isGroup === conversation.isGroup
            && String(room.name || '').localeCompare(String(conversation.name || ''), 'vi', { sensitivity: 'base' }) === 0
          ));
        const stateId = managedEntry?.[0] || conversation.id;

        // Establish a baseline during initial history sync. Only later sequence
        // numbers are live messages and should trigger desktop notifications.
        const latestIncoming = (conversation.messages || [])
          .filter(message => message.type !== 'system' && message.senderId !== viewerId && Number.isFinite(message.seq))
          .sort((first, second) => first.seq - second.seq)
          .at(-1);
        if (latestIncoming) {
          const previousSeq = notificationBaselineRef.current.get(conversation.id);
          notificationBaselineRef.current.set(conversation.id, Math.max(previousSeq || 0, latestIncoming.seq));
          if (previousSeq !== undefined && latestIncoming.seq > previousSeq) {
            const newMessage = (conversation.messages || [])
              .filter(message => message.type !== 'system' && message.senderId !== viewerId && message.seq > previousSeq)
              .sort((first, second) => first.seq - second.seq)
              .at(-1);
            showIncomingNotification(conversation, newMessage, stateId);
          }
        }

        // The active conversation is read as soon as a new packet arrives, so
        // its badge and Tinode read cursor do not wait for a panel click.
        if (stateId === currentChatIdRef.current && conversation.badge > 0 && document.visibilityState !== 'hidden') {
          tinodeClient.markRead(conversation.id).catch(() => {});
        }
        setConversations(prev => {
          const previousRoom = prev[stateId];
          const incoming = {
            ...conversation,
            id: stateId,
            managementId: previousRoom?.managementId || stateId,
            tinodeTopic: conversation.id,
          };
          return {
            ...prev,
            [stateId]: mergeTinodeConversation(previousRoom, incoming),
          };
        });
        return;
      }
    });
  }, [isLoggedIn, chatMode, currentUser, directoryAccounts, applyPresenceSnapshot, queueMessageForKnowledge, showIncomingNotification, viewerId]);

  // Keep every known Tinode topic subscribed after login. This is the piece
  // that makes unread badges and notifications realtime before a chat is opened.
  useEffect(() => {
    if (!isLoggedIn || chatMode !== 'tinode') return undefined;
    let cancelled = false;
    ensureTinodeSession()
      .then(() => tinodeClient.listConversations())
      .then(() => {
        if (!cancelled) {
          setConnectionStatus('online');
          applyPresenceSnapshot(tinodeClient.getPresenceSnapshot());
        }
      })
      .catch(error => {
        if (!cancelled) {
          setConnectionStatus('offline');
          setChatError(error?.message || 'Không thể đồng bộ chat realtime.');
        }
      });
    return () => { cancelled = true; };
  }, [isLoggedIn, chatMode, ensureTinodeSession, applyPresenceSnapshot]);

  const handleLoginSuccess = async (user) => {
    setDrafts({});
    setInputText('');
    setCurrentUser(user);
    setChatMode(user.connection || 'demo');
    setConnectionStatus(user.connection === 'tinode' ? 'ready' : 'demo');
    setChatError('');
    setIsLoggedIn(true);
    if (user.connection === 'tinode' && settings.desktopNotifications && typeof window !== 'undefined'
      && 'Notification' in window && window.Notification.permission === 'default') {
      window.Notification.requestPermission().catch(() => {});
    }

    try {
        const accounts = await chatManagementService.listUsers();
        setDirectoryAccounts(accounts);
        const managed = await chatManagementService.listConversations({
          userId: user.id || user.uid,
        });
        const savedGroups = managed.groups
          .map(group => demoGroupToConversation(group, accounts, user.id || user.uid));
        const savedDirects = managed.directs
          .map(direct => demoDirectToConversation(direct, accounts, user.id || user.uid));
        const savedDirectIds = new Set(savedDirects.map(room => room.id));
        const initialRooms = Object.fromEntries(managed.conversations
          .filter(room => !room.isChatbot)
          .filter(room => !isSelfDirectConversation(room, user, accounts))
          .filter(room => {
            if (room.isGroup) return true;
            const contact = room.members?.map(member => findAccount(accounts, member.id || member.name)).find(Boolean);
            return !contact || !savedDirectIds.has(directConversationId(user.id || user.uid, contact.id));
          })
          .map(room => [room.id, {
            ...room,
            messages: [],
            lastMsg: 'Chưa có tin nhắn',
            time: '',
            badge: 0,
          }]));
        const next = {
          ...initialRooms,
          ...Object.fromEntries(savedGroups.map(group => [group.id, group])),
          ...Object.fromEntries(savedDirects.map(direct => [direct.id, direct])),
          [CHATBOT_ACCOUNT.id]: createChatbotConversation(loadChatbotMessages(user.id || user.uid)),
        };
        const withTinodeBindings = Object.fromEntries(Object.entries(next).map(([id, room]) => [id, room.isChatbot ? room : {
          ...room,
          managementId: room.managementId || id,
          tinodeTopic: room.tinodeTopic || chatManagementService.getTinodeTopic(user.id || user.uid, room.managementId || id),
        }]));
        setConversations(previous => {
          const combined = { ...withTinodeBindings };
          Object.entries(previous).forEach(([previousId, previousRoom]) => {
            if (!previousRoom?.tinodeTopic) return;
            const managedEntry = Object.entries(combined)
              .find(([, room]) => tinodeTopicName(room) === previousRoom.tinodeTopic);
            const stateId = managedEntry?.[0] || previousId;
            combined[stateId] = mergeTinodeConversation(combined[stateId], {
              ...previousRoom,
              id: stateId,
              managementId: combined[stateId]?.managementId || previousRoom.managementId || stateId,
            });
          });
          return combined;
        });
        setCurrentChatId(Object.keys(next)[0] || CHATBOT_ACCOUNT.id);
        const friendRequests = await chatManagementService.listFriendRequests(user.id || user.uid);
        friendRequests.forEach(request => {
          const contactId = request.requesterId === (user.id || user.uid) ? request.recipientId : request.requesterId;
          appendLocalFriendEvent(contactId, findAccount(accounts, contactId), request);
        });
        loadChatbotMessagesFromServer(user).then(messages => {
          setConversations(previous => ({
            ...previous,
            [CHATBOT_ACCOUNT.id]: createChatbotConversation(messages),
          }));
        }).catch(() => {});
    } catch (err) {
      setChatError(err?.message || 'Không tải được danh sách cuộc trò chuyện.');
    }
  };

  const handleConversationSelect = async (id) => {
    const room = conversations[id];
    setCurrentChatId(id);
    setInputText(drafts[id] || '');
    setIsMobileChatActive(true);
    setChatError('');
    setConversations(prev => prev[id] ? ({ ...prev, [id]: { ...prev[id], badge: 0 } }) : prev);
    if (chatMode === 'demo') {
      const userId = currentUser?.id || currentUser?.uid;
      if (!room?.isChatbot) {
        if (room?.isGroup) markDemoGroupRead(id, userId);
        else markDemoDirectRead(id, userId);
      }
    }
    if (chatMode === 'tinode' && !room?.isChatbot) {
      try {
        const topicName = await ensureTinodeConversationTopic(room);
        const openedRoom = normalizeTinodeConversation(await tinodeClient.openConversation(topicName));
        const managedRoom = { ...openedRoom, id, managementId: room.managementId || id, tinodeTopic: topicName };
        setConversations(prev => ({
          ...prev,
          [id]: mergeTinodeConversation(prev[id], managedRoom),
        }));
        await tinodeClient.markRead(topicName);
      } catch (err) {
        setConnectionStatus('offline');
        setChatError(err?.message || 'Không mở được cuộc trò chuyện.');
      }
    }
  };

  const handleLogout = async () => {
    if (tinodeClient.authenticated) await tinodeClient.logout();
    await chatManagementService.logout();
    if (chatMode === 'demo') {
      Object.values(conversations)
        .filter(room => !room.isGroup && !room.isChatbot && room.messages?.length > 0)
        .forEach(room => persistDemoDirectMessage(room, null));
    }
    setIsLoggedIn(false);
    setCurrentUser(null);
    setDrafts({});
    setInputText('');
    setChatMode('demo');
    setConnectionStatus(isTinodeConfigured ? 'ready' : 'demo');
    setChatError('');
    setFriendRequestTarget(null);
    setFriendRequestNote('');
    setFriendNotice('');
    setWorkspacePanel(null);
    tinodeSessionRequestRef.current = null;
    deletedConversationIdsRef.current.clear();
    notificationBaselineRef.current.clear();
    typingNoticeAtRef.current.clear();
    typingClearTimersRef.current.forEach(timer => clearTimeout(timer));
    typingClearTimersRef.current.clear();
    if (contactsSyncTimerRef.current) clearTimeout(contactsSyncTimerRef.current);
    contactsSyncTimerRef.current = null;
    setTypingByTopic({});
    setConversations(createInitialConversations());
    setCurrentChatId(CHATBOT_ACCOUNT.id);
  };

  const toggleGroupMember = (member) => {
    const memberId = member?.id || member?.name;
    if (!memberId) return;
    const selected = groupMemberIds.includes(memberId);
    setGroupMemberIds(previous => selected ? previous.filter(id => id !== memberId) : [...previous, memberId]);
    setGroupMemberProfiles(profiles => {
      const next = { ...profiles };
      if (selected) delete next[memberId];
      else next[memberId] = member;
      return next;
    });
  };

  const handleSearchGroupMembers = async (event) => {
    const value = event.target.value;
    const requestId = ++memberSearchRequestRef.current;
    setGroupMemberSearch(value);
    if (value.trim().length < 2) {
      setGroupSearchResults([]);
      setIsSearchingMembers(false);
      return;
    }
    setIsSearchingMembers(true);
    try {
      const results = await chatManagementService.searchUsers(value, {
        excludeUserId: currentUser?.id || currentUser?.uid,
      });
      if (requestId === memberSearchRequestRef.current) setGroupSearchResults(results);
    } catch (err) {
      setChatError(err?.message || 'Không tìm được thành viên.');
    } finally {
      if (requestId === memberSearchRequestRef.current) setIsSearchingMembers(false);
    }
  };

  const openWorkspacePanel = (panel) => {
    if (panel === 'knowledge' && !isKnowledgeAdmin) return;
    setWorkspacePanel(panel);
    setWorkspaceQuery('');
    setWorkspaceResults([]);
    setChatError('');
  };

  const handleDesktopNotificationsToggle = async event => {
    const enabled = event.target.checked;
    if (enabled && typeof window !== 'undefined' && 'Notification' in window
      && window.Notification.permission === 'default') {
      const permission = await window.Notification.requestPermission().catch(() => 'denied');
      if (permission !== 'granted') {
        setSettings(previous => ({ ...previous, desktopNotifications: false }));
        setChatError('Trình duyệt chưa cho phép thông báo desktop. Bạn có thể bật lại trong cài đặt trình duyệt.');
        return;
      }
    }
    setSettings(previous => ({ ...previous, desktopNotifications: enabled }));
  };

  const handleProfileSave = async event => {
    event.preventDefault();
    setChatError('');
    setProfileNotice('');
    if (!profileForm.name.trim()) {
      setChatError('Vui lòng nhập họ tên hiển thị.');
      return;
    }
    setIsSavingProfile(true);
    try {
      const updated = await chatManagementService.updateProfile({
        name: profileForm.name.trim(),
        email: profileForm.email.trim(),
        title: profileForm.title.trim(),
        department: profileForm.department.trim(),
      });
      const viewerIds = new Set([
        currentUser?.id,
        currentUser?.uid,
        currentUser?.tinodeUid,
      ].filter(Boolean));
      setCurrentUser(previous => ({
        ...previous,
        ...updated,
        uid: previous?.uid,
        tinodeUid: previous?.tinodeUid,
      }));
      setDirectoryAccounts(previous => previous.map(account => (
        account.id === updated.id ? { ...account, ...updated } : account
      )));
      setConversations(previous => Object.fromEntries(Object.entries(previous).map(([id, room]) => [id, {
        ...room,
        members: (room.members || []).map(member => viewerIds.has(member.id)
          ? { ...member, name: updated.name, avatar: updated.avatar || member.avatar }
          : member),
        messages: (room.messages || []).map(message => viewerIds.has(message.senderId)
          ? { ...message, senderName: updated.name, avatar: updated.avatar || message.avatar }
          : message),
      }])));
      setProfileForm({
        name: updated.name || '',
        email: updated.email || '',
        title: updated.title || '',
        department: updated.department || '',
      });
      if (chatMode === 'tinode') {
        try {
          await ensureTinodeSession();
          await tinodeClient.updateCurrentProfile({ name: updated.name });
        } catch (tinodeError) {
          setChatError(tinodeError?.message || 'Hồ sơ đã lưu nhưng tên hiển thị Tinode chưa đồng bộ.');
        }
      }
      setProfileNotice('Thông tin hồ sơ đã được lưu trên service quản lý.');
    } catch (error) {
      setChatError(error?.message || 'Không thể cập nhật hồ sơ.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleProfileAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setChatError('Vui lòng chọn đúng tệp hình ảnh.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setChatError('Ảnh đại diện không được lớn hơn 10 MB.');
      return;
    }

    setIsUpdatingProfileAvatar(true);
    setChatError('');
    try {
      let avatar;
      if (chatMode === 'tinode') {
        await ensureTinodeSession();
        const profile = await tinodeClient.updateCurrentProfile({
          name: currentUser?.name,
          avatarFile: file,
        });
        avatar = profile?.avatar;
      } else {
        avatar = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Không thể đọc ảnh đại diện.'));
          reader.readAsDataURL(file);
        });
      }
      if (!avatar) throw new Error('Máy chủ không trả về ảnh đại diện mới.');
      const updated = await chatManagementService.updateProfile({ avatar });
      const viewerIds = new Set([
        currentUser?.id,
        currentUser?.uid,
        currentUser?.tinodeUid,
      ].filter(Boolean));
      const nextAvatar = updated.avatar || avatar;
      setCurrentUser(previous => ({ ...previous, avatar: nextAvatar }));
      setDirectoryAccounts(previous => previous.map(account => (
        account.id === updated.id ? { ...account, avatar: nextAvatar } : account
      )));
      setConversations(previous => Object.fromEntries(Object.entries(previous).map(([id, room]) => [id, {
        ...room,
        members: (room.members || []).map(member => viewerIds.has(member.id) ? { ...member, avatar: nextAvatar } : member),
        messages: (room.messages || []).map(message => viewerIds.has(message.senderId) ? { ...message, avatar: nextAvatar } : message),
      }])));
      setProfileNotice('Ảnh đại diện đã được cập nhật.');
    } catch (error) {
      setChatError(error?.message || 'Không thể cập nhật ảnh đại diện.');
    } finally {
      setIsUpdatingProfileAvatar(false);
    }
  };

  const handleWorkspaceSearch = async (event) => {
    const value = event.target.value;
    setWorkspaceQuery(value);
    if (workspacePanel !== 'contacts' || value.trim().length < 2) {
      setWorkspaceResults([]);
      return;
    }
    setIsWorkspaceLoading(true);
    try {
      setWorkspaceResults(await chatManagementService.searchUsers(value, {
        excludeUserId: currentUser?.id || currentUser?.uid,
      }));
    } catch (err) {
      setChatError(err?.message || 'Không thể tìm danh bạ.');
    } finally {
      setIsWorkspaceLoading(false);
    }
  };

  const appendLocalFriendEvent = (roomId, contact, event) => {
    const friendActorId = event.action === 'request' ? event.requesterId : event.responderId;
    const friendActorName = event.action === 'request' ? event.requesterName : event.responderName;
    const message = {
      id: `friend-${event.action}-${event.requestId}`,
      type: 'friend_event',
      action: event.action,
      senderId: friendActorId,
      senderName: friendActorName,
      friendEvent: event,
      text: event.note || '',
      time: new Date(event.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      createdAt: event.createdAt,
    };
    setConversations(previous => {
      const existing = previous[roomId];
      const room = existing || {
        id: roomId,
        name: contact?.name || 'Người dùng',
        isGroup: false,
        avatarUrl: contact?.avatar || '',
        avatarClass: '',
        membersCount: contact?.online ? 'Online' : 'Offline',
        description: '',
        admin: '',
        members: contact ? [contact] : [],
        messages: [],
        friendEvents: [],
        lastMsg: '',
        time: '',
        badge: 0,
      };
      return {
        ...previous,
        [roomId]: {
          ...room,
          friendEvents: mergeTinodeMessages(room.friendEvents || [], [message]),
        },
      };
    });
  };

  const openFriendRequest = (contact) => {
    if (chatMode !== 'tinode') {
      setChatError('Kết bạn chỉ khả dụng khi hệ thống đang kết nối Tinode.');
      return;
    }
    setFriendRequestTarget(contact);
    setFriendRequestNote('');
    setFriendNotice('');
  };

  const handleSendFriendRequest = async (event) => {
    event.preventDefault();
    if (!friendRequestTarget?.id || isSendingFriendRequest) return;
    setIsSendingFriendRequest(true);
    setChatError('');
    try {
      const request = await chatManagementService.sendFriendRequest({
        sender: currentUser,
        recipient: friendRequestTarget,
        note: friendRequestNote,
      });
      appendLocalFriendEvent(friendRequestTarget.id, friendRequestTarget, request);
      setFriendRequestTarget(null);
      setFriendRequestNote('');
      setFriendNotice(`Đã gửi lời mời kết bạn tới ${friendRequestTarget.name}.`);
    } catch (error) {
      setChatError(error?.message || 'Không thể gửi lời mời kết bạn.');
    } finally {
      setIsSendingFriendRequest(false);
    }
  };

  const handleFriendRequestResponse = async (record, accepted) => {
    if (!record?.event?.requestId || respondingFriendRequestId) return;
    setRespondingFriendRequestId(record.event.requestId);
    setChatError('');
    try {
      const response = await chatManagementService.respondFriendRequest({
        request: record.event,
        responder: currentUser,
        accepted,
      });
      appendLocalFriendEvent(record.roomId, {
        id: record.event.requesterId,
        name: record.event.requesterName,
        avatar: record.message.avatar,
      }, response);
      setFriendNotice(accepted
        ? `Bạn và ${record.event.requesterName || 'người gửi'} đã trở thành bạn bè.`
        : `Đã từ chối lời mời của ${record.event.requesterName || 'người gửi'}.`);
    } catch (error) {
      setChatError(error?.message || 'Không thể xử lý lời mời kết bạn.');
    } finally {
      setRespondingFriendRequestId('');
    }
  };

  const handleStartDirectChat = async (contact) => {
    if (contact.id === (currentUser?.id || currentUser?.uid)) {
      setChatError('Không thể mở cuộc trò chuyện với chính tài khoản đang đăng nhập.');
      return;
    }
    const linkedRoom = Object.values(conversations).find(room => !room.isGroup && !room.isChatbot && (
      room.name === contact.name || room.members?.some(member => findAccount(directoryAccounts, member.id || member.name)?.id === contact.id)
    ));
    const viewerId = currentUser?.id || currentUser?.uid;
    const participantIds = contact.id ? [viewerId, contact.id] : [];
    const contactId = chatMode === 'demo' && participantIds.length === 2
      ? directConversationId(...participantIds)
      : linkedRoom?.id || contact.id || contact.name;
    try {
      let stateConversationId = contactId;
      deletedConversationIdsRef.current.delete(contactId);
      let tinodeTopic = linkedRoom?.tinodeTopic
        || chatManagementService.getTinodeTopic(viewerId, linkedRoom?.managementId || contactId);
      if (chatMode === 'tinode' && contact.id) {
        await ensureTinodeSession();
        tinodeTopic = tinodeTopic || await tinodeClient.resolveUserTopic(contact);
        chatManagementService.bindTinodeTopic(viewerId, linkedRoom?.managementId || contactId, tinodeTopic);
        await tinodeClient.restoreConversation(tinodeTopic);
        if (!linkedRoom) {
          const managedRoom = await chatManagementService.createConversation({
            userId: viewerId,
            subject: contact.name,
            participantIds: [contact.id],
            tinodeTopic,
            properties: { members: [currentUser, contact] },
          }).catch(() => null);
          stateConversationId = managedRoom?.id || contactId;
        }
      }
      const existing = conversations[contactId] || linkedRoom;
      setConversations(prev => {
        const next = { ...prev };
        if (linkedRoom && linkedRoom.id !== contactId) delete next[linkedRoom.id];
        next[stateConversationId] = {
          id: stateConversationId,
          managementId: linkedRoom?.managementId || stateConversationId,
          tinodeTopic,
          name: contact.name,
          isGroup: false,
          avatarHtml: contact.avatar ? <img src={contact.avatar} alt={contact.name} /> : <span>{contact.name.slice(0, 1).toUpperCase()}</span>,
          avatarClass: '',
          membersCount: isAccountOnline(contact) ? 'Online' : 'Offline',
          description: `Cuộc trò chuyện với ${contact.name}`,
          admin: '',
          members: [contact],
          participantIds: participantIds.length === 2 ? participantIds : existing?.participantIds,
          messages: existing?.messages || [],
          lastMsg: existing?.lastMsg || 'Bắt đầu cuộc trò chuyện',
          time: existing?.time || getTimeString(),
          updatedAt: existing?.updatedAt || new Date().toISOString(),
          badge: existing?.badge || 0,
        };
        return next;
      });
      setCurrentChatId(stateConversationId);
      setInputText(drafts[stateConversationId] || '');
      setWorkspacePanel(null);
      setIsMobileChatActive(true);
    } catch (err) {
      setChatError(err?.message || 'Không thể mở cuộc trò chuyện.');
    }
  };

  const handleLeaveGroup = async () => {
    if (!activeChat.isGroup || !window.confirm(`Bạn có chắc muốn rời nhóm "${activeChat.name}"?`)) return;
    try {
      deletedConversationIdsRef.current.add(activeChat.id);
      const actorId = currentUser?.id || currentUser?.uid;
      const systemText = `${currentUser?.name || 'Một thành viên'} đã rời khỏi nhóm`;
      const systemMessage = {
        id: `system-leave-${Date.now()}`,
        type: 'system',
        action: 'member_left',
        senderId: actorId,
        senderName: currentUser?.name,
        text: systemText,
        time: getTimeString(),
        createdAt: new Date().toISOString(),
      };
      if (chatMode === 'tinode' && activeChat.id) {
        const topicName = await ensureTinodeConversationTopic(activeChat);
        await tinodeClient.sendSystemEvent(topicName, {
          action: 'member_left',
          actorId,
          actorName: currentUser?.name,
        });
        await tinodeClient.leave(topicName);
      }
      if (chatMode === 'demo') {
        persistDemoGroupMessage(activeChat, systemMessage);
        leaveDemoGroup(activeChat.id, actorId);
      }
      setConversations(prev => {
        const next = { ...prev };
        delete next[activeChat.id];
        return next;
      });
      const nextId = Object.keys(conversations).find(id => id !== activeChat.id) || 'empty';
      setCurrentChatId(nextId);
      setIsDetailOpen(false);
      setTimeout(() => deletedConversationIdsRef.current.delete(activeChat.id), 5000);
    } catch (err) {
      deletedConversationIdsRef.current.delete(activeChat.id);
      setChatError(err?.message || 'Không thể rời nhóm.');
    }
  };

  const handleDeleteConversation = async () => {
    if (!activeChat?.id || activeChat.isChatbot || isDeletingConversation) return;
    const kind = activeChat.isGroup ? 'nhóm' : 'cuộc trò chuyện';
    const confirmed = window.confirm(
      `Bạn có chắc muốn xóa ${kind} "${activeChat.name}"?\n\nToàn bộ tin nhắn và tệp trong ${kind} này sẽ bị xóa khỏi tài khoản của bạn và không thể khôi phục.`,
    );
    if (!confirmed) return;

    const conversationId = activeChat.id;
    const viewerId = currentUser?.id || currentUser?.uid;
    setIsDeletingConversation(true);
    setChatError('');
    if (activeChat.isGroup) deletedConversationIdsRef.current.add(conversationId);
    try {
      if (chatMode === 'tinode') {
        const topicName = await ensureTinodeConversationTopic(activeChat);
        if (activeChat.isGroup) {
          await tinodeClient.sendSystemEvent(topicName, {
            action: 'member_left',
            actorId: viewerId,
            actorName: currentUser?.name,
          });
        }
        await tinodeClient.deleteConversation(topicName, { isGroup: activeChat.isGroup });
      } else if (activeChat.isGroup) {
        deleteDemoGroupForUser(conversationId, viewerId, currentUser?.name);
      } else {
        deleteDemoDirectForUser(conversationId, viewerId);
      }

      setConversations(previous => {
        const next = { ...previous };
        delete next[conversationId];
        return next;
      });
      setDrafts(previous => {
        const next = { ...previous };
        delete next[conversationId];
        return next;
      });
      setInputText('');
      const nextId = Object.keys(conversations).find(id => id !== conversationId) || CHATBOT_ACCOUNT.id;
      setCurrentChatId(nextId);
      setIsDetailOpen(false);
      if (activeChat.isGroup) setTimeout(() => deletedConversationIdsRef.current.delete(conversationId), 5000);
    } catch (error) {
      deletedConversationIdsRef.current.delete(conversationId);
      setChatError(error?.message || 'Không thể xóa cuộc trò chuyện.');
    } finally {
      setIsDeletingConversation(false);
    }
  };

  const toggleConversationMute = (muted) => {
    setMutedConversations(prev => ({ ...prev, [activeChat.id]: muted }));
  };

  const handleCreateGroup = async (event) => {
    event.preventDefault();
    const name = groupName.trim();
    if (!name || createGroupRequestRef.current) return;
    createGroupRequestRef.current = true;
    setChatError('');
    setIsCreatingGroup(true);
    try {
      let room;
      const actorId = currentUser?.id || currentUser?.uid;
      const addedNames = groupMemberIds.map(memberId =>
        groupMemberProfiles[memberId]?.name || findAccount(directoryAccounts, memberId)?.name || memberId
      );
      const systemText = addedNames.length > 0
        ? `${currentUser?.name || 'Quản trị viên'} đã thêm ${addedNames.join(', ')} vào nhóm`
        : `${currentUser?.name || 'Quản trị viên'} đã tạo nhóm`;
      const systemMessage = {
        id: `system-create-${Date.now()}`,
        type: 'system',
        action: addedNames.length > 0 ? 'member_added' : 'group_created',
        senderId: actorId,
        senderName: currentUser?.name,
        targetIds: groupMemberIds,
        text: systemText,
        time: getTimeString(),
        createdAt: new Date().toISOString(),
      };
      if (chatMode === 'tinode') {
        await ensureTinodeSession();
        const resolvedMemberIds = await Promise.all(groupMemberIds.map(memberId => tinodeClient.resolveUserTopic(
          groupMemberProfiles[memberId] || findAccount(directoryAccounts, memberId) || { uid: memberId },
        )));
        room = await tinodeClient.createGroup({
          name,
          description: groupDescription.trim(),
          memberIds: resolvedMemberIds,
          avatarFile: groupAvatarFile,
        });
        await tinodeClient.sendSystemEvent(room.id, {
          action: addedNames.length > 0 ? 'member_added' : 'group_created',
          actorId,
          actorName: currentUser?.name,
          targets: resolvedMemberIds.map((id, index) => ({ id, name: addedNames[index] })),
        });
        const tinodeTopic = room.id;
        const managedRoom = await chatManagementService.createConversation({
          userId: actorId,
          subject: name,
          isGroup: true,
          participantIds: groupMemberIds,
          tinodeTopic,
          properties: {
            description: groupDescription.trim(),
            members: [currentUser, ...groupMemberIds.map(id => groupMemberProfiles[id] || findAccount(directoryAccounts, id)).filter(Boolean)],
          },
        }).catch(() => null);
        if (managedRoom) room = { ...room, ...managedRoom, tinodeTopic, messages: room.messages || [] };
      } else {
        let group = saveDemoGroup({
          name,
          description: groupDescription.trim(),
          ownerId: actorId,
          memberIds: groupMemberIds,
        });
        group = appendDemoGroupMessage(group.id, systemMessage);
        room = demoGroupToConversation(group, directoryAccounts, actorId);
      }
      const safeRoom = normalizeTinodeConversation(room);
      setConversations(prev => ({ ...prev, [safeRoom.id]: safeRoom }));
      setCurrentChatId(safeRoom.id);
      setInputText('');
      setIsCreateGroupOpen(false);
      setGroupName('');
      setGroupDescription('');
      setGroupAvatarFile(null);
      setGroupAvatarPreview('');
      setGroupMemberIds([]);
      setGroupMemberProfiles({});
      setGroupMemberSearch('');
      setGroupSearchResults([]);
    } catch (err) {
      setChatError(err?.message || 'Không thể tạo nhóm.');
    } finally {
      createGroupRequestRef.current = false;
      setIsCreatingGroup(false);
    }
  };

  const handleGroupAvatarChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setChatError('Ảnh nhóm phải là file hình ảnh.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setChatError('Ảnh nhóm không được vượt quá 10 MB.');
      return;
    }
    setChatError('');
    setGroupAvatarFile(file);
    setGroupAvatarPreview(URL.createObjectURL(file));
  };

  const closeCreateGroupModal = () => {
    if (isCreatingGroup) return;
    setIsCreateGroupOpen(false);
    setGroupName('');
    setGroupDescription('');
    setGroupAvatarFile(null);
    setGroupAvatarPreview('');
    setGroupMemberIds([]);
    setGroupMemberProfiles({});
    setGroupMemberSearch('');
    setGroupSearchResults([]);
  };

  const openAddMembers = () => {
    setGroupMemberIds([]);
    setGroupMemberProfiles({});
    setGroupMemberSearch('');
    setGroupSearchResults([]);
    setChatError('');
    setIsAddMembersOpen(true);
  };

  const handleAddMembers = async (event) => {
    event.preventDefault();
    if (!activeChat.isGroup || groupMemberIds.length === 0 || addMembersRequestRef.current) return;
    addMembersRequestRef.current = true;
    setIsAddingMembers(true);
    setChatError('');
    try {
      const actorId = currentUser?.id || currentUser?.uid;
      const addedNames = groupMemberIds.map(memberId =>
        groupMemberProfiles[memberId]?.name || findAccount(directoryAccounts, memberId)?.name || memberId
      );
      const systemText = `${currentUser?.name || 'Quản trị viên'} đã thêm ${addedNames.join(', ')} vào nhóm`;
      const systemMessage = {
        id: `system-add-${Date.now()}`,
        type: 'system',
        action: 'member_added',
        senderId: actorId,
        senderName: currentUser?.name,
        targetIds: groupMemberIds,
        text: systemText,
        time: getTimeString(),
        createdAt: new Date().toISOString(),
      };
      let updatedRoom;
      if (chatMode === 'tinode') {
        const topicName = await ensureTinodeConversationTopic(activeChat);
        const resolvedMemberIds = await Promise.all(groupMemberIds.map(memberId => tinodeClient.resolveUserTopic(
          groupMemberProfiles[memberId] || findAccount(directoryAccounts, memberId) || { uid: memberId },
        )));
        for (const uid of resolvedMemberIds) {
          updatedRoom = await tinodeClient.addMember(topicName, uid);
        }
        await tinodeClient.sendSystemEvent(topicName, {
          action: 'member_added',
          actorId,
          actorName: currentUser?.name,
          targets: resolvedMemberIds.map((id, index) => ({ id, name: addedNames[index] })),
        });
        updatedRoom = {
          ...normalizeTinodeConversation(updatedRoom || activeChat),
          id: activeChat.id,
          managementId: activeChat.managementId || activeChat.id,
          tinodeTopic: topicName,
        };
        const mergedMessages = [...(activeChat.messages || []), ...(updatedRoom.messages || [])]
          .filter((message, index, all) => all.findIndex(item => item.id === message.id) === index)
          .sort((a, b) => (a.seq || 0) - (b.seq || 0));
        updatedRoom = { ...updatedRoom, messages: mergedMessages };
      } else {
        const existingIds = activeChat.members
          .map(member => findAccount(directoryAccounts, member.id || member.name)?.id)
          .filter(Boolean);
        const storedMessages = (activeChat.messages || []).map(message => {
          const sender = findAccount(directoryAccounts, message.senderId || message.senderName);
          return {
            ...message,
            senderId: message.senderId || sender?.id || (message.sender === 'outgoing' ? actorId : undefined),
            senderName: sender?.name || message.senderName,
            avatar: sender?.avatar || message.avatar,
            createdAt: message.createdAt || new Date().toISOString(),
          };
        });
        saveDemoGroup({
          id: activeChat.id,
          name: activeChat.name,
          description: activeChat.description,
          ownerId: findAccount(directoryAccounts, activeChat.admin)?.id || currentUser?.id || currentUser?.uid,
          memberIds: existingIds,
          messages: storedMessages,
        });
        const group = addDemoGroupMembers(activeChat.id, groupMemberIds);
        const groupWithEvent = appendDemoGroupMessage(group.id, systemMessage);
        updatedRoom = demoGroupToConversation(groupWithEvent, directoryAccounts, actorId);
      }
      setConversations(prev => ({ ...prev, [updatedRoom.id]: { ...prev[updatedRoom.id], ...updatedRoom } }));
      setIsAddMembersOpen(false);
      setGroupMemberIds([]);
      setGroupMemberProfiles({});
      setGroupMemberSearch('');
      setGroupSearchResults([]);
    } catch (err) {
      setChatError(err?.message || 'Không thể thêm thành viên vào nhóm.');
    } finally {
      addMembersRequestRef.current = false;
      setIsAddingMembers(false);
    }
  };

  const handleRemoveGroupMember = async (member) => {
    if (!activeChat.isGroup || !member?.id || !isCurrentUserGroupAdmin || removingMemberId) return;
    if (member.id === viewerId || member.id === activeAdminId) return;
    if (!window.confirm(`Bạn có chắc muốn xóa ${member.name} khỏi nhóm "${activeChat.name}"?`)) return;

    setRemovingMemberId(member.id);
    setChatError('');
    try {
      const event = {
        action: 'member_removed',
        actorId: viewerId,
        actorName: currentUser?.name,
        targets: [{ id: member.id, name: member.name }],
      };
      let updatedRoom;
      if (chatMode === 'tinode') {
        const topicName = await ensureTinodeConversationTopic(activeChat);
        await tinodeClient.removeMember(topicName, member.id);
        await tinodeClient.sendSystemEvent(topicName, event);
        updatedRoom = {
          ...normalizeTinodeConversation(await tinodeClient.openConversation(topicName)),
          id: activeChat.id,
          managementId: activeChat.managementId || activeChat.id,
          tinodeTopic: topicName,
        };
      } else {
        const systemMessage = {
          id: `system-remove-${Date.now()}`,
          type: 'system',
          ...event,
          senderId: viewerId,
          senderName: currentUser?.name,
          targetIds: [member.id],
          text: `${currentUser?.name || 'Quản trị viên'} đã xóa ${member.name} khỏi nhóm`,
          time: getTimeString(),
          createdAt: new Date().toISOString(),
        };
        const group = removeDemoGroupMember(activeChat.id, member.id, viewerId);
        const groupWithEvent = appendDemoGroupMessage(group.id, systemMessage);
        updatedRoom = demoGroupToConversation(groupWithEvent, directoryAccounts, viewerId);
      }
      setConversations(previous => ({
        ...previous,
        [updatedRoom.id]: mergeTinodeConversation(previous[updatedRoom.id], updatedRoom),
      }));
    } catch (error) {
      setChatError(error?.message || 'Không thể xóa thành viên khỏi nhóm.');
    } finally {
      setRemovingMemberId('');
    }
  };

  const persistDemoGroupMessage = (room, message) => {
    if (chatMode !== 'demo' || !room?.isGroup) return;
    const viewerId = currentUser?.id || currentUser?.uid;
    const toStoredMessage = item => {
      const senderAccount = findAccount(directoryAccounts, item.senderId || item.senderName);
      return {
        ...item,
        senderId: item.senderId || senderAccount?.id || (item.sender === 'outgoing' ? viewerId : undefined),
        senderName: senderAccount?.name || item.senderName || currentUser?.name,
        avatar: senderAccount?.avatar || item.avatar || currentUser?.avatar,
        createdAt: item.createdAt || new Date().toISOString(),
      };
    };
    const memberIds = [...new Set([
      viewerId,
      ...room.members.map(member => findAccount(directoryAccounts, member.id || member.name)?.id || member.id),
    ].filter(Boolean))];
    saveDemoGroup({
      id: room.id,
      name: room.name,
      description: room.description,
      ownerId: findAccount(directoryAccounts, room.admin)?.id || viewerId,
      memberIds,
      messages: (room.messages || []).map(toStoredMessage),
    });
    appendDemoGroupMessage(room.id, toStoredMessage(message));
  };

  const persistDemoDirectMessage = (room, message) => {
    if (chatMode !== 'demo' || room?.isGroup) return;
    const viewerId = currentUser?.id || currentUser?.uid;
    const participantIds = room?.participantIds?.length === 2
      ? room.participantIds
      : [viewerId, ...((room?.members || []).map(member => findAccount(directoryAccounts, member.id || member.name)?.id || member.id))]
        .filter(Boolean)
        .slice(0, 2);
    if (participantIds.length !== 2) return;
    const directId = directConversationId(...participantIds);
    const toStoredMessage = item => {
      const sender = findAccount(directoryAccounts, item.senderId || item.senderName);
      return {
        ...item,
        senderId: item.senderId || sender?.id || (item.sender === 'outgoing' ? viewerId : undefined),
        senderName: sender?.name || item.senderName,
        avatar: sender?.avatar || item.avatar,
        createdAt: item.createdAt || new Date().toISOString(),
      };
    };
    saveDemoDirect({
      id: directId,
      participantIds,
      messages: (room.messages || []).map(toStoredMessage),
    });
    if (message) appendDemoDirectMessage(directId, toStoredMessage(message));
  };

  // --- Attach & Gửi tệp tin ---
  const handleAttachClick = () => {
    if (activeChat.isChatbot) {
      setChatError('Trợ lý AI hiện chỉ nhận tin nhắn văn bản.');
      return;
    }
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name;
    const fileSize = file.size;
    
    // Định dạng kích thước tệp
    let sizeStr = "";
    if (fileSize > 1024 * 1024) {
      sizeStr = (fileSize / (1024 * 1024)).toFixed(2) + " MB";
    } else {
      sizeStr = (fileSize / 1024).toFixed(1) + " KB";
    }

    // Phân loại mở rộng file
    const extension = fileName.split('.').pop().toLowerCase();
    let extType = "file";
    let displayExt = extension.toUpperCase();
    if (extension === "pdf") {
      extType = "pdf";
    } else if (["xlsx", "xls", "csv"].includes(extension)) {
      extType = "excel";
    }

    const timeStr = getTimeString();
    const createdAt = new Date().toISOString();
    const newMsg = {
      id: `me-file-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: "file",
      sender: "outgoing",
      senderId: currentUser?.id || currentUser?.uid,
      senderName: currentUser?.name,
      avatar: currentUser?.avatar,
      file: {
        name: fileName,
        ext: extType,
        size: `${displayExt} • ${sizeStr}`
      },
      time: timeStr,
      createdAt,
      pending: chatMode === 'tinode',
    };

    // 1. Thêm vào conversations state
    setConversations(prev => {
      const room = prev[currentChatId];
      return {
        ...prev,
        [currentChatId]: {
          ...room,
          messages: [...room.messages, newMsg],
          lastMsg: `Bạn: <đính kèm ${fileName}>`,
          time: timeStr,
          updatedAt: createdAt,
        }
      };
    });

    try {
      const room = conversations[currentChatId];
      if (room?.isGroup) persistDemoGroupMessage(room, newMsg);
      else persistDemoDirectMessage(room, newMsg);
    } catch (err) {
      setChatError(err?.message || 'Không thể lưu tệp trong lịch sử nhóm.');
    }

    // Reset file input
    e.target.value = "";

    if (chatMode === 'tinode') {
      const roomId = currentChatId;
      const room = conversations[roomId];
      ensureTinodeConversationTopic(room)
        .then(async topicName => {
          const result = await tinodeClient.sendFile(topicName, file, newMsg.id);
          const confirmedMessage = {
            ...newMsg,
            pending: false,
            failed: false,
            file: {
              ...newMsg.file,
              url: result.file.url,
              mime: result.file.mime,
            },
          };
          setConversations(previous => {
            const currentRoom = previous[roomId];
            if (!currentRoom) return previous;
            return {
              ...previous,
              [roomId]: {
                ...currentRoom,
                messages: (currentRoom.messages || []).map(message => message.id === newMsg.id ? confirmedMessage : message),
              },
            };
          });
          queueMessageForKnowledge(room, confirmedMessage, file);
        })
        .catch(err => {
          setConversations(previous => {
            const currentRoom = previous[roomId];
            if (!currentRoom) return previous;
            return {
              ...previous,
              [roomId]: {
                ...currentRoom,
                messages: (currentRoom.messages || []).map(message => message.id === newMsg.id
                  ? { ...message, pending: false, failed: true }
                  : message),
              },
            };
          });
        setChatError(err?.message || 'Không thể tải tệp lên Tinode.');
      });
    }
  };

  const handleFileDownload = async (file) => {
    if (!file?.url) return;
    try {
      if (chatMode === 'tinode') {
        await tinodeClient.downloadFile(file);
      } else {
        window.open(file.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      setChatError(err?.message || 'Không thể tải file đính kèm.');
    }
  };


  const getTimeString = () => {
    const d = new Date();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const updateCurrentDraft = (value) => {
    setInputText(value);
    setDrafts(prev => {
      const next = { ...prev };
      if (value) next[currentChatId] = value;
      else delete next[currentChatId];
      return next;
    });
    const room = conversations[currentChatId];
    if (chatMode === 'tinode' && value.trim() && room && !room.isChatbot) {
      const topicKey = tinodeTopicName(room);
      const now = Date.now();
      const lastNotice = typingNoticeAtRef.current.get(topicKey) || 0;
      if (now - lastNotice >= 1200) {
        typingNoticeAtRef.current.set(topicKey, now);
        ensureTinodeConversationTopic(room)
          .then(topicName => tinodeClient.sendTyping(topicName))
          .catch(() => {});
      }
    }
  };

  const messageActionKey = (roomId, messageId) => `${roomId}:${messageId}`;

  const saveMessageAction = (message, patch) => {
    if (!message?.id || !currentChatId) return;
    const key = messageActionKey(currentChatId, message.id);
    setMessageActions(previous => {
      const next = { ...previous, [key]: { ...(previous[key] || {}), ...patch } };
      try {
        window.localStorage.setItem(`songhong.message-actions.${viewerId}`, JSON.stringify(next));
      } catch {
        // Local storage is optional; the current view still updates.
      }
      return next;
    });
  };

  const persistMessagePatch = (message, patch) => {
    if (chatMode !== 'demo' || !message?.id) return;
    if (activeChat.isGroup) updateDemoGroupMessage(activeChat.id, message.id, patch);
    else updateDemoDirectMessage(activeChat.id, message.id, patch);
  };

  const updateMessageInView = (message, patch) => {
    setConversations(previous => ({
      ...previous,
      [activeChat.id]: {
        ...previous[activeChat.id],
        messages: (previous[activeChat.id]?.messages || []).map(item => item.id === message.id
          ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) }
          : item),
      },
    }));
  };

  const openMessageMenu = (event, message) => {
    if (!message || ['system', 'friend_event'].includes(message.type)) return;
    event.preventDefault();
    const width = 245;
    const height = 360;
    setMessageMenu({
      message,
      left: Math.min(event.clientX, window.innerWidth - width - 12),
      top: Math.min(event.clientY, window.innerHeight - height - 12),
    });
  };

  const applyMessagePatch = (message, patch) => {
    updateMessageInView(message, patch);
    persistMessagePatch(message, patch);
  };

  const handleMessageAction = async (action, message, emoji = '👍') => {
    setMessageMenu(null);
    if (!message) return;
    const isOwnMessage = message.senderId === viewerId || message.sender === 'outgoing';
    try {
      if (action === 'copy') {
        await navigator.clipboard?.writeText(message.text || message.file?.name || '');
        return;
      }
      if (action === 'reply') {
        if (message.recalled) return;
        setReplyingTo({ id: message.id, text: message.text || message.file?.name || 'Tệp đính kèm', senderName: message.senderName || (isOwnMessage ? 'Bạn' : 'Thành viên') });
        requestAnimationFrame(() => messageInputRef.current?.focus());
        return;
      }
      if (action === 'detail') {
        setMessageDetails(message);
        return;
      }
      if (action === 'mark') {
        const key = messageActionKey(activeChat.id, message.id);
        saveMessageAction(message, { marked: !messageActions[key]?.marked });
        return;
      }
      if (action === 'reaction') {
        const key = messageActionKey(activeChat.id, message.id);
        const current = messageActions[key]?.reactions || {};
        const active = !current[emoji];
        const nextReactions = { ...current, [emoji]: active ? 1 : 0 };
        if (chatMode === 'tinode') {
          const topicName = await ensureTinodeConversationTopic(activeChat);
          await tinodeClient.sendReaction(topicName, message.id, emoji, active);
        }
        saveMessageAction(message, { reactions: nextReactions });
        applyMessagePatch(message, { reactions: nextReactions });
        return;
      }
      if (action === 'hide') {
        saveMessageAction(message, { hidden: true });
        return;
      }
      if (action === 'recall') {
        if (!isOwnMessage) return;
        if (chatMode === 'tinode') {
          const topicName = await ensureTinodeConversationTopic(activeChat);
          await tinodeClient.recallMessage(topicName, message);
        }
        const recalled = { text: 'Tin nhắn đã được thu hồi', type: 'text', recalled: true, file: undefined, image: undefined };
        applyMessagePatch(message, recalled);
        return;
      }
      if (action === 'share') {
        setShareMessage(message);
      }
    } catch (error) {
      setChatError(error?.message || 'Không thể thực hiện thao tác với tin nhắn.');
    }
  };

  const shareMessageTo = async target => {
    if (!shareMessage || !target || target.id === activeChat.id) return;
    const text = `↪ ${shareMessage.senderName || (shareMessage.sender === 'outgoing' ? 'Bạn' : 'Thành viên')}: ${shareMessage.text || shareMessage.file?.name || 'Tệp đính kèm'}`;
    const shared = {
      id: `shared-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'text', sender: 'outgoing', senderId: viewerId, senderName: currentUser?.name,
      avatar: currentUser?.avatar, text, sharedFrom: shareMessage.id,
      time: getTimeString(), createdAt: new Date().toISOString(),
    };
    if (chatMode === 'tinode') {
      const topicName = await ensureTinodeConversationTopic(target);
      await tinodeClient.sendText(topicName, text, shared.id, { sharedFrom: shareMessage.id });
    }
    else if (target.isGroup) persistDemoGroupMessage(target, shared);
    else persistDemoDirectMessage(target, shared);
    setConversations(previous => ({
      ...previous,
      [target.id]: { ...previous[target.id], messages: [...(previous[target.id]?.messages || []), shared], lastMsg: `Bạn: ${text}`, time: shared.time, updatedAt: shared.createdAt },
    }));
    setShareMessage(null);
  };

  // --- Send Message Action ---
  const handleSendMessage = async (textToSend = null) => {
    const text = textToSend !== null ? textToSend : inputText.trim();
    if (!text || (activeChat.isChatbot && isTyping)) return;

    const timeStr = getTimeString();
    const createdAt = new Date().toISOString();
    const replyMeta = replyingTo ? { ...replyingTo } : null;
    const newMsg = {
      id: `me-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: "text",
      sender: "outgoing",
      senderId: currentUser?.id || currentUser?.uid,
      senderName: currentUser?.name,
      avatar: currentUser?.avatar,
      text: text,
      replyTo: replyMeta,
      time: timeStr,
      createdAt,
      pending: chatMode === 'tinode',
    };

    // 1. Cập nhật state tin nhắn gửi đi
    setConversations(prev => {
      const room = prev[currentChatId];
      return {
        ...prev,
        [currentChatId]: {
          ...room,
          messages: [...room.messages, newMsg],
          lastMsg: `Bạn: ${text}`,
          time: timeStr,
          updatedAt: new Date().toISOString(),
        }
      };
    });

    try {
      const room = conversations[currentChatId];
      if (room?.isChatbot) saveChatbotMessage(currentUser?.id || currentUser?.uid, newMsg);
      else if (room?.isGroup) persistDemoGroupMessage(room, newMsg);
      else persistDemoDirectMessage(room, newMsg);
    } catch (err) {
      setChatError(err?.message || 'Không thể lưu lịch sử tin nhắn nhóm.');
    }

    setInputText("");
    setReplyingTo(null);
    setDrafts(prev => {
      const next = { ...prev };
      delete next[currentChatId];
      return next;
    });
    const room = conversations[currentChatId];
    if (room?.isChatbot) {
      setIsTyping(true);
      try {
        const response = await requestChatbotReply({
          message: text,
          messageId: newMsg.id,
          conversationId: room.id,
          user: currentUser,
          history: (room.messages || [])
            .filter(item => item.type === 'text' && item.text)
            .slice(-10)
            .map(item => ({
              role: item.sender === 'outgoing' ? 'user' : 'assistant',
              content: item.text,
            })),
        });
        const replyCreatedAt = new Date().toISOString();
        const botMessage = {
          id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'text',
          sender: 'incoming',
          senderId: CHATBOT_ACCOUNT.id,
          senderName: CHATBOT_ACCOUNT.name,
          avatar: CHATBOT_ACCOUNT.avatar,
          text: response.text,
          time: getTimeString(),
          createdAt: replyCreatedAt,
          source: response.source,
          sources: response.sources,
          grounded: response.grounded,
        };
        saveChatbotMessage(currentUser?.id || currentUser?.uid, botMessage);
        setConversations(prev => {
          const chatbotRoom = prev[room.id];
          if (!chatbotRoom) return prev;
          return {
            ...prev,
            [room.id]: {
              ...chatbotRoom,
              messages: [...chatbotRoom.messages, botMessage],
              lastMsg: `${CHATBOT_ACCOUNT.name}: ${botMessage.text}`,
              time: botMessage.time,
              updatedAt: replyCreatedAt,
              badge: currentChatIdRef.current === room.id ? 0 : (chatbotRoom.badge || 0) + 1,
            },
          };
        });
      } catch (err) {
        setChatError(err?.message || 'Trợ lý AI chưa thể phản hồi. Vui lòng thử lại.');
      } finally {
        setIsTyping(false);
      }
      return;
    }

    setIsTyping(false);

    if (chatMode === 'tinode') {
      ensureTinodeConversationTopic(conversations[currentChatId])
        .then(async topicName => {
          await tinodeClient.sendText(topicName, text, newMsg.id, replyMeta ? { replyTo: replyMeta } : {});
          queueMessageForKnowledge(conversations[currentChatId], newMsg);
        })
        .catch(err => {
        setChatError(err?.message || 'Không thể gửi tin nhắn.');
      });
    }
  };

  // Helper render text with simple bold/italic markdown
  const renderMessageText = (text) => {
    if (!text) return "";
    // simple parse bold: **text**
    let parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      }
      // parse line breaks
      let subparts = part.split('\n');
      return subparts.map((sub, sidx) => (
        <span key={`${idx}-${sidx}`}>
          {sub}
          {sidx < subparts.length - 1 && <br />}
        </span>
      ));
    });
  };

  // Filter conversations
  const filteredChatIds = Object.keys(conversations)
    .filter(id => !isSelfDirectConversation(conversations[id], currentUser, directoryAccounts))
    .filter(id => !isConversationHiddenAfterDelete(conversations[id]))
    .filter(id => shouldShowInConversationList(conversations[id]))
    .filter(id => conversations[id].name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((firstId, secondId) => {
      const firstTimestamp = conversationTimestamp(conversations[firstId]);
      const secondTimestamp = conversationTimestamp(conversations[secondId]);
      return secondTimestamp - firstTimestamp;
    });

  const conversationMembers = Object.values(conversations)
    .flatMap(room => room.members || [])
    .map(member => {
      const account = findAccount(directoryAccounts, member.id || member.name);
      return account ? { ...member, ...account, id: account.id, name: account.name } : member;
    });

  const availableMembers = [...directoryAccounts.filter(account => account.active !== false), ...conversationMembers]
    .filter((member, index, all) => member?.name && all.findIndex(item => (item.id || item.name) === (member.id || member.name)) === index)
    .filter(member => member.type !== 'bot')
    .filter(member => member.id !== (currentUser?.id || currentUser?.uid));

  const candidateSource = chatMode === 'tinode'
    ? groupSearchResults
    : groupMemberSearch.trim().length >= 2 ? groupSearchResults : availableMembers;
  const existingMemberIds = isAddMembersOpen
    ? activeChat.members.flatMap(member => {
      const account = findAccount(directoryAccounts, member.id || member.name);
      return [member.id, member.name, account?.id].filter(Boolean);
    })
    : [];
  const groupCandidates = candidateSource
    .filter((member, index, all) => member?.name && all.findIndex(item => (item.id || item.name) === (member.id || member.name)) === index)
    .filter(member => !existingMemberIds.includes(member.id) && !existingMemberIds.includes(member.name));

  const sharedFiles = Object.values(conversations)
    .filter(room => canAccessRoomFiles(room, currentUser, directoryAccounts, chatMode))
    .flatMap(room => (room.messages || [])
    .filter(message => message.type === 'file' || message.type === 'image')
    .map(message => ({ ...message, roomName: room.name, roomId: room.id })));

  const notifications = Object.values(conversations)
    .filter(room => !isSelfDirectConversation(room, currentUser, directoryAccounts))
    .filter(room => !isConversationHiddenAfterDelete(room))
    .filter(shouldShowInConversationList)
    .filter(room => room.lastMsg || room.badge > 0)
    .sort((a, b) => conversationTimestamp(b) - conversationTimestamp(a))
    .slice(0, 20);

  const friendshipRecords = collectFriendshipRecords(conversations, viewerId);
  const friendContacts = acceptedFriendContacts(friendshipRecords, viewerId, directoryAccounts);
  const friendNotifications = friendshipRecords.filter(record => (
    record.event.recipientId === viewerId
    || (record.event.requesterId === viewerId && Boolean(record.response))
  ));
  const pendingIncomingFriendRequests = friendNotifications.filter(record => (
    record.event.recipientId === viewerId && !record.response
  ));
  const notificationBadgeCount = Object.values(conversations).filter(room => room.badge > 0 && shouldShowInConversationList(room)).length
    + pendingIncomingFriendRequests.length;

  const visibleMessages = activeChat.messages.filter(message => {
    if (messageActions[messageActionKey(activeChat.id, message.id)]?.hidden) return false;
    if (!messageSearchQuery.trim()) return true;
    return `${message.text || ''} ${message.senderName || ''}`.toLowerCase().includes(messageSearchQuery.toLowerCase());
  });

  const deliveryStatusIcon = message => {
    if (message.failed || message.deliveryStatus === 'failed') {
      return <i className="fa-solid fa-circle-exclamation read-status failed" title="Gửi thất bại"></i>;
    }
    if (message.pending || message.deliveryStatus === 'sending') {
      return <i className="fa-solid fa-spinner fa-spin read-status pending" title="Đang gửi"></i>;
    }
    if (message.deliveryStatus === 'read') {
      return <i className="fa-solid fa-check-double read-status read" title="Đã xem"></i>;
    }
    if (message.deliveryStatus === 'received') {
      return <i className="fa-solid fa-check-double read-status received" title="Đã nhận"></i>;
    }
    return <i className="fa-solid fa-check read-status sent" title="Đã gửi"></i>;
  };
  const activeRemoteTyping = chatMode === 'tinode' && !activeChat.isChatbot
    ? typingByTopic[tinodeTopicName(activeChat)]
    : null;

  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className={`app-layout ${isMobileChatActive ? 'mobile-active-chat' : ''}`}>
      {(chatError || chatMode === 'tinode' && ['connecting', 'offline'].includes(connectionStatus)) && (
        <div className={`chat-system-banner ${chatError ? 'error' : 'info'}`} role="status">
          <i className={`fa-solid ${chatError ? 'fa-triangle-exclamation' : 'fa-circle-info'}`}></i>
          <span>{chatError || 'Đang kết nối Tinode...'}</span>
          {chatError && <button type="button" onClick={() => setChatError('')} aria-label="Đóng thông báo"><i className="fa-solid fa-xmark"></i></button>}
        </div>
      )}

      {/* ==========================================================================
         CỘT 1: SIDEBAR PRIMARY (Màu xanh dương đậm)
         ========================================================================== */}
      <aside className={`sidebar-primary ${isPrimarySidebarCollapsed ? 'collapsed' : ''} ${isMobileSidebarOpen ? 'open' : ''}`}>
        <button
          type="button"
          className="sidebar-collapse-toggle"
          onClick={() => setIsPrimarySidebarCollapsed(previous => !previous)}
          aria-label={isPrimarySidebarCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          aria-pressed={isPrimarySidebarCollapsed}
          title={isPrimarySidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
        >
          <i className={`fa-solid ${isPrimarySidebarCollapsed ? 'fa-angle-right' : 'fa-angle-left'}`}></i>
        </button>
        <div className="brand-container">
          <div className="brand-logo">
            <img src="/chat-logo.svg" className="brand-mark-image" alt="" aria-hidden="true" />
          </div>
          <h1 className="brand-name">CHAT</h1>
        </div>

        <nav className="primary-nav">
          <a href="#" className={`nav-item ${!workspacePanel ? 'active' : ''}`} data-tooltip="Chat" onClick={(e) => { e.preventDefault(); setWorkspacePanel(null); }}>
            <i className="fa-solid fa-comment-dots"></i>
            <span>Chat</span>
          </a>
          <a href="#" className={`nav-item ${workspacePanel === 'contacts' ? 'active' : ''}`} data-tooltip="Danh bạ" onClick={(e) => { e.preventDefault(); openWorkspacePanel('contacts'); }}>
            <i className="fa-solid fa-address-book"></i>
            <span>Danh bạ</span>
          </a>
          <a href="#" className="nav-item" data-tooltip="Nhóm" onClick={(e) => { e.preventDefault(); setIsCreateGroupOpen(true); }}>
            <i className="fa-solid fa-users"></i>
            <span>Nhóm</span>
          </a>
          <a href="#" className={`nav-item ${workspacePanel === 'files' ? 'active' : ''}`} data-tooltip="File dùng chung" onClick={(e) => { e.preventDefault(); openWorkspacePanel('files'); }}>
            <i className="fa-solid fa-folder-open"></i>
            <span>File dùng chung</span>
          </a>
          {isKnowledgeAdmin && <a href="#" className={`nav-item ${workspacePanel === 'knowledge' ? 'active' : ''}`} data-tooltip="Tri thức AI" onClick={(e) => { e.preventDefault(); openWorkspacePanel('knowledge'); }}>
            <i className="fa-solid fa-brain"></i>
            <span>Tri thức AI</span>
          </a>}
          <a href="#" className={`nav-item ${workspacePanel === 'notifications' ? 'active' : ''}`} data-tooltip="Thông báo" onClick={(e) => { e.preventDefault(); openWorkspacePanel('notifications'); }}>
            <div className="icon-badge-wrapper">
              <i className="fa-solid fa-bell"></i>
              {notificationBadgeCount > 0 && <span className="badge-count">{notificationBadgeCount}</span>}
            </div>
            <span>Thông báo</span>
          </a>
          <a href="#" className={`nav-item ${workspacePanel === 'settings' ? 'active' : ''}`} data-tooltip="Cài đặt" onClick={(e) => { e.preventDefault(); openWorkspacePanel('settings'); }}>
            <i className="fa-solid fa-gear"></i>
            <span>Cài đặt</span>
          </a>
        </nav>

        <div className="primary-footer">
          <div className="user-profile" data-tooltip="Hồ sơ cá nhân" role="button" tabIndex="0" onClick={() => openWorkspacePanel('profile')} onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') openWorkspacePanel('profile');
          }}>
            <SafeAvatar src={currentUser?.avatar} name={currentUser?.name} className="user-avatar-img" />
            <div className="user-info">
              <span className="user-name">{currentUser?.name || "Mai Thành Lâm"}</span>
              <span className="user-status online">Online</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ==========================================================================
         CỘT 2: SIDEBAR SECONDARY (Danh sách chat)
         ========================================================================== */}
      <aside className="sidebar-secondary">
        <div className="sidebar-header">
          <div className="header-top">
            <h2>Cuộc trò chuyện</h2>
            <button className="btn-action" title="Tạo nhóm mới" onClick={() => setIsCreateGroupOpen(true)}>
              <i className="fa-solid fa-plus"></i>
            </button>
          </div>
          <div className="search-box">
            <i className="fa-solid fa-magnifying-glass search-icon"></i>
            <input
              type="text"
              ref={messageInputRef}
              placeholder="Tìm kiếm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="conversations-list">
          {filteredChatIds.map(id => {
            const room = conversations[id];
            const isActive = currentChatId === id;
            const draft = drafts[id] || '';
            const hasDraft = Boolean(draft.trim());
            return (
              <div
                key={id}
                className={`conversation-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  handleConversationSelect(id);
                }}
              >
                <div className={`conv-avatar ${room.avatarClass || ''}`}>
                  <ConversationAvatar room={room} />
                </div>
                <div className="conv-details">
                  <div className="conv-header">
                    <span className="conv-name">{room.name}</span>
                    <span className={hasDraft ? 'conv-draft-status' : 'conv-time'}>{hasDraft ? 'Chưa gửi' : room.time}</span>
                  </div>
                  <div className="conv-message">
                    <span className={`conv-last-msg ${hasDraft ? 'draft' : ''}`}>{hasDraft ? draft : room.lastMsg}</span>
                    {room.badge > 0 && <span className="conv-badge">{room.badge}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ==========================================================================
         CỘT 3: CHAT MAIN AREA (Khung chat chính)
         ========================================================================== */}
      <section className="chat-main">
        {/* Header khung chat */}
        <div className="chat-main-header">
          <div className="chat-header-info">
            <button className="btn-back-mobile" onClick={() => setIsMobileChatActive(false)}>
              <i className="fa-solid fa-arrow-left"></i>
            </button>
            <div className={`chat-header-avatar ${activeChat.avatarClass || ''}`}>
              <ConversationAvatar room={activeChat} />
            </div>
            <div className="chat-header-meta">
              <h2 className="chat-header-name">{activeChat.name}</h2>
              <span className="chat-header-status">{activeChat.membersCount}</span>
            </div>
          </div>
          <div className="chat-header-actions">
            <button className="btn-header-action" title="Tìm kiếm" onClick={() => openWorkspacePanel('search')}>
              <i className="fa-solid fa-magnifying-glass"></i>
            </button>
            <button className="btn-header-action" title="Gọi điện" onClick={() => setChatError('Gọi thoại cần bật WebRTC signaling trên Tinode/server. UI chat đã sẵn sàng để nối luồng gọi.')}>
              <i className="fa-solid fa-phone"></i>
            </button>
            <button className="btn-header-action" title="Gọi video" onClick={() => setChatError('Gọi video cần bật WebRTC signaling trên Tinode/server. UI chat đã sẵn sàng để nối luồng gọi.')}>
              <i className="fa-solid fa-video"></i>
            </button>
            <button className="btn-header-action" title="Thông tin nhóm" onClick={() => setIsDetailOpen(!isDetailOpen)}>
              <i className="fa-solid fa-ellipsis-vertical"></i>
            </button>
          </div>
        </div>

        {/* Khu vực hiển thị tin nhắn */}
        <div className="chat-messages">
          {currentChatId === "dieu-hanh" ? (
            <div className="date-divider"><span>Hôm nay, 11/07/2026</span></div>
          ) : (
            <div className="date-divider"><span>Hội thoại trực tuyến</span></div>
          )}

          {visibleMessages.map((msg) => {
            if (msg.type === 'system') {
              return (
                <div key={msg.id} className="group-system-message">
                  <i className={`fa-solid ${msg.action === 'member_left' ? 'fa-arrow-right-from-bracket' : msg.action === 'member_removed' ? 'fa-user-minus' : msg.action === 'group_created' ? 'fa-people-group' : 'fa-user-plus'}`}></i>
                  <span>{msg.text}</span>
                  <time>{msg.time}</time>
                </div>
              );
            }
            // Tinode can deliver an echo without the legacy `sender` field. In
            // that case the sender id is the source of truth; otherwise a
            // reply that Lâm sends can be rendered on the recipient side.
            const messageSenderId = msg.senderId || msg.raw?.from || msg.raw?.head?.['x-sender-id'];
            const isOutgoing = msg.sender === "outgoing"
              || Boolean(messageSenderId && viewerId && messageSenderId === viewerId)
              || Boolean(msg.pending && msg.senderId && msg.senderId === viewerId);
            const messageState = messageActions[messageActionKey(activeChat.id, msg.id)] || {};
            const reactions = { ...(msg.reactions || {}), ...(messageState.reactions || {}) };
            return (
              <div key={msg.id} className={`message-item ${isOutgoing ? 'outgoing' : 'incoming'}`}>
                {!isOutgoing && (
                  <div className="message-avatar">
                    <SafeAvatar src={msg.avatar || ''} name={msg.senderName} />
                  </div>
                )}

                <div className="message-content-wrapper">
                  {!isOutgoing && msg.senderName && <span className="sender-name">{msg.senderName}</span>}

                  <div className="message-interactive" onContextMenu={event => openMessageMenu(event, msg)}>
                    <div className="message-bubble-group">
                    {/* Tin nhắn chữ thường */}
                    {msg.type === "text" && msg.text && (
                      <div className="message-bubble">
                        {msg.replyTo && <div className="message-reply-preview"><strong>{msg.replyTo.senderName || 'Tin nhắn'}</strong><span>{msg.replyTo.text}</span></div>}
                        <p>{renderMessageText(msg.text)}</p>
                        {Object.entries(reactions).filter(([, count]) => count > 0).length > 0 && (
                          <div className="message-reactions">
                            {Object.entries(reactions).filter(([, count]) => count > 0).map(([emoji, count]) => <span key={emoji}>{emoji} {count}</span>)}
                          </div>
                        )}
                        {Array.isArray(msg.sources) && msg.sources.length > 0 && (
                          <div className="chatbot-sources">
                            {msg.sources.map((source, index) => (
                              <span key={`${source.document_id || source.title}-${index}`}>
                                <i className="fa-solid fa-book-open"></i>
                                {source.title || source.file_name || `Nguồn ${index + 1}`}
                              </span>
                            ))}
                          </div>
                        )}
                        <span className="message-time">
                          {messageState.marked && <i className="fa-solid fa-star message-marked" title="Đã đánh dấu"></i>} {msg.time} {isOutgoing && deliveryStatusIcon(msg)}
                        </span>
                      </div>
                    )}

                    {/* Tin nhắn file đính kèm */}
                    {msg.type === "file" && msg.file && (
                      <div
                        className={`message-bubble file-bubble ${msg.file.ext}`}
                        role={msg.file.url ? 'button' : undefined}
                        tabIndex={msg.file.url ? 0 : undefined}
                        title={msg.file.url ? 'Bấm để tải file' : undefined}
                        onClick={() => handleFileDownload(msg.file)}
                        onKeyDown={event => {
                          if (msg.file.url && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault();
                            handleFileDownload(msg.file);
                          }
                        }}
                      >
                        <div className={`file-icon-container ${msg.file.ext}`}>
                          {msg.file.ext === "pdf" ? <span className="file-ext-tag">PDF</span> : msg.file.ext === "excel" ? <i className="fa-solid fa-file-excel excel-icon"></i> : <i className="fa-solid fa-file-lines"></i>}
                        </div>
                        <div className="file-details">
                          <span className="file-name">{msg.file.name}</span>
                          <span className="file-info">{msg.file.size}</span>
                        </div>
                        <span className="message-time">
                          {msg.time} {isOutgoing && deliveryStatusIcon(msg)}
                        </span>
                      </div>
                    )}

                    {/* Tin nhắn hình ảnh */}
                    {msg.type === "image" && msg.image && (
                      <div className="message-bubble img-bubble">
                        <img src={msg.image} alt="Đính kèm" className="chat-attached-image" />
                        <span className="message-time">{msg.time} {isOutgoing && deliveryStatusIcon(msg)}</span>
                      </div>
                    )}
                    </div>
                    <button type="button" className="message-more-action" onClick={event => { event.stopPropagation(); openMessageMenu(event, msg); }} aria-label="Tùy chọn tin nhắn"><i className="fa-solid fa-ellipsis"></i></button>
                  </div>
                </div>
              </div>
            );
          })}

          {messageMenu && (() => {
            const menuMessage = messageMenu.message;
            const isOwnMessage = menuMessage.senderId === viewerId || menuMessage.sender === 'outgoing';
            const marked = messageActions[messageActionKey(activeChat.id, menuMessage.id)]?.marked;
            return (
              <div className="message-context-menu" style={{ left: messageMenu.left, top: messageMenu.top }} onClick={event => event.stopPropagation()}>
                {!menuMessage.recalled && <button type="button" onClick={() => handleMessageAction('reply', menuMessage)}><i className="fa-solid fa-reply"></i>Trả lời tin nhắn</button>}
                <button type="button" onClick={() => handleMessageAction('copy', menuMessage)}><i className="fa-regular fa-copy"></i>Copy tin nhắn</button>
                <button type="button" onClick={() => handleMessageAction('mark', menuMessage)}><i className={`fa-${marked ? 'solid' : 'regular'} fa-star`}></i>{marked ? 'Bỏ đánh dấu' : 'Đánh dấu tin nhắn'}</button>
                <button type="button" onClick={() => handleMessageAction('detail', menuMessage)}><i className="fa-solid fa-circle-info"></i>Xem chi tiết</button>
                <button type="button" onClick={() => handleMessageAction('share', menuMessage)}><i className="fa-solid fa-share"></i>Chia sẻ tin nhắn</button>
                <div className="message-reaction-row" aria-label="Thêm biểu cảm">
                  {['👍', '❤️', '😂', '😮', '😢'].map(emoji => <button type="button" key={emoji} onClick={() => handleMessageAction('reaction', menuMessage, emoji)}>{emoji}</button>)}
                </div>
                <button type="button" onClick={() => handleMessageAction('hide', menuMessage)}><i className="fa-solid fa-trash"></i>Xóa chỉ ở phía tôi</button>
                {isOwnMessage && <button type="button" className="danger" onClick={() => handleMessageAction('recall', menuMessage)}><i className="fa-solid fa-rotate-left"></i>Thu hồi tin nhắn</button>}
              </div>
            );
          })()}

          {activeRemoteTyping && (
            <div className="message-item incoming remote-typing-indicator">
              <div className="message-avatar"><SafeAvatar src={activeChat.members?.find(member => member.id === activeRemoteTyping.uid)?.avatar || ''} name={activeRemoteTyping.name} /></div>
              <div className="message-content-wrapper">
                <span className="sender-name">{activeRemoteTyping.name}</span>
                <div className="message-bubble chatbot-typing-bubble" aria-label={`${activeRemoteTyping.name} đang nhập`}>
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}

          {activeChat.isChatbot && isTyping && (
            <div className="message-item incoming chatbot-typing">
              <div className="message-avatar"><img src={CHATBOT_ACCOUNT.avatar} alt={CHATBOT_ACCOUNT.name} /></div>
              <div className="message-content-wrapper">
                <span className="sender-name">{CHATBOT_ACCOUNT.name}</span>
                <div className="message-bubble chatbot-typing-bubble" aria-label="Trợ lý đang trả lời">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}

          <div ref={chatMessagesEndRef} />
        </div>

        {/* Vùng gõ tin nhắn */}
        <div className="chat-main-input">
          {replyingTo && (
            <div className="replying-banner">
              <div><strong>Đang trả lời {replyingTo.senderName}</strong><span>{replyingTo.text}</span></div>
              <button type="button" onClick={() => setReplyingTo(null)} aria-label="Hủy trả lời"><i className="fa-solid fa-xmark"></i></button>
            </div>
          )}
          <div className="input-actions-left">
            <button className="btn-input-action" title="Đính kèm tệp" onClick={handleAttachClick}>
              <i className="fa-solid fa-paperclip"></i>
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: "none" }} 
              onChange={handleFileChange} 
            />
            <button className="btn-input-action" title="Biểu cảm" onClick={() => setShowEmojiPicker(prev => !prev)}>
              <i className="fa-regular fa-smile"></i>
            </button>
            {showEmojiPicker && (
              <div className="emoji-picker" role="listbox">
                {['😀', '😂', '😍', '👍', '👏', '🎉', '🙏', '🔥', '✅', '❤️'].map(emoji => <button type="button" key={emoji} onClick={() => { updateCurrentDraft(`${inputText}${emoji}`); setShowEmojiPicker(false); }}>{emoji}</button>)}
              </div>
            )}
          </div>
          <div className="input-text-container">
            <input
              type="text"
              placeholder="Nhập tin nhắn..."
              value={inputText}
              disabled={activeChat.isChatbot && isTyping}
              onChange={(e) => updateCurrentDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
          </div>
          <button className="btn-send-message-sh" disabled={activeChat.isChatbot && isTyping} onClick={() => handleSendMessage()}>{activeChat.isChatbot && isTyping ? 'Đang trả lời...' : 'Gửi'}</button>
        </div>
        {messageDetails && (
          <div className="message-details-modal" role="dialog">
            <div className="message-details-card">
              <div className="message-details-header"><strong>Chi tiết tin nhắn</strong><button type="button" onClick={() => setMessageDetails(null)}><i className="fa-solid fa-xmark"></i></button></div>
              <p><strong>Người gửi:</strong> {messageDetails.senderName || (messageDetails.sender === 'outgoing' ? 'Bạn' : 'Thành viên')}</p>
              <p><strong>Thời gian:</strong> {messageDetails.createdAt ? new Date(messageDetails.createdAt).toLocaleString('vi-VN') : messageDetails.time}</p>
              <p><strong>Nội dung:</strong> {messageDetails.text || messageDetails.file?.name || 'Tệp đính kèm'}</p>
            </div>
          </div>
        )}
        {shareMessage && (
          <div className="message-details-modal" role="dialog" onClick={() => setShareMessage(null)}>
            <div className="message-share-card" onClick={event => event.stopPropagation()}>
              <div className="message-details-header"><strong>Chia sẻ tin nhắn tới</strong><button type="button" onClick={() => setShareMessage(null)}><i className="fa-solid fa-xmark"></i></button></div>
              <div className="share-conversation-list">
                {Object.values(conversations).filter(room => room.id !== activeChat.id && !room.isChatbot).map(room => (
                  <button type="button" key={room.id} onClick={() => shareMessageTo(room)}><ConversationAvatar room={room} /><span>{room.name}</span></button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ==========================================================================
         CỘT 4: SIDEBAR DETAIL (Thông tin nhóm)
         ========================================================================== */}
      <aside className={`sidebar-detail ${isDetailOpen ? '' : 'collapsed'}`}>
        <div className="detail-header">
          <h3>{activeChat.isGroup ? "Thông tin nhóm" : "Thông tin cá nhân"}</h3>
          <button className="btn-close-detail" title="Đóng" onClick={() => setIsDetailOpen(false)}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="detail-content">
          <div className="group-identity">
            <div className={`group-avatar-large ${activeChat.avatarClass || ''}`}>
              <ConversationAvatar room={activeChat} />
            </div>
            <h3 className="group-name-large">{activeChat.name}</h3>
            <span className="group-members-count">{activeChat.membersCount}</span>
          </div>

          {activeChat.isGroup && (
            <div className="detail-section">
              <h4 className="section-title">Mô tả nhóm</h4>
              <p className="section-desc">{activeChat.description}</p>
            </div>
          )}

          {activeChat.isGroup && (
            <div className="detail-section">
              <h4 className="section-title">Quản trị viên</h4>
              <span className="admin-name">{activeChat.admin}</span>
            </div>
          )}

          <div className="detail-section members-section">
            <div className="members-section-heading">
              <h4 className="section-title">{activeChat.isGroup ? `Thành viên (${activeChat.members.length})` : "Thông tin cá nhân"}</h4>
              {activeChat.isGroup && (
                <button type="button" className="btn-add-member" onClick={openAddMembers}>
                  <i className="fa-solid fa-user-plus"></i>
                  <span>Thêm</span>
                </button>
              )}
            </div>
            <div className="members-list">
              {activeChat.members.map((member, idx) => (
                <div key={idx} className="member-item">
                  <SafeAvatar src={typeof member.avatar === 'string' ? member.avatar : ''} name={member.name} className="member-avatar" />
                  <div className="member-info">
                    <span className="member-name">{member.name}</span>
                    <span className="member-status-text">
                      <span className={`status-dot ${isAccountOnline(member) ? 'online' : 'offline'}`}></span>
                      {isAccountOnline(member) ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  {isCurrentUserGroupAdmin && member.id && member.id !== viewerId && member.id !== activeAdminId && (
                    <button
                      type="button"
                      className="btn-remove-member"
                      onClick={() => handleRemoveGroupMember(member)}
                      disabled={Boolean(removingMemberId)}
                      title={`Xóa ${member.name} khỏi nhóm`}
                      aria-label={`Xóa ${member.name} khỏi nhóm`}
                    >
                      <i className={`fa-solid ${removingMemberId === member.id ? 'fa-spinner fa-spin' : 'fa-user-minus'}`}></i>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="detail-actions">
            <div className="action-row">
              <div className="action-label">
                <i className="fa-regular fa-bell"></i>
                <span>Tắt thông báo</span>
              </div>
              <label className="switch">
                <input type="checkbox" checked={Boolean(mutedConversations[activeChat.id])} onChange={event => toggleConversationMute(event.target.checked)} />
                <span className="slider round"></span>
              </label>
            </div>

            {activeChat.isGroup && (
              <button className="btn-leave-group" onClick={handleLeaveGroup}>
                <i className="fa-solid fa-trash-can"></i>
                <span>Rời khỏi nhóm</span>
              </button>
            )}
            {!activeChat.isChatbot && activeChat.id !== 'empty' && (
              <button className="btn-delete-conversation" onClick={handleDeleteConversation} disabled={isDeletingConversation}>
                <i className={`fa-solid ${isDeletingConversation ? 'fa-spinner fa-spin' : 'fa-trash-can'}`}></i>
                <span>{isDeletingConversation ? 'Đang xóa...' : 'Xóa cuộc trò chuyện'}</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {workspacePanel && (
        <div className="workspace-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setWorkspacePanel(null);
        }}>
          <section className="workspace-panel" role="dialog" aria-modal="true">
            <div className="workspace-panel-header">
              <div>
                <h2>{workspacePanel === 'profile' ? 'Hồ sơ cá nhân' : workspacePanel === 'contacts' ? 'Danh bạ' : workspacePanel === 'files' ? 'File dùng chung' : workspacePanel === 'knowledge' ? 'Tri thức AI' : workspacePanel === 'notifications' ? 'Thông báo' : workspacePanel === 'search' ? 'Tìm trong hội thoại' : 'Cài đặt'}</h2>
              </div>
              <div className="workspace-panel-header-actions">
                {workspacePanel === 'profile' && (
                  <button type="button" className="workspace-logout-button" onClick={() => {
                    if (window.confirm("Bạn có chắc chắn muốn đăng xuất khỏi SÔNG HỒNG?")) {
                      setWorkspacePanel(null);
                      handleLogout();
                    }
                  }}>
                    <i className="fa-solid fa-arrow-right-from-bracket"></i>
                    <span>Đăng xuất</span>
                  </button>
                )}
                <button type="button" className="btn-close-detail" onClick={() => setWorkspacePanel(null)} aria-label="Đóng"><i className="fa-solid fa-xmark"></i></button>
              </div>
            </div>

            {workspacePanel === 'profile' && (
              <div className="profile-panel">
                <div className="profile-hero">
                  <div className="profile-avatar-editor">
                    <SafeAvatar src={profileAccount.avatar} name={profileAccount.name} className="profile-avatar-large" />
                    <label className={`profile-avatar-edit-button ${isUpdatingProfileAvatar ? 'loading' : ''}`} title="Đổi ảnh đại diện">
                      <i className={`fa-solid ${isUpdatingProfileAvatar ? 'fa-spinner fa-spin' : 'fa-camera'}`}></i>
                      <input type="file" accept="image/*" onChange={handleProfileAvatarChange} disabled={isUpdatingProfileAvatar} />
                    </label>
                  </div>
                  <h3>{profileAccount.name || 'Tài khoản hiện tại'}</h3>
                  <span className={`profile-status ${isCurrentUserOnline ? '' : 'offline'}`}><i className="fa-solid fa-circle"></i> {isCurrentUserOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}</span>
                </div>
                <div className="profile-details profile-readonly-details">
                  <div className="profile-detail-row"><i className="fa-solid fa-at"></i><div><small>Username</small><strong>{profileAccount.username || 'Chưa cập nhật'}</strong></div></div>
                  <div className="profile-detail-row"><i className="fa-solid fa-shield-halved"></i><div><small>Vai trò</small><strong>{profileAccount.role || 'Thành viên'}</strong></div></div>
                </div>
                <form className="profile-edit-form" onSubmit={handleProfileSave}>
                  <label><span>Họ và tên</span><input value={profileForm.name} onChange={event => setProfileForm(previous => ({ ...previous, name: event.target.value }))} maxLength="255" required /></label>
                  <label><span>Email</span><input type="email" value={profileForm.email} onChange={event => setProfileForm(previous => ({ ...previous, email: event.target.value }))} maxLength="255" /></label>
                  <label><span>Chức vụ</span><input value={profileForm.title} onChange={event => setProfileForm(previous => ({ ...previous, title: event.target.value }))} maxLength="255" /></label>
                  <label><span>Phòng ban</span><input value={profileForm.department} onChange={event => setProfileForm(previous => ({ ...previous, department: event.target.value }))} maxLength="255" /></label>
                  {profileNotice && <div className="profile-save-notice"><i className="fa-solid fa-circle-check"></i>{profileNotice}</div>}
                  <button type="submit" className="btn-primary profile-save-button" disabled={isSavingProfile}>
                    <i className={`fa-solid ${isSavingProfile ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
                    {isSavingProfile ? 'Đang lưu...' : 'Lưu hồ sơ'}
                  </button>
                </form>
              </div>
            )}

            {workspacePanel === 'contacts' && (
              <>
                <div className="workspace-search-row">
                  <i className="fa-solid fa-magnifying-glass"></i>
                  <input value={workspaceQuery} onChange={handleWorkspaceSearch} placeholder="Tìm theo tên, email hoặc username..." autoFocus />
                </div>
                <p className="workspace-hint">Chọn một người để mở chat 1-1 hoặc gửi lời mời kết bạn kèm lời nhắn.</p>
                {isWorkspaceLoading && <div className="workspace-empty"><i className="fa-solid fa-spinner fa-spin"></i> Đang tìm...</div>}
                {friendNotice && <div className="friend-notice"><i className="fa-solid fa-circle-check"></i><span>{friendNotice}</span></div>}
                {!isWorkspaceLoading && workspaceQuery.trim().length < 2 && friendContacts.length > 0 && (
                  <div className="friend-directory">
                    <div className="workspace-section-heading">
                      <strong>Bạn bè</strong>
                      <span>{friendContacts.length}</span>
                    </div>
                    <div className="workspace-list">
                      {friendContacts.map(contact => (
                        <div className="workspace-list-item contact-result" key={contact.id}>
                          <button type="button" className="contact-result-main" onClick={() => handleStartDirectChat(contact)}>
                            <SafeAvatar src={contact.avatar} name={contact.name} className="workspace-avatar" />
                            <span className="workspace-list-copy">
                              <strong>{contact.name}</strong>
                              <small>{isAccountOnline(contact) ? 'Online' : 'Offline'}{contact.username ? ` · @${contact.username}` : ''}</small>
                            </span>
                          </button>
                          <button type="button" className="btn-friend chat" onClick={() => handleStartDirectChat(contact)}>
                            <i className="fa-solid fa-message"></i>
                            Nhắn tin
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!isWorkspaceLoading && workspaceQuery.trim().length < 2 && friendContacts.length === 0 && (
                  <div className="workspace-empty"><i className="fa-solid fa-user-group"></i><span>Chưa có bạn bè. Hãy tìm một người và gửi lời mời kết bạn.</span></div>
                )}
                {!isWorkspaceLoading && workspaceQuery.trim().length >= 2 && workspaceResults.length === 0 && (
                  <div className="workspace-empty"><i className="fa-regular fa-address-book"></i><span>Không tìm thấy tài khoản phù hợp.</span></div>
                )}
                {workspaceQuery.trim().length >= 2 && workspaceResults.length > 0 && (
                  <div className="workspace-section-heading search-results-heading"><strong>Kết quả tìm kiếm</strong><span>{workspaceResults.length}</span></div>
                )}
                <div className="workspace-list">
                  {workspaceResults.map(contact => {
                    const friendshipStatus = friendshipStatusFor(friendshipRecords, viewerId, contact.id);
                    return (
                      <div className="workspace-list-item contact-result" key={contact.id || contact.name}>
                        <button type="button" className="contact-result-main" onClick={() => handleStartDirectChat(contact)}>
                          <SafeAvatar src={contact.avatar} name={contact.name} className="workspace-avatar" />
                          <span className="workspace-list-copy"><strong>{contact.name}</strong><small>{isAccountOnline(contact) ? 'Online' : 'Offline'}{contact.id ? ` · ${contact.id}` : ''}</small></span>
                        </button>
                        {friendshipStatus === 'pending-received' ? (
                          <button type="button" className="btn-friend secondary" onClick={() => openWorkspacePanel('notifications')}>Xem lời mời</button>
                        ) : (
                          <button
                            type="button"
                            className={`btn-friend ${friendshipStatus === 'friends' ? 'friends' : ''}`}
                            onClick={() => openFriendRequest(contact)}
                            disabled={friendshipStatus === 'friends' || friendshipStatus === 'pending-sent'}
                          >
                            <i className={`fa-solid ${friendshipStatus === 'friends' ? 'fa-user-check' : friendshipStatus === 'pending-sent' ? 'fa-clock' : 'fa-user-plus'}`}></i>
                            {friendshipStatus === 'friends' ? 'Bạn bè' : friendshipStatus === 'pending-sent' ? 'Đã gửi' : 'Kết bạn'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {workspacePanel === 'files' && (
              <>
                <p className="workspace-hint">Tệp và hình ảnh đã gửi trong các cuộc trò chuyện của bạn.</p>
                {sharedFiles.length === 0 ? <div className="workspace-empty"><i className="fa-regular fa-folder-open"></i><span>Chưa có file dùng chung.</span></div> : (
                  <div className="workspace-list">
                    {sharedFiles.map(file => (
                      <button type="button" className="workspace-list-item" key={`${file.roomId}-${file.id}`} onClick={() => { setWorkspacePanel(null); handleConversationSelect(file.roomId); }}>
                        <span className="workspace-file-icon"><i className={`fa-solid ${file.type === 'image' ? 'fa-image' : 'fa-file-lines'}`}></i></span>
                        <span className="workspace-list-copy"><strong>{file.file?.name || (file.type === 'image' ? 'Hình ảnh' : 'Tệp đính kèm')}</strong><small>{file.roomName} · {file.time}</small></span>
                        <i className="fa-solid fa-chevron-right"></i>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {workspacePanel === 'knowledge' && isKnowledgeAdmin && (
              <KnowledgeManager user={currentUser} onError={setChatError} />
            )}

            {workspacePanel === 'notifications' && (
              <>
                <p className="workspace-hint">Lời mời kết bạn, tin nhắn mới và hoạt động gần đây.</p>
                {friendNotice && <div className="friend-notice"><i className="fa-solid fa-circle-check"></i><span>{friendNotice}</span></div>}
                {friendNotifications.length > 0 && (
                  <div className="friend-request-list">
                    {friendNotifications.map(record => {
                      const incoming = record.event.recipientId === viewerId;
                      const status = record.response?.event?.action || 'pending';
                      const displayName = incoming
                        ? (record.event.requesterName || record.message.senderName || 'Người dùng')
                        : (record.response?.event?.responderName || record.room.name || 'Người dùng');
                      return (
                        <article className="friend-request-card" key={record.event.requestId}>
                          <SafeAvatar src={incoming ? record.message.avatar : record.room.avatarUrl} name={displayName} className="workspace-avatar" />
                          <div className="friend-request-copy">
                            <strong>{displayName}</strong>
                            <span>{incoming ? 'đã gửi cho bạn lời mời kết bạn.' : status === 'accepted' ? 'đã chấp nhận lời mời kết bạn.' : 'đã từ chối lời mời kết bạn.'}</span>
                            {record.event.note && <small>“{record.event.note}”</small>}
                            <time>{record.message.time}</time>
                          </div>
                          {incoming && status === 'pending' ? (
                            <div className="friend-request-actions">
                              <button type="button" className="accept" disabled={Boolean(respondingFriendRequestId)} onClick={() => handleFriendRequestResponse(record, true)}>Chấp nhận</button>
                              <button type="button" className="reject" disabled={Boolean(respondingFriendRequestId)} onClick={() => handleFriendRequestResponse(record, false)}>Từ chối</button>
                            </div>
                          ) : (
                            <span className={`friend-request-status ${status}`}>{status === 'accepted' ? 'Đã chấp nhận' : status === 'rejected' ? 'Đã từ chối' : 'Đã gửi'}</span>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
                {notifications.length === 0 && friendNotifications.length === 0 ? <div className="workspace-empty"><i className="fa-regular fa-bell-slash"></i><span>Không có thông báo mới.</span></div> : notifications.length > 0 && (
                  <div className="workspace-list">
                    {notifications.map(room => (
                      <button type="button" className="workspace-list-item" key={room.id} onClick={() => { setWorkspacePanel(null); handleConversationSelect(room.id); }}>
                        <span className="workspace-file-icon"><i className="fa-solid fa-message"></i></span>
                        <span className="workspace-list-copy"><strong>{room.name}</strong><small>{room.lastMsg || 'Có cập nhật mới'} · {room.time}</small></span>
                        {room.badge > 0 && <span className="workspace-unread">{room.badge}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {workspacePanel === 'search' && (
              <>
                <div className="workspace-search-row"><i className="fa-solid fa-magnifying-glass"></i><input value={messageSearchQuery} onChange={event => setMessageSearchQuery(event.target.value)} placeholder="Tìm nội dung hoặc người gửi..." autoFocus /></div>
                <p className="workspace-hint">{messageSearchQuery ? `${visibleMessages.length} kết quả trong ${activeChat.name}` : 'Nhập từ khóa để lọc tin nhắn hiện tại.'}</p>
                <div className="workspace-list">
                  {messageSearchQuery && visibleMessages.map(message => <button type="button" className="workspace-list-item" key={message.id} onClick={() => setWorkspacePanel(null)}><span className="workspace-file-icon"><i className="fa-solid fa-message"></i></span><span className="workspace-list-copy"><strong>{message.senderName || 'Bạn'}</strong><small>{message.text || message.file?.name || 'Nội dung đính kèm'} · {message.time}</small></span></button>)}
                </div>
              </>
            )}

            {workspacePanel === 'settings' && (
              <div className="workspace-settings">
                <label className="workspace-setting-row"><span><strong>Thông báo desktop</strong><small>Nhận thông báo khi có tin nhắn mới</small></span><input type="checkbox" checked={settings.desktopNotifications} onChange={handleDesktopNotificationsToggle} /></label>
                <label className="workspace-setting-row"><span><strong>Âm thanh tin nhắn</strong><small>Phát âm thanh khi nhận tin mới</small></span><input type="checkbox" checked={settings.sounds} onChange={event => setSettings(prev => ({ ...prev, sounds: event.target.checked }))} /></label>
                <label className="workspace-setting-row"><span><strong>Giao diện gọn</strong><small>Giảm khoảng cách giữa các tin nhắn</small></span><input type="checkbox" checked={settings.compactMode} onChange={event => setSettings(prev => ({ ...prev, compactMode: event.target.checked }))} /></label>
                <div className="workspace-account-card"><i className="fa-solid fa-shield-halved"></i><div><strong>{currentUser?.name || 'Tài khoản hiện tại'}</strong><small>{currentUser?.email || 'Phiên đăng nhập SÔNG HỒNG'} · {chatMode === 'tinode' ? 'Tinode realtime' : 'Demo mode'}</small></div></div>
              </div>
            )}
          </section>
        </div>
      )}

      {friendRequestTarget && (
        <div className="modal-backdrop friend-request-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isSendingFriendRequest) setFriendRequestTarget(null);
        }}>
          <form className="group-modal friend-request-modal" onSubmit={handleSendFriendRequest}>
            <div className="group-modal-header">
              <div>
                <span className="group-modal-kicker">KẾT NỐI ĐỒNG NGHIỆP</span>
                <h2>Gửi lời mời kết bạn</h2>
              </div>
              <button type="button" className="btn-close-detail" onClick={() => setFriendRequestTarget(null)} aria-label="Đóng" disabled={isSendingFriendRequest}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="friend-request-target">
              <SafeAvatar src={friendRequestTarget.avatar} name={friendRequestTarget.name} className="workspace-avatar" />
              <div>
                <strong>{friendRequestTarget.name}</strong>
                <small>{friendRequestTarget.username ? `@${friendRequestTarget.username}` : friendRequestTarget.email || friendRequestTarget.id}</small>
              </div>
            </div>

            <label className="group-form-field">
              <span>Lời nhắn giới thiệu <small>(không bắt buộc)</small></span>
              <textarea
                value={friendRequestNote}
                onChange={(event) => setFriendRequestNote(event.target.value)}
                placeholder="Ví dụ: Chào bạn, mình là Lâm ở phòng Kinh doanh..."
                rows="4"
                maxLength="500"
                autoFocus
              />
              <small className="friend-request-counter">{friendRequestNote.length}/500</small>
            </label>

            <div className="group-modal-footer">
              <span className="group-mode-label"><i className="fa-solid fa-shield-halved"></i>Lưu tại service quản lý</span>
              <div className="group-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setFriendRequestTarget(null)} disabled={isSendingFriendRequest}>Hủy</button>
                <button type="submit" className="btn-primary" disabled={isSendingFriendRequest}>
                  {isSendingFriendRequest ? 'Đang gửi...' : 'Gửi lời mời'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {isCreateGroupOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeCreateGroupModal();
        }}>
          <form className="group-modal" onSubmit={handleCreateGroup}>
            <div className="group-modal-header">
              <div>
                <span className="group-modal-kicker">CHAT GROUP</span>
                <h2>Tạo nhóm trò chuyện</h2>
              </div>
              <button type="button" className="btn-close-detail" onClick={closeCreateGroupModal} aria-label="Đóng" disabled={isCreatingGroup}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="group-avatar-field">
              <div className="group-avatar-preview">
                {groupAvatarPreview
                  ? <img src={groupAvatarPreview} alt="Xem trước ảnh nhóm" />
                  : <i className="fa-solid fa-users"></i>}
              </div>
              <div className="group-avatar-picker-copy">
                <strong>Ảnh đại diện nhóm</strong>
                <span>JPG, PNG hoặc WebP · tối đa 10 MB</span>
                <label className="btn-group-avatar-upload">
                  <i className="fa-solid fa-camera"></i>
                  <span>{groupAvatarFile ? 'Đổi ảnh' : 'Tải ảnh lên'}</span>
                  <input type="file" accept="image/*" onChange={handleGroupAvatarChange} disabled={isCreatingGroup} />
                </label>
              </div>
              {groupAvatarFile && (
                <button type="button" className="btn-remove-group-avatar" onClick={() => { setGroupAvatarFile(null); setGroupAvatarPreview(''); }} aria-label="Xóa ảnh đã chọn">
                  <i className="fa-solid fa-xmark"></i>
                </button>
              )}
            </div>

            <label className="group-form-field">
              <span>Tên nhóm</span>
              <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Ví dụ: Dự án Sông Hồng" required autoFocus />
            </label>
            <label className="group-form-field">
              <span>Mô tả</span>
              <textarea value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} placeholder="Mục đích của nhóm (không bắt buộc)" rows="3" />
            </label>

            <div className="group-form-field">
              <span>Thêm thành viên</span>
              <input value={groupMemberSearch} onChange={handleSearchGroupMembers} placeholder={chatMode === 'tinode' ? 'Tìm theo tên, email hoặc username...' : 'Tìm trong danh sách mẫu...'} />
              <p className="group-form-hint">Tài khoản của bạn ({currentUser?.name}) được tự động thêm làm quản trị viên nhóm.</p>
              {isSearchingMembers && <p className="group-form-hint">Đang tìm thành viên...</p>}
              {groupCandidates.length > 0 ? (
                <div className="group-member-picker">
                  {groupCandidates.map(member => {
                    const memberId = member.id || member.name;
                    const selected = groupMemberIds.includes(memberId);
                    return (
                      <button type="button" key={memberId} className={`group-member-option ${selected ? 'selected' : ''}`} onClick={() => toggleGroupMember(member)}>
                        <span className="picker-check"><i className={`fa-solid ${selected ? 'fa-check' : 'fa-plus'}`}></i></span>
                        <span className="picker-name">{member.name}</span>
                        <span className="picker-status">{isAccountOnline(member) ? 'Online' : 'Offline'}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="group-form-hint">{chatMode === 'tinode' ? 'Hãy nhập ít nhất 2 ký tự để tìm trong danh bạ Tinode.' : 'Không tìm thấy tài khoản phù hợp trong danh ba noi bo.'}</p>
              )}
            </div>

            <div className="group-modal-footer">
              <span className="group-mode-label"><i className={`fa-solid ${chatMode === 'tinode' ? 'fa-bolt' : 'fa-flask'}`}></i>{chatMode === 'tinode' ? 'Tinode realtime' : 'Demo mode'}</span>
              <div className="group-modal-actions">
                <button type="button" className="btn-secondary" onClick={closeCreateGroupModal} disabled={isCreatingGroup}>Hủy</button>
                <button type="submit" className="btn-primary" disabled={!groupName.trim() || isCreatingGroup}>{isCreatingGroup ? 'Đang tạo...' : 'Tạo nhóm'}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {isAddMembersOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsAddMembersOpen(false);
        }}>
          <form className="group-modal" onSubmit={handleAddMembers}>
            <div className="group-modal-header">
              <div>
                <span className="group-modal-kicker">GROUP MEMBERS</span>
                <h2>Thêm thành viên vào {activeChat.name}</h2>
              </div>
              <button type="button" className="btn-close-detail" onClick={() => setIsAddMembersOpen(false)} aria-label="Đóng">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="group-form-field">
              <span>Tìm tài khoản</span>
              <input value={groupMemberSearch} onChange={handleSearchGroupMembers} autoFocus placeholder={chatMode === 'tinode' ? 'Nhập ít nhất 2 ký tự để tìm trên Tinode...' : 'Tìm theo tên, username, email hoặc phòng ban...'} />
              {isSearchingMembers && <p className="group-form-hint">Đang tìm thành viên...</p>}
              {groupCandidates.length > 0 ? (
                <div className="group-member-picker">
                  {groupCandidates.map(member => {
                    const memberId = member.id || member.name;
                    const selected = groupMemberIds.includes(memberId);
                    return (
                      <button type="button" key={memberId} className={`group-member-option ${selected ? 'selected' : ''}`} onClick={() => toggleGroupMember(member)}>
                        <span className="picker-check"><i className={`fa-solid ${selected ? 'fa-check' : 'fa-plus'}`}></i></span>
                        <span className="picker-name">{member.name}</span>
                        <span className="picker-status">{member.username ? `@${member.username}` : isAccountOnline(member) ? 'Online' : 'Offline'}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="group-form-hint">{chatMode === 'tinode' ? 'Nhập ít nhất 2 ký tự để tìm UID thật trên Tinode.' : 'Tất cả tài khoản phù hợp đã ở trong nhóm hoặc không tồn tại.'}</p>
              )}
            </div>

            <div className="group-modal-footer">
              <span className="group-mode-label"><i className="fa-solid fa-users"></i>Đã chọn {groupMemberIds.length} tài khoản</span>
              <div className="group-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsAddMembersOpen(false)} disabled={isAddingMembers}>Hủy</button>
                <button type="submit" className="btn-primary" disabled={groupMemberIds.length === 0 || isAddingMembers}>{isAddingMembers ? 'Đang thêm...' : 'Thêm vào nhóm'}</button>
              </div>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

export default App;
