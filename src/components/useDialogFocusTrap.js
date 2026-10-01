import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const activeDialogStack = [];

function visibleFocusableElements(dialog) {
  return Array.from(dialog?.querySelectorAll(FOCUSABLE_SELECTOR) || [])
    .filter(element => element instanceof HTMLElement && element.offsetParent !== null);
}

function dialogOverlay(dialog) {
  return dialog?.closest('[data-dialog-overlay]')
    || dialog?.closest('[role="presentation"]')
    || dialog;
}

export default function useDialogFocusTrap(dialogRef, active, onClose, options = {}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const overlay = dialogOverlay(dialog);
    const inertContainer = overlay?.parentElement;
    const inertTargets = inertContainer
      ? Array.from(inertContainer.children).filter(child => child !== overlay)
      : [];
    const previousInert = new Map(inertTargets.map(element => [
      element,
      element.hasAttribute('inert'),
    ]));
    inertTargets.forEach(element => element.setAttribute('inert', ''));

    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = dialog.style.overscrollBehavior;
    if (options.lockScroll !== false) document.body.style.overflow = 'hidden';
    const focusable = () => visibleFocusableElements(dialog);
    const focusInitial = () => {
      const first = focusable()[0];
      if (first) first.focus();
      else dialog.focus();
    };
    const handleKeyDown = event => {
      if (activeDialogStack[activeDialogStack.length - 1] !== dialog) return;
      if (event.key === 'Escape' && options.closeOnEscape !== false) {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.style.overscrollBehavior = 'contain';
    if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
    activeDialogStack.push(dialog);
    document.addEventListener('keydown', handleKeyDown, true);
    const focusFrame = window.requestAnimationFrame(focusInitial);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      const stackIndex = activeDialogStack.lastIndexOf(dialog);
      if (stackIndex >= 0) activeDialogStack.splice(stackIndex, 1);
      window.cancelAnimationFrame(focusFrame);
      if (options.lockScroll !== false) document.body.style.overflow = previousOverflow;
      dialog.style.overscrollBehavior = previousOverscrollBehavior;
      previousInert.forEach((wasInert, element) => {
        if (wasInert) element.setAttribute('inert', '');
        else element.removeAttribute('inert');
      });
      if (previousFocus?.isConnected) window.requestAnimationFrame(() => previousFocus.focus());
    };
  }, [active, dialogRef, options.closeOnEscape, options.lockScroll]);
}
