import assert from 'node:assert/strict';
import test from 'node:test';

import { employeeLoginPayload } from './chatManagementService.js';

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
