import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const notificationMocks = vi.hoisted(() => ({
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(async () => undefined),
  getPermissionsAsync: vi.fn(async () => ({ status: 'granted', canAskAgain: true })),
  requestPermissionsAsync: vi.fn(async () => ({ status: 'granted', canAskAgain: true })),
  getDevicePushTokenAsync: vi.fn(),
  addPushTokenListener: vi.fn(() => ({ remove: vi.fn() })),
}));

vi.mock('expo-notifications', () => notificationMocks);
vi.mock('expo-device', () => ({ isDevice: true }));

import {
  getPushRegistrationDiagnostics,
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
});
