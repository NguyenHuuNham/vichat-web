import { describe, expect, it, beforeEach } from 'vitest';
import {
  beginTrustedExternalActivity,
  consumeTrustedExternalActivity,
  endTrustedExternalActivity,
  isTrustedExternalActivity,
} from './appLifecycleService';

describe('appLifecycleService', () => {
  beforeEach(() => {
    endTrustedExternalActivity();
  });

  it('reports false when no trusted external activity is active', () => {
    expect(isTrustedExternalActivity()).toBe(false);
    expect(consumeTrustedExternalActivity()).toBe(false);
  });

  it('tracks trusted external activity within timeout', () => {
    beginTrustedExternalActivity(10_000);
    expect(isTrustedExternalActivity()).toBe(true);
    expect(consumeTrustedExternalActivity()).toBe(true);
    // After consumption, it should be cleared
    expect(isTrustedExternalActivity()).toBe(false);
    expect(consumeTrustedExternalActivity()).toBe(false);
  });

  it('allows premature termination with endTrustedExternalActivity', () => {
    beginTrustedExternalActivity(60_000);
    expect(isTrustedExternalActivity()).toBe(true);
    endTrustedExternalActivity();
    expect(isTrustedExternalActivity()).toBe(false);
    expect(consumeTrustedExternalActivity()).toBe(false);
  });
});
