const RETRYABLE_PROTECTED_MEDIA_STATUSES = new Set([401, 403]);

export function shouldRetryProtectedMedia(status) {
  return RETRYABLE_PROTECTED_MEDIA_STATUSES.has(Number(status));
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
