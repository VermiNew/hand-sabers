/**
 * Keyboard navigation for all overlay panels and the main menu.
 *
 * Provides:
 *  - Focus lock: Tab/Shift+Tab cycle only within the active panel
 *  - Enter/Space activate focused button
 *  - Escape closes the topmost active panel
 *  - Arrow keys navigate between focusable items in a menu list
 *  - Auto-focus first item when a panel opens
 */

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Stack of active trap roots (push on open, pop on close)
const trapStack: HTMLElement[] = [];

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    el => !el.closest('[hidden]') && getComputedStyle(el).display !== 'none',
  );
}

function trapFocus(e: KeyboardEvent): void {
  const root = trapStack[trapStack.length - 1];
  if (!root) return;

  const items  = getFocusable(root);
  if (!items.length) return;

  const first  = items[0]!;
  const last   = items[items.length - 1]!;
  const active = document.activeElement as HTMLElement | null;

  if (e.key === 'Tab') {
    if (e.shiftKey) {
      if (active === first || !root.contains(active)) { e.preventDefault(); last.focus(); }
    } else {
      if (active === last  || !root.contains(active)) { e.preventDefault(); first.focus(); }
    }
  }
}

export function pushFocusTrap(root: HTMLElement): void {
  trapStack.push(root);
  const items = getFocusable(root);
  // Focus first non-close button if possible, otherwise first item
  const preferred = items.find(el => !el.closest('.settings-close-btn, .sp-close')) ?? items[0];
  if (preferred) preferred.focus();
}

export function popFocusTrap(root?: HTMLElement): void {
  if (!root) { trapStack.pop(); return; }
  const idx = trapStack.lastIndexOf(root);
  if (idx !== -1) trapStack.splice(idx, 1);
}

// ── Arrow key nav in .main-nav lists ──────────────────────────────────────────

function handleArrowNav(e: KeyboardEvent): void {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return;

  const nav = active.closest<HTMLElement>('.main-nav, .pause-menu-box, .ov-actions, .calib-actions');
  if (!nav) return;

  const items = Array.from(nav.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'))
    .filter(el => getComputedStyle(el).display !== 'none');
  const idx = items.indexOf(active);
  if (idx === -1) return;

  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
    e.preventDefault();
    items[(idx + 1) % items.length]!.focus();
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
    e.preventDefault();
    items[(idx - 1 + items.length) % items.length]!.focus();
  }
}

// ── Escape stack ─────────────────────────────────────────────────────────────
// Each entry: { el, onEscape }. Topmost is closed first.
interface EscapeEntry { el: HTMLElement; onEscape: () => void }
const escapeStack: EscapeEntry[] = [];

export function pushEscapeHandler(el: HTMLElement, onEscape: () => void): void {
  // Avoid duplicates
  const idx = escapeStack.findIndex(e => e.el === el);
  if (idx !== -1) escapeStack.splice(idx, 1);
  escapeStack.push({ el, onEscape });
}

export function popEscapeHandler(el: HTMLElement): void {
  const idx = escapeStack.findIndex(e => e.el === el);
  if (idx !== -1) escapeStack.splice(idx, 1);
}

function handleEscape(e: KeyboardEvent): void {
  // Only fire if no input focused
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
  if (e.key !== 'Escape') return;
  const top = escapeStack[escapeStack.length - 1];
  if (top) {
    e.preventDefault();
    top.onEscape();
  }
}

// ── Main menu keyboard nav ────────────────────────────────────────────────────

export function initMainMenuKeyNav(): void {
  const nav = document.querySelector<HTMLElement>('.main-nav');
  if (!nav) return;

  // Make sure all items have tabindex so they receive focus
  nav.querySelectorAll<HTMLElement>('.main-nav-item:not([disabled])').forEach((item, i) => {
    if (!item.hasAttribute('tabindex')) item.tabIndex = 0;
    // Highlight focused item with is-focused class
    item.addEventListener('focus', () => {
      nav.querySelectorAll('.main-nav-item').forEach(it => it.classList.remove('is-focused'));
      item.classList.add('is-focused');
    });
    item.addEventListener('blur', () => item.classList.remove('is-focused'));
    void i;
  });

  // Auto-focus first nav item when main menu is visible
  const mainMenu = document.getElementById('mainMenu');
  if (mainMenu) {
    const observer = new MutationObserver(() => {
      if (mainMenu.style.display !== 'none' && !mainMenu.hidden) {
        const first = nav.querySelector<HTMLElement>('.main-nav-item:not([disabled])');
        setTimeout(() => first?.focus(), 80); // after CSS transition
      }
    });
    observer.observe(mainMenu, { attributes: true, attributeFilter: ['style', 'hidden'] });
  }
}

// ── Pause menu ───────────────────────────────────────────────────────────────

export function initPauseMenuKeyNav(onEscape: () => void): void {
  const pauseMenu = document.getElementById('pauseMenu');
  if (!pauseMenu) return;

  const observer = new MutationObserver(() => {
    if (pauseMenu.classList.contains('show') || pauseMenu.style.display === 'flex') {
      pushFocusTrap(pauseMenu);
      pushEscapeHandler(pauseMenu, onEscape);
    } else {
      popFocusTrap(pauseMenu);
      popEscapeHandler(pauseMenu);
    }
  });
  observer.observe(pauseMenu, { attributes: true, attributeFilter: ['class', 'style'] });
}

// ── Settings panel ────────────────────────────────────────────────────────────

export function initSettingsPanelKeyNav(onEscape: () => void): void {
  const backdrop = document.getElementById('mainSettingsBackdrop');
  const panel    = document.getElementById('mainSettingsPanel');
  if (!backdrop || !panel) return;

  const observer = new MutationObserver(() => {
    if (!backdrop.hidden) {
      pushFocusTrap(panel);
      pushEscapeHandler(backdrop, onEscape);
    } else {
      popFocusTrap(panel);
      popEscapeHandler(backdrop);
    }
  });
  observer.observe(backdrop, { attributes: true, attributeFilter: ['hidden'] });
}

// ── Overlay (gameover / loading) ─────────────────────────────────────────────

export function initOverlayKeyNav(): void {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;

  const observer = new MutationObserver(() => {
    const isVisible = overlay.classList.contains('show');
    if (isVisible) {
      pushFocusTrap(overlay);
    } else {
      popFocusTrap(overlay);
    }
  });
  observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
}

// ── Calib panel ───────────────────────────────────────────────────────────────

export function initCalibPanelKeyNav(): void {
  const calibPanel = document.getElementById('calibPanel');
  if (!calibPanel) return;

  const observer = new MutationObserver(() => {
    const isVisible = calibPanel.style.display !== 'none' && calibPanel.style.display !== '';
    if (isVisible) {
      pushFocusTrap(calibPanel);
    } else {
      popFocusTrap(calibPanel);
    }
  });
  observer.observe(calibPanel, { attributes: true, attributeFilter: ['style'] });
}

// ── maps.html keyboard nav ────────────────────────────────────────────────────

export function initMapsPageKeyNav(): void {
  // / or Ctrl+F — focus search
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    if (e.key === '/' || (e.ctrlKey && e.key === 'f')) {
      e.preventDefault();
      document.getElementById('searchInput')?.focus();
      return;
    }

    // Arrow up/down — navigate map list items
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const list  = document.getElementById('mapList');
      if (!list) return;
      const items = Array.from(list.querySelectorAll<HTMLElement>('.map-item'));
      if (!items.length) return;
      const active = document.activeElement as HTMLElement;
      const idx    = items.indexOf(active);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[idx === -1 ? 0 : Math.min(idx + 1, items.length - 1)]?.focus();
      } else {
        e.preventDefault();
        items[idx <= 0 ? 0 : idx - 1]?.focus();
      }
    }

    // Escape — clear search
    if (e.key === 'Escape') {
      const search = document.getElementById('searchInput') as HTMLInputElement | null;
      if (search && document.activeElement === search) {
        search.value = '';
        search.dispatchEvent(new Event('input'));
        search.blur();
      }
    }
  });

  // Make map items keyboard-activatable
  document.getElementById('mapList')?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (e.target as HTMLElement).click();
    }
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

export function initKeyboardNav(options: {
  onEscapePause?:    () => void;
  onEscapeSettings?: () => void;
  isMapsPage?:       boolean;
} = {}): void {
  window.addEventListener('keydown', trapFocus);
  window.addEventListener('keydown', handleArrowNav);
  window.addEventListener('keydown', handleEscape);

  if (options.isMapsPage) {
    initMapsPageKeyNav();
    return;
  }

  initMainMenuKeyNav();
  initOverlayKeyNav();
  initCalibPanelKeyNav();

  if (options.onEscapePause)    initPauseMenuKeyNav(options.onEscapePause);
  if (options.onEscapeSettings) initSettingsPanelKeyNav(options.onEscapeSettings);
}
