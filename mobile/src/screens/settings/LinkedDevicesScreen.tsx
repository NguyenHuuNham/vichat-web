import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Globe2, Monitor, ShieldCheck, Smartphone } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { authService } from '../../services/authService';
import { colorsForTheme, shadow, ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { LinkedDevice } from '../../types';
import { useThemeStore } from '../../store/themeStore';

type Props = NativeStackScreenProps<RootStackParamList, 'LinkedDevices'>;

export function LinkedDevicesScreen({ navigation }: Props) {
  const palette = colorsForTheme(useThemeStore(state => state.resolved));
  const styles = createStyles(palette);
  const session = useAppStore(state => state.session);
  const updateLinkedDevices = useAppStore(state => state.updateLinkedDevices);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      updateLinkedDevices(await authService.listLinkedDevices());
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể tải phiên đăng nhập.');
    } finally {
      setLoading(false);
    }
  }, [updateLinkedDevices]);
  useFocusEffect(useCallback(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => clearInterval(timer);
  }, [refresh]));
  const devices = useMemo(() => session?.linkedDevices || [], [session?.linkedDevices]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Quay lại" onPress={() => navigation.goBack()} style={styles.back}><ChevronLeft color={palette.ink} size={27} /></Pressable>
        <View style={styles.headerTitle}><Text style={styles.eyebrow}>BẢO MẬT</Text><Text style={styles.title}>Thiết bị liên kết</Text></View>
        <ShieldCheck color={palette.online} size={23} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}><Text style={styles.introTitle}>Phiên đăng nhập</Text><Text style={styles.introText}>Theo dõi nơi tài khoản đang được sử dụng trên ViChat.</Text></View>
        {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
        {devices.length ? devices.map(device => <DeviceCard key={device.id} device={device} palette={palette} />) : loading ? <Text style={styles.empty}>Đang tải phiên đăng nhập từ máy chủ...</Text> : !loadError ? <Text style={styles.empty}>Chưa có phiên đăng nhập nào được máy chủ ghi nhận.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function DeviceCard({ device, palette }: { device: LinkedDevice; palette: ThemeColors }) {
  const styles = createStyles(palette);
  const Icon = device.kind === 'web' ? Globe2 : device.kind === 'desktop' ? Monitor : Smartphone;
  return <View style={styles.deviceCard}><View style={styles.deviceIcon}><Icon color={palette.accent} size={22} /></View><View style={styles.deviceBody}><Text numberOfLines={1} style={styles.deviceName}>{device.name}</Text><Text numberOfLines={1} style={styles.platform}>{device.platform || (device.kind === 'web' ? 'ViChat Web' : 'ViChat')}</Text><Text style={styles.lastActive}>Đăng nhập: {formatTime(device.createdAt)}</Text><Text style={styles.lastActive}>Hoạt động: {formatTime(device.lastActiveAt)}</Text></View></View>;
}

function formatTime(value?: string) {
  if (!value) return 'Chưa rõ thời gian';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa rõ thời gian' : date.toLocaleString('vi-VN');
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  header: { minHeight: 76, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: palette.line },
  back: { width: 42, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.caption, color: palette.accentDeep, letterSpacing: 1 },
  title: { ...typography.heading, color: palette.ink, marginTop: 2 },
  content: { padding: 20, paddingBottom: 40 },
  intro: { marginBottom: 17 },
  introTitle: { ...typography.heading, color: palette.ink },
  introText: { ...typography.body, color: palette.inkSoft, marginTop: 4 },
  empty: { ...typography.body, color: palette.muted, paddingVertical: 24, textAlign: 'center' },
  error: { ...typography.body, color: palette.danger, paddingVertical: 24, textAlign: 'center' },
  deviceCard: { minHeight: 86, marginBottom: 12, padding: 14, borderRadius: 19, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow },
  deviceIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: palette.accentWash, alignItems: 'center', justifyContent: 'center' },
  deviceBody: { flex: 1, minWidth: 0 },
  deviceName: { ...typography.bodyMedium, color: palette.ink },
  platform: { ...typography.caption, color: palette.inkSoft, marginTop: 3 },
  lastActive: { ...typography.caption, color: palette.muted, marginTop: 3 },
  });
}
