import { describe, expect, it } from 'vitest';
import { sessionScopeKey } from './sessionScope';

describe('session scope', () => {
  it('changes when the authenticated tenant changes', () => {
    const companyA = sessionScopeKey({ user: { id: 'account-1' }, tenant: { id: 'company-a' }, generation: 1 });
    const companyB = sessionScopeKey({ user: { id: 'account-1' }, tenant: { id: 'company-b' }, generation: 2 });
    expect(companyA).not.toBe(companyB);
  });

  it('does not produce a usable scope without both account and tenant', () => {
    expect(sessionScopeKey(null)).toBe('');
    expect(sessionScopeKey({ user: { id: 'account-1' }, tenant: null, generation: 1 })).toBe('');
  });
});
