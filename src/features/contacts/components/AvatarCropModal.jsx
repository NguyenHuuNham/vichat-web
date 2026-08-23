import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AVATAR_CROP_MAX_ZOOM,
  AVATAR_CROP_MIN_ZOOM,
  AVATAR_CROP_OUTPUT_SIZE,
  AVATAR_CROP_VIEWPORT_SIZE,
  avatarCropMetrics,
  avatarCropSourceRect,
  normalizeAvatarCropZoom,
} from '../services/avatarCrop.js';

function copyText(copy, value) {
  return typeof copy?.t === 'function' ? copy.t(value) : value;
}

function createImageUrl(file) {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
  return URL.createObjectURL(file);
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Không thể tạo ảnh đại diện đã cắt.'));
    }, type, quality);
  });
}

export default function AvatarCropModal({
  file,
  copy,
  isSaving = false,
  onCancel = () => {},
  onSave = async () => true,
}) {
  const [image, setImage] = useState(null);
  const [zoom, setZoom] = useState(AVATAR_CROP_MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const dragRef = useRef(null);

  useEffect(() => {
    if (!file) {
      setImage(null);
      return undefined;
    }
    const source = createImageUrl(file);
    if (!source) {
      setError('Không thể đọc ảnh đại diện.');
      return undefined;
    }
    let active = true;
    const nextImage = new Image();
    nextImage.onload = () => {
      if (!active) return;
      setImage({ source, element: nextImage, width: nextImage.naturalWidth, height: nextImage.naturalHeight });
      setZoom(AVATAR_CROP_MIN_ZOOM);
      setOffset({ x: 0, y: 0 });
      setError('');
    };
    nextImage.onerror = () => {
      if (!active) return;
      setImage(null);
      setError('Không thể đọc ảnh đại diện.');
    };
    nextImage.src = source;
    return () => {
      active = false;
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(source);
    };
  }, [file]);

  const metrics = useMemo(() => {
    if (!image) return null;
    return avatarCropMetrics({
      imageWidth: image.width,
      imageHeight: image.height,
      viewportSize: AVATAR_CROP_VIEWPORT_SIZE,
      zoom,
      offsetX: offset.x,
      offsetY: offset.y,
    });
  }, [image, offset.x, offset.y, zoom]);

  const changeZoom = nextValue => {
    const nextZoom = normalizeAvatarCropZoom(nextValue);
    setZoom(nextZoom);
    setOffset(previous => {
      if (!image) return previous;
      const nextMetrics = avatarCropMetrics({
        imageWidth: image.width,
        imageHeight: image.height,
        viewportSize: AVATAR_CROP_VIEWPORT_SIZE,
        zoom: nextZoom,
        offsetX: previous.x,
        offsetY: previous.y,
      });
      return { x: nextMetrics.offsetX, y: nextMetrics.offsetY };
    });
  };

  const handlePointerDown = event => {
    if (!metrics || isSaving) return;
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
    const next = avatarCropMetrics({
      imageWidth: image.width,
      imageHeight: image.height,
      viewportSize: AVATAR_CROP_VIEWPORT_SIZE,
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
    if (!metrics || isSaving) return;
    event.preventDefault();
    changeZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1));
  };

  const handleSave = async () => {
    if (!image || !metrics || isSaving) return;
    setError('');
    try {
      const crop = avatarCropSourceRect({
        imageWidth: image.width,
        imageHeight: image.height,
        viewportSize: AVATAR_CROP_VIEWPORT_SIZE,
        zoom,
        offsetX: metrics.offsetX,
        offsetY: metrics.offsetY,
      });
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_CROP_OUTPUT_SIZE;
      canvas.height = AVATAR_CROP_OUTPUT_SIZE;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Trình duyệt không hỗ trợ chỉnh ảnh đại diện.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        image.element,
        crop.sourceX,
        crop.sourceY,
        crop.sourceSize,
        crop.sourceSize,
        0,
        0,
        AVATAR_CROP_OUTPUT_SIZE,
        AVATAR_CROP_OUTPUT_SIZE,
      );
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const extension = outputType === 'image/png' ? 'png' : 'jpg';
      const blob = await canvasBlob(canvas, outputType, outputType === 'image/png' ? undefined : 0.92);
      const croppedFile = new File([blob], `avatar-crop.${extension}`, {
        type: outputType,
        lastModified: Date.now(),
      });
      const result = await onSave(croppedFile);
      if (result === false) setError('Không thể cập nhật ảnh đại diện.');
    } catch (saveError) {
      setError(saveError?.message || 'Không thể tạo ảnh đại diện đã cắt.');
    }
  };

  return (
    <div
      className="modal-backdrop avatar-crop-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !isSaving) onCancel();
      }}
    >
      <section
        className="group-modal avatar-crop-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-crop-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="group-modal-header avatar-crop-header">
          <div>
            <span className="group-modal-kicker">{copyText(copy, 'ẢNH ĐẠI DIỆN')}</span>
            <h2 id="avatar-crop-title">{copyText(copy, 'Căn chỉnh ảnh đại diện')}</h2>
          </div>
          <button type="button" className="btn-close-detail" onClick={onCancel} aria-label={copyText(copy, 'Đóng')} disabled={isSaving}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <p className="avatar-crop-help">{copyText(copy, 'Kéo ảnh để căn giữa, dùng thanh trượt hoặc lăn chuột để phóng to thu nhỏ.')}</p>
        <div
          className={`avatar-crop-stage ${image ? '' : 'loading'}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={clearPointer}
          onPointerCancel={clearPointer}
          onWheel={handleWheel}
          role="application"
          aria-label={copyText(copy, 'Khu vực căn chỉnh ảnh đại diện')}
        >
          {image && metrics ? (
            <img
              className="avatar-crop-image"
              src={image.source}
              alt={copyText(copy, 'Xem trước ảnh đại diện')}
              draggable="false"
              style={{
                width: `${metrics.displayedWidth}px`,
                height: `${metrics.displayedHeight}px`,
                left: `calc(50% - ${metrics.displayedWidth / 2}px + ${metrics.offsetX}px)`,
                top: `calc(50% - ${metrics.displayedHeight / 2}px + ${metrics.offsetY}px)`,
              }}
            />
          ) : <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>}
          <span className="avatar-crop-frame" aria-hidden="true"></span>
        </div>

        <label className="avatar-crop-zoom">
          <span><i className="fa-solid fa-magnifying-glass-minus"></i><span>{copyText(copy, 'Thu nhỏ')}</span></span>
          <input
            type="range"
            min={AVATAR_CROP_MIN_ZOOM}
            max={AVATAR_CROP_MAX_ZOOM}
            step="0.01"
            value={zoom}
            onChange={event => changeZoom(event.target.value)}
            disabled={!image || isSaving}
            aria-label={copyText(copy, 'Mức thu phóng ảnh đại diện')}
          />
          <span><span>{copyText(copy, 'Phóng to')}</span><i className="fa-solid fa-magnifying-glass-plus"></i></span>
        </label>
        {error && <div className="avatar-crop-error" role="alert"><i className="fa-solid fa-triangle-exclamation"></i>{copyText(copy, error)}</div>}
        <div className="group-modal-footer actions-only avatar-crop-footer">
          <div className="group-modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={isSaving}>{copyText(copy, 'Hủy')}</button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={!image || isSaving}>
              {isSaving ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
              {isSaving ? copyText(copy, 'Đang cập nhật...') : copyText(copy, 'Lưu ảnh đại diện')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
