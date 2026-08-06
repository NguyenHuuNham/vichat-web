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
    ACCOUNT_CREATED: 'Tạo tài khoản nhân viên',
    ACCOUNT_UPDATED: 'Cập nhật tài khoản nhân viên',
    ACCOUNT_PASSWORD_RESET_BY_ADMIN: 'Đặt lại mật khẩu nhân viên',
    ACCOUNT_LOCAL_ACCESS_PROVISIONED: 'Cấp quyền đăng nhập ChatUI',
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

function ManagementConversationAvatar({ conversation, viewerId }) {
  const members = conversation?.members || [];
  const viewer = members.find(member => String(member.id) === String(viewerId));
  const peer = !conversation?.isGroup && viewer
    ? members.find(member => String(member.id) !== String(viewerId))
    : null;

  if (peer) return <ManagementAvatar user={peer} />;
  if (members.length === 1) return <ManagementAvatar user={members[0]} />;
  if (members.length > 1) {
    return (
      <span className="management-avatar-cluster" aria-label={`Avatar thành viên ${conversation.subject}`}>
        {members.slice(0, 4).map(member => <ManagementAvatar key={member.id} user={member} size="mini" />)}
      </span>
    );
  }
  return <ManagementAvatar name={conversation?.subject} icon={`fa-solid ${conversation?.isGroup ? 'fa-users' : 'fa-user'}`} />;
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

function UserEditorDialog({ mode, user, busy, error, onClose, onSubmit }) {
  const creating = mode === 'create';
  const [form, setForm] = useState({
    username: user?.username || '',
    password: '',
    name: user?.name || '',
    email: user?.email || '',
    role: isAdmin(user) ? 'admin' : 'member',
    department: user?.department || '',
    title: user?.title || '',
    avatar: user?.avatar || '',
    active: user?.active ?? true,
  });

  const change = event => {
    const { name, type, checked, value } = event.target;
    setForm(previous => ({ ...previous, [name]: type === 'checkbox' ? checked : value }));
  };

  return (
    <div className="management-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form className="management-modal" onSubmit={event => { event.preventDefault(); onSubmit(form); }}>
        <header className="management-modal-header"><div><span className="management-eyebrow">{creating ? 'Tài khoản mới' : 'Hồ sơ nhân viên'}</span><h2>{creating ? 'Thêm nhân viên' : `Cập nhật ${user.name}`}</h2></div><button type="button" className="management-icon-button" onClick={onClose} disabled={busy} aria-label="Đóng"><i className="fa-solid fa-xmark"></i></button></header>
        {error && <div className="management-inline-error" role="alert"><i className="fa-solid fa-circle-exclamation"></i>{error}</div>}
        <div className="management-form-grid">
          <label className="management-field"><span>Tên đăng nhập</span><input name="username" value={form.username} onChange={change} disabled={!creating || busy} required autoComplete="off" /><small>Có thể dùng cùng username ở công ty khác; tenant được backend cách ly.</small></label>
          {creating && <label className="management-field"><span>Mật khẩu ban đầu</span><input name="password" type="password" value={form.password} onChange={change} disabled={busy} required minLength="8" autoComplete="new-password" /><small>Tối thiểu 8 ký tự; nên dùng cụm mật khẩu dài và riêng cho ChatUI.</small></label>}
          <label className="management-field"><span>Họ tên</span><input name="name" value={form.name} onChange={change} disabled={busy} required /></label>
          <label className="management-field"><span>Email</span><input name="email" type="email" value={form.email} onChange={change} disabled={busy} /></label>
          <label className="management-field"><span>Vai trò</span><select name="role" value={form.role} onChange={change} disabled={busy}><option value="member">Nhân viên</option><option value="admin">Quản trị nội bộ</option></select></label>
          <label className="management-field"><span>Trạng thái</span><select name="active" value={form.active ? 'true' : 'false'} onChange={event => setForm(previous => ({ ...previous, active: event.target.value === 'true' }))} disabled={creating || busy}><option value="true">Đang hoạt động</option><option value="false">Ngừng hoạt động</option></select></label>
          <label className="management-field"><span>Phòng ban</span><input name="department" value={form.department} onChange={change} disabled={busy} /></label>
          <label className="management-field"><span>Chức danh</span><input name="title" value={form.title} onChange={change} disabled={busy} /></label>
          <label className="management-field wide"><span>URL ảnh đại diện</span><input name="avatar" type="url" value={form.avatar} onChange={change} disabled={busy} placeholder="https://..." /><small>ChatUI đọc ảnh từ hồ sơ Chatmgt của đúng tenant.</small></label>
        </div>
        <footer className="management-modal-footer"><button type="button" className="management-button ghost" onClick={onClose} disabled={busy}>Hủy</button><button type="submit" className="management-button primary" disabled={busy}>{busy && <i className="fa-solid fa-spinner fa-spin"></i>} {creating ? 'Tạo nhân viên' : 'Lưu thay đổi'}</button></footer>
      </form>
    </div>
  );
}

function PasswordDialog({ user, busy, error, onClose, onSubmit }) {
  const [password, setPassword] = useState('');
  return (
    <div className="management-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form className="management-modal compact" onSubmit={event => { event.preventDefault(); onSubmit(password); }}>
        <header className="management-modal-header"><div><span className="management-eyebrow">Quyền truy cập ChatUI</span><h2>{user.accountManaged ? 'Cấp mật khẩu ChatUI' : 'Đặt lại mật khẩu'}</h2></div><button type="button" className="management-icon-button" onClick={onClose} disabled={busy} aria-label="Đóng"><i className="fa-solid fa-xmark"></i></button></header>
        <p className="management-modal-copy">{user.accountManaged ? `Tài khoản ${user.name} sẽ chuyển từ projection Account sang nhân viên do Chatmgt quản lý, đồng thời giữ nguyên định danh và lịch sử Tinode hiện có.` : `Mật khẩu hiện tại của ${user.name} sẽ bị thu hồi. Người dùng phải đăng nhập lại bằng mật khẩu mới.`}</p>
        {error && <div className="management-inline-error" role="alert"><i className="fa-solid fa-circle-exclamation"></i>{error}</div>}
        <label className="management-field"><span>Mật khẩu mới</span><input type="password" value={password} onChange={event => setPassword(event.target.value)} disabled={busy} required minLength="8" autoComplete="new-password" /><small>Tối thiểu 8 ký tự; nên dùng cụm mật khẩu dài và riêng cho ChatUI.</small></label>
        <footer className="management-modal-footer"><button type="button" className="management-button ghost" onClick={onClose} disabled={busy}>Hủy</button><button type="submit" className="management-button primary" disabled={busy}>{busy && <i className="fa-solid fa-spinner fa-spin"></i>} Xác nhận</button></footer>
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
  const [userEditor, setUserEditor] = useState(null);
  const [passwordUser, setPasswordUser] = useState(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState('');

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
    setConversations([]);
    setAuditLogs([]);
    setAuthState('anonymous');
  };

  const revokeSessions = async user => {
    if (!window.confirm(`Thu hồi toàn bộ phiên Chatmgt hiện tại của ${user.name}? Người dùng sẽ phải đăng nhập lại.`)) return;
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

  const setUserActive = async user => {
    if (user.accountManaged || String(user.id) === String(currentAdmin.id)) return;
    const active = !user.active;
    const action = active ? 'mở khóa' : 'khóa';
    const detail = active ? '' : ' Người dùng sẽ phải đăng nhập lại.';
    if (!window.confirm(`Bạn có chắc muốn ${action} tài khoản ${user.name}?${detail}`)) return;
    setActionUserId(user.id);
    try {
      const saved = await managementAdminService.setUserActive(user.id, active);
      setUsers(previous => previous.map(item => item.id === saved.id ? saved : item));
      setNotice({ type: 'success', text: `${active ? 'Đã mở khóa' : 'Đã khóa'} tài khoản ${user.name}.` });
      setAuditLogs(await managementAdminService.listAuditLogs());
    } catch (error) {
      setNotice({ type: 'error', text: error.message || `Không thể ${action} tài khoản.` });
    } finally {
      setActionUserId('');
    }
  };

  const saveUser = async form => {
    setModalBusy(true);
    setModalError('');
    try {
      const saved = userEditor.mode === 'create'
        ? await managementAdminService.createUser(form)
        : await managementAdminService.updateUser(userEditor.user.id, form);
      setUsers(previous => userEditor.mode === 'create'
        ? [...previous, saved]
        : previous.map(item => item.id === saved.id ? saved : item));
      setNotice({ type: 'success', text: userEditor.mode === 'create' ? `Đã tạo tài khoản cho ${saved.name}.` : `Đã cập nhật ${saved.name}.` });
      setUserEditor(null);
      setAuditLogs(await managementAdminService.listAuditLogs());
    } catch (error) {
      setModalError(error.message || 'Không lưu được tài khoản nhân viên.');
    } finally {
      setModalBusy(false);
    }
  };

  const resetUserPassword = async newPassword => {
    setModalBusy(true);
    setModalError('');
    try {
      const result = await managementAdminService.resetPassword(passwordUser.id, newPassword);
      if (result.user) setUsers(previous => previous.map(item => item.id === result.user.id ? result.user : item));
      setNotice({ type: 'success', text: `Đã cấp mật khẩu mới cho ${passwordUser.name}.` });
      setPasswordUser(null);
      setAuditLogs(await managementAdminService.listAuditLogs());
    } catch (error) {
      setModalError(error.message || 'Không đặt lại được mật khẩu.');
    } finally {
      setModalBusy(false);
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
    { id: 'directory', label: 'Nhân viên', icon: 'fa-solid fa-address-book', count: stats.employees },
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
            <a className="management-chat-link" href="https://chat.upgo.vn/" target="_blank" rel="noreferrer">Mở ChatUI <i className="fa-solid fa-arrow-up-right-from-square"></i></a>
          </div>
        </header>

        {notice && <div className={`management-toast ${notice.type}`} role="status"><i className={`fa-solid ${notice.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>{notice.text}</div>}

        <div className="management-content">
          {activeView === 'overview' && (
            <section className="management-view management-overview">
              <div className="management-flow-boundary">
                <span><i className="fa-solid fa-building-shield"></i><strong>Admin doanh nghiệp</strong><small>Account SSO chỉ mở cổng quản trị tenant</small></span>
                <i className="fa-solid fa-arrow-right-long"></i>
                <span className="active"><i className="fa-solid fa-diagram-project"></i><strong>Chatmgt</strong><small>Tài khoản nhân viên, tenant, metadata, session</small></span>
                <i className="fa-solid fa-arrow-right-long"></i>
                <span><i className="fa-solid fa-bolt"></i><strong>Tinode</strong><small>Tin nhắn, file và realtime</small></span>
              </div>
              <div className="management-hero-card">
                <div className="management-hero-copy"><span className="management-kicker">Tổng quan vận hành</span><h2>Chatmgt đang giữ đúng ranh giới quản trị.</h2><p>Admin tenant cấp tài khoản ChatUI cho nhân viên của chính doanh nghiệp mình. Trang quản trị không tải nội dung tin nhắn hoặc file từ Tinode.</p><div className="management-hero-context"><span><i className="fa-solid fa-shield-halved"></i>Tenant-scoped</span><span><i className="fa-solid fa-arrows-rotate"></i>Tự đồng bộ 30 giây</span><span className={health?.account_sso?.tinode_bridge_configured ? 'ready' : 'pending'}><i className="fa-solid fa-bolt"></i>{health?.account_sso?.tinode_bridge_configured ? 'Tinode sẵn sàng' : 'Đang kiểm tra Tinode'}</span></div></div>
                <div className="management-hero-orbit" aria-hidden="true"><span>{stats.activeEmployees}</span><small>nhân viên active</small></div>
              </div>
              <div className="management-metrics-grid">
                <MetricCard icon="fa-solid fa-address-book" value={stats.employees} label="Tài khoản trong tenant" detail={`${stats.activeEmployees} đang hoạt động`} />
                <MetricCard icon="fa-solid fa-comments" value={stats.conversations} label="Conversation metadata" detail={`${stats.groups} cuộc trò chuyện nhóm`} tone="ink" />
                <MetricCard icon="fa-solid fa-link" value={stats.provisioned} label="Đã có Tinode UID" detail="Sẵn sàng nâng lên realtime" tone="green" />
                <MetricCard icon="fa-solid fa-user-group" value={stats.pendingFriendRequests} label="Lời mời đang chờ" detail="Dữ liệu quan hệ do Chatmgt giữ" tone="orange" />
              </div>
              <div className="management-overview-grid">
                <article className="management-panel">
                  <header><div><span className="management-eyebrow">Metadata gần đây</span><h3>Conversation được cập nhật</h3></div><button onClick={() => setActiveView('conversations')}>Xem tất cả</button></header>
                  <div className="management-people-list">
                    {conversations.slice(0, 5).map(conversation => (
                      <div key={conversation.id}><ManagementConversationAvatar conversation={conversation} viewerId={currentAdmin.id} /><div><strong>{conversation.subject}</strong><span>{conversation.isGroup ? 'Nhóm' : 'Trực tiếp'} · {conversation.participantCount} thành viên · {conversation.realtime.ready ? 'Realtime sẵn sàng' : 'Chờ Tinode'}</span></div><time>{formatDate(conversation.updatedAt)}</time></div>
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
                <div><span className="management-kicker">Nguồn chuẩn: Chatmgt theo tenant</span><h2>Tài khoản nhân viên doanh nghiệp</h2><p>Tạo, cập nhật, khóa và cấp lại mật khẩu ChatUI tại đây. Backend luôn lấy tenant từ phiên quản trị, không nhận tenant tùy ý từ form.</p></div>
                <button className="management-button primary" type="button" onClick={() => { setModalError(''); setUserEditor({ mode: 'create', user: null }); }}><i className="fa-solid fa-user-plus"></i> Thêm nhân viên</button>
              </div>
              <div className="management-source-note"><i className="fa-solid fa-circle-info"></i><span>Projection Account cũ có thể được cấp mật khẩu ChatUI để chuyển sang Chatmgt mà vẫn giữ ID và Tinode UID hiện tại.</span></div>
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
                          <td><span className={`management-status ${user.accountManaged ? 'inactive' : 'active'}`}><i></i>{user.accountManaged ? 'Projection Account' : 'Chatmgt local'}</span></td>
                          <td><span className={`management-status ${user.tinodeUid ? 'active' : 'inactive'}`}><i></i>{user.tinodeUid ? 'Đã provision' : 'Chưa provision'}</span></td>
                          <td><div className="management-row-actions"><button type="button" onClick={() => { setModalError(''); setUserEditor({ mode: 'edit', user }); }} title="Sửa hồ sơ" disabled={busy || user.accountManaged}><i className="fa-solid fa-pen"></i></button><button type="button" className="good" onClick={() => { setModalError(''); setPasswordUser(user); }} title={user.accountManaged ? 'Cấp mật khẩu ChatUI' : 'Đặt lại mật khẩu'} disabled={busy || String(user.id) === String(currentAdmin.id)}><i className="fa-solid fa-key"></i></button><button type="button" className="lock" onClick={() => setUserActive(user)} title={user.accountManaged ? 'Tài khoản do UpGO Account quản lý' : (user.active ? 'Khóa tài khoản' : 'Mở khóa tài khoản')} disabled={busy || user.accountManaged || String(user.id) === String(currentAdmin.id)}><i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : (user.active ? 'fa-lock' : 'fa-lock-open')}`}></i></button><button type="button" className="warn" onClick={() => revokeSessions(user)} title="Thu hồi phiên Chatmgt" disabled={busy || !user.active || String(user.id) === String(currentAdmin.id)}><i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-right-from-bracket'}`}></i></button></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {visibleUsers.length === 0 && <div className="management-empty-state"><i className="fa-solid fa-address-book"></i><strong>Chưa có nhân viên phù hợp</strong><span>Thêm tài khoản đầu tiên cho tenant hiện tại để nhân viên đăng nhập ChatUI.</span></div>}
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
                      const owner = conversation.members.find(member => String(member.id) === String(conversation.ownerId));
                      return (
                        <tr key={conversation.id}>
                          <td><div className="management-user-cell"><ManagementConversationAvatar conversation={conversation} viewerId={currentAdmin.id} /><div><strong>{conversation.subject}</strong><span>{conversation.isGroup ? 'Nhóm dùng topic chung' : 'Direct dùng topic theo người xem'}</span><small>{conversation.id}</small></div></div></td>
                          <td><div className="management-member-cell"><div className="management-member-preview">{conversation.members.slice(0, 3).map(member => <ManagementAvatar key={member.id} user={member} size="mini" />)}{conversation.members.length > 3 && <span className="management-member-more">+{conversation.members.length - 3}</span>}</div><div className="management-member-stack"><strong>{conversation.participantCount} thành viên</strong><span>{conversation.members.map(member => member.name).join(', ') || 'Chưa có projection hợp lệ'}</span></div></div></td>
                          <td>{owner ? <div className="management-owner-cell"><ManagementAvatar user={owner} size="mini" /><span className="management-date">{owner.name}</span></div> : <span className="management-date">Chưa xác định</span>}</td>
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
                  const actor = users.find(user => String(user.id) === String(targetId));
                  return <article key={log.id}><span className={`management-event-icon large ${log.success ? 'success' : 'failed'}`}><i className={`fa-solid ${log.success ? 'fa-check' : 'fa-xmark'}`}></i></span><div className="management-audit-copy"><div className="management-audit-actor">{actor && <ManagementAvatar user={actor} size="mini" />}<div><strong>{auditLabel(log.eventName)}</strong><span>{actor ? `${actor.name} (@${actor.username})` : targetId || log.properties?.identity || 'Hệ thống'}</span></div></div></div><code>{log.eventName}</code><span className="management-audit-ip">{log.ipAddress || 'Nội bộ'}</span><time>{formatDate(log.createdAt)}</time></article>;
                })}
                {visibleAuditLogs.length === 0 && <div className="management-empty-state"><i className="fa-solid fa-shield"></i><strong>Chưa có sự kiện phù hợp</strong></div>}
              </div>
            </section>
          )}

          {activeView === 'system' && (
            <section className="management-view">
              <div className="management-section-heading"><div><span className="management-kicker">Luồng triển khai bốn bước</span><h2>Trạng thái Admin SSO → Chatmgt → Tinode</h2><p>Các thẻ phản ánh đúng cấu hình backend; không dùng trạng thái giả từ trình duyệt.</p></div><a className="management-button ghost" href={ACCOUNT_ADMIN_URL} target="_blank" rel="noreferrer"><i className="fa-solid fa-building-shield"></i> Quản lý admin tại Account</a></div>
              <div className="management-system-grid">
                <SystemCard icon="fa-solid fa-server" label="Chatmgt API" ready={health?.status === 'ok'} title={health?.status === 'ok' ? 'Đang hoạt động' : 'Không xác định'} description="Phiên quản trị, projection, metadata conversation và audit log thuộc dịch vụ này." />
                <SystemCard icon="fa-solid fa-id-card" label="UpGO Account Admin SSO" ready={Boolean(health?.account_sso?.admin_configured)} title={health?.account_sso?.admin_configured ? 'Đã kết nối' : 'Chưa hoàn chỉnh'} description="Account chỉ xác thực admin/owner/superadmin để mở control plane của tenant hiện tại." />
                <SystemCard icon="fa-solid fa-address-book" label="Tài khoản nhân viên" ready={health?.employee_auth?.login_endpoint === '/api/v1/auth/login'} title={health?.employee_auth?.login_endpoint === '/api/v1/auth/login' ? 'Chatmgt local' : 'Đang dùng SSO'} description="Nhân viên đăng nhập bằng username/password do admin tenant cấp; directory lấy từ Chatmgt." />
                <SystemCard icon="fa-solid fa-bolt" label="Cầu nối Tinode" ready={Boolean(health?.account_sso?.tinode_bridge_configured)} title={health?.account_sso?.tinode_bridge_configured ? 'Sẵn sàng realtime' : 'Chưa sẵn sàng'} description="Chatmgt provision UID và cấp token ngắn hạn; Tinode tiếp tục giữ tin nhắn và trạng thái realtime." />
                <SystemCard icon="fa-solid fa-cookie-bite" label="Phiên quản trị riêng" ready={Boolean(health?.management_session?.isolated && health?.management_session?.cookie_secure)} title={health?.management_session?.isolated ? 'Đã cách ly' : 'Cần kiểm tra'} description="Admin Chatmgt dùng cookie riêng, không nhận Tinode token và không đăng nhập thay nhân viên." readyText="Được bảo vệ" warningText="Cần kiểm tra" />
                <SystemCard icon="fa-solid fa-eye-slash" label="Ranh giới dữ liệu" ready title="Không đọc nội dung chat" description="Trang quản trị chỉ đọc metadata conversation; message, file, presence, typing và receipt ở Tinode/ChatAPI." readyText="Đúng kiến trúc" />
              </div>
            </section>
          )}
        </div>
      </main>

      {userEditor && <UserEditorDialog mode={userEditor.mode} user={userEditor.user} busy={modalBusy} error={modalError} onClose={() => { if (!modalBusy) setUserEditor(null); }} onSubmit={saveUser} />}
      {passwordUser && <PasswordDialog user={passwordUser} busy={modalBusy} error={modalError} onClose={() => { if (!modalBusy) setPasswordUser(null); }} onSubmit={resetUserPassword} />}

    </div>
  );
}
