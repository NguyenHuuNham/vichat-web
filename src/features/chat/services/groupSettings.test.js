import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_GROUP_SETTINGS,
  groupSettingEnabled,
  normalizeGroupSettings,
} from './groupSettings.js';

test('group settings use safe defaults and ignore unknown values', () => {
  assert.deepEqual(normalizeGroupSettings({
    allowMessages: false,
    allowPolls: 'yes',
    unknown: true,
  }), {
    ...DEFAULT_GROUP_SETTINGS,
    allowMessages: false,
  });
});

test('group setting lookup is boolean and default-safe', () => {
  assert.equal(groupSettingEnabled({ allowPinMessages: false }, 'allowPinMessages'), false);
  assert.equal(groupSettingEnabled({}, 'allowMessages'), true);
  assert.equal(groupSettingEnabled({}, 'unknown'), false);
});
