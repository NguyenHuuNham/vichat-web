import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn(async (key: string) => values.get(key) || null),
    setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    clear: () => values.clear(),
  };
});

const documentPicker = vi.hoisted(() => ({
  getDocumentAsync: vi.fn(),
}));

const fileSystem = vi.hoisted(() => ({
  documentDirectory: 'file:///vichat/',
  deleteAsync: vi.fn(async () => {}),
  copyAsync: vi.fn(async () => {}),
  getInfoAsync: vi.fn(async () => ({ exists: true, size: 2048 })),
}));

const audio = vi.hoisted(() => {
  const players: Array<{
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
    addListener: ReturnType<typeof vi.fn>;
    emit: (status: { didJustFinish?: boolean; playing?: boolean }) => void;
  }> = [];
  const createAudioPlayer = vi.fn(() => {
    let listener: ((status: { didJustFinish?: boolean; playing?: boolean }) => void) | null = null;
    const player = {
      play: vi.fn(),
      pause: vi.fn(),
      release: vi.fn(),
      addListener: vi.fn((_eventName: string, nextListener: (status: { didJustFinish?: boolean; playing?: boolean }) => void) => {
        listener = nextListener;
        return { remove: vi.fn(() => { listener = null; }) };
      }),
      emit: (status: { didJustFinish?: boolean; playing?: boolean }) => listener?.(status),
    };
    players.push(player);
    return player;
  });
  return {
    players,
    reset: () => { players.length = 0; },
    setAudioModeAsync: vi.fn(async () => {}),
    createAudioPlayer,
  };
});

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
vi.mock('expo-document-picker', () => documentPicker);
vi.mock('expo-file-system/legacy', () => fileSystem);
vi.mock('expo-audio', () => audio);

import {
  loadNotificationSoundSettings,
  pickCustomNotificationSound,
  playCustomNotificationSound,
  playCustomNotificationSoundPreview,
  resetNotificationSoundServiceForTests,
  stopCustomNotificationSoundPreview,
  updateNotificationSoundSettings,
  validateNotificationSoundAsset,
} from './notificationSoundService';

describe('mobile notification sound settings', () => {
  beforeEach(() => {
    resetNotificationSoundServiceForTests();
    storage.clear();
    audio.reset();
    vi.clearAllMocks();
  });

  it('accepts supported audio files and rejects invalid or oversized files', () => {
    expect(validateNotificationSoundAsset({ name: 'ding.mp3', mimeType: 'audio/mpeg', size: 1200 })).toBe('');
    expect(validateNotificationSoundAsset({ name: 'ding.m4a', mimeType: 'audio/mp4', size: undefined })).toBe('');
    expect(validateNotificationSoundAsset({ name: 'notes.txt', mimeType: 'text/plain', size: 1200 })).toBe('Chỉ hỗ trợ file âm thanh.');
    expect(validateNotificationSoundAsset({ name: 'large.wav', mimeType: 'audio/wav', size: 8 * 1024 * 1024 + 1 })).toContain('8 MB');
  });

  it('persists the enablement choice across service reloads', async () => {
    await updateNotificationSoundSettings({ enabled: false });
    resetNotificationSoundServiceForTests();
    await expect(loadNotificationSoundSettings()).resolves.toMatchObject({ enabled: false, mode: 'system' });
    expect(storage.setItem).toHaveBeenCalledWith('vichat.mobile.notification-sound.v1', expect.stringContaining('"enabled":false'));
  });

  it('copies a selected file into app storage and selects it as custom sound', async () => {
    documentPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ name: 'team-chime.m4a', mimeType: 'audio/mp4', size: 2048, uri: 'content://picker/team-chime' }],
    });

    const settings = await pickCustomNotificationSound();

    expect(fileSystem.copyAsync).toHaveBeenCalledWith({
      from: 'content://picker/team-chime',
      to: 'file:///vichat/vichat-notification-sound.m4a',
    });
    expect(settings).toMatchObject({ mode: 'custom', customName: 'team-chime.m4a', customUri: 'file:///vichat/vichat-notification-sound.m4a' });
  });

  it('stops preview playback without stopping a notification player', async () => {
    const settings = { enabled: true, mode: 'custom' as const, customName: 'team-chime.m4a', customUri: 'file:///vichat/team-chime.m4a' };
    await expect(playCustomNotificationSound(settings)).resolves.toBe(true);
    await expect(playCustomNotificationSoundPreview(settings)).resolves.toBe(true);

    const notificationPlayer = audio.players[0];
    const previewPlayer = audio.players[1];
    stopCustomNotificationSoundPreview();

    expect(previewPlayer.pause).toHaveBeenCalledTimes(1);
    expect(previewPlayer.release).toHaveBeenCalledTimes(1);
    expect(notificationPlayer.pause).not.toHaveBeenCalled();
    expect(notificationPlayer.release).not.toHaveBeenCalled();
  });

  it('cleans up preview when the audio reaches the end', async () => {
    const settings = { enabled: true, mode: 'custom' as const, customName: 'team-chime.m4a', customUri: 'file:///vichat/team-chime.m4a' };
    const onStateChange = vi.fn();
    await expect(playCustomNotificationSoundPreview(settings, onStateChange)).resolves.toBe(true);

    const previewPlayer = audio.players[0];
    previewPlayer.emit({ didJustFinish: true, playing: false });

    expect(onStateChange).toHaveBeenLastCalledWith(false);
    expect(previewPlayer.pause).toHaveBeenCalledTimes(1);
    expect(previewPlayer.release).toHaveBeenCalledTimes(1);
  });
});
