import assert from 'node:assert/strict';
import test from 'node:test';
import {
  conversationBackgroundCropMetrics,
  conversationBackgroundCropSourceRect,
  normalizeConversationBackgroundCropAspectRatio,
  normalizeConversationBackgroundCropZoom,
} from './conversationBackgroundCrop.js';

test('background crop metrics cover a rectangular preview and clamp dragging', () => {
  const metrics = conversationBackgroundCropMetrics({
    imageWidth: 1600,
    imageHeight: 900,
    viewportWidth: 360,
    viewportHeight: 240,
    offsetX: 9999,
    offsetY: -9999,
  });

  assert.equal(Math.round(metrics.displayedHeight), 240);
  assert.equal(Math.round(metrics.maxOffsetX), 33);
  assert.equal(metrics.maxOffsetY, 0);
  assert.equal(Math.round(metrics.offsetX), 33);
  assert.equal(Math.abs(metrics.offsetY), 0);
});

test('background crop source rect stays inside the image and preserves the preview ratio', () => {
  const crop = conversationBackgroundCropSourceRect({
    imageWidth: 1200,
    imageHeight: 900,
    viewportWidth: 360,
    viewportHeight: 240,
    zoom: 1.6,
    offsetX: 42,
    offsetY: -18,
  });

  assert.ok(crop.sourceX >= 0);
  assert.ok(crop.sourceY >= 0);
  assert.ok(crop.sourceX + crop.sourceWidth <= crop.imageWidth);
  assert.ok(crop.sourceY + crop.sourceHeight <= crop.imageHeight);
  assert.ok(Math.abs(crop.sourceWidth / crop.sourceHeight - 1.5) < 0.0001);
});

test('background crop controls normalize unsafe aspect ratios and zoom values', () => {
  assert.equal(normalizeConversationBackgroundCropAspectRatio(-1), 0.75);
  assert.equal(normalizeConversationBackgroundCropAspectRatio(99), 2.4);
  assert.equal(normalizeConversationBackgroundCropZoom(-1), 1);
  assert.equal(normalizeConversationBackgroundCropZoom(99), 3);
});
