import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { BookOpen, Camera, ChevronLeft, FilePlus2, ImagePlus, Info, Search, Send, ShieldCheck, Phone, SmilePlus, Video, WifiOff, X } from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore, getConversation } from '../../store/appStore';
import { colors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import { MessageBubble } from '../../components/MessageBubble';
import { MessageActionSheet } from '../../components/MessageActionSheet';
import { TypingIndicator } from '../../components/TypingIndicator';
import { Sticker, ChatMessage, PickerFile, RecallMode } from '../../types';
import { StickerPicker } from '../../components/StickerPicker';
import { attachmentValidationError, canEditMessage, canInteractWithMessage } from '../../utils/messagePolicy';
import { directPeerOnline } from '../../utils/tinodeState';
import { formatMessageDateLabel } from '../../utils/timeFormatting';
import { beginTrustedExternalActivity } from '../../services/appLifecycleService';
import { tinodeClient } from '../../services/tinodeClient';
import { useCallStore } from '../../store/callStore';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatDetail'>;

const AI_STARTERS = [
  'Tóm tắt quy trình nghỉ phép và các bước cần thực hiện.',
  'Các chính sách quan trọng mà nhân viên mới cần biết là gì?',
  'Tìm tài liệu liên quan đến quy trình phê duyệt công việc.',
];

export function ChatDetailScreen({ route, navigation }: Props) {
  const conversation = useAppStore(state => getConversation(state.conversations, route.params.conversationId));
  const connection = useAppStore(state => state.connection);
  const typing = useAppStore(state => state.typingByTopic[conversation?.tinodeTopic || '']);
  const openConversation = useAppStore(state => state.openConversation);
  const loadEarlier = useAppStore(state => state.loadEarlier);
  const markRead = useAppStore(state => state.markRead);
  const sendText = useAppStore(state => state.sendText);
  const sendFile = useAppStore(state => state.sendFile);
  const sendSticker = useAppStore(state => state.sendSticker);
  const sendReaction = useAppStore(state => state.sendReaction);
  const recallMessage = useAppStore(state => state.recallMessage);
  const startCall = useCallStore(state => state.startCall);
  const activeCall = useCallStore(state => state.call);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ message: ChatMessage; previousText: string; previousReply?: ChatMessage['replyTo'] } | null>(null);
  const [editHistoryMessage, setEditHistoryMessage] = useState<ChatMessage | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage['replyTo']>();
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [hasEarlier, setHasEarlier] = useState(true);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const listHasLaidOut = useRef(false);
  const listNearBottom = useRef(true);
  const loadingEarlierRef = useRef(false);
  const inputRef = useRef<TextInput>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingAt = useRef(0);

  useEffect(() => {
    setHasEarlier(true);
    listHasLaidOut.current = false;
    listNearBottom.current = true;
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
    void openConversation(route.params.conversationId).then(() => markRead(route.params.conversationId)).catch(() => {});
    return () => { if (typingTimer.current) clearTimeout(typingTimer.current); };
  }, [markRead, openConversation, route.params.conversationId]);

  const messages = useMemo(() => conversation?.messages || [], [conversation?.messages]);
  const restoreEditDraft = (snapshot: typeof editingMessage) => {
    if (!snapshot) return;
    setEditingMessage(null);
    setText(snapshot.previousText);
    setReplyingTo(snapshot.previousReply);
  };
  const beginEdit = (message: ChatMessage) => {
    if (!canEditMessage(message) || message.sender !== 'outgoing') return;
    setEditingMessage({ message, previousText: text, previousReply: replyingTo });
    setText(message.text);
    setReplyingTo(undefined);
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  const submitText = async (suggestedText = '') => {
    const value = (suggestedText || text).trim();
    if (!value || busy || !conversation) return;
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
        setText(value);
      } finally {
        setBusy(false);
      }
      return;
    }
    setText(''); setBusy(true); setError('');
    const reply = replyingTo && conversation.messages.some(message => message.id === replyingTo.id && !message.recalled)
      ? replyingTo
      : undefined;
    setReplyingTo(undefined);
    try { await sendText(conversation.id, value, reply); } catch (valueError) { setError(valueError instanceof Error ? valueError.message : 'Không gửi được tin nhắn.'); setText(value); setReplyingTo(reply); } finally { setBusy(false); }
  };
  const submitFile = async (file: PickerFile | null) => {
    if (!file || !conversation) return;
    const validation = attachmentValidationError(file);
    if (validation) { setError(validation); return; }
    setBusy(true); setError('');
    try { await sendFile(conversation.id, file); } catch (valueError) { setError(valueError instanceof Error ? valueError.message : 'Không gửi được tệp.'); } finally { setBusy(false); }
  };
  const submitSticker = async (sticker: Sticker) => {
    if (!conversation || busy || editingMessage) return;
    setBusy(true); setError('');
    try { await sendSticker(conversation.id, sticker); } catch (valueError) { setError(valueError instanceof Error ? valueError.message : 'Không gửi được sticker.'); } finally { setBusy(false); }
  };
  const loadEarlierMessages = async (event: any) => {
    if (!conversation || !hasEarlier || loadingEarlier || loadingEarlierRef.current || Number(event?.nativeEvent?.contentOffset?.y || 0) > 48) return;
    loadingEarlierRef.current = true;
    setLoadingEarlier(true);
    try { setHasEarlier(await loadEarlier(conversation.id, 100)); } catch (valueError) { setError(valueError instanceof Error ? valueError.message : 'Không tải thêm được lịch sử chat.'); } finally { loadingEarlierRef.current = false; setLoadingEarlier(false); }
  };
  const handleListScroll = (event: any) => {
    const nativeEvent = event?.nativeEvent || {};
    const offsetY = Number(nativeEvent.contentOffset?.y || 0);
    const contentHeight = Number(nativeEvent.contentSize?.height || 0);
    const viewportHeight = Number(nativeEvent.layoutMeasurement?.height || 0);
    listNearBottom.current = contentHeight - (offsetY + viewportHeight) < 96;
    void loadEarlierMessages(event);
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
  const takePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) throw new Error('ViChat cần quyền camera để chụp và gửi ảnh.');
      beginTrustedExternalActivity();
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] as any, quality: 0.9, allowsEditing: false });
      const asset: any = !result.canceled ? result.assets?.[0] : null;
      await submitFile(asset ? { uri: asset.uri, name: asset.fileName || `anh-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg', size: asset.fileSize } : null);
    } catch (valueError) {
      setError(valueError instanceof Error ? valueError.message : 'Không chụp được ảnh.');
    }
  };
  const replyMessage = (message: ChatMessage) => {
    if (!canInteractWithMessage(message)) return;
    setReplyingTo({ id: message.id, text: message.text || message.file?.name || 'Hình ảnh', senderName: message.senderName || (message.sender === 'outgoing' ? 'Bạn' : 'Thành viên') });
  };
  const copyMessage = (message: ChatMessage) => { if (canInteractWithMessage(message) && message.text) void Clipboard.setStringAsync(message.text); };
  const downloadMessage = (message: ChatMessage) => {
    if (!canInteractWithMessage(message)) return;
    const file = message.file || (message.image ? { name: 'hinh-anh.jpg', mime: 'image/jpeg', size: 0, url: message.image } : null);
    if (!file) return;
    beginTrustedExternalActivity();
    void tinodeClient.downloadFile(file).catch(value => setError(value instanceof Error ? value.message : 'Không mở được tệp.'));
  };
  const shareMessage = (message: ChatMessage) => {
    if (!canInteractWithMessage(message)) return;
    if (message.image || message.file) { downloadMessage(message); return; }
    void Share.share({ message: message.text || 'Tin nhắn ViChat' }).catch(() => {});
  };
  const showMessageDetails = (message: ChatMessage) => Alert.alert(
    'Chi tiết tin nhắn',
    [`Người gửi: ${message.sender === 'outgoing' ? 'Bạn' : message.senderName || 'Thành viên'}`, `Thời gian: ${new Date(message.createdAt || Date.now()).toLocaleString('vi-VN')}`, `Trạng thái: ${message.recalled ? 'Đã thu hồi' : message.deliveryStatus || 'Đã gửi'}`].join('\n'),
  );
  const recallWithMode = (message: ChatMessage, mode: RecallMode) => void recallMessage(conversation?.id || '', message, mode).catch(value => setError(value instanceof Error ? value.message : 'Không thu hồi được tin nhắn.'));
  const requestRecall = (message: ChatMessage) => Alert.alert(
    'Thu hồi tin nhắn',
    'Chọn phạm vi thu hồi cho tin nhắn này.',
    [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Chỉ phía tôi', onPress: () => recallWithMode(message, 'self') },
      { text: 'Thu hồi tất cả', style: 'destructive', onPress: () => recallWithMode(message, 'all') },
    ],
  );
  if (!conversation) return <SafeAreaView style={styles.screen}><Text style={styles.missing}>Cuộc trò chuyện không còn khả dụng.</Text></SafeAreaView>;
  const peer = conversation.members?.find(member => member.uid !== tinodeClient.currentUserId && member.id !== tinodeClient.currentUserId) || conversation.members?.[0];
  const callCapability = !conversation.isGroup && !conversation.isChatbot
    ? tinodeClient.getCallCapability(conversation.tinodeTopic, { isGroup: false, isChatbot: false })
    : { available: false, reason: 'Cuộc gọi mobile chỉ hỗ trợ hội thoại 1-1.' };
  const beginCall = (audioOnly: boolean) => {
    void startCall(conversation.tinodeTopic, audioOnly, { name: peer?.name || conversation.name, avatar: peer?.avatar || conversation.avatarUrl }).catch(value => setError(value instanceof Error ? value.message : 'Không thể bắt đầu cuộc gọi.'));
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}><ChevronLeft color={colors.ink} size={27} /></Pressable>
        <Avatar name={conversation.name} uri={conversation.avatarUrl} size={42} rounded={!conversation.isGroup} online={!conversation.isGroup && directPeerOnline(conversation, tinodeClient.currentUserId)} />
        <View style={styles.headerTitle}><Text numberOfLines={1} style={styles.name}>{conversation.name}</Text><Text style={styles.status}>{conversation.isChatbot ? 'Tra cứu tri thức · Có nguồn kiểm chứng' : conversation.isGroup ? conversation.membersCount : (directPeerOnline(conversation, tinodeClient.currentUserId) ? 'Đang hoạt động' : 'Offline')}</Text></View>
        {callCapability.available ? <><Pressable accessibilityLabel="Gọi thoại" disabled={Boolean(activeCall)} onPress={() => beginCall(true)} style={styles.more}><Phone color={colors.accent} size={19} /></Pressable><Pressable accessibilityLabel="Gọi video" disabled={Boolean(activeCall)} onPress={() => beginCall(false)} style={styles.more}><Video color={colors.accent} size={19} /></Pressable></> : null}
        <Pressable accessibilityLabel="Thông tin cuộc trò chuyện" onPress={() => Alert.alert('Thông tin', conversation.description || (conversation.isGroup ? `${conversation.members?.length || 0} thành viên` : 'Cuộc trò chuyện nội bộ'))} style={styles.more}><Info color={colors.inkSoft} size={21} /></Pressable>
      </View>
      {conversation.isChatbot ? <View style={styles.aiStrip}><View style={styles.aiStripItem}><ShieldCheck color={colors.online} size={14} /><Text style={styles.aiStripText}>Riêng tư</Text></View><View style={styles.aiStripItem}><BookOpen color={colors.accent} size={14} /><Text style={styles.aiStripText}>Nguồn rõ ràng</Text></View></View> : null}
      {connection !== 'connected' ? <View style={styles.offline}><WifiOff color={colors.warning} size={15} /><Text style={styles.offlineText}>Realtime đang gián đoạn. Tin nhắn sẽ gửi lại khi kết nối ổn định.</Text></View> : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => `${item.id}-${item.seq || ''}`}
          onScroll={handleListScroll}
          scrollEventThrottle={120}
          renderItem={({ item, index }) => {
            const currentDay = formatMessageDateLabel(item.createdAt);
            const previousDay = index > 0 ? formatMessageDateLabel(messages[index - 1].createdAt) : '';
            return <View>{currentDay && currentDay !== previousDay ? <Text style={styles.date}>{currentDay}</Text> : null}<MessageBubble message={item} onLongPress={() => { if (!item.recalled) setSelectedMessage(item); }} onShowEditHistory={message => setEditHistoryMessage(message)} /></View>;
          }}
          contentContainerStyle={styles.messageList}
          ListHeaderComponent={loadingEarlier ? <View style={styles.historyLoading}><ActivityIndicator color={colors.accent} /></View> : null}
          onContentSizeChange={() => {
            if (!listHasLaidOut.current || listNearBottom.current) listRef.current?.scrollToEnd({ animated: false });
          }}
          onLayout={() => {
            if (!listHasLaidOut.current) {
              listHasLaidOut.current = true;
              listRef.current?.scrollToEnd({ animated: false });
            }
          }}
          maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
          removeClippedSubviews={Platform.OS === 'android'}
          initialNumToRender={20}
          maxToRenderPerBatch={12}
          updateCellsBatchingPeriod={40}
          windowSize={7}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={conversation.isChatbot ? <View style={styles.aiEmpty}><View style={styles.aiEmptyIcon}><Search color="#fff" size={27} /></View><Text style={styles.aiEyebrow}>VICHAT AI</Text><Text style={styles.emptyTitle}>Hỏi kho tri thức doanh nghiệp</Text><Text style={styles.emptyText}>ViChat AI tìm nội dung liên quan và đưa nguồn để bạn kiểm chứng.</Text><View style={styles.aiStarters}>{AI_STARTERS.map((prompt, index) => <Pressable key={prompt} disabled={busy || connection !== 'connected'} onPress={() => void submitText(prompt)} style={styles.aiStarter}><Text style={styles.aiStarterIndex}>{index + 1}</Text><Text style={styles.aiStarterText}>{prompt}</Text></Pressable>)}</View></View> : <View style={styles.empty}><Text style={styles.emptyTitle}>Bắt đầu cuộc trò chuyện</Text><Text style={styles.emptyText}>Tin nhắn và tệp được đồng bộ realtime giữa mobile và web.</Text></View>}
        />
        <TypingIndicator visible={Boolean(typing)} />
        {error ? <Pressable onPress={() => setError('')} style={styles.error}><Text style={styles.errorText}>{error}</Text></Pressable> : null}
        {editingMessage ? <View style={styles.editComposer}><View style={styles.replyBar} /><View style={styles.replyBody}><Text numberOfLines={1} style={styles.replyName}>Sửa tin nhắn</Text><Text numberOfLines={1} style={styles.replyText}>{editingMessage.message.text}</Text></View><Pressable disabled={busy} onPress={() => restoreEditDraft(editingMessage)} style={styles.replyClose}><X color={colors.inkSoft} size={18} /></Pressable></View> : null}
        {!editingMessage && replyingTo ? <View style={styles.replyComposer}><View style={styles.replyBar} /><View style={styles.replyBody}><Text numberOfLines={1} style={styles.replyName}>Đang trả lời {replyingTo.senderName}</Text><Text numberOfLines={1} style={styles.replyText}>{replyingTo.text}</Text></View><Pressable onPress={() => setReplyingTo(undefined)} style={styles.replyClose}><X color={colors.inkSoft} size={18} /></Pressable></View> : null}
        <View style={styles.composer}>
          {!conversation.isChatbot ? <View style={styles.attachGroup}>
            <Pressable accessibilityLabel="Chụp ảnh" onPress={() => void takePhoto()} disabled={busy || Boolean(editingMessage)} style={styles.attach}><Camera color={colors.accent} size={18} /></Pressable>
            <Pressable accessibilityLabel="Chọn ảnh" onPress={() => void chooseFile(true)} disabled={busy || Boolean(editingMessage)} style={styles.attach}><ImagePlus color={colors.accent} size={19} /></Pressable>
            <Pressable accessibilityLabel="Chọn tệp" onPress={() => void chooseFile(false)} disabled={busy || Boolean(editingMessage)} style={styles.attach}><FilePlus2 color={colors.accent} size={18} /></Pressable>
            <Pressable accessibilityLabel="Chọn sticker" onPress={() => setStickerPickerOpen(true)} disabled={busy || Boolean(editingMessage)} style={styles.attach}><SmilePlus color={colors.accent} size={18} /></Pressable>
          </View> : null}
          <TextInput ref={inputRef} value={text} onChangeText={value => { setText(value); if (value && conversation.tinodeTopic && !editingMessage) signalTyping(conversation.id); }} placeholder={editingMessage ? 'Nhập nội dung mới...' : conversation.isChatbot ? 'Hỏi về quy trình, chính sách, tài liệu...' : 'Viết tin nhắn...'} placeholderTextColor={colors.muted} multiline maxLength={120000} style={styles.input} editable={!busy} />
          <Pressable onPress={() => void submitText()} disabled={busy || !text.trim()} style={[styles.send, (!text.trim() || busy) && styles.sendDisabled]}><Send color="#fff" size={18} /></Pressable>
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
        onRecall={message => requestRecall(message)}
      />
      <StickerPicker visible={stickerPickerOpen} onClose={() => setStickerPickerOpen(false)} onSelect={sticker => { void submitSticker(sticker); }} />
      <Modal visible={Boolean(editHistoryMessage)} transparent animationType="fade" onRequestClose={() => setEditHistoryMessage(null)} statusBarTranslucent>
        <View style={styles.historyOverlay}>
          <Pressable style={styles.historyBackdrop} onPress={() => setEditHistoryMessage(null)} />
          {editHistoryMessage ? <View style={styles.historyCard}>
            <View style={styles.historyHeader}><Text style={styles.historyTitle}>Lịch sử chỉnh sửa</Text><Pressable onPress={() => setEditHistoryMessage(null)} style={styles.historyClose}><X color={colors.inkSoft} size={19} /></Pressable></View>
            <View style={styles.historyCurrent}><Text style={styles.historyLabel}>Nội dung hiện tại</Text><Text style={styles.historyText}>{editHistoryMessage.text}</Text></View>
            <ScrollView style={styles.historyList} contentContainerStyle={styles.historyListContent}>{(editHistoryMessage.editHistory || []).map((entry, index) => <View key={`${entry.eventId || entry.seq || entry.editedAt || index}`} style={styles.historyEntry}><View style={styles.historyEntryHeading}><Text style={styles.historyEntryTitle}>Nội dung cũ {index + 1}</Text>{entry.editedAt ? <Text style={styles.historyEntryTime}>{new Date(entry.editedAt).toLocaleString('vi-VN')}</Text> : null}</View><Text style={styles.historyText}>{entry.text}</Text></View>)}</ScrollView>
          </View> : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: { minHeight: 82, paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.canvas },
  back: { width: 40, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, minWidth: 0 },
  name: { ...typography.title, color: colors.ink },
  status: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  more: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#FFF4DB', paddingHorizontal: 16, paddingVertical: 8 },
  offlineText: { ...typography.caption, color: colors.warning, flex: 1 },
  aiStrip: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#DDEBE4', backgroundColor: '#F3F8F5' },
  aiStripItem: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.paper, borderWidth: 1, borderColor: '#DDEBE4' },
  aiStripText: { ...typography.caption, color: colors.inkSoft, fontSize: 10.5 },
  messageList: { paddingTop: 18, paddingBottom: 14, flexGrow: 1, justifyContent: 'flex-end' },
  date: { alignSelf: 'center', ...typography.caption, color: colors.muted, backgroundColor: colors.line, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginVertical: 10 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 38, marginTop: 'auto' },
  emptyTitle: { ...typography.title, color: colors.ink },
  emptyText: { ...typography.body, color: colors.inkSoft, textAlign: 'center', marginTop: 7 },
  aiEmpty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 28, marginTop: 'auto' },
  aiEmptyIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.22, shadowRadius: 14, elevation: 5 },
  aiEyebrow: { ...typography.caption, color: colors.accent, fontFamily: 'BeVietnamPro_700Bold', letterSpacing: 2, marginTop: 16 },
  aiStarters: { width: '100%', gap: 9, marginTop: 20 },
  aiStarter: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: '#DDEBE4' },
  aiStarterIndex: { width: 25, height: 25, borderRadius: 9, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', color: '#fff', backgroundColor: '#123B39', fontFamily: 'BeVietnamPro_700Bold', fontSize: 11 },
  aiStarterText: { ...typography.caption, flex: 1, color: colors.ink, lineHeight: 18 },
  error: { marginHorizontal: 14, marginBottom: 7, borderRadius: 12, backgroundColor: '#FDECEC', padding: 9 },
  errorText: { ...typography.caption, color: colors.danger },
  replyComposer: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, paddingVertical: 8, backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.line },
  editComposer: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, paddingVertical: 8, backgroundColor: '#FFF5EF', borderTopWidth: 1, borderTopColor: '#F2D3C4' },
  replyBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.accent },
  replyBody: { flex: 1 },
  replyName: { ...typography.caption, color: colors.accentDeep },
  replyText: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  replyClose: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 11, paddingTop: 9, paddingBottom: 9, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper },
  attachGroup: { minHeight: 42, paddingHorizontal: 3, borderRadius: 16, backgroundColor: colors.canvas, flexDirection: 'row', alignItems: 'center' },
  attach: { width: 32, height: 42, alignItems: 'center', justifyContent: 'center' },
  input: { maxHeight: 110, minHeight: 44, flex: 1, borderRadius: 19, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 10, color: colors.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 14 },
  send: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.38 },
  aiNote: { ...typography.caption, paddingHorizontal: 16, paddingBottom: 8, color: colors.muted, textAlign: 'center', backgroundColor: colors.paper, fontSize: 10 },
  historyOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  historyBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(12,20,27,0.45)' },
  historyCard: { width: '100%', maxHeight: '82%', borderRadius: 22, padding: 17, backgroundColor: colors.canvas, ...shadow },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: colors.line },
  historyTitle: { ...typography.title, color: colors.ink },
  historyClose: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  historyCurrent: { marginTop: 14, padding: 11, borderRadius: 13, borderWidth: 1, borderColor: '#F2D3C4', backgroundColor: '#FFF5EF' },
  historyLabel: { ...typography.caption, color: colors.accentDeep, fontFamily: 'BeVietnamPro_700Bold' },
  historyText: { ...typography.body, color: colors.ink, marginTop: 6 },
  historyList: { maxHeight: 320, marginTop: 12 },
  historyListContent: { gap: 9, paddingBottom: 2 },
  historyEntry: { padding: 11, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  historyEntryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  historyEntryTitle: { ...typography.caption, color: colors.ink, fontFamily: 'BeVietnamPro_700Bold' },
  historyEntryTime: { ...typography.caption, color: colors.muted, fontSize: 9 },
  historyLoading: { height: 36, alignItems: 'center', justifyContent: 'center' },
  missing: { ...typography.body, color: colors.inkSoft, padding: 30 },
});
