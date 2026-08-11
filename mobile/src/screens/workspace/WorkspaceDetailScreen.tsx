import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CalendarClock, CheckCircle2, CircleDot, Flag, UsersRound } from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { colors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { STATUS_LABELS } from '../../services/workspaceService';
import { formatWorkspaceDate } from '../../utils/timeFormatting';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkspaceDetail'>;

export function WorkspaceDetailScreen({ route }: Props) {
  const applyAction = useAppStore(state => state.applyWorkspaceAction);
  const [busy, setBusy] = useState(false);
  const [item, setItem] = useState(route.params.item);
  const action = async (value: string) => {
    setBusy(true);
    try { await applyAction(item.id, value); setItem(current => ({ ...current, status: value === 'complete' ? 'DONE' : current.status })); } catch (error) { Alert.alert('Không thể thực hiện', error instanceof Error ? error.message : 'Thử lại sau.'); } finally { setBusy(false); }
  };
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}><View style={styles.badge}><CircleDot color={colors.accent} size={16} /><Text style={styles.badgeText}>{item.type}</Text><Text style={styles.status}>{STATUS_LABELS[item.status] || item.status}</Text></View><Text style={styles.title}>{item.title}</Text><Text style={styles.description}>{item.description || 'Không có mô tả cho mục này.'}</Text><View style={styles.card}><View style={styles.info}><Flag color={colors.accent} size={19} /><View><Text style={styles.label}>Mức ưu tiên</Text><Text style={styles.value}>{item.priority}</Text></View></View><View style={styles.divider} /><View style={styles.info}><CalendarClock color={colors.accent} size={19} /><View><Text style={styles.label}>Hạn / cập nhật</Text><Text style={styles.value}>{formatWorkspaceDate(item.dueAt || item.updatedAt)}</Text></View></View><View style={styles.divider} /><View style={styles.info}><UsersRound color={colors.accent} size={19} /><View><Text style={styles.label}>Hiển thị</Text><Text style={styles.value}>{item.visibility === 'COMPANY' ? 'Toàn công ty' : 'Theo phân quyền'}</Text></View></View></View>{item.allowedActions.length ? <><Text style={styles.section}>Thao tác</Text><View style={styles.actions}>{item.allowedActions.map(value => <Pressable key={value} onPress={() => void action(value)} disabled={busy} style={[styles.action, value.toLowerCase().includes('reject') && styles.actionDanger, busy && { opacity: 0.55 }]}><CheckCircle2 color={value.toLowerCase().includes('reject') ? colors.danger : colors.accent} size={18} /><Text style={[styles.actionText, value.toLowerCase().includes('reject') && { color: colors.danger }]}>{value}</Text></Pressable>)}</View></> : <Text style={styles.noAction}>Mục này hiện không có thao tác dành cho bạn.</Text>}</ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 22, paddingBottom: 42 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  badgeText: { ...typography.caption, color: colors.accentDeep, letterSpacing: 0.7 },
  status: { ...typography.caption, color: colors.inkSoft, marginLeft: 'auto' },
  title: { ...typography.display, fontSize: 28, color: colors.ink, marginTop: 15 },
  description: { ...typography.body, color: colors.inkSoft, marginTop: 10 },
  card: { backgroundColor: colors.paper, borderRadius: 21, padding: 17, marginTop: 25, ...shadow },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { ...typography.caption, color: colors.muted },
  value: { ...typography.bodyMedium, color: colors.ink, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 15 },
  section: { ...typography.title, color: colors.ink, marginTop: 27, marginBottom: 10 },
  actions: { gap: 9 },
  action: { minHeight: 50, borderRadius: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 15 },
  actionDanger: { borderColor: '#F5C5C5', backgroundColor: '#FFF8F8' },
  actionText: { ...typography.bodyMedium, color: colors.ink },
  noAction: { ...typography.body, color: colors.muted, marginTop: 26, textAlign: 'center' },
});
