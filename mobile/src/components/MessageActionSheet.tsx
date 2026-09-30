import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Copy, Download, Info, Pencil, Pin, Reply, RotateCcw, Share2, X } from 'lucide-react-native';
import { ChatMessage } from '../types';
import { RecallMode } from '../types';
import { canEditMessage, canInteractWithMessage, canRecallMessage } from '../utils/messagePolicy';
import { ThemeColors, shadow } from '../theme/colors';
import { typography } from '../theme/typography';
import { useThemePalette } from '../theme/useThemePalette';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢'];

interface Props {
  message: ChatMessage | null;
  onClose: () => void;
  onReply: (message: ChatMessage) => void;
  onCopy: (message: ChatMessage) => void;
  onShare: (message: ChatMessage) => void;
  onDownload: (message: ChatMessage) => void;
  onDetails: (message: ChatMessage) => void;
  onReaction: (message: ChatMessage, emoji: string) => void;
  onEdit: (message: ChatMessage) => void;
  canPin?: boolean;
  onPin?: (message: ChatMessage) => void;
  onRecall: (message: ChatMessage, mode: RecallMode) => void;
}

export function MessageActionSheet({ message, onClose, onReply, onCopy, onShare, onDownload, onDetails, onReaction, onEdit, canPin = false, onPin, onRecall }: Props) {
  const palette = useThemePalette();
  const styles = createStyles(palette);
  if (!message || !canInteractWithMessage(message)) return null;
  const actionable = true;
  const hasAttachment = Boolean(message.image || message.file);
  const run = (action: () => void) => { onClose(); action(); };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}><Text style={styles.title}>Thao tác tin nhắn</Text><Pressable onPress={onClose} style={styles.close}><X color={palette.inkSoft} size={20} /></Pressable></View>
          {actionable ? <View style={styles.reactions}>{REACTIONS.map(emoji => <Pressable key={emoji} onPress={() => run(() => onReaction(message, emoji))} style={styles.reaction}><Text style={styles.emoji}>{emoji}</Text></Pressable>)}</View> : null}
          <View style={styles.actions}>
            {actionable ? <Action palette={palette} icon={Reply} label="Trả lời tin nhắn" onPress={() => run(() => onReply(message))} /> : null}
            {actionable && message.text ? <Action palette={palette} icon={Copy} label="Sao chép nội dung" onPress={() => run(() => onCopy(message))} /> : null}
            {message.sender === 'outgoing' && canEditMessage(message) ? <Action palette={palette} icon={Pencil} label="Sửa tin nhắn" onPress={() => run(() => onEdit(message))} /> : null}
            {hasAttachment ? <Action palette={palette} icon={Download} label={message.image ? 'Mở / lưu hình ảnh' : 'Mở / tải tệp'} onPress={() => run(() => onDownload(message))} /> : null}
            {actionable ? <Action palette={palette} icon={Share2} label="Chia sẻ" onPress={() => run(() => onShare(message))} /> : null}
            {canPin && onPin && message.type !== 'system' ? <Action palette={palette} icon={Pin} label={message.pinned ? 'Bỏ ghim tin nhắn' : 'Ghim tin nhắn'} onPress={() => run(() => onPin(message))} /> : null}
            <Action palette={palette} icon={Info} label="Xem chi tiết" onPress={() => run(() => onDetails(message))} />
            {message.sender === 'outgoing' && canRecallMessage(message) ? <Action palette={palette} icon={RotateCcw} label="Thu hồi tin nhắn" danger onPress={() => run(() => onRecall(message, 'all'))} /> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Action({ palette, icon: Icon, label, onPress, danger = false }: { palette: ThemeColors; icon: any; label: string; onPress: () => void; danger?: boolean }) {
  const styles = createStyles(palette);
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}><View style={[styles.actionIcon, danger && styles.actionDangerIcon]}><Icon color={danger ? palette.danger : palette.accent} size={20} /></View><Text style={[styles.actionLabel, danger && styles.actionDanger]}>{label}</Text></Pressable>;
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(12,20,27,0.45)' },
    sheet: { backgroundColor: palette.canvas, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, ...shadow },
    handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: palette.muted, alignSelf: 'center', marginBottom: 12 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    title: { ...typography.title, color: palette.ink },
    close: { width: 39, height: 39, borderRadius: 14, backgroundColor: palette.paper, alignItems: 'center', justifyContent: 'center' },
    reactions: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: palette.paper, borderRadius: 21, padding: 8, marginBottom: 12 },
    reaction: { width: 51, height: 49, borderRadius: 17, backgroundColor: palette.canvas, alignItems: 'center', justifyContent: 'center' },
    emoji: { fontSize: 25 },
    actions: { backgroundColor: palette.paper, borderRadius: 21, paddingHorizontal: 10 },
    action: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: palette.line, paddingHorizontal: 5 },
    actionPressed: { opacity: 0.58 },
    actionIcon: { width: 37, height: 37, borderRadius: 13, backgroundColor: palette.accentWash, alignItems: 'center', justifyContent: 'center' },
    actionDangerIcon: { backgroundColor: `${palette.danger}22` },
    actionLabel: { ...typography.bodyMedium, color: palette.ink },
    actionDanger: { color: palette.danger },
  });
}
