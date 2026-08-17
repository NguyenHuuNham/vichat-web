import { describe, expect, it } from 'vitest';
import { httpStatusFromError, shouldRetryProtectedMedia } from './mediaRetryPolicy';

describe('protected media retry policy', () => {
  it('recognizes direct and native download status codes', () => {
    expect(httpStatusFromError({ status: 401 })).toBe(401);
    expect(httpStatusFromError(new Error('UnableToDownload: HTTP 403'))).toBe(403);
    expect(shouldRetryProtectedMedia({ statusCode: 500 })).toBe(false);
  });

  it('does not retry unrelated download failures', () => {
    expect(shouldRetryProtectedMedia(new Error('network unavailable'))).toBe(false);
  });
});
