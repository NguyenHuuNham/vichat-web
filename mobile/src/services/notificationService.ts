import { AppState, Platform } from 'react-native';
import { config } from '../constants/config';
import { ChatMessage, Conversation, User } from '../types';
import { isConversationMuted } from '../utils/conversationNotifications';

const MESSAGE_CHANNEL_ID = 'messages';
let initializedForUser = '';
let notificationHandlerReady = false;
let notificationChannelReady = false;
let lastRegistration: PushRegistration | null = null;

export interface PushRegistration {
  token: string;
  platform: 'apns' | 'fcm';
}

async function loadNotificationModules() {
  const [Notifications, Device] = await Promise.all([
    import('expo-notifications'),
    import('expo-device'),
  ]);
  if (!notificationHandlerReady) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notificationHandlerReady = true;
  }
  if (Platform.OS === 'android' && !notificationChannelReady) {
    await Notifications.setNotificationChannelAsync(MESSAGE_CHANNEL_ID, {
      name: 'Tin nhắn ViChat',
      description: 'Thông báo tin nhắn mới trong ViChat',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 180, 120, 180],
      lightColor: '#F4511E',
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
    });
    notificationChannelReady = true;
  }
  return { Notifications, Device };
}

export async function registerPushNotifications(user?: User | null) {
  if (!user?.id) return null;
  if (initializedForUser === user.id) return lastRegistration;
  try {
    const { Notifications, Device } = await loadNotificationModules();
    const permission = await Notifications.getPermissionsAsync();
    let status = permission.status;
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    if (!config.pushEnabled || !Device.isDevice) {
      initializedForUser = user.id;
      return null;
    }
    const token = await Notifications.getDevicePushTokenAsync();
    lastRegistration = { token: String(token.data), platform: Platform.OS === 'ios' ? 'apns' : 'fcm' };
    initializedForUser = user.id;
    return lastRegistration;
  } catch {
    return null;
  }
}

export function resetPushNotificationRegistration() {
  initializedForUser = '';
  lastRegistration = null;
}

export async function subscribeToPushTokenChanges(onToken: (registration: PushRegistration) => void) {
  if (!config.pushEnabled) return () => {};
  try {
    const { Notifications } = await loadNotificationModules();
    const subscription = Notifications.addPushTokenListener((token: { data: string }) => {
      if (token?.data) onToken({ token: String(token.data), platform: Platform.OS === 'ios' ? 'apns' : 'fcm' });
    });
    return () => subscription?.remove?.();
  } catch {
    return () => {};
  }
}

function notificationBody(message: ChatMessage) {
  if (message.type === 'image') return 'Đã gửi một hình ảnh';
  if (message.type === 'file') return `Đã gửi tệp ${message.file?.name || ''}`.trim();
  return String(message.text || 'Bạn có tin nhắn mới').replace(/\s+/g, ' ').trim().slice(0, 180);
}

export async function notifyIncomingMessage(conversation: Conversation, message: ChatMessage) {
  if (AppState.currentState === 'active' || message.sender !== 'incoming') return null;
  if (isConversationMuted(conversation.notificationMutedUntil)) return null;
  try {
    const { Notifications } = await loadNotificationModules();
    if ((await Notifications.getPermissionsAsync()).status !== 'granted') return null;
    return Notifications.scheduleNotificationAsync({
      content: {
        title: conversation.name || 'ViChat',
        body: notificationBody(message),
        data: { conversationId: conversation.id, tinodeTopic: conversation.tinodeTopic },
        sound: 'default',
        color: '#F4511E',
      },
      trigger: Platform.OS === 'android' ? { channelId: MESSAGE_CHANNEL_ID } : null,
    });
  } catch {
    return null;
  }
}
