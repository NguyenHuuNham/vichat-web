import test from 'node:test';
import assert from 'node:assert/strict';
import { createBurstBatcher } from './chatBurstBatcher.js';

test('coalesces rapid burst of items into a single flush within time window', async () => {
  const flushedBatches = [];
  const batcher = createBurstBatcher({
    delay: 30,
    onFlush: items => flushedBatches.push(items),
  });

  for (let i = 1; i <= 20; i++) {
    batcher.enqueue({ id: i, text: `Message ${i}` });
  }

  assert.equal(flushedBatches.length, 0);
  assert.equal(batcher.size(), 20);
  assert.equal(batcher.hasPending(), true);

  await new Promise(resolve => setTimeout(resolve, 60));

  assert.equal(flushedBatches.length, 1);
  assert.equal(flushedBatches[0].length, 20);
  assert.equal(flushedBatches[0][0].id, 1);
  assert.equal(flushedBatches[0][19].id, 20);
  assert.equal(batcher.size(), 0);
  assert.equal(batcher.hasPending(), false);
});

test('supports immediate flush on user action', () => {
  const flushedBatches = [];
  const batcher = createBurstBatcher({
    delay: 100,
    onFlush: items => flushedBatches.push(items),
  });

  batcher.enqueue({ id: 'msg-1' });
  batcher.enqueue({ id: 'msg-2' });

  assert.equal(flushedBatches.length, 0);
  const result = batcher.flush();

  assert.equal(flushedBatches.length, 1);
  assert.equal(result.length, 2);
  assert.equal(batcher.size(), 0);
});

test('handles keyed enqueue with custom merger for conversation updates', async () => {
  const flushedBatches = [];
  const batcher = createBurstBatcher({
    delay: 30,
    onFlush: items => flushedBatches.push(items),
  });

  // Conversation A receives 3 messages
  batcher.enqueueKeyed('conv-A', { id: 'conv-A', messages: ['m1'] }, (prev, next) => ({
    ...prev,
    messages: [...prev.messages, ...next.messages],
  }));
  batcher.enqueueKeyed('conv-A', { id: 'conv-A', messages: ['m2'] }, (prev, next) => ({
    ...prev,
    messages: [...prev.messages, ...next.messages],
  }));
  batcher.enqueueKeyed('conv-B', { id: 'conv-B', messages: ['b1'] });

  assert.equal(batcher.size(), 2);

  await new Promise(resolve => setTimeout(resolve, 60));

  assert.equal(flushedBatches.length, 1);
  assert.equal(flushedBatches[0].length, 2);

  const convA = flushedBatches[0].find(c => c.id === 'conv-A');
  const convB = flushedBatches[0].find(c => c.id === 'conv-B');

  assert.deepEqual(convA.messages, ['m1', 'm2']);
  assert.deepEqual(convB.messages, ['b1']);
});

test('clear cancels timer and empties queue without flushing', async () => {
  let flushed = false;
  const batcher = createBurstBatcher({
    delay: 30,
    onFlush: () => { flushed = true; },
  });

  batcher.enqueue({ text: 'abandoned' });
  assert.equal(batcher.hasPending(), true);

  batcher.clear();
  assert.equal(batcher.hasPending(), false);
  assert.equal(batcher.size(), 0);

  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(flushed, false);
});
