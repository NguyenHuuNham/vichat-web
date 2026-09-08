import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Login from '../features/auth/components/Login';
import ChatLogo from '../components/ChatLogo';
import ConversationErrorBoundary from '../components/ConversationErrorBoundary';
import EnterpriseWorkspace from '../features/workspace/components/EnterpriseWorkspace';
import CallOverlay from '../features/chat/components/CallOverlay';
import StickerPicker from '../features/chat/components/StickerPicker';
import ConversationBackgroundCropModal from '../features/chat/components/ConversationBackgroundCropModal';
import ConversationCategoryManager from '../features/chat/components/ConversationCategoryManager';
import { isTinodeConfigured, tinodeClient, normalizeTinodeConversation, normalizeTinodeMediaUrl } from '../features/chat/services/tinodeClient';
import { shouldRetryProtectedMediaAfterSession } from '../features/chat/services/mediaRetryPolicy';
import { startBrowserPresence } from '../features/chat/services/browserPresence';
import {
  chatManagementService,
  isAccountManaged,
  isSessionRestoreAuthFailure,
  managementAuthClient,
} from '../features/chat/services/chatManagementService';
import {
  applyReceiptToMessages,
  conversationManagementMergePolicy,
  conversationDisplayName,
  ensureConversationEntry,
  firstVisibleConversationId,
  isManagementConversationId,
  mergeDeliveryStatus,
  mergeConversationReadState,
  mergeManagementAvatar,
  normalizeConversationShape,
  normalizeConversationFlag,
  messageActivityTimestamp,
  latestConversationMessage,
  resolveConversationPreview,
  resolveMergedConversationActivity,
  readyTinodeTypingTopic,
  resolveConversationDeletedAt,
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
  readConversationCategoryState,
  removeConversationCategory,
  reorderConversationCategories,
  saveConversationCategory,
  setCategoryConversations,
  setConversationCategory,
} from '../features/chat/services/conversationCategoryPolicy';
import { resolveCallsEnabled } from '../features/chat/services/callSignaling';
import {
  DIRECT_MESSAGE_BLOCKED_TEXT,
  isDirectMessageBlockedError,
} from '../features/chat/services/directMessageBlocking';
import {
  GROUP_SPAM_BASE_COOLDOWN_MS,
  applyGroupSpamCooldown,
  createGroupSpamActionId,
  createGroupSpamState,
  groupSpamCooldownMessage,
  groupSpamErrorRetryAfterMs,
  groupSpamRemainingSeconds,
  isGroupSpamCooldownError,
  registerGroupSpamAttempt,
} from '../features/chat/services/groupSpamPolicy';
import { attachmentConversationPreview } from '../features/chat/services/messagePreview';
import {
  createUnreadBoundary,
  isUnreadBoundaryEnd,
  isUnreadMessageVisible,
  mergeUnreadBoundary,
  reconcileUnreadBoundary,
  unreadBadgeLabel,
  unreadCountForConversation,
  unreadBoundaryHasNewerTail,
  unreadBoundaryReadSequence,
  unreadBoundaryStartIndex,
  unreadIndicatorVisible,
  unreadMessagesForConversation,
} from '../features/chat/services/unreadBoundary';
import {
  normalizeReceiptUsers,
  receiptAvatarPreview,
} from '../features/chat/services/messageReceipts';
import {
  formatAudioDuration,
  isAudioAttachment,
  splitAttachmentSelection,
  messageContentLabel,
  replyContentLabel,
} from '../features/chat/services/messagePresentation';
import {
  groupImageMessageEntries,
  imageBatchLayoutClass,
  normalizeImageBatch,
} from '../features/chat/services/imageBatchLayout';
import {
  MAX_PASTED_ATTACHMENTS,
  clipboardAttachmentFiles,
  formatPasteAttachmentSize,
  isPastedImageFile,
  normalizePastedFile,
  pasteAttachmentSendPlan,
} from '../features/chat/services/pasteAttachmentDraft';
import {
  canRecallDeliveredMessage,
  canEditDeliveredMessage,
  chatAttachmentValidationError,
} from '../features/chat/services/messagePolicy';
import { splitMessageLinks } from '../features/chat/services/messageLinkPolicy';
import {
  MESSAGE_QUICK_REACTIONS,
  pinnedMessagesForRoom,
} from '../features/chat/services/messageActionPolicy';
import {
  ALL_MENTION_ID,
  getMentionContext,
  insertMentionAt,
  matchesMentionCandidate,
  mentionCanonicalText,
  mentionCandidateText,
  mentionDisplayTokenFor,
  messageMentionsViewer,
  serializeMentionForTransport,
  mentionTokenExists,
  mentionTokenFor,
} from '../features/chat/services/mentionPolicy';
import {
  formatConversationListTime,
  conversationActivityTimestamp,
  formatOfflineDuration,
  formatFullMessageDateTime,
  formatMessageDateLabel,
  formatMessageTime,
  parseTimestamp,
} from '../features/chat/services/timeFormatting';
import {
  canAppointGroupDeputy,
  canApproveGroupMembers,
  canManageGroupMembers,
  canRemoveGroupMember,
  canRevokeGroupDeputy,
  accountTenantId,
  companyDirectoryContacts,
  companyDirectoryHeading,
  countGroupPresence,
  directoryUsernameMeta,
  filterAccountsByTenant,
  findAccount,
  findAccountByIdentities,
  findDirectPeer,
  identitiesOverlap,
  identityValues,
  latestTimestampValue,
  groupRoleForIdentity,
  normalizeGroupRole,
  matchesCompanyDirectoryContact,
  applyContactNicknames,
  mergeDirectoryAccountSnapshots,
  mergeRealtimeAccountProfile,
  mergeRealtimeMemberPresence,
  normalizeAccountShape,
  resolveGroupAdministrator,
  snapshotLastSeenAt,
  snapshotPresence,
  updateAccountProfiles,
  updateAccountPresence,
} from '../features/contacts/services/accountDirectory';
import AvatarCropModal from '../features/contacts/components/AvatarCropModal';
import { addDemoGroupMembers, appendDemoGroupMessage, deleteDemoGroupForUser, dissolveDemoGroup, leaveDemoGroup, markDemoGroupRead, removeDemoGroupMember, saveDemoGroup, updateDemoGroupMemberRole, updateDemoGroupMessage } from '../features/demo/services/demoGroupStore';
import { appendDemoDirectMessage, deleteDemoDirectForUser, directConversationId, markDemoDirectRead, saveDemoDirect, updateDemoDirectMessage } from '../features/demo/services/demoDirectStore';
import { CHATBOT_ACCOUNT, CHATBOT_STARTER_PROMPTS, EXTERNAL_CHAT_ONLY, applyTinodeChatbotConfig, ingestChatDocument, loadChatbotMessages, loadChatbotMessagesFromServer, loadTinodeChatbotConfig, mergeChatbotMessages, requestChatbotReply, saveChatbotMessage } from '../features/chatbot/services/chatbotService';
import {
  PIN_VALIDATION_ERRORS,
  clearPinTabAccess,
  hasPinTabAccess,
  markPinTabUnlocked,
  readPinConfig,
  validatePin,
  verifyPin,
} from '../features/security/services/pinLock';
import { createLocalizedCopy } from '../features/i18n/appLanguage';
import { workspacePanelFromPath, workspacePathForPanel } from '../features/workspace/services/workspaceRouting';
import {
  DEFAULT_GROUP_SETTINGS,
  GROUP_INFO_PERMISSION_MESSAGE,
  groupInfoErrorMessage,
  groupSettingEnabled,
  normalizeGroupSettings,
} from '../features/chat/services/groupSettings';
import {
  DEFAULT_POLL_SETTINGS,
  POLL_LIMITS,
  applyPollEvent,
  normalizePoll,
  normalizePollEvent,
  pollCanViewerLock,
  pollIsClosed,
  pollOptionVoteCounts,
  projectPollsWithMembers,
  pollTotalVoters,
  pollVoterDetails,
  pollViewerIdentities,
} from '../features/chat/services/poll';
import {
  CONVERSATION_BACKGROUND_PRESETS,
  CONVERSATION_BACKGROUND_LOCAL_MAX_BYTES,
  CONVERSATION_BACKGROUND_MAX_BYTES,
  CONVERSATION_BACKGROUND_SCOPES,
  clearConversationBackground,
  createClearedConversationBackground,
  normalizeConversationBackground,
  conversationBackgroundStorageKey,
  deleteConversationBackgroundFile,
  readConversationBackgroundPreference,
  readConversationBackgroundFile,
  validateConversationBackgroundFile,
  writeConversationBackgroundPreference,
  writeConversationBackgroundFile,
} from '../features/chat/services/conversationBackground';
import {
  DEFAULT_KEYBOARD_SHORTCUT_SETTINGS,
  SHORTCUT_ACTIONS,
  formatShortcut,
  isSafeShortcut,
  normalizeKeyboardShortcutSettings,
  normalizeShortcut,
  readKeyboardShortcutSettings,
  shortcutConflict,
  shortcutMatchesEvent,
  shortcutFromKeyboardEvent,
  writeKeyboardShortcutSettings,
} from '../features/chat/services/keyboardShortcuts';
import {
  readMessageActions,
  writeMessageActions,
} from '../features/chat/services/messageActionStorage';
import { suggestStickersForText } from '../features/chat/services/stickerCatalog';
import {
  canMigrateLegacyViewerPreference,
  markLegacyViewerPreferenceMigrated,
  viewerStorageKeyId,
} from '../features/chat/services/viewerPreferenceStorage.js';

const PRIMARY_SIDEBAR_STORAGE_PREFIX = 'songhong.primary-sidebar-collapsed';

function primarySidebarStorageKey(viewerId, tenantId = '') {
  return tenantId
    ? `${PRIMARY_SIDEBAR_STORAGE_PREFIX}.${viewerStorageKeyId(viewerId, tenantId)}`
    : PRIMARY_SIDEBAR_STORAGE_PREFIX;
}

const CALLS_ENABLED = resolveCallsEnabled(import.meta.env.VITE_CALLS_ENABLED);

function isEditableKeyboardTarget(target) {
  const tagName = String(target?.tagName || '').toLowerCase();
  return Boolean(target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName));
}

function viewerPreferenceIdentityFromValues(id, uid, tinodeUid, tinodeUidSnake, fallbackId = '') {
  const ids = [...new Set([
    id,
    uid,
    tinodeUid,
    tinodeUidSnake,
    fallbackId,
  ].map(value => String(value || '').trim()).filter(Boolean))];
  return { viewerId: ids[0] || '', aliases: ids.slice(1) };
}

function viewerPreferenceIdentity(user, fallbackId = '') {
  return viewerPreferenceIdentityFromValues(
    user?.id,
    user?.uid,
    user?.tinodeUid,
    user?.tinode_uid,
    fallbackId,
  );
}

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
    pinCode: 'Mã PIN',
    pinRequired: 'Hãy nhập mã PIN.',
    pinDigitsOnly: 'Mã PIN chỉ được gồm chữ số.',
    pinLength: 'Mã PIN phải có từ 4 đến 6 chữ số.',
    pinUnlockTitle: 'Mở khóa Chat',
    pinUnlockDescription: 'Nhập mã PIN để tiếp tục vào cuộc trò chuyện.',
    pinUnlock: 'Mở khóa',
    pinWrong: 'Mã PIN không đúng.',
    pinChecking: 'Đang kiểm tra mã PIN...',
    keyboardShortcuts: 'Phím tắt',
    keyboardShortcutsDescription: 'Tăng tốc thao tác trong Chat bằng các tổ hợp phím riêng cho tài khoản này.',
    keyboardShortcutsEnabled: 'Bật phím tắt',
    keyboardShortcutsEnabledDescription: 'Cho phép dùng phím tắt khi không đang nhập nội dung.',
    keyboardShortcutsHint: 'Bấm vào ô bên phải rồi nhấn tổ hợp phím muốn dùng. Esc có thể dùng một mình; phím khác nên đi kèm Ctrl/Cmd, Alt hoặc Shift.',
    keyboardShortcutsReset: 'Khôi phục mặc định',
    keyboardShortcutsClear: 'Xóa phím',
    keyboardShortcutsNotAssigned: 'Chưa gán',
    keyboardShortcutsRecording: 'Đang ghi...',
    keyboardShortcutsInvalid: 'Tổ hợp phím không hợp lệ. Hãy dùng Esc hoặc thêm Ctrl/Cmd, Alt hay Shift.',
    keyboardShortcutsConflict: 'Tổ hợp phím này đã được dùng cho thao tác khác.',
    shortcutClose: 'Đóng nhanh',
    shortcutCloseDescription: 'Đóng lớp phủ, popup, panel hoặc menu đang mở.',
    shortcutSearch: 'Tìm cuộc trò chuyện',
    shortcutSearchDescription: 'Đưa con trỏ vào ô tìm kiếm cuộc trò chuyện.',
    shortcutComposer: 'Soạn tin nhắn',
    shortcutComposerDescription: 'Đưa con trỏ vào ô nhập tin nhắn hiện tại.',
    shortcutContacts: 'Mở danh bạ',
    shortcutContactsDescription: 'Mở panel danh bạ công ty.',
    shortcutSettings: 'Mở cài đặt',
    shortcutSettingsDescription: 'Mở panel cài đặt ứng dụng.',
    shortcutNextConversation: 'Cuộc trò chuyện tiếp theo',
    shortcutNextConversationDescription: 'Chuyển xuống cuộc trò chuyện kế tiếp trong danh sách.',
    shortcutPreviousConversation: 'Cuộc trò chuyện trước',
    shortcutPreviousConversationDescription: 'Chuyển lên cuộc trò chuyện trước trong danh sách.',
    stickerSuggestions: 'Gợi ý Sticker',
    stickerSuggestionsDescription: 'Hiển thị sticker phù hợp với nội dung tin nhắn đang soạn.',
    stickerSuggestionsEnabled: 'Bật gợi ý Sticker',
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
    pinCode: 'PIN',
    pinRequired: 'Enter a PIN.',
    pinDigitsOnly: 'The PIN can contain digits only.',
    pinLength: 'The PIN must contain 4 to 6 digits.',
    pinUnlockTitle: 'Unlock Chat',
    pinUnlockDescription: 'Enter your PIN to continue to the conversation.',
    pinUnlock: 'Unlock',
    pinWrong: 'Incorrect PIN.',
    pinChecking: 'Checking PIN...',
    keyboardShortcuts: 'Keyboard shortcuts',
    keyboardShortcutsDescription: 'Speed up Chat with account-specific keyboard shortcuts.',
    keyboardShortcutsEnabled: 'Enable shortcuts',
    keyboardShortcutsEnabledDescription: 'Use shortcuts when you are not typing content.',
    keyboardShortcutsHint: 'Click a field and press the combination you want. Escape can stand alone; other keys should use Ctrl/Cmd, Alt or Shift.',
    keyboardShortcutsReset: 'Restore defaults',
    keyboardShortcutsClear: 'Clear shortcut',
    keyboardShortcutsNotAssigned: 'Not assigned',
    keyboardShortcutsRecording: 'Recording...',
    keyboardShortcutsInvalid: 'Invalid shortcut. Use Escape or add Ctrl/Cmd, Alt or Shift.',
    keyboardShortcutsConflict: 'This shortcut is already used by another action.',
    shortcutClose: 'Close quickly',
    shortcutCloseDescription: 'Close the active overlay, popup, panel or menu.',
    shortcutSearch: 'Search conversations',
    shortcutSearchDescription: 'Focus the conversation search field.',
    shortcutComposer: 'Focus composer',
    shortcutComposerDescription: 'Focus the current message input.',
    shortcutContacts: 'Open contacts',
    shortcutContactsDescription: 'Open the company contacts panel.',
    shortcutSettings: 'Open settings',
    shortcutSettingsDescription: 'Open the application settings panel.',
    shortcutNextConversation: 'Next conversation',
    shortcutNextConversationDescription: 'Move down to the next conversation in the list.',
    shortcutPreviousConversation: 'Previous conversation',
    shortcutPreviousConversationDescription: 'Move up to the previous conversation in the list.',
    stickerSuggestions: 'Sticker suggestions',
    stickerSuggestionsDescription: 'Show stickers that match the message you are composing.',
    stickerSuggestionsEnabled: 'Enable sticker suggestions',
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

const HISTORY_SEARCH_TYPE_OPTIONS = Object.freeze([
  Object.freeze({ id: 'all', label: 'Tất cả loại' }),
  Object.freeze({ id: 'text', label: 'Tin nhắn' }),
  Object.freeze({ id: 'image', label: 'Ảnh' }),
  Object.freeze({ id: 'sticker', label: 'Sticker' }),
  Object.freeze({ id: 'file', label: 'Tệp' }),
  Object.freeze({ id: 'video', label: 'Video' }),
  Object.freeze({ id: 'audio', label: 'Âm thanh' }),
  Object.freeze({ id: 'document', label: 'Tài liệu' }),
  Object.freeze({ id: 'archive', label: 'Tệp nén' }),
]);

const GROUP_MANAGEMENT_OPTIONS = Object.freeze([
  Object.freeze({ key: 'allowMembersEditInfo', icon: 'fa-pen-to-square', label: 'Cho phép thành viên đổi tên, ảnh và hình nền nhóm', description: 'Thành viên có thể đổi tên, ảnh đại diện hoặc hình nền nhóm.' }),
  Object.freeze({ key: 'allowPinMessages', icon: 'fa-thumbtack', label: 'Cho phép ghim tin nhắn', description: 'Thành viên được ghim tin nhắn để xem lại nhanh.' }),
  Object.freeze({ key: 'allowMessages', icon: 'fa-message', label: 'Cho phép gửi tin nhắn', description: 'Thành viên được gửi tin nhắn và tệp.' }),
  Object.freeze({ key: 'allowPolls', icon: 'fa-square-poll-vertical', label: 'Cho phép thành viên tạo bình chọn', description: 'Thành viên được tạo bình chọn trong nhóm.' }),
  Object.freeze({ key: 'approveMembers', icon: 'fa-user-check', label: 'Phê duyệt thành viên mới', description: 'Thành viên mới cần được quản trị viên duyệt.' }),
  Object.freeze({ key: 'newMemberHistory', icon: 'fa-clock-rotate-left', label: 'Cho thành viên mới đọc tin nhắn gần nhất', description: 'Thành viên mới được xem phần lịch sử gần nhất.' }),
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
  if (type === 'sticker' || file?.ext === 'sticker') return 'fa-face-smile';
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
  return message.file || ((message.type === 'image' || message.type === 'sticker') && message.image ? {
    name: 'Hình ảnh',
    mime: 'image/*',
    size: 'Hình ảnh',
    url: message.image,
  } : null);
}

function isStickerMessage(message) {
  return Boolean(message && (
    message.type === 'sticker'
    || message.sticker?.id
    || message.sticker?.stickerId
    || message.file?.ext === 'sticker'
  ));
}

function isPollMessage(message) {
  return Boolean(message && (message.type === 'poll' || message.poll || message.pollData));
}

function pollEventForMessage(message) {
  const event = message?.pollEvent || message?.systemEvent;
  return normalizePollEvent(event);
}

function projectDemoPollMessages(messages = [], members = []) {
  const source = Array.isArray(messages) ? messages : [];
  const eventsByPollId = new Map();
  source.forEach(message => {
    const event = pollEventForMessage(message);
    if (!event?.pollId) return;
    const events = eventsByPollId.get(event.pollId) || [];
    events.push({ message, event });
    eventsByPollId.set(event.pollId, events);
  });
  eventsByPollId.forEach(events => events.sort((first, second) => (
    (Date.parse(first.message?.createdAt || first.event.createdAt || '') || 0)
      - (Date.parse(second.message?.createdAt || second.event.createdAt || '') || 0)
  )));

  const projected = source.map(message => {
    if (!isPollMessage(message)) return message;
    const poll = normalizePoll(message.poll || message.pollData);
    if (!poll) return message;
    const events = eventsByPollId.get(poll.id) || [];
    let nextPoll = poll;
    events.forEach(({ message: eventMessage, event }) => {
      nextPoll = applyPollEvent(
        nextPoll,
        event,
        eventMessage.senderId || event.actorId,
        Number(eventMessage.seq) || 0,
        members,
      );
    });
    const latest = events.at(-1);
    const latestEvent = latest?.event;
    return {
      ...message,
      poll: nextPoll,
      text: nextPoll.question,
      ...(latestEvent ? { action: latestEvent.action } : {}),
      ...(latestEvent ? {
        pollActivity: latestEvent,
        pollActivityAt: latest.message.createdAt || latestEvent.createdAt || message.createdAt,
        pollActivityActorId: latest.message.senderId || latestEvent.actorId || '',
        pollActivityActorName: latest.message.senderName || latestEvent.actorName || '',
      } : {}),
    };
  });
  const movedPolls = projected.filter(message => (
    isPollMessage(message)
      && Date.parse(message.pollActivityAt || '') > Date.parse(message.createdAt || '')
  ));
  return movedPolls.length > 0
    ? [...projected.filter(message => !movedPolls.includes(message)), ...movedPolls]
    : projected;
}

function messageNotificationActorId(message) {
  return message?.pollActivityActorId || message?.senderId || message?.raw?.from || message?.raw?.head?.['x-sender-id'] || '';
}

function messageNotificationSequence(message) {
  return Math.max(Number(message?.pollActivitySeq) || 0, Number(message?.seq) || 0);
}

function replyMetadataForMessage(message, fallbackSenderName = '') {
  const attachment = attachmentForMessage(message);
  return {
    id: message?.id,
    senderId: messageSenderId(message),
    senderName: message?.senderName || fallbackSenderName || (message?.sender === 'outgoing' ? 'Bạn' : 'Thành viên'),
    text: message?.text || (attachment ? messageContentLabel(message) : ''),
    type: message?.type || '',
    fileName: attachment?.name || '',
    fileMime: attachment?.mime || '',
    voiceDuration: Number(message?.voiceDuration) || 0,
  };
}

function replyMetadataForTransport(reply, accounts = []) {
  if (!reply || typeof reply !== 'object' || Array.isArray(reply)) return null;
  const senderId = messageSenderId(reply);
  const account = findAccountByIdentities(accounts, [
    senderId,
    reply.senderId,
    reply.uid,
    reply.tinodeUid,
    reply.senderName,
  ]);
  return {
    id: reply.id,
    senderId,
    senderName: account ? mentionCanonicalText(account) : senderId,
    text: reply.text || '',
    type: reply.type || '',
    fileName: reply.fileName || '',
    fileMime: reply.fileMime || '',
    voiceDuration: Number(reply.voiceDuration) || 0,
  };
}

function messageSenderId(message) {
  return String(message?.senderId || message?.raw?.from || message?.raw?.head?.['x-sender-id'] || '');
}

function messageSenderName(message) {
  return message?.senderName || (message?.sender === 'outgoing' ? 'Bạn' : 'Thành viên');
}

function reactionUserRecords(reactionUsers = {}, selectedEmoji = 'all') {
  const grouped = new Map();
  Object.entries(reactionUsers || {}).forEach(([emoji, users]) => {
    if (selectedEmoji !== 'all' && emoji !== selectedEmoji) return;
    (Array.isArray(users) ? users : []).forEach(user => {
      const id = String(user?.id || user?.uid || '').trim();
      if (!id) return;
      const previous = grouped.get(id) || { ...user, id, emojis: [] };
      if (!previous.emojis.includes(emoji)) previous.emojis.push(emoji);
      if (!previous.name && user?.name) previous.name = user.name;
      if (!previous.avatar && user?.avatar) previous.avatar = user.avatar;
      grouped.set(id, previous);
    });
  });
  return [...grouped.values()];
}

function reactionEmojiCounts(reactionUsers = {}) {
  return Object.fromEntries(Object.entries(reactionUsers || {})
    .map(([emoji, users]) => [emoji, Array.isArray(users) ? users.length : 0])
    .filter(([, count]) => count > 0));
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
    if (!message || ['system', 'friend_event', 'call'].includes(message.type) || isStickerMessage(message)) return;
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

function TinodeImagePreview({ source, alt, className = '', copy = { t: value => value }, style }) {
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
      style={style}
      loading="lazy"
      draggable="false"
      onError={() => setFailed(true)}
    />
  );
}

function ImageViewer({ source, file = null, message = null, copy = { t: value => value }, onClose, onDownload, onShare }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const stageRef = useRef(null);
  const dragRef = useRef(null);

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

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
  }, [source]);

  useEffect(() => {
    if (zoom <= 1) setPan({ x: 0, y: 0 });
  }, [zoom]);

  const changeZoom = amount => {
    setZoom(previous => Math.min(3, Math.max(0.5, Number((previous + amount).toFixed(2)))));
  };

  const clampPan = useCallback(nextPan => {
    const stage = stageRef.current;
    const image = stage?.querySelector('img.image-viewer-image');
    if (!stage || !image || zoom <= 1) return { x: 0, y: 0 };
    const stageStyles = window.getComputedStyle(stage);
    const contentWidth = Math.max(0, stage.clientWidth - parseFloat(stageStyles.paddingLeft) - parseFloat(stageStyles.paddingRight));
    const contentHeight = Math.max(0, stage.clientHeight - parseFloat(stageStyles.paddingTop) - parseFloat(stageStyles.paddingBottom));
    const maxX = Math.max(0, (image.offsetWidth * zoom - contentWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * zoom - contentHeight) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, Number(nextPan.x) || 0)),
      y: Math.min(maxY, Math.max(-maxY, Number(nextPan.y) || 0)),
    };
  }, [zoom]);

  useEffect(() => {
    setPan(previous => clampPan(previous));
  }, [clampPan]);

  const handlePointerDown = event => {
    if (zoom <= 1 || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setIsDragging(true);
  };

  const handlePointerMove = event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setPan(clampPan({
      x: drag.panX + event.clientX - drag.startX,
      y: drag.panY + event.clientY - drag.startY,
    }));
  };

  const handlePointerUp = event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setIsDragging(false);
  };

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
        <div
          ref={stageRef}
          className={`image-viewer-stage ${zoom > 1 ? 'pannable' : ''} ${isDragging ? 'dragging' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <TinodeImagePreview
            source={source}
            alt={copy.t('Ảnh đính kèm')}
            copy={copy}
            className="image-viewer-image"
            style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
          />
        </div>
        <div className="image-viewer-toolbar" role="toolbar" aria-label={copy.t('Công cụ ảnh')}>
          <button type="button" onClick={() => changeZoom(-0.25)} disabled={zoom <= 0.5} title={copy.t('Thu nhỏ')} aria-label={copy.t('Thu nhỏ')}>
            <i className="fa-solid fa-magnifying-glass-minus" aria-hidden="true"></i>
          </button>
          <button type="button" className="image-viewer-zoom-value" onClick={() => setZoom(1)} title={copy.t('Đặt lại kích thước')} aria-label={copy.t('Đặt lại kích thước')}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={() => changeZoom(0.25)} disabled={zoom >= 3} title={copy.t('Phóng to')} aria-label={copy.t('Phóng to')}>
            <i className="fa-solid fa-magnifying-glass-plus" aria-hidden="true"></i>
          </button>
          <span className="image-viewer-toolbar-divider" aria-hidden="true"></span>
          <button type="button" onClick={() => onShare?.(file || { url: source }, message)} disabled={!source || !message} title={copy.t('Chia sẻ tin nhắn')} aria-label={copy.t('Chia sẻ tin nhắn')}>
            <i className="fa-solid fa-share-nodes" aria-hidden="true"></i>
          </button>
          <button type="button" onClick={() => onDownload?.(file || { url: source })} disabled={!source} title={copy.t('Tải xuống')} aria-label={copy.t('Tải xuống')}>
            <i className="fa-solid fa-download" aria-hidden="true"></i>
          </button>
        </div>
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

function ensureDefaultChatbotConversation(conversations, { accountSession = 0, useTinode = false } = {}) {
  const source = conversations && typeof conversations === 'object' && !Array.isArray(conversations)
    ? conversations
    : {};
  const existing = source[CHATBOT_ACCOUNT.id];
  const existingMessages = roomMessages(existing);
  const hasWelcomeMessage = existingMessages.some(message => message?.id === 'bot-welcome' || message?.isWelcome);
  const hasRequiredTinodeTopic = !useTinode || Boolean(existing?.tinodeTopic);
  if (existing?.isChatbot && hasWelcomeMessage && hasRequiredTinodeTopic) return source;

  const fallback = createChatbotConversation(existingMessages, {
    accountSession: existing?.accountSession ?? accountSession,
    useTinode: Boolean(existing?.tinodeTopic || useTinode),
  });
  if (!existing) return ensureConversationEntry(source, CHATBOT_ACCOUNT.id, fallback);

  return {
    ...source,
    [CHATBOT_ACCOUNT.id]: {
      ...fallback,
      ...existing,
      id: CHATBOT_ACCOUNT.id,
      name: CHATBOT_ACCOUNT.name,
      isGroup: false,
      isChatbot: true,
      avatarHtml: existing.avatarHtml || fallback.avatarHtml,
      avatarClass: existing.avatarClass || fallback.avatarClass,
      membersCount: existing.membersCount || fallback.membersCount,
      description: existing.description || fallback.description,
      members: roomMembers(existing).length ? existing.members : fallback.members,
      participantIds: roomParticipantIds(existing).length ? existing.participantIds : fallback.participantIds,
      tinodeTopic: existing.tinodeTopic || fallback.tinodeTopic,
      accountSession: existing.accountSession ?? fallback.accountSession,
      messages: fallback.messages,
      lastMsg: existing.lastMsg || fallback.lastMsg,
      time: existing.time || fallback.time,
      updatedAt: existing.updatedAt || fallback.updatedAt,
    },
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
  if (message.action === 'member_approved') {
    if (message.senderId === viewerId) return `Bạn đã duyệt ${targetNames.join(', ')} vào nhóm`;
    if (targetIds.includes(viewerId)) return `${actorName} đã duyệt bạn vào nhóm`;
    return `${actorName} đã duyệt ${targetNames.join(', ')} vào nhóm`;
  }
  if (message.action === 'member_pending') {
    return `${actorName} đã gửi yêu cầu thêm ${targetNames.join(', ')} vào nhóm`;
  }
  if (message.action === 'member_rejected') {
    return `${actorName} đã từ chối ${targetNames.join(', ')} vào nhóm`;
  }
  if (message.action === 'group_role_changed') {
    const role = normalizeGroupRole(message.role || message.groupRole);
    const actorText = message.senderId === viewerId ? 'Bạn đã' : `${actorName} đã`;
    return role === 'ADMIN'
      ? `${actorText} bổ nhiệm ${targetNames.join(', ')} làm phó nhóm`
      : `${actorText} thu hồi quyền phó nhóm của ${targetNames.join(', ')}`;
  }
  if (message.action === 'member_joined') {
    const joinedName = targetNames[0] || actorName;
    return message.senderId === viewerId || targetIds.includes(viewerId)
      ? 'Bạn đã tham gia nhóm'
      : `${joinedName} đã tham gia nhóm`;
  }
  if (message.action === 'member_left') {
    const replacementName = String(message.replacementName || message.systemEvent?.replacementName || '').trim();
    const leaveText = message.senderId === viewerId ? 'Bạn đã rời khỏi nhóm' : `${actorName} đã rời khỏi nhóm`;
    return replacementName
      ? `${leaveText}. ${replacementName} đã trở thành trưởng nhóm mới`
      : leaveText;
  }
  if (message.action === 'group_created') {
    return message.senderId === viewerId ? 'Bạn đã tạo nhóm' : `${actorName} đã tạo nhóm`;
  }
  if (message.action === 'message_pinned' || message.action === 'message_unpinned') {
    const pinText = message.action === 'message_pinned' ? 'đã ghim tin nhắn' : 'đã bỏ ghim tin nhắn';
    const preview = String(message.messagePreview || message.systemEvent?.messagePreview || '').trim();
    const actorText = message.senderId === viewerId ? 'Bạn' : actorName;
    return preview ? `${actorText} ${pinText}: “${preview}”` : `${actorText} ${pinText}`;
  }
  if (message.action === 'group_dissolved') {
    return message.senderId === viewerId
      ? 'Bạn đã giải tán nhóm'
      : `${actorName} đã giải tán nhóm`;
  }
  if (message.action === 'group_name_changed') {
    const event = message.systemEvent || message;
    const nextName = String(event.newName || event.name || '').trim();
    const actorText = message.senderId === viewerId ? 'Bạn đã' : `${actorName} đã`;
    return nextName ? `${actorText} đổi tên nhóm thành “${nextName}”` : `${actorText} đổi tên nhóm`;
  }
  if (message.action === 'group_avatar_changed') {
    const actorText = message.senderId === viewerId ? 'Bạn đã' : `${actorName} đã`;
    return `${actorText} đổi ảnh đại diện nhóm`;
  }
  if (message.action === 'group_chatbot_enabled') {
    const actorText = message.senderId === viewerId ? 'Bạn đã' : `${actorName} đã`;
    return `${actorText} bật ViChat AI trong nhóm`;
  }
  if (message.action === 'group_settings_changed') {
    const actorText = message.senderId === viewerId ? 'Bạn đã' : `${actorName} đã`;
    return `${actorText} cập nhật quyền của nhóm`;
  }
  if (message.action === 'conversation_background_changed') {
    const actorText = message.senderId === viewerId ? 'Bạn đã' : `${actorName} đã`;
    const isGroupBackground = Boolean(message.isGroup || message.systemEvent?.isGroup);
    return message.backgroundUrl || message.systemEvent?.backgroundUrl
      ? `${actorText} đổi hình nền ${isGroupBackground ? 'nhóm' : 'cuộc trò chuyện'}`
      : `${actorText} xóa hình nền ${isGroupBackground ? 'nhóm' : 'cuộc trò chuyện'}`;
  }
  if (message.action === 'poll_vote') {
    const actorText = message.senderId === viewerId ? 'Bạn' : actorName;
    return `${actorText} đã bình chọn`;
  }
  if (message.action === 'poll_option_added') {
    const actorText = message.senderId === viewerId ? 'Bạn' : actorName;
    const optionText = String(message.pollEvent?.optionText || message.systemEvent?.optionText || '').trim();
    return optionText ? `${actorText} đã thêm phương án “${optionText}”` : `${actorText} đã thêm một phương án`;
  }
  if (message.action === 'poll_locked') {
    const actorText = message.senderId === viewerId ? 'Bạn' : actorName;
    return `${actorText} đã khóa bình chọn`;
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

function messageSearchSenderId(value) {
  return String(value?.senderId || value?.sender_id || value?.tinodeUid || value?.tinode_uid || value?.uid || value?.id || '').trim();
}

function messageSearchTypeFor(message) {
  if (!message) return 'text';
  if (isStickerMessage(message)) return 'sticker';
  const mime = String(message.file?.mime || '').toLowerCase();
  const name = String(message.file?.name || '').toLowerCase();
  if (message.type === 'image' || mime.startsWith('image/') || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/.test(name)) return 'image';
  if (message.type === 'file' && mime.startsWith('video/')) return 'video';
  if (message.type === 'file' && mime.startsWith('audio/')) return 'audio';
  if (message.type === 'file' && /(?:pdf|word|excel|powerpoint|spreadsheet|^text\/)/i.test(mime)) return 'document';
  if (message.type === 'file') return 'file';
  return message.type || 'text';
}

function messageSearchMatchesLocal(message, { query = '', senderId = 'all', type = 'all', fromDate = '', toDate = '' } = {}) {
  if (!message) return false;
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase('vi');
  if (normalizedQuery && !`${message.text || ''} ${message.senderName || ''} ${message.file?.name || ''}`.toLocaleLowerCase('vi').includes(normalizedQuery)) return false;
  if (senderId !== 'all' && messageSearchSenderId(message) !== String(senderId)) return false;
  const actualType = messageSearchTypeFor(message);
  if (type !== 'all') {
    if (type === 'image' && actualType !== 'image') return false;
    else if (type === 'sticker' && actualType !== 'sticker') return false;
    else if (type === 'file' && ['text', 'image', 'sticker'].includes(actualType)) return false;
    else if (!['image', 'file'].includes(type) && actualType !== type) return false;
  }
  const timestamp = Date.parse(String(message.createdAt || '')) || 0;
  if (fromDate && (!timestamp || timestamp < new Date(`${fromDate}T00:00:00`).getTime())) return false;
  if (toDate && (!timestamp || timestamp > new Date(`${toDate}T23:59:59.999`).getTime())) return false;
  return true;
}

function normalizeHistorySearchItem(item) {
  const source = item && typeof item === 'object' ? item : {};
  const createdAt = String(source.createdAt || '').trim();
  return {
    ...source,
    id: String(source.id || `${source.senderId || 'message'}-${source.seq || Date.now()}`),
    seq: Number(source.seq) || 0,
    senderId: String(source.senderId || '').trim(),
    senderName: String(source.senderName || source.senderId || 'Thành viên'),
    text: String(source.text || ''),
    type: String(source.type || 'text'),
    createdAt,
    time: createdAt ? new Date(createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '',
    file: source.file
      ? { ...source.file, url: normalizeTinodeMediaUrl(source.file.url || '') }
      : undefined,
  };
}

function roomParticipantIds(room) {
  return Array.isArray(room?.participantIds) ? room.participantIds : [];
}

function groupActiveMembers(room, accounts) {
  if (!room?.isGroup) return [];
  const participantMembers = roomParticipantIds(room).map(identity => {
    const account = findAccount(accounts, identity);
    // Chatmgt snapshots list only active Account members. Do not turn an
    // unknown/stale participant ID into a selectable replacement owner.
    if (room.managementSnapshot) return account;
    return account || { id: identity, name: identity };
  }).filter(Boolean);
  const members = [
    ...roomMembers(room),
    ...participantMembers,
  ];
  return members.reduce((activeMembers, member) => {
    const identity = member?.id || member?.uid || member?.tinodeUid || member?.tinode_uid || member?.name;
    const account = findAccount(accounts, identity) || member;
    const id = String(
      account?.id || account?.uid || account?.tinodeUid || account?.tinode_uid || identity || '',
    ).trim();
    if (
      !id
      || activeMembers.some(candidate => candidate.id === id || identitiesOverlap(candidate, account))
    ) return activeMembers;
    activeMembers.push({
      ...member,
      ...account,
      id,
      name: account?.name || member?.name || id,
      avatar: account?.avatar || member?.avatar || '',
    });
    return activeMembers;
  }, []);
}

function applyGroupRoleEventToRoom(room, event) {
  if (!room?.isGroup || event?.action !== 'group_role_changed') return room;
  const role = normalizeGroupRole(event.role || event.groupRole);
  const targets = [
    ...(Array.isArray(event.targets) ? event.targets : []),
    ...(event.targetId ? [{ id: event.targetId, accountId: event.targetAccountId }] : []),
  ].filter(Boolean);
  if (!['ADMIN', 'MEMBER'].includes(role) || targets.length === 0) return room;
  let changed = false;
  const members = roomMembers(room).map(member => {
    const matched = targets.some(target => (
      (target.accountId && identitiesOverlap(member, { id: target.accountId }))
      || (target.id && identitiesOverlap(member, { id: target.id }))
      || (target.uid && identitiesOverlap(member, { id: target.uid }))
      || (target.tinodeUid && identitiesOverlap(member, { id: target.tinodeUid }))
    ));
    if (!matched || member.groupRole === role && member.group_role === role) return member;
    changed = true;
    return { ...member, groupRole: role, group_role: role };
  });
  return changed ? { ...room, members } : room;
}

function groupOwnerReplacementMembers(room, accounts, currentUser) {
  const administrator = resolveGroupAdministrator(room, accounts);
  return groupActiveMembers(room, accounts).filter(member => (
    !identitiesOverlap(member, currentUser)
    && !identitiesOverlap(member, administrator)
  ));
}

function roomFriendEvents(room) {
  return Array.isArray(room?.friendEvents) ? room.friendEvents : [];
}

function accountForIdentity(accounts, identity) {
  return findAccountByIdentities(accounts, identity) || null;
}

function personalizeMessageForViewer(message, accounts) {
  if (!message) return message;
  const sender = accountForIdentity(accounts, [
    message.senderId,
    message.raw?.from,
    message.raw?.head?.['x-sender-id'],
    message.senderName,
  ]);
  const replySender = accountForIdentity(accounts, [
    message.replyTo?.senderId,
    message.replyTo?.uid,
    message.replyTo?.senderName,
  ]);
  const reactionUsers = Object.fromEntries(Object.entries(message.reactionUsers || {}).map(([emoji, users]) => [
    emoji,
    (Array.isArray(users) ? users : []).map(user => {
      const account = accountForIdentity(accounts, [
        user?.id,
        user?.uid,
        user?.tinodeUid,
        user?.tinode_uid,
        user?.name,
      ]);
      return account ? {
        ...user,
        name: account.name,
        nickname: account.nickname || '',
        avatar: isAccountManaged(account) ? (account.avatar || '') : (account.avatar || user.avatar || ''),
      } : user;
    }),
  ]));
  if (!sender && !replySender && Object.keys(reactionUsers).length === 0) return message;
  return {
    ...message,
    ...(sender ? {
      senderName: sender.name,
      avatar: isAccountManaged(sender) ? (sender.avatar || '') : (sender.avatar || message.avatar || ''),
    } : {}),
    ...(replySender && message.replyTo ? {
      replyTo: {
        ...message.replyTo,
        senderId: message.replyTo.senderId
          || replySender.tinodeUid
          || replySender.tinode_uid
          || replySender.uid
          || replySender.id
          || '',
        senderName: replySender.name,
        avatar: isAccountManaged(replySender)
          ? (replySender.avatar || '')
          : (replySender.avatar || message.replyTo.avatar || ''),
      },
    } : {}),
    ...(Object.keys(reactionUsers).length > 0 ? { reactionUsers } : {}),
  };
}

function personalizeConversationForViewer(room, accounts, viewer) {
  if (!room) return room;
  const members = roomMembers(room).map(member => {
    const account = accountForIdentity(accounts, [
      member?.id,
      member?.uid,
      member?.tinodeUid,
      member?.tinode_uid,
      member?.name,
    ]);
    if (!account) return member;
    return {
      ...member,
      name: account.name || member.name,
      defaultName: account.defaultName || member.defaultName || member.name,
      default_name: account.default_name || member.default_name || member.name,
      nickname: account.nickname || '',
      avatar: isAccountManaged(account) ? (account.avatar || '') : (account.avatar || member.avatar || ''),
      online: member.online,
    };
  });
  const messages = roomMessages(room).map(message => personalizeMessageForViewer(message, accounts));
  const friendEvents = roomFriendEvents(room).map(message => personalizeMessageForViewer(message, accounts));
  const peer = !room.isGroup && !room.isChatbot
    ? members.find(member => !identitiesOverlap(member, viewer))
    : null;
  const originalMembers = roomMembers(room);
  const originalMessages = roomMessages(room);
  const originalFriendEvents = roomFriendEvents(room);
  const nextName = peer ? peer.name || room.name : room.name;
  const nextAvatarUrl = peer
    ? (isAccountManaged(peer) ? (peer.avatar || '') : (peer.avatar || room.avatarUrl || ''))
    : room.avatarUrl;
  const changed = members.length !== originalMembers.length
    || members.some((member, index) => member !== originalMembers[index])
    || messages.length !== originalMessages.length
    || messages.some((message, index) => message !== originalMessages[index])
    || friendEvents.length !== originalFriendEvents.length
    || friendEvents.some((message, index) => message !== originalFriendEvents[index])
    || nextName !== room.name
    || nextAvatarUrl !== room.avatarUrl;
  if (!changed) return room;
  return {
    ...room,
    members,
    messages,
    friendEvents,
    ...(peer ? { name: nextName, avatarUrl: nextAvatarUrl } : {}),
  };
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
  return roomParticipantIds(room).includes(viewerId);
}

function isConversationHiddenAfterDelete(room) {
  const deletedAt = parseTimestamp(room?.deletedAt);
  if (!deletedAt) return false;
  const latestMessageAt = Math.max(0, ...roomMessages(room).map(message => messageTimestamp(message)));
  const latestActivityAt = Math.max(latestMessageAt, conversationActivityTimestamp(room));
  return latestActivityAt <= deletedAt;
}

function conversationTimestamp(room) {
  return conversationActivityTimestamp(room);
}

function collectFriendshipRecords(conversations, viewerId) {
  const requests = new Map();
  const responses = new Map();
  safeConversationValues(conversations).forEach(room => {
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
  return messageActivityTimestamp(message);
}

function messagePayloadKey(message) {
  return [
    message?.type || 'text',
    message?.text || '',
    message?.file?.name || '',
    message?.image || '',
    message?.sticker?.id || message?.sticker?.stickerId || '',
    message?.poll?.id || message?.pollData?.id || '',
  ].join('|');
}

function editHistoryEntryKey(entry) {
  const eventId = String(entry?.eventId || '').trim();
  if (eventId) return `event:${eventId}`;
  const sequence = Number(entry?.seq) || 0;
  if (sequence > 0) return `seq:${sequence}`;
  return [
    'version',
    String(entry?.editedAt || ''),
    String(entry?.text || ''),
    JSON.stringify(Array.isArray(entry?.mentions) ? entry.mentions : []),
  ].join(':');
}

function editHistoryEntriesEqual(first, second) {
  const firstEventId = String(first?.eventId || '').trim();
  const secondEventId = String(second?.eventId || '').trim();
  if (firstEventId && secondEventId && firstEventId === secondEventId) return true;
  const firstSeq = Number(first?.seq) || 0;
  const secondSeq = Number(second?.seq) || 0;
  if (firstSeq > 0 && secondSeq > 0 && firstSeq === secondSeq) return true;
  return editHistoryEntryKey(first) === editHistoryEntryKey(second);
}

function editStateTimestamp(message) {
  return Math.max(
    Date.parse(String(message?.editedAt || '')) || 0,
    ...(Array.isArray(message?.editHistory)
      ? message.editHistory.map(entry => Date.parse(String(entry?.editedAt || '')) || 0)
      : []),
  );
}

function compareEditState(previous, incoming) {
  const previousEditSeq = Math.max(
    0,
    ...(Array.isArray(previous?.editHistory) ? previous.editHistory.map(entry => Number(entry?.seq) || 0) : []),
  );
  const incomingEditSeq = Math.max(
    0,
    ...(Array.isArray(incoming?.editHistory) ? incoming.editHistory.map(entry => Number(entry?.seq) || 0) : []),
  );
  // Server-assigned event sequences are authoritative even when client
  // clocks differ between devices.
  if (previousEditSeq !== incomingEditSeq) return incomingEditSeq - previousEditSeq;
  const previousTime = editStateTimestamp(previous);
  const incomingTime = editStateTimestamp(incoming);
  if (previousTime !== incomingTime) return incomingTime - previousTime;
  const previousSeq = Number(previous?.seq) || 0;
  const incomingSeq = Number(incoming?.seq) || 0;
  if (previousSeq !== incomingSeq) return incomingSeq - previousSeq;
  return (Array.isArray(incoming?.editHistory) ? incoming.editHistory.length : 0)
    - (Array.isArray(previous?.editHistory) ? previous.editHistory.length : 0);
}

function mergeEditState(previous = {}, incoming = {}) {
  const previousHistory = Array.isArray(previous.editHistory) ? previous.editHistory : [];
  const incomingHistory = Array.isArray(incoming.editHistory) ? incoming.editHistory : [];
  const previousEdited = Boolean(previous.edited || previousHistory.length > 0);
  const incomingEdited = Boolean(incoming.edited || incomingHistory.length > 0);
  if (!previousEdited && !incomingEdited) return {};
  const history = [...previousHistory, ...incomingHistory]
    .reduce((entries, entry) => {
      const existingIndex = entries.findIndex(existing => editHistoryEntriesEqual(existing, entry));
      if (existingIndex < 0) return [...entries, entry];
      const existing = entries[existingIndex];
      const entryIsRicher = Boolean(
        (entry?.eventId && !existing?.eventId)
        || (Number(entry?.seq) > 0 && !(Number(existing?.seq) > 0)),
      );
      if (!entryIsRicher) return entries;
      return entries.map((current, index) => index === existingIndex ? entry : current);
    }, [])
    .sort((first, second) => (
      (Date.parse(first?.editedAt || '') || 0) - (Date.parse(second?.editedAt || '') || 0)
      || (Number(first?.seq) || 0) - (Number(second?.seq) || 0)
    ));

  // A delayed Tinode snapshot may still contain the pre-edit text. Keep the
  // state with the newest accepted edit while retaining history from both
  // snapshots so realtime echoes cannot roll the UI backward.
  const current = compareEditState(previous, incoming) >= 0 ? incoming : previous;
  if (!previousEdited || (incomingEdited && current === incoming)) {
    return {
      edited: true,
      ...(current.editedAt || incoming.editedAt || previous.editedAt ? { editedAt: current.editedAt || incoming.editedAt || previous.editedAt } : {}),
      editHistory: history,
    };
  }
  return {
    text: previous.text,
    mentions: previous.mentions,
    edited: true,
    editedAt: current.editedAt || previous.editedAt || incoming.editedAt,
    editHistory: history,
  };
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
          sticker: undefined,
          replyTo: null,
          reactions: {},
          reactionUsers: {},
        }
        : {
          ...previous,
          ...message,
          type: previous.type === 'sticker' || message.type === 'sticker'
            ? 'sticker'
            : previous.type === 'image' || message.type === 'image' ? 'image' : message.type,
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
          sticker: message.sticker || previous.sticker,
          ...mergeEditState(previous, message),
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

function conversationFallbackId(value) {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
    ? String(value).trim()
    : '';
}

function safeNormalizeConversationForRender(conversation, fallbackId = '') {
  const id = conversationFallbackId(fallbackId);
  try {
    const normalized = normalizeConversationShape(conversation);
    const normalizedId = normalized.id || id;
    return normalizedId ? { ...normalized, id: normalizedId } : normalized;
  } catch (error) {
    console.error('ViChat: conversation normalization failed', error);
    if (!id) return null;
    return {
      id,
      isGroup: false,
      isChatbot: false,
      managementSnapshot: false,
      name: '',
      avatarUrl: '',
      membersCount: '',
      description: '',
      admin: '',
      adminId: '',
      members: [],
      participantIds: [],
      messages: [],
      friendEvents: [],
      lastMsg: '',
      time: '',
      updatedAt: '',
      deletedAt: '',
      notificationMutedUntil: null,
      blockedByViewer: false,
      blockedByPeer: false,
      directMessagingBlocked: false,
      directBlockExplicit: false,
      badge: 0,
      pinned: false,
    };
  }
}

function safeConversationEntries(conversations) {
  if (!conversations || typeof conversations !== 'object' || Array.isArray(conversations)) return [];
  try {
    return Object.entries(conversations)
      .map(([id, room]) => [id, safeNormalizeConversationForRender(room, id)])
      .filter(([, room]) => room?.id);
  } catch (error) {
    console.error('ViChat: conversation map normalization failed', error);
    return [];
  }
}

function safeConversationValues(conversations) {
  return safeConversationEntries(conversations).map(([, room]) => room);
}

function safeConversationList(conversations) {
  if (!Array.isArray(conversations)) return [];
  return conversations
    .map((room, index) => safeNormalizeConversationForRender(room, room?.id || `conversation-${index}`))
    .filter(room => room?.id);
}

function conversationActivitySnapshot(room) {
  return {
    lastMsg: room?.lastMsg || '',
    time: room?.time || '',
    updatedAt: room?.updatedAt || '',
  };
}

function removeMessageFromConversation(room, message, fallbackActivity = null) {
  if (!room || !message) return room;
  const messages = roomMessages(room).filter(item => (
    item.id !== message.id
    && !(Number.isFinite(message.seq) && Number.isFinite(item?.seq) && item.seq === message.seq)
  ));
  const latestMessage = latestConversationMessage(messages);
  return {
    ...room,
    messages,
    lastMsg: attachmentConversationPreview(latestMessage) || latestMessage?.text || fallbackActivity?.lastMsg || '',
    time: latestMessage?.time || fallbackActivity?.time || '',
    updatedAt: latestMessage?.createdAt || fallbackActivity?.updatedAt || room.updatedAt,
  };
}

function mergeTinodeConversation(existing, incoming, { viewerId = '' } = {}) {
  if (!existing) return normalizeConversationShape(incoming);
  const safeExisting = normalizeConversationShape(existing);
  const safeIncoming = normalizeConversationShape(incoming);
  const deletedAt = resolveConversationDeletedAt(safeExisting, safeIncoming);
  const deletedTimestamp = parseTimestamp(deletedAt);
  const visibleAfterDelete = messages => deletedTimestamp
    ? messages.filter(message => messageTimestamp(message) > deletedTimestamp)
    : messages;
  const messages = visibleAfterDelete(
    safeExisting.isChatbot || safeIncoming.isChatbot
      ? mergeChatbotMessages(safeExisting.messages, safeIncoming.messages)
      : mergeTinodeMessages(safeExisting.messages, safeIncoming.messages),
  );
  const friendEvents = visibleAfterDelete(mergeTinodeMessages(safeExisting.friendEvents, safeIncoming.friendEvents));
  const {
    managementOwned,
    incomingManagementSnapshot,
  } = conversationManagementMergePolicy(safeExisting, {
    ...safeIncoming,
    managementSnapshot: safeIncoming.managementSnapshot
      || incoming?.managementSnapshot
      || incoming?.management_snapshot,
  });
  const activity = resolveMergedConversationActivity(safeExisting, safeIncoming, messages);
  const latestAttachmentPreview = attachmentConversationPreview(activity.latestMessage);
  const latestTextPreview = activity.latestMessage?.type === 'poll'
    ? `Bình chọn: ${activity.latestMessage.poll?.question || activity.latestMessage.pollData?.question || activity.latestMessage.text || ''}`
    : activity.latestMessage?.text || '';
  const lastMsg = resolveConversationPreview({
    existingPreview: safeExisting.lastMsg,
    incomingPreview: safeIncoming.lastMsg,
    latestMessagePreview: latestAttachmentPreview || latestTextPreview,
    incomingManagementSnapshot,
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
  const readState = mergeConversationReadState(safeExisting, safeIncoming, { viewerId });
  return {
    ...safeExisting,
    ...safeIncoming,
    isChatbot: safeExisting.isChatbot || safeIncoming.isChatbot,
    managementSnapshot: safeExisting.managementSnapshot || safeIncoming.managementSnapshot,
    deletedAt,
    name: managementOwned && !incomingManagementSnapshot
      ? existingName || incomingName || fallbackName
      : incomingName || existingName || fallbackName,
    avatarHtml: safeIncoming.avatarHtml || safeExisting.avatarHtml,
    // Avatar updates are replace-only. An empty realtime/management snapshot
    // is incomplete metadata, never an implicit delete request.
    avatarUrl: managementOwned
      ? mergeManagementAvatar(safeExisting.avatarUrl, safeIncoming.avatarUrl, {
        incomingManagementSnapshot,
      })
      : (safeIncoming.avatarUrl || safeExisting.avatarUrl),
    description: managementOwned && !incomingManagementSnapshot
      ? safeExisting.description
      : (safeIncoming.description || safeExisting.description),
    admin: managementOwned && !incomingManagementSnapshot
      ? safeExisting.admin
      : (safeIncoming.admin || safeExisting.admin),
    adminId: managementOwned && !incomingManagementSnapshot
      ? safeExisting.adminId
      : (safeIncoming.adminId || safeExisting.adminId),
    groupSettings: managementOwned && !incomingManagementSnapshot
      ? safeExisting.groupSettings
      : (safeIncoming.groupSettings || safeExisting.groupSettings),
    conversationBackground: safeIncoming.conversationBackground !== undefined
      ? safeIncoming.conversationBackground
      : safeExisting.conversationBackground,
    members,
    participantIds: incomingManagementSnapshot ? safeIncoming.participantIds : safeExisting.participantIds,
    pendingMembers: incomingManagementSnapshot ? safeIncoming.pendingMembers : safeExisting.pendingMembers,
    pendingParticipantIds: incomingManagementSnapshot ? safeIncoming.pendingParticipantIds : safeExisting.pendingParticipantIds,
    messages,
    friendEvents,
    ...readState,
    pinned: safeIncoming.pinnedExplicit ? safeIncoming.pinned : safeExisting.pinned,
    pinnedAt: safeIncoming.pinnedExplicit ? (safeIncoming.pinnedAt || null) : safeExisting.pinnedAt,
    pinnedExplicit: safeExisting.pinnedExplicit || safeIncoming.pinnedExplicit,
    blockedByViewer: safeIncoming.directBlockExplicit
      ? safeIncoming.blockedByViewer
      : safeExisting.blockedByViewer,
    blockedByPeer: safeIncoming.directBlockExplicit
      ? safeIncoming.blockedByPeer
      : safeExisting.blockedByPeer,
    directMessagingBlocked: safeIncoming.directBlockExplicit
      ? safeIncoming.directMessagingBlocked
      : safeExisting.directMessagingBlocked,
    directBlockExplicit: safeExisting.directBlockExplicit || safeIncoming.directBlockExplicit,
    lastMsg,
    time: activity.time,
    updatedAt: activity.updatedAt,
  };
}

// Defensive wrapper: if merge crashes due to malformed data from Chatmgt or
// Tinode, return the best safe fallback instead of propagating the exception
// into a React render and triggering the global ErrorBoundary.
function safeMergeTinodeConversation(existing, incoming, options = {}) {
  try {
    const merged = mergeTinodeConversation(existing, incoming, options);
    return safeNormalizeConversationForRender(
      projectPollsWithMembers(merged, merged?.members),
      existing?.id || incoming?.id,
    );
  } catch (mergeError) {
    console.error('ViChat: mergeTinodeConversation failed, using fallback', mergeError);
    const fallback = existing || incoming;
    return safeNormalizeConversationForRender(
      projectPollsWithMembers(fallback, fallback?.members),
      existing?.id || incoming?.id,
    );
  }
}

function tenantLogoSource(src, version) {
  const value = String(src || '').trim();
  const cacheVersion = String(version || '').trim();
  if (!value || !cacheVersion || !/^(https?:|\/\/|\/)/i.test(value)) return value;
  const separator = value.includes('?') ? '&' : '?';
  return `${value}${separator}vichat_logo=${encodeURIComponent(cacheVersion)}`;
}

function TenantLogo({ src, name, version }) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = tenantLogoSource(src, version);

  useEffect(() => {
    setFailed(false);
  }, [resolvedSrc]);

  if (!resolvedSrc || failed) {
    return <i className="fa-solid fa-building" aria-hidden="true"></i>;
  }
  return <img src={resolvedSrc} alt={name || ''} onError={() => setFailed(true)} />;
}

function SafeAvatar({ src, name, className = '' }) {
  const [failed, setFailed] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState('');
  const [mediaVersion, setMediaVersion] = useState(() => tinodeClient.getMediaVersion(src));
  const [sessionRetry, setSessionRetry] = useState(0);

  useEffect(() => {
    const normalizedSource = normalizeTinodeMediaUrl(src);
    return tinodeClient.onEvent(event => {
      if (event.type === 'media-invalidated' && event.url === normalizedSource) {
        setMediaVersion(tinodeClient.getMediaVersion(src));
        return;
      }
      if (shouldRetryProtectedMediaAfterSession(event.type, normalizedSource)) {
        setSessionRetry(previous => previous + 1);
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
  }, [src, mediaVersion, sessionRetry]);

  if (!resolvedSrc || failed) {
    return <span className={`${className} avatar-fallback`} aria-label={name || 'Ảnh đại diện'}>{name?.trim?.().slice(0, 1).toUpperCase() || '?'}</span>;
  }
  return <img src={resolvedSrc} alt={name || 'Ảnh đại diện'} className={className} onError={() => setFailed(true)} />;
}

function GroupRoleBadge({ role, copy = { t: value => value } }) {
  const groupRole = normalizeGroupRole(role);
  if (groupRole === 'MEMBER') return null;
  const isOwner = groupRole === 'OWNER';
  const label = copy.t(isOwner ? 'Trưởng nhóm' : 'Phó nhóm');
  return (
    <span
      className={`group-owner-avatar-badge group-role-avatar-badge group-role-${groupRole.toLowerCase()}`}
      title={label}
      aria-label={label}
      role="img"
    >
      <i className="fa-solid fa-key" aria-hidden="true"></i>
    </span>
  );
}

function MessageReceiptIndicator({ message, copy = { t: value => value }, onOpen }) {
  const receiptUsers = normalizeReceiptUsers(message?.receiptUsers);
  const preview = receiptAvatarPreview(receiptUsers);
  const hasReadUsers = receiptUsers.read.length > 0;
  const hasReceiptUsers = hasReadUsers || receiptUsers.received.length > 0;
  const isRead = message?.deliveryStatus === 'read' || hasReadUsers;
  const statusIcon = message?.deliveryStatus === 'received' ? 'fa-check-double' : 'fa-check';
  const statusClass = isRead ? 'read' : message?.deliveryStatus === 'received' ? 'received' : 'sent';
  const statusTitle = isRead
    ? copy.t('Đã xem')
    : message?.deliveryStatus === 'received' ? copy.t('Đã nhận') : copy.t('Đã gửi');

  if (!hasReceiptUsers) {
    return <i className={`fa-solid ${message?.deliveryStatus === 'read' ? 'fa-check-double' : statusIcon} read-status ${statusClass}`} title={statusTitle}></i>;
  }

  const viewerCount = hasReadUsers ? receiptUsers.read.length : receiptUsers.received.length;
  const viewerLabel = `${statusTitle} ${viewerCount}`;
  return (
    <button
      type="button"
      className={`message-receipt-trigger ${hasReadUsers ? 'read' : 'received'}`}
      title={`${viewerLabel} - ${copy.t('Xem chi tiết')}`}
      aria-label={`${viewerLabel} - ${copy.t('Xem chi tiết')}`}
      onClick={event => {
        event.stopPropagation();
        onOpen?.(message);
      }}
    >
      {hasReadUsers ? (
        <span className="message-receipt-avatar-stack" aria-hidden="true">
          {preview.users.map(user => (
            <SafeAvatar key={user.id} src={user.avatar || ''} name={user.name} className="message-receipt-avatar" />
          ))}
          {preview.overflowCount > 0 && <span className="message-receipt-overflow">5+</span>}
        </span>
      ) : (
        <i className={`fa-solid fa-check-double read-status ${isRead ? 'read' : 'received'}`} aria-hidden="true"></i>
      )}
      {hasReadUsers && <i className="fa-solid fa-check-double read-status read" aria-hidden="true"></i>}
    </button>
  );
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

function MessageReplyPreview({ reply, copy = { t: value => value }, onClick, showIcon = true, showSender = true }) {
  if (!reply) return null;
  const isAudio = isAudioAttachment(reply.file || { name: reply.fileName, mime: reply.fileMime }, reply.type) || Number(reply.voiceDuration) > 0;
  const isSticker = isStickerMessage(reply);
  const isImage = reply.type === 'image' || String(reply.fileMime || reply.file?.mime || '').toLowerCase().startsWith('image/');
  const icon = isAudio ? 'fa-microphone' : isSticker ? 'fa-face-smile' : isImage ? 'fa-image' : reply.fileName ? 'fa-paperclip' : 'fa-quote-left';
  const senderName = typeof reply.senderName === 'string' ? reply.senderName : copy.t('Tin nhắn');
  const replyText = typeof reply.text === 'string'
    ? reply.text.trim()
    : (typeof reply.text === 'number' && Number.isFinite(reply.text) ? String(reply.text) : '');
  const previewContent = (
    <>
      {showIcon && <span className="message-reply-preview-icon"><i className={`fa-solid ${icon}`} aria-hidden="true"></i></span>}
      <span className="message-reply-preview-copy">
        {showSender && <strong>{senderName}</strong>}
        <span>{replyText || copy.t(replyContentLabel(reply))}</span>
      </span>
    </>
  );
  const canJump = typeof onClick === 'function' && reply.id !== undefined && reply.id !== null && String(reply.id);
  if (!canJump) return <div className="message-reply-preview">{previewContent}</div>;
  return (
    <button
      type="button"
      className="message-reply-preview message-reply-preview-action"
      title={`${copy.t('Đi tới tin nhắn')}: ${senderName}`}
      aria-label={`${copy.t('Đi tới tin nhắn')}: ${senderName}`}
      onClick={event => {
        event.stopPropagation();
        onClick(reply);
      }}
    >
      {previewContent}
    </button>
  );
}

function PollMessageCard({
  message,
  viewerIdentities = [],
  groupMembers = [],
  copy = { t: value => value },
  onVote,
  onAddOption,
  onLock,
}) {
  const poll = normalizePoll(message?.poll || message?.pollData);
  const viewerVote = pollViewerIdentities(poll, viewerIdentities);
  const [selectedOptionIds, setSelectedOptionIds] = useState(viewerVote?.optionIds || []);
  const [newOption, setNewOption] = useState('');
  const [isAddingOption, setIsAddingOption] = useState(false);
  const [voterDetailsOptionId, setVoterDetailsOptionId] = useState('');
  const [, setPollClock] = useState(Date.now());
  const closed = pollIsClosed(poll);
  const counts = pollOptionVoteCounts(poll);
  const totalVoters = pollTotalVoters(poll);
  const canLock = pollCanViewerLock(poll, viewerIdentities, groupMembers);
  const showResults = !poll?.settings?.hideResultsUntilVote || Boolean(viewerVote) || closed || canLock;
  const canViewVoters = showResults && !poll?.settings?.hideVoters;
  const maxCount = Math.max(1, ...Object.values(counts));
  const viewerVoteCreatedAt = viewerVote?.createdAt || '';
  const viewerVoteOptionIds = (viewerVote?.optionIds || []).join('|');
  const voterDetailsOption = poll?.options?.find(option => option.id === voterDetailsOptionId) || null;
  const voterDetails = voterDetailsOption
    ? pollVoterDetails(poll, voterDetailsOption.id, groupMembers)
    : null;

  useEffect(() => {
    setSelectedOptionIds(viewerVoteOptionIds ? viewerVoteOptionIds.split('|') : []);
  }, [message?.id, viewerVoteCreatedAt, viewerVoteOptionIds]);

  useEffect(() => {
    setVoterDetailsOptionId('');
  }, [message?.id, poll?.id]);

  useEffect(() => {
    if (!voterDetailsOptionId) return undefined;
    const handleKeyDown = event => {
      if (event.key === 'Escape') setVoterDetailsOptionId('');
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [voterDetailsOptionId]);

  useEffect(() => {
    const expiresAt = Date.parse(poll?.settings?.expiresAt || '');
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return undefined;
    const timer = window.setTimeout(() => setPollClock(Date.now()), expiresAt - Date.now() + 20);
    return () => window.clearTimeout(timer);
  }, [poll?.id, poll?.settings?.expiresAt]);

  if (!poll) return null;

  const toggleOption = optionId => {
    if (closed) return;
    setSelectedOptionIds(previous => {
      if (!poll.settings.allowMultiple) return [optionId];
      return previous.includes(optionId)
        ? previous.filter(id => id !== optionId)
        : [...previous, optionId];
    });
  };

  const submitVote = () => {
    if (!selectedOptionIds.length || closed) return;
    onVote?.(message, selectedOptionIds);
  };

  const submitOption = async event => {
    event.preventDefault();
    const optionText = newOption.trim();
    if (!optionText || isAddingOption || closed) return;
    setIsAddingOption(true);
    try {
      await onAddOption?.(message, optionText);
      setNewOption('');
    } finally {
      setIsAddingOption(false);
    }
  };

  return (
    <div className="poll-message-card">
      <div className="poll-message-heading">
        <span className="poll-message-icon" aria-hidden="true"><i className="fa-solid fa-square-poll-vertical"></i></span>
        <div className="poll-message-heading-copy">
          <strong>{copy.t('Bình chọn')}</strong>
          <small>{poll.creatorName || copy.t('Thành viên')} · {totalVoters} {copy.t('lượt bình chọn')}</small>
        </div>
        {closed && <span className="poll-status-badge"><i className="fa-solid fa-lock"></i>{copy.t('Đã khóa')}</span>}
      </div>
      <h3 className="poll-question">{poll.question}</h3>
      <div className="poll-options" role="group" aria-label={poll.question}>
        {poll.options.map(option => {
          const count = counts[option.id] || 0;
          const selected = selectedOptionIds.includes(option.id);
          const percentage = totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0;
          const canViewOptionVoters = canViewVoters && (groupMembers.length > 0 || count > 0);
          const detailsOpen = voterDetailsOptionId === option.id;
          return (
            <div className={`poll-option-row ${selected ? 'selected' : ''}`} key={option.id}>
              <button
                type="button"
                className={`poll-option ${selected ? 'selected' : ''}`}
                onClick={() => toggleOption(option.id)}
                disabled={closed}
                aria-pressed={selected}
              >
                <span className={`poll-option-marker ${poll.settings.allowMultiple ? 'multiple' : ''}`} aria-hidden="true">
                  {selected && <i className="fa-solid fa-check"></i>}
                </span>
                <span className="poll-option-copy">
                  <span className="poll-option-label">{option.text}</span>
                  {showResults && (
                    <span className="poll-option-progress" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, (count / maxCount) * 100)}%` }}></span>
                    </span>
                  )}
                </span>
                {showResults && !canViewOptionVoters && <strong className="poll-option-count">{count} <small>{percentage}%</small></strong>}
              </button>
              {showResults && canViewOptionVoters && (
                <button
                  type="button"
                  className={`poll-option-count poll-option-details-trigger ${detailsOpen ? 'expanded' : ''}`}
                  onClick={() => setVoterDetailsOptionId(previous => previous === option.id ? '' : option.id)}
                  aria-expanded={detailsOpen}
                  aria-label={`${copy.t('Xem danh sách bình chọn')}: ${option.text}`}
                  title={copy.t('Xem danh sách bình chọn')}
                >
                  {count} <small>{percentage}%</small>
                  <i className={`fa-solid ${detailsOpen ? 'fa-chevron-up' : 'fa-users'}`} aria-hidden="true"></i>
                </button>
              )}
            </div>
          );
        })}
      </div>
      {voterDetailsOption && voterDetails && canViewVoters && (
        <div className="poll-voter-details" aria-live="polite">
          <div className="poll-voter-details-heading">
            <span><i className="fa-solid fa-users" aria-hidden="true"></i>{copy.t('Danh sách bình chọn')}</span>
            <button
              type="button"
              onClick={() => setVoterDetailsOptionId('')}
              aria-label={copy.t('Đóng')}
              title={copy.t('Đóng')}
            ><i className="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </div>
          <p className="poll-voter-details-option">{voterDetailsOption.text}</p>
          {!groupMembers.length && (
            <p className="poll-voter-details-notice">
              <i className="fa-solid fa-circle-info" aria-hidden="true"></i>{copy.t('Chưa tải được danh sách thành viên nhóm; chỉ hiển thị dữ liệu bình chọn đã nhận.')}
            </p>
          )}
          <div className="poll-voter-details-sections">
            {[
              ['selected', 'Đã chọn phương án này', 'Chưa có ai chọn phương án này.', 'fa-check'],
              ['notVoted', 'Chưa bình chọn', 'Mọi thành viên đã bình chọn.', 'fa-hourglass-half'],
              ['other', 'Đã chọn phương án khác', 'Không có thành viên nào chọn phương án khác.', 'fa-shuffle'],
            ].map(([key, label, emptyLabel, icon]) => {
              const users = voterDetails[key] || [];
              return (
                <section className={`poll-voter-details-section poll-voter-details-section-${key}`} key={key}>
                  <div className="poll-voter-details-section-heading">
                    <span><i className={`fa-solid ${icon}`} aria-hidden="true"></i>{copy.t(label)}</span>
                    <strong>{users.length}</strong>
                  </div>
                  <div className="poll-voter-details-list">
                    {users.length > 0 ? users.map((user, index) => (
                      <div className="poll-voter-details-user" key={`${user.actorId || user.id || 'member'}-${index}`}>
                        <SafeAvatar src={user.avatar || ''} name={user.name} className="poll-voter-details-avatar" />
                        <span>{user.name || copy.t('Thành viên')}</span>
                      </div>
                    )) : <p className="poll-voter-details-empty">{copy.t(emptyLabel)}</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
      {!showResults && <p className="poll-hidden-results"><i className="fa-solid fa-eye-slash"></i>{copy.t('Kết quả sẽ hiện sau khi bạn bình chọn')}</p>}
      {poll.settings.allowAddOptions && !closed && (
        <form className="poll-add-option" onSubmit={submitOption}>
          <input
            value={newOption}
            maxLength={POLL_LIMITS.maxOptionLength}
            onChange={event => setNewOption(event.target.value)}
            placeholder={copy.t('Thêm phương án')}
            aria-label={copy.t('Thêm phương án')}
          />
          <button type="submit" disabled={!newOption.trim() || isAddingOption} aria-label={copy.t('Thêm')}>
            <i className={`fa-solid ${isAddingOption ? 'fa-spinner fa-spin' : 'fa-plus'}`}></i>
          </button>
        </form>
      )}
      {!poll.settings.hideVoters && totalVoters > 0 && showResults && (
        <div className="poll-voter-list">
          {Object.entries(poll.votes).slice(0, 8).map(([actorId, vote]) => (
            <span key={actorId} className="poll-voter" title={vote.name || actorId}>
              <SafeAvatar src={vote.avatar || ''} name={vote.name || actorId} />
            </span>
          ))}
          {totalVoters > 8 && <small>+{totalVoters - 8}</small>}
        </div>
      )}
      <div className="poll-message-footer">
        <span>{poll.settings.allowMultiple ? copy.t('Có thể chọn nhiều') : copy.t('Chọn một phương án')}</span>
        <div className="poll-message-actions">
          {canLock && <button type="button" onClick={() => onLock?.(message)}><i className="fa-solid fa-lock"></i>{copy.t('Khóa bình chọn')}</button>}
          <button type="button" className="poll-vote-button" onClick={submitVote} disabled={closed || !selectedOptionIds.length}>
            <i className="fa-solid fa-check"></i>{copy.t('Bình chọn')}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageQuickActions({
  message,
  messageKey,
  copy = { t: value => value },
  messageActionHoverKey,
  messageReactionPickerKey,
  showMessageActions,
  hideMessageActionsLater,
  showMessageReactionPicker,
  hideMessageReactionPickerLater,
  handleMessageAction,
  openMessageMenu,
}) {
  return (
    <div
      className={`message-quick-actions ${messageActionHoverKey === messageKey ? 'message-actions-visible' : ''}`}
      onClick={event => event.stopPropagation()}
      onMouseEnter={() => showMessageActions(messageKey)}
      onMouseLeave={() => hideMessageActionsLater(messageKey)}
    >
      <button
        type="button"
        className="message-action-button"
        title={copy.t('Tráº£ lá»i tin nháº¯n')}
        aria-label={copy.t('Tráº£ lá»i tin nháº¯n')}
        onClick={() => handleMessageAction('reply', message)}
      >
        <i className="fa-solid fa-quote-left" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        className="message-action-button"
        title={copy.t('Chia sáº» tin nháº¯n')}
        aria-label={copy.t('Chia sáº» tin nháº¯n')}
        onClick={() => handleMessageAction('share', message)}
      >
        <i className="fa-solid fa-share" aria-hidden="true"></i>
      </button>
      <div
        className="message-reaction-action"
        onMouseEnter={() => {
          showMessageActions(messageKey);
          showMessageReactionPicker(messageKey);
        }}
        onMouseLeave={() => hideMessageReactionPickerLater(messageKey)}
      >
        <button
          type="button"
          className="message-action-button"
          title={copy.t('Thêm biểu cảm')}
          aria-label={copy.t('Thêm biểu cảm')}
          aria-expanded={messageReactionPickerKey === messageKey}
          onFocus={() => showMessageReactionPicker(messageKey)}
          onClick={() => handleMessageAction('reaction', message, '👍')}
        >
          <i className="fa-regular fa-thumbs-up" aria-hidden="true"></i>
        </button>
        {messageReactionPickerKey === messageKey && (
          <div
            className="message-reaction-picker"
            role="listbox"
            aria-label={copy.t('Thêm biểu cảm')}
            onMouseEnter={() => {
              showMessageActions(messageKey);
              showMessageReactionPicker(messageKey);
            }}
            onMouseLeave={() => hideMessageReactionPickerLater(messageKey)}
          >
            {MESSAGE_QUICK_REACTIONS.map(reaction => (
              <button
                type="button"
                role="option"
                key={reaction}
                aria-label={reaction}
                onMouseDown={event => event.preventDefault()}
                onClick={() => handleMessageAction('reaction', message, reaction)}
              >
                {reaction}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className="message-action-button message-more-action"
        onClick={event => {
          event.stopPropagation();
          openMessageMenu(event, message);
        }}
        aria-label={copy.t('Tùy chọn tin nhắn')}
      >
        <i className="fa-solid fa-ellipsis" aria-hidden="true"></i>
      </button>
    </div>
  );
}

function ImageBatchMessage({
  messages,
  activeChat,
  activeChatId,
  viewerId,
  activeGroupMembers,
  copy = { t: value => value, locale: 'vi-VN' },
  chatMode,
  messageActions,
  messageActionKey,
  messageActionHoverKey,
  messageReactionPickerKey,
  highlightedMessageKey,
  openProfileFor,
  messageSenderProfile,
  openImageViewer,
  setReactionDetails,
  scrollToMessageById,
  showMessageActions,
  hideMessageActionsLater,
  showMessageReactionPicker,
  hideMessageReactionPickerLater,
  handleMessageAction,
  openMessageMenu,
  messageElementsRef,
  deliveryStatusIcon,
  renderMessageText,
}) {
  const firstMessage = messages[0];
  const firstSenderId = firstMessage.senderId || firstMessage.raw?.from || firstMessage.raw?.head?.['x-sender-id'];
  const isOutgoing = firstMessage.sender === 'outgoing'
    || Boolean(firstSenderId && viewerId && firstSenderId === viewerId);
  const senderGroupRole = activeChat.isGroup
    ? groupRoleForIdentity({ ...activeChat, members: activeGroupMembers }, firstSenderId)
    : 'MEMBER';
  const layoutClass = imageBatchLayoutClass(messages.length);
  const captionMessage = messages.find(message => String(message?.text || '').trim());

  return (
    <div className={`message-item image-batch-message ${isOutgoing ? 'outgoing' : 'incoming'} ${highlightedMessageKey === messageActionKey(activeChatId, firstMessage.id) ? 'message-pinned-highlight' : ''}`}>
      {!isOutgoing && (
        <button type="button" className="message-avatar message-profile-trigger" onClick={() => openProfileFor(messageSenderProfile(firstMessage))} title={`${copy.t('Xem thông tin')} ${firstMessage.senderName || copy.t('thành viên')}`}>
          <SafeAvatar src={firstMessage.avatar || ''} name={firstMessage.senderName} />
          <GroupRoleBadge role={senderGroupRole} copy={copy} />
        </button>
      )}

      <div className="message-content-wrapper image-message-content image-batch-content">
        {!isOutgoing && firstMessage.senderName && (
          <div className="sender-name-row">
            <button type="button" className="sender-name sender-profile-trigger" onClick={() => openProfileFor(messageSenderProfile(firstMessage))}>{firstMessage.senderName}</button>
          </div>
        )}
        <div className={`message-interactive image-batch-interactive ${messageActionHoverKey === messageActionKey(activeChatId, firstMessage.id) ? 'message-actions-visible' : ''}`}>
          <div className={`image-batch-grid image-batch-grid-${layoutClass}`}>
            {messages.map(message => {
              const messageKey = messageActionKey(activeChatId, message.id);
              const messageState = messageActions[messageKey] || {};
              const reactions = chatMode === 'tinode'
                ? { ...(message.reactions || {}) }
                : { ...(message.reactions || {}), ...(messageState.reactions || {}) };
              const reactionEntries = Object.entries(reactions).filter(([, count]) => Number(count) > 0);
              const reactionPills = reactionEntries.length > 0 && (
                <div className="message-reactions">
                  {reactionEntries.map(([emoji, count]) => (
                    <button
                      type="button"
                      key={emoji}
                      title={copy.t('Xem người đã thả cảm xúc')}
                      aria-label={`${copy.t('Xem người đã thả cảm xúc')} ${emoji}`}
                      onClick={() => setReactionDetails({ messageId: message.id, message, emoji })}
                    >
                      {emoji} {count}
                    </button>
                  ))}
                </div>
              );
              const attachmentFile = attachmentForMessage(message);
              const imagePreviewSource = isImageAttachment(attachmentFile, message.type)
                ? attachmentFile?.url || message.image || ''
                : '';
              const imagePreviewFile = imagePreviewSource && attachmentFile
                ? { ...attachmentFile, url: imagePreviewSource }
                : attachmentFile;
              if (!imagePreviewSource) return null;

              return (
                <div
                  key={message.id}
                  ref={element => {
                    if (element) messageElementsRef.current.set(messageKey, element);
                    else messageElementsRef.current.delete(messageKey);
                  }}
                  className={`image-batch-tile ${messageState.pinned ? 'message-is-pinned' : ''} ${highlightedMessageKey === messageKey ? 'message-pinned-highlight' : ''}`}
                  onContextMenu={event => openMessageMenu(event, message)}
                  onMouseEnter={() => showMessageActions(messageKey)}
                  onMouseLeave={() => hideMessageActionsLater(messageKey)}
                >
                  {messageState.pinned && (
                    <span className="message-pinned-indicator" title={copy.t('Đã ghim trên thiết bị này')}>
                      <i className="fa-solid fa-thumbtack" aria-hidden="true"></i>
                      <span>{copy.t('Đã ghim')}</span>
                    </span>
                  )}
                  <MessageReplyPreview reply={message.replyTo} copy={copy} onClick={reply => scrollToMessageById(reply.id)} />
                  <div className={`message-bubble image-bubble ${message.pending ? 'pending' : ''} ${message.failed ? 'failed' : ''}`}>
                    <button
                      type="button"
                      className="image-preview-button"
                      title={copy.t('Bấm để xem ảnh')}
                      onClick={() => openImageViewer(imagePreviewFile, message)}
                    >
                      <TinodeImagePreview source={imagePreviewSource} alt={copy.t('Ảnh đính kèm')} copy={copy} />
                      <span className="image-view-hint"><i className="fa-solid fa-expand"></i>{copy.t('Xem ảnh')}</span>
                    </button>
                    <div className="image-bubble-footer">
                      <span className="message-time">
                        {formatMessageTime(message, message.time, copy.locale)} {isOutgoing && deliveryStatusIcon(message)}
                      </span>
                    </div>
                  </div>
                  {reactionPills}
                  <MessageQuickActions
                    message={message}
                    messageKey={messageKey}
                    copy={copy}
                    messageActionHoverKey={messageActionHoverKey}
                    messageReactionPickerKey={messageReactionPickerKey}
                    showMessageActions={showMessageActions}
                    hideMessageActionsLater={hideMessageActionsLater}
                    showMessageReactionPicker={showMessageReactionPicker}
                    hideMessageReactionPickerLater={hideMessageReactionPickerLater}
                    handleMessageAction={handleMessageAction}
                    openMessageMenu={openMessageMenu}
                  />
                </div>
              );
            })}
          </div>
          {captionMessage && (
            <div className="image-batch-caption">
              <p>{renderMessageText(captionMessage.text, captionMessage.mentions)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function pinnedMessageKind(message, copy = { t: value => value }) {
  const attachment = attachmentForMessage(message);
  if (message?.type === 'poll' || message?.poll || message?.pollData) {
    return { label: copy.t('Bình chọn'), icon: 'fa-chart-simple', tone: 'poll' };
  }
  if (isStickerMessage(message)) {
    return { label: copy.t('Sticker'), icon: 'fa-face-smile', tone: 'sticker' };
  }
  if (isImageAttachment(attachment, message?.type)) {
    return { label: copy.t('Ảnh'), icon: 'fa-image', tone: 'media' };
  }
  if (message?.type === 'file' || attachment) {
    return { label: copy.t('Tệp'), icon: attachmentIconClass(attachment, message?.type), tone: 'file' };
  }
  return { label: copy.t('Tin nhắn'), icon: 'fa-message', tone: 'message' };
}

function PinnedMessageItem({ message, copy, preview, onClick, featured = false, showMore = true }) {
  const kind = pinnedMessageKind(message, copy);
  const senderName = message.senderName || (message.sender === 'outgoing' ? copy.t('Bạn') : copy.t('Thành viên'));
  const summary = `${senderName}: ${preview}`;
  return (
    <button
      type="button"
      className={`pinned-message-item${featured ? ' is-featured' : ''}`}
      title={`${copy.t('Đi tới tin nhắn')}: ${summary}`}
      aria-label={`${copy.t('Đi tới tin nhắn')}: ${summary}`}
      onClick={onClick}
    >
      <span className={`pinned-message-icon is-${kind.tone}`} aria-hidden="true">
        <i className={`${kind.icon === 'fa-message' ? 'fa-regular' : 'fa-solid'} ${kind.icon}`}></i>
      </span>
      <span className="pinned-message-copy">
        <strong>{kind.label}</strong>
        <small>{summary}</small>
      </span>
      {showMore && (
        <span className="pinned-message-more" aria-hidden="true">
          <i className="fa-solid fa-ellipsis"></i>
        </span>
      )}
    </button>
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

const conversationBackgroundPreloadCache = new Map();

function preloadConversationBackgroundSource(source) {
  const normalizedSource = String(source || '');
  if (!normalizedSource || typeof Image === 'undefined') return Promise.resolve(normalizedSource);
  const cacheable = /^https?:/i.test(normalizedSource);
  if (cacheable && conversationBackgroundPreloadCache.has(normalizedSource)) {
    return conversationBackgroundPreloadCache.get(normalizedSource);
  }
  const request = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(normalizedSource);
    image.onerror = () => reject(new Error('Không thể tải hình nền.'));
    image.src = normalizedSource;
  }).catch(error => {
    if (cacheable) conversationBackgroundPreloadCache.delete(normalizedSource);
    throw error;
  });
  if (cacheable) conversationBackgroundPreloadCache.set(normalizedSource, request);
  return request;
}

function useConversationBackgroundSource(background, backgroundKey = '') {
  const [resolvedSource, setResolvedSource] = useState('');
  const backgroundKeyRef = useRef(backgroundKey);
  const objectUrlsRef = useRef(new Set());

  const releaseObjectUrls = useCallback((keep = '') => {
    objectUrlsRef.current.forEach(source => {
      if (source === keep) return;
      try {
        URL.revokeObjectURL(source);
      } catch {
        // Object URL cleanup is best-effort.
      }
      objectUrlsRef.current.delete(source);
    });
  }, []);

  useEffect(() => () => {
    objectUrlsRef.current.forEach(source => {
      try {
        URL.revokeObjectURL(source);
      } catch {
        // Object URL cleanup is best-effort.
      }
    });
    objectUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    let active = true;
    const rawSource = String(background?.url || '');
    const canRenderImmediately = /^(?:https?:|data:|blob:)/i.test(rawSource);
    const conversationChanged = backgroundKeyRef.current !== backgroundKey;
    backgroundKeyRef.current = backgroundKey;
    if (conversationChanged || !background?.url) {
      setResolvedSource('');
      releaseObjectUrls();
    }
    if (!background?.url) return () => { active = false; };

    if (background.blob && typeof URL !== 'undefined' && URL.createObjectURL) {
      const objectUrl = URL.createObjectURL(background.blob);
      objectUrlsRef.current.add(objectUrl);
      preloadConversationBackgroundSource(objectUrl)
        .then(() => {
          if (!active) return;
          setResolvedSource(objectUrl);
          releaseObjectUrls(objectUrl);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }

    // IndexedDB metadata is resolved by the conversation effect. Do not turn
    // the storage key into a CSS URL while that Blob is still loading.
    if (background.customKey && !background.blob) return () => { active = false; };

    // Public presets render from their stable URL while protected media is
    // resolved through Tinode below. This avoids a blank frame on room open.
    if (canRenderImmediately) setResolvedSource(previous => previous || rawSource);
    tinodeClient.resolveMediaUrl(background.url)
      .then(url => preloadConversationBackgroundSource(url || ''))
      .then(url => {
        if (!active) return;
        setResolvedSource(url || '');
        releaseObjectUrls();
      })
      .catch(() => {
        // Keep the last rendered source if the replacement is temporarily
        // unavailable; a room should not flash blank during a retry.
      });
    return () => { active = false; };
  }, [background?.url, background?.blob, background?.customKey, backgroundKey, releaseObjectUrls]);

  return resolvedSource;
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
      groupRole: group.groupRoles?.[memberId] || (memberId === group.ownerId ? 'OWNER' : 'MEMBER'),
      group_role: group.groupRoles?.[memberId] || (memberId === group.ownerId ? 'OWNER' : 'MEMBER'),
    } : {
      id: memberId,
      name: memberId,
      online: false,
      groupRole: group.groupRoles?.[memberId] || (memberId === group.ownerId ? 'OWNER' : 'MEMBER'),
      group_role: group.groupRoles?.[memberId] || (memberId === group.ownerId ? 'OWNER' : 'MEMBER'),
    };
  });
  const owner = findAccount(accounts, group.ownerId);
  const deletedBefore = Date.parse(group.deletedAtByUser?.[viewerId] || '') || 0;
  const messages = projectDemoPollMessages((Array.isArray(group.messages) ? group.messages : [])
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
  }), members);
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
    groupSettings: normalizeGroupSettings(group.groupSettings),
    admin: owner?.name || 'Quản trị viên',
    adminId: owner?.id || group.ownerId || '',
    members,
    messages,
    readAt: group.readBy?.[viewerId] || '',
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
    membersCount: other?.online ? 'Trực tuyến' : 'Ngoại tuyến',
    description: '',
    admin: '',
    members: other ? [{ ...other }] : [],
    participantIds: direct.participantIds,
    messages,
    readAt: direct.readBy?.[viewerId] || '',
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
  const remoteRooms = safeConversationList(managed?.conversations)
    .filter(room => !room.isChatbot)
    .filter(room => isManagementConversationId(room.managementId || room.id))
    .filter(room => roomParticipantIds(room).map(String).includes(managementUserId))
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
          membersCount: peer.online ? 'Trực tuyến' : 'Ngoại tuyến',
          description: '',
          members: [{ ...peer }],
        } : {}),
        name: roomName,
        messages: [],
        lastMsg: room.lastMsg || 'Chưa có tin nhắn',
        time: room.time || '',
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
  return safeConversationValues(rooms).map(room => room.tinodeTopic).filter(Boolean);
}

function callPeerDetails(room, currentUser) {
  const members = roomMembers(room);
  const peer = members.find(member => !identitiesOverlap(member, currentUser))
    || members[0]
    || {};
  return {
    peerName: peer.name || room?.name || 'Người dùng',
    peerAvatar: peer.avatar || room?.avatarUrl || '',
  };
}

const POLL_DURATION_OPTIONS = Object.freeze([
  { id: 'none', label: 'Không giới hạn' },
  { id: '1h', label: '1 giờ' },
  { id: '1d', label: '1 ngày' },
  { id: '3d', label: '3 ngày' },
  { id: '7d', label: '7 ngày' },
]);

function createPollComposerState() {
  return {
    question: '',
    options: ['', ''],
    duration: 'none',
    settings: { ...DEFAULT_POLL_SETTINGS },
    advancedOpen: false,
  };
}

function pollExpiryForDuration(duration, now = Date.now()) {
  const durations = { '1h': 60 * 60 * 1000, '1d': 24 * 60 * 60 * 1000, '3d': 3 * 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000 };
  return durations[duration] ? new Date(now + durations[duration]).toISOString() : '';
}

function SessionBootstrapScreen({ copy, status = 'loading', onRetry }) {
  const hasError = status === 'error';
  return (
    <div className="session-bootstrap-screen" aria-busy={!hasError}>
      <section className="session-bootstrap-card" role={hasError ? 'alert' : 'status'} aria-live="polite">
        <div className={`session-bootstrap-spinner ${hasError ? 'error' : ''}`} aria-hidden="true">
          <i className={`fa-solid ${hasError ? 'fa-triangle-exclamation' : 'fa-spinner vichat-loading-icon'}`}></i>
        </div>
        <h1>{copy.t(hasError ? 'Không thể tải Chat' : 'Đang tải Chat...')}</h1>
        <p>{copy.t(hasError
          ? 'Chưa thể khôi phục phiên. Kiểm tra kết nối rồi thử lại; màn hình đăng nhập chưa được mở.'
          : 'Đang khôi phục phiên làm việc của bạn.')}</p>
        {hasError && (
          <button type="button" className="btn-primary session-bootstrap-retry" onClick={onRetry}>
            <i className="fa-solid fa-rotate-right"></i>
            {copy.t('Thử lại')}
          </button>
        )}
      </section>
    </div>
  );
}

function TenantSwitchLoadingOverlay({ copy }) {
  return (
    <div className="tenant-switch-loading-backdrop" aria-busy="true">
      <section className="tenant-switch-loading-card" role="status" aria-live="polite">
        <div className="tenant-switch-loading-spinner" aria-hidden="true">
          <i className="fa-solid fa-spinner vichat-loading-icon"></i>
        </div>
        <h2>{copy.t('Đang chuyển công ty...')}</h2>
        <p>{copy.t('Đang chuẩn bị dữ liệu cho công ty mới. Vui lòng chờ...')}</p>
      </section>
    </div>
  );
}

function App() {
  const [currentChatId, setCurrentChatId] = useState(CHATBOT_ACCOUNT.id);
  const [conversations, setConversations] = useState(createInitialConversations);
  const [isDetailOpen, setIsDetailOpen] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [typingByTopic, setTypingByTopic] = useState({});
  const [inputText, setInputText] = useState("");
  const [drafts, setDrafts] = useState({});
  const [pastedAttachmentDrafts, setPastedAttachmentDrafts] = useState({});
  const [searchQuery, setSearchQuery] = useState("");

  // Trạng thái xác thực (Auth State)
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loginNotice, setLoginNotice] = useState('');
  const [sessionRestoreState, setSessionRestoreState] = useState(() => (
    chatManagementService.remote ? 'loading' : 'ready'
  ));
  const [sessionRestoreAttempt, setSessionRestoreAttempt] = useState(0);
  const [chatMode, setChatMode] = useState('demo');
  const [connectionStatus, setConnectionStatus] = useState(isTinodeConfigured ? 'ready' : 'demo');
  const [chatError, setChatError] = useState('');
  const [groupSpamClock, setGroupSpamClock] = useState(() => Date.now());
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
  const [approvingMemberId, setApprovingMemberId] = useState('');
  const [removingMemberId, setRemovingMemberId] = useState('');
  const [updatingGroupMemberRoleId, setUpdatingGroupMemberRoleId] = useState('');
  const [isGroupMembersExpanded, setIsGroupMembersExpanded] = useState(false);
  const [isGroupBoardOpen, setIsGroupBoardOpen] = useState(false);
  const [groupMemberMenuId, setGroupMemberMenuId] = useState('');
  const [isGroupManagementOpen, setIsGroupManagementOpen] = useState(false);
  const [groupManagementDraft, setGroupManagementDraft] = useState({ ...DEFAULT_GROUP_SETTINGS });
  const [isUpdatingGroupManagement, setIsUpdatingGroupManagement] = useState(false);
  const [isDissolvingGroup, setIsDissolvingGroup] = useState(false);
  const [groupManagementNotice, setGroupManagementNotice] = useState('');
  const [isConversationBackgroundOpen, setIsConversationBackgroundOpen] = useState(false);
  const [conversationBackgroundSelection, setConversationBackgroundSelection] = useState(null);
  const [conversationBackgroundCropFile, setConversationBackgroundCropFile] = useState(null);
  const [conversationBackgroundScope, setConversationBackgroundScope] = useState(CONVERSATION_BACKGROUND_SCOPES.SHARED);
  const [conversationBackgrounds, setConversationBackgrounds] = useState({});
  const [isSavingConversationBackground, setIsSavingConversationBackground] = useState(false);
  const [conversationBackgroundNotice, setConversationBackgroundNotice] = useState('');
  const [isGroupRenameOpen, setIsGroupRenameOpen] = useState(false);
  const [groupRenameValue, setGroupRenameValue] = useState('');
  const [isRenamingGroup, setIsRenamingGroup] = useState(false);
  const [pendingGroupLeave, setPendingGroupLeave] = useState(null);
  const [groupLeaveSearch, setGroupLeaveSearch] = useState('');
  const [groupLeaveReplacementId, setGroupLeaveReplacementId] = useState('');
  const [groupLeaveReplacementName, setGroupLeaveReplacementName] = useState('');
  const [groupLeaveNotice, setGroupLeaveNotice] = useState('');
  const [isLeavingGroup, setIsLeavingGroup] = useState(false);
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
  const [messageSearchSender, setMessageSearchSender] = useState('all');
  const [messageSearchType, setMessageSearchType] = useState('all');
  const [messageSearchFromDate, setMessageSearchFromDate] = useState('');
  const [messageSearchToDate, setMessageSearchToDate] = useState('');
  const [messageSearchResults, setMessageSearchResults] = useState([]);
  const [messageSearchTotal, setMessageSearchTotal] = useState(0);
  const [messageSearchScanned, setMessageSearchScanned] = useState(0);
  const [messageSearchCursor, setMessageSearchCursor] = useState(null);
  const [messageSearchHasMore, setMessageSearchHasMore] = useState(false);
  const [messageSearchLoading, setMessageSearchLoading] = useState(false);
  const [messageSearchError, setMessageSearchError] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pollComposer, setPollComposer] = useState(null);
  const [isCreatingPoll, setIsCreatingPoll] = useState(false);
  const [composerPickerTab, setComposerPickerTab] = useState('stickers');
  const [mentionContext, setMentionContext] = useState(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [messageMentions, setMessageMentions] = useState({});
  const [messageMenu, setMessageMenu] = useState(null);
  const [conversationMenu, setConversationMenu] = useState(null);
  const [conversationCategoryMenuOpen, setConversationCategoryMenuOpen] = useState(false);
  const [conversationCategoryManagerOpen, setConversationCategoryManagerOpen] = useState(false);
  const [conversationCategoryOptions, setConversationCategoryOptions] = useState(() => (
    CONVERSATION_CATEGORY_OPTIONS.map(category => ({ ...category }))
  ));
  const [conversationCategories, setConversationCategories] = useState({});
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [isSavingMessageEdit, setIsSavingMessageEdit] = useState(false);
  const [profileContact, setProfileContact] = useState(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceRecordingSeconds, setVoiceRecordingSeconds] = useState(0);
  const [messageDetails, setMessageDetails] = useState(null);
  const [editHistoryMessage, setEditHistoryMessage] = useState(null);
  const [reactionDetails, setReactionDetails] = useState(null);
  const [shareMessage, setShareMessage] = useState(null);
  const [messageActions, setMessageActions] = useState({});
  const [unreadBoundaries, setUnreadBoundaries] = useState({});
  const [showLatestMessageButton, setShowLatestMessageButton] = useState(false);
  const [messageReactionPickerKey, setMessageReactionPickerKey] = useState(null);
  const [messageActionHoverKey, setMessageActionHoverKey] = useState(null);
  const [pinnedMessagesExpanded, setPinnedMessagesExpanded] = useState(false);
  const [pinnedMessageMenu, setPinnedMessageMenu] = useState(null);
  const [highlightedMessageKey, setHighlightedMessageKey] = useState(null);
  const [notificationMuteDialog, setNotificationMuteDialog] = useState(null);
  const [notificationMuteOption, setNotificationMuteOption] = useState(NOTIFICATION_MUTE_OPTIONS.ONE_HOUR);
  const [isUpdatingNotificationMute, setIsUpdatingNotificationMute] = useState(false);
  const [isUpdatingDirectBlock, setIsUpdatingDirectBlock] = useState(false);
  const [notificationClock, setNotificationClock] = useState(() => Date.now());
  const [displayClock, setDisplayClock] = useState(() => Date.now());
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_NOTIFICATION_SETTINGS }));
  const [notificationSettingsNotice, setNotificationSettingsNotice] = useState('');
  const [keyboardShortcutSettings, setKeyboardShortcutSettings] = useState(() => normalizeKeyboardShortcutSettings(DEFAULT_KEYBOARD_SHORTCUT_SETTINGS));
  const [keyboardShortcutNotice, setKeyboardShortcutNotice] = useState('');
  const [capturingShortcutAction, setCapturingShortcutAction] = useState('');
  const [customNotificationSound, setCustomNotificationSound] = useState(null);
  const [customNotificationSoundUrl, setCustomNotificationSoundUrl] = useState('');
  const [isLoadingCustomNotificationSound, setIsLoadingCustomNotificationSound] = useState(false);
  const [isSavingCustomNotificationSound, setIsSavingCustomNotificationSound] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [pinLockConfig, setPinLockConfig] = useState(null);
  const [pinLockReady, setPinLockReady] = useState(true);
  const [isPinTabUnlocked, setIsPinTabUnlocked] = useState(true);
  const [pinUnlockValue, setPinUnlockValue] = useState('');
  const [pinUnlockNotice, setPinUnlockNotice] = useState('');
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [directoryAccounts, setDirectoryAccounts] = useState([]);
  const [contactNicknames, setContactNicknames] = useState({});
  const [contactNicknameDialog, setContactNicknameDialog] = useState(null);
  const [contactNicknameValue, setContactNicknameValue] = useState('');
  const [isSavingContactNickname, setIsSavingContactNickname] = useState(false);
  const [isUpdatingProfileAvatar, setIsUpdatingProfileAvatar] = useState(false);
  const [avatarCropFile, setAvatarCropFile] = useState(null);
  const [isUpdatingGroupAvatar, setIsUpdatingGroupAvatar] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [isSwitchingTenant, setIsSwitchingTenant] = useState(false);
  const [tenantSwitchNotice, setTenantSwitchNotice] = useState('');
  const [pendingTenantSwitch, setPendingTenantSwitch] = useState(null);
  const [tenantSwitcherOpen, setTenantSwitcherOpen] = useState(false);
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
    return false;
  });
  const [isPrimarySidebarPreferenceReady, setIsPrimarySidebarPreferenceReady] = useState(false);

  // References
  const chatMessagesEndRef = useRef(null);
  const chatMessagesRef = useRef(null);
  const chatIsNearBottomRef = useRef(true);
  const messageElementsRef = useRef(new Map());
  const messageHighlightTimerRef = useRef(null);
  const messageActionHideTimerRef = useRef(null);
  const messageReactionHideTimerRef = useRef(null);
  const messageInputRef = useRef(null);
  const conversationSearchInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const pastedAttachmentDraftsRef = useRef(pastedAttachmentDrafts);
  const pastedAttachmentSubmitRef = useRef(false);
  const groupSpamStatesRef = useRef(new Map());
  const mentionPickerRef = useRef(null);
  const languageMenuRef = useRef(null);
  const tenantSwitcherRef = useRef(null);
  const currentChatIdRef = useRef(currentChatId);
  const deletedConversationIdsRef = useRef(new Set());
  const reopeningDirectTopicsRef = useRef(new Set());
  const createGroupRequestRef = useRef(false);
  const tinodeSessionRequestRef = useRef(null);
  const conversationsRef = useRef(conversations);
  const currentUserRef = useRef(currentUser);
  const directoryAccountsRef = useRef(directoryAccounts);
  const keyboardShortcutActionHandlersRef = useRef({});
  const contactNicknamesRef = useRef(contactNicknames);
  const avatarOverridesRef = useRef(new Map());
  const groupAvatarSyncRef = useRef(new Map());
  const groupAvatarRefreshRef = useRef(new Map());
  const groupNameRefreshRef = useRef(new Set());
  const groupRoleRefreshRef = useRef(new Set());
  const messageSearchRequestRef = useRef(0);
  const typingNoticeAtRef = useRef(new Map());
  const typingClearTimersRef = useRef(new Map());
  const mediaRecorderRef = useRef(null);
  const voiceChunksRef = useRef([]);
  const voiceRecordingDurationRef = useRef(0);
  const voiceDiscardRef = useRef(false);
  const voiceTimerRef = useRef(null);
  const notificationBaselineRef = useRef(new Map());
  const openingConversationRef = useRef('');
  const conversationScrollFrameRef = useRef(null);
  const unreadBoundariesRef = useRef({});
  const unreadCompletionRequestsRef = useRef(new Map());
  const conversationNavigationRef = useRef(0);
  const unreadBoundaryJumpedRef = useRef(new Set());
  const visibleMessagesRef = useRef([]);
  const notificationAudioContextRef = useRef(null);
  const notificationCustomAudioRef = useRef(null);
  const notificationSoundFileInputRef = useRef(null);
  const conversationBackgroundFileInputRef = useRef(null);
  const notificationOpenHandlerRef = useRef(null);
  const contactsSyncTimerRef = useRef(null);
  const contactsSyncRequestRef = useRef(0);
  const directorySearchRequestRef = useRef(0);
  const logoutHandlerRef = useRef(null);
  const forcedLogoutHandlerRef = useRef(null);
  const forcedLogoutRef = useRef(false);
  const isLoggingOutRef = useRef(false);
  const accountSessionRef = useRef(0);
  const chatbotRequestRef = useRef(null);
  const managementConversationSessionRef = useRef(0);
  const activeCallRef = useRef(null);
  const sessionRestoreAttemptedRef = useRef(false);
  const loginSuccessHandlerRef = useRef(null);

  // Event callbacks can run between React renders; keep the latest room map
  // available without forcing Tinode subscriptions to be recreated.
  conversationsRef.current = conversations;
  currentUserRef.current = currentUser;
  directoryAccountsRef.current = directoryAccounts;
  contactNicknamesRef.current = contactNicknames;
  unreadBoundariesRef.current = unreadBoundaries;
  pastedAttachmentDraftsRef.current = pastedAttachmentDrafts;

  const updateDirectoryAccounts = useCallback(updater => {
    setDirectoryAccounts(previous => {
      const viewer = currentUserRef.current;
      const scopedPrevious = filterAccountsByTenant(previous, viewer);
      const candidate = typeof updater === 'function' ? updater(scopedPrevious) : updater;
      const next = filterAccountsByTenant(candidate, viewer);
      directoryAccountsRef.current = next;
      return next;
    });
  }, []);

  const updateDirectoryResults = useCallback(updater => {
    setWorkspaceResults(previous => {
      const viewer = currentUserRef.current;
      const scopedPrevious = filterAccountsByTenant(previous, viewer);
      const candidate = typeof updater === 'function' ? updater(scopedPrevious) : updater;
      return filterAccountsByTenant(candidate, viewer);
    });
  }, []);

  const revokePastedAttachmentPreview = attachment => {
    if (!attachment?.previewUrl || typeof URL === 'undefined') return;
    URL.revokeObjectURL(attachment.previewUrl);
  };

  const replacePastedAttachmentDrafts = next => {
    pastedAttachmentDraftsRef.current = next;
    setPastedAttachmentDrafts(next);
  };

  const clearPastedAttachments = conversationId => {
    const id = String(conversationId || '');
    const current = pastedAttachmentDraftsRef.current;
    const attachments = current[id] || [];
    if (attachments.length === 0) return;
    attachments.forEach(revokePastedAttachmentPreview);
    const next = { ...current };
    delete next[id];
    replacePastedAttachmentDrafts(next);
  };

  const clearAllPastedAttachments = () => {
    const current = pastedAttachmentDraftsRef.current;
    Object.values(current).flat().forEach(revokePastedAttachmentPreview);
    replacePastedAttachmentDrafts({});
  };

  const migratePastedAttachments = (previousId, nextId) => {
    const fromId = String(previousId || '');
    const toId = String(nextId || '');
    if (!fromId || !toId || fromId === toId) return;
    const current = pastedAttachmentDraftsRef.current;
    const attachments = current[fromId] || [];
    if (attachments.length === 0) return;
    const next = {
      ...current,
      [toId]: [...(current[toId] || []), ...attachments],
    };
    delete next[fromId];
    replacePastedAttachmentDrafts(next);
  };

  useEffect(() => () => {
    Object.values(pastedAttachmentDraftsRef.current).flat().forEach(revokePastedAttachmentPreview);
  }, []);

  const rememberAvatarOverride = (entity, avatar) => {
    const value = String(avatar || '').trim();
    identityValues(entity).forEach(identity => {
      if (value) avatarOverridesRef.current.set(identity, value);
      else avatarOverridesRef.current.delete(identity);
    });
  };

  const avatarOverrideFor = account => identityValues(account)
    .map(identity => avatarOverridesRef.current.get(identity))
    .find(Boolean) || '';

  const syncCurrentAccountProfile = useCallback(snapshot => {
    const previousUser = currentUserRef.current;
    if (!previousUser || !snapshot) return false;
    const snapshotProfile = normalizeAccountShape(snapshot);
    if (!snapshotProfile) return false;
    // A profile refresh can observe a tenant switch made in another tab.
    // Scope directory updates to the snapshot so the old company's records
    // cannot survive while React catches up with the new session metadata.
    const directoryScope = accountTenantId(snapshotProfile) ? snapshotProfile : previousUser;
    const previousAvatar = String(previousUser.avatar || '').trim();
    const profileValue = String(snapshotProfile.avatar || '').trim();
    const effectiveAvatar = profileValue || previousAvatar;
    const profile = effectiveAvatar === profileValue
      ? snapshotProfile
      : { ...snapshotProfile, avatar: effectiveAvatar, avatarUrl: effectiveAvatar, avatar_url: effectiveAvatar, photo: effectiveAvatar };
    identityValues(profile).forEach(identity => {
      if (effectiveAvatar) avatarOverridesRef.current.set(identity, effectiveAvatar);
    });

    setCurrentUser(previous => {
      if (!previous) return previous;
      const next = {
        ...previous,
        id: profile.id || previous.id,
        userId: profile.userId || previous.userId,
        username: profile.username || previous.username,
        user_name: profile.user_name || previous.user_name,
        name: profile.name || previous.name,
        full_name: profile.full_name || previous.full_name,
        fullName: profile.fullName || previous.fullName,
        display_name: profile.display_name || previous.display_name,
        displayName: profile.displayName || previous.displayName,
        defaultName: profile.defaultName || previous.defaultName,
        default_name: profile.default_name || previous.default_name,
        avatar: effectiveAvatar,
        avatarUrl: effectiveAvatar,
        avatar_url: effectiveAvatar,
        photo: effectiveAvatar,
        email: profile.email || previous.email,
        title: profile.title || previous.title,
        department: profile.department || previous.department,
        accountManaged: profile.accountManaged ?? previous.accountManaged,
        account_managed: profile.account_managed ?? previous.account_managed,
        authSource: profile.authSource || previous.authSource,
        auth_source: profile.auth_source || previous.auth_source,
        tenantId: profile.tenantId || previous.tenantId,
        tenant_id: profile.tenant_id || previous.tenant_id,
        tenantName: profile.tenantName || previous.tenantName,
        tenant_name: profile.tenant_name || previous.tenant_name,
        tenant: profile.tenant || previous.tenant,
        uid: previous.uid || profile.uid,
        tinodeUid: previous.tinodeUid || profile.tinodeUid,
      };
      const changed = ['name', 'avatar', 'email', 'title', 'department', 'accountManaged', 'authSource', 'tenantId', 'tenantName']
        .some(key => next[key] !== previous[key]);
      if (!changed) return previous;
      currentUserRef.current = next;
      return next;
    });
    setDirectoryAccounts(previous => {
      const next = updateAccountProfiles(previous, profile, directoryScope);
      directoryAccountsRef.current = next;
      return next;
    });
    setWorkspaceResults(previous => updateAccountProfiles(previous, profile, directoryScope));
    setConversations(previous => {
      let changed = false;
      const next = Object.fromEntries(safeConversationEntries(previous).map(([id, room]) => {
        let roomChanged = false;
        const members = roomMembers(room).map(member => {
          if (!identitiesOverlap(member, profile)) return member;
          const updated = mergeRealtimeAccountProfile(member, profile);
          if (updated !== member) roomChanged = true;
          return updated;
        });
        const messages = roomMessages(room).map(message => {
          const senderId = messageSenderId(message);
          if (!identitiesOverlap({ id: senderId, uid: senderId }, profile)) return message;
          const updated = {
            ...message,
            senderName: profile.name || message.senderName,
            avatar: profile.avatar || message.avatar || '',
          };
          if (updated.senderName !== message.senderName || updated.avatar !== message.avatar) roomChanged = true;
          return updated;
        });
        const peer = !room.isGroup
          ? members.find(member => !identitiesOverlap(member, currentUserRef.current))
          : null;
        const nextRoom = {
          ...room,
          members,
          messages,
          ...(peer ? {
            name: peer.name || room.name,
            avatarUrl: isAccountManaged(peer) ? (peer.avatar || '') : (peer.avatar || room.avatarUrl || ''),
          } : {}),
        };
        if (nextRoom.name !== room.name || nextRoom.avatarUrl !== room.avatarUrl) roomChanged = true;
        if (roomChanged) changed = true;
        return [id, roomChanged ? nextRoom : room];
      }));
      if (changed) {
        conversationsRef.current = next;
        return next;
      }
      return previous;
    });
    return effectiveAvatar !== previousAvatar;
  }, []);

  const clearActiveCall = useCallback(() => {
    activeCallRef.current = null;
    setActiveCall(null);
  }, []);

  // Normalize every room used by render paths, including the sidebar. A direct
  // snapshot can be malformed before it reaches the active-chat selector.
  const chatbotUseTinode = Boolean(isLoggedIn && chatMode === 'tinode' && CHATBOT_ACCOUNT.tinodeUid);
  const renderConversations = ensureDefaultChatbotConversation(
    Object.fromEntries(safeConversationEntries(conversations)),
    { accountSession: accountSessionRef.current, useTinode: chatbotUseTinode },
  );
  const rawActiveChatSource = renderConversations[currentChatId] || Object.values(renderConversations)[0];
  const activeChatSource = rawActiveChatSource
    ? safeNormalizeConversationForRender(rawActiveChatSource, currentChatId)
    : null;
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
  const activePastedAttachments = pastedAttachmentDrafts[currentChatId] || [];
  const reactionDetailsMessage = reactionDetails
    ? roomMessages(activeChat).find(message => message?.id === reactionDetails.messageId) || reactionDetails.message
    : null;
  useEffect(() => {
    const ensured = ensureDefaultChatbotConversation(conversations, {
      accountSession: accountSessionRef.current,
      useTinode: chatbotUseTinode,
    });
    if (ensured === conversations) return;
    conversationsRef.current = ensured;
    setConversations(ensured);
  }, [chatbotUseTinode, conversations, isLoggedIn]);
  useEffect(() => {
    setIsGroupMemberPickerOpen(false);
    setGroupMemberAddIds([]);
    setGroupMemberAddProfiles({});
    setGroupMemberAddSearch('');
    setApprovingMemberId('');
    setIsGroupMembersExpanded(false);
    setIsGroupBoardOpen(false);
    setGroupMemberMenuId('');
    messageElementsRef.current.clear();
    setMessageReactionPickerKey(null);
    setMessageActionHoverKey(null);
    setReactionDetails(null);
    setPinnedMessagesExpanded(false);
    setPinnedMessageMenu(null);
    setHighlightedMessageKey(null);
    setIsGroupManagementOpen(false);
    setGroupManagementNotice('');
    setIsGroupRenameOpen(false);
    setPendingGroupLeave(null);
    setGroupLeaveSearch('');
    setGroupLeaveReplacementId('');
    setGroupLeaveReplacementName('');
    setGroupLeaveNotice('');
    if (messageHighlightTimerRef.current) {
      window.clearTimeout(messageHighlightTimerRef.current);
      messageHighlightTimerRef.current = null;
    }
    if (messageActionHideTimerRef.current) {
      window.clearTimeout(messageActionHideTimerRef.current);
      messageActionHideTimerRef.current = null;
    }
    if (messageReactionHideTimerRef.current) {
      window.clearTimeout(messageReactionHideTimerRef.current);
      messageReactionHideTimerRef.current = null;
    }
  }, [activeChat.id]);

  const activeGroupSettingsDependency = JSON.stringify(activeChat.groupSettings || {});
  useEffect(() => {
    let nextSettings = {};
    try {
      nextSettings = JSON.parse(activeGroupSettingsDependency);
    } catch {
      nextSettings = {};
    }
    setGroupManagementDraft(normalizeGroupSettings(nextSettings));
    setGroupRenameValue(activeChat.name || '');
  }, [activeChat.id, activeChat.name, activeGroupSettingsDependency]);

  const showMessageActions = messageKey => {
    if (messageActionHideTimerRef.current) {
      window.clearTimeout(messageActionHideTimerRef.current);
      messageActionHideTimerRef.current = null;
    }
    setMessageActionHoverKey(messageKey);
  };

  const hideMessageActionsLater = messageKey => {
    if (messageActionHideTimerRef.current) window.clearTimeout(messageActionHideTimerRef.current);
    messageActionHideTimerRef.current = window.setTimeout(() => {
      setMessageActionHoverKey(current => current === messageKey ? null : current);
      messageActionHideTimerRef.current = null;
    }, 240);
  };

  const showMessageReactionPicker = messageKey => {
    if (messageReactionHideTimerRef.current) {
      window.clearTimeout(messageReactionHideTimerRef.current);
      messageReactionHideTimerRef.current = null;
    }
    setMessageReactionPickerKey(messageKey);
  };

  const hideMessageReactionPickerLater = messageKey => {
    if (messageReactionHideTimerRef.current) window.clearTimeout(messageReactionHideTimerRef.current);
    messageReactionHideTimerRef.current = window.setTimeout(() => {
      setMessageReactionPickerKey(current => current === messageKey ? null : current);
      messageReactionHideTimerRef.current = null;
    }, 240);
  };
  const conversationCategoryFor = room => {
    const key = String(room?.managementId || room?.id || '');
    const categoryId = conversationCategories[key] || room?.category || '';
    return conversationCategoryOptions.find(option => option.id === categoryId) || null;
  };
  const activeChatMuted = isConversationMuted(activeChat.notificationMutedUntil, notificationClock);
  const activeChatMuteLabel = notificationMuteLabel(activeChat.notificationMutedUntil, notificationClock, settings.language === 'en' ? 'en-US' : 'vi-VN');
  const activeChatBlockedByViewer = !activeChat.isGroup
    && !activeChat.isChatbot
    && activeChat.blockedByViewer === true;
  const activeChatBlockedByPeer = !activeChat.isGroup
    && !activeChat.isChatbot
    && activeChat.blockedByPeer === true;
  const activeMessages = roomMessages(activeChat);
  const activeMessageCount = activeMessages.length;
  const activeMessageTail = activeMessages.at(-1);
  const activeMessageTailKey = [
    activeMessageTail?.id || '',
    activeMessageTail?.seq || '',
    activeMessageTail?.createdAt || '',
    activeChat.updatedAt || '',
  ].join('|');
  const usesManagementData = chatManagementService.remote && chatMode !== 'demo';
  const activeSearchConversationId = String(activeChat.managementId || activeChat.id || '').trim();
  const messageSearchHasFilters = Boolean(
    messageSearchQuery.trim()
    || messageSearchSender !== 'all'
    || messageSearchType !== 'all'
    || messageSearchFromDate
    || messageSearchToDate,
  );
  const canSearchConversationHistory = workspacePanel === 'search'
    && messageSearchHasFilters
    && usesManagementData
    && chatMode === 'tinode'
    && connectionStatus === 'online'
    && !activeChat.isChatbot
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(activeSearchConversationId);

  useEffect(() => {
    setMessageSearchQuery('');
    setMessageSearchSender('all');
    setMessageSearchType('all');
    setMessageSearchFromDate('');
    setMessageSearchToDate('');
    setMessageSearchResults([]);
    setMessageSearchTotal(0);
    setMessageSearchScanned(0);
    setMessageSearchCursor(null);
    setMessageSearchHasMore(false);
    setMessageSearchError('');
  }, [activeSearchConversationId]);

  useEffect(() => {
    const requestId = messageSearchRequestRef.current + 1;
    messageSearchRequestRef.current = requestId;
    if (!canSearchConversationHistory) {
      setMessageSearchResults([]);
      setMessageSearchTotal(0);
      setMessageSearchScanned(0);
      setMessageSearchCursor(null);
      setMessageSearchHasMore(false);
      setMessageSearchLoading(false);
      setMessageSearchError('');
      return undefined;
    }

    let cancelled = false;
    setMessageSearchLoading(true);
    setMessageSearchError('');
    const timer = window.setTimeout(async () => {
      try {
        const payload = await chatManagementService.searchConversationHistory(activeSearchConversationId, {
          query: messageSearchQuery,
          senderId: messageSearchSender === 'all' ? '' : messageSearchSender,
          type: messageSearchType,
          fromDate: messageSearchFromDate,
          toDate: messageSearchToDate,
          limit: 100,
        });
        if (cancelled || messageSearchRequestRef.current !== requestId) return;
        const items = Array.isArray(payload?.objects) ? payload.objects : (Array.isArray(payload?.items) ? payload.items : []);
        setMessageSearchResults(items.map(normalizeHistorySearchItem));
        setMessageSearchTotal(Number(payload?.total) || items.length);
        setMessageSearchScanned(Number(payload?.scanned) || 0);
        setMessageSearchCursor(payload?.next_cursor || null);
        setMessageSearchHasMore(Boolean(payload?.has_more));
      } catch (error) {
        if (cancelled || messageSearchRequestRef.current !== requestId) return;
        setMessageSearchResults([]);
        setMessageSearchTotal(0);
        setMessageSearchScanned(0);
        setMessageSearchError(error?.message || 'Không thể tìm lịch sử hội thoại.');
      } finally {
        if (!cancelled && messageSearchRequestRef.current === requestId) setMessageSearchLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    activeChat.isChatbot,
    activeSearchConversationId,
    chatMode,
    canSearchConversationHistory,
    connectionStatus,
    messageSearchFromDate,
    messageSearchHasFilters,
    messageSearchQuery,
    messageSearchSender,
    messageSearchToDate,
    messageSearchType,
    usesManagementData,
    workspacePanel,
  ]);

  const loadMoreMessageSearchResults = async () => {
    if (!canSearchConversationHistory || !messageSearchHasMore || !messageSearchCursor || messageSearchLoading) return;
    const requestId = messageSearchRequestRef.current + 1;
    messageSearchRequestRef.current = requestId;
    setMessageSearchLoading(true);
    setMessageSearchError('');
    try {
      const payload = await chatManagementService.searchConversationHistory(activeSearchConversationId, {
        query: messageSearchQuery,
        senderId: messageSearchSender === 'all' ? '' : messageSearchSender,
        type: messageSearchType,
        fromDate: messageSearchFromDate,
        toDate: messageSearchToDate,
        limit: 100,
        cursor: messageSearchCursor,
      });
      if (messageSearchRequestRef.current !== requestId) return;
      const items = (Array.isArray(payload?.objects) ? payload.objects : (Array.isArray(payload?.items) ? payload.items : []))
        .map(normalizeHistorySearchItem);
      const knownKeys = new Set(messageSearchResults.map(item => item.seq > 0 ? `seq:${item.seq}` : `id:${item.id}`));
      const additions = items.filter(item => {
        const key = item.seq > 0 ? `seq:${item.seq}` : `id:${item.id}`;
        if (knownKeys.has(key)) return false;
        knownKeys.add(key);
        return true;
      });
      setMessageSearchResults(previous => {
        const merged = [...previous, ...additions];
        return merged.filter((item, index, values) => (
          index === values.findIndex(candidate => (
            candidate.id === item.id
            || (candidate.seq > 0 && item.seq > 0 && candidate.seq === item.seq)
          ))
        ));
      });
      setMessageSearchTotal(previous => previous + additions.length);
      setMessageSearchScanned(previous => previous + (Number(payload?.scanned) || 0));
      setMessageSearchCursor(payload?.next_cursor || null);
      setMessageSearchHasMore(Boolean(payload?.has_more));
    } catch (error) {
      if (messageSearchRequestRef.current === requestId) setMessageSearchError(error?.message || 'Không thể tải thêm lịch sử hội thoại.');
    } finally {
      if (messageSearchRequestRef.current === requestId) setMessageSearchLoading(false);
    }
  };

  const realtimeMessagingPending = usesManagementData
    && !activeChat.isChatbot
    && (
      chatMode !== 'tinode'
      || connectionStatus !== 'online'
      || ['pending', 'error'].includes(activeChat.directProvisioning)
    );
  const chatbotUsesTinode = Boolean(activeChat.isChatbot && activeChat.tinodeTopic);
  const chatbotStatus = chatbotUsesTinode
    ? (connectionStatus === 'online' ? 'Đang kết nối kho tri thức' : 'Đang chờ kết nối realtime')
    : 'Kho tri thức doanh nghiệp';
  const accountProfileReadOnly = isAccountManaged(currentUser) || chatManagementService.accountManaged;
  const appCopy = createLocalizedCopy(APP_LANGUAGE_COPY[settings.language] || APP_LANGUAGE_COPY.vi, settings.language);
  const conversationCategoryLabel = category => (
    category?.builtIn ? appCopy.t(category.label) : String(category?.label || '')
  );
  const categoryManagerConversations = safeConversationValues(renderConversations)
    .filter(room => room?.id && room.id !== 'empty' && !room.isChatbot)
    .map(room => ({
      id: String(room.managementId || room.id),
      name: conversationDisplayName(
        room.isGroup ? { ...room, members: [] } : room,
        room.isGroup ? appCopy.t('Nhóm') : appCopy.t('Cuộc trò chuyện cá nhân'),
      ),
      isGroup: Boolean(room.isGroup),
    }))
    .filter((conversation, index, values) => values.findIndex(item => item.id === conversation.id) === index)
    .sort((first, second) => first.name.localeCompare(second.name, 'vi', { sensitivity: 'base' }));
  const selectedLanguage = APP_LANGUAGE_OPTIONS.find(option => option.id === settings.language)
    || APP_LANGUAGE_OPTIONS[0];
  const pinViewerIdentity = useMemo(
    () => viewerPreferenceIdentityFromValues(
      currentUser?.id,
      currentUser?.uid,
      currentUser?.tinodeUid,
      currentUser?.tinode_uid,
    ),
    [currentUser?.id, currentUser?.uid, currentUser?.tinodeUid, currentUser?.tinode_uid],
  );
  const pinViewerId = pinViewerIdentity.viewerId;
  const pinViewerAliases = pinViewerIdentity.aliases;
  const preferenceTenantId = String(accountTenantId(currentUser) || '').trim();
  const isCurrentUserOnline = Boolean(
    isLoggedIn && currentUser && (chatMode !== 'tinode' || connectionStatus === 'online')
  );
  const isAccountOnline = account => identitiesOverlap(account, currentUser)
    ? isCurrentUserOnline
    : Boolean(account?.online);

  const accountPresenceLabel = account => {
    if (isAccountOnline(account)) return appCopy.t('Trực tuyến');
    const lastSeenAt = latestTimestampValue(
      account?.lastSeenAt,
      account?.last_seen_at,
    );
    const duration = formatOfflineDuration(
      lastSeenAt,
      displayClock,
      appCopy.locale,
    );
    return duration
      ? `${appCopy.t('Ngoại tuyến')} ${duration}`
      : appCopy.t('Ngoại tuyến');
  };
  const accountPresenceTone = account => (isAccountOnline(account) ? 'online' : 'offline');

  const activeChatMembers = roomMembers(activeChat);
  const activeGroupMembers = activeChat.isGroup
    ? groupActiveMembers(activeChat, directoryAccounts)
    : [];
  const activeGroupSettings = activeChat.isGroup
    ? normalizeGroupSettings(activeChat.groupSettings)
    : normalizeGroupSettings();
  const isActiveGroupAdmin = activeChat.isGroup
    && canManageGroupMembers(activeChat, directoryAccounts, currentUser);
  const canApproveActiveGroupMembers = activeChat.isGroup
    && canApproveGroupMembers(activeChat, directoryAccounts, currentUser);
  const activePendingMembers = activeChat.isGroup && canApproveActiveGroupMembers
    ? (Array.isArray(activeChat.pendingMembers) ? activeChat.pendingMembers : [])
      .map(member => {
        const identity = member?.id || member?.uid || member?.tinodeUid || member?.tinode_uid;
        const account = findAccount(directoryAccounts, identity) || member;
        return {
          ...member,
          ...account,
          id: String(identity || account?.id || '').trim(),
          name: account?.name || member?.name || identity,
          avatar: account?.avatar || member?.avatar || '',
        };
      })
      .filter(member => member.id && member.name)
    : [];
  const canEditActiveGroupInfo = activeChat.isGroup
    && (isActiveGroupAdmin || groupSettingEnabled(activeGroupSettings, 'allowMembersEditInfo'));
  useEffect(() => {
    if (!activeChat.isGroup || canEditActiveGroupInfo) return;
    setIsGroupRenameOpen(false);
    if (
      isConversationBackgroundOpen
      && conversationBackgroundScope === CONVERSATION_BACKGROUND_SCOPES.SHARED
    ) {
      setConversationBackgroundScope(CONVERSATION_BACKGROUND_SCOPES.LOCAL);
      setConversationBackgroundNotice(GROUP_INFO_PERMISSION_MESSAGE);
    }
  }, [
    activeChat.id,
    activeChat.isGroup,
    canEditActiveGroupInfo,
    conversationBackgroundScope,
    isConversationBackgroundOpen,
  ]);
  const canSendInActiveGroup = !activeChat.isGroup
    || isActiveGroupAdmin
    || groupSettingEnabled(activeGroupSettings, 'allowMessages');
  const suggestedStickers = useMemo(
    () => suggestStickersForText(inputText, 4),
    [inputText],
  );
  const canPinActiveGroupMessages = !activeChat.isGroup
    || isActiveGroupAdmin
    || groupSettingEnabled(activeGroupSettings, 'allowPinMessages');
  const canCreatePollInActiveGroup = activeChat.isGroup
    && (isActiveGroupAdmin || groupSettingEnabled(activeGroupSettings, 'allowPolls'));
  const activeGroupSpamKey = activeChat.isGroup ? String(activeChat.tinodeTopic || activeChat.id || '') : '';
  const activeGroupSpamState = activeGroupSpamKey
    ? (groupSpamStatesRef.current.get(activeGroupSpamKey) || createGroupSpamState())
    : createGroupSpamState();
  const activeGroupSpamBlockedUntil = activeGroupSpamState.blockedUntil;
  const activeGroupSpamRemaining = activeChat.isGroup
    ? groupSpamRemainingSeconds(activeGroupSpamState, groupSpamClock)
    : 0;
  const activeGroupSpamBlocked = activeGroupSpamRemaining > 0;
  useEffect(() => {
    if (!activeGroupSpamKey || activeGroupSpamBlockedUntil <= Date.now()) return undefined;
    let timer = null;
    const tick = () => {
      const now = Date.now();
      setGroupSpamClock(now);
      if (now >= activeGroupSpamBlockedUntil && timer) {
        window.clearInterval(timer);
        timer = null;
        setChatError(previous => /gửi quá nhanh/iu.test(previous) ? '' : previous);
      }
    };
    tick();
    timer = window.setInterval(tick, 250);
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [activeGroupSpamBlockedUntil, activeGroupSpamKey]);
  const pendingGroupLeaveRoom = (() => {
    const pendingRoom = pendingGroupLeave?.room;
    if (!pendingRoom?.isGroup) return null;
    const pendingKeys = new Set([
      pendingRoom.id,
      pendingRoom.managementId,
      pendingRoom.tinodeTopic,
    ].filter(Boolean).map(String));
    return safeConversationValues(renderConversations).find(room => [
      room.id,
      room.managementId,
      room.tinodeTopic,
    ].filter(Boolean).some(key => pendingKeys.has(String(key)))) || pendingRoom;
  })();
  const groupLeaveMembers = pendingGroupLeaveRoom
    ? groupOwnerReplacementMembers(pendingGroupLeaveRoom, directoryAccounts, currentUser)
    : [];
  const groupLeaveCandidates = [...groupLeaveMembers]
    .filter(member => matchesCompanyDirectoryContact(member, groupLeaveSearch))
    .sort((first, second) => String(first.name).localeCompare(String(second.name), 'vi', { sensitivity: 'base' }));
  const messageSearchSenderOptions = [currentUser, ...activeChatMembers]
    .reduce((options, account) => {
      const id = messageSearchSenderId(account);
      if (!id || options.some(option => option.id === id)) return options;
      options.push({
        id,
        name: String(account?.name || account?.full_name || account?.fullName || account?.username || id).trim(),
      });
      return options;
    }, []);
  const activeGroupPresence = activeChat.isGroup
    ? countGroupPresence(activeChatMembers, currentUser, isCurrentUserOnline)
    : null;
  const activeDirectPeer = !activeChat.isGroup && !activeChat.isChatbot
    ? activeChatMembers.find(member => !identitiesOverlap(member, currentUser)) || activeChatMembers[0] || null
    : null;
  const activeChatPresenceLabel = activeGroupPresence
    ? appCopy.t(`${activeGroupPresence.memberCount} thành viên • ${activeGroupPresence.onlineCount} đang online`)
    : activeDirectPeer
      ? accountPresenceLabel(activeDirectPeer)
    : appCopy.t(activeChat.membersCount);
  const callActionCapability = (() => {
    if (!CALLS_ENABLED) return { available: false, reason: 'Tính năng cuộc gọi đang tạm ẩn theo cấu hình doanh nghiệp.' };
    if (chatMode !== 'tinode') return { available: false, reason: 'Cuộc gọi chỉ khả dụng khi đã kết nối Tinode realtime.' };
    if (activeCall) return { available: false, reason: 'Bạn đang có một cuộc gọi khác.' };
    if (activeChat.isChatbot) return { available: false, reason: 'Không thể gọi trợ lý chatbot.' };
    if (activeChat.isGroup) return { available: false, reason: 'Tinode 0.25.3 chỉ hỗ trợ cuộc gọi 1-1.' };
    if (activeChatBlockedByViewer) return { available: false, reason: 'Bạn cần bỏ chặn trước khi gọi.' };
    if (activeChatBlockedByPeer) return { available: false, reason: DIRECT_MESSAGE_BLOCKED_TEXT };
    if (activeChat.directMessagingBlocked) return { available: false, reason: DIRECT_MESSAGE_BLOCKED_TEXT };
    if (!activeChatMembers.length) return { available: false, reason: 'Cuộc trò chuyện chưa có người nhận.' };
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
  // Keep the current company visible for a single-tenant account; only other
  // active memberships are valid choices in the opened menu.
  const canSwitchTenant = tenantOptions.length > 0;
  const currentTenantId = String(profileAccount.tenantId || profileAccount.tenant_id || '').trim();
  const currentTenantOption = tenantOptions.find(option => String(option.id) === currentTenantId)
    || tenantOptions[0]
    || null;
  const tenantMenuOptions = currentTenantOption
    ? tenantOptions.filter(option => String(option.id) !== String(currentTenantOption.id))
    : tenantOptions;

  useEffect(() => {
    if (!canSwitchTenant || workspacePanel !== 'profile') setTenantSwitcherOpen(false);
  }, [canSwitchTenant, currentTenantId, workspacePanel]);

  useEffect(() => {
    if (!tenantSwitcherOpen || typeof document === 'undefined') return undefined;
    const closeTenantSwitcher = event => {
      if (!tenantSwitcherRef.current?.contains(event.target)) setTenantSwitcherOpen(false);
    };
    const handleTenantSwitcherKeyDown = event => {
      if (event.key === 'Escape') setTenantSwitcherOpen(false);
    };
    document.addEventListener('pointerdown', closeTenantSwitcher);
    document.addEventListener('keydown', handleTenantSwitcherKeyDown);
    return () => {
      document.removeEventListener('pointerdown', closeTenantSwitcher);
      document.removeEventListener('keydown', handleTenantSwitcherKeyDown);
    };
  }, [tenantSwitcherOpen]);

  useEffect(() => () => {
    if (voiceTimerRef.current) window.clearInterval(voiceTimerRef.current);
    voiceDiscardRef.current = true;
    mediaRecorderRef.current?.stream?.getTracks?.().forEach(track => track.stop());
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => {
    const sidebarViewerId = String(currentUser?.id || currentUser?.uid || '').trim();
    const sidebarTenantId = preferenceTenantId;
    if (
      typeof window === 'undefined'
      || !isLoggedIn
      || !sidebarViewerId
      || !sidebarTenantId
    ) {
      setIsPrimarySidebarPreferenceReady(false);
      return undefined;
    }
    let active = true;
    try {
      const scopedKey = primarySidebarStorageKey(sidebarViewerId, sidebarTenantId);
      let stored = window.localStorage.getItem(scopedKey);
      if (
        stored === null
        && canMigrateLegacyViewerPreference(
          PRIMARY_SIDEBAR_STORAGE_PREFIX,
          sidebarViewerId,
          sidebarTenantId,
          window.localStorage,
        )
      ) {
        const legacy = window.localStorage.getItem(PRIMARY_SIDEBAR_STORAGE_PREFIX);
        if (legacy === 'true' || legacy === 'false') {
          stored = legacy;
          window.localStorage.setItem(scopedKey, legacy);
          markLegacyViewerPreferenceMigrated(
            PRIMARY_SIDEBAR_STORAGE_PREFIX,
            sidebarViewerId,
            sidebarTenantId,
            window.localStorage,
          );
        }
      }
      if (active) {
        setIsPrimarySidebarCollapsed(stored === 'true');
        setIsPrimarySidebarPreferenceReady(true);
      }
    } catch {
      if (active) setIsPrimarySidebarPreferenceReady(true);
    }
    return () => { active = false; };
  }, [currentUser?.id, currentUser?.uid, isLoggedIn, preferenceTenantId]);

  useEffect(() => {
    const sidebarViewerId = String(currentUser?.id || currentUser?.uid || '').trim();
    const sidebarTenantId = preferenceTenantId;
    if (
      !isPrimarySidebarPreferenceReady
      || typeof window === 'undefined'
      || !isLoggedIn
      || !sidebarViewerId
      || !sidebarTenantId
    ) return;
    try {
      window.localStorage.setItem(
        primarySidebarStorageKey(sidebarViewerId, sidebarTenantId),
        String(isPrimarySidebarCollapsed),
      );
    } catch {
      // The layout still works when browser storage is unavailable.
    }
  }, [currentUser?.id, currentUser?.uid, isLoggedIn, isPrimarySidebarCollapsed, isPrimarySidebarPreferenceReady, preferenceTenantId]);

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
    if (!pinViewerId) {
      setPinLockConfig(null);
      setPinLockReady(true);
      setIsPinTabUnlocked(true);
      setPinUnlockValue('');
      setPinUnlockNotice('');
      return undefined;
    }
    let active = true;
    setPinLockReady(false);
    const config = readPinConfig(pinViewerId, undefined, pinViewerAliases, preferenceTenantId);
    if (active) {
      setPinLockConfig(config);
      setIsPinTabUnlocked(!config || hasPinTabAccess(pinViewerId, undefined, pinViewerAliases, preferenceTenantId));
      setPinLockReady(true);
      setPinUnlockValue('');
      setPinUnlockNotice('');
    }
    return () => { active = false; };
  }, [pinViewerAliases, pinViewerId, preferenceTenantId]);

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
    });
    setProfileNotice('');
  }, [workspacePanel, profileAccount.name, profileAccount.email]);
  const viewerId = chatMode === 'tinode'
    ? (currentUser?.tinodeUid || currentUser?.uid || currentUser?.id)
    : (currentUser?.id || currentUser?.uid);
  // Friend requests use Chatmgt account IDs, not Tinode topic UIDs.
  const managementViewerId = currentUser?.id || currentUser?.uid || '';
  const desktopNotificationPermission = typeof window !== 'undefined' && 'Notification' in window
    ? window.Notification.permission
    : 'unsupported';
  const notificationSettingsIdentity = useMemo(
    () => viewerPreferenceIdentityFromValues(
      currentUser?.id,
      currentUser?.uid,
      currentUser?.tinodeUid,
      currentUser?.tinode_uid,
      viewerId,
    ),
    [currentUser?.id, currentUser?.uid, currentUser?.tinodeUid, currentUser?.tinode_uid, viewerId],
  );
  const notificationSettingsViewerId = notificationSettingsIdentity.viewerId;
  const notificationSettingsViewerAliases = notificationSettingsIdentity.aliases;
  const unreadViewerId = chatMode === 'tinode' ? viewerId : managementViewerId;

  const conversationUnreadIndicators = room => {
    const roomId = String(room?.id || '');
    const boundary = unreadBoundaries[roomId] || null;
    const count = unreadCountForConversation(room, boundary);
    // Hide only the boundary already viewed; a newer unread tail must light up
    // again even when it is merged into the same conversation boundary.
    const hasUnread = unreadIndicatorVisible(boundary, count);
    const hasMention = Boolean(room?.isGroup && hasUnread && unreadMessagesForConversation(room, boundary, {
      viewerId: unreadViewerId,
    }).some(message => messageMentionsViewer(message, currentUser)));
    return {
      boundary,
      count,
      label: unreadBadgeLabel(count),
      hasUnread,
      hasMention,
    };
  };

  const rememberUnreadBoundary = useCallback((room, conversationId = room?.id) => {
    if (!room || room.isChatbot || room.id === 'empty' || !conversationId) return null;
    const key = String(conversationId);
    const knownRoom = conversationsRef.current[key];
    if (room.tinodeTopic && knownRoom?.tinodeTopic === room.tinodeTopic) {
      room = {
        ...room,
        ...mergeConversationReadState(knownRoom, room, { viewerId: unreadViewerId }),
        unreadThroughSeq: Math.max(Number(knownRoom.unreadThroughSeq) || 0, Number(room.unreadThroughSeq) || 0),
      };
    }
    const hasUnread = Number(room.badge) > 0 || Number(room.unreadFromSeq) > 0;
    const firstUnreadSeq = Number(room.unreadFromSeq) > 0
      ? Number(room.unreadFromSeq)
      : Number(room.readSeq) > 0 ? Number(room.readSeq) + 1 : 0;
    const boundary = hasUnread ? createUnreadBoundary(roomMessages(room), {
      viewerId: unreadViewerId,
      unreadCount: room.badge,
      firstUnreadSeq,
      lastUnreadSeq: room.unreadThroughSeq,
      lastReadAt: room.readAt || room.readBy?.[unreadViewerId] || '',
      topicName: room.tinodeTopic || '',
    }) : null;
    const existing = reconcileUnreadBoundary(unreadBoundariesRef.current[key], room, { viewerId: unreadViewerId });
    const merged = mergeUnreadBoundary(existing, boundary);
    if (merged === unreadBoundariesRef.current[key]) return merged;
    const next = { ...unreadBoundariesRef.current };
    if (merged) next[key] = merged;
    else delete next[key];
    unreadBoundariesRef.current = next;
    setUnreadBoundaries(next);
    return merged;
  }, [unreadViewerId]);

  const completeUnreadBoundary = useCallback(async (conversationId, boundaryOverride = null) => {
    const key = String(conversationId || '');
    const boundary = boundaryOverride || unreadBoundariesRef.current[key];
    if (!key || !boundary || String(currentChatIdRef.current) !== key || unreadCompletionRequestsRef.current.has(key)) return;
    const accountSession = accountSessionRef.current;
    const request = Symbol(key);
    unreadCompletionRequestsRef.current.set(key, request);
    const completedAt = new Date().toISOString();
    try {
      const rawRoom = conversationsRef.current[key] || conversationsRef.current[conversationId];
      const room = rawRoom ? safeNormalizeConversationForRender(rawRoom, key) : null;
      const completionReadSequence = unreadBoundaryReadSequence(boundary, roomMessages(room));
      let acknowledgedReadSeq = 0;
      if (chatMode === 'tinode') {
        const topicName = boundary.topicName || room?.tinodeTopic;
        if (!topicName || completionReadSequence <= 0) return;
        acknowledgedReadSeq = await tinodeClient.markRead(topicName, {
          throughSequence: completionReadSequence,
        });
        if (acknowledgedReadSeq <= 0) return;
      } else if (room?.isGroup) {
        markDemoGroupRead(key, unreadViewerId);
      } else {
        markDemoDirectRead(key, unreadViewerId);
      }
      if (accountSessionRef.current !== accountSession) return;
      const currentBoundary = unreadBoundariesRef.current[key];
      if (chatMode === 'demo' && unreadBoundaryHasNewerTail(currentBoundary, boundary)) return;
      unreadBoundaryJumpedRef.current.delete(key);
      const currentRoom = conversationsRef.current[key];
      if (!currentRoom) return;
      const readSeq = Math.max(Number(currentRoom.readSeq) || 0, acknowledgedReadSeq);
      const remainingBoundary = chatMode === 'tinode'
        ? reconcileUnreadBoundary(currentBoundary, { ...currentRoom, readSeq }, { viewerId: unreadViewerId })
        : null;
      const badge = chatMode === 'tinode'
        ? Math.max(Number(remainingBoundary?.unreadCount) || 0,
          Math.min(Number(currentRoom.badge) || 0, Math.max(0, (Number(currentRoom.unreadThroughSeq) || 0) - readSeq)))
        : 0;
      const readState = { readSeq, badge, unreadFromSeq: badge > 0 ? readSeq + 1 : 0,
        ...(chatMode === 'demo' ? { readAt: completedAt } : {}) };
      rememberUnreadBoundary({ ...currentRoom, ...readState }, key);
      setConversations(previous => {
        if (accountSessionRef.current !== accountSession) return previous;
        const previousRoom = previous[key]
          ? safeNormalizeConversationForRender(previous[key], key)
          : null;
        if (!previousRoom) return previous;
        const nextRoom = {
          ...previousRoom,
          ...readState,
          ...(chatMode === 'tinode' ? mergeConversationReadState(previousRoom, readState, { viewerId: unreadViewerId }) : {}),
        };
        const next = { ...previous, [key]: nextRoom };
        conversationsRef.current = next;
        return next;
      });
    } catch (error) {
      console.warn('ViChat: failed to acknowledge unread boundary', error);
    } finally {
      if (unreadCompletionRequestsRef.current.get(key) === request) unreadCompletionRequestsRef.current.delete(key);
    }
  }, [chatMode, unreadViewerId, rememberUnreadBoundary]);

  useEffect(() => {
    unreadBoundariesRef.current = {};
    unreadCompletionRequestsRef.current.clear();
    unreadBoundaryJumpedRef.current.clear();
    conversationNavigationRef.current += 1;
    setUnreadBoundaries({});
  }, [unreadViewerId, managementConversationSession]);

  // Demo restores can select a room before its unread cursor reaches a
  // realtime callback. Capture that initial room just like a Tinode event.
  const activeUnreadRoomId = activeChat.id;
  const activeUnreadRoomIsChatbot = activeChat.isChatbot;
  const activeUnreadRoomBadge = activeChat.badge;
  const activeUnreadRoomCursor = activeChat.unreadFromSeq;
  const activeUnreadRoomReadAt = activeChat.readAt;
  const activeUnreadRoomReadSeq = activeChat.readSeq;
  useEffect(() => {
    if (activeUnreadRoomIsChatbot || activeUnreadRoomId === 'empty') return;
    const room = conversationsRef.current[activeUnreadRoomId];
    if (!room) return;
    rememberUnreadBoundary(room, activeUnreadRoomId);
  }, [
    activeUnreadRoomId,
    activeUnreadRoomIsChatbot,
    activeUnreadRoomBadge,
    activeUnreadRoomCursor,
    activeUnreadRoomReadAt,
    activeUnreadRoomReadSeq,
    activeMessageCount,
    rememberUnreadBoundary,
  ]);

  const updateNotificationSettings = useCallback(patch => {
    setSettings(previous => {
      const next = normalizeNotificationSettings({ ...previous, ...patch });
      if (notificationSettingsViewerId) {
        writeNotificationSettings(
          notificationSettingsViewerId,
          next,
          undefined,
          notificationSettingsViewerAliases,
          preferenceTenantId,
        );
      }
      return next;
    });
  }, [notificationSettingsViewerAliases, notificationSettingsViewerId, preferenceTenantId]);

  useEffect(() => {
    if (!notificationSettingsViewerId) {
      setSettings({ ...DEFAULT_NOTIFICATION_SETTINGS });
      setNotificationSettingsNotice('');
      return;
    }
    setSettings(readNotificationSettings(
      notificationSettingsViewerId,
      undefined,
      notificationSettingsViewerAliases,
      preferenceTenantId,
    ));
    setNotificationSettingsNotice('');
  }, [notificationSettingsViewerAliases, notificationSettingsViewerId, preferenceTenantId]);

  const updateKeyboardShortcutSettings = useCallback(nextValue => {
    const next = normalizeKeyboardShortcutSettings(nextValue);
    if (notificationSettingsViewerId) {
      writeKeyboardShortcutSettings(
        notificationSettingsViewerId,
        next,
        undefined,
        notificationSettingsViewerAliases,
        preferenceTenantId,
      );
    }
    setKeyboardShortcutSettings(next);
    setKeyboardShortcutNotice('');
    return next;
  }, [notificationSettingsViewerAliases, notificationSettingsViewerId, preferenceTenantId]);

  const updateKeyboardShortcutBinding = useCallback((actionId, shortcut) => {
    const normalized = normalizeShortcut(shortcut);
    if (normalized && !isSafeShortcut(normalized)) {
      setKeyboardShortcutNotice('keyboardShortcutsInvalid');
      return false;
    }
    const nextBindings = {
      ...keyboardShortcutSettings.bindings,
      [actionId]: normalized,
    };
    if (shortcutConflict(nextBindings, normalized, actionId)) {
      setKeyboardShortcutNotice('keyboardShortcutsConflict');
      return false;
    }
    updateKeyboardShortcutSettings({
      ...keyboardShortcutSettings,
      bindings: nextBindings,
    });
    return true;
  }, [keyboardShortcutSettings, updateKeyboardShortcutSettings]);

  const resetKeyboardShortcut = useCallback(actionId => {
    const action = SHORTCUT_ACTIONS.find(item => item.id === actionId);
    if (!action) return;
    if (updateKeyboardShortcutBinding(actionId, action.defaultShortcut)) setCapturingShortcutAction('');
  }, [updateKeyboardShortcutBinding]);

  const clearKeyboardShortcut = useCallback(actionId => {
    if (updateKeyboardShortcutBinding(actionId, null)) setCapturingShortcutAction('');
  }, [updateKeyboardShortcutBinding]);

  const handleKeyboardShortcutCapture = useCallback(event => {
    const actionId = String(event.currentTarget?.dataset?.shortcutAction || '').trim();
    if (!actionId) return;
    if (event.key === 'Tab') {
      setCapturingShortcutAction(previous => previous === actionId ? '' : previous);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const shortcut = shortcutFromKeyboardEvent(event);
    if (!shortcut || !isSafeShortcut(shortcut)) {
      setKeyboardShortcutNotice('keyboardShortcutsInvalid');
      return;
    }
    if (updateKeyboardShortcutBinding(actionId, shortcut)) setCapturingShortcutAction('');
  }, [updateKeyboardShortcutBinding]);

  useEffect(() => {
    if (!notificationSettingsViewerId) {
      setKeyboardShortcutSettings(normalizeKeyboardShortcutSettings(DEFAULT_KEYBOARD_SHORTCUT_SETTINGS));
      setKeyboardShortcutNotice('');
      setCapturingShortcutAction('');
      return;
    }
    setKeyboardShortcutSettings(readKeyboardShortcutSettings(
      notificationSettingsViewerId,
      undefined,
      notificationSettingsViewerAliases,
      preferenceTenantId,
    ));
    setKeyboardShortcutNotice('');
    setCapturingShortcutAction('');
  }, [notificationSettingsViewerAliases, notificationSettingsViewerId, preferenceTenantId]);

  useEffect(() => {
    const categoryState = managementViewerId
      ? readConversationCategoryState(managementViewerId, notificationSettingsViewerAliases, preferenceTenantId)
      : { categories: CONVERSATION_CATEGORY_OPTIONS.map(category => ({ ...category })), assignments: {} };
    setConversationCategoryOptions(categoryState.categories);
    setConversationCategories(categoryState.assignments);
    setConversationCategoryMenuOpen(false);
    setConversationCategoryManagerOpen(false);
  }, [managementViewerId, notificationSettingsViewerAliases, preferenceTenantId]);

  const conversationBackgroundViewerId = managementViewerId || viewerId || '';
  const conversationBackgroundViewerAliases = notificationSettingsViewerAliases;
  const conversationBackgroundTenantId = preferenceTenantId || 'default';
  const activeBackgroundConversationId = String(activeChat.managementId || activeChat.id || '');
  const activeBackgroundStateKey = conversationBackgroundStorageKey(
    conversationBackgroundViewerId,
    conversationBackgroundTenantId,
    activeBackgroundConversationId,
  );
  const hasLoadedActiveBackground = Object.prototype.hasOwnProperty.call(
    conversationBackgrounds,
    activeBackgroundStateKey,
  );
  const activeBackgroundPreference = hasLoadedActiveBackground
    ? conversationBackgrounds[activeBackgroundStateKey]
    : (activeChat.conversationBackground !== undefined
      ? (activeChat.conversationBackground
        ? { ...activeChat.conversationBackground, scope: CONVERSATION_BACKGROUND_SCOPES.SHARED }
        : createClearedConversationBackground(CONVERSATION_BACKGROUND_SCOPES.SHARED))
      : null);
  const activeConversationBackground = activeBackgroundPreference?.cleared
    ? null
    : activeBackgroundPreference;
  const activeConversationBackgroundSource = useConversationBackgroundSource(
    activeConversationBackground,
    activeBackgroundStateKey,
  );

  useEffect(() => {
    setConversationBackgrounds({});
    setIsConversationBackgroundOpen(false);
    setConversationBackgroundSelection(null);
    setConversationBackgroundCropFile(null);
  }, [conversationBackgroundViewerId, conversationBackgroundTenantId]);

  useEffect(() => {
    setConversationBackgroundCropFile(null);
  }, [activeBackgroundConversationId]);

  useEffect(() => {
    if (!conversationBackgroundViewerId || !activeBackgroundConversationId || activeChat.id === 'empty') return undefined;
    let active = true;
    const localPreference = readConversationBackgroundPreference(
      conversationBackgroundViewerId,
      conversationBackgroundTenantId,
      activeBackgroundConversationId,
      undefined,
      conversationBackgroundViewerAliases,
    );
    const shared = activeChat.conversationBackground !== undefined
      ? normalizeConversationBackground({
        ...activeChat.conversationBackground,
        scope: CONVERSATION_BACKGROUND_SCOPES.SHARED,
      })
      : undefined;
    const local = localPreference
      ? (localPreference.background || createClearedConversationBackground(localPreference.scope))
      : null;
    const source = localPreference ? local : shared;
    if (!source) {
      setConversationBackgrounds(previous => ({ ...previous, [activeBackgroundStateKey]: null }));
      return () => { active = false; };
    }
    if (!source.customKey) {
      setConversationBackgrounds(previous => ({ ...previous, [activeBackgroundStateKey]: source }));
      return () => { active = false; };
    }
    readConversationBackgroundFile(
      conversationBackgroundViewerId,
      conversationBackgroundTenantId,
      activeBackgroundConversationId,
      undefined,
      conversationBackgroundViewerAliases,
    )
      .then(fileRecord => {
        if (!active) return;
        setConversationBackgrounds(previous => ({
          ...previous,
          [activeBackgroundStateKey]: fileRecord || source,
        }));
      })
      .catch(() => {
        if (active) setConversationBackgrounds(previous => ({ ...previous, [activeBackgroundStateKey]: source }));
      });
    return () => { active = false; };
  }, [
    conversationBackgroundViewerId,
    conversationBackgroundViewerAliases,
    conversationBackgroundTenantId,
    preferenceTenantId,
    activeBackgroundConversationId,
    activeBackgroundStateKey,
    activeChat.id,
    activeChat.isGroup,
    activeChat.conversationBackground,
  ]);

  useEffect(() => {
    let active = true;
    setCustomNotificationSound(null);
    setIsLoadingCustomNotificationSound(Boolean(notificationSettingsViewerId));
    if (!notificationSettingsViewerId) return undefined;

    readCustomNotificationSound(
      notificationSettingsViewerId,
      undefined,
      notificationSettingsViewerAliases,
      preferenceTenantId,
    )
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
  }, [notificationSettingsViewerAliases, notificationSettingsViewerId, preferenceTenantId]);

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
      const savedSound = await writeCustomNotificationSound(
        notificationSettingsViewerId,
        file,
        undefined,
        notificationSettingsViewerAliases,
        preferenceTenantId,
      );
      setCustomNotificationSound(savedSound);
      updateNotificationSettings({ sound: CUSTOM_NOTIFICATION_SOUND_ID, sounds: true });
      setNotificationSettingsNotice(`Đã lưu âm báo "${savedSound.name}" trên thiết bị này.`);
    } catch (error) {
      setNotificationSettingsNotice(error?.message || 'Không thể lưu file âm thanh trên thiết bị này.');
    } finally {
      setIsSavingCustomNotificationSound(false);
    }
  }, [notificationSettingsViewerAliases, notificationSettingsViewerId, preferenceTenantId, updateNotificationSettings]);

  const handleRemoveCustomNotificationSound = useCallback(async () => {
    if (!notificationSettingsViewerId || isSavingCustomNotificationSound) return;
    setIsSavingCustomNotificationSound(true);
    setNotificationSettingsNotice('');
    try {
      await deleteCustomNotificationSound(
        notificationSettingsViewerId,
        undefined,
        notificationSettingsViewerAliases,
        preferenceTenantId,
      );
      setCustomNotificationSound(null);
      updateNotificationSettings({ sound: DEFAULT_NOTIFICATION_SETTINGS.sound });
      setNotificationSettingsNotice('Đã xóa âm báo tùy chỉnh khỏi thiết bị này.');
    } catch (error) {
      setNotificationSettingsNotice(error?.message || 'Không thể xóa file âm thanh.');
    } finally {
      setIsSavingCustomNotificationSound(false);
    }
  }, [
    isSavingCustomNotificationSound,
    notificationSettingsViewerAliases,
    notificationSettingsViewerId,
    preferenceTenantId,
    updateNotificationSettings,
  ]);

  const pinValidationMessage = useCallback(errorCode => {
    if (errorCode === PIN_VALIDATION_ERRORS.REQUIRED) return appCopy.pinRequired;
    if (errorCode === PIN_VALIDATION_ERRORS.DIGITS_ONLY) return appCopy.pinDigitsOnly;
    if (errorCode === PIN_VALIDATION_ERRORS.LENGTH) return appCopy.pinLength;
    return appCopy.pinLength;
  }, [appCopy]);

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
      markPinTabUnlocked(pinViewerId, undefined, pinViewerAliases, preferenceTenantId);
      setIsPinTabUnlocked(true);
      setPinUnlockValue('');
    } finally {
      setIsVerifyingPin(false);
    }
  }, [appCopy.pinWrong, isVerifyingPin, pinLockConfig, pinValidationMessage, pinUnlockValue, pinViewerAliases, pinViewerId, preferenceTenantId]);

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
      ...roomParticipantIds(activeChat)
        .map(identity => findAccount(directoryAccounts, identity))
        .filter(Boolean),
    ];
    const seen = new Set();
    const candidates = rawMembers.reduce((members, member) => {
      const account = findAccountByIdentities(directoryAccounts, [
        member?.id,
        member?.uid,
        member?.tinodeUid,
        member?.tinode_uid,
        member?.name,
      ]);
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
      const isChatbot = [candidate.id, candidate.tinodeUid, candidate.username]
        .filter(Boolean)
        .some(value => String(value).trim() === String(CHATBOT_ACCOUNT.tinodeUid || '').trim()
          || String(value).trim().toLowerCase() === CHATBOT_ACCOUNT.id);
      if (!identity || !mentionCandidateText(candidate) || candidate.type === 'bot' || isChatbot || seen.has(identity)) {
        return members;
      }
      seen.add(identity);
      members.push(candidate);
      return members;
    }, []);
    if (chatMode === 'tinode' && CHATBOT_ACCOUNT.tinodeUid) {
      candidates.push({
        ...CHATBOT_ACCOUNT,
        id: CHATBOT_ACCOUNT.id,
        type: 'bot',
        username: 'vichatai',
        mentionAliases: ['vichatai', 'vichat ai'],
      });
    }
    return candidates;
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

  const applyPresenceSnapshot = useCallback((snapshot, lastSeenSnapshot = {}) => {
    const currentAccount = currentUserRef.current;
    const accounts = filterAccountsByTenant(
      directoryAccountsRef.current,
      currentAccount,
    );
    updateDirectoryAccounts(previous => updateAccountPresence(previous, snapshot, currentAccount, lastSeenSnapshot));
    updateDirectoryResults(previous => updateAccountPresence(previous, snapshot, currentAccount, lastSeenSnapshot));
    setConversations(previous => {
      let changed = false;
      const next = Object.fromEntries(safeConversationEntries(previous).map(([id, room]) => {
        let membersChanged = false;
        const members = roomMembers(room).map(member => {
          const account = findAccount(accounts, member.id || member.uid || member.name);
          const isCurrentAccount = identitiesOverlap(member, currentAccount) || identitiesOverlap(account, currentAccount);
          const online = isCurrentAccount
            ? undefined
            : snapshotPresence(member, snapshot) ?? snapshotPresence(account, snapshot);
          const incomingLastSeenAt = isCurrentAccount
            ? undefined
            : latestTimestampValue(
              snapshotLastSeenAt(member, lastSeenSnapshot),
              snapshotLastSeenAt(account, lastSeenSnapshot),
            ) || undefined;
          const lastSeenAt = incomingLastSeenAt === undefined
            ? undefined
            : latestTimestampValue(member.lastSeenAt ?? member.last_seen_at, incomingLastSeenAt);
          const onlineChanged = online !== undefined && member.online !== online;
          const lastSeenChanged = online === false
            && lastSeenAt !== undefined
            && (member.lastSeenAt ?? member.last_seen_at) !== lastSeenAt;
          if (!onlineChanged && !lastSeenChanged) return member;
          membersChanged = true;
          return {
            ...member,
            ...(online !== undefined ? { online } : {}),
            ...(lastSeenChanged ? { lastSeenAt, last_seen_at: lastSeenAt } : {}),
          };
        });
        const peer = !room.isGroup && !room.isChatbot
          ? members.find(member => !identitiesOverlap(member, currentAccount)) || members[0]
          : null;
        const membersCount = peer ? (
          peer.online ? 'Trực tuyến' : 'Ngoại tuyến'
        ) : room.membersCount;
        if (!membersChanged && membersCount === room.membersCount) return [id, room];
        changed = true;
        return [id, { ...room, members, membersCount }];
      }));
      return changed ? next : previous;
    });
  }, [updateDirectoryAccounts, updateDirectoryResults]);

  useEffect(() => {
    if (!currentUser || directoryAccounts.length === 0) return;
    setConversations(previous => {
      let changed = false;
      const next = Object.fromEntries(safeConversationEntries(previous).map(([id, room]) => {
        const personalized = personalizeConversationForViewer(room, directoryAccounts, currentUser);
        if (personalized !== room) changed = true;
        return [id, personalized];
      }));
      if (changed) conversationsRef.current = next;
      return changed ? next : previous;
    });
  }, [currentUser, directoryAccounts, notificationSettingsViewerAliases]);

  useEffect(() => {
    if (!notificationSettingsViewerId) {
      setMessageActions({});
      return;
    }
    setMessageActions(readMessageActions(
      notificationSettingsViewerId,
      undefined,
      notificationSettingsViewerAliases,
      preferenceTenantId,
    ));
  }, [notificationSettingsViewerAliases, notificationSettingsViewerId, preferenceTenantId]);
  const activeAdminAccount = resolveGroupAdministrator(activeChat, directoryAccounts);
  const activeAdminName = activeAdminAccount?.name || activeChat.admin || appCopy.t('Chưa xác định');
  const isActiveGroupOwner = activeChat.isGroup
    && groupRoleForIdentity(activeChat, currentUser, directoryAccounts) === 'OWNER';

  // Do not auto-scroll while the unread boundary is being reviewed.
  const scrollToBottom = () => {
    if (unreadBoundariesRef.current[currentChatIdRef.current]?.revealed) return;
    if (!chatIsNearBottomRef.current) return;
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      setShowLatestMessageButton(false);
    }
  };

  const scrollToLatestConversation = (conversationId, behavior = 'auto') => {
    if (String(currentChatIdRef.current) !== String(conversationId)) return;
    const root = chatMessagesRef.current;
    if (!root) return;
    if (typeof root.scrollTo === 'function') {
      root.scrollTo({ top: root.scrollHeight, behavior });
    } else {
      root.scrollTop = root.scrollHeight;
    }
    chatIsNearBottomRef.current = true;
    setShowLatestMessageButton(false);
  };

  const queueConversationLatestScroll = (conversationId, navigation = conversationNavigationRef.current) => {
    if (conversationScrollFrameRef.current) {
      window.cancelAnimationFrame(conversationScrollFrameRef.current);
    }
    conversationScrollFrameRef.current = window.requestAnimationFrame(() => {
      conversationScrollFrameRef.current = window.requestAnimationFrame(() => {
        conversationScrollFrameRef.current = null;
        if (navigation !== conversationNavigationRef.current) return;
        scrollToLatestConversation(conversationId);
      });
    });
  };

  const scrollToLatestMessage = async () => {
    const key = String(currentChatIdRef.current);
    const accountSession = accountSessionRef.current;
    const navigation = ++conversationNavigationRef.current;
    const isCurrent = () => accountSessionRef.current === accountSession
      && String(currentChatIdRef.current) === key
      && conversationNavigationRef.current === navigation;
    try {
      const room = conversationsRef.current[key];
      if (chatMode === 'tinode' && room?.tinodeTopic) {
        const loaded = await tinodeClient.refreshConversation(room.tinodeTopic);
        if (!isCurrent()) return;
        setConversations(previous => {
          if (!isCurrent() || !previous[key]) return previous;
          const incoming = { ...loaded, id: key, tinodeTopic: room.tinodeTopic, accountSession: room.accountSession };
          const next = { ...previous, [key]: safeMergeTinodeConversation(previous[key], incoming, { viewerId }) };
          conversationsRef.current = next;
          return next;
        });
      }
      await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      if (!isCurrent()) return;
      const boundary = unreadBoundariesRef.current[key];
      if (boundary) {
        const next = { ...unreadBoundariesRef.current, [key]: { ...boundary, revealed: false } };
        unreadBoundariesRef.current = next;
        setUnreadBoundaries(next);
      }
      scrollToLatestConversation(key);
      await new Promise(resolve => window.requestAnimationFrame(resolve));
      if (!isCurrent() || document.visibilityState === 'hidden') return;
      const latest = visibleMessagesRef.current.at(-1);
      const latestSequence = Math.max(Number(latest?.seq) || 0, Number(latest?.pollActivitySeq) || 0);
      const target = latest && messageElementsRef.current.get(messageActionKey(key, latest.id));
      const root = chatMessagesRef.current;
      if (latest && (chatMode !== 'tinode' || latestSequence > 0) && root
        && isUnreadMessageVisible(target?.getBoundingClientRect(), root.getBoundingClientRect())) {
        const pending = unreadBoundariesRef.current[key];
        if (pending) await completeUnreadBoundary(key, {
          ...pending,
          lastUnreadId: latest.id,
          lastUnreadSeq: latestSequence,
          lastUnreadAt: latest.createdAt || '',
        });
      }
    } catch (error) {
      if (isCurrent()) setChatError(error?.message || 'Không tải được tin nhắn mới nhất. Vui lòng thử lại.');
    }
  };

  const updateMessageScrollState = useCallback(() => {
    const root = chatMessagesRef.current;
    if (!root) return;
    const isNearBottom = root.scrollHeight - root.scrollTop - root.clientHeight <= 72;
    chatIsNearBottomRef.current = isNearBottom;
    setShowLatestMessageButton(previous => previous === !isNearBottom ? previous : !isNearBottom);
  }, []);

  const interruptConversationNavigation = () => {
    conversationNavigationRef.current += 1;
  };

  useEffect(() => {
    const root = chatMessagesRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (chatIsNearBottomRef.current && !unreadBoundariesRef.current[currentChatIdRef.current]?.revealed) {
        root.scrollTop = root.scrollHeight;
      }
      updateMessageScrollState();
    });
    observer.observe(root);
    const content = root.querySelector('.chat-messages-content');
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, [currentChatId, updateMessageScrollState]);

  useEffect(() => () => {
    if (conversationScrollFrameRef.current) {
      window.cancelAnimationFrame(conversationScrollFrameRef.current);
    }
  }, []);

  useEffect(() => {
    setIsTyping(false);
    return () => {
      chatbotRequestRef.current?.controller.abort();
      chatbotRequestRef.current = null;
    };
  }, [isLoggedIn, managementViewerId, currentUser?.tenantId]);

  useEffect(() => {
    chatIsNearBottomRef.current = true;
    setShowLatestMessageButton(false);
  }, [currentChatId]);

  useEffect(() => {
    if (!messageSearchQuery.trim()) return;
    chatIsNearBottomRef.current = true;
    setShowLatestMessageButton(false);
  }, [messageSearchQuery]);

  useEffect(() => {
    scrollToBottom();
  }, [activeMessageCount, activeMessageTailKey, currentChatId, isTyping]);

  useEffect(() => {
    const closeMenus = event => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      setMessageMenu(null);
      setPinnedMessageMenu(null);
      setConversationMenu(null);
      setGroupMemberMenuId('');
      setConversationCategoryMenuOpen(false);
      if (event.type === 'keydown') {
        setProfileContact(null);
        setReactionDetails(null);
      }
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
      safeConversationValues(conversations),
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

  useEffect(() => {
    if (!isLoggedIn || !chatManagementService.remote || !managementViewerId) return undefined;
    const accountSession = accountSessionRef.current;
    let cancelled = false;
    let syncing = false;
    const syncDirectBlockStates = async () => {
      if (cancelled || syncing || accountSessionRef.current !== accountSession) return;
      syncing = true;
      try {
        const states = await chatManagementService.listDirectBlockStates();
        if (cancelled || accountSessionRef.current !== accountSession) return;
        const statesById = new Map(states.map(state => [String(state.conversationId), state]));
        setConversations(previous => {
          let changed = false;
          const next = Object.fromEntries(safeConversationEntries(previous).map(([id, room]) => {
            if (room.isGroup || room.isChatbot) return [id, room];
            const state = statesById.get(String(room.managementId || room.id));
            if (!state) return [id, room];
            const blockedByViewer = state.blockedByViewer === true;
            const blockedByPeer = state.blockedByPeer === true;
            const directMessagingBlocked = state.directMessagingBlocked === true;
            if (
              room.blockedByViewer === blockedByViewer
              && room.blockedByPeer === blockedByPeer
              && room.directMessagingBlocked === directMessagingBlocked
              && room.directBlockExplicit === true
            ) return [id, room];
            changed = true;
            return [id, {
              ...room,
              blockedByViewer,
              blockedByPeer,
              directMessagingBlocked,
              directBlockExplicit: true,
            }];
          }));
          if (!changed) return previous;
          conversationsRef.current = next;
          return next;
        });
      } catch {
        // Bridge enforcement remains authoritative during a transient poll failure.
      } finally {
        syncing = false;
      }
    };
    void syncDirectBlockStates();
    const timer = window.setInterval(syncDirectBlockStates, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isLoggedIn, managementViewerId]);

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
        : applyLocalConversationPins(managedRoomsSnapshot, managementUserId, notificationSettingsViewerAliases, preferenceTenantId),
      managementUserId,
      notificationSettingsViewerAliases,
      preferenceTenantId,
    );
    const previousRooms = Object.fromEntries(safeConversationEntries(conversationsRef.current));
    const nextRooms = Object.fromEntries(safeConversationEntries(previousRooms).filter(([, room]) => (
      room.isChatbot
      || (!room.managementId && !room.tinodeTopic && roomFriendEvents(room).length > 0)
      // Keep an optimistic direct room visible while the create/bind request
      // is still running, otherwise the refresh can select another room.
      || (room.pendingDirect && room.accountSession === accountSession)
    )));
    safeConversationEntries(managedRooms).forEach(([id, room]) => {
      const previousRoom = previousRooms[id] || safeConversationValues(previousRooms)
        .find(candidate => room.tinodeTopic && candidate.tinodeTopic === room.tinodeTopic);
      nextRooms[id] = safeMergeTinodeConversation(previousRoom, room);
    });
    conversationsRef.current = nextRooms;
    setConversations(nextRooms);
    tinodeClient.setAllowedConversationTopics(managedTinodeTopics(nextRooms));
    const selectedRoom = previousRooms[currentChatIdRef.current];
    if (!nextRooms[currentChatIdRef.current] && !selectedRoom?.pendingDirect) {
      setCurrentChatId(firstVisibleConversationId(nextRooms, {}, CHATBOT_ACCOUNT.id));
    }
    return managedRooms;
  }, [currentUser, directoryAccounts, notificationSettingsViewerAliases, preferenceTenantId]);

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
    let preparedRoom = room;
    let createdGroupTopic = false;
    let createdGroupAvatar = '';
    // Refresh the authoritative Chatmgt snapshot before trusting a remote
    // topic; a browser room can retain a stale group binding.
    const shouldPrepare = chatManagementService.remote
      || !String(room?.tinodeTopic || '').trim();

    if (shouldPrepare) {
      preparedRoom = await chatManagementService.prepareTinodeConversation(managementConversationId);
      if (accountSessionRef.current !== accountSession) throw new Error('Phiên tài khoản đã thay đổi.');
    }
    let topicName = resolvePreparedTinodeTopic(
      room,
      shouldPrepare ? preparedRoom : null,
      chatManagementService.getTinodeTopic(managementUserId, managementConversationId),
    );

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
    const cachedRoomAvatar = conversationsRef.current[room.id]?.avatarUrl || '';
    let liveGroupAvatar = '';
    if (preparedRoom.isGroup && !preparedRoom.avatarUrl && !room.avatarUrl && !cachedRoomAvatar) {
      if (!groupAvatarSyncRef.current.has(topicName)) {
        liveGroupAvatar = await tinodeClient.getConversationAvatar(topicName).catch(() => '');
        groupAvatarSyncRef.current.set(topicName, liveGroupAvatar);
      } else {
        liveGroupAvatar = groupAvatarSyncRef.current.get(topicName) || '';
      }
    }
    const persistedGroupAvatar = preparedRoom.avatarUrl || room.avatarUrl || cachedRoomAvatar || '';
    const effectiveGroupAvatar = persistedGroupAvatar || createdGroupAvatar || liveGroupAvatar || '';
    try {
      await chatManagementService.bindTinodeTopic(
        managementUserId,
        managementConversationId,
        topicName,
        { avatarUrl: effectiveGroupAvatar },
      );
      if (!preparedRoom.isGroup) await tinodeClient.clearConversationDeletion(topicName).catch(() => {});
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
        // Never replace a known avatar with an empty realtime snapshot.
        ...(effectiveGroupAvatar ? { avatarUrl: effectiveGroupAvatar } : {}),
        accountSession,
        ...(preparedRoom.isGroup ? {} : { deletedAt: '' }),
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
      if (!handleDirectMessageBlockedError(error, room.id || currentChatIdRef.current)) {
        setChatError(error?.message || 'Không thể bắt đầu cuộc gọi.');
      }
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
    if (!message || messageNotificationActorId(message) === viewerId || typeof window === 'undefined') return;
    const shouldAlert = document.visibilityState === 'hidden' || currentChatIdRef.current !== stateId;
    if (!shouldAlert) return;
    const notificationRoom = conversationsRef.current[stateId] || conversation;
    if (isConversationMuted(notificationRoom?.notificationMutedUntil)) return;

    if (settings.sounds) playNotificationSound(settings.sound);
    if (settings.desktopNotifications && desktopNotificationPermission === 'granted') {
      try {
        const senderName = message.pollActivityActorName || message.senderName || notificationRoom?.name || 'Tin nhắn mới';
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
    const reopenDirectConversation = async (stateId, currentRoom, conversation) => {
      if (
        !chatManagementService.remote
        || !currentRoom
        || currentRoom.isGroup
        || currentRoom.isChatbot
        || !isManagementConversationId(currentRoom.managementId || currentRoom.id)
      ) return;
      const deletedAt = Date.parse(currentRoom.deletedAt || '') || 0;
      if (!deletedAt || !roomMessages(conversation).some(message => messageTimestamp(message) > deletedAt)) return;
      const reopenKey = `${accountSession}:${conversation.id}`;
      if (reopeningDirectTopicsRef.current.has(reopenKey)) return;
      const viewerId = String(currentUserRef.current?.id || currentUserRef.current?.uid || '');
      const peerId = roomParticipantIds(currentRoom)
        .map(String)
        .find(participantId => participantId && participantId !== viewerId)
        || String(currentRoom.directContactId || '').trim();
      if (!peerId || peerId === viewerId) return;
      reopeningDirectTopicsRef.current.add(reopenKey);
      try {
        const reopened = await chatManagementService.createConversation({
          subject: currentRoom.name || 'Cuoc tro chuyen',
          isGroup: false,
          participantIds: [peerId],
          properties: {},
        });
        if (accountSessionRef.current !== accountSession) return;
        const managementId = String(reopened?.managementId || reopened?.id || currentRoom.managementId || stateId);
        const topicName = String(reopened?.tinodeTopic || conversation.id || currentRoom.tinodeTopic || '').trim();
        if (topicName) {
          await tinodeClient.clearConversationDeletion(topicName).catch(() => {});
          tinodeClient.allowConversationTopic(topicName);
        }
        await refreshManagementConversations(accountSession);
        if (accountSessionRef.current !== accountSession) return;
        setConversations(previous => {
          const current = safeNormalizeConversationForRender(previous[stateId] || currentRoom, stateId);
          if (!current) return previous;
          const managementSnapshot = {
            ...reopened,
            id: stateId,
            managementId,
            tinodeTopic: topicName,
            accountSession,
            managementSnapshot: true,
            deletedAt: '',
          };
          const refreshed = safeMergeTinodeConversation(current, managementSnapshot);
          const live = safeMergeTinodeConversation(refreshed, {
            ...conversation,
            id: stateId,
            managementId,
            tinodeTopic: conversation.id || topicName,
            accountSession,
            deletedAt: '',
            messages: roomMessages(conversation).filter(message => messageTimestamp(message) > deletedAt),
            friendEvents: roomFriendEvents(conversation).filter(message => messageTimestamp(message) > deletedAt),
          });
          const next = {
            ...previous,
            [stateId]: {
              ...live,
              pendingDirect: false,
              directProvisioning: 'ready',
            },
          };
          conversationsRef.current = next;
          return next;
        });
      } catch (error) {
        // The live message remains visible; the next open/send retries the
        // Chatmgt marker clear through the normal direct binding flow.
        console.warn('ViChat: direct conversation reopen failed', error);
      } finally {
        reopeningDirectTopicsRef.current.delete(reopenKey);
      }
    };
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
        if (event.uid) {
          applyPresenceSnapshot({ [event.uid]: Boolean(event.online) });
        }
        return;
      }
      if (event.type === 'presence-snapshot') {
        applyPresenceSnapshot(event.snapshot || {}, event.lastSeenAt || event.last_seen_at || {});
        return;
      }
      if (event.type === 'group-settings' && event.topic) {
        const nextSettings = normalizeGroupSettings(event.groupSettings);
        setConversations(previous => {
          let changed = false;
          const next = Object.fromEntries(safeConversationEntries(previous).map(([id, room]) => {
            const roomTopic = room.tinodeTopic || room.topic?.name || room.id;
            if (room.accountSession !== accountSession || roomTopic !== event.topic || !room.isGroup) return [id, room];
            if (JSON.stringify(normalizeGroupSettings(room.groupSettings)) === JSON.stringify(nextSettings)) return [id, room];
            changed = true;
            return [id, { ...room, groupSettings: nextSettings }];
          }));
          if (changed) conversationsRef.current = next;
          return changed ? next : previous;
        });
        return;
      }
      if (event.type === 'receipt') {
        const receiptSequence = Number(event.seq);
        if (!event.topic || !Number.isFinite(receiptSequence) || receiptSequence <= 0) return;
        setConversations(previous => {
          let changed = false;
          const next = Object.fromEntries(safeConversationEntries(previous).map(([id, room]) => {
            if (room.accountSession !== accountSession || room.tinodeTopic !== event.topic) return [id, room];
            const messages = applyReceiptToMessages(roomMessages(room), {
              seq: receiptSequence,
              what: event.what,
              viewerId,
              receiptUser: event.from ? { id: event.from } : null,
            });
            if (messages === roomMessages(room)) return [id, room];
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
        const managedEntry = safeConversationEntries(currentRooms)
          .filter(([, room]) => room.accountSession === accountSession)
          .find(([, room]) => room.tinodeTopic === event.topic);
        const room = managedEntry?.[1];
        if (room?.directMessagingBlocked) {
          tinodeClient.sendCallSignal(event.topic, event.seq, 'hang-up').catch(() => {});
          return;
        }
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
        const profileAccount = findAccountByIdentities(directoryAccountsRef.current, [event.profile.id]);
        const profileIsAccountManaged = isAccountManaged(profileAccount)
          || (identitiesOverlap(currentUserRef.current, profileAccount) && isAccountManaged(currentUserRef.current));
        const profile = normalizeAccountShape(profileAccount
          ? {
            ...event.profile,
            id: profileAccount.id,
            uid: profileAccount.uid || profileAccount.id,
            tinodeUid: profileAccount.tinodeUid || profileAccount.tinode_uid || event.profile.id,
            ...(profileIsAccountManaged ? {
              name: profileAccount.name,
              avatar: profileAccount.avatar,
              defaultName: profileAccount.defaultName,
              default_name: profileAccount.default_name,
              accountManaged: profileAccount.accountManaged,
              account_managed: profileAccount.account_managed,
              authSource: profileAccount.authSource,
              auth_source: profileAccount.auth_source,
            } : {}),
          }
          : event.profile) || {};
        if (!profileIsAccountManaged) rememberAvatarOverride(profile, profile.avatar);
        if (identitiesOverlap(currentUser, profile)) {
          setCurrentUser(previous => ({
            ...previous,
            name: profile.name || previous?.name,
            avatar: profileIsAccountManaged ? (profileAccount?.avatar || previous?.avatar || '') : (profile.avatar || previous?.avatar || ''),
          }));
        }
        const updateAccount = account => mergeRealtimeAccountProfile(account, profile);
        updateDirectoryAccounts(previous => updateAccountProfiles(previous, profile, currentUserRef.current));
        updateDirectoryResults(previous => updateAccountProfiles(previous, profile, currentUserRef.current));
        setConversations(previous => Object.fromEntries(safeConversationEntries(previous).map(([id, room]) => {
          const members = roomMembers(room).map(updateAccount);
          const peer = !room.isGroup ? members.find(member => identitiesOverlap(member, profile)) : null;
          return [id, {
            ...room,
            ...(peer ? {
              name: peer.name || profile.name || room.name,
              avatarUrl: profile.avatar || room.avatarUrl || '',
            } : {}),
            members,
            messages: roomMessages(room).map(message => identitiesOverlap({ id: message.senderId }, profile)
              ? {
                ...message,
                senderName: peer?.name || profile.name || message.senderName,
                avatar: profile.avatar || message.avatar || '',
              }
              : message),
          }];
        })));
        return;
      }
      if (event.type === 'conversation' && event.conversation) {
        try {
        const expectedTinodeUid = String(currentUser?.tinodeUid || '');
        if (expectedTinodeUid && String(event.sessionUid || '') !== expectedTinodeUid) return;
        const conversation = personalizeConversationForViewer(
          normalizeTinodeConversation(event.conversation),
          directoryAccountsRef.current,
          currentUser,
        );
        const currentRooms = conversationsRef.current;
        const managedEntry = safeConversationEntries(currentRooms)
          .filter(([, room]) => room.accountSession === accountSession)
          .find(([, room]) => room.tinodeTopic === conversation.id);
        if (!managedEntry) return;
        const stateId = managedEntry[0];
        if (deletedConversationIdsRef.current.has(stateId) || deletedConversationIdsRef.current.has(conversation.id)) return;
        if (isConversationHiddenAfterDelete(conversation)) {
          // Keep a hidden direct tombstone subscribed so the first message
          // after deletion can re-open the room without restoring old history.
          setConversations(prev => {
            const previousRoom = prev[stateId];
            if (!previousRoom) return prev;
            const hiddenRoom = safeMergeTinodeConversation(previousRoom, {
              ...conversation,
              id: stateId,
              managementId: previousRoom.managementId,
              tinodeTopic: conversation.id,
              accountSession,
            });
            const next = {
              ...prev,
              [stateId]: {
                ...hiddenRoom,
                deletedAt: previousRoom.deletedAt || conversation.deletedAt,
                messages: [],
                friendEvents: [],
                lastMsg: '',
                time: '',
                badge: 0,
                unreadFromSeq: 0,
              },
            };
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
        const currentRoom = safeNormalizeConversationForRender(currentRooms[stateId], stateId);
        const latestConversationActivity = roomMessages(conversation).at(-1);
        const latestGroupNameActivity = latestConversationActivity?.type === 'system'
          && latestConversationActivity.action === 'group_name_changed'
          ? latestConversationActivity
          : null;
        const latestGroupAvatarActivity = latestConversationActivity?.type === 'system'
          && latestConversationActivity.action === 'group_avatar_changed'
          ? latestConversationActivity
          : null;
        const latestGroupRoleActivity = roomMessages(conversation).slice().reverse().find(message => (
          message?.type === 'system' && message.action === 'group_role_changed'
        )) || null;
        const groupRoleActivityEvent = latestGroupRoleActivity?.systemEvent || latestGroupRoleActivity;
        const roomWithRealtimeRole = applyGroupRoleEventToRoom(currentRoom, groupRoleActivityEvent);
        if (
          currentRoom?.isGroup
          && latestGroupAvatarActivity
          && conversation.avatarUrl
          && conversation.avatarUrl !== currentRoom.avatarUrl
        ) {
          const avatarEvent = latestGroupAvatarActivity.systemEvent || latestGroupAvatarActivity;
          const announcedAvatar = String(avatarEvent.avatarUrl || '').trim();
          if (!announcedAvatar || announcedAvatar === conversation.avatarUrl) {
            groupAvatarRefreshRef.current.delete(
              `${currentRoom.managementId || currentRoom.id}:${conversation.avatarUrl}`,
            );
          }
        }
        if (
          currentRoom?.isGroup
          && latestGroupNameActivity
          && chatManagementService.remote
          && isManagementConversationId(currentRoom.managementId || currentRoom.id)
        ) {
          const activityEvent = latestGroupNameActivity.systemEvent || latestGroupNameActivity;
          const activityKey = [
            conversation.id,
            latestGroupNameActivity.seq
              || latestGroupNameActivity.id
              || latestGroupNameActivity.createdAt,
          ].join(':');
          const renamedTo = String(activityEvent.newName || activityEvent.name || '').trim();
          const metadataDiffers = Boolean(
            conversation.name
            && conversation.name !== currentRoom.name
            && (!renamedTo || renamedTo === conversation.name)
          );
          if (metadataDiffers && !groupNameRefreshRef.current.has(activityKey)) {
            groupNameRefreshRef.current.add(activityKey);
            refreshManagementConversations(accountSession).catch(error => {
              groupNameRefreshRef.current.delete(activityKey);
              console.warn('ViChat: group name activity refresh failed', error);
            });
          }
        }
        if (
          currentRoom?.isGroup
          && latestGroupRoleActivity
          && chatManagementService.remote
          && isManagementConversationId(currentRoom.managementId || currentRoom.id)
        ) {
          const activityKey = [
            conversation.id,
            latestGroupRoleActivity.seq
              || latestGroupRoleActivity.id
              || latestGroupRoleActivity.createdAt,
          ].join(':');
          if (!groupRoleRefreshRef.current.has(activityKey)) {
            groupRoleRefreshRef.current.add(activityKey);
            refreshManagementConversations(accountSession).catch(error => {
              groupRoleRefreshRef.current.delete(activityKey);
              console.warn('ViChat: group role activity refresh failed', error);
            });
          }
        }
        void reopenDirectConversation(stateId, currentRoom, conversation);
        // Merge the read cursor before deriving notifications or boundaries.
        // A delayed Tinode snapshot must not make an already-read message look
        // new again.
        const effectiveReadState = mergeConversationReadState(roomWithRealtimeRole, conversation, { viewerId });
        const conversationWithReadState = {
          ...conversation,
          ...effectiveReadState,
        };
        const notificationMessages = (conversation.messages || [])
          .filter(message => (
            (message.type !== 'system'
              || currentRoom?.isGroup
              || ['poll_vote', 'poll_option_added', 'poll_locked'].includes(message.action))
            && messageNotificationActorId(message) !== viewerId
            && messageNotificationSequence(message) > 0
          ))
          .sort((first, second) => messageNotificationSequence(first) - messageNotificationSequence(second));
        const latestIncoming = notificationMessages.at(-1);
        if (latestIncoming) {
          const previousSeq = notificationBaselineRef.current.get(conversation.id);
          const latestSequence = messageNotificationSequence(latestIncoming);
          notificationBaselineRef.current.set(conversation.id, Math.max(previousSeq || 0, latestSequence));
          const notificationFloor = Math.max(
            previousSeq || 0,
            Number(effectiveReadState.readSeq) || 0,
          );
          if (
            previousSeq !== undefined
            && latestSequence > notificationFloor
            && openingConversationRef.current !== String(stateId)
          ) {
            const newMessage = notificationMessages
              .filter(message => messageNotificationSequence(message) > notificationFloor)
              .at(-1);
            showIncomingNotification(conversation, newMessage, stateId);
          }
        }

        rememberUnreadBoundary({
          ...conversationWithReadState,
          id: stateId,
          tinodeTopic: conversation.id,
        }, stateId);
        if (
          currentRoom?.isGroup
          && conversation.avatarUrl
          && conversation.avatarUrl !== currentRoom.avatarUrl
          && chatManagementService.remote
          && isManagementConversationId(currentRoom.managementId || currentRoom.id)
        ) {
          // Tinode metadata can be older than the persisted Chatmgt group
          // avatar after reconnect. Refresh the authoritative snapshot rather
          // than writing that realtime value back into Chatmgt. If an older
          // group has no Chatmgt avatar yet, backfill it from the verified
          // Tinode topic so it survives the next reload/deploy.
          const refreshKey = `${currentRoom.managementId || currentRoom.id}:${conversation.avatarUrl}`;
          if (groupAvatarRefreshRef.current.get(refreshKey) !== conversation.avatarUrl) {
            groupAvatarRefreshRef.current.set(refreshKey, conversation.avatarUrl);
            if (currentRoom.avatarUrl) {
              refreshManagementConversations(accountSession).catch(() => {});
            } else if (canManageGroupMembers(currentRoom, directoryAccounts, currentUser)) {
              chatManagementService.updateGroupProfile(
                currentRoom.managementId || currentRoom.id,
                { avatar: conversation.avatarUrl },
              ).then(() => refreshManagementConversations(accountSession)).catch(() => {});
            }
          }
        }
        setConversations(prev => {
          const previousRoom = safeNormalizeConversationForRender(prev[stateId], stateId);
          if (!previousRoom || previousRoom.accountSession !== accountSession || previousRoom.tinodeTopic !== conversation.id) return prev;
          const previousRoomWithRole = applyGroupRoleEventToRoom(previousRoom, groupRoleActivityEvent);
          const incoming = {
            ...conversationWithReadState,
            id: stateId,
            managementId: previousRoom.managementId,
            tinodeTopic: conversation.id,
            accountSession,
          };
          const next = {
            ...prev,
            [stateId]: safeMergeTinodeConversation(previousRoomWithRole, incoming, { viewerId }),
          };
          conversationsRef.current = next;
          return next;
        });
        } catch (conversationEventError) {
          console.error('ViChat: Failed to process conversation event', conversationEventError);
        }
        return;
      }
    });
  }, [isLoggedIn, chatMode, managementConversationSession, currentUser, directoryAccounts, applyPresenceSnapshot, clearActiveCall, refreshManagementConversations, showIncomingNotification, viewerId, managementViewerId, notificationSettingsViewerAliases, rememberUnreadBoundary, updateDirectoryAccounts, updateDirectoryResults]);

  // Keep every known Tinode topic subscribed after login. This is the piece
  // that makes unread badges and notifications realtime before a chat is opened.
  useEffect(() => {
    if (!isLoggedIn || chatMode !== 'tinode' || managementConversationSession !== accountSessionRef.current) return undefined;
    let cancelled = false;
    ensureTinodeSession()
      .then(() => tinodeClient.listConversations())
      .then(async tinodeConversations => {
        if (!cancelled) {
          setConnectionStatus('online');
          applyPresenceSnapshot(tinodeClient.getPresenceSnapshot());
        }
        if (!cancelled && Array.isArray(tinodeConversations)) {
          const knownRooms = safeConversationEntries(conversationsRef.current);
          tinodeConversations.forEach(conversation => {
            if (!conversation) return;
            const managedEntry = knownRooms.find(([, room]) => room.tinodeTopic === conversation.id);
            if (!managedEntry) return;
            const stateId = managedEntry[0];
            const mergedReadState = mergeConversationReadState(managedEntry[1], conversation, { viewerId });
            if (mergedReadState.badge <= 0 && mergedReadState.unreadFromSeq <= 0) return;
            rememberUnreadBoundary({
              ...conversation,
              ...mergedReadState,
              id: stateId,
              tinodeTopic: conversation.id,
            }, stateId);
          });
        }
        if (cancelled || !CHATBOT_ACCOUNT.tinodeUid) return;
        const sessionId = accountSessionRef.current;
        const [tinodeRoom, serverMessages] = await Promise.all([
          tinodeClient.openConversation(CHATBOT_ACCOUNT.tinodeUid).catch(() => null),
          loadChatbotMessagesFromServer(currentUserRef.current),
        ]);
        if (cancelled || accountSessionRef.current !== sessionId) return;
        setConversations(previous => {
          const room = previous[CHATBOT_ACCOUNT.id];
          if (!room || (room.accountSession && room.accountSession !== sessionId)) return previous;
          const messages = mergeChatbotMessages(
            roomMessages(room),
            tinodeRoom?.messages,
            serverMessages,
          );
          const latest = messages.at(-1);
          const next = {
            ...previous,
            [CHATBOT_ACCOUNT.id]: {
              ...room,
              messages,
              lastMsg: latest
                ? `${latest.sender === 'outgoing' ? 'Bạn' : CHATBOT_ACCOUNT.name}: ${latest.text || ''}`
                : room.lastMsg,
              time: latest?.time || room.time,
              updatedAt: latest?.createdAt || room.updatedAt,
            },
          };
          conversationsRef.current = next;
          return next;
        });
      })
      .catch(error => {
        if (!cancelled) {
          setConnectionStatus(tinodeClient.authenticated ? 'online' : 'offline');
          setChatError(error?.message || 'Không thể đồng bộ chat realtime.');
        }
      });
    return () => { cancelled = true; };
  }, [isLoggedIn, chatMode, managementConversationSession, ensureTinodeSession, applyPresenceSnapshot, rememberUnreadBoundary, viewerId]);

  const handleLoginSuccess = async (user, { source = 'credentials' } = {}) => {
    clearActiveCall();
    if (!EXTERNAL_CHAT_ONLY) await tinodeClient.logout();
    setLoginNotice('');
    const accountSession = ++accountSessionRef.current;
    directorySearchRequestRef.current += 1;
    managementConversationSessionRef.current = 0;
    setManagementConversationSession(0);
    const managementUserId = String(user.id || user.uid || '');
    const loginPreferenceIdentity = viewerPreferenceIdentity(user, managementUserId);
    const loginPreferenceTenantId = String(accountTenantId(user) || '').trim();
    setPinLockReady(false);
    setPinLockConfig(null);
    setIsPinTabUnlocked(false);
    setPinUnlockValue('');
    setPinUnlockNotice('');
    if (source !== 'restore' && managementUserId) {
      markPinTabUnlocked(
        loginPreferenceIdentity.viewerId,
        undefined,
        loginPreferenceIdentity.aliases,
        loginPreferenceTenantId,
      );
    }
    const initialChatbot = createChatbotConversation(loadChatbotMessages(managementUserId));
    const initialRooms = { [CHATBOT_ACCOUNT.id]: initialChatbot };
    forcedLogoutRef.current = false;
    isLoggingOutRef.current = false;
    setForcedLogoutSeconds(null);
    clearAllPastedAttachments();
    pastedAttachmentSubmitRef.current = false;
    groupSpamStatesRef.current.clear();
    setGroupSpamClock(Date.now());
    setDrafts({});
    setMessageMentions({});
    setMentionContext(null);
    setInputText('');
    setEditingMessage(null);
    setIsSavingMessageEdit(false);
    setEditHistoryMessage(null);
    setNotificationMuteDialog(null);
    setIsUpdatingNotificationMute(false);
    setNotificationClock(Date.now());
    setConversationCategories({});
    setConversationCategoryOptions(CONVERSATION_CATEGORY_OPTIONS.map(category => ({ ...category })));
    setConversationCategoryMenuOpen(false);
    setConversationCategoryManagerOpen(false);
    setMediaBrowserOpen(false);
    directoryAccountsRef.current = [];
    setDirectoryAccounts([]);
    setContactNicknames({});
    setContactNicknameDialog(null);
    setContactNicknameValue('');
    setIsSavingContactNickname(false);
    avatarOverridesRef.current.clear();
    groupAvatarSyncRef.current.clear();
    groupAvatarRefreshRef.current.clear();
    groupNameRefreshRef.current.clear();
    groupRoleRefreshRef.current.clear();
    setConversationMenu(null);
    setWorkspaceResults([]);
    setEnterpriseTaskSeed(null);
    conversationsRef.current = initialRooms;
    setConversations(initialRooms);
    setCurrentChatId(CHATBOT_ACCOUNT.id);
    deletedConversationIdsRef.current.clear();
    notificationBaselineRef.current.clear();
    openingConversationRef.current = '';
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
    setSessionRestoreState('ready');
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
          loadChatbotMessages(managementUserId),
          { accountSession, useTinode: tinodeChatbotEnabled },
        );
        const accounts = filterAccountsByTenant(
          mergeDirectoryAccountSnapshots([user], directoryUsers),
          user,
        ).map(account => ({
            ...account,
            avatar: isAccountManaged(account) ? (account.avatar || '') : (avatarOverrideFor(account) || account.avatar || ''),
          }));
        const nicknameMap = Object.fromEntries(
          accounts
            .filter(account => account?.id && account?.nickname)
            .map(account => [String(account.id), String(account.nickname)]),
        );
        if (accountSessionRef.current !== accountSession) return;
        contactNicknamesRef.current = nicknameMap;
        setContactNicknames(nicknameMap);
        directoryAccountsRef.current = accounts;
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
            : applyLocalConversationPins(managedRoomsSnapshot, managementUserId, loginPreferenceIdentity.aliases, loginPreferenceTenantId),
          managementUserId,
          loginPreferenceIdentity.aliases,
          loginPreferenceTenantId,
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
        // Keep the old HTTP history visible while Tinode hydrates the current
        // bot topic. The backend aliases both legacy and Tinode AI history.
        loadChatbotMessagesFromServer(user).then(serverMessages => {
          if (accountSessionRef.current !== accountSession) return;
          setConversations(previous => {
            const room = previous[CHATBOT_ACCOUNT.id];
            if (!room || (room.accountSession && room.accountSession !== accountSession)) return previous;
            const messages = mergeChatbotMessages(roomMessages(room), serverMessages);
            const latest = messages.at(-1);
            return {
              ...previous,
              [CHATBOT_ACCOUNT.id]: {
                ...room,
                messages,
                lastMsg: latest
                  ? `${latest.sender === 'outgoing' ? 'Bạn' : CHATBOT_ACCOUNT.name}: ${latest.text || ''}`
                  : room.lastMsg,
                time: latest?.time || room.time,
                updatedAt: latest?.createdAt || room.updatedAt,
              },
            };
          });
        }).catch(() => {});
    } catch (err) {
      setChatError(err?.message || 'Không tải được danh sách cuộc trò chuyện.');
    }
  };

  loginSuccessHandlerRef.current = handleLoginSuccess;

  useEffect(() => {
    if (!chatManagementService.remote || sessionRestoreAttemptedRef.current) return undefined;
    sessionRestoreAttemptedRef.current = true;
    let cancelled = false;
    setSessionRestoreState('loading');
    managementAuthClient.restoreSession()
      .then(async session => {
        if (cancelled) return;
        await loginSuccessHandlerRef.current?.({
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
          authSource: session.authSource,
          accountManaged: session.accountManaged,
          title: session.profile?.title || '',
          tinodeSession: session,
          connection: session.connection,
          avatar: session.profile?.avatar || '',
          mustChangePassword: Boolean(session.mustChangePassword),
        }, { source: 'restore' });
      })
      .catch(error => {
        if (cancelled) return;
        if (isSessionRestoreAuthFailure(error)) {
          setSessionRestoreState('ready');
          return;
        }
        setSessionRestoreState('error');
      })
      .finally(() => {
        if (!cancelled) setSessionRestoreState(previous => previous === 'loading' ? 'ready' : previous);
      });
    return () => {
      cancelled = true;
      sessionRestoreAttemptedRef.current = false;
    };
  }, [sessionRestoreAttempt]);

  const retrySessionRestore = () => {
    if (sessionRestoreState === 'loading') return;
    sessionRestoreAttemptedRef.current = false;
    setSessionRestoreState('loading');
    setSessionRestoreAttempt(previous => previous + 1);
  };

  const handleConversationSelect = async (id) => {
    const rawRoom = conversationsRef.current[id] ?? conversations[id] ?? renderConversations[id];
    const room = rawRoom === null || rawRoom === undefined
      ? null
      : safeNormalizeConversationForRender(rawRoom, id);
    if (!room?.id) {
      setChatError('Cuoc tro chuyen khong con kha dung. Vui long tai lai danh ba.');
      return;
    }
    const shouldScrollToLatestOnOpen = String(currentChatIdRef.current) !== String(id);
    const accountSession = accountSessionRef.current;
    const navigation = ++conversationNavigationRef.current;
    const isCurrent = () => accountSessionRef.current === accountSession
      && String(currentChatIdRef.current) === String(id)
      && conversationNavigationRef.current === navigation;
    currentChatIdRef.current = id;
    openingConversationRef.current = String(id);
    setCurrentChatId(id);
    if (shouldScrollToLatestOnOpen) queueConversationLatestScroll(id, navigation);
    setInputText(drafts[id] || '');
    setIsMobileChatActive(true);
    setChatError('');
    let pendingUnreadBoundary = null;
    const existingUnreadBoundary = unreadBoundariesRef.current[id] || null;
    const hasSelectionUnreadCursor = Boolean(existingUnreadBoundary)
      || Number(room.badge) > 0
      || Number(room.unreadFromSeq) > 0;
    if (hasSelectionUnreadCursor) {
      pendingUnreadBoundary = rememberUnreadBoundary(room, id);
    }
    if (room.isChatbot) {
      setConversations(previous => previous[id]
        ? { ...previous, [id]: { ...previous[id], badge: 0, unreadFromSeq: 0 } }
        : previous);
    }
    if (chatMode === 'demo') {
      const userId = currentUser?.id || currentUser?.uid;
      if (!room?.isChatbot) {
        if (!pendingUnreadBoundary) {
          if (room?.isGroup) markDemoGroupRead(id, userId);
          else markDemoDirectRead(id, userId);
        }
      }
    }
    if (chatMode === 'tinode' && (!room?.isChatbot || room?.tinodeTopic)) {
      try {
        const topicName = room.isChatbot
          ? room.tinodeTopic
          : await ensureTinodeConversationTopic(room);
        if (accountSessionRef.current !== accountSession) return;
        const openedRoom = personalizeConversationForViewer(
          normalizeTinodeConversation(await tinodeClient.openConversation(topicName)),
          directoryAccountsRef.current,
          currentUser,
        );
        if (accountSessionRef.current !== accountSession) return;
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
        rememberUnreadBoundary(managedRoom, id);
        let selectedRoom = managedRoom;
        if (room.isChatbot && isCurrent()) {
          const acknowledgedReadSeq = await tinodeClient.markRead(topicName, {
            throughSequence: roomMessages(managedRoom).reduce((maximum, message) => Math.max(maximum, Number(message.seq) || 0), 0),
          });
          selectedRoom = { ...managedRoom, badge: 0, unreadFromSeq: 0, readSeq: acknowledgedReadSeq };
        }
        setConversations(prev => {
          if (accountSessionRef.current !== accountSession) return prev;
          const next = {
            ...prev,
            [id]: {
              ...safeMergeTinodeConversation(prev[id], selectedRoom, { viewerId }),
              directProvisioning: 'ready',
              pendingDirect: false,
            },
          };
          conversationsRef.current = next;
          return next;
        });
      } catch (err) {
        if (!isCurrent()) return;
        setConnectionStatus(tinodeClient.authenticated ? 'online' : 'offline');
        setChatError(err?.message || 'Không mở được cuộc trò chuyện.');
      } finally {
        if (openingConversationRef.current === String(id)) {
          openingConversationRef.current = '';
          if (shouldScrollToLatestOnOpen && isCurrent()) queueConversationLatestScroll(id, navigation);
        }
      }
    } else if (openingConversationRef.current === String(id)) {
      openingConversationRef.current = '';
      if (shouldScrollToLatestOnOpen && isCurrent()) queueConversationLatestScroll(id, navigation);
    }
  };

  notificationOpenHandlerRef.current = handleConversationSelect;

  const resetWorkspaceNavigationState = () => {
    setWorkspaceQuery('');
    setWorkspaceResults([]);
    directorySearchRequestRef.current += 1;
    setTenantSwitchNotice('');
    messageSearchRequestRef.current += 1;
    setMessageSearchQuery('');
    setMessageSearchSender('all');
    setMessageSearchType('all');
    setMessageSearchFromDate('');
    setMessageSearchToDate('');
    setMessageSearchResults([]);
    setMessageSearchTotal(0);
    setMessageSearchScanned(0);
    setMessageSearchCursor(null);
    setMessageSearchHasMore(false);
    setMessageSearchLoading(false);
    setMessageSearchError('');
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
    const loggedOutPreferenceIdentity = viewerPreferenceIdentity(currentUser, viewerId);
    const loggedOutPreferenceTenantId = String(accountTenantId(currentUser) || '').trim();
    if (loggedOutPreferenceIdentity.viewerId) {
      clearPinTabAccess(
        loggedOutPreferenceIdentity.viewerId,
        undefined,
        loggedOutPreferenceIdentity.aliases,
        loggedOutPreferenceTenantId,
      );
    }
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
      safeConversationValues(conversations)
        .filter(room => !room.isGroup && !room.isChatbot && roomMessages(room).length > 0)
        .forEach(room => persistDemoDirectMessage(room, null));
    }
    setLoginNotice(chatLogoutFailed
      ? 'Dữ liệu Chat trên thiết bị đã được đóng, nhưng máy chủ chưa xác nhận việc thu hồi phiên. Vui lòng đăng nhập lại sau khi kiểm tra kết nối.'
      : 'Bạn đã đăng xuất khỏi Chat.');
    setIsLoggedIn(false);
    setCurrentUser(null);
    directorySearchRequestRef.current += 1;
    setPinLockConfig(null);
    setPinLockReady(true);
    setIsPinTabUnlocked(true);
    setPinUnlockValue('');
    setPinUnlockNotice('');
    setDrafts({});
    clearAllPastedAttachments();
    pastedAttachmentSubmitRef.current = false;
    groupSpamStatesRef.current.clear();
    setGroupSpamClock(Date.now());
    setMessageMentions({});
    setMentionContext(null);
    setInputText('');
    setEditingMessage(null);
    setIsSavingMessageEdit(false);
    setEditHistoryMessage(null);
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
    groupNameRefreshRef.current.clear();
    groupRoleRefreshRef.current.clear();
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
    setPendingTenantSwitch(null);
    setTenantSwitchNotice('');
    setIsSwitchingTenant(true);
    let reloadStarted = false;
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
      if (typeof window !== 'undefined') {
        reloadStarted = true;
        window.location.reload();
      } else if (nextSession) {
        setCurrentUser(previous => ({ ...previous, ...nextSession }));
      }
    } catch (error) {
      reloadStarted = false;
      const message = error?.code === 'ACCOUNT_TENANT_REQUIRED'
        ? 'Vui lòng chọn công ty hợp lệ.'
        : error?.code === 'ACCOUNT_SSO_REQUIRED'
          ? 'Chỉ tài khoản UpGO mới có thể chuyển công ty.'
          : error?.message || 'Không thể chuyển công ty. Vui lòng thử lại.';
      setTenantSwitchNotice(appCopy.t(message));
    } finally {
      if (!reloadStarted) setIsSwitchingTenant(false);
    }
  };

  const requestTenantSwitch = option => {
    const requestedTenantId = String(option?.id || '').trim();
    const currentTenantId = String(profileAccount.tenantId || profileAccount.tenant_id || '').trim();
    if (!requestedTenantId || requestedTenantId === currentTenantId || isSwitchingTenant) return;
    setTenantSwitcherOpen(false);
    setTenantSwitchNotice('');
    setPendingTenantSwitch(option);
  };

  const confirmTenantSwitch = () => {
    if (!pendingTenantSwitch || isSwitchingTenant) return;
    handleTenantSwitch(pendingTenantSwitch);
  };

  useEffect(() => {
    if (!pendingTenantSwitch || typeof document === 'undefined') return undefined;
    const handleTenantSwitchKeyDown = event => {
      if (event.key === 'Escape') setPendingTenantSwitch(null);
    };
    document.addEventListener('keydown', handleTenantSwitchKeyDown);
    return () => document.removeEventListener('keydown', handleTenantSwitchKeyDown);
  }, [pendingTenantSwitch]);

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
        const refreshedSession = await chatManagementService.refreshSessionMetadata();
        if (!cancelled && refreshedSession) {
          const avatarChanged = syncCurrentAccountProfile(refreshedSession);
          if (avatarChanged && chatMode === 'tinode') {
            ensureTinodeSession()
              .then(() => tinodeClient.updateCurrentProfile({
                name: refreshedSession.name,
                avatarUrl: refreshedSession.avatar || '',
              }))
              .catch(() => {});
          }
          const nextTenantOptions = refreshedSession.tenantOptions || refreshedSession.tenant_options || [];
          setCurrentUser(previous => {
            if (!previous) return previous;
            const previousTenantOptions = previous.tenantOptions || previous.tenant_options || [];
            if (JSON.stringify(previousTenantOptions) === JSON.stringify(nextTenantOptions)) return previous;
            return {
              ...previous,
              tenantOptions: nextTenantOptions,
              tenant_options: nextTenantOptions,
            };
          });
        }
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
  }, [isLoggedIn, chatMode, ensureTinodeSession, syncCurrentAccountProfile]);

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

  const openGroupMemberPicker = () => {
    setIsGroupMembersExpanded(true);
    setIsGroupBoardOpen(false);
    setIsGroupMemberPickerOpen(true);
    setGroupMemberAddIds([]);
    setGroupMemberAddProfiles({});
    setGroupMemberAddSearch('');
    setGroupMemberMenuId('');
  };

  const toggleGroupMembersSection = () => {
    const next = !isGroupMembersExpanded;
    setIsGroupMembersExpanded(next);
    if (next) setIsGroupBoardOpen(false);
    if (!next) {
      setIsGroupMemberPickerOpen(false);
      setGroupMemberMenuId('');
    }
  };

  const toggleGroupBoard = () => {
    const next = !isGroupBoardOpen;
    setIsGroupBoardOpen(next);
    if (next) {
      setIsGroupMembersExpanded(false);
      setIsGroupMemberPickerOpen(false);
      setGroupMemberMenuId('');
    }
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
      });
      setCurrentUser(previous => ({
        ...previous,
        ...updated,
        avatar: updated.avatar || previous?.avatar || '',
        uid: previous?.uid,
        tinodeUid: previous?.tinodeUid,
      }));
      updateDirectoryAccounts(previous => previous.map(account => (
        account.id === updated.id
          ? { ...account, ...updated, avatar: updated.avatar || account.avatar || '' }
          : account
      )));
      setConversations(previous => Object.fromEntries(safeConversationEntries(previous).map(([id, room]) => [id, {
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

  const uploadProfileAvatar = async file => {
    if (!file) return false;
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
      const nextAvatar = updated?.avatar || avatar;
      const targetAccount = updated || currentUser;
      if (!isAccountManaged(targetAccount)) rememberAvatarOverride(targetAccount, nextAvatar);
      setCurrentUser(previous => ({ ...previous, avatar: nextAvatar }));
      updateDirectoryAccounts(previous => {
        const next = previous.map(account => (
          identitiesOverlap(account, targetAccount) ? { ...account, avatar: nextAvatar } : account
        ));
        return next;
      });
      setConversations(previous => Object.fromEntries(safeConversationEntries(previous).map(([id, room]) => [id, {
        ...room,
        members: roomMembers(room).map(member => identitiesOverlap(member, currentUser) ? { ...member, avatar: nextAvatar } : member),
        messages: roomMessages(room).map(message => identitiesOverlap(message, currentUser) ? { ...message, avatar: nextAvatar } : message),
      }])));
      setProfileNotice('Ảnh đại diện đã được cập nhật.');
      return true;
    } catch (error) {
      setChatError(error?.message || 'Không thể cập nhật ảnh đại diện.');
      return false;
    } finally {
      setIsUpdatingProfileAvatar(false);
    }
  };

  const handleProfileAvatarChange = event => {
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
    setChatError('');
    setAvatarCropFile(file);
  };

  const handleProfileAvatarCropSave = async croppedFile => {
    const saved = await uploadProfileAvatar(croppedFile);
    if (saved) setAvatarCropFile(null);
    return saved;
  };

  const handleWorkspaceSearch = async (event) => {
    const value = event.target.value;
    setWorkspaceQuery(value);
    const requestId = ++directorySearchRequestRef.current;
    const requestSession = accountSessionRef.current;
    const requestViewer = currentUserRef.current || currentUser;
    const requestTenantId = accountTenantId(requestViewer);
    if (workspacePanel !== 'contacts' || value.trim().length < 2) {
      setWorkspaceResults([]);
      setIsWorkspaceLoading(false);
      return;
    }
    if (!requestTenantId) {
      setWorkspaceResults([]);
      setIsWorkspaceLoading(false);
      return;
    }
    setIsWorkspaceLoading(true);
    try {
      const results = await chatManagementService.searchUsers(value, {
        excludeUserId: requestViewer?.id || requestViewer?.uid,
      });
      const latestViewer = currentUserRef.current || currentUser;
      if (
        directorySearchRequestRef.current !== requestId
        || accountSessionRef.current !== requestSession
        || accountTenantId(latestViewer) !== requestTenantId
      ) return;
      const scopedResults = filterAccountsByTenant(
        results,
        latestViewer,
      );
      const knownAccounts = filterAccountsByTenant(
        directoryAccountsRef.current,
        latestViewer,
      );
      setWorkspaceResults(scopedResults.map(result => {
        const known = findAccount(knownAccounts, result.id || result.uid || result.tinodeUid);
        return known && (typeof known.online === 'boolean' || known.lastSeenAt)
          ? {
            ...result,
            ...(typeof known.online === 'boolean' ? { online: known.online } : {}),
            ...(known.lastSeenAt ? { lastSeenAt: known.lastSeenAt, last_seen_at: known.lastSeenAt } : {}),
          }
          : result;
      }));
    } catch (err) {
      if (
        directorySearchRequestRef.current !== requestId
        || accountSessionRef.current !== requestSession
        || accountTenantId(currentUserRef.current || currentUser) !== requestTenantId
      ) return;
      setChatError(err?.message || 'Không thể tìm danh bạ.');
    } finally {
      if (directorySearchRequestRef.current === requestId) setIsWorkspaceLoading(false);
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
        membersCount: contact?.online ? 'Trực tuyến' : 'Ngoại tuyến',
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
    const directoryTenantId = accountTenantId(currentUserRef.current || currentUser);
    let cancelled = false;
    let syncing = false;

    const syncManagementDirectory = async () => {
      if (
        cancelled
        || syncing
        || accountSessionRef.current !== accountSession
        || accountTenantId(currentUserRef.current || currentUser) !== directoryTenantId
      ) return;
      syncing = true;
      try {
        const [accounts, requests] = await Promise.all([
          chatManagementService.listUsers(),
          chatManagementService.listFriendRequests(managementViewerId),
        ]);
        if (
          cancelled
          || accountSessionRef.current !== accountSession
          || accountTenantId(currentUserRef.current || currentUser) !== directoryTenantId
        ) return;

        const rawPreviousAccounts = Array.isArray(directoryAccountsRef.current)
          ? directoryAccountsRef.current
          : [];
        const previousAccounts = filterAccountsByTenant(
          rawPreviousAccounts,
          currentUserRef.current || currentUser,
        );
        const scopedAccounts = filterAccountsByTenant(
          accounts,
          currentUserRef.current || currentUser,
        );
        const currentDirectoryUser = currentUserRef.current || currentUser;
        const mergedAccounts = mergeDirectoryAccountSnapshots(
          previousAccounts,
          scopedAccounts,
          currentDirectoryUser,
        );
        const nextAccounts = filterAccountsByTenant(mergedAccounts.map(account => {
          const previous = findAccount(previousAccounts, account.id || account.uid || account.tinodeUid);
          const override = isAccountManaged(account) ? '' : avatarOverrideFor(account);
          const next = override ? { ...account, avatar: override } : account;
          return previous && (typeof previous.online === 'boolean' || previous.lastSeenAt)
            ? {
              ...next,
              ...(typeof previous.online === 'boolean' ? { online: previous.online } : {}),
              ...(previous.lastSeenAt ? { lastSeenAt: previous.lastSeenAt, last_seen_at: previous.lastSeenAt } : {}),
            }
            : next;
        }), currentDirectoryUser);
        const nextNicknames = Object.fromEntries(
          nextAccounts
            .filter(account => account?.id && account?.nickname)
            .map(account => [String(account.id), String(account.nickname)]),
        );
        const nicknamesChanged = JSON.stringify(contactNicknamesRef.current) !== JSON.stringify(nextNicknames);
        if (nicknamesChanged) {
          contactNicknamesRef.current = nextNicknames;
          setContactNicknames(nextNicknames);
        }
        const accountsChanged = rawPreviousAccounts.length !== previousAccounts.length
          || previousAccounts.length !== nextAccounts.length
          || nextAccounts.some(account => {
            const previous = findAccount(previousAccounts, account.id || account.uid || account.tinodeUid);
            return !previous || ['id', 'uid', 'tinodeUid', 'username', 'name', 'defaultName', 'nickname', 'avatar', 'email', 'title', 'department', 'active', 'online', 'lastSeenAt']
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
          const knownOnline = typeof account.online === 'boolean' ? account.online : result.online;
          const next = {
            ...result,
            ...account,
            ...(typeof knownOnline === 'boolean' ? { online: knownOnline } : {}),
            ...(account.lastSeenAt ? { lastSeenAt: account.lastSeenAt, last_seen_at: account.lastSeenAt } : {}),
          };
          return ['name', 'defaultName', 'nickname', 'avatar', 'email', 'title', 'department', 'active', 'online', 'lastSeenAt'].some(key => result[key] !== next[key])
            ? next
            : result;
        });
        setWorkspaceResults(previous => {
          const scopedPrevious = filterAccountsByTenant(
            previous,
            currentUserRef.current || currentUser,
          );
          const next = refreshResultList(scopedPrevious);
          return next.length === scopedPrevious.length
            && next.every((item, index) => item === scopedPrevious[index])
            ? scopedPrevious
            : next;
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
          const nextConversations = Object.fromEntries(safeConversationEntries(previous).map(([id, room]) => {
          const members = roomMembers(room).map(member => {
            const account = findAccountByIdentities(effectiveAccounts, [
              member.id,
              member.uid,
              member.tinodeUid,
              member.tinode_uid,
              member.name,
            ]);
            if (!account) return member;
            const updated = {
              ...member,
              name: account.name || member.name,
              defaultName: account.defaultName || member.defaultName || member.name,
              default_name: account.default_name || member.default_name || member.name,
              nickname: account.nickname || '',
              avatar: isAccountManaged(account) ? (account.avatar || '') : (account.avatar || member.avatar || ''),
              online: member.online,
            };
            const lastSeenAt = latestTimestampValue(
              account.lastSeenAt ?? account.last_seen_at,
              member.lastSeenAt ?? member.last_seen_at,
            );
            if (lastSeenAt) {
              updated.lastSeenAt = lastSeenAt;
              updated.last_seen_at = lastSeenAt;
            }
            return updated.name === member.name
              && updated.defaultName === member.defaultName
              && updated.nickname === member.nickname
              && updated.avatar === member.avatar
              && updated.lastSeenAt === member.lastSeenAt
              && updated.last_seen_at === member.last_seen_at
              ? member
              : updated;
          });
          const peer = !room.isGroup
            ? members.find(member => !identitiesOverlap(member, currentUser))
            : null;
          const messages = roomMessages(room).map(message => {
            const account = findAccountByIdentities(effectiveAccounts, [
              message.senderId,
              message.raw?.from,
              message.raw?.head?.['x-sender-id'],
              message.senderName,
            ]);
            if (!account) return message;
            const updated = {
              ...message,
              senderName: account.name || message.senderName,
              avatar: isAccountManaged(account) ? (account.avatar || '') : (account.avatar || message.avatar || ''),
            };
            return updated.senderName === message.senderName && updated.avatar === message.avatar ? message : updated;
          });
          const friendEvents = roomFriendEvents(room).map(message => {
            const event = message.friendEvent || {};
            const account = findAccount(effectiveAccounts, event.action === 'request' ? event.requesterId : event.responderId);
            if (!account) return message;
            const updated = {
              ...message,
              senderName: account.name || message.senderName,
              avatar: isAccountManaged(account) ? (account.avatar || '') : (account.avatar || message.avatar || ''),
            };
            return updated.senderName === message.senderName && updated.avatar === message.avatar ? message : updated;
          });
          const nextRoom = {
            ...room,
            members,
            messages,
            friendEvents,
            ...(peer ? {
              name: peer.name || room.name,
              avatarUrl: isAccountManaged(peer) ? (peer.avatar || '') : (peer.avatar || room.avatarUrl || ''),
            } : {}),
          };
          const membersChanged = members.length !== roomMembers(room).length
            || members.some((member, index) => member !== roomMembers(room)[index]);
          const messagesChanged = messages.length !== roomMessages(room).length
            || messages.some((message, index) => message !== roomMessages(room)[index]);
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

  // Chatmgt owns the directory-wide presence lease. The short polling window
  // keeps the list responsive while Redis TTL handles crashed tabs/network loss.
  useEffect(() => {
    if (!isLoggedIn || !chatManagementService.remote || !managementViewerId) return undefined;
    const accountSession = accountSessionRef.current;
    const directoryTenantId = accountTenantId(currentUserRef.current || currentUser);
    return startBrowserPresence({
      documentTarget: document,
      windowTarget: window,
      isCurrentSession: () => accountSessionRef.current === accountSession
        && accountTenantId(currentUserRef.current || currentUser) === directoryTenantId,
      heartbeat: () => {
        const accountIds = filterAccountsByTenant(
          directoryAccountsRef.current,
          currentUserRef.current || currentUser,
        )
          .map(account => account?.id || account?.uid)
          .filter(Boolean);
        return chatManagementService.heartbeatPresence(accountIds);
      },
      clearPresence: options => chatManagementService.clearPresence(options),
      applySnapshot: payload => applyPresenceSnapshot(
        payload?.presence || {},
        payload?.last_seen_at || payload?.lastSeenAt || {},
      ),
    });
  }, [isLoggedIn, managementViewerId, currentUser, directoryAccounts.length, applyPresenceSnapshot]);

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
    try {
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
    const linkedRoom = safeConversationValues(conversationsRef.current).find(room => (
      !room.isGroup
      && !room.isChatbot
      && room.accountSession === accountSession
      && isManagementConversationId(room.managementId || room.id)
      && (
        roomParticipantIds(room).map(String).includes(String(safeContact.id))
        || roomMembers(room).some(member => findAccount(directoryAccounts, member.id || member.name)?.id === safeContact.id)
      )
    ));
    const participantIds = safeContact.id ? [viewerId, safeContact.id] : [];
    const contactId = chatMode === 'demo' && participantIds.length === 2
      ? directConversationId(...participantIds)
      : linkedRoom?.id || safeContact.id || contactName;
      let stateConversationId = contactId;
      deletedConversationIdsRef.current.delete(contactId);
      let managedRoom = linkedRoom;
      let tinodeTopic = linkedRoom?.tinodeTopic
        || chatManagementService.getTinodeTopic(viewerId, linkedRoom?.managementId || contactId);
      const previousRooms = Object.fromEntries(safeConversationEntries(conversationsRef.current));
      const existingRoom = previousRooms[stateConversationId] || previousRooms[contactId] || managedRoom || linkedRoom;
      const needsDirectProvisioning = usesManagementData
        && (!managedRoom || (chatMode === 'tinode' && !tinodeTopic));
      const optimisticRoom = {
        ...existingRoom,
        id: stateConversationId,
        managementId: managedRoom?.managementId || linkedRoom?.managementId || '',
        tinodeTopic,
        name: contactName,
        isGroup: false,
        avatarHtml: safeContact.avatar ? <img src={safeContact.avatar} alt={contactName} /> : <span>{contactName.slice(0, 1).toUpperCase()}</span>,
        avatarClass: '',
        membersCount: accountPresenceLabel(safeContact),
        description: '',
        admin: '',
        members: [safeContact],
        participantIds: participantIds.length === 2 ? participantIds : existingRoom?.participantIds,
        messages: existingRoom?.messages || [],
        lastMsg: existingRoom?.lastMsg || 'Bắt đầu cuộc trò chuyện',
        time: existingRoom?.time || getTimeString(),
        updatedAt: existingRoom?.updatedAt || new Date().toISOString(),
        badge: existingRoom?.badge || 0,
        ...(usesManagementData ? {
          accountSession,
          directContactId: safeContact.id || '',
          pendingDirect: Boolean(safeContact.id),
          directProvisioning: needsDirectProvisioning ? 'pending' : 'ready',
        } : {}),
      };
      const optimisticRooms = { ...previousRooms, [stateConversationId]: optimisticRoom };
      if (linkedRoom && linkedRoom.id !== stateConversationId) delete optimisticRooms[linkedRoom.id];
      conversationsRef.current = optimisticRooms;
      currentChatIdRef.current = stateConversationId;
      setConversations(optimisticRooms);
      setCurrentChatId(stateConversationId);
      setInputText(drafts[stateConversationId] || '');
      setChatError('');
      closeWorkspacePanel();
      setIsMobileChatActive(true);

      const migrateOptimisticRoom = (nextId, patch = {}) => {
        if (!nextId || nextId === stateConversationId) return;
        const previousId = stateConversationId;
        const latestRooms = Object.fromEntries(safeConversationEntries(conversationsRef.current));
        const previousRoom = latestRooms[previousId] || optimisticRoom;
        const migratedRoom = safeMergeTinodeConversation(previousRoom, {
          ...patch,
          id: nextId,
          managementId: patch.managementId || nextId,
        });
        const nextRooms = {
          ...latestRooms,
          [nextId]: {
            ...migratedRoom,
            id: nextId,
            managementId: patch.managementId || nextId,
            directContactId: safeContact.id || '',
            pendingDirect: true,
            directProvisioning: chatMode === 'tinode' ? 'pending' : 'ready',
            accountSession,
          },
        };
        delete nextRooms[previousId];
        conversationsRef.current = nextRooms;
        setConversations(nextRooms);
        setDrafts(previous => {
          if (!previous[previousId]) return previous;
          const next = { ...previous, [nextId]: previous[previousId] };
          delete next[previousId];
          return next;
        });
        migratePastedAttachments(previousId, nextId);
        if (currentChatIdRef.current === previousId) {
          currentChatIdRef.current = nextId;
          setCurrentChatId(nextId);
          setInputText(drafts[previousId] || drafts[nextId] || '');
        }
        stateConversationId = nextId;
      };

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
        const managedConversationId = managedRoom.managementId || managedRoom.id;
        if (!managedConversationId) throw new Error('Chatmgt khong tra ve ma cuoc tro chuyen.');
        migrateOptimisticRoom(managedConversationId, {
          ...managedRoom,
          managementId: managedConversationId,
          tinodeTopic,
        });
        const managedStateRoom = {
          ...managedRoom,
          id: stateConversationId,
          managementId: managedConversationId,
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
          const previousRoom = safeNormalizeConversationForRender(
            conversationsRef.current[stateConversationId],
            stateConversationId,
          ) || managedStateRoom;
          const restoredStateRoom = {
            ...restoredRoom,
            id: stateConversationId,
            managementId: managedRoom.managementId || stateConversationId,
            tinodeTopic,
            accountSession,
          };
          const restoredRooms = {
            ...Object.fromEntries(safeConversationEntries(conversationsRef.current)),
            [stateConversationId]: safeMergeTinodeConversation(previousRoom, restoredStateRoom),
          };
          conversationsRef.current = restoredRooms;
          setConversations(restoredRooms);
        }
      }
      const latestRooms = Object.fromEntries(safeConversationEntries(conversationsRef.current));
      const existing = latestRooms[stateConversationId] || latestRooms[contactId] || managedRoom || linkedRoom;
      const next = { ...latestRooms };
      if (linkedRoom && linkedRoom.id !== stateConversationId) delete next[linkedRoom.id];
      if (contactId !== stateConversationId) delete next[contactId];
      next[stateConversationId] = {
        ...existing,
        id: stateConversationId,
        managementId: managedRoom?.managementId || linkedRoom?.managementId || (isManagementConversationId(stateConversationId) ? stateConversationId : ''),
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
        ...(usesManagementData ? {
          accountSession,
          directContactId: safeContact.id || '',
          pendingDirect: false,
          directProvisioning: 'ready',
        } : {}),
      };
      conversationsRef.current = next;
      setConversations(next);
      if (currentChatIdRef.current === stateConversationId) {
        currentChatIdRef.current = stateConversationId;
        setCurrentChatId(stateConversationId);
        setInputText(drafts[stateConversationId] || '');
        setIsMobileChatActive(true);
      }
    } catch (err) {
      setChatError(err?.message || 'Không thể mở cuộc trò chuyện.');
    }
  };

  const publicProfileFor = entity => {
    if (!entity) return null;
    const identity = entity.id || entity.uid || entity.tinodeUid || entity.tinode_uid || entity.username || entity.name;
    const account = findAccount(directoryAccounts, identity)
      || findAccount(roomMembers(activeChat), identity)
      || (identitiesOverlap(entity, currentUser) ? currentUser : null);
    const merged = normalizeAccountShape({ ...(account || {}), ...(entity || {}) }) || {};
    const viewerAccount = normalizeAccountShape(account);
    if (viewerAccount) {
      merged.name = viewerAccount.name || merged.name;
      merged.display_name = viewerAccount.name || merged.display_name;
      merged.defaultName = viewerAccount.defaultName || merged.defaultName;
      merged.default_name = viewerAccount.default_name || merged.default_name;
      merged.nickname = viewerAccount.nickname || '';
    }
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
      online: isCurrentAccount
        ? isCurrentUserOnline
        : typeof account?.online === 'boolean' ? account.online : Boolean(merged.online),
      lastSeenAt: latestTimestampValue(
        account?.lastSeenAt,
        account?.last_seen_at,
        merged.lastSeenAt,
        merged.last_seen_at,
      ) || '',
      isCurrentAccount,
    };
  };

  const openProfileFor = entity => {
    const profile = publicProfileFor(entity);
    if (profile) setProfileContact(profile);
  };
  const activeProfileContact = profileContact ? publicProfileFor(profileContact) : null;

  const messageSenderProfile = message => publicProfileFor({
    id: message?.senderId || message?.raw?.from || message?.raw?.head?.['x-sender-id'],
    name: message?.senderName,
    avatar: message?.avatar,
  });

  const mentionCandidateForMessage = message => {
    const senderId = messageSenderId(message);
    const senderName = message?.senderName || '';
    const candidate = findAccount(roomMembers(activeChat), senderId)
      || findAccount(directoryAccounts, senderId)
      || findAccount(roomMembers(activeChat), senderName)
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

  const updateActiveGroupRoom = (roomUpdate = {}) => {
    const stateConversationId = activeChat.id;
    setConversations(previous => {
      const currentRoom = previous[stateConversationId] || activeChat;
      const nextRoom = safeMergeTinodeConversation(currentRoom, {
        ...currentRoom,
        ...roomUpdate,
        id: stateConversationId,
        managementId: currentRoom.managementId || stateConversationId,
        messages: roomMessages(roomUpdate).length > 0 ? roomMessages(roomUpdate) : roomMessages(currentRoom),
      });
      const next = { ...previous, [stateConversationId]: nextRoom };
      conversationsRef.current = next;
      return next;
    });
  };

  const openGroupManagement = () => {
    if (!isActiveGroupAdmin) {
      setChatError('Chỉ quản trị viên của nhóm mới có thể mở mục quản lý nhóm.');
      return;
    }
    setGroupManagementDraft(normalizeGroupSettings(activeChat.groupSettings));
    setGroupManagementNotice('');
    setIsGroupBoardOpen(false);
    setIsGroupManagementOpen(true);
  };

  const openGroupRename = () => {
    if (!canEditActiveGroupInfo) {
      setChatError(GROUP_INFO_PERMISSION_MESSAGE);
      return;
    }
    setGroupRenameValue(activeChat.name || '');
    setIsGroupRenameOpen(true);
  };

  const openContactNicknameDialog = () => {
    if (activeChat.isGroup || activeChat.isChatbot || !activeDirectPeer) return;
    const contact = findAccount(
      directoryAccounts,
      activeDirectPeer.id || activeDirectPeer.uid || activeDirectPeer.tinodeUid || activeDirectPeer.name,
    ) || activeDirectPeer;
    const defaultName = contact.defaultName || contact.default_name || contact.full_name || contact.name || contact.username || 'Người dùng';
    setContactNicknameDialog({
      ...contact,
      defaultName,
      avatar: contact.avatar || activeDirectPeer.avatar || '',
    });
    setContactNicknameValue(contact.nickname || defaultName);
    setChatError('');
  };

  const handleContactNicknameSubmit = async event => {
    event.preventDefault();
    const contact = contactNicknameDialog;
    const contactId = String(contact?.id || contact?.uid || '').trim();
    if (!contactId || isSavingContactNickname) return;
    const nickname = contactNicknameValue.trim().slice(0, 80);
    setIsSavingContactNickname(true);
    setChatError('');
    try {
      let savedNickname = nickname;
      if (chatManagementService.remote) {
        const response = await chatManagementService.updateContactNickname(contactId, nickname);
        savedNickname = String(response?.nickname || '').trim();
      }
      const nextNicknames = { ...contactNicknamesRef.current };
      if (savedNickname) nextNicknames[contactId] = savedNickname;
      else delete nextNicknames[contactId];
      contactNicknamesRef.current = nextNicknames;
      setContactNicknames(nextNicknames);
      const contactAccount = normalizeAccountShape(contact) || contact;
      const knownAccounts = findAccountByIdentities(
        directoryAccountsRef.current,
        [contactId, contactAccount?.uid, contactAccount?.tinodeUid],
      )
        ? directoryAccountsRef.current
        : [...directoryAccountsRef.current, contactAccount];
      const nextAccounts = filterAccountsByTenant(
        applyContactNicknames(knownAccounts, { [contactId]: savedNickname }),
        currentUserRef.current || currentUser,
      );
      directoryAccountsRef.current = nextAccounts;
      setDirectoryAccounts(nextAccounts);
      setConversations(previous => {
        const next = Object.fromEntries(safeConversationEntries(previous).map(([id, room]) => [
          id,
          personalizeConversationForViewer(room, nextAccounts, currentUserRef.current),
        ]));
        conversationsRef.current = next;
        return next;
      });
      setContactNicknameDialog(null);
    } catch (error) {
      setChatError(error?.message || 'Không thể lưu tên gợi nhớ.');
    } finally {
      setIsSavingContactNickname(false);
    }
  };

  const persistGroupMetadata = async ({ name, settings, background } = {}) => {
    const managementConversationId = activeChat.managementId || activeChat.id;
    const tinodeMetadataChanged = chatMode === 'tinode' && !usesManagementData;
    let topicName = '';
    let tinodeUpdated = false;
    let tinodeUpdatedRoom = null;
    const rollbackMetadata = {
      ...(name !== undefined ? { name: activeChat.name } : {}),
      ...(settings !== undefined ? { settings: activeGroupSettings } : {}),
      ...(background !== undefined ? { background: activeChat.conversationBackground || null } : {}),
    };

    try {
      if (tinodeMetadataChanged) {
        topicName = activeChat.tinodeTopic || await ensureTinodeConversationTopic(activeChat);
        tinodeUpdatedRoom = await tinodeClient.updateGroupMetadata(topicName, { name, settings });
        tinodeUpdated = true;
      }
      if (usesManagementData) {
        if (!isManagementConversationId(managementConversationId)) {
          throw new Error('Chatmgt chưa xác nhận nhóm này.');
        }
        return chatManagementService.updateGroupSettings(
          managementConversationId,
          { name, settings, background },
        );
      }
      if (tinodeMetadataChanged) {
        return tinodeUpdatedRoom;
      }
      return null;
    } catch (error) {
      if (tinodeUpdated && topicName) {
        await tinodeClient.updateGroupMetadata(topicName, rollbackMetadata).catch(() => {});
      }
      throw error;
    }
  };

  const handleGroupRenameSubmit = async event => {
    event.preventDefault();
    const nextName = groupRenameValue.trim();
    if (!nextName || isRenamingGroup || !activeChat.isGroup) return;
    if (!canEditActiveGroupInfo) {
      setIsGroupRenameOpen(false);
      setChatError(GROUP_INFO_PERMISSION_MESSAGE);
      return;
    }
    setIsRenamingGroup(true);
    setChatError('');
    try {
      let updatedRoom;
      if (usesManagementData || chatMode === 'tinode') {
        updatedRoom = await persistGroupMetadata({ name: nextName });
      } else {
        const memberIds = roomMembers(activeChat)
          .map(member => findAccount(directoryAccounts, member.id || member.uid || member.name)?.id || member.id)
          .filter(Boolean);
        const group = saveDemoGroup({
          id: activeChat.id,
          name: nextName,
          description: activeChat.description || '',
          avatar: activeChat.avatarUrl || '',
          ownerId: activeChat.adminId || viewerId,
          memberIds,
          groupSettings: activeGroupSettings,
        });
        updatedRoom = demoGroupToConversation(group, directoryAccounts, viewerId);
      }
      const actorId = chatMode === 'tinode' ? (tinodeClient.currentUserId || viewerId) : viewerId;
      const activityEvent = {
        action: 'group_name_changed',
        actorId,
        actorName: currentUser?.name || 'Một thành viên',
        previousName: activeChat.name || '',
        newName: nextName,
        updatedAt: new Date().toISOString(),
      };
      if (chatMode === 'tinode' && !usesManagementData) {
        const topicName = activeChat.tinodeTopic || await ensureTinodeConversationTopic(activeChat);
        await tinodeClient.sendSystemEvent(topicName, activityEvent).catch(error => {
          console.warn('ViChat: group rename activity announcement failed', error);
        });
        const realtimeRoom = await tinodeClient.openConversation(topicName).catch(() => null);
        if (realtimeRoom) {
          updatedRoom = {
            ...updatedRoom,
            ...normalizeTinodeConversation(realtimeRoom),
            messages: roomMessages(realtimeRoom),
          };
        }
      } else if (chatMode === 'demo') {
        const systemMessage = {
          id: `system-group-name-${Date.now()}`,
          type: 'system',
          ...activityEvent,
          senderId: actorId,
          senderName: currentUser?.name || 'Một thành viên',
          text: personalizeGroupSystemText({ ...activityEvent, type: 'system' }, directoryAccounts, viewerId),
          time: getTimeString(),
          createdAt: new Date().toISOString(),
        };
        const groupWithEvent = appendDemoGroupMessage(activeChat.id, systemMessage);
        updatedRoom = demoGroupToConversation(groupWithEvent, directoryAccounts, viewerId);
      }
      updateActiveGroupRoom({
        ...updatedRoom,
        name: nextName,
        groupSettings: updatedRoom?.groupSettings || activeGroupSettings,
      });
      setIsGroupRenameOpen(false);
    } catch (error) {
      setChatError(groupInfoErrorMessage(error, 'Không thể cập nhật tên nhóm.'));
    } finally {
      setIsRenamingGroup(false);
    }
  };

  const handleGroupManagementSubmit = async event => {
    event.preventDefault();
    if (isUpdatingGroupManagement || !activeChat.isGroup) return;
    if (!isActiveGroupAdmin) {
      setIsGroupManagementOpen(false);
      setChatError('Chỉ quản trị viên của nhóm mới có thể thay đổi thiết lập.');
      return;
    }
    const nextSettings = normalizeGroupSettings(groupManagementDraft);
    const changedSettings = GROUP_MANAGEMENT_OPTIONS
      .filter(option => activeGroupSettings[option.key] !== nextSettings[option.key])
      .map(option => ({
        key: option.key,
        enabled: nextSettings[option.key],
        label: option.label,
      }));
    setIsUpdatingGroupManagement(true);
    setGroupManagementNotice('');
    setChatError('');
    try {
      let updatedRoom;
      if (usesManagementData || chatMode === 'tinode') {
        updatedRoom = await persistGroupMetadata({ settings: nextSettings });
      } else {
        const memberIds = roomMembers(activeChat)
          .map(member => findAccount(directoryAccounts, member.id || member.uid || member.name)?.id || member.id)
          .filter(Boolean);
        const group = saveDemoGroup({
          id: activeChat.id,
          name: activeChat.name,
          description: activeChat.description || '',
          avatar: activeChat.avatarUrl || '',
          ownerId: activeChat.adminId || viewerId,
          memberIds,
          groupSettings: nextSettings,
        });
        updatedRoom = demoGroupToConversation(group, directoryAccounts, viewerId);
      }
      if (changedSettings.length > 0) {
        const actorId = chatMode === 'tinode' ? (tinodeClient.currentUserId || viewerId) : viewerId;
        const activityEvent = {
          action: 'group_settings_changed',
          actorId,
          actorName: currentUser?.name || 'Quản trị viên',
          changes: changedSettings,
          groupSettings: nextSettings,
          updatedAt: new Date().toISOString(),
        };
        if (chatMode === 'tinode' && !usesManagementData) {
          const topicName = activeChat.tinodeTopic || await ensureTinodeConversationTopic(activeChat);
          await tinodeClient.sendSystemEvent(topicName, activityEvent).catch(error => {
            console.warn('ViChat: group settings activity announcement failed', error);
          });
          const realtimeRoom = await tinodeClient.openConversation(topicName).catch(() => null);
          if (realtimeRoom) {
            updatedRoom = {
              ...normalizeTinodeConversation(realtimeRoom),
              ...updatedRoom,
              messages: roomMessages(realtimeRoom),
            };
          }
        } else if (chatMode === 'demo') {
          const systemMessage = {
            id: `system-group-settings-${Date.now()}`,
            type: 'system',
            ...activityEvent,
            senderId: actorId,
            senderName: currentUser?.name || 'Quản trị viên',
            text: personalizeGroupSystemText({ ...activityEvent, type: 'system' }, directoryAccounts, viewerId),
            time: getTimeString(),
            createdAt: activityEvent.updatedAt,
          };
          const groupWithEvent = appendDemoGroupMessage(activeChat.id, systemMessage);
          updatedRoom = demoGroupToConversation(groupWithEvent, directoryAccounts, viewerId);
        }
      }
      setGroupManagementDraft(nextSettings);
      updateActiveGroupRoom({ ...updatedRoom, groupSettings: nextSettings });
      setGroupManagementNotice('Đã lưu thiết lập quản lý nhóm.');
    } catch (error) {
      setChatError(groupInfoErrorMessage(error, 'Không thể lưu thiết lập quản lý nhóm.'));
    } finally {
      setIsUpdatingGroupManagement(false);
    }
  };

  const handleDissolveGroup = async () => {
    if (!activeChat?.isGroup || !isActiveGroupOwner || isDissolvingGroup) return;
    const groupName = activeChat.name || appCopy.t('Nhóm');
    const confirmed = window.confirm(
      `${appCopy.t('Bạn có chắc muốn giải tán nhóm')} "${groupName}"?\n\n${appCopy.t('Tất cả thành viên sẽ bị đưa ra khỏi nhóm và thao tác này không thể khôi phục.')}`,
    );
    if (!confirmed) return;

    const targetRoom = safeNormalizeConversationForRender(activeChat, activeChat.id);
    const actorId = currentUser?.id || currentUser?.uid || '';
    const tinodeActorId = tinodeClient.currentUserId || actorId;
    const deletedKeys = [targetRoom.id, targetRoom.managementId, targetRoom.tinodeTopic]
      .filter(Boolean)
      .map(String);
    deletedKeys.forEach(key => deletedConversationIdsRef.current.add(key));
    setIsDissolvingGroup(true);
    setChatError('');
    try {
      let removedTopic = '';
      if (usesManagementData) {
        await chatManagementService.dissolveGroup(targetRoom.managementId || targetRoom.id);
        removedTopic = targetRoom.tinodeTopic || '';
      } else if (chatMode === 'tinode') {
        removedTopic = await ensureTinodeConversationTopic(targetRoom);
        await tinodeClient.sendSystemEvent(removedTopic, {
          action: 'group_dissolved',
          actorId: tinodeActorId,
          actorName: currentUser?.name || 'Quản trị viên',
          groupName: targetRoom.name || '',
        });
        await tinodeClient.discardGroupTopic(removedTopic);
      } else {
        dissolveDemoGroup(targetRoom.id, actorId);
      }

      if (removedTopic) tinodeClient.disallowConversationTopic(removedTopic);
      const currentConversationMap = conversationsRef.current || conversations;
      const remainingRooms = Object.fromEntries(
        safeConversationEntries(currentConversationMap).filter(([id]) => id !== targetRoom.id),
      );
      setConversations(remainingRooms);
      conversationsRef.current = remainingRooms;
      clearPastedAttachments(targetRoom.id);
      setCurrentChatId(firstVisibleConversationId(remainingRooms, drafts, CHATBOT_ACCOUNT.id));
      setIsDetailOpen(false);
      setIsGroupManagementOpen(false);
      setGroupManagementNotice('');
      window.setTimeout(() => deletedKeys.forEach(key => deletedConversationIdsRef.current.delete(key)), 5000);
    } catch (error) {
      deletedKeys.forEach(key => deletedConversationIdsRef.current.delete(key));
      setChatError(error?.message || 'Không thể giải tán nhóm.');
    } finally {
      setIsDissolvingGroup(false);
    }
  };

  const executeGroupLeave = async (targetRoom, replacementId = '', replacementName = '', mode = 'leave') => {
    if (!targetRoom?.isGroup || isLeavingGroup) return false;
    const actorId = currentUser?.id || currentUser?.uid;
    const isOwner = groupRoleForIdentity(targetRoom, currentUser, directoryAccounts) === 'OWNER';
    const ownerReplacementMembers = isOwner
      ? groupOwnerReplacementMembers(targetRoom, directoryAccounts, currentUser)
      : [];
    if (isOwner && ownerReplacementMembers.length > 0 && !replacementId) {
      setGroupLeaveNotice('Quản trị viên phải chọn một thành viên mới trước khi rời nhóm.');
      return false;
    }

    setIsLeavingGroup(true);
    setChatError('');
    setGroupLeaveNotice('');
    const deletedKeys = [targetRoom.id, targetRoom.managementId, targetRoom.tinodeTopic]
      .filter(Boolean)
      .map(String);
    deletedKeys.forEach(key => deletedConversationIdsRef.current.add(key));
    const createdAt = new Date().toISOString();
    const systemMessage = {
      id: `system-leave-${Date.now()}`,
      type: 'system',
      action: 'member_left',
      senderId: actorId,
      senderName: currentUser?.name,
      ...(replacementId ? { replacementId, replacementName } : {}),
      text: `${currentUser?.name || 'Một thành viên'} đã rời khỏi nhóm`,
      time: getTimeString(),
      createdAt,
    };
    try {
      let departedTopic = '';
      if (usesManagementData) {
        await chatManagementService.deleteConversationForCurrentUser(
          targetRoom.managementId || targetRoom.id,
          { replacementId },
        );
        departedTopic = targetRoom.tinodeTopic || '';
      } else {
        if (chatMode === 'tinode' && targetRoom.id) {
          departedTopic = await ensureTinodeConversationTopic(targetRoom);
          await tinodeClient.sendSystemEvent(departedTopic, {
            action: 'member_left',
            actorId,
            actorName: currentUser?.name,
            ...(replacementId ? { replacementId, replacementName } : {}),
          });
        }
        if (mode === 'delete') {
          deleteDemoGroupForUser(targetRoom.id, actorId, currentUser?.name, replacementId, replacementName);
        } else {
          persistDemoGroupMessage(targetRoom, systemMessage);
          leaveDemoGroup(targetRoom.id, actorId, replacementId);
        }
      }
      if (departedTopic) tinodeClient.disallowConversationTopic(departedTopic);
      setConversations(previous => {
        const next = { ...previous };
        delete next[targetRoom.id];
        return next;
      });
      const currentConversationMap = conversationsRef.current || conversations;
      const remainingRooms = Object.fromEntries(
        safeConversationEntries(currentConversationMap).filter(([id]) => id !== targetRoom.id),
      );
      const nextId = firstVisibleConversationId(remainingRooms, drafts, CHATBOT_ACCOUNT.id);
      clearPastedAttachments(targetRoom.id);
      setCurrentChatId(nextId);
      setIsDetailOpen(false);
      setPendingGroupLeave(null);
      setGroupLeaveSearch('');
      setGroupLeaveReplacementId('');
      setGroupLeaveReplacementName('');
      setGroupLeaveNotice('');
      setTimeout(() => deletedKeys.forEach(key => deletedConversationIdsRef.current.delete(key)), 5000);
      return true;
    } catch (err) {
      deletedKeys.forEach(key => deletedConversationIdsRef.current.delete(key));
      const message = {
        OWNER_REPLACEMENT_REQUIRED: 'Quản trị viên phải chọn một thành viên mới trước khi rời nhóm.',
        OWNER_REPLACEMENT_INVALID: 'Thành viên được chọn không hợp lệ để nhận quyền trưởng nhóm.',
        OWNER_REPLACEMENT_NOT_MEMBER: 'Thành viên được chọn không còn ở trong nhóm.',
      }[err?.code] || err?.message || 'Không thể rời nhóm.';
      setChatError(message);
      setGroupLeaveNotice(message);
      return false;
    } finally {
      setIsLeavingGroup(false);
    }
  };

  const closeGroupLeaveDialog = () => {
    if (isLeavingGroup) return;
    setPendingGroupLeave(null);
    setGroupLeaveSearch('');
    setGroupLeaveReplacementId('');
    setGroupLeaveReplacementName('');
    setGroupLeaveNotice('');
  };

  const requestGroupLeave = (targetRoom, mode = 'leave') => {
    if (!targetRoom?.isGroup || isLeavingGroup) return;
    const isOwner = groupRoleForIdentity(targetRoom, currentUser, directoryAccounts) === 'OWNER';
    const closesEmptyGroup = groupActiveMembers(targetRoom, directoryAccounts)
      .every(member => identitiesOverlap(member, currentUser));
    const soleOwnerEffect = appCopy.t('Bạn là thành viên cuối cùng. Rời nhóm sẽ đóng nhóm này.');
    const confirmText = mode === 'delete'
      ? `${appCopy.t('Bạn có chắc muốn xóa hội thoại')} "${targetRoom.name}"?\n\n${closesEmptyGroup ? soleOwnerEffect : (isOwner ? appCopy.t('Bạn sẽ rời nhóm sau khi chọn trưởng nhóm mới.') : appCopy.t('Bạn sẽ rời khỏi nhóm và hội thoại sẽ được gỡ khỏi danh sách của bạn.'))}`
      : `${appCopy.t('Bạn có chắc muốn rời nhóm')} "${targetRoom.name}"?${closesEmptyGroup ? `\n\n${soleOwnerEffect}` : ''}`;
    if (isOwner) {
      if (!window.confirm(confirmText)) return;
      if (closesEmptyGroup) {
        void executeGroupLeave(targetRoom, '', '', mode);
        return;
      }
      setPendingGroupLeave({ room: targetRoom, mode });
      setGroupLeaveSearch('');
      setGroupLeaveReplacementId('');
      setGroupLeaveReplacementName('');
      setGroupLeaveNotice('');
      setChatError('');
      return;
    }
    if (window.confirm(confirmText)) {
      void executeGroupLeave(targetRoom, '', '', mode);
    }
  };

  const handleGroupLeaveSubmit = async event => {
    event.preventDefault();
    const targetRoom = pendingGroupLeaveRoom || pendingGroupLeave?.room;
    if (!targetRoom || isLeavingGroup) return;
    if (groupLeaveMembers.length === 0) {
      await executeGroupLeave(targetRoom, '', '', pendingGroupLeave.mode || 'leave');
      return;
    }
    const selectedReplacement = groupLeaveMembers.find(member => member.id === groupLeaveReplacementId);
    if (!selectedReplacement) {
      setGroupLeaveNotice('Hãy chọn một thành viên để trở thành trưởng nhóm mới.');
      return;
    }
    await executeGroupLeave(
      targetRoom,
      selectedReplacement.id,
      selectedReplacement.name || groupLeaveReplacementName,
      pendingGroupLeave.mode || 'leave',
    );
  };

  const handleLeaveGroup = () => {
    if (!activeChat.isGroup) return;
    requestGroupLeave(activeChat, 'leave');
  };

  const handleDeleteConversation = async (roomOverride = null) => {
    const selectedConversationId = currentChatIdRef.current || currentChatId;
    const overrideConversationId = conversationFallbackId(roomOverride?.id);
    const rawTargetRoom = overrideConversationId
      ? roomOverride
      : conversationsRef.current[selectedConversationId] || conversations[selectedConversationId];
    const targetRoom = rawTargetRoom
      ? safeNormalizeConversationForRender(rawTargetRoom, overrideConversationId || selectedConversationId)
      : null;
    const activeChat = targetRoom;
    if (!targetRoom?.id || targetRoom.isChatbot || isDeletingConversation) return;
    if (activeChat.isGroup) {
      requestGroupLeave(activeChat, 'delete');
      return;
    }
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
    const isManagedDirect = usesManagementData && !activeChat.isGroup;
    setIsDeletingConversation(true);
    setChatError('');
    const deletedKeys = [conversationId, activeChat.managementId, activeChat.tinodeTopic]
      .filter(Boolean)
      .map(String);
    if (!isManagedDirect) deletedKeys.forEach(key => deletedConversationIdsRef.current.add(key));
    try {
      let removedTopic = activeChat.tinodeTopic || '';
      let deletedAt = '';
      if (isManagedDirect) {
        const deletedConversation = await chatManagementService.deleteConversationForCurrentUser(
          activeChat.managementId || activeChat.id,
        );
        deletedAt = deletedConversation?.deletedAt || '';
        if (chatMode === 'tinode' && removedTopic) {
          try {
            const deletion = await tinodeClient.deleteConversation(removedTopic, { isGroup: false });
            deletedAt = deletedAt || deletion?.deletedAt || '';
          } catch (cleanupError) {
            console.warn('ViChat: direct Tinode history cleanup failed after Chatmgt deletion', cleanupError);
          }
        }
      } else {
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
        if (activeChat.isGroup) {
          deleteDemoGroupForUser(conversationId, viewerId, currentUser?.name);
        } else {
          deleteDemoDirectForUser(conversationId, viewerId);
        }
      }
      if (removedTopic && isManagedDirect) tinodeClient.allowConversationTopic(removedTopic);
      else if (removedTopic) tinodeClient.disallowConversationTopic(removedTopic);

      setConversations(previous => {
        const next = { ...previous };
        if (isManagedDirect) {
          const existing = previous[conversationId] || activeChat;
          next[conversationId] = {
            ...existing,
            deletedAt: deletedAt || existing.deletedAt || new Date().toISOString(),
            messages: [],
            friendEvents: [],
            lastMsg: '',
            time: '',
            badge: 0,
            unreadFromSeq: 0,
            notificationMutedUntil: null,
            pinned: false,
            pinnedAt: null,
            updatedAt: deletedAt || existing.updatedAt || new Date().toISOString(),
          };
        } else {
          delete next[conversationId];
        }
        conversationsRef.current = next;
        return next;
      });
      setDrafts(previous => {
        const next = { ...previous };
        delete next[conversationId];
        return next;
      });
      clearPastedAttachments(conversationId);
      setInputText('');
      const currentConversationMap = conversationsRef.current || conversations;
      const remainingRooms = Object.fromEntries(
        safeConversationEntries(currentConversationMap).filter(([id]) => id !== conversationId),
      );
      const nextId = firstVisibleConversationId(remainingRooms, drafts, CHATBOT_ACCOUNT.id);
      if (String(selectedConversationId) === String(conversationId)) {
        setCurrentChatId(nextId);
        setIsDetailOpen(false);
      }
      setTimeout(() => deletedKeys.forEach(key => deletedConversationIdsRef.current.delete(key)), 5000);
    } catch (error) {
      deletedKeys.forEach(key => deletedConversationIdsRef.current.delete(key));
      setChatError(error?.message || 'Không thể xóa cuộc trò chuyện.');
    } finally {
      setIsDeletingConversation(false);
    }
  };

  const updateConversationMute = async (conversationId, mutedUntil) => {
    const rawRoom = conversationsRef.current[conversationId];
    const room = rawRoom === null || rawRoom === undefined
      ? null
      : safeNormalizeConversationForRender(rawRoom, conversationId);
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
        const previousRoom = previous[conversationId] === null || previous[conversationId] === undefined
          ? null
          : safeNormalizeConversationForRender(previous[conversationId], conversationId);
        if (!previousRoom) return previous;
        const next = {
          ...previous,
          [conversationId]: {
            ...previousRoom,
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

  const patchConversationDirectBlockState = (conversationId, state) => {
    setConversations(previous => {
      const previousRoom = previous[conversationId] === null || previous[conversationId] === undefined
        ? null
        : safeNormalizeConversationForRender(previous[conversationId], conversationId);
      if (!previousRoom || previousRoom.isGroup || previousRoom.isChatbot) return previous;
      const next = {
        ...previous,
        [conversationId]: {
          ...previousRoom,
          blockedByViewer: state.blockedByViewer === true,
          blockedByPeer: state.blockedByPeer === true,
          directMessagingBlocked: state.directMessagingBlocked === true,
          directBlockExplicit: true,
        },
      };
      conversationsRef.current = next;
      return next;
    });
  };

  const handleDirectMessageBlockedError = (error, conversationId = currentChatIdRef.current) => {
    if (!isDirectMessageBlockedError(error)) return false;
    const rawRoom = conversationsRef.current[conversationId];
    const room = rawRoom === null || rawRoom === undefined
      ? null
      : safeNormalizeConversationForRender(rawRoom, conversationId);
    if (room && !room.isGroup && !room.isChatbot) {
      patchConversationDirectBlockState(conversationId, {
        blockedByViewer: room.blockedByViewer,
        blockedByPeer: room.blockedByViewer ? room.blockedByPeer : true,
        directMessagingBlocked: true,
      });
    }
    setChatError(DIRECT_MESSAGE_BLOCKED_TEXT);
    return true;
  };

  const updateConversationDirectBlock = async (room, blocked) => {
    if (!room || room.isGroup || room.isChatbot || room.id === 'empty') return false;
    const conversationId = room.id;
    const managementConversationId = room.managementId || room.id;
    const previousState = {
      blockedByViewer: room.blockedByViewer === true,
      blockedByPeer: room.blockedByPeer === true,
      directMessagingBlocked: room.directMessagingBlocked === true,
    };
    const optimisticState = {
      blockedByViewer: Boolean(blocked),
      blockedByPeer: previousState.blockedByPeer,
      directMessagingBlocked: Boolean(blocked) || previousState.blockedByPeer,
    };
    setIsUpdatingDirectBlock(true);
    setChatError('');
    patchConversationDirectBlockState(conversationId, optimisticState);
    if (blocked) {
      setShowEmojiPicker(false);
      setMentionContext(null);
      setReplyingTo(null);
      if (isRecordingVoice) stopVoiceRecording(true);
    }
    try {
      let persistedState = optimisticState;
      if (chatManagementService.remote && chatMode !== 'demo') {
        if (!isManagementConversationId(managementConversationId)) {
          throw new Error('Chatmgt chưa xác nhận cuộc trò chuyện này.');
        }
        const updated = await chatManagementService.updateDirectMessageBlock(
          managementConversationId,
          blocked,
        );
        persistedState = {
          blockedByViewer: updated.blockedByViewer === true,
          blockedByPeer: updated.blockedByPeer === true,
          directMessagingBlocked: updated.directMessagingBlocked === true,
        };
      }
      patchConversationDirectBlockState(conversationId, persistedState);
      return true;
    } catch (error) {
      patchConversationDirectBlockState(conversationId, previousState);
      setChatError(error?.message || 'Không thể cập nhật trạng thái chặn tin nhắn.');
      return false;
    } finally {
      setIsUpdatingDirectBlock(false);
    }
  };

  const updateConversationPin = async room => {
    if (!room || room.isChatbot || room.id === 'empty') return false;
    const nextPinned = !normalizeConversationFlag(room.pinned);
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
        persistedPinned = normalizeConversationFlag(updated.pinned);
        persistedPinnedAt = updated.pinnedAt || null;
      } else {
        toggleConversationPinIds(
          managementViewerId,
          managementConversationId,
          nextPinned,
          notificationSettingsViewerAliases,
          preferenceTenantId,
        );
      }
      setConversations(previous => {
        const previousRoom = previous[room.id] === null || previous[room.id] === undefined
          ? null
          : safeNormalizeConversationForRender(previous[room.id], room.id);
        if (!previousRoom) return previous;
        const next = {
          ...previous,
          [room.id]: {
            ...previousRoom,
            pinned: persistedPinned,
            pinnedAt: persistedPinnedAt,
            pinnedExplicit: true,
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
      const previousRoom = previous[room.id] === null || previous[room.id] === undefined
        ? null
        : safeNormalizeConversationForRender(previous[room.id], room.id);
      if (!previousRoom) return previous;
      const next = {
        ...previous,
        [room.id]: { ...previousRoom, badge: Math.max(1, previousRoom.badge || 0) },
      };
      conversationsRef.current = next;
      return next;
    });
    setConversationMenu(null);
  };

  const applyConversationCategoryState = categoryState => {
    setConversationCategoryOptions(categoryState.categories);
    setConversationCategories(categoryState.assignments);
    setConversations(previous => {
      const next = Object.fromEntries(safeConversationEntries(previous).map(([id, room]) => {
        const key = String(room.managementId || room.id || id);
        return [id, { ...room, category: categoryState.assignments[key] || '' }];
      }));
      conversationsRef.current = next;
      return next;
    });
  };

  const updateConversationCategory = (room, categoryId) => {
    if (!room) return;
    const viewerKey = managementViewerId || viewerId;
    if (!viewerKey) return;
    const conversationId = room.managementId || room.id;
    setConversationCategory(
      viewerKey,
      conversationId,
      categoryId,
      notificationSettingsViewerAliases,
      preferenceTenantId,
    );
    applyConversationCategoryState(readConversationCategoryState(
      viewerKey,
      notificationSettingsViewerAliases,
      preferenceTenantId,
    ));
    setConversationCategoryMenuOpen(false);
    setConversationMenu(null);
  };

  const saveManagedConversationCategory = draft => {
    const viewerKey = managementViewerId || viewerId;
    if (!viewerKey) return { error: 'viewer_required' };
    const saved = saveConversationCategory(viewerKey, draft, notificationSettingsViewerAliases, preferenceTenantId);
    if (saved.error || !saved.category) return saved;
    const nextState = setCategoryConversations(
      viewerKey,
      saved.category.id,
      draft.conversationIds,
      notificationSettingsViewerAliases,
      preferenceTenantId,
    );
    applyConversationCategoryState(nextState);
    return { ...saved, state: nextState };
  };

  const deleteManagedConversationCategory = categoryId => {
    const viewerKey = managementViewerId || viewerId;
    if (!viewerKey) return;
    applyConversationCategoryState(removeConversationCategory(
      viewerKey,
      categoryId,
      notificationSettingsViewerAliases,
      preferenceTenantId,
    ));
  };

  const reorderManagedConversationCategories = orderedIds => {
    const viewerKey = managementViewerId || viewerId;
    if (!viewerKey) return;
    applyConversationCategoryState(reorderConversationCategories(
      viewerKey,
      orderedIds,
      notificationSettingsViewerAliases,
      preferenceTenantId,
    ));
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
    const shouldMute = typeof event?.target?.checked === 'boolean'
      ? event.target.checked
      : !activeChatMuted;
    if (shouldMute) {
      setNotificationMuteOption(NOTIFICATION_MUTE_OPTIONS.ONE_HOUR);
      setNotificationMuteDialog({ id: activeChat.id, name: activeChat.name });
      return;
    }
    void updateConversationMute(activeChat.id, null);
  };

  const handleConversationDirectBlockToggle = event => {
    const shouldBlock = typeof event?.target?.checked === 'boolean'
      ? event.target.checked
      : !activeChatBlockedByViewer;
    void updateConversationDirectBlock(activeChat, shouldBlock);
  };

  const handleNotificationMuteSubmit = async event => {
    event.preventDefault();
    if (!notificationMuteDialog) return;
    const mutedUntil = resolveNotificationMuteUntil(notificationMuteOption, Date.now());
    const updated = await updateConversationMute(notificationMuteDialog.id, mutedUntil);
    if (updated) setNotificationMuteDialog(null);
  };

  const patchActiveConversationBackground = (nextBackground, { shared = false } = {}) => {
    setConversationBackgrounds(previous => ({
      ...previous,
      [activeBackgroundStateKey]: nextBackground,
    }));
    if (!shared) return;
    setConversations(previous => {
      const currentRoom = previous[activeChat.id] === null || previous[activeChat.id] === undefined
        ? null
        : safeNormalizeConversationForRender(previous[activeChat.id], activeChat.id);
      if (!currentRoom) return previous;
      const next = {
        ...previous,
        [activeChat.id]: { ...currentRoom, conversationBackground: nextBackground },
      };
      conversationsRef.current = next;
      return next;
    });
  };

  const openConversationBackgroundPicker = () => {
    if (!activeChat || activeChat.id === 'empty' || activeChat.isChatbot) return;
    const preferredScope = chatMode === 'demo'
      ? CONVERSATION_BACKGROUND_SCOPES.LOCAL
      : activeBackgroundPreference?.scope
      || (activeChat.isGroup ? CONVERSATION_BACKGROUND_SCOPES.LOCAL : CONVERSATION_BACKGROUND_SCOPES.SHARED);
    const scope = activeChat.isGroup
      && !canEditActiveGroupInfo
      && preferredScope === CONVERSATION_BACKGROUND_SCOPES.SHARED
      ? CONVERSATION_BACKGROUND_SCOPES.LOCAL
      : preferredScope;
    setConversationBackgroundScope(scope);
    setConversationBackgroundSelection(activeConversationBackground || null);
    setConversationBackgroundNotice('');
    setIsConversationBackgroundOpen(true);
  };

  const selectConversationBackgroundScope = scope => {
    if (
      scope === CONVERSATION_BACKGROUND_SCOPES.SHARED
      && activeChat.isGroup
      && !canEditActiveGroupInfo
    ) {
      setConversationBackgroundScope(CONVERSATION_BACKGROUND_SCOPES.LOCAL);
      setConversationBackgroundNotice(GROUP_INFO_PERMISSION_MESSAGE);
      return;
    }
    setConversationBackgroundScope(scope);
    setConversationBackgroundNotice('');
  };

  const selectConversationBackgroundPreset = preset => {
    const normalized = normalizeConversationBackground({ ...preset, kind: 'preset' });
    setConversationBackgroundSelection(normalized);
    setConversationBackgroundNotice('');
  };

  const clearConversationBackgroundSelection = () => {
    setConversationBackgroundSelection(null);
    setConversationBackgroundNotice('');
  };

  const handleConversationBackgroundFileChange = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const validationError = validateConversationBackgroundFile(file, {
      localOnly: chatMode === 'demo'
        || conversationBackgroundScope === CONVERSATION_BACKGROUND_SCOPES.LOCAL,
    });
    if (validationError) {
      setConversationBackgroundNotice(validationError);
      return;
    }
    setConversationBackgroundNotice('');
    setConversationBackgroundCropFile(file);
  };

  const handleConversationBackgroundCropSave = async croppedFile => {
    try {
      const previewUrl = await readFileAsDataUrl(croppedFile);
      setConversationBackgroundSelection({
        id: 'custom',
        url: previewUrl,
        label: conversationBackgroundCropFile?.name || 'Ảnh đã căn chỉnh',
        kind: 'custom',
        file: croppedFile,
      });
      setConversationBackgroundCropFile(null);
      setConversationBackgroundNotice('');
      return true;
    } catch (error) {
      setConversationBackgroundNotice(error?.message || 'Không thể đọc ảnh hình nền.');
      return false;
    }
  };

  const handleConversationBackgroundApply = async event => {
    event.preventDefault();
    if (isSavingConversationBackground || !activeChat || activeChat.id === 'empty' || activeChat.isChatbot) return;
    const selected = conversationBackgroundSelection;
    const requestedSharedScope = chatMode !== 'demo'
      && conversationBackgroundScope === CONVERSATION_BACKGROUND_SCOPES.SHARED;
    if (requestedSharedScope && !allowDirectMessagingAttempt(activeChat)) return;
    if (requestedSharedScope && activeChat.isGroup && !canEditActiveGroupInfo) {
      setConversationBackgroundScope(CONVERSATION_BACKGROUND_SCOPES.LOCAL);
      setConversationBackgroundNotice(GROUP_INFO_PERMISSION_MESSAGE);
      return;
    }
    setIsSavingConversationBackground(true);
    setConversationBackgroundNotice('');
    setChatError('');
    try {
      const sharedScope = requestedSharedScope;
      const selectedUpload = selected?.file || selected?.blob;
      if (selectedUpload) {
        const uploadValidationError = validateConversationBackgroundFile(selectedUpload, { localOnly: !sharedScope });
        if (uploadValidationError) throw new Error(uploadValidationError);
      }
      let nextBackground = selected
        ? normalizeConversationBackground({
          ...selected,
          scope: sharedScope
            ? CONVERSATION_BACKGROUND_SCOPES.SHARED
            : CONVERSATION_BACKGROUND_SCOPES.LOCAL,
        })
        : null;
      const previousBackground = activeConversationBackground;
      if (!sharedScope) {
        if (selected?.file) {
          const fileRecord = await writeConversationBackgroundFile(
            conversationBackgroundViewerId,
            conversationBackgroundTenantId,
            activeBackgroundConversationId,
            selected.file,
            undefined,
            conversationBackgroundViewerAliases,
          );
          nextBackground = { ...fileRecord, scope: CONVERSATION_BACKGROUND_SCOPES.LOCAL };
        }
        if (previousBackground?.customKey && previousBackground.customKey !== nextBackground?.customKey) {
          await deleteConversationBackgroundFile(
            conversationBackgroundViewerId,
            conversationBackgroundTenantId,
            activeBackgroundConversationId,
            undefined,
            conversationBackgroundViewerAliases,
          ).catch(() => {});
        }
        writeConversationBackgroundPreference(
          conversationBackgroundViewerId,
          conversationBackgroundTenantId,
          activeBackgroundConversationId,
          CONVERSATION_BACKGROUND_SCOPES.LOCAL,
          nextBackground,
          undefined,
          conversationBackgroundViewerAliases,
        );
        if (!activeChat.isGroup && chatMode === 'demo') {
          const systemMessage = {
            id: `system-background-${Date.now()}`,
            type: 'system',
            action: 'conversation_background_changed',
            senderId: viewerId,
            senderName: currentUser?.name || 'Bạn',
            backgroundId: nextBackground?.id || '',
            backgroundUrl: nextBackground?.url || '',
            backgroundLabel: nextBackground?.label || '',
            backgroundKind: nextBackground?.kind || '',
            text: nextBackground ? 'Bạn đã đổi hình nền cuộc trò chuyện' : 'Bạn đã xóa hình nền cuộc trò chuyện',
            time: getTimeString(),
            createdAt: new Date().toISOString(),
          };
          const updatedDirect = appendDemoDirectMessage(activeChat.id, systemMessage);
          const nextRoom = demoDirectToConversation(updatedDirect, directoryAccounts, managementViewerId);
          setConversations(previous => {
            const next = { ...previous, [activeChat.id]: nextRoom };
            conversationsRef.current = next;
            return next;
          });
        }
      } else {
        const localPreference = readConversationBackgroundPreference(
          conversationBackgroundViewerId,
          conversationBackgroundTenantId,
          activeBackgroundConversationId,
          undefined,
          conversationBackgroundViewerAliases,
        );
        if (realtimeMessagingPending) throw new Error('Kết nối realtime Tinode chưa sẵn sàng.');
        let topicName = activeChat.tinodeTopic || '';
        if (selected?.file || !(activeChat.isGroup && usesManagementData)) {
          topicName = topicName || await ensureTinodeConversationTopic(activeChat);
        }
        if (selected?.kind === 'custom' && !selectedUpload && String(selected?.url || '').startsWith('indexeddb://')) {
          throw new Error('Ảnh hình nền cục bộ không còn sẵn sàng. Hãy chọn lại ảnh từ máy tính.');
        }
        if (selectedUpload) {
          if (!topicName) throw new Error('Nhóm chưa sẵn sàng tải hình nền lên Tinode.');
          const uploadedUrl = await tinodeClient.uploadConversationBackground(topicName, selectedUpload);
          if (!uploadedUrl) throw new Error('Không nhận được ảnh hình nền sau khi tải lên.');
          nextBackground = normalizeConversationBackground({
            id: 'custom',
            url: uploadedUrl,
            label: selected.file?.name || selected.label || 'Ảnh tải lên',
            kind: 'custom',
            scope: CONVERSATION_BACKGROUND_SCOPES.SHARED,
          });
        }
        if (activeChat.isGroup && usesManagementData) {
          // Chatmgt owns managed group metadata. The upload may use the
          // current member session, but the shared metadata update must use
          // the server-side owner bridge.
          const managedRoom = await chatManagementService.updateGroupSettings(
            activeChat.managementId || activeChat.id,
            { background: nextBackground },
          );
          nextBackground = managedRoom?.conversationBackground !== undefined
            ? managedRoom.conversationBackground
            : nextBackground;
        } else {
          nextBackground = await tinodeClient.updateConversationBackground(topicName, nextBackground);
        }
        if (nextBackground?.url) nextBackground = {
          ...nextBackground,
          url: normalizeTinodeMediaUrl(nextBackground.url),
          scope: CONVERSATION_BACKGROUND_SCOPES.SHARED,
        };
        if (localPreference?.background?.customKey) {
          await deleteConversationBackgroundFile(
            conversationBackgroundViewerId,
            conversationBackgroundTenantId,
            activeBackgroundConversationId,
            undefined,
            conversationBackgroundViewerAliases,
          ).catch(() => {});
        }
        clearConversationBackground(
          conversationBackgroundViewerId,
          conversationBackgroundTenantId,
          activeBackgroundConversationId,
          undefined,
          conversationBackgroundViewerAliases,
        );
      }
      const viewerBackground = sharedScope
        ? nextBackground
        : (nextBackground || createClearedConversationBackground(CONVERSATION_BACKGROUND_SCOPES.LOCAL));
      patchActiveConversationBackground(viewerBackground, { shared: sharedScope });
      setConversationBackgroundSelection(viewerBackground?.cleared ? null : viewerBackground);
      setIsConversationBackgroundOpen(false);
    } catch (error) {
      if (handleDirectMessageBlockedError(error, activeChat.id)) {
        setConversationBackgroundNotice(DIRECT_MESSAGE_BLOCKED_TEXT);
      } else {
        setConversationBackgroundNotice(groupInfoErrorMessage(error, 'Không thể cập nhật hình nền cuộc trò chuyện.'));
      }
    } finally {
      setIsSavingConversationBackground(false);
    }
  };

  const handleCreateGroup = async (event) => {
    event.preventDefault();
    const name = groupName.trim();
    if (!name || createGroupRequestRef.current) return;
    const selectedGroupMemberIds = groupMemberIds.filter(memberId => !identitiesOverlap({ id: memberId }, currentUser));
    if (selectedGroupMemberIds.length === 0) {
      setChatError('Vui lòng chọn ít nhất 1 thành viên khác để tạo nhóm.');
      return;
    }
    createGroupRequestRef.current = true;
    setChatError('');
    setIsCreatingGroup(true);
    try {
      let room;
      const actorId = currentUser?.id || currentUser?.uid;
      const addedNames = selectedGroupMemberIds.map(memberId =>
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
        targetIds: selectedGroupMemberIds,
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
          participantIds: selectedGroupMemberIds,
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
          const realtimeRoom = normalizeTinodeConversation(await tinodeClient.openConversation(tinodeTopic));
          if (accountSessionRef.current !== accountSession) throw new Error('Phiên tài khoản đã thay đổi.');
          room = {
            ...realtimeRoom,
            ...room,
            tinodeTopic,
            messages: roomMessages(realtimeRoom),
          };
          const provisionalRoom = normalizeTinodeConversation(room);
          const provisionalRooms = {
            ...Object.fromEntries(safeConversationEntries(conversationsRef.current)),
            [provisionalRoom.id]: provisionalRoom,
          };
          conversationsRef.current = provisionalRooms;
          setConversations(provisionalRooms);
          tinodeClient.allowConversationTopic(tinodeTopic);
          const tinodeActorId = tinodeClient.currentUserId || viewerId;
      const targetUids = roomMembers(realtimeRoom)
            .filter(member => member.id && member.id !== tinodeActorId);
          await tinodeClient.sendSystemEvent(tinodeTopic, {
            action: addedNames.length > 0 ? 'member_added' : 'group_created',
            actorId: tinodeActorId,
            actorName: currentUser?.name,
            targets: targetUids.map(member => ({
              id: member.id,
              name: mentionCanonicalText(findAccount(directoryAccounts, member.id) || member) || member.id,
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
          memberIds: selectedGroupMemberIds,
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
    if (!canEditActiveGroupInfo) {
      setChatError(GROUP_INFO_PERMISSION_MESSAGE);
      return;
    }
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
        saveDemoGroup({
          id: activeChat.id,
          name: activeChat.name,
          description: activeChat.description || '',
          avatar: avatarUrl,
          ownerId: activeChat.adminId || viewerId,
          memberIds,
        });
        const activityEvent = {
          action: 'group_avatar_changed',
          actorId: viewerId,
          actorName: currentUser?.name || 'Một thành viên',
          avatarUrl,
          updatedAt: new Date().toISOString(),
        };
        const systemMessage = {
          id: `system-group-avatar-${Date.now()}`,
          type: 'system',
          ...activityEvent,
          senderId: viewerId,
          senderName: currentUser?.name || 'Một thành viên',
          text: personalizeGroupSystemText({ ...activityEvent, type: 'system' }, directoryAccounts, viewerId),
          time: getTimeString(),
          createdAt: activityEvent.updatedAt,
        };
        const groupWithEvent = appendDemoGroupMessage(activeChat.id, systemMessage);
        updateActiveGroupRoom(demoGroupToConversation(groupWithEvent, directoryAccounts, viewerId));
        return;
      }
      const topicName = activeChat.tinodeTopic || await ensureTinodeConversationTopic(activeChat);
      const previousAvatarUrl = activeChat.avatarUrl || '';
      // Chatmgt owns managed group metadata. Deputies may upload through
      // Tinode, but only the owner bridge writes the shared public metadata.
      const avatarUrl = usesManagementData
        ? await tinodeClient.uploadGroupAvatar(topicName, file)
        : await tinodeClient.updateGroupAvatar(topicName, file);
      let persistedAvatarUrl = avatarUrl;
      try {
        if (usesManagementData && isManagementConversationId(activeChat.managementId || activeChat.id)) {
          const persistedRoom = await chatManagementService.updateGroupProfile(
            activeChat.managementId || activeChat.id,
            { avatar: avatarUrl },
          );
          persistedAvatarUrl = persistedRoom?.avatarUrl || avatarUrl;
        }
      } catch (error) {
        if (!usesManagementData) {
          await tinodeClient.updateGroupMetadata(topicName, { avatar: previousAvatarUrl }).catch(() => {});
        }
        throw error;
      }
      groupAvatarSyncRef.current.set(activeChat.id, persistedAvatarUrl);
      groupAvatarSyncRef.current.set(topicName, persistedAvatarUrl);
      const activityEvent = {
        action: 'group_avatar_changed',
        actorId: tinodeClient.currentUserId || viewerId,
        actorName: currentUser?.name || 'Một thành viên',
        avatarUrl: persistedAvatarUrl,
        updatedAt: new Date().toISOString(),
      };
      if (!usesManagementData) {
        await tinodeClient.sendSystemEvent(topicName, activityEvent).catch(error => {
          console.warn('ViChat: group avatar activity announcement failed', error);
        });
      }
      const realtimeRoom = await tinodeClient.openConversation(topicName).catch(() => null);
      updateActiveGroupRoom({
        ...(realtimeRoom ? normalizeTinodeConversation(realtimeRoom) : {}),
        avatarUrl: persistedAvatarUrl,
        ...(realtimeRoom ? { messages: roomMessages(realtimeRoom) } : {}),
      });
    } catch (error) {
      setChatError(groupInfoErrorMessage(error, 'Không thể cập nhật ảnh nhóm.'));
    } finally {
      setIsUpdatingGroupAvatar(false);
    }
  };

  const handleAddGroupMembers = async () => {
    if (
      isAddingGroupMembers
      || !activeChat.isGroup
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
        const activeMemberIds = new Set((managedRoom.participantIds || []).map(id => String(id)));
        const approvedSelectedMembers = selectedMembers.filter(member => activeMemberIds.has(String(member.id || member.uid || member.tinodeUid || member.tinode_uid)));
        if (chatMode === 'tinode' && approvedSelectedMembers.length > 0) {
          const topicName = activeChat.tinodeTopic
            || managedRoom.tinodeTopic
            || await ensureTinodeConversationTopic({
              ...activeChat,
              id: stateConversationId,
              managementId: managementConversationId,
            });
          const realtimeRoom = await tinodeClient.openConversation(topicName);
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
            name: mentionCanonicalText(member),
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
          [stateConversationId]: safeMergeTinodeConversation(currentRoom, updatedRoom),
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

  const handleGroupMemberApproval = async (member, approved) => {
    if (
      approvingMemberId
      || !activeChat.isGroup
      || !canApproveActiveGroupMembers
      || !usesManagementData
    ) return;
    const memberId = String(member?.id || member?.uid || member?.tinodeUid || member?.tinode_uid || '').trim();
    if (!memberId) return;
    const stateConversationId = activeChat.id;
    const managementConversationId = activeChat.managementId || stateConversationId;
    setApprovingMemberId(memberId);
    setChatError('');
    try {
      const accountSession = accountSessionRef.current;
      const managedRoom = await chatManagementService.updateConversationParticipantApproval(
        managementConversationId,
        memberId,
        approved,
      );
      let updatedRoom = {
        ...normalizeTinodeConversation(managedRoom),
        ...managedRoom,
        id: stateConversationId,
        managementId: managementConversationId,
        accountSession,
        managementSnapshot: true,
        messages: roomMessages(activeChat),
      };
      const topicName = activeChat.tinodeTopic || managedRoom.tinodeTopic;
      if (chatMode === 'tinode' && topicName) {
        const realtimeRoom = await tinodeClient.openConversation(topicName);
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
      }
      setConversations(previous => {
        const currentRoom = previous[stateConversationId] || activeChat;
        const next = {
          ...previous,
          [stateConversationId]: safeMergeTinodeConversation(currentRoom, updatedRoom),
        };
        conversationsRef.current = next;
        return next;
      });
    } catch (error) {
      setChatError(error?.message || (approved
        ? 'Không thể duyệt thành viên vào nhóm.'
        : 'Không thể từ chối thành viên trong nhóm.'));
    } finally {
      setApprovingMemberId('');
    }
  };

  const handleGroupMemberRoleChange = async (member, nextRole) => {
    if (
      updatingGroupMemberRoleId
      || !activeChat.isGroup
      || !usesManagementData && chatMode !== 'demo'
      || !isActiveGroupAdmin
    ) return;
    const memberId = String(member?.id || member?.uid || member?.tinodeUid || member?.tinode_uid || '').trim();
    const role = normalizeGroupRole(nextRole);
    if (!memberId || !['ADMIN', 'MEMBER'].includes(role)) return;
    if (
      role === 'ADMIN'
      ? !canAppointGroupDeputy(activeChat, directoryAccounts, currentUser, member)
      : !canRevokeGroupDeputy(activeChat, directoryAccounts, currentUser, member)
    ) return;

    const stateConversationId = activeChat.id;
    const managementConversationId = activeChat.managementId || stateConversationId;
    const previousRole = groupRoleForIdentity(activeChat, member, directoryAccounts);
    if (previousRole === role) return;
    setUpdatingGroupMemberRoleId(memberId);
    setGroupMemberMenuId('');
    setChatError('');
    try {
      let updatedRoom;
      if (usesManagementData) {
        const managedRoom = await chatManagementService.updateConversationParticipantRole(
          managementConversationId,
          memberId,
          role,
        );
        updatedRoom = {
          ...normalizeTinodeConversation(managedRoom),
          ...managedRoom,
          id: stateConversationId,
          managementId: managementConversationId,
          accountSession: accountSessionRef.current,
          managementSnapshot: true,
          messages: roomMessages(activeChat),
        };
        const topicName = activeChat.tinodeTopic || managedRoom.tinodeTopic;
        if (chatMode === 'tinode' && topicName) {
          const realtimeRoom = await tinodeClient.openConversation(topicName);
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
        }
      } else {
        const group = updateDemoGroupMemberRole(
          activeChat.id,
          memberId,
          currentUser?.id || currentUser?.uid,
          role,
        );
        const actorId = currentUser?.id || currentUser?.uid || viewerId;
        const targetName = member.name || member.username || memberId;
        const activityMessage = {
          id: `system-group-role-${Date.now()}`,
          type: 'system',
          action: 'group_role_changed',
          senderId: actorId,
          senderName: currentUser?.name || 'Trưởng nhóm',
          targetId: memberId,
          targetIds: [memberId],
          previousRole,
          role,
          text: role === 'ADMIN'
            ? `${currentUser?.name || 'Trưởng nhóm'} đã bổ nhiệm ${targetName} làm phó nhóm`
            : `${currentUser?.name || 'Trưởng nhóm'} đã thu hồi quyền phó nhóm của ${targetName}`,
          time: getTimeString(),
          createdAt: new Date().toISOString(),
        };
        const groupWithEvent = appendDemoGroupMessage(group.id, activityMessage);
        updatedRoom = demoGroupToConversation(groupWithEvent, directoryAccounts, actorId);
      }
      setConversations(previous => {
        const currentRoom = previous[stateConversationId] || activeChat;
        const next = {
          ...previous,
          [stateConversationId]: safeMergeTinodeConversation(currentRoom, updatedRoom),
        };
        conversationsRef.current = next;
        return next;
      });
    } catch (error) {
      setChatError(error?.message || (role === 'ADMIN'
        ? 'Không thể bổ nhiệm phó nhóm.'
        : 'Không thể thu hồi quyền phó nhóm.'));
    } finally {
      setUpdatingGroupMemberRoleId('');
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
    const memberIdentity = String(member.id || member.uid || member.tinodeUid || member.tinode_uid || member.name);
    setRemovingMemberId(memberIdentity);
    setChatError('');
    try {
      const memberAccount = findAccount(directoryAccounts, memberIdentity)
        || findAccount(roomMembers(activeChat), memberIdentity);
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
          name: mentionCanonicalText(memberAccount || member),
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
          [stateConversationId]: safeMergeTinodeConversation(currentRoom, {
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

  const directMessagingError = room => {
    if (!room || room.isGroup || room.isChatbot) return '';
    if (room.blockedByViewer === true) return 'Bạn đã chặn tin nhắn. Hãy bỏ chặn để tiếp tục.';
    if (room.blockedByPeer === true || room.directMessagingBlocked === true) return DIRECT_MESSAGE_BLOCKED_TEXT;
    return '';
  };

  const allowDirectMessagingAttempt = room => {
    const message = directMessagingError(room);
    if (!message) return true;
    setChatError('');
    window.setTimeout(() => setChatError(message), 0);
    return false;
  };

  const groupSpamStateKey = room => String(room?.tinodeTopic || room?.id || '').trim();

  const announceGroupSpamCooldown = (state, now = Date.now()) => {
    const remaining = groupSpamRemainingSeconds(state, now);
    if (remaining <= 0) return false;
    setGroupSpamClock(now);
    setChatError(groupSpamCooldownMessage(remaining));
    setShowEmojiPicker(false);
    return true;
  };

  const allowGroupSendDuringCooldown = room => {
    if (!room?.isGroup) return true;
    const key = groupSpamStateKey(room);
    const state = groupSpamStatesRef.current.get(key) || createGroupSpamState();
    return !announceGroupSpamCooldown(state);
  };

  const registerGroupSendAttempt = (room, requestedActionId = '') => {
    if (!room?.isGroup) return { allowed: true, groupActionId: '' };
    const key = groupSpamStateKey(room);
    if (!key) return { allowed: true, groupActionId: '' };
    const groupActionId = requestedActionId || createGroupSpamActionId('web-group');
    const now = Date.now();
    const result = registerGroupSpamAttempt(groupSpamStatesRef.current.get(key), {
      now,
      actionId: groupActionId,
    });
    groupSpamStatesRef.current.set(key, result.state);
    setGroupSpamClock(now);
    if (!result.allowed) announceGroupSpamCooldown(result.state, now);
    else setChatError(previous => /gửi quá nhanh/iu.test(previous) ? '' : previous);
    return { ...result, groupActionId };
  };

  const handleGroupSpamCooldownError = (error, conversationId = currentChatIdRef.current) => {
    if (!isGroupSpamCooldownError(error)) return false;
    const rawRoom = conversationsRef.current[conversationId];
    const room = rawRoom === null || rawRoom === undefined
      ? null
      : safeNormalizeConversationForRender(rawRoom, conversationId);
    if (!room?.isGroup) return false;
    const key = groupSpamStateKey(room);
    const now = Date.now();
    const retryAfterMs = groupSpamErrorRetryAfterMs(error) || GROUP_SPAM_BASE_COOLDOWN_MS;
    const state = applyGroupSpamCooldown(groupSpamStatesRef.current.get(key), retryAfterMs, now);
    groupSpamStatesRef.current.set(key, state);
    announceGroupSpamCooldown(state, now);
    return true;
  };

  // --- Attach & Gửi tệp tin ---
  const openAttachmentPicker = inputRef => {
    if (!allowDirectMessagingAttempt(activeChat)) return;
    if (!allowGroupSendDuringCooldown(activeChat)) return;
    if (activeChat.isChatbot) {
      setChatError('Trợ lý AI hiện chỉ nhận tin nhắn văn bản.');
      return;
    }
    if (realtimeMessagingPending) {
      setChatError('Kết nối realtime Tinode chưa sẵn sàng; dữ liệu Chatmgt vẫn đang hoạt động.');
      return;
    }
    if (!canSendInActiveGroup) {
      setChatError('Quản trị viên đã tạm khóa quyền gửi tin nhắn trong nhóm.');
      return;
    }
    if (inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleAttachClick = () => openAttachmentPicker(fileInputRef);
  const handleImageAttachClick = () => openAttachmentPicker(imageInputRef);

  const handleSendFile = (file, options = {}) => {
    const {
      voiceDuration = 0,
      imageBatch = null,
      caption = '',
      mentions = [],
      groupActionId = '',
    } = options;
    if (!file) return;
    if (!allowDirectMessagingAttempt(activeChat)) return;
    if (activeChat?.isChatbot) {
      setChatError('Trợ lý AI hiện chỉ nhận tin nhắn văn bản.');
      return;
    }
    if (realtimeMessagingPending) {
      setChatError('Kết nối realtime Tinode chưa sẵn sàng; dữ liệu Chatmgt vẫn đang hoạt động.');
      return;
    }
    if (!canSendInActiveGroup) {
      setChatError('Quản trị viên đã tạm khóa quyền gửi tin nhắn trong nhóm.');
      return;
    }
    const validationError = chatAttachmentValidationError(file);
    if (validationError) {
      setChatError(validationError);
      return;
    }
    const groupSpamAttempt = registerGroupSendAttempt(activeChat, groupActionId);
    if (!groupSpamAttempt.allowed) return;
    const resolvedGroupActionId = groupSpamAttempt.groupActionId;
    setChatError('');
    const replyMeta = Object.prototype.hasOwnProperty.call(options, 'replyMeta')
      ? options.replyMeta
      : replyingTo ? { ...replyingTo } : null;
    const sharedReplyMeta = replyMetadataForTransport(replyMeta, directoryAccounts);
    const captionText = String(caption || '').trim();
    const captionMentions = captionText
      ? (Array.isArray(mentions) ? mentions : [])
        .filter(mention => mentionTokenExists(captionText, mention.token))
        .map(serializeMentionForTransport)
        .filter(Boolean)
      : [];

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
    const normalizedImageBatch = isImage ? normalizeImageBatch(imageBatch) : null;
    const previousActivity = conversationActivitySnapshot(conversations[currentChatId]);
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
      imageBatch: normalizedImageBatch || undefined,
      text: captionText,
      mentions: captionMentions,
      replyTo: replyMeta,
      voiceDuration: Number(voiceDuration) || 0,
      time: timeStr,
      createdAt,
      pending: chatMode === 'tinode',
    };

    // 1. Thêm vào conversations state
    setConversations(prev => {
      const room = prev[currentChatId];
      const attachmentPreview = normalizedImageBatch?.index > 0 && !captionText && room?.lastMsg
        ? room.lastMsg
        : attachmentConversationPreview(newMsg);
      return {
        ...prev,
        [currentChatId]: {
          ...room,
          messages: [...roomMessages(room), newMsg],
          lastMsg: attachmentPreview,
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
          const result = await tinodeClient.sendFile(topicName, uploadFile, newMsg.id, {
            replyTo: sharedReplyMeta,
            voiceDuration,
            imageBatch: normalizedImageBatch,
            caption: captionText,
            mentions: captionMentions,
            groupActionId: resolvedGroupActionId,
          });
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
          void ingestChatDocument({
            file: uploadFile,
            conversationId: room.managementId || room.id,
            tinodeTopic: topicName,
            sequence: result.ctrl?.params?.seq,
            caption: captionText,
          }).catch(error => {
            // RAG indexing is best-effort and must never change file delivery.
            console.warn('ViChat: chat document indexing failed', error);
          });
          if (previewUrl) URL.revokeObjectURL(previewUrl);
        })
        .catch(err => {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          const spamBlocked = handleGroupSpamCooldownError(err, roomId);
          const blocked = handleDirectMessageBlockedError(err, roomId);
          setConversations(previous => {
            const currentRoom = previous[roomId];
            if (!currentRoom) return previous;
            return {
              ...previous,
              [roomId]: (blocked || spamBlocked) ? removeMessageFromConversation(currentRoom, newMsg, previousActivity) : {
                ...currentRoom,
                messages: roomMessages(currentRoom).map(message => message.id === newMsg.id
                  ? { ...message, pending: false, failed: true }
                  : message),
              },
            };
          });
          if (!blocked && !spamBlocked) setChatError(err?.message || 'Không thể tải tệp lên Tinode.');
        });
    }
  };

  const closePollComposer = () => setPollComposer(null);

  const openPollComposer = () => {
    if (!activeChat?.isGroup) return;
    if (!allowGroupSendDuringCooldown(activeChat)) return;
    if (!canCreatePollInActiveGroup) {
      setChatError('Quản trị viên đã tắt quyền tạo bình chọn trong nhóm.');
      return;
    }
    if (activeChat.isChatbot || realtimeMessagingPending || isRecordingVoice || !canSendInActiveGroup) {
      setChatError('Bình chọn chỉ khả dụng khi nhóm đang sẵn sàng nhận tin nhắn.');
      return;
    }
    setChatError('');
    setShowEmojiPicker(false);
    setPollComposer(createPollComposerState());
  };

  const pollActivityMessage = (event, actorId, actorName, sourceMessage) => ({
    id: `poll-activity-${event.clientId || Date.now()}`,
    type: 'system',
    action: event.action,
    sender: actorId === (tinodeClient.currentUserId || viewerId) ? 'outgoing' : 'incoming',
    senderId: actorId,
    senderName: actorName,
    pollEvent: { ...event, actorId, actorName },
    systemEvent: { ...event, actorId, actorName },
    text: personalizeGroupSystemText({ action: event.action, senderId: actorId, senderName: actorName, pollEvent: event }, directoryAccounts, viewerId),
    time: getTimeString(),
    createdAt: event.createdAt || new Date().toISOString(),
    pollId: sourceMessage?.poll?.id || sourceMessage?.pollData?.id || '',
  });

  const applyLocalPollEvent = (message, event) => {
    const actorId = event.actorId || tinodeClient.currentUserId || viewerId;
    const room = conversationsRef.current[activeChat.id];
    const currentMessage = roomMessages(room).find(item => item.id === message?.id) || message;
    const currentPoll = normalizePoll(currentMessage?.poll || currentMessage?.pollData);
    if (!currentPoll || !actorId) return null;
    const nextPoll = applyPollEvent(currentPoll, event, actorId, 0, activeGroupMembers);
    const activity = pollActivityMessage(event, actorId, event.actorName || currentUser?.name || 'Thành viên', currentMessage);
    setConversations(previous => {
      const currentRoom = previous[activeChat.id] || room;
      if (!currentRoom) return previous;
      const withoutPoll = roomMessages(currentRoom).filter(item => item.id !== currentMessage.id && item.id !== activity.id);
      const nextMessages = [
        ...withoutPoll,
        activity,
        { ...currentMessage, poll: nextPoll, text: nextPoll.question, pending: false },
      ];
      const latest = nextMessages.at(-1);
      const next = {
        ...previous,
        [activeChat.id]: {
          ...currentRoom,
          messages: nextMessages,
          lastMsg: `Bình chọn: ${nextPoll.question}`,
          time: latest?.time || currentRoom.time,
          updatedAt: latest?.createdAt || currentRoom.updatedAt,
        },
      };
      conversationsRef.current = next;
      return next;
    });
    if (chatMode === 'demo') {
      updateDemoGroupMessage(activeChat.id, currentMessage.id, { poll: nextPoll });
      appendDemoGroupMessage(activeChat.id, activity);
    }
    return activity;
  };

  const publishPollEvent = async (message, event) => {
    if (!activeChat?.isGroup || !message?.poll) return;
    if (realtimeMessagingPending || !canSendInActiveGroup) {
      setChatError('Nhóm chưa sẵn sàng để cập nhật bình chọn.');
      return;
    }
    const groupSpamAttempt = registerGroupSendAttempt(activeChat, createGroupSpamActionId('poll-event'));
    if (!groupSpamAttempt.allowed) return;
    const actorId = tinodeClient.currentUserId || currentUser?.tinodeUid || viewerId;
    const normalizedEvent = {
      ...event,
      pollId: message.poll.id,
      actorId,
      actorName: currentUser?.name || 'Thành viên',
      actorAvatar: currentUser?.avatar || '',
      createdAt: new Date().toISOString(),
      clientId: `poll-event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
    if (chatMode !== 'tinode') {
      applyLocalPollEvent(message, normalizedEvent);
      return;
    }
    try {
      const topicName = await ensureTinodeConversationTopic(activeChat);
      await tinodeClient.sendPollEvent(topicName, normalizedEvent, normalizedEvent.clientId, {
        groupActionId: groupSpamAttempt.groupActionId,
      });
      applyLocalPollEvent(message, normalizedEvent);
    } catch (error) {
      if (!handleGroupSpamCooldownError(error, activeChat.id)) {
        setChatError(error?.message || 'Không thể cập nhật bình chọn.');
      }
    }
  };

  const handlePollVote = async (message, optionIds) => {
    const poll = normalizePoll(message?.poll);
    if (!activeChat.isGroup || !poll || pollIsClosed(poll) || !optionIds?.length) return;
    await publishPollEvent(message, { action: 'poll_vote', optionIds });
  };

  const handlePollAddOption = async (message, optionText) => {
    const poll = normalizePoll(message?.poll);
    if (!activeChat.isGroup || !poll || pollIsClosed(poll) || !poll.settings.allowAddOptions) return;
    const optionId = `option-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await publishPollEvent(message, {
      action: 'poll_option_added',
      optionId,
      optionText: String(optionText || '').trim().slice(0, POLL_LIMITS.maxOptionLength),
    });
  };

  const handlePollLock = async message => {
    const poll = normalizePoll(message?.poll);
    const identities = [viewerId, managementViewerId, currentUser?.id, currentUser?.uid, currentUser?.tinodeUid].filter(Boolean);
    if (!activeChat.isGroup || !poll || !pollCanViewerLock(poll, identities, activeGroupMembers)) return;
    await publishPollEvent(message, { action: 'poll_locked' });
  };

  const handlePollCreate = async event => {
    event.preventDefault();
    if (!pollComposer || !activeChat.isGroup || isCreatingPoll) return;
    if (!canCreatePollInActiveGroup) {
      closePollComposer();
      setChatError('Quản trị viên đã tắt quyền tạo bình chọn trong nhóm.');
      return;
    }
    const question = String(pollComposer.question || '').trim().slice(0, POLL_LIMITS.maxQuestionLength);
    const optionTexts = [...new Set((pollComposer.options || []).map(option => String(option || '').trim()).filter(Boolean))]
      .slice(0, POLL_LIMITS.maxOptions);
    if (question.length < 1) {
      setChatError('Hãy nhập câu hỏi cho bình chọn.');
      return;
    }
    if (optionTexts.length < 2) {
      setChatError('Bình chọn cần ít nhất 2 phương án.');
      return;
    }
    const groupSpamAttempt = registerGroupSendAttempt(activeChat, createGroupSpamActionId('poll-create'));
    if (!groupSpamAttempt.allowed) return;
    const pollComposerSnapshot = pollComposer;
    setIsCreatingPoll(true);
    setChatError('');
    const pollId = `poll-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const creatorId = tinodeClient.currentUserId || currentUser?.tinodeUid || viewerId;
    const poll = normalizePoll({
      id: pollId,
      question,
      options: optionTexts.map((text, index) => ({ id: `option-${index}-${Math.random().toString(36).slice(2, 6)}`, text })),
      creatorId,
      creatorName: currentUser?.name || 'Thành viên',
      creatorAvatar: currentUser?.avatar || '',
      settings: {
        ...pollComposer.settings,
        pinPoll: Boolean(pollComposer.settings.pinPoll && canPinActiveGroupMessages),
        expiresAt: pollExpiryForDuration(pollComposer.duration),
      },
    });
    if (!poll) {
      setIsCreatingPoll(false);
      setChatError('Bình chọn không hợp lệ.');
      return;
    }
    const roomId = currentChatId;
    const time = getTimeString();
    const createdAt = new Date().toISOString();
    const previousActivity = conversationActivitySnapshot(conversations[roomId]);
    const newMessage = {
      id: pollId,
      type: 'poll',
      sender: 'outgoing',
      senderId: creatorId,
      senderName: currentUser?.name || 'Thành viên',
      avatar: currentUser?.avatar || '',
      poll,
      text: question,
      time,
      createdAt,
      pending: chatMode === 'tinode',
    };
    closePollComposer();
    setConversations(previous => {
      const room = previous[roomId];
      if (!room) return previous;
      const next = {
        ...previous,
        [roomId]: {
          ...room,
          messages: [...roomMessages(room), newMessage],
          lastMsg: `Bình chọn: ${question}`,
          time,
          updatedAt: createdAt,
        },
      };
      conversationsRef.current = next;
      return next;
    });
    try {
      const room = conversations[roomId];
      if (chatMode === 'demo') {
        persistDemoGroupMessage(room, newMessage);
        if (poll.settings.pinPoll) saveMessageAction(newMessage, { pinned: true });
        return;
      }
      const topicName = await ensureTinodeConversationTopic(room);
      const result = await tinodeClient.sendPoll(topicName, poll, newMessage.id, {
        groupActionId: groupSpamAttempt.groupActionId,
      });
      const sequence = result?.ctrl?.params?.seq || result?.params?.seq;
      setConversations(previous => ({
        ...previous,
        [roomId]: {
          ...previous[roomId],
          messages: roomMessages(previous[roomId]).map(message => message.id === newMessage.id
            ? { ...message, pending: false, failed: false, seq: sequence || message.seq }
            : message),
        },
      }));
      if (poll.settings.pinPoll) {
        saveMessageAction(newMessage, { pinned: true });
        await tinodeClient.sendSystemEvent(topicName, {
          action: 'message_pinned',
          actorId: creatorId,
          actorName: currentUser?.name || 'Thành viên',
          messageId: newMessage.id,
          messageSeq: Number(sequence) || 0,
          messagePreview: `Bình chọn: ${question}`,
        }, { groupActionId: groupSpamAttempt.groupActionId });
      }
    } catch (error) {
      const spamBlocked = handleGroupSpamCooldownError(error, roomId);
      setConversations(previous => ({
        ...previous,
        [roomId]: spamBlocked
          ? removeMessageFromConversation(previous[roomId], newMessage, previousActivity)
          : {
            ...previous[roomId],
            messages: roomMessages(previous[roomId]).map(message => message.id === newMessage.id
              ? { ...message, pending: false, failed: true }
              : message),
          },
      }));
      if (spamBlocked && currentChatIdRef.current === roomId) setPollComposer(pollComposerSnapshot);
      if (!spamBlocked) setChatError(error?.message || 'Không thể tạo bình chọn.');
    } finally {
      setIsCreatingPoll(false);
    }
  };

  const handleSendSticker = sticker => {
    if (!allowDirectMessagingAttempt(activeChat)) return false;
    if ((!sticker?.src && !sticker?.blob) || !sticker?.id || !sticker?.packId) {
      setChatError('Sticker không hợp lệ.');
      return false;
    }
    if (activeChat?.isChatbot) {
      setChatError('Trợ lý AI hiện chỉ nhận tin nhắn văn bản.');
      return false;
    }
    if (realtimeMessagingPending) {
      setChatError('Kết nối realtime Tinode chưa sẵn sàng; dữ liệu Chatmgt vẫn đang hoạt động.');
      return false;
    }
    if (!canSendInActiveGroup) {
      setChatError('Quản trị viên đã tạm khóa quyền gửi tin nhắn trong nhóm.');
      return false;
    }
    const groupSpamAttempt = registerGroupSendAttempt(activeChat, createGroupSpamActionId('sticker'));
    if (!groupSpamAttempt.allowed) return false;
    setChatError('');
    const stickerBlob = sticker.blob && typeof sticker.blob.slice === 'function' ? sticker.blob : null;
    const optimisticStickerUrl = stickerBlob && typeof URL !== 'undefined' && URL.createObjectURL
      ? URL.createObjectURL(stickerBlob)
      : '';
    const stickerSource = optimisticStickerUrl || sticker.src;
    const stickerMime = String(sticker.mime || stickerBlob?.type || 'image/png');
    const stickerExtension = stickerMime.split('/')[1]?.split('+')[0]?.replace('jpeg', 'jpg') || 'png';
    const stickerMetadata = {
      id: String(sticker.id).slice(0, 80),
      stickerId: String(sticker.stickerId || sticker.id).slice(0, 80),
      packId: String(sticker.packId).slice(0, 80),
      label: String(sticker.label || 'Sticker').slice(0, 120),
      version: String(sticker.version || '1').slice(0, 24),
      mime: stickerMime,
      src: stickerSource,
      custom: sticker.custom === true,
    };
    const replyMeta = replyingTo ? { ...replyingTo } : null;
    const sharedReplyMeta = replyMetadataForTransport(replyMeta, directoryAccounts);
    const timeStr = getTimeString();
    const createdAt = new Date().toISOString();
    const previousActivity = conversationActivitySnapshot(conversations[currentChatId]);
    const newMsg = {
      id: `me-sticker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'sticker',
      sender: 'outgoing',
      senderId: currentUser?.id || currentUser?.uid,
      senderName: currentUser?.name,
      avatar: currentUser?.avatar,
      sticker: stickerMetadata,
      image: stickerSource,
      file: {
        name: String(sticker.fileName || `${sticker.id}.${stickerExtension}`).slice(0, 140),
        mime: stickerMime,
        ext: 'sticker',
        size: 'Sticker',
        url: stickerSource,
      },
      replyTo: replyMeta,
      time: timeStr,
      createdAt,
      pending: chatMode === 'tinode',
    };

    setConversations(previous => {
      const room = previous[currentChatId];
      if (!room) return previous;
      return {
        ...previous,
        [currentChatId]: {
          ...room,
          messages: [...roomMessages(room), newMsg],
          lastMsg: attachmentConversationPreview(newMsg),
          time: timeStr,
          updatedAt: createdAt,
        },
      };
    });

    try {
      const room = conversations[currentChatId];
      if (room?.isGroup) persistDemoGroupMessage(room, newMsg);
      else persistDemoDirectMessage(room, newMsg);
    } catch (error) {
      setChatError(error?.message || 'Không thể lưu sticker trong lịch sử nhắn tin.');
    }
    setReplyingTo(null);
    setMentionContext(null);
    setShowEmojiPicker(false);

    if (chatMode !== 'tinode') return true;
    const roomId = currentChatId;
    const room = conversations[roomId];
    ensureTinodeConversationTopic(room)
      .then(async topicName => {
        const result = await tinodeClient.sendSticker(topicName, sticker, newMsg.id, {
          replyTo: sharedReplyMeta,
          groupActionId: groupSpamAttempt.groupActionId,
        });
        const confirmedMessage = {
          ...newMsg,
          pending: false,
          failed: false,
          seq: newMsg.seq || result.ctrl?.params?.seq,
          image: result.file.url,
          sticker: {
            ...newMsg.sticker,
            src: result.file.url,
          },
          file: {
            ...newMsg.file,
            name: result.file.name || newMsg.file.name,
            url: result.file.url,
            mime: result.file.mime || newMsg.file.mime,
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
        if (optimisticStickerUrl) window.setTimeout(() => URL.revokeObjectURL(optimisticStickerUrl), 0);
      })
      .catch(error => {
        const spamBlocked = handleGroupSpamCooldownError(error, roomId);
        const blocked = handleDirectMessageBlockedError(error, roomId);
        if (optimisticStickerUrl) URL.revokeObjectURL(optimisticStickerUrl);
        setConversations(previous => {
          const currentRoom = previous[roomId];
          if (!currentRoom) return previous;
          return {
            ...previous,
            [roomId]: (blocked || spamBlocked) ? removeMessageFromConversation(currentRoom, newMsg, previousActivity) : {
              ...currentRoom,
              messages: roomMessages(currentRoom).map(message => message.id === newMsg.id
                ? { ...message, pending: false, failed: true }
                : message),
            },
          };
        });
        if (!blocked && !spamBlocked) setChatError(error?.message || 'Không thể gửi sticker.');
      });
    return true;
  };

  const startVoiceRecording = async () => {
    if (isRecordingVoice || mediaRecorderRef.current) return;
    if (!allowDirectMessagingAttempt(activeChat)) return;
    if (!allowGroupSendDuringCooldown(activeChat)) return;
    setShowEmojiPicker(false);
    if (activeChat?.isChatbot) {
      setChatError('Trợ lý AI hiện chỉ nhận tin nhắn văn bản.');
      return;
    }
    if (realtimeMessagingPending) {
      setChatError('Kết nối realtime Tinode chưa sẵn sàng; dữ liệu Chatmgt vẫn đang hoạt động.');
      return;
    }
    if (!canSendInActiveGroup) {
      setChatError('Quản trị viên đã tạm khóa quyền gửi tin nhắn trong nhóm.');
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
    const groupSpamAttempt = selection.accepted.length > 0
      ? registerGroupSendAttempt(activeChat, createGroupSpamActionId(`${source}-batch`))
      : { allowed: true, groupActionId: '' };
    if (!groupSpamAttempt.allowed) return;
    const imageBatchId = source === 'image' && selection.accepted.length > 1
      ? `image-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      : '';
    selection.accepted.forEach((file, index) => {
      void handleSendFile(file, imageBatchId
        ? {
          imageBatch: { id: imageBatchId, index, size: selection.accepted.length },
          groupActionId: groupSpamAttempt.groupActionId,
        }
        : { groupActionId: groupSpamAttempt.groupActionId });
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

  const queuePastedAttachments = files => {
    const sourceFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    if (sourceFiles.length === 0) return;
    if (!allowDirectMessagingAttempt(activeChat)) return;
    if (activeChat.isChatbot) {
      setChatError('Trợ lý AI hiện chỉ nhận tin nhắn văn bản.');
      return;
    }
    if (realtimeMessagingPending) {
      setChatError('Kết nối realtime Tinode chưa sẵn sàng; dữ liệu Chatmgt vẫn đang hoạt động.');
      return;
    }
    if (!canSendInActiveGroup) {
      setChatError('Quản trị viên đã tạm khóa quyền gửi tin nhắn trong nhóm.');
      return;
    }

    const conversationId = String(currentChatId);
    const existing = pastedAttachmentDraftsRef.current[conversationId] || [];
    const availableSlots = Math.max(0, MAX_PASTED_ATTACHMENTS - existing.length);
    const accepted = [];
    const errors = [];
    const timestamp = Date.now();

    sourceFiles.slice(0, availableSlots).forEach((sourceFile, index) => {
      const file = normalizePastedFile(sourceFile, index, timestamp);
      const validationError = chatAttachmentValidationError(file);
      if (validationError) {
        errors.push(validationError);
        return;
      }
      const isImage = isPastedImageFile(file);
      let previewUrl = '';
      if (isImage && typeof URL !== 'undefined' && URL.createObjectURL) {
        try {
          previewUrl = URL.createObjectURL(file);
        } catch {
          previewUrl = '';
        }
      }
      accepted.push({
        id: `paste-${timestamp}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        isImage,
        previewUrl,
        name: file.name || 'Tệp đính kèm',
        mime: file.type || 'application/octet-stream',
        sizeLabel: formatPasteAttachmentSize(file.size),
      });
    });

    if (sourceFiles.length > availableSlots) {
      errors.push(`Chỉ có thể giữ tối đa ${MAX_PASTED_ATTACHMENTS} ảnh hoặc tệp đang chờ.`);
    }
    if (accepted.length > 0) {
      replacePastedAttachmentDrafts({
        ...pastedAttachmentDraftsRef.current,
        [conversationId]: [...existing, ...accepted],
      });
      setMentionContext(null);
      requestAnimationFrame(() => messageInputRef.current?.focus());
    }
    setChatError(errors[0] || '');
  };

  const removePastedAttachment = attachmentId => {
    const conversationId = String(currentChatId);
    const current = pastedAttachmentDraftsRef.current;
    const attachments = current[conversationId] || [];
    const removed = attachments.find(item => item.id === attachmentId);
    if (!removed) return;
    revokePastedAttachmentPreview(removed);
    const remaining = attachments.filter(item => item.id !== attachmentId);
    const next = { ...current };
    if (remaining.length > 0) next[conversationId] = remaining;
    else delete next[conversationId];
    replacePastedAttachmentDrafts(next);
    requestAnimationFrame(() => messageInputRef.current?.focus());
  };

  const handleMessagePaste = event => {
    if (event.defaultPrevented) return;
    if (editingMessage) return;
    const target = event.target;
    const isEditableTarget = target?.matches?.('input, textarea, [contenteditable="true"]');
    if (target !== messageInputRef.current && isEditableTarget) return;
    const clipboard = event.clipboardData;
    if (!clipboard) return;

    const clipboardFiles = clipboardAttachmentFiles(clipboard);
    if (clipboardFiles.length > 0) {
      event.preventDefault();
      queuePastedAttachments(clipboardFiles);
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

  const openImageViewer = (file, message = null) => {
    if (!file?.url) return;
    setImageViewer({
      source: file.url,
      file: { ...file, name: file.name || 'vichat-image' },
      message,
    });
  };

  const handleImageShare = (file, message) => {
    if (!message) {
      setChatError('Không thể chia sẻ tin nhắn này.');
      return;
    }
    const shareableMessage = {
      ...message,
      file: file?.url ? { ...(message.file || {}), ...file } : message.file,
      image: message.image || file?.url || '',
    };
    setImageViewer(null);
    setShareMessage(shareableMessage);
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
    if (isImageAttachment(entry.attachment, entry.message?.type)) openImageViewer(entry.attachment, entry.message);
    else handleFileOpen(entry.attachment);
  };

  const updateCurrentDraft = (value) => {
    setInputText(value);
    if (editingMessage) {
      setMessageMentions(previous => {
        const currentMentions = previous[currentChatId] || [];
        const nextMentions = currentMentions.filter(mention => mentionTokenExists(value, mention.token));
        if (nextMentions.length === currentMentions.length) return previous;
        return { ...previous, [currentChatId]: nextMentions };
      });
      return;
    }
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
    if (chatMode === 'tinode' && value.trim() && !directMessagingError(room)) {
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

  const handleStickerSuggestionSelect = sticker => {
    const sent = handleSendSticker(sticker);
    if (!sent) return;
    updateCurrentDraft('');
    setMentionContext(null);
    requestAnimationFrame(() => messageInputRef.current?.focus());
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
        defaultName: mentionCanonicalText(candidate),
        username: candidate.username || '',
        token: insertion.token,
        isAll: candidate.id === ALL_MENTION_ID,
        isBot: Boolean(candidate.type === 'bot' || candidate.isChatbot || candidate.id === CHATBOT_ACCOUNT.id),
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
      handleComposerSubmit();
    }
  };

  const insertEmoji = emoji => {
    updateCurrentDraft(`${inputText}${emoji}`);
    setMentionContext(null);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => messageInputRef.current?.focus());
  };

  const messageActionKey = (roomId, messageId) => `${roomId}:${messageId}`;

  const messageIsOwnedByViewer = message => {
    if (!message || message.sender !== 'outgoing') return false;
    const senderId = String(message.senderId || '').trim();
    const authenticatedId = String(
      chatMode === 'tinode' ? tinodeClient.currentUserId : viewerId,
    ).trim();
    return Boolean(senderId && authenticatedId && senderId === authenticatedId);
  };

  const reactionDetailState = reactionDetailsMessage && chatMode !== 'tinode'
    ? messageActions[messageActionKey(activeChat.id, reactionDetailsMessage.id)] || {}
    : {};
  const reactionDetailCounts = {
    ...(reactionDetailsMessage?.reactions || {}),
    ...(reactionDetailState.reactions || {}),
  };
  const reactionDetailUsersByEmoji = {
    ...(reactionDetailsMessage?.reactionUsers || {}),
    ...(reactionDetailState.reactionUsers || {}),
  };
  const reactionDetailEmojiCounts = {
    ...reactionEmojiCounts(reactionDetailUsersByEmoji),
    ...reactionDetailCounts,
  };
  const reactionDetailSelectedEmoji = reactionDetails?.emoji || 'all';
  const reactionDetailUsers = reactionUserRecords(
    reactionDetailUsersByEmoji,
    reactionDetailSelectedEmoji,
  );

  const saveMessageAction = (message, patch) => {
    if (!message?.id || !currentChatId) return;
    const key = messageActionKey(currentChatId, message.id);
    setMessageActions(previous => {
      const next = { ...previous, [key]: { ...(previous[key] || {}), ...patch } };
      writeMessageActions(
        notificationSettingsViewerId,
        next,
        undefined,
        notificationSettingsViewerAliases,
        preferenceTenantId,
      );
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
    const gutter = 12;
    const gap = 6;
    const width = Math.min(245, Math.max(0, window.innerWidth - (gutter * 2)));
    const isOwnMessage = message.senderId === viewerId || message.sender === 'outgoing';
    const canEditMessage = messageIsOwnedByViewer(message) && canEditDeliveredMessage(message);
    const canRecallMessage = isOwnMessage && canRecallDeliveredMessage(message);
    const hasManagementAction = !activeChat.isChatbot
      && isManagementConversationId(activeChat.managementId || activeChat.id);
    const menuItemCount = 3
      + (canEditMessage ? 1 : 0)
      + (canPinActiveGroupMessages ? 1 : 0)
      + (hasManagementAction ? 1 : 0)
      + (canRecallMessage ? 2 : 0);
    const estimatedHeight = 14 + (menuItemCount * 35);
    const source = event.currentTarget;
    const anchor = source?.matches?.('.message-more-action')
      ? source
      : source?.querySelector?.('.message-more-action');
    const anchorRect = anchor?.getBoundingClientRect?.();
    const isOutgoing = source?.closest?.('.message-item.outgoing');
    const fallbackX = Number.isFinite(event.clientX) ? event.clientX : gutter;
    const fallbackY = Number.isFinite(event.clientY) ? event.clientY : gutter;
    const preferredLeft = anchorRect
      ? (isOutgoing ? anchorRect.right - width : anchorRect.left)
      : fallbackX;
    const left = Math.max(gutter, Math.min(preferredLeft, window.innerWidth - width - gutter));
    const belowTop = anchorRect ? anchorRect.bottom + gap : fallbackY + gap;
    const top = belowTop + estimatedHeight <= window.innerHeight - gutter
      ? belowTop
      : Math.max(gutter, (anchorRect ? anchorRect.top : fallbackY) - estimatedHeight - gap);
    setMessageMenu({
      message,
      left,
      top,
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

  const prepareReplyToMessage = message => {
    if (!message || message.recalled) return '';
    const isOwnMessage = message.senderId === viewerId || message.sender === 'outgoing';
    const reply = replyMetadataForMessage(message, isOwnMessage ? 'Bạn' : 'Thành viên');
    setReplyingTo(reply);

    let nextDraft = inputText;
    if (!isOwnMessage) {
      const candidate = mentionCandidateForMessage(message);
      const token = mentionTokenFor(candidate);
      if (candidate && token) {
        if (!mentionTokenExists(nextDraft, token)) {
          nextDraft = nextDraft.trim()
            ? `${token} ${nextDraft.trim()}`
            : `${token} `;
          updateCurrentDraft(nextDraft);
        }
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
                defaultName: mentionCanonicalText(candidate),
                username: candidate.username || '',
                token,
                isAll: false,
                isBot: Boolean(candidate.type === 'bot' || candidate.isChatbot || candidate.id === CHATBOT_ACCOUNT.id),
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
    return nextDraft;
  };

  const applyMessagePatch = (message, patch) => {
    updateMessageInView(message, patch);
    persistMessagePatch(message, patch);
  };

  const cancelMessageEdit = useCallback(() => {
    const snapshot = editingMessage;
    if (!snapshot) return;
    setEditingMessage(null);
    setIsSavingMessageEdit(false);
    setMentionContext(null);
    setMentionActiveIndex(0);
    if (String(currentChatId) !== String(snapshot.conversationId)) return;
    const restoredDraft = snapshot.previousDraft || '';
    setInputText(restoredDraft);
    setDrafts(previous => {
      const next = { ...previous };
      if (restoredDraft) next[snapshot.conversationId] = restoredDraft;
      else delete next[snapshot.conversationId];
      return next;
    });
    setMessageMentions(previous => {
      const next = { ...previous };
      if (snapshot.previousMentions?.length) next[snapshot.conversationId] = snapshot.previousMentions;
      else delete next[snapshot.conversationId];
      return next;
    });
  }, [currentChatId, editingMessage]);

  const beginMessageEdit = message => {
    if (!message || message.recalled) return;
    if (!messageIsOwnedByViewer(message) || !canEditDeliveredMessage(message)) {
      setChatError('Chỉ người gửi mới có thể sửa tin nhắn văn bản đã gửi thành công.');
      return;
    }
    if (activePastedAttachments.length > 0) {
      setChatError('Hãy gửi hoặc xóa tệp đang chờ trước khi sửa tin nhắn.');
      return;
    }
    const currentMentions = messageMentions[currentChatId] || [];
    const messageMentionsForEdit = (message.mentions || [])
      .filter(mention => mention?.token && mentionTokenExists(message.text, mention.token));
    setEditingMessage({
      message,
      conversationId: currentChatId,
      previousDraft: inputText,
      previousMentions: currentMentions,
    });
    setReplyingTo(null);
    setInputText(message.text || '');
    setDrafts(previous => {
      const next = { ...previous };
      delete next[currentChatId];
      return next;
    });
    setMessageMentions(previous => ({ ...previous, [currentChatId]: messageMentionsForEdit }));
    setMentionContext(null);
    setMentionActiveIndex(0);
    requestAnimationFrame(() => {
      const input = messageInputRef.current;
      input?.focus();
      input?.setSelectionRange?.(message.text?.length || 0, message.text?.length || 0);
    });
  };

  const handleEditMessage = async () => {
    const snapshot = editingMessage;
    if (!snapshot || isSavingMessageEdit) return;
    const roomId = snapshot.conversationId;
    const room = conversations[roomId];
    const snapshotTarget = snapshot.message;
    const target = roomMessages(room).find(message => (
      message.id === snapshotTarget.id
      || (Number(snapshotTarget.seq) > 0 && Number(message.seq) === Number(snapshotTarget.seq))
    )) || snapshotTarget;
    const text = String(inputText || '').trim();
    if (!room || !canEditDeliveredMessage(target) || !messageIsOwnedByViewer(target)) {
      setChatError('Tin nhắn này không còn đủ điều kiện để sửa.');
      return;
    }
    if (!text) {
      setChatError('Nội dung sửa không được để trống.');
      return;
    }
    const mentions = (messageMentions[roomId] || [])
      .filter(mention => mention?.token && mentionTokenExists(text, mention.token))
      .map(serializeMentionForTransport)
      .filter(Boolean);
    const sameMentions = JSON.stringify(mentions) === JSON.stringify(target.mentions || []);
    if (text === String(target.text || '').trim() && sameMentions) {
      cancelMessageEdit();
      return;
    }
    if (!allowDirectMessagingAttempt(room)) return;
    if (realtimeMessagingPending || !canSendInActiveGroup) {
      setChatError(realtimeMessagingPending
        ? 'Kết nối realtime Tinode chưa sẵn sàng.'
        : 'Quản trị viên đã tạm khóa quyền gửi tin nhắn trong nhóm.');
      return;
    }
    const groupSpamAttempt = registerGroupSendAttempt(room, createGroupSpamActionId('edit'));
    if (!groupSpamAttempt.allowed) return;
    setIsSavingMessageEdit(true);
    setChatError('');
    const editedAt = new Date().toISOString();
    const editHistoryEntry = {
      text: String(target.text || ''),
      mentions: Array.isArray(target.mentions) ? target.mentions : [],
      editedAt,
    };
    const patch = {
      text,
      mentions,
      edited: true,
      editedAt,
      editHistory: [...(Array.isArray(target.editHistory) ? target.editHistory : []), editHistoryEntry],
    };
    try {
      if (chatMode === 'tinode') {
        const topicName = await ensureTinodeConversationTopic(room);
        const event = await tinodeClient.editMessage(topicName, target, text, mentions, {
          groupActionId: groupSpamAttempt.groupActionId,
        });
        patch.editedAt = event?.createdAt || editedAt;
        patch.editHistory = [
          ...(Array.isArray(target.editHistory) ? target.editHistory : []),
          {
            ...editHistoryEntry,
            ...(event?.eventId ? { eventId: event.eventId } : {}),
            ...(Number(event?.seq) > 0 ? { seq: Number(event.seq) } : {}),
            editedAt: patch.editedAt,
          },
        ];
      } else if (chatMode !== 'demo') {
        throw new Error('Sửa tin nhắn cần kết nối realtime Tinode.');
      } else if (room.isGroup) {
        updateDemoGroupMessage(room.id, target.id, patch);
      } else {
        updateDemoDirectMessage(room.id, target.id, patch);
      }
      setConversations(previous => {
        const currentRoom = previous[roomId];
        if (!currentRoom) return previous;
        const currentMessages = roomMessages(currentRoom);
        const nextMessages = currentMessages.map(message => (
          message.id === target.id ? { ...message, ...patch } : message
        ));
        const latest = nextMessages.at(-1);
        const isLatest = latest?.id === target.id;
        const next = {
          ...previous,
          [roomId]: {
            ...currentRoom,
            messages: nextMessages,
            ...(isLatest ? {
              lastMsg: patch.text,
              time: formatMessageTime(patch.editedAt, currentRoom.time, appCopy.locale),
            } : {}),
            updatedAt: patch.editedAt || currentRoom.updatedAt,
          },
        };
        conversationsRef.current = next;
        return next;
      });
      cancelMessageEdit();
    } catch (error) {
      const spamBlocked = handleGroupSpamCooldownError(error, roomId);
      const blocked = handleDirectMessageBlockedError(error, roomId);
      if (!spamBlocked && !blocked) setChatError(error?.message || 'Không thể sửa tin nhắn.');
    } finally {
      setIsSavingMessageEdit(false);
    }
  };

  useEffect(() => {
    if (!editingMessage || String(editingMessage.conversationId) === String(currentChatId)) return;
    setEditingMessage(null);
    setIsSavingMessageEdit(false);
    setMentionContext(null);
    setInputText(drafts[currentChatId] || '');
  }, [currentChatId, drafts, editingMessage]);

  const openMessageReceiptDetails = useCallback(message => {
    if (!message) return;
    setMessageDetails({
      ...message,
      receiptDetails: true,
      receiptUsers: normalizeReceiptUsers(message.receiptUsers),
    });
  }, []);

  const handleMessageAction = async (action, message, emoji = '👍') => {
    setMessageMenu(null);
    setMessageReactionPickerKey(null);
    if (!message || message.recalled) return;
    if (
      ['reaction', 'edit', 'recall', 'recall-self', 'recall-all'].includes(action)
      && !allowDirectMessagingAttempt(activeChat)
    ) return;
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
      if (action === 'edit') {
        beginMessageEdit(message);
        return;
      }
      if (action === 'reply') {
        prepareReplyToMessage(message);
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
      if (action === 'pin') {
        if (!canPinActiveGroupMessages) {
          setChatError('Quản trị viên đã tắt quyền ghim tin nhắn trong nhóm.');
          return;
        }
        const groupSpamAttempt = registerGroupSendAttempt(activeChat, createGroupSpamActionId('pin'));
        if (!groupSpamAttempt.allowed) return;
        const key = messageActionKey(activeChat.id, message.id);
        const nextPinned = !messageActions[key]?.pinned;
        const pinEvent = {
          action: nextPinned ? 'message_pinned' : 'message_unpinned',
          actorId: tinodeClient.currentUserId || viewerId,
          actorName: currentUser?.name || 'Một thành viên',
          messageId: String(message.id || '').slice(0, 200),
          messageSeq: Number(message.seq) || 0,
          messagePreview: String(message.text || message.file?.name || (message.type === 'sticker' ? 'Sticker' : 'Nội dung đính kèm'))
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120),
        };
        if (activeChat.isGroup && chatMode === 'tinode') {
          const topicName = await ensureTinodeConversationTopic(activeChat);
          await tinodeClient.sendSystemEvent(topicName, pinEvent, {
            groupActionId: groupSpamAttempt.groupActionId,
          });
        } else if (activeChat.isGroup && chatMode === 'demo') {
          const systemMessage = {
            id: `system-pin-${Date.now()}`,
            type: 'system',
            ...pinEvent,
            senderId: pinEvent.actorId,
            senderName: pinEvent.actorName,
            text: personalizeGroupSystemText({ ...pinEvent, type: 'system' }, directoryAccounts, viewerId),
            time: getTimeString(),
            createdAt: new Date().toISOString(),
          };
          const group = appendDemoGroupMessage(activeChat.id, systemMessage);
          updateActiveGroupRoom(demoGroupToConversation(group, directoryAccounts, viewerId));
        }
        saveMessageAction(message, { pinned: nextPinned });
        return;
      }
      if (action === 'reaction') {
        const groupSpamAttempt = registerGroupSendAttempt(activeChat, createGroupSpamActionId('reaction'));
        if (!groupSpamAttempt.allowed) return;
        const key = messageActionKey(activeChat.id, message.id);
        const current = chatMode === 'tinode' ? {} : (messageActions[key]?.reactions || {});
        const reactionActorId = tinodeClient.currentUserId || viewerId;
        const reactionUsersByEmoji = {
          ...(message.reactionUsers || {}),
          ...(chatMode === 'tinode' ? {} : (messageActions[key]?.reactionUsers || {})),
        };
        const currentReactionUsers = Array.isArray(reactionUsersByEmoji[emoji])
          ? reactionUsersByEmoji[emoji]
          : [];
        const viewerAlreadyReacted = currentReactionUsers.some(user => identitiesOverlap(user, { id: reactionActorId })
          || identitiesOverlap(user, currentUser));
        const hasLocalReactionState = Object.prototype.hasOwnProperty.call(current, emoji);
        const active = hasLocalReactionState ? !current[emoji] : !viewerAlreadyReacted;
        const serverCount = Math.max(0, Number(message.reactions?.[emoji]) || 0);
        const nextReactions = {
          ...current,
          [emoji]: active ? Math.max(serverCount + 1, 1) : Math.max(serverCount - 1, 0),
        };
        const nextReactionUsers = { ...reactionUsersByEmoji };
        const remainingUsers = currentReactionUsers.filter(user => !identitiesOverlap(user, { id: reactionActorId })
          && !identitiesOverlap(user, currentUser));
        if (active && reactionActorId) {
          nextReactionUsers[emoji] = [
            ...remainingUsers,
            {
              id: reactionActorId,
              name: currentUser?.name || 'Bạn',
              avatar: currentUser?.avatar || '',
            },
          ];
        } else if (remainingUsers.length > 0) {
          nextReactionUsers[emoji] = remainingUsers;
        } else {
          delete nextReactionUsers[emoji];
        }
        if (chatMode === 'tinode') {
          const topicName = await ensureTinodeConversationTopic(activeChat);
          await tinodeClient.sendReaction(topicName, message.id, emoji, active, {
            groupActionId: groupSpamAttempt.groupActionId,
          });
        }
        saveMessageAction(message, { reactions: nextReactions, reactionUsers: nextReactionUsers });
        applyMessagePatch(message, { reactions: nextReactions, reactionUsers: nextReactionUsers });
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
        const groupSpamAttempt = registerGroupSendAttempt(activeChat, createGroupSpamActionId('recall'));
        if (!groupSpamAttempt.allowed) return;
        if (chatMode === 'tinode') {
          const topicName = await ensureTinodeConversationTopic(activeChat);
          const mode = action === 'recall-self' ? 'self' : 'all';
          await tinodeClient.recallMessage(topicName, message, mode, {
            groupActionId: groupSpamAttempt.groupActionId,
          });
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
      const spamBlocked = handleGroupSpamCooldownError(error, activeChat.id);
      if (!spamBlocked && !handleDirectMessageBlockedError(error, activeChat.id)) {
        setChatError(error?.message || 'Không thể thực hiện thao tác với tin nhắn.');
      }
    }
  };

  const shareMessageTo = async target => {
    if (!shareMessage || !target || target.id === activeChat.id) return;
    if (!allowDirectMessagingAttempt(target)) return;
    if (usesManagementData && chatMode !== 'tinode') {
      setShareMessage(null);
      setChatError('Chia sẻ tin nhắn cần kết nối realtime Tinode.');
      return;
    }
    const groupSpamAttempt = registerGroupSendAttempt(target, createGroupSpamActionId('forward'));
    if (!groupSpamAttempt.allowed) return;
    const sourceSender = findAccountByIdentities(directoryAccounts, [
      shareMessage.senderId,
      shareMessage.raw?.from,
      shareMessage.raw?.head?.['x-sender-id'],
      shareMessage.senderName,
    ]);
    const sourceSenderName = sourceSender
      ? mentionCanonicalText(sourceSender)
      : String(shareMessage.senderId || '').trim() || (shareMessage.sender === 'outgoing' ? 'Bạn' : 'Thành viên');
    const text = `↪ ${sourceSenderName}: ${shareMessage.text || shareMessage.file?.name || 'Tệp đính kèm'}`;
    const shared = {
      id: `shared-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'text', sender: 'outgoing', senderId: viewerId, senderName: currentUser?.name,
      avatar: currentUser?.avatar, text, sharedFrom: shareMessage.id,
      time: getTimeString(), createdAt: new Date().toISOString(),
    };
    const sourceAttachment = !isStickerMessage(shareMessage) ? attachmentForMessage(shareMessage) : null;
    let forwarded = shared;

    try {
      if (chatMode === 'tinode') {
        const topicName = await ensureTinodeConversationTopic(target);
        if (sourceAttachment?.url) {
          const sourceFile = await tinodeClient.fetchFile(sourceAttachment);
          const result = await tinodeClient.sendFile(topicName, sourceFile, shared.id, {
            sharedFrom: shareMessage.id,
            groupActionId: groupSpamAttempt.groupActionId,
          });
          void ingestChatDocument({
            file: sourceFile,
            conversationId: target.managementId || target.id,
            tinodeTopic: topicName,
            sequence: result.ctrl?.params?.seq,
          }).catch(error => {
            console.warn('ViChat: forwarded document indexing failed', error);
          });
          const forwardedAttachment = {
            ...sourceAttachment,
            ...result.file,
            name: sourceAttachment.name || result.file?.name || sourceFile.name,
            mime: result.file?.mime || sourceAttachment.mime || sourceFile.type,
            size: result.file?.size || sourceAttachment.size || sourceFile.size,
          };
          const forwardedIsImage = isImageAttachment(forwardedAttachment, result.file?.mime?.startsWith('image/') ? 'image' : '');
          forwarded = {
            ...shared,
            type: forwardedIsImage ? 'image' : 'file',
            text: '',
            file: forwardedAttachment,
            image: forwardedIsImage ? forwardedAttachment.url : undefined,
          };
        } else {
          await tinodeClient.sendText(topicName, text, shared.id, {
            sharedFrom: shareMessage.id,
            groupActionId: groupSpamAttempt.groupActionId,
          });
        }
      } else {
        forwarded = sourceAttachment
          ? {
            ...shared,
            type: isImageAttachment(sourceAttachment) ? 'image' : 'file',
            text: '',
            file: sourceAttachment,
            image: isImageAttachment(sourceAttachment) ? sourceAttachment.url : undefined,
          }
          : shared;
        if (target.isGroup) persistDemoGroupMessage(target, forwarded);
        else persistDemoDirectMessage(target, forwarded);
      }
      setConversations(previous => ({
        ...previous,
        [target.id]: {
          ...previous[target.id],
          messages: [...roomMessages(previous[target.id]), forwarded],
          lastMsg: forwarded.type === 'text' ? `Bạn: ${text}` : attachmentConversationPreview(forwarded),
          time: forwarded.time,
          updatedAt: forwarded.createdAt,
        },
      }));
      setShareMessage(null);
    } catch (error) {
      const spamBlocked = handleGroupSpamCooldownError(error, target.id);
      if (!spamBlocked && !handleDirectMessageBlockedError(error, target.id)) {
        setChatError(error?.message || 'Không thể chia sẻ tin nhắn.');
      }
    }
  };

  // --- Send Message Action ---
  const handleSendMessage = async (textToSend = null) => {
    const text = (textToSend !== null ? textToSend : inputText).trim();
    if (!text || (activeChat.isChatbot && (isTyping || chatbotRequestRef.current))) return;
    if (activeChat.isChatbot && text.length > 4000) {
      setChatError('Câu hỏi cho ViChat AI không được vượt quá 4000 ký tự.');
      return;
    }
    if (!allowDirectMessagingAttempt(activeChat)) return;
    if (!canSendInActiveGroup) {
      setChatError('Quản trị viên đã tạm khóa quyền gửi tin nhắn trong nhóm.');
      return;
    }
    if (realtimeMessagingPending) {
      setChatError('Danh bạ và cuộc trò chuyện đã được lưu ở Chatmgt, nhưng realtime Tinode chưa kết nối.');
      return;
    }
    const groupSpamAttempt = registerGroupSendAttempt(activeChat, createGroupSpamActionId('text'));
    if (!groupSpamAttempt.allowed) return;

    const timeStr = getTimeString();
    const createdAt = new Date().toISOString();
    const replyMeta = replyingTo ? { ...replyingTo } : null;
    const sharedReplyMeta = replyMetadataForTransport(replyMeta, directoryAccounts);
    const mentions = (messageMentions[currentChatId] || [])
      .filter(mention => mentionTokenExists(text, mention.token))
      .map(serializeMentionForTransport)
      .filter(Boolean);
    const previousActivity = conversationActivitySnapshot(conversations[currentChatId]);
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
      pending: chatMode === 'tinode' && (!activeChat.isChatbot || Boolean(activeChat.tinodeTopic)),
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
          { ...(sharedReplyMeta ? { replyTo: sharedReplyMeta } : {}), mentions },
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
      const chatbotRequest = { controller: new AbortController(), session: accountSessionRef.current };
      chatbotRequestRef.current = chatbotRequest;
      setIsTyping(true);
      try {
        const response = await requestChatbotReply({
          message: text,
          messageId: newMsg.id,
          conversationId: room.id,
          user: currentUser,
          signal: chatbotRequest.controller.signal,
          history: roomMessages(room)
            .filter(item => item.type === 'text' && item.text && !item.failed && !item.fallback)
            .slice(-10)
            .map(item => ({
              role: item.sender === 'outgoing' ? 'user' : 'assistant',
              content: item.text,
            })),
        });
        if (chatbotRequestRef.current !== chatbotRequest || accountSessionRef.current !== chatbotRequest.session) return;
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
          fallback: Boolean(response.fallback),
        };
        saveChatbotMessage(currentUser?.id || currentUser?.uid, botMessage);
        setConversations(prev => {
          if (accountSessionRef.current !== chatbotRequest.session) return prev;
          const chatbotRoom = prev[room.id];
          if (!chatbotRoom) return prev;
          return {
            ...prev,
            [room.id]: {
              ...chatbotRoom,
              messages: [...roomMessages(chatbotRoom), botMessage],
              lastMsg: `${CHATBOT_ACCOUNT.name}: ${botMessage.text}`,
              time: botMessage.time,
              updatedAt: replyCreatedAt,
              badge: currentChatIdRef.current === room.id ? 0 : (chatbotRoom.badge || 0) + 1,
            },
          };
        });
      } catch (err) {
        if (chatbotRequestRef.current === chatbotRequest && accountSessionRef.current === chatbotRequest.session) {
          setChatError(err?.message || 'Trợ lý AI chưa thể phản hồi. Vui lòng thử lại.');
        }
      } finally {
        if (chatbotRequestRef.current === chatbotRequest) {
          chatbotRequestRef.current = null;
          setIsTyping(false);
        }
      }
      return;
    }

    if (!chatbotRequestRef.current) setIsTyping(false);

    if (chatMode === 'tinode') {
      const roomId = currentChatId;
      ensureTinodeConversationTopic(conversations[currentChatId])
        .then(async topicName => {
          const chatbotMentioned = mentions.some(mention => mention.isBot)
            || mentionTokenExists(text, '@ViChatAI');
          if (conversations[currentChatId]?.isGroup && chatbotMentioned) {
            try {
              await chatManagementService.enableTinodeChatbot(conversations[currentChatId].managementId || roomId);
            } catch (chatbotError) {
              // Keep the employee message flowing if bot provisioning is down.
              setChatError(chatbotError?.message || 'ViChat AI chua san sang trong nhom.');
            }
          }
          const result = await tinodeClient.sendText(topicName, text, newMsg.id, {
            ...(sharedReplyMeta ? { replyTo: sharedReplyMeta } : {}),
            mentions,
            groupActionId: groupSpamAttempt.groupActionId,
          });
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
          const spamBlocked = handleGroupSpamCooldownError(err, roomId);
          const blocked = handleDirectMessageBlockedError(err, roomId);
          setConversations(previous => {
            const currentRoom = previous[roomId];
            if (!currentRoom) return previous;
            return {
              ...previous,
              [roomId]: (blocked || spamBlocked) ? removeMessageFromConversation(currentRoom, newMsg, previousActivity) : {
                ...currentRoom,
                messages: roomMessages(currentRoom).map(message => message.id === newMsg.id
                  ? { ...message, pending: false, failed: true }
                  : message),
              },
            };
          });
          if ((blocked || spamBlocked) && textToSend === null) updateCurrentDraft(text);
          if (!blocked && !spamBlocked) setChatError(err?.message || 'Không thể gửi tin nhắn.');
        });
    }
  };

  const handleComposerSubmit = () => {
    if (pastedAttachmentSubmitRef.current) return;
    if (editingMessage) {
      void handleEditMessage();
      return;
    }
    const attachments = pastedAttachmentDraftsRef.current[currentChatId] || [];
    if (attachments.length === 0) {
      void handleSendMessage();
      return;
    }
    if (!allowDirectMessagingAttempt(activeChat)) return;
    if (activeChat.isChatbot) {
      setChatError('Trợ lý AI hiện chỉ nhận tin nhắn văn bản.');
      return;
    }
    if (realtimeMessagingPending) {
      setChatError('Kết nối realtime Tinode chưa sẵn sàng; dữ liệu Chatmgt vẫn đang hoạt động.');
      return;
    }
    if (!canSendInActiveGroup) {
      setChatError('Quản trị viên đã tạm khóa quyền gửi tin nhắn trong nhóm.');
      return;
    }

    const conversationId = currentChatId;
    const replyMeta = replyingTo ? { ...replyingTo } : null;
    const captionMentions = messageMentions[conversationId] || [];
    const groupSpamAttempt = registerGroupSendAttempt(activeChat, createGroupSpamActionId('paste-batch'));
    if (!groupSpamAttempt.allowed) return;
    const batchId = `paste-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sendPlan = pasteAttachmentSendPlan(attachments, inputText, batchId);
    pastedAttachmentSubmitRef.current = true;
    sendPlan.forEach((item, index) => {
      void handleSendFile(item.attachment.file, {
        imageBatch: item.imageBatch,
        caption: item.caption,
        mentions: index === 0 ? captionMentions : [],
        replyMeta: index === 0 ? replyMeta : null,
        groupActionId: groupSpamAttempt.groupActionId,
      });
    });

    clearPastedAttachments(conversationId);
    setInputText('');
    setReplyingTo(null);
    setDrafts(previous => {
      const next = { ...previous };
      delete next[conversationId];
      return next;
    });
    setMessageMentions(previous => {
      const next = { ...previous };
      delete next[conversationId];
      return next;
    });
    setMentionContext(null);
    requestAnimationFrame(() => {
      pastedAttachmentSubmitRef.current = false;
      messageInputRef.current?.focus();
    });
  };

  const displayMentionToken = (mention, fallbackToken = '') => {
    const account = findAccountByIdentities(directoryAccounts, [
      mention?.id,
      mention?.tinodeUid,
      mention?.uid,
    ]) || findAccountByIdentities(roomMembers(activeChat), [
      mention?.id,
      mention?.tinodeUid,
      mention?.uid,
    ]);
    return mentionDisplayTokenFor({
      ...(mention || {}),
      ...(account || {}),
      token: fallbackToken || mention?.token || '',
    });
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
    return (mentionPattern ? String(text).split(mentionPattern) : [String(text)]).map((part, index) => {
      if (!mentionTokens.includes(part)) {
        return <React.Fragment key={`composer-text-${index}`}>{part}</React.Fragment>;
      }
      const mention = (mentions || []).find(candidate => String(candidate?.token || '') === part);
      return <span key={`composer-mention-${index}`} className="message-mention">{displayMentionToken(mention, part)}</span>;
    });
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

    const renderMentionText = (value, keyPrefix) => {
      const mentionParts = mentionPattern ? String(value).split(mentionPattern) : [String(value)];
      return mentionParts.flatMap((part, index) => {
        if (!mentionTokens.includes(part)) {
          return String(part).split('\n').map((line, lineIndex, lines) => (
            <React.Fragment key={`${keyPrefix}-line-${index}-${lineIndex}`}>
              {line}
              {lineIndex < lines.length - 1 && <br />}
            </React.Fragment>
          ));
        }
        const mention = (mentions || []).find(candidate => String(candidate?.token || '') === part);
        if (mention?.isAll) return [<span key={`${keyPrefix}-mention-${index}`} className="message-mention">{part}</span>];
        const displayToken = displayMentionToken(mention, part);
        return [
          <button
            type="button"
            key={`${keyPrefix}-mention-${index}`}
            className="message-mention"
            onClick={() => openProfileFor(mention)}
            title={`${appCopy.t('Xem thông tin')} ${displayToken || mention?.name || part}`}
          >
            {displayToken || part}
          </button>,
        ];
      });
    };

    const renderInlineText = (value, keyPrefix) => splitMessageLinks(value).flatMap((part, partIndex) => {
      if (part.type === 'link') {
        return [
          <a
            key={`${keyPrefix}-link-${partIndex}`}
            className="message-link"
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={event => event.stopPropagation()}
          >
            {part.value}
          </a>,
        ];
      }
      return renderMentionText(part.value, `${keyPrefix}-text-${partIndex}`);
    });

    const renderPlainText = (value, keyPrefix) => String(value).split(/(\*\*.*?\*\*)/g).flatMap((part, index) => {
      if (!part) return [];
      if (part.startsWith('**') && part.endsWith('**')) {
        return [<strong key={`${keyPrefix}-bold-${index}`}>{renderInlineText(part.slice(2, -2), `${keyPrefix}-bold-${index}`)}</strong>];
      }
      return renderInlineText(part, `${keyPrefix}-plain-${index}`);
    });

    return renderPlainText(String(text), 'text');
  };

  // Filter conversations
  const normalizedConversationSearch = String(searchQuery || '').trim().toLocaleLowerCase('vi');
  const filteredChatIds = Object.keys(renderConversations)
    .filter(id => !isSelfDirectConversation(renderConversations[id], currentUser, directoryAccounts))
    .filter(id => !isConversationHiddenAfterDelete(renderConversations[id]))
    .filter(id => shouldShowConversation(renderConversations[id], drafts[id]))
    .filter(id => String(conversationDisplayName(renderConversations[id], '') || '').toLocaleLowerCase('vi').includes(normalizedConversationSearch))
    .sort((firstId, secondId) => {
      const firstPinned = normalizeConversationFlag(renderConversations[firstId].pinned);
      const secondPinned = normalizeConversationFlag(renderConversations[secondId].pinned);
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
    ...roomParticipantIds(activeChat).map(identity => String(identity)),
    ...(activeChat.isGroup ? (activeChat.pendingParticipantIds || []).map(identity => String(identity)) : []),
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
              : `${appCopy.t('Bắt buộc chọn ít nhất 1 thành viên khác.')} ${appCopy.t('Chọn trực tiếp từ')} ${companyContacts.length} ${appCopy.t('người trong danh bạ công ty.')}`}
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
                  <span className={`picker-status account-presence ${accountPresenceTone(member)}`}>{accountPresenceLabel(member)}{directoryUsernameMeta(member)}</span>
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
          <button type="submit" className="btn-primary" disabled={!groupName.trim() || groupMemberIds.length === 0 || isCreatingGroup}>{isCreatingGroup ? appCopy.t('Đang tạo...') : appCopy.t('Tạo nhóm')}</button>
        </div>
      </div>
    </form>
  );

  const sharedFiles = Object.values(renderConversations)
    .filter(room => canAccessRoomFiles(room, currentUser, directoryAccounts, chatMode))
    .flatMap(room => roomMessages(room)
    .filter(message => !isStickerMessage(message) && (message.type === 'file' || message.type === 'image'))
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
  visibleMessagesRef.current = visibleMessages;
  const activeUnreadBoundary = unreadBoundaries[activeChat.id] || null;
  const unreadBoundaryStart = activeUnreadBoundary && !messageSearchQuery.trim()
    ? unreadBoundaryStartIndex(visibleMessages, activeUnreadBoundary)
    : -1;
  const visibleMessageEntries = messageSearchQuery.trim()
    ? visibleMessages.map((message, index) => ({ kind: 'message', key: message.id || `message:${index}`, message, index }))
    : groupImageMessageEntries(visibleMessages, unreadBoundaryStart);
  const localHistorySearchResults = messageSearchHasFilters
    ? roomMessages(activeChat)
      .filter(message => !messageActions[messageActionKey(activeChat.id, message.id)]?.hidden)
      .filter(message => messageSearchMatchesLocal(message, {
        query: messageSearchQuery,
        senderId: messageSearchSender,
        type: messageSearchType,
        fromDate: messageSearchFromDate,
        toDate: messageSearchToDate,
      }))
      .sort((first, second) => (Number(second?.seq) || 0) - (Number(first?.seq) || 0) || messageTimestamp(second) - messageTimestamp(first))
      .slice(0, 100)
    : [];
  const displayedHistorySearchResults = canSearchConversationHistory
    ? messageSearchResults
    : (!usesManagementData || chatMode !== 'tinode' ? localHistorySearchResults : []);
  const historySearchTypeLabel = type => {
    const option = HISTORY_SEARCH_TYPE_OPTIONS.find(candidate => candidate.id === type);
    return option ? appCopy.t(option.label) : (type === 'sticker' ? appCopy.t('Sticker') : appCopy.t('Tệp'));
  };
  const pinnedMessages = pinnedMessagesForRoom(roomMessages(activeChat), messageActions, activeChat.id);
  const groupBoardPolls = activeChat.isGroup
    ? roomMessages(activeChat)
      .filter(message => isPollMessage(message))
      .filter(message => !messageActions[messageActionKey(activeChat.id, message.id)]?.hidden)
      .map(message => ({
        ...message,
        poll: normalizePoll(message.poll || message.pollData),
      }))
      .filter(message => message.poll)
      .sort((first, second) => {
        const firstTime = Date.parse(first.poll.lastActivityAt || '') || messageTimestamp(first);
        const secondTime = Date.parse(second.poll.lastActivityAt || '') || messageTimestamp(second);
        return secondTime - firstTime || (Number(second.seq) || 0) - (Number(first.seq) || 0);
      })
    : [];
  const pinnedMessagePreview = message => String(message?.text || '').trim()
    || (isStickerMessage(message) ? appCopy.t('Sticker') : '')
    || message?.file?.name
    || (message?.type === 'image' ? appCopy.t('Ảnh') : appCopy.t('Nội dung đính kèm'));
  const scrollToMessageById = messageId => {
    if (messageId === undefined || messageId === null || !String(messageId)) return;
    const key = messageActionKey(activeChat.id, messageId);
    const scroll = () => {
      const target = messageElementsRef.current.get(key);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageKey(key);
      if (messageHighlightTimerRef.current) window.clearTimeout(messageHighlightTimerRef.current);
      messageHighlightTimerRef.current = window.setTimeout(() => {
        setHighlightedMessageKey(current => current === key ? null : current);
        messageHighlightTimerRef.current = null;
      }, 1800);
    };
    if (messageSearchQuery.trim()) {
      setMessageSearchQuery('');
      window.requestAnimationFrame(() => window.requestAnimationFrame(scroll));
    } else {
      window.requestAnimationFrame(scroll);
    }
  };
  const openMessageSearchResult = async result => {
    if (!result) return;
    const roomId = activeChat.id;
    const sequence = Number(result.seq) || 0;
    let targetId = result.id;
    if (chatMode === 'tinode' && activeChat.tinodeTopic && sequence > 0) {
      try {
        const loadedConversation = await tinodeClient.loadConversationMessages(activeChat.tinodeTopic, [sequence]);
        const loadedMessage = roomMessages(loadedConversation).find(message => Number(message?.seq) === sequence);
        targetId = loadedMessage?.id || targetId;
        if (loadedConversation) {
          setConversations(previous => {
            const currentRoom = previous[roomId] || activeChat;
            const incoming = {
              ...loadedConversation,
              id: roomId,
              managementId: currentRoom.managementId || activeSearchConversationId,
              tinodeTopic: activeChat.tinodeTopic,
              accountSession: currentRoom.accountSession,
            };
            const next = { ...previous, [roomId]: safeMergeTinodeConversation(currentRoom, incoming, { viewerId }) };
            conversationsRef.current = next;
            return next;
          });
        }
      } catch (error) {
        setChatError(error?.message || 'Không thể mở tin nhắn trong lịch sử.');
        return;
      }
    }
    closeWorkspacePanel();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => scrollToMessageById(targetId)));
  };
  const scrollToPinnedMessage = message => scrollToMessageById(message?.id);
  const openPinnedMessageMenu = event => {
    event.stopPropagation();
    const message = pinnedMessages[0];
    if (!message || typeof window === 'undefined') return;
    const gutter = 12;
    const gap = 6;
    const width = Math.min(245, Math.max(0, window.innerWidth - (gutter * 2)));
    const menuItemCount = activeChat.isGroup ? 3 : 2;
    const estimatedHeight = 14 + (menuItemCount * 35);
    const rect = event.currentTarget.getBoundingClientRect();
    const left = Math.max(gutter, Math.min(rect.right - width, window.innerWidth - width - gutter));
    const belowTop = rect.bottom + gap;
    const top = belowTop + estimatedHeight <= window.innerHeight - gutter
      ? belowTop
      : Math.max(gutter, rect.top - estimatedHeight - gap);
    setMessageMenu(null);
    setPinnedMessageMenu({ message, left, top });
  };
  const handlePinnedMessageMenuAction = async action => {
    const message = pinnedMessageMenu?.message;
    setPinnedMessageMenu(null);
    if (!message) return;
    if (action === 'group-board') {
      if (!activeChat.isGroup) return;
      setIsDetailOpen(true);
      setIsGroupBoardOpen(true);
      setIsGroupMembersExpanded(false);
      setIsGroupMemberPickerOpen(false);
      setGroupMemberMenuId('');
      return;
    }
    await handleMessageAction(action === 'unpin' ? 'pin' : action, message);
  };
  const showExpandedPinnedMessages = pinnedMessagesExpanded && pinnedMessages.length > 1;
  const hasDatedMessages = visibleMessages.some(message => formatMessageDateLabel(message, displayClock, appCopy.locale));

  const scrollToUnreadBoundary = async () => {
    if (!activeUnreadBoundary) return;
    const accountSession = accountSessionRef.current;
    const navigation = ++conversationNavigationRef.current;
    const boundaryKey = String(activeChat.id);
    const isCurrent = () => accountSessionRef.current === accountSession
      && String(currentChatIdRef.current) === boundaryKey
      && conversationNavigationRef.current === navigation;
    chatIsNearBottomRef.current = false;
    setShowLatestMessageButton(true);
    const revealedBoundary = { ...activeUnreadBoundary, revealed: true };
    unreadBoundariesRef.current = { ...unreadBoundariesRef.current, [boundaryKey]: revealedBoundary };
    setUnreadBoundaries(previous => ({ ...previous, [boundaryKey]: revealedBoundary }));
    unreadBoundaryJumpedRef.current.add(String(activeChat.id));
    const firstVisibleMessage = unreadBoundaryStart >= 0 ? visibleMessages[unreadBoundaryStart] : null;
    const firstUnreadSequence = Number(activeUnreadBoundary.firstUnreadSeq) || 0;
    const firstVisibleSequence = Number(firstVisibleMessage?.seq) || 0;
    const exactFirstMessage = firstVisibleMessage && activeUnreadBoundary.firstUnreadId
      && String(firstVisibleMessage.id) === String(activeUnreadBoundary.firstUnreadId);
    const needsHistoryLoad = chatMode === 'tinode'
      && activeChat.tinodeTopic
      && firstUnreadSequence > 0
      && (!firstVisibleMessage || firstVisibleSequence > firstUnreadSequence || !exactFirstMessage);
    let targetId = exactFirstMessage || !needsHistoryLoad ? firstVisibleMessage?.id || '' : '';
    if (needsHistoryLoad) {
      try {
        const loadedConversation = await tinodeClient.loadUnreadMessages(
          activeChat.tinodeTopic,
          firstUnreadSequence,
        );
        if (!isCurrent()) return;
        const loadedMessage = roomMessages(loadedConversation)
          .find(message => Number(message?.seq) >= firstUnreadSequence);
        targetId = loadedMessage?.id || '';
        if (loadedConversation) {
          setConversations(previous => {
            if (!isCurrent()) return previous;
            const currentRoom = previous[boundaryKey] || activeChat;
            const incoming = {
              ...loadedConversation,
              id: boundaryKey,
              managementId: currentRoom.managementId || boundaryKey,
              tinodeTopic: activeChat.tinodeTopic,
              accountSession: currentRoom.accountSession,
            };
            const next = {
              ...previous,
              [boundaryKey]: safeMergeTinodeConversation(currentRoom, incoming, { viewerId }),
            };
            conversationsRef.current = next;
            return next;
          });
        }
        if (targetId && unreadBoundariesRef.current[boundaryKey]) {
          const nextBoundary = {
            ...unreadBoundariesRef.current[boundaryKey],
            firstUnreadId: targetId,
            revealed: true,
          };
          unreadBoundariesRef.current = { ...unreadBoundariesRef.current, [boundaryKey]: nextBoundary };
          setUnreadBoundaries(previous => ({ ...previous, [boundaryKey]: nextBoundary }));
        }
      } catch (error) {
        console.warn('ViChat: failed to load the first unread message', error);
        if (isCurrent()) setChatError(error?.message || 'Không tải được tin chưa đọc. Vui lòng thử lại.');
        return;
      }
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (!isCurrent()) return;
      const firstKey = targetId ? messageActionKey(activeChat.id, targetId) : '';
      const target = (firstKey && messageElementsRef.current.get(firstKey))
        || chatMessagesRef.current?.querySelector('[data-unread-boundary="true"]');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else chatMessagesRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }));
  };

  useEffect(() => {
    if (!activeUnreadBoundary || activeChat.isChatbot || messageSearchQuery.trim()) return undefined;
    let observer;
    let timer;
    let root;
    let checkVisibility;
    const accountSession = accountSessionRef.current;
    const observeLastUnread = () => {
      const currentMessages = visibleMessagesRef.current;
      const targetMessage = currentMessages.find(message => isUnreadBoundaryEnd(message, activeUnreadBoundary));
      const target = targetMessage
        ? messageElementsRef.current.get(messageActionKey(activeChat.id, targetMessage.id))
        : null;
      root = chatMessagesRef.current;
      if (!target || !root) return;
      const isVisible = () => accountSessionRef.current === accountSession
        && String(currentChatIdRef.current) === String(activeChat.id)
        && document.visibilityState !== 'hidden'
        && target.isConnected
        && isUnreadMessageVisible(target.getBoundingClientRect(), root.getBoundingClientRect());
      checkVisibility = () => {
        if (!isVisible()) {
          if (timer) window.clearTimeout(timer);
          timer = null;
          return;
        }
        if (timer) return;
        timer = window.setTimeout(() => {
          timer = null;
          if (isVisible()) {
            void completeUnreadBoundary(activeChat.id, activeUnreadBoundary);
          }
        }, 900);
      };
      root.addEventListener('scroll', checkVisibility, { passive: true });
      document.addEventListener('visibilitychange', checkVisibility);
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(checkVisibility);
        observer.observe(root);
        observer.observe(target);
      }
      checkVisibility();
    };
    const frame = window.requestAnimationFrame(observeLastUnread);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (timer) window.clearTimeout(timer);
      observer?.disconnect();
      if (checkVisibility) {
        root?.removeEventListener('scroll', checkVisibility);
        document.removeEventListener('visibilitychange', checkVisibility);
      }
    };
  }, [activeChat.id, activeChat.isChatbot, activeMessageCount, activeUnreadBoundary, completeUnreadBoundary, messageSearchQuery]);

  const deliveryStatusIcon = message => {
    if (message.failed || message.deliveryStatus === 'failed') {
      return <i className="fa-solid fa-circle-exclamation read-status failed" title={appCopy.t('Gửi thất bại')}></i>;
    }
    if (message.pending || message.deliveryStatus === 'sending') {
      return <i className="fa-solid fa-spinner fa-spin read-status pending" title={appCopy.t('Đang gửi')}></i>;
    }
    return <MessageReceiptIndicator message={message} copy={appCopy} onOpen={openMessageReceiptDetails} />;
  };
  const activeRemoteTyping = chatMode === 'tinode' && !activeChat.isChatbot
    ? typingByTopic[tinodeTopicName(activeChat)]
    : null;
  const showTinodeConnectionNotice = chatMode === 'tinode'
    && ['connecting', 'offline'].includes(connectionStatus)
    && !tinodeClient.authenticated;

  keyboardShortcutActionHandlersRef.current = {
    closeCreateGroupModal,
    closeActiveCall: clearActiveCall,
    closeGroupLeaveDialog,
    closePollComposer,
    closeWorkspacePanel,
    handleConversationSelect,
    openWorkspacePanel,
    stopVoiceRecording,
  };

  const closeTopmostKeyboardLayer = useCallback(({ allowNavigation = true } = {}) => {
    if (forcedLogoutSeconds !== null) return false;
    if (activeCall) {
      keyboardShortcutActionHandlersRef.current.closeActiveCall?.();
      return true;
    }
    if (pendingTenantSwitch) {
      setPendingTenantSwitch(null);
      return true;
    }
    if (tenantSwitcherOpen) {
      setTenantSwitcherOpen(false);
      return true;
    }
    if (conversationBackgroundCropFile) {
      setConversationBackgroundCropFile(null);
      return true;
    }
    if (isConversationBackgroundOpen) {
      if (isSavingConversationBackground) return true;
      setIsConversationBackgroundOpen(false);
      setConversationBackgroundSelection(null);
      return true;
    }
    if (notificationMuteDialog) {
      if (isUpdatingNotificationMute) return true;
      setNotificationMuteDialog(null);
      return true;
    }
    if (contactNicknameDialog) {
      if (isSavingContactNickname) return true;
      setContactNicknameDialog(null);
      return true;
    }
    if (isGroupManagementOpen) {
      if (isUpdatingGroupManagement || isDissolvingGroup) return true;
      setIsGroupManagementOpen(false);
      return true;
    }
    if (isGroupRenameOpen) {
      if (isRenamingGroup) return true;
      setIsGroupRenameOpen(false);
      return true;
    }
    if (pendingGroupLeave) {
      if (isLeavingGroup) return true;
      keyboardShortcutActionHandlersRef.current.closeGroupLeaveDialog?.();
      return true;
    }
    if (avatarCropFile) {
      if (isUpdatingProfileAvatar) return true;
      setAvatarCropFile(null);
      return true;
    }
    if (mediaBrowserOpen) {
      setMediaBrowserOpen(false);
      return true;
    }
    if (imageViewer) {
      setImageViewer(null);
      return true;
    }
    if (shareMessage) {
      setShareMessage(null);
      return true;
    }
    if (reactionDetails) {
      setReactionDetails(null);
      return true;
    }
    if (messageDetails) {
      setMessageDetails(null);
      return true;
    }
    if (editHistoryMessage) {
      setEditHistoryMessage(null);
      return true;
    }
    if (editingMessage) {
      if (isSavingMessageEdit) return true;
      cancelMessageEdit();
      return true;
    }
    if (profileContact) {
      setProfileContact(null);
      return true;
    }
    if (pollComposer) {
      if (isCreatingPoll) return true;
      keyboardShortcutActionHandlersRef.current.closePollComposer?.();
      return true;
    }
    if (isCreateGroupOpen) {
      keyboardShortcutActionHandlersRef.current.closeCreateGroupModal?.();
      return true;
    }
    if (isRecordingVoice) {
      keyboardShortcutActionHandlersRef.current.stopVoiceRecording?.(true);
      return true;
    }
    if (languageMenuOpen) {
      setLanguageMenuOpen(false);
      return true;
    }
    if (showEmojiPicker) {
      setShowEmojiPicker(false);
      return true;
    }
    if (mentionContext) {
      setMentionContext(null);
      setMentionActiveIndex(0);
      return true;
    }
    if (messageMenu || pinnedMessageMenu || conversationMenu || conversationCategoryMenuOpen || groupMemberMenuId) {
      setMessageMenu(null);
      setPinnedMessageMenu(null);
      setConversationMenu(null);
      setConversationCategoryMenuOpen(false);
      setGroupMemberMenuId('');
      return true;
    }
    if (messageReactionPickerKey || messageActionHoverKey || pinnedMessagesExpanded) {
      setMessageReactionPickerKey(null);
      setMessageActionHoverKey(null);
      setPinnedMessagesExpanded(false);
      return true;
    }
    if (isGroupMemberPickerOpen || isGroupBoardOpen || isGroupMembersExpanded) {
      setIsGroupMemberPickerOpen(false);
      setIsGroupBoardOpen(false);
      setIsGroupMembersExpanded(false);
      return true;
    }
    if (workspacePanel && allowNavigation) {
      if (workspacePanel === 'groups' && isCreatingGroup) return true;
      keyboardShortcutActionHandlersRef.current.closeWorkspacePanel?.();
      return true;
    }
    if (replyingTo) {
      setReplyingTo(null);
      return true;
    }
    if (isDetailOpen) {
      setIsDetailOpen(false);
      return true;
    }
    if (isMobileChatActive) {
      setIsMobileChatActive(false);
      return true;
    }
    return false;
  }, [
    avatarCropFile,
    activeCall,
    conversationCategoryMenuOpen,
    conversationBackgroundCropFile,
    conversationMenu,
    contactNicknameDialog,
    forcedLogoutSeconds,
    groupMemberMenuId,
    imageViewer,
    isConversationBackgroundOpen,
    isCreatingGroup,
    isCreateGroupOpen,
    isCreatingPoll,
    isDetailOpen,
    isDissolvingGroup,
    isGroupBoardOpen,
    isGroupManagementOpen,
    isGroupMemberPickerOpen,
    isGroupMembersExpanded,
    isGroupRenameOpen,
    isLeavingGroup,
    isMobileChatActive,
    isRecordingVoice,
    isRenamingGroup,
    isSavingContactNickname,
    isSavingConversationBackground,
    isSavingMessageEdit,
    isUpdatingGroupManagement,
    isUpdatingNotificationMute,
    isUpdatingProfileAvatar,
    languageMenuOpen,
    mediaBrowserOpen,
    mentionContext,
    messageActionHoverKey,
    messageDetails,
    editHistoryMessage,
    editingMessage,
    messageMenu,
    messageReactionPickerKey,
    notificationMuteDialog,
    pendingGroupLeave,
    pendingTenantSwitch,
    pinnedMessageMenu,
    pinnedMessagesExpanded,
    pollComposer,
    profileContact,
    reactionDetails,
    replyingTo,
    shareMessage,
    showEmojiPicker,
    tenantSwitcherOpen,
    workspacePanel,
    keyboardShortcutActionHandlersRef,
    cancelMessageEdit,
  ]);

  const executeKeyboardShortcut = useCallback((actionId, options = {}) => {
    if (actionId === 'closeOverlay') return closeTopmostKeyboardLayer(options);
    if (actionId === 'focusSearch') {
      if (workspacePanel) keyboardShortcutActionHandlersRef.current.closeWorkspacePanel?.();
      window.requestAnimationFrame(() => {
        conversationSearchInputRef.current?.focus();
        conversationSearchInputRef.current?.select?.();
      });
      return true;
    }
    if (actionId === 'focusComposer') {
      if (workspacePanel) keyboardShortcutActionHandlersRef.current.closeWorkspacePanel?.();
      setIsMobileChatActive(true);
      window.requestAnimationFrame(() => messageInputRef.current?.focus());
      return true;
    }
    if (actionId === 'openContacts') {
      keyboardShortcutActionHandlersRef.current.openWorkspacePanel?.('contacts');
      return true;
    }
    if (actionId === 'openSettings') {
      keyboardShortcutActionHandlersRef.current.openWorkspacePanel?.('settings');
      return true;
    }
    if (actionId === 'nextConversation' || actionId === 'previousConversation') {
      if (workspacePanel || filteredChatIds.length === 0) return false;
      const currentIndex = filteredChatIds.indexOf(currentChatId);
      const offset = actionId === 'nextConversation' ? 1 : -1;
      const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + offset + filteredChatIds.length) % filteredChatIds.length;
      if (filteredChatIds[nextIndex] === currentChatId) return true;
      void keyboardShortcutActionHandlersRef.current.handleConversationSelect?.(filteredChatIds[nextIndex]);
      return true;
    }
    return false;
  }, [
    closeTopmostKeyboardLayer,
    currentChatId,
    filteredChatIds,
    workspacePanel,
    keyboardShortcutActionHandlersRef,
  ]);

  useEffect(() => {
    if (!isLoggedIn || !isPinTabUnlocked || !keyboardShortcutSettings.enabled || capturingShortcutAction) return undefined;
    const handleKeyboardShortcut = event => {
      if (event.repeat) return;
      const target = event.target;
      const isEditableTarget = isEditableKeyboardTarget(target);
      const isMessageInput = target === messageInputRef.current;
      if (isMessageInput && event.key === 'Escape' && mentionContext) return;
      if (isEditableTarget && event.key !== 'Escape') return;
      const action = SHORTCUT_ACTIONS.find(item => shortcutMatchesEvent(
        keyboardShortcutSettings.bindings[item.id],
        event,
      ));
      if (!action) return;
      const handled = executeKeyboardShortcut(action.id, {
        allowNavigation: !(isEditableTarget && isMessageInput),
      });
      if (!handled) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', handleKeyboardShortcut, true);
    return () => window.removeEventListener('keydown', handleKeyboardShortcut, true);
  }, [
    capturingShortcutAction,
    executeKeyboardShortcut,
    isLoggedIn,
    isPinTabUnlocked,
    keyboardShortcutSettings,
    mentionContext,
  ]);

  if (!isLoggedIn) {
    if (chatManagementService.remote && sessionRestoreState !== 'ready') {
      return (
        <SessionBootstrapScreen
          copy={appCopy}
          status={sessionRestoreState}
          onRetry={retrySessionRestore}
        />
      );
    }
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
      {isSwitchingTenant && <TenantSwitchLoadingOverlay copy={appCopy} />}
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
          file={imageViewer.file}
          message={imageViewer.message}
          copy={appCopy}
          onDownload={handleFileDownload}
          onShare={handleImageShare}
          onClose={() => setImageViewer(null)}
        />
      )}
      {avatarCropFile && (
        <AvatarCropModal
          file={avatarCropFile}
          copy={appCopy}
          isSaving={isUpdatingProfileAvatar}
          onCancel={() => setAvatarCropFile(null)}
          onSave={handleProfileAvatarCropSave}
        />
      )}
      {conversationBackgroundCropFile && (
        <ConversationBackgroundCropModal
          file={conversationBackgroundCropFile}
          copy={appCopy}
          maxBytes={chatMode === 'demo' || conversationBackgroundScope === CONVERSATION_BACKGROUND_SCOPES.LOCAL
            ? CONVERSATION_BACKGROUND_LOCAL_MAX_BYTES
            : CONVERSATION_BACKGROUND_MAX_BYTES}
          isSaving={isSavingConversationBackground}
          onCancel={() => setConversationBackgroundCropFile(null)}
          onSave={handleConversationBackgroundCropSave}
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
            <ChatLogo decorative />
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
                {appCopy.t(isCurrentUserOnline ? 'Trực tuyến' : 'Ngoại tuyến')}
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
              ref={conversationSearchInputRef}
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
            const roomUnread = conversationUnreadIndicators(room);
            const hasUnread = roomUnread.hasUnread;
            return (
              <ConversationErrorBoundary
                key={id}
                scope="sidebar conversation"
                fallback={<div className="conversation-item conversation-item-error" role="alert">Conversation unavailable</div>}
              >
                <div
                  className={`conversation-item ${isActive ? 'active' : ''} ${hasUnread ? 'unread' : ''} ${conversationMenu?.roomId === id ? 'menu-open' : ''}`}
                  onClick={() => {
                    handleConversationSelect(id);
                  }}
                >
                  <div className={`conv-avatar ${room.avatarClass || ''}`}>
                    <ConversationAvatar room={room} />
                  </div>
                  <div className="conv-details">
                    <div className="conv-header">
                      <span className={`conv-name ${hasUnread ? 'unread' : ''}`}>
                        {room.pinned && <i className="fa-solid fa-thumbtack conv-pinned-icon" title={appCopy.t('Đã ghim')} aria-label={appCopy.t('Đã ghim')}></i>}
                        {roomName}
                        {roomCategory && <span className={`conversation-category-tag category-${roomCategory.id}`} style={{ '--category-color': roomCategory.color }} title={`${appCopy.t('Phân loại')}: ${conversationCategoryLabel(roomCategory)}`}>{conversationCategoryLabel(roomCategory)}</span>}
                      </span>
                      <span
                        className={hasDraft ? 'conv-draft-status' : 'conv-time'}
                        title={hasDraft ? undefined : formatFullMessageDateTime(room, room.time, appCopy.locale)}
                      >
                        {hasDraft ? appCopy.t('Chưa gửi') : formatConversationListTime(room, displayClock, appCopy.locale)}
                      </span>
                    </div>
                    <div className="conv-message">
                      <span className={`conv-last-msg ${hasDraft ? 'draft' : ''} ${hasUnread ? 'unread' : ''}`}>{hasDraft ? draft : localizedConversationPreview(room, appCopy, directoryAccounts, viewerId)}</span>
                      {(roomMuted || roomUnread.hasMention || hasUnread) && (
                        <span className="conv-indicators">
                          {roomMuted && (
                            <i
                              className="fa-solid fa-bell-slash conv-muted-icon"
                              title={notificationMuteLabel(room.notificationMutedUntil, notificationClock, appCopy.locale)}
                              aria-label={appCopy.t('Đã tắt thông báo')}
                            ></i>
                          )}
                          {roomUnread.hasMention && (
                            <span className="conv-mention-indicator" title={appCopy.t('Bạn được nhắc đến')} aria-label={appCopy.t('Bạn được nhắc đến')}>@</span>
                          )}
                          {hasUnread && (
                            <span className="conv-badge" aria-label={`${roomUnread.label} ${appCopy.t('Tin chưa đọc')}`} title={`${roomUnread.label} ${appCopy.t('Tin chưa đọc')}`}>
                              {roomUnread.label}
                            </span>
                          )}
                        </span>
                      )}
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
              </ConversationErrorBoundary>
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
                {conversationCategoryOptions.map(category => (
                  <button type="button" role="menuitem" className={`conversation-category-option ${menuCategory?.id === category.id ? 'selected' : ''}`} key={category.id} onClick={() => handleConversationMenuAction('category', menuRoom, category.id)}>
                  <span className="conversation-category-shape" style={{ backgroundColor: category.color }}></span><span>{conversationCategoryLabel(category)}</span>{menuCategory?.id === category.id && <i className="fa-solid fa-check category-check"></i>}
                  </button>
                ))}
                <div className="conversation-category-submenu-divider"></div>
                <button type="button" role="menuitem" className="conversation-category-manage" onClick={() => {
                  setConversationCategoryMenuOpen(false);
                  setConversationMenu(null);
                  setConversationCategoryManagerOpen(true);
                }}>
                  <i className="fa-solid fa-sliders"></i><span>{appCopy.t('Quản lý thẻ phân loại')}</span>
                </button>
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
        <ConversationErrorBoundary
          key={`${activeChat.id}:header`}
          scope="chat header"
          fallback={<div className="chat-main-header conversation-render-error" role="alert">Conversation header unavailable.</div>}
        >
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
                <span className={`chat-header-status ${activeChat.isGroup ? 'group-presence' : activeDirectPeer ? `direct-presence ${accountPresenceTone(activeDirectPeer)}` : ''}`}>
                  {activeChatPresenceLabel}
                </span>
              </div>
            </div>
            <div className="chat-header-actions">
              <button className="btn-header-action" title={appCopy.t('Tìm kiếm')} onClick={() => openWorkspacePanel('search')}>
                <i className="fa-solid fa-magnifying-glass"></i>
              </button>
              {!activeChat.isChatbot && activeChat.id !== 'empty' && (
                <button
                  type="button"
                  className={`btn-header-action ${activeConversationBackground ? 'active' : ''}`}
                  title={appCopy.t('Đổi hình nền')}
                  aria-label={appCopy.t('Đổi hình nền')}
                  onClick={openConversationBackgroundPicker}
                >
                  <i className="fa-solid fa-image"></i>
                </button>
              )}
              {CALLS_ENABLED && !activeChat.isChatbot && (
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
              <button
                type="button"
                className={`btn-header-action btn-header-detail ${isDetailOpen ? 'active is-open' : 'is-closed'}`}
                title={appCopy.t(isDetailOpen ? 'Đóng thông tin hội thoại' : 'Mở thông tin hội thoại')}
                aria-label={appCopy.t(isDetailOpen ? 'Đóng thông tin hội thoại' : 'Mở thông tin hội thoại')}
                aria-expanded={isDetailOpen}
                aria-controls="conversation-details-sidebar"
                onClick={() => setIsDetailOpen(previous => !previous)}
              >
                <i className="fa-solid fa-table-columns" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </ConversationErrorBoundary>

        {activeChat.isChatbot && (
          <div className="chatbot-context-strip" role="status">
            <span><i className="fa-solid fa-building-shield"></i> {appCopy.t('Phạm vi công ty hiện tại')}</span>
            <span><i className="fa-solid fa-file-circle-check"></i> {appCopy.t('Đọc tài liệu đã chia sẻ')}</span>
            <span><i className="fa-solid fa-link"></i> {appCopy.t('Câu trả lời kèm nguồn')}</span>
          </div>
        )}

        {pinnedMessages.length > 0 && (
          <section
            className={`pinned-messages-strip ${showExpandedPinnedMessages ? 'is-expanded' : 'is-collapsed'}`}
            aria-label={appCopy.t('Tin nhắn đã ghim')}
          >
            {showExpandedPinnedMessages ? (
              <>
                <div className="pinned-messages-expanded-heading">
                  <strong>{appCopy.t('Danh sách ghim')} ({pinnedMessages.length})</strong>
                  <button
                    type="button"
                    className="pinned-messages-toggle pinned-messages-collapse-toggle"
                    aria-expanded="true"
                    aria-label={appCopy.t('Thu gọn tin nhắn đã ghim')}
                    title={appCopy.t('Thu gọn tin nhắn đã ghim')}
                    onClick={() => setPinnedMessagesExpanded(false)}
                  >
                    <span>{appCopy.t('Thu gọn')}</span>
                    <i className="fa-solid fa-chevron-up" aria-hidden="true"></i>
                  </button>
                </div>
                <div className="pinned-message-list is-expanded">
                  {pinnedMessages.map(message => (
                    <PinnedMessageItem
                      key={message.id}
                      message={message}
                      copy={appCopy}
                      preview={pinnedMessagePreview(message)}
                      onClick={() => scrollToPinnedMessage(message)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <PinnedMessageItem
                  message={pinnedMessages[0]}
                  copy={appCopy}
                  preview={pinnedMessagePreview(pinnedMessages[0])}
                  featured
                  showMore={false}
                  onClick={() => scrollToPinnedMessage(pinnedMessages[0])}
                />
                <div className="pinned-messages-actions">
                  {pinnedMessages.length > 1 && (
                    <button
                      type="button"
                      className="pinned-messages-toggle pinned-messages-count-toggle"
                      aria-expanded="false"
                      aria-label={appCopy.t('Mở rộng tin nhắn đã ghim')}
                      title={appCopy.t('Mở rộng tin nhắn đã ghim')}
                      onClick={() => setPinnedMessagesExpanded(true)}
                    >
                      <span>+{pinnedMessages.length - 1} {appCopy.t('ghim')}</span>
                      <i className="fa-solid fa-chevron-down" aria-hidden="true"></i>
                    </button>
                  )}
                  <button
                    type="button"
                    className="pinned-messages-more pinned-messages-menu-button"
                    aria-expanded={Boolean(pinnedMessageMenu)}
                    aria-label={appCopy.t('Tùy chọn tin nhắn đã ghim')}
                    title={appCopy.t('Tùy chọn tin nhắn đã ghim')}
                    onClick={openPinnedMessageMenu}
                  >
                    <i className="fa-solid fa-ellipsis"></i>
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {pinnedMessageMenu && typeof document !== 'undefined' && document.body && createPortal(
          <div
            className="message-context-menu pinned-message-context-menu"
            style={{ left: pinnedMessageMenu.left, top: pinnedMessageMenu.top }}
            onClick={event => event.stopPropagation()}
          >
            <button type="button" onClick={() => handlePinnedMessageMenuAction('copy')}>
              <i className="fa-regular fa-copy" aria-hidden="true"></i>{appCopy.t('Copy tin nhắn')}
            </button>
            {activeChat.isGroup && (
              <button type="button" onClick={() => handlePinnedMessageMenuAction('group-board')}>
                <i className="fa-regular fa-rectangle-list" aria-hidden="true"></i>{appCopy.t('Mở bảng tin nhóm')}
              </button>
            )}
            <button type="button" onClick={() => handlePinnedMessageMenuAction('unpin')}>
              <i className="fa-solid fa-thumbtack" aria-hidden="true"></i>{appCopy.t('Bỏ ghim')}
            </button>
          </div>,
          document.body,
        )}

        {/* Khu vực hiển thị tin nhắn */}
        <ConversationErrorBoundary
          key={activeChat.id}
          scope="active conversation"
          fallback={<div className="chat-messages conversation-render-error" role="alert">Conversation data could not be displayed.</div>}
        >
          <div className="chat-message-viewport">
          {activeUnreadBoundary && !activeUnreadBoundary.revealed && !messageSearchQuery.trim() && (
            <button
              type="button"
              className="unread-jump-button"
              aria-label={appCopy.t('Tin chưa đọc')}
              title={appCopy.t('Đi tới tin nhắn chưa đọc')}
              onClick={scrollToUnreadBoundary}
            >
              <span><i className="fa-solid fa-arrow-down" aria-hidden="true"></i>{appCopy.t('Tin chưa đọc')}</span>
              <strong>{activeUnreadBoundary.unreadCount || ''}</strong>
              <i className="fa-solid fa-chevron-down" aria-hidden="true"></i>
            </button>
          )}
          {(showLatestMessageButton || activeUnreadBoundary?.revealed) && !messageSearchQuery.trim() && visibleMessages.length > 0 && (
            <button
              type="button"
              className="latest-message-jump-button"
              aria-label={appCopy.t('Đi tới tin nhắn mới nhất')}
              title={appCopy.t('Đi tới tin nhắn mới nhất')}
              onClick={scrollToLatestMessage}
            >
              <i className="fa-solid fa-angles-down" aria-hidden="true"></i>
            </button>
          )}
          <div
            ref={chatMessagesRef}
            className={`chat-messages ${activeChat.isChatbot ? 'chatbot-messages' : ''} ${activeConversationBackground ? 'has-conversation-background' : ''}`}
            style={activeConversationBackgroundSource
              ? { '--conversation-background-image': `url("${activeConversationBackgroundSource.replaceAll('"', '\\"')}")` }
              : undefined}
            onWheel={interruptConversationNavigation}
            onTouchMove={interruptConversationNavigation}
            onPointerDown={interruptConversationNavigation}
            onScroll={() => {
              updateMessageScrollState();
              if (messageMenu) setMessageMenu(null);
            }}
          >
          <div className="chat-messages-content">
          {!hasDatedMessages && (
            <div className="date-divider"><span>{appCopy.t(currentChatId === 'dieu-hanh' ? 'Hôm nay' : 'Hội thoại trực tuyến')}</span></div>
          )}

          {visibleMessageEntries.map(entry => {
            const msg = entry.message || entry.messages[0];
            const messageIndex = entry.index;
            const dateLabel = formatMessageDateLabel(msg, displayClock, appCopy.locale);
            const previousDateLabel = formatMessageDateLabel(visibleMessages[messageIndex - 1], displayClock, appCopy.locale);
            const showDateDivider = Boolean(dateLabel && dateLabel !== previousDateLabel);
            if (entry.kind === 'image-batch') {
              return (
                <React.Fragment key={entry.key}>
                  {activeUnreadBoundary?.revealed && unreadBoundaryStart === messageIndex && (
                    <div className="unread-message-divider" data-unread-boundary="true">
                      <span>{appCopy.t('TIN NHẮN CHƯA ĐỌC')}</span>
                      {activeUnreadBoundary.firstUnreadAt && <time>{formatFullMessageDateTime(activeUnreadBoundary.firstUnreadAt, '', appCopy.locale)}</time>}
                    </div>
                  )}
                  {showDateDivider && <div className="date-divider"><span>{dateLabel}</span></div>}
                  <ImageBatchMessage
                    messages={entry.messages}
                    activeChat={activeChat}
                    activeChatId={activeChat.id}
                    viewerId={viewerId}
                    activeGroupMembers={activeGroupMembers}
                    copy={appCopy}
                    chatMode={chatMode}
                    messageActions={messageActions}
                    messageActionKey={messageActionKey}
                    messageActionHoverKey={messageActionHoverKey}
                    messageReactionPickerKey={messageReactionPickerKey}
                    highlightedMessageKey={highlightedMessageKey}
                    openProfileFor={openProfileFor}
                    messageSenderProfile={messageSenderProfile}
                    openImageViewer={openImageViewer}
                    setReactionDetails={setReactionDetails}
                    scrollToMessageById={scrollToMessageById}
                    showMessageActions={showMessageActions}
                    hideMessageActionsLater={hideMessageActionsLater}
                    showMessageReactionPicker={showMessageReactionPicker}
                    hideMessageReactionPickerLater={hideMessageReactionPickerLater}
                    handleMessageAction={handleMessageAction}
                    openMessageMenu={openMessageMenu}
                    messageElementsRef={messageElementsRef}
                    deliveryStatusIcon={deliveryStatusIcon}
                    renderMessageText={renderMessageText}
                  />
                </React.Fragment>
              );
            }
            if (msg.type === 'system') {
              const systemEventClass = String(msg.action || 'activity').replace(/[^a-z0-9_-]/gi, '-');
              const systemEventIcon = ['poll_vote', 'poll_option_added', 'poll_locked'].includes(msg.action)
                ? 'fa-square-poll-vertical'
                : ['group_role_changed'].includes(msg.action)
                  ? 'fa-key'
                : msg.action === 'member_left'
                ? 'fa-arrow-right-from-bracket'
                : ['member_pending'].includes(msg.action)
                  ? 'fa-user-clock'
                : ['member_rejected'].includes(msg.action)
                  ? 'fa-user-xmark'
                : msg.action === 'member_removed'
                  ? 'fa-user-minus'
                    : msg.action === 'member_approved'
                      ? 'fa-user-check'
                      : msg.action === 'group_created'
                    ? 'fa-people-group'
                    : ['message_pinned', 'message_unpinned'].includes(msg.action)
                      ? 'fa-thumbtack'
                      : msg.action === 'conversation_background_changed'
                        ? 'fa-image'
                       : ['group_name_changed', 'group_settings_changed', 'group_chatbot_enabled'].includes(msg.action)
                         ? 'fa-pen-to-square'
                         : msg.action === 'group_avatar_changed'
                           ? 'fa-camera'
                           : msg.action === 'group_dissolved'
                             ? 'fa-triangle-exclamation'
                             : 'fa-user-plus';
              return (
                <React.Fragment key={msg.id}>
                  {activeUnreadBoundary?.revealed && unreadBoundaryStart === messageIndex && (
                    <div className="unread-message-divider" data-unread-boundary="true">
                      <span>{appCopy.t('TIN NHẮN CHƯA ĐỌC')}</span>
                      {activeUnreadBoundary.firstUnreadAt && <time>{formatFullMessageDateTime(activeUnreadBoundary.firstUnreadAt, '', appCopy.locale)}</time>}
                    </div>
                  )}
                  {showDateDivider && <div className="date-divider"><span>{dateLabel}</span></div>}
                  <div
                    ref={element => {
                      const messageKey = messageActionKey(activeChat.id, msg.id);
                      if (element) messageElementsRef.current.set(messageKey, element);
                      else messageElementsRef.current.delete(messageKey);
                    }}
                    className={`group-system-message group-system-message-${systemEventClass}`}
                  >
                    <i className={`group-system-message-icon fa-solid ${systemEventIcon}`} aria-hidden="true"></i>
                    <span className="group-system-message-copy">{localizedSystemText(msg, appCopy, directoryAccounts, viewerId)}</span>
                    <time>{formatMessageTime(msg, msg.time, appCopy.locale)}</time>
                  </div>
                </React.Fragment>
              );
            }
            if (msg.type === 'poll' && activeChat.isGroup) {
              const explicitPollSenderId = msg.senderId || msg.raw?.from || msg.raw?.head?.['x-sender-id'];
              const isPollOutgoing = msg.sender === 'outgoing'
                || Boolean(explicitPollSenderId && viewerId && explicitPollSenderId === viewerId);
              const pollMessageKey = messageActionKey(activeChat.id, msg.id);
              const pollMessageState = messageActions[pollMessageKey] || {};
              const pollSenderGroupRole = groupRoleForIdentity(
                { ...activeChat, members: activeGroupMembers },
                explicitPollSenderId,
              );
              const pollViewerIdentities = [
                viewerId,
                managementViewerId,
                currentUser?.id,
                currentUser?.uid,
                currentUser?.tinodeUid,
              ].filter(Boolean);
              return (
                <React.Fragment key={msg.id}>
                  {activeUnreadBoundary?.revealed && unreadBoundaryStart === messageIndex && (
                    <div className="unread-message-divider" data-unread-boundary="true">
                      <span>{appCopy.t('TIN NHẮN CHƯA ĐỌC')}</span>
                      {activeUnreadBoundary.firstUnreadAt && <time>{formatFullMessageDateTime(activeUnreadBoundary.firstUnreadAt, '', appCopy.locale)}</time>}
                    </div>
                  )}
                  {showDateDivider && <div className="date-divider"><span>{dateLabel}</span></div>}
                  <div
                    ref={element => {
                      if (element) messageElementsRef.current.set(pollMessageKey, element);
                      else messageElementsRef.current.delete(pollMessageKey);
                    }}
                    className={`message-item ${isPollOutgoing ? 'outgoing' : 'incoming'} poll-message-item ${pollMessageState.pinned ? 'message-is-pinned' : ''} ${highlightedMessageKey === pollMessageKey ? 'message-pinned-highlight' : ''}`}
                  >
                    {!isPollOutgoing && (
                      <button type="button" className="message-avatar message-profile-trigger" onClick={() => openProfileFor(messageSenderProfile(msg))} title={`${appCopy.t('Xem thông tin')} ${msg.senderName || appCopy.t('thành viên')}`}>
                        <SafeAvatar src={msg.avatar || ''} name={msg.senderName} />
                        <GroupRoleBadge role={pollSenderGroupRole} copy={appCopy} />
                      </button>
                    )}
                    <div className="message-content-wrapper poll-message-content">
                      {!isPollOutgoing && msg.senderName && (
                        <div className="sender-name-row">
                          <button type="button" className="sender-name sender-profile-trigger" onClick={() => openProfileFor(messageSenderProfile(msg))}>{msg.senderName}</button>
                        </div>
                      )}
                      {pollMessageState.pinned && (
                        <span className="message-pinned-indicator" title={appCopy.t('Đã ghim')}>
                          <i className="fa-solid fa-thumbtack" aria-hidden="true"></i><span>{appCopy.t('Đã ghim')}</span>
                        </span>
                      )}
                      <div
                        className={`message-interactive ${messageActionHoverKey === pollMessageKey ? 'message-actions-visible' : ''}`}
                        onContextMenu={event => openMessageMenu(event, msg)}
                        onMouseEnter={() => showMessageActions(pollMessageKey)}
                        onMouseLeave={() => hideMessageActionsLater(pollMessageKey)}
                      >
                        <PollMessageCard
                          message={msg}
                          viewerIdentities={pollViewerIdentities}
                          groupMembers={activeGroupMembers}
                          copy={appCopy}
                          onVote={handlePollVote}
                          onAddOption={handlePollAddOption}
                          onLock={handlePollLock}
                        />
                        <MessageQuickActions
                          message={msg}
                          messageKey={pollMessageKey}
                          copy={appCopy}
                          messageActionHoverKey={messageActionHoverKey}
                          messageReactionPickerKey={messageReactionPickerKey}
                          showMessageActions={showMessageActions}
                          hideMessageActionsLater={hideMessageActionsLater}
                          showMessageReactionPicker={showMessageReactionPicker}
                          hideMessageReactionPickerLater={hideMessageReactionPickerLater}
                          handleMessageAction={handleMessageAction}
                          openMessageMenu={openMessageMenu}
                        />
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            }
            // Tinode can deliver an echo without the legacy `sender` field. In
            // that case the sender id is the source of truth; otherwise a
            // reply that Lâm sends can be rendered on the recipient side.
            const explicitMessageSenderId = msg.senderId || msg.raw?.from || msg.raw?.head?.['x-sender-id'];
            const isOutgoing = msg.sender === "outgoing"
              || Boolean(explicitMessageSenderId && viewerId && explicitMessageSenderId === viewerId)
              || Boolean(msg.pending && msg.senderId && msg.senderId === viewerId);
            const messageSenderId = explicitMessageSenderId || (isOutgoing ? viewerId : '');
            const messageKey = messageActionKey(activeChat.id, msg.id);
            const messageState = messageActions[messageKey] || {};
            const messageSenderGroupRole = activeChat.isGroup
              ? groupRoleForIdentity({ ...activeChat, members: activeGroupMembers }, messageSenderId)
              : 'MEMBER';
            const reactions = chatMode === 'tinode'
              ? { ...(msg.reactions || {}) }
              : { ...(msg.reactions || {}), ...(messageState.reactions || {}) };
            const reactionEntries = Object.entries(reactions).filter(([, count]) => Number(count) > 0);
            const reactionPills = reactionEntries.length > 0 && (
              <div className="message-reactions">
                {reactionEntries.map(([emoji, count]) => (
                  <button
                    type="button"
                    key={emoji}
                    title={appCopy.t('Xem người đã thả cảm xúc')}
                    aria-label={`${appCopy.t('Xem người đã thả cảm xúc')} ${emoji}`}
                    onClick={() => setReactionDetails({ messageId: msg.id, message: msg, emoji })}
                  >
                    {emoji} {count}
                  </button>
                ))}
              </div>
            );
            const isStickerMessage = msg.type === 'sticker' || Boolean(msg.sticker?.id || msg.sticker?.stickerId || msg.file?.ext === 'sticker');
            const attachmentFile = msg.file || ((msg.type === 'image' || isStickerMessage) && msg.image ? {
              name: appCopy.t('Hình ảnh'),
              mime: 'image/*',
              size: appCopy.t('Hình ảnh'),
              url: msg.image,
            } : null);
            const attachmentIcon = attachmentIconClass(attachmentFile, msg.type);
            const attachmentTone = attachmentIcon.replace('fa-file-', '');
            const stickerPreviewSource = isStickerMessage
              ? attachmentFile?.url || msg.image || msg.sticker?.src || ''
              : '';
            const imagePreviewSource = !isStickerMessage && isImageAttachment(attachmentFile, msg.type)
              ? attachmentFile?.url || msg.image || ''
              : '';
            const imagePreviewFile = imagePreviewSource && attachmentFile
              ? { ...attachmentFile, url: imagePreviewSource }
              : attachmentFile;
            const isAudioMessage = isAudioAttachment(attachmentFile, msg.type) || Number(msg.voiceDuration) > 0;
            const attachmentCaption = String(msg.text || '').trim();
            const attachmentStatus = msg.pending
              ? appCopy.t('Đang tải lên...')
              : attachmentFile?.url ? appCopy.t('Đã có trên Cloud') : appCopy.t('Có sẵn trên máy');
            return (
              <React.Fragment key={msg.id}>
                {activeUnreadBoundary?.revealed && unreadBoundaryStart === messageIndex && (
                  <div className="unread-message-divider" data-unread-boundary="true">
                    <span>{appCopy.t('TIN NHẮN CHƯA ĐỌC')}</span>
                    {activeUnreadBoundary.firstUnreadAt && <time>{formatFullMessageDateTime(activeUnreadBoundary.firstUnreadAt, '', appCopy.locale)}</time>}
                  </div>
                )}
                {showDateDivider && <div className="date-divider"><span>{dateLabel}</span></div>}
                <div
                  ref={element => {
                    if (element) messageElementsRef.current.set(messageKey, element);
                    else messageElementsRef.current.delete(messageKey);
                  }}
                  className={`message-item ${isOutgoing ? 'outgoing' : 'incoming'} ${activeChat.isChatbot ? 'chatbot-message-item' : ''} ${messageState.pinned ? 'message-is-pinned' : ''} ${highlightedMessageKey === messageKey ? 'message-pinned-highlight' : ''}`}
                >
                {!isOutgoing && (
                  <button type="button" className="message-avatar message-profile-trigger" onClick={() => openProfileFor(messageSenderProfile(msg))} title={`${appCopy.t('Xem thông tin')} ${msg.senderName || appCopy.t('thành viên')}`}>
                    <SafeAvatar src={msg.avatar || ''} name={msg.senderName} />
                    <GroupRoleBadge role={messageSenderGroupRole} copy={appCopy} />
                  </button>
                )}

                <div className={`message-content-wrapper ${imagePreviewSource ? 'image-message-content' : ''} ${isStickerMessage ? 'sticker-message-content' : ''}`}>
                  {!isOutgoing && msg.senderName && (
                    <div className="sender-name-row">
                      <button type="button" className="sender-name sender-profile-trigger" onClick={() => openProfileFor(messageSenderProfile(msg))}>{msg.senderName}</button>
                    </div>
                  )}
                  {messageState.pinned && (
                    <span className="message-pinned-indicator" title={appCopy.t('Ghim trên thiết bị này')}>
                      <i className="fa-solid fa-thumbtack" aria-hidden="true"></i>
                      <span>{appCopy.t('Đã ghim')}</span>
                    </span>
                  )}

                  <div
                    className={`message-interactive ${messageActionHoverKey === messageKey ? 'message-actions-visible' : ''}`}
                    onContextMenu={event => openMessageMenu(event, msg)}
                    onMouseEnter={() => showMessageActions(messageKey)}
                    onMouseLeave={() => hideMessageActionsLater(messageKey)}
                  >
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
                        <MessageReplyPreview reply={msg.replyTo} copy={appCopy} onClick={reply => scrollToMessageById(reply.id)} />
                        {activeChat.isChatbot && !isOutgoing && (
                          <div className="chatbot-answer-label">
                            <span><i className="fa-solid fa-sparkles"></i>{msg.grounded ? appCopy.t('Trích lọc từ tài liệu') : msg.isWelcome ? 'ViChat AI' : appCopy.t('Phản hồi AI')}</span>
                            {msg.grounded && <small>{appCopy.t('Đã đối chiếu nguồn')}</small>}
                          </div>
                        )}
                        {msg.edited && (
                          <button
                            type="button"
                            className="edited-message-label"
                            onClick={event => {
                              event.stopPropagation();
                              setEditHistoryMessage(msg);
                            }}
                          >
                            <i className="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
                            {appCopy.t('Đã chỉnh sửa')}
                          </button>
                        )}
                        <p>{renderMessageText(msg.isWelcome ? appCopy.t(msg.text) : msg.text, msg.mentions)}</p>
                        {reactionPills}
                        {Array.isArray(msg.sources) && msg.sources.length > 0 && (
                          <div className="chatbot-sources">
                            <strong><i className="fa-solid fa-book-bookmark"></i>{appCopy.t('Nguồn tham khảo')}</strong>
                            {msg.sources.map((source, index) => (
                              <details className="chatbot-source-card" key={`${source.document_id || source.title}-${index}`}>
                                <summary>
                                  <span className="chatbot-source-index">{index + 1}</span>
                                  <span className="chatbot-source-copy">
                                    <b>{source.title || source.file_name || `Nguồn ${index + 1}`}</b>
                                    <small>{appCopy.t('Xem đoạn trích nguồn')}</small>
                                  </span>
                                </summary>
                                <p className="chatbot-source-snippet">{source.snippet || appCopy.t('Chưa có đoạn trích cho nguồn này.')}</p>
                              </details>
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
                    {isStickerMessage ? (
                      <div className="attachment-message-stack sticker-message-stack">
                        <MessageReplyPreview reply={msg.replyTo} copy={appCopy} onClick={reply => scrollToMessageById(reply.id)} />
                        <div className={`sticker-bubble ${msg.pending ? 'pending' : ''} ${msg.failed ? 'failed' : ''}`}>
                          <TinodeImagePreview source={stickerPreviewSource} alt={msg.sticker?.label || appCopy.t('Sticker')} copy={appCopy} className="sticker-message-image" />
                          <span className="message-time">{formatMessageTime(msg, msg.time, appCopy.locale)} {isOutgoing && deliveryStatusIcon(msg)}</span>
                        </div>
                      </div>
                    ) : isAudioMessage ? (
                      <div className="attachment-message-stack">
                        <MessageReplyPreview reply={msg.replyTo} copy={appCopy} onClick={reply => scrollToMessageById(reply.id)} />
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
                        <MessageReplyPreview reply={msg.replyTo} copy={appCopy} onClick={reply => scrollToMessageById(reply.id)} />
                        <div className={`message-bubble image-bubble ${msg.pending ? 'pending' : ''} ${msg.failed ? 'failed' : ''}`}>
                        <button
                          type="button"
                          className="image-preview-button"
                          title={appCopy.t('Bấm để xem ảnh')}
                          onClick={() => openImageViewer(imagePreviewFile, msg)}
                        >
                          <TinodeImagePreview
                            source={imagePreviewSource}
                              alt={appCopy.t('Ảnh đính kèm')}
                            copy={appCopy}
                          />
                          <span className="image-view-hint"><i className="fa-solid fa-expand"></i>{appCopy.t('Xem ảnh')}</span>
                        </button>
                        <div className={`image-bubble-footer ${attachmentCaption ? 'has-caption' : ''}`}>
                          {attachmentCaption && <p>{renderMessageText(attachmentCaption, msg.mentions)}</p>}
                          <span className="message-time">{formatMessageTime(msg, msg.time, appCopy.locale)} {isOutgoing && deliveryStatusIcon(msg)}</span>
                        </div>
                        </div>
                      </div>
                    ) : attachmentFile && (
                      <div className="attachment-message-stack">
                        <MessageReplyPreview reply={msg.replyTo} copy={appCopy} onClick={reply => scrollToMessageById(reply.id)} />
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
                        {attachmentCaption && (
                          <div className="attachment-caption">
                            <p>{renderMessageText(attachmentCaption, msg.mentions)}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {msg.type !== 'text' && reactionPills}
                    </div>
                    <div
                      className="message-quick-actions"
                      onClick={event => event.stopPropagation()}
                      onMouseEnter={() => showMessageActions(messageKey)}
                      onMouseLeave={() => hideMessageActionsLater(messageKey)}
                    >
                      <button
                        type="button"
                        className="message-action-button"
                        title={appCopy.t('Trả lời tin nhắn')}
                        aria-label={appCopy.t('Trả lời tin nhắn')}
                        onClick={() => handleMessageAction('reply', msg)}
                      >
                        <i className="fa-solid fa-quote-left" aria-hidden="true"></i>
                      </button>
                      <button
                        type="button"
                        className="message-action-button"
                        title={appCopy.t('Chia sẻ tin nhắn')}
                        aria-label={appCopy.t('Chia sẻ tin nhắn')}
                        onClick={() => handleMessageAction('share', msg)}
                      >
                        <i className="fa-solid fa-share" aria-hidden="true"></i>
                      </button>
                      <div
                        className="message-reaction-action"
                        onMouseEnter={() => {
                          showMessageActions(messageKey);
                          showMessageReactionPicker(messageKey);
                        }}
                        onMouseLeave={() => hideMessageReactionPickerLater(messageKey)}
                      >
                        <button
                          type="button"
                          className="message-action-button"
                          title={appCopy.t('Thêm biểu cảm')}
                          aria-label={appCopy.t('Thêm biểu cảm')}
                          aria-expanded={messageReactionPickerKey === messageKey}
                          onFocus={() => showMessageReactionPicker(messageKey)}
                          onClick={() => handleMessageAction('reaction', msg, '👍')}
                        >
                          <i className="fa-regular fa-thumbs-up" aria-hidden="true"></i>
                        </button>
                        {messageReactionPickerKey === messageKey && (
                          <div
                            className="message-reaction-picker"
                            role="listbox"
                            aria-label={appCopy.t('Thêm biểu cảm')}
                            onMouseEnter={() => {
                              showMessageActions(messageKey);
                              showMessageReactionPicker(messageKey);
                            }}
                            onMouseLeave={() => hideMessageReactionPickerLater(messageKey)}
                          >
                            {MESSAGE_QUICK_REACTIONS.map(reaction => (
                              <button
                                type="button"
                                role="option"
                                key={reaction}
                                aria-label={reaction}
                                onMouseDown={event => event.preventDefault()}
                                onClick={() => handleMessageAction('reaction', msg, reaction)}
                              >
                                {reaction}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button type="button" className="message-action-button message-more-action" onClick={event => { event.stopPropagation(); openMessageMenu(event, msg); }} aria-label={appCopy.t('Tùy chọn tin nhắn')}><i className="fa-solid fa-ellipsis" aria-hidden="true"></i></button>
                    </div>
                  </div>
                </div>
                </div>
              </React.Fragment>
            );
          })}

          {activeChat.isChatbot && visibleMessages.length <= 1 && (
            <section className="chatbot-starter" aria-label={appCopy.t('Gợi ý câu hỏi cho ViChat AI')}>
              <div className="chatbot-starter-hero">
                <span className="chatbot-starter-mark" aria-hidden="true">
                  <img src={CHATBOT_ACCOUNT.avatar} alt="" />
                  <i className="fa-solid fa-sparkles"></i>
                </span>
                <div className="chatbot-starter-heading">
                  <span className="chatbot-starter-eyebrow">{appCopy.t('TRỢ LÝ NỘI BỘ THEO CÔNG TY')}</span>
                  <h3>{appCopy.t('Hỏi như đang trao đổi với một đồng nghiệp hiểu tài liệu')}</h3>
                  <p>{appCopy.t('ViChat AI tìm trong tài liệu của công ty hiện tại, trích lọc nội dung liên quan và chỉ rõ nguồn để bạn kiểm tra.')}</p>
                </div>
              </div>
              <div className="chatbot-starter-assurance" aria-label={appCopy.t('Phạm vi trả lời của ViChat AI')}>
                <span><i className="fa-solid fa-shield-halved"></i>{appCopy.t('Tách biệt theo công ty')}</span>
                <span><i className="fa-solid fa-file-pdf"></i>{appCopy.t('PDF, Word, Excel và văn bản')}</span>
                <span><i className="fa-solid fa-book-open-reader"></i>{appCopy.t('Có nguồn đối chiếu')}</span>
              </div>
              <div className="chatbot-starter-grid">
                {CHATBOT_STARTER_PROMPTS.map(item => (
                  <button
                    type="button"
                    key={item.title}
                    title={appCopy.t(item.prompt)}
                    onClick={() => {
                      const prompt = appCopy.t(item.prompt);
                      setInputText(prompt);
                      setDrafts(previous => ({ ...previous, [currentChatId]: prompt }));
                      window.setTimeout(() => {
                        const input = messageInputRef.current;
                        if (currentChatIdRef.current !== currentChatId || input?.value !== prompt) return;
                        input.focus();
                        const placeholder = prompt.match(/\[[^\]]+\]/u);
                        if (placeholder) input.setSelectionRange(placeholder.index, placeholder.index + placeholder[0].length);
                      }, 0);
                    }}
                    disabled={isTyping || realtimeMessagingPending}
                  >
                    <span className="chatbot-starter-icon"><i className={`fa-solid ${item.icon}`}></i></span>
                    <span><strong>{appCopy.t(item.title)}</strong><small>{appCopy.t(item.hint || item.prompt)}</small></span>
                    <i className="fa-solid fa-arrow-right"></i>
                  </button>
                ))}
              </div>
              <p className="chatbot-starter-tip"><i className="fa-regular fa-lightbulb"></i>{appCopy.t('Chọn gợi ý, thay phần trong ngoặc vuông bằng chủ đề của bạn rồi nhấn Gửi.')}</p>
            </section>
          )}

           {messageMenu && !messageMenu.message.recalled && (() => {
            const menuMessage = messageMenu.message;
            const isOwnMessage = menuMessage.senderId === viewerId || menuMessage.sender === 'outgoing';
            const canEditMessage = messageIsOwnedByViewer(menuMessage) && canEditDeliveredMessage(menuMessage);
            const canRecallMessage = isOwnMessage && canRecallDeliveredMessage(menuMessage);
            const menuMessageState = messageActions[messageActionKey(activeChat.id, menuMessage.id)] || {};
            const marked = menuMessageState.marked;
            if (typeof document === 'undefined' || !document.body) return null;
            return createPortal(
              <div className="message-context-menu" style={{ left: messageMenu.left, top: messageMenu.top }} onClick={event => event.stopPropagation()}>
                <button type="button" onClick={() => handleMessageAction('copy', menuMessage)}><i className="fa-regular fa-copy"></i>{appCopy.t('Copy tin nhắn')}</button>
                {canEditMessage && <button type="button" onClick={() => handleMessageAction('edit', menuMessage)}><i className="fa-solid fa-pen-to-square"></i>{appCopy.t('Sửa tin nhắn')}</button>}
                <button type="button" onClick={() => handleMessageAction('mark', menuMessage)}><i className={`fa-${marked ? 'solid' : 'regular'} fa-star`}></i>{appCopy.t(marked ? 'Bỏ đánh dấu' : 'Đánh dấu tin nhắn')}</button>
                {canPinActiveGroupMessages && <button type="button" onClick={() => handleMessageAction('pin', menuMessage)}><i className="fa-solid fa-thumbtack"></i>{appCopy.t(menuMessageState.pinned ? 'Bỏ ghim tin nhắn' : 'Ghim tin nhắn')}</button>}
                {!activeChat.isChatbot && isManagementConversationId(activeChat.managementId || activeChat.id) && <button type="button" onClick={() => handleMessageAction('create-task', menuMessage)}><i className="fa-solid fa-list-check"></i>{appCopy.t('Giao việc từ tin nhắn')}</button>}
                <button type="button" onClick={() => handleMessageAction('detail', menuMessage)}><i className="fa-solid fa-circle-info"></i>{appCopy.t('Xem chi tiết')}</button>
                {canRecallMessage && <>
                  <button type="button" className="danger" onClick={() => handleMessageAction('recall-self', menuMessage)}><i className="fa-solid fa-eye-slash"></i>{appCopy.t('Thu hồi phía tôi')}</button>
                  <button type="button" className="danger" onClick={() => handleMessageAction('recall-all', menuMessage)}><i className="fa-solid fa-rotate-left"></i>{appCopy.t('Thu hồi tất cả')}</button>
                </>}
              </div>,
              document.body,
            );
          })()}

          {activeRemoteTyping && !activeChat.directMessagingBlocked && (
            <div className="message-item incoming remote-typing-indicator">
              <div className="message-avatar"><SafeAvatar src={roomMembers(activeChat).find(member => identitiesOverlap(member, { id: activeRemoteTyping.uid }))?.avatar || ''} name={activeRemoteTyping.name} /></div>
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
          </div>
          </div>
        </ConversationErrorBoundary>

        {/* Vùng gõ tin nhắn */}
        {realtimeMessagingPending && (
          <div className="management-realtime-notice" role="status">
            <i className="fa-solid fa-database"></i>
            <span>{appCopy.t('Dữ liệu Chatmgt vẫn sẵn sàng, nhưng kết nối realtime Tinode đang tạm gián đoạn.')}</span>
          </div>
        )}
        {!canSendInActiveGroup && activeChat.isGroup && (
          <div className="group-send-disabled-notice" role="status">
            <i className="fa-solid fa-lock"></i>
            <span>{appCopy.t('Quản trị viên đã tạm khóa quyền gửi tin nhắn trong nhóm.')}</span>
          </div>
        )}
        {activeGroupSpamBlocked && (
          <div className="group-spam-cooldown-notice" role="status" aria-live="polite">
            <span className="group-spam-cooldown-icon"><i className="fa-solid fa-hourglass-half"></i></span>
            <span className="group-spam-cooldown-copy">
              <strong>{appCopy.t('Đang tạm khóa gửi tin nhắn')}</strong>
              <small>{appCopy.t(groupSpamCooldownMessage(activeGroupSpamRemaining))}</small>
            </span>
            <strong className="group-spam-cooldown-countdown">{activeGroupSpamRemaining}s</strong>
          </div>
        )}
        {activeChatBlockedByViewer ? (
          <div className="direct-blocked-composer" role="status">
            <span className="direct-blocked-composer-icon"><i className="fa-solid fa-user-slash"></i></span>
            <span className="direct-blocked-composer-copy">
              <strong>{appCopy.t('Bạn đã chặn tin nhắn')}</strong>
              <small>{appCopy.t('Bỏ chặn để tiếp tục nhắn tin với người này.')}</small>
            </span>
            <button
              type="button"
              onClick={() => void updateConversationDirectBlock(activeChat, false)}
              disabled={isUpdatingDirectBlock}
            >
              {isUpdatingDirectBlock && <i className="fa-solid fa-spinner fa-spin"></i>}
              {appCopy.t('Bỏ chặn')}
            </button>
          </div>
        ) : (
        <div className={`chat-main-input ${activeChat.isChatbot ? 'chatbot-composer' : ''}`}>
          {editingMessage && (
            <div className="editing-banner" role="status">
              <span className="editing-banner-icon" aria-hidden="true"><i className="fa-solid fa-pen-to-square"></i></span>
              <div className="editing-banner-copy">
                <strong>{appCopy.t('Sửa tin nhắn')}</strong>
                <small>{editingMessage.message?.text || ''}</small>
              </div>
              <button type="button" onClick={cancelMessageEdit} disabled={isSavingMessageEdit} aria-label={appCopy.t('Hủy sửa')}><i className="fa-solid fa-xmark"></i></button>
            </div>
          )}
          {replyingTo && (
            <div className="replying-banner">
              <span className="replying-banner-icon" aria-hidden="true"><i className="fa-solid fa-quote-left"></i></span>
              <div className="replying-banner-copy">
                <strong>{appCopy.t('Trả lời')} {replyingTo.senderName}</strong>
                <MessageReplyPreview reply={replyingTo} copy={appCopy} onClick={reply => scrollToMessageById(reply.id)} showIcon={false} showSender={false} />
              </div>
              <button type="button" onClick={() => setReplyingTo(null)} aria-label={appCopy.t('Hủy trả lời')}><i className="fa-solid fa-xmark"></i></button>
            </div>
          )}
          {activePastedAttachments.length > 0 && (
            <section className="pasted-attachment-drafts" aria-label={appCopy.t('Ảnh và tệp đang chờ gửi')}>
              <div className="pasted-attachment-drafts-header">
                <span className="pasted-attachment-drafts-title">
                  <i className="fa-regular fa-clipboard" aria-hidden="true"></i>
                  <strong>{appCopy.t('Đang chờ gửi')}</strong>
                  <small>{activePastedAttachments.length}</small>
                </span>
                <span className="pasted-attachment-drafts-hint">{appCopy.t('Nhập mô tả rồi bấm Enter hoặc Gửi.')}</span>
                <button type="button" onClick={() => clearPastedAttachments(currentChatId)}>
                  {appCopy.t('Xóa tất cả')}
                </button>
              </div>
              <div className="pasted-attachment-drafts-list">
                {activePastedAttachments.map(attachment => (
                  <article className="pasted-attachment-draft" key={attachment.id}>
                    <span className={`pasted-attachment-draft-preview ${attachment.isImage ? 'image' : 'file'}`}>
                      {attachment.isImage && attachment.previewUrl ? (
                        <img src={attachment.previewUrl} alt="" />
                      ) : (
                        <i className={`fa-solid ${attachment.isImage ? 'fa-image' : 'fa-file-lines'}`} aria-hidden="true"></i>
                      )}
                    </span>
                    <span className="pasted-attachment-draft-copy">
                      <strong title={attachment.name}>{attachment.name}</strong>
                      <small>{attachment.sizeLabel}</small>
                    </span>
                    <button
                      type="button"
                      onClick={() => removePastedAttachment(attachment.id)}
                      aria-label={`${appCopy.t('Xóa')} ${attachment.name}`}
                      title={appCopy.t('Xóa khỏi danh sách chờ')}
                    >
                      <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
          {settings.stickerSuggestions
            && suggestedStickers.length > 0
            && inputText.trim()
            && !editingMessage
            && !mentionContext
            && !activeChat.isChatbot
            && !realtimeMessagingPending
            && !isRecordingVoice
            && !activeGroupSpamBlocked
            && canSendInActiveGroup && (
            <div className="sticker-suggestion-bar" role="list" aria-label={appCopy.t('Gợi ý Sticker')}>
              <span className="sticker-suggestion-heading"><i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>{appCopy.t('Gợi ý Sticker')}</span>
              <div className="sticker-suggestion-list">
                {suggestedStickers.map(sticker => (
                  <button
                    type="button"
                    className="sticker-suggestion-option"
                    key={sticker.id}
                    role="listitem"
                    title={appCopy.t(sticker.label)}
                    aria-label={`${appCopy.t('Chọn sticker gợi ý')}: ${appCopy.t(sticker.label)}`}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => handleStickerSuggestionSelect(sticker)}
                  >
                    <img src={sticker.src} alt="" loading="lazy" draggable="false" />
                    <span>{appCopy.t(sticker.label)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {!activeChat.isChatbot && <div className="input-actions-left">
            <button className="btn-input-action image-input-action" title={appCopy.t(activeChat.isChatbot ? 'ViChat AI hiện nhận câu hỏi văn bản' : realtimeMessagingPending ? 'Kết nối realtime Tinode chưa sẵn sàng' : 'Gửi nhiều ảnh')} aria-label={appCopy.t('Gửi nhiều ảnh')} onClick={handleImageAttachClick} disabled={realtimeMessagingPending || activeChat.isChatbot || isRecordingVoice || !canSendInActiveGroup || activeGroupSpamBlocked}>
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
            <button className="btn-input-action file-input-action" title={appCopy.t(activeChat.isChatbot ? 'ViChat AI hiện nhận câu hỏi văn bản' : realtimeMessagingPending ? 'Kết nối realtime Tinode chưa sẵn sàng' : 'Gửi nhiều file')} aria-label={appCopy.t('Gửi nhiều file')} onClick={handleAttachClick} disabled={realtimeMessagingPending || activeChat.isChatbot || isRecordingVoice || !canSendInActiveGroup || activeGroupSpamBlocked}>
              <i className="fa-solid fa-paperclip"></i>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              multiple
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <button type="button" className="btn-input-action" title={appCopy.t('Sticker và biểu cảm')} aria-label={appCopy.t('Mở sticker và biểu cảm')} aria-expanded={showEmojiPicker} onClick={() => { if (!showEmojiPicker) { setComposerPickerTab('stickers'); setMentionContext(null); } setShowEmojiPicker(previous => !previous); }} disabled={realtimeMessagingPending || activeChat.isChatbot || isRecordingVoice || !canSendInActiveGroup || activeGroupSpamBlocked}>
              <i className="fa-regular fa-smile"></i>
            </button>
            {showEmojiPicker && (
              <StickerPicker
                activeTab={composerPickerTab}
                onTabChange={setComposerPickerTab}
                onSelectSticker={handleSendSticker}
                onSelectEmoji={insertEmoji}
                scope={notificationSettingsViewerId || 'anonymous'}
                scopeAliases={notificationSettingsViewerAliases}
                tenantId={preferenceTenantId}
                copy={appCopy}
              />
            )}
            <button
              type="button"
              className={`btn-input-action voice-input-action ${isRecordingVoice ? 'recording' : ''}`}
              title={appCopy.t(isRecordingVoice ? 'Dừng và gửi tin nhắn thoại' : 'Ghi tin nhắn thoại')}
              aria-label={appCopy.t(isRecordingVoice ? 'Dừng và gửi tin nhắn thoại' : 'Ghi tin nhắn thoại')}
              onClick={() => (isRecordingVoice ? stopVoiceRecording(false) : startVoiceRecording())}
              disabled={realtimeMessagingPending || activeChat.isChatbot || !canSendInActiveGroup || activeGroupSpamBlocked}
            >
              <i className={`fa-solid ${isRecordingVoice ? 'fa-stop' : 'fa-microphone'}`}></i>
            </button>
            {activeChat.isGroup && (
              <button
                type="button"
                className="btn-input-action poll-input-action"
                title={appCopy.t(canCreatePollInActiveGroup ? 'Tạo bình chọn' : 'Chỉ quản trị viên mới có thể tạo bình chọn trong nhóm.')}
                aria-label={appCopy.t('Tạo bình chọn')}
                onClick={openPollComposer}
                disabled={realtimeMessagingPending || activeChat.isChatbot || isRecordingVoice || !canSendInActiveGroup || !canCreatePollInActiveGroup || activeGroupSpamBlocked}
              >
                <i className="fa-solid fa-square-poll-vertical"></i>
              </button>
            )}
          </div>}
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
                {activeChat.isChatbot && (
                  <span className="chatbot-input-icon" aria-hidden="true"><i className="fa-solid fa-sparkles"></i></span>
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
              placeholder={appCopy.t(editingMessage ? 'Nhập nội dung mới...' : realtimeMessagingPending ? 'Kết nối realtime Tinode chưa sẵn sàng' : activeChat.isChatbot ? 'Hỏi ViChat AI về quy trình, chính sách, tài liệu...' : activePastedAttachments.length > 0 ? 'Nhập mô tả cho ảnh hoặc tệp...' : 'Nhập tin nhắn...')}
              value={inputText}
              disabled={realtimeMessagingPending || !canSendInActiveGroup || (activeChat.isChatbot && isTyping)}
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
          <button className="btn-send-message-sh" disabled={realtimeMessagingPending || !canSendInActiveGroup || activeGroupSpamBlocked || isRecordingVoice || isSavingMessageEdit || (activeChat.isChatbot && isTyping)} onClick={handleComposerSubmit}>
            {activeChat.isChatbot && <i className={`fa-solid ${isTyping ? 'fa-spinner fa-spin' : 'fa-arrow-up'}`} aria-hidden="true"></i>}
            {appCopy.t(editingMessage ? (isSavingMessageEdit ? 'Đang lưu...' : 'Lưu thay đổi') : activeChat.isChatbot && isTyping ? 'Đang tìm...' : activeChat.isChatbot ? 'Hỏi AI' : 'Gửi')}
          </button>
        </div>
        )}
        {pollComposer && (
          <div
            className="poll-composer-modal modal-backdrop"
            role="presentation"
            onMouseDown={event => {
              if (event.target === event.currentTarget) closePollComposer();
            }}
          >
            <form className="poll-composer-card" onSubmit={handlePollCreate} role="dialog" aria-modal="true" aria-labelledby="poll-composer-title">
              <div className="poll-composer-header">
                <div>
                  <span className="group-modal-kicker">{appCopy.t('NHÓM')}</span>
                  <h2 id="poll-composer-title">{appCopy.t('Tạo bình chọn')}</h2>
                </div>
                <button type="button" className="poll-composer-close" onClick={closePollComposer} aria-label={appCopy.t('Đóng')}><i className="fa-solid fa-xmark"></i></button>
              </div>
              <label className="poll-form-field">
                <span>{appCopy.t('Câu hỏi')}</span>
                <textarea
                  value={pollComposer.question}
                  maxLength={POLL_LIMITS.maxQuestionLength}
                  onChange={event => setPollComposer(previous => ({ ...previous, question: event.target.value }))}
                  placeholder={appCopy.t('Bạn muốn hỏi cả nhóm điều gì?')}
                  autoFocus
                  rows={3}
                />
                <small>{pollComposer.question.length}/{POLL_LIMITS.maxQuestionLength}</small>
              </label>
              <div className="poll-form-field">
                <span>{appCopy.t('Phương án')}</span>
                <div className="poll-composer-options">
                  {pollComposer.options.map((option, index) => (
                    <div className="poll-composer-option" key={`poll-option-${index}`}>
                      <input
                        value={option}
                        maxLength={POLL_LIMITS.maxOptionLength}
                        onChange={event => setPollComposer(previous => ({
                          ...previous,
                          options: previous.options.map((current, optionIndex) => optionIndex === index ? event.target.value : current),
                        }))}
                        placeholder={`${appCopy.t('Phương án')} ${index + 1}`}
                      />
                      {pollComposer.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setPollComposer(previous => ({ ...previous, options: previous.options.filter((_, optionIndex) => optionIndex !== index) }))}
                          aria-label={appCopy.t('Xóa phương án')}
                        ><i className="fa-solid fa-xmark"></i></button>
                      )}
                    </div>
                  ))}
                </div>
                {pollComposer.options.length < POLL_LIMITS.maxOptions && (
                  <button
                    type="button"
                    className="poll-add-choice-button"
                    onClick={() => setPollComposer(previous => ({ ...previous, options: [...previous.options, ''] }))}
                  ><i className="fa-solid fa-plus"></i>{appCopy.t('Thêm phương án')}</button>
                )}
              </div>
              <div className="poll-composer-settings-heading">
                <span>{appCopy.t('Thiết lập')}</span>
                <button
                  type="button"
                  className={`poll-settings-button ${pollComposer.advancedOpen ? 'active' : ''}`}
                  onClick={() => setPollComposer(previous => ({ ...previous, advancedOpen: !previous.advancedOpen }))}
                  aria-expanded={pollComposer.advancedOpen}
                  aria-label={appCopy.t('Thiết lập nâng cao')}
                  title={appCopy.t('Thiết lập nâng cao')}
                ><i className="fa-solid fa-gear"></i></button>
              </div>
              {pollComposer.advancedOpen && (
                <div className="poll-advanced-settings">
                  <label className="poll-form-field">
                    <span>{appCopy.t('Thời hạn')}</span>
                    <select
                      value={pollComposer.duration}
                      onChange={event => setPollComposer(previous => ({ ...previous, duration: event.target.value }))}
                    >
                      {POLL_DURATION_OPTIONS.map(option => <option key={option.id} value={option.id}>{appCopy.t(option.label)}</option>)}
                    </select>
                  </label>
                  {[
                    ['allowMultiple', 'Cho phép chọn nhiều phương án'],
                    ['allowAddOptions', 'Cho thành viên thêm phương án'],
                    ['hideResultsUntilVote', 'Ẩn kết quả trước khi bình chọn'],
                    ['hideVoters', 'Ẩn danh sách người đã bình chọn'],
                    ['pinPoll', 'Ghim bình chọn sau khi tạo'],
                  ].map(([key, label]) => (
                    <label className="poll-setting-toggle" key={key}>
                      <input
                        type="checkbox"
                        checked={Boolean(pollComposer.settings[key])}
                        disabled={key === 'pinPoll' && !canPinActiveGroupMessages}
                        onChange={event => setPollComposer(previous => ({
                          ...previous,
                          settings: { ...previous.settings, [key]: event.target.checked },
                        }))}
                      />
                      <span><i className="fa-solid fa-check"></i></span>
                      <strong>{appCopy.t(label)}</strong>
                    </label>
                  ))}
                </div>
              )}
              <div className="poll-composer-footer">
                <button type="button" className="btn-secondary" onClick={closePollComposer} disabled={isCreatingPoll}>{appCopy.t('Hủy')}</button>
                <button type="submit" className="btn-primary" disabled={isCreatingPoll || activeGroupSpamBlocked || !pollComposer.question.trim()}>
                  <i className={`fa-solid ${isCreatingPoll ? 'fa-spinner fa-spin' : 'fa-square-poll-vertical'}`}></i>{isCreatingPoll ? appCopy.t('Đang tạo...') : appCopy.t('Tạo bình chọn')}
                </button>
              </div>
            </form>
          </div>
        )}
        {activeChat.isChatbot && <p className="chatbot-composer-note"><i className="fa-solid fa-shield-halved"></i> {appCopy.t('Câu trả lời bám theo tài liệu của công ty hiện tại. Luôn kiểm tra nguồn khi ra quyết định.')}</p>}
        {messageDetails && (() => {
          const receiptUsers = normalizeReceiptUsers(messageDetails.receiptUsers);
          const previewText = messageDetails.text
            || messageDetails.file?.name
            || (messageDetails.type === 'sticker' ? appCopy.t('Sticker') : appCopy.t('Tệp đính kèm'));
          const renderReceiptUsers = (users, emptyLabel, statusClass) => users.length > 0
            ? users.map(user => (
              <div className="message-receipt-user" key={user.id}>
                <SafeAvatar src={user.avatar || ''} name={user.name} className="message-receipt-details-avatar" />
                <span className="message-receipt-user-name">{user.name || appCopy.t('Thành viên')}</span>
                <i className={`fa-solid fa-check-double message-receipt-user-status ${statusClass}`} aria-hidden="true"></i>
              </div>
            ))
            : <p className="message-receipt-empty">{emptyLabel}</p>;
          return (
            <div
              className="message-details-modal"
              role="presentation"
              onMouseDown={event => {
                if (event.target === event.currentTarget) setMessageDetails(null);
              }}
            >
              <section className="message-details-card message-receipt-details-card" role="dialog" aria-modal="true" aria-labelledby="message-details-title">
                <div className="message-details-header">
                  <strong id="message-details-title">{appCopy.t('Chi tiết tin nhắn')}</strong>
                  <button type="button" onClick={() => setMessageDetails(null)} aria-label={appCopy.t('Đóng')}><i className="fa-solid fa-xmark"></i></button>
                </div>
                <div className="message-details-preview">
                  <span className="message-details-preview-icon" aria-hidden="true"><i className={`fa-solid ${messageDetails.type === 'file' ? 'fa-paperclip' : messageDetails.type === 'image' ? 'fa-image' : 'fa-message'}`}></i></span>
                  <p>{previewText}</p>
                </div>
                <div className="message-details-meta">
                  <p><strong>{appCopy.t('Người gửi')}:</strong> {messageDetails.senderName || (messageDetails.sender === 'outgoing' ? appCopy.t('Bạn') : appCopy.t('Thành viên'))}</p>
                  <p><strong>{appCopy.t('Thời gian')}:</strong> {messageDetails.createdAt ? new Date(messageDetails.createdAt).toLocaleString(appCopy.locale) : messageDetails.time}</p>
                </div>
                {(receiptUsers.read.length > 0 || receiptUsers.received.length > 0 || messageDetails.receiptDetails) && (
                  <div className="message-receipt-sections">
                    <section className="message-receipt-section" aria-labelledby="message-receipt-read-title">
                      <div className="message-receipt-section-heading">
                        <span id="message-receipt-read-title"><i className="fa-solid fa-eye" aria-hidden="true"></i>{appCopy.t('Đã xem')}</span>
                        <strong>{receiptUsers.read.length}</strong>
                      </div>
                      <div className="message-receipt-list">
                        {renderReceiptUsers(receiptUsers.read, appCopy.t('Chưa có ai xem tin nhắn này'), 'read')}
                      </div>
                    </section>
                    <section className="message-receipt-section" aria-labelledby="message-receipt-received-title">
                      <div className="message-receipt-section-heading">
                        <span id="message-receipt-received-title"><i className="fa-solid fa-check-double" aria-hidden="true"></i>{appCopy.t('Đã nhận')}</span>
                        <strong>{receiptUsers.received.length}</strong>
                      </div>
                      <div className="message-receipt-list">
                        {renderReceiptUsers(receiptUsers.received, appCopy.t('Chưa có ai nhận tin nhắn này'), 'received')}
                      </div>
                    </section>
                  </div>
                )}
              </section>
            </div>
          );
        })()}
        {editHistoryMessage && (
          <div
            className="message-details-modal edit-history-modal"
            role="presentation"
            onMouseDown={event => {
              if (event.target === event.currentTarget) setEditHistoryMessage(null);
            }}
          >
            <section className="message-details-card edit-history-card" role="dialog" aria-modal="true" aria-labelledby="edit-history-title">
              <div className="message-details-header">
                <strong id="edit-history-title">{appCopy.t('Lịch sử chỉnh sửa')}</strong>
                <button type="button" onClick={() => setEditHistoryMessage(null)} aria-label={appCopy.t('Đóng')}><i className="fa-solid fa-xmark"></i></button>
              </div>
              <div className="edit-history-current">
                <span>{appCopy.t('Nội dung hiện tại')}</span>
                <p>{renderMessageText(editHistoryMessage.text, editHistoryMessage.mentions)}</p>
              </div>
              <div className="edit-history-list">
                {(editHistoryMessage.editHistory || []).map((entry, index) => (
                  <article className="edit-history-entry" key={`${entry.eventId || entry.seq || entry.editedAt || 'entry'}-${index}`}>
                    <div className="edit-history-entry-heading">
                      <strong>{appCopy.t('Nội dung cũ')} {index + 1}</strong>
                      {entry.editedAt && <time>{formatFullMessageDateTime(entry.editedAt, '', appCopy.locale)}</time>}
                    </div>
                    <p>{renderMessageText(entry.text, entry.mentions)}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
        {reactionDetails && reactionDetailsMessage && (
          <div
            className="message-details-modal reaction-details-modal"
            role="presentation"
            onMouseDown={event => {
              if (event.target === event.currentTarget) setReactionDetails(null);
            }}
          >
            <section className="message-details-card reaction-details-card" role="dialog" aria-modal="true" aria-labelledby="reaction-details-title">
              <div className="message-details-header">
                <strong id="reaction-details-title">{appCopy.t('Cảm xúc trên tin nhắn')}</strong>
                <button type="button" onClick={() => setReactionDetails(null)} aria-label={appCopy.t('Đóng')}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              <p className="reaction-details-message-preview">
                {reactionDetailsMessage.text || reactionDetailsMessage.file?.name || appCopy.t('Tệp đính kèm')}
              </p>
              <div className="reaction-details-tabs" role="tablist" aria-label={appCopy.t('Lọc cảm xúc')}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={reactionDetailSelectedEmoji === 'all'}
                  className={reactionDetailSelectedEmoji === 'all' ? 'active' : ''}
                  onClick={() => setReactionDetails(previous => previous ? { ...previous, emoji: '' } : previous)}
                >
                  {appCopy.t('Tất cả')} <span>{Object.values(reactionDetailEmojiCounts).reduce((total, count) => total + Math.max(0, Number(count) || 0), 0)}</span>
                </button>
                {Object.entries(reactionDetailEmojiCounts)
                  .filter(([, count]) => Number(count) > 0)
                  .map(([emoji, count]) => (
                    <button
                      type="button"
                      role="tab"
                      key={emoji}
                      aria-selected={reactionDetailSelectedEmoji === emoji}
                      className={reactionDetailSelectedEmoji === emoji ? 'active' : ''}
                      onClick={() => setReactionDetails(previous => previous ? { ...previous, emoji } : previous)}
                    >
                      {emoji} <span>{count}</span>
                    </button>
                  ))}
              </div>
              <div className="reaction-details-list">
                {reactionDetailUsers.length > 0 ? reactionDetailUsers.map(user => (
                  <div className="reaction-details-user" key={user.id}>
                    <SafeAvatar src={user.avatar || ''} name={user.name} className="reaction-details-avatar" />
                    <span className="reaction-details-user-name">{user.name || appCopy.t('Thành viên')}</span>
                    {reactionDetailSelectedEmoji === 'all' && user.emojis.length > 0 && (
                      <span className="reaction-details-user-emojis">{user.emojis.join(' ')}</span>
                    )}
                  </div>
                )) : (
                  <p className="reaction-details-empty">{appCopy.t('Chưa có người thả cảm xúc')}</p>
                )}
              </div>
            </section>
          </div>
        )}
        {activeProfileContact && (
          <div className="profile-contact-modal" role="presentation" onMouseDown={event => {
            if (event.target === event.currentTarget) setProfileContact(null);
          }}>
            <section className="profile-contact-card" role="dialog" aria-modal="true" aria-labelledby="profile-contact-title">
              <div className="message-details-header">
                <strong>{appCopy.t('Thông tin cá nhân')}</strong>
                <button type="button" onClick={() => setProfileContact(null)} aria-label={appCopy.t('Đóng thông tin cá nhân')}><i className="fa-solid fa-xmark"></i></button>
              </div>
              <div className="profile-contact-hero">
                <SafeAvatar src={activeProfileContact.avatar} name={activeProfileContact.name} className="profile-contact-avatar" />
                <h2 id="profile-contact-title">{activeProfileContact.name}</h2>
                <span className={`profile-contact-status ${accountPresenceTone(activeProfileContact)}`}>{isAccountOnline(activeProfileContact) && <i className="fa-solid fa-circle"></i>}{accountPresenceLabel(activeProfileContact)}</span>
              </div>
              <div className="profile-contact-details">
                {activeProfileContact.username && <div className="profile-contact-row"><i className="fa-solid fa-at"></i><span><small>{appCopy.t('Tài khoản')}</small><strong>@{activeProfileContact.username.replace(/^@+/, '').split('@')[0]}</strong></span></div>}
                {activeProfileContact.title && <div className="profile-contact-row"><i className="fa-solid fa-briefcase"></i><span><small>{appCopy.t('Chức vụ')}</small><strong>{activeProfileContact.title}</strong></span></div>}
                {activeProfileContact.department && <div className="profile-contact-row"><i className="fa-solid fa-building"></i><span><small>{appCopy.t('Phòng ban')}</small><strong>{activeProfileContact.department}</strong></span></div>}
                {activeProfileContact.email && <div className="profile-contact-row"><i className="fa-regular fa-envelope"></i><span><small>Email</small><strong>{activeProfileContact.email}</strong></span></div>}
                {activeProfileContact.role && <div className="profile-contact-row"><i className="fa-solid fa-shield-halved"></i><span><small>{appCopy.t('Vai trò')}</small><strong>{activeProfileContact.role}</strong></span></div>}
              </div>
              {!activeProfileContact.isCurrentAccount && activeProfileContact.id && (
                <button type="button" className="btn-primary profile-contact-chat-button" onClick={() => {
                  const contact = findAccount(directoryAccounts, activeProfileContact.id) || activeProfileContact;
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
          <div className="message-details-modal" role="dialog" aria-modal="true" aria-labelledby="share-message-title" onClick={() => setShareMessage(null)}>
            <div className="message-share-card" onClick={event => event.stopPropagation()}>
              <div className="message-details-header"><strong id="share-message-title">{appCopy.t('Chia sẻ tin nhắn tới')}</strong><button type="button" onClick={() => setShareMessage(null)} aria-label={appCopy.t('Đóng')}><i className="fa-solid fa-xmark"></i></button></div>
              <div className="share-conversation-list">
                {Object.values(renderConversations).filter(room => room.id !== activeChat.id && !room.isChatbot).map(room => (
                  <button type="button" key={room.id} onClick={() => shareMessageTo(room)}>
                    <span className={`conv-avatar ${room.avatarClass || ''}`} aria-hidden="true"><ConversationAvatar room={room} /></span>
                    <span className="share-conversation-name">{room.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ==========================================================================
         CỘT 4: SIDEBAR DETAIL (Thông tin nhóm)
         ========================================================================== */}
      <ConversationErrorBoundary
        key={`${activeChat.id}:details`}
        scope="conversation details"
        fallback={<aside className="sidebar-detail conversation-render-error" role="alert">Conversation details unavailable.</aside>}
      >
      <aside id="conversation-details-sidebar" className={`sidebar-detail ${isDetailOpen ? 'open' : 'collapsed'} ${activeChat.isChatbot ? 'chatbot-detail-sidebar' : ''}`}>
        <div className="detail-header">
          <h3>{appCopy.t(activeChat.isChatbot ? 'Thông tin ViChat AI' : activeChat.isGroup ? 'Thông tin nhóm' : 'Thông tin cá nhân')}</h3>
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
              {activeChat.isGroup && activeChat.id !== 'empty' && canEditActiveGroupInfo && (
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
            <div className="group-name-line">
              <h3 className="group-name-large">{activeChat.name}</h3>
              {activeChat.isGroup && activeChat.id !== 'empty' && canEditActiveGroupInfo && (
                <button
                  type="button"
                  className="group-name-edit-button"
                  title={appCopy.t('Sửa tên nhóm')}
                  aria-label={appCopy.t('Sửa tên nhóm')}
                  onClick={openGroupRename}
                >
                  <i className="fa-solid fa-pen"></i>
                </button>
              )}
              {!activeChat.isGroup && !activeChat.isChatbot && activeDirectPeer && (
                <button
                  type="button"
                  className="group-name-edit-button contact-nickname-edit-button"
                  title={appCopy.t('Đổi tên gợi nhớ')}
                  aria-label={appCopy.t('Đổi tên gợi nhớ')}
                  onClick={openContactNicknameDialog}
                >
                  <i className="fa-solid fa-pen"></i>
                </button>
              )}
            </div>
          </div>

          {activeChat.isChatbot && (
            <section className="chatbot-detail-card" aria-label={appCopy.t('Thông tin ViChat AI')}>
              <div className="chatbot-detail-status">
                <span className="chatbot-detail-status-icon" aria-hidden="true"><i className="fa-solid fa-sparkles"></i></span>
                <span>
                  <strong>{appCopy.t(chatbotStatus)}</strong>
                  <small>{appCopy.t('Trợ lý tri thức doanh nghiệp')}</small>
                </span>
              </div>
              <p className="chatbot-detail-description">{appCopy.t(activeChat.description || 'Trợ lý AI dùng dữ liệu doanh nghiệp đã được phê duyệt.')}</p>
              <div className="chatbot-detail-capabilities">
                <div className="chatbot-detail-capability">
                  <i className="fa-solid fa-building-shield" aria-hidden="true"></i>
                  <span><strong>{appCopy.t('Phạm vi công ty')}</strong><small>{appCopy.t('Công ty được xác định tự động từ phiên đăng nhập của bạn.')}</small></span>
                </div>
                <div className="chatbot-detail-capability">
                  <i className="fa-solid fa-file-arrow-up" aria-hidden="true"></i>
                  <span><strong>{appCopy.t('Tài liệu từ cuộc trò chuyện')}</strong><small>{appCopy.t('File tài liệu gửi trên web được phân tích sau khi Tinode xác nhận gửi thành công.')}</small></span>
                </div>
                <div className="chatbot-detail-capability">
                  <i className="fa-solid fa-book-open-reader" aria-hidden="true"></i>
                  <span><strong>{appCopy.t('Nguồn kiểm chứng')}</strong><small>{appCopy.t('Nguồn tham khảo xuất hiện ngay dưới câu trả lời để dễ đối chiếu.')}</small></span>
                </div>
              </div>
            </section>
          )}

          {!activeChat.isChatbot && activeChat.id !== 'empty' && activeChat.isGroup && (
            <div className="group-detail-quick-actions" role="group" aria-label={appCopy.t('Thao tác nhóm')}>
              <button
                type="button"
                className={`group-detail-quick-action ${activeChatMuted ? 'active' : ''}`}
                onClick={handleConversationMuteToggle}
                disabled={isUpdatingNotificationMute}
              >
                <span className="group-detail-quick-icon"><i className={`fa-regular ${activeChatMuted ? 'fa-bell-slash' : 'fa-bell'}`}></i></span>
                <span>{appCopy.t('Tắt thông báo')}</span>
              </button>
              <button
                type="button"
                className={`group-detail-quick-action ${activeChat.pinned ? 'active' : ''}`}
                onClick={() => updateConversationPin(activeChat)}
              >
                <span className="group-detail-quick-icon"><i className="fa-solid fa-thumbtack"></i></span>
                <span>{appCopy.t(activeChat.pinned ? 'Bỏ ghim hội thoại' : 'Ghim hội thoại')}</span>
              </button>
              {isActiveGroupAdmin && (
                <button
                  type="button"
                  className={`group-detail-quick-action ${isGroupManagementOpen ? 'active' : ''}`}
                  onClick={openGroupManagement}
                  aria-expanded={isGroupManagementOpen}
                >
                  <span className="group-detail-quick-icon"><i className="fa-solid fa-users-gear"></i></span>
                  <span>{appCopy.t('Quản lý nhóm')}</span>
                </button>
              )}
            </div>
          )}

          {activeChat.isGroup && (
            <div className="detail-section">
              <h4 className="section-title">{appCopy.t('Quản trị viên')}</h4>
              <span className="admin-name">{activeAdminName}</span>
            </div>
          )}

          {activeChat.isGroup && (
            <section className={`detail-section group-board-section ${isGroupBoardOpen ? 'expanded' : ''}`}>
              {!isGroupBoardOpen ? (
                <button
                  type="button"
                  className="members-section-toggle group-board-toggle"
                  onClick={toggleGroupBoard}
                  aria-expanded={false}
                  aria-controls="group-board-panel"
                >
                  <span className="members-section-toggle-copy">
                    <strong><i className="fa-solid fa-square-poll-vertical" aria-hidden="true"></i>{appCopy.t('Bảng tin nhóm')}</strong>
                    <span className="members-section-summary">
                      <i className="fa-regular fa-rectangle-list" aria-hidden="true"></i>
                      {groupBoardPolls.length} {appCopy.t('cuộc bình chọn')}
                    </span>
                  </span>
                  <i className="fa-solid fa-chevron-down" aria-hidden="true"></i>
                </button>
              ) : (
                <div id="group-board-panel" className="group-board-panel">
                  <div className="group-board-expanded-heading">
                    <button
                      type="button"
                      className="group-members-back-button"
                      onClick={toggleGroupBoard}
                      aria-label={appCopy.t('Thu gọn')}
                      title={appCopy.t('Thu gọn')}
                    >
                      <i className="fa-solid fa-arrow-left" aria-hidden="true"></i>
                    </button>
                    <div className="group-board-heading-copy">
                      <strong>{appCopy.t('Bảng tin nhóm')}</strong>
                      <span>{groupBoardPolls.length} {appCopy.t('cuộc bình chọn')}</span>
                    </div>
                    {canCreatePollInActiveGroup && (
                      <button
                        type="button"
                        className="group-board-create-button"
                        onClick={openPollComposer}
                        title={appCopy.t('Tạo bình chọn')}
                        aria-label={appCopy.t('Tạo bình chọn')}
                      >
                        <i className="fa-solid fa-plus" aria-hidden="true"></i>
                      </button>
                    )}
                  </div>

                  {groupBoardPolls.length > 0 ? (
                    <div className="group-board-poll-list">
                      {groupBoardPolls.map(pollMessage => (
                        <article className="group-board-poll-item" key={pollMessage.id}>
                          <div className="group-board-poll-meta">
                            <span><i className="fa-solid fa-square-poll-vertical" aria-hidden="true"></i>{appCopy.t('Bình chọn')}</span>
                            <time dateTime={pollMessage.createdAt || undefined}>
                              {formatFullMessageDateTime(pollMessage.poll.lastActivityAt || pollMessage.createdAt, pollMessage.time, appCopy.locale)}
                            </time>
                          </div>
                          <PollMessageCard
                            message={pollMessage}
                            viewerIdentities={[viewerId, managementViewerId, currentUser?.id, currentUser?.uid, currentUser?.tinodeUid].filter(Boolean)}
                            groupMembers={activeGroupMembers}
                            copy={appCopy}
                            onVote={handlePollVote}
                            onAddOption={handlePollAddOption}
                            onLock={handlePollLock}
                          />
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="group-board-empty">
                      <span className="group-board-empty-icon"><i className="fa-regular fa-rectangle-list" aria-hidden="true"></i></span>
                      <strong>{appCopy.t('Chưa có cuộc bình chọn')}</strong>
                      <span>{appCopy.t('Các cuộc bình chọn trong nhóm sẽ hiển thị tại đây.')}</span>
                      {canCreatePollInActiveGroup && (
                        <button type="button" className="btn-primary group-board-empty-action" onClick={openPollComposer}>
                          <i className="fa-solid fa-plus" aria-hidden="true"></i>{appCopy.t('Tạo bình chọn')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {!activeChat.isChatbot && <div className={`detail-section members-section ${activeChat.isGroup ? 'group-members-section' : ''}`}>
            {activeChat.isGroup ? (
              isGroupMembersExpanded ? (
                <div className="group-members-expanded-heading">
                  <button
                    type="button"
                    className="group-members-back-button"
                    onClick={toggleGroupMembersSection}
                    aria-label={appCopy.t('Thu gọn')}
                    title={appCopy.t('Thu gọn')}
                  >
                    <i className="fa-solid fa-arrow-left" aria-hidden="true"></i>
                  </button>
                  <strong>{appCopy.t('Thành viên')}</strong>
                </div>
              ) : (
                <button
                  type="button"
                  className="members-section-toggle"
                  onClick={toggleGroupMembersSection}
                  aria-expanded={false}
                  aria-controls="group-members-panel"
                >
                  <span className="members-section-toggle-copy">
                    <strong>{appCopy.t('Thành viên nhóm')}</strong>
                    <span className="members-section-summary">
                      <i className="fa-solid fa-users" aria-hidden="true"></i>
                      {activeChatMembers.length} {appCopy.t('thành viên')}
                    </span>
                  </span>
                  <i className="fa-solid fa-chevron-down" aria-hidden="true"></i>
                </button>
              )
            ) : (
              <div className="members-section-heading">
                <h4 className="section-title">{appCopy.t('Thông tin cá nhân')}</h4>
              </div>
            )}

            {(!activeChat.isGroup || isGroupMembersExpanded) && (
              <div id={activeChat.isGroup ? 'group-members-panel' : undefined} className="members-section-body">
                {activeChat.isGroup && (
                  <>
                    <button
                      type="button"
                      className="btn-add-member group-member-add-trigger"
                      onClick={() => {
                        if (isGroupMemberPickerOpen) {
                          setIsGroupMemberPickerOpen(false);
                        } else {
                          openGroupMemberPicker();
                        }
                      }}
                      aria-expanded={isGroupMemberPickerOpen}
                    >
                      <i className="fa-solid fa-user-plus" aria-hidden="true"></i>
                      <span>{appCopy.t('Thêm thành viên')}</span>
                    </button>
                    {isGroupMemberPickerOpen && (
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
                    {canApproveActiveGroupMembers && (activePendingMembers.length > 0 || groupSettingEnabled(activeGroupSettings, 'approveMembers')) && (
                      <section className="pending-members-section" aria-labelledby="pending-members-heading">
                        <div className="members-list-heading pending-members-heading">
                          <strong id="pending-members-heading">
                            <i className="fa-solid fa-user-clock" aria-hidden="true"></i>
                            {appCopy.t('Danh sách cần duyệt')} ({activePendingMembers.length})
                          </strong>
                        </div>
                        {activePendingMembers.length > 0 ? (
                          <div className="members-list pending-members-list">
                            {activePendingMembers.map(member => {
                              const memberIdentity = String(member.id);
                              const isProcessing = approvingMemberId === memberIdentity;
                              return (
                                <div key={memberIdentity} className="member-item pending-member-item">
                                  <SafeAvatar src={member.avatar || ''} name={member.name} className="member-avatar" />
                                  <div className="member-info">
                                    <span className="member-name">{member.name}</span>
                                    <span className="member-status-text">{appCopy.t('Đang chờ duyệt')}</span>
                                  </div>
                                  <div className="pending-member-actions">
                                    <button
                                      type="button"
                                      className="pending-member-action approve"
                                      onClick={() => void handleGroupMemberApproval(member, true)}
                                      disabled={Boolean(approvingMemberId)}
                                      title={appCopy.t('Duyệt vào nhóm')}
                                      aria-label={`${appCopy.t('Duyệt vào nhóm')} ${member.name}`}
                                    >
                                      <i className={`fa-solid ${isProcessing ? 'fa-spinner fa-spin' : 'fa-check'}`} aria-hidden="true"></i>
                                    </button>
                                    <button
                                      type="button"
                                      className="pending-member-action reject"
                                      onClick={() => void handleGroupMemberApproval(member, false)}
                                      disabled={Boolean(approvingMemberId)}
                                      title={appCopy.t('Từ chối vào nhóm')}
                                      aria-label={`${appCopy.t('Từ chối vào nhóm')} ${member.name}`}
                                    >
                                      <i className={`fa-solid ${isProcessing ? 'fa-spinner fa-spin' : 'fa-xmark'}`} aria-hidden="true"></i>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="pending-members-empty">{appCopy.t('Chưa có thành viên chờ duyệt.')}</p>
                        )}
                      </section>
                    )}
                    <div className="members-list-heading">
                      <strong>{appCopy.t('Danh sách thành viên')} ({activeChatMembers.length})</strong>
                    </div>
                  </>
                )}
                <div className="members-list">
                  {roomMembers(activeChat).map((member, idx) => {
                    const memberIdentity = String(member.id || member.uid || member.tinodeUid || member.tinode_uid || member.name || idx);
                    const memberRole = groupRoleForIdentity(activeChat, member, directoryAccounts);
                    const canRemove = canRemoveGroupMember(activeChat, directoryAccounts, currentUser, member);
                    const canAppointDeputy = (usesManagementData || chatMode === 'demo')
                      && canAppointGroupDeputy(activeChat, directoryAccounts, currentUser, member);
                    const canRevokeDeputy = (usesManagementData || chatMode === 'demo')
                      && canRevokeGroupDeputy(activeChat, directoryAccounts, currentUser, member);
                    const canShowMemberMenu = canRemove || canAppointDeputy || canRevokeDeputy;
                    return (
                      <div key={memberIdentity} className={`member-item ${groupMemberMenuId === memberIdentity ? 'menu-open' : ''}`}>
                        <span className="member-avatar-wrap">
                          <SafeAvatar src={typeof member.avatar === 'string' ? member.avatar : ''} name={member.name} className="member-avatar" />
                          <GroupRoleBadge role={memberRole} copy={appCopy} />
                        </span>
                        <div className="member-info">
                          <span className="member-name">
                            {member.name}
                            {memberRole === 'OWNER' && <small className="member-role-label">{appCopy.t('Trưởng nhóm')}</small>}
                            {memberRole === 'ADMIN' && <small className="member-role-label">{appCopy.t('Phó nhóm')}</small>}
                          </span>
                          <span className="member-status-text">
                            {isAccountOnline(member) && <span className="status-dot online"></span>}
                            {accountPresenceLabel(member)}
                          </span>
                        </div>
                        {canShowMemberMenu && (
                          <div className="member-item-menu">
                            <button
                              type="button"
                              className="member-menu-trigger"
                              onClick={event => {
                                event.stopPropagation();
                                setGroupMemberMenuId(previous => previous === memberIdentity ? '' : memberIdentity);
                              }}
                              disabled={Boolean(removingMemberId || updatingGroupMemberRoleId)}
                              title={appCopy.t('Tùy chọn thành viên')}
                              aria-label={appCopy.t('Tùy chọn thành viên')}
                              aria-expanded={groupMemberMenuId === memberIdentity}
                            >
                              <i className="fa-solid fa-ellipsis" aria-hidden="true"></i>
                            </button>
                            {groupMemberMenuId === memberIdentity && (
                              <div className="member-context-menu" role="menu" onClick={event => event.stopPropagation()}>
                                {canAppointDeputy && (
                                  <button
                                    type="button"
                                    className="member-context-menu-item"
                                    role="menuitem"
                                    onClick={() => void handleGroupMemberRoleChange(member, 'ADMIN')}
                                    disabled={Boolean(removingMemberId || updatingGroupMemberRoleId)}
                                  >
                                    <i className={`fa-solid ${updatingGroupMemberRoleId === memberIdentity ? 'fa-spinner fa-spin' : 'fa-key'}`} aria-hidden="true"></i>
                                    <span>{appCopy.t('Bổ nhiệm phó nhóm')}</span>
                                  </button>
                                )}
                                {canRevokeDeputy && (
                                  <button
                                    type="button"
                                    className="member-context-menu-item"
                                    role="menuitem"
                                    onClick={() => void handleGroupMemberRoleChange(member, 'MEMBER')}
                                    disabled={Boolean(removingMemberId || updatingGroupMemberRoleId)}
                                  >
                                    <i className={`fa-solid ${updatingGroupMemberRoleId === memberIdentity ? 'fa-spinner fa-spin' : 'fa-key'}`} aria-hidden="true"></i>
                                    <span>{appCopy.t('Thu hồi quyền phó nhóm')}</span>
                                  </button>
                                )}
                                {canRemove && <button
                                  type="button"
                                  className="member-context-menu-item danger"
                                  role="menuitem"
                                  onClick={() => {
                                    setGroupMemberMenuId('');
                                    void handleRemoveGroupMember(member);
                                  }}
                                  disabled={Boolean(removingMemberId || updatingGroupMemberRoleId)}
                                >
                                  <i className={`fa-solid ${removingMemberId === memberIdentity ? 'fa-spinner fa-spin' : 'fa-user-minus'}`} aria-hidden="true"></i>
                                  <span>{appCopy.t('Xóa khỏi nhóm')}</span>
                                </button>}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>}

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
            {!activeChat.isChatbot && activeChat.id !== 'empty' && !activeChat.isGroup && (
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

            {!activeChat.isChatbot && activeChat.id !== 'empty' && !activeChat.isGroup && (
              <div className={`action-row direct-block-action ${activeChatBlockedByViewer ? 'active' : ''}`}>
                <div className="action-label">
                  <i className="fa-solid fa-user-slash"></i>
                  <span className="action-label-copy">
                    <strong>{appCopy.t('Chặn')}</strong>
                    {activeChatBlockedByViewer && <small>{appCopy.t('Bạn đã chặn tin nhắn')}</small>}
                  </span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={activeChatBlockedByViewer}
                    onChange={handleConversationDirectBlockToggle}
                    disabled={isUpdatingDirectBlock}
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
              <button type="button" className="btn-delete-conversation" onClick={() => void handleDeleteConversation()} disabled={isDeletingConversation}>
                <i className={`fa-solid ${isDeletingConversation ? 'fa-spinner fa-spin' : 'fa-trash-can'}`}></i>
                <span>{isDeletingConversation ? appCopy.t('Đang xóa...') : appCopy.t('Xóa cuộc trò chuyện')}</span>
              </button>
            )}
          </div>
        </div>
      </aside>
      </ConversationErrorBoundary>

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
        <div
          className="workspace-overlay"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !(workspacePanel === 'groups' && isCreatingGroup)) closeWorkspacePanel();
          }}
        >
          <section className={`workspace-panel ${workspacePanel === 'enterprise' ? 'enterprise-shell-panel' : ''} ${workspacePanel === 'settings' ? 'settings-shell-panel' : ''}`} role="dialog" aria-modal="true" aria-labelledby="workspace-panel-title" data-workspace-panel={workspacePanel}>
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
                      <div className="tenant-switcher" ref={tenantSwitcherRef} role="group" aria-label={appCopy.t('Chuyển công ty')}>
                        <span className="tenant-switcher-caption"><i className="fa-solid fa-building" aria-hidden="true"></i><span>{appCopy.t('Công ty')}</span></span>
                        <div className="tenant-switcher-control">
                          {currentTenantOption && (
                            <div className="tenant-switcher-current" title={currentTenantOption.name}>
                              <span className="tenant-switcher-current-icon">
                                <TenantLogo src={currentTenantOption.logo} name={currentTenantOption.name} version={currentTenantOption.logoVersion} />
                              </span>
                              <span className="tenant-switcher-current-copy">
                                <span className="tenant-switcher-current-name">
                                  <strong>{currentTenantOption.name}</strong>
                                  <button
                                    type="button"
                                    className="tenant-switcher-toggle"
                                    title={appCopy.t('Chọn công ty')}
                                    aria-label={appCopy.t('Chọn công ty')}
                                    aria-expanded={tenantSwitcherOpen}
                                    aria-controls="tenant-switcher-menu"
                                    aria-haspopup="menu"
                                    onClick={() => setTenantSwitcherOpen(previous => !previous)}
                                    disabled={isSwitchingTenant}
                                  >
                                    <i className={`fa-solid ${tenantSwitcherOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true"></i>
                                  </button>
                                </span>
                                <small>{appCopy.t('Đang dùng')}</small>
                              </span>
                            </div>
                          )}
                          {tenantSwitcherOpen && (
                            <div id="tenant-switcher-menu" className="tenant-switcher-menu" role="menu" aria-label={appCopy.t('Chọn công ty')}>
                              <div className="tenant-switcher-menu-list">
                                {tenantMenuOptions.length === 0 ? (
                                  <div className="tenant-switcher-empty" role="status">
                                    <i className="fa-solid fa-circle-info" aria-hidden="true"></i>
                                    <span>{appCopy.t('Chưa có công ty khác')}</span>
                                  </div>
                                ) : tenantMenuOptions.map(option => {
                                  const isCurrent = String(option.id) === currentTenantId;
                                  return (
                                    <button
                                      type="button"
                                      role="menuitemradio"
                                      key={option.id}
                                      className={`tenant-switcher-menu-option ${isCurrent ? 'current' : ''}`}
                                      title={option.name}
                                      aria-label={option.name}
                                      data-tenant-name={option.name}
                                      aria-checked={isCurrent}
                                      data-tenant-current={isCurrent ? 'true' : 'false'}
                                      onClick={() => requestTenantSwitch(option)}
                                      disabled={isSwitchingTenant || isCurrent}
                                    >
                                      <span className="tenant-switcher-menu-option-icon">
                                        <TenantLogo src={option.logo} name={option.name} version={option.logoVersion} />
                                      </span>
                                      <span className="tenant-switcher-menu-option-copy">
                                        <strong>{option.name}</strong>
                                        <small>{isCurrent ? appCopy.t('Đang dùng') : appCopy.t('Chọn')}</small>
                                      </span>
                                      {isCurrent && <i className="fa-solid fa-check tenant-switcher-menu-check" aria-hidden="true"></i>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                        {tenantSwitchNotice && <div className="tenant-switcher-notice" role="alert"><i className="fa-solid fa-triangle-exclamation"></i><span>{tenantSwitchNotice}</span></div>}
                        {isSwitchingTenant && <div className="tenant-switcher-loading"><i className="fa-solid fa-spinner vichat-loading-icon"></i>{appCopy.t('Đang chuyển công ty...')}</div>}
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
                  <span className={`profile-status ${isCurrentUserOnline ? '' : 'offline'}`}>{isCurrentUserOnline && <i className="fa-solid fa-circle"></i>} {appCopy.t(isCurrentUserOnline ? 'Trực tuyến' : 'Ngoại tuyến')}</span>
                </div>
                <div className="profile-details profile-readonly-details">
                  <div className="profile-detail-row"><i className="fa-solid fa-at"></i><div><small>{appCopy.t('Tên đăng nhập')}</small><strong>{profileAccount.username || appCopy.t('Chưa cập nhật')}</strong></div></div>
                  <div className="profile-detail-row"><i className="fa-solid fa-shield-halved"></i><div><small>{appCopy.t('Vai trò')}</small><strong>{profileAccount.role || appCopy.t('Thành viên')}</strong></div></div>
                  <div className="profile-detail-row profile-current-tenant"><i className="fa-solid fa-building"></i><div><small>{appCopy.t('Công ty hiện tại')}</small><strong>{profileAccount.tenantName || profileAccount.tenant_name || profileAccount.tenant?.name || appCopy.t('Chưa cập nhật')}</strong></div></div>
                </div>
                <form className="profile-edit-form" onSubmit={handleProfileSave}>
                  <label><span>{appCopy.t('Họ và tên')}</span><input value={profileForm.name} onChange={event => setProfileForm(previous => ({ ...previous, name: event.target.value }))} maxLength="255" required /></label>
                  <label><span>{appCopy.t('Email')}</span><input type="email" value={profileForm.email} onChange={event => setProfileForm(previous => ({ ...previous, email: event.target.value }))} maxLength="255" /></label>
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
                              <small className={`account-presence ${accountPresenceTone(contact)}`}>{accountPresenceLabel(contact)}{directoryUsernameMeta(contact)}</small>
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
                          <span className="workspace-list-copy"><strong>{contact.name}</strong><small className={`account-presence ${accountPresenceTone(contact)}`}>{accountPresenceLabel(contact)}{contact.id ? ` · ${contact.id}` : ''}</small></span>
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
                    {notifications.map(room => {
                      const roomUnread = conversationUnreadIndicators(room);
                      const roomMuted = isConversationMuted(room.notificationMutedUntil, notificationClock);
                      return (
                        <button type="button" className="workspace-list-item" key={room.id} onClick={() => { closeWorkspacePanel(); handleConversationSelect(room.id); }}>
                          <span className="workspace-file-icon"><i className="fa-solid fa-message"></i></span>
                          <span className="workspace-list-copy"><strong>{room.name}</strong><small>{localizedConversationPreview(room, appCopy, directoryAccounts, viewerId) || appCopy.t('Có cập nhật mới')} · {formatConversationListTime(room, displayClock, appCopy.locale)}</small></span>
                          {(roomMuted || roomUnread.hasMention || roomUnread.hasUnread) && (
                            <span className="workspace-conversation-indicators">
                              {roomMuted && <i className="fa-solid fa-bell-slash conv-muted-icon" title={notificationMuteLabel(room.notificationMutedUntil, notificationClock, appCopy.locale)} aria-label={appCopy.t('Đã tắt thông báo')}></i>}
                              {roomUnread.hasMention && <span className="conv-mention-indicator" title={appCopy.t('Bạn được nhắc đến')} aria-label={appCopy.t('Bạn được nhắc đến')}>@</span>}
                              {roomUnread.hasUnread && <span className="workspace-unread" aria-label={`${roomUnread.label} ${appCopy.t('Tin chưa đọc')}`}>{roomUnread.label}</span>}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {workspacePanel === 'search' && (
              <>
                <div className="workspace-search-row">
                  <i className="fa-solid fa-magnifying-glass"></i>
                  <input value={messageSearchQuery} onChange={event => setMessageSearchQuery(event.target.value)} placeholder={appCopy.t('Tìm nội dung hoặc người gửi...')} autoFocus />
                </div>
                <div className="history-search-filters" role="group" aria-label={appCopy.t('Bộ lọc tìm kiếm')}>
                  <label className="history-search-filter">
                    <span>{appCopy.t('Người gửi')}</span>
                    <select value={messageSearchSender} onChange={event => setMessageSearchSender(event.target.value)}>
                      <option value="all">{appCopy.t('Tất cả người gửi')}</option>
                      {messageSearchSenderOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </select>
                  </label>
                  <label className="history-search-filter">
                    <span>{appCopy.t('Loại')}</span>
                    <select value={messageSearchType} onChange={event => setMessageSearchType(event.target.value)}>
                      {HISTORY_SEARCH_TYPE_OPTIONS.map(option => <option key={option.id} value={option.id}>{appCopy.t(option.label)}</option>)}
                    </select>
                  </label>
                  <label className="history-search-filter">
                    <span>{appCopy.t('Từ ngày')}</span>
                    <input type="date" value={messageSearchFromDate} max={messageSearchToDate || undefined} onChange={event => setMessageSearchFromDate(event.target.value)} />
                  </label>
                  <label className="history-search-filter">
                    <span>{appCopy.t('Đến ngày')}</span>
                    <input type="date" value={messageSearchToDate} min={messageSearchFromDate || undefined} onChange={event => setMessageSearchToDate(event.target.value)} />
                  </label>
                </div>
                {!messageSearchHasFilters && <p className="workspace-hint history-search-hint"><i className="fa-solid fa-circle-info"></i>{appCopy.t('Nhập nội dung hoặc chọn bộ lọc để tìm toàn bộ lịch sử hội thoại.')}</p>}
                {messageSearchLoading && <div className="workspace-search-status"><i className="fa-solid fa-spinner fa-spin"></i>{appCopy.t('Đang tìm toàn bộ lịch sử...')}</div>}
                {messageSearchError && <div className="workspace-search-error" role="alert"><i className="fa-solid fa-circle-exclamation"></i>{messageSearchError}</div>}
                {messageSearchHasFilters && !messageSearchLoading && !messageSearchError && (
                  <p className="workspace-hint history-search-hint">
                    {canSearchConversationHistory ? messageSearchTotal : displayedHistorySearchResults.length} {appCopy.t('kết quả trong')} {activeChat.name}
                    {canSearchConversationHistory && messageSearchScanned > 0 && ` · ${appCopy.t('đã quét')} ${messageSearchScanned} ${appCopy.t('tin nhắn')}`}
                  </p>
                )}
                {messageSearchHasFilters && !messageSearchLoading && displayedHistorySearchResults.length === 0 && !messageSearchError && (
                  <div className="workspace-empty history-search-empty"><i className="fa-regular fa-message"></i><span>{appCopy.t('Không tìm thấy tin nhắn phù hợp.')}</span></div>
                )}
                {displayedHistorySearchResults.length > 0 && (
                  <div className="workspace-list history-search-results">
                    {displayedHistorySearchResults.map(message => (
                      <button type="button" className="workspace-list-item history-search-result" key={`${message.id}-${message.seq || ''}`} onClick={() => openMessageSearchResult(message)}>
                        <span className={`workspace-file-icon history-search-type-${message.type}`}><i className={`fa-solid ${message.type === 'sticker' ? 'fa-face-smile' : message.type === 'image' ? 'fa-image' : message.type === 'file' || message.type === 'document' || message.type === 'archive' ? 'fa-file' : message.type === 'video' ? 'fa-video' : message.type === 'audio' ? 'fa-microphone' : 'fa-message'}`}></i></span>
                        <span className="workspace-list-copy">
                          <strong>{message.senderName || appCopy.t('Thành viên')}</strong>
                          <small>{message.text || (message.type === 'sticker' ? appCopy.t('Sticker') : message.file?.name) || appCopy.t('Nội dung đính kèm')} · {formatFullMessageDateTime(message, message.time, appCopy.locale)} · {historySearchTypeLabel(message.type)}</small>
                        </span>
                        <i className="fa-solid fa-chevron-right history-search-open-icon" aria-hidden="true"></i>
                      </button>
                    ))}
                  </div>
                )}
                {canSearchConversationHistory && messageSearchHasMore && <button type="button" className="history-search-load-more" onClick={loadMoreMessageSearchResults} disabled={messageSearchLoading}><i className="fa-solid fa-clock-rotate-left"></i>{appCopy.t('Tải thêm lịch sử cũ')}</button>}
                {!canSearchConversationHistory && messageSearchHasFilters && chatMode === 'tinode' && usesManagementData && <p className="workspace-hint history-search-hint"><i className="fa-solid fa-cloud-arrow-down"></i>{appCopy.t('Đang hiển thị phần lịch sử đã tải; kết nối realtime để tìm toàn bộ.')}</p>}
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
                <section className="settings-card keyboard-shortcut-card" aria-labelledby="keyboard-shortcuts-title">
                  <div className="settings-card-heading keyboard-shortcut-heading">
                    <span className="settings-card-icon keyboard"><i className="fa-solid fa-keyboard"></i></span>
                    <div className="settings-card-heading-copy">
                      <h3 id="keyboard-shortcuts-title">{appCopy.keyboardShortcuts}</h3>
                      <p>{appCopy.keyboardShortcutsDescription}</p>
                    </div>
                    <label className="settings-toggle">
                      <input
                        type="checkbox"
                        checked={keyboardShortcutSettings.enabled}
                        onChange={event => updateKeyboardShortcutSettings({ ...keyboardShortcutSettings, enabled: event.target.checked })}
                        aria-label={appCopy.keyboardShortcutsEnabled}
                      />
                      <span className="settings-toggle-track" aria-hidden="true"><span></span></span>
                    </label>
                  </div>
                  <p className="keyboard-shortcut-hint"><i className="fa-solid fa-circle-info" aria-hidden="true"></i>{appCopy.keyboardShortcutsHint}</p>
                  <div className="keyboard-shortcut-list">
                    {SHORTCUT_ACTIONS.map(action => {
                      const binding = keyboardShortcutSettings.bindings[action.id];
                      const isCapturing = capturingShortcutAction === action.id;
                      return (
                        <div className="keyboard-shortcut-row" key={action.id}>
                          <div className="keyboard-shortcut-copy">
                            <strong>{appCopy[action.labelKey]}</strong>
                            <small>{appCopy[action.descriptionKey]}</small>
                          </div>
                          <button
                            type="button"
                            className={`keyboard-shortcut-capture ${isCapturing ? 'recording' : ''}`}
                            data-shortcut-action={action.id}
                            onClick={() => {
                              setCapturingShortcutAction(previous => previous === action.id ? '' : action.id);
                              setKeyboardShortcutNotice('');
                            }}
                            onBlur={() => setCapturingShortcutAction(previous => previous === action.id ? '' : previous)}
                            onKeyDown={isCapturing ? handleKeyboardShortcutCapture : undefined}
                            aria-label={`${appCopy[action.labelKey]}: ${formatShortcut(binding, appCopy.keyboardShortcutsNotAssigned)}`}
                            aria-pressed={isCapturing}
                          >
                            {isCapturing ? appCopy.keyboardShortcutsRecording : formatShortcut(binding, appCopy.keyboardShortcutsNotAssigned)}
                          </button>
                          <button
                            type="button"
                            className="keyboard-shortcut-icon-button"
                            onClick={() => resetKeyboardShortcut(action.id)}
                            title={appCopy.keyboardShortcutsReset}
                            aria-label={`${appCopy.keyboardShortcutsReset}: ${appCopy[action.labelKey]}`}
                          >
                            <i className="fa-solid fa-rotate-left" aria-hidden="true"></i>
                          </button>
                          {binding && (
                            <button
                              type="button"
                              className="keyboard-shortcut-icon-button clear"
                              onClick={() => clearKeyboardShortcut(action.id)}
                              title={appCopy.keyboardShortcutsClear}
                              aria-label={`${appCopy.keyboardShortcutsClear}: ${appCopy[action.labelKey]}`}
                            >
                              <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {keyboardShortcutNotice && (
                    <div className="keyboard-shortcut-notice" role="status">
                      <i className="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
                      {appCopy[keyboardShortcutNotice] || keyboardShortcutNotice}
                    </div>
                  )}
                  <button
                    type="button"
                    className="keyboard-shortcut-reset-all"
                    onClick={() => {
                      updateKeyboardShortcutSettings(DEFAULT_KEYBOARD_SHORTCUT_SETTINGS);
                      setCapturingShortcutAction('');
                    }}
                  >
                    <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>{appCopy.keyboardShortcutsReset}
                  </button>
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
                <section className="settings-card settings-inline-card sticker-suggestion-setting" aria-labelledby="sticker-suggestion-title">
                  <div className="settings-card-heading">
                    <span className="settings-card-icon sticker"><i className="fa-solid fa-face-smile"></i></span>
                    <div className="settings-card-heading-copy">
                      <h3 id="sticker-suggestion-title">{appCopy.stickerSuggestions}</h3>
                      <p>{appCopy.stickerSuggestionsDescription}</p>
                    </div>
                  </div>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={settings.stickerSuggestions}
                      onChange={event => updateNotificationSettings({ stickerSuggestions: event.target.checked })}
                      aria-label={appCopy.stickerSuggestionsEnabled}
                    />
                    <span className="settings-toggle-track" aria-hidden="true"><span></span></span>
                  </label>
                </section>
              </div>
            )}
          </section>
        </div>
      )}

      {isConversationBackgroundOpen && (
        <div
          className="modal-backdrop conversation-background-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !isSavingConversationBackground) setIsConversationBackgroundOpen(false);
          }}
        >
          <form
            className="group-modal conversation-background-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="conversation-background-title"
            onSubmit={handleConversationBackgroundApply}
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="group-modal-header conversation-background-header">
              <div>
                <h2 id="conversation-background-title">{appCopy.t('Đổi hình nền')}</h2>
              </div>
              <button
                type="button"
                className="btn-close-detail"
                onClick={() => setIsConversationBackgroundOpen(false)}
                aria-label={appCopy.t('Đóng')}
                disabled={isSavingConversationBackground}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {chatMode !== 'demo' && (
              <div className="conversation-background-scope" role="radiogroup" aria-label={appCopy.t('Phạm vi hình nền')}>
                <span className="conversation-background-scope-label">{appCopy.t('Hiển thị hình nền')}</span>
                <label className={`conversation-background-scope-option ${conversationBackgroundScope === CONVERSATION_BACKGROUND_SCOPES.LOCAL ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="conversation-background-scope"
                    value={CONVERSATION_BACKGROUND_SCOPES.LOCAL}
                    checked={conversationBackgroundScope === CONVERSATION_BACKGROUND_SCOPES.LOCAL}
                    onChange={() => selectConversationBackgroundScope(CONVERSATION_BACKGROUND_SCOPES.LOCAL)}
                    disabled={isSavingConversationBackground}
                  />
                  <span>
                    <strong>{appCopy.t('Chỉ mình tôi')}</strong>
                  </span>
                </label>
                <label className={`conversation-background-scope-option ${conversationBackgroundScope === CONVERSATION_BACKGROUND_SCOPES.SHARED ? 'selected' : ''} ${activeChat.isGroup && !canEditActiveGroupInfo ? 'locked' : ''}`}>
                  <input
                    type="radio"
                    name="conversation-background-scope"
                    value={CONVERSATION_BACKGROUND_SCOPES.SHARED}
                    checked={conversationBackgroundScope === CONVERSATION_BACKGROUND_SCOPES.SHARED}
                    onChange={() => selectConversationBackgroundScope(CONVERSATION_BACKGROUND_SCOPES.SHARED)}
                    disabled={isSavingConversationBackground}
                  />
                  <span>
                    <strong>{appCopy.t(activeChat.isGroup ? 'Chia sẻ với cả nhóm' : 'Chia sẻ với người bên kia')}</strong>
                  </span>
                  {activeChat.isGroup && !canEditActiveGroupInfo && <i className="fa-solid fa-lock" aria-hidden="true"></i>}
                </label>
              </div>
            )}

            <div className="conversation-background-grid" role="listbox" aria-label={appCopy.t('Hình nền có sẵn')}>
              <button
                type="button"
                className={`conversation-background-tile default ${!conversationBackgroundSelection ? 'selected' : ''}`}
                onClick={clearConversationBackgroundSelection}
                role="option"
                aria-selected={!conversationBackgroundSelection}
              >
                <span className="conversation-background-preview default-preview"><i className="fa-solid fa-ban"></i></span>
                <span>{appCopy.t('Mặc định')}</span>
              </button>
              {CONVERSATION_BACKGROUND_PRESETS.map(preset => (
                <button
                  type="button"
                  className={`conversation-background-tile ${conversationBackgroundSelection?.id === preset.id ? 'selected' : ''}`}
                  key={preset.id}
                  onClick={() => selectConversationBackgroundPreset(preset)}
                  role="option"
                  aria-selected={conversationBackgroundSelection?.id === preset.id}
                >
                  <span className="conversation-background-preview" style={{ backgroundImage: `url("${preset.url}")` }}></span>
                  <span>{appCopy.t(preset.label)}</span>
                  {conversationBackgroundSelection?.id === preset.id && <i className="conversation-background-check fa-solid fa-check"></i>}
                </button>
              ))}
            </div>

            <div className={`conversation-background-upload ${conversationBackgroundSelection?.kind === 'custom' ? 'selected' : ''}`}>
              <div className="conversation-background-upload-preview">
                {conversationBackgroundSelection?.kind === 'custom' && conversationBackgroundSelection.url && !conversationBackgroundSelection.url.startsWith('indexeddb://') ? (
                  <img src={conversationBackgroundSelection.url} alt="" />
                ) : (
                  <i className="fa-solid fa-image"></i>
                )}
              </div>
              <div className="conversation-background-upload-copy">
                <strong>{appCopy.t('Ảnh từ máy tính')}</strong>
                {conversationBackgroundSelection?.kind === 'custom' && <span>{conversationBackgroundSelection.label}</span>}
              </div>
              <label className="conversation-background-upload-button">
                <i className="fa-solid fa-upload"></i>{appCopy.t('Tải ảnh lên')}
                <input
                  ref={conversationBackgroundFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleConversationBackgroundFileChange}
                  disabled={isSavingConversationBackground}
                />
              </label>
            </div>
            {conversationBackgroundNotice && <div className="conversation-background-notice" role="alert"><i className="fa-solid fa-circle-info"></i><span>{appCopy.t(conversationBackgroundNotice)}</span></div>}

            <div className="group-modal-footer conversation-background-footer">
              <div className="group-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsConversationBackgroundOpen(false)} disabled={isSavingConversationBackground}>{appCopy.t('Hủy')}</button>
                <button type="submit" className="btn-primary" disabled={isSavingConversationBackground}>
                  {isSavingConversationBackground ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                  {isSavingConversationBackground ? appCopy.t('Đang áp dụng...') : appCopy.t('Áp dụng')}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {pendingGroupLeaveRoom?.isGroup && (
        <div className="modal-backdrop group-leave-backdrop" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) closeGroupLeaveDialog();
        }}>
          <form
            className="group-modal group-leave-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-leave-title"
            onSubmit={handleGroupLeaveSubmit}
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="group-modal-header">
              <div>
                <span className="group-modal-kicker">{appCopy.t(groupLeaveMembers.length > 0 ? 'CHUYỂN QUYỀN NHÓM' : 'RỜI NHÓM')}</span>
                <h2 id="group-leave-title">{appCopy.t(groupLeaveMembers.length > 0 ? 'Chọn trưởng nhóm mới' : 'Rời nhóm cuối cùng')}</h2>
              </div>
              <button type="button" className="btn-close-detail" onClick={closeGroupLeaveDialog} aria-label={appCopy.t('Đóng')} disabled={isLeavingGroup}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="group-leave-intro">
              <span className="group-leave-intro-icon"><i className="fa-solid fa-user-shield"></i></span>
              <div>
                <strong>{appCopy.t('Bạn đang là trưởng nhóm')}</strong>
                <p>{appCopy.t(groupLeaveMembers.length > 0
                  ? 'Hãy chọn một thành viên còn lại làm trưởng nhóm mới trước khi rời nhóm. Người được chọn sẽ nhận đầy đủ quyền quản trị như bạn.'
                  : 'Bạn là thành viên cuối cùng. Rời nhóm sẽ đóng nhóm này.')}</p>
              </div>
            </div>

            {groupLeaveMembers.length > 0 && (
              <label className="group-form-field group-leave-search-field">
                <span>{appCopy.t('Tìm thành viên')}</span>
                <div className="group-leave-search-wrap">
                  <i className="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                  <input
                    value={groupLeaveSearch}
                    onChange={event => setGroupLeaveSearch(event.target.value)}
                    placeholder={appCopy.t('Tìm theo tên hoặc tài khoản')}
                    aria-label={appCopy.t('Tìm thành viên')}
                    autoFocus
                    disabled={isLeavingGroup}
                  />
                </div>
              </label>
            )}

            <div className="group-leave-list" role="radiogroup" aria-label={appCopy.t('Danh sách thành viên có thể làm trưởng nhóm')}>
              {groupLeaveCandidates.length > 0 ? groupLeaveCandidates.map(member => {
                const memberId = String(member.id || member.uid || member.tinodeUid || member.name);
                const selected = groupLeaveReplacementId === memberId;
                return (
                  <label className={`group-leave-member ${selected ? 'selected' : ''}`} key={memberId}>
                    <input
                      type="radio"
                      name="group-leave-replacement"
                      value={memberId}
                      checked={selected}
                      onChange={() => {
                        setGroupLeaveReplacementId(memberId);
                        setGroupLeaveReplacementName(member.name || memberId);
                        setGroupLeaveNotice('');
                      }}
                      disabled={isLeavingGroup}
                    />
                    <SafeAvatar src={member.avatar || ''} name={member.name} className="group-leave-member-avatar" />
                    <span className="group-leave-member-copy">
                      <strong>{member.name}</strong>
                      <small>{directoryUsernameMeta(member) || appCopy.t('Thành viên trong nhóm')}</small>
                    </span>
                    <span className="group-leave-radio-indicator"><i className="fa-solid fa-check"></i></span>
                  </label>
                );
              }) : (
                <p className="group-form-hint group-leave-empty">
                  {groupLeaveSearch.trim()
                    ? appCopy.t('Không tìm thấy thành viên phù hợp.')
                    : appCopy.t('Không còn thành viên khác. Bạn có thể rời nhóm và nhóm sẽ được đóng.')}
                </p>
              )}
            </div>

            <p className="group-leave-notice" role="status">
              <i className="fa-solid fa-circle-info"></i>
              <span>{appCopy.t(groupLeaveMembers.length > 0
                ? 'Việc chuyển quyền và rời nhóm sẽ được thông báo tới mọi thành viên.'
                : 'Nhóm sẽ được đóng vì không còn thành viên nào sau khi bạn rời.')}</span>
            </p>
            {groupLeaveNotice && <div className="group-management-notice error" role="alert"><i className="fa-solid fa-circle-exclamation"></i>{appCopy.t(groupLeaveNotice)}</div>}

            <div className="group-modal-footer actions-only">
              <div className="group-modal-actions">
                <button type="button" className="btn-secondary" onClick={closeGroupLeaveDialog} disabled={isLeavingGroup}>{appCopy.t('Hủy')}</button>
                <button type="submit" className="btn-primary" disabled={isLeavingGroup || (groupLeaveMembers.length > 0 && !groupLeaveReplacementId)}>
                  {isLeavingGroup ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-arrow-right-from-bracket"></i>}
                  {isLeavingGroup
                    ? appCopy.t(groupLeaveMembers.length > 0 ? 'Đang chuyển quyền...' : 'Đang rời nhóm...')
                    : appCopy.t(groupLeaveMembers.length > 0 ? 'Chuyển quyền và rời nhóm' : 'Rời nhóm và đóng nhóm')}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <ConversationCategoryManager
        open={conversationCategoryManagerOpen}
        categories={conversationCategoryOptions}
        assignments={conversationCategories}
        conversations={categoryManagerConversations}
        copy={appCopy}
        onClose={() => setConversationCategoryManagerOpen(false)}
        onSave={saveManagedConversationCategory}
        onDelete={deleteManagedConversationCategory}
        onReorder={reorderManagedConversationCategories}
      />

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

      {contactNicknameDialog && !activeChat.isGroup && (
        <div className="modal-backdrop contact-nickname-backdrop" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget && !isSavingContactNickname) setContactNicknameDialog(null);
        }}>
          <form
            className="group-modal contact-nickname-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-nickname-title"
            onSubmit={handleContactNicknameSubmit}
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="group-modal-header contact-nickname-header">
              <div>
                <span className="group-modal-kicker">{appCopy.t('Thông tin hội thoại')}</span>
                <h2 id="contact-nickname-title">{appCopy.t('Đặt tên gợi nhớ')}</h2>
              </div>
              <button type="button" className="btn-close-detail" onClick={() => setContactNicknameDialog(null)} aria-label={appCopy.t('Đóng')} disabled={isSavingContactNickname}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="contact-nickname-hero">
              <SafeAvatar src={contactNicknameDialog.avatar || ''} name={contactNicknameDialog.defaultName} className="contact-nickname-avatar" />
              <p>
                {appCopy.t('Hãy đặt cho')} <strong>{contactNicknameDialog.defaultName}</strong> {appCopy.t('một cái tên để nhớ.')}
              </p>
              <small>{appCopy.t('Lưu ý: Tên gợi nhớ sẽ chỉ hiển thị riêng với bạn.')}</small>
            </div>
            <label className="group-form-field contact-nickname-field">
              <span>{appCopy.t('Tên gợi nhớ')}</span>
              <input
                value={contactNicknameValue}
                onChange={event => setContactNicknameValue(event.target.value.slice(0, 80))}
                placeholder={contactNicknameDialog.defaultName}
                maxLength={80}
                autoFocus
                disabled={isSavingContactNickname}
              />
            </label>
            <div className="group-modal-footer actions-only">
              <div className="group-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setContactNicknameDialog(null)} disabled={isSavingContactNickname}>{appCopy.t('Hủy')}</button>
                <button type="submit" className="btn-primary" disabled={isSavingContactNickname}>
                  {isSavingContactNickname ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                  {isSavingContactNickname ? appCopy.t('Đang lưu tên gợi nhớ...') : appCopy.t('Lưu tên gợi nhớ')}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {isGroupManagementOpen && activeChat.isGroup && (
        <div className="modal-backdrop group-management-backdrop" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget && !isUpdatingGroupManagement && !isDissolvingGroup) setIsGroupManagementOpen(false);
        }}>
          <form
            className="group-modal group-management-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-management-title"
            onSubmit={handleGroupManagementSubmit}
          >
            <div className="group-modal-header">
              <div>
                <span className="group-modal-kicker">{appCopy.t('QUẢN TRỊ NHÓM')}</span>
                <h2 id="group-management-title">{appCopy.t('Quản lý nhóm')}</h2>
              </div>
              <button type="button" className="btn-close-detail" onClick={() => setIsGroupManagementOpen(false)} aria-label={appCopy.t('Đóng')} disabled={isUpdatingGroupManagement || isDissolvingGroup}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <p className="group-management-intro"><i className="fa-solid fa-shield-halved"></i>{appCopy.t('Chỉ quản trị viên của nhóm mới có thể thay đổi các thiết lập này.')}</p>
            <div className="group-management-list">
              {GROUP_MANAGEMENT_OPTIONS.map(option => (
                <label className="group-management-option" key={option.key}>
                  <span className="group-management-option-icon"><i className={`fa-solid ${option.icon}`}></i></span>
                  <span className="group-management-option-copy">
                    <strong>{appCopy.t(option.label)}</strong>
                    <small>{appCopy.t(option.description)}</small>
                  </span>
                  <span className="switch group-management-switch">
                    <input
                      type="checkbox"
                      checked={groupManagementDraft[option.key] === true}
                      onChange={event => setGroupManagementDraft(previous => ({ ...previous, [option.key]: event.target.checked }))}
                      disabled={isUpdatingGroupManagement || isDissolvingGroup}
                    />
                    <span className="slider round"></span>
                  </span>
                </label>
              ))}
            </div>
            {groupManagementNotice && <div className="group-management-notice" role="status"><i className="fa-solid fa-circle-check"></i>{appCopy.t(groupManagementNotice)}</div>}
            {isActiveGroupOwner && (
              <div className="group-management-danger-zone">
                <div className="group-management-danger-copy">
                  <strong>{appCopy.t('Giải tán nhóm')}</strong>
                  <small>{appCopy.t('Đưa tất cả thành viên ra khỏi nhóm và đóng cuộc trò chuyện này.')}</small>
                </div>
                <button type="button" className="group-dissolve-button" onClick={handleDissolveGroup} disabled={isUpdatingGroupManagement || isDissolvingGroup}>
                  {isDissolvingGroup ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-trash-can"></i>}
                  {isDissolvingGroup ? appCopy.t('Đang giải tán...') : appCopy.t('Giải tán nhóm')}
                </button>
              </div>
            )}
            <div className="group-modal-footer actions-only">
              <div className="group-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsGroupManagementOpen(false)} disabled={isUpdatingGroupManagement || isDissolvingGroup}>{appCopy.t('Đóng')}</button>
                <button type="submit" className="btn-primary" disabled={isUpdatingGroupManagement || isDissolvingGroup}>
                  {isUpdatingGroupManagement ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                  {isUpdatingGroupManagement ? appCopy.t('Đang lưu...') : appCopy.t('Lưu thiết lập')}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {isGroupRenameOpen && activeChat.isGroup && canEditActiveGroupInfo && (
        <div className="modal-backdrop group-rename-backdrop" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget && !isRenamingGroup) setIsGroupRenameOpen(false);
        }}>
          <form className="group-modal group-rename-modal" role="dialog" aria-modal="true" aria-labelledby="group-rename-title" onSubmit={handleGroupRenameSubmit}>
            <div className="group-modal-header">
              <div>
                <span className="group-modal-kicker">{appCopy.t('THÔNG TIN NHÓM')}</span>
                <h2 id="group-rename-title">{appCopy.t('Sửa tên nhóm')}</h2>
              </div>
              <button type="button" className="btn-close-detail" onClick={() => setIsGroupRenameOpen(false)} aria-label={appCopy.t('Đóng')} disabled={isRenamingGroup}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <label className="group-form-field">
              <span>{appCopy.t('Tên nhóm')}</span>
              <input value={groupRenameValue} onChange={event => setGroupRenameValue(event.target.value.slice(0, 120))} autoFocus required disabled={isRenamingGroup} />
            </label>
            <div className="group-modal-footer actions-only">
              <div className="group-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsGroupRenameOpen(false)} disabled={isRenamingGroup}>{appCopy.t('Hủy')}</button>
                <button type="submit" className="btn-primary" disabled={isRenamingGroup || !groupRenameValue.trim()}>
                  {isRenamingGroup ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                  {isRenamingGroup ? appCopy.t('Đang lưu...') : appCopy.t('Lưu tên nhóm')}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {pendingTenantSwitch && (
        <div className="modal-backdrop tenant-switch-confirm-backdrop" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) setPendingTenantSwitch(null);
        }}>
          <section
            className="group-modal tenant-switch-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tenant-switch-confirm-title"
            aria-describedby="tenant-switch-confirm-description"
          >
            <div className="group-modal-header">
              <div>
                <span className="group-modal-kicker">{appCopy.t('Chuyển công ty')}</span>
                <h2 id="tenant-switch-confirm-title">{appCopy.t('Xác nhận chuyển công ty')}</h2>
              </div>
              <button type="button" className="btn-close-detail" onClick={() => setPendingTenantSwitch(null)} aria-label={appCopy.t('Đóng')}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="tenant-switch-confirm-summary">
              <span className="tenant-switch-confirm-logo">
                <TenantLogo src={pendingTenantSwitch.logo} name={pendingTenantSwitch.name} version={pendingTenantSwitch.logoVersion} />
              </span>
              <div className="tenant-switch-confirm-copy">
                <p id="tenant-switch-confirm-description">{appCopy.t('Bạn có muốn chuyển sang công ty này không?')}</p>
                <strong>{pendingTenantSwitch.name || appCopy.t('Công ty được chọn')}</strong>
              </div>
            </div>

            <div className="group-modal-footer actions-only">
              <div className="group-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setPendingTenantSwitch(null)}>{appCopy.t('Hủy')}</button>
                <button type="button" className="btn-primary" onClick={confirmTenantSwitch} disabled={isSwitchingTenant}>
                  {isSwitchingTenant ? <i className="fa-solid fa-spinner fa-spin"></i> : appCopy.t('Chuyển sang công ty này')}
                </button>
              </div>
            </div>
          </section>
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
