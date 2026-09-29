import { describe, expect, it } from 'vitest';
import { canonicalTenantDisplayName, displayTenantName, resolveTenantDisplayName } from './tenantDisplay';

describe('tenant display name normalization', () => {
  it('expands legacy GON aliases to the complete brand', () => {
    expect(canonicalTenantDisplayName('GON')).toBe('GON Platform');
    expect(canonicalTenantDisplayName('GonPlatform')).toBe('GON Platform');
  });

  it('keeps a real company name unchanged', () => {
    expect(canonicalTenantDisplayName('Công ty Ánh Dương')).toBe('Công ty Ánh Dương');
  });

  it('reads display/company aliases from the normalized tenant object', () => {
    expect(resolveTenantDisplayName({ id: 'tenant-1', properties: { display_name: 'Company A' } })).toBe('Company A');
    expect(resolveTenantDisplayName({ id: 'tenant-1', company_name: 'Company B' })).toBe('Company B');
  });

  it('normalizes aliases at render time when a stale session reaches the UI', () => {
    expect(displayTenantName('GON', 'Công ty của bạn')).toBe('GON Platform');
    expect(displayTenantName('', 'Công ty của bạn')).toBe('Công ty của bạn');
  });
});
