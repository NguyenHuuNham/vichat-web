import React, { useId, useRef } from 'react';
import useDialogFocusTrap from './useDialogFocusTrap';

export default function ConfirmDialog({
  open = false,
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  tone = 'danger',
  busy = false,
  copy = value => value,
  onCancel,
  onConfirm,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const confirmButtonRef = useRef(null);
  useDialogFocusTrap(dialogRef, open, onCancel, { closeOnEscape: !busy });

  if (!open) return null;

  return (
    <div
      className="in-app-confirm-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onCancel?.();
      }}
    >
      <section
        ref={dialogRef}
        className={`in-app-confirm-dialog ${tone === 'danger' ? 'danger' : 'neutral'}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="in-app-confirm-icon" aria-hidden="true">
          <i className={`fa-solid ${tone === 'danger' ? 'fa-triangle-exclamation' : 'fa-circle-question'}`}></i>
        </div>
        <div className="in-app-confirm-copy">
          <span className="in-app-confirm-kicker">{copy('XÁC NHẬN THAO TÁC')}</span>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{message}</p>
        </div>
        <div className="in-app-confirm-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmButtonRef}
            className={`in-app-confirm-primary ${tone === 'danger' ? 'danger' : ''}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>}
            {busy ? copy('Đang xử lý...') : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
