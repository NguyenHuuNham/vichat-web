import { create } from 'zustand';
import { appLockService } from '../services/appLockService';

interface AppLockStore {
  initialized: boolean;
  configured: boolean;
  locked: boolean;
  initialize: () => Promise<void>;
  lock: () => void;
  unlock: (pin: string) => Promise<boolean>;
  setPin: (pin: string) => Promise<void>;
  changePin: (currentPin: string, nextPin: string) => Promise<boolean>;
  disablePin: (currentPin: string) => Promise<boolean>;
  resetPin: () => Promise<void>;
}

let initializeRequest: Promise<void> | null = null;

export const useAppLockStore = create<AppLockStore>((set, get) => ({
  initialized: false,
  configured: false,
  locked: false,

  async initialize() {
    if (get().initialized) return;
    if (initializeRequest) return initializeRequest;
    initializeRequest = appLockService.isConfigured()
      .then(configured => set({ initialized: true, configured, locked: configured }))
      .finally(() => { initializeRequest = null; });
    return initializeRequest;
  },

  lock() {
    if (get().configured) set({ locked: true });
  },

  async unlock(pin) {
    const valid = await appLockService.verifyPin(pin);
    if (valid) set({ locked: false });
    return valid;
  },

  async setPin(pin) {
    await appLockService.setPin(pin);
    set({ initialized: true, configured: true, locked: false });
  },

  async changePin(currentPin, nextPin) {
    if (!(await appLockService.verifyPin(currentPin))) return false;
    await appLockService.setPin(nextPin);
    set({ configured: true, locked: false });
    return true;
  },

  async disablePin(currentPin) {
    if (!(await appLockService.verifyPin(currentPin))) return false;
    await appLockService.clearPin();
    set({ configured: false, locked: false });
    return true;
  },

  async resetPin() {
    await appLockService.clearPin();
    set({ initialized: true, configured: false, locked: false });
  },
}));
