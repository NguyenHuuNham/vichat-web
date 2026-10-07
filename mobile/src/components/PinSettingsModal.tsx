import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyRound, Power, X } from 'lucide-react-native';
import { useAppLockStore } from '../store/appLockStore';
import { colorsForTheme, shadow, ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { useThemeStore } from '../store/themeStore';
import { useI18n } from '../store/languageStore';

type Mode = 'overview' | 'create' | 'change' | 'disable';

export function PinSettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const palette = colorsForTheme(useThemeStore(state => state.resolved));
  const styles = createStyles(palette);
  const { t } = useI18n();
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
    overview: t('Khóa ứng dụng'),
    create: t('Tạo mã PIN'),
    change: t('Đổi mã PIN'),
    disable: t('Tắt mã PIN'),
  }[mode]), [mode, t]);

  const submit = async () => {
    setError('');
    if (mode !== 'disable' && !/^\d{4}$/.test(nextPin)) { setError(t('Mã PIN mới phải gồm đúng 4 chữ số.')); return; }
    if (mode !== 'disable' && nextPin !== confirmPin) { setError(t('Hai lần nhập mã PIN chưa khớp.')); return; }
    setBusy(true);
    try {
      if (mode === 'create') await setPin(nextPin);
      if (mode === 'change' && !(await changePin(currentPin, nextPin))) { setError(t('Mã PIN hiện tại không đúng.')); return; }
      if (mode === 'disable' && !(await disablePin(currentPin))) { setError(t('Mã PIN hiện tại không đúng.')); return; }
      onClose();
    } catch (value) {
      setError(value instanceof Error ? t(value.message) : t('Không cập nhật được mã PIN.'));
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
          <View style={styles.header}><View><Text style={styles.eyebrow}>{t('BẢO MẬT THIẾT BỊ')}</Text><Text style={styles.title}>{title}</Text></View><Pressable onPress={onClose} style={styles.close}><X color={palette.inkSoft} size={21} /></Pressable></View>
          {mode === 'overview' ? (
            <View style={styles.options}>
              <Pressable onPress={() => setMode('change')} style={styles.option}><View style={styles.optionIcon}><KeyRound color={palette.accent} size={21} /></View><View style={styles.optionBody}><Text style={styles.optionTitle}>{t('Đổi mã PIN')}</Text></View></Pressable>
              <Pressable onPress={() => setMode('disable')} style={styles.option}><View style={[styles.optionIcon, styles.dangerIcon]}><Power color={palette.danger} size={21} /></View><View style={styles.optionBody}><Text style={[styles.optionTitle, { color: palette.danger }]}>{t('Tắt khóa ứng dụng')}</Text></View></Pressable>
            </View>
          ) : (
            <View>
              {mode !== 'create' ? <PinInput palette={palette} t={t} label="Mã PIN hiện tại" value={currentPin} onChangeText={setCurrentPin} /> : null}
              {mode !== 'disable' ? <><PinInput palette={palette} t={t} label="Mã PIN mới" value={nextPin} onChangeText={setNextPin} /><PinInput palette={palette} t={t} label="Nhập lại mã PIN mới" value={confirmPin} onChangeText={setConfirmPin} /></> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable disabled={busy} onPress={() => void submit()} style={[styles.submit, mode === 'disable' && styles.submitDanger, busy && { opacity: 0.55 }]}><Text style={styles.submitText}>{busy ? t('Đang lưu...') : mode === 'disable' ? t('Tắt mã PIN') : mode === 'change' ? t('Đổi mã PIN') : t('Bật khóa ứng dụng')}</Text></Pressable>
              {configured ? <Pressable onPress={() => setMode('overview')} style={styles.back}><Text style={styles.backText}>{t('Quay lại')}</Text></Pressable> : null}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PinInput({ palette, t, label, value, onChangeText }: { palette: ThemeColors; t: (value: string) => string; label: string; value: string; onChangeText: (value: string) => void }) {
  const styles = createStyles(palette);
  return <View style={styles.field}><Text style={styles.label}>{t(label)}</Text><TextInput value={value} onChangeText={value => onChangeText(value.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4} placeholder="••••" placeholderTextColor={palette.muted} style={styles.input} /></View>;
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(12,20,27,0.48)' },
    sheet: { backgroundColor: palette.canvas, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30, ...shadow },
    handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: palette.line, alignSelf: 'center', marginBottom: 15 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
    eyebrow: { ...typography.caption, color: palette.accentDeep, letterSpacing: 0.9 },
    title: { ...typography.heading, color: palette.ink, marginTop: 3 },
    close: { width: 40, height: 40, borderRadius: 15, backgroundColor: palette.paper, alignItems: 'center', justifyContent: 'center' },
    options: { gap: 11 },
    option: { minHeight: 82, borderRadius: 20, backgroundColor: palette.paper, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14 },
    optionIcon: { width: 45, height: 45, borderRadius: 16, backgroundColor: palette.accentWash, alignItems: 'center', justifyContent: 'center' },
    dangerIcon: { backgroundColor: `${palette.danger}18` },
    optionBody: { flex: 1 },
    optionTitle: { ...typography.bodyMedium, color: palette.ink },
    field: { marginTop: 12 },
    label: { ...typography.caption, color: palette.inkSoft, marginBottom: 6 },
    input: { height: 54, borderRadius: 17, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 17, color: palette.ink, fontFamily: 'BeVietnamPro_700Bold', fontSize: 20, letterSpacing: 8 },
    error: { ...typography.caption, color: palette.danger, marginTop: 11 },
    submit: { height: 52, borderRadius: 17, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
    submitDanger: { backgroundColor: palette.danger },
    submitText: { ...typography.bodyMedium, color: '#fff' },
    back: { alignItems: 'center', padding: 13 },
    backText: { ...typography.bodyMedium, color: palette.inkSoft },
  });
}
