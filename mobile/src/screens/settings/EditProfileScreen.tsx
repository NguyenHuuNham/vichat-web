import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Building2, Camera, ChevronRight, Globe2, Save, X } from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { colorsForTheme, ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { beginTrustedExternalActivity } from '../../services/appLifecycleService';
import { avatarUploadErrorMessage } from '../../utils/avatarPolicy';
import { displayCurrentTenantName, displayRoleName } from '../../utils/tenantDisplay';
import { TenantOption } from '../../types';
import { useThemeStore } from '../../store/themeStore';
import { useI18n, useLanguageStore } from '../../store/languageStore';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

export function EditProfileScreen({ navigation }: Props) {
  const palette = colorsForTheme(useThemeStore(state => state.resolved));
  const styles = createStyles(palette);
  const { language, t } = useI18n();
  const setLanguage = useLanguageStore(state => state.setLanguage);
  const session = useAppStore(state => state.session);
  const user = session?.user;
  const updateProfile = useAppStore(state => state.updateProfile);
  const updateAvatar = useAppStore(state => state.updateAvatar);
  const refreshSession = useAppStore(state => state.refreshSession);
  const switchTenant = useAppStore(state => state.switchTenant);
  const [name, setName] = useState(user?.name || '');
  const [title, setTitle] = useState(user?.title || '');
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [tenantPickerOpen, setTenantPickerOpen] = useState(false);
  const [pendingTenant, setPendingTenant] = useState<TenantOption | null>(null);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const [tenantInfoOpen, setTenantInfoOpen] = useState(false);
  const [tenantRefreshBusy, setTenantRefreshBusy] = useState(false);
  const [tenantInfoMessage, setTenantInfoMessage] = useState('');
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const allTenantOptions = (session?.tenantOptions || []).filter(option => option.active !== false);
  const tenantOptions = allTenantOptions.filter(option => option.id !== session?.tenant?.id);
  const tenantSwitchDetail = tenantInfoMessage && !tenantRefreshBusy
    ? tenantInfoMessage
    : tenantRefreshBusy
    ? t('Đang tải danh sách công ty...')
    : tenantOptions.length > 0
    ? language === 'en' ? `${tenantOptions.length} other option${tenantOptions.length === 1 ? '' : 's'}` : `${tenantOptions.length} lựa chọn khác`
    : allTenantOptions.length > 0
      ? t('Tài khoản hiện chỉ có một công ty đang hoạt động')
      : t('Chưa tải được danh sách công ty khác');
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
          ? t('Tài khoản hiện chỉ có một công ty đang hoạt động.')
          : t('Chưa tải được danh sách công ty từ UpGO Account.'));
        setTenantInfoOpen(true);
      }
    } catch (error) {
      if (cachedOptions.length > 0) setTenantPickerOpen(true);
      else {
        setTenantInfoMessage(error instanceof Error ? t(error.message) : t('Không tải được danh sách công ty. Hãy thử lại.'));
        setTenantInfoOpen(true);
      }
    } finally {
      setTenantRefreshBusy(false);
    }
  };
  useEffect(() => {
    setAvatar(user?.avatar || '');
  }, [user?.avatar]);
  const save = async () => {
    setBusy(true);
    try {
      await updateProfile({ name, title });
      navigation.goBack();
    } catch (error) {
      const message = error instanceof Error ? t(error.message) : t('Thử lại sau.');
      const isAccountManaged = /synchronized|read[ -]?only|account.*profile/i.test(message);
      Alert.alert(
        t('Không thể cập nhật'),
        isAccountManaged
          ? t('Hồ sơ của bạn được quản lý bởi UpGO Account. Vui lòng cập nhật tại account.gonplatform.com.')
          : message,
      );
    } finally {
      setBusy(false);
    }
  };
  const chooseAvatar = async () => {
    beginTrustedExternalActivity();
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    const asset: any = !result.canceled ? result.assets?.[0] : null;
    if (!asset) return;
    setBusy(true);
    try {
      const updatedUser = await updateAvatar({ uri: asset.uri, name: asset.fileName || 'avatar.jpg', type: asset.mimeType || 'image/jpeg' });
      setAvatar(updatedUser.avatar || '');
    } catch (error) {
      Alert.alert(t('Không thể cập nhật ảnh'), t(avatarUploadErrorMessage(error)));
    } finally {
      setBusy(false);
    }
  };
  const confirmTenantSwitch = async () => {
    if (!pendingTenant || switchBusy) return;
    setSwitchBusy(true);
    setSwitchError('');
    try {
      await switchTenant(pendingTenant.id);
      setPendingTenant(null);
      navigation.goBack();
    } catch (error) {
      setSwitchError(error instanceof Error ? t(error.message) : t('Không thể chuyển công ty.'));
    } finally {
      setSwitchBusy(false);
    }
  };
  return <>
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.avatarWrap}><Avatar name={name} uri={avatar} size={100} /><Pressable onPress={() => void chooseAvatar()} style={styles.camera}><Camera color="#fff" size={17} /></Pressable></View>
          <Text style={styles.hint}>{t('Tên hiển thị được đồng bộ với UpGO Account.')}</Text>
          <Text style={styles.label}>{t('Tên hiển thị')}</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} placeholder={t('Tên của bạn')} placeholderTextColor={palette.muted} />
          <Text style={styles.label}>{t('Chức vụ')}</Text>
          <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder={t('Chức vụ')} placeholderTextColor={palette.muted} />
          <Text style={styles.label}>{t('Email')}</Text>
          <View style={[styles.input, styles.readonly]}><Text style={styles.readonlyText}>{user?.email || t('Được quản lý bởi UpGO Account')}</Text></View>

          <View style={styles.languageSection}>
            <Text style={styles.companyLabel}>{t('Ngôn ngữ ứng dụng')}</Text>
            <Pressable onPress={() => setLanguagePickerOpen(true)} style={({ pressed }) => [styles.companyCard, pressed && styles.companyPressed]}>
              <View style={styles.companyIcon}><Globe2 color={palette.accent} size={21} /></View>
              <View style={styles.companyBody}><Text style={styles.companyTitle}>{t('Ngôn ngữ')}</Text><Text style={styles.companyName}>{language === 'en' ? 'English' : 'Tiếng Việt'}</Text><Text style={styles.companyHint}>{t('Chọn ngôn ngữ hiển thị của ứng dụng')}</Text></View>
              <ChevronRight color={palette.muted} size={19} />
            </Pressable>
          </View>

          <View style={styles.companySection}>
            <Text style={styles.companyLabel}>{t('CÔNG TY LÀM VIỆC')}</Text>
            <Pressable onPress={openTenantSwitcher} style={({ pressed }) => [styles.companyCard, pressed && styles.companyPressed]}><View style={styles.companyIcon}><Building2 color={palette.accent} size={21} /></View><View style={styles.companyBody}><Text style={styles.companyTitle}>{t('Công ty hiện tại')}</Text><Text numberOfLines={1} style={styles.companyName}>{displayCurrentTenantName(session, t('Công ty hiện tại'))}</Text><Text style={styles.companyHint}>{tenantSwitchDetail}</Text></View><ChevronRight color={palette.muted} size={19} /></Pressable>
          </View>
          <Pressable disabled={busy} onPress={() => void save()} style={[styles.button, busy && { opacity: 0.55 }]}><Save color="#fff" size={19} /><Text style={styles.buttonText}>{busy ? t('Đang lưu...') : t('Lưu thay đổi')}</Text></Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    <LanguagePickerModal visible={languagePickerOpen} language={language} palette={palette} t={t} onClose={() => setLanguagePickerOpen(false)} onSelect={next => { void setLanguage(next); setLanguagePickerOpen(false); }} />
    <TenantPickerModal visible={tenantPickerOpen} options={tenantOptions} palette={palette} t={t} onClose={() => setTenantPickerOpen(false)} onSelect={option => { setTenantPickerOpen(false); setPendingTenant(option); }} />
    <ConfirmDialog visible={Boolean(pendingTenant)} title={t('Xác nhận chuyển công ty')} message={`${switchError ? `${switchError}\n\n` : ''}${t('Bạn có muốn chuyển sang')} ${pendingTenant?.name || t('công ty đã chọn')} ${t('không? Dữ liệu hội thoại sẽ được tải lại theo công ty này.')}`} eyebrow={t('CHUYỂN CÔNG TY')} confirmLabel={t('Chuyển sang công ty này')} onCancel={() => { setPendingTenant(null); setSwitchError(''); }} onConfirm={() => void confirmTenantSwitch()} busy={switchBusy} />
    <ConfirmDialog visible={tenantInfoOpen} title={t('Chuyển công ty')} message={allTenantOptions.length > 0 ? t('Tài khoản hiện chỉ có một công ty đang hoạt động nên chưa có lựa chọn để chuyển.') : t('Chưa nhận được danh sách công ty khác từ tài khoản. Hãy đăng nhập lại để tải lại quyền thành viên.')} eyebrow={t('TÀI KHOẢN')} confirmLabel={t('Đã hiểu')} onCancel={() => setTenantInfoOpen(false)} onConfirm={() => setTenantInfoOpen(false)} />
  </>;
}

function LanguagePickerModal({ visible, language, palette, t, onClose, onSelect }: { visible: boolean; language: 'vi' | 'en'; palette: ThemeColors; t: (value: string) => string; onClose: () => void; onSelect: (language: 'vi' | 'en') => void }) {
  const styles = createStyles(palette);
  const options = [{ id: 'vi' as const, label: t('Tiếng Việt'), detail: 'Tiếng Việt' }, { id: 'en' as const, label: 'English', detail: 'English' }];
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent><View style={styles.modalOverlay}><Pressable style={styles.modalBackdrop} onPress={onClose} /><View style={styles.tenantCard}><View style={styles.modalHeader}><View><Text style={styles.modalEyebrow}>{t('TÀI KHOẢN')}</Text><Text style={styles.modalTitle}>{t('Chọn ngôn ngữ')}</Text></View><Pressable onPress={onClose} style={styles.closeButton}><X color={palette.inkSoft} size={19} /></Pressable></View><Text style={styles.modalHint}>{t('Chọn ngôn ngữ hiển thị của ứng dụng')}</Text><View style={styles.tenantList}>{options.map(option => <Pressable key={option.id} onPress={() => onSelect(option.id)} style={({ pressed }) => [styles.tenantOption, pressed && styles.companyPressed, option.id === language && { backgroundColor: palette.accentWash }]}><View style={styles.companyIcon}><Globe2 color={palette.accent} size={19} /></View><View style={styles.companyBody}><Text style={styles.companyName}>{option.label}</Text><Text style={styles.companyHint}>{option.detail}</Text></View>{option.id === language ? <Text style={[styles.selectedMark, { color: palette.accentDeep }]}>✓</Text> : <ChevronRight color={palette.muted} size={18} />}</Pressable>)}</View></View></View></Modal>;
}

function TenantPickerModal({ visible, options, palette, t, onClose, onSelect }: { visible: boolean; options: TenantOption[]; palette: ThemeColors; t: (value: string) => string; onClose: () => void; onSelect: (option: TenantOption) => void }) {
  const styles = createStyles(palette);
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent><View style={styles.modalOverlay}><Pressable style={styles.modalBackdrop} onPress={onClose} /><View style={styles.tenantCard}><View style={styles.modalHeader}><View><Text style={styles.modalEyebrow}>{t('TÀI KHOẢN')}</Text><Text style={styles.modalTitle}>{t('Chuyển công ty')}</Text></View><Pressable onPress={onClose} style={styles.closeButton}><X color={palette.inkSoft} size={19} /></Pressable></View><Text style={styles.modalHint}>{t('Chọn công ty bạn muốn mở trên thiết bị này.')}</Text><View style={styles.tenantList}>{options.map(option => <Pressable key={option.id} onPress={() => onSelect(option)} style={({ pressed }) => [styles.tenantOption, pressed && styles.companyPressed]}><View style={styles.companyIcon}><Building2 color={palette.accent} size={19} /></View><View style={styles.companyBody}><Text numberOfLines={1} style={styles.companyName}>{option.name}</Text><Text style={styles.companyHint}>{displayRoleName(option.role, t('Thành viên'))}</Text></View><ChevronRight color={palette.muted} size={18} /></Pressable>)}</View></View></View></Modal>;
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: palette.canvas },
    content: { padding: 22, paddingBottom: 45 },
    avatarWrap: { alignSelf: 'center', position: 'relative', marginTop: 15 },
    camera: { position: 'absolute', right: -3, bottom: -2, width: 31, height: 31, borderRadius: 12, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: palette.canvas },
    hint: { ...typography.caption, color: palette.inkSoft, textAlign: 'center', marginTop: 14, marginBottom: 27 },
    label: { ...typography.caption, color: palette.inkSoft, marginBottom: 7, marginTop: 13 },
    input: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, paddingHorizontal: 15, color: palette.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 14 },
    readonly: { justifyContent: 'center', backgroundColor: palette.line },
    readonlyText: { ...typography.body, color: palette.muted },
    companySection: { marginTop: 24 },
    languageSection: { marginTop: 24 },
    companyLabel: { ...typography.caption, color: palette.inkSoft, letterSpacing: 0.8, marginBottom: 8 },
    companyCard: { minHeight: 76, borderRadius: 18, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
    companyPressed: { opacity: 0.65 },
    companyIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: palette.accentWash, alignItems: 'center', justifyContent: 'center' },
    companyBody: { flex: 1, minWidth: 0 },
    companyTitle: { ...typography.caption, color: palette.inkSoft },
    companyName: { ...typography.bodyMedium, color: palette.ink, marginTop: 2 },
    companyHint: { ...typography.caption, color: palette.muted, marginTop: 2 },
    button: { height: 53, borderRadius: 16, backgroundColor: palette.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 25 },
    buttonText: { ...typography.bodyMedium, color: '#fff' },
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,12,16,0.58)' },
    tenantCard: { borderTopLeftRadius: 27, borderTopRightRadius: 27, padding: 20, paddingBottom: 30, backgroundColor: palette.canvas },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    modalEyebrow: { ...typography.caption, color: palette.accentDeep, letterSpacing: 1 },
    modalTitle: { ...typography.title, color: palette.ink, marginTop: 3, fontSize: 21 },
    closeButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: palette.paper, alignItems: 'center', justifyContent: 'center' },
    modalHint: { ...typography.body, color: palette.inkSoft, marginTop: 12, marginBottom: 15 },
    tenantList: { borderRadius: 18, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, paddingHorizontal: 13 },
    tenantOption: { minHeight: 69, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: palette.line },
    selectedMark: { ...typography.bodyMedium, marginRight: 5 },
  });
}
