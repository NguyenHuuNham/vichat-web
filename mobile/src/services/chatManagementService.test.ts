import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('mobile Chatmgt pagination', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('uses the supported limit and follows directory cursors', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        objects: [{ id: 'employee-1', name: 'One', active: true }],
        next_cursor: 'directory-page-2',
      }))
      .mockResolvedValueOnce(jsonResponse({
        objects: [{ id: 'employee-2', name: 'Two', active: true }],
      }));

    const users = await chatManagementService.listUsers();
    const firstUrl = new URL(String(fetchMock.mock.calls[0][0]));
    const secondUrl = new URL(String(fetchMock.mock.calls[1][0]));

    expect(users.map(user => user.id)).toEqual(['employee-1', 'employee-2']);
    expect(firstUrl.searchParams.get('limit')).toBe('100');
    expect(firstUrl.searchParams.has('results_per_page')).toBe(false);
    expect(secondUrl.searchParams.get('cursor')).toBe('directory-page-2');
  });

  it('loads every conversation page so existing history is not hidden after login', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        objects: [{ id: 'conversation-1', subject: 'Old chat', tinode_topic: 'usr-old' }],
        next_cursor: 'conversation-page-2',
      }))
      .mockResolvedValueOnce(jsonResponse({
        objects: [{ id: 'conversation-2', subject: 'Group chat', tinode_topic: 'grp-old' }],
      }));

    const conversations = await chatManagementService.listConversations();

    expect(conversations.map(conversation => conversation.id)).toEqual(['conversation-1', 'conversation-2']);
    expect((fetchMock.mock.calls[0][0] as string)).toContain('/api/v1/conversation?');
    expect((fetchMock.mock.calls[1][0] as string)).toContain('cursor=conversation-page-2');
  });

  it('deduplicates records that point to the same Tinode topic', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({
      objects: [
        { id: 'conversation-old', subject: 'Old name', tinode_topic: 'usr-peer', updated_at: '2026-09-20T10:00:00Z' },
        { id: 'conversation-new', subject: 'Current name', tinode_topic: 'usr-peer', updated_at: '2026-09-21T10:00:00Z' },
      ],
    }));

    const conversations = await chatManagementService.listConversations();

    expect(conversations).toHaveLength(1);
    expect(conversations[0].id).toBe('conversation-new');
    expect(conversations[0].name).toBe('Current name');
  });
});
