import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useRef } from 'react';
import { AppState, BackHandler, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, BeVietnamPro_400Regular, BeVietnamPro_500Medium, BeVietnamPro_600SemiBold, BeVietnamPro_700Bold, BeVietnamPro_800ExtraBold } from '@expo-google-fonts/be-vietnam-pro';
import NetInfo from '@react-native-community/netinfo';
import { NavigationContainer, DefaultTheme, DarkTheme, useNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppStore } from './src/store/appStore';
import { AppNavigator, LaunchScreen } from './src/navigation/AppNavigator';
import { prepareNotificationPresentation, registerPushNotifications, subscribeToIncomingCallNotificationResponses, subscribeToPushTokenChanges } from './src/services/notificationService';
import { tinodeClient } from './src/services/tinodeClient';
import { AppLockScreen } from './src/components/AppLockScreen';
import { useAppLockStore } from './src/store/appLockStore';
import { consumeTrustedExternalActivity, isTrustedExternalActivity } from './src/services/appLifecycleService';
import { colorsForTheme } from './src/theme/colors';
import { useThemeStore } from './src/store/themeStore';
import { useLanguageStore } from './src/store/languageStore';
import { flushNativeNameCache, loadNativeNameCache } from './src/services/nativeNameCache';
import { MobileCallOverlay } from './src/components/MobileCallOverlay';
import { routeMobileCallEvent } from './src/store/callStore';
import { RootStackParamList } from './src/navigation/types';
import {
  IncomingCallNotificationData,
  incomingCallNotificationKey,
  isIncomingCallNotificationFresh,
} from './src/utils/callNotificationPolicy';

void SplashScreen.preventAutoHideAsync().catch(() => {});

async function syncCurrentPushRegistration(retry = false) {
  const current = useAppStore.getState();
  if (current.status === 'signed_out' || !current.session?.user) return null;
  const registration = await registerPushNotifications(current.session.user, { retry });
  if (registration) tinodeClient.setDeviceToken(registration.token);
  return registration;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    BeVietnamPro_800ExtraBold,
  });
  const resolvedTheme = useThemeStore(state => state.resolved);
  const themeInitialized = useThemeStore(state => state.initialized);
  const initializeTheme = useThemeStore(state => state.initialize);
  const languageInitialized = useLanguageStore(state => state.initialized);
  const initializeLanguage = useLanguageStore(state => state.initialize);
  const boot = useAppStore(state => state.boot);
  const reconnect = useAppStore(state => state.reconnect);
  const appStatus = useAppStore(state => state.status);
  const initializeAppLock = useAppLockStore(state => state.initialize);
  const appLockInitialized = useAppLockStore(state => state.initialized);
  const appLockConfigured = useAppLockStore(state => state.configured);
  const appLocked = useAppLockStore(state => state.locked);
  const lockApp = useAppLockStore(state => state.lock);
  const backgroundAt = useRef<number | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const backgroundTransition = useRef<Promise<void> | null>(null);
  const shellReady = fontsLoaded && themeInitialized && languageInitialized && appLockInitialized;
  const palette = colorsForTheme(resolvedTheme);
  const navigationRef = useNavigationContainerRef<RootStackParamList>();

  useEffect(() => {
    if (!shellReady || appStatus === 'booting' || appStatus === 'signed_out') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!navigationRef.isReady()) return false;
      if (navigationRef.canGoBack()) {
        navigationRef.goBack();
        return true;
      }

      const rootState = navigationRef.getRootState();
      if (!rootState) return true;
      const mainRoute = rootState.routes.find(route => route.name === 'Main');
      const tabState = mainRoute?.state;
      const currentTab = tabState?.routes?.[tabState.index ?? 0]?.name;
      if (currentTab && currentTab !== 'Chats') {
        navigationRef.navigate('Main', { screen: 'Chats' });
      }
      return true;
    });
    return () => subscription.remove();
  }, [appStatus, navigationRef, shellReady]);

  useEffect(() => {
    void loadNativeNameCache();
    // Install the foreground handler before Tinode can receive the first message.
    void prepareNotificationPresentation();
    void boot();
    void initializeTheme();
    void initializeLanguage();
    void initializeAppLock();
    const appState = AppState.addEventListener('change', state => {
      appStateRef.current = state;
      if (state === 'background') {
        backgroundAt.current = Date.now();
        void flushNativeNameCache();
        if (isTrustedExternalActivity()) return;
        if (!backgroundTransition.current) {
          const transition = (async () => {
            // Finish native token registration before closing Tinode. Otherwise
            // Android can suspend the JS runtime before FCM has a token.
            await syncCurrentPushRegistration(true);
            await tinodeClient.suspendForBackground();
          })().catch(() => {});
          backgroundTransition.current = transition;
          void transition.then(() => {
            if (backgroundTransition.current === transition) backgroundTransition.current = null;
          });
        }
        return;
      }
      if (state === 'active') {
        const wasExternalActivity = consumeTrustedExternalActivity();
        if (!wasExternalActivity && backgroundAt.current) lockApp();
        backgroundAt.current = null;
        if (wasExternalActivity && tinodeClient.connected) return;
        void (async () => {
          await backgroundTransition.current?.catch(() => {});
          await syncCurrentPushRegistration(true);
          await reconnect();
        })().catch(() => {});
      }
    });
    const network = NetInfo.addEventListener(state => {
      if (state.isConnected && appStateRef.current === 'active') void reconnect();
    });
    return () => {
      appState.remove();
      network();
    };
  }, [boot, initializeAppLock, initializeLanguage, initializeTheme, lockApp, reconnect]);

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
      void syncCurrentPushRegistration(retry);
    };
    const unsubscribeConnection = tinodeClient.onEvent(event => {
      if (event.type === 'connection' && event.state === 'connected' && tinodeClient.connected) registerCurrentUser(true);
    });
    const unsubscribe = useAppStore.subscribe(state => {
      if (state.status === 'signed_out') pendingCalls.clear();
      if (state.status !== 'booting' && state.status !== 'signed_out' && state.session?.user) {
        void registerCurrentUser();
      }
      if (state.status === 'ready') void flushPendingCalls();
    });
    registerCurrentUser();
    return () => {
      pendingCalls.clear();
      unsubscribe();
      unsubscribeConnection();
      stopTokenListener();
      stopCallResponseListener();
    };
  }, [reconnect]);

  useEffect(() => {
    if (!shellReady) return;
    NavigationBar.setStyle(resolvedTheme === 'dark' ? 'light' : 'dark');
    void (async () => {
      // Paint the native root before removing the splash to avoid a light flash in dark mode.
      await SystemUI.setBackgroundColorAsync(palette.canvas).catch(() => {});
      await SplashScreen.hideAsync().catch(() => {});
    })();
  }, [palette.canvas, resolvedTheme, shellReady]);

  const navigationTheme = resolvedTheme === 'dark'
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, primary: palette.accent, background: palette.canvas, card: palette.paper, text: palette.ink, border: palette.line } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: palette.accent, background: palette.canvas, card: palette.paper, text: palette.ink, border: palette.line } };

  if (!shellReady) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: palette.canvas }}>
          <LaunchScreen fontsLoaded={fontsLoaded} palette={palette} />
          <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: palette.canvas }}>
        <NavigationContainer ref={navigationRef} theme={navigationTheme}>
          <AppNavigator />
        </NavigationContainer>
        {appStatus === 'ready' && appLockInitialized && appLockConfigured && appLocked ? <AppLockScreen /> : null}
        {appStatus === 'ready' ? <MobileCallOverlay /> : null}
        <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
      </View>
    </SafeAreaProvider>
  );
}
