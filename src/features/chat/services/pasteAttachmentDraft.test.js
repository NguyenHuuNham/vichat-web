import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  clipboardAttachmentFiles,
  formatPasteAttachmentSize,
  isPastedImageFile,
  normalizePastedFile,
  pasteAttachmentSendPlan,
} from './pasteAttachmentDraft.js';

const appSource = readFileSync(new URL('../../../app/App.jsx', import.meta.url), 'utf8');
const tinodeSource = readFileSync(new URL('./tinodeClient.js', import.meta.url), 'utf8');
const mobileComposerSource = readFileSync(new URL('../../../../mobile/src/screens/chat/ChatDetailScreen.tsx', import.meta.url), 'utf8');

test('collects every clipboard file without duplicating the files fallback', () => {
  const first = new File(['first'], 'first.png', { type: 'image/png' });
  const second = new File(['second'], 'second.png', { type: 'image/png' });
  const clipboard = {
    items: [
      { kind: 'string', getAsFile: () => null },
      { kind: 'file', getAsFile: () => first },
      { kind: 'file', getAsFile: () => second },
    ],
    files: [first, second],
  };

  assert.deepEqual(clipboardAttachmentFiles(clipboard), [first, second]);
});

test('keeps additional files exposed only by the clipboard file list', () => {
  const first = new File(['first'], 'first.png', { type: 'image/png', lastModified: 1 });
  const second = new File(['second'], 'second.png', { type: 'image/png', lastModified: 2 });

  assert.deepEqual(clipboardAttachmentFiles({
    items: [{ kind: 'file', getAsFile: () => first }],
    files: [first, second],
  }), [first, second]);
});

test('removes a file repeated inside one clipboard event', () => {
  const first = new File(['same-image'], 'image.png', { type: 'image/png', lastModified: 7 });
  const duplicate = new File(['same-image'], 'image.png', { type: 'image/png', lastModified: 7 });

  const files = clipboardAttachmentFiles({
    items: [
      { kind: 'file', getAsFile: () => first },
      { kind: 'file', getAsFile: () => duplicate },
    ],
    files: [first, duplicate],
  });

  assert.deepEqual(files, [first]);
});

test('keeps text-only clipboard data out of the attachment queue', () => {
  assert.deepEqual(clipboardAttachmentFiles({ items: [], files: [] }), []);
  assert.deepEqual(clipboardAttachmentFiles(null), []);
});

test('normalizes unnamed clipboard blobs while preserving named files', () => {
  const unnamed = new Blob(['image'], { type: 'image/png' });
  const named = new File(['report'], 'report.pdf', { type: 'application/pdf' });
  const normalized = normalizePastedFile(unnamed, 1, 1234);

  assert.equal(normalized.name, 'pasted-image-1234-2.png');
  assert.equal(normalized.type, 'image/png');
  assert.equal(normalizePastedFile(named, 0, 1234), named);
  assert.equal(isPastedImageFile(normalized), true);
  assert.equal(isPastedImageFile(named), false);
});

test('builds an explicit image batch and applies the caption only once', () => {
  const attachments = [
    { id: 'one', file: new File(['1'], 'one.png', { type: 'image/png' }), isImage: true },
    { id: 'two', file: new File(['2'], 'two.png', { type: 'image/png' }), isImage: true },
  ];
  const plan = pasteAttachmentSendPlan(attachments, '  Mo ta chung  ', 'paste-batch-1');

  assert.deepEqual(plan.map(item => item.caption), ['Mo ta chung', '']);
  assert.deepEqual(plan.map(item => item.imageBatch), [
    { id: 'paste-batch-1', index: 0, size: 2 },
    { id: 'paste-batch-1', index: 1, size: 2 },
  ]);
});

test('does not group a mixed attachment paste as an image batch', () => {
  const plan = pasteAttachmentSendPlan([
    { id: 'one', file: new File(['1'], 'one.png', { type: 'image/png' }), isImage: true },
    { id: 'two', file: new File(['2'], 'two.pdf', { type: 'application/pdf' }), isImage: false },
  ], 'Caption', 'paste-batch-2');

  assert.deepEqual(plan.map(item => item.imageBatch), [null, null]);
  assert.deepEqual(plan.map(item => item.caption), ['Caption', '']);
  assert.equal(formatPasteAttachmentSize(2 * 1024 * 1024), '2.0 MB');
});

test('web paste stages attachments and leaves plain text to the controlled input', () => {
  const pasteSource = appSource
    .split('const handleMessagePaste = event => {')[1]
    .split('const handleFileDownload')[0];

  assert.match(pasteSource, /clipboardAttachmentFiles\(clipboard\)/);
  assert.match(pasteSource, /queuePastedAttachments\(clipboardFiles\)/);
  assert.doesNotMatch(pasteSource, /handleSendFile|handleSendMessage|navigator\.clipboard/);
  assert.match(appSource, /onKeyDown=\{handleMessageInputKeyDown\}/);
  assert.match(appSource, /onClick=\{handleComposerSubmit\}/);
  assert.equal((appSource.match(/onPasteCapture=\{handleMessagePaste\}/g) || []).length, 0);
  assert.equal((appSource.match(/onPaste=\{handleMessagePaste\}/g) || []).length, 1);
});

test('only the explicit composer submit flushes the staged paste queue', () => {
  const submitSource = appSource
    .split('const handleComposerSubmit = () => {')[1]
    .split('const displayMentionToken')[0];
  const pickerSource = appSource
    .split('const handleAttachmentChange = (event, source) => {')[1]
    .split('const handleFileChange')[0];

  assert.match(submitSource, /pasteAttachmentSendPlan\(attachments, inputText, batchId\)/);
  assert.match(submitSource, /pastedAttachmentSubmitRef\.current = true/);
  assert.match(submitSource, /handleSendFile\(item\.attachment\.file/);
  assert.match(submitSource, /caption: item\.caption/);
  assert.match(submitSource, /clearPastedAttachments\(conversationId\)/);
  assert.match(pickerSource, /handleSendFile\(file/);
});

test('Tinode keeps one attachment caption in Drafty without changing mobile', () => {
  const sendFileSource = tinodeSource
    .split('async sendFile(topicName, file, clientId, metadata = {}) {')[1]
    .split('async sendSticker')[0];

  assert.match(sendFileSource, /const caption = String\(metadata\.caption/);
  assert.match(sendFileSource, /Drafty\.appendImage\(baseContent, attachment\)/);
  assert.match(sendFileSource, /Drafty\.attachFile\(baseContent, attachment\)/);
  assert.match(sendFileSource, /draft\.head\['x-mentions'\]/);
  assert.doesNotMatch(mobileComposerSource, /pastedAttachmentDrafts|handleComposerSubmit/);
});
