import tinodeSdk from 'tinode-sdk';

const { Tinode } = tinodeSdk;
const apiKey = process.env.TINODE_API_KEY || 'AQEAAAABAAD_rAp4DJh05a1HAwFT3A6K';
const host = process.env.TINODE_HOST || '127.0.0.1:6060';
const password = process.env.TINODE_TEST_PASSWORD || '123456';
const firstUsername = process.env.TINODE_TEST_USER || 'admin';
const secondUsername = process.env.TINODE_TEST_PEER || 'tuan';
const RECALL_EVENT_PREFIX = '__VICHAT_RECALL_EVENT__:';

Tinode.setNetworkProviders(globalThis.WebSocket, undefined);
Tinode.setDatabaseProvider({
  deleteDatabase() {
    const request = {};
    queueMicrotask(() => request.onsuccess?.({ target: { result: true } }));
    return request;
  },
});

function waitFor(label, setup, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeout} ms.`)), timeout);
    setup(value => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

async function connect(username) {
  const client = new Tinode({
    appName: 'SONGHONG-REALTIME-CHECK/1.0',
    host,
    apiKey,
    transport: 'ws',
    secure: false,
    platform: 'web',
    persist: false,
  });
  await client.connect();
  await client.loginBasic(username, password);
  return client;
}

const first = await connect(firstUsername);
const second = await connect(secondUsername);
let publishedSeq = 0;

try {
  const firstTopic = first.getTopic(second.getCurrentUserID());
  await firstTopic.subscribe(firstTopic.startMetaQuery().withDesc().withSub().withEarlierData(5).build());

  const secondTopic = second.getTopic(first.getCurrentUserID());
  await secondTopic.subscribe(secondTopic.startMetaQuery().withDesc().withSub().withEarlierData(5).build());

  const typingReceived = waitFor('typing notification', done => {
    secondTopic.onInfo = info => {
      if (info?.what === 'kp' && info.from === first.getCurrentUserID()) done(true);
    };
  });
  firstTopic.noteKeyPress();
  await typingReceived;

  const marker = `TINODE_REALTIME_TEST_${Date.now()}`;
  const dataReceived = waitFor('realtime data', done => {
    secondTopic.onData = message => {
      if (message?.content === marker) done(message);
    };
  });
  const publishResult = await firstTopic.publish(marker);
  publishedSeq = publishResult?.params?.seq || 0;
  const receivedMessage = await dataReceived;

  const readReceived = waitFor('read receipt', done => {
    firstTopic.onInfo = info => {
      if (info?.what === 'read' && info.from === second.getCurrentUserID() && info.seq >= publishedSeq) done(info);
    };
  });
  secondTopic.noteRead(receivedMessage.seq);
  await readReceived;

  const recallReceived = waitFor('recall event', done => {
    secondTopic.onData = message => {
      if (String(message?.content || '').startsWith(RECALL_EVENT_PREFIX)) done(true);
    };
  });
  await firstTopic.publish(`${RECALL_EVENT_PREFIX}${JSON.stringify({
    targetId: marker,
    targetSeq: publishedSeq,
    actorId: first.getCurrentUserID(),
    originalSenderId: first.getCurrentUserID(),
    originalCreatedAt: new Date().toISOString(),
  })}`);
  await recallReceived;
  await firstTopic.delMessagesList([publishedSeq], true).catch(() => {});

  console.log(JSON.stringify({
    realtime: true,
    typing: true,
    readReceipt: true,
    recall: true,
    sequence: publishedSeq,
    sender: firstUsername,
    recipient: secondUsername,
  }));
} finally {
  if (publishedSeq > 0) {
    const topic = first.getTopic(second.getCurrentUserID());
    await topic.delMessagesList([publishedSeq], true).catch(() => {});
  }
  first.disconnect();
  second.disconnect();
}
