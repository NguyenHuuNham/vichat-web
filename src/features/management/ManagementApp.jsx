import { useCallback, useEffect, useMemo, useState } from 'react';
import { managementAdminService } from './services/managementAdminService.js';
import { subscribeChatMaintenance } from '../maintenance/chatMaintenanceService.js';
import ChatLogo from '../../components/ChatLogo';
import './management.css';

const ADMIN_ROLES = ['admin', 'superadmin', 'owner'];
const ACCOUNT_ADMIN_URL = String(import.meta.env.VITE_ACCOUNT_URL || 'https://account.upgo.vn').replace(/\/$/, '');

function isAdmin(user) {
  return ADMIN_ROLES.includes(String(user?.role || '').toLowerCase());
}

function roleLabel(user) {
  return isAdmin(user) ? 'Quản trị viên' : 'Nhân viên';
}

function initials(value) {
  return String(value || '?')
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

function formatDate(value, fallback = 'Chưa ghi nhận') {
  if (!value) return fallback;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 1000000000000 ? numeric * 1000 : numeric)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function auditLabel(eventName) {
  const labels = {
    AUTH_LOGIN: 'Đăng nhập quản trị',
    AUTH_ADMIN_SSO_LOGIN: 'Admin đăng nhập qua UpGO Account',
    AUTH_LOGOUT: 'Đăng xuất',
    AUTH_SSO_LOGIN: 'Nhân viên đăng nhập qua Account',
    AUTH_ACCOUNT_LOGOUT: 'Đăng xuất UpGO Account',
    AUTH_MANAGEMENT_PASSWORD_CHANGE: 'Đổi mật khẩu quản trị Chatmgt',
    AUTH_PASSWORD_CHANGE: 'Đổi mật khẩu',
    ACCOUNT_CREATED: 'Tạo tài khoản nhân viên',
    ACCOUNT_UPDATED: 'Cập nhật tài khoản nhân viên',
    ACCOUNT_PASSWORD_RESET_BY_ADMIN: 'Đặt lại mật khẩu nhân viên',
    ACCOUNT_LOCAL_ACCESS_PROVISIONED: 'Cấp quyền đăng nhập ChatUI',
    ACCOUNT_SESSION_REVOKED: 'Bắt đăng xuất khỏi Chat',
  };
  return labels[eventName] || String(eventName || 'Sự kiện hệ thống').replaceAll('_', ' ');
}

function BrandLogo() {
  return (
    <span className="management-brand-mark">
      <ChatLogo alt="ACSI" />
    </span>
  );
}

function avatarSource(user) {
  return String(user?.avatar || user?.avatarUrl || user?.avatar_url || user?.photo || '').trim();
}

function ManagementAvatar({ user, name, icon = '', size = 'default', eager = false }) {
  const source = avatarSource(user);
  const displayName = name || user?.name || user?.username || 'Avatar';
  const [failedSource, setFailedSource] = useState('');
  const showImage = source && source !== failedSource;

  return (
    <span className={`management-avatar ${size !== 'default' ? size : ''} ${showImage ? 'has-image' : ''}`} aria-label={displayName}>
      {showImage
        ? <img src={source} alt={displayName} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailedSource(source)} />
        : icon
          ? <i className={icon}></i>
          : initials(displayName)}
    </span>
  );
}

function LoginScreen({ onLogin, error, loading }) {
  const submit = event => {
    event.preventDefault();
    onLogin();
  };

  return (
    <main className="management-login">
      <section className="management-login-story" aria-hidden="true">
        <div className="management-login-grid"></div>
        <div className="management-brand-lockup"><BrandLogo /><div><strong>ACSI</strong><span>Chat operations</span></div></div>
        <div className="management-story-copy">
          <span className="management-kicker">Trung tâm điều phối Chatmgt</span>
          <h1>Quản lý vận hành mà không hiển thị thông tin hay nội dung hội thoại.</h1>

        </div>
        <div className="management-story-status">
          <span><i className="fa-solid fa-building-shield"></i> Cách ly theo tenant</span>
          <span><i className="fa-solid fa-diagram-project"></i> Account → Chatmgt → Tinode</span>
        </div>
      </section>

      <section className="management-login-panel">
        <form className="management-login-card" onSubmit={submit}>
          <div className="management-login-heading">
            <span className="management-eyebrow">chatmgt.upgo.vn</span>
            <h2>Đăng nhập quản trị</h2>

          </div>
          {error && <div className="management-inline-error" role="alert"><i className="fa-solid fa-circle-exclamation"></i>{error}</div>}
          <button className="management-login-button" type="submit" disabled={loading}>
            {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-building-shield"></i>}
            {loading ? 'Đang xác thực...' : 'Đăng nhập bằng UpGO Account'}
          </button>
          <a className="management-account-switch" href={ACCOUNT_ADMIN_URL} target="_blank" rel="noreferrer">UpGO Account <i className="fa-solid fa-arrow-up-right-from-square"></i></a>
        </form>
      </section>
    </main>
  );
}

function MetricCard({ icon, value, label, detail, tone = 'default' }) {
  return (
    <article className={`management-metric tone-${tone}`}>
      <span className="management-metric-icon"><i className={icon}></i></span>
      <div><strong>{value}</strong><span>{label}</span></div>
      <small>{detail}</small>
    </article>
  );
}

function SystemCard({ icon, label, ready, title, readyText = 'Sẵn sàng', warningText = 'Cần cấu hình' }) {
  return (
    <article className={`management-system-card ${ready ? 'ready' : 'warning'}`}>
      <span><i className={icon}></i></span>
      <div><small>{label}</small><h3>{title}</h3></div>
      <em>{ready ? readyText : warningText}</em>
    </article>
  );
}

export default function ManagementApp() {
  const [authState, setAuthState] = useState('loading');
  const [session, setSession] = useState(null);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeView, setActiveView] = useState('overview');
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [health, setHealth] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [auditSearch, setAuditSearch] = useState('');
  const [actionUserId, setActionUserId] = useState('');
  const [notice, setNotice] = useState(null);
  const [chatUiMaintenance, setChatUiMaintenance] = useState({ enabled: false, updatedAt: 0 });
  const [chatUiMaintenanceSaving, setChatUiMaintenanceSaving] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    document.title = 'Trung tâm quản trị Chatmgt';
    let cancelled = false;
    const completingAccountLogin = managementAdminService.consumeAccountLoginCallback();
    const sessionRequest = completingAccountLogin
      ? managementAdminService.login()
      : managementAdminService.currentSession();
    sessionRequest
      .then(current => {
        if (cancelled) return;
        setSession(current);
        setAuthState(isAdmin(current.user) ? 'authenticated' : 'forbidden');
      })
      .catch(error => {
        if (cancelled) return;
        setLoginError(error?.message || 'Không thể xác thực quyền quản trị.');
        setAuthState('anonymous');
      });
    return () => { cancelled = true; };
  }, []);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoadingData(true);
    const results = await Promise.allSettled([
      managementAdminService.listUsers(),
      managementAdminService.listAuditLogs(),
      managementAdminService.health(),
      managementAdminService.getChatUiMaintenance(),
    ]);
    const [usersResult, auditResult, healthResult, maintenanceResult] = results;
    if (usersResult.status === 'fulfilled') setUsers(usersResult.value);
    if (auditResult.status === 'fulfilled') setAuditLogs(auditResult.value);
    if (healthResult.status === 'fulfilled') setHealth(healthResult.value);
    if (maintenanceResult.status === 'fulfilled') setChatUiMaintenance(maintenanceResult.value);
    const firstError = results.find(result => result.status === 'rejected')?.reason;
    if (firstError && !silent) setNotice({ type: 'error', text: firstError.message || 'Không tải được toàn bộ dữ liệu quản trị.' });
    if (!silent) setLoadingData(false);
  }, []);

  useEffect(() => {
    if (authState !== 'authenticated') return undefined;
    loadData();
    const refresh = () => loadData({ silent: true });
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [authState, loadData]);

  useEffect(() => {
    if (authState !== 'authenticated') return undefined;
    const closeStream = subscribeChatMaintenance({
      onState: setChatUiMaintenance,
    });
    return () => closeStream?.();
  }, [authState]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const employees = users;
  const visibleUsers = useMemo(() => employees.filter(user => {
    const haystack = `${user.name} ${user.username} ${user.email || ''} ${user.department || ''}`.toLowerCase();
    if (search.trim() && !haystack.includes(search.trim().toLowerCase())) return false;
    if (statusFilter === 'active' && !user.active) return false;
    if (statusFilter === 'inactive' && user.active) return false;
    if (roleFilter === 'admin' && !isAdmin(user)) return false;
    if (roleFilter === 'member' && isAdmin(user)) return false;
    return true;
  }), [employees, search, statusFilter, roleFilter]);

  const visibleAuditLogs = useMemo(() => auditLogs.filter(log => {
    if (!auditSearch.trim()) return true;
    const account = users.find(user => user.id === log.userId || user.id === log.properties?.account_id);
    return `${auditLabel(log.eventName)} ${log.eventName} ${account?.name || ''} ${log.ipAddress || ''}`.toLowerCase().includes(auditSearch.trim().toLowerCase());
  }), [auditLogs, auditSearch, users]);

  const stats = useMemo(() => ({
    employees: employees.length,
    activeEmployees: employees.filter(user => user.active).length,
    provisioned: employees.filter(user => user.tinodeUid).length,
  }), [employees]);

  const currentAdmin = useMemo(() => {
    const currentId = String(session?.user?.id || '');
    return users.find(user => String(user.id) === currentId) || session?.user || { id: '', name: '' };
  }, [session, users]);

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const current = await managementAdminService.login();
      setSession(current);
      setAuthState(isAdmin(current.user) ? 'authenticated' : 'forbidden');
    } catch (error) {
      if (error?.code === 'ACCOUNT_LOGIN_REQUIRED') {
        managementAdminService.startAccountLogin();
        return;
      }
      setLoginError(error.message || 'Không thể đăng nhập.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await managementAdminService.logout().catch(() => {});
    setSession(null);
    setUsers([]);
    setAuditLogs([]);
    setAuthState('anonymous');
  };

  const revokeSessions = async user => {
    if (!window.confirm(`Bắt ${user.name} đăng xuất khỏi Chat? Toàn bộ phiên Chatmgt hiện tại sẽ bị thu hồi và người dùng phải đăng nhập lại.`)) return;
    setActionUserId(user.id);
    try {
      await managementAdminService.revokeSessions(user.id);
      setNotice({ type: 'success', text: `Đã bắt ${user.name} đăng xuất khỏi Chat.` });
      setAuditLogs(await managementAdminService.listAuditLogs());
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Không thể bắt tài khoản đăng xuất khỏi Chat.' });
    } finally {
      setActionUserId('');
    }
  };

  const toggleChatUiMaintenance = async enabled => {
    const action = enabled ? 'tạm dừng toàn bộ Chat UI' : 'mở lại Chat UI';
    if (!window.confirm(`Bạn có chắc muốn ${action}? Thay đổi sẽ áp dụng realtime cho mọi người đang dùng Chat UI.`)) return;
    setChatUiMaintenanceSaving(true);
    try {
      const nextState = await managementAdminService.setChatUiMaintenance(enabled);
      setChatUiMaintenance(nextState);
      setNotice({
        type: 'success',
        text: enabled ? 'Đã tạm dừng Chat UI realtime.' : 'Đã mở lại Chat UI realtime.',
      });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Không thể thay đổi trạng thái Chat UI.' });
    } finally {
      setChatUiMaintenanceSaving(false);
    }
  };

  if (authState === 'loading') return <div className="management-boot"><BrandLogo /><i className="fa-solid fa-spinner fa-spin"></i></div>;
  if (authState === 'anonymous') return <LoginScreen onLogin={handleLogin} error={loginError} loading={loginLoading} />;
  if (authState === 'forbidden') {
    return (
      <main className="management-denied">
        <span className="management-denied-icon"><i className="fa-solid fa-user-lock"></i></span>
        <span className="management-eyebrow">Không đủ quyền truy cập</span>
        <h1>Cổng này chỉ dành cho quản trị viên của tenant trên UpGO Account.</h1>

        <a className="management-button primary" href={ACCOUNT_ADMIN_URL}>Mở UpGO Account</a>
      </main>
    );
  }

  const navItems = [
    { id: 'overview', label: 'Tổng quan', icon: 'fa-solid fa-chart-pie' },
    { id: 'directory', label: 'Nhân viên', icon: 'fa-solid fa-address-book', count: stats.employees },
    { id: 'audit', label: 'Nhật ký bảo mật', icon: 'fa-solid fa-shield-halved' },
    { id: 'system', label: 'Luồng hệ thống', icon: 'fa-solid fa-diagram-project' },
  ];

  return (
    <div className={`management-root ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`management-sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <div className="management-sidebar-brand"><BrandLogo /><div><strong>ACSI</strong><span>Operations console</span></div></div>
        <button type="button" className="management-sidebar-toggle" onClick={() => setSidebarCollapsed(previous => !previous)} title={sidebarCollapsed ? 'Mở rộng thanh quản lý' : 'Thu gọn thanh quản lý'} aria-label={sidebarCollapsed ? 'Mở rộng thanh quản lý' : 'Thu gọn thanh quản lý'} aria-pressed={sidebarCollapsed}><i className={`fa-solid ${sidebarCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`}></i></button>
        <nav className="management-nav" aria-label="Điều hướng quản trị">
          <span className="management-nav-label">Quản trị Chatmgt</span>
          {navItems.map(item => (
            <button type="button" key={item.id} className={activeView === item.id ? 'active' : ''} onClick={() => { setActiveView(item.id); setMobileNavOpen(false); }} title={sidebarCollapsed ? item.label : undefined}>
              <i className={item.icon}></i><span>{item.label}</span>{item.count !== undefined && <em>{item.count}</em>}
            </button>
          ))}
        </nav>
        <div className="management-sidebar-footer">
          <div className="management-sidebar-user"><ManagementAvatar user={currentAdmin} size="small" eager /><div><strong>{currentAdmin.name}</strong><span>Admin từ UpGO Account</span></div></div>
          <button type="button" className="management-logout" onClick={handleLogout} title="Đăng xuất"><i className="fa-solid fa-arrow-right-from-bracket"></i></button>
        </div>
      </aside>

      {mobileNavOpen && <button className="management-mobile-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Đóng menu"></button>}

      <main className="management-main">
        <header className="management-topbar">
          <button className="management-mobile-menu" type="button" onClick={() => setMobileNavOpen(true)} aria-label="Mở menu"><i className="fa-solid fa-bars"></i></button>
          <div className="management-topbar-heading">
            <span className="management-eyebrow"><i className="fa-solid fa-building"></i>{session.tenant?.name || session.user.tenantName || 'Tenant hiện tại'}</span>
            <div className="management-topbar-title"><h1>{navItems.find(item => item.id === activeView)?.label}</h1><span>Control plane</span></div>
          </div>
          <div className="management-topbar-actions">
            <span className={`management-health-pill ${health?.status === 'ok' ? 'online' : ''}`} aria-live="polite"><i></i>{health?.status === 'ok' ? 'Hệ thống ổn định' : 'Đang đồng bộ'}</span>
            <button type="button" className="management-icon-button" onClick={() => loadData()} title="Làm mới dữ liệu hiển thị" disabled={loadingData}><i className={`fa-solid fa-rotate ${loadingData ? 'fa-spin' : ''}`}></i></button>
          </div>
        </header>

        {notice && <div className={`management-toast ${notice.type}`} role="status"><i className={`fa-solid ${notice.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>{notice.text}</div>}

        <div className="management-content">
          {activeView === 'overview' && (
            <section className="management-view management-overview">
              <div className="management-flow-boundary">
                <span><i className="fa-solid fa-building-shield"></i><strong>Admin doanh nghiệp</strong></span>
                <i className="fa-solid fa-arrow-right-long"></i>
                <span className="active"><i className="fa-solid fa-diagram-project"></i><strong>Chatmgt</strong></span>
                <i className="fa-solid fa-arrow-right-long"></i>
                <span><i className="fa-solid fa-bolt"></i><strong>Tinode</strong></span>
              </div>
              <div className="management-hero-card">
                <div className="management-hero-copy"><span className="management-kicker">Tổng quan vận hành</span><h2>Chatmgt đang giữ đúng ranh giới quản trị.</h2><div className="management-hero-context"><span><i className="fa-solid fa-shield-halved"></i>Tenant-scoped</span><span><i className="fa-solid fa-arrows-rotate"></i>Tự đồng bộ 30 giây</span><span className={health?.account_sso?.tinode_bridge_configured ? 'ready' : 'pending'}><i className="fa-solid fa-bolt"></i>{health?.account_sso?.tinode_bridge_configured ? 'Tinode sẵn sàng' : 'Đang kiểm tra Tinode'}</span></div></div>
                <div className="management-hero-orbit" aria-hidden="true"><span>{stats.activeEmployees}</span><small>nhân viên active</small></div>
              </div>
              <div className="management-metrics-grid">
                <MetricCard icon="fa-solid fa-address-book" value={stats.employees} label="Tài khoản trong tenant" detail={`${stats.activeEmployees} đang hoạt động`} />
                <MetricCard icon="fa-solid fa-link" value={stats.provisioned} label="Đã có Tinode UID" detail="Sẵn sàng nâng lên realtime" tone="green" />
                <MetricCard icon="fa-solid fa-right-from-bracket" value="Duy nhất" label="Thao tác trên tài khoản" detail="Bắt đăng xuất khỏi Chat" tone="orange" />
              </div>
              <article className={`management-maintenance-card ${chatUiMaintenance.enabled ? 'enabled' : ''}`}>
                <div className="management-maintenance-icon" aria-hidden="true"><i className={`fa-solid fa-gear ${chatUiMaintenance.enabled ? 'fa-spin' : ''}`}></i></div>
                <div className="management-maintenance-copy">
                  <span className="management-kicker">Điều khiển Chat UI</span>
                  <h3>Tạm dừng truy cập Chat UI</h3>
                  <p>{chatUiMaintenance.enabled ? 'Chat UI đang hiện màn hình bảo trì cho tất cả người dùng.' : 'Bật trong lúc có thêm thay đổi để ngăn người dùng vào luồng chưa ổn định.'}</p>
                  <span className={`management-maintenance-status ${chatUiMaintenance.enabled ? 'enabled' : ''}`}><i></i>{chatUiMaintenance.enabled ? 'Đang tác động realtime' : 'Chat UI đang hoạt động bình thường'}</span>
                </div>
                <button
                  type="button"
                  className={`management-button ${chatUiMaintenance.enabled ? 'danger' : 'primary'}`}
                  onClick={() => toggleChatUiMaintenance(!chatUiMaintenance.enabled)}
                  disabled={chatUiMaintenanceSaving}
                >
                  <i className={`fa-solid ${chatUiMaintenanceSaving ? 'fa-spinner fa-spin' : chatUiMaintenance.enabled ? 'fa-power-off' : 'fa-pause'}`}></i>
                  {chatUiMaintenanceSaving ? 'Đang cập nhật...' : chatUiMaintenance.enabled ? 'Mở lại Chat UI' : 'Bật tạm dừng'}
                </button>
              </article>
              <div className="management-overview-grid">
                <article className="management-panel management-security-panel">
                  <header><div><span className="management-eyebrow">An toàn truy cập</span><h3>Nhật ký gần nhất</h3></div><span className="management-live-dot">Tự làm mới</span></header>
                  <div className="management-audit-mini">
                    {auditLogs.slice(0, 6).map(log => <div key={log.id}><span className={`management-event-icon ${log.success ? 'success' : 'failed'}`}><i className={`fa-solid ${log.success ? 'fa-check' : 'fa-xmark'}`}></i></span><div><strong>{auditLabel(log.eventName)}</strong><span>{formatDate(log.createdAt)} · {log.ipAddress || 'Nội bộ'}</span></div></div>)}
                    {auditLogs.length === 0 && <p className="management-empty-line">Chưa có sự kiện bảo mật.</p>}
                  </div>
                </article>
              </div>
            </section>
          )}

          {activeView === 'directory' && (
            <section className="management-view">
              <div className="management-section-heading">
                <div><span className="management-kicker">Nguồn chuẩn: UpGO Account theo tenant</span><h2>Tài khoản nhân viên doanh nghiệp</h2><p>Chatmgt chỉ hiển thị thông tin vận hành và cho phép bắt đăng xuất. Mọi thay đổi nhân sự được thực hiện trực tiếp tại UpGO Account.</p></div>
              </div>

              <div className="management-toolbar">
                <label className="management-search"><i className="fa-solid fa-magnifying-glass"></i><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tên, username, email, phòng ban..." /></label>
                <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="Lọc trạng thái"><option value="all">Mọi trạng thái</option><option value="active">Đang hoạt động</option><option value="inactive">Ngừng hoạt động</option></select>
                <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} aria-label="Lọc vai trò"><option value="all">Mọi vai trò</option><option value="admin">Admin tenant</option><option value="member">Nhân viên</option></select>
                <span className="management-result-count">{visibleUsers.length} tài khoản</span>
              </div>
              <div className="management-table-wrap">
                <table className="management-table management-directory-table">
                  <thead><tr><th>Nhân viên</th><th>Vai trò</th><th>Trạng thái</th><th>Nguồn xác thực</th><th>Cầu nối Tinode</th><th aria-label="Thao tác"></th></tr></thead>
                  <tbody>
                    {visibleUsers.map(user => {
                      const busy = actionUserId === user.id;
                      return (
                        <tr key={user.id} className={!user.active ? 'inactive' : ''}>
                          <td><div className="management-user-cell"><ManagementAvatar user={user} /><div><strong>{user.name}</strong><span>@{user.username}{user.email ? ` · ${user.email}` : ''}</span><small>{user.department || 'Chưa có phòng ban'}{user.title ? ` / ${user.title}` : ''}</small></div></div></td>
                          <td><span className={`management-role role-${isAdmin(user) ? 'admin' : 'member'}`}><i className={`fa-solid ${isAdmin(user) ? 'fa-shield' : 'fa-user'}`}></i>{roleLabel(user)}</span></td>
                          <td><span className={`management-status ${user.active ? 'active' : 'inactive'}`}><i></i>{user.active ? 'Đang hoạt động' : 'Đã khóa'}</span></td>
                          <td><span className={`management-status ${user.accountManaged ? 'inactive' : 'active'}`}><i></i>{user.accountManaged ? 'UpGO Account' : 'Chatmgt local'}</span></td>
                          <td><div className="management-tinode-account"><span className={`management-status ${user.tinodeUid ? 'active' : 'inactive'}`}><i></i>{user.tinodeUid ? 'Đã provision' : 'Chưa provision'}</span>{user.tinodeUid && user.tinodeUsername ? <code>{user.tinodeUsername}</code> : null}</div></td>
                          <td><div className="management-row-actions"><button type="button" className="warn" onClick={() => revokeSessions(user)} title="Bắt đăng xuất khỏi Chat" disabled={busy || !user.active || String(user.id) === String(currentAdmin.id)}><i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-right-from-bracket'}`}></i></button></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {visibleUsers.length === 0 && <div className="management-empty-state"><i className="fa-solid fa-address-book"></i><strong>Chưa có nhân viên phù hợp</strong></div>}
              </div>
            </section>
          )}

          {activeView === 'audit' && (
            <section className="management-view">
              <div className="management-section-heading"><div><span className="management-kicker">Lịch sử bảo mật</span><h2>Nhật ký Chatmgt</h2></div></div>
              <div className="management-toolbar audit-toolbar"><label className="management-search"><i className="fa-solid fa-magnifying-glass"></i><input value={auditSearch} onChange={event => setAuditSearch(event.target.value)} placeholder="Tìm sự kiện, người dùng hoặc IP..." /></label><span className="management-result-count">{visibleAuditLogs.length} sự kiện gần nhất</span></div>
              <div className="management-audit-list">
                {visibleAuditLogs.map(log => {
                  const targetId = log.properties?.account_id || log.userId;
                  const actor = users.find(user => String(user.id) === String(targetId));
                  return <article key={log.id}><span className={`management-event-icon large ${log.success ? 'success' : 'failed'}`}><i className={`fa-solid ${log.success ? 'fa-check' : 'fa-xmark'}`}></i></span><div className="management-audit-copy"><div className="management-audit-actor">{actor && <ManagementAvatar user={actor} size="mini" />}<div><strong>{auditLabel(log.eventName)}</strong><span>{actor ? `${actor.name} (@${actor.username})` : targetId || log.properties?.identity || 'Hệ thống'}</span></div></div></div><code>{log.eventName}</code><span className="management-audit-ip">{log.ipAddress || 'Nội bộ'}</span><time>{formatDate(log.createdAt)}</time></article>;
                })}
                {visibleAuditLogs.length === 0 && <div className="management-empty-state"><i className="fa-solid fa-shield"></i><strong>Chưa có sự kiện phù hợp</strong></div>}
              </div>
            </section>
          )}

          {activeView === 'system' && (
            <section className="management-view">
              <div className="management-section-heading"><div><span className="management-kicker">Luồng triển khai bốn bước</span><h2>Trạng thái Admin SSO → Chatmgt → Tinode</h2></div><a className="management-button ghost" href={ACCOUNT_ADMIN_URL} target="_blank" rel="noreferrer"><i className="fa-solid fa-building-shield"></i> Quản lý admin tại Account</a></div>
              <div className="management-system-grid">
                <SystemCard icon="fa-solid fa-server" label="Chatmgt API" ready={health?.status === 'ok'} title={health?.status === 'ok' ? 'Đang hoạt động' : 'Không xác định'} />
                <SystemCard icon="fa-solid fa-id-card" label="UpGO Account Admin SSO" ready={Boolean(health?.account_sso?.admin_configured)} title={health?.account_sso?.admin_configured ? 'Đã kết nối' : 'Chưa hoàn chỉnh'} />
                <SystemCard icon="fa-solid fa-address-book" label="Tài khoản nhân viên" ready={health?.employee_auth?.login_endpoint === '/api/v1/auth/sso'} title={health?.employee_auth?.login_endpoint === '/api/v1/auth/sso' ? 'Đang dùng UpGO Account SSO' : 'Chatmgt local'} />
                <SystemCard icon="fa-solid fa-bolt" label="Cầu nối Tinode" ready={Boolean(health?.account_sso?.tinode_bridge_configured)} title={health?.account_sso?.tinode_bridge_configured ? 'Sẵn sàng realtime' : 'Chưa sẵn sàng'} />
                <SystemCard icon="fa-solid fa-cookie-bite" label="Phiên quản trị riêng" ready={Boolean(health?.management_session?.isolated && health?.management_session?.cookie_secure)} title={health?.management_session?.isolated ? 'Đã cách ly' : 'Cần kiểm tra'} readyText="Được bảo vệ" warningText="Cần kiểm tra" />
                <SystemCard icon="fa-solid fa-eye-slash" label="Ranh giới dữ liệu" ready title="Không hiển thị thông tin hội thoại" readyText="Đúng kiến trúc" />
              </div>
            </section>
          )}
        </div>
      </main>

    </div>
  );
}
