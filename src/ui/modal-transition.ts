import { popEscapeHandler, popFocusTrap, pushEscapeHandler, pushFocusTrap } from './keyboard-nav.ts';

interface ModalOpenOptions {
  initialFocus?: HTMLElement | null | undefined;
  returnFocusTo?: HTMLElement | null | undefined;
}

interface ModalTransitionOptions {
  overlay: HTMLElement;
  panel?: HTMLElement | null;
  visibleClass?: string;
  transitionMs?: number;
  trapFocus?: boolean;
  closeOnEscape?: boolean;
  onBeforeClose?: () => void;
  onAfterClose?: () => void;
}

export interface ModalTransitionController {
  close(): void;
  isOpen(): boolean;
  open(options?: ModalOpenOptions): void;
}

const OPEN_CLASS = 'modal-transition-open';
const CLOSING_CLASS = 'modal-transition-closing';

function canRestoreFocus(element: HTMLElement | null): element is HTMLElement {
  return Boolean(
    element?.isConnected
    && element.getClientRects().length > 0
    && !element.matches('[hidden], :disabled'),
  );
}

export function createModalTransition({
  overlay,
  panel = overlay,
  visibleClass,
  transitionMs = 220,
  trapFocus = true,
  closeOnEscape = true,
  onBeforeClose,
  onAfterClose,
}: ModalTransitionOptions): ModalTransitionController {
  let closingTimer: number | null = null;
  let restoreFocusTarget: HTMLElement | null = null;
  let focusTrapActive = false;
  let escapeHandlerActive = false;

  overlay.dataset['modalTransition'] = '';

  const cancelPendingClose = () => {
    if (closingTimer === null) return;
    window.clearTimeout(closingTimer);
    closingTimer = null;
  };

  const finishClose = () => {
    cancelPendingClose();
    overlay.hidden = true;
    overlay.classList.remove(OPEN_CLASS, CLOSING_CLASS);
    if (visibleClass) overlay.classList.remove(visibleClass);
    if (focusTrapActive && panel) {
      popFocusTrap(panel);
      focusTrapActive = false;
    }
    if (escapeHandlerActive) {
      popEscapeHandler(overlay);
      escapeHandlerActive = false;
    }
    const focusTarget = restoreFocusTarget;
    restoreFocusTarget = null;
    if (canRestoreFocus(focusTarget)) focusTarget.focus({ preventScroll: true });
    onAfterClose?.();
  };

  const close = () => {
    if (overlay.hidden || overlay.classList.contains(CLOSING_CLASS)) return;
    onBeforeClose?.();
    overlay.classList.remove(OPEN_CLASS);
    overlay.classList.add(CLOSING_CLASS);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishClose();
      return;
    }
    closingTimer = window.setTimeout(finishClose, transitionMs);
  };

  const open = ({ initialFocus, returnFocusTo }: ModalOpenOptions = {}) => {
    if (!overlay.hidden && !overlay.classList.contains(CLOSING_CLASS)) return;
    cancelPendingClose();
    overlay.classList.remove(CLOSING_CLASS);
    restoreFocusTarget = returnFocusTo
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    overlay.hidden = false;
    if (visibleClass) overlay.classList.add(visibleClass);
    if (trapFocus && panel && !focusTrapActive) {
      pushFocusTrap(panel);
      focusTrapActive = true;
    }
    if (closeOnEscape && !escapeHandlerActive) {
      pushEscapeHandler(overlay, close);
      escapeHandlerActive = true;
    }
    requestAnimationFrame(() => {
      if (overlay.hidden || overlay.classList.contains(CLOSING_CLASS)) return;
      overlay.classList.add(OPEN_CLASS);
      initialFocus?.focus({ preventScroll: true });
    });
  };

  return {
    close,
    isOpen: () => !overlay.hidden && !overlay.classList.contains(CLOSING_CLASS),
    open,
  };
}
