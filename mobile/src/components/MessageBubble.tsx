import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Download, FileText, ImageOff, Phone, RotateCcw, Video, X } from 'lucide-react-native';
import { beginTrustedExternalActivity } from '../services/appLifecycleService';
import { normalizeMediaUrl, tinodeClient } from '../services/tinodeClient';
import { ChatMessage, FileAttachment } from '../types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { formatMessageTime } from '../utils/timeFormatting';

interface Props {
  message: ChatMessage;
  onLongPress: () => void;
}

export function MessageBubble({ message, onLongPress }: Props) {
  if (message.type === 'system') return <Text style={styles.system}>{message.text}</Text>;
  if (message.type === 'call' && message.call) {
    return <View style={[styles.line, message.sender === 'outgoing' ? styles.outgoingLine : styles.incomingLine]}><View style={[styles.bubble, message.sender === 'outgoing' ? styles.outgoing : styles.incoming]}><View style={styles.callHistory}><View style={styles.callIcon}>{message.call.audioOnly ? <Phone color={message.sender === 'outgoing' ? '#fff' : colors.accent} size={19} /> : <Video color={message.sender === 'outgoing' ? '#fff' : colors.accent} size={19} />}</View><View style={{ flex: 1 }}><Text style={[styles.text, message.sender === 'outgoing' && styles.outgoingText]}>{message.text}</Text><Text style={[styles.fileMeta, message.sender === 'outgoing' && styles.outgoingSub]}>{message.call.audioOnly ? 'Cuộc gọi thoại' : 'Cuộc gọi video'}</Text></View></View><View style={styles.meta}><Text style={[styles.time, message.sender === 'outgoing' && styles.outgoingSub]}>{formatMessageTime(message.createdAt || message.time)}</Text></View></View></View>;
  }
  const outgoing = message.sender === 'outgoing';
  const mediaOnly = Boolean(message.image && !message.text?.trim() && !message.recalled);
  const receipt = message.pending || message.deliveryStatus === 'sending'
    ? '…'
    : ['received', 'read'].includes(message.deliveryStatus || '') ? '✓✓' : '✓';
  return (
    <View style={[styles.line, outgoing ? styles.outgoingLine : styles.incomingLine]}>
      <Pressable onLongPress={onLongPress} delayLongPress={350} style={[styles.bubble, outgoing ? styles.outgoing : styles.incoming, mediaOnly && styles.mediaBubble, message.pending && styles.pending, message.failed && styles.failed]}>
        {message.replyTo && !message.recalled ? <View style={[styles.reply, outgoing && styles.replyOutgoing]}><Text numberOfLines={1} style={[styles.replyName, outgoing && styles.outgoingText]}>{message.replyTo.senderName}</Text><Text numberOfLines={1} style={[styles.replyText, outgoing && styles.outgoingSub]}>{message.replyTo.text}</Text></View> : null}
        {message.image ? <ProtectedMessageImage uri={message.image} file={message.file} outgoing={outgoing} /> : null}
        {message.file && !message.image ? (
          <Pressable style={styles.file} onPress={() => openAttachment(message.file!)}>
            <View style={styles.fileIcon}><FileText color={outgoing ? '#fff' : colors.accent} size={20} /></View>
            <View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.fileName, outgoing && styles.outgoingText]}>{message.file.name}</Text><Text style={[styles.fileMeta, outgoing && styles.outgoingSub]}>{message.file.mime} · {message.file.size ? `${Math.round(message.file.size / 1024)} KB` : 'Tệp'}</Text></View>
          </Pressable>
        ) : null}
        {message.text && !message.recalled ? <Text style={[styles.text, outgoing && styles.outgoingText]}>{message.text}</Text> : null}
        {message.recalled ? <View style={styles.recalled}><RotateCcw color={outgoing ? '#fff' : colors.muted} size={14} /><Text style={[styles.recalledText, outgoing && styles.outgoingText]}>Tin nhắn đã được thu hồi</Text></View> : null}
        <View style={[styles.meta, mediaOnly && styles.mediaMeta]}><Text style={[styles.time, outgoing && !mediaOnly && styles.outgoingSub, mediaOnly && styles.mediaMetaText]}>{formatMessageTime(message.createdAt || message.time)}</Text>{outgoing ? <Text style={[styles.receipt, message.deliveryStatus === 'read' && styles.receiptRead]}>{receipt}</Text> : null}</View>
      </Pressable>
      {message.reactions && Object.keys(message.reactions).length > 0 ? <View style={[styles.reactions, outgoing && styles.reactionsOut]}><Text style={styles.reactionText}>{Object.entries(message.reactions).map(([emoji, count]) => `${emoji} ${count}`).join('  ')}</Text></View> : null}
      {message.failed ? <Text style={styles.failedText}>Chưa gửi · chạm để thử lại</Text> : null}
    </View>
  );
}

function ProtectedMessageImage({ uri, file, outgoing }: { uri: string; file?: FileAttachment; outgoing: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const [mediaVersion, setMediaVersion] = useState(() => tinodeClient.getMediaVersion(uri));
  const [source, setSource] = useState('');
  const [failed, setFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [ratio, setRatio] = useState(4 / 3);

  useEffect(() => {
    const unsubscribe = tinodeClient.onEvent(event => {
      if (event.type === 'media-invalidated' && event.url === normalizeMediaUrl(uri)) {
        setMediaVersion(tinodeClient.getMediaVersion(uri));
      }
    });
    return () => { unsubscribe(); };
  }, [uri]);

  useEffect(() => {
    let active = true;
    setSource(''); setFailed(false);
    void tinodeClient.cacheImage(uri).then(value => { if (active) setSource(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt, uri, mediaVersion]);

  const height = Math.max(150, Math.min(330, 250 / Math.max(0.55, Math.min(2.2, ratio))));
  const attachment = file || { name: 'hinh-anh.jpg', mime: 'image/jpeg', size: 0, url: uri };
  if (failed) return <Pressable onPress={() => setAttempt(value => value + 1)} style={styles.imageState}><ImageOff color={outgoing ? '#fff' : colors.accent} size={25} /><Text style={[styles.imageStateText, outgoing && styles.outgoingText]}>Không tải được ảnh · chạm để thử lại</Text></Pressable>;
  if (!source) return <View style={styles.imageState}><ActivityIndicator color={outgoing ? '#fff' : colors.accent} /><Text style={[styles.imageStateText, outgoing && styles.outgoingText]}>Đang tải ảnh...</Text></View>;
  return (
    <>
      <Pressable onPress={() => setViewerOpen(true)}><Image source={{ uri: source }} style={[styles.image, { height }]} resizeMode="cover" onLoad={event => { const { width, height: loadedHeight } = event.nativeEvent.source; if (width && loadedHeight) setRatio(width / loadedHeight); }} /></Pressable>
      <Modal visible={viewerOpen} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setViewerOpen(false)}>
        <View style={styles.viewer}>
          <Image source={{ uri: source }} style={styles.viewerImage} resizeMode="contain" />
          <Pressable onPress={() => setViewerOpen(false)} style={[styles.viewerButton, styles.viewerClose]}><X color="#fff" size={23} /></Pressable>
          <Pressable onPress={() => openAttachment(attachment)} style={[styles.viewerButton, styles.viewerDownload]}><Download color="#fff" size={22} /></Pressable>
        </View>
      </Modal>
    </>
  );
}

function openAttachment(file: FileAttachment) {
  beginTrustedExternalActivity();
  void tinodeClient.downloadFile(file).catch(error => Alert.alert('Không mở được tệp', error instanceof Error ? error.message : 'Thử lại sau.'));
}

const styles = StyleSheet.create({
  line: { marginBottom: 12, paddingHorizontal: 16 },
  outgoingLine: { alignItems: 'flex-end' },
  incomingLine: { alignItems: 'flex-start' },
  bubble: { maxWidth: '86%', minWidth: 70, borderRadius: 21, paddingHorizontal: 15, paddingTop: 12, paddingBottom: 8, shadowColor: '#17212B', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  outgoing: { backgroundColor: colors.bubbleOutgoing, borderBottomRightRadius: 6 },
  incoming: { backgroundColor: colors.bubbleIncoming, borderBottomLeftRadius: 6 },
  mediaBubble: { padding: 2, backgroundColor: 'transparent', minWidth: 0, overflow: 'hidden' },
  pending: { opacity: 0.65 },
  failed: { borderWidth: 1, borderColor: colors.danger },
  text: { ...typography.body, color: colors.ink, paddingBottom: 3 },
  outgoingText: { color: '#fff' },
  image: { width: 250, borderRadius: 17, backgroundColor: colors.accentWash },
  imageState: { width: 250, height: 176, borderRadius: 17, backgroundColor: 'rgba(244,81,30,0.12)', alignItems: 'center', justifyContent: 'center', gap: 9, padding: 20 },
  imageStateText: { ...typography.caption, color: colors.accentDeep, textAlign: 'center' },
  viewer: { flex: 1, backgroundColor: 'rgba(5,9,12,0.96)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerButton: { position: 'absolute', top: 48, width: 46, height: 46, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  viewerClose: { left: 18 },
  viewerDownload: { right: 18 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 210, paddingBottom: 3 },
  fileIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  fileName: { ...typography.bodyMedium, color: colors.ink },
  fileMeta: { ...typography.caption, color: colors.muted, marginTop: 2 },
  outgoingSub: { color: 'rgba(255,255,255,0.72)' },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 2 },
  mediaMeta: { position: 'absolute', right: 9, bottom: 8, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: 'rgba(0,0,0,0.48)' },
  mediaMetaText: { color: '#fff' },
  time: { ...typography.caption, color: colors.muted, fontSize: 10 },
  receipt: { color: 'rgba(255,255,255,0.75)', fontFamily: 'BeVietnamPro_700Bold', fontSize: 11 },
  receiptRead: { color: '#BCEBFF' },
  recalled: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  recalledText: { ...typography.caption, color: colors.muted, fontStyle: 'italic' },
  callHistory: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 210 },
  callIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  reply: { borderLeftWidth: 3, borderLeftColor: colors.accent, backgroundColor: colors.accentWash, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6, marginBottom: 7 },
  replyOutgoing: { borderLeftColor: '#fff', backgroundColor: 'rgba(255,255,255,0.16)' },
  replyName: { ...typography.caption, color: colors.accentDeep },
  replyText: { ...typography.caption, color: colors.inkSoft, marginTop: 1 },
  reactions: { marginTop: -12, marginLeft: 14, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  reactionsOut: { marginRight: 14, marginLeft: 0 },
  reactionText: { ...typography.caption, color: colors.ink },
  failedText: { ...typography.caption, color: colors.danger, marginTop: 3 },
  system: { ...typography.caption, color: colors.muted, textAlign: 'center', marginVertical: 12, paddingHorizontal: 30 },
});
