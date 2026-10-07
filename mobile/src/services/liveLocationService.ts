import * as Location from 'expo-location';
import { useAppStore } from '../store/appStore';
import { LiveLocationEvent, LiveLocationPayload } from '../types';

export interface ActiveLiveSession {
  liveId: string;
  conversationId: string;
  durationMinutes: 15 | 30 | 60 | 480;
  startedAt: number;
  expiresAt: number;
  isActive: boolean;
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  lastUpdatedAt: number;
}

export type LiveSessionListener = (session: ActiveLiveSession | null) => void;

class LiveLocationService {
  private activeSession: ActiveLiveSession | null = null;
  private watcherSubscription: Location.LocationSubscription | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<LiveSessionListener>();

  getActiveSession(): ActiveLiveSession | null {
    if (this.activeSession && Date.now() >= this.activeSession.expiresAt) {
      void this.stopLiveSharing(this.activeSession.liveId);
      return null;
    }
    return this.activeSession;
  }

  isSharingInConversation(conversationId: string): boolean {
    const session = this.getActiveSession();
    return Boolean(session && session.conversationId === conversationId && session.isActive);
  }

  subscribe(listener: LiveSessionListener): () => void {
    this.listeners.add(listener);
    listener(this.getActiveSession());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const current = this.getActiveSession();
    this.listeners.forEach(fn => {
      try {
        fn(current);
      } catch {
        // Ignore listener error
      }
    });
  }

  async startLiveSharing(
    conversationId: string,
    durationMinutes: 15 | 30 | 60 | 480,
    senderInfo: { senderId: string; senderName: string; senderAvatar?: string },
  ): Promise<string> {
    // If there is an existing session, stop it first
    if (this.activeSession) {
      await this.stopLiveSharing(this.activeSession.liveId);
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('ViChat cần quyền truy cập vị trí để chia sẻ hành trình trực tiếp.');
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    let address = '';
    try {
      const places = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      if (places && places.length > 0) {
        const p = places[0];
        address = [p.name, p.street, p.subregion || p.district, p.region || p.city]
          .filter(Boolean)
          .join(', ');
      }
    } catch {
      // Reverse geocoding error fallback
    }

    const startedAt = Date.now();
    const expiresAt = startedAt + durationMinutes * 60 * 1000;
    const liveId = `live_${startedAt}_${Math.random().toString(36).slice(2, 8)}`;

    const payload: LiveLocationPayload = {
      kind: 'live',
      liveId,
      senderId: senderInfo.senderId,
      senderName: senderInfo.senderName,
      senderAvatar: senderInfo.senderAvatar,
      durationMinutes,
      startedAt,
      expiresAt,
      isActive: true,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? undefined,
      heading: position.coords.heading ?? undefined,
      speed: position.coords.speed ?? undefined,
      title: 'Chia sẻ hành trình trực tiếp',
      address: address || undefined,
      lastUpdatedAt: startedAt,
    };

    this.activeSession = {
      liveId,
      conversationId,
      durationMinutes,
      startedAt,
      expiresAt,
      isActive: true,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? undefined,
      heading: position.coords.heading ?? undefined,
      speed: position.coords.speed ?? undefined,
      lastUpdatedAt: startedAt,
    };

    // Send initial message
    await useAppStore.getState().sendLocation(conversationId, payload);

    // Watch position updates
    try {
      this.watcherSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 10,
          timeInterval: 10000,
        },
        newLocation => {
          if (!this.activeSession || this.activeSession.liveId !== liveId) return;
          if (Date.now() >= expiresAt) {
            void this.stopLiveSharing(liveId);
            return;
          }

          const updateEvent: LiveLocationEvent = {
            liveId,
            latitude: newLocation.coords.latitude,
            longitude: newLocation.coords.longitude,
            accuracy: newLocation.coords.accuracy ?? undefined,
            heading: newLocation.coords.heading ?? undefined,
            speed: newLocation.coords.speed ?? undefined,
            isActive: true,
            lastUpdatedAt: Date.now(),
          };

          this.activeSession = {
            ...this.activeSession,
            latitude: updateEvent.latitude,
            longitude: updateEvent.longitude,
            accuracy: updateEvent.accuracy,
            heading: updateEvent.heading,
            speed: updateEvent.speed,
            lastUpdatedAt: updateEvent.lastUpdatedAt,
          };

          this.notify();
          void useAppStore.getState().sendLiveLocationUpdate(conversationId, updateEvent);
        },
      );
    } catch {
      // Background watching fallback
    }

    const remainingMs = Math.max(1000, expiresAt - Date.now());
    this.expiryTimer = setTimeout(() => {
      void this.stopLiveSharing(liveId);
    }, remainingMs);

    this.notify();
    return liveId;
  }

  async stopLiveSharing(liveId?: string): Promise<void> {
    if (!this.activeSession) return;
    if (liveId && this.activeSession.liveId !== liveId) return;

    const current = this.activeSession;
    if (this.watcherSubscription) {
      try {
        this.watcherSubscription.remove();
      } catch {
        // Ignore subscription cleanup error
      }
      this.watcherSubscription = null;
    }

    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }

    this.activeSession = null;
    this.notify();

    await useAppStore.getState().stopLiveSharing(current.conversationId, current.liveId);
  }
}

export const liveLocationService = new LiveLocationService();
