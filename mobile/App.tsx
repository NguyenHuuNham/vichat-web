import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppStore } from './src/store/appStore';
import { AppNavigator } from './src/navigation/AppNavigator';
import { registerPushNotifications } from './src/services/notificationService';
import { colors } from './src/theme/colors';

export default function App() {
  const scheme = useColorScheme();
  const boot = useAppStore(state => state.boot);
  const reconnect = useAppStore(state => state.reconnect);

  useEffect(() => {
    void boot();
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') void reconnect();
    });
    const network = NetInfo.addEventListener(state => {
      if (state.isConnected) void reconnect();
    });
    return () => {
      appState.remove();
      network();
    };
  }, [boot, reconnect]);

  useEffect(() => {
    const unsubscribe = useAppStore.subscribe(state => {
      if (state.status === 'ready' && state.session?.user) {
        void registerPushNotifications(state.session.user);
      }
    });
    return unsubscribe;
  }, []);

  const navigationTheme = scheme === 'dark'
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, primary: colors.accent } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: colors.accent, background: colors.canvas } };

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <NavigationContainer theme={navigationTheme}>
          <AppNavigator />
        </NavigationContainer>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </View>
    </SafeAreaProvider>
  );
}
