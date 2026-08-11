import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppStore } from './src/store/appStore';
import { AppNavigator } from './src/navigation/AppNavigator';
import { registerPushNotifications, subscribeToPushTokenChanges } from './src/services/notificationService';
import { tinodeClient } from './src/services/tinodeClient';
import { AppLockScreen } from './src/components/AppLockScreen';
import { useAppLockStore } from './src/store/appLockStore';
import { consumeTrustedExternalActivity } from './src/services/appLifecycleService';
import { colors } from './src/theme/colors';

export default function App() {
  const scheme = useColorScheme();
  const boot = useAppStore(state => state.boot);
  const reconnect = useAppStore(state => state.reconnect);
  const appStatus = useAppStore(state => state.status);
  const initializeAppLock = useAppLockStore(state => state.initialize);
  const appLockInitialized = useAppLockStore(state => state.initialized);
  const appLockConfigured = useAppLockStore(state => state.configured);
  const appLocked = useAppLockStore(state => state.locked);
  const lockApp = useAppLockStore(state => state.lock);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    void boot();
    void initializeAppLock();
    const appState = AppState.addEventListener('change', state => {
      if (state === 'background') {
        backgroundAt.current = Date.now();
        return;
      }
      if (state === 'active') {
        const wasExternalActivity = consumeTrustedExternalActivity();
        if (!wasExternalActivity && backgroundAt.current) lockApp();
        backgroundAt.current = null;
        void reconnect();
      }
    });
    const network = NetInfo.addEventListener(state => {
      if (state.isConnected) void reconnect();
    });
    return () => {
      appState.remove();
      network();
    };
  }, [boot, initializeAppLock, lockApp, reconnect]);

  useEffect(() => {
    let stopTokenListener = () => {};
    void subscribeToPushTokenChanges(registration => tinodeClient.setDeviceToken(registration.token)).then(stop => { stopTokenListener = stop; });
    const unsubscribe = useAppStore.subscribe(state => {
      if (state.status === 'ready' && state.session?.user) {
        void registerPushNotifications(state.session.user).then(registration => {
          if (registration) tinodeClient.setDeviceToken(registration.token);
        });
      }
    });
    return () => { unsubscribe(); stopTokenListener(); };
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
        {appStatus === 'ready' && appLockInitialized && appLockConfigured && appLocked ? <AppLockScreen /> : null}
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </View>
    </SafeAreaProvider>
  );
}
