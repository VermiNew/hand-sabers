const ICONS: Record<string, string> = {
  'circle-x': 'cancel',
  x:          'close',
  check:      'check',
  'rotate-ccw': 'restart_alt',
  settings:   'settings',
  house:      'home',
};

export function iconMarkup(name: string, className = 'icon-inline'): string {
  const symbol = ICONS[name] || name;
  return `<span class="material-symbols-rounded ${className}" aria-hidden="true">${symbol}</span>`;
}

// Material Symbols renderuje przeglądarka przez font, więc nie trzeba ręcznie odświeżać SVG.
export function refreshIcons(): void {}

export function setIconButton(button: HTMLElement | null, label: string, iconName: string): void {
  if (!button) return;
  button.innerHTML = `<span class="btn-label">${label}</span>${iconMarkup(iconName, 'btn-icon')}`;
}
