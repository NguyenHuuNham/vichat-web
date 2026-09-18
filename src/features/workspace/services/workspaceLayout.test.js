import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../../../app/App.jsx', import.meta.url), 'utf8');
const workspaceStyles = readFileSync(new URL('../../../styles/index.css', import.meta.url), 'utf8');
const enterpriseStyles = readFileSync(new URL('../components/enterpriseWorkspace.css', import.meta.url), 'utf8');

test('keeps workspace sections in a shared modal over the active chat', () => {
  assert.match(workspaceStyles, /\.workspace-overlay\s*\{[\s\S]*position:\s*fixed;[\s\S]*backdrop-filter:\s*blur\(/);
  assert.match(workspaceStyles, /\.workspace-panel\s*\{[\s\S]*max-height:\s*min\(/);
  assert.doesNotMatch(workspaceStyles, /\.workspace-route-active \.sidebar-secondary/);
  assert.doesNotMatch(workspaceStyles, /\.workspace-route-active \.chat-main/);
  assert.doesNotMatch(workspaceStyles, /\.workspace-route-active \.sidebar-detail/);
  assert.match(appSource, /role="dialog" aria-modal="true" aria-labelledby="workspace-panel-title"/);
  assert.match(appSource, /data-workspace-panel=\{workspacePanel\}/);
});

test('keeps the enterprise workspace bounded inside the modal shell', () => {
  assert.match(enterpriseStyles, /\.enterprise-shell-panel\s*\{[\s\S]*display:\s*flex;[\s\S]*height:\s*min\([\s\S]*flex-direction:\s*column;/);
  assert.match(enterpriseStyles, /\.enterprise-shell-panel\s*>\s*\.enterprise-workspace\s*\{[\s\S]*height:\s*auto;[\s\S]*flex:\s*1 1 auto;/);
  assert.doesNotMatch(enterpriseStyles, /\.workspace-route-active \.enterprise-shell-panel/);
  assert.match(enterpriseStyles, /\.enterprise-workspace\s*\{[\s\S]*height:\s*auto;/);
});
