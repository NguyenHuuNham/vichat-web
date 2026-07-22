import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tinodeSdk from 'tinode-sdk';

const { Tinode } = tinodeSdk;
const here = path.dirname(fileURLToPath(import.meta.url));
const statePath = path.join(here, '.persistence-test.json');
const apiKey = process.env.TINODE_API_KEY || 'AQEAAAABAAD_rAp4DJh05a1HAwFT3A6K';
const host = process.env.TINODE_HOST || '127.0.0.1:6060';
const username = process.env.TINODE_TEST_USER || 'admin';
const password = process.env.TINODE_TEST_PASSWORD || '123456';

Tinode.setNetworkProviders(globalThis.WebSocket, undefined);
Tinode.setDatabaseProvider({
  deleteDatabase() {
    const request = {};
    queueMicrotask(() => request.onsuccess?.({ target: { result: true } }));
    return request;
  },
});

async function connect() {
  const client = new Tinode({
    appName: 'SONGHONG-PERSISTENCE-CHECK/1.0',
    host,
    apiKey,
    transport: 'ws',
    secure: false,
    platform: 'web',
    persist: false,
  });
  if (process.env.TINODE_TEST_DEBUG === 'true') client.enableLogging(true, true);
  await client.connect();
  await client.loginBasic(username, password);
  return client;
}

async function createTestMessage() {
  const client = await connect();
  try {
    const topic = client.getTopic(client.newGroupTopicName(false));
    await topic.subscribe(
      { desc: {}, data: { limit: 10 } },
      { desc: { public: { fn: 'Tinode persistence check' } } },
    );
    const content = `TINODE_PERSISTENCE_TEST_${new Date().toISOString()}`;
    const result = await topic.publish(content);
    const state = { topic: topic.name, content, seq: result?.params?.seq || null };
    await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ phase: 'created', ...state }));
  } finally {
    client.disconnect();
  }
}

async function verifyAndCleanup() {
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  const client = await connect();
  try {
    const topic = client.getTopic(state.topic);
    const query = topic.startMetaQuery().withDesc().withEarlierData(100).build();
    await topic.subscribe(query);
    await new Promise(resolve => setTimeout(resolve, 100));
    let found = false;
    topic.messages(message => {
      if (message?.content === state.content) found = true;
    });
    if (!found) throw new Error(`Message was not restored from Tinode topic ${state.topic}.`);
    await topic.delTopic(true);
    await fs.unlink(statePath);
    console.log(JSON.stringify({ phase: 'verified-after-restart', topic: state.topic, persisted: true }));
  } finally {
    client.disconnect();
  }
}

const phase = process.argv[2];
if (phase === 'create') {
  await createTestMessage();
} else if (phase === 'verify-cleanup') {
  await verifyAndCleanup();
} else {
  throw new Error('Use: node verify-persistence.mjs <create|verify-cleanup>');
}
