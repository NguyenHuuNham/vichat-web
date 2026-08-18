const WORKSPACE_ROUTE_BY_PANEL = Object.freeze({
  enterprise: '/work',
  groups: '/groups',
  contacts: '/friends',
  settings: '/settings',
  profile: '/profile',
  files: '/files',
  notifications: '/notifications',
  search: '/search',
});

const WORKSPACE_PANEL_BY_ROUTE = Object.freeze(
  Object.fromEntries(Object.entries(WORKSPACE_ROUTE_BY_PANEL).map(([panel, route]) => [route, panel])),
);

function normalizePath(pathname) {
  const path = String(pathname || '').trim();
  if (!path || path === '/') return '/';
  return `/${path.replace(/^\/+|\/+$/g, '')}`;
}

export function workspacePanelFromPath(pathname) {
  return WORKSPACE_PANEL_BY_ROUTE[normalizePath(pathname)] || null;
}

export function workspacePathForPanel(panel) {
  return WORKSPACE_ROUTE_BY_PANEL[panel] || '/chat';
}

export { WORKSPACE_ROUTE_BY_PANEL };
