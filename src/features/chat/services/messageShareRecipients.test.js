import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMessageShareRecipients,
  messageShareRecipientMatchesContact,
} from './messageShareRecipients.js';

const viewer = {
  id: 'viewer',
  uid: 'viewer',
  name: 'Viewer',
  tenantId: 'tenant-a',
};

const bichHop = {
  id: 'account-bich-hop',
  uid: 'account-bich-hop',
  name: 'Bich Hop',
  username: 'bich.hop@example.com',
  tenantId: 'tenant-a',
  active: true,
};

test('share recipients include the complete tenant directory and collapse duplicate direct rooms', () => {
  const result = buildMessageShareRecipients({
    conversations: [
      {
        id: 'conversation-one',
        managementId: 'conversation-one',
        isGroup: false,
        members: [viewer, bichHop],
        participantIds: [viewer.id, bichHop.id],
        name: bichHop.name,
        updatedAt: '2026-09-08T10:00:00.000Z',
      },
      {
        id: 'conversation-two',
        managementId: 'conversation-two',
        isGroup: false,
        members: [viewer, bichHop],
        participantIds: [viewer.id, bichHop.id],
        name: bichHop.name,
        updatedAt: '2026-09-08T09:00:00.000Z',
      },
    ],
    accounts: [
      viewer,
      bichHop,
      { id: 'account-an', name: 'An', username: 'an@example.com', tenantId: 'tenant-a', active: true },
    ],
    currentUser: viewer,
    activeConversation: { id: 'active', isGroup: true },
  });

  assert.deepEqual(result.map(item => item.shareContact?.id), ['account-an', 'account-bich-hop']);
  assert.equal(result.filter(item => item.shareContact?.id === bichHop.id).length, 1);
  assert.equal(result.find(item => item.shareContact?.id === 'account-an')?.shareRecipientType, 'directory');
});

test('same display names remain separate and receive a disambiguating meta label', () => {
  const first = { id: 'first', name: 'Bich Hop', username: 'bich.one', tenantId: 'tenant-a', active: true };
  const second = { id: 'second', name: 'Bich Hop', username: 'bich.two', tenantId: 'tenant-a', active: true };
  const result = buildMessageShareRecipients({
    accounts: [viewer, first, second],
    currentUser: viewer,
  });

  assert.equal(result.length, 2);
  assert.deepEqual(result.map(item => item.shareRecipientMeta), ['@bich.one', '@bich.two']);
});

test('directory recipient matching uses the account identity instead of the display name', () => {
  const contact = { id: 'account-1', name: 'Bich Hop' };
  assert.equal(
    messageShareRecipientMatchesContact({ shareContact: contact, isGroup: false }, { id: 'account-1', name: 'Another name' }),
    true,
  );
  assert.equal(
    messageShareRecipientMatchesContact({ shareContact: contact, isGroup: false }, { id: 'account-2', name: 'Bich Hop' }),
    false,
  );
});

test('share recipients exclude the active direct contact but keep distinct groups', () => {
  const contact = { id: 'contact-1', name: 'Contact', tenantId: 'tenant-a', active: true };
  const result = buildMessageShareRecipients({
    conversations: [
      { id: 'active-direct', isGroup: false, members: [viewer, contact] },
      { id: 'group-a', managementId: 'group-a', isGroup: true, name: 'Team A' },
      { id: 'group-b', managementId: 'group-b', isGroup: true, name: 'Team A' },
    ],
    accounts: [viewer, contact],
    currentUser: viewer,
    activeConversation: { id: 'active-direct', isGroup: false, members: [viewer, contact] },
  });

  assert.deepEqual(result.map(item => item.shareRecipientKey), ['group:group-a', 'group:group-b']);
});

test('share recipients keep chatbot accounts out of the employee directory', () => {
  const result = buildMessageShareRecipients({
    accounts: [
      viewer,
      { id: 'bot-account', name: 'ViChat AI', type: 'bot', tenantId: 'tenant-a', active: true },
      { id: 'employee', name: 'Employee', tenantId: 'tenant-a', active: true },
    ],
    currentUser: viewer,
    chatbotId: 'bot-account',
  });

  assert.deepEqual(result.map(item => item.shareContact?.id), ['employee']);
});
