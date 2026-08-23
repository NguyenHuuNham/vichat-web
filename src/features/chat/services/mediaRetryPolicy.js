const RETRYABLE_PROTECTED_MEDIA_STATUSES = new Set([401, 403]);
const PROTECTED_MEDIA_PREFIX = '/tinode-media/';
const SESSION_READY_EVENTS = new Set(['session-ready', 'reconnect']);

export function shouldRetryProtectedMedia(status) {
  return RETRYABLE_PROTECTED_MEDIA_STATUSES.has(Number(status));
}

export function shouldRetryProtectedMediaAfterSession(eventType, source) {
  return SESSION_READY_EVENTS.has(String(eventType || ''))
    && String(source || '').startsWith(PROTECTED_MEDIA_PREFIX);
}

// Retry once after the caller has renewed the short-lived Tinode credential.
// Other HTTP failures stay untouched so missing files are not retried forever.
export async function fetchProtectedMediaWithRetry({ request, refreshAuth }) {
  let response = await request();
  if (!shouldRetryProtectedMedia(response?.status) || typeof refreshAuth !== 'function') {
    return response;
  }

  const refreshed = await refreshAuth();
  return refreshed ? request() : response;
}
