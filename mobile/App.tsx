import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppStore } from './src/store/appStore';
import { AppNavigator } from './src/navigation/AppNavigator';
import { prepareNotificationPresentation, registerPushNotifications, subscribeToIncomingCallNotificationResponses, subscribeToPushTokenChanges } from './src/services/notificationService';
import { tinodeClient } from './src/services/tinodeClient';
import { AppLockScreen } from './src/components/AppLockScreen';
import { useAppLockStore } from './src/store/appLockStore';
import { consumeTrustedExternalActivity } from './src/services/appLifecycleService';
import { colors } from './src/theme/colors';
import { MobileCallOverlay } from './src/components/MobileCallOverlay';
import { routeMobileCallEvent } from './src/store/callStore';
import {
  IncomingCallNotificationData,
  incomingCallNotificationKey,
  isIncomingCallNotificationFresh,
} from './src/utils/callNotificationPolicy';

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
    // Install the foreground handler before Tinode can receive the first message.
    void prepareNotificationPresentation();
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
        const current = useAppStore.getState();
        if (current.status === 'ready' && current.session?.user) {
          void registerPushNotifications(current.session.user, { retry: true }).then(registration => {
            if (registration) tinodeClient.setDeviceToken(registration.token);
          });
        }
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
    let stopCallResponseListener = () => {};
    const pendingCalls = new Map<string, IncomingCallNotificationData>();
    let flushingCalls = false;

    const flushPendingCalls = async () => {
      if (flushingCalls || !pendingCalls.size) return;
      if (useAppStore.getState().status !== 'ready') return;
      flushingCalls = true;
      try {
        await reconnect();
        if (!tinodeClient.connected || useAppStore.getState().status !== 'ready') return;
        const now = Date.now();
        for (const [key, data] of pendingCalls) {
          if (!isIncomingCallNotificationFresh(data, now)) {
            pendingCalls.delete(key);
            continue;
          }
          routeMobileCallEvent({
            type: 'call-invite',
            topic: data.topic,
            seq: data.seq,
            from: data.from,
            audioOnly: data.audioOnly,
          }, { name: data.peerName, avatar: data.peerAvatar });
          pendingCalls.delete(key);
        }
      } catch {
        // Keep the invite queued; a later reconnect or ready-state change retries it.
      } finally {
        flushingCalls = false;
      }
    };

    const routeNotificationCall = (data: IncomingCallNotificationData) => {
      if (!isIncomingCallNotificationFresh(data)) return;
      pendingCalls.set(incomingCallNotificationKey(data), data);
      void flushPendingCalls();
    };

    void subscribeToPushTokenChanges(registration => tinodeClient.setDeviceToken(registration.token)).then(stop => { stopTokenListener = stop; });
    void subscribeToIncomingCallNotificationResponses(routeNotificationCall).then(stop => { stopCallResponseListener = stop; });
    const registerCurrentUser = (retry = false) => {
      const current = useAppStore.getState();
      if (current.status !== 'ready' || !current.session?.user) return;
      void registerPushNotifications(current.session.user, { retry }).then(registration => {
        if (registration) tinodeClient.setDeviceToken(registration.token);
      });
    };
    const unsubscribe = useAppStore.subscribe(state => {
      if (state.status === 'signed_out') pendingCalls.clear();
      if (state.status === 'ready' && state.session?.user) void registerCurrentUser();
      if (state.status === 'ready') void flushPendingCalls();
    });
    registerCurrentUser();
    return () => {
      pendingCalls.clear();
      unsubscribe();
      stopTokenListener();
      stopCallResponseListener();
    };
  }, [reconnect]);

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
        {appStatus === 'ready' ? <MobileCallOverlay /> : null}
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </View>
    </SafeAreaProvider>
  );
}
