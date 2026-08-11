import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Clock3, Globe2, Monitor, ShieldCheck, Smartphone } from 'lucide-react-native';
import * as Device from 'expo-device';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { storageService } from '../../services/storageService';
import { colors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { LinkedDevice } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'LinkedDevices'>;

export function LinkedDevicesScreen({ navigation }: Props) {
  const session = useAppStore(state => state.session);
  const [startedAt, setStartedAt] = useState('');

  useEffect(() => {
    let active = true;
    void storageService.loadSessionStartedAt().then(value => { if (active && value) setStartedAt(value); });
    return () => { active = false; };
  }, []);

  const currentDevice = useMemo<LinkedDevice>(() => ({
    id: 'current-mobile-device',
    kind: 'mobile',
    name: Device.modelName || (Platform.OS === 'ios' ? 'iPhone / iPad' : 'Thiết bị Android'),
    platform: `ViChat Mobile · ${Device.osName || Platform.OS} ${Device.osVersion || ''}`.trim(),
    lastActiveAt: startedAt || new Date().toISOString(),
    current: true,
  }), [startedAt]);

  const devices = useMemo(() => [currentDevice, ...(session?.linkedDevices || []).filter(item => !item.current && item.id !== currentDevice.id)], [currentDevice, session?.linkedDevices]);
  const hasRemoteSessions = Boolean(session?.linkedDevices?.some(item => !item.current));

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Quay lại" onPress={() => navigation.goBack()} style={styles.back}><ChevronLeft color={colors.ink} size={27} /></Pressable>
        <View style={styles.headerTitle}><Text style={styles.eyebrow}>BẢO MẬT</Text><Text style={styles.title}>Thiết bị liên kết</Text></View>
        <ShieldCheck color={colors.online} size={23} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}><Text style={styles.introTitle}>Phiên đăng nhập</Text><Text style={styles.introText}>Theo dõi nơi tài khoản đang được sử dụng trên ViChat.</Text></View>
        {devices.map(device => <DeviceCard key={device.id} device={device} />)}
        {!hasRemoteSessions ? <View style={styles.infoCard}><Clock3 color={colors.accent} size={20} /><View style={styles.infoBody}><Text style={styles.infoTitle}>Đang dùng trên thiết bị này</Text><Text style={styles.infoText}>Thiết bị hiện tại được ghi nhận cục bộ. Các phiên web hoặc thiết bị khác sẽ hiển thị khi hệ thống xác thực trả về dữ liệu phiên liên kết.</Text></View></View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function DeviceCard({ device }: { device: LinkedDevice }) {
  const Icon = device.kind === 'web' ? Globe2 : device.kind === 'desktop' ? Monitor : Smartphone;
  return <View style={styles.deviceCard}><View style={styles.deviceIcon}><Icon color={colors.accent} size={22} /></View><View style={styles.deviceBody}><View style={styles.deviceTop}><Text numberOfLines={1} style={styles.deviceName}>{device.name}</Text>{device.current ? <Text style={styles.currentBadge}>Thiết bị này</Text> : null}</View><Text numberOfLines={1} style={styles.platform}>{device.platform || (device.kind === 'web' ? 'ViChat Web' : 'ViChat')}</Text><Text style={styles.lastActive}>Hoạt động: {formatTime(device.lastActiveAt)}</Text></View></View>;
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
  deviceCard: { minHeight: 86, marginBottom: 12, padding: 14, borderRadius: 19, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow },
  deviceIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accentWash, alignItems: 'center', justifyContent: 'center' },
  deviceBody: { flex: 1, minWidth: 0 },
  deviceTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deviceName: { ...typography.bodyMedium, color: colors.ink, flex: 1 },
  currentBadge: { ...typography.caption, color: colors.online, backgroundColor: '#E8F7F0', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4 },
  platform: { ...typography.caption, color: colors.inkSoft, marginTop: 3 },
  lastActive: { ...typography.caption, color: colors.muted, marginTop: 3 },
  infoCard: { marginTop: 10, padding: 14, borderRadius: 17, backgroundColor: colors.accentWash, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoBody: { flex: 1 },
  infoTitle: { ...typography.bodyMedium, color: colors.ink },
  infoText: { ...typography.caption, color: colors.inkSoft, marginTop: 4 },
});
