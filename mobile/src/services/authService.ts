import { apiRequest, getAccessToken, setAccessToken } from './apiClient';
import { config } from '../constants/config';
import { LinkedDevice, Session, TenantOption, TinodeAuth, User } from '../types';
import { storageService } from './storageService';
import { resolveTenantDisplayName } from '../utils/tenantDisplay';

function firstString(...values: unknown[]) {
  return values.map(value => String(value ?? '').trim()).find(Boolean) || '';
}

function isTinodeUid(value: unknown) {
  return /^usr[a-z0-9_-]+$/i.test(String(value || '').trim());
}

export function normalizeUser(account: any, tenantId = ''): User {
  const tinodeUid = firstString(
    account?.tinodeUid,
    account?.tinode_uid,
    account?.tinode?.uid,
    isTinodeUid(account?.uid) ? account.uid : '',
  );
  const id = firstString(account?.id, account?.userId, account?.user_id);
  return {
    ...account,
    id,
    // Account IDs are valid only for Chatmgt permission/membership calls.
    uid: tinodeUid,
    tinodeUid,
    username: firstString(account?.username, account?.user_name, account?.login),
    name: firstString(account?.name, account?.fullName, account?.full_name, account?.displayName, account?.display_name, account?.username, 'Nhan vien'),
    email: firstString(account?.email),
    avatar: firstString(account?.avatar, account?.photo),
    role: firstString(account?.role, 'member'),
    department: firstString(account?.department),
    title: firstString(account?.title),
    active: account?.active ?? account?.is_active ?? true,
    tenantId: firstString(account?.tenantId, account?.tenant_id, account?.tenant?.id, tenantId),
  };
}

function tenantFromPayload(payload: any, userPayload: any, fallback?: Session | null) {
  const id = firstString(
    payload?.tenant?.id,
    payload?.tenantId,
    payload?.tenant_id,
    payload?.current_tenant_id,
    userPayload?.tenant?.id,
    userPayload?.tenantId,
    userPayload?.tenant_id,
  );
  const fallbackMatches = Boolean(id && fallback?.tenant?.id && id === fallback.tenant.id);
  const name = resolveTenantDisplayName(
    payload?.tenant,
    payload?.tenantName,
    payload?.tenant_name,
    userPayload?.tenant,
    userPayload?.tenantName,
    userPayload?.tenant_name,
    fallbackMatches ? fallback?.tenant?.name : '',
  );
  return id ? { id, name, active: payload?.tenant?.active ?? userPayload?.tenant?.active } : null;
}

export function normalizeAuthPayload(payload: any, fallback?: Session | null): Session {
  const rawUser = payload?.user || payload?.current_user || payload || {};
  const tenant = tenantFromPayload(payload, rawUser, fallback);
  const sameTenant = Boolean(tenant?.id && fallback?.tenant?.id === tenant.id);
  const user = normalizeUser(
    sameTenant ? { ...fallback?.user, ...rawUser } : rawUser,
    tenant?.id || '',
  );
  const tinodeAuth = normalizeTinodeAuth(payload?.tinode_auth || payload?.tinode);
  const linkedDevices = linkedDevicesFromPayload(payload) || (sameTenant ? fallback?.linkedDevices : null) || [];
  const tenantOptions = normalizeTenantOptions(
    firstTenantOptionSource(
      payload?.tenantOptions,
      payload?.tenant_options,
      rawUser?.tenantOptions,
      rawUser?.tenant_options,
      payload?.tenants,
      payload?.companies,
      payload?.memberships,
      rawUser?.tenants,
      rawUser?.companies,
      rawUser?.memberships,
    ),
  );
  return {
    user,
    tenant,
    tenantOptions: tenantOptions.length ? tenantOptions : (sameTenant ? fallback?.tenantOptions || [] : []),
    connection: String(payload?.connection || 'management'),
    tinodeAuth,
    linkedDevices,
    generation: Number(fallback?.generation || 0),
    hydratedAt: Date.now(),
  };
}

export function validateSession(session: Session, requireTinode = false) {
  if (!session.user.id || !session.tenant?.id || !session.tenant.name) {
    throw new Error('Phien dang nhap thieu Account hoac cong ty hien tai. Hay dang nhap lai.');
  }
  if (requireTinode && !session.tinodeAuth?.uid && !session.user.tinodeUid) {
    throw new Error('Phien realtime chua co dinh danh Tinode hop le. Hay thu dang nhap lai.');
  }
  return session;
}

function normalizeLinkedDevices(value: any): LinkedDevice[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any, index: number) => ({
    id: firstString(item?.id, item?.jti, `linked-device-${index}`),
    kind: ['web', 'mobile', 'tablet', 'desktop'].includes(firstString(item?.kind, item?.type, item?.client).toLowerCase())
      ? firstString(item?.kind, item?.type, item?.client).toLowerCase() as LinkedDevice['kind']
      : 'unknown',
    name: firstString(item?.name, item?.device_name, item?.device, item?.user_agent, 'Unknown device'),
    platform: firstString(item?.platform, item?.os, item?.client),
    createdAt: item?.created_at || item?.createdAt,
    lastActiveAt: item?.last_active_at || item?.lastActiveAt || item?.updated_at || item?.updatedAt || item?.created_at || item?.createdAt,
    current: Boolean(item?.current || item?.is_current),
  }));
}

function linkedDevicesFromPayload(payload: any): LinkedDevice[] | null {
  for (const key of ['linked_devices', 'linkedDevices', 'sessions']) {
    if (Array.isArray(payload?.[key])) return normalizeLinkedDevices(payload[key]);
  }
  return null;
}

function normalizeTinodeAuth(value: any): TinodeAuth | null {
  if (!value?.token || !value?.uid) return null;
  return {
    token: String(value.token),
    uid: String(value.uid),
    username: String(value.username || ''),
    expires: value.expires,
  };
}

function normalizeTenantOptions(value: unknown): TenantOption[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item: any) => {
    const id = firstString(item?.id, item?.tenantId, item?.tenant_id);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      name: firstString(item?.name, item?.tenantName, item?.tenant_name, id),
      role: firstString(item?.role, 'member').toLowerCase(),
      accountRole: firstString(item?.accountRole, item?.account_role, 'member').toLowerCase(),
      active: item?.active ?? item?.is_active ?? true,
      logo: firstString(item?.logo, item?.logoUrl, item?.logo_url, item?.companyLogo, item?.company_logo, item?.brandLogo, item?.brand_logo),
      logoVersion: firstString(item?.logoVersion, item?.logo_version, item?.logoUpdatedAt, item?.logo_updated_at),
    }];
  });
}

function firstTenantOptionSource(...values: unknown[]) {
  const arrays = values.filter(Array.isArray) as unknown[][];
  return arrays.find(items => items.length > 0) || arrays[0] || [];
}

let tinodeRefreshRequest: { accessToken: string; promise: Promise<TinodeAuth> } | null = null;

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
      body: JSON.stringify({ identity: identity.trim(), password }),
    });
    if (!payload?.access_token) {
      throw new Error('Chatmgt chua bat phien Bearer danh cho ung dung mobile.');
    }
    setAccessToken(payload.access_token);
    await storageService.saveAccessToken(payload.access_token);
    await storageService.saveSessionStartedAt(new Date().toISOString());
    const session = validateSession(normalizeAuthPayload(payload));
    await storageService.savePublicSession(session);
    return session;
  },

  async currentSession() {
    const cached = await storageService.loadPublicSession();
    return validateSession(normalizeAuthPayload(
      await apiRequest('/api/v1/auth/me', { timeoutMs: 12000 }),
      cached,
    ));
  },

  async switchTenant(tenantId: string, previousSession?: Session | null): Promise<Session> {
    const requestedTenantId = String(tenantId || '').trim();
    if (!requestedTenantId) throw new Error('Vui lòng chọn công ty.');
    const payload = await apiRequest<any>('/api/v1/auth/switch-tenant', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: requestedTenantId }),
    });
    if (!payload?.access_token) {
      throw new Error('Chatmgt chưa trả về phiên mobile mới sau khi chuyển công ty.');
    }
    setAccessToken(payload.access_token);
    await storageService.saveAccessToken(payload.access_token);
    const session = normalizeAuthPayload(payload);
    const selectedTenant = previousSession?.tenantOptions?.find(option => String(option.id) === requestedTenantId);
    const selectedTenantName = resolveTenantDisplayName(selectedTenant);
    if (selectedTenantName && session.tenant?.id === requestedTenantId) {
      session.tenant = { ...session.tenant, name: selectedTenantName };
    }
    validateSession(session);
    await storageService.savePublicSession(session);
    return session;
  },

  async listLinkedDevices() {
    try {
      const payload = await apiRequest<any>('/api/v1/auth/devices');
      const devices = linkedDevicesFromPayload(payload);
      if (devices) return devices;
      throw new Error('May chu chua tra ve du lieu phien dang nhap.');
    } catch (error) {
      // Older Chatmgt releases expose the same snapshot through /auth/me.
      let fallbackDevices: LinkedDevice[] | null = null;
      try {
        const payload = await apiRequest<any>('/api/v1/auth/me');
        fallbackDevices = linkedDevicesFromPayload(payload);
      } catch { /* Re-throw the original endpoint error below. */ }
      if (fallbackDevices) return fallbackDevices;
      throw error;
    }
  },

  async refreshTinodeToken() {
    const requestAccessToken = getAccessToken();
    if (tinodeRefreshRequest?.accessToken === requestAccessToken) return tinodeRefreshRequest.promise;
    const promise = (async () => {
      const payload = await apiRequest<any>('/api/v1/auth/tinode-token', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      // A logout or a newer login may have replaced the bearer while this
      // request was in flight. Do not let the stale response overwrite it.
      if (getAccessToken() !== requestAccessToken) throw new Error('Phien dang nhap da thay doi trong luc lam moi Tinode.');
      if (payload?.access_token) {
        setAccessToken(payload.access_token);
        await storageService.saveAccessToken(payload.access_token);
      }
      const auth = normalizeTinodeAuth(payload?.tinode_auth || payload?.tinode);
      if (!auth) throw new Error('Chatmgt khong tra ve Tinode token hop le.');
      return auth;
    })().finally(() => {
      if (tinodeRefreshRequest?.promise === promise) tinodeRefreshRequest = null;
    });
    tinodeRefreshRequest = { accessToken: requestAccessToken, promise };
    return promise;
  },

  async logout() {
    try {
      await apiRequest('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken('');
      tinodeRefreshRequest = null;
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
    form.append('avatar', {
      uri: file.uri,
      name: file.name || 'avatar.jpg',
      type: file.type || 'image/jpeg',
    } as any);
    const payload = await apiRequest<any>('/api/v1/auth/avatar', {
      method: 'POST',
      body: form,
      timeoutMs: 10 * 60 * 1000,
    });
    return normalizeUser(payload?.user || payload);
  },
};
