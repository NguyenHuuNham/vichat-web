import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CHATBOT_ACCOUNT,
  CHATBOT_REQUEST_TIMEOUT_MS,
  CHATBOT_STARTER_PROMPTS,
  applyTinodeChatbotConfig,
  canIngestChatDocument,
  chatbotMessageCorrelationKey,
  ingestChatDocument,
  mergeChatbotMessages,
  requestChatbotReply,
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
  assert.ok(CHATBOT_STARTER_PROMPTS.every(item => /\[[^\]]+\]/u.test(item.prompt)));
});

test('AI starter suggestions fill editable drafts without sending messages', () => {
  const starterSource = appSource.split('{CHATBOT_STARTER_PROMPTS.map(item => (')[1].split('chatbot-starter-tip')[0];
  assert.match(starterSource, /setInputText\(prompt\)/);
  assert.match(starterSource, /setDrafts\(previous => \(\{ \.\.\.previous, \[currentChatId\]: prompt \}\)\)/);
  assert.match(starterSource, /input\.setSelectionRange\(placeholder\.index/);
  assert.match(starterSource, /currentChatIdRef\.current !== currentChatId/);
  assert.doesNotMatch(starterSource, /handleSendMessage|requestChatbotReply/);
});

test('AI HTTP replies are session guarded and sources are keyboard-expandable', () => {
  const fallbackSource = appSource.split('const chatbotRequest = { controller: new AbortController()')[1].split("if (chatMode === 'tinode')")[0];
  assert.match(appSource, /chatbotRequestRef\.current\?\.controller\.abort\(\)/);
  assert.match(appSource, /\[isLoggedIn, managementViewerId, currentUser\?\.tenantId\]/);
  assert.match(fallbackSource, /signal: chatbotRequest\.controller\.signal/);
  assert.match(fallbackSource, /if \(chatbotRequestRef\.current !== chatbotRequest \|\| accountSessionRef\.current !== chatbotRequest\.session\) return;/);
  assert.match(fallbackSource, /!item\.failed && !item\.fallback/);
  assert.match(fallbackSource, /fallback: Boolean\(response\.fallback\)/);
  assert.match(fallbackSource, /setConversations\(prev => \{\s*if \(accountSessionRef\.current !== chatbotRequest\.session\) return prev;/);
  assert.match(fallbackSource, /if \(chatbotRequestRef\.current === chatbotRequest\) \{[\s\S]*?setIsTyping\(false\)/);
  assert.match(appSource, /pending: chatMode === 'tinode' && \(!activeChat\.isChatbot \|\| Boolean\(activeChat\.tinodeTopic\)\)/);
  assert.match(appSource, /<details className="chatbot-source-card"[\s\S]*?<summary>[\s\S]*?className="chatbot-source-snippet"/);
  assert.match(appSource, /Trích lọc từ tài liệu/);
});

test('AI HTTP request preserves credentials and message ids but bounds history and sources', async context => {
  let captured;
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({
        reply: '  Verified excerpt  ',
        grounded: true,
        sources: [null, { title: ' ' }, { title: 3 }, ...Array.from({ length: 22 }, () => ({
          title: 'Document '.repeat(80), file_name: 'policy.pdf', snippet: 'content '.repeat(350),
        }))],
      }),
    };
  });
  const result = await requestChatbotReply({
    message: '  Leave policy?  ', messageId: 'message-1', conversationId: 'vichat-ai',
    history: [null, { role: 'system', content: 'Never forward' }, ...Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user', content: `turn-${index} ${'content '.repeat(700)}`,
    })), { role: 'assistant', content: {} }],
  });
  assert.equal(captured.url, '/api/v1/chatbot/message');
  assert.equal(captured.options.credentials, 'include');
  assert.equal(captured.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(Object.keys(captured.body).sort(), ['conversation_id', 'history', 'message', 'message_id']);
  assert.equal(captured.body.message, 'Leave policy?');
  assert.equal(captured.body.message_id, 'message-1');
  assert.equal(captured.body.conversation_id, 'vichat-ai');
  assert.equal(captured.body.history.length, 10);
  assert.ok(captured.body.history.every(item => item.content.length === 4000 && ['user', 'assistant'].includes(item.role)));
  assert.ok(captured.body.history[0].content.startsWith('turn-2 '));
  assert.equal(result.text, 'Verified excerpt');
  assert.equal(result.grounded, true);
  assert.equal(result.sources.length, 20);
  assert.ok(result.sources.every(item => item.title.length === 500 && item.snippet.length === 2000));
});

test('AI rejects invalid or oversized questions before fetch and never truncates a question', async context => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ reply: 'OK' }) }));
  for (const message of [null, {}, '', '   ', 'a'.repeat(4001)]) {
    await assert.rejects(requestChatbotReply({ message }), /ViChat AI/);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
  await requestChatbotReply({ message: 'a'.repeat(4000), history: { role: 'user' } });
  const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
  assert.equal(body.message.length, 4000);
  assert.deepEqual(body.history, []);
});

test('AI distinguishes session expiry and provider timeout without retrying', async context => {
  let status = 401;
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => ({ ok: false, status, json: async () => ({ error_message: 'private upstream diagnostic' }) }));
  for (const [nextStatus, expected] of [[401, 'session'], [403, 'session'], [408, 'timeout'], [504, 'timeout'], [502, 'unavailable']]) {
    status = nextStatus;
    const result = await requestChatbotReply({ message: 'Policy?' });
    assert.equal(result.errorCode, expected);
    assert.equal(result.fallback, true);
    assert.equal(result.grounded, false);
    assert.doesNotMatch(result.text, /private upstream diagnostic/);
  }
  assert.equal(fetchMock.mock.callCount(), 5);
});

test('AI ignores malformed responses and does not claim grounding without valid sources', async context => {
  let payload;
  context.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => payload }));
  for (const invalid of [null, [], {}, { reply: {} }, { reply: '  ' }]) {
    payload = invalid;
    assert.equal((await requestChatbotReply({ message: 'Policy?' })).fallback, true);
  }
  payload = { reply: 'No verified source.', grounded: true, sources: [null, { title: ' ' }, { title: 7 }] };
  assert.equal((await requestChatbotReply({ message: 'Policy?' })).grounded, false);
  payload = { reply: 'Answer.', grounded: 'false', sources: [{ title: 'Source' }] };
  assert.equal((await requestChatbotReply({ message: 'Policy?' })).grounded, false);
});

test('AI handles network and malformed JSON failures and clears its timeout', async context => {
  const clearTimeoutMock = context.mock.method(globalThis, 'clearTimeout');
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => { throw new TypeError('network failure'); });
  assert.equal((await requestChatbotReply({ message: 'Policy?' })).fallback, true);
  fetchMock.mock.mockImplementation(async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid json'); } }));
  assert.equal((await requestChatbotReply({ message: 'Policy?' })).fallback, true);
  assert.equal(clearTimeoutMock.mock.callCount(), 2);
});

test('AI pre-cancelled requests never start fetch or a timeout', async context => {
  const controller = new AbortController();
  controller.abort();
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => { throw new Error('must not fetch'); });
  const timerMock = context.mock.method(globalThis, 'setTimeout');
  const result = await requestChatbotReply({ message: 'Policy?', signal: controller.signal });
  assert.equal(result.errorCode, 'cancelled');
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(timerMock.mock.callCount(), 0);
});

test('AI caller cancellation aborts fetch and removes its listener', async context => {
  const controller = new AbortController();
  const removeListenerMock = context.mock.method(controller.signal, 'removeEventListener');
  let requestSignal;
  context.mock.method(globalThis, 'fetch', (_url, options) => new Promise((_resolve, reject) => {
    requestSignal = options.signal;
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }));
  const pending = requestChatbotReply({ message: 'Policy?', signal: controller.signal });
  controller.abort();
  const result = await pending;
  assert.equal(requestSignal.aborted, true);
  assert.equal(result.errorCode, 'cancelled');
  assert.equal(removeListenerMock.mock.callCount(), 1);
});

test('AI timeout covers a stalled response body and clears the request timer', { timeout: 1500 }, async context => {
  let requestSignal;
  const clearTimeoutMock = context.mock.method(globalThis, 'clearTimeout');
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    requestSignal = options.signal;
    return {
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      }),
    };
  });
  const result = await requestChatbotReply({ message: 'Policy?', timeoutMs: 10 });
  assert.equal(CHATBOT_REQUEST_TIMEOUT_MS, 45000);
  assert.equal(result.errorCode, 'timeout');
  assert.equal(result.fallback, true);
  assert.equal(requestSignal.aborted, true);
  assert.equal(clearTimeoutMock.mock.callCount(), 1);
});

test('AI successful replies clear the bounded timer and cancellation listener', async context => {
  const controller = new AbortController();
  const timerMock = context.mock.method(globalThis, 'setTimeout');
  const clearTimeoutMock = context.mock.method(globalThis, 'clearTimeout');
  const removeListenerMock = context.mock.method(controller.signal, 'removeEventListener');
  context.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ reply: 'OK' }) }));
  for (const timeoutMs of [Infinity, NaN, 999999, -1]) {
    await requestChatbotReply({ message: 'Policy?', signal: controller.signal, timeoutMs });
  }
  assert.deepEqual(timerMock.mock.calls.map(call => call.arguments[1]), [45000, 45000, 45000, 1]);
  assert.equal(clearTimeoutMock.mock.callCount(), 4);
  assert.equal(removeListenerMock.mock.callCount(), 4);
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

test('web chat indexes supported documents without touching media attachments', () => {
  assert.equal(canIngestChatDocument({ name: 'quy-trinh.pdf', type: 'application/pdf', size: 1024 }), true);
  assert.equal(canIngestChatDocument({ name: 'bao-cao.XLSX', type: '', size: 2048 }), true);
  assert.equal(canIngestChatDocument({ name: 'anh.pdf', type: 'image/png', size: 1024 }), false);
  assert.equal(canIngestChatDocument({ name: 'video.mp4', type: 'video/mp4', size: 1024 }), false);
  assert.equal(canIngestChatDocument({ name: 'lon.pdf', type: 'application/pdf', size: 21 * 1024 * 1024 }), false);
  assert.match(appSource, /tinodeClient\.sendFile[\s\S]*?ingestChatDocument\(\{/);
  assert.match(serviceSource, /\/knowledge\/chat-files/);
  assert.doesNotMatch(serviceSource, /tenant_id.*FormData|body\.append\(['"]tenant_id/);
});

test('chat document upload sends conversation proof but never a browser tenant', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 202, json: async () => ({ accepted: true }) };
  };
  try {
    const result = await ingestChatDocument({
      file: new File(['noi dung'], 'quy-trinh.txt', { type: 'text/plain' }),
      conversationId: 'conversation-1',
      tinodeTopic: 'usrPeer123456',
      sequence: 42,
      caption: 'Quy trinh moi',
    });

    assert.equal(result.accepted, true);
    assert.equal(request.url, '/api/v1/chatbot/knowledge/chat-files');
    assert.equal(request.options.credentials, 'include');
    assert.equal(request.options.body.get('conversation_id'), 'conversation-1');
    assert.equal(request.options.body.get('tinode_topic'), 'usrPeer123456');
    assert.equal(request.options.body.get('sequence'), '42');
    assert.equal(request.options.body.has('tenant_id'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
  assert.doesNotMatch(appSource, /CALLS_ENABLED && !activeChat\.isChatbot/);
  assert.match(appSource, /!activeChat\.isChatbot && <div className="input-actions-left">/);
  assert.match(appSource, /isDetailOpen \? 'open' : 'collapsed'/);
});
