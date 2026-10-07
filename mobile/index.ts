import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import './src/polyfills/intlSegmenter';
import { registerRootComponent } from 'expo';
import { LogBox, NativeModules } from 'react-native';

import App from './App';

// Keep Metro errors visible while hiding the noisy native Fast Refresh banner.
if (__DEV__) {
  try {
    // Expo only installs this filter for Expo Go/dev-client; the standalone
    // debug build still renders the warning through React Native LogBox.
    LogBox.ignoreLogs([/Open debugger to view warnings/]);
    const devLoadingView = NativeModules.DevLoadingView as {
      showMessage?: (message: string, ...args: unknown[]) => void;
      vichatRefreshIndicatorPatched?: boolean;
    };
    if (devLoadingView?.showMessage && !devLoadingView.vichatRefreshIndicatorPatched) {
      const showMessage = devLoadingView.showMessage.bind(devLoadingView);
      devLoadingView.showMessage = (message, ...args) => {
        if (message === 'Refreshing...') return;
        showMessage(message, ...args);
      };
      devLoadingView.vichatRefreshIndicatorPatched = true;
    }
  } catch {
    // Dev-only UI suppression must never prevent the app from starting.
  }
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
