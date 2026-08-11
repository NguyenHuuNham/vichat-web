import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Delete, LockKeyhole } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { GonLogo } from './GonLogo';
import { useAppLockStore } from '../store/appLockStore';
import { useAppStore } from '../store/appStore';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'delete'];

export function AppLockScreen() {
  const unlock = useAppLockStore(state => state.unlock);
  const resetPin = useAppLockStore(state => state.resetPin);
  const logout = useAppStore(state => state.logout);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (pin.length !== 4 || busy) return;
    setBusy(true);
    void unlock(pin).then(valid => {
      if (valid) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError('Mã PIN không đúng. Vui lòng thử lại.');
      setPin('');
    }).finally(() => setBusy(false));
  }, [busy, pin, unlock]);

  const pressKey = (key: string) => {
    if (busy || !key) return;
    setError('');
    void Haptics.selectionAsync();
    setPin(current => key === 'delete' ? current.slice(0, -1) : `${current}${key}`.slice(0, 4));
  };

  const forgotPin = () => Alert.alert(
    'Quên mã PIN?',
    'Bạn cần đăng nhập lại UpGO Account để đặt mã PIN mới trên thiết bị này.',
    [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất & đặt lại',
        style: 'destructive',
        onPress: () => void resetPin().then(() => logout()).catch(() => {}),
      },
    ],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.brandMark}><GonLogo size={52} /></View>
      <Text style={styles.brand}>GON PLATFORM</Text>
      <View style={styles.lockIcon}><LockKeyhole color={colors.accent} size={25} /></View>
      <Text style={styles.title}>Mở khóa ViChat</Text>
      <Text style={styles.subtitle}>Nhập mã PIN 4 số để xem tin nhắn</Text>
      <View style={styles.dots}>
        {[0, 1, 2, 3].map(index => <View key={index} style={[styles.dot, pin.length > index && styles.dotFilled]} />)}
      </View>
      <Text style={styles.error}>{error || ' '}</Text>
      <View style={styles.keypad}>
        {KEYS.map((key, index) => key ? (
          <Pressable key={key} onPress={() => pressKey(key)} style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}>
            {key === 'delete' ? <Delete color={colors.inkSoft} size={24} /> : <Text style={styles.keyText}>{key}</Text>}
          </Pressable>
        ) : <View key={`empty-${index}`} style={styles.keyEmpty} />)}
      </View>
      <Pressable onPress={forgotPin} style={styles.forgot}><Text style={styles.forgotText}>Quên mã PIN?</Text></Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, backgroundColor: colors.canvas, alignItems: 'center', paddingHorizontal: 28 },
  brandMark: { width: 70, height: 70, borderRadius: 23, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', marginTop: 36 },
  brand: { ...typography.caption, color: colors.ink, letterSpacing: 1.6, marginTop: 12 },
  lockIcon: { width: 50, height: 50, borderRadius: 18, backgroundColor: colors.accentWash, alignItems: 'center', justifyContent: 'center', marginTop: 30 },
  title: { ...typography.heading, color: colors.ink, marginTop: 14 },
  subtitle: { ...typography.body, color: colors.inkSoft, marginTop: 5, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 15, marginTop: 26 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.muted, backgroundColor: colors.paper },
  dotFilled: { borderColor: colors.accent, backgroundColor: colors.accent },
  error: { ...typography.caption, color: colors.danger, minHeight: 18, marginTop: 13 },
  keypad: { width: 282, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 13, marginTop: 8 },
  key: { width: 78, height: 62, borderRadius: 22, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  keyPressed: { backgroundColor: colors.accentWash, borderColor: '#F7B39C', transform: [{ scale: 0.97 }] },
  keyEmpty: { width: 78, height: 62 },
  keyText: { ...typography.heading, color: colors.ink, fontSize: 24 },
  forgot: { paddingHorizontal: 20, paddingVertical: 14, marginTop: 5 },
  forgotText: { ...typography.bodyMedium, color: colors.accentDeep },
});
