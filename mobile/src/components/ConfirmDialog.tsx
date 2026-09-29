import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { colorsForTheme, shadow } from '../theme/colors';
import { typography } from '../theme/typography';
import { useThemeStore } from '../store/themeStore';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  secondaryLabel?: string;
  eyebrow?: string;
  onCancel: () => void;
  onConfirm: () => void;
  onSecondary?: () => void;
  busy?: boolean;
  tone?: 'default' | 'danger';
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  secondaryLabel,
  eyebrow = 'XÁC NHẬN THAO TÁC',
  onCancel,
  onConfirm,
  onSecondary,
  busy = false,
  tone = 'default',
}: Props) {
  const palette = colorsForTheme(useThemeStore(state => state.resolved));
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onCancel} />
        <View style={[styles.card, { borderColor: palette.line, backgroundColor: palette.paper }]}>
          <View style={styles.heading}>
            <View style={[styles.icon, { backgroundColor: tone === 'danger' ? `${palette.danger}22` : `${palette.accent}22` }]}><AlertTriangle color={tone === 'danger' ? palette.danger : palette.accent} size={20} strokeWidth={2.6} /></View>
            <View style={styles.copy}>
              <Text style={[styles.eyebrow, { color: tone === 'danger' ? palette.danger : palette.accent }]}>{eyebrow}</Text>
              <Text style={[styles.title, { color: palette.ink }]}>{title}</Text>
            </View>
          </View>
          <Text style={[styles.message, { color: palette.inkSoft }]}>{message}</Text>
          <View style={styles.actions}>
            <Pressable disabled={busy} onPress={onCancel} style={({ pressed }) => [styles.button, { backgroundColor: palette.accentWash }, pressed && styles.pressed]}>
              <Text style={[styles.cancelText, { color: palette.inkSoft }]}>Hủy</Text>
            </Pressable>
            {secondaryLabel && onSecondary ? <Pressable disabled={busy} onPress={onSecondary} style={({ pressed }) => [styles.button, { backgroundColor: palette.accentWash }, pressed && styles.pressed]}>
              <Text style={[styles.secondaryText, { color: palette.inkSoft }]}>{secondaryLabel}</Text>
            </Pressable> : null}
            <Pressable disabled={busy} onPress={onConfirm} style={({ pressed }) => [styles.button, { backgroundColor: tone === 'danger' ? palette.danger : palette.accent }, pressed && styles.pressed, busy && styles.disabled]}>
              <Text style={styles.confirmText}>{busy ? 'Đang xử lý...' : confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,12,16,0.66)' },
  card: { width: '100%', maxWidth: 520, borderRadius: 24, borderWidth: 1, padding: 23, ...shadow },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  icon: { width: 47, height: 47, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(244,81,30,0.17)' },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.caption, fontSize: 10, letterSpacing: 0, fontFamily: 'BeVietnamPro_700Bold' },
  title: { ...typography.title, marginTop: 3 },
  message: { ...typography.body, marginTop: 17, lineHeight: 21 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
  button: { minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, flexShrink: 1 },
  secondaryButton: { backgroundColor: '#243139' },
  cancelText: { ...typography.caption, fontFamily: 'BeVietnamPro_700Bold' },
  secondaryText: { ...typography.caption, fontFamily: 'BeVietnamPro_700Bold' },
  confirmText: { ...typography.caption, color: '#fff', fontFamily: 'BeVietnamPro_700Bold' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
});
