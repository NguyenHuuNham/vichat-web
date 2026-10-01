import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Delete, LockKeyhole } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { GonLogo } from './GonLogo';
import { useAppLockStore } from '../store/appLockStore';
import { useAppStore } from '../store/appStore';
import { colorsForTheme, ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { config } from '../constants/config';
import { ConfirmDialog } from './ConfirmDialog';
import { useThemeStore } from '../store/themeStore';
import { useI18n } from '../store/languageStore';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'delete'];

export function AppLockScreen() {
  const palette = colorsForTheme(useThemeStore(state => state.resolved));
  const styles = createStyles(palette);
  const { t } = useI18n();
  const unlock = useAppLockStore(state => state.unlock);
  const resetPin = useAppLockStore(state => state.resetPin);
  const logout = useAppStore(state => state.logout);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    if (pin.length !== 4 || busy) return;
    setBusy(true);
    void unlock(pin).then(valid => {
      if (valid) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(t('Mã PIN không đúng. Vui lòng thử lại.'));
      setPin('');
    }).finally(() => setBusy(false));
  }, [busy, pin, unlock]);

  const pressKey = (key: string) => {
    if (busy || !key) return;
    setError('');
    void Haptics.selectionAsync();
    setPin(current => key === 'delete' ? current.slice(0, -1) : `${current}${key}`.slice(0, 4));
  };

  const forgotPin = () => setForgotOpen(true);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.brandMark}><GonLogo size={52} /></View>
      <Text style={styles.brand}>{config.brandLabel}</Text>
      <View style={styles.lockIcon}><LockKeyhole color={palette.accent} size={25} /></View>
      <Text style={styles.title}>{t('Mở khóa ViChat')}</Text>
      <Text style={styles.subtitle}>{t('Nhập mã PIN 4 số để xem tin nhắn')}</Text>
      <View style={styles.dots}>
        {[0, 1, 2, 3].map(index => <View key={index} style={[styles.dot, pin.length > index && styles.dotFilled]} />)}
      </View>
      <Text style={styles.error}>{error || ' '}</Text>
      <View style={styles.keypad}>
        {KEYS.map((key, index) => key ? (
          <Pressable key={key} onPress={() => pressKey(key)} style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}>
            {key === 'delete' ? <Delete color={palette.inkSoft} size={24} /> : <Text style={styles.keyText}>{key}</Text>}
          </Pressable>
        ) : <View key={`empty-${index}`} style={styles.keyEmpty} />)}
      </View>
      <Pressable onPress={forgotPin} style={styles.forgot}><Text style={styles.forgotText}>{t('Quên mã PIN?')}</Text></Pressable>
      <ConfirmDialog
        visible={forgotOpen}
        title={t('Quên mã PIN?')}
        message={t('Bạn cần đăng nhập lại UpGO Account để đặt mã PIN mới trên thiết bị này.')}
        eyebrow={t('BẢO MẬT THIẾT BỊ')}
        confirmLabel={t('Đăng xuất & đặt lại')}
        tone="danger"
        onCancel={() => setForgotOpen(false)}
        onConfirm={() => void resetPin().then(() => logout()).catch(() => {}).finally(() => setForgotOpen(false))}
      />
    </SafeAreaView>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    screen: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, backgroundColor: palette.canvas, alignItems: 'center', paddingHorizontal: 28 },
    brandMark: { width: 70, height: 70, borderRadius: 23, backgroundColor: palette.paper, alignItems: 'center', justifyContent: 'center', marginTop: 36 },
    brand: { ...typography.caption, color: palette.ink, letterSpacing: 1.6, marginTop: 12 },
    lockIcon: { width: 50, height: 50, borderRadius: 18, backgroundColor: palette.accentWash, alignItems: 'center', justifyContent: 'center', marginTop: 30 },
    title: { ...typography.heading, color: palette.ink, marginTop: 14 },
    subtitle: { ...typography.body, color: palette.inkSoft, marginTop: 5, textAlign: 'center' },
    dots: { flexDirection: 'row', gap: 15, marginTop: 26 },
    dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: palette.muted, backgroundColor: palette.paper },
    dotFilled: { borderColor: palette.accent, backgroundColor: palette.accent },
    error: { ...typography.caption, color: palette.danger, minHeight: 18, marginTop: 13 },
    keypad: { width: 282, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 13, marginTop: 8 },
    key: { width: 78, height: 62, borderRadius: 22, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
    keyPressed: { backgroundColor: palette.accentWash, borderColor: palette.accent, transform: [{ scale: 0.97 }] },
    keyEmpty: { width: 78, height: 62 },
    keyText: { ...typography.heading, color: palette.ink, fontSize: 24 },
    forgot: { paddingHorizontal: 20, paddingVertical: 14, marginTop: 5 },
    forgotText: { ...typography.bodyMedium, color: palette.accentDeep },
  });
}
