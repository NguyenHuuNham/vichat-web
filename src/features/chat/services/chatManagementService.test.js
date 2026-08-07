import assert from 'node:assert/strict';
import test from 'node:test';

import { employeeLoginPayload, tinodeRefreshPayload } from './chatManagementService.js';

test('builds a tenant-scoped employee login payload', () => {
  const payload = employeeLoginPayload({
    identity: '  nhanvien.a  ',
    password: 'StrongPassword!2026',
  });

  assert.deepEqual(payload, {
    identity: 'nhanvien.a',
    password: 'StrongPassword!2026',
    tenant_id: 'song-hong',
  });
  assert.equal('role' in payload, false);
  assert.equal('user_id' in payload, false);
});

test('resends the employee password only when the volatile Tinode token needs renewal', () => {
  assert.deepEqual(tinodeRefreshPayload({
    token: 'fresh-token',
    expires: Date.now() / 1000 + 120,
  }, 'EmployeePassword!2026'), {});
  assert.deepEqual(tinodeRefreshPayload({
    token: 'expiring-token',
    expires: Date.now() / 1000 + 10,
  }, 'EmployeePassword!2026'), {
    password: 'EmployeePassword!2026',
  });
  assert.deepEqual(tinodeRefreshPayload({
    token: 'expired-token',
    expires: Date.now() / 1000 - 10,
  }, ''), {});
});
