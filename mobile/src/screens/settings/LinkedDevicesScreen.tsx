import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Globe2, Monitor, ShieldCheck, Smartphone } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { authService } from '../../services/authService';
import { colors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { LinkedDevice } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'LinkedDevices'>;

export function LinkedDevicesScreen({ navigation }: Props) {
  const session = useAppStore(state => state.session);
  const updateLinkedDevices = useAppStore(state => state.updateLinkedDevices);
  const refresh = useCallback(async () => {
    try { updateLinkedDevices(await authService.listLinkedDevices()); } catch { /* Keep the last server snapshot visible. */ }
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
        <Pressable accessibilityLabel="Quay lại" onPress={() => navigation.goBack()} style={styles.back}><ChevronLeft color={colors.ink} size={27} /></Pressable>
        <View style={styles.headerTitle}><Text style={styles.eyebrow}>BẢO MẬT</Text><Text style={styles.title}>Thiết bị liên kết</Text></View>
        <ShieldCheck color={colors.online} size={23} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}><Text style={styles.introTitle}>Phiên đăng nhập</Text><Text style={styles.introText}>Theo dõi nơi tài khoản đang được sử dụng trên ViChat.</Text></View>
        {devices.length ? devices.map(device => <DeviceCard key={device.id} device={device} />) : <Text style={styles.empty}>Chưa có phiên đăng nhập nào được máy chủ ghi nhận.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

function DeviceCard({ device }: { device: LinkedDevice }) {
  const Icon = device.kind === 'web' ? Globe2 : device.kind === 'desktop' ? Monitor : Smartphone;
  return <View style={styles.deviceCard}><View style={styles.deviceIcon}><Icon color={colors.accent} size={22} /></View><View style={styles.deviceBody}><Text numberOfLines={1} style={styles.deviceName}>{device.name}</Text><Text numberOfLines={1} style={styles.platform}>{device.platform || (device.kind === 'web' ? 'ViChat Web' : 'ViChat')}</Text><Text style={styles.lastActive}>Đăng nhập: {formatTime(device.createdAt)}</Text><Text style={styles.lastActive}>Hoạt động: {formatTime(device.lastActiveAt)}</Text></View></View>;
}

function formatTime(value?: string) {
  if (!value) return 'Chưa rõ thời gian';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa rõ thời gian' : date.toLocaleString('vi-VN');
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: { minHeight: 76, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
  back: { width: 42, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.caption, color: colors.accentDeep, letterSpacing: 1 },
  title: { ...typography.heading, color: colors.ink, marginTop: 2 },
  content: { padding: 20, paddingBottom: 40 },
  intro: { marginBottom: 17 },
  introTitle: { ...typography.heading, color: colors.ink },
  introText: { ...typography.body, color: colors.inkSoft, marginTop: 4 },
  empty: { ...typography.body, color: colors.muted, paddingVertical: 24, textAlign: 'center' },
  deviceCard: { minHeight: 86, marginBottom: 12, padding: 14, borderRadius: 19, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow },
  deviceIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accentWash, alignItems: 'center', justifyContent: 'center' },
  deviceBody: { flex: 1, minWidth: 0 },
  deviceName: { ...typography.bodyMedium, color: colors.ink },
  platform: { ...typography.caption, color: colors.inkSoft, marginTop: 3 },
  lastActive: { ...typography.caption, color: colors.muted, marginTop: 3 },
});
