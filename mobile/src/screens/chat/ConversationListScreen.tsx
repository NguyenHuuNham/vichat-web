import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Bot, ChevronDown, MessageSquarePlus, QrCode, Search, X } from 'lucide-react-native';
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
import { isConversationMuted, resolveNotificationMuteUntil } from '../../utils/conversationNotifications';
import { NotificationMuteModal } from '../../components/NotificationMuteModal';
import { Conversation } from '../../types';
import { accountIdForMember, identitiesOverlap } from '../../utils/identity';
import { isConversationVisibleInList } from '../../utils/conversationSync';
import { displayCurrentTenantName } from '../../utils/tenantDisplay';
import { ConversationViewerPreference, loadConversationPreferences } from '../../services/conversationPreferenceService';
import { QrScannerModal } from '../../components/QrScannerModal';
import { useI18n } from '../../store/languageStore';
import { ChannelFilterKey, isConversationMatchingFilter, resolveConversationChannel } from '../../utils/channelPolicy';

type Props = BottomTabScreenProps<MainTabParamList, 'Chats'> & { navigation: any };
type FilterKey = ChannelFilterKey;
type DeleteRequest = { item: Conversation; title: string; message: string; confirmLabel: string; fallback: string; replacementId?: string };
type ActionRequest = { title: string; message: string; options: ChoiceDialogOption[]; onSelect: (option: ChoiceDialogOption) => void };

const filters: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'groups', label: 'Nhóm' },
  { key: 'zalo', label: 'Zalo OA' },
  { key: 'livechat', label: 'Live Chat' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'unread', label: 'Chưa đọc' },
];

export function ConversationListScreen({ navigation }: Props) {
  const palette = useThemePalette();
  const styles = createStyles(palette);
  const { t } = useI18n();
  const session = useAppStore(state => state.session);
  const directory = useAppStore(state => state.directory);
  const conversations = useAppStore(state => state.conversations);
  const connection = useAppStore(state => state.connection);
  const error = useAppStore(state => state.error);
  const muteConversation = useAppStore(state => state.muteConversation);
  const deleteConversation = useAppStore(state => state.deleteConversation);
  const clearError = useAppStore(state => state.clearError);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showSearch, setShowSearch] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [actionRequest, setActionRequest] = useState<ActionRequest | null>(null);
  const [preferences, setPreferences] = useState<Record<string, ConversationViewerPreference>>({});
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [muteTarget, setMuteTarget] = useState<Conversation | null>(null);
  const [selectedZaloBotId, setSelectedZaloBotId] = useState<string>('all');
  const [botPickerVisible, setBotPickerVisible] = useState(false);

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

  const zaloBots = useMemo(() => {
    const counts: Record<string, number> = {};
    const names: Record<string, string> = {
      '2274336170816480019': 'Gonstack',
      '3733466236951056718': 'CBS global education',
      '262829019064124420': 'Hoàng Hà Mobile',
    };
    let totalZalo = 0;

    conversations.forEach(item => {
      const ch = resolveConversationChannel(item);
      if (ch === 'zalo' || ch === 'zalo_oa') {
        totalZalo += 1;
        const oid = item.oa_id || (item.id.startsWith('zalo:') ? item.id.split(':')[1] : '') || 'other';
        counts[oid] = (counts[oid] || 0) + 1;
        if (item.oa_name && !names[oid]) {
          names[oid] = item.oa_name;
        }
      }
    });

    const activeBots = [
      { id: '2274336170816480019', name: 'Gonstack', count: counts['2274336170816480019'] || 0 },
      { id: '262829019064124420', name: 'Hoàng Hà Mobile', count: counts['262829019064124420'] || 0 },
      { id: '3733466236951056718', name: 'CBS global education', count: counts['3733466236951056718'] || 0 },
    ].filter(b => b.count > 0);

    Object.keys(counts).forEach(oid => {
      if (!activeBots.some(b => b.id === oid) && oid !== 'other' && counts[oid] > 0) {
        activeBots.push({ id: oid, name: names[oid] || ('Bot ' + oid), count: counts[oid] });
      }
    });

    return { bots: activeBots, total: totalZalo };
  }, [conversations]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return conversations.filter(item => {
      if (!isConversationVisibleInList(item)) return false;
      const preference = preferences[item.id];
      if (preference?.hidden) return false;
      const matchesQuery = !keyword || item.name.toLowerCase().includes(keyword) || (item.lastMsg || '').toLowerCase().includes(keyword);
      const matchesFilter = isConversationMatchingFilter(item, filter);
      if (!matchesFilter) return false;
      if (filter === 'zalo' && selectedZaloBotId && selectedZaloBotId !== 'all') {
        const itemOaId = item.oa_id || (item.id.startsWith('zalo:') ? item.id.split(':')[1] : '') || (item.tinodeTopic?.startsWith('zalo:') ? item.tinodeTopic.split(':')[1] : '');
        if (itemOaId !== selectedZaloBotId) return false;
      }
      return matchesQuery && matchesFilter;
    });
  }, [conversations, filter, preferences, query, selectedZaloBotId]);

  const runConversationAction = useCallback(async (action: () => Promise<void>, fallback: string) => {
    setActionBusy(true);
    try {
      await action();
    } catch (value) {
      Alert.alert(t('Không thể thực hiện'), value instanceof Error ? t(value.message) : t(fallback));
    } finally {
      setActionBusy(false);
    }
  }, [t]);

  const requestConversationDelete = useCallback((item: typeof conversations[number]) => {
    const ownerId = String(item.adminId || '');
    const isOwner = item.isGroup && (
      identitiesOverlap({ id: ownerId }, session?.user)
      || item.members?.some(member => String(member.mode || '').includes('O') && identitiesOverlap(member, session?.user))
    );
    if (!isOwner) {
      setDeleteRequest({
        item,
        title: t('Xóa cuộc trò chuyện?'),
        message: t('Tin nhắn của người khác không bị xóa.'),
        confirmLabel: t('Xóa phía tôi'),
        fallback: t('Không xóa được cuộc trò chuyện phía bạn.'),
      });
      return;
    }

    const otherMembers = (item.members || []).filter(member => !identitiesOverlap(member, session?.user));
    const candidates = otherMembers
      .map(member => ({ member, accountId: accountIdForMember(member, directory) }))
      .filter(value => Boolean(value.accountId));
    if (otherMembers.length > 0 && candidates.length === 0) {
      Alert.alert(t('Chưa đồng bộ thành viên'), t('Không xác định được Account ID của thành viên thay thế. Hãy tải lại nhóm rồi thử lại.'));
      return;
    }
    if (candidates.length === 0) {
      setDeleteRequest({
        item,
        title: t('Rời nhóm cuối cùng?'),
        message: t('Bạn là thành viên cuối cùng. Rời nhóm sẽ đóng nhóm này.'),
        confirmLabel: t('Rời nhóm'),
        fallback: t('Không thể rời và đóng nhóm.'),
      });
      return;
    }
    setActionRequest({
      title: t('Chọn trưởng nhóm mới'),
      message: t('Bạn phải chuyển quyền cho một thành viên trước khi rời nhóm.'),
      options: candidates.map(({ member, accountId }): ChoiceDialogOption => ({ id: accountId, label: member.name || member.username || accountId, detail: member.department || member.title || t('Thành viên trong nhóm') })),
      onSelect: option => {
        setActionRequest(null);
        void runConversationAction(() => deleteConversation(item.id, option.id), t('Không thể chuyển quyền và rời nhóm.'));
      },
    });
  }, [deleteConversation, directory, runConversationAction, session, t]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.identity}>
          <Avatar name={session?.user.name} uri={session?.user.avatar} size={48} online={connection === 'connected'} />
          <View style={styles.identityText}>
            <Text numberOfLines={2} ellipsizeMode="tail" style={styles.eyebrow}>{displayCurrentTenantName(session, t('Không gian công ty'))}</Text>
            <Text style={styles.title}>{t('Tin nhắn')}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable accessibilityLabel={t('Quét mã QR')} onPress={() => setQrScannerVisible(true)} style={styles.iconButton}>
            <QrCode color={palette.ink} size={21} />
          </Pressable>
          <Pressable
            accessibilityLabel={showSearch ? t('Đóng tìm kiếm') : t('Tìm kiếm cuộc trò chuyện')}
            onPress={() => setShowSearch(value => !value)}
            style={styles.iconButton}
          >
            {showSearch ? <X color={palette.ink} size={22} /> : <Search color={palette.ink} size={22} />}
          </Pressable>
        </View>
      </View>

      {showSearch ? <View style={styles.search}><SearchField value={query} onChangeText={setQuery} placeholder={t('Tìm cuộc trò chuyện')} /></View> : null}

      <View style={styles.filterRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersScrollContent}
        >
          {filters.map(item => (
            <Pressable key={item.key} onPress={() => setFilter(item.key)} style={[styles.filterChip, filter === item.key && styles.filterChipActive]}>
              <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>{t(item.label)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {filter === 'zalo' ? (
        <View style={styles.zaloBotBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Chọn Bot Zalo')}
            onPress={() => setBotPickerVisible(true)}
            style={styles.zaloBotDropdownButton}
          >
            <Bot color={palette.accent} size={16} />
            <Text style={styles.zaloBotDropdownText} numberOfLines={1}>
              {selectedZaloBotId === 'all'
                ? (t('Tất cả Bot') + ' (' + zaloBots.total + ')')
                : ((zaloBots.bots.find(b => b.id === selectedZaloBotId)?.name || 'Bot') + ' (' + (zaloBots.bots.find(b => b.id === selectedZaloBotId)?.count || 0) + ')')}
            </Text>
            <ChevronDown color={palette.inkSoft} size={15} />
          </Pressable>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.zaloBotPillsScroll}
          >
            <Pressable
              onPress={() => setSelectedZaloBotId('all')}
              style={[styles.zaloBotPill, selectedZaloBotId === 'all' && styles.zaloBotPillActive]}
            >
              <Text style={[styles.zaloBotPillText, selectedZaloBotId === 'all' && styles.zaloBotPillTextActive]}>
                {t('Tất cả')} ({zaloBots.total})
              </Text>
            </Pressable>
            {zaloBots.bots.map(b => (
              <Pressable
                key={b.id}
                onPress={() => setSelectedZaloBotId(b.id)}
                style={[styles.zaloBotPill, selectedZaloBotId === b.id && styles.zaloBotPillActive]}
              >
                <Text style={[styles.zaloBotPillText, selectedZaloBotId === b.id && styles.zaloBotPillTextActive]}>
                  {b.name.replace(' global education', '').replace(' Mobile', '')} ({b.count})
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {error ? <Pressable onPress={clearError} style={styles.notice}><Text style={styles.noticeText}>{t(error)}</Text><Text style={styles.noticeClose}>{t('Đóng')}</Text></Pressable> : null}

      <FlatList
        data={filtered}
        extraData={selectedZaloBotId}
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
              message: t('Chọn thao tác cho cuộc trò chuyện này.'),
              options: [
                { id: 'mute', label: isConversationMuted(item.notificationMutedUntil) ? t('Bật thông báo') : t('Tắt thông báo'), detail: t('Cập nhật thông báo trên thiết bị') },
                { id: 'delete', label: t('Xóa phía tôi'), detail: t('Xóa cuộc trò chuyện khỏi danh sách của bạn') },
              ],
              onSelect: option => {
                setActionRequest(null);
                if (option.id === 'delete') {
                  requestConversationDelete(item);
                  return;
                }
                const muted = isConversationMuted(item.notificationMutedUntil);
                if (muted) {
                  void runConversationAction(() => muteConversation(item.id, null), t('Không cập nhật được trạng thái thông báo.'));
                } else {
                  setMuteTarget(item);
                }
              },
            })}
          />
        )}
        contentContainerStyle={filtered.length ? styles.list : styles.emptyList}
        ListEmptyComponent={<EmptyState icon={MessageCircleMore} title={query || filter !== 'all' ? t('Không tìm thấy cuộc trò chuyện') : t('Chưa có cuộc trò chuyện')} description={query || filter !== 'all' ? t('Thử đổi bộ lọc hoặc tìm bằng tên đồng nghiệp, nhóm.') : t('Mở Danh bạ để bắt đầu nhắn tin với đồng đội.')} />}
        showsVerticalScrollIndicator={false}
      />

      <ConfirmDialog
        visible={Boolean(deleteRequest)}
        title={deleteRequest?.title || ''}
        message={deleteRequest?.message || ''}
        eyebrow={t('THAO TÁC CUỘC TRÒ CHUYỆN')}
        confirmLabel={deleteRequest?.confirmLabel || t('Xác nhận')}
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

      <Pressable accessibilityLabel={t('Mở danh bạ để bắt đầu cuộc trò chuyện')} onPress={() => navigation.navigate('Contacts')} style={styles.composeButton}>
        <MessageSquarePlus color="#fff" size={24} strokeWidth={2.3} />
      </Pressable>
      <NotificationMuteModal
        visible={Boolean(muteTarget)}
        conversationName={muteTarget?.name}
        onClose={() => setMuteTarget(null)}
        onConfirm={option => {
          const target = muteTarget;
          setMuteTarget(null);
          if (!target) return;
          const until = resolveNotificationMuteUntil(option);
          void runConversationAction(() => muteConversation(target.id, until), t('Không cập nhật được trạng thái thông báo.'));
        }}
      />
      <ChoiceDialog
        visible={botPickerVisible}
        title={t('Chọn Bot Zalo OA')}
        message={t('Lọc danh sách hội thoại theo tài khoản Zalo OA doanh nghiệp.')}
        options={[
          {
            id: 'all',
            label: t('Tất cả Bot') + ' (' + zaloBots.total + ')',
            detail: t('Hiển thị tất cả cuộc trò chuyện từ mọi Bot'),
          },
          ...zaloBots.bots.map(b => ({
            id: b.id,
            label: b.name + ' (' + b.count + ')',
            detail: 'OA ID: ' + b.id,
          })),
        ]}
        onCancel={() => setBotPickerVisible(false)}
        onSelect={opt => {
          setBotPickerVisible(false);
          setSelectedZaloBotId(opt.id);
        }}
      />
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
    filterRow: { paddingBottom: 16 },
    filtersScrollContent: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8 },
    filterChip: { minHeight: 36, paddingHorizontal: 15, borderRadius: 18, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
    filterChipActive: { backgroundColor: palette.accentWash, borderColor: palette.accent },
    filterText: { ...typography.bodyMedium, color: palette.inkSoft, fontSize: 13 },
    filterTextActive: { color: palette.accentDeep },
    notice: { marginHorizontal: 20, marginBottom: 8, padding: 11, borderRadius: 14, backgroundColor: `${palette.warning}20`, flexDirection: 'row', alignItems: 'center', gap: 8 },
    noticeText: { ...typography.caption, color: palette.warning, flex: 1 },
    noticeClose: { ...typography.caption, color: palette.accentDeep },
    list: { paddingHorizontal: 20, paddingBottom: 150 },
    emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 120 },
    zaloBotBar: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
    zaloBotDropdownButton: { height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.accent, flexDirection: 'row', alignItems: 'center', gap: 6, ...shadow },
    zaloBotDropdownText: { ...typography.bodyMedium, color: palette.accentDeep, fontSize: 12, maxWidth: 130 },
    zaloBotPillsScroll: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    zaloBotPill: { height: 30, paddingHorizontal: 11, borderRadius: 15, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
    zaloBotPillActive: { backgroundColor: palette.accentWash, borderColor: palette.accent },
    zaloBotPillText: { ...typography.caption, color: palette.inkSoft, fontSize: 11 },
    zaloBotPillTextActive: { color: palette.accentDeep, fontFamily: 'BeVietnamPro_600SemiBold' },
    composeButton: { position: 'absolute', right: 22, bottom: 96, width: 58, height: 58, borderRadius: 19, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${palette.accent}99`, ...shadow },
  });
}
