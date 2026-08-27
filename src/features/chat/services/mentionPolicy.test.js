import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_MENTION_ID,
  getMentionContext,
  insertMentionAt,
  matchesMentionCandidate,
  mentionCanonicalText,
  mentionDisplayTokenFor,
  mentionCandidateText,
  messageMentionsViewer,
  mentionTargetsViewer,
  serializeMentionForTransport,
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

test('keeps viewer nicknames out of the shared mention token', () => {
  const candidate = {
    id: 'account-peer',
    name: 'S\u1ebfp C\u01b0\u1eddng',
    nickname: 'S\u1ebfp C\u01b0\u1eddng',
    defaultName: 'Nguy\u1ec5n C\u01b0\u1eddng',
    username: 'cuong',
  };

  assert.equal(mentionCandidateText(candidate), 'S\u1ebfp C\u01b0\u1eddng');
  assert.equal(mentionCanonicalText(candidate), 'Nguy\u1ec5n C\u01b0\u1eddng');
  assert.equal(mentionTokenFor(candidate), '@Nguy\u1ec5n C\u01b0\u1eddng');
  assert.equal(mentionDisplayTokenFor(candidate), '@S\u1ebfp C\u01b0\u1eddng');
  assert.equal(mentionDisplayTokenFor({
    id: candidate.id,
    name: candidate.defaultName,
    token: '@Nguy\u1ec5n C\u01b0\u1eddng',
  }), '@Nguy\u1ec5n C\u01b0\u1eddng');
  assert.deepEqual(serializeMentionForTransport({
    ...candidate,
    token: '@S\u1ebfp C\u01b0\u1eddng',
  }), {
    id: 'account-peer',
    tinodeUid: '',
    name: 'Nguy\u1ec5n C\u01b0\u1eddng',
    token: '@Nguy\u1ec5n C\u01b0\u1eddng',
    isAll: false,
    isBot: false,
  });

  const value = 'Giao vi\u1ec7c cho @S\u1ebfp';
  const result = insertMentionAt(value, getMentionContext(value, value.length), candidate);
  assert.equal(result.text, 'Giao vi\u1ec7c cho @Nguy\u1ec5n C\u01b0\u1eddng ');
  assert.equal(result.text.includes('S\u1ebfp C\u01b0\u1eddng'), false);
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

test('marks only all mentions or mentions targeting the current viewer', () => {
  const viewer = {
    id: 'account-me',
    tinodeUid: 'usrMe',
    defaultName: 'Nguyen Van Minh',
    name: 'Minh',
  };

  assert.equal(mentionTargetsViewer({ id: ALL_MENTION_ID, token: '@All', isAll: true }, viewer), true);
  assert.equal(mentionTargetsViewer({ id: 'account-me', tinodeUid: 'usrMe', token: '@Nguyen Van Minh' }, viewer), true);
  assert.equal(mentionTargetsViewer({ id: 'account-other', tinodeUid: 'usrOther', token: '@Nguoi Khac' }, viewer), false);
  assert.equal(mentionTargetsViewer({ token: '@Nguyen Van Minh', name: 'Nguyen Van Minh' }, viewer), true);
  assert.equal(messageMentionsViewer({
    mentions: [{ id: 'account-other' }, { id: 'account-me' }],
  }, viewer), true);
  assert.equal(messageMentionsViewer({ mentions: [{ id: 'account-other' }] }, viewer), false);
});

test('recovers a legacy text mention when x-mentions metadata is absent', () => {
  const viewer = {
    id: 'account-me',
    tinodeUid: 'usr-me',
    name: '\u004e\u0067\u0075\u0079\u1ec5\u006e \u0048\u1ed3\u006e\u0067 \u0048\u1eef\u0075 \u004e\u0068\u00e2\u006d',
  };

  assert.equal(messageMentionsViewer({ text: 'dev: @Nguyen Hong Huu Nham,' }, viewer), true);
  assert.equal(messageMentionsViewer({ text: 'dev: @All' }, viewer), true);
  assert.equal(messageMentionsViewer({ text: 'email abc@Nguyen Hong Huu Nham' }, viewer), false);
  assert.equal(messageMentionsViewer({ text: 'dev: @Ng\u01b0\u1eddi kh\u00e1c' }, viewer), false);
});

test('keeps explicit mention metadata authoritative over text fallback', () => {
  const viewer = {
    id: 'account-me',
    name: '\u004e\u0067\u0075\u0079\u1ec5\u006e \u0048\u1ed3\u006e\u0067 \u0048\u1eef\u0075 \u004e\u0068\u00e2\u006d',
  };

  assert.equal(messageMentionsViewer({
    text: 'dev: @Nguy\u1ec5n H\u1ed3ng H\u1eef\u0075 Nh\u00e2m',
    mentions: [{ id: 'account-other', token: '@Ng\u01b0\u1eddi kh\u00e1c' }],
  }, viewer), false);
  assert.equal(messageMentionsViewer({
    text: 'dev: @Nguy\u1ec5n H\u1ed3ng H\u1eef\u0075 Nh\u00e2m',
    mentions: [null, {}],
  }, viewer), true);
});
