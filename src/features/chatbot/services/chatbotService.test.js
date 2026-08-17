import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CHATBOT_ACCOUNT, CHATBOT_STARTER_PROMPTS, applyTinodeChatbotConfig } from './chatbotService.js';

const appSource = readFileSync(new URL('../../../app/App.jsx', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('./chatbotService.js', import.meta.url), 'utf8');
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
});
