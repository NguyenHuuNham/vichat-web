import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Linking, Modal, Platform, Pressable, ScrollView, Share, StatusBar, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import {
  BarChart3,
  Bell,
  BellOff,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crown,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Languages,
  Link2,
  LogOut,
  Phone,
  Pin,
  Pencil,
  Plus,
  Search,
  Settings2,
  Shield,
  Tags,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { getConversation, useAppStore } from '../../store/appStore';
import { Avatar } from '../../components/Avatar';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ChoiceDialog, ChoiceDialogOption } from '../../components/ChoiceDialog';
import { ConversationNicknameModal } from '../../components/ConversationNicknameModal';
import { GroupEventComposer } from '../../components/GroupEventComposer';
import { NotificationMuteModal } from '../../components/NotificationMuteModal';
import { beginTrustedExternalActivity } from '../../services/appLifecycleService';
import { colorsForTheme, shadow, ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { ChatMessage, ConversationMember, GroupEvent, GroupSettings } from '../../types';
import { useThemeStore } from '../../store/themeStore';
import { DEFAULT_GROUP_SETTINGS, groupSettingEnabled, memberIsAdmin, memberIsOwner, normalizeGroupSettings } from '../../utils/groupSettings';
import {
  isConversationMuted,
  notificationMuteLabel,
  NotificationMuteOption,
  resolveNotificationMuteUntil,
} from '../../utils/conversationNotifications';
import { accountIdForMember, canonicalAccountIds, identitiesOverlap, identityValues } from '../../utils/identity';
import { conversationNicknameForMember } from '../../utils/conversationSync';
import { directPeerOnline } from '../../utils/tinodeState';
import { tinodeClient } from '../../services/tinodeClient';
import { useCallStore } from '../../store/callStore';
import { ConversationCategory, ConversationDisplayMode, loadConversationPreference, saveConversationPreference } from '../../services/conversationPreferenceService';
import { isImageMessage, mergeGroupHistoryMessages, messageFile, messageLinks, messagesForSharedKind, SharedContentKind } from '../../utils/groupInfoMedia';
import { formatGroupEventDate } from '../../utils/groupEvent';
import { useI18n } from '../../store/languageStore';
import { useTranslationStore } from '../../store/translationStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupInfo'>;
type ContentView = 'shared' | 'events' | 'pinned' | 'polls';
type SharedFilter = 'media' | 'files' | 'links';
type PreferencePicker = 'display' | 'category' | null;
type ContentItemKind = SharedContentKind | 'pinned' | 'polls';
type ConfirmRequest = { title: string; message: string; confirmLabel: string; eyebrow?: string; tone?: 'default' | 'danger'; onConfirm: () => void };

const settingLabels: Array<{ key: keyof GroupSettings; label: string; hint: string }> = [
  { key: 'allowMembersEditInfo', label: 'Thành viên sửa thông tin', hint: 'Cho phép thành viên đổi tên và ảnh nhóm.' },
  { key: 'allowPinMessages', label: 'Ghim tin nhắn', hint: 'Cho phép ghim nội dung quan trọng.' },
  { key: 'allowMessages', label: 'Gửi tin nhắn', hint: 'Khóa hoặc mở quyền gửi tin trong nhóm.' },
  { key: 'allowPolls', label: 'Tạo bình chọn', hint: 'Cho phép thành viên tạo bình chọn.' },
  { key: 'approveMembers', label: 'Duyệt thành viên mới', hint: 'Thành viên mới cần được quản trị viên phê duyệt.' },
  { key: 'newMemberHistory', label: 'Cho xem lịch sử cũ', hint: 'Thành viên mới được xem tin nhắn trước đó.' },
];

const groupMediaHistoryCache = new Map<string, ChatMessage[]>();
const resolvedImageUriCache = new Map<string, string>();
const GROUP_MEDIA_STORAGE_PREFIX = '@vichat_group_media_';

async function loadGroupMediaFromStorage(conversationId: string): Promise<ChatMessage[] | null> {
  try {
    const raw = await AsyncStorage.getItem(`${GROUP_MEDIA_STORAGE_PREFIX}${conversationId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function saveGroupMediaToStorage(conversationId: string, messages: ChatMessage[]): Promise<void> {
  try {
    if (!conversationId || !messages) return;
    const mediaOnly = messages.filter(m => isImageMessage(m) || Boolean(m.file) || messageLinks(m).length > 0).slice(-200);
    await AsyncStorage.setItem(`${GROUP_MEDIA_STORAGE_PREFIX}${conversationId}`, JSON.stringify(mediaOnly));
  } catch {
    // Non-critical cache error.
  }
}

export function GroupInfoScreen({ route, navigation }: Props) {
  const palette = colorsForTheme(useThemeStore(state => state.resolved));
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, StatusBar.currentHeight || 0);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { t, locale } = useI18n();
  const conversation = useAppStore(state => getConversation(state.conversations, route.params.conversationId));
  const translationTarget = useTranslationStore(state => state.targets[route.params.conversationId]);
  const setTranslationTarget = useTranslationStore(state => state.setTarget);
  const session = useAppStore(state => state.session);
  const connection = useAppStore(state => state.connection);
  const reconnect = useAppStore(state => state.reconnect);
  const directory = useAppStore(state => state.directory);
  const addGroupMembers = useAppStore(state => state.addGroupMembers);
  const approveGroupMember = useAppStore(state => state.approveGroupMember);
  const setGroupMemberRole = useAppStore(state => state.setGroupMemberRole);
  const removeGroupMember = useAppStore(state => state.removeGroupMember);
  const renameGroup = useAppStore(state => state.renameGroup);
  const updateGroupAvatar = useAppStore(state => state.updateGroupAvatar);
  const updateGroupSettings = useAppStore(state => state.updateGroupSettings);
  const updateConversationPin = useAppStore(state => state.updateConversationPin);
  const updateConversationNickname = useAppStore(state => state.updateConversationNickname);
  const muteConversation = useAppStore(state => state.muteConversation);
  const dissolveGroup = useAppStore(state => state.dissolveGroup);
  const deleteConversation = useAppStore(state => state.deleteConversation);
  const searchConversationHistory = useAppStore(state => state.searchConversationHistory);
  const createGroupEvent = useAppStore(state => state.createGroupEvent);
  const [busy, setBusy] = useState('');
  const [muteModalOpen, setMuteModalOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [renameOpen, setRenameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [settingsDraft, setSettingsDraft] = useState<GroupSettings>(DEFAULT_GROUP_SETTINGS);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const settingsRequestRef = useRef(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [leaveCandidates, setLeaveCandidates] = useState<Array<{ member: ConversationMember; accountId: string }>>([]);
  const [contentView, setContentView] = useState<ContentView | null>(null);
  const [eventComposerOpen, setEventComposerOpen] = useState(false);
  const [sharedFilter, setSharedFilter] = useState<SharedFilter>('media');
  const [historyMessages, setHistoryMessages] = useState<ChatMessage[] | null>(() => (route.params.conversationId ? groupMediaHistoryCache.get(route.params.conversationId) || null : null));
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [preference, setPreference] = useState(() => ({ displayMode: 'comfortable' as ConversationDisplayMode, category: '' as ConversationCategory, hidden: false }));
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const [preferencePicker, setPreferencePicker] = useState<PreferencePicker>(null);
  const [translationPickerOpen, setTranslationPickerOpen] = useState(false);
  const historyRequestRef = useRef('');
  const searchInputRef = useRef<TextInput>(null);
  const startCall = useCallStore(state => state.startCall);
  const activeCall = useCallStore(state => state.call);
  const [membersExpanded, setMembersExpanded] = useState(false);
  const [groupSettingsExpanded, setGroupSettingsExpanded] = useState(false);
  const [nicknameMember, setNicknameMember] = useState<ConversationMember | null>(null);

  useEffect(() => {
    settingsRequestRef.current += 1;
    setSettingsBusy(false);
    setSettingsDraft(normalizeGroupSettings(conversation?.groupSettings));
  }, [conversation?.id, conversation?.groupSettings]);

  useEffect(() => {
    setNameDraft(conversation?.name || '');
    setConfirmRequest(null);
    setLeaveCandidates([]);
    setContentView(null);
    setEventComposerOpen(false);
    setSharedFilter('media');
    setHistoryMessages(conversation?.id ? groupMediaHistoryCache.get(conversation.id) || null : null);
    setHistoryError('');
    setHasMoreHistory(true);
    setLoadingMoreHistory(false);
    historyRequestRef.current = '';
    setMembersExpanded(false);
    setGroupSettingsExpanded(false);
    setNicknameMember(null);
  }, [conversation?.id, conversation?.name]);

  useEffect(() => {
    let active = true;
    const viewerId = String(session?.user.id || '');
    const tenantId = String(session?.tenant?.id || '');
    if (!viewerId || !tenantId || !conversation?.id) {
      setPreference({ displayMode: 'comfortable', category: '', hidden: false });
      return () => { active = false; };
    }
    void loadConversationPreference(viewerId, tenantId, conversation.id).then(value => {
      if (active) setPreference(value);
    });
    return () => { active = false; };
  }, [conversation?.id, session?.tenant?.id, session?.user.id]);

  useEffect(() => {
    let active = true;
    if (!conversation?.id) return;
    if (groupMediaHistoryCache.has(conversation.id)) {
      const cached = groupMediaHistoryCache.get(conversation.id) || null;
      setHistoryMessages(cached);
      if (cached?.length) {
        const minSeq = cached.reduce((min, m) => (m.seq && m.seq < min ? m.seq : min), Infinity);
        if (minSeq <= 1) setHasMoreHistory(false);
      }
      return;
    }
    void loadGroupMediaFromStorage(conversation.id).then(stored => {
      if (active && stored?.length) {
        groupMediaHistoryCache.set(conversation.id, stored);
        setHistoryMessages(current => current ? mergeGroupHistoryMessages(current, stored) : stored);
        const minSeq = stored.reduce((min, m) => (m.seq && m.seq < min ? m.seq : min), Infinity);
        if (minSeq <= 1) setHasMoreHistory(false);
      }
    });
    return () => { active = false; };
  }, [conversation?.id]);

  useEffect(() => {
    if (!conversation?.tinodeTopic || historyRequestRef.current === conversation.id) return;
    if (!tinodeClient.connected) {
      void reconnect();
      return;
    }
    historyRequestRef.current = conversation.id;
    setHistoryLoading(true);
    setHistoryError('');
    let active = true;
    const updateMediaMessages = (msgs: ChatMessage[], hasEarlier?: boolean) => {
      if (!active || !msgs) return;
      setHistoryMessages(current => {
        const merged = mergeGroupHistoryMessages(current || [], msgs);
        if (conversation?.id) {
          groupMediaHistoryCache.set(conversation.id, merged);
          void saveGroupMediaToStorage(conversation.id, merged);
        }
        if (hasEarlier !== undefined) {
          setHasMoreHistory(hasEarlier);
        } else {
          const minSeq = merged.reduce((min, m) => (m.seq && m.seq < min ? m.seq : min), Infinity);
          if (minSeq <= 1) setHasMoreHistory(false);
        }
        return merged;
      });
    };
    void tinodeClient.loadConversationMediaHistory(
      conversation.tinodeTopic,
      40,
      session?.generation || undefined,
      interim => {
        if (interim?.messages?.length) updateMediaMessages(interim.messages, interim.hasEarlierMedia);
      }
    )
      .then(loaded => {
        updateMediaMessages(loaded.messages, loaded.hasEarlierMedia);
      })
      .catch(error => {
        if (!active) return;
        historyRequestRef.current = '';
        setHistoryError(error instanceof Error ? error.message : t('Không tải được đầy đủ nội dung nhóm.'));
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => { active = false; };
  }, [connection, conversation?.id, conversation?.tinodeTopic, reconnect, session?.generation, t]);

  const loadMoreMedia = async () => {
    if (loadingMoreHistory || !hasMoreHistory || !conversation?.tinodeTopic) return;
    setLoadingMoreHistory(true);
    setHistoryError('');
    try {
      const currentMessages = historyMessages || [];
      const minSeq = currentMessages.reduce((min, m) => (m.seq && m.seq < min ? m.seq : min), Infinity);
      const beforeSeq = Number.isFinite(minSeq) && minSeq > 1 ? minSeq : undefined;
      if (beforeSeq === undefined || beforeSeq <= 1) {
        setHasMoreHistory(false);
        return;
      }
      const result = await tinodeClient.loadMoreConversationMediaHistory(
        conversation.tinodeTopic,
        beforeSeq,
        40,
        session?.generation || undefined,
        interim => {
          if (interim?.messages?.length) {
            setHistoryMessages(current => {
              const merged = mergeGroupHistoryMessages(current || [], interim.messages);
              if (conversation?.id) groupMediaHistoryCache.set(conversation.id, merged);
              return merged;
            });
          }
        },
        15,
      );
      if (result.conversation?.messages?.length) {
        setHistoryMessages(current => {
          const merged = mergeGroupHistoryMessages(current || [], result.conversation.messages);
          if (conversation?.id) {
            groupMediaHistoryCache.set(conversation.id, merged);
            void saveGroupMediaToStorage(conversation.id, merged);
          }
          return merged;
        });
      }
      setHasMoreHistory(result.hasEarlier);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : t('Không tải thêm được nội dung.'));
    } finally {
      setLoadingMoreHistory(false);
    }
  };

  const isGroup = Boolean(conversation?.isGroup);
  const currentMember = conversation?.members?.find(member => identitiesOverlap(member, session?.user));
  const isOwner = Boolean(currentMember && memberIsOwner(currentMember))
    || identitiesOverlap({ id: conversation?.adminId, uid: conversation?.adminId }, session?.user);
  const isAdmin = isOwner || Boolean(currentMember && memberIsAdmin(currentMember));
  const canEditInfo = isAdmin || groupSettingEnabled(conversation?.groupSettings, 'allowMembersEditInfo');
  const peer = !isGroup
    ? conversation?.members?.find(member => !identitiesOverlap(member, session?.user) && !identitiesOverlap(member, { id: tinodeClient.currentUserId, uid: tinodeClient.currentUserId })) || conversation?.members?.[0]
    : null;
  const peerAccountId = peer ? accountIdForMember(peer, directory) : '';
  const canEditNickname = Boolean(!isGroup && !conversation?.isChatbot && peer && peerAccountId && peer.type !== 'bot' && !peer.isChatbot);
  const peerUser = useMemo(() => {
    if (!peer) return null;
    return directory.find(u => identitiesOverlap(u, peer) || (peerAccountId && u.id === peerAccountId));
  }, [peer, directory, peerAccountId]);
  const isPeerOnline = Boolean(!isGroup && conversation && directPeerOnline(conversation, tinodeClient.currentUserId));

  const callCapability = !isGroup && !conversation?.isChatbot && conversation?.tinodeTopic
    ? tinodeClient.getCallCapability(conversation.tinodeTopic, { isGroup: false, isChatbot: false })
    : { available: false, reason: 'Cuộc gọi mobile chỉ hỗ trợ hội thoại 1-1.' };

  const beginCall = (audioOnly: boolean) => {
    if (!conversation) return;
    void startCall(conversation.tinodeTopic, audioOnly, { name: peer?.name || conversation.name, avatar: peer?.avatar || conversation.avatarUrl }).catch(value => {
      Alert.alert(t('Không thể bắt đầu cuộc gọi'), value instanceof Error ? t(value.message) : t('Vui lòng thử lại sau.'));
    });
  };
  const members = useMemo(() => conversation?.members || [], [conversation?.members]);
  const pendingMembers = useMemo(() => conversation?.pendingMembers || [], [conversation?.pendingMembers]);
  const messages = useMemo(
    () => mergeGroupHistoryMessages(conversation?.messages || [], historyMessages || []),
    [conversation?.messages, historyMessages]
  );
  const sharedImages = useMemo(() => messagesForSharedKind(messages, 'media'), [messages]);
  const sharedFiles = useMemo(() => messagesForSharedKind(messages, 'files'), [messages]);
  const sharedLinks = useMemo(() => messagesForSharedKind(messages, 'links'), [messages]);
  const groupEvents = useMemo(() => {
    const byId = new Map<string, ChatMessage>();
    messages.forEach(message => {
      const event = message.groupEvent;
      if (!event?.id) return;
      const previous = byId.get(event.id);
      if (!previous || (Number(previous.seq) || 0) < (Number(message.seq) || 0)) byId.set(event.id, message);
    });
    return [...byId.values()]
      .map(message => ({ message, event: message.groupEvent! }))
      .sort((first, second) => Date.parse(first.event.startsAt) - Date.parse(second.event.startsAt));
  }, [messages]);
  const pinnedMessages = useMemo(() => messages.filter(message => message.pinned), [messages]);
  const pollMessages = useMemo(() => messages.filter(message => Boolean(message.poll)), [messages]);
  const contentItems = contentView === 'shared'
    ? sharedFilter === 'media' ? sharedImages : sharedFilter === 'files' ? sharedFiles : sharedLinks
    : contentView === 'pinned' ? pinnedMessages : pollMessages;
  const contentTitle = contentView === 'shared'
    ? t('Ảnh, file, link')
    : contentView === 'events'
      ? t('Lịch nhóm')
    : contentView === 'pinned'
      ? t('Tin nhắn đã ghim')
      : t('Bình chọn trong nhóm');
  const categoryLabels: Record<ConversationCategory, string> = {
    '': t('Chưa phân loại'),
    customer: t('Khách hàng'),
    work: t('Công việc'),
    urgent: t('Ưu tiên'),
    'follow-up': t('Cần theo dõi'),
    other: t('Khác'),
  };
  const existingIds = useMemo(() => new Set([...members, ...pendingMembers].flatMap(member => identityValues(member))), [members, pendingMembers]);
  const candidates = useMemo(() => directory.filter(user => {
    const identityMatches = identityValues(user).some(identity => existingIds.has(identity));
    const currentUser = identitiesOverlap(user, session?.user);
    const query = addQuery.trim().toLowerCase();
    const searchable = [user.name, user.username, user.email, user.department, user.title].filter(Boolean).join(' ').toLowerCase();
    return !identityMatches && !currentUser && searchable.includes(query);
  }), [addQuery, directory, existingIds, session?.user]);

  const run = async (key: string, action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    try {
      await action();
    } catch (value) {
      Alert.alert(t('Không thể thực hiện'), value instanceof Error ? t(value.message) : t('Vui lòng thử lại sau.'));
    } finally {
      setBusy('');
    }
  };

  const handleToggleMute = () => {
    if (!conversation) return;
    if (isConversationMuted(conversation.notificationMutedUntil)) {
      void muteConversation(conversation.id, null);
    } else {
      setMuteModalOpen(true);
    }
  };

  const handleConfirmMute = (option: NotificationMuteOption) => {
    if (!conversation) return;
    const until = resolveNotificationMuteUntil(option);
    void muteConversation(conversation.id, until);
    setMuteModalOpen(false);
  };

  const submitGroupEvent = async (event: Pick<GroupEvent, 'title' | 'startsAt' | 'note' | 'reminderMinutes'>) => {
    if (!conversation) return;
    await run('group-event', async () => {
      await createGroupEvent(conversation.id, event);
      setEventComposerOpen(false);
      setContentView('events');
    });
  };

  const savePreferencePatch = async (patch: Partial<typeof preference>) => {
    if (!conversation || !session?.user.id || !session.tenant?.id || preferenceBusy) return;
    setPreferenceBusy(true);
    try {
      const next = await saveConversationPreference(
        session.user.id,
        session.tenant.id,
        conversation.id,
        patch,
      );
      setPreference(next);
    } catch (error) {
      Alert.alert(t('Không thể lưu tùy chọn'), error instanceof Error ? t(error.message) : t('Vui lòng thử lại sau.'));
      throw error;
    } finally {
      setPreferenceBusy(false);
    }
  };

  const requestHideConversation = (hidden: boolean) => {
    if (!hidden) {
      void savePreferencePatch({ hidden: false }).catch(() => {});
      return;
    }
    setConfirmRequest({
      title: t('Ẩn trò chuyện?'),
      message: t('Cuộc trò chuyện sẽ được ẩn khỏi danh sách trên thiết bị này. Tin nhắn và dữ liệu gốc không bị xóa.'),
      confirmLabel: t('Ẩn trò chuyện'),
      eyebrow: t('TÙY CHỌN RIÊNG TƯ'),
      onConfirm: () => void savePreferencePatch({ hidden: true }).then(() => navigation.goBack()).catch(() => {}).finally(() => setConfirmRequest(null)),
    });
  };

  const openLink = async (url: string) => {
    if (!/^https?:\/\//i.test(url)) return;
    try {
      if (!(await Linking.canOpenURL(url))) throw new Error(t('Liên kết không được hỗ trợ trên thiết bị này.'));
      beginTrustedExternalActivity();
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(t('Không mở được liên kết'), error instanceof Error ? t(error.message) : t('Vui lòng thử lại sau.'));
    }
  };

  const shareLink = async (url: string) => {
    try {
      beginTrustedExternalActivity();
      await Share.share({ message: url, url });
    } catch (error) {
      if ((error as any)?.message !== 'User did not share') Alert.alert(t('Không chia sẻ được'), error instanceof Error ? t(error.message) : t('Vui lòng thử lại sau.'));
    }
  };

  const downloadSharedFile = async (file: NonNullable<ChatMessage['file']>) => {
    try {
      beginTrustedExternalActivity();
      await tinodeClient.downloadFile(file);
    } catch (error) {
      Alert.alert(t('Không tải được tệp'), error instanceof Error ? t(error.message) : t('Vui lòng thử lại sau.'));
    }
  };

  const chooseAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('Cần cấp quyền'), t('ViChat cần quyền truy cập ảnh để đổi avatar nhóm.'));
      return;
    }
    beginTrustedExternalActivity();
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    const asset: any = !result.canceled ? result.assets?.[0] : null;
    if (!asset || !conversation) return;
    await run('avatar', () => updateGroupAvatar(conversation.id, {
      uri: asset.uri,
      name: asset.fileName || 'group-avatar.jpg',
      type: asset.mimeType || 'image/jpeg',
      size: asset.fileSize,
    }));
  };

  const submitRename = async () => {
    if (!conversation || !nameDraft.trim()) return;
    await run('rename', async () => {
      await renameGroup(conversation.id, nameDraft.trim());
      setRenameOpen(false);
    });
  };

  const changeSetting = async (key: keyof GroupSettings, value: boolean) => {
    if (!conversation || !isAdmin || settingsBusy || busy) return;
    const previousSettings = normalizeGroupSettings(settingsDraft);
    const nextSettings = { ...previousSettings, [key]: value };
    const requestId = settingsRequestRef.current + 1;
    settingsRequestRef.current = requestId;
    setSettingsDraft(nextSettings);
    setSettingsBusy(true);
    try {
      await updateGroupSettings(conversation.id, nextSettings);
    } catch (error) {
      if (settingsRequestRef.current !== requestId) return;
      setSettingsDraft(previousSettings);
      Alert.alert(t('Không thể lưu cài đặt'), error instanceof Error ? t(error.message) : t('Vui lòng thử lại sau.'));
    } finally {
      if (settingsRequestRef.current === requestId) setSettingsBusy(false);
    }
  };

  const addMembers = async () => {
    if (!conversation || selectedIds.length === 0) return;
    const accountIds = canonicalAccountIds(selectedIds, directory);
    if (accountIds.length !== selectedIds.length) {
      Alert.alert(t('Không xác định được thành viên'), t('Chỉ có thể thêm thành viên bằng Account ID của nhân viên cùng công ty.'));
      return;
    }
    await run('add', async () => {
      await addGroupMembers(conversation.id, accountIds);
      setSelectedIds([]);
      setAddQuery('');
      setAddOpen(false);
    });
  };

  const handleLeave = () => {
    if (!conversation) return;
    const others = members.filter(member => !identitiesOverlap(member, session?.user));
    const replacementOptions = others
      .map(member => ({ member, accountId: accountIdForMember(member, directory) }))
      .filter(value => Boolean(value.accountId));
    if (isOwner && others.length > 0) {
      if (replacementOptions.length === 0) {
        Alert.alert(t('Chưa đồng bộ thành viên'), t('Không xác định được Account ID của thành viên thay thế. Hãy tải lại nhóm rồi thử lại.'));
        return;
      }
      setLeaveCandidates(replacementOptions.slice(0, 8));
      return;
    }
    setConfirmRequest({
      title: t('Rời nhóm?'),
      message: t('Bạn sẽ không còn thấy nhóm này trong danh sách.'),
      confirmLabel: t('Rời nhóm'),
      eyebrow: t('THÀNH VIÊN NHÓM'),
      tone: 'danger',
      onConfirm: () => void run('leave', async () => { await deleteConversation(conversation.id); navigation.popToTop(); }).finally(() => setConfirmRequest(null)),
    });
  };

  const handleDissolve = () => {
    if (!conversation) return;
    setConfirmRequest({
      title: t('Giải tán nhóm?'),
      message: t('Tất cả thành viên sẽ bị đưa ra khỏi nhóm và lịch sử nhóm sẽ không còn mở được.'),
      confirmLabel: t('Giải tán'),
      eyebrow: t('QUYỀN TRƯỞNG NHÓM'),
      tone: 'danger',
      onConfirm: () => void run('dissolve', async () => { await dissolveGroup(conversation.id); navigation.popToTop(); }).finally(() => setConfirmRequest(null)),
    });
  };

  const handleRemoveMember = (member: ConversationMember, accountId: string) => {
    if (!conversation) return;
    setConfirmRequest({
      title: t('Xóa thành viên?'),
      message: t(`Bạn có chắc muốn xóa ${member.name} khỏi nhóm "${conversation.name}"?`),
      confirmLabel: t('Xóa thành viên'),
      eyebrow: t('QUẢN TRỊ NHÓM'),
      tone: 'danger',
      onConfirm: () => void run(`remove-${accountId}`, () => removeGroupMember(conversation.id, accountId)).finally(() => setConfirmRequest(null)),
    });
  };

  const runSearch = async () => {
    if (!conversation || !searchQuery.trim()) return;
    setSearching(true);
    try {
      setSearchResults(await searchConversationHistory(conversation.id, searchQuery));
    } catch (value) {
      Alert.alert(t('Tìm kiếm thất bại'), value instanceof Error ? t(value.message) : t('Vui lòng thử lại sau.'));
    } finally {
      setSearching(false);
    }
  };

  if (!conversation) return <View style={[styles.screen, { paddingTop: topInset }]}><Text style={styles.empty}>{t('Cuộc trò chuyện không còn khả dụng.')}</Text></View>;

  const sharedSummary = `${sharedImages.length} ${t('ảnh')} · ${sharedFiles.length} ${t('file')} · ${sharedLinks.length} ${t('link')}`;
  const membersSummary = `${members.length} ${t('thành viên')}${pendingMembers.length ? ` · ${pendingMembers.length} ${t('chờ duyệt')}` : ''}`;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: topInset, minHeight: 56 + topInset }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconButton} hitSlop={8} accessibilityLabel={t('Quay lại')}><ChevronLeft color={palette.ink} size={25} /></Pressable>
        <Text style={styles.headerTitle}>{isGroup ? t('Thông tin nhóm') : t('Thông tin hội thoại')}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 130 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        <View style={styles.identityBlock}>
          <View style={styles.avatarWrap}>
            <Avatar name={conversation.name} uri={conversation.avatarUrl} size={92} rounded={!isGroup} online={isPeerOnline} />
            {isGroup && canEditInfo ? <Pressable onPress={() => void chooseAvatar()} style={styles.avatarEdit} disabled={Boolean(busy)} accessibilityLabel={t('Đổi ảnh nhóm')}><Camera color="#fff" size={17} /></Pressable> : null}
          </View>
          <View style={styles.nameRow}>
            <Text numberOfLines={2} style={styles.groupName}>{conversation.name}</Text>
            {isGroup && canEditInfo ? <Pressable onPress={() => { setNameDraft(conversation.name); setRenameOpen(true); }} style={styles.smallIcon} accessibilityLabel={t('Đổi tên nhóm')}><Settings2 color={palette.accent} size={17} /></Pressable> : null}
          </View>
          {isGroup ? (
            <Text style={styles.memberCount}>{members.length} {t('thành viên')}</Text>
          ) : (
            <Text style={styles.memberCount}>
              {[peerUser?.department, peerUser?.title, isPeerOnline ? t('Đang hoạt động') : t('Offline')].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>

        {isGroup ? (
          <View style={styles.quickRow}>
            <Pressable onPress={handleToggleMute} style={[styles.quickAction, isConversationMuted(conversation.notificationMutedUntil) && styles.quickActive]} disabled={Boolean(busy)} accessibilityLabel={isConversationMuted(conversation.notificationMutedUntil) ? t('Bật thông báo') : t('Tắt thông báo')}>
              <View style={styles.quickIcon}>{isConversationMuted(conversation.notificationMutedUntil) ? <BellOff color={palette.accent} size={18} /> : <Bell color={palette.accent} size={18} />}</View>
              <Text style={styles.quickText}>{isConversationMuted(conversation.notificationMutedUntil) ? t('Bật thông báo') : t('Tắt thông báo')}</Text>
            </Pressable>
            <Pressable onPress={handleLeave} style={styles.quickAction} disabled={Boolean(busy)}>
              <View style={[styles.quickIcon, { backgroundColor: `${palette.danger}18` }]}><LogOut color={palette.danger} size={18} /></View>
              <Text style={[styles.quickText, styles.dangerText]}>{t('Rời nhóm')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.quickRow}>
            <Pressable
              onPress={() => beginCall(true)}
              disabled={!callCapability.available || Boolean(activeCall)}
              style={[styles.quickAction, (!callCapability.available || Boolean(activeCall)) && styles.quickActionDisabled]}
              accessibilityLabel={t('Gọi thoại')}
            >
              <View style={styles.quickIcon}><Phone color={palette.accent} size={18} /></View>
              <Text style={styles.quickText}>{t('Gọi thoại')}</Text>
            </Pressable>
            <Pressable
              onPress={() => beginCall(false)}
              disabled={!callCapability.available || Boolean(activeCall)}
              style={[styles.quickAction, (!callCapability.available || Boolean(activeCall)) && styles.quickActionDisabled]}
              accessibilityLabel={t('Gọi video')}
            >
              <View style={styles.quickIcon}><Video color={palette.accent} size={18} /></View>
              <Text style={styles.quickText}>{t('Gọi video')}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                searchInputRef.current?.focus();
              }}
              style={styles.quickAction}
              accessibilityLabel={t('Tìm kiếm')}
            >
              <View style={styles.quickIcon}><Search color={palette.accent} size={18} /></View>
              <Text style={styles.quickText}>{t('Tìm kiếm')}</Text>
            </Pressable>
            <Pressable
              onPress={handleToggleMute}
              style={[styles.quickAction, isConversationMuted(conversation.notificationMutedUntil) && styles.quickActive]}
              disabled={Boolean(busy)}
              accessibilityLabel={isConversationMuted(conversation.notificationMutedUntil) ? t('Bật thông báo') : t('Tắt thông báo')}
            >
              <View style={styles.quickIcon}>{isConversationMuted(conversation.notificationMutedUntil) ? <BellOff color={palette.accent} size={18} /> : <Bell color={palette.accent} size={18} />}</View>
              <Text style={styles.quickText}>{isConversationMuted(conversation.notificationMutedUntil) ? t('Bật thông báo') : t('Tắt thông báo')}</Text>
            </Pressable>
          </View>
        )}

        <SectionHeading title={t('Nội dung')} icon={BarChart3} palette={palette} />
        <View style={styles.menu}>
          <DetailRow
            testID="group-shared-content-row"
            icon={ImageIcon}
            label={t('Ảnh, file, link')}
            detail={historyLoading && !sharedImages.length && !sharedFiles.length && !sharedLinks.length ? t('Đang tải...') : sharedSummary}
            preview={<SharedPreview loading={historyLoading && !sharedImages.length && !sharedFiles.length && !sharedLinks.length} images={sharedImages} files={sharedFiles} links={sharedLinks} palette={palette} />}
            onPress={() => setContentView('shared')}
            palette={palette}
          />
          {isGroup ? (
            <DetailRow
              testID="group-calendar-row"
              icon={CalendarDays}
              label={t('Lịch nhóm')}
              detail={groupEvents.length ? `${groupEvents.length} ${t('lịch đã tạo')}` : t('Tạo lịch hẹn cho cả nhóm')}
              onPress={() => setContentView('events')}
              palette={palette}
            />
          ) : null}
          <DetailRow icon={Pin} label={t('Tin nhắn đã ghim')} detail={pinnedMessages.length ? `${pinnedMessages.length} ${t('tin nhắn')}` : t('Chưa có tin nhắn đã ghim')} onPress={pinnedMessages.length ? () => setContentView('pinned') : undefined} disabled={!pinnedMessages.length} last={!isGroup} palette={palette} />
          {isGroup ? (
            <DetailRow icon={BarChart3} label={t('Bình chọn')} detail={pollMessages.length ? `${pollMessages.length} ${t('bình chọn')}` : t('Chưa có bình chọn')} onPress={pollMessages.length ? () => setContentView('polls') : undefined} disabled={!pollMessages.length} last palette={palette} />
          ) : null}
        </View>

        {isGroup ? (
          <>
            <SectionHeading title={t('Thành viên & nhóm')} icon={Users} palette={palette} />
            <View style={styles.menu}>
              <DetailRow
                testID="group-members-row"
                icon={Users}
                label={t('Xem thành viên')}
                detail={membersSummary}
                onPress={() => setMembersExpanded(value => !value)}
                trailing={membersExpanded ? <ChevronUp color={palette.muted} size={19} /> : <ChevronDown color={palette.muted} size={19} />}
                palette={palette}
              />
            </View>

            {membersExpanded ? (
              <View style={styles.membersPanel}>
                <Pressable onPress={() => setAddOpen(true)} style={styles.primaryAction} disabled={Boolean(busy)}><UserPlus color="#fff" size={18} /><Text style={styles.primaryText}>{t('Thêm thành viên')}</Text></Pressable>
                {pendingMembers.length > 0 && isAdmin ? <View style={styles.pendingBox}><Text style={styles.sectionLabel}>{t('Chờ duyệt')} ({pendingMembers.length})</Text>{pendingMembers.map(member => { const accountId = accountIdForMember(member, directory); return <MemberRow key={`pending-${accountId || identityValues(member).join('-')}`} member={member} pending palette={palette} onApprove={accountId ? () => void run(`approve-${accountId}`, () => approveGroupMember(conversation.id, accountId, true)) : undefined} onReject={accountId ? () => void run(`reject-${accountId}`, () => approveGroupMember(conversation.id, accountId, false)) : undefined} />; })}</View> : null}
                <View style={styles.memberList}>{members.map(member => {
                  const owner = memberIsOwner(member);
                  const admin = memberIsAdmin(member);
                  const self = identitiesOverlap(member, session?.user);
                  const accountId = accountIdForMember(member, directory);
                  const canEditMemberNickname = Boolean(accountId) && member.type !== 'bot' && !member.isChatbot;
                  return <MemberRow key={accountId || identityValues(member).join('-')} member={member} owner={owner} admin={admin} self={self} canManage={isAdmin && !self && !owner && Boolean(accountId)} palette={palette} onNickname={canEditMemberNickname ? () => setNicknameMember(member) : undefined} onRole={accountId ? () => void run(`role-${accountId}`, () => setGroupMemberRole(conversation.id, accountId, admin ? 'MEMBER' : 'ADMIN')) : undefined} onRemove={accountId ? () => handleRemoveMember(member, accountId) : undefined} />;
                })}</View>
              </View>
            ) : null}
          </>
        ) : null}

        <SectionHeading title={t('Cuộc trò chuyện')} icon={Settings2} palette={palette} />
        <View style={styles.menu}>
          <DetailRow
            testID="conversation-notification-row"
            icon={isConversationMuted(conversation.notificationMutedUntil) ? BellOff : Bell}
            label={t('Thông báo cuộc trò chuyện')}
            detail={isConversationMuted(conversation.notificationMutedUntil)
              ? (notificationMuteLabel(conversation.notificationMutedUntil, undefined, locale) || t('Đã tắt thông báo'))
              : t('Đang bật thông báo')}
            onPress={handleToggleMute}
            palette={palette}
          />
          {!isGroup && canEditNickname && peer ? (
            <DetailRow
              testID="conversation-nickname-row"
              icon={Pencil}
              label={t('Đổi biệt danh')}
              detail={conversationNicknameForMember(peer, conversation.conversationNicknames) || t('Đặt tên gợi nhớ cho người này')}
              onPress={() => setNicknameMember(peer)}
              palette={palette}
            />
          ) : null}
          <DetailRow
            testID="conversation-translation-row"
            icon={Languages}
            label={t('Dịch trò chuyện')}
            detail={translationTarget === 'en' ? t('Đang dịch sang English') : translationTarget === 'vi' ? t('Đang dịch sang Tiếng Việt') : t('Chạm để chọn ngôn ngữ đích')}
            onPress={() => setTranslationPickerOpen(true)}
            palette={palette}
          />
          <DetailRow
            testID="conversation-pin-row"
            icon={Pin}
            label={t('Ghim trò chuyện')}
            detail={conversation.pinned ? t('Đang ghim trong danh sách') : t('Đưa lên đầu danh sách trò chuyện')}
            control={<Switch testID="conversation-pin-switch" accessibilityLabel={t('Ghim trò chuyện')} value={Boolean(conversation.pinned)} onValueChange={value => void run('pin', () => updateConversationPin(conversation.id, value))} disabled={Boolean(busy)} trackColor={{ false: palette.line, true: `${palette.accent}88` }} thumbColor={conversation.pinned ? palette.accent : palette.paper} />}
            palette={palette}
          />
          <DetailRow icon={Settings2} label={t('Mục hiển thị')} detail={preference.displayMode === 'compact' ? t('Gọn') : t('Thoải mái')} onPress={() => setPreferencePicker('display')} palette={palette} />
          <DetailRow icon={Tags} label={t('Thẻ phân loại')} detail={categoryLabels[preference.category]} onPress={() => setPreferencePicker('category')} palette={palette} />
          <DetailRow
            icon={EyeOff}
            label={t('Ẩn trò chuyện')}
            detail={preference.hidden ? t('Đang ẩn trên thiết bị này') : t('Chỉ ẩn khỏi danh sách của bạn')}
            onPress={() => requestHideConversation(!preference.hidden)}
            control={<Switch accessibilityLabel={t('Ẩn trò chuyện')} value={preference.hidden} onValueChange={requestHideConversation} disabled={preferenceBusy} trackColor={{ false: palette.line, true: `${palette.accent}88` }} thumbColor={preference.hidden ? palette.accent : palette.paper} />}
            last
            palette={palette}
          />
        </View>

        {isGroup && isAdmin ? <>
          <SectionHeading title={t('Cài đặt nhóm')} icon={Settings2} palette={palette} />
          <View style={styles.menu}>
            <DetailRow icon={Settings2} label={t('Cài đặt nhóm')} detail={groupSettingsExpanded ? t('Thu gọn bảng điều khiển') : t('Mở bảng điều khiển quản trị nhóm')} onPress={() => setGroupSettingsExpanded(value => !value)} trailing={groupSettingsExpanded ? <ChevronUp color={palette.muted} size={19} /> : <ChevronDown color={palette.muted} size={19} />} palette={palette} />
          </View>
          {groupSettingsExpanded ? <View style={styles.settingsBox}>
            <Text style={styles.settingsNotice}>{settingsBusy ? t('Đang lưu thay đổi...') : t('Bật hoặc tắt để lưu ngay.')}</Text>
            {settingLabels.map(item => <View key={item.key} style={styles.settingRow}><View style={styles.settingCopy}><Text style={styles.settingLabel}>{t(item.label)}</Text><Text style={styles.settingHint}>{t(item.hint)}</Text></View><Switch testID={`group-setting-${item.key}`} accessibilityLabel={t(item.label)} value={settingsDraft[item.key]} onValueChange={value => void changeSetting(item.key, value)} disabled={settingsBusy || Boolean(busy)} trackColor={{ false: palette.line, true: `${palette.accent}88` }} thumbColor={settingsDraft[item.key] ? palette.accent : palette.paper} /></View>)}
          </View> : null}
        </> : null}

        <SectionHeading title={t('Tìm trong lịch sử')} icon={Search} palette={palette} />
        <View style={styles.searchRow}><View style={styles.historySearch}><Search color={palette.muted} size={17} /><TextInput ref={searchInputRef} value={searchQuery} onChangeText={setSearchQuery} placeholder={t('Tìm tin nhắn...')} placeholderTextColor={palette.muted} style={styles.historyInput} onSubmitEditing={() => void runSearch()} /></View><Pressable onPress={() => void runSearch()} style={styles.searchButton} disabled={searching}><Search color="#fff" size={18} /></Pressable></View>
        {searchResults.length > 0 ? <View style={styles.results}>{searchResults.map((item, index) => <View style={styles.resultRow} key={`${item.id || item.seq || index}`}><Text style={styles.resultText}>{String(item.text || item.content || item.message || t('Tin nhắn'))}</Text><Text style={styles.resultMeta}>{String(item.senderName || item.sender_name || '')}</Text></View>)}</View> : null}

        {isGroup && isOwner ? <View style={styles.dangerZone}><View style={styles.dangerHeading}><Crown color={palette.warning} size={18} /><Text style={styles.dangerTitle}>{t('Quyền trưởng nhóm')}</Text></View><Text style={styles.settingHint}>{t('Giải tán nhóm sẽ đóng hội thoại với tất cả thành viên.')}</Text><Pressable onPress={handleDissolve} style={styles.dangerButton} disabled={Boolean(busy)}><Trash2 color={palette.danger} size={18} /><Text style={styles.dangerButtonText}>{busy === 'dissolve' ? t('Đang giải tán...') : t('Giải tán nhóm')}</Text></Pressable></View> : null}
      </ScrollView>

      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.modalOverlay}><Pressable style={styles.modalBackdrop} onPress={() => setAddOpen(false)} /><View style={styles.modalSheet}><View style={styles.modalHeader}><Text style={styles.modalTitle}>{t('Thêm thành viên')}</Text><Pressable onPress={() => setAddOpen(false)} style={styles.smallIcon} accessibilityLabel={t('Đóng')}><X color={palette.inkSoft} size={19} /></Pressable></View><View style={styles.modalSearch}><Search color={palette.muted} size={18} /><TextInput value={addQuery} onChangeText={setAddQuery} placeholder={t('Tìm nhân viên')} placeholderTextColor={palette.muted} style={styles.modalSearchInput} autoCorrect={false} /><Pressable onPress={() => setAddQuery('')} disabled={!addQuery} hitSlop={10} accessibilityLabel={t('Xóa')}><X color={palette.muted} size={17} /></Pressable></View><FlatList data={candidates} keyExtractor={item => item.id} contentContainerStyle={styles.candidateList} renderItem={({ item }) => { const selected = selectedIds.includes(item.id); return <Pressable onPress={() => setSelectedIds(current => selected ? current.filter(id => id !== item.id) : [...current, item.id])} style={styles.candidate}><Avatar name={item.name} uri={item.avatar} size={42} /><View style={styles.candidateCopy}><Text style={styles.memberName}>{item.name}</Text><Text style={styles.memberMeta}>{item.department || item.title || item.username}</Text></View><View style={[styles.check, selected && styles.checkActive]}>{selected ? <Check color="#fff" size={15} /> : <Plus color={palette.accent} size={17} />}</View></Pressable>; }} ListEmptyComponent={<Text style={styles.emptyList}>{t('Không còn nhân viên phù hợp.')}</Text>} /><Pressable onPress={() => void addMembers()} style={styles.primaryAction} disabled={selectedIds.length === 0 || Boolean(busy)}><UserPlus color="#fff" size={18} /><Text style={styles.primaryText}>{busy === 'add' ? t('Đang thêm...') : `${t('Thêm')} ${selectedIds.length || ''} ${t('thành viên')}`}</Text></Pressable></View></View>
      </Modal>

      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}><View style={styles.modalOverlay}><Pressable style={styles.modalBackdrop} onPress={() => setRenameOpen(false)} /><View style={styles.renameCard}><Text style={styles.modalTitle}>{t('Đổi tên nhóm')}</Text><TextInput value={nameDraft} onChangeText={setNameDraft} autoFocus maxLength={120} placeholder={t('Tên nhóm')} placeholderTextColor={palette.muted} style={styles.nameInput} /><View style={styles.modalActions}><Pressable onPress={() => setRenameOpen(false)} style={styles.secondaryButton}><Text style={styles.secondaryText}>{t('Hủy')}</Text></Pressable><Pressable onPress={() => void submitRename()} style={styles.primarySmall} disabled={!nameDraft.trim() || Boolean(busy)}><Check color="#fff" size={17} /><Text style={styles.primaryText}>{busy === 'rename' ? t('Đang lưu...') : t('Lưu')}</Text></Pressable></View></View></View></Modal>

      <Modal visible={Boolean(contentView)} transparent animationType="slide" onRequestClose={() => setContentView(null)} statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setContentView(null)} />
          <View style={styles.contentSheet}>
            <View style={styles.modalHeader}><View><Text style={styles.sectionLabel}>{isGroup ? t('NỘI DUNG NHÓM') : t('NỘI DUNG TRÒ CHUYỆN')}</Text><Text style={styles.modalTitle}>{contentTitle}</Text></View><Pressable onPress={() => setContentView(null)} style={styles.smallIcon} accessibilityLabel={t('Đóng')}><X color={palette.inkSoft} size={19} /></Pressable></View>
            {contentView === 'shared' ? <View style={styles.filterRow}>{([['media', 'Ảnh'], ['files', 'File'], ['links', 'Link']] as Array<[SharedFilter, string]>).map(([id, label]) => <Pressable key={id} onPress={() => setSharedFilter(id)} style={[styles.filterTab, sharedFilter === id && styles.filterTabActive]}><Text style={[styles.filterText, sharedFilter === id && styles.filterTextActive]}>{t(label)}</Text></Pressable>)}</View> : null}
            {contentView === 'events' ? <View style={styles.eventToolbar}><Text style={styles.detailHint}>{t('Lịch được đồng bộ trong cuộc trò chuyện')}</Text><Pressable onPress={() => setEventComposerOpen(true)} style={styles.primarySmall} disabled={Boolean(busy)}><Plus color="#fff" size={17} /><Text style={styles.primaryText}>{t('Tạo lịch')}</Text></Pressable></View> : null}
            {historyLoading ? <View style={styles.loadingRow}><ActivityIndicator color={palette.accent} /><Text style={styles.detailHint}>{t('Đang tải toàn bộ lịch sử nội dung...')}</Text></View> : null}
            {historyError ? <Text style={styles.historyError}>{historyError}</Text> : null}
            <ScrollView contentContainerStyle={styles.contentItems}>
              {contentView === 'events'
                ? groupEvents.length
                  ? groupEvents.map(({ message, event }) => <GroupEventSummaryCard key={event.id} event={event} message={message} palette={palette} />)
                  : <Text style={styles.emptyList}>{t('Chưa có lịch nhóm nào.')}</Text>
                : contentItems.length
                  ? <>
                      {contentItems.map((message, index) => <SharedContentItem
                        key={`${message.id || message.seq || index}`}
                        message={message}
                        kind={contentView === 'shared' ? sharedFilter : contentView === 'pinned' ? 'pinned' : 'polls'}
                        palette={palette}
                        onOpenLink={openLink}
                        onShareLink={shareLink}
                        onDownloadFile={downloadSharedFile}
                      />)}
                      {contentView === 'shared' && hasMoreHistory ? (
                        <View style={styles.loadMoreContainer}>
                          <Pressable
                            onPress={() => void loadMoreMedia()}
                            disabled={loadingMoreHistory || historyLoading}
                            style={styles.loadMoreButton}
                          >
                            {loadingMoreHistory ? (
                              <View style={styles.loadMoreInner}>
                                <ActivityIndicator size="small" color={palette.accent} />
                                <Text style={styles.loadMoreText}>{t('Đang quét thêm lịch sử...')}</Text>
                              </View>
                            ) : (
                              <Text style={styles.loadMoreText}>{t('Tải thêm nội dung cũ hơn')}</Text>
                            )}
                          </Pressable>
                        </View>
                      ) : null}
                    </>
                  : <>
                      <Text style={styles.emptyList}>{t('Chưa có nội dung trong phạm vi đã tải.')}</Text>
                      {contentView === 'shared' && hasMoreHistory ? (
                        <View style={styles.loadMoreContainer}>
                          <Pressable
                            onPress={() => void loadMoreMedia()}
                            disabled={loadingMoreHistory || historyLoading}
                            style={styles.loadMoreButton}
                          >
                            {loadingMoreHistory ? (
                              <View style={styles.loadMoreInner}>
                                <ActivityIndicator size="small" color={palette.accent} />
                                <Text style={styles.loadMoreText}>{t('Đang quét thêm lịch sử...')}</Text>
                              </View>
                            ) : (
                              <Text style={styles.loadMoreText}>{t('Tải thêm nội dung cũ hơn')}</Text>
                            )}
                          </Pressable>
                        </View>
                      ) : null}
                    </>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <GroupEventComposer
        visible={eventComposerOpen}
        busy={busy === 'group-event'}
        onClose={() => setEventComposerOpen(false)}
        onSubmit={event => { void submitGroupEvent(event); }}
      />

      <ConversationNicknameModal
        visible={Boolean(nicknameMember)}
        member={nicknameMember}
        initialNickname={nicknameMember ? conversationNicknameForMember(nicknameMember, conversation.conversationNicknames) : ''}
        onCancel={() => setNicknameMember(null)}
        onSave={async nickname => {
          if (!nicknameMember) return;
          const accountId = accountIdForMember(nicknameMember, directory);
          if (!accountId) throw new Error(t('Không xác định được Account ID của thành viên.'));
          await updateConversationNickname(conversation.id, accountId, nickname);
        }}
      />

      <ChoiceDialog
        visible={Boolean(preferencePicker)}
        title={preferencePicker === 'display' ? t('Mục hiển thị') : t('Thẻ phân loại')}
        message={preferencePicker === 'display' ? t('Tùy chọn này chỉ thay đổi cách hiển thị cuộc trò chuyện trên thiết bị của bạn.') : t('Thẻ được lưu riêng cho tài khoản và công ty hiện tại.')}
        options={preferencePicker === 'display'
          ? [
            { id: 'comfortable', label: t('Thoải mái'), detail: t('Khoảng cách rộng, dễ đọc nội dung dài') },
            { id: 'compact', label: t('Gọn'), detail: t('Hiển thị nhiều cuộc trò chuyện hơn trên màn hình') },
          ]
          : [
            { id: '', label: t('Chưa phân loại') },
            { id: 'customer', label: t('Khách hàng') },
            { id: 'work', label: t('Công việc') },
            { id: 'urgent', label: t('Ưu tiên') },
            { id: 'follow-up', label: t('Cần theo dõi') },
            { id: 'other', label: t('Khác') },
          ]}
        onCancel={() => setPreferencePicker(null)}
        onSelect={option => {
          const picker = preferencePicker;
          setPreferencePicker(null);
          if (picker === 'display') void savePreferencePatch({ displayMode: option.id as ConversationDisplayMode }).catch(() => {});
          if (picker === 'category') void savePreferencePatch({ category: option.id as ConversationCategory }).catch(() => {});
        }}
        busy={preferenceBusy}
      />

      <ChoiceDialog
        visible={translationPickerOpen}
        title={t('Dịch trò chuyện')}
        message={t('Chọn ngôn ngữ đích')}
        options={[
          { id: '', label: t('Tắt dịch'), detail: t('Chỉ hiển thị bản gốc') },
          { id: 'vi', label: t('Dịch sang Tiếng Việt'), detail: t('Hiển thị bản gốc và bản dịch tiếng Việt') },
          { id: 'en', label: t('Dịch sang English'), detail: t('Hiển thị bản gốc và bản dịch tiếng Anh') },
        ]}
        onCancel={() => setTranslationPickerOpen(false)}
        onSelect={option => {
          setTranslationPickerOpen(false);
          if (!conversation) return;
          setTranslationTarget(conversation.id, option.id === 'vi' || option.id === 'en' ? option.id : null);
        }}
      />

      <ChoiceDialog
        visible={leaveCandidates.length > 0}
        title={t('Chọn trưởng nhóm mới')}
        message={t('Bạn phải chuyển quyền cho một thành viên trước khi rời nhóm.')}
        options={leaveCandidates.map(({ member, accountId }): ChoiceDialogOption => ({ id: accountId, label: member.name || member.username || accountId, detail: member.department || member.title || t('Thành viên trong nhóm') }))}
        onCancel={() => setLeaveCandidates([])}
        onSelect={option => {
          const candidate = leaveCandidates.find(item => item.accountId === option.id);
          if (!candidate || !conversation) return;
          setLeaveCandidates([]);
          void run('leave', async () => { await deleteConversation(conversation.id, candidate.accountId); navigation.popToTop(); });
        }}
        busy={Boolean(busy)}
      />

      <ConfirmDialog
        visible={Boolean(confirmRequest)}
        title={confirmRequest?.title || ''}
        message={confirmRequest?.message || ''}
        eyebrow={confirmRequest?.eyebrow}
        confirmLabel={confirmRequest?.confirmLabel || t('Xác nhận')}
        tone={confirmRequest?.tone}
        onCancel={() => setConfirmRequest(null)}
        onConfirm={() => confirmRequest?.onConfirm()}
        busy={Boolean(busy)}
      />

      <NotificationMuteModal
        visible={muteModalOpen}
        conversationName={conversation.name}
        onClose={() => setMuteModalOpen(false)}
        onConfirm={handleConfirmMute}
      />
    </View>
  );
}

function SectionHeading({ title, icon: Icon, palette }: { title: string; icon: any; palette: ThemeColors }) {
  const styles = createStyles(palette);
  return <View style={styles.sectionHeading}><Icon color={palette.accent} size={18} /><Text style={styles.sectionTitle}>{title}</Text></View>;
}

function DetailRow({ icon: Icon, label, detail, preview, onPress, disabled = false, control, trailing, last = false, testID, palette }: { icon: any; label: string; detail: string; preview?: ReactNode; onPress?: () => void; disabled?: boolean; control?: ReactNode; trailing?: ReactNode; last?: boolean; testID?: string; palette: ThemeColors }) {
  const styles = createStyles(palette);
  const { t } = useI18n();
  const canPress = Boolean(onPress) && !disabled;
  return <Pressable testID={testID} disabled={!canPress && !control} onPress={onPress} style={({ pressed }) => [styles.detailRow, last && styles.detailRowLast, disabled && styles.detailRowDisabled, pressed && styles.rowPressed]}><View style={[styles.detailIcon, disabled && styles.detailIconDisabled]}><Icon color={disabled ? palette.muted : palette.accent} size={19} /></View><View style={styles.detailCopy}><Text style={[styles.detailLabel, disabled && styles.detailLabelDisabled]}>{label}</Text><Text style={styles.detailHint}>{detail}</Text>{preview}</View><View style={styles.detailEnd}>{control || trailing || (canPress ? <ChevronRight color={palette.muted} size={19} /> : disabled ? <Text style={styles.unavailable}>{t('Chưa có')}</Text> : null)}</View></Pressable>;
}

function SharedPreview({ loading, images, files, links, palette }: { loading?: boolean; images: ChatMessage[]; files: ChatMessage[]; links: ChatMessage[]; palette: ThemeColors }) {
  const styles = createStyles(palette);
  const { t } = useI18n();
  const hasImages = images.length > 0;
  const hasFiles = files.length > 0;
  const hasLinks = links.length > 0;
  if (loading && !hasImages && !hasFiles && !hasLinks) {
    return (
      <View style={styles.previewStrip}>
        <ActivityIndicator size="small" color={palette.accent} />
        <Text style={[styles.previewEmpty, { marginTop: 0 }]}>{t('Đang tải nội dung...')}</Text>
      </View>
    );
  }
  if (!hasImages && !hasFiles && !hasLinks) return <Text style={styles.previewEmpty}>{t('Chưa có nội dung đã tải')}</Text>;

  const maxImages = (hasFiles || hasLinks) ? 2 : 4;
  const previewImages = images.slice(0, maxImages);
  const previewFile = files[0]?.file?.name;
  const previewLink = (!previewFile && hasLinks) ? (messageLinks(links[0] || ({} as ChatMessage))[0] || '') : '';

  return (
    <View style={styles.previewStrip}>
      {previewImages.map((message, index) => (
        <View key={`image-${message.id || index}`} style={styles.previewThumb}>
          <CachedMessageImage source={message.image || message.file?.url || ''} palette={palette} style={styles.previewImage} />
          <ImageIcon color={palette.muted} size={18} />
        </View>
      ))}
      {previewFile ? (
        <View style={styles.previewChip}>
          <FileText color={palette.accent} size={15} />
          <Text numberOfLines={1} ellipsizeMode="middle" style={styles.previewChipText}>{previewFile}</Text>
        </View>
      ) : null}
      {previewLink ? (
        <View style={styles.previewChip}>
          <Link2 color={palette.accent} size={15} />
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.previewChipText}>{previewLink}</Text>
        </View>
      ) : null}
    </View>
  );
}

function CachedMessageImage({ source, palette, style }: { source: string; palette: ThemeColors; style?: any }) {
  const styles = createStyles(palette);
  const [uri, setUri] = useState(() => {
    if (!source) return '';
    const mem = tinodeClient.getCachedImageUri(source);
    if (mem) return mem;
    return resolvedImageUriCache.get(source) || '';
  });
  useEffect(() => {
    let active = true;
    if (!source) {
      setUri('');
      return () => { active = false; };
    }
    const mem = tinodeClient.getCachedImageUri(source);
    if (mem) {
      setUri(mem);
      return () => { active = false; };
    }
    const cached = resolvedImageUriCache.get(source);
    if (cached) {
      setUri(cached);
      return () => { active = false; };
    }
    void tinodeClient.cacheImage(source).then(value => {
      if (value) resolvedImageUriCache.set(source, value);
      if (active) setUri(value);
    }).catch(() => {});
    return () => { active = false; };
  }, [source]);
  return uri ? <Image source={{ uri }} style={style} resizeMode="cover" /> : <View style={[styles.imagePlaceholder, style]}><ImageIcon color={palette.muted} size={18} /></View>;
}

function SharedContentItem({
  message,
  kind,
  palette,
  onOpenLink,
  onShareLink,
  onDownloadFile,
}: {
  message: ChatMessage;
  kind: ContentItemKind;
  palette: ThemeColors;
  onOpenLink: (url: string) => void;
  onShareLink: (url: string) => void;
  onDownloadFile: (file: NonNullable<ChatMessage['file']>) => void;
}) {
  const styles = createStyles(palette);
  const { t, locale } = useI18n();
  const file = messageFile(message);
  const links = messageLinks(message);
  const imageSource = isImageMessage(message) ? message.image || file?.url || '' : '';
  const title = message.poll?.question || message.text || file?.name || (imageSource ? t('Hình ảnh') : t('Nội dung đính kèm'));
  return <View style={styles.contentItem}>
    {imageSource ? <CachedMessageImage source={imageSource} palette={palette} style={styles.contentImage} /> : null}
    {!imageSource && file && kind !== 'polls' ? <View style={styles.attachmentIcon}><FileText color={palette.accent} size={22} /></View> : null}
    <Text numberOfLines={4} style={styles.contentItemText}>{title}</Text>
    <Text style={styles.contentItemMeta}>{message.senderName || t('Thành viên')}{message.createdAt ? ` · ${new Date(message.createdAt).toLocaleDateString(locale)}` : ''}</Text>
    {file && !imageSource ? <Pressable onPress={() => onDownloadFile(file)} style={styles.contentAction}><Text style={styles.contentActionText}>{t('Tải tệp')}</Text></Pressable> : null}
    {links.map(url => <View key={url} style={styles.linkActions}><Pressable onPress={() => onOpenLink(url)} style={styles.linkTextButton}><Link2 color={palette.accent} size={15} /><Text numberOfLines={2} style={styles.linkText}>{url}</Text></Pressable><Pressable onPress={() => onShareLink(url)} style={styles.contentAction}><Text style={styles.contentActionText}>{t('Chia sẻ')}</Text></Pressable></View>)}
  </View>;
}

function GroupEventSummaryCard({ event, message, palette }: { event: GroupEvent; message: ChatMessage; palette: ThemeColors }) {
  const styles = createStyles(palette);
  const { t } = useI18n();
  const dateText = formatGroupEventDate(event.startsAt);
  const creator = event.creatorName || message.senderName || t('Thành viên');
  const reminder = event.reminderMinutes > 0
    ? `${t('Nhắc trước')} ${event.reminderMinutes >= 1440 ? `${Math.round(event.reminderMinutes / 1440)} ${t('ngày')}` : event.reminderMinutes >= 60 ? `${Math.round(event.reminderMinutes / 60)} ${t('giờ')}` : `${event.reminderMinutes} ${t('phút')}`}`
    : t('Không nhắc');
  return <View style={styles.eventCard}>
    <View style={styles.eventCardHeader}><View style={styles.eventIcon}><CalendarDays color={palette.accent} size={20} /></View><View style={styles.eventCardCopy}><Text style={styles.eventLabel}>{t('Lịch nhóm')}</Text><Text style={styles.eventTitle}>{event.title}</Text></View></View>
    <Text style={styles.eventDate}>{dateText}</Text>
    {event.note ? <Text style={styles.eventNote}>{event.note}</Text> : null}
    <View style={styles.eventMeta}><Text style={styles.eventMetaText}>{creator}</Text><Text style={styles.eventMetaText}>{reminder}</Text></View>
  </View>;
}

function MemberRow({ member, owner = false, admin = false, self = false, pending = false, canManage = false, onNickname, onRole, onRemove, onApprove, onReject, palette }: { member: ConversationMember; owner?: boolean; admin?: boolean; self?: boolean; pending?: boolean; canManage?: boolean; onNickname?: () => void; onRole?: () => void; onRemove?: () => void; onApprove?: () => void; onReject?: () => void; palette: ThemeColors }) {
  const styles = createStyles(palette);
  const { t } = useI18n();
  return <View style={styles.memberRow}><Avatar name={member.name} uri={member.avatar} size={43} /><View style={styles.memberCopy}><Text numberOfLines={1} style={styles.memberName}>{member.name}{self ? ` (${t('Bạn')})` : ''}</Text><Text style={styles.memberMeta}>{owner ? t('Trưởng nhóm') : admin ? t('Phó nhóm') : pending ? t('Đang chờ duyệt') : (member.department || member.title || t('Thành viên'))}</Text></View>{pending ? <><Pressable disabled={!onApprove} onPress={onApprove} style={styles.roundAction} accessibilityLabel={t('Duyệt thành viên')}><Check color={palette.online} size={17} /></Pressable><Pressable disabled={!onReject} onPress={onReject} style={styles.roundDanger} accessibilityLabel={t('Từ chối thành viên')}><X color={palette.danger} size={17} /></Pressable></> : <View style={styles.memberActions}>{onNickname ? <Pressable disabled={!onNickname} onPress={onNickname} style={styles.roundAction} accessibilityLabel={t('Đổi biệt danh')}><Pencil color={palette.accent} size={17} /></Pressable> : null}{canManage ? <><Pressable disabled={!onRole} onPress={onRole} style={styles.roundAction} accessibilityLabel={t('Đổi vai trò')}><Shield color={admin ? palette.warning : palette.accent} size={17} /></Pressable><Pressable disabled={!onRemove} onPress={onRemove} style={styles.roundDanger} accessibilityLabel={t('Xóa thành viên')}><UserMinus color={palette.danger} size={17} /></Pressable></> : null}</View>}</View>;
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.canvas },
    header: { minHeight: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: palette.line, backgroundColor: palette.canvas },
    headerTitle: { ...typography.title, color: palette.ink, flex: 1, textAlign: 'center' },
    headerSpacer: { width: 40 },
    iconButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 18, paddingBottom: 130, gap: 12 },
    identityBlock: { alignItems: 'center', paddingVertical: 8 },
    avatarWrap: { position: 'relative' },
    avatarEdit: { position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: 12, backgroundColor: palette.accent, borderWidth: 3, borderColor: palette.canvas, alignItems: 'center', justifyContent: 'center' },
    nameRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' },
    groupName: { ...typography.heading, color: palette.ink, textAlign: 'center', flexShrink: 1 },
    memberCount: { ...typography.caption, color: palette.inkSoft, marginTop: 4 },
    smallIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: palette.paper, alignItems: 'center', justifyContent: 'center' },
    quickRow: { flexDirection: 'row', gap: 8 },
    quickAction: { flex: 1, minHeight: 74, alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 17, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper },
    quickActive: { borderColor: palette.accent, backgroundColor: palette.accentWash },
    quickActionDisabled: { opacity: 0.45 },
    quickIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: palette.accentWash, alignItems: 'center', justifyContent: 'center' },
    quickText: { ...typography.caption, color: palette.ink, textAlign: 'center', fontSize: 10.5 },
    dangerText: { color: palette.danger },
    sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 13, marginBottom: 1 },
    sectionTitle: { ...typography.title, color: palette.ink },
    menu: { borderRadius: 19, paddingHorizontal: 15, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, ...shadow },
    detailRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: palette.line, paddingVertical: 8 },
    detailRowLast: { borderBottomWidth: 0 },
    detailRowDisabled: { opacity: 0.64 },
    rowPressed: { opacity: 0.65 },
    detailIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: palette.accentWash, alignItems: 'center', justifyContent: 'center' },
    detailIconDisabled: { backgroundColor: `${palette.muted}18` },
    detailCopy: { flex: 1, minWidth: 0, overflow: 'hidden' },
    detailLabel: { ...typography.bodyMedium, color: palette.ink },
    detailLabelDisabled: { color: palette.inkSoft },
    detailHint: { ...typography.caption, color: palette.inkSoft, marginTop: 2 },
    detailEnd: { minWidth: 25, alignItems: 'flex-end', justifyContent: 'center' },
    unavailable: { ...typography.caption, color: palette.muted, fontSize: 9.5 },
    previewStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, minHeight: 42, maxWidth: '100%', overflow: 'hidden' },
    previewEmpty: { ...typography.caption, color: palette.muted, marginTop: 7 },
    previewThumb: { width: 42, height: 42, borderRadius: 11, overflow: 'hidden', backgroundColor: palette.accentWash, alignItems: 'center', justifyContent: 'center' },
    previewImage: { position: 'absolute', width: '100%', height: '100%' },
    imagePlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentWash },
    previewChip: { flexShrink: 1, minWidth: 0, maxWidth: 110, height: 34, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 8, backgroundColor: palette.accentWash },
    previewChipText: { ...typography.caption, color: palette.inkSoft, flexShrink: 1, fontSize: 9.5 },
    membersPanel: { gap: 10 },
    primaryAction: { minHeight: 48, borderRadius: 15, backgroundColor: palette.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
    primarySmall: { minHeight: 43, borderRadius: 13, backgroundColor: palette.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 15 },
    primaryText: { ...typography.bodyMedium, color: '#fff' },
    pendingBox: { padding: 12, borderRadius: 17, backgroundColor: `${palette.warning}18`, borderWidth: 1, borderColor: `${palette.warning}55`, gap: 3 },
    sectionLabel: { ...typography.caption, color: palette.warning, fontFamily: 'BeVietnamPro_700Bold', marginBottom: 3 },
    memberList: { borderRadius: 17, paddingHorizontal: 12, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
    memberRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: palette.line },
    memberCopy: { flex: 1, minWidth: 0 },
    memberActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    memberName: { ...typography.bodyMedium, color: palette.ink },
    memberMeta: { ...typography.caption, color: palette.inkSoft, marginTop: 2 },
    roundAction: { width: 34, height: 34, borderRadius: 11, backgroundColor: palette.accentWash, alignItems: 'center', justifyContent: 'center' },
    roundDanger: { width: 34, height: 34, borderRadius: 11, backgroundColor: `${palette.danger}18`, alignItems: 'center', justifyContent: 'center' },
    settingsBox: { borderRadius: 17, padding: 13, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
    settingRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: palette.line },
    settingCopy: { flex: 1, minWidth: 0 },
    settingLabel: { ...typography.bodyMedium, color: palette.ink },
    settingHint: { ...typography.caption, color: palette.inkSoft, marginTop: 2 },
    settingsNotice: { ...typography.caption, color: palette.accent, marginBottom: 4 },
    settingsLockedNotice: { ...typography.caption, color: palette.warning, marginBottom: 4 },
    searchRow: { flexDirection: 'row', gap: 8 },
    historySearch: { flex: 1, height: 48, borderRadius: 15, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
    historyInput: { flex: 1, color: palette.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 13 },
    searchButton: { width: 48, height: 48, borderRadius: 15, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' },
    results: { borderRadius: 17, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 12 },
    resultRow: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: palette.line },
    resultText: { ...typography.body, color: palette.ink },
    resultMeta: { ...typography.caption, color: palette.muted, marginTop: 3 },
    dangerZone: { marginTop: 12, padding: 14, borderRadius: 17, borderWidth: 1, borderColor: `${palette.danger}55`, backgroundColor: `${palette.danger}12`, gap: 8 },
    dangerHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dangerTitle: { ...typography.bodyMedium, color: palette.warning },
    dangerButton: { minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: `${palette.danger}88`, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    dangerButtonText: { ...typography.bodyMedium, color: palette.danger },
    empty: { ...typography.body, color: palette.inkSoft, padding: 24 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,12,16,0.66)' },
    modalSheet: { maxHeight: '86%', borderTopLeftRadius: 27, borderTopRightRadius: 27, padding: 18, backgroundColor: palette.canvas, ...shadow },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    modalTitle: { ...typography.title, color: palette.ink },
    modalSearch: { height: 50, borderRadius: 17, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 9 },
    modalSearchInput: { flex: 1, color: palette.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 14, paddingVertical: 0 },
    candidateList: { paddingVertical: 9 },
    candidate: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: palette.line },
    candidateCopy: { flex: 1, minWidth: 0 },
    check: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper },
    checkActive: { backgroundColor: palette.accent, borderColor: palette.accent },
    emptyList: { ...typography.body, color: palette.inkSoft, textAlign: 'center', padding: 24 },
    renameCard: { margin: 20, padding: 18, borderRadius: 21, backgroundColor: palette.canvas, ...shadow },
    nameInput: { height: 50, marginTop: 14, borderRadius: 15, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, paddingHorizontal: 14, color: palette.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 14 },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
    secondaryButton: { minHeight: 43, borderRadius: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
    secondaryText: { ...typography.bodyMedium, color: palette.inkSoft },
    contentSheet: { maxHeight: '78%', borderTopLeftRadius: 27, borderTopRightRadius: 27, padding: 18, backgroundColor: palette.canvas, ...shadow },
    eventToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
    eventCard: { padding: 13, borderRadius: 16, borderWidth: 1, borderColor: `${palette.accent}45`, backgroundColor: palette.paper, gap: 8 },
    eventCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    eventIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentWash },
    eventCardCopy: { flex: 1, minWidth: 0 },
    eventLabel: { ...typography.caption, color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold' },
    eventTitle: { ...typography.bodyMedium, color: palette.ink, marginTop: 2 },
    eventDate: { ...typography.bodyMedium, color: palette.ink },
    eventNote: { ...typography.caption, color: palette.inkSoft, lineHeight: 18 },
    eventMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingTop: 5, borderTopWidth: 1, borderTopColor: palette.line },
    eventMetaText: { ...typography.caption, color: palette.muted, flexShrink: 1 },
    filterRow: { flexDirection: 'row', gap: 7, marginBottom: 12 },
    filterTab: { minWidth: 67, minHeight: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
    filterTabActive: { backgroundColor: palette.accentWash, borderColor: palette.accent },
    filterText: { ...typography.caption, color: palette.inkSoft, fontFamily: 'BeVietnamPro_700Bold' },
    filterTextActive: { color: palette.accentDeep },
    contentItems: { paddingBottom: 20, gap: 8 },
    contentItem: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper },
    contentImage: { width: '100%', height: 150, borderRadius: 12, marginBottom: 9, backgroundColor: palette.accentWash },
    attachmentIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentWash, marginBottom: 7 },
    contentItemText: { ...typography.body, color: palette.ink },
    contentItemMeta: { ...typography.caption, color: palette.muted, marginTop: 5 },
    contentAction: { alignSelf: 'flex-start', minHeight: 32, borderRadius: 10, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentWash, marginTop: 9 },
    contentActionText: { ...typography.caption, color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold' },
    linkActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    linkTextButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
    linkText: { ...typography.caption, color: palette.accentDeep, flex: 1 },
    loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 },
    historyError: { ...typography.caption, color: palette.warning, paddingBottom: 10 },
    loadMoreContainer: { paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
    loadMoreButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
    loadMoreInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    loadMoreText: { fontSize: 14, fontWeight: '600', color: palette.accent },
  });
}
