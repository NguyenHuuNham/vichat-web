import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BriefcaseBusiness, Building2, MessageCircle, ShieldCheck } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { colors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';

type Props = NativeStackScreenProps<RootStackParamList, 'UserProfile'>;

export function UserProfileScreen({ route, navigation }: Props) {
  const user = route.params.user;
  const createDirect = useAppStore(state => state.createDirectConversation);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}><Avatar name={user.name} uri={user.avatar} size={92} online={user.online} /><Text style={styles.name}>{user.name}</Text><Text style={styles.title}>{user.title || 'Nhân viên công ty'}</Text><View style={styles.status}><ShieldCheck color={colors.online} size={15} /><Text style={styles.statusText}>Nhân viên active cùng tenant</Text></View></View>
      <View style={styles.card}><View style={styles.info}><Building2 color={colors.accent} size={20} /><View><Text style={styles.label}>Phòng ban</Text><Text style={styles.value}>{user.department || 'Chưa cập nhật'}</Text></View></View><View style={styles.divider} /><View style={styles.info}><BriefcaseBusiness color={colors.accent} size={20} /><View><Text style={styles.label}>Vai trò</Text><Text style={styles.value}>{user.title || user.role || 'Nhân viên'}</Text></View></View></View>
      <Pressable onPress={async () => { const conversation = await createDirect(user); navigation.replace('ChatDetail', { conversationId: conversation.id }); }} style={styles.button}><MessageCircle color="#fff" size={20} /><Text style={styles.buttonText}>Nhắn tin ngay</Text></Pressable>
      <Text style={styles.note}>ViChat không hiển thị email dài dòng trong danh bạ. Thông tin định danh vẫn được quản lý an toàn bởi UpGO Account.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 22, paddingBottom: 40 },
  hero: { alignItems: 'center', paddingTop: 15, paddingBottom: 26 },
  name: { ...typography.heading, color: colors.ink, marginTop: 15 },
  title: { ...typography.body, color: colors.inkSoft, marginTop: 3 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: '#E8F7F0' },
  statusText: { ...typography.caption, color: colors.online },
  card: { backgroundColor: colors.paper, borderRadius: 22, padding: 17, ...shadow },
  info: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  label: { ...typography.caption, color: colors.muted },
  value: { ...typography.bodyMedium, color: colors.ink, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 15 },
  button: { height: 54, borderRadius: 17, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 20 },
  buttonText: { ...typography.bodyMedium, color: '#fff' },
  note: { ...typography.caption, color: colors.inkSoft, textAlign: 'center', marginTop: 18, paddingHorizontal: 10 },
});
