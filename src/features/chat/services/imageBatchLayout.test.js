import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupImageMessageEntries,
  imageBatchLayoutClass,
  normalizeImageBatch,
} from './imageBatchLayout.js';

test('normalizes a bounded image batch descriptor', () => {
  assert.deepEqual(normalizeImageBatch({ batch_id: 'batch-1', batch_index: 1, batch_size: 4 }), {
    id: 'batch-1',
    index: 1,
    size: 4,
  });
  assert.equal(normalizeImageBatch({ id: 'batch-1', index: 0, size: 1 }), null);
  assert.equal(normalizeImageBatch({ id: 'batch-1', index: -1, size: 2 }), null);
});

test('groups only contiguous images from the same explicit batch', () => {
  const batch = index => ({
    id: `image-${index}`,
    type: 'image',
    sender: 'outgoing',
    senderId: 'usr-me',
    file: { name: `${index}.jpg`, mime: 'image/jpeg' },
    imageBatch: { id: 'batch-1', index, size: 3 },
  });
  const entries = groupImageMessageEntries([
    batch(0),
    batch(1),
    batch(2),
    { id: 'text-1', type: 'text', sender: 'outgoing', text: 'ok' },
    { ...batch(0), id: 'separate', imageBatch: { id: 'batch-2', index: 0, size: 2 } },
  ]);

  assert.equal(entries[0].kind, 'image-batch');
  assert.equal(entries[0].messages.length, 3);
  assert.equal(entries[1].kind, 'message');
  assert.equal(entries[2].kind, 'message');
});

test('keeps selected order when Tinode publishes batch files out of order', () => {
  const makeMessage = index => ({
    id: `image-${index}`,
    type: 'image',
    sender: 'outgoing',
    senderId: 'usr-me',
    file: { name: `${index}.jpg`, mime: 'image/jpeg' },
    imageBatch: { id: 'batch-order', index, size: 3 },
  });

  const entries = groupImageMessageEntries([makeMessage(2), makeMessage(0), makeMessage(1)]);
  assert.deepEqual(entries[0].messages.map(message => message.imageBatch.index), [0, 1, 2]);
});

test('does not cross the unread boundary when grouping a batch', () => {
  const makeMessage = index => ({
    id: `image-${index}`,
    type: 'image',
    sender: 'incoming',
    senderId: 'usr-peer',
    file: { name: `${index}.jpg`, mime: 'image/jpeg' },
    imageBatch: { id: 'batch-1', index, size: 2 },
  });

  const entries = groupImageMessageEntries([makeMessage(0), makeMessage(1)], 1);
  assert.equal(entries.every(entry => entry.kind === 'message'), true);
});

test('selects compact layouts by image count', () => {
  assert.equal(imageBatchLayoutClass(2), 'two');
  assert.equal(imageBatchLayoutClass(3), 'three');
  assert.equal(imageBatchLayoutClass(4), 'four');
  assert.equal(imageBatchLayoutClass(8), 'many');
});
