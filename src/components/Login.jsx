import React, { useState } from 'react';

// ==========================================================================
// COMPONENT ĐĂNG NHẬP (LOGIN SCREEN)
// ==========================================================================
function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Vui lòng điền đầy đủ tên đăng nhập và mật khẩu.");
      return;
    }

    setIsLoading(true);

    // Giả lập xử lý gọi API đăng nhập trong 1.2 giây
    setTimeout(() => {
      setIsLoading(false);
      const isDemo = email.toLowerCase() === 'admin@vichat.vn';
      const displayName = isDemo ? "Mai Thành Lâm" : email.split('@')[0];
      
      onLoginSuccess({
        name: displayName,
        email: email,
        avatar: isDemo 
          ? "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&h=100&q=80"
          : `https://api.dicebear.com/7.x/adventurer/svg?seed=${displayName}`
      });
    }, 1200);
  };

  const selectDemoAccount = () => {
    setEmail("admin@vichat.vn");
    setPassword("123456");
    setError("");
  };

  return (
    <div className="login-screen-container">
      <div className="login-bg-decor decor-1"></div>
      <div className="login-bg-decor decor-2"></div>

      <div className="login-card">
        <div className="login-card-header">
          <div className="login-logo">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5-10-5-10 5z" />
            </svg>
          </div>
          <h2>Chào mừng quay lại</h2>
          <p>Đăng nhập vào tài khoản VICHAT Enterprise của bạn</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="login-error-message">
              <i className="fa-solid fa-triangle-exclamation"></i>
              <span>{error}</span>
            </div>
          )}

          <div className="login-form-group">
            <label htmlFor="email">Tên đăng nhập / Email</label>
            <div className="login-input-wrapper">
              <i className="fa-regular fa-envelope login-input-icon"></i>
              <input
                id="email"
                type="text"
                placeholder="Nhập email của bạn..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                type={showPassword ? "text" : "password"}
                placeholder="Nhập mật khẩu..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="button"
                className="btn-toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                title={showPassword ? "Ẩn mật khẩu" : "Hiển thị mật khẩu"}
              >
                <i className={`fa-regular ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
          </div>

          <button type="submit" className="btn-login-submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <div className="login-spinner"></div>
                <span>Đang đăng nhập...</span>
              </>
            ) : (
              <span>Đăng nhập</span>
            )}
          </button>
        </form>

        <div className="login-demo-accounts">
          <span className="login-demo-title">Tài khoản mẫu dùng nhanh</span>
          <div className="demo-account-pill" onClick={selectDemoAccount}>
            <div>
              <span style={{ display: 'block', color: 'var(--text-main)', textAlign: 'left' }}>Mai Thành Lâm</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>admin@vichat.vn</span>
            </div>
            <code>Mật khẩu: 123456</code>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
