import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { colors, shadow } from '../theme/colors';
import { typography } from '../theme/typography';

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
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onCancel} />
        <View style={styles.card}>
          <View style={styles.heading}>
            <View style={styles.icon}><AlertTriangle color={colors.accent} size={20} strokeWidth={2.6} /></View>
            <View style={styles.copy}>
              <Text style={styles.eyebrow}>{eyebrow}</Text>
              <Text style={styles.title}>{title}</Text>
            </View>
          </View>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable disabled={busy} onPress={onCancel} style={({ pressed }) => [styles.button, styles.cancelButton, pressed && styles.pressed]}>
              <Text style={styles.cancelText}>Hủy</Text>
            </Pressable>
            {secondaryLabel && onSecondary ? <Pressable disabled={busy} onPress={onSecondary} style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryText}>{secondaryLabel}</Text>
            </Pressable> : null}
            <Pressable disabled={busy} onPress={onConfirm} style={({ pressed }) => [styles.button, styles.confirmButton, pressed && styles.pressed, busy && styles.disabled]}>
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
  card: { width: '100%', maxWidth: 520, borderRadius: 24, borderWidth: 1, borderColor: '#66727A', backgroundColor: colors.darkPaper, padding: 23, ...shadow },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  icon: { width: 47, height: 47, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(244,81,30,0.17)' },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.caption, color: colors.accent, fontSize: 10, letterSpacing: 0, fontFamily: 'BeVietnamPro_700Bold' },
  title: { ...typography.title, color: '#F7FAFC', marginTop: 3 },
  message: { ...typography.body, color: '#C6D0D5', marginTop: 17, lineHeight: 21 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
  button: { minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, flexShrink: 1 },
  cancelButton: { backgroundColor: '#2B3942' },
  secondaryButton: { backgroundColor: '#243139' },
  confirmButton: { backgroundColor: colors.accent },
  cancelText: { ...typography.caption, color: '#D7E0E4', fontFamily: 'BeVietnamPro_700Bold' },
  secondaryText: { ...typography.caption, color: '#D7E0E4', fontFamily: 'BeVietnamPro_700Bold' },
  confirmText: { ...typography.caption, color: '#fff', fontFamily: 'BeVietnamPro_700Bold' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
});
