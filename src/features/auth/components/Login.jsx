import React, { useState } from 'react';
import { managementAuthClient } from '../../chat/services/chatManagementService';

function Login({ onLoginSuccess }) {
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async event => {
    event.preventDefault();
    setError('');
    if (!identity.trim() || !password) {
      setError('Vui lòng điền tên đăng nhập và mật khẩu.');
      return;
    }
    if (!managementAuthClient.enabled) {
      setError('Chưa cấu hình dịch vụ quản lý tài khoản nội bộ.');
      return;
    }

    setIsLoading(true);
    try {
      const session = await managementAuthClient.login({ username: identity.trim(), password });
      onLoginSuccess({
        id: session.uid,
        uid: session.uid,
        username: session.login,
        name: session.profile?.name || session.login,
        email: session.email || identity.trim(),
        role: session.role,
        department: session.department,
        tenantId: session.tenantId,
        tinodeUid: session.tinodeUid,
        tinodeAuth: session.tinodeAuth,
        title: session.profile?.title || '',
        tinodeSession: session,
        connection: session.connection,
        avatar: session.profile?.avatar || '',
      });
    } catch (err) {
      setError(err?.message || 'Đăng nhập thất bại. Vui lòng kiểm tra tài khoản và thử lại.');
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
          <div className="login-logo"><span className="brand-mark" aria-hidden="true">SH</span></div>
          <h2>Chào mừng đến SÔNG HỒNG</h2>
          <p>Đăng nhập vào tài khoản SÔNG HỒNG Enterprise của bạn</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form" autoComplete="on">
          {error && (
            <div className="login-error-message">
              <i className="fa-solid fa-triangle-exclamation"></i><span>{error}</span>
            </div>
          )}
          <div className="login-form-group">
            <label htmlFor="identity">Tên đăng nhập / Email</label>
            <div className="login-input-wrapper">
              <i className="fa-regular fa-envelope login-input-icon"></i>
              <input
                id="identity"
                name="username"
                type="text"
                autoComplete="username"
                placeholder="Nhập tên đăng nhập hoặc email..."
                value={identity}
                onChange={event => setIdentity(event.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>
          <div className="login-form-group">
            <label htmlFor="password">Mật khẩu</label>
            <div className="login-input-wrapper">
              <i className="fa-solid fa-lock login-input-icon"></i>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Nhập mật khẩu..."
                value={password}
                onChange={event => setPassword(event.target.value)}
                disabled={isLoading}
              />
              <button
                type="button"
                className="btn-toggle-password"
                onClick={() => setShowPassword(value => !value)}
                disabled={isLoading}
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
              >
                <i className={`fa-regular ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
          </div>
          <button type="submit" className="btn-login-submit" disabled={isLoading}>
            {isLoading ? <><div className="login-spinner"></div><span>Đang đăng nhập...</span></> : <span>Đăng nhập</span>}
          </button>
        </form>
        <p className="login-security-note">Tài khoản nội bộ do quản trị viên cấp. Không hỗ trợ tự đăng ký công khai.</p>
      </div>
    </div>
  );
}

export default Login;
