import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageSquarePlus, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { colors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import { SearchField } from '../../components/SearchField';
import { ConversationRow } from '../../components/ConversationRow';
import { EmptyState } from '../../components/EmptyState';
import { MessageCircleMore } from 'lucide-react-native';

type Props = BottomTabScreenProps<MainTabParamList, 'Chats'> & { navigation: any };
type FilterKey = 'all' | 'unread' | 'groups';

const filters: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'unread', label: 'Chưa đọc' },
  { key: 'groups', label: 'Nhóm' },
];

export function ConversationListScreen({ navigation }: Props) {
  const session = useAppStore(state => state.session);
  const conversations = useAppStore(state => state.conversations);
  const connection = useAppStore(state => state.connection);
  const error = useAppStore(state => state.error);
  const refreshData = useAppStore(state => state.refreshData);
  const openConversation = useAppStore(state => state.openConversation);
  const clearError = useAppStore(state => state.clearError);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showSearch, setShowSearch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return conversations.filter(item => {
      const matchesQuery = !keyword || item.name.toLowerCase().includes(keyword) || (item.lastMsg || '').toLowerCase().includes(keyword);
      const matchesFilter = filter === 'all' || (filter === 'unread' && item.badge > 0) || (filter === 'groups' && item.isGroup);
      return matchesQuery && matchesFilter;
    });
  }, [conversations, filter, query]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await refreshData(); } finally { setRefreshing(false); }
  }, [refreshData]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.identity}>
          <Avatar name={session?.user.name} uri={session?.user.avatar} size={48} online={connection === 'connected'} />
          <View style={styles.identityText}>
            <Text style={styles.eyebrow}>{session?.tenant?.name || 'Không gian công ty'}</Text>
            <Text style={styles.title}>Tin nhắn</Text>
          </View>
        </View>
        <Pressable
          accessibilityLabel={showSearch ? 'Đóng tìm kiếm' : 'Tìm kiếm cuộc trò chuyện'}
          onPress={() => setShowSearch(value => !value)}
          style={styles.iconButton}
        >
          {showSearch ? <X color={colors.ink} size={22} /> : <Search color={colors.ink} size={22} />}
        </Pressable>
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
        <SlidersHorizontal color={colors.inkSoft} size={18} />
      </View>

      {error ? <Pressable onPress={clearError} style={styles.notice}><Text style={styles.noticeText}>{error}</Text><Text style={styles.noticeClose}>Đóng</Text></Pressable> : null}

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <ConversationRow conversation={item} onPress={async () => { await openConversation(item.id); navigation.navigate('ChatDetail', { conversationId: item.id }); }} />}
        contentContainerStyle={filtered.length ? styles.list : styles.emptyList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />}
        ListEmptyComponent={<EmptyState icon={MessageCircleMore} title={query || filter !== 'all' ? 'Không tìm thấy cuộc trò chuyện' : 'Chưa có cuộc trò chuyện'} description={query || filter !== 'all' ? 'Thử đổi bộ lọc hoặc tìm bằng tên đồng nghiệp, nhóm.' : 'Mở Danh bạ để bắt đầu nhắn tin với đồng đội.'} />}
        showsVerticalScrollIndicator={false}
      />

      <Pressable accessibilityLabel="Mở danh bạ để bắt đầu cuộc trò chuyện" onPress={() => navigation.navigate('Contacts')} style={styles.composeButton}>
        <MessageSquarePlus color="#fff" size={24} strokeWidth={2.3} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  identityText: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.caption, color: colors.inkSoft, maxWidth: 220 },
  title: { ...typography.display, color: colors.ink, marginTop: 1 },
  iconButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', ...shadow },
  search: { paddingHorizontal: 20, paddingBottom: 12 },
  filterRow: { paddingHorizontal: 20, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  filters: { flex: 1, flexDirection: 'row', gap: 8 },
  filterChip: { minHeight: 36, paddingHorizontal: 15, borderRadius: 18, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  filterChipActive: { backgroundColor: colors.accentWash, borderColor: colors.accent },
  filterText: { ...typography.bodyMedium, color: colors.inkSoft, fontSize: 13 },
  filterTextActive: { color: colors.accentDeep },
  notice: { marginHorizontal: 20, marginBottom: 8, padding: 11, borderRadius: 14, backgroundColor: '#FFF4DB', flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeText: { ...typography.caption, color: colors.warning, flex: 1 },
  noticeClose: { ...typography.caption, color: colors.accentDeep },
  list: { paddingHorizontal: 20, paddingBottom: 150 },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 120 },
  composeButton: { position: 'absolute', right: 22, bottom: 96, width: 58, height: 58, borderRadius: 19, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FF9670', ...shadow },
});
