import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CHATBOT_ACCOUNT,
  CHATBOT_STARTER_PROMPTS,
  applyTinodeChatbotConfig,
  chatbotMessageCorrelationKey,
  mergeChatbotMessages,
} from './chatbotService.js';

const appSource = readFileSync(new URL('../../../app/App.jsx', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('./chatbotService.js', import.meta.url), 'utf8');
const tinodeClientSource = readFileSync(new URL('../../chat/services/tinodeClient.js', import.meta.url), 'utf8');
const productionBuildSource = readFileSync(new URL('../../../../scripts/build-production.mjs', import.meta.url), 'utf8');


test('Tinode chatbot config keeps the synthetic UI id and assigns the runtime topic', () => {
  const original = { ...CHATBOT_ACCOUNT };

  assert.equal(applyTinodeChatbotConfig({
    enabled: true,
    tinodeUid: 'usrBotRuntime',
    name: 'GON AI',
    title: 'Tro ly cong ty',
    organization: 'GON Platform',
    avatar: '/bot.svg',
  }), true);
  assert.equal(CHATBOT_ACCOUNT.id, original.id);
  assert.equal(CHATBOT_ACCOUNT.tinodeUid, 'usrBotRuntime');
  assert.equal(CHATBOT_ACCOUNT.name, 'GON AI');

  assert.equal(applyTinodeChatbotConfig({ enabled: false }), false);
  assert.equal(CHATBOT_ACCOUNT.tinodeUid, '');
  Object.assign(CHATBOT_ACCOUNT, original);
});

test('ViChat AI defaults use the new product identity and useful starter prompts', () => {
  assert.equal(CHATBOT_ACCOUNT.id, 'vichat-ai');
  assert.equal(CHATBOT_ACCOUNT.name, 'ViChat AI');
  assert.equal(CHATBOT_ACCOUNT.avatar, '/vichat-ai.svg');
  assert.equal(CHATBOT_STARTER_PROMPTS.length, 3);
  assert.ok(CHATBOT_STARTER_PROMPTS.every(item => item.title && item.prompt));
});

test('ViChat AI UI and fallback request do not expose knowledge management or RAG selection', () => {
  assert.equal(appSource.includes('KnowledgeManager'), false);
  assert.equal(appSource.includes('Tri thức AI'), false);
  assert.equal(appSource.includes("openWorkspacePanel('knowledge')"), false);
  assert.equal(serviceSource.includes('VITE_CHATBOT_KNOWLEDGE_BASE_ID'), false);
  assert.equal(serviceSource.includes('knowledge_base_id: KNOWLEDGE_BASE_ID'), false);
  assert.equal(serviceSource.includes('listKnowledgeBases'), false);
  assert.equal(serviceSource.includes('uploadKnowledgeDocument'), false);
});

test('production build keeps the ViChat AI identity instead of legacy external defaults', () => {
  assert.match(productionBuildSource, /VITE_CHATBOT_ID: 'vichat-ai'/);
  assert.match(productionBuildSource, /VITE_CHATBOT_DISPLAY_NAME: 'ViChat AI'/);
  assert.match(productionBuildSource, /VITE_CHATBOT_DISPLAY_AVATAR: '\/vichat-ai\.svg'/);
  assert.equal(productionBuildSource.includes("VITE_CHATBOT_DISPLAY_NAME: 'External AI'"), false);
});

test('fallback storage can read the legacy bot conversation after the rename', () => {
  assert.match(serviceSource, /vichat\.chatbot\.bot-songhong\.messages\./);
  assert.match(serviceSource, /LEGACY_STORAGE_PREFIXES/);
  assert.match(serviceSource, /mergeChatbotMessages\(current, \.\.\.legacySources\)/);
});

test('merges legacy and Tinode history without duplicating the same message', () => {
  const legacy = {
    id: 'legacy-1',
    sender: 'outgoing',
    text: 'Leave policy?',
    createdAt: '2026-08-19T10:00:01.000Z',
  };
  const tinodeCopy = {
    id: 'tinode-1',
    sender: 'outgoing',
    text: 'Leave policy?',
    createdAt: '2026-08-19T10:00:03.000Z',
  };

  const result = mergeChatbotMessages([legacy], [tinodeCopy, {
    id: 'tinode-2',
    sender: 'incoming',
    text: 'I will check the approved source.',
    createdAt: '2026-08-19T10:00:04.000Z',
  }]);

  assert.deepEqual(result.map(message => message.id), ['legacy-1', 'tinode-2']);
});

test('builds the same direct correlation key from either Tinode participant perspective', () => {
  const browserKey = chatbotMessageCorrelationKey({
    role: 'assistant',
    topic: 'usrBot',
    counterpartTopic: 'usrViewer',
    sourceSequence: 42,
  });
  const workerKey = chatbotMessageCorrelationKey({
    role: 'assistant',
    topic: 'usrViewer',
    counterpartTopic: 'usrBot',
    sourceSequence: 42,
  });

  assert.equal(browserKey, workerKey);
  assert.equal(browserKey, 'direct:usrBot~usrViewer|assistant:42');
});

test('reconciles correlated Chatmgt and Tinode assistant copies without losing realtime metadata', () => {
  const correlationKey = chatbotMessageCorrelationKey({
    role: 'assistant',
    topic: 'usrViewer',
    counterpartTopic: 'usrBot',
    sourceSequence: 18,
  });
  const historyCopy = {
    id: 'history-assistant-18',
    sender: 'incoming',
    senderId: CHATBOT_ACCOUNT.id,
    senderName: CHATBOT_ACCOUNT.name,
    avatar: '/vichat-ai.svg',
    text: 'Use the approved leave form.',
    createdAt: '2026-09-04T08:00:00.000Z',
    correlationKey,
    chatbotTopic: 'usrViewer',
    chatbotCounterpartTopic: 'usrBot',
    chatbotSourceSequence: 18,
    grounded: true,
    sources: [{ title: 'Leave policy', snippet: 'Approved form and routing details.' }],
  };
  const tinodeCopy = {
    id: 'usrBot-19',
    seq: 19,
    sender: 'incoming',
    senderId: 'usrBot',
    text: 'Use the approved leave form.',
    createdAt: '2026-09-04T08:00:14.000Z',
    correlationKey,
    chatbotTopic: 'usrBot',
    chatbotCounterpartTopic: 'usrViewer',
    chatbotSourceSequence: 18,
    pending: false,
    deliveryStatus: 'received',
    raw: { seq: 19 },
  };

  const result = mergeChatbotMessages([historyCopy], [tinodeCopy]);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, historyCopy.id);
  assert.equal(result[0].seq, 19);
  assert.equal(result[0].pending, false);
  assert.equal(result[0].deliveryStatus, 'received');
  assert.deepEqual(result[0].raw, { seq: 19 });
  assert.equal(result[0].grounded, true);
  assert.deepEqual(result[0].sources, historyCopy.sources);
  assert.equal(result[0].senderName, CHATBOT_ACCOUNT.name);
  assert.equal(result[0].avatar, '/vichat-ai.svg');
});

test('does not correlate identical source sequences from different chatbot topics', () => {
  const first = {
    id: 'group-a-answer',
    sender: 'incoming',
    text: 'The same answer',
    createdAt: '2026-09-04T08:00:00.000Z',
    correlationKey: chatbotMessageCorrelationKey({
      role: 'assistant',
      topic: 'grpAlpha',
      sourceSequence: 7,
    }),
  };
  const second = {
    id: 'group-b-answer',
    sender: 'incoming',
    text: 'The same answer',
    createdAt: '2026-09-04T08:00:01.000Z',
    correlationKey: chatbotMessageCorrelationKey({
      role: 'assistant',
      topic: 'grpBeta',
      sourceSequence: 7,
    }),
  };

  assert.deepEqual(
    mergeChatbotMessages([first], [second]).map(message => message.id),
    ['group-a-answer', 'group-b-answer'],
  );
});

test('keeps repeated chatbot messages when their authoritative sequences differ', () => {
  const first = {
    id: 'question-41',
    sender: 'outgoing',
    text: 'Please check this policy.',
    createdAt: '2026-09-04T08:00:00.000Z',
    correlationKey: chatbotMessageCorrelationKey({
      role: 'user',
      topic: 'usrBot',
      counterpartTopic: 'usrViewer',
      sequence: 41,
    }),
  };
  const second = {
    id: 'question-42',
    sender: 'outgoing',
    text: 'Please check this policy.',
    createdAt: '2026-09-04T08:00:01.000Z',
    correlationKey: chatbotMessageCorrelationKey({
      role: 'user',
      topic: 'usrBot',
      counterpartTopic: 'usrViewer',
      sequence: 42,
    }),
  };

  assert.deepEqual(
    mergeChatbotMessages([first], [second]).map(message => message.id),
    ['question-41', 'question-42'],
  );
});

test('replaces a pending chatbot copy with its delivered Tinode state', () => {
  const pending = {
    id: 'me-pending',
    sender: 'outgoing',
    text: 'Where is the leave form?',
    createdAt: '2026-09-04T08:00:00.000Z',
    pending: true,
    deliveryStatus: 'sending',
  };
  const delivered = {
    ...pending,
    seq: 18,
    pending: false,
    failed: false,
    deliveryStatus: 'sent',
    raw: { seq: 18 },
  };

  const result = mergeChatbotMessages([pending], [delivered]);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, pending.id);
  assert.equal(result[0].pending, false);
  assert.equal(result[0].failed, false);
  assert.equal(result[0].seq, 18);
  assert.equal(result[0].deliveryStatus, 'sent');
});

test('Tinode and conversation hydration keep chatbot correlation isolated from normal rooms', () => {
  assert.match(tinodeClientSource, /\['x-vichat-chatbot-source-seq'\]/);
  assert.match(tinodeClientSource, /const chatbotTinodeUid = String\(CHATBOT_ACCOUNT\.tinodeUid/);
  assert.match(tinodeClientSource, /const isChatbotPacket = [\s\S]*?Boolean\(chatbotTinodeUid/);
  assert.match(tinodeClientSource, /chatbotMessageCorrelationKey\(/);
  assert.match(appSource, /safeExisting\.isChatbot \|\| safeIncoming\.isChatbot[\s\S]*?mergeChatbotMessages/);
  assert.match(appSource, /isChatbot: safeExisting\.isChatbot \|\| safeIncoming\.isChatbot/);
  assert.match(appSource, /CALLS_ENABLED && !activeChat\.isChatbot/);
  assert.match(appSource, /!activeChat\.isChatbot && <div className="input-actions-left">/);
  assert.match(appSource, /isDetailOpen \? 'open' : 'collapsed'/);
});
