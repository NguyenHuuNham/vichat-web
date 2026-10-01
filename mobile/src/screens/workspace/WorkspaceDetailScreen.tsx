import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CalendarClock, CheckCircle2, CircleDot, Flag, UsersRound } from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { ThemeColors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { useThemePalette } from '../../theme/useThemePalette';
import { STATUS_LABELS } from '../../services/workspaceService';
import { formatWorkspaceDate } from '../../utils/timeFormatting';
import { useI18n } from '../../store/languageStore';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkspaceDetail'>;

export function WorkspaceDetailScreen({ route }: Props) {
  const palette = useThemePalette();
  const styles = createStyles(palette);
  const { t } = useI18n();
  const applyAction = useAppStore(state => state.applyWorkspaceAction);
  const [busy, setBusy] = useState(false);
  const [item, setItem] = useState(route.params.item);
  const action = async (value: string) => {
    setBusy(true);
    try { await applyAction(item.id, value); setItem(current => ({ ...current, status: value === 'complete' ? 'DONE' : current.status })); } catch (error) { Alert.alert(t('Không thể thực hiện'), error instanceof Error ? t(error.message) : t('Thử lại sau.')); } finally { setBusy(false); }
  };
  return <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}><ScrollView contentContainerStyle={styles.content}><View style={styles.badge}><CircleDot color={palette.accent} size={16} /><Text style={styles.badgeText}>{item.type}</Text><Text style={styles.status}>{t(STATUS_LABELS[item.status] || item.status)}</Text></View><Text style={styles.title}>{item.title}</Text><Text style={styles.description}>{item.description || t('Không có mô tả cho mục này.')}</Text><View style={styles.card}><View style={styles.info}><Flag color={palette.accent} size={19} /><View><Text style={styles.label}>{t('Mức ưu tiên')}</Text><Text style={styles.value}>{t(item.priority)}</Text></View></View><View style={styles.divider} /><View style={styles.info}><CalendarClock color={palette.accent} size={19} /><View><Text style={styles.label}>{t('Hạn / cập nhật')}</Text><Text style={styles.value}>{formatWorkspaceDate(item.dueAt || item.updatedAt)}</Text></View></View><View style={styles.divider} /><View style={styles.info}><UsersRound color={palette.accent} size={19} /><View><Text style={styles.label}>{t('Hiển thị')}</Text><Text style={styles.value}>{t(item.visibility === 'COMPANY' ? 'Toàn công ty' : 'Theo phân quyền')}</Text></View></View></View>{item.allowedActions.length ? <><Text style={styles.section}>{t('Thao tác')}</Text><View style={styles.actions}>{item.allowedActions.map(value => <Pressable key={value} onPress={() => void action(value)} disabled={busy} style={[styles.action, value.toLowerCase().includes('reject') && styles.actionDanger, busy && { opacity: 0.55 }]}><CheckCircle2 color={value.toLowerCase().includes('reject') ? palette.danger : palette.accent} size={18} /><Text style={[styles.actionText, value.toLowerCase().includes('reject') && { color: palette.danger }]}>{t(value)}</Text></Pressable>)}</View></> : <Text style={styles.noAction}>{t('Mục này hiện không có thao tác dành cho bạn.')}</Text>}</ScrollView></SafeAreaView>;
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  content: { padding: 22, paddingBottom: 42 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  badgeText: { ...typography.caption, color: palette.accentDeep, letterSpacing: 0.7 },
  status: { ...typography.caption, color: palette.inkSoft, marginLeft: 'auto' },
  title: { ...typography.display, fontSize: 28, color: palette.ink, marginTop: 15 },
  description: { ...typography.body, color: palette.inkSoft, marginTop: 10 },
  card: { backgroundColor: palette.paper, borderRadius: 21, padding: 17, marginTop: 25, ...shadow },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { ...typography.caption, color: palette.muted },
  value: { ...typography.bodyMedium, color: palette.ink, marginTop: 2 },
  divider: { height: 1, backgroundColor: palette.line, marginVertical: 15 },
  section: { ...typography.title, color: palette.ink, marginTop: 27, marginBottom: 10 },
  actions: { gap: 9 },
  action: { minHeight: 50, borderRadius: 16, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 15 },
  actionDanger: { borderColor: `${palette.danger}55`, backgroundColor: `${palette.danger}12` },
  actionText: { ...typography.bodyMedium, color: palette.ink },
  noAction: { ...typography.body, color: palette.muted, marginTop: 26, textAlign: 'center' },
  });
}
