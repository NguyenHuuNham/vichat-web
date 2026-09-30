import { memo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { BookOpen, Check, CheckCircle2, Download, FileText, ImageOff, LockKeyhole, Pause, Pencil, Phone, Pin, Play, Plus, RotateCcw, Video, X } from 'lucide-react-native';
import { beginTrustedExternalActivity } from '../services/appLifecycleService';
import { normalizeMediaUrl, tinodeClient } from '../services/tinodeClient';
import { ChatMessage, ConversationMember, FileAttachment } from '../types';
import { Avatar } from './Avatar';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { useThemePalette } from '../theme/useThemePalette';
import { formatMessageTime } from '../utils/timeFormatting';
import { identitiesOverlap } from '../utils/identity';
import { pollCanViewerLock, pollIsClosed, pollOptionVoteCounts, pollViewerVote } from '../utils/poll';

function renderMentionText(text: string, mentions: any[] = [], outgoing = false, palette: ThemeColors) {
  const styles = createStyles(palette);
  const tokens = [...new Set(mentions.map(mention => String(mention?.token || '').trim()).filter(Boolean))];
  if (!tokens.length) return text;
  const escaped = tokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gu');
  const tokenSet = new Set(tokens);
  return String(text).split(pattern).map((part, index) => tokenSet.has(part)
    ? <Text key={`mention-${index}`} style={[styles.mention, outgoing && styles.mentionOutgoing]}>{part}</Text>
    : part);
}

interface Props {
  message: ChatMessage;
  onLongPress: () => void;
  onShowEditHistory: (message: ChatMessage) => void;
  onPollVote?: (message: ChatMessage, optionIds: string[]) => void;
  onPollAddOption?: (message: ChatMessage, optionText: string) => void;
  onPollLock?: (message: ChatMessage) => void;
  viewerIdentities?: string[];
  groupMembers?: ConversationMember[];
  isGroup?: boolean;
}

export const MessageBubble = memo(function MessageBubble({ message, onLongPress, onShowEditHistory, onPollVote, onPollAddOption, onPollLock, viewerIdentities = [], groupMembers = [], isGroup = false }: Props) {
  const palette = useThemePalette();
  const styles = createStyles(palette);
  if (message.type === 'system') return <Text style={styles.system}>{message.text}</Text>;
  if (message.type === 'call' && message.call) {
    const incomingGroupProfile = getGroupSenderProfile(message, groupMembers, isGroup);
    return <View style={[styles.line, message.sender === 'outgoing' ? styles.outgoingLine : styles.incomingLine]}>{incomingGroupProfile ? <SenderMeta palette={palette} profile={incomingGroupProfile} /> : null}<View style={[styles.bubble, message.sender === 'outgoing' ? styles.outgoing : styles.incoming]}><View style={styles.callHistory}><View style={styles.callIcon}>{message.call.audioOnly ? <Phone color={message.sender === 'outgoing' ? '#fff' : palette.accent} size={19} /> : <Video color={message.sender === 'outgoing' ? '#fff' : palette.accent} size={19} />}</View><View style={{ flex: 1 }}><Text style={[styles.text, message.sender === 'outgoing' && styles.outgoingText]}>{message.text}</Text><Text style={[styles.fileMeta, message.sender === 'outgoing' && styles.outgoingSub]}>{message.call.audioOnly ? 'Cuộc gọi thoại' : 'Cuộc gọi video'}</Text></View></View><View style={styles.meta}><Text style={[styles.time, message.sender === 'outgoing' && styles.outgoingSub]}>{formatMessageTime(message.createdAt || message.time)}</Text></View></View></View>;
  }
  const outgoing = message.sender === 'outgoing';
  const incomingGroupProfile = getGroupSenderProfile(message, groupMembers, isGroup);
  const audio = Boolean(message.file && (message.type === 'audio' || /^audio\//i.test(message.file.mime)));
  const mediaOnly = Boolean((message.image || message.sticker) && !message.text?.trim() && !message.recalled);
  const receipt = message.pending || message.deliveryStatus === 'sending'
    ? '…'
    : ['received', 'read'].includes(message.deliveryStatus || '') ? '✓✓' : '✓';
  return (
    <View style={[styles.line, outgoing ? styles.outgoingLine : styles.incomingLine]}>
      {incomingGroupProfile ? <SenderMeta palette={palette} profile={incomingGroupProfile} /> : null}
      <Pressable onLongPress={onLongPress} delayLongPress={350} style={[styles.bubble, outgoing ? styles.outgoing : styles.incoming, mediaOnly && styles.mediaBubble, message.pending && styles.pending, message.failed && styles.failed]}>
        {message.replyTo && !message.recalled ? <View style={[styles.reply, outgoing && styles.replyOutgoing]}><Text numberOfLines={1} style={[styles.replyName, outgoing && styles.outgoingText]}>{message.replyTo.senderName}</Text><Text numberOfLines={1} style={[styles.replyText, outgoing && styles.outgoingSub]}>{message.replyTo.text}</Text></View> : null}
        {message.sticker && (message.image || message.file?.url) ? <ProtectedMessageImage palette={palette} uri={message.image || message.file?.url || ''} file={message.file} outgoing={outgoing} sticker /> : null}
        {message.image && !message.sticker ? <ProtectedMessageImage palette={palette} uri={message.image} file={message.file} outgoing={outgoing} /> : null}
        {audio ? <AudioMessage palette={palette} file={message.file!} outgoing={outgoing} /> : null}
        {message.file && !message.image && !message.sticker && !audio ? (
          <Pressable style={styles.file} onPress={() => openAttachment(message.file!)}>
            <View style={styles.fileIcon}><FileText color={outgoing ? '#fff' : palette.accent} size={20} /></View>
            <View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.fileName, outgoing && styles.outgoingText]}>{message.file.name}</Text><Text style={[styles.fileMeta, outgoing && styles.outgoingSub]}>{message.file.mime} · {message.file.size ? `${Math.round(message.file.size / 1024)} KB` : 'Tệp'}</Text></View>
          </Pressable>
        ) : null}
        {message.poll ? <PollCard palette={palette} message={message} outgoing={outgoing} onVote={onPollVote} onAddOption={onPollAddOption} onLock={onPollLock} viewerIdentities={viewerIdentities} groupMembers={groupMembers} /> : null}
        {message.pinned ? <View style={styles.pinnedLabel}><Pin color={outgoing ? '#BCEBFF' : palette.accent} size={12} /><Text style={[styles.pinnedText, outgoing && styles.outgoingSub]}>Đã ghim</Text></View> : null}
        {message.edited ? <Pressable onPress={() => onShowEditHistory(message)} style={styles.editedLabel}><Pencil color={outgoing ? '#D9F2FF' : palette.accent} size={11} /><Text style={[styles.editedLabelText, outgoing && styles.outgoingSub]}>Đã chỉnh sửa</Text></Pressable> : null}
        {message.text && !message.recalled && !message.poll ? <Text style={[styles.text, outgoing && styles.outgoingText]}>{renderMentionText(message.text, message.mentions, outgoing, palette)}</Text> : null}
        {!outgoing && message.grounded ? <View style={styles.grounded}><CheckCircle2 color={palette.online} size={13} /><Text style={styles.groundedText}>Đã đối chiếu nguồn</Text></View> : null}
        {!outgoing && message.sources?.length ? <View style={styles.sources}><View style={styles.sourcesTitle}><BookOpen color={palette.accent} size={14} /><Text style={styles.sourcesTitleText}>Nguồn tham khảo</Text></View>{message.sources.map((source, index) => <View key={`${source.title || source.file_name || index}`} style={styles.sourceCard}><Text style={styles.sourceIndex}>{index + 1}</Text><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.sourceName}>{source.title || source.file_name || `Nguồn ${index + 1}`}</Text>{source.snippet ? <Text numberOfLines={2} style={styles.sourceSnippet}>{source.snippet}</Text> : null}</View></View>)}</View> : null}
        {message.recalled ? <View style={styles.recalled}><RotateCcw color={outgoing ? '#fff' : palette.muted} size={14} /><Text style={[styles.recalledText, outgoing && styles.outgoingText]}>Tin nhắn đã được thu hồi</Text></View> : null}
        <View style={[styles.meta, mediaOnly && styles.mediaMeta]}><Text style={[styles.time, outgoing && !mediaOnly && styles.outgoingSub, mediaOnly && styles.mediaMetaText]}>{formatMessageTime(message.createdAt || message.time)}</Text>{outgoing ? <Text style={[styles.receipt, message.deliveryStatus === 'read' && styles.receiptRead]}>{receipt}</Text> : null}</View>
      </Pressable>
      {message.reactions && Object.keys(message.reactions).length > 0 ? <View style={[styles.reactions, outgoing && styles.reactionsOut]}><Text style={styles.reactionText}>{Object.entries(message.reactions).map(([emoji, count]) => `${emoji} ${count}`).join('  ')}</Text></View> : null}
      {message.failed ? <Text style={styles.failedText}>Chưa gửi · chạm để thử lại</Text> : null}
    </View>
  );
}, (previous, next) => previous.message === next.message && previous.isGroup === next.isGroup && previous.groupMembers === next.groupMembers);

function getGroupSenderProfile(message: ChatMessage, groupMembers: ConversationMember[], isGroup: boolean) {
  if (!isGroup || message.sender === 'outgoing') return null;
  const member = groupMembers.find(candidate => identitiesOverlap(candidate, { id: message.senderId, uid: message.senderId }));
  const rawName = String(message.senderName || '').trim();
  const genericName = !rawName || ['member', 'thành viên', 'thÃ nh viÃªn'].includes(rawName.toLowerCase());
  return {
    name: genericName ? member?.name || 'Thành viên' : rawName,
    avatar: message.avatar || member?.avatar || '',
  };
}

function SenderMeta({ palette, profile }: { palette: ThemeColors; profile: { name: string; avatar: string } }) {
  const styles = createStyles(palette);
  return <View style={styles.senderMeta}><Avatar name={profile.name} uri={profile.avatar} size={25} /><Text numberOfLines={1} style={styles.senderName}>{profile.name}</Text></View>;
}

function PollCard({ palette, message, outgoing, onVote, onAddOption, onLock, viewerIdentities, groupMembers }: { palette: ThemeColors; message: ChatMessage; outgoing: boolean; onVote?: (message: ChatMessage, optionIds: string[]) => void; onAddOption?: (message: ChatMessage, optionText: string) => void; onLock?: (message: ChatMessage) => void; viewerIdentities: string[]; groupMembers: ConversationMember[] }) {
  const styles = createStyles(palette);
  const poll = message.poll;
  const [selected, setSelected] = useState<string[]>([]);
  const [optionText, setOptionText] = useState('');
  if (!poll) return null;
  const closed = pollIsClosed(poll);
  const counts = pollOptionVoteCounts(poll);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const viewerVote = pollViewerVote(poll, viewerIdentities);
  const showResults = !poll.settings.hideResultsUntilVote || Boolean(viewerVote) || closed;
  const canLock = Boolean(onLock && pollCanViewerLock(poll, viewerIdentities, groupMembers));
  const toggle = (optionId: string) => {
    if (closed) return;
    setSelected(current => poll.settings.allowMultiple
      ? current.includes(optionId) ? current.filter(value => value !== optionId) : [...current, optionId]
      : [optionId]);
  };
  const submitOption = () => { const value = optionText.trim(); if (!value || !onAddOption) return; onAddOption(message, value); setOptionText(''); };
  return <View style={[styles.poll, outgoing && styles.pollOutgoing]}><View style={styles.pollHeading}><Text style={[styles.pollLabel, outgoing && styles.outgoingSub]}>Bình chọn</Text>{closed ? <Text style={[styles.pollClosed, outgoing && styles.outgoingSub]}>Đã đóng</Text> : null}</View><Text style={[styles.pollQuestion, outgoing && styles.outgoingText]}>{poll.question}</Text>{poll.options.map(option => { const selectedOption = selected.includes(option.id); const count = showResults ? counts[option.id] || 0 : 0; const percent = showResults && total ? Math.round((count / total) * 100) : 0; return <Pressable key={option.id} onPress={() => toggle(option.id)} style={[styles.pollOption, selectedOption && styles.pollOptionSelected, outgoing && styles.pollOptionOutgoing]}><View style={styles.pollOptionTop}><View style={[styles.pollRadio, selectedOption && styles.pollRadioSelected]}>{selectedOption ? <Check color="#fff" size={12} /> : null}</View><Text style={[styles.pollOptionText, outgoing && styles.outgoingText]}>{option.text}</Text>{showResults ? <Text style={[styles.pollCount, outgoing && styles.outgoingSub]}>{count}</Text> : null}</View><View style={styles.pollTrack}><View style={[styles.pollProgress, { width: `${percent}%` as any }, outgoing && styles.pollProgressOutgoing]} /></View></Pressable>; })}{!showResults ? <Text style={[styles.pollHint, outgoing && styles.outgoingSub]}>Kết quả sẽ hiện sau khi bạn bình chọn</Text> : null}{poll.settings.allowAddOptions && !closed && onAddOption ? <View style={styles.pollAddOption}><TextInput value={optionText} onChangeText={setOptionText} maxLength={120} placeholder="Thêm phương án" placeholderTextColor={palette.muted} style={styles.pollOptionInput} /><Pressable onPress={submitOption} disabled={!optionText.trim()} style={[styles.pollIconButton, !optionText.trim() && styles.pollSubmitDisabled]}><Plus color="#fff" size={16} /></Pressable></View> : null}<View style={styles.pollActions}>{onVote ? <Pressable disabled={closed || selected.length === 0} onPress={() => onVote(message, selected)} style={[styles.pollSubmit, (closed || selected.length === 0) && styles.pollSubmitDisabled]}><Text style={styles.pollSubmitText}>{closed ? 'Bình chọn đã đóng' : 'Gửi lựa chọn'}</Text></Pressable> : null}{canLock ? <Pressable onPress={() => onLock?.(message)} style={styles.pollLock}><LockKeyhole color={palette.warning} size={15} /><Text style={styles.pollLockText}>Khóa</Text></Pressable> : null}</View></View>;
}

function formatAudioDuration(durationMs = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(durationMs || 0) / 1000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function AudioMessage({ palette, file, outgoing }: { palette: ThemeColors; file: FileAttachment; outgoing: boolean }) {
  const styles = createStyles(palette);
  const playerRef = useRef<AudioPlayer | null>(null);
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(Number(file.audioDurationMs) || 0);
  const [error, setError] = useState('');

  useEffect(() => () => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    const player = playerRef.current;
    playerRef.current = null;
    player?.remove();
  }, []);

  const handleStatus = (status: AudioStatus) => {
    if (status.error) setError('Không phát được voice.');
    setLoading(!status.isLoaded && !status.error);
    setPlaying(Boolean(status.playing));
    setPosition(Math.round(Number(status.currentTime) * 1000) || 0);
    setDuration(Math.round(Number(status.duration) * 1000) || Number(file.audioDurationMs) || 0);
    if (status.didJustFinish) {
      setPlaying(false);
      setPosition(0);
      const player = playerRef.current;
      if (player) void player.seekTo(0).catch(() => {});
    }
  };

  const togglePlayback = async () => {
    if (loading) return;
    setError('');
    try {
      const current = playerRef.current;
      if (current) {
        if (current.isLoaded) {
          if (current.playing) {
            current.pause();
            setPlaying(false);
          } else {
            current.play();
            setPlaying(true);
          }
          return;
        }
      }
      setLoading(true);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, interruptionMode: 'duckOthers' });
      const uri = await tinodeClient.cacheFile(file);
      const player = createAudioPlayer({ uri }, { updateInterval: 250 });
      playerRef.current = player;
      subscriptionRef.current = player.addListener('playbackStatusUpdate', handleStatus);
      player.play();
    } catch {
      setError('Không phát được voice.');
    } finally {
      if (playerRef.current?.isLoaded) setLoading(false);
    }
  };

  const progress = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  return <View style={[styles.audioMessage, outgoing && styles.audioMessageOutgoing]}>
    <Pressable accessibilityLabel={playing ? 'Tạm dừng voice' : 'Phát voice'} onPress={() => void togglePlayback()} style={styles.audioButton}>
      {loading ? <ActivityIndicator color={outgoing ? '#fff' : palette.accent} size="small" /> : playing ? <Pause color={outgoing ? '#fff' : palette.accent} size={17} /> : <Play color={outgoing ? '#fff' : palette.accent} size={17} />}
    </Pressable>
    <View style={styles.audioBody}>
      <View style={styles.audioTrack}><View style={[styles.audioProgress, { width: `${progress * 100}%` as any }, outgoing && styles.audioProgressOutgoing]} /></View>
      <Text style={[styles.audioMeta, outgoing && styles.outgoingSub]}>{error || formatAudioDuration(duration) || 'Voice'}</Text>
    </View>
  </View>;
}

function ProtectedMessageImage({ palette, uri, file, outgoing, sticker = false }: { palette: ThemeColors; uri: string; file?: FileAttachment; outgoing: boolean; sticker?: boolean }) {
  const styles = createStyles(palette);
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
  if (sticker) {
    if (failed) return <Pressable onPress={() => setAttempt(value => value + 1)} style={styles.stickerState}><ImageOff color={outgoing ? '#fff' : palette.accent} size={18} /><Text style={[styles.stickerStateText, outgoing && styles.outgoingText]}>Không tải được sticker</Text></Pressable>;
    if (!source) return <View style={styles.stickerState}><ActivityIndicator color={outgoing ? '#fff' : palette.accent} /><Text style={[styles.stickerStateText, outgoing && styles.outgoingText]}>Đang tải sticker...</Text></View>;
    return <Image source={{ uri: source }} style={styles.stickerImage} resizeMode="contain" />;
  }
  const attachment = file || { name: 'hình-ảnh.jpg', mime: 'image/jpeg', size: 0, url: uri };
  if (failed) return <Pressable onPress={() => setAttempt(value => value + 1)} style={styles.imageState}><ImageOff color={outgoing ? '#fff' : palette.accent} size={25} /><Text style={[styles.imageStateText, outgoing && styles.outgoingText]}>Không tải được ảnh · chạm để thử lại</Text></Pressable>;
  if (!source) return <View style={styles.imageState}><ActivityIndicator color={outgoing ? '#fff' : palette.accent} /><Text style={[styles.imageStateText, outgoing && styles.outgoingText]}>Đang tải ảnh...</Text></View>;
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

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    line: { marginBottom: 12, paddingHorizontal: 16 },
    outgoingLine: { alignItems: 'flex-end' },
    incomingLine: { alignItems: 'flex-start' },
    senderMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, maxWidth: '86%', marginLeft: 4, marginBottom: 4 },
    senderName: { ...typography.caption, color: palette.inkSoft, flexShrink: 1 },
    bubble: { maxWidth: '86%', minWidth: 70, borderRadius: 21, paddingHorizontal: 15, paddingTop: 12, paddingBottom: 8, shadowColor: palette.ink, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
    outgoing: { backgroundColor: palette.bubbleOutgoing, borderBottomRightRadius: 6 },
    incoming: { backgroundColor: palette.bubbleIncoming, borderBottomLeftRadius: 6 },
    mediaBubble: { padding: 2, backgroundColor: 'transparent', minWidth: 0, overflow: 'hidden' },
    stickerImage: { width: 156, height: 156 },
    stickerState: { width: 156, height: 70, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: `${palette.accent}12` },
    stickerStateText: { ...typography.caption, color: palette.accentDeep, fontSize: 10 },
    pending: { opacity: 0.65 },
    failed: { borderWidth: 1, borderColor: palette.danger },
    text: { ...typography.body, color: palette.ink, paddingBottom: 3 },
    outgoingText: { color: '#fff' },
    mention: { color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold' },
    mentionOutgoing: { color: '#BCEBFF' },
    image: { width: 250, borderRadius: 17, backgroundColor: palette.accentWash },
    imageState: { width: 250, height: 176, borderRadius: 17, backgroundColor: `${palette.accent}20`, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 20 },
    imageStateText: { ...typography.caption, color: palette.accentDeep, textAlign: 'center' },
    viewer: { flex: 1, backgroundColor: 'rgba(5,9,12,0.96)', alignItems: 'center', justifyContent: 'center' },
    viewerImage: { width: '100%', height: '100%' },
    viewerButton: { position: 'absolute', top: 48, width: 46, height: 46, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
    viewerClose: { left: 18 },
    viewerDownload: { right: 18 },
    file: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 210, paddingBottom: 3 },
    fileIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    fileName: { ...typography.bodyMedium, color: palette.ink },
    fileMeta: { ...typography.caption, color: palette.muted, marginTop: 2 },
    audioMessage: { width: 220, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 15, backgroundColor: palette.accentWash },
    audioMessageOutgoing: { backgroundColor: 'rgba(255,255,255,0.14)' },
    audioButton: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper },
    audioBody: { flex: 1, gap: 5 },
    audioTrack: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: `${palette.accent}35` },
    audioProgress: { height: 5, borderRadius: 3, backgroundColor: palette.accent },
    audioProgressOutgoing: { backgroundColor: '#BCEBFF' },
    audioMeta: { ...typography.caption, color: palette.accentDeep, fontSize: 10 },
    outgoingSub: { color: 'rgba(255,255,255,0.72)' },
    meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 2 },
    mediaMeta: { position: 'absolute', right: 9, bottom: 8, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: 'rgba(0,0,0,0.48)' },
    mediaMetaText: { color: '#fff' },
    time: { ...typography.caption, color: palette.muted, fontSize: 10 },
    receipt: { color: 'rgba(255,255,255,0.75)', fontFamily: 'BeVietnamPro_700Bold', fontSize: 11 },
    receiptRead: { color: '#BCEBFF' },
    recalled: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    recalledText: { ...typography.caption, color: palette.muted, fontStyle: 'italic' },
    editedLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginBottom: 4, paddingVertical: 1 },
    editedLabelText: { ...typography.caption, color: palette.accent, fontSize: 10.5, textDecorationLine: 'underline' },
    pinnedLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
    pinnedText: { ...typography.caption, color: palette.accent, fontSize: 10.5 },
    callHistory: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 210 },
    callIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
    reply: { borderLeftWidth: 3, borderLeftColor: palette.accent, backgroundColor: palette.accentWash, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6, marginBottom: 7 },
    replyOutgoing: { borderLeftColor: '#fff', backgroundColor: 'rgba(255,255,255,0.16)' },
    replyName: { ...typography.caption, color: palette.accentDeep },
    replyText: { ...typography.caption, color: palette.inkSoft, marginTop: 1 },
    reactions: { marginTop: -12, marginLeft: 14, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
    reactionsOut: { marginRight: 14, marginLeft: 0 },
    reactionText: { ...typography.caption, color: palette.ink },
    failedText: { ...typography.caption, color: palette.danger, marginTop: 3 },
    system: { ...typography.caption, color: palette.muted, textAlign: 'center', marginVertical: 12, paddingHorizontal: 30 },
    grounded: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
    groundedText: { ...typography.caption, color: palette.online, fontSize: 10.5 },
    sources: { gap: 7, marginTop: 10, padding: 9, borderRadius: 13, backgroundColor: `${palette.online}12`, borderWidth: 1, borderColor: `${palette.online}44` },
    sourcesTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sourcesTitleText: { ...typography.caption, color: palette.ink, fontFamily: 'BeVietnamPro_700Bold' },
    sourceCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 8, borderRadius: 10, backgroundColor: palette.paper },
    sourceIndex: { width: 22, height: 22, borderRadius: 8, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', color: '#FFFFFF', backgroundColor: palette.ink, fontFamily: 'BeVietnamPro_700Bold', fontSize: 10 },
    sourceName: { ...typography.caption, color: palette.ink, fontFamily: 'BeVietnamPro_700Bold' },
    sourceSnippet: { ...typography.caption, color: palette.muted, fontSize: 10.5, marginTop: 2 },
    poll: { minWidth: 235, gap: 8, padding: 11, borderRadius: 15, backgroundColor: `${palette.online}12`, borderWidth: 1, borderColor: `${palette.online}44` },
    pollOutgoing: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.24)' },
    pollHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pollLabel: { ...typography.caption, color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold' },
    pollClosed: { ...typography.caption, color: palette.muted },
    pollQuestion: { ...typography.bodyMedium, color: palette.ink },
    pollOption: { padding: 8, borderRadius: 11, backgroundColor: palette.paper },
    pollOptionSelected: { borderWidth: 1, borderColor: palette.accent, backgroundColor: palette.accentWash },
    pollOptionOutgoing: { backgroundColor: 'rgba(255,255,255,0.14)' },
    pollOptionTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    pollRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
    pollRadioSelected: { backgroundColor: palette.accent, borderColor: palette.accent },
    pollOptionText: { ...typography.caption, color: palette.ink, flex: 1 },
    pollCount: { ...typography.caption, color: palette.muted, fontSize: 10 },
    pollTrack: { height: 4, marginTop: 6, borderRadius: 2, backgroundColor: palette.line, overflow: 'hidden' },
    pollProgress: { height: 4, borderRadius: 2, backgroundColor: palette.accent },
    pollProgressOutgoing: { backgroundColor: '#BCEBFF' },
    pollSubmit: { minHeight: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accent },
    pollSubmitDisabled: { opacity: 0.45 },
    pollSubmitText: { ...typography.caption, color: '#fff', fontFamily: 'BeVietnamPro_700Bold' },
    pollHint: { ...typography.caption, color: palette.muted, fontSize: 10.5 },
    pollAddOption: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pollOptionInput: { flex: 1, height: 35, borderRadius: 10, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, paddingHorizontal: 9, color: palette.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 11 },
    pollIconButton: { width: 35, height: 35, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accent },
    pollActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    pollLock: { minHeight: 34, paddingHorizontal: 9, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${palette.warning}18` },
    pollLockText: { ...typography.caption, color: palette.warning, fontFamily: 'BeVietnamPro_700Bold' },
  });
}
