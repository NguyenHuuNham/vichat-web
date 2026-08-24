import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAT_MAINTENANCE_MESSAGE,
  chatMaintenanceApiUrl,
  fetchChatMaintenance,
  maintenanceStateFromEvent,
  normalizeChatMaintenanceState,
} from './chatMaintenanceService.js';

test('normalizes the maintenance payload without accepting arbitrary UI text', () => {
  assert.deepEqual(normalizeChatMaintenanceState({
    maintenance: { enabled: true, message: 'unexpected', updated_at: '123' },
  }), {
    enabled: true,
    message: CHAT_MAINTENANCE_MESSAGE,
    updatedAt: 123,
  });
  assert.equal(normalizeChatMaintenanceState({ enabled: 'false' }).enabled, false);
});

test('ignores malformed realtime events', () => {
  assert.equal(maintenanceStateFromEvent({ data: '{not-json' }), null);
  assert.equal(maintenanceStateFromEvent({}), null);
  assert.equal(maintenanceStateFromEvent({ data: '{"enabled":true}' }).enabled, true);
});

test('fetches a cache-free public maintenance snapshot', async () => {
  let request = null;
  const state = await fetchChatMaintenance(async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ maintenance: { enabled: true, updatedAt: 456 } }),
    };
  });
  assert.equal(request.url, chatMaintenanceApiUrl('/api/v1/chat/maintenance'));
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.credentials, 'include');
  assert.equal(state.enabled, true);
  assert.equal(state.updatedAt, 456);
});
