import { useCallback, useEffect, useMemo, useState } from 'react';
import { managementAdminService } from './services/managementAdminService.js';
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
    ACCOUNT_SESSION_REVOKED: 'Thu hồi phiên Chatmgt',
  };
  return labels[eventName] || String(eventName || 'Sự kiện hệ thống').replaceAll('_', ' ');
}

function BrandLogo() {
  return (
    <span className="management-brand-mark">
      <img src="/chat-logo.svg" alt="ACSI" />
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
          <h1>Quản lý đúng luồng, không đi vào nội dung hội thoại.</h1>
          <p>Chatmgt theo dõi projection nhân sự, metadata cuộc trò chuyện, phiên truy cập và cầu nối Tinode trong phạm vi từng đơn vị.</p>
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
            <p>Dùng tài khoản UpGO Account đang giữ vai trò admin, owner hoặc superadmin trong tenant hiện tại.</p>
          </div>
          {error && <div className="management-inline-error" role="alert"><i className="fa-solid fa-circle-exclamation"></i>{error}</div>}
          <button className="management-login-button" type="submit" disabled={loading}>
            {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-building-shield"></i>}
            {loading ? 'Đang xác thực...' : 'Đăng nhập bằng UpGO Account'}
          </button>
          <p className="management-login-note"><i className="fa-solid fa-lock"></i> Nhân viên không có quyền admin sẽ bị backend từ chối, kể cả khi đã đăng nhập Account.</p>
          <a className="management-account-switch" href={ACCOUNT_ADMIN_URL} target="_blank" rel="noreferrer">Mở UpGO Account để kiểm tra tài khoản/tenant <i className="fa-solid fa-arrow-up-right-from-square"></i></a>
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

function SystemCard({ icon, label, ready, title, description, readyText = 'Sẵn sàng', warningText = 'Cần cấu hình' }) {
  return (
    <article className={`management-system-card ${ready ? 'ready' : 'warning'}`}>
      <span><i className={icon}></i></span>
      <div><small>{label}</small><h3>{title}</h3><p>{description}</p></div>
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
  const [conversations, setConversations] = useState([]);
  const [conversationSummary, setConversationSummary] = useState({});
  const [auditLogs, setAuditLogs] = useState([]);
  const [health, setHealth] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [conversationSearch, setConversationSearch] = useState('');
  const [conversationType, setConversationType] = useState('all');
  const [auditSearch, setAuditSearch] = useState('');
  const [actionUserId, setActionUserId] = useState('');
  const [notice, setNotice] = useState(null);
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
      managementAdminService.listConversations(),
      managementAdminService.listAuditLogs(),
      managementAdminService.health(),
    ]);
    const [usersResult, conversationResult, auditResult, healthResult] = results;
    if (usersResult.status === 'fulfilled') setUsers(usersResult.value);
    if (conversationResult.status === 'fulfilled') {
      setConversations(conversationResult.value.items);
      setConversationSummary(conversationResult.value.summary);
    }
    if (auditResult.status === 'fulfilled') setAuditLogs(auditResult.value);
    if (healthResult.status === 'fulfilled') setHealth(healthResult.value);
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
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const employees = useMemo(() => users.filter(user => user.accountManaged), [users]);
  const visibleUsers = useMemo(() => employees.filter(user => {
    const haystack = `${user.name} ${user.username} ${user.email || ''} ${user.department || ''}`.toLowerCase();
    if (search.trim() && !haystack.includes(search.trim().toLowerCase())) return false;
    if (statusFilter === 'active' && !user.active) return false;
    if (statusFilter === 'inactive' && user.active) return false;
    if (roleFilter === 'admin' && !isAdmin(user)) return false;
    if (roleFilter === 'member' && isAdmin(user)) return false;
    return true;
  }), [employees, search, statusFilter, roleFilter]);

  const visibleConversations = useMemo(() => conversations.filter(conversation => {
    const memberNames = conversation.members.map(member => `${member.name} ${member.username}`).join(' ');
    const haystack = `${conversation.subject} ${memberNames}`.toLowerCase();
    if (conversationSearch.trim() && !haystack.includes(conversationSearch.trim().toLowerCase())) return false;
    if (conversationType === 'group' && !conversation.isGroup) return false;
    if (conversationType === 'direct' && conversation.isGroup) return false;
    return true;
  }), [conversations, conversationSearch, conversationType]);

  const visibleAuditLogs = useMemo(() => auditLogs.filter(log => {
    if (!auditSearch.trim()) return true;
    const account = users.find(user => user.id === log.userId || user.id === log.properties?.account_id);
    return `${auditLabel(log.eventName)} ${log.eventName} ${account?.name || ''} ${log.ipAddress || ''}`.toLowerCase().includes(auditSearch.trim().toLowerCase());
  }), [auditLogs, auditSearch, users]);

  const stats = useMemo(() => ({
    employees: employees.length,
    activeEmployees: employees.filter(user => user.active).length,
    provisioned: employees.filter(user => user.tinodeUid).length,
    conversations: Number(conversationSummary.total ?? conversations.length),
    groups: Number(conversationSummary.group ?? conversations.filter(item => item.isGroup).length),
    pendingFriendRequests: Number(conversationSummary.friendRequests?.pending || 0),
  }), [employees, conversations, conversationSummary]);

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
    setConversations([]);
    setAuditLogs([]);
    setAuthState('anonymous');
  };

  const revokeSessions = async user => {
    if (!window.confirm(`Thu hồi toàn bộ phiên Chatmgt hiện tại của ${user.name}? Tài khoản UpGO Account vẫn được giữ nguyên.`)) return;
    setActionUserId(user.id);
    try {
      await managementAdminService.revokeSessions(user.id);
      setNotice({ type: 'success', text: `Đã thu hồi phiên Chatmgt của ${user.name}.` });
      setAuditLogs(await managementAdminService.listAuditLogs());
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Không thu hồi được phiên Chatmgt.' });
    } finally {
      setActionUserId('');
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
        <p>Hãy chọn đúng tenant và bảo đảm tài khoản có role admin, owner hoặc superadmin trước khi thử lại.</p>
        <a className="management-button primary" href={ACCOUNT_ADMIN_URL}>Mở UpGO Account</a>
      </main>
    );
  }

  const navItems = [
    { id: 'overview', label: 'Tổng quan', icon: 'fa-solid fa-chart-pie' },
    { id: 'directory', label: 'Danh bạ Account', icon: 'fa-solid fa-address-book', count: stats.employees },
    { id: 'conversations', label: 'Conversation & nhóm', icon: 'fa-solid fa-comments', count: stats.conversations },
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
          <div className="management-sidebar-user"><span className="management-avatar small">{initials(session.user.name)}</span><div><strong>{session.user.name}</strong><span>Admin từ UpGO Account</span></div></div>
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
            <a className="management-chat-link" href="https://chat.upgo.vn/" target="_blank" rel="noreferrer">Mở ChatUI <i className="fa-solid fa-arrow-up-right-from-square"></i></a>
          </div>
        </header>

        {notice && <div className={`management-toast ${notice.type}`} role="status"><i className={`fa-solid ${notice.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>{notice.text}</div>}

        <div className="management-content">
          {activeView === 'overview' && (
            <section className="management-view management-overview">
              <div className="management-flow-boundary">
                <span><i className="fa-solid fa-id-card"></i><strong>UpGO Account</strong><small>Danh tính, mật khẩu, vai trò nhân viên</small></span>
                <i className="fa-solid fa-arrow-right-long"></i>
                <span className="active"><i className="fa-solid fa-diagram-project"></i><strong>Chatmgt</strong><small>Projection, metadata, membership, session</small></span>
                <i className="fa-solid fa-arrow-right-long"></i>
                <span><i className="fa-solid fa-bolt"></i><strong>Tinode</strong><small>Tin nhắn, file và realtime</small></span>
              </div>
              <div className="management-hero-card">
                <div className="management-hero-copy"><span className="management-kicker">Tổng quan vận hành</span><h2>Chatmgt đang giữ đúng ranh giới quản trị.</h2><p>Trang này không tạo tài khoản nhân viên, không đổi mật khẩu Account và không xem nội dung tin nhắn. Mọi số liệu bên dưới chỉ là projection và metadata theo tenant.</p><div className="management-hero-context"><span><i className="fa-solid fa-shield-halved"></i>Tenant-scoped</span><span><i className="fa-solid fa-arrows-rotate"></i>Tự đồng bộ 30 giây</span><span className={health?.account_sso?.tinode_bridge_configured ? 'ready' : 'pending'}><i className="fa-solid fa-bolt"></i>{health?.account_sso?.tinode_bridge_configured ? 'Tinode sẵn sàng' : 'Đang kiểm tra Tinode'}</span></div></div>
                <div className="management-hero-orbit" aria-hidden="true"><span>{stats.activeEmployees}</span><small>nhân viên active</small></div>
              </div>
              <div className="management-metrics-grid">
                <MetricCard icon="fa-solid fa-address-book" value={stats.employees} label="Projection Account" detail={`${stats.activeEmployees} đang hoạt động`} />
                <MetricCard icon="fa-solid fa-comments" value={stats.conversations} label="Conversation metadata" detail={`${stats.groups} cuộc trò chuyện nhóm`} tone="ink" />
                <MetricCard icon="fa-solid fa-link" value={stats.provisioned} label="Đã có Tinode UID" detail="Sẵn sàng nâng lên realtime" tone="green" />
                <MetricCard icon="fa-solid fa-user-group" value={stats.pendingFriendRequests} label="Lời mời đang chờ" detail="Dữ liệu quan hệ do Chatmgt giữ" tone="orange" />
              </div>
              <div className="management-overview-grid">
                <article className="management-panel">
                  <header><div><span className="management-eyebrow">Metadata gần đây</span><h3>Conversation được cập nhật</h3></div><button onClick={() => setActiveView('conversations')}>Xem tất cả</button></header>
                  <div className="management-people-list">
                    {conversations.slice(0, 5).map(conversation => (
                      <div key={conversation.id}><span className="management-avatar"><i className={`fa-solid ${conversation.isGroup ? 'fa-users' : 'fa-user'}`}></i></span><div><strong>{conversation.subject}</strong><span>{conversation.isGroup ? 'Nhóm' : 'Trực tiếp'} · {conversation.participantCount} thành viên · {conversation.realtime.ready ? 'Realtime sẵn sàng' : 'Chờ Tinode'}</span></div><time>{formatDate(conversation.updatedAt)}</time></div>
                    ))}
                    {conversations.length === 0 && <p className="management-empty-line">Chưa có conversation trong tenant.</p>}
                  </div>
                </article>
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
                <div><span className="management-kicker">Nguồn chuẩn: account.upgo.vn</span><h2>Danh bạ nhân viên chỉ đọc</h2><p>Chatmgt chỉ lưu projection theo tenant để phục vụ chat. Tạo tài khoản, vai trò, trạng thái và hồ sơ nhân viên được quản lý tại UpGO Account.</p></div>
                <a className="management-button primary" href={ACCOUNT_ADMIN_URL} target="_blank" rel="noreferrer"><i className="fa-solid fa-arrow-up-right-from-square"></i> Quản lý tại Account</a>
              </div>
              <div className="management-source-note"><i className="fa-solid fa-circle-info"></i><span>Nút thao tác duy nhất tại đây là thu hồi phiên Chatmgt. Việc này không xóa, khóa hay đổi mật khẩu UpGO Account của nhân viên.</span></div>
              <div className="management-toolbar">
                <label className="management-search"><i className="fa-solid fa-magnifying-glass"></i><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tên, username, email, phòng ban..." /></label>
                <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="Lọc trạng thái"><option value="all">Mọi trạng thái</option><option value="active">Đang hoạt động</option><option value="inactive">Ngừng hoạt động</option></select>
                <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} aria-label="Lọc vai trò"><option value="all">Mọi vai trò</option><option value="admin">Admin tenant</option><option value="member">Nhân viên</option></select>
                <span className="management-result-count">{visibleUsers.length} projection</span>
              </div>
              <div className="management-table-wrap">
                <table className="management-table management-directory-table">
                  <thead><tr><th>Nhân viên từ Account</th><th>Vai trò Account</th><th>Projection</th><th>Cập nhật gần nhất</th><th>Cầu nối Tinode</th><th aria-label="Thao tác"></th></tr></thead>
                  <tbody>
                    {visibleUsers.map(user => {
                      const busy = actionUserId === user.id;
                      return (
                        <tr key={user.id} className={!user.active ? 'inactive' : ''}>
                          <td><div className="management-user-cell"><span className="management-avatar">{initials(user.name)}</span><div><strong>{user.name}</strong><span>@{user.username}{user.email ? ` · ${user.email}` : ''}</span><small>{user.department || 'Chưa có phòng ban'}{user.title ? ` / ${user.title}` : ''}</small></div></div></td>
                          <td><span className={`management-role role-${isAdmin(user) ? 'admin' : 'member'}`}><i className={`fa-solid ${isAdmin(user) ? 'fa-shield' : 'fa-user'}`}></i>{roleLabel(user)}</span></td>
                          <td><span className={`management-status ${user.active ? 'active' : 'inactive'}`}><i></i>{user.active ? 'Đang đồng bộ' : 'Đã ngừng'}</span></td>
                          <td><span className="management-date">{formatDate(user.updatedAt || user.lastLoginAt)}</span></td>
                          <td><span className={`management-status ${user.tinodeUid ? 'active' : 'inactive'}`}><i></i>{user.tinodeUid ? 'Đã provision' : 'Chưa provision'}</span></td>
                          <td><div className="management-row-actions"><button type="button" onClick={() => revokeSessions(user)} title="Thu hồi phiên Chatmgt" disabled={busy || !user.active}><i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-right-from-bracket'}`}></i></button></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {visibleUsers.length === 0 && <div className="management-empty-state"><i className="fa-solid fa-address-book"></i><strong>Chưa có projection phù hợp</strong><span>Danh bạ được đồng bộ từ UpGO Account khi luồng nhân viên được xác thực.</span></div>}
              </div>
            </section>
          )}

          {activeView === 'conversations' && (
            <section className="management-view">
              <div className="management-section-heading"><div><span className="management-kicker">Chatmgt là nguồn metadata</span><h2>Conversation và nhóm</h2><p>Theo dõi subject, thành viên, chủ nhóm và trạng thái binding Tinode. Nội dung tin nhắn, file, typing và receipt không được tải vào trang quản trị.</p></div></div>
              <div className="management-source-note secure"><i className="fa-solid fa-eye-slash"></i><span>Không có API đọc lịch sử tin nhắn Tinode trên bề mặt quản trị này.</span></div>
              <div className="management-toolbar">
                <label className="management-search"><i className="fa-solid fa-magnifying-glass"></i><input value={conversationSearch} onChange={event => setConversationSearch(event.target.value)} placeholder="Tìm subject hoặc thành viên..." /></label>
                <select value={conversationType} onChange={event => setConversationType(event.target.value)} aria-label="Lọc loại conversation"><option value="all">Tất cả loại</option><option value="direct">Chat trực tiếp</option><option value="group">Nhóm</option></select>
                <span className="management-result-count">{visibleConversations.length} conversation</span>
              </div>
              <div className="management-table-wrap">
                <table className="management-table management-conversation-table">
                  <thead><tr><th>Conversation</th><th>Thành viên</th><th>Chủ sở hữu</th><th>Realtime Tinode</th><th>Cập nhật</th></tr></thead>
                  <tbody>
                    {visibleConversations.map(conversation => {
                      const owner = conversation.members.find(member => member.id === conversation.ownerId);
                      return (
                        <tr key={conversation.id}>
                          <td><div className="management-user-cell"><span className="management-avatar"><i className={`fa-solid ${conversation.isGroup ? 'fa-users' : 'fa-user'}`}></i></span><div><strong>{conversation.subject}</strong><span>{conversation.isGroup ? 'Nhóm dùng topic chung' : 'Direct dùng topic theo người xem'}</span><small>{conversation.id}</small></div></div></td>
                          <td><div className="management-member-stack"><strong>{conversation.participantCount} thành viên</strong><span>{conversation.members.map(member => member.name).join(', ') || 'Chưa có projection hợp lệ'}</span></div></td>
                          <td><span className="management-date">{owner?.name || 'Chưa xác định'}</span></td>
                          <td><span className={`management-status ${conversation.realtime.ready ? 'active' : 'inactive'}`}><i></i>{conversation.realtime.ready ? 'Sẵn sàng' : `Chờ UID (${conversation.realtime.provisionedParticipants}/${conversation.participantCount})`}</span></td>
                          <td><span className="management-date">{formatDate(conversation.updatedAt)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {visibleConversations.length === 0 && <div className="management-empty-state"><i className="fa-solid fa-comments"></i><strong>Chưa có conversation phù hợp</strong><span>ChatUI sẽ tạo metadata conversation qua Chatmgt trước khi dùng Tinode realtime.</span></div>}
              </div>
            </section>
          )}

          {activeView === 'audit' && (
            <section className="management-view">
              <div className="management-section-heading"><div><span className="management-kicker">Lịch sử bảo mật</span><h2>Nhật ký Chatmgt</h2><p>Theo dõi đăng nhập, đăng xuất, SSO và thao tác thu hồi phiên trong đúng tenant.</p></div></div>
              <div className="management-toolbar audit-toolbar"><label className="management-search"><i className="fa-solid fa-magnifying-glass"></i><input value={auditSearch} onChange={event => setAuditSearch(event.target.value)} placeholder="Tìm sự kiện, người dùng hoặc IP..." /></label><span className="management-result-count">{visibleAuditLogs.length} sự kiện gần nhất</span></div>
              <div className="management-audit-list">
                {visibleAuditLogs.map(log => {
                  const targetId = log.properties?.account_id || log.userId;
                  const actor = users.find(user => user.id === targetId);
                  return <article key={log.id}><span className={`management-event-icon large ${log.success ? 'success' : 'failed'}`}><i className={`fa-solid ${log.success ? 'fa-check' : 'fa-xmark'}`}></i></span><div className="management-audit-copy"><strong>{auditLabel(log.eventName)}</strong><span>{actor ? `${actor.name} (@${actor.username})` : targetId || log.properties?.identity || 'Hệ thống'}</span></div><code>{log.eventName}</code><span className="management-audit-ip">{log.ipAddress || 'Nội bộ'}</span><time>{formatDate(log.createdAt)}</time></article>;
                })}
                {visibleAuditLogs.length === 0 && <div className="management-empty-state"><i className="fa-solid fa-shield"></i><strong>Chưa có sự kiện phù hợp</strong></div>}
              </div>
            </section>
          )}

          {activeView === 'system' && (
            <section className="management-view">
              <div className="management-section-heading"><div><span className="management-kicker">Luồng triển khai bốn bước</span><h2>Trạng thái Account → Chatmgt → Tinode</h2><p>Các thẻ phản ánh đúng cấu hình backend; không dùng trạng thái giả từ trình duyệt.</p></div><a className="management-button ghost" href={ACCOUNT_ADMIN_URL} target="_blank" rel="noreferrer"><i className="fa-solid fa-building-shield"></i> Quản lý quyền tại Account</a></div>
              <div className="management-system-grid">
                <SystemCard icon="fa-solid fa-server" label="Chatmgt API" ready={health?.status === 'ok'} title={health?.status === 'ok' ? 'Đang hoạt động' : 'Không xác định'} description="Phiên quản trị, projection, metadata conversation và audit log thuộc dịch vụ này." />
                <SystemCard icon="fa-solid fa-id-card" label="UpGO Account SSO" ready={Boolean(health?.account_sso?.configured)} title={health?.account_sso?.configured ? 'Đã kết nối' : 'Chưa hoàn chỉnh'} description="Account là nguồn chuẩn của danh tính, mật khẩu, tenant membership và hồ sơ nhân viên." />
                <SystemCard icon="fa-solid fa-address-book" label="Danh bạ tenant" ready={Boolean(health?.account_sso?.directory_configured)} title={health?.account_sso?.directory_configured ? 'Đã cấu hình' : 'Chưa cấu hình'} description="Chatmgt đồng bộ projection tenant-scoped từ endpoint danh bạ Account phía server." />
                <SystemCard icon="fa-solid fa-bolt" label="Cầu nối Tinode" ready={Boolean(health?.account_sso?.tinode_bridge_configured)} title={health?.account_sso?.tinode_bridge_configured ? 'Sẵn sàng realtime' : 'Chưa sẵn sàng'} description="Chatmgt provision UID và cấp token ngắn hạn; Tinode tiếp tục giữ tin nhắn và trạng thái realtime." />
                <SystemCard icon="fa-solid fa-cookie-bite" label="Phiên quản trị riêng" ready={Boolean(health?.management_session?.isolated && health?.management_session?.cookie_secure)} title={health?.management_session?.isolated ? 'Đã cách ly' : 'Cần kiểm tra'} description="Admin Chatmgt dùng cookie riêng, không nhận Tinode token và không đăng nhập thay nhân viên." readyText="Được bảo vệ" warningText="Cần kiểm tra" />
                <SystemCard icon="fa-solid fa-eye-slash" label="Ranh giới dữ liệu" ready title="Không đọc nội dung chat" description="Trang quản trị chỉ đọc metadata conversation; message, file, presence, typing và receipt ở Tinode/ChatAPI." readyText="Đúng kiến trúc" />
              </div>
            </section>
          )}
        </div>
      </main>

    </div>
  );
}
