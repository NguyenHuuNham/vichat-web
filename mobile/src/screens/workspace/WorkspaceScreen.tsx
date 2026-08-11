import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Blocks, ChevronRight, ClipboardCheck, FileText, ListTodo, Megaphone, TicketCheck } from 'lucide-react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { colors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { SearchField } from '../../components/SearchField';
import { EmptyState } from '../../components/EmptyState';
import { WorkspaceItem } from '../../types';
import { STATUS_LABELS, WORKSPACE_TYPES } from '../../services/workspaceService';
import { formatWorkspaceDate } from '../../utils/timeFormatting';

type Props = BottomTabScreenProps<MainTabParamList, 'Workspace'> & { navigation: any };
const icons: Record<string, any> = { TASK: ListTodo, ANNOUNCEMENT: Megaphone, APPROVAL: ClipboardCheck, TICKET: TicketCheck, WIKI: FileText, EVENT: Blocks, INTEGRATION: Blocks };

function WorkspaceCard({ item, onPress }: { item: WorkspaceItem; onPress: () => void }) {
  const Icon = icons[item.type] || Blocks;
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}><View style={[styles.itemIcon, { backgroundColor: item.priority === 'URGENT' ? '#FDECEC' : colors.accentWash }]}><Icon color={item.priority === 'URGENT' ? colors.danger : colors.accent} size={20} /></View><View style={styles.cardBody}><View style={styles.cardTop}><Text numberOfLines={1} style={styles.cardTitle}>{item.title}</Text><Text style={styles.status}>{STATUS_LABELS[item.status] || item.status}</Text></View><Text numberOfLines={2} style={styles.description}>{item.description || 'Không có mô tả'}</Text><Text style={styles.date}>{formatWorkspaceDate(item.dueAt || item.updatedAt)}</Text></View><ChevronRight color={colors.line} size={18} /></Pressable>;
}

export function WorkspaceScreen({ navigation }: Props) {
  const items = useAppStore(state => state.workspaceItems);
  const refreshData = useAppStore(state => state.refreshData);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const filtered = useMemo(() => items.filter(item => (!type || item.type === type) && (!query || `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase()))), [items, query, type]);
  return <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}><View style={styles.header}><View><Text style={styles.eyebrow}>ENTERPRISE</Text><Text style={styles.title}>Workspace</Text></View><View style={styles.headerIcon}><Blocks color={colors.accent} size={23} /></View></View><View style={styles.search}><SearchField value={query} onChangeText={setQuery} placeholder="Tìm công việc, thông báo..." /></View><FlatList horizontal showsHorizontalScrollIndicator={false} data={[{ value: '', label: 'Tất cả' }, ...WORKSPACE_TYPES]} keyExtractor={item => item.value} contentContainerStyle={styles.filters} renderItem={({ item }) => <Pressable onPress={() => setType(item.value)} style={[styles.filter, type === item.value && styles.filterActive]}><Text style={[styles.filterText, type === item.value && styles.filterTextActive]}>{item.label}</Text></Pressable>} /><FlatList data={filtered} keyExtractor={item => item.id} renderItem={({ item }) => <WorkspaceCard item={item} onPress={() => navigation.navigate('WorkspaceDetail', { item })} />} contentContainerStyle={filtered.length ? styles.list : styles.emptyList} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); try { await refreshData(); } finally { setRefreshing(false); } }} tintColor={colors.accent} />} ListEmptyComponent={<EmptyState icon={Blocks} title="Workspace đang trống" description="Các công việc, thông báo và yêu cầu của công ty sẽ xuất hiện ở đây." />} showsVerticalScrollIndicator={false} /></SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { ...typography.caption, color: colors.accentDeep, letterSpacing: 1 },
  title: { ...typography.heading, color: colors.ink, marginTop: 3 },
  headerIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accentWash, alignItems: 'center', justifyContent: 'center' },
  search: { paddingHorizontal: 20, paddingBottom: 2 },
  filters: { paddingHorizontal: 20, paddingVertical: 12, gap: 7 },
  filter: { borderRadius: 15, paddingHorizontal: 13, paddingVertical: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  filterActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { ...typography.caption, color: colors.inkSoft },
  filterTextActive: { color: '#fff' },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 },
  card: { minHeight: 92, borderRadius: 19, backgroundColor: colors.paper, padding: 13, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 11, ...shadow },
  itemIcon: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, minWidth: 0 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { ...typography.bodyMedium, color: colors.ink, flex: 1 },
  status: { ...typography.caption, color: colors.accentDeep },
  description: { ...typography.caption, color: colors.inkSoft, marginTop: 4 },
  date: { ...typography.caption, color: colors.muted, marginTop: 5 },
});
