const env = import.meta.env || {};
const apiBase = String(env.VITE_CHAT_MANAGEMENT_API_URL || '').replace(/\/$/, '');
export const CHAT_MAINTENANCE_REQUEST_TIMEOUT_MS = 4000;

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

export async function fetchChatMaintenance(fetcher = globalThis.fetch, options = {}) {
  const requestedTimeout = Number(options.timeoutMs);
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
    ? requestedTimeout
    : CHAT_MAINTENANCE_REQUEST_TIMEOUT_MS;
  const externalSignal = options.signal;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timeoutId = null;
  let timedOut = false;
  let removeExternalAbortListener = null;

  if (controller && externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else {
      const abortRequest = () => controller.abort(externalSignal.reason);
      externalSignal.addEventListener('abort', abortRequest, { once: true });
      removeExternalAbortListener = () => externalSignal.removeEventListener('abort', abortRequest);
    }
  }

  const requestOptions = {
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    ...(controller ? { signal: controller.signal } : externalSignal ? { signal: externalSignal } : {}),
  };

  let response;
  try {
    response = await Promise.race([
      Promise.resolve().then(() => fetcher(chatMaintenanceApiUrl('/api/v1/chat/maintenance'), requestOptions)),
      new Promise((_, reject) => {
        timeoutId = globalThis.setTimeout(() => {
          timedOut = true;
          controller?.abort();
          const error = new Error('Maintenance status request timed out.');
          error.code = 'MAINTENANCE_REQUEST_TIMEOUT';
          error.status = 408;
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error('Maintenance status request timed out.');
      timeoutError.code = 'MAINTENANCE_REQUEST_TIMEOUT';
      timeoutError.status = 408;
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    removeExternalAbortListener?.();
  }
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
