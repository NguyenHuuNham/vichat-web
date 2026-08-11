import { FileText, MoreHorizontal, RotateCcw } from 'lucide-react-native';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { tinodeClient } from '../services/tinodeClient';
import { ChatMessage } from '../types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { formatMessageTime } from '../utils/timeFormatting';

interface Props {
  message: ChatMessage;
  onRecall: () => void;
  onReaction: (emoji: string) => void;
  onLongPress: () => void;
}

export function MessageBubble({ message, onRecall: _onRecall, onReaction: _onReaction, onLongPress }: Props) {
  if (message.type === 'system') return <Text style={styles.system}>{message.text}</Text>;
  const outgoing = message.sender === 'outgoing';
  return (
    <View style={[styles.line, outgoing ? styles.outgoingLine : styles.incomingLine]}>
      <Pressable onLongPress={onLongPress} delayLongPress={350} style={[styles.bubble, outgoing ? styles.outgoing : styles.incoming, message.pending && styles.pending, message.failed && styles.failed]}>
        {message.image ? <Image source={{ uri: message.image, headers: tinodeClient.getMediaHeaders() }} style={styles.image} resizeMode="cover" /> : null}
        {message.file ? (
          <Pressable style={styles.file} onPress={() => void tinodeClient.downloadFile(message.file!).catch(error => Alert.alert('Khong mo duoc tep', error instanceof Error ? error.message : 'Thu lai sau.'))}>
            <View style={styles.fileIcon}><FileText color={outgoing ? '#fff' : colors.accent} size={20} /></View>
            <View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.fileName, outgoing && styles.outgoingText]}>{message.file.name}</Text><Text style={[styles.fileMeta, outgoing && styles.outgoingSub]}>{message.file.mime} · {message.file.size ? `${Math.round(message.file.size / 1024)} KB` : 'Tệp'}</Text></View>
          </Pressable>
        ) : null}
        {message.text && !message.recalled ? <Text style={[styles.text, outgoing && styles.outgoingText]}>{message.text}</Text> : null}
        {message.recalled ? <View style={styles.recalled}><RotateCcw color={outgoing ? '#fff' : colors.muted} size={14} /><Text style={[styles.recalledText, outgoing && styles.outgoingText]}>Tin nhắn đã được thu hồi</Text></View> : null}
        <View style={styles.meta}><Text style={[styles.time, outgoing && styles.outgoingSub]}>{formatMessageTime(message.createdAt || message.time)}</Text>{outgoing ? <Text style={[styles.receipt, message.deliveryStatus === 'read' && styles.receiptRead]}>{message.deliveryStatus === 'read' ? '✓✓' : message.pending ? '…' : '✓'}</Text> : null}</View>
      </Pressable>
      {message.reactions && Object.keys(message.reactions).length > 0 ? <View style={[styles.reactions, outgoing && styles.reactionsOut]}><Text style={styles.reactionText}>{Object.entries(message.reactions).map(([emoji, count]) => `${emoji} ${count}`).join('  ')}</Text></View> : null}
      {message.failed ? <Text style={styles.failedText}>Chưa gửi · chạm để thử lại</Text> : null}
      <MoreHorizontal color="transparent" size={1} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { marginBottom: 9, paddingHorizontal: 14 },
  outgoingLine: { alignItems: 'flex-end' },
  incomingLine: { alignItems: 'flex-start' },
  bubble: { maxWidth: '86%', minWidth: 70, borderRadius: 20, paddingHorizontal: 13, paddingTop: 10, paddingBottom: 7, ...({ shadowColor: '#17212B', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 }) },
  outgoing: { backgroundColor: colors.bubbleOutgoing, borderBottomRightRadius: 6 },
  incoming: { backgroundColor: colors.bubbleIncoming, borderBottomLeftRadius: 6 },
  pending: { opacity: 0.65 },
  failed: { borderWidth: 1, borderColor: colors.danger },
  text: { ...typography.body, color: colors.ink, paddingBottom: 2 },
  outgoingText: { color: '#fff' },
  image: { width: 230, height: 180, borderRadius: 13, marginBottom: 5, backgroundColor: colors.accentWash },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 210, paddingBottom: 3 },
  fileIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  fileName: { ...typography.bodyMedium, color: colors.ink },
  fileMeta: { ...typography.caption, color: colors.muted, marginTop: 2 },
  outgoingSub: { color: 'rgba(255,255,255,0.72)' },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 2 },
  time: { ...typography.caption, color: colors.muted, fontSize: 10 },
  receipt: { color: 'rgba(255,255,255,0.75)', fontFamily: 'BeVietnamPro_700Bold', fontSize: 11 },
  receiptRead: { color: '#BCEBFF' },
  recalled: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  recalledText: { ...typography.caption, color: colors.muted, fontStyle: 'italic' },
  reactions: { marginTop: -12, marginLeft: 14, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  reactionsOut: { marginRight: 14, marginLeft: 0 },
  reactionText: { ...typography.caption, color: colors.ink },
  failedText: { ...typography.caption, color: colors.danger, marginTop: 3 },
  system: { ...typography.caption, color: colors.muted, textAlign: 'center', marginVertical: 12, paddingHorizontal: 30 },
});
