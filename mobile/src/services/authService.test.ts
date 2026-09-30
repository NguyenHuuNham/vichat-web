import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./apiClient', () => ({
  apiRequest: vi.fn(),
  getAccessToken: vi.fn(() => 'old-token'),
  setAccessToken: vi.fn(),
}));
vi.mock('./storageService', () => ({
  storageService: {
    loadAccessToken: vi.fn(),
    loadSessionStartedAt: vi.fn(),
    saveSessionStartedAt: vi.fn(),
    saveAccessToken: vi.fn(),
    savePublicSession: vi.fn(),
    loadPublicSession: vi.fn(),
    clear: vi.fn(),
  },
}));

import { authService, normalizeAuthPayload, normalizeUser, validateSession } from './authService';
import { apiRequest, setAccessToken } from './apiClient';
import { storageService } from './storageService';

const user = { id: 'account-1', name: 'An', tenant_id: 'tenant-1', tinode_uid: 'usr-an' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mobile auth normalization', () => {
  it.each([
    ['nested tenant name', { tenant: { id: 'tenant-1', name: 'Company A' } }],
    ['tenantName', { tenant_id: 'tenant-1', tenantName: 'Company A' }],
    ['tenant_name', { tenant_id: 'tenant-1', tenant_name: 'Company A' }],
    ['user tenantName', { user: { ...user, tenantName: 'Company A' }, tenant_id: 'tenant-1' }],
    ['user tenant_name', { user: { ...user, tenant_name: 'Company A' }, tenant_id: 'tenant-1' }],
  ])('resolves %s without exposing raw payload to UI', (_label, variant) => {
    const session = normalizeAuthPayload({ ...variant, user: { ...user, ...(variant as any).user } });
    expect(session.tenant).toMatchObject({ id: 'tenant-1', name: 'Company A' });
    expect(session.user.tenantId).toBe('tenant-1');
    expect(session.user.tinodeUid).toBe('usr-an');
  });

  it('keeps the login company name when /auth/me omits only the name', () => {
    const fallback = normalizeAuthPayload({ user, tenant: { id: 'tenant-1', name: 'Company A' } });
    const refreshed = normalizeAuthPayload({ user, tenant: { id: 'tenant-1' } }, fallback);
    expect(validateSession(refreshed).tenant?.name).toBe('Company A');
  });

  it('does not carry a previous company name across tenant changes', () => {
    const fallback = normalizeAuthPayload({ user, tenant: { id: 'tenant-1', name: 'Company A' } });
    const refreshed = normalizeAuthPayload({ user: { ...user, tenant_id: 'tenant-2' }, tenant: { id: 'tenant-2', name: 'Company B' } }, fallback);
    expect(refreshed.tenant).toMatchObject({ id: 'tenant-2', name: 'Company B' });
    expect(refreshed.tenant?.name).not.toBe('Company A');
  });

  it('expands the legacy GON tenant label before it reaches the UI', () => {
    const session = normalizeAuthPayload({ user, tenant: { id: 'tenant-1', name: 'GonPlatform' } });
    expect(session.tenant?.name).toBe('Gon Platform');
  });

  it('keeps populated snake-case tenant choices when the camel-case field is empty', () => {
    const session = normalizeAuthPayload({
      user,
      tenant: { id: 'tenant-1', name: 'Company A' },
      tenantOptions: [],
      tenant_options: [
        { id: 'tenant-1', name: 'Company A', active: true },
        { id: 'tenant-2', name: 'Company B', active: true },
      ],
    });
    expect(session.tenantOptions?.map(option => option.id)).toEqual(['tenant-1', 'tenant-2']);
  });

  it('does not infer a Tinode UID from an Account ID', () => {
    expect(normalizeUser({ id: 'account-1', uid: 'account-1' }).uid).toBe('');
    expect(normalizeUser({ id: 'account-1', tinodeUid: 'usr-real' }).uid).toBe('usr-real');
  });

  it('keeps tenant choices and stores the rotated mobile token after switching company', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      access_token: 'rotated-token',
      user: { ...user, tenant_id: 'tenant-2', tinode_uid: 'usr-an-2' },
      tenant: { id: 'tenant-2', name: 'Company B' },
      tenantOptions: [
        { id: 'tenant-1', name: 'Company A', active: true },
        { id: 'tenant-2', name: 'Company B', active: true },
      ],
    });

    const session = await authService.switchTenant('tenant-2');

    expect(session.tenant).toMatchObject({ id: 'tenant-2', name: 'Company B' });
    expect(session.tenantOptions).toHaveLength(2);
    expect(session.user.tinodeUid).toBe('usr-an-2');
    expect(setAccessToken).toHaveBeenCalledWith('rotated-token');
  });

  it('uses the selected membership name when the switch payload has a stale label', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      access_token: 'rotated-token-2',
      user: { ...user, tenant_id: 'tenant-2', tinode_uid: 'usr-an-2' },
      tenant: { id: 'tenant-2', name: 'Gon Platform' },
      tenantOptions: [
        { id: 'tenant-1', name: 'Company A', active: true },
        { id: 'tenant-2', name: 'Company B', active: true },
      ],
    });
    const previousSession = normalizeAuthPayload({
      user,
      tenant: { id: 'tenant-1', name: 'Company A' },
      tenantOptions: [{ id: 'tenant-2', name: 'Company B', active: true }],
    });

    const session = await authService.switchTenant('tenant-2', previousSession);

    expect(session.tenant?.name).toBe('Company B');
  });

  it('accepts the nested Account membership response used by older Chatmgt gateways', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      data: {
        accessToken: 'nested-token',
        user: { ...user, tenant_id: 'tenant-2', tinode_uid: 'usr-an-2' },
        current_tenant: { companyId: 'tenant-2', company_name: 'Company B' },
        memberships: {
          'tenant-1': { company: { id: 'tenant-1', name: 'Company A' }, status: 'active' },
          'tenant-2': { company: { id: 'tenant-2', name: 'Company B' }, status: 'active' },
        },
      },
    });

    const session = await authService.switchTenant('tenant-2');

    expect(session.tenant).toMatchObject({ id: 'tenant-2', name: 'Company B' });
    expect(session.tenantOptions?.map(option => option.id)).toEqual(['tenant-1', 'tenant-2']);
    expect(setAccessToken).toHaveBeenCalledWith('nested-token');
  });

  it('keeps the previous membership list when a switch response omits it', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      access_token: 'rotated-token-3',
      user: { ...user, tenant_id: 'tenant-2' },
      tenant: { id: 'tenant-2', name: 'Company B' },
    });
    const previousSession = normalizeAuthPayload({
      user,
      tenant: { id: 'tenant-1', name: 'Company A' },
      tenantOptions: [
        { id: 'tenant-1', name: 'Company A', active: true },
        { id: 'tenant-2', name: 'Company B', active: true },
      ],
    });

    const session = await authService.switchTenant('tenant-2', previousSession);

    expect(session.tenantOptions?.map(option => option.id)).toEqual(['tenant-1', 'tenant-2']);
  });

  it('rejects a response for the wrong tenant without replacing the old token', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      access_token: 'wrong-tenant-token',
      user: { ...user, tenant_id: 'tenant-1' },
      tenant: { id: 'tenant-1', name: 'Company A' },
    });

    await expect(authService.switchTenant('tenant-2')).rejects.toThrow('selected company');
    expect(setAccessToken).not.toHaveBeenCalled();
    expect(storageService.saveAccessToken).not.toHaveBeenCalled();
  });

  it('rolls back the bearer token when secure session storage fails', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      access_token: 'rotated-token-4',
      user: { ...user, tenant_id: 'tenant-2' },
      tenant: { id: 'tenant-2', name: 'Company B' },
    });
    vi.mocked(storageService.savePublicSession).mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(authService.switchTenant('tenant-2')).rejects.toThrow('storage unavailable');
    expect(setAccessToken).toHaveBeenLastCalledWith('old-token');
    expect(storageService.saveAccessToken).toHaveBeenLastCalledWith('old-token');
  });
});
