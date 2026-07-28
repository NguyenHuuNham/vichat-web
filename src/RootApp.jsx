import { lazy, Suspense } from 'react';

const ChatApp = lazy(() => import('./app/App.jsx'));
const ManagementApp = lazy(() => import('./features/management/ManagementApp.jsx'));

export default function RootApp() {
  const params = new URLSearchParams(window.location.search);
  const isManagementSurface = window.location.hostname === 'chatmgt.upgo.vn'
    || params.get('surface') === 'management';
  const ActiveApp = isManagementSurface ? ManagementApp : ChatApp;

  return (
    <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#f6f2ea' }}></div>}>
      <ActiveApp />
    </Suspense>
  );
}
