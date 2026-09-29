import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, ListChecks, X } from 'lucide-react-native';
import { colorsForTheme, shadow } from '../theme/colors';
import { typography } from '../theme/typography';
import { useThemeStore } from '../store/themeStore';

export interface ChoiceDialogOption {
  id: string;
  label: string;
  detail?: string;
}

interface Props {
  visible: boolean;
  title: string;
  message: string;
  options: ChoiceDialogOption[];
  onCancel: () => void;
  onSelect: (option: ChoiceDialogOption) => void;
  busy?: boolean;
}

export function ChoiceDialog({ visible, title, message, options, onCancel, onSelect, busy = false }: Props) {
  const palette = colorsForTheme(useThemeStore(state => state.resolved));
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onCancel} />
        <View style={[styles.card, { backgroundColor: palette.paper, borderColor: palette.line }]}>
          <View style={styles.header}>
            <View style={[styles.icon, { backgroundColor: palette.accentWash }]}><ListChecks color={palette.accent} size={20} /></View>
            <View style={styles.copy}><Text style={[styles.eyebrow, { color: palette.accent }]}>CHỌN THAO TÁC</Text><Text style={[styles.title, { color: palette.ink }]}>{title}</Text></View>
            <Pressable disabled={busy} onPress={onCancel} style={[styles.close, { backgroundColor: palette.accentWash }]}><X color={palette.inkSoft} size={18} /></Pressable>
          </View>
          <Text style={[styles.message, { color: palette.inkSoft }]}>{message}</Text>
          <View style={[styles.options, { borderColor: palette.line }]}>
            {options.map(option => <Pressable key={option.id} disabled={busy} onPress={() => onSelect(option)} style={({ pressed }) => [styles.option, { borderBottomColor: palette.line }, pressed && styles.pressed]}><View style={[styles.optionIcon, { backgroundColor: palette.accentWash }]}><Text style={[styles.optionInitial, { color: palette.accentDeep }]}>{option.label.trim().slice(0, 1).toUpperCase()}</Text></View><View style={styles.optionCopy}><Text numberOfLines={1} style={[styles.optionLabel, { color: palette.ink }]}>{option.label}</Text>{option.detail ? <Text numberOfLines={1} style={[styles.optionDetail, { color: palette.inkSoft }]}>{option.detail}</Text> : null}</View><ChevronRight color={palette.muted} size={18} /></Pressable>)}
          </View>
          <Pressable disabled={busy} onPress={onCancel} style={({ pressed }) => [styles.cancel, { backgroundColor: palette.accentWash }, pressed && styles.pressed]}><Text style={[styles.cancelText, { color: palette.inkSoft }]}>Hủy</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,12,16,0.66)' },
  card: { width: '100%', maxWidth: 520, borderRadius: 24, borderWidth: 1, padding: 18, ...shadow },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.caption, fontSize: 10, fontFamily: 'BeVietnamPro_700Bold' },
  title: { ...typography.title, marginTop: 3 },
  close: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  message: { ...typography.body, marginTop: 15, lineHeight: 21 },
  options: { marginTop: 15, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12 },
  option: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1 },
  optionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  optionInitial: { ...typography.bodyMedium },
  optionCopy: { flex: 1, minWidth: 0 },
  optionLabel: { ...typography.bodyMedium },
  optionDetail: { ...typography.caption, marginTop: 2 },
  cancel: { minHeight: 43, marginTop: 13, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cancelText: { ...typography.bodyMedium },
  pressed: { opacity: 0.65 },
});
