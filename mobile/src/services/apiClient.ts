import { config } from '../constants/config';
import { Platform } from 'react-native';
import * as Device from 'expo-device';

let accessToken = '';
const activeControllers = new Set<AbortController>();

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || `HTTP_${status}`;
  }
}

export function setAccessToken(token?: string | null) {
  accessToken = String(token || '');
}

export function getAccessToken() {
  return accessToken;
}

/** Abort all requests belonging to the previous auth/session generation. */
export function cancelPendingRequests() {
  activeControllers.forEach(controller => controller.abort());
  activeControllers.clear();
}

export function absoluteApiUrl(value?: string) {
  const path = String(value || '');
  if (!path || /^(?:data:|blob:|https?:)/i.test(path)) return path;
  return `${config.apiBase}${path.startsWith('/') ? path : `/${path}`}`;
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  mobileLogin?: boolean;
}

export async function apiRequest<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const {
    timeoutMs = 20000,
    mobileLogin: _mobileLogin,
    signal: externalSignal,
    ...requestInit
  } = options;
  activeControllers.add(controller);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const isFormData = typeof FormData !== 'undefined' && requestInit.body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(requestInit.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(_mobileLogin || Platform.OS !== 'web' ? { 'X-Vichat-Client': 'mobile' } : {}),
    ...((requestInit.headers || {}) as Record<string, string>),
  };
  if (Platform.OS !== 'web') {
    headers['X-Vichat-Platform'] = `${Device.osName || Platform.OS} ${Device.osVersion || ''}`.trim();
    headers['X-Vichat-Device-Name'] = Device.modelName || 'ViChat Mobile';
  }
  if (isFormData) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'content-type') delete headers[key];
    }
  }

  try {
    const response = await fetch(`${config.apiBase}${path}`, {
      ...requestInit,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(
        payload?.error_message || payload?.message || `Chatmgt HTTP ${response.status}`,
        response.status,
        payload?.error_code,
      );
    }
    return payload as T;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw timedOut
        ? new ApiError('Kết nối tới Chatmgt quá thời gian.', 408, 'REQUEST_TIMEOUT')
        : new ApiError('Yêu cầu Chatmgt đã được hủy.', 499, 'REQUEST_ABORTED');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    activeControllers.delete(controller);
  }
}

export function responseItems<T = any>(payload: any): T[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.objects)) return payload.objects;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}
