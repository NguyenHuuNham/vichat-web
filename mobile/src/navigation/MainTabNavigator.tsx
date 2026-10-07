import { Pressable, StyleSheet, View } from 'react-native';
import { BottomTabBarButtonProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MessageCircleMore, ContactRound, Cloud, Blocks, Settings } from 'lucide-react-native';
import { MainTabParamList } from './types';
import { ConversationListScreen } from '../screens/chat/ConversationListScreen';
import { ContactsScreen } from '../screens/contacts/ContactsScreen';
import { PersonalCloudScreen } from '../screens/cloud/PersonalCloudScreen';
import { WorkspaceScreen } from '../modules/workspace';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { colorsForTheme, shadow, ThemeColors } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeStore } from '../store/themeStore';
import { useI18n } from '../store/languageStore';

const Tab = createBottomTabNavigator<MainTabParamList>();
const icons = { Chats: MessageCircleMore, Contacts: ContactRound, Cloud, Workspace: Blocks, Settings };

export function MainTabNavigator() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(0, insets.bottom);
  const palette = colorsForTheme(useThemeStore(state => state.resolved));
  const { t } = useI18n();

  return (
    <Tab.Navigator backBehavior="history" screenOptions={({ route }) => {
      const Icon = icons[route.name];
      return {
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: palette.accentDeep,
        tabBarInactiveTintColor: palette.muted,
        // Extend the tab surface through the transparent system inset so no page
        // content shows through below the floating bar.
        tabBarStyle: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 72 + bottomInset, paddingHorizontal: 5, paddingTop: 5, paddingBottom: 5 + bottomInset, borderWidth: 1, borderColor: palette.line, borderRadius: 0, backgroundColor: palette.paper, ...shadow },
        tabBarItemStyle: { borderRadius: 0, marginHorizontal: 0 },
        tabBarLabelStyle: { fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 11, marginBottom: 3 },
        tabBarButton: props => <FloatingTabButton {...props} palette={palette} />,
        tabBarIcon: ({ color, size, focused }) => <View style={[styles.iconWrap, focused && styles.iconWrapActive, focused && { backgroundColor: palette.accentWash }]}><Icon color={color} size={size} strokeWidth={2.2} /></View>,
      };
    }}>
      <Tab.Screen name="Chats" component={ConversationListScreen} options={{ title: t('Tin nhắn') }} />
      <Tab.Screen name="Contacts" component={ContactsScreen} options={{ title: t('Danh bạ') }} />
      <Tab.Screen name="Cloud" component={PersonalCloudScreen} options={{ title: 'Cloud' }} />
      <Tab.Screen name="Workspace" component={WorkspaceScreen} options={{ title: 'Workspace' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: t('Cài đặt') }} />
    </Tab.Navigator>
  );
}

function FloatingTabButton({ children, style, onPress, onLongPress, accessibilityState, accessibilityLabel, testID, palette }: BottomTabBarButtonProps & { palette: ThemeColors }) {
  const active = accessibilityState?.selected;
  return <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityState={accessibilityState} accessibilityLabel={accessibilityLabel} testID={testID} style={[styles.tabButton, active && { backgroundColor: palette.accentWash }, style]}>{children}</Pressable>;
}

const styles = StyleSheet.create({
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { minWidth: 32, minHeight: 28, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { transform: [{ translateY: -1 }] },
});
