import { useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Check, ImagePlus, UsersRound } from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { useThemePalette } from '../../theme/useThemePalette';
import { Avatar } from '../../components/Avatar';
import { SearchField } from '../../components/SearchField';
import { PickerFile } from '../../types';
import { beginTrustedExternalActivity } from '../../services/appLifecycleService';

type Props = NativeStackScreenProps<RootStackParamList, 'NewGroup'>;
type SelectedParticipant = { accountId: string; name: string; tinodeUid?: string };

export function NewGroupScreen({ navigation }: Props) {
  const palette = useThemePalette();
  const styles = createStyles(palette);
  const directory = useAppStore(state => state.directory);
  const currentUserId = useAppStore(state => state.session?.user.id);
  const createGroup = useAppStore(state => state.createGroupConversation);
  const [subject, setSubject] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SelectedParticipant[]>([]);
  const requestKey = useRef(`mobile-group-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [avatarFile, setAvatarFile] = useState<PickerFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const contacts = useMemo(() => directory.filter(user => user.id !== currentUserId && user.name.toLowerCase().includes(query.toLowerCase())), [currentUserId, directory, query]);
  const submit = async () => {
    if (!subject.trim()) { setError('Nhập tên nhóm.'); return; }
    if (selected.length < 1) { setError('Chọn ít nhất 1 đồng nghiệp.'); return; }
    setBusy(true); setError('');
    try {
      const conversation = await createGroup(subject.trim(), selected.map(item => item.accountId), avatarFile, requestKey.current);
      navigation.replace('ChatDetail', { conversationId: conversation.id });
    } catch (value) { setError(value instanceof Error ? value.message : 'Không tạo được nhóm.'); } finally { setBusy(false); }
  };
  const chooseAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError('ViChat cần quyền truy cập ảnh để đặt avatar nhóm.'); return; }
    beginTrustedExternalActivity();
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    const asset: any = !result.canceled ? result.assets?.[0] : null;
    if (asset) setAvatarFile({ uri: asset.uri, name: asset.fileName || 'group-avatar.jpg', type: asset.mimeType || 'image/jpeg', size: asset.fileSize });
  };
  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.form}><Text style={styles.label}>Tên nhóm</Text><TextInput value={subject} onChangeText={setSubject} placeholder="Ví dụ: Phòng vận hành" placeholderTextColor={palette.muted} style={styles.input} /><Pressable onPress={() => void chooseAvatar()} style={styles.avatarPicker}><Avatar name={subject || 'Nhóm'} uri={avatarFile?.uri} size={58} rounded={false} /><View style={styles.avatarCopy}><Text style={styles.label}>Avatar nhóm</Text><Text style={styles.meta}>{avatarFile ? 'Đã chọn ảnh · chạm để đổi' : 'Chạm để tải ảnh lên'}</Text></View><ImagePlus color={palette.accent} size={21} /></Pressable><View style={styles.rowTitle}><Text style={styles.label}>Thành viên ban đầu</Text><Text style={styles.count}>{selected.length} đã chọn</Text></View><SearchField value={query} onChangeText={setQuery} placeholder="Tìm nhân viên" /></View>
        <FlatList data={contacts} keyExtractor={item => item.id} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" renderItem={({ item }) => { const active = selected.some(value => value.accountId === item.id); return <Pressable onPress={() => setSelected(value => active ? value.filter(member => member.accountId !== item.id) : [...value, { accountId: item.id, name: item.name, tinodeUid: item.tinodeUid || item.uid }])} style={styles.contact}><Avatar name={item.name} uri={item.avatar} size={43} /><View style={{ flex: 1 }}><Text style={styles.name}>{item.name}</Text><Text style={styles.meta}>{item.department || item.title || 'Nhân viên'}</Text></View><View style={[styles.checkbox, active && styles.checkboxActive]}>{active ? <Check color="#fff" size={15} /> : null}</View></Pressable>; }} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.footer}><Pressable onPress={submit} disabled={busy} style={[styles.button, busy && { opacity: 0.55 }]}><UsersRound color="#fff" size={19} /><Text style={styles.buttonText}>{busy ? 'Đang tạo...' : 'Tạo nhóm'}</Text></Pressable><Text style={styles.note}>Chọn ít nhất 1 thành viên. Bạn có thể thêm người sau khi tạo nhóm.</Text></View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: palette.canvas },
  form: { padding: 20, gap: 10 },
  label: { ...typography.bodyMedium, color: palette.ink },
  input: { height: 50, borderRadius: 16, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, paddingHorizontal: 15, color: palette.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 14, marginBottom: 6 },
  avatarPicker: { minHeight: 74, padding: 8, borderRadius: 17, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 6 },
  avatarCopy: { flex: 1, gap: 2 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { ...typography.caption, color: palette.accentDeep },
  list: { paddingHorizontal: 20, paddingBottom: 8 },
  contact: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: palette.line },
  name: { ...typography.bodyMedium, color: palette.ink },
  meta: { ...typography.caption, color: palette.inkSoft, marginTop: 2 },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.paper },
  button: { height: 51, borderRadius: 16, backgroundColor: palette.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { ...typography.bodyMedium, color: '#fff' },
  note: { ...typography.caption, color: palette.inkSoft, textAlign: 'center', marginTop: 9 },
  error: { ...typography.caption, color: palette.danger, paddingHorizontal: 20, paddingBottom: 7 },
  });
}
