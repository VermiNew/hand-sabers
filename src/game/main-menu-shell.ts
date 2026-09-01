interface MainMenuShellOptions {
  onAchievementsOpen(): void;
}

export interface MainMenuShellController {
  bindAction(id: string, action: () => void): void;
  closeSettings(): void;
  openSettings(tabName?: string): void;
}

function withPreservedDevQuery(url: string): string {
  const current = new URLSearchParams(location.search);
  const target = new URL(url, location.href);
  for (const key of ['dev', 'testing']) {
    if (current.has(key)) target.searchParams.set(key, current.get(key) ?? '');
  }
  return `${target.pathname.split('/').pop()}${target.search}${target.hash}`;
}

function preserveDevQueryOnMenuLinks(): void {
  const current = new URLSearchParams(location.search);
  if (!current.has('dev') && !current.has('testing')) return;
  for (const link of document.querySelectorAll('.main-menu-footer a[href]')) {
    link.setAttribute('href', withPreservedDevQuery(link.getAttribute('href') ?? ''));
  }
}

export function triggerMenuEnter(): void {
  const mainMenu = document.getElementById('mainMenu');
  if (!mainMenu) return;
  mainMenu.classList.remove('is-leaving', 'is-entering');
  void mainMenu.offsetWidth;
  mainMenu.classList.add('is-entering');
  setTimeout(() => mainMenu.classList.remove('is-entering'), 800);
}

export function initMainMenuShell({ onAchievementsOpen }: MainMenuShellOptions): MainMenuShellController {
  const navItems = [...document.querySelectorAll<HTMLElement>('.main-nav-item:not(.is-disabled)')];
  const allNavItems = [...document.querySelectorAll<HTMLElement>('.main-nav-item')];
  const settingsBackdrop = document.getElementById('mainSettingsBackdrop');
  const settingsPanel = document.getElementById('mainSettingsPanel');
  const settingsButton = document.getElementById('mainSettings');
  const settingsClose = document.getElementById('mainSettingsClose');

  function selectItem(item: Element): void {
    navItems.forEach(element => element.classList.toggle('is-selected', element === item));
  }

  function isSettingsVisible(): boolean {
    return Boolean(settingsBackdrop && !settingsBackdrop.hidden);
  }

  function switchSettingsTab(tabName: string): void {
    document.querySelectorAll<HTMLElement>('.sp-nav-item').forEach(button => {
      button.classList.toggle('is-active', button.dataset['tab'] === tabName);
    });
    document.querySelectorAll<HTMLElement>('.sp-tab').forEach(tab => {
      tab.classList.toggle('is-active', tab.dataset['tab'] === tabName);
    });
    if (tabName === 'achievements') onAchievementsOpen();
  }

  function setSettingsVisible(visible: boolean): void {
    document.body.classList.toggle('settings-modal-open', visible);
    if (settingsBackdrop) {
      settingsBackdrop.hidden = !visible;
      settingsBackdrop.classList.toggle('show', visible);
    }
    settingsPanel?.classList.toggle('show', visible);
    settingsButton?.setAttribute('aria-expanded', String(visible));
    if (visible) {
      requestAnimationFrame(() => {
        (settingsPanel?.querySelector('input,button,summary') as HTMLElement | null)?.focus();
      });
    } else {
      (settingsButton as HTMLElement | null)?.focus({ preventScroll: true });
    }
  }

  function openSettings(tabName = 'audio'): void {
    switchSettingsTab(tabName);
    setSettingsVisible(true);
  }

  function closeSettings(): void {
    setSettingsVisible(false);
  }

  document.body.classList.add('menu-open');
  preserveDevQueryOnMenuLinks();
  triggerMenuEnter();

  document.querySelectorAll<HTMLElement>('.sp-nav-item[data-tab]').forEach(button => {
    button.addEventListener('click', () => switchSettingsTab(button.dataset['tab'] ?? 'audio'));
  });

  allNavItems.forEach((item, index) => item.style.setProperty('--i', String(index)));
  for (const item of navItems) {
    item.addEventListener('mouseenter', () => selectItem(item));
    item.addEventListener('focus', () => selectItem(item));
    item.addEventListener('pointerdown', () => item.classList.add('is-pressed'));
    item.addEventListener('pointerup', () => item.classList.remove('is-pressed'));
    item.addEventListener('pointerleave', () => item.classList.remove('is-pressed'));
  }

  for (const item of allNavItems) {
    item.addEventListener('click', () => {
      if (item.classList.contains('is-disabled')) {
        item.classList.remove('is-locked-attempt');
        void item.offsetWidth;
        item.classList.add('is-locked-attempt');
        setTimeout(() => item.classList.remove('is-locked-attempt'), 420);
        return;
      }
      item.classList.remove('is-clicked');
      void item.offsetWidth;
      item.classList.add('is-clicked');
      setTimeout(() => item.classList.remove('is-clicked'), 380);
    });
  }

  settingsButton?.addEventListener('click', () => {
    selectItem(settingsButton);
    setSettingsVisible(!isSettingsVisible());
  });
  settingsClose?.addEventListener('click', closeSettings);
  settingsBackdrop?.addEventListener('pointerdown', event => {
    if (event.target === settingsBackdrop) closeSettings();
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isSettingsVisible()) closeSettings();
  });
  window.addEventListener('hand-sabers:open-settings', event => {
    const detail = (event as CustomEvent<{ tab?: string }>).detail;
    openSettings(detail?.tab ?? 'audio');
  });

  return {
    bindAction(id, action): void {
      const element = document.getElementById(id);
      element?.addEventListener('click', () => {
        if (element.classList.contains('is-disabled')) return;
        setTimeout(action, 350);
      });
    },
    closeSettings,
    openSettings,
  };
}
