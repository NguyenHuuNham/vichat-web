import React, { useState } from 'react';
import { managementAuthClient } from '../../chat/services/chatManagementService';

function resetTokenFromUrl() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('reset_token') || '';
}

function Login({ onLoginSuccess, initialNotice = '' }) {
  const initialResetToken = resetTokenFromUrl();
  const [mode, setMode] = useState(initialResetToken ? 'reset' : 'login');
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(initialNotice);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const switchMode = nextMode => {
    setMode(nextMode);
    setError('');
    setNotice('');
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleLogin = async event => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!identity.trim() || !password) {
      setError('Vui lòng điền tên đăng nhập và mật khẩu.');
      return;
    }
    if (!managementAuthClient.enabled) {
      setError('Chưa cấu hình dịch vụ quản lý tài khoản Chatmgt.');
      return;
    }

    setIsLoading(true);
    try {
      const session = await managementAuthClient.login({ identity: identity.trim(), password });
      await onLoginSuccess({
        id: session.uid,
        uid: session.uid,
        username: session.login,
        name: session.profile?.name || session.login,
        email: session.email || identity.trim(),
        role: session.role,
        department: session.department,
        tenantId: session.tenantId,
        tenantName: session.tenantName,
        tenant: session.tenant,
        tinodeUid: session.tinodeUid,
        tinodeAuth: session.tinodeAuth,
        title: session.profile?.title || '',
        tinodeSession: session,
        connection: session.connection,
        avatar: session.profile?.avatar || '',
        mustChangePassword: session.mustChangePassword,
      });
    } catch (loginError) {
      setError(loginError?.message || 'Đăng nhập thất bại. Vui lòng kiểm tra tài khoản và thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async event => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!identity.trim()) {
      setError('Vui lòng nhập tên đăng nhập hoặc email.');
      return;
    }
    setIsLoading(true);
    try {
      await managementAuthClient.requestPasswordReset(identity.trim());
      setNotice('Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi tới email đã đăng ký.');
    } catch (resetError) {
      setError(resetError?.message || 'Chưa thể gửi yêu cầu đặt lại mật khẩu.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async event => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!resetToken) {
      setError('Liên kết đặt lại mật khẩu không hợp lệ.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setIsLoading(true);
    try {
      await managementAuthClient.resetPassword(resetToken, newPassword);
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', window.location.pathname);
      }
      setResetToken('');
      setNotice('Mật khẩu đã được cập nhật. Bạn có thể đăng nhập bằng mật khẩu mới.');
      setMode('login');
      setNewPassword('');
      setConfirmPassword('');
    } catch (resetError) {
      setError(resetError?.message || 'Không thể đặt lại mật khẩu.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-screen-container">
      <div className="login-bg-decor decor-1"></div>
      <div className="login-bg-decor decor-2"></div>
      <div className="login-card">
        <div className="login-card-header">
          <div className="login-logo"><img src="/chat-logo.svg" className="brand-mark-image" alt="CHAT" /></div>
          <h2>{mode === 'login' ? 'Chat - Power by Gon Platform' : mode === 'forgot' ? 'Khôi phục tài khoản' : 'Tạo mật khẩu mới'}</h2>
          <p>{mode === 'login'
            ? 'Đăng nhập bằng tài khoản nội bộ do quản trị viên cấp'
            : mode === 'forgot'
              ? 'Nhập tài khoản để nhận liên kết đặt lại mật khẩu'
              : 'Liên kết chỉ sử dụng một lần và sẽ hết hạn sau thời gian ngắn'}</p>
        </div>

        {error && <div className="login-error-message"><i className="fa-solid fa-triangle-exclamation"></i><span>{error}</span></div>}
        {notice && <div className="login-success-message"><i className="fa-solid fa-circle-check"></i><span>{notice}</span></div>}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="login-form" autoComplete="on">
            <div className="login-form-group">
              <label htmlFor="identity">Tên đăng nhập / Email</label>
              <div className="login-input-wrapper">
                <i className="fa-regular fa-user login-input-icon"></i>
                <input id="identity" name="username" type="text" autoComplete="username" placeholder="Nhập tên đăng nhập hoặc email..." value={identity} onChange={event => setIdentity(event.target.value)} disabled={isLoading} autoFocus />
              </div>
            </div>
            <div className="login-form-group">
              <label htmlFor="password">Mật khẩu</label>
              <div className="login-input-wrapper">
                <i className="fa-solid fa-lock login-input-icon"></i>
                <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Nhập mật khẩu..." value={password} onChange={event => setPassword(event.target.value)} disabled={isLoading} />
                <button type="button" className="btn-toggle-password" onClick={() => setShowPassword(value => !value)} disabled={isLoading} title={showPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}>
                  <i className={`fa-regular ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
            </div>
            <button type="button" className="login-inline-action" onClick={() => switchMode('forgot')} disabled={isLoading}>Quên mật khẩu?</button>
            <button type="submit" className="btn-login-submit" disabled={isLoading}>
              {isLoading ? <><div className="login-spinner"></div><span>Đang đăng nhập...</span></> : <span>Đăng nhập</span>}
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="login-form">
            <div className="login-form-group">
              <label htmlFor="forgot-identity">Tên đăng nhập / Email</label>
              <div className="login-input-wrapper">
                <i className="fa-regular fa-user login-input-icon"></i>
                <input id="forgot-identity" type="text" autoComplete="username" placeholder="Nhập tài khoản cần khôi phục..." value={identity} onChange={event => setIdentity(event.target.value)} disabled={isLoading} autoFocus />
              </div>
            </div>
            <button type="submit" className="btn-login-submit" disabled={isLoading}>
              {isLoading ? <><div className="login-spinner"></div><span>Đang gửi...</span></> : <span>Gửi hướng dẫn</span>}
            </button>
            <button type="button" className="login-back-button" onClick={() => switchMode('login')} disabled={isLoading}><i className="fa-solid fa-arrow-left"></i> Quay lại đăng nhập</button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleResetPassword} className="login-form">
            <div className="login-form-group">
              <label htmlFor="new-password">Mật khẩu mới</label>
              <div className="login-input-wrapper">
                <i className="fa-solid fa-key login-input-icon"></i>
                <input id="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Ít nhất 8 ký tự..." value={newPassword} onChange={event => setNewPassword(event.target.value)} disabled={isLoading} autoFocus />
              </div>
            </div>
            <div className="login-form-group">
              <label htmlFor="confirm-password">Xác nhận mật khẩu</label>
              <div className="login-input-wrapper">
                <i className="fa-solid fa-shield-halved login-input-icon"></i>
                <input id="confirm-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Nhập lại mật khẩu mới..." value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} disabled={isLoading} />
                <button type="button" className="btn-toggle-password" onClick={() => setShowPassword(value => !value)} disabled={isLoading} title={showPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}>
                  <i className={`fa-regular ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
            </div>
            <button type="submit" className="btn-login-submit" disabled={isLoading}>
              {isLoading ? <><div className="login-spinner"></div><span>Đang cập nhật...</span></> : <span>Đặt lại mật khẩu</span>}
            </button>
            <button type="button" className="login-back-button" onClick={() => switchMode('login')} disabled={isLoading}><i className="fa-solid fa-arrow-left"></i> Quay lại đăng nhập</button>
          </form>
        )}

        <p className="login-security-note">Tài khoản nội bộ do quản trị viên cấp. Không hỗ trợ tự đăng ký công khai.</p>
      </div>
    </div>
  );
}

export default Login;
