import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts, BeVietnamPro_400Regular, BeVietnamPro_500Medium, BeVietnamPro_600SemiBold, BeVietnamPro_700Bold, BeVietnamPro_800ExtraBold } from '@expo-google-fonts/be-vietnam-pro';
import { useAppStore } from '../store/appStore';
import { RootStackParamList, AuthStackParamList } from './types';
import { MainTabNavigator } from './MainTabNavigator';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { ChatDetailScreen } from '../screens/chat/ChatDetailScreen';
import { NewGroupScreen } from '../screens/chat/NewGroupScreen';
import { UserProfileScreen } from '../screens/contacts/UserProfileScreen';
import { WorkspaceDetailScreen } from '../screens/workspace/WorkspaceDetailScreen';
import { EditProfileScreen } from '../screens/settings/EditProfileScreen';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function LaunchScreen() {
  return (
    <View style={styles.launch}>
      <View style={styles.mark}><Text style={styles.markText}>V</Text></View>
      <Text style={styles.brand}>ViChat</Text>
      <Text style={styles.tagline}>Một nhịp làm việc. Một luồng trò chuyện.</Text>
      <ActivityIndicator color={colors.accent} style={{ marginTop: 28 }} />
    </View>
  );
}

export function AppNavigator() {
  const status = useAppStore(state => state.status);
  const [fontsLoaded] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    BeVietnamPro_800ExtraBold,
  });

  if (!fontsLoaded || status === 'booting') return <LaunchScreen />;

  if (status === 'signed_out') {
    return (
      <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ animation: 'slide_from_right' }} />
      </AuthStack.Navigator>
    );
  }

  return (
    <RootStack.Navigator screenOptions={{
      headerShadowVisible: false,
      headerBackTitle: 'Quay lại',
      headerStyle: { backgroundColor: colors.canvas },
      headerTitleStyle: { fontFamily: 'BeVietnamPro_700Bold', color: colors.ink },
      contentStyle: { backgroundColor: colors.canvas },
    }}>
      <RootStack.Screen name="Main" component={MainTabNavigator} options={{ headerShown: false }} />
      <RootStack.Screen name="ChatDetail" component={ChatDetailScreen} options={{ headerShown: false, animation: 'slide_from_right' }} />
      <RootStack.Screen name="NewGroup" component={NewGroupScreen} options={{ title: 'Tạo nhóm mới', presentation: 'modal' }} />
      <RootStack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: 'Hồ sơ nhân viên' }} />
      <RootStack.Screen name="WorkspaceDetail" component={WorkspaceDetailScreen} options={{ title: 'Chi tiết công việc' }} />
      <RootStack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Cập nhật hồ sơ' }} />
    </RootStack.Navigator>
  );
}

const styles = StyleSheet.create({
  launch: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas, padding: 32 },
  mark: { width: 82, height: 82, borderRadius: 26, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-6deg' }] },
  markText: { color: '#fff', fontFamily: 'BeVietnamPro_800ExtraBold', fontSize: 42, transform: [{ rotate: '6deg' }] },
  brand: { ...typography.display, color: colors.ink, marginTop: 20 },
  tagline: { ...typography.body, color: colors.inkSoft, textAlign: 'center', marginTop: 8 },
});
