import { apiRequest, setAccessToken } from './apiClient';
import { config } from '../constants/config';
import { LinkedDevice, Session, TinodeAuth, User } from '../types';
import { storageService } from './storageService';

function normalizeUser(account: any): User {
  return {
    ...account,
    id: String(account?.id || account?.user_id || account?.uid || ''),
    uid: String(account?.tinode_uid || account?.tinodeUid || account?.uid || account?.id || ''),
    username: String(account?.username || account?.user_name || account?.login || ''),
    name: String(account?.name || account?.full_name || account?.display_name || account?.username || 'Nhân viên'),
    email: String(account?.email || ''),
    avatar: String(account?.avatar || account?.photo || ''),
    role: String(account?.role || 'member'),
    department: String(account?.department || ''),
    title: String(account?.title || ''),
    active: account?.active ?? account?.is_active ?? true,
    tenantId: String(account?.tenantId || account?.tenant_id || config.tenantId),
  };
}

function normalizeSession(payload: any): Session {
  const user = normalizeUser(payload?.user || payload?.current_user || payload);
  return {
    user,
    tenant: payload?.tenant ? {
      id: String(payload.tenant.id || user.tenantId),
      name: String(payload.tenant.name || ''),
      active: payload.tenant.active,
    } : null,
    connection: String(payload?.connection || 'management'),
    tinodeAuth: normalizeTinodeAuth(payload?.tinode_auth || payload?.tinode),
    linkedDevices: normalizeLinkedDevices(payload?.linked_devices || payload?.linkedDevices || payload?.sessions),
  };
}

function normalizeLinkedDevices(value: any): LinkedDevice[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any, index: number) => ({
    id: String(item?.id || item?.jti || `linked-device-${index}`),
    kind: ['web', 'mobile', 'tablet', 'desktop'].includes(String(item?.kind || item?.type || item?.client || '').toLowerCase())
      ? String(item?.kind || item?.type || item?.client).toLowerCase() as LinkedDevice['kind']
      : 'unknown',
    name: String(item?.name || item?.device_name || item?.device || item?.user_agent || 'Thiết bị không xác định'),
    platform: String(item?.platform || item?.os || item?.client || ''),
    lastActiveAt: item?.last_active_at || item?.lastActiveAt || item?.updated_at || item?.updatedAt || item?.created_at || item?.createdAt,
    current: Boolean(item?.current || item?.is_current),
  }));
}

function normalizeTinodeAuth(value: any): TinodeAuth | null {
  if (!value?.token) return null;
  return {
    token: String(value.token),
    uid: String(value.uid || ''),
    username: String(value.username || ''),
    expires: value.expires,
  };
}

export const authService = {
  async restoreToken() {
    const token = await storageService.loadAccessToken();
    setAccessToken(token);
    if (token && !(await storageService.loadSessionStartedAt())) await storageService.saveSessionStartedAt(new Date().toISOString());
    return token;
  },

  async login(identity: string, password: string): Promise<Session> {
    const payload = await apiRequest<any>('/api/v1/auth/account-login', {
      method: 'POST',
      mobileLogin: true,
      body: JSON.stringify({ identity: identity.trim(), password, tenant_id: config.tenantId }),
    });
    if (!payload?.access_token) {
      throw new Error('Chatmgt chưa bật phiên Bearer dành cho ứng dụng mobile.');
    }
    setAccessToken(payload.access_token);
    await storageService.saveAccessToken(payload.access_token);
    await storageService.saveSessionStartedAt(new Date().toISOString());
    const session = normalizeSession(payload);
    await storageService.savePublicSession(session);
    return session;
  },

  async currentSession() {
    return normalizeSession(await apiRequest('/api/v1/auth/me'));
  },

  async refreshTinodeToken() {
    const payload = await apiRequest<any>('/api/v1/auth/tinode-token', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const auth = normalizeTinodeAuth(payload?.tinode_auth || payload?.tinode);
    if (!auth) throw new Error('Chatmgt không trả về Tinode token hợp lệ.');
    return auth;
  },

  async logout() {
    try {
      await apiRequest('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken('');
      await storageService.clear();
    }
  },

  requestPasswordReset(identity: string) {
    return apiRequest('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identity: identity.trim(), tenant_id: config.tenantId }),
    });
  },

  async updateProfile(profile: Partial<User>) {
    const payload = await apiRequest<any>('/api/v1/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
    return normalizeUser(payload?.user || payload);
  },

  async updateAvatar(file: { uri: string; name: string; type: string }) {
    const form = new FormData();
    form.append('avatar', file as any);
    const payload = await apiRequest<any>('/api/v1/auth/avatar', { method: 'POST', body: form });
    return normalizeUser(payload?.user || payload);
  },
};

export { normalizeUser };
