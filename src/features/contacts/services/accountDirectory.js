// The account directory is private and is loaded through the management API.
// Keep identity matching here so existing chat rendering code remains unchanged.
export async function loadAccountDirectory() {
  throw new Error('Account directory is available only through the authenticated management service.');
}

export async function authenticateDemoAccount() {
  throw new Error('Public account login is disabled.');
}

export function findAccount(accounts, identity) {
  if (!identity || !Array.isArray(accounts)) return null;
  const normalized = String(identity).trim().toLowerCase();
  return accounts.find(item =>
    item.id === identity ||
    item.uid === identity ||
    item.username?.toLowerCase() === normalized ||
    item.email?.toLowerCase() === normalized ||
    item.name?.toLowerCase() === normalized
  ) || null;
}
