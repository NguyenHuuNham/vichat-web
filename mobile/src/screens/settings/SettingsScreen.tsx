import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Building2, ChevronRight, Globe2, LockKeyhole, LogOut, Moon, Music2, Pencil, Play, ShieldCheck, Smartphone, Square, Trash2, Upload, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useIsFocused } from '@react-navigation/native';
import { MainTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { colorsForTheme, shadow, ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import { PinSettingsModal } from '../../components/PinSettingsModal';
import { useAppLockStore } from '../../store/appLockStore';
import Constants from 'expo-constants';
import { config } from '../../constants/config';
import { displayCurrentTenantName, displayRoleName } from '../../utils/tenantDisplay';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TenantOption } from '../../types';
import { useThemeStore } from '../../store/themeStore';
import { useI18n } from '../../store/languageStore';
import { useLanguageStore } from '../../store/languageStore';
import { beginTrustedExternalActivity } from '../../services/appLifecycleService';
import {
  DEFAULT_NOTIFICATION_SOUND_SETTINGS,
  loadNotificationSoundSettings,
  NotificationSoundSettings,
  pickCustomNotificationSound,
  playCustomNotificationSoundPreview,
  removeCustomNotificationSound,
  stopCustomNotificationSoundPreview,
  updateNotificationSoundSettings,
} from '../../services/notificationSoundService';

type Props = BottomTabScreenProps<MainTabParamList, 'Settings'> & { navigation: any };

export function SettingsScreen({ navigation }: Props) {
  const session = useAppStore(state => state.session);
  const logout = useAppStore(state => state.logout);
  const refreshSession = useAppStore(state => state.refreshSession);
  const switchTenant = useAppStore(state => state.switchTenant);
  const pinConfigured = useAppLockStore(state => state.configured);
  const themeMode = useThemeStore(state => state.mode);
  const resolvedTheme = useThemeStore(state => state.resolved);
  const setThemeMode = useThemeStore(state => state.setMode);
  const palette = colorsForTheme(resolvedTheme);
  const { language, t } = useI18n();
  const setLanguage = useLanguageStore(state => state.setLanguage);
  const [busy, setBusy] = useState(false);
  const [pinSettingsOpen, setPinSettingsOpen] = useState(false);
  const [tenantPickerOpen, setTenantPickerOpen] = useState(false);
  const [pendingTenant, setPendingTenant] = useState<TenantOption | null>(null);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const [tenantInfoOpen, setTenantInfoOpen] = useState(false);
  const [tenantRefreshBusy, setTenantRefreshBusy] = useState(false);
  const [tenantInfoMessage, setTenantInfoMessage] = useState('');
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const [soundPickerOpen, setSoundPickerOpen] = useState(false);
  const [soundSettings, setSoundSettings] = useState<NotificationSoundSettings>(DEFAULT_NOTIFICATION_SOUND_SETTINGS);
  const [soundBusy, setSoundBusy] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const isFocused = useIsFocused();
  const stopPreview = useCallback(() => {
    stopCustomNotificationSoundPreview();
    setPreviewPlaying(false);
  }, []);
  useEffect(() => {
    let active = true;
    void loadNotificationSoundSettings().then(value => {
      if (active) setSoundSettings(value);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') stopPreview();
    });
    return () => {
      subscription.remove();
      stopPreview();
    };
  }, [stopPreview]);
  useEffect(() => {
    if (!isFocused || !soundPickerOpen) stopPreview();
  }, [isFocused, soundPickerOpen, stopPreview]);
  const allTenantOptions = (session?.tenantOptions || []).filter(option => option.active !== false);
  const tenantOptions = allTenantOptions.filter(option => option.id !== session?.tenant?.id);
  const tenantSwitchDetail = tenantInfoMessage && !tenantRefreshBusy
    ? tenantInfoMessage
    : displayCurrentTenantName(session, language === 'en' ? 'current company' : 'công ty hiện tại');
  const openTenantSwitcher = async () => {
    if (tenantRefreshBusy || switchBusy) return;
    const cachedOptions = tenantOptions;
    setTenantRefreshBusy(true);
    setTenantInfoMessage('');
    try {
      const refreshedSession = await refreshSession();
      const activeOptions = (refreshedSession?.tenantOptions || []).filter(option => option.active !== false);
      const currentTenantId = refreshedSession?.tenant?.id;
      const nextOptions = activeOptions.filter(option => option.id !== currentTenantId);
      if (nextOptions.length > 0) setTenantPickerOpen(true);
      else {
        setTenantInfoMessage(activeOptions.length > 0
          ? 'Tai khoan hien chi co mot cong ty dang hoat dong.'
          : 'Chua tai duoc danh sach cong ty tu UpGO Account.');
        setTenantInfoOpen(true);
      }
    } catch (error) {
      if (cachedOptions.length > 0) setTenantPickerOpen(true);
      else {
        setTenantInfoMessage(error instanceof Error ? error.message : 'Khong tai duoc danh sach cong ty. Hay thu lai.');
        setTenantInfoOpen(true);
      }
    } finally {
      setTenantRefreshBusy(false);
    }
  };
  const confirmLogout = () => setLogoutConfirmOpen(true);
  const changeSoundSettings = async (patch: Partial<NotificationSoundSettings>) => {
    if (patch.enabled === false || patch.mode === 'system') stopPreview();
    try {
      setSoundSettings(await updateNotificationSoundSettings(patch));
    } catch (error) {
      Alert.alert(t('Không thể hoàn tất thao tác'), error instanceof Error ? t(error.message) : t('Không thể lưu file âm thanh.'));
    }
  };
  const chooseCustomSound = async () => {
    stopPreview();
    beginTrustedExternalActivity();
    setSoundBusy(true);
    try {
      const next = await pickCustomNotificationSound();
      if (next) setSoundSettings(next);
    } catch (error) {
      Alert.alert(t('Không thể lưu file âm thanh.'), error instanceof Error ? t(error.message) : t('Không thể lưu file âm thanh.'));
    } finally {
      setSoundBusy(false);
    }
  };
  const removeCustomSound = async () => {
    stopPreview();
    setSoundBusy(true);
    try {
      setSoundSettings(await removeCustomNotificationSound());
    } catch (error) {
      Alert.alert(t('Không thể hoàn tất thao tác'), error instanceof Error ? t(error.message) : t('Không thể xóa file âm thanh.'));
    } finally {
      setSoundBusy(false);
    }
  };
  const confirmTenantSwitch = async () => {
    if (!pendingTenant || switchBusy) return;
    setSwitchBusy(true);
    setSwitchError('');
    try {
      await switchTenant(pendingTenant.id);
      setPendingTenant(null);
    } catch (error) {
      setSwitchError(error instanceof Error ? t(error.message) : t('Không thể chuyển công ty.'));
    } finally {
      setSwitchBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.canvas }]} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}><View><Text style={[styles.eyebrow, { color: palette.accentDeep }]}>{t('TÀI KHOẢN')}</Text><Text style={[styles.title, { color: palette.ink }]}>{t('Hồ sơ & Cài đặt')}</Text></View><ShieldCheck color={palette.online} size={23} /></View>

        <Pressable onPress={() => navigation.navigate('EditProfile')} style={({ pressed }) => [styles.profileCard, { backgroundColor: palette.paper, borderColor: palette.line }, pressed && styles.profilePressed]}>
          <Avatar name={session?.user.name} uri={session?.user.avatar} size={58} online />
          <View style={styles.profileIdentity}>
            <Text numberOfLines={1} style={[styles.profileName, { color: palette.ink }]}>{session?.user.name || t('Nhân viên ViChat')}</Text>
            <View style={styles.badges}><Text style={[styles.badge, { color: palette.accentDeep, backgroundColor: palette.accentWash }]}>{displayRoleName(session?.user.role, t('Nhân viên'))}</Text><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.badge, { color: palette.accentDeep, backgroundColor: palette.accentWash }]}>{displayCurrentTenantName(session, t('Công ty'))}</Text></View>
          </View>
          <View style={[styles.editButton, { backgroundColor: palette.accentWash }]}><Pencil color={palette.accentDeep} size={15} /></View>
        </Pressable>

        <Text style={[styles.section, { color: palette.inkSoft }]}>{t('Ứng dụng')}</Text>
        <View style={[styles.menu, { backgroundColor: palette.paper, borderColor: palette.line }]}>
          <SettingRow icon={Globe2} label={t('Ngôn ngữ')} detail={language === 'en' ? 'English' : t('Tiếng Việt')} palette={palette} onPress={() => setLanguagePickerOpen(true)} />
          <SettingRow icon={Building2} label={t('Chuyển công ty')} detail={tenantRefreshBusy ? '' : tenantSwitchDetail} palette={palette} onPress={() => { void openTenantSwitcher(); }} />
          <SettingRow icon={Music2} label={t('Âm thanh thông báo')} detail={!soundSettings.enabled ? t('Đã tắt') : soundSettings.mode === 'custom' ? soundSettings.customName || t('Âm thanh tùy chỉnh') : t('Mặc định hệ thống')} palette={palette} onPress={() => setSoundPickerOpen(true)} last />
        </View>

        <Text style={[styles.section, { color: palette.inkSoft }]}>{t('Giao diện & thiết bị')}</Text>
        <View style={[styles.menu, { backgroundColor: palette.paper, borderColor: palette.line }]}>
          <SettingRow icon={Moon} label={t('Giao diện tối')} detail={themeMode === 'system' ? (resolvedTheme === 'dark' ? t('Tối') : t('Sáng')) : themeMode === 'dark' ? t('Đang bật') : t('Đang tắt')} color={palette.accent} palette={palette} control={<Switch value={themeMode === 'dark' || (themeMode === 'system' && resolvedTheme === 'dark')} onValueChange={value => void setThemeMode(value ? 'dark' : 'light')} trackColor={{ false: palette.line, true: `${palette.accent}88` }} thumbColor={themeMode === 'dark' || (themeMode === 'system' && resolvedTheme === 'dark') ? palette.accent : palette.paper} />} />
          <SettingRow icon={LockKeyhole} label={t('Mã PIN khi mở ViChat')} detail={pinConfigured ? t('Đang bật') : t('Chưa bật')} color={pinConfigured ? palette.online : palette.accent} palette={palette} onPress={() => setPinSettingsOpen(true)} />
          <SettingRow icon={Smartphone} label={t('Thiết bị liên kết')} palette={palette} onPress={() => navigation.navigate('LinkedDevices')} last />
        </View>

        <View style={[styles.dangerCard, { backgroundColor: `${palette.danger}12`, borderColor: `${palette.danger}55` }]}>
          <View style={styles.dangerHeading}><LogOut color={palette.danger} size={19} /><Text style={[styles.dangerTitle, { color: palette.danger }]}>{t('Phiên làm việc')}</Text></View>
          <Pressable disabled={busy} onPress={confirmLogout} style={[styles.logout, { backgroundColor: palette.paper, borderColor: `${palette.danger}88` }, busy && { opacity: 0.5 }]}><Text style={[styles.logoutText, { color: palette.danger }]}>{busy ? t('Đang đăng xuất...') : t('Đăng xuất')}</Text></Pressable>
        </View>
        <Text style={[styles.version, { color: palette.muted }]}>ViChat Mobile {Constants.expoConfig?.version || '1.0.32'} · {config.brandName}</Text>
      </ScrollView>
      <PinSettingsModal visible={pinSettingsOpen} onClose={() => setPinSettingsOpen(false)} />
      <LanguagePickerModal visible={languagePickerOpen} language={language} palette={palette} t={t} onClose={() => setLanguagePickerOpen(false)} onSelect={next => { void setLanguage(next); setLanguagePickerOpen(false); }} />
      <NotificationSoundModal
        visible={soundPickerOpen}
        settings={soundSettings}
        busy={soundBusy}
        previewPlaying={previewPlaying}
        palette={palette}
        t={t}
        onClose={() => { stopPreview(); setSoundPickerOpen(false); }}
        onChange={patch => { void changeSoundSettings(patch); }}
        onPick={() => { void chooseCustomSound(); }}
        onRemove={() => { void removeCustomSound(); }}
        onPreview={() => {
          if (previewPlaying) {
            stopPreview();
            return;
          }
          void playCustomNotificationSoundPreview(soundSettings, setPreviewPlaying);
        }}
      />
      <TenantPickerModal visible={tenantPickerOpen} options={tenantOptions} palette={palette} t={t} onClose={() => setTenantPickerOpen(false)} onSelect={option => { setTenantPickerOpen(false); setPendingTenant(option); }} />
      <ConfirmDialog
        visible={Boolean(pendingTenant)}
        title={t('Xác nhận chuyển công ty')}
        message={`${switchError ? `${switchError}\n\n` : ''}${language === 'en' ? `Do you want to switch to ${pendingTenant?.name || 'the selected company'}? Conversation data will reload for this company.` : `Bạn có muốn chuyển sang ${pendingTenant?.name || 'công ty đã chọn'} không? Dữ liệu hội thoại sẽ được tải lại theo công ty này.`}`}
        eyebrow={t('CHUYỂN CÔNG TY')}
        confirmLabel={t('Chuyển sang công ty này')}
        onCancel={() => { setPendingTenant(null); setSwitchError(''); }}
        onConfirm={() => void confirmTenantSwitch()}
        busy={switchBusy}
      />
      <ConfirmDialog
        visible={tenantInfoOpen}
        title={t('Chuyển công ty')}
        message={tenantInfoMessage || (allTenantOptions.length > 0
          ? t('Tài khoản hiện chỉ có một công ty đang hoạt động nên chưa có lựa chọn để chuyển.')
          : t('Chưa nhận được danh sách công ty khác từ tài khoản. Hãy đăng nhập lại để tải lại quyền thành viên.'))}
        eyebrow={t('TÀI KHOẢN')}
        confirmLabel={t('Đã hiểu')}
        onCancel={() => setTenantInfoOpen(false)}
        onConfirm={() => setTenantInfoOpen(false)}
      />
      <ConfirmDialog
        visible={logoutConfirmOpen}
        title={t('Đăng xuất ViChat?')}
        message={t('Phiên trên thiết bị này sẽ bị xóa an toàn.')}
        eyebrow={t('PHIÊN LÀM VIỆC')}
        confirmLabel={t('Đăng xuất')}
        tone="danger"
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={async () => { setBusy(true); try { await logout(); } finally { setBusy(false); setLogoutConfirmOpen(false); } }}
        busy={busy}
      />
    </SafeAreaView>
  );
}

function SettingRow({ icon: Icon, label, detail, color, onPress, last = false, control, palette }: { icon: any; label: string; detail?: string; color?: string; onPress?: () => void; last?: boolean; control?: ReactNode; palette: ReturnType<typeof colorsForTheme> }) {
  return <Pressable disabled={!onPress && !control} onPress={onPress} style={({ pressed }) => [styles.settingRow, { borderBottomColor: palette.line }, last && styles.settingRowLast, pressed && styles.settingPressed]}><View style={[styles.settingIcon, { backgroundColor: palette.accentWash }]}><Icon color={color || palette.accent} size={19} /></View><View style={styles.settingBody}><Text style={[styles.settingLabel, { color: palette.ink }]}>{label}</Text>{detail ? <Text style={[styles.settingDetail, { color: palette.inkSoft }]}>{detail}</Text> : null}</View>{control || (onPress ? <ChevronRight color={palette.muted} size={18} /> : null)}</Pressable>;
}

function LanguagePickerModal({ visible, language, palette, t, onClose, onSelect }: { visible: boolean; language: 'vi' | 'en'; palette: ThemeColors; t: (value: string) => string; onClose: () => void; onSelect: (language: 'vi' | 'en') => void }) {
  const options = [{ id: 'vi' as const, label: t('Tiếng Việt') }, { id: 'en' as const, label: 'English' }];
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent><View style={styles.modalOverlay}><Pressable style={styles.modalBackdrop} onPress={onClose} /><View style={[styles.tenantCard, { backgroundColor: palette.canvas }]}><View style={styles.tenantHeader}><View><Text style={[styles.modalEyebrow, { color: palette.accentDeep }]}>{t('TÀI KHOẢN')}</Text><Text style={[styles.modalTitle, { color: palette.ink }]}>{t('Chọn ngôn ngữ')}</Text></View><Pressable onPress={onClose} style={[styles.closeButton, { backgroundColor: palette.paper }]}><X color={palette.inkSoft} size={19} /></Pressable></View><View style={[styles.tenantList, { backgroundColor: palette.paper, borderColor: palette.line }]}>{options.map(option => <Pressable key={option.id} onPress={() => onSelect(option.id)} style={({ pressed }) => [styles.tenantOption, { borderBottomColor: palette.line }, pressed && styles.settingPressed]}><View style={[styles.tenantLogo, { backgroundColor: palette.accentWash }]}><Globe2 color={palette.accent} size={19} /></View><View style={styles.tenantCopy}><Text style={[styles.tenantName, { color: palette.ink }]}>{option.label}</Text></View>{option.id === language ? <Text style={[styles.selectedMark, { color: palette.accentDeep }]}>✓</Text> : null}</Pressable>)}</View></View></View></Modal>;
}

function NotificationSoundModal({ visible, settings, busy, previewPlaying, palette, t, onClose, onChange, onPick, onRemove, onPreview }: { visible: boolean; settings: NotificationSoundSettings; busy: boolean; previewPlaying: boolean; palette: ThemeColors; t: (value: string) => string; onClose: () => void; onChange: (patch: Partial<NotificationSoundSettings>) => void; onPick: () => void; onRemove: () => void; onPreview: () => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent><View style={styles.modalOverlay}><Pressable style={styles.modalBackdrop} onPress={onClose} /><View style={[styles.soundCard, { backgroundColor: palette.canvas }]}><View style={styles.tenantHeader}><View><Text style={[styles.modalEyebrow, { color: palette.accentDeep }]}>{t('ỨNG DỤNG')}</Text><Text style={[styles.modalTitle, { color: palette.ink }]}>{t('Âm thanh thông báo')}</Text></View><Pressable onPress={onClose} style={[styles.closeButton, { backgroundColor: palette.paper }]}><X color={palette.inkSoft} size={19} /></Pressable></View><View style={[styles.soundToggle, { backgroundColor: palette.paper, borderColor: palette.line }]}><View style={[styles.tenantLogo, { backgroundColor: palette.accentWash }]}><Music2 color={palette.accent} size={19} /></View><View style={styles.tenantCopy}><Text style={[styles.tenantName, { color: palette.ink }]}>{t('Âm thanh thông báo')}</Text><Text style={[styles.tenantRole, { color: palette.inkSoft }]}>{settings.enabled ? t('Đang bật') : t('Đang tắt')}</Text></View><Switch value={settings.enabled} onValueChange={enabled => onChange({ enabled })} trackColor={{ false: palette.line, true: `${palette.accent}88` }} thumbColor={settings.enabled ? palette.accent : palette.paper} /></View><Pressable disabled={!settings.enabled} onPress={() => onChange({ mode: 'system' })} style={({ pressed }) => [styles.soundOption, { backgroundColor: palette.paper, borderColor: settings.mode === 'system' ? palette.accent : palette.line }, !settings.enabled && styles.disabled, pressed && styles.settingPressed]}><View style={[styles.tenantLogo, { backgroundColor: palette.accentWash }]}><Music2 color={palette.accent} size={19} /></View><View style={styles.tenantCopy}><Text style={[styles.tenantName, { color: palette.ink }]}>{t('Mặc định hệ thống')}</Text></View>{settings.mode === 'system' ? <Text style={[styles.selectedMark, { color: palette.accentDeep }]}>✓</Text> : null}</Pressable><View style={[styles.soundOption, { backgroundColor: palette.paper, borderColor: settings.mode === 'custom' ? palette.accent : palette.line }, !settings.enabled && styles.disabled]}><View style={[styles.tenantLogo, { backgroundColor: palette.accentWash }]}><Upload color={palette.accent} size={19} /></View><View style={styles.tenantCopy}><Text numberOfLines={1} style={[styles.tenantName, { color: palette.ink }]}>{settings.customName || t('Âm thanh tùy chỉnh')}</Text></View>{settings.customName ? <Text style={[styles.selectedMark, { color: palette.accentDeep }]}>✓</Text> : null}</View><View style={styles.soundActions}><Pressable disabled={busy || !settings.enabled} onPress={onPick} style={[styles.soundAction, { backgroundColor: palette.accent }, (busy || !settings.enabled) && styles.disabled]}><Upload color="#fff" size={16} /><Text style={styles.soundActionText}>{busy ? t('Đang xử lý...') : t('Tải từ máy')}</Text></Pressable>{settings.customName ? <Pressable disabled={busy || !settings.enabled} onPress={onPreview} accessibilityRole="button" accessibilityLabel={previewPlaying ? t('Dừng nghe thử') : t('Nghe thử âm thanh')} style={[styles.iconAction, { backgroundColor: palette.accentWash }, (busy || !settings.enabled) && styles.disabled]}>{previewPlaying ? <Square color={palette.accentDeep} size={17} /> : <Play color={palette.accentDeep} size={17} />}</Pressable> : null}{settings.customName ? <Pressable disabled={busy} onPress={onRemove} style={[styles.iconAction, { backgroundColor: `${palette.danger}15` }, busy && styles.disabled]}><Trash2 color={palette.danger} size={17} /></Pressable> : null}</View></View></View></Modal>;
}

function TenantPickerModal({ visible, options, palette, t, onClose, onSelect }: { visible: boolean; options: TenantOption[]; palette: ReturnType<typeof colorsForTheme>; t: (value: string) => string; onClose: () => void; onSelect: (option: TenantOption) => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent><View style={styles.modalOverlay}><Pressable style={styles.modalBackdrop} onPress={onClose} /><View style={[styles.tenantCard, { backgroundColor: palette.canvas }]}><View style={styles.tenantHeader}><View><Text style={[styles.modalEyebrow, { color: palette.accentDeep }]}>{t('TÀI KHOẢN')}</Text><Text style={[styles.modalTitle, { color: palette.ink }]}>{t('Chuyển công ty')}</Text></View><Pressable onPress={onClose} style={[styles.closeButton, { backgroundColor: palette.paper }]}><X color={palette.inkSoft} size={19} /></Pressable></View><View style={[styles.tenantList, { backgroundColor: palette.paper, borderColor: palette.line }]}>{options.map(option => <Pressable key={option.id} onPress={() => onSelect(option)} style={({ pressed }) => [styles.tenantOption, { borderBottomColor: palette.line }, pressed && styles.settingPressed]}><View style={[styles.tenantLogo, { backgroundColor: palette.accentWash }]}><Building2 color={palette.accent} size={19} /></View><View style={styles.tenantCopy}><Text numberOfLines={1} style={[styles.tenantName, { color: palette.ink }]}>{option.name}</Text><Text style={[styles.tenantRole, { color: palette.inkSoft }]}>{displayRoleName(option.role, t('Thành viên'))}</Text></View><ChevronRight color={palette.muted} size={18} /></Pressable>)}</View></View></View></Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 130 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 },
  eyebrow: { ...typography.caption, letterSpacing: 1 },
  title: { ...typography.display, fontSize: 27, lineHeight: 33, marginTop: 3 },
  profileCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 21, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1, ...shadow },
  profilePressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  profileIdentity: { flex: 1, minWidth: 0, marginLeft: 13 },
  profileName: { ...typography.heading, maxWidth: '100%' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  badge: { ...typography.caption, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  editButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  editText: { ...typography.bodyMedium, fontSize: 13 },
  section: { ...typography.caption, letterSpacing: 0.8, marginTop: 28, marginBottom: 13 },
  menu: { borderRadius: 19, paddingHorizontal: 15, borderWidth: 1, ...shadow },
  settingRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1 },
  settingRowLast: { borderBottomWidth: 0 },
  settingPressed: { opacity: 0.62 },
  settingIcon: { width: 37, height: 37, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  settingBody: { flex: 1 },
  settingLabel: { ...typography.bodyMedium },
  settingDetail: { ...typography.caption, marginTop: 5 },
  dangerCard: { marginTop: 25, padding: 16, borderRadius: 19, borderWidth: 1 },
  dangerHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dangerTitle: { ...typography.title },
  logout: { alignSelf: 'flex-start', minHeight: 38, marginTop: 13, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  logoutText: { ...typography.bodyMedium, fontSize: 13 },
  version: { ...typography.caption, textAlign: 'center', marginTop: 20 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,12,16,0.58)' },
  tenantCard: { borderTopLeftRadius: 27, borderTopRightRadius: 27, padding: 20, paddingBottom: 30, ...shadow },
  tenantHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalEyebrow: { ...typography.caption, letterSpacing: 1 },
  modalTitle: { ...typography.title, marginTop: 3, fontSize: 21 },
  closeButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tenantList: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 13, marginTop: 16 },
  tenantOption: { minHeight: 69, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1 },
  tenantLogo: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tenantCopy: { flex: 1, minWidth: 0 },
  tenantName: { ...typography.bodyMedium },
  tenantRole: { ...typography.caption, marginTop: 2 },
  selectedMark: { ...typography.bodyMedium, marginRight: 5 },
  soundCard: { borderTopLeftRadius: 27, borderTopRightRadius: 27, padding: 20, paddingBottom: 30, ...shadow },
  soundToggle: { minHeight: 69, borderRadius: 18, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 16 },
  soundOption: { minHeight: 69, borderRadius: 18, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 9 },
  soundActions: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 3 },
  soundAction: { minHeight: 40, borderRadius: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 },
  soundActionText: { ...typography.bodyMedium, color: '#fff', fontSize: 13 },
  iconAction: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
});
