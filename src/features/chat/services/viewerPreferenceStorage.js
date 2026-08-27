// Keep browser preferences stable when one account is represented by multiple IDs.
export function viewerStorageIds(viewerId, aliasViewerIds = []) {
  const aliases = Array.isArray(aliasViewerIds) ? aliasViewerIds : [aliasViewerIds];
  return [...new Set([viewerId, ...aliases]
    .map(value => String(value || '').trim())
    .filter(Boolean))];
}
