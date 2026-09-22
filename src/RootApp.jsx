import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  CHAT_MAINTENANCE_MESSAGE,
  DEFAULT_CHAT_MAINTENANCE_STATE,
  chatMaintenanceConfigured,
  fetchChatMaintenance,
  subscribeChatMaintenance,
} from './features/maintenance/chatMaintenanceService.js';

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

function ChatMaintenanceScreen({ loading = false, message = CHAT_MAINTENANCE_MESSAGE, title = '', description = '' }) {
  const heading = title || (loading ? 'ĐANG KIỂM TRA TRẠNG THÁI HỆ THỐNG' : message);
  const detail = description || (loading ? 'Vui lòng chờ trong giây lát...' : 'Hệ thống sẽ tự động hoạt động trở lại sau khi cập nhật xong.');
  return (
    <main className="chat-maintenance-screen" aria-busy={loading}>
      <section className="chat-maintenance-card" role="status" aria-live="assertive">
        <div className="chat-maintenance-gear" aria-hidden="true">
          <i className="fa-solid fa-gear fa-spin vichat-loading-icon"></i>
        </div>
        <h1>{heading}</h1>
        <p>{detail}</p>
      </section>
    </main>
  );
}

function ChatLoadingFallback() {
  return (
    <ChatMaintenanceScreen
      loading
      title="ĐANG TẢI CHAT"
      description="Đang khởi tạo giao diện và phiên làm việc của bạn..."
    />
  );
}

function ChatMaintenanceGate({ children }) {
  const [state, setState] = useState(DEFAULT_CHAT_MAINTENANCE_STATE);
  const [status, setStatus] = useState(() => chatMaintenanceConfigured() ? 'loading' : 'ready');

  useEffect(() => {
    if (!chatMaintenanceConfigured()) return undefined;
    let cancelled = false;
    let closeStream = null;
    let reconnectTimer = null;
    let reconnectDelay = 1000;
    let refreshInFlight = false;

    const applyState = nextState => {
      if (cancelled || !nextState) return;
      setState(nextState);
      setStatus('ready');
      reconnectDelay = 1000;
    };

    const refresh = () => {
      if (cancelled || refreshInFlight) return;
      refreshInFlight = true;
      fetchChatMaintenance()
        .then(applyState)
        .catch(() => {
          // The gate fails open when Chatmgt is temporarily unreachable; the
          // next fallback poll or SSE reconnect can still activate maintenance.
          if (!cancelled) setStatus(previous => previous === 'loading' ? 'ready' : previous);
        })
        .finally(() => {
          refreshInFlight = false;
        });
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer) return;
      const delay = reconnectDelay;
      reconnectDelay = Math.min(30000, reconnectDelay * 2);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connectStream();
      }, delay);
    };

    const connectStream = () => {
      if (cancelled) return;
      closeStream?.();
      closeStream = null;
      try {
        closeStream = subscribeChatMaintenance({
          onState: applyState,
          onError: () => {
            closeStream?.();
            closeStream = null;
            scheduleReconnect();
          },
        });
      } catch {
        scheduleReconnect();
      }
    };

    refresh();
    connectStream();
    const fallbackTimer = window.setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      closeStream?.();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.clearInterval(fallbackTimer);
    };
  }, []);

  if (status === 'loading') return <ChatMaintenanceScreen loading />;
  if (state.enabled) return <ChatMaintenanceScreen message={state.message} />;
  return children;
}

export default function RootApp() {
  const params = new URLSearchParams(window.location.search);
  const isManagementSurface = window.location.hostname === 'chatmgt.gonplatform.com'
    || params.get('surface') === 'management';
  const ActiveApp = isManagementSurface ? ManagementApp : ChatApp;

  return (
    <AppErrorBoundary>
      <Suspense fallback={<ChatLoadingFallback />}>
        {isManagementSurface
          ? <ActiveApp />
          : <ChatMaintenanceGate><ActiveApp /></ChatMaintenanceGate>}
      </Suspense>
    </AppErrorBoundary>
  );
}
