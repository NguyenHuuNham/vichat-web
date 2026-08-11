import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bell, ChevronRight, LockKeyhole, LogOut, Pencil, ShieldCheck, Wifi } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { colors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import { PinSettingsModal } from '../../components/PinSettingsModal';
import { useAppLockStore } from '../../store/appLockStore';

type Props = BottomTabScreenProps<MainTabParamList, 'Settings'> & { navigation: any };

export function SettingsScreen({ navigation }: Props) {
  const session = useAppStore(state => state.session);
  const connection = useAppStore(state => state.connection);
  const logout = useAppStore(state => state.logout);
  const pinConfigured = useAppLockStore(state => state.configured);
  const [busy, setBusy] = useState(false);
  const [pinSettingsOpen, setPinSettingsOpen] = useState(false);
  const confirmLogout = () => Alert.alert('Đăng xuất ViChat?', 'Phiên trên thiết bị này sẽ bị xóa an toàn.', [{ text: 'Hủy', style: 'cancel' }, { text: 'Đăng xuất', style: 'destructive', onPress: async () => { setBusy(true); try { await logout(); } finally { setBusy(false); } } }]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}><View><Text style={styles.eyebrow}>TÀI KHOẢN</Text><Text style={styles.title}>Hồ sơ & Cài đặt</Text></View><ShieldCheck color={colors.online} size={23} /></View>

        <Pressable onPress={() => navigation.navigate('EditProfile')} style={({ pressed }) => [styles.profileCard, pressed && styles.profilePressed]}>
          <Avatar name={session?.user.name} uri={session?.user.avatar} size={86} online />
          <Text numberOfLines={1} style={styles.profileName}>{session?.user.name || 'Nhân viên ViChat'}</Text>
          <Text numberOfLines={1} style={styles.profileEmail}>{session?.user.email || session?.user.username || 'Tài khoản nội bộ'}</Text>
          <View style={styles.badges}><Text style={styles.badge}>{session?.user.role || 'Nhân viên'}</Text><Text style={styles.badge}>{session?.tenant?.name || 'Công ty'}</Text></View>
          <View style={styles.editButton}><Pencil color={colors.accentDeep} size={15} /><Text style={styles.editText}>Chỉnh sửa hồ sơ</Text></View>
        </Pressable>

        <Text style={styles.section}>Ứng dụng</Text>
        <View style={styles.menu}>
          <SettingRow icon={Wifi} label="Kết nối realtime" detail={connection === 'connected' ? 'Đang hoạt động' : 'Đang chờ kết nối'} color={connection === 'connected' ? colors.online : colors.warning} />
          <SettingRow icon={Bell} label="Thông báo" detail="Tin nhắn mới trên thiết bị" last />
        </View>

        <Text style={styles.section}>Bảo mật thiết bị</Text>
        <View style={styles.menu}>
          <SettingRow icon={LockKeyhole} label="Mã PIN khi mở ViChat" detail={pinConfigured ? 'Đang bật · nhấn để đổi hoặc tắt' : 'Chưa bật · nhấn để thiết lập'} color={pinConfigured ? colors.online : colors.accent} onPress={() => setPinSettingsOpen(true)} last />
        </View>

        <View style={styles.dangerCard}>
          <View style={styles.dangerHeading}><LogOut color={colors.danger} size={19} /><Text style={styles.dangerTitle}>Phiên làm việc</Text></View>
          <Text style={styles.dangerHint}>Đăng xuất khỏi tài khoản trên thiết bị này.</Text>
          <Pressable disabled={busy} onPress={confirmLogout} style={[styles.logout, busy && { opacity: 0.5 }]}><Text style={styles.logoutText}>{busy ? 'Đang đăng xuất...' : 'Đăng xuất'}</Text></Pressable>
        </View>
        <Text style={styles.version}>ViChat Mobile 1.0.5 · Gon Platform</Text>
      </ScrollView>
      <PinSettingsModal visible={pinSettingsOpen} onClose={() => setPinSettingsOpen(false)} />
    </SafeAreaView>
  );
}

function SettingRow({ icon: Icon, label, detail, color = colors.accent, onPress, last = false }: { icon: any; label: string; detail: string; color?: string; onPress?: () => void; last?: boolean }) {
  return <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.settingRow, last && styles.settingRowLast, pressed && styles.settingPressed]}><View style={styles.settingIcon}><Icon color={color} size={19} /></View><View style={styles.settingBody}><Text style={styles.settingLabel}>{label}</Text><Text style={styles.settingDetail}>{detail}</Text></View>{onPress ? <ChevronRight color={colors.line} size={18} /> : null}</Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 20, paddingBottom: 130 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 },
  eyebrow: { ...typography.caption, color: colors.accentDeep, letterSpacing: 1 },
  title: { ...typography.display, color: colors.ink, fontSize: 27, lineHeight: 33, marginTop: 3 },
  profileCard: { alignItems: 'center', backgroundColor: colors.paper, borderRadius: 21, paddingHorizontal: 18, paddingVertical: 22, borderWidth: 1, borderColor: colors.line, ...shadow },
  profilePressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  profileName: { ...typography.heading, color: colors.ink, marginTop: 12, maxWidth: '100%' },
  profileEmail: { ...typography.body, color: colors.inkSoft, marginTop: 3, maxWidth: '100%' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 10 },
  badge: { ...typography.caption, color: colors.accentDeep, backgroundColor: colors.accentWash, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  editButton: { minHeight: 38, marginTop: 16, paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.accentWash, flexDirection: 'row', alignItems: 'center', gap: 7 },
  editText: { ...typography.bodyMedium, color: colors.accentDeep, fontSize: 13 },
  section: { ...typography.caption, color: colors.inkSoft, letterSpacing: 0.8, marginTop: 25, marginBottom: 9 },
  menu: { backgroundColor: colors.paper, borderRadius: 19, paddingHorizontal: 15, borderWidth: 1, borderColor: colors.line, ...shadow },
  settingRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: colors.line },
  settingRowLast: { borderBottomWidth: 0 },
  settingPressed: { opacity: 0.62 },
  settingIcon: { width: 37, height: 37, borderRadius: 13, backgroundColor: colors.accentWash, alignItems: 'center', justifyContent: 'center' },
  settingBody: { flex: 1 },
  settingLabel: { ...typography.bodyMedium, color: colors.ink },
  settingDetail: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  dangerCard: { marginTop: 25, padding: 16, borderRadius: 19, backgroundColor: '#FFF8F8', borderWidth: 1, borderColor: '#F5C5C5' },
  dangerHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dangerTitle: { ...typography.title, color: colors.danger },
  dangerHint: { ...typography.caption, color: colors.inkSoft, marginTop: 8 },
  logout: { alignSelf: 'flex-start', minHeight: 38, marginTop: 13, paddingHorizontal: 15, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E7A0A0', alignItems: 'center', justifyContent: 'center' },
  logoutText: { ...typography.bodyMedium, color: colors.danger, fontSize: 13 },
  version: { ...typography.caption, color: colors.muted, textAlign: 'center', marginTop: 20 },
});
