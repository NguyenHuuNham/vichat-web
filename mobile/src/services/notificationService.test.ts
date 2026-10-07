import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const notificationMocks = vi.hoisted(() => ({
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(async () => undefined),
  getPermissionsAsync: vi.fn(async () => ({ status: 'granted', canAskAgain: true })),
  requestPermissionsAsync: vi.fn(async () => ({ status: 'granted', canAskAgain: true })),
  getDevicePushTokenAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(async () => 'notification-id'),
  getPresentedNotificationsAsync: vi.fn(async () => [] as any[]),
  getAllScheduledNotificationsAsync: vi.fn(async () => [] as any[]),
  dismissNotificationAsync: vi.fn(async () => undefined),
  cancelScheduledNotificationAsync: vi.fn(async () => undefined),
  addPushTokenListener: vi.fn(() => ({ remove: vi.fn() })),
}));

vi.mock('expo-notifications', () => notificationMocks);
vi.mock('expo-device', () => ({ isDevice: true }));

import {
  dismissNotificationsForConversation,
  formatNotificationContent,
  getPushRegistrationDiagnostics,
  notificationBody,
  notifyIncomingMessage,
  registerPushNotifications,
  resetPushNotificationRegistration,
} from './notificationService';

describe('native push registration', () => {
  beforeEach(() => {
    resetPushNotificationRegistration();
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    notificationMocks.getPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    notificationMocks.getDevicePushTokenAsync.mockReset();
    notificationMocks.getPresentedNotificationsAsync.mockResolvedValue([]);
    notificationMocks.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the next retry eligible after Firebase token registration fails', async () => {
    notificationMocks.getDevicePushTokenAsync
      .mockRejectedValueOnce(new Error('Default FirebaseApp is not initialized'))
      .mockResolvedValueOnce({ data: 'fcm-token-after-retry' });

    const user = { id: 'user-1' } as any;
    expect(await registerPushNotifications(user)).toBeNull();
    expect(getPushRegistrationDiagnostics()).toMatchObject({
      state: 'error',
      error: 'native-token-unavailable',
      hasToken: false,
    });

    const registration = await registerPushNotifications(user, { retry: true });
    expect(registration?.token).toBe('fcm-token-after-retry');
    expect(getPushRegistrationDiagnostics()).toMatchObject({
      state: 'registered',
      error: '',
      hasToken: true,
    });
  });

  it('does not report registration success for an empty native token', async () => {
    notificationMocks.getDevicePushTokenAsync.mockResolvedValue({ data: '  ' });

    expect(await registerPushNotifications({ id: 'user-2' } as any)).toBeNull();
    expect(getPushRegistrationDiagnostics().state).toBe('error');
    expect(getPushRegistrationDiagnostics().hasToken).toBe(false);
  });

  it('does not schedule a notification for the sender echo', async () => {
    const conversation = { id: 'conversation-1', name: 'B', tinodeTopic: 'usr-topic' } as any;
    const message = { id: 'message-1', sender: 'outgoing', senderId: 'usr-current', type: 'text', text: 'hello' } as any;

    expect(await notifyIncomingMessage(conversation, message)).toBeNull();
    expect(notificationMocks.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('formats notification with sender name as title for 1-1 chats', () => {
    const conversation = { id: 'usr-1', name: 'Nhâm Nguyễn', tinodeTopic: 'usr-1', isGroup: false } as any;
    const message = { id: 'm-1', sender: 'incoming', senderId: 'usr-1', senderName: 'Nhâm Nguyễn', type: 'text', text: 'ngu' } as any;

    const formatted = formatNotificationContent(conversation, message);
    expect(formatted.title).toBe('Nhâm Nguyễn');
    expect(formatted.body).toBe('ngu');
  });

  it('formats notification with group name as title and sender prefix in body for group chats', () => {
    const conversation = { id: 'grp-1', name: 'Nhóm GON-NERS', tinodeTopic: 'grp-1', isGroup: true } as any;
    const message = { id: 'm-2', sender: 'incoming', senderId: 'usr-sender', senderName: 'Nhâm Nguyễn', type: 'text', text: 'ngu' } as any;

    const formatted = formatNotificationContent(conversation, message);
    expect(formatted.title).toBe('Nhóm GON-NERS');
    expect(formatted.body).toBe('Nhâm Nguyễn: ngu');
  });

  it('formats voice message body cleanly', () => {
    const message = { id: 'm-voice', sender: 'incoming', senderId: 'usr-1', type: 'audio' } as any;
    expect(notificationBody(message)).toBe('Đã gửi tin nhắn thoại');
  });

  it('resolves sender name from conversation members when message senderName is missing', () => {
    const conversation = {
      id: 'grp-2',
      name: 'Nhóm ViChat',
      tinodeTopic: 'grp-2',
      isGroup: true,
      members: [{ id: 'usr-xyz', uid: 'usr-xyz', name: 'Trần Văn A' }],
    } as any;
    const message = { id: 'm-3', sender: 'incoming', senderId: 'usr-xyz', type: 'text', text: 'Xin chào cả nhà' } as any;

    const formatted = formatNotificationContent(conversation, message);
    expect(formatted.title).toBe('Nhóm ViChat');
    expect(formatted.body).toBe('Trần Văn A: Xin chào cả nhà');
  });

  it('schedules one notification for a verified recipient message', async () => {
    const conversation = { id: 'conversation-2', name: 'Người Bạn', tinodeTopic: 'usr-topic', isGroup: false } as any;
    const message = { id: 'message-2', sender: 'incoming', senderId: 'usr-other', senderName: 'Người Bạn', type: 'text', text: 'hello' } as any;

    await expect(notifyIncomingMessage(conversation, message)).resolves.toBe('notification-id');
    expect(notificationMocks.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(notificationMocks.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: 'Người Bạn',
          body: 'hello',
        }),
      })
    );
  });

  it('fails closed for an incoming message without a sender identity', async () => {
    const conversation = { id: 'conversation-3', name: 'A', tinodeTopic: 'usr-topic' } as any;
    const message = { id: 'message-3', sender: 'incoming', type: 'text', text: 'hello' } as any;

    expect(await notifyIncomingMessage(conversation, message)).toBeNull();
    expect(notificationMocks.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('does not schedule a message that was already marked read', async () => {
    const conversation = { id: 'conversation-read', name: 'A', tinodeTopic: 'usr-topic' } as any;
    await dismissNotificationsForConversation(conversation.id, conversation.tinodeTopic, 12);

    const message = { id: 'message-read', seq: 12, sender: 'incoming', senderId: 'usr-other', type: 'text', text: 'old' } as any;
    expect(await notifyIncomingMessage(conversation, message)).toBeNull();
    expect(notificationMocks.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('dismisses only notifications belonging to the read conversation', async () => {
    notificationMocks.getPresentedNotificationsAsync.mockResolvedValue([
      { request: { identifier: 'read-message', content: { data: { conversationId: 'conversation-read' } } } },
      { request: { identifier: 'other-message', content: { data: { conversationId: 'conversation-other' } } } },
    ]);
    notificationMocks.getAllScheduledNotificationsAsync.mockResolvedValue([
      { request: { identifier: 'read-call', content: { data: { tinodeTopic: 'usr-topic' } } } },
    ]);

    await dismissNotificationsForConversation('conversation-read', 'usr-topic', 20);

    expect(notificationMocks.dismissNotificationAsync).toHaveBeenCalledWith('read-message');
    expect(notificationMocks.cancelScheduledNotificationAsync).toHaveBeenCalledWith('read-message');
    expect(notificationMocks.dismissNotificationAsync).toHaveBeenCalledWith('read-call');
    expect(notificationMocks.dismissNotificationAsync).not.toHaveBeenCalledWith('other-message');
  });
});
