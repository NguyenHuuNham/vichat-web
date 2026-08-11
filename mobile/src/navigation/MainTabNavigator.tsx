import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MessageCircleMore, ContactRound, Blocks, Settings } from 'lucide-react-native';
import { MainTabParamList } from './types';
import { ConversationListScreen } from '../screens/chat/ConversationListScreen';
import { ContactsScreen } from '../screens/contacts/ContactsScreen';
import { WorkspaceScreen } from '../screens/workspace/WorkspaceScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { colors } from '../theme/colors';

const Tab = createBottomTabNavigator<MainTabParamList>();
const icons = { Chats: MessageCircleMore, Contacts: ContactRound, Workspace: Blocks, Settings };

export function MainTabNavigator() {
  return (
    <Tab.Navigator screenOptions={({ route }) => {
      const Icon = icons[route.name];
      return {
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { height: 74, paddingTop: 9, paddingBottom: 10, borderTopColor: colors.line, backgroundColor: colors.paper },
        tabBarLabelStyle: { fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 11 },
        tabBarIcon: ({ color, size }) => <Icon color={color} size={size} strokeWidth={2.2} />,
      };
    }}>
      <Tab.Screen name="Chats" component={ConversationListScreen} options={{ title: 'Tin nhắn' }} />
      <Tab.Screen name="Contacts" component={ContactsScreen} options={{ title: 'Danh bạ' }} />
      <Tab.Screen name="Workspace" component={WorkspaceScreen} options={{ title: 'Workspace' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Cài đặt' }} />
    </Tab.Navigator>
  );
}
