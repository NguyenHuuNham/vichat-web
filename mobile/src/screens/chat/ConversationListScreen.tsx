import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BellRing, Plus } from 'lucide-react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { colors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import { SearchField } from '../../components/SearchField';
import { ConnectionPill } from '../../components/ConnectionPill';
import { ConversationRow } from '../../components/ConversationRow';
import { EmptyState } from '../../components/EmptyState';
import { MessageCircleMore } from 'lucide-react-native';

type Props = BottomTabScreenProps<MainTabParamList, 'Chats'> & { navigation: any };

export function ConversationListScreen({ navigation }: Props) {
  const session = useAppStore(state => state.session);
  const conversations = useAppStore(state => state.conversations);
  const connection = useAppStore(state => state.connection);
  const error = useAppStore(state => state.error);
  const refreshData = useAppStore(state => state.refreshData);
  const openConversation = useAppStore(state => state.openConversation);
  const clearError = useAppStore(state => state.clearError);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const filtered = useMemo(() => conversations.filter(item => item.name.toLowerCase().includes(query.trim().toLowerCase())), [conversations, query]);
  const refresh = useCallback(async () => { setRefreshing(true); try { await refreshData(); } finally { setRefreshing(false); } }, [refreshData]);
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.identity}><Avatar name={session?.user.name} uri={session?.user.avatar} size={48} online /><View><Text style={styles.eyebrow}>{session?.tenant?.name || 'Không gian công ty'}</Text><Text style={styles.title}>Tin nhắn</Text></View></View>
        <View style={styles.headerActions}><Pressable style={styles.iconButton} onPress={() => {}}><BellRing color={colors.inkSoft} size={19} /></Pressable><Pressable style={[styles.iconButton, styles.addButton]} onPress={() => navigation.navigate('Contacts')}><Plus color="#fff" size={21} /></Pressable></View>
      </View>
      <View style={styles.search}><SearchField value={query} onChangeText={setQuery} placeholder="Tìm cuộc trò chuyện" /><ConnectionPill state={connection} /></View>
      {error ? <Pressable onPress={clearError} style={styles.notice}><Text style={styles.noticeText}>{error}</Text><Text style={styles.noticeClose}>Đóng</Text></Pressable> : null}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <ConversationRow conversation={item} onPress={async () => { await openConversation(item.id); navigation.navigate('ChatDetail', { conversationId: item.id }); }} />}
        contentContainerStyle={filtered.length ? styles.list : styles.emptyList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />}
        ListEmptyComponent={<EmptyState icon={MessageCircleMore} title={query ? 'Không tìm thấy cuộc trò chuyện' : 'Chưa có cuộc trò chuyện'} description={query ? 'Thử tìm bằng tên đồng nghiệp hoặc nhóm.' : 'Mở Danh bạ để bắt đầu nhắn tin với đồng đội.'} />}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  eyebrow: { ...typography.caption, color: colors.inkSoft, maxWidth: 180 },
  title: { ...typography.heading, color: colors.ink, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', ...shadow },
  addButton: { backgroundColor: colors.accent },
  search: { paddingHorizontal: 20, gap: 10, flexDirection: 'row', alignItems: 'center', paddingBottom: 12 },
  notice: { marginHorizontal: 20, marginBottom: 4, padding: 11, borderRadius: 14, backgroundColor: '#FFF4DB', flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeText: { ...typography.caption, color: colors.warning, flex: 1 },
  noticeClose: { ...typography.caption, color: colors.accentDeep },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 },
});
