import { describe, expect, it } from 'vitest';
import { conversationPreferenceStorageKey, normalizeConversationPreference } from './conversationPreferenceService';

describe('mobile conversation viewer preferences', () => {
  it('scopes storage by tenant and viewer', () => {
    expect(conversationPreferenceStorageKey('user/1', 'tenant/a')).not.toBe(conversationPreferenceStorageKey('user/1', 'tenant/b'));
  });

  it('normalizes unsupported local values safely', () => {
    expect(normalizeConversationPreference({ displayMode: 'broken', category: 'broken', hidden: 'yes' })).toEqual({
      displayMode: 'comfortable',
      category: '',
      hidden: false,
    });
  });
});
