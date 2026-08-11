import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyRound, LockKeyhole, Power, X } from 'lucide-react-native';
import { useAppLockStore } from '../store/appLockStore';
import { colors, shadow } from '../theme/colors';
import { typography } from '../theme/typography';

type Mode = 'overview' | 'create' | 'change' | 'disable';

export function PinSettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const configured = useAppLockStore(state => state.configured);
  const setPin = useAppLockStore(state => state.setPin);
  const changePin = useAppLockStore(state => state.changePin);
  const disablePin = useAppLockStore(state => state.disablePin);
  const [mode, setMode] = useState<Mode>('overview');
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMode(configured ? 'overview' : 'create');
    setCurrentPin(''); setNextPin(''); setConfirmPin(''); setError(''); setBusy(false);
  }, [configured, visible]);

  const title = useMemo(() => ({
    overview: 'Khóa ứng dụng',
    create: 'Tạo mã PIN',
    change: 'Đổi mã PIN',
    disable: 'Tắt mã PIN',
  }[mode]), [mode]);

  const submit = async () => {
    setError('');
    if (mode !== 'disable' && !/^\d{4}$/.test(nextPin)) { setError('Mã PIN mới phải gồm đúng 4 chữ số.'); return; }
    if (mode !== 'disable' && nextPin !== confirmPin) { setError('Hai lần nhập mã PIN chưa khớp.'); return; }
    setBusy(true);
    try {
      if (mode === 'create') await setPin(nextPin);
      if (mode === 'change' && !(await changePin(currentPin, nextPin))) { setError('Mã PIN hiện tại không đúng.'); return; }
      if (mode === 'disable' && !(await disablePin(currentPin))) { setError('Mã PIN hiện tại không đúng.'); return; }
      onClose();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Không cập nhật được mã PIN.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}><View><Text style={styles.eyebrow}>BẢO MẬT THIẾT BỊ</Text><Text style={styles.title}>{title}</Text></View><Pressable onPress={onClose} style={styles.close}><X color={colors.inkSoft} size={21} /></Pressable></View>
          {mode === 'overview' ? (
            <View style={styles.options}>
              <Pressable onPress={() => setMode('change')} style={styles.option}><View style={styles.optionIcon}><KeyRound color={colors.accent} size={21} /></View><View style={styles.optionBody}><Text style={styles.optionTitle}>Đổi mã PIN</Text><Text style={styles.optionText}>Xác nhận mã hiện tại rồi đặt mã mới.</Text></View></Pressable>
              <Pressable onPress={() => setMode('disable')} style={styles.option}><View style={[styles.optionIcon, styles.dangerIcon]}><Power color={colors.danger} size={21} /></View><View style={styles.optionBody}><Text style={[styles.optionTitle, { color: colors.danger }]}>Tắt khóa ứng dụng</Text><Text style={styles.optionText}>App sẽ mở thẳng vào tin nhắn trên thiết bị này.</Text></View></Pressable>
            </View>
          ) : (
            <View>
              <View style={styles.hero}><LockKeyhole color={colors.accent} size={24} /><Text style={styles.heroText}>{mode === 'disable' ? 'Nhập mã PIN hiện tại để xác nhận tắt khóa.' : 'Mã PIN chỉ được lưu mã hóa trên thiết bị này.'}</Text></View>
              {mode !== 'create' ? <PinInput label="Mã PIN hiện tại" value={currentPin} onChangeText={setCurrentPin} /> : null}
              {mode !== 'disable' ? <><PinInput label="Mã PIN mới" value={nextPin} onChangeText={setNextPin} /><PinInput label="Nhập lại mã PIN mới" value={confirmPin} onChangeText={setConfirmPin} /></> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable disabled={busy} onPress={() => void submit()} style={[styles.submit, mode === 'disable' && styles.submitDanger, busy && { opacity: 0.55 }]}><Text style={styles.submitText}>{busy ? 'Đang lưu...' : mode === 'disable' ? 'Tắt mã PIN' : mode === 'change' ? 'Đổi mã PIN' : 'Bật khóa ứng dụng'}</Text></Pressable>
              {configured ? <Pressable onPress={() => setMode('overview')} style={styles.back}><Text style={styles.backText}>Quay lại</Text></Pressable> : null}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PinInput({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={value => onChangeText(value.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4} placeholder="••••" placeholderTextColor={colors.muted} style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(12,20,27,0.48)' },
  sheet: { backgroundColor: colors.canvas, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30, ...shadow },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#CFC8BE', alignSelf: 'center', marginBottom: 15 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  eyebrow: { ...typography.caption, color: colors.accentDeep, letterSpacing: 0.9 },
  title: { ...typography.heading, color: colors.ink, marginTop: 3 },
  close: { width: 40, height: 40, borderRadius: 15, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  options: { gap: 11 },
  option: { minHeight: 82, borderRadius: 20, backgroundColor: colors.paper, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14 },
  optionIcon: { width: 45, height: 45, borderRadius: 16, backgroundColor: colors.accentWash, alignItems: 'center', justifyContent: 'center' },
  dangerIcon: { backgroundColor: '#FDECEC' },
  optionBody: { flex: 1 },
  optionTitle: { ...typography.bodyMedium, color: colors.ink },
  optionText: { ...typography.caption, color: colors.inkSoft, marginTop: 3 },
  hero: { borderRadius: 18, padding: 13, backgroundColor: colors.accentWash, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  heroText: { ...typography.caption, color: colors.accentDeep, flex: 1 },
  field: { marginTop: 12 },
  label: { ...typography.caption, color: colors.inkSoft, marginBottom: 6 },
  input: { height: 54, borderRadius: 17, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 17, color: colors.ink, fontFamily: 'BeVietnamPro_700Bold', fontSize: 20, letterSpacing: 8 },
  error: { ...typography.caption, color: colors.danger, marginTop: 11 },
  submit: { height: 52, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  submitDanger: { backgroundColor: colors.danger },
  submitText: { ...typography.bodyMedium, color: '#fff' },
  back: { alignItems: 'center', padding: 13 },
  backText: { ...typography.bodyMedium, color: colors.inkSoft },
});
