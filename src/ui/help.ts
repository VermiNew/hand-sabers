import { popEscapeHandler, popFocusTrap, pushEscapeHandler, pushFocusTrap } from './keyboard-nav.ts';

export function initHelpOverlay(): void {
  const overlay = document.getElementById('helpOverlay');
  const panel = overlay?.querySelector<HTMLElement>('.help-panel');
  const openButton = document.getElementById('mainHelp');
  const closeButton = document.getElementById('helpClose');
  if (!overlay || !panel || !openButton || !closeButton) return;
  let closeTimer: number | null = null;

  const close = () => {
    if (overlay.hidden) return;
    overlay.classList.remove('show');
    popFocusTrap(panel);
    popEscapeHandler(overlay);
    closeTimer = window.setTimeout(() => {
      overlay.hidden = true;
      closeTimer = null;
      openButton.focus({ preventScroll: true });
    }, 180);
  };

  const open = () => {
    if (closeTimer !== null) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }
    overlay.hidden = false;
    pushFocusTrap(panel);
    pushEscapeHandler(overlay, close);
    requestAnimationFrame(() => {
      overlay.classList.add('show');
      closeButton.focus({ preventScroll: true });
    });
  };

  openButton.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  overlay.addEventListener('pointerdown', event => {
    if (event.target === overlay) close();
  });
}
