import { useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bell, ChevronRight, Fingerprint, LogOut, ShieldCheck, Wifi } from 'lucide-react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { colors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';

type Props = BottomTabScreenProps<MainTabParamList, 'Settings'> & { navigation: any };

export function SettingsScreen({ navigation }: Props) {
  const session = useAppStore(state => state.session);
  const connection = useAppStore(state => state.connection);
  const logout = useAppStore(state => state.logout);
  const [busy, setBusy] = useState(false);
  const confirmLogout = () => Alert.alert('Đăng xuất ViChat?', 'Phiên trên thiết bị này sẽ bị xóa an toàn.', [{ text: 'Hủy', style: 'cancel' }, { text: 'Đăng xuất', style: 'destructive', onPress: async () => { setBusy(true); try { await logout(); } finally { setBusy(false); } } }]);
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}><View style={styles.header}><View><Text style={styles.eyebrow}>TÀI KHOẢN</Text><Text style={styles.title}>Cài đặt</Text></View><ShieldCheck color={colors.online} size={23} /></View><Pressable onPress={() => navigation.navigate('EditProfile')} style={styles.profile}><Avatar name={session?.user.name} uri={session?.user.avatar} size={58} online /><View style={styles.profileBody}><Text style={styles.profileName}>{session?.user.name}</Text><Text style={styles.profileMeta}>{session?.user.title || session?.user.department || 'Nhân viên công ty'}</Text><Text style={styles.tenant}>{session?.tenant?.name}</Text></View><ChevronRight color={colors.line} size={19} /></Pressable><Text style={styles.section}>Ứng dụng</Text><View style={styles.menu}><SettingRow icon={Wifi} label="Kết nối realtime" detail={connection === 'connected' ? 'Đang hoạt động' : 'Đang chờ kết nối'} color={connection === 'connected' ? colors.online : colors.warning} /><SettingRow icon={Bell} label="Thông báo" detail="Cấu hình theo thiết bị" /><SettingRow icon={Fingerprint} label="Bảo mật thiết bị" detail="Token được mã hóa" /></View><Text style={styles.section}>Phiên & quyền riêng tư</Text><View style={styles.privacy}><ShieldCheck color={colors.online} size={20} /><Text style={styles.privacyText}>Tin nhắn/file chỉ đi qua Tinode. UpGO Account là nguồn định danh; mật khẩu không được lưu trong app.</Text></View><Pressable disabled={busy} onPress={confirmLogout} style={[styles.logout, busy && { opacity: 0.5 }]}><LogOut color={colors.danger} size={19} /><Text style={styles.logoutText}>{busy ? 'Đang đăng xuất...' : 'Đăng xuất'}</Text></Pressable><Text style={styles.version}>ViChat Mobile 1.0 · Gon Platform</Text></ScrollView></SafeAreaView>;
}

function SettingRow({ icon: Icon, label, detail, color = colors.accent }: { icon: any; label: string; detail: string; color?: string }) { return <View style={styles.settingRow}><View style={styles.settingIcon}><Icon color={color} size={19} /></View><View style={styles.settingBody}><Text style={styles.settingLabel}>{label}</Text><Text style={styles.settingDetail}>{detail}</Text></View><ChevronRight color={colors.line} size={18} /></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 },
  eyebrow: { ...typography.caption, color: colors.accentDeep, letterSpacing: 1 },
  title: { ...typography.heading, color: colors.ink, marginTop: 3 },
  profile: { backgroundColor: colors.paper, borderRadius: 21, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow },
  profileBody: { flex: 1 },
  profileName: { ...typography.title, color: colors.ink },
  profileMeta: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  tenant: { ...typography.caption, color: colors.accentDeep, marginTop: 4 },
  section: { ...typography.caption, color: colors.inkSoft, letterSpacing: 0.8, marginTop: 26, marginBottom: 9 },
  menu: { backgroundColor: colors.paper, borderRadius: 21, paddingHorizontal: 15, ...shadow },
  settingRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: colors.line },
  settingRowLast: { borderBottomWidth: 0 },
  settingIcon: { width: 37, height: 37, borderRadius: 13, backgroundColor: colors.accentWash, alignItems: 'center', justifyContent: 'center' },
  settingBody: { flex: 1 },
  settingLabel: { ...typography.bodyMedium, color: colors.ink },
  settingDetail: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  privacy: { borderRadius: 18, padding: 14, backgroundColor: '#E8F7F0', flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  privacyText: { ...typography.caption, color: '#21734F', flex: 1 },
  logout: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: '#F5C5C5', backgroundColor: '#FFF8F8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 25 },
  logoutText: { ...typography.bodyMedium, color: colors.danger },
  version: { ...typography.caption, color: colors.muted, textAlign: 'center', marginTop: 20 },
});
