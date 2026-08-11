let trustedExternalActivityUntil = 0;

export function beginTrustedExternalActivity(timeoutMs = 3 * 60 * 1000) {
  trustedExternalActivityUntil = Date.now() + timeoutMs;
}

export function consumeTrustedExternalActivity() {
  const trusted = Date.now() <= trustedExternalActivityUntil;
  trustedExternalActivityUntil = 0;
  return trusted;
}
