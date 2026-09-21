#!/usr/bin/env node

const DEFAULT_WS = 'wss://chat.gonplatform.com/v0/channels';
const wsUrl = process.env.VICHAT_TINODE_WS || DEFAULT_WS;
const senderToken = String(process.env.VICHAT_TINODE_TOKEN || '').trim();
const observerToken = String(process.env.VICHAT_TINODE_PEER_TOKEN || senderToken).trim();
const topic = String(process.env.VICHAT_TINODE_TOPIC || '').trim();
const shouldPublish = process.env.VICHAT_CALL_DEBUG_PUBLISH === 'true';
const timeoutMs = Number(process.env.VICHAT_CALL_DEBUG_TIMEOUT_MS || 12000);

function redactedIceServers(value) {
  return Array.isArray(value) ? value.map(server => ({
    ...server,
    username: server?.username ? '<redacted>' : server?.username,
    credential: server?.credential ? '<redacted>' : server?.credential,
  })) : value;
}

function send(socket, packet) {
  socket.send(JSON.stringify(packet));
}

function callDraft(audioOnly = false) {
  return {
    txt: ' ',
    fmt: [{ at: 0, len: 1, key: 0 }],
    ent: [{ tp: 'VC', data: { aonly: Boolean(audioOnly) } }],
  };
}

let completed = false;
let helloPrinted = false;
let publishStarted = false;
let publishedSeq = 0;
let inviteObserved = false;
let signalObserved = false;
const sockets = new Set();
const sessions = new Map();
let timer = null;

function closeAll() {
  for (const socket of sockets) {
    try { socket.close(); } catch { /* already closed */ }
  }
}

function finish(result) {
  if (completed) return;
  completed = true;
  if (timer) clearTimeout(timer);
  if (result) console.log(JSON.stringify(result, null, 2));
  closeAll();
}

function fail(message) {
  if (completed) return;
  console.error(`[call-debug] ${message}`);
  process.exitCode = 1;
  finish();
}

if (shouldPublish && (!senderToken || !observerToken || !/^usr[a-z0-9_-]+$/i.test(topic))) {
  console.error('[call-debug] Publishing requires VICHAT_TINODE_TOKEN and a valid VICHAT_TINODE_TOPIC. VICHAT_TINODE_PEER_TOKEN is optional and defaults to a second session for the sender token.');
  process.exitCode = 1;
  process.exit();
}

timer = setTimeout(() => {
  fail(shouldPublish
    ? 'Timed out before both the call invite and note.what=call signal were observed.'
    : 'Timed out waiting for Tinode hello response.');
}, timeoutMs);

function allSubscribed() {
  if (!shouldPublish) return false;
  return ['sender', 'observer'].every(role => {
    const session = sessions.get(role);
    return session?.topicReady && session?.meReady;
  });
}

function publishInvite() {
  if (publishStarted || !allSubscribed()) return;
  publishStarted = true;
  const sender = sessions.get('sender');
  send(sender.socket, {
    pub: {
      id: 'sender-publish',
      topic,
      noecho: false,
      head: {
        mime: 'text/x-drafty',
        webrtc: 'started',
        aonly: true,
        'x-client-id': `call-debug-${Date.now()}`,
      },
      content: callDraft(true),
    },
  });
}

function sendCallNote(seq) {
  const observer = sessions.get('observer');
  if (!observer || observer.noteSent || !seq) return;
  observer.noteSent = true;
  send(observer.socket, {
    note: {
      topic,
      what: 'call',
      seq: Number(seq),
      event: 'ringing',
      payload: { diagnostic: true },
    },
  });
}

function handlePacket(role, packet) {
  const session = sessions.get(role);
  if (!session) return;

  if (packet.ctrl?.id === `${role}-hello`) {
    const iceServers = packet.ctrl?.params?.iceServers || [];
    if (!helloPrinted && role === 'sender') {
      helloPrinted = true;
      console.log(JSON.stringify({
        helloCode: packet.ctrl?.code,
        webrtcEnabled: iceServers.length > 0,
        iceServers: redactedIceServers(iceServers),
      }, null, 2));
    }
    if (!shouldPublish) {
      finish();
      return;
    }
    if (Number(packet.ctrl?.code) < 200 || Number(packet.ctrl?.code) >= 300) {
      fail(`${role} hello failed with code ${packet.ctrl?.code || 'unknown'}.`);
      return;
    }
    send(session.socket, { login: { id: `${role}-login`, scheme: 'token', secret: session.token } });
    return;
  }

  if (packet.ctrl?.id === `${role}-login`) {
    if (Number(packet.ctrl?.code) < 200 || Number(packet.ctrl?.code) >= 300) {
      fail(`${role} token login failed with code ${packet.ctrl?.code || 'unknown'}.`);
      return;
    }
    send(session.socket, {
      sub: { id: `${role}-topic-sub`, topic, get: { what: 'desc sub data', data: { limit: 1 } } },
    });
    send(session.socket, {
      sub: { id: `${role}-me-sub`, topic: 'me', get: { what: 'desc sub' } },
    });
    return;
  }

  if (packet.ctrl?.id === `${role}-topic-sub`) {
    if (Number(packet.ctrl?.code) < 200 || Number(packet.ctrl?.code) >= 300) {
      fail(`${role} could not subscribe to ${topic}.`);
      return;
    }
    session.topicReady = true;
    publishInvite();
    return;
  }

  if (packet.ctrl?.id === `${role}-me-sub`) {
    if (Number(packet.ctrl?.code) < 200 || Number(packet.ctrl?.code) >= 300) {
      fail(`${role} could not subscribe to the Tinode me topic.`);
      return;
    }
    session.meReady = true;
    publishInvite();
    return;
  }

  if (packet.ctrl?.id === 'sender-publish') {
    publishedSeq = Number(packet.ctrl?.params?.seq) || 0;
    if (!publishedSeq) {
      fail('Tinode did not acknowledge the diagnostic video-call message.');
      return;
    }
    if (inviteObserved) sendCallNote(publishedSeq);
    return;
  }

  if (role === 'observer' && packet.data?.topic === topic && packet.data?.head?.webrtc === 'started') {
    const seq = Number(packet.data.seq) || 0;
    if (!seq) return;
    inviteObserved = true;
    sendCallNote(publishedSeq || seq);
    return;
  }

  const info = packet.info;
  const infoTopic = String(info?.src || info?.topic || '');
  if (role === 'sender' && info?.what === 'call' && info?.event === 'ringing'
      && infoTopic === topic && (!publishedSeq || Number(info.seq) === publishedSeq)) {
    signalObserved = true;
    finish({
      authenticated: true,
      observerMode: process.env.VICHAT_TINODE_PEER_TOKEN ? 'peer-token' : 'same-account-second-session',
      inviteEvent: inviteObserved ? { topic, seq: Number(info.seq), webrtc: 'started' } : null,
      callSignalEvent: { topic, seq: Number(info.seq), what: info.what, event: info.event },
      signalingVerified: inviteObserved && signalObserved,
    });
  }
}

function openSession(role, token = '') {
  console.log(`[call-debug] connecting ${role} to ${wsUrl}`);
  const socket = new WebSocket(wsUrl);
  const session = { role, token, socket, topicReady: false, meReady: false, noteSent: false };
  sessions.set(role, session);
  sockets.add(socket);

  socket.addEventListener('open', () => {
    send(socket, {
      hi: {
        id: `${role}-hello`,
        ver: '0.25.3',
        ua: 'vichat-call-debug/1.1',
        lang: 'en',
      },
    });
  });
  socket.addEventListener('message', event => {
    let packet;
    try { packet = JSON.parse(String(event.data)); } catch { return; }
    handlePacket(role, packet);
  });
  socket.addEventListener('error', () => fail(`${role} WebSocket connection failed.`));
  socket.addEventListener('close', () => sockets.delete(socket));
}

openSession('sender', senderToken);
if (shouldPublish) openSession('observer', observerToken);
