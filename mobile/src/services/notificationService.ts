import { Platform } from 'react-native';
import { config } from '../constants/config';
import { User } from '../types';

let registeredForUser = '';
let notificationHandlerReady = false;

async function loadNotificationModules() {
  const [Notifications, Device] = await Promise.all([
    import('expo-notifications'),
    import('expo-device'),
  ]);
  if (!notificationHandlerReady) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notificationHandlerReady = true;
  }
  return { Notifications, Device };
}

export async function registerPushNotifications(user?: User | null) {
  if (!config.pushEnabled || !user?.id || registeredForUser === user.id) return null;
  const { Notifications, Device } = await loadNotificationModules();
  if (!Device.isDevice) return null;
  const permission = await Notifications.getPermissionsAsync();
  let status = permission.status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    registeredForUser = user.id;
    return { token: String(token.data), platform: Platform.OS === 'ios' ? 'apns' : 'fcm' };
  } catch {
    return null;
  }
}
