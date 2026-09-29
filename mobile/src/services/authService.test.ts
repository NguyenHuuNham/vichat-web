import { describe, expect, it, vi } from 'vitest';

vi.mock('./apiClient', () => ({
  apiRequest: vi.fn(),
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

import { normalizeAuthPayload, normalizeUser, validateSession } from './authService';

const user = { id: 'account-1', name: 'An', tenant_id: 'tenant-1', tinode_uid: 'usr-an' };

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
    expect(session.tenant?.name).toBe('GON Platform');
  });

  it('does not infer a Tinode UID from an Account ID', () => {
    expect(normalizeUser({ id: 'account-1', uid: 'account-1' }).uid).toBe('');
    expect(normalizeUser({ id: 'account-1', tinodeUid: 'usr-real' }).uid).toBe('usr-real');
  });
});
