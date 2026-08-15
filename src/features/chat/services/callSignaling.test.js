import test from 'node:test';
import assert from 'node:assert/strict';

import {
  callCapability,
  callHistoryLabel,
  extractCallInvite,
  formatCallDuration,
  isAnsweredElsewhereSignal,
  normalizeCallCandidate,
  normalizeCallDescription,
  normalizeCallPayload,
  normalizeIceServers,
  parseCallMessage,
  resolveCallsEnabled,
} from './callSignaling.js';

test('call feature stays hidden unless explicitly enabled', () => {
  assert.equal(resolveCallsEnabled(undefined), false);
  assert.equal(resolveCallsEnabled('false'), false);
  assert.equal(resolveCallsEnabled('true'), true);
  assert.equal(resolveCallsEnabled('ON'), true);
});

test('call capability requires authenticated P2P Tinode and ICE servers', () => {
  const iceServers = [{ urls: ['stun:chat.example:3478', 'turn:chat.example:3478'] }];
  const ready = callCapability({
    authenticated: true,
    topicName: 'usrPeer123',
    iceServers,
    browserSupported: true,
  });
  assert.equal(ready.available, true);

  assert.equal(callCapability({ authenticated: false, topicName: 'usrPeer123', iceServers, browserSupported: true }).available, false);
  assert.equal(callCapability({ authenticated: true, topicName: 'grp123', isGroup: true, iceServers, browserSupported: true }).available, false);
  assert.equal(callCapability({ authenticated: true, topicName: 'usrPeer123', isChatbot: true, iceServers, browserSupported: true }).available, false);
  assert.equal(callCapability({ authenticated: true, topicName: 'usrPeer123', iceServers: [], browserSupported: true }).available, false);
  assert.equal(callCapability({ authenticated: true, topicName: 'usrPeer123', iceServers, browserSupported: false }).available, false);
  assert.equal(callCapability({ authenticated: true, topicName: 'invalid', iceServers, browserSupported: true }).available, false);
});

test('normalizes only valid STUN and TURN server entries', () => {
  const input = [
    null,
    { urls: 'https://invalid.example' },
    { urls: 'stun:chat.example:3478' },
    { urls: [' turn:chat.example:3478?transport=udp ', 'https://invalid.example'] },
  ];
  assert.deepEqual(normalizeIceServers(input), [
    { urls: 'stun:chat.example:3478' },
    { urls: ['turn:chat.example:3478?transport=udp'] },
  ]);
  assert.equal(input[3].urls[0], ' turn:chat.example:3478?transport=udp ');
});

test('normalizes relayed WebRTC payloads from object and JSON-string forms', () => {
  const offer = { type: 'offer', sdp: 'v=0\r\n' };
  assert.deepEqual(normalizeCallPayload(JSON.stringify(offer)), offer);
  assert.deepEqual(normalizeCallPayload({ payload: JSON.stringify(offer) }), offer);
  assert.deepEqual(normalizeCallDescription(JSON.stringify(offer), 'offer'), offer);
  assert.deepEqual(normalizeCallDescription('v=0\r\n', 'answer'), { type: 'answer', sdp: 'v=0\r\n' });

  const candidate = { candidate: 'candidate:1 1 udp 1 192.0.2.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 };
  assert.deepEqual(normalizeCallCandidate(JSON.stringify({ candidate })), candidate);
  assert.equal(normalizeCallDescription({ type: 'offer' }, 'offer'), null);
});

test('only closes an incoming overlay for an accept echoed from another session', () => {
  const event = { viaMe: true, from: 'usrMe', event: 'accept' };
  assert.equal(isAnsweredElsewhereSignal(event, 'incoming', 'usrMe'), true);
  assert.equal(isAnsweredElsewhereSignal(event, 'outgoing', 'usrMe'), false);
  assert.equal(isAnsweredElsewhereSignal({ ...event, viaMe: false }, 'incoming', 'usrMe'), false);
});

test('accepts only a fresh incoming P2P call invite', () => {
  const invite = {
    topic: 'usrPeer123',
    seq: 42,
    from: 'usrPeer123',
    head: { webrtc: 'started', aonly: true },
  };
  assert.deepEqual(extractCallInvite(invite, 'usrMe', invite), {
    topic: 'usrPeer123',
    seq: 42,
    from: 'usrPeer123',
    audioOnly: true,
  });
  assert.equal(extractCallInvite(invite, 'usrPeer123', invite), null);
  assert.equal(extractCallInvite(invite, 'usrMe', { ...invite, head: { webrtc: 'missed' } }), null);
  assert.equal(extractCallInvite({ ...invite, topic: 'grpRoom' }, 'usrMe', invite), null);
});

test('parses call history and formats duration without changing normal messages', () => {
  const call = parseCallMessage({
    ent: [{ tp: 'VC', data: { aonly: false, state: 'accepted', duration: 65000, incoming: true } }],
  });
  assert.deepEqual(call, {
    audioOnly: false,
    state: 'accepted',
    duration: 65000,
    incoming: true,
  });
  assert.equal(formatCallDuration(65000), '01:05');
  assert.equal(callHistoryLabel(call, false), 'Cuộc gọi đến - 01:05');
  assert.equal(parseCallMessage({ txt: 'hello' }), null);
});

test('renders terminal and unanswered call states consistently', () => {
  assert.equal(callHistoryLabel({ state: 'busy' }, true), 'Cuộc gọi đi - Máy bận');
  assert.equal(callHistoryLabel({ state: 'declined' }, false), 'Cuộc gọi đến - Đã từ chối');
  assert.equal(callHistoryLabel({ state: 'missed' }, false), 'Cuộc gọi nhỡ');
  assert.equal(callHistoryLabel({ state: 'missed' }, true), 'Cuộc gọi đã hủy');
  assert.equal(callHistoryLabel({ state: 'disconnected' }, true), 'Cuộc gọi đi - Mất kết nối');
  assert.deepEqual(parseCallMessage({ ent: [{ tp: 'VC', data: { aonly: true, state: 'finished' } }] }, { 'webrtc-duration': 1250 }), {
    audioOnly: true,
    state: 'finished',
    duration: 1250,
    incoming: false,
  });
});
