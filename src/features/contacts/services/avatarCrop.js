export const AVATAR_CROP_VIEWPORT_SIZE = 280;
export const AVATAR_CROP_OUTPUT_SIZE = 512;
export const AVATAR_CROP_MIN_ZOOM = 1;
export const AVATAR_CROP_MAX_ZOOM = 3;

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function normalizeAvatarCropZoom(value) {
  return clamp(finiteNumber(value, AVATAR_CROP_MIN_ZOOM), AVATAR_CROP_MIN_ZOOM, AVATAR_CROP_MAX_ZOOM);
}

export function avatarCropMetrics({
  imageWidth,
  imageHeight,
  viewportSize = AVATAR_CROP_VIEWPORT_SIZE,
  zoom = AVATAR_CROP_MIN_ZOOM,
  offsetX = 0,
  offsetY = 0,
} = {}) {
  const safeWidth = Math.max(1, finiteNumber(imageWidth, 1));
  const safeHeight = Math.max(1, finiteNumber(imageHeight, 1));
  const safeViewport = Math.max(1, finiteNumber(viewportSize, AVATAR_CROP_VIEWPORT_SIZE));
  const safeZoom = normalizeAvatarCropZoom(zoom);
  const baseScale = Math.max(safeViewport / safeWidth, safeViewport / safeHeight);
  const scale = baseScale * safeZoom;
  const displayedWidth = safeWidth * scale;
  const displayedHeight = safeHeight * scale;
  const maxOffsetX = Math.max(0, (displayedWidth - safeViewport) / 2);
  const maxOffsetY = Math.max(0, (displayedHeight - safeViewport) / 2);

  return {
    imageWidth: safeWidth,
    imageHeight: safeHeight,
    viewportSize: safeViewport,
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

export function avatarCropSourceRect(options = {}) {
  const metrics = avatarCropMetrics(options);
  const sourceSize = Math.min(
    metrics.imageWidth,
    metrics.imageHeight,
    metrics.viewportSize / metrics.scale,
  );
  const maximumX = Math.max(0, metrics.imageWidth - sourceSize);
  const maximumY = Math.max(0, metrics.imageHeight - sourceSize);
  const sourceX = clamp(
    (metrics.imageWidth - sourceSize) / 2 - (metrics.offsetX / metrics.scale),
    0,
    maximumX,
  );
  const sourceY = clamp(
    (metrics.imageHeight - sourceSize) / 2 - (metrics.offsetY / metrics.scale),
    0,
    maximumY,
  );

  return {
    sourceX,
    sourceY,
    sourceSize,
    ...metrics,
  };
}
