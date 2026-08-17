import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchProtectedMediaWithRetry,
  shouldRetryProtectedMedia,
} from './mediaRetryPolicy.js';

test('retries protected media once after a 401 or 403 token response', async () => {
  for (const status of [401, 403]) {
    let requests = 0;
    let refreshes = 0;
    const response = await fetchProtectedMediaWithRetry({
      request: async () => {
        requests += 1;
        return { status: requests === 1 ? status : 200, ok: requests > 1 };
      },
      refreshAuth: async () => {
        refreshes += 1;
        return true;
      },
    });

    assert.equal(response.status, 200);
    assert.equal(requests, 2);
    assert.equal(refreshes, 1);
  }
});

test('does not retry missing files or server errors', async () => {
  for (const status of [404, 500]) {
    let requests = 0;
    let refreshes = 0;
    const response = await fetchProtectedMediaWithRetry({
      request: async () => {
        requests += 1;
        return { status, ok: false };
      },
      refreshAuth: async () => {
        refreshes += 1;
        return true;
      },
    });

    assert.equal(response.status, status);
    assert.equal(requests, 1);
    assert.equal(refreshes, 0);
  }
});

test('keeps the original protected-media response when renewal fails', async () => {
  let requests = 0;
  const response = await fetchProtectedMediaWithRetry({
    request: async () => {
      requests += 1;
      return { status: 401, ok: false };
    },
    refreshAuth: async () => false,
  });

  assert.equal(shouldRetryProtectedMedia(response.status), true);
  assert.equal(requests, 1);
});
