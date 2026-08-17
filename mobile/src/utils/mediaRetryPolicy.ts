export function httpStatusFromError(error: unknown) {
  const direct = Number((error as any)?.status || (error as any)?.statusCode || (error as any)?.response?.status || 0);
  if (Number.isInteger(direct) && direct >= 100 && direct <= 599) return direct;
  const message = String((error as any)?.message || error || '');
  const match = message.match(/\b(?:HTTP(?:\s+status)?|status(?:\s+code)?)\s*[:=]?\s*(\d{3})\b/i)
    || message.match(/\b(401|403)\b/);
  return match ? Number(match[1]) : 0;
}

export function shouldRetryProtectedMedia(error: unknown) {
  return [401, 403].includes(httpStatusFromError(error));
}
