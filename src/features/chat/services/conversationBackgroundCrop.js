export const CONVERSATION_BACKGROUND_CROP_VIEWPORT_WIDTH = 360;
export const CONVERSATION_BACKGROUND_CROP_DEFAULT_ASPECT_RATIO = 1.35;
export const CONVERSATION_BACKGROUND_CROP_MIN_ZOOM = 1;
export const CONVERSATION_BACKGROUND_CROP_MAX_ZOOM = 3;
export const CONVERSATION_BACKGROUND_CROP_OUTPUT_WIDTH = 1280;

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function normalizeConversationBackgroundCropAspectRatio(value) {
  return clamp(
    finiteNumber(value, CONVERSATION_BACKGROUND_CROP_DEFAULT_ASPECT_RATIO),
    0.75,
    2.4,
  );
}

export function normalizeConversationBackgroundCropZoom(value) {
  return clamp(
    finiteNumber(value, CONVERSATION_BACKGROUND_CROP_MIN_ZOOM),
    CONVERSATION_BACKGROUND_CROP_MIN_ZOOM,
    CONVERSATION_BACKGROUND_CROP_MAX_ZOOM,
  );
}

export function conversationBackgroundCropMetrics({
  imageWidth,
  imageHeight,
  viewportWidth = CONVERSATION_BACKGROUND_CROP_VIEWPORT_WIDTH,
  viewportHeight,
  aspectRatio = CONVERSATION_BACKGROUND_CROP_DEFAULT_ASPECT_RATIO,
  zoom = CONVERSATION_BACKGROUND_CROP_MIN_ZOOM,
  offsetX = 0,
  offsetY = 0,
} = {}) {
  const safeWidth = Math.max(1, finiteNumber(imageWidth, 1));
  const safeHeight = Math.max(1, finiteNumber(imageHeight, 1));
  const safeViewportWidth = Math.max(1, finiteNumber(viewportWidth, CONVERSATION_BACKGROUND_CROP_VIEWPORT_WIDTH));
  const safeAspectRatio = normalizeConversationBackgroundCropAspectRatio(aspectRatio);
  const safeViewportHeight = Math.max(1, finiteNumber(viewportHeight, safeViewportWidth / safeAspectRatio));
  const safeZoom = normalizeConversationBackgroundCropZoom(zoom);
  const baseScale = Math.max(safeViewportWidth / safeWidth, safeViewportHeight / safeHeight);
  const scale = baseScale * safeZoom;
  const displayedWidth = safeWidth * scale;
  const displayedHeight = safeHeight * scale;
  const maxOffsetX = Math.max(0, (displayedWidth - safeViewportWidth) / 2);
  const maxOffsetY = Math.max(0, (displayedHeight - safeViewportHeight) / 2);

  return {
    imageWidth: safeWidth,
    imageHeight: safeHeight,
    viewportWidth: safeViewportWidth,
    viewportHeight: safeViewportHeight,
    aspectRatio: safeAspectRatio,
    zoom: safeZoom,
    scale,
    displayedWidth,
    displayedHeight,
    maxOffsetX,
    maxOffsetY,
    offsetX: clamp(finiteNumber(offsetX), -maxOffsetX, maxOffsetX),
    offsetY: clamp(finiteNumber(offsetY), -maxOffsetY, maxOffsetY),
  };
}

export function conversationBackgroundCropSourceRect(options = {}) {
  const metrics = conversationBackgroundCropMetrics(options);
  const sourceWidth = Math.min(metrics.imageWidth, metrics.viewportWidth / metrics.scale);
  const sourceHeight = Math.min(metrics.imageHeight, metrics.viewportHeight / metrics.scale);
  const maximumX = Math.max(0, metrics.imageWidth - sourceWidth);
  const maximumY = Math.max(0, metrics.imageHeight - sourceHeight);
  const sourceX = clamp(
    (metrics.imageWidth - sourceWidth) / 2 - (metrics.offsetX / metrics.scale),
    0,
    maximumX,
  );
  const sourceY = clamp(
    (metrics.imageHeight - sourceHeight) / 2 - (metrics.offsetY / metrics.scale),
    0,
    maximumY,
  );

  return {
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    ...metrics,
  };
}
