import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accountAdminLoginUrl,
  consumeAccountAdminCallback,
  managementAdminService,
  normalizeAdminConversation,
  normalizeManagementUser,
} from './managementAdminService.js';

test('builds and consumes the Account admin SSO callback without credentials', () => {
  const loginUrl = new URL(accountAdminLoginUrl('https://chatmgt.upgo.vn/?view=system'));
  const callbackUrl = new URL(loginUrl.searchParams.get('continue'));

  assert.equal(loginUrl.origin, 'https://account.upgo.vn');
  assert.equal(callbackUrl.origin, 'https://chatmgt.upgo.vn');
  assert.equal(callbackUrl.searchParams.get('view'), 'system');
  assert.equal(callbackUrl.searchParams.get('vichat_admin_sso'), '1');

  const consumed = consumeAccountAdminCallback(callbackUrl.toString());
  assert.equal(consumed.shouldRetry, true);
  assert.equal(new URL(consumed.cleanUrl).searchParams.has('vichat_admin_sso'), false);
});

test('sends tenant-admin employee create, update, and password reset requests', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    const user = { id: 'employee-1', username: 'employee', name: 'Employee One', auth_source: 'local' };
    return {
      ok: true,
      status: 200,
      json: async () => url.endsWith('/reset-password') ? { reset: true, user } : user,
    };
  };

  try {
    await managementAdminService.createUser({ username: 'employee', password: 'StrongPassword!2026', name: 'Employee One' });
    await managementAdminService.updateUser('employee-1', { title: 'Sales' });
    await managementAdminService.resetPassword('employee-1', 'AnotherPassword!2026');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests[0].url, '/api/v1/chat/users');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(JSON.parse(requests[0].options.body).username, 'employee');
  assert.equal(requests[1].url, '/api/v1/chat/users/employee-1');
  assert.equal(requests[1].options.method, 'PUT');
  assert.equal(requests[2].url, '/api/v1/chat/users/employee-1/reset-password');
  assert.deepEqual(JSON.parse(requests[2].options.body), { new_password: 'AnotherPassword!2026' });
  assert.equal(requests.every(request => request.options.headers['X-Vichat-Session-Scope'] === 'management'), true);
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

test('normalizes conversation metadata without requiring message content', () => {
  const conversation = normalizeAdminConversation({
    id: 'conversation-1',
    subject: 'Nhom van hanh',
    isGroup: true,
    members: [{ id: 'account-user-1', name: 'Nguyen Van A', authSource: 'account' }],
    realtime: {
      ready: true,
      binding: 'shared-group',
      provisionedParticipants: 1,
    },
  });

  assert.equal(conversation.isGroup, true);
  assert.equal(conversation.participantCount, 1);
  assert.equal(conversation.members[0].accountManaged, true);
  assert.deepEqual(conversation.realtime, {
    ready: true,
    binding: 'shared-group',
    provisionedParticipants: 1,
  });
  assert.equal('messages' in conversation, false);
});
