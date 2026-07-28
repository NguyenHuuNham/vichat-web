import { useCallback, useEffect, useMemo, useState } from 'react';
import { managementAdminService } from './services/managementAdminService.js';
import './management.css';

const ADMIN_ROLES = ['admin', 'superadmin', 'owner'];

const emptyUserForm = {
  name: '',
  username: '',
  email: '',
  department: '',
  title: '',
  role: 'member',
  password: '',
  active: true,
};

function isAdmin(user) {
  return ADMIN_ROLES.includes(String(user?.role || '').toLowerCase());
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
    AUTH_LOGIN: 'Đăng nhập',
    AUTH_LOGOUT: 'Đăng xuất',
    AUTH_LOGIN_TINODE: 'Đăng nhập Tinode',
    ACCOUNT_CREATED: 'Tạo tài khoản',
    ACCOUNT_UPDATED: 'Cập nhật tài khoản',
    ACCOUNT_PROFILE_UPDATED: 'Cập nhật hồ sơ',
    ACCOUNT_SESSION_REVOKED: 'Thu hồi phiên',
    ACCOUNT_PASSWORD_RESET_BY_ADMIN: 'Đặt lại mật khẩu',
    AUTH_PASSWORD_CHANGE: 'Đổi mật khẩu',
    AUTH_PASSWORD_RESET: 'Khôi phục mật khẩu',
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
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');

  const submit = event => {
    event.preventDefault();
    onLogin({ identity, password });
  };

  return (
    <main className="management-login">
      <section className="management-login-story" aria-hidden="true">
        <div className="management-login-grid"></div>
        <div className="management-brand-lockup">
          <BrandLogo />
          <span>ACSI</span>
        </div>
        <div className="management-story-copy">
          <span className="management-kicker">Hệ thống quản trị nội bộ</span>
          <h1>Một nơi để giữ đội ngũ vận hành đúng nhịp.</h1>
          <p>Quản lý tài khoản, quyền truy cập và các phiên đăng nhập mà không đi vào dữ liệu hội thoại.</p>
        </div>
        <div className="management-story-status">
          <span><i className="fa-solid fa-shield-halved"></i> Tenant-scoped</span>
          <span><i className="fa-solid fa-wave-square"></i> Audit enabled</span>
        </div>
      </section>

      <section className="management-login-panel">
        <form className="management-login-card" onSubmit={submit}>
          <div className="management-login-heading">
            <span className="management-eyebrow">chatmgt.upgo.vn</span>
            <h2>Đăng nhập quản trị</h2>
            <p>Dùng tài khoản có quyền admin của ACSI.</p>
          </div>
          <label className="management-field">
            <span>Tài khoản hoặc email</span>
            <div className="management-input-wrap">
              <i className="fa-regular fa-user"></i>
              <input
                value={identity}
                onChange={event => setIdentity(event.target.value)}
                autoComplete="username"
                required
              />
            </div>
          </label>
          <label className="management-field">
            <span>Mật khẩu</span>
            <div className="management-input-wrap">
              <i className="fa-solid fa-key"></i>
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          </label>
          {error && <div className="management-inline-error" role="alert"><i className="fa-solid fa-circle-exclamation"></i>{error}</div>}
          <button className="management-login-button" type="submit" disabled={loading}>
            {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-arrow-right-to-bracket"></i>}
            {loading ? 'Đang xác thực...' : 'Vào trung tâm quản trị'}
          </button>
          <p className="management-login-note"><i className="fa-solid fa-lock"></i> Phiên đăng nhập được bảo vệ bằng cookie bảo mật.</p>
        </form>
      </section>
    </main>
  );
}

function MetricCard({ icon, value, label, detail, tone = 'default' }) {
  return (
    <article className={`management-metric tone-${tone}`}>
      <span className="management-metric-icon"><i className={icon}></i></span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
      <small>{detail}</small>
    </article>
  );
}

function UserEditor({ mode, form, setForm, onClose, onSubmit, saving, lockRole }) {
  const creating = mode === 'create';
  return (
    <div className="management-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="management-modal" onSubmit={onSubmit} onMouseDown={event => event.stopPropagation()}>
        <header className="management-modal-header">
          <div>
            <span className="management-eyebrow">{creating ? 'Tài khoản mới' : 'Chỉnh sửa hồ sơ'}</span>
            <h2>{creating ? 'Thêm thành viên' : form.name}</h2>
          </div>
          <button type="button" className="management-icon-button" onClick={onClose} aria-label="Đóng"><i className="fa-solid fa-xmark"></i></button>
        </header>
        <div className="management-form-grid">
          <label className="management-field wide">
            <span>Họ và tên</span>
            <input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label className="management-field">
            <span>Username</span>
            <input value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} disabled={!creating} required />
          </label>
          <label className="management-field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} />
          </label>
          <label className="management-field">
            <span>Phòng ban</span>
            <input value={form.department} onChange={event => setForm({ ...form, department: event.target.value })} placeholder="Ví dụ: Kinh doanh" />
          </label>
          <label className="management-field">
            <span>Chức danh</span>
            <input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Ví dụ: Trưởng nhóm" />
          </label>
          <label className="management-field">
            <span>Vai trò</span>
            <select value={form.role} onChange={event => setForm({ ...form, role: event.target.value })} disabled={lockRole}>
              <option value="member">Thành viên</option>
              <option value="admin">Quản trị viên</option>
            </select>
          </label>
          {creating && (
            <label className="management-field">
              <span>Mật khẩu ban đầu</span>
              <input type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} autoComplete="new-password" required />
            </label>
          )}
        </div>
        <footer className="management-modal-footer">
          <button type="button" className="management-button ghost" onClick={onClose}>Hủy</button>
          <button type="submit" className="management-button primary" disabled={saving}>
            {saving && <i className="fa-solid fa-spinner fa-spin"></i>}
            {creating ? 'Tạo tài khoản' : 'Lưu thay đổi'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function ResetPasswordDialog({ user, onClose, onSubmit, saving }) {
  const [password, setPassword] = useState('');
  return (
    <div className="management-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="management-modal compact" onSubmit={event => { event.preventDefault(); onSubmit(password); }} onMouseDown={event => event.stopPropagation()}>
        <header className="management-modal-header">
          <div>
            <span className="management-eyebrow">Bảo mật tài khoản</span>
            <h2>Đặt lại mật khẩu</h2>
          </div>
          <button type="button" className="management-icon-button" onClick={onClose} aria-label="Đóng"><i className="fa-solid fa-xmark"></i></button>
        </header>
        <p className="management-modal-copy">Đặt mật khẩu tạm thời cho <strong>{user.name}</strong>. Tất cả phiên hiện tại sẽ bị thu hồi.</p>
        <label className="management-field">
          <span>Mật khẩu mới</span>
          <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" required autoFocus />
        </label>
        <footer className="management-modal-footer">
          <button type="button" className="management-button ghost" onClick={onClose}>Hủy</button>
          <button type="submit" className="management-button danger" disabled={saving || !password}>
            {saving && <i className="fa-solid fa-spinner fa-spin"></i>} Đặt lại mật khẩu
          </button>
        </footer>
      </form>
    </div>
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
  const [editorMode, setEditorMode] = useState(null);
  const [editingUserId, setEditingUserId] = useState('');
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [resetUser, setResetUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [actionUserId, setActionUserId] = useState('');
  const [notice, setNotice] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    document.title = 'Chat - Power by Gon Platform';
    let cancelled = false;
    managementAdminService.currentSession()
      .then(current => {
        if (cancelled) return;
        setSession(current);
        setAuthState(isAdmin(current.user) ? 'authenticated' : 'forbidden');
      })
      .catch(() => {
        if (!cancelled) setAuthState('anonymous');
      });
    return () => { cancelled = true; };
  }, []);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoadingData(true);
    const results = await Promise.allSettled([
      managementAdminService.listUsers(),
      managementAdminService.listAuditLogs(),
      managementAdminService.health(),
    ]);
    const [usersResult, auditResult, healthResult] = results;
    if (usersResult.status === 'fulfilled') setUsers(usersResult.value);
    if (auditResult.status === 'fulfilled') setAuditLogs(auditResult.value);
    if (healthResult.status === 'fulfilled') setHealth(healthResult.value);
    const firstError = results.find(result => result.status === 'rejected')?.reason;
    if (firstError && !silent) {
      setNotice({ type: 'error', text: firstError.message || 'Không đồng bộ được toàn bộ dữ liệu quản trị.' });
    }
    if (!silent) setLoadingData(false);
  }, []);

  useEffect(() => {
    if (authState !== 'authenticated') return undefined;
    loadData();
    const refresh = () => loadData({ silent: true });
    const timer = window.setInterval(refresh, 20000);
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

  const visibleUsers = useMemo(() => users.filter(user => {
    const haystack = `${user.name} ${user.username} ${user.email || ''} ${user.department || ''}`.toLowerCase();
    if (search.trim() && !haystack.includes(search.trim().toLowerCase())) return false;
    if (statusFilter === 'active' && !user.active) return false;
    if (statusFilter === 'inactive' && user.active) return false;
    if (roleFilter !== 'all' && String(user.role || 'member').toLowerCase() !== roleFilter) return false;
    return true;
  }), [users, search, statusFilter, roleFilter]);

  const visibleAuditLogs = useMemo(() => auditLogs.filter(log => {
    if (!auditSearch.trim()) return true;
    const account = users.find(user => user.id === log.userId || user.id === log.properties?.account_id);
    return `${auditLabel(log.eventName)} ${log.eventName} ${account?.name || ''} ${log.ipAddress || ''}`
      .toLowerCase().includes(auditSearch.trim().toLowerCase());
  }), [auditLogs, auditSearch, users]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter(user => user.active).length,
    admins: users.filter(user => isAdmin(user)).length,
    inactive: users.filter(user => !user.active).length,
    recent: users.filter(user => {
      if (!user.lastLoginAt) return false;
      const timestamp = new Date(user.lastLoginAt).getTime();
      return Number.isFinite(timestamp) && timestamp > Date.now() - 7 * 86400000;
    }).length,
  }), [users]);

  const handleLogin = async credentials => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const current = await managementAdminService.login(credentials);
      setSession(current);
      setAuthState(isAdmin(current.user) ? 'authenticated' : 'forbidden');
    } catch (error) {
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

  const openCreate = () => {
    setEditingUserId('');
    setUserForm(emptyUserForm);
    setEditorMode('create');
  };

  const openEdit = user => {
    setEditingUserId(user.id);
    setUserForm({
      ...emptyUserForm,
      name: user.name || '',
      username: user.username || '',
      email: user.email || '',
      department: user.department || '',
      title: user.title || '',
      role: user.role || 'member',
      active: user.active,
    });
    setEditorMode('edit');
  };

  const saveUser = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editorMode === 'create') {
        const created = await managementAdminService.createUser(userForm);
        setUsers(previous => [...previous, created].sort((a, b) => a.name.localeCompare(b.name, 'vi')));
        setNotice({ type: 'success', text: `Đã tạo tài khoản ${created.username}.` });
      } else {
        const updated = await managementAdminService.updateUser(editingUserId, {
          name: userForm.name,
          email: userForm.email,
          department: userForm.department,
          title: userForm.title,
          role: userForm.role,
        });
        setUsers(previous => previous.map(user => user.id === updated.id ? updated : user));
        setNotice({ type: 'success', text: `Đã cập nhật ${updated.name}.` });
      }
      setEditorMode(null);
      const nextAudit = await managementAdminService.listAuditLogs();
      setAuditLogs(nextAudit);
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Không lưu được tài khoản.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleUser = async user => {
    const verb = user.active ? 'khóa' : 'mở khóa';
    if (!window.confirm(`Bạn chắc chắn muốn ${verb} tài khoản ${user.username}?`)) return;
    setActionUserId(user.id);
    try {
      const updated = await managementAdminService.updateUser(user.id, { active: !user.active });
      setUsers(previous => previous.map(item => item.id === updated.id ? updated : item));
      setNotice({ type: 'success', text: `Đã ${verb} tài khoản ${user.username}.` });
      setAuditLogs(await managementAdminService.listAuditLogs());
    } catch (error) {
      setNotice({ type: 'error', text: error.message || `Không thể ${verb} tài khoản.` });
    } finally {
      setActionUserId('');
    }
  };

  const revokeSessions = async user => {
    if (!window.confirm(`Thu hồi toàn bộ phiên đăng nhập của ${user.name}?`)) return;
    setActionUserId(user.id);
    try {
      await managementAdminService.revokeSessions(user.id);
      setNotice({ type: 'success', text: `Đã buộc ${user.username} đăng xuất trên mọi thiết bị.` });
      setAuditLogs(await managementAdminService.listAuditLogs());
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Không thu hồi được phiên đăng nhập.' });
    } finally {
      setActionUserId('');
    }
  };

  const submitResetPassword = async password => {
    setSaving(true);
    try {
      await managementAdminService.resetPassword(resetUser.id, password);
      setResetUser(null);
      setNotice({ type: 'success', text: `Đã đặt lại mật khẩu cho ${resetUser.username}.` });
      await loadData({ silent: true });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Không đặt lại được mật khẩu.' });
    } finally {
      setSaving(false);
    }
  };

  if (authState === 'loading') {
    return <div className="management-boot"><BrandLogo /><i className="fa-solid fa-spinner fa-spin"></i></div>;
  }
  if (authState === 'anonymous') {
    return <LoginScreen onLogin={handleLogin} error={loginError} loading={loginLoading} />;
  }
  if (authState === 'forbidden') {
    return (
      <main className="management-denied">
        <span className="management-denied-icon"><i className="fa-solid fa-user-lock"></i></span>
        <span className="management-eyebrow">Không đủ quyền truy cập</span>
        <h1>Cổng này dành cho quản trị viên.</h1>
        <p>Tài khoản <strong>{session?.user?.username}</strong> vẫn có thể sử dụng web chat bình thường.</p>
        <button className="management-button primary" onClick={handleLogout}>Đăng xuất</button>
      </main>
    );
  }

  const navItems = [
    { id: 'overview', label: 'Tổng quan', icon: 'fa-solid fa-chart-pie' },
    { id: 'users', label: 'Tài khoản', icon: 'fa-solid fa-users-gear', count: stats.total },
    { id: 'audit', label: 'Nhật ký bảo mật', icon: 'fa-solid fa-shield-halved' },
    { id: 'system', label: 'Trạng thái hệ thống', icon: 'fa-solid fa-wave-square' },
  ];

  return (
    <div className="management-root">
      <aside className={`management-sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <div className="management-sidebar-brand">
          <BrandLogo />
          <div><strong>ACSI</strong><span>Chat - Power by Gon Platform</span></div>
        </div>
        <nav className="management-nav" aria-label="Điều hướng quản trị">
          <span className="management-nav-label">Workspace</span>
          {navItems.map(item => (
            <button
              type="button"
              key={item.id}
              className={activeView === item.id ? 'active' : ''}
              onClick={() => { setActiveView(item.id); setMobileNavOpen(false); }}
            >
              <i className={item.icon}></i><span>{item.label}</span>{item.count !== undefined && <em>{item.count}</em>}
            </button>
          ))}
        </nav>
        <div className="management-sidebar-footer">
          <div className="management-sidebar-user">
            <span className="management-avatar small">{initials(session.user.name)}</span>
            <div><strong>{session.user.name}</strong><span>{session.user.role}</span></div>
          </div>
          <button type="button" className="management-logout" onClick={handleLogout} title="Đăng xuất"><i className="fa-solid fa-arrow-right-from-bracket"></i></button>
        </div>
      </aside>

      {mobileNavOpen && <button className="management-mobile-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Đóng menu"></button>}

      <main className="management-main">
        <header className="management-topbar">
          <button className="management-mobile-menu" type="button" onClick={() => setMobileNavOpen(true)} aria-label="Mở menu"><i className="fa-solid fa-bars"></i></button>
          <div>
            <span className="management-eyebrow">ACSI</span>
            <h1>{navItems.find(item => item.id === activeView)?.label}</h1>
          </div>
          <div className="management-topbar-actions">
            <button type="button" className="management-icon-button" onClick={() => loadData()} title="Đồng bộ dữ liệu" disabled={loadingData}><i className={`fa-solid fa-rotate ${loadingData ? 'fa-spin' : ''}`}></i></button>
            <a className="management-chat-link" href="https://chat.upgo.vn/" target="_blank" rel="noreferrer">Mở web chat <i className="fa-solid fa-arrow-up-right-from-square"></i></a>
          </div>
        </header>

        {notice && <div className={`management-toast ${notice.type}`} role="status"><i className={`fa-solid ${notice.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>{notice.text}</div>}

        <div className="management-content">
          {activeView === 'overview' && (
            <section className="management-view management-overview">
              <div className="management-hero-card">
                <div>
                  <span className="management-kicker">Operations snapshot</span>
                  <h2>Chào {session.user.name.split(' ').at(-1)}, hệ thống đang trong tầm kiểm soát.</h2>
                  <p>Theo dõi tài khoản, quyền truy cập và các tín hiệu bảo mật của tenant từ một màn hình.</p>
                </div>
                <div className="management-hero-orbit" aria-hidden="true"><span>{stats.active}</span><small>tài khoản hoạt động</small></div>
              </div>
              <div className="management-metrics-grid">
                <MetricCard icon="fa-solid fa-users" value={stats.total} label="Tổng tài khoản" detail={`${stats.active} đang hoạt động`} />
                <MetricCard icon="fa-solid fa-user-shield" value={stats.admins} label="Quản trị viên" detail="Có quyền quản lý tenant" tone="ink" />
                <MetricCard icon="fa-solid fa-door-open" value={stats.recent} label="Đăng nhập 7 ngày" detail="Dựa trên lần đăng nhập gần nhất" tone="green" />
                <MetricCard icon="fa-solid fa-user-lock" value={stats.inactive} label="Đang bị khóa" detail="Không thể đăng nhập" tone="orange" />
              </div>
              <div className="management-overview-grid">
                <article className="management-panel">
                  <header><div><span className="management-eyebrow">Truy cập gần đây</span><h3>Tài khoản mới hoạt động</h3></div><button onClick={() => setActiveView('users')}>Xem tất cả</button></header>
                  <div className="management-people-list">
                    {[...users].filter(user => user.lastLoginAt).sort((a, b) => new Date(b.lastLoginAt) - new Date(a.lastLoginAt)).slice(0, 5).map(user => (
                      <div key={user.id}>
                        <span className="management-avatar">{initials(user.name)}</span>
                        <div><strong>{user.name}</strong><span>@{user.username} · {user.department || 'Chưa có phòng ban'}</span></div>
                        <time>{formatDate(user.lastLoginAt)}</time>
                      </div>
                    ))}
                    {!users.some(user => user.lastLoginAt) && <p className="management-empty-line">Chưa có dữ liệu đăng nhập.</p>}
                  </div>
                </article>
                <article className="management-panel management-security-panel">
                  <header><div><span className="management-eyebrow">Security pulse</span><h3>Tín hiệu bảo mật</h3></div><span className="management-live-dot">Live</span></header>
                  <div className="management-audit-mini">
                    {auditLogs.slice(0, 6).map(log => (
                      <div key={log.id}>
                        <span className={`management-event-icon ${log.success ? 'success' : 'failed'}`}><i className={`fa-solid ${log.success ? 'fa-check' : 'fa-xmark'}`}></i></span>
                        <div><strong>{auditLabel(log.eventName)}</strong><span>{formatDate(log.createdAt)} · {log.ipAddress || 'Nội bộ'}</span></div>
                      </div>
                    ))}
                    {auditLogs.length === 0 && <p className="management-empty-line">Chưa có sự kiện bảo mật.</p>}
                  </div>
                </article>
              </div>
            </section>
          )}

          {activeView === 'users' && (
            <section className="management-view">
              <div className="management-section-heading">
                <div><span className="management-kicker">Identity directory</span><h2>Quản lý tài khoản</h2><p>Tạo hồ sơ, phân quyền và kiểm soát phiên đăng nhập theo tenant.</p></div>
                <button className="management-button primary" onClick={openCreate}><i className="fa-solid fa-user-plus"></i> Thêm tài khoản</button>
              </div>
              <div className="management-toolbar">
                <label className="management-search"><i className="fa-solid fa-magnifying-glass"></i><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tên, username, email, phòng ban..." /></label>
                <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="Lọc trạng thái">
                  <option value="all">Mọi trạng thái</option><option value="active">Đang hoạt động</option><option value="inactive">Đã khóa</option>
                </select>
                <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} aria-label="Lọc vai trò">
                  <option value="all">Mọi vai trò</option><option value="admin">Quản trị viên</option><option value="member">Thành viên</option>
                </select>
                <span className="management-result-count">{visibleUsers.length} kết quả</span>
              </div>
              <div className="management-table-wrap">
                <table className="management-table">
                  <thead><tr><th>Thành viên</th><th>Vai trò</th><th>Trạng thái</th><th>Lần đăng nhập cuối</th><th>Tinode UID</th><th aria-label="Thao tác"></th></tr></thead>
                  <tbody>
                    {visibleUsers.map(user => {
                      const self = user.id === session.user.id;
                      const busy = actionUserId === user.id;
                      return (
                        <tr key={user.id} className={!user.active ? 'inactive' : ''}>
                          <td><div className="management-user-cell"><span className="management-avatar">{initials(user.name)}</span><div><strong>{user.name}</strong><span>@{user.username}{user.email ? ` · ${user.email}` : ''}</span><small>{user.department || 'Chưa có phòng ban'}{user.title ? ` / ${user.title}` : ''}</small></div></div></td>
                          <td><span className={`management-role role-${String(user.role).toLowerCase()}`}><i className={`fa-solid ${isAdmin(user) ? 'fa-shield' : 'fa-user'}`}></i>{isAdmin(user) ? 'Admin' : 'Member'}</span></td>
                          <td><span className={`management-status ${user.active ? 'active' : 'inactive'}`}><i></i>{user.active ? 'Hoạt động' : 'Đã khóa'}</span></td>
                          <td><span className="management-date">{formatDate(user.lastLoginAt)}</span></td>
                          <td><code>{user.tinodeUid || '—'}</code></td>
                          <td>
                            <div className="management-row-actions">
                              <button type="button" onClick={() => openEdit(user)} title="Chỉnh sửa"><i className="fa-solid fa-pen"></i></button>
                              <button type="button" onClick={() => revokeSessions(user)} title="Ép đăng xuất" disabled={self || busy}><i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-right-from-bracket'}`}></i></button>
                              <button type="button" onClick={() => setResetUser(user)} title={health?.password_reset?.tinode_admin_configured ? 'Đặt lại mật khẩu' : 'Chưa cấu hình Tinode admin'} disabled={self || !health?.password_reset?.tinode_admin_configured}><i className="fa-solid fa-key"></i></button>
                              <button type="button" className={user.active ? 'warn' : 'good'} onClick={() => toggleUser(user)} title={user.active ? 'Khóa tài khoản' : 'Mở khóa'} disabled={self || busy}><i className={`fa-solid ${user.active ? 'fa-user-lock' : 'fa-lock-open'}`}></i></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {visibleUsers.length === 0 && <div className="management-empty-state"><i className="fa-solid fa-user-slash"></i><strong>Không tìm thấy tài khoản</strong><span>Thử thay đổi từ khóa hoặc bộ lọc.</span></div>}
              </div>
            </section>
          )}

          {activeView === 'audit' && (
            <section className="management-view">
              <div className="management-section-heading">
                <div><span className="management-kicker">Security ledger</span><h2>Nhật ký bảo mật</h2><p>Dòng thời gian đăng nhập, đăng xuất và các thay đổi quản trị.</p></div>
              </div>
              <div className="management-toolbar audit-toolbar">
                <label className="management-search"><i className="fa-solid fa-magnifying-glass"></i><input value={auditSearch} onChange={event => setAuditSearch(event.target.value)} placeholder="Tìm sự kiện, người dùng hoặc IP..." /></label>
                <span className="management-result-count">{visibleAuditLogs.length} sự kiện gần nhất</span>
              </div>
              <div className="management-audit-list">
                {visibleAuditLogs.map(log => {
                  const targetId = log.properties?.account_id || log.userId;
                  const actor = users.find(user => user.id === targetId);
                  return (
                    <article key={log.id}>
                      <span className={`management-event-icon large ${log.success ? 'success' : 'failed'}`}><i className={`fa-solid ${log.success ? 'fa-check' : 'fa-xmark'}`}></i></span>
                      <div className="management-audit-copy"><strong>{auditLabel(log.eventName)}</strong><span>{actor ? `${actor.name} (@${actor.username})` : targetId || log.properties?.identity || 'Hệ thống'}</span></div>
                      <code>{log.eventName}</code>
                      <span className="management-audit-ip">{log.ipAddress || 'Nội bộ'}</span>
                      <time>{formatDate(log.createdAt)}</time>
                    </article>
                  );
                })}
                {visibleAuditLogs.length === 0 && <div className="management-empty-state"><i className="fa-solid fa-shield"></i><strong>Chưa có sự kiện phù hợp</strong></div>}
              </div>
            </section>
          )}

          {activeView === 'system' && (
            <section className="management-view">
              <div className="management-section-heading"><div><span className="management-kicker">Service health</span><h2>Trạng thái hệ thống</h2><p>Kiểm tra các năng lực quản trị đang sẵn sàng trên backend.</p></div></div>
              <div className="management-system-grid">
                <article className="management-system-card ready"><span><i className="fa-solid fa-server"></i></span><div><small>Chat management API</small><h3>Đang hoạt động</h3><p>Đăng nhập, tenant và user directory sẵn sàng.</p></div><em>Operational</em></article>
                <article className={`management-system-card ${health?.password_reset?.tinode_admin_configured ? 'ready' : 'warning'}`}><span><i className="fa-solid fa-key"></i></span><div><small>Tinode administrator</small><h3>{health?.password_reset?.tinode_admin_configured ? 'Đã cấu hình' : 'Chưa cấu hình'}</h3><p>Dùng cho thao tác đặt lại mật khẩu từ trang quản trị.</p></div><em>{health?.password_reset?.tinode_admin_configured ? 'Ready' : 'Action needed'}</em></article>
                <article className={`management-system-card ${health?.password_reset?.delivery_configured ? 'ready' : 'warning'}`}><span><i className="fa-solid fa-envelope"></i></span><div><small>Password reset email</small><h3>{health?.password_reset?.delivery_configured ? 'Đã cấu hình' : 'Chưa cấu hình'}</h3><p>Kênh gửi liên kết quên mật khẩu cho người dùng.</p></div><em>{health?.password_reset?.delivery_configured ? 'Ready' : 'Action needed'}</em></article>
                <article className="management-system-card ready"><span><i className="fa-solid fa-cookie-bite"></i></span><div><small>Session security</small><h3>Cookie bảo mật</h3><p>Phiên được tenant-scope và có thể thu hồi bằng auth version.</p></div><em>Protected</em></article>
              </div>
            </section>
          )}
        </div>
      </main>

      {editorMode && <UserEditor mode={editorMode} form={userForm} setForm={setUserForm} onClose={() => setEditorMode(null)} onSubmit={saveUser} saving={saving} lockRole={editingUserId === session.user.id} />}
      {resetUser && <ResetPasswordDialog user={resetUser} onClose={() => setResetUser(null)} onSubmit={submitResetPassword} saving={saving} />}
    </div>
  );
}
