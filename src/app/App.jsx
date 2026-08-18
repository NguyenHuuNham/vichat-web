import React, { useState, useEffect, useRef, useCallback } from 'react';
import Login from '../features/auth/components/Login';
import EnterpriseWorkspace from '../features/workspace/components/EnterpriseWorkspace';
import CallOverlay from '../features/chat/components/CallOverlay';
import { isTinodeConfigured, tinodeClient, normalizeTinodeConversation, normalizeTinodeMediaUrl } from '../features/chat/services/tinodeClient';
import { chatManagementService, managementAuthClient } from '../features/chat/services/chatManagementService';
import {
  applyReceiptToMessages,
  conversationManagementMergePolicy,
  conversationDisplayName,
  firstVisibleConversationId,
  isManagementConversationId,
  mergeDeliveryStatus,
  normalizeConversationShape,
  readyTinodeTypingTopic,
  resolvePreparedTinodeTopic,
  shouldShowConversation,
  tinodeContactsSyncDelay,
} from '../features/chat/services/chatRealtime';
import {
  APP_LANGUAGE_OPTIONS,
  APP_THEME_OPTIONS,
  CUSTOM_NOTIFICATION_SOUND_ID,
  DEFAULT_NOTIFICATION_SETTINGS,
  MESSAGE_SOUND_OPTIONS,
  NOTIFICATION_MUTE_OPTIONS,
  deleteCustomNotificationSound,
  isConversationMuted,
  messageSoundProfile,
  nextNotificationMuteExpiry,
  notificationMuteLabel,
  notificationMessageBody,
  normalizeNotificationSettings,
  readCustomNotificationSound,
  readNotificationSettings,
  resolveNotificationMuteUntil,
  validateCustomNotificationSoundFile,
  writeNotificationSettings,
  writeCustomNotificationSound,
} from '../features/chat/services/conversationNotifications';
import {
  applyLocalConversationPins,
  toggleConversationPinIds,
} from '../features/chat/services/conversationPinPolicy';
import {
  CONVERSATION_CATEGORY_OPTIONS,
  applyLocalConversationCategories,
  readConversationCategories,
  setConversationCategory,
} from '../features/chat/services/conversationCategoryPolicy';
import { resolveCallsEnabled } from '../features/chat/services/callSignaling';
import { attachmentConversationPreview } from '../features/chat/services/messagePreview';
import {
  formatAudioDuration,
  isAudioAttachment,
  splitAttachmentSelection,
  messageContentLabel,
  replyContentLabel,
} from '../features/chat/services/messagePresentation';
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
  canManageGroupMembers,
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
  normalizeAccountShape,
  resolveGroupAdministrator,
  snapshotPresence,
  updateAccountProfiles,
  updateAccountPresence,
} from '../features/contacts/services/accountDirectory';
import { addDemoGroupMembers, appendDemoGroupMessage, deleteDemoGroupForUser, leaveDemoGroup, markDemoGroupRead, removeDemoGroupMember, saveDemoGroup, updateDemoGroupMessage } from '../features/demo/services/demoGroupStore';
import { appendDemoDirectMessage, deleteDemoDirectForUser, directConversationId, markDemoDirectRead, saveDemoDirect, updateDemoDirectMessage } from '../features/demo/services/demoDirectStore';
import { CHATBOT_ACCOUNT, CHATBOT_STARTER_PROMPTS, EXTERNAL_CHAT_ONLY, applyTinodeChatbotConfig, loadChatbotMessages, loadChatbotMessagesFromServer, loadTinodeChatbotConfig, requestChatbotReply, saveChatbotMessage } from '../features/chatbot/services/chatbotService';
import {
  PIN_VALIDATION_ERRORS,
  clearPinTabAccess,
  createPinConfig,
  hasPinTabAccess,
  markPinTabUnlocked,
  readPinConfig,
  removePinConfig,
  validatePin,
  verifyPin,
  writePinConfig,
} from '../features/security/services/pinLock';
import { createLocalizedCopy } from '../features/i18n/appLanguage';
import { workspacePanelFromPath, workspacePathForPanel } from '../features/workspace/services/workspaceRouting';

const CALLS_ENABLED = resolveCallsEnabled(import.meta.env.VITE_CALLS_ENABLED);

const APP_LANGUAGE_COPY = Object.freeze({
  vi: Object.freeze({
    chat: 'Chat',
    groups: 'Nhóm',
    work: 'Công việc',
    contacts: 'Danh bạ',
    settings: 'Cài đặt',
    language: 'Ngôn ngữ',
    languageHint: 'Chọn ngôn ngữ hiển thị của ứng dụng',
    themeTitle: 'Cài đặt giao diện',
    themeDescription: 'Chọn giao diện riêng cho tài khoản này',
    themeOptions: { light: 'Sáng', dark: 'Tối', system: 'Hệ thống' },
    notificationSettings: 'Cài đặt thông báo',
    notificationDescription: 'Nhận được thông báo mỗi khi có tin nhắn mới',
    desktopNotifications: 'Thông báo desktop',
    enabled: 'Bật',
    disabled: 'Tắt',
    notificationEnabledDescription: 'Thông báo đang bật',
    notificationDisabledDescription: 'Không nhận thông báo',
    permissionUnsupported: 'Trình duyệt không hỗ trợ thông báo desktop.',
    permissionDenied: 'Quyền thông báo đang bị chặn trong cài đặt trình duyệt.',
    permissionDefault: 'Chọn Bật để cấp quyền hiển thị thông báo trên màn hình.',
    permissionReady: 'Thông báo desktop đang sẵn sàng.',
    soundTitle: 'Âm báo tin nhắn',
    soundDescription: 'Chọn nhạc chuông phát khi có tin nhắn mới',
    enableSound: 'Bật âm báo tin nhắn',
    selectSound: 'Chọn âm báo tin nhắn',
    previewSound: 'Nghe thử',
    customSoundTitle: 'Âm báo từ máy tính',
    checkingSound: 'Đang kiểm tra file trên thiết bị...',
    customSoundEmpty: 'MP3, WAV, OGG hoặc M4A · tối đa 8 MB',
    customSoundMissing: 'Tệp riêng (chưa tải lên)',
    customSoundLabel: 'Tệp riêng',
    soundOptions: { chime: 'Chuông nhẹ', bell: 'Chuông ngân', pop: 'Âm pop', soft: 'Âm dịu' },
    saveSound: 'Đang lưu...',
    replaceSound: 'Đổi file',
    uploadSound: 'Tải file',
    removeSound: 'Xóa',
    pinTitle: 'Thiết lập mã PIN',
    pinDescription: 'Tắt mặc định. Khi bật, tab mới cần nhập mã PIN để mở Chat.',
    pinEnabled: 'Đang bật',
    pinDisabled: 'Đang tắt',
    pinCode: 'Mã PIN mới (4-6 số)',
    pinConfirm: 'Nhập lại mã PIN',
    pinSet: 'Bật khóa PIN',
    pinChange: 'Đổi mã PIN',
    pinDisable: 'Tắt khóa PIN',
    pinSaving: 'Đang lưu...',
    pinDeviceNote: 'Mã PIN chỉ được lưu trên thiết bị của bạn.',
    pinSaved: 'Đã lưu thiết lập mã PIN cho tài khoản này.',
    pinDisabledNotice: 'Đã tắt khóa PIN trên tài khoản này.',
    pinMismatch: 'Hai mã PIN không trùng nhau.',
    pinRequired: 'Hãy nhập mã PIN.',
    pinDigitsOnly: 'Mã PIN chỉ được gồm chữ số.',
    pinLength: 'Mã PIN phải có từ 4 đến 6 chữ số.',
    pinUnlockTitle: 'Mở khóa Chat',
    pinUnlockDescription: 'Nhập mã PIN để tiếp tục vào cuộc trò chuyện.',
    pinUnlock: 'Mở khóa',
    pinWrong: 'Mã PIN không đúng.',
    pinChecking: 'Đang kiểm tra mã PIN...',
  }),
  en: Object.freeze({
    chat: 'Chat',
    groups: 'Group',
    work: 'Work',
    contacts: 'Contacts',
    settings: 'Settings',
    language: 'Language',
    languageHint: 'Choose the application display language',
    themeTitle: 'Appearance',
    themeDescription: 'Choose a theme for this account',
    themeOptions: { light: 'Light', dark: 'Dark', system: 'System' },
    notificationSettings: 'Notification settings',
    notificationDescription: 'Get a notification whenever a new message arrives',
    desktopNotifications: 'Desktop notifications',
    enabled: 'On',
    disabled: 'Off',
    notificationEnabledDescription: 'Notifications are on',
    notificationDisabledDescription: 'Notifications are off',
    permissionUnsupported: 'This browser does not support desktop notifications.',
    permissionDenied: 'Notifications are blocked in the browser settings.',
    permissionDefault: 'Choose On to allow notifications on your screen.',
    permissionReady: 'Desktop notifications are ready.',
    soundTitle: 'Message sound',
    soundDescription: 'Choose the ringtone played for new messages',
    enableSound: 'Enable message sound',
    selectSound: 'Choose message sound',
    previewSound: 'Preview',
    customSoundTitle: 'Sound from computer',
    checkingSound: 'Checking the file on this device...',
    customSoundEmpty: 'MP3, WAV, OGG or M4A · up to 8 MB',
    customSoundMissing: 'Custom file (not uploaded)',
    customSoundLabel: 'Custom file',
    soundOptions: { chime: 'Soft chime', bell: 'Bell', pop: 'Pop sound', soft: 'Gentle sound' },
    saveSound: 'Saving...',
    replaceSound: 'Replace file',
    uploadSound: 'Upload file',
    removeSound: 'Remove',
    pinTitle: 'Set up a PIN',
    pinDescription: 'Off by default. When enabled, a new tab needs the PIN to open Chat.',
    pinEnabled: 'On',
    pinDisabled: 'Off',
    pinCode: 'New PIN (4-6 digits)',
    pinConfirm: 'Confirm PIN',
    pinSet: 'Enable PIN lock',
    pinChange: 'Change PIN',
    pinDisable: 'Disable PIN lock',
    pinSaving: 'Saving...',
    pinDeviceNote: 'Your PIN is stored only on this device.',
    pinSaved: 'PIN lock saved for this account.',
    pinDisabledNotice: 'PIN lock is disabled for this account.',
    pinMismatch: 'The PIN entries do not match.',
    pinRequired: 'Enter a PIN.',
    pinDigitsOnly: 'The PIN can contain digits only.',
    pinLength: 'The PIN must contain 4 to 6 digits.',
    pinUnlockTitle: 'Unlock Chat',
    pinUnlockDescription: 'Enter your PIN to continue to the conversation.',
    pinUnlock: 'Unlock',
    pinWrong: 'Incorrect PIN.',
    pinChecking: 'Checking PIN...',
  }),
});

const MEDIA_BROWSER_TABS = Object.freeze([
  Object.freeze({ id: 'images', label: 'Ảnh/Video', icon: 'fa-images' }),
  Object.freeze({ id: 'files', label: 'Tệp', icon: 'fa-file-lines' }),
  Object.freeze({ id: 'links', label: 'Liên kết', icon: 'fa-link' }),
]);

const MEDIA_DATE_FILTER_OPTIONS = Object.freeze([
  Object.freeze({ id: 'all', label: 'Tất cả thời gian' }),
  Object.freeze({ id: '7d', label: '7 ngày qua' }),
  Object.freeze({ id: '30d', label: '30 ngày qua' }),
  Object.freeze({ id: '90d', label: '3 tháng qua' }),
  Object.freeze({ id: 'custom', label: 'Khoảng ngày tùy chọn' }),
]);

function tinodeTopicName(room) {
  return room?.tinodeTopic || room?.id || '';
}

function getTimeString() {
  const date = new Date();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Không thể đọc ảnh nhóm.'));
    reader.readAsDataURL(file);
  });
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

function isVideoAttachment(file) {
  const name = String(file?.name || '').toLowerCase();
  const mime = String(file?.mime || '').toLowerCase();
  return mime.startsWith('video/') || /\.(avi|mov|mkv|mp4|webm)$/.test(name);
}

function attachmentForMessage(message) {
  if (!message) return null;
  return message.file || (message.type === 'image' && message.image ? {
    name: 'Hình ảnh',
    mime: 'image/*',
    size: 'Hình ảnh',
    url: message.image,
  } : null);
}

function replyMetadataForMessage(message, fallbackSenderName = '') {
  const attachment = attachmentForMessage(message);
  return {
    id: message?.id,
    senderName: message?.senderName || fallbackSenderName || (message?.sender === 'outgoing' ? 'Bạn' : 'Thành viên'),
    text: message?.text || (attachment ? messageContentLabel(message) : ''),
    type: message?.type || '',
    fileName: attachment?.name || '',
    fileMime: attachment?.mime || '',
    voiceDuration: Number(message?.voiceDuration) || 0,
  };
}

function messageSenderId(message) {
  return String(message?.senderId || message?.raw?.from || message?.raw?.head?.['x-sender-id'] || '');
}

function messageSenderName(message) {
  return message?.senderName || (message?.sender === 'outgoing' ? 'Bạn' : 'Thành viên');
}

function messageLinks(message) {
  const explicitLinks = Array.isArray(message?.links)
    ? message.links.map(link => typeof link === 'string' ? link : link?.url || link?.href).filter(Boolean)
    : [];
  const textLinks = String(message?.text || '').match(/https?:\/\/[^\s<]+/gi) || [];
  return [...new Set([...explicitLinks, ...textLinks].map(link => String(link).replace(/[),.;!?]+$/, '')))]
    .filter(link => /^https?:\/\//i.test(link));
}

function mediaEntriesForMessages(messages = []) {
  const entries = [];
  messages.forEach(message => {
    if (!message || ['system', 'friend_event', 'call'].includes(message.type)) return;
    const timestamp = messageTimestamp(message);
    const attachment = attachmentForMessage(message);
    const senderId = messageSenderId(message);
    const senderName = messageSenderName(message);
    if (attachment) {
      const visual = isImageAttachment(attachment, message.type) || isVideoAttachment(attachment);
      entries.push({
        id: `attachment-${message.id || message.seq || entries.length}`,
        kind: visual ? 'images' : 'files',
        message,
        attachment,
        timestamp,
        senderId,
        senderName,
        searchText: `${attachment.name || ''} ${attachment.mime || ''} ${message.text || ''} ${senderName}`.toLowerCase(),
      });
    }
    messageLinks(message).forEach((url, index) => {
      entries.push({
        id: `link-${message.id || message.seq || entries.length}-${index}`,
        kind: 'links',
        message,
        url,
        timestamp,
        senderId,
        senderName,
        searchText: `${url} ${message.text || ''} ${senderName}`.toLowerCase(),
      });
    });
  });
  return entries.sort((first, second) => second.timestamp - first.timestamp);
}

function formatMediaDateHeading(timestamp, locale = 'vi-VN') {
  if (!timestamp) return locale.startsWith('en') ? 'Unknown date' : 'Chưa xác định ngày';
  const date = new Date(timestamp);
  if (locale.startsWith('en')) return date.toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' });
  return `Ngày ${date.getDate()} Tháng ${date.getMonth() + 1}, ${date.getFullYear()}`;
}

function mediaDateKey(timestamp) {
  if (!timestamp) return 'unknown';
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function TinodeImagePreview({ source, alt, className = '', copy = { t: value => value } }) {
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
        <span>{copy.t('Không tải được ảnh xem trước')}</span>
      </span>
    );
  }

  if (!resolvedSource) {
    return (
      <span className="image-preview-placeholder" role="status" aria-label={copy.t('Đang tải ảnh')}>
        <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
        <span>{copy.t('Đang tải ảnh...')}</span>
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

function ImageViewer({ source, copy = { t: value => value }, onClose }) {
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
      aria-label={copy.t('Xem ảnh')}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button type="button" className="image-viewer-close" onClick={onClose} aria-label={copy.t('Đóng ảnh')} title={copy.t('Đóng ảnh')}>
        <i className="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
      <div className="image-viewer-content" onMouseDown={event => event.stopPropagation()}>
        <TinodeImagePreview source={source} alt={copy.t('Ảnh đính kèm')} copy={copy} className="image-viewer-image" />
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
  const targetIds = Array.isArray(message.targetIds) ? message.targetIds : [];
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

function localizedSystemText(message, copy, accounts = [], viewerId = '') {
  if (!message) return '';
  const text = message.type === 'system'
    ? personalizeGroupSystemText(message, accounts, viewerId)
    : message.text || '';
  return copy.t(text);
}

function roomMembers(room) {
  return Array.isArray(room?.members) ? room.members : [];
}

function roomMessages(room) {
  return Array.isArray(room?.messages) ? room.messages : [];
}

function roomFriendEvents(room) {
  return Array.isArray(room?.friendEvents) ? room.friendEvents : [];
}

function localizedConversationPreview(room, copy, accounts = [], viewerId = '') {
  const lastMessage = roomMessages(room).filter(Boolean).at(-1);
  if (lastMessage?.type === 'system' || lastMessage?.type === 'friend_event' || lastMessage?.type === 'call') {
    return localizedSystemText(lastMessage, copy, accounts, viewerId);
  }
  if (room?.isChatbot && lastMessage?.isWelcome) {
    return `${lastMessage.senderName || CHATBOT_ACCOUNT.name}: ${copy.t(lastMessage.text)}`;
  }
  const attachmentPreview = attachmentConversationPreview(lastMessage);
  if (attachmentPreview) return copy.t(attachmentPreview);
  if (lastMessage?.type === 'text' && lastMessage.text) {
    const sender = lastMessage.sender === 'outgoing'
      ? copy.t('Bạn')
      : lastMessage.senderName || copy.t('Thành viên');
    return `${sender}: ${lastMessage.text}`;
  }
  if (!lastMessage && ['Chưa có tin nhắn', 'Bắt đầu cuộc trò chuyện', 'Nhóm mới được tạo'].includes(room?.lastMsg)) {
    return copy.t(room.lastMsg);
  }
  return room?.lastMsg || '';
}

function isSelfDirectConversation(room, user, accounts) {
  if (!room || room.isGroup || !user) return false;
  const userId = user.id || user.uid;
  if (room.id === userId || room.id === user.uid) return true;
  const members = roomMembers(room);
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
    return roomMembers(room).some(member => member.id === viewerId);
  }
  if (room.isGroup) {
    return roomMembers(room).some(member => {
      const account = findAccount(accounts, member.id || member.name);
      return member.id === viewerId || account?.id === viewerId;
    });
  }
  return (room.participantIds || []).includes(viewerId);
}

function isConversationHiddenAfterDelete(room) {
  const deletedAt = Date.parse(room?.deletedAt || '') || 0;
  if (!deletedAt) return false;
  const latestMessageAt = Math.max(0, ...roomMessages(room).map(message => messageTimestamp(message)));
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
    roomFriendEvents(room).forEach(message => {
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
  const existingList = Array.isArray(existingMessages) ? existingMessages : [];
  const incomingList = Array.isArray(incomingMessages) ? incomingMessages : [];

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

  existingList.forEach(upsert);
  incomingList.forEach(upsert);

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
  const messages = roomMessages(room).filter(item => (
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
  if (!existing) return normalizeConversationShape(incoming);
  const safeExisting = normalizeConversationShape(existing);
  const safeIncoming = normalizeConversationShape(incoming);
  const messages = mergeTinodeMessages(safeExisting.messages, safeIncoming.messages);
  const friendEvents = mergeTinodeMessages(safeExisting.friendEvents, safeIncoming.friendEvents);
  const latestAttachmentPreview = attachmentConversationPreview(messages.at(-1));
  const {
    managementOwned,
    incomingManagementSnapshot,
  } = conversationManagementMergePolicy(safeExisting, {
    ...safeIncoming,
    managementSnapshot: safeIncoming.managementSnapshot
      || incoming?.managementSnapshot
      || incoming?.management_snapshot,
  });
  const snapshotMembers = incomingManagementSnapshot
    ? safeIncoming.members
    : (safeIncoming.members.length ? safeIncoming.members : safeExisting.members);
  const members = incomingManagementSnapshot
    ? mergeRealtimeMemberPresence(snapshotMembers, safeExisting.members)
    : managementOwned
      ? mergeRealtimeMemberPresence(safeExisting.members, safeIncoming.members)
      : snapshotMembers;
  const incomingExplicitName = conversationDisplayName({ ...safeIncoming, members: [] }, '');
  const existingExplicitName = conversationDisplayName({ ...safeExisting, members: [] }, '');
  const incomingPeerName = safeIncoming.isGroup ? '' : conversationDisplayName(safeIncoming, '');
  const existingPeerName = safeExisting.isGroup ? '' : conversationDisplayName(safeExisting, '');
  const existingName = existingExplicitName || existingPeerName;
  const incomingName = incomingExplicitName || (!existingName ? incomingPeerName : '');
  const fallbackName = safeExisting.isGroup || safeIncoming.isGroup ? 'Nhóm' : 'Cuộc trò chuyện cá nhân';
  return {
    ...safeExisting,
    ...safeIncoming,
    managementSnapshot: safeExisting.managementSnapshot || safeIncoming.managementSnapshot,
    name: managementOwned && !incomingManagementSnapshot
      ? existingName || incomingName || fallbackName
      : incomingName || existingName || fallbackName,
    avatarHtml: safeIncoming.avatarHtml || safeExisting.avatarHtml,
    avatarUrl: managementOwned && !incomingManagementSnapshot
      ? (safeIncoming.avatarUrl || safeExisting.avatarUrl)
      : (safeIncoming.avatarUrl !== undefined ? safeIncoming.avatarUrl : safeExisting.avatarUrl),
    description: managementOwned && !incomingManagementSnapshot
      ? safeExisting.description
      : (safeIncoming.description || safeExisting.description),
    admin: managementOwned && !incomingManagementSnapshot
      ? safeExisting.admin
      : (safeIncoming.admin || safeExisting.admin),
    adminId: managementOwned && !incomingManagementSnapshot
      ? safeExisting.adminId
      : (safeIncoming.adminId || safeExisting.adminId),
    members,
    participantIds: incomingManagementSnapshot ? safeIncoming.participantIds : safeExisting.participantIds,
    messages,
    friendEvents,
    lastMsg: latestAttachmentPreview || safeIncoming.lastMsg || safeExisting.lastMsg,
    time: safeIncoming.time || safeExisting.time,
    updatedAt: safeIncoming.updatedAt || safeExisting.updatedAt || messages[messages.length - 1]?.createdAt,
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
    return <span className={`${className} avatar-fallback`} aria-label={name || 'Ảnh đại diện'}>{name?.trim?.().slice(0, 1).toUpperCase() || '?'}</span>;
  }
  return <img src={resolvedSrc} alt={name || 'Ảnh đại diện'} className={className} onError={() => setFailed(true)} />;
}

function AudioMessagePlayer({ file, duration = 0, time = '', delivery = null, pending = false, failed = false, copy = { t: value => value }, onError }) {
  const audioRef = useRef(null);
  const [resolvedSource, setResolvedSource] = useState('');
  const [mediaVersion, setMediaVersion] = useState(() => tinodeClient.getMediaVersion(file?.url));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadedDuration, setLoadedDuration] = useState(Number(duration) || 0);
  const [loadFailed, setLoadFailed] = useState(false);
  const waveform = [10, 17, 23, 14, 28, 20, 12, 25, 18, 30, 16, 22, 11, 27, 19, 13, 24, 16, 29, 18, 12, 21, 15, 26];

  useEffect(() => {
    const normalizedSource = normalizeTinodeMediaUrl(file?.url);
    return tinodeClient.onEvent(event => {
      if (event.type === 'media-invalidated' && event.url === normalizedSource) {
        setMediaVersion(tinodeClient.getMediaVersion(file?.url));
      }
    });
  }, [file?.url]);

  useEffect(() => {
    let active = true;
    setResolvedSource('');
    setLoadFailed(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setLoadedDuration(Number(duration) || 0);
    if (!file?.url) return () => { active = false; };

    tinodeClient.resolveMediaUrl(file.url)
      .then(url => {
        if (active) setResolvedSource(url || '');
      })
      .catch(error => {
        if (!active) return;
        setLoadFailed(true);
        onError?.(error);
      });

    const audioElement = audioRef.current;
    return () => {
      active = false;
      audioElement?.pause();
    };
  }, [file?.url, duration, mediaVersion, onError]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !resolvedSource) return;
    try {
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch (error) {
      setLoadFailed(true);
      onError?.(error);
    }
  };

  const progress = loadedDuration > 0 ? Math.min(1, currentTime / loadedDuration) : 0;
  return (
    <div className={`message-bubble audio-bubble ${pending ? 'pending' : ''} ${failed || loadFailed ? 'failed' : ''}`}>
      <button
        type="button"
        className="audio-play-button"
        onClick={togglePlayback}
        disabled={!resolvedSource}
        aria-label={copy.t(isPlaying ? 'Tạm dừng tin nhắn thoại' : 'Phát tin nhắn thoại')}
      >
        <i className={`fa-solid ${isPlaying ? 'fa-pause' : resolvedSource ? 'fa-play' : 'fa-spinner fa-spin'}`}></i>
      </button>
      <span className="audio-waveform" aria-hidden="true">
        {waveform.map((height, index) => (
          <i key={`${height}-${index}`} className={index / waveform.length < progress ? 'played' : ''} style={{ height: `${height}px` }}></i>
        ))}
      </span>
      <span className="audio-duration">{formatAudioDuration(loadedDuration)}</span>
      <span className="message-time">{time} {delivery}</span>
      {resolvedSource && (
        <audio
          ref={audioRef}
          src={resolvedSource}
          preload="metadata"
          onLoadedMetadata={event => {
            if (Number.isFinite(event.currentTarget.duration) && event.currentTarget.duration > 0) setLoadedDuration(event.currentTarget.duration);
          }}
          onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime || 0)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
          onError={() => {
            setLoadFailed(true);
            onError?.(new Error(copy.t('Không thể phát tin nhắn thoại.')));
          }}
        />
      )}
    </div>
  );
}

function MessageReplyPreview({ reply, copy = { t: value => value } }) {
  if (!reply) return null;
  const isAudio = isAudioAttachment(reply.file || { name: reply.fileName, mime: reply.fileMime }, reply.type) || Number(reply.voiceDuration) > 0;
  const isImage = reply.type === 'image' || String(reply.fileMime || reply.file?.mime || '').toLowerCase().startsWith('image/');
  const icon = isAudio ? 'fa-microphone' : isImage ? 'fa-image' : reply.fileName ? 'fa-paperclip' : 'fa-reply';
  const senderName = typeof reply.senderName === 'string' ? reply.senderName : copy.t('Tin nhắn');
  const replyText = typeof reply.text === 'string'
    ? reply.text.trim()
    : (typeof reply.text === 'number' && Number.isFinite(reply.text) ? String(reply.text) : '');
  return (
    <div className="message-reply-preview">
      <span className="message-reply-preview-icon"><i className={`fa-solid ${icon}`} aria-hidden="true"></i></span>
      <span className="message-reply-preview-copy">
        <strong>{senderName}</strong>
        <span>{replyText || copy.t(replyContentLabel(reply))}</span>
      </span>
    </div>
  );
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
  const safeMessages = Array.isArray(messages) ? messages : [];
  return safeMessages.filter(message =>
    message.senderId && message.senderId !== viewerId && (Date.parse(message.createdAt || '') || 0) > lastReadAt
  ).length;
}

function demoGroupToConversation(group, accounts, viewerId) {
  const memberIds = Array.isArray(group.memberIds) ? group.memberIds : [];
  const members = memberIds.map(memberId => {
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
  const messages = (Array.isArray(group.messages) ? group.messages : [])
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
    name: conversationDisplayName(group, 'Nhóm'),
    isGroup: true,
    avatarHtml: group.avatar ? undefined : <i className="fa-solid fa-users"></i>,
    avatarUrl: group.avatar || '',
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
  const otherName = conversationDisplayName(
    { ...direct, name: other?.name, members: other ? [other] : [] },
    'Cuộc trò chuyện cá nhân',
  );
  const deletedBefore = Date.parse(direct.deletedAtByUser?.[viewerId] || '') || 0;
  const messages = (Array.isArray(direct.messages) ? direct.messages : [])
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
    name: otherName,
    isGroup: false,
    avatarHtml: other?.avatar ? <img src={other.avatar} alt={otherName} /> : <span>{otherName.slice(0, 1).toUpperCase() || '?'}</span>,
    avatarClass: '',
    membersCount: other?.online ? 'Đang hoạt động' : 'Ngoại tuyến',
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
      const roomForName = room.isGroup
        ? { ...room, members: [] }
        : peer ? { ...room, name: peer.name, members: [peer] } : room;
      const roomName = conversationDisplayName(
        roomForName,
        room.isGroup ? 'Nhóm' : 'Cuộc trò chuyện cá nhân',
      );
      return {
        ...room,
        ...(peer ? {
          avatarHtml: undefined,
          avatarUrl: peer.avatar || '',
          membersCount: peer.online ? 'Đang hoạt động' : 'Ngoại tuyến',
          description: '',
          members: [{ ...peer }],
        } : {}),
        name: roomName,
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
  const [isGroupMemberPickerOpen, setIsGroupMemberPickerOpen] = useState(false);
  const [groupMemberAddIds, setGroupMemberAddIds] = useState([]);
  const [groupMemberAddProfiles, setGroupMemberAddProfiles] = useState({});
  const [groupMemberAddSearch, setGroupMemberAddSearch] = useState('');
  const [isAddingGroupMembers, setIsAddingGroupMembers] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState('');
  const [workspacePanel, setWorkspacePanel] = useState(() => (
    typeof window === 'undefined' ? null : workspacePanelFromPath(window.location.pathname)
  ));
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
  const [conversationMenu, setConversationMenu] = useState(null);
  const [conversationCategoryMenuOpen, setConversationCategoryMenuOpen] = useState(false);
  const [conversationCategories, setConversationCategories] = useState({});
  const [replyingTo, setReplyingTo] = useState(null);
  const [profileContact, setProfileContact] = useState(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceRecordingSeconds, setVoiceRecordingSeconds] = useState(0);
  const [messageDetails, setMessageDetails] = useState(null);
  const [shareMessage, setShareMessage] = useState(null);
  const [messageActions, setMessageActions] = useState({});
  const [notificationMuteDialog, setNotificationMuteDialog] = useState(null);
  const [notificationMuteOption, setNotificationMuteOption] = useState(NOTIFICATION_MUTE_OPTIONS.ONE_HOUR);
  const [isUpdatingNotificationMute, setIsUpdatingNotificationMute] = useState(false);
  const [notificationClock, setNotificationClock] = useState(() => Date.now());
  const [displayClock, setDisplayClock] = useState(() => Date.now());
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_NOTIFICATION_SETTINGS }));
  const [notificationSettingsNotice, setNotificationSettingsNotice] = useState('');
  const [customNotificationSound, setCustomNotificationSound] = useState(null);
  const [customNotificationSoundUrl, setCustomNotificationSoundUrl] = useState('');
  const [isLoadingCustomNotificationSound, setIsLoadingCustomNotificationSound] = useState(false);
  const [isSavingCustomNotificationSound, setIsSavingCustomNotificationSound] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [pinLockConfig, setPinLockConfig] = useState(null);
  const [pinLockReady, setPinLockReady] = useState(true);
  const [isPinTabUnlocked, setIsPinTabUnlocked] = useState(true);
  const [pinSetupValue, setPinSetupValue] = useState('');
  const [pinConfirmValue, setPinConfirmValue] = useState('');
  const [pinUnlockValue, setPinUnlockValue] = useState('');
  const [pinSettingsNotice, setPinSettingsNotice] = useState('');
  const [pinUnlockNotice, setPinUnlockNotice] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [directoryAccounts, setDirectoryAccounts] = useState([]);
  const [isUpdatingProfileAvatar, setIsUpdatingProfileAvatar] = useState(false);
  const [isUpdatingGroupAvatar, setIsUpdatingGroupAvatar] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', email: '', title: '', department: '' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [tenantSwitcherOpen, setTenantSwitcherOpen] = useState(false);
  const [isSwitchingTenant, setIsSwitchingTenant] = useState(false);
  const [tenantSwitchNotice, setTenantSwitchNotice] = useState('');
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const [forcedLogoutSeconds, setForcedLogoutSeconds] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [imageViewer, setImageViewer] = useState(null);
  const [mediaBrowserOpen, setMediaBrowserOpen] = useState(false);
  const [mediaBrowserTab, setMediaBrowserTab] = useState('images');
  const [mediaSenderFilter, setMediaSenderFilter] = useState('all');
  const [mediaDateFilter, setMediaDateFilter] = useState('all');
  const [mediaSearchQuery, setMediaSearchQuery] = useState('');
  const [mediaFromDate, setMediaFromDate] = useState('');
  const [mediaToDate, setMediaToDate] = useState('');

  useEffect(() => {
    if (!mediaBrowserOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mediaBrowserOpen]);

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
  const imageInputRef = useRef(null);
  const mentionPickerRef = useRef(null);
  const languageMenuRef = useRef(null);
  const tenantSwitcherRef = useRef(null);
  const currentChatIdRef = useRef(currentChatId);
  const deletedConversationIdsRef = useRef(new Set());
  const createGroupRequestRef = useRef(false);
  const tinodeSessionRequestRef = useRef(null);
  const conversationsRef = useRef(conversations);
  const currentUserRef = useRef(currentUser);
  const directoryAccountsRef = useRef(directoryAccounts);
  const avatarOverridesRef = useRef(new Map());
  const groupAvatarSyncRef = useRef(new Map());
  const typingNoticeAtRef = useRef(new Map());
  const typingClearTimersRef = useRef(new Map());
  const mediaRecorderRef = useRef(null);
  const voiceChunksRef = useRef([]);
  const voiceRecordingDurationRef = useRef(0);
  const voiceDiscardRef = useRef(false);
  const voiceTimerRef = useRef(null);
  const notificationBaselineRef = useRef(new Map());
  const notificationAudioContextRef = useRef(null);
  const notificationCustomAudioRef = useRef(null);
  const notificationSoundFileInputRef = useRef(null);
  const notificationOpenHandlerRef = useRef(null);
  const contactsSyncTimerRef = useRef(null);
  const contactsSyncRequestRef = useRef(0);
  const logoutHandlerRef = useRef(null);
  const forcedLogoutHandlerRef = useRef(null);
  const forcedLogoutRef = useRef(false);
  const isLoggingOutRef = useRef(false);
  const accountSessionRef = useRef(0);
  const managementConversationSessionRef = useRef(0);
  const activeCallRef = useRef(null);
  const sessionRestoreAttemptedRef = useRef(false);
  const loginSuccessHandlerRef = useRef(null);

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

  // Normalize every room used by render paths, including the sidebar. A direct
  // snapshot can be malformed before it reaches the active-chat selector.
  const renderConversations = Object.fromEntries(
    Object.entries(conversations || {}).map(([id, room]) => [id, normalizeConversationShape(room)]),
  );
  const rawActiveChatSource = renderConversations[currentChatId] || Object.values(renderConversations)[0];
  const activeChatSource = rawActiveChatSource ? normalizeConversationShape(rawActiveChatSource) : null;
  const activeChatNameSource = activeChatSource?.isGroup
    ? { ...activeChatSource, members: [] }
    : activeChatSource;
  const activeChat = activeChatSource ? {
    ...activeChatSource,
    name: conversationDisplayName(
      activeChatNameSource,
      activeChatSource.isGroup ? 'Nhóm' : 'Cuộc trò chuyện cá nhân',
    ),
  } : {
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
  useEffect(() => {
    setIsGroupMemberPickerOpen(false);
    setGroupMemberAddIds([]);
    setGroupMemberAddProfiles({});
    setGroupMemberAddSearch('');
  }, [activeChat.id]);
  const conversationCategoryFor = room => {
    const key = String(room?.managementId || room?.id || '');
    const categoryId = conversationCategories[key] || room?.category || '';
    return CONVERSATION_CATEGORY_OPTIONS.find(option => option.id === categoryId) || null;
  };
  const activeChatMuted = isConversationMuted(activeChat.notificationMutedUntil, notificationClock);
  const activeChatMuteLabel = notificationMuteLabel(activeChat.notificationMutedUntil, notificationClock, settings.language === 'en' ? 'en-US' : 'vi-VN');
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
  const appCopy = createLocalizedCopy(APP_LANGUAGE_COPY[settings.language] || APP_LANGUAGE_COPY.vi, settings.language);
  const selectedLanguage = APP_LANGUAGE_OPTIONS.find(option => option.id === settings.language)
    || APP_LANGUAGE_OPTIONS[0];
  const pinViewerId = currentUser?.id || currentUser?.uid || '';
  const accountPresenceLabel = account => {
    if (usesManagementData && chatMode !== 'tinode') return appCopy.t('Danh bạ Chatmgt');
    return appCopy.t(isAccountOnline(account) ? 'Đang hoạt động' : 'Ngoại tuyến');
  };

  const isCurrentUserOnline = Boolean(
    isLoggedIn && currentUser && (chatMode !== 'tinode' || connectionStatus === 'online')
  );
  const activeGroupPresence = activeChat.isGroup
    ? countGroupPresence(activeChat.members, currentUser, isCurrentUserOnline)
    : null;
  const activeDirectPeer = !activeChat.isGroup && !activeChat.isChatbot
    ? activeChat.members?.find(member => !identitiesOverlap(member, currentUser)) || activeChat.members?.[0]
    : null;
  const activeChatPresenceLabel = activeGroupPresence
    ? appCopy.t(`${activeGroupPresence.memberCount} thành viên • ${activeGroupPresence.onlineCount} đang online`)
    : activeDirectPeer
      ? appCopy.t(isAccountOnline(activeDirectPeer) ? 'Đang hoạt động' : 'Ngoại tuyến')
    : appCopy.t(activeChat.membersCount);
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
  const tenantOptions = (Array.isArray(currentUser?.tenantOptions)
    ? currentUser.tenantOptions
    : Array.isArray(currentUser?.tenant_options) ? currentUser.tenant_options : [])
    .filter(option => option?.id && option.active !== false);
  const canSwitchTenant = tenantOptions.length > 1;

  useEffect(() => () => {
    if (voiceTimerRef.current) window.clearInterval(voiceTimerRef.current);
    voiceDiscardRef.current = true;
    mediaRecorderRef.current?.stream?.getTracks?.().forEach(track => track.stop());
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('songhong.primary-sidebar-collapsed', String(isPrimarySidebarCollapsed));
    } catch {
      // The layout still works when browser storage is unavailable.
    }
  }, [isPrimarySidebarCollapsed]);

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = settings.language;
  }, [settings.language]);

  useEffect(() => {
    if (!languageMenuOpen || typeof document === 'undefined') return undefined;
    const closeLanguageMenu = event => {
      if (!languageMenuRef.current?.contains(event.target)) setLanguageMenuOpen(false);
    };
    const handleLanguageMenuKeyDown = event => {
      if (event.key === 'Escape') setLanguageMenuOpen(false);
    };
    document.addEventListener('mousedown', closeLanguageMenu);
    document.addEventListener('keydown', handleLanguageMenuKeyDown);
    return () => {
      document.removeEventListener('mousedown', closeLanguageMenu);
      document.removeEventListener('keydown', handleLanguageMenuKeyDown);
    };
  }, [languageMenuOpen]);

  useEffect(() => {
    if (!tenantSwitcherOpen || typeof document === 'undefined') return undefined;
    const closeTenantSwitcher = event => {
      if (!tenantSwitcherRef.current?.contains(event.target)) setTenantSwitcherOpen(false);
    };
    const handleTenantSwitcherKeyDown = event => {
      if (event.key === 'Escape') setTenantSwitcherOpen(false);
    };
    document.addEventListener('mousedown', closeTenantSwitcher);
    document.addEventListener('keydown', handleTenantSwitcherKeyDown);
    return () => {
      document.removeEventListener('mousedown', closeTenantSwitcher);
      document.removeEventListener('keydown', handleTenantSwitcherKeyDown);
    };
  }, [tenantSwitcherOpen]);

  useEffect(() => {
    if (!pinViewerId) {
      setPinLockConfig(null);
      setPinLockReady(true);
      setIsPinTabUnlocked(true);
      setPinSetupValue('');
      setPinConfirmValue('');
      setPinUnlockValue('');
      setPinSettingsNotice('');
      setPinUnlockNotice('');
      return undefined;
    }
    let active = true;
    setPinLockReady(false);
    const config = readPinConfig(pinViewerId);
    if (active) {
      setPinLockConfig(config);
      setIsPinTabUnlocked(!config || hasPinTabAccess(pinViewerId));
      setPinLockReady(true);
      setPinUnlockValue('');
      setPinUnlockNotice('');
      setPinSettingsNotice('');
    }
    return () => { active = false; };
  }, [pinViewerId]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const mediaQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
    const applyTheme = () => {
      const resolvedTheme = settings.theme === 'dark'
        || (settings.theme === 'system' && Boolean(mediaQuery?.matches))
        ? 'dark'
        : 'light';
      root.dataset.theme = resolvedTheme;
      root.style.colorScheme = resolvedTheme;
    };
    applyTheme();
    if (settings.theme !== 'system' || !mediaQuery) return undefined;
    if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', applyTheme);
    else mediaQuery.addListener?.(applyTheme);
    return () => {
      if (mediaQuery.removeEventListener) mediaQuery.removeEventListener('change', applyTheme);
      else mediaQuery.removeListener?.(applyTheme);
    };
  }, [settings.theme]);

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
  const desktopNotificationPermission = typeof window !== 'undefined' && 'Notification' in window
    ? window.Notification.permission
    : 'unsupported';
  const notificationSettingsViewerId = currentUser?.id || currentUser?.uid || viewerId;

  const updateNotificationSettings = useCallback(patch => {
    setSettings(previous => {
      const next = normalizeNotificationSettings({ ...previous, ...patch });
      if (notificationSettingsViewerId) writeNotificationSettings(notificationSettingsViewerId, next);
      return next;
    });
  }, [notificationSettingsViewerId]);

  useEffect(() => {
    if (!notificationSettingsViewerId) {
      setSettings({ ...DEFAULT_NOTIFICATION_SETTINGS });
      setNotificationSettingsNotice('');
      return;
    }
    setSettings(readNotificationSettings(notificationSettingsViewerId));
    setNotificationSettingsNotice('');
  }, [notificationSettingsViewerId]);

  useEffect(() => {
    setConversationCategories(managementViewerId ? readConversationCategories(managementViewerId) : {});
    setConversationCategoryMenuOpen(false);
  }, [managementViewerId]);

  useEffect(() => {
    let active = true;
    setCustomNotificationSound(null);
    setIsLoadingCustomNotificationSound(Boolean(notificationSettingsViewerId));
    if (!notificationSettingsViewerId) return undefined;

    readCustomNotificationSound(notificationSettingsViewerId)
      .then(sound => {
        if (active) setCustomNotificationSound(sound);
      })
      .catch(() => {
        if (active) {
          setCustomNotificationSound(null);
          setNotificationSettingsNotice('Không thể đọc âm báo đã tải lên trên thiết bị này.');
        }
      })
      .finally(() => {
        if (active) setIsLoadingCustomNotificationSound(false);
      });

    return () => {
      active = false;
    };
  }, [notificationSettingsViewerId]);

  useEffect(() => {
    if (!customNotificationSound?.blob || typeof URL === 'undefined' || !URL.createObjectURL) {
      setCustomNotificationSoundUrl('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(customNotificationSound.blob);
    setCustomNotificationSoundUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
      const audio = notificationCustomAudioRef.current;
      if (audio?.src === objectUrl) {
        audio.pause();
        audio.src = '';
        notificationCustomAudioRef.current = null;
      }
    };
  }, [customNotificationSound]);

  const handleCustomNotificationSoundUpload = useCallback(async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const validationError = validateCustomNotificationSoundFile(file);
    if (validationError) {
      setNotificationSettingsNotice(validationError);
      return;
    }
    if (!notificationSettingsViewerId) return;

    setIsSavingCustomNotificationSound(true);
    setNotificationSettingsNotice('');
    try {
      const savedSound = await writeCustomNotificationSound(notificationSettingsViewerId, file);
      setCustomNotificationSound(savedSound);
      updateNotificationSettings({ sound: CUSTOM_NOTIFICATION_SOUND_ID, sounds: true });
      setNotificationSettingsNotice(`Đã lưu âm báo "${savedSound.name}" trên thiết bị này.`);
    } catch (error) {
      setNotificationSettingsNotice(error?.message || 'Không thể lưu file âm thanh trên thiết bị này.');
    } finally {
      setIsSavingCustomNotificationSound(false);
    }
  }, [notificationSettingsViewerId, updateNotificationSettings]);

  const handleRemoveCustomNotificationSound = useCallback(async () => {
    if (!notificationSettingsViewerId || isSavingCustomNotificationSound) return;
    setIsSavingCustomNotificationSound(true);
    setNotificationSettingsNotice('');
    try {
      await deleteCustomNotificationSound(notificationSettingsViewerId);
      setCustomNotificationSound(null);
      updateNotificationSettings({ sound: DEFAULT_NOTIFICATION_SETTINGS.sound });
      setNotificationSettingsNotice('Đã xóa âm báo tùy chỉnh khỏi thiết bị này.');
    } catch (error) {
      setNotificationSettingsNotice(error?.message || 'Không thể xóa file âm thanh.');
    } finally {
      setIsSavingCustomNotificationSound(false);
    }
  }, [isSavingCustomNotificationSound, notificationSettingsViewerId, updateNotificationSettings]);

  const pinValidationMessage = useCallback(errorCode => {
    if (errorCode === PIN_VALIDATION_ERRORS.REQUIRED) return appCopy.pinRequired;
    if (errorCode === PIN_VALIDATION_ERRORS.DIGITS_ONLY) return appCopy.pinDigitsOnly;
    if (errorCode === PIN_VALIDATION_ERRORS.LENGTH) return appCopy.pinLength;
    return appCopy.pinLength;
  }, [appCopy]);

  const handlePinSettingsSubmit = useCallback(async event => {
    event.preventDefault();
    if (!pinViewerId || isSavingPin) return;
    const validationError = validatePin(pinSetupValue);
    if (validationError) {
      setPinSettingsNotice(pinValidationMessage(validationError));
      return;
    }
    if (pinSetupValue !== pinConfirmValue) {
      setPinSettingsNotice(appCopy.pinMismatch);
      return;
    }
    setIsSavingPin(true);
    setPinSettingsNotice('');
    try {
      const config = await createPinConfig(pinSetupValue);
      if (!writePinConfig(pinViewerId, config)) throw new Error('PIN_STORAGE_UNAVAILABLE');
      markPinTabUnlocked(pinViewerId);
      setPinLockConfig(config);
      setIsPinTabUnlocked(true);
      setPinSetupValue('');
      setPinConfirmValue('');
      setPinSettingsNotice(appCopy.pinSaved);
    } catch (error) {
      setPinSettingsNotice(error?.message === 'PIN_STORAGE_UNAVAILABLE'
        ? 'Không thể lưu mã PIN trên thiết bị này.'
        : pinValidationMessage(error?.message));
    } finally {
      setIsSavingPin(false);
    }
  }, [appCopy, isSavingPin, pinConfirmValue, pinSetupValue, pinValidationMessage, pinViewerId]);

  const handleDisablePin = useCallback(() => {
    if (!pinViewerId || isSavingPin) return;
    removePinConfig(pinViewerId);
    clearPinTabAccess(pinViewerId);
    setPinLockConfig(null);
    setIsPinTabUnlocked(true);
    setPinSetupValue('');
    setPinConfirmValue('');
    setPinSettingsNotice(appCopy.pinDisabledNotice);
  }, [appCopy.pinDisabledNotice, isSavingPin, pinViewerId]);

  const handlePinUnlockSubmit = useCallback(async event => {
    event.preventDefault();
    if (!pinViewerId || !pinLockConfig || isVerifyingPin) return;
    const validationError = validatePin(pinUnlockValue);
    if (validationError) {
      setPinUnlockNotice(pinValidationMessage(validationError));
      return;
    }
    setIsVerifyingPin(true);
    setPinUnlockNotice('');
    try {
      const valid = await verifyPin(pinUnlockValue, pinLockConfig);
      if (!valid) {
        setPinUnlockNotice(appCopy.pinWrong);
        return;
      }
      markPinTabUnlocked(pinViewerId);
      setIsPinTabUnlocked(true);
      setPinUnlockValue('');
    } finally {
      setIsVerifyingPin(false);
    }
  }, [appCopy.pinWrong, isVerifyingPin, pinLockConfig, pinValidationMessage, pinUnlockValue, pinViewerId]);

  const handleDesktopNotificationToggle = useCallback(async enabled => {
    if (!enabled) {
      updateNotificationSettings({ desktopNotifications: false });
      setNotificationSettingsNotice('Thông báo desktop đã tắt trên tài khoản này.');
      return;
    }
    if (typeof window === 'undefined' || !('Notification' in window)) {
      updateNotificationSettings({ desktopNotifications: false });
      setNotificationSettingsNotice('Trình duyệt hiện tại không hỗ trợ thông báo desktop.');
      return;
    }
    let permission = window.Notification.permission;
    if (permission === 'default') permission = await window.Notification.requestPermission();
    if (permission === 'granted') {
      updateNotificationSettings({ desktopNotifications: true });
      setNotificationSettingsNotice('Thông báo desktop đã được bật.');
    } else if (permission === 'denied') {
      updateNotificationSettings({ desktopNotifications: false });
      setNotificationSettingsNotice('Trình duyệt đang chặn thông báo. Hãy cho phép thông báo trong cài đặt site.');
    } else {
      updateNotificationSettings({ desktopNotifications: false });
      setNotificationSettingsNotice('Chưa cấp quyền thông báo desktop.');
    }
  }, [updateNotificationSettings]);

  const mentionCandidates = (() => {
    if (!activeChat.isGroup) return [];
    const rawMembers = [
      ...roomMembers(activeChat),
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
        name: appCopy.t('Tất cả'),
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
        const members = roomMembers(room).map(member => {
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
        const membersCount = peer ? (peer.online ? 'Đang hoạt động' : 'Ngoại tuyến') : room.membersCount;
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
  const activeAdminName = activeAdminAccount?.name || activeChat.admin || appCopy.t('Chưa xác định');

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
    const closeMenus = event => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      setMessageMenu(null);
      setConversationMenu(null);
      setConversationCategoryMenuOpen(false);
      if (event.type === 'keydown') setProfileContact(null);
    };
    document.addEventListener('click', closeMenus);
    document.addEventListener('keydown', closeMenus);
    return () => {
      document.removeEventListener('click', closeMenus);
      document.removeEventListener('keydown', closeMenus);
    };
  }, []);

  useEffect(() => {
    currentChatIdRef.current = currentChatId;
  }, [currentChatId]);

  useEffect(() => {
    const now = Date.now();
    const nextExpiry = nextNotificationMuteExpiry(
      Object.values(conversations || {}).map(normalizeConversationShape),
      now,
    );
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
    const managedRoomsSnapshot = managementRoomsForSession(managed, directoryAccounts, currentUser, accountSession);
    const managedRooms = applyLocalConversationCategories(
      chatManagementService.remote
        ? managedRoomsSnapshot
        : applyLocalConversationPins(managedRoomsSnapshot, managementUserId),
      managementUserId,
    );
    const previousRooms = conversationsRef.current;
    const nextRooms = Object.fromEntries(Object.entries(previousRooms).filter(([, room]) => (
      room.isChatbot
      || (!room.managementId && !room.tinodeTopic && roomFriendEvents(room).length > 0)
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
      const memberAccounts = roomMembers(preparedRoom)
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
      const contact = roomMembers(preparedRoom)
        .find(member => String(member?.id || '') !== String(managementUserId));
      topicName = contact?.tinodeUid || contact?.tinode_uid || '';
    }

    if (!topicName) throw new Error('Chatmgt chưa gắn topic Tinode cho cuộc trò chuyện này.');
    let liveGroupAvatar = '';
    if (preparedRoom.isGroup) {
      if (!groupAvatarSyncRef.current.has(topicName)) {
        liveGroupAvatar = await tinodeClient.getConversationAvatar(topicName).catch(() => '');
        groupAvatarSyncRef.current.set(topicName, liveGroupAvatar);
      } else {
        liveGroupAvatar = groupAvatarSyncRef.current.get(topicName) || '';
      }
    }
    const effectiveGroupAvatar = liveGroupAvatar || createdGroupAvatar || preparedRoom.avatarUrl || room.avatarUrl || '';
    try {
      await chatManagementService.bindTinodeTopic(
        managementUserId,
        managementConversationId,
        topicName,
        { avatarUrl: effectiveGroupAvatar },
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
        avatarUrl: effectiveGroupAvatar,
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

  const playNotificationSound = useCallback((soundId = settings.sound) => {
    if (typeof window === 'undefined') return;
    try {
      if (soundId === CUSTOM_NOTIFICATION_SOUND_ID && customNotificationSoundUrl && typeof window.Audio === 'function') {
        const previousAudio = notificationCustomAudioRef.current;
        previousAudio?.pause?.();
        const audio = new window.Audio(customNotificationSoundUrl);
        audio.preload = 'auto';
        audio.volume = 0.75;
        notificationCustomAudioRef.current = audio;
        const playback = audio.play();
        playback?.catch?.(() => {});
        return;
      }
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = notificationAudioContextRef.current || new AudioContext();
      notificationAudioContextRef.current = context;
      if (context.state === 'suspended') context.resume().catch(() => {});
      const profile = messageSoundProfile(
        soundId === CUSTOM_NOTIFICATION_SOUND_ID
          ? DEFAULT_NOTIFICATION_SETTINGS.sound
          : soundId,
      );
      const startAt = context.currentTime + 0.01;
      profile.tones.forEach(([frequency, offset, duration]) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = startAt + offset;
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.045, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
      });
    } catch {
      // Browsers may block sound until the page has received user input.
    }
  }, [customNotificationSoundUrl, settings.sound]);

  const showIncomingNotification = useCallback((conversation, message, stateId) => {
    if (!message || message.senderId === viewerId || typeof window === 'undefined') return;
    const shouldAlert = document.visibilityState === 'hidden' || currentChatIdRef.current !== stateId;
    if (!shouldAlert) return;
    const notificationRoom = conversationsRef.current[stateId] || conversation;
    if (isConversationMuted(notificationRoom?.notificationMutedUntil)) return;

    if (settings.sounds) playNotificationSound(settings.sound);
    if (settings.desktopNotifications && desktopNotificationPermission === 'granted') {
      try {
        const senderName = message.senderName || notificationRoom?.name || 'Tin nhắn mới';
        const desktopNotification = new window.Notification(notificationRoom?.name || 'ViChat', {
          body: `${senderName}: ${notificationMessageBody(message, appCopy.t)}`,
          icon: '/chat-logo.svg',
          tag: `vichat:${stateId}`,
          renotify: true,
          silent: true,
        });
        desktopNotification.onclick = () => {
          window.focus();
          desktopNotification.close();
          notificationOpenHandlerRef.current?.(stateId);
        };
      } catch {
        // Permission can be revoked between rendering and an incoming packet.
      }
    }
  }, [appCopy, desktopNotificationPermission, playNotificationSound, settings.desktopNotifications, settings.sound, settings.sounds, viewerId]);

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
            const messages = applyReceiptToMessages(roomMessages(room), {
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
        const typingProfile = normalizeAccountShape({ id: event.uid, name: event.name });
        setTypingByTopic(previous => ({
          ...previous,
          [event.topic]: { uid: event.uid, name: typingProfile?.name || 'Thành viên' },
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
        const profile = normalizeAccountShape(profileAccount
          ? {
            ...event.profile,
            id: profileAccount.id,
            uid: profileAccount.uid || profileAccount.id,
            tinodeUid: profileAccount.tinodeUid || profileAccount.tinode_uid || event.profile.id,
          }
          : event.profile) || {};
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
          const members = roomMembers(room).map(updateAccount);
          const peer = !room.isGroup ? members.find(member => identitiesOverlap(member, profile)) : null;
          return [id, {
            ...room,
            ...(peer ? { name: profile.name || room.name, avatarUrl: profile.avatar || room.avatarUrl || '' } : {}),
            members,
            messages: roomMessages(room).map(message => identitiesOverlap({ id: message.senderId }, profile)
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
        const currentRoom = currentRooms[stateId];
        if (
          currentRoom?.isGroup
          && conversation.avatarUrl
          && conversation.avatarUrl !== currentRoom.avatarUrl
          && chatManagementService.remote
          && isManagementConversationId(currentRoom.managementId || currentRoom.id)
        ) {
          groupAvatarSyncRef.current.set(conversation.id, conversation.avatarUrl);
          chatManagementService.bindTinodeTopic(
            managementViewerId,
            currentRoom.managementId || currentRoom.id,
            conversation.id,
            { avatarUrl: conversation.avatarUrl },
          ).catch(() => {});
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
  }, [isLoggedIn, chatMode, managementConversationSession, currentUser, directoryAccounts, applyPresenceSnapshot, clearActiveCall, refreshManagementConversations, showIncomingNotification, viewerId, managementViewerId]);

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

  const handleLoginSuccess = async (user, { source = 'credentials' } = {}) => {
    clearActiveCall();
    if (!EXTERNAL_CHAT_ONLY) await tinodeClient.logout();
    setLoginNotice('');
    const accountSession = ++accountSessionRef.current;
    managementConversationSessionRef.current = 0;
    setManagementConversationSession(0);
    const managementUserId = String(user.id || user.uid || '');
    setPinLockReady(false);
    setPinLockConfig(null);
    setIsPinTabUnlocked(false);
    setPinUnlockValue('');
    setPinUnlockNotice('');
    setPinSettingsNotice('');
    if (source !== 'restore' && managementUserId) markPinTabUnlocked(managementUserId);
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
    setConversationCategories({});
    setConversationCategoryMenuOpen(false);
    setMediaBrowserOpen(false);
    setDirectoryAccounts([]);
    avatarOverridesRef.current.clear();
    groupAvatarSyncRef.current.clear();
    setConversationMenu(null);
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
        const managedRoomsSnapshot = managementRoomsForSession(managed, accounts, user, accountSession);
        const managedRooms = applyLocalConversationCategories(
          chatManagementService.remote
            ? managedRoomsSnapshot
            : applyLocalConversationPins(managedRoomsSnapshot, managementUserId),
          managementUserId,
        );
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

  loginSuccessHandlerRef.current = handleLoginSuccess;

  useEffect(() => {
    if (!chatManagementService.remote || sessionRestoreAttemptedRef.current) return undefined;
    sessionRestoreAttemptedRef.current = true;
    let cancelled = false;
    managementAuthClient.restoreSession()
      .then(session => {
        if (cancelled) return;
        return loginSuccessHandlerRef.current?.({
          id: session.uid,
          uid: session.uid,
          username: session.login,
          name: session.profile?.name || session.login,
          email: session.email || '',
          role: session.role,
          department: session.department,
          tenantId: session.tenantId,
          tenantName: session.tenantName,
          tenant: session.tenant,
          tenantOptions: session.tenantOptions,
          tinodeUid: session.tinodeUid,
          tinodeAuth: session.tinodeAuth,
          title: session.profile?.title || '',
          tinodeSession: session,
          connection: session.connection,
          avatar: session.profile?.avatar || '',
          mustChangePassword: Boolean(session.mustChangePassword),
        }, { source: 'restore' });
      })
      .catch(error => {
        if (cancelled || error?.status === 401 || error?.status === 403) return;
        setLoginNotice('Không thể khôi phục phiên hiện tại. Bạn có thể đăng nhập lại.');
      });
    return () => { cancelled = true; };
  }, []);

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

  notificationOpenHandlerRef.current = handleConversationSelect;

  const resetWorkspaceNavigationState = () => {
    setWorkspaceQuery('');
    setWorkspaceResults([]);
    setTenantSwitcherOpen(false);
    setTenantSwitchNotice('');
    setConversationMenu(null);
    setConversationCategoryMenuOpen(false);
    setMessageMenu(null);
    setProfileContact(null);
  };

  const navigateWorkspace = (panel, { replace = false } = {}) => {
    if (typeof window !== 'undefined') {
      const nextPath = workspacePathForPanel(panel);
      if (window.location.pathname !== nextPath) {
        const method = replace ? 'replaceState' : 'pushState';
        window.history[method]({ ...(window.history.state || {}), vichatWorkspace: panel }, '', nextPath);
      }
    }
    resetWorkspaceNavigationState();
    if (panel) setChatError('');
    setWorkspacePanel(panel);
  };

  const openWorkspacePanel = panel => navigateWorkspace(panel);
  const closeWorkspacePanel = options => navigateWorkspace(null, options);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleWorkspacePopState = () => {
      setWorkspacePanel(workspacePanelFromPath(window.location.pathname));
      resetWorkspaceNavigationState();
    };
    window.addEventListener('popstate', handleWorkspacePopState);
    return () => window.removeEventListener('popstate', handleWorkspacePopState);
  }, []);

  useEffect(() => {
    if (!isLoggedIn || typeof window === 'undefined') return;
    const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
    const nextPath = workspacePathForPanel(workspacePanel);
    if (workspacePanel === null && (currentPath === '/' || currentPath === '/chat')) return;
    if (currentPath !== nextPath) {
      window.history.replaceState({ ...(window.history.state || {}), vichatWorkspace: workspacePanel }, '', nextPath);
    }
  }, [isLoggedIn, workspacePanel]);

  const handleLogout = async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    const loggedOutViewerId = currentUser?.id || currentUser?.uid || '';
    if (loggedOutViewerId) clearPinTabAccess(loggedOutViewerId);
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
    setPinLockConfig(null);
    setPinLockReady(true);
    setIsPinTabUnlocked(true);
    setPinSetupValue('');
    setPinConfirmValue('');
    setPinUnlockValue('');
    setPinSettingsNotice('');
    setPinUnlockNotice('');
    setDrafts({});
    setMessageMentions({});
    setMentionContext(null);
    setInputText('');
    setChatMode('demo');
    setConnectionStatus(isTinodeConfigured ? 'ready' : 'demo');
    setChatError('');
    setFriendNotice('');
    closeWorkspacePanel({ replace: true });
    setEnterpriseTaskSeed(null);
    setNotificationMuteDialog(null);
    setIsUpdatingNotificationMute(false);
    setNotificationClock(Date.now());
    setConversationMenu(null);
    tinodeSessionRequestRef.current = null;
    deletedConversationIdsRef.current.clear();
    groupAvatarSyncRef.current.clear();
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
    if (!window.confirm(appCopy.t('Bạn có chắc chắn muốn đăng xuất khỏi Chat?'))) return;
    closeWorkspacePanel({ replace: true });
    handleLogout();
  };

  const handleTenantSwitch = async option => {
    const requestedTenantId = String(option?.id || '').trim();
    const currentTenantId = String(profileAccount.tenantId || profileAccount.tenant_id || '').trim();
    if (!requestedTenantId || requestedTenantId === currentTenantId || isSwitchingTenant) return;
    setTenantSwitchNotice('');
    setIsSwitchingTenant(true);
    try {
      const nextSession = await chatManagementService.switchTenant(requestedTenantId);
      accountSessionRef.current += 1;
      managementConversationSessionRef.current = 0;
      setManagementConversationSession(0);
      tinodeClient.setAllowedConversationTopics([]);
      if (chatMode === 'tinode') {
        try {
          await tinodeClient.logout();
        } catch {
          // The new Chatmgt cookie is already issued; reload rebuilds Tinode state.
        }
      }
      setTenantSwitcherOpen(false);
      if (typeof window !== 'undefined') {
        window.location.reload();
      } else if (nextSession) {
        setCurrentUser(previous => ({ ...previous, ...nextSession }));
      }
    } catch (error) {
      const message = error?.code === 'ACCOUNT_TENANT_REQUIRED'
        ? 'Vui lòng chọn công ty hợp lệ.'
        : error?.code === 'ACCOUNT_SSO_REQUIRED'
          ? 'Chỉ tài khoản UpGO mới có thể chuyển công ty.'
          : error?.message || 'Không thể chuyển công ty. Vui lòng thử lại.';
      setTenantSwitchNotice(appCopy.t(message));
    } finally {
      setIsSwitchingTenant(false);
    }
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

  const toggleGroupMemberToAdd = member => {
    const memberId = member?.id || member?.name;
    if (!memberId) return;
    const selected = groupMemberAddIds.includes(memberId);
    setGroupMemberAddIds(previous => selected
      ? previous.filter(id => id !== memberId)
      : [...previous, memberId]);
    setGroupMemberAddProfiles(profiles => {
      const next = { ...profiles };
      if (selected) delete next[memberId];
      else next[memberId] = member;
      return next;
    });
  };

  const handleFilterGroupMembersToAdd = event => {
    setGroupMemberAddSearch(event.target.value);
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
        members: roomMembers(room).map(member => identitiesOverlap(member, currentUser)
          ? { ...member, name: updated.name, avatar: updated.avatar || member.avatar }
          : member),
        messages: roomMessages(room).map(message => identitiesOverlap(message, currentUser)
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
        members: roomMembers(room).map(member => identitiesOverlap(member, currentUser) ? { ...member, avatar: nextAvatar } : member),
        messages: roomMessages(room).map(message => identitiesOverlap(message, currentUser) ? { ...message, avatar: nextAvatar } : message),
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
        membersCount: contact?.online ? 'Đang hoạt động' : 'Ngoại tuyến',
        description: '',
        admin: '',
        members: contact ? [contact] : [],
        messages: [],
        friendEvents: [],
        lastMsg: '',
        time: '',
        badge: 0,
      };
      const nextRoom = normalizeConversationShape({
        ...room,
        name: contact?.name || room.name,
        avatarUrl: contact?.avatar || room.avatarUrl || '',
        members: contact ? [contact] : roomMembers(room),
        friendEvents: mergeTinodeMessages(roomFriendEvents(room), [message]),
      });
      return { ...previous, [roomId]: nextRoom };
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
          const members = roomMembers(room).map(member => {
            const account = findAccount(effectiveAccounts, member.id || member.uid || member.tinodeUid || member.name);
            if (!account) return member;
            const updated = { ...member, name: account.name || member.name, avatar: account.avatar || member.avatar || '', online: member.online };
            return updated.name === member.name && updated.avatar === member.avatar ? member : updated;
          });
          const peer = !room.isGroup
            ? members.find(member => !identitiesOverlap(member, currentUser))
            : null;
          const messages = roomMessages(room).map(message => {
            const account = findAccount(effectiveAccounts, message.senderId || message.senderName);
            if (!account) return message;
            const updated = { ...message, senderName: account.name || message.senderName, avatar: account.avatar || message.avatar || '' };
            return updated.senderName === message.senderName && updated.avatar === message.avatar ? message : updated;
          });
          const friendEvents = roomFriendEvents(room).map(message => {
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
          const membersChanged = members.length !== roomMembers(room).length
            || members.some((member, index) => member !== room.members?.[index]);
          const messagesChanged = messages.length !== roomMessages(room).length
            || messages.some((message, index) => message !== room.messages?.[index]);
          const friendEventsChanged = friendEvents.length !== roomFriendEvents(room).length
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
    const safeContact = normalizeAccountShape(contact);
    if (!safeContact) return;
    if (safeContact.id === (currentUser?.id || currentUser?.uid)) {
      setChatError('Không thể mở cuộc trò chuyện với chính tài khoản đang đăng nhập.');
      return;
    }
    const contactName = conversationDisplayName(
      { name: safeContact.name },
      safeContact.username || safeContact.email || 'Người dùng',
    );
    const viewerId = currentUser?.id || currentUser?.uid;
    const accountSession = accountSessionRef.current;
    const linkedRoom = Object.values(conversations).find(room => (
      !room.isGroup
      && !room.isChatbot
      && room.accountSession === accountSession
      && isManagementConversationId(room.managementId || room.id)
      && (
        (room.participantIds || []).map(String).includes(String(safeContact.id))
        || roomMembers(room).some(member => findAccount(directoryAccounts, member.id || member.name)?.id === safeContact.id)
      )
    ));
    const participantIds = safeContact.id ? [viewerId, safeContact.id] : [];
    const contactId = chatMode === 'demo' && participantIds.length === 2
      ? directConversationId(...participantIds)
      : linkedRoom?.id || safeContact.id || contactName;
    try {
      let stateConversationId = contactId;
      deletedConversationIdsRef.current.delete(contactId);
      let managedRoom = linkedRoom;
      let tinodeTopic = linkedRoom?.tinodeTopic
        || chatManagementService.getTinodeTopic(viewerId, linkedRoom?.managementId || contactId);
      if (usesManagementData && safeContact.id) {
        if (managementConversationSessionRef.current !== accountSession) {
          throw new Error('Danh sách cuộc trò chuyện chưa được chatmgt xác nhận.');
        }
        if (!managedRoom) {
          managedRoom = await chatManagementService.createConversation({
            userId: viewerId,
            subject: contactName,
            participantIds: [safeContact.id],
            properties: {},
          });
          if (accountSessionRef.current !== accountSession) throw new Error('Phiên tài khoản đã thay đổi.');
        }
        tinodeTopic = tinodeTopic || managedRoom.tinodeTopic || '';
        stateConversationId = managedRoom.id;
        const managedStateRoom = {
          ...managedRoom,
          id: stateConversationId,
          managementId: managedRoom.managementId || stateConversationId,
          tinodeTopic,
          name: contactName,
          isGroup: false,
          members: [currentUser, safeContact],
          participantIds,
          accountSession,
        };
        if (chatMode === 'tinode') {
          tinodeTopic = await ensureTinodeConversationTopic(managedStateRoom);
          const restoredRoom = await tinodeClient.restoreConversation(tinodeTopic);
          if (accountSessionRef.current !== accountSession) throw new Error('Phiên tài khoản đã thay đổi.');
          const previousRoom = conversationsRef.current[stateConversationId] || managedStateRoom;
          const restoredStateRoom = {
            ...restoredRoom,
            id: stateConversationId,
            managementId: managedRoom.managementId || stateConversationId,
            tinodeTopic,
            accountSession,
          };
          const restoredRooms = {
            ...conversationsRef.current,
            [stateConversationId]: mergeTinodeConversation(previousRoom, restoredStateRoom),
          };
          conversationsRef.current = restoredRooms;
          setConversations(restoredRooms);
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
        name: contactName,
        isGroup: false,
        avatarHtml: safeContact.avatar ? <img src={safeContact.avatar} alt={contactName} /> : <span>{contactName.slice(0, 1).toUpperCase()}</span>,
        avatarClass: '',
        membersCount: accountPresenceLabel(safeContact),
        description: '',
        admin: '',
        members: [safeContact],
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
      closeWorkspacePanel();
      setIsMobileChatActive(true);
    } catch (err) {
      setChatError(err?.message || 'Không thể mở cuộc trò chuyện.');
    }
  };

  const publicProfileFor = entity => {
    if (!entity) return null;
    const identity = entity.id || entity.uid || entity.tinodeUid || entity.tinode_uid || entity.username || entity.name;
    const account = findAccount(directoryAccounts, identity)
      || findAccount(activeChat.members, identity)
      || (identitiesOverlap(entity, currentUser) ? currentUser : null);
    const merged = normalizeAccountShape({ ...(account || {}), ...(entity || {}) }) || {};
    const isCurrentAccount = identitiesOverlap(merged, currentUser);
    return {
      id: account?.id || account?.uid || merged.id || merged.uid || merged.tinodeUid || merged.tinode_uid || '',
      name: merged.name || merged.username || 'Thành viên',
      avatar: merged.avatar || '',
      username: merged.username || '',
      email: merged.email || '',
      title: merged.title || '',
      department: merged.department || '',
      role: merged.role || merged.accountRole || '',
      online: isCurrentAccount ? isCurrentUserOnline : Boolean(merged.online),
      isCurrentAccount,
    };
  };

  const openProfileFor = entity => {
    const profile = publicProfileFor(entity);
    if (profile) setProfileContact(profile);
  };

  const messageSenderProfile = message => publicProfileFor({
    id: message?.senderId || message?.raw?.from || message?.raw?.head?.['x-sender-id'],
    name: message?.senderName,
    avatar: message?.avatar,
  });

  const mentionCandidateForMessage = message => {
    const senderId = messageSenderId(message);
    const senderName = message?.senderName || '';
    const candidate = findAccount(activeChat.members, senderId)
      || findAccount(directoryAccounts, senderId)
      || findAccount(activeChat.members, senderName)
      || findAccount(directoryAccounts, senderName);
    if (candidate) return { ...candidate, name: candidate.name || senderName };
    if (!senderId && !senderName) return null;
    return {
      id: senderId || senderName,
      tinodeUid: senderId,
      name: senderName || senderId,
      avatar: message?.avatar || '',
    };
  };

  const handleLeaveGroup = async () => {
    if (!activeChat.isGroup || !window.confirm(appCopy.t(`Bạn có chắc muốn rời nhóm "${activeChat.name}"?`))) return;
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

  const handleDeleteConversation = async (roomOverride = null) => {
    const targetRoom = roomOverride || conversations[currentChatId] || {};
    const activeChat = targetRoom;
    if (!targetRoom?.id || targetRoom.isChatbot || isDeletingConversation) return;
    const kind = activeChat.isGroup ? 'nhóm' : 'cuộc trò chuyện';
    const localizedKind = appCopy.t(kind);
    const deleteEffect = usesManagementData
      ? `${localizedKind} ${appCopy.t('sẽ được gỡ khỏi Chatmgt và phiên realtime Tinode của bạn.')}`
      : `${appCopy.t('Toàn bộ tin nhắn và tệp trong')} ${localizedKind} ${appCopy.t('này sẽ bị xóa khỏi tài khoản của bạn và không thể khôi phục.')}`;
    const confirmed = window.confirm(
      `${appCopy.t('Bạn có chắc muốn xóa')} ${localizedKind} "${activeChat.name}"?\n\n${deleteEffect}`,
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

  const updateConversationPin = async room => {
    if (!room || room.isChatbot || room.id === 'empty') return false;
    const nextPinned = !room.pinned;
    const managementConversationId = room.managementId || room.id;
    setChatError('');
    try {
      let persistedPinned = nextPinned;
      let persistedPinnedAt = nextPinned ? Math.floor(Date.now() / 1000) : null;
      if (chatManagementService.remote && chatMode !== 'demo') {
        if (!isManagementConversationId(managementConversationId)) {
          throw new Error('Chatmgt chua xac nhan cuoc tro chuyen nay.');
        }
        const updated = await chatManagementService.updateConversationPin(
          managementConversationId,
          nextPinned,
        );
        persistedPinned = Boolean(updated.pinned);
        persistedPinnedAt = updated.pinnedAt || null;
      } else {
        toggleConversationPinIds(managementViewerId, managementConversationId, nextPinned);
      }
      setConversations(previous => {
        if (!previous[room.id]) return previous;
        const next = {
          ...previous,
          [room.id]: {
            ...previous[room.id],
            pinned: persistedPinned,
            pinnedAt: persistedPinnedAt,
          },
        };
        conversationsRef.current = next;
        return next;
      });
      setConversationMenu(null);
      return true;
    } catch (error) {
      setChatError(error?.message || 'Khong the cap nhat ghim hoi thoai.');
      return false;
    }
  };

  const markConversationUnread = room => {
    if (!room || room.isChatbot) return;
    setConversations(previous => {
      if (!previous[room.id]) return previous;
      const next = {
        ...previous,
        [room.id]: { ...previous[room.id], badge: Math.max(1, previous[room.id].badge || 0) },
      };
      conversationsRef.current = next;
      return next;
    });
    setConversationMenu(null);
  };

  const updateConversationCategory = (room, categoryId) => {
    if (!room) return;
    const viewerKey = managementViewerId || viewerId;
    const conversationId = room.managementId || room.id;
    const nextCategories = setConversationCategory(viewerKey, conversationId, categoryId);
    setConversationCategories(nextCategories);
    setConversations(previous => previous[room.id]
      ? { ...previous, [room.id]: { ...previous[room.id], category: categoryId || '' } }
      : previous);
    setConversationCategoryMenuOpen(false);
    setConversationMenu(null);
  };

  const handleConversationMenuAction = async (action, room, value = '') => {
    if (!room) return;
    if (action === 'category') {
      updateConversationCategory(room, value);
      return;
    }
    if (action === 'pin') {
      await updateConversationPin(room);
      return;
    }
    if (action === 'unread') {
      markConversationUnread(room);
      return;
    }
    if (action === 'mute') {
      setConversationMenu(null);
      if (isConversationMuted(room.notificationMutedUntil, notificationClock)) {
        await updateConversationMute(room.id, null);
      } else {
        setNotificationMuteOption(NOTIFICATION_MUTE_OPTIONS.ONE_HOUR);
        setNotificationMuteDialog({ id: room.id, name: room.name });
      }
      return;
    }
    if (action === 'delete') {
      setConversationMenu(null);
      await handleDeleteConversation(room);
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
          const tinodeActorId = tinodeClient.currentUserId || viewerId;
      const targetUids = (Array.isArray(realtimeRoom.members) ? realtimeRoom.members : [])
            .filter(member => member.id && member.id !== tinodeActorId);
          await tinodeClient.sendSystemEvent(tinodeTopic, {
            action: addedNames.length > 0 ? 'member_added' : 'group_created',
            actorId: tinodeActorId,
            actorName: currentUser?.name,
            targets: targetUids.map(member => ({
              id: member.id,
              name: member.name || findAccount(directoryAccounts, member.id)?.name || member.id,
            })),
          });
        }
      } else {
        const initialAvatar = chatMode === 'demo' && groupAvatarFile
          ? await readFileAsDataUrl(groupAvatarFile)
          : '';
        let group = saveDemoGroup({
          name,
          description: groupDescription.trim(),
          avatar: initialAvatar,
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
      if (workspacePanel === 'groups') closeWorkspacePanel();
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

  const handleActiveGroupAvatarChange = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeChat.isGroup || isUpdatingGroupAvatar) return;
    if (!file.type.startsWith('image/')) {
      setChatError('Ảnh nhóm phải là file hình ảnh.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setChatError('Ảnh nhóm không được vượt quá 8 MB.');
      return;
    }
    if (usesManagementData && chatMode !== 'tinode') {
      setChatError('Cập nhật ảnh nhóm cần kết nối realtime Tinode.');
      return;
    }
    setIsUpdatingGroupAvatar(true);
    setChatError('');
    try {
      if (chatMode === 'demo') {
        const avatarUrl = await readFileAsDataUrl(file);
      const memberIds = roomMembers(activeChat)
          .map(member => findAccount(directoryAccounts, member.id || member.uid || member.name)?.id || member.id)
          .filter(Boolean);
        const group = saveDemoGroup({
          id: activeChat.id,
          name: activeChat.name,
          description: activeChat.description || '',
          avatar: avatarUrl,
          ownerId: activeChat.adminId || viewerId,
          memberIds,
        });
        const updatedRoom = demoGroupToConversation(group, directoryAccounts, viewerId);
        setConversations(previous => {
          const next = { ...previous, [activeChat.id]: updatedRoom };
          conversationsRef.current = next;
          return next;
        });
        return;
      }
      const topicName = activeChat.tinodeTopic || await ensureTinodeConversationTopic(activeChat);
      const avatarUrl = await tinodeClient.updateGroupAvatar(topicName, file);
      if (usesManagementData && isManagementConversationId(activeChat.managementId || activeChat.id)) {
        await chatManagementService.bindTinodeTopic(
          managementViewerId,
          activeChat.managementId || activeChat.id,
          topicName,
          { avatarUrl },
        );
      }
      groupAvatarSyncRef.current.set(activeChat.id, avatarUrl);
      groupAvatarSyncRef.current.set(topicName, avatarUrl);
      setConversations(previous => {
        const currentRoom = previous[activeChat.id] || activeChat;
        const updatedRoom = mergeTinodeConversation(currentRoom, { ...currentRoom, avatarUrl });
        const next = { ...previous, [activeChat.id]: updatedRoom };
        conversationsRef.current = next;
        return next;
      });
    } catch (error) {
      setChatError(error?.message || 'Không thể cập nhật ảnh nhóm.');
    } finally {
      setIsUpdatingGroupAvatar(false);
    }
  };

  const handleAddGroupMembers = async () => {
    if (
      isAddingGroupMembers
      || !activeChat.isGroup
      || !canManageGroupMembers(activeChat, directoryAccounts, currentUser)
      || groupMemberAddIds.length === 0
    ) return;
    const selectedMembers = groupMemberAddIds
      .map(memberId => groupMemberAddProfiles[memberId] || findAccount(directoryAccounts, memberId))
      .filter(Boolean);
    if (selectedMembers.length === 0) return;

    const stateConversationId = activeChat.id;
    const managementConversationId = activeChat.managementId || stateConversationId;
    setIsAddingGroupMembers(true);
    setChatError('');
    try {
      const actorId = currentUser?.id || currentUser?.uid;
      const tinodeActorId = chatMode === 'tinode' ? (tinodeClient.currentUserId || viewerId) : actorId;
      const selectedIds = selectedMembers.map(member => member.id || member.uid || member.name).filter(Boolean);
      const systemText = `${currentUser?.name || 'Quản trị viên'} đã thêm ${selectedMembers.map(member => member.name).join(', ')} vào nhóm`;
      const systemMessage = {
        id: `system-add-${Date.now()}`,
        type: 'system',
        action: 'member_added',
        senderId: actorId,
        senderName: currentUser?.name,
        targetIds: selectedIds,
        text: systemText,
        time: getTimeString(),
        createdAt: new Date().toISOString(),
      };
      let updatedRoom;
      if (usesManagementData) {
        const accountSession = accountSessionRef.current;
        const managedRoom = await chatManagementService.addConversationParticipants(
          managementConversationId,
          selectedIds,
        );
        if (chatMode === 'tinode') {
          const topicName = activeChat.tinodeTopic
            || managedRoom.tinodeTopic
            || await ensureTinodeConversationTopic({
              ...activeChat,
              id: stateConversationId,
              managementId: managementConversationId,
            });
          const realtimeRoom = await tinodeClient.openConversation(topicName);
          await tinodeClient.sendSystemEvent(topicName, {
            action: 'member_added',
            actorId: tinodeActorId,
            actorName: currentUser?.name,
            targets: selectedMembers.map(member => ({
              id: member.tinodeUid || member.tinode_uid || member.uid || member.id,
              name: member.name,
            })),
          }).catch(() => {});
          updatedRoom = {
            ...normalizeTinodeConversation(realtimeRoom),
            ...managedRoom,
            id: stateConversationId,
            managementId: managementConversationId,
            tinodeTopic: topicName,
            accountSession,
            managementSnapshot: true,
            messages: roomMessages(realtimeRoom).length > 0 ? roomMessages(realtimeRoom) : roomMessages(activeChat),
          };
        } else {
          updatedRoom = {
            ...normalizeTinodeConversation(managedRoom),
            id: stateConversationId,
            managementId: managementConversationId,
            accountSession,
            managementSnapshot: true,
            messages: roomMessages(activeChat),
          };
        }
      } else if (chatMode === 'tinode') {
        const topicName = activeChat.tinodeTopic || await ensureTinodeConversationTopic(activeChat);
        await Promise.all(selectedMembers.map(member => tinodeClient.addMember(
          topicName,
          member.tinodeUid || member.tinode_uid || member.uid || member.id,
        )));
        const realtimeRoom = await tinodeClient.openConversation(topicName);
        await tinodeClient.sendSystemEvent(topicName, {
          action: 'member_added',
          actorId: tinodeActorId,
          actorName: currentUser?.name,
          targets: selectedMembers.map(member => ({
            id: member.tinodeUid || member.tinode_uid || member.uid || member.id,
            name: member.name,
          })),
        }).catch(() => {});
        updatedRoom = {
          ...normalizeTinodeConversation(realtimeRoom),
          ...activeChat,
          tinodeTopic: topicName,
          messages: roomMessages(realtimeRoom).length > 0 ? roomMessages(realtimeRoom) : roomMessages(activeChat),
        };
      } else {
        const group = addDemoGroupMembers(activeChat.id, selectedIds);
        const groupWithEvent = appendDemoGroupMessage(group.id, systemMessage);
        updatedRoom = demoGroupToConversation(groupWithEvent, directoryAccounts, actorId);
      }
      setConversations(previous => {
        const currentRoom = previous[stateConversationId] || activeChat;
        const next = {
          ...previous,
          [stateConversationId]: mergeTinodeConversation(currentRoom, updatedRoom),
        };
        conversationsRef.current = next;
        return next;
      });
      setIsGroupMemberPickerOpen(false);
      setGroupMemberAddIds([]);
      setGroupMemberAddProfiles({});
      setGroupMemberAddSearch('');
    } catch (error) {
      setChatError(error?.message || 'Không thể thêm thành viên vào nhóm.');
    } finally {
      setIsAddingGroupMembers(false);
    }
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
    if (!window.confirm(appCopy.t(`Bạn có chắc muốn xóa ${member.name} khỏi nhóm "${activeChat.name}"?`))) return;

    const stateConversationId = activeChat.id;
    const managementConversationId = activeChat.managementId || stateConversationId;
    const memberIdentity = member.id || member.uid || member.tinodeUid || member.tinode_uid || member.name;
    setRemovingMemberId(memberIdentity);
    setChatError('');
    try {
      const memberAccount = findAccount(directoryAccounts, memberIdentity)
        || findAccount(activeChat.members, memberIdentity);
      const event = {
        action: 'member_removed',
        actorId: viewerId,
        actorName: currentUser?.name,
        targets: [{
          id: memberAccount?.tinodeUid
            || memberAccount?.tinode_uid
            || member.tinodeUid
            || member.tinode_uid
            || member.uid
            || member.id,
          name: member.name,
        }],
      };
      let updatedRoom;
      if (usesManagementData) {
        if (!memberAccount?.id) throw new Error('Chatmgt không xác định được thành viên cần xóa.');
        if (chatMode === 'tinode') {
          // A bound topic is already managed by Chatmgt; do not re-bind it
          // before removing a member because the old Tinode snapshot may be
          // exactly the inconsistency this operation is repairing.
          const topicName = activeChat.tinodeTopic || await ensureTinodeConversationTopic(activeChat);
          const managedRoom = await chatManagementService.removeConversationParticipant(
            managementConversationId,
            memberAccount.id,
          );
          await tinodeClient.sendSystemEvent(topicName, event).catch(() => {});
          const realtimeRoom = await tinodeClient.openConversation(topicName).catch(() => ({
          messages: roomMessages(activeChat),
          }));
          updatedRoom = {
            ...normalizeTinodeConversation(realtimeRoom),
            ...managedRoom,
            id: stateConversationId,
            managementId: managementConversationId,
            tinodeTopic: topicName,
            accountSession: accountSessionRef.current,
            managementSnapshot: true,
            messages: roomMessages(realtimeRoom).length > 0 ? roomMessages(realtimeRoom) : roomMessages(activeChat),
          };
        } else {
          const managedRoom = await chatManagementService.removeConversationParticipant(
            managementConversationId,
            memberAccount.id,
          );
          updatedRoom = {
            ...normalizeTinodeConversation(managedRoom),
            id: stateConversationId,
            managementId: managementConversationId,
            accountSession: accountSessionRef.current,
            managementSnapshot: true,
            messages: roomMessages(activeChat),
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
      setConversations(previous => {
        const currentRoom = previous[stateConversationId] || activeChat;
        const next = {
          ...previous,
          [stateConversationId]: mergeTinodeConversation(currentRoom, {
            ...updatedRoom,
            id: stateConversationId,
            managementId: managementConversationId,
          }),
        };
        conversationsRef.current = next;
        return next;
      });
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
      ...roomMembers(room).map(member => findAccount(directoryAccounts, member.id || member.name)?.id || member.id),
    ].filter(Boolean))];
    saveDemoGroup({
      id: room.id,
      name: room.name,
      description: room.description,
      ownerId: findAccount(directoryAccounts, room.admin)?.id || viewerId,
      memberIds,
      messages: roomMessages(room).map(toStoredMessage),
    });
    appendDemoGroupMessage(room.id, toStoredMessage(message));
  };

  const persistDemoDirectMessage = (room, message) => {
    if (chatMode !== 'demo' || room?.isGroup) return;
    const viewerId = currentUser?.id || currentUser?.uid;
    const participantIds = room?.participantIds?.length === 2
      ? room.participantIds
      : [viewerId, ...roomMembers(room).map(member => findAccount(directoryAccounts, member.id || member.name)?.id || member.id)]
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
      messages: roomMessages(room).map(toStoredMessage),
    });
    if (message) appendDemoDirectMessage(directId, toStoredMessage(message));
  };

  // --- Attach & Gửi tệp tin ---
  const openAttachmentPicker = inputRef => {
    if (activeChat.isChatbot) {
      setChatError('Trợ lý AI hiện chỉ nhận tin nhắn văn bản.');
      return;
    }
    if (realtimeMessagingPending) {
      setChatError('Kết nối realtime Tinode chưa sẵn sàng; dữ liệu Chatmgt vẫn đang hoạt động.');
      return;
    }
    if (inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleAttachClick = () => openAttachmentPicker(fileInputRef);
  const handleImageAttachClick = () => openAttachmentPicker(imageInputRef);

  const handleSendFile = (file, { voiceDuration = 0 } = {}) => {
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
    const replyMeta = replyingTo ? { ...replyingTo } : null;

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
        size: `${displayExt} • ${sizeStr}`,
        voiceDuration: Number(voiceDuration) || 0,
      },
      image: previewUrl || undefined,
      replyTo: replyMeta,
      voiceDuration: Number(voiceDuration) || 0,
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
          messages: [...roomMessages(room), newMsg],
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
    setReplyingTo(null);

    if (chatMode === 'tinode') {
      const roomId = currentChatId;
      const room = conversations[roomId];
      ensureTinodeConversationTopic(room)
        .then(async topicName => {
          const result = await tinodeClient.sendFile(topicName, uploadFile, newMsg.id, { replyTo: replyMeta, voiceDuration });
          const confirmedIsImage = /^image\//i.test(result.file.mime || '') || isImage;
          const confirmedMessage = {
            ...newMsg,
            type: confirmedIsImage ? 'image' : 'file',
            pending: false,
            failed: false,
            seq: newMsg.seq || result.ctrl?.params?.seq,
            voiceDuration: result.voiceDuration || newMsg.voiceDuration || 0,
            image: confirmedIsImage ? result.file.url : undefined,
            file: {
              ...newMsg.file,
              ext: confirmedIsImage ? 'image' : newMsg.file.ext,
              url: result.file.url,
              mime: result.file.mime,
              voiceDuration: result.voiceDuration || newMsg.voiceDuration || 0,
            },
          };
          setConversations(previous => {
            const currentRoom = previous[roomId];
            if (!currentRoom) return previous;
            return {
              ...previous,
              [roomId]: {
                ...currentRoom,
                messages: roomMessages(currentRoom).map(message => message.id === newMsg.id ? confirmedMessage : message),
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
                messages: roomMessages(currentRoom).map(message => message.id === newMsg.id
                  ? { ...message, pending: false, failed: true }
                  : message),
              },
            };
          });
        setChatError(err?.message || 'Không thể tải tệp lên Tinode.');
      });
    }
  };

  const startVoiceRecording = async () => {
    if (isRecordingVoice || mediaRecorderRef.current) return;
    setShowEmojiPicker(false);
    if (activeChat?.isChatbot) {
      setChatError('Trợ lý AI hiện chỉ nhận tin nhắn văn bản.');
      return;
    }
    if (realtimeMessagingPending) {
      setChatError('Kết nối realtime Tinode chưa sẵn sàng; dữ liệu Chatmgt vẫn đang hoạt động.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setChatError('Trình duyệt này chưa hỗ trợ ghi âm tin nhắn thoại.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeCandidates = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
      const mimeType = mimeCandidates.find(candidate => MediaRecorder.isTypeSupported?.(candidate)) || '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      voiceChunksRef.current = [];
      voiceRecordingDurationRef.current = 0;
      voiceDiscardRef.current = false;
      recorder.ondataavailable = event => {
        if (event.data?.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const recordingMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(voiceChunksRef.current, { type: recordingMime });
        const extension = recordingMime.includes('mp4') ? 'm4a' : recordingMime.includes('ogg') ? 'ogg' : 'webm';
        const duration = voiceRecordingDurationRef.current;
        const shouldSend = !voiceDiscardRef.current && blob.size > 0;
        voiceChunksRef.current = [];
        voiceRecordingDurationRef.current = 0;
        mediaRecorderRef.current = null;
        if (voiceTimerRef.current) window.clearInterval(voiceTimerRef.current);
        voiceTimerRef.current = null;
        setIsRecordingVoice(false);
        setVoiceRecordingSeconds(0);
        stream.getTracks().forEach(track => track.stop());
        if (!shouldSend) return;
        const voiceFile = new File([blob], `voice-${Date.now()}.${extension}`, { type: recordingMime, lastModified: Date.now() });
        handleSendFile(voiceFile, { voiceDuration: duration });
      };
      recorder.onerror = () => {
        setChatError('Không thể ghi âm tin nhắn thoại.');
        voiceDiscardRef.current = true;
      };
      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setVoiceRecordingSeconds(0);
      setIsRecordingVoice(true);
      voiceTimerRef.current = window.setInterval(() => {
        voiceRecordingDurationRef.current += 1;
        setVoiceRecordingSeconds(voiceRecordingDurationRef.current);
      }, 1000);
    } catch (error) {
      setChatError(error?.name === 'NotAllowedError'
        ? 'Bạn cần cho phép microphone để ghi tin nhắn thoại.'
        : 'Không thể mở microphone trên thiết bị này.');
    }
  };

  const stopVoiceRecording = (discard = false) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    voiceDiscardRef.current = discard;
    if (recorder.state !== 'inactive') recorder.stop();
  };

  const handleAttachmentChange = (event, source) => {
    const selection = splitAttachmentSelection(event.target.files, source);
    event.target.value = '';
    selection.accepted.forEach(file => {
      void handleSendFile(file);
    });
    if (selection.rejected.length > 0) {
      const rejectedCount = selection.rejected.length;
      const message = source === 'image'
        ? `${rejectedCount} mục không phải ảnh đã được bỏ qua.`
        : `${rejectedCount} ảnh đã được bỏ qua; hãy dùng nút gửi ảnh.`;
      setChatError(message);
    }
  };

  const handleFileChange = event => handleAttachmentChange(event, 'file');
  const handleImageChange = event => handleAttachmentChange(event, 'image');

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

  const openMediaBrowser = (tab = mediaBrowserTab) => {
    setMediaBrowserTab(tab);
    setMediaBrowserOpen(true);
  };

  const handleMediaEntryOpen = entry => {
    if (!entry) return;
    if (entry.kind === 'links') {
      window.open(entry.url, '_blank', 'noopener,noreferrer');
      return;
    }
    setMediaBrowserOpen(false);
    if (isImageAttachment(entry.attachment, entry.message?.type)) openImageViewer(entry.attachment);
    else handleFileOpen(entry.attachment);
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
        messages: roomMessages(previous[activeChat.id]).map(item => item.id === message.id
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

  const openConversationMenu = (event, room) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 252;
    const height = 410;
    setMessageMenu(null);
    setConversationCategoryMenuOpen(false);
    setConversationMenu({
      roomId: room.id,
      left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
      top: Math.max(12, Math.min(rect.bottom + 4, window.innerHeight - height - 12)),
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
        const reply = replyMetadataForMessage(message, isOwnMessage ? 'Bạn' : 'Thành viên');
        setReplyingTo(reply);
        let nextDraft = inputText;
        if (activeChat.isGroup && !isOwnMessage) {
          const candidate = mentionCandidateForMessage(message);
          const token = mentionTokenFor(candidate);
          if (candidate && token && !mentionTokenExists(inputText, token)) {
            nextDraft = inputText.trim()
              ? `${token} ${inputText.trim()}`
              : `${token} `;
            updateCurrentDraft(nextDraft);
            setMessageMentions(previous => {
              const currentMentions = previous[currentChatId] || [];
              if (currentMentions.some(item => item.token === token)) return previous;
              return {
                ...previous,
                [currentChatId]: [
                  ...currentMentions,
                  {
                    id: candidate.id,
                    tinodeUid: candidate.tinodeUid || candidate.uid || '',
                    name: mentionCandidateText(candidate),
                    token,
                    isAll: false,
                  },
                ],
              };
            });
          }
        }
        requestAnimationFrame(() => {
          const input = messageInputRef.current;
          if (!input) return;
          input.focus();
          input.setSelectionRange(nextDraft.length, nextDraft.length);
        });
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
      [target.id]: { ...previous[target.id], messages: [...roomMessages(previous[target.id]), shared], lastMsg: `Bạn: ${text}`, time: shared.time, updatedAt: shared.createdAt },
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
          messages: [...roomMessages(room), newMsg],
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
            messages: roomMessages(previous[room.id]).map(message => message.id === newMsg.id
              ? { ...message, pending: false, failed: false, seq: message.seq || result?.params?.seq }
              : message),
          },
        }));
      } catch (err) {
        setConversations(previous => ({
          ...previous,
          [room.id]: {
            ...previous[room.id],
            messages: roomMessages(previous[room.id]).map(message => message.id === newMsg.id
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
          history: roomMessages(room)
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
                messages: roomMessages(currentRoom).map(message => message.id === newMsg.id
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
                messages: roomMessages(currentRoom).map(message => message.id === newMsg.id
                  ? { ...message, pending: false, failed: true }
                  : message),
              },
            };
          });
          setChatError(err?.message || 'Không thể gửi tin nhắn.');
        });
    }
  };

  const renderComposerText = (text, mentions = []) => {
    if (!text) return null;
    const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mentionTokens = [...new Set((mentions || [])
      .map(mention => mention?.token)
      .filter(Boolean)
      .map(String))].sort((first, second) => second.length - first.length);
    const mentionPattern = mentionTokens.length > 0
      ? new RegExp(`(${mentionTokens.map(escapeRegExp).join('|')})`, 'gu')
      : null;
    return (mentionPattern ? String(text).split(mentionPattern) : [String(text)]).map((part, index) => (
      mentionTokens.includes(part)
        ? <span key={`composer-mention-${index}`} className="message-mention">{part}</span>
        : <React.Fragment key={`composer-text-${index}`}>{part}</React.Fragment>
    ));
  };

  // Keep mention styling tied to the metadata stamped by the sender.
  const renderMessageText = (text, mentions = []) => {
    if (!text) return '';
    const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mentionTokens = [...new Set((mentions || [])
      .map(mention => mention?.token)
      .filter(Boolean)
      .map(String))].sort((first, second) => second.length - first.length);
    const mentionPattern = mentionTokens.length > 0
      ? new RegExp(`(${mentionTokens.map(escapeRegExp).join('|')})`, 'gu')
      : null;

    const renderPlainText = (value, keyPrefix) => String(value).split(/(\*\*.*?\*\*)/g).flatMap((part, index) => {
      if (!part) return [];
      if (part.startsWith('**') && part.endsWith('**')) {
        return [<strong key={`${keyPrefix}-bold-${index}`}>{part.slice(2, -2)}</strong>];
      }
      return part.split('\n').map((line, lineIndex, lines) => (
        <React.Fragment key={`${keyPrefix}-line-${index}-${lineIndex}`}>
          {line}
          {lineIndex < lines.length - 1 && <br />}
        </React.Fragment>
      ));
    });

    return (mentionPattern ? String(text).split(mentionPattern) : [String(text)]).flatMap((part, index) => {
      if (!mentionTokens.includes(part)) return renderPlainText(part, `text-${index}`);
      const mention = (mentions || []).find(candidate => String(candidate?.token || '') === part);
      if (mention?.isAll) return [<span key={`mention-${index}`} className="message-mention">{part}</span>];
      return [
        <button
          type="button"
          key={`mention-${index}`}
          className="message-mention"
          onClick={() => openProfileFor(mention)}
          title={`${appCopy.t('Xem thông tin')} ${mention?.name || part}`}
        >
          {part}
        </button>,
      ];
    });
  };

  // Filter conversations
  const normalizedConversationSearch = String(searchQuery || '').trim().toLocaleLowerCase('vi');
  const filteredChatIds = Object.keys(renderConversations)
    .filter(id => !isSelfDirectConversation(renderConversations[id], currentUser, directoryAccounts))
    .filter(id => !isConversationHiddenAfterDelete(renderConversations[id]))
    .filter(id => shouldShowConversation(renderConversations[id], drafts[id]))
    .filter(id => conversationDisplayName(renderConversations[id], '').toLocaleLowerCase('vi').includes(normalizedConversationSearch))
    .sort((firstId, secondId) => {
      const firstPinned = Boolean(renderConversations[firstId].pinned);
      const secondPinned = Boolean(renderConversations[secondId].pinned);
      if (firstPinned !== secondPinned) return firstPinned ? -1 : 1;
      const firstTimestamp = conversationTimestamp(renderConversations[firstId]);
      const secondTimestamp = conversationTimestamp(renderConversations[secondId]);
      return secondTimestamp - firstTimestamp;
    });

  const companyContacts = companyDirectoryContacts(directoryAccounts, currentUser);
  const groupCandidates = companyContacts
    .filter(member => member.type !== 'bot')
    .filter(member => matchesCompanyDirectoryContact(member, groupMemberSearch));
  const activeGroupMemberIdentities = new Set([
    ...roomMembers(activeChat).flatMap(member => identityValues(member)),
    ...(activeChat.participantIds || []).map(identity => String(identity)),
  ].map(identity => identity.toLowerCase()));
  const groupMemberAddCandidates = activeChat.isGroup
    ? companyContacts
      .filter(member => member.type !== 'bot')
      .filter(member => !identityValues(member).some(identity => activeGroupMemberIdentities.has(identity.toLowerCase())))
      .filter(member => matchesCompanyDirectoryContact(member, groupMemberAddSearch))
    : [];

  const renderCreateGroupForm = variant => (
    <form className={variant === 'page' ? 'workspace-group-page' : 'group-modal create-group-modal'} onSubmit={handleCreateGroup}>
      {variant !== 'page' && (
        <div className="group-modal-header">
          <h2>{appCopy.t('Tạo nhóm trò chuyện')}</h2>
          <button type="button" className="btn-close-detail" onClick={closeCreateGroupModal} aria-label={appCopy.t('Đóng')} disabled={isCreatingGroup}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      <div className="group-avatar-field">
        <div className="group-avatar-preview">
          {groupAvatarPreview
            ? <img src={groupAvatarPreview} alt={appCopy.t('Xem trước ảnh nhóm')} />
            : <i className="fa-solid fa-users"></i>}
        </div>
        <div className="group-avatar-picker-copy">
          <strong>{appCopy.t('Ảnh đại diện nhóm')}</strong>
          <label className="btn-group-avatar-upload">
            <i className="fa-solid fa-camera"></i>
            <span>{appCopy.t(groupAvatarFile ? 'Đổi ảnh' : 'Tải ảnh lên')}</span>
            <input type="file" accept="image/*" onChange={handleGroupAvatarChange} disabled={isCreatingGroup} />
          </label>
        </div>
        {groupAvatarFile && (
          <button type="button" className="btn-remove-group-avatar" onClick={() => { setGroupAvatarFile(null); setGroupAvatarPreview(''); }} aria-label={appCopy.t('Xóa ảnh đã chọn')}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>

      <label className="group-form-field">
        <span>{appCopy.t('Tên nhóm')}</span>
        <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder={appCopy.t('Nhập tên nhóm')} required autoFocus />
      </label>

      <div className="group-form-field">
        <span>{appCopy.t('Thêm thành viên')}</span>
        <input
          value={groupMemberSearch}
          onChange={handleFilterGroupMembers}
          placeholder={appCopy.t('Lọc danh bạ theo tên, email hoặc username')}
          aria-label={appCopy.t('Lọc danh bạ công ty')}
        />
        {companyContacts.length > 0 && (
          <p className="group-form-hint">
            {groupMemberIds.length > 0
              ? `${appCopy.t('Đã chọn')} ${groupMemberIds.length} ${appCopy.t('thành viên từ danh bạ công ty.')}`
              : `${appCopy.t('Chọn trực tiếp từ')} ${companyContacts.length} ${appCopy.t('người trong danh bạ công ty.')}`}
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
            ? appCopy.t('Không tìm thấy thành viên phù hợp trong danh bạ công ty.')
            : appCopy.t('Danh bạ công ty hiện chưa có thành viên khác.')
        }</p>}
      </div>

      <div className="group-modal-footer actions-only">
        <div className="group-modal-actions">
          {variant !== 'page' && <button type="button" className="btn-secondary" onClick={closeCreateGroupModal} disabled={isCreatingGroup}>{appCopy.t('Hủy')}</button>}
          {variant === 'page' && <button type="button" className="btn-secondary" onClick={() => { closeCreateGroupModal(); closeWorkspacePanel(); }} disabled={isCreatingGroup}>{appCopy.t('Hủy')}</button>}
          <button type="submit" className="btn-primary" disabled={!groupName.trim() || isCreatingGroup}>{isCreatingGroup ? appCopy.t('Đang tạo...') : appCopy.t('Tạo nhóm')}</button>
        </div>
      </div>
    </form>
  );

  const sharedFiles = Object.values(renderConversations)
    .filter(room => canAccessRoomFiles(room, currentUser, directoryAccounts, chatMode))
    .flatMap(room => roomMessages(room)
    .filter(message => message.type === 'file' || message.type === 'image')
    .map(message => ({ ...message, roomName: room.name, roomId: room.id })));

  const activeMediaEntries = mediaEntriesForMessages(roomMessages(activeChat));
  const mediaSenderOptions = [...new Map(activeMediaEntries
    .map(entry => [entry.senderId || `name:${entry.senderName}`, entry.senderName])
    .filter(([id, name]) => Boolean(id && name))).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((first, second) => first.name.localeCompare(second.name, 'vi'));
  const mediaDateStart = (() => {
    if (mediaDateFilter === 'all') return 0;
    if (mediaDateFilter === 'custom') {
      return mediaFromDate ? new Date(`${mediaFromDate}T00:00:00`).getTime() : 0;
    }
    const days = mediaDateFilter === '7d' ? 7 : mediaDateFilter === '30d' ? 30 : 90;
    return Date.now() - days * 24 * 60 * 60 * 1000;
  })();
  const mediaDateEnd = mediaDateFilter === 'custom' && mediaToDate
    ? new Date(`${mediaToDate}T23:59:59.999`).getTime()
    : Number.POSITIVE_INFINITY;
  const normalizedMediaSearch = mediaSearchQuery.trim().toLowerCase();
  const filteredMediaEntries = activeMediaEntries.filter(entry => {
    if (entry.kind !== mediaBrowserTab) return false;
    if (mediaSenderFilter !== 'all' && entry.senderId !== mediaSenderFilter && `name:${entry.senderName}` !== mediaSenderFilter) return false;
    if (mediaDateFilter !== 'all' && (!entry.timestamp || entry.timestamp < mediaDateStart || entry.timestamp > mediaDateEnd)) return false;
    return !normalizedMediaSearch || entry.searchText.includes(normalizedMediaSearch);
  });
  const mediaGroups = filteredMediaEntries.reduce((groups, entry) => {
    const key = mediaDateKey(entry.timestamp);
    const current = groups.at(-1);
    if (!current || current.key !== key) groups.push({ key, label: formatMediaDateHeading(entry.timestamp, appCopy.locale), entries: [entry] });
    else current.entries.push(entry);
    return groups;
  }, []);
  const mediaCounts = activeMediaEntries.reduce((counts, entry) => ({ ...counts, [entry.kind]: counts[entry.kind] + 1 }), { images: 0, files: 0, links: 0 });

  const notifications = Object.values(renderConversations)
    .filter(room => !isSelfDirectConversation(room, currentUser, directoryAccounts))
    .filter(room => !isConversationHiddenAfterDelete(room))
    .filter(room => shouldShowConversation(room, drafts[room.id]))
    .filter(room => room.lastMsg || room.badge > 0)
    .sort((a, b) => conversationTimestamp(b) - conversationTimestamp(a))
    .slice(0, 20);

  const friendshipRecords = collectFriendshipRecords(renderConversations, managementViewerId);
  const companySearchResults = companyDirectoryContacts(workspaceResults, currentUser);
  const companyDirectoryTitle = appCopy.t(companyDirectoryHeading(currentUser));
  const friendNotifications = friendshipRecords.filter(record => (
    record.event.recipientId === managementViewerId
    || (record.event.requesterId === managementViewerId && Boolean(record.response))
  ));
  const visibleMessages = roomMessages(activeChat).filter(Boolean).filter(message => {
    if (messageActions[messageActionKey(activeChat.id, message.id)]?.hidden) return false;
    if (!messageSearchQuery.trim()) return true;
    return `${message.text || ''} ${message.senderName || ''}`.toLowerCase().includes(messageSearchQuery.toLowerCase());
  });
  const hasDatedMessages = visibleMessages.some(message => formatMessageDateLabel(message, displayClock, appCopy.locale));

  const deliveryStatusIcon = message => {
    if (message.failed || message.deliveryStatus === 'failed') {
      return <i className="fa-solid fa-circle-exclamation read-status failed" title={appCopy.t('Gửi thất bại')}></i>;
    }
    if (message.pending || message.deliveryStatus === 'sending') {
      return <i className="fa-solid fa-spinner fa-spin read-status pending" title={appCopy.t('Đang gửi')}></i>;
    }
    if (message.deliveryStatus === 'read') {
      return <i className="fa-solid fa-check-double read-status read" title={appCopy.t('Đã xem')}></i>;
    }
    if (message.deliveryStatus === 'received') {
      return <i className="fa-solid fa-check-double read-status received" title={appCopy.t('Đã nhận')}></i>;
    }
    return <i className="fa-solid fa-check read-status sent" title={appCopy.t('Đã gửi')}></i>;
  };
  const activeRemoteTyping = chatMode === 'tinode' && !activeChat.isChatbot
    ? typingByTopic[tinodeTopicName(activeChat)]
    : null;
  const showTinodeConnectionNotice = chatMode === 'tinode'
    && ['connecting', 'offline'].includes(connectionStatus)
    && !tinodeClient.authenticated;

  if (!isLoggedIn) {
    return <Login copy={appCopy} onLoginSuccess={handleLoginSuccess} initialNotice={appCopy.t(loginNotice)} />;
  }

  if (!pinLockReady) {
    return (
      <div className="pin-lock-screen">
        <section className="pin-lock-card" role="status" aria-live="polite">
          <div className="pin-lock-icon"><i className="fa-solid fa-shield-halved"></i></div>
          <h2>{appCopy.pinUnlockTitle}</h2>
          <p>{appCopy.pinChecking}</p>
        </section>
      </div>
    );
  }

  if (pinLockConfig && !isPinTabUnlocked) {
    return (
      <div className="pin-lock-screen">
        <form className="pin-lock-card" onSubmit={handlePinUnlockSubmit}>
          <div className="pin-lock-icon"><i className="fa-solid fa-lock"></i></div>
          <h2>{appCopy.pinUnlockTitle}</h2>
          <p>{appCopy.pinUnlockDescription}</p>
          <label className="pin-lock-field">
            <span>{appCopy.pinCode}</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={pinUnlockValue}
              onChange={event => setPinUnlockValue(event.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus
            />
          </label>
          {pinUnlockNotice && <div className="pin-lock-notice" role="alert"><i className="fa-solid fa-circle-info"></i>{pinUnlockNotice}</div>}
          <button type="submit" className="btn-primary pin-lock-submit" disabled={isVerifyingPin}>
            {isVerifyingPin ? appCopy.pinChecking : <><i className="fa-solid fa-lock-open"></i>{appCopy.pinUnlock}</>}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      className={`app-layout ${EXTERNAL_CHAT_ONLY ? 'external-chat-mode' : ''} ${isMobileChatActive ? 'mobile-active-chat' : ''} ${workspacePanel ? 'workspace-route-active' : ''}`}
      data-chat-release="conversation-sync-20260816"
      data-workspace-route={workspacePathForPanel(workspacePanel)}
    >
      {forcedLogoutSeconds !== null && (
        <div className="forced-logout-backdrop" role="presentation">
          <section className="forced-logout-modal" role="alertdialog" aria-modal="true" aria-labelledby="forced-logout-title">
            <div className="forced-logout-icon"><i className="fa-solid fa-user-lock"></i></div>
            <h2 id="forced-logout-title">{appCopy.t('Bạn bị buộc phải đăng xuất')}</h2>
            <p>{appCopy.t('Quản trị viên đã kết thúc phiên đăng nhập của bạn.')}</p>
            <p className="forced-logout-countdown">{appCopy.t('Hệ thống sẽ tự động đưa bạn về trang đăng nhập sau')} <strong>{forcedLogoutSeconds} {appCopy.t('giây')}</strong>.</p>
            <button type="button" className="btn-primary forced-logout-confirm" onClick={handleForcedLogout}>OK</button>
          </section>
        </div>
      )}
      {(chatError || showTinodeConnectionNotice) && (
        <div className={`chat-system-banner ${chatError ? 'error' : 'info'}`} role="status">
          <i className={`fa-solid ${chatError ? 'fa-triangle-exclamation' : 'fa-circle-info'}`}></i>
          <span>{chatError ? appCopy.t(chatError) : appCopy.t('Đang kết nối Tinode...')}</span>
          {chatError && <button type="button" onClick={() => setChatError('')} aria-label={appCopy.t('Đóng thông báo')}><i className="fa-solid fa-xmark"></i></button>}
        </div>
      )}
      {CALLS_ENABLED && activeCall && (
        <CallOverlay
          key={activeCall.id}
          call={activeCall}
          copy={appCopy}
          onClose={handleCallClosed}
          onError={handleCallError}
        />
      )}
      {imageViewer && (
        <ImageViewer
          source={imageViewer.source}
          copy={appCopy}
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
          aria-label={appCopy.t(isPrimarySidebarCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng')}
          aria-pressed={isPrimarySidebarCollapsed}
          title={appCopy.t(isPrimarySidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu')}
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
          <a href={workspacePathForPanel(null)} className={`nav-item ${!workspacePanel ? 'active' : ''}`} data-tooltip={appCopy.chat} onClick={(e) => { e.preventDefault(); closeWorkspacePanel(); }}>
            <i className="fa-solid fa-comment-dots"></i>
            <span>{appCopy.chat}</span>
          </a>
          <a href={workspacePathForPanel('groups')} className={`nav-item ${workspacePanel === 'groups' ? 'active' : ''}`} data-tooltip={appCopy.groups} onClick={(e) => { e.preventDefault(); openWorkspacePanel('groups'); }}>
            <i className="fa-solid fa-users"></i>
            <span>{appCopy.groups}</span>
          </a>
          <a href={workspacePathForPanel('enterprise')} className={`nav-item ${workspacePanel === 'enterprise' ? 'active' : ''}`} data-tooltip={appCopy.work} onClick={(e) => { e.preventDefault(); openWorkspacePanel('enterprise'); }}>
            <i className="fa-solid fa-briefcase"></i>
            <span>{appCopy.work}</span>
          </a>
          <a href={workspacePathForPanel('contacts')} className={`nav-item ${workspacePanel === 'contacts' ? 'active' : ''}`} data-tooltip={appCopy.contacts} onClick={(e) => { e.preventDefault(); openWorkspacePanel('contacts'); }}>
            <i className="fa-solid fa-address-book"></i>
            <span>{appCopy.contacts}</span>
          </a>
          <a href={workspacePathForPanel('settings')} className={`nav-item ${workspacePanel === 'settings' ? 'active' : ''}`} data-tooltip={appCopy.settings} onClick={(e) => { e.preventDefault(); openWorkspacePanel('settings'); }}>
            <i className="fa-solid fa-gear"></i>
            <span>{appCopy.settings}</span>
          </a>
        </nav>

        <div className="primary-footer">
          <div className="user-profile" data-tooltip={appCopy.t('Hồ sơ cá nhân')} role="button" tabIndex="0" onClick={() => openWorkspacePanel('profile')} onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') openWorkspacePanel('profile');
          }}>
            <SafeAvatar src={currentUser?.avatar} name={currentUser?.name} className="user-avatar-img" />
            <div className="user-info">
              <span className="user-name">{currentUser?.name || "Mai Thành Lâm"}</span>
              <span className={`user-status ${isCurrentUserOnline ? 'online' : 'offline'}`}>
                {appCopy.t(isCurrentUserOnline ? 'Đang hoạt động' : 'Ngoại tuyến')}
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
          <h2>{appCopy.t('Cuộc trò chuyện')}</h2>
            <button className="btn-action" title={appCopy.t('Tạo nhóm mới')} onClick={() => setIsCreateGroupOpen(true)}>
              <i className="fa-solid fa-plus"></i>
            </button>
          </div>
          <div className="search-box">
            <i className="fa-solid fa-magnifying-glass search-icon"></i>
            <input
              type="text"
              placeholder={appCopy.t('Tìm kiếm')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="conversations-list">
          {filteredChatIds.map(id => {
            const room = renderConversations[id];
            const roomName = conversationDisplayName(
              room.isGroup ? { ...room, members: [] } : room,
              room.isGroup ? appCopy.t('Nhóm') : appCopy.t('Cuộc trò chuyện cá nhân'),
            );
            const isActive = currentChatId === id;
            const draft = drafts[id] || '';
            const hasDraft = Boolean(draft.trim());
            const roomMuted = isConversationMuted(room.notificationMutedUntil, notificationClock);
            const roomCategory = conversationCategoryFor(room);
            return (
              <div
                key={id}
                className={`conversation-item ${isActive ? 'active' : ''} ${conversationMenu?.roomId === id ? 'menu-open' : ''}`}
                onClick={() => {
                  handleConversationSelect(id);
                }}
              >
                <div className={`conv-avatar ${room.avatarClass || ''}`}>
                  <ConversationAvatar room={room} />
                </div>
                <div className="conv-details">
                  <div className="conv-header">
                    <span className="conv-name">
                      {room.pinned && <i className="fa-solid fa-thumbtack conv-pinned-icon" title={appCopy.t('Đã ghim')} aria-label={appCopy.t('Đã ghim')}></i>}
                      {roomName}
                      {roomCategory && <span className={`conversation-category-tag category-${roomCategory.id}`} style={{ '--category-color': roomCategory.color }} title={`${appCopy.t('Phân loại')}: ${appCopy.t(roomCategory.label)}`}>{appCopy.t(roomCategory.label)}</span>}
                    </span>
                    <span
                      className={hasDraft ? 'conv-draft-status' : 'conv-time'}
                      title={hasDraft ? undefined : formatFullMessageDateTime(room, room.time, appCopy.locale)}
                    >
                      {hasDraft ? appCopy.t('Chưa gửi') : formatConversationListTime(room, displayClock, appCopy.locale)}
                    </span>
                  </div>
                  <div className="conv-message">
                    <span className={`conv-last-msg ${hasDraft ? 'draft' : ''}`}>{hasDraft ? draft : localizedConversationPreview(room, appCopy, directoryAccounts, viewerId)}</span>
                    {roomMuted && (
                      <i
                        className="fa-solid fa-bell-slash conv-muted-icon"
                        title={notificationMuteLabel(room.notificationMutedUntil, notificationClock, appCopy.locale)}
                        aria-label={appCopy.t('Đã tắt thông báo')}
                      ></i>
                    )}
                    {room.badge > 0 && <span className="conv-badge">{room.badge}</span>}
                  </div>
                </div>
                {!room.isChatbot && (
                  <div className="conv-actions">
                    <button
                      type="button"
                      className="conv-menu-button"
                      title={appCopy.t('Tùy chọn hội thoại')}
                      aria-label={`${appCopy.t('Tùy chọn hội thoại')} ${roomName}`}
                      aria-expanded={conversationMenu?.roomId === id}
                      onClick={event => openConversationMenu(event, room)}
                    >
                      <i className="fa-solid fa-ellipsis"></i>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {conversationMenu && renderConversations[conversationMenu.roomId] && (() => {
        const menuRoom = renderConversations[conversationMenu.roomId];
        const menuRoomMuted = isConversationMuted(menuRoom.notificationMutedUntil, notificationClock);
        const menuCategory = conversationCategoryFor(menuRoom);
        return (
          <div
            className="conversation-context-menu"
            style={{ left: conversationMenu.left, top: conversationMenu.top }}
            role="menu"
            onClick={event => event.stopPropagation()}
          >
            <button type="button" role="menuitem" onClick={() => handleConversationMenuAction('pin', menuRoom)}>
              <i className="fa-solid fa-thumbtack"></i>{appCopy.t(menuRoom.pinned ? 'Bỏ ghim hội thoại' : 'Ghim hội thoại')}
            </button>
            <button type="button" role="menuitem" onClick={() => handleConversationMenuAction('unread', menuRoom)}>
              <i className="fa-regular fa-envelope"></i>{appCopy.t('Đánh dấu chưa đọc')}
            </button>
            <button type="button" role="menuitem" onClick={() => handleConversationMenuAction('mute', menuRoom)}>
              <i className={`fa-regular ${menuRoomMuted ? 'fa-bell' : 'fa-bell-slash'}`}></i>{appCopy.t(menuRoomMuted ? 'Bật thông báo' : 'Tắt thông báo')}
            </button>
            <button type="button" role="menuitem" className="conversation-category-trigger" aria-expanded={conversationCategoryMenuOpen} onClick={() => setConversationCategoryMenuOpen(previous => !previous)}>
              <i className="fa-solid fa-tags"></i><span>{appCopy.t('Phân loại')}</span><i className="fa-solid fa-chevron-right submenu-arrow"></i>
            </button>
            {conversationCategoryMenuOpen && (
              <div className="conversation-category-submenu" role="menu" aria-label={`${appCopy.t('Phân loại')} ${appCopy.t('Cuộc trò chuyện').toLowerCase()}`}>
                {menuCategory && (
                  <button type="button" role="menuitem" className="conversation-category-option clear" onClick={() => handleConversationMenuAction('category', menuRoom, '')}>
                    <i className="fa-solid fa-xmark"></i><span>{appCopy.t('Bỏ phân loại')}</span>
                  </button>
                )}
                {CONVERSATION_CATEGORY_OPTIONS.map(category => (
                  <button type="button" role="menuitem" className={`conversation-category-option ${menuCategory?.id === category.id ? 'selected' : ''}`} key={category.id} onClick={() => handleConversationMenuAction('category', menuRoom, category.id)}>
                  <span className="conversation-category-dot" style={{ backgroundColor: category.color }}></span><span>{appCopy.t(category.label)}</span>{menuCategory?.id === category.id && <i className="fa-solid fa-check category-check"></i>}
                  </button>
                ))}
              </div>
            )}
            <button type="button" role="menuitem" className="danger" onClick={() => handleConversationMenuAction('delete', menuRoom)}>
              <i className="fa-regular fa-trash-can"></i>{appCopy.t('Xóa hội thoại')}
            </button>
          </div>
        );
      })()}

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
            <button className="btn-header-action" title={appCopy.t('Tìm kiếm')} onClick={() => openWorkspacePanel('search')}>
              <i className="fa-solid fa-magnifying-glass"></i>
            </button>
            {CALLS_ENABLED && (
              <>
                <button
                  type="button"
                  className="btn-header-action"
                  title={callActionCapability.available ? appCopy.t('Gọi thoại') : appCopy.t(callActionCapability.reason)}
                  onClick={() => handleStartCall(true)}
                  disabled={!callActionCapability.available}
                >
                  <i className="fa-solid fa-phone"></i>
                </button>
                <button
                  type="button"
                  className="btn-header-action"
                  title={callActionCapability.available ? appCopy.t('Gọi video') : appCopy.t(callActionCapability.reason)}
                  onClick={() => handleStartCall(false)}
                  disabled={!callActionCapability.available}
                >
                  <i className="fa-solid fa-video"></i>
                </button>
              </>
            )}
            <button className="btn-header-action" title={appCopy.t('Thông tin nhóm')} onClick={() => setIsDetailOpen(!isDetailOpen)}>
              <i className="fa-solid fa-ellipsis-vertical"></i>
            </button>
          </div>
        </div>

        {activeChat.isChatbot && (
          <div className="chatbot-context-strip" role="status">
            <span><i className="fa-solid fa-shield-halved"></i> {appCopy.t('AI riêng tư')}</span>
            <span><i className="fa-solid fa-book-open-reader"></i> {appCopy.t(chatbotStatus)}</span>
            <span><i className="fa-solid fa-link"></i> {appCopy.t('Trích dẫn nguồn')}</span>
          </div>
        )}

        {/* Khu vực hiển thị tin nhắn */}
        <div className={`chat-messages ${activeChat.isChatbot ? 'chatbot-messages' : ''}`}>
          {!hasDatedMessages && (
            <div className="date-divider"><span>{appCopy.t(currentChatId === 'dieu-hanh' ? 'Hôm nay' : 'Hội thoại trực tuyến')}</span></div>
          )}

          {visibleMessages.map((msg, messageIndex) => {
            const dateLabel = formatMessageDateLabel(msg, displayClock, appCopy.locale);
            const previousDateLabel = formatMessageDateLabel(visibleMessages[messageIndex - 1], displayClock, appCopy.locale);
            const showDateDivider = Boolean(dateLabel && dateLabel !== previousDateLabel);
            if (msg.type === 'system') {
              return (
                <React.Fragment key={msg.id}>
                  {showDateDivider && <div className="date-divider"><span>{dateLabel}</span></div>}
                  <div className="group-system-message">
                    <i className={`fa-solid ${msg.action === 'member_left' ? 'fa-arrow-right-from-bracket' : msg.action === 'member_removed' ? 'fa-user-minus' : msg.action === 'group_created' ? 'fa-people-group' : 'fa-user-plus'}`}></i>
                    <span>{localizedSystemText(msg, appCopy, directoryAccounts, viewerId)}</span>
                    <time>{formatMessageTime(msg, msg.time, appCopy.locale)}</time>
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
              name: appCopy.t('Hình ảnh'),
              mime: 'image/*',
              size: appCopy.t('Hình ảnh'),
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
            const isAudioMessage = isAudioAttachment(attachmentFile, msg.type) || Number(msg.voiceDuration) > 0;
            const attachmentStatus = msg.pending
              ? appCopy.t('Đang tải lên...')
              : attachmentFile?.url ? appCopy.t('Đã có trên Cloud') : appCopy.t('Có sẵn trên máy');
            return (
              <React.Fragment key={msg.id}>
                {showDateDivider && <div className="date-divider"><span>{dateLabel}</span></div>}
                <div className={`message-item ${isOutgoing ? 'outgoing' : 'incoming'} ${activeChat.isChatbot ? 'chatbot-message-item' : ''}`}>
                {!isOutgoing && (
                  <button type="button" className="message-avatar message-profile-trigger" onClick={() => openProfileFor(messageSenderProfile(msg))} title={`${appCopy.t('Xem thông tin')} ${msg.senderName || appCopy.t('thành viên')}`}>
                    <SafeAvatar src={msg.avatar || ''} name={msg.senderName} />
                  </button>
                )}

                <div className={`message-content-wrapper ${imagePreviewSource ? 'image-message-content' : ''}`}>
                  {!isOutgoing && msg.senderName && <button type="button" className="sender-name sender-profile-trigger" onClick={() => openProfileFor(messageSenderProfile(msg))}>{msg.senderName}</button>}

                  <div className="message-interactive" onContextMenu={event => openMessageMenu(event, msg)}>
                    <div className="message-bubble-group">
                    {msg.type === 'call' && msg.call && (
                      <div className="message-bubble call-history-bubble">
                        <span className="call-history-icon">
                          <i className={`fa-solid ${msg.call.audioOnly ? 'fa-phone' : 'fa-video'}`}></i>
                        </span>
                        <span className="call-history-copy">
                          <strong>{appCopy.t(msg.text)}</strong>
                          <span>{appCopy.t(msg.call.audioOnly ? 'Cuộc gọi thoại' : 'Cuộc gọi video')}</span>
                        </span>
                        <span className="message-time">
                          {formatMessageTime(msg, msg.time, appCopy.locale)} {isOutgoing && deliveryStatusIcon(msg)}
                        </span>
                        {CALLS_ENABLED && (
                          <button
                            type="button"
                            className="call-history-redial"
                            title={callActionCapability.available ? appCopy.t('Gọi lại') : appCopy.t(callActionCapability.reason)}
                            aria-label={appCopy.t(msg.call.audioOnly ? 'Gọi lại bằng cuộc gọi thoại' : 'Gọi lại bằng cuộc gọi video')}
                            onClick={() => handleStartCall(msg.call.audioOnly)}
                            disabled={!callActionCapability.available}
                          >
                            <i className={`fa-solid ${msg.call.audioOnly ? 'fa-phone' : 'fa-video'}`}></i>
                            {appCopy.t('Gọi lại')}
                          </button>
                        )}
                      </div>
                    )}
                    {/* Tin nhắn chữ thường */}
                    {msg.type === "text" && msg.text && (
                      <div className={`message-bubble ${activeChat.isChatbot && !isOutgoing ? 'chatbot-answer-bubble' : ''}`}>
                        <MessageReplyPreview reply={msg.replyTo} copy={appCopy} />
                        {activeChat.isChatbot && !isOutgoing && (
                          <div className="chatbot-answer-label">
                            <span><i className="fa-solid fa-sparkles"></i>{msg.grounded ? appCopy.t('Tóm tắt từ tài liệu') : msg.isWelcome ? 'ViChat AI' : appCopy.t('Phản hồi AI')}</span>
                            {msg.grounded && <small>{appCopy.t('Đã đối chiếu nguồn')}</small>}
                          </div>
                        )}
                        <p>{renderMessageText(msg.isWelcome ? appCopy.t(msg.text) : msg.text, msg.mentions)}</p>
                        {Object.entries(reactions).filter(([, count]) => count > 0).length > 0 && (
                          <div className="message-reactions">
                            {Object.entries(reactions).filter(([, count]) => count > 0).map(([emoji, count]) => <span key={emoji}>{emoji} {count}</span>)}
                          </div>
                        )}
                        {Array.isArray(msg.sources) && msg.sources.length > 0 && (
                          <div className="chatbot-sources">
                            <strong><i className="fa-solid fa-book-bookmark"></i>{appCopy.t('Nguồn tham khảo')}</strong>
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
                          {messageState.marked && <i className="fa-solid fa-star message-marked" title={appCopy.t('Đã đánh dấu')}></i>} {formatMessageTime(msg, msg.time, appCopy.locale)} {isOutgoing && deliveryStatusIcon(msg)}
                        </span>
                      </div>
                    )}

                    {/* Tin nhắn file đính kèm */}
                    {/* Image attachments are visual-only; do not render their filename. */}
                    {isAudioMessage ? (
                      <div className="attachment-message-stack">
                        <MessageReplyPreview reply={msg.replyTo} copy={appCopy} />
                        <AudioMessagePlayer
                          file={attachmentFile}
                          duration={msg.voiceDuration || attachmentFile?.voiceDuration}
                          time={formatMessageTime(msg, msg.time, appCopy.locale)}
                          delivery={isOutgoing && deliveryStatusIcon(msg)}
                          pending={msg.pending}
                          failed={msg.failed}
                          copy={appCopy}
                        />
                      </div>
                    ) : imagePreviewSource ? (
                      <div className="attachment-message-stack">
                        <MessageReplyPreview reply={msg.replyTo} copy={appCopy} />
                        <div className={`message-bubble image-bubble ${msg.pending ? 'pending' : ''} ${msg.failed ? 'failed' : ''}`}>
                        <button
                          type="button"
                          className="image-preview-button"
                          title={appCopy.t('Bấm để xem ảnh')}
                          onClick={() => openImageViewer(imagePreviewFile)}
                        >
                          <TinodeImagePreview
                            source={imagePreviewSource}
                              alt={appCopy.t('Ảnh đính kèm')}
                            copy={appCopy}
                          />
                          <span className="image-view-hint"><i className="fa-solid fa-expand"></i>{appCopy.t('Xem ảnh')}</span>
                        </button>
                        <div className="image-bubble-footer">
                          <span className="message-time">{formatMessageTime(msg, msg.time, appCopy.locale)} {isOutgoing && deliveryStatusIcon(msg)}</span>
                        </div>
                        </div>
                      </div>
                    ) : attachmentFile && (
                      <div className="attachment-message-stack">
                        <MessageReplyPreview reply={msg.replyTo} copy={appCopy} />
                        <div className={`message-bubble file-bubble ${msg.type} ${attachmentTone} ${attachmentFile.ext || ''} ${msg.pending ? 'pending' : ''} ${msg.failed ? 'failed' : ''}`}>
                        <button
                          type="button"
                          className="file-card-main"
                          title={attachmentFile.url ? appCopy.t('Tải file') : undefined}
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
                            <button type="button" className="file-action" title={appCopy.t('Mở file')} aria-label={appCopy.t('Mở file')} disabled={!attachmentFile.url} onClick={() => handleFileOpen(attachmentFile)}><i className="fa-regular fa-folder-open"></i></button>
                            <button type="button" className="file-action" title={appCopy.t('Tải xuống')} aria-label={appCopy.t('Tải xuống')} disabled={!attachmentFile.url} onClick={() => handleFileDownload(attachmentFile)}><i className="fa-solid fa-download"></i></button>
                          </span>
                          <span className="message-time">
                            {formatMessageTime(msg, msg.time, appCopy.locale)} {isOutgoing && deliveryStatusIcon(msg)}
                          </span>
                        </span>
                        </div>
                      </div>
                    )}
                    </div>
                    <button type="button" className="message-more-action" onClick={event => { event.stopPropagation(); openMessageMenu(event, msg); }} aria-label={appCopy.t('Tùy chọn tin nhắn')}><i className="fa-solid fa-ellipsis"></i></button>
                  </div>
                </div>
                </div>
              </React.Fragment>
            );
          })}

          {activeChat.isChatbot && visibleMessages.length <= 1 && (
            <section className="chatbot-starter" aria-label={appCopy.t('Gợi ý câu hỏi cho ViChat AI')}>
              <div className="chatbot-starter-heading">
                <span className="chatbot-starter-eyebrow">{appCopy.t('Bắt đầu nhanh')}</span>
                <h3>{appCopy.t('Bạn muốn tìm gì trong tri thức doanh nghiệp?')}</h3>
                <p>{appCopy.t('ViChat AI chỉ dùng nội dung được tìm thấy và luôn cho bạn biết nguồn tham khảo.')}</p>
              </div>
              <div className="chatbot-starter-grid">
                {CHATBOT_STARTER_PROMPTS.map(item => (
                  <button type="button" key={item.title} onClick={() => handleSendMessage(appCopy.t(item.prompt))} disabled={isTyping || realtimeMessagingPending}>
                    <span className="chatbot-starter-icon"><i className={`fa-solid ${item.icon}`}></i></span>
                    <span><strong>{appCopy.t(item.title)}</strong><small>{appCopy.t(item.prompt)}</small></span>
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
                {!menuMessage.recalled && <button type="button" onClick={() => handleMessageAction('reply', menuMessage)}><i className="fa-solid fa-reply"></i>{appCopy.t('Trả lời tin nhắn')}</button>}
                <button type="button" onClick={() => handleMessageAction('copy', menuMessage)}><i className="fa-regular fa-copy"></i>{appCopy.t('Copy tin nhắn')}</button>
                <button type="button" onClick={() => handleMessageAction('mark', menuMessage)}><i className={`fa-${marked ? 'solid' : 'regular'} fa-star`}></i>{appCopy.t(marked ? 'Bỏ đánh dấu' : 'Đánh dấu tin nhắn')}</button>
                {!activeChat.isChatbot && isManagementConversationId(activeChat.managementId || activeChat.id) && <button type="button" onClick={() => handleMessageAction('create-task', menuMessage)}><i className="fa-solid fa-list-check"></i>{appCopy.t('Giao việc từ tin nhắn')}</button>}
                <button type="button" onClick={() => handleMessageAction('detail', menuMessage)}><i className="fa-solid fa-circle-info"></i>{appCopy.t('Xem chi tiết')}</button>
                <button type="button" onClick={() => handleMessageAction('share', menuMessage)}><i className="fa-solid fa-share"></i>{appCopy.t('Chia sẻ tin nhắn')}</button>
                <div className="message-reaction-row" aria-label={appCopy.t('Thêm biểu cảm')}>
                  {['👍', '❤️', '😂', '😮', '😢'].map(emoji => <button type="button" key={emoji} onClick={() => handleMessageAction('reaction', menuMessage, emoji)}>{emoji}</button>)}
                </div>
                 {canRecallMessage && <>
                   <button type="button" className="danger" onClick={() => handleMessageAction('recall-self', menuMessage)}><i className="fa-solid fa-eye-slash"></i>{appCopy.t('Thu hồi phía tôi')}</button>
                   <button type="button" className="danger" onClick={() => handleMessageAction('recall-all', menuMessage)}><i className="fa-solid fa-rotate-left"></i>{appCopy.t('Thu hồi tất cả')}</button>
                 </>}
              </div>
            );
          })()}

          {activeRemoteTyping && (
            <div className="message-item incoming remote-typing-indicator">
              <div className="message-avatar"><SafeAvatar src={activeChat.members?.find(member => identitiesOverlap(member, { id: activeRemoteTyping.uid }))?.avatar || ''} name={activeRemoteTyping.name} /></div>
              <div className="message-content-wrapper">
                <span className="sender-name">{activeRemoteTyping.name}</span>
                <div className="message-bubble chatbot-typing-bubble" aria-label={`${activeRemoteTyping.name} ${appCopy.t('đang nhập')}`}>
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
                <div className="message-bubble chatbot-typing-bubble" aria-label={appCopy.t('Trợ lý đang trả lời')}>
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
            <span>{appCopy.t('Dữ liệu Chatmgt vẫn sẵn sàng, nhưng kết nối realtime Tinode đang tạm gián đoạn.')}</span>
          </div>
        )}
        <div className="chat-main-input">
          {replyingTo && (
            <div className="replying-banner">
              <div className="replying-banner-copy">
                <strong>{appCopy.t('Đang trả lời')} {replyingTo.senderName}</strong>
                <MessageReplyPreview reply={replyingTo} copy={appCopy} />
              </div>
              <button type="button" onClick={() => setReplyingTo(null)} aria-label={appCopy.t('Hủy trả lời')}><i className="fa-solid fa-xmark"></i></button>
            </div>
          )}
          <div className="input-actions-left">
            <button className="btn-input-action image-input-action" title={appCopy.t(activeChat.isChatbot ? 'ViChat AI hiện nhận câu hỏi văn bản' : realtimeMessagingPending ? 'Kết nối realtime Tinode chưa sẵn sàng' : 'Gửi nhiều ảnh')} aria-label={appCopy.t('Gửi nhiều ảnh')} onClick={handleImageAttachClick} disabled={realtimeMessagingPending || activeChat.isChatbot || isRecordingVoice}>
              <i className="fa-regular fa-image"></i>
            </button>
            <input
              type="file"
              ref={imageInputRef}
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={handleImageChange}
            />
            <button className="btn-input-action file-input-action" title={appCopy.t(activeChat.isChatbot ? 'ViChat AI hiện nhận câu hỏi văn bản' : realtimeMessagingPending ? 'Kết nối realtime Tinode chưa sẵn sàng' : 'Gửi nhiều file')} aria-label={appCopy.t('Gửi nhiều file')} onClick={handleAttachClick} disabled={realtimeMessagingPending || activeChat.isChatbot || isRecordingVoice}>
              <i className="fa-solid fa-paperclip"></i>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              multiple
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <button type="button" className="btn-input-action" title={appCopy.t('Biểu cảm')} aria-label={appCopy.t('Mở biểu cảm')} aria-expanded={showEmojiPicker} onClick={() => setShowEmojiPicker(prev => !prev)} disabled={realtimeMessagingPending || activeChat.isChatbot || isRecordingVoice}>
              <i className="fa-regular fa-smile"></i>
            </button>
            {showEmojiPicker && (
              <div className="emoji-picker" role="listbox" aria-label={appCopy.t('Chọn biểu cảm')}>
                {['😀', '😂', '😍', '👍', '👏', '🎉', '🙏', '🔥', '✅', '❤️'].map(emoji => <button type="button" role="option" key={emoji} aria-label={emoji} onMouseDown={event => event.preventDefault()} onClick={() => insertEmoji(emoji)}>{emoji}</button>)}
              </div>
            )}
            <button
              type="button"
              className={`btn-input-action voice-input-action ${isRecordingVoice ? 'recording' : ''}`}
              title={appCopy.t(isRecordingVoice ? 'Dừng và gửi tin nhắn thoại' : 'Ghi tin nhắn thoại')}
              aria-label={appCopy.t(isRecordingVoice ? 'Dừng và gửi tin nhắn thoại' : 'Ghi tin nhắn thoại')}
              onClick={() => (isRecordingVoice ? stopVoiceRecording(false) : startVoiceRecording())}
              disabled={realtimeMessagingPending || activeChat.isChatbot}
            >
              <i className={`fa-solid ${isRecordingVoice ? 'fa-stop' : 'fa-microphone'}`}></i>
            </button>
          </div>
          <div className={`input-text-container ${isRecordingVoice ? 'voice-recording-container' : ''}`}>
            {isRecordingVoice ? (
              <div className="voice-recording-bar" role="status">
                <span className="voice-recording-pulse"><i className="fa-solid fa-microphone"></i></span>
                <span className="voice-recording-copy"><strong>{appCopy.t('Đang ghi âm')}</strong><small>{formatAudioDuration(voiceRecordingSeconds)}</small></span>
                <span className="voice-recording-hint">{appCopy.t('Bấm nút đỏ để gửi')}</span>
                <button type="button" className="voice-recording-cancel" onClick={() => stopVoiceRecording(true)}>{appCopy.t('Hủy')}</button>
              </div>
            ) : (
              <>
                {mentionContext && activeChat.isGroup && (
              <div
                ref={mentionPickerRef}
                id="message-mention-picker"
                className="mention-picker"
                role="listbox"
                aria-label={appCopy.t('Chọn thành viên để nhắc đến')}
              >
                {mentionOptions.length > 0 ? mentionOptions.map((candidate, index) => {
                  const candidateKey = candidate.id || candidate.tinodeUid || candidate.username || candidate.name;
                  const candidateName = candidate.isAll ? appCopy.t('Báo cho cả nhóm') : mentionCandidateText(candidate);
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
                  <div className="mention-empty">{appCopy.t('Không tìm thấy thành viên phù hợp')}</div>
                )}
              </div>
                )}
                {inputText && (messageMentions[currentChatId] || []).length > 0 && (
                  <div className="input-text-preview" aria-hidden="true">{renderComposerText(inputText, messageMentions[currentChatId] || [])}</div>
                )}
                <input
                  className={(messageMentions[currentChatId] || []).length > 0 ? 'has-styled-mentions' : ''}
              type="text"
              ref={messageInputRef}
              role="combobox"
              aria-autocomplete="list"
              aria-controls={mentionContext && activeChat.isGroup ? 'message-mention-picker' : undefined}
              aria-expanded={Boolean(mentionContext && activeChat.isGroup)}
              aria-activedescendant={mentionOptions.length > 0 ? `message-mention-option-${mentionActiveIndex}` : undefined}
              placeholder={appCopy.t(realtimeMessagingPending ? 'Kết nối realtime Tinode chưa sẵn sàng' : activeChat.isChatbot ? 'Hỏi ViChat AI về quy trình, chính sách, tài liệu...' : 'Nhập tin nhắn...')}
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
              </>
            )}
          </div>
          <button className="btn-send-message-sh" disabled={realtimeMessagingPending || isRecordingVoice || (activeChat.isChatbot && isTyping)} onClick={() => handleSendMessage()}>{appCopy.t(activeChat.isChatbot && isTyping ? 'Đang tìm...' : activeChat.isChatbot ? 'Hỏi AI' : 'Gửi')}</button>
        </div>
        {activeChat.isChatbot && <p className="chatbot-composer-note"><i className="fa-solid fa-circle-info"></i> {appCopy.t('ViChat AI có thể chưa bao quát mọi tài liệu. Hãy kiểm tra nguồn trước khi ra quyết định.')}</p>}
        {messageDetails && (
          <div className="message-details-modal" role="dialog">
            <div className="message-details-card">
              <div className="message-details-header"><strong>{appCopy.t('Chi tiết tin nhắn')}</strong><button type="button" onClick={() => setMessageDetails(null)} aria-label={appCopy.t('Đóng')}><i className="fa-solid fa-xmark"></i></button></div>
              <p><strong>{appCopy.t('Người gửi')}:</strong> {messageDetails.senderName || (messageDetails.sender === 'outgoing' ? appCopy.t('Bạn') : appCopy.t('Thành viên'))}</p>
              <p><strong>{appCopy.t('Thời gian')}:</strong> {messageDetails.createdAt ? new Date(messageDetails.createdAt).toLocaleString(appCopy.locale) : messageDetails.time}</p>
              <p><strong>{appCopy.t('Nội dung')}:</strong> {messageDetails.text || messageDetails.file?.name || appCopy.t('Tệp đính kèm')}</p>
            </div>
          </div>
        )}
        {profileContact && (
          <div className="profile-contact-modal" role="presentation" onMouseDown={event => {
            if (event.target === event.currentTarget) setProfileContact(null);
          }}>
            <section className="profile-contact-card" role="dialog" aria-modal="true" aria-labelledby="profile-contact-title">
              <div className="message-details-header">
                <strong>{appCopy.t('Thông tin cá nhân')}</strong>
                <button type="button" onClick={() => setProfileContact(null)} aria-label={appCopy.t('Đóng thông tin cá nhân')}><i className="fa-solid fa-xmark"></i></button>
              </div>
              <div className="profile-contact-hero">
                <SafeAvatar src={profileContact.avatar} name={profileContact.name} className="profile-contact-avatar" />
                <h2 id="profile-contact-title">{profileContact.name}</h2>
                <span className={`profile-contact-status ${profileContact.online ? '' : 'offline'}`}><i className="fa-solid fa-circle"></i>{appCopy.t(profileContact.online ? 'Đang hoạt động' : 'Ngoại tuyến')}</span>
              </div>
              <div className="profile-contact-details">
                {profileContact.username && <div className="profile-contact-row"><i className="fa-solid fa-at"></i><span><small>{appCopy.t('Tài khoản')}</small><strong>@{profileContact.username.replace(/^@+/, '').split('@')[0]}</strong></span></div>}
                {profileContact.title && <div className="profile-contact-row"><i className="fa-solid fa-briefcase"></i><span><small>{appCopy.t('Chức vụ')}</small><strong>{profileContact.title}</strong></span></div>}
                {profileContact.department && <div className="profile-contact-row"><i className="fa-solid fa-building"></i><span><small>{appCopy.t('Phòng ban')}</small><strong>{profileContact.department}</strong></span></div>}
                {profileContact.email && <div className="profile-contact-row"><i className="fa-regular fa-envelope"></i><span><small>Email</small><strong>{profileContact.email}</strong></span></div>}
                {profileContact.role && <div className="profile-contact-row"><i className="fa-solid fa-shield-halved"></i><span><small>{appCopy.t('Vai trò')}</small><strong>{profileContact.role}</strong></span></div>}
              </div>
              {!profileContact.isCurrentAccount && profileContact.id && (
                <button type="button" className="btn-primary profile-contact-chat-button" onClick={() => {
                  const contact = findAccount(directoryAccounts, profileContact.id) || profileContact;
                  setProfileContact(null);
                  void handleStartDirectChat(contact);
                }}>
                  <i className="fa-solid fa-comment-dots"></i>{appCopy.t('Nhắn tin')}
                </button>
              )}
            </section>
          </div>
        )}
        {shareMessage && (
          <div className="message-details-modal" role="dialog" onClick={() => setShareMessage(null)}>
            <div className="message-share-card" onClick={event => event.stopPropagation()}>
              <div className="message-details-header"><strong>{appCopy.t('Chia sẻ tin nhắn tới')}</strong><button type="button" onClick={() => setShareMessage(null)} aria-label={appCopy.t('Đóng')}><i className="fa-solid fa-xmark"></i></button></div>
              <div className="share-conversation-list">
                {Object.values(renderConversations).filter(room => room.id !== activeChat.id && !room.isChatbot).map(room => (
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
          <h3>{appCopy.t(activeChat.isGroup ? 'Thông tin nhóm' : 'Thông tin cá nhân')}</h3>
          <button className="btn-close-detail" title={appCopy.t('Đóng')} onClick={() => setIsDetailOpen(false)}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="detail-content">
          <div className="group-identity">
            <div className="group-avatar-editor">
              <div className={`group-avatar-large ${activeChat.avatarClass || ''}`}>
                <ConversationAvatar room={activeChat} />
              </div>
              {activeChat.isGroup && activeChat.id !== 'empty' && (
                <label
                  className={`group-avatar-edit-button ${isUpdatingGroupAvatar ? 'loading' : ''}`}
                  title={appCopy.t(isUpdatingGroupAvatar ? 'Đang cập nhật ảnh nhóm...' : 'Đổi ảnh nhóm')}
                  aria-label={appCopy.t('Đổi ảnh nhóm')}
                >
                  <i className={`fa-solid ${isUpdatingGroupAvatar ? 'fa-spinner fa-spin' : 'fa-camera'}`}></i>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleActiveGroupAvatarChange}
                    disabled={isUpdatingGroupAvatar || (usesManagementData && chatMode !== 'tinode')}
                  />
                </label>
              )}
            </div>
            <h3 className="group-name-large">{activeChat.name}</h3>
            <span className="group-members-count">{activeChatPresenceLabel}</span>
          </div>

          {activeChat.isGroup && (
            <div className="detail-section">
              <h4 className="section-title">{appCopy.t('Quản trị viên')}</h4>
              <span className="admin-name">{activeAdminName}</span>
            </div>
          )}

          <div className="detail-section members-section">
            <div className="members-section-heading">
              <h4 className="section-title">{activeChat.isGroup ? `${appCopy.t('Thành viên')} (${activeChat.members.length})` : appCopy.t('Thông tin cá nhân')}</h4>
              {activeChat.isGroup && canManageGroupMembers(activeChat, directoryAccounts, currentUser) && (
                <button
                  type="button"
                  className="btn-add-member"
                  onClick={() => {
                    setIsGroupMemberPickerOpen(previous => !previous);
                    setGroupMemberAddIds([]);
                    setGroupMemberAddProfiles({});
                    setGroupMemberAddSearch('');
                  }}
                  aria-expanded={isGroupMemberPickerOpen}
                >
                  <i className="fa-solid fa-user-plus"></i>{appCopy.t('Thêm thành viên')}
                </button>
              )}
            </div>
            {activeChat.isGroup && isGroupMemberPickerOpen && (
              <div className="group-member-add-panel">
                <div className="group-member-add-toolbar">
                  <input
                    value={groupMemberAddSearch}
                    onChange={handleFilterGroupMembersToAdd}
                    placeholder={appCopy.t('Tìm thành viên trong danh bạ')}
                    aria-label={appCopy.t('Tìm thành viên trong danh bạ')}
                    autoFocus
                  />
                  <span>{groupMemberAddIds.length} {appCopy.t('đã chọn')}</span>
                </div>
                {groupMemberAddCandidates.length > 0 ? (
                  <div className="group-member-picker group-member-add-picker">
                    {groupMemberAddCandidates.map(member => {
                      const memberId = member.id || member.uid || member.tinodeUid || member.name;
                      const selected = groupMemberAddIds.includes(memberId);
                      return (
                        <button
                          type="button"
                          key={memberId}
                          className={`group-member-option ${selected ? 'selected' : ''}`}
                          onClick={() => toggleGroupMemberToAdd(member)}
                          aria-pressed={selected}
                        >
                          <SafeAvatar src={member.avatar || ''} name={member.name} className="mention-avatar" />
                          <span className="picker-name">{member.name}</span>
                          <span className="picker-status">{directoryUsernameMeta(member)}</span>
                          <span className="picker-check"><i className={`fa-solid ${selected ? 'fa-check' : 'fa-plus'}`}></i></span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="group-form-hint">{groupMemberAddSearch.trim() ? appCopy.t('Không tìm thấy thành viên phù hợp trong danh bạ công ty.') : appCopy.t('Không còn thành viên mới trong danh bạ.')}</p>
                )}
                <div className="group-member-add-actions">
                  <button type="button" className="btn-secondary" onClick={() => setIsGroupMemberPickerOpen(false)} disabled={isAddingGroupMembers}>{appCopy.t('Hủy')}</button>
                  <button type="button" className="btn-primary" onClick={handleAddGroupMembers} disabled={isAddingGroupMembers || groupMemberAddIds.length === 0}>
                    <i className={`fa-solid ${isAddingGroupMembers ? 'fa-spinner fa-spin' : 'fa-user-plus'}`}></i>
                    {isAddingGroupMembers ? appCopy.t('Đang thêm thành viên...') : appCopy.t('Thêm vào nhóm')}
                  </button>
                </div>
              </div>
            )}
            <div className="members-list">
              {roomMembers(activeChat).map((member, idx) => (
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
                      title={`${appCopy.t('Xóa')} ${member.name} ${appCopy.t('khỏi nhóm')}`}
                      aria-label={`${appCopy.t('Xóa')} ${member.name} ${appCopy.t('khỏi nhóm')}`}
                    >
                      <i className={`fa-solid ${removingMemberId === member.id ? 'fa-spinner fa-spin' : 'fa-user-minus'}`}></i>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {!activeChat.isChatbot && activeChat.id !== 'empty' && (
            <section className="detail-section shared-media-section">
              <div className="shared-media-heading">
                <h4 className="section-title">{appCopy.t('Ảnh, file và liên kết')}</h4>
                <button type="button" className="detail-link-button" onClick={() => openMediaBrowser(mediaBrowserTab)}>{appCopy.t('Xem tất cả')}</button>
              </div>
              <div className="detail-media-tabs" role="tablist" aria-label={appCopy.t('Nội dung dùng chung')}>
                {MEDIA_BROWSER_TABS.map(tab => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mediaBrowserTab === tab.id}
                    className={`detail-media-tab ${mediaBrowserTab === tab.id ? 'selected' : ''}`}
                    key={tab.id}
                    onClick={() => setMediaBrowserTab(tab.id)}
                  >
                    <i className={`fa-solid ${tab.icon}`}></i><span>{appCopy.t(tab.label)}</span><strong>{mediaCounts[tab.id]}</strong>
                  </button>
                ))}
              </div>
              {mediaCounts[mediaBrowserTab] === 0 ? (
                <div className="detail-media-empty">{appCopy.t('Chưa có nội dung trong mục này.')}</div>
              ) : (
                <div className="detail-media-preview-grid">
                  {activeMediaEntries.filter(entry => entry.kind === mediaBrowserTab).slice(0, 4).map(entry => (
                    <button type="button" className={`detail-media-preview ${entry.kind}`} key={entry.id} onClick={() => handleMediaEntryOpen(entry)} title={entry.attachment?.name || entry.url}>
                      {entry.kind === 'images' && isImageAttachment(entry.attachment, entry.message?.type) && entry.attachment?.url ? (
                        <TinodeImagePreview source={entry.attachment.url} alt={entry.attachment.name || appCopy.t('Ảnh')} copy={appCopy} className="detail-media-thumbnail" />
                      ) : (
                        <span className="detail-media-icon"><i className={`fa-solid ${entry.kind === 'links' ? 'fa-link' : attachmentIconClass(entry.attachment, entry.message?.type)}`}></i></span>
                      )}
                      <span className="detail-media-preview-label">{entry.kind === 'links' ? entry.url : entry.attachment?.name || (entry.kind === 'images' ? appCopy.t('Ảnh/Video') : appCopy.t('Tệp'))}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="detail-actions">
            {!activeChat.isChatbot && activeChat.id !== 'empty' && (
              <div className="action-row">
                <div className="action-label">
                  <i className={`fa-regular ${activeChatMuted ? 'fa-bell-slash' : 'fa-bell'}`}></i>
                  <span className="action-label-copy">
                    <strong>{appCopy.t('Tắt thông báo')}</strong>
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
                <span>{appCopy.t('Rời khỏi nhóm')}</span>
              </button>
            )}
            {!activeChat.isChatbot && activeChat.id !== 'empty' && (
              <button className="btn-delete-conversation" onClick={handleDeleteConversation} disabled={isDeletingConversation}>
                <i className={`fa-solid ${isDeletingConversation ? 'fa-spinner fa-spin' : 'fa-trash-can'}`}></i>
                <span>{isDeletingConversation ? appCopy.t('Đang xóa...') : appCopy.t('Xóa cuộc trò chuyện')}</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {mediaBrowserOpen && (
        <div className="media-browser-overlay" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) setMediaBrowserOpen(false);
        }}>
          <section className="media-browser-panel" role="dialog" aria-modal="true" aria-labelledby="media-browser-title">
            <div className="media-browser-header">
              <div>
                <span className="media-browser-eyebrow">{appCopy.t('Nội dung dùng chung')}</span>
                <h2 id="media-browser-title">{activeChat.name}</h2>
              </div>
              <button type="button" className="btn-close-detail" onClick={() => setMediaBrowserOpen(false)} aria-label={appCopy.t('Đóng')}><i className="fa-solid fa-xmark"></i></button>
            </div>

            <div className="media-browser-tabs" role="tablist" aria-label={appCopy.t('Loại nội dung')}>
              {MEDIA_BROWSER_TABS.map(tab => (
                <button type="button" role="tab" aria-selected={mediaBrowserTab === tab.id} className={mediaBrowserTab === tab.id ? 'selected' : ''} key={tab.id} onClick={() => setMediaBrowserTab(tab.id)}>
                  <i className={`fa-solid ${tab.icon}`}></i><span>{appCopy.t(tab.label)}</span><strong>{mediaCounts[tab.id]}</strong>
                </button>
              ))}
            </div>

            <div className="media-filter-grid">
              <label className="media-filter-search">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input value={mediaSearchQuery} onChange={event => setMediaSearchQuery(event.target.value)} placeholder={appCopy.t('Tìm theo tên, nội dung hoặc liên kết...')} />
              </label>
              <label className="media-filter-field">
                <span>{appCopy.t('Người gửi')}</span>
                <select value={mediaSenderFilter} onChange={event => setMediaSenderFilter(event.target.value)}>
                  <option value="all">{appCopy.t('Tất cả người gửi')}</option>
                  {mediaSenderOptions.map(option => <option value={option.id} key={option.id}>{option.name}</option>)}
                </select>
              </label>
              <label className="media-filter-field">
                <span>{appCopy.t('Thời gian')}</span>
                <select value={mediaDateFilter} onChange={event => setMediaDateFilter(event.target.value)}>
                  {MEDIA_DATE_FILTER_OPTIONS.map(option => <option value={option.id} key={option.id}>{appCopy.t(option.label)}</option>)}
                </select>
              </label>
            </div>
            {mediaDateFilter === 'custom' && (
              <div className="media-custom-date-row">
                <label className="media-filter-field"><span>{appCopy.t('Từ ngày')}</span><input type="date" value={mediaFromDate} onChange={event => setMediaFromDate(event.target.value)} /></label>
                <label className="media-filter-field"><span>{appCopy.t('Đến ngày')}</span><input type="date" value={mediaToDate} onChange={event => setMediaToDate(event.target.value)} /></label>
              </div>
            )}

            <div className="media-browser-summary"><span>{filteredMediaEntries.length} {appCopy.t('mục')}</span><span>{appCopy.t('Nhóm theo ngày gửi')}</span></div>
            <div className="media-browser-results">
              {mediaGroups.length === 0 ? (
                <div className="workspace-empty media-browser-empty"><i className="fa-regular fa-folder-open"></i><span>{appCopy.t('Không có nội dung phù hợp với bộ lọc.')}</span></div>
              ) : mediaGroups.map(group => (
                <section className="media-date-group" key={group.key}>
                  <div className="media-date-heading"><strong>{group.label}</strong><span>{group.entries.length}</span></div>
                  <div className="media-result-list">
                    {group.entries.map(entry => (
                      <article className={`media-result-card ${entry.kind}`} key={entry.id}>
                        <button type="button" className="media-result-main" onClick={() => handleMediaEntryOpen(entry)}>
                          {entry.kind === 'images' && isImageAttachment(entry.attachment, entry.message?.type) && entry.attachment?.url ? (
                            <TinodeImagePreview source={entry.attachment.url} alt={entry.attachment.name || appCopy.t('Ảnh')} copy={appCopy} className="media-result-thumbnail" />
                          ) : (
                            <span className="media-result-icon"><i className={`fa-solid ${entry.kind === 'links' ? 'fa-link' : attachmentIconClass(entry.attachment, entry.message?.type)}`}></i></span>
                          )}
                          <span className="media-result-copy">
                            <strong>{entry.kind === 'links' ? entry.url : entry.attachment?.name || (entry.kind === 'images' ? appCopy.t('Ảnh/Video') : appCopy.t('File đính kèm'))}</strong>
                            <small>{entry.senderName} · {entry.timestamp ? formatMediaDateHeading(entry.timestamp, appCopy.locale) : appCopy.t('Chưa rõ ngày')}</small>
                            {entry.kind === 'files' && <small>{attachmentSizeLabel(entry.attachment)}</small>}
                          </span>
                        </button>
                        {entry.kind === 'files' && (
                          <span className="media-result-actions">
                            <button type="button" title={appCopy.t('Mở file')} aria-label={appCopy.t('Mở file')} disabled={!entry.attachment?.url} onClick={() => handleFileOpen(entry.attachment)}><i className="fa-regular fa-folder-open"></i></button>
                            <button type="button" title={appCopy.t('Tải xuống')} aria-label={appCopy.t('Tải xuống')} disabled={!entry.attachment?.url} onClick={() => handleFileDownload(entry.attachment)}><i className="fa-solid fa-download"></i></button>
                          </span>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </div>
      )}

      {workspacePanel && (
        <div className="workspace-overlay">
          <section className={`workspace-panel ${workspacePanel === 'enterprise' ? 'enterprise-shell-panel' : ''} ${workspacePanel === 'settings' ? 'settings-shell-panel' : ''}`} role="region" aria-labelledby="workspace-panel-title">
            <div className="workspace-panel-header">
              <div>
                <h2 id="workspace-panel-title">{appCopy.t(workspacePanel === 'groups' ? appCopy.groups : workspacePanel === 'profile' ? 'Hồ sơ cá nhân' : workspacePanel === 'contacts' ? 'Danh bạ' : workspacePanel === 'files' ? 'File dùng chung' : workspacePanel === 'enterprise' ? appCopy.work : workspacePanel === 'notifications' ? 'Thông báo' : workspacePanel === 'search' ? 'Tìm trong hội thoại' : appCopy.settings)}</h2>
              </div>
              <div className="workspace-panel-header-actions">
                {workspacePanel === 'profile' && (
                  <>
                    <button type="button" className="workspace-logout-button" onClick={requestLogout}>
                      <i className="fa-solid fa-arrow-right-from-bracket"></i>
                      <span>{appCopy.t('Đăng xuất')}</span>
                    </button>
                    {canSwitchTenant && (
                      <div className="tenant-switcher" ref={tenantSwitcherRef}>
                        <button
                          type="button"
                          className={`tenant-switcher-button ${tenantSwitcherOpen ? 'active' : ''}`}
                          title={appCopy.t('Chuyển công ty')}
                          aria-label={appCopy.t('Chuyển công ty')}
                          aria-expanded={tenantSwitcherOpen}
                          onClick={event => {
                            event.stopPropagation();
                            setTenantSwitchNotice('');
                            setTenantSwitcherOpen(previous => !previous);
                          }}
                          disabled={isSwitchingTenant}
                        >
                          <i className={`fa-solid ${isSwitchingTenant ? 'fa-spinner fa-spin' : 'fa-building'}`}></i>
                        </button>
                        {tenantSwitcherOpen && (
                          <div className="tenant-switcher-menu" role="listbox" aria-label={appCopy.t('Chọn công ty để làm việc')} onClick={event => event.stopPropagation()}>
                            <div className="tenant-switcher-heading">{appCopy.t('Chọn công ty để làm việc')}</div>
                            {tenantOptions.map(option => {
                              const isCurrentTenant = String(option.id) === String(profileAccount.tenantId || profileAccount.tenant_id || '');
                              return (
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={isCurrentTenant}
                                  className={`tenant-switcher-option ${isCurrentTenant ? 'current' : ''}`}
                                  key={option.id}
                                  onClick={() => handleTenantSwitch(option)}
                                  disabled={isSwitchingTenant || isCurrentTenant}
                                >
                                  <span className="tenant-switcher-option-icon"><i className="fa-solid fa-building"></i></span>
                                  <span className="tenant-switcher-option-copy">
                                    <strong>{option.name}</strong>
                                    <small>{isCurrentTenant ? appCopy.t('Công ty hiện tại') : option.role}</small>
                                  </span>
                                  {isCurrentTenant && <i className="fa-solid fa-check tenant-switcher-check"></i>}
                                </button>
                              );
                            })}
                            {tenantSwitchNotice && <div className="tenant-switcher-notice" role="alert"><i className="fa-solid fa-triangle-exclamation"></i><span>{tenantSwitchNotice}</span></div>}
                            {isSwitchingTenant && <div className="tenant-switcher-loading"><i className="fa-solid fa-spinner fa-spin"></i>{appCopy.t('Đang chuyển công ty...')}</div>}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                <button type="button" className="btn-close-detail" onClick={() => { if (workspacePanel === 'groups') closeCreateGroupModal(); closeWorkspacePanel(); }} aria-label={appCopy.t('Đóng')} title={appCopy.t('Đóng')} disabled={workspacePanel === 'groups' && isCreatingGroup}><i className="fa-solid fa-xmark"></i></button>
              </div>
            </div>

            {workspacePanel === 'groups' && renderCreateGroupForm('page')}

            {workspacePanel === 'enterprise' && (
              <EnterpriseWorkspace
                user={currentUser}
                accounts={directoryAccounts}
                copy={appCopy}
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
                    <label className={`profile-avatar-edit-button ${isUpdatingProfileAvatar ? 'loading' : ''}`} title={appCopy.t('Đổi ảnh đại diện')}>
                      <i className={`fa-solid ${isUpdatingProfileAvatar ? 'fa-spinner fa-spin' : 'fa-camera'}`}></i>
                      <input type="file" accept="image/*" onChange={handleProfileAvatarChange} disabled={isUpdatingProfileAvatar} />
                    </label>
                  </div>
                  <h3>{profileAccount.name || appCopy.t('Tài khoản hiện tại')}</h3>
                  <span className={`profile-status ${isCurrentUserOnline ? '' : 'offline'}`}><i className="fa-solid fa-circle"></i> {appCopy.t(isCurrentUserOnline ? 'Đang hoạt động' : 'Ngoại tuyến')}</span>
                </div>
                <div className="profile-details profile-readonly-details">
                  <div className="profile-detail-row"><i className="fa-solid fa-at"></i><div><small>{appCopy.t('Tên đăng nhập')}</small><strong>{profileAccount.username || appCopy.t('Chưa cập nhật')}</strong></div></div>
                  <div className="profile-detail-row"><i className="fa-solid fa-shield-halved"></i><div><small>{appCopy.t('Vai trò')}</small><strong>{profileAccount.role || appCopy.t('Thành viên')}</strong></div></div>
                  <div className="profile-detail-row profile-current-tenant"><i className="fa-solid fa-building"></i><div><small>{appCopy.t('Công ty hiện tại')}</small><strong>{profileAccount.tenantName || profileAccount.tenant_name || profileAccount.tenant?.name || appCopy.t('Chưa cập nhật')}</strong></div></div>
                </div>
                <form className="profile-edit-form" onSubmit={handleProfileSave}>
                  <label><span>{appCopy.t('Họ và tên')}</span><input value={profileForm.name} onChange={event => setProfileForm(previous => ({ ...previous, name: event.target.value }))} maxLength="255" required /></label>
                  <label><span>{appCopy.t('Email')}</span><input type="email" value={profileForm.email} onChange={event => setProfileForm(previous => ({ ...previous, email: event.target.value }))} maxLength="255" /></label>
                  <label><span>{appCopy.t('Chức vụ')}</span><input value={profileForm.title} onChange={event => setProfileForm(previous => ({ ...previous, title: event.target.value }))} maxLength="255" /></label>
                  <label><span>{appCopy.t('Phòng ban')}</span><input value={profileForm.department} onChange={event => setProfileForm(previous => ({ ...previous, department: event.target.value }))} maxLength="255" /></label>
                  {accountProfileReadOnly && <div className="profile-save-notice"><i className="fa-solid fa-building-shield"></i>{appCopy.t('Thông tin sẽ được lưu qua UpGO Account và đồng bộ lại cho các thiết bị.')}</div>}
                  {profileNotice && <div className="profile-save-notice"><i className="fa-solid fa-circle-check"></i>{appCopy.t(profileNotice)}</div>}
                  <button type="submit" className="btn-primary profile-save-button" disabled={isSavingProfile}>
                    <i className={`fa-solid ${isSavingProfile ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
                    {isSavingProfile ? appCopy.t('Đang lưu...') : appCopy.t('Lưu hồ sơ')}
                  </button>
                </form>
              </div>
            )}

            {workspacePanel === 'contacts' && (
              <>
                <div className="workspace-search-row">
                  <i className="fa-solid fa-magnifying-glass"></i>
                  <input value={workspaceQuery} onChange={handleWorkspaceSearch} placeholder={appCopy.t('Tìm theo tên, email hoặc username...')} autoFocus />
                </div>

                {isWorkspaceLoading && <div className="workspace-empty"><i className="fa-solid fa-spinner fa-spin"></i> {appCopy.t('Đang tìm...')}</div>}
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
                            {appCopy.t('Nhắn tin')}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!isWorkspaceLoading && workspaceQuery.trim().length < 2 && companyContacts.length === 0 && (
                  <div className="workspace-empty"><i className="fa-solid fa-user-group"></i><span>{appCopy.t('Chưa có nhân viên nào khác trong công ty.')}</span></div>
                )}
                {!isWorkspaceLoading && workspaceQuery.trim().length >= 2 && companySearchResults.length === 0 && (
                  <div className="workspace-empty"><i className="fa-regular fa-address-book"></i><span>{appCopy.t('Không tìm thấy tài khoản phù hợp.')}</span></div>
                )}
                {workspaceQuery.trim().length >= 2 && companySearchResults.length > 0 && (
                  <div className="workspace-section-heading search-results-heading"><strong>{appCopy.t('Kết quả tìm kiếm')}</strong><span>{companySearchResults.length}</span></div>
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
                          {appCopy.t('Nhắn tin')}
                        </button>
                      </div>
                  ))}
                </div>
              </>
            )}

            {workspacePanel === 'files' && (
              <>

                {sharedFiles.length === 0 ? <div className="workspace-empty"><i className="fa-regular fa-folder-open"></i><span>{appCopy.t('Chưa có file dùng chung.')}</span></div> : (
                  <div className="workspace-list">
                    {sharedFiles.map(file => {
                      const sharedAttachment = file.file || (file.type === 'image' && file.image ? {
                        name: appCopy.t('Hình ảnh'),
                        mime: 'image/*',
                        size: appCopy.t('Hình ảnh'),
                        url: file.image,
                      } : null);
                      const sharedIcon = attachmentIconClass(sharedAttachment, file.type);
                      const sharedTone = sharedIcon.replace('fa-file-', '');
                      const sharedStatus = sharedAttachment?.url ? appCopy.t('Đã có trên Cloud') : appCopy.t('Có sẵn trên máy');
                      return (
                        <article className="workspace-file-card" key={`${file.roomId}-${file.id}`}>
                          <button type="button" className="workspace-file-main" onClick={() => { closeWorkspacePanel(); handleConversationSelect(file.roomId); }}>
                            <span className={`workspace-file-icon ${file.type} ${sharedTone} ${sharedAttachment?.ext || ''}`}><i className={`fa-solid ${sharedIcon}`}></i></span>
                            <span className="workspace-file-copy">
                              <strong title={sharedAttachment?.name || appCopy.t('Tệp đính kèm')}>{sharedAttachment?.name || (file.type === 'image' ? appCopy.t('Hình ảnh') : appCopy.t('Tệp đính kèm'))}</strong>
                              <span className="workspace-file-meta">
                                <small>{file.roomName} · {attachmentSizeLabel(sharedAttachment)} · {file.time}</small>
                                <small className="workspace-cloud-status"><i className="fa-solid fa-cloud-check" aria-hidden="true"></i>{sharedStatus}</small>
                              </span>
                            </span>
                          </button>
                          <span className="workspace-file-actions">
                            <button type="button" className="workspace-file-action" title={appCopy.t('Mở file')} aria-label={appCopy.t('Mở file')} disabled={!sharedAttachment?.url} onClick={() => handleFileOpen(sharedAttachment)}><i className="fa-regular fa-folder-open"></i></button>
                            <button type="button" className="workspace-file-action" title={appCopy.t('Tải xuống')} aria-label={appCopy.t('Tải xuống')} disabled={!sharedAttachment?.url} onClick={() => handleFileDownload(sharedAttachment)}><i className="fa-solid fa-download"></i></button>
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

                {friendNotice && <div className="friend-notice"><i className="fa-solid fa-circle-check"></i><span>{appCopy.t(friendNotice)}</span></div>}
                {friendNotifications.length > 0 && (
                  <div className="friend-request-list">
                    {friendNotifications.map(record => {
                      const incoming = record.event.recipientId === managementViewerId;
                      const status = record.response?.event?.action || 'pending';
                      const displayName = incoming
                        ? (record.event.requesterName || record.message.senderName || appCopy.t('Người dùng'))
                        : (record.response?.event?.responderName || record.room.name || appCopy.t('Người dùng'));
                      return (
                        <article className="friend-request-card" key={record.event.requestId}>
                          <SafeAvatar src={incoming ? (record.message.avatar || record.room.avatarUrl) : record.room.avatarUrl} name={displayName} className="workspace-avatar" />
                          <div className="friend-request-copy">
                            <strong>{displayName}</strong>
                        <span>{appCopy.t(incoming ? 'đã gửi cho bạn lời mời kết bạn.' : status === 'accepted' ? 'đã chấp nhận lời mời kết bạn.' : 'đã từ chối lời mời kết bạn.')}</span>
                            {record.event.note && <small>“{record.event.note}”</small>}
                            <time>{formatMessageTime(record.message, record.message.time, appCopy.locale)}</time>
                          </div>
                          {incoming && status === 'pending' ? (
                            <div className="friend-request-actions">
                              <button type="button" className="accept" disabled={Boolean(respondingFriendRequestId)} onClick={() => handleFriendRequestResponse(record, true)}>{appCopy.t('Chấp nhận')}</button>
                              <button type="button" className="reject" disabled={Boolean(respondingFriendRequestId)} onClick={() => handleFriendRequestResponse(record, false)}>{appCopy.t('Từ chối')}</button>
                            </div>
                          ) : (
                            <span className={`friend-request-status ${status}`}>{appCopy.t(status === 'accepted' ? 'Đã chấp nhận' : status === 'rejected' ? 'Đã từ chối' : 'Đã gửi')}</span>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
                {notifications.length === 0 && friendNotifications.length === 0 ? <div className="workspace-empty"><i className="fa-regular fa-bell-slash"></i><span>{appCopy.t('Không có thông báo mới.')}</span></div> : notifications.length > 0 && (
                  <div className="workspace-list">
                    {notifications.map(room => (
                      <button type="button" className="workspace-list-item" key={room.id} onClick={() => { closeWorkspacePanel(); handleConversationSelect(room.id); }}>
                        <span className="workspace-file-icon"><i className="fa-solid fa-message"></i></span>
                        <span className="workspace-list-copy"><strong>{room.name}</strong><small>{localizedConversationPreview(room, appCopy, directoryAccounts, viewerId) || appCopy.t('Có cập nhật mới')} · {formatConversationListTime(room, displayClock, appCopy.locale)}</small></span>
                        {room.badge > 0 && <span className="workspace-unread">{room.badge}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {workspacePanel === 'search' && (
              <>
                <div className="workspace-search-row"><i className="fa-solid fa-magnifying-glass"></i><input value={messageSearchQuery} onChange={event => setMessageSearchQuery(event.target.value)} placeholder={appCopy.t('Tìm nội dung hoặc người gửi...')} autoFocus /></div>
                {messageSearchQuery && <p className="workspace-hint">{visibleMessages.length} {appCopy.t('kết quả trong')} {activeChat.name}</p>}
                <div className="workspace-list">
                  {messageSearchQuery && visibleMessages.map(message => <button type="button" className="workspace-list-item" key={message.id} onClick={() => closeWorkspacePanel()}><span className="workspace-file-icon"><i className="fa-solid fa-message"></i></span><span className="workspace-list-copy"><strong>{message.senderName || appCopy.t('Bạn')}</strong><small>{message.text || message.file?.name || appCopy.t('Nội dung đính kèm')} · {formatMessageTime(message, message.time, appCopy.locale)}</small></span></button>)}
                </div>
              </>
            )}

            {workspacePanel === 'settings' && (
              <div className="workspace-settings">
                <section className="settings-card notification-preference-card" aria-labelledby="desktop-notification-title">
                  <div className="settings-card-heading">
                    <span className="settings-card-icon notification"><i className="fa-solid fa-bell"></i></span>
                    <div className="settings-card-heading-copy">
                      <h3 id="desktop-notification-title">{appCopy.notificationSettings}</h3>
                      <p>{appCopy.notificationDescription}</p>
                    </div>
                  </div>
                  <div className="notification-device-options" role="radiogroup" aria-label={appCopy.desktopNotifications}>
                    <button
                      type="button"
                      className={`notification-device-choice ${settings.desktopNotifications ? 'selected' : ''}`}
                      role="radio"
                      aria-checked={settings.desktopNotifications}
                      onClick={() => handleDesktopNotificationToggle(true)}
                    >
                      <span className="notification-device-icon"><i className="fa-solid fa-bell"></i></span>
                      <span className="notification-device-copy"><strong>{appCopy.enabled}</strong><small>{appCopy.notificationEnabledDescription}</small></span>
                      <span className="notification-radio-dot" aria-hidden="true"></span>
                    </button>
                    <button
                      type="button"
                      className={`notification-device-choice ${!settings.desktopNotifications ? 'selected' : ''}`}
                      role="radio"
                      aria-checked={!settings.desktopNotifications}
                      onClick={() => handleDesktopNotificationToggle(false)}
                    >
                      <span className="notification-device-icon"><i className="fa-solid fa-bell-slash"></i></span>
                      <span className="notification-device-copy"><strong>{appCopy.disabled}</strong><small>{appCopy.notificationDisabledDescription}</small></span>
                      <span className="notification-radio-dot" aria-hidden="true"></span>
                    </button>
                  </div>
                  <small className={`notification-permission-status ${desktopNotificationPermission === 'granted' ? 'ready' : 'attention'}`}>
                    <i className={`fa-solid ${desktopNotificationPermission === 'granted' ? 'fa-circle-check' : 'fa-circle-exclamation'}`} aria-hidden="true"></i>
                    <span>
                      {desktopNotificationPermission === 'unsupported'
                        ? appCopy.permissionUnsupported
                        : desktopNotificationPermission === 'denied'
                          ? appCopy.permissionDenied
                          : desktopNotificationPermission === 'default'
                            ? appCopy.permissionDefault
                            : appCopy.permissionReady}
                    </span>
                  </small>
                  {notificationSettingsNotice && <div className="notification-settings-notice"><i className="fa-solid fa-circle-info"></i>{appCopy.t(notificationSettingsNotice)}</div>}
                </section>
                <section className="settings-card notification-sound-settings" aria-labelledby="notification-sound-title">
                  <div className="settings-card-heading notification-sound-heading">
                    <span className="settings-card-icon sound"><i className="fa-solid fa-music"></i></span>
                    <div className="settings-card-heading-copy">
                      <h3 id="notification-sound-title">{appCopy.soundTitle}</h3>
                      <p>{appCopy.soundDescription}</p>
                    </div>
                    <label className="settings-toggle">
                      <input type="checkbox" checked={settings.sounds} onChange={event => updateNotificationSettings({ sounds: event.target.checked })} aria-label={appCopy.enableSound} />
                      <span className="settings-toggle-track" aria-hidden="true"><span></span></span>
                    </label>
                  </div>
                  <div className="notification-sound-picker">
                    <select value={settings.sound} onChange={event => updateNotificationSettings({ sound: event.target.value })} disabled={!settings.sounds} aria-label={appCopy.selectSound}>
                      {MESSAGE_SOUND_OPTIONS.map(option => <option key={option.id} value={option.id}>{appCopy.soundOptions[option.id] || option.label}</option>)}
                      <option value={CUSTOM_NOTIFICATION_SOUND_ID} disabled={!customNotificationSound}>
                        {customNotificationSound ? `${appCopy.customSoundLabel}: ${customNotificationSound.name}` : appCopy.customSoundMissing}
                      </option>
                    </select>
                    <button
                      type="button"
                      className="notification-preview-button"
                      onClick={() => playNotificationSound(settings.sound)}
                      disabled={!settings.sounds || (settings.sound === CUSTOM_NOTIFICATION_SOUND_ID && !customNotificationSoundUrl)}
                    >
                      <i className="fa-solid fa-volume-high"></i>{appCopy.previewSound}
                    </button>
                    <input
                      ref={notificationSoundFileInputRef}
                      className="notification-sound-file-input"
                      type="file"
                      accept="audio/*"
                      onChange={handleCustomNotificationSoundUpload}
                    />
                    <button
                      type="button"
                      className="notification-upload-button"
                      onClick={() => notificationSoundFileInputRef.current?.click()}
                      disabled={isSavingCustomNotificationSound || !notificationSettingsViewerId}
                      title={customNotificationSound ? appCopy.replaceSound : appCopy.uploadSound}
                      aria-label={customNotificationSound ? appCopy.replaceSound : appCopy.uploadSound}
                    >
                      <i className={`fa-solid ${customNotificationSound ? 'fa-rotate' : 'fa-upload'}`}></i>
                      <span>{isSavingCustomNotificationSound ? appCopy.saveSound : customNotificationSound ? appCopy.replaceSound : appCopy.uploadSound}</span>
                    </button>
                    {customNotificationSound && (
                      <button
                        type="button"
                        className="notification-remove-button"
                        onClick={handleRemoveCustomNotificationSound}
                        disabled={isSavingCustomNotificationSound}
                        title={appCopy.removeSound}
                        aria-label={appCopy.removeSound}
                      >
                        <i className="fa-solid fa-trash-can"></i><span>{appCopy.removeSound}</span>
                      </button>
                    )}
                  </div>
                  <div className="notification-sound-file-status" role="status">
                    <i className={`fa-solid ${customNotificationSound ? 'fa-file-audio' : 'fa-circle-info'}`}></i>
                    <span>
                      {isLoadingCustomNotificationSound
                        ? appCopy.checkingSound
                        : customNotificationSound
                          ? `${appCopy.customSoundTitle}: ${customNotificationSound.name}`
                          : appCopy.customSoundEmpty}
                    </span>
                  </div>
                </section>
                <section className="settings-card theme-preference-card" aria-labelledby="theme-preference-title">
                  <div className="settings-card-heading theme-preference-heading">
                    <span className="settings-card-icon appearance"><i className="fa-solid fa-palette"></i></span>
                    <div className="settings-card-heading-copy">
                      <h3 id="theme-preference-title">{appCopy.themeTitle}</h3>
                      <p>{appCopy.themeDescription}</p>
                    </div>
                  </div>
                  <div className="theme-choice-grid" role="radiogroup" aria-label={appCopy.themeTitle}>
                    {APP_THEME_OPTIONS.map(option => (
                      <button
                        key={option.id}
                        type="button"
                        className={`theme-choice ${settings.theme === option.id ? 'selected' : ''}`}
                        role="radio"
                        aria-checked={settings.theme === option.id}
                        onClick={() => updateNotificationSettings({ theme: option.id })}
                      >
                        <span className={`theme-preview theme-preview-${option.id}`} aria-hidden="true">
                          <span className="theme-preview-sidebar"></span>
                          <span className="theme-preview-body">
                            <span className="theme-preview-line wide"></span>
                            <span className="theme-preview-line"></span>
                            <span className="theme-preview-chip"></span>
                          </span>
                        </span>
                        {settings.theme === option.id && <span className="theme-choice-selected" aria-hidden="true"><i className="fa-solid fa-check"></i></span>}
                        <span className="theme-choice-label"><span className="theme-radio-dot"></span>{appCopy.themeOptions[option.id] || option.label}</span>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="settings-card settings-inline-card language-setting-row" aria-labelledby="language-setting-title">
                  <div className="settings-card-heading">
                    <span className="settings-card-icon language"><i className="fa-solid fa-globe"></i></span>
                    <div className="settings-card-heading-copy">
                      <h3 id="language-setting-title">{appCopy.language}</h3>
                      <p>{appCopy.languageHint}</p>
                    </div>
                  </div>
                  <div className="language-picker" ref={languageMenuRef}>
                    <button
                      type="button"
                      className="language-picker-trigger"
                      aria-haspopup="listbox"
                      aria-expanded={languageMenuOpen}
                      aria-label={appCopy.language}
                      onClick={() => setLanguageMenuOpen(previous => !previous)}
                    >
                      <span className="language-picker-flag" aria-hidden="true">{selectedLanguage.flag}</span>
                      <span>{appCopy.t(selectedLanguage.label)}</span>
                      <i className={`fa-solid ${languageMenuOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true"></i>
                    </button>
                    {languageMenuOpen && (
                      <div className="language-picker-menu" role="listbox" aria-label={appCopy.language}>
                        {APP_LANGUAGE_OPTIONS.map(option => (
                          <button
                            key={option.id}
                            type="button"
                            role="option"
                            aria-selected={settings.language === option.id}
                            className={`language-picker-option ${settings.language === option.id ? 'selected' : ''}`}
                            onClick={() => {
                              updateNotificationSettings({ language: option.id });
                              setLanguageMenuOpen(false);
                            }}
                          >
                            <span className="language-picker-flag" aria-hidden="true">{option.flag}</span>
                            <span>{appCopy.t(option.label)}</span>
                            {settings.language === option.id && <i className="fa-solid fa-check" aria-hidden="true"></i>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
                <section className="settings-card pin-preference-card" aria-labelledby="pin-preference-title">
                  <div className="settings-card-heading pin-preference-heading">
                    <span className="settings-card-icon security"><i className="fa-solid fa-shield-halved"></i></span>
                    <div className="settings-card-heading-copy">
                      <h3 id="pin-preference-title">{appCopy.pinTitle}</h3>
                      <p>{appCopy.pinDescription}</p>
                    </div>
                    <span className={`pin-preference-status ${pinLockConfig ? 'enabled' : ''}`}>
                      {pinLockConfig ? appCopy.pinEnabled : appCopy.pinDisabled}
                    </span>
                  </div>
                  <form className="pin-preference-form" onSubmit={handlePinSettingsSubmit}>
                    <label className="pin-preference-field">
                      <span>{appCopy.pinCode}</span>
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        maxLength={6}
                        value={pinSetupValue}
                        onChange={event => setPinSetupValue(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        disabled={isSavingPin}
                      />
                    </label>
                    <label className="pin-preference-field">
                      <span>{appCopy.pinConfirm}</span>
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        maxLength={6}
                        value={pinConfirmValue}
                        onChange={event => setPinConfirmValue(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        disabled={isSavingPin}
                      />
                    </label>
                    <div className="pin-preference-actions">
                      <button type="submit" className="pin-save-button" disabled={isSavingPin || !pinViewerId}>
                        <i className="fa-solid fa-shield-halved"></i>
                        {isSavingPin ? appCopy.pinSaving : pinLockConfig ? appCopy.pinChange : appCopy.pinSet}
                      </button>
                      {pinLockConfig && (
                        <button type="button" className="pin-disable-button" onClick={handleDisablePin} disabled={isSavingPin}>
                          <i className="fa-solid fa-lock-open"></i>{appCopy.pinDisable}
                        </button>
                      )}
                    </div>
                  </form>
                  {pinSettingsNotice && <div className="pin-settings-notice" role="status"><i className="fa-solid fa-circle-info"></i>{appCopy.t(pinSettingsNotice)}</div>}
                  <div className="pin-preference-note"><i className="fa-solid fa-shield-halved" aria-hidden="true"></i><span>{appCopy.pinDeviceNote}</span></div>
                </section>
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
                <span className="group-modal-kicker">{appCopy.t('THÔNG BÁO HỘI THOẠI')}</span>
                <h2 id="notification-mute-title">{appCopy.t('Tắt thông báo')}</h2>
              </div>
              <button type="button" className="btn-close-detail" onClick={() => setNotificationMuteDialog(null)} aria-label={appCopy.t('Đóng')} disabled={isUpdatingNotificationMute}>
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
                  <span>{appCopy.t(label)}</span>
                </label>
              ))}
            </div>

            <div className="group-modal-footer notification-mute-footer actions-only">

              <div className="group-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setNotificationMuteDialog(null)} disabled={isUpdatingNotificationMute}>{appCopy.t('Hủy')}</button>
                <button type="submit" className="btn-primary" disabled={isUpdatingNotificationMute}>
                  {isUpdatingNotificationMute ? <i className="fa-solid fa-spinner fa-spin"></i> : appCopy.t('Đồng ý')}
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
          {renderCreateGroupForm('modal')}
        </div>
      )}

    </div>
  );
}

export default App;
