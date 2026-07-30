import React, { useCallback, useEffect, useRef, useState } from 'react';
import { managementAuthClient } from '../../chat/services/chatManagementService';

const ACCOUNT_RETURN_PARAM = 'account_sso';

function isAccountReturn() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get(ACCOUNT_RETURN_PARAM) === '1';
}

function clearAccountReturnMarker() {
  if (typeof window === 'undefined') return;
  const returnUrl = new URL(window.location.href);
  returnUrl.searchParams.delete(ACCOUNT_RETURN_PARAM);
  window.history.replaceState({}, '', `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`);
}

function Login({ onLoginSuccess, initialNotice = '' }) {
  const [error, setError] = useState('');
  const [notice] = useState(initialNotice);
  const [isLoading, setIsLoading] = useState(false);
  const accountReturnHandled = useRef(false);

  const finishLogin = useCallback(async ({ redirectWhenRequired }) => {
    setError('');
    if (!managementAuthClient.enabled) {
      setError('Chưa cấu hình dịch vụ xác thực Chatmgt.');
      return;
    }

    setIsLoading(true);
    try {
      const session = await managementAuthClient.login();
      await onLoginSuccess({
        id: session.uid,
        uid: session.uid,
        username: session.login,
        name: session.profile?.name || session.login,
        email: session.email || '',
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
        mustChangePassword: false,
      });
    } catch (loginError) {
      if (loginError?.code === 'ACCOUNT_LOGIN_REQUIRED' && redirectWhenRequired) {
        window.location.assign(managementAuthClient.accountLoginUrl());
        return;
      }
      if (loginError?.code === 'ACCOUNT_LOGIN_REQUIRED') {
        setError('Account chưa trả về phiên đăng nhập hợp lệ. Vui lòng đăng nhập lại tại account.upgo.vn.');
      } else if (loginError?.code === 'ACCOUNT_TENANT_INVALID') {
        setError('Tài khoản chưa có đơn vị đang hoạt động hoặc chưa chọn đơn vị trên UpGO Account.');
      } else {
        setError(loginError?.message || 'Không thể xác thực với UpGO Account. Vui lòng thử lại.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [onLoginSuccess]);

  useEffect(() => {
    if (!isAccountReturn() || accountReturnHandled.current) return;
    accountReturnHandled.current = true;
    clearAccountReturnMarker();
    finishLogin({ redirectWhenRequired: false });
  }, [finishLogin]);

  const handleLogin = event => {
    event.preventDefault();
    finishLogin({ redirectWhenRequired: true });
  };

  return (
    <div className="login-screen-container">
      <div className="login-bg-decor decor-1"></div>
      <div className="login-bg-decor decor-2"></div>
      <div className="login-card">
        <div className="login-card-header">
          <div className="login-logo"><img src="/chat-logo.svg" className="brand-mark-image" alt="CHAT" /></div>
          <h2>Chat - Power by Gon Platform</h2>
          <p>Chat sử dụng tài khoản và đơn vị đang hoạt động trên UpGO Account.</p>
        </div>

        {error && <div className="login-error-message"><i className="fa-solid fa-triangle-exclamation"></i><span>{error}</span></div>}
        {notice && <div className="login-success-message"><i className="fa-solid fa-circle-check"></i><span>{notice}</span></div>}

        <form onSubmit={handleLogin} className="login-form">
          <button type="submit" className="btn-login-submit" disabled={isLoading}>
            {isLoading
              ? <><div className="login-spinner"></div><span>Đang xác thực...</span></>
              : <><i className="fa-solid fa-arrow-right-to-bracket"></i><span>Đăng nhập bằng UpGO Account</span></>}
          </button>
        </form>

        <p className="login-security-note">Chatmgt không nhận hoặc lưu mật khẩu UpGO Account.</p>
      </div>
    </div>
  );
}

export default Login;
