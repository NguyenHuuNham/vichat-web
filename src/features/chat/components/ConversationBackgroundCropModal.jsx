import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CONVERSATION_BACKGROUND_CROP_DEFAULT_ASPECT_RATIO,
  CONVERSATION_BACKGROUND_CROP_MAX_ZOOM,
  CONVERSATION_BACKGROUND_CROP_MIN_ZOOM,
  CONVERSATION_BACKGROUND_CROP_OUTPUT_WIDTH,
  CONVERSATION_BACKGROUND_CROP_VIEWPORT_WIDTH,
  conversationBackgroundCropMetrics,
  conversationBackgroundCropSourceRect,
  normalizeConversationBackgroundCropAspectRatio,
  normalizeConversationBackgroundCropZoom,
} from '../services/conversationBackgroundCrop.js';

function copyText(copy, value) {
  return typeof copy?.t === 'function' ? copy.t(value) : value;
}

function createImageUrl(file) {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
  return URL.createObjectURL(file);
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Không thể tạo ảnh nền đã căn chỉnh.'));
    }, 'image/jpeg', quality);
  });
}

export default function ConversationBackgroundCropModal({
  file,
  copy,
  aspectRatio = CONVERSATION_BACKGROUND_CROP_DEFAULT_ASPECT_RATIO,
  maxBytes,
  isSaving = false,
  onCancel = () => {},
  onSave = async () => true,
}) {
  const safeAspectRatio = normalizeConversationBackgroundCropAspectRatio(aspectRatio);
  const stageRef = useRef(null);
  const [viewport, setViewport] = useState({
    width: CONVERSATION_BACKGROUND_CROP_VIEWPORT_WIDTH,
    height: CONVERSATION_BACKGROUND_CROP_VIEWPORT_WIDTH / safeAspectRatio,
  });
  const [image, setImage] = useState(null);
  const [zoom, setZoom] = useState(CONVERSATION_BACKGROUND_CROP_MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const dragRef = useRef(null);
  const busy = isSaving || isProcessing;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const updateViewport = () => {
      const width = Math.max(1, stage.clientWidth || CONVERSATION_BACKGROUND_CROP_VIEWPORT_WIDTH);
      setViewport({ width, height: width / safeAspectRatio });
    };
    updateViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewport);
      return () => window.removeEventListener('resize', updateViewport);
    }
    const observer = new ResizeObserver(updateViewport);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [safeAspectRatio]);

  useEffect(() => {
    if (!file) {
      setImage(null);
      return undefined;
    }
    const source = createImageUrl(file);
    if (!source) {
      setError('Không thể đọc ảnh hình nền.');
      return undefined;
    }
    let active = true;
    const nextImage = new Image();
    nextImage.onload = () => {
      if (!active) return;
      setImage({ source, element: nextImage, width: nextImage.naturalWidth, height: nextImage.naturalHeight });
      setZoom(CONVERSATION_BACKGROUND_CROP_MIN_ZOOM);
      setOffset({ x: 0, y: 0 });
      setError('');
    };
    nextImage.onerror = () => {
      if (!active) return;
      setImage(null);
      setError('Không thể đọc ảnh hình nền.');
    };
    nextImage.src = source;
    return () => {
      active = false;
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(source);
    };
  }, [file]);

  const metrics = useMemo(() => {
    if (!image) return null;
    return conversationBackgroundCropMetrics({
      imageWidth: image.width,
      imageHeight: image.height,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      aspectRatio: safeAspectRatio,
      zoom,
      offsetX: offset.x,
      offsetY: offset.y,
    });
  }, [image, offset.x, offset.y, safeAspectRatio, viewport.height, viewport.width, zoom]);

  const changeZoom = nextValue => {
    const nextZoom = normalizeConversationBackgroundCropZoom(nextValue);
    setZoom(nextZoom);
    setOffset(previous => {
      if (!image) return previous;
      const nextMetrics = conversationBackgroundCropMetrics({
        imageWidth: image.width,
        imageHeight: image.height,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        aspectRatio: safeAspectRatio,
        zoom: nextZoom,
        offsetX: previous.x,
        offsetY: previous.y,
      });
      return { x: nextMetrics.offsetX, y: nextMetrics.offsetY };
    });
  };

  const handlePointerDown = event => {
    if (!metrics || busy) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: metrics.offsetX,
      offsetY: metrics.offsetY,
    };
  };

  const handlePointerMove = event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !metrics) return;
    const next = conversationBackgroundCropMetrics({
      imageWidth: image.width,
      imageHeight: image.height,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      aspectRatio: safeAspectRatio,
      zoom,
      offsetX: drag.offsetX + event.clientX - drag.startX,
      offsetY: drag.offsetY + event.clientY - drag.startY,
    });
    setOffset({ x: next.offsetX, y: next.offsetY });
  };

  const clearPointer = event => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const handleWheel = event => {
    if (!metrics || busy) return;
    event.preventDefault();
    changeZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1));
  };

  const handleSave = async () => {
    if (!image || !metrics || busy) return;
    setError('');
    setIsProcessing(true);
    try {
      const crop = conversationBackgroundCropSourceRect({
        imageWidth: image.width,
        imageHeight: image.height,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        aspectRatio: safeAspectRatio,
        zoom,
        offsetX: metrics.offsetX,
        offsetY: metrics.offsetY,
      });
      const canvas = document.createElement('canvas');
      canvas.width = CONVERSATION_BACKGROUND_CROP_OUTPUT_WIDTH;
      canvas.height = Math.max(1, Math.round(canvas.width / safeAspectRatio));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Trình duyệt không hỗ trợ căn chỉnh ảnh nền.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      context.drawImage(
        image.element,
        crop.sourceX,
        crop.sourceY,
        crop.sourceWidth,
        crop.sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      let blob = await canvasBlob(canvas, 0.9);
      if (maxBytes && blob.size > maxBytes) blob = await canvasBlob(canvas, 0.78);
      if (maxBytes && blob.size > maxBytes) {
        throw new Error(`Ảnh sau khi căn chỉnh phải nhỏ hơn hoặc bằng ${Math.round(maxBytes / (1024 * 1024))} MB.`);
      }
      const croppedFile = new File([blob], `conversation-background-${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      const result = await onSave(croppedFile);
      if (result === false) setError('Không thể chuẩn bị ảnh nền đã căn chỉnh.');
    } catch (saveError) {
      setError(saveError?.message || 'Không thể tạo ảnh nền đã căn chỉnh.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="modal-backdrop conversation-background-crop-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        className="group-modal conversation-background-crop-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-background-crop-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="group-modal-header conversation-background-crop-header">
          <div>
            <span className="group-modal-kicker">{copyText(copy, 'ẢNH HÌNH NỀN')}</span>
            <h2 id="conversation-background-crop-title">{copyText(copy, 'Căn chỉnh hình nền')}</h2>
          </div>
          <button type="button" className="btn-close-detail" onClick={onCancel} aria-label={copyText(copy, 'Đóng')} disabled={busy}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <p className="conversation-background-crop-help">{copyText(copy, 'Kéo ảnh để chọn vùng muốn hiển thị. Dùng thanh trượt hoặc lăn chuột để phóng to, thu nhỏ.')}</p>
        <div
          className={`conversation-background-crop-stage ${image ? '' : 'loading'}`}
          ref={stageRef}
          style={{ aspectRatio: String(safeAspectRatio) }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={clearPointer}
          onPointerCancel={clearPointer}
          onWheel={handleWheel}
          role="application"
          aria-label={copyText(copy, 'Khu vực căn chỉnh hình nền')}
        >
          {image && metrics ? (
            <img
              className="conversation-background-crop-image"
              src={image.source}
              alt={copyText(copy, 'Xem trước hình nền')}
              draggable="false"
              style={{
                width: `${metrics.displayedWidth}px`,
                height: `${metrics.displayedHeight}px`,
                left: `calc(50% - ${metrics.displayedWidth / 2}px + ${metrics.offsetX}px)`,
                top: `calc(50% - ${metrics.displayedHeight / 2}px + ${metrics.offsetY}px)`,
              }}
            />
          ) : <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>}
          <span className="conversation-background-crop-frame" aria-hidden="true"></span>
        </div>

        <label className="conversation-background-crop-zoom">
          <span><i className="fa-solid fa-magnifying-glass-minus"></i><span>{copyText(copy, 'Thu nhỏ')}</span></span>
          <input
            type="range"
            min={CONVERSATION_BACKGROUND_CROP_MIN_ZOOM}
            max={CONVERSATION_BACKGROUND_CROP_MAX_ZOOM}
            step="0.01"
            value={zoom}
            onChange={event => changeZoom(event.target.value)}
            disabled={!image || busy}
            aria-label={copyText(copy, 'Mức thu phóng hình nền')}
          />
          <span><span>{copyText(copy, 'Phóng to')}</span><i className="fa-solid fa-magnifying-glass-plus"></i></span>
        </label>
        {error && <div className="conversation-background-crop-error" role="alert"><i className="fa-solid fa-triangle-exclamation"></i>{copyText(copy, error)}</div>}
        <div className="group-modal-footer actions-only conversation-background-crop-footer">
          <div className="group-modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>{copyText(copy, 'Hủy')}</button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={!image || busy}>
              {busy ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
              {busy ? copyText(copy, 'Đang chuẩn bị...') : copyText(copy, 'Dùng ảnh này')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
