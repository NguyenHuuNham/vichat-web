import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Save } from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import { beginTrustedExternalActivity } from '../../services/appLifecycleService';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

export function EditProfileScreen({ navigation }: Props) {
  const user = useAppStore(state => state.session?.user);
  const updateProfile = useAppStore(state => state.updateProfile);
  const updateAvatar = useAppStore(state => state.updateAvatar);
  const [name, setName] = useState(user?.name || '');
  const [title, setTitle] = useState(user?.title || '');
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const save = async () => {
    setBusy(true);
    try {
      await updateProfile({ name, title });
      navigation.goBack();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Thử lại sau.';
      const isAccountManaged = /synchronized|read[ -]?only|account.*profile/i.test(message);
      Alert.alert(
        'Không thể cập nhật',
        isAccountManaged
          ? 'Hồ sơ của bạn được quản lý bởi UpGO Account. Vui lòng cập nhật tại account.upgo.vn.'
          : message,
      );
    } finally {
      setBusy(false);
    }
  };
  const chooseAvatar = async () => { beginTrustedExternalActivity(); const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.85, allowsEditing: true, aspect: [1, 1] }); const asset: any = !result.canceled ? result.assets?.[0] : null; if (!asset) return; setBusy(true); try { await updateAvatar({ uri: asset.uri, name: asset.fileName || 'avatar.jpg', type: asset.mimeType || 'image/jpeg' }); setAvatar(asset.uri); } catch (error) { Alert.alert('Không thể cập nhật ảnh', error instanceof Error ? error.message : 'Thử lại sau.'); } finally { setBusy(false); } };
  return <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.avatarWrap}><Avatar name={name} uri={avatar} size={100} /><Pressable onPress={() => void chooseAvatar()} style={styles.camera}><Camera color="#fff" size={17} /></Pressable></View><Text style={styles.hint}>Tên hiển thị được đồng bộ với UpGO Account.</Text><Text style={styles.label}>Tên hiển thị</Text><TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Tên của bạn" placeholderTextColor={colors.muted} /><Text style={styles.label}>Chức vụ</Text><TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="Chức vụ" placeholderTextColor={colors.muted} /><Text style={styles.label}>Email</Text><View style={[styles.input, styles.readonly]}><Text style={styles.readonlyText}>{user?.email || 'Được quản lý bởi UpGO Account'}</Text></View><Pressable disabled={busy} onPress={() => void save()} style={[styles.button, busy && { opacity: 0.55 }]}><Save color="#fff" size={19} /><Text style={styles.buttonText}>{busy ? 'Đang lưu...' : 'Lưu thay đổi'}</Text></Pressable></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 22, paddingBottom: 45 },
  avatarWrap: { alignSelf: 'center', position: 'relative', marginTop: 15 },
  camera: { position: 'absolute', right: -3, bottom: -2, width: 31, height: 31, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.canvas },
  hint: { ...typography.caption, color: colors.inkSoft, textAlign: 'center', marginTop: 14, marginBottom: 27 },
  label: { ...typography.caption, color: colors.inkSoft, marginBottom: 7, marginTop: 13 },
  input: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, paddingHorizontal: 15, color: colors.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 14 },
  readonly: { justifyContent: 'center', backgroundColor: '#EEEAE3' },
  readonlyText: { ...typography.body, color: colors.muted },
  button: { height: 53, borderRadius: 16, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 25 },
  buttonText: { ...typography.bodyMedium, color: '#fff' },
});
