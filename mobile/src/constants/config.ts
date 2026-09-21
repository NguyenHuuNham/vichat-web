const env = (name: string, fallback: string) => String((globalThis as any)?.process?.env?.[name] || fallback).trim();

export const config = {
  apiBase: env('EXPO_PUBLIC_CHATMGT_API_URL', 'https://chatmgt.gonplatform.com').replace(/\/+$/, ''),
  tenantId: env('EXPO_PUBLIC_CHAT_TENANT_ID', ''),
  tinodeHost: env('EXPO_PUBLIC_TINODE_HOST', 'chat.gonplatform.com'),
  tinodeApiKey: env('EXPO_PUBLIC_TINODE_API_KEY', 'AQEAAAABAAD_rAp4DJh05a1HAwFT3A6K'),
  tinodeSecure: env('EXPO_PUBLIC_TINODE_SECURE', 'true').toLowerCase() !== 'false',
  tinodeTransport: env('EXPO_PUBLIC_TINODE_TRANSPORT', 'ws'),
  appName: env('EXPO_PUBLIC_TINODE_APP_NAME', 'VICHAT-MOBILE/1.0'),
  mediaBase: env('EXPO_PUBLIC_TINODE_MEDIA_BASE', 'https://chat.gonplatform.com/tinode-media').replace(/\/+$/, ''),
  chatMediaStorage: env('EXPO_PUBLIC_CHAT_MEDIA_STORAGE', 's3').toLowerCase(),
  chatMediaFallbackToTinode: env('EXPO_PUBLIC_CHAT_MEDIA_FALLBACK_TO_TINODE', 'false').toLowerCase() === 'true',
  callsEnabled: env('EXPO_PUBLIC_CALLS_ENABLED', 'true').toLowerCase() === 'true',
  pushEnabled: env('EXPO_PUBLIC_PUSH_ENABLED', 'false').toLowerCase() === 'true',
  maxAttachmentBytes: 500 * 1024 * 1024,
} as const;

export type AppConfig = typeof config;
