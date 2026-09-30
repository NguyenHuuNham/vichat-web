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

const MESSAGE_CHANNEL_ID = 'messages-v2';
const CALL_CHANNEL_ID = 'calls-v2';
const PERMISSION_CACHE_MS = 30_000;
let initializedForUser = '';
let notificationHandlerReady = false;
let notificationChannelsReady = false;
let lastRegistration: PushRegistration | null = null;
let registrationRequest: Promise<PushRegistration | null> | null = null;
let registrationRequestUser = '';
let notificationModulesRequest: Promise<any> | null = null;
let notificationPermissionGranted: boolean | null = null;
let notificationPermissionCheckedAt = 0;
type PushRegistrationState = 'idle' | 'requesting' | 'registered' | 'permission-denied' | 'unavailable' | 'error';
let pushRegistrationState: PushRegistrationState = 'idle';
let pushRegistrationError = '';
const incomingCallNotificationIds = new Map<string, string>();
const dismissedIncomingCallKeys = new Set<string>();
const dismissedIncomingCallTimers = new Map<string, ReturnType<typeof setTimeout>>();
const scheduledIncomingCallExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

export interface PushRegistration {
  token: string;
  platform: 'apns' | 'fcm';
}

export function getPushRegistrationDiagnostics() {
  return {
    state: pushRegistrationState,
    error: pushRegistrationError,
    hasToken: Boolean(lastRegistration?.token),
  };
}

function registrationFailureKind(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/permission|denied|not authorized/i.test(message)) return 'permission-denied';
  if (/firebase|fcm|apns|device|token|native|not configured|not initialized/i.test(message)) {
    return 'native-token-unavailable';
  }
  return 'native-registration-failed';
}

async function loadNotificationModules() {
  if (notificationModulesRequest) return notificationModulesRequest;
  notificationModulesRequest = (async () => {
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
  })();
  try {
    return await notificationModulesRequest;
  } catch (error) {
    notificationModulesRequest = null;
    throw error;
  }
}

async function hasNotificationPermission(Notifications: any, force = false) {
  const now = Date.now();
  if (!force && notificationPermissionGranted !== null && now - notificationPermissionCheckedAt < PERMISSION_CACHE_MS) {
    return notificationPermissionGranted;
  }
  const permission = await Notifications.getPermissionsAsync();
  let status = permission.status;
  if (status !== 'granted' && permission.canAskAgain !== false) {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  notificationPermissionGranted = status === 'granted';
  notificationPermissionCheckedAt = now;
  return notificationPermissionGranted;
}

export async function prepareNotificationPresentation() {
  try {
    await loadNotificationModules();
    return true;
  } catch {
    return false;
  }
}

export async function registerPushNotifications(user?: User | null, options: { retry?: boolean } = {}) {
  if (!user?.id) return null;
  const retry = options.retry === true;
  if (initializedForUser && initializedForUser !== user.id) {
    lastRegistration = null;
    pushRegistrationState = 'idle';
    pushRegistrationError = '';
  }
  if (!retry && initializedForUser === user.id) return lastRegistration;
  if (registrationRequest && registrationRequestUser === user.id) return registrationRequest;

  registrationRequestUser = user.id;
  pushRegistrationState = 'requesting';
  pushRegistrationError = '';
  registrationRequest = (async () => {
    try {
      const { Notifications, Device } = await loadNotificationModules();
      if (!config.pushEnabled || !Device.isDevice) {
        pushRegistrationState = 'unavailable';
        initializedForUser = user.id;
        return null;
      }
      if (!(await hasNotificationPermission(Notifications, retry))) {
        pushRegistrationState = 'permission-denied';
        pushRegistrationError = 'notification-permission-denied';
        initializedForUser = user.id;
        return null;
      }
      const token = await Notifications.getDevicePushTokenAsync();
      const nativeToken = String(token?.data || '').trim();
      if (!nativeToken) throw new Error('Native push token is empty.');
      const tokenChanged = lastRegistration?.token !== nativeToken;
      lastRegistration = { token: nativeToken, platform: Platform.OS === 'ios' ? 'apns' : 'fcm' };
      initializedForUser = user.id;
      pushRegistrationState = 'registered';
      pushRegistrationError = '';
      if (tokenChanged) console.info('[ViChat] Native push registration ready:', lastRegistration.platform);
      return lastRegistration;
    } catch (error) {
      // Keep transient native failures eligible for the next foreground/background retry.
      initializedForUser = '';
      pushRegistrationState = 'error';
      pushRegistrationError = registrationFailureKind(error);
      console.warn('[ViChat] Native push registration failed:', pushRegistrationError);
      return null;
    }
  })();
  const request = registrationRequest;
  try {
    return await request;
  } finally {
    if (registrationRequest === request) {
      registrationRequest = null;
      registrationRequestUser = '';
    }
  }
}

export function resetPushNotificationRegistration() {
  initializedForUser = '';
  lastRegistration = null;
  pushRegistrationState = 'idle';
  pushRegistrationError = '';
  registrationRequest = null;
  registrationRequestUser = '';
  notificationPermissionGranted = null;
  notificationPermissionCheckedAt = 0;
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
      const nativeToken = String(token?.data || '').trim();
      if (nativeToken) {
        lastRegistration = { token: nativeToken, platform: Platform.OS === 'ios' ? 'apns' : 'fcm' };
        pushRegistrationState = 'registered';
        pushRegistrationError = '';
        onToken(lastRegistration);
      }
    });
    return () => subscription?.remove?.();
  } catch {
    return () => {};
  }
}

function notificationBody(message: ChatMessage) {
  if (message.poll) return `Bình chọn: ${message.poll.question}`;
  if (message.type === 'sticker' || message.sticker) return `Đã gửi sticker${message.sticker?.label ? `: ${message.sticker.label}` : ''}`;
  if (message.type === 'image') return 'Đã gửi một hình ảnh';
  if (message.type === 'audio' || /^audio\//i.test(message.file?.mime || '')) return 'Đã gửi voice';
  if (message.type === 'file') return `Đã gửi tệp ${message.file?.name || ''}`.trim();
  return String(message.text || 'Bạn có tin nhắn mới').replace(/\s+/g, ' ').trim().slice(0, 180);
}

export async function notifyIncomingMessage(conversation: Conversation, message: ChatMessage) {
  // A notification is only valid when the realtime layer verified a sender.
  // This also prevents malformed/replayed packets from becoming alerts.
  if (message.sender !== 'incoming' || !String(message.senderId || '').trim()) return null;
  if (isConversationMuted(conversation.notificationMutedUntil)) return null;
  try {
    const { Notifications } = await loadNotificationModules();
    if (!(await hasNotificationPermission(Notifications))) return null;
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
    if (!(await hasNotificationPermission(Notifications))) return null;
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
