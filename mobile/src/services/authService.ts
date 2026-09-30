import { apiRequest, getAccessToken, setAccessToken } from './apiClient';
import { config } from '../constants/config';
import { LinkedDevice, Session, TenantOption, TinodeAuth, User } from '../types';
import { storageService } from './storageService';
import { resolveTenantDisplayName } from '../utils/tenantDisplay';

function firstString(...values: unknown[]) {
  return values.map(value => String(value ?? '').trim()).find(Boolean) || '';
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function responseCandidates(payload: any) {
  const candidates: Record<string, any>[] = [];
  const queue = [payload];
  const seen = new Set<any>();
  while (queue.length && candidates.length < 8) {
    const value = queue.shift();
    if (!isRecord(value) || seen.has(value)) continue;
    seen.add(value);
    candidates.push(value);
    for (const key of ['data', 'session', 'auth', 'result', 'payload']) {
      if (isRecord(value[key])) queue.push(value[key]);
    }
  }
  return candidates;
}

function flattenAuthPayload(payload: any) {
  return responseCandidates(payload).reduce((merged, candidate) => ({
    ...merged,
    ...candidate,
    ...(candidate.user !== undefined ? { user: candidate.user } : {}),
    ...(candidate.current_user !== undefined ? { current_user: candidate.current_user } : {}),
    ...(candidate.tenant !== undefined ? { tenant: candidate.tenant } : {}),
    ...(candidate.tenantOptions !== undefined ? { tenantOptions: candidate.tenantOptions } : {}),
    ...(candidate.tenant_options !== undefined ? { tenant_options: candidate.tenant_options } : {}),
  }), {});
}

function accessTokenFromPayload(payload: any) {
  for (const candidate of responseCandidates(payload)) {
    const token = firstString(
      candidate.access_token,
      candidate.accessToken,
      candidate.chatmgt_access_token,
      candidate.chatmgtAccessToken,
      candidate.bearer_token,
    );
    if (token) return token;
  }
  return '';
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
  const currentTenant = [
    payload?.current_tenant,
    payload?.currentTenant,
    payload?.current_company,
    payload?.currentCompany,
  ].find(isRecord);
  const id = firstString(
    payload?.tenant?.id,
    payload?.tenant?.tenantId,
    payload?.tenant?.tenant_id,
    payload?.tenant?.companyId,
    payload?.tenant?.company_id,
    currentTenant?.id,
    currentTenant?.tenantId,
    currentTenant?.tenant_id,
    currentTenant?.companyId,
    currentTenant?.company_id,
    payload?.tenantId,
    payload?.tenant_id,
    payload?.current_tenant_id,
    payload?.currentTenantId,
    payload?.current_company_id,
    userPayload?.tenant?.id,
    userPayload?.tenant?.tenantId,
    userPayload?.tenant?.tenant_id,
    userPayload?.companyId,
    userPayload?.company_id,
    userPayload?.tenantId,
    userPayload?.tenant_id,
  );
  const fallbackMatches = Boolean(id && fallback?.tenant?.id && id === fallback.tenant.id);
  const name = resolveTenantDisplayName(
    payload?.tenant,
    payload?.tenantName,
    payload?.tenant_name,
    currentTenant,
    userPayload?.tenant,
    userPayload?.tenantName,
    userPayload?.tenant_name,
    fallbackMatches ? fallback?.tenant?.name : '',
  );
  return id ? {
    id,
    name,
    active: payload?.tenant?.active
      ?? currentTenant?.active
      ?? userPayload?.tenant?.active
      ?? userPayload?.active_tenant,
  } : null;
}

export function normalizeAuthPayload(payload: any, fallback?: Session | null): Session {
  const authPayload = flattenAuthPayload(payload);
  const rawUser = authPayload?.user || authPayload?.current_user || authPayload || {};
  const tenant = tenantFromPayload(authPayload, rawUser, fallback);
  const sameTenant = Boolean(tenant?.id && fallback?.tenant?.id === tenant.id);
  const user = normalizeUser(
    sameTenant ? { ...fallback?.user, ...rawUser } : rawUser,
    tenant?.id || '',
  );
  const tinodeAuth = normalizeTinodeAuth(authPayload?.tinode_auth || authPayload?.tinode);
  const linkedDevices = linkedDevicesFromPayload(authPayload) || (sameTenant ? fallback?.linkedDevices : null) || [];
  const tenantOptions = normalizeTenantOptions(
    firstTenantOptionSource(
      authPayload?.tenantOptions,
      authPayload?.tenant_options,
      rawUser?.tenantOptions,
      rawUser?.tenant_options,
      authPayload?.tenants,
      authPayload?.companies,
      authPayload?.memberships,
      rawUser?.tenants,
      rawUser?.companies,
      rawUser?.memberships,
    ),
  );
  return {
    user,
    tenant,
    tenantOptions: tenantOptions.length ? tenantOptions : (sameTenant ? fallback?.tenantOptions || [] : []),
    connection: String(authPayload?.connection || 'management'),
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
  const items = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.entries(value).map(([id, item]) => isRecord(item) ? { id, ...item } : { id, name: item })
      : [];
  const seen = new Set<string>();
  return items.flatMap((item: any) => {
    const id = firstString(
      typeof item === 'string' ? item : '',
      item?.id,
      item?.tenantId,
      item?.tenant_id,
      item?.companyId,
      item?.company_id,
      item?.brandId,
      item?.brand_id,
      item?.organizationId,
      item?.organization_id,
      item?.tenant?.id,
      item?.tenant?.tenantId,
      item?.tenant?.tenant_id,
      item?.company?.id,
      item?.company?.companyId,
      item?.company?.company_id,
    );
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const status = firstString(item?.status, item?.membershipStatus, item?.membership_status).toLowerCase();
    const inactiveStatus = ['inactive', 'disabled', 'revoked', 'removed', 'pending', 'invited'].includes(status);
    return [{
      id,
      name: resolveTenantDisplayName(
        item?.name,
        item?.tenantName,
        item?.tenant_name,
        item?.companyName,
        item?.company_name,
        item?.brandName,
        item?.brand_name,
        item?.tenant,
        item?.company,
        id,
      ),
      role: firstString(item?.role, 'member').toLowerCase(),
      accountRole: firstString(item?.accountRole, item?.account_role, 'member').toLowerCase(),
      active: inactiveStatus ? false : item?.active ?? item?.is_active ?? item?.enabled ?? true,
      logo: firstString(item?.logo, item?.logoUrl, item?.logo_url, item?.companyLogo, item?.company_logo, item?.brandLogo, item?.brand_logo),
      logoVersion: firstString(item?.logoVersion, item?.logo_version, item?.logoUpdatedAt, item?.logo_updated_at),
    }];
  });
}

function firstTenantOptionSource(...values: unknown[]) {
  const collections = values.filter(value => Array.isArray(value) || isRecord(value));
  return collections.find(items => Array.isArray(items) ? items.length > 0 : Object.keys(items).length > 0)
    || collections[0]
    || [];
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
    const accessToken = accessTokenFromPayload(payload);
    if (!accessToken) {
      throw new Error('Chatmgt chua bat phien Bearer danh cho ung dung mobile.');
    }
    setAccessToken(accessToken);
    await storageService.saveAccessToken(accessToken);
    await storageService.saveSessionStartedAt(new Date().toISOString());
    const session = validateSession(normalizeAuthPayload(payload));
    await storageService.savePublicSession(session);
    return session;
  },

  async currentSession(previousSession?: Session | null) {
    const cached = previousSession || await storageService.loadPublicSession();
    return validateSession(normalizeAuthPayload(
      await apiRequest('/api/v1/auth/me', { timeoutMs: 12000 }),
      cached,
    ));
  },

  async switchTenant(tenantId: string, previousSession?: Session | null): Promise<Session> {
    const requestedTenantId = String(tenantId || '').trim();
    const previousAccessToken = getAccessToken();
    const previousRefreshRequest = tinodeRefreshRequest;
    if (!requestedTenantId) throw new Error('Vui lòng chọn công ty.');
    const payload = await apiRequest<any>('/api/v1/auth/switch-tenant', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: requestedTenantId }),
    });
    const accessToken = accessTokenFromPayload(payload);
    if (!accessToken) {
      throw new Error('Chatmgt chưa trả về phiên mobile mới sau khi chuyển công ty.');
    }
    const session = normalizeAuthPayload(payload, previousSession);
    const responsePayload = flattenAuthPayload(payload);
    const responseOptions = normalizeTenantOptions(
      firstTenantOptionSource(
        responsePayload?.tenantOptions,
        responsePayload?.tenant_options,
        responsePayload?.tenants,
        responsePayload?.companies,
        responsePayload?.memberships,
      ),
    );
    if (responseOptions.length) session.tenantOptions = responseOptions;
    else if (previousSession?.tenantOptions?.length) session.tenantOptions = previousSession.tenantOptions;
    const selectedTenant = [...(session.tenantOptions || []), ...(previousSession?.tenantOptions || [])]
      .find(option => String(option.id).trim() === requestedTenantId);
    const selectedTenantName = resolveTenantDisplayName(selectedTenant);
    const actualTenantId = String(session.tenant?.id || session.user.tenantId || '').trim();
    if (actualTenantId !== requestedTenantId) {
      throw new Error('Chatmgt did not confirm the selected company.');
    }
    if (!session.tenant) {
      session.tenant = { id: requestedTenantId, name: selectedTenantName || requestedTenantId };
    } else {
      session.tenant = {
        ...session.tenant,
        name: selectedTenantName || session.tenant.name || requestedTenantId,
      };
    }
    validateSession(session);
    try {
      await storageService.saveAccessToken(accessToken);
      setAccessToken(accessToken);
      tinodeRefreshRequest = null;
      await storageService.savePublicSession(session);
      return session;
    } catch (error) {
      setAccessToken(previousAccessToken);
      tinodeRefreshRequest = previousRefreshRequest;
      try {
        await storageService.saveAccessToken(previousAccessToken);
      } catch { /* Keep the in-memory token safe when secure storage is unavailable. */ }
      throw error;
    }
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
