import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check, UsersRound } from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import { SearchField } from '../../components/SearchField';

type Props = NativeStackScreenProps<RootStackParamList, 'NewGroup'>;

export function NewGroupScreen({ navigation }: Props) {
  const directory = useAppStore(state => state.directory);
  const currentUserId = useAppStore(state => state.session?.user.id);
  const createGroup = useAppStore(state => state.createGroupConversation);
  const [subject, setSubject] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const contacts = useMemo(() => directory.filter(user => user.id !== currentUserId && user.name.toLowerCase().includes(query.toLowerCase())), [currentUserId, directory, query]);
  const submit = async () => {
    if (!subject.trim()) { setError('Nhập tên nhóm.'); return; }
    if (selected.length < 2) { setError('Chọn ít nhất 2 đồng nghiệp.'); return; }
    setBusy(true); setError('');
    try { const conversation = await createGroup(subject.trim(), selected); navigation.replace('ChatDetail', { conversationId: conversation.id }); } catch (value) { setError(value instanceof Error ? value.message : 'Không tạo được nhóm.'); } finally { setBusy(false); }
  };
  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.form}><Text style={styles.label}>Tên nhóm</Text><TextInput value={subject} onChangeText={setSubject} placeholder="Ví dụ: Phòng vận hành" placeholderTextColor={colors.muted} style={styles.input} /><View style={styles.rowTitle}><Text style={styles.label}>Thành viên ban đầu</Text><Text style={styles.count}>{selected.length} đã chọn</Text></View><SearchField value={query} onChangeText={setQuery} placeholder="Tìm nhân viên" /></View>
        <FlatList data={contacts} keyExtractor={item => item.id} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" renderItem={({ item }) => { const active = selected.includes(item.id); return <Pressable onPress={() => setSelected(value => active ? value.filter(id => id !== item.id) : [...value, item.id])} style={styles.contact}><Avatar name={item.name} uri={item.avatar} size={43} /><View style={{ flex: 1 }}><Text style={styles.name}>{item.name}</Text><Text style={styles.meta}>{item.department || item.title || 'Nhân viên'}</Text></View><View style={[styles.checkbox, active && styles.checkboxActive]}>{active ? <Check color="#fff" size={15} /> : null}</View></Pressable>; }} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.footer}><Pressable onPress={submit} disabled={busy} style={[styles.button, busy && { opacity: 0.55 }]}><UsersRound color="#fff" size={19} /><Text style={styles.buttonText}>{busy ? 'Đang tạo...' : 'Tạo nhóm'}</Text></Pressable><Text style={styles.note}>Thành viên chỉ được chọn khi tạo nhóm. Mobile không có luồng thêm thành viên sau đó.</Text></View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.canvas },
  form: { padding: 20, gap: 10 },
  label: { ...typography.bodyMedium, color: colors.ink },
  input: { height: 50, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, paddingHorizontal: 15, color: colors.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 14, marginBottom: 6 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { ...typography.caption, color: colors.accentDeep },
  list: { paddingHorizontal: 20, paddingBottom: 8 },
  contact: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: colors.line },
  name: { ...typography.bodyMedium, color: colors.ink },
  meta: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper },
  button: { height: 51, borderRadius: 16, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { ...typography.bodyMedium, color: '#fff' },
  note: { ...typography.caption, color: colors.inkSoft, textAlign: 'center', marginTop: 9 },
  error: { ...typography.caption, color: colors.danger, paddingHorizontal: 20, paddingBottom: 7 },
});
