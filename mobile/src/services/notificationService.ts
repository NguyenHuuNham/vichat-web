import { AppState, Platform } from 'react-native';
import { config } from '../constants/config';
import { ChatMessage, Conversation, User } from '../types';
import { isConversationMuted } from '../utils/conversationNotifications';
import {
  INCOMING_CALL_NOTIFICATION_TTL_MS,
  incomingCallNotificationData,
  incomingCallNotificationKey,
  parseIncomingCallNotification,
} from '../utils/callNotificationPolicy';

const MESSAGE_CHANNEL_ID = 'messages';
const CALL_CHANNEL_ID = 'calls';
let initializedForUser = '';
let notificationHandlerReady = false;
let notificationChannelsReady = false;
let lastRegistration: PushRegistration | null = null;
const incomingCallNotificationIds = new Map<string, string>();
const dismissedIncomingCallKeys = new Set<string>();
const dismissedIncomingCallTimers = new Map<string, ReturnType<typeof setTimeout>>();
const scheduledIncomingCallExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
  if (Platform.OS === 'android' && !notificationChannelsReady) {
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
    await Notifications.setNotificationChannelAsync(CALL_CHANNEL_ID, {
      name: 'Cuộc gọi ViChat',
      description: 'Thông báo cuộc gọi thoại và video đến',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 500, 250, 500, 250, 500],
      lightColor: '#F4511E',
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    notificationChannelsReady = true;
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
  incomingCallNotificationIds.clear();
  scheduledIncomingCallExpiryTimers.forEach(timer => clearTimeout(timer));
  scheduledIncomingCallExpiryTimers.clear();
  dismissedIncomingCallTimers.forEach(timer => clearTimeout(timer));
  dismissedIncomingCallTimers.clear();
  dismissedIncomingCallKeys.clear();
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

export async function notifyIncomingCall(
  event: { topic: string; seq: number; from: string; audioOnly: boolean },
  peer: { name?: string; avatar?: string } = {},
) {
  const key = incomingCallNotificationKey(event);
  if (AppState.currentState === 'active') {
    const previousId = incomingCallNotificationIds.get(key);
    if (previousId) {
      try {
        const { Notifications } = await loadNotificationModules();
        await Notifications.dismissNotificationAsync(previousId).catch(() => {});
      } catch {
        // Foreground call UI is already visible; notification cleanup is best-effort.
      }
      incomingCallNotificationIds.delete(key);
      clearTimeout(scheduledIncomingCallExpiryTimers.get(key));
      scheduledIncomingCallExpiryTimers.delete(key);
    }
    return null;
  }
  if (dismissedIncomingCallKeys.has(key)) return null;
  try {
    const { Notifications } = await loadNotificationModules();
    if ((await Notifications.getPermissionsAsync()).status !== 'granted') return null;
    if (dismissedIncomingCallKeys.has(key)) return null;
    const peerName = String(peer.name || 'Người dùng ViChat');
    const previousId = incomingCallNotificationIds.get(key);
    if (previousId) await Notifications.dismissNotificationAsync(previousId).catch(() => {});
    const notificationId = String(await Notifications.scheduleNotificationAsync({
      content: {
        title: peerName,
        body: event.audioOnly ? 'Cuộc gọi thoại đến' : 'Cuộc gọi video đến',
        data: incomingCallNotificationData(event, peer) as unknown as Record<string, unknown>,
        sound: 'default',
        color: '#F4511E',
        categoryIdentifier: 'vichat-incoming-call',
      },
      trigger: Platform.OS === 'android' ? { channelId: CALL_CHANNEL_ID } : null,
    }));
    if (dismissedIncomingCallKeys.has(key)) {
      await Notifications.dismissNotificationAsync(notificationId).catch(() => {});
      return null;
    }
    incomingCallNotificationIds.set(key, notificationId);
    clearTimeout(scheduledIncomingCallExpiryTimers.get(key));
    scheduledIncomingCallExpiryTimers.set(key, setTimeout(() => {
      if (incomingCallNotificationIds.get(key) === notificationId) incomingCallNotificationIds.delete(key);
      scheduledIncomingCallExpiryTimers.delete(key);
      void Notifications.dismissNotificationAsync(notificationId).catch(() => {});
    }, INCOMING_CALL_NOTIFICATION_TTL_MS));
    return notificationId;
  } catch {
    return null;
  }
}

export async function dismissIncomingCallNotification(topic: string, seq: number) {
  const key = incomingCallNotificationKey({ topic, seq });
  dismissedIncomingCallKeys.add(key);
  clearTimeout(dismissedIncomingCallTimers.get(key));
  dismissedIncomingCallTimers.set(key, setTimeout(() => {
    dismissedIncomingCallKeys.delete(key);
    dismissedIncomingCallTimers.delete(key);
  }, INCOMING_CALL_NOTIFICATION_TTL_MS));
  const notificationId = incomingCallNotificationIds.get(key);
  incomingCallNotificationIds.delete(key);
  clearTimeout(scheduledIncomingCallExpiryTimers.get(key));
  scheduledIncomingCallExpiryTimers.delete(key);
  if (!notificationId) return;
  try {
    const { Notifications } = await loadNotificationModules();
    await Notifications.dismissNotificationAsync(notificationId);
  } catch {
    // The call state is still cleared even if the OS notification is already gone.
  }
}

export async function subscribeToIncomingCallNotificationResponses(
  onIncomingCall: (data: NonNullable<ReturnType<typeof parseIncomingCallNotification>>) => void,
) {
  try {
    const { Notifications } = await loadNotificationModules();
    const handleResponse = (response: any) => {
      const data = parseIncomingCallNotification(response?.notification?.request?.content?.data);
      if (data) {
        const key = incomingCallNotificationKey(data);
        incomingCallNotificationIds.delete(key);
        clearTimeout(scheduledIncomingCallExpiryTimers.get(key));
        scheduledIncomingCallExpiryTimers.delete(key);
        onIncomingCall(data);
      }
    };
    const lastResponse = await Notifications.getLastNotificationResponseAsync();
    if (lastResponse) {
      handleResponse(lastResponse);
      Notifications.clearLastNotificationResponse?.();
    }
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => subscription?.remove?.();
  } catch {
    return () => {};
  }
}
