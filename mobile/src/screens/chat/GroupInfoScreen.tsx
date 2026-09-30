import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
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
  X,
} from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { getConversation, useAppStore } from '../../store/appStore';
import { Avatar } from '../../components/Avatar';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ChoiceDialog, ChoiceDialogOption } from '../../components/ChoiceDialog';
import { ConversationNicknameModal } from '../../components/ConversationNicknameModal';
import { beginTrustedExternalActivity } from '../../services/appLifecycleService';
import { colorsForTheme, shadow, ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { ChatMessage, ConversationMember, GroupSettings } from '../../types';
import { useThemeStore } from '../../store/themeStore';
import { DEFAULT_GROUP_SETTINGS, groupSettingEnabled, memberIsAdmin, memberIsOwner, normalizeGroupSettings } from '../../utils/groupSettings';
import { isConversationMuted } from '../../utils/conversationNotifications';
import { accountIdForMember, canonicalAccountIds, identitiesOverlap, identityValues } from '../../utils/identity';
import { conversationNicknameForMember } from '../../utils/conversationSync';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupInfo'>;
type ContentView = 'shared' | 'pinned' | 'polls';
type SharedFilter = 'media' | 'files' | 'links';
type ConfirmRequest = { title: string; message: string; confirmLabel: string; eyebrow?: string; tone?: 'default' | 'danger'; onConfirm: () => void };

const settingLabels: Array<{ key: keyof GroupSettings; label: string; hint: string }> = [
  { key: 'allowMembersEditInfo', label: 'Thành viên sửa thông tin', hint: 'Cho phép thành viên đổi tên và ảnh nhóm.' },
  { key: 'allowPinMessages', label: 'Ghim tin nhắn', hint: 'Cho phép ghim nội dung quan trọng.' },
  { key: 'allowMessages', label: 'Gửi tin nhắn', hint: 'Khóa hoặc mở quyền gửi tin trong nhóm.' },
  { key: 'allowPolls', label: 'Tạo bình chọn', hint: 'Cho phép thành viên tạo bình chọn.' },
  { key: 'approveMembers', label: 'Duyệt thành viên mới', hint: 'Thành viên mới cần được quản trị viên phê duyệt.' },
  { key: 'newMemberHistory', label: 'Cho xem lịch sử cũ', hint: 'Thành viên mới được xem tin nhắn trước đó.' },
];

export function GroupInfoScreen({ route, navigation }: Props) {
  const palette = colorsForTheme(useThemeStore(state => state.resolved));
  const styles = useMemo(() => createStyles(palette), [palette]);
  const conversation = useAppStore(state => getConversation(state.conversations, route.params.conversationId));
  const session = useAppStore(state => state.session);
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
  const [busy, setBusy] = useState('');
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
  const [sharedFilter, setSharedFilter] = useState<SharedFilter>('media');
  const [membersExpanded, setMembersExpanded] = useState(false);
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
    setSharedFilter('media');
    setMembersExpanded(false);
    setNicknameMember(null);
  }, [conversation?.id, conversation?.name]);

  const currentMember = conversation?.members?.find(member => identitiesOverlap(member, session?.user));
  const isOwner = Boolean(currentMember && memberIsOwner(currentMember))
    || identitiesOverlap({ id: conversation?.adminId, uid: conversation?.adminId }, session?.user);
  const isAdmin = isOwner || Boolean(currentMember && memberIsAdmin(currentMember));
  const canEditInfo = isAdmin || groupSettingEnabled(conversation?.groupSettings, 'allowMembersEditInfo');
  const members = conversation?.members || [];
  const pendingMembers = conversation?.pendingMembers || [];
  const messages = conversation?.messages || [];
  const sharedImages = messages.filter(message => Boolean(message.image));
  const sharedFiles = messages.filter(message => Boolean(message.file));
  const sharedLinks = messages.filter(message => /https?:\/\/\S+/i.test(message.text || ''));
  const pinnedMessages = messages.filter(message => message.pinned);
  const pollMessages = messages.filter(message => Boolean(message.poll));
  const contentItems = contentView === 'shared'
    ? sharedFilter === 'media' ? sharedImages : sharedFilter === 'files' ? sharedFiles : sharedLinks
    : contentView === 'pinned' ? pinnedMessages : pollMessages;
  const contentTitle = contentView === 'shared'
    ? 'Ảnh, file, link'
    : contentView === 'pinned'
      ? 'Tin nhắn đã ghim'
      : 'Bình chọn trong nhóm';
  const existingIds = useMemo(() => new Set([...members, ...pendingMembers].flatMap(member => identityValues(member))), [members, pendingMembers]);
  const candidates = useMemo(() => directory.filter(user => {
    const identityMatches = identityValues(user).some(identity => existingIds.has(identity));
    const currentUser = identitiesOverlap(user, session?.user);
    const query = addQuery.trim().toLowerCase();
    const searchable = [user.name, user.username, user.email, user.department, user.title].filter(Boolean).join(' ').toLowerCase();
    return !identityMatches && !currentUser && searchable.includes(query);
  }), [addQuery, directory, existingIds, session?.user.id]);

  const run = async (key: string, action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    try {
      await action();
    } catch (value) {
      Alert.alert('Không thể thực hiện', value instanceof Error ? value.message : 'Vui lòng thử lại sau.');
    } finally {
      setBusy('');
    }
  };

  const chooseAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Cần cấp quyền', 'ViChat cần quyền truy cập ảnh để đổi avatar nhóm.');
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
      Alert.alert('Không thể lưu cài đặt', error instanceof Error ? error.message : 'Vui lòng thử lại sau.');
    } finally {
      if (settingsRequestRef.current === requestId) setSettingsBusy(false);
    }
  };

  const addMembers = async () => {
    if (!conversation || selectedIds.length === 0) return;
    const accountIds = canonicalAccountIds(selectedIds, directory);
    if (accountIds.length !== selectedIds.length) {
      Alert.alert('Không xác định được thành viên', 'Chỉ có thể thêm thành viên bằng Account ID của nhân viên cùng công ty.');
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
        Alert.alert('Chưa đồng bộ thành viên', 'Không xác định được Account ID của thành viên thay thế. Hãy tải lại nhóm rồi thử lại.');
        return;
      }
      setLeaveCandidates(replacementOptions.slice(0, 8));
      return;
    }
    setConfirmRequest({
      title: 'Rời nhóm?',
      message: 'Bạn sẽ không còn thấy nhóm này trong danh sách.',
      confirmLabel: 'Rời nhóm',
      eyebrow: 'THÀNH VIÊN NHÓM',
      tone: 'danger',
      onConfirm: () => void run('leave', async () => { await deleteConversation(conversation.id); navigation.popToTop(); }).finally(() => setConfirmRequest(null)),
    });
  };

  const handleDissolve = () => {
    if (!conversation) return;
    setConfirmRequest({
      title: 'Giải tán nhóm?',
      message: 'Tất cả thành viên sẽ bị đưa ra khỏi nhóm và lịch sử nhóm sẽ không còn mở được.',
      confirmLabel: 'Giải tán',
      eyebrow: 'QUYỀN TRƯỞNG NHÓM',
      tone: 'danger',
      onConfirm: () => void run('dissolve', async () => { await dissolveGroup(conversation.id); navigation.popToTop(); }).finally(() => setConfirmRequest(null)),
    });
  };

  const handleRemoveMember = (member: ConversationMember, accountId: string) => {
    if (!conversation) return;
    setConfirmRequest({
      title: 'Xóa thành viên?',
      message: `Xóa ${member.name} khỏi nhóm? Người này sẽ không còn gửi và xem tin nhắn nhóm.`,
      confirmLabel: 'Xóa thành viên',
      eyebrow: 'QUẢN TRỊ NHÓM',
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
      Alert.alert('Tìm kiếm thất bại', value instanceof Error ? value.message : 'Vui lòng thử lại sau.');
    } finally {
      setSearching(false);
    }
  };

  if (!conversation?.isGroup) return <View style={styles.screen}><Text style={styles.empty}>Nhóm không còn khả dụng.</Text></View>;

  const sharedSummary = `${sharedImages.length} ảnh · ${sharedFiles.length} file · ${sharedLinks.length} link`;
  const membersSummary = `${members.length} thành viên${pendingMembers.length ? ` · ${pendingMembers.length} chờ duyệt` : ''}`;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconButton} accessibilityLabel="Quay lại"><ChevronLeft color={palette.ink} size={25} /></Pressable>
        <Text style={styles.headerTitle}>Thông tin nhóm</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identityBlock}>
          <View style={styles.avatarWrap}>
            <Avatar name={conversation.name} uri={conversation.avatarUrl} size={92} rounded={false} />
            {canEditInfo ? <Pressable onPress={() => void chooseAvatar()} style={styles.avatarEdit} disabled={Boolean(busy)} accessibilityLabel="Đổi ảnh nhóm"><Camera color="#fff" size={17} /></Pressable> : null}
          </View>
          <View style={styles.nameRow}><Text numberOfLines={2} style={styles.groupName}>{conversation.name}</Text>{canEditInfo ? <Pressable onPress={() => { setNameDraft(conversation.name); setRenameOpen(true); }} style={styles.smallIcon} accessibilityLabel="Đổi tên nhóm"><Settings2 color={palette.accent} size={17} /></Pressable> : null}</View>
          <Text style={styles.memberCount}>{members.length} thành viên</Text>
        </View>

        <View style={styles.quickRow}>
          <Pressable onPress={() => void run('mute', () => muteConversation(conversation.id, isConversationMuted(conversation.notificationMutedUntil) ? null : 0))} style={[styles.quickAction, isConversationMuted(conversation.notificationMutedUntil) && styles.quickActive]} disabled={Boolean(busy)}>
            <View style={styles.quickIcon}>{isConversationMuted(conversation.notificationMutedUntil) ? <BellOff color={palette.accent} size={18} /> : <Bell color={palette.accent} size={18} />}</View>
            <Text style={styles.quickText}>{isConversationMuted(conversation.notificationMutedUntil) ? 'Bật thông báo' : 'Tắt thông báo'}</Text>
          </Pressable>
          <Pressable onPress={handleLeave} style={styles.quickAction} disabled={Boolean(busy)}>
            <View style={[styles.quickIcon, { backgroundColor: `${palette.danger}18` }]}><LogOut color={palette.danger} size={18} /></View>
            <Text style={[styles.quickText, styles.dangerText]}>Rời nhóm</Text>
          </Pressable>
        </View>

        <SectionHeading title="Nội dung" icon={BarChart3} palette={palette} />
        <View style={styles.menu}>
          <DetailRow
            testID="group-shared-content-row"
            icon={ImageIcon}
            label="Ảnh, file, link"
            detail={sharedSummary}
            preview={<SharedPreview images={sharedImages} files={sharedFiles} links={sharedLinks} palette={palette} />}
            onPress={() => setContentView('shared')}
            palette={palette}
          />
          <DetailRow icon={CalendarDays} label="Lịch nhóm" detail="Chưa khả dụng trên mobile" disabled palette={palette} />
          <DetailRow icon={Pin} label="Tin nhắn đã ghim" detail={pinnedMessages.length ? `${pinnedMessages.length} tin nhắn` : 'Chưa có tin nhắn đã ghim'} onPress={pinnedMessages.length ? () => setContentView('pinned') : undefined} disabled={!pinnedMessages.length} palette={palette} />
          <DetailRow icon={BarChart3} label="Bình chọn" detail={pollMessages.length ? `${pollMessages.length} bình chọn` : 'Chưa có bình chọn'} onPress={pollMessages.length ? () => setContentView('polls') : undefined} disabled={!pollMessages.length} last palette={palette} />
        </View>

        <SectionHeading title="Thành viên & nhóm" icon={Users} palette={palette} />
        <View style={styles.menu}>
          <DetailRow
            testID="group-members-row"
            icon={Users}
            label="Xem thành viên"
            detail={membersSummary}
            onPress={() => setMembersExpanded(value => !value)}
            trailing={membersExpanded ? <ChevronUp color={palette.muted} size={19} /> : <ChevronDown color={palette.muted} size={19} />}
            palette={palette}
          />
          <DetailRow icon={Link2} label="Link nhóm" detail="Chưa khả dụng trên mobile" disabled last palette={palette} />
        </View>

        {membersExpanded ? (
          <View style={styles.membersPanel}>
            <Pressable onPress={() => setAddOpen(true)} style={styles.primaryAction} disabled={Boolean(busy)}><UserPlus color="#fff" size={18} /><Text style={styles.primaryText}>Thêm thành viên</Text></Pressable>
            {pendingMembers.length > 0 && isAdmin ? <View style={styles.pendingBox}><Text style={styles.sectionLabel}>Chờ duyệt ({pendingMembers.length})</Text>{pendingMembers.map(member => { const accountId = accountIdForMember(member, directory); return <MemberRow key={`pending-${accountId || identityValues(member).join('-')}`} member={member} pending palette={palette} onApprove={accountId ? () => void run(`approve-${accountId}`, () => approveGroupMember(conversation.id, accountId, true)) : undefined} onReject={accountId ? () => void run(`reject-${accountId}`, () => approveGroupMember(conversation.id, accountId, false)) : undefined} />; })}</View> : null}
            <View style={styles.memberList}>{members.map(member => {
              const owner = memberIsOwner(member);
              const admin = memberIsAdmin(member);
              const self = identitiesOverlap(member, session?.user);
              const accountId = accountIdForMember(member, directory);
              const canEditNickname = Boolean(accountId) && member.type !== 'bot' && !member.isChatbot;
              return <MemberRow key={accountId || identityValues(member).join('-')} member={member} owner={owner} admin={admin} self={self} canManage={isAdmin && !self && !owner && Boolean(accountId)} palette={palette} onNickname={canEditNickname ? () => setNicknameMember(member) : undefined} onRole={accountId ? () => void run(`role-${accountId}`, () => setGroupMemberRole(conversation.id, accountId, admin ? 'MEMBER' : 'ADMIN')) : undefined} onRemove={accountId ? () => handleRemoveMember(member, accountId) : undefined} />;
            })}</View>
          </View>
        ) : null}

        <SectionHeading title="Cuộc trò chuyện" icon={Settings2} palette={palette} />
        <View style={styles.menu}>
          <DetailRow icon={Languages} label="Dịch trò chuyện" detail="Chưa khả dụng trên mobile" disabled palette={palette} />
          <DetailRow
            testID="conversation-pin-row"
            icon={Pin}
            label="Ghim trò chuyện"
            detail={conversation.pinned ? 'Đang ghim trong danh sách' : 'Đưa lên đầu danh sách trò chuyện'}
            control={<Switch testID="conversation-pin-switch" accessibilityLabel="Ghim trò chuyện" value={Boolean(conversation.pinned)} onValueChange={value => void run('pin', () => updateConversationPin(conversation.id, value))} disabled={Boolean(busy)} trackColor={{ false: palette.line, true: `${palette.accent}88` }} thumbColor={conversation.pinned ? palette.accent : palette.paper} />}
            palette={palette}
          />
          <DetailRow icon={Settings2} label="Mục hiển thị" detail="Chưa khả dụng trên mobile" disabled palette={palette} />
          <DetailRow icon={Tags} label="Thẻ phân loại" detail="Chưa khả dụng trên mobile" disabled palette={palette} />
          <DetailRow icon={EyeOff} label="Ẩn trò chuyện" detail="Chưa khả dụng trên mobile" disabled last palette={palette} />
        </View>

        <SectionHeading title="Cài đặt nhóm" icon={Settings2} palette={palette} />
        <View style={styles.settingsBox}>
          <Text style={isAdmin ? styles.settingsNotice : styles.settingsLockedNotice}>{isAdmin ? (settingsBusy ? 'Đang lưu thay đổi...' : 'Bật hoặc tắt để lưu ngay.') : 'Chỉ trưởng nhóm hoặc phó nhóm mới có thể thay đổi cài đặt.'}</Text>
          {settingLabels.map(item => <View key={item.key} style={styles.settingRow}><View style={styles.settingCopy}><Text style={styles.settingLabel}>{item.label}</Text><Text style={styles.settingHint}>{item.hint}</Text></View><Switch testID={`group-setting-${item.key}`} accessibilityLabel={item.label} value={settingsDraft[item.key]} onValueChange={value => void changeSetting(item.key, value)} disabled={!isAdmin || settingsBusy || Boolean(busy)} trackColor={{ false: palette.line, true: `${palette.accent}88` }} thumbColor={settingsDraft[item.key] ? palette.accent : palette.paper} /></View>)}
        </View>

        <SectionHeading title="Tìm trong lịch sử" icon={Search} palette={palette} />
        <View style={styles.searchRow}><View style={styles.historySearch}><Search color={palette.muted} size={17} /><TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Tìm tin nhắn..." placeholderTextColor={palette.muted} style={styles.historyInput} onSubmitEditing={() => void runSearch()} /></View><Pressable onPress={() => void runSearch()} style={styles.searchButton} disabled={searching}><Search color="#fff" size={18} /></Pressable></View>
        {searchResults.length > 0 ? <View style={styles.results}>{searchResults.map((item, index) => <View style={styles.resultRow} key={`${item.id || item.seq || index}`}><Text style={styles.resultText}>{String(item.text || item.content || item.message || 'Tin nhắn')}</Text><Text style={styles.resultMeta}>{String(item.senderName || item.sender_name || '')}</Text></View>)}</View> : null}

        {isOwner ? <View style={styles.dangerZone}><View style={styles.dangerHeading}><Crown color={palette.warning} size={18} /><Text style={styles.dangerTitle}>Quyền trưởng nhóm</Text></View><Text style={styles.settingHint}>Giải tán nhóm sẽ đóng hội thoại với tất cả thành viên.</Text><Pressable onPress={handleDissolve} style={styles.dangerButton} disabled={Boolean(busy)}><Trash2 color={palette.danger} size={18} /><Text style={styles.dangerButtonText}>{busy === 'dissolve' ? 'Đang giải tán...' : 'Giải tán nhóm'}</Text></Pressable></View> : null}
      </ScrollView>

      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.modalOverlay}><Pressable style={styles.modalBackdrop} onPress={() => setAddOpen(false)} /><View style={styles.modalSheet}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Thêm thành viên</Text><Pressable onPress={() => setAddOpen(false)} style={styles.smallIcon}><X color={palette.inkSoft} size={19} /></Pressable></View><View style={styles.modalSearch}><Search color={palette.muted} size={18} /><TextInput value={addQuery} onChangeText={setAddQuery} placeholder="Tìm nhân viên" placeholderTextColor={palette.muted} style={styles.modalSearchInput} autoCorrect={false} /><Pressable onPress={() => setAddQuery('')} disabled={!addQuery} hitSlop={10}><X color={palette.muted} size={17} /></Pressable></View><FlatList data={candidates} keyExtractor={item => item.id} contentContainerStyle={styles.candidateList} renderItem={({ item }) => { const selected = selectedIds.includes(item.id); return <Pressable onPress={() => setSelectedIds(current => selected ? current.filter(id => id !== item.id) : [...current, item.id])} style={styles.candidate}><Avatar name={item.name} uri={item.avatar} size={42} /><View style={styles.candidateCopy}><Text style={styles.memberName}>{item.name}</Text><Text style={styles.memberMeta}>{item.department || item.title || item.username}</Text></View><View style={[styles.check, selected && styles.checkActive]}>{selected ? <Check color="#fff" size={15} /> : <Plus color={palette.accent} size={17} />}</View></Pressable>; }} ListEmptyComponent={<Text style={styles.emptyList}>Không còn nhân viên phù hợp.</Text>} /><Pressable onPress={() => void addMembers()} style={styles.primaryAction} disabled={selectedIds.length === 0 || Boolean(busy)}><UserPlus color="#fff" size={18} /><Text style={styles.primaryText}>{busy === 'add' ? 'Đang thêm...' : `Thêm ${selectedIds.length || ''} thành viên`}</Text></Pressable></View></View>
      </Modal>

      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}><View style={styles.modalOverlay}><Pressable style={styles.modalBackdrop} onPress={() => setRenameOpen(false)} /><View style={styles.renameCard}><Text style={styles.modalTitle}>Đổi tên nhóm</Text><TextInput value={nameDraft} onChangeText={setNameDraft} autoFocus maxLength={120} placeholder="Tên nhóm" placeholderTextColor={palette.muted} style={styles.nameInput} /><View style={styles.modalActions}><Pressable onPress={() => setRenameOpen(false)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Hủy</Text></Pressable><Pressable onPress={() => void submitRename()} style={styles.primarySmall} disabled={!nameDraft.trim() || Boolean(busy)}><Check color="#fff" size={17} /><Text style={styles.primaryText}>{busy === 'rename' ? 'Đang lưu...' : 'Lưu'}</Text></Pressable></View></View></View></Modal>

      <Modal visible={Boolean(contentView)} transparent animationType="slide" onRequestClose={() => setContentView(null)} statusBarTranslucent>
        <View style={styles.modalOverlay}><Pressable style={styles.modalBackdrop} onPress={() => setContentView(null)} /><View style={styles.contentSheet}><View style={styles.modalHeader}><View><Text style={styles.sectionLabel}>NỘI DUNG NHÓM</Text><Text style={styles.modalTitle}>{contentTitle}</Text></View><Pressable onPress={() => setContentView(null)} style={styles.smallIcon}><X color={palette.inkSoft} size={19} /></Pressable></View>{contentView === 'shared' ? <View style={styles.filterRow}>{([['media', 'Ảnh'], ['files', 'File'], ['links', 'Link']] as Array<[SharedFilter, string]>).map(([id, label]) => <Pressable key={id} onPress={() => setSharedFilter(id)} style={[styles.filterTab, sharedFilter === id && styles.filterTabActive]}><Text style={[styles.filterText, sharedFilter === id && styles.filterTextActive]}>{label}</Text></Pressable>)}</View> : null}<ScrollView contentContainerStyle={styles.contentItems}>{contentItems.length ? contentItems.map((message, index) => <View key={`${message.id || message.seq || index}`} style={styles.contentItem}><Text numberOfLines={3} style={styles.contentItemText}>{message.poll?.question || message.text || message.file?.name || (message.image ? 'Hình ảnh' : 'Nội dung đính kèm')}</Text><Text style={styles.contentItemMeta}>{message.senderName || 'Thành viên'}{message.createdAt ? ` · ${new Date(message.createdAt).toLocaleDateString('vi-VN')}` : ''}</Text></View>) : <Text style={styles.emptyList}>Chưa có nội dung trong phạm vi đã tải.</Text>}</ScrollView></View></View>
      </Modal>

      <ConversationNicknameModal
        visible={Boolean(nicknameMember)}
        member={nicknameMember}
        initialNickname={nicknameMember ? conversationNicknameForMember(nicknameMember, conversation.conversationNicknames) : ''}
        onCancel={() => setNicknameMember(null)}
        onSave={async nickname => {
          if (!nicknameMember) return;
          const accountId = accountIdForMember(nicknameMember, directory);
          if (!accountId) throw new Error('KhÃ´ng xÃ¡c Ä‘á»‹nh Ä‘Æ°á»£c Account ID cá»§a thÃ nh viÃªn.');
          await updateConversationNickname(conversation.id, accountId, nickname);
        }}
      />

      <ChoiceDialog
        visible={leaveCandidates.length > 0}
        title="Chọn trưởng nhóm mới"
        message="Bạn phải chuyển quyền cho một thành viên trước khi rời nhóm."
        options={leaveCandidates.map(({ member, accountId }): ChoiceDialogOption => ({ id: accountId, label: member.name || member.username || accountId, detail: member.department || member.title || 'Thành viên trong nhóm' }))}
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
        confirmLabel={confirmRequest?.confirmLabel || 'Xác nhận'}
        tone={confirmRequest?.tone}
        onCancel={() => setConfirmRequest(null)}
        onConfirm={() => confirmRequest?.onConfirm()}
        busy={Boolean(busy)}
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
  const canPress = Boolean(onPress) && !disabled;
  return <Pressable testID={testID} disabled={!canPress && !control} onPress={onPress} style={({ pressed }) => [styles.detailRow, last && styles.detailRowLast, disabled && styles.detailRowDisabled, pressed && styles.rowPressed]}><View style={[styles.detailIcon, disabled && styles.detailIconDisabled]}><Icon color={disabled ? palette.muted : palette.accent} size={19} /></View><View style={styles.detailCopy}><Text style={[styles.detailLabel, disabled && styles.detailLabelDisabled]}>{label}</Text><Text style={styles.detailHint}>{detail}</Text>{preview}</View><View style={styles.detailEnd}>{control || trailing || (canPress ? <ChevronRight color={palette.muted} size={19} /> : disabled ? <Text style={styles.unavailable}>Chưa có</Text> : null)}</View></Pressable>;
}

function SharedPreview({ images, files, links, palette }: { images: ChatMessage[]; files: ChatMessage[]; links: ChatMessage[]; palette: ThemeColors }) {
  const styles = createStyles(palette);
  const previewImages = images.slice(0, 3);
  const previewFile = files[0]?.file?.name;
  const previewLink = firstUrl(links[0]?.text || '');
  if (!previewImages.length && !previewFile && !previewLink) return <Text style={styles.previewEmpty}>Chưa có nội dung đã tải</Text>;
  return <View style={styles.previewStrip}>{previewImages.map((message, index) => <View key={`image-${message.id || index}`} style={styles.previewThumb}><ImageIcon color={palette.muted} size={18} /><Image source={{ uri: message.image }} style={styles.previewImage} resizeMode="cover" /></View>)}{previewFile ? <View style={styles.previewChip}><FileText color={palette.accent} size={16} /><Text numberOfLines={1} style={styles.previewChipText}>{previewFile}</Text></View> : null}{previewLink ? <View style={styles.previewChip}><Link2 color={palette.accent} size={16} /><Text numberOfLines={1} style={styles.previewChipText}>{previewLink}</Text></View> : null}</View>;
}

function MemberRow({ member, owner = false, admin = false, self = false, pending = false, canManage = false, onNickname, onRole, onRemove, onApprove, onReject, palette }: { member: ConversationMember; owner?: boolean; admin?: boolean; self?: boolean; pending?: boolean; canManage?: boolean; onNickname?: () => void; onRole?: () => void; onRemove?: () => void; onApprove?: () => void; onReject?: () => void; palette: ThemeColors }) {
  const styles = createStyles(palette);
  return <View style={styles.memberRow}><Avatar name={member.name} uri={member.avatar} size={43} /><View style={styles.memberCopy}><Text numberOfLines={1} style={styles.memberName}>{member.name}{self ? ' (Bạn)' : ''}</Text><Text style={styles.memberMeta}>{owner ? 'Trưởng nhóm' : admin ? 'Phó nhóm' : pending ? 'Đang chờ duyệt' : (member.department || member.title || 'Thành viên')}</Text></View>{pending ? <><Pressable disabled={!onApprove} onPress={onApprove} style={styles.roundAction} accessibilityLabel="Duyệt thành viên"><Check color={palette.online} size={17} /></Pressable><Pressable disabled={!onReject} onPress={onReject} style={styles.roundDanger} accessibilityLabel="Từ chối thành viên"><X color={palette.danger} size={17} /></Pressable></> : <View style={styles.memberActions}>{onNickname ? <Pressable disabled={!onNickname} onPress={onNickname} style={styles.roundAction} accessibilityLabel="Đổi biệt danh"><Pencil color={palette.accent} size={17} /></Pressable> : null}{canManage ? <><Pressable disabled={!onRole} onPress={onRole} style={styles.roundAction} accessibilityLabel="Đổi vai trò"><Shield color={admin ? palette.warning : palette.accent} size={17} /></Pressable><Pressable disabled={!onRemove} onPress={onRemove} style={styles.roundDanger} accessibilityLabel="Xóa thành viên"><UserMinus color={palette.danger} size={17} /></Pressable></> : null}</View>}</View>;
}

function firstUrl(value: string) {
  return String(value || '').match(/https?:\/\/\S+/i)?.[0] || '';
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
    detailCopy: { flex: 1, minWidth: 0 },
    detailLabel: { ...typography.bodyMedium, color: palette.ink },
    detailLabelDisabled: { color: palette.inkSoft },
    detailHint: { ...typography.caption, color: palette.inkSoft, marginTop: 2 },
    detailEnd: { minWidth: 25, alignItems: 'flex-end', justifyContent: 'center' },
    unavailable: { ...typography.caption, color: palette.muted, fontSize: 9.5 },
    previewStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, minHeight: 42 },
    previewEmpty: { ...typography.caption, color: palette.muted, marginTop: 7 },
    previewThumb: { width: 42, height: 42, borderRadius: 11, overflow: 'hidden', backgroundColor: palette.accentWash, alignItems: 'center', justifyContent: 'center' },
    previewImage: { position: 'absolute', width: '100%', height: '100%' },
    previewChip: { maxWidth: 132, height: 34, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 8, backgroundColor: palette.accentWash },
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
    filterRow: { flexDirection: 'row', gap: 7, marginBottom: 12 },
    filterTab: { minWidth: 67, minHeight: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
    filterTabActive: { backgroundColor: palette.accentWash, borderColor: palette.accent },
    filterText: { ...typography.caption, color: palette.inkSoft, fontFamily: 'BeVietnamPro_700Bold' },
    filterTextActive: { color: palette.accentDeep },
    contentItems: { paddingBottom: 20, gap: 8 },
    contentItem: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper },
    contentItemText: { ...typography.body, color: palette.ink },
    contentItemMeta: { ...typography.caption, color: palette.muted, marginTop: 5 },
  });
}
