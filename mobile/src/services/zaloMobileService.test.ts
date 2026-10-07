import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as any).__DEV__ = false;

vi.mock('./authService', () => ({
  normalizeUser: (account: any) => ({
    ...account,
    id: String(account?.id || ''),
    uid: String(account?.uid || account?.id || ''),
    name: String(account?.name || ''),
    active: account?.active !== false,
    tenantId: String(account?.tenantId || account?.tenant_id || ''),
  }),
}));

import { chatManagementService } from './chatManagementService';

const originalFetch = globalThis.fetch;

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe('mobile Zalo OA omnichannel integration', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends Zalo message through the dedicated CS API endpoint', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({
      status: 'success',
      message_id: 'cs_msg_123',
    }));

    const result = await chatManagementService.sendZaloMessage('zalo_user_1', 'Xin chào khách hàng', 'oa_1', 'CSKH');
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toContain('/api/v1/zalo/send_message');
    expect(request.method).toBe('POST');
    expect(JSON.parse(String(request.body))).toEqual({
      user_id: 'zalo_user_1',
      message: 'Xin chào khách hàng',
      oa_id: 'oa_1',
      agent_name: 'CSKH',
    });
    expect(result).toEqual({ status: 'success', message_id: 'cs_msg_123' });
  });

  it('retrieves Zalo conversation message history', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const messages = [
      { id: 'm1', text: 'Chào shop', sender: 'incoming' },
      { id: 'm2', text: 'Shop đây ạ', sender: 'outgoing' },
    ];
    fetchMock.mockResolvedValueOnce(jsonResponse({
      status: 'success',
      messages,
    }));

    const fetched = await chatManagementService.getZaloMessages('zalo:oa_1:zalo_user_1');
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toContain('/api/v1/zalo/conversations/zalo%3Aoa_1%3Azalo_user_1/messages');
    expect(fetched).toEqual(messages);
  });
});
