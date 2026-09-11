import { createModalTransition } from './modal-transition.ts';

export function initAuthorOverlay(): void {
  const trigger = document.getElementById('mainAuthor');
  const overlay = document.getElementById('authorOverlay');
  const card = overlay?.querySelector<HTMLElement>('.author-card');
  const closeButton = document.getElementById('authorClose');
  if (!trigger || !overlay || !card || !closeButton) return;

  const modal = createModalTransition({
    overlay,
    panel: card,
    visibleClass: 'show',
    transitionMs: 220,
  });

  trigger.addEventListener('click', () => {
    modal.open({ initialFocus: closeButton, returnFocusTo: trigger });
  });
  closeButton.addEventListener('click', () => modal.close());
  overlay.addEventListener('pointerdown', event => {
    if (event.target === overlay) modal.close();
  });
}
