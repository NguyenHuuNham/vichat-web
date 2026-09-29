import { describe, expect, it } from 'vitest';
import { memberIsAdmin, memberIsOwner } from './groupSettings';

describe('group member roles', () => {
  it('recognizes Tinode owner and deputy access modes', () => {
    expect(memberIsOwner({ mode: 'JRWPASO' })).toBe(true);
    expect(memberIsAdmin({ mode: 'JRWPASO' })).toBe(true);
    expect(memberIsAdmin({ mode: 'JRWPASD' })).toBe(true);
    expect(memberIsAdmin({ mode: 'JRWPAS' })).toBe(false);
  });

  it('keeps an explicit Chatmgt role authoritative over a stale Tinode mode', () => {
    expect(memberIsOwner({ groupRole: 'MEMBER', mode: 'JRWPASO' })).toBe(false);
    expect(memberIsAdmin({ groupRole: 'MEMBER', mode: 'JRWPASD' })).toBe(false);
    expect(memberIsAdmin({ groupRole: 'ADMIN', mode: 'JRWPAS' })).toBe(true);
  });
});
