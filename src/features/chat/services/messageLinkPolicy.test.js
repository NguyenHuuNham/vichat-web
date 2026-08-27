import test from 'node:test';
import assert from 'node:assert/strict';
import { splitMessageLinks } from './messageLinkPolicy.js';

test('splits an https URL from surrounding message text', () => {
  assert.deepEqual(splitMessageLinks('Xem https://example.com/path?q=1 ngay'), [
    { type: 'text', value: 'Xem ' },
    { type: 'link', value: 'https://example.com/path?q=1', href: 'https://example.com/path?q=1' },
    { type: 'text', value: ' ngay' },
  ]);
});

test('keeps image links clickable and removes sentence punctuation only', () => {
  assert.deepEqual(splitMessageLinks('https://s3.upgo.vn/logo.png.'), [
    { type: 'link', value: 'https://s3.upgo.vn/logo.png', href: 'https://s3.upgo.vn/logo.png' },
    { type: 'text', value: '.' },
  ]);
  assert.deepEqual(splitMessageLinks('https://example.com/a_(b).'), [
    { type: 'link', value: 'https://example.com/a_(b)', href: 'https://example.com/a_(b)' },
    { type: 'text', value: '.' },
  ]);
});

test('normalizes a www link without changing its visible text', () => {
  assert.deepEqual(splitMessageLinks('www.example.com/docs'), [
    { type: 'link', value: 'www.example.com/docs', href: 'https://www.example.com/docs' },
  ]);
});

test('normalizes bare domains and keeps their visible text', () => {
  assert.deepEqual(splitMessageLinks('Mo example.com va portal.upgo.vn/path.'), [
    { type: 'text', value: 'Mo ' },
    { type: 'link', value: 'example.com', href: 'https://example.com' },
    { type: 'text', value: ' va ' },
    { type: 'link', value: 'portal.upgo.vn/path', href: 'https://portal.upgo.vn/path' },
    { type: 'text', value: '.' },
  ]);
});

test('supports multiple links and leaves line breaks in text segments', () => {
  assert.deepEqual(splitMessageLinks('http://one.test\nva www.two.test!'), [
    { type: 'link', value: 'http://one.test', href: 'http://one.test' },
    { type: 'text', value: '\nva ' },
    { type: 'link', value: 'www.two.test', href: 'https://www.two.test' },
    { type: 'text', value: '!' },
  ]);
});

test('does not turn email addresses or unsafe schemes into links', () => {
  assert.deepEqual(splitMessageLinks('mail@example.com javascript:alert(1) ftp://example.com'), [
    { type: 'text', value: 'mail@example.com javascript:alert(1) ftp://example.com' },
  ]);
  assert.deepEqual(splitMessageLinks('javascript:https://example.com'), [
    { type: 'text', value: 'javascript:https://example.com' },
  ]);
});

test('does not linkify a URL-like token embedded in a word', () => {
  assert.deepEqual(splitMessageLinks('abchttps://example.com'), [
    { type: 'text', value: 'abchttps://example.com' },
  ]);
});
