import React, { useState, useEffect, useRef, useCallback } from 'react';
import Login from '../features/auth/components/Login';
import EnterpriseWorkspace from '../features/workspace/components/EnterpriseWorkspace';
import CallOverlay from '../features/chat/components/CallOverlay';
import { isTinodeConfigured, tinodeClient, normalizeTinodeConversation, normalizeTinodeMediaUrl } from '../features/chat/services/tinodeClient';
import { chatManagementService } from '../features/chat/services/chatManagementService';
import {
  applyReceiptToMessages,
  firstVisibleConversationId,
  mergeDeliveryStatus,
  readyTinodeTypingTopic,
  resolvePreparedTinodeTopic,
  shouldShowConversation,
  tinodeContactsSyncDelay,
} from '../features/chat/services/chatRealtime';
import {
  NOTIFICATION_MUTE_OPTIONS,
  isConversationMuted,
  nextNotificationMuteExpiry,
  notificationMuteLabel,
  resolveNotificationMuteUntil,
} from '../features/chat/services/conversationNotifications';
import { resolveCallsEnabled } from '../features/chat/services/callSignaling';
import { attachmentConversationPreview } from '../features/chat/services/messagePreview';
import {
  canRecallDeliveredMessage,
  chatAttachmentValidationError,
} from '../features/chat/services/messagePolicy';
import {
  ALL_MENTION_ID,
  getMentionContext,
  insertMentionAt,
  matchesMentionCandidate,
  mentionCandidateText,
  mentionTokenExists,
  mentionTokenFor,
} from '../features/chat/services/mentionPolicy';
import {
  formatConversationListTime,
  formatFullMessageDateTime,
  formatMessageDateLabel,
  formatMessageTime,
} from '../features/chat/services/timeFormatting';
import {
  canRemoveGroupMember,
  companyDirectoryContacts,
  companyDirectoryHeading,
  countGroupPresence,
  directoryUsernameMeta,
  findAccount,
  findDirectPeer,
  identitiesOverlap,
  identityValues,
  matchesCompanyDirectoryContact,
  mergeDirectoryAccountSnapshots,
  mergeRealtimeAccountProfile,
  mergeRealtimeMemberPresence,
  resolveGroupAdministrator,
  snapshotPresence,
  updateAccountProfiles,
  updateAccountPresence,
} from '../features/contacts/services/accountDirectory';
import { appendDemoGroupMessage, deleteDemoGroupForUser, leaveDemoGroup, markDemoGroupRead, removeDemoGroupMember, saveDemoGroup, updateDemoGroupMessage } from '../features/demo/services/demoGroupStore';
import { appendDemoDirectMessage, deleteDemoDirectForUser, directConversationId, markDemoDirectRead, saveDemoDirect, updateDemoDirectMessage } from '../features/demo/services/demoDirectStore';
import { CHATBOT_ACCOUNT, CHATBOT_STARTER_PROMPTS, EXTERNAL_CHAT_ONLY, applyTinodeChatbotConfig, loadChatbotMessages, loadChatbotMessagesFromServer, loadTinodeChatbotConfig, requestChatbotReply, saveChatbotMessage } from '../features/chatbot/services/chatbotService';

const CALLS_ENABLED = resolveCallsEnabled(import.meta.env.VITE_CALLS_ENABLED);

function tinodeTopicName(room) {
  return room?.tinodeTopic || room?.id || '';
}

function isManagementConversationId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function getTimeString() {
  const date = new Date();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

async function copyTextToClipboard(value) {
  const text = String(value || '');
  if (!text) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall back for non-secure contexts and browsers without permission.
  }
  if (typeof document === 'undefined') throw new Error('Trinh duyet khong ho tro sao chep.');
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Khong the sao chep noi dung.');
}

function attachmentSizeLabel(file) {
  const value = String(file?.size || file?.sizeLabel || '').trim();
  if (value.includes('•')) return value.split('•').pop().trim();
  if (value.includes('·')) return value.split('·').pop().trim();
  return value || (file?.mime?.startsWith('image/') ? 'Hình ảnh' : 'Tệp đính kèm');
}

function attachmentIconClass(file, type = '') {
  const name = String(file?.name || '').toLowerCase();
  const mime = String(file?.mime || '').toLowerCase();
  if (type === 'image' || mime.startsWith('image/') || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(name)) return 'fa-file-image';
  if (mime.startsWith('audio/') || /\.(m4a|mp3|ogg|wav|flac)$/.test(name)) return 'fa-file-audio';
  if (mime.startsWith('video/') || /\.(avi|mov|mkv|mp4|webm)$/.test(name)) return 'fa-file-video';
  if (file?.ext === 'pdf' || mime.includes('pdf') || name.endsWith('.pdf')) return 'fa-file-pdf';
  if (file?.ext === 'excel' || /(spreadsheet|excel|csv)/i.test(mime) || /\.(xlsx?|csv)$/.test(name)) return 'fa-file-excel';
  return 'fa-file-lines';
}

function isImageAttachment(file, type = '') {
  const name = String(file?.name || '').toLowerCase();
  const mime = String(file?.mime || '').toLowerCase();
  return type === 'image'
    || mime.startsWith('image/')
    || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(name);
}

function TinodeImagePreview({ source, alt, className = '' }) {
  const [resolvedSource, setResolvedSource] = useState('');
  const [failed, setFailed] = useState(false);
  const [mediaVersion, setMediaVersion] = useState(() => tinodeClient.getMediaVersion(source));

  useEffect(() => {
    const normalizedSource = normalizeTinodeMediaUrl(source);
    return tinodeClient.onEvent(event => {
      if (event.type === 'media-invalidated' && event.url === normalizedSource) {
        setMediaVersion(tinodeClient.getMediaVersion(source));
      }
    });
  }, [source]);

  useEffect(() => {
    let cancelled = false;
    setResolvedSource('');
    setFailed(false);
    if (!source) {
      setFailed(true);
      return () => { cancelled = true; };
    }

    tinodeClient.resolveMediaUrl(source)
      .then(url => {
        if (!cancelled) setResolvedSource(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => { cancelled = true; };
  }, [source, mediaVersion]);

  if (failed) {
    return (
      <span className="image-preview-placeholder image-preview-error" role="img" aria-label={alt}>
        <i className="fa-regular fa-image" aria-hidden="true"></i>
        <span>Không tải được ảnh xem trước</span>
      </span>
    );
  }

  if (!resolvedSource) {
    return (
      <span className="image-preview-placeholder" role="status" aria-label="Đang tải ảnh">
        <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
        <span>Đang tải ảnh...</span>
      </span>
    );
  }

  return (
    <img
      src={resolvedSource}
      alt={alt}
      className={`chat-attached-image ${className}`.trim()}
      loading="lazy"
      draggable="false"
      onError={() => setFailed(true)}
    />
  );
}

function ImageViewer({ source, onClose }) {
  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="image-viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Xem ảnh"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button type="button" className="image-viewer-close" onClick={onClose} aria-label="Đóng ảnh" title="Đóng ảnh">
        <i className="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
      <div className="image-viewer-content" onMouseDown={event => event.stopPropagation()}>
        <TinodeImagePreview source={source} alt="Ảnh đính kèm" className="image-viewer-image" />
      </div>
    </div>
  );
}

// --- Initial Conversions Data ---
const INITIAL_CHAT_DATA = {};

function createChatbotConversation(messages = [], { accountSession = 0, useTinode = false } = {}) {
  const welcomeMessage = {
    id: 'bot-welcome',
    type: 'text',
    sender: 'incoming',
    senderId: CHATBOT_ACCOUNT.id,
    senderName: CHATBOT_ACCOUNT.name,
    avatar: CHATBOT_ACCOUNT.avatar,
    text: 'Chào bạn! Mình là ViChat AI. Mình tìm câu trả lời trong kho tri thức doanh nghiệp và luôn hiển thị nguồn để bạn kiểm chứng.',
    time: '',
    isWelcome: true,
  };
  if (EXTERNAL_CHAT_ONLY) {
    welcomeMessage.text = `Xin chào! ${CHATBOT_ACCOUNT.name} đã sẵn sàng hỗ trợ bạn.`;
  }
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
    membersCount: 'Tra cứu tri thức · Có nguồn kiểm chứng',
    description: 'Trợ lý AI dùng dữ liệu doanh nghiệp đã được phê duyệt.',
    admin: '',
    members: [CHATBOT_ACCOUNT],
    participantIds: [CHATBOT_ACCOUNT.id, useTinode ? CHATBOT_ACCOUNT.tinodeUid : ''].filter(Boolean),
    tinodeTopic: useTinode ? CHATBOT_ACCOUNT.tinodeUid : '',
    accountSession: useTinode ? accountSession : undefined,
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
      const isOutgoing = previous.sender === 'outgoing' || message.sender === 'outgoing';
      merged[index] = message.recalled || previous.recalled
        ? {
          ...previous,
          ...message,
          type: 'text',
          text: 'Tin nhắn đã được thu hồi',
          recalled: true,
          file: undefined,
          image: undefined,
          replyTo: null,
          reactions: {},
        }
        : {
          ...previous,
          ...message,
          type: previous.type === 'image' || message.type === 'image' ? 'image' : message.type,
          ...(isOutgoing ? {
            // A receipt update can arrive just before Tinode emits its refreshed
            // conversation. Keep the highest known status from that snapshot.
            deliveryStatus: mergeDeliveryStatus(previous.deliveryStatus, message.deliveryStatus),
          } : {}),
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

function removeMessageFromConversation(room, message) {
  if (!room || !message) return room;
  const messages = (room.messages || []).filter(item => (
    item.id !== message.id
    && !(Number.isFinite(message.seq) && Number.isFinite(item?.seq) && item.seq === message.seq)
  ));
  const latestMessage = messages.at(-1);
  return {
    ...room,
    messages,
    lastMsg: attachmentConversationPreview(latestMessage) || latestMessage?.text || '',
    time: latestMessage?.time || '',
    updatedAt: latestMessage?.createdAt || room.updatedAt,
  };
}

function mergeTinodeConversation(existing, incoming) {
  if (!existing) return incoming;
  const messages = mergeTinodeMessages(existing.messages, incoming.messages);
  const friendEvents = mergeTinodeMessages(existing.friendEvents, incoming.friendEvents);
  const latestAttachmentPreview = attachmentConversationPreview(messages.at(-1));
  const managementOwned = Boolean(
    existing.accountSession && isManagementConversationId(existing.managementId || existing.id),
  );
  const incomingManagementSnapshot = managementOwned && Array.isArray(incoming.participantIds);
  const snapshotMembers = incoming.members?.length ? incoming.members : (existing.members || []);
  const members = incomingManagementSnapshot
    ? mergeRealtimeMemberPresence(snapshotMembers, existing.members || [])
    : managementOwned
      ? mergeRealtimeMemberPresence(existing.members || [], incoming.members || [])
      : snapshotMembers;
  return {
    ...existing,
    ...incoming,
    name: managementOwned && !incomingManagementSnapshot
      ? existing.name
      : (incoming.name && incoming.name !== incoming.id ? incoming.name : existing.name),
    avatarHtml: incoming.avatarHtml || existing.avatarHtml,
    avatarUrl: managementOwned && !incomingManagementSnapshot
      ? existing.avatarUrl
      : (incoming.avatarUrl !== undefined ? incoming.avatarUrl : existing.avatarUrl),
    description: managementOwned && !incomingManagementSnapshot
      ? existing.description
      : (incoming.description || existing.description),
    admin: managementOwned && !incomingManagementSnapshot
      ? existing.admin
      : (incoming.admin || existing.admin),
    adminId: managementOwned && !incomingManagementSnapshot
      ? existing.adminId
      : (incoming.adminId || existing.adminId),
    members,
    participantIds: incomingManagementSnapshot ? incoming.participantIds : existing.participantIds,
    messages,
    friendEvents,
    lastMsg: latestAttachmentPreview || incoming.lastMsg || existing.lastMsg,
    time: incoming.time || existing.time,
    updatedAt: incoming.updatedAt || existing.updatedAt || messages[messages.length - 1]?.createdAt,
  };
}

function SafeAvatar({ src, name, className = '' }) {
  const [failed, setFailed] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState('');
  const [mediaVersion, setMediaVersion] = useState(() => tinodeClient.getMediaVersion(src));

  useEffect(() => {
    const normalizedSource = normalizeTinodeMediaUrl(src);
    return tinodeClient.onEvent(event => {
      if (event.type === 'media-invalidated' && event.url === normalizedSource) {
        setMediaVersion(tinodeClient.getMediaVersion(src));
      }
    });
  }, [src]);

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
  }, [src, mediaVersion]);

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
  const lastAttachmentPreview = attachmentConversationPreview(lastMessage);
  const lastContent = lastMessage?.text || 'Nhóm mới được tạo';
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
    lastMsg: lastMessage ? (lastMessage.type === 'system' ? lastContent : lastAttachmentPreview || `${lastMessage.sender === 'outgoing' ? 'Bạn' : lastMessage.senderName}: ${lastContent}`) : 'Nhóm mới được tạo',
    time: lastMessage?.time || (group.updatedAt ? new Date(group.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : getTimeString()),
    updatedAt: group.updatedAt,
    badge: unreadMessageCount(group.messages, group.readBy, viewerId),
  };
}

function demoDirectToConversation(direct, accounts, viewerId) {
  const other = findDirectPeer(direct, accounts, { id: viewerId });
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
  const lastAttachmentPreview = attachmentConversationPreview(lastMessage);
  const lastContent = lastMessage?.text || 'Bắt đầu cuộc trò chuyện';
  return {
    id: direct.id,
    name: other?.name || 'Cuộc trò chuyện cá nhân',
    isGroup: false,
    avatarHtml: other?.avatar ? <img src={other.avatar} alt={other.name} /> : <span>{other?.name?.slice(0, 1).toUpperCase() || '?'}</span>,
    avatarClass: '',
    membersCount: other?.online ? 'Online' : 'Offline',
    description: '',
    admin: '',
    members: other ? [{ ...other }] : [],
    participantIds: direct.participantIds,
    messages,
    lastMsg: lastMessage ? (lastAttachmentPreview || `${lastMessage.sender === 'outgoing' ? 'Bạn' : lastMessage.senderName}: ${lastContent}`) : 'Bắt đầu cuộc trò chuyện',
    time: lastMessage?.time || (direct.updatedAt ? new Date(direct.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''),
    updatedAt: lastMessage?.createdAt || direct.updatedAt,
    badge: unreadMessageCount(direct.messages, direct.readBy, viewerId),
  };
}

function managementRoomsForSession(managed, accounts, user, accountSession) {
  const managementUserId = String(user?.id || user?.uid || '');
  const savedGroups = (managed?.groups || [])
    .map(group => demoGroupToConversation(group, accounts, managementUserId));
  const savedDirects = (managed?.directs || [])
    .map(direct => demoDirectToConversation(direct, accounts, managementUserId));
  const savedDirectIds = new Set(savedDirects.map(room => room.id));
  const remoteRooms = (managed?.conversations || [])
    .filter(room => !room.isChatbot)
    .filter(room => isManagementConversationId(room.managementId || room.id))
    .filter(room => (room.participantIds || []).map(String).includes(managementUserId))
    .filter(room => !isSelfDirectConversation(room, user, accounts))
    .filter(room => {
      if (room.isGroup) return true;
      const contact = findDirectPeer(room, accounts, user);
      return !contact || !savedDirectIds.has(directConversationId(managementUserId, contact.id));
    })
    .map(room => {
      const peer = room.isGroup ? null : findDirectPeer(room, accounts, user);
      return {
        ...room,
        ...(peer ? {
          name: peer.name || room.name,
          avatarHtml: undefined,
          avatarUrl: peer.avatar || '',
          membersCount: peer.online ? 'Online' : 'Offline',
          description: '',
          members: [{ ...peer }],
        } : {}),
        messages: [],
        lastMsg: 'Chưa có tin nhắn',
        time: '',
        badge: 0,
      };
    });
  const rooms = {
    ...Object.fromEntries(remoteRooms.map(room => [room.id, room])),
    ...Object.fromEntries(savedGroups.map(group => [group.id, group])),
    ...Object.fromEntries(savedDirects.map(direct => [direct.id, direct])),
  };
  return Object.fromEntries(Object.entries(rooms).map(([id, room]) => [id, {
    ...room,
    managementId: room.managementId || id,
    tinodeTopic: room.tinodeTopic || chatManagementService.getTinodeTopic(managementUserId, room.managementId || id),
    accountSession,
  }]));
}

function managedTinodeTopics(rooms) {
  return Object.values(rooms || {}).map(room => room.tinodeTopic).filter(Boolean);
}

function callPeerDetails(room, currentUser) {
  const peer = room?.members?.find(member => !identitiesOverlap(member, currentUser))
    || room?.members?.[0]
    || {};
  return {
    peerName: peer.name || room?.name || 'Người dùng',
    peerAvatar: peer.avatar || room?.avatarUrl || '',
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
  const [loginNotice, setLoginNotice] = useState('');
  const [chatMode, setChatMode] = useState('demo');
  const [connectionStatus, setConnectionStatus] = useState(isTinodeConfigured ? 'ready' : 'demo');
  const [chatError, setChatError] = useState('');
  const [managementConversationSession, setManagementConversationSession] = useState(0);

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
  const [removingMemberId, setRemovingMemberId] = useState('');
  const [workspacePanel, setWorkspacePanel] = useState(null);
  const [enterpriseTaskSeed, setEnterpriseTaskSeed] = useState(null);
  const [workspaceQuery, setWorkspaceQuery] = useState('');
  const [workspaceResults, setWorkspaceResults] = useState([]);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [respondingFriendRequestId, setRespondingFriendRequestId] = useState('');
  const [friendNotice, setFriendNotice] = useState('');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [mentionContext, setMentionContext] = useState(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [messageMentions, setMessageMentions] = useState({});
  const [messageMenu, setMessageMenu] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [messageDetails, setMessageDetails] = useState(null);
  const [shareMessage, setShareMessage] = useState(null);
  const [messageActions, setMessageActions] = useState({});
  const [notificationMuteDialog, setNotificationMuteDialog] = useState(null);
  const [notificationMuteOption, setNotificationMuteOption] = useState(NOTIFICATION_MUTE_OPTIONS.ONE_HOUR);
  const [isUpdatingNotificationMute, setIsUpdatingNotificationMute] = useState(false);
  const [notificationClock, setNotificationClock] = useState(() => Date.now());
  const [displayClock, setDisplayClock] = useState(() => Date.now());
  const [settings, setSettings] = useState({ sounds: true, compactMode: false });
  const [directoryAccounts, setDirectoryAccounts] = useState([]);
  const [isUpdatingProfileAvatar, setIsUpdatingProfileAvatar] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', email: '', title: '', department: '' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const [forcedLogoutSeconds, setForcedLogoutSeconds] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [imageViewer, setImageViewer] = useState(null);

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
  const mentionPickerRef = useRef(null);
  const currentChatIdRef = useRef(currentChatId);
  const deletedConversationIdsRef = useRef(new Set());
  const createGroupRequestRef = useRef(false);
  const tinodeSessionRequestRef = useRef(null);
  const conversationsRef = useRef(conversations);
  const currentUserRef = useRef(currentUser);
  const directoryAccountsRef = useRef(directoryAccounts);
  const avatarOverridesRef = useRef(new Map());
  const typingNoticeAtRef = useRef(new Map());
  const typingClearTimersRef = useRef(new Map());
  const notificationBaselineRef = useRef(new Map());
  const notificationAudioContextRef = useRef(null);
  const contactsSyncTimerRef = useRef(null);
  const contactsSyncRequestRef = useRef(0);
  const logoutHandlerRef = useRef(null);
  const forcedLogoutHandlerRef = useRef(null);
  const forcedLogoutRef = useRef(false);
  const isLoggingOutRef = useRef(false);
  const accountSessionRef = useRef(0);
  const managementConversationSessionRef = useRef(0);
  const activeCallRef = useRef(null);

  // Event callbacks can run between React renders; keep the latest room map
  // available without forcing Tinode subscriptions to be recreated.
  conversationsRef.current = conversations;
  currentUserRef.current = currentUser;
  directoryAccountsRef.current = directoryAccounts;

  const rememberAvatarOverride = (entity, avatar) => {
    const value = String(avatar || '').trim();
    if (!value) return;
    identityValues(entity).forEach(identity => avatarOverridesRef.current.set(identity, value));
  };

  const avatarOverrideFor = account => identityValues(account)
    .map(identity => avatarOverridesRef.current.get(identity))
    .find(Boolean) || '';

  const clearActiveCall = useCallback(() => {
    activeCallRef.current = null;
    setActiveCall(null);
  }, []);

  const activeChat = conversations[currentChatId] || Object.values(conversations)[0] || {
    id: 'empty',
    name: 'Chưa có cuộc trò chuyện',
    isGroup: false,
    avatarHtml: <i className="fa-regular fa-comments"></i>,
    avatarClass: 'group',
    membersCount: '',
    description: '',
    admin: '',
    members: [],
    messages: [],
    lastMsg: '',
    time: '',
    badge: 0,
  };
  const activeChatMuted = isConversationMuted(activeChat.notificationMutedUntil, notificationClock);
  const activeChatMuteLabel = notificationMuteLabel(activeChat.notificationMutedUntil, notificationClock);
  const activeMessageCount = activeChat.messages?.length || 0;
  const usesManagementData = chatManagementService.remote && chatMode !== 'demo';
  const realtimeMessagingPending = usesManagementData
    && !activeChat.isChatbot
    && (chatMode !== 'tinode' || connectionStatus !== 'online');
  const chatbotUsesTinode = Boolean(activeChat.isChatbot && activeChat.tinodeTopic);
  const chatbotStatus = chatbotUsesTinode
    ? (connectionStatus === 'online' ? 'Đang kết nối kho tri thức' : 'Đang chờ kết nối realtime')
    : 'Kho tri thức doanh nghiệp';
  const accountProfileReadOnly = Boolean(currentUser?.accountManaged || currentUser?.account_managed);
  const chatModeLabel = chatMode === 'external'
    ? 'External chatbot'
    : chatMode === 'tinode'
    ? 'Tinode realtime'
    : usesManagementData ? 'Dữ liệu Chatmgt' : 'Demo mode';
  const accountPresenceLabel = account => chatMode === 'tinode'
    ? (isAccountOnline(account) ? 'Online' : 'Offline')
    : usesManagementData ? 'Danh bạ Chatmgt' : (isAccountOnline(account) ? 'Online' : 'Offline');

  const isCurrentUserOnline = Boolean(
    isLoggedIn && currentUser && (chatMode !== 'tinode' || connectionStatus === 'online')
  );
  const activeGroupPresence = activeChat.isGroup
    ? countGroupPresence(activeChat.members, currentUser, isCurrentUserOnline)
    : null;
  const activeChatPresenceLabel = activeGroupPresence
    ? `${activeGroupPresence.memberCount} thành viên • ${activeGroupPresence.onlineCount} đang online`
    : activeChat.membersCount;
  const callActionCapability = (() => {
    if (!CALLS_ENABLED) return { available: false, reason: 'Tính năng cuộc gọi đang tạm ẩn theo cấu hình doanh nghiệp.' };
    if (chatMode !== 'tinode') return { available: false, reason: 'Cuộc gọi chỉ khả dụng khi đã kết nối Tinode realtime.' };
    if (activeCall) return { available: false, reason: 'Bạn đang có một cuộc gọi khác.' };
    if (activeChat.isChatbot) return { available: false, reason: 'Không thể gọi trợ lý chatbot.' };
    if (activeChat.isGroup) return { available: false, reason: 'Tinode 0.25.3 chỉ hỗ trợ cuộc gọi 1-1.' };
    if (!activeChat.members?.length) return { available: false, reason: 'Cuộc trò chuyện chưa có người nhận.' };
    const topicName = tinodeTopicName(activeChat);
    return tinodeClient.getCallCapability(
      /^usr[a-z0-9_-]+$/i.test(String(topicName || '')) ? topicName : 'usrpending',
      { isGroup: false, isChatbot: false },
    );
  })();
  const profileAccount = {
    ...(findAccount(directoryAccounts, currentUser?.id || currentUser?.uid) || {}),
    ...(currentUser || {}),
    online: isCurrentUserOnline,
  };
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
  // Friend requests use Chatmgt account IDs, not Tinode topic UIDs.
  const managementViewerId = currentUser?.id || currentUser?.uid || '';

  const mentionCandidates = (() => {
    if (!activeChat.isGroup) return [];
    const rawMembers = [
      ...(activeChat.members || []),
      ...(activeChat.participantIds || [])
        .map(identity => findAccount(directoryAccounts, identity))
        .filter(Boolean),
    ];
    const seen = new Set();
    return rawMembers.reduce((members, member) => {
      const account = findAccount(
        directoryAccounts,
        member?.id || member?.uid || member?.tinodeUid || member?.tinode_uid || member?.name,
      );
      const candidate = {
        ...(member || {}),
        ...(account || {}),
        id: account?.id || member?.id || member?.uid || member?.tinodeUid || member?.tinode_uid,
        tinodeUid: account?.tinodeUid || account?.tinode_uid || member?.tinodeUid || member?.tinode_uid || member?.id,
        name: account?.name || member?.name || account?.username || member?.username,
        avatar: account?.avatar || member?.avatar || '',
      };
      const identity = String(
        candidate.id || candidate.tinodeUid || candidate.username || candidate.name || '',
      ).trim().toLowerCase();
      if (!identity || !mentionCandidateText(candidate) || candidate.type === 'bot' || seen.has(identity)) {
        return members;
      }
      seen.add(identity);
      members.push(candidate);
      return members;
    }, []);
  })();

  const mentionOptions = mentionContext && activeChat.isGroup
    ? [
      {
        id: ALL_MENTION_ID,
        name: 'All',
        label: 'Báo cho cả nhóm',
        username: 'all',
        isAll: true,
      },
      ...mentionCandidates,
    ].filter(candidate => matchesMentionCandidate(candidate, mentionContext.query))
    : [];

  useEffect(() => {
    if (!mentionContext || mentionOptions.length === 0) {
      setMentionActiveIndex(0);
      return;
    }
    setMentionActiveIndex(previous => Math.min(previous, mentionOptions.length - 1));
  }, [mentionContext, mentionOptions.length]);

  useEffect(() => {
    setMentionContext(null);
    setMentionActiveIndex(0);
  }, [currentChatId]);

  const applyPresenceSnapshot = useCallback(snapshot => {
    const currentAccount = currentUserRef.current;
    const accounts = directoryAccountsRef.current;
    setDirectoryAccounts(previous => {
      const next = updateAccountPresence(previous, snapshot, currentAccount);
      directoryAccountsRef.current = next;
      return next;
    });
    setWorkspaceResults(previous => updateAccountPresence(previous, snapshot, currentAccount));
    setConversations(previous => {
      let changed = false;
      const next = Object.fromEntries(Object.entries(previous).map(([id, room]) => {
        let membersChanged = false;
        const members = (room.members || []).map(member => {
          const account = findAccount(accounts, member.id || member.uid || member.name);
          const isCurrentAccount = identitiesOverlap(member, currentAccount) || identitiesOverlap(account, currentAccount);
          const online = isCurrentAccount
            ? undefined
            : snapshotPresence(member, snapshot) ?? snapshotPresence(account, snapshot);
          if (online === undefined || member.online === online) return member;
          membersChanged = true;
          return { ...member, online };
        });
        const peer = !room.isGroup && !room.isChatbot
          ? members.find(member => !identitiesOverlap(member, currentAccount)) || members[0]
          : null;
        const membersCount = peer ? (peer.online ? 'Online' : 'Offline') : room.membersCount;
        if (!membersChanged && membersCount === room.membersCount) return [id, room];
        changed = true;
        return [id, { ...room, members, membersCount }];
      }));
      return changed ? next : previous;
    });
  }, []);

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
  const activeAdminAccount = resolveGroupAdministrator(activeChat, directoryAccounts);
  const activeAdminName = activeAdminAccount?.name || activeChat.admin || 'Chưa xác định';

  // Auto scroll to bottom of chat
  const scrollToBottom = () => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeMessageCount, currentChatId, isTyping]);

  useEffect(() => {
    const closeMenu = () => setMessageMenu(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  useEffect(() => {
    currentChatIdRef.current = currentChatId;
  }, [currentChatId]);

  useEffect(() => {
    const now = Date.now();
    const nextExpiry = nextNotificationMuteExpiry(Object.values(conversations), now);
    if (nextExpiry === null) return undefined;
    const timer = window.setTimeout(
      () => setNotificationClock(Date.now()),
      Math.max(0, Math.min(nextExpiry - now + 50, 2_147_483_647)),
    );
    return () => window.clearTimeout(timer);
  }, [conversations, notificationClock]);

  useEffect(() => {
    const timer = window.setInterval(() => setDisplayClock(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    if (groupAvatarPreview) URL.revokeObjectURL(groupAvatarPreview);
  }, [groupAvatarPreview]);

  const ensureTinodeSession = useCallback(async () => {
    if (chatMode !== 'tinode') return null;
    if (!tinodeSessionRequestRef.current) {
      tinodeSessionRequestRef.current = (async () => {
        const accountSession = accountSessionRef.current;
        let auth = chatManagementService.getTinodeAuth();
        if (!auth) throw new Error('Phiên quản lý không có thông tin kết nối Tinode.');
        tinodeClient.setTokenProvider(async () => {
          if (accountSessionRef.current !== accountSession) {
            throw new Error('Phiên tài khoản đã thay đổi.');
          }
          return chatManagementService.getFreshTinodeAuth({ force: true });
        });
        if (tinodeClient.authenticated) return tinodeClient.ensureSession(auth);
        setConnectionStatus('connecting');
        let session;
        try {
          session = await tinodeClient.ensureSession(auth);
        } catch (firstError) {
          if (accountSessionRef.current !== accountSession) throw firstError;
          auth = await chatManagementService.getFreshTinodeAuth({ force: true });
          session = await tinodeClient.ensureSession(auth);
        }
        setCurrentUser(previous => ({
          ...previous,
          tinodeUid: session.uid,
          tinodeSession: session,
          name: previous?.name || auth.displayName || session.profile?.name,
          avatar: previous?.avatar || auth.avatar || session.profile?.avatar || '',
          tenantId: previous?.tenantId || auth.tenantId,
          tenantName: previous?.tenantName || auth.tenantName,
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

  const refreshManagementConversations = useCallback(async accountSession => {
    if (!accountSession || managementConversationSessionRef.current !== accountSession) return {};
    const managementUserId = String(currentUser?.id || currentUser?.uid || '');
    if (!managementUserId) return {};
    const managed = await chatManagementService.listConversations();
    if (accountSessionRef.current !== accountSession || managementConversationSessionRef.current !== accountSession) return {};
    const managedRooms = managementRoomsForSession(managed, directoryAccounts, currentUser, accountSession);
    const previousRooms = conversationsRef.current;
    const nextRooms = Object.fromEntries(Object.entries(previousRooms).filter(([, room]) => (
      room.isChatbot
      || (!room.managementId && !room.tinodeTopic && (room.friendEvents || []).length > 0)
    )));
    Object.entries(managedRooms).forEach(([id, room]) => {
      const previousRoom = previousRooms[id] || Object.values(previousRooms)
        .find(candidate => room.tinodeTopic && candidate.tinodeTopic === room.tinodeTopic);
      nextRooms[id] = mergeTinodeConversation(previousRoom, room);
    });
    conversationsRef.current = nextRooms;
    setConversations(nextRooms);
    tinodeClient.setAllowedConversationTopics(managedTinodeTopics(nextRooms));
    if (!nextRooms[currentChatIdRef.current]) {
      setCurrentChatId(firstVisibleConversationId(nextRooms, {}, CHATBOT_ACCOUNT.id));
    }
    return managedRooms;
  }, [currentUser, directoryAccounts]);

  const ensureTinodeConversationTopic = async (room, { avatarFile = null } = {}) => {
    if (!room || room.isChatbot || chatMode !== 'tinode') return room?.id || '';
    const accountSession = accountSessionRef.current;
    const managementConversationId = room.managementId || room.id;
    if (room.accountSession !== accountSession || managementConversationSessionRef.current !== accountSession) {
      throw new Error('Cuộc trò chuyện không thuộc phiên tài khoản hiện tại.');
    }
    if (!isManagementConversationId(managementConversationId)) {
      throw new Error('Chatmgt chưa xác nhận cuộc trò chuyện này.');
    }
    const managementUserId = currentUser?.id || currentUser?.uid;
    await ensureTinodeSession();
    if (accountSessionRef.current !== accountSession) throw new Error('Phiên tài khoản đã thay đổi.');
    let topicName = resolvePreparedTinodeTopic(
      room,
      null,
      chatManagementService.getTinodeTopic(managementUserId, managementConversationId),
    );
    let preparedRoom = room;
    let createdGroupTopic = false;
    let createdGroupAvatar = '';

    if (!topicName) {
      preparedRoom = await chatManagementService.prepareTinodeConversation(managementConversationId);
      if (accountSessionRef.current !== accountSession) throw new Error('Phiên tài khoản đã thay đổi.');
      topicName = resolvePreparedTinodeTopic(
        room,
        preparedRoom,
        chatManagementService.getTinodeTopic(managementUserId, managementConversationId),
      );
    }

    if (!topicName && preparedRoom.isGroup) {
      const memberAccounts = (preparedRoom.members || [])
        .filter(member => String(member?.id || '') !== String(managementUserId));
      const memberIds = [...new Set(memberAccounts.map(member => (
        member.tinodeUid || member.tinode_uid || ''
      )).filter(Boolean))];
      if (memberIds.length !== memberAccounts.length) {
        throw new Error('Chatmgt chưa chuẩn bị đủ tài khoản Tinode cho thành viên nhóm.');
      }
      const created = await tinodeClient.createGroup({
        name: preparedRoom.name,
        description: preparedRoom.description || '',
        memberIds,
        avatarFile,
      });
      topicName = created.id;
      createdGroupTopic = true;
      createdGroupAvatar = created.avatarUrl || '';
    } else if (!topicName) {
      const contact = (preparedRoom.members || [])
        .find(member => String(member?.id || '') !== String(managementUserId));
      topicName = contact?.tinodeUid || contact?.tinode_uid || '';
    }

    if (!topicName) throw new Error('Chatmgt chưa gắn topic Tinode cho cuộc trò chuyện này.');
    try {
      await chatManagementService.bindTinodeTopic(
        managementUserId,
        managementConversationId,
        topicName,
        { avatarUrl: createdGroupAvatar },
      );
    } catch (error) {
      const bindingRejected = Number(error?.status) >= 400 && Number(error?.status) < 500;
      if (createdGroupTopic && bindingRejected) {
        await tinodeClient.discardGroupTopic(topicName).catch(() => {});
      }
      throw error;
    }
    if (accountSessionRef.current !== accountSession) throw new Error('Phiên tài khoản đã thay đổi.');
    const stateId = room.id || managementConversationId;
    const previousRooms = conversationsRef.current;
    const nextRooms = {
      ...previousRooms,
      [stateId]: {
        ...(previousRooms[stateId] || preparedRoom),
        id: stateId,
        managementId: managementConversationId,
        tinodeTopic: topicName,
        avatarUrl: createdGroupAvatar || preparedRoom.avatarUrl || '',
        accountSession,
      },
    };
    conversationsRef.current = nextRooms;
    setConversations(nextRooms);
    tinodeClient.allowConversationTopic(topicName);
    return topicName;
  };

  const handleCallError = useCallback(error => {
    if (error) setChatError(error);
  }, []);

  const handleCallClosed = useCallback(reason => {
    clearActiveCall();
    if (reason === 'timeout') setChatError('Cuộc gọi không được trả lời.');
    if (reason === 'disconnected') setChatError('Cuộc gọi bị gián đoạn do mất kết nối.');
  }, [clearActiveCall]);

  const handleStartCall = async audioOnly => {
    if (!callActionCapability.available) {
      setChatError(callActionCapability.reason);
      return;
    }
    const room = conversationsRef.current[currentChatIdRef.current] || activeChat;
    try {
      setChatError('');
      await ensureTinodeSession();
      const topic = await ensureTinodeConversationTopic(room);
      const capability = tinodeClient.getCallCapability(topic, {
        isGroup: Boolean(room?.isGroup),
        isChatbot: Boolean(room?.isChatbot),
      });
      if (!capability.available) throw new Error(capability.reason);
      const nextCall = {
        id: `${topic}:outgoing:${Date.now()}`,
        topic,
        direction: 'outgoing',
        audioOnly: Boolean(audioOnly),
        ...callPeerDetails(room, currentUserRef.current),
      };
      activeCallRef.current = nextCall;
      setActiveCall(nextCall);
    } catch (error) {
      setChatError(error?.message || 'Không thể bắt đầu cuộc gọi.');
    }
  };

  const showIncomingNotification = useCallback((conversation, message, stateId) => {
    if (!message || message.senderId === viewerId || typeof window === 'undefined') return;
    const shouldAlert = document.visibilityState === 'hidden' || currentChatIdRef.current !== stateId;
    if (!shouldAlert) return;
    const notificationRoom = conversationsRef.current[stateId] || conversation;
    if (isConversationMuted(notificationRoom?.notificationMutedUntil)) return;

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
  }, [settings.sounds, viewerId]);

  // Keep the React view synchronized with Tinode's topic callbacks.
  useEffect(() => {
    if (!isLoggedIn || chatMode !== 'tinode' || managementConversationSession !== accountSessionRef.current) return undefined;
    const accountSession = managementConversationSession;
    return tinodeClient.onEvent(async event => {
      if (accountSessionRef.current !== accountSession) return;
      if (event.type === 'disconnect') {
        clearActiveCall();
        setConnectionStatus('offline');
        setChatError('Kết nối chat đã bị gián đoạn. Hệ thống sẽ tự kết nối lại.');
        return;
      }
      if (event.type === 'reconnecting') {
        setConnectionStatus(tinodeClient.authenticated ? 'online' : 'connecting');
        return;
      }
      if (event.type === 'reconnect') {
        setConnectionStatus('online');
        setChatError('');
        applyPresenceSnapshot(tinodeClient.getPresenceSnapshot());
        return;
      }
      if (event.type === 'reconnect-error') {
        setConnectionStatus(tinodeClient.authenticated ? 'online' : 'offline');
        setChatError(event.error?.message || 'Không thể khôi phục kết nối Tinode. Vui lòng đăng nhập lại.');
        return;
      }
      if (tinodeClient.authenticated) setConnectionStatus('online');
      if (event.type === 'presence') {
        if (event.uid) applyPresenceSnapshot({ [event.uid]: Boolean(event.online) });
        return;
      }
      if (event.type === 'presence-snapshot') {
        applyPresenceSnapshot(event.snapshot || {});
        return;
      }
      if (event.type === 'receipt') {
        const receiptSequence = Number(event.seq);
        if (!event.topic || !Number.isFinite(receiptSequence) || receiptSequence <= 0) return;
        setConversations(previous => {
          let changed = false;
          const next = Object.fromEntries(Object.entries(previous).map(([id, room]) => {
            if (room.accountSession !== accountSession || room.tinodeTopic !== event.topic) return [id, room];
            const messages = applyReceiptToMessages(room.messages || [], {
              seq: receiptSequence,
              what: event.what,
              viewerId,
            });
            if (messages === room.messages) return [id, room];
            changed = true;
            return [id, { ...room, messages }];
          }));
          if (changed) conversationsRef.current = next;
          return changed ? next : previous;
        });
        return;
      }
      if (event.type === 'contacts') {
        // A new invite or P2P topic is first reported through the `me` topic.
        // Chatmgt binding can commit just after the Tinode invite, so retry
        // only while Tinode still has a topic which Chatmgt has not allowed.
        const scheduleContactsSync = attempt => {
          const sessionActive = accountSessionRef.current === accountSession;
          const pendingTopicNames = attempt === 0 ? [] : tinodeClient.getPendingConversationTopics();
          const delay = tinodeContactsSyncDelay(attempt, { sessionActive, pendingTopicNames });
          if (delay === null) return false;
          contactsSyncTimerRef.current = setTimeout(() => {
            contactsSyncTimerRef.current = null;
            if (accountSessionRef.current !== accountSession) return;
            contactsSyncRequestRef.current = accountSession;
            refreshManagementConversations(accountSession)
              .then(() => (
                accountSessionRef.current === accountSession
                  ? tinodeClient.listConversations()
                  : []
              ))
              .then(() => {
                if (contactsSyncRequestRef.current === accountSession) contactsSyncRequestRef.current = 0;
                if (accountSessionRef.current === accountSession) scheduleContactsSync(attempt + 1);
              })
              .catch(error => {
                if (contactsSyncRequestRef.current === accountSession) contactsSyncRequestRef.current = 0;
                if (accountSessionRef.current === accountSession && !scheduleContactsSync(attempt + 1)) {
                  setChatError(error?.message || 'Không đồng bộ được danh sách cuộc trò chuyện.');
                }
              });
          }, delay);
          return true;
        };
        if (!contactsSyncTimerRef.current && contactsSyncRequestRef.current !== accountSession) {
          scheduleContactsSync(0);
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
      if (event.type === 'call-invite') {
        if (!CALLS_ENABLED) {
          tinodeClient.sendCallSignal(event.topic, event.seq, 'hang-up').catch(() => {});
          return;
        }
        const currentRooms = conversationsRef.current;
        const managedEntry = Object.entries(currentRooms)
          .filter(([, room]) => room.accountSession === accountSession)
          .find(([, room]) => room.tinodeTopic === event.topic);
        const room = managedEntry?.[1];
        const capability = tinodeClient.getCallCapability(event.topic, {
          isGroup: Boolean(room?.isGroup),
          isChatbot: Boolean(room?.isChatbot),
        });
        if (activeCallRef.current || !room || !capability.available) {
          tinodeClient.sendCallSignal(event.topic, event.seq, 'hang-up').catch(() => {});
          if (!activeCallRef.current && !capability.available) setChatError(capability.reason);
          return;
        }
        const nextCall = {
          id: `${event.topic}:${event.seq}`,
          topic: event.topic,
          seq: event.seq,
          direction: 'incoming',
          audioOnly: Boolean(event.audioOnly),
          ...callPeerDetails(room, currentUser),
        };
        activeCallRef.current = nextCall;
        setActiveCall(nextCall);
        return;
      }
      if ((event.type === 'profile' || event.type === 'user-profile') && event.profile?.id) {
        const profileAccount = findAccount(directoryAccountsRef.current, event.profile.id);
        const profile = profileAccount
          ? {
            ...event.profile,
            id: profileAccount.id,
            uid: profileAccount.uid || profileAccount.id,
            tinodeUid: profileAccount.tinodeUid || profileAccount.tinode_uid || event.profile.id,
          }
          : event.profile;
        rememberAvatarOverride(profile, profile.avatar);
        if (identitiesOverlap(currentUser, profile)) {
          setCurrentUser(previous => ({
            ...previous,
            name: profile.name || previous?.name,
            avatar: profile.avatar || previous?.avatar || '',
          }));
        }
        const updateAccount = account => mergeRealtimeAccountProfile(account, profile);
        setDirectoryAccounts(previous => updateAccountProfiles(previous, profile));
        setWorkspaceResults(previous => updateAccountProfiles(previous, profile));
        setConversations(previous => Object.fromEntries(Object.entries(previous).map(([id, room]) => {
          const members = (room.members || []).map(updateAccount);
          const peer = !room.isGroup ? members.find(member => identitiesOverlap(member, profile)) : null;
          return [id, {
            ...room,
            ...(peer ? { name: profile.name || room.name, avatarUrl: profile.avatar || room.avatarUrl || '' } : {}),
            members,
            messages: (room.messages || []).map(message => identitiesOverlap({ id: message.senderId }, profile)
              ? { ...message, senderName: profile.name || message.senderName, avatar: profile.avatar || message.avatar || '' }
              : message),
          }];
        })));
        return;
      }
      if (event.type === 'conversation' && event.conversation) {
        const expectedTinodeUid = String(currentUser?.tinodeUid || '');
        if (expectedTinodeUid && String(event.sessionUid || '') !== expectedTinodeUid) return;
        const conversation = normalizeTinodeConversation(event.conversation);
        const currentRooms = conversationsRef.current;
        const managedEntry = Object.entries(currentRooms)
          .filter(([, room]) => room.accountSession === accountSession)
          .find(([, room]) => room.tinodeTopic === conversation.id);
        if (!managedEntry) return;
        const stateId = managedEntry[0];
        if (deletedConversationIdsRef.current.has(stateId) || deletedConversationIdsRef.current.has(conversation.id)) return;
        if (isConversationHiddenAfterDelete(conversation)) {
          setConversations(prev => {
            const next = { ...prev };
            delete next[stateId];
            conversationsRef.current = next;
            return next;
          });
          return;
        }
        if (isSelfDirectConversation(conversation, currentUser, directoryAccounts)) {
          deletedConversationIdsRef.current.add(conversation.id);
          tinodeClient.deleteConversation(conversation.id, { unsubscribe: true }).catch(() => {});
          setConversations(prev => {
            const next = { ...prev };
            delete next[stateId];
            conversationsRef.current = next;
            return next;
          });
          if (currentChatIdRef.current === stateId) setCurrentChatId(CHATBOT_ACCOUNT.id);
          return;
        }
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
          if (!previousRoom || previousRoom.accountSession !== accountSession || previousRoom.tinodeTopic !== conversation.id) return prev;
          const incoming = {
            ...conversation,
            id: stateId,
            managementId: previousRoom.managementId,
            tinodeTopic: conversation.id,
            accountSession,
          };
          const next = {
            ...prev,
            [stateId]: mergeTinodeConversation(previousRoom, incoming),
          };
          conversationsRef.current = next;
          return next;
        });
        return;
      }
    });
  }, [isLoggedIn, chatMode, managementConversationSession, currentUser, directoryAccounts, applyPresenceSnapshot, clearActiveCall, refreshManagementConversations, showIncomingNotification, viewerId]);

  // Keep every known Tinode topic subscribed after login. This is the piece
  // that makes unread badges and notifications realtime before a chat is opened.
  useEffect(() => {
    if (!isLoggedIn || chatMode !== 'tinode' || managementConversationSession !== accountSessionRef.current) return undefined;
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
          setConnectionStatus(tinodeClient.authenticated ? 'online' : 'offline');
          setChatError(error?.message || 'Không thể đồng bộ chat realtime.');
        }
      });
    return () => { cancelled = true; };
  }, [isLoggedIn, chatMode, managementConversationSession, ensureTinodeSession, applyPresenceSnapshot]);

  const handleLoginSuccess = async (user) => {
    clearActiveCall();
    if (!EXTERNAL_CHAT_ONLY) await tinodeClient.logout();
    setLoginNotice('');
    const accountSession = ++accountSessionRef.current;
    managementConversationSessionRef.current = 0;
    setManagementConversationSession(0);
    const managementUserId = String(user.id || user.uid || '');
    const initialChatbot = createChatbotConversation(loadChatbotMessages(managementUserId));
    const initialRooms = { [CHATBOT_ACCOUNT.id]: initialChatbot };
    forcedLogoutRef.current = false;
    isLoggingOutRef.current = false;
    setForcedLogoutSeconds(null);
    setDrafts({});
    setMessageMentions({});
    setMentionContext(null);
    setInputText('');
    setNotificationMuteDialog(null);
    setIsUpdatingNotificationMute(false);
    setNotificationClock(Date.now());
    setDirectoryAccounts([]);
    avatarOverridesRef.current.clear();
    setWorkspaceResults([]);
    setEnterpriseTaskSeed(null);
    conversationsRef.current = initialRooms;
    setConversations(initialRooms);
    setCurrentChatId(CHATBOT_ACCOUNT.id);
    deletedConversationIdsRef.current.clear();
    notificationBaselineRef.current.clear();
    tinodeSessionRequestRef.current = null;
    if (contactsSyncTimerRef.current) clearTimeout(contactsSyncTimerRef.current);
    contactsSyncTimerRef.current = null;
    contactsSyncRequestRef.current = 0;
    setCurrentUser(user);
    setChatMode(EXTERNAL_CHAT_ONLY ? 'external' : (user.connection || 'demo'));
    setConnectionStatus(EXTERNAL_CHAT_ONLY
      ? 'external'
      : user.connection === 'tinode' ? 'ready' : user.connection === 'management' ? 'managed' : 'demo');
    setChatError('');
    setIsLoggedIn(true);
    if (EXTERNAL_CHAT_ONLY) {
      managementConversationSessionRef.current = accountSession;
      setManagementConversationSession(accountSession);
      loadChatbotMessagesFromServer(user).then(messages => {
        if (accountSessionRef.current !== accountSession) return;
        const nextRooms = { [CHATBOT_ACCOUNT.id]: createChatbotConversation(messages) };
        conversationsRef.current = nextRooms;
        setConversations(nextRooms);
      }).catch(() => {});
      return;
    }
    try {
        rememberAvatarOverride(user, user.avatar);
        const [directoryUsers, tinodeChatbotConfig] = await Promise.all([
          chatManagementService.listUsers(),
          loadTinodeChatbotConfig(),
        ]);
        const tinodeChatbotEnabled = applyTinodeChatbotConfig(tinodeChatbotConfig);
        const chatbotRoom = createChatbotConversation(
          tinodeChatbotEnabled ? [] : loadChatbotMessages(managementUserId),
          { accountSession, useTinode: tinodeChatbotEnabled },
        );
        const accounts = mergeDirectoryAccountSnapshots([user], directoryUsers)
          .map(account => ({ ...account, avatar: avatarOverrideFor(account) || account.avatar || '' }));
        if (accountSessionRef.current !== accountSession) return;
        setDirectoryAccounts(accounts);
        if (chatManagementService.directorySync?.status === 'stale') {
          setChatError('Account đang tạm thời không trả được danh bạ mới; Chatmgt đang hiển thị dữ liệu đồng bộ gần nhất.');
        }
        const managed = await chatManagementService.listConversations({
          userId: managementUserId,
        });
        if (accountSessionRef.current !== accountSession) return;
        const managedRooms = managementRoomsForSession(managed, accounts, user, accountSession);
        const next = {
          ...managedRooms,
          [CHATBOT_ACCOUNT.id]: chatbotRoom,
        };
        conversationsRef.current = next;
        setConversations(next);
        tinodeClient.setAllowedConversationTopics(managedTinodeTopics(next));
        managementConversationSessionRef.current = accountSession;
        setManagementConversationSession(accountSession);
        setCurrentChatId(firstVisibleConversationId(next, {}, CHATBOT_ACCOUNT.id));
        try {
          const friendRequests = await chatManagementService.listFriendRequests(managementUserId);
          if (accountSessionRef.current !== accountSession) return;
          friendRequests.forEach(request => {
            const contactId = request.requesterId === managementUserId ? request.recipientId : request.requesterId;
            appendLocalFriendEvent(contactId, findAccount(accounts, contactId), request);
          });
        } catch (friendError) {
          if (accountSessionRef.current !== accountSession) return;
          setChatError(previous => previous || (
            friendError?.message || 'Không tải được lời mời kết bạn từ Chatmgt.'
          ));
        }
        if (chatManagementService.chatEngine === 'tinode') {
          try {
            const tinodeAuth = await chatManagementService.refreshTinodeToken();
            if (accountSessionRef.current !== accountSession) return;
            setCurrentUser(previous => ({
              ...previous,
              connection: 'tinode',
              tinodeUid: tinodeAuth.uid || previous?.tinodeUid,
              tinodeAuth,
            }));
            setChatMode('tinode');
            setConnectionStatus('ready');
          } catch (realtimeError) {
            if (accountSessionRef.current !== accountSession) return;
            setChatMode('management');
            setConnectionStatus('managed');
            setChatError(previous => previous || (
              realtimeError?.message
              || 'Dữ liệu Chatmgt đã sẵn sàng nhưng kết nối realtime Tinode đang tạm gián đoạn.'
            ));
          }
        }
        if (!tinodeChatbotEnabled) {
          loadChatbotMessagesFromServer(user).then(messages => {
            if (accountSessionRef.current !== accountSession) return;
            setConversations(previous => ({
              ...previous,
              [CHATBOT_ACCOUNT.id]: createChatbotConversation(messages),
            }));
          }).catch(() => {});
        }
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
    if (chatMode === 'tinode' && (!room?.isChatbot || room?.tinodeTopic)) {
      try {
        const topicName = room.isChatbot
          ? room.tinodeTopic
          : await ensureTinodeConversationTopic(room);
        const openedRoom = normalizeTinodeConversation(await tinodeClient.openConversation(topicName));
        const managedRoom = room.isChatbot
          ? {
            ...openedRoom,
            id,
            isChatbot: true,
            name: CHATBOT_ACCOUNT.name,
            avatarHtml: <img src={CHATBOT_ACCOUNT.avatar} alt={CHATBOT_ACCOUNT.name} />,
            tinodeTopic: topicName,
            accountSession: room.accountSession,
          }
          : { ...openedRoom, id, managementId: room.managementId || id, tinodeTopic: topicName };
        setConversations(prev => ({
          ...prev,
          [id]: mergeTinodeConversation(prev[id], managedRoom),
        }));
        await tinodeClient.markRead(topicName);
      } catch (err) {
        setConnectionStatus(tinodeClient.authenticated ? 'online' : 'offline');
        setChatError(err?.message || 'Không mở được cuộc trò chuyện.');
      }
    }
  };

  const handleLogout = async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    accountSessionRef.current += 1;
    managementConversationSessionRef.current = 0;
    setManagementConversationSession(0);
    tinodeClient.setAllowedConversationTopics([]);
    clearActiveCall();
    forcedLogoutRef.current = false;
    setForcedLogoutSeconds(null);
    if (chatMode === 'tinode') {
      try {
        await tinodeClient.logout();
      } catch {
        // Local state is still cleared below so a network failure cannot trap the user.
      }
    }
    let chatLogoutFailed = false;
    try {
      await chatManagementService.logout({ throwOnError: true });
    } catch {
      chatLogoutFailed = true;
    }
    if (chatMode === 'demo') {
      Object.values(conversations)
        .filter(room => !room.isGroup && !room.isChatbot && room.messages?.length > 0)
        .forEach(room => persistDemoDirectMessage(room, null));
    }
    setLoginNotice(chatLogoutFailed
      ? 'Dữ liệu Chat trên thiết bị đã được đóng, nhưng máy chủ chưa xác nhận việc thu hồi phiên. Vui lòng đăng nhập lại sau khi kiểm tra kết nối.'
      : 'Bạn đã đăng xuất khỏi Chat.');
    setIsLoggedIn(false);
    setCurrentUser(null);
    setDrafts({});
    setMessageMentions({});
    setMentionContext(null);
    setInputText('');
    setChatMode('demo');
    setConnectionStatus(isTinodeConfigured ? 'ready' : 'demo');
    setChatError('');
    setFriendNotice('');
    setWorkspacePanel(null);
    setEnterpriseTaskSeed(null);
    setNotificationMuteDialog(null);
    setIsUpdatingNotificationMute(false);
    setNotificationClock(Date.now());
    tinodeSessionRequestRef.current = null;
    deletedConversationIdsRef.current.clear();
    notificationBaselineRef.current.clear();
    typingNoticeAtRef.current.clear();
    typingClearTimersRef.current.forEach(timer => clearTimeout(timer));
    typingClearTimersRef.current.clear();
    if (contactsSyncTimerRef.current) clearTimeout(contactsSyncTimerRef.current);
    contactsSyncTimerRef.current = null;
    contactsSyncRequestRef.current = 0;
    setTypingByTopic({});
    const initialRooms = createInitialConversations();
    conversationsRef.current = initialRooms;
    setConversations(initialRooms);
    setCurrentChatId(CHATBOT_ACCOUNT.id);
    isLoggingOutRef.current = false;
  };

  const requestLogout = () => {
    if (!window.confirm('Bạn có chắc chắn muốn đăng xuất khỏi Chat?')) return;
    setWorkspacePanel(null);
    handleLogout();
  };

  const handleForcedLogout = async () => {
    await handleLogout();
    // Reload so a revoked tab cannot carry an old bundle or room state into
    // the next account.
    if (typeof window !== 'undefined') window.location.reload();
  };

  logoutHandlerRef.current = handleLogout;
  forcedLogoutHandlerRef.current = handleForcedLogout;

  useEffect(() => {
    if (!isLoggedIn || !chatManagementService.remote) return undefined;
    let cancelled = false;
    let checking = false;
    const validateSession = async () => {
      if (checking) return;
      if (forcedLogoutRef.current) return;
      checking = true;
      try {
        await chatManagementService.currentSession();
      } catch (error) {
        if (!cancelled && error?.status === 401) {
          if (error?.code === 'SESSION_REVOKED') {
            forcedLogoutRef.current = true;
            setForcedLogoutSeconds(5);
          } else {
            await logoutHandlerRef.current?.();
          }
        }
      } finally {
        checking = false;
      }
    };
    const validateVisibleSession = () => {
      if (document.visibilityState !== 'hidden') validateSession();
    };
    const timer = window.setInterval(validateSession, 5000);
    window.addEventListener('focus', validateSession);
    document.addEventListener('visibilitychange', validateVisibleSession);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', validateSession);
      document.removeEventListener('visibilitychange', validateVisibleSession);
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (forcedLogoutSeconds === null) return undefined;
    if (forcedLogoutSeconds <= 0) {
      forcedLogoutHandlerRef.current?.();
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setForcedLogoutSeconds(previous => previous === null ? null : Math.max(0, previous - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [forcedLogoutSeconds]);

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

  const handleFilterGroupMembers = event => {
    setGroupMemberSearch(event.target.value);
  };

  const openWorkspacePanel = (panel) => {
    setWorkspacePanel(panel);
    setWorkspaceQuery('');
    setWorkspaceResults([]);
    setChatError('');
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
        members: (room.members || []).map(member => identitiesOverlap(member, currentUser)
          ? { ...member, name: updated.name, avatar: updated.avatar || member.avatar }
          : member),
        messages: (room.messages || []).map(message => identitiesOverlap(message, currentUser)
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
      let updated;
      if (accountProfileReadOnly) {
        updated = await chatManagementService.updateAvatar(file);
        avatar = updated?.avatar;
        if (chatMode === 'tinode' && avatar) {
          try {
            await ensureTinodeSession();
            await tinodeClient.updateCurrentProfile({
              name: currentUser?.name,
              avatarUrl: avatar,
            });
          } catch (tinodeError) {
            setChatError(tinodeError?.message || 'Ảnh đã lưu trên Account nhưng Tinode chưa đồng bộ ngay.');
          }
        }
      } else {
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
        updated = await chatManagementService.updateProfile({ avatar });
      }
      if (!avatar) throw new Error('Máy chủ không trả về ảnh đại diện mới.');
      const nextAvatar = updated.avatar || avatar;
      rememberAvatarOverride(updated || currentUser, nextAvatar);
      setCurrentUser(previous => ({ ...previous, avatar: nextAvatar }));
      setDirectoryAccounts(previous => {
        const next = previous.map(account => (
          identitiesOverlap(account, updated || currentUser) ? { ...account, avatar: nextAvatar } : account
        ));
        directoryAccountsRef.current = next;
        return next;
      });
      setConversations(previous => Object.fromEntries(Object.entries(previous).map(([id, room]) => [id, {
        ...room,
        members: (room.members || []).map(member => identitiesOverlap(member, currentUser) ? { ...member, avatar: nextAvatar } : member),
        messages: (room.messages || []).map(message => identitiesOverlap(message, currentUser) ? { ...message, avatar: nextAvatar } : message),
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

  const appendLocalFriendEvent = useCallback((roomId, contact, event) => {
    if (!event?.requestId) return;
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
          name: contact?.name || room.name,
          avatarUrl: contact?.avatar || room.avatarUrl || '',
          members: contact ? [contact] : room.members,
          friendEvents: mergeTinodeMessages(room.friendEvents || [], [message]),
        },
      };
    });
  }, []);

  // Chatmgt currently exposes friend requests and directory profiles through
  // HTTP, so keep those UI surfaces realtime without requiring a reload.
  useEffect(() => {
    if (!isLoggedIn || !chatManagementService.remote || !managementViewerId) return undefined;
    const accountSession = accountSessionRef.current;
    let cancelled = false;
    let syncing = false;

    const syncManagementDirectory = async () => {
      if (cancelled || syncing || accountSessionRef.current !== accountSession) return;
      syncing = true;
      try {
        const [accounts, requests] = await Promise.all([
          chatManagementService.listUsers(),
          chatManagementService.listFriendRequests(managementViewerId),
        ]);
        if (cancelled || accountSessionRef.current !== accountSession) return;

        const previousAccounts = directoryAccountsRef.current;
        const mergedAccounts = mergeDirectoryAccountSnapshots(previousAccounts, accounts);
        const nextAccounts = mergedAccounts.map(account => {
          const previous = findAccount(previousAccounts, account.id || account.uid || account.tinodeUid);
          const override = avatarOverrideFor(account);
          const next = override ? { ...account, avatar: override } : account;
          return previous && typeof previous.online === 'boolean'
            ? { ...next, online: previous.online }
            : next;
        });
        const accountsChanged = previousAccounts.length !== nextAccounts.length
          || nextAccounts.some(account => {
            const previous = findAccount(previousAccounts, account.id || account.uid || account.tinodeUid);
            return !previous || ['id', 'uid', 'tinodeUid', 'username', 'name', 'avatar', 'email', 'title', 'department', 'active', 'online']
              .some(key => previous[key] !== account[key]);
          });
        const effectiveAccounts = accountsChanged ? nextAccounts : previousAccounts;
        if (accountsChanged) {
          directoryAccountsRef.current = nextAccounts;
          setDirectoryAccounts(nextAccounts);
        }
        const refreshResultList = results => (results || []).map(result => {
          const account = findAccount(effectiveAccounts, result.id || result.uid || result.tinodeUid || result.name);
          if (!account) return result;
          const next = { ...result, ...account, online: result.online };
          return ['name', 'avatar', 'email', 'title', 'department', 'active'].some(key => result[key] !== next[key])
            ? next
            : result;
        });
        setWorkspaceResults(previous => {
          const next = refreshResultList(previous);
          return next.length === previous.length && next.every((item, index) => item === previous[index]) ? previous : next;
        });
        const self = findAccount(effectiveAccounts, managementViewerId);
        if (self) {
          setCurrentUser(previous => {
            const next = {
              ...previous,
              name: self.name || previous?.name,
              avatar: self.avatar || previous?.avatar || '',
              email: self.email || previous?.email,
              title: self.title || previous?.title,
              department: self.department || previous?.department,
            };
            return ['name', 'avatar', 'email', 'title', 'department'].some(key => next[key] !== previous?.[key])
              ? next
              : previous;
          });
        }

        setConversations(previous => {
          let changed = false;
          const nextConversations = Object.fromEntries(Object.entries(previous).map(([id, room]) => {
          const members = (room.members || []).map(member => {
            const account = findAccount(effectiveAccounts, member.id || member.uid || member.tinodeUid || member.name);
            if (!account) return member;
            const updated = { ...member, name: account.name || member.name, avatar: account.avatar || member.avatar || '', online: member.online };
            return updated.name === member.name && updated.avatar === member.avatar ? member : updated;
          });
          const peer = !room.isGroup
            ? members.find(member => !identitiesOverlap(member, currentUser))
            : null;
          const messages = (room.messages || []).map(message => {
            const account = findAccount(effectiveAccounts, message.senderId || message.senderName);
            if (!account) return message;
            const updated = { ...message, senderName: account.name || message.senderName, avatar: account.avatar || message.avatar || '' };
            return updated.senderName === message.senderName && updated.avatar === message.avatar ? message : updated;
          });
          const friendEvents = (room.friendEvents || []).map(message => {
            const event = message.friendEvent || {};
            const account = findAccount(effectiveAccounts, event.action === 'request' ? event.requesterId : event.responderId);
            if (!account) return message;
            const updated = { ...message, senderName: account.name || message.senderName, avatar: account.avatar || message.avatar || '' };
            return updated.senderName === message.senderName && updated.avatar === message.avatar ? message : updated;
          });
          const nextRoom = {
            ...room,
            members,
            messages,
            friendEvents,
            ...(peer ? { name: peer.name || room.name, avatarUrl: peer.avatar || room.avatarUrl || '' } : {}),
          };
          const membersChanged = members.length !== (room.members || []).length
            || members.some((member, index) => member !== room.members?.[index]);
          const messagesChanged = messages.length !== (room.messages || []).length
            || messages.some((message, index) => message !== room.messages?.[index]);
          const friendEventsChanged = friendEvents.length !== (room.friendEvents || []).length
            || friendEvents.some((message, index) => message !== room.friendEvents?.[index]);
          const roomChanged = membersChanged || messagesChanged || friendEventsChanged
            || nextRoom.name !== room.name || nextRoom.avatarUrl !== room.avatarUrl;
          if (roomChanged) changed = true;
          return [id, roomChanged ? nextRoom : room];
          }));
          return changed ? nextConversations : previous;
        });

        requests.forEach(request => {
          const contactId = request.requesterId === managementViewerId ? request.recipientId : request.requesterId;
          appendLocalFriendEvent(contactId, findAccount(effectiveAccounts, contactId), request);
        });
      } catch {
        // A background management sync failure must not interrupt chat.
      } finally {
        syncing = false;
      }
    };

    void syncManagementDirectory();
    const timer = window.setInterval(syncManagementDirectory, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isLoggedIn, managementViewerId, currentUser, appendLocalFriendEvent]);

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
      appendLocalFriendEvent(
        record.roomId,
        findAccount(directoryAccountsRef.current, record.event.requesterId) || {
          id: record.event.requesterId,
          name: record.event.requesterName,
          avatar: record.message.avatar,
        },
        response,
      );
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
    const viewerId = currentUser?.id || currentUser?.uid;
    const accountSession = accountSessionRef.current;
    const linkedRoom = Object.values(conversations).find(room => (
      !room.isGroup
      && !room.isChatbot
      && room.accountSession === accountSession
      && isManagementConversationId(room.managementId || room.id)
      && (
        (room.participantIds || []).map(String).includes(String(contact.id))
        || room.members?.some(member => findAccount(directoryAccounts, member.id || member.name)?.id === contact.id)
      )
    ));
    const participantIds = contact.id ? [viewerId, contact.id] : [];
    const contactId = chatMode === 'demo' && participantIds.length === 2
      ? directConversationId(...participantIds)
      : linkedRoom?.id || contact.id || contact.name;
    try {
      let stateConversationId = contactId;
      deletedConversationIdsRef.current.delete(contactId);
      let managedRoom = linkedRoom;
      let tinodeTopic = linkedRoom?.tinodeTopic
        || chatManagementService.getTinodeTopic(viewerId, linkedRoom?.managementId || contactId);
      if (usesManagementData && contact.id) {
        if (managementConversationSessionRef.current !== accountSession) {
          throw new Error('Danh sách cuộc trò chuyện chưa được chatmgt xác nhận.');
        }
        if (!managedRoom) {
          managedRoom = await chatManagementService.createConversation({
            userId: viewerId,
            subject: contact.name,
            participantIds: [contact.id],
            properties: {},
          });
          if (accountSessionRef.current !== accountSession) throw new Error('Phiên tài khoản đã thay đổi.');
        }
        stateConversationId = managedRoom.id;
        const managedStateRoom = {
          ...managedRoom,
          id: stateConversationId,
          managementId: managedRoom.managementId || stateConversationId,
          tinodeTopic,
          name: contact.name,
          isGroup: false,
          members: [currentUser, contact],
          participantIds,
          accountSession,
        };
        if (chatMode === 'tinode') {
          tinodeTopic = await ensureTinodeConversationTopic(managedStateRoom);
          await tinodeClient.restoreConversation(tinodeTopic);
        }
      }
      const previousRooms = conversationsRef.current;
      const existing = previousRooms[stateConversationId] || previousRooms[contactId] || managedRoom || linkedRoom;
      const next = { ...previousRooms };
      if (linkedRoom && linkedRoom.id !== stateConversationId) delete next[linkedRoom.id];
      next[stateConversationId] = {
        ...existing,
        id: stateConversationId,
        managementId: managedRoom?.managementId || linkedRoom?.managementId || stateConversationId,
        tinodeTopic,
        name: contact.name,
        isGroup: false,
        avatarHtml: contact.avatar ? <img src={contact.avatar} alt={contact.name} /> : <span>{contact.name.slice(0, 1).toUpperCase()}</span>,
        avatarClass: '',
        membersCount: accountPresenceLabel(contact),
        description: '',
        admin: '',
        members: [contact],
        participantIds: participantIds.length === 2 ? participantIds : existing?.participantIds,
        messages: existing?.messages || [],
        lastMsg: existing?.lastMsg || 'Bắt đầu cuộc trò chuyện',
        time: existing?.time || getTimeString(),
        updatedAt: existing?.updatedAt || new Date().toISOString(),
        badge: existing?.badge || 0,
        ...(usesManagementData ? { accountSession } : {}),
      };
      conversationsRef.current = next;
      setConversations(next);
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
      let departedTopic = '';
      if (usesManagementData) {
        await chatManagementService.removeConversationParticipant(
          activeChat.managementId || activeChat.id,
          actorId,
        );
        departedTopic = activeChat.tinodeTopic || '';
      } else {
        if (chatMode === 'tinode' && activeChat.id) {
          departedTopic = await ensureTinodeConversationTopic(activeChat);
          await tinodeClient.sendSystemEvent(departedTopic, {
            action: 'member_left',
            actorId,
            actorName: currentUser?.name,
          });
        }
        persistDemoGroupMessage(activeChat, systemMessage);
        leaveDemoGroup(activeChat.id, actorId);
      }
      if (departedTopic) tinodeClient.disallowConversationTopic(departedTopic);
      setConversations(prev => {
        const next = { ...prev };
        delete next[activeChat.id];
        return next;
      });
      const remainingRooms = Object.fromEntries(
        Object.entries(conversations).filter(([id]) => id !== activeChat.id),
      );
      const nextId = firstVisibleConversationId(remainingRooms, drafts, CHATBOT_ACCOUNT.id);
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
    const deleteEffect = usesManagementData
      ? `${kind} sẽ được gỡ khỏi Chatmgt và phiên realtime Tinode của bạn.`
      : `Toàn bộ tin nhắn và tệp trong ${kind} này sẽ bị xóa khỏi tài khoản của bạn và không thể khôi phục.`;
    const confirmed = window.confirm(
      `Bạn có chắc muốn xóa ${kind} "${activeChat.name}"?\n\n${deleteEffect}`,
    );
    if (!confirmed) return;

    const conversationId = activeChat.id;
    const viewerId = currentUser?.id || currentUser?.uid;
    setIsDeletingConversation(true);
    setChatError('');
    const deletedKeys = [conversationId, activeChat.managementId, activeChat.tinodeTopic]
      .filter(Boolean)
      .map(String);
    deletedKeys.forEach(key => deletedConversationIdsRef.current.add(key));
    try {
      let removedTopic = '';
      if (chatMode === 'tinode') {
        removedTopic = await ensureTinodeConversationTopic(activeChat);
        if (activeChat.isGroup && !usesManagementData) {
          await tinodeClient.sendSystemEvent(removedTopic, {
            action: 'member_left',
            actorId: viewerId,
            actorName: currentUser?.name,
          });
        }
      }
      if (usesManagementData) {
        if (chatMode === 'tinode') await chatManagementService.getFreshTinodeAuth();
        await chatManagementService.deleteConversationForCurrentUser(activeChat.managementId || activeChat.id);
      } else if (activeChat.isGroup) {
        deleteDemoGroupForUser(conversationId, viewerId, currentUser?.name);
      } else {
        deleteDemoDirectForUser(conversationId, viewerId);
      }
      if (removedTopic) tinodeClient.disallowConversationTopic(removedTopic);

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
      const remainingRooms = Object.fromEntries(
        Object.entries(conversations).filter(([id]) => id !== conversationId),
      );
      const nextId = firstVisibleConversationId(remainingRooms, drafts, CHATBOT_ACCOUNT.id);
      setCurrentChatId(nextId);
      setIsDetailOpen(false);
      setTimeout(() => deletedKeys.forEach(key => deletedConversationIdsRef.current.delete(key)), 5000);
    } catch (error) {
      deletedKeys.forEach(key => deletedConversationIdsRef.current.delete(key));
      setChatError(error?.message || 'Không thể xóa cuộc trò chuyện.');
    } finally {
      setIsDeletingConversation(false);
    }
  };

  const updateConversationMute = async (conversationId, mutedUntil) => {
    const room = conversationsRef.current[conversationId];
    if (!room || room.isChatbot || room.id === 'empty') return false;
    setIsUpdatingNotificationMute(true);
    setChatError('');
    try {
      let persistedMuteUntil = mutedUntil;
      const managementConversationId = room.managementId || room.id;
      if (chatManagementService.remote && chatMode !== 'demo') {
        if (!isManagementConversationId(managementConversationId)) {
          throw new Error('Chatmgt chưa xác nhận cuộc trò chuyện này.');
        }
        const updated = await chatManagementService.updateConversationNotifications(
          managementConversationId,
          mutedUntil,
        );
        persistedMuteUntil = updated.notificationMutedUntil;
      }
      setConversations(previous => {
        if (!previous[conversationId]) return previous;
        const next = {
          ...previous,
          [conversationId]: {
            ...previous[conversationId],
            notificationMutedUntil: persistedMuteUntil,
          },
        };
        conversationsRef.current = next;
        return next;
      });
      setNotificationClock(Date.now());
      return true;
    } catch (error) {
      setChatError(error?.message || 'Không thể cập nhật thiết lập thông báo của cuộc trò chuyện.');
      return false;
    } finally {
      setIsUpdatingNotificationMute(false);
    }
  };

  const handleConversationMuteToggle = event => {
    if (event.target.checked) {
      setNotificationMuteOption(NOTIFICATION_MUTE_OPTIONS.ONE_HOUR);
      setNotificationMuteDialog({ id: activeChat.id, name: activeChat.name });
      return;
    }
    void updateConversationMute(activeChat.id, null);
  };

  const handleNotificationMuteSubmit = async event => {
    event.preventDefault();
    if (!notificationMuteDialog) return;
    const mutedUntil = resolveNotificationMuteUntil(notificationMuteOption, Date.now());
    const updated = await updateConversationMute(notificationMuteDialog.id, mutedUntil);
    if (updated) setNotificationMuteDialog(null);
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
      if (usesManagementData) {
        const accountSession = accountSessionRef.current;
        if (managementConversationSessionRef.current !== accountSession) {
          throw new Error('Danh sách cuộc trò chuyện chưa được chatmgt xác nhận.');
        }
        const managedRoom = await chatManagementService.createConversation({
          userId: actorId,
          subject: name,
          isGroup: true,
          participantIds: groupMemberIds,
          properties: { description: groupDescription.trim() },
        });
        if (accountSessionRef.current !== accountSession) throw new Error('Phiên tài khoản đã thay đổi.');
        room = {
          ...managedRoom,
          id: managedRoom.id,
          managementId: managedRoom.managementId || managedRoom.id,
          accountSession,
          messages: [],
        };
        if (chatMode === 'tinode') {
          const tinodeTopic = await ensureTinodeConversationTopic(room, {
            avatarFile: groupAvatarFile,
          });
          const realtimeRoom = await tinodeClient.openConversation(tinodeTopic);
          if (accountSessionRef.current !== accountSession) throw new Error('Phiên tài khoản đã thay đổi.');
          room = {
            ...realtimeRoom,
            ...room,
            tinodeTopic,
            messages: realtimeRoom.messages || [],
          };
          const provisionalRoom = normalizeTinodeConversation(room);
          const provisionalRooms = { ...conversationsRef.current, [provisionalRoom.id]: provisionalRoom };
          conversationsRef.current = provisionalRooms;
          setConversations(provisionalRooms);
          tinodeClient.allowConversationTopic(tinodeTopic);
          const targetUids = (realtimeRoom.members || [])
            .map(member => member.id)
            .filter(id => id && id !== tinodeClient.currentUserId);
          await tinodeClient.sendSystemEvent(tinodeTopic, {
            action: addedNames.length > 0 ? 'member_added' : 'group_created',
            actorId,
            actorName: currentUser?.name,
            targets: targetUids.map((id, index) => ({ id, name: addedNames[index] })),
          });
        }
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
      const nextRooms = { ...conversationsRef.current, [safeRoom.id]: safeRoom };
      conversationsRef.current = nextRooms;
      setConversations(nextRooms);
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
    if (file.size > 8 * 1024 * 1024) {
      setChatError('Ảnh nhóm không được vượt quá 8 MB.');
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
  };

  const handleRemoveGroupMember = async (member) => {
    if (removingMemberId || !canRemoveGroupMember(activeChat, directoryAccounts, currentUser, member)) return;
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
      if (usesManagementData) {
        const memberAccount = findAccount(directoryAccounts, member.id || member.uid || member.name)
          || findAccount(activeChat.members, member.id || member.uid || member.name)
          || member;
        if (!memberAccount?.id) throw new Error('Chatmgt không xác định được thành viên cần xóa.');
        if (chatMode === 'tinode') {
          const topicName = await ensureTinodeConversationTopic(activeChat);
          const managedRoom = await chatManagementService.removeConversationParticipant(
            activeChat.managementId || activeChat.id,
            memberAccount.id,
          );
          await tinodeClient.sendSystemEvent(topicName, event);
          const realtimeRoom = await tinodeClient.openConversation(topicName);
          updatedRoom = {
            ...normalizeTinodeConversation(realtimeRoom),
            ...managedRoom,
            id: activeChat.id,
            managementId: activeChat.managementId || activeChat.id,
            tinodeTopic: topicName,
            accountSession: accountSessionRef.current,
            messages: realtimeRoom.messages || [],
          };
        } else {
          const managedRoom = await chatManagementService.removeConversationParticipant(
            activeChat.managementId || activeChat.id,
            memberAccount.id,
          );
          updatedRoom = {
            ...normalizeTinodeConversation(managedRoom),
            accountSession: accountSessionRef.current,
            messages: activeChat.messages || [],
          };
        }
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
    if (realtimeMessagingPending) {
      setChatError('Kết nối realtime Tinode chưa sẵn sàng; dữ liệu Chatmgt vẫn đang hoạt động.');
      return;
    }
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleSendFile = (file) => {
    if (!file) return;
    if (activeChat?.isChatbot) {
      setChatError('Trợ lý AI hiện chỉ nhận tin nhắn văn bản.');
      return;
    }
    if (realtimeMessagingPending) {
      setChatError('Kết nối realtime Tinode chưa sẵn sàng; dữ liệu Chatmgt vẫn đang hoạt động.');
      return;
    }
    const validationError = chatAttachmentValidationError(file);
    if (validationError) {
      setChatError(validationError);
      return;
    }
    setChatError('');

    const mime = file.type || 'application/octet-stream';
    const isUnnamedClipboardFile = !String(file.name || '').trim();
    const fallbackExtension = mime.split('/')[1]?.split('+')[0] || 'png';
    const fileName = file.name || `${/^image\//i.test(mime) ? 'pasted-image' : 'pasted-file'}-${Date.now()}.${fallbackExtension}`;
    const uploadFile = isUnnamedClipboardFile && typeof File === 'function'
      ? new File([file], fileName, { type: mime, lastModified: Date.now() })
      : file;
    const fileSize = file.size;
    const isImage = /^image\//i.test(mime) || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(fileName);
    const previewUrl = isImage && typeof URL !== 'undefined' ? URL.createObjectURL(file) : '';

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
      type: isImage ? "image" : "file",
      sender: "outgoing",
      senderId: currentUser?.id || currentUser?.uid,
      senderName: currentUser?.name,
      avatar: currentUser?.avatar,
      file: {
        name: fileName,
        mime,
        ext: isImage ? "image" : extType,
        size: `${displayExt} • ${sizeStr}`
      },
      image: previewUrl || undefined,
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
          lastMsg: attachmentConversationPreview(newMsg),
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

    if (chatMode === 'tinode') {
      const roomId = currentChatId;
      const room = conversations[roomId];
      ensureTinodeConversationTopic(room)
        .then(async topicName => {
          const result = await tinodeClient.sendFile(topicName, uploadFile, newMsg.id);
          const confirmedIsImage = /^image\//i.test(result.file.mime || '') || isImage;
          const confirmedMessage = {
            ...newMsg,
            type: confirmedIsImage ? 'image' : 'file',
            pending: false,
            failed: false,
            seq: newMsg.seq || result.ctrl?.params?.seq,
            image: confirmedIsImage ? result.file.url : undefined,
            file: {
              ...newMsg.file,
              ext: confirmedIsImage ? 'image' : newMsg.file.ext,
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
          if (previewUrl) URL.revokeObjectURL(previewUrl);
        })
        .catch(err => {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
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

  const handleFileChange = event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    handleSendFile(file);
  };

  const handleMessagePaste = event => {
    if (event.defaultPrevented) return;
    const target = event.target;
    const isEditableTarget = target?.matches?.('input, textarea, [contenteditable="true"]');
    if (target !== messageInputRef.current && isEditableTarget) return;
    const clipboard = event.clipboardData;
    if (!clipboard) return;

    const clipboardItems = Array.from(clipboard.items || []);
    const fileItem = clipboardItems.find(item => item.kind === 'file');
    const clipboardFile = fileItem?.getAsFile?.() || clipboard.files?.[0];
    if (clipboardFile) {
      event.preventDefault();
      handleSendFile(clipboardFile);
      return;
    }

    const pastedText = clipboard.getData?.('text/plain') || '';
    if (!pastedText.trim()) {
      if (!navigator.clipboard?.read) return;
      event.preventDefault();
      void navigator.clipboard.read().then(async clipboardEntries => {
        for (const entry of clipboardEntries) {
          const fileType = entry.types?.find(type => !['text/plain', 'text/html'].includes(type));
          if (!fileType) continue;
          const blob = await entry.getType(fileType);
          handleSendFile(blob);
          break;
        }
      }).catch(() => {});
      return;
    }
    if (activeChat.isChatbot && isTyping) return;
    event.preventDefault();
    const nextText = `${inputText}${pastedText}`.trim();
    void handleSendMessage(nextText);
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
  const handleFileOpen = file => {
    if (!file?.url) return;
    if (chatMode === 'tinode') {
      tinodeClient.openFile(file).catch(err => {
        setChatError(err?.message || 'Không thể mở file đính kèm.');
      });
      return;
    }
    window.open(file.url, '_blank', 'noopener,noreferrer');
  };

  const openImageViewer = file => {
    if (!file?.url) return;
    setImageViewer({ source: file.url });
  };

  const updateCurrentDraft = (value) => {
    setInputText(value);
    setDrafts(prev => {
      const next = { ...prev };
      if (value) next[currentChatId] = value;
      else delete next[currentChatId];
      return next;
    });
    setMessageMentions(previous => {
      const currentMentions = previous[currentChatId] || [];
      const nextMentions = currentMentions.filter(mention => mentionTokenExists(value, mention.token));
      if (nextMentions.length === currentMentions.length) return previous;
      return { ...previous, [currentChatId]: nextMentions };
    });
    const room = conversations[currentChatId];
    if (chatMode === 'tinode' && value.trim()) {
      const topicKey = readyTinodeTypingTopic(room, tinodeClient.authenticated);
      if (!topicKey) return;
      const now = Date.now();
      const lastNotice = typingNoticeAtRef.current.get(topicKey) || 0;
      if (now - lastNotice >= 1200) {
        typingNoticeAtRef.current.set(topicKey, now);
        tinodeClient.sendTyping(topicKey).catch(() => {});
      }
    }
  };

  const handleMessageInputChange = event => {
    const value = event.target.value;
    updateCurrentDraft(value);
    if (!activeChat.isGroup) {
      setMentionContext(null);
      return;
    }
    setMentionContext(getMentionContext(value, event.target.selectionStart));
    setMentionActiveIndex(0);
  };

  const handleMentionSelect = candidate => {
    if (!mentionContext) return;
    const insertion = insertMentionAt(inputText, mentionContext, candidate);
    if (!insertion.token) return;

    updateCurrentDraft(insertion.text);
    setMessageMentions(previous => {
      const currentMentions = previous[currentChatId] || [];
      const mention = {
        id: candidate.id,
        tinodeUid: candidate.tinodeUid || candidate.uid || '',
        name: mentionCandidateText(candidate),
        token: insertion.token,
        isAll: candidate.id === ALL_MENTION_ID,
      };
      const exists = currentMentions.some(item => item.id === mention.id && item.token === mention.token);
      return exists
        ? previous
        : { ...previous, [currentChatId]: [...currentMentions, mention] };
    });
    setMentionContext(null);
    setMentionActiveIndex(0);
    requestAnimationFrame(() => {
      const input = messageInputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(insertion.caret, insertion.caret);
    });
  };

  const handleMessageInputKeyDown = event => {
    if (mentionContext) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMentionContext(null);
        setMentionActiveIndex(0);
        return;
      }
      if (mentionOptions.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        setMentionActiveIndex(previous => {
          const offset = event.key === 'ArrowDown' ? 1 : -1;
          return (previous + offset + mentionOptions.length) % mentionOptions.length;
        });
        return;
      }
      if (mentionOptions.length > 0 && (event.key === 'Enter' || event.key === 'Tab')) {
        event.preventDefault();
        handleMentionSelect(mentionOptions[mentionActiveIndex]);
        return;
      }
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const insertEmoji = emoji => {
    updateCurrentDraft(`${inputText}${emoji}`);
    setMentionContext(null);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => messageInputRef.current?.focus());
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
    if (!message || message.recalled || ['system', 'friend_event'].includes(message.type)) return;
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
    if (!message || message.recalled) return;
    const isOwnMessage = message.senderId === viewerId || message.sender === 'outgoing';
    try {
      if (action === 'create-task') {
        const conversationId = activeChat.managementId || activeChat.id;
        if (!isManagementConversationId(conversationId)) {
          setChatError('Chỉ có thể giao việc từ cuộc trò chuyện đã được Chatmgt quản lý.');
          return;
        }
        setEnterpriseTaskSeed({
          title: `Theo dõi: ${activeChat.name || 'cuộc trò chuyện'}`,
          // The message body remains exclusively in Tinode. Workspace keeps
          // only a reference so the user can reopen the source conversation.
          preview: '',
          conversationName: activeChat.name || '',
          conversationId,
          messageRef: String(message.id || message.seq || ''),
        });
        openWorkspacePanel('enterprise');
        return;
      }
      if (action === 'copy') {
        await copyTextToClipboard(message.text || message.file?.name || '');
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
      if (action === 'recall' || action === 'recall-self' || action === 'recall-all') {
        if (!isOwnMessage) return;
        if (!canRecallDeliveredMessage(message)) {
          setChatError('Chỉ có thể thu hồi sau khi tin nhắn hoặc tệp đã được gửi thành công.');
          return;
        }
        if (chatMode === 'tinode') {
          const topicName = await ensureTinodeConversationTopic(activeChat);
          const mode = action === 'recall-self' ? 'self' : 'all';
          await tinodeClient.recallMessage(topicName, message, mode);
          if (mode === 'self') {
            setConversations(previous => {
              const room = previous[activeChat.id];
              if (!room) return previous;
              const next = {
                ...previous,
                [activeChat.id]: removeMessageFromConversation(room, message),
              };
              conversationsRef.current = next;
              return next;
            });
            return;
          }
        }
        applyMessagePatch(message, {
          text: 'Tin nhắn đã được thu hồi',
          type: 'text',
          recalled: true,
          file: undefined,
          image: undefined,
          replyTo: null,
          reactions: {},
        });
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
    if (usesManagementData && chatMode !== 'tinode') {
      setShareMessage(null);
      setChatError('Chia sẻ tin nhắn cần kết nối realtime Tinode.');
      return;
    }
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
    const text = (textToSend !== null ? textToSend : inputText).trim();
    if (!text || (activeChat.isChatbot && isTyping)) return;
    if (realtimeMessagingPending) {
      setChatError('Danh bạ và cuộc trò chuyện đã được lưu ở Chatmgt, nhưng realtime Tinode chưa kết nối.');
      return;
    }

    const timeStr = getTimeString();
    const createdAt = new Date().toISOString();
    const replyMeta = replyingTo ? { ...replyingTo } : null;
    const mentions = (messageMentions[currentChatId] || [])
      .filter(mention => mentionTokenExists(text, mention.token))
      .map(mention => ({
        id: mention.id,
        tinodeUid: mention.tinodeUid || '',
        name: mention.name,
        token: mention.token,
        isAll: Boolean(mention.isAll),
      }));
    const newMsg = {
      id: `me-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: "text",
      sender: "outgoing",
      senderId: currentUser?.id || currentUser?.uid,
      senderName: currentUser?.name,
      avatar: currentUser?.avatar,
      text: text,
      replyTo: replyMeta,
      mentions,
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
      if (room?.isChatbot) {
        if (!(chatMode === 'tinode' && room.tinodeTopic)) {
          saveChatbotMessage(currentUser?.id || currentUser?.uid, newMsg);
        }
      }
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
    setMessageMentions(prev => {
      const next = { ...prev };
      delete next[currentChatId];
      return next;
    });
    setMentionContext(null);
    const room = conversations[currentChatId];
    if (room?.isChatbot && chatMode === 'tinode' && room.tinodeTopic) {
      setIsTyping(false);
      try {
        const result = await tinodeClient.sendText(
          room.tinodeTopic,
          text,
          newMsg.id,
          { ...(replyMeta ? { replyTo: replyMeta } : {}), mentions },
        );
        setConversations(previous => ({
          ...previous,
          [room.id]: {
            ...previous[room.id],
            messages: (previous[room.id]?.messages || []).map(message => message.id === newMsg.id
              ? { ...message, pending: false, failed: false, seq: message.seq || result?.params?.seq }
              : message),
          },
        }));
      } catch (err) {
        setConversations(previous => ({
          ...previous,
          [room.id]: {
            ...previous[room.id],
            messages: (previous[room.id]?.messages || []).map(message => message.id === newMsg.id
              ? { ...message, pending: false, failed: true }
              : message),
          },
        }));
        setChatError(err?.message || 'Không thể gửi tin nhắn cho ViChat AI.');
      }
      return;
    }
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
      const roomId = currentChatId;
      ensureTinodeConversationTopic(conversations[currentChatId])
        .then(async topicName => {
          const result = await tinodeClient.sendText(topicName, text, newMsg.id, { ...(replyMeta ? { replyTo: replyMeta } : {}), mentions });
          setConversations(previous => {
            const currentRoom = previous[roomId];
            if (!currentRoom) return previous;
            return {
              ...previous,
              [roomId]: {
                ...currentRoom,
                messages: (currentRoom.messages || []).map(message => message.id === newMsg.id
                  ? { ...message, pending: false, failed: false, seq: message.seq || result?.params?.seq }
                  : message),
              },
            };
          });
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
    .filter(id => shouldShowConversation(conversations[id], drafts[id]))
    .filter(id => conversations[id].name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((firstId, secondId) => {
      const firstTimestamp = conversationTimestamp(conversations[firstId]);
      const secondTimestamp = conversationTimestamp(conversations[secondId]);
      return secondTimestamp - firstTimestamp;
    });

  const companyContacts = companyDirectoryContacts(directoryAccounts, currentUser);
  const groupCandidates = companyContacts
    .filter(member => member.type !== 'bot')
    .filter(member => matchesCompanyDirectoryContact(member, groupMemberSearch));

  const sharedFiles = Object.values(conversations)
    .filter(room => canAccessRoomFiles(room, currentUser, directoryAccounts, chatMode))
    .flatMap(room => (room.messages || [])
    .filter(message => message.type === 'file' || message.type === 'image')
    .map(message => ({ ...message, roomName: room.name, roomId: room.id })));

  const notifications = Object.values(conversations)
    .filter(room => !isSelfDirectConversation(room, currentUser, directoryAccounts))
    .filter(room => !isConversationHiddenAfterDelete(room))
    .filter(room => shouldShowConversation(room, drafts[room.id]))
    .filter(room => room.lastMsg || room.badge > 0)
    .sort((a, b) => conversationTimestamp(b) - conversationTimestamp(a))
    .slice(0, 20);

  const friendshipRecords = collectFriendshipRecords(conversations, managementViewerId);
  const companySearchResults = companyDirectoryContacts(workspaceResults, currentUser);
  const companyDirectoryTitle = companyDirectoryHeading(currentUser);
  const friendNotifications = friendshipRecords.filter(record => (
    record.event.recipientId === managementViewerId
    || (record.event.requesterId === managementViewerId && Boolean(record.response))
  ));
  const pendingIncomingFriendRequests = friendNotifications.filter(record => (
    record.event.recipientId === managementViewerId && !record.response
  ));
  const notificationBadgeCount = Object.values(conversations).filter(room => (
    room.badge > 0 && shouldShowConversation(room, drafts[room.id])
  )).length
    + pendingIncomingFriendRequests.length;

  const visibleMessages = (activeChat.messages || []).filter(Boolean).filter(message => {
    if (messageActions[messageActionKey(activeChat.id, message.id)]?.hidden) return false;
    if (!messageSearchQuery.trim()) return true;
    return `${message.text || ''} ${message.senderName || ''}`.toLowerCase().includes(messageSearchQuery.toLowerCase());
  });
  const hasDatedMessages = visibleMessages.some(message => formatMessageDateLabel(message, displayClock));

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
  const showTinodeConnectionNotice = chatMode === 'tinode'
    && ['connecting', 'offline'].includes(connectionStatus)
    && !tinodeClient.authenticated;

  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} initialNotice={loginNotice} />;
  }

  return (
    <div
      className={`app-layout ${EXTERNAL_CHAT_ONLY ? 'external-chat-mode' : ''} ${isMobileChatActive ? 'mobile-active-chat' : ''}`}
      data-chat-release="conversation-sync-20260816"
    >
      {forcedLogoutSeconds !== null && (
        <div className="forced-logout-backdrop" role="presentation">
          <section className="forced-logout-modal" role="alertdialog" aria-modal="true" aria-labelledby="forced-logout-title">
            <div className="forced-logout-icon"><i className="fa-solid fa-user-lock"></i></div>
            <h2 id="forced-logout-title">Bạn bị buộc phải đăng xuất</h2>
            <p>Quản trị viên đã kết thúc phiên đăng nhập của bạn.</p>
            <p className="forced-logout-countdown">Hệ thống sẽ tự động đưa bạn về trang đăng nhập sau <strong>{forcedLogoutSeconds} giây</strong>.</p>
            <button type="button" className="btn-primary forced-logout-confirm" onClick={handleForcedLogout}>OK</button>
          </section>
        </div>
      )}
      {(chatError || showTinodeConnectionNotice) && (
        <div className={`chat-system-banner ${chatError ? 'error' : 'info'}`} role="status">
          <i className={`fa-solid ${chatError ? 'fa-triangle-exclamation' : 'fa-circle-info'}`}></i>
          <span>{chatError || 'Đang kết nối Tinode...'}</span>
          {chatError && <button type="button" onClick={() => setChatError('')} aria-label="Đóng thông báo"><i className="fa-solid fa-xmark"></i></button>}
        </div>
      )}
      {CALLS_ENABLED && activeCall && (
        <CallOverlay
          key={activeCall.id}
          call={activeCall}
          onClose={handleCallClosed}
          onError={handleCallError}
        />
      )}
      {imageViewer && (
        <ImageViewer
          source={imageViewer.source}
          onClose={() => setImageViewer(null)}
        />
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
          <a href="#" className={`nav-item ${workspacePanel === 'enterprise' ? 'active' : ''}`} data-tooltip="Workspace doanh nghiệp" onClick={(e) => { e.preventDefault(); openWorkspacePanel('enterprise'); }}>
            <i className="fa-solid fa-briefcase"></i>
            <span>Workspace</span>
          </a>
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
              <span className={`user-status ${isCurrentUserOnline ? 'online' : 'offline'}`}>
                {isCurrentUserOnline ? 'Online' : 'Offline'}
              </span>
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
            const roomMuted = isConversationMuted(room.notificationMutedUntil, notificationClock);
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
                    <span
                      className={hasDraft ? 'conv-draft-status' : 'conv-time'}
                      title={hasDraft ? undefined : formatFullMessageDateTime(room, room.time)}
                    >
                      {hasDraft ? 'Chưa gửi' : formatConversationListTime(room, displayClock)}
                    </span>
                  </div>
                  <div className="conv-message">
                    <span className={`conv-last-msg ${hasDraft ? 'draft' : ''}`}>{hasDraft ? draft : room.lastMsg}</span>
                    {roomMuted && (
                      <i
                        className="fa-solid fa-bell-slash conv-muted-icon"
                        title={notificationMuteLabel(room.notificationMutedUntil, notificationClock)}
                        aria-label="Đã tắt thông báo"
                      ></i>
                    )}
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
      <section className="chat-main" onPasteCapture={handleMessagePaste} onPaste={handleMessagePaste}>
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
              <span className={`chat-header-status ${activeChat.isGroup ? 'group-presence' : ''}`}>
                {activeChatPresenceLabel}
              </span>
            </div>
          </div>
          <div className="chat-header-actions">
            <button className="btn-header-action" title="Tìm kiếm" onClick={() => openWorkspacePanel('search')}>
              <i className="fa-solid fa-magnifying-glass"></i>
            </button>
            {CALLS_ENABLED && (
              <>
                <button
                  type="button"
                  className="btn-header-action"
                  title={callActionCapability.available ? 'Gọi thoại' : callActionCapability.reason}
                  onClick={() => handleStartCall(true)}
                  disabled={!callActionCapability.available}
                >
                  <i className="fa-solid fa-phone"></i>
                </button>
                <button
                  type="button"
                  className="btn-header-action"
                  title={callActionCapability.available ? 'Gọi video' : callActionCapability.reason}
                  onClick={() => handleStartCall(false)}
                  disabled={!callActionCapability.available}
                >
                  <i className="fa-solid fa-video"></i>
                </button>
              </>
            )}
            <button className="btn-header-action" title="Thông tin nhóm" onClick={() => setIsDetailOpen(!isDetailOpen)}>
              <i className="fa-solid fa-ellipsis-vertical"></i>
            </button>
          </div>
        </div>

        {activeChat.isChatbot && (
          <div className="chatbot-context-strip" role="status">
            <span><i className="fa-solid fa-shield-halved"></i> AI riêng tư</span>
            <span><i className="fa-solid fa-book-open-reader"></i> {chatbotStatus}</span>
            <span><i className="fa-solid fa-link"></i> Trích dẫn nguồn</span>
          </div>
        )}

        {/* Khu vực hiển thị tin nhắn */}
        <div className={`chat-messages ${activeChat.isChatbot ? 'chatbot-messages' : ''}`}>
          {!hasDatedMessages && (
            <div className="date-divider"><span>{currentChatId === 'dieu-hanh' ? 'Hôm nay' : 'Hội thoại trực tuyến'}</span></div>
          )}

          {visibleMessages.map((msg, messageIndex) => {
            const dateLabel = formatMessageDateLabel(msg, displayClock);
            const previousDateLabel = formatMessageDateLabel(visibleMessages[messageIndex - 1], displayClock);
            const showDateDivider = Boolean(dateLabel && dateLabel !== previousDateLabel);
            if (msg.type === 'system') {
              return (
                <React.Fragment key={msg.id}>
                  {showDateDivider && <div className="date-divider"><span>{dateLabel}</span></div>}
                  <div className="group-system-message">
                    <i className={`fa-solid ${msg.action === 'member_left' ? 'fa-arrow-right-from-bracket' : msg.action === 'member_removed' ? 'fa-user-minus' : msg.action === 'group_created' ? 'fa-people-group' : 'fa-user-plus'}`}></i>
                    <span>{msg.text}</span>
                    <time>{formatMessageTime(msg, msg.time)}</time>
                  </div>
                </React.Fragment>
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
            const attachmentFile = msg.file || (msg.type === 'image' && msg.image ? {
              name: 'Hình ảnh',
              mime: 'image/*',
              size: 'Hình ảnh',
              url: msg.image,
            } : null);
            const attachmentIcon = attachmentIconClass(attachmentFile, msg.type);
            const attachmentTone = attachmentIcon.replace('fa-file-', '');
            const imagePreviewSource = isImageAttachment(attachmentFile, msg.type)
              ? attachmentFile?.url || msg.image || ''
              : '';
            const imagePreviewFile = imagePreviewSource && attachmentFile
              ? { ...attachmentFile, url: imagePreviewSource }
              : attachmentFile;
            const attachmentStatus = msg.pending
              ? 'Đang tải lên...'
              : attachmentFile?.url ? 'Đã có trên Cloud' : 'Có sẵn trên máy';
            return (
              <React.Fragment key={msg.id}>
                {showDateDivider && <div className="date-divider"><span>{dateLabel}</span></div>}
                <div className={`message-item ${isOutgoing ? 'outgoing' : 'incoming'} ${activeChat.isChatbot ? 'chatbot-message-item' : ''}`}>
                {!isOutgoing && (
                  <div className="message-avatar">
                    <SafeAvatar src={msg.avatar || ''} name={msg.senderName} />
                  </div>
                )}

                <div className={`message-content-wrapper ${imagePreviewSource ? 'image-message-content' : ''}`}>
                  {!isOutgoing && msg.senderName && <span className="sender-name">{msg.senderName}</span>}

                  <div className="message-interactive" onContextMenu={event => openMessageMenu(event, msg)}>
                    <div className="message-bubble-group">
                    {msg.type === 'call' && msg.call && (
                      <div className="message-bubble call-history-bubble">
                        <span className="call-history-icon">
                          <i className={`fa-solid ${msg.call.audioOnly ? 'fa-phone' : 'fa-video'}`}></i>
                        </span>
                        <span className="call-history-copy">
                          <strong>{msg.text}</strong>
                          <span>{msg.call.audioOnly ? 'Cuộc gọi thoại' : 'Cuộc gọi video'}</span>
                        </span>
                        <span className="message-time">
                          {formatMessageTime(msg, msg.time)} {isOutgoing && deliveryStatusIcon(msg)}
                        </span>
                        {CALLS_ENABLED && (
                          <button
                            type="button"
                            className="call-history-redial"
                            title={callActionCapability.available ? 'Gọi lại' : callActionCapability.reason}
                            aria-label={msg.call.audioOnly ? 'Gọi lại bằng cuộc gọi thoại' : 'Gọi lại bằng cuộc gọi video'}
                            onClick={() => handleStartCall(msg.call.audioOnly)}
                            disabled={!callActionCapability.available}
                          >
                            <i className={`fa-solid ${msg.call.audioOnly ? 'fa-phone' : 'fa-video'}`}></i>
                            Gọi lại
                          </button>
                        )}
                      </div>
                    )}
                    {/* Tin nhắn chữ thường */}
                    {msg.type === "text" && msg.text && (
                      <div className={`message-bubble ${activeChat.isChatbot && !isOutgoing ? 'chatbot-answer-bubble' : ''}`}>
                        {msg.replyTo && <div className="message-reply-preview"><strong>{msg.replyTo.senderName || 'Tin nhắn'}</strong><span>{msg.replyTo.text}</span></div>}
                        {activeChat.isChatbot && !isOutgoing && (
                          <div className="chatbot-answer-label">
                            <span><i className="fa-solid fa-sparkles"></i>{msg.grounded ? 'Tóm tắt từ tài liệu' : msg.isWelcome ? 'ViChat AI' : 'Phản hồi AI'}</span>
                            {msg.grounded && <small>Đã đối chiếu nguồn</small>}
                          </div>
                        )}
                        <p>{renderMessageText(msg.text)}</p>
                        {Object.entries(reactions).filter(([, count]) => count > 0).length > 0 && (
                          <div className="message-reactions">
                            {Object.entries(reactions).filter(([, count]) => count > 0).map(([emoji, count]) => <span key={emoji}>{emoji} {count}</span>)}
                          </div>
                        )}
                        {Array.isArray(msg.sources) && msg.sources.length > 0 && (
                          <div className="chatbot-sources">
                            <strong><i className="fa-solid fa-book-bookmark"></i>Nguồn tham khảo</strong>
                            {msg.sources.map((source, index) => (
                              <div className="chatbot-source-card" key={`${source.document_id || source.title}-${index}`}>
                                <span className="chatbot-source-index">{index + 1}</span>
                                <span className="chatbot-source-copy">
                                  <b>{source.title || source.file_name || `Nguồn ${index + 1}`}</b>
                                  {source.snippet && <small>{source.snippet}</small>}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <span className="message-time">
                          {messageState.marked && <i className="fa-solid fa-star message-marked" title="Đã đánh dấu"></i>} {formatMessageTime(msg, msg.time)} {isOutgoing && deliveryStatusIcon(msg)}
                        </span>
                      </div>
                    )}

                    {/* Tin nhắn file đính kèm */}
                    {/* Image attachments are visual-only; do not render their filename. */}
                    {imagePreviewSource ? (
                      <div className={`message-bubble image-bubble ${msg.pending ? 'pending' : ''} ${msg.failed ? 'failed' : ''}`}>
                        <button
                          type="button"
                          className="image-preview-button"
                          title="Bấm để xem ảnh"
                          onClick={() => openImageViewer(imagePreviewFile)}
                        >
                          <TinodeImagePreview
                            source={imagePreviewSource}
                              alt="Ảnh đính kèm"
                          />
                          <span className="image-view-hint"><i className="fa-solid fa-expand"></i>Xem ảnh</span>
                        </button>
                        <div className="image-bubble-footer">
                          <span className="message-time">{formatMessageTime(msg, msg.time)} {isOutgoing && deliveryStatusIcon(msg)}</span>
                        </div>
                      </div>
                    ) : attachmentFile && (
                      <div className={`message-bubble file-bubble ${msg.type} ${attachmentTone} ${attachmentFile.ext || ''} ${msg.pending ? 'pending' : ''} ${msg.failed ? 'failed' : ''}`}>
                        <button
                          type="button"
                          className="file-card-main"
                          title={attachmentFile.url ? 'Tải file' : undefined}
                          disabled={!attachmentFile.url}
                          onClick={() => handleFileDownload(attachmentFile)}
                        >
                          <span className={`file-icon-container ${msg.type} ${attachmentTone} ${attachmentFile.ext || ''}`}>
                            <i className={`fa-solid ${attachmentIcon}`} aria-hidden="true"></i>
                          </span>
                          <span className="file-details">
                            <span className="file-name" title={attachmentFile.name}>{attachmentFile.name}</span>
                            <span className="file-meta-row">
                              <span className="file-info">{attachmentSizeLabel(attachmentFile)}</span>
                              <span className="file-cloud-status"><i className="fa-solid fa-cloud-check" aria-hidden="true"></i>{attachmentStatus}</span>
                            </span>
                          </span>
                        </button>
                        <span className="file-card-side">
                          <span className="file-actions">
                            <button type="button" className="file-action" title="Mở file" aria-label="Mở file" disabled={!attachmentFile.url} onClick={() => handleFileOpen(attachmentFile)}><i className="fa-regular fa-folder-open"></i></button>
                            <button type="button" className="file-action" title="Tải xuống" aria-label="Tải xuống" disabled={!attachmentFile.url} onClick={() => handleFileDownload(attachmentFile)}><i className="fa-solid fa-download"></i></button>
                          </span>
                          <span className="message-time">
                            {formatMessageTime(msg, msg.time)} {isOutgoing && deliveryStatusIcon(msg)}
                          </span>
                        </span>
                      </div>
                    )}
                    </div>
                    <button type="button" className="message-more-action" onClick={event => { event.stopPropagation(); openMessageMenu(event, msg); }} aria-label="Tùy chọn tin nhắn"><i className="fa-solid fa-ellipsis"></i></button>
                  </div>
                </div>
                </div>
              </React.Fragment>
            );
          })}

          {activeChat.isChatbot && visibleMessages.length <= 1 && (
            <section className="chatbot-starter" aria-label="Gợi ý câu hỏi cho ViChat AI">
              <div className="chatbot-starter-heading">
                <span className="chatbot-starter-eyebrow">Bắt đầu nhanh</span>
                <h3>Bạn muốn tìm gì trong tri thức doanh nghiệp?</h3>
                <p>ViChat AI chỉ dùng nội dung được tìm thấy và luôn cho bạn biết nguồn tham khảo.</p>
              </div>
              <div className="chatbot-starter-grid">
                {CHATBOT_STARTER_PROMPTS.map(item => (
                  <button type="button" key={item.title} onClick={() => handleSendMessage(item.prompt)} disabled={isTyping || realtimeMessagingPending}>
                    <span className="chatbot-starter-icon"><i className={`fa-solid ${item.icon}`}></i></span>
                    <span><strong>{item.title}</strong><small>{item.prompt}</small></span>
                    <i className="fa-solid fa-arrow-up-right-from-square"></i>
                  </button>
                ))}
              </div>
            </section>
          )}

           {messageMenu && !messageMenu.message.recalled && (() => {
            const menuMessage = messageMenu.message;
            const isOwnMessage = menuMessage.senderId === viewerId || menuMessage.sender === 'outgoing';
            const canRecallMessage = isOwnMessage && canRecallDeliveredMessage(menuMessage);
            const marked = messageActions[messageActionKey(activeChat.id, menuMessage.id)]?.marked;
            return (
              <div className="message-context-menu" style={{ left: messageMenu.left, top: messageMenu.top }} onClick={event => event.stopPropagation()}>
                {!menuMessage.recalled && <button type="button" onClick={() => handleMessageAction('reply', menuMessage)}><i className="fa-solid fa-reply"></i>Trả lời tin nhắn</button>}
                <button type="button" onClick={() => handleMessageAction('copy', menuMessage)}><i className="fa-regular fa-copy"></i>Copy tin nhắn</button>
                <button type="button" onClick={() => handleMessageAction('mark', menuMessage)}><i className={`fa-${marked ? 'solid' : 'regular'} fa-star`}></i>{marked ? 'Bỏ đánh dấu' : 'Đánh dấu tin nhắn'}</button>
                {!activeChat.isChatbot && isManagementConversationId(activeChat.managementId || activeChat.id) && <button type="button" onClick={() => handleMessageAction('create-task', menuMessage)}><i className="fa-solid fa-list-check"></i>Giao việc từ tin nhắn</button>}
                <button type="button" onClick={() => handleMessageAction('detail', menuMessage)}><i className="fa-solid fa-circle-info"></i>Xem chi tiết</button>
                <button type="button" onClick={() => handleMessageAction('share', menuMessage)}><i className="fa-solid fa-share"></i>Chia sẻ tin nhắn</button>
                <div className="message-reaction-row" aria-label="Thêm biểu cảm">
                  {['👍', '❤️', '😂', '😮', '😢'].map(emoji => <button type="button" key={emoji} onClick={() => handleMessageAction('reaction', menuMessage, emoji)}>{emoji}</button>)}
                </div>
                <button type="button" onClick={() => handleMessageAction('hide', menuMessage)}><i className="fa-solid fa-trash"></i>Xóa chỉ ở phía tôi</button>
                 {canRecallMessage && <>
                   <button type="button" className="danger" onClick={() => handleMessageAction('recall-self', menuMessage)}><i className="fa-solid fa-eye-slash"></i>Thu hồi phía tôi</button>
                   <button type="button" className="danger" onClick={() => handleMessageAction('recall-all', menuMessage)}><i className="fa-solid fa-rotate-left"></i>Thu hồi tất cả</button>
                 </>}
              </div>
            );
          })()}

          {activeRemoteTyping && (
            <div className="message-item incoming remote-typing-indicator">
              <div className="message-avatar"><SafeAvatar src={activeChat.members?.find(member => identitiesOverlap(member, { id: activeRemoteTyping.uid }))?.avatar || ''} name={activeRemoteTyping.name} /></div>
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
        {realtimeMessagingPending && (
          <div className="management-realtime-notice" role="status">
            <i className="fa-solid fa-database"></i>
            <span>Dữ liệu Chatmgt vẫn sẵn sàng, nhưng kết nối realtime Tinode đang tạm gián đoạn.</span>
          </div>
        )}
        <div className="chat-main-input">
          {replyingTo && (
            <div className="replying-banner">
              <div><strong>Đang trả lời {replyingTo.senderName}</strong><span>{replyingTo.text}</span></div>
              <button type="button" onClick={() => setReplyingTo(null)} aria-label="Hủy trả lời"><i className="fa-solid fa-xmark"></i></button>
            </div>
          )}
          <div className="input-actions-left">
            <button className="btn-input-action" title={activeChat.isChatbot ? 'ViChat AI hiện nhận câu hỏi văn bản' : realtimeMessagingPending ? 'Kết nối realtime Tinode chưa sẵn sàng' : 'Đính kèm tệp'} onClick={handleAttachClick} disabled={realtimeMessagingPending || activeChat.isChatbot}>
              <i className="fa-solid fa-paperclip"></i>
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: "none" }} 
              onChange={handleFileChange} 
            />
            <button type="button" className="btn-input-action" title="Biểu cảm" aria-label="Mở biểu cảm" aria-expanded={showEmojiPicker} onClick={() => setShowEmojiPicker(prev => !prev)} disabled={realtimeMessagingPending || activeChat.isChatbot}>
              <i className="fa-regular fa-smile"></i>
            </button>
            {showEmojiPicker && (
              <div className="emoji-picker" role="listbox" aria-label="Chọn biểu cảm">
                {['😀', '😂', '😍', '👍', '👏', '🎉', '🙏', '🔥', '✅', '❤️'].map(emoji => <button type="button" role="option" key={emoji} aria-label={emoji} onMouseDown={event => event.preventDefault()} onClick={() => insertEmoji(emoji)}>{emoji}</button>)}
              </div>
            )}
          </div>
          <div className="input-text-container">
            {mentionContext && activeChat.isGroup && (
              <div
                ref={mentionPickerRef}
                id="message-mention-picker"
                className="mention-picker"
                role="listbox"
                aria-label="Chọn thành viên để nhắc đến"
              >
                {mentionOptions.length > 0 ? mentionOptions.map((candidate, index) => {
                  const candidateKey = candidate.id || candidate.tinodeUid || candidate.username || candidate.name;
                  const candidateName = candidate.isAll ? 'Báo cho cả nhóm' : mentionCandidateText(candidate);
                  return (
                    <button
                      type="button"
                      key={candidateKey}
                      id={`message-mention-option-${index}`}
                      className={`mention-option ${index === mentionActiveIndex ? 'active' : ''}`}
                      role="option"
                      aria-selected={index === mentionActiveIndex}
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => handleMentionSelect(candidate)}
                    >
                      {candidate.isAll ? (
                        <span className="mention-all-icon" aria-hidden="true">@</span>
                      ) : (
                        <SafeAvatar src={candidate.avatar || ''} name={candidateName} className="mention-avatar" />
                      )}
                      <span className="mention-option-copy">
                        <strong>{candidateName}</strong>
                        <small>{candidate.isAll ? '@All' : mentionTokenFor(candidate)}</small>
                      </span>
                    </button>
                  );
                }) : (
                  <div className="mention-empty">Không tìm thấy thành viên phù hợp</div>
                )}
              </div>
            )}
            <input
              type="text"
              ref={messageInputRef}
              role="combobox"
              aria-autocomplete="list"
              aria-controls={mentionContext && activeChat.isGroup ? 'message-mention-picker' : undefined}
              aria-expanded={Boolean(mentionContext && activeChat.isGroup)}
              aria-activedescendant={mentionOptions.length > 0 ? `message-mention-option-${mentionActiveIndex}` : undefined}
              placeholder={realtimeMessagingPending ? 'Kết nối realtime Tinode chưa sẵn sàng' : activeChat.isChatbot ? 'Hỏi ViChat AI về quy trình, chính sách, tài liệu...' : 'Nhập tin nhắn...'}
              value={inputText}
              disabled={realtimeMessagingPending || (activeChat.isChatbot && isTyping)}
              onChange={handleMessageInputChange}
              onPaste={handleMessagePaste}
              onKeyDown={handleMessageInputKeyDown}
              onBlur={() => {
                window.setTimeout(() => {
                  if (!mentionPickerRef.current?.contains(document.activeElement)) {
                    setMentionContext(null);
                  }
                }, 0);
              }}
            />
          </div>
          <button className="btn-send-message-sh" disabled={realtimeMessagingPending || (activeChat.isChatbot && isTyping)} onClick={() => handleSendMessage()}>{activeChat.isChatbot && isTyping ? 'Đang tìm...' : activeChat.isChatbot ? 'Hỏi AI' : 'Gửi'}</button>
        </div>
        {activeChat.isChatbot && <p className="chatbot-composer-note"><i className="fa-solid fa-circle-info"></i> ViChat AI có thể chưa bao quát mọi tài liệu. Hãy kiểm tra nguồn trước khi ra quyết định.</p>}
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
            <span className="group-members-count">{activeChatPresenceLabel}</span>
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
              <span className="admin-name">{activeAdminName}</span>
            </div>
          )}

          <div className="detail-section members-section">
            <div className="members-section-heading">
              <h4 className="section-title">{activeChat.isGroup ? `Thành viên (${activeChat.members.length})` : "Thông tin cá nhân"}</h4>
            </div>
            <div className="members-list">
              {activeChat.members.map((member, idx) => (
                <div key={idx} className="member-item">
                  <SafeAvatar src={typeof member.avatar === 'string' ? member.avatar : ''} name={member.name} className="member-avatar" />
                  <div className="member-info">
                    <span className="member-name">{member.name}</span>
                    <span className="member-status-text">
                      <span className={`status-dot ${chatMode === 'tinode' ? (isAccountOnline(member) ? 'online' : 'offline') : 'managed'}`}></span>
                      {accountPresenceLabel(member)}
                    </span>
                  </div>
                  {canRemoveGroupMember(activeChat, directoryAccounts, currentUser, member) && (
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
            {!activeChat.isChatbot && activeChat.id !== 'empty' && (
              <div className="action-row">
                <div className="action-label">
                  <i className={`fa-regular ${activeChatMuted ? 'fa-bell-slash' : 'fa-bell'}`}></i>
                  <span className="action-label-copy">
                    <strong>Tắt thông báo</strong>
                    {activeChatMuteLabel && <small>{activeChatMuteLabel}</small>}
                  </span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={activeChatMuted}
                    onChange={handleConversationMuteToggle}
                    disabled={isUpdatingNotificationMute}
                  />
                  <span className="slider round"></span>
                </label>
              </div>
            )}

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
          <section className={`workspace-panel ${workspacePanel === 'enterprise' ? 'enterprise-shell-panel' : ''}`} role="dialog" aria-modal="true">
            <div className="workspace-panel-header">
              <div>
                <h2>{workspacePanel === 'profile' ? 'Hồ sơ cá nhân' : workspacePanel === 'contacts' ? 'Danh bạ' : workspacePanel === 'files' ? 'File dùng chung' : workspacePanel === 'enterprise' ? 'Enterprise Workspace' : workspacePanel === 'notifications' ? 'Thông báo' : workspacePanel === 'search' ? 'Tìm trong hội thoại' : 'Cài đặt'}</h2>
              </div>
              <div className="workspace-panel-header-actions">
                {workspacePanel === 'profile' && (
                  <button type="button" className="workspace-logout-button" onClick={requestLogout}>
                    <i className="fa-solid fa-arrow-right-from-bracket"></i>
                    <span>Đăng xuất</span>
                  </button>
                )}
                <button type="button" className="btn-close-detail" onClick={() => setWorkspacePanel(null)} aria-label="Đóng"><i className="fa-solid fa-xmark"></i></button>
              </div>
            </div>

            {workspacePanel === 'enterprise' && (
              <EnterpriseWorkspace
                user={currentUser}
                accounts={directoryAccounts}
                taskSeed={enterpriseTaskSeed}
                onTaskSeedConsumed={() => setEnterpriseTaskSeed(null)}
                onError={setChatError}
              />
            )}

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
                  {accountProfileReadOnly && <div className="profile-save-notice"><i className="fa-solid fa-building-shield"></i>Thông tin sẽ được lưu qua UpGO Account và đồng bộ lại cho các thiết bị.</div>}
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

                {isWorkspaceLoading && <div className="workspace-empty"><i className="fa-solid fa-spinner fa-spin"></i> Đang tìm...</div>}
                {!isWorkspaceLoading && workspaceQuery.trim().length < 2 && companyContacts.length > 0 && (
                  <div className="friend-directory">
                    <div className="workspace-section-heading">
                      <strong title={companyDirectoryTitle}>{companyDirectoryTitle}</strong>
                      <span>{companyContacts.length}</span>
                    </div>
                    <div className="workspace-list">
                      {companyContacts.map(contact => (
                        <div className="workspace-list-item contact-result" key={contact.id}>
                          <button type="button" className="contact-result-main" onClick={() => handleStartDirectChat(contact)}>
                            <SafeAvatar src={contact.avatar} name={contact.name} className="workspace-avatar" />
                            <span className="workspace-list-copy">
                              <strong>{contact.name}</strong>
                              <small>{accountPresenceLabel(contact)}{directoryUsernameMeta(contact)}</small>
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
                {!isWorkspaceLoading && workspaceQuery.trim().length < 2 && companyContacts.length === 0 && (
                  <div className="workspace-empty"><i className="fa-solid fa-user-group"></i><span>Chưa có nhân viên nào khác trong công ty.</span></div>
                )}
                {!isWorkspaceLoading && workspaceQuery.trim().length >= 2 && companySearchResults.length === 0 && (
                  <div className="workspace-empty"><i className="fa-regular fa-address-book"></i><span>Không tìm thấy tài khoản phù hợp.</span></div>
                )}
                {workspaceQuery.trim().length >= 2 && companySearchResults.length > 0 && (
                  <div className="workspace-section-heading search-results-heading"><strong>Kết quả tìm kiếm</strong><span>{companySearchResults.length}</span></div>
                )}
                <div className="workspace-list">
                  {companySearchResults.map(contact => (
                      <div className="workspace-list-item contact-result" key={contact.id || contact.name}>
                        <button type="button" className="contact-result-main" onClick={() => handleStartDirectChat(contact)}>
                          <SafeAvatar src={contact.avatar} name={contact.name} className="workspace-avatar" />
                          <span className="workspace-list-copy"><strong>{contact.name}</strong><small>{accountPresenceLabel(contact)}{contact.id ? ` · ${contact.id}` : ''}</small></span>
                        </button>
                        <button type="button" className="btn-friend chat" onClick={() => handleStartDirectChat(contact)}>
                          <i className="fa-solid fa-message"></i>
                          Nhắn tin
                        </button>
                      </div>
                  ))}
                </div>
              </>
            )}

            {workspacePanel === 'files' && (
              <>

                {sharedFiles.length === 0 ? <div className="workspace-empty"><i className="fa-regular fa-folder-open"></i><span>Chưa có file dùng chung.</span></div> : (
                  <div className="workspace-list">
                    {sharedFiles.map(file => {
                      const sharedAttachment = file.file || (file.type === 'image' && file.image ? {
                        name: 'Hình ảnh',
                        mime: 'image/*',
                        size: 'Hình ảnh',
                        url: file.image,
                      } : null);
                      const sharedIcon = attachmentIconClass(sharedAttachment, file.type);
                      const sharedTone = sharedIcon.replace('fa-file-', '');
                      const sharedStatus = sharedAttachment?.url ? 'Đã có trên Cloud' : 'Có sẵn trên máy';
                      return (
                        <article className="workspace-file-card" key={`${file.roomId}-${file.id}`}>
                          <button type="button" className="workspace-file-main" onClick={() => { setWorkspacePanel(null); handleConversationSelect(file.roomId); }}>
                            <span className={`workspace-file-icon ${file.type} ${sharedTone} ${sharedAttachment?.ext || ''}`}><i className={`fa-solid ${sharedIcon}`}></i></span>
                            <span className="workspace-file-copy">
                              <strong title={sharedAttachment?.name || 'Tệp đính kèm'}>{sharedAttachment?.name || (file.type === 'image' ? 'Hình ảnh' : 'Tệp đính kèm')}</strong>
                              <span className="workspace-file-meta">
                                <small>{file.roomName} · {attachmentSizeLabel(sharedAttachment)} · {file.time}</small>
                                <small className="workspace-cloud-status"><i className="fa-solid fa-cloud-check" aria-hidden="true"></i>{sharedStatus}</small>
                              </span>
                            </span>
                          </button>
                          <span className="workspace-file-actions">
                            <button type="button" className="workspace-file-action" title="Mở file" aria-label="Mở file" disabled={!sharedAttachment?.url} onClick={() => handleFileOpen(sharedAttachment)}><i className="fa-regular fa-folder-open"></i></button>
                            <button type="button" className="workspace-file-action" title="Tải xuống" aria-label="Tải xuống" disabled={!sharedAttachment?.url} onClick={() => handleFileDownload(sharedAttachment)}><i className="fa-solid fa-download"></i></button>
                          </span>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {workspacePanel === 'notifications' && (
              <>

                {friendNotice && <div className="friend-notice"><i className="fa-solid fa-circle-check"></i><span>{friendNotice}</span></div>}
                {friendNotifications.length > 0 && (
                  <div className="friend-request-list">
                    {friendNotifications.map(record => {
                      const incoming = record.event.recipientId === managementViewerId;
                      const status = record.response?.event?.action || 'pending';
                      const displayName = incoming
                        ? (record.event.requesterName || record.message.senderName || 'Người dùng')
                        : (record.response?.event?.responderName || record.room.name || 'Người dùng');
                      return (
                        <article className="friend-request-card" key={record.event.requestId}>
                          <SafeAvatar src={incoming ? (record.message.avatar || record.room.avatarUrl) : record.room.avatarUrl} name={displayName} className="workspace-avatar" />
                          <div className="friend-request-copy">
                            <strong>{displayName}</strong>
                            <span>{incoming ? 'đã gửi cho bạn lời mời kết bạn.' : status === 'accepted' ? 'đã chấp nhận lời mời kết bạn.' : 'đã từ chối lời mời kết bạn.'}</span>
                            {record.event.note && <small>“{record.event.note}”</small>}
                            <time>{formatMessageTime(record.message, record.message.time)}</time>
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
                        <span className="workspace-list-copy"><strong>{room.name}</strong><small>{room.lastMsg || 'Có cập nhật mới'} · {formatConversationListTime(room, displayClock)}</small></span>
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
                {messageSearchQuery && <p className="workspace-hint">{visibleMessages.length} kết quả trong {activeChat.name}</p>}
                <div className="workspace-list">
                  {messageSearchQuery && visibleMessages.map(message => <button type="button" className="workspace-list-item" key={message.id} onClick={() => setWorkspacePanel(null)}><span className="workspace-file-icon"><i className="fa-solid fa-message"></i></span><span className="workspace-list-copy"><strong>{message.senderName || 'Bạn'}</strong><small>{message.text || message.file?.name || 'Nội dung đính kèm'} · {formatMessageTime(message, message.time)}</small></span></button>)}
                </div>
              </>
            )}

            {workspacePanel === 'settings' && (
              <div className="workspace-settings">
                <label className="workspace-setting-row"><span><strong>Âm thanh tin nhắn</strong></span><input type="checkbox" checked={settings.sounds} onChange={event => setSettings(prev => ({ ...prev, sounds: event.target.checked }))} /></label>
                <label className="workspace-setting-row"><span><strong>Giao diện gọn</strong></span><input type="checkbox" checked={settings.compactMode} onChange={event => setSettings(prev => ({ ...prev, compactMode: event.target.checked }))} /></label>
                <div className="workspace-account-card"><i className="fa-solid fa-shield-halved"></i><div><strong>{currentUser?.name || 'Tài khoản hiện tại'}</strong><small>{currentUser?.email || 'Phiên đăng nhập SÔNG HỒNG'} · {chatModeLabel}</small></div></div>
              </div>
            )}
          </section>
        </div>
      )}

      {notificationMuteDialog && (
        <div className="modal-backdrop notification-mute-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isUpdatingNotificationMute) setNotificationMuteDialog(null);
        }}>
          <form
            className="group-modal notification-mute-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-mute-title"
            onSubmit={handleNotificationMuteSubmit}
          >
            <div className="group-modal-header">
              <div>
                <span className="group-modal-kicker">THÔNG BÁO HỘI THOẠI</span>
                <h2 id="notification-mute-title">Tắt thông báo</h2>
              </div>
              <button type="button" className="btn-close-detail" onClick={() => setNotificationMuteDialog(null)} aria-label="Đóng" disabled={isUpdatingNotificationMute}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="notification-mute-options">
              {[
                [NOTIFICATION_MUTE_OPTIONS.ONE_HOUR, 'Trong 1 giờ'],
                [NOTIFICATION_MUTE_OPTIONS.FOUR_HOURS, 'Trong 4 giờ'],
                [NOTIFICATION_MUTE_OPTIONS.UNTIL_EIGHT, 'Cho đến 8:00 sáng'],
                [NOTIFICATION_MUTE_OPTIONS.UNTIL_MANUAL, 'Cho đến khi được mở lại'],
              ].map(([value, label]) => (
                <label className="notification-mute-option" key={value}>
                  <input
                    type="radio"
                    name="notification-mute-duration"
                    value={value}
                    checked={notificationMuteOption === value}
                    onChange={() => setNotificationMuteOption(value)}
                    disabled={isUpdatingNotificationMute}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="group-modal-footer notification-mute-footer actions-only">

              <div className="group-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setNotificationMuteDialog(null)} disabled={isUpdatingNotificationMute}>Hủy</button>
                <button type="submit" className="btn-primary" disabled={isUpdatingNotificationMute}>
                  {isUpdatingNotificationMute ? <i className="fa-solid fa-spinner fa-spin"></i> : 'Đồng ý'}
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
          <form className="group-modal create-group-modal" onSubmit={handleCreateGroup}>
            <div className="group-modal-header">
              <h2>Tạo nhóm trò chuyện</h2>
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
                <label className="btn-group-avatar-upload">
                  <i className="fa-solid fa-camera"></i>
                  <span>{groupAvatarFile ? 'Đổi ảnh' : 'Tải ảnh lên'}</span>
                  <input type="file" accept="image/*" onChange={handleGroupAvatarChange} disabled={isCreatingGroup || chatMode !== 'tinode'} />
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
              <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Nhập tên nhóm" required autoFocus />
            </label>

            <div className="group-form-field">
              <span>Thêm thành viên</span>
              <input
                value={groupMemberSearch}
                onChange={handleFilterGroupMembers}
                placeholder="Lọc danh bạ theo tên, email hoặc username"
                aria-label="Lọc danh bạ công ty"
              />
              {companyContacts.length > 0 && (
                <p className="group-form-hint">
                  {groupMemberIds.length > 0
                    ? `Đã chọn ${groupMemberIds.length} thành viên từ danh bạ công ty.`
                    : `Chọn trực tiếp từ ${companyContacts.length} người trong danh bạ công ty.`}
                </p>
              )}
              {groupCandidates.length > 0 ? (
                <div className="group-member-picker">
                  {groupCandidates.map(member => {
                    const memberId = member.id || member.name;
                    const selected = groupMemberIds.includes(memberId);
                    return (
                      <button
                        type="button"
                        key={memberId}
                        className={`group-member-option ${selected ? 'selected' : ''}`}
                        onClick={() => toggleGroupMember(member)}
                        aria-pressed={selected}
                      >
                        <span className="picker-check"><i className={`fa-solid ${selected ? 'fa-check' : 'fa-plus'}`}></i></span>
                        <span className="picker-name">{member.name}</span>
                        <span className="picker-status">{accountPresenceLabel(member)}{directoryUsernameMeta(member)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : <p className="group-form-hint">{
                groupMemberSearch.trim()
                  ? 'Không tìm thấy thành viên phù hợp trong danh bạ công ty.'
                  : 'Danh bạ công ty hiện chưa có thành viên khác.'
              }</p>}
            </div>

            <div className="group-modal-footer actions-only">
              <div className="group-modal-actions">
                <button type="button" className="btn-secondary" onClick={closeCreateGroupModal} disabled={isCreatingGroup}>Hủy</button>
                <button type="submit" className="btn-primary" disabled={!groupName.trim() || isCreatingGroup}>{isCreatingGroup ? 'Đang tạo...' : 'Tạo nhóm'}</button>
              </div>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

export default App;
