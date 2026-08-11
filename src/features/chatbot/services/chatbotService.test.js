import assert from 'node:assert/strict';
import test from 'node:test';

import { CHATBOT_ACCOUNT, applyTinodeChatbotConfig } from './chatbotService.js';


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
