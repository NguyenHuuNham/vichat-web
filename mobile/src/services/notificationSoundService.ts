import type { DocumentPickerAsset } from 'expo-document-picker';

export type NotificationSoundMode = 'system' | 'custom';

export interface NotificationSoundSettings {
  enabled: boolean;
  mode: NotificationSoundMode;
  customName: string;
  customUri: string;
}

export const NOTIFICATION_SOUND_MAX_BYTES = 8 * 1024 * 1024;
export const DEFAULT_NOTIFICATION_SOUND_SETTINGS: NotificationSoundSettings = {
  enabled: true,
  mode: 'system',
  customName: '',
  customUri: '',
};

const NOTIFICATION_SOUND_SETTINGS_KEY = 'vichat.mobile.notification-sound.v1';
const NOTIFICATION_SOUND_FILE_PREFIX = 'vichat-notification-sound';
let settingsCache: NotificationSoundSettings | null = null;
let settingsRequest: Promise<NotificationSoundSettings> | null = null;
type AudioPlayerLike = {
  play: () => void;
  pause: () => void;
  release?: () => void;
  remove?: () => void;
  addListener?: (eventName: 'playbackStatusUpdate', listener: (status: { didJustFinish?: boolean; playing?: boolean }) => void) => { remove: () => void };
  volume?: number;
};
type AudioSubscription = { remove: () => void };

let activeNotificationAudioPlayer: AudioPlayerLike | null = null;
let activeNotificationAudioSubscription: AudioSubscription | null = null;
let activePreviewAudioPlayer: AudioPlayerLike | null = null;
let activePreviewAudioSubscription: AudioSubscription | null = null;
let previewPlaybackToken = 0;
let audioModeReady = false;

export function normalizeNotificationSoundSettings(value: unknown): NotificationSoundSettings {
  const candidate = value && typeof value === 'object' ? value as Partial<NotificationSoundSettings> : {};
  const hasCustomFile = typeof candidate.customUri === 'string' && candidate.customUri.length > 0;
  return {
    enabled: candidate.enabled !== false,
    mode: candidate.mode === 'custom' && hasCustomFile ? 'custom' : 'system',
    customName: typeof candidate.customName === 'string' ? candidate.customName : '',
    customUri: typeof candidate.customUri === 'string' ? candidate.customUri : '',
  };
}

async function getStorage() {
  try {
    const module = await import('@react-native-async-storage/async-storage');
    return module.default;
  } catch {
    return null;
  }
}

export function validateNotificationSoundAsset(asset: Pick<DocumentPickerAsset, 'name' | 'mimeType' | 'size'> | null | undefined) {
  if (!asset) return 'Hãy chọn một file âm thanh.';
  const mimeType = String(asset.mimeType || '').toLowerCase();
  const name = String(asset.name || '').toLowerCase();
  const hasAudioType = mimeType.startsWith('audio/');
  const hasAudioExtension = /\.(aac|flac|m4a|mp3|oga|ogg|wav|webm)$/i.test(name);
  if (!hasAudioType && !(mimeType === '' && hasAudioExtension)) return 'Chỉ hỗ trợ file âm thanh.';
  const hasKnownSize = asset.size !== undefined && asset.size !== null;
  const size = Number(asset.size);
  if (hasKnownSize && (!Number.isFinite(size) || size < 0)) return 'File âm thanh không hợp lệ.';
  if (size > NOTIFICATION_SOUND_MAX_BYTES) return 'File âm thanh phải nhỏ hơn hoặc bằng 8 MB.';
  return '';
}

export async function loadNotificationSoundSettings() {
  if (settingsCache) return { ...settingsCache };
  if (settingsRequest) return settingsRequest;
  settingsRequest = (async () => {
    const storage = await getStorage();
    if (storage) {
      try {
        const raw = await storage.getItem(NOTIFICATION_SOUND_SETTINGS_KEY);
        if (raw) settingsCache = normalizeNotificationSoundSettings(JSON.parse(raw));
      } catch {
        // Keep the safe system-sound default when local storage is unavailable.
      }
    }
    settingsCache ||= { ...DEFAULT_NOTIFICATION_SOUND_SETTINGS };
    return { ...settingsCache };
  })();
  try {
    return await settingsRequest;
  } finally {
    settingsRequest = null;
  }
}

export async function updateNotificationSoundSettings(patch: Partial<NotificationSoundSettings>) {
  const current = await loadNotificationSoundSettings();
  const next = normalizeNotificationSoundSettings({ ...current, ...patch });
  settingsCache = next;
  const storage = await getStorage();
  try {
    await storage?.setItem(NOTIFICATION_SOUND_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Keep the choice active for the current session if persistence is unavailable.
  }
  return { ...next };
}

function extensionForAsset(asset: DocumentPickerAsset) {
  const match = String(asset.name || '').match(/\.[a-z0-9]{2,5}$/i);
  return match ? match[0].toLowerCase() : '.m4a';
}

export async function pickCustomNotificationSound() {
  const documentPicker = await import('expo-document-picker');
  const result = await documentPicker.getDocumentAsync({
    type: 'audio/*',
    copyToCacheDirectory: true,
    multiple: false,
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  const validationError = validateNotificationSoundAsset(asset);
  if (validationError) throw new Error(validationError);

  const fileSystem = await import('expo-file-system/legacy');
  const directory = fileSystem.documentDirectory;
  if (!directory) throw new Error('Không thể lưu file âm thanh trên thiết bị.');
  const sourceInfo = await fileSystem.getInfoAsync(asset.uri).catch(() => null);
  const sourceSize = Number(sourceInfo?.exists ? sourceInfo.size : asset.size);
  if (!Number.isFinite(sourceSize) || sourceSize <= 0) throw new Error('File âm thanh không hợp lệ.');
  if (sourceSize > NOTIFICATION_SOUND_MAX_BYTES) throw new Error('File âm thanh phải nhỏ hơn hoặc bằng 8 MB.');
  const destination = `${directory}${NOTIFICATION_SOUND_FILE_PREFIX}${extensionForAsset(asset)}`;
  const current = await loadNotificationSoundSettings();
  await fileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
  await fileSystem.copyAsync({ from: asset.uri, to: destination });
  const destinationInfo = await fileSystem.getInfoAsync(destination).catch(() => null);
  if (!destinationInfo?.exists) throw new Error('Không thể lưu file âm thanh trên thiết bị.');
  const next = await updateNotificationSoundSettings({
    mode: 'custom',
    customName: asset.name,
    customUri: destination,
  });
  if (current.customUri && current.customUri !== destination) {
    await fileSystem.deleteAsync(current.customUri, { idempotent: true }).catch(() => {});
  }
  return next;
}

export async function removeCustomNotificationSound() {
  const current = await loadNotificationSoundSettings();
  if (current.customUri) {
    const fileSystem = await import('expo-file-system/legacy');
    await fileSystem.deleteAsync(current.customUri, { idempotent: true }).catch(() => {});
  }
  return updateNotificationSoundSettings({ mode: 'system', customName: '', customUri: '' });
}

async function prepareAudioMode() {
  const audio = await import('expo-audio');
  if (!audioModeReady) {
    await audio.setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: 'mixWithOthers',
      allowsRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
    audioModeReady = true;
  }
  return audio;
}

function releaseAudioPlayer(player: AudioPlayerLike | null, subscription: AudioSubscription | null) {
  try {
    subscription?.remove();
  } catch {
    // The subscription may already be detached by the native player.
  }
  if (!player) return;
  try {
    player.pause();
  } catch {
    // The native player may already be released.
  }
  try {
    if (player.release) player.release();
    else player.remove?.();
  } catch {
    try {
      player.remove?.();
    } catch {
      // Cleanup is best-effort when the native audio session is already gone.
    }
  }
}

function stopNotificationAudio() {
  const player = activeNotificationAudioPlayer;
  const subscription = activeNotificationAudioSubscription;
  activeNotificationAudioPlayer = null;
  activeNotificationAudioSubscription = null;
  releaseAudioPlayer(player, subscription);
}

export async function playCustomNotificationSound(settings?: NotificationSoundSettings) {
  const current = settings || await loadNotificationSoundSettings();
  if (!current.enabled || current.mode !== 'custom' || !current.customUri) return false;
  try {
    const audio = await prepareAudioMode();
    stopNotificationAudio();
    const player = audio.createAudioPlayer(current.customUri) as AudioPlayerLike;
    player.volume = 1;
    activeNotificationAudioPlayer = player;
    let subscription: AudioSubscription | null = null;
    try {
      subscription = player.addListener?.('playbackStatusUpdate', status => {
        if (!status.didJustFinish || activeNotificationAudioPlayer !== player) return;
        const currentSubscription = activeNotificationAudioSubscription;
        activeNotificationAudioPlayer = null;
        activeNotificationAudioSubscription = null;
        releaseAudioPlayer(player, currentSubscription);
      }) || null;
    } catch {
      stopNotificationAudio();
      return false;
    }
    activeNotificationAudioSubscription = subscription;
    try {
      player.play();
    } catch {
      stopNotificationAudio();
      return false;
    }
    return true;
  } catch {
    // The notification service will keep using the native system sound as fallback.
    return false;
  }
}

export async function playCustomNotificationSoundPreview(
  settings?: NotificationSoundSettings,
  onStateChange?: (playing: boolean) => void,
) {
  const current = settings || await loadNotificationSoundSettings();
  stopCustomNotificationSoundPreview();
  if (!current.enabled || current.mode !== 'custom' || !current.customUri) {
    onStateChange?.(false);
    return false;
  }

  const token = ++previewPlaybackToken;
  try {
    const audio = await prepareAudioMode();
    if (token !== previewPlaybackToken) return false;
    const player = audio.createAudioPlayer(current.customUri) as AudioPlayerLike;
    player.volume = 1;
    if (token !== previewPlaybackToken) {
      releaseAudioPlayer(player, null);
      return false;
    }
    activePreviewAudioPlayer = player;
    let subscription: AudioSubscription | null = null;
    try {
      subscription = player.addListener?.('playbackStatusUpdate', status => {
        if (!status.didJustFinish || token !== previewPlaybackToken || activePreviewAudioPlayer !== player) return;
        activePreviewAudioPlayer = null;
        activePreviewAudioSubscription = null;
        releaseAudioPlayer(player, subscription);
        onStateChange?.(false);
      }) || null;
    } catch {
      activePreviewAudioPlayer = null;
      releaseAudioPlayer(player, null);
      onStateChange?.(false);
      return false;
    }
    activePreviewAudioSubscription = subscription;
    try {
      player.play();
    } catch {
      stopCustomNotificationSoundPreview();
      onStateChange?.(false);
      return false;
    }
    if (activePreviewAudioPlayer === player && token === previewPlaybackToken) onStateChange?.(true);
    return true;
  } catch {
    if (token === previewPlaybackToken) onStateChange?.(false);
    return false;
  }
}

export function stopCustomNotificationSoundPreview() {
  previewPlaybackToken += 1;
  const player = activePreviewAudioPlayer;
  const subscription = activePreviewAudioSubscription;
  activePreviewAudioPlayer = null;
  activePreviewAudioSubscription = null;
  releaseAudioPlayer(player, subscription);
}

export function resetNotificationSoundServiceForTests() {
  stopNotificationAudio();
  stopCustomNotificationSoundPreview();
  settingsCache = null;
  settingsRequest = null;
  audioModeReady = false;
}
