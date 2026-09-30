import { config } from '../constants/config';
import type { Session } from '../types';

function scalarText(value: unknown) {
  return (typeof value === 'string' || typeof value === 'number')
    ? String(value).trim().replace(/\s+/g, ' ')
    : '';
}

function compactKey(value: string) {
  return value.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '');
}

function configuredBrandName() {
  return scalarText(config.brandName) || 'Gon Platform';
}

function objectCandidates(value: Record<string, unknown>) {
  const properties = value.properties;
  const nestedProperties = properties && typeof properties === 'object' && !Array.isArray(properties)
    ? properties as Record<string, unknown>
    : {};
  return [
    value.name,
    value.displayName,
    value.display_name,
    value.companyName,
    value.company_name,
    value.brandName,
    value.brand_name,
    value.organizationName,
    value.organization_name,
    value.label,
    value.title,
    nestedProperties.displayName,
    nestedProperties.display_name,
    nestedProperties.companyName,
    nestedProperties.company_name,
    nestedProperties.brandName,
    nestedProperties.brand_name,
    nestedProperties.organizationName,
    nestedProperties.organization_name,
    nestedProperties.label,
  ];
}

/** Keep legacy GON tenant aliases from hiding the product wordmark. */
export function canonicalTenantDisplayName(value: unknown) {
  const text = scalarText(value);
  if (!text) return '';
  const key = compactKey(text);
  const brand = configuredBrandName();
  if (key === 'gon' || key === 'gonplatform' || key === compactKey(brand)) return brand;
  return text;
}

export function resolveTenantDisplayName(...sources: unknown[]) {
  for (const source of sources) {
    const values = source && typeof source === 'object' && !Array.isArray(source)
      ? objectCandidates(source as Record<string, unknown>)
      : [source];
    for (const value of values) {
      const name = canonicalTenantDisplayName(value);
      if (name) return name;
    }
  }
  return '';
}

export function displayTenantName(value: unknown, fallback = '') {
  return resolveTenantDisplayName(value) || scalarText(fallback);
}

/** Prefer the selected membership label so a tenant switch cannot leave a stale brand name in the UI. */
export function displayCurrentTenantName(session: Pick<Session, 'tenant' | 'tenantOptions'> | null | undefined, fallback = '') {
  const currentTenantId = scalarText(session?.tenant?.id);
  const selectedOption = session?.tenantOptions?.find(option => scalarText(option.id) === currentTenantId);
  return displayTenantName(selectedOption?.name, displayTenantName(session?.tenant, fallback));
}

export function displayRoleName(value: unknown, fallback = '') {
  const text = scalarText(value);
  if (!text) return fallback;
  const key = compactKey(text);
  const knownNames: Record<string, string> = {
    admin: 'Admin',
    owner: 'Owner',
    superadmin: 'Superadmin',
    member: 'Member',
  };
  return knownNames[key] || `${text.slice(0, 1).toLocaleUpperCase('vi-VN')}${text.slice(1)}`;
}
