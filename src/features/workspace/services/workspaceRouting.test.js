import test from 'node:test';
import assert from 'node:assert/strict';
import { workspacePanelFromPath, workspacePathForPanel } from './workspaceRouting.js';

test('maps workspace panels to browser-friendly paths', () => {
  assert.equal(workspacePathForPanel('contacts'), '/friends');
  assert.equal(workspacePathForPanel('settings'), '/settings');
  assert.equal(workspacePathForPanel('enterprise'), '/work');
  assert.equal(workspacePathForPanel('cloud'), '/my-cloud');
  assert.equal(workspacePathForPanel(null), '/chat');
});

test('resolves known paths and treats chat/root as the conversation surface', () => {
  assert.equal(workspacePanelFromPath('/friends'), 'contacts');
  assert.equal(workspacePanelFromPath('/settings/'), 'settings');
  assert.equal(workspacePanelFromPath('/work'), 'enterprise');
  assert.equal(workspacePanelFromPath('/my-cloud'), 'cloud');
  assert.equal(workspacePanelFromPath('/chat'), null);
  assert.equal(workspacePanelFromPath('/'), null);
  assert.equal(workspacePanelFromPath('/unknown'), null);
});
