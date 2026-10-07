import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { getRecordingPermissionsAsync, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, type AudioRecorder } from 'expo-audio';
import { ArrowDown, BarChart3, BookOpen, Camera, ChevronLeft, CircleStop, FilePlus2, Image as ImageLucide, ImagePlus, Info, MessageCircle, Mic, MoreHorizontal, Pencil, Search, Send, ShieldCheck, Phone, Smile, SmilePlus, User as UserIcon, Video, WifiOff, X } from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore, getConversation } from '../../store/appStore';
import { ThemeColors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { useThemePalette } from '../../theme/useThemePalette';
import { Avatar } from '../../components/Avatar';
import { ConversationNicknameModal } from '../../components/ConversationNicknameModal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { MessageBubble } from '../../components/MessageBubble';
import { MessageActionSheet } from '../../components/MessageActionSheet';
import { PinnedMessageBar } from '../../components/PinnedMessageBar';
import { PinnedMessagesModal } from '../../components/PinnedMessagesModal';
import { TypingIndicator } from '../../components/TypingIndicator';
import { Sticker, ChatMessage, ContactCardAttachment, ConversationMember, LocationAttachment, PickerFile, Poll, RecallMode, User } from '../../types';
import { StickerPicker } from '../../components/StickerPicker';
import { ChatMorePanel } from '../../components/ChatMorePanel';
import { QuickMessagesModal } from '../../components/QuickMessagesModal';
import { ContactPickerModal } from '../../components/ContactPickerModal';
import { LocationPickerModal } from '../../components/LocationPickerModal';
import { liveLocationService } from '../../services/liveLocationService';
import { DoodleModal } from '../../components/DoodleModal';
import { GifPickerModal } from '../../components/GifPickerModal';
import { TextFormatBar, formatMarkdown, TextFormatType } from '../../components/TextFormatBar';
import { GroupEventComposer } from '../../components/GroupEventComposer';
import { attachmentValidationError, canEditMessage, canInteractWithMessage } from '../../utils/messagePolicy';
import { directPeerOnline } from '../../utils/tinodeState';
import { formatMessageDateLabel } from '../../utils/timeFormatting';
import { beginTrustedExternalActivity } from '../../services/appLifecycleService';
import { tinodeClient } from '../../services/tinodeClient';
import { useCallStore } from '../../store/callStore';
import { PollComposer } from '../../components/PollComposer';
import { groupSettingEnabled, memberIsAdmin, memberIsOwner } from '../../utils/groupSettings';
import { pollCanViewerLock } from '../../utils/poll';
import { getMentionContext, insertMentionAt, matchesMentionCandidate, mentionTokenFor, mentionTokenExists, serializeMentionForTransport } from '../../utils/mentionPolicy';
import { accountIdForMember, identitiesOverlap } from '../../utils/identity';
import { conversationNicknameForMember } from '../../utils/conversationSync';
import { CHAT_BOTTOM_THRESHOLD, firstUnreadMessageIndex, isNearChatBottom, isUserVisibleMessage, messageKey } from '../../utils/chatScroll';
import { useI18n } from '../../store/languageStore';
import { translationKey, useTranslationStore } from '../../store/translationStore';
import { defaultTranslationTarget } from '../../services/translationService';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatDetail'>;

// Native list anchoring keeps the visible message stable while Tinode prepends
// history or publishes a fresh snapshot.
const CHAT_MAINTAIN_VISIBLE_CONTENT_POSITION = {
  minIndexForVisible: 0,
};

const AI_STARTERS = [
  'Tóm tắt quy trình nghỉ phép và các bước cần thực hiện.',
  'Các chính sách quan trọng mà nhân viên mới cần biết là gì?',
  'Tìm tài liệu liên quan đến quy trình phê duyệt công việc.',
];

function formatVoiceDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(Number(durationMs || 0) / 1000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function ChatDetailScreen({ route, navigation }: Props) {
  const palette = useThemePalette();
  const styles = createStyles(palette);
  const { language, t, locale } = useI18n();
  const conversation = useAppStore(state => getConversation(state.conversations, route.params.conversationId));
  const session = useAppStore(state => state.session);
  const directory = useAppStore(state => state.directory);
  const connection = useAppStore(state => state.connection);
  const reconnect = useAppStore(state => state.reconnect);
  const typing = useAppStore(state => state.typingByTopic[conversation?.tinodeTopic || '']);
  const openConversation = useAppStore(state => state.openConversation);
  const loadEarlier = useAppStore(state => state.loadEarlier);
  const setActiveConversation = useAppStore(state => state.setActiveConversation);
  const markRead = useAppStore(state => state.markRead);
  const sendText = useAppStore(state => state.sendText);
  const sendFile = useAppStore(state => state.sendFile);
  const sendVoice = useAppStore(state => state.sendVoice);
  const sendSticker = useAppStore(state => state.sendSticker);
  const sendLocation = useAppStore(state => state.sendLocation);
  const sendContactCard = useAppStore(state => state.sendContactCard);
  const createGroupEvent = useAppStore(state => state.createGroupEvent);
  const sendReaction = useAppStore(state => state.sendReaction);
  const createPoll = useAppStore(state => state.createPoll);
  const votePoll = useAppStore(state => state.votePoll);
  const addPollOption = useAppStore(state => state.addPollOption);
  const lockPoll = useAppStore(state => state.lockPoll);
  const toggleMessagePin = useAppStore(state => state.toggleMessagePin);
  const updateConversationNickname = useAppStore(state => state.updateConversationNickname);
  const recallMessage = useAppStore(state => state.recallMessage);
  const startCall = useCallStore(state => state.startCall);
  const activeCall = useCallStore(state => state.call);
  const translationTarget = useTranslationStore(state => state.targets[route.params.conversationId]);
  const translateMessage = useTranslationStore(state => state.translateMessage);
  const translateConversation = useTranslationStore(state => state.translateConversation);
  const hideTranslation = useTranslationStore(state => state.hideTranslation);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [offlineBannerVisible, setOfflineBannerVisible] = useState(connection !== 'connected');
  const [error, setError] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [recallTarget, setRecallTarget] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ message: ChatMessage; previousText: string; previousReply?: ChatMessage['replyTo'] } | null>(null);
  const [editHistoryMessage, setEditHistoryMessage] = useState<ChatMessage | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage['replyTo']>();
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);

  const currentMember = conversation?.members?.find(member => identitiesOverlap(member, session?.user));
  const isOwner = Boolean(currentMember && memberIsOwner(currentMember))
    || identitiesOverlap({ id: conversation?.adminId, uid: conversation?.adminId }, session?.user);
  const isAdmin = isOwner || Boolean(currentMember && memberIsAdmin(currentMember));
  const groupPolicyMessagesAllowed = !conversation?.isGroup || isAdmin || groupSettingEnabled(conversation?.groupSettings, 'allowMessages');
  const groupLockedForViewer = Boolean(conversation?.isGroup && !groupPolicyMessagesAllowed);
  const isZaloConversation = Boolean(
    conversation?.channel === 'zalo_oa'
    || conversation?.channelType === 'zalo_oa'
    || conversation?.id?.startsWith('zalo:')
  );
  const realtimeReady = isZaloConversation || (connection === 'connected' && Boolean(conversation?.tinodeTopic));
  const canCreatePoll = Boolean(realtimeReady && conversation?.isGroup && (isAdmin || groupSettingEnabled(conversation?.groupSettings, 'allowPolls')));
  const canSendMessages = isZaloConversation || Boolean(realtimeReady && groupPolicyMessagesAllowed);
  const canPinMessages = Boolean(realtimeReady && (!conversation?.isGroup || isAdmin || groupSettingEnabled(conversation?.groupSettings, 'allowPinMessages')));

  useEffect(() => {
    const hideSub = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidShow' : 'keyboardWillShow',
      () => {
        setMorePanelOpen(false);
      }
    );
    return () => hideSub.remove();
  }, []);
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [morePanelOpen, setMorePanelOpen] = useState(false);
  const [quickMessagesOpen, setQuickMessagesOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [activeLiveSession, setActiveLiveSession] = useState(() => liveLocationService.getActiveSession());

  useEffect(() => {
    return liveLocationService.subscribe(session => {
      setActiveLiveSession(session);
    });
  }, []);
  const [doodleModalOpen, setDoodleModalOpen] = useState(false);
  const [gifModalOpen, setGifModalOpen] = useState(false);
  const [textFormatBarOpen, setTextFormatBarOpen] = useState(false);
  const [groupEventModalOpen, setGroupEventModalOpen] = useState(false);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [mentionContext, setMentionContext] = useState<{ start: number; end: number; query: string } | null>(null);
  const [selectedMentions, setSelectedMentions] = useState<any[]>([]);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [hasEarlier, setHasEarlier] = useState(true);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [unreadJumpDismissed, setUnreadJumpDismissed] = useState(false);
  const [unreadJumpTarget, setUnreadJumpTarget] = useState<{ key: string; count: number } | null>(null);
  const [pinnedListModalOpen, setPinnedListModalOpen] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nicknameMember, setNicknameMember] = useState<ConversationMember | null>(null);
  const [topicOpenReady, setTopicOpenReady] = useState(false);
  const composerTextRef = useRef('');
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const listHasLaidOut = useRef(false);
  const listNearBottom = useRef(true);
  const listMetricsRef = useRef({ offsetY: 0, contentHeight: 0, viewportHeight: 0 });
  const historyAnchorRef = useRef<{ offsetY: number; contentHeight: number } | null>(null);
  const historyAnchorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialScrollDoneRef = useRef(false);
  const initialRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestMessageKeyRef = useRef('');
  const lastMarkedReadSeqRef = useRef(0);
  const markingReadRef = useRef(false);
  const loadingEarlierRef = useRef(false);
  const historyLoadArmedRef = useRef(true);
  const userScrollSessionRef = useRef(false);
  const userScrollResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userScrollStartOffsetRef = useRef(0);
  const userScrollMovedTowardHistoryRef = useRef(false);
  const openedConversationRef = useRef('');
  const openReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const recordingRef = useRef<AudioRecorder | null>(null);
  const recordingStartTimeRef = useRef(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingAt = useRef(0);

  useEffect(() => {
    if (openReadyTimerRef.current) {
      clearTimeout(openReadyTimerRef.current);
      openReadyTimerRef.current = null;
    }
    if (historyAnchorTimerRef.current) {
      clearTimeout(historyAnchorTimerRef.current);
      historyAnchorTimerRef.current = null;
    }
    if (userScrollResetTimerRef.current) {
      clearTimeout(userScrollResetTimerRef.current);
      userScrollResetTimerRef.current = null;
    }
    if (initialRevealTimerRef.current) {
      clearTimeout(initialRevealTimerRef.current);
      initialRevealTimerRef.current = null;
    }
    historyAnchorRef.current = null;
    setHasEarlier(true);
    listHasLaidOut.current = false;
    listNearBottom.current = true;
    listMetricsRef.current = { offsetY: 0, contentHeight: 0, viewportHeight: 0 };
    initialScrollDoneRef.current = false;
    latestMessageKeyRef.current = '';
    lastMarkedReadSeqRef.current = 0;
    markingReadRef.current = false;
    // Do not interpret the list's initial offset (normally zero while rows
    // measure) as a user reaching the history boundary.
    historyLoadArmedRef.current = false;
    userScrollSessionRef.current = false;
    userScrollStartOffsetRef.current = 0;
    userScrollMovedTowardHistoryRef.current = false;
    setTopicOpenReady(false);
    setIsNearBottom(true);
    setNewMessageCount(0);
    setUnreadJumpDismissed(false);
    setUnreadJumpTarget(null);
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    setHighlightedMessageId(null);
    setPinnedListModalOpen(false);
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
      if (openReadyTimerRef.current) {
        clearTimeout(openReadyTimerRef.current);
        openReadyTimerRef.current = null;
      }
      if (historyAnchorTimerRef.current) {
        clearTimeout(historyAnchorTimerRef.current);
        historyAnchorTimerRef.current = null;
      }
      if (userScrollResetTimerRef.current) {
        clearTimeout(userScrollResetTimerRef.current);
        userScrollResetTimerRef.current = null;
      }
      if (initialRevealTimerRef.current) {
        clearTimeout(initialRevealTimerRef.current);
        initialRevealTimerRef.current = null;
      }
      historyAnchorRef.current = null;
    };
  }, [route.params.conversationId]);

  useEffect(() => {
    setActiveConversation(route.params.conversationId);
    return () => {
      setActiveConversation('');
    };
  }, [route.params.conversationId, setActiveConversation]);

  const signalTyping = useCallback((conversationId: string) => {
    const now = Date.now();
    const elapsed = now - lastTypingAt.current;
    const send = () => {
      typingTimer.current = null;
      lastTypingAt.current = Date.now();
      void useAppStore.getState().sendTyping(conversationId);
    };

    if (elapsed >= 700) {
      send();
      return;
    }
    if (!typingTimer.current) {
      typingTimer.current = setTimeout(send, 700 - elapsed);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!isZaloConversation && (connection !== 'connected' || !conversation?.tinodeTopic)) {
      openedConversationRef.current = '';
      // Cached/offline conversations can still be positioned immediately.
      setTopicOpenReady(true);
      return () => { cancelled = true; };
    }
    const openKey = isZaloConversation
      ? `${route.params.conversationId}:zalo:${conversation?.messages?.length || 0}`
      : `${route.params.conversationId}:${conversation?.tinodeTopic}:${session?.generation || 0}`;
    if (openedConversationRef.current === openKey) return;
    openedConversationRef.current = openKey;
    setTopicOpenReady(false);
    void openConversation(route.params.conversationId).then(() => {
      if (cancelled || openedConversationRef.current !== openKey) return;
      // Let the final Tinode snapshot commit before the first scroll. This
      // prevents the cached/partial snapshot from winning the viewport.
      openReadyTimerRef.current = setTimeout(() => {
        openReadyTimerRef.current = null;
        if (!cancelled && openedConversationRef.current === openKey) setTopicOpenReady(true);
      }, 0);
    }).catch(() => {
      if (!cancelled && openedConversationRef.current === openKey) {
        openedConversationRef.current = '';
        setTopicOpenReady(true);
      }
    });
    return () => {
      cancelled = true;
      if (openReadyTimerRef.current) {
        clearTimeout(openReadyTimerRef.current);
        openReadyTimerRef.current = null;
      }
      if (openedConversationRef.current === openKey) openedConversationRef.current = '';
    };
  }, [connection, conversation?.tinodeTopic, isZaloConversation, openConversation, route.params.conversationId, session?.generation]);

  useEffect(() => {
    if (connection === 'connected') {
      setOfflineBannerVisible(false);
      return;
    }
    const timer = setTimeout(() => {
      if (useAppStore.getState().connection !== 'connected') {
        setOfflineBannerVisible(true);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [connection]);

  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      const activeRecording = recordingRef.current;
      recordingRef.current = null;
      recordingStartTimeRef.current = 0;
      if (activeRecording) void activeRecording.stop().catch(() => {});
      void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
    };
  }, [route.params.conversationId]);

  const messages = useMemo(() => conversation?.messages || [], [conversation?.messages]);
  const pinnedMessages = useMemo(() => {
    return messages.filter(m => m.pinned && !m.recalled);
  }, [messages]);

  const scrollToPinnedMessage = useCallback((targetMessage: ChatMessage) => {
    if (!targetMessage) return;
    const targetSeq = Number(targetMessage.seq) || 0;
    const targetId = String(targetMessage.id || '');

    const index = messages.findIndex(m =>
      (targetId && m.id === targetId) || (targetSeq > 0 && Number(m.seq) === targetSeq)
    );

    if (index >= 0) {
      try {
        listRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.22,
        });
      } catch {
        listRef.current?.scrollToOffset({
          offset: Math.max(0, index * 70 - 40),
          animated: true,
        });
      }

      const highlightKey = targetId || String(targetSeq);
      setHighlightedMessageId(highlightKey);
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedMessageId(null);
        highlightTimerRef.current = null;
      }, 2500);
    } else {
      Alert.alert(t('Thông báo'), t('Tin nhắn đã ghim không nằm trong phần lịch sử đã tải.'));
    }
  }, [messages, t]);

  const translationMessageKey = selectedMessage ? translationKey(route.params.conversationId, selectedMessage.id, selectedMessage.text) : '';
  const selectedTranslation = useTranslationStore(state => translationMessageKey ? state.entries[translationMessageKey] : undefined);
  const autoTranslationMessageKey = useMemo(
    () => messages.filter(message => message.type === 'text' && Boolean(message.text?.trim())).slice(-20).map(message => translationKey(route.params.conversationId, message.id, message.text)).join('|'),
    [messages, route.params.conversationId],
  );
  useEffect(() => {
    if (!translationTarget || !conversation?.id || !autoTranslationMessageKey) return;
    void translateConversation(conversation.id, messages, translationTarget);
  }, [autoTranslationMessageKey, conversation?.id, messages, translateConversation, translationTarget]);
  const firstUnreadIndex = useMemo(
    () => firstUnreadMessageIndex(messages, conversation?.readSeq, conversation?.badge || 0),
    [conversation?.badge, conversation?.readSeq, messages],
  );
  const unreadCount = Math.max(0, Number(conversation?.badge) || 0);
  const latestMessage = messages[messages.length - 1];
  const latestMessageKey = latestMessage ? messageKey(latestMessage) : '';
  const firstUnreadKey = firstUnreadIndex === null ? '' : messageKey(messages[firstUnreadIndex]);
  const unreadJumpIndex = useMemo(() => {
    if (unreadJumpTarget?.key) {
      const targetIndex = messages.findIndex(message => messageKey(message) === unreadJumpTarget.key);
      if (targetIndex >= 0) return targetIndex;
    }
    return firstUnreadIndex;
  }, [firstUnreadIndex, messages, unreadJumpTarget?.key]);

  useEffect(() => {
    if (firstUnreadIndex === null || !firstUnreadKey || unreadCount <= 0) {
      setUnreadJumpTarget(null);
      return;
    }
    setUnreadJumpTarget(current => current?.key === firstUnreadKey
      ? { ...current, count: Math.max(current.count, unreadCount, 1) }
      : { key: firstUnreadKey, count: Math.max(unreadCount, 1) });
  }, [firstUnreadIndex, firstUnreadKey, unreadCount]);

  const markConversationRead = useCallback((force = false) => {
    if (!conversation?.id || markingReadRef.current) return;
    const latestSeq = messages.reduce((latest, message) => Math.max(latest, Number(message.seq) || 0), 0);
    const currentBadge = Number(conversation.badge) || 0;
    if (!force && latestSeq > 0 && latestSeq <= lastMarkedReadSeqRef.current && currentBadge === 0) return;
    if (latestSeq > 0) {
      lastMarkedReadSeqRef.current = Math.max(lastMarkedReadSeqRef.current, latestSeq);
    }
    markingReadRef.current = true;
    void markRead(conversation.id, latestSeq > 0 ? latestSeq : undefined).catch(() => {
      // allow next attempt
    }).finally(() => {
      markingReadRef.current = false;
    });
  }, [conversation?.badge, conversation?.id, markRead, messages]);

  useEffect(() => {
    if (conversation?.id && (conversation?.badge || 0) > 0) {
      markConversationRead(false);
    }
  }, [conversation?.badge, conversation?.id, markConversationRead]);

  const requestInitialScroll = useCallback(() => {
    if (initialScrollDoneRef.current) return;
    if (!listHasLaidOut.current || messages.length === 0 || userScrollSessionRef.current) return;
    if (listMetricsRef.current.contentHeight <= 0) return;
    initialScrollDoneRef.current = true;
    requestAnimationFrame(() => {
      if (userScrollSessionRef.current) {
        initialScrollDoneRef.current = false;
        return;
      }
      listRef.current?.scrollToEnd({ animated: false });
      markConversationRead();
      if (initialRevealTimerRef.current) clearTimeout(initialRevealTimerRef.current);
      initialRevealTimerRef.current = setTimeout(() => {
        initialRevealTimerRef.current = null;
        if (userScrollSessionRef.current) return;
        listRef.current?.scrollToEnd({ animated: false });
      }, 100);
    });
  }, [markConversationRead, messages.length]);

  useEffect(() => {
    if (!topicOpenReady || userScrollSessionRef.current) return;
    if (listNearBottom.current) {
      requestAnimationFrame(() => {
        if (!userScrollSessionRef.current && listNearBottom.current) {
          listRef.current?.scrollToEnd({ animated: false });
        }
        markConversationRead(true);
      });
    }
  }, [markConversationRead, topicOpenReady]);

  const handleContentSizeChange = useCallback((_width: number, height: number) => {
    listMetricsRef.current.contentHeight = height;

    const anchor = historyAnchorRef.current;
    if (anchor && height > anchor.contentHeight + 1) {
      historyAnchorRef.current = null;
      const expectedOffset = Math.max(0, anchor.offsetY + height - anchor.contentHeight);
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: expectedOffset, animated: false });
      });
      return;
    }

    if (!initialScrollDoneRef.current) {
      requestInitialScroll();
      return;
    }

    if (!userScrollSessionRef.current && listNearBottom.current) {
      requestAnimationFrame(() => {
        if (!userScrollSessionRef.current && listNearBottom.current) {
          listRef.current?.scrollToEnd({ animated: false });
        }
      });
    }
  }, [requestInitialScroll]);

  useEffect(() => {
    const previousLatestKey = latestMessageKeyRef.current;
    const latestChanged = Boolean(previousLatestKey && latestMessageKey && previousLatestKey !== latestMessageKey);
    if (latestChanged && latestMessage && isUserVisibleMessage(latestMessage)) {
      if (!listNearBottom.current && latestMessage.sender === 'incoming') {
        setNewMessageCount(current => current + 1);
      } else if (listNearBottom.current && initialScrollDoneRef.current) {
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
      }
    }
    if (latestMessageKey) latestMessageKeyRef.current = latestMessageKey;
  }, [latestMessage, latestMessageKey]);

  useEffect(() => {
    if (listHasLaidOut.current) requestInitialScroll();
  }, [requestInitialScroll]);

  useEffect(() => {
    setUnreadJumpDismissed(false);
  }, [firstUnreadKey]);

  const [mentionModalTarget, setMentionModalTarget] = useState<{
    user: User;
    roleLabel: string;
    isSelf: boolean;
  } | null>(null);

  const mentionCandidates = useMemo(() => {
    if (!conversation?.isGroup || editingMessage || !mentionContext) return [];
    const rawMembers = conversation.members || [];
    const currentUserId = String(session?.user?.id || tinodeClient.currentUserId || '');

    const enrichedMembers = rawMembers
      .filter(member => {
        if (identitiesOverlap(member, session?.user)) return false;
        if (currentUserId && (member.id === currentUserId || member.uid === currentUserId)) return false;
        return true;
      })
      .map(member => {
        const dirMatch = directory.find(u => identitiesOverlap(u, member));
        const isOwner = member.mode?.includes('O') || member.id === conversation.adminId;
        const isAdmin = member.mode?.includes('A');
        const roleLabel = isOwner
          ? t('Trưởng nhóm')
          : isAdmin
          ? t('Phó nhóm')
          : (dirMatch?.department || member.department || dirMatch?.title || member.title || t('Thành viên'));
        return {
          ...member,
          id: dirMatch?.id || member.id,
          uid: member.uid || dirMatch?.uid || member.id,
          name: dirMatch?.name || member.name || t('Thành viên'),
          avatar: dirMatch?.avatar || member.avatar,
          department: dirMatch?.department || member.department,
          title: dirMatch?.title || member.title,
          roleLabel,
          isAll: false,
        };
      });

    const candidates: any[] = [
      {
        id: '__all__',
        name: t('Mọi người'),
        roleLabel: t('Nhắc đến tất cả thành viên trong nhóm'),
        mentionAliases: ['all', 'moi nguoi', 'tat ca'],
        isAll: true,
      },
      ...enrichedMembers,
    ];

    return candidates
      .filter((candidate, index, all) => all.findIndex(item => String(item.id || item.uid) === String(candidate.id || candidate.uid)) === index)
      .filter(candidate => matchesMentionCandidate(candidate, mentionContext.query));
  }, [conversation?.isGroup, conversation?.members, conversation?.adminId, directory, editingMessage, mentionContext, session?.user, t]);

  const handlePressMention = useCallback((token: string, target?: any) => {
    if (target?.isAll || token === '@All' || token === '@all') {
      Alert.alert(t('Nhắc đến mọi người'), t('Tin nhắn này nhắc đến tất cả thành viên trong nhóm.'));
      return;
    }

    const currentUserId = String(session?.user?.id || tinodeClient.currentUserId || '');
    const targetId = String(target?.id || target?.uid || target?.accountId || '');
    const dirMatch = directory.find(u => (
      (targetId && (u.id === targetId || u.uid === targetId))
      || identitiesOverlap(u, target)
      || (target?.name && u.name.toLowerCase() === String(target.name).toLowerCase())
    ));

    const groupMember = conversation?.members?.find(m => identitiesOverlap(m, target) || (targetId && (m.id === targetId || m.uid === targetId)));
    const isOwner = groupMember?.mode?.includes('O') || groupMember?.id === conversation?.adminId;
    const isAdmin = groupMember?.mode?.includes('A');
    const roleLabel = isOwner
      ? t('Trưởng nhóm')
      : isAdmin
      ? t('Phó nhóm')
      : (dirMatch?.department || groupMember?.department || dirMatch?.title || groupMember?.title || t('Thành viên'));

    const resolvedUser: User = dirMatch || {
      id: accountIdForMember(groupMember || target, directory) || targetId || `user-${Date.now()}`,
      uid: target?.uid || target?.tinodeUid || targetId,
      name: target?.name || target?.defaultName || 'Thành viên',
      avatar: target?.avatar || groupMember?.avatar || '',
      title: groupMember?.title || 'Nhân viên',
      department: groupMember?.department || '',
      email: target?.email || '',
      username: target?.username || '',
      active: true,
      tenantId: session?.tenant?.id || '',
    };

    const isSelf = identitiesOverlap(resolvedUser, session?.user) || (currentUserId && (resolvedUser.id === currentUserId || resolvedUser.uid === currentUserId));

    setMentionModalTarget({
      user: resolvedUser,
      roleLabel,
      isSelf: Boolean(isSelf),
    });
  }, [conversation?.adminId, conversation?.members, directory, session?.tenant?.id, session?.user, t]);

  const updateComposerText = (value: string, caretPosition = value.length) => {
    composerTextRef.current = value;
    setText(value);
    setMentionContext(!editingMessage && conversation?.isGroup
      ? getMentionContext(value, caretPosition)
      : null);
    if (value && conversation?.tinodeTopic && !editingMessage) signalTyping(conversation.id);
  };

  const selectMention = (candidate: any) => {
    const inserted = insertMentionAt(text, mentionContext, candidate);
    if (!inserted.token) return;
    const serialized = serializeMentionForTransport({ ...candidate, token: inserted.token });
    composerTextRef.current = inserted.text;
    setText(inserted.text);
    setMentionContext(null);
    if (serialized) {
      setSelectedMentions(current => [
        ...current.filter(item => item.token !== serialized.token && item.id !== serialized.id),
        serialized,
      ]);
    }
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setNativeProps?.({ selection: { start: inserted.caret, end: inserted.caret } });
    }, 0);
  };
  const restoreEditDraft = (snapshot: typeof editingMessage) => {
    if (!snapshot) return;
    setEditingMessage(null);
    composerTextRef.current = snapshot.previousText;
    setText(snapshot.previousText);
    setReplyingTo(snapshot.previousReply);
  };
  const beginEdit = (message: ChatMessage) => {
    if (!canEditMessage(message) || message.sender !== 'outgoing') return;
    setEditingMessage({ message, previousText: text, previousReply: replyingTo });
    composerTextRef.current = message.text;
    setText(message.text);
    setReplyingTo(undefined);
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  const submitText = async (suggestedText = '') => {
    const value = (suggestedText || text).trim();
    if (!value || busy || !conversation || !canSendMessages) return;
    if (editingMessage) {
      const snapshot = editingMessage;
      const target = conversation.messages.find(message => (
        message.id === snapshot.message.id
        || (Number(snapshot.message.seq) > 0 && Number(message.seq) === Number(snapshot.message.seq))
      )) || snapshot.message;
      if (!canEditMessage(target) || target.sender !== 'outgoing') {
        setError(t('Tin nhắn này không còn đủ điều kiện để sửa.'));
        return;
      }
      if (value === String(target.text || '').trim()) {
        restoreEditDraft(snapshot);
        return;
      }
      setBusy(true); setError('');
      try {
        await useAppStore.getState().editMessage(conversation.id, target, value);
        restoreEditDraft(snapshot);
      } catch (valueError) {
        setError(valueError instanceof Error ? t(valueError.message) : t('Không sửa được tin nhắn.'));
        composerTextRef.current = value;
        setText(value);
      } finally {
        setBusy(false);
      }
      return;
    }
    const mentions = selectedMentions
      .filter(mention => mentionTokenExists(value, mention.token || mentionTokenFor(mention)))
      .map(serializeMentionForTransport)
      .filter(Boolean);
    composerTextRef.current = '';
    setText(''); setMentionContext(null); setSelectedMentions([]); setBusy(true); setError('');
    const reply = replyingTo && conversation.messages.some(message => message.id === replyingTo.id && !message.recalled)
      ? replyingTo
      : undefined;
    setReplyingTo(undefined);
    try { await sendText(conversation.id, value, reply, mentions); } catch (valueError) { setError(valueError instanceof Error ? t(valueError.message) : t('Không gửi được tin nhắn.')); composerTextRef.current = value; setText(value); setSelectedMentions(mentions); setReplyingTo(reply); } finally { setBusy(false); }
  };
  const submitFile = async (file: PickerFile | null) => {
    if (!file || !conversation || !canSendMessages) return;
    const validation = attachmentValidationError(file);
    if (validation) { setError(t(validation)); return; }
    setBusy(true); setError('');
    try { await sendFile(conversation.id, file); } catch (valueError) { setError(valueError instanceof Error ? t(valueError.message) : t('Không gửi được tệp.')); } finally { setBusy(false); }
  };
  const submitLocation = async (location: LocationAttachment) => {
    if (!conversation || !canSendMessages) return;
    setBusy(true);
    setError('');
    try {
      await sendLocation(conversation.id, location);
    } catch (valueError) {
      setError(valueError instanceof Error ? t(valueError.message) : t('Không gửi được vị trí.'));
    } finally {
      setBusy(false);
    }
  };

  const submitContactCard = async (contact: ContactCardAttachment) => {
    if (!conversation || !canSendMessages) return;
    setBusy(true);
    setError('');
    try {
      await sendContactCard(conversation.id, contact);
    } catch (valueError) {
      setError(valueError instanceof Error ? t(valueError.message) : t('Không gửi được danh thiếp.'));
    } finally {
      setBusy(false);
    }
  };

  const submitGif = async (gifUrl: string) => {
    if (!conversation || !canSendMessages) return;
    setBusy(true);
    setError('');
    try {
      const file: PickerFile = {
        uri: gifUrl,
        name: `gif-${Date.now()}.gif`,
        type: 'image/gif',
      };
      await sendFile(conversation.id, file);
    } catch (valueError) {
      setError(valueError instanceof Error ? t(valueError.message) : t('Không gửi được GIF.'));
    } finally {
      setBusy(false);
    }
  };

  const submitQuickMessage = (quickText: string, sendImmediately = false) => {
    if (sendImmediately) {
      void submitText(quickText);
    } else {
      updateComposerText(quickText);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const submitGroupEvent = async (event: any) => {
    if (!conversation) return;
    setBusy(true);
    setError('');
    try {
      await createGroupEvent(conversation.id, event);
      setGroupEventModalOpen(false);
    } catch (valueError) {
      setError(valueError instanceof Error ? t(valueError.message) : t('Không tạo được nhắc hẹn.'));
    } finally {
      setBusy(false);
    }
  };

  const handleApplyFormat = (formatType: TextFormatType) => {
    const { newText, newSelection } = formatMarkdown(text, selectionRange, formatType);
    updateComposerText(newText, newSelection.start);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setNativeProps?.({ selection: newSelection });
    }, 0);
  };
  const startVoiceRecording = async () => {
    if (!conversation || busy || recordingRef.current || recording || !canSendMessages) return;
    try {
      let permission = await getRecordingPermissionsAsync();
      if (!permission.granted) {
        beginTrustedExternalActivity();
        permission = await requestRecordingPermissionsAsync();
      }
      if (!permission.granted) throw new Error('ViChat cần quyền micro để ghi âm voice.');
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'duckOthers' });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      recordingRef.current = audioRecorder;
      recordingStartTimeRef.current = Date.now();
      setRecordingDuration(0);
      setRecording(true);
      setError('');
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        if (recordingStartTimeRef.current) {
          setRecordingDuration(Date.now() - recordingStartTimeRef.current);
        }
      }, 250);
    } catch (valueError) {
      recordingRef.current = null;
      recordingStartTimeRef.current = 0;
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setRecording(false);
      await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
      setError(valueError instanceof Error ? t(valueError.message) : t('Không thể bắt đầu ghi âm voice.'));
    }
  };
  const stopVoiceRecording = async () => {
    const activeRecording = recordingRef.current || audioRecorder;
    if (!activeRecording || !conversation) {
      recordingRef.current = null;
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      recordingStartTimeRef.current = 0;
      setRecording(false);
      setRecordingDuration(0);
      void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
      return;
    }
    recordingRef.current = null;
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    const elapsedMs = recordingStartTimeRef.current ? Date.now() - recordingStartTimeRef.current : recordingDuration;
    recordingStartTimeRef.current = 0;
    setRecording(false);
    setBusy(true);
    setError('');
    try {
      const status: any = await activeRecording.stop().catch(() => null);
      const uri = (status?.url as string | undefined) || activeRecording.uri;
      const durationMs = Math.max(elapsedMs, Number(status?.durationMillis) || 0, recordingDuration);
      if (!uri || durationMs < 500) throw new Error('Voice quá ngắn. Hãy ghi ít nhất nửa giây.');
      if (useAppStore.getState().connection !== 'connected') {
        await useAppStore.getState().reconnect().catch(() => {});
      }
      if (!canSendMessages && useAppStore.getState().connection !== 'connected') {
        throw new Error('Realtime đang gián đoạn. Không thể gửi voice lúc này.');
      }
      await sendVoice(conversation.id, { uri, name: `voice-${Date.now()}.m4a`, type: 'audio/mp4' }, durationMs);
    } catch (valueError) {
      setError(valueError instanceof Error ? t(valueError.message) : t('Không gửi được voice.'));
    } finally {
      setBusy(false);
      setRecordingDuration(0);
      await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
    }
  };
  const submitSticker = async (sticker: Sticker) => {
    if (!conversation || busy || editingMessage || !canSendMessages) return;
    setBusy(true); setError('');
    try { await sendSticker(conversation.id, sticker); } catch (valueError) { setError(valueError instanceof Error ? t(valueError.message) : t('Không gửi được sticker.')); } finally { setBusy(false); }
  };
  const submitPoll = async (poll: Pick<Poll, 'question' | 'options' | 'settings'>) => {
    if (!conversation || !canSendMessages) return;
    setBusy(true); setError('');
    try { await createPoll(conversation.id, poll); } catch (valueError) { setError(valueError instanceof Error ? t(valueError.message) : t('Không tạo được bình chọn.')); } finally { setBusy(false); }
  };
  const submitPollVote = useCallback(async (message: ChatMessage, optionIds: string[]) => {
    if (!conversation?.isGroup || !message.poll || !canSendMessages) return;
    setBusy(true); setError('');
    try { await votePoll(conversation.id, message.poll.id, optionIds); } catch (valueError) { setError(valueError instanceof Error ? t(valueError.message) : t('Không gửi được lựa chọn.')); } finally { setBusy(false); }
  }, [canSendMessages, conversation?.id, conversation?.isGroup, t, votePoll]);
  const submitPollOption = useCallback(async (message: ChatMessage, optionText: string) => {
    if (!conversation?.isGroup || !message.poll || !optionText.trim() || !canSendMessages) return;
    setBusy(true); setError('');
    try { await addPollOption(conversation.id, message.poll.id, `option-${Date.now()}`, optionText.trim()); } catch (valueError) { setError(valueError instanceof Error ? t(valueError.message) : t('Không thêm được phương án.')); } finally { setBusy(false); }
  }, [addPollOption, canSendMessages, conversation?.id, conversation?.isGroup, t]);
  const submitPollLock = useCallback(async (message: ChatMessage) => {
    if (!conversation?.isGroup || !message.poll || !canSendMessages) return;
    setBusy(true); setError('');
    try { await lockPoll(conversation.id, message.poll.id); } catch (valueError) { setError(valueError instanceof Error ? t(valueError.message) : t('Không khóa được bình chọn.')); } finally { setBusy(false); }
  }, [canSendMessages, conversation?.id, conversation?.isGroup, lockPoll, t]);
  const loadEarlierMessages = async () => {
    if (!conversation || messages.length === 0 || !initialScrollDoneRef.current || !hasEarlier || !historyLoadArmedRef.current || !userScrollSessionRef.current || loadingEarlier || loadingEarlierRef.current) return;
    historyLoadArmedRef.current = false;
    loadingEarlierRef.current = true;
    historyAnchorRef.current = {
      offsetY: listMetricsRef.current.offsetY,
      contentHeight: listMetricsRef.current.contentHeight,
    };
    if (historyAnchorTimerRef.current) clearTimeout(historyAnchorTimerRef.current);
    historyAnchorTimerRef.current = setTimeout(() => {
      historyAnchorRef.current = null;
      historyAnchorTimerRef.current = null;
    }, 1200);
    setLoadingEarlier(true);
    try { setHasEarlier(await loadEarlier(conversation.id, 40)); } catch (valueError) { historyLoadArmedRef.current = true; setError(valueError instanceof Error ? t(valueError.message) : t('Không tải thêm được lịch sử chat.')); } finally { loadingEarlierRef.current = false; setLoadingEarlier(false); }
  };
  const beginUserScrollSession = () => {
    userScrollSessionRef.current = true;
    userScrollStartOffsetRef.current = listMetricsRef.current.offsetY;
    userScrollMovedTowardHistoryRef.current = false;
    if (userScrollResetTimerRef.current) {
      clearTimeout(userScrollResetTimerRef.current);
      userScrollResetTimerRef.current = null;
    }
  };
  const endUserScrollSession = () => {
    if (userScrollResetTimerRef.current) clearTimeout(userScrollResetTimerRef.current);
    userScrollResetTimerRef.current = setTimeout(() => {
      userScrollSessionRef.current = false;
      userScrollResetTimerRef.current = null;
      userScrollMovedTowardHistoryRef.current = false;
    }, 800);
  };
  const handleListScroll = (event: any) => {
    const nativeEvent = event?.nativeEvent || {};
    const offsetY = Number(nativeEvent.contentOffset?.y || 0);
    const contentHeight = Number(nativeEvent.contentSize?.height || 0);
    const viewportHeight = Number(nativeEvent.layoutMeasurement?.height || 0);
    listMetricsRef.current = { offsetY, contentHeight, viewportHeight };
    if (!initialScrollDoneRef.current) return;
    if (userScrollSessionRef.current && offsetY < userScrollStartOffsetRef.current - 2) userScrollMovedTowardHistoryRef.current = true;
    if (userScrollSessionRef.current && offsetY > 96) historyLoadArmedRef.current = true;
    if (userScrollSessionRef.current && userScrollMovedTowardHistoryRef.current && offsetY <= 96 && initialScrollDoneRef.current) void loadEarlierMessages();
    const nearBottom = isNearChatBottom(offsetY, contentHeight, viewportHeight, CHAT_BOTTOM_THRESHOLD);
    if (listNearBottom.current !== nearBottom) {
      listNearBottom.current = nearBottom;
      setIsNearBottom(nearBottom);
    }
    if (nearBottom) {
      setNewMessageCount(0);
      markConversationRead();
    }
  };
  const jumpToUnread = () => {
    if (unreadJumpIndex === null || unreadJumpIndex < 0) return;
    setUnreadJumpDismissed(true);
    listNearBottom.current = false;
    setIsNearBottom(false);
    try { listRef.current?.scrollToIndex({ index: unreadJumpIndex, animated: true, viewPosition: 0.18 }); } catch { /* The list may still be measuring the target row. */ }
  };
  const jumpToLatest = () => {
    listNearBottom.current = true;
    setIsNearBottom(true);
    setNewMessageCount(0);
    listRef.current?.scrollToEnd({ animated: true });
    markConversationRead();
  };
  const chooseImages = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('ViChat cần quyền truy cập ảnh để gửi hình từ thư viện.');
      beginTrustedExternalActivity();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.9,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.length) return;

      for (const asset of result.assets) {
        const file: PickerFile = {
          uri: asset.uri,
          name: asset.fileName || `anh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`,
          type: asset.mimeType || 'image/jpeg',
          size: asset.fileSize,
        };
        await submitFile(file);
      }
    } catch (valueError) {
      setError(valueError instanceof Error ? t(valueError.message) : t('Không gửi được ảnh.'));
    }
  };

  const captureCameraPhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) throw new Error('ViChat cần quyền sử dụng máy ảnh để chụp ảnh.');
      beginTrustedExternalActivity();
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'] as any,
        quality: 0.9,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const file: PickerFile = {
        uri: asset.uri,
        name: asset.fileName || `camera-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
        size: asset.fileSize,
      };
      await submitFile(file);
    } catch (valueError) {
      setError(valueError instanceof Error ? t(valueError.message) : t('Không chụp được ảnh.'));
    }
  };

  const chooseDocument = async () => {
    try {
      beginTrustedExternalActivity();
      const result: any = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled || !result.assets?.length) return;

      for (const asset of result.assets) {
        const file: PickerFile = {
          uri: asset.uri,
          name: asset.name || 'tep-dinh-kem',
          type: asset.mimeType || 'application/octet-stream',
          size: asset.size,
        };
        await submitFile(file);
      }
    } catch (valueError) {
      setError(valueError instanceof Error ? t(valueError.message) : t('Không gửi được tệp.'));
    }
  };

  const chooseFile = async (imageOnly = false) => {
    if (imageOnly) {
      await chooseImages();
    } else {
      await chooseDocument();
    }
  };

  const handleOpenContactChat = useCallback(async (contact: ContactCardAttachment) => {
    if (!contact.userId) return;
    try {
      setBusy(true);
      const directory = useAppStore.getState().directory;
      const userInDirectory = directory.find(u => u.id === contact.userId || u.uid === contact.userId);
      const targetUser: User = userInDirectory || {
        id: contact.userId,
        uid: contact.userId,
        name: contact.name,
        avatar: contact.avatar,
        title: contact.title,
        department: contact.department,
        email: contact.email,
        username: contact.phone || contact.userId,
        active: true,
        tenantId: '',
      };
      const conv = await useAppStore.getState().createDirectConversation(targetUser);
      if (conv?.id && conv.id !== conversation?.id) {
        navigation.navigate('ChatDetail', { conversationId: conv.id });
      }
    } catch {
      setError(t('Không thể mở cuộc trò chuyện với liên hệ này.'));
    } finally {
      setBusy(false);
    }
  }, [conversation?.id, navigation, t]);
  const replyMessage = (message: ChatMessage) => {
    if (!canInteractWithMessage(message)) return;
    setReplyingTo({ id: message.id, text: message.text || (message.sticker ? t('Sticker') : message.file?.name || t('Hình ảnh')), senderName: message.senderName || (message.sender === 'outgoing' ? t('Bạn') : t('Thành viên')) });
  };
  const copyMessage = (message: ChatMessage) => { if (canInteractWithMessage(message) && message.text) void Clipboard.setStringAsync(message.text); };
  const translateSelectedMessage = (message: ChatMessage) => {
    if (!canInteractWithMessage(message) || !message.text || !conversation) return;
    const key = translationKey(conversation.id, message.id, message.text);
    const existing = useTranslationStore.getState().entries[key];
    if (existing?.status === 'ready') {
      hideTranslation(key);
      return;
    }
    const targetLanguage = translationTarget || defaultTranslationTarget(message.text, language);
    void translateMessage(conversation.id, message.id, message.text, targetLanguage).catch(value => {
      setError(value instanceof Error ? t(value.message) : t('Dịch tin nhắn tạm thời không khả dụng.'));
    });
  };
  const downloadMessage = (message: ChatMessage) => {
    if (!canInteractWithMessage(message)) return;
    if (message.sticker) return;
    const file = message.file || (message.image ? { name: 'hình-ảnh.jpg', mime: 'image/jpeg', size: 0, url: message.image } : null);
    if (!file) return;
    beginTrustedExternalActivity();
    void tinodeClient.downloadFile(file).catch(value => setError(value instanceof Error ? t(value.message) : t('Không mở được tệp.')));
  };
  const shareMessage = (message: ChatMessage) => {
    if (!canInteractWithMessage(message)) return;
    if (message.sticker) {
      void Share.share({ message: t('Sticker ViChat') }).catch(() => {});
      return;
    }
    if (message.image || message.file) { downloadMessage(message); return; }
    void Share.share({ message: message.text || t('Tin nhắn ViChat') }).catch(() => {});
  };
  const showMessageDetails = (message: ChatMessage) => Alert.alert(
    t('Chi tiết tin nhắn'),
    [`${t('Người gửi')}: ${message.sender === 'outgoing' ? t('Bạn') : message.senderName || t('Thành viên')}`, `${t('Thời gian')}: ${new Date(message.createdAt || Date.now()).toLocaleString(locale)}`, `${t('Trạng thái')}: ${message.recalled ? t('Đã thu hồi') : message.deliveryStatus || t('Đã gửi')}`].join('\n'),
  );
  const recallWithMode = async (message: ChatMessage, mode: RecallMode) => {
    setBusy(true);
    try {
      await recallMessage(conversation?.id || '', message, mode);
    } catch (value) {
      setError(value instanceof Error ? t(value.message) : t('Không thu hồi được tin nhắn.'));
    } finally {
      setBusy(false);
    }
  };
  const requestRecall = (message: ChatMessage) => setRecallTarget(message);
  const confirmRecall = (mode: RecallMode) => {
    const target = recallTarget;
    setRecallTarget(null);
    if (target) void recallWithMode(target, mode);
  };

  const currentUserId = session?.user?.id;
  const currentUserUid = session?.user?.uid;
  const tinodeUserId = tinodeClient.currentUserId;
  const viewerIdentities = useMemo(() => {
    return [currentUserId, currentUserUid, tinodeUserId].filter(Boolean).map(String);
  }, [currentUserId, currentUserUid, tinodeUserId]);

  const groupMembers = useMemo(() => conversation?.members || [], [conversation?.members]);

  const handleLongPressMessage = useCallback((message: ChatMessage) => {
    if (!message.recalled) {
      setSelectedMessage(message);
    }
  }, []);

  const handleShowEditHistory = useCallback((message: ChatMessage) => {
    setEditHistoryMessage(message);
  }, []);

  const keyExtractor = useCallback((item: ChatMessage, index: number) => messageKey(item) || `message-${index}`, []);

  const conversationId = conversation?.id || '';
  const isGroup = Boolean(conversation?.isGroup);
  const renderItem = useCallback(({ item, index }: { item: ChatMessage; index: number }) => {
    const currentDay = formatMessageDateLabel(item.createdAt);
    const previousDay = index > 0 ? formatMessageDateLabel(messages[index - 1]?.createdAt) : '';
    const isHighlighted = Boolean(highlightedMessageId && (highlightedMessageId === item.id || highlightedMessageId === String(item.seq)));
    return (
      <View>
        {currentDay && currentDay !== previousDay ? <Text style={styles.date}>{currentDay}</Text> : null}
        <MessageBubble
          message={item}
          translationEntryKey={translationKey(conversationId, item.id, item.text)}
          viewerIdentities={viewerIdentities}
          groupMembers={groupMembers}
          isGroup={isGroup}
          highlighted={isHighlighted}
          onLongPress={handleLongPressMessage}
          onShowEditHistory={handleShowEditHistory}
          onPollVote={submitPollVote}
          onPollAddOption={submitPollOption}
          onPollLock={submitPollLock}
          onOpenContactChat={handleOpenContactChat}
          onPressMention={handlePressMention}
        />
      </View>
    );
  }, [
    conversationId,
    groupMembers,
    handleLongPressMessage,
    handleOpenContactChat,
    handlePressMention,
    handleShowEditHistory,
    highlightedMessageId,
    isGroup,
    messages,
    styles.date,
    submitPollLock,
    submitPollOption,
    submitPollVote,
    viewerIdentities,
  ]);
  const peer = conversation?.members?.find(member => !identitiesOverlap(member, session?.user) && !identitiesOverlap(member, { id: tinodeClient.currentUserId, uid: tinodeClient.currentUserId })) || conversation?.members?.[0];
  const peerAccountId = peer ? accountIdForMember(peer, directory) : '';
  const canEditNickname = Boolean(!conversation?.isGroup && !conversation?.isChatbot && peer && peerAccountId && peer.type !== 'bot' && !peer.isChatbot);
  const callCapability = !conversation?.isGroup && !conversation?.isChatbot && conversation?.tinodeTopic
    ? tinodeClient.getCallCapability(conversation.tinodeTopic, { isGroup: false, isChatbot: false })
    : { available: false, reason: 'Cuộc gọi mobile chỉ hỗ trợ hội thoại 1-1.' };
  const beginCall = (audioOnly: boolean) => {
    if (!conversation) return;
    void startCall(conversation.tinodeTopic, audioOnly, { name: peer?.name || conversation.name, avatar: peer?.avatar || conversation.avatarUrl }).catch(value => setError(value instanceof Error ? t(value.message) : t('Không thể bắt đầu cuộc gọi.')));
  };

  if (!conversation) return <SafeAreaView style={styles.screen}><Text style={styles.missing}>{t('Cuộc trò chuyện không còn khả dụng.')}</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('Quay lại')} onPress={() => navigation.goBack()} style={styles.back}><ChevronLeft color={palette.ink} size={27} /></Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Thông tin cuộc trò chuyện')}
          onPress={() => navigation.navigate('GroupInfo', { conversationId: conversation.id })}
          style={styles.headerInfoArea}
        >
          <Avatar name={conversation.name} uri={conversation.avatarUrl} size={42} rounded={!conversation.isGroup} online={!conversation.isGroup && directPeerOnline(conversation, tinodeClient.currentUserId)} />
          <View style={styles.headerTitle}>
            <Text numberOfLines={1} style={styles.name}>{conversation.name}</Text>
            <Text style={styles.status}>{isZaloConversation ? t('Khách hàng Zalo OA') : conversation.isChatbot ? t('Tra cứu tri thức · Có nguồn kiểm chứng') : conversation.isGroup ? (conversation.membersCount ? (String(conversation.membersCount).includes(t('thành viên')) ? String(conversation.membersCount) : `${conversation.membersCount} ${t('thành viên')}`) : `${conversation.members?.length || 0} ${t('thành viên')}`) : (directPeerOnline(conversation, tinodeClient.currentUserId) ? t('Đang hoạt động') : t('Offline'))}</Text>
          </View>
        </Pressable>
        {callCapability.available && !isZaloConversation ? (
          <>
            <Pressable accessibilityLabel={t('Gọi thoại')} disabled={Boolean(activeCall)} onPress={() => beginCall(true)} style={styles.more}><Phone color={palette.accent} size={19} /></Pressable>
            <Pressable accessibilityLabel={t('Gọi video')} disabled={Boolean(activeCall)} onPress={() => beginCall(false)} style={styles.more}><Video color={palette.accent} size={19} /></Pressable>
          </>
        ) : null}
        <Pressable accessibilityLabel={t('Thông tin cuộc trò chuyện')} onPress={() => navigation.navigate('GroupInfo', { conversationId: conversation.id })} style={styles.more}><Info color={palette.inkSoft} size={21} /></Pressable>
      </View>
      {conversation.isChatbot ? <View style={styles.aiStrip}><View style={styles.aiStripItem}><ShieldCheck color={palette.online} size={14} /><Text style={styles.aiStripText}>{t('Riêng tư')}</Text></View><View style={styles.aiStripItem}><BookOpen color={palette.accent} size={14} /><Text style={styles.aiStripText}>{t('Nguồn rõ ràng')}</Text></View></View> : null}
      {offlineBannerVisible && !recording && !isZaloConversation ? <View style={styles.offline}><WifiOff color={palette.warning} size={15} /><Text style={styles.offlineText}>{t('Realtime đang gián đoạn. Gửi tin nhắn tạm dừng đến khi kết nối lại.')}</Text><Pressable onPress={() => void reconnect()} style={styles.retry}><Text style={styles.retryText}>{t('Thử lại')}</Text></Pressable></View> : null}
      {activeLiveSession && activeLiveSession.conversationId === conversation.id && activeLiveSession.isActive ? (
        <View style={styles.liveBanner}>
          <View style={styles.liveBannerLeft}>
            <View style={styles.livePulseDot} />
            <Text style={styles.liveBannerText}>{t('Bạn đang chia sẻ vị trí trực tiếp')}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Dừng chia sẻ vị trí')}
            onPress={() => void liveLocationService.stopLiveSharing(activeLiveSession.liveId)}
            style={styles.liveBannerStopBtn}
          >
            <Text style={styles.liveBannerStopText}>{t('Dừng')}</Text>
          </Pressable>
        </View>
      ) : null}
      {pinnedMessages.length > 0 ? (
        <PinnedMessageBar
          pinnedMessages={pinnedMessages}
          onPressMessage={scrollToPinnedMessage}
          onPressList={() => setPinnedListModalOpen(true)}
        />
      ) : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <View style={styles.listStage}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={keyExtractor}
          onScroll={handleListScroll}
          onScrollBeginDrag={beginUserScrollSession}
          onScrollEndDrag={endUserScrollSession}
          onMomentumScrollBegin={beginUserScrollSession}
          onMomentumScrollEnd={endUserScrollSession}
          scrollEventThrottle={120}
          onContentSizeChange={handleContentSizeChange}
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            if (!initialScrollDoneRef.current) return;
            requestAnimationFrame(() => {
              listRef.current?.scrollToOffset({ offset: Math.max(0, averageItemLength * index - 80), animated: false });
              requestAnimationFrame(() => listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.18 }));
            });
          }}
          renderItem={renderItem}
          contentContainerStyle={styles.messageList}
          onLayout={() => {
            listHasLaidOut.current = true;
            requestInitialScroll();
          }}
          maintainVisibleContentPosition={Platform.OS === 'ios' && loadingEarlier ? CHAT_MAINTAIN_VISIBLE_CONTENT_POSITION : undefined}
          removeClippedSubviews={Platform.OS === 'android'}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={9}
          updateCellsBatchingPeriod={50}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={conversation.isChatbot ? <View style={styles.aiEmpty}><View style={styles.aiEmptyIcon}><Search color="#fff" size={27} /></View><Text style={styles.aiEyebrow}>VICHAT AI</Text><Text style={styles.emptyTitle}>{t('Hỏi kho tri thức doanh nghiệp')}</Text><Text style={styles.emptyText}>{t('ViChat AI tìm nội dung liên quan và đưa nguồn để bạn kiểm chứng.')}</Text><View style={styles.aiStarters}>{AI_STARTERS.map((prompt, index) => <Pressable key={prompt} disabled={busy || connection !== 'connected'} onPress={() => void submitText(prompt)} style={styles.aiStarter}><Text style={styles.aiStarterIndex}>{index + 1}</Text><Text style={styles.aiStarterText}>{t(prompt)}</Text></Pressable>)}</View></View> : <View style={styles.empty}><Text style={styles.emptyTitle}>{t('Bắt đầu cuộc trò chuyện')}</Text><Text style={styles.emptyText}>{t('Tin nhắn và tệp được đồng bộ realtime giữa mobile và web.')}</Text></View>}
        />
        {loadingEarlier ? <View pointerEvents="none" style={styles.historyLoadingOverlay}><ActivityIndicator color={palette.accent} /></View> : null}
        {unreadJumpIndex !== null && unreadJumpIndex >= 0 && unreadCount > 0 && !unreadJumpDismissed ? <Pressable accessibilityLabel={t('Đi tới tin nhắn chưa đọc')} onPress={jumpToUnread} style={styles.unreadJump}><Text style={styles.unreadJumpText}>{unreadJumpTarget?.count ? `${unreadJumpTarget.count} ${t('tin chưa đọc')}` : t('Tin chưa đọc')}</Text><ArrowDown color={palette.accentDeep} size={15} /></Pressable> : null}
        {!isNearBottom ? <Pressable accessibilityLabel={t('Đi tới tin nhắn mới nhất')} onPress={jumpToLatest} style={styles.latestJump}><ArrowDown color="#fff" size={21} strokeWidth={2.5} />{newMessageCount > 0 ? <View style={styles.latestCount}><Text style={styles.latestCountText}>{newMessageCount > 99 ? '99+' : newMessageCount}</Text></View> : null}</Pressable> : null}
        </View>
        <TypingIndicator visible={Boolean(typing)} />
        {groupLockedForViewer ? <View style={styles.groupLocked}><Text style={styles.groupLockedText}>{t('Quản trị viên đã tạm khóa quyền gửi tin nhắn trong nhóm.')}</Text></View> : null}
        {error ? <Pressable onPress={() => setError('')} style={styles.error}><Text style={styles.errorText}>{t(error)}</Text></Pressable> : null}
        {editingMessage ? <View style={styles.editComposer}><View style={styles.replyBar} /><View style={styles.replyBody}><Text numberOfLines={1} style={styles.replyName}>{t('Sửa tin nhắn')}</Text><Text numberOfLines={1} style={styles.replyText}>{editingMessage.message.text}</Text></View><Pressable disabled={busy} onPress={() => restoreEditDraft(editingMessage)} style={styles.replyClose}><X color={palette.inkSoft} size={18} /></Pressable></View> : null}
        {!editingMessage && replyingTo ? <View style={styles.replyComposer}><View style={styles.replyBar} /><View style={styles.replyBody}><Text numberOfLines={1} style={styles.replyName}>{t('Đang trả lời')} {replyingTo.senderName}</Text><Text numberOfLines={1} style={styles.replyText}>{replyingTo.text}</Text></View><Pressable onPress={() => setReplyingTo(undefined)} style={styles.replyClose}><X color={palette.inkSoft} size={18} /></Pressable></View> : null}
        {mentionCandidates.length > 0 ? (
          <View style={styles.mentionPanel}>
            <View style={styles.mentionHeader}>
              <Text style={styles.mentionHeading}>
                {t('Nhắc đến')} ({mentionCandidates.length})
              </Text>
              <Pressable
                hitSlop={8}
                onPress={() => setMentionContext(null)}
                style={styles.mentionCloseButton}
                accessibilityLabel={t('Đóng')}
              >
                <X color={palette.inkSoft} size={16} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.mentionScroll}
              contentContainerStyle={styles.mentionOptionsVertical}
              keyboardShouldPersistTaps="always"
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {mentionCandidates.map(candidate => (
                <Pressable
                  key={String(candidate.id || candidate.uid)}
                  onPress={() => selectMention(candidate)}
                  style={styles.mentionOptionVertical}
                >
                  <Avatar
                    name={candidate.isAll ? t('Mọi người') : candidate.name}
                    uri={candidate.avatar}
                    size={38}
                    rounded={!candidate.isAll}
                  />
                  <View style={styles.mentionOptionMeta}>
                    <Text numberOfLines={1} style={styles.mentionName}>
                      {candidate.isAll ? t('Mọi người') : candidate.name}
                    </Text>
                    <Text numberOfLines={1} style={styles.mentionSub}>
                      {candidate.roleLabel || t('Thành viên')}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
        {recording ? <Pressable accessibilityLabel={t('Dừng ghi âm voice')} onPress={() => void stopVoiceRecording()} style={styles.recordingBanner}><View style={styles.recordingDot} /><Text style={styles.recordingText}>{t('Đang ghi voice')} {formatVoiceDuration(recordingDuration)} · {t('chạm mic để dừng')}</Text></Pressable> : null}
        {conversation.isChatbot ? <Text style={styles.aiNote}>{t('Kiểm tra nguồn trước khi dùng thông tin để ra quyết định.')}</Text> : null}
        <TextFormatBar
          visible={textFormatBarOpen}
          onApplyFormat={handleApplyFormat}
          onClose={() => setTextFormatBarOpen(false)}
        />
        <View style={styles.composerBar}>
          <Pressable
            accessibilityLabel={t('Chọn sticker biểu cảm')}
            onPress={() => {
              setMorePanelOpen(false);
              setStickerPickerOpen(true);
            }}
            disabled={busy || recording || Boolean(editingMessage) || !canSendMessages}
            style={styles.composerIconButton}
          >
            <Smile color={palette.inkSoft} size={25} strokeWidth={1.8} />
          </Pressable>

          <View style={styles.inputPillContainer}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={updateComposerText}
              onFocus={() => setMorePanelOpen(false)}
              onSelectionChange={event => {
                const caret = Number(event.nativeEvent.selection?.start || 0);
                setSelectionRange(event.nativeEvent.selection);
                setMentionContext(!editingMessage && conversation.isGroup ? getMentionContext(composerTextRef.current, caret) : null);
              }}
              placeholder={editingMessage ? t('Nhập nội dung mới...') : conversation.isChatbot ? t('Hỏi ViChat AI...') : t('Tin nhắn')}
              placeholderTextColor={palette.muted}
              multiline
              maxLength={120000}
              style={styles.pillInput}
              editable={!busy && !recording && canSendMessages}
            />

            <Pressable
              accessibilityLabel={t('Chức năng mở rộng')}
              onPress={() => {
                inputRef.current?.blur();
                Keyboard.dismiss();
                setMorePanelOpen(current => !current);
              }}
              style={[styles.moreDotsButton, morePanelOpen && styles.moreDotsButtonActive]}
            >
              <MoreHorizontal color={morePanelOpen ? '#0084FF' : palette.inkSoft} size={22} strokeWidth={2.2} />
            </Pressable>
          </View>

          {text.trim().length > 0 ? (
            <Pressable
              onPress={() => void submitText()}
              disabled={busy || recording || !canSendMessages}
              style={styles.sendButtonPrimary}
              accessibilityLabel={t('Gửi tin nhắn')}
            >
              <Send color="#fff" size={19} />
            </Pressable>
          ) : (
            <View style={styles.rightActionGroup}>
              <Pressable
                accessibilityLabel={recording ? t('Dừng ghi âm') : t('Ghi âm voice')}
                onPress={() => void (recording ? stopVoiceRecording() : startVoiceRecording())}
                disabled={(busy && !recording) || Boolean(editingMessage) || (!recording && !canSendMessages)}
                style={[styles.composerIconButton, recording && styles.iconRecordingActive]}
              >
                {recording ? <CircleStop color={palette.danger} size={22} /> : <Mic color={palette.inkSoft} size={23} strokeWidth={1.8} />}
              </Pressable>

              <Pressable
                accessibilityLabel={t('Chụp ảnh')}
                onPress={() => void captureCameraPhoto()}
                disabled={busy || recording || Boolean(editingMessage) || !canSendMessages}
                style={styles.composerIconButton}
              >
                <Camera color={palette.inkSoft} size={23} strokeWidth={1.8} />
              </Pressable>

              <Pressable
                accessibilityLabel={t('Chọn ảnh từ thư viện')}
                onPress={() => void chooseImages()}
                disabled={busy || recording || Boolean(editingMessage) || !canSendMessages}
                style={styles.composerIconButton}
              >
                <ImageLucide color={palette.inkSoft} size={23} strokeWidth={1.8} />
              </Pressable>
            </View>
          )}
        </View>

        {morePanelOpen ? (
          <ChatMorePanel
            isGroup={Boolean(conversation.isGroup && canCreatePoll)}
            onSelectCamera={() => {
              setMorePanelOpen(false);
              void captureCameraPhoto();
            }}
            onSelectLocation={() => {
              setMorePanelOpen(false);
              setLocationModalOpen(true);
            }}
            onSelectDocument={() => {
              setMorePanelOpen(false);
              void chooseDocument();
            }}
            onSelectReminder={() => {
              setMorePanelOpen(false);
              setGroupEventModalOpen(true);
            }}
            onSelectQuickMessages={() => {
              setMorePanelOpen(false);
              setQuickMessagesOpen(true);
            }}
            onSelectContact={() => {
              setMorePanelOpen(false);
              setContactModalOpen(true);
            }}
            onSelectGif={() => {
              setMorePanelOpen(false);
              setGifModalOpen(true);
            }}
            onSelectDoodle={() => {
              setMorePanelOpen(false);
              setDoodleModalOpen(true);
            }}
            onSelectTextStyle={() => {
              setMorePanelOpen(false);
              setTextFormatBarOpen(current => !current);
            }}
            onSelectPoll={() => {
              setMorePanelOpen(false);
              setPollComposerOpen(true);
            }}
            onClose={() => setMorePanelOpen(false)}
          />
        ) : null}
      </KeyboardAvoidingView>
      <MessageActionSheet
        message={selectedMessage}
        onClose={() => setSelectedMessage(null)}
        onReply={replyMessage}
        onCopy={copyMessage}
        onTranslate={translateSelectedMessage}
        hasTranslation={selectedTranslation?.status === 'ready'}
        onShare={shareMessage}
        onDownload={downloadMessage}
        onDetails={showMessageDetails}
        onEdit={beginEdit}
        onReaction={(message, emoji) => void sendReaction(conversation.id, message, emoji).catch(value => setError(value instanceof Error ? t(value.message) : t('Không thêm được biểu cảm.')))}
        canPin={canPinMessages}
        onPin={message => void toggleMessagePin(conversation.id, message).catch(value => setError(value instanceof Error ? t(value.message) : t('Không ghim được tin nhắn.')))}
        onRecall={message => requestRecall(message)}
      />
      <StickerPicker visible={stickerPickerOpen} onClose={() => setStickerPickerOpen(false)} onSelect={sticker => { void submitSticker(sticker); }} />
      <PollComposer visible={pollComposerOpen} allowPin={canPinMessages} onClose={() => setPollComposerOpen(false)} onSubmit={poll => { void submitPoll(poll); }} />
      <QuickMessagesModal
        visible={quickMessagesOpen}
        onClose={() => setQuickMessagesOpen(false)}
        onSelect={submitQuickMessage}
      />
      <ContactPickerModal
        visible={contactModalOpen}
        members={conversation.members || []}
        onClose={() => setContactModalOpen(false)}
        onSelect={submitContactCard}
      />
      <LocationPickerModal
        visible={locationModalOpen}
        conversationId={conversation.id}
        senderInfo={{
          senderId: tinodeClient.currentUserId,
          senderName: session?.user?.name || 'Bạn',
          senderAvatar: session?.user?.avatar,
        }}
        onClose={() => setLocationModalOpen(false)}
        onSelect={submitLocation}
      />
      <DoodleModal
        visible={doodleModalOpen}
        onClose={() => setDoodleModalOpen(false)}
        onSend={(file: PickerFile) => void submitFile(file)}
      />
      <GifPickerModal
        visible={gifModalOpen}
        onClose={() => setGifModalOpen(false)}
        onSelect={submitGif}
      />
      <GroupEventComposer
        visible={groupEventModalOpen}
        onClose={() => setGroupEventModalOpen(false)}
        onSubmit={event => void submitGroupEvent(event)}
      />
      <ConfirmDialog
        visible={Boolean(recallTarget)}
        title={t('Thu hồi tin nhắn')}
        message={t('Chọn phạm vi thu hồi cho tin nhắn này.')}
        eyebrow={t('THAO TÁC TIN NHẮN')}
        confirmLabel={t('Thu hồi tất cả')}
        secondaryLabel={t('Chỉ phía tôi')}
        onCancel={() => setRecallTarget(null)}
        onConfirm={() => confirmRecall('all')}
        onSecondary={() => confirmRecall('self')}
        busy={busy}
      />
      <ConversationNicknameModal
        visible={Boolean(nicknameMember)}
        member={nicknameMember}
        initialNickname={nicknameMember ? conversationNicknameForMember(nicknameMember, conversation.conversationNicknames) : ''}
        onCancel={() => setNicknameMember(null)}
        onSave={async nickname => {
          if (!nicknameMember || !peerAccountId) throw new Error('Không xác định được Account ID của thành viên.');
          await updateConversationNickname(conversation.id, peerAccountId, nickname);
        }}
      />
      <Modal visible={Boolean(editHistoryMessage)} transparent animationType="fade" onRequestClose={() => setEditHistoryMessage(null)} statusBarTranslucent>
        <View style={styles.historyOverlay}>
          <Pressable style={styles.historyBackdrop} onPress={() => setEditHistoryMessage(null)} />
          {editHistoryMessage ? <View style={styles.historyCard}>
            <View style={styles.historyHeader}><Text style={styles.historyTitle}>{t('Lịch sử chỉnh sửa')}</Text><Pressable onPress={() => setEditHistoryMessage(null)} style={styles.historyClose} accessibilityLabel={t('Đóng')}><X color={palette.inkSoft} size={19} /></Pressable></View>
            <View style={styles.historyCurrent}><Text style={styles.historyLabel}>{t('Nội dung hiện tại')}</Text><Text style={styles.historyText}>{editHistoryMessage.text}</Text></View>
            <ScrollView style={styles.historyList} contentContainerStyle={styles.historyListContent}>{(editHistoryMessage.editHistory || []).map((entry, index) => <View key={`${entry.eventId || entry.seq || entry.editedAt || index}`} style={styles.historyEntry}><View style={styles.historyEntryHeading}><Text style={styles.historyEntryTitle}>{t('Nội dung cũ')} {index + 1}</Text>{entry.editedAt ? <Text style={styles.historyEntryTime}>{new Date(entry.editedAt).toLocaleString(locale)}</Text> : null}</View><Text style={styles.historyText}>{entry.text}</Text></View>)}</ScrollView>
          </View> : null}
        </View>
      </Modal>
      <PinnedMessagesModal
        visible={pinnedListModalOpen}
        onClose={() => setPinnedListModalOpen(false)}
        pinnedMessages={pinnedMessages}
        onSelectMessage={scrollToPinnedMessage}
        onUnpinMessage={message => {
          void toggleMessagePin(conversation.id, message).catch(value => setError(value instanceof Error ? t(value.message) : t('Không bỏ ghim được tin nhắn.')));
        }}
        canUnpin={canPinMessages}
      />
      <Modal
        visible={Boolean(mentionModalTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setMentionModalTarget(null)}
      >
        <View style={styles.mentionModalOverlay}>
          <Pressable style={styles.mentionModalBackdrop} onPress={() => setMentionModalTarget(null)} />
          <View style={styles.mentionModalCard}>
            <View style={styles.mentionModalHeader}>
              <Text style={styles.mentionModalHeaderTitle}>{t('Thông tin thành viên')}</Text>
              <Pressable
                onPress={() => setMentionModalTarget(null)}
                style={styles.mentionModalClose}
                accessibilityLabel={t('Đóng')}
              >
                <X color={palette.inkSoft} size={18} />
              </Pressable>
            </View>

            {mentionModalTarget ? (
              <View style={styles.mentionModalBody}>
                <View style={styles.mentionModalAvatarWrap}>
                  <Avatar
                    name={mentionModalTarget.user.name}
                    uri={mentionModalTarget.user.avatar}
                    size={68}
                    online={mentionModalTarget.user.online}
                  />
                  <View style={styles.mentionModalRoleBadge}>
                    <Text style={styles.mentionModalRoleBadgeText}>{mentionModalTarget.roleLabel}</Text>
                  </View>
                </View>

                <Text style={styles.mentionModalName}>{mentionModalTarget.user.name}</Text>
                {mentionModalTarget.isSelf ? (
                  <Text style={styles.mentionModalSelfHint}>{t('(Tài khoản của bạn)')}</Text>
                ) : null}

                <View style={styles.mentionModalDetails}>
                  {mentionModalTarget.user.department ? (
                    <View style={styles.mentionModalDetailRow}>
                      <Text style={styles.mentionModalDetailLabel}>{t('Phòng ban:')}</Text>
                      <Text style={styles.mentionModalDetailValue}>{mentionModalTarget.user.department}</Text>
                    </View>
                  ) : null}
                  {mentionModalTarget.user.title ? (
                    <View style={styles.mentionModalDetailRow}>
                      <Text style={styles.mentionModalDetailLabel}>{t('Chức vụ:')}</Text>
                      <Text style={styles.mentionModalDetailValue}>{mentionModalTarget.user.title}</Text>
                    </View>
                  ) : null}
                  {mentionModalTarget.user.email ? (
                    <View style={styles.mentionModalDetailRow}>
                      <Text style={styles.mentionModalDetailLabel}>{t('Email:')}</Text>
                      <Text style={styles.mentionModalDetailValue}>{mentionModalTarget.user.email}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.mentionModalActions}>
                  {!mentionModalTarget.isSelf ? (
                    <Pressable
                      style={styles.mentionModalPrimaryAction}
                      onPress={async () => {
                        const targetUser = mentionModalTarget.user;
                        setMentionModalTarget(null);
                        try {
                          setBusy(true);
                          const conv = await useAppStore.getState().createDirectConversation(targetUser);
                          if (conv?.id && conv.id !== conversation?.id) {
                            navigation.navigate('ChatDetail', { conversationId: conv.id });
                          }
                        } catch (err) {
                          setError(err instanceof Error ? t(err.message) : t('Không thể mở cuộc trò chuyện 1-1.'));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <MessageCircle color="#fff" size={18} />
                      <Text style={styles.mentionModalPrimaryActionText}>{t('Nhắn tin nhanh')}</Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    style={styles.mentionModalSecondaryAction}
                    onPress={() => {
                      const targetUser = mentionModalTarget.user;
                      setMentionModalTarget(null);
                      navigation.navigate('UserProfile', { user: targetUser });
                    }}
                  >
                    <UserIcon color={palette.ink} size={18} />
                    <Text style={styles.mentionModalSecondaryActionText}>{t('Xem trang cá nhân')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: palette.canvas },
    header: { minHeight: 82, paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: palette.line, backgroundColor: palette.canvas },
    listStage: { flex: 1, position: 'relative' },
    back: { width: 40, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    headerInfoArea: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9 },
    headerTitle: { flex: 1, minWidth: 0 },
    name: { ...typography.title, color: palette.ink },
    status: { ...typography.caption, color: palette.inkSoft, marginTop: 2 },
    more: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
    offline: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: `${palette.warning}18`, paddingHorizontal: 16, paddingVertical: 8 },
    liveBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: 'rgba(255, 87, 34, 0.12)', borderBottomWidth: 1, borderBottomColor: 'rgba(255, 87, 34, 0.25)' },
    liveBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    livePulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF5722' },
    liveBannerText: { ...typography.caption, color: '#D84315', fontWeight: '600' },
    liveBannerStopBtn: { backgroundColor: '#FF5722', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
    liveBannerStopText: { ...typography.caption, color: '#FFFFFF', fontWeight: '700' },
    offlineText: { ...typography.caption, color: palette.warning, flex: 1 },
    retry: { paddingHorizontal: 8, paddingVertical: 4 },
    retryText: { ...typography.caption, color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold' },
    groupLocked: { paddingHorizontal: 16, paddingVertical: 7, backgroundColor: `${palette.warning}18` },
    groupLockedText: { ...typography.caption, color: palette.warning },
    aiStrip: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: `${palette.online}44`, backgroundColor: `${palette.online}12` },
    aiStripItem: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: palette.paper, borderWidth: 1, borderColor: `${palette.online}44` },
    aiStripText: { ...typography.caption, color: palette.inkSoft, fontSize: 10.5 },
    messageList: { paddingTop: 18, paddingBottom: 14 },
    date: { alignSelf: 'center', ...typography.caption, color: palette.muted, backgroundColor: palette.line, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginVertical: 10 },
    empty: { alignItems: 'center', justifyContent: 'center', padding: 38, marginTop: 'auto' },
    emptyTitle: { ...typography.title, color: palette.ink },
    emptyText: { ...typography.body, color: palette.inkSoft, textAlign: 'center', marginTop: 7 },
    aiEmpty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 28, marginTop: 'auto' },
    aiEmptyIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accent, shadowColor: palette.accent, shadowOpacity: 0.22, shadowRadius: 14, elevation: 5 },
    aiEyebrow: { ...typography.caption, color: palette.accent, fontFamily: 'BeVietnamPro_700Bold', letterSpacing: 2, marginTop: 16 },
    aiStarters: { width: '100%', gap: 9, marginTop: 20 },
    aiStarter: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 16, backgroundColor: palette.paper, borderWidth: 1, borderColor: `${palette.online}44` },
    aiStarterIndex: { width: 25, height: 25, borderRadius: 9, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', color: '#fff', backgroundColor: palette.ink, fontFamily: 'BeVietnamPro_700Bold', fontSize: 11 },
    aiStarterText: { ...typography.caption, flex: 1, color: palette.ink, lineHeight: 18 },
    error: { marginHorizontal: 14, marginBottom: 7, borderRadius: 12, backgroundColor: `${palette.danger}12`, padding: 9 },
    errorText: { ...typography.caption, color: palette.danger },
    replyComposer: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, paddingVertical: 8, backgroundColor: palette.paper, borderTopWidth: 1, borderTopColor: palette.line },
    editComposer: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, paddingVertical: 8, backgroundColor: palette.accentWash, borderTopWidth: 1, borderTopColor: `${palette.accent}55` },
    replyBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: palette.accent },
    replyBody: { flex: 1 },
    replyName: { ...typography.caption, color: palette.accentDeep },
    replyText: { ...typography.caption, color: palette.inkSoft, marginTop: 2 },
    replyClose: { width: 34, height: 34, borderRadius: 12, backgroundColor: palette.canvas, alignItems: 'center', justifyContent: 'center' },
    mentionPanel: { maxHeight: 230, backgroundColor: palette.paper, borderTopWidth: 1, borderTopColor: palette.line, borderBottomWidth: 1, borderBottomColor: palette.line, ...shadow },
    mentionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
    mentionHeading: { ...typography.caption, color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold', fontSize: 12 },
    mentionCloseButton: { padding: 4, borderRadius: 12, backgroundColor: palette.canvas },
    mentionScroll: { maxHeight: 185 },
    mentionOptionsVertical: { paddingVertical: 4, paddingHorizontal: 8 },
    mentionOptionVertical: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, marginVertical: 1 },
    mentionOptionMeta: { flex: 1, minWidth: 0 },
    mentionName: { ...typography.bodyMedium, color: palette.ink, fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 14 },
    mentionSub: { ...typography.caption, color: palette.inkSoft, fontSize: 12, marginTop: 1 },
    mentionModalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    mentionModalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(12,20,27,0.5)' },
    mentionModalCard: { width: '100%', maxWidth: 360, borderRadius: 24, padding: 20, backgroundColor: palette.paper, ...shadow },
    mentionModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: palette.line },
    mentionModalHeaderTitle: { ...typography.title, color: palette.ink, fontSize: 16 },
    mentionModalClose: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas },
    mentionModalBody: { alignItems: 'center', paddingTop: 16 },
    mentionModalAvatarWrap: { position: 'relative', alignItems: 'center', marginBottom: 12 },
    mentionModalRoleBadge: { marginTop: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: palette.accentWash, borderWidth: 1, borderColor: `${palette.accent}40` },
    mentionModalRoleBadgeText: { ...typography.caption, color: palette.accentDeep, fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 11 },
    mentionModalName: { ...typography.heading, color: palette.ink, fontSize: 18, textAlign: 'center' },
    mentionModalSelfHint: { ...typography.caption, color: palette.muted, marginTop: 2 },
    mentionModalDetails: { width: '100%', marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: palette.canvas, gap: 6 },
    mentionModalDetailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    mentionModalDetailLabel: { ...typography.caption, color: palette.muted },
    mentionModalDetailValue: { ...typography.caption, color: palette.ink, fontFamily: 'BeVietnamPro_600SemiBold', flexShrink: 1, textAlign: 'right' },
    mentionModalActions: { width: '100%', marginTop: 18, gap: 10 },
    mentionModalPrimaryAction: { height: 48, borderRadius: 14, backgroundColor: palette.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    mentionModalPrimaryActionText: { ...typography.bodyMedium, color: '#fff', fontFamily: 'BeVietnamPro_700Bold' },
    mentionModalSecondaryAction: { height: 44, borderRadius: 14, backgroundColor: palette.canvas, borderWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    mentionModalSecondaryActionText: { ...typography.bodyMedium, color: palette.ink, fontFamily: 'BeVietnamPro_600SemiBold' },
    composerBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 8, borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.paper },
    composerIconButton: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
    iconRecordingActive: { backgroundColor: `${palette.danger}18` },
    inputPillContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: palette.canvas, borderRadius: 22, borderWidth: 1, borderColor: palette.line, minHeight: 44, paddingLeft: 12, paddingRight: 4 },
    pillInput: { flex: 1, maxHeight: 110, paddingVertical: 8, color: palette.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 14 },
    moreDotsButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    moreDotsButtonActive: { backgroundColor: 'rgba(0, 132, 255, 0.15)' },
    rightActionGroup: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    sendButtonPrimary: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 11, paddingTop: 9, paddingBottom: 9, borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.paper },
    attachGroup: { minHeight: 42, paddingHorizontal: 3, borderRadius: 16, backgroundColor: palette.canvas, flexDirection: 'row', alignItems: 'center' },
    attach: { width: 32, height: 42, alignItems: 'center', justifyContent: 'center' },
    attachRecording: { borderRadius: 11, backgroundColor: `${palette.danger}18` },
    recordingBanner: { minHeight: 34, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: `${palette.danger}12` },
    recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.danger },
    recordingText: { ...typography.caption, color: palette.danger, fontFamily: 'BeVietnamPro_700Bold' },
    input: { maxHeight: 110, minHeight: 44, flex: 1, borderRadius: 19, backgroundColor: palette.canvas, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 10, color: palette.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 14 },
    send: { width: 46, height: 46, borderRadius: 16, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' },
    sendDisabled: { opacity: 0.38 },
    aiNote: { ...typography.caption, paddingHorizontal: 16, paddingBottom: 8, color: palette.muted, textAlign: 'center', backgroundColor: palette.paper, fontSize: 10 },
    historyOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    historyBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(12,20,27,0.45)' },
    historyCard: { width: '100%', maxHeight: '82%', borderRadius: 22, padding: 17, backgroundColor: palette.canvas, ...shadow },
    historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: palette.line },
    historyTitle: { ...typography.title, color: palette.ink },
    historyClose: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper },
    historyCurrent: { marginTop: 14, padding: 11, borderRadius: 13, borderWidth: 1, borderColor: `${palette.accent}55`, backgroundColor: palette.accentWash },
    historyLabel: { ...typography.caption, color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold' },
    historyText: { ...typography.body, color: palette.ink, marginTop: 6 },
    historyList: { maxHeight: 320, marginTop: 12 },
    historyListContent: { gap: 9, paddingBottom: 2 },
    historyEntry: { padding: 11, borderRadius: 13, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper },
    historyEntryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    historyEntryTitle: { ...typography.caption, color: palette.ink, fontFamily: 'BeVietnamPro_700Bold' },
    historyEntryTime: { ...typography.caption, color: palette.muted, fontSize: 9 },
    historyLoadingOverlay: { position: 'absolute', top: 8, left: 0, right: 0, height: 34, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
    unreadJump: { position: 'absolute', top: 12, left: '23%', right: '23%', minHeight: 36, paddingHorizontal: 13, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: palette.paper, borderWidth: 1, borderColor: `${palette.online}66`, shadowColor: palette.ink, shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
    unreadJumpText: { ...typography.caption, color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold' },
    latestJump: { position: 'absolute', right: 16, bottom: 16, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accent, shadowColor: palette.ink, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
    latestCount: { position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.danger, borderWidth: 2, borderColor: palette.canvas },
    latestCountText: { color: '#fff', fontSize: 9, lineHeight: 12, fontFamily: 'BeVietnamPro_700Bold' },
    missing: { ...typography.body, color: palette.inkSoft, padding: 30 },
  });
}
