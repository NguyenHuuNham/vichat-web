import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MessageSquarePlus, QrCode, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { ThemeColors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { useThemePalette } from '../../theme/useThemePalette';
import { Avatar } from '../../components/Avatar';
import { SearchField } from '../../components/SearchField';
import { ConversationRow } from '../../components/ConversationRow';
import { EmptyState } from '../../components/EmptyState';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ChoiceDialog, ChoiceDialogOption } from '../../components/ChoiceDialog';
import { MessageCircleMore } from 'lucide-react-native';
import { isConversationMuted } from '../../utils/conversationNotifications';
import { Conversation } from '../../types';
import { accountIdForMember, identitiesOverlap } from '../../utils/identity';
import { isConversationVisibleInList } from '../../utils/conversationSync';
import { displayCurrentTenantName } from '../../utils/tenantDisplay';
import { ConversationViewerPreference, loadConversationPreferences } from '../../services/conversationPreferenceService';
import { QrScannerModal } from '../../components/QrScannerModal';

type Props = BottomTabScreenProps<MainTabParamList, 'Chats'> & { navigation: any };
type FilterKey = 'all' | 'unread' | 'groups';
type DeleteRequest = { item: Conversation; title: string; message: string; confirmLabel: string; fallback: string; replacementId?: string };
type ActionRequest = { title: string; message: string; options: ChoiceDialogOption[]; onSelect: (option: ChoiceDialogOption) => void };

const filters: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'unread', label: 'Chưa đọc' },
  { key: 'groups', label: 'Nhóm' },
];

export function ConversationListScreen({ navigation }: Props) {
  const palette = useThemePalette();
  const styles = createStyles(palette);
  const session = useAppStore(state => state.session);
  const directory = useAppStore(state => state.directory);
  const conversations = useAppStore(state => state.conversations);
  const connection = useAppStore(state => state.connection);
  const error = useAppStore(state => state.error);
  const refreshData = useAppStore(state => state.refreshData);
  const muteConversation = useAppStore(state => state.muteConversation);
  const deleteConversation = useAppStore(state => state.deleteConversation);
  const clearError = useAppStore(state => state.clearError);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showSearch, setShowSearch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [actionRequest, setActionRequest] = useState<ActionRequest | null>(null);
  const [preferences, setPreferences] = useState<Record<string, ConversationViewerPreference>>({});
  const [qrScannerVisible, setQrScannerVisible] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    const viewerId = String(session?.user.id || '');
    const tenantId = String(session?.tenant?.id || '');
    if (!viewerId || !tenantId) {
      setPreferences({});
      return () => { active = false; };
    }
    void loadConversationPreferences(viewerId, tenantId).then(value => {
      if (active) setPreferences(value);
    });
    return () => { active = false; };
  }, [session?.tenant?.id, session?.user.id]));

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return conversations.filter(item => {
      if (!isConversationVisibleInList(item)) return false;
      const preference = preferences[item.id];
      if (preference?.hidden) return false;
      const matchesQuery = !keyword || item.name.toLowerCase().includes(keyword) || (item.lastMsg || '').toLowerCase().includes(keyword);
      const matchesFilter = filter === 'all' || (filter === 'unread' && item.badge > 0) || (filter === 'groups' && item.isGroup);
      return matchesQuery && matchesFilter;
    });
  }, [conversations, filter, preferences, query]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await refreshData(); } finally { setRefreshing(false); }
  }, [refreshData]);

  const runConversationAction = useCallback(async (action: () => Promise<void>, fallback: string) => {
    setActionBusy(true);
    try {
      await action();
    } catch (value) {
      Alert.alert('Không thể thực hiện', value instanceof Error ? value.message : fallback);
    } finally {
      setActionBusy(false);
    }
  }, []);

  const requestConversationDelete = useCallback((item: typeof conversations[number]) => {
    const ownerId = String(item.adminId || '');
    const isOwner = item.isGroup && (
      identitiesOverlap({ id: ownerId }, session?.user)
      || item.members?.some(member => String(member.mode || '').includes('O') && identitiesOverlap(member, session?.user))
    );
    if (!isOwner) {
      setDeleteRequest({
        item,
        title: 'Xóa cuộc trò chuyện?',
        message: 'Tin nhắn của người khác không bị xóa.',
        confirmLabel: 'Xóa phía tôi',
        fallback: 'Không xóa được cuộc trò chuyện phía bạn.',
      });
      return;
    }

    const otherMembers = (item.members || []).filter(member => !identitiesOverlap(member, session?.user));
    const candidates = otherMembers
      .map(member => ({ member, accountId: accountIdForMember(member, directory) }))
      .filter(value => Boolean(value.accountId));
    if (otherMembers.length > 0 && candidates.length === 0) {
      Alert.alert('Chưa đồng bộ thành viên', 'Không xác định được Account ID của thành viên thay thế. Hãy tải lại nhóm rồi thử lại.');
      return;
    }
    if (candidates.length === 0) {
      setDeleteRequest({
        item,
        title: 'Rời nhóm cuối cùng?',
        message: 'Bạn là thành viên cuối cùng. Rời nhóm sẽ đóng nhóm này.',
        confirmLabel: 'Rời nhóm',
        fallback: 'Không thể rời và đóng nhóm.',
      });
      return;
    }
    setActionRequest({
      title: 'Chọn trưởng nhóm mới',
      message: 'Bạn phải chuyển quyền cho một thành viên trước khi rời nhóm.',
      options: candidates.map(({ member, accountId }): ChoiceDialogOption => ({ id: accountId, label: member.name || member.username || accountId, detail: member.department || member.title || 'Thành viên trong nhóm' })),
      onSelect: option => {
        setActionRequest(null);
        void runConversationAction(() => deleteConversation(item.id, option.id), 'Không thể chuyển quyền và rời nhóm.');
      },
    });
  }, [deleteConversation, directory, runConversationAction, session]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.identity}>
          <Avatar name={session?.user.name} uri={session?.user.avatar} size={48} online={connection === 'connected'} />
          <View style={styles.identityText}>
            <Text numberOfLines={2} ellipsizeMode="tail" style={styles.eyebrow}>{displayCurrentTenantName(session, 'Không gian công ty')}</Text>
            <Text style={styles.title}>Tin nhắn</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable accessibilityLabel="Quét mã QR" onPress={() => setQrScannerVisible(true)} style={styles.iconButton}>
            <QrCode color={palette.ink} size={21} />
          </Pressable>
          <Pressable
            accessibilityLabel={showSearch ? 'Đóng tìm kiếm' : 'Tìm kiếm cuộc trò chuyện'}
            onPress={() => setShowSearch(value => !value)}
            style={styles.iconButton}
          >
            {showSearch ? <X color={palette.ink} size={22} /> : <Search color={palette.ink} size={22} />}
          </Pressable>
        </View>
      </View>

      {showSearch ? <View style={styles.search}><SearchField value={query} onChangeText={setQuery} placeholder="Tìm cuộc trò chuyện" /></View> : null}

      <View style={styles.filterRow}>
        <View style={styles.filters}>
          {filters.map(item => (
            <Pressable key={item.key} onPress={() => setFilter(item.key)} style={[styles.filterChip, filter === item.key && styles.filterChipActive]}>
              <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <SlidersHorizontal color={palette.inkSoft} size={18} />
      </View>

      {error ? <Pressable onPress={clearError} style={styles.notice}><Text style={styles.noticeText}>{error}</Text><Text style={styles.noticeClose}>Đóng</Text></Pressable> : null}

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            preference={preferences[item.id]}
            onPress={() => navigation.navigate('ChatDetail', { conversationId: item.id })}
            onLongPress={() => setActionRequest({
              title: item.name,
              message: 'Chọn thao tác cho cuộc trò chuyện này.',
              options: [
                { id: 'mute', label: isConversationMuted(item.notificationMutedUntil) ? 'Bật thông báo' : 'Tắt thông báo', detail: 'Cập nhật thông báo trên thiết bị' },
                { id: 'delete', label: 'Xóa phía tôi', detail: 'Xóa cuộc trò chuyện khỏi danh sách của bạn' },
              ],
              onSelect: option => {
                setActionRequest(null);
                if (option.id === 'delete') {
                  requestConversationDelete(item);
                  return;
                }
                const muted = isConversationMuted(item.notificationMutedUntil);
                void runConversationAction(() => muteConversation(item.id, muted ? null : 0), 'Không cập nhật được trạng thái thông báo.');
              },
            })}
          />
        )}
        contentContainerStyle={filtered.length ? styles.list : styles.emptyList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.accent} colors={[palette.accent]} />}
        ListEmptyComponent={<EmptyState icon={MessageCircleMore} title={query || filter !== 'all' ? 'Không tìm thấy cuộc trò chuyện' : 'Chưa có cuộc trò chuyện'} description={query || filter !== 'all' ? 'Thử đổi bộ lọc hoặc tìm bằng tên đồng nghiệp, nhóm.' : 'Mở Danh bạ để bắt đầu nhắn tin với đồng đội.'} />}
        showsVerticalScrollIndicator={false}
      />

      <ConfirmDialog
        visible={Boolean(deleteRequest)}
        title={deleteRequest?.title || ''}
        message={deleteRequest?.message || ''}
        eyebrow="THAO TÁC CUỘC TRÒ CHUYỆN"
        confirmLabel={deleteRequest?.confirmLabel || 'Xác nhận'}
        onCancel={() => setDeleteRequest(null)}
        onConfirm={() => {
          const request = deleteRequest;
          if (!request) return;
          void runConversationAction(
            () => deleteConversation(request.item.id, request.replacementId),
            request.fallback,
          ).finally(() => setDeleteRequest(null));
        }}
        busy={actionBusy}
      />

      <ChoiceDialog
        visible={Boolean(actionRequest)}
        title={actionRequest?.title || ''}
        message={actionRequest?.message || ''}
        options={actionRequest?.options || []}
        onCancel={() => setActionRequest(null)}
        onSelect={option => actionRequest?.onSelect(option)}
        busy={actionBusy}
      />

      <Pressable accessibilityLabel="Mở danh bạ để bắt đầu cuộc trò chuyện" onPress={() => navigation.navigate('Contacts')} style={styles.composeButton}>
        <MessageSquarePlus color="#fff" size={24} strokeWidth={2.3} />
      </Pressable>
      <QrScannerModal visible={qrScannerVisible} onClose={() => setQrScannerVisible(false)} />
    </SafeAreaView>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.canvas },
    header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    identity: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
    identityText: { flex: 1, minWidth: 0 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    eyebrow: { ...typography.caption, color: palette.inkSoft, flexShrink: 1 },
    title: { ...typography.display, color: palette.ink, marginTop: 1 },
    iconButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center', ...shadow },
    search: { paddingHorizontal: 20, paddingBottom: 12 },
    filterRow: { paddingHorizontal: 20, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
    filters: { flex: 1, flexDirection: 'row', gap: 8 },
    filterChip: { minHeight: 36, paddingHorizontal: 15, borderRadius: 18, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
    filterChipActive: { backgroundColor: palette.accentWash, borderColor: palette.accent },
    filterText: { ...typography.bodyMedium, color: palette.inkSoft, fontSize: 13 },
    filterTextActive: { color: palette.accentDeep },
    notice: { marginHorizontal: 20, marginBottom: 8, padding: 11, borderRadius: 14, backgroundColor: `${palette.warning}20`, flexDirection: 'row', alignItems: 'center', gap: 8 },
    noticeText: { ...typography.caption, color: palette.warning, flex: 1 },
    noticeClose: { ...typography.caption, color: palette.accentDeep },
    list: { paddingHorizontal: 20, paddingBottom: 150 },
    emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 120 },
    composeButton: { position: 'absolute', right: 22, bottom: 96, width: 58, height: 58, borderRadius: 19, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${palette.accent}99`, ...shadow },
  });
}
