import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSendLocation = vi.fn().mockResolvedValue(undefined);
const mockSendLiveLocationUpdate = vi.fn().mockResolvedValue(undefined);
const mockStopLiveSharing = vi.fn().mockResolvedValue(undefined);

vi.mock('../store/appStore', () => ({
  useAppStore: {
    getState: vi.fn(() => ({
      sendLocation: mockSendLocation,
      sendLiveLocationUpdate: mockSendLiveLocationUpdate,
      stopLiveSharing: mockStopLiveSharing,
    })),
  },
}));

vi.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, High: 4 },
  requestForegroundPermissionsAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
  watchPositionAsync: vi.fn(),
  reverseGeocodeAsync: vi.fn(),
}));

import * as Location from 'expo-location';
import { liveLocationService } from './liveLocationService';

describe('liveLocationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Location.requestForegroundPermissionsAsync as any).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as any).mockResolvedValue({
      coords: {
        latitude: 10.776889,
        longitude: 106.700806,
        accuracy: 14,
        heading: 90,
        speed: 1.5,
      },
    });
    (Location.reverseGeocodeAsync as any).mockResolvedValue([
      { name: '72 Lê Thánh Tôn', street: 'Lê Thánh Tôn', district: 'Quận 1', city: 'Hồ Chí Minh' },
    ]);
    (Location.watchPositionAsync as any).mockResolvedValue({
      remove: vi.fn(),
    });
  });

  it('starts live sharing with correct session and initial payload', async () => {
    const liveId = await liveLocationService.startLiveSharing('conv_123', 30, {
      senderId: 'user_me',
      senderName: 'Nguyen Van A',
    });

    expect(liveId).toMatch(/^live_/);
    const session = liveLocationService.getActiveSession();
    expect(session).not.toBeNull();
    expect(session?.conversationId).toBe('conv_123');
    expect(session?.durationMinutes).toBe(30);
    expect(session?.latitude).toBe(10.776889);
    expect(session?.longitude).toBe(106.700806);
    expect(session?.accuracy).toBe(14);
    expect(session?.isActive).toBe(true);

    expect(liveLocationService.isSharingInConversation('conv_123')).toBe(true);
    expect(liveLocationService.isSharingInConversation('conv_other')).toBe(false);

    expect(mockSendLocation).toHaveBeenCalledWith(
      'conv_123',
      expect.objectContaining({
        kind: 'live',
        liveId,
        senderId: 'user_me',
        durationMinutes: 30,
        isActive: true,
      }),
    );
  });

  it('stops live sharing and notifies store', async () => {
    const liveId = await liveLocationService.startLiveSharing('conv_123', 15, {
      senderId: 'user_me',
      senderName: 'Nguyen Van A',
    });

    await liveLocationService.stopLiveSharing(liveId);
    expect(liveLocationService.getActiveSession()).toBeNull();
    expect(liveLocationService.isSharingInConversation('conv_123')).toBe(false);
    expect(mockStopLiveSharing).toHaveBeenCalledWith('conv_123', liveId);
  });

  it('throws error if permission is denied', async () => {
    (Location.requestForegroundPermissionsAsync as any).mockResolvedValue({ status: 'denied' });
    await expect(
      liveLocationService.startLiveSharing('conv_123', 15, {
        senderId: 'user_me',
        senderName: 'Nguyen Van A',
      }),
    ).rejects.toThrow('quyền truy cập vị trí');
  });
});
