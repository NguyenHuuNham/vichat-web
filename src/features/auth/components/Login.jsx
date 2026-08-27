import React, { useCallback, useEffect, useRef, useState } from 'react';
import { managementAuthClient } from '../../chat/services/chatManagementService';
import ChatLogo from '../../../components/ChatLogo';

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

function Login({ copy = { t: value => value }, onLoginSuccess, initialNotice = '' }) {
  const credentialMode = ['password', 'account_password'].includes(managementAuthClient.mode);
  const passwordMode = managementAuthClient.mode === 'password';
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice] = useState(initialNotice);
  const [isLoading, setIsLoading] = useState(false);
  const accountReturnHandled = useRef(false);

  const finishLogin = useCallback(async ({ redirectWhenRequired, credentials }) => {
    setError('');
    if (!managementAuthClient.enabled) {
      setError(copy.t('Chưa cấu hình dịch vụ xác thực Chatmgt.'));
      return;
    }

    setIsLoading(true);
    try {
      const session = await managementAuthClient.login(credentials);
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
        tenantOptions: session.tenantOptions,
        tinodeUid: session.tinodeUid,
        tinodeAuth: session.tinodeAuth,
        authSource: session.authSource,
        accountManaged: session.accountManaged,
        title: session.profile?.title || '',
        tinodeSession: session,
        connection: session.connection,
        avatar: session.profile?.avatar || '',
        mustChangePassword: Boolean(session.mustChangePassword),
      }, { source: 'credentials' });
    } catch (loginError) {
      if (loginError?.code === 'ACCOUNT_LOGIN_REQUIRED' && redirectWhenRequired && managementAuthClient.mode === 'account_sso') {
        window.location.assign(managementAuthClient.accountLoginUrl());
        return;
      }
      if (loginError?.code === 'ACCOUNT_LOGIN_REQUIRED') {
        setError(copy.t('Account chưa trả về phiên đăng nhập hợp lệ. Vui lòng đăng nhập lại tại account.upgo.vn.'));
      } else if (loginError?.code === 'ACCOUNT_TENANT_INVALID') {
        setError(copy.t('Tài khoản UpGO chưa được mời vào doanh nghiệp hoặc membership chưa hoạt động.'));
      } else if (loginError?.code === 'LOGIN_FAILED') {
        setError(copy.t('Tên đăng nhập hoặc mật khẩu không đúng.'));
      } else if (loginError?.code === 'LOGIN_RATE_LIMITED') {
        setError(copy.t('Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.'));
      } else {
        setError(copy.t(loginError?.message || 'Không thể đăng nhập. Vui lòng thử lại.'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [copy, onLoginSuccess]);

  useEffect(() => {
    if (passwordMode || !isAccountReturn() || accountReturnHandled.current) return;
    accountReturnHandled.current = true;
    clearAccountReturnMarker();
    finishLogin({ redirectWhenRequired: false });
  }, [finishLogin, passwordMode]);

  const handleLogin = event => {
    event.preventDefault();
    if (credentialMode && (!identity.trim() || !password)) {
      setError(copy.t('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.'));
      return;
    }
    finishLogin({
      redirectWhenRequired: true,
      credentials: credentialMode ? { identity: identity.trim(), password } : undefined,
    });
  };

  return (
    <div className="login-screen-container">
      <div className="login-bg-decor decor-1"></div>
      <div className="login-bg-decor decor-2"></div>
      <div className="login-card">
        <div className="login-card-header">
          <div className="login-logo"><ChatLogo alt="CHAT" /></div>
          <h2>Chat - Power by Gon Platform</h2>
        </div>

        {error && <div className="login-error-message"><i className="fa-solid fa-triangle-exclamation"></i><span>{error}</span></div>}
        {notice && <div className="login-success-message"><i className="fa-solid fa-circle-check"></i><span>{notice}</span></div>}

        <form onSubmit={handleLogin} className="login-form">
          {credentialMode && (
            <>
              <div className="login-form-group">
                <label htmlFor="chat-identity">{copy.t('Tên đăng nhập hoặc email')}</label>
                <div className="login-input-wrapper">
                  <i className="fa-regular fa-user login-input-icon"></i>
                  <input id="chat-identity" name="username" type="text" autoComplete="username" value={identity} onChange={event => setIdentity(event.target.value)} disabled={isLoading} placeholder={copy.t('Nhập tài khoản được cấp...')} autoFocus />
                </div>
              </div>
              <div className="login-form-group">
                <label htmlFor="chat-password">{copy.t('Mật khẩu')}</label>
                <div className="login-input-wrapper">
                  <i className="fa-solid fa-lock login-input-icon"></i>
                  <input id="chat-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={isLoading} placeholder={copy.t('Nhập mật khẩu...')} />
                  <button type="button" className="btn-toggle-password" onClick={() => setShowPassword(previous => !previous)} disabled={isLoading} aria-label={showPassword ? copy.t('Ẩn mật khẩu') : copy.t('Hiện mật khẩu')}><i className={`fa-regular ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i></button>
                </div>
              </div>
            </>
          )}
          <button type="submit" className="btn-login-submit" disabled={isLoading}>
            {isLoading
              ? <><div className="login-spinner"></div><span>{copy.t('Đang xác thực...')}</span></>
              : <><i className="fa-solid fa-arrow-right-to-bracket"></i><span>{managementAuthClient.mode === 'password' ? copy.t('Đăng nhập') : copy.t('Đăng nhập bằng UpGO Account')}</span></>}
          </button>
        </form>

      </div>
    </div>
  );
}

export default Login;
