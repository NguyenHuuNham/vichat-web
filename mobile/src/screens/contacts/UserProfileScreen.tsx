import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BriefcaseBusiness, Building2, MessageCircle, ShieldCheck } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { ThemeColors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { useThemePalette } from '../../theme/useThemePalette';
import { Avatar } from '../../components/Avatar';
import { displayRoleName } from '../../utils/tenantDisplay';
import { useI18n } from '../../store/languageStore';

type Props = NativeStackScreenProps<RootStackParamList, 'UserProfile'>;

export function UserProfileScreen({ route, navigation }: Props) {
  const palette = useThemePalette();
  const styles = createStyles(palette);
  const { t } = useI18n();
  const user = route.params.user;
  const createDirect = useAppStore(state => state.createDirectConversation);
  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}><Avatar name={user.name} uri={user.avatar} size={92} online={user.online} /><Text style={styles.name}>{user.name}</Text><Text style={styles.title}>{user.title || t('Nhân viên công ty')}</Text><View style={styles.status}><ShieldCheck color={palette.online} size={15} /><Text style={styles.statusText}>{t('Nhân viên active cùng tenant')}</Text></View></View>
        <View style={styles.card}><View style={styles.info}><Building2 color={palette.accent} size={20} /><View><Text style={styles.label}>{t('Phòng ban')}</Text><Text style={styles.value}>{user.department || t('Chưa cập nhật')}</Text></View></View><View style={styles.divider} /><View style={styles.info}><BriefcaseBusiness color={palette.accent} size={20} /><View><Text style={styles.label}>{t('Vai trò')}</Text><Text style={styles.value}>{user.title || displayRoleName(user.role, t('Nhân viên'))}</Text></View></View></View>
        <Pressable onPress={async () => { const conversation = await createDirect(user); navigation.replace('ChatDetail', { conversationId: conversation.id }); }} style={styles.button}><MessageCircle color="#fff" size={20} /><Text style={styles.buttonText}>{t('Nhắn tin ngay')}</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  content: { padding: 22, paddingBottom: 40 },
  hero: { alignItems: 'center', paddingTop: 15, paddingBottom: 26 },
  name: { ...typography.heading, color: palette.ink, marginTop: 15 },
  title: { ...typography.body, color: palette.inkSoft, marginTop: 3 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: `${palette.online}18` },
  statusText: { ...typography.caption, color: palette.online },
  card: { backgroundColor: palette.paper, borderRadius: 22, padding: 17, ...shadow },
  info: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  label: { ...typography.caption, color: palette.muted },
  value: { ...typography.bodyMedium, color: palette.ink, marginTop: 2 },
  divider: { height: 1, backgroundColor: palette.line, marginVertical: 15 },
  button: { height: 54, borderRadius: 17, backgroundColor: palette.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 20 },
  buttonText: { ...typography.bodyMedium, color: '#fff' },
  });
}
