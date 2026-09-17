import React, { useEffect, useId, useRef } from 'react';

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
  const confirmButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousActiveElement = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const focusFrame = window.requestAnimationFrame(() => confirmButtonRef.current?.focus());
    const handleKeyDown = event => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onCancel?.();
        return;
      }
      if (event.key === 'Tab') {
        const dialog = confirmButtonRef.current?.closest('[role="alertdialog"]');
        const focusable = dialog
          ? [...dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
          : [];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus?.();
    };
  }, [busy, onCancel, open]);

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
