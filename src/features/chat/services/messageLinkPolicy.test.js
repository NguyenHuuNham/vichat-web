import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MESSAGE_LINKS,
  MAX_MESSAGE_LINK_CACHE_ENTRIES,
  messageLinkCacheSize,
  splitMessageLinks,
} from './messageLinkPolicy.js';

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

test('does not linkify the host of an unsupported scheme even after a long prefix', () => {
  const prefix = 'Bao cao tuan nay da gui. '.repeat(400);
  const parts = splitMessageLinks(`${prefix}ftp://example.com`);
  assert.equal(parts.some(part => part.type === 'link' && part.value === 'example.com'), false);
});

test('scans a very long message in linear time instead of quadratic time', () => {
  const message = 'Doanh thu quy nay tang manh.Chi tiet o file bao cao. '.repeat(5000);
  const started = process.hrtime.bigint();
  splitMessageLinks(message);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(
    elapsedMs < 250,
    `splitMessageLinks mat ${elapsedMs.toFixed(0)}ms cho ${message.length} ky tu (ngan sach 250ms)`,
  );
});

test('stops linkifying after a sane number of links and keeps the rest readable', () => {
  const message = 'xem https://example.com/a nhe '.repeat(MAX_MESSAGE_LINKS + 250);
  const parts = splitMessageLinks(message);
  const links = parts.filter(part => part.type === 'link');
  assert.equal(links.length, MAX_MESSAGE_LINKS);
  assert.equal(parts.map(part => part.value).join(''), message);
});

test('reuses the parsed result when the same message is rendered again', () => {
  const message = 'Bao cao thang nay da hoan tat.Xem chi tiet o day. '.repeat(5000);

  const firstStarted = process.hrtime.bigint();
  const first = splitMessageLinks(message);
  const firstMs = Number(process.hrtime.bigint() - firstStarted) / 1e6;

  const repeatStarted = process.hrtime.bigint();
  let last = null;
  for (let index = 0; index < 50; index += 1) last = splitMessageLinks(message);
  const perRepeatMs = Number(process.hrtime.bigint() - repeatStarted) / 1e6 / 50;

  assert.deepEqual(last, first);
  assert.ok(
    perRepeatMs < firstMs / 10,
    `lan render lai mat ${perRepeatMs.toFixed(3)}ms, khong nhanh hon lan dau (${firstMs.toFixed(3)}ms) du da co cache`,
  );
});

test('keeps the memo cache bounded so long conversations cannot leak memory', () => {
  const before = messageLinkCacheSize();
  for (let index = 0; index < MAX_MESSAGE_LINK_CACHE_ENTRIES * 2; index += 1) {
    splitMessageLinks(`tin nhan so ${index} tai example.com/${index}`);
  }
  assert.ok(messageLinkCacheSize() <= MAX_MESSAGE_LINK_CACHE_ENTRIES, 'cache vuot gioi han');
  assert.ok(before >= 0);
});
