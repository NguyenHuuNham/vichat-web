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
import { GroupInfoScreen } from '../screens/chat/GroupInfoScreen';
import { UserProfileScreen } from '../screens/contacts/UserProfileScreen';
import { WorkspaceDetailScreen } from '../screens/workspace/WorkspaceDetailScreen';
import { EditProfileScreen } from '../screens/settings/EditProfileScreen';
import { LinkedDevicesScreen } from '../screens/settings/LinkedDevicesScreen';
import { colorsForTheme } from '../theme/colors';
import { useThemeStore } from '../store/themeStore';
import { typography } from '../theme/typography';
import { GonLogo } from '../components/GonLogo';
import { config } from '../constants/config';
import { useI18n } from '../store/languageStore';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function LaunchScreen({ fontsLoaded, palette }: { fontsLoaded: boolean; palette: ReturnType<typeof colorsForTheme> }) {
  return (
    <View style={[styles.launch, { backgroundColor: palette.canvas }]}>
      <View style={[styles.mark, { backgroundColor: palette.paper }]}><GonLogo size={68} /></View>
      <Text
        allowFontScaling={false}
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        numberOfLines={1}
        style={[styles.brand, { color: palette.ink }, fontsLoaded && styles.brandFont]}
      >
        {config.brandLabel}
      </Text>
      <ActivityIndicator color={palette.accent} style={{ marginTop: 28 }} />
    </View>
  );
}

export function AppNavigator() {
  const status = useAppStore(state => state.status);
  const session = useAppStore(state => state.session);
  const resolvedTheme = useThemeStore(state => state.resolved);
  const { t } = useI18n();
  const palette = colorsForTheme(resolvedTheme);
  const [fontsLoaded] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    BeVietnamPro_800ExtraBold,
  });

  if (!fontsLoaded || status === 'booting' || (status === 'loading' && !session)) return <LaunchScreen fontsLoaded={fontsLoaded} palette={palette} />;

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
      headerBackTitle: t('Quay lại'),
      headerStyle: { backgroundColor: palette.canvas },
      headerTitleStyle: { fontFamily: 'BeVietnamPro_700Bold', color: palette.ink },
      headerTintColor: palette.ink,
      contentStyle: { backgroundColor: palette.canvas },
    }}>
      <RootStack.Screen name="Main" component={MainTabNavigator} options={{ headerShown: false }} />
      <RootStack.Screen name="ChatDetail" component={ChatDetailScreen} options={{ headerShown: false, animation: 'slide_from_right' }} />
      <RootStack.Screen name="GroupInfo" component={GroupInfoScreen} options={{ headerShown: false, animation: 'slide_from_right' }} />
      <RootStack.Screen name="NewGroup" component={NewGroupScreen} options={{ title: t('Tạo nhóm mới'), presentation: 'modal' }} />
      <RootStack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: t('Hồ sơ nhân viên') }} />
      <RootStack.Screen name="WorkspaceDetail" component={WorkspaceDetailScreen} options={{ title: t('Chi tiết công việc') }} />
      <RootStack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: t('Cập nhật hồ sơ') }} />
      <RootStack.Screen name="LinkedDevices" component={LinkedDevicesScreen} options={{ headerShown: false, animation: 'slide_from_right' }} />
    </RootStack.Navigator>
  );
}

const styles = StyleSheet.create({
  launch: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  mark: { width: 92, height: 92, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: 1.7, marginTop: 18, includeFontPadding: false },
  brandFont: { fontFamily: 'BeVietnamPro_700Bold' },
});
