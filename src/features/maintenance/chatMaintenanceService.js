const env = import.meta.env || {};
const apiBase = String(env.VITE_CHAT_MANAGEMENT_API_URL || '').replace(/\/$/, '');

export const CHAT_MAINTENANCE_MESSAGE = 'WEBSITE ĐANG TRONG QUÁ TRÌNH CẬP NHẬT VUI LÒNG THỬ LẠI SAU';

export const DEFAULT_CHAT_MAINTENANCE_STATE = Object.freeze({
  enabled: false,
  message: CHAT_MAINTENANCE_MESSAGE,
  updatedAt: 0,
});

export function normalizeChatMaintenanceState(payload) {
  const source = payload?.maintenance && typeof payload.maintenance === 'object'
    ? payload.maintenance
    : payload && typeof payload === 'object' ? payload : {};
  const updatedAt = Number(source.updatedAt ?? source.updated_at ?? 0);
  return {
    enabled: source.enabled === true || source.enabled === 1 || source.enabled === 'true',
    message: CHAT_MAINTENANCE_MESSAGE,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0,
  };
}

export function chatMaintenanceApiUrl(path = '') {
  return `${apiBase}${path}`;
}

export function chatMaintenanceConfigured() {
  return Boolean(apiBase);
}

export async function fetchChatMaintenance(fetcher = globalThis.fetch) {
  const response = await fetcher(chatMaintenanceApiUrl('/api/v1/chat/maintenance'), {
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error_message || `Maintenance status HTTP ${response.status}`);
    error.status = response.status;
    error.code = payload?.error_code || `HTTP_${response.status}`;
    throw error;
  }
  return normalizeChatMaintenanceState(payload);
}

export function maintenanceStateFromEvent(event) {
  if (!event?.data) return null;
  try {
    return normalizeChatMaintenanceState(JSON.parse(event.data));
  } catch {
    return null;
  }
}

export function subscribeChatMaintenance({ onState, onError } = {}) {
  if (!chatMaintenanceConfigured() || typeof EventSource === 'undefined') return null;
  const source = new EventSource(
    chatMaintenanceApiUrl('/api/v1/chat/maintenance/stream'),
    { withCredentials: true },
  );
  source.addEventListener('maintenance', event => {
    const state = maintenanceStateFromEvent(event);
    if (state) onState?.(state);
  });
  source.onerror = error => onError?.(error);
  return () => source.close();
}
