import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Bell, BellOff, Camera, Check, ChevronLeft, Crown, LogOut, Pin, Plus, Search, Settings2, Shield, Trash2, UserMinus, UserPlus, X } from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore, getConversation } from '../../store/appStore';
import { Avatar } from '../../components/Avatar';
import { SearchField } from '../../components/SearchField';
import { beginTrustedExternalActivity } from '../../services/appLifecycleService';
import { colors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { ConversationMember, GroupSettings, User } from '../../types';
import { DEFAULT_GROUP_SETTINGS, groupSettingEnabled, memberIsAdmin, memberIsOwner, normalizeGroupSettings } from '../../utils/groupSettings';
import { isConversationMuted } from '../../utils/conversationNotifications';
import { accountIdForMember, canonicalAccountIds, identitiesOverlap, identityValues } from '../../utils/identity';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupInfo'>;

const settingLabels: Array<{ key: keyof GroupSettings; label: string; hint: string }> = [
  { key: 'allowMembersEditInfo', label: 'Thành viên sửa thông tin', hint: 'Cho phép thành viên đổi tên và ảnh nhóm.' },
  { key: 'allowPinMessages', label: 'Ghim tin nhắn', hint: 'Cho phép ghim nội dung quan trọng.' },
  { key: 'allowMessages', label: 'Gửi tin nhắn', hint: 'Khóa/mở quyền gửi tin trong nhóm.' },
  { key: 'allowPolls', label: 'Tạo bình chọn', hint: 'Cho phép thành viên tạo bình chọn.' },
  { key: 'approveMembers', label: 'Duyệt thành viên mới', hint: 'Thành viên mới cần được quản trị viên phê duyệt.' },
  { key: 'newMemberHistory', label: 'Cho xem lịch sử cũ', hint: 'Thành viên mới được xem tin nhắn trước đó.' },
];

export function GroupInfoScreen({ route, navigation }: Props) {
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
  const settingsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsBeforeSave = useRef<GroupSettings | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    if (conversation?.groupSettings) setSettingsDraft(normalizeGroupSettings(conversation.groupSettings));
    setNameDraft(conversation?.name || '');
  }, [conversation?.groupSettings, conversation?.name]);

  const currentMember = conversation?.members?.find(member => identitiesOverlap(member, session?.user));
  const isOwner = Boolean(currentMember && memberIsOwner(currentMember))
    || identitiesOverlap({ id: conversation?.adminId, uid: conversation?.adminId }, session?.user);
  const isAdmin = isOwner || Boolean(currentMember && memberIsAdmin(currentMember));
  const canEditInfo = isAdmin || groupSettingEnabled(conversation?.groupSettings, 'allowMembersEditInfo');
  const members = conversation?.members || [];
  const pendingMembers = conversation?.pendingMembers || [];
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
    try { await action(); } catch (value) { Alert.alert('Không thể thực hiện', value instanceof Error ? value.message : 'Thử lại sau.'); } finally { setBusy(''); }
  };

  const chooseAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Cần cấp quyền', 'ViChat cần quyền truy cập ảnh để đổi avatar nhóm.'); return; }
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

  const submitSettings = useCallback(async () => {
    if (!conversation || settingsBusy) return;
    // Debounce: clear any pending save timer.
    if (settingsSaveTimer.current) {
      clearTimeout(settingsSaveTimer.current);
      settingsSaveTimer.current = null;
    }
    // Save current settings for rollback on failure.
    settingsBeforeSave.current = conversation.groupSettings
      ? normalizeGroupSettings(conversation.groupSettings)
      : { ...DEFAULT_GROUP_SETTINGS };
    setSettingsBusy(true);
    try {
      await updateGroupSettings(conversation.id, settingsDraft);
    } catch (value) {
      // Rollback to the settings before the failed save.
      if (settingsBeforeSave.current) {
        setSettingsDraft(settingsBeforeSave.current);
      }
      Alert.alert('Không thể lưu cài đặt', value instanceof Error ? value.message : 'Hãy thử lại sau.');
    } finally {
      settingsBeforeSave.current = null;
      setSettingsBusy(false);
    }
  }, [conversation, settingsDraft, settingsBusy, updateGroupSettings]);

  const addMembers = async () => {
    if (!conversation || selectedIds.length === 0) return;
    const accountIds = canonicalAccountIds(selectedIds, directory);
    if (accountIds.length !== selectedIds.length) {
      Alert.alert('Khong xac dinh duoc thanh vien', 'Chi co the them thanh vien bang Account ID cua nhan vien cung cong ty.');
      return;
    }
    await run('add', async () => {
      await addGroupMembers(conversation.id, accountIds);
      setSelectedIds([]);
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
      Alert.alert('Rời nhóm', 'Chọn người sẽ nhận quyền trưởng nhóm.', [
        { text: 'Hủy', style: 'cancel' },
        ...replacementOptions.slice(0, 8).map(({ member, accountId }) => ({
          text: member.name,
          onPress: () => void run('leave', async () => {
            await deleteConversation(conversation.id, accountId);
            navigation.popToTop();
          }),
        })),
      ]);
      return;
    }
    Alert.alert('Rời nhóm?', 'Bạn sẽ không còn thấy nhóm này trong danh sách.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Rời nhóm', style: 'destructive', onPress: () => void run('leave', async () => { await deleteConversation(conversation.id); navigation.popToTop(); }) },
    ]);
  };

  const handleDissolve = () => {
    if (!conversation) return;
    Alert.alert('Giải tán nhóm?', 'Tất cả thành viên sẽ bị đưa ra khỏi nhóm.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Giải tán', style: 'destructive', onPress: () => void run('dissolve', async () => { await dissolveGroup(conversation.id); navigation.popToTop(); }) },
    ]);
  };

  const runSearch = async () => {
    if (!conversation || !searchQuery.trim()) return;
    setSearching(true);
    try { setSearchResults(await searchConversationHistory(conversation.id, searchQuery)); } catch (value) { Alert.alert('Tìm kiếm thất bại', value instanceof Error ? value.message : 'Thử lại sau.'); } finally { setSearching(false); }
  };

  if (!conversation?.isGroup) return <View style={styles.screen}><Text style={styles.empty}>Nhóm không còn khả dụng.</Text></View>;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}><ChevronLeft color={colors.ink} size={25} /></Pressable>
        <Text style={styles.headerTitle}>Thông tin nhóm</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identityBlock}>
          <View style={styles.avatarWrap}>
            <Avatar name={conversation.name} uri={conversation.avatarUrl} size={92} rounded={false} />
            {canEditInfo ? <Pressable onPress={() => void chooseAvatar()} style={styles.avatarEdit} disabled={Boolean(busy)}><Camera color="#fff" size={17} /></Pressable> : null}
          </View>
          <View style={styles.nameRow}><Text numberOfLines={2} style={styles.groupName}>{conversation.name}</Text>{canEditInfo ? <Pressable onPress={() => { setNameDraft(conversation.name); setRenameOpen(true); }} style={styles.smallIcon}><Settings2 color={colors.accent} size={17} /></Pressable> : null}</View>
          <Text style={styles.memberCount}>{members.length} thành viên</Text>
        </View>

        <View style={styles.quickRow}>
          <Pressable onPress={() => void run('mute', () => muteConversation(conversation.id, isConversationMuted(conversation.notificationMutedUntil) ? null : 0))} style={[styles.quickAction, isConversationMuted(conversation.notificationMutedUntil) && styles.quickActive]}><View style={styles.quickIcon}>{isConversationMuted(conversation.notificationMutedUntil) ? <BellOff color={colors.accent} size={18} /> : <Bell color={colors.accent} size={18} />}</View><Text style={styles.quickText}>{isConversationMuted(conversation.notificationMutedUntil) ? 'Bật thông báo' : 'Tắt thông báo'}</Text></Pressable>
          <Pressable onPress={() => void run('pin', () => updateConversationPin(conversation.id, !conversation.pinned))} style={[styles.quickAction, conversation.pinned && styles.quickActive]}><View style={styles.quickIcon}><Pin color={colors.accent} size={18} /></View><Text style={styles.quickText}>{conversation.pinned ? 'Bỏ ghim' : 'Ghim hội thoại'}</Text></Pressable>
          <Pressable onPress={handleLeave} style={styles.quickAction}><View style={styles.quickIcon}><LogOut color={colors.danger} size={18} /></View><Text style={[styles.quickText, styles.dangerText]}>Rời nhóm</Text></Pressable>
        </View>

        <SectionTitle title="Thành viên" icon={UserPlus} />
        <Pressable onPress={() => setAddOpen(true)} style={styles.primaryAction} disabled={Boolean(busy)}><UserPlus color="#fff" size={18} /><Text style={styles.primaryText}>Thêm thành viên</Text></Pressable>
        {pendingMembers.length > 0 && isAdmin ? <View style={styles.pendingBox}><Text style={styles.sectionLabel}>Chờ duyệt ({pendingMembers.length})</Text>{pendingMembers.map(member => { const accountId = accountIdForMember(member, directory); return <MemberRow key={`pending-${accountId || identityValues(member).join('-')}`} member={member} pending onApprove={accountId ? () => void run(`approve-${accountId}`, () => approveGroupMember(conversation.id, accountId, true)) : undefined} onReject={accountId ? () => void run(`reject-${accountId}`, () => approveGroupMember(conversation.id, accountId, false)) : undefined} />; })}</View> : null}
        <View style={styles.memberList}>{members.map(member => {
           const owner = memberIsOwner(member);
           const admin = memberIsAdmin(member);
            const self = identitiesOverlap(member, session?.user);
            const accountId = accountIdForMember(member, directory);
            return <MemberRow key={accountId || identityValues(member).join('-')} member={member} owner={owner} admin={admin} self={self} canManage={isAdmin && !self && !owner && Boolean(accountId)} onRole={accountId ? () => void run(`role-${accountId}`, () => setGroupMemberRole(conversation.id, accountId, admin ? 'MEMBER' : 'ADMIN')) : undefined} onRemove={accountId ? () => Alert.alert('Xóa thành viên?', `Xóa ${member.name} khỏi nhóm?`, [{ text: 'Hủy', style: 'cancel' }, { text: 'Xóa', style: 'destructive', onPress: () => void run(`remove-${accountId}`, () => removeGroupMember(conversation.id, accountId)) }]) : undefined} />;
         })}</View>

        <SectionTitle title="Cài đặt nhóm" icon={Settings2} />
        <View style={styles.settingsBox}>
          {settingLabels.map(item => <View key={item.key} style={styles.settingRow}><View style={styles.settingCopy}><Text style={styles.settingLabel}>{item.label}</Text><Text style={styles.settingHint}>{item.hint}</Text></View><Switch value={settingsDraft[item.key]} onValueChange={value => setSettingsDraft(current => ({ ...current, [item.key]: value }))} disabled={!isAdmin || settingsBusy || Boolean(busy)} trackColor={{ false: colors.line, true: '#FFB39B' }} thumbColor={settingsDraft[item.key] ? colors.accent : '#fff'} /></View>)}
          {isAdmin ? <Pressable onPress={() => void submitSettings()} style={styles.saveButton} disabled={settingsBusy || Boolean(busy)}><Check color="#fff" size={18} /><Text style={styles.primaryText}>{settingsBusy ? 'Đang lưu...' : 'Lưu cài đặt'}</Text></Pressable> : null}
        </View>

        <SectionTitle title="Tìm trong lịch sử" icon={Search} />
        <View style={styles.searchRow}><View style={styles.historySearch}><Search color={colors.muted} size={17} /><TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Tìm tin nhắn..." placeholderTextColor={colors.muted} style={styles.historyInput} onSubmitEditing={() => void runSearch()} /></View><Pressable onPress={() => void runSearch()} style={styles.searchButton} disabled={searching}><Search color="#fff" size={18} /></Pressable></View>
        {searchResults.length > 0 ? <View style={styles.results}>{searchResults.map((item, index) => <View style={styles.resultRow} key={`${item.id || item.seq || index}`}><Text style={styles.resultText}>{String(item.text || item.content || item.message || 'Tin nhắn')}</Text><Text style={styles.resultMeta}>{String(item.senderName || item.sender_name || '')}</Text></View>)}</View> : null}

        {isOwner ? <View style={styles.dangerZone}><View style={styles.dangerHeading}><Crown color={colors.warning} size={18} /><Text style={styles.dangerTitle}>Quyền trưởng nhóm</Text></View><Text style={styles.settingHint}>Giải tán nhóm sẽ đóng hội thoại với tất cả thành viên.</Text><Pressable onPress={handleDissolve} style={styles.dangerButton} disabled={Boolean(busy)}><Trash2 color={colors.danger} size={18} /><Text style={styles.dangerButtonText}>{busy === 'dissolve' ? 'Đang giải tán...' : 'Giải tán nhóm'}</Text></Pressable></View> : null}
      </ScrollView>

      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.modalOverlay}><Pressable style={styles.modalBackdrop} onPress={() => setAddOpen(false)} /><View style={styles.modalSheet}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Thêm thành viên</Text><Pressable onPress={() => setAddOpen(false)} style={styles.smallIcon}><X color={colors.inkSoft} size={19} /></Pressable></View><SearchField value={addQuery} onChangeText={setAddQuery} placeholder="Tìm nhân viên" /><FlatList data={candidates} keyExtractor={item => item.id} contentContainerStyle={styles.candidateList} renderItem={({ item }) => { const selected = selectedIds.includes(item.id); return <Pressable onPress={() => setSelectedIds(current => selected ? current.filter(id => id !== item.id) : [...current, item.id])} style={styles.candidate}><Avatar name={item.name} uri={item.avatar} size={42} /><View style={styles.candidateCopy}><Text style={styles.memberName}>{item.name}</Text><Text style={styles.memberMeta}>{item.department || item.title || item.username}</Text></View><View style={[styles.check, selected && styles.checkActive]}>{selected ? <Check color="#fff" size={15} /> : <Plus color={colors.accent} size={17} />}</View></Pressable>; }} ListEmptyComponent={<Text style={styles.emptyList}>Không còn nhân viên phù hợp.</Text>} /><Pressable onPress={() => void addMembers()} style={styles.primaryAction} disabled={selectedIds.length === 0 || Boolean(busy)}><UserPlus color="#fff" size={18} /><Text style={styles.primaryText}>{busy === 'add' ? 'Đang thêm...' : `Thêm ${selectedIds.length || ''} thành viên`}</Text></Pressable></View></View>
      </Modal>

      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}><View style={styles.modalOverlay}><Pressable style={styles.modalBackdrop} onPress={() => setRenameOpen(false)} /><View style={styles.renameCard}><Text style={styles.modalTitle}>Đổi tên nhóm</Text><TextInput value={nameDraft} onChangeText={setNameDraft} autoFocus maxLength={120} placeholder="Tên nhóm" placeholderTextColor={colors.muted} style={styles.nameInput} /><View style={styles.modalActions}><Pressable onPress={() => setRenameOpen(false)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Hủy</Text></Pressable><Pressable onPress={() => void submitRename()} style={styles.primarySmall} disabled={!nameDraft.trim() || Boolean(busy)}><Check color="#fff" size={17} /><Text style={styles.primaryText}>{busy === 'rename' ? 'Đang lưu...' : 'Lưu'}</Text></Pressable></View></View></View></Modal>
    </View>
  );
}

function SectionTitle({ title, icon: Icon }: { title: string; icon: any }) {
  return <View style={styles.sectionHeading}><Icon color={colors.accent} size={18} /><Text style={styles.sectionTitle}>{title}</Text></View>;
}

function MemberRow({ member, owner = false, admin = false, self = false, pending = false, canManage = false, onRole, onRemove, onApprove, onReject }: { member: ConversationMember; owner?: boolean; admin?: boolean; self?: boolean; pending?: boolean; canManage?: boolean; onRole?: () => void; onRemove?: () => void; onApprove?: () => void; onReject?: () => void }) {
  return <View style={styles.memberRow}><Avatar name={member.name} uri={member.avatar} size={43} /><View style={styles.memberCopy}><Text numberOfLines={1} style={styles.memberName}>{member.name}{self ? ' (Bạn)' : ''}</Text><Text style={styles.memberMeta}>{owner ? 'Trưởng nhóm' : admin ? 'Phó nhóm' : pending ? 'Đang chờ duyệt' : (member.department || member.title || 'Thành viên')}</Text></View>{pending ? <><Pressable onPress={onApprove} style={styles.roundAction}><Check color={colors.online} size={17} /></Pressable><Pressable onPress={onReject} style={styles.roundDanger}><X color={colors.danger} size={17} /></Pressable></> : canManage ? <><Pressable onPress={onRole} style={styles.roundAction}><Shield color={admin ? colors.warning : colors.accent} size={17} /></Pressable><Pressable onPress={onRemove} style={styles.roundDanger}><UserMinus color={colors.danger} size={17} /></Pressable></> : null}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: { minHeight: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.canvas },
  headerTitle: { ...typography.title, color: colors.ink, flex: 1, textAlign: 'center' },
  headerSpacer: { width: 40 },
  iconButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 18, paddingBottom: 130, gap: 12 },
  identityBlock: { alignItems: 'center', paddingVertical: 8 },
  avatarWrap: { position: 'relative' },
  avatarEdit: { position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: 12, backgroundColor: colors.accent, borderWidth: 3, borderColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  nameRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' },
  groupName: { ...typography.heading, color: colors.ink, textAlign: 'center', flexShrink: 1 },
  memberCount: { ...typography.caption, color: colors.inkSoft, marginTop: 4 },
  smallIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickAction: { flex: 1, minHeight: 74, alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 17, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  quickActive: { borderColor: colors.accent, backgroundColor: colors.accentWash },
  quickIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: colors.accentWash, alignItems: 'center', justifyContent: 'center' },
  quickText: { ...typography.caption, color: colors.ink, textAlign: 'center', fontSize: 10.5 },
  dangerText: { color: colors.danger },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 1 },
  sectionTitle: { ...typography.title, color: colors.ink },
  primaryAction: { minHeight: 48, borderRadius: 15, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  primarySmall: { minHeight: 43, borderRadius: 13, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 15 },
  primaryText: { ...typography.bodyMedium, color: '#fff' },
  pendingBox: { padding: 12, borderRadius: 17, backgroundColor: '#FFF7E5', borderWidth: 1, borderColor: '#F5DDA8', gap: 3 },
  sectionLabel: { ...typography.caption, color: colors.warning, fontFamily: 'BeVietnamPro_700Bold', marginBottom: 3 },
  memberList: { borderRadius: 17, paddingHorizontal: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  memberRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  memberCopy: { flex: 1, minWidth: 0 },
  memberName: { ...typography.bodyMedium, color: colors.ink },
  memberMeta: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  roundAction: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.accentWash, alignItems: 'center', justifyContent: 'center' },
  roundDanger: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#FDECEC', alignItems: 'center', justifyContent: 'center' },
  settingsBox: { borderRadius: 17, padding: 13, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  settingRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  settingCopy: { flex: 1, minWidth: 0 },
  settingLabel: { ...typography.bodyMedium, color: colors.ink },
  settingHint: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  saveButton: { minHeight: 45, marginTop: 12, borderRadius: 14, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  searchRow: { flexDirection: 'row', gap: 8 },
  historySearch: { flex: 1, height: 48, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyInput: { flex: 1, color: colors.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 13 },
  searchButton: { width: 48, height: 48, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  results: { borderRadius: 17, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12 },
  resultRow: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.line },
  resultText: { ...typography.body, color: colors.ink },
  resultMeta: { ...typography.caption, color: colors.muted, marginTop: 3 },
  dangerZone: { marginTop: 12, padding: 14, borderRadius: 17, borderWidth: 1, borderColor: '#F2C4C4', backgroundColor: '#FFF6F6', gap: 8 },
  dangerHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dangerTitle: { ...typography.bodyMedium, color: colors.warning },
  dangerButton: { minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: '#F2B9B9', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dangerButtonText: { ...typography.bodyMedium, color: colors.danger },
  empty: { ...typography.body, color: colors.inkSoft, padding: 24 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(12,20,27,0.46)' },
  modalSheet: { maxHeight: '86%', borderTopLeftRadius: 27, borderTopRightRadius: 27, padding: 18, backgroundColor: colors.canvas, ...shadow },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { ...typography.title, color: colors.ink },
  candidateList: { paddingVertical: 9 },
  candidate: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  candidateCopy: { flex: 1, minWidth: 0 },
  check: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  checkActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  emptyList: { ...typography.body, color: colors.inkSoft, textAlign: 'center', padding: 24 },
  renameCard: { margin: 20, padding: 18, borderRadius: 21, backgroundColor: colors.canvas, ...shadow },
  nameInput: { height: 50, marginTop: 14, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, paddingHorizontal: 14, color: colors.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 14 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  secondaryButton: { minHeight: 43, borderRadius: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  secondaryText: { ...typography.bodyMedium, color: colors.inkSoft },
});
