import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Building2, Check, MessageSquarePlus, UserRoundSearch, UsersRound } from 'lucide-react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { colors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import { SearchField } from '../../components/SearchField';
import { EmptyState } from '../../components/EmptyState';

type Props = BottomTabScreenProps<MainTabParamList, 'Contacts'> & { navigation: any };

export function ContactsScreen({ navigation }: Props) {
  const session = useAppStore(state => state.session);
  const directory = useAppStore(state => state.directory);
  const refreshData = useAppStore(state => state.refreshData);
  const createDirect = useAppStore(state => state.createDirectConversation);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [openingId, setOpeningId] = useState('');
  const contacts = useMemo(() => directory.filter(user => {
    if (user.id === session?.user.id) return false;
    const keyword = query.trim().toLowerCase();
    return !keyword || [user.name, user.department, user.title].filter(Boolean).join(' ').toLowerCase().includes(keyword);
  }), [directory, query, session?.user.id]);
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}><View><Text style={styles.eyebrow}>DANH BẠ NỘI BỘ</Text><Text style={styles.title}>{session?.tenant?.name || 'Công ty của bạn'}</Text></View><Pressable onPress={() => navigation.navigate('NewGroup')} style={styles.groupButton}><UsersRound color="#fff" size={19} /><Text style={styles.groupButtonText}>Tạo nhóm</Text></Pressable></View>
      <View style={styles.tenantCard}><View style={styles.tenantIcon}><Building2 color={colors.accent} size={22} /></View><View style={{ flex: 1 }}><Text style={styles.tenantTitle}>{contacts.length} đồng nghiệp</Text><Text style={styles.tenantHint}>Chỉ hiển thị nhân viên đang hoạt động trong đúng công ty.</Text></View><Check color={colors.online} size={20} /></View>
      <View style={styles.search}><SearchField value={query} onChangeText={setQuery} placeholder="Tên, phòng ban, chức vụ" /></View>
      <FlatList
        data={contacts}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); try { await refreshData(); } finally { setRefreshing(false); } }} tintColor={colors.accent} />}
        contentContainerStyle={contacts.length ? styles.list : styles.emptyList}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('UserProfile', { user: item })} style={({ pressed }) => [styles.row, pressed && { opacity: 0.65 }]}>
            <Avatar name={item.name} uri={item.avatar} size={48} online={item.online} />
            <View style={styles.rowBody}><Text numberOfLines={1} style={styles.name}>{item.name}</Text><Text numberOfLines={1} style={styles.meta}>{[item.title, item.department].filter(Boolean).join(' · ') || 'Nhân viên công ty'}</Text></View>
            <Pressable disabled={openingId === item.id} onPress={async event => { event.stopPropagation(); setOpeningId(item.id); try { const conversation = await createDirect(item); navigation.navigate('ChatDetail', { conversationId: conversation.id }); } finally { setOpeningId(''); } }} style={styles.chatButton}><MessageSquarePlus color={colors.accent} size={20} /></Pressable>
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState icon={UserRoundSearch} title="Không tìm thấy nhân viên" description="Danh bạ chỉ lấy nhân viên active từ UpGO Account của công ty hiện tại." />}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { ...typography.caption, color: colors.accentDeep, letterSpacing: 1 },
  title: { ...typography.heading, color: colors.ink, marginTop: 3, maxWidth: 230 },
  groupButton: { minHeight: 42, paddingHorizontal: 13, borderRadius: 15, backgroundColor: colors.ink, flexDirection: 'row', alignItems: 'center', gap: 7 },
  groupButtonText: { ...typography.caption, color: '#fff' },
  tenantCard: { marginHorizontal: 20, backgroundColor: colors.paper, borderRadius: 19, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11, ...shadow },
  tenantIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.accentWash, alignItems: 'center', justifyContent: 'center' },
  tenantTitle: { ...typography.bodyMedium, color: colors.ink },
  tenantHint: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  search: { paddingHorizontal: 20, paddingVertical: 14 },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowBody: { flex: 1, minWidth: 0 },
  name: { ...typography.bodyMedium, color: colors.ink },
  meta: { ...typography.caption, color: colors.inkSoft, marginTop: 3 },
  chatButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.accentWash, alignItems: 'center', justifyContent: 'center' },
});
