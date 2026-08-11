import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ChevronLeft, FilePlus2, ImagePlus, Info, Send, WifiOff, X } from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore, getConversation } from '../../store/appStore';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import { MessageBubble } from '../../components/MessageBubble';
import { MessageActionSheet } from '../../components/MessageActionSheet';
import { TypingIndicator } from '../../components/TypingIndicator';
import { ChatMessage, PickerFile } from '../../types';
import { attachmentValidationError, canInteractWithMessage } from '../../utils/messagePolicy';
import { formatMessageDateLabel } from '../../utils/timeFormatting';
import { beginTrustedExternalActivity } from '../../services/appLifecycleService';
import { tinodeClient } from '../../services/tinodeClient';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatDetail'>;

export function ChatDetailScreen({ route, navigation }: Props) {
  const conversation = useAppStore(state => getConversation(state.conversations, route.params.conversationId));
  const connection = useAppStore(state => state.connection);
  const typing = useAppStore(state => state.typingByTopic[conversation?.tinodeTopic || '']);
  const openConversation = useAppStore(state => state.openConversation);
  const markRead = useAppStore(state => state.markRead);
  const sendText = useAppStore(state => state.sendText);
  const sendFile = useAppStore(state => state.sendFile);
  const sendReaction = useAppStore(state => state.sendReaction);
  const recallMessage = useAppStore(state => state.recallMessage);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage['replyTo']>();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingAt = useRef(0);

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
  const submitText = async () => {
    const value = text.trim();
    if (!value || busy || !conversation) return;
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
  if (!conversation) return <SafeAreaView style={styles.screen}><Text style={styles.missing}>Cuộc trò chuyện không còn khả dụng.</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}><ChevronLeft color={colors.ink} size={27} /></Pressable>
        <Avatar name={conversation.name} uri={conversation.avatarUrl} size={42} rounded={!conversation.isGroup} online={!conversation.isGroup && conversation.members?.some(member => member.online)} />
        <View style={styles.headerTitle}><Text numberOfLines={1} style={styles.name}>{conversation.name}</Text><Text style={styles.status}>{conversation.isChatbot ? 'Trợ lý AI nội bộ' : conversation.membersCount || (connection === 'connected' ? 'Đang hoạt động' : 'Offline')}</Text></View>
        <Pressable accessibilityLabel="Thông tin cuộc trò chuyện" onPress={() => Alert.alert('Thông tin', conversation.description || (conversation.isGroup ? `${conversation.members?.length || 0} thành viên` : 'Cuộc trò chuyện nội bộ'))} style={styles.more}><Info color={colors.inkSoft} size={21} /></Pressable>
      </View>
      {connection !== 'connected' ? <View style={styles.offline}><WifiOff color={colors.warning} size={15} /><Text style={styles.offlineText}>Realtime đang gián đoạn. Tin nhắn sẽ gửi lại khi kết nối ổn định.</Text></View> : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => `${item.id}-${item.seq || ''}`}
          renderItem={({ item, index }) => {
            const currentDay = formatMessageDateLabel(item.createdAt);
            const previousDay = index > 0 ? formatMessageDateLabel(messages[index - 1].createdAt) : '';
            return <View>{currentDay && currentDay !== previousDay ? <Text style={styles.date}>{currentDay}</Text> : null}<MessageBubble message={item} onLongPress={() => { if (!item.recalled) setSelectedMessage(item); }} /></View>;
          }}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>Bắt đầu cuộc trò chuyện</Text><Text style={styles.emptyText}>Tin nhắn và tệp được đồng bộ realtime giữa mobile và web.</Text></View>}
        />
        <TypingIndicator visible={Boolean(typing)} />
        {error ? <Pressable onPress={() => setError('')} style={styles.error}><Text style={styles.errorText}>{error}</Text></Pressable> : null}
        {replyingTo ? <View style={styles.replyComposer}><View style={styles.replyBar} /><View style={styles.replyBody}><Text numberOfLines={1} style={styles.replyName}>Đang trả lời {replyingTo.senderName}</Text><Text numberOfLines={1} style={styles.replyText}>{replyingTo.text}</Text></View><Pressable onPress={() => setReplyingTo(undefined)} style={styles.replyClose}><X color={colors.inkSoft} size={18} /></Pressable></View> : null}
        <View style={styles.composer}>
          <View style={styles.attachGroup}>
            <Pressable accessibilityLabel="Chụp ảnh" onPress={() => void takePhoto()} disabled={busy} style={styles.attach}><Camera color={colors.accent} size={18} /></Pressable>
            <Pressable accessibilityLabel="Chọn ảnh" onPress={() => void chooseFile(true)} disabled={busy} style={styles.attach}><ImagePlus color={colors.accent} size={19} /></Pressable>
            <Pressable accessibilityLabel="Chọn tệp" onPress={() => void chooseFile(false)} disabled={busy} style={styles.attach}><FilePlus2 color={colors.accent} size={18} /></Pressable>
          </View>
          <TextInput value={text} onChangeText={value => { setText(value); if (value && conversation.tinodeTopic) signalTyping(conversation.id); }} placeholder="Viết tin nhắn..." placeholderTextColor={colors.muted} multiline maxLength={120000} style={styles.input} editable={!busy} />
          <Pressable onPress={submitText} disabled={busy || !text.trim()} style={[styles.send, (!text.trim() || busy) && styles.sendDisabled]}><Send color="#fff" size={18} /></Pressable>
        </View>
      </KeyboardAvoidingView>
      <MessageActionSheet
        message={selectedMessage}
        onClose={() => setSelectedMessage(null)}
        onReply={replyMessage}
        onCopy={copyMessage}
        onShare={shareMessage}
        onDownload={downloadMessage}
        onDetails={showMessageDetails}
        onReaction={(message, emoji) => void sendReaction(conversation.id, message, emoji).catch(value => setError(value instanceof Error ? value.message : 'Không thêm được biểu cảm.'))}
        onRecall={message => void recallMessage(conversation.id, message).catch(value => setError(value instanceof Error ? value.message : 'Không thu hồi được tin nhắn.'))}
      />
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
  messageList: { paddingTop: 18, paddingBottom: 14, flexGrow: 1, justifyContent: 'flex-end' },
  date: { alignSelf: 'center', ...typography.caption, color: colors.muted, backgroundColor: colors.line, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginVertical: 10 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 38, marginTop: 'auto' },
  emptyTitle: { ...typography.title, color: colors.ink },
  emptyText: { ...typography.body, color: colors.inkSoft, textAlign: 'center', marginTop: 7 },
  error: { marginHorizontal: 14, marginBottom: 7, borderRadius: 12, backgroundColor: '#FDECEC', padding: 9 },
  errorText: { ...typography.caption, color: colors.danger },
  replyComposer: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, paddingVertical: 8, backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.line },
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
  missing: { ...typography.body, color: colors.inkSoft, padding: 30 },
});
