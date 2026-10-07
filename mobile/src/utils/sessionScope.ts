export function sessionScopeKey(session: {
  user?: { id?: string } | null;
  tenant?: { id?: string } | null;
  generation?: number;
} | null | undefined) {
  const userId = String(session?.user?.id || '').trim();
  const tenantId = String(session?.tenant?.id || '').trim();
  if (!userId || !tenantId) return '';
  return JSON.stringify([userId, tenantId, Number(session?.generation) || 0]);
}
