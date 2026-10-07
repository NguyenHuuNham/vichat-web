import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { BookOpen, CalendarDays, Check, CheckCircle2, Download, ExternalLink, FileText, ImageOff, LockKeyhole, MapPin, MessageSquare, Pause, Pencil, Phone, Pin, Play, Plus, RotateCcw, Video, X } from 'lucide-react-native';
import { beginTrustedExternalActivity } from '../services/appLifecycleService';
import { liveLocationService } from '../services/liveLocationService';
import { normalizeMediaUrl, tinodeClient } from '../services/tinodeClient';
import { ChatMessage, ContactCardAttachment, ConversationMember, FileAttachment, GroupEvent, LocationAttachment } from '../types';
import { Avatar } from './Avatar';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { useThemePalette } from '../theme/useThemePalette';
import { formatMessageTime } from '../utils/timeFormatting';
import { identitiesOverlap } from '../utils/identity';
import { pollCanViewerLock, pollIsClosed, pollOptionVoteCounts, pollViewerVote } from '../utils/poll';
import { useI18n } from '../store/languageStore';
import { useTranslationStore } from '../store/translationStore';
import { formatGroupEventDate } from '../utils/groupEvent';
import { mentionTokenFor } from '../utils/mentionPolicy';

const bubbleStylesCache = new WeakMap<ThemeColors, ReturnType<typeof createStyles>>();
function getBubbleStyles(palette: ThemeColors) {
  let cached = bubbleStylesCache.get(palette);
  if (!cached) {
    cached = createStyles(palette);
    bubbleStylesCache.set(palette, cached);
  }
  return cached;
}

function renderMentionText(
  text: string,
  mentions: any[] = [],
  groupMembers: ConversationMember[] = [],
  outgoing = false,
  palette: ThemeColors,
  onPressMention?: (token: string, target?: any) => void,
) {
  if (!text || !text.includes('@')) return text;
  const styles = getBubbleStyles(palette);
  const tokenMap = new Map<string, any>();
  const tokenMapLower = new Map<string, any>();

  const allEntity = { id: '__all__', name: 'Mọi người', isAll: true };
  tokenMap.set('@All', allEntity);
  tokenMapLower.set('@all', allEntity);

  groupMembers.forEach(member => {
    const token = mentionTokenFor(member);
    if (token) {
      tokenMap.set(token, member);
      tokenMapLower.set(token.toLowerCase(), member);
    }
  });

  mentions.forEach(mention => {
    const token = String(mention?.token || mentionTokenFor(mention) || '').trim();
    if (token) {
      tokenMap.set(token, mention);
      tokenMapLower.set(token.toLowerCase(), mention);
    }
  });

  const tokens = Array.from(tokenMap.keys()).filter(Boolean);
  if (!tokens.length) return text;

  // Sort by length descending to match longest full names first
  tokens.sort((a, b) => b.length - a.length);

  const escaped = tokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gu');

  return String(text).split(pattern).map((part, index) => {
    const target = tokenMap.get(part) || tokenMapLower.get(part.toLowerCase());
    if (target) {
      return (
        <Text
          key={`mention-${index}`}
          onPress={onPressMention ? () => onPressMention(part, target) : undefined}
          style={[styles.mention, outgoing && styles.mentionOutgoing]}
          suppressHighlighting={false}
        >
          {part}
        </Text>
      );
    }
    return part;
  });
}

interface Props {
  message: ChatMessage;
  onLongPress: ((message: ChatMessage) => void) | (() => void);
  onShowEditHistory: (message: ChatMessage) => void;
  onPollVote?: (message: ChatMessage, optionIds: string[]) => void;
  onPollAddOption?: (message: ChatMessage, optionText: string) => void;
  onPollLock?: (message: ChatMessage) => void;
  onOpenContactChat?: (contact: ContactCardAttachment) => void;
  onPressMention?: (token: string, target?: any) => void;
  viewerIdentities?: string[];
  groupMembers?: ConversationMember[];
  isGroup?: boolean;
  translationEntryKey?: string;
  highlighted?: boolean;
}

export const MessageBubble = memo(function MessageBubble({ message, onLongPress, onShowEditHistory, onPollVote, onPollAddOption, onPollLock, onOpenContactChat, onPressMention, viewerIdentities = [], groupMembers = [], isGroup = false, translationEntryKey, highlighted = false }: Props) {
  const palette = useThemePalette();
  const styles = getBubbleStyles(palette);
  const { t } = useI18n();
  const translation = useTranslationStore(state => translationEntryKey ? state.entries[translationEntryKey] : undefined);
  const translatedText = String(translation?.text || '').trim();
  const hasTranslatedText = translation?.status === 'ready' && Boolean(translatedText) && translatedText !== message.text.trim();
  const handleLongPress = useCallback(() => {
    if (typeof onLongPress === 'function') {
      (onLongPress as any)(message);
    }
  }, [message, onLongPress]);
  if (message.groupEvent) return <GroupEventMessage event={message.groupEvent} message={message} palette={palette} groupMembers={groupMembers} isGroup={isGroup} />;
  if (message.type === 'system') return <Text style={styles.system}>{message.text}</Text>;
  if (message.type === 'call' && message.call) {
    const incomingGroupProfile = getGroupSenderProfile(message, groupMembers, isGroup);
    return <View style={[styles.line, message.sender === 'outgoing' ? styles.outgoingLine : styles.incomingLine]}>{incomingGroupProfile ? <SenderMeta palette={palette} profile={incomingGroupProfile} /> : null}<View style={[styles.bubble, message.sender === 'outgoing' ? styles.outgoing : styles.incoming]}><View style={styles.callHistory}><View style={styles.callIcon}>{message.call.audioOnly ? <Phone color={message.sender === 'outgoing' ? '#fff' : palette.accent} size={19} /> : <Video color={message.sender === 'outgoing' ? '#fff' : palette.accent} size={19} />}</View><View style={{ flex: 1 }}><Text style={[styles.text, message.sender === 'outgoing' && styles.outgoingText]}>{message.text}</Text><Text style={[styles.fileMeta, message.sender === 'outgoing' && styles.outgoingSub]}>{message.call.audioOnly ? t('Cuộc gọi thoại') : t('Cuộc gọi video')}</Text></View></View><View style={styles.meta}><Text style={[styles.time, message.sender === 'outgoing' && styles.outgoingSub]}>{formatMessageTime(message.createdAt || message.time)}</Text></View></View></View>;
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
      <Pressable onLongPress={handleLongPress} delayLongPress={350} style={[styles.bubble, outgoing ? styles.outgoing : styles.incoming, mediaOnly && styles.mediaBubble, message.pending && styles.pending, message.failed && styles.failed, highlighted && styles.bubbleHighlighted]}>
        {message.replyTo && !message.recalled ? <View style={[styles.reply, outgoing && styles.replyOutgoing]}><Text numberOfLines={1} style={[styles.replyName, outgoing && styles.outgoingText]}>{message.replyTo.senderName}</Text><Text numberOfLines={1} style={[styles.replyText, outgoing && styles.outgoingSub]}>{message.replyTo.text}</Text></View> : null}
        {message.sticker && (message.image || message.file?.url) ? <ProtectedMessageImage palette={palette} t={t} uri={message.image || message.file?.url || ''} file={message.file} outgoing={outgoing} sticker /> : null}
        {message.image && !message.sticker ? <ProtectedMessageImage palette={palette} t={t} uri={message.image} file={message.file} outgoing={outgoing} /> : null}
        {audio ? <AudioMessage palette={palette} t={t} file={message.file!} outgoing={outgoing} messageId={message.id} /> : null}
        {message.file && !message.image && !message.sticker && !audio ? (
          <Pressable style={styles.file} onPress={() => openAttachment(message.file!, t)}>
            <View style={styles.fileIcon}><FileText color={outgoing ? '#fff' : palette.accent} size={20} /></View>
            <View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.fileName, outgoing && styles.outgoingText]}>{message.file.name}</Text><Text style={[styles.fileMeta, outgoing && styles.outgoingSub]}>{message.file.mime} · {message.file.size ? `${Math.round(message.file.size / 1024)} KB` : t('Tệp')}</Text></View>
          </Pressable>
        ) : null}
        {message.poll ? <PollCard palette={palette} t={t} message={message} outgoing={outgoing} onVote={onPollVote} onAddOption={onPollAddOption} onLock={onPollLock} viewerIdentities={viewerIdentities} groupMembers={groupMembers} /> : null}
        {message.location ? <LocationCard location={message.location} outgoing={outgoing} palette={palette} t={t} /> : null}
        {message.contactCard ? <ContactCardMessage contact={message.contactCard} outgoing={outgoing} palette={palette} t={t} onOpenContactChat={onOpenContactChat} /> : null}
        {message.pinned ? <View style={styles.pinnedLabel}><Pin color={outgoing ? '#BCEBFF' : palette.accent} size={12} /><Text style={[styles.pinnedText, outgoing && styles.outgoingSub]}>{t('Đã ghim')}</Text></View> : null}
        {message.edited ? <Pressable onPress={() => onShowEditHistory(message)} style={styles.editedLabel}><Pencil color={outgoing ? '#D9F2FF' : palette.accent} size={11} /><Text style={[styles.editedLabelText, outgoing && styles.outgoingSub]}>{t('Đã chỉnh sửa')}</Text></Pressable> : null}
        {message.text && !message.recalled && !message.poll && (!message.location || (message.text !== `📍 Vị trí: ${message.location.address}` && message.text !== `📍 ${message.location.title}`)) && (!message.contactCard || message.text !== `🪪 Danh thiếp: ${message.contactCard.name}`) ? <View>
          {hasTranslatedText ? <Text style={[styles.translationLabel, outgoing && styles.outgoingSub]}>{t('Bản gốc')}</Text> : null}
          <Text style={[styles.text, outgoing && styles.outgoingText]}>{renderMentionText(message.text, message.mentions, groupMembers, outgoing, palette, onPressMention)}</Text>
          {translation?.status === 'loading' ? <View style={styles.translationLoading}><ActivityIndicator color={outgoing ? '#BCEBFF' : palette.accent} size="small" /><Text style={[styles.translationLabel, outgoing && styles.outgoingSub]}>{t('Đang dịch...')}</Text></View> : null}
          {hasTranslatedText ? <View style={[styles.translation, outgoing && styles.translationOutgoing]}><Text style={[styles.translationLabel, outgoing && styles.outgoingSub]}>{t('Bản dịch')}</Text><Text style={[styles.translationText, outgoing && styles.outgoingText]}>{translatedText}</Text></View> : null}
          {translation?.status === 'error' ? <Text style={styles.translationError}>{t(translation.error || 'Dịch tin nhắn tạm thời không khả dụng.')}</Text> : null}
        </View> : null}
        {!outgoing && message.grounded ? <View style={styles.grounded}><CheckCircle2 color={palette.online} size={13} /><Text style={styles.groundedText}>{t('Đã đối chiếu nguồn')}</Text></View> : null}
        {!outgoing && message.sources?.length ? <View style={styles.sources}><View style={styles.sourcesTitle}><BookOpen color={palette.accent} size={14} /><Text style={styles.sourcesTitleText}>{t('Nguồn tham khảo')}</Text></View>{message.sources.map((source, index) => <View key={`${source.title || source.file_name || index}`} style={styles.sourceCard}><Text style={styles.sourceIndex}>{index + 1}</Text><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.sourceName}>{source.title || source.file_name || `${t('Nguồn')} ${index + 1}`}</Text>{source.snippet ? <Text numberOfLines={2} style={styles.sourceSnippet}>{source.snippet}</Text> : null}</View></View>)}</View> : null}
        {message.recalled ? <View style={styles.recalled}><RotateCcw color={outgoing ? '#fff' : palette.muted} size={14} /><Text style={[styles.recalledText, outgoing && styles.outgoingText]}>{t('Tin nhắn đã được thu hồi')}</Text></View> : null}
        <View style={[styles.meta, mediaOnly && styles.mediaMeta]}><Text style={[styles.time, outgoing && !mediaOnly && styles.outgoingSub, mediaOnly && styles.mediaMetaText]}>{formatMessageTime(message.createdAt || message.time)}</Text>{outgoing ? <Text style={[styles.receipt, message.deliveryStatus === 'read' && styles.receiptRead]}>{receipt}</Text> : null}</View>
      </Pressable>
      {message.reactions && Object.keys(message.reactions).length > 0 ? <View style={[styles.reactions, outgoing && styles.reactionsOut]}><Text style={styles.reactionText}>{Object.entries(message.reactions).map(([emoji, count]) => `${emoji} ${count}`).join('  ')}</Text></View> : null}
      {message.failed ? <Text style={styles.failedText}>{t('Chưa gửi · chạm để thử lại')}</Text> : null}
    </View>
  );
}, (previous, next) => previous.message === next.message && previous.isGroup === next.isGroup && previous.groupMembers === next.groupMembers && previous.translationEntryKey === next.translationEntryKey && previous.onOpenContactChat === next.onOpenContactChat && previous.onPressMention === next.onPressMention && previous.highlighted === next.highlighted);

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
  const styles = getBubbleStyles(palette);
  return <View style={styles.senderMeta}><Avatar name={profile.name} uri={profile.avatar} size={25} /><Text numberOfLines={1} style={styles.senderName}>{profile.name}</Text></View>;
}

function GroupEventMessage({ event, message, palette, groupMembers, isGroup }: { event: GroupEvent; message: ChatMessage; palette: ThemeColors; groupMembers: ConversationMember[]; isGroup: boolean }) {
  const styles = getBubbleStyles(palette);
  const { t } = useI18n();
  const outgoing = message.sender === 'outgoing';
  const incomingGroupProfile = getGroupSenderProfile(message, groupMembers, isGroup);
  return <View style={[styles.line, outgoing ? styles.outgoingLine : styles.incomingLine]}>
    {incomingGroupProfile ? <SenderMeta palette={palette} profile={incomingGroupProfile} /> : null}
    <View style={[styles.bubble, styles.eventBubble, outgoing ? styles.outgoing : styles.incoming]}>
      <View style={styles.eventHeading}><CalendarDays color={outgoing ? '#BCEBFF' : palette.accent} size={18} /><Text style={[styles.eventLabel, outgoing && styles.outgoingSub]}>{t('Lịch nhóm')}</Text></View>
      <Text style={[styles.eventTitle, outgoing && styles.outgoingText]}>{event.title}</Text>
      <Text style={[styles.eventDate, outgoing && styles.outgoingText]}>{formatGroupEventDate(event.startsAt)}</Text>
      {event.note ? <Text style={[styles.eventNote, outgoing && styles.outgoingSub]}>{event.note}</Text> : null}
      <View style={styles.meta}><Text style={[styles.time, outgoing && styles.outgoingSub]}>{formatMessageTime(message.createdAt || message.time)}</Text></View>
    </View>
  </View>;
}

function PollCard({ palette, t, message, outgoing, onVote, onAddOption, onLock, viewerIdentities, groupMembers }: { palette: ThemeColors; t: (value: string) => string; message: ChatMessage; outgoing: boolean; onVote?: (message: ChatMessage, optionIds: string[]) => void; onAddOption?: (message: ChatMessage, optionText: string) => void; onLock?: (message: ChatMessage) => void; viewerIdentities: string[]; groupMembers: ConversationMember[] }) {
  const styles = getBubbleStyles(palette);
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
  return <View style={[styles.poll, outgoing && styles.pollOutgoing]}><View style={styles.pollHeading}><Text style={[styles.pollLabel, outgoing && styles.outgoingSub]}>{t('Bình chọn')}</Text>{closed ? <Text style={[styles.pollClosed, outgoing && styles.outgoingSub]}>{t('Đã đóng')}</Text> : null}</View><Text style={[styles.pollQuestion, outgoing && styles.outgoingText]}>{poll.question}</Text>{poll.options.map(option => { const selectedOption = selected.includes(option.id); const count = showResults ? counts[option.id] || 0 : 0; const percent = showResults && total ? Math.round((count / total) * 100) : 0; return <Pressable key={option.id} onPress={() => toggle(option.id)} style={[styles.pollOption, selectedOption && styles.pollOptionSelected, outgoing && styles.pollOptionOutgoing]}><View style={styles.pollOptionTop}><View style={[styles.pollRadio, selectedOption && styles.pollRadioSelected]}>{selectedOption ? <Check color="#fff" size={12} /> : null}</View><Text style={[styles.pollOptionText, outgoing && styles.outgoingText]}>{option.text}</Text>{showResults ? <Text style={[styles.pollCount, outgoing && styles.outgoingSub]}>{count}</Text> : null}</View><View style={styles.pollTrack}><View style={[styles.pollProgress, { width: `${percent}%` as any }, outgoing && styles.pollProgressOutgoing]} /></View></Pressable>; })}{!showResults ? <Text style={[styles.pollHint, outgoing && styles.outgoingSub]}>{t('Kết quả sẽ hiện sau khi bạn bình chọn')}</Text> : null}{poll.settings.allowAddOptions && !closed && onAddOption ? <View style={styles.pollAddOption}><TextInput value={optionText} onChangeText={setOptionText} maxLength={120} placeholder={t('Thêm phương án')} placeholderTextColor={palette.muted} style={styles.pollOptionInput} /><Pressable onPress={submitOption} disabled={!optionText.trim()} style={[styles.pollIconButton, !optionText.trim() && styles.pollSubmitDisabled]}><Plus color="#fff" size={16} /></Pressable></View> : null}<View style={styles.pollActions}>{onVote ? <Pressable disabled={closed || selected.length === 0} onPress={() => onVote(message, selected)} style={[styles.pollSubmit, (closed || selected.length === 0) && styles.pollSubmitDisabled]}><Text style={styles.pollSubmitText}>{closed ? t('Bình chọn đã đóng') : t('Gửi lựa chọn')}</Text></Pressable> : null}{canLock ? <Pressable onPress={() => onLock?.(message)} style={styles.pollLock}><LockKeyhole color={palette.warning} size={15} /><Text style={styles.pollLockText}>{t('Khóa')}</Text></Pressable> : null}</View></View>;
}

function formatAudioDuration(durationMs = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(durationMs || 0) / 1000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

const WAVE_BARS = [4, 6, 12, 16, 8, 14, 20, 12, 18, 14, 8, 12, 16, 20, 14, 10, 16, 18, 12, 6, 4];

let activeVoicePlayerInstance: { stop: () => void; id: string } | null = null;

function AudioMessage({ palette, t, file, outgoing, messageId }: { palette: ThemeColors; t: (value: string) => string; file: FileAttachment; outgoing: boolean; messageId?: string }) {
  const styles = getBubbleStyles(palette);
  const playerRef = useRef<AudioPlayer | null>(null);
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(Number(file.audioDurationMs) || 0);
  const [error, setError] = useState('');

  const id = String(messageId || file.url || file.name || '').trim();

  useEffect(() => () => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    const player = playerRef.current;
    playerRef.current = null;
    player?.remove();
    if (activeVoicePlayerInstance?.id === id) {
      activeVoicePlayerInstance = null;
    }
  }, [id]);

  const handleStatus = (status: AudioStatus) => {
    if (status.error) {
      console.warn('[AudioMessage] playback error:', status.error);
      setError(t('Không phát được voice.'));
      setPlaying(false);
      setLoading(false);
      return;
    }
    setLoading(!status.isLoaded && !status.error);
    setPlaying(Boolean(status.playing));
    setPosition(Math.round(Number(status.currentTime) * 1000) || 0);
    setDuration(Math.round(Number(status.duration) * 1000) || Number(file.audioDurationMs) || 0);
    if (status.didJustFinish) {
      setPlaying(false);
      setPosition(0);
      void playerRef.current?.seekTo(0).catch(() => {});
      if (activeVoicePlayerInstance?.id === id) {
        activeVoicePlayerInstance = null;
      }
    }
  };

  const togglePlayback = async () => {
    if (loading) return;
    setError('');

    // Nếu đang phát chính audio này -> Tạm dừng
    if (playing) {
      playerRef.current?.pause();
      setPlaying(false);
      return;
    }

    // Nếu player đã nạp xong và còn giữ trạng thái -> Phát tiếp
    if (playerRef.current && playerRef.current.isLoaded) {
      if (activeVoicePlayerInstance && activeVoicePlayerInstance.id !== id) {
        activeVoicePlayerInstance.stop();
      }
      activeVoicePlayerInstance = {
        id,
        stop: () => {
          playerRef.current?.pause();
          setPlaying(false);
        },
      };
      playerRef.current.play();
      setPlaying(true);
      return;
    }

    setLoading(true);
    try {
      if (activeVoicePlayerInstance) {
        activeVoicePlayerInstance.stop();
        activeVoicePlayerInstance = null;
      }

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
      });

      const uri = await tinodeClient.cacheFile(file);

      if (playerRef.current) {
        subscriptionRef.current?.remove();
        subscriptionRef.current = null;
        playerRef.current.remove();
        playerRef.current = null;
      }

      const player = createAudioPlayer({ uri }, { updateInterval: 150, downloadFirst: false });
      playerRef.current = player;
      subscriptionRef.current = player.addListener('playbackStatusUpdate', handleStatus);

      activeVoicePlayerInstance = {
        id,
        stop: () => {
          playerRef.current?.pause();
          setPlaying(false);
        },
      };

      player.play();
      setPlaying(true);
    } catch (playbackError) {
      console.warn('[AudioMessage] togglePlayback error:', playbackError);
      setError(t('Không phát được voice.'));
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  };

  const progress = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;

  return (
    <View style={[styles.audioContainer, outgoing && styles.audioContainerOutgoing]}>
      <View style={styles.audioRow}>
        <Pressable
          accessibilityLabel={playing ? t('Tạm dừng voice') : t('Phát voice')}
          onPress={() => void togglePlayback()}
          style={styles.audioButtonRound}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : playing ? (
            <Pause color="#fff" size={18} fill="#fff" />
          ) : (
            <Play color="#fff" size={18} fill="#fff" style={{ marginLeft: 2 }} />
          )}
        </Pressable>

        <View style={styles.audioBody}>
          <View style={styles.waveformWrap}>
            {WAVE_BARS.map((height, index) => {
              const barRatio = index / (WAVE_BARS.length - 1);
              const isPast = barRatio <= progress;
              return (
                <View
                  key={`wave-${index}`}
                  style={[
                    styles.waveformBar,
                    { height },
                    isPast
                      ? outgoing ? styles.waveformBarPastOutgoing : styles.waveformBarPastIncoming
                      : outgoing ? styles.waveformBarFutureOutgoing : styles.waveformBarFutureIncoming,
                  ]}
                />
              );
            })}
            <View
              style={[
                styles.waveformPlayhead,
                { left: `${progress * 100}%` as any },
                outgoing && styles.waveformPlayheadOutgoing,
              ]}
            />
          </View>
          <Text style={[styles.audioMeta, outgoing && styles.outgoingSub]}>
            {error || formatAudioDuration(position || duration) || '00:00'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function ProtectedMessageImage({ palette, t, uri, file, outgoing, sticker = false }: { palette: ThemeColors; t: (value: string) => string; uri: string; file?: FileAttachment; outgoing: boolean; sticker?: boolean }) {
  const styles = getBubbleStyles(palette);
  const [attempt, setAttempt] = useState(0);
  const [mediaVersion, setMediaVersion] = useState(() => tinodeClient.getMediaVersion(uri));
  const [source, setSource] = useState(() => tinodeClient.getCachedImageUri(uri));
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
    const cached = tinodeClient.getCachedImageUri(uri);
    if (cached) {
      setSource(cached);
      setFailed(false);
    } else {
      setSource('');
      setFailed(false);
    }
    void tinodeClient.cacheImage(uri).then(value => {
      if (active) {
        setSource(value);
        setFailed(false);
      }
    }).catch(() => {
      if (active && !cached) setFailed(true);
    });
    return () => { active = false; };
  }, [attempt, uri, mediaVersion]);

  const height = Math.max(150, Math.min(330, 250 / Math.max(0.55, Math.min(2.2, ratio))));
  if (sticker) {
    if (failed) return <Pressable onPress={() => setAttempt(value => value + 1)} style={styles.stickerState}><ImageOff color={outgoing ? '#fff' : palette.accent} size={18} /><Text style={[styles.stickerStateText, outgoing && styles.outgoingText]}>{t('Không tải được sticker')}</Text></Pressable>;
    if (!source) return <View style={styles.stickerState}><ActivityIndicator color={outgoing ? '#fff' : palette.accent} /><Text style={[styles.stickerStateText, outgoing && styles.outgoingText]}>{t('Đang tải sticker...')}</Text></View>;
    return <Image source={{ uri: source }} style={styles.stickerImage} resizeMode="contain" />;
  }
  const attachment = file || { name: 'hình-ảnh.jpg', mime: 'image/jpeg', size: 0, url: uri };
  if (failed) return <Pressable onPress={() => setAttempt(value => value + 1)} style={styles.imageState}><ImageOff color={outgoing ? '#fff' : palette.accent} size={25} /><Text style={[styles.imageStateText, outgoing && styles.outgoingText]}>{t('Không tải được ảnh · chạm để thử lại')}</Text></Pressable>;
  if (!source) return <View style={styles.imageState}><ActivityIndicator color={outgoing ? '#fff' : palette.accent} /><Text style={[styles.imageStateText, outgoing && styles.outgoingText]}>{t('Đang tải ảnh...')}</Text></View>;
  return (
    <>
      <Pressable onPress={() => setViewerOpen(true)}><Image source={{ uri: source }} style={[styles.image, { height }]} resizeMode="cover" onLoad={event => { const { width, height: loadedHeight } = event.nativeEvent.source; if (width && loadedHeight) setRatio(width / loadedHeight); }} /></Pressable>
      <Modal visible={viewerOpen} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setViewerOpen(false)}>
        <View style={styles.viewer}>
          <Image source={{ uri: source }} style={styles.viewerImage} resizeMode="contain" />
          <Pressable onPress={() => setViewerOpen(false)} style={[styles.viewerButton, styles.viewerClose]}><X color="#fff" size={23} /></Pressable>
          <Pressable onPress={() => openAttachment(attachment, t)} style={[styles.viewerButton, styles.viewerDownload]}><Download color="#fff" size={22} /></Pressable>
        </View>
      </Modal>
    </>
  );
}

function LocationCard({ location, outgoing, palette, t }: { location: LocationAttachment; outgoing: boolean; palette: ThemeColors; t: (k: string) => string }) {
  const styles = getBubbleStyles(palette);
  const isLive = location.kind === 'live';

  const handleOpenMap = () => {
    beginTrustedExternalActivity();
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
    void Linking.openURL(mapUrl).catch(() => {});
  };

  const handleStopLive = () => {
    if (isLive) {
      void liveLocationService.stopLiveSharing(location.liveId);
    }
  };

  if (isLive) {
    const isActive = location.isActive;
    const remainingMinutes = Math.max(1, Math.round(((location.expiresAt || 0) - Date.now()) / 60000));
    const staticMapUrl = `https://static-maps.yandex.ru/1.x/?ll=${location.longitude},${location.latitude}&z=15&l=map&size=450,200`;

    return (
      <View style={[styles.liveCard, outgoing && styles.liveCardOutgoing, !isActive && styles.liveCardExpired]}>
        <View style={styles.liveHeader}>
          <View style={[styles.liveDot, isActive ? styles.liveDotActive : styles.liveDotExpired]} />
          <Text numberOfLines={1} style={[styles.liveHeaderText, outgoing && styles.outgoingText]}>
            {isActive ? t('Đang chia sẻ hành trình trực tiếp') : t('Đã kết thúc chia sẻ hành trình')}
          </Text>
        </View>

        <Pressable onPress={handleOpenMap} style={styles.liveMapWrap}>
          <Image source={{ uri: staticMapUrl }} style={styles.liveMapImage} resizeMode="cover" />
          <View style={styles.liveMapAvatarPin}>
            <Avatar name={location.senderName || 'Bạn'} uri={location.senderAvatar} size={28} rounded />
            <View style={styles.liveMapPinTip} />
          </View>
        </Pressable>

        <View style={styles.liveFooter}>
          <Text style={[styles.liveRemainingTime, outgoing && styles.outgoingSub]}>
            {isActive
              ? `${t('Còn')} ${remainingMinutes} ${t('phút')} · ${t('Cập nhật vừa xong')}`
              : t('Đã kết thúc')}
          </Text>

          {isActive && outgoing ? (
            <Pressable
              accessibilityRole="button"
              onPress={handleStopLive}
              style={styles.stopLiveBtn}
            >
              <Text style={styles.stopLiveBtnText}>{t('Dừng chia sẻ')}</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={handleOpenMap}
              style={styles.viewLiveBtn}
            >
              <Text style={[styles.viewLiveBtnText, outgoing && styles.viewLiveBtnTextOutgoing]}>
                {t('Xem trên bản đồ')}
              </Text>
              <ExternalLink color={outgoing ? '#BCEBFF' : palette.accent} size={12} />
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  const staticMapUrl = location.previewUrl || `https://static-maps.yandex.ru/1.x/?ll=${location.longitude},${location.latitude}&z=15&l=map&size=450,180`;

  return (
    <Pressable onPress={handleOpenMap} style={[styles.locationCard, outgoing && styles.locationCardOutgoing]}>
      <View style={styles.staticMapWrap}>
        <Image source={{ uri: staticMapUrl }} style={styles.staticMapImage} resizeMode="cover" />
        <View style={styles.staticMapPinOverlay}>
          <MapPin color="#F25C54" size={24} />
        </View>
      </View>
      <View style={styles.locationBody}>
        <Text numberOfLines={1} style={[styles.locationTitle, outgoing && styles.outgoingText]}>
          {location.title || t('Vị trí')}
        </Text>
        <Text numberOfLines={2} style={[styles.locationAddress, outgoing && styles.outgoingSub]}>
          {location.address || `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`}
        </Text>
        {location.accuracy ? (
          <Text style={[styles.locationAccuracy, outgoing && styles.outgoingSub]}>
            {t('Chính xác đến')} {Math.round(location.accuracy)}m
          </Text>
        ) : null}
      </View>
      <View style={styles.locationActionRow}>
        <Text style={[styles.locationActionText, outgoing && styles.locationActionTextOutgoing]}>
          {t('Xem trên bản đồ')}
        </Text>
        <ExternalLink color={outgoing ? '#BCEBFF' : palette.accent} size={14} />
      </View>
    </Pressable>
  );
}

function ContactCardMessage({ contact, outgoing, palette, t, onOpenContactChat }: { contact: ContactCardAttachment; outgoing: boolean; palette: ThemeColors; t: (k: string) => string; onOpenContactChat?: (contact: ContactCardAttachment) => void }) {
  const styles = getBubbleStyles(palette);
  const handleCall = () => {
    if (contact.phone) {
      beginTrustedExternalActivity();
      void Linking.openURL(`tel:${contact.phone}`).catch(() => {});
    }
  };

  const handleChat = () => {
    onOpenContactChat?.(contact);
  };

  return (
    <Pressable onPress={handleChat} style={[styles.contactCard, outgoing && styles.contactCardOutgoing]}>
      <View style={styles.contactCardHeader}>
        <Avatar name={contact.name} uri={contact.avatar} size={42} rounded />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text numberOfLines={1} style={[styles.contactCardName, outgoing && styles.outgoingText]}>
            {contact.name}
          </Text>
          <Text numberOfLines={1} style={[styles.contactCardSub, outgoing && styles.outgoingSub]}>
            {[contact.title, contact.department].filter(Boolean).join(' · ') || t('Danh thiếp')}
          </Text>
          {contact.phone ? (
            <Text numberOfLines={1} style={[styles.contactCardPhone, outgoing && styles.outgoingSub]}>
              {contact.phone}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.contactCardActionRow}>
        {contact.userId ? (
          <Pressable onPress={handleChat} style={[styles.contactCardActionBtn, outgoing && styles.contactCardActionBtnOutgoing]}>
            <MessageSquare color={outgoing ? '#FFFFFF' : palette.accent} size={14} />
            <Text style={[styles.contactCardActionText, outgoing && styles.contactCardActionTextOutgoing]}>
              {t('Nhắn tin')}
            </Text>
          </Pressable>
        ) : null}
        {contact.phone ? (
          <Pressable onPress={handleCall} style={[styles.contactCardActionBtn, outgoing && styles.contactCardActionBtnOutgoing]}>
            <Phone color={outgoing ? '#FFFFFF' : palette.accent} size={14} />
            <Text style={[styles.contactCardActionText, outgoing && styles.contactCardActionTextOutgoing]}>
              {t('Gọi điện')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

function openAttachment(file: FileAttachment, t: (value: string) => string = value => value) {
  beginTrustedExternalActivity();
  void tinodeClient.downloadFile(file).catch(error => Alert.alert(t('Không mở được tệp'), error instanceof Error ? t(error.message) : t('Thử lại sau.')));
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    line: { marginBottom: 12, paddingHorizontal: 16 },
    outgoingLine: { alignItems: 'flex-end' },
    incomingLine: { alignItems: 'flex-start' },
    senderMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, maxWidth: '86%', marginLeft: 4, marginBottom: 4 },
    senderName: { ...typography.caption, color: palette.inkSoft, flexShrink: 1 },
    bubble: { maxWidth: '86%', minWidth: 70, borderRadius: 21, paddingHorizontal: 15, paddingTop: 12, paddingBottom: 8, shadowColor: palette.ink, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
    bubbleHighlighted: { borderWidth: 2, borderColor: '#2196F3', shadowColor: '#2196F3', shadowOpacity: 0.4, shadowRadius: 8, elevation: 5 },
    outgoing: { backgroundColor: palette.bubbleOutgoing, borderBottomRightRadius: 6 },
    incoming: { backgroundColor: palette.bubbleIncoming, borderBottomLeftRadius: 6 },
    eventBubble: { minWidth: 230, maxWidth: '88%', gap: 7 },
    eventHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    eventLabel: { ...typography.caption, color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold' },
    eventTitle: { ...typography.bodyMedium, color: palette.ink },
    eventDate: { ...typography.caption, color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold' },
    eventNote: { ...typography.caption, color: palette.inkSoft, lineHeight: 18 },
    mediaBubble: { padding: 2, backgroundColor: 'transparent', minWidth: 0, overflow: 'hidden' },
    stickerImage: { width: 156, height: 156 },
    stickerState: { width: 156, height: 70, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: `${palette.accent}12` },
    stickerStateText: { ...typography.caption, color: palette.accentDeep, fontSize: 10 },
    pending: { opacity: 0.65 },
    failed: { borderWidth: 1, borderColor: palette.danger },
    text: { ...typography.body, color: palette.ink, paddingBottom: 3 },
    outgoingText: { color: '#fff' },
    translationLabel: { ...typography.caption, color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold', fontSize: 10, marginBottom: 2 },
    translation: { marginTop: 7, paddingTop: 7, borderTopWidth: 1, borderTopColor: `${palette.accent}35` },
    translationOutgoing: { borderTopColor: 'rgba(255,255,255,0.28)' },
    translationText: { ...typography.body, color: palette.ink },
    translationLoading: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    translationError: { ...typography.caption, color: palette.danger, marginTop: 4 },
    mention: { color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold', textDecorationLine: 'underline' },
    mentionOutgoing: { color: '#BCEBFF', textDecorationLine: 'underline' },
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
    audioContainer: { minWidth: 230, maxWidth: 285, borderRadius: 17, padding: 4 },
    audioContainerOutgoing: { backgroundColor: 'transparent' },
    audioRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    audioButtonRound: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0084FF', alignItems: 'center', justifyContent: 'center', elevation: 2, shadowColor: '#0084FF', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
    audioBody: { flex: 1, gap: 4 },
    waveformWrap: { flexDirection: 'row', alignItems: 'center', height: 22, position: 'relative', overflow: 'hidden' },
    waveformBar: { width: 2.5, borderRadius: 1.5, marginHorizontal: 1.2 },
    waveformBarPastIncoming: { backgroundColor: palette.accent },
    waveformBarPastOutgoing: { backgroundColor: '#FFFFFF' },
    waveformBarFutureIncoming: { backgroundColor: `${palette.ink}24` },
    waveformBarFutureOutgoing: { backgroundColor: 'rgba(255,255,255,0.32)' },
    waveformPlayhead: { position: 'absolute', top: 0, bottom: 0, width: 2, borderRadius: 1, backgroundColor: palette.accent },
    waveformPlayheadOutgoing: { backgroundColor: '#E1F5FE' },
    audioMeta: { ...typography.caption, color: palette.accentDeep, fontSize: 11 },

    audioMessage: { width: 220, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 15, backgroundColor: palette.accentWash },
    audioMessageOutgoing: { backgroundColor: 'rgba(255,255,255,0.14)' },
    audioButton: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper },
    audioTrack: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: `${palette.accent}35` },
    audioProgress: { height: 5, borderRadius: 3, backgroundColor: palette.accent },
    audioProgressOutgoing: { backgroundColor: '#BCEBFF' },
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
    liveCard: { minWidth: 240, maxWidth: 280, borderRadius: 14, overflow: 'hidden', backgroundColor: palette.paper, marginBottom: 4 },
    liveCardOutgoing: { backgroundColor: 'rgba(255,255,255,0.15)' },
    liveCardExpired: { opacity: 0.8 },
    liveHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 8 },
    liveDot: { width: 8, height: 8, borderRadius: 4 },
    liveDotActive: { backgroundColor: '#2ED573' },
    liveDotExpired: { backgroundColor: palette.muted },
    liveHeaderText: { ...typography.caption, fontWeight: '600', color: palette.ink, flex: 1 },
    liveMapWrap: { width: '100%', height: 110, backgroundColor: '#E8ECEF', position: 'relative', overflow: 'hidden' },
    liveMapImage: { width: '100%', height: '100%' },
    liveMapAvatarPin: { position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -16 }, { translateY: -20 }], alignItems: 'center' },
    liveMapPinTip: { width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6, borderStyle: 'solid', backgroundColor: 'transparent', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#0084FF', marginTop: -2 },
    liveFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
    liveRemainingTime: { ...typography.caption, color: palette.muted, fontSize: 11, flex: 1 },
    stopLiveBtn: { backgroundColor: 'rgba(242, 92, 84, 0.15)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
    stopLiveBtnText: { ...typography.caption, color: '#F25C54', fontWeight: '700', fontSize: 11 },
    viewLiveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    viewLiveBtnText: { ...typography.caption, color: palette.accent, fontWeight: '600', fontSize: 11 },
    viewLiveBtnTextOutgoing: { color: '#BCEBFF' },
    staticMapWrap: { width: '100%', height: 100, borderRadius: 10, overflow: 'hidden', backgroundColor: '#E8ECEF', position: 'relative' },
    staticMapImage: { width: '100%', height: '100%' },
    staticMapPinOverlay: { position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -12 }, { translateY: -24 }] },
    locationBody: { paddingHorizontal: 4, paddingTop: 6 },
    locationAccuracy: { ...typography.caption, color: palette.muted, fontSize: 10.5, marginTop: 1 },
    locationCard: { minWidth: 220, maxWidth: 260, padding: 8, borderRadius: 14, backgroundColor: palette.paper, marginBottom: 4 },
    locationCardOutgoing: { backgroundColor: 'rgba(255,255,255,0.15)' },
    locationHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    locationPinBox: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F25C54', justifyContent: 'center', alignItems: 'center' },
    locationTitle: { ...typography.bodyMedium, color: palette.ink, fontWeight: '700' },
    locationAddress: { ...typography.caption, color: palette.inkSoft, marginTop: 2 },
    locationActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: palette.line },
    locationActionText: { ...typography.caption, color: palette.accent, fontWeight: '600', fontSize: 11 },
    locationActionTextOutgoing: { color: '#BCEBFF' },
    contactCard: { minWidth: 230, maxWidth: 270, padding: 12, borderRadius: 14, backgroundColor: palette.paper, marginBottom: 4 },
    contactCardOutgoing: { backgroundColor: 'rgba(255,255,255,0.15)' },
    contactCardHeader: { flexDirection: 'row', alignItems: 'center' },
    contactCardName: { ...typography.bodyMedium, color: palette.ink, fontWeight: '700' },
    contactCardSub: { ...typography.caption, color: palette.inkSoft, marginTop: 1 },
    contactCardPhone: { ...typography.caption, color: palette.accentDeep, marginTop: 2, fontSize: 11 },
    contactCardBtn: { marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: palette.line, alignItems: 'center' },
    contactCardBtnOutgoing: { borderTopColor: 'rgba(255,255,255,0.2)' },
    contactCardBtnText: { ...typography.caption, color: palette.accent, fontWeight: '600' },
    contactCardBtnTextOutgoing: { color: '#BCEBFF' },
    contactCardActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: palette.line, gap: 8 },
    contactCardActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 },
    contactCardActionBtnOutgoing: { backgroundColor: 'rgba(255,255,255,0.12)' },
    contactCardActionText: { ...typography.caption, color: palette.accent, fontWeight: '600', fontSize: 12 },
    contactCardActionTextOutgoing: { color: '#FFFFFF' },
  });
}
