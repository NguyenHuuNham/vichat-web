import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ChevronLeft, FilePlus2, ImagePlus, MoreVertical, Send, WifiOff } from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore, getConversation } from '../../store/appStore';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import { MessageBubble } from '../../components/MessageBubble';
import { TypingIndicator } from '../../components/TypingIndicator';
import { ChatMessage, PickerFile } from '../../types';
import { attachmentValidationError, canRecallMessage } from '../../utils/messagePolicy';
import { formatMessageDateLabel } from '../../utils/timeFormatting';

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
    try { await sendText(conversation.id, value); } catch (valueError) { setError(valueError instanceof Error ? valueError.message : 'Không gửi được tin nhắn.'); setText(value); } finally { setBusy(false); }
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
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.9, allowsEditing: false });
        const asset: any = !result.canceled ? result.assets?.[0] : null;
        if (asset) file = { uri: asset.uri, name: asset.fileName || `anh-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg', size: asset.fileSize };
      } else {
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
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] as any, quality: 0.9, allowsEditing: false });
      const asset: any = !result.canceled ? result.assets?.[0] : null;
      await submitFile(asset ? { uri: asset.uri, name: asset.fileName || `anh-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg', size: asset.fileSize } : null);
    } catch (valueError) {
      setError(valueError instanceof Error ? valueError.message : 'Không chụp được ảnh.');
    }
  };
  const onLongPress = (message: ChatMessage) => {
    const buttons: any[] = [
      { text: 'Sao chép', onPress: () => { if (message.text) void Clipboard.setStringAsync(message.text); } },
      { text: '👍 Thích', onPress: () => void sendReaction(route.params.conversationId, message, '👍').catch(value => setError(value instanceof Error ? value.message : 'Không thêm được reaction.')) },
    ];
    if (message.sender === 'outgoing' && canRecallMessage(message)) buttons.push({ text: 'Thu hồi', style: 'destructive', onPress: () => void recallMessage(route.params.conversationId, message).catch(value => setError(value instanceof Error ? value.message : 'Không thu hồi được tin nhắn.')) });
    buttons.push({ text: 'Hủy', style: 'cancel' });
    Alert.alert('Thao tác tin nhắn', message.recalled ? 'Tin nhắn đã được thu hồi.' : 'Chọn thao tác', buttons);
  };
  if (!conversation) return <SafeAreaView style={styles.screen}><Text style={styles.missing}>Cuộc trò chuyện không còn khả dụng.</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}><ChevronLeft color={colors.ink} size={27} /></Pressable>
        <Avatar name={conversation.name} uri={conversation.avatarUrl} size={42} rounded={!conversation.isGroup} online={!conversation.isGroup && conversation.members?.some(member => member.online)} />
        <View style={styles.headerTitle}><Text numberOfLines={1} style={styles.name}>{conversation.name}</Text><Text style={styles.status}>{conversation.isChatbot ? 'Trợ lý AI nội bộ' : conversation.membersCount || (connection === 'connected' ? 'Đang hoạt động' : 'Offline')}</Text></View>
        <Pressable onPress={() => Alert.alert('Thông tin', conversation.description || (conversation.isGroup ? `${conversation.members?.length || 0} thành viên` : 'Cuộc trò chuyện nội bộ'))} style={styles.more}><MoreVertical color={colors.inkSoft} size={21} /></Pressable>
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
            return <View>{currentDay && currentDay !== previousDay ? <Text style={styles.date}>{currentDay}</Text> : null}<MessageBubble message={item} onRecall={() => {}} onReaction={emoji => void sendReaction(conversation.id, item, emoji)} onLongPress={() => onLongPress(item)} /></View>;
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
        <View style={styles.composer}>
          <Pressable onPress={() => void takePhoto()} disabled={busy} style={styles.attach}><Camera color={colors.accent} size={19} /></Pressable>
          <Pressable onPress={() => void chooseFile(true)} disabled={busy} style={styles.attach}><ImagePlus color={colors.accent} size={20} /></Pressable>
          <Pressable onPress={() => void chooseFile(false)} disabled={busy} style={styles.attach}><FilePlus2 color={colors.accent} size={20} /></Pressable>
          <TextInput value={text} onChangeText={value => { setText(value); if (value && conversation.tinodeTopic) signalTyping(conversation.id); }} placeholder="Viết tin nhắn..." placeholderTextColor={colors.muted} multiline maxLength={120000} style={styles.input} editable={!busy} />
          <Pressable onPress={submitText} disabled={busy || !text.trim()} style={[styles.send, (!text.trim() || busy) && styles.sendDisabled]}><Send color="#fff" size={18} /></Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: { minHeight: 70, paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.canvas },
  back: { width: 35, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, minWidth: 0 },
  name: { ...typography.title, color: colors.ink },
  status: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  more: { width: 38, height: 40, alignItems: 'center', justifyContent: 'center' },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#FFF4DB', paddingHorizontal: 16, paddingVertical: 8 },
  offlineText: { ...typography.caption, color: colors.warning, flex: 1 },
  messageList: { paddingTop: 14, paddingBottom: 12, flexGrow: 1, justifyContent: 'flex-end' },
  date: { alignSelf: 'center', ...typography.caption, color: colors.muted, backgroundColor: colors.line, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginVertical: 10 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 38, marginTop: 'auto' },
  emptyTitle: { ...typography.title, color: colors.ink },
  emptyText: { ...typography.body, color: colors.inkSoft, textAlign: 'center', marginTop: 7 },
  error: { marginHorizontal: 14, marginBottom: 7, borderRadius: 12, backgroundColor: '#FDECEC', padding: 9 },
  errorText: { ...typography.caption, color: colors.danger },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, paddingHorizontal: 11, paddingTop: 8, paddingBottom: 8, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper },
  attach: { width: 35, height: 42, alignItems: 'center', justifyContent: 'center' },
  input: { maxHeight: 110, minHeight: 42, flex: 1, borderRadius: 19, backgroundColor: colors.canvas, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 10, color: colors.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 14 },
  send: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.38 },
  missing: { ...typography.body, color: colors.inkSoft, padding: 30 },
});
