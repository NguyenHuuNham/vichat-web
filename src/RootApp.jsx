import React, { lazy, Suspense } from 'react';

const ChatApp = lazy(() => import('./app/App.jsx'));
const ManagementApp = lazy(() => import('./features/management/ManagementApp.jsx'));

class AppErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('ViChat render error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f6f2ea', color: '#1f2937', fontFamily: 'system-ui, sans-serif' }}>
          <section style={{ maxWidth: 460, padding: 28, borderRadius: 20, background: '#fff', boxShadow: '0 18px 50px rgba(31, 41, 55, .12)', textAlign: 'center' }}>
            <h1 style={{ margin: '0 0 10px', fontSize: 22 }}>Chat dang tam dung</h1>
            <p style={{ margin: '0 0 20px', lineHeight: 1.5 }}>Du lieu cuoc tro chuyen khong hop le. Hay tai lai trang de dong bo lai.</p>
            <button type="button" onClick={() => window.location.reload()} style={{ border: 0, borderRadius: 10, padding: '10px 18px', background: '#176b5b', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>Tai lai trang</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

export default function RootApp() {
  const params = new URLSearchParams(window.location.search);
  const isManagementSurface = window.location.hostname === 'chatmgt.upgo.vn'
    || params.get('surface') === 'management';
  const ActiveApp = isManagementSurface ? ManagementApp : ChatApp;

  return (
    <AppErrorBoundary>
      <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#f6f2ea' }}></div>}>
        <ActiveApp />
      </Suspense>
    </AppErrorBoundary>
  );
}
