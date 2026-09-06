export function startBrowserPresence({
  documentTarget,
  windowTarget,
  isCurrentSession,
  heartbeat,
  clearPresence,
  applySnapshot,
}) {
  let stopped = false;
  let away = documentTarget.visibilityState === 'hidden';
  let pendingRequest = null;
  const canSync = () => !stopped && !away
    && documentTarget.visibilityState !== 'hidden' && isCurrentSession();

  const syncDirectoryPresence = async () => {
    if (!canSync() || pendingRequest) return;
    const request = {};
    pendingRequest = request;
    try {
      const payload = await heartbeat();
      if (pendingRequest === request && canSync()) applySnapshot(payload);
    } catch {
    } finally {
      if (pendingRequest === request) pendingRequest = null;
    }
  };

  const leavePage = () => {
    if (stopped || away) return;
    away = true;
    pendingRequest = null;
    if (!isCurrentSession()) return;
    try {
      Promise.resolve(clearPresence({ keepalive: true })).catch(() => {});
    } catch {
    }
  };

  const resumePage = () => {
    if (stopped || documentTarget.visibilityState === 'hidden') return;
    away = false;
    void syncDirectoryPresence();
  };
  const visibilityChanged = () => {
    if (documentTarget.visibilityState === 'hidden') leavePage();
    else resumePage();
  };

  documentTarget.addEventListener('visibilitychange', visibilityChanged);
  windowTarget.addEventListener('focus', resumePage);
  windowTarget.addEventListener('pageshow', resumePage);
  windowTarget.addEventListener('pagehide', leavePage);
  const timer = windowTarget.setInterval(syncDirectoryPresence, 2000);
  void syncDirectoryPresence();

  return () => {
    stopped = true;
    pendingRequest = null;
    windowTarget.clearInterval(timer);
    documentTarget.removeEventListener('visibilitychange', visibilityChanged);
    windowTarget.removeEventListener('focus', resumePage);
    windowTarget.removeEventListener('pageshow', resumePage);
    windowTarget.removeEventListener('pagehide', leavePage);
  };
}
