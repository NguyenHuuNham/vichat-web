import test from 'node:test';
import assert from 'node:assert/strict';
import { startBrowserPresence } from './browserPresence.js';
import { updateAccountPresence } from '../../contacts/services/accountDirectory.js';
import { formatOfflineDuration } from './timeFormatting.js';

import {
  buildDirectoryPresenceBatches,
  directoryPresenceTerms,
  presenceSnapshotFromDiscovery,
} from './directoryPresence.js';

function browserPresenceHarness({ visibility = 'visible', heartbeat, clearPresence } = {}) {
  const documentTarget = new EventTarget();
  documentTarget.visibilityState = visibility;
  const windowTarget = new EventTarget();
  const intervals = new Map();
  windowTarget.setInterval = (callback, delay) => {
    intervals.set(callback, delay);
    return callback;
  };
  windowTarget.clearInterval = callback => intervals.delete(callback);
  const heartbeats = [];
  const departures = [];
  const snapshots = [];
  let currentSession = true;
  const stop = startBrowserPresence({
    documentTarget,
    windowTarget,
    isCurrentSession: () => currentSession,
    heartbeat: () => {
      heartbeats.push(true);
      return heartbeat ? heartbeat() : Promise.resolve({ presence: {} });
    },
    clearPresence: options => {
      departures.push(options);
      return clearPresence ? clearPresence(options) : Promise.resolve();
    },
    applySnapshot: payload => snapshots.push(payload),
  });
  return {
    heartbeats, departures, snapshots, intervals, stop,
    changeSession: () => { currentSession = false; },
    tick: () => { intervals.forEach((_delay, callback) => callback()); },
    pageEvent: name => windowTarget.dispatchEvent(new Event(name)),
    visibility: value => {
      documentTarget.visibilityState = value;
      documentTarget.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

const flushPresence = () => new Promise(resolve => setImmediate(resolve));

test('browser presence polls visible tabs and records departure only once when leaving', async context => {
  const browser = browserPresenceHarness();
  context.after(browser.stop);
  await flushPresence();
  assert.equal(browser.heartbeats.length, 1);
  assert.deepEqual([...browser.intervals.values()], [2000]);
  browser.tick();
  await flushPresence();
  assert.equal(browser.heartbeats.length, 2);
  browser.visibility('hidden');
  browser.pageEvent('pagehide');
  browser.tick();
  browser.pageEvent('focus');
  await flushPresence();
  assert.deepEqual(browser.departures, [{ keepalive: true }]);
  assert.equal(browser.heartbeats.length, 2);
  browser.visibility('visible');
  await flushPresence();
  assert.equal(browser.heartbeats.length, 3);
});

test('restoring a hidden tab never creates activity until it becomes visible', async context => {
  const browser = browserPresenceHarness({ visibility: 'hidden' });
  context.after(browser.stop);
  browser.tick();
  browser.pageEvent('pageshow');
  browser.pageEvent('focus');
  browser.pageEvent('pagehide');
  await flushPresence();
  assert.equal(browser.heartbeats.length, 0);
  assert.equal(browser.departures.length, 0);
  browser.visibility('visible');
  await flushPresence();
  assert.equal(browser.heartbeats.length, 1);
});

test('pagehide stops polling even before hidden visibility and pageshow resumes it', async context => {
  const browser = browserPresenceHarness();
  context.after(browser.stop);
  await flushPresence();
  browser.pageEvent('pagehide');
  browser.tick();
  await flushPresence();
  assert.equal(browser.heartbeats.length, 1);
  assert.equal(browser.departures.length, 1);
  browser.pageEvent('pageshow');
  await flushPresence();
  assert.equal(browser.heartbeats.length, 2);
});

test('late heartbeat responses cannot repaint departure or block a resumed tab', async context => {
  const resolvers = [];
  const browser = browserPresenceHarness({ heartbeat: () => new Promise(resolve => resolvers.push(resolve)) });
  context.after(browser.stop);
  browser.tick();
  assert.equal(browser.heartbeats.length, 1);
  browser.visibility('hidden');
  browser.visibility('visible');
  assert.equal(browser.heartbeats.length, 2);
  resolvers[0]({ generation: 'old' });
  await flushPresence();
  assert.deepEqual(browser.snapshots, []);
  browser.tick();
  assert.equal(browser.heartbeats.length, 2);
  resolvers[1]({ generation: 'current' });
  await flushPresence();
  assert.deepEqual(browser.snapshots, [{ generation: 'current' }]);
});

test('late heartbeat response after hiding is ignored', async context => {
  let resolveHeartbeat;
  const browser = browserPresenceHarness({ heartbeat: () => new Promise(resolve => { resolveHeartbeat = resolve; }) });
  context.after(browser.stop);
  browser.visibility('hidden');
  resolveHeartbeat({ presence: { account: true } });
  await flushPresence();
  assert.deepEqual(browser.snapshots, []);
  browser.tick();
  assert.equal(browser.heartbeats.length, 1);
});

test('presence failures stay isolated and do not stop later heartbeats', async context => {
  const browser = browserPresenceHarness({
    heartbeat: () => Promise.reject(new Error('presence unavailable')),
    clearPresence: () => Promise.reject(new Error('offline unavailable')),
  });
  context.after(browser.stop);
  await flushPresence();
  browser.tick();
  await flushPresence();
  browser.visibility('hidden');
  await flushPresence();
  browser.visibility('visible');
  await flushPresence();
  assert.equal(browser.heartbeats.length, 3);
  assert.equal(browser.departures.length, 1);
  assert.deepEqual(browser.snapshots, []);
});

test('old account or tenant sessions cannot publish snapshots or clear new presence', async context => {
  let resolveHeartbeat;
  const browser = browserPresenceHarness({ heartbeat: () => new Promise(resolve => { resolveHeartbeat = resolve; }) });
  context.after(browser.stop);
  browser.changeSession();
  resolveHeartbeat({ presence: { oldAccount: true } });
  await flushPresence();
  browser.tick();
  browser.visibility('hidden');
  browser.visibility('visible');
  assert.equal(browser.heartbeats.length, 1);
  assert.deepEqual(browser.snapshots, []);
  assert.deepEqual(browser.departures, []);
});

test('effect cleanup detaches lifecycle listeners without marking an active tab offline', async () => {
  let resolveHeartbeat;
  const browser = browserPresenceHarness({ heartbeat: () => new Promise(resolve => { resolveHeartbeat = resolve; }) });
  browser.stop();
  resolveHeartbeat({ presence: {} });
  await flushPresence();
  browser.visibility('hidden');
  browser.pageEvent('pagehide');
  browser.visibility('visible');
  browser.pageEvent('pageshow');
  browser.pageEvent('focus');
  browser.tick();
  assert.equal(browser.intervals.size, 0);
  assert.equal(browser.heartbeats.length, 1);
  assert.deepEqual(browser.snapshots, []);
  assert.deepEqual(browser.departures, []);
});

test('observing offline contacts never changes a departure from days ago into recent activity', () => {
  const lastSeenAt = '2026-09-03T03:00:00.000Z';
  const now = Date.parse('2026-09-06T04:00:00.000Z');
  const accounts = [
    { id: 'account-old', tinodeUid: 'usr-old', online: true, lastSeenAt },
    { id: 'account-unknown', tinodeUid: 'usr-unknown', online: true },
  ];
  const offline = updateAccountPresence(accounts, { 'usr-old': false, 'usr-unknown': false }, { id: 'viewer' });
  assert.equal(offline[0].lastSeenAt, lastSeenAt);
  assert.equal(formatOfflineDuration(offline[0].lastSeenAt, now, 'en-US'), '3 days ago');
  assert.equal(formatOfflineDuration(offline[1].lastSeenAt, now, 'en-US'), '');
  assert.strictEqual(updateAccountPresence(offline, { 'usr-old': false }, { id: 'viewer' }), offline);
});

test('directory presence uses the deterministic Tinode username before public identity fields', () => {
  const terms = directoryPresenceTerms({
    tinodeUsername: 'upgo_abc123',
    username: 'employee@example.com',
    email: 'employee@example.com',
  });

  assert.deepEqual(terms.slice(0, 2), ['basic:upgo_abc123', 'upgo_abc123']);
  assert.ok(terms.includes('email:employee@example.com'));
  assert.ok(!terms.includes('basic:employee@example.com'));
});

test('presence discovery batches are bounded and keep every known UID', () => {
  const accounts = Array.from({ length: 5 }, (_, index) => ({
    id: `account-${index}`,
    tinodeUid: `usr-${index}`,
    tinodeUsername: `upgo_${index}`,
  }));

  const batches = buildDirectoryPresenceBatches(accounts, {
    maxQueryLength: 36,
    maxAccountsPerQuery: 2,
  });

  assert.ok(batches.length > 1);
  assert.ok(batches.every(batch => batch.query.length <= 36));
  assert.deepEqual(
    batches.flatMap(batch => batch.uids).sort(),
    accounts.map(account => account.tinodeUid).sort(),
  );
});

test('discovery presence filters foreign users and keeps explicit offline states', () => {
  const accounts = [
    { tinodeUid: 'usr-OnLineA', active: true },
    { tinodeUid: 'usr-offline', active: true },
    { tinodeUid: 'usr-disabled', active: false },
  ];
  const result = presenceSnapshotFromDiscovery(accounts, [
    { user: 'usr-OnLineA', online: true },
    { user: 'usr-offline', online: false },
    { user: 'usr-foreign', online: true },
  ], ['usr-online', 'usr-offline']);

  assert.deepEqual(result, {
    'usr-OnLineA': true,
    'usr-offline': false,
  });
});
