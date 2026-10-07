const namesCache: Record<string, string> = {};
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let loadedFromFile = false;

async function getLegacyFileSystem(): Promise<any> {
  try {
    return await import('expo-file-system/legacy');
  } catch {
    try {
      return require('expo-file-system');
    } catch {
      return null;
    }
  }
}

/**
 * Loads the existing cache from vichat_names.json into memory on startup.
 */
export async function loadNativeNameCache(): Promise<Record<string, string>> {
  if (loadedFromFile) return namesCache;
  try {
    const fs = await getLegacyFileSystem();
    const docDir = fs?.documentDirectory;
    if (!docDir) return namesCache;
    const path = `${docDir}vichat_names.json`;
    if (typeof fs?.readAsStringAsync === 'function') {
      const content = await fs.readAsStringAsync(path);
      if (content) {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object') {
          Object.assign(namesCache, parsed);
          loadedFromFile = true;
        }
      }
    }
  } catch {
    // Ignore initial read error if file doesn't exist yet
  }
  return namesCache;
}

/**
 * Updates the native name cache so that Android's ViChatFirebaseMessagingService
 * can resolve sender and group names even when the app process is terminated/killed.
 */
export function updateNativeNameCache(entries: Record<string, string | undefined>) {
  let changed = false;
  for (const [key, val] of Object.entries(entries)) {
    const cleanKey = String(key || '').trim();
    const cleanVal = String(val || '').trim();
    if (
      cleanKey &&
      cleanVal &&
      cleanVal !== 'Thành viên' &&
      cleanVal !== 'Bạn' &&
      cleanVal !== 'ViChat' &&
      cleanVal !== 'Người dùng'
    ) {
      if (namesCache[cleanKey] !== cleanVal) {
        namesCache[cleanKey] = cleanVal;
        changed = true;
      }
    }
  }
  if (!changed) return;
  scheduleSave();
}

export function getCachedNativeName(id: string): string | undefined {
  return namesCache[String(id || '').trim()];
}

/**
 * Gets the sequence number of the latest notification posted by native service
 * while the app was killed/backgrounded.
 */
export function getNativeNotifiedSeq(topicOrId: string): number {
  const cleanKey = String(topicOrId || '').trim();
  if (!cleanKey) return 0;
  const val = namesCache[`notified_seq:${cleanKey}`];
  if (!val) return 0;
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Updates the native mute state for a conversation or topic so that
 * ViChatFirebaseMessagingService suppresses notifications when killed.
 */
export function updateNativeMuteCache(topicOrId: string, until: number | null) {
  const cleanKey = String(topicOrId || '').trim();
  if (!cleanKey) return;
  const muteKey = `mute:${cleanKey}`;

  if (until === null) {
    if (muteKey in namesCache) {
      delete namesCache[muteKey];
      scheduleSave();
    }
  } else {
    const val = String(until);
    if (namesCache[muteKey] !== val) {
      namesCache[muteKey] = val;
      scheduleSave();
    }
  }
}

export function isNativeMuted(topicOrId: string, nowSec = Date.now() / 1000): boolean {
  const cleanKey = String(topicOrId || '').trim();
  if (!cleanKey) return false;
  const val = namesCache[`mute:${cleanKey}`];
  if (val === undefined) return false;
  if (val === '0') return true;
  const untilNum = Number(val);
  return Number.isFinite(untilNum) && untilNum > nowSec;
}

export async function flushNativeNameCache(): Promise<void> {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  try {
    const fs = await getLegacyFileSystem();
    const docDir = fs?.documentDirectory;
    if (!docDir) return;
    const path = `${docDir}vichat_names.json`;
    if (typeof fs?.writeAsStringAsync === 'function') {
      await fs.writeAsStringAsync(path, JSON.stringify(namesCache));
    }
  } catch {
    // Ignore background write errors
  }
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    void flushNativeNameCache();
  }, 1000);
}
