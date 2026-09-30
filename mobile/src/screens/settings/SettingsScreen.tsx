import { ReactNode, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Bell, Building2, ChevronRight, LockKeyhole, LogOut, Moon, Pencil, ShieldCheck, Smartphone, Wifi, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { colorsForTheme, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import { PinSettingsModal } from '../../components/PinSettingsModal';
import { useAppLockStore } from '../../store/appLockStore';
import Constants from 'expo-constants';
import { config } from '../../constants/config';
import { displayRoleName, displayTenantName } from '../../utils/tenantDisplay';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TenantOption } from '../../types';
import { useThemeStore } from '../../store/themeStore';

type Props = BottomTabScreenProps<MainTabParamList, 'Settings'> & { navigation: any };

export function SettingsScreen({ navigation }: Props) {
  const session = useAppStore(state => state.session);
  const connection = useAppStore(state => state.connection);
  const logout = useAppStore(state => state.logout);
  const switchTenant = useAppStore(state => state.switchTenant);
  const pinConfigured = useAppLockStore(state => state.configured);
  const themeMode = useThemeStore(state => state.mode);
  const resolvedTheme = useThemeStore(state => state.resolved);
  const setThemeMode = useThemeStore(state => state.setMode);
  const palette = colorsForTheme(resolvedTheme);
  const [busy, setBusy] = useState(false);
  const [pinSettingsOpen, setPinSettingsOpen] = useState(false);
  const [tenantPickerOpen, setTenantPickerOpen] = useState(false);
  const [pendingTenant, setPendingTenant] = useState<TenantOption | null>(null);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const [tenantInfoOpen, setTenantInfoOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const allTenantOptions = (session?.tenantOptions || []).filter(option => option.active !== false);
  const tenantOptions = allTenantOptions.filter(option => option.id !== session?.tenant?.id);
  const tenantSwitchDetail = tenantOptions.length > 0
    ? `Đang ở ${displayTenantName(session?.tenant?.name, 'công ty hiện tại')} · ${tenantOptions.length} lựa chọn khác`
    : allTenantOptions.length > 0
      ? 'Tài khoản hiện chỉ có một công ty đang hoạt động'
      : 'Chưa tải được danh sách công ty khác';
  const openTenantSwitcher = () => {
    if (tenantOptions.length > 0) setTenantPickerOpen(true);
    else setTenantInfoOpen(true);
  };
  const confirmLogout = () => setLogoutConfirmOpen(true);
  const confirmTenantSwitch = async () => {
    if (!pendingTenant || switchBusy) return;
    setSwitchBusy(true);
    setSwitchError('');
    try {
      await switchTenant(pendingTenant.id);
      setPendingTenant(null);
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : 'Không thể chuyển công ty.');
    } finally {
      setSwitchBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.canvas }]} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}><View><Text style={[styles.eyebrow, { color: palette.accentDeep }]}>TÀI KHOẢN</Text><Text style={[styles.title, { color: palette.ink }]}>Hồ sơ & Cài đặt</Text></View><ShieldCheck color={palette.online} size={23} /></View>

        <Pressable onPress={() => navigation.navigate('EditProfile')} style={({ pressed }) => [styles.profileCard, { backgroundColor: palette.paper, borderColor: palette.line }, pressed && styles.profilePressed]}>
          <Avatar name={session?.user.name} uri={session?.user.avatar} size={86} online />
          <Text numberOfLines={1} style={[styles.profileName, { color: palette.ink }]}>{session?.user.name || 'Nhân viên ViChat'}</Text>
          <Text numberOfLines={1} style={[styles.profileEmail, { color: palette.inkSoft }]}>{session?.user.email || session?.user.username || 'Tài khoản nội bộ'}</Text>
          <View style={styles.badges}><Text style={[styles.badge, { color: palette.accentDeep, backgroundColor: palette.accentWash }]}>{displayRoleName(session?.user.role, 'Nhân viên')}</Text><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.badge, { color: palette.accentDeep, backgroundColor: palette.accentWash }]}>{displayTenantName(session?.tenant?.name, 'Công ty')}</Text></View>
          <View style={[styles.editButton, { backgroundColor: palette.accentWash }]}><Pencil color={palette.accentDeep} size={15} /><Text style={[styles.editText, { color: palette.accentDeep }]}>Chỉnh sửa hồ sơ</Text></View>
        </Pressable>

        <Text style={[styles.section, { color: palette.inkSoft }]}>Ứng dụng</Text>
        <View style={[styles.menu, { backgroundColor: palette.paper, borderColor: palette.line }]}>
          <SettingRow icon={Wifi} label="Kết nối realtime" detail={connection === 'connected' ? 'Đang hoạt động' : 'Đang chờ kết nối'} color={connection === 'connected' ? palette.online : palette.warning} palette={palette} />
          <SettingRow icon={Bell} label="Thông báo" detail="Tin nhắn mới trên thiết bị · chạm để kiểm tra quyền" palette={palette} onPress={() => void Linking.openSettings().catch(() => {})} />
          <SettingRow icon={Building2} label="Chuyển công ty" detail={tenantSwitchDetail} palette={palette} onPress={openTenantSwitcher} last />
        </View>

        <Text style={[styles.section, { color: palette.inkSoft }]}>Giao diện & thiết bị</Text>
        <View style={[styles.menu, { backgroundColor: palette.paper, borderColor: palette.line }]}>
          <SettingRow icon={Moon} label="Giao diện tối" detail={themeMode === 'system' ? `Theo thiết bị · hiện ${resolvedTheme === 'dark' ? 'tối' : 'sáng'}` : themeMode === 'dark' ? 'Đang bật' : 'Đang tắt'} color={palette.accent} palette={palette} control={<Switch value={themeMode === 'dark' || (themeMode === 'system' && resolvedTheme === 'dark')} onValueChange={value => void setThemeMode(value ? 'dark' : 'light')} trackColor={{ false: palette.line, true: `${palette.accent}88` }} thumbColor={themeMode === 'dark' || (themeMode === 'system' && resolvedTheme === 'dark') ? palette.accent : palette.paper} />} />
          <SettingRow icon={LockKeyhole} label="Mã PIN khi mở ViChat" detail={pinConfigured ? 'Đang bật · nhấn để đổi hoặc tắt' : 'Chưa bật · nhấn để thiết lập'} color={pinConfigured ? palette.online : palette.accent} palette={palette} onPress={() => setPinSettingsOpen(true)} />
          <SettingRow icon={Smartphone} label="Thiết bị liên kết" detail="Web và các thiết bị đang đăng nhập" palette={palette} onPress={() => navigation.navigate('LinkedDevices')} last />
        </View>

        <View style={[styles.dangerCard, { backgroundColor: `${palette.danger}12`, borderColor: `${palette.danger}55` }]}>
          <View style={styles.dangerHeading}><LogOut color={palette.danger} size={19} /><Text style={[styles.dangerTitle, { color: palette.danger }]}>Phiên làm việc</Text></View>
          <Text style={[styles.dangerHint, { color: palette.inkSoft }]}>Đăng xuất khỏi tài khoản trên thiết bị này.</Text>
          <Pressable disabled={busy} onPress={confirmLogout} style={[styles.logout, { backgroundColor: palette.paper, borderColor: `${palette.danger}88` }, busy && { opacity: 0.5 }]}><Text style={[styles.logoutText, { color: palette.danger }]}>{busy ? 'Đang đăng xuất...' : 'Đăng xuất'}</Text></Pressable>
        </View>
        <Text style={[styles.version, { color: palette.muted }]}>ViChat Mobile {Constants.expoConfig?.version || '1.0.32'} · {config.brandName}</Text>
      </ScrollView>
      <PinSettingsModal visible={pinSettingsOpen} onClose={() => setPinSettingsOpen(false)} />
      <TenantPickerModal visible={tenantPickerOpen} options={tenantOptions} palette={palette} onClose={() => setTenantPickerOpen(false)} onSelect={option => { setTenantPickerOpen(false); setPendingTenant(option); }} />
      <ConfirmDialog
        visible={Boolean(pendingTenant)}
        title="Xác nhận chuyển công ty"
        message={`${switchError ? `${switchError}\n\n` : ''}Bạn có muốn chuyển sang ${pendingTenant?.name || 'công ty đã chọn'} không? Dữ liệu hội thoại sẽ được tải lại theo công ty này.`}
        eyebrow="CHUYỂN CÔNG TY"
        confirmLabel="Chuyển sang công ty này"
        onCancel={() => setPendingTenant(null)}
        onConfirm={() => void confirmTenantSwitch()}
        busy={switchBusy}
      />
      <ConfirmDialog
        visible={tenantInfoOpen}
        title="Chuyển công ty"
        message={allTenantOptions.length > 0
          ? 'Tài khoản hiện chỉ có một công ty đang hoạt động nên chưa có lựa chọn để chuyển.'
          : 'Chưa nhận được danh sách công ty khác từ tài khoản. Hãy đăng nhập lại để tải lại quyền thành viên.'}
        eyebrow="TÀI KHOẢN"
        confirmLabel="Đã hiểu"
        onCancel={() => setTenantInfoOpen(false)}
        onConfirm={() => setTenantInfoOpen(false)}
      />
      <ConfirmDialog
        visible={logoutConfirmOpen}
        title="Đăng xuất ViChat?"
        message="Phiên trên thiết bị này sẽ bị xóa an toàn."
        eyebrow="PHIÊN LÀM VIỆC"
        confirmLabel="Đăng xuất"
        tone="danger"
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={async () => { setBusy(true); try { await logout(); } finally { setBusy(false); setLogoutConfirmOpen(false); } }}
        busy={busy}
      />
    </SafeAreaView>
  );
}

function SettingRow({ icon: Icon, label, detail, color, onPress, last = false, control, palette }: { icon: any; label: string; detail: string; color?: string; onPress?: () => void; last?: boolean; control?: ReactNode; palette: ReturnType<typeof colorsForTheme> }) {
  return <Pressable disabled={!onPress && !control} onPress={onPress} style={({ pressed }) => [styles.settingRow, { borderBottomColor: palette.line }, last && styles.settingRowLast, pressed && styles.settingPressed]}><View style={[styles.settingIcon, { backgroundColor: palette.accentWash }]}><Icon color={color || palette.accent} size={19} /></View><View style={styles.settingBody}><Text style={[styles.settingLabel, { color: palette.ink }]}>{label}</Text><Text style={[styles.settingDetail, { color: palette.inkSoft }]}>{detail}</Text></View>{control || (onPress ? <ChevronRight color={palette.muted} size={18} /> : null)}</Pressable>;
}

function TenantPickerModal({ visible, options, palette, onClose, onSelect }: { visible: boolean; options: TenantOption[]; palette: ReturnType<typeof colorsForTheme>; onClose: () => void; onSelect: (option: TenantOption) => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent><View style={styles.modalOverlay}><Pressable style={styles.modalBackdrop} onPress={onClose} /><View style={[styles.tenantCard, { backgroundColor: palette.canvas }]}><View style={styles.tenantHeader}><View><Text style={[styles.modalEyebrow, { color: palette.accentDeep }]}>TÀI KHOẢN</Text><Text style={[styles.modalTitle, { color: palette.ink }]}>Chuyển công ty</Text></View><Pressable onPress={onClose} style={[styles.closeButton, { backgroundColor: palette.paper }]}><X color={palette.inkSoft} size={19} /></Pressable></View><Text style={[styles.modalHint, { color: palette.inkSoft }]}>Chọn công ty bạn muốn mở trên thiết bị này.</Text><View style={[styles.tenantList, { backgroundColor: palette.paper, borderColor: palette.line }]}>{options.map(option => <Pressable key={option.id} onPress={() => onSelect(option)} style={({ pressed }) => [styles.tenantOption, { borderBottomColor: palette.line }, pressed && styles.settingPressed]}><View style={[styles.tenantLogo, { backgroundColor: palette.accentWash }]}><Building2 color={palette.accent} size={19} /></View><View style={styles.tenantCopy}><Text numberOfLines={1} style={[styles.tenantName, { color: palette.ink }]}>{option.name}</Text><Text style={[styles.tenantRole, { color: palette.inkSoft }]}>{displayRoleName(option.role, 'Thành viên')}</Text></View><ChevronRight color={palette.muted} size={18} /></Pressable>)}</View></View></View></Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 130 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 },
  eyebrow: { ...typography.caption, letterSpacing: 1 },
  title: { ...typography.display, fontSize: 27, lineHeight: 33, marginTop: 3 },
  profileCard: { alignItems: 'center', borderRadius: 21, paddingHorizontal: 18, paddingVertical: 22, borderWidth: 1, ...shadow },
  profilePressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  profileName: { ...typography.heading, marginTop: 12, maxWidth: '100%' },
  profileEmail: { ...typography.body, marginTop: 3, maxWidth: '100%' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 10 },
  badge: { ...typography.caption, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  editButton: { minHeight: 38, marginTop: 16, paddingHorizontal: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  editText: { ...typography.bodyMedium, fontSize: 13 },
  section: { ...typography.caption, letterSpacing: 0.8, marginTop: 25, marginBottom: 9 },
  menu: { borderRadius: 19, paddingHorizontal: 15, borderWidth: 1, ...shadow },
  settingRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1 },
  settingRowLast: { borderBottomWidth: 0 },
  settingPressed: { opacity: 0.62 },
  settingIcon: { width: 37, height: 37, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  settingBody: { flex: 1 },
  settingLabel: { ...typography.bodyMedium },
  settingDetail: { ...typography.caption, marginTop: 2 },
  dangerCard: { marginTop: 25, padding: 16, borderRadius: 19, borderWidth: 1 },
  dangerHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dangerTitle: { ...typography.title },
  dangerHint: { ...typography.caption, marginTop: 8 },
  logout: { alignSelf: 'flex-start', minHeight: 38, marginTop: 13, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  logoutText: { ...typography.bodyMedium, fontSize: 13 },
  version: { ...typography.caption, textAlign: 'center', marginTop: 20 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,12,16,0.58)' },
  tenantCard: { borderTopLeftRadius: 27, borderTopRightRadius: 27, padding: 20, paddingBottom: 30, ...shadow },
  tenantHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalEyebrow: { ...typography.caption, letterSpacing: 1 },
  modalTitle: { ...typography.title, marginTop: 3, fontSize: 21 },
  modalHint: { ...typography.body, marginTop: 12, marginBottom: 15 },
  closeButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tenantList: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 13 },
  tenantOption: { minHeight: 69, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1 },
  tenantLogo: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tenantCopy: { flex: 1, minWidth: 0 },
  tenantName: { ...typography.bodyMedium },
  tenantRole: { ...typography.caption, marginTop: 2 },
});
