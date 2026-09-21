import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accountAdminLoginUrl,
  consumeAccountAdminCallback,
  managementAdminService,
  normalizeManagementUser,
} from './managementAdminService.js';

test('builds and consumes the Account admin SSO callback without credentials', () => {
  const loginUrl = new URL(accountAdminLoginUrl('https://chatmgt.gonplatform.com/?view=system'));
  const callbackUrl = new URL(loginUrl.searchParams.get('continue'));

  assert.equal(loginUrl.origin, 'https://account.gonplatform.com');
  assert.equal(callbackUrl.origin, 'https://chatmgt.gonplatform.com');
  assert.equal(callbackUrl.searchParams.get('view'), 'system');
  assert.equal(callbackUrl.searchParams.get('vichat_admin_sso'), '1');

  const consumed = consumeAccountAdminCallback(callbackUrl.toString());
  assert.equal(consumed.shouldRetry, true);
  assert.equal(new URL(consumed.cleanUrl).searchParams.has('vichat_admin_sso'), false);
});

test('keeps the management user surface read-only except session revocation', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    const user = { id: 'employee-1', username: 'employee', name: 'Employee One', auth_source: 'local' };
    return {
      ok: true,
      status: 200,
      json: async () => url.includes('/revoke-session') ? { revoked: true, user } : { objects: [user] },
    };
  };

  try {
    await managementAdminService.listUsers();
    await managementAdminService.revokeSessions('employee-1');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(requests[0].url, /^\/api\/v1\/chat\/users\?/);
  const firstUsersUrl = new URL(requests[0].url, 'https://chatmgt.gonplatform.com');
  assert.equal(firstUsersUrl.searchParams.get('limit'), '100');
  assert.equal(firstUsersUrl.searchParams.has('results_per_page'), false);
  assert.equal(requests[1].url, '/api/v1/chat/users/employee-1/revoke-session');
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(requests.every(request => request.options.headers['X-Vichat-Session-Scope'] === 'management'), true);
  assert.equal(typeof managementAdminService.listConversations, 'undefined');
  assert.equal(typeof managementAdminService.createUser, 'undefined');
  assert.equal(typeof managementAdminService.updateUser, 'undefined');
  assert.equal(typeof managementAdminService.setUserActive, 'undefined');
  assert.equal(typeof managementAdminService.resetPassword, 'undefined');
});

test('follows the bounded management directory cursor', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    const page = requests.length === 1
      ? { objects: [{ id: 'employee-1', name: 'Employee One' }], next_cursor: 'cursor-2' }
      : { objects: [{ id: 'employee-2', name: 'Employee Two' }] };
    return { ok: true, status: 200, json: async () => page };
  };

  try {
    const users = await managementAdminService.listUsers();
    assert.deepEqual(users.map(user => user.id), ['employee-1', 'employee-2']);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 2);
  const firstUrl = new URL(requests[0].url, 'https://chatmgt.gonplatform.com');
  const secondUrl = new URL(requests[1].url, 'https://chatmgt.gonplatform.com');
  assert.equal(firstUrl.searchParams.get('limit'), '100');
  assert.equal(firstUrl.searchParams.has('cursor'), false);
  assert.equal(secondUrl.searchParams.get('limit'), '100');
  assert.equal(secondUrl.searchParams.get('cursor'), 'cursor-2');
});

test('normalizes Account projections as read-only management users', () => {
  const user = normalizeManagementUser({
    id: 'account-user-1',
    display_name: 'Nguyen Van A',
    avatar_url: 'https://service.upgo.vn/accounts/avatar-a.jpg',
    auth_source: 'account',
    tinode_uid: 'usrTinodeA',
    updated_at: '2026-07-31T00:00:00Z',
  });

  assert.equal(user.name, 'Nguyen Van A');
  assert.equal(user.avatar, 'https://service.upgo.vn/accounts/avatar-a.jpg');
  assert.equal(user.accountManaged, true);
  assert.equal(user.authSource, 'account');
  assert.equal(user.tinodeUid, 'usrTinodeA');
  assert.equal(user.updatedAt, '2026-07-31T00:00:00Z');
});

test('controls Chat UI maintenance through the isolated management scope', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ maintenance: { enabled: options.method === 'PUT', updatedAt: 12 } }),
    };
  };

  try {
    assert.equal((await managementAdminService.getChatUiMaintenance()).enabled, false);
    assert.equal((await managementAdminService.setChatUiMaintenance(true)).enabled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests[0].url, '/api/v1/admin/chat-ui-maintenance');
  assert.equal(requests[1].url, '/api/v1/admin/chat-ui-maintenance');
  assert.equal(requests[1].options.method, 'PUT');
  assert.deepEqual(JSON.parse(requests[1].options.body), { enabled: true });
  assert.equal(requests.every(request => request.options.headers['X-Vichat-Session-Scope'] === 'management'), true);
});
