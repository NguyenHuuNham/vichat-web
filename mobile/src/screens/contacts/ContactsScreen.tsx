import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, MessageSquarePlus, Search, UserRoundSearch, UsersRound, X } from 'lucide-react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { colors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import { SearchField } from '../../components/SearchField';
import { EmptyState } from '../../components/EmptyState';
import { User } from '../../types';

type Props = BottomTabScreenProps<MainTabParamList, 'Contacts'> & { navigation: any };

export function ContactsScreen({ navigation }: Props) {
  const session = useAppStore(state => state.session);
  const directory = useAppStore(state => state.directory);
  const refreshData = useAppStore(state => state.refreshData);
  const createDirect = useAppStore(state => state.createDirectConversation);
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openingId, setOpeningId] = useState('');

  const contacts = useMemo(() => directory.filter(user => {
    if (user.id === session?.user.id) return false;
    const keyword = query.trim().toLowerCase();
    return !keyword || [user.name, user.department, user.title].filter(Boolean).join(' ').toLowerCase().includes(keyword);
  }), [directory, query, session?.user.id]);

  const sections = useMemo(() => {
    const grouped = contacts.reduce<Record<string, User[]>>((result, user) => {
      const department = user.department?.trim() || 'Nhân viên';
      (result[department] ||= []).push(user);
      return result;
    }, {});
    return Object.keys(grouped).sort((left, right) => left.localeCompare(right, 'vi')).map(title => ({ title, data: grouped[title] }));
  }, [contacts]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.identity}>
          <Avatar name={session?.user.name} uri={session?.user.avatar} size={46} online />
          <View style={styles.identityText}>
            <Text style={styles.eyebrow}>DANH BẠ NỘI BỘ</Text>
            <Text style={styles.title}>Danh bạ</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable accessibilityLabel={showSearch ? 'Đóng tìm kiếm' : 'Tìm kiếm liên hệ'} onPress={() => setShowSearch(value => !value)} style={styles.iconButton}>
            {showSearch ? <X color={colors.ink} size={21} /> : <Search color={colors.ink} size={21} />}
          </Pressable>
          <Pressable accessibilityLabel="Tạo nhóm mới" onPress={() => navigation.navigate('NewGroup')} style={[styles.iconButton, styles.groupButton]}>
            <UsersRound color="#fff" size={20} />
          </Pressable>
        </View>
      </View>

      {showSearch ? <View style={styles.search}><SearchField value={query} onChangeText={setQuery} placeholder="Tên, phòng ban, chức vụ" /></View> : null}

      <View style={styles.summary}>
        <View><Text style={styles.summaryTitle}>{contacts.length} đồng nghiệp</Text><Text style={styles.summaryHint}>{session?.tenant?.name || 'Công ty của bạn'} · nhân viên đang hoạt động</Text></View>
        <View style={styles.summaryStatus}><Check color={colors.online} size={16} /><Text style={styles.summaryStatusText}>Đồng bộ</Text></View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        renderSectionHeader={({ section }) => <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{section.title}</Text><View style={styles.sectionLine} /></View>}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('UserProfile', { user: item })} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            <Avatar name={item.name} uri={item.avatar} size={52} online={item.online} />
            <View style={styles.rowBody}><Text numberOfLines={1} style={styles.name}>{item.name}</Text><Text numberOfLines={1} style={styles.meta}>{item.title || 'Nhân viên công ty'}</Text></View>
            <Pressable disabled={openingId === item.id} accessibilityLabel={`Nhắn tin với ${item.name}`} onPress={async event => { event.stopPropagation(); setOpeningId(item.id); try { const conversation = await createDirect(item); navigation.navigate('ChatDetail', { conversationId: conversation.id }); } finally { setOpeningId(''); } }} style={styles.chatButton}><MessageSquarePlus color={colors.accent} size={21} /></Pressable>
          </Pressable>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); try { await refreshData(); } finally { setRefreshing(false); } }} tintColor={colors.accent} />}
        contentContainerStyle={contacts.length ? styles.list : styles.emptyList}
        ListEmptyComponent={<EmptyState icon={UserRoundSearch} title="Không tìm thấy nhân viên" description="Danh bạ chỉ lấy nhân viên active từ UpGO Account của công ty hiện tại." />}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  identity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  identityText: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.caption, color: colors.inkSoft, letterSpacing: 0.8 },
  title: { ...typography.display, color: colors.ink, fontSize: 27, lineHeight: 33, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', ...shadow },
  groupButton: { backgroundColor: colors.accent, borderColor: colors.accent },
  search: { paddingHorizontal: 20, paddingBottom: 12 },
  summary: { marginHorizontal: 20, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 17, backgroundColor: colors.accentWash, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryTitle: { ...typography.bodyMedium, color: colors.ink },
  summaryHint: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  summaryStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summaryStatusText: { ...typography.caption, color: colors.online },
  list: { paddingHorizontal: 20, paddingBottom: 130 },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 110 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 14, paddingBottom: 9 },
  sectionTitle: { ...typography.caption, color: colors.accentDeep, letterSpacing: 1, textTransform: 'uppercase' },
  sectionLine: { height: 1, flex: 1, backgroundColor: colors.line },
  row: { minHeight: 76, marginBottom: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, ...shadow },
  rowPressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  rowBody: { flex: 1, minWidth: 0 },
  name: { ...typography.title, color: colors.ink },
  meta: { ...typography.caption, color: colors.inkSoft, marginTop: 3 },
  chatButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.accentWash, alignItems: 'center', justifyContent: 'center' },
});
