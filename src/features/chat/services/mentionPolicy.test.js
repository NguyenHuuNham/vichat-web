import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_MENTION_ID,
  getMentionContext,
  insertMentionAt,
  matchesMentionCandidate,
  mentionTokenExists,
  mentionTokenFor,
} from './mentionPolicy.js';

test('finds a mention trigger at the caret without treating an email as a mention', () => {
  const value = 'Giao vi\u1ec7c cho @\u0110\u00e0m';
  assert.deepEqual(getMentionContext(value, value.length), {
    start: 14,
    end: value.length,
    query: '\u0110\u00e0m',
  });
  assert.equal(getMentionContext('mail@example.com', 16), null);
  assert.equal(getMentionContext('\u0111\u00e3 ch\u1ecdn @Ho\u00e0n r\u1ed3i'), null);
});

test('filters member names, usernames and email addresses accent-insensitively', () => {
  const member = { name: '\u0110\u00e0m H\u01b0ng', username: 'damhung', email: 'dam@example.com' };
  assert.equal(matchesMentionCandidate(member, 'hung'), true);
  assert.equal(matchesMentionCandidate(member, 'DAM@'), true);
  assert.equal(matchesMentionCandidate(member, 'xyz'), false);
});

test('replaces the active mention query and keeps the caret after the inserted token', () => {
  const value = 'Giao vi\u1ec7c @\u0110';
  const context = getMentionContext(value, value.length);
  const result = insertMentionAt(value, context, { id: 'u1', name: '\u0110\u00e0m H\u01b0ng' });
  assert.equal(result.text, 'Giao vi\u1ec7c @\u0110\u00e0m H\u01b0ng ');
  assert.equal(result.caret, result.text.length);
  assert.equal(mentionTokenFor({ id: ALL_MENTION_ID }), '@All');
  assert.equal(mentionTokenExists(result.text, '@\u0110\u00e0m H\u01b0ng'), true);
});

test('uses the compact ViChat AI token and matches its aliases', () => {
  const bot = {
    id: 'vichat-ai',
    type: 'bot',
    name: 'ViChat AI',
    mentionAliases: ['vichatai', 'vichat ai'],
  };

  assert.equal(mentionTokenFor(bot), '@ViChatAI');
  assert.equal(matchesMentionCandidate(bot, 'VichatAI'), true);
  assert.equal(mentionTokenExists('Tra loi @ViChatAI nhe', '@ViChatAI'), true);
});
