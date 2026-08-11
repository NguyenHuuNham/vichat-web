import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { config } from '../constants/config';
import { User } from '../types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let registeredForUser = '';

export async function registerPushNotifications(user?: User | null) {
  if (!config.pushEnabled || !user?.id || registeredForUser === user.id || !Device.isDevice) return null;
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
