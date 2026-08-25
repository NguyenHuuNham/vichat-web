import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_GROUP_SETTINGS,
  GROUP_INFO_PERMISSION_MESSAGE,
  groupInfoErrorMessage,
  groupSettingEnabled,
  isGroupInfoPermissionError,
  normalizeGroupSettings,
} from './groupSettings.js';

test('group settings use safe defaults and ignore unknown values', () => {
  assert.deepEqual(normalizeGroupSettings({
    allowMessages: false,
    allowPolls: false,
    unknown: true,
  }), {
    ...DEFAULT_GROUP_SETTINGS,
    allowMessages: false,
    allowPolls: false,
  });
  for (const removedKey of ['allowNotes', 'allowReminders', 'markOwnerMessages']) {
    assert.equal(Object.hasOwn(DEFAULT_GROUP_SETTINGS, removedKey), false);
    assert.equal(Object.hasOwn(normalizeGroupSettings({ [removedKey]: true }), removedKey), false);
  }
});

test('group setting lookup is boolean and default-safe', () => {
  assert.equal(groupSettingEnabled({ allowPinMessages: false }, 'allowPinMessages'), false);
  assert.equal(groupSettingEnabled({}, 'allowMessages'), true);
  assert.equal(groupSettingEnabled({ allowPolls: false }, 'allowPolls'), false);
  assert.equal(groupSettingEnabled({}, 'allowPolls'), true);
  assert.equal(groupSettingEnabled({}, 'unknown'), false);
});

test('group info permission failures never expose a raw 403 to the UI', () => {
  for (const error of [
    { status: 403, message: 'Administrator permission is required.' },
    { code: 403 },
    { code: 'HTTP_403' },
    { code: 'FORBIDDEN', message: 'Forbidden' },
    { code: 'GROUP_INFO_PERMISSION_REQUIRED', message: 'Denied' },
    new Error('permission denied (403)'),
  ]) {
    assert.equal(isGroupInfoPermissionError(error), true);
    assert.equal(groupInfoErrorMessage(error, 'Fallback'), GROUP_INFO_PERMISSION_MESSAGE);
  }
  assert.equal(groupInfoErrorMessage(new Error('Network unavailable'), 'Fallback'), 'Network unavailable');
  assert.equal(groupInfoErrorMessage(null, 'Fallback'), 'Fallback');
});
