import { Pressable, StyleSheet, View } from 'react-native';
import { BottomTabBarButtonProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MessageCircleMore, ContactRound, Blocks, Settings } from 'lucide-react-native';
import { MainTabParamList } from './types';
import { ConversationListScreen } from '../screens/chat/ConversationListScreen';
import { ContactsScreen } from '../screens/contacts/ContactsScreen';
import { WorkspaceScreen } from '../screens/workspace/WorkspaceScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { colors, shadow } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const Tab = createBottomTabNavigator<MainTabParamList>();
const icons = { Chats: MessageCircleMore, Contacts: ContactRound, Workspace: Blocks, Settings };

export function MainTabNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator screenOptions={({ route }) => {
      const Icon = icons[route.name];
      return {
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.accentDeep,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { position: 'absolute', left: 14, right: 14, bottom: Math.max(10, insets.bottom), height: 72, paddingHorizontal: 5, paddingTop: 5, paddingBottom: 5, borderWidth: 1, borderColor: colors.line, borderRadius: 36, backgroundColor: colors.paper, ...shadow },
        tabBarItemStyle: { borderRadius: 28, marginHorizontal: 2 },
        tabBarLabelStyle: { fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 11, marginBottom: 3 },
        tabBarButton: props => <FloatingTabButton {...props} />,
        tabBarIcon: ({ color, size, focused }) => <View style={[styles.iconWrap, focused && styles.iconWrapActive]}><Icon color={color} size={size} strokeWidth={2.2} /></View>,
      };
    }}>
      <Tab.Screen name="Chats" component={ConversationListScreen} options={{ title: 'Tin nhắn' }} />
      <Tab.Screen name="Contacts" component={ContactsScreen} options={{ title: 'Danh bạ' }} />
      <Tab.Screen name="Workspace" component={WorkspaceScreen} options={{ title: 'Workspace' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Cài đặt' }} />
    </Tab.Navigator>
  );
}

function FloatingTabButton({ children, style, onPress, onLongPress, accessibilityState, accessibilityLabel, testID }: BottomTabBarButtonProps) {
  const active = accessibilityState?.selected;
  return <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityState={accessibilityState} accessibilityLabel={accessibilityLabel} testID={testID} style={[styles.tabButton, active && styles.tabButtonActive, style]}>{children}</Pressable>;
}

const styles = StyleSheet.create({
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabButtonActive: { backgroundColor: colors.accentWash },
  iconWrap: { minWidth: 32, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { transform: [{ translateY: -1 }] },
});
