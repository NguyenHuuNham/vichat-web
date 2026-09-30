import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState, type AudioRecorder } from 'expo-audio';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { ArrowDown, BarChart3, BookOpen, ChevronLeft, CircleStop, FilePlus2, ImagePlus, Info, Mic, Pencil, Search, Send, ShieldCheck, Phone, SmilePlus, Video, WifiOff, X } from 'lucide-react-native';
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
import { TypingIndicator } from '../../components/TypingIndicator';
import { Sticker, ChatMessage, ConversationMember, PickerFile, Poll, RecallMode } from '../../types';
import { StickerPicker } from '../../components/StickerPicker';
import { attachmentValidationError, canEditMessage, canInteractWithMessage } from '../../utils/messagePolicy';
import { directPeerOnline } from '../../utils/tinodeState';
import { formatMessageDateLabel } from '../../utils/timeFormatting';
import { beginTrustedExternalActivity } from '../../services/appLifecycleService';
import { tinodeClient } from '../../services/tinodeClient';
import { useCallStore } from '../../store/callStore';
import { PollComposer } from '../../components/PollComposer';
import { groupSettingEnabled, memberIsAdmin } from '../../utils/groupSettings';
import { pollCanViewerLock } from '../../utils/poll';
import { getMentionContext, insertMentionAt, matchesMentionCandidate, mentionTokenFor, mentionTokenExists, serializeMentionForTransport } from '../../utils/mentionPolicy';
import { accountIdForMember, identitiesOverlap } from '../../utils/identity';
import { conversationNicknameForMember } from '../../utils/conversationSync';
import { CHAT_BOTTOM_THRESHOLD, firstUnreadMessageIndex, isNearChatBottom, isUserVisibleMessage, messageKey } from '../../utils/chatScroll';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatDetail'>;

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
  const conversation = useAppStore(state => getConversation(state.conversations, route.params.conversationId));
  const session = useAppStore(state => state.session);
  const directory = useAppStore(state => state.directory);
  const connection = useAppStore(state => state.connection);
  const reconnect = useAppStore(state => state.reconnect);
  const typing = useAppStore(state => state.typingByTopic[conversation?.tinodeTopic || '']);
  const openConversation = useAppStore(state => state.openConversation);
  const loadEarlier = useAppStore(state => state.loadEarlier);
  const markRead = useAppStore(state => state.markRead);
  const sendText = useAppStore(state => state.sendText);
  const sendFile = useAppStore(state => state.sendFile);
  const sendVoice = useAppStore(state => state.sendVoice);
  const sendSticker = useAppStore(state => state.sendSticker);
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
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [recallTarget, setRecallTarget] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ message: ChatMessage; previousText: string; previousReply?: ChatMessage['replyTo'] } | null>(null);
  const [editHistoryMessage, setEditHistoryMessage] = useState<ChatMessage | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage['replyTo']>();
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [mentionContext, setMentionContext] = useState<{ start: number; end: number; query: string } | null>(null);
  const [selectedMentions, setSelectedMentions] = useState<any[]>([]);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [hasEarlier, setHasEarlier] = useState(true);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [unreadJumpDismissed, setUnreadJumpDismissed] = useState(false);
  const [nicknameMember, setNicknameMember] = useState<ConversationMember | null>(null);
  const composerTextRef = useRef('');
  const listRef = useRef<FlashListRef<ChatMessage>>(null);
  const listHasLaidOut = useRef(false);
  const listNearBottom = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const latestMessageKeyRef = useRef('');
  const lastMarkedReadSeqRef = useRef(0);
  const markingReadRef = useRef(false);
  const loadingEarlierRef = useRef(false);
  const historyLoadArmedRef = useRef(true);
  const inputRef = useRef<TextInput>(null);
  const recordingRef = useRef<AudioRecorder | null>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const audioRecorderState = useAudioRecorderState(audioRecorder, 250);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingAt = useRef(0);

  useEffect(() => {
    setHasEarlier(true);
    listHasLaidOut.current = false;
    listNearBottom.current = true;
    initialScrollDoneRef.current = false;
    latestMessageKeyRef.current = '';
    lastMarkedReadSeqRef.current = 0;
    markingReadRef.current = false;
    historyLoadArmedRef.current = true;
    setIsNearBottom(true);
    setNewMessageCount(0);
    setUnreadJumpDismissed(false);
  }, [route.params.conversationId]);

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
    void openConversation(route.params.conversationId).catch(() => {});
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      const activeRecording = recordingRef.current;
      recordingRef.current = null;
      if (activeRecording?.isRecording) void activeRecording.stop().catch(() => {});
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
    };
  }, [connection, openConversation, route.params.conversationId]);

  useEffect(() => {
    if (recording) setRecordingDuration(audioRecorderState.durationMillis);
  }, [audioRecorderState.durationMillis, recording]);

  const messages = useMemo(() => conversation?.messages || [], [conversation?.messages]);
  const firstUnreadIndex = useMemo(
    () => firstUnreadMessageIndex(messages, conversation?.readSeq, conversation?.badge || 0),
    [conversation?.badge, conversation?.readSeq, messages],
  );
  const unreadCount = Math.max(0, Number(conversation?.badge) || 0);
  const latestMessage = messages[messages.length - 1];
  const latestMessageKey = latestMessage ? messageKey(latestMessage) : '';
  const firstUnreadKey = firstUnreadIndex === null ? '' : messageKey(messages[firstUnreadIndex]);

  const markConversationRead = useCallback(() => {
    if (!conversation?.id || !conversation.tinodeTopic || !initialScrollDoneRef.current || !listNearBottom.current || markingReadRef.current) return;
    const latestSeq = messages.reduce((latest, message) => Math.max(latest, Number(message.seq) || 0), 0);
    if (latestSeq <= 0 || latestSeq <= lastMarkedReadSeqRef.current) return;
    lastMarkedReadSeqRef.current = latestSeq;
    markingReadRef.current = true;
    void markRead(conversation.id).catch(() => {
      lastMarkedReadSeqRef.current = 0;
    }).finally(() => {
      markingReadRef.current = false;
    });
  }, [conversation?.id, conversation?.tinodeTopic, markRead, messages]);

  const requestInitialScroll = useCallback(() => {
    if (!listHasLaidOut.current || initialScrollDoneRef.current || messages.length === 0) return;
    const targetIndex = firstUnreadIndex ?? messages.length - 1;
    initialScrollDoneRef.current = true;
    const viewPosition = firstUnreadIndex === null ? 1 : 0.18;
    void listRef.current?.scrollToIndex({ index: targetIndex, animated: false, viewPosition }).catch(() => {
      if (firstUnreadIndex === null) listRef.current?.scrollToEnd({ animated: false });
    });
  }, [firstUnreadIndex, messages.length]);

  useEffect(() => {
    if (latestMessageKeyRef.current && latestMessageKey && latestMessageKeyRef.current !== latestMessageKey && !listNearBottom.current && latestMessage?.sender === 'incoming' && isUserVisibleMessage(latestMessage)) {
      setNewMessageCount(current => current + 1);
    }
    if (latestMessageKey) latestMessageKeyRef.current = latestMessageKey;
  }, [latestMessage, latestMessageKey]);

  useEffect(() => {
    if (listHasLaidOut.current) requestInitialScroll();
  }, [requestInitialScroll]);

  useEffect(() => {
    setUnreadJumpDismissed(false);
  }, [firstUnreadKey]);
  const mentionCandidates = useMemo(() => {
    if (!conversation?.isGroup || editingMessage || !mentionContext) return [];
    const candidates: any[] = [
      { id: '__all__', name: 'Mọi người', mentionAliases: ['all'], isAll: true },
      ...(conversation.members || []),
    ];
    return candidates
      .filter((candidate, index, all) => all.findIndex(item => String(item.id || item.uid) === String(candidate.id || candidate.uid)) === index)
      .filter(candidate => matchesMentionCandidate(candidate, mentionContext.query))
      .slice(0, 8);
  }, [conversation?.isGroup, conversation?.members, editingMessage, mentionContext]);

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
        setError('Tin nhắn này không còn đủ điều kiện để sửa.');
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
        setError(valueError instanceof Error ? valueError.message : 'Không sửa được tin nhắn.');
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
    try { await sendText(conversation.id, value, reply, mentions); } catch (valueError) { setError(valueError instanceof Error ? valueError.message : 'Không gửi được tin nhắn.'); composerTextRef.current = value; setText(value); setSelectedMentions(mentions); setReplyingTo(reply); } finally { setBusy(false); }
  };
  const submitFile = async (file: PickerFile | null) => {
    if (!file || !conversation || !canSendMessages) return;
    const validation = attachmentValidationError(file);
    if (validation) { setError(validation); return; }
    setBusy(true); setError('');
    try { await sendFile(conversation.id, file); } catch (valueError) { setError(valueError instanceof Error ? valueError.message : 'Không gửi được tệp.'); } finally { setBusy(false); }
  };
  const startVoiceRecording = async () => {
    if (!conversation || busy || recordingRef.current || !canSendMessages) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error('ViChat cần quyền micro để ghi âm voice.');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'duckOthers' });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      recordingRef.current = audioRecorder;
      setRecordingDuration(0);
      setRecording(true);
      setError('');
    } catch (valueError) {
      recordingRef.current = null;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
      setError(valueError instanceof Error ? valueError.message : 'Không thể bắt đầu ghi âm voice.');
    }
  };
  const stopVoiceRecording = async () => {
    const activeRecording = recordingRef.current || audioRecorder;
    if (!activeRecording || !conversation || !canSendMessages) return;
    recordingRef.current = null;
    setRecording(false);
    setBusy(true);
    setError('');
    try {
      await activeRecording.stop();
      const status = activeRecording.getStatus();
      const uri = activeRecording.uri || status.url;
      const durationMs = Number(status.durationMillis) || recordingDuration;
      if (!uri || durationMs < 500) throw new Error('Voice quá ngắn. Hãy ghi ít nhất nửa giây.');
      await sendVoice(conversation.id, { uri, name: `voice-${Date.now()}.m4a`, type: 'audio/mp4' }, durationMs);
    } catch (valueError) {
      setError(valueError instanceof Error ? valueError.message : 'Không gửi được voice.');
    } finally {
      setBusy(false);
      setRecordingDuration(0);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
    }
  };
  const submitSticker = async (sticker: Sticker) => {
    if (!conversation || busy || editingMessage || !canSendMessages) return;
    setBusy(true); setError('');
    try { await sendSticker(conversation.id, sticker); } catch (valueError) { setError(valueError instanceof Error ? valueError.message : 'Không gửi được sticker.'); } finally { setBusy(false); }
  };
  const submitPoll = async (poll: Pick<Poll, 'question' | 'options' | 'settings'>) => {
    if (!conversation || !canSendMessages) return;
    setBusy(true); setError('');
    try { await createPoll(conversation.id, poll); } catch (valueError) { setError(valueError instanceof Error ? valueError.message : 'Không tạo được bình chọn.'); } finally { setBusy(false); }
  };
  const submitPollVote = async (message: ChatMessage, optionIds: string[]) => {
    if (!conversation?.isGroup || !message.poll || !canSendMessages) return;
    setBusy(true); setError('');
    try { await votePoll(conversation.id, message.poll.id, optionIds); } catch (valueError) { setError(valueError instanceof Error ? valueError.message : 'Không gửi được lựa chọn.'); } finally { setBusy(false); }
  };
  const submitPollOption = async (message: ChatMessage, optionText: string) => {
    if (!conversation?.isGroup || !message.poll || !optionText.trim() || !canSendMessages) return;
    setBusy(true); setError('');
    try { await addPollOption(conversation.id, message.poll.id, `option-${Date.now()}`, optionText.trim()); } catch (valueError) { setError(valueError instanceof Error ? valueError.message : 'Không thêm được phương án.'); } finally { setBusy(false); }
  };
  const submitPollLock = async (message: ChatMessage) => {
    if (!conversation?.isGroup || !message.poll || !canSendMessages) return;
    setBusy(true); setError('');
    try { await lockPoll(conversation.id, message.poll.id); } catch (valueError) { setError(valueError instanceof Error ? valueError.message : 'Không khóa được bình chọn.'); } finally { setBusy(false); }
  };
  const loadEarlierMessages = async () => {
    if (!conversation || messages.length === 0 || !initialScrollDoneRef.current || !hasEarlier || !historyLoadArmedRef.current || loadingEarlier || loadingEarlierRef.current) return;
    historyLoadArmedRef.current = false;
    loadingEarlierRef.current = true;
    setLoadingEarlier(true);
    try { setHasEarlier(await loadEarlier(conversation.id, 40)); } catch (valueError) { historyLoadArmedRef.current = true; setError(valueError instanceof Error ? valueError.message : 'Không tải thêm được lịch sử chat.'); } finally { loadingEarlierRef.current = false; setLoadingEarlier(false); }
  };
  const handleListScroll = (event: any) => {
    const nativeEvent = event?.nativeEvent || {};
    const offsetY = Number(nativeEvent.contentOffset?.y || 0);
    if (offsetY > 96) historyLoadArmedRef.current = true;
    const contentHeight = Number(nativeEvent.contentSize?.height || 0);
    const viewportHeight = Number(nativeEvent.layoutMeasurement?.height || 0);
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
    if (firstUnreadIndex === null) return;
    setUnreadJumpDismissed(true);
    listNearBottom.current = false;
    setIsNearBottom(false);
    void listRef.current?.scrollToIndex({ index: firstUnreadIndex, animated: true, viewPosition: 0.18 }).catch(() => {});
  };
  const jumpToLatest = () => {
    listNearBottom.current = true;
    setIsNearBottom(true);
    setNewMessageCount(0);
    listRef.current?.scrollToEnd({ animated: true });
    markConversationRead();
  };
  const chooseFile = async (imageOnly = false) => {
    try {
      let file: PickerFile | null = null;
      if (imageOnly) {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) throw new Error('ViChat cần quyền truy cập ảnh để gửi hình từ thư viện.');
        beginTrustedExternalActivity();
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.9, allowsEditing: false });
        const asset: any = !result.canceled ? result.assets?.[0] : null;
        if (asset) file = { uri: asset.uri, name: asset.fileName || `anh-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg', size: asset.fileSize };
      } else {
        beginTrustedExternalActivity();
        const result: any = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
        const asset = !result.canceled ? result.assets?.[0] : null;
        if (asset) file = { uri: asset.uri, name: asset.name || 'tep-dinh-kem', type: asset.mimeType || 'application/octet-stream', size: asset.size };
      }
      await submitFile(file);
    } catch (valueError) {
      setError(valueError instanceof Error ? valueError.message : 'Không gửi được tệp.');
    }
  };
  const replyMessage = (message: ChatMessage) => {
    if (!canInteractWithMessage(message)) return;
    setReplyingTo({ id: message.id, text: message.text || (message.sticker ? 'Sticker' : message.file?.name || 'Hình ảnh'), senderName: message.senderName || (message.sender === 'outgoing' ? 'Bạn' : 'Thành viên') });
  };
  const copyMessage = (message: ChatMessage) => { if (canInteractWithMessage(message) && message.text) void Clipboard.setStringAsync(message.text); };
  const downloadMessage = (message: ChatMessage) => {
    if (!canInteractWithMessage(message)) return;
    if (message.sticker) return;
    const file = message.file || (message.image ? { name: 'hình-ảnh.jpg', mime: 'image/jpeg', size: 0, url: message.image } : null);
    if (!file) return;
    beginTrustedExternalActivity();
    void tinodeClient.downloadFile(file).catch(value => setError(value instanceof Error ? value.message : 'Không mở được tệp.'));
  };
  const shareMessage = (message: ChatMessage) => {
    if (!canInteractWithMessage(message)) return;
    if (message.sticker) {
      void Share.share({ message: 'Sticker ViChat' }).catch(() => {});
      return;
    }
    if (message.image || message.file) { downloadMessage(message); return; }
    void Share.share({ message: message.text || 'Tin nhắn ViChat' }).catch(() => {});
  };
  const showMessageDetails = (message: ChatMessage) => Alert.alert(
    'Chi tiết tin nhắn',
    [`Người gửi: ${message.sender === 'outgoing' ? 'Bạn' : message.senderName || 'Thành viên'}`, `Thời gian: ${new Date(message.createdAt || Date.now()).toLocaleString('vi-VN')}`, `Trạng thái: ${message.recalled ? 'Đã thu hồi' : message.deliveryStatus || 'Đã gửi'}`].join('\n'),
  );
  const recallWithMode = async (message: ChatMessage, mode: RecallMode) => {
    setBusy(true);
    try {
      await recallMessage(conversation?.id || '', message, mode);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Không thu hồi được tin nhắn.');
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
  if (!conversation) return <SafeAreaView style={styles.screen}><Text style={styles.missing}>Cuộc trò chuyện không còn khả dụng.</Text></SafeAreaView>;
  const currentMember = conversation.members?.find(member => identitiesOverlap(member, session?.user));
  const realtimeReady = connection === 'connected' && Boolean(conversation.tinodeTopic);
  const canCreatePoll = realtimeReady && conversation.isGroup && (memberIsAdmin(currentMember) || groupSettingEnabled(conversation.groupSettings, 'allowPolls'));
  const canSendMessages = realtimeReady && (!conversation.isGroup || memberIsAdmin(currentMember) || groupSettingEnabled(conversation.groupSettings, 'allowMessages'));
  const canPinMessages = realtimeReady && conversation.isGroup && (memberIsAdmin(currentMember) || groupSettingEnabled(conversation.groupSettings, 'allowPinMessages'));
  const viewerIdentities = [session?.user.id, session?.user.uid, tinodeClient.currentUserId].filter(Boolean).map(String);
  const peer = conversation.members?.find(member => !identitiesOverlap(member, session?.user) && !identitiesOverlap(member, { id: tinodeClient.currentUserId, uid: tinodeClient.currentUserId })) || conversation.members?.[0];
  const peerAccountId = peer ? accountIdForMember(peer, directory) : '';
  const canEditNickname = Boolean(!conversation.isGroup && !conversation.isChatbot && peer && peerAccountId && peer.type !== 'bot' && !peer.isChatbot);
  const callCapability = !conversation.isGroup && !conversation.isChatbot
    ? tinodeClient.getCallCapability(conversation.tinodeTopic, { isGroup: false, isChatbot: false })
    : { available: false, reason: 'Cuộc gọi mobile chỉ hỗ trợ hội thoại 1-1.' };
  const beginCall = (audioOnly: boolean) => {
    void startCall(conversation.tinodeTopic, audioOnly, { name: peer?.name || conversation.name, avatar: peer?.avatar || conversation.avatarUrl }).catch(value => setError(value instanceof Error ? value.message : 'Không thể bắt đầu cuộc gọi.'));
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}><ChevronLeft color={palette.ink} size={27} /></Pressable>
        <Avatar name={conversation.name} uri={conversation.avatarUrl} size={42} rounded={!conversation.isGroup} online={!conversation.isGroup && directPeerOnline(conversation, tinodeClient.currentUserId)} />
        <View style={styles.headerTitle}><Text numberOfLines={1} style={styles.name}>{conversation.name}</Text><Text style={styles.status}>{conversation.isChatbot ? 'Tra cứu tri thức · Có nguồn kiểm chứng' : conversation.isGroup ? conversation.membersCount : (directPeerOnline(conversation, tinodeClient.currentUserId) ? 'Đang hoạt động' : 'Offline')}</Text></View>
        {callCapability.available ? <><Pressable accessibilityLabel="Gọi thoại" disabled={Boolean(activeCall)} onPress={() => beginCall(true)} style={styles.more}><Phone color={palette.accent} size={19} /></Pressable><Pressable accessibilityLabel="Gọi video" disabled={Boolean(activeCall)} onPress={() => beginCall(false)} style={styles.more}><Video color={palette.accent} size={19} /></Pressable></> : null}
        {canEditNickname ? <Pressable accessibilityLabel="Đổi biệt danh" onPress={() => { if (peer) setNicknameMember(peer); }} style={styles.more}><Pencil color={palette.accent} size={19} /></Pressable> : null}
        <Pressable accessibilityLabel="Thông tin cuộc trò chuyện" onPress={() => conversation.isGroup ? navigation.navigate('GroupInfo', { conversationId: conversation.id }) : Alert.alert('Thông tin', conversation.description || 'Cuộc trò chuyện nội bộ')} style={styles.more}><Info color={palette.inkSoft} size={21} /></Pressable>
      </View>
      {conversation.isChatbot ? <View style={styles.aiStrip}><View style={styles.aiStripItem}><ShieldCheck color={palette.online} size={14} /><Text style={styles.aiStripText}>Riêng tư</Text></View><View style={styles.aiStripItem}><BookOpen color={palette.accent} size={14} /><Text style={styles.aiStripText}>Nguồn rõ ràng</Text></View></View> : null}
      {connection !== 'connected' ? <View style={styles.offline}><WifiOff color={palette.warning} size={15} /><Text style={styles.offlineText}>Realtime đang gián đoạn. Gửi tin nhắn tạm dừng đến khi kết nối lại.</Text><Pressable onPress={() => void reconnect()} style={styles.retry}><Text style={styles.retryText}>Thử lại</Text></Pressable></View> : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <View style={styles.listStage}>
        <FlashList
          ref={listRef}
          data={messages}
          keyExtractor={(item, index) => messageKey(item) || `message-${index}`}
          onScroll={handleListScroll}
          onStartReached={() => { void loadEarlierMessages(); }}
          onStartReachedThreshold={0.08}
          scrollEventThrottle={120}
          onLoad={() => {
            listHasLaidOut.current = true;
            requestInitialScroll();
          }}
          renderItem={({ item, index }) => {
            const currentDay = formatMessageDateLabel(item.createdAt);
            const previousDay = index > 0 ? formatMessageDateLabel(messages[index - 1].createdAt) : '';
            return <View>{currentDay && currentDay !== previousDay ? <Text style={styles.date}>{currentDay}</Text> : null}<MessageBubble message={item} viewerIdentities={viewerIdentities} groupMembers={conversation.members || []} isGroup={conversation.isGroup} onLongPress={() => { if (!item.recalled) setSelectedMessage(item); }} onShowEditHistory={message => setEditHistoryMessage(message)} onPollVote={submitPollVote} onPollAddOption={submitPollOption} onPollLock={submitPollLock} /></View>;
          }}
          contentContainerStyle={styles.messageList}
          onLayout={() => {
            if (!listHasLaidOut.current) listHasLaidOut.current = true;
          }}
          maintainVisibleContentPosition={{ autoscrollToBottomThreshold: 0.12, animateAutoScrollToBottom: false }}
          removeClippedSubviews={false}
          getItemType={item => item.type}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={conversation.isChatbot ? <View style={styles.aiEmpty}><View style={styles.aiEmptyIcon}><Search color="#fff" size={27} /></View><Text style={styles.aiEyebrow}>VICHAT AI</Text><Text style={styles.emptyTitle}>Hỏi kho tri thức doanh nghiệp</Text><Text style={styles.emptyText}>ViChat AI tìm nội dung liên quan và đưa nguồn để bạn kiểm chứng.</Text><View style={styles.aiStarters}>{AI_STARTERS.map((prompt, index) => <Pressable key={prompt} disabled={busy || connection !== 'connected'} onPress={() => void submitText(prompt)} style={styles.aiStarter}><Text style={styles.aiStarterIndex}>{index + 1}</Text><Text style={styles.aiStarterText}>{prompt}</Text></Pressable>)}</View></View> : <View style={styles.empty}><Text style={styles.emptyTitle}>Bắt đầu cuộc trò chuyện</Text><Text style={styles.emptyText}>Tin nhắn và tệp được đồng bộ realtime giữa mobile và web.</Text></View>}
        />
        {loadingEarlier ? <View pointerEvents="none" style={styles.historyLoadingOverlay}><ActivityIndicator color={palette.accent} /></View> : null}
        {firstUnreadIndex !== null && !unreadJumpDismissed ? <Pressable accessibilityLabel="Đi tới tin nhắn chưa đọc" onPress={jumpToUnread} style={styles.unreadJump}><Text style={styles.unreadJumpText}>{unreadCount > 0 ? `${unreadCount} tin chưa đọc` : 'Tin chưa đọc'}</Text><ArrowDown color={palette.accentDeep} size={15} /></Pressable> : null}
        {!isNearBottom ? <Pressable accessibilityLabel="Đi tới tin nhắn mới nhất" onPress={jumpToLatest} style={styles.latestJump}><ArrowDown color="#fff" size={21} strokeWidth={2.5} />{newMessageCount > 0 ? <View style={styles.latestCount}><Text style={styles.latestCountText}>{newMessageCount > 99 ? '99+' : newMessageCount}</Text></View> : null}</Pressable> : null}
        </View>
        <TypingIndicator visible={Boolean(typing)} />
        {conversation.isGroup && !canSendMessages ? <View style={styles.groupLocked}><Text style={styles.groupLockedText}>Quản trị viên đã tạm khóa quyền gửi tin nhắn trong nhóm.</Text></View> : null}
        {error ? <Pressable onPress={() => setError('')} style={styles.error}><Text style={styles.errorText}>{error}</Text></Pressable> : null}
        {editingMessage ? <View style={styles.editComposer}><View style={styles.replyBar} /><View style={styles.replyBody}><Text numberOfLines={1} style={styles.replyName}>Sửa tin nhắn</Text><Text numberOfLines={1} style={styles.replyText}>{editingMessage.message.text}</Text></View><Pressable disabled={busy} onPress={() => restoreEditDraft(editingMessage)} style={styles.replyClose}><X color={palette.inkSoft} size={18} /></Pressable></View> : null}
        {!editingMessage && replyingTo ? <View style={styles.replyComposer}><View style={styles.replyBar} /><View style={styles.replyBody}><Text numberOfLines={1} style={styles.replyName}>Đang trả lời {replyingTo.senderName}</Text><Text numberOfLines={1} style={styles.replyText}>{replyingTo.text}</Text></View><Pressable onPress={() => setReplyingTo(undefined)} style={styles.replyClose}><X color={palette.inkSoft} size={18} /></Pressable></View> : null}
        {mentionCandidates.length > 0 ? <View style={styles.mentionPanel}>
          <Text style={styles.mentionHeading}>Nhắc đến</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mentionOptions} keyboardShouldPersistTaps="always">
            {mentionCandidates.map(candidate => <Pressable key={String(candidate.id || candidate.uid)} onPress={() => selectMention(candidate)} style={styles.mentionOption}>
              <Avatar name={candidate.isAll ? 'Mọi người' : candidate.name} uri={candidate.avatar} size={30} rounded={!candidate.isAll} />
              <Text numberOfLines={1} style={styles.mentionName}>{candidate.isAll ? 'Mọi người' : candidate.name}</Text>
            </Pressable>)}
          </ScrollView>
        </View> : null}
        {recording ? <View style={styles.recordingBanner}><View style={styles.recordingDot} /><Text style={styles.recordingText}>Đang ghi voice {formatVoiceDuration(recordingDuration)} · chạm mic để dừng</Text></View> : null}
        <View style={styles.composer}>
          {!conversation.isChatbot ? <View style={styles.attachGroup}>
            <Pressable accessibilityLabel={recording ? 'Dừng ghi âm' : 'Ghi âm voice'} onPress={() => void (recording ? stopVoiceRecording() : startVoiceRecording())} disabled={(busy && !recording) || Boolean(editingMessage) || !canSendMessages} style={[styles.attach, recording && styles.attachRecording]}>{recording ? <CircleStop color={palette.danger} size={18} /> : <Mic color={palette.accent} size={18} />}</Pressable>
            <Pressable accessibilityLabel="Chọn ảnh" onPress={() => void chooseFile(true)} disabled={busy || recording || Boolean(editingMessage) || !canSendMessages} style={styles.attach}><ImagePlus color={palette.accent} size={19} /></Pressable>
            <Pressable accessibilityLabel="Chọn tệp" onPress={() => void chooseFile(false)} disabled={busy || recording || Boolean(editingMessage) || !canSendMessages} style={styles.attach}><FilePlus2 color={palette.accent} size={18} /></Pressable>
            <Pressable accessibilityLabel="Chọn sticker" onPress={() => setStickerPickerOpen(true)} disabled={busy || recording || Boolean(editingMessage) || !canSendMessages} style={styles.attach}><SmilePlus color={palette.accent} size={18} /></Pressable>
            {conversation.isGroup && canCreatePoll ? <Pressable accessibilityLabel="Tạo bình chọn" onPress={() => setPollComposerOpen(true)} disabled={busy || recording || Boolean(editingMessage) || !canSendMessages} style={styles.attach}><BarChart3 color={palette.accent} size={18} /></Pressable> : null}
          </View> : null}
          <TextInput ref={inputRef} value={text} onChangeText={updateComposerText} onSelectionChange={event => {
            const caret = Number(event.nativeEvent.selection?.start || 0);
            setMentionContext(!editingMessage && conversation.isGroup ? getMentionContext(composerTextRef.current, caret) : null);
          }} placeholder={editingMessage ? 'Nhập nội dung mới...' : conversation.isChatbot ? 'Hỏi về quy trình, chính sách, tài liệu...' : 'Viết tin nhắn...'} placeholderTextColor={palette.muted} multiline maxLength={120000} style={styles.input} editable={!busy && !recording && canSendMessages} />
          <Pressable onPress={() => void submitText()} disabled={busy || recording || !text.trim() || !canSendMessages} style={[styles.send, (!text.trim() || busy || recording || !canSendMessages) && styles.sendDisabled]}><Send color="#fff" size={18} /></Pressable>
        </View>
        {conversation.isChatbot ? <Text style={styles.aiNote}>Kiểm tra nguồn trước khi dùng thông tin để ra quyết định.</Text> : null}
      </KeyboardAvoidingView>
      <MessageActionSheet
        message={selectedMessage}
        onClose={() => setSelectedMessage(null)}
        onReply={replyMessage}
        onCopy={copyMessage}
        onShare={shareMessage}
        onDownload={downloadMessage}
        onDetails={showMessageDetails}
        onEdit={beginEdit}
        onReaction={(message, emoji) => void sendReaction(conversation.id, message, emoji).catch(value => setError(value instanceof Error ? value.message : 'Không thêm được biểu cảm.'))}
        canPin={canPinMessages}
        onPin={message => void toggleMessagePin(conversation.id, message).catch(value => setError(value instanceof Error ? value.message : 'Không ghim được tin nhắn.'))}
        onRecall={message => requestRecall(message)}
      />
      <StickerPicker visible={stickerPickerOpen} onClose={() => setStickerPickerOpen(false)} onSelect={sticker => { void submitSticker(sticker); }} />
      <PollComposer visible={pollComposerOpen} allowPin={canPinMessages} onClose={() => setPollComposerOpen(false)} onSubmit={poll => { void submitPoll(poll); }} />
      <ConfirmDialog
        visible={Boolean(recallTarget)}
        title="Thu hồi tin nhắn"
        message="Chọn phạm vi thu hồi cho tin nhắn này."
        eyebrow="THAO TÁC TIN NHẮN"
        confirmLabel="Thu hồi tất cả"
        secondaryLabel="Chỉ phía tôi"
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
            <View style={styles.historyHeader}><Text style={styles.historyTitle}>Lịch sử chỉnh sửa</Text><Pressable onPress={() => setEditHistoryMessage(null)} style={styles.historyClose}><X color={palette.inkSoft} size={19} /></Pressable></View>
            <View style={styles.historyCurrent}><Text style={styles.historyLabel}>Nội dung hiện tại</Text><Text style={styles.historyText}>{editHistoryMessage.text}</Text></View>
            <ScrollView style={styles.historyList} contentContainerStyle={styles.historyListContent}>{(editHistoryMessage.editHistory || []).map((entry, index) => <View key={`${entry.eventId || entry.seq || entry.editedAt || index}`} style={styles.historyEntry}><View style={styles.historyEntryHeading}><Text style={styles.historyEntryTitle}>Nội dung cũ {index + 1}</Text>{entry.editedAt ? <Text style={styles.historyEntryTime}>{new Date(entry.editedAt).toLocaleString('vi-VN')}</Text> : null}</View><Text style={styles.historyText}>{entry.text}</Text></View>)}</ScrollView>
          </View> : null}
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
    headerTitle: { flex: 1, minWidth: 0 },
    name: { ...typography.title, color: palette.ink },
    status: { ...typography.caption, color: palette.inkSoft, marginTop: 2 },
    more: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
    offline: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: `${palette.warning}18`, paddingHorizontal: 16, paddingVertical: 8 },
    offlineText: { ...typography.caption, color: palette.warning, flex: 1 },
    retry: { paddingHorizontal: 8, paddingVertical: 4 },
    retryText: { ...typography.caption, color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold' },
    groupLocked: { paddingHorizontal: 16, paddingVertical: 7, backgroundColor: `${palette.warning}18` },
    groupLockedText: { ...typography.caption, color: palette.warning },
    aiStrip: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: `${palette.online}44`, backgroundColor: `${palette.online}12` },
    aiStripItem: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: palette.paper, borderWidth: 1, borderColor: `${palette.online}44` },
    aiStripText: { ...typography.caption, color: palette.inkSoft, fontSize: 10.5 },
    messageList: { paddingTop: 18, paddingBottom: 14, flexGrow: 1, justifyContent: 'flex-end' },
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
    mentionPanel: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 7, backgroundColor: palette.paper, borderTopWidth: 1, borderTopColor: palette.line },
    mentionHeading: { ...typography.caption, color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold', marginBottom: 6 },
    mentionOptions: { gap: 8, paddingRight: 6 },
    mentionOption: { minWidth: 92, maxWidth: 142, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 13, backgroundColor: palette.canvas, borderWidth: 1, borderColor: palette.line },
    mentionName: { ...typography.caption, color: palette.ink, flexShrink: 1 },
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
